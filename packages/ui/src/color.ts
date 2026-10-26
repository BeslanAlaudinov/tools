export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export const isHex = (s: string) => /^#[0-9a-f]{6}$/i.test(s);

/** "ff4747", "#FF4747" → "#FF4747"; null when it is not a 6-digit hex color. */
export function normalizeHex(input: string): string | null {
  const v = input.trim().startsWith('#') ? input.trim() : `#${input.trim()}`;
  return isHex(v) ? v.toUpperCase() : null;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`.toUpperCase();
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

// recently used colors, shared by every color field of every tool; newest first
const RECENT_KEY = 'tools.recent-colors';
const RECENT_MAX = 8;
let recent: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    if (Array.isArray(raw))
      recent = raw.filter((x): x is string => typeof x === 'string' && isHex(x)).slice(0, RECENT_MAX);
  } catch {
    /* storage unavailable: start empty */
  }
}

export const recentColors = {
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  get(): string[] {
    load();
    return recent;
  },
  add(hex: string) {
    const v = normalizeHex(hex);
    if (!v) return;
    load();
    recent = [v, ...recent.filter(c => c !== v)].slice(0, RECENT_MAX);
    try {
      window.localStorage.setItem(RECENT_KEY, JSON.stringify(recent));
    } catch {
      /* not critical */
    }
    listeners.forEach(f => f());
  },
};
