"""Validated market candles with explicit price basis and trading-session dates."""
from copy import deepcopy
from datetime import datetime, timezone
import math
import time
from threading import Lock
import pandas as pd
import yfinance as yf

RANGES = {"1M": "1mo", "3M": "3mo", "6M": "6mo", "1Y": "1y", "5Y": "5y", "MAX": "max"}
INTERVALS = {"15m": ("15m", ["1M"]), "1H": ("1h", ["1M", "3M", "6M", "1Y"]),
             "1D": ("1d", list(RANGES)), "1W": ("1wk", list(RANGES))}
PROVIDER_NAME = "Yahoo Finance (via yfinance)"
_CACHE = {}
_CACHE_LOCK = Lock()
_CACHE_SECONDS = 60

class MarketDataError(Exception):
    def __init__(self, status_code, message):
        self.status_code, self.message = status_code, message
        super().__init__(message)

def _source_block(symbol, note=None):
    result = {"provider": PROVIDER_NAME, "url": f"https://finance.yahoo.com/quote/{symbol}",
              "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    if note:
        result["note"] = note
    return result

def normalize_candles(frame, interval_label):
    """Discard malformed bars and return unique ascending chart timestamps.

    Daily/weekly bars represent an exchange calendar date. Encoding local
    midnight as an epoch shifted Indian candles to the previous UTC date.
    Intraday bars retain the actual UTC instant.
    """
    by_time = {}
    rejected = 0
    for stamp, row in frame.iterrows():
        try:
            timestamp = pd.Timestamp(stamp)
            if pd.isna(timestamp):
                raise ValueError("Missing date")
            if interval_label in {"1D", "1W"}:
                timestamp = pd.Timestamp(timestamp.date(), tz="UTC")
            elif timestamp.tzinfo is None:
                timestamp = timestamp.tz_localize("UTC")
            else:
                timestamp = timestamp.tz_convert("UTC")
            values = {key: float(row[key.title()]) for key in ("open", "high", "low", "close")}
            if not all(math.isfinite(value) and value > 0 for value in values.values()):
                raise ValueError("Invalid price")
            if values["high"] < max(values["open"], values["close"], values["low"]) or values["low"] > min(values["open"], values["close"]):
                raise ValueError("Invalid OHLC bounds")
            volume = float(row.get("Volume", 0))
            volume = max(0, int(volume)) if math.isfinite(volume) else 0
            bar = {"time": int(timestamp.timestamp()), **{key: round(value, 6) for key, value in values.items()}, "volume": volume}
            if bar["time"] in by_time:
                rejected += 1
            by_time[bar["time"]] = bar
        except (TypeError, ValueError, KeyError, OverflowError):
            rejected += 1
    return [by_time[key] for key in sorted(by_time)], rejected

def get_candles(symbol, range_label, interval_label):
    symbol = symbol.upper().strip()
    if not symbol or len(symbol) > 40:
        raise MarketDataError(422, "Choose a valid instrument symbol.")
    if range_label not in RANGES or interval_label not in INTERVALS:
        raise MarketDataError(422, "Unsupported chart range or interval.")
    yf_interval, allowed = INTERVALS[interval_label]
    notes = []
    if range_label not in allowed:
        notes.append(f"Range clamped from {range_label} to {allowed[-1]} for {interval_label} provider limits.")
        range_label = allowed[-1]
    key = (symbol, range_label, interval_label)
    with _CACHE_LOCK:
        cached = _CACHE.get(key)
        if cached and time.monotonic() - cached[0] < _CACHE_SECONDS:
            return deepcopy(cached[1])
    ticker = yf.Ticker(symbol)
    try:
        frame = ticker.history(period=RANGES[range_label], interval=yf_interval, auto_adjust=True, timeout=12)
    except Exception as exc:
        raise MarketDataError(502, f"Market data is temporarily unavailable for {symbol}. Please retry.") from exc
    if frame is None or frame.empty:
        raise MarketDataError(404, f"No candles available for {symbol}. Check the symbol or try another range.")
    candles, rejected = normalize_candles(frame, interval_label)
    if not candles:
        raise MarketDataError(502, "The provider returned no valid price candles. Please retry later.")
    last, previous = candles[-1]["close"], candles[-2]["close"] if len(candles) > 1 else candles[-1]["close"]
    currency = None
    exchange_timezone = None
    try:
        metadata = ticker.history_metadata or {}
        currency = metadata.get("currency")
        exchange_timezone = metadata.get("exchangeTimezoneName")
    except Exception:
        pass
    change = round(last - previous, 6)
    notes.append("Provider-adjusted OHLC (splits/dividends); exchange session dates on daily/weekly bars. Quotes may be delayed; not a live tick feed.")
    if rejected:
        notes.append(f"Omitted {rejected} invalid or duplicate bars.")
    result = {"symbol": symbol, "interval": interval_label, "range": range_label, "candles": candles,
              "meta": {"currency": currency or ("INR" if symbol.endswith((".NS", ".BO")) else "USD"),
                       "last_close": last, "prev_close": previous, "change": change,
                       "change_pct": round(change / previous * 100, 2) if previous else 0,
                       "candle_count": len(candles), "last_candle_at": candles[-1]["time"],
                       "exchange_timezone": exchange_timezone, "price_basis": "Provider-adjusted OHLC",
                       "time_basis": "Exchange session date" if interval_label in {"1D", "1W"} else "UTC", "invalid_bars_removed": rejected},
              "source": _source_block(symbol, " ".join(notes))}
    with _CACHE_LOCK:
        if len(_CACHE) >= 64:
            _CACHE.pop(min(_CACHE, key=lambda entry: _CACHE[entry][0]))
        _CACHE[key] = (time.monotonic(), deepcopy(result))
    return result

def search_symbols(query):
    query = query.strip()
    if len(query) < 2:
        return {"results": [], "source": _source_block("")}
    from . import markets
    results = markets.local_search(query)
    seen = {row["symbol"] for row in results}
    if results:
        return {"results": results[:10], "source": _source_block(query, "Matching curated instruments; use a full symbol for instruments outside the catalog.")}
    note = None
    try:
        found = yf.Search(query, max_results=10, timeout=8)
        for row in found.quotes or []:
            symbol = row.get("symbol")
            if not symbol or symbol in seen or row.get("quoteType") not in {"EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY", "FUTURE", "CURRENCY"}:
                continue
            seen.add(symbol)
            results.append({"symbol": symbol, "name": row.get("shortname") or row.get("longname") or symbol,
                            "exchange": row.get("exchange", ""), "type": row.get("quoteType", "")})
    except Exception:
        note = "External symbol search is temporarily unavailable. Curated instruments remain available in Chart."
    return {"results": results[:10], "source": _source_block(query, note)}

def batch_quotes(symbols):
    out = {}
    if not symbols:
        return out
    try:
        frame = yf.download(symbols, period="7d", interval="1d", group_by="ticker", progress=False, threads=True, auto_adjust=True, timeout=12)
        multi = isinstance(frame.columns, pd.MultiIndex)
        for symbol in symbols:
            try:
                closes = (frame[symbol] if multi else frame)["Close"].dropna()
                values = [float(value) for value in closes if math.isfinite(float(value)) and float(value) > 0]
                if not values:
                    continue
                last, previous = values[-1], values[-2] if len(values) > 1 else values[-1]
                out[symbol] = {"price": round(last, 2), "change_pct": round((last / previous - 1) * 100, 2)}
            except (KeyError, TypeError, ValueError):
                continue
    except Exception:
        pass
    return out
