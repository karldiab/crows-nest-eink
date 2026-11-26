import { OUT_W, OUT_H, type Crop } from '../types';

export type Vec = [number, number];

const mod4 = (n: number) => ((n % 4) + 4) % 4;

/** Rotate a vector by n quarter turns clockwise (screen coords, y down). */
function rotCW([x, y]: Vec, n: number): Vec {
  switch (mod4(n)) {
    case 1:
      return [-y, x];
    case 2:
      return [-x, -y];
    case 3:
      return [y, -x];
    default:
      return [x, y];
  }
}

/** Display-space displacement -> source-space displacement. */
export function displayToSource(d: Vec, crop: Pick<Crop, 'rot' | 'flip'>): Vec {
  const [x, y] = rotCW(d, -crop.rot);
  return crop.flip ? [-x, y] : [x, y];
}

/** Source-space displacement -> display-space displacement. */
export function sourceToDisplay(s: Vec, crop: Pick<Crop, 'rot' | 'flip'>): Vec {
  const f: Vec = crop.flip ? [-s[0], s[1]] : s;
  return rotCW(f, crop.rot);
}

export function orientedSize(w: number, h: number, rot: number): Vec {
  return mod4(rot) % 2 ? [h, w] : [w, h];
}

export function withWidth(c: Crop, w: number): Crop {
  return { ...c, w, h: (w * OUT_H) / OUT_W };
}

/** Whole image fits inside the frame (white margins allowed). */
export function fitCrop(c: Crop, W: number, H: number): Crop {
  const [ow, oh] = orientedSize(W, H, c.rot);
  return withWidth({ ...c, cx: W / 2, cy: H / 2 }, Math.max(ow, (oh * OUT_W) / OUT_H));
}

/** Frame fully covered by the image (edges cropped). */
export function fillCrop(c: Crop, W: number, H: number): Crop {
  const [ow, oh] = orientedSize(W, H, c.rot);
  return withWidth({ ...c, cx: W / 2, cy: H / 2 }, Math.min(ow, (oh * OUT_W) / OUT_H));
}

export function centreCrop(c: Crop, W: number, H: number): Crop {
  return { ...c, cx: W / 2, cy: H / 2 };
}

export function defaultCrop(W: number, H: number): Crop {
  return fillCrop({ cx: 0, cy: 0, w: 1, h: 1, rot: 0, flip: false }, W, H);
}

/** Rotate the image under the frame by a quarter turn (+1 = clockwise). */
export function rotateCrop(c: Crop, dir: 1 | -1): Crop {
  return { ...c, rot: mod4(c.rot + dir) };
}

/** Mirror the displayed image horizontally around the frame centre. */
export function flipCrop(c: Crop): Crop {
  // F * R^n * F^f  ==  R^-n * F^(f+1)
  return { ...c, rot: mod4(-c.rot), flip: !c.flip };
}

/** Move the frame by a display-space delta measured in source pixels. */
export function moveCrop(c: Crop, d: Vec): Crop {
  const [sx, sy] = displayToSource(d, c);
  return { ...c, cx: c.cx + sx, cy: c.cy + sy };
}

/** Output pixels per source pixel. */
export function zoomOf(c: Crop): number {
  return OUT_W / c.w;
}

/**
 * Snap so every source pixel maps to an exact N x N block of output pixels
 * and the frame's top-left corner lies on a source pixel boundary.
 */
export function snapCrop(c: Crop): Crop {
  const n = Math.max(1, Math.round(OUT_W / c.w));
  const s = withWidth(c, OUT_W / n);
  const [tx, ty] = displayToSource([-s.w / 2, -s.h / 2], s);
  const cornerX = s.cx + tx;
  const cornerY = s.cy + ty;
  return { ...s, cx: s.cx + (Math.round(cornerX) - cornerX), cy: s.cy + (Math.round(cornerY) - cornerY) };
}

/** Axis-aligned bounding box of the frame in source coordinates. */
export function cropBounds(c: Crop): { x0: number; y0: number; x1: number; y1: number } {
  const corners: Vec[] = [
    [-c.w / 2, -c.h / 2],
    [c.w / 2, -c.h / 2],
    [-c.w / 2, c.h / 2],
    [c.w / 2, c.h / 2],
  ].map((d) => displayToSource(d as Vec, c));
  const xs = corners.map((p) => c.cx + p[0]);
  const ys = corners.map((p) => c.cy + p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}
