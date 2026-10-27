// Renders frames of the effect for the page: the live preview, preset thumbnails and exports.
// The work runs in a Web Worker; where workers are unavailable it falls back to the main thread.
//
// Requests come in lanes. Within a lane only the newest waiting request survives: while a slider moves, frames
// the user has already scrolled past are dropped instead of queuing up. Lanes share one worker, in order.

import { buildBase, composite, effectiveMask, type Base } from './render';
import type { SilhouetteSettings } from './settings';
import { drawInFrame, type SilhouetteSource } from './source';
import type { WorkerRequest, WorkerResponse } from './worker';

export type Lane = 'preview' | 'thumb' | 'export';

export interface Frame {
  image: ImageData;
  /** Share of the frame covered by the shape; near 0 means the shape was not found. */
  area: number;
}

interface Job {
  settings: SilhouetteSettings;
  width: number;
  height: number;
  resolve: (f: Frame | null) => void;
  reject: (e: unknown) => void;
}

export class SilhouetteRenderer {
  private worker: Worker | null = null;
  private source: SilhouetteSource | null = null;
  private sourceVersion = 0;
  private nextId = 1;
  private busy = false;
  private readonly waiting = new Map<Lane, Job>();
  private readonly order: Lane[] = [];
  /** Bases the worker should have (it may have dropped one; then it asks again). */
  private readonly sent: string[] = [];
  private readonly inflight = new Map<number, { job: Job; request: WorkerRequest }>();
  /** Main-thread fallback: base cache like the worker's. */
  private readonly local = new Map<string, Base>();

  constructor() {
    try {
      this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = e => this.onMessage(e.data as WorkerResponse);
      this.worker.onerror = () => this.dropWorker();
    } catch {
      this.worker = null;
    }
  }

  setSource(source: SilhouetteSource | null) {
    this.source = source;
    this.sourceVersion++;
  }

  getSource() {
    return this.source;
  }

  /**
   * One frame of `width × height`. Resolves null when a newer request in the same lane replaced this one before
   * it started, or when there is no picture.
   */
  render(settings: SilhouetteSettings, width: number, height: number, lane: Lane): Promise<Frame | null> {
    return new Promise((resolve, reject) => {
      this.waiting.get(lane)?.resolve(null);
      this.waiting.set(lane, { settings, width, height, resolve, reject });
      if (!this.order.includes(lane)) this.order.push(lane);
      this.pump();
    });
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    for (const job of this.waiting.values()) job.resolve(null);
    this.waiting.clear();
  }

  private pump(): void {
    if (this.busy) return;
    const lane = this.order.shift();
    if (!lane) return;
    const job = this.waiting.get(lane);
    this.waiting.delete(lane);
    if (!job) return this.pump();
    const src = this.source;
    if (!src) {
      job.resolve(null);
      return this.pump();
    }
    const spec = effectiveMask(job.settings, src);
    const baseKey = [
      this.sourceVersion,
      job.width,
      job.height,
      job.settings.padding,
      spec.mode,
      spec.invert,
      spec.threshold,
    ].join('|');
    this.busy = true;

    if (!this.worker) {
      // yield first, so the page can paint whatever led to this render
      setTimeout(() => this.runLocal(job, baseKey, spec, src), 0);
      return;
    }
    const request: WorkerRequest = {
      id: this.nextId++,
      baseKey,
      width: job.width,
      height: job.height,
      spec,
      settings: job.settings,
    };
    if (!this.sent.includes(baseKey)) this.attachPixels(request, src);
    this.inflight.set(request.id, { job, request });
    this.post(request);
  }

  private attachPixels(request: WorkerRequest, src: SilhouetteSource) {
    request.px = drawInFrame(src, request.width, request.height, request.settings.padding).buffer as ArrayBuffer;
    this.sent.push(request.baseKey);
    if (this.sent.length > 4) this.sent.shift();
  }

  private post(request: WorkerRequest) {
    this.worker!.postMessage(request, request.px ? [request.px] : []);
    delete request.px;
  }

  private onMessage(r: WorkerResponse) {
    const entry = this.inflight.get(r.id);
    if (!entry) return;
    if ('needBase' in r) {
      // the worker evicted this base: send the picture again
      const src = this.source;
      if (!src) return this.finish(r.id, null);
      const i = this.sent.indexOf(entry.request.baseKey);
      if (i >= 0) this.sent.splice(i, 1);
      this.attachPixels(entry.request, src);
      this.post(entry.request);
      return;
    }
    if ('error' in r) {
      this.inflight.delete(r.id);
      this.busy = false;
      entry.job.reject(new Error(r.error));
      this.pump();
      return;
    }
    const image = new ImageData(new Uint8ClampedArray(r.pixels), entry.request.width, entry.request.height);
    this.finish(r.id, { image, area: r.area });
  }

  private finish(id: number, frame: Frame | null) {
    const entry = this.inflight.get(id);
    this.inflight.delete(id);
    this.busy = false;
    entry?.job.resolve(frame);
    this.pump();
  }

  private runLocal(job: Job, baseKey: string, spec: ReturnType<typeof effectiveMask>, src: SilhouetteSource) {
    try {
      let base = this.local.get(baseKey);
      if (!base) {
        base = buildBase(drawInFrame(src, job.width, job.height, job.settings.padding), job.width, job.height, spec);
        this.local.set(baseKey, base);
        if (this.local.size > 4) this.local.delete(this.local.keys().next().value!);
      }
      const out = new Uint8ClampedArray(job.width * job.height * 4);
      composite(base, job.settings, out);
      job.resolve({ image: new ImageData(out, job.width, job.height), area: base.area });
    } catch (err) {
      job.reject(err);
    } finally {
      this.busy = false;
      this.pump();
    }
  }

  /** The worker broke (for example its script failed to load): finish its jobs on the main thread from now on. */
  private dropWorker() {
    this.worker?.terminate();
    this.worker = null;
    const stuck = [...this.inflight.values()];
    this.inflight.clear();
    this.busy = false;
    for (const { job } of stuck)
      this.render(job.settings, job.width, job.height, 'export').then(job.resolve, job.reject);
    this.pump();
  }
}
