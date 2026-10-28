import { MockTransport } from '../components/MockTransport';
import { useMockStream } from '../mock/MockStreamContext';
import type { PoseFrame } from '../contracts';

function latestFrameLine(snapshot: ReturnType<typeof useMockStream>['snapshot']): string {
  const ev = snapshot?.latest.pose_frame;
  if (!ev) return 'No frame replayed yet.';
  const frame = ev.data as PoseFrame;
  const gate = frame.gate.ok ? 'gate: ok' : `gate: flagged (${frame.gate.reasons.join(', ')})`;
  return `t=${frame.t.toFixed(3)} s, fps=${frame.fps}, ${Object.keys(frame.angles).length} angle(s) replayed, ${gate}.`;
}

/** Participant route. Video stage and angle readout arrive in slices 2–3; no dashboards here. */
export function SessionPage() {
  const { snapshot } = useMockStream();
  return (
    <div>
      <h1>Session — wash your face with the cloth</h1>
      <p>
        Take your time. Move in whatever way feels comfortable, and pause whenever you like.
        The live camera view, skeleton overlay, and coaching messages arrive in later slices.
      </p>
      <MockTransport />
      <section aria-label="Latest replayed frame" aria-live="polite">
        <h2>Latest replayed frame (mock)</h2>
        <p>{latestFrameLine(snapshot)}</p>
      </section>
    </div>
  );
}
