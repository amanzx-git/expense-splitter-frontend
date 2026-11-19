import { countLabel } from '../utils/wording.js';
import GroupPaymentAttention from '../features/settlements/GroupPaymentAttention.jsx';
import { usePaymentActions } from '../features/settlements/PaymentActionsProvider.jsx';
import GroupAvatar from '../components/GroupAvatar.jsx';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import * as groups from '../api/groups.js';
import GroupForm from '../features/groups/GroupForm.jsx';
import { useGroupResource, ResourceState, Pagination } from '../features/groups/resources.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Button from '../components/Button.jsx';
import Modal from '../components/Modal.jsx';
import Icon from '../components/Icon.jsx';

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const payments = usePaymentActions();
  const fallback = useGroupResource((signal) => payments ? Promise.resolve(null) : groups.getGroups(page, signal), [page, !!payments]);
  const list = payments ? { ...payments, data: payments.data?.groupPages[page - 1] } : fallback;
  const pending = useGroupResource((signal) => groups.getInvitations(null, 'pending', 1, signal), []);
  return <div className="stack">
    <div className="page-heading">
      <div><p className="eyebrow">Your shared expenses, together</p><h1>Dashboard</h1>
      <p className="muted">Welcome back, <strong>{user.full_name}</strong>.</p></div>
      <div className="row"><Link className="btn btn-secondary" to="/quick-split">Quick Split</Link>
      <Button onClick={() => setShowCreate(true)}>Create group</Button></div>
    </div>
    {(pending.loading || pending.error || pending.data?.count > 0) && <section className="card invitation-callout stack" aria-label="Pending invitations">
      <h2>Pending invitations</h2>
      <ResourceState resource={pending}><p><Link to="/invitations">{countLabel(pending.data?.count, 'pending invitation')}</Link></p></ResourceState>
    </section>}
    <section className="stack" aria-labelledby="your-groups-heading">
      <h2 id="your-groups-heading">Your groups</h2>
      <ResourceState resource={list}>
        {list.data?.results.length === 0 && <div className="card"><EmptyState title="No groups yet" description="Create a group or accept an invitation." /></div>}
        <ul className="plain-list group-grid">{list.data?.results.map((group) => <li key={group.id} className={payments?.data?.actions.some((action) => action.group.id === group.id) ? 'group-needs-payment' : undefined}>
          <Link className="group-card card" to={`/groups/${group.id}`} aria-label={group.name}>
            <GroupAvatar group={group} decorative />
            <span className="group-card-copy"><strong>{group.name}</strong><span className="muted">{countLabel(group.member_count, 'member')} · {group.my_role === 'admin' ? 'You manage this group' : 'Member'}</span></span>
            <Icon name="arrow" />
          </Link>
          <GroupPaymentAttention groupId={group.id} />
        </li>)}</ul>
        <Pagination data={list.data} page={page} onPage={setPage} />
      </ResourceState>
    </section>
    <Modal open={showCreate} title="Create group" busy={creating} onClose={() => { if (!creating) setShowCreate(false); }}>
      <p className="muted">Create a group and invite your friends.</p>
      <GroupForm onSave={async (body) => {
        setCreating(true);
        try { return await groups.createGroup(body); }
        finally { setCreating(false); }
      }} onSaved={(group) => navigate(`/groups/${group.id}`)} />
      <div className="modal-actions"><Button variant="secondary" disabled={creating} onClick={() => setShowCreate(false)}>Cancel</Button></div>
    </Modal>
  </div>;
}
