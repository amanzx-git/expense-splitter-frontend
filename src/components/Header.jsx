import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';

// Static links for now. F3 will swap in sign-in-aware links (Dashboard, Sign out...).
export default function Header() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="site-header">
      <div className="container">
        <Link to="/" className="brand" onClick={close}>Expense Splitter</Link>

        <button
          type="button"
          className="btn btn-secondary nav-toggle"
          aria-expanded={open}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>

        <nav id="main-nav" aria-label="Main" className={`nav${open ? ' is-open' : ''}`}>
          <NavLink to="/" end onClick={close}>Home</NavLink>
          <NavLink to="/quick-split" onClick={close}>Quick Split</NavLink>
          <NavLink to="/login" onClick={close}>Sign in</NavLink>
          <NavLink to="/register" onClick={close}>Create account</NavLink>
        </nav>
      </div>
    </header>
  );
}