import { describe, expect, it } from 'vitest';
import { buildConfig, deepMerge, isAppConfig } from '../src/config';
import defaults from '../src/config/config.default.json';

const GOOD_CONFIG = {
  gate: { vis_min: 0.5, bone_length_tol: 0.15, foreshortening_min: 0.5 },
  struggle: { enter_threshold: 0.7, exit_threshold: 0.4, consecutive_windows: 3 },
  coach: { cooldown_s: 60 },
  baseline: { fixed_interval_s: 2 },
};

describe('config validation', () => {
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

describe('config merge', () => {
  it('the committed defaults are a complete, valid config', () => {
    expect(isAppConfig(defaults)).toBe(true);
  });

  it('returns the defaults when there is no local file', () => {
    expect(buildConfig(defaults)).toEqual(defaults);
    expect(buildConfig(defaults, {})).toEqual(defaults);
  });

  it('local overrides win', () => {
    const cfg = buildConfig(defaults, { gate: { vis_min: 0.9 } });
    expect(cfg.gate.vis_min).toBe(0.9);
  });

  it('keys missing from local fall back to defaults', () => {
    const cfg = buildConfig(defaults, { gate: { vis_min: 0.9 } });
    expect(cfg.gate.bone_length_tol).toBe(defaults.gate.bone_length_tol);
    expect(cfg.coach.cooldown_s).toBe(defaults.coach.cooldown_s);
  });

  it('does not mutate the defaults', () => {
    const before = JSON.stringify(defaults);
    buildConfig(defaults, { gate: { vis_min: 0.9 } });
    expect(JSON.stringify(defaults)).toBe(before);
  });

  it('replaces arrays instead of concatenating them', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] });
  });

  it('throws if an override breaks a required field', () => {
    expect(() => buildConfig(defaults, { coach: { cooldown_s: 'soon' } })).toThrow();
  });
});