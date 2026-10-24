import math
from concurrent.futures import Future

import pandas as pd

from app.services import portfolio_quotes as quotes
from app.services import portfolio_research as research


def test_daily_quotes_reject_nonfinite_and_cache(monkeypatch):
    calls = []
    def download(symbols, **kwargs):
        calls.append(symbols)
        assert kwargs['timeout'] == 5
        return pd.DataFrame({('AAA', 'Close'): [100.0], ('BBB', 'Close'): [math.inf]})
    quotes._cache.clear()
    monkeypatch.setattr(quotes.yf, 'download', download)
    assert quotes.fetch_live_prices(['AAA', 'BBB']) == {'AAA': 100.0}
    assert quotes.fetch_live_prices(['BBB', 'AAA']) == {'AAA': 100.0}
    assert len(calls) == 1


def test_quote_deadline_uses_file_fallback(monkeypatch):
    class Delayed:
        def result(self, timeout):
            assert timeout == 12
            raise TimeoutError()
    class Pool:
        def submit(self, fn, symbols):
            quotes._slots.release()
            return Delayed()
    quotes._cache.clear()
    monkeypatch.setattr(quotes, '_pool', Pool())
    assert quotes.fetch_live_prices(['DELAY']) == {}


def test_research_exposes_periods_and_sources(monkeypatch):
    facts = {'name': 'Test company', 'currency': 'INR', 'sector': 'Energy', 'industry': 'Oil', 'trailing_pe': 10,
             'income': [{'period': '2026-03-31', 'revenue': 1000, 'net_income': 100}],
             'cashflow': [{'period': '2026-03-31', 'fcf': 80}],
             'source': {'provider': 'Test data', 'url': 'https://example.com', 'fetched_at': '2026-10-24T00:00:00Z'}}
    monkeypatch.setattr(research, 'get_fundamentals', lambda symbol: facts)
    report = {'holdings': [{'positions': [{'symbol': 'TEST.NS'}]}]}
    result = research.fetch_company_context(report)
    company = result['companies'][0]
    assert company['available']
    assert company['annual_period'] == '2026-03-31'
    assert company['annual_free_cashflow'] == 80
    assert company['source']['provider'] == 'Test data'


def test_research_failure_is_visible_and_does_not_block_report(monkeypatch):
    def unavailable(symbol): raise ValueError('insufficient_data')
    monkeypatch.setattr(research, 'get_fundamentals', unavailable)
    result = research.fetch_company_context({'holdings': [{'positions': [{'symbol': 'MISSING.NS'}]}]})
    assert result['companies'][0]['available'] is False
    assert 'unavailable' in result['companies'][0]['note']


def test_research_deadline_returns_missing_label(monkeypatch):
    monkeypatch.setattr(research, 'wait', lambda futures, timeout: (set(), set(futures)))
    monkeypatch.setattr(research, 'get_fundamentals', lambda symbol: (_ for _ in ()).throw(ValueError()))
    result = research.fetch_company_context({'holdings': [{'positions': [{'symbol': 'SLOW.NS'}]}]})
    assert not result['companies'][0]['available']
