// quickedit.js — StarUML-style QuickEdit popup: double-click (or Enter) on an
// element opens a compact editor with name/stereotype plus inline attribute /
// operation rows for class-like elements.

import { repository } from '../core/repository.js';
import { commandStack } from '../core/commands.js';
import { createAttribute, createOperation } from '../core/factory.js';

let panel = null;

function close() {
  if (panel) { panel.remove(); panel = null; }
}

/** Parse "[-|#|~]name: type" for attributes, "name(p1, p2): ret" for operations. */
function parseMemberLine(text, kind) {
  let t = (text || '').trim();
  if (!t) return null;
  let visibility = 'public';
  const vm = /^([+\-#~])\s*/.exec(t);
  if (vm) {
    visibility = { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' }[vm[1]];
    t = t.slice(1).trim();
  }
  if (kind === 'operation') {
    let name = t, params = [], returnType = '';
    const pi = t.indexOf('(');
    if (pi >= 0) {
      const pe = t.indexOf(')', pi);
      name = t.slice(0, pi).trim();
      const inner = pe > pi ? t.slice(pi + 1, pe) : '';
      params = inner.split(',').map((s) => s.trim()).filter(Boolean)
        .map((s) => {
          const ci = s.indexOf(':');
          return ci >= 0 ? { name: s.slice(0, ci).trim(), type: s.slice(ci + 1).trim() } : { name: s, type: '' };
        });
      const rest = pe >= 0 ? t.slice(pe + 1) : '';
      const ci = rest.indexOf(':');
      returnType = ci >= 0 ? rest.slice(ci + 1).trim() : rest.trim();
    } else {
      const ci = t.indexOf(':');
      if (ci >= 0) { name = t.slice(0, ci).trim(); returnType = t.slice(ci + 1).trim(); }
    }
    if (!name) return null;
    return { item: createOperation(name, params, returnType, visibility) };
  }
  // attribute
  let defaultValue = '';
  const di = t.indexOf('=');
  if (di >= 0) { defaultValue = t.slice(di + 1).trim(); t = t.slice(0, di).trim(); }
  let name = t, type = '';
  const ci = t.indexOf(':');
  if (ci >= 0) { name = t.slice(0, ci).trim(); type = t.slice(ci + 1).trim(); }
  if (!name) return null;
  const a = createAttribute(name, type, visibility);
  a.defaultValue = defaultValue;
  return { item: a };
}

function row(labelText, inputOpts = {}) {
  const row = document.createElement('div');
  row.className = 'qe-row';
  const label = document.createElement('span');
  label.className = 'qe-label';
  label.textContent = labelText;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'qe-input';
  if (inputOpts.value !== undefined) input.value = inputOpts.value;
  if (inputOpts.placeholder) inputOpts && (input.placeholder = inputOpts.placeholder);
  row.appendChild(label);
  row.appendChild(input);
  return { row, input };
}

export function openQuickEdit(canvas, view, model, opts = {}) {
  close();
  if (!view) return;
  const isClassLike = model && Array.isArray(model.attributes) && model.type !== 'UMLEnumeration';
  const isEnum = model && model.type === 'UMLEnumeration';
  const noteLike = view.$type === 'UMLNote' || view.$type === 'UMLConstraint';

  panel = document.createElement('div');
  panel.className = 'quickedit';

  const addField = (label, value, onCommit, placeholder = '') => {
    const { row: rw, input } = row(label, { value, placeholder });
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); onCommit(input.value); }
      if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', () => onCommit(input.value));
    panel.appendChild(rw);
    return input;
  };

  const setProp = (prop, value) => {
    const old = model[prop];
    if (!model || old === value) return;
    commandStack.exec({
      label: 'set ' + prop,
      redo: () => { model[prop] = value; },
      undo: () => { model[prop] = old; },
    });
  };

  const firstInput = addField('name', model ? model.name : (view.text || ''), (v) => {
    if (model) setProp('name', v.trim());
    else {
      const old = view.text;
      if (old !== v) commandStack.exec({ label: 'set text', redo: () => { view.text = v; }, undo: () => { view.text = old; } });
    }
  });
  if (!noteLike) addField('stereotype', model ? (model.stereotype || '') : '', (v) => setProp('stereotype', v.trim()));

  const addMemberRow = (kind) => {
    const sec = document.createElement('div');
    sec.className = 'qe-section';
    sec.textContent = kind === 'attribute' ? 'attribute' : 'operation';
    panel.appendChild(sec);
    const rw = document.createElement('div');
    rw.className = 'qe-row';
    const plus = document.createElement('button');
    plus.className = 'qe-plus';
    plus.textContent = '＋';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'qe-input';
    input.placeholder = kind === 'attribute' ? '+name: type' : '+name(p: type): ret';
    rw.appendChild(input);
    rw.appendChild(plus);
    panel.appendChild(rw);
    const commit = () => {
      const parsed = parseMemberLine(input.value, kind);
      if (!parsed) return;
      const key = kind === 'attribute' ? 'attributes' : 'operations';
      const old = model[key];
      commandStack.exec({
        label: 'quick add ' + kind,
        redo: () => { model[key] = [...old, parsed.item]; },
        undo: () => { model[key] = old; },
      });
      input.value = '';
      input.focus();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') close();
    });
    plus.addEventListener('click', commit);
  };

  if (isClassLike) {
    addMemberRow('attribute');
    addMemberRow('operation');
  } else if (isEnum) {
    addMemberRow('attribute'); // repurposed: enum literal row
    // adjust label for enums
    const secs = panel.querySelectorAll('.qe-section');
    secs[secs.length - 1].textContent = 'literal';
  } else if (noteLike) {
    const rw = document.createElement('div');
    const ta = document.createElement('textarea');
    ta.className = 'qe-input qe-textarea';
    ta.value = model ? (model.documentation || '') : '';
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    ta.addEventListener('blur', () => setProp('documentation', ta.value));
    rw.appendChild(ta);
    panel.appendChild(rw);
  }

  // position near the element's top-left, StarUML-style
  const r = canvas.svg.getBoundingClientRect();
  const sx = r.left + view.x * canvas.zoom + canvas.panX + 26;
  const sy = r.top + view.y * canvas.zoom + canvas.panY + 4;
  document.body.appendChild(panel);
  const pw = panel.getBoundingClientRect();
  panel.style.left = Math.max(6, Math.min(sx, window.innerWidth - pw.width - 8)) + 'px';
  panel.style.top = Math.max(6, Math.min(sy, window.innerHeight - pw.height - 8)) + 'px';

  firstInput.focus();
  firstInput.select();

  setTimeout(() => {
    const closer = (e) => {
      if (panel && !panel.contains(e.target)) { close(); window.removeEventListener('mousedown', closer); }
    };
    window.addEventListener('mousedown', closer);
  }, 0);
}

