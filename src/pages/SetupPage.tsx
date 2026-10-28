import { MockTransport } from '../components/MockTransport';

/** Participant route. Camera checks and consent arrive in slice 6; no dashboards here. */
export function SetupPage() {
  return (
    <div>
      <h1>Setup</h1>
      <p>
        Welcome. When sessions begin, the task will be <strong>wash your face with the cloth</strong>,
        guided at your own pace. You can pause or stop at any time — no explanation needed.
      </p>
      <MockTransport />
      <p>
        Camera setup checks (camera found, framing, lighting, measured fps, calibration) and consent
        choices arrive in slice 6. This slice makes no camera or cloud calls.
      </p>
    </div>
  );
}
