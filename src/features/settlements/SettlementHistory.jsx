import { countLabel } from '../../utils/wording.js';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { listSettlements } from '../../api/settlements.js';
import { useGroupResource, ResourceState, Pagination } from '../groups/resources.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import Money from '../../components/Money.jsx';
import { settlementStatusLabel } from './paymentPresentation.jsx';

export default function SettlementHistory({ groupId, revision = 0 }) {
  const [page, setPage] = useState(1);
  const list = useGroupResource((signal) => listSettlements(groupId, page, signal), [groupId, page, revision]);
  return <section className="card stack" aria-label="Settlement history">
    <h2>Settlements</h2>
    <ResourceState resource={list}>
      {list.data?.results.length === 0 && <EmptyState title="No settlements yet" />}
      <ul className="plain-list">{list.data?.results.map((item) => <li className="list-item" key={item.id}><div>
        <Link to={`/groups/${groupId}/settlements/${item.id}`}>Settlement #{item.sequence_number}</Link>
        <p>{settlementStatusLabel(item.status)} · <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></p>
        <p>{countLabel(item.expense_count, 'expense')}; {item.confirmed_transaction_count} of {countLabel(item.transaction_count, 'payment')} confirmed</p>
        <p>Total payments: <Money value={item.total_transfer_amount} /></p>
      </div></li>)}</ul>
      <Pagination data={list.data} page={page} onPage={setPage} />
    </ResourceState>
  </section>;
}
