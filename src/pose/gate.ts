import type { GateReason, Joint2D, PoseFrame } from '../contracts';

/** Thresholds for the per-frame quality gate. Values come from config.default.json. */
export interface GateThresholds {
  vis_min: number;
  /** Max fractional change of a scale-invariant bone length versus the median of recent history. */
  bone_length_tol: number;
  /** Minimum median projected/expected arm-bone ratio before foreshortening flags. */
  foreshortening_min: number;
  /** How many recent per-frame ratios the foreshortening median covers. */
  smooth_frames: number;
  /** How many recent scale-invariant bone lengths the drift reference covers. */
  history_frames: number;
  /** Consecutive flagged frames to enter the Can't see you state. */
  cant_see_enter_frames: number;
  /** Consecutive clean frames to leave the Can't see you state. */
  cant_see_exit_frames: number;
}

/** Calibrated baselines: 2D bone lengths captured while the person faces the camera. */
export interface BoneBaseline {
  upperArm: number;
  forearm: number;
  shoulderWidth: number;
}

/**
 * Joints the gate needs clearly visible: the working arm (right shoulder,
 * elbow, wrist) plus the left shoulder, which anchors the per-frame scale
 * estimate. The hips stay out of every gate and calibration check — a seated
 * person with arms resting on the table can still calibrate.
 */
export const GATE_JOINTS: readonly string[] = ['r_shoulder', 'r_elbow', 'r_wrist'];
const SCALE_JOINT = 'l_shoulder';

/** Human wording for each gate reason, shown next to the badge (never colour alone). */
export const GATE_REASON_TEXT: Record<GateReason, string> = {
  low_visibility: 'low visibility',
  bone_length_drift: 'tracking unstable',
  foreshortening: 'arm pointing toward the camera',
};

export function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Tolerance keeping "exactly at the limit passes" true under float
 * arithmetic: e.g. 130/100 is 0.30000000000000004 in binary, a hair above a
 * 0.3 limit.
 */
const EPS = 1e-9;

/**
 * Current bone lengths from a frame's joints. Null when an endpoint is
 * missing or a bone collapses to zero (nothing to compare against).
 */
export function boneLengths(joints: Record<string, Joint2D>): BoneBaseline | null {
  const rs = joints['r_shoulder'];
  const re = joints['r_elbow'];
  const rw = joints['r_wrist'];
  const ls = joints['l_shoulder'];
  if (!rs || !re || !rw || !ls) return null;
  const upperArm = dist(rs, re);
  const forearm = dist(re, rw);
  const shoulderWidth = dist(ls, rs);
  if (!(upperArm > 0) || !(forearm > 0) || !(shoulderWidth > 0)) return null;
  return { upperArm, forearm, shoulderWidth };
}

/** Rolling per-frame values the gate compares against. Oldest first; capped by the tracker. */
export interface GateHistories {
  upperArmRatios: number[];
  forearmRatios: number[];
  upperArmNorms: number[];
  forearmNorms: number[];
}

export function emptyHistories(): GateHistories {
  return { upperArmRatios: [], forearmRatios: [], upperArmNorms: [], forearmNorms: [] };
}

/** Standard median (averages the two middle values for even counts). Null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface GateResult {
  ok: boolean;
  reasons: GateReason[];
  /**
   * Per-frame scale estimate (shoulder_width_now / shoulder_width_baseline),
   * present when a baseline exists and the shoulders are measurable.
   * Informational only: never gated on, never shown.
   */
  scale?: number;
}

interface GateMeasurements {
  scale?: number;
  upperArmRatio?: number;
  forearmRatio?: number;
  upperArmNorm?: number;
  forearmNorm?: number;
}

/**
 * Scale-corrected ratios (against the calibration baseline) and
 * scale-invariant lengths (against the current shoulder width, no baseline
 * needed) for one frame. Null when the bones are not measurable.
 */
function measureFrame(
  joints: Record<string, Joint2D>,
  baseline: BoneBaseline | null,
): GateMeasurements | null {
  const current = boneLengths(joints);
  if (!current) return null;
  const out: GateMeasurements = {
    upperArmNorm: current.upperArm / current.shoulderWidth,
    forearmNorm: current.forearm / current.shoulderWidth,
  };
  if (baseline && baseline.shoulderWidth > 0) {
    const scale = current.shoulderWidth / baseline.shoulderWidth;
    out.scale = scale;
    if (baseline.upperArm > 0) out.upperArmRatio = current.upperArm / (scale * baseline.upperArm);
    if (baseline.forearm > 0) out.forearmRatio = current.forearm / (scale * baseline.forearm);
  }
  return out;
}

/**
 * Per-frame quality gate. Camera distance is normalised out twice: scale is
 * estimated per frame from shoulder width for the baseline comparison, and
 * the drift check compares scale-invariant lengths against recent history,
 * so a slow pose change (forearms settling onto a table) never flags —
 * only a sudden tracking jump does. A frame exactly at a threshold still
 * passes — only strictly worse values flag. Without a calibration baseline
 * only the visibility and drift checks run, so the gate is less reliable
 * (the caller says so).
 */
