import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dts from 'vite-plugin-dts';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

const root = import.meta.dirname;
const outDir = resolve(root, 'dist');

/** The demo page at the repo root loads the bundle from `./dist/`; inside `dist/` it sits next to it. */
const BUNDLE_FROM_ROOT = './dist/hand-gestures.iife.js';
const BUNDLE_FROM_DIST = './hand-gestures.iife.js';

/**
 * Ship the demo with the build: copies `index.html` (bundle path rewritten) and the fonts it uses
 * into `dist/`, so the built folder is a servable, self-contained demo.
 */
function demoPage(): Plugin {
  return {
    name: 'hand-gestures-demo-page',
    apply: 'build',
    closeBundle() {
      const html = readFileSync(resolve(root, 'index.html'), 'utf8');
      writeFileSync(resolve(outDir, 'index.html'), html.split(BUNDLE_FROM_ROOT).join(BUNDLE_FROM_DIST));
      const fonts = resolve(root, 'fonts');
      if (existsSync(fonts)) cpSync(fonts, resolve(outDir, 'fonts'), { recursive: true });
    },
  };
}

export default defineConfig({
  // The demo page references its files relatively; nothing is copied from a public folder.
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
    lib: {
      entry: resolve(root, 'src/index.ts'),
      name: 'HandGestures',
      formats: ['iife', 'es'],
      fileName: (format) => `hand-gestures.${format}.js`,
    },
    // Nothing is external: both bundles include @mediapipe/tasks-vision, so the IIFE works
    // as a single classic script (also from file://).
  },
  plugins: [
    dts({
      tsconfigPath: resolve(root, 'tsconfig.json'),
      entryRoot: resolve(root, 'src'),
      include: ['src'],
      outDirs: outDir,
    }),
    demoPage(),
  ],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
