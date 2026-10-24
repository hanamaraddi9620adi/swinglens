import test from 'node:test'
import assert from 'node:assert/strict'
import { validCandles, pricePrecision } from '../../src/utils/candles.js'
test('invalid and duplicate provider bars cannot break the chart', () => {
  const bar = { time: 2, open: 10, high: 12, low: 9, close: 11, volume: 100 }
  assert.deepEqual(validCandles([bar, { ...bar, close: 10 }, { ...bar, time: 1 }, { ...bar, time: 3, high: 8 }, { ...bar, time: 4, close: NaN }]).map(row => [row.time, row.close]), [[1, 11], [2, 10]])
})
test('missing candles and negative volume are handled without fabricated prices', () => {
  assert.deepEqual(validCandles(null), [])
  assert.equal(validCandles([{ time: 1, open: 1, high: 2, low: .5, close: 1.5, volume: -5 }])[0].volume, 0)
})
test('small prices retain readable precision', () => {
  assert.equal(pricePrecision(.01), 6); assert.equal(pricePrecision(5.5), 4); assert.equal(pricePrecision(120), 2)
})
