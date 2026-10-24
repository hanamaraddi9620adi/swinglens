from datetime import datetime, timezone
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services import market_data

def frame(rows, dates=None):
    return pd.DataFrame(rows, columns=['Open', 'High', 'Low', 'Close', 'Volume'],
                        index=dates if dates is not None else pd.date_range('2026-10-01', periods=len(rows), tz='Asia/Kolkata'))

@pytest.mark.parametrize('interval', ['1D', '1W'])
def test_session_dates_do_not_shift_to_the_previous_day(interval):
    result, removed = market_data.normalize_candles(frame([[100, 105, 99, 104, 1000]]), interval)
    assert datetime.fromtimestamp(result[0]['time'], timezone.utc).isoformat() == '2026-10-01T00:00:00+00:00'
    assert removed == 0

def test_intraday_preserves_actual_utc_instant():
    dates = pd.DatetimeIndex(['2026-10-01 09:15'], tz='Asia/Kolkata')
    result, _ = market_data.normalize_candles(frame([[100, 105, 99, 104, 1000]], dates), '15m')
    assert datetime.fromtimestamp(result[0]['time'], timezone.utc).isoformat() == '2026-10-01T03:45:00+00:00'

def test_invalid_prices_bounds_duplicates_and_volume_are_handled():
    dates = pd.to_datetime(['2026-10-03', '2026-10-01', '2026-10-01', '2026-10-02', '2026-10-04', '2026-10-05'])
    rows = [[100, 105, 99, 104, -1], [100, 105, 99, 104, 100], [101, 106, 100, 105, float('nan')],
            [100, 90, 99, 104, 20], [float('inf'), 105, 99, 104, 20], [100, 105, 99, 104, 20]]
    result, removed = market_data.normalize_candles(frame(rows, dates), '1D')
    assert len(result) == 3 and removed == 3
    assert [bar['time'] for bar in result] == sorted({bar['time'] for bar in result})
    assert result[0]['open'] == 101 and result[0]['volume'] == 0
    assert result[1]['volume'] == 0

def test_empty_after_validation_is_a_provider_error(monkeypatch):
    class Ticker:
        def history(self, **kwargs):
            return frame([[float('nan'), 10, 9, 10, 10]])
    monkeypatch.setattr(market_data.yf, 'Ticker', lambda symbol: Ticker())
    market_data._CACHE.clear()
    with pytest.raises(market_data.MarketDataError) as caught:
        market_data.get_candles('BAD', '1Y', '1D')
    assert caught.value.status_code == 502

def test_shared_candle_cache_is_consistent_and_does_not_leak_mutation(monkeypatch):
    calls = []
    class Ticker:
        history_metadata = {'currency': 'INR', 'exchangeTimezoneName': 'Asia/Kolkata'}
        def history(self, **kwargs):
            calls.append(kwargs)
            return frame([[100, 105, 99, 104, 1000], [104, 107, 103, 106, 1500]])
    monkeypatch.setattr(market_data.yf, 'Ticker', lambda symbol: Ticker())
    market_data._CACHE.clear()
    first = market_data.get_candles('TEST.NS', '1Y', '1D')
    first['candles'][0]['close'] = -1
    second = market_data.get_candles('TEST.NS', '1Y', '1D')
    assert len(calls) == 1 and calls[0]['auto_adjust'] is True
    assert second['candles'][0]['close'] == 104
    assert second['meta']['currency'] == 'INR' and second['meta']['price_basis'] == 'Provider-adjusted OHLC'

def test_catalog_is_authenticated_and_does_not_fetch_quotes(monkeypatch):
    from app.auth import get_current_user
    from app.models import User
    monkeypatch.setattr(market_data.yf, 'download', lambda *a, **k: pytest.fail('Catalog must not download quotes'))
    client = TestClient(app)
    assert client.get('/api/markets/catalog').status_code == 401
    app.dependency_overrides[get_current_user] = lambda: User(id=999, username='fixture', email='fixture@example.com')
    try:
        result = client.get('/api/markets/catalog')
        assert result.status_code == 200
        assert any(row['id'] == 'us' for row in result.json()['segments'])
        assert result.json()['source']['provider']
    finally:
        app.dependency_overrides.pop(get_current_user, None)
