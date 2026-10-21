// edgeviews.js — SVG rendering for UML relationships with UML arrowheads

import { svgEl, TIMING_LANE_LABEL_W } from './nodeviews.js';
import { borderIntersect, orthogonalRoute, routeAvoiding, Rect } from '../core/geometry.js';

function dashArray(style) {
  if (style === 'dashed') return '6 4';
  if (style === 'dotted') return '2 3';
  return 'none';
}

const ARROW = {
  none: null,
  open: { size: 9, filled: false, stroke: 1.4 },
  hollowTriangle: { size: 11, filled: false, closed: true },
  filledTriangle: { size: 11, filled: true, closed: true },
  hollowDiamond: { size: 13, filled: false, closed: true },
  filledDiamond: { size: 13, filled: true, closed: true },
};

/**
 * Found/Lost message: one end is a small filled circle (the message endpoint)
 * instead of a lifeline.
 */
export function renderEndpointMessage(g, view, model, lifelineView) {
  const y = view.y;
  const isFound = view.$type === 'UMLMessage+found';
  const cx = lifelineView.x + lifelineView.width / 2;
  const ex = (view.endpointX != null)
    ? view.endpointX
    : (isFound ? lifelineView.x - 150 : lifelineView.x + lifelineView.width + 150);
  const line = view.lineColor || '#353535';
  const fs = view.fontSize || 11;
  const points = isFound ? [{ x: ex, y }, { x: cx, y }] : [{ x: cx, y }, { x: ex, y }];
  const meta = { labels: [], points };

  // filled endpoint circle
  svgEl('circle', { cx: ex, cy: y, r: 4.5, fill: '#353535', stroke: '#353535', class: 'msg-endpoint' }, g);
  // line from the circle edge to the lifeline
  const d = isFound
    ? `M ${ex + 4.5} ${y} L ${cx} ${y}`
    : `M ${cx} ${y} L ${ex - 4.5} ${y}`;
  svgEl('path', {
    d, fill: 'none', stroke: line, 'stroke-width': 1,
    'stroke-dasharray': dashArray(view.lineStyle),
    class: 'edge-path',
  }, g);
  // arrowhead: found → open arrow at the lifeline; lost → open arrow at the circle
  const def = ARROW.open;
  if (isFound) {
    svgEl('path', { d: arrowPath(cx, y, 0, def), fill: 'none', stroke: line, 'stroke-width': def.stroke || 1.3, class: 'edge-head' }, g);
  } else {
    svgEl('path', { d: arrowPath(ex - 5, y, Math.PI, def), fill: 'none', stroke: line, 'stroke-width': def.stroke || 1.3, class: 'edge-head' }, g);
  }
  const labelParts = [];
  if (view.stereotype) labelParts.push(view.stereotype);
  if (model?.name) labelParts.push(model.name);
  if (labelParts.length) {
    const mid = { x: (ex + cx) / 2, y };
    const t = svgEl('text', { x: mid.x, y: y - 6, 'text-anchor': 'middle', 'font-size': fs, fill: view.fontColor || '#353535', 'font-style': 'italic' }, g);
    t.textContent = labelParts.join(' ');
    const textW = Math.max(50, t.textContent.length * fs * 0.55);
    meta.labels.push({ el: t, kind: 'name', field: 'labelOffset', box: { x: mid.x - textW / 2, y: y - fs - 8, width: textW, height: fs + 4 } });
  }
  return meta;
}

