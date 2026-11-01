import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  beginCapture,
  clearFaceReach,
  loadCalibrationState,
  loadFaceReach,
  markSkipped,
  saveBaseline,
  saveFaceReach,
  skipFaceReach,
} from '../src/pose/calibration';

/** calibration.ts guards on typeof localStorage; node tests stub it here. */
function stubStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
  });
  return store;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const BASELINE = { upperArm: 1, forearm: 1, shoulderWidth: 1 };
const FACE = {
  offsets: {
    nose: { x: 0, y: -1.0 },
    l_eye: { x: -0.2, y: -1.2 },
    mouth_l: { x: -0.15, y: -0.8 },
  },
  touchDist: 0.2,
  touchElbowDeg: 70,
};

describe('face-reach storage', () => {
  it('stores and reloads the derived numbers only', () => {
    stubStorage();
    saveBaseline(BASELINE);
    saveFaceReach(FACE);
    expect(loadFaceReach()).toEqual(FACE);
    expect(loadCalibrationState().face).toEqual(FACE);
    expect(loadCalibrationState().faceSkipped).toBe(false);
  });

  it('re-running calibration clears the face data', () => {
    stubStorage();
    saveBaseline(BASELINE);
    saveFaceReach(FACE);
    saveBaseline(BASELINE);
    expect(loadCalibrationState().baseline).toEqual(BASELINE);
    expect(loadFaceReach()).toBeNull();
  });

  it('clearing the face data does not clear the arm calibration', () => {
    stubStorage();
    saveBaseline(BASELINE);
    saveFaceReach(FACE);
    clearFaceReach();
    expect(loadCalibrationState().baseline).toEqual(BASELINE);
    expect(loadFaceReach()).toBeNull();
  });

  it('skipping the face step keeps the arm calibration and marks the skip', () => {
    stubStorage();
    saveBaseline(BASELINE);
    skipFaceReach();
    const state = loadCalibrationState();
    expect(state.baseline).toEqual(BASELINE);
    expect(state.face).toBeNull();
    expect(state.faceSkipped).toBe(true);
  });

  it('rejects the retired single-anchor shape', () => {
    stubStorage();
    saveBaseline(BASELINE);
    const retired = { anchorOffset: { x: 0, y: -0.5 }, touchDist: 0.2, touchElbowDeg: 70 };
    saveFaceReach(retired as never);
    expect(loadFaceReach()).toBeNull();
    expect(loadCalibrationState().baseline).toEqual(BASELINE);
  });

  it('begin and skip preserve stored face data', () => {
    stubStorage();
    saveBaseline(BASELINE);
    saveFaceReach(FACE);
    beginCapture();
    expect(loadFaceReach()).toEqual(FACE);
    markSkipped();
    expect(loadFaceReach()).toEqual(FACE);
  });
});
