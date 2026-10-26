'use client';

import * as Popover from '@radix-ui/react-popover';
import {
  DEFAULT_SETTINGS,
  FX_DEFAULTS,
  alignOffset,
  frameSize,
  randomLook,
  resetSettings,
  type GlobeEngine,
  type GlobeEngineCallbacks,
  type GlobeSettings,
} from '@tools/globe';
import {
  AlignButtons,
  Chip,
  Dock,
  DockSeparator,
  ExportPopover,
  Hint,
  HistoryButtons,
  IconButton,
  Icons,
  Inspector,
  Pill,
  ResetPopover,
  SchemaSections,
  Stage,
  Toast,
  ToolShell,
  ToolTitle,
  plural,
  type ResetScope,
  type Section,
} from '@tools/ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { GlobeToolProvider, type ToastRequest } from './context';
import { CodeExportPanel, ImageExportPanel, type Scale } from './export';
import { GlobeCanvas } from './GlobeCanvas';
import { PreviewDialog } from './Preview';
import { FX_OPTIONS, globeTabs, type TabId } from './schema';
import { CountriesSection, CustomFrameSection, MarkersSection, PresetsSection, RoutesSection } from './sections';
import { history, hydrateGlobeStore, useGlobeStore } from './store';

const TOAST_MS = 6000;

export function GlobeTool() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void hydrateGlobeStore().finally(() => setReady(true));
  }, []);
  // the saved state lives in the browser, so the tool renders only after it is loaded (a split second)
  if (!ready)
    return (
      <div className="t-app" aria-busy="true" style={{ display: 'grid', placeItems: 'center' }}>
        <p className="t-note">Загружаю глобус…</p>
      </div>
    );
  return <GlobeToolReady />;
}

