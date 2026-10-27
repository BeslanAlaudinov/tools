'use client';

import { BASE_LONG_SIDE, frameSize, type SilhouetteSettings } from '@tools/silhouette';
import { Chip, Segmented, StatusPill, useActionFeedback } from '@tools/ui';
import { useState } from 'react';
import { useSilhouetteTool } from './context';
import { usePicture } from './picture';
import { pictureRatio } from './SilhouetteCanvas';
import { useSilhouetteStore } from './store';

export const SCALES = [1, 2, 3] as const;
export type Scale = (typeof SCALES)[number];

const SAVE = { idle: 'Скачать', busy: 'Готовлю…', done: 'Сохранено' };
const COPY = { idle: 'Копировать', busy: 'Копирую…', done: 'Скопировано' };

/** Export size in px for a scale: the frame's long side is 1350 px at 1×. */
export function exportSize(s: SilhouetteSettings, ratio: number, scale: Scale) {
  return frameSize(s.aspect, BASE_LONG_SIDE * scale, ratio);
}

function toBlob(image: ImageData, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const c = document.createElement('canvas');
  c.width = image.width;
  c.height = image.height;
  c.getContext('2d')!.putImageData(image, 0, 0);
  return new Promise((resolve, reject) =>
    c.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), type, 0.92),
  );
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

const fileBase = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .slice(0, 40) || 'silhouette';

export function ExportPanel({ scale, onScale }: { scale: Scale; onScale: (s: Scale) => void }) {
  const { renderer } = useSilhouetteTool();
  const settings = useSilhouetteStore(s => s.settings);
  const source = usePicture(s => s.source);
  const [fmt, setFmt] = useState<'png' | 'jpg'>('png');
  const [error, setError] = useState<string | null>(null);
  const [saveState, runSave] = useActionFeedback();
  const [copyState, runCopy] = useActionFeedback();
  const ratio = pictureRatio(source);
  const size = exportSize(settings, ratio, scale);

  // JPG has no transparency: the background colour fills in
  const render = async (type: 'png' | 'jpg') => {
    const s = type === 'jpg' ? { ...settings, transparent: false } : settings;
    const frame = await renderer.render(s, size.w, size.h, 'export');
    if (!frame) throw new Error('no picture');
    return frame.image;
  };

  const download = () => {
    if (!source) return;
    setError(null);
    runSave(async () => {
      const type = fmt === 'png' ? 'image/png' : 'image/jpeg';
      saveBlob(await toBlob(await render(fmt), type), `${fileBase(source.name)}-${size.w}x${size.h}.${fmt}`);
    }).catch(err => {
      console.error(err);
      setError('Не хватило памяти. Выберите качество поменьше');
    });
  };

  const copy = () => {
    if (!source) return;
    setError(null);
    runCopy(async () => {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('no clipboard');
      // the promise keeps the click's permission while the picture renders
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': render('png').then(i => toBlob(i, 'image/png')) }),
      ]);
    }).catch(err => {
      console.error(err);
      setError('Браузер не дал доступ к буферу. Скачайте файл');
    });
  };

  return (
    <div className="t-stack" style={{ gap: 14 }}>
      <div className="t-row" data-wide="">
        <span className="t-lbl">Формат файла</span>
        <div style={{ width: 150 }}>
          <Segmented
            size="sm"
            label="Формат файла"
            value={fmt}
            onChange={setFmt}
            options={[
              { value: 'png', label: 'PNG' },
              { value: 'jpg', label: 'JPG' },
            ]}
          />
        </div>
      </div>
      {fmt === 'jpg' && settings.transparent && (
        <p className="t-note">В JPG нет прозрачности: вместо неё будет цвет фона.</p>
      )}
      <div className="t-stack">
        <span className="t-lbl">
          Качество<small>во сколько раз крупнее кадра</small>
        </span>
        <Segmented<Scale>
          size="tall"
          label="Качество"
          value={scale}
          onChange={onScale}
          options={SCALES.map(k => {
            const f = exportSize(settings, ratio, k);
            return { value: k, label: `${k}×`, sub: Math.max(f.w, f.h) };
          })}
        />
      </div>
      <div className="t-actions">
        <StatusPill state={copyState} labels={COPY} onClick={copy} disabled={!source} />
        <StatusPill variant="primary" state={saveState} labels={SAVE} onClick={download} disabled={!source} />
      </div>
      {!source && <p className="t-note">Сначала загрузите картинку.</p>}
      {error && <Chip tone="err">{error}</Chip>}
    </div>
  );
}
