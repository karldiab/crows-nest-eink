import type { Crop, ImageEntry, PanelConfig, ProjectJSON, Settings, Status } from './types';
import { DEFAULT_PANEL, LEGACY_PANEL, OUT_H, OUT_W, setPanelSize, validPanel } from './types';
import * as db from './db';
import { decode } from './import';

export type ChangeKind = 'list' | 'selection' | 'image' | 'panel';
type Snap = { crop: Crop; settings: Settings };

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const same = (a: Snap, b: Snap) => JSON.stringify(a) === JSON.stringify(b);

/** Project model, per-image undo/redo, bitmap caches and IndexedDB auto-save. */
export class Store {
  images: ImageEntry[] = [];
  selectedId: string | null = null;
  /** output panel size, shared by every image (one header = one size) */
  panel: PanelConfig = { ...DEFAULT_PANEL };
  private listeners = new Set<(k: ChangeKind) => void>();
  private history = new Map<string, { undo: Snap[]; redo: Snap[] }>();
  private lastCheckpoint = { key: '', time: 0 };
  private thumbUrls = new Map<string, string>();
  private working = new Map<string, Promise<ImageBitmap>>();
  private full: { id: string; p: Promise<ImageBitmap> } | null = null;
  private saveTimer = 0;
  saving = false;

  on(fn: (k: ChangeKind) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(k: ChangeKind) {
    for (const l of this.listeners) l(k);
    if (k !== 'selection') this.scheduleSave();
  }

  get selected(): ImageEntry | undefined {
    return this.images.find((i) => i.id === this.selectedId);
  }

  get(id: string) {
    return this.images.find((i) => i.id === id);
  }

  included() {
    return this.images.filter((i) => i.status !== 'excluded');
  }

  // ---------- persistence ----------
  async load(): Promise<void> {
    const p = await db.loadProject();
    if (p?.version === 1) {
      this.images = p.images;
      this.selectedId = this.images[0]?.id ?? null;
      this.applyPanel(validPanel(p.panel) ? p.panel : this.images.length ? LEGACY_PANEL : DEFAULT_PANEL);
    } else {
      this.applyPanel(DEFAULT_PANEL);
    }
    this.emit('panel');
    this.emit('list');
    this.emit('selection');
  }

  toJSON(): ProjectJSON {
    return { version: 1, panel: { ...this.panel }, images: clone(this.images) };
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.saveNow(), 400);
  }

  async saveNow() {
    clearTimeout(this.saveTimer);
    this.saving = true;
    try {
      await db.saveProject(this.toJSON());
    } finally {
      this.saving = false;
    }
  }

  // ---------- output panel ----------
  private applyPanel(cfg: PanelConfig) {
    this.panel = { ...cfg };
    setPanelSize(cfg.w, cfg.h);
  }

  /**
   * Change the output size. Crops keep their centre and width; the height
   * follows the new aspect ratio. Undo history is dropped because old
   * snapshots have the old aspect.
   */
  setPanel(cfg: PanelConfig) {
    if (!validPanel(cfg)) return;
    const sizeChanged = cfg.w !== OUT_W || cfg.h !== OUT_H;
    this.applyPanel(cfg);
    if (sizeChanged) {
      for (const e of this.images) e.crop = { ...e.crop, h: (e.crop.w * OUT_H) / OUT_W };
      this.history.clear();
    }
    this.emit('panel');
    this.emit('list');
    this.emit('image');
  }

  // ---------- list operations ----------
  async add(items: { entry: ImageEntry; blobs: db.BlobRecord }[]) {
    for (const { entry, blobs } of items) await db.putBlobs(entry.id, blobs);
    this.images.push(...items.map((i) => i.entry));
    if (!this.selectedId && this.images.length) this.selectedId = this.images[0].id;
    this.emit('list');
    this.emit('selection');
  }

  async remove(id: string) {
    const idx = this.images.findIndex((i) => i.id === id);
    if (idx < 0) return;
    this.images.splice(idx, 1);
    this.dropCaches(id);
    this.history.delete(id);
    await db.deleteBlobs(id);
    if (this.selectedId === id) {
      this.selectedId = this.images[Math.min(idx, this.images.length - 1)]?.id ?? null;
      this.emit('selection');
    }
    this.emit('list');
  }

  async clear() {
    for (const i of this.images) this.dropCaches(i.id);
    this.images = [];
    this.selectedId = null;
    this.history.clear();
    await db.clearBlobs();
    await this.saveNow();
    this.emit('list');
    this.emit('selection');
  }

  move(id: string, toIndex: number) {
    const from = this.images.findIndex((i) => i.id === id);
    if (from < 0) return;
    const [it] = this.images.splice(from, 1);
    this.images.splice(Math.max(0, Math.min(toIndex, this.images.length)), 0, it);
    this.emit('list');
  }

  select(id: string | null) {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.emit('selection');
  }

  step(delta: number) {
    if (!this.images.length) return;
    const idx = this.images.findIndex((i) => i.id === this.selectedId);
    const next = Math.max(0, Math.min(this.images.length - 1, idx + delta));
    this.select(this.images[next].id);
  }

