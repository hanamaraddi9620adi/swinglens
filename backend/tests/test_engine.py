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
