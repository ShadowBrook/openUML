#!/usr/bin/env python3
"""Convert a StarUML .mdj project into OpenUML's .ouml JSON format.

Only the UML notation implemented by OpenUML is mapped. Unsupported views are
reported and skipped; the converter never executes or imports StarUML code.

Usage:
    python3 tools/mdj_to_ouml.py UMLExample.mdj samples/staruml/UMLExample.ouml
    python3 tools/mdj_to_ouml.py input.mdj output.ouml --report report.json
"""

import argparse
import json
import os
import re
import sys
from collections import Counter


DIAGRAM_TYPES = {
    'UMLClassDiagram', 'UMLUseCaseDiagram', 'UMLSequenceDiagram',
    'ERDDiagram',
    'UMLStatechartDiagram', 'UMLActivityDiagram', 'UMLComponentDiagram',
    'UMLDeploymentDiagram', 'UMLPackageDiagram', 'UMLCommunicationDiagram',
    'UMLObjectDiagram', 'UMLCompositeStructureDiagram', 'UMLProfileDiagram',
    'UMLInformationFlowDiagram', 'UMLInteractionOverviewDiagram',
    'UMLTimingDiagram',
}

DIAGRAM_TYPE_MAP = {
    'ERDDiagram': 'ERDDiagram',
    'FCFlowchartDiagram': 'UMLActivityDiagram',
    'MMMindmapDiagram': 'UMLClassDiagram',
    'DFDDiagram': 'UMLActivityDiagram',
    'BPMNDiagram': 'UMLActivityDiagram',
    'AWSDiagram': 'UMLComponentDiagram',
    'AzureDiagram': 'UMLComponentDiagram',
    'GCPDiagram': 'UMLComponentDiagram',
    'WFWireframeDiagram': 'UMLClassDiagram',
}

CONTAINER_MAP = {
    'UMLModel': 'UMLModel',
    'UMLPackage': 'UMLPackage',
    'UMLSubsystem': 'UMLSubsystem',
    'ERDDataModel': 'UMLModel',
    'FCFlowchart': 'UMLModel',
    'MMMindmap': 'UMLModel',
    'DFDDataFlowModel': 'UMLModel',
    'WFWireframe': 'UMLModel',
    'AWSModel': 'UMLModel',
    'AzureModel': 'UMLModel',
    'GCPModel': 'UMLModel',
}

WRAPPER_TYPES = {'UMLInteraction', 'UMLStateMachine', 'UMLActivity', 'UMLRegion'}

SIMPLE_MODEL_MAP = {
    'UMLClass': 'UMLClass',
    'UMLInterface': 'UMLInterface',
    'UMLEnumeration': 'UMLEnumeration',
    'UMLDataType': 'UMLDataType',
    'UMLPrimitiveType': 'UMLPrimitiveType',
    'UMLSignal': 'UMLClass',
    'UMLActor': 'UMLActor',
    'UMLUseCase': 'UMLUseCase',
    'UMLUseCaseSubject': 'UMLUseCaseSubject',
    'UMLComponent': 'UMLComponent',
    'UMLArtifact': 'UMLArtifact',
    'UMLNode': 'UMLNode',
    'UMLObject': 'UMLObject',
    'UMLCollaboration': 'UMLCollaboration',
    'UMLCollaborationUse': 'UMLCollaborationUse',
    'UMLInformationItem': 'UMLInformationItem',
    'UMLMetaClass': 'UMLMetaClass',
    'UMLStereotype': 'UMLStereotype',
    'UMLState': 'UMLState',
    'UMLFinalState': 'UMLFinalState',
    'UMLRegion': 'UMLRegion',
    'UMLOrthogonalState': 'UMLOrthogonalState',
    'UMLSubmachineState': 'UMLSubmachineState',
    'UMLEntryPoint': 'UMLEntryPoint',
    'UMLExitPoint': 'UMLExitPoint',
    'UMLTerminate': 'UMLTerminate',
    'UMLConnectionPointReference': 'UMLConnectionPointReference',
    'UMLAction': 'UMLAction',
    'UMLObjectNode': 'UMLObjectNode',
    'UMLCentralBufferNode': 'UMLCentralBufferNode',
    'UMLDataStoreNode': 'UMLDataStoreNode',
    'UMLActivityParameterNode': 'UMLActivityParameterNode',
    'UMLInputPin': 'UMLInputPin',
    'UMLOutputPin': 'UMLOutputPin',
    'UMLStructuredActivityNode': 'UMLStructuredActivityNode',
    'UMLInterruptibleActivityRegion': 'UMLInterruptibleRegion',
    'UMLAcceptTimeEvent': 'UMLAcceptTimeEvent',
    'UMLSendSignal': 'UMLSendSignal',
    'UMLAcceptSignal': 'UMLAcceptSignal',
    'UMLInitialNode': 'UMLInitialNode',
    'UMLActivityFinalNode': 'UMLActivityFinalNode',
    'UMLFlowFinalNode': 'UMLFlowFinalNode',
    'UMLDecisionNode': 'UMLDecisionNode',
    'UMLMergeNode': 'UMLMergeNode',
    'UMLForkNode': 'UMLForkNode',
    'UMLJoinNode': 'UMLJoinNode',
    'UMLTimeConstraint': 'UMLTimeConstraint',
    'UMLDurationConstraint': 'UMLDurationConstraint',
    'UMLNote': 'UMLNote',
    # StarUML extension families → closest UML primitives
    'ERDEntity': 'ERDEntity',
    'FCProcess': 'UMLAction',
    'FCTerminator': 'UMLState',
    'FCDecision': 'UMLDecisionNode',
    'FCPredefinedProcess': 'UMLStructuredActivityNode',
    'FCData': 'UMLObjectNode',
    'FCDocument': 'UMLNote',
    'FCDatabase': 'UMLDataStoreNode',
    'DFDProcess': 'UMLAction',
    'DFDExternalEntity': 'UMLClass',
    'DFDDataStore': 'UMLDataStoreNode',
    'BPMNTask': 'UMLAction',
    'BPMNManualTask': 'UMLAction', 'BPMNScriptTask': 'UMLAction', 'BPMNServiceTask': 'UMLAction',
    'BPMNUserTask': 'UMLAction', 'BPMNReceiveTask': 'UMLAction', 'BPMNSendTask': 'UMLAction',
    'BPMNBusinessRuleTask': 'UMLAction', 'BPMNChoreographyTask': 'UMLAction',
    'BPMNSubProcess': 'UMLStructuredActivityNode',
    'BPMNGateway': 'UMLDecisionNode',
    'BPMNExclusiveGateway': 'UMLDecisionNode', 'BPMNParallelGateway': 'UMLDecisionNode',
    'BPMNInclusiveGateway': 'UMLDecisionNode', 'BPMNComplexGateway': 'UMLDecisionNode',
    'BPMNEventBasedGateway': 'UMLDecisionNode',
    'BPMNStartEvent': 'UMLInitialNode',
    'BPMNEndEvent': 'UMLActivityFinalNode',
    'BPMNIntermediateEvent': 'UMLAcceptSignal',
    'BPMNBoundaryEvent': 'UMLAcceptSignal',
    'BPMNIntermediateCatchEvent': 'UMLAcceptSignal',
    'BPMNIntermediateThrowEvent': 'UMLAcceptSignal',
    'BPMNEvent': 'UMLAcceptSignal',
    'BPMNParticipant': 'UMLPackage',
    'BPMNPool': 'UMLPackage',
    'BPMNProcess': 'UMLPackage',
    'BPMNLane': 'UMLPackage',
    'BPMNConversation': 'UMLPackage',
    'BPMNMessage': 'UMLClass',
    'BPMNTextAnnotation': 'UMLNote',
    'AWSResource': 'UMLComponent',
    'AWSGeneralResource': 'UMLComponent',
    'AWSGroup': 'UMLPackage',
    'AWSCallout': 'UMLNote',
    'AzureResource': 'UMLComponent',
    'AzureGeneralResource': 'UMLComponent',
    'AzureGroup': 'UMLPackage',
    'AzureCallout': 'UMLNote',
    'GCPResource': 'UMLComponent',
    'GCPGeneralResource': 'UMLComponent',
    'GCPProduct': 'UMLComponent',
    'GCPService': 'UMLComponent',
    'GCPZone': 'UMLPackage',
    'GCPUser': 'UMLActor',
    'GCPGroup': 'UMLPackage',
    'GCPCallout': 'UMLNote',
}

