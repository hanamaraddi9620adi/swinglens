"""Markets explorer service.

Curated universes per asset class (edit the lists freely), quoted in one
batched Yahoo fetch per segment with a TTL cache so browsing stays fast and
rate-limit friendly. Full-market screening (every NSE stock) arrives with
the licensed/broker data feed in Phase 5 — these curated lists are the
honest free-tier version.
"""
from __future__ import annotations

import time

import yfinance as yf

from .market_data import PROVIDER_NAME, _source_block

_CACHE: dict[str, tuple[float, dict]] = {}
_TTL_SECONDS = 300

# ---------------------------------------------------------------- universes
# name -> display label; symbol lists are curated and editable.

INDIA_LARGE = {
    "RELIANCE.NS": "Reliance Industries", "HDFCBANK.NS": "HDFC Bank", "ICICIBANK.NS": "ICICI Bank",
    "INFY.NS": "Infosys", "TCS.NS": "TCS", "ITC.NS": "ITC", "LT.NS": "Larsen & Toubro",
    "SBIN.NS": "State Bank of India", "AXISBANK.NS": "Axis Bank", "KOTAKBANK.NS": "Kotak Mahindra Bank",
    "BHARTIARTL.NS": "Bharti Airtel", "HINDUNILVR.NS": "Hindustan Unilever", "BAJFINANCE.NS": "Bajaj Finance",
    "ASIANPAINT.NS": "Asian Paints", "MARUTI.NS": "Maruti Suzuki", "M&M.NS": "Mahindra & Mahindra",
    "TITAN.NS": "Titan", "SUNPHARMA.NS": "Sun Pharma", "NTPC.NS": "NTPC", "POWERGRID.NS": "Power Grid",
    "ULTRACEMCO.NS": "UltraTech Cement", "ONGC.NS": "ONGC", "TATAMOTORS.NS": "Tata Motors",
    "TATASTEEL.NS": "Tata Steel", "JSWSTEEL.NS": "JSW Steel", "ADANIENT.NS": "Adani Enterprises",
    "ADANIPORTS.NS": "Adani Ports", "COALINDIA.NS": "Coal India", "WIPRO.NS": "Wipro", "HCLTECH.NS": "HCL Tech",
}

INDIA_MID = {
    "CUMMINSIND.NS": "Cummins India", "POLYCAB.NS": "Polycab", "PERSISTENT.NS": "Persistent Systems",
    "ASTRAL.NS": "Astral", "AUROPHARMA.NS": "Aurobindo Pharma", "BHARATFORG.NS": "Bharat Forge",
    "COFORGE.NS": "Coforge", "DIXON.NS": "Dixon Technologies", "ESCORTS.NS": "Escorts Kubota",
    "FEDERALBNK.NS": "Federal Bank", "GODREJPROP.NS": "Godrej Properties", "BHEL.NS": "BHEL",
    "INDHOTEL.NS": "Indian Hotels", "JUBLFOOD.NS": "Jubilant FoodWorks", "LUPIN.NS": "Lupin",
    "MPHASIS.NS": "Mphasis", "PIIND.NS": "PI Industries", "SAIL.NS": "SAIL",
    "TATAPOWER.NS": "Tata Power", "VOLTAS.NS": "Voltas",
}

INDIA_SMALL = {
    "SUZLON.NS": "Suzlon Energy", "RVNL.NS": "Rail Vikas Nigam", "HUDCO.NS": "HUDCO",
    "COCHINSHIP.NS": "Cochin Shipyard", "CDSL.NS": "CDSL", "IEX.NS": "Indian Energy Exchange",
    "TANLA.NS": "Tanla Platforms", "TRIDENT.NS": "Trident", "RAILTEL.NS": "RailTel",
    "JYOTHYLAB.NS": "Jyothy Labs", "HFCL.NS": "HFCL", "IDEA.NS": "Vodafone Idea",
    "YESBANK.NS": "Yes Bank", "SOUTHBANK.NS": "South Indian Bank", "PNBHOUSING.NS": "PNB Housing",
    "MAPMYINDIA.NS": "MapmyIndia", "BSE.NS": "BSE Ltd", "GESHIP.NS": "GE Shipping",
    "FINCABLES.NS": "Finolex Cables", "KTKBANK.NS": "Karnataka Bank",
}

US_STOCKS = {
    "AAPL": "Apple", "MSFT": "Microsoft", "NVDA": "NVIDIA", "GOOGL": "Alphabet", "AMZN": "Amazon",
    "META": "Meta Platforms", "TSLA": "Tesla", "BRK-B": "Berkshire Hathaway", "AVGO": "Broadcom",
    "JPM": "JPMorgan Chase", "V": "Visa", "LLY": "Eli Lilly", "XOM": "Exxon Mobil", "MA": "Mastercard",
    "COST": "Costco", "HD": "Home Depot", "NFLX": "Netflix", "BAC": "Bank of America",
    "AMD": "AMD", "KO": "Coca-Cola", "WMT": "Walmart", "DIS": "Disney", "CRM": "Salesforce",
    "ADBE": "Adobe", "PEP": "PepsiCo",
}

