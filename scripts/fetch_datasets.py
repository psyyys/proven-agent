"""Download the public demo datasets into ./data and convert them to tidy CSV files.

Sources (all public):
- Chinook sample database (MIT): https://github.com/lerocha/chinook-database
- CAMELS-US basin attributes and a 4-basin daily subset, as shipped in NeuralHydrology's test data:
  https://github.com/neuralhydrology/neuralhydrology  (CAMELS: Addor et al. 2017, Newman et al. 2015)
- USGS annual peak streamflow, site 01594440 (Patuxent River near Bowie, MD), from the test data of
  https://github.com/DOI-USGS/dataretrieval-python  (USGS data are public domain)
- Finance and economics (pinned to fixed commits so evaluation answers do not drift):
  - Datahub core datasets (ODC-PDDL): Shiller S&P 500 monthly, S&P 500 constituent financials,
    US 10-year Treasury yield, World Bank GDP / inflation / population   https://github.com/datasets
  - Rdatasets (GPL, from the R packages AER and Ecdat): Greene's US macro quarterly 1950-2000,
    Fama-French-based industry excess returns 1960-2002, CPS 1985 wages
    https://github.com/vincentarelbundock/Rdatasets

Usage:
    python scripts/fetch_datasets.py              # all packs
    python scripts/fetch_datasets.py --pack water
    python scripts/fetch_datasets.py --usgs-site 01646500   # also fetch a longer peak series directly from USGS
    python scripts/fetch_datasets.py --mirror               # download GitHub files through the jsDelivr CDN first

GitHub files are retried and, if raw.githubusercontent.com cannot be reached (common in mainland China),
fetched from the jsDelivr mirror of the same commit. A proxy can be set with HTTPS_PROXY.
"""

from __future__ import annotations

import argparse
import io
import re
import sqlite3
import sys
import tempfile
import time
from pathlib import Path

import httpx
import pandas as pd

RAW = "https://raw.githubusercontent.com"
CHINOOK = f"{RAW}/lerocha/chinook-database/master/ChinookDatabase/DataSources/Chinook_Sqlite.sqlite"
NH = f"{RAW}/neuralhydrology/neuralhydrology/master/test/test_data/camels_us"
DR_PEAKS = f"{RAW}/DOI-USGS/dataretrieval-python/main/tests/data/waterservices_peaks.txt"
USGS_PEAK_URL = "https://nwis.waterdata.usgs.gov/nwis/peak?site_no={site}&agency_cd=USGS&format=rdb"
CAMELS_BASINS = ["01022500", "01547700", "02064000", "03015500"]
DATAHUB = {  # repo -> pinned commit
    "s-and-p-500": "87a2284276f79d75041c71c8f6d9f2aa1c965e84",
    "s-and-p-500-companies-financials": "a6568e52c4a7a4eb7708b2c9f99768027a193c6f",
    "s-and-p-500-companies": "e361f7f69cf67756aa1ff904a86d4be53f0d3351",
    "gdp": "36d761dc5617982d3e50b213e02b9a1b47c4e958",
    "inflation": "b8ece3f0b169a7fbcee162d5427be5ae4d0ee57e",
    "population": "d4b1a4a9a17e2123baf0ef119de05bceced1ab1b",
    "bond-yields-us-10y": "02ba49bd633f73ff9dc0471ffbb543fc0634b847",
}
RDATASETS = f"{RAW}/vincentarelbundock/Rdatasets/1dcc2bf5f955cc1224a3e1307256e1fe86b68dae/csv"
# World Bank region and income-group aggregates mixed in with countries in the GDP / population files.
WB_AGGREGATES = set(
    "AFE AFW ARB CEB CSS EAP EAR EAS ECA ECS EMU EUU FCS HIC HPC IBD IBT IDA IDB IDX INX LAC LCN LDC LIC LMC LMY LTE "
    "MEA MIC MNA NAC OED OSS PRE PSS PST SAS SSA SSF SST TEA TEC TLA TMN TSA TSS UMC WLD".split()
)
CAMELS_ATTR_FILES = ["camels_name", "camels_topo", "camels_clim", "camels_hydro", "camels_soil", "camels_vege", "camels_geol"]


