import { gridAt, mulberry32, type Grid, type Vec3 } from './geo';
import type { GlobeSettings } from './settings';

export interface DotBuffers {
  /** xyz on the unit sphere */
  pos: Float32Array;
  /** land (1/0), random 0..1 */
  info: Float32Array;
  /** country index per dot (0 = none or ocean) */
  country: Uint8Array;
  count: number;
  /** land dots, for effects that start from a random point on land */
  land: Vec3[];
}

/**
 * Lays dots out on the sphere and keeps the ones on land (and on water if asked).
 * Spacing is π / density radians, so point size can be derived from density alone.
 */
export function buildDots(
  s: Pick<GlobeSettings, 'density' | 'layout' | 'jitter' | 'ocean'>,
  land: Grid,
  countries: Grid | null,
): DotBuffers {
  const n = Math.max(8, Math.round(s.density));
  const rand = mulberry32(1337);
  const jit = s.jitter;
  const pos: number[] = [];
  const info: number[] = [];
  const country: number[] = [];
  const landDots: Vec3[] = [];
  const step = Math.PI / n;

  const add = (latIn: number, lon: number) => {
    let lat = latIn;
    if (lat > Math.PI / 2) lat = Math.PI - lat;
    else if (lat < -Math.PI / 2) lat = -Math.PI - lat;
    const r = rand();
    const isLand = gridAt(land, lat, lon) === 1;
    if (!isLand && !s.ocean) return;
    const cl = Math.cos(lat);
    const v: Vec3 = [cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon)];
    pos.push(v[0], v[1], v[2]);
    info.push(isLand ? 1 : 0, r);
    country.push(isLand && countries ? gridAt(countries, lat, lon) : 0);
    if (isLand) landDots.push(v);
  };

  if (s.layout === 'fib') {
    const total = Math.round((n * n * 4) / Math.PI);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let k = 0; k < total; k++) {
      const lat = Math.asin(1 - (2 * (k + 0.5)) / total);
      const lon = ((k * golden) % (2 * Math.PI)) - Math.PI;
      add(lat + (rand() - 0.5) * jit * step, lon + ((rand() - 0.5) * jit * step) / Math.max(0.05, Math.cos(lat)));
    }
  } else {
    for (let i = 0; i < n; i++) {
      const lat = -Math.PI / 2 + (i + 0.5) * step;
      const count = s.layout === 'grid' ? 2 * n : Math.max(1, Math.round(2 * n * Math.cos(lat)));
      const offset = s.layout === 'hex' && i & 1 ? 0.5 : 0;
      const lonStep = (2 * Math.PI) / count;
      for (let j = 0; j < count; j++) {
        add(
          lat + (rand() - 0.5) * jit * step,
          -Math.PI + (j + 0.5 + offset) * lonStep + (rand() - 0.5) * jit * lonStep,
        );
      }
    }
  }

  return {
    pos: new Float32Array(pos),
    info: new Float32Array(info),
    country: new Uint8Array(country),
    count: pos.length / 3,
    land: landDots,
  };
}

/** 1 for dots in a highlighted country, 0 otherwise. */
export function highlightBuffer(dots: DotBuffers, selected: readonly number[]): Float32Array {
  const set = new Set(selected);
  const out = new Float32Array(dots.count);
  if (!set.size) return out;
  for (let i = 0; i < dots.count; i++) out[i] = set.has(dots.country[i]!) ? 1 : 0;
  return out;
}
