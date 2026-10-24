import SourceFooter from './SourceFooter'

const number = value => value == null ? 'Unavailable' : Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })

export default function PortfolioResearch({ research }) {
  if (!research?.companies?.length) return null
  return <section className="bg-ink-900 border border-ink-700 rounded-xl p-4 sm:p-5 min-w-0" aria-label="Sourced portfolio company research">
    <h3 className="font-semibold text-mist-50">Company research snapshots</h3>
    <p className="text-xs text-mist-400 mt-2">Up to three holdings, selected within currency groups. These snapshots do not cover the whole portfolio. Annual financial statements may lag current conditions.</p>
    <div className="grid lg:grid-cols-3 gap-3 mt-4">{research.companies.map(company => <article key={company.symbol} className="bg-ink-800 border border-ink-700 rounded-lg p-3 min-w-0 break-words">
      <h4 className="text-sm text-brass-400">{company.name || company.symbol}</h4><p className="text-xs text-mist-400">{company.symbol}</p>
      {company.available ? <dl className="mt-3 text-xs space-y-2 text-mist-200">
        <div><dt className="text-mist-400">Sector / industry</dt><dd>{company.sector || 'Unavailable'} · {company.industry || 'Unavailable'}</dd></div>
        <div><dt className="text-mist-400">Trailing P/E</dt><dd className="price">{number(company.trailing_pe)}</dd></div>
        <div><dt className="text-mist-400">Annual revenue · {company.annual_period || 'period unavailable'}</dt><dd className="price">{number(company.annual_revenue)} {company.currency}</dd></div>
        <div><dt className="text-mist-400">Annual net income · {company.annual_period || 'period unavailable'}</dt><dd className="price">{number(company.annual_net_income)} {company.currency}</dd></div>
        <div><dt className="text-mist-400">Annual free cash flow · {company.cashflow_period || 'period unavailable'}</dt><dd className="price">{number(company.annual_free_cashflow)} {company.currency}</dd></div>
      </dl> : <p className="text-xs text-mist-400 mt-3">{company.note}</p>}
      <SourceFooter source={company.source} />
    </article>)}</div>
    <SourceFooter source={research.source} />
  </section>
}
