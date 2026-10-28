import { describe, expect, it } from 'vitest';
import { isAppConfig } from '../src/config';

const GOOD_CONFIG = {
  gate: { vis_min: 0.5, bone_length_tol: 0.15, foreshortening_min: 0.5 },
  struggle: { enter_threshold: 0.7, exit_threshold: 0.4, consecutive_windows: 3 },
  coach: { cooldown_s: 60 },
  baseline: { fixed_interval_s: 2 },
};

describe('config', () => {
  it('accepts the placeholder config shape', () => {
    expect(isAppConfig(GOOD_CONFIG)).toBe(true);
  });

  it('rejects a config missing the baseline section', () => {
    const { baseline: _baseline, ...rest } = GOOD_CONFIG;
    void _baseline;
    expect(isAppConfig(rest)).toBe(false);
  });

  it('rejects a non-numeric threshold', () => {
    expect(isAppConfig({ ...GOOD_CONFIG, coach: { cooldown_s: 'a minute' } })).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(isAppConfig(null)).toBe(false);
    expect(isAppConfig('config.json')).toBe(false);
  });
});
