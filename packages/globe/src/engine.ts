import { COUNTRY_MASK } from './data/countries';
import { LAND_MASK } from './data/land-mask';
import { buildDots, highlightBuffer, type DotBuffers } from './dots';
import {
  DEG,
  applyTranspose,
  centerLatLon,
  clamp,
  decodeBinaryMask,
  decodeValueMask,
  gridAt,
  hexToRgb01,
  llVec,
  mulberry32,
  rotationMatrix,
  subsolarPoint,
  toColumnMajor,
  vecToLatLon,
  type Grid,
  type Mat3,
  type Vec3,
} from './geo';
import { drawMarkers, drawRoutes, type MarkerHit } from './overlay';
import { GEOMETRY_KEYS, DEFAULT_VIEW, type GlobeSettings, type GlobeView } from './settings';
import { POINTS_FS, POINTS_VS, QUAD_FS, QUAD_VS } from './shaders';

let landGrid: Grid | null = null;
let countryGrid: Grid | null = null;
function geoData() {
  landGrid ??= decodeBinaryMask(LAND_MASK);
  countryGrid ??= decodeValueMask(COUNTRY_MASK);
  return { land: landGrid, countries: countryGrid };
}

/** Russian name of a country by its grid index (1-based). */
export function countryName(index: number): string {
  return COUNTRY_MASK.names[index - 1]?.[0] ?? '';
}
/** All countries, index is position + 1. */
export const COUNTRY_NAMES: readonly string[] = COUNTRY_MASK.names.map(n => n[0]);
/** ISO 3166-1 alpha-2 codes in the same order ('' for territories without one). */
export const COUNTRY_CODES: readonly string[] = COUNTRY_MASK.names.map(n => n[1]);

/** Country under a point in degrees, 0 for none. */
export function countryAt(lat: number, lon: number): number {
  return gridAt(geoData().countries, lat * DEG, lon * DEG);
}

export interface GlobeEngineCallbacks {
  /** A setting changed through the canvas: wheel zoom, Shift-drag, clicking a country. */
  onPatch?: (patch: Partial<GlobeSettings>) => void;
  /** The camera settled after a drag or a fly-to. */
  onViewChange?: (view: GlobeView) => void;
  onMarkerClick?: (id: number) => void;
  /** Short message worth showing to the user, e.g. "Германия выделена". */
  onNotice?: (text: string) => void;
}

export interface GlobeEngineOptions {
  canvas: HTMLCanvasElement;
  /** 2D canvas stacked over the globe for markers and routes. */
  overlay?: HTMLCanvasElement | null;
  settings: GlobeSettings;
  view?: GlobeView;
  /** Drag, wheel and click handling. Off for previews and thumbnails. */
  interactive?: boolean;
  fontFamily?: string;
  callbacks?: GlobeEngineCallbacks;
}

export interface RenderedImage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Dots came out larger than the GPU can draw; a smaller size will look right. */
  clipped: boolean;
}

type CanvasEvents = HTMLElementEventMap & {
  webglcontextlost: WebGLContextEvent;
  webglcontextrestored: WebGLContextEvent;
};

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
}

const SHAPES = { circle: 0, square: 1, ring: 2, plus: 3, hex: 4, diamond: 5, dash: 6, glyph: 7 } as const;
const COLOR_MODES = { solid: 0, edge: 1, lat: 2, flow: 3, random: 4 } as const;
const BG_MODES = { solid: 0, vertical: 1, radial: 2, transparent: 0 } as const;
const FX_CODES = { random: 1, center: 1, markers: 1, radar: 2, scan: 3, meridian: 4, breath: 5 } as const;
const GLYPHS = '.:-=+*#%@';

export class GlobeEngine {
  static isSupported(): boolean {
    try {
      const c = document.createElement('canvas');
      return !!c.getContext('webgl');
    } catch {
      return false;
    }
  }

  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement | null;
  private readonly overlayCtx: CanvasRenderingContext2D | null;
  private gl: WebGLRenderingContext;
  private settings: GlobeSettings;
  private view: GlobeView;
  private readonly callbacks: GlobeEngineCallbacks;
  private readonly fontFamily: string;
  private readonly interactive: boolean;

  private points!: Program;
  private quad!: Program;
  private posBuf!: WebGLBuffer;
  private infoBuf!: WebGLBuffer;
  private hiBuf!: WebGLBuffer;
  private quadBuf!: WebGLBuffer;
  private glyphTex!: WebGLTexture;
  private maxPointSize = 64;
  private dots: DotBuffers | null = null;
  private contextLost = false;

