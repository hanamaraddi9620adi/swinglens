import PortfolioResearch from '../components/PortfolioResearch';
import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import SourceFooter from '../components/SourceFooter';
const money = (value, currency) => value == null ? '—' : currency === 'UNKNOWN' ? `${Number(value).toLocaleString(undefined, {
  maximumFractionDigits: 2
})} file units` : new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency,
  maximumFractionDigits: 2
}).format(value);
const card = 'bg-ink-900 border border-ink-700 rounded-xl p-4 sm:p-5 min-w-0';
const secondary = 'border border-ink-600 rounded-lg px-3 py-2 text-xs text-mist-200 hover:border-brass-400 disabled:opacity-50';
const labels = {
  overview: 'Portfolio overview',
  concentration: 'Concentration & exposure',
  trading_behavior: 'Trading behavior',
  next_steps: 'Research checklist'
};
function Stat({
  label,
  children,
  sub
}) {
  return <div className="bg-ink-800/60 border border-ink-700 rounded-lg p-3 min-w-0"><div className="text-[10px] text-mist-400 uppercase tracking-wide">{label}</div><div className="price text-lg text-mist-50 mt-1 break-words">{children}</div>{sub && <p className="text-xs text-mist-400 mt-1">{sub}</p>}</div>;
}
function Holdings({
  group,
  onOpenSymbol
}) {
  return <section className={card} aria-label={`${group.currency} holdings`}>
    <h3 className="font-semibold text-mist-50">Holdings · {group.currency === 'UNKNOWN' ? 'Currency unresolved' : group.currency}</h3>
    <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
      <Stat label="Invested">{money(group.invested, group.currency)}</Stat><Stat label="Current value">{money(group.current, group.currency)}</Stat>
      <Stat label="Unrealized P&L" sub={`${group.pnl_pct}% · before fees and taxes`}><span className={group.pnl >= 0 ? 'text-bull-500' : 'text-bear-500'}>{money(group.pnl, group.currency)}</span></Stat>
      <Stat label="Positions" sub={`Top exposures: ${group.top3_concentration_pct}% · largest: ${group.largest_weight_pct ?? '—'}%`}>{group.instrument_count ?? group.position_count}</Stat>
    </div>
    <p className="text-xs text-mist-400 mt-4">Scroll the table sideways for prices and weights. Latest closes may be delayed; each row shows its price basis.</p>
    <div className="overflow-x-auto mt-2 rounded-lg border border-ink-700" tabIndex={0} role="region" aria-label="Holdings table, horizontally scrollable"><table className="w-full min-w-[640px] text-xs text-mist-200">
      <thead className="text-mist-400 bg-ink-800"><tr>{['Holding', 'Quantity', 'Average', 'Price / basis', 'P&L', 'Weight'].map(label => <th key={label} className="text-left p-3 font-medium">{label}</th>)}</tr></thead>
      <tbody>{group.positions.map((position, index) => <tr key={`${position.symbol_raw}-${index}`} className="border-t border-ink-700">
        <td className="p-3 max-w-60 break-words">{position.symbol ? <button className="text-brass-400 text-left hover:underline" onClick={() => onOpenSymbol?.(position.symbol)}>{position.name}</button> : position.name}<span className="block text-mist-400 mt-1">{position.symbol || `${position.symbol_raw} · unresolved`}</span></td>
        <td className="p-3 price">{position.quantity}</td><td className="p-3 price">{money(position.avg_price, group.currency)}</td><td className="p-3 price">{money(position.ltp, group.currency)}<span className="block text-mist-400 text-[10px] mt-1">{position.ltp_source === 'live' ? 'Latest daily close' : 'Imported price / cost'}</span></td>
        <td className={`p-3 price ${position.pnl >= 0 ? 'text-bull-500' : 'text-bear-500'}`}>{money(position.pnl, group.currency)}<span className="block">{position.pnl_pct}%</span></td><td className="p-3 price">{position.weight_pct}%</td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
function Trading({
  group
}) {
  const profile = group.profile;
  return <section className={card} aria-label={`${group.currency} trade analysis`}>
    <h3 className="font-semibold text-mist-50">Tradebook analysis · {group.currency}</h3>
    <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
      <Stat label="Trades imported" sub={`${group.buy_count} buys · ${group.sell_count} sells`}>{group.trade_count}</Stat><Stat label="FIFO matched P&L" sub="Matched imported lots only">{money(group.realized_pnl, group.currency)}</Stat><Stat label="Closed lot matches">{group.round_trips}</Stat><Stat label="Unmatched sell rows" sub="Excluded unmatched quantities">{group.unmatched_sell_rows}</Stat>
    </div>
    <h4 className="text-sm text-mist-50 mt-4">The Trader Mirror</h4>
    {!profile?.ready ? <p className="text-sm text-mist-400 mt-2">{profile?.message}</p> : <><div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3"><Stat label="Win rate">{profile.win_rate}%</Stat><Stat label="Profit factor">{profile.profit_factor ?? 'No gross losses'}</Stat><Stat label="Median hold">{profile.median_hold_days == null ? 'Unknown' : `${profile.median_hold_days} days`}</Stat></div><div className="grid sm:grid-cols-2 gap-3 mt-3">{profile.traits.map(trait => <div key={trait.trait} className="bg-ink-800 p-3 rounded-lg"><h5 className="text-xs text-brass-400">{trait.trait} · {trait.verdict}</h5><p className="text-xs text-mist-400 mt-1">{trait.evidence}</p></div>)}</div></>}
    {group.recent_trips?.length > 0 && <details className="mt-4 text-xs text-mist-200"><summary className="cursor-pointer py-2">Recent matched trades</summary><ul className="space-y-2 mt-2">{group.recent_trips.map((trip, index) => <li key={index} className="flex flex-wrap justify-between gap-2 border-b border-ink-700 pb-2"><span>{trip.name} · {trip.qty} shares</span><span className="price">{money(trip.pnl, group.currency)}</span></li>)}</ul></details>}
  </section>;
}
export default function Portfolio({
  onOpenSymbol,
  onPortfolio
}) {
  const [broker, setBroker] = useState('indmoney'),
    [report, setReport] = useState(null),
    [imported, setImported] = useState(null);
  const [explanation, setExplanation] = useState(null),
    [busy, setBusy] = useState('load'),
    [error, setError] = useState(''),
    [aiError, setAiError] = useState('');
  const fileRef = useRef(null),
    sequence = useRef(0),
    mounted = useRef(true);
  const valid = ticket => mounted.current && sequence.current === ticket;
  const publish = computed => {
    setReport(computed);
    const group = computed?.holdings?.length === 1 ? computed.holdings[0] : null;
    onPortfolio?.(group && group.currency !== 'UNKNOWN' ? {
      pnl_pct: group.pnl_pct,
      current: group.current,
      currency: group.currency,
      top: group.positions.slice(0, 5).map(row => ({
        name: row.name,
        pnl_pct: row.pnl_pct,
        weight_pct: row.weight_pct
      }))
    } : null);
  };
  const load = async (refresh = false) => {
    const ticket = ++sequence.current;
    setBusy(refresh ? 'quotes' : 'load');
    setError('');
    setExplanation(null);
    setAiError('');
    try {
      const result = await api.portfolioReport(refresh);
      if (valid(ticket)) publish(result);
    } catch (err) {
      if (valid(ticket)) setError(err.message);
    } finally {
      if (valid(ticket)) setBusy('');
    }
  };
  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
      sequence.current++;
    };
  }, []);
  const review = async ticket => {
    setBusy('ai');
    setAiError('');
    try {
      const result = await api.portfolioReview();
      if (valid(ticket)) {
        publish(result.report);
        setExplanation(result.explanation);
      }
    } catch (err) {
      if (valid(ticket)) setAiError(`AI review could not finish: ${err.message} Your computed results remain available.`);
    } finally {
      if (valid(ticket)) setBusy('');
    }
  };
  const upload = async file => {
    if (!file) return;
    setError('');
    setAiError('');
    if (!/\.(csv|xlsx)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) {
      setError('Choose a nonempty .csv or .xlsx file up to 5 MB. Convert legacy .xls files to .xlsx first.');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    const ticket = ++sequence.current;
    setBusy('import');
    setImported(null);
    setExplanation(null);
    try {
      const result = await api.importPortfolio(file, broker);
      if (!valid(ticket)) return;
      setImported(result);
      publish(result.report);
      await review(ticket);
    } catch (err) {
      if (valid(ticket)) {
        setError(err.message);
        setBusy('');
      }
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const clear = async () => {
    const ticket = ++sequence.current;
    setBusy('clear');
    setError('');
    try {
      await api.clearPortfolio();
      if (valid(ticket)) {
        publish(null);
        setImported(null);
        setExplanation(null);
        setAiError('');
      }
    } catch (err) {
      if (valid(ticket)) setError(err.message);
    } finally {
      if (valid(ticket)) setBusy('');
    }
  };
  const hasData = report && !report.empty;
  return <div className="rise-in space-y-5 min-w-0">
    <section className={card}>
      <h2 className="text-mist-50 font-semibold">Import & analyze your portfolio</h2>
      <p className="text-xs text-mist-400 mt-2 leading-relaxed">Upload a broker holdings statement or tradebook as CSV or XLSX, up to 5 MB and 10,000 rows. Include Symbol / Stock Name, Quantity, and Average Price / Trade Price. Tradebooks also need Buy/Sell and preferably Trade Date.</p>
      <p className="text-xs text-mist-400 mt-2 leading-relaxed">Files are parsed on the server and saved to your account. After import, Gemini/Groq explains computed holding and trade summaries; raw files, account IDs, and contact details are not sent to AI. Imported prices give immediate results while quotes and AI load.</p>
      <div className="flex flex-wrap gap-3 items-center mt-4">
        <label className="text-xs text-mist-400">Broker<select aria-label="Portfolio broker" value={broker} disabled={!!busy} onChange={event => setBroker(event.target.value)} className="block mt-1 bg-ink-800 border border-ink-600 rounded-lg px-3 py-2 text-sm text-mist-50"><option value="indmoney">INDmoney</option><option value="groww">Groww</option><option value="zerodha">Zerodha</option><option value="other">Other broker</option></select></label>
        <input ref={fileRef} aria-label="Portfolio file" type="file" accept=".csv,.xlsx" className="sr-only" disabled={!!busy} onChange={event => upload(event.target.files?.[0])} />
        <button disabled={!!busy} onClick={() => fileRef.current?.click()} className="bg-brass-400 text-ink-950 rounded-lg px-4 py-3 text-sm font-semibold disabled:opacity-50">Choose CSV / XLSX file</button>
        <a className="text-xs text-brass-400 underline py-2" download="swinglens-holdings-template.csv" href={'data:text/csv;charset=utf-8,' + encodeURIComponent('Symbol,Quantity,Average Price,Current Price\nRELIANCE.NS,10,1200,1250\n')}>Download CSV template</a>
      </div>
      {busy && <p role="status" className="text-sm text-brass-300 mt-3">{{
          load: 'Loading saved portfolio…',
          import: 'Validating and importing your file…',
          ai: 'Refreshing available quotes and preparing your cloud AI review… Your calculated results are below.',
          quotes: 'Refreshing latest available daily closes…',
          clear: 'Clearing imported data…'
        }[busy]}</p>}
      {error && <div role="alert" className="mt-3 text-sm text-bear-500 break-words">{error} {!report && <button className={`${secondary} ml-2`} disabled={!!busy} onClick={() => load()}>Retry loading portfolio</button>}</div>}
      {imported && <div role="status" className="mt-3 text-xs text-mist-200 bg-ink-800 p-3 rounded-lg">Imported <strong>{imported.imported}</strong> rows as <strong>{imported.kind}</strong> · {imported.sheet || 'CSV'} · {imported.skipped || 0} rows skipped · {imported.unresolved_symbols || 0} unresolved symbols.<p className="mt-1 text-mist-400">{imported.note}</p></div>}
    </section>
    {!hasData && !busy && !error && <p className="text-sm text-mist-400 p-4">No portfolio imported yet. Upload a holdings statement for exposure analysis or a tradebook for FIFO trade results.</p>}
    {hasData && <>
      <div className="flex flex-wrap gap-2"><button className={secondary} disabled={!!busy} onClick={() => load(true)}>Refresh quotes</button><button className={secondary} disabled={!!busy} onClick={() => review(++sequence.current)}>Generate AI review</button><button className={secondary} disabled={!!busy} onClick={clear}>Clear all imported data</button></div>
      {report.warnings?.length > 0 && <aside className={`${card} text-xs text-mist-200`} aria-label="Portfolio data limitations"><h3 className="text-brass-400 font-semibold mb-2">Data quality & limitations</h3><ul className="list-disc pl-4 space-y-2">{report.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></aside>}
      {report.holdings?.map((group, index) => <Holdings key={`${group.currency}-${index}`} group={group} onOpenSymbol={onOpenSymbol} />)}
      {report.trading?.map((group, index) => <Trading key={`${group.currency}-${index}`} group={group} />)}
      {aiError && <p role="alert" className="text-sm text-brass-300 break-words">{aiError}</p>}
      {explanation && <section className={card} aria-label="Portfolio AI review"><h3 className="font-semibold text-mist-50">{explanation.status === 'template_fallback' ? 'Computed review · cloud AI unavailable' : `AI portfolio review · ${explanation.provider}`}</h3><p className="text-xs text-mist-400 mt-2">Explains computed portfolio facts and available sourced company snapshots. This is educational review, not a recommendation. Open a holding for its chart and full company Research.</p><div className="grid md:grid-cols-2 gap-4 mt-4">{Object.entries(explanation.sections).map(([key, value]) => <div key={key}><h4 className="text-xs text-brass-400">{labels[key] || key}</h4><p className="text-sm text-mist-200 mt-1 whitespace-pre-line break-words">{value}</p></div>)}</div><SourceFooter source={explanation.source} /></section>}
      <><PortfolioResearch research={report.research} /><SourceFooter source={report.source} /></>
    </>}
  </div>;
}
