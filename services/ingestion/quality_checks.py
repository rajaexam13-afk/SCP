"""
Data quality checks run post-mapping, pre-load.
Returns a list of quality issues with severity and affected row counts.
"""
import pandas as pd
import numpy as np
from typing import List, Dict


def run_quality_checks(df: pd.DataFrame) -> List[Dict]:
    """Run all quality checks and return list of issues."""
    issues = []

    issues += _check_missing_values(df)
    issues += _check_negative_values(df)
    issues += _check_date_continuity(df)
    issues += _check_duplicates(df)
    issues += _check_outliers(df)
    issues += _check_future_dates(df)

    return issues


def _check_missing_values(df: pd.DataFrame) -> List[Dict]:
    issues = []
    for col in ["sku_id", "period", "value", "location_id"]:
        if col not in df.columns:
            continue
        null_count = df[col].isna().sum()
        if null_count > 0:
            pct = null_count / len(df) * 100
            issues.append({
                "check": "missing_values",
                "column": col,
                "status": "warn" if pct < 5 else "fail",
                "affected_rows": int(null_count),
                "message": f"{pct:.1f}% null values in '{col}'",
            })
    return issues


def _check_negative_values(df: pd.DataFrame) -> List[Dict]:
    if "value" not in df.columns:
        return []
    vals = pd.to_numeric(df["value"], errors="coerce")
    neg_count = (vals < 0).sum()
    if neg_count > 0:
        return [{
            "check": "negative_values",
            "status": "fail" if neg_count > 10 else "warn",
            "affected_rows": int(neg_count),
            "message": f"{neg_count} rows have negative sales values",
        }]
    return []


def _check_date_continuity(df: pd.DataFrame) -> List[Dict]:
    if "period" not in df.columns:
        return []
    try:
        dates = pd.to_datetime(df["period"]).sort_values()
        date_range = pd.date_range(dates.min(), dates.max(), freq="W")
        actual_dates = set(dates.dt.to_period("W").unique())
        expected_dates = set(date_range.to_period("W"))
        gaps = expected_dates - actual_dates
        if gaps:
            return [{
                "check": "date_continuity",
                "status": "warn",
                "affected_rows": len(gaps),
                "message": f"{len(gaps)} missing weeks in time series",
            }]
    except Exception:
        pass
    return []


def _check_duplicates(df: pd.DataFrame) -> List[Dict]:
    key_cols = [c for c in ["sku_id", "location_id", "period"] if c in df.columns]
    if not key_cols:
        return []
    dups = df.duplicated(subset=key_cols, keep=False).sum()
    if dups > 0:
        return [{
            "check": "duplicates",
            "status": "warn",
            "affected_rows": int(dups),
            "message": f"{dups} duplicate SKU+location+date combinations",
        }]
    return []


def _check_outliers(df: pd.DataFrame) -> List[Dict]:
    if "value" not in df.columns:
        return []
    vals = pd.to_numeric(df["value"], errors="coerce").dropna()
    if len(vals) < 10:
        return []
    mean, std = vals.mean(), vals.std()
    outliers = ((vals - mean).abs() > 3 * std).sum()
    if outliers > 0:
        return [{
            "check": "outliers_3sigma",
            "status": "warn",
            "affected_rows": int(outliers),
            "message": f"{outliers} data points exceed 3 standard deviations",
        }]
    return []


def _check_future_dates(df: pd.DataFrame) -> List[Dict]:
    if "period" not in df.columns:
        return []
    try:
        dates = pd.to_datetime(df["period"], errors="coerce")
        future = (dates > pd.Timestamp.now()).sum()
        if future > 0:
            return [{
                "check": "future_dates",
                "status": "warn",
                "affected_rows": int(future),
                "message": f"{future} rows have future dates (are these actuals?)",
            }]
    except Exception:
        pass
    return []
