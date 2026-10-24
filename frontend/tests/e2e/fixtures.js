// Deterministic fixture market data for UI regression tests only.
export const source = { provider: 'UI test fixture', url: 'https://example.com/source', fetched_at: '2026-10-24T06:00:00Z', note: 'Deterministic test data.' }
export const candles = Array.from({ length: 140 }, (_, i) => {
  const close = 100 + i * .2 + Math.sin(i / 4) * 2
  return { time: 1700006400 + i * 86400, open: close - .3, high: close + 1, low: close - 1, close, volume: 1000 + i * 10 }
})
export const instruments = [
  { symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'MSFT', name: 'Microsoft', exchange: 'NASDAQ', type: 'EQUITY' },
  { symbol: 'RELIANCE.NS', name: 'Reliance Industries', exchange: 'NSE', type: 'EQUITY' },
]
export const segments = [
  { id: 'india_large', group: 'Indian Stocks', label: 'Large Cap', items: [instruments[2]] },
  { id: 'india_mid', group: 'Indian Stocks', label: 'Mid Cap', items: [{ symbol: 'POLYCAB.NS', name: 'Polycab' }] },
  { id: 'us', group: 'US Stocks', label: 'US Stocks', items: instruments.slice(0, 2) },
  { id: 'etf', group: 'ETFs', label: 'ETFs', items: [{ symbol: 'SPY', name: 'SPDR S&P 500' }] },
  { id: 'crypto', group: 'Crypto', label: 'Crypto', items: [{ symbol: 'BTC-USD', name: 'Bitcoin' }] },
]
export const indicator = { id: 'sma', name: 'Simple Moving Average', category: 'Trend', level: 'beginner', pane: 'overlay', description: 'Average of closing prices.', how_to_read: 'Compare price with its average.', params: { period: { default: 20, min: 2, max: 200 } } }
const quote = row => ({ ...row, price: 128.5, change: 1.2, change_pct: .94, currency: '$', volume: 400000, spark: [122, 124, 123, 128.5] })
export const analysis = symbol => ({ symbol, interval: '1D', range: '1Y',
  setup: { state: 'breakout_above_resistance', bias: 'bullish', confidence: 72,
    plan: { entry_low: 125, entry_high: 128, stop_loss: 120, target1: 140, target2: 150, risk_reward: 2 },
    factors: [{ name: 'Support confirmed across multiple sessions', contribution: 20, max: 25 }] },
  indicators: { last_close: 128.5, rsi14: 62, atr14: 2.4, volume_ratio: 1.6 },
  zones: [{ kind: 'support', price_low: 121, price_high: 123, touches: 3 }],
  trendlines: [{ time1: candles[20].time, price1: 104, time2: candles[100].time, price2: 120, direction: 'up' }], markers: [],
  narration: { pattern: 'A computed breakout setup.', why: 'Price broke above resistance.', confirmation: 'Watch for stronger volume.', invalidation: 'A support break weakens the setup.' },
  verification: { status: 'verified', unsupported_sentences_removed: 0 }, source, saved_plan_id: 1, disclaimer: 'Test fixture only.',
})
export const research = { symbol: 'AAPL', name: 'Apple', currency: 'USD', sector: 'Technology', industry: 'Consumer Electronics', market_cap: 3000000000000, data_freshness: '2026', data_quality: 90, ai_score: 75, ai_band: 'Strong', verdict: 'WATCH', confidence: 70,
  fair_value: { available: true, bear: 100, conservative: 120, base: 140, bull: 170, current_price: 128.5, upside_pct: 9, models: { earnings: 140, cash_flow: 142 }, model_weights: { earnings: .5, cash_flow: .5 }, model_agreement: .9, confidence: 70, assumptions: { a: 'Uses reported earnings.' } },
  value_trap: { risk: 'MINIMAL', signals: [] },
  scores: Object.fromEntries(['financial_health', 'cash_flow', 'growth', 'profitability', 'valuation', 'technical', 'risk'].map(key => [key, { score: 70, band: 'Good', upside_pct: 9 }])),
  thesis: { why_buy: ['Consistent operating cash flow.'], why_not: ['Valuation uncertainty.'] }, source, validation_note: 'Computed fixture.' }

