'use client';

import {
  DEFAULT_SETTINGS,
  PRESETS,
  PRESET_KEYS,
  SETTINGS_VERSION,
  type GradientStop,
  type SilhouetteSettings,
} from '@tools/silhouette';
import { temporal } from 'zundo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface EditMeta {
  /** Part of a drag or typing burst: merges with the previous edit into one undo step. */
  continuous?: boolean;
}

interface SilhouetteState {
  settings: SilhouetteSettings;
  set: (patch: Partial<SilhouetteSettings>, meta?: EditMeta) => void;
  replace: (next: SilhouetteSettings) => void;
}

const PRESET_SET = new Set<keyof SilhouetteSettings>(PRESET_KEYS);

// One undo step per gesture: continuous edits within a short window collapse into the first one's step.
const MERGE_WINDOW_MS = 600;
let continuousEdit = false;
let windowOpen = false;
let windowTimer: ReturnType<typeof setTimeout> | undefined;

function coalesce<F extends (...args: never[]) => void>(record: F): F {
  return ((...args: Parameters<F>) => {
    if (!(continuousEdit && windowOpen)) record(...args);
    windowOpen = continuousEdit;
    clearTimeout(windowTimer);
    windowTimer = setTimeout(() => (windowOpen = false), MERGE_WINDOW_MS);
  }) as F;
}

export const useSilhouetteStore = create<SilhouetteState>()(
  temporal(
    persist(
      set => ({
        settings: DEFAULT_SETTINGS,
        set: (patch, meta) => {
          continuousEdit = Boolean(meta?.continuous);
          set(s => {
            // the colours a preset sets were changed by hand: the look is no longer that preset
            const leavesPreset =
              !('preset' in patch) && Object.keys(patch).some(k => PRESET_SET.has(k as keyof SilhouetteSettings));
            return { settings: { ...s.settings, ...patch, ...(leavesPreset ? { preset: null } : {}) } };
          });
          continuousEdit = false;
        },
        replace: next => {
          continuousEdit = false;
          windowOpen = false;
          set({ settings: next });
        },
      }),
      {
        name: 'tools.silhouette',
        version: SETTINGS_VERSION,
        storage: createJSONStorage(() => localStorage),
        // the server renders defaults; the saved state is loaded after mount to keep hydration clean
        skipHydration: true,
        partialize: s => ({ settings: s.settings }),
        // new settings added in later versions get their defaults; values of a wrong type are dropped
        merge: (persisted, current) => {
          const p = (persisted ?? {}) as { settings?: unknown };
          return { ...current, settings: { ...DEFAULT_SETTINGS, ...sanitize(p.settings) } };
        },
      },
    ),
    {
      partialize: s => ({ settings: s.settings }),
      equality: (a, b) => a.settings === b.settings,
      limit: 200,
      handleSet: coalesce,
    },
  ),
);

// zundo restores past states through the raw `set`, which bypasses the persist middleware.
// An empty setState goes through it and saves the restored state; equal settings add no history step.
const saveNow = () => useSilhouetteStore.setState({});

export const history = {
  undo: () => {
    windowOpen = false;
    useSilhouetteStore.temporal.getState().undo();
    saveNow();
  },
  redo: () => {
    windowOpen = false;
    useSilhouetteStore.temporal.getState().redo();
    saveNow();
  },
};

/** Loads saved settings once on the client and starts history from there; never blocks for more than 2 s. */
export async function hydrateSilhouetteStore(): Promise<void> {
  try {
    await Promise.race([
      useSilhouetteStore.persist.rehydrate(),
      new Promise<void>(resolve => setTimeout(resolve, 2000)),
    ]);
  } catch (err) {
    console.warn('Saved silhouette settings could not be loaded, using defaults', err);
    useSilhouetteStore.setState({ settings: DEFAULT_SETTINGS });
  } finally {
    useSilhouetteStore.temporal.getState().clear();
  }
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function sanitizeGradient(v: unknown): GradientStop[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const stops = v.filter(
    (s): s is GradientStop =>
      !!s && typeof s === 'object' && typeof s.at === 'number' && s.at >= 0 && s.at <= 100 && isHex(s.color),
  );
  return stops.length >= 2 ? stops.map(s => ({ at: s.at, color: s.color })) : undefined;
}

/** Saved values of the right type only: a stale or hand-edited entry cannot break the effect. */
function sanitize(saved: unknown): Partial<SilhouetteSettings> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(saved)) {
    const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
    if (def === undefined) continue;
    if (k === 'grad') {
      const g = sanitizeGradient(v);
      if (g) out.grad = g;
    } else if (k === 'preset') {
      if (v === null || (typeof v === 'string' && PRESETS.some(p => p.id === v))) out.preset = v;
    } else if (typeof v === typeof def && (typeof def !== 'string' || !def.startsWith('#') || isHex(v))) out[k] = v;
  }
  return out as Partial<SilhouetteSettings>;
}
