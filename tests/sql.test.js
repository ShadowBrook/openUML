// tests/sql.test.js — DDL generation across the four dialects (behavior lock
// for the profile-driven refactor) + SQL reverse parsing round-trip.

import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSQL, parseSQL, collectERD, SQL_DIALECTS } from '../js/sql.js';

const mkUser = () => ({
  _id: 'e-user', type: 'ERDEntity', name: 'user',
  documentation: '用户表',
  columns: [
    { name: 'id', type: 'BIGINT', primaryKey: true, notNull: true },
    { name: 'email', type: 'VARCHAR(100)', notNull: true, unique: true, comment: 'login email' },
  ],
  indexes: [],
});

const mkOrder = () => ({
  _id: 'e-order', type: 'ERDEntity', name: 'order',
  documentation: '',
  columns: [
    { name: 'id', type: 'BIGINT', primaryKey: true, notNull: true },
    { name: 'user_id', type: 'BIGINT', notNull: true },
  ],
  indexes: [{ name: 'idx_order_user', columns: 'user_id', unique: false }],
});

const mkRefs = () => [{
  child: mkOrder(), parent: mkUser(),
  childModelId: 'e-order', parentModelId: 'e-user',
  fkColumns: 'user_id', parentColumns: '',
  onDelete: 'CASCADE', onUpdate: 'RESTRICT',
}];

const stmtsOf = (sql) => sql.split('\n\n').slice(1).map((s) => s.trim()).filter(Boolean); // 去掉头两行(方言+时间戳)

test('generateSQL emits MySQL dialect with inline PK and comments', () => {
  const sql = generateSQL([mkUser(), mkOrder()], mkRefs(), 'mysql',
    [{ name: 'v_active', sql: 'SELECT * FROM user' }]);
  assert.equal(stmtsOf(sql)[0],
    'CREATE TABLE `user` (\n' +
    '  `id` BIGINT NOT NULL PRIMARY KEY,\n' +
    '  `email` VARCHAR(100) NOT NULL UNIQUE COMMENT \'login email\'\n' +
    ')COMMENT = \'用户表\';');
  assert.equal(stmtsOf(sql)[1], 'CREATE TABLE `order` (\n  `id` BIGINT NOT NULL PRIMARY KEY,\n  `user_id` BIGINT NOT NULL\n);');
  assert.equal(stmtsOf(sql)[2], 'CREATE VIEW `v_active` AS\n  SELECT * FROM user;');
  assert.equal(stmtsOf(sql)[3], 'CREATE INDEX `idx_order_user` ON `order` (`user_id`);');
  assert.equal(stmtsOf(sql)[4],
    'ALTER TABLE `order` ADD CONSTRAINT `fk_order_user`\n' +
    '  FOREIGN KEY (`user_id`)\n' +
    '  REFERENCES `user` (`id`)\n' +
    '  ON DELETE CASCADE\n' +
    '  ON UPDATE RESTRICT;');
});

test('generateSQL emits PostgreSQL with table-level PK and COMMENT ON', () => {
  const sql = generateSQL([mkUser(), mkOrder()], [], 'postgresql', []);
  const s = stmtsOf(sql);
  assert.equal(s[0],
    'CREATE TABLE "user" (\n' +
    '  "id" BIGINT NOT NULL,\n' +
    '  "email" VARCHAR(100) NOT NULL UNIQUE,\n' +
    '  PRIMARY KEY ("id")\n' +
    ');');
  assert.ok(s[1].startsWith('COMMENT ON COLUMN "user"."email" IS \'login email\''));
  assert.ok(s[2].startsWith('COMMENT ON TABLE "user" IS \'用户表\''));
  assert.ok(s[3].startsWith('CREATE TABLE "order"'));
});

test('generateSQL emits SQLite with inline PK and no comments', () => {
  const sql = generateSQL([mkUser()], [], 'sqlite', []);
  const s = stmtsOf(sql);
  assert.equal(s[0],
    'CREATE TABLE "user" (\n' +
    '  "id" BIGINT NOT NULL PRIMARY KEY,\n' +
    '  "email" VARCHAR(100) NOT NULL UNIQUE\n' +
    ');');
  assert.ok(!s.some((x) => x.includes('COMMENT')));
});

