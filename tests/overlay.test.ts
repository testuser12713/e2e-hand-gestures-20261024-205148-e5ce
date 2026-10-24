import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createOverlay, FLASH_VISIBLE_MS, type Overlay, type OverlayOptions } from '../src/overlay';
import type { StatusType } from '../src/types';

let overlay: Overlay | null = null;

function make(partial: Partial<OverlayOptions> = {}): Overlay {
  overlay = createOverlay({
    showPreview: true,
    previewPosition: 'bottom-left',
    mirror: true,
    onToggleClick: () => undefined,
    ...partial,
  });
  return overlay;
}

const byId = (id: string) => document.getElementById(id) as HTMLElement;

afterEach(() => {
  overlay?.destroy();
  overlay = null;
  vi.useRealTimers();
});

describe('createOverlay', () => {
  it('starts neutral in the off state without an error', () => {
    make();
    const root = byId('hg-overlay');
    expect(root).not.toBeNull();
    expect(root.hidden).toBe(false);
    expect(byId('hg-status').textContent).toBe('Off');
    expect(byId('hg-status').classList.contains('badge--off')).toBe(true);
    expect(byId('hg-error').hidden).toBe(true);
    expect(byId('hg-error').textContent).toBe('');
    expect(byId('hg-toggle').textContent).toBe('Start gestures');
    expect(byId('hg-flash').textContent).toBe('');
  });

  it('builds a muted, inline, mirrored video preview placed per previewPosition', () => {
    const o = make({ previewPosition: 'top-right' });
    const video = o.getVideoElement();
    expect(video.tagName).toBe('VIDEO');
    expect(video.muted).toBe(true);
    expect(video.hasAttribute('playsinline')).toBe(true);
    expect(video.classList.contains('hg__video--mirror')).toBe(true);
    expect(byId('hg-overlay').getAttribute('data-position')).toBe('top-right');
  });

  it('does not mirror the preview when mirror is false', () => {
    const o = make({ mirror: false });
    expect(o.getVideoElement().classList.contains('hg__video--mirror')).toBe(false);
  });

  it.each<[StatusType, string, string, string]>([
    ['off', 'Off', 'badge--off', 'Start gestures'],
    ['loading', 'Loading', 'badge--loading', 'Stop'],
    ['ready', 'No hand', 'badge--no-hand', 'Stop'],
    ['running', 'No hand', 'badge--no-hand', 'Stop'],
    ['no-hand', 'No hand', 'badge--no-hand', 'Stop'],
    ['hand-detected', 'Hand detected', 'badge--hand', 'Stop'],
    ['error', 'Error', 'badge--error', 'Start gestures'],
  ])('status %s updates the badge and the button', (status, label, cls, button) => {
    const o = make();
    o.setStatus(status, status === 'error' ? 'Something failed.' : undefined);
    const badge = byId('hg-status');
    expect(badge.textContent).toBe(label);
    expect(badge.classList.contains(cls)).toBe(true);
    expect(byId('hg-toggle').textContent).toBe(button);
  });

  it('shows an error message as text and clears it on the next non-error status', () => {
    const o = make();
    const hostile = '<img src=x onerror="window.__hacked=1">';
    o.setStatus('error', hostile);
    const error = byId('hg-error');
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe(hostile);
    expect(error.querySelector('img')).toBeNull();
    expect(document.querySelector('#hg-overlay img')).toBeNull();

    o.setStatus('loading');
    expect(error.hidden).toBe(true);
    expect(error.textContent).toBe('');
  });

  it('flashes the gesture name as text and fades it out', () => {
    vi.useFakeTimers();
    const o = make();
    o.flashGesture('SWIPE_LEFT');
    const flash = byId('hg-flash');
    expect(flash.textContent).toBe('SWIPE_LEFT');
    expect(flash.classList.contains('is-visible')).toBe(true);
    vi.advanceTimersByTime(FLASH_VISIBLE_MS + 50);
    expect(flash.classList.contains('is-visible')).toBe(false);

    o.flashGesture('<b>x</b>');
    expect(flash.querySelector('b')).toBeNull();
    expect(flash.textContent).toBe('<b>x</b>');
  });

  it('calls onToggleClick when the button is clicked', () => {
    const onToggleClick = vi.fn();
    make({ onToggleClick });
    const button = byId('hg-toggle') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    button.click();
    expect(onToggleClick).toHaveBeenCalledTimes(1);
  });

  it('hides the overlay UI when showPreview is false but still offers a video element', () => {
    const o = make({ showPreview: false });
    expect(byId('hg-overlay').hidden).toBe(true);
    const video = o.getVideoElement();
    expect(video).toBeInstanceOf(HTMLVideoElement);
    expect(video.isConnected).toBe(true);
  });

  it('attachStream(null) clears srcObject', () => {
    const o = make();
    const video = o.getVideoElement();
    const fake = {} as MediaStream;
    (video as { srcObject: unknown }).srcObject = fake;
    o.attachStream(null);
    expect(video.srcObject).toBeNull();
  });

  it('destroy removes the overlay from the DOM', () => {
    const o = make();
    o.destroy();
    overlay = null;
    expect(document.getElementById('hg-overlay')).toBeNull();
  });

  it('never uses innerHTML', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../src/overlay.ts'), 'utf8');
    expect(source.includes('inner' + 'HTML')).toBe(false);
  });
});
