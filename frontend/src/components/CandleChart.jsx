import { useEffect, useRef, useState } from 'react'
import { CandlestickSeries, HistogramSeries, createChart } from 'lightweight-charts'
import { api } from '../api'
import SourceFooter from './SourceFooter'

const RANGES = ['1M', '3M', '6M', '1Y', '5Y', 'MAX']
const INTERVALS = ['15m', '1H', '1D', '1W']
// Mirrors the backend rules (Yahoo's history limits per interval)
const ALLOWED = {
  '15m': ['1M'],
  '1H': ['1M', '3M', '6M', '1Y'],
  '1D': RANGES,
  '1W': RANGES,
}

const BULL = '#22c07a'
const BEAR = '#ef5350'

export default function CandleChart({ symbol }) {
  const containerRef = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)

  const [range, setRange] = useState('1Y')
  const [interval, setInterval_] = useState('1D')
  const [meta, setMeta] = useState(null)
  const [source, setSource] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Create the chart once
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
      upColor: BULL,
      downColor: BEAR,
      borderUpColor: BULL,
      borderDownColor: BEAR,
      wickUpColor: BULL,
      wickDownColor: BEAR,
    })

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
      priceLineVisible: false,
      lastValueVisible: false,
    })
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })

    chartRef.current = chart
    candleSeriesRef.current = candles
    volumeSeriesRef.current = volume

    return () => {
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
    }
  }, [])

  // Load data whenever symbol / range / interval changes
  useEffect(() => {
    if (!symbol) return
    let cancelled = false
    setLoading(true)
    setError('')

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
        if (data.range !== range) setRange(data.range) // backend clamped an invalid combo
      })
      .catch((err) => { if (!cancelled) { setError(err.message); setMeta(null); setSource(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [symbol, range, interval])

  const pickInterval = (iv) => {
    setInterval_(iv)
    if (!ALLOWED[iv].includes(range)) setRange(ALLOWED[iv][ALLOWED[iv].length - 1])
  }

  const up = meta ? meta.change >= 0 : true
  const currencySign = meta?.currency === 'INR' ? '₹' : meta?.currency === 'USD' ? '$' : ''

  return (
    <section className="bg-ink-900 border border-ink-700 rounded-xl p-4 sm:p-5">
      {/* Header: symbol + last price */}
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

        {/* Interval + range switchers */}
        <div className="flex flex-col items-end gap-2">
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

      {/* Chart canvas */}
      <div className="relative mt-4">
        <div ref={containerRef} className="h-[440px] w-full" />
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

      <SourceFooter source={source} />
    </section>
  )
}
