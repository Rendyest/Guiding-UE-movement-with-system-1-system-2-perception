/**
 * Thresholds and tunables. `config.default.json` is committed (public
 * placeholders). `config.local.json` is gitignored and overrides it key by
 * key. Nothing in `src` may hard-code a threshold.
 */
import defaults from './config.default.json';

export interface AppConfig {
  gate: {
    vis_min: number;
    bone_length_tol: number;
    foreshortening_min: number;
  };
  struggle: {
    enter_threshold: number;
    exit_threshold: number;
    consecutive_windows: number;
  };
  coach: {
    cooldown_s: number;
  };
  ui: {
    readout_hz: number;
    live_emit_hz: number;
  };
  baseline: {
    fixed_interval_s: number;
  };
}

type Json = Record<string, unknown>;

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isGate(v: unknown): v is AppConfig['gate'] {
  if (!isPlainObject(v)) return false;
  return isNum(v['vis_min']) && isNum(v['bone_length_tol']) && isNum(v['foreshortening_min']);
}

function isStruggle(v: unknown): v is AppConfig['struggle'] {
  if (!isPlainObject(v)) return false;
  return isNum(v['enter_threshold']) && isNum(v['exit_threshold']) && isNum(v['consecutive_windows']);
}

function isCoach(v: unknown): v is AppConfig['coach'] {
  return isPlainObject(v) && isNum(v['cooldown_s']);
}

function isUi(v: unknown): v is AppConfig['ui'] {
  return isPlainObject(v) && isNum(v['readout_hz']) && isNum(v['live_emit_hz']);
}

function isBaseline(v: unknown): v is AppConfig['baseline'] {
  return isPlainObject(v) && isNum(v['fixed_interval_s']);
}

export function isAppConfig(v: unknown): v is AppConfig {
  if (!isPlainObject(v)) return false;
  return (
    isGate(v['gate']) &&
    isStruggle(v['struggle']) &&
    isCoach(v['coach']) &&
    isBaseline(v['baseline']) &&
    isUi(v['ui'])
  );
}

/** Nested objects merge key by key; anything else (numbers, arrays) is replaced. */
export function deepMerge(base: unknown, override: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(override)) {
    return override === undefined ? base : override;
  }
  const out: Json = { ...base };
  for (const [k, v] of Object.entries(override)) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** Pure and testable: merge, then validate. Throws if the result is incomplete. */
export function buildConfig(defaultsJson: unknown, localJson: unknown = {}): AppConfig {
  const merged = deepMerge(defaultsJson, localJson);
  if (!isAppConfig(merged)) throw new Error('config is missing required threshold fields');
  return merged;
}

// Optional file: the glob returns nothing when config.local.json doesn't exist
// (public repo, fresh clone), so the build still works on defaults alone.
const localModules = import.meta.glob('./config.local.json', {
  eager: true,
  import: 'default',
});
const local: unknown = Object.values(localModules)[0] ?? {};

export const config: AppConfig = buildConfig(defaults, local);

/** Kept so existing callers don't change. No network fetch any more. */
export async function loadConfig(): Promise<AppConfig> {
  return config;
}