// tests/erd.test.js — ERD crow's-foot markers + FK linkage strategy

import test from 'node:test';
import assert from 'node:assert/strict';
import { erdCardKind, erdMarkerId, ERD_MARKER_KINDS, erdGlyphSpecs } from '../js/views/edgeviews.js';
import { repository } from '../js/core/repository.js';
import { createProject } from '../js/core/factory.js';
import { planFKColumns, planFKIndex, refFKColumns, cdmToPDM, collectERD } from '../js/sql.js';

test('erdCardKind maps StarUML enums and common text forms', () => {
  assert.equal(erdCardKind('ZERO'), 'zero');
  assert.equal(erdCardKind('1'), 'one');
  assert.equal(erdCardKind('0..1'), 'zeroOrOne');
  assert.equal(erdCardKind('ONE_OR_MANY'), 'oneOrMany');
  assert.equal(erdCardKind('*'), 'many');
  assert.equal(erdCardKind('0..N'), 'many');
  assert.equal(erdCardKind(''), null);
  assert.equal(erdCardKind('   '), null);
  assert.equal(erdCardKind('exactly 7'), 'text'); // 未识别 → 文字回退
});

test('every marker kind has a start and an end marker id', () => {
  for (const kind of ERD_MARKER_KINDS) {
    assert.equal(erdMarkerId(kind, true), `erd-start-${kind}`);
    assert.equal(erdMarkerId(kind, false), `erd-end-${kind}`);
  }
});

test('glyph geometry stays inside the marker viewBox', () => {
  // viewBox is "-18 -6 20 12": x ∈ [-18, 2], y ∈ [-6, 6]
  for (const kind of ERD_MARKER_KINDS) {
    const specs = erdGlyphSpecs(kind);
    assert.ok(specs.length > 0, `${kind} must have glyphs`);
    for (const s of specs) {
      const xs = s.tag === 'circle'
        ? [s.attrs.cx - s.attrs.r, s.attrs.cx + s.attrs.r]
        : [s.attrs.x1, s.attrs.x2];
      const ys = s.tag === 'circle'
        ? [s.attrs.cy - s.attrs.r, s.attrs.cy + s.attrs.r]
        : [s.attrs.y1, s.attrs.y2];
      assert.ok(Math.min(...xs) >= -18 && Math.max(...xs) <= 2, `${kind} x range`);
      assert.ok(Math.min(...ys) >= -6 && Math.max(...ys) <= 6, `${kind} y range`);
    }
  }
});

test('glyph composition matches the notation semantics', () => {
  assert.equal(erdGlyphSpecs('one').length, 1);                       // 单竖线
  assert.equal(erdGlyphSpecs('zero').length, 1);                     // 圆环
  assert.equal(erdGlyphSpecs('zero')[0].tag, 'circle');
  assert.equal(erdGlyphSpecs('zeroOrOne').length, 2);                // ○|
  assert.equal(erdGlyphSpecs('zeroOrOne').filter((s) => s.tag === 'circle').length, 1);
  assert.equal(erdGlyphSpecs('many').length, 3);                     // 三叉爪
  assert.equal(erdGlyphSpecs('oneOrMany').length, 4);                // 爪 + 竖线
  // 爪尖贴着端点（x=-1），爪根距端点 12
  const claw = erdGlyphSpecs('many');
  for (const s of claw) {
    assert.equal(s.attrs.x2, -1);
    assert.equal(s.attrs.x1, -12);
  }
});

// ---------- FK 联动策略（Luna createIndexesForFks / 自动 FK 列） ----------

const pk = (name, type = 'BIGINT') => ({ name, type, primaryKey: true, notNull: true });
const col = (name, type = 'INT') => ({ name, type, primaryKey: false, notNull: false });

test('planFKColumns names FK columns after the parent table and PK', () => {
  const child = { name: 'order', columns: [col('amount')] };
  const parent = { name: 'user', columns: [pk('id')] };
  const cols = planFKColumns(child, parent, 'ONE_OR_MANY');
  assert.equal(cols.length, 1);
  assert.equal(cols[0].name, 'user_id');
  assert.equal(cols[0].type, 'BIGINT');
  assert.equal(cols[0].foreignKey, true);
  assert.equal(cols[0].notNull, true); // 非零端 → 必填
  assert.equal(cols[0].primaryKey, false);
});

