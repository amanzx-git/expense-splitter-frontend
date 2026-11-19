import { countLabel } from '../utils/wording.js';
import MemberIdentity from '../features/groups/MemberIdentity.jsx';
import { useState, useEffect } from 'react';
import { Link, useParams, useLocation } from 'react-router-dom';
import * as groups from '../api/groups.js';
import { describeActionError } from '../utils/apiErrors.js';
import { useGroupResource, ResourceState, Pagination } from '../features/groups/resources.jsx';
import InvitationList from '../features/groups/InvitationList.jsx';
import InviteForm from '../features/groups/InviteForm.jsx';
import Button from '../components/Button.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import FormAlert from '../components/FormAlert.jsx';
import UserAvatar from '../components/UserAvatar.jsx';

export default function GroupMembersPage() {
  const { groupId } = useParams();
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const group = useGroupResource((signal) => groups.getGroup(groupId, signal), [groupId]);
  const members = useGroupResource((signal) => groups.getMembers(groupId, page, signal), [groupId, page]);
  const isAdmin = group.data?.group.my_role === 'admin';
  const location = useLocation();
  useEffect(() => {
    if (isAdmin && location.hash === '#invite-members') {
      const form = document.getElementById('invite-members');
      form?.scrollIntoView?.({ block: 'start' });
      form?.querySelector('input')?.focus();
    }
  }, [isAdmin, location.key, location.hash]);
  function refresh() { group.refresh(); members.refresh(); }
  async function remove() {
    if (busy || !selected) return;
    setBusy(true); setError(null); setMessage('');
    const target = selected;
    setSelected(null);
    try {
      await groups.removeMember(groupId, target.user.id);
      setMessage('Member removed.');
      if (page > 1 && members.data?.results.length === 1) setPage(page - 1);
      refresh();
    } catch (err) {
      setError(describeActionError(err, 'remove this member'));
      if (err.status === 409) refresh();
    } finally { setBusy(false); }
  }
  return <div className="stack">
    <Link to={`/groups/${groupId}`}>Back to group</Link>
    <h1>Members &amp; invitations</h1>
    <ResourceState resource={group}>
      <p>{group.data?.group.name} · {countLabel(group.data?.group.member_count, 'member')}</p>
      <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
      {busy && <p role="status">Removing member…</p>}
      {message && <p role="status">{message}</p>}
      {isAdmin && <InviteForm key={groupId} groupId={groupId} onInvited={() => setRevision((v) => v + 1)} />}
      <section className="card stack" aria-labelledby="group-members-heading"><h2 id="group-members-heading">Members</h2>
      <ResourceState resource={members}>
        <ul className="plain-list">{members.data?.results.map((member) => <li key={member.id} className="list-item">
          <MemberIdentity groupId={groupId} user={member.user}><UserAvatar user={member.user} decorative />{member.user.full_name || member.user.username} · {member.role === 'admin' ? 'Admin' : 'Member'}</MemberIdentity>
          {isAdmin && member.role !== 'admin' && <Button variant="danger" disabled={busy} onClick={() => setSelected(member)}>Remove @{member.user.username}</Button>}
        </li>)}</ul>
        <Pagination data={members.data} page={page} onPage={setPage} />
      </ResourceState>
      </section>
      {isAdmin && <>
        <InvitationList key={groupId+'invitations'} groupId={groupId} revision={revision} onChanged={members.refresh} />
      </>}
    </ResourceState>
    <ConfirmDialog open={!!selected} title="Remove member?" message={`Remove @${selected?.user.username ?? ''} from this group? They will lose access. Resolve their expenses and payments first.`} confirmLabel="Remove member" onConfirm={remove} onCancel={() => setSelected(null)} />
  </div>;
}
