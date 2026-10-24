import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useDialog } from '../hooks/useDialog'

function Rich({ text = '' }) {
  return text.split('\n').map((line, index) => <p key={index} className="my-1 whitespace-pre-wrap break-words">{line.split(/(\*\*[^*]+\*\*)/g).map((part, key) => part.startsWith('**') ? <strong key={key}>{part.slice(2, -2)}</strong> : part)}</p>)
}
function ScanCard({ scan, onAnalyze, onOpenSymbol }) {
  return <article className="bg-ink-800 border border-ink-600 rounded-lg p-3 space-y-2">
    <p className="text-sm font-semibold">Engine scan · {scan.universe}</p>
    <p className="text-xs text-mist-400">{scan.scanned} instruments scanned; {scan.failed || 0} unavailable.</p>
    {!scan.actionable?.length && <p className="text-xs">No qualifying setups right now.</p>}
    {['actionable', 'watchlist'].map(kind => <div key={kind}>
      {!!scan[kind]?.length && <p className="text-xs text-brass-400 capitalize my-2">{kind}</p>}
      {scan[kind]?.map(row => <div key={row.symbol} className="flex flex-wrap items-center gap-2 py-2 text-xs border-b border-ink-700">
        <span className="flex-1 min-w-24">{row.name || row.symbol}<span className="block text-mist-400">{row.symbol} · {row.state?.replaceAll('_', ' ')}</span></span>
        <span className="price">{kind === 'actionable' ? `Confidence ${row.confidence}` : `RSI ${row.rsi ?? '—'}`}</span>
        <button type="button" className="quiet-button" onClick={() => kind === 'actionable' ? onAnalyze?.(row.symbol) : onOpenSymbol?.(row.symbol)}>{kind === 'actionable' ? 'Analyze' : 'Open'}</button>
      </div>)}
    </div>)}
    {scan.source?.url && <a className="text-xs text-brass-400" href={scan.source.url} target="_blank" rel="noreferrer">{scan.source.provider || 'Data source'}</a>}
    <p className="text-xs text-mist-400">{scan.source?.note}</p>
  </article>
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
  const busyRef = useRef(false), generation = useRef(0), mounted = useRef(true), list = useRef(null)
  const dialog = useDialog(full, () => setFull(false))
  const refreshStatus = () => api.aiStatus().then(value => { if (mounted.current) setStatus(value) }).catch(() => { if (mounted.current) setStatus({ online: false, detail: 'Cloud AI status unavailable. You can still try a message or an analysis command.' }) })
  const refreshHistory = () => api.aiConversations().then(value => { if (mounted.current) setConvs(value) }).catch(() => {})
  useEffect(() => {
    mounted.current = true; refreshStatus(); refreshHistory()
    const timer = setInterval(refreshStatus, 60000)
    return () => { mounted.current = false; generation.current++; clearInterval(timer) }
  }, [])
  // Scroll the message pane only. scrollIntoView moved the entire page to chat
  // when opening a mobile chart, hiding the stock header and chart controls.
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [messages, busy])
  const newChat = () => {
    if (busyRef.current) return
    generation.current++; setConvId(null); setMessages([]); setLastScan(null); setNotice(''); setShowHistory(false)
  }
  const openConversation = async id => {
    if (busyRef.current) return
    const version = ++generation.current
    setNotice('')
    try {
      const rows = await api.aiMessages(id)
      if (version !== generation.current || !mounted.current) return
      const parsed = rows.map(row => {
        if (row.role === 'scan') { try { return { role: 'scan', scan: JSON.parse(row.content) } } catch { return { role: 'error', text: 'This saved scan could not be loaded.' } } }
        return { role: row.role, text: row.content }
      })
      setConvId(id); setMessages(parsed); setLastScan([...parsed].reverse().find(row => row.scan)?.scan || null); setShowHistory(false)
    } catch (err) { if (version === generation.current) setNotice(err.message) }
  }
  const removeConversation = async id => {
    if (busyRef.current) return
    try { await api.aiDeleteConversation(id); setConvs(rows => rows.filter(row => row.id !== id)); if (id === convId) newChat() }
    catch (err) { setNotice(err.message) }
  }
  const send = async value => {
    const text = value.trim()
    if (!text || busyRef.current || text.length > 4000) return
    busyRef.current = true
    const version = ++generation.current
    setInput(''); setBusy(true); setNotice(''); setMessages(rows => [...rows, { role: 'user', text }])
    try {
      const ctx = { ...context, last_scan: lastScan ? { universe: lastScan.universe, as_of: lastScan.as_of, actionable: lastScan.actionable, watchlist: lastScan.watchlist } : null }
      const result = await api.aiChat(text, ctx, convId)
      if (!mounted.current || version !== generation.current) return
      setConvId(result.conversation_id); setMessages(rows => [...rows, { role: 'ai', text: result.reply, provider: result.provider, source: result.source }])
      if (result.action?.type === 'analyze') await onAnalyze?.(result.action.symbol)
      if (result.action?.type === 'scan') {
        const scan = await api.runScan(result.action.segment)
        if (!mounted.current || version !== generation.current) return
        setLastScan(scan); setMessages(rows => [...rows, { role: 'scan', scan }])
      }
    } catch (err) {
      if (mounted.current && version === generation.current) {
        if (err.detail?.conversation_id) setConvId(err.detail.conversation_id)
        setMessages(rows => [...rows, { role: 'error', text: err.message }]); setInput(text)
      }
    } finally { busyRef.current = false; if (mounted.current) { setBusy(false); refreshStatus(); refreshHistory() } }
  }
  const copy = async (text, index) => { try { await navigator.clipboard.writeText(text); setCopied(index) } catch { setNotice('Clipboard access is unavailable in this browser.') } }
  return <aside ref={dialog} aria-label={full ? 'Expanded AI chat' : 'SwingLens AI chat'} role={full ? 'dialog' : undefined} aria-modal={full || undefined}
    className={full ? 'fixed inset-0 z-[95] h-dvh bg-ink-950 flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]' : 'flex flex-col bg-ink-900 border border-ink-700 rounded-xl overflow-hidden h-[520px] max-h-[85svh] min-w-0'}>
    <header className="flex flex-wrap items-center gap-2 p-3 border-b border-ink-700 shrink-0">
      <span className={`w-2 h-2 rounded-full ${status?.online ? 'bg-bull-500' : 'bg-brass-400'}`} />
      <h3 className="text-sm font-semibold">SwingLens AI</h3><span className="text-xs text-brass-400 truncate max-w-32">{context?.symbol}</span>
      <div className="ml-auto flex gap-1">
        <button type="button" className="quiet-button" disabled={busy} onClick={() => { setShowHistory(value => !value); refreshHistory() }}>History</button>
        <button type="button" className="quiet-button" disabled={busy} onClick={newChat}>New</button>
        <button type="button" className="quiet-button" aria-label={full ? 'Exit fullscreen chat' : 'Fullscreen chat'} onClick={() => setFull(value => !value)}>{full ? 'Close' : 'Expand'}</button>
      </div>
    </header>
    {showHistory && <div className="max-h-40 overflow-y-auto overscroll-contain p-3 border-b border-ink-700 text-xs shrink-0">
      {!convs.length && <p>No saved conversations yet.</p>}
      {convs.map(row => <div key={row.id} className="flex gap-2 py-1"><button type="button" disabled={busy} className="flex-1 text-left truncate py-2" onClick={() => openConversation(row.id)}>{row.title}</button><button type="button" className="quiet-button" disabled={busy} aria-label={`Delete ${row.title}`} onClick={() => removeConversation(row.id)}>Delete</button></div>)}
    </div>}
    <div ref={list} className={`flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3 ${full ? 'max-w-3xl w-full mx-auto' : ''}`}>
      {notice && <p role="alert" className="text-xs text-bear-500">{notice}</p>}
      {status && !status.online && <div className="text-xs text-mist-400 bg-ink-800 p-3 rounded-lg"><p>{status.detail}</p><button type="button" className="text-brass-400 mt-2 py-2" onClick={refreshStatus}>Check again</button></div>}
      {!messages.length && <div className="space-y-2"><p className="text-xs text-mist-400">Ask about your chart or explore a strategy. Analysis and scan commands also work when cloud AI is unavailable.</p>{suggestions.map(value => <button type="button" key={value} disabled={busy} onClick={() => send(value)} className="block text-left text-xs bg-ink-800 rounded-lg p-3 min-h-11 w-full hover:bg-ink-700">{value}</button>)}</div>}
      <div aria-live="polite" aria-relevant="additions" className="space-y-3">{messages.map((message, index) => message.role === 'scan' ? <ScanCard key={index} scan={message.scan} onAnalyze={onAnalyze} onOpenSymbol={onOpenSymbol} /> : <div key={index} className={`text-sm rounded-lg p-3 ${message.role === 'user' ? 'bg-ink-700 ml-6' : message.role === 'error' ? 'bg-bear-500/10 text-bear-500' : 'bg-ink-800'}`}>
        <Rich text={message.text} />{message.role === 'ai' && <div className="flex flex-wrap items-center gap-3 text-[10px] text-mist-400 mt-2"><span>{message.provider || 'Saved reply'}</span>{message.source?.url && <a href={message.source.url} target="_blank" rel="noreferrer">Source</a>}<button type="button" className="py-2" onClick={() => copy(message.text, index)}>{copied === index ? 'Copied' : 'Copy'}</button></div>}
      </div>)}</div>
      {busy && <p role="status" className="text-xs text-mist-400">Working on your request…</p>}
    </div>
    <form onSubmit={event => { event.preventDefault(); send(input) }} className={`flex gap-2 p-3 border-t border-ink-700 shrink-0 ${full ? 'max-w-3xl w-full mx-auto' : ''}`}>
      <input aria-label="Chat message" value={input} maxLength={4000} onChange={event => setInput(event.target.value)} disabled={busy} placeholder="Ask about this chart…" className="min-w-0 flex-1 bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm" />
      <button disabled={busy || !input.trim()} className="action-button">Send</button>
    </form>
  </aside>
}
