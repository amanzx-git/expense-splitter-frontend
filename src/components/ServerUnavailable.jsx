import { Link } from 'react-router-dom';
import AuthCard from './AuthCard.jsx';
import Button from './Button.jsx';
import FormAlert from './FormAlert.jsx';

// Shown instead of a protected page when we cannot even check the session.
// Quick Split never needs the server, so we always point to it.
export default function ServerUnavailable({ message, onRetry, checking }) {
  return (
    <AuthCard>
      <h1>Could not check your sign-in</h1>
      <FormAlert message={message} />
      <div><Button onClick={onRetry} loading={checking}>Try again</Button></div>
      <p>You can still split expenses: <Link to="/quick-split">open Quick Split</Link>.</p>
    </AuthCard>
  );
}
