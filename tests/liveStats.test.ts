import { describe, expect, it } from 'vitest';
import { publishLiveStats, subscribeLiveStats } from '../src/pose/liveStats';

describe('liveStats', () => {
  it('notifies subscribers only when values actually change', () => {
    const seen: string[] = [];
    const unsub = subscribeLiveStats(() => seen.push('notified'));
    publishLiveStats({ status: 'live', fps: 24 });
    publishLiveStats({ status: 'live', fps: 24 });
    publishLiveStats({ status: 'live', fps: 30 });
    unsub();
    publishLiveStats({ status: 'idle', fps: 0 });
    expect(seen).toEqual(['notified', 'notified']);
  });
});
