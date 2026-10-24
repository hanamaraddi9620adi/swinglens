import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:4173'
export default defineConfig({
  testDir: './tests/e2e', timeout: 35000, expect: { timeout: 7000 },
  fullyParallel: true, workers: process.env.CI ? 2 : 4, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]],
  use: { baseURL, headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4173', url: baseURL, reuseExistingServer: !process.env.CI },
  projects: [
    { name: 'small-phone', use: { browserName: 'chromium', viewport: { width: 320, height: 740 }, isMobile: true, hasTouch: true } },
    { name: 'android', use: { browserName: 'chromium', viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.75 } },
    { name: 'iphone-webkit', use: { browserName: 'webkit', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 } },
    { name: 'ipad-webkit', use: { browserName: 'webkit', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true } },
    { name: 'tablet', use: { browserName: 'chromium', viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'laptop', use: { browserName: 'chromium', viewport: { width: 1366, height: 768 } } },
    { name: 'desktop-firefox', use: { browserName: 'firefox', viewport: { width: 1920, height: 1080 } } },
    { name: 'phone-landscape', use: { browserName: 'chromium', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    { name: 'narrow-laptop', use: { browserName: 'chromium', viewport: { width: 1024, height: 768 } } },
    { name: 'reduced-motion', use: { browserName: 'webkit', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' } },
  ],
})
