// toolbox.js — left palette with UML element icons (original SVG icon set)

import { ToolboxGroups, diagramIcon } from '../core/metamodel.js';
import { t } from './i18n.js';

// groups start collapsed; the set of open groups persists per browser
const TOOLBOX_OPEN_KEY = 'openuml-toolbox-open';

function openGroups() {
  try { return new Set(JSON.parse(localStorage.getItem(TOOLBOX_OPEN_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveOpenGroups(set) {
  try { localStorage.setItem(TOOLBOX_OPEN_KEY, JSON.stringify([...set])); } catch { /* private mode */ }
}

// Per-group header glyphs; the three diagram groups reuse their type icons
const groupIcons = {
  common: `<svg viewBox="0 0 14 14"><path d="M3.5 1.8 L11.2 7.6 L7.6 8.2 L9.4 12.2 L7.8 12.9 L6.1 8.9 L3.5 11.6 Z" fill="#fff" stroke="#4a4f4f" stroke-width="0.9"/></svg>`,
  class: diagramIcon('UMLClassDiagram'),
  usecase: diagramIcon('UMLUseCaseDiagram'),
  sequence: diagramIcon('UMLSequenceDiagram'),
  statechart: diagramIcon('UMLStatechartDiagram'),
  activity: diagramIcon('UMLActivityDiagram'),
  component: diagramIcon('UMLComponentDiagram'),
  deployment: diagramIcon('UMLDeploymentDiagram'),
  packagediag: diagramIcon('UMLPackageDiagram'),
  objectdiag: diagramIcon('UMLObjectDiagram'),
  communication: diagramIcon('UMLCommunicationDiagram'),
  erd: diagramIcon('ERDDiagram'),
  compositestructure: diagramIcon('UMLCompositeStructureDiagram'),
  informationflow: diagramIcon('UMLInformationFlowDiagram'),
  profile: diagramIcon('UMLProfileDiagram'),
  interactionoverview: diagramIcon('UMLInteractionOverviewDiagram'),
  timing: diagramIcon('UMLTimingDiagram'),
};

function groupIcon(id) {
  return groupIcons[id] || '';
}

// Small inline SVG icons drawn to resemble UML notation
const Icons = {
  select: `<svg viewBox="0 0 30 26"><path d="M10 4 L22 13 L15.5 14.2 L18.5 21 L15.8 22 L13 15.4 L10 19 Z" fill="#fff" stroke="#4a4f4f"/></svg>`,
  class: `<svg viewBox="0 0 30 26"><rect x="4" y="3" width="22" height="20" fill="#eef4fb" stroke="#4a4f4f"/><line x1="4" y1="10" x2="26" y2="10" stroke="#4a4f4f"/><line x1="4" y1="16" x2="26" y2="16" stroke="#4a4f4f"/></svg>`,
  interface: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="9" fill="#fdf3e7" stroke="#4a4f4f"/><text x="15" y="16.5" text-anchor="middle" font-size="8" font-style="italic" fill="#4a4f4f">I</text></svg>`,
  enum: `<svg viewBox="0 0 30 26"><rect x="4" y="3" width="22" height="20" fill="#fdf8e7" stroke="#4a4f4f"/><line x1="4" y1="10" x2="26" y2="10" stroke="#4a4f4f"/><text x="8" y="19" font-size="7" fill="#4a4f4f">≡</text></svg>`,
  dataType: `<svg viewBox="0 0 30 26"><rect x="4" y="3" width="22" height="20" fill="#eef4fb" stroke="#4a4f4f" stroke-dasharray="3 2"/><line x1="4" y1="10" x2="26" y2="10" stroke="#4a4f4f"/></svg>`,
  package: `<svg viewBox="0 0 30 26"><rect x="4" y="7" width="22" height="16" fill="#f7ead7" stroke="#4a4f4f"/><rect x="4" y="3" width="12" height="5" fill="#f7ead7" stroke="#4a4f4f"/></svg>`,
  actor: `<svg viewBox="0 0 30 26"><circle cx="15" cy="6" r="3.4" fill="none" stroke="#4a4f4f" stroke-width="1.3"/><line x1="15" y1="9.4" x2="15" y2="16" stroke="#4a4f4f" stroke-width="1.3"/><line x1="9.5" y1="12" x2="20.5" y2="12" stroke="#4a4f4f" stroke-width="1.3"/><line x1="15" y1="16" x2="11" y2="22" stroke="#4a4f4f" stroke-width="1.3"/><line x1="15" y1="16" x2="19" y2="22" stroke="#4a4f4f" stroke-width="1.3"/></svg>`,
  usecase: `<svg viewBox="0 0 30 26"><ellipse cx="15" cy="13" rx="10" ry="7" fill="#eaf5ea" stroke="#4a4f4f"/></svg>`,
  subject: `<svg viewBox="0 0 30 26"><rect x="3" y="4" width="24" height="18" fill="none" stroke="#4a4f4f"/><line x1="3" y1="9" x2="14" y2="9" stroke="#4a4f4f"/><text x="4.5" y="8" font-size="4.5" fill="#4a4f4f">system</text></svg>`,
  note: `<svg viewBox="0 0 30 26"><path d="M5 4 h15 l5 5 v13 h-20 Z" fill="#ffffe8" stroke="#4a4f4f"/><path d="M20 4 v5 h5" fill="none" stroke="#4a4f4f"/></svg>`,
  text: `<svg viewBox="0 0 30 26"><text x="4" y="18" font-size="14" fill="#353535" font-family="serif">T</text><line x1="14" y1="8" x2="26" y2="8" stroke="#4a4f4f"/><line x1="14" y1="13" x2="22" y2="13" stroke="#9aa4a4"/></svg>`,
  rect: `<svg viewBox="0 0 30 26"><rect x="5" y="5" width="20" height="16" fill="#eef4fb" stroke="#4a4f4f"/></svg>`,
  ellipse: `<svg viewBox="0 0 30 26"><ellipse cx="15" cy="13" rx="10" ry="8" fill="#eef4fb" stroke="#4a4f4f"/></svg>`,
  noteLink: `<svg viewBox="0 0 30 26"><line x1="4" y1="20" x2="26" y2="6" stroke="#4a4f4f" stroke-dasharray="4 3"/><rect x="20" y="14" width="7" height="7" fill="#ffffe8" stroke="#4a4f4f"/></svg>`,
  assoc: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="27" y2="13" stroke="#4a4f4f" stroke-width="1.4"/></svg>`,
  lifeline: `<svg viewBox="0 0 30 26"><rect x="8" y="2" width="14" height="7" fill="#eef4fb" stroke="#4a4f4f"/><line x1="15" y1="9" x2="15" y2="23" stroke="#4a4f4f" stroke-dasharray="3 2"/></svg>`,
  msgSync: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="23" y2="13" stroke="#4a4f4f" stroke-width="1.4"/><path d="M24 13 l-7 -4.2 v8.4 Z" fill="#4a4f4f"/></svg>`,
  msgAsync: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="23" y2="13" stroke="#4a4f4f" stroke-width="1.4"/><path d="M24 13 l-7 -4.2 M24 13 l-7 4.2" stroke="#4a4f4f" fill="none"/></svg>`,
  msgReply: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="23" y2="13" stroke="#4a4f4f" stroke-dasharray="4 3"/><path d="M24 13 l-7 -4.2 M24 13 l-7 4.2" stroke="#4a4f4f" fill="none"/></svg>`,
  msgCreate: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="22" y2="13" stroke="#4a4f4f" stroke-dasharray="4 3"/><path d="M23 13 l-6 -3.6 M23 13 l-6 3.6" stroke="#4a4f4f" fill="none"/><rect x="23" y="8" width="5" height="10" fill="#eef4fb" stroke="#4a4f4f"/></svg>`,
  msgDelete: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="21" y2="13" stroke="#4a4f4f"/><path d="M22 13 l-6 -3.4 v6.8 Z" fill="#4a4f4f"/><line x1="22" y1="7" x2="27" y2="19" stroke="#4a4f4f" stroke-width="1.4"/><line x1="27" y1="7" x2="22" y2="19" stroke="#4a4f4f" stroke-width="1.4"/></svg>`,
  msgFound: `<svg viewBox="0 0 30 26"><circle cx="6" cy="13" r="3.2" fill="#353535"/><line x1="9" y1="13" x2="25" y2="13" stroke="#4a4f4f"/><path d="M25 13 l-6 -3.4 M25 13 l-6 3.4" stroke="#4a4f4f" fill="none"/></svg>`,
  msgLost: `<svg viewBox="0 0 30 26"><line x1="4" y1="13" x2="18" y2="13" stroke="#4a4f4f"/><path d="M19 13 l-6 -3.4 M19 13 l-6 3.4" stroke="#4a4f4f" fill="none"/><circle cx="24" cy="13" r="3.2" fill="#353535"/></svg>`,
  refUse: `<svg viewBox="0 0 30 26"><rect x="3" y="4" width="24" height="18" fill="none" stroke="#4a4f4f" stroke-width="1.1"/><path d="M3 4 h10 v8 h-10 Z" fill="#fff" stroke="#4a4f4f"/><text x="5" y="10" font-size="5" fill="#4a4f4f">ref</text><line x1="12" y1="17" x2="19" y2="17" stroke="#9aa4a4"/></svg>`,
  erdEntity: `<svg viewBox="0 0 30 26"><rect x="4" y="3" width="22" height="20" fill="#eafaf2" stroke="#2e9e6e"/><line x1="4" y1="8" x2="26" y2="8" stroke="#2e9e6e"/><circle cx="7" cy="5.5" r="1.2" fill="#d9a520"/><line x1="4" y1="13" x2="26" y2="13" stroke="#bfe3d2"/><line x1="4" y1="18" x2="26" y2="18" stroke="#bfe3d2"/></svg>`,
  erdView: `<svg viewBox="0 0 30 26"><rect x="3" y="3" width="24" height="20" fill="#eafaf2" stroke="#2e9e6e"/><path d="M3 3 h11 v7 h-11 Z" fill="#d9f2e6" stroke="#2e9e6e"/><text x="5" y="9" font-size="5" fill="#2e9e6e">VIEW</text></svg>`,
  constraint: `<svg viewBox="0 0 30 26"><path d="M4 6 h16 l6 6 v10 h-22 Z" fill="#fff" stroke="#4a4f4f"/><path d="M20 6 v6 h6" fill="none" stroke="#4a4f4f"/><text x="7" y="18" font-size="7" font-style="italic" fill="#4a4f4f">{ }</text></svg>`,
  linkObject: `<svg viewBox="0 0 30 26"><line x1="2" y1="13" x2="28" y2="13" stroke="#4a4f4f"/><rect x="9" y="8" width="12" height="10" fill="#fff" stroke="#4a4f4f"/><line x1="11" y1="14" x2="19" y2="14" stroke="#4a4f4f"/></svg>`,
  fragment: `<svg viewBox="0 0 30 26"><rect x="3" y="4" width="24" height="18" fill="none" stroke="#4a4f4f" stroke-width="1.1"/><path d="M3 4 h11 v7 h-11 Z" fill="#fff" stroke="#4a4f4f"/><line x1="3" y1="15" x2="27" y2="15" stroke="#4a4f4f" stroke-dasharray="3 2"/><text x="5.5" y="9.6" font-size="5" fill="#4a4f4f">alt</text></svg>`,
  assocDir: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="24" y2="13" stroke="#4a4f4f" stroke-width="1.4"/><path d="M24 13 l-6 -3.4 v6.8 Z" fill="none" stroke="#4a4f4f"/></svg>`,
  aggr: `<svg viewBox="0 0 30 26"><line x1="12" y1="13" x2="27" y2="13" stroke="#4a4f4f" stroke-width="1.4"/><path d="M12 13 l4.5 -3 v6 Z" fill="#fff" stroke="#4a4f4f" transform="rotate(180 12 13)"/><path d="M12 13 l-4.5 -3 v6 Z" fill="#fff" stroke="#4a4f4f"/></svg>`,
  comp: `<svg viewBox="0 0 30 26"><line x1="12" y1="13" x2="27" y2="13" stroke="#4a4f4f" stroke-width="1.4"/><path d="M12 13 l-4.5 -3 v6 Z" fill="#4a4f4f" stroke="#4a4f4f"/></svg>`,
  dep: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="24" y2="13" stroke="#4a4f4f" stroke-dasharray="4 3"/><path d="M24 13 l-5 -3.2 M24 13 l-5 3.2" stroke="#4a4f4f" fill="none"/></svg>`,
  gen: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="21" y2="13" stroke="#4a4f4f" stroke-width="1.4"/><path d="M27 13 l-6.5 -4 v8 Z" fill="#fff" stroke="#4a4f4f"/></svg>`,
  real: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="21" y2="13" stroke="#4a4f4f" stroke-dasharray="4 3"/><path d="M27 13 l-6.5 -4 v8 Z" fill="#fff" stroke="#4a4f4f"/></svg>`,
  state: `<svg viewBox="0 0 30 26"><rect x="3" y="6" width="24" height="14" rx="6" fill="#f4edfa" stroke="#4a4f4f"/><text x="15" y="16" text-anchor="middle" font-size="7" font-style="italic" fill="#4a4f4f">state</text></svg>`,
  initial: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="5.5" fill="#353535"/></svg>`,
  final: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="6" fill="#fff" stroke="#353535" stroke-width="1.2"/><circle cx="15" cy="13" r="3.2" fill="#353535"/></svg>`,
  decision: `<svg viewBox="0 0 30 26"><path d="M15 3 L26 13 L15 23 L4 13 Z" fill="#fff" stroke="#4a4f4f"/></svg>`,
  junction: `<svg viewBox="0 0 30 26"><path d="M15 4 L24 13 L15 22 L6 13 Z" fill="#353535"/></svg>`,
  history: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="6.5" fill="#fff" stroke="#353535" stroke-width="1.2"/><text x="15" y="16.5" text-anchor="middle" font-size="8" fill="#353535">H</text></svg>`,
  historyDeep: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="6.5" fill="#fff" stroke="#353535" stroke-width="1.2"/><text x="15" y="16.5" text-anchor="middle" font-size="7" fill="#353535">H*</text></svg>`,
  action: `<svg viewBox="0 0 30 26"><rect x="3" y="6" width="24" height="14" rx="7" fill="#e8f6f6" stroke="#4a4f4f"/><text x="15" y="16" text-anchor="middle" font-size="7" font-style="italic" fill="#4a4f4f">act</text></svg>`,
  flowFinal: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="6" fill="#fff" stroke="#353535" stroke-width="1.2"/><line x1="10.8" y1="8.8" x2="19.2" y2="17.2" stroke="#353535" stroke-width="1.2"/><line x1="10.8" y1="17.2" x2="19.2" y2="8.8" stroke="#353535" stroke-width="1.2"/></svg>`,
  fork: `<svg viewBox="0 0 30 26"><rect x="3" y="11" width="24" height="4" fill="#353535"/></svg>`,
  component: `<svg viewBox="0 0 30 26"><rect x="7" y="4" width="20" height="18" fill="#fdf3e7" stroke="#4a4f4f"/><rect x="2" y="7" width="5" height="4" fill="#fff" stroke="#4a4f4f"/><rect x="2" y="15" width="5" height="4" fill="#fff" stroke="#4a4f4f"/></svg>`,
  artifact: `<svg viewBox="0 0 30 26"><path d="M6 3 h14 l5 5 v15 h-19 Z" fill="#eef1f1" stroke="#4a4f4f"/><path d="M20 3 v5 h5" fill="none" stroke="#4a4f4f"/></svg>`,
  node3d: `<svg viewBox="0 0 30 26"><path d="M5 8 h18 v14 h-18 Z" fill="#eef4fb" stroke="#4a4f4f"/><path d="M5 8 l4 -4 h18 l-4 4 M23 8 l4 -4 v14 l-4 4" fill="#fff" stroke="#4a4f4f"/></svg>`,
  object: `<svg viewBox="0 0 30 26"><rect x="4" y="5" width="22" height="16" fill="#eef4fb" stroke="#4a4f4f"/><line x1="9" y1="13" x2="21" y2="13" stroke="#4a4f4f"/></svg>`,
  subsystem: `<svg viewBox="0 0 30 26"><rect x="4" y="8" width="22" height="14" fill="#f7ead7" stroke="#4a4f4f"/><rect x="4" y="3" width="16" height="6" fill="#f7ead7" stroke="#4a4f4f"/><rect x="7" y="5" width="4" height="3" fill="#fff" stroke="#4a4f4f" stroke-width="0.8"/></svg>`,
  modelIcon: `<svg viewBox="0 0 30 26"><rect x="4" y="8" width="22" height="14" fill="#eaf4fc" stroke="#4a4f4f"/><rect x="4" y="3" width="16" height="6" fill="#eaf4fc" stroke="#4a4f4f"/><path d="M8 6 l2.4 2.4 M12.8 6 l-2.4 2.4" stroke="#1390d6" stroke-width="1"/></svg>`,
  composite: `<svg viewBox="0 0 30 26"><rect x="3" y="3" width="24" height="20" rx="5" fill="#f4edfa" stroke="#4a4f4f"/><line x1="3" y1="10" x2="27" y2="10" stroke="#4a4f4f"/><circle cx="9" cy="17" r="2" fill="#353535"/><rect x="14" y="14" width="10" height="6" rx="2" fill="none" stroke="#4a4f4f"/></svg>`,
  sendSignal: `<svg viewBox="0 0 30 26"><path d="M4 6 h17 l5 7 l-5 7 h-17 Z" fill="#e8f6f6" stroke="#4a4f4f"/></svg>`,
  acceptSignal: `<svg viewBox="0 0 30 26"><path d="M8 6 h18 v14 h-18 l-4 -7 Z" fill="#e8f6f6" stroke="#4a4f4f"/></svg>`,
  swimlaneV: `<svg viewBox="0 0 30 26"><rect x="3" y="3" width="24" height="20" fill="#fafbfb" stroke="#4a4f4f"/><rect x="3" y="3" width="7" height="20" fill="#f0f2f2" stroke="#4a4f4f"/><line x1="14" y1="3" x2="14" y2="23" stroke="#b6bdbd"/><line x1="20" y1="3" x2="20" y2="23" stroke="#b6bdbd"/></svg>`,
  swimlaneH: `<svg viewBox="0 0 30 26"><rect x="3" y="3" width="24" height="20" fill="#fafbfb" stroke="#4a4f4f"/><rect x="3" y="3" width="24" height="7" fill="#f0f2f2" stroke="#4a4f4f"/><line x1="3" y1="15" x2="27" y2="15" stroke="#b6bdbd"/></svg>`,
  collaboration: `<svg viewBox="0 0 30 26"><ellipse cx="15" cy="13" rx="11" ry="7" fill="#f7f1fb" stroke="#4a4f4f" stroke-dasharray="4 3"/><text x="15" y="16" text-anchor="middle" font-size="7" fill="#4a4f4f">collab</text></svg>`,
  collaborationUse: `<svg viewBox="0 0 30 26"><ellipse cx="15" cy="13" rx="11" ry="7" fill="#f7f1fb" stroke="#4a4f4f" stroke-dasharray="4 3"/><text x="15" y="16" text-anchor="middle" font-size="7" fill="#4a4f4f">use</text></svg>`,
  port: `<svg viewBox="0 0 30 26"><rect x="4" y="6" width="22" height="14" fill="#eef4fb" stroke="#4a4f4f"/><rect x="1.6" y="11" width="6" height="6" fill="#fff" stroke="#4a4f4f"/></svg>`,
  part: `<svg viewBox="0 0 30 26"><rect x="4" y="6" width="22" height="14" rx="3" fill="#eef4fb" stroke="#4a4f4f"/><text x="15" y="15.5" text-anchor="middle" font-size="6" fill="#4a4f4f">part</text></svg>`,
  infoItem: `<svg viewBox="0 0 30 26"><rect x="4" y="3" width="22" height="20" fill="#eef4fb" stroke="#4a4f4f"/><text x="15" y="8.5" text-anchor="middle" font-size="4" font-style="italic" fill="#4a4f4f">«info»</text><line x1="4" y1="11" x2="26" y2="11" stroke="#4a4f4f"/><line x1="4" y1="17" x2="26" y2="17" stroke="#4a4f4f"/></svg>`,
  infoFlow: `<svg viewBox="0 0 30 26"><rect x="2" y="3" width="8" height="6" fill="#eef4fb" stroke="#4a4f4f"/><rect x="20" y="17" width="8" height="6" fill="#eef4fb" stroke="#4a4f4f"/><line x1="10" y1="9" x2="20" y2="17" stroke="#4a4f4f" stroke-dasharray="2 2"/><path d="M21 18 l-4 -1 M21 18 l0 -3" stroke="#4a4f4f" fill="none"/><text x="15" y="10" text-anchor="middle" font-size="4" font-style="italic" fill="#4a4f4f">«flow»</text></svg>`,
  metaclass: `<svg viewBox="0 0 30 26"><rect x="4" y="4" width="22" height="18" fill="#eef4fb" stroke="#4a4f4f"/><text x="15" y="9.5" text-anchor="middle" font-size="4" font-style="italic" fill="#4a4f4f">«meta»</text><text x="15" y="17" text-anchor="middle" font-size="6" fill="#4a4f4f">Class</text></svg>`,
  stereotype: `<svg viewBox="0 0 30 26"><rect x="4" y="4" width="22" height="18" fill="#fdf3e7" stroke="#4a4f4f"/><text x="15" y="9.5" text-anchor="middle" font-size="4" font-style="italic" fill="#4a4f4f">«st»</text><text x="15" y="17" text-anchor="middle" font-size="6" fill="#4a4f4f">S</text></svg>`,
  extension: `<svg viewBox="0 0 30 26"><line x1="3" y1="13" x2="22" y2="13" stroke="#4a4f4f"/><path d="M27 13 l-6 -3.6 v7.2 Z" fill="#4a4f4f" stroke="#4a4f4f"/></svg>`,
  timingLifeline: `<svg viewBox="0 0 30 26"><rect x="3" y="6" width="24" height="14" fill="#fcfdfd" stroke="#d8dede"/><line x1="10" y1="6" x2="10" y2="20" stroke="#4a4f4f"/><line x1="10" y1="13" x2="27" y2="13" stroke="#8a8f8f"/><text x="5" y="15" font-size="5" fill="#4a4f4f">L</text></svg>`,
  timingState: `<svg viewBox="0 0 30 26"><line x1="3" y1="9" x2="15" y2="9" stroke="#4a4f4f" stroke-width="1.2"/><line x1="15" y1="9" x2="15" y2="17" stroke="#4a4f4f"/><line x1="15" y1="17" x2="27" y2="17" stroke="#4a4f4f" stroke-width="1.2"/><text x="4" y="6.5" font-size="5" fill="#4a4f4f">S</text></svg>`,
  timeSegment: `<svg viewBox="0 0 30 26"><line x1="5" y1="13" x2="25" y2="13" stroke="#4a4f4f" stroke-width="1.2"/><line x1="5" y1="8" x2="5" y2="18" stroke="#4a4f4f"/><line x1="25" y1="8" x2="25" y2="18" stroke="#4a4f4f"/></svg>`,
  timeTick: `<svg viewBox="0 0 30 26"><line x1="15" y1="5" x2="15" y2="18" stroke="#4a4f4f"/><text x="15" y="24" text-anchor="middle" font-size="6" fill="#4a4f4f">t</text></svg>`,
  duration: `<svg viewBox="0 0 30 26"><line x1="5" y1="16" x2="25" y2="16" stroke="#4a4f4f"/><line x1="5" y1="11" x2="5" y2="21" stroke="#4a4f4f"/><line x1="25" y1="11" x2="25" y2="21" stroke="#4a4f4f"/><text x="15" y="10" text-anchor="middle" font-size="6" fill="#4a4f4f">&#123;d&#125;</text></svg>`,
  signal: `<svg viewBox="0 0 30 26"><rect x="4" y="3" width="22" height="20" fill="#e8f6f6" stroke="#4a4f4f"/><text x="15" y="9" text-anchor="middle" font-size="4" font-style="italic" fill="#4a4f4f">«signal»</text><line x1="4" y1="12" x2="26" y2="12" stroke="#4a4f4f"/><line x1="4" y1="17" x2="26" y2="17" stroke="#4a4f4f"/></svg>`,
  primitive: `<svg viewBox="0 0 30 26"><rect x="4" y="4" width="22" height="18" fill="#eef4fb" stroke="#4a4f4f"/><text x="15" y="9.5" text-anchor="middle" font-size="4" font-style="italic" fill="#4a4f4f">«primitive»</text><text x="15" y="17" text-anchor="middle" font-size="7" fill="#4a4f4f">int</text></svg>`,
  frame: `<svg viewBox="0 0 30 26"><rect x="3" y="4" width="24" height="18" fill="#fff" stroke="#4a4f4f"/><path d="M3 4 h12 v7 h-12 Z" fill="#fff" stroke="#4a4f4f"/><text x="5" y="9.5" font-size="5" fill="#4a4f4f">frame</text></svg>`,
  centralBuffer: `<svg viewBox="0 0 30 26"><rect x="4" y="6" width="22" height="14" fill="#eef4fb" stroke="#4a4f4f"/><text x="15" y="15.5" text-anchor="middle" font-size="5" fill="#4a4f4f">CB</text></svg>`,
  dataStore: `<svg viewBox="0 0 30 26"><rect x="4" y="6" width="22" height="14" fill="#eef4fb" stroke="#4a4f4f"/><text x="15" y="15.5" text-anchor="middle" font-size="5" fill="#4a4f4f">DS</text></svg>`,
  activityParam: `<svg viewBox="0 0 30 26"><rect x="4" y="6" width="22" height="14" fill="#eef4fb" stroke="#4a4f4f"/><text x="15" y="15.5" text-anchor="middle" font-size="5" fill="#4a4f4f">P</text></svg>`,
  inputPin: `<svg viewBox="0 0 30 26"><rect x="9" y="9" width="8" height="8" fill="#fff" stroke="#4a4f4f"/><path d="M17 13 h6" stroke="#4a4f4f"/><path d="M23 13 l-3 -2 M23 13 l-3 2" stroke="#4a4f4f" fill="none"/></svg>`,
  outputPin: `<svg viewBox="0 0 30 26"><rect x="13" y="9" width="8" height="8" fill="#fff" stroke="#4a4f4f"/><path d="M7 13 h6" stroke="#4a4f4f"/><path d="M13 13 l-3 -2 M13 13 l-3 2" stroke="#4a4f4f" fill="none"/></svg>`,
  structured: `<svg viewBox="0 0 30 26"><rect x="3" y="3" width="24" height="20" rx="4" fill="#e8f6f6" stroke="#4a4f4f"/><text x="15" y="9" text-anchor="middle" font-size="5" fill="#4a4f4f">struct</text><rect x="7" y="12" width="8" height="4" rx="2" fill="none" stroke="#4a4f4f"/><rect x="18" y="12" width="6" height="4" rx="2" fill="none" stroke="#4a4f4f"/></svg>`,
  interruptRegion: `<svg viewBox="0 0 30 26"><rect x="3" y="3" width="24" height="20" fill="none" stroke="#4a4f4f" stroke-dasharray="4 3"/><text x="5" y="10" font-size="5" fill="#4a4f4f">region</text></svg>`,
  timeEvent: `<svg viewBox="0 0 30 26"><path d="M10 5 h10 l-5 8 l5 8 h-10 l5 -8 Z" fill="#fff" stroke="#4a4f4f"/></svg>`,
  nary: `<svg viewBox="0 0 30 26"><path d="M15 3 L26 13 L15 23 L4 13 Z" fill="#fff" stroke="#4a4f4f" stroke-width="1.2"/><line x1="4" y1="13" x2="1" y2="20" stroke="#4a4f4f"/><line x1="26" y1="13" x2="29" y2="20" stroke="#4a4f4f"/></svg>`,
  provided: `<svg viewBox="0 0 30 26"><circle cx="19" cy="13" r="6" fill="#fff" stroke="#4a4f4f"/><line x1="4" y1="13" x2="13" y2="13" stroke="#4a4f4f"/></svg>`,
  required: `<svg viewBox="0 0 30 26"><path d="M13 7 a6 6 0 0 1 0 12" fill="none" stroke="#4a4f4f" stroke-width="1.4"/><line x1="4" y1="13" x2="13" y2="13" stroke="#4a4f4f"/></svg>`,
  orthogonal: `<svg viewBox="0 0 30 26"><rect x="3" y="4" width="24" height="18" rx="4" fill="#f4edfa" stroke="#4a4f4f"/><line x1="15" y1="4" x2="15" y2="22" stroke="#4a4f4f" stroke-dasharray="3 2"/></svg>`,
  region: `<svg viewBox="0 0 30 26"><rect x="4" y="4" width="22" height="18" fill="none" stroke="#4a4f4f" stroke-dasharray="4 3"/><text x="6" y="11" font-size="5" fill="#4a4f4f">region</text></svg>`,
  submachine: `<svg viewBox="0 0 30 26"><rect x="3" y="6" width="24" height="14" rx="5" fill="#f4edfa" stroke="#4a4f4f"/><text x="15" y="11" text-anchor="middle" font-size="4" font-style="italic" fill="#4a4f4f">«sub»</text><text x="15" y="18" text-anchor="middle" font-size="6" fill="#4a4f4f">S</text></svg>`,
  entryPoint: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="6" fill="#fff" stroke="#353535"/><text x="15" y="15.5" text-anchor="middle" font-size="6" fill="#353535">E</text></svg>`,
  exitPoint: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="6" fill="#fff" stroke="#353535"/><text x="15" y="15.5" text-anchor="middle" font-size="6" fill="#353535">X</text></svg>`,
  terminate: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="6" fill="#fff" stroke="#353535" stroke-width="1.2"/><line x1="11" y1="9" x2="19" y2="17" stroke="#353535"/><line x1="11" y1="17" x2="19" y2="9" stroke="#353535"/></svg>`,
  connectionPoint: `<svg viewBox="0 0 30 26"><circle cx="15" cy="13" r="5" fill="#fff" stroke="#353535"/><text x="22" y="15.5" font-size="5" fill="#353535">cp</text></svg>`,
  assocClass: `<svg viewBox="0 0 30 26"><line x1="2" y1="16" x2="18" y2="16" stroke="#4a4f4f"/><line x1="18" y1="16" x2="24" y2="9" stroke="#4a4f4f" stroke-dasharray="4 3"/><rect x="20" y="3" width="8" height="6" fill="#eef4fb" stroke="#4a4f4f"/></svg>`,
};

// tool id -> canvas tool descriptor
export const ToolMap = {
  'tool-select': null,
  'tool-class': { kind: 'node', nodeType: 'UMLClass' },
  'tool-interface': { kind: 'node', nodeType: 'UMLInterface' },
  'tool-enum': { kind: 'node', nodeType: 'UMLEnumeration' },
  'tool-dataType': { kind: 'node', nodeType: 'UMLDataType' },
  'tool-primitiveType': { kind: 'node', nodeType: 'UMLPrimitiveType' },
  'tool-signal': { kind: 'node', nodeType: 'UMLSignal' },
  'tool-frame': { kind: 'node', nodeType: 'UMLFrame' },
  'tool-package': { kind: 'node', nodeType: 'UMLPackage' },
  'tool-actor': { kind: 'node', nodeType: 'UMLActor' },
  'tool-usecase': { kind: 'node', nodeType: 'UMLUseCase' },
  'tool-subject': { kind: 'node', nodeType: 'Subject' },
  'tool-note': { kind: 'node', nodeType: 'UMLNote' },
  'tool-lifeline': { kind: 'node', nodeType: 'UMLLifeLine' },
  'tool-text': { kind: 'node', nodeType: 'UMLTextView' },
  'tool-rect': { kind: 'node', nodeType: 'UMLRectView' },
  'tool-ellipse': { kind: 'node', nodeType: 'UMLEllipseView' },
  'tool-constraint': { kind: 'node', nodeType: 'UMLConstraint' },
  'tool-erdEntity': { kind: 'node', nodeType: 'ERDEntity' },
  'tool-erdReference': { kind: 'edge', edgeType: 'ERDReference' },
  'tool-erdRelationship': { kind: 'edge', edgeType: 'ERDRelationship' },
  'tool-erdView': { kind: 'node', nodeType: 'ERDView' },
  'tool-association': { kind: 'edge', edgeType: 'UMLAssociation' },
  'tool-directed': { kind: 'edge', edgeType: 'UMLAssociation+directed' },
  'tool-aggregation': { kind: 'edge', edgeType: 'UMLAssociation+aggregation' },
  'tool-composition': { kind: 'edge', edgeType: 'UMLAssociation+composition' },
  'tool-nary': { kind: 'node', nodeType: 'UMLNaryAssociation' },
  'tool-assocClass': { kind: 'node', nodeType: 'UMLAssociationClass' },
  'tool-dependency': { kind: 'edge', edgeType: 'UMLDependency' },
  'tool-generalization': { kind: 'edge', edgeType: 'UMLGeneralization' },
  'tool-gen': { kind: 'edge', edgeType: 'UMLGeneralization' },
  'tool-ifaceReal': { kind: 'edge', edgeType: 'UMLInterfaceRealization' },
  'tool-realization': { kind: 'edge', edgeType: 'UMLRealization' },
  'tool-templateBinding': { kind: 'edge', edgeType: 'UMLTemplateBinding' },
  'tool-include': { kind: 'edge', edgeType: 'UMLInclude' },
  'tool-extend': { kind: 'edge', edgeType: 'UMLExtend' },
  'tool-noteLink': { kind: 'edge', edgeType: 'UMLNoteLink' },
  'tool-syncMessage': { kind: 'edge', edgeType: 'UMLMessage+sync' },
  'tool-asyncMessage': { kind: 'edge', edgeType: 'UMLMessage+async' },
  'tool-replyMessage': { kind: 'edge', edgeType: 'UMLMessage+reply' },
  'tool-createMessage': { kind: 'edge', edgeType: 'UMLMessage+create' },
  'tool-deleteMessage': { kind: 'edge', edgeType: 'UMLMessage+delete' },
  'tool-combinedFragment': { kind: 'node', nodeType: 'UMLCombinedFragment' },
  'tool-foundMessage': { kind: 'edge', edgeType: 'UMLMessage+found' },
  'tool-lostMessage': { kind: 'edge', edgeType: 'UMLMessage+lost' },
  'tool-interactionUse': { kind: 'node', nodeType: 'UMLInteractionUse' },
  'tool-state': { kind: 'node', nodeType: 'UMLState' },
  'tool-initialState': { kind: 'node', nodeType: 'UMLInitialState' },
  'tool-finalState': { kind: 'node', nodeType: 'UMLFinalState' },
  'tool-choice': { kind: 'node', nodeType: 'UMLChoice' },
  'tool-shallowHistory': { kind: 'node', nodeType: 'UMLShallowHistory' },
  'tool-deepHistory': { kind: 'node', nodeType: 'UMLDeepHistory' },
  'tool-junction': { kind: 'node', nodeType: 'UMLJunction' },
  'tool-transition': { kind: 'edge', edgeType: 'UMLTransition' },
  'tool-selfTransition': { kind: 'edge', edgeType: 'UMLSelfTransition' },
  'tool-action': { kind: 'node', nodeType: 'UMLAction' },
  'tool-initialNode': { kind: 'node', nodeType: 'UMLInitialNode' },
  'tool-activityFinal': { kind: 'node', nodeType: 'UMLActivityFinalNode' },
  'tool-flowFinal': { kind: 'node', nodeType: 'UMLFlowFinalNode' },
  'tool-decisionNode': { kind: 'node', nodeType: 'UMLDecisionNode' },
  'tool-mergeNode': { kind: 'node', nodeType: 'UMLMergeNode' },
  'tool-forkNode': { kind: 'node', nodeType: 'UMLForkNode' },
  'tool-joinNode': { kind: 'node', nodeType: 'UMLJoinNode' },
  'tool-controlFlow': { kind: 'edge', edgeType: 'UMLControlFlow' },
  'tool-objectNode': { kind: 'node', nodeType: 'UMLObjectNode' },
  'tool-centralBuffer': { kind: 'node', nodeType: 'UMLCentralBufferNode' },
  'tool-dataStore': { kind: 'node', nodeType: 'UMLDataStoreNode' },
  'tool-activityParam': { kind: 'node', nodeType: 'UMLActivityParameterNode' },
  'tool-inputPin': { kind: 'node', nodeType: 'UMLInputPin' },
  'tool-outputPin': { kind: 'node', nodeType: 'UMLOutputPin' },
  'tool-structured': { kind: 'node', nodeType: 'UMLStructuredActivityNode' },
  'tool-interruptRegion': { kind: 'node', nodeType: 'UMLInterruptibleRegion' },
  'tool-acceptTimeEvent': { kind: 'node', nodeType: 'UMLAcceptTimeEvent' },
  'tool-objectFlow': { kind: 'edge', edgeType: 'UMLObjectFlow' },
  'tool-sendSignal': { kind: 'node', nodeType: 'UMLSendSignal' },
  'tool-acceptSignal': { kind: 'node', nodeType: 'UMLAcceptSignal' },
  'tool-swimlaneV': { kind: 'node', nodeType: 'UMLSwimlaneVert' },
  'tool-swimlaneH': { kind: 'node', nodeType: 'UMLSwimlaneHorz' },
  'tool-compositeState': { kind: 'node', nodeType: 'UMLCompositeState' },
  'tool-orthogonalState': { kind: 'node', nodeType: 'UMLOrthogonalState' },
  'tool-region': { kind: 'node', nodeType: 'UMLRegion' },
  'tool-submachineState': { kind: 'node', nodeType: 'UMLSubmachineState' },
  'tool-entryPoint': { kind: 'node', nodeType: 'UMLEntryPoint' },
  'tool-exitPoint': { kind: 'node', nodeType: 'UMLExitPoint' },
  'tool-terminate': { kind: 'node', nodeType: 'UMLTerminate' },
  'tool-connectionPoint': { kind: 'node', nodeType: 'UMLConnectionPointReference' },
  'tool-package2': { kind: 'node', nodeType: 'UMLPackage' },
  'tool-package3': { kind: 'node', nodeType: 'UMLPackage' },
  'tool-component': { kind: 'node', nodeType: 'UMLComponent' },
  'tool-artifact': { kind: 'node', nodeType: 'UMLArtifact' },
  'tool-artifact2': { kind: 'node', nodeType: 'UMLArtifact' },
  'tool-interface2': { kind: 'node', nodeType: 'UMLInterface' },
  'tool-providedInterface': { kind: 'node', nodeType: 'UMLProvidedInterface' },
  'tool-requiredInterface': { kind: 'node', nodeType: 'UMLRequiredInterface' },
  'tool-dependency2': { kind: 'edge', edgeType: 'UMLDependency' },
  'tool-dependency3': { kind: 'edge', edgeType: 'UMLDependency' },
  'tool-compReal': { kind: 'edge', edgeType: 'UMLComponentRealization' },
  'tool-node': { kind: 'node', nodeType: 'UMLNode' },
  'tool-deployment': { kind: 'edge', edgeType: 'UMLDeployment' },
  'tool-commPath': { kind: 'edge', edgeType: 'UMLCommunicationPath' },
  'tool-subsystem': { kind: 'node', nodeType: 'UMLSubsystem' },
  'tool-model': { kind: 'node', nodeType: 'UMLModel' },
  'tool-containment': { kind: 'edge', edgeType: 'UMLContainment' },
  'tool-object': { kind: 'node', nodeType: 'UMLObject' },
  'tool-artifactInstance': { kind: 'node', nodeType: 'UMLArtifactInstance' },
  'tool-componentInstance': { kind: 'node', nodeType: 'UMLComponentInstance' },
  'tool-nodeInstance': { kind: 'node', nodeType: 'UMLNodeInstance' },
  'tool-odLink': { kind: 'edge', edgeType: 'UMLLink' },
  'tool-odDirectedLink': { kind: 'edge', edgeType: 'UMLDirectedLink' },
  'tool-odLinkObject': { kind: 'edge', edgeType: 'UMLLinkObject' },
  'tool-actor2': { kind: 'node', nodeType: 'UMLActor' },
  'tool-link': { kind: 'edge', edgeType: 'UMLConnector' },
  'tool-linkMessage': { kind: 'edge', edgeType: 'UMLLinkMessage' },
  // composite structure
  'tool-collaboration': { kind: 'node', nodeType: 'UMLCollaboration' },
  'tool-port': { kind: 'node', nodeType: 'UMLPort' },
  'tool-part': { kind: 'node', nodeType: 'UMLPart' },
  'tool-compConnector': { kind: 'edge', edgeType: 'UMLCompositeConnector' },
  'tool-collaborationUse': { kind: 'node', nodeType: 'UMLCollaborationUse' },
  'tool-roleBinding': { kind: 'edge', edgeType: 'UMLRoleBinding' },
  'tool-ifaceReal2': { kind: 'edge', edgeType: 'UMLInterfaceRealization' },
  // information flow
  'tool-infoItem': { kind: 'node', nodeType: 'UMLInformationItem' },
  'tool-infoFlow': { kind: 'edge', edgeType: 'UMLInformationFlow' },
  // profile
  'tool-metaclass': { kind: 'node', nodeType: 'UMLMetaClass' },
  'tool-stereotype': { kind: 'node', nodeType: 'UMLStereotype' },
  'tool-enum2': { kind: 'node', nodeType: 'UMLEnumeration' },
  'tool-extension': { kind: 'edge', edgeType: 'UMLExtension' },
  'tool-gen2': { kind: 'edge', edgeType: 'UMLGeneralization' },
  // interaction overview
  'tool-ioInteractionUse': { kind: 'node', nodeType: 'UMLInteractionUseInOverview' },
  'tool-ioInteraction': { kind: 'node', nodeType: 'UMLInteractionInOverview' },
  'tool-ioInitial': { kind: 'node', nodeType: 'UMLInitialNode' },
  'tool-ioFinal': { kind: 'node', nodeType: 'UMLActivityFinalNode' },
  'tool-ioFork': { kind: 'node', nodeType: 'UMLForkNode' },
  'tool-ioJoin': { kind: 'node', nodeType: 'UMLJoinNode' },
  'tool-ioMerge': { kind: 'node', nodeType: 'UMLMergeNode' },
  'tool-ioDecision': { kind: 'node', nodeType: 'UMLDecisionNode' },
  'tool-ioControlFlow': { kind: 'edge', edgeType: 'UMLControlFlow' },
  // timing
  'tool-timingLifeline': { kind: 'node', nodeType: 'UMLTimingLifeline' },
  'tool-timingState': { kind: 'node', nodeType: 'UMLTimingState' },
  'tool-timeSegment': { kind: 'node', nodeType: 'UMLTimeSegment' },
  'tool-timeTick': { kind: 'node', nodeType: 'UMLTimeTick' },
  'tool-timeConstraint': { kind: 'node', nodeType: 'UMLTimeConstraint' },
  'tool-durationConstraint': { kind: 'node', nodeType: 'UMLDurationConstraint' },
  'tool-timeMessage': { kind: 'edge', edgeType: 'UMLTimeMessage' },
};

export function initToolbox(canvas, getActiveToolboxGroup) {
  const toolbox = document.getElementById('toolbox');

  function render() {
    toolbox.innerHTML = '';
    const open = openGroups();
    for (const group of ToolboxGroups) {
      const header = document.createElement('div');
      header.className = 'toolbox-group-header';
      const isOpen = open.has(group.id);
      header.innerHTML = `<span class="arrow">${isOpen ? '▾' : '▸'}</span><span class="gh-icon">${groupIcon(group.id)}</span><span>${t(group.name)}</span>`;
      header.onclick = () => {
        const body = header.nextElementSibling;
        if (!body) return;
        body.classList.toggle('hidden');
        const nowOpen = !body.classList.contains('hidden');
        header.querySelector('.arrow').textContent = nowOpen ? '▾' : '▸';
        const set = openGroups();
        if (nowOpen) set.add(group.id); else set.delete(group.id);
        saveOpenGroups(set);
      };
      toolbox.appendChild(header);
      const body = document.createElement('div');
      body.className = 'toolbox-group-body' + (open.has(group.id) ? '' : ' hidden');
      for (const item of group.items) {
        body.appendChild(makeItem(item));
      }
      toolbox.appendChild(body);
    }
  }

  function makeItem(item) {
    const el = document.createElement('div');
    el.className = 'toolbox-item';
    el.innerHTML = (Icons[item.icon] || '') + `<span>${t(item.name)}</span>`;
    el.title = t(item.name);
    el.onclick = () => {
      document.getElementById('toolbox').querySelectorAll('.toolbox-item').forEach((n) => n.classList.remove('active'));
      if (item.id === 'tool-select') {
        canvas.setTool(null);
        el.classList.add('active');
      } else {
        const tool = ToolMap[item.id];
        if (tool) {
          canvas.setTool({ ...tool, id: item.id });
          el.classList.add('active');
        }
      }
    };
    return el;
  }
  document.addEventListener('tool-changed', () => {
    toolbox.querySelectorAll('.toolbox-item').forEach((n) => n.classList.remove('active'));
    if (!canvas.tool) {
      const first = toolbox.querySelector('.toolbox-item');
      if (first) first.classList.add('active');
    }
  });
  render();
}
