// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Gesture, GestureControl, Landmark, StatusEvent } from '../src/types';

// Shared state of the fakes. Camera, tracker and overlay need no hardware; the recogniser is either
// the real one (mode 'real') or replays a queue of gestures (mode 'queue').
const fake = vi.hoisted(() => ({
  mode: 'queue' as 'queue' | 'real',
  queue: [] as Gesture[],
  recognizerOpts: [] as Array<Record<string, unknown>>,
  recognizerResets: 0,
  cameraCalls: 0,
  cameraError: null as unknown,
  trackerCreates: 0,
  trackerCloses: 0,
  trackerInitError: null as unknown,
  detect: null as null | ((tsMs: number) => Landmark[] | null),
  attached: [] as Array<unknown>,
  flashed: [] as string[],
  overlayStatus: [] as Array<{ status: string; message?: string }>,
  onToggleClick: null as null | (() => void),
  trackStops: 0,
}));

vi.mock('../src/recognizer', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/recognizer')>();
  return {
    ...real,
    createRecognizer: (opts: Parameters<typeof real.createRecognizer>[0]) => {
      fake.recognizerOpts.push({ ...opts });
      const inner = real.createRecognizer(opts);
      return {
        update: (lm: Landmark[] | null, ts: number) =>
          fake.mode === 'real' ? inner.update(lm, ts) : (fake.queue.shift() ?? null),
        reset: () => {
          fake.recognizerResets++;
          inner.reset();
        },
      };
    },
  };
});

vi.mock('../src/camera', () => ({
  openCamera: async () => {
    fake.cameraCalls++;
    if (fake.cameraError) throw fake.cameraError;
    const track = { stop: () => fake.trackStops++ };
    return { getTracks: () => [track] };
  },
  stopStream: (s: { getTracks(): Array<{ stop(): void }> } | null) => {
    s?.getTracks().forEach((t) => t.stop());
  },
  describeCameraError: (err: unknown) =>
    err instanceof Error && err.message ? err.message : 'Camera access was denied.',
}));

vi.mock('../src/tracker', () => ({
  createHandTracker: () => {
    fake.trackerCreates++;
    return {
      init: async () => {
        if (fake.trackerInitError) throw fake.trackerInitError;
      },
      detect: (_video: unknown, ts: number) => (fake.detect ? fake.detect(ts) : null),
      close: () => {
        fake.trackerCloses++;
      },
    };
  },
}));

vi.mock('../src/overlay', () => ({
  createOverlay: (opts: { onToggleClick: () => void }) => {
    fake.onToggleClick = opts.onToggleClick;
    return {
      setStatus: (status: string, message?: string) => fake.overlayStatus.push({ status, message }),
      flashGesture: (name: string) => fake.flashed.push(name),
      attachStream: (s: unknown) => fake.attached.push(s),
      getVideoElement: () => ({ readyState: 4 }),
      destroy: () => {},
    };
  },
}));

import { createGestureControl } from '../src/control';
import { revealAdapter } from '../src/adapters/reveal';

/** Synthetic open hand whose palm centre is at (cx, cy) in raw image coordinates. */
function hand(cx: number, cy: number): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  const set = (i: number, dx: number, dy: number) => {
    lm[i] = { x: cx + dx, y: cy + dy, z: 0 };
  };
  set(0, 0, 0.08);
  [5, 9, 13, 17].forEach((b, f) => {
    const x = [-0.03, -0.01, 0.01, 0.03][f];
    set(b, x, -0.02);
    set(b + 1, x, -0.05);
    set(b + 2, x, -0.08);
    set(b + 3, x, -0.12);
  });
  for (let i = 1; i <= 4; i++) set(i, -0.05 - i * 0.01, 0.05 - i * 0.02);
  return lm;
}

/**
 * Fake tracker output driven by the frame timestamp: the hand rests for 500 ms, then moves in raw
 * x from 0.3 to 0.7 within 200 ms (raw x increasing = the user's left in the mirrored view) and rests.
 */
function swipeToUsersLeft(): (ts: number) => Landmark[] {
  let t0: number | null = null;
  return (ts) => {
    if (t0 === null) t0 = ts;
    const dt = ts - t0;
    const k = Math.min(1, Math.max(0, (dt - 500) / 200));
    return hand(0.3 + 0.4 * k, 0.5);
  };
}

