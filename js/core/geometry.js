// geometry.js — rectangle/point math shared across canvas and views

export class Rect {
  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x; this.y = y; this.width = width; this.height = height;
  }
  get x2() { return this.x + this.width; }
  get y2() { return this.y + this.height; }
  get cx() { return this.x + this.width / 2; }
  get cy() { return this.y + this.height / 2; }
  contains(px, py) {
    return px >= this.x && px <= this.x2 && py >= this.y && py <= this.y2;
  }
  union(r) {
    const x = Math.min(this.x, r.x), y = Math.min(this.y, r.y);
    const width = Math.max(this.x2, r.x2) - x, height = Math.max(this.y2, r.y2) - y;
    return new Rect(x, y, width, height);
  }
  intersect(r) {
    const x = Math.max(this.x, r.x), y = Math.max(this.y, r.y);
    const w = Math.min(this.x2, r.x2) - x, h = Math.min(this.y2, r.y2) - y;
    return new Rect(x, y, Math.max(0, w), Math.max(0, h));
  }
  static fromPoints(pts) {
    if (!pts.length) return new Rect(0, 0, 0, 0);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return new Rect(minX, minY, maxX - minX, maxY - minY);
  }
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Snap a value to the grid
export function snap(v, grid) {
  return grid > 1 ? Math.round(v / grid) * grid : v;
}

/**
 * GetPointOnRectangle: intersection of the segment from rect center toward
 * point p with the rect border. Used to attach edge endpoints to nodes.
 */
export function borderIntersect(rect, p) {
  const cx = rect.cx, cy = rect.cy;
  const dx = p.x - cx, dy = p.y - cy;
  if (dx === 0 && dy === 0) return { x: rect.x2, y: cy, side: 'right' };
  // Scale factors for crossing each border
  const cands = [];
  if (dx !== 0) {
    const tx = rect.width / 2 / Math.abs(dx);
    cands.push({ t: tx, x: cx + dx * tx, y: cy + dy * tx, side: dx > 0 ? 'right' : 'left' });
  }
  if (dy !== 0) {
    const ty = rect.height / 2 / Math.abs(dy);
    cands.push({ t: ty, x: cx + dx * ty, y: cy + dy * ty, side: dy > 0 ? 'bottom' : 'top' });
  }
  cands.sort((a, b) => a.t - b.t);
  const hit = cands[0];
  return { x: hit.x, y: hit.y, side: hit.side };
}

/**
 * Pinned-side anchor attach (Luna-style anchor enum): instead of deriving the
 * border side from the center ray each render, the user pins which side of the
 * node the edge attaches to. 'default' keeps the derived behavior; the point
 * along the pinned side still slides toward the other end (clamped to the side).
 */
export function anchorBorderPoint(rect, anchor, towardPt) {
  if (!anchor || anchor === 'default') return borderIntersect(rect, towardPt);
  const tx = Math.max(rect.x, Math.min(rect.x2, towardPt.x));
  const ty = Math.max(rect.y, Math.min(rect.y2, towardPt.y));
  switch (anchor) {
    case 'left': return { x: rect.x, y: ty, side: 'left' };
    case 'right': return { x: rect.x2, y: ty, side: 'right' };
    case 'top': return { x: tx, y: rect.y, side: 'top' };
    case 'bottom': return { x: tx, y: rect.y2, side: 'bottom' };
    default: return borderIntersect(rect, towardPt);
  }
}

/**
 * Simple orthogonal route between two border points.
 * Produces intermediate waypoints so the edge looks UML-clean.
 */
export function orthogonalRoute(s, e) {
  const pts = [s, e];
  const dx = e.x - s.x, dy = e.y - s.y;
  const midX = (s.x + e.x) / 2, midY = (s.y + e.y) / 2;
  const horizIn = s.side === 'left' || s.side === 'right';
  const horizOut = e.side === 'left' || e.side === 'right';
  const gap = 30;
  if (horizIn && horizOut) {
    if ((s.side === 'right' && e.side === 'left' && dx > gap) ||
        (s.side === 'left' && e.side === 'right' && dx < -gap)) {
      return pts; // straight horizontal works
    }
    return [s, { x: midX, y: s.y }, { x: midX, y: e.y }, e];
  }
  if (!horizIn && !horizOut) {
    if ((s.side === 'bottom' && e.side === 'top' && dy > gap) ||
        (s.side === 'top' && e.side === 'bottom' && dy < -gap)) {
      return pts; // straight vertical works
    }
    return [s, { x: s.x, y: midY }, { x: e.x, y: midY }, e];
  }
  if (horizIn && !horizOut) {
    return [s, { x: e.x, y: s.y }, e];
  }
  return [s, { x: s.x, y: e.y }, e];
}

/** Identify which handle of a rect the point is near (for resizing). */
export function resizeHandle(rect, p, tolerance = 6) {
  const handles = {
    nw: { x: rect.x, y: rect.y }, n: { x: rect.cx, y: rect.y }, ne: { x: rect.x2, y: rect.y },
    w: { x: rect.x, y: rect.cy }, e: { x: rect.x2, y: rect.cy },
    sw: { x: rect.x, y: rect.y2 }, s: { x: rect.cx, y: rect.y2 }, se: { x: rect.x2, y: rect.y2 },
  };
  for (const [key, hp] of Object.entries(handles)) {
    if (Math.abs(p.x - hp.x) <= tolerance && Math.abs(p.y - hp.y) <= tolerance) return key;
  }
  return null;
}

