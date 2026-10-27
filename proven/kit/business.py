"""Business / information-systems helpers: referential integrity checks and RFM segmentation."""

from __future__ import annotations

import pandas as pd

from .core import tables

__all__ = ["check_integrity", "rfm"]


def check_integrity(relationships: list[str], primary_keys: dict[str, str] | None = None) -> pd.DataFrame:
    """Data-quality report across loaded tables.

    relationships: ["InvoiceLine.InvoiceId -> Invoice.InvoiceId", ...]  (child.fk -> parent.pk)
    primary_keys:  {"Invoice": "InvoiceId", ...}
    Table names are matched case-insensitively against loaded tables.
    """
    lookup = {k.lower(): k for k in tables}

    def table(name: str) -> pd.DataFrame:
        key = lookup.get(name.lower())
        if key is None:
            raise KeyError(f"table {name} is not loaded")
        return tables[key]

    rows = []
    for t, pk in (primary_keys or {}).items():
        df = table(t)
        rows.append(
            {
                "check": "主键唯一",
                "target": f"{t}.{pk}",
                "violations": int(df[pk].duplicated().sum() + df[pk].isna().sum()),
                "total": len(df),
            }
        )
    for rel in relationships:
        child, parent = [s.strip() for s in rel.split("->")]
        ct, cc = child.split(".")
        pt, pc = parent.split(".")
        c, p = table(ct), table(pt)
        fk = c[cc].dropna()
        orphans = int((~fk.isin(set(p[pc]))).sum())
        rows.append({"check": "外键完整", "target": rel, "violations": orphans, "total": len(fk)})
        rows.append({"check": "外键缺失", "target": child, "violations": int(c[cc].isna().sum()), "total": len(c)})
    out = pd.DataFrame(rows)
    out["violation_rate_pct"] = (100 * out["violations"] / out["total"].where(out["total"] > 0)).round(2)
    return out


def rfm(df: pd.DataFrame, customer_col: str, date_col: str, amount_col: str, as_of=None, bins: int = 5) -> pd.DataFrame:
    """Recency / Frequency / Monetary scores (1-5, higher is better) and a coarse segment label."""
    d = df[[customer_col, date_col, amount_col]].copy()
    d[date_col] = pd.to_datetime(d[date_col])
    as_of = pd.to_datetime(as_of) if as_of is not None else d[date_col].max() + pd.Timedelta(days=1)
    g = d.groupby(customer_col).agg(
        last_purchase=(date_col, "max"), frequency=(date_col, "count"), monetary=(amount_col, "sum")
    )
    g["recency_days"] = (as_of - g["last_purchase"]).dt.days

    def score(s: pd.Series, ascending: bool) -> pd.Series:
        ranked = s.rank(method="first", ascending=ascending)
        return pd.qcut(ranked, q=min(bins, len(s)), labels=False) + 1

    g["R"] = score(g["recency_days"], ascending=False)
    g["F"] = score(g["frequency"], ascending=True)
    g["M"] = score(g["monetary"], ascending=True)

    def segment(r) -> str:
        if r.R >= 4 and r.F >= 4:
            return "高价值活跃"
        if r.R >= 4:
            return "新近客户"
        if r.F >= 4 or r.M >= 4:
            return "需唤回的高价值"
        return "一般 / 流失风险"

    g["segment"] = g.apply(segment, axis=1)
    return g.reset_index()
