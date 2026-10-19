// model-explorer.js — tree view over the repository

import { repository } from '../core/repository.js';
import { commandStack } from '../core/commands.js';
import { ModelKinds, diagramIcon } from '../core/metamodel.js';

// model types that can be placed on a diagram by dragging from the tree
const ViewableModelTypes = new Set([
  'UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLDataType', 'UMLPackage',
  'UMLActor', 'UMLUseCase', 'UMLState', 'UMLCompositeState', 'UMLAction',
  'UMLComponent', 'UMLArtifact', 'UMLNode', 'UMLObject', 'UMLSubsystem',
  'UMLObjectNode', 'UMLSendSignal', 'UMLAcceptSignal', 'UMLLifeLine', 'UMLNote',
  'UMLArtifactInstance', 'UMLComponentInstance', 'UMLNodeInstance', 'UMLConstraint',
  'UMLSignal', 'UMLPrimitiveType', 'UMLFrame', 'UMLAssociationClass',
  'UMLOrthogonalState', 'UMLRegion', 'UMLSubmachineState', 'UMLTerminate',
  'UMLEntryPoint', 'UMLExitPoint', 'UMLConnectionPointReference',
  'UMLCentralBufferNode', 'UMLDataStoreNode', 'UMLActivityParameterNode',
  'UMLInputPin', 'UMLOutputPin', 'UMLStructuredActivityNode',
  'UMLInterruptibleRegion', 'UMLAcceptTimeEvent',
  'UMLInformationItem', 'UMLCollaboration', 'UMLPort', 'UMLPart', 'UMLCollaborationUse',
  'UMLMetaClass', 'UMLStereotype', 'UMLInteractionUseInOverview', 'UMLInteractionInOverview',
  'UMLTimingLifeline', 'UMLTimingState', 'UMLTimeSegment', 'UMLTimeConstraint',
  'UMLDurationConstraint',
]);

export class ModelExplorer {
  constructor(container, hooks = {}) {
    this.container = container;
    this.expanded = new Set();
    this.selectedIds = new Set();   // multi-select highlight (tree-level)
    this.hooks = hooks;
    repository.on('change', (evt) => {
      if (evt?.kind === 'add' && evt.parent) {
        // auto-reveal: expand ancestors of newly added elements
        let p = evt.parent;
        while (p) { this.expanded.add(p._id); p = p.__parent; }
      }
      this.render();
    });
    repository.on('select', ({ model }) => {
      // canvas/property selections sync the highlight; tree ctrl-click flows
      // suspend this sync so their accumulated set survives
      if (model && !this._suspendSync) { this.selectedIds.add(model._id); this.highlight(model._id); }
    });
    // property edits go through the command stack, not repository events
    document.addEventListener('stack-changed', () => this.render());
  }

  ensureExpanded(id) { this.expanded.add(id); }

  render() {
    if (!repository.root) return;
    this.container.innerHTML = '';
    this.container.setAttribute('role', 'tree');
    this.container.setAttribute('aria-label', '模型资源管理器');
    this._renderNode(repository.root, this.container, 0);
  }

  _renderChildren(node, parentEl, depth) {
    const kids = node.ownedElements || [];
    const wrap = document.createElement('div');
    wrap.className = 'tree-children';
    for (const child of kids) this._renderNode(child, wrap, depth);
    parentEl.appendChild(wrap);
  }

  _renderNode(node, parentEl, depth) {
    const row = document.createElement('div');
    row.className = 'tree-row';
    row.dataset.id = node._id;
    row.style.paddingLeft = 6 + depth * 14 + 'px';
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(depth + 1));
    row.tabIndex = 0;
    const meta = ModelKinds[node.type] || { icon: '•', iconColor: '#888', name: node.type };

    const hasKids = (node.ownedElements || []).length > 0;
    const isExpanded = this.expanded.has(node._id);
    if (hasKids) row.setAttribute('aria-expanded', String(isExpanded));
    const twisty = document.createElement('span');
    twisty.className = 'twisties';
    twisty.textContent = hasKids ? (isExpanded ? '▾' : '▸') : '';
    row.appendChild(twisty);

    const icon = document.createElement('span');
    icon.className = 'ticon';
    if (node.type && node.type.endsWith('Diagram')) {
      icon.innerHTML = diagramIcon(node.type);
    } else {
      icon.textContent = meta.icon;
      icon.style.color = meta.iconColor;
    }
    row.appendChild(icon);

    if (node.stereotype || node.type.startsWith('UML')) {
      const st = document.createElement('span');
      st.className = 'tstereo';
      st.textContent = node.type === 'UMLClass' ? '' : shortType(node.type);
      if (st.textContent) row.appendChild(st);
    }

    const name = document.createElement('span');
    name.className = 'tname';
    name.textContent = node.name || '(unnamed)';
    row.appendChild(name);

