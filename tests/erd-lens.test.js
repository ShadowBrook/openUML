// tests/erd-lens.test.js — Context Lens 上下文图生成

import test from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '../js/core/repository.js';
import { commandStack } from '../js/core/commands.js';
import { createProject } from '../js/core/factory.js';
import { createContextLensDiagram } from '../js/core/erd-lens.js';

function setup() {
  repository.root = createProject({ empty: true });
  repository._index = new Map();
  while (commandStack.canUndo()) commandStack.undo(); // 清空栈
  const model = { _id: 'm-root', type: 'Model', name: 'Model', ownedElements: [], documentation: '' };
  repository.addChild(repository.root, model);
  repository._index.set(model._id, model);
  return model;
}

const ERD_FIELDS = ['tailCardinality', 'headCardinality', 'fkColumns', 'onDelete'];

test('createContextLensDiagram gathers 1-degree neighbors with semantics, dedup by pair', () => {
  const owner = setup();
  const mkEntity = (id, name) => {
    const m = { _id: id, type: 'ERDEntity', name, columns: [], indexes: [], ownedElements: [] };
    repository.addChild(owner, m);
    repository._index.set(id, m);
    return m;
  };
  const center = mkEntity('c', 'order');
  const user = mkEntity('u', 'user');
  const product = mkEntity('p', 'product');
  const far = mkEntity('f', 'shipment'); // 与中心无引用,不应出现
  const mkDiagram = (id) => {
    const d = { _id: id, type: 'ERDDiagram', name: id, ownedElements: [], elements: [] };
    repository.addChild(owner, d);
    repository._index.set(id, d);
    return d;
  };
  const d1 = mkDiagram('d1');
  const d2 = mkDiagram('d2');
  const entView = (d, vid, m) => {
    const v = { _id: vid, $type: 'ERDEntity', modelRef: m._id };
    d.elements.push(v);
    repository._index.set(vid, v);
    return v;
  };
  const vC1 = entView(d1, 'vc1', center);
  entView(d1, 'vu1', user);
  entView(d1, 'vp1', product);
  entView(d2, 'vu2', user);
  entView(d2, 'vf2', far);
  const mkRef = (d, rid, tailId, headId, sem) => {
    const v = { _id: rid, $type: 'ERDReference', tail: tailId, head: headId, ...sem };
    d.elements.push(v);
    repository._index.set(rid, v);
    return v;
  };
  // order→user 画了两张图(应去重取一条)；product→order 一条；far 不相连
  mkRef(d1, 'r1', 'vu1', 'vc1', { tailCardinality: 'ONE', headCardinality: '0..*', fkColumns: 'buyer_id', onDelete: 'CASCADE' });
  mkRef(d2, 'r2', 'vu2', 'vc1', { tailCardinality: 'ONE', headCardinality: '0..*', fkColumns: 'buyer_id', onDelete: 'CASCADE' });
  mkRef(d1, 'r3', 'vc1', 'vp1', { tailCardinality: 'ONE_OR_MANY', headCardinality: 'ONE' });

  const res = createContextLensDiagram('vc1', owner);
  assert.ok(res, '应成功生成');
  assert.equal(res.nodes, 3, '中心 + 2 个一度邻居');
  assert.equal(res.edges, 2, '去重后 2 条引用');
  assert.equal(res.diagram.name, 'Context: order');

  // 语义字段随图复制、方向保持（child=tail）
  const refs = res.diagram.elements.filter((v) => v.isEdge);
  const buyer = refs.find((v) => v.tailCardinality === 'ONE');
  assert.ok(buyer, 'user→order 引用方向保持(tail=user)');
  assert.equal(buyer.fkColumns, 'buyer_id');
  assert.equal(buyer.onDelete, 'CASCADE');
  const toProduct = refs.find((v) => v.headCardinality === 'ONE');
  assert.ok(toProduct, 'order→product 引用存在');
  assert.ok(!refs.some((v) => v.fkColumns && v.tailCardinality === undefined), '复制完整');

  // 单个可撤销步骤
  commandStack.undo();
  assert.ok(!repository._index.has(res.diagram._id), '撤销后新图移除');
  commandStack.redo();
  assert.ok(repository._index.has(res.diagram._id), '重做后新图恢复');
});

test('createContextLensDiagram returns null for non-entity selection', () => {
  setup();
  const d = { _id: 'dx', type: 'ERDDiagram', name: 'x', ownedElements: [], elements: [] };
  repository.addChild(repository.root, d);
  repository._index.set('dx', d);
  const v = { _id: 'vnote', $type: 'UMLNote' };
  d.elements.push(v);
  repository._index.set('vnote', v);
  assert.equal(createContextLensDiagram('vnote', repository.root), null);
  assert.equal(createContextLensDiagram('missing', repository.root), null);
});
