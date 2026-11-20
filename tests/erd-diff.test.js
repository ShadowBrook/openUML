// tests/erd-diff.test.js — ERD diff → migration ops → ALTER script

import test from 'node:test';
import assert from 'node:assert/strict';
import { diffERD, emitMigration, describeOp, isDestructiveOp } from '../js/core/erd-diff.js';

const ent = (name, columns = [], indexes = []) => ({ _id: 'e-' + name, type: 'ERDEntity', name, columns, indexes, documentation: '' });
const pkc = (name, type = 'BIGINT') => ({ name, type, primaryKey: true, notNull: true });
const col = (name, type = 'INT', extra = {}) => ({ name, type, primaryKey: false, notNull: false, ...extra });

const base = () => ({
  entities: [
    ent('user', [pkc('id'), col('email', 'VARCHAR(100)', { notNull: true })]),
    ent('order', [pkc('id'), col('user_id', 'BIGINT', { notNull: true, foreignKey: true })],
      [{ name: 'idx_order_user', columns: 'user_id', unique: false }]),
  ],
  references: [{
    child: ent('order'), parent: ent('user'),
    fkColumns: 'user_id', parentColumns: '',
    onDelete: 'CASCADE', onUpdate: 'RESTRICT',
  }],
});

test('diffERD detects new/dropped tables and columns', () => {
  const target = {
    entities: [
      ent('user', [pkc('id'), col('email', 'VARCHAR(100)', { notNull: true }), col('age')]),
      ent('order', [pkc('id'), col('user_id', 'BIGINT', { notNull: true })]),
      ent('product', [pkc('id')]),
    ],
    references: [],
  };
  const ops = diffERD(base(), target);
  assert.ok(ops.some((o) => o.op === 'create_table' && o.entity.name === 'product'));
  assert.ok(ops.some((o) => o.op === 'add_column' && o.table === 'user' && o.col.name === 'age'));
  assert.ok(!ops.some((o) => o.op === 'drop_table'), 'user/order 都存在,无删表');
  // idx_order_user 在 target 缺失 → drop_index；FK 在 target 缺失 → drop_fk
  assert.ok(ops.some((o) => o.op === 'drop_index' && o.name === 'idx_order_user'));
  assert.ok(ops.some((o) => o.op === 'drop_fk'));
  assert.ok(ops.filter(isDestructiveOp).every((o) => ['drop_table', 'drop_column', 'drop_index', 'drop_fk', 'alter_column'].includes(o.op)));
});

test('diffERD emits alter_column with field-level changes', () => {
  const target = {
    entities: [ent('user', [pkc('id'), col('email', 'VARCHAR(200)', { notNull: true, defaultValue: "'anon'" })])],
    references: [],
  };
  const current = {
    entities: [ent('user', [pkc('id'), col('email', 'VARCHAR(100)', { notNull: true })])],
    references: [],
  };
  const ops = diffERD(current, target);
  const alters = ops.filter((o) => o.op === 'alter_column');
  assert.equal(alters.length, 1);
  assert.deepEqual(Object.keys(alters[0].changes).sort(), ['defaultValue', 'type']);
  assert.equal(alters[0].destructive, true); // 类型变更 = 破坏性
});

test('emitMigration renders non-destructive ops and comments out destructive ones by default', () => {
  const current = base();
  current.entities.push(ent('legacy', [pkc('id')])); // 将被删除的表
  const target = {
    entities: [
      ent('user', [pkc('id'), col('email', 'VARCHAR(100)', { notNull: true }), col('age')]),
      ent('order', [pkc('id'), col('user_id', 'BIGINT', { notNull: true })]),
    ],
    references: [],
  };
  const ops = diffERD(current, target);
  const sql = emitMigration(ops, 'mysql');
  assert.ok(sql.includes('ALTER TABLE `user` ADD COLUMN `age` INT;'));
  assert.ok(sql.includes('-- [未勾选，跳过] 删除表 legacy'));
  assert.ok(sql.includes('-- DROP TABLE `legacy`;'));
  assert.ok(!/^DROP TABLE `legacy`;/m.test(sql), '破坏性操作默认不落明文语句');
  assert.ok(sql.includes('-- [未勾选，跳过] 删外键'));
});

test('emitMigration honors selected op set and dialect profiles', () => {
  const current = { entities: [ent('user', [pkc('id'), col('email', 'VARCHAR(100)')])], references: [] };
  const target = { entities: [ent('user', [pkc('id'), col('email', 'VARCHAR(200)')])], references: [] };
  const ops = diffERD(current, target);
  const pg = emitMigration(ops, 'postgresql', { selected: new Set([0]) });
  assert.ok(pg.includes('ALTER TABLE "user" ALTER COLUMN "email" TYPE VARCHAR(200);'));
  const mysql = emitMigration(ops, 'mysql', { selected: new Set([0]) });
  assert.ok(mysql.includes('MODIFY COLUMN `email` VARCHAR(200)'));
  const sqlite = emitMigration(ops, 'sqlite', { selected: new Set([0]) });
  assert.ok(sqlite.includes('SQLite 列类型/主键变更需重建表保数据'));
});

test('describeOp gives human-readable summaries', () => {
  assert.equal(describeOp({ op: 'add_column', table: 'user', col: { name: 'age' } }), '加列 user.age');
  assert.equal(describeOp({ op: 'create_table', entity: { name: 'product', columns: [{}] } }), '新建表 product（1 列）');
});

test('add_fk ops reuse the DDL emission convention', () => {
  const current = { entities: base().entities, references: [] };
  const target = base();
  const ops = diffERD(current, target);
  const fk = ops.find((o) => o.op === 'add_fk');
  assert.ok(fk, 'target 多出的 FK 应产出 add_fk');
  const sql = emitMigration(ops, 'mysql', { selected: new Set([ops.indexOf(fk)]) });
  assert.ok(sql.includes('ADD CONSTRAINT `fk_order_user`'));
  assert.ok(sql.includes('ON DELETE CASCADE'));
});

test('diffERD detects check constraint add/drop and emits ALTER', () => {
  const current = { entities: [ent('user', [pkc('id')], [],
    )], references: [] };
  current.entities[0].checkConstraints = [{ name: 'ck_age', expression: 'age >= 0' }];
  const target = { entities: [ent('user', [pkc('id')], [])], references: [] };
  target.entities[0].checkConstraints = [{ name: 'ck_age', expression: 'age >= 0 AND age < 200' }];
  const ops = diffERD(current, target);
  // 表达式变化 = 先 drop(破坏性)后 add
  assert.ok(ops.some((o) => o.op === 'add_check'));
  assert.ok(ops.some((o) => o.op === 'drop_check' && o.destructive));
  const sql = emitMigration(ops, 'postgresql', { selected: new Set([ops.indexOf(ops.find((o) => o.op === 'add_check'))]) });
  assert.ok(sql.includes('ADD CONSTRAINT "ck_age" CHECK (age >= 0 AND age < 200);'));
  assert.ok(sql.includes('-- ALTER TABLE "user" DROP CONSTRAINT "ck_age";'));
});
