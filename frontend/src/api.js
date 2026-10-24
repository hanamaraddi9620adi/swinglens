// Same-origin requests keep provider credentials exclusively on the server.
const TOKEN_KEY = 'swinglens_token'
export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = t => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function request(path, { method = 'GET', body, timeout = 290000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  const headers = {}
  const isForm = body instanceof FormData
  if (body && !isForm) headers['Content-Type'] = 'application/json'
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`
  try {
    const res = await fetch(path, { method, headers, signal: controller.signal, body: body ? (isForm ? body : JSON.stringify(body)) : undefined })
    let data
    try { data = await res.json() } catch { throw new Error(`The server returned an invalid response (${res.status}). Please try again.`) }
    if (!res.ok) {
      const detail = data?.detail
      const message = typeof detail === 'string' ? detail : Array.isArray(detail)
        ? detail.map(d => `${d.loc?.slice(1).join('.') || 'Input'}: ${d.msg}`).join('; ')
        : detail?.message || `Request failed (${res.status})`
      const error = new Error(message)
      error.status = res.status
      error.detail = detail
      if (res.status === 401 && !path.startsWith('/api/auth/login')) {
        clearToken(); window.dispatchEvent(new Event('swinglens:unauthorized'))
      }
      throw error
    }
    return data
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request took too long. Please try again.')
    if (error instanceof TypeError) throw new Error('Unable to reach the server. Check your connection and retry.')
    throw error
  } finally { clearTimeout(timer) }
}
const enc = encodeURIComponent
export const api = {
  register: (username, email, password) => request('/api/auth/register', { method: 'POST', body: { username, email, password } }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),
  searchStocks: q => request(`/api/stocks/search?q=${enc(q)}`),
  candles: (symbol, range, interval) => request(`/api/stocks/${enc(symbol)}/candles?range=${enc(range)}&interval=${enc(interval)}`),
  aiChat: (message, context, conversation_id) => request('/api/ai/chat', { method: 'POST', body: { message, context, conversation_id }, timeout: 90000 }),
  aiConversations: () => request('/api/ai/conversations'),
  aiMessages: id => request(`/api/ai/conversations/${id}/messages`),
  aiDeleteConversation: id => request(`/api/ai/conversations/${id}`, { method: 'DELETE' }),
  aiStatus: () => request('/api/ai/status', { timeout: 15000 }),
  runScan: (segment, top = 5) => request(`/api/scan?segment=${enc(segment)}&top=${top}`),
  importPortfolio: (file, broker) => {
    const body = new FormData(); body.append('file', file); body.append('broker', broker)
    return request('/api/portfolio/import', { method: 'POST', body })
  },
  portfolioSummary: () => request('/api/portfolio/summary'),
  portfolioBehavior: () => request('/api/portfolio/behavior'),
  clearPortfolio: () => request('/api/portfolio', { method: 'DELETE' }),
  watchlist: () => request('/api/watchlist'),
  toggleWatch: (symbol, name) => request(`/api/watchlist/${enc(symbol)}?name=${enc(name || '')}`, { method: 'POST' }),
  alerts: () => request('/api/alerts'),
  createAlert: (symbol, price, direction) => request(`/api/alerts?symbol=${enc(symbol)}&price=${price}&direction=${enc(direction)}`, { method: 'POST' }),
  deleteAlert: id => request(`/api/alerts/${id}`, { method: 'DELETE' }),
  checkAlerts: () => request('/api/alerts/check', { method: 'POST' }),
  trackRecord: () => request('/api/track-record', { method: 'POST' }),
  analyze: (symbol, range, interval) => request(`/api/analysis/${enc(symbol)}?range=${enc(range)}&interval=${enc(interval)}`, { method: 'POST' }),
  myPlans: () => request('/api/analysis/plans'),
  newsMarket: () => request('/api/news/market'),
  newsSymbol: symbol => request(`/api/news/${enc(symbol)}`),
  marketSegments: () => request('/api/markets/segments'),
  marketsOverview: () => request('/api/markets/overview'),
  marketSegment: id => request(`/api/markets/${enc(id)}`),
  indicatorCatalog: () => request('/api/indicators'),
  computeIndicators: (symbol, range, interval, indicators) => request(`/api/indicators/${enc(symbol)}`, { method: 'POST', body: { range, interval, indicators } }),
  research: symbol => request(`/api/research/${enc(symbol)}`),
  researchFinancials: symbol => request(`/api/research/${enc(symbol)}/financials`),
  discoveryLists: () => request('/api/research/discovery/lists'),
  discovery: (listId, universe = 'india_large') => request(`/api/research/discovery/${enc(listId)}?universe=${enc(universe)}`),
  saveThesis: (symbol, note) => request('/api/thesis', { method: 'POST', body: { symbol, note } }),
  theses: () => request('/api/thesis'),
  checkThesis: id => request(`/api/thesis/${id}/check`, { method: 'POST' }),
  deleteThesis: id => request(`/api/thesis/${id}`, { method: 'DELETE' }),
}
