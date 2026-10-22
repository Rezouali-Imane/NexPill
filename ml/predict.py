"""
NexPill Missed-Dose Probability Predictor & Explainability Engine.

Estimates the likelihood that an upcoming scheduled dose will not be confirmed on time,
and extracts explainable contributing factors.

NOTE: This is a predictive support tool, not a clinical diagnosis or prescription adjustment.
"""

from __future__ import annotations

import argparse
import json
import os
from typing import Any, Dict, List
import joblib
import pandas as pd


FEATURE_NAMES = [
    "scheduled_hour",
    "day_of_week",
    "is_evening",
    "rolling_miss_rate_14d",
    "rolling_avg_delay_14d",
    "tod_miss_rate",
    "trend_delta",
    "consecutive_misses_prior",
]


def load_predictor(model_path: str = "ml/adherence_predictor.joblib") -> Dict[str, Any]:
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"Trained model artifact not found at {model_path}. Run `python ml/train_model.py` first."
        )
    return joblib.load(model_path)


def predict_miss_probability(
    features: Dict[str, Any],
    model_path: str = "ml/adherence_predictor.joblib",
) -> Dict[str, Any]:
    bundle = load_predictor(model_path)
    model = bundle["model"]
    scaler = bundle.get("scaler")
    model_type = bundle.get("model_type", "RandomForest")

    # Ensure all required features are present
    hour = int(features.get("scheduled_hour", 8))
    row = {
        "scheduled_hour": hour,
        "day_of_week": int(features.get("day_of_week", 0)),
        "is_evening": 1 if hour >= 18 else 0,
        "rolling_miss_rate_14d": float(features.get("rolling_miss_rate_14d", 0.05)),
        "rolling_avg_delay_14d": float(features.get("rolling_avg_delay_14d", 5.0)),
        "tod_miss_rate": float(features.get("tod_miss_rate", 0.05)),
        "trend_delta": float(features.get("trend_delta", 0.0)),
        "consecutive_misses_prior": int(features.get("consecutive_misses_prior", 0)),
    }

    df_row = pd.DataFrame([row])[FEATURE_NAMES]

    if scaler is not None:
        input_data = scaler.transform(df_row)
    else:
        input_data = df_row

    # Predict probability of class 1 (Unconfirmed/Missed)
    prob_unconfirmed = float(model.predict_proba(input_data)[0, 1])

    # Explainable reasons generation
    reasons: List[str] = []
    if row["tod_miss_rate"] >= 0.40:
        pct = int(round(row["tod_miss_rate"] * 100))
        reasons.append(f"Elevated historical unconfirmed rate for {hour:02d}:00 doses ({pct}%).")
    if row["is_evening"] == 1:
        reasons.append("Evening doses carry higher friction and late confirmation frequency.")
    if row["trend_delta"] <= -0.15:
        drop_pct = int(round(abs(row["trend_delta"]) * 100))
        reasons.append(f"Recent adherence momentum deteriorated by {drop_pct}% compared to prior weeks.")
    if row["consecutive_misses_prior"] >= 2:
        reasons.append(f"{row['consecutive_misses_prior']} consecutive previous doses were unconfirmed.")
    if row["rolling_avg_delay_14d"] >= 30:
        reasons.append(f"Patient frequently takes medication late (averaging {int(row['rolling_avg_delay_14d'])} min delay).")

    if not reasons:
        reasons.append("Patient maintains steady, on-time historical adherence.")

    # Categorize Risk
    if prob_unconfirmed >= 0.65 or row["consecutive_misses_prior"] >= 3:
        risk_level = "HIGH_RISK"
    elif prob_unconfirmed >= 0.35 or len(reasons) >= 2:
        risk_level = "NEEDS_ATTENTION"
    else:
        risk_level = "STABLE"

    return {
        "probability": round(prob_unconfirmed, 3),
        "probability_percentage": f"{int(round(prob_unconfirmed * 100))}%",
        "risk_level": risk_level,
        "model_type": model_type,
        "input_features": row,
        "reasons": reasons,
        "disclaimer": "Observational probability estimate for caregiver support; not a clinical diagnosis.",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Predict missed-dose probability")
    parser.add_argument("--json", type=str, help="Input feature JSON string")
    parser.add_argument("--demo-ahmed", action="store_true", help="Run prediction on Ahmed's 18:00 evening dose")
    args = parser.parse_args()

    if args.demo_ahmed or not args.json:
        # Ahmed's evening profile
        sample_input = {
            "scheduled_hour": 18,
            "day_of_week": 3,
            "rolling_miss_rate_14d": 0.30,
            "rolling_avg_delay_14d": 45.0,
            "tod_miss_rate": 0.65,
            "trend_delta": -0.25,
            "consecutive_misses_prior": 2,
        }
        print("Running prediction for Ahmed's scheduled 18:00 evening dose...")
    else:
        sample_input = json.loads(args.json)

    result = predict_miss_probability(sample_input)
    print(json.dumps(result, indent=2))
