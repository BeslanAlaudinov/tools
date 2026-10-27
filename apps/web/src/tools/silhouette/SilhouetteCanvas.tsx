'use client';

import { drawInFrame, frameSize, type SilhouetteSettings, type SilhouetteSource } from '@tools/silhouette';
import { Icons, Pill, fitFrame } from '@tools/ui';
import { useEffect, useRef, useState } from 'react';
import { useSilhouetteTool } from './context';
import { usePicture } from './picture';
import { useSilhouetteStore } from './store';

/** Longest side of the preview in device pixels; the stage never shows more. */
const PREVIEW_MAX = 1800;
/** After the last change the full-size frame follows this long; until then a half-size one keeps up. */
const SETTLE_MS = 160;

export function pictureRatio(source: SilhouetteSource | null) {
  return source ? source.width / source.height : 0.8;
}

/** The effect on the stage, or the drop zone while there is no picture yet. */
export function SilhouetteCanvas({
  comparing,
  onShape,
  onPick,
}: {
  comparing: boolean;
  /** Share of the frame the shape covers, after every full render (near 0: shape not found). */
  onShape: (area: number) => void;
  onPick: () => void;
}) {
  const { renderer } = useSilhouetteTool();
  const settings = useSilhouetteStore(s => s.settings);
  const { source, version, loading } = usePicture();
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState(false);
  const shapeCb = useRef(onShape);
  shapeCb.current = onShape;

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const frame = frameSize(settings.aspect, 1000, pictureRatio(source));
  const fit = fitFrame(boxSize.w, boxSize.h, frame.w, frame.h);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !source || fit.w < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, PREVIEW_MAX / Math.max(fit.w, fit.h));
    const W = Math.round(fit.w * dpr);
    const H = Math.round(fit.h * dpr);
    if (comparing) {
      showOriginal(cv, source, settings, W, H);
      return;
    }
    let alive = true;
    const draw = (full: boolean) => {
      const w = full ? W : Math.max(1, Math.round(W / 2));
      const h = full ? H : Math.max(1, Math.round(H / 2));
      const slow = setTimeout(() => alive && setBusy(true), 300);
      void renderer.render(settings, w, h, 'preview').then(
        f => {
          clearTimeout(slow);
          if (!alive || !f) return;
          cv.width = f.image.width;
          cv.height = f.image.height;
          cv.getContext('2d')!.putImageData(f.image, 0, 0);
          if (full) {
            setBusy(false);
            shapeCb.current(f.area);
          }
        },
        () => clearTimeout(slow),
      );
    };
    // a quick half-size frame right away, the sharp one once the edits pause
    draw(false);
    const t = setTimeout(() => draw(true), SETTLE_MS);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [renderer, settings, source, version, fit.w, fit.h, comparing]);

  return (
    <div ref={box} className="t-stage-box">
      {source ? (
        <div
          className="t-frame"
          data-transparent={(settings.transparent && !comparing) || undefined}
          style={{ width: fit.w, height: fit.h }}
        >
          <canvas ref={canvas} aria-label={comparing ? 'Исходная картинка' : 'Картинка с эффектом'} />
          {busy && <span className="t-computing">Считаю…</span>}
          {comparing && <span className="t-compare-badge">Исходник</span>}
        </div>
      ) : (
        <div className="t-empty">
          <Icons.Upload size={40} />
          <h2>{loading ? 'Открываю картинку…' : 'Перетащите PNG или SVG сюда'}</h2>
          <p>
            Лучше всего — картинка с прозрачным фоном или SVG. Края станут ореолом, середина — плотным цветом. Файл
            никуда не уходит.
          </p>
          <Pill variant="primary" onClick={onPick} disabled={loading}>
            Выбрать файл
          </Pill>
          <span className="t-empty-or">
            или вставьте картинку через <span className="t-key">Ctrl</span>+<span className="t-key">V</span>
          </span>
        </div>
      )}
    </div>
  );
}

/** The picture as it sits in the frame, on the background colour: what the effect starts from. */
function showOriginal(cv: HTMLCanvasElement, source: SilhouetteSource, s: SilhouetteSettings, W: number, H: number) {
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = s.bg;
  g.fillRect(0, 0, W, H);
  g.putImageData(composeOver(g, drawInFrame(source, W, H, s.padding), W, H), 0, 0);
}

/** The framed picture blended over what is already on the canvas. */
function composeOver(g: CanvasRenderingContext2D, px: Uint8ClampedArray, W: number, H: number): ImageData {
  const under = g.getImageData(0, 0, W, H);
  const o = under.data;
  for (let i = 0; i < o.length; i += 4) {
    const a = px[i + 3]! / 255;
    o[i] = o[i]! + (px[i]! - o[i]!) * a;
    o[i + 1] = o[i + 1]! + (px[i + 1]! - o[i + 1]!) * a;
    o[i + 2] = o[i + 2]! + (px[i + 2]! - o[i + 2]!) * a;
  }
  return under;
}