export function renderSelfLoop(g, edge, model, rect) {
  const line = edge.lineColor || '#353535';
  const fs = edge.fontSize || 11;
  const x2 = rect.x + rect.width, ym = rect.y + Math.min(24, rect.height / 2);
  const out = 34;
  const points = [
    { x: x2, y: ym - 8 },
    { x: x2 + out, y: ym - 8 },
    { x: x2 + out, y: ym - 26 },
    { x: x2, y: ym - 26 },
  ];
  const d = buildEdgePath(points, edge.lineMode);
  svgEl('path', {
    d, fill: 'none', stroke: line, 'stroke-width': 1,
    'stroke-dasharray': dashArray(edge.lineStyle),
    class: 'edge-path',
  }, g);
  // arrowhead pointing back into the node's right edge (westward)
  const def = ARROW[edge.headArrow] || ARROW.open;
  if (def) {
    if (def.closed) {
      svgEl('path', { d: arrowPath(points[3].x, points[3].y, Math.PI, def), fill: def.filled ? line : '#fff', stroke: line, 'stroke-width': 1, class: 'edge-head' }, g);
    } else {
      svgEl('path', { d: arrowPath(points[3].x, points[3].y, Math.PI, def), fill: 'none', stroke: line, 'stroke-width': def.stroke || 1.3, class: 'edge-head' }, g);
    }
  }
  const labelParts = [];
  if (edge.stereotype) labelParts.push(edge.stereotype);
  if (edge.$type !== 'UMLLinkObject' && edge.nameVisible !== false && model?.name) labelParts.push(model.name);
  if (model?.type === 'UMLInformationFlow' && (model.conveyed || []).length) {
    const conveyed = model.conveyed.map((c) => c.name).filter(Boolean);
    if (conveyed.length) labelParts.push(conveyed.join(', '));
  }
  // ERD reference/relationship: cardinalities near each end
  if (edge.$type === 'ERDReference' || edge.$type === 'ERDRelationship') {
    const card = (text, end, before) => {
      if (!text) return;
      const side = end.x <= mid.x ? 'start' : 'end';
      const t = svgEl('text', {
        x: end.x + (side === 'start' ? 8 : -8), y: end.y - 6,
        'text-anchor': side, 'font-size': fs, fill: fontColor,
      }, g);
      t.textContent = text;
    };
    card(edge.tailCardinality, tailEnd);
    card(edge.headCardinality, headEnd);
  }
  if (edge.$type === 'UMLExtension' && model?.multiplicity) {
    const mt = svgEl('text', {
      x: headEnd.x, y: headEnd.y - fs - 6, 'text-anchor': 'middle',
      'font-size': fs, fill: fontColor,
    }, g);
    mt.textContent = model.multiplicity;
  }
  if (labelParts.length) {
    const t = svgEl('text', { x: x2 + out + 6, y: ym - 28, 'font-size': fs, fill: edge.fontColor || '#353535' }, g);
    t.textContent = labelParts.join(' ');
  }
  return { labels: [], points };
}

/**
 * Sequence-diagram message: horizontal arrow between two lifelines at view.y.
 * Returns meta with the point list so hit-testing and dragging work like edges.
 */
