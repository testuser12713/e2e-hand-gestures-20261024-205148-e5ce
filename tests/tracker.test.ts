import { beforeEach, describe, expect, it, vi } from 'vitest';

const mp = vi.hoisted(() => {
  const detectForVideo = vi.fn();
  const close = vi.fn();
  const landmarker = { detectForVideo, close };
  return {
    detectForVideo,
    close,
    landmarker,
    forVisionTasks: vi.fn(async (_base: string) => ({ wasmLoaderPath: 'x', wasmBinaryPath: 'y' })),
    createFromOptions: vi.fn(async (_fileset: unknown, _opts: unknown) => landmarker),
  };
});

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mp.forVisionTasks },
  HandLandmarker: { createFromOptions: mp.createFromOptions },
}));

import { createHandTracker } from '../src/tracker';

function readyVideo(): HTMLVideoElement {
  const v = document.createElement('video');
  Object.defineProperty(v, 'readyState', { value: 4 });
  return v;
}

function hand(n = 21) {
  return Array.from({ length: n }, (_, i) => ({ x: i / 100, y: 0.5, z: -0.01, visibility: 1 }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.createFromOptions.mockImplementation(async () => mp.landmarker);
});

describe('createHandTracker', () => {
  it('loads nothing on creation, only inside init()', async () => {
    const t = createHandTracker({ assetBaseUrl: '/vendor/mp' });
    expect(mp.forVisionTasks).not.toHaveBeenCalled();
    expect(mp.createFromOptions).not.toHaveBeenCalled();
    expect(t.detect(readyVideo(), 1)).toBeNull();

    await t.init();
    expect(mp.forVisionTasks).toHaveBeenCalledWith('/vendor/mp/wasm');
    expect(mp.createFromOptions).toHaveBeenCalledTimes(1);
    const options = mp.createFromOptions.mock.calls[0][1] as {
      baseOptions: { modelAssetPath: string; delegate: string };
      runningMode: string;
      numHands: number;
    };
    expect(options.numHands).toBe(1);
    expect(options.runningMode).toBe('VIDEO');
    expect(options.baseOptions.delegate).toBe('GPU');
    expect(options.baseOptions.modelAssetPath).toBe('/vendor/mp/hand_landmarker.task');
  });

  it('with the default base contacts only the pinned CDN (wasm) and the pinned model storage', async () => {
    const { DEFAULT_ASSET_BASE_URL } = await import('../src/assets');
    const t = createHandTracker({ assetBaseUrl: DEFAULT_ASSET_BASE_URL });
    expect(mp.forVisionTasks).not.toHaveBeenCalled();
    await t.init();
    const wasm = new URL(mp.forVisionTasks.mock.calls[0][0]);
    const model = new URL(
      (mp.createFromOptions.mock.calls[0][1] as { baseOptions: { modelAssetPath: string } }).baseOptions.modelAssetPath,
    );
    expect(wasm.host).toBe('cdn.jsdelivr.net');
    expect(model.host).toBe('storage.googleapis.com');
    expect(wasm.protocol).toBe('https:');
    expect(model.protocol).toBe('https:');
    expect(`${wasm.href}${model.href}`).not.toMatch(/latest/i);
  });

  it('falls back to the CPU delegate when GPU fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mp.createFromOptions.mockRejectedValueOnce(new Error('no webgl'));
    const t = createHandTracker({ assetBaseUrl: '/vendor/mp' });
    await t.init();
    expect(mp.createFromOptions).toHaveBeenCalledTimes(2);
    expect((mp.createFromOptions.mock.calls[1][1] as { baseOptions: { delegate: string } }).baseOptions.delegate).toBe(
      'CPU',
    );
    warn.mockRestore();
  });

  it('rejects init() when loading fails', async () => {
    mp.forVisionTasks.mockRejectedValueOnce(new Error('network down'));
    const t = createHandTracker({ assetBaseUrl: '/vendor/mp' });
    await expect(t.init()).rejects.toThrow('network down');
    expect(t.detect(readyVideo(), 1)).toBeNull();
  });

  it('maps the first hand to 21 plain landmarks', async () => {
    const t = createHandTracker({ assetBaseUrl: '/vendor/mp' });
    await t.init();
    mp.detectForVideo.mockReturnValueOnce({ landmarks: [hand(), hand()], worldLandmarks: [], handedness: [] });
    const lm = t.detect(readyVideo(), 100);
    expect(lm).not.toBeNull();
    expect(lm).toHaveLength(21);
    expect(lm![5]).toEqual({ x: 0.05, y: 0.5, z: -0.01 });
  });

  it('returns null without a hand, with an incomplete hand or before a frame is ready', async () => {
    const t = createHandTracker({ assetBaseUrl: '/vendor/mp' });
    await t.init();
    mp.detectForVideo.mockReturnValueOnce({ landmarks: [] });
    expect(t.detect(readyVideo(), 100)).toBeNull();
    mp.detectForVideo.mockReturnValueOnce({ landmarks: [hand(5)] });
    expect(t.detect(readyVideo(), 200)).toBeNull();
    const calls = mp.detectForVideo.mock.calls.length;
    expect(t.detect(document.createElement('video'), 300)).toBeNull();
    expect(mp.detectForVideo.mock.calls.length).toBe(calls);
  });

  it('passes strictly increasing timestamps', async () => {
    const t = createHandTracker({ assetBaseUrl: '/vendor/mp' });
    await t.init();
    mp.detectForVideo.mockReturnValue({ landmarks: [] });
    t.detect(readyVideo(), 50);
    t.detect(readyVideo(), 50);
    t.detect(readyVideo(), 10);
    const ts = mp.detectForVideo.mock.calls.map((c) => c[1] as number);
    expect(ts[1]).toBeGreaterThan(ts[0]);
    expect(ts[2]).toBeGreaterThan(ts[1]);
  });

  it('close() releases the landmarker and detect returns null afterwards', async () => {
    const t = createHandTracker({ assetBaseUrl: '/vendor/mp' });
    await t.init();
    t.close();
    expect(mp.close).toHaveBeenCalledTimes(1);
    expect(t.detect(readyVideo(), 1)).toBeNull();
    t.close();
    expect(mp.close).toHaveBeenCalledTimes(1);
  });

  it('releases a landmarker that finishes loading after close()', async () => {
    const t = createHandTracker({ assetBaseUrl: '/vendor/mp' });
    const p = t.init();
    t.close();
    await p;
    expect(mp.close).toHaveBeenCalledTimes(1);
    expect(t.detect(readyVideo(), 1)).toBeNull();
  });
});
