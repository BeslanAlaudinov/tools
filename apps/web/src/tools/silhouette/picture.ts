'use client';

// The current picture: loaded once, kept out of undo history, and saved in the browser (IndexedDB) so it is still
// there after a reload. Only the original file is stored; it is decoded again on load.

import { SourceError, sourceFromFile, sourceFromSvg, type SilhouetteSource } from '@tools/silhouette';
import { create } from 'zustand';

interface PictureState {
  source: SilhouetteSource | null;
  /** Grows with every new picture, so views can tell a new picture from a re-render. */
  version: number;
  loading: boolean;
}

export const usePicture = create<PictureState>(() => ({ source: null, version: 0, loading: false }));

const DB = 'tools.silhouette';
const STORE = 'picture';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function save(blob: Blob, name: string) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ blob, name }, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* storage unavailable or full: the picture works for this visit only */
  }
}

async function readSaved(): Promise<{ blob: Blob; name: string } | null> {
  try {
    const db = await openDb();
    const value = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const v = value as { blob?: unknown; name?: unknown } | undefined;
    return v && v.blob instanceof Blob && typeof v.name === 'string' ? { blob: v.blob, name: v.name } : null;
  } catch {
    return null;
  }
}

export async function forgetPicture() {
  usePicture.setState(s => ({ source: null, version: s.version + 1 }));
  try {
    const db = await openDb();
    db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY);
    db.close();
  } catch {
    /* nothing saved */
  }
}

function show(source: SilhouetteSource) {
  usePicture.setState(s => ({ source, version: s.version + 1, loading: false }));
}

export type LoadResult = { ok: true } | { ok: false; message: string };

const messageFor = (err: unknown) =>
  err instanceof SourceError && err.kind === 'not-image'
    ? 'Это не картинка. Подойдут PNG, SVG, JPG или WebP'
    : 'Не получилось открыть файл. Проверьте, что это целый PNG или SVG';

/** A file from the picker, a drop or the clipboard. */
export async function loadPictureFile(file: File): Promise<LoadResult> {
  usePicture.setState({ loading: true });
  try {
    const source = await sourceFromFile(file, file.name || 'Картинка');
    show(source);
    void save(file, source.name);
    return { ok: true };
  } catch (err) {
    usePicture.setState({ loading: false });
    return { ok: false, message: messageFor(err) };
  }
}

/** SVG markup pasted as text. */
export async function loadPictureSvg(text: string): Promise<LoadResult> {
  usePicture.setState({ loading: true });
  try {
    const source = await sourceFromSvg(text, 'SVG из буфера');
    show(source);
    void save(new Blob([text], { type: 'image/svg+xml' }), source.name);
    return { ok: true };
  } catch (err) {
    usePicture.setState({ loading: false });
    return { ok: false, message: messageFor(err) };
  }
}

/** Brings back the picture from the last visit, if there is one. */
export async function restorePicture(): Promise<void> {
  const saved = await readSaved();
  if (!saved) return;
  try {
    show(await sourceFromFile(saved.blob, saved.name));
  } catch {
    void forgetPicture();
  }
}
