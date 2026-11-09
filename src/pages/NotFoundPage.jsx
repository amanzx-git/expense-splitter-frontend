import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
      <p>That address doesn't exist.</p>
      <Link to="/">Go home</Link>
    </main>
  );
}