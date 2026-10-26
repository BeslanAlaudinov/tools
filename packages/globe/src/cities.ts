import { COUNTRY_MASK } from './data/countries';

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export interface City extends Place {
  /** Russian country name; empty for a few places without one (Antarctic stations). */
  country: string;
}

const COUNTRY_BY_ISO = new Map(COUNTRY_MASK.names.map(([name, iso]) => [iso, name]));

/** Parses the generated "name|lat|lon|ISO" lines, keeping their order (largest city first). */
export function parseCities(data: string): City[] {
  return data.split('\n').map(line => {
    const [name = '', lat = '0', lon = '0', iso = ''] = line.split('|');
    return { name, lat: Number(lat), lon: Number(lon), country: COUNTRY_BY_ISO.get(iso) ?? '' };
  });
}

let loading: Promise<readonly City[]> | null = null;

/**
 * All ~7 000 cities of Natural Earth with Russian names. The list is ~230 KB, so it is a separate chunk
 * loaded the first time someone looks for a city; a failed load can be retried.
 */
export function loadCities(): Promise<readonly City[]> {
  loading ??= import('./data/cities').then(
    m => parseCities(m.CITY_DATA),
    err => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

/**
 * Cities matching the query: names that start with it first, then names with a word that starts with it,
 * then any other match; within each group larger cities come first. Ё and Е are the same letter.
 */
export function searchCities(cities: readonly City[], query: string, limit = 5): City[] {
  const q = norm(query.trim());
  if (!q) return cities.slice(0, limit);
  const groups: City[][] = [[], [], []];
  for (const c of cities) {
    const n = norm(c.name);
    const at = n.indexOf(q);
    if (at < 0) continue;
    const group = at === 0 ? 0 : /[\s-]/.test(n[at - 1] ?? '') ? 1 : 2;
    groups[group]!.push(c);
    if (groups[0]!.length >= limit) break;
  }
  return groups.flat().slice(0, limit);
}

/** Regions for "turn to…". */
export const REGIONS: readonly Place[] = [
  { name: 'Европа', lat: 50, lon: 15 },
  { name: 'Африка', lat: 5, lon: 20 },
  { name: 'Ближний Восток', lat: 28, lon: 45 },
  { name: 'Азия', lat: 38, lon: 95 },
  { name: 'Австралия', lat: -25, lon: 134 },
  { name: 'Северная Америка', lat: 42, lon: -100 },
  { name: 'Южная Америка', lat: -15, lon: -60 },
  { name: 'Тихий океан', lat: 5, lon: -160 },
  { name: 'Северный полюс', lat: 90, lon: 0 },
  { name: 'Антарктида', lat: -90, lon: 0 },
];

/** The city closest to a point, if one is within `maxKm`; used to name a marker placed by hand. */
export function nearestCity(cities: readonly City[], lat: number, lon: number, maxKm = 75): City | null {
  const R = 6371;
  const rad = Math.PI / 180;
  let best: City | null = null;
  let bestKm = maxKm;
  for (const c of cities) {
    const dLat = (c.lat - lat) * rad;
    const dLon = (c.lon - lon) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(c.lat * rad) * Math.sin(dLon / 2) ** 2;
    const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
    if (km < bestKm) {
      best = c;
      bestKm = km;
    }
  }
  return best;
}
