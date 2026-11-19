import { useEffect, useState } from 'react';
import { clearAccountDeletionNotice, readAccountDeletionNotice } from '../utils/accountDeletionNotice.js';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import Icon from '../components/Icon.jsx';

// No backend call here: the home page renders whether or not Django is running.
export default function HomePage() {
  const { status } = useAuth();
  const [deletionNotice] = useState(readAccountDeletionNotice);
  useEffect(() => { if (deletionNotice) clearAccountDeletionNotice(); }, [deletionNotice]);
  return (
    <div className="home-page stack">
      {deletionNotice && <p role="status">{deletionNotice}</p>}
      <section className="hero" aria-labelledby="home-heading">
      <p className="eyebrow">Less maths. More good times.</p>
      <h1 id="home-heading">Split expenses.<br />Keep friendships simple.</h1>
      <p className="hero-description">
        Split bills with friends and keep track of shared expenses.
      </p>
      <div className="row">
        <Link className="btn btn-primary" to="/quick-split">Try Quick Split</Link>
        {status === 'authenticated' ? (
          <Link className="btn btn-secondary" to="/dashboard">Go to dashboard</Link>
        ) : (
          <Link className="btn btn-secondary" to="/register">Create account</Link>
        )}
      </div>
      <p className="muted hero-note">Split without signing in. Payments happen outside Splitter.</p>
      </section>
      <section className="home-steps" aria-labelledby="home-steps-h">
        <h2 id="home-steps-h">How it works</h2>
        <ol className="step-grid plain-list">
          <li className="card"><span className="icon-tile"><Icon name="people" /></span><h3>Bring your people</h3><p>Split a bill or start a group with friends.</p></li>
          <li className="card"><span className="icon-tile"><Icon name="receipt" /></span><h3>Add what was spent</h3><p>Choose who paid and who shared the cost.</p></li>
          <li className="card"><span className="icon-tile"><Icon name="check" /></span><h3>Settle up, simply</h3><p>Pay outside Splitter, then confirm when the money arrives.</p></li>
        </ol>
      </section>
    </div>
  );
}
