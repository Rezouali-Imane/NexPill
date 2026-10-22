"""
NexPill Tabular Adherence Model Training & Comparison.

Trains and evaluates:
1. Baseline: Logistic Regression (interpretable linear odds ratios)
2. Comparison: Random Forest (captures non-linear interactions e.g. evening + deterioration)

Saves the trained pipeline to `ml/adherence_predictor.joblib` alongside feature names
and evaluation metrics.
"""

from __future__ import annotations

import argparse
import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import StratifiedKFold, cross_val_score, train_test_split
from sklearn.preprocessing import StandardScaler


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


def load_or_generate_data(csv_path: str = "ml/adherence_dataset.csv") -> pd.DataFrame:
    if not os.path.exists(csv_path):
        from generate_dataset import build_synthetic_cohort
        print(f"{csv_path} not found. Generating fresh synthetic dataset...")
        df = build_synthetic_cohort(num_patients_per_profile=15, days=45)
        df.to_csv(csv_path, index=False)
        return df
    return pd.read_csv(csv_path)


def train_and_evaluate(csv_path: str = "ml/adherence_dataset.csv", output_model_path: str = "ml/adherence_predictor.joblib"):
    df = load_or_generate_data(csv_path)

    X = df[FEATURE_NAMES]
    y = df["target_unconfirmed"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )

    print("==================================================")
    print(" NexPill Adherence ML Training Pipeline")
    print("==================================================")
    print(f"Total samples: {len(X)} (Train: {len(X_train)}, Test: {len(X_test)})")
    print(f"Positive class (Unconfirmed/Missed): {y.mean():.1%}\n")

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # 1. Baseline Model: Logistic Regression
    lr = LogisticRegression(max_iter=1000, class_weight="balanced", random_state=42)
    lr.fit(X_train_scaled, y_train)

    lr_preds = lr.predict(X_test_scaled)
    lr_probs = lr.predict_proba(X_test_scaled)[:, 1]

    lr_roc = roc_auc_score(y_test, lr_probs)
    lr_f1 = f1_score(y_test, lr_preds)
    lr_prec = precision_score(y_test, lr_preds)
    lr_rec = recall_score(y_test, lr_preds)

    # 2. Comparison Model: Random Forest
    rf = RandomForestClassifier(
        n_estimators=120,
        max_depth=6,
        class_weight="balanced",
        random_state=42,
    )
    rf.fit(X_train, y_train)

    rf_preds = rf.predict(X_test)
    rf_probs = rf.predict_proba(X_test)[:, 1]

    rf_roc = roc_auc_score(y_test, rf_probs)
    rf_f1 = f1_score(y_test, rf_preds)
    rf_prec = precision_score(y_test, rf_preds)
    rf_rec = recall_score(y_test, rf_preds)

    # Cross-validation
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    lr_cv = cross_val_score(lr, X_train_scaled, y_train, cv=cv, scoring="roc_auc").mean()
    rf_cv = cross_val_score(rf, X_train, y_train, cv=cv, scoring="roc_auc").mean()

    print("---------------- Model Comparison ----------------")
    print(f"{'Metric':<20} {'Logistic Regression':<22} {'Random Forest':<15}")
    print(f"{'ROC-AUC (Test)':<20} {lr_roc:<22.4f} {rf_roc:<15.4f}")
    print(f"{'ROC-AUC (5-Fold CV)':<20} {lr_cv:<22.4f} {rf_cv:<15.4f}")
    print(f"{'Precision (Class 1)':<20} {lr_prec:<22.4f} {rf_prec:<15.4f}")
    print(f"{'Recall (Class 1)':<20} {lr_rec:<22.4f} {rf_rec:<15.4f}")
    print(f"{'F1-Score':<20} {lr_f1:<22.4f} {rf_f1:<15.4f}")
    print("--------------------------------------------------\n")

    # Feature Importance (Random Forest)
    print("Feature Importances (Random Forest):")
    importances = rf.feature_importances_
    for name, imp in sorted(zip(FEATURE_NAMES, importances), key=lambda x: x[1], reverse=True):
        print(f"  - {name:<26}: {imp:.4f}")
    print()

    # Save model artifact bundle
    bundle = {
        "model": rf if rf_roc >= lr_roc else lr,
        "model_type": "RandomForest" if rf_roc >= lr_roc else "LogisticRegression",
        "scaler": scaler if rf_roc < lr_roc else None,
        "features": FEATURE_NAMES,
        "metrics": {
            "logistic_regression": {"roc_auc": lr_roc, "f1": lr_f1, "cv_roc": lr_cv},
            "random_forest": {"roc_auc": rf_roc, "f1": rf_f1, "cv_roc": rf_cv},
        },
    }

    joblib.dump(bundle, output_model_path)
    print(f"Saved winning model ({bundle['model_type']}) to: {output_model_path}")
    return bundle


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train NexPill adherence models")
    parser.add_argument("--data", type=str, default="ml/adherence_dataset.csv")
    parser.add_argument("--output", type=str, default="ml/adherence_predictor.joblib")
    args = parser.parse_args()

    train_and_evaluate(args.data, args.output)
