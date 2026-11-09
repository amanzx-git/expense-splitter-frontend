import { useParams } from 'react-router-dom';

// TEMPORARY (F0 only): each real page replaces this in a later milestone.
export default function Placeholder({ title, access }) {
  const params = useParams();
  return (
    <main>
      <h1>{title}</h1>
      <p>Access: {access}. This is a placeholder page, built in a later milestone.</p>
      {Object.keys(params).length > 0 && (
        <p>Route params: <code>{JSON.stringify(params)}</code></p>
      )}
    </main>
  );
}