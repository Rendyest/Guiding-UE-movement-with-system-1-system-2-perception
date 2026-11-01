import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseReplayFile } from '../src/contracts';

/** Loads the real replay file served at /mock-stream.json and checks literal event counts. */
describe('mock-stream.json', () => {
  it('contains the expected hand-counted events', () => {
    const raw = readFileSync(new URL('../public/mock-stream.json', import.meta.url), 'utf-8');
    const events = parseReplayFile(JSON.parse(raw) as unknown);

    // pose_frame at 0, 1500, 2000, 3500 = 4
    expect(events.filter((e) => e.kind === 'pose_frame')).toHaveLength(4);
    // system1_state at 1000, 2000, 2500 (cant_see_you), 3000, 4000 = 5
    expect(events.filter((e) => e.kind === 'system1_state')).toHaveLength(5);
    // coach_event at 3100 = 1
    expect(events.filter((e) => e.kind === 'coach_event')).toHaveLength(1);
    // 4 + 5 + 1 = 10
    expect(events).toHaveLength(10);
    // gate.ok false only at t=2.0 (foreshortening) = 1
    expect(
      events.filter((e) => e.kind === 'pose_frame' && !(e.data as { gate: { ok: boolean } }).gate.ok),
    ).toHaveLength(1);
    // escalate true only in the struggling window at t=3.0 = 1
    expect(
      events.filter((e) => e.kind === 'system1_state' && (e.data as { escalate: boolean }).escalate),
    ).toHaveLength(1);
  });
});
