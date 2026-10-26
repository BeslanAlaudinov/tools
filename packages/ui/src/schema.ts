import type { ReactNode } from 'react';

/**
 * A tool describes its inspector as data: tabs → sections → controls. The shell renders it, so every tool
 * gets the same controls, reset and shuffle behaviour without its own UI code.
 */

export interface Option<V> {
  value: V;
  label: ReactNode;
  /** Second line under the label (segments in the tall size, tiles). */
  sub?: ReactNode;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
}

interface Base<S> {
  /** Hide the control when it does not apply. */
  visible?: (s: S) => boolean;
  /** Extra values to set together with this one, e.g. effect defaults when the effect changes. */
  also?: (value: never, s: S) => Partial<S>;
}

export type Control<S> = Base<S> &
  (
    | {
        type: 'slider';
        key: keyof S;
        label: string;
        min: number;
        max: number;
        step: number;
        unit?: string;
        /** Shown value = stored value × scale (e.g. 0.6 → 60 %). */
        scale?: number;
        hint?: string;
      }
    | { type: 'segmented'; key: keyof S; label?: string; options: Option<S[keyof S]>[]; size?: 'md' | 'sm' | 'tall' }
    | { type: 'toggle'; key: keyof S; label: string; hint?: string }
    | { type: 'color'; key: keyof S; label: string }
    | {
        type: 'ruler';
        key: keyof S;
        label: string;
        min: number;
        max: number;
        step: number;
        major: number;
        unit?: string;
      }
    | { type: 'tiles'; key: keyof S; options: Option<S[keyof S]>[]; columns?: number }
    | { type: 'note'; text: string }
    | { type: 'custom'; render: () => ReactNode }
  );

export interface Section<S> {
  id: string;
  title: string;
  controls: Control<S>[];
  /** A switch in the section header (e.g. "Эффект поверх"). */
  toggleKey?: keyof S;
  /** Show ↺ in the header; resets the section's keys to defaults. */
  resettable?: boolean;
  /** Show ⤨ in the header; randomizes the section's sliders and segments. */
  shuffle?: boolean;
  /** Counter next to the title, e.g. number of markers. */
  count?: (s: S) => number;
  visible?: (s: S) => boolean;
}

export interface Tab<S> {
  id: string;
  label: string;
  sections: Section<S>[];
}

/** Keys a section controls: used by section reset and shuffle. */
export function sectionKeys<S>(section: Section<S>): (keyof S)[] {
  const keys: (keyof S)[] = [];
  if (section.toggleKey) keys.push(section.toggleKey);
  for (const c of section.controls) if ('key' in c) keys.push(c.key);
  return keys;
}
