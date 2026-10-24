// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_KEY_MAPPING, keyboardAdapter } from '../src/adapters/keyboard';
import type { Gesture, GestureType } from '../src/types';

// Fake gesture source: the recogniser replays a queue, camera/tracker/overlay need no hardware.
const queue: Gesture[] = [];
vi.mock('../src/recognizer', () => ({
  createRecognizer: () => ({
    update: () => queue.shift() ?? null,
    reset: () => {},
  }),
}));
vi.mock('../src/camera', () => ({
  openCamera: async () => ({ getTracks: () => [] }),
  stopStream: () => {},
  describeCameraError: () => 'camera error',
}));
vi.mock('../src/assets', () => ({ validateAssetBaseUrl: (u: string) => u }));
vi.mock('../src/tracker', () => ({
  createHandTracker: () => ({ init: async () => {}, detect: () => null, close: () => {} }),
}));
vi.mock('../src/overlay', () => ({
  createOverlay: () => ({
    setStatus: () => {},
    flashGesture: () => {},
    attachStream: () => {},
    getVideoElement: () => ({ readyState: 4 }),
    destroy: () => {},
  }),
}));

const ALL: GestureType[] = [
  'SWIPE_LEFT',
  'SWIPE_RIGHT',
  'SWIPE_UP',
  'SWIPE_DOWN',
  'OPEN_PALM_HOLD',
  'FIST_HOLD',
];

function capture(): { keys: KeyboardEvent[]; done: () => void } {
  const keys: KeyboardEvent[] = [];
  const h = (e: KeyboardEvent) => keys.push(e);
  document.addEventListener('keydown', h);
  return { keys, done: () => document.removeEventListener('keydown', h) };
}

describe('keyboardAdapter', () => {
  it('SWIPE_LEFT dispatches a bubbling ArrowRight keydown on document', () => {
    const c = capture();
    keyboardAdapter().handle({ type: 'SWIPE_LEFT', timestamp: 1 });
    c.done();
    expect(c.keys).toHaveLength(1);
    expect(c.keys[0].key).toBe('ArrowRight');
    expect(c.keys[0].type).toBe('keydown');
    expect(c.keys[0].bubbles).toBe(true);
  });

  it('dispatches the default key for each gesture', () => {
    const c = capture();
    const a = keyboardAdapter();
    for (const t of ALL) a.handle({ type: t, timestamp: 0 });
    c.done();
    expect(c.keys.map((k) => k.key)).toEqual(ALL.map((t) => DEFAULT_KEY_MAPPING[t]));
  });

  it('honours overrides by string and KeyInit', () => {
    const c = capture();
    const a = keyboardAdapter({ SWIPE_LEFT: 'n', FIST_HOLD: { key: 'F', code: 'KeyF', shiftKey: true } });
    a.handle({ type: 'SWIPE_LEFT', timestamp: 0 });
    a.handle({ type: 'FIST_HOLD', timestamp: 0 });
    a.handle({ type: 'SWIPE_UP', timestamp: 0 });
    c.done();
    expect(c.keys.map((k) => k.key)).toEqual(['n', 'F', 'ArrowUp']);
    expect(c.keys[1].code).toBe('KeyF');
    expect(c.keys[1].shiftKey).toBe(true);
  });

  it('dispatches nothing for an unmapped gesture', () => {
    const c = capture();
    keyboardAdapter({ SWIPE_DOWN: '' }).handle({ type: 'SWIPE_DOWN', timestamp: 0 });
    c.done();
    expect(c.keys).toHaveLength(0);
  });
});

describe('custom adapter through createGestureControl', () => {
  afterEach(() => {
    queue.length = 0;
  });

  it('receives every gesture from the fake source', async () => {
    const { createGestureControl } = await import('../src/control');
    const received: Gesture[] = [];
    const emitted: Gesture[] = [];
    const gestures: Gesture[] = ALL.map((type, i) => ({ type, timestamp: i }));
    queue.push(...gestures);
    const control = createGestureControl({ adapter: { handle: (g) => received.push(g) } });
    control.on('gesture', (g) => emitted.push(g));
    await control.start();
    expect(control.isRunning()).toBe(true);
    await vi.waitFor(() => expect(received).toHaveLength(ALL.length), { timeout: 3000 });
    control.stop();
    expect(received).toEqual(gestures);
    expect(emitted).toEqual(gestures);
  });
});
