/**
 * Pure mapping from a startup failure to the status + gentle message shown on
 * the session page. Pure so it can be tested without a camera or network.
 */

export interface CameraError {
  status: 'denied' | 'error';
  message: string;
}

function errName(e: unknown): string | null {
  if (typeof e === 'object' && e !== null && 'name' in e) {
    const name = (e as { name: unknown }).name;
    if (typeof name === 'string') return name;
  }
  return null;
}

function errMessage(e: unknown): string {
  if (typeof e === 'string') return e;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return '';
}

export const OFFLINE_MESSAGE =
  'Pose model could not load. Check your connection and try again - Mock replay still works.';

export function cameraErrorMessage(e: unknown): CameraError {
  const name = errName(e);
  if (name === 'NotAllowedError') {
    return {
      status: 'denied',
      message: 'Camera blocked. Allow camera access in the browser address bar, then try again.',
    };
  }
  if (name === 'NotFoundError') {
    return {
      status: 'denied',
      message: 'No camera found. Connect a webcam, then try again.',
    };
  }
  const message = errMessage(e);
  // WASM runtime or model download failed (no network, blocked CDN, bad URL).
  if (
    name === 'TypeError' ||
    /failed to fetch|load failed|networkerror|dynamically imported|fetch failed/i.test(message)
  ) {
    return { status: 'error', message: OFFLINE_MESSAGE };
  }
  if (message) {
    return { status: 'error', message };
  }
  return { status: 'error', message: 'Could not start live pose.' };
}