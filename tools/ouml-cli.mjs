#!/usr/bin/env node
// ouml-cli.mjs — openUML headless CLI(Luna model-cli 的对应物):
// 复用与浏览器完全相同的领域模块(js/sql.js、js/core/*,node 纯净)。
//
//   ouml validate <file.ouml>
//       模型树校验 + ERD 引用完整性(端点可解析、FK 列存在)
//   ouml generate <file.ouml> [--diagram 名称] [--dialect mysql|postgresql|sqlite|ansi] [-o out.sql]
//       生成 DDL
//   ouml compare <a.ouml> <b.ouml|b.sql> [--dialect ...] [--select all|safe] [-o out.sql]
//       当前 schema → 目标 schema 的迁移脚本(safe 默认只执行非破坏性操作)
//   ouml cdm2pdm <file.ouml> [--apply] [--diagram 名称]
//       CDM→PDM 转换预览;--apply 写回文件(生成 FK 列+覆盖索引)

import { readFileSync, writeFileSync } from 'node:fs';
import { repository } from '../js/core/repository.js';
import { serializeProject, deserializeProject } from '../js/core/commands.js';
import { validateProject } from '../js/core/validator.js';
import { collectERD, generateSQL, parseSQL, cdmToPDM, SQL_DIALECTS } from '../js/sql.js';
import { diffERD, emitMigration, describeOp, isDestructiveOp } from '../js/core/erd-diff.js';

const DIALECTS = Object.keys(SQL_DIALECTS);

