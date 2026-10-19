// main.js — application bootstrap and wiring

import { repository } from './core/repository.js';
import { commandStack, compound, serializeProject, deserializeProject } from './core/commands.js';
import {
  createProject, createDiagram, createModel, createNodeView,
} from './core/factory.js';
import { diagramIcon, ModelKinds } from './core/metamodel.js';
import { DiagramCanvas } from './views/canvas.js';
import { initToolbox } from './ui/toolbox.js';
import { ModelExplorer } from './ui/model-explorer.js';
import { PropertyEditor } from './ui/property-editor.js';
import { buildMenu, showContextMenu } from './ui/menubar.js';
import { showInputDialog, showConfirmDialog, showAboutDialog, showAlertDialog } from './ui/dialogs.js';
import { showPalette, hidePalette, isPaletteOpen } from './ui/palette.js';
import { showToast } from './ui/toast.js';
import { validateProject } from './core/validator.js';
import { showValidationDialog } from './ui/validation-panel.js';
import { loadPreferences, savePreferences, showPreferencesDialog } from './ui/preferences.js';
import { downloadPNG, downloadSVG, downloadJPEG, copyDiagramPNG, printDiagram, downloadPDF, buildPDF, diagramToSVG } from './exporter.js';
import { TEMPLATES, applyTemplate } from './ui/templates.js';
import { convertMdj } from './io/mdj.js';
import { initPluginApi } from './plugins.js';
import { generate, CODEGEN_TEMPLATES } from './codegen.js';
import { t, setLang, availableLangs, getLang } from './ui/i18n.js';

const DIAGRAM_TYPE_LABELS = {
  UMLClassDiagram: '类图', UMLUseCaseDiagram: '用例图', UMLSequenceDiagram: '序列图',
  UMLStatechartDiagram: '状态机图', UMLActivityDiagram: '活动图',
  UMLComponentDiagram: '组件图', UMLDeploymentDiagram: '部署图',
  UMLPackageDiagram: '包图', UMLCommunicationDiagram: '通信图',
  UMLObjectDiagram: '对象图', UMLCompositeStructureDiagram: '复合结构图',
  UMLTimingDiagram: '时序图', UMLInteractionOverviewDiagram: '交互概览图',
  UMLInformationFlowDiagram: '信息流图', UMLProfileDiagram: 'Profile 图',
};

function diagramTypeLabel(type) {
  return DIAGRAM_TYPE_LABELS[type] || '';
}

const app = {
  canvas: null,
  explorer: null,
  editor: null,
  openDiagrams: [],     // diagram nodes currently open (tabs)
  activeDiagram: null,
  filePath: null,
  fileHandle: null,     // File System Access handle for direct re-save
  dirty: false,
  theme: 'light',
  prefs: null,
  suspendTabPersist: false,
  lastAutosave: 0,
};

const PROJECT_KEY = 'openuml-project';
const TABS_KEY = 'openuml-tabs';
let autosaveTimer = null;
let storageWarned = false;

function storageErrorMessage(err) {
  const quota = err && (err.name === 'QuotaExceededError'
    || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || err.code === 22 || err.code === 1014);
  return {
    quota,
    message: quota
      ? '浏览器本地存储已满（通常约 5MB）。请使用「文件 → 项目另存为…」导出 .ouml 文件，或清理站点数据后重试。'
      : '浏览器本地存储不可用。请使用「文件 → 项目另存为…」导出 .ouml 文件，避免丢失更改。',
  };
}

/** Persist the project, warning once if the browser refuses the write. */
function storeProject(json, { quiet = false } = {}) {
  try {
    localStorage.setItem(PROJECT_KEY, json);
    return true;
  } catch (err) {
    app.canvas?.setStatusMessage('本地暂存失败：请使用「项目另存为…」导出');
    if (!storageWarned) {
      storageWarned = true;
      const info = storageErrorMessage(err);
      showAlertDialog({ title: info.quota ? '本地暂存失败' : '本地暂存不可用', message: info.message });
    } else if (!quiet) {
      app.canvas?.setStatusMessage('保存失败：本地存储不可用');
    }
    return false;
  }
}

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null;
    if (!repository.root) return;
    const json = serializeProject(repository.root);
    if (storeProject(json, { quiet: true })) app.lastAutosave = Date.now();
  }, 1000);
}

function persistTabs() {
  if (app.suspendTabPersist) return;
  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({
      root: repository.root?._id || null,
      open: app.openDiagrams.map((d) => d._id),
      active: app.activeDiagram?._id || null,
    }));
  } catch { /* tab state is best-effort */ }
}

/** Restore the tab list if it belongs to the currently loaded project. */
function restoreTabs() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(TABS_KEY) || 'null'); } catch { return false; }
  if (!saved || saved.root !== repository.root?._id || !Array.isArray(saved.open)) return false;
  const diagrams = saved.open
    .map((id) => repository.lookup(id))
    .filter((d) => d && d.type?.endsWith('Diagram') && d.__parent);
  if (!diagrams.length) return false;
  const active = diagrams.find((d) => d._id === saved.active) || diagrams[0];
  app.suspendTabPersist = true;
  app.openDiagrams = [];
  for (const d of diagrams) openDiagram(d);
  openDiagram(active);
  app.suspendTabPersist = false;
  persistTabs();
  return true;
}

function setTheme(t) {
  app.theme = t === 'dark' ? 'dark' : 'light';
  if (app.theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  localStorage.setItem('openuml-theme', app.theme);
  if (app.prefs) { app.prefs.theme = app.theme; savePreferences(app.prefs); }
  buildMenus();
}

function toggleGrid() {
  app.canvas.showGrid = !app.canvas.showGrid;
  app.prefs.showGrid = app.canvas.showGrid;
  savePreferences(app.prefs);
  document.getElementById('tb-grid')?.classList.toggle('active', app.canvas.showGrid);
  app.canvas.requestRender();
  buildMenus();
}

function toggleSnap() {
  app.canvas.snapToGrid = !app.canvas.snapToGrid;
  app.prefs.snapToGrid = app.canvas.snapToGrid;
  savePreferences(app.prefs);
  document.getElementById('tb-snap')?.classList.toggle('active', app.canvas.snapToGrid);
  buildMenus();
}

const PANEL_IDS = {
  sidebar: ['sidebar', 'sidebar-resizer'],
  navigator: ['navigator', 'navigator-resizer'],
  toolbox: ['toolbox-holder'],
  toolbar: ['toolbar'],
  statusbar: ['statusbar'],
};

function applyPanels() {
  const panels = app.prefs?.panels || {};
  for (const [key, ids] of Object.entries(PANEL_IDS)) {
    const visible = panels[key] !== false;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) el.style.display = visible ? '' : 'none';
    }
  }
  window.dispatchEvent(new Event('resize'));
}

function togglePanel(key) {
  if (!app.prefs) return;
  app.prefs.panels = { ...(app.prefs.panels || {}) };
  app.prefs.panels[key] = app.prefs.panels[key] === false;
  savePreferences(app.prefs);
  applyPanels();
  buildMenus();
}

function applyPreferences(next) {
  const prevLang = app.prefs?.lang;
  app.prefs = {
    ...app.prefs,
    ...next,
    panels: { ...(app.prefs?.panels || {}), ...(next.panels || {}) },
  };
  const c = app.canvas;
  c.gridSize = app.prefs.gridSize;
  c.showGrid = app.prefs.showGrid;
  c.snapToGrid = app.prefs.snapToGrid;
  c.autoResize = app.prefs.autoResize;
  document.getElementById('tb-grid')?.classList.toggle('active', c.showGrid);
  document.getElementById('tb-snap')?.classList.toggle('active', c.snapToGrid);
  applyPanels();
  setTheme(app.prefs.theme);
  if (app.prefs.lang && (app.prefs.lang !== prevLang || app.prefs.lang !== getLang())) {
    setLang(app.prefs.lang);
    buildMenus();
    initToolbox(c);
  }
  savePreferences(app.prefs);
  c.requestRender();
}

async function editPreferences() {
  const next = await showPreferencesDialog(app.prefs);
  if (!next) return;
  applyPreferences(next);
  showToast('偏好设置已应用');
}

// ---------------- project lifecycle ----------------

function newProject() {
  repository.root = createProject();
  repository._index = new Map();
  repository.walk((n) => repository._index.set(n._id, n));
  app.openDiagrams = [];
  app.filePath = null;
  try { localStorage.removeItem(TABS_KEY); } catch { /* ignore */ }
  markDirty(false);
  commandStack.undoStack.length = 0;
  commandStack.redoStack.length = 0;
  const firstDiagram = findFirstDiagram(repository.root);
  openDiagram(firstDiagram);
  app.explorer.expanded.clear();
  app.explorer.expanded.add(repository.root._id);
  app.explorer.render();
  repository.select([]);
  // persist the empty project immediately so a refresh does not resurrect the old one
  storeProject(serializeProject(repository.root), { quiet: true });
  app.canvas.setStatusMessage('已新建项目');
}

function findFirstDiagram(node) {
  let found = null;
  repository.walk((n) => {
    if (!found && n.type?.endsWith('Diagram')) found = n;
  });
  return found;
}

function markDirty(v = true) {
  app.dirty = v;
  document.getElementById('modified-indicator').textContent = v ? '●' : '';
}

// ---------------- diagrams / tabs ----------------

function openDiagram(diagram) {
  if (!diagram) return;
  if (!app.openDiagrams.includes(diagram)) app.openDiagrams.push(diagram);
  app.activeDiagram = diagram;
  app.canvas.setDiagram(diagram);
  app.explorer.ensureExpanded(diagram._id);
  renderTabs();
  app.explorer.render();
  repository.select([]);
  persistTabs();
}

