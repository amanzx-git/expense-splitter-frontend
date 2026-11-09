import Money from '../../components/Money.jsx';
import { formatPaise } from '../../utils/currency.js';

function status(net) {
  if (net > 0) return 'Gets money back';
  if (net < 0) return 'Needs to pay';
  return 'Settled up';
}

export default function QuickSplitResults({ result, headingRef }) {
  const { people, transfers } = result;
  const nameOf = (id) => people.find((p) => p.id === id)?.name ?? 'Unknown';

  return (
    <section className="card stack" aria-labelledby="qs-results-h">
      <h2 id="qs-results-h" ref={headingRef} tabIndex={-1}>Results</h2>

      <div className="table-wrap">
        <table className="data">
          <caption className="visually-hidden">Totals for each person</caption>
          <thead>
            <tr>
              <th scope="col">Person</th>
              <th scope="col" className="num">Paid</th>
              <th scope="col" className="num">Owes</th>
              <th scope="col" className="num">Net</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <th scope="row">{p.name}</th>
                <td className="num"><Money value={formatPaise(p.paid)} /></td>
                <td className="num"><Money value={formatPaise(p.owed)} /></td>
                <td className="num"><Money value={formatPaise(p.net)} /></td>
                <td>{status(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h3>How to settle up</h3>
        {transfers.length === 0 ? (
          <p>Everyone is settled up. Nobody needs to pay anyone.</p>
        ) : (
          <ul>
            {transfers.map((t, i) => (
              <li key={i}>
                {nameOf(t.fromId)} pays {nameOf(t.toId)} <Money value={formatPaise(t.paise)} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}