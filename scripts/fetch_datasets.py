"""Download the public demo datasets into ./data and convert them to tidy CSV files.

Sources (all public):
- Chinook sample database (MIT): https://github.com/lerocha/chinook-database
- CAMELS-US basin attributes and a 4-basin daily subset, as shipped in NeuralHydrology's test data:
  https://github.com/neuralhydrology/neuralhydrology  (CAMELS: Addor et al. 2017, Newman et al. 2015)
- USGS annual peak streamflow, site 01594440 (Patuxent River near Bowie, MD), from the test data of
  https://github.com/DOI-USGS/dataretrieval-python  (USGS data are public domain)

Usage:
    python scripts/fetch_datasets.py              # all packs
    python scripts/fetch_datasets.py --pack water
    python scripts/fetch_datasets.py --usgs-site 01646500   # also fetch a longer peak series directly from USGS
"""

from __future__ import annotations

import argparse
import io
import sqlite3
import sys
import tempfile
from pathlib import Path

import httpx
import pandas as pd

RAW = "https://raw.githubusercontent.com"
CHINOOK = f"{RAW}/lerocha/chinook-database/master/ChinookDatabase/DataSources/Chinook_Sqlite.sqlite"
NH = f"{RAW}/neuralhydrology/neuralhydrology/master/test/test_data/camels_us"
DR_PEAKS = f"{RAW}/DOI-USGS/dataretrieval-python/main/tests/data/waterservices_peaks.txt"
USGS_PEAK_URL = "https://nwis.waterdata.usgs.gov/nwis/peak?site_no={site}&agency_cd=USGS&format=rdb"
CAMELS_BASINS = ["01022500", "01547700", "02064000", "03015500"]
CAMELS_ATTR_FILES = ["camels_name", "camels_topo", "camels_clim", "camels_hydro", "camels_soil", "camels_vege", "camels_geol"]


def get(url: str) -> bytes:
    print(f"  ↓ {url}")
    r = httpx.get(url, timeout=60, follow_redirects=True)
    r.raise_for_status()
    return r.content


def fetch_business(out: Path) -> None:
    dest = out / "business" / "chinook"
    dest.mkdir(parents=True, exist_ok=True)
    # Write and close the file before SQLite opens it: Windows cannot reopen an open NamedTemporaryFile.
    with tempfile.TemporaryDirectory() as tmp:
        db_path = Path(tmp) / "chinook.sqlite"
        db_path.write_bytes(get(CHINOOK))
        con = sqlite3.connect(db_path)
        try:
            tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
            for t in tables:
                df = pd.read_sql_query(f'SELECT * FROM "{t}"', con)
                df.to_csv(dest / f"{t}.csv", index=False)
                print(f"  ✓ chinook/{t}.csv  {len(df)} 行")
        finally:
            con.close()  # must be closed before the temp directory is removed (Windows file locks)


def _read_rdb(text: str) -> pd.DataFrame:
    lines = [ln for ln in text.splitlines() if ln and not ln.startswith("#")]
    # line 0 = header, line 1 = column format spec (e.g. "5s 15s 10d"), rest = data
    return pd.read_csv(io.StringIO("\n".join([lines[0], *lines[2:]])), sep="\t", dtype=str)


def _peaks_to_csv(rdb: str, dest: Path) -> int:
    df = _read_rdb(rdb)
    out = pd.DataFrame(
        {
            "site_no": df["site_no"],
            "peak_date": df["peak_dt"],
            "peak_cfs": pd.to_numeric(df["peak_va"], errors="coerce"),
            "gage_height_ft": pd.to_numeric(df.get("gage_ht"), errors="coerce"),
            "peak_code": df.get("peak_cd", "").fillna(""),
        }
    )
    out.to_csv(dest, index=False)
    return len(out)


def fetch_water(out: Path, usgs_site: str | None) -> None:
    dest = out / "water"
    dest.mkdir(parents=True, exist_ok=True)

    # 1. CAMELS attributes for all 671 basins, joined into one table
    attrs = None
    for name in CAMELS_ATTR_FILES:
        df = pd.read_csv(io.BytesIO(get(f"{NH}/camels_attributes_v2.0/{name}.txt")), sep=";", dtype={"gauge_id": str})
        attrs = df if attrs is None else attrs.merge(df, on="gauge_id", how="outer", suffixes=("", f"_{name}"))
    attrs.to_csv(dest / "camels_attributes.csv", index=False)
    print(f"  ✓ water/camels_attributes.csv  {len(attrs)} 行 × {attrs.shape[1]} 列")

    # 2. Daily streamflow + Daymet basin-mean forcing for 4 basins
    frames = []
    for b in CAMELS_BASINS:
        q = pd.read_csv(
            io.BytesIO(get(f"{NH}/usgs_streamflow/{b}_streamflow_qc.txt")),
            sep=r"\s+", header=None, names=["gauge_id", "year", "month", "day", "q_cfs", "q_flag"], dtype={"gauge_id": str},
        )
        f = pd.read_csv(io.BytesIO(get(f"{NH}/basin_mean_forcing/daymet/{b}_lump_cida_forcing_leap.txt")), sep=r"\s+", skiprows=3)
        f = f.rename(columns={"Year": "year", "Mnth": "month", "Day": "day"})
        f = f.rename(columns=lambda c: {"prcp(mm/day)": "prcp_mm", "srad(w/m2)": "srad_wm2", "swe(mm)": "swe_mm",
                                        "tmax(c)": "tmax_c", "tmin(c)": "tmin_c", "vp(pa)": "vp_pa", "dayl(s)": "dayl_s"}.get(c.lower(), c))
        m = q.merge(f, on=["year", "month", "day"], how="left")
        m["date"] = pd.to_datetime(m[["year", "month", "day"]])
        m.loc[m["q_cfs"] < 0, "q_cfs"] = float("nan")  # CAMELS marks missing streamflow as -999
        frames.append(m[["gauge_id", "date", "q_cfs", "q_flag", "prcp_mm", "tmax_c", "tmin_c", "srad_wm2", "swe_mm", "vp_pa"]])
    daily = pd.concat(frames, ignore_index=True)
    daily.to_csv(dest / "camels_daily.csv", index=False)
    print(f"  ✓ water/camels_daily.csv  {len(daily)} 行（{len(CAMELS_BASINS)} 个流域）")

    # 3. Annual peak streamflow series
    n = _peaks_to_csv(get(DR_PEAKS).decode(), dest / "usgs_peaks_01594440.csv")
    print(f"  ✓ water/usgs_peaks_01594440.csv  {n} 行")
    if usgs_site:
        try:
            n = _peaks_to_csv(get(USGS_PEAK_URL.format(site=usgs_site)).decode(), dest / f"usgs_peaks_{usgs_site}.csv")
            print(f"  ✓ water/usgs_peaks_{usgs_site}.csv  {n} 行")
        except httpx.HTTPError as e:
            print(f"  ✗ 无法从 USGS 下载站点 {usgs_site}：{e}", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", choices=["business", "water", "all"], default="all")
    ap.add_argument("--out", default="data")
    ap.add_argument("--usgs-site", help="additionally fetch the annual peak series of this USGS site from USGS directly")
    args = ap.parse_args()
    out = Path(args.out)
    if args.pack in ("business", "all"):
        print("[business] Chinook")
        fetch_business(out)
    if args.pack in ("water", "all"):
        print("[water] CAMELS + USGS peaks")
        fetch_water(out, args.usgs_site)
    print("完成。")


if __name__ == "__main__":
    main()
