import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

function Rich({ text = '' }) {
  return text.split('\n').map((line, i) => <p key={i} className="my-1 whitespace-pre-wrap">{
    line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => part.startsWith('**')
      ? <strong key={j}>{part.slice(2, -2)}</strong> : part)
  }</p>)
}

function ScanCard({ scan, onAnalyze, onOpenSymbol }) {
  return <div className="bg-ink-800 border border-ink-600 rounded-lg p-3 space-y-2">
    <p className="text-sm font-semibold">Engine scan · {scan.universe}</p>
    <p className="text-xs text-mist-400">{scan.scanned} stocks scanned; {scan.failed || 0} unavailable.</p>
    {!scan.actionable?.length && <p className="text-xs">No qualifying setups right now.</p>}
    {['actionable', 'watchlist'].map(kind => <div key={kind}>
      {!!scan[kind]?.length && <p className="text-xs text-brass-400 capitalize my-2">{kind}</p>}
      {scan[kind]?.map(r => <div key={r.symbol} className="flex items-center gap-2 py-2 text-xs border-b border-ink-700">
        <span className="flex-1">{r.name || r.symbol}<span className="block text-mist-400">{r.symbol} · {r.state?.replaceAll('_', ' ')}</span></span>
        <span className="price">{kind === 'actionable' ? `Confidence ${r.confidence}` : `RSI ${r.rsi ?? '—'}`}</span>
        <button type="button" onClick={() => kind === 'actionable' ? onAnalyze?.(r.symbol) : onOpenSymbol?.(r.symbol)} className="text-brass-400">{kind === 'actionable' ? 'Analyze' : 'Open'}</button>
      </div>)}
    </div>)}
    {scan.source?.url && <a className="text-xs text-brass-400" href={scan.source.url} target="_blank" rel="noreferrer">{scan.source.provider || 'Data source'}</a>}
    <p className="text-xs text-mist-400">{scan.source?.note}</p>
  </div>
}

const suggestions = ['Scan the market for bullish setups', 'Analyse this stock', 'Explain the risks in this setup', 'Teach me the buy-the-dip strategy']

