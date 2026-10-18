// main.js — application bootstrap and wiring

import { repository } from './core/repository.js';
import { commandStack, compound, serializeProject, deserializeProject } from './core/commands.js';
import {
  createProject, createDiagram, createModel, createNodeView,
} from './core/factory.js';
import { diagramIcon } from './core/metamodel.js';
import { DiagramCanvas } from './views/canvas.js';
import { initToolbox } from './ui/toolbox.js';
import { ModelExplorer } from './ui/model-explorer.js';
import { PropertyEditor } from './ui/property-editor.js';
import { buildMenu, showContextMenu } from './ui/menubar.js';
import { showInputDialog, showConfirmDialog, showAboutDialog } from './ui/dialogs.js';
import { downloadPNG, downloadSVG, printDiagram } from './exporter.js';

const app = {
  canvas: null,
  explorer: null,
  editor: null,
  openDiagrams: [],     // diagram nodes currently open (tabs)
  activeDiagram: null,
  filePath: null,
  dirty: false,
  theme: 'light',
};

function setTheme(t) {
  app.theme = t === 'dark' ? 'dark' : 'light';
  if (app.theme === 'dark') document.documentElement.dataset.theme = 'dark';
  else delete document.documentElement.dataset.theme;
  localStorage.setItem('openuml-theme', app.theme);
  buildMenus();
}

// ---------------- project lifecycle ----------------

function newProject() {
  repository.root = createProject();
  repository._index = new Map();
  repository.walk((n) => repository._index.set(n._id, n));
  app.openDiagrams = [];
  app.filePath = null;
  markDirty(false);
  commandStack.undoStack.length = 0;
  commandStack.redoStack.length = 0;
  const firstDiagram = findFirstDiagram(repository.root);
  openDiagram(firstDiagram);
  app.explorer.expanded.clear();
  app.explorer.expanded.add(repository.root._id);
  app.explorer.render();
  repository.select([]);
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
}

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
    }
  } else renderTabs();
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
    const typeName = { UMLClassDiagram: '类图', UMLUseCaseDiagram: '用例图', UMLSequenceDiagram: '序列图', UMLStatechartDiagram: '状态机图', UMLActivityDiagram: '活动图', UMLComponentDiagram: '组件图', UMLDeploymentDiagram: '部署图', UMLPackageDiagram: '包图', UMLCommunicationDiagram: '通信图' }[d.type] || '';
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
  const d = createDiagram(type, type === 'UMLUseCaseDiagram' ? 'UseCaseDiagram' : 'Model');
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

function copySelection() {
  if (!app.canvas.diagram) return false;
  const views = app.canvas.diagram.elements.filter((v) => repository.selections.includes(v._id));
  if (!views.length) return false;
  const viewIds = new Set(views.map((v) => v._id));
  // edges are only copied when both endpoints travel along
  const clipViews = views.filter((v) => !v.isEdge || (viewIds.has(v.tail) && viewIds.has(v.head)));
  const modelIds = [...new Set(clipViews.map((v) => v.modelRef).filter(Boolean))];
  const models = modelIds.map((id) => repository.lookup(id)).filter((m) => m && m.__parent);
  const container = { _id: '__clip__', type: '__Clip', ownedElements: models, elements: clipViews };
  clipboard = { json: serializeProject(container), pasteCount: 0 };
  app.canvas.setStatusMessage(`已复制 ${clipViews.length} 个元素`);
  return true;
}

function pasteClipboard() {
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
}

function model0() {
  return repository.root.ownedElements[0] || repository.root;
}

function duplicateSelection() {
  if (copySelection()) pasteClipboard();
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
  const json = serializeProject(repository.root);
  localStorage.setItem('openuml-project', json);
  if (download) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = (repository.root.name || 'project') + '.ouml';
    a.click();
    URL.revokeObjectURL(a.href);
  }
  markDirty(false);
  app.canvas.setStatusMessage('项目已保存');
}

function loadProjectJSON(json) {
  try {
    const root = deserializeProject(json);
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
    openDiagram(d);
    app.canvas.setStatusMessage('项目已打开');
  } catch (err) {
    alert('无法解析项目文件: ' + err.message);
  }
}

