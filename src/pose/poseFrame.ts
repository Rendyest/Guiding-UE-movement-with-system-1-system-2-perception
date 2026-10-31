import type { PoseFrame } from '../contracts';
import { elbowFlexion, shoulderElevation } from './angles';
import type { Joint } from './angles';

// MediaPipe Pose landmark indices (person's right arm: 12/14/16).
export const L_SHOULDER = 11;
export const R_SHOULDER = 12;
export const L_ELBOW = 13;
export const R_ELBOW = 14;
export const L_WRIST = 15;
export const R_WRIST = 16;
export const L_HIP = 23;
export const R_HIP = 24;

export interface Point2D {
  x: number;
  y: number;
  visibility?: number;
}

/**
 * Pure builder for the live pose_frame. This is the SAME function the live
 * hook calls on every camera frame, so tests can feed it fixed fake landmark
 * data and validate the output against the mock-stream contract.
 * Missing points degrade to conf 0 rather than throwing.
 */
export function buildPoseFrame(points: Point2D[], t: number, fps: number): PoseFrame {
  const J = (i: number): Joint => {
    const p = points[i];
    if (!p) return { x: 0, y: 0, conf: 0 };
    return { x: p.x, y: p.y, conf: p.visibility ?? 0 };
  };
  const rSh = J(R_SHOULDER);
  const rEl = J(R_ELBOW);
  const rWr = J(R_WRIST);
  const flex = elbowFlexion(rSh, rEl, rWr);
  const elev = shoulderElevation(rSh, rEl);
  return {
    t,
    fps,
    joints: {
      r_shoulder: rSh,
      r_elbow: rEl,
      r_wrist: rWr,
      l_shoulder: J(L_SHOULDER),
      l_elbow: J(L_ELBOW),
      l_wrist: J(L_WRIST),
      r_hip: J(R_HIP),
      l_hip: J(L_HIP),
    },
    angles: {
      r_elbow_flexion: { deg: flex.deg, conf: flex.conf },
      r_shoulder_elevation: { deg: elev.deg, conf: elev.conf },
    },
    // The render layer merges the real gate (see pose/gate.ts, with the
    // stored calibration); live frames are provisionally OK.
    gate: { ok: true, reasons: [] },
  };
}
