import { OUT_W, OUT_H, DEFAULT_PANEL, panelWidthMm, type PanelConfig } from '../types';
import type { RenderResult } from '../pipeline/renderer';
import { h, showDialog } from './dom';

const CARD_W_MM = 85.6;
type Scale = 2 | 3 | 4 | 'phys';

function lsGet(k: string, d: string): string {
  try {
    return localStorage.getItem('egg.' + k) ?? d;
  } catch {
    return d;
  }
}
function lsSet(k: string, v: string) {
  try {
    localStorage.setItem('egg.' + k, v);
  } catch {
    /* ignore */
  }
}

// stable paper texture, rebuilt when the panel size changes
let NOISE = new Int8Array(0);
function noise(): Int8Array {
  if (NOISE.length !== OUT_W * OUT_H) {
    NOISE = new Int8Array(OUT_W * OUT_H);
    let seed = 1234567;
    for (let i = 0; i < NOISE.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      NOISE[i] = ((seed >> 16) % 9) - 4;
    }
  }
  return NOISE;
}

export class PreviewPanel {
  readonly el: HTMLElement;
  private canvas = h('canvas', { width: OUT_W, height: OUT_H });
  private ctx = this.canvas.getContext('2d')!;
  private stage = h('div', { style: { position: 'relative', flex: 'none' } }, this.canvas);
  private splitLine = h('div', {
    style: { position: 'absolute', top: '0', bottom: '0', width: '1px', background: 'var(--accent)', pointerEvents: 'none' },
  });
  private stats = h('div', { class: 'preview-stats' });
  private scaleSeg: HTMLElement;
  private split = h('input', { type: 'range', min: 0, max: 100, step: 1, value: 0, title: 'Before/after split' });
  private einkBox = h('input', { type: 'checkbox' });
  private dpiInput = h('input', { type: 'number', min: 50, max: 600, step: 1, style: { width: '64px' } });
  private physRow: HTMLElement;
  private scale: Scale = (lsGet('scale', '2') === 'phys' ? 'phys' : Number(lsGet('scale', '2'))) as Scale;
  private result: RenderResult | null = null;
  private info = '';
  private title = h('h3', {});
  private panelMm = panelWidthMm(DEFAULT_PANEL);

  constructor() {
    this.einkBox.checked = lsGet('eink', '0') === '1';
    this.dpiInput.value = lsGet('dpi', '96');
    this.einkBox.addEventListener('change', () => {
      lsSet('eink', this.einkBox.checked ? '1' : '0');
      this.paint();
    });
    this.split.addEventListener('input', () => this.paint());
    this.dpiInput.addEventListener('change', () => {
      lsSet('dpi', String(this.dpi()));
      this.layout();
    });
    this.scaleSeg = h(
      'div',
      { class: 'seg' },
      ...([2, 3, 4, 'phys'] as Scale[]).map((s) =>
        h(
          'button',
          {
            'data-s': String(s),
            title: s === 'phys' ? 'True physical size' : `${s}x`,
            onclick: () => {
              this.scale = s;
              lsSet('scale', String(s));
              this.layout();
            },
          },
          s === 'phys' ? '1:1 mm' : `${s}x`,
        ),
      ),
    );
    this.physRow = h(
      'div',
      { class: 'preview-opts' },
      h('label', { class: 'info' }, 'Monitor DPI '),
      this.dpiInput,
      h('button', { onclick: () => this.calibrate() }, 'Calibrate with a card…'),
    );
    this.stage.append(this.splitLine);
    this.el = h(
      'div',
      { class: 'preview-dock' },
      h('div', { class: 'preview-wrap' }, this.stage),
      h(
        'div',
        { class: 'preview-side' },
        this.title,
        h(
          'div',
          { class: 'preview-opts' },
          this.scaleSeg,
          h('label', { class: 'info', style: { display: 'flex', gap: '4px', alignItems: 'center' } }, this.einkBox, 'E-ink look'),
        ),
        h('label', { class: 'info', title: 'Drag right to reveal the greyscale crop before quantising' }, 'Before / after split'),
        this.split,
        this.physRow,
        this.stats,
      ),
    );
    window.addEventListener('resize', () => this.layout());
    this.layout();
    this.paint();
  }

  /** Call when the output panel changes. */
  setPanel(cfg: PanelConfig) {
    this.panelMm = panelWidthMm(cfg);
    this.result = null; // stale size
    this.layout();
  }

