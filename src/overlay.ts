import type { PreviewPosition, StatusType } from './types';

/** Options of the injected overlay. */
export interface OverlayOptions {
  showPreview: boolean;
  previewPosition: PreviewPosition;
  mirror: boolean;
  /** Called when the on/off button is pressed. */
  onToggleClick: () => void;
}

/** The overlay injected into the page (preview, status badge, on/off button, gesture flash). */
export interface Overlay {
  setStatus(s: StatusType, message?: string): void;
  flashGesture(name: string): void;
  attachStream(stream: MediaStream | null): void;
  getVideoElement(): HTMLVideoElement;
  destroy(): void;
}

/** How long a recognised gesture name stays fully visible before it fades out. */
export const FLASH_VISIBLE_MS = 900;

/** Badge look per status: the CSS modifier and the visible label (design/mockups/*.html, `#hg-status`). */
interface BadgeLook {
  modifier: 'off' | 'loading' | 'no-hand' | 'hand' | 'error';
  label: string;
}

const BADGE: Record<StatusType, BadgeLook> = {
  off: { modifier: 'off', label: 'Off' },
  loading: { modifier: 'loading', label: 'Loading' },
  // 'ready' and 'running' mean tracking works but no frame has reported a hand yet.
  ready: { modifier: 'no-hand', label: 'No hand' },
  running: { modifier: 'no-hand', label: 'No hand' },
  'no-hand': { modifier: 'no-hand', label: 'No hand' },
  'hand-detected': { modifier: 'hand', label: 'Hand detected' },
  error: { modifier: 'error', label: 'Error' },
};

const START_LABEL = 'Start gestures';
const STOP_LABEL = 'Stop';
const POSITIONS: readonly PreviewPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

/**
 * Scoped styles of the overlay, cut from the approved mockup stylesheet (design/mockups/styles.css,
 * "badge", "buttons" and "gesture overlay" sections). Every rule is anchored at `#hg-overlay` and the
 * tokens are prefixed `--hg-` so neither the host page nor the overlay leaks into the other.
 * No font or other resource is loaded: the font stacks fall back to system fonts when the host page
 * does not provide the design's families.
 */
