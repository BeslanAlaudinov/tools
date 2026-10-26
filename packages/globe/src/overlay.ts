// Markers and routes drawn with Canvas 2D over the WebGL globe. The same code draws the live view and exports.
import { apply, llVec, type Mat3, type Vec3 } from './geo';
import { MARKER_SCALE, type GlobeSettings, type Marker } from './settings';

export interface MarkerHit {
  id: number;
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

interface Projected {
  x: number;
  y: number;
  z: number;
  r2: number;
}

function projector(m: Mat3, s: GlobeSettings, w: number, h: number) {
  const aspect = w / h;
  const r = s.zoom;
  return (v: Vec3, lift = 1): Projected => {
    const p = apply(m, v);
    const x = p[0] * lift,
      y = p[1] * lift,
      z = p[2] * lift;
    return {
      x: (((x * r) / aspect + s.offX + 1) / 2) * w,
      y: (1 - (y * r + s.offY + 1) / 2) * h,
      z,
      r2: x * x + y * y,
    };
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function drawRoutes(g: CanvasRenderingContext2D, s: GlobeSettings, m: Mat3, w: number, h: number, time: number) {
  if (!s.routes.length) return;
  const proj = projector(m, s, w, h);
  const u = h / 900;
  const byId = new Map(s.markers.map(mk => [mk.id, mk]));
  s.routes.forEach((route, k) => {
    const a = byId.get(route.from);
    const b = byId.get(route.to);
    if (!a || !b) return;
    const A = llVec(a.lat, a.lon);
    const B = llVec(b.lat, b.lon);
    const om = Math.acos(Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])));
    if (om < 1e-3) return;
    const n = 72;
    const sinOm = Math.sin(om);
    const pts: { x: number; y: number; vis: boolean; t: number }[] = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const f1 = Math.sin((1 - t) * om) / sinOm;
      const f2 = Math.sin(t * om) / sinOm;
      const v: Vec3 = [A[0] * f1 + B[0] * f2, A[1] * f1 + B[1] * f2, A[2] * f1 + B[2] * f2];
      const lift = 1 + s.arcHeight * (om / Math.PI) * Math.sin(Math.PI * t);
      const p = proj(v, lift);
      // behind the globe = far side and inside the disc
      pts.push({ x: p.x, y: p.y, vis: p.z >= 0 || p.r2 > 1, t });
    }
    g.save();
    g.lineCap = 'round';
    g.globalAlpha = s.arcOpacity;
    g.strokeStyle = s.arcColor;
    g.lineWidth = s.arcWidth * u;
    if (s.arcDash) g.setLineDash([6 * u, 6 * u]);
    g.beginPath();
    for (let i = 1; i <= n; i++) {
      const p0 = pts[i - 1]!,
        p1 = pts[i]!;
      if (!p0.vis || !p1.vis) continue;
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
    }
    g.stroke();
    g.setLineDash([]);
    if (s.arcSpeed > 0) {
      const head = (time * s.arcSpeed + k * 0.37) % 1;
      const len = s.arcCometLen;
      g.strokeStyle = s.arcComet;
      g.lineWidth = s.arcWidth * 2 * u;
      for (let i = 1; i <= n; i++) {
        const p0 = pts[i - 1]!,
          p1 = pts[i]!;
        if (p1.t > head || p1.t < head - len || !p0.vis || !p1.vis) continue;
        g.globalAlpha = Math.pow(1 - (head - p1.t) / len, 1.5);
        g.beginPath();
        g.moveTo(p0.x, p0.y);
        g.lineTo(p1.x, p1.y);
        g.stroke();
      }
      const hp = pts[Math.min(n, Math.round(head * n))]!;
      if (hp.vis) {
        g.globalAlpha = 1;
        g.fillStyle = s.arcComet;
        g.shadowColor = s.arcComet;
        g.shadowBlur = 10 * u;
        g.beginPath();
        g.arc(hp.x, hp.y, s.arcWidth * 1.6 * u, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
  });
}

const MARKER_STYLES = {
  'glass-dark': { tint: 'rgba(14,18,16,0.55)', border: 'rgba(255,255,255,0.18)', blur: true },
  'glass-light': { tint: 'rgba(255,255,255,0.32)', border: 'rgba(255,255,255,0.55)', blur: true },
  solid: { tint: null, border: 'rgba(255,255,255,0.12)', blur: false },
} as const;

/**
 * Pill markers with a pin, a leg and a pulse ring. `source` is the rendered globe: its pixels are blurred
 * under the glass pills. Returns hit boxes in device pixels.
 */
export function drawMarkers(
  g: CanvasRenderingContext2D,
  s: GlobeSettings,
  m: Mat3,
  w: number,
  h: number,
  time: number,
  source: CanvasImageSource,
  fontFamily: string,
): MarkerHit[] {
  const hits: MarkerHit[] = [];
  if (!s.markers.length) return hits;
  const proj = projector(m, s, w, h);
  const u = (h / 900) * MARKER_SCALE[s.markerSize];
  const style = MARKER_STYLES[s.markerStyle];
  const canBlur = style.blur && 'filter' in g;
  g.save();
  g.font = `500 ${16 * u}px ${fontFamily}`;
  g.textBaseline = 'middle';
  for (const mk of s.markers) drawMarker(mk);
  g.restore();
  return hits;

  function drawMarker(mk: Marker) {
    const p = proj(llVec(mk.lat, mk.lon));
    const vis = smoothstep(0.02, 0.22, p.z);
    if (vis <= 0.01) return;
    g.globalAlpha = vis;
    if (s.markerPulse) {
      const ph = (time * 0.6 + mk.id * 0.37) % 1;
      g.globalAlpha = vis * (1 - ph) * 0.9;
      g.strokeStyle = s.markerAccent;
      g.lineWidth = 1.5 * u;
      g.beginPath();
      g.arc(p.x, p.y, (5 + 22 * ph) * u, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = vis;
    }
    g.fillStyle = s.markerAccent;
    g.beginPath();
    g.arc(p.x, p.y, 3.5 * u, 0, Math.PI * 2);
    g.fill();
    const top = p.y - s.markerLine * u;
    if (s.markerLine > 0) {
      g.strokeStyle = s.markerText;
      g.globalAlpha = vis * 0.55;
      g.lineWidth = u;
      g.beginPath();
      g.moveTo(p.x, p.y - 5 * u);
      g.lineTo(p.x, top);
      g.stroke();
      g.globalAlpha = vis;
    }
    const label = mk.label;
    const textW = g.measureText(label).width;
    const ph = 40 * u,
      pad = 14 * u,
      icon = 18 * u,
      gap = 8 * u;
    const pw = pad + icon + (label ? gap + textW : 0) + pad;
    const x0 = p.x - pw / 2,
      y0 = top - ph,
      r = ph / 2;
    if (canBlur) {
      g.save();
      roundRect(g, x0, y0, pw, ph, r);
      g.clip();
      g.filter = `blur(${Math.max(1, 10 * u)}px)`;
      const mg = 24 * u;
      g.drawImage(source, x0 - mg, y0 - mg, pw + 2 * mg, ph + 2 * mg, x0 - mg, y0 - mg, pw + 2 * mg, ph + 2 * mg);
      g.restore();
    }
    roundRect(g, x0, y0, pw, ph, r);
    g.fillStyle = style.tint ?? s.markerBg;
    g.fill();
    g.strokeStyle = style.border;
    g.lineWidth = u;
    g.stroke();
    // pin
    const cx = x0 + pad + icon / 2,
      cy = y0 + ph / 2,
      pr = icon / 2,
      head = pr * 0.72,
      cy0 = cy - pr * 0.26;
    g.beginPath();
    g.arc(cx, cy0, head, Math.PI * 0.8, Math.PI * 2.2);
    g.lineTo(cx, cy + pr);
    g.closePath();
    g.fillStyle = s.markerAccent;
    g.fill();
    g.beginPath();
    g.arc(cx, cy0, head * 0.42, 0, Math.PI * 2);
    g.fillStyle = s.markerStyle === 'solid' ? s.markerBg : 'rgba(10,14,12,0.85)';
    g.fill();
    if (label) {
      g.fillStyle = s.markerText;
      g.fillText(label, x0 + pad + icon + gap, cy + 0.5 * u);
    }
    hits.push({ id: mk.id, x: x0, y: y0, w: pw, h: ph, ax: p.x, ay: p.y });
  }
}
