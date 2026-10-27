"""Core kernel helpers: table loading, SQL over loaded tables, and data profiling."""

from __future__ import annotations

import json
import re
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

tables: dict[str, pd.DataFrame] = {}
con = duckdb.connect()


def _safe_name(name: str) -> str:
    name = re.sub(r"\W+", "_", Path(name).stem).strip("_")
    return name if name and not name[0].isdigit() else f"t_{name}"


def load_table(path: str, name: str | None = None, **read_kwargs) -> str:
    """Load a CSV / Excel / Parquet / JSON file as a pandas DataFrame and register it for SQL."""
    p = Path(path)
    suffix = p.suffix.lower()
    if suffix in (".csv", ".txt", ".tsv"):
        sep = "\t" if suffix == ".tsv" else read_kwargs.pop("sep", None)
        engine = "python" if sep is None else "c"
        if "dtype" not in read_kwargs:
            # Codes with leading zeros (station IDs, zip codes) must stay strings: "01022500" != 1022500.
            head = pd.read_csv(p, sep=sep, engine=engine, dtype=str, nrows=500)
            codes = {c: str for c in head.columns if head[c].dropna().str.fullmatch(r"0\d+").any()}
            if codes:
                read_kwargs["dtype"] = codes
        df = pd.read_csv(p, sep=sep, engine=engine, **read_kwargs)
    elif suffix in (".xlsx", ".xls"):
        df = pd.read_excel(p, **read_kwargs)
    elif suffix == ".parquet":
        df = pd.read_parquet(p, **read_kwargs)
    elif suffix == ".json":
        df = pd.read_json(p, **read_kwargs)
    else:
        raise ValueError(f"unsupported file type: {suffix}")
    name = name or _safe_name(p.name)
    tables[name] = df
    con.register(name, df)
    _publish(name, df)
    return name


def _publish(name: str, value) -> None:
    """Expose a variable in the interactive namespace (the kernel), not just this module."""
    try:
        from IPython import get_ipython

        ip = get_ipython()
    except ImportError:
        ip = None
    if ip is not None:
        ip.user_ns[name] = value
    else:
        globals()[name] = value


def sql(query: str) -> pd.DataFrame:
    """Run SQL (DuckDB dialect) over all loaded tables; returns a DataFrame."""
    for name, df in tables.items():
        con.register(name, df)
    return con.execute(query).df()


def _jsonable(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return round(float(v), 6)
    if isinstance(v, (pd.Timestamp,)):
        return v.isoformat()
    return v if isinstance(v, (int, float, str, bool)) else str(v)


def profile(name: str, sample_rows: int = 3) -> dict:
    df = tables[name]
    cols = []
    for c in df.columns:
        s = df[c]
        info = {
            "name": str(c),
            "dtype": str(s.dtype),
            "nulls": int(s.isna().sum()),
            "unique": int(s.nunique(dropna=True)),
        }
        if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
            desc = s.describe()
            info.update({k: _jsonable(desc.get(k)) for k in ("min", "mean", "max")})
        else:
            top = s.dropna().astype(str).value_counts().head(3)
            info["top"] = [str(x)[:40] for x in top.index]
        cols.append(info)
    # Row by row: DataFrame.map skips missing values in pandas string columns, leaving NaN (invalid JSON).
    sample = [{str(k): _jsonable(v) for k, v in row.items()} for row in df.head(sample_rows).to_dict(orient="records")]
    return {"name": name, "rows": int(len(df)), "columns": cols, "sample": sample}


def _profile_json(name: str) -> None:
    print(json.dumps(profile(name), ensure_ascii=False, default=str))


def _describe(value) -> str:
    if isinstance(value, pd.DataFrame):
        cols = ", ".join(map(str, value.columns[:8])) + (" …" if value.shape[1] > 8 else "")
        return f"DataFrame {value.shape[0]}×{value.shape[1]}（{cols}）"
    if isinstance(value, pd.Series):
        return f"Series 长度 {len(value)}" + (f"（{value.name}）" if value.name is not None else "")
    if isinstance(value, np.ndarray):
        return f"ndarray {value.shape}"
    if isinstance(value, (bool, int, float, np.integer, np.floating)):
        return f"{type(value).__name__} = {value!r}"[:60]
    if isinstance(value, str):
        return f"str = {value[:40]!r}"
    if isinstance(value, (list, tuple, dict, set)):
        return f"{type(value).__name__} 长度 {len(value)}"
    return type(value).__name__


def _user_variables(baseline: set[str], limit: int = 30) -> list[dict]:
    """Variables the analysis created, for handing over to the next analyst (multi mode)."""
    import inspect
    import types

    from IPython import get_ipython

    ns = get_ipython().user_ns
    out = []
    for name, value in ns.items():
        if name in baseline or name.startswith("_") or name in tables:
            continue
        if isinstance(value, types.ModuleType) or inspect.isfunction(value) or inspect.isclass(value):
            continue
        out.append({"name": name, "desc": _describe(value)})
    return out[-limit:]
