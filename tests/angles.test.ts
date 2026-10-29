import { describe, expect, it } from 'vitest';
import { angleAtVertex, elbowFlexion, shoulderElevation } from '../src/pose/angles';
import type { Joint } from '../src/pose/angles';

function j(x: number, y: number, conf = 0.9): Joint {
  return { x, y, conf };
}

describe('angleAtVertex', () => {
  it('gives exactly 90 for a right angle: (0,0), (1,0), (1,1)', () => {
    expect(angleAtVertex({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })).toBe(90);
  });

  it('gives exactly 180 for a straight line: (0,0), (1,0), (2,0)', () => {
    expect(angleAtVertex({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toBe(180);
  });

  it('gives 45 for a diagonal: (1,0), (0,0), (1,1)', () => {
    expect(angleAtVertex({ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(45);
  });

  it('gives NaN when a segment has zero length', () => {
    expect(Number.isNaN(angleAtVertex({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 1 }))).toBe(true);
  });
});

describe('elbowFlexion', () => {
  it('gives exactly 90 for shoulder (0,0), elbow (1,0), wrist (1,1)', () => {
    const r = elbowFlexion(j(0, 0), j(1, 0), j(1, 1));
    expect(r.deg).toBe(90);
    expect(r.conf).toBe(0.9);
  });

  it('gives exactly 180 for a straight arm: (0,0), (1,0), (2,0)', () => {
    expect(elbowFlexion(j(0, 0), j(1, 0), j(2, 0)).deg).toBe(180);
  });

  it('carries the weakest joint confidence', () => {
    const r = elbowFlexion(j(0, 0, 0.95), j(1, 0, 0.4), j(1, 1, 0.8));
    expect(r.deg).toBe(90);
    expect(r.conf).toBe(0.4);
  });
});

describe('shoulderElevation', () => {
  // Shoulder at origin, hip straight down (image coords): hanging arm = 0.
  it('gives 0 when the arm hangs: elbow (0,2) below shoulder (0,0), hip (0,1)', () => {
    expect(shoulderElevation(j(0, 0), j(0, 2), j(0, 1)).deg).toBe(0);
  });

  it('gives 90 when the arm is horizontal: elbow (2,0)', () => {
    expect(shoulderElevation(j(0, 0), j(2, 0), j(0, 1)).deg).toBe(90);
  });

  it('gives 180 when the arm is overhead: elbow (0,-2)', () => {
    expect(shoulderElevation(j(0, 0), j(0, -2), j(0, 1)).deg).toBe(180);
  });

  it('carries the weakest joint confidence', () => {
    const r = shoulderElevation(j(0, 0, 0.9), j(2, 0, 0.7), j(0, 1, 0.85));
    expect(r.deg).toBe(90);
    expect(r.conf).toBe(0.7);
  });
});