  private time = 0;
  private playing = true;
  private dirty = true;
  private raf = 0;
  private last = 0;
  private markerHits: MarkerHit[] = [];
  private readonly waves = [0, 1, 2].map(i => ({ o: [0, 0, 1] as Vec3, ph: i / 3, live: false }));
  private readonly waveRand = mulberry32(99);
  private tween: { t0: number; y0: number; y1: number; p0: number; p1: number } | null = null;
  private inertia: { vy: number; vp: number } | null = null;
  private drag: { x: number; y: number; t: number; pan: boolean; downX: number; downY: number; downT: number } | null =
    null;
  private vel = { vy: 0, vp: 0 };
  private cssW = 1;
  private cssH = 1;
  private readonly cleanup: (() => void)[] = [];

  constructor(opts: GlobeEngineOptions) {
    this.canvas = opts.canvas;
    this.overlay = opts.overlay ?? null;
    this.overlayCtx = this.overlay?.getContext('2d') ?? null;
    this.settings = opts.settings;
    this.view = { ...(opts.view ?? DEFAULT_VIEW) };
    this.callbacks = opts.callbacks ?? {};
    this.fontFamily = opts.fontFamily ?? 'system-ui, sans-serif';
    this.interactive = opts.interactive ?? false;

    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error('WebGL is not available');
    this.gl = gl;
    this.initGL();
    this.rebuildDots();

    const onLost = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
    };
    const onRestored = () => {
      this.contextLost = false;
      this.initGL();
      this.rebuildDots();
      this.dirty = true;
    };
    this.listen(this.canvas, 'webglcontextlost', onLost);
    this.listen(this.canvas, 'webglcontextrestored', onRestored);
    if (this.interactive) this.attachInteraction();

