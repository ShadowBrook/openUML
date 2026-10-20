// dsl.js — compact AI diagram DSL: schema validation + builder.
// The LLM only emits plain names; the builder resolves them into model/view
// objects via the factory, so the model never touches ids or coordinates.

import {
  createModel, createDiagram, createNodeView, createEdgeView,
} from '../core/factory.js';

export const DSL_VERSION = 1;

export const NODE_KINDS = {
  class: { type: 'UMLClass', defaults: { width: 160, height: 80 } },
  interface: { type: 'UMLInterface', defaults: { width: 150, height: 80 } },
  enumeration: { type: 'UMLEnumeration', defaults: { width: 150, height: 90 } },
  actor: { type: 'UMLActor', defaults: { width: 40, height: 55 } },
  usecase: { type: 'UMLUseCase', defaults: { width: 160, height: 60 } },
  package: { type: 'UMLPackage', defaults: { width: 200, height: 120 } },
  note: { type: 'UMLNote', defaults: { width: 140, height: 70 }, textKind: true },
  object: { type: 'UMLObject', defaults: { width: 140, height: 70 } },
};

export const ACTIVITY_KINDS = {
  initial: { type: 'UMLInitialNode', defaults: { width: 24, height: 24 } },
  action: { type: 'UMLAction', defaults: { width: 130, height: 56 } },
  decision: { type: 'UMLDecisionNode', defaults: { width: 32, height: 32 } },
  merge: { type: 'UMLMergeNode', defaults: { width: 32, height: 32 } },
  fork: { type: 'UMLForkNode', defaults: { width: 120, height: 8 } },
  join: { type: 'UMLJoinNode', defaults: { width: 120, height: 8 } },
  final: { type: 'UMLActivityFinalNode', defaults: { width: 26, height: 26 } },
  flowfinal: { type: 'UMLFlowFinalNode', defaults: { width: 26, height: 26 } },
  object: { type: 'UMLObjectNode', defaults: { width: 110, height: 46 } },
};

export const EDGE_TYPES = {
  association: { type: 'UMLAssociation', lineStyle: 'solid' },
  directed: { type: 'UMLAssociation', lineStyle: 'solid', headArrow: 'open' },
  aggregation: { type: 'UMLAssociation', lineStyle: 'solid', tailArrow: 'hollowDiamond' },
  composition: { type: 'UMLAssociation', lineStyle: 'solid', tailArrow: 'filledDiamond' },
  generalization: { type: 'UMLGeneralization', headArrow: 'hollowTriangle' },
  realization: { type: 'UMLInterfaceRealization', lineStyle: 'dashed', headArrow: 'hollowTriangle' },
  dependency: { type: 'UMLDependency', lineStyle: 'dashed', headArrow: 'open' },
  include: { type: 'UMLInclude', lineStyle: 'dashed', headArrow: 'open', stereotype: '«include»' },
  extend: { type: 'UMLExtend', lineStyle: 'dashed', headArrow: 'open', stereotype: '«extend»' },
  notelink: { type: 'UMLNoteLink', lineStyle: 'dashed' },
};

export const MESSAGE_SORTS = {
  sync: { $type: 'UMLMessage+sync', lineStyle: 'solid', headArrow: 'filledTriangle' },
  async: { $type: 'UMLMessage+async', lineStyle: 'solid', headArrow: 'open' },
  reply: { $type: 'UMLMessage+reply', lineStyle: 'dashed', headArrow: 'open' },
  create: { $type: 'UMLMessage+create', lineStyle: 'dashed', headArrow: 'open' },
  delete: { $type: 'UMLMessage+delete', lineStyle: 'solid', headArrow: 'filledTriangle' },
};

const STR = (v) => (typeof v === 'string' ? v.trim() : '');
const STRS = (v) => (Array.isArray(v) ? v.map(STR).filter(Boolean) : []);

