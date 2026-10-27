'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { GlobeEngine, frameSize, type GlobeView } from '@tools/globe';
import { Pill, fitFrame } from '@tools/ui';
import { useEffect, useRef, useState } from 'react';
import { useGlobeStore } from './store';

/** The frame alone, without the interface: a second engine that follows the same settings. */
export function PreviewDialog({
  open,
  onOpenChange,
  view,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  view: () => GlobeView;
}) {
  const settings = useGlobeStore(s => s.settings);
  const frame = frameSize(settings);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GlobeEngine | null>(null);
  const [win, setWin] = useState({ w: 0, h: 0 });
  const fit = fitFrame(win.w, win.h - 64, frame.w, frame.h, { x: 24, top: 0, bottom: 24 });

  useEffect(() => {
    if (!open) return;
    const onResize = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open]);

  // the dialog content mounts after `open`, so the engine starts once the canvases exist
  const start = () => {
    if (!canvas.current || !overlay.current || engine.current) return;
    const e = new GlobeEngine({
      canvas: canvas.current,
      overlay: overlay.current,
      settings: useGlobeStore.getState().settings,
      view: view(),
      fontFamily: getComputedStyle(document.body).fontFamily,
    });
    engine.current = e;
    e.resize(fit.w, fit.h);
  };
  useEffect(() => {
    if (!open) return;
    const unsubscribe = useGlobeStore.subscribe((s, prev) => {
      if (s.settings !== prev.settings) engine.current?.setSettings(s.settings);
    });
    return () => {
      unsubscribe();
      engine.current?.destroy();
      engine.current = null;
    };
  }, [open]);
  useEffect(() => {
    engine.current?.resize(fit.w, fit.h);
  }, [fit.w, fit.h]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content
          className="t-preview"
          aria-describedby={undefined}
          onOpenAutoFocus={() => requestAnimationFrame(start)}
        >
          <div className="t-preview-bar">
            <Dialog.Title style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Предпросмотр</Dialog.Title>
            <span className="t-chip">
              <b>{settings.aspect === 'custom' ? 'Свой' : settings.aspect}</b>
              {frame.w} × {frame.h}
            </span>
            <span className="t-spacer" />
            <span className="t-hint">
              <span className="t-key">Esc</span>закрыть
            </span>
            <Dialog.Close asChild>
              <Pill>Закрыть</Pill>
            </Dialog.Close>
          </div>
          <div className="t-preview-stage">
            {/* exact edges, as in the exported file: no rounding, the outline sits outside */}
            <div
              className="t-frame"
              data-exact=""
              data-transparent={settings.bgMode === 'transparent' || undefined}
              style={{ width: fit.w, height: fit.h }}
            >
              <canvas ref={canvas} aria-label="Кадр глобуса" />
              <canvas ref={overlay} data-overlay="" aria-hidden="true" />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
