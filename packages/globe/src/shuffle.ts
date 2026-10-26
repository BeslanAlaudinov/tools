// "Shuffle": a new look built from scratch rather than a nudged preset. Colors come from a harmony around a
// random hue, so a look stays coherent while two looks in a row rarely resemble each other.

import {
  DEFAULT_SETTINGS,
  FX_DEFAULTS,
  type BgMode,
  type ColorMode,
  type FxType,
  type GlobeSettings,
  type Layout,
  type Shape,
} from './settings';

type Rand = () => number;

const pick = <T>(rand: Rand, items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;
const range = (rand: Rand, min: number, max: number, step = 0.01) =>
  Number((min + Math.round((rand() * (max - min)) / step) * step).toFixed(4));
const chance = (rand: Rand, p: number) => rand() < p;
/** Weighted pick: [value, weight] pairs. */
function weighted<T>(rand: Rand, items: readonly (readonly [T, number])[]): T {
  let r = rand() * items.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of items) if ((r -= w) < 0) return v;
  return items[items.length - 1]![0];
}

/** HSL (h in degrees, s and l in 0..1) to #rrggbb. */
export function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** Second hue of the palette, relative to the base: analogous, complementary, triadic, split or the same. */
const HARMONIES = [
  [30, 3],
  [-40, 2],
  [180, 2],
  [120, 1],
  [150, 1],
  [0, 2],
] as const;

const SHAPES: readonly Shape[] = ['circle', 'square', 'ring', 'plus', 'hex', 'diamond', 'dash', 'glyph'];

/** A random style on top of the current settings; content, frame and motion setup are kept. */
export function randomLook(current: GlobeSettings, rand: Rand = Math.random): GlobeSettings {
  const hue = rand() * 360;
  const hue2 = hue + weighted(rand, HARMONIES);
  const light = chance(rand, 0.18); // now and then a light "print" look instead of a dark one

  // palette: ink is the main dot color, accent is the vivid one, bg is nearly black or nearly white
  const ink = light
    ? hsl(hue, range(rand, 0.2, 0.6), range(rand, 0.1, 0.22))
    : hsl(hue, range(rand, 0.2, 0.7), range(rand, 0.82, 0.95));
  const accent = hsl(hue2, range(rand, 0.65, 0.95), light ? range(rand, 0.4, 0.5) : range(rand, 0.52, 0.66));
  const soft = hsl(hue2, range(rand, 0.5, 0.8), light ? 0.3 : 0.8);
  const bg1 = light
    ? hsl(hue, range(rand, 0.1, 0.3), range(rand, 0.9, 0.96))
    : hsl(hue, range(rand, 0.2, 0.6), range(rand, 0.02, 0.07));
  const bg2 = light
    ? hsl(hue2, range(rand, 0.2, 0.4), range(rand, 0.8, 0.88))
    : hsl(hue2, range(rand, 0.4, 0.8), range(rand, 0.1, 0.2));

  let shape = pick(rand, SHAPES);
  if (shape === current.shape) shape = pick(rand, SHAPES); // a second roll makes a repeat unlikely
  const layout: Layout = weighted(rand, [
    ['rows', 3],
    ['hex', 2],
    ['grid', 1],
    ['fib', 2],
  ]);
  const colorMode: ColorMode = weighted(rand, [
    ['solid', 1],
    ['edge', 3],
    ['lat', 2],
    ['flow', 2],
    ['random', 1],
  ]);
  const bgMode: BgMode = weighted(rand, [
    ['solid', 3],
    ['vertical', 1],
    ['radial', 2],
  ]);
  const fxOn = chance(rand, 0.75);
  const fx: FxType = pick(rand, ['random', 'center', 'radar', 'scan', 'meridian', 'breath'] as const);
  const ocean = chance(rand, 0.35);
  // thin shapes carry little ink, so they get fewer, larger marks; otherwise the globe nearly disappears
  const thin = shape === 'glyph' || shape === 'dash' || shape === 'plus' || shape === 'ring';
  const density = thin ? range(rand, 70, 160, 1) : range(rand, 80, 220, 1);
  const dotSize = Math.max(thin ? range(rand, 0.6, 1.05) : range(rand, 0.4, 1), density > 170 ? 0.55 : 0);

  const look: Partial<GlobeSettings> = {
    shape,
    layout,
    density,
    dotSize,
    edgeShrink: range(rand, 0.2, 0.8),
    jitter: chance(rand, 0.25) ? range(rand, 0.1, 0.6) : 0,
    backOpacity: range(rand, 0, 0.14),
    ocean,
    oceanColor: accent,
    oceanOpacity: range(rand, 0.08, 0.3),
    oceanSize: range(rand, 0.3, 0.9),
    colorMode,
    colorA: ink,
    colorB: accent,
    flowSpeed: range(rand, 0.05, 0.4),
    flowFreq: range(rand, 1, 4, 0.5),
    glow: light ? 0 : range(rand, 0, 0.7),
    fillColor: bg2,
    fillOpacity: chance(rand, 0.25) ? range(rand, 0.3, 0.8) : 0,
    atmoColor: accent,
    atmo: light ? range(rand, 0, 0.15) : range(rand, 0, 0.5),
    atmoWidth: range(rand, 0.04, 0.14),
    shimmer: range(rand, 0, 0.6),
    fxOn,
    fx,
    ...FX_DEFAULTS[fx],
    fxColor: light ? accent : soft,
    fxAmount: range(rand, 0.5, 1),
    dayNight: chance(rand, 0.15),
    nightColor: bg2,
    nightDim: range(rand, 0.3, 0.55),
    hiColor: light ? accent : soft,
    markerAccent: accent,
    markerStyle: light ? 'solid' : current.markerStyle,
    markerBg: light ? ink : current.markerBg,
    arcColor: light ? ink : soft,
    arcComet: accent,
    bgMode,
    bg1,
    bg2,
    vignette: light ? 0 : range(rand, 0, 0.35),
    grain: range(rand, 0, 0.07),
  };

  return { ...DEFAULT_SETTINGS, ...keepNonStyle(current), ...look, preset: null };
}

/** Everything the user set up that is not the look: content, frame, rotation, sun and marker layout. */
function keepNonStyle(s: GlobeSettings): Partial<GlobeSettings> {
  return {
    countries: s.countries,
    markers: s.markers,
    routes: s.routes,
    countryClick: s.countryClick,
    aspect: s.aspect,
    customW: s.customW,
    customH: s.customH,
    zoom: s.zoom,
    offX: s.offX,
    offY: s.offY,
    roll: s.roll,
    autoRotate: s.autoRotate,
    rotSpeed: s.rotSpeed,
    rotDir: s.rotDir,
    sunMode: s.sunMode,
    sunLon: s.sunLon,
    sunLat: s.sunLat,
    markerSize: s.markerSize,
    markerText: s.markerText,
    markerLine: s.markerLine,
    markerPulse: s.markerPulse,
    hiSize: s.hiSize,
    hiDim: s.hiDim,
    arcWidth: s.arcWidth,
    arcHeight: s.arcHeight,
    arcOpacity: s.arcOpacity,
    arcSpeed: s.arcSpeed,
    arcCometLen: s.arcCometLen,
    arcDash: s.arcDash,
  };
}
