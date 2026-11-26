import { zipSync, unzipSync, strToU8, strFromU8, type Zippable } from 'fflate';
import { OUT_W, OUT_H, LEGACY_PANEL, validPanel, type ImageEntry, type PanelConfig, type ProjectJSON } from '../types';
import * as db from '../db';
import { makeIdentifiers } from './header';
import { prepare } from '../import';

export function download(data: Blob, fileName: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function bitsToPng(bits: Uint8Array, scale: number): Promise<Uint8Array> {
  const c = new OffscreenCanvas(OUT_W * scale, OUT_H * scale);
  const ctx = c.getContext('2d')!;
  const small = new OffscreenCanvas(OUT_W, OUT_H);
  const sctx = small.getContext('2d')!;
  const img = sctx.createImageData(OUT_W, OUT_H);
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i] ? 0 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, c.width, c.height);
  return new Uint8Array(await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer());
}

/** ZIP of 1x and 3x PNG previews, named by identifier. */
export async function previewsZip(items: { name: string; bits: Uint8Array }[]): Promise<Blob> {
  const ids = makeIdentifiers(items.map((i) => i.name));
  const files: Zippable = {};
  for (let i = 0; i < items.length; i++) {
    const base = `${String(i + 1).padStart(2, '0')}_${ids[i].replace(/^egg_/, '')}`;
    files[`1x/${base}.png`] = [await bitsToPng(items[i].bits, 1), { level: 0 }];
    files[`3x/${base}.png`] = [await bitsToPng(items[i].bits, 3), { level: 0 }];
  }
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

const safePath = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_') || 'image';

/** .eggproj = ZIP with project.json and the original image files. */
export async function saveEggproj(project: ProjectJSON): Promise<Blob> {
  const files: Zippable = { 'project.json': strToU8(JSON.stringify(project, null, 2)) };
  for (const e of project.images) {
    const rec = await db.getBlobs(e.id);
    if (!rec) continue;
    files[`images/${e.id}/${safePath(e.fileName)}`] = [new Uint8Array(await rec.original.arrayBuffer()), { level: 0 }];
  }
  return new Blob([zipSync(files)], { type: 'application/zip' });
}

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  jfif: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

export async function openEggproj(
  file: Blob,
): Promise<{ entries: ImageEntry[]; blobs: Map<string, db.BlobRecord>; missing: string[]; panel: PanelConfig }> {
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()));
  if (!files['project.json']) throw new Error('Not an Egg Studio project (project.json missing).');
  const project = JSON.parse(strFromU8(files['project.json'])) as ProjectJSON;
  if (project.version !== 1) throw new Error(`Unsupported project version ${project.version}.`);
  const blobs = new Map<string, db.BlobRecord>();
  const entries: ImageEntry[] = [];
  const missing: string[] = [];
  for (const e of project.images) {
    const path = Object.keys(files).find((p) => p.startsWith(`images/${e.id}/`));
    if (!path) {
      missing.push(e.name);
      continue;
    }
    const ext = path.split('.').pop()?.toLowerCase() ?? '';
    const original = new Blob([files[path]], { type: MIME[ext] ?? '' });
    const p = await prepare(original);
    blobs.set(e.id, p.blobs);
    entries.push(e);
  }
  const panel = validPanel(project.panel) ? project.panel : LEGACY_PANEL;
  return { entries, blobs, missing, panel };
}
