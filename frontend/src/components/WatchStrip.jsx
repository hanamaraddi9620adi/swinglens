export default function WatchStrip({ items = [], symbol, onOpen, onRemove, fallback = [] }) {
  const rows = items.length ? items : fallback.map(value => ({ symbol: value }))
  if (!rows.length) return null
  return <div className="flex flex-wrap items-center gap-2 mb-4" aria-label="Watchlist shortcuts">
    <span className="text-[11px] uppercase tracking-wider text-mist-400">Watchlist</span>
    {rows.map(row => <div key={row.symbol} className={`inline-flex max-w-full items-center rounded-xl border ${symbol === row.symbol ? 'border-brass-400/60 bg-brass-400/10' : 'border-ink-600'}`}>
      <button type="button" onClick={() => onOpen(row.symbol)} className="price text-xs px-3 py-3 truncate">{row.symbol.replace('.NS', '').replace('.BO', '')}
        {Number.isFinite(row.change_pct) && <span className={`ml-2 ${row.change_pct >= 0 ? 'text-bull-500' : 'text-bear-500'}`}>{row.change_pct >= 0 ? '+' : ''}{row.change_pct.toFixed(1)}%</span>}
      </button>
      {!!items.length && <button type="button" onClick={() => onRemove(row.symbol)} aria-label={`Remove ${row.symbol} from watchlist`} className="icon-button border-0 bg-transparent">×</button>}
    </div>)}
  </div>
}
