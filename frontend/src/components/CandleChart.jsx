import { useCallback, useEffect, useRef, useState } from 'react'
import { createChart, createSeriesMarkers, HistogramSeries, LineSeries, LineStyle } from 'lightweight-charts'
import { api } from '../api'
import { useDialog } from '../hooks/useDialog'
import { CHART_TYPES } from '../utils/chartTypes'
import { pricePrecision, validCandles } from '../utils/candles'
import CandleChartPanel from './ui/candle-chart'
import IndicatorChips from './IndicatorChips'
import IndicatorDialog from './IndicatorDialog'
import SetupCard from './SetupCard'
import SourceFooter from './SourceFooter'

const ranges = ['1M', '3M', '6M', '1Y', '5Y', 'MAX']
const intervals = ['15m', '1H', '1D', '1W']
const allowed = { '15m': ['1M'], '1H': ['1M', '3M', '6M', '1Y'], '1D': ranges, '1W': ranges }
const storeKey = 'sl_active_indicators'
const bull = '#34c28a', bear = '#d0625f', brass = '#e8b64c'
function savedIndicators() {
  try {
    const value = JSON.parse(localStorage.getItem(storeKey))
    return Array.isArray(value) ? value.filter(row => row && typeof row.id === 'string' && typeof row.uid === 'string' && row.params && typeof row.params === 'object').slice(0, 12) : []
  } catch { return [] }
}
const uid = () => `indicator-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const svgNode = (name, attrs, text) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name)
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value))
  if (text) node.textContent = text
  return node
}

export default function CandleChart({ symbol, analyzeSignal = 0, onAnalysis, watched, onToggleWatch }) {
  const [range, setRange] = useState('1Y')
  const [interval, setInterval] = useState('1D')
  const [chartType, setChartType] = useState('candles')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')
  const [legend, setLegend] = useState(null)
  const [full, setFull] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [active, setActive] = useState(savedIndicators)
  const [indResults, setIndResults] = useState([])
  const [indicatorError, setIndicatorError] = useState('')
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertPrice, setAlertPrice] = useState('')
  const [alertMessage, setAlertMessage] = useState('')
  const [alertBusy, setAlertBusy] = useState(false)
  const container = useRef(null), overlay = useRef(null)
  const chart = useRef(null), main = useRef(null), volume = useRef(null), markers = useRef(null)
  const indicatorHandles = useRef([]), priceLines = useRef([])
  const dataRef = useRef(null), analysisRef = useRef(null), barsByTime = useRef(new Map())
  const overlayFrame = useRef(0), hoverFrame = useRef(0), analyzeVersion = useRef(0), analyzeBusy = useRef(false)
  const rangeRef = useRef(null), typeRef = useRef(chartType), onAnalysisRef = useRef(onAnalysis)
  onAnalysisRef.current = onAnalysis
  typeRef.current = chartType
  const fullRef = useDialog(full, () => setFull(false))
  const alertRef = useDialog(alertOpen, () => setAlertOpen(false))

  const redraw = useCallback(() => {
    const target = overlay.current, instance = chart.current, series = main.current
    if (!target || !instance || !series) return
    target.replaceChildren()
    const value = analysisRef.current
    if (!value || typeRef.current === 'heikin') return
    const { width, height } = instance.paneSize(0)
    target.style.width = `${width}px`; target.style.height = `${height}px`
    target.setAttribute('viewBox', `0 0 ${width} ${height}`)
    target.style.overflow = 'hidden'
    for (const zone of value.zones || []) {
      const y1 = series.priceToCoordinate(zone.price_high), y2 = series.priceToCoordinate(zone.price_low)
      if (![y1, y2].every(Number.isFinite)) continue
      const color = zone.kind === 'support' ? bull : bear
      target.append(svgNode('rect', { x: 0, y: Math.min(y1, y2), width, height: Math.max(2, Math.abs(y2 - y1)), fill: color, 'fill-opacity': .08, stroke: color, 'stroke-opacity': .3, 'stroke-dasharray': '4 4' }))
      if (Math.min(y1, y2) > -10 && Math.min(y1, y2) < height - 15) target.append(svgNode('text', { x: 8, y: Math.min(y1, y2) + 12, fill: color, 'font-size': 9 }, `${zone.kind.toUpperCase()} · ${zone.touches} touches`))
    }
    for (const line of value.trendlines || []) {
      const x1 = instance.timeScale().timeToCoordinate(line.time1), x2 = instance.timeScale().timeToCoordinate(line.time2)
      const y1 = series.priceToCoordinate(line.price1), y2 = series.priceToCoordinate(line.price2)
      if ([x1, x2, y1, y2].every(Number.isFinite)) target.append(svgNode('line', { x1, x2, y1, y2, stroke: line.direction === 'up' ? bull : bear, 'stroke-width': 1.5, 'stroke-dasharray': '3 3' }))
    }
  }, [])
  const scheduleOverlay = useCallback(() => {
    cancelAnimationFrame(overlayFrame.current)
    overlayFrame.current = requestAnimationFrame(redraw)
  }, [redraw])

  const annotate = useCallback(() => {
    const series = main.current
    if (!series) return
    for (const line of priceLines.current) { try { series.removePriceLine(line) } catch { /* Series was rebuilt. */ } }
    priceLines.current = []
    markers.current?.setMarkers([])
    const value = analysisRef.current
    if (!value || typeRef.current === 'heikin') { scheduleOverlay(); return }
    const plan = value.setup?.plan
    if (plan) for (const [price, color, title] of [[plan.entry_high, bull, 'ENTRY'], [plan.stop_loss, bear, 'STOP'], [plan.target1, brass, 'T1'], [plan.target2, brass, 'T2']]) {
      if (Number.isFinite(price)) priceLines.current.push(series.createPriceLine({ price, color, title, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true }))
    }
    const unique = new Map()
    for (const point of value.markers || []) if (barsByTime.current.has(point.time)) unique.set(point.time, { time: point.time, position: point.position, shape: point.shape, text: point.label, color: brass })
    markers.current?.setMarkers([...unique.values()].sort((a, b) => a.time - b.time))
    scheduleOverlay()
  }, [scheduleOverlay])

  const fillChart = useCallback(() => {
    const value = dataRef.current
    if (!value || !main.current || !chart.current) return
    const definition = CHART_TYPES[typeRef.current]
    const seriesData = definition.transform(value.candles)
    main.current.setData(seriesData)
    if (definition.optionsFrom) main.current.applyOptions(definition.optionsFrom(seriesData))
    const precision = pricePrecision(value.meta.last_close)
    main.current.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
    volume.current.setData(value.candles.map(bar => ({ time: bar.time, value: bar.volume, color: bar.close >= bar.open ? '#34c28a66' : '#d0625f66' })))
    const visible = rangeRef.current
    if (visible) chart.current.timeScale().setVisibleLogicalRange(visible)
    else chart.current.timeScale().setVisibleLogicalRange({ from: Math.max(0, value.candles.length - 90), to: value.candles.length + 4 })
    annotate()
  }, [annotate])

  useEffect(() => {
    const instance = createChart(container.current, {
      autoSize: true,
      layout: { background: { color: '#0c1220' }, textColor: '#8b9bb4', fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
        panes: { separatorColor: '#1a2740', separatorHoverColor: '#e8b64c55', enableResize: true } },
      grid: { vertLines: { color: '#1a274040' }, horzLines: { color: '#1a274055' } },
      crosshair: { vertLine: { color: '#8b9bb466', labelBackgroundColor: '#24334f' }, horzLine: { color: '#8b9bb466', labelBackgroundColor: '#24334f' } },
      rightPriceScale: { borderColor: '#1a2740', scaleMargins: { top: .12, bottom: .12 }, minimumWidth: 65 },
      timeScale: { borderColor: '#1a2740', timeVisible: ['15m', '1H'].includes(interval), secondsVisible: false, rightOffset: 4, barSpacing: 7 },
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      kineticScroll: { touch: true, mouse: true },
    })
    const definition = CHART_TYPES[chartType]
    const series = instance.addSeries(definition.kind, { ...(definition.options || {}), priceLineVisible: true, lastValueVisible: true }, 0)
    const volumes = instance.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false }, 1)
    instance.panes()[1].setHeight(85)
    volumes.priceScale().applyOptions({ scaleMargins: { top: .15, bottom: 0 } })
    chart.current = instance; main.current = series; volume.current = volumes
    markers.current = createSeriesMarkers(series, [])
    indicatorHandles.current = []; priceLines.current = []
    instance.timeScale().subscribeVisibleLogicalRangeChange(scheduleOverlay)
    instance.subscribeCrosshairMove(point => {
      const bar = barsByTime.current.get(point.time)
      cancelAnimationFrame(hoverFrame.current)
      hoverFrame.current = requestAnimationFrame(() => setLegend(bar || null))
    })
    const observer = new ResizeObserver(scheduleOverlay)
    observer.observe(container.current)
    fillChart()
    return () => {
      rangeRef.current = instance.timeScale().getVisibleLogicalRange()
      observer.disconnect(); cancelAnimationFrame(overlayFrame.current); cancelAnimationFrame(hoverFrame.current)
      markers.current?.detach(); instance.remove()
      chart.current = null; main.current = null; volume.current = null; markers.current = null; indicatorHandles.current = []
    }
  }, [chartType, fillChart, scheduleOverlay])

  useEffect(() => {
    let alive = true
    analyzeVersion.current++; analyzeBusy.current = false
    setAnalyzing(false); setAnalyzeError(''); setLoading(true); setError(''); setData(null); setLegend(null); setAnalysis(null); setAlertOpen(false)
    dataRef.current = null; analysisRef.current = null; rangeRef.current = null; barsByTime.current = new Map()
    onAnalysisRef.current?.(null)
    main.current?.setData([]); volume.current?.setData([]); annotate()
    api.candles(symbol, range, interval).then(result => {
      if (!alive) return
      const candles = validCandles(result.candles)
      if (!candles.length) throw new Error('No valid candles were returned. Try another range or refresh.')
      const next = { ...result, candles, meta: { ...result.meta, candle_count: candles.length } }
      dataRef.current = next; barsByTime.current = new Map(candles.map(bar => [bar.time, bar]))
      setData(next); fillChart()
      chart.current?.applyOptions({ timeScale: { timeVisible: ['15m', '1H'].includes(interval) } })
    }).catch(err => { if (alive) setError(err.message) }).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false; analyzeVersion.current++ }
  }, [symbol, range, interval, reload, annotate, fillChart])

  useEffect(() => {
    try { localStorage.setItem(storeKey, JSON.stringify(active)) } catch { /* Chart remains usable when storage is full/blocked. */ }
    let alive = true
    setIndResults([]); setIndicatorError('')
    if (!active.length || !data) return
    api.computeIndicators(symbol, range, interval, active.map(({ uid, id, params }) => ({ uid, id, params })))
      .then(result => { if (alive) setIndResults(result.results || []) })
      .catch(err => { if (alive) setIndicatorError(err.message) })
    return () => { alive = false }
  }, [active, symbol, range, interval, data])

  useEffect(() => {
    const instance = chart.current
    if (!instance) return
    for (const handle of indicatorHandles.current) { try { instance.removeSeries(handle) } catch { /* Series already removed. */ } }
    indicatorHandles.current = []
    let pane = 2
    for (const result of indResults) {
      const paneIndex = result.pane === 'overlay' ? 0 : pane++
      let first = null
      for (const item of result.series || []) {
        const handle = instance.addSeries(item.type === 'histogram' ? HistogramSeries : LineSeries,
          { color: item.color, lineWidth: item.lineWidth || 1, lineStyle: item.lineStyle || 0, priceLineVisible: false, lastValueVisible: false }, paneIndex)
        const ordered = [...new Map((item.data || []).filter(row => Number.isFinite(row.time) && Number.isFinite(row.value)).map(row => [row.time, row])).values()].sort((a, b) => a.time - b.time)
        handle.setData(ordered); indicatorHandles.current.push(handle); first ||= handle
      }
      if (result.pane !== 'overlay') {
        instance.panes()[paneIndex]?.setHeight(90)
        for (const price of result.reference_lines || []) if (Number.isFinite(price)) first?.createPriceLine({ price, color: '#8b9bb444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: false })
      }
    }
    scheduleOverlay()
  }, [indResults, chartType, scheduleOverlay])

  const runAnalyze = useCallback(async () => {
    if (analyzeBusy.current || !dataRef.current) return
    analyzeBusy.current = true
    const version = ++analyzeVersion.current
    setAnalyzing(true); setAnalyzeError('')
    try {
      const result = await api.analyze(symbol, range, interval)
      if (version !== analyzeVersion.current) return
      analysisRef.current = result; setAnalysis(result); onAnalysisRef.current?.(result); annotate()
    } catch (err) { if (version === analyzeVersion.current) setAnalyzeError(err.message) }
    finally { if (version === analyzeVersion.current) { analyzeBusy.current = false; setAnalyzing(false) } }
  }, [symbol, range, interval, annotate])
  const handledSignal = useRef(0)
  useEffect(() => {
    if (analyzeSignal > 0 && analyzeSignal !== handledSignal.current && data && !loading) { handledSignal.current = analyzeSignal; runAnalyze() }
  }, [analyzeSignal, data, loading, runAnalyze])

  const setTimeframe = value => { setInterval(value); if (!allowed[value].includes(range)) setRange(allowed[value].at(-1)) }
  const zoom = factor => {
    const scale = chart.current?.timeScale(), visible = scale?.getVisibleLogicalRange()
    if (!visible) return
    const span = Math.max(10, Math.min((data?.candles.length || 200) + 20, (visible.to - visible.from) * factor))
    scale.setVisibleLogicalRange({ from: visible.to - span, to: visible.to })
  }
  const addIndicator = entry => {
    if (active.length >= 12) { setIndicatorError('Remove an indicator before adding another; a maximum of twelve keeps the chart responsive.'); return }
    setActive(rows => [...rows, { uid: uid(), id: entry.id, label: entry.name, params: Object.fromEntries(Object.entries(entry.params || {}).map(([key, spec]) => [key, spec.default])), paramSpec: entry.params || {} }])
  }
  const createAlert = async event => {
    event.preventDefault()
    const price = Number(alertPrice)
    if (!Number.isFinite(price) || price <= 0) { setAlertMessage('Enter a positive price.'); return }
    setAlertBusy(true); setAlertMessage('')
    try { await api.createAlert(symbol, price, price >= data.meta.last_close ? 'above' : 'below'); setAlertMessage('Price alert saved.'); }
    catch (err) { setAlertMessage(err.message) } finally { setAlertBusy(false) }
  }
  const currentBar = legend || data?.candles.at(-1)
  const currency = data?.meta.currency === 'INR' ? '₹' : data?.meta.currency === 'USD' ? '$' : `${data?.meta.currency || ''} `
  const number = value => Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: pricePrecision(value) }) : '—'
  return <div ref={fullRef} className={full ? 'chart-fullscreen' : 'min-w-0'} role={full ? 'dialog' : undefined} aria-modal={full || undefined} aria-label={full ? `${symbol} expanded chart` : undefined}>
    <CandleChartPanel heading={<>
      <p className="text-[10px] uppercase tracking-[.15em] text-mist-400">{symbol.endsWith('.NS') ? 'NSE' : symbol.endsWith('.BO') ? 'BSE' : 'Global markets'} / Price action</p>
      <h2 className="text-lg text-mist-50 font-semibold mt-1">{symbol}</h2>
      <div className="flex flex-wrap items-baseline gap-3 mt-2"><span className="price text-2xl text-mist-50">{data ? currency + number(data.meta.last_close) : '—'}</span>
        {data && <span className={`price text-xs ${data.meta.change >= 0 ? 'text-bull-500' : 'text-bear-500'}`}>{data.meta.change >= 0 ? '+' : ''}{number(data.meta.change)} ({data.meta.change_pct}%)</span>}</div>
    </>} actions={<>
      <button type="button" className="icon-button" aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'} aria-pressed={watched} onClick={() => onToggleWatch?.(symbol)}>{watched ? '★' : '☆'}</button>
      <button type="button" className="quiet-button" disabled={!data} onClick={() => { setAlertOpen(true); setAlertPrice(String(data.meta.last_close)); setAlertMessage('') }}>Alert</button>
      <button type="button" className="quiet-button" aria-label={full ? 'Exit expanded chart' : 'Expand chart'} onClick={() => setFull(value => !value)}>{full ? 'Close' : 'Expand'}</button>
    </>} toolbar={<>
      <div className="terminal-controls"><label className="sr-only" htmlFor="chart-type">Chart style</label><select id="chart-type" aria-label="Chart style" value={chartType} onChange={event => setChartType(event.target.value)} className="quiet-button max-w-40">{Object.entries(CHART_TYPES).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</select>
        <button type="button" className="quiet-button" onClick={() => setDialogOpen(true)}>ƒx Indicators</button>
        <button type="button" className="action-button" disabled={loading || analyzing || !data || !!error} onClick={runAnalyze}>{analyzing ? 'Analyzing…' : 'Analyze'}</button></div>
      <div className="segmented-control" aria-label="Candle interval">{intervals.map(value => <button type="button" key={value} aria-pressed={interval === value} onClick={() => setTimeframe(value)}>{value}</button>)}</div>
      <div className="segmented-control" aria-label="Chart history range">{ranges.map(value => <button type="button" key={value} aria-pressed={range === value} disabled={!allowed[interval].includes(value)} onClick={() => setRange(value)}>{value}</button>)}</div>
    </>} legend={<>
      {currentBar ? <><span className="text-mist-400">{new Date(currentBar.time * 1000).toLocaleString(undefined, { dateStyle: 'medium', ...(interval === '1D' || interval === '1W' ? {} : { timeStyle: 'short' }), timeZone: 'UTC' })}{interval === '1D' || interval === '1W' ? '' : ' UTC'}</span>
        {['open', 'high', 'low', 'close'].map(key => <span key={key}><span className="text-mist-400 uppercase">{key[0]}</span> {number(currentBar[key])}</span>)}
        <span><span className="text-mist-400">Vol</span> {Intl.NumberFormat('en', { notation: 'compact' }).format(currentBar.volume)}</span></> : <span className="text-mist-400">OHLCV appears when candles load.</span>}
    </>} footer={<>
      <span>{data?.candles.length || 0} bars · {data?.meta.time_basis || 'Exchange dates / UTC intraday'} · {data?.meta.price_basis || 'Provider prices'}</span>
      <div className="flex flex-wrap gap-1"><button type="button" aria-label="Zoom in" className="quiet-button" onClick={() => zoom(.75)}>+</button><button type="button" aria-label="Zoom out" className="quiet-button" onClick={() => zoom(1.3)}>−</button>
        <button type="button" className="quiet-button" onClick={() => chart.current?.timeScale().fitContent()}>Fit all</button>
        <button type="button" className="quiet-button" onClick={() => { rangeRef.current = null; main.current?.priceScale().applyOptions({ autoScale: true }); fillChart() }}>Reset</button>
        <button type="button" className="quiet-button" disabled={loading} onClick={() => setReload(value => value + 1)}>Refresh</button></div>
    </>}>
      <div className="chart-plot" onPointerMove={scheduleOverlay} onPointerUp={scheduleOverlay} onWheel={scheduleOverlay}>
        <div ref={container} className="chart-canvas" data-testid="chart-canvas" aria-label={`${symbol} OHLCV chart`} />
        <svg ref={overlay} className="chart-overlay" aria-label="Computed support, resistance and trendlines" />
        {loading && <div className="chart-loading" role="status"><span className="spinner" />Loading {symbol} candles…</div>}
        {error && !loading && <div className="chart-loading" role="alert"><p className="text-bear-500">{error}</p><button type="button" className="quiet-button" onClick={() => setReload(value => value + 1)}>Retry chart</button></div>}
      </div>
    </CandleChartPanel>
    <div className="px-1">
      <IndicatorChips active={active} onUpdateParams={(value, params) => setActive(rows => rows.map(row => row.uid === value ? { ...row, params } : row))} onRemove={value => setActive(rows => rows.filter(row => row.uid !== value))} />
      {indicatorError && <p role="alert" className="text-sm text-bear-500 mt-3">{indicatorError}</p>}
      {chartType === 'heikin' && <p className="text-xs text-brass-400 mt-3">Heikin Ashi displays averaged candles. Computed setup annotations are shown on standard price views.</p>}
      {analyzeError && <p role="alert" className="text-sm text-bear-500 mt-3">{analyzeError}</p>}
      <p className="text-[10px] text-mist-400 mt-3">Drag sideways to pan · pinch or use +/− to zoom · drag the price axis to scale · scroll vertically to move the page.</p>
      <SourceFooter source={data?.source} />
    </div>
    <SetupCard analysis={analysis} currencySign={currency.trim()} />
    <IndicatorDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onAdd={addIndicator} activeIds={active.map(row => row.id)} />
    {alertOpen && <div className="modal-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) setAlertOpen(false) }}>
      <form ref={alertRef} onSubmit={createAlert} role="dialog" aria-modal="true" aria-labelledby="alert-title" className="modal-panel max-w-sm p-4 gap-3">
        <div className="flex items-center justify-between"><h2 id="alert-title" className="font-semibold">Price alert · {symbol}</h2><button type="button" className="icon-button" aria-label="Close price alert" onClick={() => setAlertOpen(false)}>×</button></div>
        <label className="text-sm">Alert price ({data?.meta.currency})<input type="number" min="0.000001" step="any" value={alertPrice} onChange={event => setAlertPrice(event.target.value)} className="search-input block w-full mt-2" required /></label>
        <button className="action-button" disabled={alertBusy}>{alertBusy ? 'Saving…' : 'Save alert'}</button>
        {alertMessage && <p role="status" className="text-sm text-brass-400">{alertMessage}</p>}
      </form>
    </div>}
  </div>
}
