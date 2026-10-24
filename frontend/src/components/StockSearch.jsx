import { useEffect, useId, useRef, useState } from 'react'
import { api } from '../api'

export default function StockSearch({ onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [active, setActive] = useState(-1)
  const box = useRef(null)
  const generation = useRef(0)
  const id = useId()

  useEffect(() => {
    const close = event => { if (!box.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [])

  useEffect(() => {
    const version = ++generation.current
    setActive(-1); setError(''); setResults([])
    if (query.trim().length < 2) { setLoading(false); setOpen(false); return }
    setLoading(true); setOpen(true)
    const timer = setTimeout(async () => {
      try {
        const data = await api.searchStocks(query.trim())
        if (version === generation.current) setResults(data.results || [])
      } catch (err) {
        if (version === generation.current) setError(err.message)
      } finally {
        if (version === generation.current) setLoading(false)
      }
    }, 250)
    return () => { clearTimeout(timer); generation.current++ }
  }, [query])

  useEffect(() => {
    if (active >= 0) box.current?.querySelector(`[data-result-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const select = row => { generation.current++; setQuery(''); setOpen(false); onSelect(row.symbol) }
  const keyDown = event => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setOpen(true)
      setActive(index => results.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length : -1)
    }
    if (event.key === 'Enter' && results.length) { event.preventDefault(); select(results[Math.max(active, 0)]) }
  }

  return <div ref={box} className="stock-search">
    <div className="search-field">
      <span aria-hidden="true" className="text-mist-400">⌕</span>
      <input role="combobox" aria-label="Search stocks" aria-autocomplete="list" aria-expanded={open}
        aria-controls={id} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined}
        value={query} maxLength={40} autoComplete="off" autoCorrect="off" spellCheck={false}
        onChange={event => setQuery(event.target.value)} onKeyDown={keyDown}
        onFocus={() => { if (query.trim().length >= 2) setOpen(true) }}
        placeholder="Search stocks, ETFs, crypto…" />
      {loading ? <span aria-label="Searching" className="spinner" /> : query &&
        <button type="button" aria-label="Clear stock search" onClick={() => { setQuery(''); box.current?.querySelector('input')?.focus() }}>×</button>}
    </div>
    {open && <div className="search-results" id={id} role="listbox" aria-label="Stock search results">
      {loading && <p role="status" className="p-4 text-sm text-mist-400">Searching…</p>}
      {!loading && error && <p role="alert" className="p-4 text-sm text-bear-500">{error}</p>}
      {!loading && !error && !results.length && <p className="p-4 text-sm text-mist-400">No matches. Try a company name or symbol.</p>}
      {!loading && results.map((row, index) => <button type="button" key={row.symbol}
        id={`${id}-${index}`} role="option" aria-selected={index === active} data-result-index={index}
        onClick={() => select(row)} className={`search-result ${index === active ? 'is-active' : ''}`}>
        <span className="min-w-0"><span className="block font-medium truncate">{row.name}</span><span className="price text-xs text-mist-400">{row.symbol}</span></span>
        <span className="market-badge">{row.symbol.endsWith('.NS') ? 'NSE' : row.symbol.endsWith('.BO') ? 'BSE' : row.exchange || row.type || 'Global'}</span>
      </button>)}
    </div>}
  </div>
}