RELATIONSHIP_MAP = {
    'UMLAssociation': 'UMLAssociation',
    'UMLGeneralization': 'UMLGeneralization',
    'UMLDependency': 'UMLDependency',
    'UMLInclude': 'UMLInclude',
    'UMLExtend': 'UMLExtend',
    'UMLInterfaceRealization': 'UMLInterfaceRealization',
    'UMLComponentRealization': 'UMLComponentRealization',
    'UMLInformationFlow': 'UMLInformationFlow',
    'UMLExtension': 'UMLExtension',
    'UMLCommunicationPath': 'UMLCommunicationPath',
    'UMLLink': 'UMLLink',
    'UMLConnector': 'UMLConnector',
    'UMLTransition': 'UMLTransition',
    'UMLControlFlow': 'UMLControlFlow',
    'UMLObjectFlow': 'UMLObjectFlow',
    'ERDRelationship': 'ERDReference',
    'FCFlow': 'UMLControlFlow',
    'MMEdge': 'UMLLink',
    'DFDDataFlow': 'UMLObjectFlow',
    'BPMNSequenceFlow': 'UMLControlFlow',
    'BPMNConversationLink': 'UMLDependency',
    'BPMNMessageFlow': 'UMLDependency',
    'BPMNMessageLink': 'UMLDependency',
    'BPMNDataAssociation': 'UMLObjectFlow',
    'BPMNAssociation': 'UMLDependency',
    'AWSArrow': 'UMLDependency',
    'AzureArrow': 'UMLDependency',
    'GCPArrow': 'UMLDependency',
    'GCPPath': 'UMLDependency',
}

CLASSIFIER_TYPES = {
    'UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLDataType',
    'UMLPrimitiveType', 'UMLSignal', 'UMLActor', 'UMLUseCase',
    'UMLComponent', 'UMLArtifact', 'UMLNode', 'UMLElement',
    'UMLCollaboration', 'UMLInformationItem', 'UMLMetaClass', 'UMLStereotype',
}

NODE_VIEW_TYPES = {
    'UMLClassView', 'UMLInterfaceView', 'UMLEnumerationView',
    'UMLDataTypeView', 'UMLSignalView', 'UMLPackageView', 'UMLModelView',
    'UMLSubsystemView', 'UMLUseCaseView', 'UMLActorView',
    'UMLUseCaseSubjectView', 'UMLComponentView', 'UMLArtifactView',
    'UMLNodeView', 'UMLObjectView', 'UMLCollaborationView',
    'UMLCollaborationUseView', 'UMLPartView', 'UMLPortView',
    'UMLInformationItemView', 'UMLMetaClassView', 'UMLStereotypeView',
    'UMLStateView', 'UMLPseudostateView', 'UMLFinalStateView',
    'UMLOrthogonalStateView', 'UMLRegionView', 'UMLSubmachineStateView',
    'UMLEntryPointView', 'UMLExitPointView', 'UMLTerminateView',
    'UMLConnectionPointReferenceView',
    'UMLActionView', 'UMLControlNodeView', 'UMLObjectNodeView',
    'UMLCentralBufferNodeView', 'UMLDataStoreNodeView',
    'UMLActivityParameterNodeView', 'UMLInputPinView', 'UMLOutputPinView',
    'UMLAcceptTimeEventView', 'UMLInterruptibleActivityRegionView',
    'UMLSendSignalView', 'UMLAcceptSignalView', 'UMLSwimlaneView',
    'UMLSeqLifelineView', 'UMLCommLifelineView',
    'UMLTimingLifelineView', 'UMLTimingStateView', 'UMLTimeSegmentView',
    'UMLTimeTickView', 'UMLTimeConstraintView', 'UMLDurationConstraintView',
    'UMLInteractionUseView', 'UMLInteractionInlineView',
    'UMLCombinedFragmentView', 'UMLNoteView', 'UMLTextView',
    'UMLTextBoxView', 'UMLStructuredActivityNodeView',
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
}

EDGE_VIEW_TYPES = {
    'UMLAssociationView', 'UMLDependencyView', 'UMLGeneralizationView',
    'UMLInterfaceRealizationView', 'UMLComponentRealizationView',
    'UMLIncludeView', 'UMLExtendView', 'UMLExtensionView',
    'UMLTransitionView', 'UMLControlFlowView', 'UMLObjectFlowView',
    'UMLConnectorView', 'UMLCommunicationPathView', 'UMLDeploymentView',
    'UMLInformationFlowView', 'UMLNoteLinkView', 'UMLContainmentView',
    'UMLLinkView', 'UMLSeqMessageView', 'UMLTimingMessageView',
    'UMLCommMessageView',
    'ERDRelationshipView', 'FCFlowView', 'MMEdgeView', 'DFDDataFlowView',
    'BPMNSequenceFlowView', 'BPMNConversationLinkView', 'BPMNMessageFlowView',
    'BPMNMessageLinkView', 'BPMNDataAssociationView', 'BPMNAssociationView',
    'AWSArrowView', 'AzureArrowView', 'GCPArrowView', 'GCPPathView',
}

VIEW_ONLY_NODES = {'UMLTextView', 'UMLTextBoxView', 'UMLTimeTickView', 'UMLSwimlaneView',
    'MMNodeView', 'WFPanelView', 'WFButtonView', 'WFRadioView', 'WFInputView', 'WFImageView', 'WFCheckboxView'}

MESSAGE_SORT = {
    'synchCall': 'UMLMessage+sync',
    'asynchCall': 'UMLMessage+async',
    'asynchSignal': 'UMLMessage+async',
    'reply': 'UMLMessage+reply',
    'createMessage': 'UMLMessage+create',
    'deleteMessage': 'UMLMessage+delete',
}


def ref(obj):
    if isinstance(obj, dict):
        return obj.get('$ref')
    return None


def num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def clean_text(value):
    return (value or '').strip() if isinstance(value, str) else ''


