// Loading a picture: PNG, JPG, WebP or SVG, from a file, the clipboard or SVG text. Browser only.

import type { SourceInfo } from './render';

/** Longest side of the working copy. Above the shape's size in a 3× export (≈3100 px), so edges stay crisp there. */
export const SOURCE_MAX = 4096;

export interface SilhouetteSource extends SourceInfo {
  /** The picture, trimmed to its visible part when it has transparency. */
  image: HTMLCanvasElement;
  width: number;
  height: number;
  name: string;
}

export type SourceErrorKind = 'not-image' | 'unreadable';

export class SourceError extends Error {
  constructor(readonly kind: SourceErrorKind) {
    super(kind);
  }
}

const isSvg = (file: Blob & { name?: string }) => file.type === 'image/svg+xml' || /\.svg$/i.test(file.name ?? '');

export async function sourceFromFile(
  file: Blob & { name?: string },
  name = file.name ?? 'Картинка',
): Promise<SilhouetteSource> {
  if (isSvg(file)) return sourceFromSvg(await file.text(), name);
  if (!file.type.startsWith('image/')) throw new SourceError('not-image');
  const url = URL.createObjectURL(file);
  try {
    return fromImage(await loadImage(url), name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** SVG is drawn at the working size, so a vector stays sharp at any export size. */
export async function sourceFromSvg(text: string, name: string): Promise<SilhouetteSource> {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (!svg || svg.nodeName.toLowerCase() !== 'svg') throw new SourceError('unreadable');
  const w = parseFloat(svg.getAttribute('width') ?? '');
  const h = parseFloat(svg.getAttribute('height') ?? '');
  const vb = (svg.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const hasViewBox = vb.length === 4 && vb[2]! > 0 && vb[3]! > 0;
  if (!hasViewBox && w > 0 && h > 0) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  const ratio = hasViewBox ? vb[2]! / vb[3]! : w > 0 && h > 0 ? w / h : 1;
  svg.setAttribute('width', String(ratio >= 1 ? SOURCE_MAX : Math.round(SOURCE_MAX * ratio)));
  svg.setAttribute('height', String(ratio >= 1 ? Math.round(SOURCE_MAX / ratio) : SOURCE_MAX));
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  return fromImage(await loadImage(url), name);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new SourceError('unreadable'));
    img.src = url;
  });
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function fromImage(img: HTMLImageElement, name: string): SilhouetteSource {
  let w = img.naturalWidth || img.width;
  let h = img.naturalHeight || img.height;
  if (!w || !h) throw new SourceError('unreadable');
  const k = Math.min(1, SOURCE_MAX / Math.max(w, h));
  w = Math.max(1, Math.round(w * k));
  h = Math.max(1, Math.round(h * k));
  const c = canvas(w, h);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;

  let transparent = 0;
  let minX = w,
    minY = h,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = d[(y * w + x) * 4 + 3]!;
      if (a < 250) transparent++;
      if (a > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  const hasAlpha = transparent > w * h * 0.005;

  // the average brightness along the border tells whether the object sits on a light or a dark background
  let sum = 0,
    count = 0;
  const lumAt = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    sum += (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
    count++;
  };
  for (let x = 0; x < w; x += 4) {
    lumAt(x, 0);
    lumAt(x, h - 1);
  }
  for (let y = 0; y < h; y += 4) {
    lumAt(0, y);
    lumAt(w - 1, y);
  }

  let image = c;
  if (hasAlpha && maxX >= minX) {
    image = canvas(maxX - minX + 1, maxY - minY + 1);
    image.getContext('2d')!.drawImage(c, minX, minY, image.width, image.height, 0, 0, image.width, image.height);
  }
  return {
    image,
    width: image.width,
    height: image.height,
    hasAlpha,
    borderDark: count ? sum / count < 0.45 : false,
    name,
  };
}

/** The picture centred in a frame of W × H with `padding` % of the short side around it, as RGBA. */
export function drawInFrame(src: SilhouetteSource, W: number, H: number, padding: number): Uint8ClampedArray {
  const c = canvas(W, H);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  const pad = (padding / 100) * Math.min(W, H);
  const k = Math.min((W - 2 * pad) / src.width, (H - 2 * pad) / src.height);
  const dw = src.width * k;
  const dh = src.height * k;
  g.drawImage(src.image, (W - dw) / 2, (H - dh) / 2, dw, dh);
  return g.getImageData(0, 0, W, H).data;
}