const STYLES = `
#hg-overlay {
  --hg-surface: oklch(21% 0.026 255);
  --hg-surface-2: oklch(26% 0.03 255);
  --hg-border: oklch(34% 0.032 255);
  --hg-fg: oklch(96% 0.008 250);
  --hg-accent: oklch(82% 0.14 195);
  --hg-accent-strong: oklch(88% 0.13 195);
  --hg-accent-ink: oklch(18% 0.04 215);
  --hg-focus: oklch(88% 0.13 195);
  --hg-status-off: oklch(68% 0.02 250);
  --hg-status-loading: oklch(82% 0.15 80);
  --hg-status-no-hand: oklch(76% 0.07 250);
  --hg-status-hand: oklch(80% 0.17 150);
  --hg-status-error: oklch(72% 0.18 25);
  --hg-scrim: oklch(12% 0.02 255 / 0.86);
  --hg-font-body: "Inter", system-ui, "Segoe UI", Roboto, Arial, sans-serif;
  --hg-font-mono: "JetBrains Mono", ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace;
  --hg-text-xs: 0.75rem;
  --hg-text-sm: 0.875rem;
  --hg-text-lg: clamp(1.0625rem, 0.95rem + 0.5vw, 1.375rem);
  --hg-space-1: 0.25rem;
  --hg-space-2: 0.5rem;
  --hg-space-3: 0.75rem;
  --hg-space-4: 1rem;
  --hg-space-5: 1.5rem;
  --hg-radius-sm: 6px;
  --hg-radius-md: 12px;
  --hg-radius-pill: 999px;
  --hg-overlay-width: min(15rem, calc(100vw - 2rem));

  position: fixed;
  z-index: 100;
  left: var(--hg-space-4);
  bottom: var(--hg-space-4);
  top: auto;
  right: auto;
  width: var(--hg-overlay-width);
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--hg-space-2);
  font-family: var(--hg-font-body);
  font-size: 1rem;
  line-height: 1.55;
  text-align: left;
  color: var(--hg-fg);
  box-sizing: border-box;
}
#hg-overlay *, #hg-overlay *::before, #hg-overlay *::after { box-sizing: border-box; }
#hg-overlay[hidden], #hg-overlay [hidden] { display: none !important; }
#hg-overlay[data-position="top-left"] { top: var(--hg-space-4); bottom: auto; }
#hg-overlay[data-position="top-right"] { top: var(--hg-space-4); bottom: auto; left: auto; right: var(--hg-space-4); }
#hg-overlay[data-position="bottom-right"] { left: auto; right: var(--hg-space-4); }

#hg-overlay .hg__preview {
  position: relative;
  aspect-ratio: 4 / 3;
  overflow: hidden;
  margin: 0;
  background: oklch(12% 0.02 255);
  border: 1px solid var(--hg-border);
  border-radius: var(--hg-radius-md);
  box-shadow: 0 8px 24px oklch(5% 0.02 255 / 0.5);
}
#hg-overlay .hg__video {
  display: block;
  width: 100%;
  height: 100%;
  max-width: none;
  margin: 0;
  object-fit: cover;
}
#hg-overlay .hg__video--mirror { transform: scaleX(-1); }
#hg-overlay .hg__preview--pending::after {
  content: "";
  position: absolute;
  inset: 0;
  margin: auto;
  width: 1.75rem;
  height: 1.75rem;
  border: 3px solid var(--hg-border);
  border-top-color: var(--hg-status-loading);
  border-radius: 50%;
  animation: hg-spin 0.9s linear infinite;
}
@keyframes hg-spin { to { transform: rotate(360deg); } }

#hg-overlay .hg__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--hg-space-2);
  padding: var(--hg-space-2);
  background: var(--hg-scrim);
  border: 1px solid var(--hg-border);
  border-radius: var(--hg-radius-pill);
  backdrop-filter: blur(8px);
  box-shadow: 0 8px 24px oklch(5% 0.02 255 / 0.5);
}

#hg-overlay .badge {
  --hg-badge-color: var(--hg-status-off);
  display: inline-flex;
  align-items: center;
  gap: var(--hg-space-2);
  min-height: 1.75rem;
  padding: 0 var(--hg-space-3);
  font-family: var(--hg-font-mono);
  font-size: var(--hg-text-xs);
  font-weight: 500;
  letter-spacing: 0.03em;
  white-space: nowrap;
  color: var(--hg-fg);
  background: color-mix(in oklch, var(--hg-badge-color) 16%, var(--hg-surface));
  border: 1px solid color-mix(in oklch, var(--hg-badge-color) 55%, transparent);
  border-radius: var(--hg-radius-pill);
}
#hg-overlay .badge__dot { flex: none; width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--hg-badge-color); }
#hg-overlay .badge--off { --hg-badge-color: var(--hg-status-off); }
#hg-overlay .badge--loading { --hg-badge-color: var(--hg-status-loading); }
#hg-overlay .badge--loading .badge__dot { animation: hg-pulse 1s ease-in-out infinite; }
#hg-overlay .badge--no-hand { --hg-badge-color: var(--hg-status-no-hand); }
#hg-overlay .badge--hand { --hg-badge-color: var(--hg-status-hand); }
#hg-overlay .badge--error { --hg-badge-color: var(--hg-status-error); }
@keyframes hg-pulse { 50% { opacity: 0.3; } }

#hg-overlay .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--hg-space-2);
  min-height: 2.75rem;
  margin: 0;
  padding: 0 var(--hg-space-3);
  font-family: var(--hg-font-body);
  font-size: var(--hg-text-sm);
  font-weight: 600;
  line-height: 1;
  text-decoration: none;
  text-transform: none;
  white-space: nowrap;
  color: var(--hg-fg);
  background: var(--hg-surface-2);
  border: 1px solid var(--hg-border);
  border-radius: var(--hg-radius-pill);
  cursor: pointer;
  transition: background-color 120ms, border-color 120ms, transform 120ms;
}
#hg-overlay .btn:hover { background: oklch(31% 0.034 255); border-color: oklch(45% 0.04 255); color: var(--hg-fg); }
#hg-overlay .btn:active { transform: translateY(1px); }
#hg-overlay .btn:focus-visible { outline: 2px solid var(--hg-focus); outline-offset: 3px; }
#hg-overlay .btn[disabled], #hg-overlay .btn[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; pointer-events: none; }
#hg-overlay .btn--primary { color: var(--hg-accent-ink); background: var(--hg-accent); border-color: var(--hg-accent); }
#hg-overlay .btn--primary:hover { color: var(--hg-accent-ink); background: var(--hg-accent-strong); border-color: var(--hg-accent-strong); }

#hg-overlay .hg__error {
  margin: 0;
  padding: var(--hg-space-3) var(--hg-space-4);
  font-size: var(--hg-text-sm);
  line-height: 1.45;
  overflow-wrap: anywhere;
  color: var(--hg-fg);
  background: color-mix(in oklch, var(--hg-status-error) 18%, var(--hg-surface));
  border: 1px solid color-mix(in oklch, var(--hg-status-error) 60%, transparent);
  border-radius: var(--hg-radius-md);
}

#hg-overlay .hg-flash {
  position: fixed;
  z-index: 110;
  top: var(--hg-space-5);
  left: 50%;
  max-width: calc(100vw - 2rem);
  margin: 0;
  padding: var(--hg-space-3) var(--hg-space-5);
  font-family: var(--hg-font-mono);
  font-size: var(--hg-text-lg);
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1.3;
  text-align: center;
  overflow-wrap: anywhere;
  color: var(--hg-accent-ink);
  background: var(--hg-accent);
  border-radius: var(--hg-radius-pill);
  opacity: 0;
  transform: translate(-50%, -8px);
  pointer-events: none;
  transition: opacity 300ms ease-out, transform 300ms ease-out;
}
#hg-overlay .hg-flash:empty { visibility: hidden; }
#hg-overlay .hg-flash.is-visible { opacity: 1; transform: translate(-50%, 0); transition: none; }

@media (prefers-reduced-motion: reduce) {
  #hg-overlay *, #hg-overlay *::before, #hg-overlay *::after { animation: none !important; transition: none !important; }
}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Create the overlay. All text is set via textContent. */
export function createOverlay(opts: OverlayOptions): Overlay {
  const position: PreviewPosition = POSITIONS.includes(opts.previewPosition) ? opts.previewPosition : 'bottom-left';

  // Root: <aside id="hg-overlay" class="hg" data-position="…" aria-label="Gesture control">
  const root = el('aside', 'hg');
  root.id = 'hg-overlay';
  root.setAttribute('data-position', position);
  root.setAttribute('aria-label', 'Gesture control');
  if (!opts.showPreview) root.hidden = true;

  const style = el('style');
  style.textContent = STYLES;

  // Preview: live, muted, inline camera video; mirrored by CSS when `mirror`.
  const preview = el('div', 'hg__preview');
  preview.setAttribute('role', 'img');
  preview.setAttribute('aria-label', opts.mirror ? 'Mirrored camera preview' : 'Camera preview');
  const video = el('video', opts.mirror ? 'hg__video hg__video--mirror' : 'hg__video');
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('autoplay', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  preview.appendChild(video);

  const bar = el('div', 'hg__bar');
  const badge = el('span', 'badge badge--off');
  badge.id = 'hg-status';
  badge.setAttribute('role', 'status');
  const dot = el('span', 'badge__dot');
  const badgeLabel = el('span', 'badge__label');
  badge.append(dot, badgeLabel);

  const toggle = el('button', 'btn btn--primary btn--sm');
  toggle.id = 'hg-toggle';
  toggle.type = 'button';
  toggle.addEventListener('click', (ev) => {
    ev.preventDefault();
    opts.onToggleClick();
  });
  bar.append(badge, toggle);

  const error = el('p', 'hg__error');
  error.id = 'hg-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const flash = el('div', 'hg-flash');
  flash.id = 'hg-flash';
  flash.setAttribute('aria-live', 'polite');

  root.append(style, preview, bar, error, flash);
  (document.body ?? document.documentElement).appendChild(root);

  let flashTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;

  function setStatus(s: StatusType, message?: string): void {
    const look = BADGE[s] ?? BADGE.off;
    badge.className = `badge badge--${look.modifier}`;
    badgeLabel.textContent = look.label;

    // off / error: the camera is not in use, so the preview is hidden and the button starts control.
    const idle = s === 'off' || s === 'error';
    preview.hidden = idle;
    preview.classList.toggle('hg__preview--pending', s === 'loading');
    toggle.className = idle ? 'btn btn--primary btn--sm' : 'btn btn--sm';
    toggle.textContent = idle ? START_LABEL : STOP_LABEL;
    toggle.setAttribute('aria-label', idle ? 'Start gesture control' : 'Stop gesture control');

    if (s === 'error') {
      const text = typeof message === 'string' && message.trim() !== '' ? message : 'Gesture control could not start.';
      error.textContent = text;
      error.hidden = false;
    } else {
      error.textContent = '';
      error.hidden = true;
    }
  }

  function flashGesture(name: string): void {
    if (destroyed) return;
    flash.textContent = String(name);
    flash.classList.add('is-visible');
    if (flashTimer !== null) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashTimer = null;
      // Removing the class lets the CSS transition fade the name out.
      flash.classList.remove('is-visible');
    }, FLASH_VISIBLE_MS);
  }

  function attachStream(stream: MediaStream | null): void {
    if (stream) {
      video.srcObject = stream;
      let played: unknown;
      try {
        played = video.play();
      } catch (err) {
        console.warn('[HandGestures] the camera preview could not start playing:', err);
        return;
      }
      if (played && typeof (played as Promise<void>).catch === 'function') {
        (played as Promise<void>).catch((err: unknown) => {
          console.warn('[HandGestures] the camera preview could not start playing:', err);
        });
      }
    } else {
      if (!video.paused) video.pause();
      video.srcObject = null;
    }
  }

  setStatus('off');

  return {
    setStatus,
    flashGesture,
    attachStream,
    getVideoElement(): HTMLVideoElement {
      return video;
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      if (flashTimer !== null) clearTimeout(flashTimer);
      flashTimer = null;
      video.srcObject = null;
      root.remove();
    },
  };
}
