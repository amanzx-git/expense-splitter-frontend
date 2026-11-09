// `action` is any element (e.g. a Button) giving the user a next step.
export default function EmptyState({ title, description, action }) {
  return (
    <div className="state">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}