USE_MIRROR_FIRST = False
_RAW_URL = re.compile(r"^https://raw\.githubusercontent\.com/([^/]+)/([^/]+)/([^/]+)/(.+)$")


def jsdelivr(url: str) -> str | None:
    """The jsDelivr CDN address of a raw GitHub file: cdn.jsdelivr.net/gh/<owner>/<repo>@<ref>/<path>."""
    m = _RAW_URL.match(url)
    return f"https://cdn.jsdelivr.net/gh/{m[1]}/{m[2]}@{m[3]}/{m[4]}" if m else None


def _download(url: str, attempts: int) -> bytes:
    for i in range(1, attempts + 1):
        try:
            r = httpx.get(url, timeout=60, follow_redirects=True)
            r.raise_for_status()
            return r.content
        except httpx.HTTPError as e:
            if i == attempts:
                raise
            print(f"    第 {i} 次失败（{type(e).__name__}），{2 * i} 秒后重试")
            time.sleep(2 * i)
    raise AssertionError("unreachable")


def get(url: str, attempts: int = 3) -> bytes:
    """Download with retries; GitHub files fall back to (or, with --mirror, start from) jsDelivr."""
    mirror = jsdelivr(url)
    order = [u for u in ([mirror, url] if USE_MIRROR_FIRST else [url, mirror]) if u]
    for k, u in enumerate(order):
        print(f"  ↓ {u}")
        try:
            return _download(u, attempts)
        except httpx.HTTPError:
            if k == len(order) - 1:
                raise
            print(f"    连接失败，改用 {'GitHub 原地址' if USE_MIRROR_FIRST else 'jsDelivr 镜像'}")
    raise AssertionError("unreachable")


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


def _datahub(repo: str, path: str) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(get(f"{RAW}/datasets/{repo}/{DATAHUB[repo]}/{path}")))


def _rdata(path: str) -> pd.DataFrame:
    return pd.read_csv(io.BytesIO(get(f"{RDATASETS}/{path}"))).drop(columns=["rownames"])