class Converter:
    def __init__(self, mdj):
        self.mdj = mdj
        self.by_id = {}
        self._index(mdj)
        self.model_map = {}
        self.view_map = {}
        self.diagram_map = {}
        self.skipped = Counter()
        self.notes = []
        self.counter = 0
        self.root_model = None
        self.part_models = set()
        self.port_models = set()
        self.endpoint_views = set()
        self._collect_special_views()

    def nid(self, prefix):
        self.counter += 1
        return f'{prefix}-{self.counter}'

    def _index(self, obj):
        if isinstance(obj, dict):
            if '_id' in obj:
                self.by_id[obj['_id']] = obj
            for value in obj.values():
                self._index(value)
        elif isinstance(obj, list):
            for value in obj:
                self._index(value)

    def _collect_special_views(self):
        for obj in self.by_id.values():
            if not isinstance(obj, dict):
                continue
            t = obj.get('_type')
            model_id = ref(obj.get('model'))
            if t == 'UMLPartView' and model_id:
                self.part_models.add(model_id)
            elif t == 'UMLPortView' and model_id:
                self.port_models.add(model_id)
            elif t in ('UMLGateView', 'UMLEndpointView'):
                self.endpoint_views.add(obj.get('_id'))

    # ---------------- name / type helpers ----------------
    def resolve_name(self, value):
        if isinstance(value, dict):
            if '$ref' in value:
                target = self.by_id.get(value['$ref'])
                return clean_text(target.get('name')) if target else ''
            return clean_text(value.get('name'))
        return clean_text(value)

    def label_texts(self, view):
        out = []
        if not isinstance(view, dict):
            return out
        for sub in view.get('subViews') or []:
            if isinstance(sub, dict):
                text = clean_text(sub.get('text'))
                if text and sub.get('visible') is not False:
                    out.append(text)
                out.extend(self.label_texts(sub))
        return out

    def first_label(self, view):
        labels = self.label_texts(view)
        return labels[0] if labels else ''

    def find_owner(self, sm):
        cur = self.by_id.get(ref(sm.get('_parent')))
        while cur:
            mapped = self.model_map.get(cur.get('_id'))
            if mapped and mapped['type'] in ('UMLModel', 'UMLPackage', 'UMLSubsystem'):
                return mapped
            cur = self.by_id.get(ref(cur.get('_parent')))
        return self.root_model

    def attach(self, owner, model):
        if owner is None:
            owner = self.root_model
        if owner is not None:
            owner.setdefault('ownedElements', []).append(model)

    # ---------------- models ----------------
    def model_type_for(self, sm, view_type=None):
        t = sm.get('_type')
        if view_type == 'UMLPartView':
            return 'UMLPart'
        if view_type == 'UMLPortView':
            return 'UMLPort'
        if view_type == 'UMLCommLifelineView':
            return 'UMLObject'
        if view_type == 'UMLSeqLifelineView':
            return 'UMLLifeLine'
        if view_type == 'UMLTimingLifelineView':
            return 'UMLTimingLifeline'
        if view_type == 'UMLTimingStateView':
            return 'UMLTimingState'
        if view_type == 'UMLTimeSegmentView':
            return 'UMLTimeSegment'
        if view_type == 'UMLCombinedFragmentView':
            return 'UMLCombinedFragment'
        if view_type in ('UMLPackageView', 'UMLModelView', 'UMLSubsystemView'):
            if t == 'UMLProfile':
                return 'UMLPackage'
            return CONTAINER_MAP.get(t) or 'UMLPackage'
        if view_type == 'UMLTimeConstraintView':
            return 'UMLTimeConstraint'
        if view_type == 'UMLDurationConstraintView':
            return 'UMLDurationConstraint'
        if view_type == 'UMLSwimlaneView':
            return None
        if view_type in ('UMLTextView', 'UMLTextBoxView', 'UMLTimeTickView'):
            return None
        if view_type == 'UMLPseudostateView':
            kind = sm.get('kind')
            return {
                'initial': 'UMLInitialState',
                'choice': 'UMLChoice',
                'junction': 'UMLJunction',
                'shallowHistory': 'UMLShallowHistory',
                'deepHistory': 'UMLDeepHistory',
                'terminate': 'UMLFinalState',
            }.get(kind)
        if view_type == 'UMLControlNodeView':
            return SIMPLE_MODEL_MAP.get(t, t)
        if view_type == 'UMLCentralBufferNodeView':
            return 'UMLCentralBufferNode'
        if view_type == 'UMLDataStoreNodeView':
            return 'UMLDataStoreNode'
        if view_type == 'UMLActivityParameterNodeView':
            return 'UMLActivityParameterNode'
        if view_type == 'UMLInputPinView':
            return 'UMLInputPin'
        if view_type == 'UMLOutputPinView':
            return 'UMLOutputPin'
        if view_type == 'UMLStructuredActivityNodeView':
            return 'UMLStructuredActivityNode'
        if view_type == 'UMLInterruptibleActivityRegionView':
            return 'UMLInterruptibleRegion'
        if view_type == 'UMLAcceptTimeEventView':
            return 'UMLAcceptTimeEvent'
        if view_type in ('UMLCompositeState',):
            return 'UMLCompositeState'
        if view_type in ('UMLOrthogonalStateView', 'UMLOrthogonalState'):
            return 'UMLOrthogonalState'
        if view_type in ('UMLSubmachineStateView', 'UMLSubmachineState'):
            return 'UMLSubmachineState'
        if view_type == 'UMLRegionView':
            return 'UMLRegion'
        if view_type == 'UMLEntryPointView':
            return 'UMLEntryPoint'
        if view_type == 'UMLExitPointView':
            return 'UMLExitPoint'
        if view_type == 'UMLTerminateView':
            return 'UMLTerminate'
        if view_type == 'UMLConnectionPointReferenceView':
            return 'UMLConnectionPointReference'
        if view_type == 'UMLInteractionUseView':
            return 'UMLInteractionUse'
        if view_type == 'UMLInteractionInlineView':
            return 'UMLInteractionInOverview'
        if view_type in ('UMLSeqMessageView', 'UMLTimingMessageView', 'UMLCommMessageView'):
            return 'UMLMessage'
        if view_type == 'UMLNoteView':
            return 'UMLNote'
        if view_type in ('MMNodeView', 'WFPanelView', 'WFButtonView', 'WFRadioView',
                         'WFInputView', 'WFImageView', 'WFCheckboxView'):
            return None
        if t in ('MMNode', 'WFText', 'WFButton', 'WFRadio', 'WFInput', 'WFImage', 'WFCheckbox', 'WFPanel'):
            return None
        if t == 'UMLStateInvariant':
            return 'UMLTimeSegment'
        if t == 'UMLConstraint':
            return 'UMLTimingState'
        if t == 'UMLActivityPartition':
            return None
        return SIMPLE_MODEL_MAP.get(t) or RELATIONSHIP_MAP.get(t)

    def convert_attribute(self, a):
        agg = a.get('aggregation')
        model = {
            '_id': self.nid('a'),
            '$type': 'UMLAttribute',
            'name': clean_text(a.get('name')) or 'attribute',
            'type': self.resolve_name(a.get('type')),
            'multiplicity': clean_text(a.get('multiplicity')),
            'visibility': a.get('visibility') or 'public',
            'defaultValue': clean_text(a.get('defaultValue')),
            'isStatic': bool(a.get('isStatic')),
        }
        if agg == 'composite':
            model['aggregation'] = 'composite'
        elif agg == 'shared':
            model['aggregation'] = 'shared'
        return model

    def convert_operation(self, op):
        params = []
        for p in op.get('parameters') or []:
            if isinstance(p, dict) and '$ref' in p:
                p = self.by_id.get(p['$ref'], {})
            if not isinstance(p, dict):
                continue
            params.append({'name': clean_text(p.get('name')) or 'param', 'type': self.resolve_name(p.get('type'))})
        return {
            '_id': self.nid('o'),
            '$type': 'UMLOperation',
            'name': clean_text(op.get('name')) or 'operation',
            'parameters': params,
            'returnType': self.resolve_name(op.get('type')),
            'visibility': op.get('visibility') or 'public',
            'isStatic': bool(op.get('isStatic')),
        }

    def ensure_model(self, sm, owner=None, view_type=None):
        if not isinstance(sm, dict):
            return None
        sm_id = sm.get('_id')
        if sm_id in self.model_map:
            return self.model_map[sm_id]
        our_type = self.model_type_for(sm, view_type)
        if not our_type:
            return None
        model = {
            '_id': self.nid('m'),
            'type': our_type,
            'name': clean_text(sm.get('name')),
            'stereotype': clean_text(sm.get('stereotype')),
            'documentation': clean_text(sm.get('documentation')),
            'tags': [],
            'ownedElements': [],
        }
        # cache before resolving references that may point back to this model
        self.model_map[sm_id] = model
        if sm.get('_type') == 'ERDEntity':
            cols = []
            for c in sm.get('columns') or []:
                if not isinstance(c, dict):
                    continue
                ctype = c.get('type') if isinstance(c.get('type'), str) else self.resolve_name(c.get('type'))
                try:
                    length = float(c.get('length') or 0)
                except (TypeError, ValueError):
                    length = 0
                if length > 0 and ctype and '(' not in ctype:
                    ctype = f"{ctype}({int(length)})"
                cols.append({
                    '_id': self.nid('col'),
                    'name': clean_text(c.get('name')) or 'column',
                    'type': ctype or '',
                    'primaryKey': bool(c.get('primaryKey')),
                    'foreignKey': bool(c.get('foreignKey')),
                    'notNull': bool(c.get('notNull')) or bool(c.get('primaryKey')),
                    'unique': bool(c.get('unique')),
                    'comment': clean_text(c.get('comment')),
                })
            model['columns'] = cols
            model['indexes'] = []
        if our_type in ('UMLClass', 'UMLInterface', 'UMLDataType', 'UMLPrimitiveType',
                        'UMLInformationItem', 'UMLCollaboration', 'UMLStereotype'):
            model['attributes'] = [
                self.convert_attribute(a) for a in sm.get('attributes') or []
                if isinstance(a, dict) and a.get('_id') not in self.part_models
                and a.get('_id') not in self.port_models
            ]
            model['operations'] = [self.convert_operation(o) for o in sm.get('operations') or [] if isinstance(o, dict)]
            tps = []
            for tp in sm.get('templateParameters') or []:
                if not isinstance(tp, dict):
                    continue
                tps.append({'name': clean_text(tp.get('name')) or 'T', 'type': self.resolve_name(tp.get('type'))})
            model['templateParameters'] = tps
        if our_type == 'UMLEnumeration':
            model['literals'] = [
                {'_id': self.nid('l'), '$type': 'UMLEnumerationLiteral',
                 'name': clean_text(lit.get('name')) or 'literal', 'visibility': 'public'}
                for lit in sm.get('literals') or [] if isinstance(lit, dict)
            ]
        if our_type in ('UMLObject', 'UMLArtifactInstance', 'UMLComponentInstance', 'UMLNodeInstance'):
            model['classifier'] = self.resolve_name(sm.get('classifier'))
            slots = []
            for slot in sm.get('slots') or []:
                if not isinstance(slot, dict):
                    continue
                value = clean_text(slot.get('value'))
                if len(value) >= 2 and value[0] == value[-1] == '"':
                    value = value[1:-1]
                slots.append({
                    '_id': self.nid('s'), '$type': 'UMLSlot',
                    'name': clean_text(slot.get('name')), 'value': value,
                })
            model['slots'] = slots
        if our_type == 'UMLPart':
            model['typeName'] = self.resolve_name(sm.get('type'))
            model['multiplicity'] = clean_text(sm.get('multiplicity'))
            model['aggregation'] = 'composite' if sm.get('aggregation') == 'composite' else 'shared'
        if our_type == 'UMLPort':
            model['typeName'] = self.resolve_name(sm.get('type'))
            model['multiplicity'] = clean_text(sm.get('multiplicity'))
            model['isStatic'] = bool(sm.get('isStatic'))
            model['isConjugated'] = bool(sm.get('isConjugated'))
        if our_type == 'UMLCollaborationUse':
            model['typeName'] = self.resolve_name(sm.get('type'))
        if our_type == 'UMLAssociation':
            for key, dest in (('end1', 'end1ReferenceId'), ('end2', 'end2ReferenceId')):
                end = sm.get(key) or {}
                target = self.by_id.get(ref(end.get('reference')))
                converted = self.model_map.get(target.get('_id')) if target else None
                if converted:
                    model[dest] = converted['_id']
        model_ref = sm.get('refersTo')
        if our_type == 'UMLInteractionUse' and isinstance(model_ref, dict):
            target = self.by_id.get(model_ref.get('$ref'))
            if target:
                model['name'] = clean_text(target.get('name')) or model['name']
        if our_type in ('UMLTimeConstraint', 'UMLDurationConstraint'):
            lo, hi = sm.get('min'), sm.get('max')
            if lo or hi:
                model['name'] = f"{{{lo or '0'}..{hi or '∞'}}}"
        if our_type == 'UMLInformationFlow':
            conveyed = []
            for item in sm.get('conveyed') or []:
                name = self.resolve_name(item)
                if name:
                    conveyed.append({'_id': self.nid('c'), '$type': 'UMLClassifier', 'name': name})
            model['conveyed'] = conveyed
            for field, src in (('realizingConnectors', 'realizingConnectors'),
                               ('realizingActivityEdges', 'realizingActivityEdges'),
                               ('realizingMessages', 'realizingMessages')):
                refs = []
                for item in sm.get(src) or []:
                    rid = ref(item)
                    mapped = self.model_map.get(rid)
                    if mapped:
                        refs.append(mapped['_id'])
                if refs:
                    model[field] = refs
        if our_type == 'UMLConnector':
            model['connectorKind'] = clean_text(sm.get('kind')) or 'assembly'
        if our_type == 'UMLExtension':
            model['multiplicity'] = clean_text(sm.get('multiplicity'))
        if our_type == 'UMLSubmachineState':
            target = self.by_id.get(ref(sm.get('submachine')))
            model['submachine'] = clean_text(target.get('name')) if target else ''
        if our_type == 'UMLNote':
            model['documentation'] = clean_text(sm.get('documentation'))
        if our_type == 'UMLMessage':
            model['name'] = clean_text(sm.get('name'))
        if our_type == 'UMLCombinedFragment':
            model['operator'] = clean_text(sm.get('interactionOperator')) or 'alt'
            guards = []
            for operand in sm.get('operands') or []:
                if isinstance(operand, dict) and '$ref' in operand:
                    operand = self.by_id.get(operand['$ref'], {})
                if isinstance(operand, dict):
                    guards.append({'guard': clean_text(operand.get('guard') or operand.get('name'))})
            if not guards:
                guards = [{'guard': ''}, {'guard': ''}]
            model['operands'] = guards
            model['operandBoundaries'] = [(i + 1) / len(guards) for i in range(len(guards) - 1)]
        self.attach(owner if owner is not None else self.find_owner(sm), model)
        return model

    def convert_children_into(self, owner_model, sm):
        for child in sm.get('ownedElements') or []:
            if not isinstance(child, dict):
                continue
            t = child.get('_type')
            if t in DIAGRAM_TYPES or t in DIAGRAM_TYPE_MAP:
                self.convert_diagram(child, owner_model)
            elif t == 'UMLProfile' or t in CONTAINER_MAP:
                self.convert_container(child, owner_model)
            elif t in WRAPPER_TYPES:
                self.convert_children_into(owner_model, child)
            elif t in SIMPLE_MODEL_MAP or t in RELATIONSHIP_MAP:
                self.ensure_model(child, owner_model)
                if t in ('UMLCollaboration',):
                    self.convert_children_into(self.model_map.get(child.get('_id'), owner_model), child)
            elif child.get('ownedElements'):
                self.convert_children_into(owner_model, child)

    def convert_container(self, sm, owner):
        t = sm.get('_type')
        our_type = 'UMLPackage' if t == 'UMLProfile' else CONTAINER_MAP.get(t)
        if not our_type:
            return None
        model = {
            '_id': self.nid('m'),
            'type': our_type,
            'name': clean_text(sm.get('name')) or 'Model',
            'stereotype': 'profile' if t == 'UMLProfile' else clean_text(sm.get('stereotype')),
            'documentation': clean_text(sm.get('documentation')),
            'tags': [],
            'ownedElements': [],
        }
        self.model_map[sm.get('_id')] = model
        if owner is not None:
            owner.setdefault('ownedElements', []).append(model)
        self.convert_children_into(model, sm)
        return model

    # ---------------- diagrams ----------------
    def convert_diagram(self, sm, owner):
        dtype = DIAGRAM_TYPE_MAP.get(sm.get('_type')) or sm.get('_type')
        if dtype not in DIAGRAM_TYPES:
            self.skipped[f'diagram:{sm.get("_type")}'] += 1
            return None
        d = {
            '_id': self.nid('d'),
            'type': dtype,
            'name': clean_text(sm.get('name')) or 'Diagram',
            'ownedElements': [],
            'elements': [],
            'defaultDiagram': False,
        }
        owner.setdefault('ownedElements', []).append(d)
        self.diagram_map[sm.get('_id')] = d
        self._connector_views = {}

        all_views = []
        seen = set()

        def collect(view):
            if not isinstance(view, dict) or view.get('_id') in seen:
                return
            seen.add(view.get('_id'))
            all_views.append(view)
            for sub in view.get('subViews') or []:
                collect(sub)

        for view in sm.get('ownedViews') or []:
            collect(view)

        depth = {}
        for view in all_views:
            cur, n = view, 0
            while cur and n < 20:
                n += 1
                cur = self.by_id.get(ref(cur.get('_parent')))
                if cur and cur.get('_type','').endswith('Diagram'):
                    break
            depth[view.get('_id')] = n
        all_views.sort(key=lambda v: depth.get(v.get('_id'), 0))

        for view in all_views:
            t = view.get('_type')
            if t not in NODE_VIEW_TYPES:
                continue
            self.convert_node_view(view, d)

        self.infer_containers(d)

        for view in all_views:
            t = view.get('_type')
            if t in EDGE_VIEW_TYPES:
                self.convert_edge_view(view, d)

        self.aggregate_communication(sm)
        return d

    def view_type_for(self, view):
        t = view.get('_type')
        model = self.by_id.get(ref(view.get('model'))) or {}
        mt = model.get('_type')
        if t == 'UMLClassView':
            return 'UMLClass'
        if t == 'UMLInterfaceView':
            return 'UMLInterface'
        if t == 'UMLEnumerationView':
            return 'UMLEnumeration'
        if t == 'UMLDataTypeView':
            return 'UMLDataType'
        if t == 'UMLSignalView':
            return 'UMLClass'
        if t in ('UMLPackageView', 'UMLModelView', 'UMLSubsystemView'):
            if mt in ('UMLModel', 'UMLSubsystem'):
                return mt
            return 'UMLPackage'
        if t == 'UMLUseCaseView':
            return 'UMLUseCase'
        if t == 'UMLActorView':
            return 'UMLActor'
        if t == 'UMLUseCaseSubjectView':
            return 'Subject'
        if t == 'UMLComponentView':
            return 'UMLComponent'
        if t == 'UMLArtifactView':
            return 'UMLArtifact'
        if t == 'UMLNodeView':
            return 'UMLNode'
        if t == 'UMLObjectView':
            return 'UMLObject'
        if t == 'UMLCollaborationView':
            return 'UMLCollaboration'
        if t == 'UMLCollaborationUseView':
            return 'UMLCollaborationUse'
        if t == 'UMLPartView':
            return 'UMLPart'
        if t == 'UMLPortView':
            return 'UMLPort'
        if t == 'UMLInformationItemView':
            return 'UMLInformationItem'
        if t == 'UMLMetaClassView':
            return 'UMLMetaClass'
        if t == 'UMLStereotypeView':
            return 'UMLStereotype'
        if t == 'UMLStateView':
            if model.get('submachine'):
                return 'UMLSubmachineState'
            regions = [sub for sub in view.get('subViews') or [] if sub.get('_type') == 'UMLRegionView']
            if len(regions) >= 2:
                return 'UMLOrthogonalState'
            if regions:
                return 'UMLCompositeState'
            return 'UMLState'
        if t == 'UMLPseudostateView':
            kind = model.get('kind')
            return {
                'initial': 'UMLInitialState',
                'choice': 'UMLChoice',
                'junction': 'UMLJunction',
                'shallowHistory': 'UMLShallowHistory',
                'deepHistory': 'UMLDeepHistory',
                'terminate': 'UMLFinalState',
            }.get(kind)
        if t == 'UMLFinalStateView':
            return 'UMLFinalState'
        if t == 'UMLActionView':
            return 'UMLAction'
        if t == 'UMLControlNodeView':
            return SIMPLE_MODEL_MAP.get(mt)
        if t == 'UMLObjectNodeView':
            return 'UMLObjectNode'
        if t == 'UMLCentralBufferNodeView':
            return 'UMLCentralBufferNode'
        if t == 'UMLDataStoreNodeView':
            return 'UMLDataStoreNode'
        if t == 'UMLActivityParameterNodeView':
            return 'UMLActivityParameterNode'
        if t == 'UMLInputPinView':
            return 'UMLInputPin'
        if t == 'UMLOutputPinView':
            return 'UMLOutputPin'
        if t == 'UMLInterruptibleActivityRegionView':
            return 'UMLInterruptibleRegion'
        if t == 'UMLAcceptTimeEventView':
            return 'UMLAcceptTimeEvent'
        if t == 'UMLOrthogonalStateView':
            return 'UMLOrthogonalState'
        if t == 'UMLRegionView':
            return 'UMLRegion'
        if t == 'UMLSubmachineStateView':
            return 'UMLSubmachineState'
        if t == 'UMLEntryPointView':
            return 'UMLEntryPoint'
        if t == 'UMLExitPointView':
            return 'UMLExitPoint'
        if t == 'UMLTerminateView':
            return 'UMLTerminate'
        if t == 'UMLConnectionPointReferenceView':
            return 'UMLConnectionPointReference'
        if t == 'UMLSendSignalView':
            return 'UMLSendSignal'
        if t == 'UMLAcceptSignalView':
            return 'UMLAcceptSignal'
        if t == 'UMLSwimlaneView':
            w, h = num(view.get('width')), num(view.get('height'))
            return 'UMLSwimlaneVert' if h >= w else 'UMLSwimlaneHorz'
        if t == 'UMLSeqLifelineView':
            return 'UMLLifeLine'
        if t == 'UMLCommLifelineView':
            return 'UMLObject'
        if t == 'UMLTimingLifelineView':
            return 'UMLTimingLifeline'
        if t == 'UMLTimingStateView':
            return 'UMLTimingState'
        if t == 'UMLTimeSegmentView':
            return 'UMLTimeSegment'
        if t == 'UMLTimeTickView':
            return 'UMLTimeTick'
        if t == 'UMLTimeConstraintView':
            return 'UMLTimeConstraint'
        if t == 'UMLDurationConstraintView':
            return 'UMLDurationConstraint'
        if t == 'UMLInteractionUseView':
            diagram = self.by_id.get(ref(view.get('_parent')))
            return 'UMLInteractionUseInOverview' if diagram and diagram.get('_type') == 'UMLInteractionOverviewDiagram' else 'UMLInteractionUse'
        if t == 'UMLInteractionInlineView':
            return 'UMLInteractionInOverview'
        if t == 'UMLCombinedFragmentView':
            return 'UMLCombinedFragment'
        if t == 'UMLNoteView':
            return 'UMLNote'
        if t in ('UMLTextView', 'UMLTextBoxView'):
            return 'UMLTextView'
        if t == 'UMLStructuredActivityNodeView':
            return 'UMLStructuredActivityNode'
        ext_nodes = {
            'ERDEntityView': 'ERDEntity',
            'FCProcessView': 'UMLAction', 'FCTerminatorView': 'UMLState', 'FCDecisionView': 'UMLDecisionNode',
            'FCPredefinedProcessView': 'UMLStructuredActivityNode', 'FCDataView': 'UMLObjectNode',
            'FCDocumentView': 'UMLNote', 'FCDatabaseView': 'UMLDataStoreNode',
            'MMNodeView': 'UMLTextView',
            'DFDProcessView': 'UMLAction', 'DFDExternalEntityView': 'UMLClass', 'DFDDataStoreView': 'UMLDataStoreNode',
            'WFPanelView': 'UMLRectView', 'WFButtonView': 'UMLTextView', 'WFTextView': 'UMLTextView',
            'WFRadioView': 'UMLTextView', 'WFInputView': 'UMLTextView', 'WFCheckboxView': 'UMLTextView',
            'WFImageView': 'UMLTextView',
            'BPMNTaskView': 'UMLAction', 'BPMNSubProcessView': 'UMLStructuredActivityNode',
            'BPMNGatewayView': 'UMLDecisionNode',
            'BPMNPoolView': 'UMLPackage', 'BPMNLaneView': 'UMLPackage',
            'BPMNConversationView': 'UMLPackage', 'BPMNMessageView': 'UMLClass',
            'BPMNChoreographyTaskView': 'UMLAction', 'BPMNTextAnnotationView': 'UMLNote',
            'AWSResourceView': 'UMLComponent', 'AWSGeneralResourceView': 'UMLComponent',
            'AWSGroupView': 'UMLPackage', 'AWSCalloutView': 'UMLNote',
            'AzureResourceView': 'UMLComponent', 'AzureGeneralResourceView': 'UMLComponent',
            'AzureGroupView': 'UMLPackage', 'AzureCalloutView': 'UMLNote',
            'GCPResourceView': 'UMLComponent', 'GCPGeneralResourceView': 'UMLComponent',
            'GCPGroupView': 'UMLPackage', 'GCPCalloutView': 'UMLNote',
            'GCPProductView': 'UMLComponent', 'GCPServiceView': 'UMLComponent',
            'GCPZoneView': 'UMLPackage', 'GCPUserView': 'UMLActor',
        }
        if t == 'BPMNEventView':
            if mt == 'BPMNStartEvent':
                return 'UMLInitialNode'
            if mt == 'BPMNEndEvent':
                return 'UMLActivityFinalNode'
            return 'UMLAcceptSignal'
        return ext_nodes.get(t)

    def convert_node_view(self, view, diagram):
        our_type = self.view_type_for(view)
        if not our_type:
            self.skipped[f'view:{view.get("_type")}'] += 1
            return
        model = self.by_id.get(ref(view.get('model')))
        view_model = None
        if view.get('_type') == 'UMLNoteView' and model is None:
            view_model = {
                '_id': self.nid('m'), 'type': 'UMLNote', 'name': 'Note',
                'stereotype': '', 'documentation': '\n'.join(self.label_texts(view)),
                'tags': [], 'ownedElements': [],
            }
            self.attach(self.find_owner(view), view_model)
        elif view.get('_type') not in VIEW_ONLY_NODES:
            view_model = self.ensure_model(model, view_type=view.get('_type'))
            if view_model is None and view.get('_type') not in ('UMLTextView', 'UMLTextBoxView', 'UMLTimeTickView'):
                self.skipped[f'no-model:{view.get("_type")}'] += 1
                return
        x, y = num(view.get('left')), num(view.get('top'))
        w, h = num(view.get('width')), num(view.get('height'))
        v = {
            '_id': self.nid('v'),
            '$type': our_type,
            'modelRef': view_model['_id'] if view_model else '',
            'x': round(x, 2), 'y': round(y, 2),
            'width': round(w, 2) or 80, 'height': round(h, 2) or 40,
            'fillColor': '', 'lineColor': '', 'fontColor': '', 'fontSize': 12,
        }
        t = view.get('_type')
        label = self.first_label(view)
        if t == 'UMLSeqLifelineView':
            head_h = num((self.by_id.get(ref(view.get('nameCompartment'))) or {}).get('height'), 40)
            line_part = self.by_id.get(ref(view.get('linePart')))
            life_h = num(line_part.get('height')) if line_part else max(0, h - head_h)
            v['height'] = round(head_h or 40, 2)
            v['lifeHeight'] = round(life_h or 300, 2)
            if view_model:
                view_model['name'] = label or view_model.get('name') or 'Lifeline'
        elif t == 'UMLCommLifelineView':
            if view_model:
                view_model['name'] = label or view_model.get('name') or 'Object'
        elif t == 'UMLTimingLifelineView':
            if view_model:
                view_model['name'] = label or view_model.get('name') or 'Lifeline'
            v['width'] = round(w or 520, 2)
            v['height'] = round(h or 64, 2)
        elif t == 'UMLTimingStateView':
            if view_model:
                view_model['name'] = label or view_model.get('name') or 'State'
        elif t == 'UMLTimeSegmentView':
            v['height'] = round(h or 12, 2)
            if view_model:
                view_model['name'] = ''
        elif t == 'UMLTimeTickView':
            v['text'] = label or ''
        elif t == 'UMLSwimlaneView':
            v['laneName'] = label or 'Partition'
        elif t in ('UMLTextView', 'UMLTextBoxView'):
            raw_name = clean_text((self.by_id.get(ref(view.get('model'))) or {}).get('name'))
            v['text'] = label or clean_text(view.get('text')) or raw_name or ''
            v['width'] = round(max(w, 60), 2)
            v['height'] = round(max(h, 24), 2)
        elif t == 'UMLNoteView':
            if view_model and not view_model.get('documentation'):
                view_model['documentation'] = '\n'.join(self.label_texts(view))
        elif t == 'UMLPartView':
            if view_model:
                m = re.match(r'^(.*?)\s*\[([^\]]+)\]\s*$', label)
                if m:
                    view_model['name'] = m.group(1).strip() or view_model.get('name')
                    view_model['multiplicity'] = m.group(2).strip()
                elif label:
                    view_model['name'] = label
        elif t == 'UMLPortView':
            if view_model:
                view_model['name'] = label or view_model.get('name') or 'port'
        elif t == 'UMLPseudostateView':
            if view_model:
                view_model['name'] = ''
        elif t in ('UMLStateView', 'UMLActionView', 'UMLNodeView', 'UMLComponentView',
                   'UMLArtifactView', 'UMLInformationItemView', 'UMLStereotypeView',
                   'UMLMetaClassView', 'UMLUseCaseView', 'UMLActorView',
                   'UMLClassView', 'UMLInterfaceView', 'UMLEnumerationView',
                   'UMLCentralBufferNodeView', 'UMLDataStoreNodeView',
                   'UMLActivityParameterNodeView', 'UMLStructuredActivityNodeView',
                   'UMLInterruptibleActivityRegionView', 'UMLAcceptTimeEventView',
                   'UMLOrthogonalStateView', 'UMLRegionView', 'UMLSubmachineStateView'):
            if view_model and not view_model.get('name') and label:
                view_model['name'] = label
        for flag in ('showVisibility', 'showType', 'showMultiplicity',
                     'showOperationSignature', 'showProperty', 'suppressAttributes',
                     'suppressOperations', 'suppressLiterals', 'showNamespace',
                     'shadow', 'autoResize'):
            if flag in view:
                v[flag] = bool(view[flag])
        for key in ('fillColor', 'lineColor', 'fontColor'):
            val = clean_text(view.get(key))
            if val.startswith('#'):
                v[key] = val
        if view.get('wordWrap') or view.get('autoWrap'):
            v['autoWrap'] = True
        if 'stereotypeDisplay' in view:
            v['stereotypeDisplay'] = 'none' if view.get('stereotypeDisplay') == 'none' else 'label'
        diagram['elements'].append(v)
        self.view_map[view.get('_id')] = v
        # explicit StarUML containment
        container_sm = self.by_id.get(ref(view.get('containerView')))
        if container_sm:
            parent = self.view_map.get(container_sm.get('_id'))
            if parent:
                v['container'] = parent['_id']

    def infer_containers(self, diagram):
        nodes = [v for v in diagram['elements'] if not v.get('isEdge')]
        containers = {
            'UMLPart': {'UMLClass', 'UMLInterface', 'UMLComponent', 'UMLCollaboration'},
            'UMLPort': {'UMLClass', 'UMLInterface', 'UMLComponent', 'UMLCollaboration'},
            'UMLTimingState': {'UMLTimingLifeline'},
            'UMLTimeSegment': {'UMLTimingState'},
            'UMLTimeTick': {'UMLTimingLifeline'},
            'UMLInputPin': {'UMLAction', 'UMLStructuredActivityNode'},
            'UMLOutputPin': {'UMLAction', 'UMLStructuredActivityNode'},
            'UMLRegion': {'UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState'},
            'UMLEntryPoint': {'UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState'},
            'UMLExitPoint': {'UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState'},
            'UMLConnectionPointReference': {'UMLState', 'UMLCompositeState', 'UMLOrthogonalState', 'UMLSubmachineState'},
        }
        for v in nodes:
            if v.get('container'):
                continue
            allowed = containers.get(v.get('$type'))
            if not allowed:
                if v.get('$type') in ('UMLState', 'UMLCompositeState', 'UMLOrthogonalState',
                                      'UMLSubmachineState', 'UMLInitialState', 'UMLFinalState',
                                      'UMLChoice', 'UMLJunction', 'UMLShallowHistory', 'UMLDeepHistory'):
                    allowed = {'UMLCompositeState', 'UMLOrthogonalState', 'UMLRegion', 'UMLSubmachineState'}
                elif v.get('$type') not in ('UMLAction', 'UMLObjectNode', 'UMLSendSignal',
                                          'UMLAcceptSignal', 'UMLInitialNode',
                                          'UMLActivityFinalNode', 'UMLFlowFinalNode',
                                          'UMLDecisionNode', 'UMLMergeNode', 'UMLForkNode',
                                          'UMLJoinNode', 'UMLCentralBufferNode',
                                          'UMLDataStoreNode', 'UMLActivityParameterNode',
                                          'UMLAcceptTimeEvent', 'UMLStructuredActivityNode',
                                          'UMLInterruptibleRegion'):
                    continue
                else:
                    allowed = {'UMLSwimlaneVert', 'UMLSwimlaneHorz',
                               'UMLStructuredActivityNode', 'UMLInterruptibleRegion'}
            cx = v['x'] + v['width'] / 2
            cy = v['y'] + v['height'] / 2
            best = None
            for c in nodes:
                if c is v or c.get('$type') not in allowed:
                    continue
                if c['x'] <= cx <= c['x'] + c['width'] and c['y'] <= cy <= c['y'] + c['height']:
                    if best is None or c['width'] * c['height'] < best['width'] * best['height']:
                        best = c
            if best:
                v['container'] = best['_id']
        # Package/model/subsystem views are geometric containers; nest any
        # remaining view whose center lies inside the smallest package body.
        for v in nodes:
            if v.get('container') or v.get('$type') not in (
                'UMLPackage', 'UMLModel', 'UMLSubsystem',
                'UMLClass', 'UMLInterface', 'UMLEnumeration', 'UMLDataType',
                'UMLActor', 'UMLUseCase', 'UMLComponent', 'UMLArtifact',
                'UMLNode', 'UMLObject', 'UMLCollaboration', 'UMLInformationItem',
                'UMLStereotype', 'UMLMetaClass', 'UMLSubmachineState', 'UMLState',
            ):
                continue
            cx = v['x'] + v['width'] / 2
            cy = v['y'] + v['height'] / 2
            best = None
            for c in nodes:
                if c is v or c.get('$type') not in ('UMLPackage', 'UMLModel', 'UMLSubsystem'):
                    continue
                if c['x'] <= cx <= c['x'] + c['width'] and c['y'] <= cy <= c['y'] + c['height']:
                    if best is None or c['width'] * c['height'] < best['width'] * best['height']:
                        best = c
            if best:
                v['container'] = best['_id']

    def resolve_endpoint(self, endpoint_ref):
        rid = ref(endpoint_ref)
        if not rid:
            return None
        if rid in self.view_map:
            return ('view', self.view_map[rid])
        # line parts / activations / segments: climb the parent/container chain
        cur = self.by_id.get(rid)
        hops = 0
        while cur and hops < 20:
            hops += 1
            cid = ref(cur.get('_id') and {'$ref': cur.get('_id')})
            if cid and cid in self.view_map:
                return ('view', self.view_map[cid])
            parent_id = ref(cur.get('containerView')) or ref(cur.get('_parent'))
            if not parent_id:
                break
            if parent_id in self.view_map:
                return ('view', self.view_map[parent_id])
            cur = self.by_id.get(parent_id)
        if rid in self.endpoint_views:
            return ('endpoint', rid)
        return None

    def edge_type_for(self, view, model):
        t = view.get('_type')
        mt = model.get('_type') if model else None
        if t == 'UMLSeqMessageView':
            sort = (model or {}).get('messageSort')
            return MESSAGE_SORT.get(sort, 'UMLMessage+sync')
        if t == 'UMLTimingMessageView':
            return 'UMLTimeMessage'
        if t == 'UMLCommMessageView':
            return None
        if t == 'UMLAssociationView':
            return 'UMLAssociation'
        if t == 'UMLDependencyView':
            return 'UMLDeployment' if (model or {}).get('stereotype') == 'deploy' else 'UMLDependency'
        if t == 'UMLGeneralizationView':
            return 'UMLGeneralization'
        if t == 'UMLInterfaceRealizationView':
            return 'UMLInterfaceRealization'
        if t == 'UMLComponentRealizationView':
            return 'UMLComponentRealization'
        if t == 'UMLIncludeView':
            return 'UMLInclude'
        if t == 'UMLExtendView':
            return 'UMLExtend'
        if t == 'UMLExtensionView':
            return 'UMLExtension'
        if t == 'UMLTransitionView':
            return 'UMLTransition'
        if t == 'UMLControlFlowView':
            return 'UMLControlFlow'
        if t == 'UMLObjectFlowView':
            return 'UMLObjectFlow'
        if t == 'UMLConnectorView':
            diagram = self.by_id.get(ref(view.get('_parent')))
            if diagram and diagram.get('_type') == 'UMLCommunicationDiagram':
                return 'UMLConnector'
            return 'UMLCompositeConnector'
        if t == 'UMLCommunicationPathView':
            return 'UMLCommunicationPath'
        if t == 'UMLDeploymentView':
            return 'UMLDeployment'
        if t == 'UMLInformationFlowView':
            return 'UMLInformationFlow'
        if t == 'UMLNoteLinkView':
            return 'UMLNoteLink'
        if t == 'UMLContainmentView':
            return 'UMLContainment'
        if t == 'UMLLinkView':
            return 'UMLLink'
        ext_edges = {
            'ERDRelationshipView': 'ERDReference',
            'FCFlowView': 'UMLControlFlow',
            'MMEdgeView': 'UMLLink',
            'DFDDataFlowView': 'UMLObjectFlow',
            'BPMNSequenceFlowView': 'UMLControlFlow',
            'BPMNConversationLinkView': 'UMLDependency',
            'BPMNMessageFlowView': 'UMLDependency',
            'BPMNMessageLinkView': 'UMLDependency',
            'BPMNDataAssociationView': 'UMLObjectFlow',
            'BPMNAssociationView': 'UMLDependency',
            'AWSArrowView': 'UMLDependency',
            'AzureArrowView': 'UMLDependency',
            'GCPArrowView': 'UMLDependency',
            'GCPPathView': 'UMLDependency',
        }
        return ext_edges.get(t)

    def parse_points(self, view):
        raw = view.get('points')
        if not isinstance(raw, str):
            return []
        out = []
        for part in raw.split(';'):
            if ':' not in part:
                continue
            x, y = part.split(':', 1)
            out.append({'x': round(num(x), 2), 'y': round(num(y), 2)})
        return out

    def convert_edge_view(self, view, diagram):
        t = view.get('_type')
        if t == 'UMLCommMessageView':
            return  # aggregated onto its connector below
        model = self.by_id.get(ref(view.get('model')))
        our_type = self.edge_type_for(view, model)
        if not our_type:
            self.skipped[f'edge:{t}'] += 1
            return
        tail = self.resolve_endpoint(view.get('tail'))
        head = self.resolve_endpoint(view.get('head'))
        points = self.parse_points(view)
        label = self.first_label(view)

        if t == 'UMLSeqMessageView':
            tail_view = tail[1] if tail and tail[0] == 'view' else None
            head_view = head[1] if head and head[0] == 'view' else None
            y = points[0]['y'] if points else (tail_view['y'] + 20 if tail_view else 60)
            if tail and tail[0] == 'endpoint' and head_view:
                our_type = 'UMLMessage+found'
                tail_view = None
            elif head and head[0] == 'endpoint' and tail_view:
                our_type = 'UMLMessage+lost'
                head_view = None
            if not tail_view and not head_view:
                self.skipped['edge:seq-message-endpoints'] += 1
                return
            if head_view is not None and tail_view is None and our_type not in ('UMLMessage+found',):
                our_type = 'UMLMessage+found'
            if tail_view is not None and head_view is None and our_type not in ('UMLMessage+lost',):
                our_type = 'UMLMessage+lost'
            v = {
                '_id': self.nid('e'), '$type': our_type, 'isEdge': True, 'isMessage': True,
                'modelRef': self.ensure_model(model, view_type=t)['_id'] if model else '',
                'tail': tail_view['_id'] if tail_view else None,
                'head': head_view['_id'] if head_view else None,
                'y': round(y, 2), 'points': [],
                'lineStyle': 'dashed' if our_type in ('UMLMessage+reply', 'UMLMessage+create') else 'solid',
                'tailArrow': 'none',
                'headArrow': 'filledTriangle' if our_type in ('UMLMessage+sync', 'UMLMessage+delete') else 'open',
                'stereotype': '«create»' if our_type == 'UMLMessage+create' else ('«destroy»' if our_type == 'UMLMessage+delete' else ''),
                'nameVisible': True,
            }
            if our_type in ('UMLMessage+found', 'UMLMessage+lost'):
                anchor = points[0] if our_type == 'UMLMessage+found' else (points[-1] if points else None)
                v['endpointX'] = round(anchor['x'] if anchor else 20, 2)
            if model:
                vm = self.ensure_model(model, view_type=t)
                if label:
                    vm['name'] = label
            diagram['elements'].append(v)
            self.view_map[view.get('_id')] = v
            return

        if not tail or not head or tail[0] != 'view' or head[0] != 'view':
            self.skipped[f'edge:{t}-endpoints'] += 1
            return
        tail_view, head_view = tail[1], head[1]
        v = {
            '_id': self.nid('e'), '$type': our_type, 'isEdge': True,
            'isMessage': False,
            'modelRef': '',
            'tail': tail_view['_id'], 'head': head_view['_id'],
            'points': points[1:-1] if len(points) > 2 else [],
            'lineStyle': 'solid', 'tailArrow': 'none', 'headArrow': 'none',
            'stereotype': '', 'nameVisible': True,
        }
        if our_type == 'UMLTimeMessage':
            def lane_of(candidate):
                cur = candidate
                guard = 0
                while cur and guard < 10:
                    guard += 1
                    if cur.get('$type') == 'UMLTimingLifeline':
                        return cur
                    cid = cur.get('container')
                    cur = next((x for x in diagram['elements'] if x.get('_id') == cid), None) if cid else None
                return candidate
            tail_view = lane_of(tail_view)
            head_view = lane_of(head_view)
            v['tail'] = tail_view['_id']
            v['head'] = head_view['_id']
            v['x'] = round(points[0]['x'] if points else (tail_view['x'] + tail_view['width'] / 2), 2)
            v['y'] = 0
        if model:
            vm = self.ensure_model(model, view_type=t)
            if vm:
                v['modelRef'] = vm['_id']
            if label:
                if vm:
                    vm['name'] = label
        if 'shadow' in view:
            v['shadow'] = bool(view['shadow'])
        mode = str(view.get('lineMode') or '').lower()
        mode_map = {'rectilinear': 'orthogonal', 'orthogonal': 'orthogonal',
                    'oblique': 'oblique', 'rounded': 'rounded', 'curved': 'curved'}
        if mode in mode_map:
            v['lineMode'] = mode_map[mode]
        if our_type == 'UMLAssociation':
            v['lineStyle'] = 'solid'
            end1 = (model or {}).get('end1') or {}
            end2 = (model or {}).get('end2') or {}
            v['tailRoleName'] = clean_text(end1.get('name'))
            v['tailMultiplicity'] = clean_text(end1.get('multiplicity'))
            v['headRoleName'] = clean_text(end2.get('name'))
            v['headMultiplicity'] = clean_text(end2.get('multiplicity'))
            agg1 = end1.get('aggregation')
            agg2 = end2.get('aggregation')
            if agg1 == 'composite':
                v['tailArrow'] = 'filledDiamond'
            elif agg1 == 'shared':
                v['tailArrow'] = 'hollowDiamond'
            elif agg2 == 'composite':
                v['headArrow'] = 'filledDiamond'
            elif agg2 == 'shared':
                v['headArrow'] = 'hollowDiamond'
            if end2.get('navigable') == 'navigable' and v['headArrow'] == 'none':
                v['headArrow'] = 'open'
            if end1.get('navigable') == 'navigable' and v['tailArrow'] == 'none':
                v['tailArrow'] = 'open'
        elif our_type == 'UMLDependency':
            v.update(lineStyle='dashed', headArrow='open')
        elif our_type == 'UMLInterfaceRealization' or our_type == 'UMLComponentRealization':
            v.update(lineStyle='dashed', headArrow='hollowTriangle')
        elif our_type == 'UMLGeneralization':
            v['headArrow'] = 'hollowTriangle'
        elif our_type == 'UMLInclude':
            v.update(lineStyle='dashed', headArrow='open', stereotype='«include»')
        elif our_type == 'UMLExtend':
            v.update(lineStyle='dashed', headArrow='open', stereotype='«extend»')
        elif our_type == 'UMLDeployment':
            v.update(lineStyle='dashed', headArrow='open', stereotype='«deploy»')
        elif our_type == 'UMLExtension':
            v['headArrow'] = 'filledTriangle'
        elif our_type == 'ERDReference' and model and model.get('_type') == 'ERDRelationship':
            v['tailCardinality'] = clean_text((model.get('end1') or {}).get('cardinality'))
            v['headCardinality'] = clean_text((model.get('end2') or {}).get('cardinality'))
        elif our_type == 'UMLTransition' or our_type == 'UMLControlFlow' or our_type == 'UMLObjectFlow':
            v['headArrow'] = 'open'
            if label and v.get('modelRef'):
                vm = self.model_map.get(v['modelRef'])
                if vm:
                    vm['name'] = label
        elif our_type == 'UMLInformationFlow':
            v.update(lineStyle='dotted', headArrow='open', stereotype='«flow»')
        elif our_type == 'UMLNoteLink':
            v['lineStyle'] = 'dashed'
        elif our_type == 'UMLContainment':
            v['tailArrow'] = 'containment'
        elif our_type == 'UMLLink':
            v['lineStyle'] = 'solid'
            end1 = (model or {}).get('end1') or {}
            end2 = (model or {}).get('end2') or {}
            v['tailRoleName'] = clean_text(end1.get('name'))
            v['tailMultiplicity'] = clean_text(end1.get('multiplicity'))
            v['headRoleName'] = clean_text(end2.get('name'))
            v['headMultiplicity'] = clean_text(end2.get('multiplicity'))
            if end2.get('navigable') == 'navigable':
                v['headArrow'] = 'open'
        elif our_type == 'UMLConnector':
            v['lineStyle'] = 'solid'
        elif our_type == 'UMLCompositeConnector':
            v['lineStyle'] = 'solid'
        elif our_type == 'UMLTimeMessage':
            v['lineStyle'] = 'solid'
            v['headArrow'] = 'open'
        for flag in ('showVisibility', 'showType', 'showMultiplicity',
                     'showOperationSignature', 'showProperty', 'suppressAttributes',
                     'suppressOperations', 'suppressLiterals', 'showNamespace',
                     'shadow', 'autoResize'):
            if flag in view:
                v[flag] = bool(view[flag])
        for key in ('fillColor', 'lineColor', 'fontColor'):
            val = clean_text(view.get(key))
            if val.startswith('#'):
                v[key] = val
        if view.get('wordWrap') or view.get('autoWrap'):
            v['autoWrap'] = True
        if 'stereotypeDisplay' in view:
            v['stereotypeDisplay'] = 'none' if view.get('stereotypeDisplay') == 'none' else 'label'
        diagram['elements'].append(v)
        self.view_map[view.get('_id')] = v
        if our_type == 'UMLConnector' and model:
            if not hasattr(self, '_connector_views'):
                self._connector_views = {}
            self._connector_views[model.get('_id')] = v

    def aggregate_communication(self, diagram):
        if diagram.get('_type', diagram.get('type')) != 'UMLCommunicationDiagram':
            return
        connectors = getattr(self, '_connector_views', {})
        for view in self.by_id.values():
            if not isinstance(view, dict) or view.get('_type') != 'UMLCommMessageView':
                continue
            parent = self.by_id.get(ref(view.get('_parent')))
            if parent is not diagram:
                continue
            model = self.by_id.get(ref(view.get('model'))) or {}
            connector_id = ref(model.get('connector'))
            target = connectors.get(connector_id)
            if not target:
                continue
            text = self.first_label(view) or clean_text(model.get('name'))
            text = re.sub(r'^\s*\d+\s*', '', text).strip()
            connector = self.by_id.get(connector_id) or {}
            end1 = ref((connector.get('end1') or {}).get('reference'))
            end2 = ref((connector.get('end2') or {}).get('reference'))
            source = ref(model.get('source'))
            direction = 'reverse' if end2 and source == end2 and source != end1 else 'forward'
            target.setdefault('messages', []).append({'text': text, 'direction': direction})

    # ---------------- project ----------------
    def convert(self):
        project = {
            '_id': self.nid('p'),
            'type': 'Project',
            'name': clean_text(self.mdj.get('name')) or 'Project',
            'documentation': clean_text(self.mdj.get('documentation')),
            'ownedElements': [],
        }
        top_containers = [c for c in self.mdj.get('ownedElements') or []
                          if isinstance(c, dict) and (c.get('_type') in CONTAINER_MAP or c.get('_type') == 'UMLProfile')]
        if not top_containers:
            fallback = {'_id': '__root__', 'name': 'Model', '_type': 'UMLModel', 'ownedElements': self.mdj.get('ownedElements') or []}
            self.root_model = self.convert_container(fallback, project)
        else:
            self.root_model = None
            for c in top_containers:
                self.convert_container(c, project)
            self.root_model = next((m for m in project['ownedElements'] if m['type'] in ('UMLModel', 'UMLPackage', 'UMLSubsystem')), None)
        # Any diagram not reached through ownedElements still gets a home.
        for obj in self.by_id.values():
            if not isinstance(obj, dict):
                continue
            if (obj.get('_type') in DIAGRAM_TYPES or obj.get('_type') in DIAGRAM_TYPE_MAP) and obj.get('_id') not in self.diagram_map:
                owner = self.find_owner(obj) or self.root_model
                if owner:
                    self.convert_diagram(obj, owner)
        return project


def main():
    ap = argparse.ArgumentParser(description='Convert StarUML .mdj to OpenUML .ouml')
    ap.add_argument('input')
    ap.add_argument('output')
    ap.add_argument('--report')
    args = ap.parse_args()
    with open(args.input, encoding='utf-8') as f:
        mdj = json.load(f)
    conv = Converter(mdj)
    project = conv.convert()
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        json.dump(project, f, ensure_ascii=False, indent=2)
    print(f"wrote {args.output}")
    print(f"models={len(conv.model_map)} diagrams={len(conv.diagram_map)}")
    if conv.skipped:
        print('skipped:')
        for key, value in conv.skipped.most_common():
            print(f'  {value:4} {key}')
    if args.report:
        report = {
            'source': os.path.basename(args.input),
            'models': len(conv.model_map),
            'diagrams': [
                {'id': d['_id'], 'type': d['type'], 'name': d['name'],
                 'elements': len(d['elements'])}
                for d in conv.diagram_map.values()
            ],
            'skipped': dict(conv.skipped),
        }
        with open(args.report, 'w', encoding='utf-8') as f:
            json.dump(report, f, ensure_ascii=False, indent=2)
        print(f"report {args.report}")


if __name__ == '__main__':
    main()
