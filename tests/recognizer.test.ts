import { describe, expect, it } from 'vitest';
import { createRecognizer, type RecognizerOptions } from '../src/recognizer';
import type { Gesture, Landmark } from '../src/types';

const FRAME_MS = 33;

const BASE: RecognizerOptions = {
  cooldownMs: 800,
  swipeDistance: 0.2,
  swipeMaxDurationMs: 500,
  holdMs: 1000,
  invertSwipe: false,
  mirror: true,
  warmupMs: 100,
};

/**
 * Synthetic hand in RAW image coordinates whose palm centre (average of landmarks
 * 0, 5, 9, 13, 17) is exactly (cx, cy).
 */
function hand(cx: number, cy: number, pose: 'open' | 'fist'): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  const set = (i: number, dx: number, dy: number) => {
    lm[i] = { x: cx + dx, y: cy + dy, z: 0 };
  };
  set(0, 0, 0.08); // wrist
  const baseX = [-0.03, -0.01, 0.01, 0.03];
  const bases = [5, 9, 13, 17];
  bases.forEach((b, f) => {
    const x = baseX[f];
    set(b, x, -0.02); // finger base, 0.1 from wrist
    if (pose === 'open') {
      set(b + 1, x, -0.05);
      set(b + 2, x, -0.08);
      set(b + 3, x, -0.12); // tip, 0.2 from wrist (ratio 2)
    } else {
      set(b + 1, x, -0.04);
      set(b + 2, x, -0.01);
      set(b + 3, x, 0.0); // tip curled back, 0.08 from wrist (ratio 0.8)
    }
  });
  for (let i = 1; i <= 4; i++) set(i, -0.05 - i * 0.01, 0.05 - i * 0.02); // thumb
  return lm;
}

interface Run {
  r: ReturnType<typeof createRecognizer>;
  t: number;
  gestures: Gesture[];
}

function start(opts: Partial<RecognizerOptions> = {}): Run {
  return { r: createRecognizer({ ...BASE, ...opts }), t: 0, gestures: [] };
}

/** Feed `frames` frames moving the palm linearly from (x0,y0) to (x1,y1) in raw coordinates. */
function move(
  run: Run,
  from: [number, number],
  to: [number, number],
  frames: number,
  pose: 'open' | 'fist' = 'open',
): Gesture[] {
  const fired: Gesture[] = [];
  for (let i = 0; i <= frames; i++) {
    const k = frames === 0 ? 1 : i / frames;
    const x = from[0] + (to[0] - from[0]) * k;
    const y = from[1] + (to[1] - from[1]) * k;
    const g = run.r.update(hand(x, y, pose), run.t);
    if (g) fired.push(g);
    run.t += FRAME_MS;
  }
  run.gestures.push(...fired);
  return fired;
}

/** Hold the hand still at (x,y) for `ms`. */
function hold(run: Run, at: [number, number], ms: number, pose: 'open' | 'fist' = 'open'): Gesture[] {
  return move(run, at, at, Math.ceil(ms / FRAME_MS), pose);
}

/** Show the hand still long enough to pass the warm-up, without reaching a hold. */
function settle(run: Run, at: [number, number] = [0.5, 0.5]): void {
  hold(run, at, 200);
}

const types = (g: Gesture[]) => g.map((x) => x.type);