    row.onclick = (e) => {
      e.stopPropagation();
      // ctrl/cmd toggles membership; shift selects a sibling range
      if (e.ctrlKey || e.metaKey) {
        if (this.selectedIds.has(node._id)) this.selectedIds.delete(node._id);
        else this.selectedIds.add(node._id);
      } else if (e.shiftKey && this.selectedIds.size) {
        const anchorId = [...this.selectedIds][this.selectedIds.size - 1];
        const anchorRow = this.container.querySelector(`.tree-row[data-id="${anchorId}"]`);
        if (anchorRow) {
          const rows = [...this.container.querySelectorAll('.tree-row')];
          const a = rows.indexOf(anchorRow), b = rows.indexOf(row);
          this.selectedIds = new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.dataset.id));
        } else this.selectedIds = new Set([node._id]);
      } else {
        this.selectedIds = new Set([node._id]);
      }
      this.container.querySelectorAll('.tree-row.selected').forEach((r) => {
        if (!this.selectedIds.has(r.dataset.id)) r.classList.remove('selected');
      });
      row.classList.add('selected');
      this._suspendSync = true;
      repository.select([], node);
      this._suspendSync = false;
      if (this.hooks.onSelect) this.hooks.onSelect(node);
    };
    row.ondblclick = (e) => {
      e.stopPropagation();
      if (e.target.classList.contains('tname')) { this.startRename(node, e.target); return; }
      if (hasKids) { this.expanded.has(node._id) ? this.expanded.delete(node._id) : this.expanded.add(node._id); this.render(); }
      if (this.hooks.onActivate) this.hooks.onActivate(node);
    };
    twisty.onclick = (e) => {
      e.stopPropagation();
      if (hasKids) { this.expanded.has(node._id) ? this.expanded.delete(node._id) : this.expanded.add(node._id); this.render(); }
    };
    row.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); row.onclick(new MouseEvent('click', { bubbles: true })); }
      else if (e.key === 'F2') { e.preventDefault(); this.startRename(node, row.querySelector('.tname')); }
      else if (e.key === 'ArrowRight' && hasKids && !isExpanded) { this.expanded.add(node._id); this.render(); }
      else if (e.key === 'ArrowLeft' && hasKids && isExpanded) { this.expanded.delete(node._id); this.render(); }
    };
    row.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      repository.select([], node);
      this.highlight(node._id);
      if (this.hooks.onContext) this.hooks.onContext(node, { x: e.clientX, y: e.clientY });
    };
    // drag a model element onto a diagram to create its view (StarUML behavior);
    // within the tree the same drag re-parents the element
    row.draggable = true;
    row.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('application/x-openuml-model', node._id);
      ev.dataTransfer.setData('text/plain', node.name || '');
      ev.dataTransfer.effectAllowed = 'copyMove';
    });
    row.addEventListener('dragover', (ev) => {
      if (![...ev.dataTransfer.types].includes('application/x-openuml-model')) return;
      const dragId = ev.dataTransfer.getData('application/x-openuml-model');
      if (dragId && (dragId === node._id || this._isDescendant(node, dragId))) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = (node.ownedElements && !ev.altKey) ? 'move' : 'copy';
      row.classList.add('drop-target');
    });
    row.addEventListener('dragleave', () => row.classList.remove('drop-target'));
    row.addEventListener('drop', (ev) => {
      row.classList.remove('drop-target');
      const dragId = ev.dataTransfer.getData('application/x-openuml-model');
      if (!dragId || dragId === node._id) return;
      const dragged = repository.lookup(dragId);
      if (!dragged || this._isDescendant(node, dragged._id)) return;
      ev.preventDefault();
      ev.stopPropagation();
      const from = dragged.__parent;
      if (from === node && !ev.altKey) return;
      commandStack.exec({
        label: 'reorder model',
        redo: () => {
          repository.removeChild(dragged);
          repository.addChild(node, dragged);
          this.expanded.add(node._id);
        },
        undo: () => {
          repository.removeChild(dragged);
          repository.addChild(from, dragged);
        },
      });
    });
    parentEl.appendChild(row);

    if (hasKids && isExpanded) this._renderChildren(node, parentEl, depth + 1);
  }

  highlight(modelId) {
    this.container.querySelectorAll('.tree-row.selected').forEach((r) => r.classList.remove('selected'));
    const row = this.container.querySelector(`.tree-row[data-id="${modelId}"]`);
    if (row) {
      row.classList.add('selected');
      row.scrollIntoView({ block: 'nearest' });
    }
  }

  /** True when `id` names node itself or one of its ancestors (drop-cycle guard). */
  _isDescendant(node, id) {
    let p = node;
    while (p) {
      if (p._id === id) return true;
      p = p.__parent;
    }
    return false;
  }

  /** Inline rename: swap the name span for an input, commit via command stack. */
  startRename(node, nameSpan) {
    // use the live row (click handlers re-render the tree between events)
    const live = this.container.querySelector(`.tree-row[data-id="${node._id}"] .tname`) || nameSpan;
    const input = document.createElement('input');
    input.className = 'tree-rename';
    input.value = node.name || '';
    input.style.cssText = 'width:120px;font:inherit;padding:0 2px;';
    live.replaceWith(input);
    input.focus();
    input.select();
    const commit = (accept) => {
      const next = accept ? input.value.trim() : node.name;
      input.replaceWith(live);
      live.textContent = next || '(unnamed)';
      if (accept && next !== node.name) {
        const old = node.name;
        commandStack.exec({
          label: 'rename',
          redo: () => { node.name = next; },
          undo: () => { node.name = old; },
        });
      }
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') commit(true);
      else if (e.key === 'Escape') commit(false);
    });
    input.addEventListener('blur', () => commit(true));
  }

  expandTo(node) {
    let p = node.__parent;
    while (p) { this.expanded.add(p._id); p = p.__parent; }
    this.render();
    this.highlight(node._id);
  }
}

function shortType(t) {
  return t
    .replace(/^UML/, '')
    .replace(/Diagram$/, 'Diagram');
}
