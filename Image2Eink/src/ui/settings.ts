import { DEFAULT_SETTINGS, effectiveMode, effectiveAutoLevels, type Settings, type DitherAlgo, type Mode } from '../types';
import type { Store } from '../state';
import { h } from './dom';
import { zoomOf, snapCrop } from '../editor/geometry';
import { isSnapping } from '../editor/viewport';

type NumKey = 'threshold' | 'brightness' | 'contrast' | 'gamma' | 'sharpen';

export class SettingsPanel {
  readonly el: HTMLElement;
  private nameInput = h('input', { type: 'text', style: { width: '100%' } });
  private mode = h(
    'select',
    {},
    ...(
      [
        ['auto', 'Auto'],
        ['dither', 'Dither'],
        ['threshold', 'Threshold'],
        ['pixel', 'Pixel art'],
      ] as const
    ).map(([v, l]) => h('option', { value: v }, l)),
  );
  private algo = h(
    'select',
    {},
    ...(
      [
        ['floyd-steinberg', 'Floyd-Steinberg (serpentine)'],
        ['atkinson', 'Atkinson'],
        ['bayer4', 'Ordered Bayer 4x4'],
        ['bayer8', 'Ordered Bayer 8x8'],
      ] as const
    ).map(([v, l]) => h('option', { value: v }, l)),
  );
  private autoLevels = h(
    'select',
    {},
    h('option', { value: 'default' }, 'Default'),
    h('option', { value: 'on' }, 'On'),
    h('option', { value: 'off' }, 'Off'),
  );
  private modeInfo = h('div', { class: 'info' });
  private algoRow: HTMLElement;
  private snapRow: HTMLElement;
  private sliders = new Map<NumKey, { input: HTMLInputElement; out: HTMLOutputElement; row: HTMLElement }>();
  private checks = new Map<'invert' | 'linearLight' | 'snapInteger', HTMLInputElement>();
  private body: HTMLElement;
  private empty = h('div', { class: 'info', style: { padding: '4px 0' } }, 'Select an image to edit its settings.');
  onCompare: () => void = () => {};
  onExportSingle: () => void = () => {};

