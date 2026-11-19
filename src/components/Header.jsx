import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import Button from './Button.jsx';
import Logo from './Logo.jsx';
import UserAvatar from './UserAvatar.jsx';
import { MessagesNavLink } from '../features/messaging/MessagesProvider.jsx';
import PaymentIndicators from '../features/settlements/PaymentIndicators.jsx';
import NotificationBell from '../features/notifications/NotificationBell.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';

export default function Header() {
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const { user, status, unavailable, checking, recheck, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => { setOpen(false); }, [location.key, status, user?.id]);
  const headerRef = useRef(null);
  const toggleRef = useRef(null);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (event.type === 'keydown' && event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      } else if (event.type === 'pointerdown' && !headerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [open]);

  async function handleLogout() {
    if (signingOut) return;
    close();
    setSignOutError('');
    setSigningOut(true);
    const result = await logout();
    setSigningOut(false);
    if (result.ok) navigate('/');
    else setSignOutError(`You are still signed in: ${result.message}`); // never pretend
  }

  async function handleRetry() {
    const reachable = await recheck(); // a real GET /users/me/
    if (reachable) setSignOutError('');
  }

  return (
    <header className="site-header" ref={headerRef}>
      <div className="container">
        <Link to="/" className="brand" onClick={close} aria-label="Splitter home">
          <Logo variant="responsive" />
        </Link>



        <nav id="main-nav" aria-label="Main" className={`nav${open ? ' is-open' : ''}`}>
          <div className="nav-primary">
          <NavLink to="/" end onClick={close}>Home</NavLink>
          <NavLink to="/quick-split" onClick={close}>Quick Split</NavLink>
          {status === 'authenticated' && <><NavLink to="/dashboard" onClick={close}>My groups</NavLink><MessagesNavLink onNavigate={close} /></>}
          </div>
          <div className="nav-secondary">
          {status === 'authenticated' && <NavLink className="header-account-link" to="/invitations" onClick={close}>Invitations</NavLink>}
        <div className="header-utilities">
        {status === 'authenticated' && <><PaymentIndicators /><NotificationBell onNavigate={close} /></>}
        <button
          type="button"
          ref={toggleRef}
          className="btn btn-secondary nav-toggle"
          aria-expanded={open}
          aria-label={open ? 'Close navigation' : 'Open navigation'}
          aria-controls="main-nav"
          onClick={() => setOpen((o) => !o)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false" data-menu-icon={open ? 'close' : 'hamburger'}>{open ? <path d="m6 6 12 12M6 18 18 6" /> : <path d="M4 6h16M4 12h16M4 18h16" />}</svg>
        </button>
        </div>
          {status === 'authenticated' && (
            <>
              <NavLink className="header-account-link" to="/profile" onClick={close}><UserAvatar user={user} decorative />Profile</NavLink>
              <Button className="btn btn-secondary header-account-link header-signout" variant="secondary" onClick={handleLogout} loading={signingOut}>{signingOut ? 'Signing out…' : 'Sign out'}</Button>
            </>
          )}
          {(status === 'anonymous' || status === 'unknown') && (
            <>
              <NavLink className="header-account-link" to="/login" onClick={close}>Sign in</NavLink>
              <NavLink className="header-account-link" to="/register" onClick={close}>Create account</NavLink>
            </>
          )}
          </div>
        </nav>
      </div>

      {(unavailable || signOutError) && (
        <div className="server-notice" role="alert">
          <div className="container server-notice-row">
            <p>{signOutError || UNAVAILABLE_MESSAGE}</p>
            <Button variant="secondary" onClick={handleRetry} loading={checking}>Retry</Button>
          </div>
        </div>
      )}
    </header>
  );
}
