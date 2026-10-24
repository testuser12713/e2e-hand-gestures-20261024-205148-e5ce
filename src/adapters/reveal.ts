import type { Adapter, GestureType } from '../types';

/** The part of the reveal.js API the adapter uses. */
export interface RevealLike {
  left?(): void;
  right?(): void;
  up?(): void;
  down?(): void;
  prev?(): void;
  next?(): void;
  togglePause?(override?: boolean): void;
  toggleOverview?(override?: boolean): void;
  [method: string]: unknown;
}

/** Default gesture → reveal.js method mapping (swipes are already interpreted in the mirrored view). */
export const DEFAULT_REVEAL_MAPPING: Readonly<Record<GestureType, string>> = Object.freeze({
  SWIPE_LEFT: 'next',
  SWIPE_RIGHT: 'prev',
  SWIPE_UP: 'up',
  SWIPE_DOWN: 'down',
  OPEN_PALM_HOLD: 'togglePause',
  FIST_HOLD: 'toggleOverview',
});

/** Adapter that drives a reveal.js deck. `mapping` overrides single entries of the default mapping. */
export function revealAdapter(Reveal: RevealLike, mapping?: Partial<Record<GestureType, string>>): Adapter {
  const resolved: Record<string, string | undefined> = { ...DEFAULT_REVEAL_MAPPING, ...(mapping ?? {}) };
  return {
    handle(gesture): void {
      if (!Reveal || !gesture) return;
      const name = resolved[gesture.type];
      if (typeof name !== 'string' || name === '') return;
      const fn = (Reveal as Record<string, unknown>)[name];
      if (typeof fn !== 'function') return;
      (fn as () => void).call(Reveal);
    },
  };
}
