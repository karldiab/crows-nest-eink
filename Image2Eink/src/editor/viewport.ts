import { ASPECT, OUT_W, effectiveMode, type Crop, type ImageEntry } from '../types';
import type { Store } from '../state';
import { displayToSource, moveCrop, snapCrop, sourceToDisplay, withWidth, zoomOf, type Vec } from './geometry';

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 32;

/** Screen <-> source mapping: screen point (sx, sy) shows source point (ax, ay). */
interface View {
  vs: number; // screen px per source px
  sx: number;
  sy: number;
  ax: number;
  ay: number;
}

type Gesture =
  | { kind: 'pan'; start: Crop; x: number; y: number; view: View }
  | { kind: 'resize'; start: Crop; view: View; fixed: Vec; sign: Vec };

export function isSnapping(e: ImageEntry): boolean {
  return e.settings.snapInteger && effectiveMode(e.settings, e.colorCount) === 'pixel';
}

export function clampZoom(c: Crop): Crop {
  const w = Math.min(OUT_W / MIN_ZOOM, Math.max(OUT_W / MAX_ZOOM, c.w));
  return w === c.w ? c : withWidth(c, w);
}

/**
 * Crop editor: the frame stays centred in the viewport and the image moves underneath.
 * Drag to pan, wheel/pinch to zoom about the cursor, drag a corner to resize the frame.
 */
export class Viewport {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private bitmap: ImageBitmap | null = null;
  private bitmapId: string | null = null;
  private gesture: Gesture | null = null;
  private wheelAccum = 0;
  private raf = 0;
  private cssW = 0;
  private cssH = 0;
  onZoomChange: () => void = () => {};

