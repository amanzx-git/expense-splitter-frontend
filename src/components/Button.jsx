// variant: 'primary' | 'secondary' | 'danger'
// loading: shows a spinner and blocks clicks (prevents double submissions).
export default function Button({
  variant = 'primary',
  loading = false,
  disabled = false,
  type = 'button', // default 'button' so it never submits a form by accident
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}