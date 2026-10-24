import type { Gesture, GestureType, Landmark } from './types';

/**
 * Pure gesture recogniser: landmarks in, gestures out. It knows nothing about the DOM,
 * the camera or MediaPipe — it is fed one set of 21 normalised hand landmarks per frame
 * (or `null` when no hand is visible) together with a millisecond timestamp.
 *
 * ## Coordinates and the swipe mapping
 *
 * MediaPipe landmarks are in RAW camera-image coordinates (x grows to the right of the
 * image, y grows downwards). A front camera faces the user, so when the user moves the
 * hand to THEIR left, the hand moves to the RIGHT of the raw image — but to the LEFT of
 * the mirrored (selfie) preview the user is looking at.
 *
 * Swipes are therefore interpreted in the view the user sees:
 *
 * | option            | view x used         | user's hand moves to their left |
 * |-------------------|---------------------|---------------------------------|
 * | `mirror: true`    | `1 - landmark.x`    | `SWIPE_LEFT`                    |
 * | `mirror: false`   | `landmark.x`        | `SWIPE_RIGHT` (raw image left = user's right) |
 *
 * - view x decreasing  → `SWIPE_LEFT`  (default adapters: next slide)
 * - view x increasing  → `SWIPE_RIGHT` (default adapters: previous slide)
 * - y decreasing       → `SWIPE_UP`
 * - y increasing       → `SWIPE_DOWN`
 * - `invertSwipe: true` swaps `SWIPE_LEFT` and `SWIPE_RIGHT` (vertical swipes are unchanged).
 *
 * The dominant axis decides: a movement is horizontal when |dx| >= |dy|, else vertical.
 *
 * ## Rules
 *
 * - The tracked point is the palm centre: the average of the wrist (0) and the four finger
 *   base landmarks (5, 9, 13, 17).
 * - A swipe fires when the palm centre travels at least `swipeDistance` (fraction of the
 *   frame) within `swipeMaxDurationMs`. Only the last `swipeMaxDurationMs` of positions are
 *   kept, so slow drift never accumulates into a swipe. A fist never swipes.
 * - The pose is classified from the finger tip-to-wrist distances relative to the finger
 *   base-to-wrist distances: all four fingers extended = open palm, all four curled = fist.
 * - `OPEN_PALM_HOLD` / `FIST_HOLD` fire when the pose is held still (palm centre within a
 *   small radius) for `holdMs`. A held pose fires once; it re-arms when the pose changes
 *   or the hand is lost.
 * - After the hand appears nothing fires for `warmupMs` (default 250 ms).
 * - After every fired gesture nothing fires for `cooldownMs`; during the cooldown the
 *   swipe window is kept empty, so the return stroke of a swipe is ignored, and hold
 *   timing restarts only once the cooldown is over.
 * - `null` landmarks (hand lost) or a timestamp going backwards reset all tracking. The
 *   cooldown survives a hand loss so a brief dropout cannot re-enable the return stroke.
 */

/** Options of the pure gesture recogniser (no DOM, no camera). */
export interface RecognizerOptions {
  cooldownMs: number;
  swipeDistance: number;
  swipeMaxDurationMs: number;
  holdMs: number;
  invertSwipe: boolean;
  mirror: boolean;
  warmupMs?: number;
}

/** Stateful recogniser fed one landmark set per frame. */
export interface Recognizer {
  /** Feed one frame. `null` means the hand was lost (tracking resets). Returns a gesture when one fires. */
  update(landmarks: Landmark[] | null, timestampMs: number): Gesture | null;
  /** Forget all tracking and cooldown state. */
  reset(): void;
}

/** Warm-up after the hand appears, when the caller does not give one. */
export const DEFAULT_WARMUP_MS = 250;

/** Landmark indices (MediaPipe hand model order). */
const WRIST = 0;
const FINGER_BASES = [5, 9, 13, 17] as const;
const FINGER_TIPS = [8, 12, 16, 20] as const;
const LANDMARK_COUNT = 21;

/** Tip-to-wrist / base-to-wrist ratio above which a finger counts as extended. */
const EXTENDED_RATIO = 1.5;
/** Ratio below which a finger counts as curled. */
const CURLED_RATIO = 1.25;
/** Largest palm-centre radius (fraction of the frame) that still counts as "held still". */
const MAX_STILL_RADIUS = 0.05;

type Pose = 'open' | 'fist' | 'other';

interface Point {
  x: number;
  y: number;
}

interface Sample extends Point {
  t: number;
}

