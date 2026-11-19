import { Navigate, Outlet, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { safeNext } from '../utils/safeNext.js';

// For /login and /register. It only redirects when the server CONFIRMED the visitor is
// signed in. While the session check is running, or failed, the form is shown anyway, so
// these pages work (and report problems themselves) when the backend is down.
export default function GuestRoute() {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'authenticated') {
    return <Navigate to={safeNext(params.get('next')) ?? '/dashboard'} replace />;
  }
  return <Outlet />;
}
