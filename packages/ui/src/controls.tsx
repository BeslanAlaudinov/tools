'use client';

import * as Popover from '@radix-ui/react-popover';
import * as Select from '@radix-ui/react-select';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { hexToHsv, hsvToHex, normalizeHex, recentColors, type Hsv } from './color';
import { Check, ChevronDown, Spinner } from './icons';
import type { Option } from './schema';

// ---------- buttons ----------

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'quiet' | 'back' | 'danger';
  size?: 'md' | 'sm';
};
export const Pill = forwardRef<HTMLButtonElement, PillProps>(function Pill(
  { variant = 'default', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={className ? `t-pill ${className}` : 't-pill'}
      data-variant={variant === 'default' ? undefined : variant}
      data-size={size === 'md' ? undefined : size}
      {...rest}
    />
  );
});

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: 'md' | 'sm';
  strong?: boolean;
};
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', strong, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className="t-ibtn"
      aria-label={label}
      title={label}
      data-size={size === 'md' ? undefined : size}
      data-strong={strong || undefined}
      {...rest}
    />
  );
});

export function Chip({ tone, children }: { tone?: 'ok' | 'info' | 'err'; children: ReactNode }) {
  return (
    <span className="t-chip" data-tone={tone}>
      {children}
    </span>
  );
}

// ---------- segmented, tiles ----------

export function Segmented<V>({
  value,
  options,
  onChange,
  size = 'md',
  label,
}: {
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
  size?: 'md' | 'sm' | 'tall';
  label?: string;
}) {
  return (
    <div className="t-seg" data-size={size === 'md' ? undefined : size} role="group" aria-label={label}>
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          aria-pressed={o.value === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.icon}
          {o.label}
          {o.sub !== undefined && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

export function Tiles<V>({
  value,
  options,
  onChange,
  columns = 4,
}: {
  value: V;
  options: Option<V>[];
  onChange: (v: V) => void;
  columns?: number;
}) {
  return (
    <div className="t-tiles" style={{ ['--cols' as string]: columns }}>
      {options.map((o, i) => (
        <button
          key={i}
          type="button"
          className="t-tile"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.icon}
          <b>{o.label}</b>
          {o.sub !== undefined && <small>{o.sub}</small>}
        </button>
      ))}
    </div>
  );
}

// ---------- numbers ----------

const decimalsFor = (step: number) => (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);

/** Editable number with a unit. Commits on Enter or blur; arrows step, Shift ×10. */
export function NumberField({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  label: string;
}) {
  const dec = decimalsFor(step);
  const shown = value.toFixed(dec);
  const [draft, setDraft] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const clampRound = (n: number) => {
    const c = Math.min(max, Math.max(min, n));
    return Number((Math.round(c / step) * step).toFixed(dec));
  };
  const commit = () => {
    if (draft === null) return;
    const n = parseFloat(draft.replace(',', '.'));
    if (!Number.isNaN(n)) onChange(clampRound(n));
    setDraft(null);
  };
  return (
    <label className="t-val" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        inputMode="decimal"
        aria-label={label}
        value={draft ?? shown}
        style={{ width: `${Math.max(2, (draft ?? shown).length) + 0.4}ch` }}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
          else if (e.key === 'Escape') {
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            setDraft(null);
            onChange(clampRound(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)));
          }
        }}
      />
      {unit && <i>{unit}</i>}
    </label>
  );
}

/** Label · editable value · fill slider. `scale` maps stored values to shown ones (0.6 → 60 %). */
export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  scale = 1,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  scale?: number;
  hint?: string;
  onChange: (v: number) => void;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  const shownStep = Math.max(step * scale, 10 ** -decimalsFor(step * scale));
  return (
    <div className="t-row" title={hint}>
      <label className="t-lbl" htmlFor={id}>
        {label}
      </label>
      <NumberField
        label={`${label}, значение`}
        value={value * scale}
        min={min * scale}
        max={max * scale}
        step={shownStep}
        unit={unit}
        onChange={v => onChange(v / scale)}
      />
      <input
        id={id}
        className="t-range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--p' as string]: `calc(${pct}% + ${7 - pct * 0.14}px)` }}
        onChange={e => onChange(Number(e.target.value))}
      />
    </div>
  );
}

