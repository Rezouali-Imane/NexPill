# NexPill Machine Learning Adherence Pipeline

This module implements tabular adherence prediction and behavioral risk explainability for the NexPill medication ecosystem.

## Overview
NexPill uses historical medication events (scheduled doses, confirmations, delays, and reminder reactions) to estimate whether an upcoming dose is at risk of not being confirmed on time.

### Deliverables:
1. **Missed-Dose Prediction**: Binary classification estimating probability of an unconfirmed dose.
2. **Explainable Risk Reasons**: Identifies key contributing drivers (e.g. evening friction, recent deterioration, recurring confirmation latency).
3. **Model Comparison**: Baseline Logistic Regression compared with Random Forest.

> **Clinical Disclaimer**: Model outputs are observational risk probabilities intended for patient and caregiver follow-up support. They do not constitute a clinical diagnosis or authorize dosage modifications.

---

## Features
| Feature Name | Description |
| :--- | :--- |
| `scheduled_hour` | Scheduled hour of day (0–23) |
| `day_of_week` | Day of week (0=Monday, 6=Sunday) |
| `is_evening` | Binary indicator for evening doses (hour $\ge$ 18) |
| `rolling_miss_rate_14d` | Fraction of unconfirmed/missed doses in the prior 14 days |
| `rolling_avg_delay_14d` | Average confirmation delay in minutes over the prior 14 days |
| `tod_miss_rate` | Historical unconfirmed rate specifically for this time-of-day bucket |
| `trend_delta` | 3-day adherence rate minus prior 11-day rate (negative = deteriorating) |
| `consecutive_misses_prior`| Number of consecutive unconfirmed doses immediately preceding this dose |

---

## Usage

### 1. Install Dependencies
```bash
pip install -r ml/requirements.txt
```

### 2. Generate Synthetic Training Data
```bash
python ml/generate_dataset.py --patients 15 --days 45 --output ml/adherence_dataset.csv
```

### 3. Train & Compare Models
```bash
python ml/train_model.py --data ml/adherence_dataset.csv --output ml/adherence_predictor.joblib
```

### 4. Run Inference & Explainability
```bash
# Ahmed's evening dose demonstration
python ml/predict.py --demo-ahmed
```

### 5. Run Automated ML Tests
```bash
python ml/test_ml.py
```
