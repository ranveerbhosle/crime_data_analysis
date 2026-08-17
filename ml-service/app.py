import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

BASE_DIR = Path(__file__).resolve().parent
ROOT_DIR = BASE_DIR.parent
_DEFAULT_INDIA = ROOT_DIR / "data" / "crime_dataset_india (1).csv"
DATA_PATH = Path(os.environ.get("INDIA_CRIME_CSV", str(_DEFAULT_INDIA)))
MODEL_PATH = Path(os.environ.get("MODEL_PATH", str(BASE_DIR / "model.pkl")))
PORT = int(os.environ.get("FLASK_PORT", os.environ.get("PORT", "5001")))
ML_MAX_TRAIN_ROWS = int(os.environ.get("ML_MAX_TRAIN_ROWS", "200000"))
CHUNK_ROWS = int(os.environ.get("ML_CSV_CHUNK_ROWS", "150000"))

FEATURE_COLS = [
    "Region",
    "Month",
    "Hour",
    "Day_of_Week",
    "Quarter",
    "Season",
    "Is_Weekend",
    "Victim_Gender",
    "Weapon Used",
    "Crime Domain",
]
TARGET_COL = "Crime_Type"

app = Flask(__name__)
CORS(app)

_bundle = None


def _norm_cols(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.strip() for c in df.columns]
    return df


def _gender_to_code(val) -> int:
    if pd.isna(val):
        return 2
    s = str(val).strip().upper()
    if s in ("M", "MALE"):
        return 1
    if s in ("F", "FEMALE"):
        return 0
    return 2


def _prepare_xy(df: pd.DataFrame):
    df = _norm_cols(df)
    missing = [c for c in FEATURE_COLS + [TARGET_COL] if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")

    X = df[FEATURE_COLS].copy()
    X["Victim_Gender"] = X["Victim_Gender"].map(_gender_to_code)

    cat_cols = [
        "Region",
        "Month",
        "Hour",
        "Day_of_Week",
        "Quarter",
        "Season",
        "Is_Weekend",
        "Weapon Used",
        "Crime Domain",
    ]
    for c in cat_cols:
        X[c] = X[c].astype(str)

    y_raw = df[TARGET_COL].astype(str)
    return X, y_raw, cat_cols


def train_and_bundle():
    if not DATA_PATH.is_file():
        raise FileNotFoundError(f"Dataset not found: {DATA_PATH}")

    need = set(FEATURE_COLS + [TARGET_COL])
    df = pd.read_csv(DATA_PATH, usecols=lambda c: c.strip() in need)
    df = _norm_cols(df)
    df = df.replace("", np.nan).dropna(subset=FEATURE_COLS + [TARGET_COL])
    if ML_MAX_TRAIN_ROWS > 0 and len(df) > ML_MAX_TRAIN_ROWS:
        df = df.sample(n=ML_MAX_TRAIN_ROWS, random_state=42)
    X, y_raw, cat_cols = _prepare_xy(df)

    le_y = LabelEncoder()
    y = le_y.fit_transform(y_raw)

    encoders = {}
    X_enc = X.copy()
    for c in cat_cols:
        le = LabelEncoder()
        X_enc[c] = le.fit_transform(X[c].astype(str))
        encoders[c] = le

    X_mat = X_enc.values
    try:
        split_kw = {"stratify": y}
        X_train, X_test, y_train, y_test = train_test_split(
            X_mat, y, test_size=0.2, random_state=42, **split_kw
        )
    except ValueError:
        X_train, X_test, y_train, y_test = train_test_split(
            X_mat, y, test_size=0.2, random_state=42
        )

    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=12,
        n_jobs=-1,
        random_state=42,
    )
    rf.fit(X_train, y_train)
    y_pred = rf.predict(X_test)
    acc = float(accuracy_score(y_test, y_pred))
    cm = confusion_matrix(y_test, y_pred, labels=range(len(le_y.classes_))).tolist()
    labels_present = sorted(set(np.concatenate([y_test, y_pred])))
    report = classification_report(
        y_test,
        y_pred,
        labels=labels_present,
        target_names=[le_y.classes_[i] for i in labels_present],
        output_dict=True,
        zero_division=0,
    )

    lr = LogisticRegression(max_iter=500, random_state=42, n_jobs=-1)
    lr.fit(X_train, y_train)

    importances = dict(
        zip(FEATURE_COLS, rf.feature_importances_.astype(float).tolist())
    )

    bundle = {
        "rf": rf,
        "lr_baseline": lr,
        "encoders": encoders,
        "le_y": le_y,
        "feature_cols": FEATURE_COLS,
        "cat_cols": cat_cols,
        "accuracy": acc,
        "feature_importances": importances,
        "confusion_matrix": cm,
        "classification_report": report,
        "classes": le_y.classes_.tolist(),
    }
    joblib.dump(bundle, MODEL_PATH)
    return bundle