// ---------- toggle ----------

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="t-tgl"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="t-trow">
      <div>
        {label}
        {hint && <small>{hint}</small>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </div>
  );
}

// ---------- ruler ----------

/** Angle scale: drag sideways to change, the white line in the middle marks the value. */
export function Ruler({
  value,
  min,
  max,
  step,
  major,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  major: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(340);
  const px = 9;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const c = width / 2;
  const ticks: { t: number; x: number }[] = [];
  for (let t = Math.ceil((value - (c / px) * step) / step) * step; t <= value + (c / px) * step; t += step) {
    if (t >= min && t <= max) ticks.push({ t, x: c + ((t - value) / step) * px });
  }
  const start = useRef<{ x: number; v: number } | null>(null);
  return (
    <div
      ref={ref}
      className="t-ruler"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, v: value };
      }}
      onPointerMove={e => {
        if (!start.current) return;
        const v = start.current.v - ((e.clientX - start.current.x) / px) * step;
        onChange(Math.round(Math.min(max, Math.max(min, v))));
      }}
      onPointerUp={() => (start.current = null)}
      onKeyDown={e => {
        const d =
          e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        onChange(Math.min(max, Math.max(min, Math.round(value) + d * (e.shiftKey ? 10 : 1))));
      }}
    >
      {ticks.map(({ t, x }) => (
        <span key={t} style={{ left: x }} data-major={t % major === 0 || undefined} data-zero={t === 0 || undefined} />
      ))}
    </div>
  );
}

// ---------- dropdown ----------

export function Dropdown<V extends string | number>({
  value,
  options,
  onChange,
  placeholder = 'Выберите',
  label,
}: {
  value: V | null;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
  placeholder?: string;
  label: string;
}) {
  const byKey = new Map(options.map(o => [String(o.value), o.value]));
  return (
    <Select.Root
      value={value === null ? undefined : String(value)}
      onValueChange={k => {
        const v = byKey.get(k);
        if (v !== undefined) onChange(v);
      }}
    >
      <Select.Trigger className="t-dd" aria-label={label} title={options.find(o => o.value === value)?.label}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon>
          <ChevronDown size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="t-dd-menu" position="popper" sideOffset={6}>
          <Select.Viewport>
            {options.map(o => (
              <Select.Item key={String(o.value)} value={String(o.value)} className="t-dd-item">
                <Select.ItemText>{o.label}</Select.ItemText>
                <Select.ItemIndicator className="t-dd-check">
                  <Check size={14} />
                </Select.ItemIndicator>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

// ---------- color ----------

function useDrag(onMove: (x: number, y: number) => void, onEnd: () => void) {
  return {
    onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const move = (cx: number, cy: number) => {
        const r = el.getBoundingClientRect();
        onMove(Math.min(1, Math.max(0, (cx - r.left) / r.width)), Math.min(1, Math.max(0, (cy - r.top) / r.height)));
      };
      move(e.clientX, e.clientY);
      el.onpointermove = m => move(m.clientX, m.clientY);
      el.onpointerup = () => {
        el.onpointermove = null;
        el.onpointerup = null;
        onEnd();
      };
    },
  };
}

/** Valid colors, uppercased, each once, in the original order. */
function uniqueColors(colors: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of colors) {
    const v = normalizeHex(c);
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function ColorPicker({
  value,
  onChange,
  palette,
}: {
  value: string;
  onChange: (hex: string) => void;
  palette: string[];
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const recent = useSyncExternalStore(recentColors.subscribe, recentColors.get, () => [] as string[]);
  const [draft, setDraft] = useState<string | null>(null);
  const apply = (next: Hsv) => {
    setHsv(next);
    onChange(hsvToHex(next));
  };
  const sv = useDrag(
    (x, y) => apply({ ...hsv, s: x, v: 1 - y }),
    () => {},
  );
  const hue = useDrag(
    x => apply({ ...hsv, h: x * 360 }),
    () => {},
  );
  const hex = hsvToHex(hsv);
  // a tool's palette can repeat a color (e.g. edge and glow both orange): show each one once
  const swatches = uniqueColors(palette).slice(0, 16);
  const swatch = (c: string) => (
    <button key={c} type="button" style={{ background: c }} aria-label={c} onClick={() => apply(hexToHsv(c))} />
  );
  return (
    <>
      <div className="t-sv" style={{ ['--h' as string]: hsv.h }} {...sv}>
        <span className="t-knob" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hex }} />
      </div>
      <div className="t-hue" {...hue}>
        <span
          className="t-knob"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: hsvToHex({ h: hsv.h, s: 1, v: 1 }) }}
        />
      </div>
      <label className="t-hex">
        <span className="t-sw" style={{ background: hex }} />
        <input
          aria-label="Цвет в HEX"
          maxLength={7}
          value={draft ?? hex}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            const v = draft === null ? null : normalizeHex(draft);
            if (v) apply(hexToHsv(v));
            setDraft(null);
          }}
          onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </label>
      {swatches.length > 0 && (
        <>
          <p className="t-cap">Цвета палитры</p>
          <div className="t-swatches">{swatches.map(swatch)}</div>
        </>
      )}
      {recent.length > 0 && (
        <>
          <p className="t-cap">Недавно использованные</p>
          <div className="t-swatches">{uniqueColors(recent).map(swatch)}</div>
        </>
      )}
    </>
  );
}