export function renderMessage(g, view, model, tailView, headView, opts = {}) {
  const y = view.y;
  const line = view.lineColor || '#353535';
  const fs = view.fontSize || 11;
  const meta = { labels: [], points: [] };
  const isSelf = tailView._id === headView._id;
  // when an activation bar covers the message y, the line starts/ends at the
  // bar's edge instead of the lifeline center (avoids drawing through the bar)
  const covered = (spans) => (spans || []).some((sp) => y >= sp.start - 1 && y <= sp.end + 1);
  const ACTIVATION_HALF = 5; // activation bar is 10px wide, centered on the lifeline
  const barShift = (spans) => covered(spans) ? ACTIVATION_HALF : 0;

  if (isSelf) {
    // self-message: rectangular loop out to the right and back
    const x = tailView.x + tailView.width / 2 + barShift(opts.tailSpans);
    const loop = 40, rise = 24;
    meta.points = [{ x, y }, { x: x + loop, y }, { x: x + loop, y: y - rise }, { x, y: y - rise }];
    svgEl('path', {
      d: `M ${x} ${y} L ${x + loop} ${y} L ${x + loop} ${y - rise} L ${x + 8} ${y - rise}`,
      fill: 'none', stroke: line, 'stroke-width': 1,
      'stroke-dasharray': dashArray(view.lineStyle),
      class: 'edge-path',
    }, g);
    const def = ARROW[view.headArrow] || ARROW.open;
    if (def) {
      if (def.closed) {
        svgEl('path', { d: arrowPath(x + 2, y - rise, Math.PI, def), fill: def.filled ? line : '#fff', stroke: line, 'stroke-width': 1, class: 'edge-head' }, g);
      } else {
        svgEl('path', { d: arrowPath(x + 2, y - rise, Math.PI, def), fill: 'none', stroke: line, 'stroke-width': def.stroke || 1.3, class: 'edge-head' }, g);
      }
    }
    const name = model?.name || '';
    if (name) {
      const t = svgEl('text', { x: x + loop / 2 + 10, y: y - rise - 6, 'text-anchor': 'middle', 'font-size': fs, fill: view.fontColor || '#353535' }, g);
      t.textContent = name;
      meta.labels.push({ el: t, kind: 'name', field: 'labelOffset', box: { x: x + loop / 2 - 40, y: y - rise - fs - 8, width: 100, height: fs + 4 } });
    }
    return meta;
  }

  const tailX = tailView.x + tailView.width / 2 + barShift(opts.tailSpans);
  const isCreate = view.$type === 'UMLMessage+create';
  const isDelete = view.$type === 'UMLMessage+delete';
  // StarUML attaches a create message to the left/right edge of the target
  // lifeline head, not to its center line
  let headX = headView.x + headView.width / 2 - barShift(opts.headSpans);
  if (isCreate) {
    const headCenter = headView.x + headView.width / 2;
    headX = tailX <= headCenter ? headView.x : headView.x + headView.width;
  }

  const points = [{ x: tailX, y }, { x: headX, y }];
  meta.points = points;

  svgEl('path', {
    d: `M ${tailX} ${y} L ${headX} ${y}`,
    fill: 'none', stroke: line, 'stroke-width': 1,
    'stroke-dasharray': dashArray(view.lineStyle),
    class: 'edge-path',
  }, g);
  // arrowhead pointing into the head lifeline
  const angle = Math.atan2(0, headX - tailX); // 0 or PI depending on direction
  const def = ARROW[view.headArrow] || ARROW.open;
  if (def) {
    if (def.closed) {
      svgEl('path', { d: arrowPath(headX, y, angle, def), fill: def.filled ? line : '#fff', stroke: line, 'stroke-width': 1, class: 'edge-head' }, g);
    } else {
      svgEl('path', { d: arrowPath(headX, y, angle, def), fill: 'none', stroke: line, 'stroke-width': def.stroke || 1.3, class: 'edge-head' }, g);
    }
  }
  // destroy: X (destruction occurrence) at the target lifeline
  if (isDelete) {
    const k = 7;
    svgEl('line', { x1: headX - k, y1: y - k, x2: headX + k, y2: y + k, stroke: line, 'stroke-width': 1.6, class: 'edge-head' }, g);
    svgEl('line', { x1: headX - k, y1: y + k, x2: headX + k, y2: y - k, stroke: line, 'stroke-width': 1.6, class: 'edge-head' }, g);
  }
  // label above the middle: «create» / «destroy» + name(params)
  const labelParts = [];
  if (view.stereotype) labelParts.push(view.stereotype);
  if (model?.name) labelParts.push(model.name);
  if (labelParts.length) {
    const mid = midPoint(points);
    const t = svgEl('text', { x: mid.x, y: y - 6, 'text-anchor': 'middle', 'font-size': fs, fill: view.fontColor || '#353535', 'font-style': 'italic' }, g);
    t.textContent = labelParts.join(' ');
    const textW = Math.max(50, t.textContent.length * fs * 0.55);
    meta.labels.push({ el: t, kind: 'name', field: 'labelOffset', box: { x: mid.x - textW / 2, y: y - fs - 8, width: textW, height: fs + 4 } });
  }
  return meta;
}

/**
 * Timing-diagram message: a vertical arrow between two horizontal lifelines.
 * `view.x` is the shared time position; the ends sit on each lane's value line.
 */