def load_bundle():
    global _bundle
    if _bundle is not None:
        return _bundle
    if os.environ.get("FORCE_RETRAIN", "").lower() in ("1", "true", "yes") and MODEL_PATH.is_file():
        MODEL_PATH.unlink(missing_ok=True)
    if MODEL_PATH.is_file():
        _bundle = joblib.load(MODEL_PATH)
        return _bundle
    _bundle = train_and_bundle()
    return _bundle


def _aggregate_seasonal_chunked():
    counts = {}
    for chunk in pd.read_csv(
        DATA_PATH,
        chunksize=CHUNK_ROWS,
        usecols=lambda c: c.strip() in ("Month", "Crime_Type"),
    ):
        chunk = _norm_cols(chunk)
        if "Crime_Type" not in chunk.columns or "Month" not in chunk.columns:
            continue
        chunk["Month"] = chunk["Month"].astype(str)
        g = chunk.groupby(["Month", "Crime_Type"], observed=False).size()
        for (m, ct), v in g.items():
            counts[(m, ct)] = counts.get((m, ct), 0) + int(v)
    rows = [{"Month": k[0], "Crime_Type": k[1], "count": v} for k, v in counts.items()]
    return rows


def _aggregate_region_chunked():
    counts = {}
    for chunk in pd.read_csv(
        DATA_PATH,
        chunksize=CHUNK_ROWS,
        usecols=lambda c: c.strip() == "Region",
    ):
        chunk = _norm_cols(chunk)
        if "Region" not in chunk.columns:
            continue
        vc = chunk["Region"].astype(str).value_counts()
        for reg, v in vc.items():
            counts[reg] = counts.get(reg, 0) + int(v)
    out = [{"region": k, "count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])]
    return out


def _aggregate_time_chunked():
    counts = {}
    for chunk in pd.read_csv(
        DATA_PATH,
        chunksize=CHUNK_ROWS,
        usecols=lambda c: c.strip() in ("Hour", "Day_of_Week"),
    ):
        chunk = _norm_cols(chunk)
        need = ["Hour", "Day_of_Week"]
        if not all(c in chunk.columns for c in need):
            continue
        chunk["Hour"] = chunk["Hour"].astype(str)
        chunk["Day_of_Week"] = chunk["Day_of_Week"].astype(str)
        g = chunk.groupby(["Hour", "Day_of_Week"], observed=False).size()
        for (h, d), v in g.items():
            counts[(h, d)] = counts.get((h, d), 0) + int(v)
    data = [
        {"Hour": k[0], "Day_of_Week": k[1], "count": v}
        for k, v in counts.items()
    ]
    return data


def predict_from_payload(body: dict):
    b = load_bundle()
    encoders = b["encoders"]
    le_y = b["le_y"]
    rf = b["rf"]
    cat_cols = b["cat_cols"]

    region = str(body.get("region", "")).strip()
    month = str(body.get("month", "")).strip()
    hour = str(body.get("hour", "")).strip()
    day_of_week = str(body.get("day_of_week", "")).strip()
    weapon = str(body.get("weapon", "")).strip()
    crime_domain = str(body.get("crime_domain", "")).strip()
    gender_raw = body.get("gender", "")

    # Quarter, Season, Is_Weekend derived if missing — simple defaults from month
    try:
        m = int(float(month))
    except (TypeError, ValueError):
        m = 1
    quarter = str((m - 1) // 3 + 1)
    season_map = {
        12: "Winter",
        1: "Winter",
        2: "Winter",
        3: "Spring",
        4: "Spring",
        5: "Spring",
        6: "Monsoon",
        7: "Monsoon",
        8: "Monsoon",
        9: "Post-Monsoon",
        10: "Post-Monsoon",
        11: "Post-Monsoon",
    }
    season = season_map.get(m, "Spring")
    try:
        dow = int(float(day_of_week))
    except (TypeError, ValueError):
        dow = 0
    is_weekend = "1" if dow >= 5 else "0"

    row = {
        "Region": region,
        "Month": month,
        "Hour": hour,
        "Day_of_Week": day_of_week,
        "Quarter": quarter,
        "Season": season,
        "Is_Weekend": is_weekend,
        "Victim_Gender": _gender_to_code(gender_raw),
        "Weapon Used": weapon,
        "Crime Domain": crime_domain,
    }

    vec = []
    for c in FEATURE_COLS:
        if c == "Victim_Gender":
            vec.append(float(row["Victim_Gender"]))
            continue
        le = encoders[c]
        val = str(row[c])
        if val not in le.classes_:
            val = le.classes_[0]
        vec.append(float(le.transform([val])[0]))

    x = np.array(vec, dtype=float).reshape(1, -1)
    proba = rf.predict_proba(x)[0]
    idx = int(np.argmax(proba))
    pred_class = le_y.inverse_transform([idx])[0]
    confidence = float(proba[idx])
    top3_idx = np.argsort(proba)[::-1][:3]
    top3 = [
        {
            "crime": le_y.inverse_transform([int(i)])[0],
            "probability": float(proba[i]),
        }
        for i in top3_idx
    ]

    return {
        "predicted_crime": pred_class,
        "confidence": confidence,
        "top3": top3,
    }


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "model_loaded": MODEL_PATH.is_file() or DATA_PATH.is_file()})


@app.route("/predict", methods=["POST"])
def predict():
    try:
        body = request.get_json(force=True, silent=True) or {}
        out = predict_from_payload(body)
        return jsonify(out)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/model-stats", methods=["GET"])
def model_stats():
    try:
        b = load_bundle()
        return jsonify(
            {
                "accuracy": b.get("accuracy"),
                "feature_importances": b.get("feature_importances"),
                "confusion_matrix": b.get("confusion_matrix"),
                "classification_report": b.get("classification_report"),
                "classes": b.get("classes"),
            }
        )
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/seasonal-analysis", methods=["GET"])
def seasonal_analysis():
    try:
        if not DATA_PATH.is_file():
            return jsonify({"error": "Dataset not found", "data": []}), 404
        rows = _aggregate_seasonal_chunked()
        return jsonify({"data": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/city-heatmap", methods=["GET"])
def city_heatmap():
    try:
        if not DATA_PATH.is_file():
            return jsonify({"error": "Dataset not found", "data": []}), 404
        rows = _aggregate_region_chunked()
        return jsonify({"data": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/time-analysis", methods=["GET"])
def time_analysis():
    try:
        if not DATA_PATH.is_file():
            return jsonify({"error": "Dataset not found", "data": []}), 404
        rows = _aggregate_time_chunked()
        return jsonify({"data": rows})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    try:
        load_bundle()
        print(f"Model ready. Serving on port {PORT}")
    except Exception as exc:
        print(f"Warning: could not load/train model: {exc}")
    app.run(host="0.0.0.0", port=PORT, debug=os.environ.get("FLASK_DEBUG") == "1")
