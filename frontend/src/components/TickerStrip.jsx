import { useEffect, useState } from 'react'
import { api } from '../api'

function Item({ it }) {
  const up = it.change_pct >= 0
  return (
    <span className="inline-flex items-baseline gap-2 px-5 whitespace-nowrap">
      <span className="text-[11px] uppercase tracking-wider text-mist-400">{it.name}</span>
      <span className="price text-xs text-mist-50">
        {it.currency}{it.price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </span>
      <span className={`price text-[11px] ${up ? 'text-bull-500' : 'text-bear-500'}`}>
        {up ? '▲' : '▼'} {Math.abs(it.change_pct ?? 0).toFixed(2)}%
      </span>
    </span>
  )
}

export default function TickerStrip() {
  const [items, setItems] = useState([])

  useEffect(() => {
    let alive = true
    const load = () => api.marketsOverview().then((d) => alive && setItems(d.items || [])).catch(() => {})
    load()
    const t = setInterval(load, 5 * 60 * 1000) // matches backend cache TTL
    return () => { alive = false; clearInterval(t) }
  }, [])

  if (items.length === 0) return null

  return (
    <div className="marquee border-b border-ink-700 bg-ink-900/70 py-1.5 overflow-hidden" aria-label="Market overview ticker">
      <div className="marquee-track">
        {[0, 1].map((copy) => (
          <div key={copy} className="marquee-group" aria-hidden={copy === 1}>
            {items.map((it) => <Item key={`${copy}-${it.symbol}`} it={it} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
