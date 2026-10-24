import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { api } from '../api'
import AIChat from '../components/AIChat'
import CandleChart from '../components/CandleChart'
import StockSearch from '../components/StockSearch'
import TickerStrip from '../components/TickerStrip'
import WatchStrip from '../components/WatchStrip'
import AlertBell from '../components/AlertBell'
import CommandPalette from '../components/CommandPalette'
import SymbolNews from '../components/SymbolNews'
import ChartBrowser from './ChartBrowser'
import Explore from './Explore'
import Pulse from './Pulse'
import Portfolio from './Portfolio'
import Research from './Research'
import Discovery from './Discovery'
import ThesisMonitor from './Thesis'

const tabs = [['pulse', 'Pulse'], ['explore', 'Explore'], ['chart', 'Chart'], ['research', 'Research'], ['discover', 'Discover'], ['thesis', 'Thesis'], ['portfolio', 'Portfolio']]
export default function Workspace() {
  const { user, logout } = useAuth()
  const [view, setView] = useState('pulse'), [symbol, setSymbol] = useState(null)
  const [analyzeReq, setAnalyzeReq] = useState(0), [latestAnalysis, setLatestAnalysis] = useState(null)
  const [newsTitles, setNewsTitles] = useState([]), [portfolioCtx, setPortfolioCtx] = useState(null)
  const [watchlist, setWatchlist] = useState([]), [paletteOpen, setPaletteOpen] = useState(false), [notice, setNotice] = useState('')
  const loadWatchlist = useCallback(() => api.watchlist().then(data => setWatchlist(data.items || [])).catch(() => {}), [])
  useEffect(() => { loadWatchlist() }, [loadWatchlist])
  useEffect(() => { setLatestAnalysis(null); setNewsTitles([]) }, [symbol])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [view, symbol])
  const toggleWatch = async value => { try { await api.toggleWatch(value, value); await loadWatchlist(); setNotice('') } catch (err) { setNotice(err.message) } }
  const navigate = useCallback(value => {
    if (value === 'chart') { setSymbol(null); setLatestAnalysis(null); setNewsTitles([]); setAnalyzeReq(0) }
    setView(value); setPaletteOpen(false)
  }, [])
  const openSymbol = useCallback(value => { setSymbol(value); setView('chart'); setAnalyzeReq(0); setPaletteOpen(false) }, [])
  const researchSymbol = useCallback(value => { setSymbol(value); setView('research'); setPaletteOpen(false) }, [])
  const requestAnalyze = useCallback(value => { setSymbol(value); setView('chart'); setAnalyzeReq(n => n + 1) }, [])
  useEffect(() => {
    const onKey = event => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName) || event.target.isContentEditable
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPaletteOpen(value => !value) }
      else if (event.key === '/' && !typing) { event.preventDefault(); document.querySelector('#global-search input')?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const chatContext = useMemo(() => ({ symbol,
    analysis: latestAnalysis?.symbol === symbol ? { setup: latestAnalysis.setup, indicators: latestAnalysis.indicators, narration: latestAnalysis.narration } : null,
    news_titles: newsTitles.slice(0, 10).map(row => ({ title: row.title, source: row.source_name, confirmed: row.confirmed })), portfolio: portfolioCtx,
  }), [symbol, latestAnalysis, newsTitles, portfolioCtx])
  return <div className="min-h-screen flex flex-col">
    <a href="#workspace-content" className="skip-link">Skip to content</a>
    <header className="app-header"><div className="header-inner">
      <div className="header-top">
        <button type="button" onClick={() => navigate('pulse')} className="brand" aria-label="SwingLens home"><span className="brand-mark">S</span><span>SwingLens</span></button>
        <div id="global-search" className="header-search"><StockSearch onSelect={openSymbol} /></div>
        <div className="header-actions"><span className="header-username text-xs text-mist-400 truncate max-w-28">{user?.username}</span>
          <button type="button" className="icon-button" aria-label="Open commands" title="Commands (Ctrl+K)" onClick={() => setPaletteOpen(true)}>⌘</button>
          <AlertBell onOpenSymbol={openSymbol} /><button type="button" onClick={logout} className="quiet-button">Sign out</button></div>
      </div>
      <nav className="workspace-tabs" aria-label="Workspace navigation">{tabs.map(([id, label]) => <button type="button" key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}>{label}</button>)}</nav>
    </div><TickerStrip onOpenSymbol={openSymbol} /></header>
    <main id="workspace-content" tabIndex={-1} className="app-main flex-1">
      {notice && <p role="alert" className="text-sm text-bear-500 mb-3">{notice}</p>}
      {view === 'pulse' ? <Pulse onOpenSymbol={openSymbol} /> : view === 'explore' ? <Explore onOpenSymbol={openSymbol} />
        : view === 'discover' ? <Discovery onOpenSymbol={researchSymbol} /> : view === 'thesis' ? <ThesisMonitor onOpenSymbol={researchSymbol} />
        : view === 'portfolio' ? <Portfolio onOpenSymbol={openSymbol} onPortfolio={setPortfolioCtx} />
        : view === 'research' ? symbol ? <Research key={symbol} symbol={symbol} /> : <ChartBrowser title="Choose a stock to research" onOpenSymbol={researchSymbol} />
        : !symbol ? <ChartBrowser onOpenSymbol={openSymbol} /> : <>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3"><button type="button" onClick={() => navigate('chart')} className="quiet-button">← All instruments</button><button type="button" onClick={() => researchSymbol(symbol)} className="quiet-button">Research {symbol} ↗</button></div>
          <WatchStrip items={watchlist} symbol={symbol} fallback={[]} onOpen={openSymbol} onRemove={toggleWatch} />
          <div className="chart-layout"><CandleChart key={`chart-${symbol}`} symbol={symbol} analyzeSignal={analyzeReq} onAnalysis={setLatestAnalysis} watched={watchlist.some(item => item.symbol === symbol)} onToggleWatch={toggleWatch} />
            <div className="chart-sidebar"><AIChat key={`chat-${symbol}`} onAnalyze={requestAnalyze} onOpenSymbol={openSymbol} context={chatContext} /><SymbolNews key={`news-${symbol}`} symbol={symbol} onLoaded={setNewsTitles} /></div>
          </div>
        </>}
      <p className="mt-6 text-[11px] text-mist-400/70 leading-relaxed max-w-3xl">SwingLens is a research and education tool, not a SEBI-registered advisory. Market data may be delayed. Verify important information at the linked sources before acting.</p>
    </main>
    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onNavigate={navigate} onOpenSymbol={researchSymbol} />
  </div>
}
