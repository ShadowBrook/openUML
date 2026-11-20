// erd-report.js — 迁移 HTML 报告(Luna diff_html_report 的对应物):
// 自包含单文件(内联样式),操作清单 + 新旧脚本行级/词级对照。

import { buildDiffRows } from './text-diff.js';

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderSegs(segs) {
  if (!segs) return '';
  return segs.map((s) => s.changed
    ? `<span class="chg">${esc(s.text)}</span>`
    : esc(s.text)).join('');
}

function renderRow(r) {
  const oldCell = r.kind === 'add'
    ? '<td class="ghost"></td>'
    : `<td class="ln">${r.oldNo ?? ''}</td><td class="${r.kind === 'mod' ? 'mod' : r.kind === 'del' ? 'del' : 'src'}">${renderSegs(r.oldSegs) || esc(r.oldLine)}</td>`;
  const newCell = r.kind === 'del'
    ? '<td class="ghost"></td>'
    : `<td class="ln">${r.newNo ?? ''}</td><td class="${r.kind === 'mod' ? 'mod' : r.kind === 'add' ? 'add' : 'src'}">${renderSegs(r.newSegs) || esc(r.newLine)}</td>`;
  return `<tr class="row-${r.kind}">${oldCell}${newCell}</tr>`;
}

function renderOps(ops) {
  if (!ops.length) return '<p class="dim">无差异操作。</p>';
  return `<table class="ops"><thead><tr><th>#</th><th>操作</th><th>说明</th><th>破坏性</th><th>执行</th></tr></thead><tbody>${
    ops.map((op, i) => `<tr class="${op.selected ? 'exec' : 'skip'}"><td>${i + 1}</td><td>${esc(op.op)}</td><td>${esc(op.desc)}</td><td>${op.destructive ? '⚠ 是' : '否'}</td><td>${op.selected ? '是' : '跳过'}</td></tr>`).join('')
  }</tbody></table>`;
}

/**
 * buildMigrationHtml({ ops, currentSql, targetSql, dialect, title }) → HTML 字符串。
 * ops: [{op, desc, destructive, selected}](迁移对话框的操作清单,已带勾选状态);
 * currentSql/targetSql: 新旧 DDL 全文(行级/词级对照)。
 */
export function buildMigrationHtml({ ops = [], currentSql = '', targetSql = '', dialect = '', title = '迁移报告' }) {
  const rows = buildDiffRows(currentSql, targetSql);
  const stats = rows.reduce((s, r) => { s[r.kind] = (s[r.kind] || 0) + 1; return s; }, {});
  const when = new Date().toLocaleString();
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  body{font-family:-apple-system,'Segoe UI',sans-serif;margin:24px;color:#24292f;background:#fff}
  h1{font-size:20px} h2{font-size:15px;margin-top:28px;border-bottom:1px solid #d0d7de;padding-bottom:6px}
  .meta{color:#57606a;font-size:12px;margin-bottom:8px}
  table{border-collapse:collapse;width:100%;font-size:12px}
  th,td{border:1px solid #d0d7de;padding:4px 8px;text-align:left;vertical-align:top}
  th{background:#f6f8fa}
  tr.exec td:first-child{border-left:3px solid #2da44e}
  tr.skip td:first-child{border-left:3px solid #d4a72c}
  .diff td.ln{width:46px;text-align:right;color:#8c959f;background:#f6f8fa;user-select:none}
  .src{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Consolas,monospace}
  .add{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Consolas,monospace;background:#dafbe1}
  .del{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Consolas,monospace;background:#ffebe9}
  .mod{white-space:pre-wrap;word-break:break-all;font-family:ui-monospace,Consolas,monospace;background:#fff8c5}
  .ghost{background:#fbfafc}
  .chg{background:#ffb3a780;border-radius:2px;padding:0 1px}
  .legend{font-size:12px;color:#57606a;margin:6px 0}
  .legend i{display:inline-block;width:10px;height:10px;margin:0 3px;vertical-align:middle}
  .dim{color:#57606a}
</style></head><body>
<h1>${esc(title)}</h1>
<div class="meta">方言:${esc(dialect)} · 生成时间:${esc(when)} · OpenUML</div>
<h2>操作清单(${ops.length})</h2>
${renderOps(ops)}
<h2>脚本对照</h2>
<div class="legend">变更统计:相等 ${stats.equal || 0} · 修改 ${stats.mod || 0} · 删除 ${stats.del || 0} · 新增 ${stats.add || 0}
&nbsp;|&nbsp;<i style="background:#ffebe9"></i>删除&nbsp;<i style="background:#fff8c5"></i>修改&nbsp;<i style="background:#dafbe1"></i>新增,<span class="chg">词级高亮</span>标出改动片段</div>
<table class="diff"><thead><tr><th colspan="2">当前 schema</th><th colspan="2">目标 schema</th></tr></thead>
<tbody>${rows.map(renderRow).join('\n')}</tbody></table>
</body></html>`;
}
