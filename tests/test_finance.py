"""Finance pack: kernel helpers against hand-computed values, and reference answers on the real data."""

import numpy as np
import pandas as pd
import pytest
from conftest import DATA, make_service

from proven.evals import compute_references, load_questions
from proven.kit.finance import (
    annualized_return, annualized_volatility, cagr, capm, growth_rate, hp_filter, max_drawdown, ols, sharpe_ratio, to_returns,
)
from proven.testing import ScriptedChat

requires_finance_data = pytest.mark.skipif(not (DATA / "finance" / "capm_monthly.csv").exists(),
                                           reason="finance data not downloaded (python scripts/fetch_datasets.py --pack finance)")


def test_returns_and_annualization():
    assert to_returns([100, 110, 99]).round(4).tolist() == [0.1, -0.1]
    assert to_returns([100, 110], kind="log").iloc[0] == pytest.approx(np.log(1.1))
    r = pd.Series([0.01] * 12)
    assert annualized_return(r, 12) == pytest.approx(1.01**12 - 1)
    assert annualized_return(r, 12, method="arithmetic") == pytest.approx(0.12)
    assert annualized_volatility([0.01, -0.01, 0.01, -0.01], 12) == pytest.approx(np.std([0.01, -0.01, 0.01, -0.01], ddof=1) * np.sqrt(12))
    assert cagr(100, 200, 10) == pytest.approx(2 ** 0.1 - 1)
    # quarterly growth of 1% is about 4.06% at an annual rate
    assert growth_rate([100, 101], 1, annualize=4).iloc[1] == pytest.approx((1.01**4 - 1) * 100)


def test_sharpe_does_not_subtract_rf_twice():
    excess = pd.Series([1.0, 2.0, 0.0, 1.0])
    rf = pd.Series([0.5] * 4)
    assert sharpe_ratio(excess, 12, already_excess=True) == pytest.approx(excess.mean() / excess.std() * np.sqrt(12))
    raw = excess + rf  # the same asset in raw returns gives the same Sharpe ratio once rf is subtracted
    assert sharpe_ratio(raw, 12, rf=rf) == pytest.approx(sharpe_ratio(excess, 12, already_excess=True))


def test_max_drawdown():
    s = pd.Series([100, 120, 60, 90, 130], index=list("abcde"))
    dd = max_drawdown(s)
    assert dd == {"max_drawdown": pytest.approx(-0.5), "peak": "b", "trough": "c", "recovered": "e"}
    assert max_drawdown(pd.Series([0.2, -0.5]), from_returns=True)["max_drawdown"] == pytest.approx(-0.5)


def test_ols_matches_closed_form_and_capm():
    rng = np.random.default_rng(0)
    x = rng.normal(size=200)
    y = 0.5 + 2.0 * x + rng.normal(scale=0.5, size=200)
    res = ols(pd.DataFrame({"y": y, "x": x}), "y", "x")
    slope, intercept = np.polyfit(x, y, 1)
    assert res.table.loc["x", "coef"] == pytest.approx(slope) and res.table.loc["const", "coef"] == pytest.approx(intercept)
    assert res.r2 == pytest.approx(np.corrcoef(x, y)[0, 1] ** 2) and res.n == 200
    se = res.table.loc["x", "se"]
    assert se == pytest.approx(np.sqrt(np.sum((y - intercept - slope * x) ** 2) / 198 / np.sum((x - x.mean()) ** 2)))
    assert ols(pd.DataFrame({"y": y, "x": x}), "y", "x", robust=True).table.loc["x", "se"] != pytest.approx(se, rel=1e-6)
    c = capm(y, x, periods_per_year=12)
    assert c["beta"] == pytest.approx(slope) and c["alpha_annual"] == pytest.approx(intercept * 12)


def test_hp_filter_keeps_a_linear_trend():
    trend, cycle = hp_filter(pd.Series(np.arange(40, dtype=float)), lamb=1600)
    assert np.allclose(trend, np.arange(40)) and np.allclose(cycle, 0, atol=1e-8)


@requires_finance_data
async def test_reference_answers_on_real_data(settings):
    """Guards the eval answers (and so the data pins and the helpers) against silent changes."""
    svc = make_service(settings, ScriptedChat([]))
    try:
        pack = svc.packs["finance"]
        refs = await compute_references(svc, pack, load_questions(pack))
    finally:
        await svc.shutdown()
    expected = {"f01": [9.02], "f02": [1.23], "f03": [31.38], "f04": [55.68], "f05": [0.321], "f06": [0.783, 4.07],
                "f07": [7.85], "f08": [13.29], "f09": [-84.76], "f10": [-0.0682], "f11": [5.46], "f12": [0.0898], "f13": [30.81]}
    assert refs == expected


@requires_finance_data
def test_cleaned_data_fixes_known_source_problems():
    w = pd.read_csv(DATA / "finance" / "world_macro.csv")
    usa = w.query("code == 'USA'").set_index("year")
    # the datahub file names are swapped; the cleaned columns follow the World Bank indicator definitions
    assert usa.loc[2008, "inflation_cpi_pct"] == pytest.approx(3.84, abs=0.01)
    assert usa.loc[2008, "inflation_deflator_pct"] == pytest.approx(1.93, abs=0.01)
    assert set(w[w.is_aggregate].code) >= {"WLD", "EAS", "HIC"} and not w.query("code == 'CHN'").is_aggregate.any()
    m = pd.read_csv(DATA / "finance" / "us_macro_quarterly.csv")
    assert (m.quarter.iloc[0], m.quarter.iloc[-1], len(m)) == ("1950Q1", "2000Q4", 204)
