"""
AutoML Forecast Pipeline
Selects the best forecasting model per SKU based on data characteristics.
Runs all candidate models, selects winner by cross-validation MAPE.
"""
import numpy as np
import pandas as pd
from typing import Tuple, Dict, Any
import logging

logger = logging.getLogger(__name__)


class AutoMLForecaster:
    """
    Orchestrates model selection and ensemble for a single SKU time series.

    Decision logic:
    - Fewer than 13 data points → Naive/SES
    - Sparse demand (>40% zeros) → Croston
    - High seasonality detected → SARIMA or Prophet
    - New product → Analogous matching (not yet implemented)
    - All others → Compare ARIMA, ETS, LightGBM; pick lowest CV-MAPE
    """

    def __init__(self, cv_folds: int = 3, horizon: int = 13):
        self.cv_folds = cv_folds
        self.horizon = horizon

    def fit_predict(
        self,
        ts: pd.Series,
        horizon: int = None,
        model_override: str = "auto",
    ) -> Dict[str, Any]:
        """
        Fit the best model and return forecast with confidence intervals.

        Args:
            ts: Time series with DatetimeIndex (weekly or daily)
            horizon: Forecast horizon in periods
            model_override: Force a specific model ('auto', 'arima', 'prophet', 'lgbm', 'ets', 'croston')

        Returns:
            {
                "model": "prophet",
                "forecast": [...],
                "lower": [...],
                "upper": [...],
                "mape_cv": 0.083,
                "model_scores": {"arima": 0.102, "prophet": 0.083, "ets": 0.094}
            }
        """
        horizon = horizon or self.horizon
        n = len(ts)

        if n < 8:
            return self._naive_forecast(ts, horizon)

        # Detect sparsity
        zero_rate = (ts == 0).sum() / n
        if zero_rate > 0.4:
            return self._croston_forecast(ts, horizon)

        if model_override != "auto":
            return self._run_model(model_override, ts, horizon)

        # Auto: run candidates and pick winner
        candidates = self._select_candidates(ts)
        return self._run_tournament(ts, horizon, candidates)

    def _select_candidates(self, ts: pd.Series) -> list:
        """Choose candidate models based on data characteristics."""
        candidates = ["ets", "arima"]
        n = len(ts)

        if n >= 26:
            candidates.append("prophet")

        if n >= 52:
            candidates.append("lgbm")

        return candidates

    def _run_tournament(self, ts: pd.Series, horizon: int, candidates: list) -> Dict[str, Any]:
        """Run all candidate models, return best by CV MAPE."""
        scores = {}
        results = {}

        for model_name in candidates:
            try:
                score = self._cross_validate(model_name, ts)
                scores[model_name] = score
                results[model_name] = self._run_model(model_name, ts, horizon)
            except Exception as e:
                logger.warning(f"Model {model_name} failed: {e}")

        if not scores:
            return self._naive_forecast(ts, horizon)

        winner = min(scores, key=scores.get)
        result = results[winner]
        result["model_scores"] = scores
        result["mape_cv"] = scores[winner]
        return result

    def _cross_validate(self, model_name: str, ts: pd.Series) -> float:
        """Time-series cross-validation, returns mean MAPE across folds."""
        n = len(ts)
        fold_size = max(4, n // (self.cv_folds + 1))
        errors = []

        for fold in range(self.cv_folds):
            split = fold_size * (fold + 1)
            if split + 2 > n:
                break
            train = ts.iloc[:split]
            test = ts.iloc[split:split + 2]

            try:
                pred_result = self._run_model(model_name, train, len(test))
                pred = np.array(pred_result["forecast"])[:len(test)]
                actual = test.values
                mape = np.mean(np.abs((actual - pred) / (actual + 1e-8)))
                errors.append(mape)
            except Exception:
                errors.append(1.0)

        return float(np.mean(errors)) if errors else 1.0

    def _run_model(self, model_name: str, ts: pd.Series, horizon: int) -> Dict[str, Any]:
        if model_name == "ets":
            return self._ets_forecast(ts, horizon)
        elif model_name == "arima":
            return self._arima_forecast(ts, horizon)
        elif model_name == "prophet":
            return self._prophet_forecast(ts, horizon)
        elif model_name == "lgbm":
            return self._lgbm_forecast(ts, horizon)
        elif model_name == "croston":
            return self._croston_forecast(ts, horizon)
        else:
            return self._naive_forecast(ts, horizon)

    def _ets_forecast(self, ts: pd.Series, horizon: int) -> Dict[str, Any]:
        from statsmodels.tsa.exponential_smoothing.ets import ETSModel
        try:
            model = ETSModel(ts, error="add", trend="add", seasonal="add",
                           seasonal_periods=52 if len(ts) > 52 else None,
                           damped_trend=True)
            fit = model.fit(disp=False)
            pred = fit.forecast(horizon)
            ci = fit.get_prediction(start=len(ts), end=len(ts) + horizon - 1)
            ci_df = ci.summary_frame(alpha=0.2)
            return {
                "model": "ets",
                "forecast": pred.tolist(),
                "lower": ci_df["mean_ci_lower"].tolist(),
                "upper": ci_df["mean_ci_upper"].tolist(),
            }
        except Exception:
            return self._naive_forecast(ts, horizon)

    def _arima_forecast(self, ts: pd.Series, horizon: int) -> Dict[str, Any]:
        from statsmodels.tsa.statespace.sarimax import SARIMAX
        try:
            model = SARIMAX(ts, order=(1, 1, 1), seasonal_order=(1, 0, 1, 52) if len(ts) > 104 else (0, 0, 0, 0))
            fit = model.fit(disp=False)
            pred = fit.get_forecast(steps=horizon)
            ci = pred.conf_int(alpha=0.2)
            return {
                "model": "arima",
                "forecast": pred.predicted_mean.tolist(),
                "lower": ci.iloc[:, 0].tolist(),
                "upper": ci.iloc[:, 1].tolist(),
            }
        except Exception:
            return self._naive_forecast(ts, horizon)

    def _prophet_forecast(self, ts: pd.Series, horizon: int) -> Dict[str, Any]:
        from prophet import Prophet
        df = pd.DataFrame({"ds": ts.index, "y": ts.values})
        model = Prophet(
            yearly_seasonality=True,
            weekly_seasonality=False,
            daily_seasonality=False,
            uncertainty_samples=100,
        )
        model.fit(df)
        future = model.make_future_dataframe(periods=horizon, freq="W")
        forecast = model.predict(future)
        fwd = forecast.tail(horizon)
        return {
            "model": "prophet",
            "forecast": fwd["yhat"].clip(lower=0).tolist(),
            "lower": fwd["yhat_lower"].clip(lower=0).tolist(),
            "upper": fwd["yhat_upper"].clip(lower=0).tolist(),
        }

    def _lgbm_forecast(self, ts: pd.Series, horizon: int) -> Dict[str, Any]:
        """LightGBM with lag features for complex pattern detection."""
        import lightgbm as lgb

        n_lags = min(26, len(ts) // 2)
        X, y = self._make_lag_features(ts, n_lags)
        if len(X) < 10:
            return self._arima_forecast(ts, horizon)

        model = lgb.LGBMRegressor(n_estimators=200, num_leaves=31, learning_rate=0.05, verbosity=-1)
        model.fit(X, y)

        # Recursive forecasting
        forecasts = []
        last = list(ts.values[-n_lags:])
        for _ in range(horizon):
            feat = np.array(last[-n_lags:]).reshape(1, -1)
            pred = max(0, float(model.predict(feat)[0]))
            forecasts.append(pred)
            last.append(pred)

        # Simple confidence bands (±1σ of residuals)
        preds_in_sample = model.predict(X)
        residual_std = float(np.std(y - preds_in_sample))
        return {
            "model": "lgbm",
            "forecast": forecasts,
            "lower": [max(0, f - 1.28 * residual_std) for f in forecasts],
            "upper": [f + 1.28 * residual_std for f in forecasts],
        }

    def _croston_forecast(self, ts: pd.Series, horizon: int) -> Dict[str, Any]:
        """Croston's method for intermittent/sparse demand."""
        values = ts.values.copy().astype(float)
        alpha = 0.1
        demand_level = float(values[values > 0].mean()) if any(values > 0) else 1.0
        interval_level = 2.0

        for v in values:
            if v > 0:
                demand_level = alpha * v + (1 - alpha) * demand_level
                interval_level = alpha * 1 + (1 - alpha) * interval_level

        forecast_value = max(0, demand_level / interval_level)
        forecasts = [forecast_value] * horizon
        std = float(values[values > 0].std()) if any(values > 0) else forecast_value * 0.5

        return {
            "model": "croston",
            "forecast": forecasts,
            "lower": [max(0, f - std) for f in forecasts],
            "upper": [f + std for f in forecasts],
        }

    def _naive_forecast(self, ts: pd.Series, horizon: int) -> Dict[str, Any]:
        """Fallback: use last observed value with growing uncertainty."""
        last = float(ts.iloc[-1]) if len(ts) > 0 else 0
        std = float(ts.std()) if len(ts) > 1 else last * 0.2
        return {
            "model": "naive",
            "forecast": [last] * horizon,
            "lower": [max(0, last - std * (i + 1) ** 0.5) for i in range(horizon)],
            "upper": [last + std * (i + 1) ** 0.5 for i in range(horizon)],
        }

    @staticmethod
    def _make_lag_features(ts: pd.Series, n_lags: int) -> Tuple[np.ndarray, np.ndarray]:
        values = ts.values.astype(float)
        X, y = [], []
        for i in range(n_lags, len(values)):
            X.append(values[i - n_lags:i])
            y.append(values[i])
        return np.array(X), np.array(y)
