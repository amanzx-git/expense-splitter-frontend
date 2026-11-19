import Logo from './Logo.jsx';

// The card used by sign-in, registration and the other account screens.
export default function AuthCard({ children }) {
  return (
    <div className="card stack auth-card">
      <Logo className="logo--auth" />
      {children}
    </div>
  );
}