// interaction overview: double-click a ref frame / inline interaction to open
// (or create) the interaction as an editable sequence-diagram tab
document.addEventListener('open-interaction', (e) => {
  const name = (e.detail?.name || '').trim();
  if (!name) return;
  let target = null;
  repository.walk((n) => {
    if (!target && n.type?.endsWith('Diagram') && (n.name || '') === name) target = n;
  });
  if (!target) {
    const parent = repository.lookup(e.detail?.parentId)?.__parent || repository.root;
    target = createDiagram('UMLSequenceDiagram', name);
    commandStack.exec({
      label: 'add diagram',
      redo: () => repository.addChild(parent, target),
      undo: () => repository.removeChild(target),
    });
  }
  openDiagram(target);
  app.canvas.setStatusMessage(`已打开交互「${name}」`);
});

function closeDiagram(diagram) {
  const i = app.openDiagrams.indexOf(diagram);
  if (i < 0) return;
  app.openDiagrams.splice(i, 1);
  if (app.activeDiagram === diagram) {
    const next = app.openDiagrams[Math.max(0, i - 1)];
    if (next) openDiagram(next);
    else {
      app.activeDiagram = null;
      app.canvas.setDiagram(null);
      renderTabs();
      persistTabs();
    }
  } else {
    renderTabs();
    persistTabs();
  }
}

function closeCurrentDiagram() {
  if (app.activeDiagram) closeDiagram(app.activeDiagram);
}

function closeOtherDiagrams() {
  if (!app.activeDiagram) return;
  app.openDiagrams = [app.activeDiagram];
  renderTabs();
  persistTabs();
}

function closeAllDiagrams() {
  app.openDiagrams = [];
  app.activeDiagram = null;
  app.canvas.setDiagram(null);
  renderTabs();
  persistTabs();
}

function cycleDiagram(delta) {
  if (app.openDiagrams.length < 2) return;
  const i = app.openDiagrams.indexOf(app.activeDiagram);
  const next = app.openDiagrams[(i + delta + app.openDiagrams.length) % app.openDiagrams.length];
  if (next) openDiagram(next);
}

function renderTabs() {
  const holder = document.getElementById('editor-tabs');
  holder.innerHTML = '';
  for (const d of app.openDiagrams) {
    const tab = document.createElement('div');
    tab.className = 'editor-tab' + (d === app.activeDiagram ? ' active' : '');
    tab.innerHTML = `<span class="etab-ic">${diagramIcon(d.type)}</span><span class="etab-name">${esc(d.name)}</span>`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = (e) => { e.stopPropagation(); closeDiagram(d); };
    tab.appendChild(closeBtn);
    tab.onclick = () => openDiagram(d);
    tab.ondblclick = () => renameElement(d);
    holder.appendChild(tab);
  }
  // left working-diagrams list
  const list = document.getElementById('diagram-tabs');
  list.innerHTML = '';
  const diagrams = [];
  repository.walk((n) => { if (n.type?.endsWith('Diagram')) diagrams.push(n); });
  for (const d of diagrams) {
    const row = document.createElement('div');
    row.className = 'diagram-tab' + (d === app.activeDiagram ? ' active' : '');
    const typeName = diagramTypeLabel(d.type);
    row.innerHTML = `<span class="tab-icon">${diagramIcon(d.type)}</span><span>${esc(d.name)}</span>` + (typeName && d !== app.activeDiagram ? `<span class="tab-type">${typeName}</span>` : '');
    row.onclick = () => openDiagram(d);
    row.ondblclick = () => renameElement(d);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = (e) => { e.stopPropagation(); removeDiagram(d); };
    row.appendChild(closeBtn);
    list.appendChild(row);
  }
}

async function removeDiagram(d) {
  const ok = await showConfirmDialog({ title: '删除图表', message: `确定要删除图表 <b>${esc(d.name)}</b> 吗？` });
  if (!ok) return;
  commandStack.exec({
    label: 'delete diagram',
    redo: () => repository.removeChild(d),
    undo: () => repository.addChild(d.__parent, d),
  });
  closeDiagram(d);
}

async function renameElement(node) {
  const v = await showInputDialog({ title: '重命名', label: '新名称', value: node.name || '' });
  if (v === null || v === '') return;
  const old = node.name;
  commandStack.exec({
    label: 'rename',
    redo: () => { node.name = v; },
    undo: () => { node.name = old; },
  });
  renderTabs();
}

// ---------------- add diagram / model ----------------

function addDiagram(type) {
  const owner = app.explorer && repository.selectedModel ? ownerFor(repository.selectedModel) : repository.root.ownedElements[0];
  const names = {
    UMLClassDiagram: 'ClassDiagram',
    UMLUseCaseDiagram: 'UseCaseDiagram',
    UMLSequenceDiagram: 'SequenceDiagram',
    UMLStatechartDiagram: 'StatechartDiagram',
    UMLActivityDiagram: 'ActivityDiagram',
    UMLComponentDiagram: 'ComponentDiagram',
    UMLDeploymentDiagram: 'DeploymentDiagram',
    UMLPackageDiagram: 'PackageDiagram',
    UMLCommunicationDiagram: 'CommunicationDiagram',
    UMLObjectDiagram: 'ObjectDiagram',
    UMLCompositeStructureDiagram: 'CompositeStructure',
    UMLTimingDiagram: 'TimingDiagram',
    UMLInteractionOverviewDiagram: 'InteractionOverview',
    UMLInformationFlowDiagram: 'InformationFlow',
    UMLProfileDiagram: 'Profile',
  };
  const d = createDiagram(type, names[type] || 'Model');
  commandStack.exec({
    label: 'add diagram',
    redo: () => repository.addChild(owner, d),
    undo: () => repository.removeChild(d),
  });
  app.explorer.expandTo(d);
  openDiagram(d);
}

function ownerFor(node) {
  // add under the selected model, or its nearest Model/Package ancestor
  let n = node;
  while (n) {
    if (n.type === 'Model' || n.type === 'Package') return n;
    n = n.__parent;
  }
  return repository.root.ownedElements[0] || repository.root;
}

// ---------------- format helpers (align / size / colors) ----------------

function selectedNodeViews() {
  if (!app.canvas.diagram) return [];
  return app.canvas.diagram.elements.filter((v) => !v.isEdge && repository.selections.includes(v._id));
}

function withSelectionViews(fn) {
  const views = selectedNodeViews();
  if (!views.length) return;
  fn(views);
  app.canvas.requestRender();
}

function alignSelected(mode) {
  withSelectionViews((views) => {
    const xs = views.map((v) => v.x), ys = views.map((v) => v.y);
    const x2 = Math.max(...views.map((v) => v.x + v.width));
    const y2 = Math.max(...views.map((v) => v.y + v.height));
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const centerX = (minX + x2) / 2, centerY = (minY + y2) / 2;
    const moves = views.map((v) => {
      const old = { x: v.x, y: v.y };
      const nx = mode.includes('left') ? minX : mode.includes('hcenter') ? centerX - v.width / 2 : mode.includes('right') ? x2 - v.width : v.x;
      const ny = mode.includes('top') ? minY : mode.includes('vcenter') ? centerY - v.height / 2 : mode.includes('bottom') ? y2 - v.height : v.y;
      return { v, old, nx, ny };
    });
    commandStack.exec({
      label: 'align',
      redo: () => { for (const m of moves) { m.v.x = m.nx; m.v.y = m.ny; } },
      undo: () => { for (const m of moves) { m.v.x = m.old.x; m.v.y = m.old.y; } },
    });
  });
}

function sameSizeMode(mode) {
  withSelectionViews((views) => {
    if (views.length < 2) return;
    const first = views[0];
    const changes = views.slice(1).map((v) => {
      const old = { width: v.width, height: v.height };
      return { v, old, nw: mode.includes('w') ? first.width : old.width, nh: mode.includes('h') ? first.height : old.height };
    });
    commandStack.exec({
      label: 'same size',
      redo: () => { for (const ch of changes) { ch.v.width = ch.nw; ch.v.height = ch.nh; } },
      undo: () => { for (const ch of changes) { ch.v.width = ch.old.width; ch.v.height = ch.old.height; } },
    });
  });
}

function applyColor(prop, value) {
  withSelectionViews((views) => {
    const changes = views.map((v) => ({ v, old: v[prop] || '' }));
    commandStack.exec({
      label: 'set ' + prop,
      redo: () => { for (const ch of changes) ch.v[prop] = value; },
      undo: () => { for (const ch of changes) ch.v[prop] = ch.old; },
    });
  });
}

function pickColor(title, cb) {
  const input = document.createElement('input');
  input.type = 'color';
  input.value = '#ffffff';
  input.style.position = 'fixed';
  input.style.left = '-100px';
  document.body.appendChild(input);
  input.addEventListener('change', () => { cb(input.value); input.remove(); });
  input.addEventListener('blur', () => setTimeout(() => input.remove(), 300));
  input.click();
}

// ---------------- copy / paste / duplicate ----------------

let clipboard = null;   // { json, pasteCount }

function copySelection({ toast = true } = {}) {
  if (!app.canvas.diagram) return false;
  const views = app.canvas.diagram.elements.filter((v) => repository.selections.includes(v._id));
  if (!views.length) return false;
  const viewIds = new Set(views.map((v) => v._id));
  // edges are only copied when both endpoints travel along
  const clipViews = views.filter((v) => {
    if (!v.isEdge) return true;
    if (v.$type === 'UMLAssociationClassLink') return viewIds.has(v.anchorEdge);
    return viewIds.has(v.tail) && viewIds.has(v.head);
  });
  const modelIds = [...new Set(clipViews.map((v) => v.modelRef).filter(Boolean))];
  const models = modelIds.map((id) => repository.lookup(id)).filter((m) => m && m.__parent);
  const container = { _id: '__clip__', type: '__Clip', ownedElements: models, elements: clipViews };
  clipboard = { json: serializeProject(container), pasteCount: 0, count: clipViews.length };
  app.canvas.setStatusMessage(`已复制 ${clipViews.length} 个元素`);
  if (toast) showToast(`已复制 ${clipViews.length} 个元素`);
  return true;
}

