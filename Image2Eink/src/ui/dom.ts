type Attrs = Record<string, unknown>;
type Child = Node | string | null | undefined | false;

/** Tiny hyperscript helper. Keys starting with "on" become event listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'class') el.className = String(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let toastTimer = 0;
export function toast(msg: string, error = false, ms = 3200) {
  let t = document.querySelector<HTMLDivElement>('.toast');
  if (!t) document.body.append((t = h('div', { class: 'toast' })));
  t.textContent = msg;
  t.classList.toggle('error', error);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), ms);
}

export function showDialog(build: (close: () => void) => Node[]): HTMLDialogElement {
  const d = h('dialog');
  const close = () => {
    d.close();
    d.remove();
  };
  d.append(...build(close));
  d.addEventListener('close', () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}

export function confirmDialog(title: string, message: string, ok = 'OK'): Promise<boolean> {
  return new Promise((res) => {
    showDialog((close) => [
      h('h2', {}, title),
      h('p', { style: { color: 'var(--muted)', maxWidth: '420px' } }, message),
      h(
        'div',
        { class: 'dlg-actions' },
        h('button', { onclick: () => (close(), res(false)) }, 'Cancel'),
        h('button', { class: 'primary', onclick: () => (close(), res(true)) }, ok),
      ),
    ]).addEventListener('cancel', () => res(false));
  });
}

export function isTyping(ev: KeyboardEvent): boolean {
  const t = ev.target as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
  if (t.tagName === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['range', 'checkbox', 'button', 'radio'].includes(type);
  }
  return false;
}
