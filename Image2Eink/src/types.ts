// ---------------- output panel ----------------
// The output size is a project-level setting. These are live ES module
// bindings: setPanelSize() updates them and every importer sees the new
// values (the worker gets the size with each render request).

export interface PanelPreset {
  id: string;
  label: string;
  w: number;
  h: number;
  /** active area width in mm, for the true-size preview */
  mmW: number;
}

export const PANEL_PRESETS: PanelPreset[] = [
  { id: 'crowpanel42', label: 'Elecrow CrowPanel 4.2" · 400 × 300', w: 400, h: 300, mmW: 84.8 },
  { id: 'heltec-e213', label: 'Heltec Vision Master E213 2.13" · 250 × 122', w: 250, h: 122, mmW: 48.6 },
];

export interface PanelConfig {
  /** a PANEL_PRESETS id, or 'custom' */
  preset: string;
  w: number;
  h: number;
}

export const DEFAULT_PANEL: PanelConfig = { preset: 'crowpanel42', w: 400, h: 300 };
/** Projects saved before the panel setting existed were made for the Heltec. */
export const LEGACY_PANEL: PanelConfig = { preset: 'heltec-e213', w: 250, h: 122 };
export const PANEL_MIN = 8;
export const PANEL_MAX = 2000;

export let OUT_W = DEFAULT_PANEL.w;
export let OUT_H = DEFAULT_PANEL.h;
export let ROW_BYTES = Math.ceil(OUT_W / 8);
export let IMAGE_BYTES = ROW_BYTES * OUT_H;
export let ASPECT = OUT_W / OUT_H;

export function setPanelSize(w: number, h: number): void {
  OUT_W = Math.round(w);
  OUT_H = Math.round(h);
  ROW_BYTES = Math.ceil(OUT_W / 8);
  IMAGE_BYTES = ROW_BYTES * OUT_H;
  ASPECT = OUT_W / OUT_H;
}

export function presetFor(cfg: PanelConfig): PanelPreset | undefined {
  return PANEL_PRESETS.find((p) => p.id === cfg.preset);
}

/** Active-area width in mm: the preset's, or an estimate at ~130 DPI for custom sizes. */
export function panelWidthMm(cfg: PanelConfig): number {
  return presetFor(cfg)?.mmW ?? (cfg.w / 130) * 25.4;
}

export function panelLabel(cfg: PanelConfig): string {
  return presetFor(cfg)?.label ?? `Custom · ${cfg.w} × ${cfg.h}`;
}

export function validPanel(cfg: unknown): cfg is PanelConfig {
  const c = cfg as PanelConfig;
  return (
    !!c &&
    typeof c.preset === 'string' &&
    Number.isInteger(c.w) &&
    Number.isInteger(c.h) &&
    c.w >= PANEL_MIN &&
    c.h >= PANEL_MIN &&
    c.w <= PANEL_MAX &&
    c.h <= PANEL_MAX
  );
}

export type Mode = 'auto' | 'dither' | 'threshold' | 'pixel';
export type EffectiveMode = Exclude<Mode, 'auto'>;
export type DitherAlgo = 'floyd-steinberg' | 'atkinson' | 'bayer4' | 'bayer8';
export type Status = 'new' | 'edited' | 'done' | 'excluded';

export interface Settings {
  mode: Mode;
  algorithm: DitherAlgo;
  threshold: number; // 0..255
  brightness: number; // -100..100
  contrast: number; // -100..100
  gamma: number; // 0.3..3
  /** null = default for the mode (on for dither, off otherwise) */
  autoLevels: boolean | null;
  sharpen: number; // 0..100
  invert: boolean;
  linearLight: boolean;
  snapInteger: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'auto',
  algorithm: 'floyd-steinberg',
  threshold: 128,
  brightness: 0,
  contrast: 0,
  gamma: 1,
  autoLevels: null,
  sharpen: 0,
  invert: false,
  linearLight: false,
  snapInteger: true,
};

/**
 * Crop, stored in full-resolution source pixel coordinates.
 * (cx, cy) is the source point at the centre of the output frame.
 * w x h is the frame size measured in source pixels (h = w * OUT_H / OUT_W).
 * rot = quarter turns clockwise applied to the image (0..3), flip = horizontal mirror
 * applied before rotation. Display = Rot^rot(Flip^flip(source)).
 */
export interface Crop {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
  flip: boolean;
}

export interface ImageEntry {
  id: string;
  name: string;
  fileName: string;
  status: Status;
  crop: Crop;
  settings: Settings;
  /** full-res (oriented) source dimensions */
  width: number;
  height: number;
  /** distinct colour count (capped at 33) on a downsampled copy */
  colorCount: number;
}

export interface ProjectJSON {
  version: 1;
  /** output panel; absent in projects made before it was selectable (= LEGACY_PANEL) */
  panel?: PanelConfig;
  images: ImageEntry[];
}

export function effectiveMode(s: Settings, colorCount: number): EffectiveMode {
  if (s.mode !== 'auto') return s.mode;
  return colorCount <= 32 ? 'pixel' : 'dither';
}

export function effectiveAutoLevels(s: Settings, mode: EffectiveMode): boolean {
  return s.autoLevels ?? mode === 'dither';
}
