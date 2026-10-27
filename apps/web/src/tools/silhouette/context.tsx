'use client';

import type { SilhouetteRenderer } from '@tools/silhouette';
import { createContext, useContext } from 'react';

export interface ToastRequest {
  text: string;
  /** Adds an "Отменить" button that undoes the last step. */
  undo?: boolean;
}

export interface SilhouetteToolContext {
  /** One renderer for the page: preview, preset thumbnails and export share its worker and caches. */
  renderer: SilhouetteRenderer;
  notify: (toast: ToastRequest) => void;
}

const Ctx = createContext<SilhouetteToolContext | null>(null);
export const SilhouetteToolProvider = Ctx.Provider;

export function useSilhouetteTool(): SilhouetteToolContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSilhouetteTool must be used inside SilhouetteToolProvider');
  return v;
}
