// Single place every backend call goes through.
// Uses relative /api paths — the Vite dev proxy forwards them to FastAPI.

const TOKEN_KEY = 'swinglens_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })

  let data = null
  try { data = await res.json() } catch { /* non-JSON error body */ }

  if (!res.ok) {
    const detail = data?.detail
    const message =
      typeof detail === 'string' ? detail
      : detail?.message ? `${detail.message}${detail.hint ? ` ${detail.hint}` : ''}`
      : `Request failed (${res.status})`
    const err = new Error(message)
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  register: (username, email, password) =>
    request('/api/auth/register', { method: 'POST', body: { username, email, password } }),
  login: (email, password) =>
    request('/api/auth/login', { method: 'POST', body: { email, password } }),
  me: () => request('/api/auth/me'),

  searchStocks: (q) => request(`/api/stocks/search?q=${encodeURIComponent(q)}`),
  candles: (symbol, range, interval) =>
    request(`/api/stocks/${encodeURIComponent(symbol)}/candles?range=${range}&interval=${interval}`),

  aiChat: (message) => request('/api/ai/chat', { method: 'POST', body: { message } }),
  aiStatus: () => request('/api/ai/status'),

  analyze: (symbol, range, interval) =>
    request(`/api/analysis/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { method: 'POST' }),
  myPlans: () => request('/api/analysis/plans'),

  indicatorCatalog: () => request('/api/indicators'),
  computeIndicators: (symbol, range, interval, indicators) =>
    request(`/api/indicators/${encodeURIComponent(symbol)}`, {
      method: 'POST',
      body: { range, interval, indicators },
    }),
}
