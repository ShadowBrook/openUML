// tests/text-diff.test.js — 行级/词级 diff 与 HTML 报告

import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, diffSegments, buildDiffRows } from '../js/core/text-diff.js';
import { buildMigrationHtml } from '../js/core/erd-report.js';

test('diffLines classifies equal/add/del with trailing-whitespace tolerance', () => {
  const rows = diffLines('a\nb\nc', 'a\nb \nc\n\nd');
  // 旧 3 行 vs 新 5 行:'c' trim 相等,尾部多出 ['', 'd'] 两行新增
  assert.deepEqual(rows.map((r) => r.type), ['equal', 'equal', 'equal', 'add', 'add']);
  const withDel = diffLines('a\nb\nc', 'b\nc');
  assert.deepEqual(withDel.map((r) => r.type), ['del', 'equal', 'equal']);
});

test('diffSegments highlights only the changed token run', () => {
  const { oldSegs, newSegs } = diffSegments('ALTER TABLE u ALTER COLUMN c TYPE VARCHAR(100);',
    'ALTER TABLE u ALTER COLUMN c TYPE VARCHAR(200);');
  const chg = (segs) => segs.filter((s) => s.changed).map((s) => s.text.trim());
  assert.ok(chg(oldSegs).every((t) => t.includes('100')), '旧侧改动只含 100');
  assert.ok(chg(newSegs).every((t) => t.includes('200')), '新侧改动只含 200');
});

test('buildDiffRows merges adjacent del+add into mod rows with segments', () => {
  const rows = buildDiffRows('CREATE TABLE a (id INT);', 'CREATE TABLE a (id BIGINT);');
  const mods = rows.filter((r) => r.kind === 'mod');
  assert.equal(mods.length, 1, '单行替换合并为一条 mod');
  assert.ok(mods[0].oldSegs.some((s) => s.changed));
  assert.ok(mods[0].newSegs.some((s) => s.changed));
  // 混合场景保留 equal 行
  const mixed = buildDiffRows('x\nCREATE TABLE a (id INT);\ny', 'x\nCREATE TABLE a (id BIGINT);\ny');
  assert.ok(mixed.some((r) => r.kind === 'equal'));
});

test('large inputs degrade gracefully instead of exploding', () => {
  const a = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
  const b = Array.from({ length: 5000 }, (_, i) => `line ${i} x`).join('\n');
  const rows = buildDiffRows(a, b);
  assert.ok(rows.length > 0);
});

test('buildMigrationHtml emits self-contained report with ops and diff', () => {
  const html = buildMigrationHtml({
    ops: [
      { op: 'add_column', desc: '加列 user.age', destructive: false, selected: true },
      { op: 'drop_table', desc: '删除表 legacy', destructive: true, selected: false },
    ],
    currentSql: 'CREATE TABLE user (id INT);',
    targetSql: 'CREATE TABLE user (id BIGINT);',
    dialect: 'mysql', title: '迁移报告 — smoke',
  });
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('迁移报告 — smoke'));
  assert.ok(html.includes('加列 user.age'));
  assert.ok(html.includes('⚠ 是'), '破坏性标记');
  assert.ok(html.includes('chg'), '词级高亮类存在');
});
