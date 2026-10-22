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
    diagram: 'mindmap', // unsupported family
    nodes: [{ kind: 'class', name: 'A' }, { kind: 'class', name: 'A' }, { kind: 'class' }],
    edges: [{ type: 'association', from: 'A', to: 'MISSING' }, { type: 'wedo', from: 'A', to: 'A' }],
  });
  assert.equal(bad.ok, false);
  const text = bad.errors.join('\n');
  assert.match(text, /mindmap/);
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

test('sequence builder lays out lifelines and ordered messages', () => {
  const dsl = {
    diagram: 'sequence',
    participants: [{ name: '客户端' }, { name: '服务端' }, { name: '数据库' }],
    messages: [
      { from: '客户端', to: '服务端', text: '登录', sort: 'sync' },
      { from: '服务端', to: '数据库', text: '校验', sort: 'sync' },
      { from: '服务端', to: '客户端', text: '结果', sort: 'reply' },
    ],
  };
  const built = buildDiagram(dsl, { name: 'Seq' });
  assert.equal(built.nodeCount, 3);
  assert.equal(built.edgeCount, 3);
  const views = built.diagram.elements;
  const lifelines = views.filter((v) => v.$type === 'UMLLifeLine');
  assert.equal(lifelines.length, 3);
  const msgs = views.filter((v) => v.isMessage);
  assert.equal(msgs.length, 3);
  assert.deepEqual(msgs.map((m) => m.$type), ['UMLMessage+sync', 'UMLMessage+sync', 'UMLMessage+reply']);
  // messages ordered top to bottom, attached to the right lifelines
  assert.ok(msgs[0].y < msgs[1].y && msgs[1].y < msgs[2].y);
  const llIds = new Set(lifelines.map((v) => v._id));
  assert.ok(llIds.has(msgs[0].tail) && llIds.has(msgs[0].head));
});

test('activity builder maps node kinds and control flow', () => {
  const dsl = {
    diagram: 'activity',
    nodes: [
      { kind: 'initial', name: 'start' },
      { kind: 'action', name: '提交订单' },
      { kind: 'decision', name: '库存足够?' },
      { kind: 'action', name: '发货' },
      { kind: 'final', name: 'end' },
    ],
    edges: [
      { type: 'control', from: 'start', to: '提交订单' },
      { type: 'control', from: '提交订单', to: '库存足够?' },
      { type: 'control', from: '库存足够?', to: '发货', name: '[是]' },
      { type: 'control', from: '库存足够?', to: 'end', name: '[否]' },
    ],
  };
  const built = buildDiagram(dsl, { name: 'Act' });
  assert.equal(built.nodeCount, 5);
  assert.equal(built.edgeCount, 4);
  const views = built.diagram.elements;
  assert.equal(views.filter((v) => v.$type === 'UMLAction').length, 2);
  assert.equal(views.filter((v) => v.$type === 'UMLDecisionNode').length, 1);
  const flows = views.filter((v) => v.$type === 'UMLControlFlow');
  assert.equal(flows.length, 4);
  const guard = built.models.find((m) => m.name === '[是]');
  assert.ok(guard, 'guard label stored as flow model name');
});

test('validateDsl routes sequence/activity errors', () => {
  const seq = validateDsl({ diagram: 'sequence', participants: [], messages: [{ from: 'A', to: 'B' }] });
  assert.match(seq.errors.join('\n'), /participants/);
  const act = validateDsl({ diagram: 'activity', nodes: [{ kind: 'warp', name: 'x' }], edges: [] });
  assert.match(act.errors.join('\n'), /未知 kind/);
});

test('sequence notes occupy flow space and push messages down', () => {
  const dsl = {
    diagram: 'sequence',
    participants: [{ name: '用户' }, { name: '规则引擎' }, { name: '数据集市' }],
    messages: [
      { from: '用户', to: '规则引擎', text: '注册因子', sort: 'sync' },
      { from: '用户', to: '数据集市', text: '查询', sort: 'sync' },
    ],
    notes: [
      { over: ['用户', '规则引擎'], text: '阶段一：配置', at: 0 },
      { over: ['数据集市'], text: '离线计算' },
    ],
  };
  const built = buildDiagram(dsl, { name: 'SeqNotes' });
  const views = built.diagram.elements;
  const notes = views.filter((v) => v.$type === 'UMLNote');
  const msgs = views.filter((v) => v.isMessage);
  assert.equal(notes.length, 2);
  assert.equal(msgs.length, 2);
  for (const n of notes) {
    for (const m of msgs) {
      const inside = m.y >= n.y - 6 && m.y <= n.y + n.height + 6;
      assert.ok(!inside, `message y=${m.y} overlaps note y=${n.y}`);
    }
  }
  assert.ok(notes[0].y < msgs[0].y, 'leading note above first message');
  assert.ok(notes[1].y > msgs[1].y, 'trailing note below last message');
  const docs = notes.map((n) => built.models.find((m) => m._id === n.modelRef)?.documentation);
  assert.deepEqual(docs, ['阶段一：配置', '离线计算']);
  const bad = validateDsl({ ...dsl, notes: [{ over: ['不存在'], text: 'x' }] });
  assert.match(bad.errors.join('\n'), /不在 participants 中/);
});
