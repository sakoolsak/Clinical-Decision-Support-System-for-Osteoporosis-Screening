"""Bulk import the BMD X-ray library into the clinical database.

Usage (from the `backend/` folder):

    python -m scripts.import_bmd

Scans `backend/uploads/BMD/{Normal|Osteopenia|Osteoporosis}/<HN>/*.{png,jpg,...}`
where each 9-digit folder name is treated as the patient's HN.

- Upserts patient records (defaults filled for unknown fields).
- Registers each image as an XrayImage row (idempotent — duplicates are skipped).
- Creates a baseline Prediction per patient per class (marker model version
  `bmd-import-<class>`) so dashboards light up immediately.

This script uses the same SQLAlchemy session/engine as the FastAPI app, so it
works whether the API is running or not.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Allow running both as `python -m scripts.import_bmd` and as a plain script.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import func

from app import models  # noqa: E402
from app.database import Base, SessionLocal, engine  # noqa: E402

UPLOAD_DIR = ROOT / "uploads"
BMD_ROOT = UPLOAD_DIR / "BMD"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}

CLASS_META = {
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


def run() -> dict:
    Base.metadata.create_all(bind=engine)
    if not BMD_ROOT.exists():
        raise SystemExit(f"[import-bmd] ERROR: BMD root not found: {BMD_ROOT}")

    db = SessionLocal()
    patients_created = 0
    patients_updated = 0
    images_imported = 0
    predictions_created = 0
    skipped_images = 0
    class_counts: dict[str, int] = {cls: 0 for cls in CLASS_META}
    total_patients = 0

    try:
        for cls, meta in CLASS_META.items():
            cls_dir = BMD_ROOT / cls
            if not cls_dir.is_dir():
                print(f"[import-bmd] skip missing class folder: {cls_dir}")
                continue
            print(f"[import-bmd] scanning {cls_dir} ...")

            for hn_dir in sorted(cls_dir.iterdir()):
                if not hn_dir.is_dir():
                    continue
                hn = hn_dir.name.strip()
                if not hn.isdigit() or not (6 <= len(hn) <= 12):
                    continue

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

                total_patients += 1
                class_counts[cls] += 1

                for fp in sorted(hn_dir.iterdir()):
                    if not fp.is_file() or fp.suffix.lower() not in IMAGE_EXTS:
                        continue
                    abs_path = str(fp.resolve())
                    exists = (
                        db.query(models.XrayImage)
                        .filter(models.XrayImage.patient_id == patient.id)
                        .filter(models.XrayImage.file_path == abs_path)
                        .first()
                    )
                    if exists:
                        skipped_images += 1
                        continue
                    db.add(
                        models.XrayImage(
                            patient_id=patient.id,
                            file_path=abs_path,
                            roi_path=None,
                        )
                    )
                    images_imported += 1

                marker = f"bmd-import-{cls.lower()}"
                already = (
                    db.query(models.Prediction)
                    .filter(models.Prediction.patient_id == patient.id)
                    .filter(models.Prediction.model_version == marker)
                    .first()
                )
                if not already:
                    db.add(
                        models.Prediction(
                            patient_id=patient.id,
                            risk_score=meta["risk_score"],
                            risk_label=meta["risk_label"],
                            probability=meta["probability"],
                            model_version=marker,
                            visualization_json=json.dumps(
                                {
                                    "source": "BMD library",
                                    "class": cls,
                                    "note": "Baseline prior — run AI Prediction for a hybrid score.",
                                }
                            ),
                        )
                    )
                    predictions_created += 1

            db.commit()
    finally:
        db.close()

    summary = {
        "patients_created": patients_created,
        "patients_updated": patients_updated,
        "images_imported": images_imported,
        "predictions_created": predictions_created,
        "skipped_images": skipped_images,
        "total_patients": total_patients,
        "classes": class_counts,
    }

    print("[import-bmd] DONE")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    return summary


if __name__ == "__main__":
    run()
