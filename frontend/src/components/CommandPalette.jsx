import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useDialog } from '../hooks/useDialog'

const actions = [
  ['pulse', 'Open Pulse — market news'], ['explore', 'Open Explore — market segments'],
  ['chart', 'Open Chart — choose a stock'], ['research', 'Open Research'],
  ['thesis', 'Open Thesis Monitor'], ['portfolio', 'Open Portfolio'], ['discover', 'Open Discover — ranked stocks'],
]

export default function CommandPalette({ open, onClose, onNavigate, onOpenSymbol }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const version = useRef(0)
  const ref = useDialog(open, onClose)
  useEffect(() => { if (open) { setQuery(''); setResults([]); setIndex(0); setError('') } }, [open])
  useEffect(() => {
    const current = ++version.current
    setResults([]); setError(''); setLoading(false)
    if (!open || query.trim().length < 2) return
    setLoading(true)
    const timer = setTimeout(() => api.searchStocks(query.trim())
      .then(data => { if (current === version.current) setResults(data.results || []) })
      .catch(err => { if (current === version.current) setError(err.message) })
      .finally(() => { if (current === version.current) setLoading(false) }), 250)
    return () => { clearTimeout(timer); version.current++ }
  }, [open, query])
  const items = useMemo(() => [
    ...results.map(row => ({ id: row.symbol, label: `${row.name} · ${row.symbol}`, run: () => onOpenSymbol(row.symbol) })),
    ...actions.filter(([, label]) => label.toLowerCase().includes(query.toLowerCase())).map(([id, label]) => ({ id, label, run: () => onNavigate(id) })),
  ], [results, query, onOpenSymbol, onNavigate])
  useEffect(() => { ref.current?.querySelector(`[data-command-index="${index}"]`)?.scrollIntoView({ block: 'nearest' }) }, [index])
  if (!open) return null
  const choose = item => { item?.run(); onClose() }
  return <div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="command-title" className="modal-panel command-panel">
      <header className="modal-heading"><h2 id="command-title">Search & commands</h2><button type="button" className="icon-button" aria-label="Close commands" onClick={onClose}>×</button></header>
      <input aria-label="Search commands or stocks" className="modal-search" value={query} maxLength={40}
        placeholder="Company name, symbol, or command…" onChange={event => { setQuery(event.target.value); setIndex(0) }}
        onKeyDown={event => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setIndex(i => items.length ? (i + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length : 0)
          } else if (event.key === 'Enter') { event.preventDefault(); choose(items[index]) }
        }} />
      <div className="modal-scroll" aria-live="polite">
        {loading && <p className="p-3 text-sm text-mist-400">Searching…</p>}
        {error && <p role="alert" className="p-3 text-sm text-bear-500">{error}</p>}
        {!items.length && !loading && !error && <p className="p-4 text-sm text-mist-400">No results. Try another name.</p>}
        {items.map((item, i) => <button type="button" key={item.id} data-command-index={i}
          onPointerMove={() => setIndex(i)} onClick={() => choose(item)} className={`command-item ${index === i ? 'is-active' : ''}`}>{item.label}</button>)}
      </div>
      <p className="p-3 text-xs text-mist-400 border-t border-ink-700">↑↓ navigate · Enter select · Escape close</p>
    </section>
  </div>
}
