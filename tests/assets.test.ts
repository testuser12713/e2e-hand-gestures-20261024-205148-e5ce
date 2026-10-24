import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ASSET_BASE_URL,
  DEFAULT_MODEL_URL,
  MEDIAPIPE_VERSION,
  resolveModelUrl,
  resolveWasmUrl,
  validateAssetBaseUrl,
} from '../src/assets';

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '..', 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
};

describe('validateAssetBaseUrl', () => {
  it('accepts https URLs and strips trailing slashes', () => {
    expect(validateAssetBaseUrl('https://cdn.example.org/mp')).toBe('https://cdn.example.org/mp');
    expect(validateAssetBaseUrl('https://cdn.example.org/mp/')).toBe('https://cdn.example.org/mp');
    expect(validateAssetBaseUrl('  https://cdn.example.org/mp//  ')).toBe('https://cdn.example.org/mp');
  });

  it('accepts relative and same-origin paths', () => {
    expect(validateAssetBaseUrl('/vendor/mediapipe/')).toBe('/vendor/mediapipe');
    expect(validateAssetBaseUrl('./mediapipe')).toBe('./mediapipe');
    expect(validateAssetBaseUrl('mediapipe')).toBe('mediapipe');
    expect(validateAssetBaseUrl(`${location.origin}/mp`)).toBe(`${location.origin}/mp`);
  });

  it('rejects javascript: with a readable message', () => {
    expect(() => validateAssetBaseUrl('javascript:alert(1)')).toThrow(/assetBaseUrl is not allowed.*javascript:/);
    expect(() => validateAssetBaseUrl('JavaScript:alert(1)')).toThrow(Error);
    expect(() => validateAssetBaseUrl('java\tscript:alert(1)')).toThrow(/control characters/);
  });

  it('rejects data:, file-like and other schemes', () => {
    expect(() => validateAssetBaseUrl('data:text/plain,abc')).toThrow(/data:/);
    expect(() => validateAssetBaseUrl('file:///etc/mp')).toThrow(/file:/);
    expect(() => validateAssetBaseUrl('ftp://example.org/mp')).toThrow(Error);
    expect(() => validateAssetBaseUrl('blob:https://example.org/x')).toThrow(Error);
    expect(() => validateAssetBaseUrl('\\\\evil.example\\mp')).toThrow(Error);
  });

  it('rejects http: to another origin and empty values', () => {
    expect(() => validateAssetBaseUrl('http://cdn.example.org/mp')).toThrow(/http/);
    expect(() => validateAssetBaseUrl('//cdn.example.org/mp')).toThrow(Error);
    expect(() => validateAssetBaseUrl('')).toThrow(/empty/);
    expect(() => validateAssetBaseUrl('   ')).toThrow(/empty/);
  });

  it('accepts the default asset base URL', () => {
    expect(validateAssetBaseUrl(DEFAULT_ASSET_BASE_URL)).toBe(DEFAULT_ASSET_BASE_URL);
  });
});

describe('pinned default assets', () => {
  it('pins the CDN path to the package.json version of @mediapipe/tasks-vision, never latest', () => {
    const declared = pkg.dependencies['@mediapipe/tasks-vision'];
    expect(declared).toMatch(/^\d+\.\d+\.\d+$/);
    expect(MEDIAPIPE_VERSION).toBe(declared);
    expect(DEFAULT_ASSET_BASE_URL).toBe(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${declared}`,
    );
    expect(DEFAULT_ASSET_BASE_URL).not.toMatch(/latest/i);
    expect(DEFAULT_MODEL_URL).not.toMatch(/latest/i);
    expect(DEFAULT_MODEL_URL.startsWith('https://')).toBe(true);
  });

  it('resolves wasm and model URLs from the base', () => {
    expect(resolveWasmUrl('/vendor/mp')).toBe('/vendor/mp/wasm');
    expect(resolveModelUrl('/vendor/mp')).toBe('/vendor/mp/hand_landmarker.task');
    expect(resolveModelUrl('https://cdn.example.org/mp/')).toBe('https://cdn.example.org/mp/hand_landmarker.task');
    expect(resolveWasmUrl(DEFAULT_ASSET_BASE_URL)).toBe(`${DEFAULT_ASSET_BASE_URL}/wasm`);
    expect(resolveModelUrl(DEFAULT_ASSET_BASE_URL)).toBe(DEFAULT_MODEL_URL);
    expect(DEFAULT_MODEL_URL.endsWith('/hand_landmarker.task')).toBe(true);
  });
});
