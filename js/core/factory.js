// factory.js — creation of model elements and diagram views

import { genId } from './repository.js';
import { NodeDefaults, EdgeDefs } from './metamodel.js';

export function createModel(type, name, extra = {}) {
  const el = {
    _id: genId('m'),
    type,
    name: name ?? defaultName(type),
    stereotype: '',
    documentation: '',
    tags: [],
    ownedElements: [],
    ...extra,
  };
  if (type === 'UMLClass' || type === 'UMLInterface' || type === 'UMLDataType') {
    el.attributes = [];
    el.operations = [];
    el.templateParameters = [];
  }
  if (type === 'UMLEnumeration') {
    el.literals = [];
  }
  if (type === 'UMLCombinedFragment') {
    el.operator = 'alt';
    el.operands = [{ guard: '' }, { guard: '' }];
    el.operandBoundaries = [0.5];
  }
  return el;
}

export function createAttribute(name = 'attribute', type = '', visibility = 'public') {
  return { _id: genId('a'), $type: 'UMLAttribute', name, type, visibility, defaultValue: '', isStatic: false };
}
export function createOperation(name = 'operation', params = [], returnType = '', visibility = 'public') {
  return { _id: genId('o'), $type: 'UMLOperation', name, parameters: params, returnType, visibility, isStatic: false };
}
export function createLiteral(name = 'literal') {
  return { _id: genId('l'), $type: 'UMLEnumerationLiteral', name, visibility: 'public' };
}

export function defaultName(type) {
  const counters = defaultName._c || (defaultName._c = {});
  counters[type] = (counters[type] || 0) + 1;
  const label = {
    UMLClass: 'Class', UMLInterface: 'Interface', UMLEnumeration: 'Enumeration',
    UMLDataType: 'DataType', UMLActor: 'Actor', UMLUseCase: 'UseCase',
    UMLPackage: 'Package', UMLNote: 'Note', Model: 'Model',
    UMLClassDiagram: 'Main', UMLUseCaseDiagram: 'Main',
  }[type] || type.replace(/^UML/, '');
  return `${label}${counters[type]}`;
}
export function resetNameCounters() { defaultName._c = {}; }

/** Create a view for a model element on a diagram. */
export function createNodeView(type, modelRef, x, y, extra = {}) {
  const d = NodeDefaults[type] || { width: 120, height: 60 };
  return {
    _id: genId('v'),
    $type: type,
    modelRef,
    x, y,
    width: d.width, height: d.height,
    // styles
    fillColor: '',
    lineColor: '',
    fontColor: '',
    fontSize: 12,
    ...extra,
  };
}

export function createEdgeView(type, modelRef, tailViewId, headViewId, extra = {}) {
  const def = EdgeDefs[type] || {};
  return {
    _id: genId('e'),
    $type: type,
    isEdge: true,
    isMessage: type.startsWith('UMLMessage'),
    modelRef,
    tail: tailViewId,
    head: headViewId,
    points: [],            // user waypoints
    lineStyle: def.lineStyle || 'solid',
    tailArrow: def.tailArrow || 'none',
    headArrow: def.headArrow || 'none',
    stereotype: extra.stereotype ?? def.stereotype ?? '',
    nameVisible: true,
    tailRoleName: '', tailMultiplicity: '',
    headRoleName: '', headMultiplicity: '',
    ...extra,
  };
}

export function createDiagram(diagramType, name, extra = {}) {
  return {
    _id: genId('d'),
    type: diagramType,
    name,
    ownedElements: [],
    elements: [],          // diagram views
    defaultDiagram: false,
    ...extra,
  };
}

export function createProject() {
  const project = { _id: genId('p'), type: 'Project', name: 'Project', ownedElements: [], documentation: '' };
  const model = createModel('Model', 'Model');
  repositorylessAdd(project, model);
  const diagram = createDiagram('UMLClassDiagram', 'Main');
  repositorylessAdd(model, diagram);
  diagram.defaultDiagram = true;
  return project;
}

function repositorylessAdd(parent, child) {
  parent.ownedElements.push(child);
  child.__parent = parent;
}
