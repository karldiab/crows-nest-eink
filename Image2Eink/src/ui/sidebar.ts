import { IMAGE_BYTES, type ImageEntry } from '../types';
import type { Store } from '../state';
import { h } from './dom';

const DRAG_TYPE = 'application/x-egg-id';

export class Sidebar {
  readonly el: HTMLElement;
  private list = h('div', { class: 'list' });
  private footer = h('div', { class: 'sidebar-footer' });
  private items = new Map<string, HTMLElement>();
  private dragId: string | null = null;

  constructor(private store: Store) {
    this.el = h('aside', { class: 'sidebar' }, this.list, this.footer);
    store.on((k) => {
      if (k === 'list') this.render();
      if (k === 'selection') this.syncSelection();
    });
    this.list.addEventListener('dragover', (e) => this.onDragOver(e));
    this.list.addEventListener('drop', (e) => this.onDrop(e));
    this.list.addEventListener('dragleave', () => this.clearMarkers());
    this.render();
  }

  private render() {
    const s = this.store;
    const editing = this.list.querySelector('input');
    if (editing) return; // don't clobber an inline rename in progress
    this.list.replaceChildren();
    this.items.clear();
    if (!s.images.length) {
      this.list.append(
        h(
          'div',
          { class: 'list-empty' },
          'No images yet.',
          h('br'),
          'Drop photos or a folder anywhere, or use ',
          h('b', {}, 'Add images'),
          '.',
        ),
      );
    }
    for (const e of s.images) {
      const el = this.item(e);
      this.items.set(e.id, el);
      this.list.append(el);
    }
    const inc = s.included().length;
    this.footer.replaceChildren(
      h('strong', {}, String(inc)),
      ` of ${s.images.length} included · `,
      h('strong', {}, `${((inc * IMAGE_BYTES) / 1024).toFixed(1)} KB`),
      ' flash',
    );
    this.syncSelection();
  }

  private item(e: ImageEntry): HTMLElement {
    const img = h('img', { class: 'thumb', alt: '', draggable: false });
    void this.store.thumbUrl(e.id).then((u) => u && (img.src = u));
    const name = h('div', { class: 'name', title: `${e.name}\n${e.fileName}` }, e.name);
    name.addEventListener('dblclick', (ev) => {
      ev.stopPropagation();
      this.startRename(e, name);
    });
    const el = h(
      'div',
      {
        class: `item ${e.status === 'excluded' ? 'excluded' : ''}`,
        draggable: true,
        onclick: () => this.store.select(e.id),
      },
      img,
      h('div', { class: 'meta' }, name, h('div', { class: `badge ${e.status}` }, e.status)),
      h(
        'div',
        { class: 'actions' },
        h(
          'button',
          {
            title: e.status === 'excluded' ? 'Include (X)' : 'Exclude (X)',
            onclick: (ev: Event) => {
              ev.stopPropagation();
              this.store.toggleStatus(e.id, 'excluded');
            },
          },
          e.status === 'excluded' ? 'incl' : 'excl',
        ),
        h(
          'button',
          {
            title: 'Remove from project',
            onclick: (ev: Event) => {
              ev.stopPropagation();
              void this.store.remove(e.id);
            },
          },
          '✕',
        ),
      ),
    );
    el.addEventListener('dragstart', (ev) => {
      this.dragId = e.id;
      ev.dataTransfer!.setData(DRAG_TYPE, e.id);
      ev.dataTransfer!.effectAllowed = 'move';
    });
    el.addEventListener('dragend', () => {
      this.dragId = null;
      this.clearMarkers();
    });
    return el;
  }

  startRename(e: ImageEntry, nameEl?: HTMLElement) {
    nameEl ??= this.items.get(e.id)?.querySelector('.name') as HTMLElement | undefined;
    if (!nameEl) return;
    const input = h('input', { type: 'text', value: e.name });
    let done = false;
    const finish = (save: boolean) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      input.remove();
      if (save && v) this.store.rename(e.id, v);
      this.render();
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') finish(true);
      if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    input.addEventListener('click', (ev) => ev.stopPropagation());
    nameEl.replaceChildren(input);
    input.focus();
    input.select();
  }

  private syncSelection() {
    for (const [id, el] of this.items) {
      const sel = id === this.store.selectedId;
      el.classList.toggle('selected', sel);
      if (sel) el.scrollIntoView({ block: 'nearest' });
    }
  }

  private clearMarkers() {
    for (const el of this.items.values()) el.classList.remove('drop-before', 'drop-after');
  }

  private target(ev: DragEvent): { id: string; after: boolean } | null {
    const el = (ev.target as HTMLElement).closest('.item') as HTMLElement | null;
    if (!el) return null;
    const id = [...this.items].find(([, v]) => v === el)?.[0];
    if (!id) return null;
    const r = el.getBoundingClientRect();
    return { id, after: ev.clientY > r.top + r.height / 2 };
  }

  private onDragOver(ev: DragEvent) {
    if (!this.dragId) return;
    ev.preventDefault();
    ev.stopPropagation();
    this.clearMarkers();
    const t = this.target(ev);
    if (t) this.items.get(t.id)!.classList.add(t.after ? 'drop-after' : 'drop-before');
  }

  private onDrop(ev: DragEvent) {
    if (!this.dragId) return;
    ev.preventDefault();
    ev.stopPropagation();
    const t = this.target(ev);
    const id = this.dragId;
    this.clearMarkers();
    this.dragId = null;
    if (!t || t.id === id) return;
    const imgs = this.store.images;
    const from = imgs.findIndex((i) => i.id === id);
    let to = imgs.findIndex((i) => i.id === t.id) + (t.after ? 1 : 0);
    if (from < to) to--;
    this.store.move(id, to);
  }
}
