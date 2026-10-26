'use client';

import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { IconButton, Pill, Segmented } from './controls';
import {
  AlignBottom,
  AlignCenter,
  AlignLeft,
  AlignMiddle,
  AlignRight,
  AlignTop,
  ChevronLeft,
  Download,
  Redo,
  Reset,
  Undo,
} from './icons';

// ---------- page frame ----------

export function ToolShell({ topbar, stage, inspector }: { topbar: ReactNode; stage: ReactNode; inspector: ReactNode }) {
  return (
    <div className="t-app">
      <header className="t-topbar">{topbar}</header>
      <main className="t-main">
        {stage}
        {inspector}
      </main>
    </div>
  );
}

/** Left part of the top bar: back to the library, tool icon and name, save status. */
export function ToolTitle({
  backHref,
  icon,
  title,
  status,
}: {
  backHref: string;
  icon: ReactNode;
  title: string;
  status?: ReactNode;
}) {
  return (
    <>
      <a className="t-pill" data-variant="back" href={backHref}>
        <ChevronLeft />
        Библиотека
      </a>
      <span className="t-vsep" />
      <div className="t-tool">
        <span className="t-tool-ico">{icon}</span>
        {title}
      </div>
      {status}
    </>
  );
}

export function HistoryButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}) {
  return (
    <div className="t-group" role="group" aria-label="История">
      <IconButton label="Отменить (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}>
        <Undo />
      </IconButton>
      <IconButton label="Повторить (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}>
        <Redo />
      </IconButton>
    </div>
  );
}

// ---------- reset ----------

export type ResetScope = 'style' | 'all';

