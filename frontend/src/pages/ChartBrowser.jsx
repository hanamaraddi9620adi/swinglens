import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import SourceFooter from '../components/SourceFooter'

export default function ChartBrowser({ onOpenSymbol, title = 'Find your next chart' }) {
  const [catalog, setCatalog] = useState(null), [category, setCategory] = useState('all')
  const [query, setQuery] = useState(''), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    let alive = true
    setError('')
    api.marketCatalog().then(data => { if (alive) setCatalog(data) }).catch(err => { if (alive) setError(err.message) })
    return () => { alive = false }
  }, [retry])
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (catalog?.segments || []).filter(segment => category === 'all' || segment.id === category)
      .flatMap(segment => segment.items.map(row => ({ ...row, category: `${segment.group} · ${segment.label}` })))
      .filter(row => `${row.name} ${row.symbol} ${row.category}`.toLowerCase().includes(needle))
  }, [catalog, category, query])
  return <section className="instrument-browser" aria-labelledby="chart-browser-title">
    <p className="text-xs uppercase tracking-[.18em] text-brass-400">Markets / Chart library</p>
    <h1 id="chart-browser-title" className="text-2xl sm:text-3xl text-mist-50 font-semibold mt-3">{title}</h1>
    <p className="text-sm text-mist-400 mt-2 max-w-xl">Choose an instrument to open its chart. Browse curated categories, or use the stock search above for other symbols.</p>
    <div className="flex flex-col sm:flex-row gap-3 mt-6 mb-4"><label className="flex-1"><span className="sr-only">Filter instruments</span><input className="search-input w-full" value={query} onChange={event => setQuery(event.target.value)} placeholder="Filter by company name or symbol…" /></label><p className="text-xs text-mist-400 self-center">{rows.length} instruments</p></div>
    <div className="flex flex-wrap gap-2 mb-6" aria-label="Instrument categories">
      <button type="button" aria-pressed={category === 'all'} className={`filter-pill ${category === 'all' ? 'is-active' : ''}`} onClick={() => setCategory('all')}>All markets</button>
      {(catalog?.segments || []).map(segment => <button type="button" key={segment.id} aria-pressed={category === segment.id} className={`filter-pill ${category === segment.id ? 'is-active' : ''}`} onClick={() => setCategory(segment.id)}>{segment.group === 'Indian Stocks' ? `India ${segment.label}` : segment.label}</button>)}
    </div>
    {!catalog && !error && <p role="status" className="text-sm py-12 text-mist-400">Loading instruments…</p>}
    {error && <div role="alert" className="text-sm text-bear-500 py-8">{error}<button type="button" className="quiet-button block mt-3" onClick={() => setRetry(n => n + 1)}>Retry instruments</button></div>}
    {catalog && !rows.length && <p className="text-sm py-10 text-mist-400">No instruments match this filter. Try another name or category.</p>}
    <div className="instrument-grid">{rows.map(row => <button type="button" key={row.symbol} onClick={() => onOpenSymbol(row.symbol)} className="instrument-card" aria-label={`Open ${row.name} chart`}>
      <span className="instrument-avatar" aria-hidden="true">{row.name.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase()}</span>
      <span className="flex-1 min-w-0"><span className="block text-sm text-mist-50 font-medium">{row.name}</span><span className="price text-[11px] text-mist-400 block mt-1">{row.symbol}</span><span className="text-[10px] text-mist-400 block mt-1">{row.category}</span></span><span className="text-mist-400" aria-hidden="true">↗</span>
    </button>)}</div>
    <SourceFooter source={catalog?.source} />
  </section>
}
