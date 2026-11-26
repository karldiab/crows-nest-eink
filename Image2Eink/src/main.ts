import './style.css';
import { store } from './state';
import { Viewport, isSnapping, clampZoom } from './editor/viewport';
import { centreCrop, fillCrop, fitCrop, flipCrop, moveCrop, rotateCrop, snapCrop, zoomOf, defaultCrop } from './editor/geometry';
import { OUT_W, OUT_H, IMAGE_BYTES, PANEL_PRESETS, PANEL_MIN, PANEL_MAX, panelLabel, presetFor } from './types';
import { Renderer, LiveRender } from './pipeline/renderer';
import { pack } from './pipeline/pack';
import { describe as describeMode } from './pipeline/process';
import { generateHeader, makeIdentifiers, formatArray, validateItems, type HeaderItem } from './export/header';
import { download, previewsZip, saveEggproj, openEggproj } from './export/zip';
import { fsAccessSupported, writeToFolder, downloadHeader, rememberedFolder, pickFolder } from './export/files';
import { filesFromDataTransfer, ingestFile, isLikelyImage } from './import';
import { Sidebar } from './ui/sidebar';
import { SettingsPanel } from './ui/settings';
import { PreviewPanel } from './ui/preview';
import { h, toast, showDialog, confirmDialog, isTyping } from './ui/dom';
import { effectiveMode, type Crop, type DitherAlgo, type ImageEntry } from './types';

const renderer = new Renderer(store);

// ---------------- layout ----------------
const app = document.getElementById('app')!;
const fileInput = h('input', { type: 'file', multiple: true, accept: 'image/*', class: 'hidden' });
const folderInput = h('input', { type: 'file', multiple: true, class: 'hidden' });
folderInput.setAttribute('webkitdirectory', '');
const projectInput = h('input', { type: 'file', accept: '.eggproj,application/zip', class: 'hidden' });

const progress = h('span', { class: 'progress' });
const undoBtn = h('button', { class: 'icon', title: 'Undo (Ctrl+Z)', onclick: () => undo() }, '↶');
const redoBtn = h('button', { class: 'icon', title: 'Redo (Ctrl+Shift+Z)', onclick: () => redo() }, '↷');

