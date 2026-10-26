'use client';

import { DEFAULT_SETTINGS, DEFAULT_VIEW, PRESETS, type GlobeSettings, type GlobeView } from '@tools/globe';
import { temporal } from 'zundo';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Keys that are not part of the look: changing them keeps the selected preset. */
const NOT_STYLE = new Set<keyof GlobeSettings>([
  'countries',
  'markers',
  'routes',
  'aspect',
  'customW',
  'customH',
  'zoom',
  'offX',
  'offY',
  'preset',
  'countryClick',
]);

export interface EditMeta {
  /** Part of a drag or typing burst: merges with the previous edit into one undo step. */
  continuous?: boolean;
}

interface GlobeState {
  settings: GlobeSettings;
  /** Camera; saved, but never part of undo history. */
  view: GlobeView;
  set: (patch: Partial<GlobeSettings>, meta?: EditMeta) => void;
  replace: (next: GlobeSettings) => void;
  setView: (view: GlobeView) => void;
}

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

export const useGlobeStore = create<GlobeState>()(
  temporal(
    persist(
      set => ({
        settings: DEFAULT_SETTINGS,
        view: DEFAULT_VIEW,
        set: (patch, meta) => {
          continuousEdit = Boolean(meta?.continuous);
          set(s => {
            const touchesStyle =
              !('preset' in patch) && Object.keys(patch).some(k => !NOT_STYLE.has(k as keyof GlobeSettings));
            return { settings: { ...s.settings, ...patch, ...(touchesStyle ? { preset: null } : {}) } };
          });
          continuousEdit = false;
        },
        replace: next => {
          continuousEdit = false;
          windowOpen = false;
          set({ settings: next });
        },
        setView: view => set({ view }),
      }),
      {
        name: 'tools.globe',
        version: 1,
        storage: createJSONStorage(() => localStorage),
        // the server renders defaults; the saved state is loaded after mount to keep hydration clean
        skipHydration: true,
        partialize: s => ({ settings: s.settings, view: s.view }),
        // new settings added in later versions get their defaults; values of a wrong type are dropped
        merge: (persisted, current) => {
          const p = (persisted ?? {}) as { settings?: unknown; view?: Partial<GlobeView> };
          const view = p.view && typeof p.view.yaw === 'number' && typeof p.view.pitch === 'number' ? p.view : {};
          return {
            ...current,
            settings: { ...DEFAULT_SETTINGS, ...sanitize(p.settings) },
            view: { ...DEFAULT_VIEW, ...view },
          };
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
const saveNow = () => useGlobeStore.setState({});

export const history = {
  undo: () => {
    windowOpen = false;
    useGlobeStore.temporal.getState().undo();
    saveNow();
  },
  redo: () => {
    windowOpen = false;
    useGlobeStore.temporal.getState().redo();
    saveNow();
  },
};

/**
 * Loads saved settings once on the client and starts history from that point.
 * Never blocks the tool: broken or unavailable storage falls back to defaults, and a slow one gives up after 2 s.
 */
export async function hydrateGlobeStore(): Promise<void> {
  try {
    await Promise.race([useGlobeStore.persist.rehydrate(), new Promise<void>(resolve => setTimeout(resolve, 2000))]);
  } catch (err) {
    console.warn('Saved globe settings could not be loaded, using defaults', err);
    useGlobeStore.setState({ settings: DEFAULT_SETTINGS, view: DEFAULT_VIEW });
  } finally {
    useGlobeStore.temporal.getState().clear();
  }
}

/** Saved values of the right type only: a stale or hand-edited entry cannot break the engine. */
function sanitize(saved: unknown): Partial<GlobeSettings> {
  if (!saved || typeof saved !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(saved)) {
    const def = (DEFAULT_SETTINGS as unknown as Record<string, unknown>)[k];
    if (def === undefined) continue;
    const nullable = k === 'preset' && v === null; // "no preset" is a valid saved value
    if (nullable || (Array.isArray(def) ? Array.isArray(v) : typeof v === typeof def)) out[k] = v;
  }
  // a preset that was renamed or removed: the saved look stays, it just no longer matches a preset
  if (typeof out.preset === 'string' && !PRESETS.some(p => p.id === out.preset)) out.preset = null;
  return out as Partial<GlobeSettings>;
}
