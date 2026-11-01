import type { GateReason } from '../contracts';
import { fixLineFor } from '../copy';

/**
 * Derives the "Can't see you" state from the per-frame gate output. Enter
 * only after `enterFrames` consecutive flagged frames; leave only after
 * `exitFrames` consecutive clean frames. A Can't see you stretch must never
 * start an escalation and must not count toward Struggling windows — both
 * follow automatically because its frames are gate-flagged (see windows.ts
 * and the coach request guard).
 */
export interface CantSeeYou {
  active: boolean;
  /** Fix line for the first matching gate reason, when active. */
  fixLine: string | null;
}

export interface CantSeeYouTracker {
  push(ok: boolean, reasons: readonly GateReason[]): CantSeeYou;
  reset(): void;
  snapshot(): CantSeeYou;
}

export function createCantSeeYouTracker(enterFrames: number, exitFrames: number): CantSeeYouTracker {
  let flaggedStreak = 0;
  let cleanStreak = 0;
  let active = false;
  let fixLine: string | null = null;

  return {
    push(ok, reasons) {
      if (!ok) {
        flaggedStreak += 1;
        cleanStreak = 0;
        if (!active && flaggedStreak >= enterFrames) {
          active = true;
          fixLine = fixLineFor(reasons);
        }
      } else {
        cleanStreak += 1;
        flaggedStreak = 0;
        if (active && cleanStreak >= exitFrames) {
          active = false;
          fixLine = null;
        }
      }
      return { active, fixLine };
    },
    reset() {
      flaggedStreak = 0;
      cleanStreak = 0;
      active = false;
      fixLine = null;
    },
    snapshot() {
      return { active, fixLine };
    },
  };
}
