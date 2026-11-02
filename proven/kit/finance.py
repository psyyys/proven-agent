"""Finance and economics helpers preloaded into the kernel for the finance pack.

Conventions:
- Returns are fractions (1% is 0.01) unless a function says otherwise. Data that comes in percent
  (capm_monthly, us_macro_quarterly) must be divided by 100 first; scale-free statistics such as the
  Sharpe ratio, t-statistics and correlations do not depend on it.
- periods_per_year: 12 for monthly, 4 for quarterly, 252 for daily trading data.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy import stats


def to_returns(prices, kind: str = "simple") -> pd.Series:
    """Period returns from a price or index series: simple (P_t / P_{t-1} - 1) or log (ln P_t - ln P_{t-1})."""
    p = pd.Series(prices, dtype=float)
    r = np.log(p).diff() if kind == "log" else p.pct_change()
    return r.dropna()


def annualized_return(returns, periods_per_year: int, method: str = "geometric") -> float:
    """Geometric: (prod(1 + r))^(periods_per_year / n) - 1, the compound growth rate.
    Arithmetic: mean(r) * periods_per_year, which overstates the compound rate when returns vary."""
    r = pd.Series(returns, dtype=float).dropna()
    if method == "arithmetic":
        return float(r.mean() * periods_per_year)
    return float((1 + r).prod() ** (periods_per_year / len(r)) - 1)


def annualized_volatility(returns, periods_per_year: int) -> float:
    """Sample standard deviation of period returns times sqrt(periods_per_year)."""
    return float(pd.Series(returns, dtype=float).dropna().std(ddof=1) * np.sqrt(periods_per_year))


def sharpe_ratio(returns, periods_per_year: int, rf=0.0, already_excess: bool = False) -> float:
    """Annualized Sharpe ratio = mean(r - rf) / std(r - rf) * sqrt(periods_per_year).

    rf is the risk-free return per period, in the same units as returns (a number or a series).
    Pass already_excess=True for returns that are already in excess of the risk-free rate
    (e.g. rfood, rdur, rcon, rmrf in capm_monthly): subtracting rf again would be wrong."""
    r = pd.Series(returns, dtype=float)
    ex = r if already_excess else r - (rf if np.isscalar(rf) else pd.Series(rf, dtype=float).values)
    ex = ex.dropna()
    return float(ex.mean() / ex.std(ddof=1) * np.sqrt(periods_per_year))


def max_drawdown(values, from_returns: bool = False) -> dict:
    """Largest peak-to-trough fall of a value series (or of the wealth path of a return series).
    Returns {"max_drawdown": negative fraction, "peak": label, "trough": label, "recovered": label or None}."""
    v = pd.Series(values, dtype=float).dropna()
    if from_returns:
        v = (1 + v).cumprod()
    running_max = v.cummax()
    dd = v / running_max - 1
    trough = dd.idxmin()
    peak = v.loc[:trough].idxmax()
    after = v.loc[trough:]
    rec = after[after >= v.loc[peak]]
    return {"max_drawdown": float(dd.min()), "peak": peak, "trough": trough, "recovered": rec.index[0] if len(rec) else None}


def cagr(start_value: float, end_value: float, years: float) -> float:
    """Compound annual growth rate: (end / start)^(1 / years) - 1."""
    return float((end_value / start_value) ** (1 / years) - 1)


def growth_rate(series, periods: int = 1, annualize: int | None = None) -> pd.Series:
    """Percent growth over `periods` observations; with annualize=4 a quarterly growth rate g becomes
    ((1 + g)^4 - 1), the usual way to quote quarterly GDP growth at an annual rate. Returns percent."""
    g = pd.Series(series, dtype=float).pct_change(periods)
    if annualize:
        g = (1 + g) ** (annualize / periods) - 1
    return g * 100


def deflate(nominal, price_index, base_value: float | None = None) -> pd.Series:
    """Real values in prices of the base period: nominal / price_index * base_value
    (base_value defaults to the last index value)."""
    n, p = pd.Series(nominal, dtype=float), pd.Series(price_index, dtype=float)
    base = float(p.dropna().iloc[-1]) if base_value is None else base_value
    return n / p * base


@dataclass
class OLSResult:
    table: pd.DataFrame  # coef, se, t, p for each regressor
    r2: float
    adj_r2: float
    n: int
    robust: bool

    def __repr__(self) -> str:
        se = "HC1 稳健标准误" if self.robust else "普通标准误"
        return f"OLS（n={self.n}，R²={self.r2:.4f}，调整 R²={self.adj_r2:.4f}，{se}）\n{self.table.round(4).to_string()}"

    def _repr_html_(self) -> str:
        return f"<pre>{self.__repr__()}</pre>"


def ols(df: pd.DataFrame, y: str, x: list[str] | str, add_const: bool = True, robust: bool = False) -> OLSResult:
    """Ordinary least squares of df[y] on df[x], dropping rows with missing values.
    robust=True uses heteroskedasticity-robust (HC1) standard errors. p-values are two-sided."""
    xs = [x] if isinstance(x, str) else list(x)
    d = df[[y, *xs]].astype(float).dropna()
    X = d[xs].to_numpy()
    if add_const:
        X = np.column_stack([np.ones(len(d)), X])
    names = (["const"] if add_const else []) + xs
    Y = d[y].to_numpy()
    n, k = X.shape
    XtX_inv = np.linalg.inv(X.T @ X)
    beta = XtX_inv @ X.T @ Y
    resid = Y - X @ beta
    if robust:
        meat = X.T @ (X * resid[:, None] ** 2)
        cov = XtX_inv @ meat @ XtX_inv * n / (n - k)
    else:
        cov = XtX_inv * (resid @ resid) / (n - k)
    se = np.sqrt(np.diag(cov))
    t = beta / se
    p = 2 * stats.t.sf(np.abs(t), df=n - k)
    tss = ((Y - Y.mean()) ** 2).sum() if add_const else (Y**2).sum()
    r2 = 1 - (resid @ resid) / tss
    adj = 1 - (1 - r2) * (n - 1) / (n - k)
    table = pd.DataFrame({"coef": beta, "se": se, "t": t, "p": p}, index=names)
    return OLSResult(table, float(r2), float(adj), int(n), robust)


def capm(asset_excess, market_excess, periods_per_year: int = 12) -> dict:
    """Regress asset excess returns on market excess returns: r_i - r_f = alpha + beta (r_m - r_f) + e.
    Returns alpha (per period and annualized as alpha * periods_per_year, in the input's units), beta,
    their t-statistics and p-values, R² and n."""
    d = pd.DataFrame({"y": pd.Series(asset_excess, dtype=float).values, "m": pd.Series(market_excess, dtype=float).values})
    res = ols(d, "y", "m")
    a, b = res.table.loc["const"], res.table.loc["m"]
    return {
        "alpha": float(a.coef), "alpha_annual": float(a.coef * periods_per_year), "alpha_t": float(a.t), "alpha_p": float(a.p),
        "beta": float(b.coef), "beta_t": float(b.t), "beta_p": float(b.p), "r2": res.r2, "n": res.n,
    }


def hp_filter(series, lamb: float = 1600) -> tuple[pd.Series, pd.Series]:
    """Hodrick-Prescott filter: returns (trend, cycle). lamb = 1600 for quarterly, 129600 monthly, 100 or 6.25 annual.
    Applied to log GDP, cycle * 100 approximates the output gap in percent."""
    y = pd.Series(series, dtype=float)
    n = len(y)
    D = np.zeros((n - 2, n))
    for i in range(n - 2):
        D[i, i : i + 3] = [1, -2, 1]
    trend = np.linalg.solve(np.eye(n) + lamb * D.T @ D, y.to_numpy())
    trend = pd.Series(trend, index=y.index)
    return trend, y - trend


def mean_return_ttest(returns) -> dict:
    """Is the average return different from zero? One-sample t-test (two-sided)."""
    r = pd.Series(returns, dtype=float).dropna()
    t, p = stats.ttest_1samp(r, 0.0)
    return {"mean": float(r.mean()), "t": float(t), "p": float(p), "n": int(len(r))}
