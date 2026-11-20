// erd-layout.js — ERD 自动布局(Luna autolayout 的对应物,轻量分层法)。
// 纯函数、零 DOM 依赖:输入实体视图与引用视图描述,输出每个视图的目标
// 坐标。算法:按分区(container)分组 → 组内 DFS 破环 → 最长路径分层 →
// 层内重心法迭代消交叉 → 行式坐标 → 网格吸附。
//
// 方向约定:引用视图 tail=child(子表)、head=parent(父表);
// 布局把父表放在上层、子表放下层(FK 自上而下)。

const DEFAULTS = { grid: 10, gapX: 70, gapY: 80 };

/** 稳定排序:保持同键元素的插入顺序(算法确定性依赖这一点)。 */
function stableSortBy(arr, keyFn) {
  return arr
    .map((item, i) => ({ item, i, k: keyFn(item) }))
    .sort((a, b) => (a.k - b.k) || (a.i - b.i))
    .map((e) => e.item);
}

/**
 * 破环:DFS 染色,回边在布局图中反转。
 * rawEdges: [from, to][];返回 {dag: Map<id, id[]>}。
 */
function breakCycles(nodes, rawEdges) {
  const adj = new Map(nodes.map((n) => [n, []]));
  for (const [from, to] of rawEdges) adj.get(from)?.push(to);
  const state = new Map(nodes.map((n) => [n, 0])); // 0 未访问 1 在栈 2 完成
  const dag = new Map(nodes.map((n) => [n, []]));
  const add = (a, b) => { if (!dag.get(a).includes(b)) dag.get(a).push(b); };
  const visit = (u) => {
    state.set(u, 1);
    for (const v of adj.get(u) || []) {
      if (state.get(v) === 0) visit(v);
      // 回边反转:子声明父的环(如相互外键)以反向边参与分层
      add(state.get(v) === 1 ? v : u, state.get(v) === 1 ? u : v);
    }
    state.set(u, 2);
  };
  for (const n of nodes) if (state.get(n) === 0) visit(n);
  return { dag };
}

/** 最长路径分层:层号 = 最深前辈 + 1。 */
function assignLayers(nodes, dag) {
  const preds = new Map(nodes.map((n) => [n, []]));
  for (const [from, tos] of dag) for (const to of tos) preds.get(to).push(from);
  const layer = new Map(nodes.map((n) => [n, 0]));
  const resolve = (n, seen = new Set()) => {
    if (layer.has(n) && !preds.get(n).length) return layer.get(n);
    if (seen.has(n)) return layer.get(n) || 0;
    seen.add(n);
    const ps = preds.get(n);
    const l = ps.length ? Math.max(...ps.map((p) => resolve(p, seen))) + 1 : 0;
    layer.set(n, l);
    return l;
  };
  for (const n of nodes) resolve(n);
  return layer;
}

/** 重心法消交叉:交替按上/下相邻层邻居的均值序重排,迭代 passes 轮。 */
function orderWithinLayers(nodesByLayer, dag, passes = 4) {
  const order = new Map();
  for (const [, list] of nodesByLayer) list.forEach((n, i) => order.set(n, i));
  const up = new Map(), down = new Map();
  for (const [from, tos] of dag) {
    for (const to of tos) {
      if (!down.has(from)) down.set(from, []);
      down.get(from).push(to);
      if (!up.has(to)) up.set(to, []);
      up.get(to).push(from);
    }
  }
  const avg = (ns) => ns.length ? ns.reduce((s, n) => s + (order.get(n) ?? 0), 0) / ns.length : null;
  for (let p = 0; p < passes; p++) {
    const downward = p % 2 === 0;
    const layers = [...nodesByLayer.keys()].sort((a, b) => (downward ? a - b : b - a));
    for (const l of layers) {
      const list = nodesByLayer.get(l);
      const sorted = stableSortBy(list, (n) => {
        const a = avg((downward ? up : down).get(n) || []);
        const b = avg((downward ? down : up).get(n) || []);
        const vals = [a, b].filter((v) => v != null);
        return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : (order.get(n) ?? 0);
      });
      sorted.forEach((n, i) => order.set(n, i));
      nodesByLayer.set(l, sorted);
    }
  }
  return order;
}

/**
 * layoutERD(views, refs, opts) → Map<viewId, {x, y}>
 * views: ERDEntity 视图数组 {_id, width, height, container}
 * refs:  引用视图数组 {tail, head}(tail=child, head=parent)
 * 组(分区)水平排列,组内父上子下、行居中、网格吸附。
 */
export function layoutERD(views, refs, opts = {}) {
  const { grid, gapX, gapY } = { ...DEFAULTS, ...opts };
  const byId = new Map(views.map((v) => [v._id, v]));
  const result = new Map();
  if (!views.length) return result;

  // 分组:按容器(分区)分组,保持首见顺序
  const groups = new Map();
  for (const v of views) {
    const key = v.container || '__root__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }

  let groupOffsetX = 0;
  for (const [, groupViews] of groups) {
    const nodes = groupViews.map((v) => v._id);
    const nodeSet = new Set(nodes);
    const rawEdges = [];
    for (const r of refs) {
      if (nodeSet.has(r.head) && nodeSet.has(r.tail)) rawEdges.push([r.head, r.tail]);
    }
    const { dag } = breakCycles(nodes, rawEdges);
    const layer = assignLayers(nodes, dag);

    const nodesByLayer = new Map();
    for (const n of nodes) {
      const l = layer.get(n);
      if (!nodesByLayer.has(l)) nodesByLayer.set(l, []);
      nodesByLayer.get(l).push(n);
    }
    orderWithinLayers(nodesByLayer, dag);

    // 坐标:层为行(行高 = 层内最高),行内按序排布后整行居中,y 逐层累计
    const rowWidths = new Map(), rowY = new Map();
    const layersSorted = [...nodesByLayer.keys()].sort((a, b) => a - b);
    let y = 0;
    for (const l of layersSorted) {
      const list = nodesByLayer.get(l);
      const rowH = Math.max(...list.map((n) => byId.get(n).height || 60));
      rowWidths.set(l, list.reduce((s, n) => s + (byId.get(n).width || 120), 0) + gapX * (list.length - 1));
      rowY.set(l, y);
      y += rowH + gapY;
    }
    const maxRowWidth = Math.max(0, ...rowWidths.values());
    for (const l of layersSorted) {
      const list = nodesByLayer.get(l);
      let x = (maxRowWidth - rowWidths.get(l)) / 2;
      for (const n of list) {
        const v = byId.get(n);
        result.set(n, {
          x: Math.round((groupOffsetX + x) / grid) * grid,
          y: Math.round(rowY.get(l) / grid) * grid,
        });
        x += (v.width || 120) + gapX;
      }
    }
    groupOffsetX += maxRowWidth + gapX * 2;
  }
  return result;
}
