// tests/route.test.js — orthogonal routing with obstacle avoidance

import test from 'node:test';
import assert from 'node:assert/strict';
import { Rect, borderIntersect, orthogonalRoute, routeAvoiding, segmentHitsRect } from '../js/core/geometry.js';

const segs = (pts) => pts.slice(1).map((p, i) => [pts[i], p]);

function crossesAny(route, obstacles) {
  for (const [a, b] of segs(route)) {
    for (const r of obstacles) {
      if (segmentHitsRect(a, b, r)) return true;
    }
  }
  return false;
}

test('segmentHitsRect counts interior crossings, not border touches', () => {
  const r = { x: 10, y: 10, x2: 20, y2: 20 };
  assert.ok(segmentHitsRect({ x: 0, y: 15 }, { x: 30, y: 15 }, r));   // through
  assert.ok(!segmentHitsRect({ x: 0, y: 10 }, { x: 30, y: 10 }, r));  // on border
  assert.ok(!segmentHitsRect({ x: 0, y: 25 }, { x: 30, y: 25 }, r));  // outside
});

test('plain orthogonal route is kept when the path is clear', () => {
  const s = { x: 60, y: 50, side: 'right' };
  const e = { x: 140, y: 50, side: 'left' };
  const route = routeAvoiding(s, e, [new Rect(200, 0, 40, 100)]); // obstacle elsewhere
  assert.equal(route.length, 2); // straight horizontal
});

test('route detours around an obstacle blocking the direct path', () => {
  const s = { x: 60, y: 50, side: 'right' };
  const e = { x: 240, y: 50, side: 'left' };
  const blocker = new Rect(120, 0, 60, 100);
  const route = routeAvoiding(s, e, [blocker]);
  assert.ok(route.length >= 4, 'expected a detour polyline');
  assert.ok(!crossesAny(route, [blocker]), 'route must not cross the obstacle');
  assert.ok(route.every((p) => p.y < 0 || p.y > 100 || p.x < 120 || p.x > 180 || p === route[0] || p === route[route.length - 1]));
});

test('vertical-sides pair detours through a horizontal channel', () => {
  const s = { x: 50, y: 90, side: 'bottom' };
  const e = { x: 50, y: 300, side: 'top' };
  const blocker = new Rect(0, 140, 100, 110);
  const route = routeAvoiding(s, e, [blocker]);
  assert.ok(!crossesAny(route, [blocker]));
});

test('dense grid: route threads the gap between surrounding obstacles', () => {
  // center obstacle directly between the endpoints; tall tables wall off both
  // sides and the outer envelope, so the only clean path is through the gap
  const s = { x: 300, y: 100, side: 'bottom' };
  const e = { x: 300, y: 500, side: 'top' };
  const obstacles = [
    new Rect(260, 200, 80, 120),   // center, blocks the straight line
    new Rect(-50, 0, 280, 600),    // left wall (gap 238..252 after padding)
    new Rect(420, 0, 280, 600),    // right wall (gap 348..412 after padding)
  ];
  const route = routeAvoiding(s, e, obstacles);
  assert.ok(!crossesAny(route, obstacles), 'route must thread a gap, not cross tables');
});

test('borderIntersect picks the facing side', () => {
  const r = new Rect(0, 0, 100, 50);
  assert.equal(borderIntersect(r, { x: 500, y: 25 }).side, 'right');
  assert.equal(borderIntersect(r, { x: 50, y: -500 }).side, 'top');
});
