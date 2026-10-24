import { test, expect } from '@playwright/test'
import { fixtureApp, instruments, source, candles, analysis } from './fixtures'

async function noOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1)
}
async function nav(page, name) { await page.getByRole('navigation', { name: 'Workspace navigation' }).getByRole('button', { name, exact: true }).click() }
async function chart(page) {
  await nav(page, 'Chart'); await page.getByRole('button', { name: 'Open Apple chart', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeEnabled()
  await expect(page.getByTestId('chart-canvas').locator('canvas').first()).toBeVisible()
}

test('login and registration fit the viewport', async ({ page }) => {
  await fixtureApp(page, { authenticated: false })
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible(); await noOverflow(page)
  await page.getByRole('button', { name: 'New here? Create an account' }).click()
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible(); await noOverflow(page)
})
test('every navigation page fits with no runtime errors', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('Warning:')) errors.push(message.text()) })
  await fixtureApp(page)
  for (const name of ['Pulse', 'Explore', 'Chart', 'Research', 'Discover', 'Thesis', 'Portfolio']) { await nav(page, name); await expect(page.locator('main')).toBeVisible(); await page.waitForTimeout(150); await noOverflow(page) }
  expect(errors).toEqual([])
})
test('Chart starts with categories and loads only the selected symbol', async ({ page }) => {
  const requested = []; page.on('request', request => { const path = new URL(request.url()).pathname; if (path.startsWith('/api/stocks/') && path.endsWith('/candles')) requested.push(request.url()) })
  await fixtureApp(page); await nav(page, 'Chart')
  await expect(page.getByRole('heading', { name: 'Find your next chart' })).toBeVisible(); expect(requested).toHaveLength(0)
  await page.getByRole('button', { name: 'US Stocks', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Apple chart' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Open Reliance Industries chart' })).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Filter instruments' }).fill('Microsoft'); await page.getByRole('button', { name: 'Open Microsoft chart' }).click()
  await expect(page.getByRole('heading', { name: 'MSFT', exact: true })).toBeVisible(); await expect.poll(() => requested.length).toBeGreaterThan(0)
  expect(requested.every(url => url.includes('/MSFT/'))).toBeTruthy()
  await page.getByRole('button', { name: '← All instruments' }).click(); await expect(page.getByRole('heading', { name: 'Find your next chart' })).toBeVisible()
})
test('search works with pointer keyboard no results and clearing', async ({ page }) => {
  await fixtureApp(page); const search = page.getByRole('combobox', { name: 'Search stocks' })
  await search.fill('Apple'); await expect(page.getByRole('option', { name: /Apple/ })).toBeVisible(); await search.press('ArrowDown'); await search.press('Enter')
  await expect(page.getByRole('heading', { name: 'AAPL', exact: true })).toBeVisible()
  await search.fill('zzzzzzz'); await expect(page.getByText('No matches. Try a company name or symbol.')).toBeVisible(); await search.press('Escape'); await expect(page.getByRole('listbox')).toHaveCount(0)
  await page.getByRole('button', { name: 'Clear stock search' }).click(); await expect(search).toHaveValue('')
  await search.fill('Microsoft'); await page.getByRole('option', { name: /Microsoft/ }).click(); await expect(page.getByRole('heading', { name: 'MSFT', exact: true })).toBeVisible(); await noOverflow(page)
})
test('late search responses cannot replace a newer query', async ({ page }) => {
  await fixtureApp(page)
  await page.route('**/api/stocks/search?*', async route => { const query = new URL(route.request().url()).searchParams.get('q'); if (query === 'Apple') await new Promise(resolve => setTimeout(resolve, 650)); await route.fulfill({ json: { results: instruments.filter(row => row.name.includes(query)), source } }) })
  const search = page.getByRole('combobox', { name: 'Search stocks' }); await search.fill('Apple'); await page.waitForRequest(request => request.url().includes('q=Apple'))
  await search.fill('Microsoft'); await expect(page.getByRole('option', { name: /Microsoft/ })).toBeVisible(); await page.waitForTimeout(750); await expect(page.getByRole('option', { name: /Apple/ })).toHaveCount(0)
})
test('chart styles zoom ranges and computed patterns render correctly', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message)); await fixtureApp(page); await chart(page)
  await page.getByRole('button', { name: 'Analyze', exact: true }).click(); await expect(page.getByText('BREAKOUT ABOVE RESISTANCE', { exact: true })).toBeVisible(); await expect(page.locator('svg.chart-overlay rect')).toHaveCount(1); await noOverflow(page)
  for (const value of ['line', 'bars', 'heikin', 'area', 'baseline', 'candles']) { await page.getByRole('combobox', { name: 'Chart style' }).selectOption(value); await expect(page.getByTestId('chart-canvas').locator('canvas').first()).toBeVisible() }
  for (const name of ['Zoom in', 'Zoom out', 'Fit all', 'Reset']) await page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('button', { name: '15m', exact: true }).click(); await expect(page.getByRole('button', { name: '1Y', exact: true })).toBeDisabled()
  await expect(page.getByText('BREAKOUT ABOVE RESISTANCE', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeEnabled(); expect(errors).toEqual([])
})
test('nested indicators keep focus and restore scrolling one dialog at a time', async ({ page }) => {
  await fixtureApp(page); await chart(page); await page.getByRole('button', { name: 'Expand chart', exact: true }).click()
  const full = page.getByRole('dialog', { name: 'AAPL expanded chart', exact: true }); await expect(full).toBeVisible(); await page.getByRole('button', { name: 'ƒx Indicators', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Indicators', exact: true }); await expect(dialog).toBeVisible()
  await page.getByRole('textbox', { name: 'Search indicators' }).fill('moving'); await page.getByRole('button', { name: 'Add Simple Moving Average', exact: true }).click()
  await page.getByRole('button', { name: 'Close indicators' }).focus(); await page.keyboard.press('Shift+Tab'); expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBeTruthy()
  await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(full).toBeVisible(); expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
  await page.getByRole('button', { name: 'Exit expanded chart' }).click(); expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  await page.getByRole('button', { name: 'Settings for Simple Moving Average' }).click(); await expect(page.getByRole('dialog', { name: 'Simple Moving Average settings' })).toBeVisible(); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await noOverflow(page)
})
test('commands alerts and research remain inside the screen', async ({ page }) => {
  await fixtureApp(page); await page.getByRole('button', { name: 'Open commands' }).click(); const dialog = page.getByRole('dialog', { name: 'Search & commands' })
  await expect(dialog).toBeVisible(); const search = page.getByRole('textbox', { name: 'Search commands or stocks' }); await search.fill('Apple'); await expect(dialog.getByRole('button', { name: 'Apple · AAPL' })).toBeVisible(); await search.press('Enter'); await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Save Thesis', exact: true })).toBeVisible(); await noOverflow(page)
  await page.getByRole('button', { name: 'Price alerts', exact: true }).click(); const alerts = page.getByRole('region', { name: 'Saved price alerts' }); await expect(alerts).toBeVisible()
  const box = await alerts.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width + 1); await page.getByRole('button', { name: 'Close alerts' }).click()
})
test('a failed chart shows a clickable Retry button and recovers', async ({ page }) => {
  await fixtureApp(page); let fail = true
  await page.route('**/api/stocks/AAPL/candles?*', route => route.fulfill(fail ? { status: 502, json: { detail: 'Temporary candle provider failure' } } : { json: { symbol: 'AAPL', candles, meta: { last_close: 128.5, currency: 'USD', change: 1, change_pct: .8 }, source } }))
  await nav(page, 'Chart'); await page.getByRole('button', { name: 'Open Apple chart' }).click(); await expect(page.getByRole('alert').filter({ hasText: 'Temporary candle provider failure' })).toBeVisible()
  fail = false; await page.getByRole('button', { name: 'Retry chart' }).click(); await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeEnabled(); await noOverflow(page)
})
test('late analysis is discarded after changing the timeframe', async ({ page }) => {
  await fixtureApp(page); await chart(page)
  await page.route('**/api/analysis/AAPL?*', async route => { await new Promise(resolve => setTimeout(resolve, 600)); await route.fulfill({ json: analysis('AAPL') }) })
  await page.getByRole('button', { name: 'Analyze', exact: true }).click(); await page.getByRole('button', { name: '3M', exact: true }).click(); await page.waitForTimeout(900)
  await expect(page.getByRole('region', { name: 'Computed chart setup' })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeEnabled()
})
test('document scrolling and local table scrolling remain available', async ({ page, browserName, isMobile }) => {
  await fixtureApp(page); await chart(page); await page.getByTestId('chart-canvas').scrollIntoViewIfNeeded()
  const plot = await page.getByTestId('chart-canvas').boundingBox(), previous = await page.evaluate(() => scrollY)
  if (browserName === 'webkit' && isMobile) {
    // Playwright explicitly does not implement mouse.wheel on mobile WebKit.
    // Check the touch-scroll contract plus document scrollability here.
    expect(await page.getByTestId('chart-canvas').evaluate(element => getComputedStyle(element).touchAction)).toContain('pan-y')
    expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).not.toBe('hidden')
    await page.evaluate(() => scrollBy(0, 260))
  } else { await page.mouse.move(plot.x + plot.width / 2, Math.min(page.viewportSize().height - 30, plot.y + 100)); await page.mouse.wheel(0, 260) }
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(previous)
  await nav(page, 'Discover'); const table = page.locator('table').first(); await expect(table).toBeVisible(); const container = table.locator('..')
  if (await container.evaluate(element => element.scrollWidth > element.clientWidth)) { await container.evaluate(element => { element.scrollLeft = 150 }); expect(await container.evaluate(element => element.scrollLeft)).toBeGreaterThan(0) }
  await noOverflow(page)
})
test('chat expands closes and sends without jumping the page', async ({ page }) => {
  await fixtureApp(page); await chart(page); expect(await page.evaluate(() => scrollY)).toBeLessThan(20)
  await page.getByRole('button', { name: 'Fullscreen chat', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Expanded AI chat' }); await expect(dialog).toBeVisible()
  await page.getByRole('textbox', { name: 'Chat message' }).fill('Explain diversification'); await page.getByRole('button', { name: 'Send', exact: true }).click(); await expect(dialog.getByText('Diversification spreads exposure across assets.')).toBeVisible()
  await page.getByRole('button', { name: 'Exit fullscreen chat' }).click(); expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden'); await noOverflow(page)
})
test('resize preserves a usable canvas and saves a price alert', async ({ page }) => {
  await fixtureApp(page); await chart(page); const old = page.viewportSize(); await page.setViewportSize({ width: Math.max(320, old.width - 50), height: Math.max(360, old.height - 160) })
  await expect(page.getByTestId('chart-canvas').locator('canvas').first()).toBeVisible(); await noOverflow(page)
  await page.getByRole('button', { name: 'Alert', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Price alert · AAPL' }); await expect(dialog).toBeVisible()
  await dialog.getByRole('spinbutton').fill('130'); await dialog.getByRole('button', { name: 'Save alert' }).click(); await expect(page.getByText('Price alert saved.')).toBeVisible(); await dialog.getByRole('button', { name: 'Close price alert' }).click()
})