function press(key: string, target: EventTarget = document): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('createGestureControl integration', () => {
  let control: GestureControl | null = null;
  let statuses: StatusEvent[] = [];

  // Toggle-key listeners of the controllers built here; removed after each test so a stopped
  // controller of an earlier test does not react to this test's key presses.
  let listeners: Array<[string, EventListenerOrEventListenerObject]> = [];

  function make(opts: Parameters<typeof createGestureControl>[0] = {}): GestureControl {
    const add = document.addEventListener.bind(document);
    const spy = vi.spyOn(document, 'addEventListener').mockImplementation((type, h, o) => {
      if (h) listeners.push([type, h]);
      add(type, h, o);
    });
    try {
      control = createGestureControl({ adapter: { handle() {} }, ...opts });
    } finally {
      spy.mockRestore();
    }
    control.on('status', (s) => statuses.push(s));
    return control;
  }

  beforeEach(() => {
    statuses = [];
    fake.mode = 'queue';
    fake.queue.length = 0;
    fake.recognizerOpts.length = 0;
    fake.recognizerResets = 0;
    fake.cameraCalls = 0;
    fake.cameraError = null;
    fake.trackerCreates = 0;
    fake.trackerCloses = 0;
    fake.trackerInitError = null;
    fake.detect = null;
    fake.attached.length = 0;
    fake.flashed.length = 0;
    fake.overlayStatus.length = 0;
    fake.onToggleClick = null;
    fake.trackStops = 0;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    control?.stop();
    control = null;
    for (const [type, h] of listeners) document.removeEventListener(type, h);
    listeners = [];
    vi.restoreAllMocks();
  });

  it('requests neither camera nor model before start()', () => {
    make();
    expect(fake.cameraCalls).toBe(0);
    expect(fake.trackerCreates).toBe(0);
    expect(control!.isRunning()).toBe(false);
  });

  it("rejects a 'javascript:' assetBaseUrl with an error status, without camera or model", async () => {
    make({ assetBaseUrl: 'javascript:alert(1)' });
    await expect(control!.start()).resolves.toBeUndefined();
    const last = statuses[statuses.length - 1];
    expect(last.status).toBe('error');
    expect(typeof last.message).toBe('string');
    expect(last.message!.length).toBeGreaterThan(0);
    expect(statuses.map((s) => s.status)).not.toContain('loading');
    expect(fake.cameraCalls).toBe(0);
    expect(fake.trackerCreates).toBe(0);
    expect(control!.isRunning()).toBe(false);
    expect(fake.overlayStatus[fake.overlayStatus.length - 1].status).toBe('error');
  });

  it('reports a denied camera as an error status and never throws', async () => {
    fake.cameraError = Object.assign(new Error('Camera access was denied. Keyboard and mouse still work.'), {
      name: 'NotAllowedError',
    });
    make();
    await expect(control!.start()).resolves.toBeUndefined();
    const last = statuses[statuses.length - 1];
    expect(last.status).toBe('error');
    expect(last.message).toMatch(/denied/i);
    expect(control!.isRunning()).toBe(false);
    expect(control!.isEnabled()).toBe(false);
    // The model is never downloaded when the camera is unavailable.
    expect(fake.trackerCreates).toBe(0);
    // A later attempt is still possible.
    fake.cameraError = null;
    await control!.start();
    expect(control!.isRunning()).toBe(true);
  });

  it('reports a failing model load as an error status and releases the camera', async () => {
    fake.trackerInitError = new Error('The model could not be loaded.');
    make();
    await expect(control!.start()).resolves.toBeUndefined();
    expect(statuses[statuses.length - 1]).toEqual({ status: 'error', message: 'The model could not be loaded.' });
    expect(fake.trackStops).toBe(1);
    expect(fake.attached[fake.attached.length - 1]).toBeNull();
    expect(control!.isRunning()).toBe(false);
  });

  it('emits loading, ready, running on a successful start and attaches the stream', async () => {
    make();
    await control!.start();
    expect(statuses.map((s) => s.status)).toEqual(['loading', 'ready', 'running']);
    expect(fake.trackerCreates).toBe(1);
    expect(fake.cameraCalls).toBe(1);
    expect(fake.attached).toHaveLength(1);
    expect(fake.attached[0]).not.toBeNull();
    expect(control!.isRunning()).toBe(true);
    expect(control!.isEnabled()).toBe(true);
  });

  it('emits no-hand / hand-detected only when the hand state changes', async () => {
    let present = false;
    fake.detect = () => (present ? hand(0.5, 0.5) : null);
    make();
    await control!.start();
    await vi.waitFor(() => expect(statuses.map((s) => s.status)).toContain('no-hand'), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 150));
    present = true;
    await vi.waitFor(() => expect(statuses.map((s) => s.status)).toContain('hand-detected'), {
      timeout: 2000,
    });
    await new Promise((r) => setTimeout(r, 150));
    const hands = statuses.map((s) => s.status).filter((s) => s === 'no-hand' || s === 'hand-detected');
    expect(hands).toEqual(['no-hand', 'hand-detected']);
  });

  it('forwards a recognised gesture to the adapter, the gesture event and the overlay flash', async () => {
    const received: Gesture[] = [];
    const emitted: Gesture[] = [];
    const g: Gesture = { type: 'SWIPE_UP', timestamp: 42 };
    fake.queue.push(g);
    make({ adapter: { handle: (x) => received.push(x) } });
    control!.on('gesture', (x) => emitted.push(x));
    await control!.start();
    await vi.waitFor(() => expect(received).toHaveLength(1), { timeout: 2000 });
    expect(received[0]).toEqual(g);
    expect(emitted).toEqual([g]);
    expect(fake.flashed).toEqual(['SWIPE_UP']);
  });

  it('turns an adapter failure into an error status and keeps running', async () => {
    fake.queue.push({ type: 'SWIPE_LEFT', timestamp: 1 });
    make({
      adapter: {
        handle() {
          throw new Error('The deck refused the command.');
        },
      },
    });
    await control!.start();
    await vi.waitFor(
      () => expect(statuses).toContainEqual({ status: 'error', message: 'The deck refused the command.' }),
      { timeout: 2000 },
    );
    expect(control!.isRunning()).toBe(true);
  });

  it('stop() cancels the loop, closes the tracker, releases the stream and reports off', async () => {
    make();
    await control!.start();
    control!.stop();
    expect(fake.trackStops).toBe(1);
    expect(fake.trackerCloses).toBe(1);
    expect(fake.attached[fake.attached.length - 1]).toBeNull();
    expect(fake.recognizerResets).toBeGreaterThan(0);
    expect(statuses[statuses.length - 1].status).toBe('off');
    expect(control!.isRunning()).toBe(false);
    expect(control!.isEnabled()).toBe(false);
  });

  it('the toggle key starts and stops control, and is ignored while typing', async () => {
    make();
    press('g');
    await vi.waitFor(() => expect(control!.isRunning()).toBe(true));
    expect(fake.cameraCalls).toBe(1);
    expect(statuses.map((s) => s.status).slice(0, 3)).toEqual(['loading', 'ready', 'running']);
    press('g');
    expect(control!.isRunning()).toBe(false);
    expect(fake.trackStops).toBe(1);
    expect(statuses[statuses.length - 1].status).toBe('off');

    const input = document.createElement('input');
    document.body.appendChild(input);
    try {
      press('g', input);
      await new Promise((r) => setTimeout(r, 20));
      expect(fake.cameraCalls).toBe(1);
      expect(control!.isRunning()).toBe(false);
    } finally {
      input.remove();
    }
  });

  it('honours a custom toggle key and the overlay button', async () => {
    make({ toggleKey: 'h' });
    press('g');
    await new Promise((r) => setTimeout(r, 20));
    expect(fake.cameraCalls).toBe(0);
    press('H');
    await vi.waitFor(() => expect(control!.isRunning()).toBe(true));
    fake.onToggleClick!();
    expect(control!.isRunning()).toBe(false);
    fake.onToggleClick!();
    await vi.waitFor(() => expect(control!.isRunning()).toBe(true));
  });

  it('keeps detecting with showPreview: false', async () => {
    fake.queue.push({ type: 'FIST_HOLD', timestamp: 1 });
    const received: Gesture[] = [];
    make({ showPreview: false, adapter: { handle: (g) => received.push(g) } });
    await control!.start();
    await vi.waitFor(() => expect(received).toHaveLength(1), { timeout: 2000 });
  });

  it('passes invertSwipe and mirror through to the recogniser', () => {
    make({ invertSwipe: true });
    expect(fake.recognizerOpts[fake.recognizerOpts.length - 1]).toMatchObject({ invertSwipe: true, mirror: true });
    control!.stop();
    make();
    expect(fake.recognizerOpts[fake.recognizerOpts.length - 1]).toMatchObject({ invertSwipe: false });
  });

  it('a hand moving to the user\'s left advances to the next slide by default', async () => {
    fake.mode = 'real';
    fake.detect = swipeToUsersLeft();
    const deck = { next: vi.fn(), prev: vi.fn() };
    make({ adapter: revealAdapter(deck) });
    await control!.start();
    await vi.waitFor(() => expect(deck.next).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(deck.prev).not.toHaveBeenCalled();
  });

  it('invertSwipe: true makes the same movement go to the previous slide', async () => {
    fake.mode = 'real';
    fake.detect = swipeToUsersLeft();
    const deck = { next: vi.fn(), prev: vi.fn() };
    make({ adapter: revealAdapter(deck), invertSwipe: true });
    await control!.start();
    await vi.waitFor(() => expect(deck.prev).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(deck.next).not.toHaveBeenCalled();
  });
});
