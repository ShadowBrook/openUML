// validator.js — read-only model consistency checks.
// Issues are plain data: { severity, code, message, diagramId?, viewId?, modelId?, label? }

import { ModelKinds } from './metamodel.js';

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function typeName(type) {
  return ModelKinds[type]?.name || String(type || 'Element').replace(/^UML/, '');
}

function isRelationship(type) {
  return [
    'UMLAssociation', 'UMLGeneralization', 'UMLDependency', 'UMLInclude', 'UMLExtend',
    'UMLInterfaceRealization', 'UMLComponentRealization', 'UMLRealization',
    'UMLTemplateBinding', 'UMLInformationFlow', 'UMLExtension', 'UMLCommunicationPath',
    'UMLLink', 'UMLDirectedLink', 'UMLConnector', 'UMLTransition', 'UMLControlFlow',
    'UMLObjectFlow', 'UMLMessage', 'UMLNoteLink',
  ].includes(type);
}

function optionalName(model) {
  if (!model) return true;
  if (isRelationship(model.type)) return true;
  if (['UMLInputPin', 'UMLOutputPin', 'UMLTimeSegment', 'UMLTimeTick', 'UMLLifeLine'].includes(model.type)) return true;
  if (['UMLObject', 'UMLArtifactInstance', 'UMLComponentInstance', 'UMLNodeInstance'].includes(model.type)
      && model.classifier) return true;
  return false;
}

function duplicates(items, keyFn) {
  const groups = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].filter(([, list]) => list.length > 1);
}

export function validateProject(repo, root = repo.root) {
  const issues = [];
  const add = (issue) => issues.push(issue);
  if (!root) return issues;

  const diagrams = [];
  repo.walk((n) => {
    if (n.type?.endsWith('Diagram') && Array.isArray(n.elements)) diagrams.push(n);
  });

  // Model tree checks: duplicate sibling names, empty names, duplicate members.
  repo.walk((node) => {
    if (!node || node.$type || node.isEdge) return;
    if (!Array.isArray(node.ownedElements)) return;

    for (const [groupType, list] of duplicates(node.ownedElements.filter((c) => c && c.type && !c.type.endsWith('Diagram') && c.name),
      (c) => isRelationship(c.type) ? '' : `${c.type}\u0000${c.name.trim().toLowerCase()}`)) {
      const first = list[0];
      add({
        severity: 'warning',
        code: 'duplicate-name',
        message: `同级有 ${list.length} 个 ${typeName(first.type)} 都命名为 “${first.name}”`,
        modelId: first._id,
        label: `${typeName(first.type)} · ${first.name}`,
      });
      void groupType;
    }

    const diagramGroups = duplicates(node.ownedElements.filter((c) => c && c.type?.endsWith('Diagram') && c.name),
      (c) => c.name.trim().toLowerCase());
    for (const [, list] of diagramGroups) {
      add({
        severity: 'warning',
        code: 'duplicate-diagram-name',
        message: `同一模型下有 ${list.length} 个同名图表 “${list[0].name}”`,
        diagramId: list[0]._id,
        label: `图表 · ${list[0].name}`,
      });
    }

    for (const child of node.ownedElements) {
      if (!child || child.$type || child.isEdge) continue;
      if (child.type === 'Project' || child.type === 'Model') continue;
      if (!child.name && !optionalName(child)) {
        add({
          severity: 'info',
          code: 'empty-name',
          message: `${typeName(child.type)} 没有名称`,
          modelId: child._id,
          label: typeName(child.type),
        });
      }
      for (const key of ['attributes', 'operations', 'literals']) {
        if (!Array.isArray(child[key])) continue;
        const dupes = duplicates(child[key].filter((m) => m && m.name), (m) => m.name.trim().toLowerCase());
        for (const [, list] of dupes) {
          add({
            severity: 'warning',
            code: 'duplicate-member',
            message: `${typeName(child.type)} “${child.name || '(unnamed)'}” 中有 ${list.length} 个同名 ${key === 'literals' ? '字面量' : key === 'attributes' ? '属性' : '操作'} “${list[0].name}”`,
            modelId: child._id,
            label: `${child.name || '(unnamed)'} · ${list[0].name}`,
          });
        }
      }
      if (child.type === 'UMLObject' && !child.classifier) {
        add({
          severity: 'info',
          code: 'object-without-classifier',
          message: `对象 “${child.name || '(unnamed)'}” 没有 classifier`,
          modelId: child._id,
          label: child.name || 'Object',
        });
      }
    }
  });

  // Diagram-local checks.
  for (const diagram of diagrams) {
    if (!diagram.__parent) {
      add({
        severity: 'error',
        code: 'detached-diagram',
        message: `图表 “${diagram.name}” 没有所属模型`,
        diagramId: diagram._id,
        label: diagram.name,
      });
    }
    if (!diagram.elements.length) {
      add({
        severity: 'info',
        code: 'empty-diagram',
        message: `图表 “${diagram.name}” 为空`,
        diagramId: diagram._id,
        label: diagram.name,
      });
    }
    const ids = new Set(diagram.elements.map((v) => v._id));
    for (const view of diagram.elements) {
      const viewLabel = `${diagram.name} · ${typeName(view.$type)}`;
      if (view.modelRef && !repo.lookup(view.modelRef)) {
        add({
          severity: 'error',
          code: 'dangling-model-ref',
          message: `视图引用了不存在的模型元素 (${view.modelRef})`,
          diagramId: diagram._id,
          viewId: view._id,
          label: viewLabel,
        });
      }
      if (view.isEdge) {
        for (const [side, id] of [['起点', view.tail], ['终点', view.head]]) {
          if (id && !ids.has(id)) {
            add({
              severity: 'error',
              code: 'dangling-edge-endpoint',
              message: `${view.$type} 的${side}不在当前图表中`,
              diagramId: diagram._id,
              viewId: view._id,
              label: viewLabel,
            });
          }
        }
      } else if (view.container && !ids.has(view.container)) {
        add({
          severity: 'warning',
          code: 'dangling-container',
          message: `视图的容器引用不在当前图表中`,
          diagramId: diagram._id,
          viewId: view._id,
          label: viewLabel,
        });
      }
    }
  }

  return issues.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

export function issueCounts(issues) {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) counts[issue.severity] = (counts[issue.severity] || 0) + 1;
  return counts;
}
