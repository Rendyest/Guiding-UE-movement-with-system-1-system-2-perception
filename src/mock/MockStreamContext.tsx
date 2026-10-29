import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadConfig, type AppConfig } from '../config';
import { loadMockStream, MockPlayer, type PlayerSnapshot } from './mockStreamPlayer';

export type StreamStatus = 'loading' | 'ready' | 'error';

export interface MockStreamValue {
  status: StreamStatus;
  error: string | null;
  player: MockPlayer | null;
  /** Thresholds from config.json; null until loaded. Never hard-coded. */
  config: AppConfig | null;
  snapshot: PlayerSnapshot | null;
}

export const MockStreamContext = createContext<MockStreamValue | null>(null);

/** Loads the mock stream + config once so playback persists across routes. */
export function MockStreamProvider({ children }: { children: ReactNode }) {
  const player = useMemo(() => new MockPlayer(), []);
  const [status, setStatus] = useState<StreamStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const unsub = player.subscribe(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    Promise.all([loadMockStream(), loadConfig()])
      .then(([events, cfg]) => {
        if (cancelled) return;
        player.setEvents(events);
        setConfig(cfg);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'failed to load mock stream');
        setStatus('error');
      });
    return () => {
      cancelled = true;
      unsub();
      player.pause();
    };
  }, [player]);

  // Recomputed on every player change; `version` is intentionally read here.
  void version;
  const snapshot = player.snapshot();

  const value: MockStreamValue = { status, error, player, config, snapshot };
  return <MockStreamContext.Provider value={value}>{children}</MockStreamContext.Provider>;
}

export function useMockStream(): MockStreamValue {
  const v = useContext(MockStreamContext);
  if (v === null) throw new Error('useMockStream must be used inside MockStreamProvider');
  return v;
}