function menu(label: string, primary: boolean, build: () => (HTMLElement | string)[]): HTMLElement {
  const list = h('div', { class: 'menu-list' });
  const btn = h('button', { class: primary ? 'primary' : '' }, label + ' ▾');
  const wrap = h('div', { class: 'menu' }, btn, list);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !wrap.classList.contains('open');
    document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open'));
    if (open) {
      list.replaceChildren(...build());
      wrap.classList.add('open');
    }
  });
  list.addEventListener('click', () => wrap.classList.remove('open'));
  return wrap;
}
document.addEventListener('click', () => document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')));

const item = (label: string, fn: () => unknown, disabled = false) =>
  h('button', { onclick: () => void fn(), disabled }, label);
const note = (t: string) => h('div', { class: 'note' }, t);

let folderName: string | null = null;
void rememberedFolder().then((f) => (folderName = f?.name ?? null));

const projectMenu = menu('Project', false, () => [
  item('Save project (.eggproj)…', saveProject, !store.images.length),
  item('Open project…', () => projectInput.click()),
  item('New project', newProject, !store.images.length),
  item('Add test pattern (hardware check)', addTestPattern),
]);
const exportMenu = menu('Export', true, () => {
  const fs = fsAccessSupported();
  const n = store.included().length;
  return [
    ...(fs
      ? [
          item(folderName ? `Write easter_eggs.h to “${folderName}”` : 'Write easter_eggs.h to folder…', () => exportHeader('folder'), !n),
          item('Choose a different folder…', () => exportHeader('pick'), !n),
        ]
      : [note('Direct folder writes need Chrome or Edge.')]),
    item('Download easter_eggs.h', () => exportHeader('download'), !n),
    item('Export previews (ZIP)', exportPreviews, !n),
    item('Copy C array for current image…', exportSingle, !store.selected),
    note(`${n} image(s) included · ${OUT_W} × ${OUT_H} · ${n * IMAGE_BYTES} bytes`),
  ];
});

// ---------------- output panel picker ----------------
const panelSelect = h(
  'select',
  { title: 'Output panel: every image in the header is this size' },
  ...PANEL_PRESETS.map((p) => h('option', { value: p.id }, p.label)),
  h('option', { value: 'custom' }, 'Custom size…'),
);
const numIn = () => h('input', { type: 'number', min: PANEL_MIN, max: PANEL_MAX, step: 1, style: { width: '64px' } });
const customW = numIn();
const customH = numIn();
const customBox = h(
  'span',
  { class: 'panel-custom', style: { display: 'flex', alignItems: 'center', gap: '4px' } },
  customW,
  '×',
  customH,
  h('button', { onclick: () => applyCustomPanel() }, 'Apply'),
);

function syncPanelPicker() {
  const p = store.panel;
  panelSelect.value = presetFor(p) ? p.preset : 'custom';
  customW.value = String(p.w);
  customH.value = String(p.h);
  customBox.classList.toggle('hidden', panelSelect.value !== 'custom');
}

function applyCustomPanel() {
  const w = Math.round(Number(customW.value));
  const hh = Math.round(Number(customH.value));
  if (!(w >= PANEL_MIN && w <= PANEL_MAX && hh >= PANEL_MIN && hh <= PANEL_MAX))
    return toast(`Width and height must be ${PANEL_MIN} to ${PANEL_MAX} px.`, true);
  changePanel({ preset: 'custom', w, h: hh });
}

function changePanel(cfg: { preset: string; w: number; h: number }) {
  const resized = cfg.w !== OUT_W || cfg.h !== OUT_H;
  store.setPanel(cfg);
  if (resized && store.images.length)
    toast(`Output is now ${cfg.w} × ${cfg.h}. Crops kept their centre and width; check the framing.`);
}

panelSelect.addEventListener('change', () => {
  const p = PANEL_PRESETS.find((x) => x.id === panelSelect.value);
  if (p) changePanel({ preset: p.id, w: p.w, h: p.h });
  else customBox.classList.remove('hidden');
});

const topbar = h(
  'header',
  { class: 'topbar' },
  h('div', { class: 'brand' }, 'Egg Studio'),
  panelSelect,
  customBox,
  h('button', { onclick: () => fileInput.click() }, '+ Add images'),
  h('button', { onclick: () => folderInput.click(), title: 'Add every image in a folder' }, '+ Folder'),
  progress,
  h('div', { class: 'spacer' }),
  undoBtn,
  redoBtn,
  h('div', { class: 'sep' }),
  projectMenu,
  exportMenu,
  fileInput,
  folderInput,
  projectInput,
);

// editor column
const zoomLabel = h('span', { class: 'zoom' });
const tb = (label: string, title: string, fn: () => void) => h('button', { title, onclick: fn }, label);
const toolbar = h(
  'div',
  { class: 'toolbar' },
  zoomLabel,
  tb('−', 'Zoom out (-)', () => viewport.zoomBy(1 / 1.25)),
  tb('+', 'Zoom in (+)', () => viewport.zoomBy(1.25)),
  tb('Fit', 'Whole image inside the frame (F)', () => cropOp((c, e) => fitCrop(c, e.width, e.height))),
  tb('Fill', 'Cover the frame (G)', () => cropOp((c, e) => fillCrop(c, e.width, e.height))),
  tb('Centre', 'Centre the image', () => cropOp((c, e) => centreCrop(c, e.width, e.height))),
  tb('Reset', 'Reset crop, rotation and flip', () => cropOp((_c, e) => defaultCrop(e.width, e.height))),
  h('span', { class: 'grow' }),
  tb('⟲ 90°', 'Rotate left', () => cropOp((c) => rotateCrop(c, -1))),
  tb('⟳ 90°', 'Rotate right', () => cropOp((c) => rotateCrop(c, 1))),
  tb('⇋ Flip', 'Flip horizontally', () => cropOp((c) => flipCrop(c))),
);
const viewportHost = h('div', { class: 'viewport' });
const emptyMsg = h(
  'div',
  { class: 'empty' },
  h('div', {}, h('div', { style: { fontSize: '18px', marginBottom: '6px', color: 'var(--text)' } }, 'Drop images or folders here'), 'JPEG, PNG, GIF, WebP, AVIF, BMP… everything stays on this computer.'),
);
viewportHost.append(emptyMsg);
const hints = h(
  'div',
  { class: 'hints' },
  ...[
    ['Drag', 'pan'],
    ['Wheel', 'zoom'],
    ['Corners', 'resize'],
    ['←↑→↓', 'nudge (Shift ×10)'],
    ['F/G', 'fit/fill'],
    ['N/P · J/K', 'next/prev'],
    ['D', 'done'],
    ['X', 'exclude'],
    ['Ctrl+Z', 'undo'],
  ].map(([k, v]) => h('span', {}, h('kbd', {}, k), ' ', v)),
);
const preview = new PreviewPanel();
const editor = h('section', { class: 'editor' }, toolbar, viewportHost, preview.el, hints);

const sidebar = new Sidebar(store);
const settings = new SettingsPanel(store);
const right = h('aside', { class: 'right' }, settings.el);

const dropOverlay = h('div', { class: 'drop-overlay' }, 'Drop images or folders to add them');
app.append(h('div', { class: 'app' }, topbar, h('main', { class: 'layout' }, sidebar.el, editor, right)), dropOverlay);

const viewport = new Viewport(viewportHost, store);

// ---------------- wiring ----------------
function updateChrome() {
  const e = store.selected;
  emptyMsg.classList.toggle('hidden', !!e);
  toolbar.querySelectorAll('button').forEach((b) => (b.disabled = !e));
  undoBtn.disabled = redoBtn.disabled = !e;
  if (e) {
    const z = zoomOf(e.crop);
    zoomLabel.textContent = `Zoom ${z >= 10 ? z.toFixed(1) : z.toFixed(z < 1 ? 3 : 2)}x`;
    zoomLabel.title = 'Output pixels per source pixel';
  } else zoomLabel.textContent = '';
}

let lastRenderMs = 0;
const live = new LiveRender(async () => {
  const e = store.selected;
  if (!e) {
    preview.show(null);
    return;
  }
  const t0 = performance.now();
  const r = await renderer.renderOne(e);
  lastRenderMs = performance.now() - t0;
  if (store.selected?.id !== e.id) return;
  const mode = effectiveMode(e.settings, e.colorCount);
  preview.show(r, `${describeMode(e.settings, mode)} · ${lastRenderMs.toFixed(0)} ms`);
});

store.on((k) => {
  if (k === 'panel') {
    syncPanelPicker();
    preview.setPanel(store.panel);
    document.title = `Egg Studio · ${panelLabel(store.panel)}`;
  }
  if (k === 'selection') void viewport.setImage();
  if (k === 'image' || k === 'selection') {
    viewport.draw();
    live.request();
  }
  updateChrome();
});
viewport.onZoomChange = updateChrome;

function cropOp(fn: (c: Crop, e: ImageEntry) => Crop) {
  const e = store.selected;
  if (!e) return;
  store.checkpoint(e.id);
  let c = clampZoom(fn(e.crop, e));
  if (isSnapping(e)) c = snapCrop(c);
  store.setCrop(e.id, c);
}

function nudge(dx: number, dy: number) {
  const e = store.selected;
  if (!e) return;
  store.checkpointThrottled(e.id, 'nudge', 800);
  // one output pixel, or one source pixel when snapping to an integer scale
  const step = isSnapping(e) ? Math.max(1, e.crop.w / OUT_W) : e.crop.w / OUT_W;
  let c = moveCrop(e.crop, [dx * step, dy * step]);
  if (isSnapping(e)) c = snapCrop(c);
  store.setCrop(e.id, c);
}

function undo() {
  const e = store.selected;
  if (e) store.undo(e.id);
}
function redo() {
  const e = store.selected;
  if (e) store.redo(e.id);
}

// ---------------- import ----------------
async function importFiles(files: File[]) {
  const imgs = files.filter(isLikelyImage);
  if (!imgs.length) {
    if (files.length) toast('No images found in that drop.', true);
    return;
  }
  const firstNew = store.images.length;
  let failed = 0;
  for (let i = 0; i < imgs.length; i++) {
    progress.textContent = `Importing ${i + 1} / ${imgs.length}…`;
    const r = await ingestFile(imgs[i]);
    if (r) await store.add([r]);
    else failed++;
  }
  progress.textContent = '';
  if (store.images[firstNew]) store.select(store.images[firstNew].id);
  toast(`Added ${imgs.length - failed} image(s).${failed ? `\n${failed} could not be decoded.` : ''}`, failed > 0);
}

fileInput.addEventListener('change', () => {
  void importFiles([...(fileInput.files ?? [])]);
  fileInput.value = '';
});
folderInput.addEventListener('change', () => {
  const files = [...(folderInput.files ?? [])].sort((a, b) =>
    a.webkitRelativePath.localeCompare(b.webkitRelativePath, undefined, { numeric: true }),
  );
  void importFiles(files);
  folderInput.value = '';
});

let dragDepth = 0;
const isExternalFileDrag = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!isExternalFileDrag(e)) return;
  dragDepth++;
  dropOverlay.classList.add('show');
});
window.addEventListener('dragleave', (e) => {
  if (!isExternalFileDrag(e)) return;
  if (--dragDepth <= 0) {
    dragDepth = 0;
    dropOverlay.classList.remove('show');
  }
});
window.addEventListener('dragover', (e) => {
  if (isExternalFileDrag(e)) e.preventDefault();
});
window.addEventListener('drop', async (e) => {
  if (!isExternalFileDrag(e)) return;
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('show');
  const dt = e.dataTransfer!;
  const proj = [...dt.files].find((f) => f.name.toLowerCase().endsWith('.eggproj'));
  if (proj) return openProject(proj);
  await importFiles(await filesFromDataTransfer(dt));
});

