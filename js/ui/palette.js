// palette.js — shared command palette / quick find overlay.
// The caller supplies a synchronous `source(query)` returning items shaped as
// { label, meta, shortcut, iconHtml, data }.

let overlay = null;
let input = null;
let results = null;
let hintEl = null;
let state = null;

function ensure() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'palette-overlay';
  overlay.className = 'palette-overlay hidden';
  const box = document.createElement('div');
  box.className = 'palette-box';
  input = document.createElement('input');
  input.id = 'palette-input';
  input.className = 'palette-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  results = document.createElement('div');
  results.id = 'palette-results';
  results.className = 'palette-results';
  hintEl = document.createElement('div');
  hintEl.className = 'palette-hint';
  box.appendChild(input);
  box.appendChild(results);
  box.appendChild(hintEl);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) hidePalette();
  });
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); pickActive(); }
    else if (e.key === 'Escape') { e.preventDefault(); hidePalette(); }
  });
}

function move(delta) {
  if (!state || !state.items.length) return;
  state.index = (state.index + delta + state.items.length) % state.items.length;
  paintActive();
}

function paintActive() {
  if (!state || !state.items.length) return;
  [...results.children].forEach((el, i) => {
    el.classList.toggle('active', i === state.index);
  });
  const active = results.children[state.index];
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function pickActive() {
  if (!state || !state.items.length) return;
  const item = state.items[state.index];
  pick(item);
}

function pick(item) {
  const cb = state && state.onPick;
  hidePalette();
  if (cb) cb(item);
}

function refresh() {
  if (!state) return;
  let items = [];
  try { items = state.source(input.value) || []; } catch { items = []; }
  state.items = items;
  state.index = 0;
  results.innerHTML = '';
  for (const item of items) {
    const row = document.createElement('div');
    row.className = 'palette-item';
    if (item.iconHtml) {
      const icon = document.createElement('span');
      icon.className = 'palette-icon';
      icon.innerHTML = item.iconHtml;
      row.appendChild(icon);
    }
    const text = document.createElement('span');
    text.className = 'palette-text';
    const label = document.createElement('span');
    label.className = 'palette-label';
    label.textContent = item.label || '';
    text.appendChild(label);
    if (item.meta) {
      const meta = document.createElement('span');
      meta.className = 'palette-meta';
      meta.textContent = item.meta;
      text.appendChild(meta);
    }
    row.appendChild(text);
    if (item.shortcut) {
      const sc = document.createElement('span');
      sc.className = 'palette-shortcut';
      sc.textContent = item.shortcut;
      row.appendChild(sc);
    }
    row.addEventListener('mouseenter', () => { state.index = items.indexOf(item); paintActive(); });
    row.addEventListener('click', () => pick(item));
    results.appendChild(row);
  }
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'palette-empty';
    empty.textContent = '无匹配结果';
    results.appendChild(empty);
  }
  paintActive();
}

export function showPalette({ placeholder = '', hint = '', source, onPick }) {
  ensure();
  state = { source, onPick, items: [], index: 0 };
  input.value = '';
  input.placeholder = placeholder;
  hintEl.textContent = hint || '↑↓ 选择 · Enter 打开 · Esc 关闭';
  overlay.classList.remove('hidden');
  refresh();
  requestAnimationFrame(() => input.focus());
}

export function hidePalette() {
  if (!overlay) return;
  overlay.classList.add('hidden');
  state = null;
  if (input) input.value = '';
}

export function isPaletteOpen() {
  return !!overlay && !overlay.classList.contains('hidden');
}
