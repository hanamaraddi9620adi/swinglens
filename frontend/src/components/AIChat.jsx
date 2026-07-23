import { useEffect, useRef, useState } from 'react'
import { api } from '../api'

// Markdown-lite: **bold**, `code`, bullet lists, ### headings — no deps.
function Rich({ text }) {
  const inline = (s, k) =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith('**') ? <strong key={`${k}-${i}`} className="text-mist-50">{part.slice(2, -2)}</strong>
      : part.startsWith('`') ? <code key={`${k}-${i}`} className="price text-brass-300 bg-ink-900/70 rounded px-1">{part.slice(1, -1)}</code>
      : part
    )
  const lines = text.split('\n')
  const blocks = []
  let list = null
  lines.forEach((line, i) => {
    const bullet = /^\s*[-*]\s+/.test(line)
    if (bullet) {
      if (!list) { list = []; blocks.push(list) }
      list.push(line.replace(/^\s*[-*]\s+/, ''))
    } else {
      list = null
      blocks.push(line)
    }
  })
  return (
    <>
      {blocks.map((b, i) =>
        Array.isArray(b) ? (
          <ul key={i} className="list-disc pl-4 my-1 space-y-0.5">
            {b.map((li, j) => <li key={j}>{inline(li, `${i}-${j}`)}</li>)}
          </ul>
        ) : /^###\s+/.test(b) ? (
          <p key={i} className="text-[11px] uppercase tracking-wider text-brass-400 mt-2">{b.replace(/^###\s+/, '')}</p>
        ) : b.trim() === '' ? null : (
          <p key={i} className="my-1">{inline(b, i)}</p>
        )
      )}
    </>
  )
}

const SUGGESTIONS = [
  { label: '⚡ Analyse this chart', msg: 'analyse this stock for a swing trade' },
  { label: '📰 What does the news say?', msg: 'What do the latest headlines say about this stock? Which are confirmed?' },
  { label: '🎓 Explain RSI simply', msg: "Explain RSI like I'm completely new to trading" },
]

export default function AIChat({ onAnalyze, context }) {
  const [status, setStatus] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)

  useEffect(() => { api.aiStatus().then(setStatus).catch(() => setStatus({ online: false })) }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const send = async (text) => {
    text = (text || '').trim()
    if (!text || busy) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', text }])
    setBusy(true)
    try {
      const res = await api.aiChat(text, context)
      setMessages((m) => [...m, { role: 'ai', text: res.reply }])
      if (res.action?.type === 'analyze' && onAnalyze) onAnalyze(res.action.symbol)
    } catch (err) {
      setMessages((m) => [...m, { role: 'error', text: err.message }])
    } finally {
      setBusy(false)
    }
  }

  const online = status?.online && (status?.model_installed ?? true)

  return (
    <aside className="flex flex-col bg-ink-900 border border-ink-700 rounded-xl overflow-hidden min-h-[420px] max-h-[560px]">
      <header className="flex items-center justify-between px-4 py-3 border-b border-ink-700">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${online ? 'bg-bull-500' : 'bg-bear-500'}`} />
          <h3 className="font-[family-name:var(--font-display)] text-sm font-semibold text-mist-50">SwingLens AI</h3>
          {context?.symbol && (
            <span className="price text-[10px] text-brass-400 border border-brass-400/30 rounded px-1.5 py-0.5">
              sees {context.symbol}{context.analysis ? ' + analysis' : ''}{context.news_titles?.length ? ' + news' : ''}
            </span>
          )}
        </div>
        <span className="price text-[10px] text-mist-400 truncate max-w-[120px]">{status?.model || '—'}</span>
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
          <div>
            <p className="text-xs text-mist-400 leading-relaxed mb-3">
              I can see your chart, your latest analysis, and the real headlines — ask me anything,
              or type <span className="price text-brass-400">analyse suzlon</span> to run the pipeline.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s.label} onClick={() => send(s.msg)}
                        className="rise-in text-left text-xs text-mist-200 bg-ink-800 hover:bg-ink-700 border border-ink-600 hover:border-brass-400/40 rounded-lg px-3 py-2 transition-colors">
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div key={i}
               className={`text-sm leading-relaxed rounded-lg px-3 py-2 ${
                 m.role === 'user' ? 'bg-ink-700 text-mist-50 ml-6'
                 : m.role === 'error' ? 'bg-bear-500/10 border border-bear-500/30 text-bear-500'
                 : 'bg-ink-800 text-mist-200 mr-2'
               }`}>
            {m.role === 'ai' ? <Rich text={m.text} /> : <span className="whitespace-pre-wrap">{m.text}</span>}
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

      <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="p-3 border-t border-ink-700 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={online ? 'Ask anything about markets…' : 'Start Ollama to chat'}
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
