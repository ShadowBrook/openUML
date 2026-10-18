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
