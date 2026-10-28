import { useEffect, useState } from 'react';

type ResultsStatus = 'loading' | 'missing' | 'ready';

/**
 * Judge/reviewer route. Static rendering from results.json only (slice 8).
 * Rule: if results.json is missing, show "No results yet." — never mock data.
 */
export function ValidationPage() {
  const [status, setStatus] = useState<ResultsStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    fetch('/results.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then(() => {
        if (!cancelled) setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1>Validation (judges and reviewers)</h1>
      {status === 'loading' && <p>Checking for results…</p>}
      {status === 'missing' && <p>No results yet.</p>}
      {status === 'ready' && <p>Results found — validation rows arrive in slice 8.</p>}
    </div>
  );
}