ETFS = {
    "NIFTYBEES.NS": "Nippon Nifty 50 BeES", "BANKBEES.NS": "Nippon Bank BeES",
    "GOLDBEES.NS": "Nippon Gold BeES", "SILVERBEES.NS": "Nippon Silver BeES",
    "JUNIORBEES.NS": "Nippon Junior BeES", "ITBEES.NS": "Nippon IT BeES",
    "PHARMABEES.NS": "Nippon Pharma BeES", "CPSEETF.NS": "CPSE ETF", "MON100.NS": "Motilal Nasdaq 100",
    "SPY": "SPDR S&P 500", "QQQ": "Invesco Nasdaq 100", "VTI": "Vanguard Total Market",
    "GLD": "SPDR Gold Shares", "SLV": "iShares Silver", "DIA": "SPDR Dow Jones",
    "IWM": "iShares Russell 2000", "SMH": "VanEck Semiconductor", "XLE": "Energy Select SPDR",
}

COMMODITIES = {
    "GC=F": "Gold (COMEX)", "SI=F": "Silver (COMEX)", "CL=F": "Crude Oil WTI",
    "BZ=F": "Brent Crude", "NG=F": "Natural Gas", "HG=F": "Copper",
    "PL=F": "Platinum", "PA=F": "Palladium",
}

CRYPTO = {
    "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana", "XRP-USD": "XRP",
    "BNB-USD": "BNB", "DOGE-USD": "Dogecoin", "ADA-USD": "Cardano",
}

SEGMENTS: dict[str, dict] = {
    "india_large": {"label": "Large Cap", "group": "Indian Stocks", "symbols": INDIA_LARGE},
    "india_mid": {"label": "Mid Cap", "group": "Indian Stocks", "symbols": INDIA_MID},
    "india_small": {"label": "Small Cap", "group": "Indian Stocks", "symbols": INDIA_SMALL},
    "us": {"label": "US Stocks", "group": "US Stocks", "symbols": US_STOCKS},
    "etf": {"label": "ETFs", "group": "ETFs", "symbols": ETFS},
    "commodity": {"label": "Commodities", "group": "Commodities", "symbols": COMMODITIES,
                  "note": "Global futures prices in USD (COMEX/NYMEX) — not MCX INR quotes."},
    "crypto": {"label": "Crypto", "group": "Crypto", "symbols": CRYPTO},
}

OVERVIEW = [
    ("NIFTY 50", "^NSEI"), ("SENSEX", "^BSESN"), ("BANK NIFTY", "^NSEBANK"),
    ("S&P 500", "^GSPC"), ("NASDAQ", "^IXIC"), ("GOLD", "GC=F"),
    ("CRUDE WTI", "CL=F"), ("USD/INR", "INR=X"), ("BITCOIN", "BTC-USD"),
]


def _currency_prefix(symbol: str) -> str:
    if symbol.endswith((".NS", ".BO")):
        return "₹"
    if symbol.startswith("^") or symbol == "INR=X":
        return ""
    return "$"


def _batch_quotes(symbol_names: dict[str, str]) -> list[dict]:
    symbols = list(symbol_names)
    df = yf.download(symbols, period="5d", interval="1d", group_by="ticker",
                     progress=False, threads=True, auto_adjust=False)
    items = []
    for sym in symbols:
        try:
            sub = df[sym] if len(symbols) > 1 else df
            closes = [float(x) for x in sub["Close"].dropna().tolist()]
            if not closes:
                continue
            last = closes[-1]
            prev = closes[-2] if len(closes) > 1 else last
            vol_series = sub["Volume"].dropna().tolist()
            items.append({
                "symbol": sym,
                "name": symbol_names[sym],
                "price": round(last, 2),
                "change": round(last - prev, 2),
                "change_pct": round((last - prev) / prev * 100, 2) if prev else 0.0,
                "volume": int(vol_series[-1]) if vol_series else 0,
                "spark": [round(c, 4) for c in closes],
                "currency": _currency_prefix(sym),
            })
        except Exception:
            continue
    return items


def _cached(key: str, builder) -> dict:
    now = time.time()
    hit = _CACHE.get(key)
    if hit and now - hit[0] < _TTL_SECONDS:
        return hit[1]
    data = builder()
    _CACHE[key] = (now, data)
    return data


def get_overview() -> dict:
    def build():
        items = _batch_quotes({sym: name for name, sym in OVERVIEW})
        order = {sym: i for i, (_, sym) in enumerate(OVERVIEW)}
        items.sort(key=lambda x: order.get(x["symbol"], 99))
        return {"items": items, "source": _source_block("", None) | {"provider": PROVIDER_NAME}}
    return _cached("overview", build)


def get_segment(segment: str) -> dict:
    if segment not in SEGMENTS:
        raise KeyError(f"Unknown segment '{segment}'. Use one of {list(SEGMENTS)}")
    seg = SEGMENTS[segment]

    def build():
        items = _batch_quotes(seg["symbols"])
        items.sort(key=lambda x: x["change_pct"], reverse=True)
        return {
            "segment": segment, "label": seg["label"], "group": seg["group"],
            "note": seg.get("note"),
            "items": items,
            "source": _source_block("", None) | {"provider": PROVIDER_NAME},
        }
    return _cached(f"segment:{segment}", build)


def list_segments() -> list[dict]:
    return [{"id": k, "label": v["label"], "group": v["group"]} for k, v in SEGMENTS.items()]
