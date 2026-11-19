import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { UNAVAILABLE_MESSAGE } from '../api/errors.js';
import AuthCard from './AuthCard.jsx';
import LoadingState from './LoadingState.jsx';
import ServerUnavailable from './ServerUnavailable.jsx';

// A guard for the experience only: the server enforces permissions on every request.
export default function ProtectedRoute({ requireVerified = true }) {
  const { user, status, unavailable, checking, recheck, signedOutByUser } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <LoadingState label="Checking your sign-in…" />;

  // We cannot tell whether the visitor is signed in. Never redirect to login on an
  // outage: that would throw away where they were going.
  if (status === 'unknown') {
    return (
      <ServerUnavailable
        message={unavailable ? UNAVAILABLE_MESSAGE : 'Could not check your sign-in. Please try again.'}
        onRetry={recheck}
        checking={checking}
      />
    );
  }

  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    // After an intentional sign-out go home, not to a login screen asking to come back.
    return <Navigate to={signedOutByUser ? '/' : `/login?next=${next}`} replace />;
  }

  if (requireVerified && !user.email_verified) {
    return (
      <AuthCard>
        <h1>Verify your email</h1>
        <p>Verify your email to open this page.</p>
        <Link to="/verify-email">Verify email</Link>
      </AuthCard>
    );
  }
  return <Outlet />;
}
