// mdj.js — in-app StarUML .mdj importer (browser port of tools/mdj_to_ouml.py).
// Only the UML notation OpenUML renders is mapped; unsupported views are
// reported and skipped. The file is plain JSON — nothing executes.

// StarUML extension diagram families map onto the closest OpenUML diagram type
const DIAGRAM_TYPE_MAP = {
  ERDDiagram: 'UMLClassDiagram',
  FCFlowchartDiagram: 'UMLActivityDiagram',
  MMMindmapDiagram: 'UMLClassDiagram',
  DFDDiagram: 'UMLActivityDiagram',
  BPMNDiagram: 'UMLActivityDiagram',
  AWSDiagram: 'UMLComponentDiagram',
  AzureDiagram: 'UMLComponentDiagram',
  GCPDiagram: 'UMLComponentDiagram',
  WFWireframeDiagram: 'UMLClassDiagram',
};

const DIAGRAM_TYPES = new Set([
  'UMLClassDiagram', 'UMLUseCaseDiagram', 'UMLSequenceDiagram',
  'UMLStatechartDiagram', 'UMLActivityDiagram', 'UMLComponentDiagram',
  'UMLDeploymentDiagram', 'UMLPackageDiagram', 'UMLCommunicationDiagram',
  'UMLObjectDiagram', 'UMLCompositeStructureDiagram', 'UMLProfileDiagram',
  'UMLInformationFlowDiagram', 'UMLInteractionOverviewDiagram',
  'UMLTimingDiagram',
]);

const CONTAINER_MAP = {
  UMLModel: 'UMLModel',
  UMLPackage: 'UMLPackage',
  UMLSubsystem: 'UMLSubsystem',
  // extension roots behave like models
  ERDDataModel: 'UMLModel',
  FCFlowchart: 'UMLModel',
  MMMindmap: 'UMLModel',
  DFDDataFlowModel: 'UMLModel',
  WFWireframe: 'UMLModel',
  AWSModel: 'UMLModel',
  AzureModel: 'UMLModel',
  GCPModel: 'UMLModel',
};

const WRAPPER_TYPES = new Set(['UMLInteraction', 'UMLStateMachine', 'UMLActivity', 'UMLRegion']);

const SIMPLE_MODEL_MAP = {
  UMLClass: 'UMLClass', UMLInterface: 'UMLInterface', UMLEnumeration: 'UMLEnumeration',
  UMLDataType: 'UMLDataType', UMLPrimitiveType: 'UMLPrimitiveType', UMLSignal: 'UMLClass',
  UMLActor: 'UMLActor', UMLUseCase: 'UMLUseCase', UMLUseCaseSubject: 'UMLUseCaseSubject',
  UMLComponent: 'UMLComponent', UMLArtifact: 'UMLArtifact', UMLNode: 'UMLNode',
  UMLObject: 'UMLObject', UMLCollaboration: 'UMLCollaboration',
  UMLCollaborationUse: 'UMLCollaborationUse', UMLInformationItem: 'UMLInformationItem',
  UMLMetaClass: 'UMLMetaClass', UMLStereotype: 'UMLStereotype',
  UMLState: 'UMLState', UMLFinalState: 'UMLFinalState', UMLRegion: 'UMLRegion',
  UMLOrthogonalState: 'UMLOrthogonalState', UMLSubmachineState: 'UMLSubmachineState',
  UMLEntryPoint: 'UMLEntryPoint', UMLExitPoint: 'UMLExitPoint', UMLTerminate: 'UMLTerminate',
  UMLConnectionPointReference: 'UMLConnectionPointReference',
  UMLAction: 'UMLAction', UMLObjectNode: 'UMLObjectNode',
  UMLCentralBufferNode: 'UMLCentralBufferNode', UMLDataStoreNode: 'UMLDataStoreNode',
  UMLActivityParameterNode: 'UMLActivityParameterNode',
  UMLInputPin: 'UMLInputPin', UMLOutputPin: 'UMLOutputPin',
  UMLStructuredActivityNode: 'UMLStructuredActivityNode',
  UMLInterruptibleActivityRegion: 'UMLInterruptibleRegion',
  UMLAcceptTimeEvent: 'UMLAcceptTimeEvent',
  UMLSendSignal: 'UMLSendSignal', UMLAcceptSignal: 'UMLAcceptSignal',
  UMLInitialNode: 'UMLInitialNode', UMLActivityFinalNode: 'UMLActivityFinalNode',
  UMLFlowFinalNode: 'UMLFlowFinalNode', UMLDecisionNode: 'UMLDecisionNode',
  UMLMergeNode: 'UMLMergeNode', UMLForkNode: 'UMLForkNode', UMLJoinNode: 'UMLJoinNode',
  UMLTimeConstraint: 'UMLTimeConstraint', UMLDurationConstraint: 'UMLDurationConstraint',
  UMLNote: 'UMLNote',
  // StarUML extension families → closest UML primitives
  ERDEntity: 'UMLClass',
  FCProcess: 'UMLAction',
  FCTerminator: 'UMLState',
  FCDecision: 'UMLDecisionNode',
  FCPredefinedProcess: 'UMLStructuredActivityNode',
  FCData: 'UMLObjectNode',
  FCDocument: 'UMLNote',
  FCDatabase: 'UMLDataStoreNode',
  DFDProcess: 'UMLAction',
  DFDExternalEntity: 'UMLClass',
  DFDDataStore: 'UMLDataStoreNode',
  BPMNTask: 'UMLAction',
  BPMNManualTask: 'UMLAction', BPMNScriptTask: 'UMLAction', BPMNServiceTask: 'UMLAction',
  BPMNUserTask: 'UMLAction', BPMNReceiveTask: 'UMLAction', BPMNSendTask: 'UMLAction',
  BPMNBusinessRuleTask: 'UMLAction', BPMNChoreographyTask: 'UMLAction',
  BPMNSubProcess: 'UMLStructuredActivityNode',
  BPMNGateway: 'UMLDecisionNode',
  BPMNExclusiveGateway: 'UMLDecisionNode', BPMNParallelGateway: 'UMLDecisionNode',
  BPMNInclusiveGateway: 'UMLDecisionNode', BPMNComplexGateway: 'UMLDecisionNode',
  BPMNEventBasedGateway: 'UMLDecisionNode',
  BPMNStartEvent: 'UMLInitialNode',
  BPMNEndEvent: 'UMLActivityFinalNode',
  BPMNIntermediateEvent: 'UMLAcceptSignal',
  BPMNBoundaryEvent: 'UMLAcceptSignal',
  BPMNIntermediateCatchEvent: 'UMLAcceptSignal',
  BPMNIntermediateThrowEvent: 'UMLAcceptSignal',
  BPMNEvent: 'UMLAcceptSignal',
  BPMNParticipant: 'UMLPackage',
  BPMNPool: 'UMLPackage',
  BPMNProcess: 'UMLPackage',
  BPMNLane: 'UMLPackage',
  BPMNTextAnnotation: 'UMLNote',
  BPMNConversation: 'UMLPackage',
  BPMNMessage: 'UMLClass',
  AWSResource: 'UMLComponent',
  AWSGeneralResource: 'UMLComponent',
  AWSGroup: 'UMLPackage',
  AWSCallout: 'UMLNote',
  AzureResource: 'UMLComponent',
  AzureGeneralResource: 'UMLComponent',
  AzureGroup: 'UMLPackage',
  AzureCallout: 'UMLNote',
  GCPResource: 'UMLComponent',
  GCPGeneralResource: 'UMLComponent',
  GCPProduct: 'UMLComponent',
  GCPService: 'UMLComponent',
  GCPZone: 'UMLPackage',
  GCPUser: 'UMLActor',
  GCPGroup: 'UMLPackage',
  GCPCallout: 'UMLNote',
  GCPPath: 'UMLDependency',
};