test('planFKColumns zero-side cardinality makes the FK column nullable', () => {
  const child = { name: 'order', columns: [] };
  const parent = { name: 'user', columns: [pk('id')] };
  for (const card of ['0..*', 'ZERO', 'ZERO_OR_ONE', 'MANY']) {
    const cols = planFKColumns(child, parent, card);
    assert.equal(cols[0].notNull, false, `cardinality ${card} should be nullable`);
  }
});

test('planFKColumns skips existing columns and maps composite PKs pairwise', () => {
  const child = { name: 'order', columns: [col('user_id')] }; // 已有同名列 → 跳过
  const parent = { name: 'user', columns: [pk('id'), pk('tenant', 'INT')] };
  const cols = planFKColumns(child, parent, 'ONE_OR_MANY');
  assert.deepEqual(cols.map((c) => c.name), ['user_tenant']);
  // fkNames 按位覆盖默认命名
  const named = planFKColumns({ name: 'order', columns: [] }, parent, 'ONE_OR_MANY', ['u_id', 't_id']);
  assert.deepEqual(named.map((c) => c.name), ['u_id', 't_id']);
});

test('planFKIndex skips when an existing index already covers the first FK column', () => {
  const child = { name: 'order', indexes: [{ name: 'manual', columns: 'user_id' }] };
  assert.equal(planFKIndex(child, ['user_id']), null);
  const fresh = { name: 'order', indexes: [] };
  const idx = planFKIndex(fresh, ['user_id', 'user_tenant']);
  assert.equal(idx.name, 'idx_order_user_id');
  assert.equal(idx.columns, 'user_id, user_tenant');
  assert.equal(idx.unique, false);
});

test('refFKColumns matches by fkColumns names among foreignKey columns', () => {
  const child = { name: 'order', columns: [
    { name: 'user_id', foreignKey: true },
    { name: 'note', foreignKey: false },
    { name: 'user_code', foreignKey: true },
  ] };
  const cols = refFKColumns(child, 'user_id, user_code');
  assert.deepEqual(cols.map((c) => c.name), ['user_id', 'user_code']);
  assert.equal(refFKColumns(child, '').length, 0);
  assert.equal(refFKColumns(null, 'user_id').length, 0);
});

test('cdmToPDM resolves reference views correctly and honors fkColumns + cardinality', () => {
  repository.root = createProject({ empty: true });
  repository._index = new Map();
  const parent = { _id: 'm-parent', type: 'ERDEntity', name: 'user', columns: [pk('id')], indexes: [], ownedElements: [] };
  const child = { _id: 'm-child', type: 'ERDEntity', name: 'order', columns: [col('amount')], indexes: [], ownedElements: [] };
  const diagram = { _id: 'd-erd', type: 'ERDDiagram', name: 'ERD', ownedElements: [], elements: [] };
  repository.addChild(repository.root, parent);
  repository.addChild(repository.root, child);
  repository.addChild(repository.root, diagram);
  diagram.elements.push(
    { _id: 'v-parent', $type: 'ERDEntity', modelRef: 'm-parent' },
    { _id: 'v-child', $type: 'ERDEntity', modelRef: 'm-child' },
    { _id: 'v-ref', $type: 'ERDReference', tail: 'v-child', head: 'v-parent',
      tailCardinality: 'ONE_OR_MANY', headCardinality: 'ZERO_OR_ONE' },
  );
  repository.walk((n) => repository._index.set(n._id, n));

  const { references } = collectERD(diagram);
  assert.equal(references.length, 1);
  assert.equal(references[0].headCardinality, 'ZERO_OR_ONE'); // 基数进入描述符

  // apply=false 不改动模型
  const dry = cdmToPDM(diagram, false);
  assert.equal(dry.length, 1);
  assert.equal(child.columns.length, 1);

  // apply=true 生成 FK 列（可空,因 head 是 0..1）
  const changes = cdmToPDM(diagram, true);
  assert.equal(changes.length, 1);
  assert.equal(child.columns.length, 2);
  assert.equal(child.columns[1].name, 'user_id');
  assert.equal(child.columns[1].notNull, false); // 修复：collectERD 丢基数导致可空规则失效
});

