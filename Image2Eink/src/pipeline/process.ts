import { OUT_W, OUT_H, type Crop, type Settings, type EffectiveMode, effectiveAutoLevels, type DitherAlgo } from '../types';
import { renderCrop, encodeLinear, type Pyramid } from './resample';
import { autoLevels, brightnessContrastGamma, sharpen, clamp255, srgbToLinear255 } from './adjust';
import { dither, threshold } from './dither';

export interface ProcessResult {
  /** adjusted greyscale (0..255) right before quantising, for before/after view */
  grey: Uint8ClampedArray;
  /** 1 = black */
  bits: Uint8Array;
}

/**
 * crop/rotate/flip -> resample -> greyscale -> auto-levels -> brightness/contrast/gamma
 * -> sharpen -> dither/threshold -> invert.
 * `pyr` must be built from a linear-light plane when settings.linearLight is on.
 */
export function processImage(
  pyr: Pyramid,
  crop: Crop,
  s: Settings,
  mode: EffectiveMode,
  algoOverride?: DitherAlgo,
): ProcessResult {
  const linear = s.linearLight && mode !== 'pixel';
  let g = renderCrop(pyr, crop, mode === 'pixel');
  if (linear) encodeLinear(g);
  if (effectiveAutoLevels(s, mode)) autoLevels(g);
  brightnessContrastGamma(g, s.brightness, s.contrast, s.gamma);
  g = sharpen(g, OUT_W, OUT_H, s.sharpen);
  clamp255(g);

  let bits: Uint8Array;
  if (mode === 'dither') {
    let src = g;
    let t = s.threshold;
    if (linear) {
      // diffuse error in linear light so the black/white ratio matches perceived tone
      src = new Float32Array(g.length);
      for (let i = 0; i < g.length; i++) src[i] = srgbToLinear255(g[i]);
      t = srgbToLinear255(t);
    }
    bits = dither(src, OUT_W, OUT_H, algoOverride ?? s.algorithm, t);
  } else {
    bits = threshold(g, s.threshold);
  }
  if (s.invert) for (let i = 0; i < bits.length; i++) bits[i] ^= 1;
  return { grey: Uint8ClampedArray.from(g), bits };
}

export function describe(s: Settings, mode: EffectiveMode): string {
  if (mode === 'dither') return `dither, ${s.algorithm}`;
  if (mode === 'threshold') return `threshold, ${s.threshold}`;
  return 'pixel art';
}