const RELATIONSHIP_MAP = {
  UMLAssociation: 'UMLAssociation', UMLGeneralization: 'UMLGeneralization',
  UMLDependency: 'UMLDependency', UMLInclude: 'UMLInclude', UMLExtend: 'UMLExtend',
  UMLInterfaceRealization: 'UMLInterfaceRealization',
  UMLComponentRealization: 'UMLComponentRealization',
  UMLInformationFlow: 'UMLInformationFlow', UMLExtension: 'UMLExtension',
  UMLCommunicationPath: 'UMLCommunicationPath', UMLLink: 'UMLLink',
  UMLConnector: 'UMLConnector', UMLTransition: 'UMLTransition',
  UMLControlFlow: 'UMLControlFlow', UMLObjectFlow: 'UMLObjectFlow',
  ERDRelationship: 'UMLAssociation',
  FCFlow: 'UMLControlFlow',
  MMEdge: 'UMLLink',
  DFDDataFlow: 'UMLObjectFlow',
  BPMNSequenceFlow: 'UMLControlFlow',
  BPMNConversationLink: 'UMLDependency',
  BPMNMessageFlow: 'UMLDependency',
  BPMNMessageLink: 'UMLDependency',
  BPMNDataAssociation: 'UMLObjectFlow',
  BPMNAssociation: 'UMLDependency',
  AWSArrow: 'UMLDependency',
  AzureArrow: 'UMLDependency',
  GCPArrow: 'UMLDependency',
};

const NODE_VIEW_TYPES = new Set([
  'UMLClassView', 'UMLInterfaceView', 'UMLEnumerationView', 'UMLDataTypeView',
  'UMLSignalView', 'UMLPackageView', 'UMLModelView', 'UMLSubsystemView',
  'UMLUseCaseView', 'UMLActorView', 'UMLUseCaseSubjectView', 'UMLComponentView',
  'UMLArtifactView', 'UMLNodeView', 'UMLObjectView', 'UMLCollaborationView',
  'UMLCollaborationUseView', 'UMLPartView', 'UMLPortView',
  'UMLInformationItemView', 'UMLMetaClassView', 'UMLStereotypeView',
  'UMLStateView', 'UMLPseudostateView', 'UMLFinalStateView',
  'UMLOrthogonalStateView', 'UMLRegionView', 'UMLSubmachineStateView',
  'UMLEntryPointView', 'UMLExitPointView', 'UMLTerminateView',
  'UMLConnectionPointReferenceView', 'UMLActionView', 'UMLControlNodeView',
  'UMLObjectNodeView', 'UMLCentralBufferNodeView', 'UMLDataStoreNodeView',
  'UMLActivityParameterNodeView', 'UMLInputPinView', 'UMLOutputPinView',
  'UMLAcceptTimeEventView', 'UMLInterruptibleActivityRegionView',
  'UMLSendSignalView', 'UMLAcceptSignalView', 'UMLSwimlaneView',
  'UMLSeqLifelineView', 'UMLCommLifelineView', 'UMLTimingLifelineView',
  'UMLTimingStateView', 'UMLTimeSegmentView', 'UMLTimeTickView',
  'UMLTimeConstraintView', 'UMLDurationConstraintView', 'UMLInteractionUseView',
  'UMLInteractionInlineView', 'UMLCombinedFragmentView', 'UMLNoteView',
  'UMLTextView', 'UMLTextBoxView', 'UMLStructuredActivityNodeView',
  // extension view families
  'ERDEntityView',
  'FCProcessView', 'FCTerminatorView', 'FCDecisionView', 'FCPredefinedProcessView',
  'FCDataView', 'FCDocumentView', 'FCDatabaseView',
  'MMNodeView',
  'DFDProcessView', 'DFDExternalEntityView', 'DFDDataStoreView',
  'WFPanelView', 'WFButtonView', 'WFRadioView', 'WFInputView', 'WFImageView', 'WFCheckboxView',
  'BPMNTaskView', 'BPMNSubProcessView', 'BPMNGatewayView', 'BPMNEventView',
  'BPMNPoolView', 'BPMNLaneView', 'BPMNConversationView', 'BPMNMessageView',
  'BPMNChoreographyTaskView', 'BPMNTextAnnotationView',
  'AWSResourceView', 'AWSGeneralResourceView', 'AWSGroupView', 'AWSCalloutView',
  'AzureResourceView', 'AzureGeneralResourceView', 'AzureGroupView', 'AzureCalloutView',
  'GCPResourceView', 'GCPGeneralResourceView', 'GCPGroupView', 'GCPCalloutView',
  'GCPProductView', 'GCPServiceView', 'GCPZoneView', 'GCPUserView',
]);

const EDGE_VIEW_TYPES = new Set([
  'UMLAssociationView', 'UMLDependencyView', 'UMLGeneralizationView',
  'UMLInterfaceRealizationView', 'UMLComponentRealizationView',
  'UMLIncludeView', 'UMLExtendView', 'UMLExtensionView', 'UMLTransitionView',
  'UMLControlFlowView', 'UMLObjectFlowView', 'UMLConnectorView',
  'UMLCommunicationPathView', 'UMLDeploymentView', 'UMLInformationFlowView',
  'UMLNoteLinkView', 'UMLContainmentView', 'UMLLinkView',
  'UMLSeqMessageView', 'UMLTimingMessageView', 'UMLCommMessageView',
  'ERDRelationshipView', 'FCFlowView', 'MMEdgeView', 'DFDDataFlowView',
  'BPMNSequenceFlowView', 'BPMNConversationLinkView', 'BPMNMessageFlowView',
  'BPMNMessageLinkView', 'BPMNDataAssociationView', 'BPMNAssociationView',
  'AWSArrowView', 'AzureArrowView', 'GCPArrowView', 'GCPPathView',
]);

const VIEW_ONLY_NODES = new Set(['UMLTextView', 'UMLTextBoxView', 'UMLTimeTickView', 'UMLSwimlaneView',
  'MMNodeView', 'WFPanelView', 'WFButtonView', 'WFRadioView', 'WFInputView', 'WFImageView', 'WFCheckboxView']);

const MESSAGE_SORT = {
  synchCall: 'UMLMessage+sync',
  asynchCall: 'UMLMessage+async',
  asynchSignal: 'UMLMessage+async',
  reply: 'UMLMessage+reply',
  createMessage: 'UMLMessage+create',
  deleteMessage: 'UMLMessage+delete',
};

const PSEUDO_KIND = {
  initial: 'UMLInitialState', choice: 'UMLChoice', junction: 'UMLJunction',
  shallowHistory: 'UMLShallowHistory', deepHistory: 'UMLDeepHistory',
  terminate: 'UMLFinalState',
};

const ref = (o) => (o && typeof o === 'object' ? o.$ref : null);
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : (parseFloat(v) || d));
const clean = (v) => (typeof v === 'string' ? v.trim() : '');

