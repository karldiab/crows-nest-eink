import type { ProjectJSON } from './types';

export interface BlobRecord {
  /** original file as imported */
  original: Blob;
  /** downscaled working copy (long edge ~2000), absent when original is small enough */
  working?: Blob;
  /** small thumbnail */
  thumb: Blob;
}

const DB_NAME = 'egg-studio';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export function openDB(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        for (const s of ['project', 'blobs', 'kv']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbPromise;
}

/** For tests: drop the cached connection so the next call reopens (simulates reload). */
export function closeDB(): void {
  dbPromise?.then((d) => d.close());
  dbPromise = null;
}

async function store(name: string, mode: IDBTransactionMode) {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function saveProject(p: ProjectJSON): Promise<void> {
  await req((await store('project', 'readwrite')).put(p, 'current'));
}

export async function loadProject(): Promise<ProjectJSON | undefined> {
  return req((await store('project', 'readonly')).get('current'));
}

export async function putBlobs(id: string, rec: BlobRecord): Promise<void> {
  await req((await store('blobs', 'readwrite')).put(rec, id));
}

export async function getBlobs(id: string): Promise<BlobRecord | undefined> {
  return req((await store('blobs', 'readonly')).get(id));
}

export async function deleteBlobs(id: string): Promise<void> {
  await req((await store('blobs', 'readwrite')).delete(id));
}

export async function clearBlobs(): Promise<void> {
  await req((await store('blobs', 'readwrite')).clear());
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await req((await store('kv', 'readwrite')).put(value, key));
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return req((await store('kv', 'readonly')).get(key));
}
