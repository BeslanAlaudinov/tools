'use client';

import * as Popover from '@radix-ui/react-popover';
import {
  DEFAULT_SETTINGS,
  SilhouetteRenderer,
  effectiveMask,
  randomGradient,
  resetSettings,
  type MaskMode,
  type SilhouetteSettings,
} from '@tools/silhouette';
import {
  Chip,
  Dock,
  DockSeparator,
  ExportPopover,
  Hint,
  HistoryButtons,
  Icons,
  Inspector,
  Pill,
  ResetPopover,
  SchemaSections,
  Segmented,
  SliderRow,
  Stage,
  Toast,
  ToggleRow,
  ToolShell,
  ToolTitle,
  type ResetScope,
} from '@tools/ui';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { SilhouetteToolProvider, type ToastRequest } from './context';
import { ExportPanel, exportSize, type Scale } from './export';
import { forgetPicture, loadPictureFile, loadPictureSvg, restorePicture, usePicture } from './picture';
import { silhouetteTabs, type TabId } from './schema';
import { GradientSection, PresetsSection, ReseedButton } from './sections';
import { SilhouetteCanvas, pictureRatio } from './SilhouetteCanvas';
import { history, hydrateSilhouetteStore, useSilhouetteStore } from './store';

const TOAST_MS = 6000;
/** Below this share of the frame the shape counts as not found. */
const LOST_AREA = 0.002;

export function SilhouetteTool() {
  const [renderer, setRenderer] = useState<SilhouetteRenderer | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void Promise.all([hydrateSilhouetteStore(), restorePicture()]).finally(() => setReady(true));
  }, []);
  // the worker lives as long as the page does
  useEffect(() => {
    const r = new SilhouetteRenderer();
    setRenderer(r);
    return () => r.destroy();
  }, []);
  if (!ready || !renderer)
    return (
      <div className="t-app" aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <p className="t-note">Загружаю силуэт…</p>
      </div>
    );
  return <SilhouetteToolReady renderer={renderer} />;
}