export class MdjConverter {
  constructor(mdj) {
    this.mdj = mdj;
    this.byId = new Map();
    this._index(mdj);
    this.modelMap = new Map();
    this.viewMap = new Map();
    this.diagramMap = new Map();
    this.skipped = new Map();
    this.counter = 0;
    this.rootModel = null;
    this.partModels = new Set();
    this.portModels = new Set();
    this.endpointViews = new Set();
    this._collectSpecialViews();
  }

  nid(prefix) { return `${prefix}-${++this.counter}`; }

  _index(obj) {
    if (Array.isArray(obj)) { for (const v of obj) this._index(v); return; }
    if (obj && typeof obj === 'object') {
      if (obj._id) this.byId.set(obj._id, obj);
      for (const v of Object.values(obj)) this._index(v);
    }
  }

  _collectSpecialViews() {
    for (const obj of this.byId.values()) {
      const t = obj._type;
      const m = ref(obj.model);
      if (t === 'UMLPartView' && m) this.partModels.add(m);
      else if (t === 'UMLPortView' && m) this.portModels.add(m);
      else if (t === 'UMLGateView' || t === 'UMLEndpointView') this.endpointViews.add(obj._id);
    }
  }

  resolveName(value) {
    if (value && typeof value === 'object') {
      if ('$ref' in value) return clean(this.byId.get(value.$ref)?.name);
      return clean(value.name);
    }
    return clean(value);
  }

  labelTexts(view, out = []) {
    if (!view || typeof view !== 'object') return out;
    for (const sub of view.subViews || []) {
      const text = clean(sub.text);
      if (text && sub.visible !== false) out.push(text);
      this.labelTexts(sub, out);
    }
    return out;
  }

  firstLabel(view) { return this.labelTexts(view)[0] || ''; }

  findOwner(sm) {
    let cur = this.byId.get(ref(sm._parent));
    while (cur) {
      const mapped = this.modelMap.get(cur._id);
      if (mapped && ['UMLModel', 'UMLPackage', 'UMLSubsystem'].includes(mapped.type)) return mapped;
      cur = this.byId.get(ref(cur._parent));
    }
    return this.rootModel;
  }

  attach(owner, model) {
    (owner || this.rootModel || { ownedElements: [] }).ownedElements.push(model);
  }

  modelTypeFor(sm, viewType) {
    const t = sm._type;
    const byView = {
      UMLPartView: 'UMLPart', UMLPortView: 'UMLPort', UMLCommLifelineView: 'UMLObject',
      UMLSeqLifelineView: 'UMLLifeLine', UMLTimingLifelineView: 'UMLTimingLifeline',
      UMLTimingStateView: 'UMLTimingState', UMLTimeSegmentView: 'UMLTimeSegment',
      UMLCombinedFragmentView: 'UMLCombinedFragment', UMLTimeConstraintView: 'UMLTimeConstraint',
      UMLDurationConstraintView: 'UMLDurationConstraint',
      UMLCentralBufferNodeView: 'UMLCentralBufferNode', UMLDataStoreNodeView: 'UMLDataStoreNode',
      UMLActivityParameterNodeView: 'UMLActivityParameterNode',
      UMLInputPinView: 'UMLInputPin', UMLOutputPinView: 'UMLOutputPin',
      UMLStructuredActivityNodeView: 'UMLStructuredActivityNode',
      UMLInterruptibleActivityRegionView: 'UMLInterruptibleRegion',
      UMLAcceptTimeEventView: 'UMLAcceptTimeEvent',
      UMLOrthogonalStateView: 'UMLOrthogonalState', UMLRegionView: 'UMLRegion',
      UMLSubmachineStateView: 'UMLSubmachineState', UMLEntryPointView: 'UMLEntryPoint',
      UMLExitPointView: 'UMLExitPoint', UMLTerminateView: 'UMLTerminate',
      UMLConnectionPointReferenceView: 'UMLConnectionPointReference',
      UMLInteractionUseView: 'UMLInteractionUse',
      UMLInteractionInlineView: 'UMLInteractionInOverview',
      UMLSeqMessageView: 'UMLMessage', UMLTimingMessageView: 'UMLMessage',
      UMLCommMessageView: 'UMLMessage', UMLNoteView: 'UMLNote',
    };
    if (byView[viewType]) return byView[viewType];
    if (['UMLPackageView', 'UMLModelView', 'UMLSubsystemView'].includes(viewType)) {
      if (t === 'UMLProfile') return 'UMLPackage';
      return CONTAINER_MAP[t] || 'UMLPackage';
    }
    if (viewType === 'UMLPseudostateView') return PSEUDO_KIND[sm.kind] || null;
    if (viewType === 'UMLControlNodeView') return SIMPLE_MODEL_MAP[t] || t;
    if (viewType === 'UMLSwimlaneView' || ['UMLTextView', 'UMLTextBoxView', 'UMLTimeTickView'].includes(viewType)) return null;
    if (t === 'UMLStateInvariant') return 'UMLTimeSegment';
    if (t === 'UMLConstraint') return 'UMLTimingState';
    if (t === 'UMLActivityPartition') return null;
    return SIMPLE_MODEL_MAP[t] || RELATIONSHIP_MAP[t] || null;
  }

  convertAttribute(a) {
    const model = {
      _id: this.nid('a'), $type: 'UMLAttribute',
      name: clean(a.name) || 'attribute',
      type: this.resolveName(a.type),
      multiplicity: clean(a.multiplicity),
      visibility: a.visibility || 'public',
      defaultValue: clean(a.defaultValue),
      isStatic: !!a.isStatic,
    };
    if (a.aggregation === 'composite') model.aggregation = 'composite';
    else if (a.aggregation === 'shared') model.aggregation = 'shared';
    return model;
  }

  convertOperation(op) {
    const params = [];
    for (const p of op.parameters || []) {
      const real = p && p.$ref ? this.byId.get(p.$ref) : p;
      if (!real || typeof real !== 'object') continue;
      params.push({ name: clean(real.name) || 'param', type: this.resolveName(real.type) });
    }
    return {
      _id: this.nid('o'), $type: 'UMLOperation',
      name: clean(op.name) || 'operation',
      parameters: params,
      returnType: this.resolveName(op.type),
      visibility: op.visibility || 'public',
      isStatic: !!op.isStatic,
    };
  }

