import { useState } from 'react'
import { useDialog } from '../hooks/useDialog'

export default function IndicatorChips({ active, onUpdateParams, onRemove }) {
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState({})
  const [error, setError] = useState('')
  const current = active.find(row => row.uid === editing)
  const ref = useDialog(Boolean(current), () => setEditing(null))
  const apply = event => {
    event.preventDefault()
    const values = {}
    for (const [name, spec] of Object.entries(current.paramSpec || {})) {
      const value = spec.options ? draft[name] : Number(draft[name])
      if (spec.options ? !spec.options.includes(value) : !Number.isFinite(value) || (spec.min != null && value < spec.min) || (spec.max != null && value > spec.max)) { setError(`Enter a valid ${name}.`); return }
      values[name] = value
    }
    onUpdateParams(current.uid, values); setEditing(null)
  }
  return <>
    {!!active.length && <div className="flex flex-wrap gap-2 mt-3" aria-label="Active indicators">{active.map(row => <div key={row.uid} className="flex items-center gap-1 border border-ink-600 rounded-xl bg-ink-800 px-2 min-w-0">
      <span className="text-xs truncate max-w-48">{row.label}</span>
      {!!Object.keys(row.params || {}).length && <button type="button" className="icon-button border-0 bg-transparent" aria-label={`Settings for ${row.label}`} onClick={() => { setEditing(row.uid); setDraft({ ...row.params }); setError('') }}>⚙</button>}
      <button type="button" className="icon-button border-0 bg-transparent" aria-label={`Remove ${row.label}`} onClick={() => onRemove(row.uid)}>×</button>
    </div>)}</div>}
    {current && <div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setEditing(null) }}>
      <form ref={ref} role="dialog" aria-modal="true" aria-label={`${current.label} settings`} onSubmit={apply} className="modal-panel max-w-sm p-4 gap-3">
        <header className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">{current.label} settings</h2><button type="button" className="icon-button" aria-label="Close indicator settings" onClick={() => setEditing(null)}>×</button></header>
        <div className="modal-scroll space-y-3">{Object.entries(current.paramSpec || {}).map(([name, spec]) => <label key={name} className="block text-sm">{name}
          {spec.options ? <select value={draft[name]} onChange={event => setDraft(values => ({ ...values, [name]: event.target.value }))} className="search-input block w-full mt-1">{spec.options.map(option => <option key={option}>{option}</option>)}</select>
            : <input required type="number" step="any" min={spec.min} max={spec.max} value={draft[name] ?? ''} onChange={event => setDraft(values => ({ ...values, [name]: event.target.value }))} className="search-input block w-full mt-1" />}
        </label>)}</div>
        {error && <p role="alert" className="text-xs text-bear-500">{error}</p>}
        <div className="flex gap-2"><button className="action-button">Apply settings</button><button type="button" className="quiet-button" onClick={() => setEditing(null)}>Cancel</button></div>
      </form>
    </div>}
  </>
}
