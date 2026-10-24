import { test, expect } from '@playwright/test'
import { fixtureApp } from './fixtures'
test('capture instrument browser and chart for visual inspection', async ({ page }, testInfo) => {
  await fixtureApp(page)
  await page.getByRole('navigation').getByRole('button', { name: 'Chart', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Open Apple chart' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('instruments.png'), fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Open Apple chart' }).click()
  await expect(page.getByRole('button', { name: 'Analyze', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Analyze', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Computed chart setup' })).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('chart.png'), fullPage: true, animations: 'disabled' })
})
