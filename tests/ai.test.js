// tests/ai.test.js — AI DSL validation, builder, and JSON extraction

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDsl, buildDiagram, systemPrompt, DSL_VERSION } from '../js/ai/dsl.js';
import { extractJson } from '../js/ai/client.js';

test('extractJson tolerates fences and prose', () => {
  const a = extractJson('{"diagram":"class","nodes":[]}');
  assert.equal(a.diagram, 'class');
  const b = extractJson('好的，这是结果：\n```json\n{"diagram":"object","nodes":[{"kind":"object","name":"o1"}]}\n```');
  assert.equal(b.nodes[0].name, 'o1');
  const c = extractJson('前缀文字 {"a":{"b":[1,2]}} 尾随文字');
  assert.deepEqual(c.a.b, [1, 2]);
  assert.throws(() => extractJson('完全没有 JSON'));
});

test('validateDsl catches schema problems', () => {
  assert.equal(validateDsl({ diagram: 'class', nodes: [{ kind: 'class', name: 'A' }] }).ok, true);
  const bad = validateDsl({
    diagram: 'sequence', // unsupported in v1
    nodes: [{ kind: 'class', name: 'A' }, { kind: 'class', name: 'A' }, { kind: 'class' }],
    edges: [{ type: 'association', from: 'A', to: 'MISSING' }, { type: 'wedo', from: 'A', to: 'A' }],
  });
  assert.equal(bad.ok, false);
  const text = bad.errors.join('\n');
  assert.match(text, /sequence/);
  assert.match(text, /重复/);
  assert.match(text, /缺少 name/);
  assert.match(text, /MISSING/);
  assert.match(text, /未知 type/);
});

test('buildDiagram creates models and wired views from DSL', () => {
  const dsl = {
    diagram: 'class',
    nodes: [
      { kind: 'class', name: 'Order', stereotype: 'entity',
        attributes: ['+id: String [1]', '-total: double'], operations: ['+submit(): void'] },
      { kind: 'enumeration', name: 'Status', literals: ['OPEN', 'PAID'] },
      { kind: 'actor', name: 'Customer' },
    ],
    edges: [
      { type: 'generalization', from: 'Order', to: 'Status' },
      { type: 'association', from: 'Customer', to: 'Order', tailMultiplicity: '1', headMultiplicity: '0..*', headRoleName: 'places' },
    ],
  };
  const built = buildDiagram(dsl, { name: 'AI Test' });
  assert.equal(built.nodeCount, 3);
  assert.equal(built.edgeCount, 2);
  assert.equal(built.diagram.type, 'UMLClassDiagram');
  const views = built.diagram.elements;
  const entView = views.find((v) => v.$type === 'UMLEnumeration');
  assert.ok(entView, 'enum view exists');
  const genView = views.find((v) => v.$type === 'UMLGeneralization');
  const assocView = views.find((v) => v.$type === 'UMLAssociation');
  const modelIds = new Set(built.models.map((m) => m._id));
  // edges reference node view ids and node views reference model ids
  assert.ok(modelIds.has(genView.tail) === false && modelIds.has(genView.head) === false);
  const nodeViews = views.filter((v) => !v.isEdge);
  const viewIds = new Set(nodeViews.map((v) => v._id));
  assert.ok(viewIds.has(genView.tail) && viewIds.has(genView.head));
  assert.ok(viewIds.has(assocView.tail) && viewIds.has(assocView.head));
  // members parsed from shorthand
  const order = built.models.find((m) => m.name === 'Order');
  assert.equal(order.visibility ?? 'public', 'public');
  assert.equal(order.attributes[0].name, 'id');
  assert.equal(order.attributes[0].visibility, 'public');
  assert.equal(order.attributes[1].visibility, 'private');
  assert.equal(order.operations[0].name, 'submit');
  assert.equal(order.operations[0].returnType, 'void');
  const status = built.models.find((m) => m.name === 'Status');
  assert.equal(status.literals[0].name, 'OPEN');
  // grid layout: three nodes → two columns used, second row starts below
  const xs = nodeViews.map((v) => v.x).sort((a, b) => a - b);
  assert.ok(xs[1] > xs[0]);
});

test('buildDiagram rejects invalid DSL with a clear error', () => {
  assert.throws(() => buildDiagram({ diagram: 'class', nodes: [], edges: [] }), /nodes 不能为空/);
});

test('system prompt describes the DSL contract', () => {
  const p = systemPrompt();
  assert.match(p, new RegExp(`DSL v${DSL_VERSION}`));
  assert.match(p, /association/);
  assert.match(p, /name 必须唯一/);
});
