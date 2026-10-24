import type { ReactNode } from 'react'

/** Terminal chrome adapted from the supplied visual reference.
 * The host supplies actual OHLCV data and the TradingView canvas, never demo data.
 * Kept in components/ui so it can be reused independently of API/state logic.
 */
type CandleChartPanelProps = {
  heading: ReactNode
  actions: ReactNode
  toolbar: ReactNode
  legend: ReactNode
  children: ReactNode
  footer: ReactNode
}

export default function CandleChartPanel({ heading, actions, toolbar, legend, children, footer }: CandleChartPanelProps) {
  return <section className="terminal-panel" aria-label="Price chart terminal">
    <header className="terminal-heading"><div className="min-w-0">{heading}</div><div className="terminal-controls">{actions}</div></header>
    <div className="terminal-toolbar">{toolbar}</div>
    <div className="chart-legend" aria-label="Candle values">{legend}</div>
    {children}
    <footer className="chart-status">{footer}</footer>
  </section>
}