export async function fixtureApp(page, { authenticated = true } = {}) {
  await page.addInitScript(auth => { if (auth) localStorage.setItem('swinglens_token', 'fixture-session'); else localStorage.removeItem('swinglens_token') }, authenticated)
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '' }))
  await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }))
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url()), path = decodeURIComponent(url.pathname)
    const method = route.request().method()
    let result
    if (path === '/api/health') result = { status: 'ok', demo: false }
    else if (path === '/api/auth/me') result = { id: 1, username: 'responsive_tester', email: 'test@example.com' }
    else if (path === '/api/auth/login' || path === '/api/auth/register') result = { access_token: 'fixture-session', username: 'responsive_tester' }
    else if (path === '/api/markets/catalog') result = { segments, source }
    else if (path === '/api/markets/segments') result = { segments: segments.map(segment => ({ ...segment, count: segment.items.length })) }
    else if (path === '/api/markets/overview') result = { items: instruments.map(quote), source }
    else if (path.startsWith('/api/markets/')) result = { items: instruments.map(quote), source }
    else if (path === '/api/stocks/search') result = { results: instruments.filter(row => `${row.name} ${row.symbol}`.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase())), source }
    else if (path.endsWith('/candles')) result = { symbol: path.split('/')[3], candles, range: url.searchParams.get('range'), interval: url.searchParams.get('interval'), meta: { currency: 'USD', last_close: 128.5, change: 1.2, change_pct: .94, price_basis: 'Provider-adjusted OHLC', time_basis: 'Exchange session date' }, source }
    else if (path.startsWith('/api/analysis/') && method === 'POST') result = analysis(path.split('/').at(-1))
    else if (path === '/api/analysis/plans') result = []
    else if (path === '/api/indicators') result = { indicators: [indicator, { ...indicator, id: 'rsi', name: 'RSI', category: 'Momentum', pane: 'sub' }] }
    else if (path.startsWith('/api/indicators/')) result = { results: (route.request().postDataJSON()?.indicators || []).map(item => ({ uid: item.uid, pane: item.id === 'rsi' ? 'sub' : 'overlay', series: [{ type: 'line', color: '#e8b64c', data: candles.map(bar => ({ time: bar.time, value: item.id === 'rsi' ? 50 : bar.close - 1 })) }], reference_lines: [] })), source }
    else if (path === '/api/watchlist') result = { items: [] }
    else if (path.startsWith('/api/watchlist/')) result = { watched: true }
    else if (path === '/api/alerts/check') result = { triggered: [] }
    else if (path === '/api/alerts') result = method === 'POST' ? { id: 1 } : { alerts: [] }
    else if (path.startsWith('/api/alerts/')) result = { deleted: 1 }
    else if (path === '/api/track-record') result = { total_plans: 0 }
    else if (path.startsWith('/api/news')) result = { items: [{ id: 'news1', title: 'Market news headline with context for responsive display', url: 'https://example.com/news', source_name: 'Example News', confirmed: true, corroborated_by: ['Example News', 'Other News'], published_at: '2026-10-24T06:00:00Z' }], confirmed_count: 1, feeds_failed: [], source }
    else if (path === '/api/ai/status') result = { online: true }
    else if (path === '/api/ai/conversations') result = []
    else if (path.includes('/api/ai/conversations/')) result = []
    else if (path === '/api/ai/chat') result = { reply: 'Diversification spreads exposure across assets.', provider: 'fixture', conversation_id: 1, source }
    else if (path === '/api/portfolio/summary') result = { empty: false, position_count: 1, invested: 1000, current: 1285, pnl: 285, pnl_pct: 28.5, top3_concentration_pct: 100, source, positions: [{ symbol_raw: 'AAPL', symbol: 'AAPL', name: 'Apple with a deliberately long holding name', quantity: 10, avg_price: 100, ltp: 128.5, pnl: 285, pnl_pct: 28.5, weight_pct: 100, ltp_source: 'live' }] }
    else if (path === '/api/portfolio/behavior') result = { empty: true }
    else if (path === '/api/portfolio/import') result = { kind: 'holdings', imported: 1, broker: 'test', skipped: 0 }
    else if (path === '/api/portfolio') result = { deleted_holdings: 1 }
    else if (path === '/api/research/discovery/lists') result = { lists: [{ id: 'most_undervalued', label: 'Most undervalued' }, { id: 'quality', label: 'Quality stocks' }] }
    else if (path.startsWith('/api/research/discovery/')) result = { rows: instruments.map(row => ({ ...row, price: 128.5, fair_value: 140, upside_pct: 9, ai_score: 75, ai_band: 'Strong', verdict: 'Watchlist', health: 'Good', cash_flow: 'Good', growth: 70, risk: 'Low' })), label: 'Most undervalued' }
    else if (path.startsWith('/api/research/')) result = research
    else if (path === '/api/thesis') result = method === 'POST' ? { id: 1 } : [{ id: 1, symbol: 'AAPL', name: 'Apple', note: 'A saved research thesis', last_health: 75, last_changes: [], created_at: '2026-10-24T06:00:00Z', snapshot: { verdict: 'WATCH', ai_score: 75 } }]
    else if (path.endsWith('/check')) result = { health: 75, changes: [] }
    else if (path.startsWith('/api/thesis/')) result = { deleted: 1 }
    else throw new Error(`Unhandled API fixture: ${method} ${path}`)
    await route.fulfill({ json: result })
  })
  await page.goto('/')
  if (authenticated) await page.getByRole('navigation', { name: 'Workspace navigation' }).waitFor()
}