/** Validate a parsed DSL object; returns { ok, errors: [] }. */
export function validateDsl(dsl) {
  const errors = [];
  if (!dsl || typeof dsl !== 'object' || Array.isArray(dsl)) {
    return { ok: false, errors: ['输出必须是一个 JSON 对象'] };
  }
  const diagram = STR(dsl.diagram) || 'class';
  if (diagram === 'sequence') return validateSequenceDsl(dsl, errors);
  if (diagram === 'activity') return validateActivityDsl(dsl, errors);
  if (!['class', 'object'].includes(diagram)) {
    errors.push(`diagram 暂只支持 class / object / sequence / activity（收到 "${diagram}"）`);
  }
  const nodes = Array.isArray(dsl.nodes) ? dsl.nodes : [];
  if (!nodes.length) errors.push('nodes 不能为空');
  const names = new Set();
  nodes.forEach((n, i) => {
    const name = STR(n && n.name);
    if (!name) errors.push(`nodes[${i}] 缺少 name`);
    else if (names.has(name)) errors.push(`节点名称重复: ${name}`);
    else names.add(name);
    const kind = STR(n && n.kind) || 'class';
    if (!NODE_KINDS[kind]) errors.push(`nodes[${i}] (${name || '?'}) 未知 kind: ${kind}`);
  });
  const edges = Array.isArray(dsl.edges) ? dsl.edges : [];
  edges.forEach((e, i) => {
    const type = STR(e && e.type) || 'association';
    if (!EDGE_TYPES[type]) errors.push(`edges[${i}] 未知 type: ${type}`);
    for (const key of ['from', 'to']) {
      const ref = STR(e && e[key]);
      if (!ref) errors.push(`edges[${i}] 缺少 ${key}`);
      else if (!names.has(ref)) errors.push(`edges[${i}] 的 ${key} "${ref}" 不在 nodes 中`);
    }
  });
  return { ok: errors.length === 0, errors };
}

/**
 * Build an OpenUML diagram from a validated DSL.
 * Returns { diagram, nodeCount, edgeCount } without touching the repository —
 * the caller owns insertion (typically inside one undoable compound command).
 */
export function buildDiagram(dsl, opts = {}) {
  const family = STR(dsl && dsl.diagram) || 'class';
  if (family === 'sequence') return buildSequenceDiagram(dsl, opts);
  if (family === 'activity') return buildActivityDiagram(dsl, opts);
  return buildClassifierDiagram(dsl, opts);
}

function buildClassifierDiagram(dsl, { name = 'AI Diagram', originX = 60, originY = 60 } = {}) {
  const check = validateDsl(dsl);
  if (!check.ok) throw new Error(check.errors.join('; '));
  const byName = new Map();
  const nodes = dsl.nodes.map((n, i) => {
    const spec = NODE_KINDS[STR(n.kind) || 'class'];
    const model = createModel(spec.type, STR(n.name));
    if (spec.type === 'UMLEnumeration') {
      model.literals = STRS(n.literals).map((l) => ({
        _id: 'l-ai' + i + '-' + Math.random().toString(36).slice(2, 6),
        $type: 'UMLEnumerationLiteral', name: l, visibility: 'public',
      }));
    }
    if (Array.isArray(model.attributes) || spec.type === 'UMLClass' || spec.type === 'UMLInterface') {
      model.attributes = STRS(n.attributes).map((a) => parseMember(a, 'attribute', i));
      model.operations = STRS(n.operations).map((o) => parseMember(o, 'operation', i));
    }
    if (spec.type === 'UMLObject') {
      model.classifier = STR(n.classifier);
      model.slots = STRS(n.slots).map((s) => {
        const eq = s.indexOf('=');
        return {
          _id: 's-ai' + i + '-' + Math.random().toString(36).slice(2, 6),
          $type: 'UMLSlot',
          name: eq >= 0 ? s.slice(0, eq).trim() : s,
          value: eq >= 0 ? s.slice(eq + 1).trim() : '',
        };
      });
    }
    if (spec.textKind) model.documentation = STRS([n.text])[0] || '';
    const col = i % 3, row = Math.floor(i / 3);
    const view = createNodeView(spec.type, model._id,
      originX + col * 240, originY + row * 170, spec.defaults);
    if (STR(n.stereotype)) view.stereotypeDisplay = 'label';
    byName.set(STR(n.name), { model, view, spec });
    return { model, view };
  });

  const edges = (Array.isArray(dsl.edges) ? dsl.edges : []).map((e) => {
    const spec = EDGE_TYPES[STR(e.type) || 'association'];
    const tail = byName.get(STR(e.from));
    const head = byName.get(STR(e.to));
    const view = createEdgeView(spec.type, '', tail.view._id, head.view._id);
    view.lineStyle = spec.lineStyle || view.lineStyle;
    if (spec.headArrow) view.headArrow = spec.headArrow;
    if (spec.tailArrow) view.tailArrow = spec.tailArrow;
    if (spec.stereotype) view.stereotype = spec.stereotype;
    view.name = STR(e.label);
    view.tailRoleName = STR(e.tailRoleName);
    view.tailMultiplicity = STR(e.tailMultiplicity);
    view.headRoleName = STR(e.headRoleName);
    view.headMultiplicity = STR(e.headMultiplicity);
    return view;
  });

  const diagram = createDiagram('UMLClassDiagram', name);
  diagram.ownedElements = [];
  const models = nodes.map((n) => n.model);
  diagram.elements = [...nodes.flatMap((n) => [n.view]), ...edges];
  return { diagram, models, nodeCount: nodes.length, edgeCount: edges.length };
}

