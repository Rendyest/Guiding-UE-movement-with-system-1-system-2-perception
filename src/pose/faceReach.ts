import type { Joint2D } from '../contracts';
import type { AppConfig } from '../config';

/**
 * Face-reach geometry for the reach-and-hold detector. The face zone is the
 * NEAREST stored face point: each point is kept as an OFFSET from the
 * shoulder midpoint, in shoulder widths, so the points follow body movement
 * and camera scale. Only derived numbers are ever stored — no frames, no
 * images, nothing sent anywhere.
 */

export interface PointOffset {
  x: number;
  y: number;
}

export type PointOffsets = Record<string, PointOffset>;

/** Upper- and lower-face Pose points used for the zone, by joint name. */
export const FACE_POINT_NAMES: readonly string[] = [
  'nose',
  'l_eye_in',
  'l_eye',
  'l_eye_out',
  'r_eye_in',
  'r_eye',
  'r_eye_out',
  'l_ear',
  'r_ear',
  'mouth_l',
  'mouth_r',
];

export interface FaceReach {
  offsets: PointOffsets;
  touchDist: number;
  touchElbowDeg: number;
}

function isOffset(v: unknown): v is PointOffset {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return Number.isFinite(o['x']) && Number.isFinite(o['y']);
}

export function isFaceReach(v: unknown): v is FaceReach {
  if (typeof v !== 'object' || v === null) return false;
  const f = v as Record<string, unknown>;
  const offsets = f['offsets'];
  if (typeof offsets !== 'object' || offsets === null || Array.isArray(offsets)) return false;
  const entries = Object.values(offsets as Record<string, unknown>);
  if (entries.length === 0 || !entries.every(isOffset)) return false;
  return (
    typeof f['touchDist'] === 'number' &&
    Number.isFinite(f['touchDist']) &&
    (f['touchDist'] as number) > 0 &&
    typeof f['touchElbowDeg'] === 'number' &&
    Number.isFinite(f['touchElbowDeg'])
  );
}

/** Same float tolerance as pose/gate.ts: exactly at a boundary still passes. */
const EPS = 1e-9;

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Right-to-left shoulder midpoint and width. Null when not measurable. */
export function shoulderMidWidth(joints: Record<string, Joint2D>): { mid: Joint2D; width: number } | null {
  const rs = joints['r_shoulder'];
  const ls = joints['l_shoulder'];
  if (!rs || !ls) return null;
  const width = dist(rs, ls);
  if (!(width > 0)) return null;
  return {
    mid: { x: (rs.x + ls.x) / 2, y: (rs.y + ls.y) / 2, conf: Math.min(rs.conf, ls.conf) },
    width,
  };
}

/**
 * Hand point: right index fingertip when clearly visible, otherwise the
 * right wrist (the gate already judged the wrist on clean frames).
 */
export function handPoint(joints: Record<string, Joint2D>, visMin: number): Joint2D | null {
  const index = joints['r_index'];
  if (index && index.conf >= visMin) return { ...index };
  const wrist = joints['r_wrist'];
  if (!wrist) return null;
  return { ...wrist };
}

/**
 * Live offsets for every currently clear face point (shoulder midpoint as
 * the origin, shoulder widths as the unit). Points below the visibility
 * threshold are left out — the caller decides what that means.
 */
export function livePointOffsets(
  joints: Record<string, Joint2D>,
  visMin: number,
): { offsets: PointOffsets; width: number } | null {
  const sm = shoulderMidWidth(joints);
  if (!sm) return null;
  const offsets: PointOffsets = {};
  for (const name of FACE_POINT_NAMES) {
    const joint = joints[name];
    if (!joint || !(joint.conf >= visMin)) continue;
    offsets[name] = { x: (joint.x - sm.mid.x) / sm.width, y: (joint.y - sm.mid.y) / sm.width };
  }
  return { offsets, width: sm.width };
}

export interface NearestDistance {
  /** Normalised distance to the nearest stored face point, in shoulder widths. */
  dist: number;
  /** Shoulder width of this frame (image units). */
  width: number;
  /** Live offsets behind this distance (for the slow refresh). */
  live: PointOffsets;
}

/**
 * Nearest stored face point to the hand, in shoulder widths. Returns null
 * when the hand, the shoulders, or every stored point is missing — the
 * caller skips the frame instead of scoring it.
 */
