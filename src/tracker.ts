import type { Landmark } from './types';

/** Options of the MediaPipe hand tracker. */
export interface HandTrackerOptions {
  /** Validated base URL of the wasm/model assets. */
  assetBaseUrl: string;
}

/** Wraps the MediaPipe HandLandmarker. */
export interface HandTracker {
  /** Load the wasm runtime and the model from `assetBaseUrl`. */
  init(): Promise<void>;
  /** Detect one hand in the current video frame; `null` when there is none. */
  detect(video: HTMLVideoElement, tsMs: number): Landmark[] | null;
  /** Free the model. */
  close(): void;
}

/** Create a hand tracker. Nothing is fetched before `init()` is called. */
export function createHandTracker(opts: HandTrackerOptions): HandTracker {
  void opts;
  return {
    init(): Promise<void> {
      return Promise.resolve();
    },
    detect(video: HTMLVideoElement, tsMs: number): Landmark[] | null {
      void video;
      void tsMs;
      return null;
    },
    close(): void {},
  };
}
