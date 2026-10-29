import { useEffect, useRef, useState } from 'react';
import type { PoseFrame } from '../contracts';
import { config } from '../config';

interface AngleReadoutProps {
  /** Latest frame from either source; null before the first frame. */
  frame: PoseFrame | null;
}

const ROWS = [
  { key: 'r_elbow_flexion', label: 'Elbow flexion, right arm' },
  { key: 'r_shoulder_elevation', label: 'Shoulder elevation, right arm' },
] as const;

/**
 * Pure throttle check with an injected clock: update the display when at
 * least `intervalMs` has passed since the last update. Tested with plain
 * numbers, no timers needed.
 */
export function readoutDue(nowMs: number, lastMs: number, intervalMs: number): boolean {
  return nowMs - lastMs >= intervalMs;
}

/**
 * Two angle rows: degrees plus confidence. Display text updates at the
 * `ui.readout_hz` rate from config (5 Hz placeholder) so the readout stays
 * readable while the pipeline runs faster.
 * Flagged frames are dimmed AND marked "(uncertain)" in text — never colour alone.
 */
/**
 * Pure presentational angle list: no timers, no effects, so server rendering
 * (and tests) exercise the exact flagged/unflagged wording the user sees.
 */
export function AngleList({ frame }: { frame: PoseFrame }) {
  const flagged = !frame.gate.ok;

  return (
    <section aria-label="Joint angles" aria-live="off">
      <h2>Angles</h2>
      <ul className={flagged ? 'angle-list dimmed' : 'angle-list'}>
        {ROWS.map((row) => {
          const reading = frame.angles[row.key];
          if (!reading || Number.isNaN(reading.deg)) {
            return (
              <li key={row.key}>
                {row.label}: <strong>—</strong>
              </li>
            );
          }
          return (
            <li key={row.key}>
              {row.label}: <strong>{reading.deg.toFixed(1)}°</strong> (confidence {reading.conf.toFixed(2)})
              {flagged && ' — uncertain'}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AngleReadout({ frame }: AngleReadoutProps) {
  const [shown, setShown] = useState<PoseFrame | null>(null);
  const lastUpdate = useRef(0);

  useEffect(() => {
    if (!frame) {
      setShown(null);
      return;
    }
    const now = performance.now();
    const intervalMs = 1000 / config.ui.readout_hz;
    if (readoutDue(now, lastUpdate.current, intervalMs)) {
      lastUpdate.current = now;
      setShown(frame);
    }
  }, [frame]);

  if (!shown) return <p>No angles yet.</p>;
  return <AngleList frame={shown} />;
}
