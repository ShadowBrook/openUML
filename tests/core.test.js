// tests/core.test.js — command stack, repository tree, serialization, validator.
// Run with:  node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import { Rect } from '../js/core/geometry.js';
import { repository } from '../js/core/repository.js';
import { commandStack, serializeProject, deserializeProject } from '../js/core/commands.js';
import { createProject, createModel, createDiagram } from '../js/core/factory.js';
import { validateProject } from '../js/core/validator.js';

function freshProject() {
  repository.root = createProject();
  repository._index = new Map();
  repository.walk((n) => repository._index.set(n._id, n));
  commandStack.undoStack.length = 0;
  commandStack.redoStack.length = 0;
  return repository.root;
}

test('Rect containment', () => {
  const r = new Rect(0, 0, 10, 10);
  assert.ok(r.contains(5, 5));
  assert.ok(r.contains(0, 0));
  assert.ok(!r.contains(11, 5));
  assert.ok(!r.contains(-1, 5));
});

test('command stack undo/redo restores model state', () => {
  freshProject();
  const model = createModel('UMLClass', 'Order');
  repository.addChild(repository.root, model);
  const old = model.name;
  commandStack.exec({
    label: 'rename',
    redo: () => { model.name = 'Renamed'; },
    undo: () => { model.name = old; },
  });
  assert.equal(model.name, 'Renamed');
  commandStack.undo();
  assert.equal(model.name, 'Order');
  commandStack.redo();
  assert.equal(model.name, 'Renamed');
  assert.equal(commandStack.undoStack.length, 1);
});

test('project serialization round-trips the ownership tree', () => {
  const root = freshProject();
  const model = createModel('UMLClass', 'Item');
  model.attributes.push({ _id: 'a1', $type: 'UMLAttribute', name: 'id', type: 'int', multiplicity: '1', visibility: 'public', defaultValue: '', isStatic: false });
  repository.addChild(repository.root, model);
  const diagram = createDiagram('UMLClassDiagram', 'Main');
  diagram.elements.push({ _id: 'v1', $type: 'UMLClass', modelRef: model._id, x: 10, y: 10, width: 100, height: 60 });
  repository.addChild(repository.root, diagram);
  const clone = deserializeProject(serializeProject(root));
  const clonedModel = clone.ownedElements.find((n) => n.name === 'Item');
  const clonedDiagram = clone.ownedElements.find((n) => n.type === 'UMLClassDiagram');
  assert.ok(clonedModel);
  assert.equal(clonedModel.attributes[0].multiplicity, '1');
  assert.equal(clonedDiagram.elements[0].modelRef, clonedModel._id);
});

test('repository removeChild detaches and addChild re-attaches', () => {
  freshProject();
  const model = createModel('UMLClass', 'Solo');
  repository.addChild(repository.root, model);
  assert.equal(model.__parent, repository.root);
  repository.removeChild(model);
  assert.equal(model.__parent, null);
  assert.ok(!repository.root.ownedElements.includes(model));
  repository.addChild(repository.root, model);
  assert.ok(repository.root.ownedElements.includes(model));
});

test('validator flags duplicate and empty names', () => {
  const root = freshProject();
  const a = createModel('UMLClass', 'Dup');
  const b = createModel('UMLClass', 'Dup');
  const c = createModel('UMLClass', '');
  repository.addChild(root, a);
  repository.addChild(root, b);
  repository.addChild(root, c);
  const issues = validateProject(repository, root);
  const codes = issues.map((i) => i.code);
  assert.ok(codes.includes('duplicate-name'), JSON.stringify(codes));
  assert.ok(codes.includes('empty-name'), JSON.stringify(codes));
});
