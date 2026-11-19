import { useId, useRef, useState } from 'react';
import { getMembers, transferAdmin } from '../../api/groups.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useGroupResource, ResourceState } from './resources.jsx';
import { describeActionError } from '../../utils/apiErrors.js';
import Button from '../../components/Button.jsx';
import Select from '../../components/Select.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import FormAlert from '../../components/FormAlert.jsx';

export default function TransferAdmin({ group, onSaved }) {
  const { user } = useAuth();
  const selectId = useId();
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const sending = useRef(false);
  const members = useGroupResource(async (signal) => {
    let page = 1, all = [], data;
    do {
      data = await getMembers(group.id, page++, signal);
      all = all.concat(data.results);
    } while (data.next);
    return all.filter((member) => member.user.id !== user.id);
  }, [group.id, user.id]);
  async function transfer() {
    if (sending.current || !selected) return;
    sending.current = true; setBusy(true); setError(null);
    try {
      const data = await transferAdmin(group.id, selected);
      setConfirming(false); onSaved(data.group);
    } catch (err) { setConfirming(false); setError(describeActionError(err, 'transfer admin ownership')); members.refresh(); }
    finally { sending.current = false; setBusy(false); }
  }
  return <section className="stack"><h3>Transfer admin ownership</h3>
    <p>Choose a new admin; you will stay as a member.</p>
    <FormAlert message={error?.message} items={error?.other} />
    <ResourceState resource={members}>
      {members.data?.length ? <><div className="field"><label htmlFor={selectId}>New group admin</label><Select id={selectId} value={selected} onChange={(e) => setSelected(e.target.value)} disabled={busy}><option value="">Choose a member</option>{members.data.map((member) => <option value={member.user.id} key={member.user.id}>{member.user.full_name} (@{member.user.username})</option>)}</Select></div>
        <div><Button variant="secondary" disabled={!selected || busy} onClick={() => setConfirming(true)}>Transfer admin ownership</Button></div></> : <p>No other members. You do not need to transfer ownership.</p>}
    </ResourceState>
    <ConfirmDialog open={confirming} title="Transfer admin ownership?" message="This member will become admin. You will lose admin access." confirmLabel="Transfer ownership" busyLabel="Transferring ownership…" onConfirm={transfer} onCancel={() => { if (!busy) setConfirming(false); }} busy={busy} />
  </section>;
}
