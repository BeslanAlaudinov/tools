// Everything that describes a globe. The whole object is plain JSON: it is what gets saved, undone,
// exported as code and, later, stored as a user's project.

export type Shape = 'circle' | 'square' | 'ring' | 'plus' | 'hex' | 'diamond' | 'dash' | 'glyph';
export type Layout = 'rows' | 'hex' | 'grid' | 'fib';
export type ColorMode = 'solid' | 'edge' | 'lat' | 'flow' | 'random';
export type FxType = 'random' | 'center' | 'markers' | 'radar' | 'scan' | 'meridian' | 'breath';
export type BgMode = 'solid' | 'vertical' | 'radial' | 'transparent';
export type MarkerStyle = 'glass-dark' | 'glass-light' | 'solid';
export type MarkerSize = 'S' | 'M' | 'L' | 'XL';
export type Aspect = '1:1' | '4:5' | '3:4' | '16:9' | '9:16' | 'custom';

export interface Marker {
  id: number;
  label: string;
  lat: number;
  lon: number;
}
export interface Route {
  id: number;
  from: number;
  to: number;
}

export interface GlobeSettings {
  // dots
  shape: Shape;
  layout: Layout;
  density: number;
  dotSize: number;
  edgeShrink: number;
  jitter: number;
  backOpacity: number;
  ocean: boolean;
  oceanColor: string;
  oceanOpacity: number;
  oceanSize: number;
  // color
  colorMode: ColorMode;
  colorA: string;
  colorB: string;
  flowSpeed: number;
  flowFreq: number;
  glow: number;
  fillColor: string;
  fillOpacity: number;
  atmoColor: string;
  atmo: number;
  atmoWidth: number;
  // motion
  autoRotate: boolean;
  rotSpeed: number;
  rotDir: 1 | -1;
  shimmer: number;
  shimmerSpeed: number;
  fxOn: boolean;
  fx: FxType;
  fxColor: string;
  fxAmount: number;
  fxSpeed: number;
  fxWidth: number;
  fxRange: number;
  dayNight: boolean;
  sunMode: 'real' | 'manual';
  sunLon: number;
  sunLat: number;
  nightColor: string;
  nightDim: number;
  nightSoft: number;
  // layers
  countries: number[];
  countryClick: boolean;
  hiColor: string;
  hiSize: number;
  hiDim: number;
  markers: Marker[];
  markerStyle: MarkerStyle;
  markerSize: MarkerSize;
  markerAccent: string;
  markerBg: string;
  markerText: string;
  markerLine: number;
  markerPulse: boolean;
  routes: Route[];
  arcColor: string;
  arcComet: string;
  arcWidth: number;
  arcHeight: number;
  arcOpacity: number;
  arcSpeed: number;
  arcCometLen: number;
  arcDash: boolean;
  // frame
  aspect: Aspect;
  customW: number;
  customH: number;
  zoom: number;
  offX: number;
  offY: number;
  roll: number;
  bgMode: BgMode;
  bg1: string;
  bg2: string;
  vignette: number;
  grain: number;
  /** Preset the style came from; null once the user changes a style value. */
  preset: string | null;
}

/** Where the camera looks. Not part of undo history: dragging the globe is not an edit. */
export interface GlobeView {
  yaw: number;
  pitch: number;
}

export const DEFAULT_VIEW: GlobeView = { yaw: -15, pitch: 30 };

export const DEFAULT_SETTINGS: GlobeSettings = {
  shape: 'circle',
  layout: 'rows',
  density: 140,
  dotSize: 0.6,
  edgeShrink: 0.6,
  jitter: 0,
  backOpacity: 0.06,
  ocean: false,
  oceanColor: '#b9a8ff',
  oceanOpacity: 0.15,
  oceanSize: 0.6,
  colorMode: 'edge',
  colorA: '#f4f0ff',
  colorB: '#7c5cff',
  flowSpeed: 0.15,
  flowFreq: 2,
  glow: 0.3,
  fillColor: '#000000',
  fillOpacity: 0,
  atmoColor: '#7c5cff',
  atmo: 0.22,
  atmoWidth: 0.07,
  autoRotate: true,
  rotSpeed: 6,
  rotDir: 1,
  shimmer: 0.3,
  shimmerSpeed: 1,
  fxOn: true,
  fx: 'radar',
  fxColor: '#ffffff',
  fxAmount: 0.8,
  fxSpeed: 0.2,
  fxWidth: 24,
  fxRange: 60,
  dayNight: false,
  sunMode: 'real',
  sunLon: 60,
  sunLat: 15,
  nightColor: '#2a1460',
  nightDim: 0.55,
  nightSoft: 0.12,
  countries: [],
  countryClick: false,
  hiColor: '#ffffff',
  hiSize: 1.3,
  hiDim: 0.4,
  markers: [{ id: 1, label: 'Нидерланды', lat: 52.37, lon: 4.9 }],
  markerStyle: 'glass-dark',
  markerSize: 'M',
  markerAccent: '#7c5cff',
  markerBg: '#111814',
  markerText: '#ffffff',
  markerLine: 28,
  markerPulse: true,
  routes: [],
  arcColor: '#b9a8ff',
  arcComet: '#ffffff',
  arcWidth: 1.5,
  arcHeight: 0.35,
  arcOpacity: 0.55,
  arcSpeed: 0.25,
  arcCometLen: 0.2,
  arcDash: false,
  aspect: '16:9',
  customW: 1600,
  customH: 900,
  zoom: 0.82,
  offX: 0,
  offY: 0,
  roll: 0,
  bgMode: 'solid',
  bg1: '#000000',
  bg2: '#1d0d3a',
  vignette: 0.25,
  grain: 0.04,
  preset: 'amethyst',
};

