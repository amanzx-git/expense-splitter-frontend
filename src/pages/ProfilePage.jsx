import { useEffect, useRef, useState } from 'react';
import { updateProfile, uploadProfilePhoto } from '../api/profile.js';
import { useAuth } from '../hooks/useAuth.js';
import LoadingState from '../components/LoadingState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import { validateProfile } from '../utils/validation.js';
import { safeProfilePhotoUrl, validateProfilePhoto } from '../utils/profile.js';
import { describeActionError } from '../utils/apiErrors.js';
import Input from '../components/Input.jsx';
import Button from '../components/Button.jsx';
import FormAlert from '../components/FormAlert.jsx';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';
import DeleteAccountSection from '../features/account/DeleteAccountSection.jsx';

function ProfilePhoto({ url }) {
  const [failed, setFailed] = useState(false);
  const safe = safeProfilePhotoUrl(url);
  return safe && !failed ? <img className="profile-photo" src={safe} alt="Your profile photo" width="128" height="128" onError={() => setFailed(true)} /> : <p className="muted">No profile photo</p>;
}

function ProfileEditor({ initial }) {
  const { user, updateUser } = useAuth();
  const [values, setValues] = useState({ username: initial.username, full_name: initial.full_name, upi_id: initial.upi_id ?? '' });
  const [error, setError] = useState(null);
  const [photoError, setPhotoError] = useState(null);
  const [message, setMessage] = useState('');
  const [photoMessage, setPhotoMessage] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(null);
  const action = useRef(null);
  const photoInput = useRef(null);
  useEffect(() => () => action.current?.abort(), []);
  function apply(updated) { updateUser(updated); }
  async function save(event) {
    event.preventDefault();
    if (action.current) return;
    const result = validateProfile(values);
    setError({ fieldErrors: result.errors }); setMessage('');
    if (!result.value) return;
    const controller = new AbortController(); action.current = controller; setBusy('profile');
    try {
      const data = await updateProfile(result.value, controller.signal);
      if (controller.signal.aborted) return;
      apply(data.user);
      setValues({ username: data.user.username, full_name: data.user.full_name, upi_id: data.user.upi_id ?? '' });
      setMessage('Profile saved.');
    } catch (err) { if (!controller.signal.aborted) setError(describeActionError(err, 'save your profile', ['username', 'full_name', 'upi_id'])); }
    finally { if (!controller.signal.aborted) { action.current = null; setBusy(null); } }
  }
  async function upload(event) {
    event.preventDefault();
    if (action.current) return;
    const invalid = validateProfilePhoto(photo);
    setPhotoError(invalid ? { fieldErrors: { photo: invalid } } : null); setPhotoMessage('');
    if (invalid) return;
    const controller = new AbortController(); action.current = controller; setBusy('photo');
    try {
      const data = await uploadProfilePhoto(photo, controller.signal);
      if (controller.signal.aborted) return;
      apply({ ...user, profile_photo_url: data.profile_photo_url });
      setPhoto(null); if (photoInput.current) photoInput.current.value = '';
      setPhotoMessage('Profile photo uploaded.');
    } catch (err) { if (!controller.signal.aborted) setPhotoError(describeActionError(err, 'upload your photo', ['photo'])); }
    finally { if (!controller.signal.aborted) { action.current = null; setBusy(null); } }
  }
  return <>
    <p>Email: {user.email}</p><p>Email verification: {user.email_verified ? 'Verified' : 'Not verified'}</p>
    <section className="card stack"><h2>Profile details</h2>
      <form className="stack" onSubmit={save} noValidate>
        <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
        <Input label="Full name" maxLength={100} value={values.full_name} error={error?.fieldErrors?.full_name} onChange={(e) => setValues({ ...values, full_name: e.target.value })} />
        <Input label="Username" maxLength={30} autoComplete="username" value={values.username} error={error?.fieldErrors?.username} onChange={(e) => setValues({ ...values, username: e.target.value })} />
        <Input label="UPI ID (optional)" maxLength={100} value={values.upi_id} error={error?.fieldErrors?.upi_id} onChange={(e) => setValues({ ...values, upi_id: e.target.value })} hint="Not verified by Splitter; leave blank to remove." />
        <Button type="submit" loading={busy === 'profile'} disabled={!!busy}>{busy === 'profile' ? 'Saving profile…' : 'Save profile'}</Button>
        {message && <p role="status">{message}</p>}
      </form>
    </section>
    <section className="card stack"><h2>Profile photo</h2>
      <ProfilePhoto key={user.profile_photo_url ?? 'empty'} url={user.profile_photo_url} />
      <form className="stack" onSubmit={upload} noValidate>
        <FormAlert message={photoError?.message} items={photoError?.other} hint={photoError?.hint} />
        <Input ref={photoInput} label="Choose profile photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} error={photoError?.fieldErrors?.photo} hint="JPG, PNG or WebP, up to 2 MB." />
        <Button type="submit" loading={busy === 'photo'} disabled={!!busy}>{busy === 'photo' ? 'Uploading photo…' : 'Upload photo'}</Button>
        {photoMessage && <p role="status">{photoMessage}</p>}
      </form>
    </section>
    <DeleteAccountSection />
  </>;
}

export default function ProfilePage() {
  const { user, checking, recheck, unavailable } = useAuth();
  return <div className="stack"><h1>Profile</h1>
    {user ? <ProfileEditor key={user.id} initial={user} /> : checking ? <LoadingState /> : <ErrorMessage message={unavailable ? UNAVAILABLE_MESSAGE : 'Your profile is unavailable. Please try again.'} onRetry={recheck} />}
  </div>;
}
