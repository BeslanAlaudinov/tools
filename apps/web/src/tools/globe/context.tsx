'use client';

import type { GlobeEngine } from '@tools/globe';
import { createContext, useContext, type RefObject } from 'react';

export interface ToastRequest {
  text: string;
  /** Adds an "Отменить" button that undoes the last step. */
  undo?: boolean;
}

export interface GlobeToolContext {
  engine: RefObject<GlobeEngine | null>;
  notify: (toast: ToastRequest) => void;
}

const Ctx = createContext<GlobeToolContext | null>(null);
export const GlobeToolProvider = Ctx.Provider;

export function useGlobeTool(): GlobeToolContext {
  const v = useContext(Ctx);
  if (!v) throw new Error('useGlobeTool must be used inside GlobeToolProvider');
  return v;
}

export const formatLatLon = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'с. ш.' : 'ю. ш.'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'в. д.' : 'з. д.'}`;
