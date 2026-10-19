// templates.js — project templates (StarUML "New From Template")

import { createDiagram, createModel } from '../core/factory.js';

function pkg(parent, name) {
  const p = createModel('UMLPackage', name);
  parent.ownedElements.push(p);
  p.__parent = parent;
  return p;
}

function diagram(parent, type, name) {
  const d = createDiagram(type, name);
  if (parent.ownedElements) parent.ownedElements.push(d);
  else parent.elements.push(d);
  d.__parent = parent;
  return d;
}

/** The four built-in templates mirror StarUML's New From Template dialog. */
export const TEMPLATES = {
  minimal: {
    label: 'UML Minimal',
    description: '一个模型与一张空类图',
    build(root) {
      const model = createModel('Model', 'Model');
      root.ownedElements.push(model);
      model.__parent = root;
      diagram(model, 'UMLClassDiagram', 'Main');
      return model;
    },
  },
  conventional: {
    label: 'Conventional',
    description: '用例 / 领域模型 / 设计（类+序列）/ 实现包',
    build(root) {
      const model = createModel('Model', 'Model');
      root.ownedElements.push(model);
      model.__parent = root;
      const usecase = pkg(model, 'Use Case Model');
      diagram(usecase, 'UMLUseCaseDiagram', 'Use Case Diagram');
      const domain = pkg(model, 'Domain Model');
      diagram(domain, 'UMLClassDiagram', 'Domain Model Diagram');
      const design = pkg(model, 'Design Model');
      diagram(design, 'UMLClassDiagram', 'Design Model Diagram');
      diagram(design, 'UMLSequenceDiagram', 'Design Sequence Diagram');
      const impl = pkg(model, 'Implementation Model');
      diagram(impl, 'UMLComponentDiagram', 'Component Diagram');
      return model;
    },
  },
  fourplusone: {
    label: '4+1 View',
    description: '场景 / 逻辑 / 进程 / 开发 / 物理视图',
    build(root) {
      const model = createModel('Model', 'Model');
      root.ownedElements.push(model);
      model.__parent = root;
      const scenario = pkg(model, 'Scenario View');
      diagram(scenario, 'UMLUseCaseDiagram', 'Use Case View');
      const logic = pkg(model, 'Logical View');
      diagram(logic, 'UMLClassDiagram', 'Logical View');
      const process = pkg(model, 'Process View');
      diagram(process, 'UMLActivityDiagram', 'Process View');
      const dev = pkg(model, 'Development View');
      diagram(dev, 'UMLComponentDiagram', 'Development View');
      const physical = pkg(model, 'Physical View');
      diagram(physical, 'UMLDeploymentDiagram', 'Physical View');
      return model;
    },
  },
  rational: {
    label: 'Rational',
    description: '需求 / 分析 / 设计 / 实现结构',
    build(root) {
      const model = createModel('Model', 'Model');
      root.ownedElements.push(model);
      model.__parent = root;
      const req = pkg(model, 'Requirements');
      diagram(req, 'UMLUseCaseDiagram', 'Use Case Model');
      const analysis = pkg(model, 'Analysis');
      diagram(analysis, 'UMLClassDiagram', 'Analysis Model');
      const design = pkg(model, 'Design');
      diagram(design, 'UMLClassDiagram', 'Design Model');
      diagram(design, 'UMLSequenceDiagram', 'Use Case Realization');
      const impl = pkg(model, 'Implementation');
      diagram(impl, 'UMLComponentDiagram', 'Implementation Model');
      const test = pkg(model, 'Test');
      diagram(test, 'UMLCommunicationDiagram', 'Test Scenario');
      return model;
    },
  },
};

/** Apply a template to an empty project root; returns created model + diagrams. */
export function applyTemplate(key, root) {
  const tpl = TEMPLATES[key] || TEMPLATES.minimal;
  const created = [];
  const model = tpl.build(root);
  repository_collect(model, created);
  return { model, diagrams: created.filter((n) => n.type?.endsWith('Diagram')) };
}

function repository_collect(node, out) {
  for (const c of node.ownedElements || []) {
    if (c.type?.endsWith('Diagram')) out.push(c);
    repository_collect(c, out);
  }
}
