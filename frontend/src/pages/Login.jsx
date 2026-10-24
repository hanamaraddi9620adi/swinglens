import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth'
const bars = Array.from({ length: 26 }, (_, i) => ({ height: 28 + (i * 37) % 52, up: (i * 7) % 3 !== 0, delay: (i % 9) * .45 }))

export default function Login() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [health, setHealth] = useState(null), [healthError, setHealthError] = useState(false)
  const submitting = useRef(false)
  const checkHealth = () => fetch('/api/health').then(response => { if (!response.ok) throw new Error(); return response.json() }).then(data => { setHealth(data); setHealthError(false) }).catch(() => setHealthError(true))
  useEffect(() => { checkHealth() }, [])
  const update = key => event => setForm(values => ({ ...values, [key]: event.target.value }))
  const authenticate = async demo => {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      if (demo) await login('demo@swinglens.app', 'swingdemo123')
      else if (mode === 'login') await login(form.email, form.password)
      else await register(form.username, form.email, form.password)
    } catch (err) { setError(err.message) } finally { submitting.current = false; setBusy(false) }
  }
  return <div className="min-h-svh flex">
    <aside className="hidden lg:flex flex-col justify-between w-[44%] bg-ink-900 border-r border-ink-700 p-10 xl:p-14 overflow-hidden">
      <div><div className="brand text-xl"><span className="brand-mark">S</span>SwingLens</div><h1 className="mt-20 text-4xl xl:text-5xl leading-tight font-semibold text-mist-50 max-w-md">See the trade<br />before you take it.</h1><p className="mt-6 text-mist-400 max-w-sm leading-relaxed">Charts annotated from computed evidence. Every market number traced to its source.</p></div>
      <div className="flex items-end gap-2 h-40 mt-16" aria-hidden="true">{bars.map((bar, index) => <div key={index} className={`candle-bar w-2 rounded-sm ${bar.up ? 'bg-bull-500/60' : 'bg-bear-500/50'}`} style={{ height: `${bar.height}%`, animationDelay: `${bar.delay}s` }} />)}</div>
    </aside>
    <main className="flex-1 flex items-center justify-center px-5 py-8 sm:p-10">
      <form className="w-full max-w-sm" onSubmit={event => { event.preventDefault(); authenticate(false) }}>
        <div className="brand lg:hidden mb-8 text-xl"><span className="brand-mark">S</span>SwingLens</div>
        <h2 className="text-2xl font-semibold text-mist-50">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
        <p className="text-sm text-mist-400 mt-2">{mode === 'login' ? 'Sign in to open your workspace.' : 'Your research, watchlist and chats in one workspace.'}</p>
        {healthError && <div role="alert" className="mt-4 text-sm text-brass-400 border border-brass-400/40 rounded-lg p-3">The service is currently unreachable. Check your connection and retry.<button type="button" onClick={checkHealth} className="quiet-button block mt-2">Check connection</button></div>}
        {mode === 'register' && <label className="block mt-6 text-xs uppercase tracking-wider text-mist-400">Username<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={32} value={form.username} onChange={update('username')} className="search-input w-full block mt-2 normal-case" placeholder="trader_one" /></label>}
        <label className="block mt-5 text-xs uppercase tracking-wider text-mist-400">Email<input name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} required maxLength={255} value={form.email} onChange={update('email')} className="search-input w-full block mt-2 normal-case" placeholder="you@example.com" /></label>
        <label className="block mt-5 text-xs uppercase tracking-wider text-mist-400">Password<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'register' ? 8 : 1} maxLength={128} value={form.password} onChange={update('password')} className="search-input w-full block mt-2 normal-case" placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} /></label>
        {error && <p role="alert" className="mt-4 text-sm text-bear-500 border border-bear-500/30 rounded-lg p-3">{error}</p>}
        <button disabled={busy} className="action-button w-full mt-6">{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        {health?.demo && <button type="button" disabled={busy} className="quiet-button w-full mt-3" onClick={() => authenticate(true)}>Try the demo account</button>}
        <button type="button" disabled={busy} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }} className="min-h-11 w-full mt-3 text-sm text-mist-400 hover:text-mist-200">{mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}</button>
        <p className="text-[10px] text-mist-400 leading-relaxed mt-8">SwingLens is a research and education tool, not a SEBI-registered advisory. It does not execute trades. Verify important information with the linked sources.</p>
      </form>
    </main>
  </div>
}
