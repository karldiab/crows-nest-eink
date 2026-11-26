import type { DitherAlgo } from '../types';

/**
 * All functions take a greyscale Float32Array (0..255, 0 = black) and return
 * a bitmap with 1 = black. A pixel is black when its value is below `threshold`.
 */

export function threshold(grey: Float32Array, t: number): Uint8Array {
  const out = new Uint8Array(grey.length);
  for (let i = 0; i < grey.length; i++) out[i] = grey[i] < t ? 1 : 0;
  return out;
}

export function floydSteinberg(grey: Float32Array, w: number, h: number, t = 128): Uint8Array {
  const buf = Float32Array.from(grey);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const ltr = (y & 1) === 0; // serpentine
    const dir = ltr ? 1 : -1;
    for (let i = 0; i < w; i++) {
      const x = ltr ? i : w - 1 - i;
      const idx = y * w + x;
      const old = buf[idx];
      const black = old < t;
      out[idx] = black ? 1 : 0;
      const err = old - (black ? 0 : 255);
      const xn = x + dir;
      const xp = x - dir;
      if (xn >= 0 && xn < w) buf[idx + dir] += (err * 7) / 16;
      if (y + 1 < h) {
        const r = idx + w;
        if (xp >= 0 && xp < w) buf[r - dir] += (err * 3) / 16;
        buf[r] += (err * 5) / 16;
        if (xn >= 0 && xn < w) buf[r + dir] += (err * 1) / 16;
      }
    }
  }
  return out;
}

export function atkinson(grey: Float32Array, w: number, h: number, t = 128): Uint8Array {
  const buf = Float32Array.from(grey);
  const out = new Uint8Array(w * h);
  const offs = [
    [1, 0],
    [2, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [0, 2],
  ];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const old = buf[idx];
      const black = old < t;
      out[idx] = black ? 1 : 0;
      const e = (old - (black ? 0 : 255)) / 8;
      for (const [dx, dy] of offs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < w && ny < h) buf[ny * w + nx] += e;
      }
    }
  }
  return out;
}

function bayerMatrix(n: number): number[] {
  if (n === 1) return [0];
  const half = n / 2;
  const m = bayerMatrix(half);
  const out = new Array(n * n);
  for (let y = 0; y < half; y++)
    for (let x = 0; x < half; x++) {
      const v = 4 * m[y * half + x];
      out[y * n + x] = v;
      out[y * n + x + half] = v + 2;
      out[(y + half) * n + x] = v + 3;
      out[(y + half) * n + x + half] = v + 1;
    }
  return out;
}

export function bayer(grey: Float32Array, w: number, h: number, n: 4 | 8, t = 128): Uint8Array {
  const m = bayerMatrix(n);
  const nn = n * n;
  const bias = t - 128;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const th = ((m[(y % n) * n + (x % n)] + 0.5) / nn) * 255 + bias;
      out[y * w + x] = grey[y * w + x] < th ? 1 : 0;
    }
  return out;
}

export function dither(grey: Float32Array, w: number, h: number, algo: DitherAlgo, t = 128): Uint8Array {
  switch (algo) {
    case 'atkinson':
      return atkinson(grey, w, h, t);
    case 'bayer4':
      return bayer(grey, w, h, 4, t);
    case 'bayer8':
      return bayer(grey, w, h, 8, t);
    default:
      return floydSteinberg(grey, w, h, t);
  }
}
