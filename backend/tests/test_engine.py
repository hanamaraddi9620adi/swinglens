"""Deterministic unit tests for the Analyst Engine (pytest).

Run from backend/:  venv\\Scripts\\activate  ->  pytest -q
"""
import math

from app.services.analysis_engine import (
    analyze, atr, build_zones, find_pivots, rsi, sma,
)
from app.services.narration import _allowed_numbers, _verify


def make_candle(t, o, h, l, c, v=1000):
    return {"time": t, "open": o, "high": h, "low": l, "close": c, "volume": v}


def synthetic_breakout(n=120):
    """Uptrend -> wobbly consolidation band ~98..103 -> breakout with volume.
    The wobble matters: flat plateaus (equal highs) are not pivots, by design."""
    candles = []
    price = 70.0
    for i in range(n):
        if i < 60:                      # uptrend with slight wobble
            price += 0.5
            w = 0.1 * (i % 3)
            candles.append(make_candle(i * 86400, price - 0.3, price + 0.6 + w,
                                       price - 0.8 - w, price))
        elif i < n - 3:                 # triangle-wave consolidation
            j = i - 60
            cyc = j % 8
            base = 100 + (2.0 - 0.15 * cyc if cyc < 4 else -2.0 + 0.15 * (cyc - 4))
            w = 0.07 * (j % 5)
            candles.append(make_candle(i * 86400, base - 0.4, base + 0.7 + w,
                                       base - 0.7 - w, base))
        else:                           # breakout candles on 3x volume
            price = 103.5 + (i - (n - 3)) * 1.2
            candles.append(make_candle(i * 86400, price - 0.5, price + 0.8,
                                       price - 0.9, price, v=3000))
    return candles


def test_sma_and_rsi_and_atr_basics():
    closes = [float(i) for i in range(1, 31)]
    assert sma(closes, 10) == sum(range(21, 31)) / 10
    assert sma(closes, 100) is None
    r = rsi(closes)
    assert r is not None and r > 95        # monotonic rise -> RSI near 100
    candles = [make_candle(i, 10, 11, 9, 10) for i in range(20)]
    assert math.isclose(atr(candles), 2.0, rel_tol=1e-6)


def test_pivots_found_on_zigzag():
    candles = []
    for i in range(40):
        cyc = i % 10
        base = 100 + (cyc if cyc <= 5 else 10 - cyc)  # triangle wave, unique peaks
        candles.append(make_candle(i, base, base + 1, base - 1, base))
    pivots = find_pivots(candles)
    assert any(p.kind == "high" for p in pivots)
    assert any(p.kind == "low" for p in pivots)


def test_zones_require_two_touches():
    candles = synthetic_breakout()
    pivots = find_pivots(candles)
    zones = build_zones(pivots, candles[-1]["close"], atr(candles), len(candles))
    assert all(z["touches"] >= 2 for z in zones)
    assert all(z["price_low"] < z["price_high"] for z in zones)


def test_full_analyze_breakout_payload():
    result = analyze(synthetic_breakout())
    setup = result["setup"]
    assert setup["state"] in ("breakout_above_resistance", "consolidation_below_resistance",
                              "pullback_to_support")
    if setup["plan"]:
        p = setup["plan"]
        assert p["stop_loss"] < p["entry_low"] <= p["entry_high"] < p["target1"] <= p["target2"]
        assert p["risk_reward"] >= 1.0
        assert 0 <= setup["confidence"] <= 100
        assert sum(f["max"] for f in setup["factors"]) == 100


def test_analyze_rejects_short_series():
    import pytest
    with pytest.raises(ValueError):
        analyze([make_candle(i, 10, 11, 9, 10) for i in range(10)])


def test_verifier_removes_invented_numbers():
    payload = {"setup": {"plan": {"entry_low": 101.0}}, "indicators": {"last_close": 103.55}}
    allowed = _allowed_numbers(payload)
    text = "Entry sits at 101.00 which is sound. The stock will hit 999.99 next week."
    clean, removed = _verify(text, allowed)
    assert removed == 1
    assert "999.99" not in clean
    assert "101.00" in clean


# ---------------------------------------------------------- indicator suite

def test_every_registry_indicator_computes_without_error():
    """Integrity test: every indicator in the catalog must run on real-shaped
    data with default params and produce well-formed series."""
    from app.services.indicators import REGISTRY, compute
    candles = synthetic_breakout(300)
    for ind_id in REGISTRY:
        out = compute(ind_id, candles, {})
        assert out["pane"] in ("overlay", "sub")
        assert isinstance(out["series"], list) and out["series"], ind_id
        for s in out["series"]:
            assert s["type"] in ("line", "histogram")
            for pt in s["data"]:
                assert "time" in pt and "value" in pt and pt["value"] == pt["value"], ind_id  # no NaN


def test_indicator_math_spot_checks():
    from app.services.indicators import _ema, _sma, compute
    assert _sma([1, 2, 3, 4, 5], 5)[-1] == 3
    e = _ema([1.0] * 50, 10)
    assert abs(e[-1] - 1.0) < 1e-9
    candles = synthetic_breakout(300)
    rsi_out = compute("rsi", candles, {"period": 14})
    vals = [p["value"] for p in rsi_out["series"][0]["data"]]
    assert all(0 <= v <= 100 for v in vals)
    adx_out = compute("adx", candles, {})
    assert {s["name"] for s in adx_out["series"]} == {"ADX", "+DI", "-DI"}
    bb = compute("bollinger", candles, {})
    up = {p["time"]: p["value"] for p in bb["series"][0]["data"]}
    dn = {p["time"]: p["value"] for p in bb["series"][2]["data"]}
    assert all(up[t] >= dn[t] for t in up if t in dn)


