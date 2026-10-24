import type { Adapter, GestureControlOptions, PreviewPosition } from './types';

/** The @mediapipe/tasks-vision version the library is built and tested against (pinned, never "latest"). */
export const MEDIAPIPE_VERSION = '1.1.1';

/** Default asset location: the public CDN copy of the pinned @mediapipe/tasks-vision release. */
export const DEFAULT_ASSET_BASE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}`;

/** Options after defaults have been applied. `adapter` stays optional: the controller picks one at start. */
export interface ResolvedOptions {
  adapter?: Adapter;
  assetBaseUrl: string;
  mirror: boolean;
  cooldownMs: number;
  swipeDistance: number;
  swipeMaxDurationMs: number;
  holdMs: number;
  showPreview: boolean;
  previewPosition: PreviewPosition;
  toggleKey: string;
  invertSwipe: boolean;
}

/** Default value of every option. */
export const DEFAULT_OPTIONS: Readonly<Omit<ResolvedOptions, 'adapter'>> = Object.freeze({
  assetBaseUrl: DEFAULT_ASSET_BASE_URL,
  mirror: true,
  cooldownMs: 800,
  swipeDistance: 0.2,
  swipeMaxDurationMs: 500,
  holdMs: 1000,
  showPreview: true,
  previewPosition: 'bottom-left',
  toggleKey: 'g',
  invertSwipe: false,
});

const POSITIONS: readonly PreviewPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegativeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;
}

/**
 * Apply defaults to user options. Missing or invalid values (wrong type, NaN, negative
 * durations, unknown corner) fall back to the default. `assetBaseUrl` is only trimmed here;
 * its scheme is validated at start by `validateAssetBaseUrl`.
 */
export function resolveOptions(opts: GestureControlOptions = {}): ResolvedOptions {
  const o = opts ?? {};
  const d = DEFAULT_OPTIONS;
  const adapter =
    o.adapter && typeof (o.adapter as Partial<Adapter>).handle === 'function' ? o.adapter : undefined;
  return {
    adapter,
    assetBaseUrl: nonEmptyString(o.assetBaseUrl, d.assetBaseUrl),
    mirror: bool(o.mirror, d.mirror),
    cooldownMs: nonNegativeNumber(o.cooldownMs, d.cooldownMs),
    swipeDistance: positiveNumber(o.swipeDistance, d.swipeDistance),
    swipeMaxDurationMs: positiveNumber(o.swipeMaxDurationMs, d.swipeMaxDurationMs),
    holdMs: positiveNumber(o.holdMs, d.holdMs),
    showPreview: bool(o.showPreview, d.showPreview),
    previewPosition:
      o.previewPosition && POSITIONS.includes(o.previewPosition) ? o.previewPosition : d.previewPosition,
    toggleKey: nonEmptyString(o.toggleKey, d.toggleKey),
    invertSwipe: bool(o.invertSwipe, d.invertSwipe),
  };
}
