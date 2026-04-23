import json
import shutil
from pathlib import Path
from urllib.parse import quote

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import auth, ml, models, schemas
from .database import Base, engine
from .deps import get_db, require_roles

app = FastAPI(title="Hospital Osteoporosis Platform", version="1.0.0")

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind=engine)
UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
BMD_ROOT = UPLOAD_DIR / "BMD"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}

# Serve uploaded X-ray images (original + ROI) as static media.
app.mount("/media", StaticFiles(directory=str(UPLOAD_DIR)), name="media")

# Clinical priors used when only the diagnostic class is known
# (e.g. imported from the BMD/<Class>/<HN>/ folder structure).
BMD_CLASS_META = {
    "Normal": {
        "risk_label": "Low Risk",
        "probability": 0.15,
        "risk_score": 15.0,
        "spine_bmd": 1.1,
    },
    "Osteopenia": {
        "risk_label": "Moderate Risk",
        "probability": 0.55,
        "risk_score": 55.0,
        "spine_bmd": 0.85,
    },
    "Osteoporosis": {
        "risk_label": "High Risk",
        "probability": 0.85,
        "risk_score": 85.0,
        "spine_bmd": 0.65,
    },
}


def _media_url(file_path: str | None) -> str | None:
    """Return a `/media/...` URL that preserves any nested subpath under UPLOAD_DIR."""
    if not file_path:
        return None
    p = Path(file_path)
    try:
        rel = p.resolve().relative_to(UPLOAD_DIR.resolve())
        return "/media/" + quote(rel.as_posix())
    except Exception:
        return f"/media/{quote(p.name)}"


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/auth/register", response_model=schemas.UserOut)
def register_user(
    user_input: schemas.UserCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin")),
):
    existing = db.query(models.User).filter(models.User.username == user_input.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = models.User(
        username=user_input.username,
        full_name=user_input.full_name,
        hashed_password=auth.get_password_hash(user_input.password),
        role=user_input.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=schemas.Token)
def login(payload: schemas.LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not auth.verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = auth.create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer"}


@app.post("/seed-admin")
def seed_admin(db: Session = Depends(get_db)):
    admin = db.query(models.User).filter(models.User.username == "admin").first()
    if admin:
        return {"message": "Admin exists", "username": "admin"}
    admin = models.User(
        username="admin",
        full_name="System Admin",
        hashed_password=auth.get_password_hash("admin1234"),
        role="admin",
    )
    db.add(admin)
    db.commit()
    return {"message": "Admin created", "username": "admin", "password": "admin1234"}


@app.post("/patients", response_model=schemas.PatientOut)
def create_patient(
    payload: schemas.PatientCreate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor", "nurse")),
):
    existing = db.query(models.Patient).filter(models.Patient.hn == payload.hn).first()
    if existing:
        raise HTTPException(status_code=400, detail="HN already exists")

    patient = models.Patient(**payload.model_dump())
    db.add(patient)
    db.commit()
    db.refresh(patient)
    return patient


@app.get("/patients", response_model=list[schemas.PatientOut])
def list_patients(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor", "nurse")),
):
    return db.query(models.Patient).order_by(models.Patient.created_at.desc()).all()


@app.put("/patients/{patient_id}", response_model=schemas.PatientOut)
def update_patient(
    patient_id: int,
    payload: schemas.PatientUpdate,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor")),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    for key, value in payload.model_dump(exclude_none=True).items():
        setattr(patient, key, value)
    db.commit()
    db.refresh(patient)
    return patient


@app.delete("/patients/{patient_id}")
def delete_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin")),
):
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(patient)
    db.commit()
    return {"message": "Patient deleted"}


@app.post("/xrays/upload")
def upload_xray(
    patient_hn: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor", "nurse")),
):
    patient = db.query(models.Patient).filter(models.Patient.hn == patient_hn).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    file_path = UPLOAD_DIR / f"{patient_hn}_{file.filename}"
    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    roi_path = ml.roi_extract(str(file_path))
    xray = models.XrayImage(patient_id=patient.id, file_path=str(file_path), roi_path=roi_path)
    db.add(xray)
    db.commit()
    db.refresh(xray)
    return {
        "message": "Uploaded",
        "xray_id": xray.id,
        "image_url": _media_url(xray.file_path),
        "roi_url": _media_url(xray.roi_path),
    }


@app.post("/xrays/import-bmd")
def import_bmd_library(
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor")),
):
    """Scan the `uploads/BMD/{Normal|Osteopenia|Osteoporosis}/<HN>/` library and
    ingest every study into the platform. Folder name = patient HN (9-digit).

    The operation is idempotent — existing patients/images/predictions are kept
    and only missing records are inserted.
    """
    if not BMD_ROOT.exists() or not BMD_ROOT.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"BMD library not found at {BMD_ROOT.resolve()}",
        )

    patients_created = 0
    patients_updated = 0
    images_imported = 0
    predictions_created = 0
    skipped_images = 0
    class_counts: dict[str, int] = {cls: 0 for cls in BMD_CLASS_META}
    hn_class_map: dict[str, str] = {}

    for cls, meta in BMD_CLASS_META.items():
        cls_dir = BMD_ROOT / cls
        if not cls_dir.is_dir():
            continue

        for hn_dir in sorted(cls_dir.iterdir()):
            if not hn_dir.is_dir():
                continue

            hn = hn_dir.name.strip()
            if not hn.isdigit() or not (6 <= len(hn) <= 12):
                # Skip noise folders; we accept 6–12 digit HN codes
                continue

            # Upsert patient ----------------------------------------------------
            patient = (
                db.query(models.Patient)
                .filter(func.lower(models.Patient.hn) == hn.lower())
                .first()
            )
            if not patient:
                patient = models.Patient(
                    hn=hn,
                    first_name="Imported",
                    last_name=f"#{hn[-4:]}",
                    age=65,
                    gender="U",
                    bmi=22.5,
                    smoking=0,
                    steroid_use=0,
                    spine_bmd=meta["spine_bmd"],
                )
                db.add(patient)
                db.flush()
                patients_created += 1
            elif patient.spine_bmd is None:
                patient.spine_bmd = meta["spine_bmd"]
                patients_updated += 1

            hn_class_map[hn] = cls
            class_counts[cls] += 1

            # Register images ---------------------------------------------------
            for fp in sorted(hn_dir.iterdir()):
                if not fp.is_file() or fp.suffix.lower() not in IMAGE_EXTS:
                    continue
                abs_path = str(fp.resolve())
                existing_img = (
                    db.query(models.XrayImage)
                    .filter(models.XrayImage.patient_id == patient.id)
                    .filter(models.XrayImage.file_path == abs_path)
                    .first()
                )
                if existing_img:
                    skipped_images += 1
                    continue
                # Note: ROI extraction is deferred (lazy) to keep bulk-import fast.
                # The viewer overlays ROI via CSS; `/predict` will generate ROI
                # on demand if still missing.
                xray = models.XrayImage(
                    patient_id=patient.id,
                    file_path=abs_path,
                    roi_path=None,
                )
                db.add(xray)
                images_imported += 1

            # Baseline prediction per class (one per patient per class) --------
            marker_version = f"bmd-import-{cls.lower()}"
            existing_pred = (
                db.query(models.Prediction)
                .filter(models.Prediction.patient_id == patient.id)
                .filter(models.Prediction.model_version == marker_version)
                .first()
            )
            if not existing_pred:
                pred = models.Prediction(
                    patient_id=patient.id,
                    risk_score=meta["risk_score"],
                    risk_label=meta["risk_label"],
                    probability=meta["probability"],
                    model_version=marker_version,
                    visualization_json=json.dumps(
                        {
                            "source": "BMD library",
                            "class": cls,
                            "note": "Baseline prior — run AI Prediction for a hybrid score.",
                        }
                    ),
                )
                db.add(pred)
                predictions_created += 1

        db.commit()

    return {
        "message": "BMD import complete",
        "patients_created": patients_created,
        "patients_updated": patients_updated,
        "images_imported": images_imported,
        "predictions_created": predictions_created,
        "skipped_images": skipped_images,
        "total_patients": len(hn_class_map),
        "classes": class_counts,
    }


@app.get("/xrays/list/{hn}")
def list_xrays_for_hn(
    hn: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor", "nurse")),
):
    """Return every registered X-ray study for a patient (paged by upload time)."""
    patient = (
        db.query(models.Patient)
        .filter(func.lower(models.Patient.hn) == hn.lower())
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    xrays = (
        db.query(models.XrayImage)
        .filter(models.XrayImage.patient_id == patient.id)
        .order_by(models.XrayImage.uploaded_at.desc())
        .all()
    )
    return [
        {
            "xray_id": x.id,
            "image_url": _media_url(x.file_path),
            "roi_url": _media_url(x.roi_path),
            "uploaded_at": x.uploaded_at.isoformat() if x.uploaded_at else None,
            "filename": Path(x.file_path).name,
        }
        for x in xrays
    ]


@app.get("/xrays/{hn}")
def get_latest_xray(
    hn: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor", "nurse")),
):
    patient = db.query(models.Patient).filter(func.lower(models.Patient.hn) == hn.lower()).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    latest_xray = (
        db.query(models.XrayImage)
        .filter(models.XrayImage.patient_id == patient.id)
        .order_by(models.XrayImage.uploaded_at.desc())
        .first()
    )
    if not latest_xray:
        return {"image_url": None, "roi_url": None}
    return {
        "xray_id": latest_xray.id,
        "image_url": _media_url(latest_xray.file_path),
        "roi_url": _media_url(latest_xray.roi_path),
        "uploaded_at": latest_xray.uploaded_at.isoformat(),
    }


@app.post("/predict/{hn}", response_model=schemas.PredictionOut)
def predict_hn(
    hn: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor")),
):
    patient = db.query(models.Patient).filter(func.lower(models.Patient.hn) == hn.lower()).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    latest_xray = (
        db.query(models.XrayImage)
        .filter(models.XrayImage.patient_id == patient.id)
        .order_by(models.XrayImage.uploaded_at.desc())
        .first()
    )
    if latest_xray:
        image_feature = ml.image_feature_from_roi(latest_xray.roi_path or latest_xray.file_path)
        model_version = "hybrid-v1"
    else:
        # Fallback path: allow prediction from tabular clinical data even when
        # X-ray image has not been uploaded yet.
        image_feature = 0.5
        model_version = "hybrid-v1-tabular-fallback"

    result = ml.hybrid_predict(
        {
            "age": patient.age,
            "bmi": patient.bmi,
            "spine_bmd": patient.spine_bmd,
            "smoking": patient.smoking,
            "steroid_use": patient.steroid_use,
        },
        image_feature,
    )
    prediction = models.Prediction(patient_id=patient.id, model_version=model_version, **result)
    db.add(prediction)
    db.commit()
    db.refresh(prediction)
    return prediction


@app.get("/predictions/{hn}", response_model=list[schemas.PredictionOut])
def get_predictions(
    hn: str,
    db: Session = Depends(get_db),
    _: models.User = Depends(require_roles("admin", "doctor", "nurse")),
):
    patient = db.query(models.Patient).filter(models.Patient.hn == hn).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return (
        db.query(models.Prediction)
        .filter(models.Prediction.patient_id == patient.id)
        .order_by(models.Prediction.created_at.desc())
        .all()
    )
