import { useEffect, useState } from 'react';

type QueueStatus = 'loading' | 'empty' | 'ready' | 'error';

/**
 * Reviewer route. The clip queue and review card arrive in slice 7. This page
 * reads only its backing file and never renders mock replay data as a result.
 */
export function ReviewPage() {
  const [status, setStatus] = useState<QueueStatus>('loading');
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch('/review-queue.json')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<unknown>;
      })
      .then((json) => {
        if (cancelled) return;
        const clips =
          typeof json === 'object' && json !== null && Array.isArray((json as { clips?: unknown }).clips)
            ? (json as { clips: unknown[] }).clips
            : [];
        setCount(clips.length);
        setStatus(clips.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!cancelled) setStatus('empty');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <h1>Clip review (OT reviewer)</h1>
      {status === 'loading' && <p>Checking the review queue…</p>}
      {status === 'empty' && <p>No review clips yet.</p>}
      {status === 'error' && <p role="alert">The review queue could not be read.</p>}
      {status === 'ready' && <p>{count} clip(s) queued — the review card arrives in slice 7.</p>}
      {status !== 'loading' && (
        <p>Queue, labels, and agreement rate arrive in slice 7. Mock replay data is never shown here as a result.</p>
      )}
    </div>
  );
}
