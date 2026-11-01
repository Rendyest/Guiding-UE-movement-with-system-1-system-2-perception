import { describe, expect, it } from 'vitest';
import type { Joint2D } from '../src/contracts';
import {
  capturePointOffsets,
  isAtFace,
  livePointOffsets,
  measureTouch,
  minHandDistance,
  reachPresence,
  shoulderMidWidth,
  zoneRadius,
  type FaceReach,
} from '../src/pose/faceReach';

function joint(x: number, y: number, conf = 0.9): Joint2D {
  return { x, y, conf };
}

// Shoulders (0.6,0.5)/(0.4,0.5): width 0.2, midpoint (0.5,0.5).
function jointsWith(over: Record<string, Joint2D> = {}): Record<string, Joint2D> {
  return {
    r_shoulder: joint(0.6, 0.5),
    l_shoulder: joint(0.4, 0.5),
    r_wrist: joint(0.55, 0.7),
    r_index: joint(0.4, 0.31),
    nose: joint(0.5, 0.3),
    l_eye_in: joint(0.475, 0.26),
    l_eye: joint(0.46, 0.26),
    l_eye_out: joint(0.445, 0.26),
    r_eye_in: joint(0.525, 0.26),
    r_eye: joint(0.54, 0.26),
    r_eye_out: joint(0.555, 0.26),
    l_ear: joint(0.4, 0.28),
    r_ear: joint(0.6, 0.28),
    mouth_l: joint(0.47, 0.34),
    mouth_r: joint(0.53, 0.34),
    ...over,
  };
}

const STORED: FaceReach = {
  offsets: {
    nose: { x: 0, y: -1.0 },
    l_eye_in: { x: -0.125, y: -1.2 },
    l_eye: { x: -0.2, y: -1.2 },
    l_eye_out: { x: -0.275, y: -1.2 },
    r_eye_in: { x: 0.125, y: -1.2 },
    r_eye: { x: 0.2, y: -1.2 },
    r_eye_out: { x: 0.275, y: -1.2 },
    l_ear: { x: -0.5, y: -1.1 },
    r_ear: { x: 0.5, y: -1.1 },
    mouth_l: { x: -0.15, y: -0.8 },
    mouth_r: { x: 0.15, y: -0.8 },
  },
  touchDist: 0.2,
  touchElbowDeg: 70,
};

const FACE = {
  reach_margin: 0.5,
  zone_min: 0.25,
  elbow_margin_deg: 20,
  default_touch_dist: 0.2,
  default_elbow_deg: 70,
  anchor_smooth: 0.1,
};

describe('face geometry', () => {
  it('measures shoulder width and midpoint', () => {
    const sm = shoulderMidWidth(jointsWith());
    expect(sm?.mid.x).toBeCloseTo(0.5, 10);
    expect(sm?.mid.y).toBeCloseTo(0.5, 10);
    expect(sm?.mid.conf).toBe(0.9);
    expect(sm?.width).toBeCloseTo(0.2, 10);
    expect(shoulderMidWidth({})).toBeNull();
  });

  it('reports live offsets for every clear face point', () => {
    const live = livePointOffsets(jointsWith(), 0.5);
    expect(Object.keys(live?.offsets ?? {}).sort()).toEqual([
      'l_ear',
      'l_eye',
      'l_eye_in',
      'l_eye_out',
      'mouth_l',
      'mouth_r',
      'nose',
      'r_ear',
      'r_eye',
      'r_eye_in',
      'r_eye_out',
    ]);
    expect(live?.offsets['nose']?.x).toBeCloseTo(0, 10);
    expect(live?.offsets['nose']?.y).toBeCloseTo(-1.0, 10);
    expect(live?.offsets['l_eye']?.x).toBeCloseTo(-0.2, 10);
    expect(live?.offsets['mouth_l']?.x).toBeCloseTo(-0.15, 10);
    expect(livePointOffsets({}, 0.5)).toBeNull();
  });

  it('leaves unclear points out of the live offsets', () => {
    const live = livePointOffsets(jointsWith({ l_ear: joint(0.4, 0.28, 0.1) }), 0.5);
    expect('l_ear' in (live?.offsets ?? {})).toBe(false);
    expect('r_ear' in (live?.offsets ?? {})).toBe(true);
  });

  it('measures the nearest stored point to the hand', () => {
    // Hand at the left cheek: nearest is the left ear, 0.03 away -> 0.15.
    const d = minHandDistance(jointsWith(), STORED.offsets, 0.5);
    expect(d?.dist).toBeCloseTo(0.15, 10);
    expect(d?.width).toBeCloseTo(0.2, 10);
    expect(Object.keys(d?.live ?? {}).length).toBe(11);
    expect(minHandDistance({}, STORED.offsets, 0.5)).toBeNull();
    expect(minHandDistance(jointsWith(), {}, 0.5)).toBeNull();
  });

  it('derives the zone radius from the touch distance', () => {
    expect(zoneRadius(0.2, 0.5, 0.25)).toBeCloseTo(0.3, 10);
    expect(zoneRadius(0.1, 0.5, 0.25)).toBe(0.25);
  });

  it('applies the boundary and elbow conditions for at-face', () => {
    // Radius 0.3, touch elbow 70, margin 20: elbow limit 90.
    expect(isAtFace(0.295, 70, 0.3, 70, 20)).toBe(true);
    expect(isAtFace(0.3, 70, 0.3, 70, 20)).toBe(true);
    expect(isAtFace(0.305, 70, 0.3, 70, 20)).toBe(false);
    expect(isAtFace(0.15, 95, 0.3, 70, 20)).toBe(false);
    expect(isAtFace(0.15, 90, 0.3, 70, 20)).toBe(true);
  });
});