export function renderTimingMessage(g, view, model, tailView, headView) {
  const line = view.lineColor || '#353535';
  const fs = view.fontSize || 11;
  const y1 = tailView.y + tailView.height / 2;
  const y2 = headView.y + headView.height / 2;
  const minX = Math.max(tailView.x + TIMING_LANE_LABEL_W + 8, headView.x + TIMING_LANE_LABEL_W + 8);
  const maxX = Math.min(tailView.x + tailView.width - 8, headView.x + headView.width - 8);
  const wanted = view.x != null ? view.x : (tailView.x + tailView.width / 2);
  const x = Math.max(minX, Math.min(maxX, wanted));
  view.x = Math.round(x);
  const meta = { labels: [], points: [{ x, y: y1 }, { x, y: y2 }] };

  svgEl('line', {
    x1: x, y1, x2: x, y2, stroke: line, 'stroke-width': 1,
    'stroke-dasharray': dashArray(view.lineStyle), class: 'edge-path',
  }, g);
  const angle = Math.atan2(y2 - y1, 0);
  const def = ARROW[view.headArrow] || ARROW.open;
  svgEl('path', {
    d: arrowPath(x, y2, angle, def), fill: 'none', stroke: line,
    'stroke-width': def.stroke || 1.3, class: 'edge-head',
  }, g);
  const name = model?.name || '';
  if (name) {
    const midY = (y1 + y2) / 2;
    const t = svgEl('text', {
      x: x + 7, y: midY + fs * 0.35, 'font-size': fs, fill: view.fontColor || '#353535',
    }, g);
    t.textContent = name;
    meta.labels.push({
      el: t, kind: 'name', field: 'labelOffset',
      box: { x: x + 4, y: midY - fs, width: Math.max(40, name.length * fs * 0.58), height: fs + 4 },
    });
  }
  return meta;
}

function arrowPath(x, y, angle, def) {
  const s = def.size;
  const a = angle;
  if (def.closed) {
    // triangle or diamond pointing into (x,y) along angle
    const p1 = { x: x - Math.cos(a) * s, y: y - Math.sin(a) * s };
    if (def.closed && def.size >= 13 && (def.filled || !def.filled)) {
      // diamond
      const half = s * 0.42;
      const p2 = { x: p1.x + Math.cos(a + Math.PI / 2) * half, y: p1.y + Math.sin(a + Math.PI / 2) * half };
      const p3 = { x: x - Math.cos(a) * s * 2, y: y - Math.sin(a) * s * 2 };
      const p4 = { x: p1.x + Math.cos(a - Math.PI / 2) * half, y: p1.y + Math.sin(a - Math.PI / 2) * half };
      return `M ${x} ${y} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} L ${p4.x.toFixed(2)} ${p4.y.toFixed(2)} Z`;
    }
    // triangle
    const half = s * 0.42;
    const p2 = { x: p1.x + Math.cos(a + Math.PI / 2) * half, y: p1.y + Math.sin(a + Math.PI / 2) * half };
    const p3 = { x: p1.x + Math.cos(a - Math.PI / 2) * half, y: p1.y + Math.sin(a - Math.PI / 2) * half };
    return `M ${x} ${y} L ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)} Z`;
  }
  // open arrow (two lines)
  const half = s * 0.45;
  const p2 = { x: x - Math.cos(a) * s + Math.cos(a + Math.PI / 2) * half, y: y - Math.sin(a) * s + Math.sin(a + Math.PI / 2) * half };
  const p3 = { x: x - Math.cos(a) * s + Math.cos(a - Math.PI / 2) * half, y: y - Math.sin(a) * s + Math.sin(a - Math.PI / 2) * half };
  return `M ${p2.x.toFixed(2)} ${p2.y.toFixed(2)} L ${x} ${y} L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`;
}

function angleBetween(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

function pointStr(p) {
  return `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
}

/** Build the SVG path for a polyline according to the edge's line mode. */
function buildEdgePath(points, mode = 'orthogonal') {
  if (!points || points.length < 2) return '';
  if (mode === 'rounded') {
    const radius = 10;
    let d = `M ${pointStr(points[0])}`;
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1], cur = points[i], next = points[i + 1];
      const l1 = Math.hypot(cur.x - prev.x, cur.y - prev.y);
      const l2 = Math.hypot(next.x - cur.x, next.y - cur.y);
      if (l1 === 0 || l2 === 0) { d += ` L ${pointStr(cur)}`; continue; }
      const r = Math.min(radius, l1 / 2, l2 / 2);
      const pIn = { x: cur.x - (cur.x - prev.x) / l1 * r, y: cur.y - (cur.y - prev.y) / l1 * r };
      const pOut = { x: cur.x + (next.x - cur.x) / l2 * r, y: cur.y + (next.y - cur.y) / l2 * r };
      d += ` L ${pointStr(pIn)} Q ${pointStr(cur)} ${pointStr(pOut)}`;
    }
    d += ` L ${pointStr(points[points.length - 1])}`;
    return d;
  }
  if (mode === 'curved') {
    if (points.length === 2) {
      const [a, b] = points;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = Math.min(40, len * 0.16);
      const c = { x: (a.x + b.x) / 2 - dy / len * off, y: (a.y + b.y) / 2 + dx / len * off };
      return `M ${pointStr(a)} Q ${pointStr(c)} ${pointStr(b)}`;
    }
    // Catmull-Rom through the route points, converted to cubic Béziers.
    let d = `M ${pointStr(points[0])}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      d += ` C ${pointStr(c1)} ${pointStr(c2)} ${pointStr(p2)}`;
    }
    return d;
  }
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
}