function openProjectFile() {
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

// ---------------- menus ----------------

function buildMenus() {
  const sel = () => repository.selectedModel;
  const hasSel = () => repository.selections.length > 0;
  buildMenu([
    {
      label: '文件', submenu: [
        { label: '新建', shortcut: 'Ctrl+N', action: async () => {
          if (app.dirty) {
            const ok = await showConfirmDialog({ title: '新建', message: '当前项目有未保存的更改，确定放弃并新建吗？' });
            if (!ok) return;
          }
          newProject();
        } },
        { label: '打开项目…', shortcut: 'Ctrl+O', action: openProjectFile },
        { label: '保存项目', shortcut: 'Ctrl+S', action: () => saveProject(false) },
        { label: '项目另存为…', shortcut: 'Ctrl+Shift+S', action: () => saveProject(true) },
        '---',
        { label: '导出为 SVG', action: () => { if (app.activeDiagram) downloadSVG(app.canvas, app.activeDiagram.name + '.svg'); } },
        { label: '导出为 PNG', action: () => { if (app.activeDiagram) downloadPNG(app.canvas, app.activeDiagram.name + '.png'); } },
        { label: '打印 / 导出 PDF…', shortcut: 'Ctrl+P', action: () => { if (app.activeDiagram) printDiagram(app.canvas, app.activeDiagram.name); } },
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
        { label: '复制', shortcut: 'Ctrl+C', disabled: !hasSel(), action: () => copySelection() },
        { label: '粘贴', shortcut: 'Ctrl+V', disabled: !clipboard, action: () => pasteClipboard() },
        { label: '创建副本', shortcut: 'Ctrl+D', disabled: !hasSel(), action: () => duplicateSelection() },
        '---',
        { label: '从图表删除', shortcut: 'Del', disabled: !hasSel(), action: () => app.canvas.deleteSelection() },
        { label: '删除模型元素', shortcut: 'Ctrl+Del', disabled: !hasSel(), action: () => app.canvas.deleteSelectionDeep() },
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
        ] },
        '---',
        { label: '添加类', action: () => addModelElement('UMLClass') },
        { label: '添加接口', action: () => addModelElement('UMLInterface') },
        { label: '添加枚举', action: () => addModelElement('UMLEnumeration') },
        { label: '添加参与者', action: () => addModelElement('UMLActor') },
        { label: '添加用例', action: () => addModelElement('UMLUseCase') },
        { label: '添加包', action: () => addModelElement('UMLPackage') },
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
        { label: '显示网格', checked: app.canvas.showGrid, action: () => {
          app.canvas.showGrid = !app.canvas.showGrid;
          document.getElementById('tb-grid').classList.toggle('active', app.canvas.showGrid);
          app.canvas.requestRender();
        } },
        { label: '吸附网格', checked: app.canvas.snapToGrid, action: () => {
          app.canvas.snapToGrid = !app.canvas.snapToGrid;
          document.getElementById('tb-snap').classList.toggle('active', app.canvas.snapToGrid);
        } },
        '---',
        { label: '深色主题', checked: app.theme === 'dark', action: () => setTheme(app.theme === 'dark' ? 'light' : 'dark') },
      ],
    },
    {
      label: '帮助', submenu: [
        { label: '关于 OpenUML', action: showAboutDialog },
      ],
    },
  ]);
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
  if (node.type === 'UMLClass' || node.type === 'UMLInterface' || node.type === 'UMLEnumeration' || node.type === 'UMLDataType') {
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
  if (!['UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLDataType', 'UMLActor', 'UMLUseCase', 'UMLPackage'].includes(model.type)) return;
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
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); commandStack.undo(); return; }
    if (ctrl && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); commandStack.redo(); return; }
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); saveProject(e.shiftKey); return; }
    if (ctrl && e.key.toLowerCase() === 'o') { e.preventDefault(); openProjectFile(); return; }
    if (ctrl && e.key.toLowerCase() === 'n') { e.preventDefault(); newProject(); return; }
    if (ctrl && e.key.toLowerCase() === 'a') { e.preventDefault(); if (app.activeDiagram) repository.select(app.activeDiagram.elements.map((v) => v._id)); return; }
    if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
    if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteClipboard(); return; }
    if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
    if (ctrl && e.key.toLowerCase() === 'p') { e.preventDefault(); if (app.activeDiagram) printDiagram(app.canvas, app.activeDiagram.name); return; }
    if (ctrl && (e.key === '=' || e.key === '+')) { e.preventDefault(); app.canvas.zoomIn(); return; }
    if (ctrl && e.key === '-') { e.preventDefault(); app.canvas.zoomOut(); return; }
    if (ctrl && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); app.canvas.zoomFit(); return; }
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
  document.getElementById('tb-grid').onclick = () => {
    app.canvas.showGrid = !app.canvas.showGrid;
    document.getElementById('tb-grid').classList.toggle('active', app.canvas.showGrid);
    app.canvas.requestRender();
  };
  document.getElementById('tb-snap').onclick = () => {
    app.canvas.snapToGrid = !app.canvas.snapToGrid;
    document.getElementById('tb-snap').classList.toggle('active', app.canvas.snapToGrid);
  };
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
  window.__internals = { createNodeView, createModel, createDiagram };

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
  app.editor = new PropertyEditor();

  initToolbox(canvas);
  bindPanelUI();
  bindKeys();
  app.theme = localStorage.getItem('openuml-theme') === 'dark' ? 'dark' : 'light';
  if (app.theme === 'dark') document.documentElement.dataset.theme = 'dark';
  buildMenus();

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

  document.addEventListener('stack-changed', () => markDirty(true));

  repository.on('change', () => renderTabs());
  repository.on('select', ({ ids }) => {
    const el = document.getElementById('status-selection');
    if (el) el.textContent = `${ids.length} 个选中`;
  });

  // restore last session or start fresh
  const saved = localStorage.getItem('openuml-project');
  if (saved) {
    try { loadProjectJSON(saved); } catch { newProject(); }
  } else {
    newProject();
  }
  canvas.zoomFit();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

boot();