export function checkGate(
  joints: Record<string, Joint2D>,
  baseline: BoneBaseline | null,
  t: GateThresholds,
  hist: GateHistories,
): GateResult {
  const reasons: GateReason[] = [];

  let lowVisibility = false;
  for (const name of [...GATE_JOINTS, SCALE_JOINT]) {
    const joint = joints[name];
    if (!joint || !(joint.conf >= t.vis_min)) {
      lowVisibility = true;
      break;
    }
  }
  if (lowVisibility) reasons.push('low_visibility');

  // The scale estimate (and everything built on it) needs a clearly visible
  // left shoulder. Arm-only visibility failures still get scale checks, so a
  // single frame can report both low_visibility and a shape reason.
  const leftShoulder = joints[SCALE_JOINT];
  const shouldersOk = !!leftShoulder && leftShoulder.conf >= t.vis_min;

  let scale: number | undefined;
  const meas = shouldersOk ? measureFrame(joints, baseline) : null;
  if (meas) {
    scale = meas.scale;
    if (meas.upperArmRatio !== undefined || meas.forearmRatio !== undefined) {
      const ratios: ReadonlyArray<number | undefined> = [meas.upperArmRatio, meas.forearmRatio];
      const windows: ReadonlyArray<readonly number[]> = [hist.upperArmRatios, hist.forearmRatios];
      let short = false;
      for (let i = 0; i < ratios.length; i++) {
        const ratio = ratios[i];
        if (ratio === undefined) continue;
        // A bone pointing out of the image plane by angle phi projects to
        // roughly cos(phi) of its true length. The median over recent frames
        // keeps a single glitchy frame from flipping the gate.
        const smoothed = median([...windows[i].slice(-t.smooth_frames), ratio].slice(-t.smooth_frames));
        if (smoothed !== null && t.foreshortening_min - smoothed > EPS) short = true;
      }
      if (short) reasons.push('foreshortening');
    }
    const norms: ReadonlyArray<number | undefined> = [meas.upperArmNorm, meas.forearmNorm];
    const histories: ReadonlyArray<readonly number[]> = [hist.upperArmNorms, hist.forearmNorms];
    let drift = false;
    for (let i = 0; i < norms.length; i++) {
      const now = norms[i];
      if (now === undefined || histories[i].length < 3) continue;
      const ref = median(histories[i]);
      // A projected bone cannot be longer than its true length, but norms
      // are scale-invariant, so EITHER direction past the limit means the
      // landmarks jumped — slow pose changes move the history along with
      // the body and never flag.
      if (ref !== null && ref > 0 && Math.abs(now - ref) / ref - t.bone_length_tol > EPS) drift = true;
    }
    if (drift) reasons.push('bone_length_drift');
  }

  const result: GateResult = { ok: reasons.length === 0, reasons };
  if (scale !== undefined) result.scale = scale;
  return result;
}

export interface GateTracker {
  /** Evaluate one frame, advancing the histories unless visibility failed. */
  push(joints: Record<string, Joint2D>, baseline: BoneBaseline | null): GateResult;
  /** Drop all history (source switch, camera stop, (re)calibration, baseline clear). */
  reset(): void;
  /** A copy of the current histories, for tests and dev diagnostics. */
  snapshot(): GateHistories;
}

/** Cap a history to its newest `cap` values. */
function trim(values: number[], cap: number): number[] {
  return values.length > cap ? values.slice(values.length - cap) : values;
}

export function createGateTracker(t: GateThresholds): GateTracker {
  let hist = emptyHistories();
  return {
    push(joints, baseline) {
      const result = checkGate(joints, baseline, t, hist);
      if (!result.reasons.includes('low_visibility')) {
        const meas = measureFrame(joints, baseline);
        if (meas) {
          if (meas.upperArmRatio !== undefined) {
            hist.upperArmRatios = trim([...hist.upperArmRatios, meas.upperArmRatio], t.smooth_frames);
          }
          if (meas.forearmRatio !== undefined) {
            hist.forearmRatios = trim([...hist.forearmRatios, meas.forearmRatio], t.smooth_frames);
          }
          if (meas.upperArmNorm !== undefined) {
            hist.upperArmNorms = trim([...hist.upperArmNorms, meas.upperArmNorm], t.history_frames);
          }
          if (meas.forearmNorm !== undefined) {
            hist.forearmNorms = trim([...hist.forearmNorms, meas.forearmNorm], t.history_frames);
          }
        }
      }
      return result;
    },
    reset() {
      hist = emptyHistories();
    },
    snapshot() {
      return {
        upperArmRatios: [...hist.upperArmRatios],
        forearmRatios: [...hist.forearmRatios],
        upperArmNorms: [...hist.upperArmNorms],
        forearmNorms: [...hist.forearmNorms],
      };
    },
  };
}

/**
 * Merge a computed gate into the pipeline frame's own gate. Flags are only
 * ever added, never removed, so a stored replay flag survives even when the
 * local check passes.
 */
export function mergeGate(frame: PoseFrame, computed: GateResult): PoseFrame {
  if (computed.ok) return frame;
  const reasons = [...frame.gate.reasons];
  for (const reason of computed.reasons) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  return { ...frame, gate: { ok: false, reasons } };
}

/**
 * Stateless helper: evaluate one frame against (by default) empty histories
 * and merge the result into the frame's own gate.
 */
export function applyGate(
  frame: PoseFrame,
  baseline: BoneBaseline | null,
  t: GateThresholds,
  hist: GateHistories = emptyHistories(),
): PoseFrame {
  return mergeGate(frame, checkGate(frame.joints, baseline, t, hist));
}
