# Mobile_APP_update

## User-visible changes

- The Chart tab starts at an instrument browser rather than automatically
  opening Reliance. Curated categories include Indian large/mid/small-cap stocks,
  US stocks, ETFs, commodities and crypto. A fast catalog endpoint lists names
  without waiting for quote downloads. Select a stock to open its chart.
- The responsive header gives mobile search its own row and confines navigation
  scrolling to the tab bar. Menus, alerts and dialogs stay inside the viewport.
- Stock search handles out-of-order replies, loading/errors, empty results,
  keyboard selection, touch/click selection, clearing and Escape dismissal.
- Chart terminal styling follows the supplied reference: clean price header,
  compact timeframe controls, OHLC values, candles and a separate volume pane.
  The reusable typed panel is `frontend/src/components/ui/candle-chart.tsx`.
  The reference's generated data is not used in the application.
- Added zoom, Fit all, Reset, Refresh and expanded-chart controls. Normal wheel
  scrolling moves the page; horizontal drag pans, pinch/buttons zoom, and the
  price axis scales vertically. Heikin Ashi is explicitly identified as averaged
  prices, and raw-price setup annotations are hidden in that view.
- Computed support/resistance/trendlines follow chart pan, zoom and resize and
  are clipped to the price pane. Symbol/range changes clear previous analysis.
  Late chart/analysis responses cannot attach to the wrong selection.
- Dialogs trap focus, close with Escape, restore focus, and preserve nested
  scroll locks. Indicator settings no longer render in off-screen popovers.
  Indicator choices avoid nested buttons and provide visible errors/retry.
- Chat scrolls only its message pane instead of jumping the page when a mobile
  chart opens. Expanded chat uses the dynamic viewport and safe-area padding.
- Watchlist removal controls are visible to touch users. Small-screen setup
  cards wrap; position sizing validates input and caps outlay at available cash.
- Login supports password-manager autofill, mobile email keyboards and safe
  viewport sizing. Public service errors display a user-facing retry message.

## Chart data corrections

Daily/weekly bars now use the exchange's calendar date, encoded as UTC midnight
for chart display. This fixes Indian daily candles appearing on the previous
date. Intraday bars retain their actual UTC instant. The chart and analysis share
the same provider-adjusted OHLC data and short cache. Source information states
the adjustment and time basis; this remains delayed market data, not a tick feed.

Invalid/non-finite/non-positive OHLC values, inconsistent high/low bounds and
duplicate timestamps are removed before rendering. Bars are sorted, volume is
sanitized, empty/invalid responses become recoverable errors, and small prices
retain more precision. The error overlay stays above chart canvases so Retry
is actually clickable.

## Verification

- 67 backend regression cases, including exchange-date conversion, intraday UTC,
  invalid/duplicate candles, immutable cache results and authenticated catalog access.
- Three frontend data-boundary tests; typed UI component checked with TypeScript.
- Thirteen interaction scenarios plus screenshot capture across ten configured
  profiles: 320px phone, Android, iPhone WebKit, iPad WebKit, tablet, laptop,
  Firefox desktop, landscape phone, narrow laptop and reduced-motion phone.
- Local Chromium/WebKit run: 126 checks passed across nine profiles. Firefox is
  configured in Linux CI because its downloaded Windows runtime cannot start
  on this machine. CI runs the full 140-check matrix.
- Scenarios cover all navigation pages, page overflow, catalog/filter selection,
  search races and keyboard handling, chart styles/ranges/pattern overlays,
  nested dialogs, command palette, alert bounds, error retry, stale analysis,
  scrolling, chat expansion, viewport resize and price-alert creation.
- Mobile WebKit does not implement Playwright's mouse-wheel API. Those checks
  verify the pan-y touch contract and document scrolling; they are not a substitute
  for physical-device gesture testing. Other profiles exercise wheel scrolling.
- Production frontend build and dependency audit are required before publication.
  CI uploads browser reports and screenshots for review.

## Run checks

```powershell
backend/venv/Scripts/python -m pytest -q
npm run typecheck --prefix frontend
npm test --prefix frontend
npm run build --prefix frontend
npm audit --prefix frontend --audit-level=high
cd frontend
npx playwright install chromium firefox webkit
npm run test:e2e
```

UI tests use clearly identified deterministic test fixtures; the live app uses
provider data. Live Apple, Reliance and Bitcoin candles were also checked for
valid bounds, unique sorted timestamps and current trading-session dates.
Automated emulation cannot establish that every physical phone/browser is bug-free.

## Continuation prompt

Continue SwingLens in the existing repository, preserve the category-first Chart
flow and real sourced market data, and investigate user reports with a reproducible
viewport and interaction. Keep search/analysis requests guarded against stale
responses, preserve nested dialog focus and scroll locks, and keep the page free
of horizontal overflow while dense tables scroll locally. Do not replace provider
candles with the reference component's generated demo data. Finish with backend,
frontend and browser regression checks and whole-file rewrites.
