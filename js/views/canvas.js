// canvas.js — SVG diagram canvas: pan/zoom, selection, tool interaction,
// node move/resize, edge re-routing, inline text editing.

import { Rect, snap, resizeHandle, dist } from '../core/geometry.js';
import { repository } from '../core/repository.js';
import { commandStack, compound } from '../core/commands.js';
import { createModel, createNodeView, createEdgeView, createAttribute } from '../core/factory.js';
import { renderNode, svgEl } from './nodeviews.js';
import { renderEdge, renderMessage, renderSelfLoop, distanceToPolyline, computeEdgeGeometry } from './edgeviews.js';
import { openQuickEdit, openConnectorEdit, closeQuickEdit } from '../ui/quickedit.js';

const GRID = 10;
const SNAP_TOL = 5;

export class DiagramCanvas {
  constructor(svgRoot) {
    this.svg = svgRoot;
    this.diagram = null;          // active diagram (model node with .elements views)
    this.zoom = 1;
    this.panX = 0; this.panY = 0;
    this.showGrid = true;
    this.snapToGrid = true;

    this.renderers = new Map();   // viewId -> {g, meta, view}
    this.tool = null;             // active toolbox tool {kind, nodeType, edgeType, ...}
    this.drag = null;             // current gesture state
    this.hoverHandle = null;

    this.defs = svgEl('defs', {}, this.svg);
    this.gridLayer = svgEl('g', { id: 'grid-layer' }, this.svg);
    this.contentLayer = svgEl('g', { id: 'content-layer' }, this.svg);
    this.overlayLayer = svgEl('g', { id: 'overlay-layer' }, this.svg);

    this._bindEvents();
    this.svg.__canvas = this;
    repository.on('change', () => this.requestRender());
    repository.on('select', ({ ids }) => this._updateSelectionClasses(ids));
    document.addEventListener('stack-changed', () => this.requestRender());
    window.addEventListener('resize', () => this.requestRender());
  }

  // ---------------- rendering ----------------
  requestRender() {
    if (this._raf) return;
    // setTimeout instead of rAF: some embedded browsers never dispatch
    // animation frames for occluded tabs, which would freeze the canvas.
    this._raf = setTimeout(() => { this._raf = 0; this.render(); }, 16);
  }

  setDiagram(diagram) {
    this.diagram = diagram;
    this.render(true);
  }

  viewRect() {
    const w = this.svg.clientWidth || 800, h = this.svg.clientHeight || 600;
    return new Rect(-this.panX / this.zoom, -this.panY / this.zoom, w / this.zoom, h / this.zoom);
  }