test('generateSQL ANSI keeps the single-PK emission quirk and quoted identifiers', () => {
  const sql = generateSQL([mkUser()], [], 'ansi', []);
  const s = stmtsOf(sql);
  // 现状锁定：单列主键在 ansi 方言下既不内联也不出表级 PRIMARY KEY
  assert.equal(s[0], 'CREATE TABLE "user" (\n  "id" BIGINT NOT NULL,\n  "email" VARCHAR(100) NOT NULL UNIQUE\n);');
});

test('parseSQL round-trips tables, inline constraints and ALTER FKs', () => {
  const ddl = [
    'CREATE TABLE `user` (`id` BIGINT PRIMARY KEY, `email` VARCHAR(100) NOT NULL UNIQUE) COMMENT \'x\';',
    'CREATE TABLE `order` (`id` BIGINT PRIMARY KEY, `user_id` BIGINT NOT NULL,',
    '  CONSTRAINT `fk1` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE);',
    'ALTER TABLE `order` ADD CONSTRAINT `fk2` FOREIGN KEY (`user_id`, `t`) REFERENCES `user` (`id`, `t`) ON UPDATE SET NULL;',
  ].join('\n');
  const { entities, references } = parseSQL(ddl);
  assert.equal(entities.length, 2);
  const order = entities.find((e) => e.name === 'order');
  assert.equal(order.columns.length, 2);
  assert.ok(order.columns[0].primaryKey);
  assert.equal(references.length, 2); // 内联 + ALTER 各一条
  assert.equal(references[1].parentColumns, '`id`, `t`'); // 现状锁定：ALTER 路径保留引用符
  assert.equal(references[1].onUpdate, 'SET NULL');
});

test('SQL_DIALECTS keeps the four supported dialects', () => {
  assert.deepEqual(Object.keys(SQL_DIALECTS), ['mysql', 'postgresql', 'sqlite', 'ansi']);
});

// ---------- 交替键 / Check 约束 DDL ----------

test('generateSQL emits alternate keys as table-level UNIQUE and check constraints', () => {
  const ent = {
    _id: 'e1', type: 'ERDEntity', name: 'user', documentation: '',
    columns: [{ name: 'id', type: 'BIGINT', primaryKey: true, notNull: true }],
    indexes: [],
    alternateKeys: [
      { _id: 'ak1', name: 'ak_user_email', columns: 'email' },
      { _id: 'ak2', name: 'ak_user_login', columns: 'domain, handle' },
    ],
    checkConstraints: [
      { _id: 'ck1', name: 'ck_age', expression: 'age >= 0' },
      { _id: 'ck2', name: '', expression: 'len > 0' },
    ],
  };
  const sql = generateSQL([ent], [], 'mysql', []);
  const s = stmtsOf(sql)[0];
  assert.ok(s.includes('UNIQUE (`email`)'), '单列 AK');
  assert.ok(s.includes('UNIQUE (`domain`, `handle`)'), '复合 AK');
  assert.ok(s.includes('CONSTRAINT `ck_age` CHECK (age >= 0)'), '命名 Check');
  assert.ok(s.includes('CHECK (len > 0)'), '未命名 Check');
  // AK 空列与空表达式不产生行
  const bare = { ...ent, alternateKeys: [{ _id: 'ak3', name: 'x', columns: '' }], checkConstraints: [{ _id: 'ck3', name: 'y', expression: '' }] };
  const s2 = stmtsOf(generateSQL([bare], [], 'ansi', []))[0];
  assert.ok(!s2.includes('UNIQUE'), '空 AK 跳过');
  assert.ok(!s2.includes('CHECK'), '空表达式跳过');
});

test('parseSQL reads types for quoted column names (regression)', () => {
  // 存量缺陷:带引用符的列名原先解析出空类型,迁移会误判类型变更
  const { entities } = parseSQL('CREATE TABLE `user` (`id` BIGINT PRIMARY KEY, "email" VARCHAR(100) NOT NULL);');
  const user = entities[0];
  assert.equal(user.columns[0].type, 'BIGINT');
  assert.equal(user.columns[1].type, 'VARCHAR(100)');
});