/** Keys that belong to content the user built by hand. "Reset style" keeps them. */
export const CONTENT_KEYS = ['countries', 'markers', 'routes'] as const satisfies readonly (keyof GlobeSettings)[];

/** The frame and where the globe sits in it (the «Кадр» tab). Presets and "reset style" leave them alone. */
export const FRAME_KEYS = [
  'aspect',
  'customW',
  'customH',
  'zoom',
  'offX',
  'offY',
  'roll',
] as const satisfies readonly (keyof GlobeSettings)[];

function keep(next: GlobeSettings, current: GlobeSettings, keys: readonly (keyof GlobeSettings)[]) {
  for (const k of keys) (next as unknown as Record<string, unknown>)[k] = structuredClone(current[k]);
}

/** Changing these rebuilds the dot buffers; everything else is a uniform update. */
export const GEOMETRY_KEYS = [
  'density',
  'layout',
  'jitter',
  'ocean',
] as const satisfies readonly (keyof GlobeSettings)[];

export const MARKER_SCALE: Record<MarkerSize, number> = { S: 0.75, M: 1, L: 1.3, XL: 1.7 };

export interface FrameFormat {
  id: Exclude<Aspect, 'custom'>;
  w: number;
  h: number;
}
export const FRAME_FORMATS: FrameFormat[] = [
  { id: '1:1', w: 1080, h: 1080 },
  { id: '4:5', w: 1080, h: 1350 },
  { id: '3:4', w: 1080, h: 1440 },
  { id: '16:9', w: 1920, h: 1080 },
  { id: '9:16', w: 1080, h: 1920 },
];

/** Frame size in px for the current aspect. */
export function frameSize(s: Pick<GlobeSettings, 'aspect' | 'customW' | 'customH'>): { w: number; h: number } {
  if (s.aspect === 'custom') return { w: s.customW, h: s.customH };
  const f = FRAME_FORMATS.find(x => x.id === s.aspect) ?? FRAME_FORMATS[0]!;
  return { w: f.w, h: f.h };
}

/** How far the globe can be shifted off the frame center, in clip units (2 = 200%: fully past the edge). */
export const MAX_OFFSET = 2;

/** Zoom range: the globe's radius as a share of half the frame height. */
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

/**
 * Offset that puts the globe's edge on the frame's edge (or its center on the frame's axis), like Figma's align.
 * Offsets are in clip space (-1..1, y up); the globe's radius there is zoom / aspect across and zoom down.
 */
export function alignOffset(
  s: Pick<GlobeSettings, 'aspect' | 'customW' | 'customH' | 'zoom'>,
  align: Align,
): Partial<Pick<GlobeSettings, 'offX' | 'offY'>> {
  const { w, h } = frameSize(s);
  const rx = s.zoom / (w / h);
  const ry = s.zoom;
  const fit = (v: number) => Number(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, v)).toFixed(4));
  switch (align) {
    case 'left':
      return { offX: fit(-1 + rx) };
    case 'center':
      return { offX: 0 };
    case 'right':
      return { offX: fit(1 - rx) };
    case 'top':
      return { offY: fit(1 - ry) };
    case 'middle':
      return { offY: 0 };
    case 'bottom':
      return { offY: fit(-1 + ry) };
  }
}

/** Speed, width and range that suit each overlay effect; applied when the user switches effect. */
export const FX_DEFAULTS: Record<FxType, Partial<GlobeSettings>> = {
  random: { fxSpeed: 0.35, fxWidth: 4, fxRange: 60 },
  center: { fxSpeed: 0.3, fxWidth: 6, fxRange: 90 },
  markers: { fxSpeed: 0.5, fxWidth: 3, fxRange: 25 },
  radar: { fxSpeed: 0.2, fxWidth: 24 },
  scan: { fxSpeed: 0.25, fxWidth: 8 },
  meridian: { fxSpeed: 0.12, fxWidth: 10 },
  breath: { fxSpeed: 0.25 },
};

export interface Preset {
  id: string;
  name: string;
  /** Style values on top of the defaults. Content (markers, routes, countries) is never touched. */
  values: Partial<GlobeSettings>;
}