function pasteClipboard({ toast = true } = {}) {
  if (!clipboard || !app.canvas.diagram) return;
  // rebuild a private copy with fresh ids, keeping cross-references intact
  const clone = deserializeProject(clipboard.json);
  const idMap = new Map();
  const stack = [clone];
  while (stack.length) {
    const n = stack.pop();
    if (n._id && n._id !== '__clip__') {
      const newId = 'm-' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);
      idMap.set(n._id, newId);
      n._id = newId;
    }
    if (n.ownedElements) for (const k of n.ownedElements) stack.push(k);
    if (n.elements) for (const k of n.elements) stack.push(k);
  }
  const remap = (n) => {
    if (n.modelRef && idMap.has(n.modelRef)) n.modelRef = idMap.get(n.modelRef);
    if (n.tail && idMap.has(n.tail)) n.tail = idMap.get(n.tail);
    if (n.head && idMap.has(n.head)) n.head = idMap.get(n.head);
    if (n.end1ReferenceId && idMap.has(n.end1ReferenceId)) n.end1ReferenceId = idMap.get(n.end1ReferenceId);
    if (n.end2ReferenceId && idMap.has(n.end2ReferenceId)) n.end2ReferenceId = idMap.get(n.end2ReferenceId);
    if (n.container && idMap.has(n.container)) n.container = idMap.get(n.container);
    if (n.anchorEdge && idMap.has(n.anchorEdge)) n.anchorEdge = idMap.get(n.anchorEdge);
  };
  const newModels = (clone.ownedElements || []);
  for (const m of newModels) remap(m);
  for (const m of newModels) m.ownedElements = [];
  // snapshot: addChild in the redo op moves each model out of clone.ownedElements,
  // which IS newModels — the undo closure must iterate a stable copy
  const modelsToPaste = [...newModels];
  const newViews = (clone.elements || []).filter((v) => {
    remap(v);
    return !(v.isEdge && !(repository.lookup(v.tail) && repository.lookup(v.head)));
  });
  const diagram = app.canvas.diagram;
  const dx = 20 + clipboard.pasteCount * 20, dy = 20 + clipboard.pasteCount * 20;
  clipboard.pasteCount += 1;
  const owner = repository.selectedModel ? ownerFor(repository.selectedModel) : model0();
  compound('paste', [
    { redo: () => { for (const m of modelsToPaste) repository.addChild(owner, m); }, undo: () => { for (const m of [...modelsToPaste].reverse()) repository.removeChild(m); } },
    {
      redo: () => {
        for (const v of newViews) { v.x += dx; v.y += dy; diagram.elements.push(v); v.__diagram = diagram; }
        repository._reindex();
      },
      undo: () => {
        for (const v of newViews) {
          const i = diagram.elements.indexOf(v);
          if (i >= 0) diagram.elements.splice(i, 1);
        }
        repository._reindex();
      },
    },
  ]);
  repository.select(newViews.map((v) => v._id), null);
  app.canvas.setStatusMessage(`已粘贴 ${newViews.length} 个元素`);
  if (toast) showToast(`已粘贴 ${newViews.length} 个元素`);
}

function model0() {
  return repository.root.ownedElements[0] || repository.root;
}

function duplicateSelection() {
  if (!copySelection({ toast: false })) return;
  pasteClipboard({ toast: false });
  showToast('已创建副本');
}

function cutSelection() {
  if (!copySelection({ toast: false })) return false;
  const count = clipboard ? clipboard.count : 0;
  app.canvas.deleteSelection();
  app.canvas.setStatusMessage(`已剪切 ${count} 个元素`);
  showToast(`已剪切 ${count} 个元素`);
  return true;
}

function addModelElement(type) {
  const model = createModel(type);
  const owner = repository.selectedModel ? ownerFor(repository.selectedModel) : repository.root.ownedElements[0];
  commandStack.exec({
    label: 'add ' + type,
    redo: () => repository.addChild(owner, model),
    undo: () => repository.removeChild(model),
  });
  app.explorer.expandTo(model);
}

// ---------------- file io ----------------

function saveProject(download = true) {
  // with a File System Access handle (opened via picker / recents), Ctrl+S
  // writes straight back to the original file
  if (!download && app.fileHandle) {
    saveToFile();
    return;
  }
  const json = serializeProject(repository.root);
  const stored = storeProject(json);
  if (download) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = (repository.root.name || 'project') + '.ouml';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  if (download || stored) {
    markDirty(false);
    app.canvas.setStatusMessage(download ? '项目已保存' : '项目已暂存到浏览器');
  } else {
    app.canvas.setStatusMessage('保存失败：请使用「项目另存为…」导出文件');
  }
}

function loadProjectJSON(json) {
  // parse errors and UI-restore errors mean different things to the user;
  // only the former is "无法解析项目文件"
  let root;
  try {
    root = deserializeProject(json);
  } catch (err) {
    alert('无法解析项目文件: ' + err.message);
    return;
  }
  try {
    repository.root = root;
    // rebuild the lookup index over the new tree
    repository._index = new Map();
    repository.walk((n) => repository._index.set(n._id, n));
    app.openDiagrams = [];
    markDirty(false);
    commandStack.undoStack.length = 0;
    commandStack.redoStack.length = 0;
    const d = findFirstDiagram(root);
    app.explorer.expanded.clear();
    app.explorer.expanded.add(root._id);
    for (const top of root.ownedElements || []) app.explorer.expanded.add(top._id);
    app.explorer.render();
    // restore the previously open tabs for this project; fall back to its first diagram
    app.suspendTabPersist = true;
    let restored = false;
    try { restored = restoreTabs(); } finally { app.suspendTabPersist = false; }
    if (!restored) openDiagram(d);
    persistTabs();
    storeProject(serializeProject(repository.root), { quiet: true });
    app.canvas.setStatusMessage('项目已打开');
  } catch (err) {
    // the data is fine — a render-side failure shouldn't read as a bad file
    console.error('项目界面刷新失败', err);
    alert(`项目数据已加载，但界面刷新出错：${err.message}\n请刷新页面（Cmd/Ctrl+R）后重试。`);
  }
}

function openProjectFile() {
  // prefer the File System Access API: keeps a handle for direct re-save and
  // powers the recent-files list (falls back to a plain file input)
  if (window.showOpenFilePicker) {
    openProjectFilePicker();
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ouml,.json';
  input.onchange = () => {
    const f = input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => loadProjectJSON(reader.result);
    reader.readAsText(f);
  };
  input.click();
}

// ---------------- file handles & recent files (File System Access) ----------------

const RECENT_DB = 'openuml-recent';
const RECENT_STORE = 'handles';

function idbTx(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(RECENT_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(RECENT_STORE);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(RECENT_STORE, mode);
      const out = fn(tx.objectStore(RECENT_STORE));
      tx.oncomplete = () => { db.close(); resolve(out?.result !== undefined ? out.result : undefined); };
      tx.onerror = () => reject(tx.error);
    };
  });
}

async function recentPut(name, handle) {
  try { await idbTx('readwrite', (s) => s.put({ handle, at: Date.now() }, name)); } catch { /* private mode */ }
}

async function recentList() {
  try {
    return await new Promise((resolve, reject) => {
      const req = indexedDB.open(RECENT_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(RECENT_STORE);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(RECENT_STORE, 'readonly');
        const store = tx.objectStore(RECENT_STORE);
        const items = [];
        store.openCursor().onsuccess = (ev) => {
          const cur = ev.target.result;
          if (cur) { items.push({ name: cur.key, at: cur.value.at, handle: cur.value.handle }); cur.continue(); }
        };
        tx.oncomplete = () => { db.close(); resolve(items.sort((a, b) => b.at - a.at).slice(0, 8)); };
      };
    });
  } catch {
    return [];
  }
}

async function openRecent(entry) {
  try {
    const handle = entry.handle;
    if (!handle) return;
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      const p = await handle.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted') return;
    }
    const file = await handle.getFile();
    const text = await file.text();
    app.fileHandle = handle;
    loadProjectJSON(text);
    app.canvas.setStatusMessage(`已打开 ${file.name}`);
    buildMenus();
  } catch (err) {
    app.canvas.setStatusMessage(`无法打开 ${entry.name}: ${err.message}`);
  }
}

async function openProjectFilePicker() {
  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'OpenUML Project', accept: { 'application/json': ['.ouml', '.json'] } }],
    });
    const file = await handle.getFile();
    app.fileHandle = handle;
    await recentPut(file.name, handle);
    loadProjectJSON(await file.text());
    app.canvas.setStatusMessage(`已打开 ${file.name}`);
    buildMenus();
  } catch (err) {
    if (err.name !== 'AbortError') app.canvas.setStatusMessage(`打开失败: ${err.message}`);
  }
}

/** Write the project back through the retained file handle (Ctrl+S when available). */
async function saveToFile() {
  if (!app.fileHandle) return false;
  try {
    if ((await app.fileHandle.queryPermission({ mode: 'readwrite' })) !== 'granted') {
      const p = await app.fileHandle.requestPermission({ mode: 'readwrite' });
      if (p !== 'granted') return false;
    }
    const writable = await app.fileHandle.createWritable();
    await writable.write(serializeProject(repository.root));
    await writable.close();
    markDirty(false);
    app.canvas.setStatusMessage(`已保存到 ${app.fileHandle.name}`);
    return true;
  } catch (err) {
    app.canvas.setStatusMessage(`保存失败: ${err.message}`);
    return false;
  }
}

// ---------------- templates ----------------

async function requestNewFromTemplate() {
  if (app.dirty) {
    const ok = await showConfirmDialog({ title: '从模板新建', message: '当前项目有未保存的更改，确定放弃并新建吗？' });
    if (!ok) return;
  }
  const choice = await showTemplateDialog();
  if (!choice) return;
  newProject();
  const { diagrams } = applyTemplate(choice, repository.root);
  commandStack.undoStack.length = 0;
  commandStack.redoStack.length = 0;
  markDirty(true);
  app.explorer.render();
  openDiagram(diagrams[0]);
  storeProject(serializeProject(repository.root), { quiet: true });
  app.canvas.setStatusMessage(`已从模板「${TEMPLATES[choice].label}」创建项目`);
}

