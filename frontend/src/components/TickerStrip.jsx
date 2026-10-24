import { useEffect, useState } from 'react'
import { api } from '../api'

export default function TickerStrip({ onOpenSymbol }) {
  const [items, setItems] = useState([])
  useEffect(() => {
    let alive = true
    const load = () => api.marketsOverview().then(data => { if (alive) setItems(data.items || []) }).catch(() => {})
    load(); const timer = setInterval(load, 300000)
    return () => { alive = false; clearInterval(timer) }
  }, [])
  if (!items.length) return null
  return <div className="marquee bg-ink-900 py-1 border-t border-ink-700" aria-label="Market overview ticker">
    <div className="marquee-track">{[0, 1].map(copy => <div key={copy} className="marquee-group" aria-hidden={copy === 1}>
      {items.map(item => <button type="button" key={item.symbol} tabIndex={copy ? -1 : 0} onClick={() => onOpenSymbol?.(item.symbol)} title={`Open ${item.name} chart`} className="inline-flex items-center gap-2 whitespace-nowrap px-4 py-2 text-[10px] hover:bg-ink-800">
        <span className="text-mist-400">{item.name}</span><span className="price">{item.currency}{item.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        <span className={`price ${item.change_pct >= 0 ? 'text-bull-500' : 'text-bear-500'}`}>{item.change_pct >= 0 ? '+' : ''}{item.change_pct?.toFixed(2)}%</span>
      </button>)}
    </div>)}</div>
  </div>
}
