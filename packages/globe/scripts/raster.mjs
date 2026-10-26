// Rasterizes GeoJSON polygon rings into an equirectangular W×H bitmap (row 0 = 90°N, column 0 = 180°W).

const wrap180 = d => (d > 180 ? d - 360 : d < -180 ? d + 360 : d);

export function ringsOf(geometry) {
  if (!geometry) return [];
  const polys =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polys.flat();
}

export function rasterize(rings, W, H, bits = new Uint8Array(W * H)) {
  for (const ring of rings) {
    // Unwrap longitudes so a step across the antimeridian stays a short step instead of
    // an edge spanning the whole map (that edge would paint a full row of fake land).
    const pts = [[ring[0][0], ring[0][1]]];
    for (let i = 1; i < ring.length; i++) pts.push([pts[i - 1][0] + wrap180(ring[i][0] - ring[i - 1][0]), ring[i][1]]);
    // A ring whose unwrapped longitude ends a full turn away encircles a pole (Antarctica):
    // close it through that pole so the area between coast and pole is inside.
    const turn = pts[pts.length - 1][0] - pts[0][0];
    if (Math.abs(turn) > 180) {
      const meanLat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const pole = meanLat < 0 ? -90 : 90;
      pts.push([pts[pts.length - 1][0], pole], [pts[0][0], pole], [pts[0][0], pts[0][1]]);
    }
    // scanline crossings for this ring, XOR-filled (holes are separate rings), longitude taken modulo 360
    const rows = new Map();
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i],
        [x2, y2] = pts[i + 1];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2),
        hi = Math.max(y1, y2);
      const r0 = Math.max(0, Math.ceil(((90 - hi) * H) / 180 - 0.5));
      const r1 = Math.min(H - 1, Math.floor(((90 - lo) * H) / 180 - 0.5));
      for (let r = r0; r <= r1; r++) {
        const lat = 90 - ((r + 0.5) * 180) / H;
        if (y1 > lat === y2 > lat) continue;
        if (!rows.has(r)) rows.set(r, []);
        rows.get(r).push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1));
      }
    }
    for (const [r, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.ceil(((xs[k] + 180) * W) / 360 - 0.5),
          c1 = Math.floor(((xs[k + 1] + 180) * W) / 360 - 0.5);
        for (let c = c0; c <= c1; c++) bits[r * W + (((c % W) + W) % W)] ^= 1;
      }
    }
  }
  return bits;
}

// Run-length encodes a byte grid row by row as varint pairs, base64.
// binary = true: rows are alternating run lengths starting with 0 (no value bytes).
export function encodeRuns(grid, W, H, binary) {
  const bytes = [];
  const varint = n => {
    while (n > 127) {
      bytes.push((n & 127) | 128);
      n >>= 7;
    }
    bytes.push(n);
  };
  for (let r = 0; r < H; r++) {
    let cur = binary ? 0 : grid[r * W],
      run = 0;
    for (let c = 0; c < W; c++) {
      const v = grid[r * W + c];
      if (v === cur) {
        run++;
        continue;
      }
      if (binary) varint(run);
      else {
        varint(cur);
        varint(run);
      }
      cur = v;
      run = 1;
    }
    if (binary) varint(run);
    else {
      varint(cur);
      varint(run);
    }
  }
  return Buffer.from(bytes).toString('base64');
}
