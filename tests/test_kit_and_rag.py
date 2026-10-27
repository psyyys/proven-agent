import numpy as np
import pandas as pd
from scipy import stats

from proven.kit.water import annual_maxima, cfs_to_mm_per_day, empirical_frequency, p3_design_values, p3_fit
from proven.packs import discover_packs
from proven.rag import KnowledgeBase
from proven.semantic import SemanticLayer


def test_p3_zero_skew_matches_normal():
    fit = p3_fit([90, 100, 110])
    assert abs(fit.cs) < 1e-9 and abs(fit.mean - 100) < 1e-9
    q100 = p3_design_values(fit, (100,)).design_value.iloc[0]
    assert abs(q100 - (100 + 10 * stats.norm.ppf(0.99))) < 1e-6


def test_p3_fixed_ratio_and_monotonic():
    fit = p3_fit(np.random.default_rng(0).gamma(4, 500, 40), cs_cv_ratio=3)
    assert abs(fit.cs - 3 * fit.cv) < 1e-9
    dv = p3_design_values(fit).design_value.to_numpy()
    assert np.all(np.diff(dv) > 0)


def test_annual_maxima_water_year():
    df = pd.DataFrame({"d": ["2018-06-04", "2018-12-16", "2019-03-01"], "q": [8360, 7220, 100]})
    am = annual_maxima(df, "d", "q", water_year_start_month=10)
    assert am.year.tolist() == [2018, 2019] and am.annual_max.tolist() == [8360, 7220]


def test_weibull_and_units():
    emp = empirical_frequency([3, 1, 2])
    assert emp.value.tolist() == [3, 2, 1] and emp.exceed_prob_pct.tolist() == [25, 50, 75]
    # 1 cfs over 1 km2 for a day = 2.4466 mm
    assert abs(cfs_to_mm_per_day([1], 1.0)[0] - 2.44658) < 1e-4


async def test_bm25_retrieval_finds_relevant_chunk(tmp_path):
    pack = discover_packs()["water"]
    kb = KnowledgeBase(tmp_path)
    chunks = await kb.add_files(pack.knowledge_files())
    assert chunks and all(c.id.startswith("D") for c in chunks)
    hits = await kb.search("偏态系数 Cs 取值 适线法")
    assert hits and "Cs" in hits[0].chunk.text
    assert hits[0].bm25_rank == 1 and hits[0].vector_rank is None


def test_semantic_lookup():
    layer = SemanticLayer.load([discover_packs()["business"].semantic_file])
    names = [e.name for e in layer.lookup("客单价怎么算", {"chinook"})]
    assert any(n.startswith("客单价") for n in names)
    assert "InvoiceLine.InvoiceId -> Invoice.InvoiceId" in layer.summary({"chinook"})
