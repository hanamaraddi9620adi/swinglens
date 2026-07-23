import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

export default function AIChat() {
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { api.aiStatus().then(setStatus).catch(() => setStatus({ online: false })) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (e) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const res = await api.aiChat(text)
      setMessages((m) => [...m, { role: 'ai', text: res.reply }])
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', text: err.message }])
    } finally {
      setBusy(false)
    }
  }

  const online = status?.online && (status?.model_installed ?? true)

  return (
    <aside className="flex flex-col bg-ink-900 border border-ink-700 rounded-xl overflow-hidden h-full min-h-[420px]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-ink-700">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-bull-500' : 'bg-bear-500'}`} />
          <h3 className="font-[family-name:var(--font-display)] text-sm font-semibold text-mist-50">Local AI</h3>
        </div>
        <span className="price text-[10px] text-mist-400 truncate max-w-[140px]">{status?.model || '—'}</span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!status ? (
          <p className="text-xs text-mist-400">Checking Ollama…</p>
        ) : !online ? (
          <div className="text-xs text-mist-400 leading-relaxed bg-ink-800 border border-ink-600 rounded-lg p-3">
            <p className="text-mist-200 font-medium mb-1">Ollama isn't ready yet</p>
            <p>{status.detail}</p>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-mist-400 leading-relaxed">
            Connected. Ask anything to test the local model — chart-aware analysis arrives in Phase 2.
          </p>
        ) : null}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm leading-relaxed rounded-lg px-3 py-2 whitespace-pre-wrap ${
              m.role === 'user' ? 'bg-ink-700 text-mist-50 ml-6'
              : m.role === 'error' ? 'bg-bear-500/10 border border-bear-500/30 text-bear-500'
              : 'bg-ink-800 text-mist-200 mr-2'
            }`}
          >
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-mist-400">
            <span className="w-3 h-3 border-2 border-mist-400/30 border-t-brass-400 rounded-full animate-spin" />
            Thinking on your machine…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="p-3 border-t border-ink-700 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={online ? 'Ask the local model…' : 'Start Ollama to chat'}
          disabled={!online || busy}
          className="flex-1 bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm text-mist-50 placeholder-mist-400/50 focus:border-brass-400 focus:outline-none disabled:opacity-50"
        />
        <button
          disabled={!online || busy || !input.trim()}
          className="bg-brass-400 hover:bg-brass-300 disabled:opacity-40 text-ink-950 font-semibold text-sm rounded-lg px-4 transition-colors"
        >
          Send
        </button>
      </form>
    </aside>
  )
}
