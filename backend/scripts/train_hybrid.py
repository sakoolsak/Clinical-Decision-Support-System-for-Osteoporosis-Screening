from pathlib import Path

import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from sklearn.compose import ColumnTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, roc_auc_score
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


def load_dataset() -> pd.DataFrame:
    data_path = Path(__file__).resolve().parents[1] / "data" / "OsteoporosisUPDataset.csv"
    return pd.read_csv(data_path)


def train_hybrid_model():
    df = load_dataset()
    y = df["osteoporosis_label"]
    X_tabular = df[["age", "gender", "bmi", "smoking", "steroid_use", "spine_bmd"]]

    numeric_features = ["age", "bmi", "smoking", "steroid_use", "spine_bmd"]
    categorical_features = ["gender"]

    preprocessor = ColumnTransformer(
        transformers=[
            ("num", StandardScaler(), numeric_features),
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical_features),
        ]
    )

    X_train, X_test, y_train, y_test = train_test_split(
        X_tabular, y, test_size=0.2, random_state=42, stratify=y
    )

    X_train_processed = preprocessor.fit_transform(X_train)
    X_test_processed = preprocessor.transform(X_test)

    smote = SMOTE(random_state=42, k_neighbors=1)
    X_train_balanced, y_train_balanced = smote.fit_resample(X_train_processed, y_train)

    model = LogisticRegression(max_iter=500, class_weight="balanced")
    model.fit(X_train_balanced, y_train_balanced)

    y_pred = model.predict(X_test_processed)
    y_prob = model.predict_proba(X_test_processed)[:, 1]

    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "f1_score": float(f1_score(y_test, y_pred, zero_division=0)),
        "auc": float(roc_auc_score(y_test, y_prob)),
    }

    cv = StratifiedKFold(n_splits=3, shuffle=True, random_state=42)
    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("classifier", LogisticRegression(max_iter=500, class_weight="balanced")),
        ]
    )
    cv_scores = cross_val_score(pipeline, X_tabular, y, scoring="roc_auc", cv=cv)
    metrics["cv_auc_mean"] = float(np.mean(cv_scores))
    metrics["cv_auc_std"] = float(np.std(cv_scores))
    return metrics


if __name__ == "__main__":
    results = train_hybrid_model()
    print("Training complete:")
    for k, v in results.items():
        print(f"- {k}: {v:.4f}")