  constructor(private store: Store) {
    this.nameInput.addEventListener('change', () => {
      const e = store.selected;
      if (e && this.nameInput.value.trim()) store.rename(e.id, this.nameInput.value.trim());
    });
    this.nameInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') this.nameInput.blur();
    });
    this.mode.addEventListener('change', () => this.set({ mode: this.mode.value as Mode }, 'mode'));
    this.algo.addEventListener('change', () => this.set({ algorithm: this.algo.value as DitherAlgo }, 'algo'));
    this.autoLevels.addEventListener('change', () =>
      this.set({ autoLevels: this.autoLevels.value === 'default' ? null : this.autoLevels.value === 'on' }, 'al'),
    );

    this.algoRow = h('div', { class: 'row two' }, h('label', {}, 'Algorithm'), this.algo);
    const slider = (key: NumKey, label: string, min: number, max: number, step: number) => {
      const input = h('input', { type: 'range', min, max, step });
      const out = h('output', { class: 'reset', title: 'Double-click to reset' });
      input.addEventListener('input', () => this.set({ [key]: Number(input.value) } as Partial<Settings>, key));
      const reset = () => this.set({ [key]: DEFAULT_SETTINGS[key] } as Partial<Settings>, key + '-reset', true);
      out.addEventListener('dblclick', reset);
      input.addEventListener('dblclick', reset);
      const row = h('div', { class: 'row' }, h('label', {}, label), input, out);
      this.sliders.set(key, { input, out, row });
      return row;
    };
    const check = (key: 'invert' | 'linearLight' | 'snapInteger', label: string, title: string) => {
      const input = h('input', { type: 'checkbox' });
      input.addEventListener('change', () => this.set({ [key]: input.checked } as Partial<Settings>, key, true));
      this.checks.set(key, input);
      return h('label', { title }, input, label);
    };

    this.snapRow = h(
      'div',
      { class: 'checks' },
      check('snapInteger', 'Snap to integer scale', 'Each source pixel becomes an exact N x N block'),
    );

    this.body = h(
      'div',
      {},
      h('div', { class: 'row two' }, h('label', {}, 'Name'), this.nameInput),
      h('div', { class: 'row two' }, h('label', {}, 'Mode'), this.mode),
      h('div', { class: 'row two' }, h('span'), this.modeInfo),
      this.algoRow,
      this.snapRow,
      slider('threshold', 'Threshold', 0, 255, 1),
      slider('brightness', 'Brightness', -100, 100, 1),
      slider('contrast', 'Contrast', -100, 100, 1),
      slider('gamma', 'Gamma', 0.3, 3, 0.01),
      slider('sharpen', 'Sharpen', 0, 100, 1),
      h('div', { class: 'row two' }, h('label', {}, 'Auto-levels'), this.autoLevels),
      h(
        'div',
        { class: 'checks' },
        check('invert', 'Invert', 'Swap black and white'),
        check('linearLight', 'Linear light', 'Resample and dither in linear light instead of sRGB'),
      ),
      h(
        'div',
        { class: 'btnrow' },
        h('button', { onclick: () => this.copyToAll(), title: 'Apply these conversion settings to every image' }, 'Copy settings to all'),
        h('button', { onclick: () => this.resetAll() }, 'Reset settings'),
        h('button', { onclick: () => this.onCompare(), title: 'Compare the four dither algorithms' }, 'Compare dithers'),
        h('button', { onclick: () => this.onExportSingle(), title: 'C array for this image only' }, 'Copy C array'),
      ),
    );

    this.el = h('div', { class: 'section' }, h('h3', {}, 'Conversion'), this.empty, this.body);
    store.on((k) => {
      if (k === 'selection' || k === 'image' || k === 'list') this.sync();
    });
    this.sync();
  }

  private set(patch: Partial<Settings>, key: string, discrete = false) {
    const e = this.store.selected;
    if (!e) return;
    if (discrete) this.store.checkpoint(e.id);
    else this.store.checkpointThrottled(e.id, key);
    this.store.setSettings(e.id, patch);
    // switching into pixel art / snap mode snaps the crop to an integer scale
    const e2 = this.store.get(e.id)!;
    if (isSnapping(e2)) {
      const snapped = snapCrop(e2.crop);
      if (JSON.stringify(snapped) !== JSON.stringify(e2.crop)) this.store.setCrop(e.id, snapped);
    }
  }

  private copyToAll() {
    const e = this.store.selected;
    if (!e) return;
    this.store.copySettingsToAll(e.id);
  }

  private resetAll() {
    const e = this.store.selected;
    if (!e) return;
    this.store.checkpoint(e.id);
    this.store.setSettings(e.id, { ...DEFAULT_SETTINGS });
  }

  sync() {
    const e = this.store.selected;
    this.empty.classList.toggle('hidden', !!e);
    this.body.classList.toggle('hidden', !e);
    if (!e) return;
    const s = e.settings;
    const active = document.activeElement;
    if (active !== this.nameInput) this.nameInput.value = e.name;
    this.mode.value = s.mode;
    this.algo.value = s.algorithm;
    this.autoLevels.value = s.autoLevels === null ? 'default' : s.autoLevels ? 'on' : 'off';
    const em = effectiveMode(s, e.colorCount);
    for (const [k, { input, out, row }] of this.sliders) {
      if (active !== input) input.value = String(s[k]);
      out.value = k === 'gamma' ? s[k].toFixed(2) : String(s[k]);
      row.classList.toggle('hidden', em === 'pixel' && k === 'sharpen');
    }
    for (const [k, input] of this.checks) input.checked = s[k];
    this.algoRow.classList.toggle('hidden', em !== 'dither');
    this.snapRow.classList.toggle('hidden', em !== 'pixel');
    this.checks.get('linearLight')!.parentElement!.classList.toggle('hidden', em === 'pixel');

    const names = { dither: 'Dither', threshold: 'Threshold', pixel: 'Pixel art' } as const;
    const parts: (string | Node)[] = [];
    if (s.mode === 'auto')
      parts.push(
        'Auto → ',
        h('b', {}, names[em]),
        ` (${e.colorCount > 32 ? '33+' : e.colorCount} colour${e.colorCount === 1 ? '' : 's'})`,
      );
    else parts.push(h('b', {}, names[em]));
    if (em === 'pixel') {
      const z = zoomOf(e.crop);
      const isInt = Math.abs(z - Math.round(z)) < 1e-6;
      parts.push(` · scale ${isInt ? Math.round(z) + 'x' : z.toFixed(2) + 'x (not integer)'}`);
    }
    parts.push(` · auto-levels ${effectiveAutoLevels(s, em) ? 'on' : 'off'}`);
    this.modeInfo.replaceChildren(...parts);
  }
}
