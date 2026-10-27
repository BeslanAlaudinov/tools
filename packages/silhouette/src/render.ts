// The effect itself, as pure functions over pixel arrays: no DOM, so it runs in a worker, on the main thread
// and in tests alike.
//
// Two stages. `buildBase` turns the picture (already drawn into the frame) into a shape mask, its luminance and,
// for every inside pixel, the distance to the edge — it depends only on the picture, the frame and how the shape
// is found, so it is cached while colours and glow change. `composite` turns that into the final colours.

import { sortedStops, type GradientStop, type MaskMode, type SilhouetteSettings } from './settings';

export interface MaskSpec {
  mode: 'alpha' | 'luma';
  /** For luma: the object is lighter than its background. */
  invert: boolean;
  threshold: number;
}

/** What is known about the picture once it is loaded. */
export interface SourceInfo {
  hasAlpha: boolean;
  /** The picture's border is dark, so in luma mode the object is the light part. */
  borderDark: boolean;
}

export interface Base {
  width: number;
  height: number;
  mask: Float32Array;
  lum: Float32Array;
  dist: Float32Array;
  /** Distance from the edge to the deepest point of the shape: its half-thickness. */
  maxDist: number;
  meanLum: number;
  /** Share of the frame covered by the shape; near 0 means the shape was not found. */
  area: number;
}

/** How the shape is found. "auto" uses transparency when the picture has it, brightness otherwise. */
export function effectiveMask(
  s: Pick<SilhouetteSettings, 'maskMode' | 'invert' | 'threshold'>,
  info: SourceInfo,
): MaskSpec {
  const mode: MaskMode = s.maskMode === 'auto' ? (info.hasAlpha ? 'alpha' : 'luma') : s.maskMode;
  if (mode === 'alpha') return { mode: 'alpha', invert: false, threshold: s.threshold };
  return { mode: 'luma', invert: s.maskMode === 'auto' ? info.borderDark : s.invert, threshold: s.threshold };
}

export const smoothstep = (e0: number, e1: number, x: number) => {
  let t = (x - e0) / (e1 - e0);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
};

// ---------- blur ----------

function boxPass(s: Float32Array, d: Float32Array, w: number, h: number, r: number, horiz: boolean) {
  const len = horiz ? w : h;
  const lines = horiz ? h : w;
  const step = horiz ? 1 : w;
  const inv = 1 / (2 * r + 1);
  const last = len - 1;
  for (let l = 0; l < lines; l++) {
    const base = horiz ? l * w : l;
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += s[base + (k < 0 ? 0 : k > last ? last : k) * step]!;
    for (let i = 0; i < len; i++) {
      d[base + i * step] = sum * inv;
      const a = i + r + 1;
      const b = i - r;
      sum += s[base + (a > last ? last : a) * step]! - s[base + (b < 0 ? 0 : b) * step]!;
    }
  }
}

/** Three box passes approximate a gaussian with sigma ≈ the radius. Blurs `buf` in place. */
export function blur(buf: Float32Array, tmp: Float32Array, w: number, h: number, sigma: number) {
  if (sigma < 0.5) return;
  const r = Math.max(1, Math.round(sigma));
  for (let p = 0; p < 3; p++) {
    boxPass(buf, tmp, w, h, r, true);
    boxPass(tmp, buf, w, h, r, false);
  }
}

// ---------- distance ----------

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) {
      k--;
      s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1]! < q) k++;
    const dq = q - v[k]!;
    d[q] = dq * dq + f[v[k]!]!;
  }
}

/** Exact euclidean distance from every inside pixel to the nearest outside one (Felzenszwalb–Huttenlocher). */
export function distanceInside(mask: Float32Array, w: number, h: number): Float32Array {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const out = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x]! > 0.5 ? 1e20 : 0;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) f[x] = out[o + x]!;
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[o + x] = Math.sqrt(d[x]!);
  }
  return out;
}

// ---------- base ----------

/** `px`: the picture drawn into the frame, RGBA. */
export function buildBase(px: Uint8ClampedArray, width: number, height: number, spec: MaskSpec): Base {
  const n = width * height;
  const mask = new Float32Array(n);
  const lum = new Float32Array(n);
  const e = 0.04;
  let sumM = 0;
  let sumL = 0;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const a = px[j + 3]! / 255;
    const l = (0.2126 * px[j]! + 0.7152 * px[j + 1]! + 0.0722 * px[j + 2]!) / 255;
    const m =
      spec.mode === 'alpha'
        ? a
        : (spec.invert
            ? smoothstep(spec.threshold - e, spec.threshold + e, l)
            : smoothstep(spec.threshold + e, spec.threshold - e, l)) * a;
    mask[i] = m;
    lum[i] = l;
    sumM += m;
    sumL += l * m;
  }
  const meanLum = sumM > 0 ? sumL / sumM : 0.5;
  // outside the shape luminance is neutral, so the edge does not read as a dark detail
  for (let i = 0; i < n; i++) lum[i] = lum[i]! * mask[i]! + meanLum * (1 - mask[i]!);
  const dist = distanceInside(mask, width, height);
  let maxDist = 0;
  for (let i = 0; i < n; i++) if (dist[i]! > maxDist) maxDist = dist[i]!;
  return { width, height, mask, lum, dist, maxDist, meanLum, area: sumM / n };
}

