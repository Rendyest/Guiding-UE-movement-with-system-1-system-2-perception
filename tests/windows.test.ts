import { describe, expect, it } from 'vitest';
import type { PoseFrame } from '../src/contracts';
import { createFrameWindow } from '../src/system1/windows';

function frame(t: number, ok: boolean): PoseFrame {
  return {
    t,
    fps: 24,
    joints: {},
    angles: {},
    gate: ok ? { ok: true, reasons: [] } : { ok: false, reasons: ['foreshortening'] },
  };
}

describe('frame window', () => {
  it('ignores gate-flagged frames', () => {
    const window = createFrameWindow(8, 3);
    window.push(frame(1, false));
    window.push(frame(2, false));
    window.push(frame(3, true));
    expect(window.cleanCount()).toBe(1);
    expect(window.ready()).toBe(false);
  });

  it('is ready once enough clean frames arrive, then yields them in order', () => {
    const window = createFrameWindow(8, 3);
    window.push(frame(1, true));
    window.push(frame(2, false));
    window.push(frame(3, true));
    window.push(frame(4, true));
    expect(window.ready()).toBe(true);
    expect(window.frames().map((f) => f.t)).toEqual([1, 3, 4]);
  });

  it('keeps only the newest window of clean frames', () => {
    const window = createFrameWindow(2, 1);
    window.push(frame(1, true));
    window.push(frame(2, true));
    window.push(frame(3, true));
    expect(window.frames().map((f) => f.t)).toEqual([2, 3]);
  });

  it('reset clears the window', () => {
    const window = createFrameWindow(8, 1);
    window.push(frame(1, true));
    window.reset();
    expect(window.cleanCount()).toBe(0);
    expect(window.ready()).toBe(false);
  });
});
