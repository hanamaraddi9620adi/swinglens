import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

export default function AlertBell({ onOpenSymbol }) {
  const [open, setOpen] = useState(false)
  const [alerts, setAlerts] = useState([])
  const [flash, setFlash] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)
  const alive = useRef(true)
  const load = () => api.alerts().then(data => { if (alive.current) { setAlerts(data.alerts || []); setError('') } }).catch(err => { if (alive.current) setError(err.message) })
  useEffect(() => {
    alive.current = true
    const check = () => api.checkAlerts().then(data => { if (alive.current) { if (data.triggered?.length) setFlash(true); load() } }).catch(() => {})
    check()
    const timer = setInterval(check, 300000)
    return () => { alive.current = false; clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (!open) return
    const close = event => { if (!ref.current?.contains(event.target)) setOpen(false) }
    const escape = event => { if (event.key === 'Escape') { setOpen(false); ref.current?.querySelector('button')?.focus() } }
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [open])
  const remove = async id => { try { await api.deleteAlert(id); await load() } catch (err) { setError(err.message) } }
  const triggered = alerts.filter(row => row.status === 'triggered').length
  return <div ref={ref} className="relative">
    <button type="button" onClick={() => { setOpen(value => !value); setFlash(false); load() }} aria-label="Price alerts" aria-expanded={open} className="icon-button relative">
      <span aria-hidden="true">♧</span>{(triggered > 0 || flash) && <span className="absolute -top-1 -right-1 rounded-full bg-brass-400 text-ink-950 text-[10px] px-1">{triggered || '!'}</span>}
    </button>
    {open && <section className="alert-panel" aria-label="Saved price alerts">
      <header className="flex items-center justify-between gap-3 mb-2"><h2 className="text-sm font-semibold">Price alerts</h2><button type="button" className="icon-button" aria-label="Close alerts" onClick={() => setOpen(false)}>×</button></header>
      {error && <p role="alert" className="text-xs text-bear-500 mb-2">{error}</p>}
      {!alerts.length && !error && <p className="text-xs text-mist-400 py-3">No alerts yet. Open a chart and choose Alert.</p>}
      {alerts.map(row => <div key={row.id} className="flex items-center gap-2 border-b border-ink-700 py-2">
        <button type="button" className="flex-1 text-left py-2" onClick={() => { onOpenSymbol(row.symbol); setOpen(false) }}><span className="price text-xs">{row.symbol}</span><span className={`block text-xs mt-1 ${row.status === 'triggered' ? 'text-brass-400' : 'text-mist-400'}`}>{row.status === 'triggered' ? 'Crossed' : 'Waiting'} {row.direction} {row.price}</span></button>
        <button type="button" className="icon-button" aria-label={`Delete alert for ${row.symbol}`} onClick={() => remove(row.id)}>×</button>
      </div>)}
      <p className="text-[10px] text-mist-400 mt-3">Checked every five minutes while the app is open.</p>
    </section>}
  </div>
}
