// erd-diff.js — ERD 结构 diff → 迁移操作对象 → ALTER 脚本。
// Luna model-alter-script 的 change_operation 框架对应物（轻量版）：
// diffERD 产出纯数据操作对象（可 JSON 序列化、可筛选），emitMigration
// 按 DIALECT_PROFILES 渲染为各方言的迁移 SQL；破坏性操作支持以注释形式
// 输出。temp-table 保数据重建为预留命令类型（rebuild_table）。

import { q, columnDefSQL, indexSQL, fkConstraintSQL, generateSQL, DIALECT_PROFILES } from '../sql.js';

const normName = (s) => String(s || '').trim().toLowerCase();
const splitList = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const profileOf = (dialect) => DIALECT_PROFILES[dialect] || DIALECT_PROFILES.ansi;

/** 列语义签名：参与 alter_column 比较的字段。 */
function colSignature(col) {
  return {
    type: String(col.type || '').trim(),
    notNull: !!col.notNull,
    unique: !!col.unique,
    defaultValue: String(col.defaultValue ?? '').trim(),
    primaryKey: !!col.primaryKey,
  };
}

function indexSignature(idx) {
  return { columns: splitList(idx.columns).map(normName).join(','), unique: !!idx.unique };
}

function refKey(ref) {
  const fk = splitList(ref.fkColumns).map(normName).join(',');
  const pc = splitList(ref.parentColumns).map(normName).join(',');
  return `${normName(ref.child?.name)}>${normName(ref.parent?.name)}:${fk}>${pc}`;
}

/** 操作对象是否破坏性（UI 默认不勾选）。 */
export function isDestructiveOp(op) {
  return op.destructive === true;
}

/**
 * diffERD(current, target)：两端均为 collectERD 形状 {entities, references}
 * （target 的 reference 描述符至少含 child/parent 实体与 fkColumns）。
 * 按表名/列名(大小写不敏感)、索引名、引用键匹配，返回操作对象数组：
 *   create_table / drop_table* / add_column / drop_column* /
 *   alter_column{changes}(类型变更标 destructive*) / add_index / drop_index* /
 *   add_fk / drop_fk*
 * 带 * 为破坏性操作。预留 rebuild_table（temp-table 保数据迁移）未自动生成。
 */