  ensureModel(sm, owner = null, viewType = null) {
    if (!sm || typeof sm !== 'object') return null;
    if (this.modelMap.has(sm._id)) return this.modelMap.get(sm._id);
    const ourType = this.modelTypeFor(sm, viewType);
    if (!ourType) return null;
    const model = {
      _id: this.nid('m'), type: ourType,
      name: clean(sm.name), stereotype: clean(sm.stereotype),
      documentation: clean(sm.documentation), tags: [], ownedElements: [],
    };
    this.modelMap.set(sm._id, model);
    if (sm._type === 'ERDEntity') {
      // ERD columns become attribute lines `name : type` ({PK} for keys)
      model.attributes = (sm.columns || [])
        .filter((c) => c && typeof c === 'object')
        .map((c) => ({
          _id: this.nid('a'), $type: 'UMLAttribute',
          name: clean(c.name) || 'column',
          type: typeof c.type === 'string' ? clean(c.type) : this.resolveName(c.type),
          multiplicity: '', visibility: 'public',
          defaultValue: '', isStatic: false,
          ...(c.primaryKey ? { isStatic: false, tags: [{ _id: this.nid('t'), name: 'PK', value: '' }] } : {}),
        }));
    }
    if (['UMLClass', 'UMLInterface', 'UMLDataType', 'UMLPrimitiveType', 'UMLInformationItem',
      'UMLCollaboration', 'UMLStereotype'].includes(ourType)) {
      model.attributes = (sm.attributes || [])
        .filter((a) => a && typeof a === 'object' && !this.partModels.has(a._id) && !this.portModels.has(a._id))
        .map((a) => this.convertAttribute(a));
      model.operations = (sm.operations || []).filter((o) => o && typeof o === 'object').map((o) => this.convertOperation(o));
      model.templateParameters = (sm.templateParameters || [])
        .filter((p) => p && typeof p === 'object')
        .map((p) => ({ name: clean(p.name) || 'T', type: this.resolveName(p.type) }));
    }
    if (ourType === 'UMLEnumeration') {
      model.literals = (sm.literals || [])
        .filter((l) => l && typeof l === 'object')
        .map((l) => ({ _id: this.nid('l'), $type: 'UMLEnumerationLiteral', name: clean(l.name) || 'literal', visibility: 'public' }));
    }
    if (['UMLObject', 'UMLArtifactInstance', 'UMLComponentInstance', 'UMLNodeInstance'].includes(ourType)) {
      model.classifier = this.resolveName(sm.classifier);
      model.slots = (sm.slots || []).filter((s) => s && typeof s === 'object').map((s) => {
        let value = clean(s.value);
        if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        return { _id: this.nid('s'), $type: 'UMLSlot', name: clean(s.name), value };
      });
    }
    if (ourType === 'UMLPart') {
      model.typeName = this.resolveName(sm.type);
      model.multiplicity = clean(sm.multiplicity);
      model.aggregation = sm.aggregation === 'composite' ? 'composite' : 'shared';
    }
    if (ourType === 'UMLPort') {
      model.typeName = this.resolveName(sm.type);
      model.multiplicity = clean(sm.multiplicity);
      model.isStatic = !!sm.isStatic;
      model.isConjugated = !!sm.isConjugated;
    }
    if (ourType === 'UMLCollaborationUse') model.typeName = this.resolveName(sm.type);
    if (ourType === 'UMLAssociation') {
      for (const [key, dest] of [['end1', 'end1ReferenceId'], ['end2', 'end2ReferenceId']]) {
        const target = this.byId.get(ref((sm[key] || {}).reference));
        const converted = target && this.modelMap.get(target._id);
        if (converted) model[dest] = converted._id;
      }
    }
    if (ourType === 'UMLInteractionUse' && sm.refersTo && typeof sm.refersTo === 'object') {
      const target = this.byId.get(sm.refersTo.$ref);
      if (target) model.name = clean(target.name) || model.name;
    }
    if (ourType === 'UMLTimeConstraint' || ourType === 'UMLDurationConstraint') {
      const lo = sm.min, hi = sm.max;
      if (lo || hi) model.name = `{${lo || '0'}..${hi || '∞'}}`;
    }
    if (ourType === 'UMLInformationFlow') {
      model.conveyed = (sm.conveyed || [])
        .map((c) => this.resolveName(c)).filter(Boolean)
        .map((name) => ({ _id: this.nid('c'), $type: 'UMLClassifier', name }));
      for (const field of ['realizingConnectors', 'realizingActivityEdges', 'realizingMessages']) {
        const refs = (sm[field] || []).map((x) => ref(x)).filter(Boolean)
          .map((rid) => this.modelMap.get(rid)).filter(Boolean).map((m) => m._id);
        if (refs.length) model[field] = refs;
      }
    }
    if (ourType === 'UMLConnector') model.connectorKind = clean(sm.kind) || 'assembly';
    if (ourType === 'UMLExtension') model.multiplicity = clean(sm.multiplicity);
    if (ourType === 'UMLSubmachineState') {
      const target = this.byId.get(ref(sm.submachine));
      model.submachine = target ? clean(target.name) : '';
    }
    if (ourType === 'UMLNote') model.documentation = clean(sm.documentation);
    if (ourType === 'UMLMessage') model.name = clean(sm.name);
    if (ourType === 'UMLCombinedFragment') {
      model.operator = clean(sm.interactionOperator) || 'alt';
      const guards = (sm.operands || []).map((o) => {
        const real = o && o.$ref ? this.byId.get(o.$ref) : o;
        return real && typeof real === 'object' ? { guard: clean(real.guard || real.name) } : null;
      }).filter(Boolean);
      if (!guards.length) guards.push({ guard: '' }, { guard: '' });
      model.operands = guards;
      model.operandBoundaries = guards.slice(1).map((_, i) => (i + 1) / guards.length);
    }
    this.attach(owner !== null ? owner : this.findOwner(sm), model);
    return model;
  }

  convertChildrenInto(ownerModel, sm) {
    for (const child of sm.ownedElements || []) {
      if (!child || typeof child !== 'object') continue;
      const t = child._type;
      if (DIAGRAM_TYPES.has(t) || DIAGRAM_TYPE_MAP[t]) this.convertDiagram(child, ownerModel);
      else if (t === 'UMLProfile' || CONTAINER_MAP[t]) this.convertContainer(child, ownerModel);
      else if (WRAPPER_TYPES.has(t)) this.convertChildrenInto(ownerModel, child);
      else if (SIMPLE_MODEL_MAP[t] || RELATIONSHIP_MAP[t]) {
        this.ensureModel(child, ownerModel);
        if (t === 'UMLCollaboration') {
          this.convertChildrenInto(this.modelMap.get(child._id) || ownerModel, child);
        }
      } else if (child.ownedElements) this.convertChildrenInto(ownerModel, child);
    }
  }

  convertContainer(sm, owner) {
    const t = sm._type;
    const ourType = t === 'UMLProfile' ? 'UMLPackage' : CONTAINER_MAP[t];
    if (!ourType) return null;
    const model = {
      _id: this.nid('m'), type: ourType,
      name: clean(sm.name) || 'Model',
      stereotype: t === 'UMLProfile' ? 'profile' : clean(sm.stereotype),
      documentation: clean(sm.documentation), tags: [], ownedElements: [],
    };
    this.modelMap.set(sm._id, model);
    if (owner) owner.ownedElements.push(model);
    this.convertChildrenInto(model, sm);
    return model;
  }

  convertDiagram(sm, owner) {
    const dtype = DIAGRAM_TYPE_MAP[sm._type] || sm._type;
    if (!DIAGRAM_TYPES.has(dtype)) {
      this._skip(`diagram:${sm._type}`);
      return null;
    }
    const d = {
      _id: this.nid('d'), type: dtype,
      name: clean(sm.name) || 'Diagram',
      ownedElements: [], elements: [], defaultDiagram: false,
    };
    owner.ownedElements.push(d);
    this.diagramMap.set(sm._id, d);
    this.connectorViews = {};
    const allViews = [];
    const seen = new Set();
    const collect = (view) => {
      if (!view || typeof view !== 'object' || seen.has(view._id)) return;
      seen.add(view._id);
      allViews.push(view);
      for (const sub of view.subViews || []) collect(sub);
    };
    for (const view of sm.ownedViews || []) collect(view);
    const depth = new Map();
    for (const view of allViews) {
      let cur = view, n = 0;
      while (cur && n < 20) {
        n += 1;
        cur = this.byId.get(ref(cur._parent));
        if (cur && String(cur._type || '').endsWith('Diagram')) break;
      }
      depth.set(view._id, n);
    }
    allViews.sort((a, b) => (depth.get(a._id) || 0) - (depth.get(b._id) || 0));
    for (const view of allViews) {
      if (NODE_VIEW_TYPES.has(view._type)) this.convertNodeView(view, d);
    }
    this.inferContainers(d);
    for (const view of allViews) {
      if (EDGE_VIEW_TYPES.has(view._type)) this.convertEdgeView(view, d);
    }
    this.aggregateCommunication(sm, d);
    return d;
  }

