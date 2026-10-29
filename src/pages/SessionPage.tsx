import { useState } from 'react';
import { MockTransport } from '../components/MockTransport';
import { SourceSwitch, type PictureSource } from '../components/SourceSwitch';
import { VideoStage } from '../components/VideoStage';
import { AngleReadout } from '../components/AngleReadout';
import { useLivePose } from '../pose/useLivePose';
import { useMockStream } from '../mock/MockStreamContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { config } from '../config';
import { statusText } from '../pose/statusText';
import type { PoseFrame } from '../contracts';

/** Participant route: task, picture, angles. No dashboards here. */
export function SessionPage({ initialSource = 'mock' }: { initialSource?: PictureSource }) {
  const { snapshot } = useMockStream();
  // Test-only starting point: the app always mounts without a prop ('mock').
  const [source, setSource] = useState<PictureSource>(initialSource);
  const [mirrored, setMirrored] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const live = useLivePose();

  const mockFrame = (snapshot?.latest.pose_frame?.data ?? null) as PoseFrame | null;
  const frame = source === 'live' ? live.frame : mockFrame;
  const cameraOn = source === 'live' && live.status === 'live';

  return (
    <div>      <h1>Session — wash your face with the cloth</h1>
      <p>
        Take your time. Move in whatever way feels comfortable, and pause whenever you like.
        Coaching messages arrive in a later slice; nothing here is graded.
      </p>

      <SourceSwitch
        value={source}
        onChange={(next) => {
          if (next === 'mock') live.stop();
          setSource(next);
        }}
      />

      <ErrorBoundary>
        <VideoStage
          frame={frame}
          mirrored={mirrored}
          showSkeleton={showSkeleton}
          dimBelowConf={config.gate.vis_min}
          videoRef={live.videoRef}
          cameraOn={cameraOn}
        />
      </ErrorBoundary>

      <div className="button-row" role="group" aria-label="Stage toggles">
        <button type="button" onClick={() => setShowSkeleton((v) => !v)} aria-pressed={showSkeleton}>
          Skeleton: {showSkeleton ? 'on' : 'off'}
        </button>
        <button type="button" onClick={() => setMirrored((v) => !v)} aria-pressed={mirrored}>
          Mirror: {mirrored ? 'on' : 'off'}
        </button>
      </div>

      <AngleReadout frame={frame} />

      {source === 'mock' && <MockTransport />}

      {source === 'live' && (
        <section aria-label="Camera controls">
          <h2>Camera</h2>
          <p aria-live="polite">{statusText(live.status)}</p>
          {live.error && <p role="alert">{live.error}</p>}
          {live.error && <p>Mock replay still works — switch Picture source back to Mock replay.</p>}
          <div className="button-row">
            <button type="button" onClick={live.start} disabled={live.status === 'loading' || live.status === 'live'}>
              Start camera
            </button>
            <button type="button" onClick={live.stop} disabled={live.status !== 'live' && live.status !== 'loading'}>
              Stop camera
            </button>
          </div>
          <p>Pose runs on this laptop only. No pictures leave your machine in this slice.</p>
        </section>
      )}
    </div>
  );
}
