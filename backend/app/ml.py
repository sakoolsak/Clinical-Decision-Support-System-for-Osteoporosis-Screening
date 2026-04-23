import json
from pathlib import Path

import cv2
import numpy as np

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)


def roi_extract(image_path: str) -> str:
    image = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if image is None:
        return image_path

    h, w = image.shape
    x1, x2 = int(w * 0.25), int(w * 0.75)
    y1, y2 = int(h * 0.2), int(h * 0.8)
    roi = image[y1:y2, x1:x2]
    roi_path = str(Path(image_path).with_name(f"roi_{Path(image_path).name}"))
    cv2.imwrite(roi_path, roi)
    return roi_path


def image_feature_from_roi(roi_path: str) -> float:
    roi = cv2.imread(roi_path, cv2.IMREAD_GRAYSCALE)
    if roi is None:
        return 0.5
    roi = cv2.resize(roi, (128, 128))
    return float(np.mean(roi) / 255.0)


def hybrid_predict(patient_row: dict, image_feature: float) -> dict:
    age = patient_row.get("age", 50) or 50
    bmi = patient_row.get("bmi", 22) or 22
    spine_bmd = patient_row.get("spine_bmd", 0.9) or 0.9
    smoking = patient_row.get("smoking", 0) or 0
    steroid_use = patient_row.get("steroid_use", 0) or 0

    score = (
        0.25 * (age / 100)
        + 0.2 * (1 - min(spine_bmd / 1.2, 1))
        + 0.15 * (1 - min(bmi / 35, 1))
        + 0.2 * float(smoking)
        + 0.1 * float(steroid_use)
        + 0.1 * (1 - image_feature)
    )
    probability = float(np.clip(score, 0.0, 1.0))
    risk_score = round(probability * 100, 2)

    if probability >= 0.7:
        label = "High Risk"
    elif probability >= 0.4:
        label = "Moderate Risk"
    else:
        label = "Low Risk"

    visualization = json.dumps(
        {
            "age_factor": round(0.25 * (age / 100), 4),
            "bmd_factor": round(0.2 * (1 - min(spine_bmd / 1.2, 1)), 4),
            "bmi_factor": round(0.15 * (1 - min(bmi / 35, 1)), 4),
            "smoking_factor": round(0.2 * float(smoking), 4),
            "steroid_factor": round(0.1 * float(steroid_use), 4),
            "image_factor": round(0.1 * (1 - image_feature), 4),
        }
    )

    return {
        "risk_score": risk_score,
        "risk_label": label,
        "probability": probability,
        "visualization_json": visualization,
    }
