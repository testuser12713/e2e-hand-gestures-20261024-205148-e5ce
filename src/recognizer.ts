import type { Gesture, Landmark } from './types';

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

/** Create a gesture recogniser. */
export function createRecognizer(opts: RecognizerOptions): Recognizer {
  void opts;
  return {
    update(landmarks: Landmark[] | null, timestampMs: number): Gesture | null {
      void landmarks;
      void timestampMs;
      return null;
    },
    reset(): void {},
  };
}
