import * as db from '../db';
import { download } from './zip';

// Minimal typings for the File System Access API (Chromium only).
interface FSDirHandle {
  name: string;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{
    createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }>;
  }>;
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (o?: { id?: string; mode?: 'readwrite'; startIn?: unknown }) => Promise<FSDirHandle>;
  }
}

export const HEADER_NAME = 'easter_eggs.h';
const HANDLE_KEY = 'exportDir';

export const fsAccessSupported = () => typeof window.showDirectoryPicker === 'function';

export async function rememberedFolder(): Promise<FSDirHandle | undefined> {
  try {
    return await db.kvGet<FSDirHandle>(HANDLE_KEY);
  } catch {
    return undefined;
  }
}

export async function pickFolder(): Promise<FSDirHandle | undefined> {
  if (!window.showDirectoryPicker) return undefined;
  const prev = await rememberedFolder();
  const h = await window.showDirectoryPicker({ id: 'egg-export', mode: 'readwrite', startIn: prev });
  await db.kvSet(HANDLE_KEY, h);
  return h;
}

async function ensurePermission(h: FSDirHandle): Promise<boolean> {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  return (await h.requestPermission?.({ mode: 'readwrite' })) === 'granted';
}

/** Write to the remembered folder (asking for one if needed); returns the folder name. */
export async function writeToFolder(text: string, forcePick = false): Promise<string> {
  let h = forcePick ? undefined : await rememberedFolder();
  if (h && !(await ensurePermission(h))) h = undefined;
  if (!h) h = await pickFolder();
  if (!h) throw new Error('No folder selected.');
  const fh = await h.getFileHandle(HEADER_NAME, { create: true });
  const w = await fh.createWritable();
  await w.write(new Blob([text], { type: 'text/plain' }));
  await w.close();
  return h.name;
}

export function downloadHeader(text: string) {
  download(new Blob([text], { type: 'text/plain' }), HEADER_NAME);
}
