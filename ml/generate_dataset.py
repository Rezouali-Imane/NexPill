"""
Synthetic Patient Medication Adherence Dataset Generator for NexPill.

Generates realistic medication adherence trajectories across multiple patient behavioral profiles:
- Standard Adherent: High on-time confirmation rate (~95%).
- Evening Friction (e.g. Ahmed): High daytime adherence, high friction/misses for evening doses.
- Recent Deterioration: Strong initial baseline with significant drop in recent adherence.
- Chronic Delayer: Regularly confirms but frequently 30-90 minutes late.

NOTE: This is synthetic training data created specifically for ML pipeline demonstration,
model evaluation, and interpretability testing. It does not replace real clinical telemetry.
"""

from __future__ import annotations

import argparse
import random
from datetime import datetime, timedelta
from typing import Any, Dict, List
import pandas as pd
import numpy as np


def generate_patient_history(
    patient_id: str,
    profile: str,
    start_date: datetime,
    days: int = 45,
    seed: int = 42,
) -> List[Dict[str, Any]]:
    rng = random.Random(seed)
    events: List[Dict[str, Any]] = []

    # Standard 4 doses per day: 08:00 (morning), 12:00 (lunch), 18:00 (evening), 21:00 (night)
    dose_hours = [8, 12, 18, 21]

    # Behavioral profiles parameterization
    # p_miss base probabilities per hour
    for day in range(days):
        current_date = start_date + timedelta(days=day)
        is_recent = day >= (days - 10)  # Last 10 days

        for hour in dose_hours:
            scheduled_dt = current_date.replace(hour=hour, minute=0, second=0, microsecond=0)
            
            # Base probability of missing / not confirming
            if profile == "high_adherence":
                p_miss = 0.04
                delay_mean = 5.0
            elif profile == "evening_friction":
                # High morning/lunch adherence, high evening miss rate (Ahmed profile)
                if hour >= 18:
                    p_miss = 0.55 if not is_recent else 0.75
                    delay_mean = 45.0
                else:
                    p_miss = 0.06
                    delay_mean = 8.0
            elif profile == "deteriorating":
                if is_recent:
                    p_miss = 0.60
                    delay_mean = 40.0
                else:
                    p_miss = 0.08
                    delay_mean = 10.0
            elif profile == "chronic_delays":
                p_miss = 0.12
                delay_mean = 65.0
            else:
                p_miss = 0.20
                delay_mean = 20.0

            # Determine outcome
            is_unconfirmed = 1 if rng.random() < p_miss else 0
            
            # If taken, determine confirmation latency
            if is_unconfirmed == 0:
                actual_delay = max(0, int(rng.gauss(delay_mean, 15)))
                status = "TAKEN"
            else:
                actual_delay = 0
                status = "MISSED" if rng.random() < 0.6 else "UNCONFIRMED"

            events.append({
                "patient_id": patient_id,
                "scheduled_at": scheduled_dt,
                "hour": hour,
                "day_of_week": scheduled_dt.weekday(),
                "status": status,
                "is_unconfirmed": is_unconfirmed,
                "delay_minutes": actual_delay,
            })

    return events


