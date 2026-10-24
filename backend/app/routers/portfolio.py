import hashlib
import json
import time
from threading import Lock
_review_cache = {}
_review_lock = Lock()
from ..services.portfolio_research import fetch_company_context
'Authenticated imports, immediate computed reports and optional hosted AI review.'
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session
from ..auth import get_current_user
from ..database import get_db
from ..models import Holding, Trade, User
from ..services.portfolio import behavior_profile, fetch_live_prices, fifo_round_trips, holdings_summary, parse_broker_file, portfolio_source
from ..services.portfolio_review import build_report, explain_report
router = APIRouter(prefix='/api/portfolio', tags=['portfolio'])
MAX_FILE_BYTES = 5 * 1024 * 1024

def _rows(user, db):
    holdings = [{'symbol_raw': h.symbol_raw, 'symbol': h.symbol, 'name': h.name, 'quantity': h.quantity, 'avg_price': h.avg_price, 'ltp_imported': h.ltp_imported} for h in db.query(Holding).filter(Holding.user_id == user.id).order_by(Holding.id).all()]
    trades = [{'id': t.id, 'symbol_raw': t.symbol_raw, 'symbol': t.symbol, 'name': t.name, 'side': t.side, 'quantity': t.quantity, 'price': t.price, 'trade_date': t.trade_date} for t in db.query(Trade).filter(Trade.user_id == user.id).order_by(Trade.id).all()]
    return (holdings, trades)

@router.post('/import')
def import_file(file: UploadFile=File(...), broker: str=Form('unknown'), user: User=Depends(get_current_user), db: Session=Depends(get_db)):
    data = file.file.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, 'File too large (5 MB max).')
    try:
        parsed = parse_broker_file(data, file.filename or 'upload.csv')
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    broker = broker.strip().lower()[:24] or 'unknown'
    if parsed['kind'] == 'holdings':
        db.query(Holding).filter(Holding.user_id == user.id, Holding.broker == broker).delete()
        for row in parsed['rows']:
            db.add(Holding(user_id=user.id, broker=broker, symbol_raw=row['symbol_raw'], symbol=row['symbol'], name=row['name'], quantity=row['quantity'], avg_price=row['price'], ltp_imported=row.get('ltp')))
    else:
        db.query(Trade).filter(Trade.user_id == user.id, Trade.broker == broker).delete()
        for row in parsed['rows']:
            db.add(Trade(user_id=user.id, broker=broker, symbol_raw=row['symbol_raw'], symbol=row['symbol'], name=row['name'], side=row['side'], quantity=row['quantity'], price=row['price'], trade_date=row.get('trade_date')))
    db.commit()
    with _review_lock:
        for key in list(_review_cache):
            if key[0] == user.id:
                del _review_cache[key]
    holdings, trades = _rows(user, db)
    return {'kind': parsed['kind'], 'broker': broker, **parsed['report'], 'report': build_report(holdings, trades), 'source': portfolio_source('File parsed on the server; raw file contents are not sent to AI.'), 'note': 'Re-importing the same broker and file type replaces its previous rows. Other brokers and file types remain.'}

@router.get('/report')
def report(refresh_quotes: bool=False, user: User=Depends(get_current_user), db: Session=Depends(get_db)):
    holdings, trades = _rows(user, db)
    live = fetch_live_prices(sorted({row['symbol'] for row in holdings if row['symbol']})) if refresh_quotes else {}
    return build_report(holdings, trades, live)

@router.post('/review')
def review(user: User=Depends(get_current_user), db: Session=Depends(get_db)):
    holdings, trades = _rows(user, db)
    if not holdings and (not trades):
        raise HTTPException(422, 'Import a holdings statement or tradebook before requesting an AI review.')
    fingerprint = hashlib.sha256(json.dumps([holdings, trades], sort_keys=True, default=str).encode()).hexdigest()
    key = (user.id, fingerprint)
    with _review_lock:
        cached = _review_cache.get(key)
        if cached and time.monotonic() - cached[0] < 300:
            return {**cached[1], 'cached': True}
    live = fetch_live_prices(sorted({row['symbol'] for row in holdings if row['symbol']}))
    computed = build_report(holdings, trades, live)
    computed['research'] = fetch_company_context(computed)
    result = {'report': computed, 'explanation': explain_report(computed), 'source': computed['source'], 'cached': False}
    if result['explanation']['status'] != 'template_fallback':
        with _review_lock:
            if len(_review_cache) >= 128:
                _review_cache.clear()
            _review_cache[key] = (time.monotonic(), result)
    return result

@router.get('/summary')
def summary(user: User=Depends(get_current_user), db: Session=Depends(get_db)):
    holdings, _ = _rows(user, db)
    if not holdings:
        return {'empty': True, 'positions': [], 'source': portfolio_source()}
    live = fetch_live_prices(sorted({h['symbol'] for h in holdings if h['symbol']}))
    groups = build_report(holdings, [], live)['holdings']
    if len(groups) > 1:
        return {'empty': False, 'mixed_currencies': True, 'currency_groups': groups, 'positions': [p for group in groups for p in group['positions']], 'position_count': len(holdings), 'source': portfolio_source('Mixed currencies: use currency_groups; no combined monetary total.')}
    return {'empty': False, **groups[0], 'source': portfolio_source('Latest available daily close, with file/average-price fallback when unavailable.')}

@router.get('/behavior')
def behavior(user: User=Depends(get_current_user), db: Session=Depends(get_db)):
    _, trades = _rows(user, db)
    if not trades:
        return {'empty': True, 'source': portfolio_source()}
    groups = build_report([], trades)['trading']
    if len(groups) > 1:
        return {'empty': False, 'mixed_currencies': True, 'trade_count': len(trades), 'currency_groups': groups, 'source': portfolio_source('FIFO results separated by currency.')}
    return {'empty': False, **groups[0], 'source': portfolio_source('FIFO matching on imported tradebook, before fees and taxes.')}

@router.delete('')
def clear(user: User=Depends(get_current_user), db: Session=Depends(get_db)):
    holdings = db.query(Holding).filter(Holding.user_id == user.id).delete()
    trades = db.query(Trade).filter(Trade.user_id == user.id).delete()
    db.commit()
    with _review_lock:
        for key in list(_review_cache):
            if key[0] == user.id:
                del _review_cache[key]
    return {'deleted_holdings': holdings, 'deleted_trades': trades, 'source': portfolio_source('Imported records removed.')}
