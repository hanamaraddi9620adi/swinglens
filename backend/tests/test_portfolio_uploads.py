"""Regression coverage for real file formats, partial history and hosted review."""
import io
import json
import uuid
from datetime import datetime
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.portfolio_import import parse_broker_file, _resolve_symbol
from app.services.portfolio_review import build_report, explain_report, SECTIONS
from app.services.llm.base import LLMUnavailable

def holding(symbol='RELIANCE.NS', quantity=10, avg=100, ltp=120):
    return dict(symbol=symbol, symbol_raw=symbol or 'Unknown company', name='Test holding', quantity=quantity, avg_price=avg, ltp_imported=ltp)

def trade(side, qty, price, id=1, symbol='RELIANCE.NS', date=None):
    return dict(id=id, side=side, quantity=qty, price=price, symbol=symbol, symbol_raw=symbol, name='Test stock', trade_date=date)

@pytest.mark.parametrize('separator', [',', ';', '\t', '|'])
def test_csv_delimiters_preamble_and_currency_headers(separator):
    content = 'Broker export\n\n' + separator.join(['Trading Symbol', 'Qty.', 'Avg. Price (INR)', 'LTP']) + '\n' + separator.join(['RELIANCE.NS', '10', '100', '120'])
    result = parse_broker_file(content.encode('utf-8-sig'), 'export.CSV')
    assert result['report']['imported'] == 1
    assert result['rows'][0]['price'] == 100

def test_utf16_and_formatted_numbers():
    content = 'Symbol\tQuantity\tAverage Price\nAAPL\t2\t$1,200.50\n'
    assert parse_broker_file(content.encode('utf-16'), 'x.csv')['rows'][0]['price'] == 1200.5

def workbook():
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        pd.DataFrame([['Account statement'], ['Private account details not for AI']]).to_excel(writer, sheet_name='Cover', index=False, header=False)
        pd.DataFrame([['Stock Name', 'Quantity', 'Average Price'], ['Reliance Industries', 10, 100]]).to_excel(writer, sheet_name='Holdings', index=False, header=False)
    return output.getvalue()

def test_xlsx_with_cover_sheet():
    parsed = parse_broker_file(workbook(), 'export.xlsx')
    assert parsed['report']['sheet'] == 'Holdings'
    assert parsed['report']['imported'] == 1
    assert parsed['rows'][0]['symbol'] == 'RELIANCE.NS'

@pytest.mark.parametrize('filename,content', [('empty.csv', b''), ('bad.xlsx', b'not a zip'), ('legacy.xls', b'xls'), ('missing.csv', b'Symbol,Quantity\nAAPL,10'), ('wrong.txt', b'hello'), ('nan.csv', b'Symbol,Quantity,Price\nAAPL,NaN,100\nAAPL,2,inf')])
def test_invalid_files_are_actionable(filename, content):
    with pytest.raises(ValueError):
        parse_broker_file(content, filename)

def test_rejects_invalid_rows_and_uses_exact_side():
    parsed = parse_broker_file(b'Symbol,Quantity,Price,Side,Date\nAAPL,2,100,BUY,2026-02-03\nAAPL,1,110,SELL,2026-02-04\nAAPL,1,100,STOP,2026-02-04\nAAPL,1,-100,BUY,2026-02-05', 'x.csv')
    assert parsed['report']['imported'] == 2 and parsed['report']['skipped'] == 2
    assert parsed['rows'][0]['trade_date'] == datetime(2026, 2, 3)

def test_unknown_symbol_not_guessed_and_exchange_preserved():
    assert _resolve_symbol('RELIANCE.BO', None)[0] == 'RELIANCE.BO'
    assert _resolve_symbol('NASDAQ:ABCD', None)[0] == 'ABCD'
    assert _resolve_symbol('NSE:NEWCO', None)[0] == 'NEWCO.NS'
    assert _resolve_symbol('ABCD', None)[0] is None
    assert _resolve_symbol(None, 'RVNL')[0] == 'RVNL.NS'

def test_math_currency_separation_and_duplicate_exposure():
    result = build_report([holding(), holding(), holding('AAPL')], [])
    assert len(result['holdings']) == 2
    assert result['holdings'][0]['currency'] == 'INR'
    assert result['holdings'][0]['instrument_count'] == 1
    assert result['holdings'][0]['largest_weight_pct'] == 100
    assert result['holdings'][0]['pnl'] == 400
    assert any(('Currencies' in warning for warning in result['warnings']))

