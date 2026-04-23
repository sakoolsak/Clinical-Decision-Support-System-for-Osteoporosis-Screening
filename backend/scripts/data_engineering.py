from pathlib import Path

import numpy as np
import pandas as pd


def simulate_emr_sources():
    demographics = pd.DataFrame(
        [
            {"hn": "HN001", "age": 68, "gender": "F", "bmi": 21.8},
            {"hn": "HN002", "age": 59, "gender": "F", "bmi": 24.2},
            {"hn": "HN003", "age": 72, "gender": "M", "bmi": 20.1},
            {"hn": "HN004", "age": 63, "gender": "F", "bmi": 22.0},
            {"hn": "HN005", "age": 55, "gender": "M", "bmi": 26.0},
        ]
    )

    clinical = pd.DataFrame(
        [
            {"hn": "HN001", "smoking": 1, "steroid_use": 1},
            {"hn": "HN002", "smoking": 0, "steroid_use": 0},
            {"hn": "HN003", "smoking": 1, "steroid_use": 0},
            {"hn": "HN004", "smoking": 0, "steroid_use": 1},
            {"hn": "HN005", "smoking": 0, "steroid_use": 0},
        ]
    )

    bmd_spine = pd.DataFrame(
        [
            {"hn": "HN001", "spine_bmd": 0.74},
            {"hn": "HN002", "spine_bmd": 0.91},
            {"hn": "HN003", "spine_bmd": 0.69},
            {"hn": "HN004", "spine_bmd": 0.83},
            {"hn": "HN005", "spine_bmd": 1.02},
        ]
    )
    return demographics, clinical, bmd_spine


def build_dataset():
    demographics, clinical, bmd_spine = simulate_emr_sources()
    merged = demographics.merge(clinical, on="hn", how="inner").merge(bmd_spine, on="hn", how="inner")
    merged["osteoporosis_label"] = np.where(merged["spine_bmd"] < 0.8, 1, 0)
    return merged


if __name__ == "__main__":
    output_path = Path(__file__).resolve().parents[1] / "data" / "OsteoporosisUPDataset.csv"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df = build_dataset()
    df.to_csv(output_path, index=False)
    print(f"Dataset saved to: {output_path}")
