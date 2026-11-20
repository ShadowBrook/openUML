// erd-lens.js — Context Lens（Luna Modeler 的自动上下文图）：
// 以选中实体为中心，一键生成包含其一度邻居与全部引用的 ERD 图。
// 纯仓储操作 + 命令栈（单个可撤销步骤），不做布局引擎依赖。

import { repository } from './repository.js';
import { compound } from './commands.js';
import { createDiagram, createNodeView, createEdgeView } from './factory.js';

// 引用视图上需要随图复制到新图的语义字段（基数/标签/映射/RI 动作/锚点）
const REF_SEMANTIC_FIELDS = [
  'tailCardinality', 'headCardinality',
  'tailRoleName', 'headRoleName',
  'fkColumns', 'parentColumns',
  'onDelete', 'onUpdate',
  'tailAnchor', 'headAnchor',
];

/**
 * 扫描全项目所有图表，收集 ERD 实体视图与引用视图：
 * 返回 { entityModels: Map<viewId, model>, refs: [{view, tailModel, headModel}] }
 */
function scanERDGraph() {
  const diagrams = [];
  repository.walk((n) => { if (Array.isArray(n.elements)) diagrams.push(n); });
  const entityModels = new Map();
  const refs = [];
  for (const d of diagrams) {
    const local = new Map();
    for (const v of d.elements || []) {
      if (v.$type !== 'ERDEntity') continue;
      const m = repository.lookup(v.modelRef);
      if (m) { entityModels.set(v._id, m); local.set(v._id, m); }
    }
    for (const v of d.elements || []) {
      if (v.$type !== 'ERDReference' && v.$type !== 'ERDRelationship') continue;
      const tailModel = local.get(v.tail);
      const headModel = local.get(v.head);
      if (tailModel && headModel) refs.push({ view: v, tailModel, headModel });
    }
  }
  return { entityModels, refs };
}

/**
 * 以 entityViewId 对应的实体为中心生成 Context Lens 图：
 * 根实体居中，一度邻居按序环状布置，实体间引用按原方向复制语义字段。
 * 同一对表的多张图上重复绘制的引用只取一条（按 模型对 去重）。
 * owner: 新图的挂载节点。返回 { diagram, nodes, edges } 或 null。
 */
export function createContextLensDiagram(entityViewId, owner) {
  const entityView = repository.lookup(entityViewId);
  const center = entityView ? repository.lookup(entityView.modelRef) : null;
  if (!center) return null;

  const { entityModels, refs } = scanERDGraph();
  const neighborIds = new Set();
  const picked = [];
  const seenPairs = new Set();
  for (const r of refs) {
    if (r.tailModel._id === center._id) {
      neighborIds.add(r.headModel._id);
      const pairKey = `${r.tailModel._id}>${r.headModel._id}`;
      if (!seenPairs.has(pairKey)) { seenPairs.add(pairKey); picked.push(r); }
    } else if (r.headModel._id === center._id) {
      neighborIds.add(r.tailModel._id);
      const pairKey = `${r.tailModel._id}>${r.headModel._id}`;
      if (!seenPairs.has(pairKey)) { seenPairs.add(pairKey); picked.push(r); }
    }
  }

  const diagram = createDiagram('ERDDiagram', `Context: ${center.name || 'entity'}`);

  // 布局：根实体居中，邻居环形（椭圆）分布
  const CX = 380, CY = 380;
  const RX = 380, RY = 280;
  const list = [...neighborIds].map((id) => repository.lookup(id)).filter(Boolean);
  const modelView = new Map();
  const cv = createNodeView('ERDEntity', center._id, CX - 110, CY - 40, { width: 220 });
  modelView.set(center._id, cv);
  list.forEach((m, i) => {
    const a = (i / Math.max(1, list.length)) * Math.PI * 2 - Math.PI / 2;
    const x = CX + Math.cos(a) * RX - 110;
    const y = CY + Math.sin(a) * RY - 40;
    modelView.set(m._id, createNodeView('ERDEntity', m._id, Math.round(x), Math.round(y), { width: 220 }));
  });
  const views = [...modelView.values()];
  const refViews = picked.map((r) => {
    const tailV = modelView.get(r.tailModel._id);
    const headV = modelView.get(r.headModel._id);
    const nv = createEdgeView(r.view.$type, r.view.modelRef || '', tailV._id, headV._id);
    for (const f of REF_SEMANTIC_FIELDS) {
      if (r.view[f] !== undefined) nv[f] = r.view[f];
    }
    return nv;
  });

  compound('context-lens', [{
    redo: () => {
      repository.addChild(owner, diagram);
      for (const v of views) { diagram.elements.push(v); v.__diagram = diagram; }
      for (const v of refViews) { diagram.elements.push(v); v.__diagram = diagram; }
      repository._reindex();
    },
    undo: () => {
      diagram.elements.length = 0;
      repository.removeChild(diagram);
      repository._reindex();
    },
  }]);
  return { diagram, nodes: views.length, edges: refViews.length };
}