// ---------- colour ----------

/** 1024 steps kept as floats: colour is rounded to 8 bits once, at the very end, with dither. */
export const LUT_STEPS = 1024;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function buildLut(grad: readonly GradientStop[]): Float32Array {
  const stops = sortedStops(grad).map(s => ({ at: s.at / 100, rgb: hexToRgb(s.color) }));
  const lut = new Float32Array(LUT_STEPS * 3);
  for (let i = 0; i < LUT_STEPS; i++) {
    const x = i / (LUT_STEPS - 1);
    let j = 0;
    while (j < stops.length - 1 && stops[j + 1]!.at < x) j++;
    const a = stops[j]!;
    const b = stops[Math.min(j + 1, stops.length - 1)]!;
    let t = b.at > a.at ? (x - a.at) / (b.at - a.at) : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = a.rgb[c]! + (b.rgb[c]! - a.rgb[c]!) * t;
  }
  return lut;
}

export function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise: grain specks are soft and round at any size, never square blocks. */
function valueNoise(fx: number, fy: number, seed: number): number {
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/**
 * Final colours into `out` (RGBA, width × height × 4). Sizes are relative to the frame, so a 3× export is the
 * same picture with three times the pixels.
 */
export function composite(base: Base, s: SilhouetteSettings, out: Uint8ClampedArray): void {
  const { width: W, height: H } = base;
  const n = W * H;
  const S = Math.min(W, H);
  const softPx = (s.soft / 100) * S;
  const glowPx = (s.glow / 100) * S;
  // depth is measured against the shape's own thickness, so thin letters reach the core as well as a figure
  const depthPx = Math.max(0.5, (s.depth / 100) * base.maxDist);
  const tmp = new Float32Array(n);

  const alphaSrc = base.mask.slice();
  blur(alphaSrc, tmp, W, H, softPx);
  let halo: Float32Array | null = null;
  if (s.glowAmt > 0 && glowPx >= 0.5) {
    halo = base.mask.slice();
    blur(halo, tmp, W, H, glowPx);
  }
  const t = base.dist.slice();
  const inv = 1 / depthPx;
  for (let i = 0; i < n; i++) {
    const v = t[i]! * inv;
    t[i] = v > 1 ? 1 : v;
  }
  blur(t, tmp, W, H, softPx * 0.8 + depthPx * 0.18);
  let shade: Float32Array | null = null;
  if (s.detail !== 0) {
    shade = base.lum.slice();
    blur(shade, tmp, W, H, Math.max(1, S * 0.003 + softPx * 0.4));
  }

  const lut = buildLut(s.grad);
  const [bgR, bgG, bgB] = hexToRgb(s.bg);
  const ang = (s.tiltAngle * Math.PI) / 180;
  const ax = Math.cos(ang);
  const ay = Math.sin(ang);
  const half = S / 2;
  // grain specks scale with the frame, so the grain looks the same at any export size
  const grain = s.grain * 255;
  const gsz = Math.max(0.7, (s.grainSize * S) / 900);
  const seed = s.seed | 0;
  const curve = s.balance;
  const detail = s.detail * 2.2;
  const tilt = s.tilt * 0.5;
  const glowAmt = s.glowAmt * 2;
  const meanLum = base.meanLum;

  for (let y = 0; y < H; y++) {
    const py = (y - H / 2) * ay;
    const gy = y / gsz;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const j = i * 4;
      const a = alphaSrc[i]!;
      let alpha = smoothstep(0, 0.62, a);
      if (halo) {
        const hv = halo[i]! * glowAmt;
        if (hv > alpha) alpha = hv > 1 ? 1 : hv;
      }
      let v = Math.pow(t[i]!, curve) + s.shift;
      if (shade) v += detail * (meanLum - shade[i]!) * (a < 0.5 ? a * 2 : 1);
      if (tilt) v -= (tilt * ((x - W / 2) * ax + py)) / half;
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const li = ((v * (LUT_STEPS - 1) + 0.5) | 0) * 3;
      // ±1 level of triangular dither hides 8-bit banding in slow, dark gradients; far below visible noise
      let noise = hash(x, y, seed ^ 0x5bd1e995) + hash(x, y, seed ^ 0x27d4eb2f) - 1;
      if (grain) {
        const gx = x / gsz;
        noise += (valueNoise(gx, gy, seed) + valueNoise(gx + 31.7, gy + 17.3, seed + 1) - 1) * grain;
      }
      if (s.transparent) {
        out[j] = lut[li]! + noise;
        out[j + 1] = lut[li + 1]! + noise;
        out[j + 2] = lut[li + 2]! + noise;
        out[j + 3] = alpha * 255;
      } else {
        out[j] = bgR + (lut[li]! - bgR) * alpha + noise;
        out[j + 1] = bgG + (lut[li + 1]! - bgG) * alpha + noise;
        out[j + 2] = bgB + (lut[li + 2]! - bgB) * alpha + noise;
        out[j + 3] = 255;
      }
    }
  }
}
