import { describe, expect, it } from 'vitest';
import { buildBase, buildLut, composite, distanceInside, effectiveMask, hexToRgb } from '../src/render';
import {
  DEFAULT_SETTINGS,
  PRESETS,
  applyPreset,
  frameSize,
  randomGradient,
  resetSettings,
  type SilhouetteSettings,
} from '../src/settings';

/** RGBA picture of `w × h` with an opaque rectangle (x0..x1, y0..y1) on a transparent background. */
function rectPicture(w: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const j = (y * w + x) * 4;
      px[j] = px[j + 1] = px[j + 2] = 90;
      px[j + 3] = 255;
    }
  return px;
}

const flat: SilhouetteSettings = { ...DEFAULT_SETTINGS, grain: 0, soft: 0, glow: 0, detail: 0, tilt: 0, shift: 0 };

function render(px: Uint8ClampedArray, w: number, h: number, s: SilhouetteSettings) {
  const base = buildBase(px, w, h, effectiveMask(s, { hasAlpha: true, borderDark: false }));
  const out = new Uint8ClampedArray(w * h * 4);
  composite(base, s, out);
  return { base, out, at: (x: number, y: number) => Array.from(out.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)) };
}

const near = (a: number[], b: [number, number, number], tol = 6) =>
  a.slice(0, 3).every((v, i) => Math.abs(v - b[i]!) <= tol);
const dist = (a: number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/** The pixel is nearer the first colour than the second. */
const closerTo = (px: number[], a: string, b: string) => dist(px, hexToRgb(a)) < dist(px, hexToRgb(b));

describe('distance', () => {
  it('measures the exact distance to the nearest edge', () => {
    const w = 21;
    const mask = new Float32Array(w * w).fill(1);
    for (let i = 0; i < w; i++) mask[i] = mask[(w - 1) * w + i] = mask[i * w] = mask[i * w + w - 1] = 0;
    const d = distanceInside(mask, w, w);
    expect(d[10 * w + 10]).toBeCloseTo(10, 5); // centre: 10 px from the outer ring
    expect(d[1 * w + 10]).toBeCloseTo(1, 5);
    expect(d[0]).toBe(0);
  });
});

describe('composite', () => {
  it('goes from the edge colour at the border to the core colour in the middle', () => {
    const s = { ...flat, depth: 100 };
    const edge = s.grad[0]!.color;
    const core = s.grad[s.grad.length - 1]!.color;
    const { at, base } = render(rectPicture(60, 60, 10, 10, 50, 50), 60, 60, s);
    expect(base.maxDist).toBe(20);
    expect(closerTo(at(30, 30), core, edge)).toBe(true);
    expect(closerTo(at(10, 30), edge, core)).toBe(true);
    expect(near(at(2, 2), hexToRgb(s.bg))).toBe(true); // outside: the background
  });

  it('reaches the core on thin shapes too: depth is relative to the shape, not the frame', () => {
    const s = { ...flat, depth: 100 };
    // a bar 8 px thick across a 200 × 120 frame: measured against the frame it would never leave the edge colour
    const { at } = render(rectPicture(200, 120, 20, 56, 180, 64), 200, 120, s);
    expect(closerTo(at(100, 60), s.grad[s.grad.length - 1]!.color, s.grad[0]!.color)).toBe(true);
  });

  it('keeps the background transparent when asked', () => {
    const { at } = render(rectPicture(40, 40, 10, 10, 30, 30), 40, 40, { ...flat, transparent: true });
    expect(at(2, 2)[3]).toBe(0);
    expect(at(20, 20)[3]).toBe(255);
  });

  it('looks the same at three times the size', () => {
    const s = { ...DEFAULT_SETTINGS, grain: 0 };
    const small = render(rectPicture(80, 100, 16, 20, 64, 80), 80, 100, s);
    const big = render(rectPicture(240, 300, 48, 60, 192, 240), 240, 300, s);
    for (const [x, y] of [
      [40, 50],
      [20, 50],
      [70, 50],
    ] as const)
      expect(near(small.at(x, y), big.at(x * 3 + 1, y * 3 + 1) as unknown as [number, number, number], 14)).toBe(true);
  });

  it('dithers slow gradients instead of banding them', () => {
    const lut = buildLut([
      { at: 0, color: '#101010' },
      { at: 100, color: '#181818' },
    ]);
    // eight levels spread over 1024 steps: without float steps and dither these would be wide flat bands
    expect(lut[3 * 512]).toBeGreaterThan(19);
    expect(lut[3 * 512]).toBeLessThan(21);
    expect(Number.isInteger(lut[3 * 512])).toBe(false);
  });
});

describe('shape', () => {
  it('uses transparency when the picture has it and brightness otherwise', () => {
    expect(effectiveMask(DEFAULT_SETTINGS, { hasAlpha: true, borderDark: false }).mode).toBe('alpha');
    const luma = effectiveMask(DEFAULT_SETTINGS, { hasAlpha: false, borderDark: true });
    expect(luma).toMatchObject({ mode: 'luma', invert: true });
  });

  it('reports a missing shape', () => {
    const empty = new Uint8ClampedArray(30 * 30 * 4);
    expect(buildBase(empty, 30, 30, { mode: 'alpha', invert: false, threshold: 0.5 }).area).toBe(0);
  });
});

describe('settings', () => {
  it('presets change only the colours', () => {
    const mine = { ...DEFAULT_SETTINGS, depth: 40, aspect: '1:1' as const };
    const next = applyPreset(mine, PRESETS[2]!);
    expect(next.preset).toBe(PRESETS[2]!.id);
    expect(next.bg).toBe(PRESETS[2]!.bg);
    expect(next.depth).toBe(40);
    expect(next.aspect).toBe('1:1');
  });

  it('"reset style" keeps the frame and the shape settings', () => {
    const mine = { ...DEFAULT_SETTINGS, depth: 40, aspect: '1:1' as const, maskMode: 'luma' as const };
    const style = resetSettings(mine, 'style');
    expect(style.depth).toBe(DEFAULT_SETTINGS.depth);
    expect(style.aspect).toBe('1:1');
    expect(style.maskMode).toBe('luma');
    expect(resetSettings(mine, 'all').aspect).toBe(DEFAULT_SETTINGS.aspect);
  });

  it('knows frame sizes, including the picture’s own proportions', () => {
    expect(frameSize('4:5', 1350)).toEqual({ w: 1080, h: 1350 });
    expect(frameSize('16:9', 1350)).toEqual({ w: 1350, h: 759 });
    expect(frameSize('auto', 1000, 2)).toEqual({ w: 1000, h: 500 });
  });

  it('makes random palettes of valid colours', () => {
    let seed = 3;
    const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const grad = randomGradient(rand);
    expect(grad).toHaveLength(4);
    for (const s of grad) expect(s.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});