export function diffERD(current, target) {
  const ops = [];
  const opRebuilds = []; // alter_column → rebuild 信息(SQLite 渲染用)
  const curByName = new Map((current.entities || []).map((e) => [normName(e.name), e]));
  const tgtByName = new Map((target.entities || []).map((e) => [normName(e.name), e]));

  // 新表（按 target 顺序生成 CREATE）
  for (const ent of target.entities || []) {
    if (!curByName.has(normName(ent.name))) ops.push({ op: 'create_table', entity: ent });
  }
  // 删表（按 current 顺序）
  for (const ent of current.entities || []) {
    if (!tgtByName.has(normName(ent.name))) ops.push({ op: 'drop_table', name: ent.name, destructive: true });
  }

  // 公共表：列/索引 diff
  for (const [key, tgtEnt] of tgtByName) {
    const curEnt = curByName.get(key);
    if (!curEnt) continue;
    const curCols = new Map((curEnt.columns || []).map((c) => [normName(c.name), c]));
    const tgtCols = new Map((tgtEnt.columns || []).map((c) => [normName(c.name), c]));
    for (const c of tgtEnt.columns || []) {
      if (!curCols.has(normName(c.name))) ops.push({ op: 'add_column', table: tgtEnt.name, col: c });
    }
    for (const c of curEnt.columns || []) {
      if (!tgtCols.has(normName(c.name))) ops.push({ op: 'drop_column', table: tgtEnt.name, name: c.name, destructive: true });
    }
    for (const c of tgtEnt.columns || []) {
      const cc = curCols.get(normName(c.name));
      if (!cc) continue;
      const before = colSignature(cc), after = colSignature(c);
      const changes = {};
      for (const k of Object.keys(after)) {
        if (String(before[k]) !== String(after[k])) changes[k] = after[k];
      }
      if (Object.keys(changes).length) {
        const destructive = 'type' in changes || 'primaryKey' in changes;
        const opRec = {
          op: 'alter_column', table: tgtEnt.name, col: c, changes,
          destructive,
        };
        // SQLite 不支持 ALTER COLUMN:类型/主键变更需整表重建保数据,
        // 预挂目标实体 + 相关 FK + 旧列清单,emit 时渲染重建序列
        if (destructive) {
          opRebuilds.push({
            opRec,
            rebuild: {
              entity: tgtEnt,
              oldColumns: curEnt.columns || [],
              fks: (target.references || []).filter((r) => normName(r.child?.name) === key),
            },
          });
        }
        ops.push(opRec);
      }
    }
    const curIdx = new Map((curEnt.indexes || []).map((i) => [normName(i.name), i]));
    const tgtIdx = new Map((tgtEnt.indexes || []).map((i) => [normName(i.name), i]));
    for (const i of tgtEnt.indexes || []) {
      if (!curIdx.has(normName(i.name))) ops.push({ op: 'add_index', table: tgtEnt.name, index: i });
    }
    for (const i of curEnt.indexes || []) {
      if (!tgtIdx.has(normName(i.name))) ops.push({ op: 'drop_index', table: tgtEnt.name, name: i.name, destructive: true });
    }
    // Check 约束 diff(按 name 匹配;表达式变化按先删后加处理)
    const curCk = new Map((curEnt.checkConstraints || []).map((c) => [normName(c.name), c]));
    const tgtCk = new Map((tgtEnt.checkConstraints || []).map((c) => [normName(c.name), c]));
    for (const c of tgtEnt.checkConstraints || []) {
      const cur = curCk.get(normName(c.name));
      if (!cur || String(cur.expression).trim() !== String(c.expression).trim()) {
        ops.push({ op: 'add_check', table: tgtEnt.name, constraint: c });
      }
    }
    for (const c of curEnt.checkConstraints || []) {
      const tgt = tgtCk.get(normName(c.name));
      if (!tgt || String(tgt.expression).trim() !== String(c.expression).trim()) {
        ops.push({ op: 'drop_check', table: tgtEnt.name, name: c.name, destructive: true });
      }
    }
  }

  // 引用 diff：按 子表>父表:fk列>父列 匹配
  const curRefs = new Map((current.references || []).map((r) => [refKey(r), r]));
  const tgtRefs = new Map((target.references || []).map((r) => [refKey(r), r]));
  for (const [k, r] of tgtRefs) {
    if (!curRefs.has(k)) ops.push({ op: 'add_fk', ref: r });
  }
  for (const [k, r] of curRefs) {
    if (!tgtRefs.has(k)) ops.push({ op: 'drop_fk', table: r.child?.name, name: `fk_${r.child?.name}_${r.parent?.name}`.replace(/[^\p{L}\p{N}_]/gu, '_'), destructive: true });
  }
  // 把 rebuild 信息挂回对应的 alter_column 操作
  for (const { opRec, rebuild } of opRebuilds) opRec.rebuild = rebuild;
  return ops;
}

/**
 * SQLite 整表重建序列(保数据):CREATE t_new(全列+PK/AK/CHECK/内联 FK)
 * → 拷贝公共列 → DROP t → RENAME → 重建索引;新旧差异列以注释标注。
 */