  viewTypeFor(view) {
    const t = view._type;
    const model = this.byId.get(ref(view.model)) || {};
    const mt = model._type;
    const simple = {
      UMLClassView: 'UMLClass', UMLInterfaceView: 'UMLInterface',
      UMLEnumerationView: 'UMLEnumeration', UMLDataTypeView: 'UMLDataType',
      UMLSignalView: 'UMLClass', UMLUseCaseView: 'UMLUseCase', UMLActorView: 'UMLActor',
      UMLUseCaseSubjectView: 'Subject', UMLComponentView: 'UMLComponent',
      UMLArtifactView: 'UMLArtifact', UMLNodeView: 'UMLNode', UMLObjectView: 'UMLObject',
      UMLCollaborationView: 'UMLCollaboration', UMLCollaborationUseView: 'UMLCollaborationUse',
      UMLPartView: 'UMLPart', UMLPortView: 'UMLPort',
      UMLInformationItemView: 'UMLInformationItem', UMLMetaClassView: 'UMLMetaClass',
      UMLStereotypeView: 'UMLStereotype', UMLFinalStateView: 'UMLFinalState',
      UMLActionView: 'UMLAction', UMLObjectNodeView: 'UMLObjectNode',
      UMLCentralBufferNodeView: 'UMLCentralBufferNode', UMLDataStoreNodeView: 'UMLDataStoreNode',
      UMLActivityParameterNodeView: 'UMLActivityParameterNode',
      UMLInputPinView: 'UMLInputPin', UMLOutputPinView: 'UMLOutputPin',
      UMLInterruptibleActivityRegionView: 'UMLInterruptibleRegion',
      UMLAcceptTimeEventView: 'UMLAcceptTimeEvent',
      UMLOrthogonalStateView: 'UMLOrthogonalState', UMLRegionView: 'UMLRegion',
      UMLSubmachineStateView: 'UMLSubmachineState', UMLEntryPointView: 'UMLEntryPoint',
      UMLExitPointView: 'UMLExitPoint', UMLTerminateView: 'UMLTerminate',
      UMLConnectionPointReferenceView: 'UMLConnectionPointReference',
      UMLSendSignalView: 'UMLSendSignal', UMLAcceptSignalView: 'UMLAcceptSignal',
      UMLSeqLifelineView: 'UMLLifeLine', UMLCommLifelineView: 'UMLObject',
      UMLTimingLifelineView: 'UMLTimingLifeline', UMLTimingStateView: 'UMLTimingState',
      UMLTimeSegmentView: 'UMLTimeSegment', UMLTimeTickView: 'UMLTimeTick',
      UMLTimeConstraintView: 'UMLTimeConstraint', UMLDurationConstraintView: 'UMLDurationConstraint',
      UMLInteractionInlineView: 'UMLInteractionInOverview',
      UMLCombinedFragmentView: 'UMLCombinedFragment', UMLNoteView: 'UMLNote',
      UMLStructuredActivityNodeView: 'UMLStructuredActivityNode',
    };
    if (simple[t]) return simple[t];
    if (['UMLPackageView', 'UMLModelView', 'UMLSubsystemView'].includes(t)) {
      if (['UMLModel', 'UMLSubsystem'].includes(mt)) return mt;
      return 'UMLPackage';
    }
    if (t === 'UMLStateView') {
      if (model.submachine) return 'UMLSubmachineState';
      const regions = (view.subViews || []).filter((s) => s._type === 'UMLRegionView');
      if (regions.length >= 2) return 'UMLOrthogonalState';
      if (regions.length) return 'UMLCompositeState';
      return 'UMLState';
    }
    if (t === 'UMLPseudostateView') return PSEUDO_KIND[model.kind] || null;
    if (t === 'UMLControlNodeView') return SIMPLE_MODEL_MAP[mt] || null;
    if (t === 'UMLSwimlaneView') {
      const w = num(view.width), h = num(view.height);
      return h >= w ? 'UMLSwimlaneVert' : 'UMLSwimlaneHorz';
    }
    if (t === 'UMLInteractionUseView') {
      const diagram = this.byId.get(ref(view._parent));
      return diagram && diagram._type === 'UMLInteractionOverviewDiagram'
        ? 'UMLInteractionUseInOverview' : 'UMLInteractionUse';
    }
    if (t === 'UMLTextView' || t === 'UMLTextBoxView') return 'UMLTextView';
    // extension families → closest rendered primitive
    const extNodes = {
      ERDEntityView: 'UMLClass',
      FCProcessView: 'UMLAction', FCTerminatorView: 'UMLState', FCDecisionView: 'UMLDecisionNode',
      FCPredefinedProcessView: 'UMLStructuredActivityNode', FCDataView: 'UMLObjectNode',
      FCDocumentView: 'UMLNote', FCDatabaseView: 'UMLDataStoreNode',
      MMNodeView: 'UMLTextView',
      DFDProcessView: 'UMLAction', DFDExternalEntityView: 'UMLClass', DFDDataStoreView: 'UMLDataStoreNode',
      WFPanelView: 'UMLRectView', WFButtonView: 'UMLTextView', WFTextView: 'UMLTextView',
      WFRadioView: 'UMLTextView', WFInputView: 'UMLTextView', WFCheckboxView: 'UMLTextView',
      WFImageView: 'UMLTextView',
      BPMNTaskView: 'UMLAction', BPMNSubProcessView: 'UMLStructuredActivityNode',
      BPMNGatewayView: 'UMLDecisionNode',
      BPMNPoolView: 'UMLPackage', BPMNLaneView: 'UMLPackage',
      BPMNConversationView: 'UMLPackage', BPMNMessageView: 'UMLClass',
      BPMNChoreographyTaskView: 'UMLAction', BPMNTextAnnotationView: 'UMLNote',
      AWSResourceView: 'UMLComponent', AWSGeneralResourceView: 'UMLComponent',
      AWSGroupView: 'UMLPackage', AWSCalloutView: 'UMLNote',
      AzureResourceView: 'UMLComponent', AzureGeneralResourceView: 'UMLComponent',
      AzureGroupView: 'UMLPackage', AzureCalloutView: 'UMLNote',
      GCPResourceView: 'UMLComponent', GCPGeneralResourceView: 'UMLComponent',
      GCPGroupView: 'UMLPackage', GCPCalloutView: 'UMLNote',
      GCPProductView: 'UMLComponent', GCPServiceView: 'UMLComponent',
      GCPZoneView: 'UMLPackage', GCPUserView: 'UMLActor',
    };
    if (t === 'BPMNEventView') {
      if (mt === 'BPMNStartEvent') return 'UMLInitialNode';
      if (mt === 'BPMNEndEvent') return 'UMLActivityFinalNode';
      return 'UMLAcceptSignal';
    }
    if (extNodes[t]) return extNodes[t];
    return null;
  }