/** Quiet "Reset" button with a confirmation popover: style only, or everything including the user's content. */
export function ResetPopover({
  styleNote,
  allNote,
  onReset,
}: {
  styleNote: string;
  allNote: string;
  onReset: (scope: ResetScope) => void;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ResetScope>('style');
  const choice = (value: ResetScope, title: string, note: string) => (
    <button type="button" role="radio" aria-checked={scope === value} onClick={() => setScope(value)}>
      <span className="t-radio" />
      <span>
        <b>{title}</b>
        <small>{note}</small>
      </span>
    </button>
  );
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Pill variant="quiet">
          <Reset size={16} />
          Сбросить
        </Pill>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="t-pop"
          style={{ width: 340 }}
          side="bottom"
          align="center"
          sideOffset={8}
          collisionPadding={16}
        >
          <div className="t-stack" style={{ gap: 4 }}>
            <h4>Вернуть настройки по умолчанию?</h4>
            <p className="t-note">Если передумаете, сброс можно отменить.</p>
          </div>
          <div className="t-choices" role="radiogroup" aria-label="Что сбросить">
            {choice('style', 'Только стиль', styleNote)}
            {choice('all', 'Всё', allNote)}
          </div>
          <div className="t-actions">
            <Popover.Close asChild>
              <Pill>Отмена</Pill>
            </Popover.Close>
            <Pill
              variant="danger"
              onClick={() => {
                onReset(scope);
                setOpen(false);
              }}
            >
              Сбросить
            </Pill>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Confirmation next to the element that asked for it. The caller decides when to ask (`open`),
 * so a click that loses nothing can act straight away.
 */
export function ConfirmPopover({
  open,
  onOpenChange,
  title,
  note,
  confirmLabel,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  note: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  /** The anchor: a single element that can hold a ref. */
  children: ReactNode;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor asChild>{children}</Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          className="t-pop"
          style={{ width: 320 }}
          side="left"
          align="start"
          sideOffset={12}
          collisionPadding={16}
        >
          <div className="t-stack" style={{ gap: 4 }}>
            <h4>{title}</h4>
            <p className="t-note">{note}</p>
          </div>
          <div className="t-actions">
            <Popover.Close asChild>
              <Pill>Отмена</Pill>
            </Popover.Close>
            <Pill variant="primary" onClick={onConfirm}>
              {confirmLabel}
            </Pill>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------- export ----------

export type ExportKind = 'image' | 'code';

/** "Export" button and popover: an image tab and a code tab; video is announced but not ready. */
export function ExportPopover({ size, image, code }: { size: string; image: ReactNode; code: ReactNode }) {
  const [kind, setKind] = useState<ExportKind>('image');
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Pill variant="primary">
          <Download />
          Экспорт
        </Pill>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="t-pop" side="bottom" align="end" sideOffset={8} collisionPadding={16}>
          <div className="t-pop-h">
            <h4>Экспорт</h4>
            {kind === 'image' && <span className="t-size">{size}</span>}
          </div>
          <Segmented<ExportKind | 'video'>
            label="Что экспортировать"
            value={kind}
            onChange={v => v !== 'video' && setKind(v)}
            options={[
              { value: 'image', label: 'Картинка' },
              { value: 'code', label: 'Код' },
              {
                value: 'video',
                label: (
                  <>
                    Видео <span className="t-soon">скоро</span>
                  </>
                ),
                disabled: true,
              },
            ]}
          />
          {kind === 'image' ? image : code}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

// ---------- stage ----------

export function Stage({
  children,
  left,
  center,
  right,
  dock,
  toast,
}: {
  children: ReactNode;
  left?: ReactNode;
  /** Top middle of the stage. */
  center?: ReactNode;
  right?: ReactNode;
  dock?: ReactNode;
  toast?: ReactNode;
}) {
  return (
    <section className="t-stage" aria-label="Холст">
      {children}
      {left && (
        <div className="t-stage-corner" data-side="left">
          {left}
        </div>
      )}
      {center && (
        <div className="t-stage-corner" data-side="center">
          {center}
        </div>
      )}
      {right && (
        <div className="t-stage-corner" data-side="right" aria-label="Управление">
          {right}
        </div>
      )}
      {toast}
      {dock}
    </section>
  );
}

export type Align = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

const ALIGN_BUTTONS: { value: Align; label: string; Icon: typeof AlignLeft }[][] = [
  [
    { value: 'left', label: 'По левому краю', Icon: AlignLeft },
    { value: 'center', label: 'По центру', Icon: AlignCenter },
    { value: 'right', label: 'По правому краю', Icon: AlignRight },
  ],
  [
    { value: 'top', label: 'По верхнему краю', Icon: AlignTop },
    { value: 'middle', label: 'По середине', Icon: AlignMiddle },
    { value: 'bottom', label: 'По нижнему краю', Icon: AlignBottom },
  ],
];

/** Figma-style alignment of the subject inside the frame: horizontal and vertical groups. */
export function AlignButtons({ onAlign }: { onAlign: (align: Align) => void }) {
  return (
    <div className="t-align" role="toolbar" aria-label="Положение в кадре">
      {ALIGN_BUTTONS.map((group, i) => (
        <div key={i} className="t-align-group">
          {group.map(({ value, label, Icon }) => (
            <button key={value} type="button" aria-label={label} title={label} onClick={() => onAlign(value)}>
              <Icon size={16} />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Dock({ children }: { children: ReactNode }) {
  return (
    <div className="t-dock" role="toolbar" aria-label="Действия с холстом">
      {children}
    </div>
  );
}

export const DockSeparator = () => <span className="t-dsep" />;

export function Hint({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="t-hint">
      {icon}
      {children}
    </span>
  );
}

export function Toast({
  open,
  text,
  action,
  onAction,
}: {
  open: boolean;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="t-toast" role="status" aria-live="polite" data-open={open || undefined}>
      <span>{text}</span>
      {action && (
        <Pill size="sm" onClick={onAction}>
          {action}
        </Pill>
      )}
    </div>
  );
}

// ---------- inspector ----------

export function Inspector<T extends string>({
  tabs,
  active,
  onTab,
  children,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onTab: (id: T) => void;
  children: ReactNode;
}) {
  return (
    <aside className="t-inspector" aria-label="Настройки">
      <div className="t-inspector-tabs">
        <Segmented<T>
          label="Разделы настроек"
          value={active}
          onChange={onTab}
          options={tabs.map(t => ({ value: t.id, label: t.label }))}
        />
      </div>
      <div className="t-panel" key={active}>
        {children}
      </div>
    </aside>
  );
}

export function Card({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="t-card">
      <div className="t-card-h">
        <h3>{title}</h3>
        {count !== undefined && <span className="t-count">{count}</span>}
        <span className="t-spacer" />
        {actions}
      </div>
      {children}
    </section>
  );
}
