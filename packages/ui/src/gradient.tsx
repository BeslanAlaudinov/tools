'use client';

import { useRef, useState } from 'react';
import { HexField, IconButton, NumberField } from './controls';
import { Close } from './icons';

export interface ColorStop {
  /** 0 … 100 along the bar. */
  at: number;
  color: string;
}

const hexToRgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
};
const rgbToHex = (rgb: readonly number[]) => '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

/** The colour the gradient already has at `at`, so a new stop does not change the picture until it is moved. */
function colorAt(stops: readonly ColorStop[], at: number): string {
  const s = stops.slice().sort((a, b) => a.at - b.at);
  if (at <= s[0]!.at) return s[0]!.color;
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]!,
      b = s[i + 1]!;
    if (at <= b.at) {
      const t = b.at > a.at ? (at - a.at) / (b.at - a.at) : 0;
      const ca = hexToRgb(a.color),
        cb = hexToRgb(b.color);
      return rgbToHex(ca.map((v, k) => v + (cb[k]! - v) * t));
    }
  }
  return s[s.length - 1]!.color;
}

/**
 * Gradient as a bar with stops, like in Figma: drag a stop along the bar, click the bar to add one; the selected
 * stop's colour and position are edited below.
 */
export function GradientEditor({
  stops,
  onChange,
  startLabel,
  endLabel,
  palette,
}: {
  stops: ColorStop[];
  onChange: (stops: ColorStop[], meta?: { continuous?: boolean }) => void;
  startLabel: string;
  endLabel: string;
  palette?: string[];
}) {
  const [selected, setSelected] = useState(Math.min(1, stops.length - 1));
  const bar = useRef<HTMLDivElement>(null);
  const sel = Math.min(selected, stops.length - 1);
  const stop = stops[sel]!;
  const sorted = stops.slice().sort((a, b) => a.at - b.at);
  const css = `linear-gradient(90deg, ${sorted.map(s => `${s.color} ${s.at}%`).join(', ')})`;

  const posAt = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.max(0, Math.min(100, Math.round(((clientX - r.left) / r.width) * 100)));
  };
  const update = (i: number, patch: Partial<ColorStop>, continuous = false) =>
    onChange(
      stops.map((s, k) => (k === i ? { ...s, ...patch } : s)),
      { continuous },
    );

  return (
    <div className="t-grad">
      <div
        ref={bar}
        className="t-grad-bar"
        style={{ background: css }}
        title="Клик — новая точка"
        onPointerDown={e => {
          if (e.target !== e.currentTarget) return;
          const at = posAt(e.clientX);
          onChange([...stops, { at, color: colorAt(stops, at) }]);
          setSelected(stops.length);
        }}
      >
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            className="t-grad-stop"
            aria-pressed={i === sel}
            aria-label={`Точка ${i + 1}: ${s.color}, ${s.at}%`}
            style={{ left: `${s.at}%`, background: s.color }}
            onPointerDown={e => {
              setSelected(i);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              const at = posAt(e.clientX);
              if (at !== s.at) update(i, { at }, true);
            }}
            onKeyDown={e => {
              const d = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
              if (!d) return;
              e.preventDefault();
              update(i, { at: Math.max(0, Math.min(100, s.at + d * (e.shiftKey ? 10 : 1))) }, true);
            }}
          />
        ))}
      </div>
      <div className="t-grad-ends">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
      <div className="t-grad-edit">
        <HexField
          label={`Цвет точки ${sel + 1}`}
          value={stop.color}
          onChange={color => update(sel, { color }, true)}
          palette={palette}
        />
        <NumberField
          label={`Положение точки ${sel + 1}`}
          value={stop.at}
          min={0}
          max={100}
          unit="%"
          onChange={at => update(sel, { at })}
        />
        <IconButton
          size="sm"
          label="Убрать точку"
          disabled={stops.length <= 2}
          onClick={() => {
            onChange(stops.filter((_, k) => k !== sel));
            setSelected(Math.max(0, sel - 1));
          }}
        >
          <Close size={14} />
        </IconButton>
      </div>
    </div>
  );
}
