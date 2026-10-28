/**
 * Slice 1 mock stream player. Replays a `{ "events": [...] }` JSON file with
 * pose_frame / system1_state / coach_event entries in file order. Timed
 * playback follows each event's `at_ms` timestamp; stepping is synchronous so
 * tests can drive it without timers. Later slices reuse this transport for
 * recorded clips (the replay harness); live camera replaces only the source.
 */

import { parseReplayFile, type PoseFrame, type ReplayEvent } from '../contracts';

/** Clamp a cursor (events consumed, 0..total) after moving `steps`. Pure. */
export function advanceCursor(cursor: number, total: number, steps = 1): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(cursor + steps, 0), total);
}

export interface LatestByKind {
  pose_frame?: ReplayEvent;
  system1_state?: ReplayEvent;
  coach_event?: ReplayEvent;
}

/** Latest consumed event of each kind. Pure. */
export function latestByKind(events: ReplayEvent[], cursor: number): LatestByKind {
  const out: LatestByKind = {};
  for (const e of events.slice(0, cursor)) out[e.kind] = e;
  return out;
}

export interface PlayerSnapshot {
  cursor: number;
  total: number;
  playing: boolean;
  /** Most recently consumed event, or null before the first step. */
  current: ReplayEvent | null;
  latest: LatestByKind;
}

export async function loadMockStream(url = '/mock-stream.json'): Promise<ReplayEvent[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mock stream not found at ${url} (HTTP ${res.status})`);
  return parseReplayFile((await res.json()) as unknown);
}

export class MockPlayer {
  private events: ReplayEvent[] = [];
  private cursor = 0;
  private lastAtMs = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  /** Playback speed multiplier. 1 = file timestamps as-is. */
  speed = 1;

  playing = false;

  setEvents(events: ReplayEvent[]): void {
    this.stopTimer();
    this.events = events;
    this.cursor = 0;
    this.lastAtMs = 0;
    this.playing = false;
    this.emit();
  }

  get total(): number {
    return this.events.length;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  snapshot(): PlayerSnapshot {
    return {
      cursor: this.cursor,
      total: this.events.length,
      playing: this.playing,
      current: this.cursor > 0 ? this.events[this.cursor - 1] : null,
      latest: latestByKind(this.events, this.cursor),
    };
  }

  /** All events consumed so far, in replay order. */
  consumed(): ReplayEvent[] {
    return this.events.slice(0, this.cursor);
  }

  /** Consumed pose_frames and how many were gate-flagged. Pure readout for tests/pages. */
  consumedPoseStats(): { frames: number; flagged: number } {
    let frames = 0;
    let flagged = 0;
    for (const e of this.events.slice(0, this.cursor)) {
      if (e.kind !== 'pose_frame') continue;
      frames += 1;
      if (!(e.data as PoseFrame).gate.ok) flagged += 1;
    }
    return { frames, flagged };
  }

  play(): void {
    if (this.events.length === 0 || this.playing) return;
    if (this.cursor >= this.events.length) {
      this.cursor = 0;
      this.lastAtMs = 0;
    }
    this.playing = true;
    this.emit();
    this.scheduleNext();
  }

  pause(): void {
    this.playing = false;
    this.stopTimer();
    this.emit();
  }

  step(steps = 1): void {
    this.pause();
    this.cursor = advanceCursor(this.cursor, this.events.length, steps);
    const consumed = this.events.slice(0, this.cursor);
    this.lastAtMs = consumed.length > 0 ? consumed[consumed.length - 1].at_ms : 0;
    this.emit();
  }

  reset(): void {
    this.pause();
    this.cursor = 0;
    this.lastAtMs = 0;
    this.emit();
  }

  private scheduleNext(): void {
    if (!this.playing) return;
    if (this.cursor >= this.events.length) {
      this.playing = false;
      this.emit();
      return;
    }
    const next = this.events[this.cursor];
    const delay = Math.max(0, (next.at_ms - this.lastAtMs) / this.speed);
    this.timer = setTimeout(() => {
      this.lastAtMs = next.at_ms;
      this.cursor += 1;
      this.emit();
      this.scheduleNext();
    }, delay);
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
