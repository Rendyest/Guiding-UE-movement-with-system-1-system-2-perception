/**
 * Data contracts shared by the UI and the (future) perception pipeline.
 * Field names match the build brief verbatim.
 */

export interface Joint2D {
  x: number;
  y: number;
  conf: number;
}

export interface AngleReading {
  deg: number;
  conf: number;
}

export type GateReason = 'low_visibility' | 'bone_length_drift' | 'foreshortening';

const GATE_REASONS: readonly GateReason[] = ['low_visibility', 'bone_length_drift', 'foreshortening'];

export interface PoseFrame {
  t: number;
  fps: number;
  joints: Record<string, Joint2D>;
  angles: Record<string, AngleReading>;
  gate: { ok: boolean; reasons: GateReason[] };
}

export type System1StateName = 'moving_well' | 'hesitating' | 'struggling' | 'cant_see_you';

const SYSTEM1_STATES: readonly System1StateName[] = [
  'moving_well',
  'hesitating',
  'struggling',
  'cant_see_you',
];

export type TopSignal = 'stall' | 'jitter' | 'compensation' | 'failed_range' | 'drop';

const TOP_SIGNALS: readonly TopSignal[] = [
  'stall',
  'jitter',
  'compensation',
  'failed_range',
  'drop',
];

export interface System1State {
  t: number;
  state: System1StateName;
  score: number;
  /**
   * Main suspected cause. Optional (or empty) for moving_well, which has no
   * cause to name; required for every other state.
   */
  top_signal?: TopSignal;
  escalate: boolean;
}

export interface CoachEvent {
  t: number;
  trigger: string;
  latency_ms: number;
  ok: boolean;
  message: string;
  inputs: string;
}

export type ReplayEventKind = 'pose_frame' | 'system1_state' | 'coach_event';

const REPLAY_KINDS: readonly ReplayEventKind[] = ['pose_frame', 'system1_state', 'coach_event'];

export interface ReplayEvent {
  kind: ReplayEventKind;
  at_ms: number;
  data: PoseFrame | System1State | CoachEvent;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isJoint(v: unknown): v is Joint2D {
  return (
    isRecord(v) && typeof v['x'] === 'number' && typeof v['y'] === 'number' && typeof v['conf'] === 'number'
  );
}

function isAngle(v: unknown): v is AngleReading {
  return isRecord(v) && typeof v['deg'] === 'number' && typeof v['conf'] === 'number';
}

export function isPoseFrame(v: unknown): v is PoseFrame {
  if (!isRecord(v)) return false;
  if (typeof v['t'] !== 'number' || typeof v['fps'] !== 'number') return false;
  if (!isRecord(v['joints']) || !Object.values(v['joints']).every(isJoint)) return false;
  if (!isRecord(v['angles']) || !Object.values(v['angles']).every(isAngle)) return false;
  if (!isRecord(v['gate'])) return false;
  const gate = v['gate'];
  if (typeof gate['ok'] !== 'boolean' || !Array.isArray(gate['reasons'])) return false;
  const reasons: unknown[] = gate['reasons'];
  return reasons.every((r): r is GateReason => typeof r === 'string' && GATE_REASONS.includes(r as GateReason));
}

export function isSystem1State(v: unknown): v is System1State {
  if (!isRecord(v)) return false;
  if (
    typeof v['t'] !== 'number' ||
    typeof v['state'] !== 'string' ||
    !SYSTEM1_STATES.includes(v['state'] as System1StateName) ||
    typeof v['score'] !== 'number' ||
    typeof v['escalate'] !== 'boolean'
  ) {
    return false;
  }
  const top = v['top_signal'];
  if (v['state'] === 'moving_well') {
    return top === undefined || top === '' || (typeof top === 'string' && TOP_SIGNALS.includes(top as TopSignal));
  }
  return typeof top === 'string' && TOP_SIGNALS.includes(top as TopSignal);
}

export function isCoachEvent(v: unknown): v is CoachEvent {
  if (!isRecord(v)) return false;
  return (
    typeof v['t'] === 'number' &&
    typeof v['trigger'] === 'string' &&
    typeof v['latency_ms'] === 'number' &&
    typeof v['ok'] === 'boolean' &&
    typeof v['message'] === 'string' &&
    typeof v['inputs'] === 'string'
  );
}

export function isReplayEvent(v: unknown): v is ReplayEvent {
  if (!isRecord(v)) return false;
  if (typeof v['kind'] !== 'string' || !REPLAY_KINDS.includes(v['kind'] as ReplayEventKind)) return false;
  if (typeof v['at_ms'] !== 'number' || v['at_ms'] < 0) return false;
  switch (v['kind'] as ReplayEventKind) {
    case 'pose_frame':
      return isPoseFrame(v['data']);
    case 'system1_state':
      return isSystem1State(v['data']);
    case 'coach_event':
      return isCoachEvent(v['data']);
  }
}

/** Parse a replay file of shape `{ "events": [...] }`; throws naming the first bad entry. */
export function parseReplayFile(v: unknown): ReplayEvent[] {
  if (!isRecord(v) || !Array.isArray(v['events'])) {
    throw new Error('replay file must be an object with an "events" array');
  }
  const events: unknown[] = v['events'];
  return events.map((e, i) => {
    if (!isReplayEvent(e)) throw new Error(`replay file: event ${i} has an invalid shape`);
    return e;
  });
}
