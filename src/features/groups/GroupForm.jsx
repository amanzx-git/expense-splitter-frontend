import { useState } from 'react';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import { describeActionError } from '../../utils/apiErrors.js';

export default function GroupForm({ group, onSave, onSaved }) {
  const [name, setName] = useState(group?.name ?? '');
  const [description, setDescription] = useState(group?.description ?? '');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const canEditName = !group || group.my_role === 'admin';
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const fields = {};
    if (canEditName && (!name.trim() || name.trim().length > 100)) fields.name = 'Enter a group name of 1 to 100 characters.';
    if (description.length > 500) fields.description = 'Use at most 500 characters.';
    setError({ fieldErrors: fields });
    if (Object.keys(fields).length) return;
    setBusy(true);
    try {
      const result = await onSave({ ...(canEditName ? { name: name.trim() } : {}), description });
      onSaved(result.group);
    } catch (err) { setError(describeActionError(err, group ? 'save this group' : 'create this group', ['name', 'description'])); }
    finally { setBusy(false); }
  }
  return <form className="stack" onSubmit={submit} noValidate>
    <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
    {canEditName && <Input label="Group name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} error={error?.fieldErrors?.name} />}
    <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} error={error?.fieldErrors?.description} />
    {!group && <p className="muted">Payments happen outside Splitter; each receiver confirms receipt.</p>}
    <Button type="submit" loading={busy}>{busy ? (group ? 'Saving group…' : 'Creating group…') : group ? 'Save group' : 'Create group'}</Button>
  </form>;
}
