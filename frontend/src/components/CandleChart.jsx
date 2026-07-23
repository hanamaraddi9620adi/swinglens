import { useEffect, useRef, useState } from 'react'
import {
  CandlestickSeries, HistogramSeries, LineStyle, createChart, createSeriesMarkers,
} from 'lightweight-charts'
import { api } from '../api'
import SetupCard from './SetupCard'
import SourceFooter from './SourceFooter'

const RANGES = ['1M', '3M', '6M', '1Y', '5Y', 'MAX']
const INTERVALS = ['15m', '1H', '1D', '1W']
const ALLOWED = {
  '15m': ['1M'],
  '1H': ['1M', '3M', '6M', '1Y'],
  '1D': RANGES,
  '1W': RANGES,
}

const BULL = '#22c07a'
const BEAR = '#ef5350'
const BRASS = '#e8b64c'

const ANALYZE_STEPS = ['Reading the chart…', 'Marking the levels…', 'Building the plan…', 'Writing the narration…']

export default function CandleChart({ symbol }) {
  const containerRef = useRef(null)
  const overlayRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const markersApiRef = useRef(null)
  const priceLinesRef = useRef([])
  const analysisRef = useRef(null)

  const [range, setRange] = useState('1Y')
  const [interval, setInterval_] = useState('1D')
  const [meta, setMeta] = useState(null)
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeStep, setAnalyzeStep] = useState(0)
  const [analyzeError, setAnalyzeError] = useState('')

  // ------------------------------------------------ annotation overlay draw
  const redrawOverlay = () => {
    const svg = overlayRef.current
    const chart = chartRef.current
    const series = candleSeriesRef.current
    if (!svg || !chart || !series) return
    const a = analysisRef.current
    if (!a) { svg.innerHTML = ''; return }

    const width = svg.clientWidth
    const ts = chart.timeScale()
    const y = (price) => series.priceToCoordinate(price)
    const parts = []

    // Support / resistance zones: shaded horizontal bands, exactly like the reel
    for (const z of a.zones || []) {
      const yTop = y(z.price_high)
      const yBot = y(z.price_low)
      if (yTop == null || yBot == null) continue
      const color = z.kind === 'support' ? '34,192,122' : '239,83,80'
      parts.push(
        `<rect x="0" y="${Math.min(yTop, yBot)}" width="${width}" height="${Math.max(Math.abs(yBot - yTop), 2)}"` +
        ` fill="rgba(${color},0.09)" stroke="rgba(${color},0.35)" stroke-dasharray="5 4" stroke-width="1"/>`,
        `<text x="8" y="${Math.min(yTop, yBot) + 13}" fill="rgba(${color},0.9)"` +
        ` font-size="10" font-family="JetBrains Mono, monospace">${z.kind.toUpperCase()} × ${z.touches}</text>`
      )
    }

    // Trendlines: interpolate to the visible window if an endpoint scrolled out
    const visible = ts.getVisibleRange?.()
    for (const l of a.trendlines || []) {
      let { time1, price1, time2, price2 } = l
      if (visible && time2 !== time1) {
        const slope = (price2 - price1) / (time2 - time1)
        if (time1 < visible.from) { price1 += slope * (visible.from - time1); time1 = visible.from }
        if (time2 > visible.to) { price2 -= slope * (time2 - visible.to); time2 = visible.to }
      }
      const x1 = ts.timeToCoordinate(time1)
      const x2 = ts.timeToCoordinate(time2)
      const y1 = y(price1)
      const y2 = y(price2)
      if ([x1, x2, y1, y2].some((v) => v == null)) continue
      const color = l.direction === 'up' ? BULL : BEAR
      parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" stroke-dasharray="2 3" opacity="0.85"/>`)
    }

    svg.innerHTML = parts.join('')
  }

  // ------------------------------------------------------------ chart setup
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: '#8b9bb4',
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(36, 51, 79, 0.35)' },
        horzLines: { color: 'rgba(36, 51, 79, 0.35)' },
      },
      crosshair: {
        vertLine: { color: '#e8b64c55', labelBackgroundColor: '#1a2740' },
        horzLine: { color: '#e8b64c55', labelBackgroundColor: '#1a2740' },
      },
      rightPriceScale: { borderColor: 'rgba(36, 51, 79, 0.8)' },
      timeScale: { borderColor: 'rgba(36, 51, 79, 0.8)', timeVisible: true },
    })

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: BULL, downColor: BEAR,
      borderUpColor: BULL, borderDownColor: BEAR,
      wickUpColor: BULL, wickDownColor: BEAR,
    })
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    let markersApi = null
    try { markersApi = createSeriesMarkers(candles, []) } catch { /* markers unavailable */ }

    chartRef.current = chart
    candleSeriesRef.current = candles
    volumeSeriesRef.current = volume
    markersApiRef.current = markersApi

    const redraw = () => redrawOverlay()
    chart.timeScale().subscribeVisibleTimeRangeChange(redraw)
    const ro = new ResizeObserver(redraw)
    ro.observe(el)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      markersApiRef.current = null
    }
  }, [])

  // ------------------------------------------------------------- data load
  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    setLoading(true)
    setError('')
    clearAnalysis()

    api.candles(symbol, range, interval)
      .then((data) => {
        if (cancelled || !candleSeriesRef.current) return
        candleSeriesRef.current.setData(
          data.candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close }))
        )
        volumeSeriesRef.current.setData(
          data.candles.map((c) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(34,192,122,0.35)' : 'rgba(239,83,80,0.32)',
          }))
        )
        chartRef.current?.timeScale().fitContent()
        setMeta(data.meta)
        setSource(data.source)
        if (data.range !== range) setRange(data.range)
      })
      .catch((err) => { if (!cancelled) { setError(err.message); setMeta(null); setSource(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [symbol, range, interval])

  // --------------------------------------------------------- analyze action
  const clearAnalysis = () => {
    analysisRef.current = null
    setAnalysis(null)
    setAnalyzeError('')
    for (const line of priceLinesRef.current) {
      try { candleSeriesRef.current?.removePriceLine(line) } catch { /* already gone */ }
    }
    priceLinesRef.current = []
    markersApiRef.current?.setMarkers?.([])
    redrawOverlay()
  }

  const runAnalyze = async () => {
    if (analyzing) return
    clearAnalysis()
    setAnalyzing(true)
    setAnalyzeStep(0)
    const stepper = window.setInterval(
      () => setAnalyzeStep((s) => Math.min(s + 1, ANALYZE_STEPS.length - 1)), 2500
    )
    try {
      const result = await api.analyze(symbol, range, interval)
      analysisRef.current = result
      setAnalysis(result)

      const series = candleSeriesRef.current
      if (series && result.setup.plan) {
        const p = result.setup.plan
        const mk = (price, color, title, style = LineStyle.Solid) =>
          series.createPriceLine({ price, color, title, lineWidth: 1, lineStyle: style, axisLabelVisible: true })
        priceLinesRef.current = [
          mk(p.entry_high, BULL, 'ENTRY'),
          mk(p.stop_loss, BEAR, 'STOP'),
          mk(p.target1, BRASS, 'T1', LineStyle.Dashed),
          mk(p.target2, BRASS, 'T2', LineStyle.Dashed),
        ]
      }
      markersApiRef.current?.setMarkers?.(
        (result.markers || []).map((m) => ({
          time: m.time, position: m.position, shape: m.shape, text: m.label, color: BRASS,
        }))
      )
      redrawOverlay()
    } catch (err) {
      setAnalyzeError(err.message)
    } finally {
      window.clearInterval(stepper)
      setAnalyzing(false)
    }
  }

  const pickInterval = (iv) => {
    setInterval_(iv)
    if (!ALLOWED[iv].includes(range)) setRange(ALLOWED[iv][ALLOWED[iv].length - 1])
  }

  const up = meta ? meta.change >= 0 : true
  const currencySign = meta?.currency === 'INR' ? '₹' : meta?.currency === 'USD' ? '$' : ''

  return (
    <div>
      <section className="bg-ink-900 border border-ink-700 rounded-xl p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-mist-50 text-lg font-semibold tracking-tight">
              {symbol}
            </h2>
            {meta && (
              <div className="flex items-baseline gap-3 mt-0.5">
                <span className="price text-2xl text-mist-50">
                  {currencySign}{meta.last_close?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
                <span className={`price text-sm px-1.5 py-0.5 rounded ${up ? 'text-bull-500 bg-bull-500/10' : 'text-bear-500 bg-bear-500/10'}`}>
                  {up ? '+' : ''}{meta.change?.toFixed(2)} ({up ? '+' : ''}{meta.change_pct?.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={runAnalyze}
                disabled={analyzing || loading || !!error}
                className={`bg-brass-400 hover:bg-brass-300 disabled:opacity-50 text-ink-950 font-semibold text-sm rounded-lg px-4 py-1.5 transition-colors ${analyzing ? 'analyzing' : ''}`}
              >
                {analyzing ? ANALYZE_STEPS[analyzeStep] : 'Analyze'}
              </button>
              <div className="flex rounded-lg border border-ink-600 overflow-hidden">
                {INTERVALS.map((iv) => (
                  <button
                    key={iv}
                    onClick={() => pickInterval(iv)}
                    className={`px-3 py-1.5 text-xs price transition-colors ${
                      interval === iv ? 'bg-brass-400 text-ink-950 font-semibold' : 'text-mist-400 hover:text-mist-50 hover:bg-ink-800'
                    }`}
                  >
                    {iv}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex rounded-lg border border-ink-600 overflow-hidden">
              {RANGES.map((r) => {
                const allowed = ALLOWED[interval].includes(r)
                return (
                  <button
                    key={r}
                    onClick={() => allowed && setRange(r)}
                    disabled={!allowed}
                    title={allowed ? '' : `Not available on ${interval} candles (data provider limit)`}
                    className={`px-3 py-1.5 text-xs price transition-colors ${
                      range === r ? 'bg-ink-600 text-mist-50 font-semibold'
                      : allowed ? 'text-mist-400 hover:text-mist-50 hover:bg-ink-800'
                      : 'text-mist-400/30 cursor-not-allowed'
                    }`}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="relative mt-4">
          <div ref={containerRef} className="h-[440px] w-full" />
          <svg ref={overlayRef} className="absolute inset-0 w-full h-[440px] pointer-events-none" aria-hidden="true" />
          {loading && (
            <div className="absolute inset-0 grid place-items-center bg-ink-900/60 backdrop-blur-[1px] rounded-lg">
              <span className="w-6 h-6 border-2 border-mist-400/30 border-t-brass-400 rounded-full animate-spin" />
            </div>
          )}
          {error && !loading && (
            <div className="absolute inset-0 grid place-items-center">
              <p className="text-sm text-bear-500 bg-bear-500/10 border border-bear-500/30 rounded-lg px-4 py-3 max-w-md text-center">
                {error}
              </p>
            </div>
          )}
        </div>

        {analyzeError && (
          <p className="mt-3 text-sm text-bear-500 bg-bear-500/10 border border-bear-500/30 rounded-lg px-3 py-2">{analyzeError}</p>
        )}

        <SourceFooter source={source} />
      </section>

      <SetupCard analysis={analysis} currencySign={currencySign} />
    </div>
  )
}
