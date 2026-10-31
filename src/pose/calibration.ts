import { useEffect, useState } from 'react';
import type { PoseFrame } from '../contracts';
import { boneLengths, GATE_JOINTS, type BoneBaseline } from './gate';

/** Capture window for the setup calibration step ("about 2 s"). */
export const CALIBRATION_CAPTURE_MS = 2000;

/** Minimum clear views inside the capture window for a passing calibration. */
export const CALIBRATION_MIN_SAMPLES = 5;

const STORAGE_KEY = 'mirra.calibration.v1';

export interface CalibrationState {
  baseline: BoneBaseline | null;
  skipped: boolean;
}

function isBaseline(v: unknown): v is BoneBaseline {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b['upperArm'] === 'number' &&
    Number.isFinite(b['upperArm']) &&
    (b['upperArm'] as number) > 0 &&
    typeof b['forearm'] === 'number' &&
    Number.isFinite(b['forearm']) &&
    (b['forearm'] as number) > 0 &&
    typeof b['shoulderWidth'] === 'number' &&
    Number.isFinite(b['shoulderWidth']) &&
    (b['shoulderWidth'] as number) > 0
  );
}

/** Read the stored calibration. Safe on the server and in tests: no storage, no baseline. */
export function loadCalibrationState(): CalibrationState {
  const empty: CalibrationState = { baseline: null, skipped: false };
  try {
    if (typeof localStorage === 'undefined') return empty;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as { baseline?: unknown; skipped?: unknown };
    return {
      baseline: isBaseline(parsed.baseline) ? parsed.baseline : null,
      skipped: parsed.skipped === true,
    };
  } catch {
    return empty;
  }
}

function writeCalibrationState(state: CalibrationState): CalibrationState {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // Private mode or quota: the in-memory state still works for this visit.
  }
  return state;
}

export function saveBaseline(baseline: BoneBaseline): CalibrationState {
  return writeCalibrationState({ baseline, skipped: false });
}

/** The person chose to continue without calibrating; the gate stays less reliable. */
export function markSkipped(): CalibrationState {
  const current = loadCalibrationState();
  return writeCalibrationState({ baseline: current.baseline, skipped: true });
}

/** Starting (or retrying) a capture clears the skipped flag but keeps any baseline. */
export function beginCapture(): CalibrationState {
  const current = loadCalibrationState();
  return writeCalibrationState({ baseline: current.baseline, skipped: false });
}

export function clearCalibration(): CalibrationState {
  return writeCalibrationState({ baseline: null, skipped: false });
}

/** Every joint calibration needs: the working arm plus the left shoulder that anchors scale. */
const CALIBRATION_JOINTS: readonly string[] = [...GATE_JOINTS, 'l_shoulder'];

/**
 * Average the bone lengths over the clear views in a capture: every needed
 * joint visible (exactly at the threshold counts) and measurable bones. Null
 * when too few views are clear — the caller reports a failed calibration.
 */
export function calibrateFrames(frames: PoseFrame[], visMin: number): BoneBaseline | null {
  const samples: BoneBaseline[] = [];
  for (const frame of frames) {
    let visible = true;
    for (const name of CALIBRATION_JOINTS) {
      const joint = frame.joints[name];
      if (!joint || !(joint.conf >= visMin)) {
        visible = false;
        break;
      }
    }
    if (!visible) continue;
    const bones = boneLengths(frame.joints);
    if (bones) samples.push(bones);
  }
  if (samples.length < CALIBRATION_MIN_SAMPLES) return null;
  const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length;
  return {
    upperArm: mean(samples.map((s) => s.upperArm)),
    forearm: mean(samples.map((s) => s.forearm)),
    shoulderWidth: mean(samples.map((s) => s.shoulderWidth)),
  };
}

export const GATE_JOINT_LABELS: Record<string, string> = {
  r_shoulder: 'right shoulder',
  r_elbow: 'right elbow',
  r_wrist: 'right wrist',
  l_shoulder: 'left shoulder',
};

/**
 * Joints that are unclear in most of the captured samples. Used to tell
 * the person what to fix (usually framing or lighting on the shoulders
 * and working arm).
 */
export function unclearJoints(frames: PoseFrame[], visMin: number): string[] {
  if (frames.length === 0) return [...CALIBRATION_JOINTS];
  return CALIBRATION_JOINTS.filter((name) => {
    const clear = frames.filter((frame) => {
      const joint = frame.joints[name];
      return !!joint && joint.conf >= visMin;
    }).length;
    return clear < frames.length / 2;
  });
}

/** Shared calibration state for /setup (writes) and /session (reads the baseline). */
export function useCalibration() {
  const [state, setState] = useState<CalibrationState>(() => loadCalibrationState());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (!e.key || e.key === STORAGE_KEY) setState(loadCalibrationState());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return {
    state,
    save: (baseline: BoneBaseline) => setState(saveBaseline(baseline)),
    skip: () => setState(markSkipped()),
    begin: () => setState(beginCapture()),
    clear: () => setState(clearCalibration()),
    refresh: () => setState(loadCalibrationState()),
  };
}