def fetch_finance(out: Path) -> None:
    dest = out / "finance"
    dest.mkdir(parents=True, exist_ok=True)

    def save(df: pd.DataFrame, name: str) -> None:
        df.to_csv(dest / f"{name}.csv", index=False)
        print(f"  ✓ finance/{name}.csv  {len(df)} 行 × {df.shape[1]} 列")

    # Macro: Greene's US quarterly data 1950Q1-2000Q4 (the R file has no date column)
    m = _rdata("AER/USMacroG.csv")
    q = pd.period_range("1950Q1", periods=len(m), freq="Q")
    m.insert(0, "quarter", q.astype(str))
    m.insert(1, "date", q.start_time.strftime("%Y-%m-%d"))
    save(m, "us_macro_quarterly")

    y10 = _datahub("bond-yields-us-10y", "data/monthly.csv").rename(columns={"Date": "date", "Rate": "yield_10y"})
    save(y10, "us_treasury_10y")

    # Macro: World Bank panel. The datahub file names are swapped: inflation-gdp.csv holds CPI inflation
    # (FP.CPI.TOTL.ZG; US 2008 = 3.84) and inflation-consumer.csv holds the GDP deflator (NY.GDP.DEFL.KD.ZG).
    key = ["Country Code", "Year"]
    gdp = _datahub("gdp", "data/gdp.csv").rename(columns={"Value": "gdp_usd"})
    cpi = _datahub("inflation", "data/inflation-gdp.csv").rename(columns={"Inflation": "inflation_cpi_pct"})
    defl = _datahub("inflation", "data/inflation-consumer.csv").rename(columns={"Inflation": "inflation_deflator_pct"})
    pop = _datahub("population", "data/population.csv").rename(columns={"Value": "population"})
    w = gdp.merge(pop[[*key, "population"]], on=key, how="outer")
    w = w.merge(cpi[[*key, "inflation_cpi_pct"]], on=key, how="outer").merge(defl[[*key, "inflation_deflator_pct"]], on=key, how="outer")
    names = pd.concat([gdp[["Country Code", "Country Name"]], pop[["Country Code", "Country Name"]]]).drop_duplicates("Country Code")
    w = w.drop(columns=["Country Name"]).merge(names, on="Country Code", how="left")
    w = w.rename(columns={"Country Name": "country", "Country Code": "code", "Year": "year"})
    w["is_aggregate"] = w["code"].isin(WB_AGGREGATES)
    w = w[["country", "code", "is_aggregate", "year", "gdp_usd", "population", "inflation_cpi_pct", "inflation_deflator_pct"]]
    save(w.sort_values(["code", "year"]).reset_index(drop=True), "world_macro")

    # Markets: Shiller monthly S&P 500 (prices are monthly averages of daily closes; after 2023-06 only the
    # index level is filled and the other columns are 0, i.e. missing)
    sp = _datahub("s-and-p-500", "data/data.csv").rename(columns={
        "Date": "date", "SP500": "sp500", "Dividend": "dividend", "Earnings": "earnings", "Consumer Price Index": "cpi",
        "Long Interest Rate": "long_rate", "Real Price": "real_price", "Real Dividend": "real_dividend",
        "Real Earnings": "real_earnings", "PE10": "pe10"})
    save(sp, "sp500_monthly")

    # Markets: monthly excess returns (percent) of three industries and the market, plus the risk-free rate
    c = _rdata("Ecdat/Capm.csv")
    c.insert(0, "month", pd.period_range("1960-01", periods=len(c), freq="M").astype(str))
    save(c, "capm_monthly")

    # Micro (firms): one snapshot of S&P 500 constituent financials from Yahoo Finance. "Sector" in the source
    # is the GICS sub-industry; the GICS sector is looked up from the constituents list via the sub-industry.
    f = _datahub("s-and-p-500-companies-financials", "data/constituents-financials.csv")
    cons = _datahub("s-and-p-500-companies", "data/constituents.csv")
    sector_of = cons.drop_duplicates("GICS Sub-Industry").set_index("GICS Sub-Industry")["GICS Sector"]
    f = f.rename(columns={
        "Symbol": "symbol", "Name": "name", "Sector": "sub_industry", "Price": "price", "Price/Earnings": "pe",
        "Dividend Yield": "dividend_yield", "Earnings/Share": "eps", "52 Week Low": "low_52w", "52 Week High": "high_52w",
        "Market Cap": "market_cap", "EBITDA": "ebitda", "Price/Sales": "ps", "Price/Book": "pb"}).drop(columns=["SEC Filings"])
    f.insert(3, "sector", f["sub_industry"].map(sector_of))
    save(f, "sp500_firms")

    # Micro (households): May 1985 Current Population Survey, 534 workers
    save(_rdata("AER/CPS1985.csv"), "cps1985_wages")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", choices=["business", "water", "finance", "all"], default="all")
    ap.add_argument("--out", default="data")
    ap.add_argument("--usgs-site", help="additionally fetch the annual peak series of this USGS site from USGS directly")
    ap.add_argument("--mirror", action="store_true", help="download GitHub files through the jsDelivr CDN first")
    args = ap.parse_args()
    global USE_MIRROR_FIRST
    USE_MIRROR_FIRST = args.mirror
    out = Path(args.out)
    try:
        run(args, out)
    except httpx.HTTPError as e:
        sys.exit(
            f"\n下载失败：{type(e).__name__}: {e}\n"
            "可以：1) 稍后重试；2) 加 --mirror 优先使用 jsDelivr 镜像；"
            "3) 设置代理后重试，如 PowerShell 中执行 $env:HTTPS_PROXY=\"http://127.0.0.1:7890\"（端口以你的代理软件为准）"
        )
    print("完成。")


def run(args, out: Path) -> None:
    if args.pack in ("business", "all"):
        print("[business] Chinook")
        fetch_business(out)
    if args.pack in ("water", "all"):
        print("[water] CAMELS + USGS peaks")
        fetch_water(out, args.usgs_site)
    if args.pack in ("finance", "all"):
        print("[finance] 宏观、市场与微观数据")
        fetch_finance(out)


if __name__ == "__main__":
    main()
