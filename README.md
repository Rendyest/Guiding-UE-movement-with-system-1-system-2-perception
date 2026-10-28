# Mirra Call — coaching loop (MVP), slice 1: app shell + mock data mode

## Files created
- `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `index.html`, `.gitignore`
- `public/config.json` — all thresholds (gate, hysteresis, coach cooldown, fixed-interval baseline)
- `public/mock-stream.json` — 9-event mock replay (pose_frame / system1_state / coach_event)
- `src/contracts.ts` — data-contract types + validators matching the build brief
- `src/config.ts` — config loader/validator (no threshold is hard-coded in `src`)
- `src/mock/mockStreamPlayer.ts` — replay transport (play / pause / step / reset, file-timestamp pacing)
- `src/mock/MockStreamContext.tsx` — loads stream + config once, shared across routes
- `src/components/AppNav.tsx`, `src/components/MockTransport.tsx`
- `src/pages/` — `SetupPage`, `SessionPage` (participant; no dashboards), `MetricsPage`, `ReviewPage`, `ValidationPage`
- `src/App.tsx`, `src/main.tsx`, `src/styles.css`
- `tests/contracts.test.ts`, `tests/config.test.ts`, `tests/mockStreamPlayer.test.ts`

## How to run
- `npm install`, then `npm run dev` (open the printed localhost URL; webcam needs localhost or HTTPS).
- Tests: `npm test` (vitest; fixed fixtures with hand-checkable numbers).
- I could not run either command here: this machine's shell sandbox is unavailable, so **nothing above is verified yet** — please run `npm test` and `npm run dev` and tell me what fails.

## What is mocked vs live
- Mocked: the entire event stream (replayed from `public/mock-stream.json`); review/validation pages show their empty states because `review-queue.json` / `results.json` do not exist yet ("No review clips yet." / "No results yet." — mock data is never shown as a result).
- Live: nothing yet. No camera, no MediaPipe, no Muse Spark calls, no proxy (slice 4).

## Assumptions
- Dev server serves `public/` at root (`/mock-stream.json`, `/config.json`).
- One shared player across routes; navigating does not reset playback.
- Participant routes show no counters or dashboards; reviewer numbers on `/metrics` are labeled replay demos until slice 5.

Waiting for your "next" before slice 2.