function sqliteRebuildStatements(op, dialect) {
  const { entity, oldColumns = [], fks = [] } = op.rebuild || {};
  if (!entity) return [`-- SQLite 列类型/主键变更需重建表保数据(缺少目标实体,请人工处理):${op.table}.${op.col.name}`];
  const cols = (entity.columns || []).filter((c) => c && c.name);
  const pk = cols.filter((c) => c.primaryKey);
  const lines = cols.map((c) => columnDefSQL(c, dialect, pk.length));
  if (pk.length > 1 || (pk.length && dialect === 'postgresql')) {
    lines.push(`PRIMARY KEY (${pk.map((c) => q(dialect, c.name)).join(', ')})`);
  }
  for (const ak of entity.alternateKeys || []) {
    const akCols = String(ak.columns || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (akCols.length) lines.push(`UNIQUE (${akCols.map((c) => q(dialect, c)).join(', ')})`);
  }
  for (const ck of entity.checkConstraints || []) {
    if (!ck.expression) continue;
    lines.push(`${ck.name ? `CONSTRAINT ${q(dialect, ck.name)} ` : ''}CHECK (${ck.expression})`);
  }
  // SQLite 的 FK 只能在 CREATE TABLE 内联
  for (const fk of fks) {
    const fkCols = splitList(fk.fkColumns);
    if (!fkCols.length || !fk.parent) continue;
    const pc = splitList(fk.parentColumns);
    const targets = pc.length ? pc : (fk.parent.columns || []).filter((c) => c.primaryKey).map((c) => c.name);
    lines.push(`FOREIGN KEY (${fkCols.map((c) => q(dialect, c)).join(', ')}) REFERENCES ${q(dialect, fk.parent.name)} (${(targets.length ? targets : fkCols).map((c) => q(dialect, c)).join(', ')})`);
  }
  const newT = `${op.table}_new`;
  const common = cols.filter((c) => oldColumns.some((o) => normName(o.name) === normName(c.name))).map((c) => c.name);
  const dropped = oldColumns.filter((o) => !common.some((n) => normName(n) === normName(o.name)));
  const stmts = [`CREATE TABLE ${q(dialect, newT)} (\n  ${lines.join(',\n  ')}\n);`];
  if (common.length) {
    stmts.push(`INSERT INTO ${q(dialect, newT)} (${common.map((c) => q(dialect, c)).join(', ')})\n  SELECT ${common.map((c) => q(dialect, c)).join(', ')}\n  FROM ${q(dialect, op.table)};`);
  } else {
    stmts.push('-- 新旧表无同名列,不拷贝数据');
  }
  stmts.push(`DROP TABLE ${q(dialect, op.table)};`);
  stmts.push(`ALTER TABLE ${q(dialect, newT)} RENAME TO ${q(dialect, op.table)};`);
  for (const idx of entity.indexes || []) {
    const s = indexSQL(entity, idx, dialect);
    if (s) stmts.push(s);
  }
  if (dropped.length) stmts.push(`-- 注意:以下列在新表中不存在,数据未迁移:${dropped.map((c) => c.name).join(', ')}`);
  return stmts;
}

/** 单操作 → SQL 语句（多条时为数组）；返回 null 表示该方言无此操作。 */
function emitOp(op, dialect) {
  const p = profileOf(dialect);
  const quote = q.bind(null, dialect);
  switch (op.op) {
    case 'create_table': {
      // 复用 generateSQL 的建表渲染（去掉头两行说明）
      const sql = generateSQL([op.entity], [], dialect, []);
      return sql.split('\n\n').slice(1).map((s) => s.trim()).filter(Boolean);
    }
    case 'drop_table':
      return [`DROP TABLE ${quote(op.name)};`];
    case 'add_column':
      return [`ALTER TABLE ${quote(op.table)} ADD COLUMN ${columnDefSQL(op.col, dialect, 1)};`];
    case 'drop_column':
      return [`ALTER TABLE ${quote(op.table)} DROP COLUMN ${quote(op.name)};`];
    case 'alter_column': {
      const { table, col, changes } = op;
      const cName = quote(col.name);
      const out = [];
      const sqliteRebuild = dialect === 'sqlite'
        && ('type' in changes || 'primaryKey' in changes);
      if (sqliteRebuild) return sqliteRebuildStatements(op, dialect);
      if ('type' in changes) {
        if (dialect === 'mysql') {
          out.push(`ALTER TABLE ${quote(table)} MODIFY COLUMN ${columnDefSQL({ ...col, type: changes.type }, dialect, 1)};`);
        } else if (dialect === 'postgresql') {
          out.push(`ALTER TABLE ${quote(table)} ALTER COLUMN ${cName} TYPE ${changes.type};`);
        } else {
          out.push(`ALTER TABLE ${quote(table)} ALTER COLUMN ${cName} SET DATA TYPE ${changes.type};`);
        }
      }
      if ('notNull' in changes) {
        if (dialect === 'mysql') {
          out.push(`ALTER TABLE ${quote(table)} MODIFY COLUMN ${columnDefSQL({ ...col, notNull: changes.notNull }, dialect, 1)};`);
        } else {
          out.push(`ALTER TABLE ${quote(table)} ALTER COLUMN ${cName} ${changes.notNull ? 'SET' : 'DROP'} NOT NULL;`);
        }
      }
      if ('defaultValue' in changes) {
        if (changes.defaultValue) out.push(`ALTER TABLE ${quote(table)} ALTER COLUMN ${cName} SET DEFAULT ${changes.defaultValue};`);
        else out.push(`ALTER TABLE ${quote(table)} ALTER COLUMN ${cName} DROP DEFAULT;`);
      }
      if ('unique' in changes) {
        out.push(`-- 注意：${table}.${col.name} 唯一约束变更建议以命名唯一索引处理（${changes.unique ? '添加' : '移除'} UNIQUE）`);
      }
      if ('primaryKey' in changes && dialect !== 'sqlite') {
        out.push(`-- 注意：${table}.${col.name} 主键变更涉及表约束重建，请人工确认`);
      }
      return out;
    }
    case 'add_index': {
      const ent = { name: op.table };
      const line = indexSQL(ent, op.index, dialect);
      return line ? [line] : null;
    }
    case 'drop_index':
      return [dialect === 'mysql'
        ? `DROP INDEX ${quote(op.name)} ON ${quote(op.table)};`
        : `DROP INDEX ${quote(op.name)};`];
    case 'add_fk': {
      const line = fkConstraintSQL(op.ref, dialect);
      return line ? [line] : null;
    }
    case 'drop_fk':
      return [dialect === 'mysql'
        ? `ALTER TABLE ${quote(op.table)} DROP FOREIGN KEY ${quote(op.name)};`
        : `ALTER TABLE ${quote(op.table)} DROP CONSTRAINT ${quote(op.name)};`];
    case 'add_check':
      return [`ALTER TABLE ${quote(op.table)} ADD ${op.constraint.name ? `CONSTRAINT ${quote(op.constraint.name)} ` : ''}CHECK (${op.constraint.expression});`];
    case 'drop_check':
      return [dialect === 'mysql'
        ? `ALTER TABLE ${quote(op.table)} DROP CHECK ${quote(op.name)};`
        : `ALTER TABLE ${quote(op.table)} DROP CONSTRAINT ${quote(op.name)};`];
    case 'rebuild_table': // 预留：temp-table 保数据迁移命令
      return [`-- rebuild_table: ${op.name}（未实现）`];
    default:
      return null;
  }
}

/**
 * emitMigration(ops, dialect, {selected}):把（筛选后的）操作对象渲染为
 * 迁移脚本。selected 为要执行的操作下标集合（缺省 = 全部非破坏性操作）；
 * 落选但破坏性的操作仍以注释形式输出供审阅。
 */
export function emitMigration(ops, dialect, { selected = null } = {}) {
  const head = `-- ${profileOf(dialect).label} migration generated by OpenUML\n-- ${new Date().toISOString()}\n`;
  const out = [head];
  ops.forEach((op, i) => {
    const enabled = selected ? selected.has(i) : !isDestructiveOp(op);
    const stmts = emitOp(op, dialect);
    if (!stmts || !stmts.length) return;
    if (!enabled) {
      out.push(`-- [未勾选，跳过] ${describeOp(op)}\n${stmts.map((s) => '-- ' + s.replace(/\n/g, '\n-- ')).join('\n')}`);
    } else {
      out.push(stmts.join('\n'));
    }
  });
  return out.join('\n\n') + '\n';
}

/** 操作对象的人类可读描述（UI 清单用）。 */
export function describeOp(op) {
  switch (op.op) {
    case 'create_table': return `新建表 ${op.entity.name}（${(op.entity.columns || []).length} 列）`;
    case 'drop_table': return `删除表 ${op.name}`;
    case 'add_column': return `加列 ${op.table}.${op.col.name}`;
    case 'drop_column': return `删列 ${op.table}.${op.name}`;
    case 'alter_column': return `改列 ${op.table}.${op.col.name}（${Object.keys(op.changes).join('/')}）`;
    case 'add_index': return `加索引 ${op.index.name}`;
    case 'drop_index': return `删索引 ${op.name}`;
    case 'add_fk': return `加外键 ${op.ref.child?.name} → ${op.ref.parent?.name}`;
    case 'drop_fk': return `删外键 ${op.name}`;
    case 'add_check': return `加 Check ${op.table}.${op.constraint.name}`;
    case 'drop_check': return `删 Check ${op.name}`;
    default: return op.op;
  }
}
