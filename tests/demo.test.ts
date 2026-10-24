import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(import.meta.dirname, '..', 'index.html'), 'utf8');
const doc = new DOMParser().parseFromString(html, 'text/html');

/** Every URL the page itself loads (scripts, stylesheets, images, ...), not text inside code blocks. */
function loadedUrls(): string[] {
  const urls: string[] = [];
  doc.querySelectorAll('[src]').forEach((el) => urls.push(el.getAttribute('src') ?? ''));
  doc.querySelectorAll('link[href]').forEach((el) => urls.push(el.getAttribute('href') ?? ''));
  return urls;
}

describe('demo index.html', () => {
  it('is a reveal.js deck with at least 5 slides and a vertical stack', () => {
    const slides = doc.querySelector('.reveal > .slides');
    expect(slides).not.toBeNull();
    const all = slides!.querySelectorAll('section');
    expect(all.length).toBeGreaterThanOrEqual(5);
    const stacks = Array.from(slides!.querySelectorAll(':scope > section')).filter(
      (s) => s.querySelectorAll(':scope > section').length >= 2,
    );
    expect(stacks.length).toBeGreaterThanOrEqual(1);
  });

  it('shows a gesture hint on the title slide naming the gestures, the G key and the start button', () => {
    const first = doc.querySelector('.reveal > .slides > section');
    const hint = first?.querySelector('.slide-hint');
    expect(hint).not.toBeNull();
    const text = hint!.textContent ?? '';
    expect(text).toMatch(/swipe/i);
    expect(text).toMatch(/palm/i);
    expect(text).toMatch(/fist/i);
    expect(hint!.querySelector('.kbd')?.textContent?.trim().toLowerCase()).toBe('g');
    expect(text).toMatch(/button/i);
  });

  it('loads the IIFE bundle with a classic script tag', () => {
    const tag = doc.querySelector('script[src="./dist/hand-gestures.iife.js"]');
    expect(tag).not.toBeNull();
    const type = tag!.getAttribute('type');
    expect(type === null || type === 'text/javascript').toBe(true);
    expect(doc.querySelectorAll('script[type="module"]').length).toBe(0);
  });

  it('pins reveal.js to one fixed version, never "latest"', () => {
    const reveal = loadedUrls().filter((u) => u.includes('reveal.js'));
    expect(reveal.length).toBeGreaterThanOrEqual(2);
    const versions = new Set<string>();
    for (const u of reveal) {
      const m = u.match(/reveal\.js@(\d+\.\d+\.\d+)\//);
      expect(m, u).not.toBeNull();
      versions.add(m![1]);
    }
    expect(versions.size).toBe(1);
    expect(html).not.toMatch(/latest/i);
  });

  it('loads nothing from an external host besides the pinned CDN', () => {
    for (const u of loadedUrls()) {
      if (/^(https?:)?\/\//i.test(u)) {
        expect(new URL(u, 'https://example.invalid/').host, u).toBe('cdn.jsdelivr.net');
      }
    }
    expect(html).not.toMatch(/@import/);
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)/);
  });

  it('wires the reveal adapter and starts nothing on load', () => {
    const inline = Array.from(doc.querySelectorAll('script:not([src])'))
      .map((s) => s.textContent ?? '')
      .join('\n');
    expect(inline).toMatch(/Reveal\.initialize\(/);
    expect(inline).toMatch(/HandGestures\.createGestureControl\(\{\s*adapter:\s*HandGestures\.revealAdapter\(Reveal\)/);
    expect(inline).not.toMatch(/getUserMedia/);
    expect(inline).not.toMatch(/\.start\(\)/);
  });
});
