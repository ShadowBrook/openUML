// repository.js — in-memory model repository with ownership tree and events.
// Inspired by StarUML's repository concept, original implementation.

let nextId = 1;

export function genId(prefix = 'el') {
  let id;
  do {
    id = `${prefix}-${(nextId++).toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  } while (repository._index && repository._index.has(id));
  return id;
}

export function resetIds() { nextId = 1; }

const listeners = { change: [], select: [] };

export function on(event, fn) {
  return repository.on(event, fn);
}
function emit(event, payload) {
  for (const fn of [...listeners[event]]) fn(payload);
}

// model: { _id, type, name, ownedElements: [], ...}
// view models live under diagram.elements: { _id, modelRef, ...}
export const repository = {
  root: null,
  selections: [],           // currently selected view ids in active diagram
  selectedModel: null,      // model element shown in property editor

  on(event, fn) {
    listeners[event].push(fn);
    return () => {
      const i = listeners[event].indexOf(fn);
      if (i >= 0) listeners[event].splice(i, 1);
    };
  },

  lookup(id) {
    if (!this.root || !id) return null;
    return this._index.get(id) || null;
  },

  // ---- ownership ----
  addChild(parent, child, index = -1) {
    if (!parent.ownedElements) parent.ownedElements = [];
    if (child.__parent) this.removeChild(child);
    if (index < 0 || index > parent.ownedElements.length) index = parent.ownedElements.length;
    parent.ownedElements.splice(index, 0, child);
    child.__parent = parent;
    this._reindex();
    emit('change', { kind: 'add', node: child, parent });
  },

  removeChild(child) {
    const parent = child.__parent;
    if (!parent) return;
    const i = parent.ownedElements.indexOf(child);
    if (i >= 0) parent.ownedElements.splice(i, 1);
    child.__parent = null;
    this._reindex();
    emit('change', { kind: 'remove', node: child, parent });
  },

  // Depth-first iteration over the whole tree (model tree + diagram views)
  walk(fn, node = this.root) {
    if (!node) return;
    const stack = [node];
    while (stack.length) {
      const n = stack.pop();
      fn(n);
      const kids = n.ownedElements;
      if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
      // diagram view collections live beside ownedElements
      if (n.elements) for (let i = n.elements.length - 1; i >= 0; i--) stack.push(n.elements[i]);
    }
  },

  _reindex() {
    this._index = new Map();
    this.walk((n) => this._index.set(n._id, n));
  },

  // Find all diagram views referencing a model element
  findViewsOf(modelId, root = this.root) {
    const out = [];
    this.walk((n) => {
      if (n.modelRef === modelId) out.push(n);
    }, root);
    return out;
  },

  select(ids, model = null) {
    if (typeof ids === 'string') ids = [ids];
    this.selections = ids || [];
    this.selectedModel = model;
    emit('select', { ids: this.selections, model });
  },

  notifyChange(node, kind = 'modify') {
    this._reindex();
    emit('change', { kind, node, parent: node?.__parent || null });
  },

  resetListeners() {
    listeners.change.length = 0;
    listeners.select.length = 0;
  },
};
repository._index = new Map();
