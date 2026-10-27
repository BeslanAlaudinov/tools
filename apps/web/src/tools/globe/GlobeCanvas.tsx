'use client';

import { GlobeEngine, frameSize, type GlobeEngineCallbacks } from '@tools/globe';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { fitFrame } from '@tools/ui';
import { useGlobeStore } from './store';

/** Live globe on the stage. Owns the engine and keeps it in sync with the store. */
export function GlobeCanvas({
  engineRef,
  callbacks,
}: {
  engineRef: RefObject<GlobeEngine | null>;
  callbacks: GlobeEngineCallbacks;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [boxSize, setBoxSize] = useState({ w: 0, h: 0 });
  const frame = useGlobeStore(useShallow(s => frameSize(s.settings)));
  const transparent = useGlobeStore(s => s.settings.bgMode === 'transparent');
  const cb = useRef(callbacks);
  cb.current = callbacks;

  useEffect(() => {
    if (!canvas.current || !overlay.current) return;
    if (!GlobeEngine.isSupported()) {
      setFailed(
        'Этот браузер не умеет WebGL, а глобус рисуется через него. Откройте страницу в свежем Chrome, Edge, Firefox или Safari.',
      );
      return;
    }
    let engine: GlobeEngine;
    try {
      const { settings, view } = useGlobeStore.getState();
      engine = new GlobeEngine({
        canvas: canvas.current,
        overlay: overlay.current,
        settings,
        view,
        interactive: true,
        fontFamily: getComputedStyle(document.body).fontFamily,
        callbacks: {
          onPatch: p => cb.current.onPatch?.(p),
          onViewChange: v => cb.current.onViewChange?.(v),
          onMarkerClick: id => cb.current.onMarkerClick?.(id),
          onNotice: t => cb.current.onNotice?.(t),
        },
      });
    } catch (err) {
      console.error(err);
      setFailed('Видеокарта не смогла запустить глобус. Попробуйте другой браузер.');
      return;
    }
    engineRef.current = engine;
    // handy for debugging in the browser console; never shipped to production
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __globe?: GlobeEngine }).__globe = engine;
    const unsubscribe = useGlobeStore.subscribe((s, prev) => {
      if (s.settings !== prev.settings) engine.setSettings(s.settings);
    });
    return () => {
      unsubscribe();
      engine.destroy();
      engineRef.current = null;
    };
  }, [engineRef]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = fitFrame(boxSize.w, boxSize.h, frame.w, frame.h);
  useEffect(() => {
    if (boxSize.w) engineRef.current?.resize(fit.w, fit.h);
  }, [fit.w, fit.h, boxSize.w, engineRef]);

  return (
    <div ref={box} style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', paddingBottom: 32 }}>
      {failed ? (
        <p className="t-fail">{failed}</p>
      ) : (
        <div className="t-frame" data-transparent={transparent || undefined} style={{ width: fit.w, height: fit.h }}>
          <canvas ref={canvas} data-interactive="" aria-label="Глобус. Тяните, чтобы вращать" />
          <canvas ref={overlay} data-overlay="" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}
