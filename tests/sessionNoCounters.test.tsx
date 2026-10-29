import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionPage } from '../src/pages/SessionPage';
import { MetricsPage } from '../src/pages/MetricsPage';
import { publishLiveStats } from '../src/pose/liveStats';
import { AngleList } from '../src/components/AngleReadout';
import { MockStreamContext, type MockStreamValue } from '../src/mock/MockStreamContext';
import { MockPlayer } from '../src/mock/mockStreamPlayer';
import { parseReplayFile } from '../src/contracts';
import type { PoseFrame } from '../src/contracts';
import { config } from '../src/config';
import { statusText } from '../src/pose/statusText';
import type { LiveStatus } from '../src/pose/useLivePose';

const BANNED = /\b(fps|frames?|calls?|saved|flag rate|latency|escalat\w*)\b/i;
const STAT_TESTID = /data-testid="stat-/;

const ALL_STATUSES: LiveStatus[] = ['idle', 'loading', 'live', 'denied', 'error'];

function okFrame(): PoseFrame {
  return {
    t: 1.5,
    fps: 24,
    joints: {
      r_shoulder: { x: 0.55, y: 0.4, conf: 0.95 },
      r_elbow: { x: 0.41, y: 0.52, conf: 0.93 },
      r_wrist: { x: 0.48, y: 0.35, conf: 0.88 },
    },
    angles: {
      r_elbow_flexion: { deg: 87.2, conf: 0.91 },
      r_shoulder_elevation: { deg: 64.0, conf: 0.88 },
    },
    gate: { ok: true, reasons: [] },
  };
}

function flaggedFrame(): PoseFrame {
  return {
    ...okFrame(),
    t: 2.0,
    angles: {
      r_elbow_flexion: { deg: 74.5, conf: 0.4 },
      r_shoulder_elevation: { deg: 58.0, conf: 0.41 },
    },
    gate: { ok: false, reasons: ['foreshortening'] },
  };
}

/** Real mock player preloaded with mock-stream.json, stepped to the t=1.5 pose_frame. */
function preloadedValue(): MockStreamValue {
  const raw = readFileSync(new URL('../public/mock-stream.json', import.meta.url), 'utf-8');
  const player = new MockPlayer();
  player.setEvents(parseReplayFile(JSON.parse(raw) as unknown));
  player.step(3); // consume through the t=1.5 pose_frame so the stage holds a frame
  return {
    status: 'ready',
    error: null,
    player,
    config,
    snapshot: player.snapshot(),
  };
}

/** SessionPage against the preloaded mock stream. No effects fire. */
function sessionMarkup(): string {
  return renderToStaticMarkup(
    <MockStreamContext.Provider value={preloadedValue()}>
      <SessionPage />
    </MockStreamContext.Provider>,
  );
}

describe('session has no loop statistics', () => {
  it('statusText is plain wording for every status', () => {
    for (const status of ALL_STATUSES) {
      expect(statusText(status)).not.toMatch(BANNED);
    }
  });

  it('statusText for live has no digits', () => {
    expect(statusText('live')).not.toMatch(/\d/);
  });

  it('renders the session page with no banned words and no stat test ids', () => {
    const html = sessionMarkup();
    expect(html).not.toMatch(BANNED);
    expect(html).not.toMatch(STAT_TESTID);
  });

  it('renders the angle list with no banned words', () => {
    const html = renderToStaticMarkup(<AngleList frame={okFrame()} />);
    expect(html).not.toMatch(BANNED);
    expect(html).not.toMatch(STAT_TESTID);
    expect(html).not.toContain('uncertain');
  });

  it('covers the flagged path: uncertain label, still no banned words', () => {
    const html = renderToStaticMarkup(<AngleList frame={flaggedFrame()} />);
    expect(html).toContain('uncertain');
    expect(html).not.toMatch(BANNED);
    expect(html).not.toMatch(STAT_TESTID);
  });
});

describe('fps lives outside the session view', () => {
  it('no session-facing source file imports liveStats', () => {
    // Producer useLivePose is intentionally excluded: it publishes the stats.
    const sessionFacing = [
      '../src/pages/SessionPage.tsx',
      '../src/components/AngleReadout.tsx',
      '../src/components/VideoStage.tsx',
      '../src/components/MockTransport.tsx',
      '../src/components/SourceSwitch.tsx',
      '../src/components/ErrorBoundary.tsx',
      '../src/pose/statusText.ts',
    ];
    for (const rel of sessionFacing) {
      const src = readFileSync(new URL(rel, import.meta.url), 'utf-8');
      expect(src, `${rel} must not import liveStats`).not.toMatch(/liveStats/);
    }
  });

  it('the session page renders no fps text', () => {
    expect(sessionMarkup()).not.toMatch(/\bfps\b/i);
  });

  it('fps renders on /metrics, the designated reviewer route', () => {
    publishLiveStats({ status: 'live', fps: 24 });
    const html = renderToStaticMarkup(
      <MockStreamContext.Provider value={preloadedValue()}>
        <MetricsPage />
      </MockStreamContext.Provider>,
    );
    expect(html).toContain('fps');
  });
});

describe('session live branch (no camera)', () => {
  function liveMarkup(): string {
    return renderToStaticMarkup(
      <MockStreamContext.Provider value={preloadedValue()}>
        <SessionPage initialSource="live" />
      </MockStreamContext.Provider>,
    );
  }

  it('renders the live branch with no banned words and no stat test ids', () => {
    const html = liveMarkup();
    expect(html).not.toMatch(BANNED);
    expect(html).not.toMatch(STAT_TESTID);
  });

  it('shows no digits next to the status text', () => {
    const html = liveMarkup();
    const paras = [...html.matchAll(/<p aria-live="polite">([^<]*)<\/p>/g)];
    const status = paras.map((m) => m[1]).find((t) => t.includes('Camera'));
    if (status === undefined) throw new Error('live status paragraph missing');
    expect(status).not.toMatch(/\d/);
  });

  it('includes camera controls and stage toggles', () => {
    const html = liveMarkup();
    expect(html).toContain('Start camera');
    expect(html).toContain('Stop camera');
    expect(html).toContain('Skeleton:');
    expect(html).toContain('Mirror:');
  });
});