describe('recogniser swipes (mirror: true, default)', () => {
  // Raw x increasing = hand moves to the user's left = left in the mirrored view.
  it('a fast movement to the user\'s left fires SWIPE_LEFT', () => {
    const run = start();
    settle(run, [0.3, 0.5]);
    expect(types(move(run, [0.3, 0.5], [0.7, 0.5], 8))).toEqual(['SWIPE_LEFT']);
  });

  it('a fast movement to the user\'s right fires SWIPE_RIGHT', () => {
    const run = start();
    settle(run, [0.7, 0.5]);
    expect(types(move(run, [0.7, 0.5], [0.3, 0.5], 8))).toEqual(['SWIPE_RIGHT']);
  });

  it('a fast upward movement fires SWIPE_UP', () => {
    const run = start();
    settle(run, [0.5, 0.7]);
    expect(types(move(run, [0.5, 0.7], [0.5, 0.3], 8))).toEqual(['SWIPE_UP']);
  });

  it('a fast downward movement fires SWIPE_DOWN', () => {
    const run = start();
    settle(run, [0.5, 0.3]);
    expect(types(move(run, [0.5, 0.3], [0.5, 0.7], 8))).toEqual(['SWIPE_DOWN']);
  });

  it('the dominant axis decides a diagonal movement', () => {
    const run = start();
    settle(run, [0.3, 0.45]);
    expect(types(move(run, [0.3, 0.45], [0.7, 0.55], 8))).toEqual(['SWIPE_LEFT']);
  });

  it('the gesture carries the timestamp it was fed', () => {
    const run = start();
    settle(run, [0.3, 0.5]);
    const [g] = move(run, [0.3, 0.5], [0.7, 0.5], 8);
    expect(g.timestamp).toBeGreaterThan(0);
    expect(g.timestamp).toBeLessThanOrEqual(run.t);
  });
});

describe('recogniser ignores what is not a swipe', () => {
  it('slow drift across the frame fires nothing', () => {
    // 0.4 of the frame over ~3 s: only ~0.07 within any 500 ms window. Stays short of a hold
    // because the palm keeps moving.
    const run = start();
    settle(run, [0.3, 0.5]);
    expect(move(run, [0.3, 0.5], [0.7, 0.5], 90)).toEqual([]);
  });

  it('a short fast movement below swipeDistance fires nothing', () => {
    const run = start();
    settle(run, [0.45, 0.5]);
    expect(move(run, [0.45, 0.5], [0.55, 0.5], 4)).toEqual([]);
  });

  it('nothing fires during the warm-up after the hand appears', () => {
    const run = start({ warmupMs: 400 });
    expect(move(run, [0.3, 0.5], [0.7, 0.5], 8)).toEqual([]);
  });

  it('a moving fist does not swipe', () => {
    const run = start();
    settle(run, [0.3, 0.5]);
    expect(move(run, [0.3, 0.5], [0.7, 0.5], 8, 'fist')).toEqual([]);
  });
});

describe('recogniser holds', () => {
  it('an open palm held still for holdMs fires OPEN_PALM_HOLD', () => {
    const run = start();
    const fired = hold(run, [0.5, 0.5], 1400);
    expect(types(fired)).toEqual(['OPEN_PALM_HOLD']);
  });

  it('a fist held still for holdMs fires FIST_HOLD', () => {
    const run = start();
    expect(types(hold(run, [0.5, 0.5], 1400, 'fist'))).toEqual(['FIST_HOLD']);
  });

  it('does not fire before holdMs has elapsed', () => {
    const run = start();
    expect(hold(run, [0.5, 0.5], 700)).toEqual([]);
  });

  it('a held pose fires once and re-arms only when the pose changes', () => {
    const run = start({ cooldownMs: 300 });
    expect(types(hold(run, [0.5, 0.5], 4000))).toEqual(['OPEN_PALM_HOLD']);
    expect(types(hold(run, [0.5, 0.5], 2000, 'fist'))).toEqual(['FIST_HOLD']);
  });

  it('small tremor still counts as held still', () => {
    const run = start();
    const fired: Gesture[] = [];
    for (let i = 0; i < 45; i++) {
      const g = run.r.update(hand(0.5 + (i % 2 ? 0.01 : -0.01), 0.5, 'open'), run.t);
      if (g) fired.push(g);
      run.t += FRAME_MS;
    }
    expect(types(fired)).toEqual(['OPEN_PALM_HOLD']);
  });
});

