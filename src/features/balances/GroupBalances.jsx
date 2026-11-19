import { Link } from 'react-router-dom';
import { listSettlements } from '../../api/settlements.js';
import Button from '../../components/Button.jsx';
import Icon from '../../components/Icon.jsx';
import { balanceDirectionClass } from '../settlements/paymentPresentation.jsx';
import { getBalances } from '../../api/balances.js';
import { useGroupResource, ResourceState } from '../groups/resources.jsx';
import Money from '../../components/Money.jsx';
import UserAvatar from '../../components/UserAvatar.jsx';
import { useContext } from 'react';
import { AuthContext } from '../../context/AuthContext.jsx';
import usePaymentStateRefresh from '../../hooks/usePaymentStateRefresh.js';

export const BLOCKERS = {
  PENDING_INVITATIONS: 'Resolve pending invitations before settling up.',
  ACTIVE_SETTLEMENT_EXISTS: 'Finish current payments before settling new expenses.',
  NO_UNSETTLED_EXPENSES: 'Add an expense before settling up.',
};

function OfficialStatementLink({ groupId, revision }) {
  const resource = useGroupResource((signal) => listSettlements(groupId, 1, signal), [groupId, revision]);
  const current = resource.data?.results?.[0];
  return <ResourceState resource={resource}>{current?.status === 'pending' && <Link to={`/groups/${groupId}/settlements/${current.id}`}>View official statement</Link>}</ResourceState>;
}

export default function GroupBalances({ groupId, revision = 0, children, compact = false, inModal = false, isAdmin = false, onAdd }) {
  const auth = useContext(AuthContext);
  const resource = useGroupResource((signal) => getBalances(groupId, signal), [groupId, revision]);
  usePaymentStateRefresh(resource.refresh);
  const data = resource.data;
  if (compact) {
    const member = data?.members.find((item) => item.user.id === auth?.user?.id);
    return <section className="card stack" aria-label="Your balance preview"><h2>Your balance</h2>
      <ResourceState resource={resource}>{data && <>
        {member ? <p className="personal-balance">{member.net_balance === '0.00' ? 'No payments from new expenses' : member.net_balance.startsWith('-') ? 'You will pay' : 'You will receive'} <Money className={member.user.id === auth?.user?.id ? balanceDirectionClass(member.net_balance) : undefined} value={member.net_balance.startsWith('-') ? member.net_balance.slice(1) : member.net_balance} /></p> : <p>New shared expenses: <Money value={data.unsettled_expense_total} /></p>}
        <p className="muted">Estimated amounts for new expenses only.</p>
        {data.blockers.includes('ACTIVE_SETTLEMENT_EXISTS') && <p>Open current payments to see your next step.</p>}
      </>}</ResourceState>{children?.(resource)}
    </section>;
  }
  const hasExpenses = data && !data.blockers.includes('NO_UNSETTLED_EXPENSES') && !/^-?0(?:\.0+)?$/.test(data.unsettled_expense_total);
  const active = data?.blockers.includes('ACTIVE_SETTLEMENT_EXISTS');
  const blocker = data?.blockers.find((code) => code !== 'NO_UNSETTLED_EXPENSES');
  return <section className={inModal ? 'stack group-balances' : 'card stack group-balances'} aria-label="Group balances">
    <ResourceState resource={resource}>
      {data && (hasExpenses ? <>
        <p><strong>New expenses: <Money value={data.unsettled_expense_total} /></strong></p>
        <h3>Member balances</h3>
        {data.members.length > 0 ? <ul className="plain-list balance-members" aria-label="Member balances">
          {data.members.map((member) => <li className="balance-member" key={member.user.id}>
            <span className="identity"><UserAvatar user={member.user} decorative /><span>{member.user.full_name || '@' + member.user.username}</span></span>
            <span>{/^-?0(?:\.0+)?$/.test(member.net_balance) ? 'Settled' : <>{member.net_balance.startsWith('-') ? 'Will pay' : 'Will receive'} <Money className={balanceDirectionClass(member.net_balance)} value={member.net_balance.startsWith('-') ? member.net_balance.slice(1) : member.net_balance} /></>}</span>
          </li>)}
        </ul> : <p className="muted">No member balances</p>}
        {blocker ? <p className="muted">{BLOCKERS[blocker] ?? 'Cannot settle yet. Try refreshing.'}</p> : isAdmin && <p className="muted">{data.can_generate_settlement ? 'Ready to settle' : 'Cannot settle yet.'}</p>}
        {active && <OfficialStatementLink groupId={groupId} revision={revision} />}
      </> : <div className="balance-empty stack">
        <Icon name="check" />
        <h3>No new expenses</h3>
        <p className="muted">Add an expense to see who needs to pay.</p>
        {onAdd && <Button onClick={onAdd}>Add an expense</Button>}
      </div>)}
    </ResourceState>
    {!inModal && children?.(resource)}
  </section>;
}
