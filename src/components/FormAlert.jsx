// role="alert" makes screen readers announce it when it appears.
export default function FormAlert({ message, items = [], hint = '' }) {
  if (!message) return null;
  return (
    <div className="error-box" role="alert">
      <p><strong>{message}</strong></p>
      {hint && <p className="error-hint">{hint}</p>}
      {items.length > 0 && (
        <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
      )}
    </div>
  );
}
