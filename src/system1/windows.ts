import type { PoseFrame } from '../contracts';

/**
 * A window of recent frames for System 1 scoring. Frames the gate flagged
 * never enter: only clean (ok === true) frames are stored. When too few
 * clean frames remain, the window yields no score rather than a low one —
 * check ready() before scoring.
 */
export interface FrameWindow {
  push(frame: PoseFrame): void;
  cleanCount(): number;
  ready(): boolean;
  frames(): PoseFrame[];
  reset(): void;
}

export function createFrameWindow(windowSize: number, minClean: number): FrameWindow {
  let clean: PoseFrame[] = [];
  return {
    push(frame) {
      if (!frame.gate.ok) return;
      clean = [...clean.slice(-(windowSize - 1)), frame];
    },
    cleanCount() {
      return clean.length;
    },
    ready() {
      return clean.length >= minClean;
    },
    frames() {
      return [...clean];
    },
    reset() {
      clean = [];
    },
  };
}
