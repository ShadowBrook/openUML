// tests/layout.test.js — ERD 自动布局:分层/破环/消交叉/分区分组金样例

import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutERD } from '../js/core/erd-layout.js';

const view = (id, w = 160, h = 80, container = null) => ({ _id: id, width: w, height: h, container });

test('chain FK lays parent above child layer by layer', () => {
  // user ← order ← item:三层,父在上
  const views = [view('user'), view('order'), view('item')];
  const refs = [
    { tail: 'order', head: 'user' }, // order(FK 方)在下
    { tail: 'item', head: 'order' },
  ];
  const pos = layoutERD(views, refs);
  assert.ok(pos.get('user').y < pos.get('order').y, 'user 在 order 上层');
  assert.ok(pos.get('order').y < pos.get('item').y, 'order 在 item 上层');
  // 网格吸附
  for (const p of pos.values()) {
    assert.equal(p.x % 10, 0);
    assert.equal(p.y % 10, 0);
  }
});

test('barycenter swaps rows to reduce crossings', () => {
  // P1 P2 / C1 C2,交叉连接 P1→C2, P2→C1 → 重心法应交换使 C1 对齐 P2
  const views = [view('P1'), view('P2'), view('C1'), view('C2')];
  const refs = [
    { tail: 'C2', head: 'P1' },
    { tail: 'C1', head: 'P2' },
  ];
  const pos = layoutERD(views, refs);
  const xOf = (id) => pos.get(id).x;
  // 优化后:C1 应在 P2 正下附近(而非 P1)
  assert.ok(Math.abs(xOf('C1') - xOf('P2')) < Math.abs(xOf('C1') - xOf('P1')),
    `C1(${xOf('C1')}) 应靠近 P2(${xOf('P2')}) 而非 P1(${xOf('P1')})`);
  assert.ok(Math.abs(xOf('C2') - xOf('P1')) < Math.abs(xOf('C2') - xOf('P2')),
    `C2(${xOf('C2')}) 应靠近 P1(${xOf('P1')}) 而非 P2(${xOf('P2')})`);
});

test('cycles are broken without infinite loops and keep all nodes', () => {
  const views = [view('a'), view('b'), view('c')];
  const refs = [
    { tail: 'b', head: 'a' },
    { tail: 'c', head: 'b' },
    { tail: 'a', head: 'c' }, // 环:a←b←c←a
  ];
  const pos = layoutERD(views, refs);
  assert.equal(pos.size, 3, '所有节点都有坐标');
  const ys = new Set([...pos.values()].map((p) => p.y));
  assert.ok(ys.size >= 2, '环成员分层铺开');
});

test('areas split groups horizontally without overlap', () => {
  const views = [
    view('a1', 160, 80, 'area1'),
    view('a2', 160, 80, 'area1'),
    view('b1', 160, 80, 'area2'),
    view('b2', 160, 80, 'area2'),
  ];
  const refs = [
    { tail: 'a2', head: 'a1' },
    { tail: 'b2', head: 'b1' },
    { tail: 'a2', head: 'b1' }, // 跨区引用:两端分属不同组,不参与组内分层
  ];
  const pos = layoutERD(views, refs);
  // 组 1 的 x 全部小于组 2 的最小 x(水平排列不重叠)
  const maxX1 = Math.max(pos.get('a1').x, pos.get('a2').x);
  const minX2 = Math.min(pos.get('b1').x, pos.get('b2').x);
  assert.ok(maxX1 + 160 <= minX2, `组 1 右缘(${maxX1}+160) 不越过组 2 左缘(${minX2})`);
});

test('unlinked tables form a single row without collision', () => {
  const views = [view('t1'), view('t2'), view('t3')];
  const pos = layoutERD(views, []);
  const xs = [...pos.values()].map((p) => p.x).sort((a, b) => a - b);
  assert.ok(xs[1] - xs[0] >= 160, '相邻表无重叠');
  assert.ok(xs[2] - xs[1] >= 160, '相邻表无重叠');
  assert.equal(new Set([...pos.values()].map((p) => p.y)).size, 1, '同行');
});
