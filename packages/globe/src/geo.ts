// Geometry and geo data helpers shared by the renderer, the overlay and the UI.
// Sphere convention: x = cos(lat)·sin(lon), y = sin(lat), z = cos(lat)·cos(lon); lon 0 faces the viewer at yaw 0.

export const DEG = Math.PI / 180;

export type Vec3 = [number, number, number];
/** Row-major 3×3 matrix. */
export type Mat3 = [Vec3, Vec3, Vec3];

/** Equirectangular bitmap, rows of alternating run lengths starting with 0 (varints, base64). */
export interface BinaryMaskData {
  w: number;
  h: number;
  rle: string;
}
/** Equirectangular grid of byte values, (value, run) varint pairs, base64. */
export interface ValueMaskData {
  w: number;
  h: number;
  /** names[i] belongs to grid value i + 1: [Russian name, ISO alpha-2 or ''] */
  names: [string, string][];
  rle: string;
}
export interface Grid {
  w: number;
  h: number;
  cells: Uint8Array;
}

function varintReader(b64: string): () => number {
  const bin = atob(b64);
  let p = 0;
  return () => {
    let n = 0;
    let shift = 0;
    let b: number;
    do {
      b = bin.charCodeAt(p++);
      n |= (b & 127) << shift;
      shift += 7;
    } while (b & 128);
    return n;
  };
}

export function decodeBinaryMask(m: BinaryMaskData): Grid {
  const next = varintReader(m.rle);
  const cells = new Uint8Array(m.w * m.h);
  for (let r = 0, i = 0; r < m.h; r++, i += m.w) {
    for (let c = 0, v = 0; c < m.w; v ^= 1) {
      const n = next();
      if (v) cells.fill(1, i + c, i + c + n);
      c += n;
    }
  }
  return { w: m.w, h: m.h, cells };
}

export function decodeValueMask(m: ValueMaskData): Grid {
  const next = varintReader(m.rle);
  const cells = new Uint8Array(m.w * m.h);
  for (let i = 0; i < cells.length;) {
    const v = next();
    const n = next();
    if (v) cells.fill(v, i, i + n);
    i += n;
  }
  return { w: m.w, h: m.h, cells };
}

/** Cell value at a point given in radians. */
export function gridAt(g: Grid, lat: number, lon: number): number {
  let x = Math.floor(((lon + Math.PI) / (2 * Math.PI)) * g.w) % g.w;
  if (x < 0) x += g.w;
  const y = Math.min(g.h - 1, Math.max(0, Math.floor(((Math.PI / 2 - lat) / Math.PI) * g.h)));
  return g.cells[y * g.w + x] ?? 0;
}

/** Unit vector for a point given in degrees. */
export function llVec(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const cl = Math.cos(lat);
  return [cl * Math.sin(lon), Math.sin(lat), cl * Math.cos(lon)];
}

function mul(a: Mat3, b: Mat3): Mat3 {
  const row = (r: Vec3): Vec3 => [
    r[0] * b[0][0] + r[1] * b[1][0] + r[2] * b[2][0],
    r[0] * b[0][1] + r[1] * b[1][1] + r[2] * b[2][1],
    r[0] * b[0][2] + r[1] * b[1][2] + r[2] * b[2][2],
  ];
  return [row(a[0]), row(a[1]), row(a[2])];
}

/** View rotation: spin around the polar axis (yaw), tilt toward the viewer (pitch), then roll in the screen plane. Degrees. */
export function rotationMatrix(yawDeg: number, pitchDeg: number, rollDeg: number): Mat3 {
  const y = yawDeg * DEG;
  const p = pitchDeg * DEG;
  const r = rollDeg * DEG;
  const cy = Math.cos(y),
    sy = Math.sin(y),
    cp = Math.cos(p),
    sp = Math.sin(p),
    cr = Math.cos(r),
    sr = Math.sin(r);
  const ry: Mat3 = [
    [cy, 0, sy],
    [0, 1, 0],
    [-sy, 0, cy],
  ];
  const rx: Mat3 = [
    [1, 0, 0],
    [0, cp, -sp],
    [0, sp, cp],
  ];
  const rz: Mat3 = [
    [cr, -sr, 0],
    [sr, cr, 0],
    [0, 0, 1],
  ];
  return mul(rz, mul(rx, ry));
}

/** Column-major copy for gl.uniformMatrix3fv. */
export function toColumnMajor(m: Mat3): Float32Array {
  return new Float32Array([m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]]);
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

/** Inverse of a rotation is its transpose. */
export function applyTranspose(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0][0] * v[0] + m[1][0] * v[1] + m[2][0] * v[2],
    m[0][1] * v[0] + m[1][1] * v[1] + m[2][1] * v[2],
    m[0][2] * v[0] + m[1][2] * v[1] + m[2][2] * v[2],
  ];
}

export function vecToLatLon(v: Vec3): [number, number] {
  return [Math.asin(Math.max(-1, Math.min(1, v[1]))) / DEG, Math.atan2(v[0], v[2]) / DEG];
}

/** The point of the globe under the middle of the view, degrees. */
export function centerLatLon(m: Mat3): [number, number] {
  return vecToLatLon(applyTranspose(m, [0, 0, 1]));
}

/** Sub-solar point for a moment (no equation of time: good to about a degree). */
export function subsolarPoint(date: Date): [number, number] {
  const dayOfYear = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const declination = -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return [declination, -(hours - 12) * 15];
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hexToRgb01(hex: string): Vec3 {
  const n = parseInt(hex.slice(1, 7), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