function SilhouetteToolReady({ renderer }: { renderer: SilhouetteRenderer }) {
  const settings = useSilhouetteStore(s => s.settings);
  const set = useSilhouetteStore(s => s.set);
  const replace = useSilhouetteStore(s => s.replace);
  const canUndo = useStore(useSilhouetteStore.temporal, s => s.pastStates.length > 0);
  const canRedo = useStore(useSilhouetteStore.temporal, s => s.futureStates.length > 0);
  const { source, version } = usePicture();

  const [tab, setTab] = useState<TabId>('color');
  const [scale, setScale] = useState<Scale>(2);
  const [comparing, setComparing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [area, setArea] = useState(1);
  const [toast, setToast] = useState<(ToastRequest & { id: number }) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fileInput = useRef<HTMLInputElement>(null);

  // a layout effect runs before the children's effects, so their first renders already see the picture
  useLayoutEffect(() => renderer.setSource(source), [renderer, source, version]);

  const notify = useCallback((t: ToastRequest) => {
    setToast({ ...t, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const open = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      const r = await loadPictureFile(file);
      if (!r.ok) notify({ text: r.message });
    },
    [notify],
  );

  // keyboard: undo/redo, and backslash held shows the original; never while typing
  useEffect(() => {
    const typing = (e: KeyboardEvent) =>
      e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]');
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      } else if (e.key === '\\') setComparing(true);
    };
    const up = (e: KeyboardEvent) => e.key === '\\' && setComparing(false);
    // leaving the window while holding the key must not leave the original on screen
    const blur = () => setComparing(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // a file dropped anywhere on the page, or an image / SVG markup pasted
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      void open(e.dataTransfer?.files?.[0]);
    };
    const paste = (e: ClipboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest('input, textarea')) return;
      const item = [...(e.clipboardData?.items ?? [])].find(i => i.kind === 'file' && i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        void open(item.getAsFile());
        return;
      }
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (/<svg[\s>]/i.test(text)) {
        e.preventDefault();
        void loadPictureSvg(text).then(r => !r.ok && notify({ text: 'В буфере SVG, но его не удалось прочитать' }));
      }
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    window.addEventListener('paste', paste);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
      window.removeEventListener('paste', paste);
    };
  }, [open, notify]);

  const tabs = useMemo(
    () =>
      silhouetteTabs({
        presets: () => <PresetsSection />,
        gradient: () => <GradientSection />,
        reseed: () => <ReseedButton />,
      }),
    [],
  );
  const current = tabs.find(t => t.id === tab) ?? tabs[0]!;
  const palette = [...settings.grad.map(s => s.color), settings.bg, '#FFFFFF', '#000000'];
  const frame = exportSize(settings, pictureRatio(source), 1);
  const size = exportSize(settings, pictureRatio(source), scale);

  const resetKeys = (keys: (keyof SilhouetteSettings)[], title: string) => {
    const patch: Partial<SilhouetteSettings> = {};
    for (const k of keys) (patch as Record<string, unknown>)[k] = structuredClone(DEFAULT_SETTINGS[k]);
    set(patch);
    notify({ text: `Секция «${title}» сброшена`, undo: true });
  };
  const onReset = (scope: ResetScope) => {
    replace(resetSettings(settings, scope));
    if (scope === 'all') void forgetPicture();
    notify({ text: scope === 'style' ? 'Цвет и свечение сброшены' : 'Всё сброшено', undo: scope === 'style' });
  };

  return (
    <SilhouetteToolProvider value={{ renderer, notify }}>
      <ToolShell
        topbar={
          <>
            <ToolTitle
              backHref={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`}
              icon={<Icons.Person />}
              title="Силуэт"
              status={<Chip tone="ok">Сохранено</Chip>}
            />
            <span className="t-spacer" />
            <ResetPopover
              styleNote="Цвет, свечение и зерно. Кадр и картинка останутся."
              allNote={
                source
                  ? 'Ещё уберётся картинка и вернётся кадр по умолчанию. Картинку отменой не вернуть.'
                  : 'Кадр тоже вернётся по умолчанию.'
              }
              onReset={onReset}
            />
            <HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={history.undo} onRedo={history.redo} />
            <span className="t-vsep" />
            <Pill onClick={() => fileInput.current?.click()}>
              <Icons.UploadArrow />
              Загрузить
            </Pill>
            <input
              ref={fileInput}
              type="file"
              accept="image/png,image/svg+xml,image/webp,image/jpeg,.svg"
              hidden
              onChange={e => {
                void open(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <ExportPopover size={`${size.w} × ${size.h} px`} image={<ExportPanel scale={scale} onScale={setScale} />} />
          </>
        }
        stage={
          <Stage
            left={
              source && (
                <span className="t-chip">
                  <b>{settings.aspect === 'auto' ? 'Свой' : settings.aspect}</b>
                  {frame.w} × {frame.h}
                </span>
              )
            }
            center={source && <ShapeChip settings={settings} area={area} />}
            right={
              source && (
                <Hint>
                  <span className="t-key">\</span>Удерживать, чтобы увидеть исходник
                </Hint>
              )
            }
            toast={
              <Toast
                open={!!toast}
                text={toast?.text ?? ''}
                action={toast?.undo ? 'Отменить' : undefined}
                onAction={() => {
                  history.undo();
                  setToast(null);
                }}
              />
            }
            dock={
              source && (
                <Dock>
                  <button
                    type="button"
                    className="t-dbtn"
                    aria-pressed={comparing}
                    title="Удерживать, чтобы увидеть исходник"
                    onPointerDown={() => setComparing(true)}
                    onPointerUp={() => setComparing(false)}
                    onPointerLeave={() => setComparing(false)}
                  >
                    <Icons.Compare />
                    Сравнить
                  </button>
                  <DockSeparator />
                  <button
                    type="button"
                    className="t-dbtn"
                    onClick={() => {
                      set({ grad: randomGradient() });
                      notify({ text: 'Новая палитра', undo: true });
                    }}
                  >
                    <Icons.Shuffle />
                    Случайная палитра
                  </button>
                </Dock>
              )
            }
          >
            <SilhouetteCanvas comparing={comparing} onShape={setArea} onPick={() => fileInput.current?.click()} />
            {dragging && <div className="t-drop">Отпустите — откроем картинку</div>}
          </Stage>
        }
        inspector={
          <Inspector<TabId> tabs={tabs.map(t => ({ id: t.id as TabId, label: t.label }))} active={tab} onTab={setTab}>
            <SchemaSections<SilhouetteSettings>
              sections={current.sections}
              value={settings}
              onChange={set}
              onResetKeys={resetKeys}
              palette={palette}
            />
          </Inspector>
        }
      />
    </SilhouetteToolProvider>
  );
}

/** How the shape was found, over the picture; opens the manual choice. Turns red when nothing was found. */
function ShapeChip({ settings, area }: { settings: SilhouetteSettings; area: number }) {
  const set = useSilhouetteStore(s => s.set);
  const source = usePicture(s => s.source);
  if (!source) return null;
  const spec = effectiveMask(settings, source);
  const lost = area < LOST_AREA;
  const label = lost
    ? 'Форма не найдена'
    : `Форма: ${spec.mode === 'alpha' ? 'по прозрачности' : spec.invert ? 'светлый объект' : 'тёмный объект'}`;
  const note = lost
    ? 'Выберите «Яркость» и подвиньте порог, пока объект не появится.'
    : settings.maskMode === 'auto'
      ? spec.mode === 'alpha'
        ? 'У картинки прозрачный фон — форма по нему.'
        : 'У картинки нет прозрачности — форма по яркости.'
      : null;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="t-chip" data-tone={lost ? 'err' : undefined} style={{ border: 0 }}>
          {label}
          <Icons.ChevronDown size={12} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="t-pop" style={{ width: 320 }} side="bottom" sideOffset={8} collisionPadding={16}>
          <h4>Как найти форму</h4>
          <Segmented<MaskMode>
            size="sm"
            label="Как найти форму"
            value={settings.maskMode}
            onChange={maskMode => set({ maskMode })}
            options={[
              { value: 'auto', label: 'Сама' },
              { value: 'alpha', label: 'Прозрачность' },
              { value: 'luma', label: 'Яркость' },
            ]}
          />
          {note && <p className="t-note">{note}</p>}
          {settings.maskMode === 'luma' && (
            <>
              <SliderRow
                label="Порог"
                value={settings.threshold}
                min={0.02}
                max={0.98}
                step={0.01}
                unit="%"
                scale={100}
                onChange={threshold => set({ threshold }, { continuous: true })}
              />
              <ToggleRow
                label="Светлый объект на тёмном"
                checked={settings.invert}
                onChange={invert => set({ invert })}
              />
            </>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
