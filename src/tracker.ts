import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { resolveModelUrl, resolveWasmUrl } from './assets';
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

/** Number of landmarks MediaPipe reports per hand. */
export const LANDMARKS_PER_HAND = 21;

/** HTMLMediaElement.HAVE_CURRENT_DATA: a frame is available to read. */
const HAVE_CURRENT_DATA = 2;

/**
 * Create a hand tracker. Nothing is fetched before `init()` is called: the wasm runtime is loaded
 * from `<assetBaseUrl>/wasm` and the model from its resolved URL only inside `init()`.
 * Frames and landmarks never leave the device.
 */
export function createHandTracker(opts: HandTrackerOptions): HandTracker {
  const base = opts.assetBaseUrl;
  let landmarker: HandLandmarker | null = null;
  let pending: Promise<void> | null = null;
  let closed = false;
  let lastTs = -1;

  async function load(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(resolveWasmUrl(base));
    const create = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: resolveModelUrl(base), delegate },
        runningMode: 'VIDEO',
        numHands: 1,
      });
    let created: HandLandmarker;
    try {
      created = await create('GPU');
    } catch (gpuErr) {
      console.warn('[HandGestures] GPU delegate unavailable, falling back to CPU:', gpuErr);
      created = await create('CPU');
    }
    if (closed) {
      // close() was called while loading: release right away instead of keeping it alive.
      created.close();
      return;
    }
    landmarker = created;
  }

  return {
    init(): Promise<void> {
      if (landmarker) return Promise.resolve();
      if (pending) return pending;
      closed = false;
      lastTs = -1;
      pending = load().finally(() => {
        pending = null;
      });
      return pending;
    },

    detect(video: HTMLVideoElement, tsMs: number): Landmark[] | null {
      if (!landmarker || !video || video.readyState < HAVE_CURRENT_DATA) return null;
      // MediaPipe requires strictly increasing timestamps in VIDEO mode.
      const ts = Number.isFinite(tsMs) && tsMs > lastTs ? tsMs : lastTs + 1;
      lastTs = ts;
      const result = landmarker.detectForVideo(video, ts);
      const hand = result?.landmarks?.[0];
      if (!hand || hand.length < LANDMARKS_PER_HAND) return null;
      return hand.slice(0, LANDMARKS_PER_HAND).map((p) => ({ x: p.x, y: p.y, z: p.z }));
    },

    close(): void {
      closed = true;
      const l = landmarker;
      landmarker = null;
      if (l) l.close();
    },
  };
}
