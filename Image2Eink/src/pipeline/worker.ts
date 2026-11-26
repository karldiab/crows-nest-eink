/// <reference lib="webworker" />
import { lumaPlane, buildPyramid, type Pyramid } from './resample';
import { processImage } from './process';
import { setPanelSize, type Crop, type Settings, type EffectiveMode, type DitherAlgo } from '../types';

export type WorkerRequest =
  | {
      type: 'source';
      key: string;
      bitmap: ImageBitmap;
      /** imagePx = (X - ox) * f in full-res source coordinates */
      f: number;
      ox: number;
      oy: number;
    }
  | { type: 'drop'; key: string }
  | {
      type: 'render';
      reqId: number;
      key: string;
      crop: Crop;
      settings: Settings;
      mode: EffectiveMode;
      algos?: DitherAlgo[];
      /** output panel size (the worker has its own copy of the module state) */
      outW: number;
      outH: number;
    };

export type WorkerResponse =
  | { type: 'result'; reqId: number; results: { grey: Uint8ClampedArray; bits: Uint8Array }[] }
  | { type: 'error'; reqId: number; message: string };

interface SourceEntry {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  f: number;
  ox: number;
  oy: number;
  pyr: { srgb?: Pyramid; linear?: Pyramid };
  used: number;
}

const sources = new Map<string, SourceEntry>();
const MAX_SOURCES = 4;
let tick = 0;

function evict() {
  while (sources.size > MAX_SOURCES) {
    let oldest: string | null = null;
    let min = Infinity;
    for (const [k, v] of sources)
      if (v.used < min) {
        min = v.used;
        oldest = k;
      }
    if (oldest) sources.delete(oldest);
  }
}

function pyramidFor(e: SourceEntry, linear: boolean): Pyramid {
  const slot = linear ? 'linear' : 'srgb';
  if (!e.pyr[slot]) e.pyr[slot] = buildPyramid(lumaPlane(e.rgba, e.width, e.height, linear), e.f, e.ox, e.oy);
  return e.pyr[slot]!;
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'source') {
    const { bitmap } = msg;
    const c = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff'; // composite transparency onto white
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const rgba = ctx.getImageData(0, 0, c.width, c.height).data;
    sources.set(msg.key, {
      rgba,
      width: c.width,
      height: c.height,
      f: msg.f,
      ox: msg.ox,
      oy: msg.oy,
      pyr: {},
      used: ++tick,
    });
    evict();
    return;
  }
  if (msg.type === 'drop') {
    sources.delete(msg.key);
    return;
  }
  if (msg.type === 'render') {
    const e = sources.get(msg.key);
    if (!e) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: 'error',
        reqId: msg.reqId,
        message: 'source not loaded',
      } satisfies WorkerResponse);
      return;
    }
    e.used = ++tick;
    setPanelSize(msg.outW, msg.outH);
    try {
      const pyr = pyramidFor(e, msg.settings.linearLight && msg.mode !== 'pixel');
      const algos = msg.algos ?? [undefined];
      const results = algos.map((a) => processImage(pyr, msg.crop, msg.settings, msg.mode, a));
      const transfer = results.flatMap((r) => [r.grey.buffer, r.bits.buffer]);
      (self as DedicatedWorkerGlobalScope).postMessage(
        { type: 'result', reqId: msg.reqId, results } satisfies WorkerResponse,
        transfer,
      );
    } catch (err) {
      (self as DedicatedWorkerGlobalScope).postMessage({
        type: 'error',
        reqId: msg.reqId,
        message: String(err),
      } satisfies WorkerResponse);
    }
  }
};
