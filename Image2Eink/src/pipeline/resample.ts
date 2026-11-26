import { OUT_W, OUT_H, type Crop } from '../types';
import { displayToSource } from '../editor/geometry';
import { SRGB_TO_LINEAR, linearToSrgb } from './adjust';

/** A single-channel float plane (0..255). */
export interface Plane {
  data: Float32Array;
  width: number;
  height: number;
}

/**
 * Greyscale source pyramid. Level 0 maps to full-resolution source coordinates by
 * imagePx = (X - ox) * f. Each next level is a 2x2 box average of the previous one.
 */
export interface Pyramid {
  levels: Plane[];
  f: number;
  ox: number;
  oy: number;
}

/**
 * Luma plane from RGBA (composited on white). Luma is a linear combination, so
 * computing it before resampling gives the same result as after (spec order).
 * In linear mode the plane holds linear-light luminance scaled to 0..255.
 */
export function lumaPlane(rgba: Uint8ClampedArray, width: number, height: number, linear: boolean): Plane {
  const n = width * height;
  const data = new Float32Array(n);
  if (linear) {
    const L = SRGB_TO_LINEAR;
    for (let i = 0, j = 0; i < n; i++, j += 4)
      data[i] = 255 * (0.2126 * L[rgba[j]] + 0.7152 * L[rgba[j + 1]] + 0.0722 * L[rgba[j + 2]]);
  } else {
    for (let i = 0, j = 0; i < n; i++, j += 4) data[i] = 0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2];
  }
  return { data, width, height };
}

export function halve(p: Plane): Plane {
  const w = Math.max(1, Math.ceil(p.width / 2));
  const h = Math.max(1, Math.ceil(p.height / 2));
  const data = new Float32Array(w * h);
  const src = p.data;
  for (let y = 0; y < h; y++) {
    const y0 = 2 * y;
    const y1 = Math.min(y0 + 1, p.height - 1);
    for (let x = 0; x < w; x++) {
      const x0 = 2 * x;
      const x1 = Math.min(x0 + 1, p.width - 1);
      data[y * w + x] =
        (src[y0 * p.width + x0] + src[y0 * p.width + x1] + src[y1 * p.width + x0] + src[y1 * p.width + x1]) / 4;
    }
  }
  return { data, width: w, height: h };
}

export function buildPyramid(base: Plane, f = 1, ox = 0, oy = 0): Pyramid {
  const levels = [base];
  while (levels.length < 12) {
    const last = levels[levels.length - 1];
    if (last.width <= 1 && last.height <= 1) break;
    levels.push(halve(last));
  }
  return { levels, f, ox, oy };
}

const WHITE = 255;

function bilinear(p: Plane, x: number, y: number): number {
  // pixel i covers [i, i+1); its centre is i + 0.5
  const xf = x - 0.5;
  const yf = y - 0.5;
  const x0 = Math.floor(xf);
  const y0 = Math.floor(yf);
  const fx = xf - x0;
  const fy = yf - y0;
  const w = p.width;
  const h = p.height;
  const d = p.data;
  const g = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? WHITE : d[yy * w + xx]);
  // fast path for interior
  if (x0 >= 0 && y0 >= 0 && x0 + 1 < w && y0 + 1 < h) {
    const i = y0 * w + x0;
    const a = d[i] + (d[i + 1] - d[i]) * fx;
    const b = d[i + w] + (d[i + w + 1] - d[i + w]) * fx;
    return a + (b - a) * fy;
  }
  if (x < 0 || y < 0 || x >= w || y >= h) return WHITE;
  const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * fx;
  const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * fx;
  return a + (b - a) * fy;
}

/** Affine map from output continuous coords (u, v) to full-res source coords. */
export function outputToSourceAffine(crop: Crop) {
  const ex = displayToSource([crop.w / OUT_W, 0], crop); // per output px along u
  const ey = displayToSource([0, crop.h / OUT_H], crop); // per output px along v
  const o = displayToSource([-crop.w / 2, -crop.h / 2], crop);
  return { ox: crop.cx + o[0], oy: crop.cy + o[1], ux: ex[0], uy: ex[1], vx: ey[0], vy: ey[1] };
}

/**
 * Render the crop to OUT_W x OUT_H greyscale using area-averaged mip levels,
 * bilinear sampling at <= 1:1 and a final k x k box filter (high quality downscale),
 * or nearest-neighbour for pixel art. Areas outside the source are white.
 */
export function renderCrop(pyr: Pyramid, crop: Crop, nearest: boolean): Float32Array {
  const outW = OUT_W;
  const outH = OUT_H;
  const out = new Float32Array(outW * outH);
  const A = outputToSourceAffine(crop);
  const s = (crop.w * pyr.f) / OUT_W; // level-0 px per output px

  if (nearest) {
    const p = pyr.levels[0];
    for (let v = 0; v < outH; v++)
      for (let u = 0; u < outW; u++) {
        const uu = u + 0.5;
        const vv = v + 0.5;
        const X = (A.ox + uu * A.ux + vv * A.vx - pyr.ox) * pyr.f;
        const Y = (A.oy + uu * A.uy + vv * A.vy - pyr.oy) * pyr.f;
        // tiny epsilon keeps exact pixel boundaries stable
        const xi = Math.floor(X + 1e-7);
        const yi = Math.floor(Y + 1e-7);
        out[v * outW + u] = xi < 0 || yi < 0 || xi >= p.width || yi >= p.height ? WHITE : p.data[yi * p.width + xi];
      }
    return out;
  }

  const maxL = pyr.levels.length - 1;
  const L = Math.max(0, Math.min(maxL, Math.floor(Math.log2(Math.max(s, 1e-9)) + 1e-9)));
  const sL = s / 2 ** L;
  const k = sL > 1.001 ? Math.min(8, Math.max(2, Math.ceil(sL))) : 1;
  const p = pyr.levels[L];
  const lf = pyr.f / 2 ** L;
  const inv = 1 / (k * k);
  for (let v = 0; v < outH; v++)
    for (let u = 0; u < outW; u++) {
      let acc = 0;
      for (let j = 0; j < k; j++) {
        const vv = v + (j + 0.5) / k;
        for (let i = 0; i < k; i++) {
          const uu = u + (i + 0.5) / k;
          const X = (A.ox + uu * A.ux + vv * A.vx - pyr.ox) * lf;
          const Y = (A.oy + uu * A.uy + vv * A.vy - pyr.oy) * lf;
          acc += bilinear(p, X, Y);
        }
      }
      out[v * outW + u] = acc * inv;
    }
  return out;
}

/** Convert a linear-light plane (0..255) back to sRGB-encoded values. */
export function encodeLinear(g: Float32Array): void {
  for (let i = 0; i < g.length; i++) g[i] = linearToSrgb(Math.max(0, Math.min(1, g[i] / 255)));
}
