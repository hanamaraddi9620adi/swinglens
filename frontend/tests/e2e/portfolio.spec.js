import { test, expect } from '@playwright/test';
import { fixtureApp, source } from './fixtures';
const group = {
  currency: 'INR',
  invested: 1000,
  current: 1200,
  pnl: 200,
  pnl_pct: 20,
  position_count: 1,
  instrument_count: 1,
  top3_concentration_pct: 100,
  largest_weight_pct: 100,
  live_quotes_missing: 1,
  positions: [{
    symbol: 'RELIANCE.NS',
    symbol_raw: 'RELIANCE',
    name: 'Reliance Industries',
    quantity: 10,
    avg_price: 100,
    ltp: 120,
    ltp_source: 'file/avg',
    pnl: 200,
    pnl_pct: 20,
    current: 1200,
    invested: 1000,
    weight_pct: 100
  }]
};
const computed = {
  empty: false,
  holdings: [group],
  trading: [],
  warnings: ['Imported prices may be stale.'],
  source
};
const empty = {
  empty: true,
  holdings: [],
  trading: [],
  warnings: [],
  source
};
const explanation = {
  status: 'verified',
  provider: 'groq',
  sections: {
    overview: 'Your imported portfolio has positive unrealized results.',
    concentration: 'Exposure is concentrated in the imported holding.',
    trading_behavior: 'Import a complete tradebook to evaluate closed trades.',
    next_steps: 'Verify company fundamentals and price freshness.'
  },
  source
};
const companyResearch = {
  companies: [{
    symbol: 'RELIANCE.NS',
    name: 'Reliance Industries',
    available: true,
    sector: 'Energy',
    industry: 'Integrated Oil & Gas',
    annual_period: '2026-03-31',
    annual_revenue: 100000,
    annual_net_income: 12000,
    annual_free_cashflow: 8000,
    cashflow_period: '2026-03-31',
    trailing_pe: 20,
    currency: 'INR',
    source
  }],
  source
};
const csv = {
  name: 'holdings.csv',
  mimeType: 'text/csv',
  buffer: Buffer.from('Symbol,Quantity,Average Price,Current Price\nRELIANCE.NS,10,100,120\n')
};
async function navigate(page) {
  await page.getByRole('navigation', {
    name: 'Workspace navigation'
  }).getByRole('button', {
    name: 'Portfolio',
    exact: true
  }).click();
}
async function noOverflow(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
}
async function setup(page, initial = empty) {
  await fixtureApp(page);
  await page.route('**/api/portfolio/report?**', route => route.fulfill({
    json: initial
  }));
  await page.route('**/api/portfolio/import', async route => {
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    await route.fulfill({
      json: {
        kind: 'holdings',
        imported: 1,
        skipped: 0,
        broker: 'indmoney',
        sheet: 'Holdings',
        report: computed,
        note: 'Previous holdings for this broker replaced.'
      }
    });
  });
  await page.route('**/api/portfolio/review', route => route.fulfill({
    json: {
      report: {
        ...computed,
        research: companyResearch
      },
      explanation,
      source
    }
  }));
  await navigate(page);
  await expect(page.getByRole('button', {
    name: 'Choose CSV / XLSX file'
  })).toBeEnabled();
}
for (const format of ['csv', 'xlsx']) test(`${format} upload automatically displays math and sourced cloud review`, async ({
  page
}, testInfo) => {
  await setup(page);
  await page.getByLabel('Portfolio file', {
    exact: true
  }).setInputFiles(format === 'csv' ? csv : 'tests/e2e/data/holdings.xlsx');
  await expect(page.getByRole('heading', {
    name: 'Holdings · INR'
  })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'AI portfolio review · groq'
  })).toBeVisible();
  await expect(page.getByRole('heading', {
    name: 'Company research snapshots'
  })).toBeVisible();
  await expect(page.getByText('Annual revenue · 2026-03-31')).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Generate AI review'
  })).toBeEnabled();
  await noOverflow(page);
  if (format === 'csv' && ['small-phone', 'laptop'].includes(testInfo.project.name)) await page.screenshot({
    path: testInfo.outputPath('portfolio.png'),
    fullPage: true
  });
});
test('computed result remains available while AI is slow', async ({
  page
}) => {
  await setup(page);
  let release;
  const waiting = new Promise(resolve => {
    release = resolve;
  });
  await page.route('**/api/portfolio/review', async route => {
    await waiting;
    await route.fulfill({
      json: {
        report: computed,
        explanation
      }
    });
  });
  await page.getByLabel('Portfolio file', {
    exact: true
  }).setInputFiles(csv);
  await expect(page.getByRole('heading', {
    name: 'Holdings · INR'
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Generate AI review'
  })).toBeDisabled();
  await expect(page.getByText(/Your calculated results are below/)).toBeVisible();
  release();
  await expect(page.getByRole('heading', {
    name: 'AI portfolio review · groq'
  })).toBeVisible();
});
test('load failures are visible and retry recovers', async ({
  page
}) => {
  await fixtureApp(page);
  let failed = true;
  await page.route('**/api/portfolio/report?**', route => route.fulfill(failed ? {
    status: 503,
    json: {
      detail: 'Temporary portfolio service failure'
    }
  } : {
    json: computed
  }));
  await navigate(page);
  await expect(page.getByRole('alert')).toContainText('Temporary portfolio service failure');
  failed = false;
  await page.getByRole('button', {
    name: 'Retry loading portfolio'
  }).click();
  await expect(page.getByRole('heading', {
    name: 'Holdings · INR'
  })).toBeVisible();
});
test('invalid upload explains the problem and preserves existing results', async ({
  page
}) => {
  await setup(page, computed);
  await page.route('**/api/portfolio/import', route => route.fulfill({
    status: 422,
    json: {
      detail: 'Missing required Average Price column.'
    }
  }));
  await page.getByLabel('Portfolio file', {
    exact: true
  }).setInputFiles(csv);
  await expect(page.getByRole('alert')).toContainText('Missing required Average Price column');
  await expect(page.getByRole('heading', {
    name: 'Holdings · INR'
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Choose CSV / XLSX file'
  })).toBeEnabled();
});
test('AI outage retains math and offers retry', async ({
  page
}) => {
  await setup(page);
  await page.route('**/api/portfolio/review', route => route.fulfill({
    status: 503,
    json: {
      detail: 'Cloud provider unavailable'
    }
  }));
  await page.getByLabel('Portfolio file', {
    exact: true
  }).setInputFiles(csv);
  await expect(page.getByRole('alert')).toContainText('Your computed results remain available');
  await expect(page.getByRole('heading', {
    name: 'Holdings · INR'
  })).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Generate AI review'
  })).toBeEnabled();
});
test('small tradebook shows FIFO results before personality threshold', async ({
  page
}) => {
  const report = {
    ...empty,
    empty: false,
    trading: [{
      currency: 'INR',
      trade_count: 2,
      buy_count: 1,
      sell_count: 1,
      realized_pnl: 200,
      round_trips: 1,
      unmatched_sell_rows: 0,
      recent_trips: [],
      profile: {
        ready: false,
        message: 'Only 1 closed round-trip; at least 5 completed cycles are needed.'
      }
    }]
  };
  await setup(page, report);
  await expect(page.getByRole('heading', {
    name: 'Tradebook analysis · INR'
  })).toBeVisible();
  await expect(page.getByText('FIFO matched P&L', {
    exact: true
  })).toBeVisible();
  await expect(page.getByText(/Only 1 closed round-trip/)).toBeVisible();
  await noOverflow(page);
});
test('mixed currencies are separated and clear failure preserves data', async ({
  page
}) => {
  await setup(page, {
    ...computed,
    holdings: [group, {
      ...group,
      currency: 'USD'
    }]
  });
  await expect(page.getByRole('heading', {
    name: 'Holdings · USD'
  })).toBeVisible();
  await page.route('**/api/portfolio', route => route.fulfill({
    status: 503,
    json: {
      detail: 'Clear failed; please retry'
    }
  }));
  await page.getByRole('button', {
    name: 'Clear all imported data'
  }).click();
  await expect(page.getByRole('alert')).toContainText('Clear failed');
  await expect(page.getByRole('heading', {
    name: 'Holdings · INR'
  })).toBeVisible();
  await noOverflow(page);
});
test('unsupported extension is rejected without sending the file', async ({
  page
}) => {
  await setup(page);
  let requests = 0;
  page.on('request', request => {
    if (request.url().endsWith('/api/portfolio/import')) requests++;
  });
  await page.getByLabel('Portfolio file', {
    exact: true
  }).setInputFiles({
    name: 'legacy.xls',
    mimeType: 'application/vnd.ms-excel',
    buffer: Buffer.from('legacy')
  });
  await expect(page.getByRole('alert')).toContainText('Convert legacy .xls files to .xlsx');
  expect(requests).toBe(0);
});
