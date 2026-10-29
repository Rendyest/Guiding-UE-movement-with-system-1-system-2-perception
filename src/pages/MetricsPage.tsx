import { MockTransport } from '../components/MockTransport';
import { useMockStream } from '../mock/MockStreamContext';
import { useLiveStats } from '../pose/liveStats';
import type { System1State } from '../contracts';

/**
 * Reviewer/judge route. The full LoopMetricsPanel (three policies, chart,
 * latency, export) arrives in slice 5; this slice wires the replay counters
 * and the configurable baseline to the mock stream.
 */
export function MetricsPage() {
  const { config, player } = useMockStream();
  const liveStats = useLiveStats();

  let frames = 0;
  let flagged = 0;
  let windows = 0;
  let escalations = 0;
  let coachCalls = 0;
  if (player !== null) {
    const stats = player.consumedPoseStats();
    frames = stats.frames;
    flagged = stats.flagged;
    for (const e of player.consumed()) {
      if (e.kind === 'system1_state') {
        windows += 1;
        if ((e.data as System1State).escalate) escalations += 1;
      } else if (e.kind === 'coach_event') {
        coachCalls += 1;
      }
    }
  }

  const flagRate = frames > 0 ? `${((flagged / frames) * 100).toFixed(1)}%` : '—';
  const interval = config ? `every ${config.baseline.fixed_interval_s} s` : 'loading config…';

  return (
    <div>
      <h1>Loop metrics (reviewers and judges)</h1>
      <p>
        Demo counters from the mock replay. The full calls-saved comparison (every frame vs fixed
        interval vs gated trigger, chart, latency, export) arrives in slice 5.
      </p>
      <MockTransport />
      <section aria-label="Replay demo counters">
        <h2>Replayed so far</h2>
        <ul>
          <li>Frames replayed: {frames}</li>
          <li>Gate-flagged frames: {flagged} ({flagRate})</li>
          <li>System 1 windows: {windows}</li>
          <li>Escalations: {escalations}</li>
          <li>Coach calls made (this replay): {coachCalls}</li>
        </ul>
        <p>Fixed-interval baseline (from config.json): {interval}.</p>
      </section>
      <section aria-label="Live pipeline">
        <h2>Live pipeline</h2>
        <p>
          {liveStats.status === 'live'
            ? `Camera on, about ${liveStats.fps} fps.`
            : liveStats.status === 'loading'
              ? 'Camera starting…'
              : 'Camera off.'}
        </p>
      </section>
    </div>
  );
}

