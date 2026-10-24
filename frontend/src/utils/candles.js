// A final boundary before chart rendering. Never manufacture missing prices.
export function validCandles(rows) {
  const unique = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const time = Number(row.time)
    const values = ['open', 'high', 'low', 'close'].map(key => Number(row[key]))
    if (!Number.isFinite(time) || !values.every(value => Number.isFinite(value) && value > 0)) continue
    const [open, high, low, close] = values
    if (high < Math.max(open, close, low) || low > Math.min(open, close)) continue
    unique.set(time, { time, open, high, low, close, volume: Number.isFinite(Number(row.volume)) ? Math.max(0, Number(row.volume)) : 0 })
  }
  return [...unique.values()].sort((a, b) => a.time - b.time)
}

export function pricePrecision(price) {
  return price < 1 ? 6 : price < 100 ? 4 : 2
}
