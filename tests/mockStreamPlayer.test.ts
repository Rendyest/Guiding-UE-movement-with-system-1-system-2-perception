import { describe, expect, it } from 'vitest';
import { advanceCursor, latestByKind, MockPlayer } from '../src/mock/mockStreamPlayer';
import type { GateReason, ReplayEvent } from '../src/contracts';

function pose(t: number, ok: boolean, reasons: GateReason[]): ReplayEvent {
  return {
    kind: 'pose_frame',
    at_ms: Math.round(t * 1000),
    data: {
      t,
      fps: 24,
      joints: { r_elbow: { x: 0.41, y: 0.52, conf: 0.93 } },
      angles: { r_elbow_flexion: { deg: 87.2, conf: 0.91 } },
      gate: { ok, reasons },
    },
  };
}

// Fixed fixture, hand-checkable: 5 events — 3 pose frames (1 flagged),
// 1 system1 window (escalating), 1 coach call with latency 1320 ms.
const FIXTURE: ReplayEvent[] = [
  pose(0.0, true, []),
  {
    kind: 'system1_state',
    at_ms: 1000,
    data: { t: 1.0, state: 'hesitating', score: 0.58, top_signal: 'stall', escalate: false },
  },
  pose(1.5, true, []),
  pose(2.0, false, ['foreshortening']),
  {
    kind: 'coach_event',
    at_ms: 3100,
    data: {
      t: 3.1,
      trigger: 'struggling_sustained',
      latency_ms: 1320,
      ok: true,
      message: 'Take your time.',
      inputs: 'angle_summary',
    },
  },
];

describe('advanceCursor', () => {
  it('moves forward and clamps at the end', () => {
    expect(advanceCursor(0, 5, 3)).toBe(3);
    expect(advanceCursor(3, 5, 9)).toBe(5);
  });

  it('clamps at zero for backward steps and empty streams', () => {
    expect(advanceCursor(1, 5, -9)).toBe(0);
    expect(advanceCursor(0, 0)).toBe(0);
  });
});

describe('latestByKind', () => {
  it('returns the latest consumed event of each kind', () => {
    const latest = latestByKind(FIXTURE, 4);
    expect(latest.pose_frame?.at_ms).toBe(2000);
    expect(latest.system1_state?.at_ms).toBe(1000);
    expect(latest.coach_event).toBeUndefined();
  });

  it('is empty before anything is consumed', () => {
    expect(latestByKind(FIXTURE, 0)).toEqual({});
  });
});

describe('MockPlayer', () => {
  it('starts empty and steps through in order', () => {
    const p = new MockPlayer();
    p.setEvents(FIXTURE);
    expect(p.snapshot().cursor).toBe(0);
    expect(p.snapshot().current).toBeNull();
    p.step();
    p.step(2);
    expect(p.snapshot().cursor).toBe(3);
    expect(p.snapshot().current?.kind).toBe('pose_frame');
  });

  it('counts consumed pose frames and flagged frames (3 frames, 1 flagged)', () => {
    const p = new MockPlayer();
    p.setEvents(FIXTURE);
    p.step(4);
    expect(p.consumedPoseStats()).toEqual({ frames: 3, flagged: 1 });
  });

  it('exposes consumed events in replay order', () => {
    const p = new MockPlayer();
    p.setEvents(FIXTURE);
    p.step(2);
    expect(p.consumed().map((e) => e.kind)).toEqual(['pose_frame', 'system1_state']);
  });

  it('reset returns to zero and play restarts at the end', () => {
    const p = new MockPlayer();
    p.setEvents(FIXTURE);
    p.step(99);
    expect(p.snapshot().cursor).toBe(5);
    p.reset();
    expect(p.snapshot().cursor).toBe(0);
    p.step(99);
    p.play();
    expect(p.snapshot().cursor).toBe(0);
    expect(p.snapshot().playing).toBe(true);
    p.pause();
    expect(p.snapshot().playing).toBe(false);
  });
});
