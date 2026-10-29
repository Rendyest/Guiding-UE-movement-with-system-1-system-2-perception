import type { LiveStatus } from './useLivePose';

/**
 * Pipeline status wording for the participant view. Plain wording only:
 * this function never takes or shows fps, counts, or timings. Loop
 * statistics belong on reviewer routes (e.g. /metrics), never here.
 */
export function statusText(status: LiveStatus): string {
  switch (status) {
    case 'live':
      return 'Camera on.';
    case 'loading':
      return 'Starting camera and loading the pose model…';
    case 'denied':
      return 'Camera unavailable.';
    case 'error':
      return 'Live pose hit a problem.';
    default:
      return 'Camera off.';
  }
}