  private dpi() {
    const v = Number(this.dpiInput.value);
    return Number.isFinite(v) && v >= 50 ? v : 96;
  }

  private layout() {
    for (const b of this.scaleSeg.querySelectorAll('button')) b.classList.toggle('active', b.dataset.s === String(this.scale));
    this.physRow.classList.toggle('hidden', this.scale !== 'phys');
    const cssW =
      this.scale === 'phys' ? ((this.panelMm / 25.4) * this.dpi()) / (devicePixelRatio || 1) : (OUT_W * this.scale) / (devicePixelRatio || 1);
    // integer multiples are in device pixels so pixels stay crisp
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${(cssW * OUT_H) / OUT_W}px`;
    this.canvas.style.imageRendering = this.scale === 'phys' ? 'auto' : 'pixelated';
    this.paint();
  }

  show(r: RenderResult | null, info = '') {
    this.result = r;
    this.info = info;
    this.paint();
  }

  private paint() {
    if (this.canvas.width !== OUT_W || this.canvas.height !== OUT_H) {
      this.canvas.width = OUT_W;
      this.canvas.height = OUT_H;
    }
    this.title.textContent = `Preview · ${OUT_W} × ${OUT_H} · 1-bit`;
    const NOISE = noise();
    const r = this.result && this.result.bits.length === OUT_W * OUT_H ? this.result : null;
    const img = this.ctx.createImageData(OUT_W, OUT_H);
    const d = img.data;
    const eink = this.einkBox.checked;
    const splitX = Math.round((Number(this.split.value) / 100) * OUT_W);
    this.splitLine.style.display = splitX > 0 && splitX < OUT_W ? 'block' : 'none';
    this.splitLine.style.left = `${(splitX / OUT_W) * 100}%`;
    let black = 0;
    for (let y = 0; y < OUT_H; y++)
      for (let x = 0; x < OUT_W; x++) {
        const i = y * OUT_W + x;
        let R: number, G: number, B: number;
        if (!r) {
          R = G = B = 40;
        } else if (x < splitX) {
          R = G = B = r.grey[i];
        } else if (r.bits[i]) {
          black++;
          if (eink) R = G = B = 0x2b + NOISE[i];
          else R = G = B = 0;
        } else if (eink) {
          R = 0xe8 + NOISE[i];
          G = 0xe6 + NOISE[i];
          B = 0xdf + NOISE[i];
        } else R = G = B = 255;
        d[i * 4] = R;
        d[i * 4 + 1] = G;
        d[i * 4 + 2] = B;
        d[i * 4 + 3] = 255;
      }
    this.ctx.putImageData(img, 0, 0);
    if (r && splitX === 0) black = r.bits.reduce((a, b) => a + b, 0);
    this.stats.textContent = r ? `${((black / (OUT_W * OUT_H)) * 100).toFixed(1)}% black${this.info ? ' · ' + this.info : ''}` : '';
  }

  private calibrate() {
    const dpr = devicePixelRatio || 1;
    let cssW = ((CARD_W_MM / 25.4) * this.dpi()) / dpr;
    const card = h('div', { class: 'card-cal' });
    const range = h('input', { type: 'range', min: 150, max: 900, step: 0.5, value: cssW });
    const label = h('div', { class: 'info' });
    const update = () => {
      cssW = Number(range.value);
      card.style.width = `${cssW}px`;
      label.textContent = `≈ ${Math.round((cssW * dpr) / (CARD_W_MM / 25.4))} DPI`;
    };
    range.addEventListener('input', update);
    update();
    showDialog((close) => [
      h('h2', {}, 'Calibrate physical size'),
      h('p', { class: 'info' }, 'Hold a credit card (85.6 mm wide) against the screen and drag the slider until the blue card matches its width.'),
      card,
      range,
      label,
      h(
        'div',
        { class: 'dlg-actions' },
        h('button', { onclick: close }, 'Cancel'),
        h(
          'button',
          {
            class: 'primary',
            onclick: () => {
              this.dpiInput.value = String(Math.round((cssW * dpr) / (CARD_W_MM / 25.4)));
              lsSet('dpi', this.dpiInput.value);
              this.layout();
              close();
            },
          },
          'Use this',
        ),
      ),
    ]);
  }
}