export default function AIChat({ onAnalyze, onOpenSymbol, context }) {
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [full, setFull] = useState(false)
  const [convId, setConvId] = useState(null)
  const [convs, setConvs] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const [lastScan, setLastScan] = useState(null)
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(null)
  const endRef = useRef(null)
  const busyRef = useRef(false)
  const generation = useRef(0)
  const mounted = useRef(true)

  const refreshStatus = () => api.aiStatus().then(s => { if (mounted.current) setStatus(s) }).catch(() => { if (mounted.current) setStatus({ online: false, detail: 'Could not check cloud AI. You can still try sending a message.' }) })
  const refreshHistory = () => api.aiConversations().then(c => { if (mounted.current) setConvs(c) }).catch(() => {})
  useEffect(() => {
    mounted.current = true
    refreshStatus(); refreshHistory()
    const timer = setInterval(refreshStatus, 60000)
    return () => { mounted.current = false; generation.current++; clearInterval(timer) }
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }, [messages, busy])
  useEffect(() => {
    if (!full) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const escape = e => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', escape)
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', escape) }
  }, [full])

  const newChat = () => {
    if (busyRef.current) return
    generation.current++
    setConvId(null); setMessages([]); setLastScan(null); setNotice(''); setShowHistory(false)
  }
  const openConversation = async id => {
    if (busyRef.current) return
    const version = ++generation.current
    setNotice('')
    try {
      const rows = await api.aiMessages(id)
      if (version !== generation.current || !mounted.current) return
      const parsed = rows.map(m => {
        if (m.role === 'scan') {
          try { return { role: 'scan', scan: JSON.parse(m.content) } } catch { return { role: 'error', text: 'This saved scan could not be loaded.' } }
        }
        return { role: m.role, text: m.content }
      })
      setConvId(id); setMessages(parsed); setLastScan(parsed.findLast(m => m.scan)?.scan || null); setShowHistory(false)
    } catch (err) { if (version === generation.current) setNotice(err.message) }
  }
  const removeConversation = async id => {
    if (busyRef.current) return
    try {
      await api.aiDeleteConversation(id)
      setConvs(c => c.filter(x => x.id !== id))
      if (id === convId) newChat()
    } catch (err) { setNotice(err.message) }
  }
  const send = async value => {
    const text = value.trim()
    if (!text || busyRef.current || text.length > 4000) return
    busyRef.current = true
    const version = ++generation.current
    setInput(''); setBusy(true); setNotice('')
    setMessages(m => [...m, { role: 'user', text }])
    try {
      const ctx = { ...context, last_scan: lastScan ? { universe: lastScan.universe, as_of: lastScan.as_of, actionable: lastScan.actionable, watchlist: lastScan.watchlist } : null }
      const res = await api.aiChat(text, ctx, convId)
      if (!mounted.current || version !== generation.current) return
      setConvId(res.conversation_id)
      setMessages(m => [...m, { role: 'ai', text: res.reply, provider: res.provider, source: res.source }])
      if (res.action?.type === 'analyze') await onAnalyze?.(res.action.symbol)
      if (res.action?.type === 'scan') {
        const scan = await api.runScan(res.action.segment)
        if (!mounted.current || version !== generation.current) return
        setLastScan(scan); setMessages(m => [...m, { role: 'scan', scan }])
      }
    } catch (err) {
      if (mounted.current && version === generation.current) {
        if (err.detail?.conversation_id) setConvId(err.detail.conversation_id)
        setMessages(m => [...m, { role: 'error', text: err.message }])
        setInput(text)
      }
    } finally {
      busyRef.current = false
      if (mounted.current) { setBusy(false); refreshStatus(); refreshHistory() }
    }
  }
  const copy = async (text, i) => {
    try { await navigator.clipboard.writeText(text); setCopied(i) } catch { setNotice('Clipboard access is unavailable in this browser.') }
  }

  return <aside aria-label="SwingLens AI chat" className={full ? 'fixed inset-0 z-50 bg-ink-950 flex flex-col' : 'flex flex-col bg-ink-900 border border-ink-700 rounded-xl overflow-hidden min-h-[420px] max-h-[560px]'}>
    <header className="flex items-center gap-2 p-3 border-b border-ink-700">
      <span className={`w-2 h-2 rounded-full ${status?.online ? 'bg-bull-500' : 'bg-brass-400'}`} />
      <h3 className="text-sm font-semibold">SwingLens AI</h3>
      <span className="text-xs text-brass-400 truncate">{context?.symbol}</span>
      <div className="ml-auto flex gap-2 text-xs">
        <button type="button" disabled={busy} onClick={() => { setShowHistory(v => !v); refreshHistory() }}>History</button>
        <button type="button" disabled={busy} onClick={newChat}>New</button>
        <button type="button" aria-label={full ? 'Exit fullscreen' : 'Fullscreen chat'} onClick={() => setFull(v => !v)}>{full ? 'Close' : 'Expand'}</button>
      </div>
    </header>
    {showHistory && <div className="max-h-40 overflow-y-auto p-3 border-b border-ink-700 text-xs">
      {!convs.length && <p>No saved conversations yet.</p>}
      {convs.map(c => <div key={c.id} className="flex gap-2 py-2">
        <button type="button" disabled={busy} className="flex-1 text-left truncate" onClick={() => openConversation(c.id)}>{c.title}</button>
        <button type="button" disabled={busy} aria-label={`Delete ${c.title}`} onClick={() => removeConversation(c.id)}>Delete</button>
      </div>)}
    </div>}
    <div className={`flex-1 overflow-y-auto p-4 space-y-3 ${full ? 'max-w-3xl w-full mx-auto' : ''}`}>
      {notice && <p role="alert" className="text-xs text-bear-500">{notice}</p>}
      {status && !status.online && <div className="text-xs text-mist-400 bg-ink-800 p-3 rounded-lg">
        <p>{status.detail}</p><button type="button" className="text-brass-400 mt-2" onClick={refreshStatus}>Check again</button>
      </div>}
      {!messages.length && <div className="space-y-2">
        <p className="text-xs text-mist-400">Ask about your chart, explore a strategy, or run a market scan. Analysis commands work even when cloud AI is unavailable.</p>
        {suggestions.map(s => <button type="button" key={s} disabled={busy} onClick={() => send(s)} className="block text-left text-xs bg-ink-800 rounded-lg p-2 w-full hover:bg-ink-700">{s}</button>)}
      </div>}
      <div aria-live="polite" aria-relevant="additions" className="space-y-3">
        {messages.map((m, i) => m.role === 'scan' ? <ScanCard key={i} scan={m.scan} onAnalyze={onAnalyze} onOpenSymbol={onOpenSymbol} /> :
          <div key={i} className={`text-sm rounded-lg p-3 ${m.role === 'user' ? 'bg-ink-700 ml-6' : m.role === 'error' ? 'bg-bear-500/10 text-bear-500' : 'bg-ink-800'}`}>
            <Rich text={m.text} />
            {m.role === 'ai' && <div className="flex gap-3 text-[10px] text-mist-400 mt-2">
              <span>{m.provider || 'Saved reply'}</span>
              {m.source?.url && <a href={m.source.url} target="_blank" rel="noreferrer">Source</a>}
              <button type="button" onClick={() => copy(m.text, i)}>{copied === i ? 'Copied' : 'Copy'}</button>
            </div>}
          </div>)}
      </div>
      {busy && <p role="status" className="text-xs text-mist-400">Working on your request…</p>}
      <div ref={endRef} />
    </div>
    <form onSubmit={e => { e.preventDefault(); send(input) }} className={`flex gap-2 p-3 border-t border-ink-700 ${full ? 'max-w-3xl w-full mx-auto' : ''}`}>
      <input aria-label="Chat message" value={input} maxLength={4000} onChange={e => setInput(e.target.value)} disabled={busy} placeholder="Ask about your chart or scan the market…" className="min-w-0 flex-1 bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm" />
      <button disabled={busy || !input.trim()} className="bg-brass-400 text-ink-950 rounded-lg px-4 disabled:opacity-40">Send</button>
    </form>
  </aside>
}
