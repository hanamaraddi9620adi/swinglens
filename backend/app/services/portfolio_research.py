"""Best-effort sourced company context, bounded independently of file results."""
import math
from numbers import Real
from concurrent.futures import ThreadPoolExecutor, wait
from threading import BoundedSemaphore
from .fundamentals import get_fundamentals
from .portfolio import portfolio_source
_workers = ThreadPoolExecutor(max_workers=3, thread_name_prefix='portfolio-research')
_slots = BoundedSemaphore(3)

def _company(symbol):
    try:
        facts = get_fundamentals(symbol)
        income = (facts.get('income') or [{}])[0]
        cashflow = (facts.get('cashflow') or [{}])[0]
        return _finite({'symbol': symbol, 'available': True, 'name': facts['name'], 'sector': facts.get('sector'), 'industry': facts.get('industry'), 'currency': facts['currency'], 'trailing_pe': facts.get('trailing_pe'), 'annual_period': income.get('period'), 'annual_revenue': income.get('revenue'), 'annual_net_income': income.get('net_income'), 'cashflow_period': cashflow.get('period'), 'annual_free_cashflow': cashflow.get('fcf'), 'source': facts['source']})
    except Exception:
        return _finite({'symbol': symbol, 'available': False, 'note': 'Company fundamentals unavailable from the free provider; no company claims inferred.', 'source': portfolio_source('Company research unavailable.')})
    finally:
        _slots.release()

def fetch_company_context(report):
    ranked = []
    for index in range(3):
        for group in report['holdings']:
            positions = group['positions']
            if index < len(positions) and positions[index]['symbol']:
                symbol = positions[index]['symbol']
                if symbol not in ranked:
                    ranked.append(symbol)
    symbols = ranked[:3]
    futures, unavailable = ({}, [])
    for symbol in symbols:
        if _slots.acquire(blocking=False):
            futures[_workers.submit(_company, symbol)] = symbol
        else:
            unavailable.append(symbol)
    done, pending = wait(futures, timeout=10) if futures else (set(), set())
    results = {futures[future]: future.result() for future in done}
    for symbol in unavailable + [futures[future] for future in pending]:
        results[symbol] = {'symbol': symbol, 'available': False, 'note': 'Company lookup exceeded the available time or capacity. Retry later.', 'source': portfolio_source('Company research unavailable.')}
    return {'companies': [results[symbol] for symbol in symbols], 'source': portfolio_source('Best-effort company fundamentals for up to three distinct holdings, chosen within currency groups. Annual statements may lag; this is not live news or exhaustive research.')}

def _finite(value):
    if isinstance(value, dict):
        return {key: _finite(child) for key, child in value.items()}
    if isinstance(value, list):
        return [_finite(child) for child in value]
    if isinstance(value, Real) and (not isinstance(value, bool)):
        return float(value) if math.isfinite(value) else None
    return value