function fail(msg, code = 1) {
  console.error(`ouml: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') flags.out = argv[++i];
    else if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next != null && !next.startsWith('--') && ['diagram', 'dialect', 'select'].includes(key)) flags[key] = argv[++i];
      else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

function loadProject(file) {
  let raw;
  try { raw = readFileSync(file, 'utf8'); } catch (e) { fail(`无法读取 ${file}: ${e.message}`); }
  let project;
  try { project = deserializeProject(raw); } catch (e) { fail(`解析失败 ${file}: ${e.message}`); }
  repository.root = project;
  repository._index = new Map();
  repository.walk((n) => repository._index.set(n._id, n));
  return project;
}

function pickDiagram(name) {
  const diagrams = [];
  repository.walk((n) => { if (n.type === 'ERDDiagram' && Array.isArray(n.elements)) diagrams.push(n); });
  if (name) {
    const d = diagrams.find((x) => x.name === name || x._id === name);
    if (!d) fail(`未找到 ERD 图 “${name}”(可用: ${diagrams.map((x) => x.name).join(', ') || '无'})`);
    return d;
  }
  if (!diagrams.length) fail('项目中没有 ERD 图');
  return diagrams[0];
}

function writeOut(text, out) {
  if (out) { writeFileSync(out, text); console.error(`已写出 ${out}`); }
  else console.log(text);
}

function emitTargetRefs(targetText) {
  if (!/CREATE\s+TABLE/i.test(targetText)) fail('目标文件未包含 CREATE TABLE 语句(需要 .ouml 或 .sql)');
  const parsed = parseSQL(targetText);
  if (!parsed.entities.length) fail('目标文件未解析到 CREATE TABLE 语句');
  const byName = new Map(parsed.entities.map((e) => [e.name.toLowerCase(), e]));
  return {
    entities: parsed.entities,
    references: parsed.references.map((r) => ({
      child: byName.get(String(r.childTable).toLowerCase()),
      parent: byName.get(String(r.parentTable).toLowerCase()),
      fkColumns: r.fkColumns, parentColumns: r.parentColumns,
      onDelete: r.onDelete, onUpdate: r.onUpdate,
    })).filter((r) => r.child && r.parent),
  };
}

// ---------------- commands ----------------

function cmdValidate({ positional }) {
  const file = positional[0];
  if (!file) fail('用法: ouml validate <file.ouml>');
  const project = loadProject(file);
  const issues = validateProject(repository, project);
  // ERD 引用完整性
  const erdProblems = [];
  repository.walk((d) => {
    if (d.type !== 'ERDDiagram' || !Array.isArray(d.elements)) return;
    for (const v of d.elements) {
      if (v.$type !== 'ERDReference' && v.$type !== 'ERDRelationship') continue;
      const tailV = repository.lookup(v.tail), headV = repository.lookup(v.head);
      const child = tailV ? repository.lookup(tailV.modelRef) : null;
      const parent = headV ? repository.lookup(headV.modelRef) : null;
      if (!child || !parent) { erdProblems.push(`图 “${d.name}” 引用悬空: tail=${v.tail} head=${v.head}`); continue; }
      for (const c of String(v.fkColumns || '').split(',').map((x) => x.trim()).filter(Boolean)) {
        if (!(child.columns || []).some((col) => col.name.toLowerCase() === c.toLowerCase())) {
          erdProblems.push(`子表 ${child.name} 缺少 FK 列 “${c}”(引用 ${child.name} → ${parent.name})`);
        }
      }
    }
  });
  for (const i of issues) console.log(`[${i.severity || 'warning'}] ${i.label ? i.label + ': ' : ''}${i.message}`);
  for (const p of erdProblems) console.log(`[error] ${p}`);
  console.log(`\n校验完成:${issues.length} 个警告,${erdProblems.length} 个 ERD 错误`);
  if (erdProblems.length) process.exit(2);
}

function cmdGenerate({ positional, flags }) {
  const file = positional[0];
  if (!file) fail('用法: ouml generate <file.ouml> [--diagram 名称] [--dialect 方言] [-o out.sql]');
  const dialect = flags.dialect || 'mysql';
  if (!DIALECTS.includes(dialect)) fail(`未知方言 ${dialect}(可用: ${DIALECTS.join(', ')})`);
  loadProject(file);
  const diagram = pickDiagram(flags.diagram);
  const { entities, references, views } = (() => {
    const r = collectERD(diagram);
    const views = (diagram.elements || []).filter((v) => v.$type === 'ERDView').map((v) => ({ name: v.name, sql: v.sql })).filter((v) => v.name);
    return { ...r, views };
  })();
  if (!entities.length) fail('图中没有实体/表');
  writeOut(generateSQL(entities, references, dialect, views), flags.out);
}

function cmdCompare({ positional, flags }) {
  const [fileA, fileB] = positional;
  if (!fileA || !fileB) fail('用法: ouml compare <a.ouml> <b.ouml|b.sql> [--dialect 方言] [--select all|safe] [-o out.sql]');
  const dialect = flags.dialect || 'mysql';
  if (!DIALECTS.includes(dialect)) fail(`未知方言 ${dialect}(可用: ${DIALECTS.join(', ')})`);
  loadProject(fileA);
  const diagram = pickDiagram(flags.diagram);
  const current = collectERD(diagram);
  let target;
  if (/\.ouml$/i.test(fileB) || fileB.endsWith('.json')) {
    loadProject(fileB); // 切换仓储上下文
    target = collectERD(pickDiagram(flags.diagram));
  } else {
    target = emitTargetRefs(readFileSync(fileB, 'utf8'));
  }
  const ops = diffERD(current, target);
  if (!ops.length) { console.log('-- 无差异,无需迁移'); return; }
  for (const op of ops) console.error(`${isDestructiveOp(op) ? '[destructive]' : '[safe]      '} ${describeOp(op)}`);
  const select = flags.select === 'all'
    ? new Set(ops.map((_, i) => i))
    : new Set(ops.map((op, i) => (!isDestructiveOp(op) ? i : null)).filter((i) => i != null));
  writeOut(emitMigration(ops, dialect, { selected: select }), flags.out);
}

function cmdCdm2pdm({ positional, flags }) {
  const file = positional[0];
  if (!file) fail('用法: ouml cdm2pdm <file.ouml> [--apply] [--diagram 名称]');
  const project = loadProject(file);
  const diagram = pickDiagram(flags.diagram);
  const changes = cdmToPDM(diagram, false, { withIndexes: true });
  if (!changes.length) { console.log('没有可转换的关系(父表需有主键列,且子表未含同名 FK 列)'); return; }
  for (const ch of changes) {
    console.log(`${ch.parent.name} → ${ch.child.name}: ${ch.cols.map((c) => c.name).join(', ')}${ch.index ? ` (+索引 ${ch.index.name})` : ''}`);
  }
  if (!flags.apply) { console.log('\n预览模式;加 --apply 写回文件'); return; }
  cdm2pdmApply(changes);
  const backup = file + '.bak';
  writeFileSync(backup, readFileSync(file));
  writeFileSync(file, serializeProject(project));
  console.log(`\n已写回 ${file}(原文件备份为 ${backup})`);
}

function cdm2pdmApply(changes) {
  for (const ch of changes) {
    ch.child.columns = [...(ch.child.columns || []), ...ch.cols];
    for (const col of ch.cols) col.foreignKey = true;
    if (ch.index) ch.child.indexes = [...(ch.child.indexes || []), ch.index];
  }
}

// ---------------- dispatch ----------------

const [, , command, ...rest] = process.argv;
const handlers = { validate: cmdValidate, generate: cmdGenerate, compare: cmdCompare, cdm2pdm: cmdCdm2pdm };
if (!command || command === '--help' || command === '-h') {
  console.log(`ouml — openUML headless CLI

用法:
  ouml validate <file.ouml>
  ouml generate <file.ouml> [--diagram 名称] [--dialect mysql|postgresql|sqlite|ansi] [-o out.sql]
  ouml compare <a.ouml> <b.ouml|b.sql> [--dialect 方言] [--select all|safe] [-o out.sql]
  ouml cdm2pdm <file.ouml> [--apply] [--diagram 名称]`);
  process.exit(command ? 0 : 1);
}
const handler = handlers[command];
if (!handler) fail(`未知命令 ${command}(可用: ${Object.keys(handlers).join(', ')})`);
handler(parseArgs(rest));
