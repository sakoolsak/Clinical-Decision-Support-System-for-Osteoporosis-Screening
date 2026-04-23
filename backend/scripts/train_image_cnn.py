from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

try:
    import tensorflow as tf
except Exception:  # pragma: no cover
    tf = None

IMG_SIZE = 128


def preprocess_image(image_path: Path) -> np.ndarray:
    img = cv2.imread(str(image_path), cv2.IMREAD_GRAYSCALE)
    if img is None:
        return np.zeros((IMG_SIZE, IMG_SIZE, 1), dtype=np.float32)

    # ROI extraction for spine region.
    h, w = img.shape
    roi = img[int(h * 0.2) : int(h * 0.8), int(w * 0.25) : int(w * 0.75)]
    roi = cv2.resize(roi, (IMG_SIZE, IMG_SIZE))
    roi = roi.astype("float32") / 255.0
    return np.expand_dims(roi, axis=-1)


def build_cnn_model() -> tf.keras.Model:
    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(IMG_SIZE, IMG_SIZE, 1)),
            tf.keras.layers.Conv2D(32, (3, 3), activation="relu"),
            tf.keras.layers.MaxPooling2D((2, 2)),
            tf.keras.layers.Conv2D(64, (3, 3), activation="relu"),
            tf.keras.layers.MaxPooling2D((2, 2)),
            tf.keras.layers.Conv2D(128, (3, 3), activation="relu"),
            tf.keras.layers.GlobalAveragePooling2D(),
            tf.keras.layers.Dense(64, activation="relu"),
            tf.keras.layers.Dropout(0.2),
            tf.keras.layers.Dense(1, activation="sigmoid"),
        ]
    )
    model.compile(optimizer="adam", loss="binary_crossentropy", metrics=["accuracy", tf.keras.metrics.AUC(name="auc")])
    return model


def run_training():
    if tf is None:
        raise RuntimeError(
            "TensorFlow is not installed for this Python version. "
            "Use Python 3.11/3.12 in a virtual environment for CNN training."
        )

    data_path = Path(__file__).resolve().parents[1] / "data" / "OsteoporosisUPDataset.csv"
    image_dir = Path(__file__).resolve().parents[1] / "uploads"
    df = pd.read_csv(data_path)

    images = []
    labels = []
    for _, row in df.iterrows():
        # Expect image naming format HNxxx_xray.png (for demonstration).
        image_path = image_dir / f"{row['hn']}_xray.png"
        images.append(preprocess_image(image_path))
        labels.append(row["osteoporosis_label"])

    X = np.array(images)
    y = np.array(labels)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)

    model = build_cnn_model()
    model.fit(X_train, y_train, validation_split=0.2, epochs=5, batch_size=8, verbose=1)
    evaluation = model.evaluate(X_test, y_test, verbose=0)
    model.save(Path(__file__).resolve().parents[1] / "models" / "cnn_spine.keras")
    print({"loss": evaluation[0], "accuracy": evaluation[1], "auc": evaluation[2]})


if __name__ == "__main__":
    run_training()
