/**
 * Shared types of the HandGestures library.
 * Every module imports its shapes from here; this file is the single source of truth.
 */

/** A gesture the recogniser can report. */
export type GestureType =
  | 'SWIPE_LEFT'
  | 'SWIPE_RIGHT'
  | 'SWIPE_UP'
  | 'SWIPE_DOWN'
  | 'OPEN_PALM_HOLD'
  | 'FIST_HOLD';

/** One recognised gesture. `timestamp` is in milliseconds (the clock the recogniser was fed). */
export interface Gesture {
  type: GestureType;
  timestamp: number;
}

/** Lifecycle / detection state of the controller, mirrored by the overlay badge. */
export type StatusType =
  | 'off'
  | 'loading'
  | 'ready'
  | 'running'
  | 'no-hand'
  | 'hand-detected'
  | 'error';

/** Payload of the controller's `status` event. */
export interface StatusEvent {
  status: StatusType;
  message?: string;
}

/** One hand landmark, normalised to 0..1 (21 per hand, MediaPipe order). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

/** Turns gestures into actions (slide commands, key presses, anything). */
export interface Adapter {
  handle(gesture: Gesture): void;
}

/** Corner of the viewport the overlay is pinned to. */
export type PreviewPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/** Options accepted by `createGestureControl`. Every field is optional. */
export interface GestureControlOptions {
  /** Receives every recognised gesture. Default: reveal.js adapter when `window.Reveal` exists, else the keyboard adapter. */
  adapter?: Adapter;
  /** Base URL of the MediaPipe wasm/model assets (https: or relative/same-origin only). */
  assetBaseUrl?: string;
  /** Interpret movement in the mirrored (selfie) view. Default true. */
  mirror?: boolean;
  /** Quiet time after a gesture, in ms. Default 800. */
  cooldownMs?: number;
  /** Minimum palm travel for a swipe, as a fraction of the frame (0..1). */
  swipeDistance?: number;
  /** Maximum duration of a swipe in ms. */
  swipeMaxDurationMs?: number;
  /** How long an open palm / fist must be held still, in ms. */
  holdMs?: number;
  /** Show the mirrored camera preview in the overlay. Default true. */
  showPreview?: boolean;
  /** Corner of the overlay. */
  previewPosition?: PreviewPosition;
  /** Key that toggles gesture control. Default 'g'. */
  toggleKey?: string;
  /** Reverse the horizontal swipe direction. Default false. */
  invertSwipe?: boolean;
}

/** The controller returned by `createGestureControl`. */
export interface GestureControl {
  /** Request the camera, load the model and start recognising. Never rejects; failures surface as status 'error'. */
  start(): Promise<void>;
  /** Stop recognising and release the camera. */
  stop(): void;
  /** Turn gesture control on (starts it when it is not running). */
  enable(): void;
  /** Turn gesture control off (stops it and releases the camera). */
  disable(): void;
  /** Switch between enabled and disabled. */
  toggle(): void;
  on(event: 'gesture', h: (g: Gesture) => void): void;
  on(event: 'status', h: (s: StatusEvent) => void): void;
  /** Remove a handler previously registered with `on`. */
  off(event: string, h: Function): void;
  isRunning(): boolean;
  isEnabled(): boolean;
}
