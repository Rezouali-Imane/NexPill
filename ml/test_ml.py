"""
Automated Test Suite for NexPill Machine Learning Adherence Pipeline.
"""

from __future__ import annotations

import unittest
from datetime import datetime
import pandas as pd
from generate_dataset import generate_patient_history, extract_features_and_labels
from predict import predict_miss_probability
from train_model import train_and_evaluate, FEATURE_NAMES


class TestNexPillML(unittest.TestCase):
    def test_dataset_generation_and_features(self):
        start = datetime(2026, 8, 1)
        events = generate_patient_history("test-p1", "evening_friction", start, days=20, seed=1)
        self.assertGreater(len(events), 50)

        df = extract_features_and_labels(events)
        self.assertFalse(df.empty)

        for col in FEATURE_NAMES:
            self.assertIn(col, df.columns)

        self.assertIn("target_unconfirmed", df.columns)
        self.assertTrue(set(df["target_unconfirmed"].unique()).issubset({0, 1}))

    def test_model_training_and_metrics(self):
        bundle = train_and_evaluate(
            csv_path="ml/adherence_dataset.csv",
            output_model_path="ml/adherence_predictor.joblib",
        )

        self.assertIn("model", bundle)
        self.assertIn("model_type", bundle)
        self.assertIn("metrics", bundle)
        self.assertIn(bundle["model_type"], ["RandomForest", "LogisticRegression"])

        rf_roc = bundle["metrics"]["random_forest"]["roc_auc"]
        lr_roc = bundle["metrics"]["logistic_regression"]["roc_auc"]
        self.assertGreater(rf_roc, 0.5)
        self.assertGreater(lr_roc, 0.5)

    def test_prediction_and_explainability(self):
        sample = {
            "scheduled_hour": 18,
            "day_of_week": 4,
            "rolling_miss_rate_14d": 0.40,
            "rolling_avg_delay_14d": 50.0,
            "tod_miss_rate": 0.70,
            "trend_delta": -0.30,
            "consecutive_misses_prior": 2,
        }

        result = predict_miss_probability(sample, model_path="ml/adherence_predictor.joblib")

        self.assertIn("probability", result)
        self.assertIn("risk_level", result)
        self.assertIn("reasons", result)
        self.assertIn("disclaimer", result)

        self.assertGreaterEqual(result["probability"], 0.0)
        self.assertLessEqual(result["probability"], 1.0)
        self.assertIn(result["risk_level"], ["STABLE", "NEEDS_ATTENTION", "HIGH_RISK"])
        self.assertGreater(len(result["reasons"]), 0)


if __name__ == "__main__":
    unittest.main()
