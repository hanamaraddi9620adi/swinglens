import { useState } from 'react'
import SourceFooter from './SourceFooter'

function storedNumber(key, fallback) { try { const value = Number(localStorage.getItem(key)); return value > 0 && Number.isFinite(value) ? value : fallback } catch { return fallback } }
function PositionSizer({ plan, currencySign }) {
  const [capital, setCapital] = useState(() => String(storedNumber('sl_capital', 100000)))
  const [risk, setRisk] = useState(() => String(storedNumber('sl_risk_pct', 1)))
  const cash = Number(capital), percentage = Number(risk)
  const entry = (plan.entry_low + plan.entry_high) / 2, perShareRisk = entry - plan.stop_loss
  const valid = capital !== '' && risk !== '' && Number.isFinite(cash) && cash > 0 && Number.isFinite(percentage) && percentage >= .1 && percentage <= 10 && entry > 0 && perShareRisk > 0
  const riskBudget = valid ? cash * percentage / 100 : 0
  const shares = valid ? Math.max(0, Math.min(Math.floor(riskBudget / perShareRisk), Math.floor(cash / entry))) : 0
  const update = (key, setter) => event => { setter(event.target.value); try { localStorage.setItem(key, event.target.value) } catch { /* Storage is optional. */ } }
  const money = value => currencySign + value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  return <div className="mt-4 bg-ink-800/60 border border-ink-600/60 rounded-lg p-3">
    <h3 className="text-xs text-brass-400 uppercase tracking-wide">Position size calculator</h3>
    <div className="grid grid-cols-2 gap-3 mt-3">
      <label className="text-xs text-mist-400">Capital ({currencySign})<input type="number" min="1" value={capital} onChange={update('sl_capital', setCapital)} className="search-input block mt-1 w-full" /></label>
      <label className="text-xs text-mist-400">Risk per trade (%)<input type="number" min="0.1" max="10" step="0.1" value={risk} onChange={update('sl_risk_pct', setRisk)} className="search-input block mt-1 w-full" /></label>
    </div>
    {valid ? <p className="text-xs leading-relaxed mt-3"><span className="price text-mist-50 text-lg">{shares}</span> shares · estimated outlay {money(shares * entry)} · risk at stop {money(shares * perShareRisk)}</p> : <p className="text-xs text-brass-400 mt-3">Enter positive capital and risk between 0.1% and 10%.</p>}
    <p className="text-[10px] text-mist-400 mt-2">Fixed-fractional sizing, capped at available capital; excludes fees, slippage and gaps. Education only.</p>
  </div>
}
function Tile({ label, value, tone = 'text-mist-50' }) {
  return <div className="min-w-0 bg-ink-800 border border-ink-600 rounded-lg p-3"><p className="text-[10px] uppercase tracking-wider text-mist-400">{label}</p><p className={`price text-sm sm:text-base mt-2 break-words ${tone}`}>{value}</p></div>
}
export default function SetupCard({ analysis, currencySign = '' }) {
  if (!analysis) return null
  const { setup, narration, verification, indicators = {}, source } = analysis
  const plan = setup.plan
  const format = value => value == null ? '—' : currencySign + Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })
  const verified = verification?.status === 'verified' ? 'Verified against computed data' : verification?.status === 'edited' ? 'Unsupported numeric claims removed' : 'Explanation built from computed facts'
  return <section className="bg-ink-900 border border-ink-700 rounded-xl p-4 sm:p-5 mt-5" aria-label="Computed chart setup">
    <header className="flex flex-wrap items-center gap-3"><h3 className="font-semibold text-sm text-mist-50">{setup.state?.replaceAll('_', ' ').toUpperCase()}</h3>
      <span className={`text-xs uppercase ${setup.bias === 'bullish' ? 'text-bull-500' : setup.bias === 'bearish' ? 'text-bear-500' : 'text-mist-400'}`}>{setup.bias}</span>
      {plan && <span className="price text-sm text-brass-400 sm:ml-auto">Confidence {setup.confidence}/100</span>}
    </header>
    {plan ? <>
      {plan.conditional && <p className="text-xs text-brass-400 mt-2">Conditional setup: valid only on a confirmed breakout.</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 mt-4">
        <Tile label="Entry zone" value={`${format(plan.entry_low)} – ${format(plan.entry_high)}`} tone="text-bull-500" />
        <Tile label="Stop-loss" value={format(plan.stop_loss)} tone="text-bear-500" />
        <Tile label="Target 1" value={format(plan.target1)} tone="text-brass-300" /><Tile label="Target 2" value={format(plan.target2)} tone="text-brass-300" /><Tile label="Risk : reward" value={`${plan.risk_reward} : 1`} />
      </div>
      <PositionSizer plan={plan} currencySign={currencySign} />
      <div className="mt-4 space-y-3">{(setup.factors || []).map(factor => <div key={factor.name} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
        <span className="text-xs text-mist-400">{factor.name}</span><span className="price text-[11px]">{factor.contribution}/{factor.max}</span>
        <div className="col-span-2 h-1.5 bg-ink-700 rounded-full overflow-hidden"><div className="h-full bg-brass-400/70 rounded-full" style={{ width: `${factor.max > 0 ? Math.max(0, Math.min(100, factor.contribution / factor.max * 100)) : 0}%` }} /></div>
      </div>)}</div>
    </> : <>
      <p className="text-sm text-mist-200 bg-ink-800 border border-ink-600 rounded-lg p-3 mt-4">{setup.state === 'strong_uptrend_extended' ? 'The uptrend is extended. Wait for a controlled pullback instead of chasing price.' : setup.state === 'downtrend' ? 'The engine detected a downtrend. No clean long setup is available.' : 'The current chart does not offer a clean setup. The engine has not generated a trade plan.'}</p>
      {setup.watch && <div className="grid grid-cols-2 gap-2 mt-3"><Tile label="Support" value={setup.watch.nearest_support ? `${format(setup.watch.nearest_support.price_low)} – ${format(setup.watch.nearest_support.price_high)}` : format(setup.watch.recent_swing_low)} /><Tile label="Resistance" value={setup.watch.nearest_resistance ? `${format(setup.watch.nearest_resistance.price_low)} – ${format(setup.watch.nearest_resistance.price_high)}` : format(setup.watch.recent_swing_high)} /><Tile label="20 SMA" value={format(setup.watch.sma20)} /><Tile label="RSI" value={indicators.rsi14 ?? '—'} /></div>}
    </>}
    <div className="grid sm:grid-cols-2 gap-2 mt-4">{[['pattern', 'The pattern'], ['why', 'Why it matters'], ['confirmation', 'Confirmation'], ['invalidation', 'Invalidation']].map(([key, label]) => <div key={key} className="bg-ink-800/60 border border-ink-600/60 rounded-lg p-3"><h4 className="text-[10px] uppercase tracking-wider text-brass-400">{label}</h4><p className="text-sm leading-relaxed mt-2">{narration?.[key] || '—'}</p></div>)}</div>
    <p className="text-xs text-mist-400 mt-4">{verified}{analysis.saved_plan_id ? ` · Setup #${analysis.saved_plan_id} saved` : ''}</p>
    <p className="price text-[11px] text-mist-400 mt-2">RSI {indicators.rsi14 ?? '—'} · ATR {indicators.atr14 ?? '—'} · Volume {indicators.volume_ratio ?? '—'}x</p>
    <SourceFooter source={source} /><p className="text-[10px] text-mist-400 mt-2">{analysis.disclaimer}</p>
  </section>
}
