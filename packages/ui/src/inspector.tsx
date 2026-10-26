'use client';

import { ColorRow, IconButton, Ruler, Segmented, SliderRow, Tiles, Toggle, ToggleRow, NumberField } from './controls';
import { Reset, Shuffle } from './icons';
import { Card } from './shell';
import { sectionKeys, type Control, type Section } from './schema';

/** Renders one tab of a tool's schema against its settings. */
export function SchemaSections<S extends object>({
  sections,
  value,
  onChange,
  onResetKeys,
  onShuffleKeys,
  palette,
}: {
  sections: Section<S>[];
  value: S;
  /** `continuous` marks drags and typing so the tool can fold a gesture into one undo step. */
  onChange: (patch: Partial<S>, meta?: { continuous?: boolean }) => void;
  onResetKeys?: (keys: (keyof S)[], title: string) => void;
  onShuffleKeys?: (section: Section<S>) => void;
  /** Colors offered in every color picker of the tool. */
  palette?: string[];
}) {
  return (
    <>
      {sections
        .filter(sec => !sec.visible || sec.visible(value))
        .map(sec => (
          <Card
            key={sec.id}
            title={sec.title}
            count={sec.count?.(value)}
            actions={
              <>
                {sec.resettable && onResetKeys && (
                  <IconButton
                    size="sm"
                    label="Сбросить секцию"
                    onClick={() => onResetKeys(sectionKeys(sec), sec.title)}
                  >
                    <Reset size={16} />
                  </IconButton>
                )}
                {sec.shuffle && onShuffleKeys && (
                  <IconButton size="sm" label="Перемешать секцию" onClick={() => onShuffleKeys(sec)}>
                    <Shuffle size={16} />
                  </IconButton>
                )}
                {sec.toggleKey && (
                  <Toggle
                    label={sec.title}
                    checked={Boolean(value[sec.toggleKey])}
                    onChange={v => onChange({ [sec.toggleKey!]: v } as Partial<S>)}
                  />
                )}
              </>
            }
          >
            {sec.controls
              .filter(c => !c.visible || c.visible(value))
              .map((c, i) => (
                <ControlView
                  key={'key' in c ? String(c.key) : `${c.type}-${i}`}
                  control={c}
                  value={value}
                  onChange={onChange}
                  palette={palette}
                />
              ))}
          </Card>
        ))}
    </>
  );
}

function ControlView<S extends object>({
  control: c,
  value,
  onChange,
  palette,
}: {
  control: Control<S>;
  value: S;
  onChange: (patch: Partial<S>, meta?: { continuous?: boolean }) => void;
  palette?: string[];
}) {
  const continuous = c.type === 'slider' || c.type === 'color' || c.type === 'ruler';
  const set = (key: keyof S, v: unknown) => {
    const extra = c.also ? c.also(v as never, value) : {};
    onChange({ ...extra, [key]: v } as Partial<S>, { continuous });
  };
  switch (c.type) {
    case 'slider':
      return (
        <SliderRow
          label={c.label}
          value={value[c.key] as number}
          min={c.min}
          max={c.max}
          step={c.step}
          unit={c.unit}
          scale={c.scale}
          hint={c.hint}
          onChange={v => set(c.key, v)}
        />
      );
    case 'segmented':
      return (
        <div className="t-stack">
          {c.label && <span className="t-lbl">{c.label}</span>}
          <Segmented
            label={c.label}
            size={c.size ?? 'sm'}
            value={value[c.key]}
            options={c.options}
            onChange={v => set(c.key, v)}
          />
        </div>
      );
    case 'toggle':
      return <ToggleRow label={c.label} hint={c.hint} checked={Boolean(value[c.key])} onChange={v => set(c.key, v)} />;
    case 'color':
      return (
        <ColorRow label={c.label} value={value[c.key] as string} onChange={v => set(c.key, v)} palette={palette} />
      );
    case 'ruler':
      return (
        <div className="t-stack">
          <div className="t-row" data-wide="">
            <span className="t-lbl">{c.label}</span>
            <NumberField
              label={c.label}
              value={value[c.key] as number}
              min={c.min}
              max={c.max}
              step={1}
              unit={c.unit}
              onChange={v => set(c.key, v)}
            />
          </div>
          <Ruler
            label={c.label}
            value={value[c.key] as number}
            min={c.min}
            max={c.max}
            step={c.step}
            major={c.major}
            onChange={v => set(c.key, v)}
          />
        </div>
      );
    case 'tiles':
      return <Tiles value={value[c.key]} options={c.options} columns={c.columns} onChange={v => set(c.key, v)} />;
    case 'note':
      return <p className="t-note">{c.text}</p>;
    case 'custom':
      return <>{c.render()}</>;
  }
}
