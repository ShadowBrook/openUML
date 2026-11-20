// tests/cli.test.js — headless CLI(generate/compare/cdm2pdm/validate)端到端

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CLI = join(dirname(fileURLToPath(import.meta.url)), '..', 'tools', 'ouml-cli.mjs');

const PROJECT = {
  _id: 'p', type: 'Project', name: 'CliDemo', documentation: '', ownedElements: [{
    _id: 'm', type: 'Model', name: 'Model', documentation: '', stereotype: '', ownedElements: [
      { _id: 'd', type: 'ERDDiagram', name: 'ERD', ownedElements: [], defaultDiagram: false, elements: [
        { _id: 'vu', $type: 'ERDEntity', modelRef: 'eu', x: 0, y: 0, width: 200, height: 80 },
        { _id: 'vo', $type: 'ERDEntity', modelRef: 'eo', x: 400, y: 200, width: 200, height: 80 },
      ] },
      { _id: 'eu', type: 'ERDEntity', name: 'user', documentation: '', stereotype: '', ownedElements: [], columns: [
        { _id: 'c1', name: 'id', type: 'BIGINT', primaryKey: true, notNull: true, unique: false, comment: '' },
      ], indexes: [], alternateKeys: [], checkConstraints: [] },
      { _id: 'eo', type: 'ERDEntity', name: 'order', documentation: '', stereotype: '', ownedElements: [], columns: [
        { _id: 'c2', name: 'id', type: 'BIGINT', primaryKey: true, notNull: true, unique: false, comment: '' },
        { _id: 'c3', name: 'uid', type: 'BIGINT', primaryKey: false, notNull: true, unique: false, comment: '' },
      ], indexes: [], alternateKeys: [], checkConstraints: [] },
    ] },
  ],
};

function withFixture(t, mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'ouml-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const project = JSON.parse(JSON.stringify(PROJECT));
  if (mutate) mutate(project);
  const file = join(dir, 'demo.ouml');
  writeFileSync(file, JSON.stringify(project));
  return { dir, file };
}

test('cli generate emits DDL to stdout', async (t) => {
  const { file } = withFixture(t);
  const { stdout } = await run('node', [CLI, 'generate', file, '--dialect', 'mysql']);
  assert.ok(stdout.includes('CREATE TABLE `user`'));
  assert.ok(stdout.includes('CREATE TABLE `order`'));
});

test('cli compare against target sql emits migration with safe default', async (t) => {
  const { dir, file } = withFixture(t);
  const targetSql = 'CREATE TABLE `user` (`id` BIGINT PRIMARY KEY, `email` VARCHAR(100) NOT NULL);';
  const targetFile = join(dir, 'target.sql');
  writeFileSync(targetFile, targetSql);
  const { stdout } = await run('node', [CLI, 'compare', file, targetFile, '--dialect', 'mysql']);
  assert.ok(stdout.includes('ADD COLUMN `email`'));
  // 破坏性(删 order 表)默认注释掉
  assert.ok(stdout.includes('-- DROP TABLE `order`;'));
});

test('cli compare --select all includes destructive statements', async (t) => {
  const { dir, file } = withFixture(t);
  const targetFile = join(dir, 'target.sql');
  writeFileSync(targetFile, 'CREATE TABLE `user` (`id` BIGINT PRIMARY KEY);');
  const { stdout } = await run('node', [CLI, 'compare', file, targetFile, '--select', 'all']);
  assert.ok(/\nDROP TABLE `order`;/.test(stdout), 'all 模式下破坏性语句落明文');
});

test('cli validate reports missing FK column as error exit code 2', async (t) => {
  const { file } = withFixture(t, (p) => {
    // 加一条引用(fkColumns=uid),再把子表列改名 → FK 列对不上
    const d = p.ownedElements[0].ownedElements.find((m) => m._id === 'd');
    d.elements.push({ _id: 'vr', $type: 'ERDReference', tail: 'vo', head: 'vu',
      tailCardinality: 'ONE_OR_MANY', headCardinality: 'ONE_OR_MANY', fkColumns: 'uid' });
    const order = p.ownedElements[0].ownedElements.find((m) => m.name === 'order');
    order.columns[1].name = 'user_id_renamed';
  });
  await assert.rejects(
    run('node', [CLI, 'validate', file]),
    (e) => e.code === 2 && e.stdout.includes('缺少 FK 列'),
  );
});

test('cli cdm2pdm preview lists planned columns without writing', async (t) => {
  const { dir, file } = withFixture(t, (p) => {
    // 造一条引用 + 图上补一个视图元素缺失也没关系:cdm2pdm 走 collectERD
    const d = p.ownedElements[0].ownedElements.find((m) => m._id === 'd');
    d.elements.push({ _id: 'vr', $type: 'ERDReference', tail: 'vo', head: 'vu',
      tailCardinality: 'ONE_OR_MANY', headCardinality: 'ONE_OR_MANY' });
  });
  const { stdout } = await run('node', [CLI, 'cdm2pdm', file]);
  assert.ok(stdout.includes('user → order: user_id'), '预览 FK 列');
  assert.ok(stdout.includes('--apply 写回文件'), '默认不写回');
  void dir;
});