export function closeQuickEdit() { close(); }
export function quickEditOpen() { return !!panel; }

/** Communication-diagram link: edit the numbered messages stacked on a connector. */
export function openConnectorEdit(canvas, view) {
  close();
  if (!view) return;
  panel = document.createElement('div');
  panel.className = 'quickedit';
  const sec = document.createElement('div');
  sec.className = 'qe-section';
  sec.textContent = 'message';
  panel.appendChild(sec);

  const msgs = view.messages || [];
  const inputs = [];
  msgs.forEach((msg, i) => {
    const rw = document.createElement('div');
    rw.className = 'qe-row';
    const label = document.createElement('span');
    label.className = 'qe-label';
    label.textContent = `${i + 1}:`;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'qe-input';
    input.value = msg.text || '';
    input.placeholder = 'name()';
    rw.appendChild(label);
    rw.appendChild(input);
    panel.appendChild(rw);
    inputs.push({ input, i });
  });
  if (!msgs.length) {
    const empty = document.createElement('div');
    empty.className = 'qe-label';
    empty.textContent = '（用消息工具添加）';
    panel.appendChild(empty);
  }

  const commitAll = () => {
    const next = msgs.map((m, i) => ({ text: inputs[i] ? inputs[i].input.value : m.text }));
    const changed = next.some((m, i) => m.text !== msgs[i].text);
    if (!changed) return;
    commandStack.exec({
      label: 'edit messages',
      redo: () => { view.messages = next; },
      undo: () => { view.messages = msgs; },
    });
  };
  for (const { input } of inputs) {
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); commitAll(); }
      if (e.key === 'Escape') close();
    });
    input.addEventListener('blur', commitAll);
  }

  const r = canvas.svg.getBoundingClientRect();
  const mid = (view.points && view.points[Math.floor(view.points.length / 2)]) || { x: view.x, y: view.y };
  const sx = r.left + mid.x * canvas.zoom + canvas.panX + 16;
  const sy = r.top + mid.y * canvas.zoom + canvas.panY - 10;
  document.body.appendChild(panel);
  const pw = panel.getBoundingClientRect();
  panel.style.left = Math.max(6, Math.min(sx, window.innerWidth - pw.width - 8)) + 'px';
  panel.style.top = Math.max(6, Math.min(sy, window.innerHeight - pw.height - 8)) + 'px';
  if (inputs.length) { inputs[0].input.focus(); inputs[0].input.select(); }

  setTimeout(() => {
    const closer = (e) => {
      if (panel && !panel.contains(e.target)) { close(); window.removeEventListener('mousedown', closer); }
    };
    window.addEventListener('mousedown', closer);
  }, 0);
}