/** Parse "+name: type" / "-name(...): ret" member shorthand into model members. */
function parseMember(text, kind, nodeIdx) {
  const raw = STR(text);
  const visMatch = raw.match(/^([+\-#~])\s*/);
  const visibility = visMatch
    ? { '+': 'public', '-': 'private', '#': 'protected', '~': 'package' }[visMatch[1]]
    : 'public';
  const body = visMatch ? raw.slice(visMatch[0].length) : raw;
  if (kind === 'operation') {
    const paren = body.indexOf('(');
    const name = paren >= 0 ? body.slice(0, paren).trim() : body;
    const params = paren >= 0
      ? body.slice(paren + 1, body.lastIndexOf(')')).split(',').map((p) => p.trim()).filter(Boolean)
          .map((p) => ({ name: p.split(':')[0].trim() || 'param', type: p.includes(':') ? p.split(':')[1].trim() : '' }))
      : [];
    const ret = paren >= 0 && body.lastIndexOf(')') >= 0 && body.indexOf(':', body.lastIndexOf(')')) >= 0
      ? body.slice(body.indexOf(':', body.lastIndexOf(')')) + 1).trim() : '';
    return {
      _id: `o-ai${nodeIdx}-${Math.random().toString(36).slice(2, 6)}`, $type: 'UMLOperation',
      name: name || 'operation', parameters: params, returnType: ret, visibility, isStatic: false,
    };
  }
  const colon = body.indexOf(':');
  const name = colon >= 0 ? body.slice(0, colon).trim() : body;
  const type = colon >= 0 ? body.slice(colon + 1).trim() : '';
  return {
    _id: `a-ai${nodeIdx}-${Math.random().toString(36).slice(2, 6)}`, $type: 'UMLAttribute',
    name: name || 'attribute', type, multiplicity: '', visibility,
    defaultValue: '', isStatic: false,
  };
}

/** System prompt handed to the model alongside the user's request. */
export function systemPrompt() {
  const kinds = Object.keys(NODE_KINDS).join(' | ');
  const edges = Object.keys(EDGE_TYPES).join(' | ');
  return [
    `你是 UML 建模助手。把用户的描述转换为一个 JSON 对象（DSL v${DSL_VERSION}），不要输出任何解释文字。根据描述选择最合适的 diagram 家族。`,
    `家族1 — 类图/对象图: {"diagram":"class"|"object","nodes":[{"kind":"${kinds}","name":"…","stereotype?":"…","attributes?:":["+name: Type"],"operations?:":["+name(p: Type): Ret"],"literals?:":["A"],"slots?:":["s = v"],"classifier?":"…","text?":"…"}],"edges":[{"type":"${edges}","from":"…","to":"…","label?":"…","tailRoleName?":"…","tailMultiplicity?":"1","headRoleName?":"…","headMultiplicity?":"0..*"}]}。节点 name 必须唯一；from/to 必须引用节点 name。`,
    `家族2 — 序列图: {"diagram":"sequence","participants":[{"name":"用户"},{"name":"服务端"}],"messages":[{"from":"用户","to":"服务端","text":"请求","sort":"sync"}]}。sort ∈ sync|async|reply|create|delete；messages 按时间先后排列。`,
    `家族3 — 活动图: {"diagram":"activity","nodes":[{"kind":"initial|action|decision|merge|fork|join|final|flowfinal|object","name":"…"}],"edges":[{"type":"control","from":"…","to":"…","name":"[条件]"}]}。守卫条件放在 edge 的 name 里。`,
    '示例(类图): {"diagram":"class","nodes":[{"kind":"class","name":"Order","attributes":["+id: String","-total: double"],"operations":["+submit(): void"]},{"kind":"class","name":"Customer"}],"edges":[{"type":"association","from":"Customer","to":"Order","tailMultiplicity":"1","headMultiplicity":"0..*"}]}',
    '示例(序列图): {"diagram":"sequence","participants":[{"name":"客户端"},{"name":"服务端"},{"name":"数据库"}],"messages":[{"from":"客户端","to":"服务端","text":"登录","sort":"sync"},{"from":"服务端","to":"数据库","text":"校验","sort":"sync"},{"from":"服务端","to":"客户端","text":"结果","sort":"reply"}]}',
    '序列图注释(Note): {"diagram":"sequence","notes":[{"over":["生命线A","生命线B"],"text":"说明"}]}。over 是被覆盖的生命线 name 数组；单条生命线也接受单个字符串，注释按覆盖范围浮在生命线上方。',
    '示例(活动图): {"diagram":"activity","nodes":[{"kind":"initial","name":"start"},{"kind":"action","name":"提交订单"},{"kind":"decision","name":"库存足够?"},{"kind":"action","name":"发货"},{"kind":"final","name":"end"}],"edges":[{"type":"control","from":"start","to":"提交订单"},{"type":"control","from":"提交订单","to":"库存足够?"},{"type":"control","from":"库存足够?","to":"发货","name":"[是]"},{"type":"control","from":"库存足够?","to":"end","name":"[否]"}]}',
  ].join('\n');
}

/** Sequence DSL: { diagram:'sequence', participants:[{name}], messages:[{from,to,text,sort}] } */
function validateSequenceDsl(dsl, errors) {
  const participants = Array.isArray(dsl.participants) ? dsl.participants : [];
  const messages = Array.isArray(dsl.messages) ? dsl.messages : [];
  if (participants.length < 1) errors.push('sequence 需要 participants（至少 1 个生命线）');
  const names = new Set();
  participants.forEach((p, i) => {
    const name = STR(p && p.name);
    if (!name) errors.push(`participants[${i}] 缺少 name`);
    else if (names.has(name)) errors.push(`生命线名称重复: ${name}`);
    else names.add(name);
  });
  messages.forEach((m, i) => {
    for (const key of ['from', 'to']) {
      const ref = STR(m && m[key]);
      if (!ref) errors.push(`messages[${i}] 缺少 ${key}`);
      else if (!names.has(ref)) errors.push(`messages[${i}] 的 ${key} "${ref}" 不在 participants 中`);
    }
    const sort = STR(m && m.sort) || 'sync';
    if (!MESSAGE_SORTS[sort]) errors.push(`messages[${i}] 未知 sort: ${sort}（可用 sync/async/reply/create/delete）`);
  });
  const notes = Array.isArray(dsl.notes) ? dsl.notes : [];
  notes.forEach((n, i) => {
    if (!STR(n && n.text)) errors.push(`notes[${i}] 缺少 text`);
    for (const ref of Array.isArray(n && n.over) ? n.over : []) {
      if (!names.has(STR(ref))) errors.push(`notes[${i}] 的 over "${STR(ref)}" 不在 participants 中`);
    }
  });
  return { ok: errors.length === 0, errors };
}

function buildSequenceDiagram(dsl, { name = 'AI Sequence' } = {}) {
  const check = validateDsl(dsl);
  if (!check.ok) throw new Error(check.errors.join('; '));
  const diagram = createDiagram('UMLSequenceDiagram', name);
  const models = [];
  const byName = new Map();
  const headH = 32;
  const msgs = dsl.messages || [];
  const lifeHeight = 70 + msgs.length * 46;
  (dsl.participants || []).forEach((p, i) => {
    const model = createModel('UMLLifeLine', STR(p.name));
    const view = createNodeView('UMLLifeLine', model._id, 80 + i * 190, 40, { lifeHeight });
    view.width = 140;
    diagram.elements.push(view);
    byName.set(STR(p.name), view);
    models.push(model);
  });
  msgs.forEach((m, i) => {
    const sort = STR(m.sort) || 'sync';
    const spec = MESSAGE_SORTS[sort];
    const tail = byName.get(STR(m.from));
    const head = byName.get(STR(m.to));
    const model = createModel('UMLMessage');
    model.name = STR(m.text) || `${m.from}→${m.to}`;
    const view = createEdgeView(spec.$type, model._id, tail._id, head._id);
    view.isMessage = true;
    view.y = 40 + headH + 50 + i * 46;
    view.lineStyle = spec.lineStyle;
    view.headArrow = spec.headArrow;
    view.tailArrow = 'none';
    diagram.elements.push(view);
    models.push(model);
  });
  // Mermaid-style `Note over A,B:` — a note box floating over the covered lifelines
  const notes = Array.isArray(dsl.notes) ? dsl.notes : [];
  notes.forEach((n) => {
    const over = (Array.isArray(n.over) ? n.over : [n.over]).map((nm) => byName.get(STR(nm))).filter(Boolean);
    if (!over.length) return;
    const model = createModel('UMLNote', 'Note');
    model.documentation = STR(n.text);
    const left = Math.min(...over.map((v) => v.x));
    const right = Math.max(...over.map((v) => v.x + v.width));
    const view = createNodeView('UMLNote', model._id, left + 10, 40 + lifeHeight + 12, { width: Math.max(140, right - left - 20), height: 60 });
    diagram.elements.push(view);
    models.push(model);
  });
  for (const model of models) diagram.ownedElements.push(model);
  return { diagram, models, nodeCount: dsl.participants.length + notes.length, edgeCount: msgs.length };
}

/** Activity DSL: { diagram:'activity', nodes:[{kind,name}], edges:[{type:'control'|'object',from,to,name}] } */
function validateActivityDsl(dsl, errors) {
  const nodes = Array.isArray(dsl.nodes) ? dsl.nodes : [];
  const edges = Array.isArray(dsl.edges) ? dsl.edges : [];
  if (!nodes.length) errors.push('activity 需要 nodes');
  const names = new Set();
  nodes.forEach((n, i) => {
    const name = STR(n && n.name);
    if (!name) errors.push(`nodes[${i}] 缺少 name`);
    else if (names.has(name)) errors.push(`节点名称重复: ${name}`);
    else names.add(name);
    const kind = STR(n && n.kind) || 'action';
    if (!ACTIVITY_KINDS[kind]) errors.push(`nodes[${i}] (${name || '?'}) 未知 kind: ${kind}`);
  });
  edges.forEach((e, i) => {
    const type = STR(e && e.type) || 'control';
    if (!['control', 'object'].includes(type)) errors.push(`edges[${i}] 未知 type: ${type}（control/object）`);
    for (const key of ['from', 'to']) {
      const ref = STR(e && e[key]);
      if (!ref) errors.push(`edges[${i}] 缺少 ${key}`);
      else if (!names.has(ref)) errors.push(`edges[${i}] 的 ${key} "${ref}" 不在 nodes 中`);
    }
  });
  return { ok: errors.length === 0, errors };
}

function buildActivityDiagram(dsl, { name = 'AI Activity', originX = 60, originY = 60 } = {}) {
  const check = validateDsl(dsl);
  if (!check.ok) throw new Error(check.errors.join('; '));
  const diagram = createDiagram('UMLActivityDiagram', name);
  const byName = new Map();
  const models = [];
  dsl.nodes.forEach((n, i) => {
    const spec = ACTIVITY_KINDS[STR(n.kind) || 'action'];
    const model = createModel(spec.type, STR(n.name));
    const col = i % 3, row = Math.floor(i / 3);
    const view = createNodeView(spec.type, model._id,
      originX + col * 240 + (120 - spec.defaults.width / 2), originY + row * 150, spec.defaults);
    diagram.elements.push(view);
    byName.set(STR(n.name), view);
    models.push(model);
  });
  for (const model of models) diagram.ownedElements.push(model);
  (dsl.edges || []).forEach((e) => {
    const type = STR(e.type) || 'control';
    const tail = byName.get(STR(e.from));
    const head = byName.get(STR(e.to));
    const spec = type === 'object' ? { type: 'UMLObjectFlow' } : { type: 'UMLControlFlow' };
    const model = createModel(spec.type, STR(e.name));
    const view = createEdgeView(spec.type, model._id, tail._id, head._id);
    view.headArrow = 'open';
    diagram.elements.push(view);
    models.push(model);
  });
  return { diagram, models, nodeCount: dsl.nodes.length, edgeCount: (dsl.edges || []).length };
}
