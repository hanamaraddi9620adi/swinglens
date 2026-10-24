"""Bounded, local parsing of broker CSV and XLSX exports; no AI sees the file."""
from __future__ import annotations
import csv
import io
import math
import re
import zipfile
from datetime import datetime
from pathlib import Path
import pandas as pd
SYNONYMS = {'symbol': 'symbol|ticker|scrip|scrip code|trading symbol|stock symbol|instrument|tradingsymbol|nse symbol|security symbol', 'name': 'stock name|name|company|company name|security|instrument name|scrip name|name of the instrument|stock', 'qty': 'qty|quantity|shares|units|filled qty|net qty|quantity available|holding quantity|holdings|balance quantity|total quantity|qty available', 'price': 'price|avg price|average price|avg cost|average cost|buy price|purchase price|rate|trade price|avg buy price|average cost price|avg buy price|average buy price|buy average|cost price|buy avg|average buying price|average purchase price', 'side': 'type|side|transaction type|buy sell|order type|trade type|action|b s|buy or sell', 'date': 'date|trade date|order date|execution date|order execution time|timestamp|trade time|executed at', 'ltp': 'ltp|current price|cmp|last price|market price|closing price|close price|current value price'}
MAX_ROWS = 10000

def _norm_header(value):
    value = re.sub('\\([^)]*\\)|\\[[^]]*\\]', '', str(value).lower())
    return re.sub('[^a-z0-9]+', ' ', value).strip()

def _clean_num(value):
    if value is None:
        return None
    value = re.sub('(?:INR|USD|[₹$,\\s])', '', str(value), flags=re.I)
    value = value.replace('(', '-').replace(')', '')
    try:
        number = float(value)
        return number if math.isfinite(number) and abs(number) < 100000000000000.0 else None
    except (ValueError, TypeError):
        return None

def _find_header(df):
    best = (-1, {})
    for index in range(min(100, len(df))):
        row = [_norm_header(value) for value in df.iloc[index].tolist()]
        mapping = {}
        for field, names in SYNONYMS.items():
            for column, cell in enumerate(row):
                if cell in names.split('|') and field not in mapping:
                    mapping[field] = column
        if len(mapping) > len(best[1]):
            best = (index, mapping)
    cols = best[1]
    if not {'qty', 'price'} <= cols.keys() or not {'symbol', 'name'} & cols.keys():
        raise ValueError('Missing required columns. Include Symbol or Stock Name, Quantity, and Average Price (Trade Price for a tradebook). Export a holdings statement or tradebook, not a portfolio screenshot or P&L summary.')
    return best

def _read_tables(data, filename):
    try:
        extension = Path(filename).suffix.lower()
        if not data:
            raise ValueError('The file is empty. Choose a CSV or XLSX broker export.')
        if extension not in {'.csv', '.xlsx'}:
            raise ValueError('Use a .csv or .xlsx file. For legacy .xls files, open in Excel and Save As .xlsx first.')
        if extension == '.xlsx':
            try:
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    if sum((item.file_size for item in archive.infolist())) > 40 * 1024 * 1024:
                        raise ValueError('This workbook expands beyond the 40 MB processing limit. Export only the holdings or tradebook sheet.')
                with pd.ExcelFile(io.BytesIO(data), engine='openpyxl') as workbook:
                    if len(workbook.sheet_names) > 20:
                        raise ValueError('Use a workbook with at most 20 sheets.')
                    return [(sheet, workbook.parse(sheet, header=None, dtype=str, nrows=MAX_ROWS + 102)) for sheet in workbook.sheet_names]
            except ValueError:
                raise
            except Exception as exc:
                raise ValueError('Cannot read this XLSX workbook. It may be damaged or password protected. Export a fresh XLSX or CSV file.') from exc
        try:
            text = data.decode('utf-16' if data.startswith((b'\xff\xfe', b'\xfe\xff')) else 'utf-8-sig')
        except UnicodeDecodeError:
            text = data.decode('cp1252')
        candidates = []
        for delimiter in (',', ';', '\t', '|'):
            rows = list(csv.reader(io.StringIO(text), delimiter=delimiter))
            if len(rows) > MAX_ROWS + 102:
                raise ValueError('The file exceeds 10,000 data rows. Split it into smaller broker exports.')
            width = max((len(row) for row in rows), default=0)
            if width > 200:
                continue
            frame = pd.DataFrame([row + [''] * (width - len(row)) for row in rows], dtype=str)
            try:
                _, cols = _find_header(frame)
                candidates.append((len(cols), frame))
            except ValueError:
                pass
        if not candidates:
            raise ValueError('Cannot recognize this CSV. Include Symbol or Stock Name, Quantity, and Average Price columns; comma, semicolon and tab separators are supported.')
        return [('CSV', max(candidates, key=lambda item: item[0])[1])]
    except csv.Error:
        raise ValueError('CSV contains malformed or oversized cells. Export a fresh holdings or tradebook CSV.')

