import { useEffect, useRef, useState } from 'react';
import * as groups from '../../api/groups.js';
import { describeActionError, describeError } from '../../utils/apiErrors.js';
import Button from '../../components/Button.jsx';
import Input from '../../components/Input.jsx';
import FormAlert from '../../components/FormAlert.jsx';
import LoadingState from '../../components/LoadingState.jsx';

export default function InviteForm({ groupId, onInvited }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const searchController = useRef(null);
  useEffect(() => () => searchController.current?.abort(), []);
  async function search(event) {
    event.preventDefault();
    if (busy) return;
    if (query.trim().length < 2) { setError({ fieldErrors: { username: 'Enter at least 2 characters.' } }); return; }
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    setBusy(true); setError(null); setResults(null); setMessage('');
    try {
      const data = await groups.searchUsers(query.trim().toLowerCase(), controller.signal);
      if (!controller.signal.aborted) setResults(data.results);
    } catch (err) { if (!controller.signal.aborted) setError(describeError(err, ['username'])); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  async function invite(username) {
    if (busy) return;
    setBusy(true); setError(null); setMessage('');
    try {
      await groups.inviteUser(groupId, username);
      setMessage(`Invitation sent to @${username}.`);
      setResults(null); onInvited();
    } catch (err) {
      setError(describeActionError(err, 'send this invitation', ['username']));
      if (err.status === 409) onInvited();
    } finally { setBusy(false); }
  }
  return <section id="invite-members" tabIndex={-1} className="card stack">
    <h2>Invite members</h2>
    <form className="stack" onSubmit={search} noValidate>
      <FormAlert message={error?.message} items={error?.other} hint={error?.hint} />
      <Input label="Search username" disabled={busy} value={query} onChange={(e) => { setQuery(e.target.value); setResults(null); }} error={error?.fieldErrors?.username} />
      <Button type="submit" loading={busy}>Search users</Button>
    </form>
    {busy && <LoadingState label="Working…" />}
    {message && <p role="status">{message}</p>}
    {results?.length === 0 && <p>No matching users.</p>}
    <ul className="plain-list">{results?.map((person) => <li className="list-item" key={person.id}>
      <span>{person.full_name} (@{person.username})</span>
      <Button disabled={busy} onClick={() => invite(person.username)}>Invite @{person.username}</Button>
    </li>)}</ul>
  </section>;
}
