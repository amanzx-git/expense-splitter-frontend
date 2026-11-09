import { useId } from 'react';

// A controlled input is wired by the PARENT via value + onChange.
// This component only adds the label, hint and accessible error text.
export default function Input({ label, error, hint, id, ...rest }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      {hint && <span id={hintId} className="field-hint">{hint}</span>}
      {error && <span id={errorId} className="field-error">Error: {error}</span>}
    </div>
  );
}