/**
 * Compute the full point list of an edge, given tail/head view rects and waypoints.
 * Returns {points, tailEnd, headEnd} where ends are {x,y,angle} for arrow drawing.
 */
export function computeEdgeGeometry(edge, tailRect, headRect, opts = {}) {
  // start from center points, trim to borders
  const tailCenter = { x: tailRect.cx, y: tailRect.cy };
  const headCenter = { x: headRect.cx, y: headRect.cy };

  const wps = edge.points || [];
  const mode = edge.lineMode || 'orthogonal';
  let route;
  let tailB, headB;
  if (wps.length) {
    const firstW = wps[0];
    const lastW = wps[wps.length - 1];
    tailB = borderIntersect(tailRect, firstW);
    headB = borderIntersect(headRect, lastW);
    route = [tailB, ...wps, headB];
  } else if (mode === 'oblique') {
    // direct diagonal: attach each end toward the other node's center
    tailB = borderIntersect(tailRect, headCenter);
    headB = borderIntersect(headRect, tailCenter);
    route = [tailB, headB];
  } else {
    tailB = borderIntersect(tailRect, headCenter);
    headB = borderIntersect(headRect, tailCenter);
    // straight elbows by default; reroute around obstacles when they are given
    route = routeAvoiding({ ...tailB, side: tailB.side }, { ...headB, side: headB.side }, opts.obstacles || null);
  }

  const headEnd = route[route.length - 1];
  const beforeHead = route[route.length - 2] || route[0];
  const tailEnd = route[0];
  const afterTail = route[1] || route[route.length - 1];
  return {
    points: route,
    tailEnd: { ...tailEnd, angle: angleBetween(afterTail, tailEnd) },
    headEnd: { ...headEnd, angle: angleBetween(beforeHead, headEnd) },
  };
}

