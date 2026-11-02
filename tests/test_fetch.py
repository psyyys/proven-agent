"""Download script: retries and the jsDelivr fallback, with the network simulated."""

import importlib.util
from pathlib import Path

import httpx
import pytest

spec = importlib.util.spec_from_file_location("fetch_datasets", Path(__file__).resolve().parents[1] / "scripts" / "fetch_datasets.py")
fetch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fetch)

RAW = "https://raw.githubusercontent.com/datasets/gdp/36d761dc5617982d3e50b213e02b9a1b47c4e958/data/gdp.csv"
CDN = "https://cdn.jsdelivr.net/gh/datasets/gdp@36d761dc5617982d3e50b213e02b9a1b47c4e958/data/gdp.csv"


def test_jsdelivr_address():
    assert fetch.jsdelivr(RAW) == CDN
    assert fetch.jsdelivr("https://raw.githubusercontent.com/lerocha/chinook-database/master/a/b.sqlite") == \
        "https://cdn.jsdelivr.net/gh/lerocha/chinook-database@master/a/b.sqlite"
    assert fetch.jsdelivr("https://nwis.waterdata.usgs.gov/nwis/peak?site_no=1") is None


@pytest.fixture
def network(monkeypatch):
    """Fake httpx.get: hosts in `down` reset the connection; every call is recorded."""
    calls, down = [], set()

    def fake_get(url, **kwargs):
        calls.append(url)
        if any(h in url for h in down):
            raise httpx.ConnectError("[WinError 10054] 远程主机强迫关闭了一个现有的连接。")
        return httpx.Response(200, content=b"ok", request=httpx.Request("GET", url))

    monkeypatch.setattr(fetch.httpx, "get", fake_get)
    monkeypatch.setattr(fetch.time, "sleep", lambda s: None)
    monkeypatch.setattr(fetch, "USE_MIRROR_FIRST", False)
    return calls, down


def test_falls_back_to_jsdelivr_after_retries(network):
    calls, down = network
    down.add("raw.githubusercontent.com")
    assert fetch.get(RAW) == b"ok"
    assert calls == [RAW, RAW, RAW, CDN]


def test_mirror_first(network, monkeypatch):
    calls, _ = network
    monkeypatch.setattr(fetch, "USE_MIRROR_FIRST", True)
    assert fetch.get(RAW) == b"ok" and calls == [CDN]


def test_gives_up_when_both_fail(network):
    calls, down = network
    down.update({"raw.githubusercontent.com", "cdn.jsdelivr.net"})
    with pytest.raises(httpx.ConnectError):
        fetch.get(RAW)
    assert len(calls) == 6


def test_non_github_url_has_no_mirror(network):
    calls, down = network
    down.add("usgs.gov")
    with pytest.raises(httpx.ConnectError):
        fetch.get("https://nwis.waterdata.usgs.gov/nwis/peak?site_no=1")
    assert len(calls) == 3