def test_indicator_param_clamping():
    from app.services.indicators import compute
    candles = synthetic_breakout(100)
    out = compute("rsi", candles, {"period": 99999, "source": "nonsense"})
    assert out["params"]["period"] == 100      # clamped to max
    assert out["params"]["source"] == "close"  # invalid option -> default


# ------------------------------------------------------------ markets suite

def test_markets_batch_quotes_shaping(monkeypatch):
    import pandas as pd
    from app.services import markets as mk

    idx = pd.date_range("2026-07-08", periods=5, freq="D")
    def fake_download(symbols, **kw):
        cols = pd.MultiIndex.from_product([symbols, ["Close", "Volume"]])
        df = pd.DataFrame(index=idx, columns=cols, dtype=float)
        for i, s in enumerate(symbols):
            df[(s, "Close")] = [100 + i, 101 + i, 102 + i, 103 + i, 105 + i]
            df[(s, "Volume")] = [1000] * 5
        return df
    monkeypatch.setattr(mk.yf, "download", fake_download)
    mk._CACHE.clear()

    seg = mk.get_segment("india_large")
    assert seg["items"], "quotes should not be empty"
    row = seg["items"][0]
    assert {"symbol", "name", "price", "change", "change_pct", "volume", "spark", "currency"} <= set(row)
    assert row["currency"] == "₹" and len(row["spark"]) == 5
    assert seg["items"] == sorted(seg["items"], key=lambda x: x["change_pct"], reverse=True)

    # cache: second call must NOT re-download
    calls = {"n": 0}
    monkeypatch.setattr(mk.yf, "download", lambda *a, **k: calls.__setitem__("n", calls["n"] + 1) or fake_download(a[0]))
    assert mk.get_segment("india_large")["items"]
    assert calls["n"] == 0

    import pytest
    with pytest.raises(KeyError):
        mk.get_segment("moon_rocks")


# --------------------------------------------------------------- news suite

def _fake_entry(title, link, src):
    class S: pass
    e = {"title": title, "link": link, "published_parsed": (2026, 7, 16, 10, 0, 0, 0, 0, 0)}
    class E(dict):
        source = type("Src", (), {"title": src})()
        def __getattr__(self, k):
            try: return self[k]
            except KeyError: raise AttributeError(k)
    out = E(e)
    return out

def test_news_corroboration_and_cache(monkeypatch):
    from app.services import news as nw
    nw._CACHE.clear()

    def fake_parse(url):
        if "economictimes" in url:
            return {"entries": [_fake_entry("Reliance Q1 profit jumps 12% on retail growth", "https://et.com/a1", "Economic Times")]}
        if "moneycontrol" in url:
            return {"entries": [_fake_entry("Reliance Q1 profit surges 12% led by retail", "https://mc.com/b2", "Moneycontrol")]}
        if "livemint" in url:
            return {"entries": [_fake_entry("Rupee slips against dollar in early trade", "https://lm.com/c3", "LiveMint")]}
        return {"entries": []}
    monkeypatch.setattr(nw.feedparser, "parse", fake_parse)

    out = nw.get_market_news()
    stories = {s["title"]: s for s in out["items"]}
    confirmed = [s for s in out["items"] if s["confirmed"]]
    assert len(confirmed) == 1, "the two similar Reliance headlines must merge and confirm"
    assert set(confirmed[0]["corroborated_by"]) == {"Economic Times", "Moneycontrol"}
    unverified = [s for s in out["items"] if not s["confirmed"]]
    assert any("Rupee" in s["title"] for s in unverified)
    assert set(out["feeds_ok"]) >= {"Economic Times Markets", "Moneycontrol Markets", "LiveMint Markets"}
    assert out["feeds_failed"]  # the google feeds returned no entries -> reported honestly

    calls = {"n": 0}
    monkeypatch.setattr(nw.feedparser, "parse", lambda u: calls.__setitem__("n", calls["n"] + 1) or {"entries": []})
    nw.get_market_news()
    assert calls["n"] == 0, "second call must be served from cache"


def test_local_search_beginner_queries():
    from app.services.markets import local_search
    assert local_search("larsen and turbo")[0]["symbol"] == "LT.NS"
    golds = {r["symbol"] for r in local_search("gold")}
    assert "GOLDBEES.NS" in golds and ("GC=F" in golds or "GLD" in golds)
    assert local_search("bitcoin")[0]["symbol"] == "BTC-USD"
    assert local_search("xzqy") == []


def test_extended_uptrend_state_with_watch_levels():
    """AAPL-at-highs scenario: healthy trend + steep extension -> the engine
    must say 'strong_uptrend_extended' and still hand over levels to watch."""
    from app.services.analysis_engine import analyze
    cs, price = [], 100.0
    for i in range(240):
        if i < 228:
            price += 0.4 + 0.15 * ((i % 7) - 3) / 3
            w = 0.3 + 0.1 * (i % 3)
            cs.append(make_candle(i * 86400, price - 0.2, price + w, price - w, price))
        else:
            price *= 1.02
            cs.append(make_candle(i * 86400, price - 1, price + 1.5, price - 2, price, 1500))
    r = analyze(cs)
    assert r["setup"]["state"] in ("strong_uptrend_extended", "breakout_above_resistance")
    w = r["setup"]["watch"]
    assert w["nearest_support"] is not None or w["recent_swing_low"] is not None
    assert w["sma20"] is not None and w["recent_swing_high"] >= w["recent_swing_low"]
