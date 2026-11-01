import type { PoseFrame } from '../contracts';
import { elbowFlexion, shoulderElevation } from './angles';
import type { Joint } from './angles';

// MediaPipe Pose landmark indices (person's right arm: 12/14/16; face:
// 0-10; right index fingertip: 20). Verified against the pose_landmarker
// guide for the pinned tasks-vision 0.10.14 model family: 0 nose, 1/2/3 left
// eye inner/center/outer, 4/5/6 right eye inner/center/outer, 7 left ear,
// 8 right ear, 9 mouth left, 10 mouth right, 11/12 shoulders, 14 right elbow,
// 16 right wrist, 19 left index, 20 right index. The 33-landmark topology is
// fixed for pose_landmarker_lite, so these hold for the pinned version.
export const NOSE = 0;
export const L_EYE_IN = 1;
export const L_EYE = 2;
export const L_EYE_OUT = 3;
export const R_EYE_IN = 4;
export const R_EYE = 5;
export const R_EYE_OUT = 6;
export const L_EAR = 7;
export const R_EAR = 8;
export const MOUTH_L = 9;
export const MOUTH_R = 10;
export const L_SHOULDER = 11;
export const R_SHOULDER = 12;
export const L_ELBOW = 13;
export const R_ELBOW = 14;
export const L_WRIST = 15;
export const R_WRIST = 16;
export const R_INDEX = 20;
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
      // Face points for the reach-and-hold detector. NOT part of the
      // quality gate: the gate stays arm-only (see pose/gate.ts).
      nose: J(NOSE),
      l_eye_in: J(L_EYE_IN),
      l_eye: J(L_EYE),
      l_eye_out: J(L_EYE_OUT),
      r_eye_in: J(R_EYE_IN),
      r_eye: J(R_EYE),
      r_eye_out: J(R_EYE_OUT),
      l_ear: J(L_EAR),
      r_ear: J(R_EAR),
      mouth_l: J(MOUTH_L),
      mouth_r: J(MOUTH_R),
      r_index: J(R_INDEX),
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