  convertNodeView(view, diagram) {
    const ourType = this.viewTypeFor(view);
    if (!ourType) { this._skip(`view:${view._type}`); return; }
    const t = view._type;
    const model = this.byId.get(ref(view.model));
    let viewModel = null;
    if (t === 'UMLNoteView' && !model) {
      viewModel = {
        _id: this.nid('m'), type: 'UMLNote', name: 'Note', stereotype: '',
        documentation: this.labelTexts(view).join('\n'), tags: [], ownedElements: [],
      };
      this.attach(this.findOwner(view), viewModel);
    } else if (!VIEW_ONLY_NODES.has(t)) {
      viewModel = this.ensureModel(model, null, t);
      if (!viewModel) { this._skip(`no-model:${t}`); return; }
    }
    const x = num(view.left), y = num(view.top);
    let w = num(view.width), h = num(view.height);
    const v = {
      _id: this.nid('v'), $type: ourType,
      modelRef: viewModel ? viewModel._id : '',
      x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100,
      width: Math.round(w * 100) / 100 || 80, height: Math.round(h * 100) / 100 || 40,
      fillColor: '', lineColor: '', fontColor: '', fontSize: 12,
    };
    const label = this.firstLabel(view);
    if (t === 'UMLSeqLifelineView') {
      const headH = num((this.byId.get(ref(view.nameCompartment)) || {}).height, 40);
      const linePart = this.byId.get(ref(view.linePart));
      const lifeH = linePart ? num(linePart.height) : Math.max(0, h - headH);
      v.height = headH || 40;
      v.lifeHeight = lifeH || 300;
      if (viewModel) viewModel.name = label || viewModel.name || 'Lifeline';
    } else if (t === 'UMLCommLifelineView') {
      if (viewModel) viewModel.name = label || viewModel.name || 'Object';
    } else if (t === 'UMLTimingLifelineView') {
      if (viewModel) viewModel.name = label || viewModel.name || 'Lifeline';
      v.width = w || 520;
      v.height = h || 64;
    } else if (t === 'UMLTimingStateView') {
      if (viewModel) viewModel.name = label || viewModel.name || 'State';
    } else if (t === 'UMLTimeSegmentView') {
      v.height = h || 12;
      if (viewModel) viewModel.name = '';
    } else if (t === 'UMLTimeTickView') {
      v.text = label || '';
    } else if (t === 'UMLSwimlaneView') {
      v.laneName = label || 'Partition';
    } else if (t === 'UMLTextView' || t === 'UMLTextBoxView') {
      // wireframe/mindmap nodes carry their text in the model name
      const rawName = clean((this.byId.get(ref(view.model)) || {}).name);
      v.text = label || clean(view.text) || rawName || '';
      v.width = Math.max(w, 60);
      v.height = Math.max(h, 24);
    } else if (t === 'UMLNoteView') {
      if (viewModel && !viewModel.documentation) viewModel.documentation = this.labelTexts(view).join('\n');
    } else if (t === 'UMLPartView') {
      if (viewModel) {
        const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(label);
        if (m) {
          viewModel.name = m[1].trim() || viewModel.name;
          viewModel.multiplicity = m[2].trim();
        } else if (label) viewModel.name = label;
      }
    } else if (t === 'UMLPortView') {
      if (viewModel) viewModel.name = label || viewModel.name || 'port';
    } else if (t === 'UMLPseudostateView') {
      if (viewModel) viewModel.name = '';
    } else if (viewModel && !viewModel.name && label) {
      viewModel.name = label;
    }
    this._copyFlags(view, v);
    diagram.elements.push(v);
    this.viewMap.set(view._id, v);
    const container = this.byId.get(ref(view.containerView));
    if (container) {
      const parent = this.viewMap.get(container._id);
      if (parent) v.container = parent._id;
    }
  }

  inferContainers(diagram) {
    const nodes = diagram.elements.filter((v) => !v.isEdge);
    const containers = {
      UMLPart: new Set(['UMLClass', 'UMLInterface', 'UMLComponent', 'UMLCollaboration']),
      UMLPort: new Set(['UMLClass', 'UMLInterface', 'UMLComponent', 'UMLCollaboration']),
      UMLTimingState: new Set(['UMLTimingLifeline']),
      UMLTimeSegment: new Set(['UMLTimingState']),
      UMLTimeTick: new Set(['UMLTimingLifeline']),
      UMLInputPin: new Set(['UMLAction', 'UMLStructuredActivityNode']),
      UMLOutputPin: new Set(['UMLAction', 'UMLStructuredActivityNode']),
      UMLRegion: new Set(['UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState']),
      UMLEntryPoint: new Set(['UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState']),
      UMLExitPoint: new Set(['UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState']),
      UMLConnectionPointReference: new Set(['UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState']),
    };
    const stateLike = new Set(['UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState',
      'UMLInitialState', 'UMLFinalState', 'UMLChoice', 'UMLJunction', 'UMLShallowHistory', 'UMLDeepHistory']);
    const activityLike = new Set(['UMLAction', 'UMLObjectNode', 'UMLSendSignal', 'UMLAcceptSignal',
      'UMLInitialNode', 'UMLActivityFinalNode', 'UMLFlowFinalNode', 'UMLDecisionNode', 'UMLMergeNode',
      'UMLForkNode', 'UMLJoinNode', 'UMLCentralBufferNode', 'UMLDataStoreNode',
      'UMLActivityParameterNode', 'UMLAcceptTimeEvent', 'UMLStructuredActivityNode', 'UMLInterruptibleRegion']);
    const swim = new Set(['UMLSwimlaneVert', 'UMLSwimlaneHorz', 'UMLStructuredActivityNode', 'UMLInterruptibleRegion']);
    const contains = (c, v) => c.x <= v.x + v.width / 2 && v.x + v.width / 2 <= c.x + c.width
      && c.y <= v.y + v.height / 2 && v.y + v.height / 2 <= c.y + c.height;
    for (const v of nodes) {
      if (v.container) continue;
      let allowed = containers[v.$type];
      if (!allowed) {
        if (stateLike.has(v.$type)) {
          allowed = new Set(['UMLCompositeState', 'UMLOrthogonalState', 'UMLRegion', 'UMLSubmachineState']);
        } else if (!activityLike.has(v.$type)) continue;
        else allowed = swim;
      }
      let best = null;
      for (const c of nodes) {
        if (c === v || !allowed.has(c.$type)) continue;
        if (contains(c, v) && (!best || c.width * c.height < best.width * best.height)) best = c;
      }
      if (best) v.container = best._id;
    }
    // package/model/subsystem geometric containment
    const nestable = new Set(['UMLPackage', 'UMLModel', 'UMLSubsystem', 'UMLClass', 'UMLInterface',
      'UMLEnumeration', 'UMLDataType', 'UMLActor', 'UMLUseCase', 'UMLComponent', 'UMLArtifact',
      'UMLNode', 'UMLObject', 'UMLCollaboration', 'UMLInformationItem', 'UMLStereotype',
      'UMLMetaClass', 'UMLSubmachineState', 'UMLState']);
    for (const v of nodes) {
      if (v.container || !nestable.has(v.$type)) continue;
      let best = null;
      for (const c of nodes) {
        if (c === v || !['UMLPackage', 'UMLModel', 'UMLSubsystem'].includes(c.$type)) continue;
        if (contains(c, v) && (!best || c.width * c.height < best.width * best.height)) best = c;
      }
      if (best) v.container = best._id;
    }
  }