// ---------------- export ----------------
async function buildItems(entries: ImageEntry[]): Promise<HeaderItem[]> {
  const items: HeaderItem[] = [];
  for (let i = 0; i < entries.length; i++) {
    progress.textContent = `Rendering ${i + 1} / ${entries.length}…`;
    const e = entries[i];
    const r = await renderer.renderOne(e);
    items.push({
      name: e.name,
      fileName: e.fileName,
      description: describeMode(e.settings, effectiveMode(e.settings, e.colorCount)),
      bytes: pack(r.bits),
    });
  }
  progress.textContent = '';
  return items;
}

async function exportHeader(target: 'folder' | 'pick' | 'download') {
  try {
    const entries = store.included();
    if (!entries.length) return toast('Nothing to export: every image is excluded.', true);
    const items = await buildItems(entries);
    const errors = validateItems(items);
    if (errors.length) return toast(errors.join('\n'), true, 6000);
    const text = generateHeader(items, panelLabel(store.panel));
    if (target === 'download' || !fsAccessSupported()) {
      downloadHeader(text);
      toast(`Downloaded easter_eggs.h (${items.length} images, ${OUT_W} × ${OUT_H}).`);
    } else {
      if (target === 'pick') await pickFolder();
      folderName = await writeToFolder(text);
      toast(`Wrote easter_eggs.h to “${folderName}” (${items.length} images, ${(text.length / 1024).toFixed(0)} KB).`);
    }
  } catch (err) {
    progress.textContent = '';
    if ((err as Error).name === 'AbortError') return;
    console.error(err);
    toast(`Export failed: ${(err as Error).message}`, true, 6000);
  }
}