describe('setup capture', () => {
  const anchorFrames = Array.from({ length: 6 }, (_, i) => ({
    joints: jointsWith({ nose: joint(0.5 + i * 0.001, 0.3) }),
  }));

  it('captures per-point offsets over 5+ clear frames', () => {
    const offsets = capturePointOffsets(anchorFrames, 0.5);
    expect(offsets?.['nose']?.x).toBeCloseTo(0.0125, 10);
    expect(offsets?.['nose']?.y).toBeCloseTo(-1.0, 10);
    expect(offsets?.['l_eye']?.x).toBeCloseTo(-0.2, 10);
    expect(Object.keys(offsets ?? {}).length).toBe(11);
  });

  it('refuses with fewer than 5 clear frames, and drops rarely-seen points', () => {
    expect(capturePointOffsets(anchorFrames.slice(0, 4), 0.5)).toBeNull();
    expect(capturePointOffsets([], 0.5)).toBeNull();
    const sparse = anchorFrames.map((f, i) => ({
      joints: { ...f.joints, l_ear: joint(0.4, 0.28, i < 2 ? 0.9 : 0.1) },
    }));
    const offsets = capturePointOffsets(sparse, 0.5);
    expect('l_ear' in (offsets ?? {})).toBe(false);
    expect('r_ear' in (offsets ?? {})).toBe(true);
  });

  it('measures the touch as medians over the hold', () => {
    const samples = [
      { dist: 0.32, elbowDeg: 66 },
      { dist: 0.28, elbowDeg: 64 },
      { dist: 0.3, elbowDeg: 65 },
      { dist: 0.31, elbowDeg: 63 },
      { dist: 0.29, elbowDeg: 67 },
    ];
    expect(measureTouch(samples)).toEqual({ touchDist: 0.3, touchElbowDeg: 65 });
  });

  it('refuses the touch with fewer than 5 hold samples', () => {
    expect(measureTouch([{ dist: 0.3, elbowDeg: 65 }])).toBeNull();
  });
});

describe('reach presence', () => {
  it('is true at the face and false away or straight-armed', () => {
    expect(reachPresence(jointsWith(), 65, STORED, FACE, 0.5)).toBe(true);
    expect(reachPresence(jointsWith(), 150, STORED, FACE, 0.5)).toBe(false);
    const far = jointsWith({ r_index: joint(0.5, 0.9) });
    expect(reachPresence(far, 65, STORED, FACE, 0.5)).toBe(false);
  });

  it('falls back to the live points without a stored step', () => {
    expect(reachPresence(jointsWith(), 65, null, FACE, 0.5)).toBe(true);
    const far = jointsWith({ r_index: joint(0.5, 0.9) });
    expect(reachPresence(far, 65, null, FACE, 0.5)).toBe(false);
  });

  it('returns null when unscorable', () => {
    expect(reachPresence({}, 65, STORED, FACE, 0.5)).toBeNull();
    expect(reachPresence(jointsWith(), NaN, STORED, FACE, 0.5)).toBeNull();
  });
});
