import { describe, expect, it } from 'vitest';
import { COUNTRY_MASK } from '../src/data/countries';
import { LAND_MASK } from '../src/data/land-mask';
import { buildDots } from '../src/dots';
import {
  DEG,
  apply,
  applyTranspose,
  centerLatLon,
  decodeBinaryMask,
  decodeValueMask,
  gridAt,
  llVec,
  rotationMatrix,
  subsolarPoint,
} from '../src/geo';
import {
  DEFAULT_SETTINGS,
  MAX_OFFSET,
  PRESETS,
  alignOffset,
  applyPreset,
  frameSize,
  resetSettings,
} from '../src/settings';
import { hsl, randomLook } from '../src/shuffle';
import { nearestCity, parseCities, searchCities } from '../src/cities';
import { CITY_DATA } from '../src/data/cities';

const land = decodeBinaryMask(LAND_MASK);
const countries = decodeValueMask(COUNTRY_MASK);
const isLand = (lat: number, lon: number) => gridAt(land, lat * DEG, lon * DEG) === 1;
const country = (lat: number, lon: number) => COUNTRY_MASK.names[gridAt(countries, lat * DEG, lon * DEG) - 1]?.[0];

describe('land mask', () => {
  it('has a plausible share of land', () => {
    const share = land.cells.reduce((a, v) => a + v, 0) / land.cells.length;
    expect(share).toBeGreaterThan(0.28);
    expect(share).toBeLessThan(0.38);
  });

  it('knows land from water', () => {
    expect(isLand(52.37, 4.9)).toBe(true); // Amsterdam
    expect(isLand(-33.87, 151.21)).toBe(true); // Sydney
    expect(isLand(0, -30)).toBe(false); // Atlantic
    expect(isLand(0, -150)).toBe(false); // Pacific
  });

  it('has no fake ring of land along the Chukotka cut (regression)', () => {
    // a full latitude row of land around 71°N was a rasterization bug
    let row = 0;
    for (let lon = -180; lon < 180; lon += 1) row += isLand(71, lon) ? 1 : 0;
    expect(row / 360).toBeLessThan(0.8);
  });

  it('fills Antarctica to the pole (regression)', () => {
    for (let lon = -180; lon < 180; lon += 30) expect(isLand(-89.5, lon)).toBe(true);
  });
});