    this.raf = requestAnimationFrame(t => {
      this.last = t;
      this.frame(t);
    });
  }

  // ---------- public API ----------

  setSettings(next: GlobeSettings): void {
    const prev = this.settings;
    this.settings = next;
    if (GEOMETRY_KEYS.some(k => prev[k] !== next[k])) this.rebuildDots();
    else if (prev.countries !== next.countries) this.uploadHighlight();
    this.dirty = true;
  }

  getView(): GlobeView {
    return { ...this.view };
  }

  setView(view: GlobeView): void {
    this.view = { ...view };
    this.tween = null;
    this.inertia = null;
    this.dirty = true;
  }

  /** Smoothly turns the globe so the point faces the viewer. */
  flyTo(lat: number, lon: number): void {
    let y1 = -lon;
    while (y1 - this.view.yaw > 180) y1 -= 360;
    while (y1 - this.view.yaw < -180) y1 += 360;
    this.inertia = null;
    this.tween = { t0: performance.now(), y0: this.view.yaw, y1, p0: this.view.pitch, p1: clamp(lat, -90, 90) };
  }

  setPlaying(playing: boolean): void {
    this.playing = playing;
    this.dirty = true;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  /** Point of the globe in the middle of the view, degrees. */
  center(): [number, number] {
    return centerLatLon(this.matrix());
  }

  dotCount(): number {
    return this.dots?.count ?? 0;
  }

  /** CSS size of the canvas; the backing store follows devicePixelRatio (capped at 2). */
  resize(cssWidth: number, cssHeight: number, dpr = Math.min(window.devicePixelRatio || 1, 2)): void {
    this.cssW = Math.max(1, Math.floor(cssWidth));
    this.cssH = Math.max(1, Math.floor(cssHeight));
    const w = Math.max(1, Math.round(this.cssW * dpr));
    const h = Math.max(1, Math.round(this.cssH * dpr));
    for (const c of [this.canvas, this.overlay]) {
      if (!c) continue;
      c.width = w;
      c.height = h;
    }
    this.dirty = true;
  }

  /**
   * Renders the current frame at any size, overlay included, into a new canvas.
   * `overrides` apply to this render only (e.g. a transparent background for PNG); geometry keys are ignored.
   * `opaque` paints the background color under a transparent frame (JPEG has no alpha).
   */
  renderImage(
    width: number,
    height: number,
    opts: { opaque?: boolean; overrides?: Partial<GlobeSettings> } = {},
  ): RenderedImage {
    const keepSettings = this.settings;
    if (opts.overrides) this.settings = { ...this.settings, ...opts.overrides };
    for (const k of GEOMETRY_KEYS) (this.settings as unknown as Record<string, unknown>)[k] = keepSettings[k];
    const keepW = this.canvas.width;
    const keepH = this.canvas.height;
    this.canvas.width = width;
    this.canvas.height = height;
    const pointPx = this.drawGlobe(width, height);
    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    const g = out.getContext('2d')!;
    if (opts.opaque && this.settings.bgMode === 'transparent') {
      g.fillStyle = this.settings.bg1;
      g.fillRect(0, 0, width, height);
    }
    g.drawImage(this.canvas, 0, 0);
    this.drawOverlay(g, width, height, this.canvas);
    this.canvas.width = keepW;
    this.canvas.height = keepH;
    this.settings = keepSettings;
    this.dirty = true;
    return { canvas: out, width, height, clipped: pointPx > this.maxPointSize };
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach(f => f());
    this.cleanup.length = 0;
  }

  // ---------- setup ----------

  private listen<K extends keyof CanvasEvents>(
    el: HTMLElement,
    type: K,
    fn: (e: CanvasEvents[K]) => void,
    opts?: AddEventListenerOptions,
  ) {
    el.addEventListener(type, fn as EventListener, opts);
    this.cleanup.push(() => el.removeEventListener(type, fn as EventListener, opts));
  }

  private compile(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
    return sh;
  }

  private link(vs: string, fs: string): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(program) ?? 'link error');
    const uniforms: Program['uniforms'] = {};
    const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(program, i)!;
      uniforms[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(program, info.name);
    }
    return { program, uniforms };
  }

  private initGL() {
    const gl = this.gl;
    this.points = this.link(POINTS_VS, POINTS_FS);
    this.quad = this.link(QUAD_VS, QUAD_FS);
    this.posBuf = gl.createBuffer()!;
    this.infoBuf = gl.createBuffer()!;
    this.hiBuf = gl.createBuffer()!;
    this.quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.glyphTex = gl.createTexture()!;
    this.buildGlyphs();
    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    this.maxPointSize = range[1] ?? 64;
    if (document.fonts?.ready) void document.fonts.ready.then(() => this.buildGlyphs());
  }

  private buildGlyphs() {
    const gl = this.gl;
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size * GLYPHS.length;
    c.height = size;
    const g = c.getContext('2d')!;
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `700 ${size * 0.9}px ui-monospace, "Geist Mono", Consolas, monospace`;
    for (let i = 0; i < GLYPHS.length; i++) g.fillText(GLYPHS[i]!, size * i + size / 2, size * 0.54);
    gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.dirty = true;
  }

  private rebuildDots() {
    const { land, countries } = geoData();
    this.dots = buildDots(this.settings, land, countries);
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.dots.pos, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.infoBuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.dots.info, gl.STATIC_DRAW);
    this.uploadHighlight();
  }

  private uploadHighlight() {
    if (!this.dots) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.hiBuf);
    gl.bufferData(gl.ARRAY_BUFFER, highlightBuffer(this.dots, this.settings.countries), gl.DYNAMIC_DRAW);
    this.dirty = true;
  }

  // ---------- frame loop ----------

  private matrix(): Mat3 {
    return rotationMatrix(this.view.yaw, this.view.pitch, this.settings.roll);
  }

  private animating(): boolean {
    const s = this.settings;
    return (
      this.playing &&
      ((s.autoRotate && s.rotSpeed > 0) ||
        s.shimmer > 0 ||
        (s.fxOn && s.fxAmount > 0) ||
        (s.colorMode === 'flow' && s.flowSpeed > 0) ||
        (s.markers.length > 0 && s.markerPulse) ||
        (s.routes.length > 0 && s.arcSpeed > 0))
    );
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const s = this.settings;
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / 900);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      this.view.yaw = this.tween.y0 + (this.tween.y1 - this.tween.y0) * e;
      this.view.pitch = this.tween.p0 + (this.tween.p1 - this.tween.p0) * e;
      if (k >= 1) {
        this.tween = null;
        this.callbacks.onViewChange?.(this.getView());
      }
      this.dirty = true;
    } else if (this.inertia && !this.drag) {
      this.view.yaw += this.inertia.vy * dt;
      this.view.pitch = clamp(this.view.pitch + this.inertia.vp * dt, -90, 90);
      const f = Math.exp(-dt * 3);
      this.inertia.vy *= f;
      this.inertia.vp *= f;
      if (Math.abs(this.inertia.vy) + Math.abs(this.inertia.vp) < 0.5) {
        this.inertia = null;
        this.callbacks.onViewChange?.(this.getView());
      }
      this.dirty = true;
    } else if (this.playing && s.autoRotate && !this.drag) {
      this.view.yaw += s.rotSpeed * s.rotDir * dt;
    }
    if (this.playing) {
      this.time += dt;
      this.stepWaves(dt);
    }
    if (this.view.yaw > 180) this.view.yaw -= 360;
    else if (this.view.yaw < -180) this.view.yaw += 360;

    if (!this.contextLost && (this.dirty || this.animating())) {
      this.drawGlobe(this.canvas.width, this.canvas.height);
      if (this.overlayCtx && this.overlay) {
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);
        this.markerHits = this.drawOverlay(this.overlayCtx, this.overlay.width, this.overlay.height, this.canvas);
      }
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(t => this.frame(t));
  }

  private stepWaves(dt: number) {
    const land = this.dots?.land ?? [];
    for (const w of this.waves) {
      w.ph += dt * this.settings.fxSpeed;
      if (w.ph >= 1 || !w.live) {
        w.ph %= 1;
        w.o = land.length ? land[Math.floor(this.waveRand() * land.length)]! : [0, 0, 1];
        w.live = true;
      }
    }
  }

  private waveUniform(m: Mat3): Float32Array {
    const s = this.settings;
    const out = new Float32Array(16);
    for (let i = 0; i < 4; i++) out[i * 4 + 3] = -1;
    if (!s.fxOn || FX_CODES[s.fx] !== 1) return out;
    const base = this.waves[0]!.ph;
    if (s.fx === 'markers' && s.markers.length) {
      s.markers.slice(0, 4).forEach((mk, i) => {
        out.set(llVec(mk.lat, mk.lon), i * 4);
        out[i * 4 + 3] = (base + i * 0.37) % 1;
      });
    } else if (s.fx === 'random') {
      this.waves.forEach((w, i) => {
        if (!w.live) return;
        out.set(w.o, i * 4);
        out[i * 4 + 3] = w.ph;
      });
    } else {
      const c = applyTranspose(m, [0, 0, 1]);
      for (let i = 0; i < 2; i++) {
        out.set(c, i * 4);
        out[i * 4 + 3] = (base + i * 0.5) % 1;
      }
    }
    return out;
  }

  private sunVector(): Vec3 {
    const s = this.settings;
    if (s.sunMode === 'manual') return llVec(s.sunLat, s.sunLon);
    const [lat, lon] = subsolarPoint(new Date());
    return llVec(lat, lon);
  }

  /** Draws the globe at a backing size; returns the largest point size used, in px. */
  private drawGlobe(w: number, h: number): number {
    const gl = this.gl;
    const s = this.settings;
    const dots = this.dots;
    if (!dots) return 0;
    const m = this.matrix();
    const aspect = w / h;
    const r = s.zoom;
    const transparent = s.bgMode === 'transparent';
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);

    const q = this.quad;
    const qa = gl.getAttribLocation(q.program, 'aQ');
    gl.useProgram(q.program);
    const qu = q.uniforms;
    gl.uniform2f(qu.uRes!, w, h);
    gl.uniform2f(qu.uOff!, s.offX, s.offY);
    gl.uniform1f(qu.uAspect!, aspect);
    gl.uniform1f(qu.uR!, r);
    gl.uniform1i(qu.uBgMode!, BG_MODES[s.bgMode]);
    gl.uniform3fv(qu.uBg1!, hexToRgb01(s.bg1));
    gl.uniform3fv(qu.uBg2!, hexToRgb01(s.bg2));
    gl.uniform3fv(qu.uFill!, hexToRgb01(s.fillColor));
    gl.uniform1f(qu.uFillA!, s.fillOpacity);
    gl.uniform3fv(qu.uAtmo!, hexToRgb01(s.atmoColor));
    gl.uniform1f(qu.uAtmoAmt!, s.atmo);
    gl.uniform1f(qu.uAtmoW!, s.atmoWidth);
    gl.uniform1f(qu.uVig!, s.vignette);
    gl.uniform1f(qu.uGrain!, s.grain);
    gl.uniform1f(qu.uSeed!, 17);
    const quadPass = (pass: number, src: number, dst: number, srcA = src, dstA = dst) => {
      gl.useProgram(q.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuf);
      gl.enableVertexAttribArray(qa);
      gl.vertexAttribPointer(qa, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1i(qu.uPass!, pass);
      gl.blendFuncSeparate(src, dst, srcA, dstA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.disableVertexAttribArray(qa);
    };
    if (!transparent) quadPass(0, gl.ONE, gl.ZERO);

    const glowScale = 1 + s.glow * 2;
    const pointPx = (Math.PI / Math.round(s.density)) * r * (h / 2) * s.dotSize * (s.shape === 'glyph' ? 1.6 : 1);
    const p = this.points;
    const pu = p.uniforms;
    const drawSide = (side: number) => {
      gl.useProgram(p.program);
      const attrs = (
        [
          ['aPos', this.posBuf, 3],
          ['aInfo', this.infoBuf, 2],
          ['aHi', this.hiBuf, 1],
        ] as const
      ).map(([name, buf, size]) => {
        const loc = gl.getAttribLocation(p.program, name);
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
        return loc;
      });
      gl.uniformMatrix3fv(pu.uRot!, false, toColumnMajor(m));
      gl.uniform2f(pu.uScale!, r / aspect, r);
      gl.uniform2f(pu.uOff!, s.offX, s.offY);
      gl.uniform1f(pu.uSide!, side);
      gl.uniform1f(pu.uPx!, pointPx);
      gl.uniform1f(pu.uEdge!, s.edgeShrink);
      gl.uniform1f(pu.uTime!, this.time);
      gl.uniform1f(pu.uGlowScale!, glowScale);
      gl.uniform1f(pu.uOceanSize!, s.oceanSize);
      gl.uniform1f(pu.uOceanAlpha!, s.oceanOpacity);
      gl.uniform1f(pu.uBackAlpha!, s.backOpacity);
      gl.uniform1f(pu.uShimmer!, s.shimmer);
      gl.uniform1f(pu.uShimmerSpeed!, s.shimmerSpeed);
      gl.uniform4fv(pu.uWaves!, this.waveUniform(m));
      gl.uniform1i(pu.uFx!, s.fxOn ? FX_CODES[s.fx] : 0);
      gl.uniform1f(pu.uFxAmt!, s.fxAmount);
      gl.uniform1f(pu.uFxWidth!, Math.max(0.2, s.fxWidth) * DEG);
      gl.uniform1f(pu.uFxRange!, s.fxRange * DEG);
      gl.uniform1f(pu.uFxPhase!, (this.time * s.fxSpeed) % 1);
      gl.uniform1i(pu.uColorMode!, COLOR_MODES[s.colorMode]);
      gl.uniform3fv(pu.uColA!, hexToRgb01(s.colorA));
      gl.uniform3fv(pu.uColB!, hexToRgb01(s.colorB));
      gl.uniform3fv(pu.uOceanCol!, hexToRgb01(s.oceanColor));
      gl.uniform3fv(pu.uFxCol!, hexToRgb01(s.fxColor));
      gl.uniform1f(pu.uFlowFreq!, s.flowFreq);
      gl.uniform1f(pu.uFlowPhase!, this.time * s.flowSpeed * 2 * Math.PI);
      gl.uniform3fv(pu.uHiCol!, hexToRgb01(s.hiColor));
      gl.uniform1f(pu.uAnyHi!, s.countries.length ? 1 : 0);
      gl.uniform1f(pu.uHiSize!, s.hiSize);
      gl.uniform1f(pu.uHiDim!, s.hiDim);
      gl.uniform1f(pu.uDayNight!, s.dayNight ? 1 : 0);
      gl.uniform3fv(pu.uSun!, this.sunVector());
      gl.uniform3fv(pu.uNightCol!, hexToRgb01(s.nightColor));
      gl.uniform1f(pu.uNightDim!, s.nightDim);
      gl.uniform1f(pu.uNightSoft!, s.nightSoft);
      gl.uniform1i(pu.uShape!, SHAPES[s.shape]);
      gl.uniform1f(pu.uGlow!, s.glow);
      gl.uniform1f(pu.uGlyphCount!, GLYPHS.length);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
      gl.uniform1i(pu.uGlyphs!, 0);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, dots.count);
      attrs.forEach(loc => gl.disableVertexAttribArray(loc));
    };
    if (s.backOpacity > 0) drawSide(-1);
    if (s.fillOpacity > 0) quadPass(1, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    drawSide(1);
    if (s.atmo > 0) quadPass(2, gl.ONE, gl.ONE);
    // vignette and grain tint the color only; the frame stays opaque
    if (!transparent && s.vignette > 0) quadPass(3, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    if (!transparent && s.grain > 0) {
      quadPass(4, gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      gl.blendEquationSeparate(gl.FUNC_REVERSE_SUBTRACT, gl.FUNC_ADD);
      quadPass(5, gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      gl.blendEquation(gl.FUNC_ADD);
    }
    return pointPx * glowScale;
  }

  private drawOverlay(g: CanvasRenderingContext2D, w: number, h: number, source: CanvasImageSource): MarkerHit[] {
    const m = this.matrix();
    drawRoutes(g, this.settings, m, w, h, this.time);
    return drawMarkers(g, this.settings, m, w, h, this.time, source, this.fontFamily);
  }

  // ---------- interaction ----------

  /** Screen point (device px) → [lat, lon] in degrees, or null off the globe. */
  private pick(px: number, py: number): [number, number] | null {
    const s = this.settings;
    const w = this.canvas.width,
      h = this.canvas.height,
      aspect = w / h,
      r = s.zoom;
    const x = (((px / w) * 2 - 1 - s.offX) * aspect) / r;
    const y = (1 - (py / h) * 2 - s.offY) / r;
    const r2 = x * x + y * y;
    if (r2 > 1) return null;
    return vecToLatLon(applyTranspose(this.matrix(), [x, y, Math.sqrt(1 - r2)]));
  }

  private attachInteraction() {
    const c = this.canvas;
    this.listen(c, 'pointerdown', e => {
      this.tween = null;
      this.inertia = null;
      const t = performance.now();
      this.drag = { x: e.clientX, y: e.clientY, t, pan: e.shiftKey, downX: e.clientX, downY: e.clientY, downT: t };
      this.vel = { vy: 0, vp: 0 };
      c.setPointerCapture(e.pointerId);
    });
    this.listen(c, 'pointermove', e => {
      const d = this.drag;
      if (!d) return;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y,
        now = performance.now(),
        dt = Math.max(1, now - d.t) / 1000;
      if (d.pan) {
        const s = this.settings;
        this.callbacks.onPatch?.({
          offX: clamp(s.offX + (dx / this.cssW) * 2, -1.5, 1.5),
          offY: clamp(s.offY - (dy / this.cssH) * 2, -1.5, 1.5),
        });
      } else {
        const k = 1 / ((this.settings.zoom * this.cssH) / 2) / DEG;
        this.view.yaw += dx * k;
        this.view.pitch = clamp(this.view.pitch + dy * k, -90, 90);
        this.vel = { vy: (dx * k) / dt, vp: (dy * k) / dt };
      }
      d.x = e.clientX;
      d.y = e.clientY;
      d.t = now;
      this.dirty = true;
    });
    const end = (e: PointerEvent) => {
      const d = this.drag;
      if (!d) return;
      this.drag = null;
      const moved = Math.hypot(e.clientX - d.downX, e.clientY - d.downY);
      if (e.type === 'pointerup' && moved < 5 && performance.now() - d.downT < 500) this.click(e);
      else if (!d.pan && performance.now() - d.t < 80) this.inertia = { ...this.vel };
      if (!this.inertia) this.callbacks.onViewChange?.(this.getView());
    };
    this.listen(c, 'pointerup', end);
    this.listen(c, 'pointercancel', end);
    this.listen(
      c,
      'wheel',
      e => {
        e.preventDefault();
        this.callbacks.onPatch?.({ zoom: clamp(this.settings.zoom * Math.exp(-e.deltaY * 0.0012), 0.2, 4) });
      },
      { passive: false },
    );
  }

  private click(e: PointerEvent) {
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.canvas.width / rect.width;
    const px = (e.clientX - rect.left) * scale;
    const py = (e.clientY - rect.top) * scale;
    const hit = [...this.markerHits]
      .reverse()
      .find(
        h =>
          (px >= h.x && px <= h.x + h.w && py >= h.y && py <= h.y + h.h) ||
          Math.hypot(px - h.ax, py - h.ay) < 10 * scale,
      );
    if (hit) {
      this.callbacks.onMarkerClick?.(hit.id);
      return;
    }
    if (!this.settings.countryClick) return;
    const ll = this.pick(px, py);
    if (!ll) return;
    const c = countryAt(ll[0], ll[1]);
    if (!c) {
      this.callbacks.onNotice?.('Здесь океан, страны нет');
      return;
    }
    const has = this.settings.countries.includes(c);
    this.callbacks.onPatch?.({
      countries: has ? this.settings.countries.filter(x => x !== c) : [...this.settings.countries, c],
    });
    this.callbacks.onNotice?.(`${countryName(c)}: ${has ? 'выделение снято' : 'выделена'}`);
  }
}