describe('recogniser cooldown', () => {
  it('suppresses the return stroke of a swipe inside cooldownMs', () => {
    const run = start();
    settle(run, [0.3, 0.5]);
    expect(types(move(run, [0.3, 0.5], [0.7, 0.5], 8))).toEqual(['SWIPE_LEFT']);
    // Immediate fast return stroke, well inside the 800 ms cooldown.
    expect(move(run, [0.7, 0.5], [0.3, 0.5], 8)).toEqual([]);
  });

  it('a second swipe inside the cooldown is suppressed, after it fires again', () => {
    const run = start();
    settle(run, [0.3, 0.5]);
    move(run, [0.3, 0.5], [0.7, 0.5], 8);
    expect(move(run, [0.3, 0.5], [0.7, 0.5], 6)).toEqual([]);
    hold(run, [0.3, 0.5], 900);
    expect(types(move(run, [0.3, 0.5], [0.7, 0.5], 8))).toEqual(['SWIPE_LEFT']);
  });

  it('movement during the cooldown does not carry over into a swipe after it', () => {
    const run = start();
    settle(run, [0.3, 0.5]);
    move(run, [0.3, 0.5], [0.7, 0.5], 8);
    // Return stroke ends right as the cooldown ends; the window was cleared meanwhile.
    move(run, [0.7, 0.5], [0.3, 0.5], 20);
    expect(move(run, [0.3, 0.5], [0.32, 0.5], 3)).toEqual([]);
  });
});

describe('recogniser mirror and invertSwipe', () => {
  it('mirror: false interprets raw image coordinates', () => {
    const run = start({ mirror: false });
    settle(run, [0.3, 0.5]);
    // Raw x increasing = right of the raw image.
    expect(types(move(run, [0.3, 0.5], [0.7, 0.5], 8))).toEqual(['SWIPE_RIGHT']);
  });

  it('invertSwipe: true reverses left and right', () => {
    const run = start({ invertSwipe: true });
    settle(run, [0.3, 0.5]);
    expect(types(move(run, [0.3, 0.5], [0.7, 0.5], 8))).toEqual(['SWIPE_RIGHT']);
    const run2 = start({ invertSwipe: true });
    settle(run2, [0.7, 0.5]);
    expect(types(move(run2, [0.7, 0.5], [0.3, 0.5], 8))).toEqual(['SWIPE_LEFT']);
  });

  it('invertSwipe leaves vertical swipes unchanged', () => {
    const run = start({ invertSwipe: true });
    settle(run, [0.5, 0.7]);
    expect(types(move(run, [0.5, 0.7], [0.5, 0.3], 8))).toEqual(['SWIPE_UP']);
  });
});

describe('recogniser hand loss and reset', () => {
  it('null landmarks reset tracking so a swipe cannot span a hand loss', () => {
    const run = start();
    settle(run, [0.3, 0.5]);
    move(run, [0.3, 0.5], [0.45, 0.5], 3);
    expect(run.r.update(null, run.t)).toBeNull();
    run.t += FRAME_MS;
    // Reappears further along: warm-up again and no stale window.
    expect(move(run, [0.6, 0.5], [0.7, 0.5], 3)).toEqual([]);
  });

  it('hand loss restarts the hold timer', () => {
    const run = start();
    hold(run, [0.5, 0.5], 700);
    run.r.update(null, run.t);
    run.t += FRAME_MS;
    expect(hold(run, [0.5, 0.5], 700)).toEqual([]);
  });

  it('malformed landmark arrays count as hand lost', () => {
    const r = createRecognizer(BASE);
    expect(r.update([{ x: 0.5, y: 0.5, z: 0 }], 0)).toBeNull();
    expect(r.update([], 33)).toBeNull();
  });

  it('reset() clears the cooldown', () => {
    const run = start();
    settle(run, [0.3, 0.5]);
    move(run, [0.3, 0.5], [0.7, 0.5], 8);
    run.r.reset();
    settle(run, [0.7, 0.5]);
    expect(types(move(run, [0.7, 0.5], [0.3, 0.5], 8))).toEqual(['SWIPE_RIGHT']);
  });
});
