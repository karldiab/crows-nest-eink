import { DEFAULT_SETTINGS, effectiveMode, type ImageEntry } from './types';
import type { BlobRecord } from './db';
import { defaultCrop, snapCrop } from './editor/geometry';
import { nameFromFile } from './export/header';

export const WORKING_LONG_EDGE = 2000;
const THUMB_LONG_EDGE = 160;

export function decode(blob: Blob): Promise<ImageBitmap> {
  // 'from-image' applies EXIF orientation
  return createImageBitmap(blob, { imageOrientation: 'from-image' });
}

function canvas(w: number, h: number): OffscreenCanvas {
  return new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
}

/**
 * High-quality downscale: repeated halving with imageSmoothingQuality 'high' until
 * within 2x of the target, then a final step. Result is composited on white.
 */
export function downscaleHQ(src: ImageBitmap | OffscreenCanvas, tw: number, th: number): OffscreenCanvas {
  let cur: ImageBitmap | OffscreenCanvas = src;
  let cw = src.width;
  let ch = src.height;
  // first, composite onto white at native size only if we will not shrink (keeps alpha logic simple)
  while (cw / 2 >= tw && ch / 2 >= th) {
    const nw = Math.max(1, Math.round(cw / 2));
    const nh = Math.max(1, Math.round(ch / 2));
    const c = canvas(nw, nh);
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(cur, 0, 0, nw, nh);
    cur = c;
    cw = nw;
    ch = nh;
  }
  const out = canvas(tw, th);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, out.width, out.height);
  return out;
}

function fitLongEdge(w: number, h: number, edge: number): [number, number] {
  const s = Math.min(1, edge / Math.max(w, h));
  return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
}

/** Distinct colours (capped at 33) on a nearest-neighbour downsample, composited on white. */
export function countColours(bmp: ImageBitmap): number {
  const [w, h] = fitLongEdge(bmp.width, bmp.height, 128);
  const c = canvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(bmp, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const seen = new Set<number>();
  for (let i = 0; i < d.length; i += 4) {
    seen.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    if (seen.size >= 33) return 33;
  }
  return seen.size;
}

export interface Prepared {
  blobs: BlobRecord;
  width: number;
  height: number;
  colorCount: number;
}

/** Decode a source file and derive the working copy, thumbnail and colour count. */
export async function prepare(original: Blob): Promise<Prepared> {
  const bmp = await decode(original);
  try {
    const width = bmp.width;
    const height = bmp.height;
    let working: Blob | undefined;
    if (Math.max(width, height) > WORKING_LONG_EDGE) {
      const [ww, wh] = fitLongEdge(width, height, WORKING_LONG_EDGE);
      const c = downscaleHQ(bmp, ww, wh);
      working = await c.convertToBlob({ type: 'image/webp', quality: 0.95 });
      if (working.type !== 'image/webp') working = await c.convertToBlob({ type: 'image/jpeg', quality: 0.95 });
    }
    const [tw, th] = fitLongEdge(width, height, THUMB_LONG_EDGE);
    const thumb = await downscaleHQ(bmp, tw, th).convertToBlob({ type: 'image/jpeg', quality: 0.85 });
    const colorCount = countColours(bmp);
    return { blobs: { original, working, thumb }, width, height, colorCount };
  } finally {
    bmp.close();
  }
}

export function newId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function ingestFile(file: File): Promise<{ entry: ImageEntry; blobs: BlobRecord } | null> {
  try {
    const p = await prepare(file);
    let crop = defaultCrop(p.width, p.height);
    if (DEFAULT_SETTINGS.snapInteger && effectiveMode(DEFAULT_SETTINGS, p.colorCount) === 'pixel') crop = snapCrop(crop);
    const entry: ImageEntry = {
      id: newId(),
      name: nameFromFile(file.name),
      fileName: file.name,
      status: 'new',
      crop,
      settings: { ...DEFAULT_SETTINGS },
      width: p.width,
      height: p.height,
      colorCount: p.colorCount,
    };
    return { entry, blobs: p.blobs };
  } catch (e) {
    console.warn('Could not decode', file.name, e);
    return null;
  }
}

/** Collect files from a drop, descending into folders. */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== 'file') continue;
    const e = item.webkitGetAsEntry?.();
    if (e) entries.push(e);
    else {
      const f = item.getAsFile();
      if (f) loose.push(f);
    }
  }
  const out: File[] = [...loose];
  async function walk(e: FileSystemEntry): Promise<void> {
    if (e.isFile) {
      out.push(await new Promise<File>((res, rej) => (e as FileSystemFileEntry).file(res, rej)));
    } else if (e.isDirectory) {
      const reader = (e as FileSystemDirectoryEntry).createReader();
      const children: FileSystemEntry[] = [];
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        if (!batch.length) break;
        children.push(...batch);
      }
      children.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      for (const c of children) await walk(c);
    }
  }
  for (const e of entries) await walk(e);
  return out.filter(isLikelyImage);
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp|ico|svg|tiff?|jfif|heic|heif)$/i;
export function isLikelyImage(f: File): boolean {
  return f.type.startsWith('image/') || IMAGE_EXT.test(f.name);
}
