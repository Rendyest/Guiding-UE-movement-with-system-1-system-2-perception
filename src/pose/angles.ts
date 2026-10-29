/**
 * Pure 2D angle math for the working arm. No MediaPipe imports here, so these
 * functions run identically on live landmarks and on mock fixtures (and in tests).
 *
 * Conventions (image coordinates, y grows downward — the sign cancels out):
 * - elbow flexion: interior angle at the elbow. Straight arm = 180, fully bent -> small.
 * - shoulder elevation: angle at the shoulder between the upper arm
 *   (shoulder -> elbow) and the torso-down direction (shoulder -> hip).
 *   0 = arm hanging at the side, 90 = arm horizontal, 180 = arm overhead.
 */

export interface XY {
  x: number;
  y: number;
}

export interface Joint extends XY {
  conf: number;
}

export interface AngleResult {
  deg: number;
  conf: number;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Interior angle at vertex `b` in degrees, rounded to 1 decimal. NaN when degenerate. */
export function angleAtVertex(a: XY, b: XY, c: XY): number {
  const ux = a.x - b.x;
  const uy = a.y - b.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const nu = Math.hypot(ux, uy);
  const nv = Math.hypot(vx, vy);
  if (nu < 1e-9 || nv < 1e-9) return NaN;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (nu * nv)));
  return round1((Math.acos(cos) * 180) / Math.PI);
}

function minConf(...confs: number[]): number {
  return Math.min(...confs);
}

export function elbowFlexion(shoulder: Joint, elbow: Joint, wrist: Joint): AngleResult {
  return { deg: angleAtVertex(shoulder, elbow, wrist), conf: minConf(shoulder.conf, elbow.conf, wrist.conf) };
}

export function shoulderElevation(shoulder: Joint, elbow: Joint, hip: Joint): AngleResult {
  return { deg: angleAtVertex(elbow, shoulder, hip), conf: minConf(shoulder.conf, elbow.conf, hip.conf) };
}

/**
 * Whether a joint counts as low-confidence for drawing. Strictly below the
 * threshold: a joint exactly at the threshold is still drawn normally.
 * Flagged joints are dimmed/dashed, never dropped (see drawList).
 */
export function isLowConfidence(conf: number, threshold: number): boolean {
  return conf < threshold;
}