export function minHandDistance(
  joints: Record<string, Joint2D>,
  offsets: PointOffsets,
  visMin: number,
): NearestDistance | null {
  const sm = shoulderMidWidth(joints);
  const hand = handPoint(joints, visMin);
  const live = livePointOffsets(joints, visMin);
  if (!sm || !hand || !live) return null;
  let best: number | null = null;
  for (const offset of Object.values(offsets)) {
    const point = { x: sm.mid.x + offset.x * sm.width, y: sm.mid.y + offset.y * sm.width };
    const d = dist(hand, point) / sm.width;
    if (best === null || d < best) best = d;
  }
  if (best === null) return null;
  return { dist: best, width: sm.width, live: live.offsets };
}

/** Zone radius from the touch distance: max(touch*(1+margin), min). */
export function zoneRadius(touchDist: number, reachMargin: number, zoneMin: number): number {
  return Math.max(touchDist * (1 + reachMargin), zoneMin);
}

/** "At face" needs BOTH: inside the zone AND the elbow bent near the touch pose. */
export function isAtFace(
  normDist: number,
  elbowDeg: number,
  radius: number,
  touchElbowDeg: number,
  elbowMarginDeg: number,
): boolean {
  return normDist - radius <= EPS && elbowDeg <= touchElbowDeg + elbowMarginDeg + EPS;
}

/**
 * Setup capture (part 1): median live offset per face point over the clear
 * frames. A point joins the stored set only with at least 5 clear samples;
 * null when no point qualifies — the caller names what to fix.
 */
export function capturePointOffsets(
  frames: { joints: Record<string, Joint2D> }[],
  visMin: number,
): PointOffsets | null {
  const xs: Record<string, number[]> = {};
  const ys: Record<string, number[]> = {};
  for (const frame of frames) {
    const live = livePointOffsets(frame.joints, visMin);
    if (!live) continue;
    for (const [name, off] of Object.entries(live.offsets)) {
      (xs[name] ??= []).push(off.x);
      (ys[name] ??= []).push(off.y);
    }
  }
  const offsets: PointOffsets = {};
  for (const name of Object.keys(xs)) {
    const samples = xs[name];
    if (samples.length < 5) continue;
    const mx = median(samples);
    const my = median(ys[name]);
    if (mx === null || my === null) continue;
    offsets[name] = { x: mx, y: my };
  }
  return Object.keys(offsets).length > 0 ? offsets : null;
}

export interface TouchMeasurement {
  touchDist: number;
  touchElbowDeg: number;
}

/**
 * Touch measurement (setup step, part 2): median nearest-point distance over
 * the hold, and the median elbow angle. Null when fewer than 5 hold samples
 * carry a distance — the caller names what to fix.
 */
export function measureTouch(samples: { dist: number; elbowDeg: number }[]): TouchMeasurement | null {
  const dists = samples.map((s) => s.dist).filter((d) => Number.isFinite(d));
  const elbows = samples.map((s) => s.elbowDeg).filter((e) => Number.isFinite(e));
  if (dists.length < 5 || elbows.length < 5) return null;
  const touchDist = median(dists);
  const touchElbowDeg = median(elbows);
  if (touchDist === null || touchElbowDeg === null) return null;
  return { touchDist, touchElbowDeg };
}

/**
 * Aggregate reach presence for one clean frame: true when the hand is at
 * the face, false when it measurably is not, null when unscorable (no
 * hand, no shoulders, no usable points, or a bent-elbow reading missing).
 * Stored offsets win; without a stored step the live points stand in so a
 * skipped setup still reports honestly.
 */
export function reachPresence(
  joints: Record<string, Joint2D>,
  elbowDeg: number,
  stored: FaceReach | null,
  face: AppConfig['face'],
  visMin: number,
): boolean | null {
  if (!Number.isFinite(elbowDeg)) return null;
  const sm = shoulderMidWidth(joints);
  const hand = handPoint(joints, visMin);
  if (!sm || !hand) return null;
  const live = livePointOffsets(joints, visMin);
  if (!live) return null;
  const offsets = stored?.offsets ?? live.offsets;
  if (Object.keys(offsets).length === 0) return null;
  const touchDist = stored?.touchDist ?? face.default_touch_dist;
  const touchElbowDeg = stored?.touchElbowDeg ?? face.default_elbow_deg;
  const radius = zoneRadius(touchDist, face.reach_margin, face.zone_min);
  let best: number | null = null;
  for (const offset of Object.values(offsets)) {
    const point = { x: sm.mid.x + offset.x * sm.width, y: sm.mid.y + offset.y * sm.width };
    const d = dist(hand, point) / sm.width;
    if (best === null || d < best) best = d;
  }
  if (best === null) return null;
  return isAtFace(best, elbowDeg, radius, touchElbowDeg, face.elbow_margin_deg);
}
