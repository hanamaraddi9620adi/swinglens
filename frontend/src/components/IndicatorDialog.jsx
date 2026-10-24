import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { useDialog } from '../hooks/useDialog'
const categories = ['All', 'Trend', 'Momentum', 'Volatility', 'Volume', 'Levels']

export default function IndicatorDialog({ open, onClose, onAdd, activeIds = [] }) {
  const [catalog, setCatalog] = useState([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const [expanded, setExpanded] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const ref = useDialog(open, onClose)
  useEffect(() => {
    if (!open || catalog.length) return
    let alive = true
    setLoading(true); setError('')
    api.indicatorCatalog().then(data => { if (alive) setCatalog(data.indicators || []) })
      .catch(err => { if (alive) setError(err.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [open, catalog.length, retry])
  const filtered = useMemo(() => catalog.filter(item => (category === 'All' || item.category === category) &&
    `${item.name} ${item.id} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase())), [catalog, category, query])
  if (!open) return null
  return <div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="indicator-title" className="modal-panel">
      <header className="modal-heading"><div><h2 id="indicator-title">Indicators</h2><p className="text-xs text-mist-400 mt-1">Understand the signal before adding it.</p></div>
        <button type="button" className="icon-button" aria-label="Close indicators" onClick={onClose}>×</button></header>
      <div className="p-3 sm:p-5 space-y-3 shrink-0">
        <input aria-label="Search indicators" value={query} onChange={event => setQuery(event.target.value)} placeholder="RSI, moving average, volume…" className="search-input w-full" />
        <div className="flex flex-wrap gap-2">{categories.map(item => <button type="button" key={item} aria-pressed={category === item}
          onClick={() => setCategory(item)} className={`filter-pill ${category === item ? 'is-active' : ''}`}>{item}</button>)}</div>
      </div>
      <div className="modal-scroll p-3 sm:px-5">
        {loading && <p role="status" className="p-3 text-sm">Loading indicators…</p>}
        {error && <div role="alert" className="text-sm text-bear-500 p-3">{error}<button type="button" onClick={() => setRetry(n => n + 1)} className="block text-brass-400 mt-2">Retry</button></div>}
        {!loading && !error && filtered.map(item => <article key={item.id} className="indicator-row">
          <div className="flex items-center gap-2 min-w-0">
            <button type="button" aria-expanded={expanded === item.id} className="flex-1 min-w-0 text-left py-2"
              onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
              <span className="block text-sm font-medium">{item.name}</span><span className="text-xs text-mist-400">{item.category} · {item.level} · {item.pane === 'overlay' ? 'On chart' : 'Separate pane'}</span>
            </button>
            <button type="button" aria-label={`Add ${item.name}`} className="action-button shrink-0" onClick={() => onAdd(item)}>{activeIds.includes(item.id) ? 'Add again' : '+ Add'}</button>
          </div>
          {expanded === item.id && <div className="text-xs leading-relaxed pb-3"><p>{item.description}</p><p className="text-mist-400 mt-2">{item.how_to_read}</p></div>}
        </article>)}
        {!loading && !error && !filtered.length && <p className="p-4 text-sm text-mist-400">No indicators match your search.</p>}
      </div>
    </section>
  </div>
}