  clientToWorld(e) {
    const r = this.svg.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - this.panX) / this.zoom,
      y: (e.clientY - r.top - this.panY) / this.zoom,
    };
  }

  render(full = false) {
    const w = this.svg.clientWidth, h = this.svg.clientHeight;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    // grid
    this.gridLayer.innerHTML = '';
    if (this.showGrid) {
      const step = GRID * this.zoom;
      if (step >= 7) {
        const offX = ((this.panX % step) + step) % step;
        const offY = ((this.panY % step) + step) % step;
        for (let gx = offX; gx < w; gx += step) {
          for (let gy = offY; gy < h; gy += step) {
            svgEl('circle', { cx: gx, cy: gy, r: 1, class: 'svg-grid' }, this.gridLayer);
          }
        }
      }
    }
    // content transform
    this.contentLayer.setAttribute('transform', `translate(${this.panX},${this.panY}) scale(${this.zoom})`);
    this.overlayLayer.setAttribute('transform', this.contentLayer.getAttribute('transform'));

    this.contentLayer.innerHTML = '';
    this.renderers.clear();
    if (!this.diagram) return;

    const views = this.diagram.elements || [];
    this._applySequenceLayout(views);
    const rects = new Map();
    for (const v of views) {
      if (!v.isEdge) rects.set(v._id, new Rect(v.x, v.y, v.width, v.height));
    }
    // draw nodes first (containers/backdrops below their children), then edges on top.
    const isBackdrop = (v) => v.$type === 'UMLSwimlaneVert' || v.$type === 'UMLSwimlaneHorz' || v.$type === 'UMLCompositeState' || v.$type === 'UMLCombinedFragment';
    const nodes = views.filter((v) => !v.isEdge)
      .sort((a, b) => (isBackdrop(a) ? 0 : 1) - (isBackdrop(b) ? 0 : 1));
    const edges = views.filter((v) => v.isEdge);
    this._renderFrame(nodes);
    for (const v of nodes) this._renderNodeView(v);
    this._renderActivations(views);
    for (const e of edges) this._renderEdgeView(e, rects);
    this._updateSelectionClasses(repository.selections);
    this._updateOverlay();
  }

  _renderNodeView(v) {
    const model = repository.lookup(v.modelRef);
    const g = svgEl('g', { class: 'node-main', 'data-id': v._id }, this.contentLayer);
    const kind = v.$type === 'UMLClass' ? 'class'
      : v.$type === 'UMLInterface' ? 'interface'
      : v.$type === 'UMLEnumeration' ? 'enumeration'
      : v.$type === 'UMLDataType' ? 'datatype'
      : v.$type === 'UMLActor' ? 'actor'
      : v.$type === 'UMLUseCase' ? 'usecase'
      : v.$type === 'UMLPackage' ? 'package'
      : v.$type === 'Subject' ? 'subject'
      : v.$type === 'UMLLifeLine' ? 'lifeline'
      : v.$type === 'UMLState' ? 'state'
      : v.$type === 'UMLAction' ? 'action'
      : v.$type === 'UMLInitialState' || v.$type === 'UMLInitialNode' ? 'initial'
      : v.$type === 'UMLFinalState' || v.$type === 'UMLActivityFinalNode' ? 'final'
      : v.$type === 'UMLFlowFinalNode' ? 'flowfinal'
      : v.$type === 'UMLShallowHistory' || v.$type === 'UMLDeepHistory' ? 'history'
      : v.$type === 'UMLJunction' ? 'junction'
      : v.$type === 'UMLChoice' || v.$type === 'UMLDecisionNode' || v.$type === 'UMLMergeNode' ? 'decision'
      : v.$type === 'UMLForkNode' || v.$type === 'UMLJoinNode' ? 'fork'
      : v.$type === 'UMLTextView' ? 'text'
      : v.$type === 'UMLRectView' ? 'rect'
      : v.$type === 'UMLRoundRectView' ? 'roundrect'
      : v.$type === 'UMLEllipseView' ? 'ellipse'
      : v.$type === 'UMLComponent' ? 'component'
      : v.$type === 'UMLArtifact' ? 'artifact'
      : v.$type === 'UMLNode' ? 'node3d'
      : v.$type === 'UMLObject' ? 'object'
      : v.$type === 'UMLSubsystem' ? 'subsystem'
      : v.$type === 'UMLModel' ? 'package'
      : v.$type === 'UMLSwimlaneVert' ? 'swimlaneV'
      : v.$type === 'UMLSwimlaneHorz' ? 'swimlaneH'
      : v.$type === 'UMLCompositeState' ? 'composite'
      : v.$type === 'UMLObjectNode' ? 'objectnode'
      : v.$type === 'UMLSendSignal' ? 'sendsignal'
      : v.$type === 'UMLAcceptSignal' ? 'acceptsignal'
      : v.$type === 'UMLCombinedFragment' ? 'fragment'
      : v.$type === 'UMLNote' ? 'note' : 'class';
    const meta = renderNode(g, v, model, kind);
    g.dataset.id = v._id;
    this.renderers.set(v._id, { g, meta, view: v, kind: 'node' });
    // auto-fit: grow the view so its compartments are never clipped, then
    // re-render once so edge attachment points use the new bounds
    if (meta.autoHeight && meta.autoHeight > v.height + 0.5) {
      v.height = Math.ceil(meta.autoHeight);
      this.requestRender();
    }
  }

  /**
   * Diagram frame (StarUML-style): thin border around the content area with a
   * name tab at the top-left carrying the UML diagram-type prefix.
   */
  _renderFrame(nodes) {
    if (!this.diagram) return;
    const prefixes = {
      UMLClassDiagram: 'cd', UMLUseCaseDiagram: 'uc', UMLSequenceDiagram: 'sd',
      UMLStatechartDiagram: 'stm', UMLActivityDiagram: 'ad',
      UMLComponentDiagram: 'cp', UMLDeploymentDiagram: 'dp',
      UMLPackageDiagram: 'pkg', UMLCommunicationDiagram: 'comm',
    };
    const prefix = prefixes[this.diagram.type];
    if (!prefix) return;
    let maxX = 600, maxY = 400;
    for (const v of nodes) {
      const h = v.$type === 'UMLLifeLine' ? v.height + (v.lifeHeight || 400) : v.height;
      maxX = Math.max(maxX, v.x + v.width);
      maxY = Math.max(maxY, v.y + h);
    }
    const pad = 30;
    const fx = -pad, fy = -pad, fw = maxX + pad * 2, fh = maxY + pad * 2;
    svgEl('rect', { x: fx, y: fy, width: fw, height: fh, fill: 'none', stroke: '#9aa4a4', 'stroke-width': 1 }, this.contentLayer);
    const tabText = `${prefix}  ${this.diagram.name}`;
    const tabW = 10 + tabText.length * 6.2, tabH = 18;
    svgEl('rect', { x: fx, y: fy, width: tabW, height: tabH, fill: '#f7f8f8', stroke: '#9aa4a4', 'stroke-width': 1 }, this.contentLayer);
    const t = svgEl('text', { x: fx + 6, y: fy + 13, 'font-size': 10, fill: '#5a6262' }, this.contentLayer);
    t.textContent = tabText;
  }

  /**
   * Sequence-diagram layout rules (mirrors StarUML's arrange()):
   * a lifeline targeted by a create message has its head centered on the
   * message's y so the arrow lands on the newly created object.
   */
  _applySequenceLayout(views) {
    if (!this.diagram || !this.diagram.type === 'UMLSequenceDiagram') return;
    const heads = new Map(views.filter((v) => v.$type === 'UMLLifeLine').map((v) => [v._id, v]));
    for (const e of views) {
      if (!e.isEdge || e.$type !== 'UMLMessage+create') continue;
      const head = heads.get(e.head);
      if (!head) continue;
      const targetY = e.y - head.height / 2;
      if (Math.abs(head.y - targetY) > 0.5) head.y = targetY;
    }
  }

  /** Absolute y positions of a combined fragment's operand separators. */
  fragmentOperandYs(view, model) {
    const n = Math.max(1, (model.operands || []).length);
    const tabH = 22;
    const innerTop = view.y + tabH;
    const innerH = Math.max(10, view.height - tabH);
    const fr = (Array.isArray(model.operandBoundaries) && model.operandBoundaries.length === n - 1)
      ? model.operandBoundaries
      : Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
    return { innerTop, innerH, fractions: fr, ys: fr.map((f) => innerTop + innerH * f) };
  }

  /**
   * Sequence-diagram activation bars: thin rectangles on lifelines covering
   * the spans where messages attach, computed from the diagram's messages.
   */
  _renderActivations(views) {
    const lifelines = views.filter((v) => v.$type === 'UMLLifeLine');
    if (!lifelines.length) return;
    const byId = new Map(lifelines.map((v) => [v._id, v]));
    const ysByLifeline = new Map(); // id -> sorted message ys
    for (const e of views) {
      if (!e.isMessage) continue;
      const tail = byId.get(e.tail), head = byId.get(e.head);
      if (!tail) continue;
      const push = (ll, y) => {
        if (!ysByLifeline.has(ll._id)) ysByLifeline.set(ll._id, []);
        ysByLifeline.get(ll._id).push(y);
      };
      if (tail._id === e.head) {
        push(tail, e.y);          // self-message: loop spans [y-24, y+16]
      } else {
        if (head) push(head, e.y);
        push(tail, e.y);
      }
    }
    const merged = [];
    for (const ll of lifelines) {
      const ys = (ysByLifeline.get(ll._id) || []).sort((a, b) => a - b);
      const headH = ll.height, lifeH = ll.lifeHeight || 400;
      const min = ll.y + headH, max = ll.y + headH + lifeH;
      const spans = [];
      for (const y of ys) {
        const top = Math.max(min, y - 2);
        const bottom = Math.min(max, y + 26);
        const last = spans[spans.length - 1];
        if (last && top <= last.end + 4) last.end = Math.max(last.end, bottom);
        else spans.push({ start: top, end: bottom });
      }
      for (const s of spans) merged.push({ ll, s });
    }
    for (const { ll, s } of merged) {
      const cx = ll.x + ll.width / 2;
      const w = 10;
      svgEl('rect', {
        x: cx - w / 2, y: s.start, width: w, height: Math.max(8, s.end - s.start),
        fill: '#fefefe', stroke: '#353535', 'stroke-width': 1, class: 'activation',
      }, this.contentLayer);
    }
  }

  _renderEdgeView(e, rects) {
    const model = repository.lookup(e.modelRef);
    const g = svgEl('g', { class: 'edge-main' }, this.contentLayer);
    let meta;
    if (e.isMessage) {
      const tailV = repository.lookup(e.tail);
      const headV = repository.lookup(e.head);
      if (!tailV || !headV) { g.remove(); return; }
      meta = renderMessage(g, e, model, tailV, headV);
    } else if (e.tail === e.head) {
      // self-transition / self-association loop
      const rect = rects.get(e.tail);
      if (!rect) { g.remove(); return; }
      meta = renderSelfLoop(g, e, model, rect);
    } else {
      const tailRect = rects.get(e.tail);
      const headRect = rects.get(e.head);
      if (!tailRect || !headRect) { g.remove(); return; }
      meta = renderEdge(g, e, model, tailRect, headRect);
    }
    // communication-diagram messages stack above the link midpoint
    if (e.$type === 'UMLConnector' && (e.messages || []).length) {
      const mid = meta.points ? meta.points[Math.floor(meta.points.length / 2)] : { x: 0, y: 0 };
      const mfs = e.fontSize || 11;
      e.messages.forEach((msg, i) => {
        const t = svgEl('text', {
          x: mid.x, y: mid.y - 6 - (e.messages.length - 1 - i) * (mfs + 2),
          'text-anchor': 'middle', 'font-size': mfs, fill: e.fontColor || '#353535',
        }, g);
        t.textContent = `${i + 1}: ${msg.text || '…'}`;
      });
    }
    g.dataset.id = e._id;
    this.renderers.set(e._id, { g, meta, view: e, kind: 'edge' });
  }

  _updateSelectionClasses(ids) {
    const set = new Set(ids);
    for (const [, r] of this.renderers) {
      r.g.classList.toggle('selected', set.has(r.view._id));
    }
  }

  _updateOverlay() {
    this.overlayLayer.innerHTML = '';
    if (!this.diagram) return;
    // resize handles for single selected node
    if (repository.selections.length === 1) {
      const r = this.renderers.get(repository.selections[0]);
      if (r && r.kind === 'node') {
        const v = r.view;
        const hs = { nw: [v.x, v.y], n: [v.x + v.width / 2, v.y], ne: [v.x + v.width, v.y], w: [v.x, v.y + v.height / 2], e: [v.x + v.width, v.y + v.height / 2], sw: [v.x, v.y + v.height], s: [v.x + v.width / 2, v.y + v.height], se: [v.x + v.width, v.y + v.height] };
        for (const [k, [hx, hy]] of Object.entries(hs)) {
          const c = svgEl('circle', { cx: hx, cy: hy, r: 4.5 / this.zoom, class: 'handle', 'data-handle': k, 'data-node': v._id, 'stroke-width': 1.2 / this.zoom }, this.overlayLayer);
          c.style.cursor = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' }[k];
        }
      }
      // operand separators of a selected combined fragment are draggable
      if (r && r.kind === 'node' && r.view.$type === 'UMLCombinedFragment') {
        const model = repository.lookup(r.view.modelRef);
        if (model) {
          const { ys } = this.fragmentOperandYs(r.view, model);
          for (let i = 0; i < ys.length; i++) {
            const h = svgEl('rect', {
              x: r.view.x + r.view.width / 2 - 16, y: ys[i] - 3, width: 32, height: 6,
              rx: 2, fill: '#fff', stroke: '#1390d6', 'stroke-width': 1 / this.zoom,
              class: 'op-handle', 'data-op-index': i, 'data-edge': r.view._id,
            }, this.overlayLayer);
            h.style.cursor = 'ns-resize';
          }
        }
      }
      // waypoint editing for a single selected edge
      if (r && r.kind === 'edge' && !r.view.isMessage) {
        const pts = r.meta.points || [];
        const s = 4 / this.zoom;
        // existing waypoints (interior points): square handles, draggable, double-click removes
        for (let i = 1; i < pts.length - 1; i++) {
          const h = svgEl('rect', {
            x: pts[i].x - s, y: pts[i].y - s, width: s * 2, height: s * 2,
            class: 'handle wp-handle', 'data-wp-index': i, 'data-edge': r.view._id,
            'stroke-width': 1 / this.zoom,
          }, this.overlayLayer);
          h.style.cursor = 'move';
          h.addEventListener('dblclick', (ev) => {
            ev.stopPropagation();
            this._removeWaypoint(r.view, i - 1); // meta index 1..n maps to points index 0..n-1
          });
        }
        // segment midpoints: hollow circles that insert a new waypoint on drag
        for (let i = 0; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
          const h = svgEl('circle', {
            cx: mx, cy: my, r: 3.5 / this.zoom,
            class: 'wp-insert', 'data-wp-insert': i, 'data-edge': r.view._id,
            fill: '#fff', stroke: '#1390d6', 'stroke-width': 1 / this.zoom,
          }, this.overlayLayer);
          h.style.cursor = 'move';
        }
      }
    }
  }

  _removeWaypoint(view, index) {
    const old = (view.points || []).map((p) => ({ ...p }));
    if (index < 0 || index >= old.length) return;
    const next = old.filter((_, i) => i !== index);
    commandStack.exec({
      label: 'remove waypoint',
      redo: () => { view.points = next.map((p) => ({ ...p })); this.requestRender(); },
      undo: () => { view.points = old.map((p) => ({ ...p })); this.requestRender(); },
    });
    this.setStatusMessage('已删除拐点');
  }

  // ---------------- containment (swimlanes / composite states) ----------------
  static CONTAINER_TYPES = ['UMLSwimlaneVert', 'UMLSwimlaneHorz', 'UMLCompositeState'];
  isContainerView(v) {
    return DiagramCanvas.CONTAINER_TYPES.includes(v.$type);
  }

  /** smallest container whose bounds contain the point (excluding self) */
  findContainerFor(view) {
    let best = null;
    for (const v of this.diagram.elements || []) {
      if (v.isEdge || v._id === view._id || !this.isContainerView(v)) continue;
      if (new Rect(v.x, v.y, v.width, v.height).contains(
        view.x + view.width / 2, view.y + view.height / 2)) {
        if (!best || v.width * v.height < best.width * best.height) best = v;
      }
    }
    return best;
  }

  /** children (one level) of the given container views */
  childrenOfContainer(containerId, exclude = []) {
    const excluded = new Set(exclude);
    return (this.diagram.elements || []).filter((v) =>
      !v.isEdge && !excluded.has(v._id) && v.container === containerId);
  }

  // ---------------- hit testing ----------------
  hitTest(w) {
    if (!this.diagram) return null;
    const views = this.diagram.elements || [];
    // nodes by box, topmost (last) first — pure geometry, works even before a render.
    // containment containers are skipped here and checked last (children win).
    for (let i = views.length - 1; i >= 0; i--) {
      const v = views[i];
      if (v.isEdge) continue;
      if (v.$type === 'Subject' || v.$type === 'UMLNote' || this.isContainerView(v) || v.$type === 'UMLCombinedFragment') continue;
      let rect = new Rect(v.x, v.y, v.width, v.height);
      if (v.$type === 'UMLActor') rect = new Rect(v.x - 20, v.y, v.width + 40, v.height + 20);
      if (v.$type === 'UMLLifeLine') {
        // head box plus a narrow strip along the lifetime line
        const strip = 6 / this.zoom;
        rect = new Rect(v.x - strip, v.y, v.width + strip * 2, v.height + (v.lifeHeight || 400));
      }
      if (rect.contains(w.x, w.y)) {
        const r = this.renderers.get(v._id);
        return r || { view: v, kind: 'node', meta: { textSlots: {}, compartments: {} }, g: null };
      }
    }
    // edges by distance (needs rendered geometry)
    let best = null, bestD = 6 / this.zoom;
    for (const [, r] of this.renderers) {
      if (r.kind === 'edge') {
        const d = distanceToPolyline(w, r.meta.points);
        if (d <= bestD) { bestD = d; best = r; }
      }
    }
    if (best) return best;
    // big passive containers last
    for (let i = views.length - 1; i >= 0; i--) {
      const v = views[i];
      if (v.isEdge || (v.$type !== 'Subject' && v.$type !== 'UMLNote' && v.$type !== 'UMLCombinedFragment' && !this.isContainerView(v))) continue;
      if (new Rect(v.x, v.y, v.width, v.height).contains(w.x, w.y)) {
        const r = this.renderers.get(v._id);
        return r || { view: v, kind: 'node', meta: { textSlots: {}, compartments: {} }, g: null };
      }
    }
    return null;
  }

  // ---------------- tools ----------------
  setTool(tool) {
    this.tool = tool;
    this.svg.classList.toggle('tool-active', !!tool && tool.id !== 'tool-select');
    document.dispatchEvent(new CustomEvent('tool-changed', { detail: tool }));
  }

  // ---------------- events ----------------
  _bindEvents() {
    const svg = this.svg;
    svg.addEventListener('mousedown', (e) => this._mousedown(e));
    window.addEventListener('mousemove', (e) => this._mousemove(e));
    window.addEventListener('mouseup', (e) => this._mouseup(e));
    svg.addEventListener('dblclick', (e) => this._dblclick(e));
    svg.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    // accept model elements dragged from the Model Explorer
    svg.addEventListener('dragover', (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('application/x-openuml-model')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    svg.addEventListener('drop', (e) => {
      const id = e.dataTransfer && e.dataTransfer.getData('application/x-openuml-model');
      if (!id) return;
      e.preventDefault();
      const model = repository.lookup(id);
      if (model) this.dropModel(model, this.clientToWorld(e));
    });
    svg.addEventListener('mousemove', (e) => {
      const w = this.clientToWorld(e);
      document.getElementById('status-cursor').textContent = `${Math.round(w.x)}, ${Math.round(w.y)}`;
    });
    svg.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('canvas-contextmenu', {
        detail: { world: this.clientToWorld(e), client: { x: e.clientX, y: e.clientY }, hit: this.hitTest(this.clientToWorld(e)) },
      }));
    });
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && repository.selections.length === 1) {        const r = this.renderers.get(repository.selections[0]);
        if (r && r.kind === 'node') {
          e.preventDefault();
          openQuickEdit(this, r.view, repository.lookup(r.view.modelRef));
        }
      }
    });
  }

  _mousedown(e) {
    this.svg.focus();
    if (e.button === 1 || e.altKey) {
      this.drag = { kind: 'pan', startX: e.clientX, startY: e.clientY, panX: this.panX, panY: this.panY };
      this.svg.classList.add('panning');
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    const w = this.clientToWorld(e);
    // handle resize?
    const t = e.target;
    if (t.classList?.contains('op-handle')) {
      const r = this.renderers.get(t.dataset.edge);
      const model = r && repository.lookup(r.view.modelRef);
      if (r && model) {
        const { innerTop, innerH, fractions } = this.fragmentOperandYs(r.view, model);
        const idx = parseInt(t.dataset.opIndex, 10);
        this.drag = {
          kind: 'op-move', view: r.view, model, index: idx, innerTop, innerH,
          orig: fractions.slice(), moved: false,
        };
      }
      return;
    }
    if (t.classList?.contains('handle') && t.classList.contains('wp-handle')) {
      // drag an existing waypoint (or convert a computed bend into one)
      const r = this.renderers.get(t.dataset.edge);
      if (r) {
        // meta.points = [tailAttach, ...waypoints, headAttach]
        const metaIdx = parseInt(t.dataset.wpIndex, 10);
        const wps = r.view.points || [];
        const vidx = metaIdx - 1;
        if (wps[vidx]) {
          this.drag = { kind: 'wp-move', view: r.view, index: vidx, orig: { ...wps[vidx] }, moved: false };
        } else {
          const snapshot = (r.view.points || []).map((p) => ({ ...p }));
          const pt = r.meta.points[metaIdx];
          r.view.points = [{ ...pt }];
          this.drag = { kind: 'wp-move', view: r.view, index: 0, orig: { ...pt }, snapshot, moved: false };
        }
      }
      return;
    }
    if (t.classList?.contains('wp-insert')) {
      // drag a segment midpoint: insert a waypoint there, then move it
      const r = this.renderers.get(t.dataset.edge);
      if (r) {
        const snapshot = (r.view.points || []).map((p) => ({ ...p }));
        const pts = snapshot.map((p) => ({ ...p }));
        const idx = Math.min(parseInt(t.dataset.wpInsert, 10) + 1, pts.length);
        pts.splice(idx, 0, { x: w.x, y: w.y });
        r.view.points = pts;
        this.drag = { kind: 'wp-move', view: r.view, index: idx, orig: { x: w.x, y: w.y }, snapshot };
      }
      return;
    }
    if (t.classList?.contains('handle')) {
      const r = this.renderers.get(t.dataset.node);
      this.drag = { kind: 'resize', handle: t.dataset.handle, view: r.view, orig: { x: r.view.x, y: r.view.y, width: r.view.width, height: r.view.height } };
      return;
    }

    // edge name labels are draggable (StarUML lets you offset relation labels)
    for (const [, r] of this.renderers) {
      if (r.kind !== 'edge' || !r.meta.labels || !r.meta.labels.length) continue;
      const lb = r.meta.labels[0].box;
      if (lb && new Rect(lb.x, lb.y, lb.width, lb.height).contains(w.x, w.y)) {
        if (!repository.selections.includes(r.view._id)) repository.select([r.view._id], repository.lookup(r.view.modelRef));
        this.drag = {
          kind: 'label', view: r.view, start: w, moved: false,
          orig: { ...(r.view.labelOffset || { dx: 0, dy: 0 }) },
        };
        return;
      }
    }

    const hit = this.hitTest(w);

    if (this.tool && this.tool.id !== 'tool-select') {
      this._applyTool(w, hit, e);
      return;
    }

    if (!hit) {
      // rubber band select
      this.drag = { kind: 'marquee', start: w, cur: w, additive: e.shiftKey, base: e.shiftKey ? [...repository.selections] : [] };
      if (!e.shiftKey) repository.select([]);
      return;
    }

    // click on a node/edge
    const id = hit.view._id;
    let sel = [...repository.selections];
    if (e.shiftKey) {
      if (sel.includes(id)) sel = sel.filter((s) => s !== id); else sel.push(id);
    } else if (!sel.includes(id)) {
      sel = [id];
    }
    repository.select(sel, this._primaryModel());
    const selectedViews = sel.map((sid) => this.renderers.get(sid)).filter(Boolean);
    // moving a container drags its children along
    const items = [];
    for (const r of selectedViews) {
      items.push({ view: r.view, orig: { x: r.view.x, y: r.view.y, points: (r.view.points || []).map((p) => ({ ...p })) } });
      if (this.isContainerView(r.view)) {
        for (const child of this.childrenOfContainer(r.view._id, sel)) {
          items.push({ view: child, orig: { x: child.x, y: child.y, points: [] } });
        }
      }
    }
    this.drag = { kind: 'move', start: w, moved: false, items };
  }

  _primaryModel() {
    const id = repository.selections[0];
    const r = id && this.renderers.get(id);
    return r ? repository.lookup(r.view.modelRef) : null;
  }

  _mousemove(e) {
    if (!this.drag) return;
    const d = this.drag;
    if (d.kind === 'pan') {
      this.panX = d.panX + (e.clientX - d.startX);
      this.panY = d.panY + (e.clientY - d.startY);
      this.requestRender();
      return;
    }
    const w = this.clientToWorld(e);
    if (d.kind === 'marquee') {
      d.cur = w;
      this._drawMarquee();
      return;
    }
    if (d.kind === 'move') {
      let dx = w.x - d.start.x, dy = w.y - d.start.y;
      if (this.snapToGrid) {
        const first = d.items[0];
        const nx = snap(first.orig.x + dx, GRID), ny = snap(first.orig.y + dy, GRID);
        dx = nx - first.orig.x; dy = ny - first.orig.y;
      }
      if (Math.abs(dx) + Math.abs(dy) > 0) d.moved = true;
      for (const it of d.items) {
        if (it.view.isMessage) {
          // sequence messages only slide vertically along the lifelines
          it.view.y = it.orig.y + dy;
        } else {
          it.view.x = it.orig.x + dx;
          it.view.y = it.orig.y + dy;
        }
      }
      this.requestRender();
      return;
    }
    if (d.kind === 'resize') {
      const { view, orig, handle } = d;
      let x1 = orig.x, y1 = orig.y, x2 = orig.x + orig.width, y2 = orig.y + orig.height;
      if (handle.includes('w')) x1 = w.x;
      if (handle.includes('e')) x2 = w.x;
      if (handle.includes('n')) y1 = w.y;
      if (handle.includes('s')) y2 = w.y;
      if (this.snapToGrid) { x1 = snap(x1, GRID); y1 = snap(y1, GRID); x2 = snap(x2, GRID); y2 = snap(y2, GRID); }
      const minW = 30, minH = 20;
      view.x = Math.min(x1, x2 - minW);
      view.y = Math.min(y1, y2 - minH);
      view.width = Math.max(minW, Math.abs(x2 - x1));
      view.height = Math.max(minH, Math.abs(y2 - y1));
      this.requestRender();
      return;
    }
    if (d.kind === 'connect') {
      d.cur = w;
      this._drawConnectPreview(d);
      return;
    }
    if (d.kind === 'wp-move') {
      const pts = d.view.points || (d.view.points = []);
      if (!pts[d.index]) return;
      pts[d.index] = this.snapToGrid ? { x: snap(w.x, GRID), y: snap(w.y, GRID) } : { x: w.x, y: w.y };
      d.moved = true;
      this.requestRender();
      return;
    }
    if (d.kind === 'label') {
      d.view.labelOffset = {
        dx: Math.round(d.orig.dx + (w.x - d.start.x)),
        dy: Math.round(d.orig.dy + (w.y - d.start.y)),
      };
      d.moved = true;
      this.requestRender();
      return;
    }
    if (d.kind === 'op-move') {
      const lo = d.index === 0 ? 0.03 : d.orig[d.index - 1] + 0.03;
      const hi = d.index === d.orig.length - 1 ? 0.97 : d.orig[d.index + 1] - 0.03;
      const f = Math.min(hi, Math.max(lo, (w.y - d.innerTop) / d.innerH));
      const next = d.orig.slice();
      next[d.index] = f;
      d.model.operandBoundaries = next;
      d.moved = true;
      this.requestRender();
      return;
    }
  }

  _drawMarquee() {
    this.overlayLayer.querySelectorAll('.marquee').forEach((n) => n.remove());
    const d = this.drag;
    const r = Rect.fromPoints([d.start, d.cur]);
    svgEl('rect', {
      x: r.x, y: r.y, width: r.width, height: r.height, class: 'selection-rect marquee',
      'stroke-width': 1 / this.zoom, 'vector-effect': 'non-scaling-stroke',
    }, this.overlayLayer);
  }

  _drawConnectPreview(d) {
    this.overlayLayer.querySelectorAll('.connect-preview').forEach((n) => n.remove());
    const tailR = this.renderers.get(d.tailId);
    if (!tailR) return;
    const tailRect = new Rect(tailR.view.x, tailR.view.y, tailR.view.width, tailR.view.height);
    const hit = this.hitTest(d.cur);
    let headRect = null;
    if (hit && hit.kind === 'node' && hit.view._id !== d.tailId) {
      headRect = new Rect(hit.view.x, hit.view.y, hit.view.width, hit.view.height);
      d.hoverTarget = hit.view._id;
    } else {
      headRect = new Rect(d.cur.x - 1, d.cur.y - 1, 2, 2);
      d.hoverTarget = null;
    }
    const geo = computeEdgeGeometry({ points: [], lineStyle: 'dashed' }, tailRect, headRect);
    const dstr = geo.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    svgEl('path', {
      d: dstr, fill: 'none', stroke: '#1390d6', 'stroke-dasharray': '5 4',
      'stroke-width': 1.4 / this.zoom, 'vector-effect': 'non-scaling-stroke', class: 'connect-preview',
    }, this.overlayLayer);
  }

  _mouseup(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.svg.classList.remove('panning');

    if (d.kind === 'pan') return;

    if (d.kind === 'marquee') {
      this.overlayLayer.querySelectorAll('.marquee').forEach((n) => n.remove());
      const r = Rect.fromPoints([d.start, d.cur]);
      const ids = d.base.slice();
      for (const [, rr] of this.renderers) {
        const v = rr.view;
        const box = rr.kind === 'node'
          ? new Rect(v.x, v.y, v.width, v.height)
          : Rect.fromPoints(rr.meta.points);
        if (r.intersect(box).width > 0 || r.intersect(box).height > 0 || r.contains(box.cx, box.cy)) {
          if (!ids.includes(v._id)) ids.push(v._id);
        }
      }
      repository.select(ids, this._primaryModel());
      return;
    }

    if (d.kind === 'move') {
      if (d.moved) {
        // reassign containment: moved nodes land in whichever container covers them
        const containerChanges = [];
        for (const it of d.items) {
          const v = it.view;
          if (v.isEdge || this.isContainerView(v)) continue;
          const target = this.findContainerFor(v);
          const from = v.container || null;
          const to = target ? target._id : null;
          if (from !== to) containerChanges.push({ v, from, to });
        }
        commandStack.pushExecuted({
          label: 'move',
          redo: () => {
            for (const it of d.items) { it.view.x = it.newX; it.view.y = it.newY; }
            for (const ch of containerChanges) ch.v.container = ch.to;
            this.requestRender();
          },
          undo: () => {
            for (const it of d.items) { it.view.x = it.orig.x; it.view.y = it.orig.y; }
            for (const ch of containerChanges) ch.v.container = ch.from;
            this.requestRender();
          },
        });
        for (const it of d.items) { it.newX = it.view.x; it.newY = it.view.y; }
      }
      this.requestRender();
      return;
    }

    if (d.kind === 'resize') {
      const { view, orig } = d;
      const nw = { x: view.x, y: view.y, width: view.width, height: view.height };
      commandStack.pushExecuted({
        label: 'resize',
        redo: () => { Object.assign(view, nw); this.requestRender(); },
        undo: () => { Object.assign(view, orig); this.requestRender(); },
      });
      this.requestRender();
      return;
    }

    if (d.kind === 'label') {
      if (d.moved) {
        const view = d.view;
        const after = { ...view.labelOffset };
        const before = { ...d.orig };
        commandStack.pushExecuted({
          label: 'move label',
          redo: () => { view.labelOffset = { ...after }; this.requestRender(); },
          undo: () => { view.labelOffset = { ...before }; this.requestRender(); },
        });
      }
      this.requestRender();
      return;
    }

    if (d.kind === 'op-move') {
      if (d.moved) {
        const model = d.model;
        const after = (model.operandBoundaries || []).slice();
        const before = d.orig.slice();
        commandStack.pushExecuted({
          label: 'move operand',
          redo: () => { model.operandBoundaries = after.slice(); this.requestRender(); },
          undo: () => { model.operandBoundaries = before.slice(); this.requestRender(); },
        });
        this.setStatusMessage('已调整操作数分隔');
      }
      this.requestRender();
      return;
    }

    if (d.kind === 'wp-move') {
      if (d.moved) {
        const target = d.view;
        const index = d.index;
        const origPt = { ...d.orig };
        const final = (target.points || []).map((p) => ({ ...p }));
        const before = d.snapshot ? d.snapshot.map((p) => ({ ...p })) : null;
        commandStack.pushExecuted({
          label: d.snapshot ? 'add waypoint' : 'move waypoint',
          redo: () => { target.points = final.map((p) => ({ ...p })); this.requestRender(); },
          undo: () => {
            target.points = before
              ? before.map((p) => ({ ...p }))
              : target.points.map((p, i) => (i === index ? { ...origPt } : { ...p }));
            this.requestRender();
          },
        });
        this.setStatusMessage(d.snapshot ? '已添加拐点' : '已移动拐点');
      } else if (d.snapshot) {
        // click without drag on an insert handle: revert the tentative waypoint
        d.view.points = d.snapshot.map((p) => ({ ...p }));
      }
      this.requestRender();
      return;
    }

    if (d.kind === 'connect') {
      this.overlayLayer.querySelectorAll('.connect-preview').forEach((n) => n.remove());
      // Recompute the target from the actual mouseup point; mousemove may not
      // have delivered a preview for fast or synthetic drags.
      const up = this.clientToWorld(e);
      const hit = this.hitTest(up);
      const allowSelf = d.edgeType === 'UMLSelfTransition' || d.edgeType === 'UMLSelfMessage';
      const targetId = (hit && hit.kind === 'node' && (allowSelf || hit.view._id !== d.tailId)) ? hit.view._id : d.hoverTarget;
      if (targetId) {
        d.onComplete(targetId, up);
      }
    }
  }

  _wheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    if (e.ctrlKey || e.metaKey || !e.shiftKey) {
      const r = this.svg.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const wx = (mx - this.panX) / this.zoom, wy = (my - this.panY) / this.zoom;
      this.zoom = Math.min(4, Math.max(0.2, this.zoom * factor));
      this.panX = mx - wx * this.zoom;
      this.panY = my - wy * this.zoom;
      this._zoomChanged();
    }
  }

  _zoomChanged() {
    const pct = Math.round(this.zoom * 100) + '%';
    document.getElementById('tb-zoom-label').textContent = pct;
    document.getElementById('status-zoom').textContent = pct;
    this.requestRender();
  }

  zoomIn() { this.zoom = Math.min(4, this.zoom * 1.2); this._zoomChanged(); }
  zoomOut() { this.zoom = Math.max(0.2, this.zoom / 1.2); this._zoomChanged(); }
  zoomFit() {
    if (!this.diagram || !this.diagram.elements.length) { this.zoom = 1; this.panX = this.panY = 40; this._zoomChanged(); return; }
    const pts = [];
    for (const v of this.diagram.elements) {
      if (v.isEdge) continue;
      const h = v.$type === 'UMLLifeLine' ? v.height + (v.lifeHeight || 400) : v.height;
      pts.push({ x: v.x, y: v.y }, { x: v.x + v.width, y: v.y + h });
    }
    const r = Rect.fromPoints(pts);
    // account for the diagram frame margin drawn around the content
    r.x -= 40; r.y -= 40; r.width += 70; r.height += 70;
    const w = this.svg.clientWidth, h = this.svg.clientHeight;
    const margin = 50;
    this.zoom = Math.min(4, Math.max(0.2, Math.min((w - margin * 2) / r.width, (h - margin * 2) / r.height)));
    this.panX = (w - r.width * this.zoom) / 2 - r.x * this.zoom;
    this.panY = (h - r.height * this.zoom) / 2 - r.y * this.zoom;
    this._zoomChanged();
  }

  _dblclick(e) {
    const w = this.clientToWorld(e);
    const hit = this.hitTest(w);
    if (!hit) { closeQuickEdit(); return; }
    const { view, meta } = hit;
    // StarUML behavior: double-clicking an element opens its QuickEdit popup
    if (hit.kind === 'node') {
      const model = repository.lookup(view.modelRef);
      openQuickEdit(this, view, model);
      return;
    }
    // edges: edit the name label in place
    if (hit.kind === 'edge') {
      if (view.$type === 'UMLConnector') {
        openConnectorEdit(this, view);
        return;
      }
      const model = repository.lookup(view.modelRef);
      if (model) {
        const label = (meta.labels && meta.labels[0]) || null;
        const mid = meta.points ? meta.points[Math.floor(meta.points.length / 2)] : w;
        const box = label ? label.box : new Rect(mid.x - 40, mid.y - 18, 80, 16);
        this._editText(view, { box, text: model.name, field: 'name', align: 'center' }, e);
      }
      return;
    }
  }

  _editText(view, slot, e) {
    // remove old editor
    this._closeTextEditor();
    const host = document.createElement('input');
    host.className = 'text-editor-host';
    host.value = slot.text;
    const r = this.svg.getBoundingClientRect();
    const sx = (p) => r.left + p.x * this.zoom + this.panX;
    const sy = (p) => r.top + p.y * this.zoom + this.panY;
    Object.assign(host.style, {
      position: 'fixed',
      left: sx(slot.box) + 'px',
      top: sy(slot.box) + 'px',
      width: Math.max(60, slot.box.width * this.zoom) + 'px',
      height: Math.max(16, (slot.box.height) * this.zoom) + 'px',
    });
    if (slot.align === 'center') host.style.textAlign = 'center';
    document.body.appendChild(host);
    host.focus();
    host.select();
    this._textEditor = { host, view, slot };
    const commit = () => {
      const val = host.value.trim();
      const model = repository.lookup(view.modelRef);
      this._closeTextEditor();
      if (val === slot.text) return;
      if (model) {
        const old = model[slot.field];
        commandStack.exec({
          label: 'rename',
          redo: () => { model[slot.field] = val; },
          undo: () => { model[slot.field] = old; },
        });
      } else {
        // view-only element (swimlane / text shape): the field lives on the view
        const old = view[slot.field];
        commandStack.exec({
          label: 'rename',
          redo: () => { view[slot.field] = val; },
          undo: () => { view[slot.field] = old; },
        });
      }
    };
    host.addEventListener('blur', commit);
    host.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') { ev.preventDefault(); host.blur(); }
      if (ev.key === 'Escape') { host.removeEventListener('blur', commit); this._closeTextEditor(); }
      ev.stopPropagation();
    });
  }

  _closeTextEditor() {
    if (this._textEditor) {
      this._textEditor.host.remove();
      this._textEditor = null;
    }
  }

  // ---------------- tool application ----------------
  _applyTool(w, hit, e) {
    const tool = this.tool;
    if (tool.kind === 'node') {
      this.createNodeAt(tool.nodeType, w, e);
      this.setTool(null); // StarUML keeps tool for repeat; single-shot is friendlier
    } else if (tool.kind === 'edge') {
      // require a tail node; drag to head
      if (!hit || hit.kind !== 'node') {
        this.setStatusMessage('请从一个模型元素拖拽到另一个元素');
        return;
      }
      const d = {
        kind: 'connect',
        tailId: hit.view._id,
        cur: w,
        edgeType: tool.edgeType,
        allowLoose: false,
        onComplete: (headId, upPoint) => {
          this.createEdge(tool.edgeType, d.tailId, headId, upPoint);
          this.setTool(null);
        },
      };
      this.drag = d;
    } else if (tool.id === 'tool-note') {
      this.createNodeAt('UMLNote', w, e);
      this.setTool(null);
    }
  }

  createNodeAt(nodeType, w, e) {
    if (!this.diagram) return;
    let x = w.x, y = w.y;
    if (this.snapToGrid) { x = snap(x, GRID); y = snap(y, GRID); }
    let model, view;
    if (nodeType === 'UMLNote') {
      model = createModel('UMLNote', 'Note');
      model.documentation = '';
      view = createNodeView('UMLNote', model._id, x, y);
    } else if (nodeType === 'Subject') {
      model = createModel('UMLUseCaseSubject', 'System');
      view = createNodeView('Subject', model._id, x, y, { width: 340, height: 300 });
    } else if (nodeType === 'UMLTextView' || nodeType === 'UMLRectView' || nodeType === 'UMLRoundRectView' || nodeType === 'UMLEllipseView') {
      // view-only annotation shapes: no model element behind them
      model = null;
      view = createNodeView(nodeType, '', x, y);
      if (nodeType === 'UMLTextView') {
        view.text = 'Text';
        view.width = 100; view.height = 24;
      }
    } else {
      model = createModel(nodeType);
      view = createNodeView(nodeType, model._id, x, y);
    }
    const parentModel = this._defaultOwnerFor(model);
    const diagram = this.diagram; // capture: undo/redo must target the owning diagram
    const ops = [];
    if (model) {
      ops.push({ redo: () => repository.addChild(parentModel, model), undo: () => repository.removeChild(model) });
    }
    const target = this.findContainerFor(view);
    const toContainer = target ? target._id : null;
    ops.push({
      redo: () => { diagram.elements.push(view); view.__diagram = diagram; view.container = toContainer; repository._reindex(); },
      undo: () => {
        const i = diagram.elements.indexOf(view);
        if (i >= 0) diagram.elements.splice(i, 1);
        repository._reindex();
      },
    });
    compound('create', ops);
    repository.select([view._id], model);
    this.setStatusMessage(`已创建 ${model ? model.name : nodeType.replace(/^UML/, '').replace(/View$/, '')}`);
  }

  _defaultOwnerFor(model) {
    // place new model elements under first Model/Package ancestor of the diagram
    let p = this.diagram.__parent;
    while (p) {
      if (p.type === 'Model' || p.type === 'Package' || p.type === 'Project') return p;
      p = p.__parent;
    }
    return this.diagram;
  }

  createEdge(edgeType, tailId, headId, upPoint = null) {
    if (!this.diagram) return;
    const tailV = repository.lookup(tailId), headV = repository.lookup(headId);
    // view-only connectors: note link, containment, communication links
    if (edgeType === 'UMLNoteLink' || edgeType === 'UMLContainment' || edgeType === 'UMLConnector' || edgeType === 'UMLLinkMessage') {
      const diagram = this.diagram;
      const requested = edgeType;
      if (requested === 'UMLLinkMessage') {
        // communication-diagram message: append to an existing link if one connects the pair
        const existing = diagram.elements.find((v) => v.$type === 'UMLConnector' &&
          ((v.tail === tailId && v.head === headId) || (v.tail === headId && v.head === tailId)));
        if (existing) {
          const msgs = (existing.messages || []);
          const next = [...msgs, { text: '' }];
          commandStack.exec({
            label: 'add message',
            redo: () => { existing.messages = next; },
            undo: () => { existing.messages = msgs; },
          });
          repository.select([existing._id], null);
          this.setStatusMessage(`已添加消息 ${msgs.length + 1}（双击连线编辑文本）`);
          return;
        }
        edgeType = 'UMLConnector';
      }
      const view = createEdgeView(edgeType, '', tailId, headId);
      view.messages = requested === 'UMLLinkMessage' ? [{ text: '' }] : [];
      compound('connect', [{
        redo: () => { diagram.elements.push(view); view.__diagram = diagram; repository._reindex(); },
        undo: () => {
          const i = diagram.elements.indexOf(view);
          if (i >= 0) diagram.elements.splice(i, 1);
          repository._reindex();
        },
      }]);
      repository.select([view._id], null);
      this.setStatusMessage(requested === 'UMLLinkMessage' || requested === 'UMLConnector'
        ? '已添加链接（双击连线编辑消息）'
        : '已连接');
      return;
    }
    const tailM = repository.lookup(tailV.modelRef), headM = repository.lookup(headV.modelRef);
    let modelType = edgeType;
    let extra = {};
    if (edgeType === 'UMLAssociation+directed') modelType = 'UMLAssociation';
    if (edgeType === 'UMLAssociation+aggregation' || edgeType === 'UMLAssociation+composition') {
      modelType = 'UMLAssociation';
      extra = { end1: edgeType.endsWith('aggregation') ? 'shared' : 'composite' };
    }
    if (edgeType.startsWith('UMLMessage')) modelType = 'UMLMessage';
    if (edgeType === 'UMLSelfTransition') modelType = 'UMLTransition';
    if (edgeType === 'UMLSelfTransition') edgeType = 'UMLTransition';
    const model = createModel(modelType, modelType === 'UMLMessage' ? undefined : '', extra);
    model.end1ReferenceId = tailM._id;
    model.end2ReferenceId = headM._id;
    // StarUML names associations after member ends; keep empty unless named
    const view = createEdgeView(edgeType, model._id, tailId, headId);
    if (edgeType === 'UMLAssociation+aggregation') view.tailArrow = 'hollowDiamond';
    if (edgeType === 'UMLAssociation+composition') view.tailArrow = 'filledDiamond';
    if (edgeType === 'UMLAssociation+directed') view.headArrow = 'open';
    if (modelType === 'UMLMessage') {
      // message arrow sits at the vertical position where the drag ended
      view.y = upPoint ? (this.snapToGrid ? snap(upPoint.y, GRID) : upPoint.y) : tailV.y + tailV.height + 40;
      view.tailArrow = 'none';
    }
    const parentModel = this._defaultOwnerFor(model);
    const diagram = this.diagram; // capture: undo/redo must target the owning diagram
    // association belongs under tail model's owner for semantic correctness; keep simple
    compound('connect', [
      { redo: () => repository.addChild(parentModel, model), undo: () => repository.removeChild(model) },
      {
        redo: () => { diagram.elements.push(view); view.__diagram = diagram; repository._reindex(); },
        undo: () => {
          const i = diagram.elements.indexOf(view);
          if (i >= 0) diagram.elements.splice(i, 1);
          repository._reindex();
        },
      },
    ]);
    repository.select([view._id], model);
    this.setStatusMessage(modelType === 'UMLMessage'
      ? `已添加消息 ${tailM.name} → ${headM.name}`
      : `已连接 ${tailM.name} → ${headM.name}`);
  }

  /** Place a view of an existing model element on the active diagram (drag & drop). */
  dropModel(model, w) {
    if (!this.diagram) return;
    const viewType = {
      UMLClass: 'UMLClass', UMLInterface: 'UMLInterface', UMLEnumeration: 'UMLEnumeration',
      UMLDataType: 'UMLDataType', UMLPackage: 'UMLPackage', UMLActor: 'UMLActor',
      UMLUseCase: 'UMLUseCase', UMLState: 'UMLState', UMLCompositeState: 'UMLCompositeState',
      UMLAction: 'UMLAction', UMLComponent: 'UMLComponent', UMLArtifact: 'UMLArtifact',
      UMLNode: 'UMLNode', UMLObject: 'UMLObject', UMLSubsystem: 'UMLSubsystem',
      UMLObjectNode: 'UMLObjectNode', UMLSendSignal: 'UMLSendSignal', UMLAcceptSignal: 'UMLAcceptSignal',
      UMLLifeLine: 'UMLLifeLine', UMLNote: 'UMLNote',
    }[model.type];
    if (!viewType) {
      this.setStatusMessage(`${model.type} 不能放到图表中`);
      return;
    }
    let x = w.x, y = w.y;
    if (this.snapToGrid) { x = snap(x, GRID); y = snap(y, GRID); }
    const extra = viewType === 'UMLLifeLine' ? { lifeHeight: 360 } : {};
    const view = createNodeView(viewType, model._id, x, y, extra);
    const diagram = this.diagram;
    const target = this.findContainerFor(view);
    const toContainer = target ? target._id : null;
    compound('drop view', [{
      redo: () => { diagram.elements.push(view); view.__diagram = diagram; view.container = toContainer; repository._reindex(); },
      undo: () => {
        const i = diagram.elements.indexOf(view);
        if (i >= 0) diagram.elements.splice(i, 1);
        repository._reindex();
      },
    }]);
    repository.select([view._id], model);
    this.setStatusMessage(`已将 ${model.name} 放入图表`);
  }

  setStatusMessage(msg) {
    const el = document.getElementById('status-message');
    if (el) el.textContent = msg;
  }

  // ---------------- editing operations used by menus ----------------
  deleteSelection() {
    const ids = [...repository.selections];
    if (!ids.length || !this.diagram) return;
    const diagram = this.diagram; // capture: undo/redo must target the owning diagram
    const els = diagram.elements || [];
    // selected views plus the edges attached to them (same diagram)
    const removeIds = new Set(ids.filter((id) => els.some((v) => v._id === id)));
    let changed = true;
    while (changed) {
      changed = false;
      for (const v of els) {
        if (v.isEdge && !removeIds.has(v._id) && (removeIds.has(v.tail) || removeIds.has(v.head))) {
          removeIds.add(v._id);
          changed = true;
        }
      }
    }
    const removals = [];
    els.forEach((v, i) => {
      if (removeIds.has(v._id)) removals.push({ view: v, index: i, container: v.container || null });
    });
    if (!removals.length) return;
    const released = [];
    for (const r of removals) {
      if (!this.isContainerView(r.view)) continue;
      for (const ch of els) if (ch.container === r.view._id) released.push({ parent: r.view, child: ch });
    }
    removals.sort((a, b) => b.index - a.index);
    commandStack.exec({
      label: 'delete views',
      redo: () => {
        for (const r of removals) {
          const i = diagram.elements.indexOf(r.view);
          if (i >= 0) diagram.elements.splice(i, 1);
        }
        for (const rel of released) rel.child.container = null;
        repository.select([]);
        this.requestRender();
      },
      undo: () => {
        for (const r of [...removals].sort((a, b) => a.index - b.index)) {
          diagram.elements.splice(Math.min(r.index, diagram.elements.length), 0, r.view);
          r.view.container = r.container;
        }
        for (const rel of released) rel.child.container = rel.parent._id;
        this.requestRender();
      },
    });
    this.setStatusMessage('已从图表中删除（模型元素保留）');
  }

  deleteSelectionDeep() {
    const ids = [...repository.selections];
    if (!ids.length || !this.diagram) return;
    const selected = ids.map((id) => repository.lookup(id)).filter(Boolean);
    const modelSet = new Set();
    const models = [];
    for (const v of selected) {
      const m = repository.lookup(v.modelRef);
      if (m && m.__parent && !modelSet.has(m._id)) { modelSet.add(m._id); models.push(m); }
    }
    // view-only selection (text/rect/swimlane...): just delete the views
    if (!models.length) { this.deleteSelection(); return; }

    // 1) every diagram in the project (views live on diagram nodes)
    const diagrams = [];
    repository.walk((n) => { if (Array.isArray(n.elements)) diagrams.push(n); });

    // 2) all views of the deleted models, across all diagrams
    const removedIds = new Set();
    for (const d of diagrams) {
      for (const v of d.elements || []) {
        if (v.modelRef && modelSet.has(v.modelRef)) removedIds.add(v._id);
      }
    }
    // 3) edges attached to removed views (dangling relations are meaningless)
    let changed = true;
    while (changed) {
      changed = false;
      for (const d of diagrams) {
        for (const v of d.elements || []) {
          if (v.isEdge && !removedIds.has(v._id) && (removedIds.has(v.tail) || removedIds.has(v.head))) {
            removedIds.add(v._id);
            changed = true;
          }
        }
      }
    }
    // 4) edge models of removed edge views, so the model tree keeps no dangling relations
    const extraModels = [];
    for (const d of diagrams) {
      for (const v of d.elements || []) {
        if (!removedIds.has(v._id) || !v.isEdge || !v.modelRef) continue;
        const em = repository.lookup(v.modelRef);
        if (em && em.__parent && !modelSet.has(em._id) && !extraModels.includes(em)) extraModels.push(em);
      }
    }

    // 5) collect view removals per diagram with original indices
    const removals = [];
    for (const d of diagrams) {
      (d.elements || []).forEach((v, i) => {
        if (removedIds.has(v._id)) removals.push({ diagram: d, view: v, index: i, container: v.container || null });
      });
    }
    const released = [];
    for (const d of diagrams) {
      for (const v of d.elements || []) {
        if (v.container && removedIds.has(v.container)) released.push({ containerId: v.container, child: v });
      }
    }

    const allModels = [...models, ...extraModels];
    const fns = [];
    const undoFns = [];
    // remove models
    for (const m of allModels) {
      if (!m.__parent) continue;
      const parent = m.__parent;
      const idx = parent.ownedElements.indexOf(m);
      fns.push(() => repository.removeChild(m));
      undoFns.push(() => repository.addChild(parent, m, idx));
    }
    // remove views (descending index per diagram)
    const byDiagram = new Map();
    for (const r of removals) {
      if (!byDiagram.has(r.diagram)) byDiagram.set(r.diagram, []);
      byDiagram.get(r.diagram).push(r);
    }
    for (const [diag, list] of byDiagram) {
      list.sort((a, b) => b.index - a.index);
      fns.push(() => {
        for (const r of list) {
          const i = diag.elements.indexOf(r.view);
          if (i >= 0) diag.elements.splice(i, 1);
        }
      });
      undoFns.push(() => {
        for (const r of [...list].sort((a, b) => a.index - b.index)) {
          diag.elements.splice(Math.min(r.index, diag.elements.length), 0, r.view);
          r.view.container = r.container;
        }
      });
    }
    fns.push(() => { for (const rel of released) rel.child.container = null; });
    undoFns.push(() => { for (const rel of released) rel.child.container = rel.containerId; });

    commandStack.exec({
      label: 'delete model',
      redo: () => { for (const fn of fns) fn(); repository.select([]); this.requestRender(); },
      undo: () => { for (const fn of undoFns) fn(); this.requestRender(); },
    });
    this.setStatusMessage(`已从模型删除（移除 ${removals.length} 个视图）`);
  }

  bringToFront() { this._reorder(true); }
  sendToBack() { this._reorder(false); }
  _reorder(front) {
    const els = this.diagram.elements;
    const selected = els.filter((v) => repository.selections.includes(v._id));
    if (!selected.length) return;
    commandStack.exec({
      label: 'reorder',
      redo: () => {
        for (const v of selected) { const i = els.indexOf(v); if (i >= 0) els.splice(i, 1); }
        if (front) els.push(...selected); else els.unshift(...selected);
        this.requestRender();
      },
      undo: () => { this.requestRender(); },
    });
  }
}
