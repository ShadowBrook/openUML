// edgeviews.js — SVG rendering for UML relationships with UML arrowheads

import { svgEl } from './nodeviews.js';
import { borderIntersect, orthogonalRoute } from '../core/geometry.js';

const ARROW = {
  none: null,
  open: { size: 9, filled: false, stroke: 1.4 },
  hollowTriangle: { size: 11, filled: false, closed: true },
  filledTriangle: { size: 11, filled: true, closed: true },
  hollowDiamond: { size: 13, filled: false, closed: true },
  filledDiamond: { size: 13, filled: true, closed: true },
};

/**
 * Self-transition/self-association loop: exits the right side of the node,
 * loops out and re-enters the top. Returns meta.points for hit-testing.
 */
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
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  svgEl('path', {
    d, fill: 'none', stroke: line, 'stroke-width': 1,
    'stroke-dasharray': edge.lineStyle === 'dashed' ? '6 4' : 'none',
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
  if (edge.nameVisible !== false && model?.name) labelParts.push(model.name);
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
export function renderMessage(g, view, model, tailView, headView) {
  const y = view.y;
  const line = view.lineColor || '#353535';
  const fs = view.fontSize || 11;
  const meta = { labels: [], points: [] };
  const isSelf = tailView._id === headView._id;

  if (isSelf) {
    // self-message: rectangular loop out to the right and back
    const x = tailView.x + tailView.width / 2;
    const loop = 40, rise = 24;
    meta.points = [{ x, y }, { x: x + loop, y }, { x: x + loop, y: y - rise }, { x, y: y - rise }];
    svgEl('path', {
      d: `M ${x} ${y} L ${x + loop} ${y} L ${x + loop} ${y - rise} L ${x + 8} ${y - rise}`,
      fill: 'none', stroke: line, 'stroke-width': 1,
      'stroke-dasharray': view.lineStyle === 'dashed' ? '6 4' : 'none',
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
      meta.labels.push({ el: t, kind: 'name', box: { x: x + loop / 2 - 40, y: y - rise - fs - 8, width: 100, height: fs + 4 } });
    }
    return meta;
  }

  const tailX = tailView.x + tailView.width / 2;
  const headX = headView.x + headView.width / 2;
  const points = [{ x: tailX, y }, { x: headX, y }];
  meta.points = points;

  svgEl('path', {
    d: `M ${tailX} ${y} L ${headX} ${y}`,
    fill: 'none', stroke: line, 'stroke-width': 1,
    'stroke-dasharray': view.lineStyle === 'dashed' ? '6 4' : 'none',
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
  // label above the middle: name(params)
  const name = model?.name || '';
  if (name) {
    const mid = midPoint(points);
    const t = svgEl('text', { x: mid.x, y: y - 6, 'text-anchor': 'middle', 'font-size': fs, fill: view.fontColor || '#353535' }, g);
    t.textContent = name;
    meta.labels.push({ el: t, kind: 'name', box: { x: mid.x - 50, y: y - fs - 8, width: 100, height: fs + 4 } });
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

/**
 * Compute the full point list of an edge, given tail/head view rects and waypoints.
 * Returns {points, tailEnd, headEnd} where ends are {x,y,angle} for arrow drawing.
 */
export function computeEdgeGeometry(edge, tailRect, headRect) {
  // start from center points, trim to borders
  const tailCenter = { x: tailRect.cx, y: tailRect.cy };
  const headCenter = { x: headRect.cx, y: headRect.cy };

  const wps = edge.points || [];
  const firstW = wps.length ? wps[0] : headCenter;
  const lastW = wps.length ? wps[wps.length - 1] : tailCenter;

  const tailB = borderIntersect(tailRect, firstW);
  const headB = borderIntersect(headRect, lastW);

  const pts = [tailB, ...wps, headB];
  // orthogonalize if no waypoints: produce clean route
  const route = wps.length ? pts : orthogonalRoute({ ...tailB, side: tailB.side }, { ...headB, side: headB.side });

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
  const { points, tailEnd, headEnd } = computeEdgeGeometry(edge, tailRect, headRect);
  const line = edge.lineColor || '#353535';
  const fontColor = edge.fontColor || '#353535';
  const fs = edge.fontSize || 11;
  const meta = { labels: [], points };

  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  svgEl('path', {
    d, fill: 'none', stroke: line,
    'stroke-width': opts.selected ? 1.6 : 1,
    'stroke-dasharray': edge.lineStyle === 'dashed' ? '6 4' : 'none',
    class: 'edge-path',
  }, g);

  const drawArrow = (x, y, angle, spec, className) => {
    const def = ARROW[spec];
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

  drawArrow(headEnd.x, headEnd.y, headEnd.angle, edge.headArrow, 'edge-head');
  drawArrow(tailEnd.x, tailEnd.y, tailEnd.angle, edge.tailArrow, 'edge-tail');

  // name label at middle of the polyline
  const mid = midPoint(points);
  const labelParts = [];
  if (edge.stereotype) labelParts.push(edge.stereotype);
  if (edge.nameVisible !== false && model?.name) labelParts.push(model.name);
  if (labelParts.length) {
    const t = svgEl('text', {
      x: mid.x, y: mid.y - 5, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor, 'font-style': 'italic',
    }, g);
    t.textContent = labelParts.join(' ');
    meta.labels.push({ el: t, kind: 'name', box: { x: mid.x - 40, y: mid.y - fs - 6, width: 80, height: fs + 4 } });
  }
  if (model?.type === 'UMLAssociation') {
    if (edge.headRoleName) {
      const t = svgEl('text', { x: headEnd.x, y: headEnd.y - 6, 'font-size': fs, fill: fontColor, 'text-anchor': 'middle' }, g);
      t.textContent = edge.headRoleName;
    }
    if (edge.headMultiplicity) {
      const t = svgEl('text', { x: headEnd.x, y: headEnd.y - 6 - fs, 'font-size': fs, fill: fontColor, 'text-anchor': 'middle' }, g);
      t.textContent = edge.headMultiplicity;
    }
    if (edge.tailRoleName) {
      const t = svgEl('text', { x: tailEnd.x, y: tailEnd.y - 6, 'font-size': fs, fill: fontColor, 'text-anchor': 'middle' }, g);
      t.textContent = edge.tailRoleName;
    }
    if (edge.tailMultiplicity) {
      const t = svgEl('text', { x: tailEnd.x, y: tailEnd.y - 6 - fs, 'font-size': fs, fill: fontColor, 'text-anchor': 'middle' }, g);
      t.textContent = edge.tailMultiplicity;
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
