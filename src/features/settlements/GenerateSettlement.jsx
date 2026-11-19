import { useState } from 'react';
import { Link } from 'react-router-dom';
import { generateSettlement } from '../../api/settlements.js';
import { describeActionError } from '../../utils/apiErrors.js';
import Button from '../../components/Button.jsx';
import Modal from '../../components/Modal.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import Icon from '../../components/Icon.jsx';
import { BLOCKERS } from '../balances/GroupBalances.jsx';

export default function GenerateSettlement({ group, preview, onChanged, eligibleOnly = false, compact = false }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);
  if (group.my_role !== 'admin') return null;
  const eligible = !preview.loading && !preview.error && preview.data?.can_generate_settlement && preview.data.blockers.length === 0;
  const reason = preview.loading ? 'Checking group payments…' : preview.error ? 'Could not check group payments. Try again.' : preview.data?.blockers.map((code) => BLOCKERS[code] || 'Cannot settle up yet.').join(' ') || (!eligible ? 'Cannot settle up yet.' : '');
  if (eligibleOnly && !eligible && !created && !error) return null;
  async function generate() {
    if (busy || !eligible) return;
    setBusy(true); setError(null); setCreated(null);
    try {
      const data = await generateSettlement(group.id);
      setCreated(data.settlement); setOpen(false); onChanged();
    } catch (err) {
      setError(describeActionError(err, 'create this settlement'));
      setOpen(false);
      if ([403, 404, 409].includes(err.status)) onChanged();
    } finally { setBusy(false); }
  }
  return <div className="stack">
    <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
    {(!eligibleOnly || eligible) && <Button aria-label="Generate settlement" aria-disabled={compact && !eligible ? true : undefined} title={reason || 'Generate settlement'} disabled={busy || (!compact && !eligible)} onClick={() => setOpen(true)}>{compact && <Icon name="receipt" />}<span className={compact ? 'generation-label desktop-action-label' : undefined}>Generate settlement</span>{compact && <span className="mobile-action-label">Settle</span>}</Button>}
    {created && <p role="status">Settlement #{created.sequence_number} {created.status === 'completed' ? 'is complete. No payments are needed.' : 'is ready. Pay outside Splitter; receivers confirm receipt.'} <Link to={`/groups/${group.id}/settlements/${created.id}`}>View settlement</Link></p>}
    <Modal open={open} busy={busy} title="Create settlement?" onClose={() => { if (!busy) setOpen(false); }}>
      {reason && <p className="muted" role="status">{reason}</p>}
      <p>See who will need to pay whom. Included expenses will be saved and cannot be changed.</p>
      <p>If no payments are needed, the settlement will be complete.</p>
      <div className="modal-actions">
        <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
        <Button loading={busy} disabled={!eligible} onClick={generate}>{busy ? 'Creating settlement…' : 'Create settlement'}</Button>
      </div>
    </Modal>
  </div>;
}
