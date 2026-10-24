"""Latest daily closes with a request deadline, bounded workers and a short cache."""
import math
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from threading import BoundedSemaphore, Lock

import pandas as pd
import yfinance as yf

_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix='portfolio-quotes')
_slots = BoundedSemaphore(2)
_lock = Lock()
_cache = {}


def _download(symbols):
    try:
        frame = yf.download(symbols, period='5d', interval='1d', group_by='ticker',
                            progress=False, threads=4, auto_adjust=False, timeout=5)
        multi = isinstance(frame.columns, pd.MultiIndex)
        prices = {}
        for symbol in symbols:
            try:
                closes = (frame[symbol] if multi else frame)['Close'].dropna()
                value = float(closes.iloc[-1])
                if math.isfinite(value) and value > 0:
                    prices[symbol] = value
            except (KeyError, IndexError, ValueError, TypeError):
                continue
        return prices
    except Exception:
        return {}
    finally:
        _slots.release()


def fetch_live_prices(symbols):
    # Larger portfolios still receive complete file-based results for other rows.
    key = tuple(sorted(set(symbols))[:100])
    if not key:
        return {}
    with _lock:
        hit = _cache.get(key)
        if hit and time.monotonic() - hit[0] < 180:
            return dict(hit[1])
    if not _slots.acquire(blocking=False):
        return {}
    future = _pool.submit(_download, list(key))
    try:
        prices = future.result(timeout=12)
    except TimeoutError:
        prices = {}
    with _lock:
        if len(_cache) >= 64:
            _cache.clear()
        _cache[key] = (time.monotonic(), dict(prices))
    return prices
