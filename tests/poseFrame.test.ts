import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isPoseFrame } from '../src/contracts';
import { buildPoseFrame } from '../src/pose/poseFrame';
import type { Point2D } from '../src/pose/poseFrame';

// Fixed fake landmarks (indices per MediaPipe Pose). Hand-checkable:
// R_SHOULDER(12)=(0,0), R_ELBOW(14)=(1,0), R_WRIST(16)=(1,1) -> flexion 90;
// R_HIP(24)=(0,1) -> elevation of (1,0) against (0,1) is 90.
function fakeLandmarks(): Point2D[] {
  const pts: Point2D[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  pts[12] = { x: 0, y: 0, visibility: 0.9 };
  pts[14] = { x: 1, y: 0, visibility: 0.9 };
  pts[16] = { x: 1, y: 1, visibility: 0.9 };
  pts[24] = { x: 0, y: 1, visibility: 0.9 };
  pts[11] = { x: -0.5, y: 0, visibility: 0.9 };
  pts[13] = { x: -1, y: 0.2, visibility: 0.9 };
  pts[15] = { x: -1, y: 1, visibility: 0.9 };
  return pts;
}

describe('buildPoseFrame', () => {
  it('produces output the mock-stream validator accepts', () => {
    expect(isPoseFrame(buildPoseFrame(fakeLandmarks(), 1.5, 24))).toBe(true);
  });

  it('computes the hand-checkable angles (90 and 90, conf 0.9)', () => {
    const frame = buildPoseFrame(fakeLandmarks(), 1.5, 24);
    expect(frame.angles['r_elbow_flexion']).toEqual({ deg: 90, conf: 0.9 });
    expect(frame.angles['r_shoulder_elevation']).toEqual({ deg: 90, conf: 0.9 });
  });

  it('has the same top-level keys as a mock pose_frame, with gate ok', () => {
    const raw = readFileSync(new URL('../public/mock-stream.json', import.meta.url), 'utf-8');
    const mock = (JSON.parse(raw) as { events: { kind: string; data: object }[] }).events.find(
      (e) => e.kind === 'pose_frame',
    )?.data as Record<string, unknown>;
    const live = buildPoseFrame(fakeLandmarks(), 1.5, 24) as unknown as Record<string, unknown>;
    expect(Object.keys(live).sort()).toEqual(Object.keys(mock).sort());
    // Live emits more joints (both arms); every mock joint/angle key is present.
    for (const key of Object.keys(mock['joints'] as object)) {
      expect(live['joints'] as object).toHaveProperty(key);
    }
    for (const key of Object.keys(mock['angles'] as object)) {
      expect(live['angles'] as object).toHaveProperty(key);
    }
    expect(live['gate']).toEqual({ ok: true, reasons: [] });
  });

  it('degrades missing points to conf 0 instead of throwing', () => {
    const frame = buildPoseFrame([], 0, 0);
    expect(isPoseFrame(frame)).toBe(true);
    expect(frame.joints['r_elbow']?.conf).toBe(0);
  });
});