async function exportPreviews() {
  try {
    const entries = store.included();
    const out: { name: string; bits: Uint8Array }[] = [];
    for (let i = 0; i < entries.length; i++) {
      progress.textContent = `Rendering ${i + 1} / ${entries.length}…`;
      out.push({ name: entries[i].name, bits: (await renderer.renderOne(entries[i])).bits });
    }
    progress.textContent = 'Zipping…';
    download(await previewsZip(out), 'egg_previews.zip');
    toast(`Exported ${out.length} preview(s).`);
  } catch (err) {
    console.error(err);
    toast(`Preview export failed: ${(err as Error).message}`, true);
  } finally {
    progress.textContent = '';
  }
}

async function exportSingle() {
  const e = store.selected;
  if (!e) return;
  const r = await renderer.renderOne(e);
  // use the identifier this image would get in the full header
  const all = store.images.filter((i) => i.status !== 'excluded' || i.id === e.id);
  const id = makeIdentifiers(all.map((i) => i.name))[all.indexOf(e)];
  const text = formatArray(id, {
    name: e.name,
    fileName: e.fileName,
    description: describeMode(e.settings, effectiveMode(e.settings, e.colorCount)),
    bytes: pack(r.bits),
  });
  const ta = h('textarea', { readOnly: true, spellcheck: false });
  ta.value = text;
  showDialog((close) => [
    h('h2', {}, `C array: ${id}`),
    ta,
    h(
      'div',
      { class: 'dlg-actions' },
      h('button', { onclick: close }, 'Close'),
      h(
        'button',
        {
          class: 'primary',
          onclick: async () => {
            await navigator.clipboard.writeText(text);
            toast('Copied to clipboard.');
          },
        },
        'Copy',
      ),
    ),
  ]);
}