export function renderEdge(g, edge, model, tailRect, headRect, opts = {}) {
  const { points, tailEnd, headEnd } = computeEdgeGeometry(edge, tailRect, headRect, opts);
  const line = edge.lineColor || '#353535';
  const fontColor = edge.fontColor || '#353535';
  const fs = edge.fontSize || 11;
  const meta = { labels: [], points };
  const connectorKind = edge.$type === 'UMLCompositeConnector'
    ? (model?.connectorKind || edge.connectorKind || 'assembly') : null;

  const d = buildEdgePath(points, edge.lineMode);
  svgEl('path', {
    d, fill: 'none', stroke: line,
    'stroke-width': opts.selected ? 1.6 : 1,
    'stroke-dasharray': connectorKind === 'delegation' ? '6 4' : dashArray(edge.lineStyle),
    class: 'edge-path',
  }, g);

  const drawArrow = (x, y, angle, spec, className) => {
    const def = ARROW[spec];
    if (spec === 'containment') {
      // circled plus at the container end
      const r = 5;
      svgEl('circle', { cx: x, cy: y, r, fill: '#fff', stroke: line, 'stroke-width': 1, class: className }, g);
      svgEl('line', { x1: x - r * 0.55, y1: y, x2: x + r * 0.55, y2: y, stroke: line, 'stroke-width': 1 }, g);
      svgEl('line', { x1: x, y1: y - r * 0.55, x2: x, y2: y + r * 0.55, stroke: line, 'stroke-width': 1 }, g);
      return;
    }
    if (!def) return;
    if (def.closed) {
      svgEl('path', {
        d: arrowPath(x, y, angle, def),
        fill: def.filled ? line : '#fff',
        stroke: line, 'stroke-width': 1, class: className,
      }, g);
      // shorten line into hollow arrowheads: overlay bg-colored line
      if (!def.filled) {
        const bx = x - Math.cos(angle) * def.size * (def.size >= 13 ? 1.9 : 1);
        const by = y - Math.sin(angle) * def.size * (def.size >= 13 ? 1.9 : 1);
        svgEl('line', { x1: bx, y1: by, x2: x, y2: y, stroke: '#fff', 'stroke-width': 2.2 }, g);
      }
    } else {
      svgEl('path', { d: arrowPath(x, y, angle, def), fill: 'none', stroke: line, 'stroke-width': def.stroke || 1.3, class: className }, g);
    }
  };

  if (connectorKind === 'delegation') {
    drawArrow(headEnd.x, headEnd.y, headEnd.angle, 'open', 'edge-head');
  } else if (connectorKind === 'assembly') {
    // ball at the tail, socket at the head
    svgEl('circle', {
      cx: tailEnd.x, cy: tailEnd.y, r: 5,
      fill: '#fff', stroke: line, 'stroke-width': 1, class: 'edge-tail',
    }, g);
    const r = 5, a = headEnd.angle;
    const p1 = { x: headEnd.x + Math.cos(a + Math.PI / 2) * r, y: headEnd.y + Math.sin(a + Math.PI / 2) * r };
    const p2 = { x: headEnd.x + Math.cos(a - Math.PI / 2) * r, y: headEnd.y + Math.sin(a - Math.PI / 2) * r };
    svgEl('path', {
      d: `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
      fill: 'none', stroke: line, 'stroke-width': 1.2, class: 'edge-head',
    }, g);
  } else {
    let headArrow = edge.headArrow, tailArrow = edge.tailArrow;
    // information flow direction semantics: bidirectional/none override the arrowheads
    if (model?.type === 'UMLInformationFlow') {
      const dir = edge.direction || model.direction || 'unidirectional';
      if (dir === 'bidirectional') tailArrow = 'open';
      else if (dir === 'none') headArrow = 'none';
    }
    drawArrow(headEnd.x, headEnd.y, headEnd.angle, headArrow, 'edge-head');
    drawArrow(tailEnd.x, tailEnd.y, tailEnd.angle, tailArrow, 'edge-tail');
  }

  // name label at middle of the polyline (draggable: edge.labelOffset)
  const baseMid = midPoint(points);
  const off = edge.labelOffset || { dx: 0, dy: 0 };
  const mid = { x: baseMid.x + (off.dx || 0), y: baseMid.y + (off.dy || 0) };
  const labelParts = [];
  if (edge.stereotype) labelParts.push(edge.stereotype);
  if (edge.$type !== 'UMLLinkObject' && edge.nameVisible !== false && model?.name) labelParts.push(model.name);
  if (model?.type === 'UMLInformationFlow' && (model.conveyed || []).length) {
    const conveyed = model.conveyed.map((c) => c.name).filter(Boolean);
    if (conveyed.length) labelParts.push(conveyed.join(', '));
  }
  if (edge.$type === 'UMLExtension' && model?.multiplicity) {
    const mt = svgEl('text', {
      x: headEnd.x, y: headEnd.y - fs - 6, 'text-anchor': 'middle',
      'font-size': fs, fill: fontColor,
    }, g);
    mt.textContent = model.multiplicity;
  }
  if (labelParts.length) {
    const t = svgEl('text', {
      x: mid.x, y: mid.y - 5, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor, 'font-style': 'italic',
    }, g);
    t.textContent = labelParts.join(' ');
    const textW = Math.max(40, t.textContent.length * fs * 0.58);
    meta.labels.push({
      el: t, kind: 'name', field: 'labelOffset',
      box: new Rect(mid.x - textW / 2 - 3, mid.y - fs - 9, textW + 6, fs + 7),
    });
  }
  // object-diagram link object: a full object box (instance notation + slots)
  // sitting on the link midpoint, backed by a UMLObject model
  if (edge.$type === 'UMLLinkObject') {
    const slots = (model && model.slots) || [];
    const cls = (model && model.classifier) || '';
    const name = (model && model.name) || edge.name || '';
    const title = cls ? `${name} : ${cls}` : name;
    const lines = [title, ...slots.map((s) => `${s.name} = ${s.value}`)];
    const bw = Math.max(80, ...lines.map((l) => l.length * fs * 0.6 + 18));
    const bh = fs + 12 + slots.length * (fs + 4) + 6;
    svgEl('rect', {
      x: mid.x - bw / 2, y: mid.y - bh / 2, width: bw, height: bh,
      fill: edge.fillColor || '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame',
    }, g);
    const t = svgEl('text', {
      x: mid.x, y: mid.y - bh / 2 + fs + 6, 'text-anchor': 'middle', 'font-size': fs,
      fill: fontColor, 'text-decoration': 'underline',
    }, g);
    t.textContent = title;
    slots.forEach((s, i) => {
      const st = svgEl('text', {
        x: mid.x - bw / 2 + 8, y: mid.y - bh / 2 + fs + 6 + (i + 1) * (fs + 4) + 2,
        'font-size': fs - 1, fill: fontColor,
      }, g);
      st.textContent = `${s.name} = ${s.value}`;
    });
  }

  const showEndLabels = model?.type === 'UMLAssociation'
    || model?.type === 'UMLLink' || model?.type === 'UMLDirectedLink'
    || edge.$type === 'UMLLink' || edge.$type === 'UMLDirectedLink';
  if (showEndLabels) {
    // each end label is draggable; offsets persist on their own view field
    // (null = no offset), mirroring the name label's labelOffset mechanism
    const endSpecs = [
      ['headRole', edge.headRoleName, headEnd.x, headEnd.y - 6, 'headRoleOffset'],
      ['headMult', edge.headMultiplicity, headEnd.x, headEnd.y - 6 - fs, 'headMultOffset'],
      ['tailRole', edge.tailRoleName, tailEnd.x, tailEnd.y - 6, 'tailRoleOffset'],
      ['tailMult', edge.tailMultiplicity, tailEnd.x, tailEnd.y - 6 - fs, 'tailMultOffset'],
    ];
    for (const [kind, text, bx, by, field] of endSpecs) {
      if (!text) continue;
      const o = edge[field] || { dx: 0, dy: 0 };
      const t = svgEl('text', {
        x: bx + o.dx, y: by + o.dy, 'font-size': fs, fill: fontColor, 'text-anchor': 'middle',
      }, g);
      t.textContent = text;
      const tw2 = Math.max(24, text.length * fs * 0.6 + 8);
      meta.labels.push({
        el: t, kind, field,
        box: { x: bx + o.dx - tw2 / 2, y: by + o.dy - fs - 2, width: tw2, height: fs + 6 },
      });
    }
  }
  // role binding: the bound role name sits next to the head end
  if (edge.$type === 'UMLRoleBinding') {
    const roleName = edge.roleName || model?.roleName || '';
    if (roleName) {
      const t = svgEl('text', {
        x: headEnd.x, y: headEnd.y + fs + 10, 'text-anchor': 'middle',
        'font-size': fs, fill: fontColor, 'font-style': 'italic',
      }, g);
      t.textContent = roleName;
    }
  }
  return meta;
}

export function midPoint(points) {
  // walk half the total length
  let total = 0;
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push(l); total += l;
  }
  let target = total / 2;
  for (let i = 0; i < segs.length; i++) {
    if (target <= segs[i]) {
      const t = segs[i] === 0 ? 0 : target / segs[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    target -= segs[i];
  }
  return points[0];
}

/** Closest point on a polyline (used to attach association-class links). */
export function closestPointOnPolyline(p, points) {
  let best = null, bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    let t = l2 === 0 ? 0 : ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < bestD) { bestD = d; best = q; }
  }
  return best || points[0];
}

export function renderAssociationClassLink(g, view, classRect, assocPoints) {
  const line = view.lineColor || '#353535';
  if (!classRect || !assocPoints || assocPoints.length < 2) {
    return { labels: [], points: [] };
  }
  const center = { x: classRect.cx, y: classRect.cy };
  const attach = closestPointOnPolyline(center, assocPoints);
  const border = borderIntersect(classRect, attach);
  svgEl('line', {
    x1: border.x, y1: border.y, x2: attach.x, y2: attach.y,
    stroke: line, 'stroke-width': 1, 'stroke-dasharray': '6 4', class: 'edge-path',
  }, g);
  return { labels: [], points: [border, attach] };
}

/** distance from point to polyline — for hit testing */
export function distanceToPolyline(p, points) {
  let best = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    best = Math.min(best, distanceToSegment(p, points[i], points[i + 1]));
  }
  return best;
}
function distanceToSegment(p, a, b) {
  const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * (b.x - a.x)), p.y - (a.y + t * (b.y - a.y)));
}