  resolveEndpoint(endpointRef) {
    const rid = ref(endpointRef);
    if (!rid) return null;
    if (this.viewMap.has(rid)) return { kind: 'view', view: this.viewMap.get(rid) };
    let cur = this.byId.get(rid);
    let hops = 0;
    while (cur && hops < 20) {
      hops += 1;
      if (cur._id && this.viewMap.has(cur._id)) return { kind: 'view', view: this.viewMap.get(cur._id) };
      const parentId = ref(cur.containerView) || ref(cur._parent);
      if (!parentId) break;
      if (this.viewMap.has(parentId)) return { kind: 'view', view: this.viewMap.get(parentId) };
      cur = this.byId.get(parentId);
    }
    if (this.endpointViews.has(rid)) return { kind: 'endpoint', id: rid };
    return null;
  }

  edgeTypeFor(view, model) {
    const t = view._type;
    const mt = model ? model._type : null;
    if (t === 'UMLSeqMessageView') return MESSAGE_SORT[(model || {}).messageSort] || 'UMLMessage+sync';
    if (t === 'UMLTimingMessageView') return 'UMLTimeMessage';
    if (t === 'UMLCommMessageView') return null;
    if (t === 'UMLAssociationView') return 'UMLAssociation';
    if (t === 'UMLDependencyView') return (model || {}).stereotype === 'deploy' ? 'UMLDeployment' : 'UMLDependency';
    if (t === 'UMLGeneralizationView') return 'UMLGeneralization';
    if (t === 'UMLInterfaceRealizationView') return 'UMLInterfaceRealization';
    if (t === 'UMLComponentRealizationView') return 'UMLComponentRealization';
    if (t === 'UMLIncludeView') return 'UMLInclude';
    if (t === 'UMLExtendView') return 'UMLExtend';
    if (t === 'UMLExtensionView') return 'UMLExtension';
    if (t === 'UMLTransitionView') return 'UMLTransition';
    if (t === 'UMLControlFlowView') return 'UMLControlFlow';
    if (t === 'UMLObjectFlowView') return 'UMLObjectFlow';
    if (t === 'UMLConnectorView') {
      const diagram = this.byId.get(ref(view._parent));
      return diagram && diagram._type === 'UMLCommunicationDiagram' ? 'UMLConnector' : 'UMLCompositeConnector';
    }
    if (t === 'UMLCommunicationPathView') return 'UMLCommunicationPath';
    if (t === 'UMLDeploymentView') return 'UMLDeployment';
    if (t === 'UMLInformationFlowView') return 'UMLInformationFlow';
    if (t === 'UMLNoteLinkView') return 'UMLNoteLink';
    if (t === 'UMLContainmentView') return 'UMLContainment';
    if (t === 'UMLLinkView') return 'UMLLink';
    const extEdges = {
      ERDRelationshipView: 'UMLAssociation',
      FCFlowView: 'UMLControlFlow',
      MMEdgeView: 'UMLLink',
      DFDDataFlowView: 'UMLObjectFlow',
      BPMNSequenceFlowView: 'UMLControlFlow',
      BPMNConversationLinkView: 'UMLDependency',
      BPMNMessageFlowView: 'UMLDependency',
      BPMNMessageLinkView: 'UMLDependency',
      BPMNDataAssociationView: 'UMLObjectFlow',
      BPMNAssociationView: 'UMLDependency',
      AWSArrowView: 'UMLDependency',
      AzureArrowView: 'UMLDependency',
      GCPArrowView: 'UMLDependency',
      GCPPathView: 'UMLDependency',
    };
    return extEdges[t] || null;
  }

  parsePoints(view) {
    const raw = view.points;
    if (typeof raw !== 'string') return [];
    const out = [];
    for (const part of raw.split(';')) {
      const idx = part.indexOf(':');
      if (idx < 0) continue;
      const xi = parseFloat(part.slice(0, idx)), yi = parseFloat(part.slice(idx + 1));
      if (isFinite(xi) && isFinite(yi)) out.push({ x: Math.round(xi * 100) / 100, y: Math.round(yi * 100) / 100 });
    }
    return out;
  }