/** HEX field; the swatch opens the picker. A changed color goes to "recent" when the picker closes. */
export function HexField({
  value,
  onChange,
  label,
  palette = [],
}: {
  value: string;
  onChange: (hex: string) => void;
  label: string;
  palette?: string[];
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // a color set elsewhere (picker, preset, undo) replaces whatever was half-typed here
  useEffect(() => setDraft(null), [value]);
  const atOpen = useRef(value);
  return (
    <div className="t-hex">
      <Popover.Root
        open={open}
        onOpenChange={o => {
          setOpen(o);
          if (o) atOpen.current = value;
          else if (value.toUpperCase() !== atOpen.current.toUpperCase()) recentColors.add(value);
        }}
      >
        <Popover.Trigger asChild>
          <button
            type="button"
            className="t-sw"
            style={{ background: value }}
            aria-label={`${label}: открыть палитру`}
          />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content className="t-picker" side="bottom" align="start" sideOffset={8} collisionPadding={12}>
            <ColorPicker value={value} onChange={onChange} palette={palette} />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      <input
        aria-label={label}
        maxLength={7}
        value={draft ?? value.toUpperCase()}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft === null ? null : normalizeHex(draft);
          if (v && v !== value.toUpperCase()) {
            onChange(v);
            recentColors.add(v);
          }
          setDraft(null);
        }}
        onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
  palette,
}: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  palette?: string[];
}) {
  return (
    <div className="t-row" data-wide="">
      <span className="t-lbl">{label}</span>
      <HexField label={label} value={value} onChange={onChange} palette={palette} />
    </div>
  );
}

// ---------- action buttons with status ----------

export type ActionState = 'idle' | 'busy' | 'done';

/**
 * Runs an action and reports busy → done (for a moment) → idle. A failed action goes straight back to idle
 * and rethrows, so the caller can show what went wrong.
 */
export function useActionFeedback(doneMs = 1600) {
  const [state, setState] = useState<ActionState>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // the action starts synchronously, inside the click, so clipboard and download permissions hold
  const run = async (action: () => unknown): Promise<void> => {
    clearTimeout(timer.current);
    setState('busy');
    try {
      await action();
    } catch (err) {
      setState('idle');
      throw err;
    }
    setState('done');
    timer.current = setTimeout(() => setState('idle'), doneMs);
  };
  return [state, run] as const;
}

/** A pill that says what its action is doing: "Готовлю…" with a spinner, then "Сохранено" with a check. */
export function StatusPill({
  state,
  labels,
  onClick,
  ...rest
}: PillProps & { state: ActionState; labels: { idle: string; busy: string; done: string } }) {
  const busy = state === 'busy';
  return (
    <Pill
      {...rest}
      aria-busy={busy || undefined}
      aria-disabled={busy || undefined}
      onClick={e => {
        if (!busy) onClick?.(e);
      }}
    >
      {busy && <Spinner size={18} className="t-spin" />}
      {state === 'done' && <Check size={18} className="t-pop-in" />}
      <span aria-live="polite">{labels[state]}</span>
    </Pill>
  );
}
