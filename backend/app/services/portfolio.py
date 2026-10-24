"""Deterministic portfolio analytics. File parsing is isolated in portfolio_import."""
from __future__ import annotations
from .portfolio_quotes import fetch_live_prices
import statistics
from collections import defaultdict, deque
from datetime import datetime, timezone
import pandas as pd
from .market_data import _source_block
from .portfolio_import import parse_broker_file, _resolve_symbol, _clean_num, _find_header

def fifo_round_trips(trades: list[dict]) -> tuple[list[dict], float]:
    """FIFO-match buys to sells per symbol -> closed round trips + realized P&L."""
    lots: dict[str, deque] = defaultdict(deque)
    trips: list[dict] = []
    realized = 0.0
    for t in sorted(trades, key=lambda x: (x['trade_date'] or datetime.min, x['id'])):
        key = t['symbol'] or t['symbol_raw']
        if t['side'] == 'BUY':
            lots[key].append({'qty': t['quantity'], 'price': t['price'], 'date': t['trade_date']})
            continue
        remaining = t['quantity']
        while remaining > 1e-09 and lots[key]:
            lot = lots[key][0]
            take = min(remaining, lot['qty'])
            pnl = (t['price'] - lot['price']) * take
            realized += pnl
            days = None
            if lot['date'] and t['trade_date']:
                days = max((t['trade_date'] - lot['date']).days, 0)
            trips.append({'symbol': key, 'name': t['name'], 'qty': take, 'buy_price': lot['price'], 'sell_price': t['price'], 'pnl': round(pnl, 2), 'pnl_pct': round((t['price'] / lot['price'] - 1) * 100, 2) if lot['price'] else 0.0, 'days': days})
            lot['qty'] -= take
            remaining -= take
            if lot['qty'] <= 1e-09:
                lots[key].popleft()
    return (trips, round(realized, 2))

def behavior_profile(trips: list[dict], trades: list[dict]) -> dict:
    n = len(trips)
    if n < 5:
        return {'ready': False, 'round_trips': n, 'message': f'Only {n} closed round-trip(s) found — the Mirror needs at least 5 completed buy→sell cycles to say anything honest about your trading personality. Import a longer tradebook.'}
    wins = [t for t in trips if t['pnl'] > 0]
    losses = [t for t in trips if t['pnl'] <= 0]
    win_rate = round(len(wins) / n * 100, 1)
    avg_win = round(statistics.mean((t['pnl_pct'] for t in wins)), 2) if wins else 0.0
    avg_loss = round(statistics.mean((t['pnl_pct'] for t in losses)), 2) if losses else 0.0
    gross_win = sum((t['pnl'] for t in wins))
    gross_loss = abs(sum((t['pnl'] for t in losses)))
    profit_factor = round(gross_win / gross_loss, 2) if gross_loss else None
    holds = [t['days'] for t in trips if t['days'] is not None]
    median_hold = int(statistics.median(holds)) if holds else None
    traits = []
    if median_hold is not None:
        style = 'Scalper reflexes' if median_hold <= 3 else 'Swing trader' if median_hold <= 30 else 'Positional' if median_hold <= 90 else 'Investor patience'
        traits.append({'trait': 'Holding style', 'verdict': style, 'evidence': f'Median holding period: {median_hold} days across {len(holds)} trips.'})
    if wins and losses:
        if abs(avg_loss) > avg_win:
            traits.append({'trait': 'Exit discipline', 'verdict': 'Lets losers run', 'evidence': f'Average loss {avg_loss}% is larger than average win {avg_win}% — the classic loss-aversion pattern.'})
        else:
            traits.append({'trait': 'Exit discipline', 'verdict': 'Cuts losses, rides winners', 'evidence': f'Average win {avg_win}% vs average loss {avg_loss}%.'})
    traits.append({'trait': 'Hit rate', 'verdict': f'{win_rate}% winners', 'evidence': f'{len(wins)} winning vs {len(losses)} losing round trips (n={n}).'})
    if profit_factor is not None:
        verdict = 'Edge confirmed' if profit_factor >= 1.5 else 'Roughly break-even engine' if profit_factor >= 0.9 else 'Negative expectancy'
        traits.append({'trait': 'Profit factor', 'verdict': f'{profit_factor} — {verdict}', 'evidence': 'Gross profits ÷ gross losses on closed trips.'})
    sym_counts = defaultdict(int)
    for t in trades:
        sym_counts[t['name'] or t['symbol_raw']] += 1
    favorite = max(sym_counts.items(), key=lambda x: x[1]) if sym_counts else None
    if favorite and favorite[1] >= 4:
        traits.append({'trait': 'Favorite battlefield', 'verdict': favorite[0], 'evidence': f'{favorite[1]} trades in this name alone.'})
    badges = []
    if n >= 10:
        badges.append('🎖 10+ round trips')
    if profit_factor and profit_factor >= 1.5:
        badges.append('🏆 Profit factor 1.5+')
    if win_rate >= 55:
        badges.append('🎯 55%+ hit rate')
    if median_hold is not None and median_hold >= 90:
        badges.append('💎 Diamond hands')
    if median_hold is not None and 5 <= median_hold <= 30:
        badges.append('🌊 True swing trader')
    best = max(trips, key=lambda t: t['pnl'])
    worst = min(trips, key=lambda t: t['pnl'])
    return {'ready': True, 'round_trips': n, 'win_rate': win_rate, 'avg_win_pct': avg_win, 'avg_loss_pct': avg_loss, 'profit_factor': profit_factor, 'median_hold_days': median_hold, 'best_trade': best, 'worst_trade': worst, 'traits': traits, 'badges': badges}

def holdings_summary(holdings: list[dict], live: dict[str, float]) -> dict:
    positions = []
    invested = current = 0.0
    live_missing = 0
    for h in holdings:
        inv = h['quantity'] * h['avg_price']
        ltp = live.get(h['symbol']) if h['symbol'] else None
        if ltp is None:
            ltp = h.get('ltp_imported') or h['avg_price']
            live_missing += 1
            live_src = 'file/avg'
        else:
            live_src = 'live'
        cur = h['quantity'] * ltp
        invested += inv
        current += cur
        positions.append({'symbol': h['symbol'], 'symbol_raw': h['symbol_raw'], 'name': h['name'], 'quantity': h['quantity'], 'avg_price': round(h['avg_price'], 2), 'ltp': round(ltp, 2), 'ltp_source': live_src, 'invested': round(inv, 2), 'current': round(cur, 2), 'pnl': round(cur - inv, 2), 'pnl_pct': round((cur / inv - 1) * 100, 2) if inv else 0.0})
    positions.sort(key=lambda p: p['current'], reverse=True)
    for p in positions:
        p['weight_pct'] = round(p['current'] / current * 100, 2) if current else 0.0
    top3 = round(sum((p['weight_pct'] for p in positions[:3])), 1)
    return {'positions': positions, 'invested': round(invested, 2), 'current': round(current, 2), 'pnl': round(current - invested, 2), 'pnl_pct': round((current / invested - 1) * 100, 2) if invested else 0.0, 'position_count': len(positions), 'top3_concentration_pct': top3, 'live_quotes_missing': live_missing, 'as_of': datetime.now(timezone.utc).isoformat(timespec='seconds')}

def portfolio_source(note: str | None=None) -> dict:
    source = _source_block('') | {'provider': 'Imported broker data + Yahoo Finance daily closes', 'url': 'https://finance.yahoo.com/'}
    if note:
        source['note'] = note
    return source
