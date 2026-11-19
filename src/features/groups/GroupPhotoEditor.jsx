import { useEffect, useRef, useState } from 'react';
import GroupAvatar from '../../components/GroupAvatar.jsx';
import Icon from '../../components/Icon.jsx';
import Button from '../../components/Button.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import { uploadGroupPhoto } from '../../api/groups.js';
import { describeActionError } from '../../utils/apiErrors.js';

export default function GroupPhotoEditor({ group, onSaved }) {
  const input = useRef(null), request = useRef(null);
  const [file, setFile] = useState(null), [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [message, setMessage] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => () => request.current?.abort(), []);
  function choose(event) {
    const selected = event.target.files?.[0]; event.target.value = '';
    setError(null); setMessage('');
    if (!selected) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) { setError({ message: 'Choose a JPG, PNG or WebP image.' }); return; }
    if (selected.size > 5 * 1024 * 1024) { setError({ message: 'Choose a photo up to 5 MB.' }); return; }
    setFile(selected);
  }
  async function save() {
    if (!file || request.current) return;
    const controller = new AbortController(); request.current = controller; setBusy(true); setError(null); setMessage('');
    try {
      const result = await uploadGroupPhoto(group.id, file, controller.signal);
      if (!controller.signal.aborted) { setFile(null); setMessage('Group photo updated.'); onSaved(result.group); }
    } catch (err) { if (!controller.signal.aborted) setError(describeActionError(err, 'save the group photo', ['photo'])); }
    finally { if (!controller.signal.aborted) { request.current = null; setBusy(false); } }
  }
  return <section className="group-photo-editor stack" aria-label="Group photo">
    <div className="group-photo-control">{preview ? <img src={preview} className="group-photo-preview" alt="Selected group photo preview" /> : <GroupAvatar group={group} size="lg" />}
      <button type="button" className="group-photo-camera" aria-label="Change group photo" disabled={busy} onClick={() => input.current?.click()}><Icon name="camera" /></button>
    </div>
    <input ref={input} className="visually-hidden" tabIndex={-1} type="file" aria-label="Group photo file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={busy} />
    <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
    {error?.fieldErrors?.photo && <p role="alert">{error.fieldErrors.photo}</p>}
    {message && <p role="status">{message}</p>}
    {file && <div className="row"><Button loading={busy} onClick={save}>{busy ? 'Saving photo…' : 'Save photo'}</Button><Button variant="secondary" disabled={busy} onClick={() => { setFile(null); setError(null); }}>Cancel</Button><Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>Choose another image</Button></div>}
    {busy && <p role="status">Saving group photo…</p>}
  </section>;
}