function showTemplateDialog() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `<div class="dialog" style="width:420px">
      <div class="dialog-title">从模板新建 (New From Template)</div>
      <div class="dialog-body" id="tpl-list" style="display:flex;flex-direction:column;gap:6px"></div>
      <div class="dialog-actions"><button class="btn" id="tpl-cancel">取消</button></div>
    </div>`;
    document.body.appendChild(overlay);
    const list = overlay.querySelector('#tpl-list');
    for (const [key, tpl] of Object.entries(TEMPLATES)) {
      const row = document.createElement('button');
      row.className = 'btn';
      row.style.cssText = 'text-align:left;display:flex;flex-direction:column;gap:2px';
      row.innerHTML = `<strong>${tpl.label}</strong><span style="font-weight:400;opacity:.75">${tpl.description}</span>`;
      row.onclick = () => { overlay.remove(); resolve(key); };
      list.appendChild(row);
    }
    const close = (v) => { overlay.remove(); resolve(v); };
    overlay.querySelector('#tpl-cancel').onclick = () => close(null);
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(null); });
  });
}

// ---------------- batch export & direct PDF ----------------

async function withEachDiagram(fn) {
  if (!app.activeDiagram) return;
  const original = app.activeDiagram;
  const all = [];
  repository.walk((n) => { if (n.type?.endsWith('Diagram')) all.push(n); });
  let ok = 0;
  for (const d of all) {
    app.canvas.setDiagram(d);
    try { if (await fn(d)) ok++; } catch { /* keep exporting the rest */ }
  }
  app.canvas.setDiagram(original);
  app.canvas.setStatusMessage(`已导出 ${ok}/${all.length} 张图表`);
}

function exportAllSVG() { withEachDiagram((d) => downloadSVG(app.canvas, safeName(d.name) + '.svg')); }
function exportAllPNG() { withEachDiagram((d) => downloadPNG(app.canvas, safeName(d.name) + '.png', app.prefs.exportScale || 2, { transparent: !!app.prefs.transparent })); }
function exportAllJPEG() { withEachDiagram((d) => downloadJPEG(app.canvas, safeName(d.name) + '.jpg', app.prefs.exportScale || 2)); }

