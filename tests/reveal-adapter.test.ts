import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_REVEAL_MAPPING, revealAdapter } from '../src/adapters/reveal';
import type { GestureType } from '../src/types';

function fakeReveal() {
  return {
    next: vi.fn(),
    prev: vi.fn(),
    up: vi.fn(),
    down: vi.fn(),
    togglePause: vi.fn(),
    toggleOverview: vi.fn(),
  };
}

const g = (type: GestureType) => ({ type, timestamp: 1 });

describe('revealAdapter', () => {
  it('maps every gesture to the default reveal method', () => {
    const expected: Record<GestureType, string> = {
      SWIPE_LEFT: 'next',
      SWIPE_RIGHT: 'prev',
      SWIPE_UP: 'up',
      SWIPE_DOWN: 'down',
      OPEN_PALM_HOLD: 'togglePause',
      FIST_HOLD: 'toggleOverview',
    };
    expect(DEFAULT_REVEAL_MAPPING).toEqual(expected);
    for (const [type, method] of Object.entries(expected)) {
      const R = fakeReveal();
      revealAdapter(R).handle(g(type as GestureType));
      for (const [name, fn] of Object.entries(R)) {
        expect(fn).toHaveBeenCalledTimes(name === method ? 1 : 0);
      }
    }
  });

  it('applies override mapping', () => {
    const R = fakeReveal();
    const a = revealAdapter(R, { SWIPE_LEFT: 'prev' });
    a.handle(g('SWIPE_LEFT'));
    expect(R.prev).toHaveBeenCalledTimes(1);
    expect(R.next).not.toHaveBeenCalled();
    a.handle(g('SWIPE_UP'));
    expect(R.up).toHaveBeenCalledTimes(1);
  });

  it('ignores unknown or missing methods', () => {
    const a = revealAdapter({ next: vi.fn() }, { SWIPE_UP: 'doesNotExist' });
    expect(() => a.handle(g('SWIPE_UP'))).not.toThrow();
    expect(() => a.handle(g('FIST_HOLD'))).not.toThrow();
  });
});
