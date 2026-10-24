import { revealAdapter, type RevealLike } from './adapters/reveal';
import { keyboardAdapter } from './adapters/keyboard';
import { validateAssetBaseUrl } from './assets';
import { describeCameraError, openCamera, stopStream } from './camera';
import { Emitter } from './emitter';
import { resolveOptions } from './options';
import { createOverlay, type Overlay } from './overlay';
import { createRecognizer } from './recognizer';
import { createHandTracker, type HandTracker } from './tracker';
import type {
  Adapter,
  Gesture,
  GestureControl,
  GestureControlOptions,
  StatusEvent,
  StatusType,
} from './types';

/** Detection runs at most this often (~30 fps). */
const FRAME_INTERVAL_MS = 1000 / 30;

/** Fallback text when an error carries no usable message. */
const GENERIC_START_ERROR = 'Gesture control could not start. Keyboard and mouse still work.';

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message.trim() !== '') return err.message;
  if (typeof err === 'string' && err.trim() !== '') return err;
  return fallback;
}

function now(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

type FrameHandle = { cancel(): void };

function scheduleFrame(cb: () => void): FrameHandle {
  if (typeof requestAnimationFrame === 'function') {
    const id = requestAnimationFrame(cb);
    return { cancel: () => cancelAnimationFrame(id) };
  }
  const id = setTimeout(cb, FRAME_INTERVAL_MS);
  return { cancel: () => clearTimeout(id) };
}

/** True when a key event comes from a place where the user is typing text. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as Element).tagName !== 'string') return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/** The adapter used when the caller passes none: reveal.js when present, else synthetic keys. */
function defaultAdapter(): Adapter {
  const reveal = (globalThis as { Reveal?: unknown }).Reveal;
  if (reveal && typeof reveal === 'object') return revealAdapter(reveal as RevealLike);
  return keyboardAdapter();
}

/**
 * Create the gesture controller. Builds the overlay (state 'off') and listens for the toggle key;
 * the camera and the MediaPipe assets are requested only inside `start()`, i.e. after an explicit
 * user action (overlay button, toggle key or an explicit API call).
 */
export function createGestureControl(options: GestureControlOptions = {}): GestureControl {
  const opts = resolveOptions(options);
  const emitter = new Emitter();
  const recognizer = createRecognizer({
    cooldownMs: opts.cooldownMs,
    swipeDistance: opts.swipeDistance,
    swipeMaxDurationMs: opts.swipeMaxDurationMs,
    holdMs: opts.holdMs,
    invertSwipe: opts.invertSwipe,
    mirror: opts.mirror,
  });

  let enabled = false;
  let running = false;
  let starting = false;
  /** Incremented by every stop; a start that sees a different value was cancelled meanwhile. */
  let generation = 0;
  let stream: MediaStream | null = null;
  let tracker: HandTracker | null = null;
  let adapter: Adapter | null = null;
  let frame: FrameHandle | null = null;
  let lastDetect = -Infinity;
  let lastStatus: StatusType | null = null;
  let lastMessage: string | undefined;

  let overlay: Overlay | null = null;
  try {
    overlay = createOverlay({
      showPreview: opts.showPreview,
      previewPosition: opts.previewPosition,
      mirror: opts.mirror,
      onToggleClick: () => toggle(),
    });
  } catch (err) {
    console.error('[HandGestures] the overlay could not be created:', err);
  }

  function setStatus(status: StatusType, message?: string): void {
    if (status === lastStatus && message === lastMessage) return;
    lastStatus = status;
    lastMessage = message;
    try {
      overlay?.setStatus(status, message);
    } catch (err) {
      console.error('[HandGestures] the overlay could not show the status:', err);
    }
    const event: StatusEvent = message === undefined ? { status } : { status, message };
    emitter.emit('status', event);
  }

  function dispatch(gesture: Gesture): void {
    emitter.emit('gesture', gesture);
    try {
      overlay?.flashGesture(gesture.type);
    } catch (err) {
      console.error('[HandGestures] the overlay could not flash the gesture:', err);
    }
    try {
      adapter?.handle(gesture);
    } catch (err) {
      console.error('[HandGestures] the adapter failed to handle a gesture:', err);
    }
  }

  /** Release camera, model and loop. Does not touch status or the enabled flag. */
  function release(): void {
    frame?.cancel();
    frame = null;
    running = false;
    if (stream) {
      try {
        stopStream(stream);
      } catch (err) {
        console.error('[HandGestures] the camera could not be released:', err);
      }
      stream = null;
    }
    try {
      overlay?.attachStream(null);
    } catch (err) {
      console.error('[HandGestures] the overlay could not detach the camera:', err);
    }
    if (tracker) {
      try {
        tracker.close();
      } catch (err) {
        console.error('[HandGestures] the hand tracker could not be closed:', err);
      }
      tracker = null;
    }
    recognizer.reset();
    lastDetect = -Infinity;
  }

  function fail(message: string): void {
    release();
    starting = false;
    enabled = false;
    setStatus('error', message);
  }

  function loop(): void {
    frame = null;
    if (!running) return;
    const ts = now();
    if (ts - lastDetect >= FRAME_INTERVAL_MS) {
      lastDetect = ts;
      try {
        tick(ts);
      } catch (err) {
        fail(errorMessage(err, 'Hand tracking stopped unexpectedly.'));
        return;
      }
    }
    if (running) frame = scheduleFrame(loop);
  }

  function tick(ts: number): void {
    if (!tracker || !overlay) return;
    const video = overlay.getVideoElement();
    // HAVE_CURRENT_DATA (2): the first frame is available.
    if (!video || video.readyState < 2) return;
    const landmarks = tracker.detect(video, ts);
    setStatus(landmarks ? 'hand-detected' : 'no-hand');
    const gesture = recognizer.update(landmarks, ts);
    if (gesture) dispatch(gesture);
  }

  async function start(): Promise<void> {
    if (running || starting) return;
    starting = true;
    enabled = true;
    const token = ++generation;
    const cancelled = () => token !== generation;
    setStatus('loading');

    let base: string;
    try {
      base = validateAssetBaseUrl(opts.assetBaseUrl);
    } catch (err) {
      fail(errorMessage(err, 'The asset URL is not allowed.'));
      return;
    }

    try {
      const s = await openCamera();
      if (cancelled()) {
        stopStream(s);
        return;
      }
      stream = s;
      overlay?.attachStream(s);
    } catch (err) {
      if (cancelled()) return;
      fail(errorMessage(describeCameraError(err), GENERIC_START_ERROR));
      return;
    }

    try {
      const t = createHandTracker({ assetBaseUrl: base });
      tracker = t;
      await t.init();
      if (cancelled()) return;
    } catch (err) {
      if (cancelled()) return;
      fail(errorMessage(err, 'The hand tracking model could not be loaded.'));
      return;
    }

    adapter = opts.adapter ?? defaultAdapter();
    recognizer.reset();
    starting = false;
    running = true;
    setStatus('ready');
    setStatus('running');
    frame = scheduleFrame(loop);
  }

  function stop(): void {
    generation++;
    starting = false;
    enabled = false;
    release();
    setStatus('off');
  }

  function enable(): void {
    if (running || starting) {
      enabled = true;
      return;
    }
    void start();
  }

  function disable(): void {
    stop();
  }

  function toggle(): void {
    if (enabled || running || starting) disable();
    else enable();
  }

  function onKeyDown(ev: KeyboardEvent): void {
    if (ev.repeat || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (typeof ev.key !== 'string' || ev.key.toLowerCase() !== opts.toggleKey.toLowerCase()) return;
    if (isTypingTarget(ev.target)) return;
    toggle();
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', onKeyDown);
  }

  setStatus('off');

  return {
    start,
    stop,
    enable,
    disable,
    toggle,
    on(event: string, h: Function): void {
      emitter.on(event, h);
    },
    off(event: string, h: Function): void {
      emitter.off(event, h);
    },
    isRunning: () => running,
    isEnabled: () => enabled,
  };
}