async function exportAllPDF() {
  if (!app.activeDiagram) return;
  const original = app.activeDiagram;
  const all = [];
  repository.walk((n) => { if (n.type?.endsWith('Diagram')) all.push(n); });
  const pages = [];
  for (const d of all) {
    app.canvas.setDiagram(d);
    const s = diagramToSVG(app.canvas, { transparent: false });
    if (!s) continue;
    const rendered = await new Promise((resolve) => {
      const img = new Image();
      const blob = new Blob([s], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * (app.prefs.exportScale || 2)));
        cv.height = Math.max(1, Math.round(img.height * (app.prefs.exportScale || 2)));
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
    if (rendered) pages.push({ canvas: rendered, title: d.name });
  }
  app.canvas.setDiagram(original);
  if (!pages.length) { app.canvas.setStatusMessage('没有可导出的图表'); return; }
  const blob = await buildPDF(pages);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (repository.root.name || 'project') + '.pdf';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  app.canvas.setStatusMessage(`已导出 PDF（${pages.length} 页）`);
}

async function exportCurrentPDF() {
  if (!app.activeDiagram) return;
  const ok = await downloadPDF(app.canvas, safeName(app.activeDiagram.name) + '.pdf', app.prefs.exportScale || 2);
  app.canvas.setStatusMessage(ok ? '已导出 PDF' : '导出失败：图表为空');
}

function safeName(s) {
  return String(s || 'diagram').replace(/[\\/:*?"<>|]+/g, '_');
}

// ---------------- code generation ----------------

function openCodegenDialog() {
  const selModels = repository.selections.map((id) => repository.lookup(id)).filter(Boolean);
  const files = generate(selModels.length ? selModels : null);
  if (!files.length) { showToast('项目中没有可生成的类/接口/枚举'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `<div class="dialog" style="width:720px;height:540px;display:flex;flex-direction:column">
    <div class="dialog-title">代码生成 — Java（${files.length} 个文件）</div>
    <div class="dialog-body" style="flex:1;display:flex;flex-direction:column;gap:6px;min-height:0">
      <select id="gen-file" style="align-self:flex-start"></select>
      <textarea id="gen-code" readonly style="flex:1;font-family:monospace;white-space:pre;resize:none"></textarea>
    </div>
    <div class="dialog-actions">
      <button class="btn" id="gen-copy">复制当前文件</button>
      <button class="btn primary" id="gen-download">下载全部</button>
      <button class="btn" id="gen-close">关闭</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const sel2 = overlay.querySelector('#gen-file');
  const code = overlay.querySelector('#gen-code');
  for (const f of files) sel2.appendChild(new Option(f.name, f.name));
  const show = () => { code.value = (files.find((f) => f.name === sel2.value) || files[0]).content; };
  sel2.onchange = show;
  show();
  overlay.querySelector('#gen-copy').onclick = async () => {
    try { await navigator.clipboard.writeText(code.value); showToast('已复制'); } catch { showToast('复制失败'); }
  };
  overlay.querySelector('#gen-download').onclick = () => {
    for (const f of files) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([f.content], { type: 'text/plain' }));
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
    app.canvas.setStatusMessage(`已生成 ${files.length} 个源文件`);
  };
  overlay.querySelector('#gen-close').onclick = () => overlay.remove();
}

// ---------------- selection sync ----------------

function revealInExplorer() {
  const m = repository.selectedModel;
  if (m) { app.explorer.expandTo(m); app.canvas.setStatusMessage(`已在资源管理器中定位 ${m.name || m.type}`); }
}

function locateInDiagram() {
  const m = repository.selectedModel;
  if (!m || !app.activeDiagram) return;
  showInDiagram(m, app.canvas);
}

// ---------------- StarUML .mdj import & .mfj fragments ----------------

async function importMdjFile() {
  if (app.dirty) {
    const ok = await showConfirmDialog({ title: '导入 StarUML', message: '导入将替换当前项目（当前更改未保存）。继续吗？' });
    if (!ok) return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mdj,.json';
  input.onchange = () => {
    const f = input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const mdj = JSON.parse(reader.result);
        const { project, skipped, models, diagrams } = convertMdj(mdj);
        project._id = 'p-' + Math.random().toString(36).slice(2, 10);
        repository.root = project;
        repository._index = new Map();
        repository.walk((n) => repository._index.set(n._id, n));
        app.openDiagrams = [];
        app.fileHandle = null;
        app.explorer.expanded.clear();
        app.explorer.expanded.add(project._id);
        commandStack.undoStack.length = 0;
        commandStack.redoStack.length = 0;
        markDirty(true);
        const first = findFirstDiagram(project);
        if (first) openDiagram(first); else app.canvas.setDiagram(null);
        app.explorer.render();
        storeProject(serializeProject(project), { quiet: true });
        const skipCount = Object.values(skipped).reduce((a, b) => a + b, 0);
        app.canvas.setStatusMessage(`已导入 ${f.name}：${models} 个模型、${diagrams} 张图表`
          + (skipCount ? `（跳过 ${skipCount} 项不支持元素）` : ''));
        showToast(`已导入 ${f.name}`);
      } catch (err) {
        showAlertDialog({ title: '导入失败', message: `无法解析 .mdj 文件: ${err.message}` });
      }
    };
    reader.readAsText(f);
  };
  input.click();
}

/** Export the selected model subtree as a StarUML-style fragment file (.mfj). */
function exportFragment() {
  const sel = repository.selections.map((id) => repository.lookup(id)).filter((m) => m && m.__parent);
  if (!sel.length) { showToast('请先选择要导出的模型元素'); return; }
  const frag = sel.map((m) => serializeProject(m));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(frag, null, 2)], { type: 'application/json' }));
  a.download = (sel[0].name || 'fragment') + '.mfj';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  app.canvas.setStatusMessage(`已导出片段（${sel.length} 个元素）`);
}

/** Import a .mfj fragment: fresh ids, appended to the project root model. */
async function importFragment() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.mfj,.json';
  input.onchange = () => {
    const f = input.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const frag = JSON.parse(reader.result);
        const items = Array.isArray(frag) ? frag : [frag];
        const parent = ownerFor(repository.selectedModel || repository.root);
        const ops = [];
        for (const raw of items) {
          // re-serialize through the clipboard pipeline for fresh ids + remap
          const container = { _id: '__frag__', type: '__Clip', ownedElements: [raw], elements: [] };
          const json = serializeProject(container);
          const clone = deserializeProject(json);
          const stack = [clone];
          const idMap = new Map();
          while (stack.length) {
            const n = stack.pop();
            if (n._id && n._id !== '__frag__') {
              const newId = 'm-' + Math.random().toString(36).slice(2, 10) + '-' + Math.random().toString(36).slice(2, 6);
              idMap.set(n._id, newId);
              n._id = newId;
            }
            if (n.ownedElements) for (const k of n.ownedElements) stack.push(k);
          }
          const remap = (n) => {
            for (const key of ['end1ReferenceId', 'end2ReferenceId', 'tailRoleName', 'headRoleName']) {
              if (n[key] && idMap.has(n[key])) n[key] = idMap.get(n[key]);
            }
            for (const c of n.ownedElements || []) remap(c);
          };
          for (const m of clone.ownedElements || []) remap(m);
          for (const m of clone.ownedElements || []) {
            ops.push({ redo: () => repository.addChild(parent, m), undo: () => repository.removeChild(m) });
          }
        }
        if (!ops.length) { showToast('片段中没有可导入的模型元素'); return; }
        compound('import fragment', ops);
        app.explorer.expandTo(parent);
        app.canvas.setStatusMessage(`已导入片段：${ops.length} 个顶层元素`);
        showToast(`已导入 ${f.name}`);
      } catch (err) {
        showAlertDialog({ title: '导入失败', message: `无法解析 .mfj 文件: ${err.message}` });
      }
    };
    reader.readAsText(f);
  };
  input.click();
}

// ---------------- Markdown documentation editor ----------------

function mdToHtml(src) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const inline = (s) => s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  const lines = esc(src).split(/\r?\n/);
  const out = [];
  let inCode = false, listType = null;
  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  for (const line of lines) {
    if (/^```/.test(line)) { closeList(); out.push(inCode ? '</code></pre>' : '<pre><code>'); inCode = !inCode; continue; }
    if (inCode) { out.push(line); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { closeList(); out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); continue; }
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      const want = ul ? 'ul' : 'ol';
      if (listType !== want) { closeList(); out.push(`<${want}>`); listType = want; }
      out.push(`<li>${inline(ul ? ul[1] : ol[1])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) { out.push(''); continue; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inCode) out.push('</code></pre>');
  closeList();
  return out.join('\n');
}

function openMarkdownEditor() {
  const m = repository.selectedModel;
  if (!m) { showToast('请先选择一个元素'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `<div class="dialog" style="width:760px;height:520px;display:flex;flex-direction:column">
    <div class="dialog-title">文档编辑器 — ${m.name || m.type}（Markdown）</div>
    <div class="dialog-body" style="flex:1;display:flex;gap:8px;min-height:0">
      <textarea id="md-src" style="flex:1;font-family:monospace;resize:none"></textarea>
      <div id="md-view" class="md-view" style="flex:1;border:1px solid var(--border,#ddd);padding:8px;overflow:auto;background:#fff"></div>
    </div>
    <div class="dialog-actions">
      <label style="margin-right:auto;font-size:12px"><input type="checkbox" id="md-live" checked> 实时预览</label>
      <button class="btn" id="md-ok">应用</button>
      <button class="btn" id="md-cancel">关闭</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  const src = overlay.querySelector('#md-src');
  const view = overlay.querySelector('#md-view');
  src.value = m.documentation || '';
  view.innerHTML = mdToHtml(src.value);
  overlay.querySelector('#md-live').onchange = (e) => {
    view.style.display = e.target.checked ? '' : 'none';
  };
  src.addEventListener('input', () => { view.innerHTML = mdToHtml(src.value); });
  overlay.querySelector('#md-ok').onclick = () => {
    const old = m.documentation;
    const next = src.value;
    commandStack.exec({
      label: 'edit documentation',
      redo: () => { m.documentation = next; },
      undo: () => { m.documentation = old; },
    });
    overlay.remove();
  };
  overlay.querySelector('#md-cancel').onclick = () => overlay.remove();
}

// ---------------- quick find / command palette ----------------

async function requestNewProject() {
  if (app.dirty) {
    const ok = await showConfirmDialog({ title: '新建', message: '当前项目有未保存的更改，确定放弃并新建吗？' });
    if (!ok) return;
  }
  newProject();
}

function exportCurrentSVG() {
  if (!app.activeDiagram) return;
  const ok = downloadSVG(app.canvas, app.activeDiagram.name + '.svg', {
    transparent: app.prefs.transparentBackground,
  });
  showToast(ok ? '已导出 SVG' : '当前图表为空', ok ? 'success' : 'error');
}

async function exportCurrentPNG() {
  if (!app.activeDiagram) return;
  const ok = await downloadPNG(app.canvas, app.activeDiagram.name + '.png', app.prefs.exportScale, {
    transparent: app.prefs.transparentBackground,
  });
  showToast(ok ? '已导出 PNG' : '导出失败：当前图表为空', ok ? 'success' : 'error');
}

async function exportCurrentJPEG() {
  if (!app.activeDiagram) return;
  const ok = await downloadJPEG(app.canvas, app.activeDiagram.name + '.jpg', app.prefs.exportScale);
  showToast(ok ? '已导出 JPEG' : '导出失败：当前图表为空', ok ? 'success' : 'error');
}

async function copyCurrentDiagram() {
  if (!app.activeDiagram) return;
  const ok = await copyDiagramPNG(app.canvas, app.prefs.exportScale);
  showToast(ok ? '图表已复制为图片' : '浏览器不允许复制图片，请使用导出', ok ? 'success' : 'error');
}

function printCurrentDiagram() {
  if (app.activeDiagram) printDiagram(app.canvas, app.activeDiagram.name);
}

function findViewForModel(modelId) {
  let found = null;
  repository.walk((n) => {
    if (found || !Array.isArray(n.elements)) return;
    const view = n.elements.find((v) => !v.isEdge && v.modelRef === modelId);
    if (view) found = { diagram: n, view };
  });
  return found;
}

function parentPath(node) {
  const parts = [];
  let p = node.__parent;
  while (p && parts.length < 3) {
    if (p.name && p.type !== 'Project') parts.unshift(p.name);
    p = p.__parent;
  }
  return parts.join(' / ');
}

function quickFindItems(query) {
  const q = query.trim().toLowerCase();
  const items = [];
  repository.walk((n) => {
    if (!n.type || n.type === 'Project') return;
    const isDiagram = n.type.endsWith('Diagram');
    const isModel = !isDiagram && !n.$type && !n.isEdge;
    if (!isDiagram && !isModel) return;
    const name = n.name || '(unnamed)';
    const parent = parentPath(n);
    const typeLabel = isDiagram
      ? (diagramTypeLabel(n.type) || '图表')
      : (ModelKinds[n.type]?.name || n.type.replace(/^UML/, ''));
    const haystack = `${name} ${typeLabel} ${parent}`.toLowerCase();
    if (q && !haystack.includes(q)) return;
    let score = 0;
    if (q) {
      const lower = name.toLowerCase();
      if (lower === q) score = 0;
      else if (lower.startsWith(q)) score = 1;
      else score = 2 + haystack.indexOf(q) / 1000;
    }
    const meta = ModelKinds[n.type];
    items.push({
      label: name,
      meta: [typeLabel, parent].filter(Boolean).join(' · '),
      iconHtml: isDiagram
        ? diagramIcon(n.type)
        : `<span style="color:${meta?.iconColor || '#8a8f8f'}">${meta?.icon || '•'}</span>`,
      data: { node: n, isDiagram },
      score,
      isDiagram,
    });
  });
  items.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.isDiagram !== b.isDiagram) return a.isDiagram ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
  return items.slice(0, 60);
}

function activateQuickFindItem(item) {
  const { node, isDiagram } = item.data;
  if (isDiagram) {
    openDiagram(node);
    return;
  }
  const found = findViewForModel(node._id);
  if (found) {
    openDiagram(found.diagram);
    repository.select([found.view._id], node);
    app.explorer.highlight(node._id);
    return;
  }
  repository.select([], node);
  app.explorer.highlight(node._id);
  app.canvas.setStatusMessage(`${node.name || '元素'} 暂无视图，已定位到模型树`);
}

function openQuickFindPalette() {
  showPalette({
    placeholder: '查找图表或模型元素…',
    hint: '↑↓ 选择 · Enter 定位 · Esc 关闭',
    source: quickFindItems,
    onPick: activateQuickFindItem,
  });
}

function paletteCommands() {
  const hasSel = () => repository.selections.length > 0;
  const hasView = () => !!app.activeDiagram;
  const addDiagramCommands = [
    ['类图', 'UMLClassDiagram'], ['用例图', 'UMLUseCaseDiagram'],
    ['序列图', 'UMLSequenceDiagram'], ['状态机图', 'UMLStatechartDiagram'],
    ['活动图', 'UMLActivityDiagram'], ['组件图', 'UMLComponentDiagram'],
    ['部署图', 'UMLDeploymentDiagram'], ['包图', 'UMLPackageDiagram'],
    ['通信图', 'UMLCommunicationDiagram'], ['对象图', 'UMLObjectDiagram'],
    ['复合结构图', 'UMLCompositeStructureDiagram'], ['时序图 (Timing)', 'UMLTimingDiagram'],
    ['交互概览图', 'UMLInteractionOverviewDiagram'], ['信息流图', 'UMLInformationFlowDiagram'],
    ['Profile 图', 'UMLProfileDiagram'],
  ].map(([label, type]) => ({
    label: `新建${label}`,
    group: '新建图表',
    shortcut: '',
    run: () => addDiagram(type),
  }));

  return [
    { label: '新建项目', group: '文件', shortcut: 'Ctrl+N', run: requestNewProject },
    { label: '打开项目…', group: '文件', shortcut: 'Ctrl+O', run: openProjectFile },
    { label: '保存项目', group: '文件', shortcut: 'Ctrl+S', run: () => saveProject(false) },
    { label: '项目另存为…', group: '文件', shortcut: 'Ctrl+Shift+S', run: () => saveProject(true) },
    { label: '导出为 SVG', group: '文件', enabled: hasView(), run: exportCurrentSVG },
    { label: '导出为 PNG', group: '文件', enabled: hasView(), run: exportCurrentPNG },
    { label: '导出为 JPEG', group: '文件', enabled: hasView(), run: exportCurrentJPEG },
    { label: '复制图表为图片', group: '文件', enabled: hasView(), run: copyCurrentDiagram },
    { label: '打印 / 导出 PDF…', group: '文件', shortcut: 'Ctrl+P', enabled: hasView(), run: printCurrentDiagram },

    { label: '撤销', group: '编辑', shortcut: 'Ctrl+Z', run: () => commandStack.undo() },
    { label: '重做', group: '编辑', shortcut: 'Ctrl+Y', run: () => commandStack.redo() },
    { label: '剪切', group: '编辑', shortcut: 'Ctrl+X', enabled: hasSel(), run: cutSelection },
    { label: '复制', group: '编辑', shortcut: 'Ctrl+C', enabled: hasSel(), run: () => copySelection() },
    { label: '粘贴', group: '编辑', shortcut: 'Ctrl+V', enabled: !!clipboard, run: () => pasteClipboard() },
    { label: '创建副本', group: '编辑', shortcut: 'Ctrl+D', enabled: hasSel(), run: duplicateSelection },
    { label: '从图表删除', group: '编辑', shortcut: 'Del', enabled: hasSel(), run: () => app.canvas.deleteSelection() },
    { label: '删除模型元素', group: '编辑', shortcut: 'Ctrl+Del', enabled: hasSel(), run: () => app.canvas.deleteSelectionDeep() },
    { label: '全选', group: '编辑', shortcut: 'Ctrl+A', run: () => { if (app.activeDiagram) repository.select(app.activeDiagram.elements.map((v) => v._id)); } },
    { label: '取消选择', group: '编辑', shortcut: 'Esc', run: () => repository.select([]) },
    { label: '查找图表或元素…', group: '编辑', shortcut: 'Ctrl+F', run: openQuickFindPalette },
    { label: '偏好设置…', group: '编辑', shortcut: 'Ctrl+,', run: editPreferences },

    ...addDiagramCommands,

    { label: '放大', group: '视图', shortcut: 'Ctrl++', run: () => app.canvas.zoomIn() },
    { label: '缩小', group: '视图', shortcut: 'Ctrl+-', run: () => app.canvas.zoomOut() },
    { label: '适应窗口', group: '视图', shortcut: 'Ctrl+Shift+F', run: () => app.canvas.zoomFit() },
    { label: '实际大小 (100%)', group: '视图', run: () => { app.canvas.zoom = 1; app.canvas._zoomChanged(); } },
    { label: app.canvas.showGrid ? '隐藏网格' : '显示网格', group: '视图', run: toggleGrid },
    { label: app.canvas.snapToGrid ? '关闭吸附网格' : '开启吸附网格', group: '视图', run: toggleSnap },
    { label: app.theme === 'dark' ? '切换浅色主题' : '切换深色主题', group: '视图', run: () => setTheme(app.theme === 'dark' ? 'light' : 'dark') },
    { label: '上一图表', group: '视图', shortcut: 'Ctrl+Alt+PageUp', enabled: app.openDiagrams.length > 1, run: () => cycleDiagram(-1) },
    { label: '下一图表', group: '视图', shortcut: 'Ctrl+Alt+PageDown', enabled: app.openDiagrams.length > 1, run: () => cycleDiagram(1) },
    { label: '关闭当前图表', group: '视图', enabled: hasView(), run: closeCurrentDiagram },
    { label: '关闭其他图表', group: '视图', enabled: hasView(), run: closeOtherDiagrams },
    { label: '关闭全部图表', group: '视图', enabled: hasView(), run: closeAllDiagrams },

    { label: '左对齐', group: '格式', enabled: repository.selections.length >= 2, run: () => alignSelected('left') },
    { label: '水平居中', group: '格式', enabled: repository.selections.length >= 2, run: () => alignSelected('hcenter') },
    { label: '右对齐', group: '格式', enabled: repository.selections.length >= 2, run: () => alignSelected('right') },
    { label: '顶对齐', group: '格式', enabled: repository.selections.length >= 2, run: () => alignSelected('top') },
    { label: '垂直居中', group: '格式', enabled: repository.selections.length >= 2, run: () => alignSelected('vcenter') },
    { label: '底对齐', group: '格式', enabled: repository.selections.length >= 2, run: () => alignSelected('bottom') },
    { label: '宽度相同', group: '格式', enabled: repository.selections.length >= 2, run: () => sameSizeMode('w') },
    { label: '高度相同', group: '格式', enabled: repository.selections.length >= 2, run: () => sameSizeMode('h') },
    { label: '宽高相同', group: '格式', enabled: repository.selections.length >= 2, run: () => sameSizeMode('wh') },
    { label: '填充颜色…', group: '格式', enabled: hasSel(), run: () => pickColor('fill', (v) => applyColor('fillColor', v)) },
    { label: '线条颜色…', group: '格式', enabled: hasSel(), run: () => pickColor('line', (v) => applyColor('lineColor', v)) },
    { label: '字体颜色…', group: '格式', enabled: hasSel(), run: () => pickColor('font', (v) => applyColor('fontColor', v)) },
    { label: '置于顶层', group: '格式', enabled: hasSel(), run: () => app.canvas.bringToFront() },
    { label: '置于底层', group: '格式', enabled: hasSel(), run: () => app.canvas.sendToBack() },

    { label: '验证模型…', group: '模型', run: runValidation },
    { label: '重命名选中元素…', group: '模型', shortcut: 'F2', enabled: !!repository.selectedModel, run: () => renameElement(repository.selectedModel) },
    { label: '关于 OpenUML', group: '帮助', run: showAboutDialog },
    ...pluginCommands,
  ];
}

// commands registered at runtime through the window.openuml plugin API
const pluginCommands = [];

function openCommandPalette() {
  showPalette({
    placeholder: '输入命令…',
    hint: '↑↓ 选择 · Enter 执行 · Esc 关闭',
    source: (query) => {
      const q = query.trim().toLowerCase();
      return paletteCommands()
        .filter((c) => c.enabled !== false)
        .filter((c) => !q || `${c.label} ${c.group}`.toLowerCase().includes(q))
        .map((c) => ({ label: c.label, meta: c.group, shortcut: c.shortcut || '', data: c }));
    },
    onPick: (item) => { const result = item.data.run(); if (result && result.catch) result.catch(() => {}); },
  });
}


function locateIssue(issue) {
  const diagram = issue.diagramId ? repository.lookup(issue.diagramId) : null;
  const view = issue.viewId ? repository.lookup(issue.viewId) : null;
  if (diagram && Array.isArray(diagram.elements)) {
    openDiagram(diagram);
    if (view) {
      const model = repository.lookup(view.modelRef) || (issue.modelId ? repository.lookup(issue.modelId) : null);
      repository.select([view._id], model);
      if (model) app.explorer.highlight(model._id);
      return;
    }
  }
  if (issue.modelId) {
    const model = repository.lookup(issue.modelId);
    const found = findViewForModel(issue.modelId);
    if (found) {
      openDiagram(found.diagram);
      repository.select([found.view._id], model);
      app.explorer.highlight(issue.modelId);
      return;
    }
    repository.select([], model);
    if (model) app.explorer.highlight(model._id);
    app.canvas.setStatusMessage(`${model?.name || '元素'} 已定位到模型树`);
    return;
  }
  if (diagram) openDiagram(diagram);
}

function runValidation() {
  const issues = validateProject(repository);
  showValidationDialog({
    issues,
    onLocate: locateIssue,
    onRevalidate: runValidation,
  });
  if (!issues.length) showToast('模型校验通过', 'success');
}

// ---------------- menus ----------------

async function buildMenus() {
  const sel = () => repository.selectedModel;
  const hasSel = () => repository.selections.length > 0;
  // recent files (File System Access handles persisted in IndexedDB)
  let recentItems = [];
  if (window.indexedDB && window.showOpenFilePicker) {
    try {
      recentItems = (await recentList()).map((r) => ({
        label: r.name,
        action: () => openRecent(r),
      }));
    } catch { /* private mode */ }
  }
  const T = (label) => (typeof label === 'string' ? t(label) : label);
  const tr = (items) => items.map((item) => {
    if (item === '---') return item;
    const out = { ...item, label: T(item.label) };
    if (out.submenu && Array.isArray(out.submenu)) out.submenu = tr(out.submenu);
    return out;
  });
  buildMenu(tr([
    {
      label: '文件', submenu: [
        { label: '新建', shortcut: 'Ctrl+N', action: requestNewProject },
        { label: '从模板新建…', action: requestNewFromTemplate },
        { label: '打开项目…', shortcut: 'Ctrl+O', action: openProjectFile },
        { label: '最近文件', disabled: !recentItems.length, submenu: recentItems.length ? recentItems : [{ label: '（空）', action: () => {} }] },
        { label: '保存项目', shortcut: 'Ctrl+S', action: () => saveProject(false) },
        { label: '项目另存为…', shortcut: 'Ctrl+Shift+S', action: () => saveProject(true) },
        '---',
        { label: '导入 StarUML 项目 (.mdj)…', action: importMdjFile },
        { label: '导出片段 (.mfj)…', disabled: !sel(), action: exportFragment },
        { label: '导入片段 (.mfj)…', action: importFragment },
        '---',
        { label: '导出为 SVG', action: exportCurrentSVG },
        { label: '导出为 PNG', action: exportCurrentPNG },
        { label: '导出为 JPEG', action: exportCurrentJPEG },
        { label: '导出为 PDF（直接导出）', action: exportCurrentPDF },
        { label: '导出全部图表', submenu: [
          { label: '全部导出为 SVG', action: exportAllSVG },
          { label: '全部导出为 PNG', action: exportAllPNG },
          { label: '全部导出为 JPEG', action: exportAllJPEG },
          { label: '全部导出为 PDF', action: exportAllPDF },
        ] },
        { label: '复制图表为图片', action: copyCurrentDiagram },
        { label: '打印 / 导出 PDF…', shortcut: 'Ctrl+P', action: printCurrentDiagram },
      ],
    },
    {
      label: '编辑', submenu: [
        { label: '撤销', shortcut: 'Ctrl+Z', action: () => commandStack.undo() },
        { label: '重做', shortcut: 'Ctrl+Y', action: () => commandStack.redo() },
        '---',
        { label: '全选', shortcut: 'Ctrl+A', action: () => {
          if (app.activeDiagram) repository.select(app.activeDiagram.elements.map((v) => v._id));
        } },
        { label: '取消选择', shortcut: 'Esc', action: () => repository.select([]) },
        '---',
        { label: '剪切', shortcut: 'Ctrl+X', disabled: !hasSel(), action: cutSelection },
        { label: '复制', shortcut: 'Ctrl+C', disabled: !hasSel(), action: () => copySelection() },
        { label: '粘贴', shortcut: 'Ctrl+V', disabled: !clipboard, action: () => pasteClipboard() },
        { label: '创建副本', shortcut: 'Ctrl+D', disabled: !hasSel(), action: () => duplicateSelection() },
        '---',
        { label: '从图表删除', shortcut: 'Del', disabled: !hasSel(), action: () => app.canvas.deleteSelection() },
        { label: '删除模型元素', shortcut: 'Ctrl+Del', disabled: !hasSel(), action: () => app.canvas.deleteSelectionDeep() },
        '---',
        { label: '查找…', shortcut: 'Ctrl+F', action: openQuickFindPalette },
        { label: '命令面板…', shortcut: 'Ctrl+Shift+P', action: openCommandPalette },
        '---',
        { label: '在资源管理器中显示', disabled: !sel(), action: revealInExplorer },
        { label: '在图表中定位', disabled: !sel(), action: locateInDiagram },
        '---',
        { label: '偏好设置…', shortcut: 'Ctrl+,', action: editPreferences },
      ],
    },
    {
      label: '模型', submenu: [
        { label: '添加图表', submenu: [
          { label: '类图 (Class Diagram)', action: () => addDiagram('UMLClassDiagram') },
          { label: '用例图 (UseCase Diagram)', action: () => addDiagram('UMLUseCaseDiagram') },
          { label: '序列图 (Sequence Diagram)', action: () => addDiagram('UMLSequenceDiagram') },
          { label: '状态机图 (Statechart)', action: () => addDiagram('UMLStatechartDiagram') },
          { label: '活动图 (Activity Diagram)', action: () => addDiagram('UMLActivityDiagram') },
          '---',
          { label: '组件图 (Component Diagram)', action: () => addDiagram('UMLComponentDiagram') },
          { label: '部署图 (Deployment Diagram)', action: () => addDiagram('UMLDeploymentDiagram') },
          { label: '包图 (Package Diagram)', action: () => addDiagram('UMLPackageDiagram') },
          { label: '通信图 (Communication Diagram)', action: () => addDiagram('UMLCommunicationDiagram') },
          { label: '对象图 (Object Diagram)', action: () => addDiagram('UMLObjectDiagram') },
          '---',
          { label: '复合结构图 (Composite Structure)', action: () => addDiagram('UMLCompositeStructureDiagram') },
          { label: '时序图 (Timing Diagram)', action: () => addDiagram('UMLTimingDiagram') },
          { label: '交互概览图 (Interaction Overview)', action: () => addDiagram('UMLInteractionOverviewDiagram') },
          { label: '信息流图 (Information Flow)', action: () => addDiagram('UMLInformationFlowDiagram') },
          { label: 'Profile 图 (Profile Diagram)', action: () => addDiagram('UMLProfileDiagram') },
        ] },
        '---',
        { label: '添加类', action: () => addModelElement('UMLClass') },
        { label: '添加接口', action: () => addModelElement('UMLInterface') },
        { label: '添加枚举', action: () => addModelElement('UMLEnumeration') },
        { label: '添加关联类', action: () => addModelElement('UMLAssociationClass') },
        { label: '添加信号', action: () => addModelElement('UMLSignal') },
        { label: '添加原始类型', action: () => addModelElement('UMLPrimitiveType') },
        { label: '添加框架', action: () => addModelElement('UMLFrame') },
        { label: '添加参与者', action: () => addModelElement('UMLActor') },
        { label: '添加用例', action: () => addModelElement('UMLUseCase') },
        { label: '添加包', action: () => addModelElement('UMLPackage') },
        '---',
        { label: '验证模型…', action: runValidation },
        { label: '文档编辑器… (Markdown)', disabled: !sel(), action: openMarkdownEditor },
        { label: '代码生成…', action: openCodegenDialog },
        '---',
        { label: '重命名…', shortcut: 'F2', disabled: !sel(), action: () => sel() && renameElement(sel()) },
      ],
    },
    {
      label: '格式', submenu: [
        { label: '对齐', submenu: [
          { label: '左对齐', disabled: repository.selections.length < 2, action: () => alignSelected('left') },
          { label: '水平居中', disabled: repository.selections.length < 2, action: () => alignSelected('hcenter') },
          { label: '右对齐', disabled: repository.selections.length < 2, action: () => alignSelected('right') },
          '---',
          { label: '顶对齐', disabled: repository.selections.length < 2, action: () => alignSelected('top') },
          { label: '垂直居中', disabled: repository.selections.length < 2, action: () => alignSelected('vcenter') },
          { label: '底对齐', disabled: repository.selections.length < 2, action: () => alignSelected('bottom') },
        ] },
        { label: '大小相同', submenu: [
          { label: '宽度', disabled: repository.selections.length < 2, action: () => sameSizeMode('w') },
          { label: '高度', disabled: repository.selections.length < 2, action: () => sameSizeMode('h') },
          { label: '宽和高', disabled: repository.selections.length < 2, action: () => sameSizeMode('wh') },
        ] },
        '---',
        { label: '填充颜色…', disabled: !hasSel(), action: () => pickColor('fill', (v) => applyColor('fillColor', v)) },
        { label: '线条颜色…', disabled: !hasSel(), action: () => pickColor('line', (v) => applyColor('lineColor', v)) },
        { label: '字体颜色…', disabled: !hasSel(), action: () => pickColor('font', (v) => applyColor('fontColor', v)) },
        '---',
        { label: '置于顶层', disabled: !hasSel(), action: () => app.canvas.bringToFront() },
        { label: '置于底层', disabled: !hasSel(), action: () => app.canvas.sendToBack() },
      ],
    },
    {
      label: '视图', submenu: [
        { label: '放大', shortcut: 'Ctrl++', action: () => app.canvas.zoomIn() },
        { label: '缩小', shortcut: 'Ctrl+-', action: () => app.canvas.zoomOut() },
        { label: '适应窗口', shortcut: 'Ctrl+Shift+F', action: () => app.canvas.zoomFit() },
        { label: '实际大小 (100%)', action: () => { app.canvas.zoom = 1; app.canvas._zoomChanged(); } },
        '---',
        { label: '上一图表', shortcut: 'Ctrl+Alt+PageUp', disabled: app.openDiagrams.length < 2, action: () => cycleDiagram(-1) },
        { label: '下一图表', shortcut: 'Ctrl+Alt+PageDown', disabled: app.openDiagrams.length < 2, action: () => cycleDiagram(1) },
        { label: '关闭当前图表', disabled: !app.activeDiagram, action: closeCurrentDiagram },
        { label: '关闭其他图表', disabled: !app.activeDiagram, action: closeOtherDiagrams },
        { label: '关闭全部图表', disabled: !app.activeDiagram, action: closeAllDiagrams },
        '---',
        { label: '面板', submenu: [
          { label: '侧栏', checked: app.prefs.panels.sidebar !== false, action: () => togglePanel('sidebar') },
          { label: '导航器', checked: app.prefs.panels.navigator !== false, action: () => togglePanel('navigator') },
          { label: '工具箱', checked: app.prefs.panels.toolbox !== false, action: () => togglePanel('toolbox') },
          { label: '工具栏', checked: app.prefs.panels.toolbar !== false, action: () => togglePanel('toolbar') },
          { label: '状态栏', checked: app.prefs.panels.statusbar !== false, action: () => togglePanel('statusbar') },
        ] },
        '---',
        { label: '显示网格', checked: app.canvas.showGrid, action: toggleGrid },
        { label: '吸附网格', checked: app.canvas.snapToGrid, action: toggleSnap },
        '---',
        { label: '深色主题', checked: app.theme === 'dark', action: () => setTheme(app.theme === 'dark' ? 'light' : 'dark') },
      ],
    },
    {
      label: '帮助', submenu: [
        { label: '关于 OpenUML', action: showAboutDialog },
      ],
    },
  ]));
}

// ---------------- context menus ----------------

function elementContextItems(node, canvas) {
  const items = [];
  if (node.type?.endsWith('Diagram')) {
    items.push(
      { label: '打开图表', action: () => openDiagram(node) },
      { label: '重命名…', action: () => renameElement(node) },
      '---',
      { label: '删除图表', action: () => removeDiagram(node) },
    );
    return items;
  }
  if (['UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLDataType', 'UMLSignal',
    'UMLAssociationClass', 'UMLInformationItem', 'UMLStereotype', 'UMLCollaboration'].includes(node.type)) {
    items.push(
      { label: '添加属性', action: () => addMember(node, 'attributes') },
      { label: '添加操作', action: () => addMember(node, 'operations') },
      '---',
    );
  }
  items.push(
    { label: '重命名…', action: () => renameElement(node) },
    '---',
    { label: '在图表中显示', action: () => showInDiagram(node, canvas) },
    { label: '删除模型元素', action: () => {
      commandStack.exec({
        label: 'delete model',
        redo: () => repository.removeChild(node),
        undo: () => repository.addChild(node.__parent, node),
      });
    } },
  );
  return items;
}

function addMember(model, key) {
  let item;
  if (key === 'attributes') item = { _id: 'a-' + Math.random().toString(36).slice(2, 9), $type: 'UMLAttribute', name: 'attr' + (model.attributes.length + 1), type: '', visibility: 'public', defaultValue: '', isStatic: false };
  else item = { _id: 'o-' + Math.random().toString(36).slice(2, 9), $type: 'UMLOperation', name: 'op' + (model.operations.length + 1), parameters: [], returnType: '', visibility: 'public', isStatic: false };
  const old = model[key];
  commandStack.exec({
    label: 'add member',
    redo: () => { model[key] = [...old, item]; },
    undo: () => { model[key] = old; },
  });
}

function showInDiagram(model, canvas) {
  if (!canvas.diagram) return;
  const diagram = canvas.diagram; // capture: undo/redo must target the owning diagram
  const exists = diagram.elements.some((v) => v.modelRef === model._id);
  if (exists) {
    const v = diagram.elements.find((v) => v.modelRef === model._id);
    repository.select([v._id], model);
    return;
  }
  if (!['UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLDataType', 'UMLSignal',
    'UMLPrimitiveType', 'UMLFrame', 'UMLAssociationClass', 'UMLOrthogonalState', 'UMLRegion',
    'UMLSubmachineState', 'UMLTerminate', 'UMLEntryPoint', 'UMLExitPoint',
    'UMLConnectionPointReference', 'UMLCentralBufferNode', 'UMLDataStoreNode',
    'UMLActivityParameterNode', 'UMLInputPin', 'UMLOutputPin',
    'UMLStructuredActivityNode', 'UMLInterruptibleRegion', 'UMLAcceptTimeEvent',
    'UMLActor', 'UMLUseCase', 'UMLPackage',
    'UMLInformationItem', 'UMLCollaboration', 'UMLCollaborationUse', 'UMLStereotype', 'UMLMetaClass',
    'UMLInteractionUseInOverview', 'UMLInteractionInOverview', 'UMLTimingLifeline', 'UMLTimingState',
    'UMLTimeConstraint', 'UMLDurationConstraint'].includes(model.type)) return;
  const view = createNodeView(model.type, model._id,
    Math.round(80 + Math.random() * 200), Math.round(80 + Math.random() * 150));
  commandStack.exec({
    label: 'show in diagram',
    redo: () => { diagram.elements.push(view); },
    undo: () => {
      const i = diagram.elements.indexOf(view);
      if (i >= 0) diagram.elements.splice(i, 1);
    },
  });
  repository.select([view._id], model);
}

// ---------------- keyboard ----------------

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (isPaletteOpen()) {
      // Escape closes the palette even if focus moved off its input.
      if (e.key === 'Escape') { e.preventDefault(); hidePalette(); }
      return;
    }
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); commandStack.undo(); return; }
    if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); commandStack.redo(); return; }
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); openProjectFile(); return; }
    if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); requestNewProject(); return; }
    if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); if (app.activeDiagram) repository.select(app.activeDiagram.elements.map((v) => v._id)); return; }
    if (ctrl && e.key.toLowerCase() === 'x') { e.preventDefault(); cutSelection(); return; }
    if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
    if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
    if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); openCommandPalette(); return; }
    if (ctrl && e.key === ',') { e.preventDefault(); editPreferences(); return; }
    if (ctrl && e.key.toLowerCase() === 'p') { e.preventDefault(); printCurrentDiagram(); return; }
    if (ctrl && e.key.toLowerCase() === 'f' && !e.shiftKey) { e.preventDefault(); openQuickFindPalette(); return; }
    if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); app.canvas.zoomIn(); return; }
    if (ctrl && e.key === '-') { e.preventDefault(); app.canvas.zoomOut(); return; }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); app.canvas.zoomFit(); return; }
    if (ctrl && e.altKey && e.key === 'PageUp') { e.preventDefault(); cycleDiagram(-1); return; }
    if (ctrl && e.altKey && e.key === 'PageDown') { e.preventDefault(); cycleDiagram(1); return; }
    if (e.key === 'Delete') {
      e.preventDefault();
      if (e.ctrlKey) app.canvas.deleteSelectionDeep();
      else app.canvas.deleteSelection();
      return;
    }
    if (e.key === 'F2' && repository.selectedModel) { renameElement(repository.selectedModel); return; }
    if (e.key === 'Escape') {
      app.canvas.setTool(null);
      repository.select([]);
      return;
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (repository.selections.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        for (const id of repository.selections) {
          const v = repository.lookup(id);
          if (v && v.$type !== 'edge') { v.x += dx; v.y += dy; }
        }
        app.canvas.requestRender();
      }
    }
  });
}

