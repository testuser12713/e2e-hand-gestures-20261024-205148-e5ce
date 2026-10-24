import { afterEach, describe, expect, it, vi } from 'vitest';
import * as lib from '../src/index';
import { Emitter } from '../src/emitter';
import { DEFAULT_OPTIONS, resolveOptions } from '../src/options';
import type { GestureControl } from '../src/types';

describe('createGestureControl', () => {
  let control: GestureControl | null = null;

  afterEach(() => {
    control?.stop();
    control = null;
  });

  it('returns the full controller API', () => {
    control = lib.createGestureControl();
    for (const method of [
      'start',
      'stop',
      'enable',
      'disable',
      'toggle',
      'on',
      'off',
      'isRunning',
      'isEnabled',
    ] as const) {
      expect(typeof control[method]).toBe('function');
    }
  });

  it('starts neutral: not running and not enabled before the user starts it', () => {
    control = lib.createGestureControl();
    expect(control.isRunning()).toBe(false);
    expect(control.isEnabled()).toBe(false);
  });

  it('does not request the camera when it is created', () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    try {
      control = lib.createGestureControl();
      expect(getUserMedia).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  it('emits "loading" on start and "off" on stop, and lets handlers be removed', async () => {
    control = lib.createGestureControl({ adapter: { handle() {} } });
    const seen: string[] = [];
    const handler = (s: { status: string }) => seen.push(s.status);
    control.on('status', handler);
    await control.start();
    control.stop();
    expect(seen[0]).toBe('loading');
    expect(seen[seen.length - 1]).toBe('off');
    expect(control.isRunning()).toBe(false);
    control.off('status', handler);
    seen.length = 0;
    await control.start();
    control.stop();
    expect(seen).toEqual([]);
  });

  it('start() never rejects, whatever the outcome', async () => {
    control = lib.createGestureControl({ adapter: { handle() {} } });
    await expect(control.start()).resolves.toBeUndefined();
  });
});

describe('Emitter', () => {
  it('calls handlers with the payload and stops after off()', () => {
    const e = new Emitter();
    const h = vi.fn();
    e.on('gesture', h);
    e.emit('gesture', { type: 'SWIPE_LEFT', timestamp: 1 });
    expect(h).toHaveBeenCalledWith({ type: 'SWIPE_LEFT', timestamp: 1 });
    e.off('gesture', h);
    e.emit('gesture', { type: 'SWIPE_RIGHT', timestamp: 2 });
    expect(h).toHaveBeenCalledTimes(1);
  });

  it('keeps events apart and ignores unknown events', () => {
    const e = new Emitter();
    const a = vi.fn();
    const b = vi.fn();
    e.on('a', a);
    e.on('b', b);
    e.emit('a', 1);
    e.emit('nobody-listens', 2);
    e.off('nobody-listens', a);
    expect(a).toHaveBeenCalledWith(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('isolates a throwing handler from the others', () => {
    const e = new Emitter();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    e.on('status', () => {
      throw new Error('boom');
    });
    e.on('status', after);
    expect(() => e.emit('status', { status: 'off' })).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('resolveOptions', () => {
  it('applies the documented defaults', () => {
    const o = resolveOptions({});
    expect(o.mirror).toBe(true);
    expect(o.cooldownMs).toBe(800);
    expect(o.showPreview).toBe(true);
    expect(o.toggleKey).toBe('g');
    expect(o.invertSwipe).toBe(false);
    expect(o.adapter).toBeUndefined();
    expect(o.swipeDistance).toBeGreaterThan(0);
    expect(o.swipeMaxDurationMs).toBeGreaterThan(0);
    expect(o.holdMs).toBeGreaterThan(0);
    expect(['top-left', 'top-right', 'bottom-left', 'bottom-right']).toContain(o.previewPosition);
    expect(resolveOptions()).toEqual(o);
  });

  it('pins the default asset URL to a fixed version over https', () => {
    const url = DEFAULT_OPTIONS.assetBaseUrl;
    expect(url.startsWith('https://')).toBe(true);
    expect(url).toMatch(/@\d+\.\d+\.\d+/);
    expect(url).not.toMatch(/latest/i);
  });

  it('keeps valid user values and replaces invalid ones with defaults', () => {
    const adapter = { handle() {} };
    const o = resolveOptions({
      adapter,
      mirror: false,
      cooldownMs: 300,
      holdMs: -5,
      swipeDistance: Number.NaN,
      toggleKey: 'h',
      invertSwipe: true,
      previewPosition: 'top-right',
      showPreview: false,
    });
    expect(o.adapter).toBe(adapter);
    expect(o.mirror).toBe(false);
    expect(o.cooldownMs).toBe(300);
    expect(o.holdMs).toBe(DEFAULT_OPTIONS.holdMs);
    expect(o.swipeDistance).toBe(DEFAULT_OPTIONS.swipeDistance);
    expect(o.toggleKey).toBe('h');
    expect(o.invertSwipe).toBe(true);
    expect(o.previewPosition).toBe('top-right');
    expect(o.showPreview).toBe(false);
  });
});

describe('src/index.ts', () => {
  it('exports every runtime symbol of the contract', () => {
    expect(typeof lib.createGestureControl).toBe('function');
    expect(typeof lib.revealAdapter).toBe('function');
    expect(typeof lib.keyboardAdapter).toBe('function');
    expect(typeof lib.createRecognizer).toBe('function');
    expect(typeof lib.resolveOptions).toBe('function');
    expect(typeof lib.DEFAULT_OPTIONS).toBe('object');
    expect(typeof lib.DEFAULT_REVEAL_MAPPING).toBe('object');
    expect(typeof lib.DEFAULT_KEY_MAPPING).toBe('object');
  });

  it('adapters and recogniser return objects of the contract shape', () => {
    expect(typeof lib.keyboardAdapter().handle).toBe('function');
    expect(typeof lib.revealAdapter({}).handle).toBe('function');
    const r = lib.createRecognizer({
      cooldownMs: 800,
      swipeDistance: 0.2,
      swipeMaxDurationMs: 500,
      holdMs: 1000,
      invertSwipe: false,
      mirror: true,
    });
    expect(typeof r.update).toBe('function');
    expect(typeof r.reset).toBe('function');
  });
});
