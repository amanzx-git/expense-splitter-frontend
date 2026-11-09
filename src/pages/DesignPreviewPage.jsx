import { useState } from 'react';
import Button from '../components/Button.jsx';
import Input from '../components/Input.jsx';
import LoadingState from '../components/LoadingState.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';
import EmptyState from '../components/EmptyState.jsx';

export default function DesignPreviewPage() {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const error = name.trim() === '' ? 'Name is required.' : '';

  function fakeSave() {
    setLoading(true);
    setTimeout(() => setLoading(false), 1500); // pretend network call
  }

  return (
    <div className="stack">
      <h1>Design preview (temporary)</h1>

      <section className="card stack" aria-labelledby="btn-h">
        <h2 id="btn-h">Buttons</h2>
        <div className="row">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button loading={loading} onClick={fakeSave}>Click for loading</Button>
        </div>
      </section>

      <section className="card stack" aria-labelledby="in-h">
        <h2 id="in-h">Input</h2>
        <Input
          label="Display name"
          hint="1–50 characters."
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
        />
      </section>

      <section className="card" aria-labelledby="st-h">
        <h2 id="st-h">States</h2>
        <LoadingState label="Loading groups…" />
        <ErrorMessage message="We couldn't load your groups." onRetry={() => alert('Retry clicked')} />
        <EmptyState
          title="No groups yet"
          description="Create a group to start sharing expenses."
          action={<Button>Create group</Button>}
        />
      </section>
    </div>
  );
}