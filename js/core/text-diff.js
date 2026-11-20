// text-diff.js — 零依赖行级 + 词级 diff(Luna 用 jsdiff,此处自实现同等语义)。
// 纯函数;行为对齐 Luna script-diff:trim 尾空白容差比较、行配对后词级内联
// 高亮、超大输入退化为顺序配对。

const MAX_LCS_CELLS = 4_000_000; // DP 规模上限,超过则退化

/** 经典 LCS DP:返回配对数组 [{a: idxA|null, b: idxB|null}]。 */
function lcsPairs(a, b, eq) {
  const n = a.length, m = b.length;
  if (n * m > MAX_LCS_CELLS) {
    const pairs = [];
    const k = Math.min(n, m);
    for (let i = 0; i < k; i++) pairs.push({ a: i, b: i });
    for (let i = k; i < n; i++) pairs.push({ a: i, b: null });
    for (let j = k; j < m; j++) pairs.push({ a: null, b: j });
    return pairs;
  }
  const dp = new Array((n + 1) * (m + 1)).fill(0);
  const at = (i, j) => i * (m + 1) + j;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[at(i, j)] = eq(a[i], b[j])
        ? dp[at(i + 1, j + 1)] + 1
        : Math.max(dp[at(i + 1, j)], dp[at(i, j + 1)]);
    }
  }
  const pairs = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (eq(a[i], b[j])) { pairs.push({ a: i, b: j }); i++; j++; }
    else if (dp[at(i + 1, j)] >= dp[at(i, j + 1)]) { pairs.push({ a: i, b: null }); i++; }
    else { pairs.push({ a: null, b: j }); j++; }
  }
  while (i < n) { pairs.push({ a: i, b: null }); i++; }
  while (j < m) { pairs.push({ a: null, b: j }); j++; }
  return pairs;
}

const trimNL = (s) => s.replace(/\s+$/, '');

/**
 * 行级 diff:trim 尾部空白后比较。
 * 返回 [{type:'equal'|'add'|'del', aIdx?, bIdx?}]。
 */
export function diffLines(oldText, newText) {
  const a = String(oldText ?? '').split('\n');
  const b = String(newText ?? '').split('\n');
  return lcsPairs(a, b, (x, y) => trimNL(x) === trimNL(y))
    .map((p) => ({
      type: p.a != null && p.b != null ? 'equal' : p.a != null ? 'del' : 'add',
      aIdx: p.a, bIdx: p.b,
    }));
}

/** 段累积:同 changed 的相邻 token 合并为一段。 */
function pushSeg(segs, text, changed) {
  const last = segs[segs.length - 1];
  if (last && last.changed === changed) last.text += text;
  else segs.push({ text, changed });
}

/**
 * 词级内联 diff(空白分词 + LCS):返回 {oldSegs, newSegs},
 * 每段 {text, changed}。
 */
export function diffSegments(oldLine, newLine) {
  const tok = (s) => String(s ?? '').split(/(\s+)/).filter((t) => t !== '');
  const a = tok(oldLine), b = tok(newLine);
  const pairs = lcsPairs(a, b, (x, y) => x === y);
  const oldSegs = [], newSegs = [];
  for (const p of pairs) {
    if (p.a != null && p.b != null) {
      pushSeg(oldSegs, a[p.a], false);
      pushSeg(newSegs, b[p.b], false);
    } else if (p.a != null) {
      pushSeg(oldSegs, a[p.a], true);
    } else {
      pushSeg(newSegs, b[p.b], true);
    }
  }
  return { oldSegs, newSegs };
}

/**
 * 行配对视图(HTML 报告用):equal 并排;相邻 del+add 合并为 mod(带词级段);
 * 其余为单侧 del/add。
 * 返回 [{kind:'equal'|'mod'|'del'|'add', oldLine?, newLine?, oldSegs?, newSegs?, oldNo?, newNo?}]
 */
export function buildDiffRows(oldText, newText) {
  const a = String(oldText ?? '').split('\n');
  const b = String(newText ?? '').split('\n');
  const rows = [];
  for (const p of diffLines(oldText, newText)) {
    if (p.type === 'equal') {
      rows.push({ kind: 'equal', oldLine: a[p.aIdx], newLine: b[p.bIdx], oldNo: p.aIdx + 1, newNo: p.bIdx + 1 });
    } else if (p.type === 'del') {
      rows.push({ kind: 'del', oldLine: a[p.aIdx], oldNo: p.aIdx + 1 });
    } else {
      rows.push({ kind: 'add', newLine: b[p.bIdx], newNo: p.bIdx + 1 });
    }
  }
  const merged = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], nxt = rows[i + 1];
    if (r.kind === 'del' && nxt && nxt.kind === 'add') {
      const segs = diffSegments(r.oldLine, nxt.newLine);
      merged.push({
        kind: 'mod', oldLine: r.oldLine, newLine: nxt.newLine,
        oldNo: r.oldNo, newNo: nxt.newNo,
        oldSegs: segs.oldSegs, newSegs: segs.newSegs,
      });
      i++;
      continue;
    }
    merged.push(r);
  }
  return merged;
}