def test_small_tradebook_still_has_results_and_unmatched_sell_warning():
    result = build_report([], [trade('BUY', 10, 100), trade('SELL', 15, 120, id=2)])
    group = result['trading'][0]
    assert group['realized_pnl'] == 200
    assert group['round_trips'] == 1 and (not group['profile']['ready'])
    assert group['unmatched_sell_rows'] == 1
    assert group['missing_dates'] == 2

def test_quote_outage_falls_back_to_file():
    result = build_report([holding()], [], {})
    assert result['holdings'][0]['current'] == 1200
    assert result['holdings'][0]['positions'][0]['ltp_source'] == 'file/avg'
    assert result['warnings']

def test_ai_numeric_claims_verified_and_raw_file_not_sent(monkeypatch):
    from app.services import portfolio_review as review

    class Model:
        provider_name = 'groq'

        def chat(self, messages):
            assert 'Private account' not in messages[-1]['content']
            return json.dumps({key: 'Portfolio has 999999% guaranteed upside. Review imported exposure.' for key in SECTIONS})
    monkeypatch.setattr(review, 'get_llm', lambda: Model())
    result = explain_report(build_report([holding()], []))
    assert result['status'] == 'edited'
    assert result['unsupported_sentences_removed'] == 4
    assert all(('999999' not in value for value in result['sections'].values()))

@pytest.mark.parametrize('response', ['not json', '[]', '{}', '{"overview":7}'])
def test_ai_bad_response_falls_back(monkeypatch, response):
    from app.services import portfolio_review as review

    class Model:
        provider_name = 'gemini'

        def chat(self, messages):
            return response
    monkeypatch.setattr(review, 'get_llm', lambda: Model())
    assert explain_report(build_report([holding()], []))['status'] == 'template_fallback'

def test_ai_unavailable_keeps_computed_review(monkeypatch):
    from app.services import portfolio_review as review

    def unavailable():
        raise LLMUnavailable('quota')
    monkeypatch.setattr(review, 'get_llm', unavailable)
    assert explain_report(build_report([holding()], []))['sections']['overview']

@pytest.fixture
def client():
    return TestClient(app)

def account(client):
    identity = uuid.uuid4().hex[:12]
    result = client.post('/api/auth/register', json={'username': f'pf_{identity}', 'email': f'{identity}@example.com', 'password': 'password123'})
    assert result.status_code == 200
    return {'Authorization': f"Bearer {result.json()['access_token']}"}

def test_import_report_review_isolation_and_failed_replacement(client, monkeypatch):
    import app.routers.portfolio as router
    from app.services import portfolio_review as review
    monkeypatch.setattr(router, 'fetch_live_prices', lambda symbols: {})
    monkeypatch.setattr(router, 'fetch_company_context', lambda report: {'companies': []})
    monkeypatch.setattr(review, 'get_llm', lambda: (_ for _ in ()).throw(LLMUnavailable('offline')))
    owner, other = (account(client), account(client))
    assert client.get('/api/portfolio/report').status_code == 401
    imported = client.post('/api/portfolio/import', headers=owner, data={'broker': 'groww'}, files={'file': ('holdings.xlsx', workbook())})
    assert imported.status_code == 200
    assert imported.json()['report']['holdings'][0]['invested'] == 1000
    invalid = client.post('/api/portfolio/import', headers=owner, data={'broker': 'groww'}, files={'file': ('bad.xlsx', b'invalid')})
    assert invalid.status_code == 422
    assert client.get('/api/portfolio/report', headers=owner).json()['holdings'][0]['invested'] == 1000
    assert client.get('/api/portfolio/report', headers=other).json()['empty']
    assert client.post('/api/portfolio/review', headers=other).status_code == 422
    analyzed = client.post('/api/portfolio/review', headers=owner).json()
    assert analyzed['explanation']['status'] == 'template_fallback'
    assert not analyzed['report']['empty']
    assert client.delete('/api/portfolio', headers=owner).json()['deleted_holdings'] == 1

def test_upload_limit(client):
    response = client.post('/api/portfolio/import', headers=account(client), files={'file': ('huge.csv', b'x' * (5 * 1024 * 1024 + 1))})
    assert response.status_code == 413
