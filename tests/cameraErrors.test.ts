import { describe, expect, it } from 'vitest';
import { cameraErrorMessage, OFFLINE_MESSAGE } from '../src/pose/cameraErrors';

describe('cameraErrorMessage', () => {
  it('maps NotAllowedError to the gentle denied message', () => {
    const mapped = cameraErrorMessage({ name: 'NotAllowedError', message: 'Permission denied' });
    expect(mapped.status).toBe('denied');
    expect(mapped.message).toContain('Camera blocked');
  });

  it('maps NotFoundError to the no-camera denied message', () => {
    const mapped = cameraErrorMessage({ name: 'NotFoundError', message: 'No device' });
    expect(mapped.status).toBe('denied');
    expect(mapped.message).toContain('No camera found');
  });

  it('maps a fetch TypeError to the offline message (mock replay still works)', () => {
    const mapped = cameraErrorMessage(new TypeError('Failed to fetch'));
    expect(mapped.status).toBe('error');
    expect(mapped.message).toBe(OFFLINE_MESSAGE);
    expect(mapped.message).toContain('Pose model could not load');
    expect(mapped.message).toContain('Mock replay still works');
  });

  it('maps a load-failure message to the offline message', () => {
    const mapped = cameraErrorMessage({ name: 'Error', message: 'Load failed' });
    expect(mapped.status).toBe('error');
    expect(mapped.message).toBe(OFFLINE_MESSAGE);
  });

  it('passes through other error messages unchanged', () => {
    const mapped = cameraErrorMessage(new Error('video element not ready'));
    expect(mapped).toEqual({ status: 'error', message: 'video element not ready' });
  });

  it('passes a string rejection through as the message', () => {
    expect(cameraErrorMessage('something broke')).toEqual({ status: 'error', message: 'something broke' });
  });

  it('uses the generic message for an Error with an empty message', () => {
    expect(cameraErrorMessage(new Error(''))).toEqual({ status: 'error', message: 'Could not start live pose.' });
  });

  it('uses the generic message for an object with no message', () => {
    expect(cameraErrorMessage({})).toEqual({ status: 'error', message: 'Could not start live pose.' });
  });

  it('falls back to a generic message for non-errors', () => {
    expect(cameraErrorMessage(undefined)).toEqual({ status: 'error', message: 'Could not start live pose.' });
  });
});