function GlobeToolReady() {
  const settings = useGlobeStore(s => s.settings);
  const set = useGlobeStore(s => s.set);
  const replace = useGlobeStore(s => s.replace);
  const setView = useGlobeStore(s => s.setView);
  const canUndo = useStore(useGlobeStore.temporal, s => s.pastStates.length > 0);
  const canRedo = useStore(useGlobeStore.temporal, s => s.futureStates.length > 0);

  const engine = useRef<GlobeEngine | null>(null);
  const [tab, setTab] = useState<TabId>('style');
  const [playing, setPlaying] = useState(true);
  const [preview, setPreview] = useState(false);
  const [scale, setScale] = useState<Scale>(2);
  const [toast, setToast] = useState<(ToastRequest & { id: number }) | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((t: ToastRequest) => {
    setToast({ ...t, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  const undoFromToast = () => {
    history.undo();
    setToast(null);
  };

  const callbacks: GlobeEngineCallbacks = {
    onPatch: patch => set(patch, { continuous: 'zoom' in patch || 'offX' in patch }),
    onViewChange: setView,
    onMarkerClick: id => {
      const m = useGlobeStore.getState().settings.markers.find(x => x.id === id);
      if (m) engine.current?.flyTo(m.lat, m.lon);
    },
    onNotice: text => notify({ text }),
  };

  useEffect(() => engine.current?.setPlaying(playing), [playing]);

  // keyboard: undo/redo and play/pause; never while typing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, [contenteditable="true"]');
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) history.redo();
        else history.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        history.redo();
      } else if (
        e.code === 'Space' &&
        !(e.target instanceof HTMLElement && e.target.closest('button, [role="slider"]'))
      ) {
        e.preventDefault();
        setPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tabs = useMemo(
    () =>
      globeTabs({
        presets: () => <PresetsSection />,
        countries: () => <CountriesSection />,
        markers: () => <MarkersSection />,
        routes: () => <RoutesSection />,
        customFrame: () => <CustomFrameSection />,
      }),
    [],
  );
  const current = tabs.find(t => t.id === tab) ?? tabs[0]!;
  const frame = frameSize(settings);
  const palette = [settings.colorA, settings.colorB, settings.atmoColor, settings.markerAccent, '#FFFFFF', '#000000'];

  const resetKeys = (keys: (keyof GlobeSettings)[], title: string) => {
    const patch: Partial<GlobeSettings> = {};
    for (const k of keys) (patch as Record<string, unknown>)[k] = DEFAULT_SETTINGS[k];
    set(patch);
    notify({ text: `Секция «${title}» сброшена`, undo: true });
  };
  const shuffleSection = (sec: Section<GlobeSettings>) => {
    const patch: Record<string, unknown> = {};
    for (const c of sec.controls) {
      if (c.type === 'slider')
        patch[c.key as string] = Number(
          (c.min + Math.round((Math.random() * (c.max - c.min)) / c.step) * c.step).toFixed(4),
        );
      else if (c.type === 'segmented' || c.type === 'tiles') {
        const opts = c.options.filter(o => !o.disabled);
        patch[c.key as string] = opts[Math.floor(Math.random() * opts.length)]!.value;
      }
    }
    set(patch as Partial<GlobeSettings>);
    notify({ text: `Секция «${sec.title}» перемешана`, undo: true });
  };
  const shuffleAll = () => {
    replace(randomLook(settings));
    engine.current?.setView({ yaw: Math.random() * 360 - 180, pitch: Math.random() * 60 - 20 });
    notify({ text: 'Стиль перемешан', undo: true });
  };
  const onReset = (scope: ResetScope) => {
    replace(resetSettings(settings, scope === 'style'));
    notify({ text: scope === 'style' ? 'Стиль сброшен' : 'Всё сброшено', undo: true });
  };

  const m = settings.markers.length,
    r = settings.routes.length,
    c = settings.countries.length;
  const lost = [
    m && `${m} ${plural(m, ['метка', 'метки', 'меток'])}`,
    r && `${r} ${plural(r, ['маршрут', 'маршрута', 'маршрутов'])}`,
    c && `${c} ${plural(c, ['страна', 'страны', 'стран'])}`,
  ].filter(Boolean) as string[];
  const allNote = lost.length
    ? `Ещё удалятся ${lost.length > 1 ? `${lost.slice(0, -1).join(', ')} и ${lost.at(-1)}` : lost[0]}.`
    : 'Меток, маршрутов и выделенных стран сейчас нет.';

  const fxLabel = settings.fxOn ? (FX_OPTIONS.find(o => o.value === settings.fx)?.label ?? '') : 'Без эффекта';

  return (
    <GlobeToolProvider value={{ engine, notify }}>
      <ToolShell
        topbar={
          <>
            <ToolTitle
              backHref={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/`}
              icon={<Icons.Globe />}
              title="Globe"
              status={<Chip tone="ok">Сохранено</Chip>}
            />
            <span className="t-spacer" />
            <ResetPopover
              styleNote="Точки, цвета, движение и фон. Метки, маршруты, страны и кадр останутся."
              allNote={allNote}
              onReset={onReset}
            />
            <HistoryButtons canUndo={canUndo} canRedo={canRedo} onUndo={history.undo} onRedo={history.redo} />
            <span className="t-vsep" />
            <Pill onClick={() => setPreview(true)}>
              <Icons.Eye />
              Предпросмотр
            </Pill>
            <ExportPopover
              size={`${frame.w * scale} × ${frame.h * scale} px`}
              image={<ImageExportPanel scale={scale} onScale={setScale} />}
              code={<CodeExportPanel />}
            />
          </>
        }
        stage={
          <Stage
            left={
              <span className="t-chip">
                <b>{settings.aspect === 'custom' ? 'Свой' : settings.aspect}</b>
                {frame.w} × {frame.h}
              </span>
            }
            center={<AlignButtons onAlign={align => set(alignOffset(settings, align))} />}
            right={
              <>
                <Hint icon={<Icons.Hand size={16} />}>Тянуть — вращать</Hint>
                {settings.countryClick && <Hint icon={<Icons.Cursor size={16} />}>Клик — страна</Hint>}
                <Hint>
                  <span className="t-key">Shift</span>+ тянуть — двигать
                </Hint>
              </>
            }
            toast={
              <Toast
                open={!!toast}
                text={toast?.text ?? ''}
                action={toast?.undo ? 'Отменить' : undefined}
                onAction={undoFromToast}
              />
            }
            dock={
              <Dock>
                <IconButton
                  strong
                  label={playing ? 'Пауза (пробел)' : 'Пуск (пробел)'}
                  onClick={() => setPlaying(p => !p)}
                >
                  {playing ? <Icons.Pause /> : <Icons.Play />}
                </IconButton>
                <DockSeparator />
                <Popover.Root>
                  <Popover.Trigger asChild>
                    <button type="button" className="t-dbtn" aria-label="Эффект поверх">
                      {fxLabel}
                      <Icons.ChevronDown size={14} />
                    </button>
                  </Popover.Trigger>
                  <Popover.Portal>
                    <Popover.Content className="t-menu" side="top" align="start" sideOffset={10} role="menu">
                      <Popover.Close asChild>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={!settings.fxOn}
                          onClick={() => set({ fxOn: false })}
                        >
                          Без эффекта
                        </button>
                      </Popover.Close>
                      {FX_OPTIONS.map(o => (
                        <Popover.Close asChild key={o.value}>
                          <button
                            type="button"
                            role="menuitemradio"
                            aria-checked={settings.fxOn && settings.fx === o.value}
                            onClick={() =>
                              set(
                                settings.fx === o.value
                                  ? { fxOn: true }
                                  : { fxOn: true, fx: o.value, ...FX_DEFAULTS[o.value] },
                              )
                            }
                          >
                            {o.icon}
                            {o.label}
                          </button>
                        </Popover.Close>
                      ))}
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
                <button type="button" className="t-dbtn" onClick={shuffleAll}>
                  <Icons.Shuffle />
                  Перемешать
                </button>
                <DockSeparator />
                <IconButton
                  label="Уменьшить"
                  onClick={() => set({ zoom: Math.max(0.2, +(settings.zoom - 0.1).toFixed(2)) }, { continuous: true })}
                >
                  <Icons.Minus size={16} />
                </IconButton>
                <span className="t-num" style={{ minWidth: 52, textAlign: 'center', fontWeight: 500 }}>
                  {Math.round(settings.zoom * 100)}%
                </span>
                <IconButton
                  label="Увеличить"
                  onClick={() => set({ zoom: Math.min(4, +(settings.zoom + 0.1).toFixed(2)) }, { continuous: true })}
                >
                  <Icons.Plus size={16} />
                </IconButton>
              </Dock>
            }
          >
            <GlobeCanvas engineRef={engine} callbacks={callbacks} />
          </Stage>
        }
        inspector={
          <Inspector<TabId> tabs={tabs.map(t => ({ id: t.id as TabId, label: t.label }))} active={tab} onTab={setTab}>
            <SchemaSections<GlobeSettings>
              sections={current.sections}
              value={settings}
              onChange={set}
              onResetKeys={resetKeys}
              onShuffleKeys={shuffleSection}
              palette={palette}
            />
          </Inspector>
        }
      />
      <PreviewDialog
        open={preview}
        onOpenChange={setPreview}
        view={() => engine.current?.getView() ?? useGlobeStore.getState().view}
      />
    </GlobeToolProvider>
  );
}
