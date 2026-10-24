import type { Adapter, GestureType } from '../types';

/** A key to synthesise, with optional modifiers. */
export interface KeyInit {
  key: string;
  code?: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}

/** Default gesture → key mapping (the keys reveal.js and most slide tools understand). */
export const DEFAULT_KEY_MAPPING: Readonly<Record<GestureType, string>> = Object.freeze({
  SWIPE_LEFT: 'ArrowRight',
  SWIPE_RIGHT: 'ArrowLeft',
  SWIPE_UP: 'ArrowUp',
  SWIPE_DOWN: 'ArrowDown',
  OPEN_PALM_HOLD: 'b',
  FIST_HOLD: 'o',
});

/** Adapter that dispatches KeyboardEvents on `target` (default: document) for each gesture. */
export function keyboardAdapter(
  mapping?: Partial<Record<GestureType, string | KeyInit>>,
  target?: Document,
): Adapter {
  void mapping;
  void target;
  return { handle(): void {} };
}
