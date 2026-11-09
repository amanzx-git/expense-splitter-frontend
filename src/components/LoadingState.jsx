export default function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="state" role="status">
      <div className="spinner spinner-lg" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}