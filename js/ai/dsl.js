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

const STR = (v) => (typeof v === 'string' ? v.trim() : '');
const STRS = (v) => (Array.isArray(v) ? v.map(STR).filter(Boolean) : []);

/** Validate a parsed DSL object; returns { ok, errors: [] }. */
export function validateDsl(dsl) {
  const errors = [];
  if (!dsl || typeof dsl !== 'object' || Array.isArray(dsl)) {
    return { ok: false, errors: ['输出必须是一个 JSON 对象'] };
  }
  const diagram = STR(dsl.diagram) || 'class';
  if (!['class', 'object'].includes(diagram)) {
    errors.push(`diagram 暂只支持 "class" 或 "object"（收到 "${diagram}"）`);
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
export function buildDiagram(dsl, { name = 'AI Diagram', originX = 60, originY = 60 } = {}) {
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
    `你是 UML 建模助手。把用户的描述转换为一个 JSON 对象（DSL v${DSL_VERSION}），不要输出任何解释文字。`,
    `可用节点 kind: ${kinds}。`,
    `可用连线 type: ${edges}。`,
    '节点: { kind, name, stereotype?, attributes?: ["+name: Type"], operations?: ["+name(param: Type): Ret"], literals?: ["A","B"], slots?: ["slot = value"], classifier?, text? }。节点 name 必须唯一。',
    '连线: { type, from, to, label?, tailRoleName?, tailMultiplicity?, headRoleName?, headMultiplicity? }。from/to 必须是 nodes 中的 name。',
    `diagram 字段固定为 "class"（对象图用 "object"）。`,
    '示例: {"diagram":"class","nodes":[{"kind":"class","name":"Order","attributes":["+id: String","-total: double"],"operations":["+submit(): void"]},{"kind":"class","name":"Customer"}],"edges":[{"type":"association","from":"Customer","to":"Order","tailMultiplicity":"1","headMultiplicity":"0..*"}]}',
  ].join('\n');
}
