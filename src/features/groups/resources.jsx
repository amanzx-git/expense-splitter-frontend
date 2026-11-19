import { useEffect, useState } from 'react';
import { describeError } from '../../utils/apiErrors.js';
import LoadingState from '../../components/LoadingState.jsx';
import ErrorMessage from '../../components/ErrorMessage.jsx';
import Button from '../../components/Button.jsx';

// Dependencies identify the resource; abort old reads on navigation or filtering.
export function useGroupResource(load, dependencies) {
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    load(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ data, error: null, loading: false }); },
      (err) => { if (!controller.signal.aborted) setState({ data: null, error: describeError(err), loading: false }); },
    );
    return () => controller.abort();
  }, [...dependencies, version]);
  return { ...state, refresh: () => setVersion((v) => v + 1) };
}

export function ResourceState({ resource, children }) {
  if (resource.loading) return <LoadingState />;
  if (resource.error) return <ErrorMessage message={resource.error.message} onRetry={resource.refresh} />;
  return children;
}

export function Pagination({ data, page, onPage }) {
  if (!data || (!data.next && !data.previous)) return null;
  return <nav className="row" aria-label="Pagination">
    <Button variant="secondary" disabled={!data.previous} onClick={() => onPage(page - 1)}>Previous</Button>
    <span>Page {page}</span>
    <Button variant="secondary" disabled={!data.next} onClick={() => onPage(page + 1)}>Next</Button>
  </nav>;
}