function finite(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function validLandmarks(lm: Landmark[] | null): lm is Landmark[] {
  if (!Array.isArray(lm) || lm.length < LANDMARK_COUNT) return false;
  for (let i = 0; i < LANDMARK_COUNT; i++) {
    const p = lm[i];
    if (!p || !finite(p.x) || !finite(p.y)) return false;
  }
  return true;
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Palm centre in raw image coordinates. */
export function palmCenter(lm: Landmark[]): Point {
  const idx = [WRIST, ...FINGER_BASES];
  let x = 0;
  let y = 0;
  for (const i of idx) {
    x += lm[i].x;
    y += lm[i].y;
  }
  return { x: x / idx.length, y: y / idx.length };
}

/** Classify the hand pose from finger tip-to-wrist distances. */
export function classifyPose(lm: Landmark[]): Pose {
  const wrist = lm[WRIST];
  let extended = 0;
  let curled = 0;
  for (let f = 0; f < FINGER_TIPS.length; f++) {
    const baseDist = dist(lm[FINGER_BASES[f]], wrist);
    if (baseDist <= 1e-6) return 'other';
    const ratio = dist(lm[FINGER_TIPS[f]], wrist) / baseDist;
    if (ratio >= EXTENDED_RATIO) extended++;
    else if (ratio <= CURLED_RATIO) curled++;
  }
  if (extended === FINGER_TIPS.length) return 'open';
  if (curled === FINGER_TIPS.length) return 'fist';
  return 'other';
}

/** Create a gesture recogniser. */
export function createRecognizer(opts: RecognizerOptions): Recognizer {
  const cooldownMs = finite(opts.cooldownMs) && opts.cooldownMs >= 0 ? opts.cooldownMs : 800;
  const swipeDistance = finite(opts.swipeDistance) && opts.swipeDistance > 0 ? opts.swipeDistance : 0.2;
  const swipeMaxDurationMs =
    finite(opts.swipeMaxDurationMs) && opts.swipeMaxDurationMs > 0 ? opts.swipeMaxDurationMs : 500;
  const holdMs = finite(opts.holdMs) && opts.holdMs > 0 ? opts.holdMs : 1000;
  const warmupMs = finite(opts.warmupMs) && opts.warmupMs >= 0 ? opts.warmupMs : DEFAULT_WARMUP_MS;
  const mirror = opts.mirror !== false;
  const invertSwipe = opts.invertSwipe === true;
  const stillRadius = Math.min(MAX_STILL_RADIUS, swipeDistance / 2);

  // Tracking state (cleared when the hand is lost).
  let handSince: number | null = null;
  let lastTs: number | null = null;
  let window: Sample[] = [];
  let holdPose: Pose = 'other';
  let holdStart = 0;
  let holdAnchor: Point = { x: 0, y: 0 };
  let holdFired = false;
  // Survives a hand loss; cleared only by reset().
  let cooldownUntil = -Infinity;

  function clearTracking(): void {
    handSince = null;
    lastTs = null;
    window = [];
    holdPose = 'other';
    holdFired = false;
  }

  /** Follow the pose; restart the hold timer when the pose changes or the hand moves. */
  function trackPose(pose: Pose, c: Point, ts: number, restart: boolean): void {
    if (pose !== holdPose) {
      holdPose = pose;
      holdFired = false;
      holdStart = ts;
      holdAnchor = c;
    } else if (restart || dist(c, holdAnchor) > stillRadius) {
      holdStart = ts;
      holdAnchor = c;
    }
  }

  function fire(type: GestureType, ts: number): Gesture {
    cooldownUntil = ts + cooldownMs;
    window = [];
    return { type, timestamp: ts };
  }

  function detectSwipe(c: Point): GestureType | null {
    for (const s of window) {
      const dx = c.x - s.x;
      const dy = c.y - s.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < swipeDistance) continue;
      if (Math.abs(dx) >= Math.abs(dy)) {
        // Negative dx = towards the left of the (mirrored, when mirror is true) view.
        const left = dx < 0;
        return left !== invertSwipe ? 'SWIPE_LEFT' : 'SWIPE_RIGHT';
      }
      return dy < 0 ? 'SWIPE_UP' : 'SWIPE_DOWN';
    }
    return null;
  }

  return {
    update(landmarks: Landmark[] | null, timestampMs: number): Gesture | null {
      if (!finite(timestampMs)) return null;
      if (!validLandmarks(landmarks)) {
        clearTracking();
        return null;
      }
      if (lastTs !== null && timestampMs < lastTs) clearTracking();
      lastTs = timestampMs;
      if (handSince === null) handSince = timestampMs;

      const raw = palmCenter(landmarks);
      const c: Point = { x: mirror ? 1 - raw.x : raw.x, y: raw.y };
      const pose = classifyPose(landmarks);

      // Warm-up and cooldown: keep the window empty and hold timing restarting.
      if (timestampMs - handSince < warmupMs || timestampMs < cooldownUntil) {
        window = [];
        trackPose(pose, c, timestampMs, true);
        return null;
      }

      // Swipe: a fist never swipes and breaks any swipe in progress.
      if (pose === 'fist') {
        window = [];
      } else {
        const cutoff = timestampMs - swipeMaxDurationMs;
        window = window.filter((s) => s.t >= cutoff);
        const swipe = detectSwipe(c);
        if (swipe) {
          trackPose(pose, c, timestampMs, true);
          return fire(swipe, timestampMs);
        }
        window.push({ t: timestampMs, x: c.x, y: c.y });
      }

      // Hold: open palm or fist kept still for holdMs, once per pose.
      trackPose(pose, c, timestampMs, false);
      if ((pose === 'open' || pose === 'fist') && !holdFired && timestampMs - holdStart >= holdMs) {
        holdFired = true;
        holdStart = timestampMs;
        return fire(pose === 'open' ? 'OPEN_PALM_HOLD' : 'FIST_HOLD', timestampMs);
      }
      return null;
    },
    reset(): void {
      clearTracking();
      cooldownUntil = -Infinity;
    },
  };
}
