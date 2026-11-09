import Button from './Button.jsx';

// role="alert" makes screen readers announce it immediately.
// onRetry is optional: pass it for recoverable errors (failed loads).
export default function ErrorMessage({ message, onRetry }) {
  return (
    <div className="error-box" role="alert">
      <p><strong>Something went wrong.</strong></p>
      <p>{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}