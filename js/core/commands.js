// commands.js — undo/redo command stack (command pattern)

import { repository, genId, resetIds } from '../core/repository.js';

class CommandStack {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.limit = 200;
  }

  exec(cmd) {
    cmd.redo();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this._changed();
  }

  pushExecuted(cmd) {
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    this._changed();
  }

  canUndo() { return this.undoStack.length > 0; }
  canRedo() { return this.redoStack.length > 0; }

  undo() {
    const cmd = this.undoStack.pop();
    if (!cmd) return;
    cmd.undo();
    this.redoStack.push(cmd);
    this._changed();
  }

  redo() {
    const cmd = this.redoStack.pop();
    if (!cmd) return;
    cmd.redo();
    this.undoStack.push(cmd);
    this._changed();
  }

  _changed() {
    if (typeof document !== 'undefined') document.dispatchEvent(new CustomEvent('stack-changed'));
  }
}

export const commandStack = new CommandStack();

/** SetProperty: change one property with undo support. */
export function setProperty(obj, prop, value, label = 'modify') {
  const old = obj[prop];
  if (old === value) return;
  commandStack.exec({
    label,
    redo: () => { obj[prop] = value; },
    undo: () => { obj[prop] = old; },
  });
}

/** AddElement / RemoveElement keep full object references (no cloning needed). */
export function addElement(parent, child, index = -1, label = 'add') {
  commandStack.exec({
    label,
    redo: () => repository.addChild(parent, child, index),
    undo: () => repository.removeChild(child),
  });
}

export function removeElement(child, label = 'delete') {
  const parent = child.__parent;
  if (!parent) return;
  const index = parent.ownedElements.indexOf(child);
  commandStack.exec({
    label,
    redo: () => repository.removeChild(child),
    undo: () => repository.addChild(parent, child, index),
  });
}

/** Compound: group several {redo, undo} ops into one undoable step. */
export function compound(label, ops) {
  commandStack.exec({
    label,
    redo: () => { for (const op of ops) op.redo(); },
    undo: () => { for (const op of [...ops].reverse()) op.undo(); },
  });
}

/** serialize/deserialize the whole project */
export function serializeProject(root) {
  const seen = new Map();
  function ser(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (seen.has(obj)) return { $ref: seen.get(obj) };
    if (Array.isArray(obj)) return obj.map(ser);
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith('__')) continue;
      out[k] = ser(v);
    }
    return out;
  }
  return JSON.stringify(ser(root), null, 2);
}

export function deserializeProject(json) {
  const data = JSON.parse(json);
  const refs = new Map();
  function deser(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(deser);
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deser(v);
    if (out._id) refs.set(out._id, out);
    return out;
  }
  const root = deser(data);
  // resolve $ref + rebuild __parent
  function fix(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && v.$ref !== undefined) {
        obj[k] = refs.get(v.$ref) || null;
      } else if (Array.isArray(v)) {
        obj[k] = v.map((x) => (x && typeof x === 'object' && x.$ref !== undefined ? refs.get(x.$ref) || null : fix(x)));
      } else if (v && typeof v === 'object') {
        fix(v);
      }
    }
    if (Array.isArray(obj.ownedElements)) {
      for (const c of obj.ownedElements) if (c) c.__parent = obj;
    }
    return obj;
  }
  resetIds();
  // advance id counter past restored ids
  let maxN = 0;
  for (const id of refs.keys()) {
    const m = /^el-(\w+)-/.exec(id);
    if (m) {
      const n = parseInt(m[1], 36);
      if (!Number.isNaN(n)) maxN = Math.max(maxN, n);
    }
  }
  for (let i = 0; i <= maxN; i++) genId();
  // NOTE: deliberately does NOT touch the global repository index — the caller
  // owns that (loadProjectJSON reindexes the new root; clipboard use must not).
  return fix(root);
}