  constructor(
    private host: HTMLElement,
    private store: Store,
  ) {
    host.appendChild(this.canvas);
    new ResizeObserver(() => this.resize()).observe(host);
    this.canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.onMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.onUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.onUp(e));
    this.canvas.addEventListener('wheel', (e) => this.onWheel(e), { passive: false });
    this.resize();
  }

  private get entry() {
    return this.store.selected;
  }

  async setImage() {
    const e = this.entry;
    if (!e) {
      this.bitmap = null;
      this.bitmapId = null;
      this.draw();
      return;
    }
    if (this.bitmapId !== e.id || !this.bitmap || this.bitmap.width === 0) {
      const id = e.id;
      this.bitmapId = id;
      this.bitmap = null;
      this.draw();
      try {
        const b = await this.store.workingBitmap(id);
        if (this.bitmapId === id) this.bitmap = b;
      } catch (err) {
        console.error(err);
      }
    }
    this.draw();
  }

  private resize() {
    const r = this.host.getBoundingClientRect();
    this.cssW = r.width;
    this.cssH = r.height;
    const dpr = devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.drawNow();
  }

  /** Frame width on screen when the view is derived from the crop. */
  private frameScreenW() {
    return Math.max(40, Math.min(this.cssW * 0.82, this.cssH * 0.78 * ASPECT));
  }

  private view(c: Crop): View {
    if (this.gesture) return this.gesture.view;
    return { vs: this.frameScreenW() / c.w, sx: this.cssW / 2, sy: this.cssH / 2, ax: c.cx, ay: c.cy };
  }

  /** Screen position of a source point. */
  private toScreen(v: View, c: Crop, X: number, Y: number): Vec {
    const d = sourceToDisplay([X - v.ax, Y - v.ay], c);
    return [v.sx + d[0] * v.vs, v.sy + d[1] * v.vs];
  }

  /** Frame rectangle on screen: [x, y, w, h]. */
  private frameRect(c: Crop): [number, number, number, number] {
    const v = this.view(c);
    const [x, y] = this.toScreen(v, c, c.cx, c.cy);
    const w = c.w * v.vs;
    const h = c.h * v.vs;
    return [x - w / 2, y - h / 2, w, h];
  }

  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => {
      this.raf = 0;
      this.drawNow();
    });
  }

  private drawNow() {
    const ctx = this.ctx;
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = getComputedStyle(this.host).getPropertyValue('--viewport-bg') || '#1c1c1f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const e = this.entry;
    if (!e) return;
    const c = e.crop;
    const v = this.view(c);
    const [fx, fy, fw, fh] = this.frameRect(c);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // white inside the frame (outside-the-source areas render white)
    ctx.fillStyle = '#fff';
    ctx.fillRect(fx, fy, fw, fh);

    if (this.bitmap && this.bitmap.width > 0) {
      ctx.save();
      ctx.translate(v.sx, v.sy);
      ctx.scale(v.vs, v.vs);
      ctx.rotate((c.rot * Math.PI) / 2);
      if (c.flip) ctx.scale(-1, 1);
      ctx.translate(-v.ax, -v.ay);
      const screenPerWorkingPx = (v.vs * e.width) / this.bitmap.width;
      ctx.imageSmoothingEnabled = screenPerWorkingPx < 2;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.bitmap, 0, 0, e.width, e.height);
      ctx.restore();
    } else if (this.bitmapId) {
      ctx.fillStyle = '#888';
      ctx.font = '14px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('Loading…', this.cssW / 2, this.cssH / 2);
    }

    // dim outside the frame
    ctx.fillStyle = 'rgba(15,15,18,0.62)';
    ctx.beginPath();
    ctx.rect(0, 0, this.cssW, this.cssH);
    ctx.rect(fx, fy, fw, fh);
    ctx.fill('evenodd');

    // thirds
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 3; i++) {
      ctx.moveTo(fx + (fw * i) / 3, fy);
      ctx.lineTo(fx + (fw * i) / 3, fy + fh);
      ctx.moveTo(fx, fy + (fh * i) / 3);
      ctx.lineTo(fx + fw, fy + (fh * i) / 3);
    }
    ctx.stroke();

    // frame + handles
    ctx.strokeStyle = '#f5c542';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fx - 0.75, fy - 0.75, fw + 1.5, fh + 1.5);
    ctx.fillStyle = '#f5c542';
    const hs = 9;
    for (const [hx, hy] of [
      [fx, fy],
      [fx + fw, fy],
      [fx, fy + fh],
      [fx + fw, fy + fh],
    ])
      ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
  }

  // ---------- interaction ----------
  private local(ev: PointerEvent | WheelEvent): Vec {
    const r = this.canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  private hitCorner(p: Vec, c: Crop): { fixed: Vec; sign: Vec } | null {
    const [fx, fy, fw, fh] = this.frameRect(c);
    const corners: [Vec, Vec, Vec][] = [
      [[fx, fy], [fx + fw, fy + fh], [-1, -1]],
      [[fx + fw, fy], [fx, fy + fh], [1, -1]],
      [[fx, fy + fh], [fx + fw, fy], [-1, 1]],
      [[fx + fw, fy + fh], [fx, fy], [1, 1]],
    ];
    for (const [pt, fixed, sign] of corners) if (Math.hypot(p[0] - pt[0], p[1] - pt[1]) < 12) return { fixed, sign };
    return null;
  }

  private onDown(ev: PointerEvent) {
    const e = this.entry;
    if (!e || ev.button !== 0) return;
    const p = this.local(ev);
    const view = this.view(e.crop);
    this.store.checkpoint(e.id);
    const corner = this.hitCorner(p, e.crop);
    this.gesture = corner
      ? { kind: 'resize', start: e.crop, view, ...corner }
      : { kind: 'pan', start: e.crop, x: p[0], y: p[1], view };
    this.canvas.setPointerCapture(ev.pointerId);
    this.canvas.style.cursor = corner ? 'nwse-resize' : 'grabbing';
  }

  private onMove(ev: PointerEvent) {
    const e = this.entry;
    const p = this.local(ev);
    if (!this.gesture || !e) {
      if (e) this.canvas.style.cursor = this.hitCorner(p, e.crop) ? 'nwse-resize' : 'grab';
      return;
    }
    const g = this.gesture;
    let c: Crop;
    if (g.kind === 'pan') {
      c = moveCrop(g.start, [-(p[0] - g.x) / g.view.vs, -(p[1] - g.y) / g.view.vs]);
    } else {
      const dx = p[0] - g.fixed[0];
      const dy = p[1] - g.fixed[1];
      let w = Math.max(Math.abs(dx), Math.abs(dy) * ASPECT, 24);
      // keep the frame on screen side indicated by the grabbed corner
      if (Math.sign(dx) !== g.sign[0] && Math.sign(dy) !== g.sign[1]) w = 24;
      const h = w / ASPECT;
      const cxs = g.fixed[0] + (g.sign[0] * w) / 2;
      const cys = g.fixed[1] + (g.sign[1] * h) / 2;
      const d = displayToSource([(cxs - g.view.sx) / g.view.vs, (cys - g.view.sy) / g.view.vs], g.start);
      c = withWidth({ ...g.start, cx: g.view.ax + d[0], cy: g.view.ay + d[1] }, w / g.view.vs);
    }
    c = clampZoom(c);
    if (isSnapping(e)) c = snapCrop(c);
    // panning keeps the frame fixed in the middle: the view follows the crop centre
    if (g.kind === 'pan') g.view = { ...g.view, ax: c.cx, ay: c.cy };
    this.store.setCrop(e.id, c);
  }

  private onUp(ev: PointerEvent) {
    if (!this.gesture) return;
    this.gesture = null;
    try {
      this.canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
    this.canvas.style.cursor = 'grab';
    this.draw();
  }

  private onWheel(ev: WheelEvent) {
    ev.preventDefault();
    const e = this.entry;
    if (!e || this.gesture) return;
    this.store.checkpointThrottled(e.id, 'wheel', 700);
    const dy = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
    const p = this.local(ev);
    if (isSnapping(e)) {
      this.wheelAccum += dy;
      if (Math.abs(this.wheelAccum) < 60) return;
      const steps = Math.trunc(this.wheelAccum / 60);
      this.wheelAccum -= steps * 60;
      this.zoomBy(0, p, -steps);
    } else {
      const factor = Math.exp(-dy * (ev.ctrlKey ? 0.01 : 0.0015));
      this.zoomBy(factor, p);
    }
  }

  /**
   * Zoom about a screen point (default: frame centre). In integer-snap mode
   * `steps` changes the integer scale instead of using `factor`.
   */
  zoomBy(factor: number, at?: Vec, steps = 0) {
    const e = this.entry;
    if (!e) return;
    const c = e.crop;
    const v = this.view(c);
    let w2: number;
    if (isSnapping(e)) {
      const n = Math.max(1, Math.round(zoomOf(c)) + (steps || (factor > 1 ? 1 : -1)));
      w2 = OUT_W / Math.min(MAX_ZOOM, n);
    } else {
      w2 = Math.min(OUT_W / MIN_ZOOM, Math.max(OUT_W / MAX_ZOOM, c.w / factor));
    }
    const pt = at ?? [v.sx, v.sy];
    const p: Vec = [(pt[0] - v.sx) / v.vs, (pt[1] - v.sy) / v.vs];
    const k = 1 - w2 / c.w;
    let next = moveCrop(withWidth(c, w2), [p[0] * k, p[1] * k]);
    if (isSnapping(e)) next = snapCrop(next);
    this.store.setCrop(e.id, next);
    this.onZoomChange();
  }
}