describe('country grid', () => {
  it('returns Russian names', () => {
    expect(country(52.37, 4.9)).toBe('Нидерланды');
    expect(country(48.86, 2.35)).toBe('Франция');
    expect(country(55.75, 37.62)).toBe('Россия');
    expect(country(40.71, -74.01)).toBe('США');
  });

  it('has unique names', () => {
    const names = COUNTRY_MASK.names.map(n => n[0]);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('rotation', () => {
  it('puts the chosen point in the middle of the view', () => {
    for (const [lat, lon] of [
      [30, 15],
      [-45, 120],
      [60, -100],
    ] as const) {
      const [cLat, cLon] = centerLatLon(rotationMatrix(-lon, lat, 0));
      expect(cLat).toBeCloseTo(lat, 6);
      expect(cLon).toBeCloseTo(lon, 6);
    }
  });

  it('transpose undoes the rotation', () => {
    const m = rotationMatrix(37, -12, 20);
    const v = llVec(10, 20);
    const back = applyTranspose(m, apply(m, v));
    back.forEach((x, i) => expect(x).toBeCloseTo(v[i]!, 9));
  });
});

describe('sun', () => {
  it('stands over the equator near the March equinox at noon UTC on the Greenwich meridian', () => {
    const [lat, lon] = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 12, 0, 0)));
    expect(Math.abs(lat)).toBeLessThan(2);
    expect(Math.abs(lon)).toBeLessThan(1);
  });
});

describe('dots', () => {
  it('keeps only land dots unless ocean is on', () => {
    const d = buildDots(DEFAULT_SETTINGS, land, countries);
    expect(d.count).toBeGreaterThan(1000);
    expect(d.land.length).toBe(d.count);
    const withOcean = buildDots({ ...DEFAULT_SETTINGS, ocean: true }, land, countries);
    expect(withOcean.count).toBeGreaterThan(d.count * 2);
  });
});

describe('settings', () => {
  it('presets keep markers, routes, countries and the frame', () => {
    const mine = {
      ...DEFAULT_SETTINGS,
      countries: [5],
      routes: [{ id: 1, from: 1, to: 1 }],
      aspect: '16:9' as const,
      zoom: 1.5,
      roll: 20,
    };
    const next = applyPreset(mine, PRESETS[1]!);
    expect(next.preset).toBe(PRESETS[1]!.id);
    expect(next.countries).toEqual([5]);
    expect(next.routes).toEqual(mine.routes);
    expect(next.aspect).toBe('16:9');
    expect(next.zoom).toBe(1.5);
    expect(next.roll).toBe(20);
  });

  it('"reset style" keeps content and the frame, "reset all" drops both', () => {
    const mine = { ...DEFAULT_SETTINGS, countries: [5], dotSize: 1.2, aspect: '1:1' as const, roll: 20 };
    const style = resetSettings(mine, 'style');
    expect(style.countries).toEqual([5]);
    expect(style.dotSize).toBe(DEFAULT_SETTINGS.dotSize);
    expect(style.aspect).toBe('1:1');
    expect(style.roll).toBe(20);
    const all = resetSettings(mine, 'all');
    expect(all.countries).toEqual([]);
    expect(all.aspect).toBe(DEFAULT_SETTINGS.aspect);
  });

  it('knows frame sizes', () => {
    expect(frameSize({ aspect: '4:5', customW: 1, customH: 1 })).toEqual({ w: 1080, h: 1350 });
    expect(frameSize({ aspect: 'custom', customW: 1600, customH: 900 })).toEqual({ w: 1600, h: 900 });
  });
});

describe('shuffle', () => {
  // small deterministic generator so the test does not depend on Math.random
  const seeded = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

  it('converts HSL to hex', () => {
    expect(hsl(0, 1, 0.5)).toBe('#ff0000');
    expect(hsl(120, 1, 0.5)).toBe('#00ff00');
    expect(hsl(240, 1, 0.25)).toBe('#000080');
    expect(hsl(-120, 0, 1)).toBe('#ffffff');
  });

  it('builds varied looks and keeps content, frame and motion', () => {
    const mine = {
      ...DEFAULT_SETTINGS,
      markers: [{ id: 1, label: 'X', lat: 1, lon: 2 }],
      countries: [5],
      aspect: '9:16' as const,
      rotSpeed: 20,
    };
    const rand = seeded(42);
    const looks = Array.from({ length: 12 }, () => randomLook(mine, rand));
    for (const l of looks) {
      expect(l.markers).toBe(mine.markers);
      expect(l.countries).toBe(mine.countries);
      expect(l.aspect).toBe('9:16');
      expect(l.rotSpeed).toBe(20);
      expect(l.preset).toBeNull();
      expect(l.colorA).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(new Set(looks.map(l => l.shape)).size).toBeGreaterThan(3);
    expect(new Set(looks.map(l => l.colorB)).size).toBe(12);
  });
});

describe('align', () => {
  it('puts the globe edge on the frame edge', () => {
    const s = { aspect: '16:9' as const, customW: 1, customH: 1, zoom: 0.8 };
    // across, the radius is zoom / aspect in clip units
    expect(alignOffset(s, 'left').offX).toBeCloseTo(-1 + 0.8 / (16 / 9), 4);
    expect(alignOffset(s, 'right').offX).toBeCloseTo(1 - 0.8 / (16 / 9), 4);
    expect(alignOffset(s, 'top')).toEqual({ offY: 0.2 });
    expect(alignOffset(s, 'bottom')).toEqual({ offY: -0.2 });
    expect(alignOffset(s, 'center')).toEqual({ offX: 0 });
    expect(alignOffset({ ...s, zoom: 4 }, 'top')).toEqual({ offY: -MAX_OFFSET }); // clamped like the slider
  });
});

describe('cities', () => {
  const cities = parseCities(CITY_DATA);
  const names = (q: string) => searchCities(cities, q).map(c => c.name);

  it('has the whole world with Russian names and countries', () => {
    expect(cities.length).toBeGreaterThan(7000);
    for (const name of ['Казань', 'Сочи', 'Калининград', 'Майами', 'Астана', 'Пхукет', 'Мюнхен', 'Бишкек']) {
      expect(cities.some(c => c.name === name)).toBe(true);
    }
    expect(cities.find(c => c.name === 'Казань')).toMatchObject({ country: 'Россия', lat: 55.75, lon: 49.12 });
    expect(cities.filter(c => !c.country).length).toBeLessThan(20);
  });

  it('ranks prefix matches and large cities first', () => {
    expect(names('')[0]).toBe('Токио');
    expect(names('моск')[0]).toBe('Москва');
    expect(names('сан')[0]).toMatch(/^Сан/);
    // a word inside the name: "Франциско" finds San Francisco before names that merely contain the letters
    expect(names('франц')).toContain('Сан-Франциско');
    expect(names('кишинев')).toEqual(['Кишинёв']); // ё and е are one letter
    expect(names('нет такого города')).toEqual([]);
  });

  it('names a hand-placed point after the closest city, if one is near', () => {
    expect(nearestCity(cities, 55.7, 49.2)?.name).toBe('Казань');
    expect(nearestCity(cities, 0, -140)).toBeNull(); // the middle of the Pacific
  });
});