test('cdmToPDM withIndexes plans a covering index and respects explicit fkColumns', () => {
  repository.root = createProject({ empty: true });
  repository._index = new Map();
  const parent = { _id: 'mp', type: 'ERDEntity', name: 'user', columns: [pk('id')], indexes: [], ownedElements: [] };
  const child = { _id: 'mc', type: 'ERDEntity', name: 'order', columns: [], indexes: [], ownedElements: [] };
  const diagram = { _id: 'd2', type: 'ERDDiagram', name: 'ERD', ownedElements: [], elements: [] };
  repository.addChild(repository.root, parent);
  repository.addChild(repository.root, child);
  repository.addChild(repository.root, diagram);
  diagram.elements.push(
    { _id: 'vp', $type: 'ERDEntity', modelRef: 'mp' },
    { _id: 'vc', $type: 'ERDEntity', modelRef: 'mc' },
    { _id: 'vr', $type: 'ERDReference', tail: 'vc', head: 'vp', headCardinality: 'ONE_OR_MANY', fkColumns: 'buyer_id' },
  );
  repository.walk((n) => repository._index.set(n._id, n));

  const changes = cdmToPDM(diagram, false, { withIndexes: true });
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0].cols.map((c) => c.name), ['buyer_id']); // 视图 fkColumns 按位覆盖
  assert.ok(changes[0].index, 'withIndexes 应规划覆盖索引');
  assert.equal(changes[0].index.name, 'idx_order_buyer_id');
});

// ---------- 标定关系键传播(属性面板 _applyIdentifying 的纯逻辑等价) ----------

test('identifying propagation merges FK columns into child PK and reverses', () => {
  // 模拟 _applyIdentifying(identifying=true) 的 redo/undo
  const child = { name: 'order', columns: [
    { name: 'id', type: 'BIGINT', primaryKey: true, notNull: true },
    { name: 'user_id', type: 'BIGINT', primaryKey: false, notNull: true },
  ] };
  const targets = child.columns.filter((c) => ['user_id'].includes(c.name));
  const oldStates = targets.map((c) => ({ c, primaryKey: c.primaryKey, notNull: c.notNull }));
  // redo:并入主键
  for (const t of targets) { t.primaryKey = true; t.notNull = true; }
  assert.equal(child.columns[1].primaryKey, true);
  assert.equal(child.columns.filter((c) => c.primaryKey).length, 2, '复合主键形成');
  // undo:还原
  for (const o of oldStates) { o.c.primaryKey = o.primaryKey; o.c.notNull = o.notNull; }
  assert.equal(child.columns[1].primaryKey, false);
  assert.equal(child.columns[1].notNull, true, 'notNull 还原为原值');
});

// ---------- ERD 线模式解析(Luna linegraphics 对应物) ----------

import { resolveErdLineMode, ERD_LINE_MODES } from '../js/views/edgeviews.js';

test('resolveErdLineMode precedence: manual > per-edge > diagram > detailed', () => {
  const dg = { linegraphics: 'basic' };
  // 手动 lineMode(非默认正交)永远优先
  assert.deepEqual(resolveErdLineMode({ lineMode: 'oblique' }, dg), { pathMode: 'oblique', stubs: true });
  // 逐线覆盖压过图级默认
  assert.deepEqual(resolveErdLineMode({ lineGraphics: 'basic_curved' }, dg), { pathMode: 'curved', stubs: false });
  // 图级默认生效
  assert.deepEqual(resolveErdLineMode({}, dg), { pathMode: 'orthogonal', stubs: false });
  // 缺省 = detailed(正交+引出段)
  assert.deepEqual(resolveErdLineMode({}, {}), { pathMode: 'orthogonal', stubs: true });
  assert.deepEqual(resolveErdLineMode({ lineGraphics: 'default' }, {}), { pathMode: 'orthogonal', stubs: true });
  // 映射矩阵
  assert.deepEqual(resolveErdLineMode({ lineGraphics: 'detailed_straight' }, {}), { pathMode: 'oblique', stubs: false });
  assert.deepEqual(resolveErdLineMode({ lineGraphics: 'basic_orthogonal' }, {}), { pathMode: 'orthogonal', stubs: false });
  assert.deepEqual(resolveErdLineMode({ lineGraphics: 'detailed_orthogonal' }, {}), { pathMode: 'orthogonal', stubs: true });
  assert.equal(ERD_LINE_MODES.length, 6);
});
