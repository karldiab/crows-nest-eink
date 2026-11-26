/** sRGB 8-bit -> linear (0..1) lookup table. */
export const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(l: number): number {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * Math.pow(l, 1 / 2.4) - 0.055;
  return c * 255;
}

export function srgbToLinear255(v: number): number {
  const c = Math.min(1, Math.max(0, v / 255));
  return (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * 255;
}

/** Rec. 709 luma from interleaved RGBA (already composited on white). */
export function toGrey(rgba: Uint8ClampedArray | Float32Array, n: number): Float32Array {
  const g = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = 0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2];
  return g;
}

/** Contrast stretch using the 0.5% / 99.5% percentiles. */
export function autoLevels(g: Float32Array): void {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.length; i++) hist[Math.max(0, Math.min(255, Math.round(g[i])))]++;
  const clip = g.length * 0.005;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255; lo++) {
    acc += hist[lo];
    if (acc > clip) break;
  }
  for (let acc = 0; hi > 0; hi--) {
    acc += hist[hi];
    if (acc > clip) break;
  }
  if (hi - lo < 2) return;
  // cap the gain at 8x so near-flat crops don't turn noise into full-range contrast
  if (hi - lo < 32) {
    const mid = (hi + lo) / 2;
    lo = Math.max(0, mid - 16);
    hi = Math.min(255, mid + 16);
  }
  const s = 255 / (hi - lo);
  for (let i = 0; i < g.length; i++) g[i] = (g[i] - lo) * s;
}

export function brightnessContrastGamma(g: Float32Array, brightness: number, contrast: number, gamma: number): void {
  const b = (brightness / 100) * 128;
  const C = contrast * 2.55;
  const f = (259 * (C + 255)) / (255 * (259 - C));
  const invG = 1 / gamma;
  const doGamma = Math.abs(gamma - 1) > 1e-6;
  for (let i = 0; i < g.length; i++) {
    let v = g[i] + b;
    v = f * (v - 128) + 128;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (doGamma) v = 255 * Math.pow(v / 255, invG);
    g[i] = v;
  }
}

/** Unsharp mask with a 3x3 box blur. amount 0..100. */
export function sharpen(g: Float32Array, w: number, h: number, amount: number): Float32Array {
  if (amount <= 0) return g;
  const k = (amount / 100) * 2;
  const out = new Float32Array(g.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          sum += g[yy * w + xx];
          cnt++;
        }
      }
      const v = g[y * w + x];
      out[y * w + x] = Math.max(0, Math.min(255, v + k * (v - sum / cnt)));
    }
  return out;
}

export function clamp255(g: Float32Array): void {
  for (let i = 0; i < g.length; i++) g[i] = g[i] < 0 ? 0 : g[i] > 255 ? 255 : g[i];
}
