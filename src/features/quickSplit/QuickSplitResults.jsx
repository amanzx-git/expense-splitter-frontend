import { formatPaise } from '../../utils/currency.js';

// Results-only display rounding; source amounts remain integer paise.
const wholeRupees = new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0,
});

function Money({ value, className = '' }) {
  return <span className={`money${className ? ' '+className : ''}`}>{wholeRupees.format(value)}</span>;
}

function status(net) {
  if (net > 0) return 'Will receive';
  if (net < 0) return 'Will pay';
  return 'Settled';
}

export default function QuickSplitResults({ result, headingRef }) {
  const { people, transfers } = result;
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? 'Unknown';

  return (
    <section className="card stack split-results" aria-labelledby="qs-results-h">
      <h2 id="qs-results-h" ref={headingRef} tabIndex={-1}>Results</h2>
      <div className="settlement-summary">
        <h3>How to settle up</h3>
        {transfers.length === 0 ? <p>Nobody needs to pay anyone.</p> : (
          <ul className="plain-list transfer-list">{transfers.map((t, i) => <li key={i}>
            {nameOf(t.fromId)} will pay {nameOf(t.toId)} <Money className="payment-direction--outgoing" value={formatPaise(t.paise)} />
          </li>)}</ul>
        )}
        <p className="muted">Pay each other outside Splitter.</p>
      </div>
      <div className="table-wrap">
        <table className="data">
          <caption className="visually-hidden">Totals for each person</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col" className="num">Amount paid</th>
              <th scope="col" className="num">Your share</th>
              <th scope="col" className="num">To settle</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.name}</th>
                <td className="num"><Money value={formatPaise(p.paid)} /></td>
                <td className="num"><Money value={formatPaise(p.owed)} /></td>
                <td className="num">
                  {p.net === 0 ? 'Settled' : (
                    <span className={`money payment-direction--${p.net < 0 ? 'outgoing' : 'incoming'}`}>
                      {status(p.net)} <Money value={formatPaise(Math.abs(p.net))} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </section>
  );
}
