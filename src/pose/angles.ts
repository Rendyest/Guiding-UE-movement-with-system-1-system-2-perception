/**
 * Pure 2D angle math for the working arm. No MediaPipe imports here, so these
 * functions run identically on live landmarks and on mock fixtures (and in tests).
 *
 * Conventions (image coordinates, y grows downward — the sign cancels out):
 * - elbow flexion: interior angle at the elbow. Straight arm = 180, fully bent -> small.
 * - shoulder elevation: angle at the shoulder between the upper arm
 *   (shoulder -> elbow) and the image vertical (straight down in the picture).
 *   0 = arm hanging at the side, 90 = arm horizontal, 180 = arm overhead.
 *   The reference is the image vertical, not the torso — assumes a roughly
 *   level camera and an upright seat; trunk lean is read as arm movement.
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

/**
 * Shoulder elevation against the image vertical: the third point sits directly
 * below the shoulder, so no hip landmark is needed and the hip affects
 * neither the angle nor the confidence.
 */
export function shoulderElevation(shoulder: Joint, elbow: Joint): AngleResult {
  const down: XY = { x: shoulder.x, y: shoulder.y + 1 };
  return { deg: angleAtVertex(elbow, shoulder, down), conf: minConf(shoulder.conf, elbow.conf) };
}

/**
 * Whether a joint counts as low-confidence for drawing. Strictly below the
 * threshold: a joint exactly at the threshold is still drawn normally.
 * Flagged joints are dimmed/dashed, never dropped (see drawList).
 */
export function isLowConfidence(conf: number, threshold: number): boolean {
  return conf < threshold;
}