def _resolve_symbol(raw_symbol, raw_name):
    from .markets import SEGMENTS, local_search
    known = {}
    for segment in SEGMENTS.values():
        known.update(segment['symbols'])

    def exact_symbol(value):
        for candidate in (value, value + '.NS', value + '.BO'):
            if candidate in known:
                return (candidate, known[candidate])
        return None
    if raw_symbol:
        symbol = str(raw_symbol).strip().upper()
        for prefix, suffix in (('NSE:', '.NS'), ('BSE:', '.BO'), ('NASDAQ:', ''), ('NYSE:', '')):
            if symbol.startswith(prefix):
                symbol = symbol[len(prefix):] + suffix
                if not re.fullmatch('[A-Z0-9&.\\-]{1,24}', symbol):
                    return (None, raw_name or raw_symbol)
                return (symbol, known.get(symbol, raw_name or symbol))
        hit = exact_symbol(symbol)
        if hit:
            return hit
        if symbol.endswith(('.NS', '.BO')) and re.fullmatch('[A-Z0-9&.\\-]{1,24}', symbol):
            return (symbol, raw_name or symbol)
    if raw_name:
        hit = exact_symbol(str(raw_name).strip().upper())
        if hit:
            return hit

        def normalize(value):
            return re.sub('\\b(limited|ltd|inc|corporation|corp)\\b|[^a-z0-9]', '', str(value).lower())
        for hit in local_search(str(raw_name), limit=10):
            if normalize(hit['name']) == normalize(raw_name):
                return (hit['symbol'], hit['name'])
    return (None, raw_name or raw_symbol or 'Unknown')

def parse_broker_file(data: bytes, filename: str) -> dict:
    candidates = []
    for sheet, frame in _read_tables(data, filename):
        try:
            header, cols = _find_header(frame)
            candidates.append((len(cols), sheet, frame, header, cols))
        except ValueError:
            pass
    if not candidates:
        raise ValueError('No sheet contains Symbol or Stock Name, Quantity, and Average Price columns. Export a holdings statement or tradebook.')
    _, sheet, frame, header, cols = max(candidates, key=lambda item: item[0])
    body = frame.iloc[header + 1:]
    if len(body) > MAX_ROWS:
        raise ValueError('The sheet exceeds 10,000 data rows. Split the export.')
    kind = 'tradebook' if 'side' in cols else 'holdings'
    rows, skipped, missing_dates = ([], 0, 0)
    for _, record in body.iterrows():

        def get(field):
            value = record.iloc[cols[field]] if field in cols else None
            return None if value is None or pd.isna(value) else str(value).strip() or None
        if not any((get(field) for field in cols)):
            continue
        qty, price = (_clean_num(get('qty')), _clean_num(get('price')))
        raw_symbol, raw_name = (get('symbol'), get('name'))
        if qty is None or price is None or qty == 0 or (price < 0) or (not (raw_symbol or raw_name)) or (kind == 'holdings' and qty < 0) or ((raw_symbol or raw_name).lower() in {'total', 'grand total', 'subtotal'}):
            skipped += 1
            continue
        symbol, name = _resolve_symbol(raw_symbol, raw_name)
        ltp = _clean_num(get('ltp'))
        row = {'symbol_raw': (raw_symbol or raw_name)[:64], 'symbol': symbol, 'name': str(name)[:120], 'quantity': abs(qty), 'price': price, 'ltp': ltp if ltp is not None and ltp > 0 else None}
        if kind == 'tradebook':
            side = (get('side') or '').upper()
            row['side'] = {'B': 'BUY', 'BUY': 'BUY', 'BOUGHT': 'BUY', 'S': 'SELL', 'SELL': 'SELL', 'SOLD': 'SELL'}.get(side)
            if not row['side']:
                skipped += 1
                continue
            date = get('date')
            dt = pd.to_datetime(date, errors='coerce', dayfirst=not bool(date and re.match('^\\d{4}-', date))) if date else pd.NaT
            row['trade_date'] = None if pd.isna(dt) else dt.to_pydatetime().replace(tzinfo=None)
            missing_dates += row['trade_date'] is None
        rows.append(row)
    if not rows:
        raise ValueError('No usable rows found. Check that quantities and prices are numeric and that trade sides are BUY/SELL. Short holdings and negative prices are not supported.')
    return {'kind': kind, 'rows': rows, 'report': {'sheet': sheet, 'header_row': header + 1, 'columns_mapped': cols, 'imported': len(rows), 'skipped': skipped, 'missing_trade_dates': missing_dates, 'unresolved_symbols': sum((not row['symbol'] for row in rows))}}
