/**
 * Thresholds and tunables. The file `public/config.json` is the single source
 * of truth; nothing in `src` may hard-code a threshold. Until the file loads,
 * callers must render a loading state (there is no in-code fallback).
 */

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
  baseline: {
    fixed_interval_s: number;
  };
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isGate(v: unknown): v is AppConfig['gate'] {
  if (typeof v !== 'object' || v === null) return false;
  const g = v as Record<string, unknown>;
  return isNum(g['vis_min']) && isNum(g['bone_length_tol']) && isNum(g['foreshortening_min']);
}

function isStruggle(v: unknown): v is AppConfig['struggle'] {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return isNum(s['enter_threshold']) && isNum(s['exit_threshold']) && isNum(s['consecutive_windows']);
}

function isCoach(v: unknown): v is AppConfig['coach'] {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return isNum(c['cooldown_s']);
}

function isBaseline(v: unknown): v is AppConfig['baseline'] {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return isNum(b['fixed_interval_s']);
}

export function isAppConfig(v: unknown): v is AppConfig {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return isGate(c['gate']) && isStruggle(c['struggle']) && isCoach(c['coach']) && isBaseline(c['baseline']);
}

export async function loadConfig(url = '/config.json'): Promise<AppConfig> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`config not found at ${url} (HTTP ${res.status})`);
  const json: unknown = await res.json();
  if (!isAppConfig(json)) throw new Error('config.json is missing required threshold fields');
  return json;
}
