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

/**
 * Adapter that dispatches a bubbling, cancelable `keydown` KeyboardEvent on `target`
 * (default: document) for each gesture.
 *
 * Convention: SWIPE_LEFT means "next" (the hand pushes content left) => ArrowRight;
 * SWIPE_RIGHT means "previous" => ArrowLeft. Each gesture can be overridden with a key
 * string or a {@link KeyInit}; a gesture mapped to an empty key (or missing from the
 * resolved mapping) dispatches nothing.
 */
export function keyboardAdapter(
  mapping?: Partial<Record<GestureType, string | KeyInit>>,
  target?: Document,
): Adapter {
  const resolved: Partial<Record<GestureType, string | KeyInit>> = {
    ...DEFAULT_KEY_MAPPING,
    ...(mapping ?? {}),
  };
  return {
    handle(gesture): void {
      const doc = target ?? (typeof document !== 'undefined' ? document : undefined);
      if (!doc || !gesture) return;
      const entry = resolved[gesture.type];
      if (entry === undefined || entry === null) return;
      const init: KeyInit = typeof entry === 'string' ? { key: entry } : entry;
      if (typeof init.key !== 'string' || init.key === '') return;
      const view = doc.defaultView;
      const Ctor = view?.KeyboardEvent ?? KeyboardEvent;
      doc.dispatchEvent(
        new Ctor('keydown', {
          key: init.key,
          code: init.code ?? '',
          shiftKey: init.shiftKey ?? false,
          ctrlKey: init.ctrlKey ?? false,
          altKey: init.altKey ?? false,
          metaKey: init.metaKey ?? false,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
  };
}
