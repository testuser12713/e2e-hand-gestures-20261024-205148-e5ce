/**
 * HandGestures: camera hand-gesture control for presentations.
 * The IIFE build exposes everything below on the global `HandGestures`.
 */
export { createGestureControl } from './control';
export { createRecognizer } from './recognizer';
export type { Recognizer, RecognizerOptions } from './recognizer';
export { revealAdapter, DEFAULT_REVEAL_MAPPING } from './adapters/reveal';
export type { RevealLike } from './adapters/reveal';
export { keyboardAdapter, DEFAULT_KEY_MAPPING } from './adapters/keyboard';
export type { KeyInit } from './adapters/keyboard';
export { DEFAULT_OPTIONS, DEFAULT_ASSET_BASE_URL, MEDIAPIPE_VERSION, resolveOptions } from './options';
export type { ResolvedOptions } from './options';
export type {
  Adapter,
  Gesture,
  GestureControl,
  GestureControlOptions,
  GestureType,
  Landmark,
  PreviewPosition,
  StatusEvent,
  StatusType,
} from './types';