  rename(id: string, name: string) {
    const e = this.get(id);
    if (!e || e.name === name) return;
    e.name = name;
    this.emit('list');
  }

  setStatus(id: string, status: Status) {
    const e = this.get(id);
    if (!e) return;
    e.status = status;
    this.emit('list');
  }

  toggleStatus(id: string, s: 'done' | 'excluded') {
    const e = this.get(id);
    if (!e) return;
    this.setStatus(id, e.status === s ? 'edited' : s);
  }

  // ---------- edits + undo ----------
  private hist(id: string) {
    let h = this.history.get(id);
    if (!h) this.history.set(id, (h = { undo: [], redo: [] }));
    return h;
  }

  private snap(e: ImageEntry): Snap {
    return clone({ crop: e.crop, settings: e.settings });
  }

  /** Record the current state as an undo point (call before a change). */
  checkpoint(id: string) {
    const e = this.get(id);
    if (!e) return;
    const h = this.hist(id);
    const s = this.snap(e);
    const top = h.undo[h.undo.length - 1];
    if (!top || !same(top, s)) h.undo.push(s);
    if (h.undo.length > 200) h.undo.shift();
    h.redo = [];
    this.lastCheckpoint = { key: '', time: 0 };
  }

  /** Checkpoint at most once per continuous gesture identified by `key`. */
  checkpointThrottled(id: string, key: string, ms = 800) {
    const now = performance.now();
    const k = id + ':' + key;
    if (this.lastCheckpoint.key !== k || now - this.lastCheckpoint.time > ms) this.checkpoint(id);
    this.lastCheckpoint = { key: k, time: now };
  }

  private touched(e: ImageEntry) {
    if (e.status === 'new') {
      e.status = 'edited';
      this.emit('list');
    }
    this.emit('image');
  }

  setCrop(id: string, crop: Crop) {
    const e = this.get(id);
    if (!e) return;
    e.crop = crop;
    this.touched(e);
  }

  setSettings(id: string, patch: Partial<Settings>) {
    const e = this.get(id);
    if (!e) return;
    e.settings = { ...e.settings, ...patch };
    this.touched(e);
  }

  copySettingsToAll(id: string) {
    const src = this.get(id);
    if (!src) return;
    for (const e of this.images) {
      if (e.id === id) continue;
      this.checkpoint(e.id);
      e.settings = clone(src.settings);
    }
    this.emit('list');
    this.emit('image');
  }

  undo(id: string) {
    const e = this.get(id);
    if (!e) return;
    const h = this.hist(id);
    const cur = this.snap(e);
    let s: Snap | undefined;
    while ((s = h.undo.pop()) && same(s, cur));
    if (!s) return;
    h.redo.push(cur);
    e.crop = s.crop;
    e.settings = s.settings;
    this.emit('image');
  }

  redo(id: string) {
    const e = this.get(id);
    if (!e) return;
    const h = this.hist(id);
    const s = h.redo.pop();
    if (!s) return;
    h.undo.push(this.snap(e));
    e.crop = s.crop;
    e.settings = s.settings;
    this.emit('image');
  }

  // ---------- caches ----------
  async thumbUrl(id: string): Promise<string | undefined> {
    const cached = this.thumbUrls.get(id);
    if (cached) return cached;
    const rec = await db.getBlobs(id);
    if (!rec) return undefined;
    const url = URL.createObjectURL(rec.thumb);
    this.thumbUrls.set(id, url);
    return url;
  }

  /** Downscaled working copy (long edge <= 2000), LRU-cached. */
  workingBitmap(id: string): Promise<ImageBitmap> {
    let p = this.working.get(id);
    if (p) {
      this.working.delete(id);
      this.working.set(id, p); // refresh LRU position
      return p;
    }
    p = db.getBlobs(id).then((rec) => {
      if (!rec) throw new Error('image data missing');
      return decode(rec.working ?? rec.original);
    });
    p.catch(() => this.working.delete(id));
    this.working.set(id, p);
    while (this.working.size > 6) {
      const [k, old] = this.working.entries().next().value!;
      this.working.delete(k);
      old.then((b) => b.close()).catch(() => {});
    }
    return p;
  }

  /** Full-resolution source; only one is kept in memory at a time. */
  fullBitmap(id: string): Promise<ImageBitmap> {
    if (this.full?.id === id) return this.full.p;
    this.full?.p.then((b) => b.close()).catch(() => {});
    const p = db.getBlobs(id).then((rec) => {
      if (!rec) throw new Error('image data missing');
      return decode(rec.original);
    });
    this.full = { id, p };
    return p;
  }

  private dropCaches(id: string) {
    const u = this.thumbUrls.get(id);
    if (u) URL.revokeObjectURL(u);
    this.thumbUrls.delete(id);
    this.working.get(id)?.then((b) => b.close()).catch(() => {});
    this.working.delete(id);
    if (this.full?.id === id) {
      this.full.p.then((b) => b.close()).catch(() => {});
      this.full = null;
    }
  }
}

export const store = new Store();