  convertEdgeView(view, diagram) {
    const t = view._type;
    if (t === 'UMLCommMessageView') return; // aggregated onto its connector
    const model = this.byId.get(ref(view.model));
    const ourType = this.edgeTypeFor(view, model);
    if (!ourType) { this._skip(`edge:${t}`); return; }
    const tail = this.resolveEndpoint(view.tail);
    const head = this.resolveEndpoint(view.head);
    const points = this.parsePoints(view);
    const label = this.firstLabel(view);

    if (t === 'UMLSeqMessageView') {
      let tailView = tail && tail.kind === 'view' ? tail.view : null;
      let headView = head && head.kind === 'view' ? head.view : null;
      let type = ourType;
      const y = points.length ? points[0].y : (tailView ? tailView.y + 20 : 60);
      if (tail && tail.kind === 'endpoint' && headView) { type = 'UMLMessage+found'; tailView = null; }
      else if (head && head.kind === 'endpoint' && tailView) { type = 'UMLMessage+lost'; headView = null; }
      if (!tailView && !headView) { this._skip('edge:seq-message-endpoints'); return; }
      if (headView && !tailView && type !== 'UMLMessage+found') type = 'UMLMessage+found';
      if (tailView && !headView && type !== 'UMLMessage+lost') type = 'UMLMessage+lost';
      const v = {
        _id: this.nid('e'), $type: type, isEdge: true, isMessage: true,
        modelRef: model ? this.ensureModel(model, null, t)._id : '',
        tail: tailView ? tailView._id : null,
        head: headView ? headView._id : null,
        y, points: [],
        lineStyle: ['UMLMessage+reply', 'UMLMessage+create'].includes(type) ? 'dashed' : 'solid',
        tailArrow: 'none',
        headArrow: ['UMLMessage+sync', 'UMLMessage+delete'].includes(type) ? 'filledTriangle' : 'open',
        stereotype: type === 'UMLMessage+create' ? '«create»' : (type === 'UMLMessage+delete' ? '«destroy»' : ''),
        nameVisible: true,
      };
      if (type === 'UMLMessage+found' || type === 'UMLMessage+lost') {
        const anchor = type === 'UMLMessage+found' ? points[0] : points[points.length - 1];
        v.endpointX = anchor ? anchor.x : 20;
      }
      if (model) {
        const vm = this.ensureModel(model, null, t);
        if (label) vm.name = label;
      }
      diagram.elements.push(v);
      this.viewMap.set(view._id, v);
      return;
    }

    if (!tail || !head || tail.kind !== 'view' || head.kind !== 'view') {
      this._skip(`edge:${t}-endpoints`);
      return;
    }
    let tailView = tail.view, headView = head.view;
    const v = {
      _id: this.nid('e'), $type: ourType, isEdge: true, isMessage: false,
      modelRef: '', tail: tailView._id, head: headView._id,
      points: points.length > 2 ? points.slice(1, -1) : [],
      lineStyle: 'solid', tailArrow: 'none', headArrow: 'none',
      stereotype: '', nameVisible: true,
    };
    if (ourType === 'UMLTimeMessage') {
      const laneOf = (candidate) => {
        let cur = candidate, guard = 0;
        while (cur && guard < 10) {
          guard += 1;
          if (cur.$type === 'UMLTimingLifeline') return cur;
          if (cur.container) cur = diagram.elements.find((x) => x._id === cur.container) || null;
          else cur = null;
        }
        return candidate;
      };
      tailView = laneOf(tailView);
      headView = laneOf(headView);
      v.tail = tailView._id;
      v.head = headView._id;
      v.x = points.length ? points[0].x : tailView.x + tailView.width / 2;
      v.y = 0;
    }
    if (model) {
      const vm = this.ensureModel(model, null, t);
      if (vm) v.modelRef = vm._id;
      if (label && vm) vm.name = label;
    }
    if ('shadow' in view) v.shadow = !!view.shadow;
    const modeMap = { rectilinear: 'orthogonal', orthogonal: 'orthogonal', oblique: 'oblique', rounded: 'rounded', curved: 'curved' };
    const mode = modeMap[String(view.lineMode || '').toLowerCase()];
    if (mode) v.lineMode = mode;
    if (ourType === 'UMLAssociation') {
      v.lineStyle = 'solid';
      const end1 = (model || {}).end1 || {};
      const end2 = (model || {}).end2 || {};
      v.tailRoleName = clean(end1.name);
      v.tailMultiplicity = clean(end1.multiplicity);
      v.headRoleName = clean(end2.name);
      v.headMultiplicity = clean(end2.multiplicity);
      if (end1.aggregation === 'composite') v.tailArrow = 'filledDiamond';
      else if (end1.aggregation === 'shared') v.tailArrow = 'hollowDiamond';
      else if (end2.aggregation === 'composite') v.headArrow = 'filledDiamond';
      else if (end2.aggregation === 'shared') v.headArrow = 'hollowDiamond';
      if (end2.navigable === 'navigable' && v.headArrow === 'none') v.headArrow = 'open';
      if (end1.navigable === 'navigable' && v.tailArrow === 'none') v.tailArrow = 'open';
    } else if (ourType === 'UMLDependency') {
      v.lineStyle = 'dashed'; v.headArrow = 'open';
    } else if (ourType === 'UMLInterfaceRealization' || ourType === 'UMLComponentRealization') {
      v.lineStyle = 'dashed'; v.headArrow = 'hollowTriangle';
    } else if (ourType === 'UMLGeneralization') {
      v.headArrow = 'hollowTriangle';
    } else if (ourType === 'UMLInclude') {
      v.lineStyle = 'dashed'; v.headArrow = 'open'; v.stereotype = '«include»';
    } else if (ourType === 'UMLExtend') {
      v.lineStyle = 'dashed'; v.headArrow = 'open'; v.stereotype = '«extend»';
    } else if (ourType === 'UMLDeployment') {
      v.lineStyle = 'dashed'; v.headArrow = 'open'; v.stereotype = '«deploy»';
    } else if (ourType === 'UMLExtension') {
      v.headArrow = 'filledTriangle';
    } else if (['UMLTransition', 'UMLControlFlow', 'UMLObjectFlow'].includes(ourType)) {
      v.headArrow = 'open';
    } else if (ourType === 'UMLInformationFlow') {
      v.lineStyle = 'dotted'; v.headArrow = 'open'; v.stereotype = '«flow»';
    } else if (ourType === 'UMLNoteLink') {
      v.lineStyle = 'dashed';
    } else if (ourType === 'UMLContainment') {
      v.tailArrow = 'containment';
    } else if (ourType === 'UMLLink') {
      v.lineStyle = 'solid';
      const end1 = (model || {}).end1 || {};
      const end2 = (model || {}).end2 || {};
      v.tailRoleName = clean(end1.name);
      v.tailMultiplicity = clean(end1.multiplicity);
      v.headRoleName = clean(end2.name);
      v.headMultiplicity = clean(end2.multiplicity);
      if (end2.navigable === 'navigable') v.headArrow = 'open';
    } else if (ourType === 'UMLConnector' || ourType === 'UMLCompositeConnector') {
      v.lineStyle = 'solid';
    } else if (ourType === 'UMLTimeMessage') {
      v.lineStyle = 'solid'; v.headArrow = 'open';
    }
    this._copyFlags(view, v);
    diagram.elements.push(v);
    this.viewMap.set(view._id, v);
    if (ourType === 'UMLConnector' && model) {
      this.connectorViews = this.connectorViews || {};
      this.connectorViews[model._id] = v;
    }
  }

  _copyFlags(view, v) {
    for (const flag of ['showVisibility', 'showType', 'showMultiplicity', 'showOperationSignature',
      'showProperty', 'suppressAttributes', 'suppressOperations', 'suppressLiterals',
      'showNamespace', 'shadow', 'autoResize']) {
      if (flag in view) v[flag] = !!view[flag];
    }
    // explicit colors travel as-is (extension families style their shapes)
    for (const key of ['fillColor', 'lineColor', 'fontColor']) {
      const val = clean(view[key]);
      if (val && val.startsWith('#')) v[key] = val;
    }
    if (view.wordWrap || view.autoWrap) v.autoWrap = true;
    if ('stereotypeDisplay' in view) {
      v.stereotypeDisplay = view.stereotypeDisplay === 'none' ? 'none' : 'label';
    }
  }

  aggregateCommunication(sm, d) {
    if ((sm._type || sm.type) !== 'UMLCommunicationDiagram') return;
    const connectors = this.connectorViews || {};
    for (const view of this.byId.values()) {
      if (!view || view._type !== 'UMLCommMessageView') continue;
      if (this.byId.get(ref(view._parent)) !== sm) continue;
      const model = this.byId.get(ref(view.model)) || {};
      const target = connectors[ref(model.connector)];
      if (!target) continue;
      let text = this.firstLabel(view) || clean(model.name);
      text = text.replace(/^\s*\d+\s*/, '').trim();
      const connector = this.byId.get(ref(model.connector)) || {};
      const end1 = ref((connector.end1 || {}).reference);
      const end2 = ref((connector.end2 || {}).reference);
      const source = ref(model.source);
      const direction = end2 && source === end2 && source !== end1 ? 'reverse' : 'forward';
      target.messages = target.messages || [];
      target.messages.push({ text, direction });
    }
  }

  _skip(key) { this.skipped.set(key, (this.skipped.get(key) || 0) + 1); }

  convert() {
    const project = {
      _id: this.nid('p'), type: 'Project',
      name: clean(this.mdj.name) || 'Project',
      documentation: clean(this.mdj.documentation),
      ownedElements: [],
    };
    const topContainers = (this.mdj.ownedElements || [])
      .filter((c) => c && typeof c === 'object' && (CONTAINER_MAP[c._type] || c._type === 'UMLProfile'));
    if (!topContainers.length) {
      const fallback = { _id: '__root__', name: 'Model', _type: 'UMLModel', ownedElements: this.mdj.ownedElements || [] };
      this.rootModel = this.convertContainer(fallback, project);
    } else {
      this.rootModel = null;
      for (const c of topContainers) this.convertContainer(c, project);
      this.rootModel = project.ownedElements.find((m) => ['UMLModel', 'UMLPackage', 'UMLSubsystem'].includes(m.type)) || null;
    }
    for (const obj of this.byId.values()) {
      if ((DIAGRAM_TYPES.has(obj._type) || DIAGRAM_TYPE_MAP[obj._type]) && !this.diagramMap.has(obj._id)) {
        const owner = this.findOwner(obj) || this.rootModel;
        if (owner) this.convertDiagram(obj, owner);
      }
    }
    return project;
  }
}

/** Convert an .mdj project object into an .ouml project object. */
export function convertMdj(mdj) {
  const conv = new MdjConverter(mdj);
  const project = conv.convert();
  return {
    project,
    skipped: Object.fromEntries(conv.skipped),
    models: conv.modelMap.size,
    diagrams: conv.diagramMap.size,
  };
}