export const PRESETS: Preset[] = [
  { id: 'amethyst', name: 'Аметист', values: {} },
  {
    id: 'matrix',
    name: 'Матрица',
    values: {
      shape: 'glyph',
      density: 155,
      dotSize: 0.6,
      edgeShrink: 0.46,
      colorMode: 'random',
      colorA: '#d4ffe0',
      colorB: '#1fd65f',
      glow: 0.45,
      atmoColor: '#1fd65f',
      atmo: 0.16,
      ocean: true,
      oceanOpacity: 0.16,
      oceanSize: 1,
      shimmer: 0.6,
      fx: 'scan',
      fxSpeed: 0.25,
      fxWidth: 8,
      fxColor: '#d4ffe0',
      hiColor: '#d4ffe0',
      markerAccent: '#1fd65f',
      arcColor: '#1fd65f',
      arcComet: '#d4ffe0',
      oceanColor: '#1fd65f',
      nightColor: '#0b3a1c',
      bg2: '#04140a',
    },
  },
  {
    id: 'sunset',
    name: 'Закат',
    values: {
      colorA: '#fff4dc',
      colorB: '#ff7a3d',
      atmoColor: '#ff7a3d',
      bg1: '#0d0705',
      bg2: '#3a120c',
      bgMode: 'radial',
      fx: 'meridian',
      fxSpeed: 0.12,
      fxWidth: 10,
      fxAmount: 0.6,
      fxColor: '#ffe7b0',
      markerAccent: '#ff7a3d',
      arcColor: '#ffc061',
      arcComet: '#ffffff',
      hiColor: '#ffe7b0',
      nightColor: '#3a120c',
    },
  },
  {
    id: 'ice',
    name: 'Лёд',
    values: {
      shape: 'ring',
      colorMode: 'lat',
      colorA: '#63c6ff',
      colorB: '#f2fbff',
      atmoColor: '#7fd4ff',
      atmo: 0.4,
      atmoWidth: 0.09,
      bg1: '#06142a',
      bg2: '#0e3563',
      bgMode: 'radial',
      density: 110,
      dotSize: 0.75,
      fxAmount: 0.6,
      markerAccent: '#7fd4ff',
      arcColor: '#bfe9ff',
      hiColor: '#ffffff',
      nightColor: '#1b3f73',
    },
  },
  {
    id: 'blueprint',
    name: 'Чертёж',
    values: {
      shape: 'square',
      colorMode: 'solid',
      colorA: '#e8f0ff',
      bg1: '#0d2c6e',
      glow: 0,
      atmo: 0,
      shimmer: 0,
      fxOn: false,
      ocean: true,
      oceanColor: '#7b97d1',
      oceanOpacity: 0.35,
      oceanSize: 0.45,
      backOpacity: 0,
      dotSize: 0.5,
      edgeShrink: 0.3,
      vignette: 0.2,
      grain: 0.03,
      hiColor: '#ffd166',
      markerAccent: '#ffd166',
      arcColor: '#ffffff',
      arcComet: '#ffd166',
      nightColor: '#7b97d1',
    },
  },
  {
    id: 'paper',
    name: 'Бумага',
    values: {
      colorMode: 'solid',
      colorA: '#1c1d1f',
      bg1: '#efede8',
      glow: 0,
      atmo: 0,
      ocean: true,
      oceanColor: '#1c1d1f',
      oceanOpacity: 0.12,
      oceanSize: 0.45,
      shimmer: 0,
      fxOn: false,
      backOpacity: 0.05,
      vignette: 0,
      grain: 0.05,
      dotSize: 0.55,
      edgeShrink: 0.5,
      hiColor: '#e4572e',
      hiDim: 0.55,
      markerStyle: 'solid',
      markerBg: '#1c1d1f',
      markerAccent: '#e4572e',
      arcColor: '#1c1d1f',
      arcComet: '#e4572e',
      arcOpacity: 0.7,
      nightColor: '#1c1d1f',
      nightDim: 0.75,
    },
  },
];

/** Settings for a preset: defaults, then the preset, then the user's content and frame kept as they are. */
export function applyPreset(current: GlobeSettings, preset: Preset): GlobeSettings {
  const next: GlobeSettings = { ...DEFAULT_SETTINGS, ...preset.values, preset: preset.id };
  keep(next, current, CONTENT_KEYS);
  keep(next, current, FRAME_KEYS);
  return next;
}

/**
 * Settings back to defaults. 'style' keeps what the user built (markers, routes, countries) and the frame;
 * 'all' drops everything.
 */
export function resetSettings(current: GlobeSettings, scope: 'style' | 'all'): GlobeSettings {
  const next: GlobeSettings = structuredClone(DEFAULT_SETTINGS);
  if (scope === 'style') {
    keep(next, current, CONTENT_KEYS);
    keep(next, current, FRAME_KEYS);
  }
  return next;
}
