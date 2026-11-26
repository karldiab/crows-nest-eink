import { describe, it, expect } from 'vitest';
import { floydSteinberg, atkinson, bayer, threshold } from '../src/pipeline/dither';
import { buildPyramid, renderCrop, type Plane } from '../src/pipeline/resample';
import { rotateCrop, flipCrop, defaultCrop, snapCrop, fitCrop, fillCrop } from '../src/editor/geometry';
import { processImage } from '../src/pipeline/process';
import { OUT_W, OUT_H, DEFAULT_SETTINGS, setPanelSize, type Crop } from '../src/types';

// These tests were written for the Heltec 250 x 122 panel.
setPanelSize(250, 122);

const N = OUT_W * OUT_H;
const ratio = (b: Uint8Array) => b.reduce((a, x) => a + x, 0) / b.length;

describe('dither sanity', () => {
  const grey = new Float32Array(N).fill(128);
  it('Floyd-Steinberg on 50% grey is ~50% black', () => {
    expect(Math.abs(ratio(floydSteinberg(grey, OUT_W, OUT_H)) - 0.5)).toBeLessThanOrEqual(0.02);
  });
  it('Atkinson and Bayer on 50% grey are ~50% black', () => {
    expect(Math.abs(ratio(atkinson(grey, OUT_W, OUT_H)) - 0.5)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(ratio(bayer(grey, OUT_W, OUT_H, 4)) - 0.5)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(ratio(bayer(grey, OUT_W, OUT_H, 8)) - 0.5)).toBeLessThanOrEqual(0.02);
  });
  it('threshold 128 on grey 128 is all white', () => {
    expect(ratio(threshold(grey, 128))).toBe(0);
  });
});

function randomPlane(w: number, h: number): Plane {
  const data = new Float32Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = Math.floor(Math.random() * 256);
  return { data, width: w, height: h };
}

describe('crop maths', () => {
  it('500x244 full crop equals a 2x box downscale', () => {
    const src = randomPlane(500, 244);
    const crop: Crop = { cx: 250, cy: 122, w: 500, h: 244, rot: 0, flip: false };
    expect(defaultCrop(500, 244)).toEqual(crop);
    const out = renderCrop(buildPyramid(src), crop, false);
    for (let y = 0; y < OUT_H; y++)
      for (let x = 0; x < OUT_W; x++) {
        const d = src.data;
        const i = 2 * y * 500 + 2 * x;
        const exp = (d[i] + d[i + 1] + d[i + 500] + d[i + 501]) / 4;
        expect(out[y * OUT_W + x]).toBeCloseTo(exp, 3);
      }
  });

  it('1:1 crop with rotation 90 rotates the pixels', () => {
    // source 122 wide x 250 tall, rotated clockwise -> 250 x 122
    const src = randomPlane(122, 250);
    const crop: Crop = { cx: 61, cy: 125, w: 250, h: 122, rot: 1, flip: false };
    const out = renderCrop(buildPyramid(src), crop, true);
    // clockwise: output (u, v) <- source (x = v, y = H-1-u)
    for (let v = 0; v < OUT_H; v += 7)
      for (let u = 0; u < OUT_W; u += 11) expect(out[v * OUT_W + u]).toBe(src.data[(249 - u) * 122 + v]);
  });

  it('flip mirrors horizontally', () => {
    const src = randomPlane(250, 122);
    const crop: Crop = { cx: 125, cy: 61, w: 250, h: 122, rot: 0, flip: false };
    const out = renderCrop(buildPyramid(src), flipCrop(crop), true);
    for (let v = 0; v < OUT_H; v += 5)
      for (let u = 0; u < OUT_W; u += 3) expect(out[v * OUT_W + u]).toBe(src.data[v * 250 + (249 - u)]);
  });

  it('rotating 90 degrees four times returns the original crop', () => {
    const c: Crop = { cx: 123.4, cy: 56.7, w: 300, h: 300 / (250 / 122), rot: 0, flip: true };
    let r = c;
    for (let i = 0; i < 4; i++) r = rotateCrop(r, 1);
    expect(r).toEqual(c);
    let l = c;
    for (let i = 0; i < 4; i++) l = rotateCrop(l, -1);
    expect(l).toEqual(c);
    expect(flipCrop(flipCrop(c))).toEqual(c);
  });

  it('outside the source renders white', () => {
    const src: Plane = { data: new Float32Array(100 * 100), width: 100, height: 100 };
    const fit = fitCrop(defaultCrop(100, 100), 100, 100);
    const out = renderCrop(buildPyramid(src), fit, false);
    expect(out[0]).toBe(255);
    expect(out[61 * OUT_W + 125]).toBe(0);
  });

  it('fill covers the frame', () => {
    const c = fillCrop(defaultCrop(1000, 1000), 1000, 1000);
    expect(c.w).toBe(1000);
  });

  it('snap gives an integer scale aligned to the pixel grid', () => {
    const s = snapCrop({ cx: 20.3, cy: 10.7, w: 40, h: 40 / (250 / 122), rot: 0, flip: false });
    expect(250 / s.w).toBe(6);
    expect((s.cx - s.w / 2) % 1).toBeCloseTo(0, 9);
    expect(Math.abs((s.cy - s.h / 2) % 1)).toBeCloseTo(0, 9);
  });

  it('pixel art at 2x maps each source pixel to a 2x2 block', () => {
    const src = randomPlane(125, 61);
    const crop = snapCrop({ cx: 62.5, cy: 30.5, w: 125, h: 61, rot: 0, flip: false });
    const r = processImage(buildPyramid(src), crop, { ...DEFAULT_SETTINGS, mode: 'pixel' }, 'pixel');
    for (let v = 0; v < OUT_H; v++)
      for (let u = 0; u < OUT_W; u++) expect(r.grey[v * OUT_W + u]).toBe(Math.round(src.data[(v >> 1) * 125 + (u >> 1)]));
  });
});

describe('full-res region source', () => {
  it('a sub-region with an offset renders the same as the whole image', () => {
    const W = 400;
    const H = 300;
    const full = randomPlane(W, H);
    const crop: Crop = { cx: 210.3, cy: 140.7, w: 100, h: 100 * (122 / 250), rot: 1, flip: true };
    const x0 = 120;
    const y0 = 60;
    const rw = 200;
    const rh = 180;
    const sub = new Float32Array(rw * rh);
    for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) sub[y * rw + x] = full.data[(y + y0) * W + x + x0];
    const a = renderCrop(buildPyramid(full), crop, false);
    const b = renderCrop(buildPyramid({ data: sub, width: rw, height: rh }, 1, x0, y0), crop, false);
    for (let i = 0; i < a.length; i += 37) expect(b[i]).toBeCloseTo(a[i], 3);
  });
});
