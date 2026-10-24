import { afterEach, describe, expect, it, vi } from 'vitest';

function domErr(name: string): Error {
  const e = new Error('raw');
  e.name = name;
  return e;
}

function mockMediaDevices(getUserMedia: unknown): void {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: getUserMedia === undefined ? undefined : { getUserMedia },
    configurable: true,
  });
}

afterEach(() => {
  mockMediaDevices(undefined);
  vi.resetModules();
});

describe('camera', () => {
  it('requests nothing on import', async () => {
    const gum = vi.fn();
    mockMediaDevices(gum);
    await import('../src/camera');
    expect(gum).not.toHaveBeenCalled();
  });

  it('opens the user camera without audio on success', async () => {
    const stream = { getTracks: () => [] } as unknown as MediaStream;
    const gum = vi.fn().mockResolvedValue(stream);
    mockMediaDevices(gum);
    const { openCamera } = await import('../src/camera');
    await expect(openCamera()).resolves.toBe(stream);
    expect(gum).toHaveBeenCalledWith({ video: { facingMode: 'user' }, audio: false });
  });

  it('rejects with a readable message when permission is denied', async () => {
    mockMediaDevices(vi.fn().mockRejectedValue(domErr('NotAllowedError')));
    const { openCamera } = await import('../src/camera');
    await expect(openCamera()).rejects.toThrow(/denied/i);
  });

  it('rejects with a readable message when no camera exists', async () => {
    mockMediaDevices(vi.fn().mockRejectedValue(domErr('NotFoundError')));
    const { openCamera } = await import('../src/camera');
    await expect(openCamera()).rejects.toThrow(/no camera/i);
  });

  it('rejects readably when mediaDevices is missing', async () => {
    mockMediaDevices(undefined);
    const { openCamera } = await import('../src/camera');
    await expect(openCamera()).rejects.toThrow(/camera/i);
  });

  it('maps every error class to plain text', async () => {
    const { describeCameraError } = await import('../src/camera');
    expect(describeCameraError(domErr('SecurityError'))).toMatch(/denied/i);
    expect(describeCameraError(domErr('OverconstrainedError'))).toMatch(/no camera/i);
    expect(describeCameraError(domErr('NotReadableError'))).toMatch(/in use/i);
    const unknown = describeCameraError('<b>x</b>');
    expect(unknown).toMatch(/could not be started/i);
    expect(unknown).not.toMatch(/</);
  });

  it('stopStream stops every track and tolerates null', async () => {
    const tracks = [{ stop: vi.fn() }, { stop: vi.fn() }];
    const { stopStream } = await import('../src/camera');
    stopStream({ getTracks: () => tracks } as unknown as MediaStream);
    for (const t of tracks) expect(t.stop).toHaveBeenCalledTimes(1);
    expect(() => stopStream(null)).not.toThrow();
    expect(() => stopStream(undefined)).not.toThrow();
  });
});