// ---------------- panel tabs / toolbar / resizers ----------------

function bindPanelUI() {
  document.querySelectorAll('#editor-panel-tabs .mini-tab').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('#editor-panel-tabs .mini-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('property-editor').classList.toggle('hidden', tab.dataset.panel !== 'properties');
      document.getElementById('style-editor').classList.toggle('hidden', tab.dataset.panel !== 'styles');
    };
  });
  document.getElementById('tb-zoom-in').onclick = () => app.canvas.zoomIn();
  document.getElementById('tb-zoom-out').onclick = () => app.canvas.zoomOut();
  document.getElementById('tb-zoom-fit').onclick = () => app.canvas.zoomFit();
  document.getElementById('tb-grid').onclick = toggleGrid;
  document.getElementById('tb-snap').onclick = toggleSnap;
  document.getElementById('me-collapse').onclick = () => {
    app.explorer.expanded.clear();
    app.explorer.render();
  };

  // side panel resizers
  bindResizer('sidebar-resizer', 'sidebar', 'width', true);
  bindResizer('navigator-resizer', 'navigator', 'width', false);
}

function bindResizer(id, targetId, prop, growingLeft) {
  const el = document.getElementById(id);
  const target = document.getElementById(targetId);
  let startX = 0, startW = 0, dragging = false;
  el.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = target.getBoundingClientRect().width;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const d = e.clientX - startX;
    target.style.width = Math.max(140, Math.min(460, growingLeft ? startW + d : startW - d)) + 'px';
    app.canvas.requestRender();
  });
  window.addEventListener('mouseup', () => { dragging = false; });
}

