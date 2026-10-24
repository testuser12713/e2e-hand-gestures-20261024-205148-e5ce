import { DEFAULT_ASSET_BASE_URL, MEDIAPIPE_VERSION } from './options';

/**
 * The pinned asset location lives in `options.ts` (it is the default of `assetBaseUrl`);
 * it is re-exported here so everything about asset URLs can be imported from one module.
 */
export { DEFAULT_ASSET_BASE_URL, MEDIAPIPE_VERSION };

/** File name of the hand landmark model below a self-hosted `assetBaseUrl`. */
export const MODEL_FILE_NAME = 'hand_landmarker.task';

/**
 * Model used with the default CDN base. The npm package of @mediapipe/tasks-vision ships only the
 * wasm runtime, not the model, so the CDN copy has no `hand_landmarker.task`; the official
 * MediaPipe model storage serves it under a fixed, versioned path (float16, version 1).
 */
export const DEFAULT_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
/** ASCII control characters (tab, newline, …) are silently stripped by URL parsers, so refuse them. */
function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function currentLocation(): Location | null {
  return typeof location !== 'undefined' && location && typeof location.href === 'string' ? location : null;
}

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

function reject(reason: string): never {
  throw new Error(`assetBaseUrl is not allowed: ${reason}`);
}

/** Accept a parsed absolute URL when it is https, or http on the page's own origin. */
function checkAbsolute(parsed: URL): void {
  if (parsed.protocol === 'https:') return;
  if (parsed.protocol === 'http:') {
    const loc = currentLocation();
    if (loc && parsed.origin === loc.origin) return;
    reject('plain http is only allowed for the page\'s own origin; use an https:// URL or a relative path.');
  }
  reject(`the scheme "${parsed.protocol}" is not supported; use an https:// URL or a relative path.`);
}

/**
 * Validate the MediaPipe asset base URL: only https: or relative/same-origin URLs are allowed.
 * Throws an Error with a readable message for any other scheme; returns the normalised base
 * (trimmed, without trailing slashes, so `<base>/wasm` is never ambiguous).
 */
export function validateAssetBaseUrl(url: string): string {
  if (typeof url !== 'string' || url.trim() === '') {
    reject('it is empty; use an https:// URL or a relative path.');
  }
  const value = url.trim();
  if (hasControlChars(value)) reject('it contains control characters.');
  if (value.includes('\\')) reject('it contains a backslash.');

  const scheme = SCHEME.exec(value);
  if (scheme) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      reject(`"${value}" is not a valid URL.`);
    }
    checkAbsolute(parsed);
    return stripTrailingSlashes(value);
  }

  if (value.startsWith('//')) {
    // Protocol-relative: it points to another host with the page's scheme.
    const loc = currentLocation();
    if (!loc) reject('a protocol-relative URL needs a page origin; use an https:// URL.');
    let parsed: URL;
    try {
      parsed = new URL(value, loc.href);
    } catch {
      reject(`"${value}" is not a valid URL.`);
    }
    checkAbsolute(parsed);
    return stripTrailingSlashes(value);
  }

  // Relative path: resolved against the page, i.e. same origin.
  return stripTrailingSlashes(value);
}

/** Folder of the wasm runtime below a validated base. */
export function resolveWasmUrl(base: string): string {
  return `${stripTrailingSlashes(base)}/wasm`;
}

/**
 * URL of the hand landmark model for a validated base: `<base>/hand_landmarker.task`, except for
 * the default CDN base, whose package does not contain the model (see DEFAULT_MODEL_URL).
 */
export function resolveModelUrl(base: string): string {
  const b = stripTrailingSlashes(base);
  if (b === stripTrailingSlashes(DEFAULT_ASSET_BASE_URL)) return DEFAULT_MODEL_URL;
  return `${b}/${MODEL_FILE_NAME}`;
}
