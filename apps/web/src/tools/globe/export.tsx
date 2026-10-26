'use client';

import { COUNTRY_CODES, DEFAULT_SETTINGS, frameSize, type GlobeSettings } from '@tools/globe';
import { Chip, Segmented, StatusPill, ToggleRow, useActionFeedback } from '@tools/ui';
import { useState } from 'react';
import { useGlobeTool } from './context';
import { useGlobeStore } from './store';

export const SCALES = [1, 2, 3, 4] as const;
export type Scale = (typeof SCALES)[number];

// what the buttons say while they work and once they are done; only problems get a line under them
const SAVE = { idle: 'Скачать', busy: 'Готовлю…', done: 'Сохранено' };
const COPY = { idle: 'Копировать', busy: 'Копирую…', done: 'Скопировано' };
const SAVE_CODE = { ...SAVE, idle: 'Скачать файл' };
const COPY_CODE = { ...COPY, idle: 'Копировать код' };

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('encode failed'))), type, 0.92),
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

export function ImageExportPanel({ scale, onScale }: { scale: Scale; onScale: (s: Scale) => void }) {
  const settings = useGlobeStore(s => s.settings);
  const { engine } = useGlobeTool();
  const [fmt, setFmt] = useState<'png' | 'jpg'>('png');
  const [transparent, setTransparent] = useState(false);
  const bgOff = settings.bgMode === 'transparent';
  const [error, setError] = useState<string | null>(null);
  const [saveState, runSave] = useActionFeedback();
  const [copyState, runCopy] = useActionFeedback();
  const frame = frameSize(settings);
  const long = Math.max(frame.w, frame.h);

  const render = (type: 'png' | 'jpg') => {
    const e = engine.current;
    if (!e) throw new Error('engine not ready');
    return e.renderImage(frame.w * scale, frame.h * scale, {
      opaque: type === 'jpg',
      overrides: transparent && type === 'png' ? { bgMode: 'transparent' } : undefined,
    });
  };
  const fileName = (ext: string) => `globe-${frame.w * scale}x${frame.h * scale}.${ext}`;

  const download = () => {
    setError(null);
    runSave(async () => {
      await new Promise(r => setTimeout(r, 30)); // let "Готовлю…" paint before the heavy render
      const r = render(fmt);
      saveBlob(await toBlob(r.canvas, fmt === 'png' ? 'image/png' : 'image/jpeg'), fileName(fmt));
      // the file is saved, but the largest points were capped by the graphics card
      if (r.clipped) setError('Точки крупнее, чем умеет видеокарта: выберите качество поменьше');
    }).catch(err => {
      console.error(err);
      setError('Не хватило памяти. Выберите качество поменьше');
    });
  };

  const copy = () => {
    setError(null);
    runCopy(async () => {
      if (!navigator.clipboard || typeof ClipboardItem === 'undefined') throw new Error('no clipboard');
      // the promise keeps the click's permission while the image renders
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toBlob(render('png').canvas, 'image/png') })]);
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
      <div className="t-stack">
        <span className="t-lbl">
          Качество<small>во сколько раз крупнее кадра</small>
        </span>
        <Segmented<Scale>
          size="tall"
          label="Качество"
          value={scale}
          onChange={onScale}
          options={SCALES.map(k => ({ value: k, label: `${k}×`, sub: long * k }))}
        />
      </div>
      {fmt === 'png' && (
        // with the background already off in the style, the PNG is transparent anyway: say so, don't offer a choice
        <ToggleRow
          label="Прозрачный фон"
          hint={bgOff ? 'Фон выключен в стиле' : 'Без фона, виньетки и зерна'}
          checked={transparent || bgOff}
          disabled={bgOff}
          onChange={setTransparent}
        />
      )}
      <div className="t-actions">
        <StatusPill state={copyState} labels={COPY} onClick={copy} />
        <StatusPill variant="primary" state={saveState} labels={SAVE} onClick={download} />
      </div>
      {error && <Chip tone="err">{error}</Chip>}
    </div>
  );
}

// ---------- code ----------

type CodeKind = 'react' | 'wc' | 'html';

/** Only what differs from the defaults goes into the snippet. */
function changedSettings(s: GlobeSettings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(s) as (keyof GlobeSettings)[]) {
    if (k === 'preset') continue;
    if (JSON.stringify(s[k]) !== JSON.stringify(DEFAULT_SETTINGS[k])) out[k] = s[k];
  }
  if (Array.isArray(out.countries)) out.countries = (out.countries as number[]).map(i => COUNTRY_CODES[i - 1] || i);
  return out;
}

function snippet(kind: CodeKind, s: GlobeSettings): string {
  const frame = frameSize(s);
  const w = Math.round(frame.w / 2);
  const h = Math.round(frame.h / 2);
  const settings = JSON.stringify(changedSettings(s), null, 2);
  const indented = (n: number) => settings.split('\n').join('\n' + ' '.repeat(n));
  if (kind === 'react')
    return `import { Globe } from '@tools/globe-react';

export function Hero() {
  return (
    <Globe
      style={{ width: ${w}, height: ${h} }}
      settings={${indented(6)}}
    />
  );
}`;
  if (kind === 'wc')
    return `<!-- один раз на странице -->
<script type="module" src="globe.js"></script>

<globe-view style="width:${w}px;height:${h}px"></globe-view>
<script type="module">
  document.querySelector('globe-view').settings = ${indented(2)};
</script>`;
  return `<!-- файл globe-embed.html положите рядом со страницей -->
<iframe
  src="globe-embed.html"
  width="${w}" height="${h}"
  style="border:0;background:transparent"
  loading="lazy" title="Глобус">
</iframe>`;
}

export function CodeExportPanel() {
  const settings = useGlobeStore(s => s.settings);
  const [kind, setKind] = useState<CodeKind>('react');
  const [error, setError] = useState<string | null>(null);
  const [saveState, runSave] = useActionFeedback();
  const [copyState, runCopy] = useActionFeedback();
  const code = snippet(kind, settings);
  const download = () => {
    setError(null);
    void runSave(() =>
      saveBlob(new Blob([code], { type: 'text/plain' }), kind === 'react' ? 'Globe.tsx' : 'globe.html'),
    );
  };
  const copy = () => {
    setError(null);
    runCopy(() => navigator.clipboard.writeText(code)).catch(() =>
      setError('Браузер не дал доступ к буферу. Выделите код вручную'),
    );
  };
  return (
    <div className="t-stack" style={{ gap: 14 }}>
      <Segmented<CodeKind>
        size="sm"
        label="Вид кода"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'react', label: 'React' },
          { value: 'wc', label: 'Web Component' },
          { value: 'html', label: 'HTML' },
        ]}
      />
      <pre className="t-code">{code}</pre>
      <p className="t-note">
        Глобус с текущими настройками. Пакеты для подключения выпустим отдельным шагом, сейчас это то, как будет
        выглядеть код.
      </p>
      <div className="t-actions">
        <StatusPill state={saveState} labels={SAVE_CODE} onClick={download} />
        <StatusPill variant="primary" state={copyState} labels={COPY_CODE} onClick={copy} />
      </div>
      {error && <Chip tone="err">{error}</Chip>}
    </div>
  );
}