// ---------------- boot ----------------

function boot() {
  const canvas = new DiagramCanvas(document.getElementById('diagram-canvas'));
  app.canvas = canvas;
  const prefs = loadPreferences();
  app.prefs = prefs;
  canvas.gridSize = prefs.gridSize;
  canvas.showGrid = prefs.showGrid;
  canvas.snapToGrid = prefs.snapToGrid;
  canvas.autoResize = prefs.autoResize;
  window.__internals = { createNodeView, createModel, createDiagram, app, openDiagram };

  app.explorer = new ModelExplorer(document.getElementById('model-explorer'), {
    onSelect: (node) => {
      const view = canvas.diagram?.elements.find((v) => v.modelRef === node._id);
      app.editor.show(node);
      if (view) {
        repository.selections = [view._id];
        canvas.requestRender();
      }
    },
    onActivate: (node) => {
      if (node.type?.endsWith('Diagram')) openDiagram(node);
      else if (canvas.diagram) showInDiagram(node, canvas);
    },
    onContext: (node, pos) => {
      showContextMenu(pos.x, pos.y, elementContextItems(node, canvas));
    },
  });
  app.editor = new PropertyEditor(app);

  initToolbox(canvas);
  bindPanelUI();
  bindKeys();
  app.theme = prefs.theme === 'dark' ? 'dark' : 'light';
  if (app.theme === 'dark') document.documentElement.dataset.theme = 'dark';
  document.getElementById('tb-grid').classList.toggle('active', prefs.showGrid);
  document.getElementById('tb-snap').classList.toggle('active', prefs.snapToGrid);
  buildMenus();
  applyPanels();

  document.addEventListener('canvas-contextmenu', (e) => {
    const { world, client, hit } = e.detail;
    if (hit) {
      if (!repository.selections.includes(hit.view._id)) repository.select([hit.view._id], repository.lookup(hit.view.modelRef));
      const model = repository.lookup(hit.view.modelRef);
      const items = [
        { label: '重命名…', action: () => model && renameElement(model) },
        '---',
        { label: '置于顶层', action: () => canvas.bringToFront() },
        { label: '置于底层', action: () => canvas.sendToBack() },
        '---',
        { label: '从图表删除', shortcut: 'Del', action: () => canvas.deleteSelection() },
        { label: '删除模型元素', shortcut: 'Ctrl+Del', action: () => canvas.deleteSelectionDeep() },
      ];
      showContextMenu(client.x, client.y, items);
    } else {
      const items = [
        { label: '添加类图', action: () => addDiagram('UMLClassDiagram') },
        { label: '添加用例图', action: () => addDiagram('UMLUseCaseDiagram') },
        '---',
        { label: '适应窗口', action: () => canvas.zoomFit() },
        { label: '重置缩放', action: () => { canvas.zoom = 1; canvas._zoomChanged(); } },
      ];
      showContextMenu(client.x, client.y, items);
    }
  });

  document.addEventListener('quick-edit', (e) => {
    const { view, compartment } = e.detail;
    const model = repository.lookup(view.modelRef);
    if (!model) return;
    if (compartment === 'attributes' || compartment === 'operations' || compartment === 'literals') {
      const key = compartment === 'literals' ? 'literals' : compartment;
      if (!model[key]) return;
      const item = key === 'literals'
        ? { _id: 'l-' + Math.random().toString(36).slice(2, 9), $type: 'UMLEnumerationLiteral', name: 'lit' + (model.literals.length + 1), visibility: 'public' }
        : key === 'attributes'
          ? { _id: 'a-' + Math.random().toString(36).slice(2, 9), $type: 'UMLAttribute', name: 'attr' + (model.attributes.length + 1), type: '', visibility: 'public', defaultValue: '', isStatic: false }
          : { _id: 'o-' + Math.random().toString(36).slice(2, 9), $type: 'UMLOperation', name: 'op' + (model.operations.length + 1), parameters: [], returnType: '', visibility: 'public', isStatic: false };
      const old = model[key];
      commandStack.exec({
        label: 'quick add',
        redo: () => { model[key] = [...old, item]; },
        undo: () => { model[key] = old; },
      });
      repository.select([view._id], model);
      canvas.setStatusMessage(`已添加${key === 'attributes' ? '属性' : key === 'operations' ? '操作' : '字面量'}（在属性面板中编辑）`);
    }
  });

  document.addEventListener('stack-changed', () => { markDirty(true); scheduleAutosave(); });

  repository.on('change', () => renderTabs());
  repository.on('select', ({ ids }) => {
    const el = document.getElementById('status-selection');
    if (el) el.textContent = `${ids.length} 个选中`;
  });

  // restore last session or start fresh
  const saved = localStorage.getItem(PROJECT_KEY);
  if (saved) {
    try { loadProjectJSON(saved); } catch { newProject(); }
  } else {
    newProject();
  }
  window.addEventListener('beforeunload', () => {
    if (!app.dirty || !repository.root) return;
    // flush the pending debounced autosave synchronously
    try { localStorage.setItem(PROJECT_KEY, serializeProject(repository.root)); } catch { /* ignore */ }
  });
  canvas.zoomFit();
  // expose the plugin API (window.openuml) for extensions
  initPluginApi(app, {
    registerPaletteCommand: (cmd) => {
      const i = pluginCommands.findIndex((c) => c.id === cmd.id);
      if (i >= 0) pluginCommands[i] = cmd; else pluginCommands.push(cmd);
    },
    openDiagram,
  });
  // dismiss the splash screen once the app is interactive
  const splash = document.getElementById('splash');
  if (splash) {
    splash.style.opacity = '0';
    setTimeout(() => splash.remove(), 400);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

boot();