async function compareDithers() {
  const e = store.selected;
  if (!e) return;
  const algos: [DitherAlgo, string][] = [
    ['floyd-steinberg', 'Floyd-Steinberg'],
    ['atkinson', 'Atkinson'],
    ['bayer4', 'Bayer 4x4'],
    ['bayer8', 'Bayer 8x8'],
  ];
  const tmp: ImageEntry = { ...e, settings: { ...e.settings, mode: 'dither' } };
  const results = await renderer.render(tmp, algos.map((a) => a[0]));
  showDialog((close) => [
    h('h2', {}, 'Compare dither algorithms'),
    h('p', { class: 'info' }, 'Click one to use it for this image.'),
    h(
      'div',
      { class: 'compare-grid' },
      ...algos.map(([algo, label], i) => {
        const c = h('canvas', { width: OUT_W, height: OUT_H });
        const ctx = c.getContext('2d')!;
        const img = ctx.createImageData(OUT_W, OUT_H);
        results[i].bits.forEach((b, j) => {
          const v = b ? 0 : 255;
          img.data.set([v, v, v, 255], j * 4);
        });
        ctx.putImageData(img, 0, 0);
        const cur = effectiveMode(e.settings, e.colorCount) === 'dither' && e.settings.algorithm === algo;
        return h(
          'figure',
          {
            class: cur ? 'current' : '',
            onclick: () => {
              store.checkpoint(e.id);
              store.setSettings(e.id, { mode: 'dither', algorithm: algo });
              close();
            },
          },
          c,
          h('figcaption', {}, label + (cur ? ' (current)' : '')),
        );
      }),
    ),
    h('div', { class: 'dlg-actions' }, h('button', { onclick: close }, 'Close')),
  ]);
}
settings.onCompare = () => void compareDithers();
settings.onExportSingle = () => void exportSingle();

/** Panel-sized pattern: 1 px border, diagonal, name in the top-left. Checks offset, mirroring, inversion. */
async function addTestPattern() {
  const c = new OffscreenCanvas(OUT_W, OUT_H);
  const x = c.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, OUT_W, OUT_H);
  x.fillStyle = '#000';
  x.fillRect(0, 0, OUT_W, 1);
  x.fillRect(0, OUT_H - 1, OUT_W, 1);
  x.fillRect(0, 0, 1, OUT_H);
  x.fillRect(OUT_W - 1, 0, 1, OUT_H);
  for (let i = 0; i < OUT_W; i++) x.fillRect(i, Math.floor((i * (OUT_H - 1)) / (OUT_W - 1)), 1, 1);
  x.font = 'bold 12px monospace';
  x.textBaseline = 'top';
  x.fillText('test_pattern', 4, 4);
  x.fillText('TOP-LEFT', 4, 18);
  x.fillRect(OUT_W - 12, OUT_H - 12, 8, 8); // solid block bottom-right
  const blob = await c.convertToBlob({ type: 'image/png' });
  const r = await ingestFile(new File([blob], 'test_pattern.png', { type: 'image/png' }));
  if (!r) return;
  r.entry.settings = { ...r.entry.settings, mode: 'threshold' };
  r.entry.crop = defaultCrop(OUT_W, OUT_H); // exactly 1:1
  await store.add([r]);
  store.select(r.entry.id);
}

