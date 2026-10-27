// Everything that describes a silhouette, as plain JSON: it is what gets saved, undone and, later, shared.
// The picture itself is not part of the settings.

export type Aspect = '4:5' | '1:1' | '3:4' | '9:16' | '16:9' | 'auto';
export type MaskMode = 'auto' | 'alpha' | 'luma';

/** One colour of the gradient; `at` is 0 (edge) … 100 (core). */
export interface GradientStop {
  at: number;
  color: string;
}

export interface SilhouetteSettings {
  // colour
  grad: GradientStop[];
  bg: string;
  transparent: boolean;
  grain: number;
  grainSize: number;
  seed: number;
  // glow
  /** How much of the shape the colour takes to reach the core, in % of the shape's own thickness. */
  depth: number;
  /** Edge softness, % of the frame's short side. */
  soft: number;
  /** Halo radius, % of the frame's short side. */
  glow: number;
  glowAmt: number;
  /** Edge ↔ core balance: below 1 widens the core, above 1 widens the edge. */
  balance: number;
  shift: number;
  /** How much the picture's own shading tints the colour. */
  detail: number;
  tilt: number;
  tiltAngle: number;
  // frame
  aspect: Aspect;
  padding: number;
  // shape
  maskMode: MaskMode;
  threshold: number;
  invert: boolean;
  /** Preset the colours came from; null once the user changes the gradient or background. */
  preset: string | null;
}

export interface Preset {
  id: string;
  name: string;
  bg: string;
  grad: GradientStop[];
}

const g = (...stops: [number, string][]): GradientStop[] => stops.map(([at, color]) => ({ at, color }));

export const PRESETS: Preset[] = [
  {
    id: 'mint',
    name: 'Мята',
    bg: '#c7cdd5',
    grad: g([0, '#f3d64a'], [22, '#c3dc3e'], [48, '#6fcf3c'], [78, '#3fae37'], [100, '#22803a']),
  },
  {
    id: 'thermal',
    name: 'Тепловизор',
    bg: '#101119',
    grad: g([0, '#3a1c9c'], [28, '#b3207e'], [52, '#f04a2a'], [76, '#ffb21a'], [100, '#fff4c4']),
  },
  {
    id: 'aura',
    name: 'Аура',
    bg: '#ebe7f1',
    grad: g([0, '#ffd4ea'], [30, '#ff86c8'], [62, '#a066ff'], [100, '#3a2bb5']),
  },
  {
    id: 'ice',
    name: 'Лёд',
    bg: '#d9e0e6',
    grad: g([0, '#e9f8ff'], [30, '#9fdcff'], [65, '#3d8af7'], [100, '#16307f']),
  },
  {
    id: 'sunset',
    name: 'Закат',
    bg: '#efe6de',
    grad: g([0, '#ffe38f'], [30, '#ff9c4f'], [64, '#ff4f6e'], [100, '#6f1d5a']),
  },
  { id: 'negative', name: 'Негатив', bg: '#16181b', grad: g([0, '#ffffff'], [45, '#9aa3ad'], [100, '#24282e']) },
  {
    id: 'acid',
    name: 'Кислота',
    bg: '#1a1a1f',
    grad: g([0, '#00e5ff'], [40, '#7cff4f'], [75, '#f8ff3a'], [100, '#ff3df2']),
  },
  {
    id: 'night',
    name: 'Ночь',
    bg: '#05060a',
    grad: g([0, '#1b2a6b'], [40, '#7c5cff'], [80, '#c9b8ff'], [100, '#ffffff']),
  },
];

export const DEFAULT_SETTINGS: SilhouetteSettings = {
  grad: PRESETS[1]!.grad,
  bg: PRESETS[1]!.bg,
  transparent: false,
  grain: 0.06,
  grainSize: 1,
  seed: 7,
  depth: 85,
  soft: 1.6,
  glow: 4,
  glowAmt: 0.35,
  balance: 1,
  shift: 0,
  detail: 0.8,
  tilt: 0.25,
  tiltAngle: 90,
  aspect: '4:5',
  padding: 12,
  maskMode: 'auto',
  threshold: 0.5,
  invert: false,
  preset: 'thermal',
};

/** Version of the saved-settings format. */
export const SETTINGS_VERSION = 1;

/** Keys a preset sets. Changing one of them by hand means the look no longer is that preset. */
export const PRESET_KEYS = ['grad', 'bg'] as const satisfies readonly (keyof SilhouetteSettings)[];

export function applyPreset(current: SilhouetteSettings, preset: Preset): SilhouetteSettings {
  return { ...current, grad: preset.grad.map(s => ({ ...s })), bg: preset.bg, preset: preset.id };
}

/** Back to defaults: everything, or only the look (colour and glow) with the frame and shape kept. */
export function resetSettings(current: SilhouetteSettings, scope: 'style' | 'all'): SilhouetteSettings {
  const next: SilhouetteSettings = structuredClone(DEFAULT_SETTINGS);
  if (scope === 'style') {
    next.aspect = current.aspect;
    next.padding = current.padding;
    next.maskMode = current.maskMode;
    next.threshold = current.threshold;
    next.invert = current.invert;
  }
  return next;
}

export const sortedStops = (grad: readonly GradientStop[]) => grad.slice().sort((a, b) => a.at - b.at);

/** Base size of the frame (1× export): the long side is 1350 px, like a 4:5 post. */
export const BASE_LONG_SIDE = 1350;

/** Frame size for a long side of `long` px. "Like the picture" needs the picture's proportions. */
export function frameSize(aspect: Aspect, long: number, pictureRatio = 0.8): { w: number; h: number } {
  let ratio = pictureRatio;
  if (aspect !== 'auto') {
    const [a, b] = aspect.split(':').map(Number);
    ratio = a! / b!;
  }
  return ratio >= 1
    ? { w: long, h: Math.max(1, Math.round(long / ratio)) }
    : { w: Math.max(1, Math.round(long * ratio)), h: long };
}

/** HSL (h in degrees, s and l in 0..100) to #rrggbb. */
function hsl(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  s /= 100;
  l /= 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** A random four-colour palette that walks around the colour wheel from a light edge to a deep core. */
export function randomGradient(rand: () => number = Math.random): GradientStop[] {
  const h = rand() * 360;
  const dir = rand() < 0.5 ? -1 : 1;
  const span = 50 + rand() * 130;
  return [0, 30, 65, 100].map((at, k) => ({ at, color: hsl(h + (dir * span * k) / 3, 92 - k * 6, 74 - k * 16) }));
}