def extract_features_and_labels(events: List[Dict[str, Any]]) -> pd.DataFrame:
    """
    Computes rolling lag features strictly prior to each scheduled dose to avoid data leakage:
    - rolling_miss_rate_14d: fraction of unconfirmed doses in prior 14 days
    - rolling_avg_delay_14d: average confirmation delay in prior 14 days
    - tod_miss_rate: historical miss rate for this specific hour of the day
    - recent_trend_delta: adherence in last 3 days minus adherence in prior 11 days
    - consecutive_misses_prior: consecutive unconfirmed doses immediately preceding this dose
    """
    df = pd.DataFrame(events).sort_values("scheduled_at").reset_index(drop=True)
    
    rows = []
    for i in range(len(df)):
        current_time = df.loc[i, "scheduled_at"]
        hour = df.loc[i, "hour"]
        dow = df.loc[i, "day_of_week"]
        target = df.loc[i, "is_unconfirmed"]

        # Historical window strictly prior to current dose
        history = df.iloc[:i]
        prior_14d = history[history["scheduled_at"] >= (current_time - timedelta(days=14))]

        if len(prior_14d) < 4:
            # Not enough history to train reliable features
            continue

        rolling_miss_rate_14d = prior_14d["is_unconfirmed"].mean()
        rolling_avg_delay_14d = prior_14d[prior_14d["is_unconfirmed"] == 0]["delay_minutes"].mean()
        if pd.isna(rolling_avg_delay_14d):
            rolling_avg_delay_14d = 0.0

        # Time-of-day miss rate
        tod_history = prior_14d[prior_14d["hour"] == hour]
        tod_miss_rate = tod_history["is_unconfirmed"].mean() if len(tod_history) > 0 else rolling_miss_rate_14d

        # Recent trend (last 3 days vs prior 11 days)
        last_3d = history[history["scheduled_at"] >= (current_time - timedelta(days=3))]
        prior_11d = history[
            (history["scheduled_at"] < (current_time - timedelta(days=3)))
            & (history["scheduled_at"] >= (current_time - timedelta(days=14)))
        ]

        rate_3d = (1.0 - last_3d["is_unconfirmed"].mean()) if len(last_3d) > 0 else 0.8
        rate_11d = (1.0 - prior_11d["is_unconfirmed"].mean()) if len(prior_11d) > 0 else rate_3d
        trend_delta = rate_3d - rate_11d  # Negative = deteriorating

        # Consecutive misses immediately preceding
        consecutive_misses = 0
        for k in range(i - 1, max(-1, i - 10), -1):
            if df.loc[k, "is_unconfirmed"] == 1:
                consecutive_misses += 1
            else:
                break

        rows.append({
            "patient_id": df.loc[i, "patient_id"],
            "scheduled_hour": hour,
            "day_of_week": dow,
            "is_evening": 1 if hour >= 18 else 0,
            "rolling_miss_rate_14d": round(rolling_miss_rate_14d, 4),
            "rolling_avg_delay_14d": round(rolling_avg_delay_14d, 2),
            "tod_miss_rate": round(tod_miss_rate, 4),
            "trend_delta": round(trend_delta, 4),
            "consecutive_misses_prior": consecutive_misses,
            "target_unconfirmed": target,
        })

    return pd.DataFrame(rows)


def build_synthetic_cohort(num_patients_per_profile: int = 15, days: int = 45) -> pd.DataFrame:
    profiles = ["high_adherence", "evening_friction", "deteriorating", "chronic_delays"]
    start_date = datetime(2026, 8, 1, 0, 0, 0)
    all_events: List[Dict[str, Any]] = []

    seed_counter = 100
    for profile in profiles:
        for idx in range(num_patients_per_profile):
            pid = f"patient-{profile[:4]}-{idx+1:02d}"
            events = generate_patient_history(pid, profile, start_date, days=days, seed=seed_counter)
            all_events.extend(events)
            seed_counter += 1

    return extract_features_and_labels(all_events)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic adherence dataset for NexPill ML")
    parser.add_argument("--output", type=str, default="ml/adherence_dataset.csv", help="Output CSV path")
    parser.add_argument("--patients", type=int, default=15, help="Patients per profile category")
    parser.add_argument("--days", type=int, default=45, help="Simulation duration in days")
    args = parser.parse_args()

    df = build_synthetic_cohort(num_patients_per_profile=args.patients, days=args.days)
    df.to_csv(args.output, index=False)
    print(f"Generated {len(df)} feature rows saved to {args.output}")
    print(f"Target distribution (0=confirmed, 1=unconfirmed):\n{df['target_unconfirmed'].value_counts(normalize=True)}")