/**
 * Orthogonal segment vs rect test (strict interior): a segment merely touching
 * a border does not count as a crossing.
 */
export function segmentHitsRect(a, b, r) {
  if (a.y === b.y) {
    return a.y > r.y && a.y < r.y2
      && Math.min(a.x, b.x) < r.x2 && Math.max(a.x, b.x) > r.x;
  }
  if (a.x === b.x) {
    return a.x > r.x && a.x < r.x2
      && Math.min(a.y, b.y) < r.y2 && Math.max(a.y, b.y) > r.y;
  }
  // diagonal segment: sample-based conservative test (routes are orthogonal,
  // this only guards against misuse)
  for (let t = 0; t <= 1; t += 0.05) {
    const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
    if (x > r.x && x < r.x2 && y > r.y && y < r.y2) return true;
  }
  return false;
}

function polylineCost(pts, obstacles) {
  let hits = 0, len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    len += Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    for (const r of obstacles) {
      if (segmentHitsRect(a, b, r)) { hits += 1; break; }
    }
  }
  return hits * 1e6 + len;
}

/**
 * Orthogonal route with obstacle avoidance: try the plain route first; when it
 * crosses something, score detour candidates through channels around the
 * combined bounds of the endpoints and obstacles and keep the cleanest/shortest.
 *
 * Every channel candidate enters/leaves through a fixed-length stub along the
 * endpoint's table-edge normal (12px). Without it the last segment would run
 * *along* the entity border before touching the attach point — the line hugs
 * the box and the ERD crow's-foot mark (drawn on the normal) ends up
 * disconnected from the line.
 */
const ENTER_STUB = 12;
const EDGE_NORMALS = { top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0] };

export function routeAvoiding(s, e, obstacles) {
  const base = orthogonalRoute(s, e);
  if (!obstacles || !obstacles.length) return base;
  const pad = 8;
  const obs = obstacles.map((r) => ({
    x: r.x - pad, y: r.y - pad, x2: (r.x2 ?? r.x + r.width) + pad, y2: (r.y2 ?? r.y + r.height) + pad,
  }));
  let x1 = Math.min(s.x, e.x), y1 = Math.min(s.y, e.y);
  let x2 = Math.max(s.x, e.x), y2 = Math.max(s.y, e.y);
  for (const r of obs) {
    x1 = Math.min(x1, r.x); y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x2); y2 = Math.max(y2, r.y2);
  }
  const M = 24, midX = (s.x + e.x) / 2;
  const sn = EDGE_NORMALS[s.side] || [0, -1], en = EDGE_NORMALS[e.side] || [0, -1];
  const sIn = { x: s.x + sn[0] * ENTER_STUB, y: s.y + sn[1] * ENTER_STUB };
  const eIn = { x: e.x + en[0] * ENTER_STUB, y: e.y + en[1] * ENTER_STUB };
  // [s, stub, (lane, stub) ×2, e]: orthogonal chain that always leaves/enters
  // along the endpoint normals
  const clean = (pts) => pts.filter((p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) > 0.01 || Math.abs(p.y - pts[i - 1].y) > 0.01);
  const laneV = (ch) => clean([s, sIn, { x: ch, y: sIn.y }, { x: ch, y: eIn.y }, eIn, e]);
  const laneH = (cy) => clean([s, sIn, { x: sIn.x, y: cy }, { x: eIn.x, y: cy }, eIn, e]);
  const cands = [base, laneV(midX)];
  for (const ch of [x1 - M, x2 + M]) cands.push(laneV(ch));
  for (const ch of [y1 - M, y2 + M]) cands.push(laneH(ch));
  // gap lanes: every channel between consecutive obstacle edges (plus lanes
  // just outside the endpoints). Dense layouts (ERD grids) leave no clean
  // outer-envelope detour — both sides stay walled by other tables — so the
  // route must thread the gaps between obstacles instead.
  const xs = new Set([s.x, e.x, x1 - M, x2 + M]);
  const ys = new Set([s.y, e.y, y1 - M, y2 + M]);
  for (const r of obs) { xs.add(r.x); xs.add(r.x2); ys.add(r.y); ys.add(r.y2); }
  const xsArr = [...xs].sort((a, b) => a - b);
  const ysArr = [...ys].sort((a, b) => a - b);
  for (let i = 0; i + 1 < xsArr.length; i++) {
    cands.push(laneV((xsArr[i] + xsArr[i + 1]) / 2));
  }
  for (let i = 0; i + 1 < ysArr.length; i++) {
    cands.push(laneH((ysArr[i] + ysArr[i + 1]) / 2));
  }
  if (polylineCost(base, obs) === 0) return base;
  let best = base, bestCost = Infinity;
  for (const c of cands) {
    const cost = polylineCost(c, obs);
    if (cost < bestCost) { bestCost = cost; best = c; }
  }
  return best;
}
