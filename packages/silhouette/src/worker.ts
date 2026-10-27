// Runs the effect off the main thread, so sliders and the page stay responsive while a frame is computed.
// Keeps the last few shape bases: changing colours or glow only re-runs `composite`.

import { buildBase, composite, type Base, type MaskSpec } from './render';
import type { SilhouetteSettings } from './settings';

export interface WorkerRequest {
  id: number;
  /** Identifies picture + frame size + padding + how the shape is found. */
  baseKey: string;
  width: number;
  height: number;
  spec: MaskSpec;
  /** The picture drawn into the frame; sent only when the worker does not have this base yet. */
  px?: ArrayBuffer;
  settings: SilhouetteSettings;
}

export type WorkerResponse =
  { id: number; pixels: ArrayBuffer; area: number } | { id: number; needBase: true } | { id: number; error: string };

const MAX_BASES = 4;
const bases = new Map<string, Base>();

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse, transfer?: Transferable[]): void;
};

scope.onmessage = e => {
  const r = e.data;
  try {
    let base = bases.get(r.baseKey);
    if (!base) {
      if (!r.px) {
        scope.postMessage({ id: r.id, needBase: true });
        return;
      }
      base = buildBase(new Uint8ClampedArray(r.px), r.width, r.height, r.spec);
      bases.set(r.baseKey, base);
      if (bases.size > MAX_BASES) bases.delete(bases.keys().next().value!);
    } else {
      // most recently used goes to the end
      bases.delete(r.baseKey);
      bases.set(r.baseKey, base);
    }
    const out = new Uint8ClampedArray(r.width * r.height * 4);
    composite(base, r.settings, out);
    scope.postMessage({ id: r.id, pixels: out.buffer, area: base.area }, [out.buffer]);
  } catch (err) {
    scope.postMessage({ id: r.id, error: err instanceof Error ? err.message : String(err) });
  }
};
