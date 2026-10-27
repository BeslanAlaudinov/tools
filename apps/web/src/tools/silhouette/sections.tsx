'use client';

import { PRESETS, applyPreset, randomGradient, sortedStops, type Preset } from '@tools/silhouette';
import { ConfirmPopover, GradientEditor, Pill } from '@tools/ui';
import { useEffect, useState } from 'react';
import { useSilhouetteTool } from './context';
import { usePicture } from './picture';
import { useSilhouetteStore } from './store';

const THUMB = { w: 96, h: 120 };

/** Before a picture is loaded: the preset's colours from edge (bottom) to core (top) on its background. */
function swatch(p: Preset): string {
  const c = document.createElement('canvas');
  c.width = THUMB.w;
  c.height = THUMB.h;
  const g = c.getContext('2d')!;
  g.fillStyle = p.bg;
  g.fillRect(0, 0, c.width, c.height);
  const lg = g.createLinearGradient(0, c.height, 0, 0);
  for (const s of sortedStops(p.grad)) lg.addColorStop(s.at / 100, s.color);
  g.fillStyle = lg;
  g.beginPath();
  g.roundRect(18, 18, c.width - 36, c.height - 36, 14);
  g.fill();
  return c.toDataURL();
}

function toUrl(image: ImageData): string {
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  c.getContext('2d')!.putImageData(image, 0, 0);
  return c.toDataURL();
}

/** Preset tiles drawn on the current picture, so the choice shows what it will look like. */
export function PresetsSection() {
  const { renderer } = useSilhouetteTool();
  const preset = useSilhouetteStore(s => s.settings.preset);
  const replace = useSilhouetteStore(s => s.replace);
  const { source, version } = usePicture();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    if (!source) {
      setThumbs(Object.fromEntries(PRESETS.map(p => [p.id, swatch(p)])));
      return;
    }
    // one at a time in the thumbnail lane; a newer picture stops this run
    void (async () => {
      const base = { ...useSilhouetteStore.getState().settings, aspect: '4:5' as const, grain: 0, transparent: false };
      for (const p of PRESETS) {
        const frame = await renderer.render(applyPreset(base, p), THUMB.w, THUMB.h, 'thumb').catch(() => null);
        if (!alive) return;
        if (frame) setThumbs(t => ({ ...t, [p.id]: toUrl(frame.image) }));
      }
    })();
    return () => {
      alive = false;
    };
  }, [renderer, source, version]);

  // A preset replaces the colours. Hand-made ones (preset === null) would be lost, so ask first.
  const [asking, setAsking] = useState<Preset | null>(null);
  const apply = (p: Preset) => {
    setAsking(null);
    replace(applyPreset(useSilhouetteStore.getState().settings, p));
  };
  return (
    <ConfirmPopover
      open={asking !== null}
      onOpenChange={open => !open && setAsking(null)}
      title={`Применить «${asking?.name ?? ''}»?`}
      note="Ваш градиент и цвет фона заменятся пресетом. Свечение и кадр останутся. Вернуть можно через Ctrl+Z."
      confirmLabel="Применить"
      onConfirm={() => asking && apply(asking)}
    >
      <div className="t-presets" data-portrait="">
        {PRESETS.map(p => (
          <button
            key={p.id}
            type="button"
            className="t-preset"
            aria-pressed={preset === p.id}
            data-pending={asking?.id === p.id || undefined}
            onClick={() => {
              if (preset === p.id) return;
              if (preset === null) setAsking(p);
              else apply(p);
            }}
          >
            {thumbs[p.id] ? <img src={thumbs[p.id]} alt="" /> : <span className="t-preset-img" />}
            {p.name}
          </button>
        ))}
      </div>
    </ConfirmPopover>
  );
}

export function GradientSection() {
  const grad = useSilhouetteStore(s => s.settings.grad);
  const bg = useSilhouetteStore(s => s.settings.bg);
  const set = useSilhouetteStore(s => s.set);
  const { notify } = useSilhouetteTool();
  return (
    <>
      <GradientEditor
        stops={grad}
        onChange={(stops, meta) => set({ grad: stops }, meta)}
        startLabel="край"
        endLabel="сердцевина"
        palette={[...sortedStops(grad).map(s => s.color), bg]}
      />
      <p className="t-note">Тяните точки по полосе. Клик по полосе — новая точка.</p>
      <div className="t-two">
        <Pill size="sm" onClick={() => set({ grad: grad.map(s => ({ ...s, at: 100 - s.at })) })}>
          Развернуть
        </Pill>
        <Pill
          size="sm"
          onClick={() => {
            set({ grad: randomGradient() });
            notify({ text: 'Новая палитра', undo: true });
          }}
        >
          Случайная палитра
        </Pill>
      </div>
    </>
  );
}

export function ReseedButton() {
  const set = useSilhouetteStore(s => s.set);
  return (
    <Pill size="sm" onClick={() => set({ seed: (Math.random() * 1e6) | 0 })}>
      Перемешать зерно
    </Pill>
  );
}
