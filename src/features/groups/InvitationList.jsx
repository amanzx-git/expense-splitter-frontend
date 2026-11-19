import { userHandle } from '../../utils/identity.js';
import Select from '../../components/Select.jsx';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import * as groups from '../../api/groups.js';
import { describeActionError } from '../../utils/apiErrors.js';
import Button from '../../components/Button.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import { useGroupResource, ResourceState, Pagination } from './resources.jsx';

const STATUS_LABELS = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined', cancelled: 'Cancelled' };

export default function InvitationList({ groupId, revision = 0, onChanged }) {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const list = useGroupResource((signal) => groups.getInvitations(groupId, status, page, signal), [groupId, status, page, revision]);
  async function act(id, action) {
    if (busy) return;
    setBusy(id); setError(null); setMessage('');
    try {
      await groups.actOnInvitation(id, action);
      setMessage(`Invitation ${ { accept: 'accepted', decline: 'declined', cancel: 'cancelled' }[action]}.`);
      list.refresh(); onChanged?.();
    } catch (err) {
      setError(describeActionError(err, `${action} this invitation`));
      if (err.status === 409) { list.refresh(); onChanged?.(); }
    } finally { setBusy(null); }
  }
  return <section className="card stack invitation-panel">
    <div className="invitation-toolbar"><div><h2>{groupId ? 'Invitations' : 'Your invitations'}</h2>
    {status === 'pending' && !list.loading && !list.error && list.data && <span className="invitation-count">{list.data.count} pending</span>}</div>
    <div className="field invitation-filter">
      <label htmlFor="invitation-status">Invitation status</label>
      <Select id="invitation-status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); setError(null); setMessage(''); }}>
        <option value="">All statuses</option>
        {['pending', 'accepted', 'declined', 'cancelled'].map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
      </Select>
    </div></div>
    <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
    {busy && <p role="status">Updating invitation…</p>}
    {message && <p role="status">{message}</p>}
    <ResourceState resource={list}>
      {list.data?.results.length === 0 && <EmptyState title="No invitations" />}
      <ul className="plain-list invitation-rows">{list.data?.results.map((invitation) => <li key={invitation.id} className="list-item">
        <div className="list-item-main">
          {!groupId && <strong>{invitation.group.name}</strong>}
          <p>{groupId ? `Invited ${userHandle(invitation.invitee)}` : `From ${userHandle(invitation.invited_by)}`} <span className={`status-pill invitation-status invitation-status--${invitation.status}`}>{STATUS_LABELS[invitation.status] || 'Status unavailable'}</span></p>
          {!groupId && invitation.status === 'accepted' && <Link to={`/groups/${invitation.group.id}`}>Open group</Link>}
        </div>
        {invitation.status === 'pending' && <div className="row">
          {groupId ? <Button variant="secondary" disabled={!!busy} onClick={() => act(invitation.id, 'cancel')}>Cancel invitation</Button> : <>
            <Button disabled={!!busy} onClick={() => act(invitation.id, 'accept')}>Accept</Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => act(invitation.id, 'decline')}>Decline</Button>
          </>}
        </div>}
      </li>)}</ul>
      <Pagination data={list.data} page={page} onPage={setPage} />
    </ResourceState>
  </section>;
}
