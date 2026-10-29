import { useSyncExternalStore } from 'react';

export type LivePipelineStatus = 'idle' | 'loading' | 'live' | 'denied' | 'error';

/** Pipeline status only — no joints, angles, or frame data pass through here. */
export interface LiveStats {
  status: LivePipelineStatus;
  fps: number;
}

let stats: LiveStats = { status: 'idle', fps: 0 };
const listeners = new Set<() => void>();

export function publishLiveStats(next: LiveStats): void {
  if (next.status === stats.status && next.fps === stats.fps) return;
  stats = { status: next.status, fps: next.fps };
  for (const fn of listeners) fn();
}

function getSnapshot(): LiveStats {
  return stats;
}

export function subscribeLiveStats(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * For reviewer routes (e.g. /metrics). Never used on participant routes.
 * getSnapshot doubles as the server snapshot so reviewer pages can also
 * render via renderToStaticMarkup; it only ever reflects pipeline status.
 */
export function useLiveStats(): LiveStats {
  return useSyncExternalStore(subscribeLiveStats, getSnapshot, getSnapshot);
}
