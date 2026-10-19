// model-explorer.js — tree view over the repository

import { repository } from '../core/repository.js';
import { ModelKinds, diagramIcon } from '../core/metamodel.js';

// model types that can be placed on a diagram by dragging from the tree
const ViewableModelTypes = new Set([
  'UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLDataType', 'UMLPackage',
  'UMLActor', 'UMLUseCase', 'UMLState', 'UMLCompositeState', 'UMLAction',
  'UMLComponent', 'UMLArtifact', 'UMLNode', 'UMLObject', 'UMLSubsystem',
  'UMLObjectNode', 'UMLSendSignal', 'UMLAcceptSignal', 'UMLLifeLine', 'UMLNote',
  'UMLArtifactInstance', 'UMLComponentInstance', 'UMLNodeInstance', 'UMLConstraint',
  'UMLInformationItem', 'UMLCollaboration', 'UMLPort', 'UMLPart', 'UMLCollaborationUse',
  'UMLMetaClass', 'UMLStereotype', 'UMLInteractionUseInOverview', 'UMLInteractionInOverview',
  'UMLTimingLifeline', 'UMLTimingState', 'UMLTimeSegment', 'UMLTimeConstraint',
  'UMLDurationConstraint',
]);

export class ModelExplorer {
  constructor(container, hooks = {}) {
    this.container = container;
    this.expanded = new Set();
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
      if (model) this.highlight(model._id);
    });
    // property edits go through the command stack, not repository events
    document.addEventListener('stack-changed', () => this.render());
  }

  ensureExpanded(id) { this.expanded.add(id); }

  render() {
    if (!repository.root) return;
    this.container.innerHTML = '';
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
    const meta = ModelKinds[node.type] || { icon: '•', iconColor: '#888', name: node.type };

    const hasKids = (node.ownedElements || []).length > 0;
    const isExpanded = this.expanded.has(node._id);
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
      repository.select([], node);
      this.highlight(node._id);
      if (this.hooks.onSelect) this.hooks.onSelect(node);
    };
    row.ondblclick = (e) => {
      e.stopPropagation();
      if (hasKids) { this.expanded.has(node._id) ? this.expanded.delete(node._id) : this.expanded.add(node._id); this.render(); }
      if (this.hooks.onActivate) this.hooks.onActivate(node);
    };
    twisty.onclick = (e) => {
      e.stopPropagation();
      if (hasKids) { this.expanded.has(node._id) ? this.expanded.delete(node._id) : this.expanded.add(node._id); this.render(); }
    };
    row.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      repository.select([], node);
      this.highlight(node._id);
      if (this.hooks.onContext) this.hooks.onContext(node, { x: e.clientX, y: e.clientY });
    };
    // drag a model element onto a diagram to create its view (StarUML behavior)
    if (ViewableModelTypes.has(node.type)) {
      row.draggable = true;
      row.addEventListener('dragstart', (ev) => {
        ev.dataTransfer.setData('application/x-openuml-model', node._id);
        ev.dataTransfer.setData('text/plain', node.name || '');
        ev.dataTransfer.effectAllowed = 'copy';
      });
    }
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
