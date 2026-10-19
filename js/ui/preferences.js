// preferences.js — persisted editor/export preferences and the preferences dialog.

const KEY = 'openuml-preferences';

export const DEFAULT_PREFERENCES = {
  gridSize: 10,
  showGrid: true,
  snapToGrid: true,
  theme: 'light',
  exportScale: 2,
  transparentBackground: false,
  autoResize: true,
  panels: { sidebar: true, navigator: true, toolbox: true, toolbar: true, statusbar: true },
};

export function loadPreferences() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; }
  const legacyTheme = localStorage.getItem('openuml-theme');
  const prefs = { ...DEFAULT_PREFERENCES, ...(saved || {}) };
  prefs.panels = { ...DEFAULT_PREFERENCES.panels, ...((saved && saved.panels) || {}) };
  if (!saved || !saved.theme) {
    if (legacyTheme === 'dark' || legacyTheme === 'light') prefs.theme = legacyTheme;
  }
  if (![5, 10, 20].includes(Number(prefs.gridSize))) prefs.gridSize = DEFAULT_PREFERENCES.gridSize;
  if (![1, 2, 3].includes(Number(prefs.exportScale))) prefs.exportScale = DEFAULT_PREFERENCES.exportScale;
  return prefs;
}

export function savePreferences(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* best effort */ }
}

function row(parent, labelText, input) {
  const r = document.createElement('div');
  r.className = 'pref-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  r.appendChild(label);
  r.appendChild(input);
  parent.appendChild(r);
  return r;
}

function section(parent, title) {
  const sec = document.createElement('div');
  sec.className = 'pref-section';
  const h = document.createElement('div');
  h.className = 'pref-section-title';
  h.textContent = title;
  sec.appendChild(h);
  parent.appendChild(sec);
  return sec;
}

function select(options, value) {
  const el = document.createElement('select');
  for (const [v, text] of options) {
    const o = document.createElement('option');
    o.value = String(v);
    o.textContent = text;
    if (String(v) === String(value)) o.selected = true;
    el.appendChild(o);
  }
  return el;
}

function checkbox(value) {
  const el = document.createElement('input');
  el.type = 'checkbox';
  el.checked = !!value;
  return el;
}

export function showPreferencesDialog(current = DEFAULT_PREFERENCES) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('dialog-overlay');
    const box = document.getElementById('dialog-box');
    document.getElementById('dialog-title').textContent = '偏好设置';
    const body = document.getElementById('dialog-body');
    body.innerHTML = '';

    const gridSec = section(body, '网格');
    const gridSize = select([[5, '5 px'], [10, '10 px'], [20, '20 px']], current.gridSize);
    row(gridSec, '网格大小', gridSize);
    const showGrid = checkbox(current.showGrid);
    row(gridSec, '显示网格', showGrid);
    const snap = checkbox(current.snapToGrid);
    row(gridSec, '吸附到网格', snap);

    const lookSec = section(body, '外观');
    const theme = select([['light', '浅色'], ['dark', '深色']], current.theme);
    row(lookSec, '主题', theme);

    const exportSec = section(body, '导出');
    const scale = select([[1, '1×'], [2, '2×'], [3, '3×']], current.exportScale);
    row(exportSec, 'PNG / JPEG 缩放', scale);
    const transparent = checkbox(current.transparentBackground);
    row(exportSec, '透明背景（PNG / SVG）', transparent);

    const panelSec = section(body, '面板');
    const panelChecks = {};
    for (const [key, label] of [['sidebar', '侧栏'], ['navigator', '导航器'],
      ['toolbox', '工具箱'], ['toolbar', '工具栏'], ['statusbar', '状态栏']]) {
      const box = checkbox(current.panels ? current.panels[key] !== false : true);
      panelChecks[key] = box;
      row(panelSec, label, box);
    }

    const editSec = section(body, '编辑器');
    const autoResize = checkbox(current.autoResize);
    row(editSec, '自动调整类/枚举框尺寸', autoResize);
    const hint = document.createElement('div');
    hint.className = 'pref-hint';
    hint.textContent = '关闭后，新增成员可能被现有尺寸裁切；手动调整尺寸始终可用。';
    editSec.appendChild(hint);

    const buttons = document.getElementById('dialog-buttons');
    buttons.innerHTML = '';
    const reset = document.createElement('button');
    reset.className = 'btn';
    reset.textContent = '恢复默认';
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = '取消';
    const apply = document.createElement('button');
    apply.className = 'btn primary';
    apply.textContent = '应用';
    buttons.appendChild(reset);
    buttons.appendChild(cancel);
    buttons.appendChild(apply);

    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); }
    };
    const close = (value) => {
      document.removeEventListener('keydown', onKey);
      overlay.classList.add('hidden');
      resolve(value);
    };
    document.addEventListener('keydown', onKey);
    const collect = () => ({
      gridSize: parseInt(gridSize.value, 10),
      showGrid: showGrid.checked,
      snapToGrid: snap.checked,
      theme: theme.value,
      exportScale: parseInt(scale.value, 10),
      transparentBackground: transparent.checked,
      autoResize: autoResize.checked,
      panels: Object.fromEntries(Object.entries(panelChecks).map(([k, el]) => [k, el.checked])),
    });
    cancel.onclick = () => close(null);
    apply.onclick = () => close(collect());
    reset.onclick = () => {
      gridSize.value = String(DEFAULT_PREFERENCES.gridSize);
      showGrid.checked = DEFAULT_PREFERENCES.showGrid;
      snap.checked = DEFAULT_PREFERENCES.snapToGrid;
      theme.value = DEFAULT_PREFERENCES.theme;
      scale.value = String(DEFAULT_PREFERENCES.exportScale);
      transparent.checked = DEFAULT_PREFERENCES.transparentBackground;
      autoResize.checked = DEFAULT_PREFERENCES.autoResize;
      for (const [k, el] of Object.entries(panelChecks)) el.checked = DEFAULT_PREFERENCES.panels[k] !== false;
    };
    overlay.classList.remove('hidden');
    apply.focus();
  });
}
