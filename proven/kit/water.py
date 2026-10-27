"""Hydrology helpers: annual maxima, Pearson type III (P-III) frequency analysis, unit conversion.

Conventions follow common Chinese practice (SL 44 style): moment estimates of mean / Cv / Cs,
Weibull plotting positions P = m / (n + 1), and design values Q_p = mean * (1 + Cv * Phi_p).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
import plotly.graph_objects as go
from scipy import stats

__all__ = [
    "annual_maxima",
    "P3Fit",
    "p3_fit",
    "p3_design_values",
    "empirical_frequency",
    "frequency_plot",
    "cfs_to_mm_per_day",
    "CFS_TO_M3S",
]

CFS_TO_M3S = 0.0283168466


def annual_maxima(df: pd.DataFrame, date_col: str, value_col: str, water_year_start_month: int = 1) -> pd.DataFrame:
    """Annual maximum series. water_year_start_month=10 uses the USGS water year (Oct-Sep, named by end year)."""
    d = df[[date_col, value_col]].dropna().copy()
    d[date_col] = pd.to_datetime(d[date_col])
    if water_year_start_month == 1:
        d["year"] = d[date_col].dt.year
    else:
        d["year"] = d[date_col].dt.year + (d[date_col].dt.month >= water_year_start_month).astype(int)
    idx = d.groupby("year")[value_col].idxmax()
    out = d.loc[idx, ["year", date_col, value_col]].rename(columns={value_col: "annual_max", date_col: "date"})
    return out.reset_index(drop=True)


@dataclass
class P3Fit:
    n: int
    mean: float
    cv: float
    cs: float
    method: str

    def __repr__(self) -> str:
        return f"P3Fit(n={self.n}, mean={self.mean:.2f}, Cv={self.cv:.3f}, Cs={self.cs:.3f}, Cs/Cv={self.cs / self.cv:.2f}, method={self.method})"


def p3_fit(x, cs_cv_ratio: float | None = None) -> P3Fit:
    """Moment estimates of P-III parameters.

    cs_cv_ratio: if given, Cs is fixed to ratio * Cv (the usual curve-fitting practice, e.g. 2.5-3.5 for
    floods) instead of the noisy sample skewness.
    """
    x = np.asarray(pd.Series(x).dropna(), dtype=float)
    n = len(x)
    if n < 3:
        raise ValueError("at least 3 values are needed")
    mean = x.mean()
    s = x.std(ddof=1)
    cv = s / mean
    if cs_cv_ratio is not None:
        cs, method = cs_cv_ratio * cv, f"moments, Cs={cs_cv_ratio}Cv"
    else:
        cs = n * np.sum((x - mean) ** 3) / ((n - 1) * (n - 2) * s**3)
        method = "moments"
    return P3Fit(n=n, mean=float(mean), cv=float(cv), cs=float(cs), method=method)


def p3_design_values(fit: P3Fit, return_periods=(2, 5, 10, 20, 50, 100, 200, 500, 1000)) -> pd.DataFrame:
    """Design values for return periods T (years): P = 1/T, Phi = standardized P-III quantile, Kp = 1 + Cv*Phi."""
    rows = []
    for T in return_periods:
        p = 1.0 / T
        phi = float(stats.pearson3.ppf(1 - p, fit.cs))
        kp = 1 + fit.cv * phi
        rows.append({"return_period_yr": T, "exceed_prob_pct": 100 * p, "phi": phi, "kp": kp, "design_value": fit.mean * kp})
    return pd.DataFrame(rows)


def empirical_frequency(x) -> pd.DataFrame:
    """Sorted sample with Weibull plotting positions P = m/(n+1)."""
    v = np.sort(np.asarray(pd.Series(x).dropna(), dtype=float))[::-1]
    m = np.arange(1, len(v) + 1)
    p = m / (len(v) + 1)
    return pd.DataFrame({"rank": m, "value": v, "exceed_prob_pct": 100 * p, "return_period_yr": 1 / p})


def frequency_plot(x, fit: P3Fit, title: str = "P-III 频率曲线", unit: str = "") -> go.Figure:
    """Empirical points and the fitted curve on a normal-probability x axis (like Hazen probability paper)."""
    emp = empirical_frequency(x)
    probs = np.array([0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 50, 70, 80, 90, 95, 99])
    curve_p = np.linspace(0.05, 99.5, 300)
    curve = fit.mean * (1 + fit.cv * stats.pearson3.ppf(1 - curve_p / 100, fit.cs))
    z = lambda p: stats.norm.ppf(np.asarray(p) / 100)  # noqa: E731
    fig = go.Figure()
    fig.add_trace(go.Scatter(x=z(emp["exceed_prob_pct"]), y=emp["value"], mode="markers", name="实测点据（Weibull）"))
    fig.add_trace(go.Scatter(x=z(curve_p), y=curve, mode="lines", name=f"P-III（Cv={fit.cv:.2f}, Cs={fit.cs:.2f}）"))
    fig.update_layout(
        title=title,
        xaxis=dict(title="频率 P (%)", tickvals=z(probs), ticktext=[f"{p:g}" for p in probs]),
        yaxis=dict(title=f"数值{f' ({unit})' if unit else ''}"),
        template="plotly_white",
    )
    return fig


def cfs_to_mm_per_day(q_cfs, area_km2: float):
    """Convert discharge in cubic feet per second to runoff depth in mm/day over the basin area."""
    return np.asarray(q_cfs, dtype=float) * CFS_TO_M3S * 86400 / (area_km2 * 1e6) * 1000