// ---------------- project files ----------------
async function saveProject() {
  try {
    progress.textContent = 'Saving project…';
    await store.saveNow();
    download(await saveEggproj(store.toJSON()), 'egg-studio.eggproj');
  } catch (err) {
    toast(`Save failed: ${(err as Error).message}`, true);
  } finally {
    progress.textContent = '';
  }
}

async function openProject(file: File) {
  if (store.images.length && !(await confirmDialog('Open project', 'Replace the current project? Unsaved work in this browser will be lost.', 'Replace')))
    return;
  try {
    progress.textContent = 'Opening project…';
    const { entries, blobs, missing, panel } = await openEggproj(file);
    await store.clear();
    store.setPanel(panel);
    await store.add(entries.map((entry) => ({ entry, blobs: blobs.get(entry.id)! })));
    toast(`Opened ${entries.length} image(s).${missing.length ? `\nMissing: ${missing.join(', ')}` : ''}`, missing.length > 0);
  } catch (err) {
    toast(`Could not open project: ${(err as Error).message}`, true, 6000);
  } finally {
    progress.textContent = '';
  }
}
projectInput.addEventListener('change', () => {
  const f = projectInput.files?.[0];
  if (f) void openProject(f);
  projectInput.value = '';
});

async function newProject() {
  if (!(await confirmDialog('New project', 'Remove all images and start over? Save a .eggproj first if you want a backup.', 'Remove all')))
    return;
  await store.clear();
}

// ---------------- keyboard ----------------
window.addEventListener('keydown', (ev) => {
  if (isTyping(ev) || document.querySelector('dialog[open]')) return;
  const e = store.selected;
  const k = ev.key;
  const mod = ev.ctrlKey || ev.metaKey;
  if (mod && (k === 'z' || k === 'Z')) {
    ev.preventDefault();
    if (ev.shiftKey) redo();
    else undo();
    return;
  }
  if (mod && (k === 'y' || k === 'Y')) {
    ev.preventDefault();
    redo();
    return;
  }
  if (mod && (k === 's' || k === 'S')) {
    ev.preventDefault();
    void saveProject();
    return;
  }
  if (mod || ev.altKey) return;
  const step = ev.shiftKey ? 10 : 1;
  const handled = (() => {
    switch (k) {
      case 'ArrowLeft':
        nudge(-step, 0);
        return true;
      case 'ArrowRight':
        nudge(step, 0);
        return true;
      case 'ArrowUp':
        nudge(0, -step);
        return true;
      case 'ArrowDown':
        nudge(0, step);
        return true;
      case '+':
      case '=':
        if (e) store.checkpointThrottled(e.id, 'kzoom');
        viewport.zoomBy(1.25);
        return true;
      case '-':
      case '_':
        if (e) store.checkpointThrottled(e.id, 'kzoom');
        viewport.zoomBy(1 / 1.25);
        return true;
      case 'f':
      case 'F':
        cropOp((c, en) => fitCrop(c, en.width, en.height));
        return true;
      case 'g':
      case 'G':
        cropOp((c, en) => fillCrop(c, en.width, en.height));
        return true;
      case 'n':
      case 'N':
      case 'j':
      case 'J':
        store.step(1);
        return true;
      case 'p':
      case 'P':
      case 'k':
      case 'K':
        store.step(-1);
        return true;
      case 'd':
      case 'D':
        if (e) store.toggleStatus(e.id, 'done');
        return true;
      case 'x':
      case 'X':
        if (e) store.toggleStatus(e.id, 'excluded');
        return true;
      case 'F2':
        if (e) sidebar.startRename(e);
        return true;
      case 'Delete':
        return false;
    }
    return false;
  })();
  if (handled) ev.preventDefault();
});

window.addEventListener('beforeunload', () => void store.saveNow());

// ---------------- boot ----------------
syncPanelPicker();
updateChrome();
navigator.storage?.persist?.().catch(() => {});
store.load().catch((err) => {
  console.error(err);
  toast('Could not restore the saved project.', true);
});
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
