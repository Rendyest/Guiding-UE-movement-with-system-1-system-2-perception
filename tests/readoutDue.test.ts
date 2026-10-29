import { describe, expect, it } from 'vitest';
import { readoutDue } from '../src/components/AngleReadout';
import { config } from '../src/config';

describe('readoutDue', () => {
  it('is due exactly at the interval', () => {
    expect(readoutDue(200, 0, 200)).toBe(true);
  });

  it('is not due just before the interval', () => {
    expect(readoutDue(199, 0, 200)).toBe(false);
  });

  it('is due after the interval', () => {
    expect(readoutDue(1000, 0, 200)).toBe(true);
  });

  it('reads the ~5 Hz interval from config (1000 / readout_hz = 200 ms)', () => {
    expect(config.ui.readout_hz).toBe(5);
    expect(1000 / config.ui.readout_hz).toBe(200);
  });
});
