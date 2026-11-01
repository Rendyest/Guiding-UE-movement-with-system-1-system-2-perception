import { describe, expect, it } from 'vitest';
import { createCantSeeYouTracker } from '../src/system1/cantSeeYou';

describe('cant-see-you tracker', () => {
  it('stays clear until the enter count of consecutive flagged frames', () => {
    const tracker = createCantSeeYouTracker(3, 5);
    expect(tracker.push(false, ['low_visibility']).active).toBe(false);
    expect(tracker.push(false, ['foreshortening']).active).toBe(false);
    const entered = tracker.push(false, ['foreshortening']);
    expect(entered.active).toBe(true);
    expect(entered.fixLine).toBe('Try keeping your forearm across the camera view, not pointing at it.');
  });

  it('shows the first fix line in gate order when several reasons apply', () => {
    const tracker = createCantSeeYouTracker(1, 1);
    const entered = tracker.push(false, ['bone_length_drift', 'low_visibility']);
    expect(entered.fixLine).toBe('Keep your arm in view of the camera.');
  });

  it('stays active until the exit count of consecutive clean frames', () => {
    const tracker = createCantSeeYouTracker(2, 3);
    tracker.push(false, ['low_visibility']);
    tracker.push(false, ['low_visibility']);
    expect(tracker.snapshot().active).toBe(true);
    tracker.push(true, []);
    tracker.push(true, []);
    expect(tracker.snapshot().active).toBe(true);
    const left = tracker.push(true, []);
    expect(left.active).toBe(false);
    expect(left.fixLine).toBeNull();
  });

  it('resets a flagged streak on the first clean frame', () => {
    const tracker = createCantSeeYouTracker(3, 5);
    tracker.push(false, ['low_visibility']);
    tracker.push(false, ['low_visibility']);
    tracker.push(true, []);
    tracker.push(false, ['low_visibility']);
    tracker.push(false, ['low_visibility']);
    expect(tracker.snapshot().active).toBe(false);
  });

  it('reset clears the state', () => {
    const tracker = createCantSeeYouTracker(1, 5);
    tracker.push(false, ['low_visibility']);
    tracker.reset();
    expect(tracker.snapshot()).toEqual({ active: false, fixLine: null });
  });
});
