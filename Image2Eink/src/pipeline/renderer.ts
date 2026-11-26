import { OUT_W, OUT_H, effectiveMode, type DitherAlgo, type ImageEntry } from '../types';
import type { WorkerRequest, WorkerResponse } from './worker';
import { cropBounds } from '../editor/geometry';
import type { Store } from '../state';

export interface RenderResult {
  grey: Uint8ClampedArray;
  bits: Uint8Array;
}

interface Region {
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Main-thread facade over the processing worker. */
export class Renderer {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private nextId = 1;
  private pending = new Map<number, { res: (r: RenderResult[]) => void; rej: (e: Error) => void }>();
  private loaded = new Map<string, Promise<void>>();
  private regions = new Map<string, Region>();
  private regionSeq = 0;

  constructor(private store: Store) {
    this.worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      const p = this.pending.get(m.reqId);
      if (!p) return;
      this.pending.delete(m.reqId);
      if (m.type === 'result') p.res(m.results);
      else p.rej(new Error(m.message));
    };
  }

  private post(msg: WorkerRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  private loadSource(key: string, make: () => Promise<ImageBitmap>, f: number, ox: number, oy: number) {
    let p = this.loaded.get(key);
    if (!p) {
      p = make().then((bmp) => {
        this.post({ type: 'source', key, bitmap: bmp, f, ox, oy }, [bmp]);
      });
      p.catch(() => this.loaded.delete(key));
      this.loaded.set(key, p);
    }
    return p;
  }

  /** Pick the source for this crop: the working copy, or a full-res region when zoomed in. */
  private async source(e: ImageEntry): Promise<string> {
    const working = await this.store.workingBitmap(e.id);
    const ws = working.width / e.width;
    const s = (e.crop.w * ws) / OUT_W; // working px per output px
    if (s >= 1 || ws >= 0.999) {
      return this.sourceWorking(e.id, working, ws);
    }
    // zoomed in past the working copy's resolution: crop from the full-res source
    const b = cropBounds(e.crop);
    const r = this.regions.get(e.id);
    const inside = (rg: Region) =>
      Math.max(0, b.x0) >= rg.x0 && Math.max(0, b.y0) >= rg.y0 && Math.min(e.width, b.x1) <= rg.x1 && Math.min(e.height, b.y1) <= rg.y1;
    if (r && inside(r) && this.loaded.has(r.key)) return r.key;
    const pad = Math.max(b.x1 - b.x0, b.y1 - b.y0) * 0.75 + 4;
    const x0 = Math.max(0, Math.floor(b.x0 - pad));
    const y0 = Math.max(0, Math.floor(b.y0 - pad));
    const x1 = Math.min(e.width, Math.ceil(b.x1 + pad));
    const y1 = Math.min(e.height, Math.ceil(b.y1 + pad));
    if (x1 <= x0 || y1 <= y0) return this.sourceWorking(e.id, working, ws);
    if (r) {
      this.post({ type: 'drop', key: r.key });
      this.loaded.delete(r.key);
    }
    const key = `${e.id}#r${++this.regionSeq}`;
    const region: Region = { key, x0, y0, x1, y1 };
    this.regions.set(e.id, region);
    const full = await this.store.fullBitmap(e.id);
    await this.loadSource(key, () => createImageBitmap(full, x0, y0, x1 - x0, y1 - y0), 1, x0, y0);
    return key;
  }

  private async sourceWorking(id: string, working: ImageBitmap, ws: number) {
    // send a clone: the worker takes ownership of what we transfer
    await this.loadSource(id, () => createImageBitmap(working), ws, 0, 0);
    return id;
  }

  async render(e: ImageEntry, algos?: DitherAlgo[]): Promise<RenderResult[]> {
    const snapshot = JSON.parse(JSON.stringify(e)) as ImageEntry;
    for (let attempt = 0; attempt < 2; attempt++) {
      const key = await this.source(snapshot);
      const reqId = this.nextId++;
      try {
        return await new Promise<RenderResult[]>((res, rej) => {
          this.pending.set(reqId, { res, rej });
          this.post({
            type: 'render',
            reqId,
            key,
            crop: snapshot.crop,
            settings: snapshot.settings,
            mode: effectiveMode(snapshot.settings, snapshot.colorCount),
            algos,
            outW: OUT_W,
            outH: OUT_H,
          });
        });
      } catch (err) {
        // the worker may have evicted the source; reload once
        this.loaded.delete(key);
        if (attempt === 1) throw err;
      }
    }
    throw new Error('unreachable');
  }

  async renderOne(e: ImageEntry): Promise<RenderResult> {
    return (await this.render(e))[0];
  }
}

/** Runs at most one render at a time and always finishes with the latest state. */
export class LiveRender {
  private busy = false;
  private dirty = false;
  constructor(
    private run: () => Promise<void>,
  ) {}
  request() {
    if (this.busy) {
      this.dirty = true;
      return;
    }
    this.busy = true;
    this.run()
      .catch((e) => console.error(e))
      .finally(() => {
        this.busy = false;
        if (this.dirty) {
          this.dirty = false;
          this.request();
        }
      });
  }
}
