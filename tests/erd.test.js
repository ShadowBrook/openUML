// tests/erd.test.js — ERD crow's-foot marker system (pure geometry/data parts)

import test from 'node:test';
import assert from 'node:assert/strict';
import { erdCardKind, erdMarkerId, ERD_MARKER_KINDS, erdGlyphSpecs } from '../js/views/edgeviews.js';

test('erdCardKind maps StarUML enums and common text forms', () => {
  assert.equal(erdCardKind('ZERO'), 'zero');
  assert.equal(erdCardKind('1'), 'one');
  assert.equal(erdCardKind('0..1'), 'zeroOrOne');
  assert.equal(erdCardKind('ONE_OR_MANY'), 'oneOrMany');
  assert.equal(erdCardKind('*'), 'many');
  assert.equal(erdCardKind('0..N'), 'many');
  assert.equal(erdCardKind(''), null);
  assert.equal(erdCardKind('   '), null);
  assert.equal(erdCardKind('exactly 7'), 'text'); // 未识别 → 文字回退
});

test('every marker kind has a start and an end marker id', () => {
  for (const kind of ERD_MARKER_KINDS) {
    assert.equal(erdMarkerId(kind, true), `erd-start-${kind}`);
    assert.equal(erdMarkerId(kind, false), `erd-end-${kind}`);
  }
});

test('glyph geometry stays inside the marker viewBox', () => {
  // viewBox is "-18 -6 20 12": x ∈ [-18, 2], y ∈ [-6, 6]
  for (const kind of ERD_MARKER_KINDS) {
    const specs = erdGlyphSpecs(kind);
    assert.ok(specs.length > 0, `${kind} must have glyphs`);
    for (const s of specs) {
      const xs = s.tag === 'circle'
        ? [s.attrs.cx - s.attrs.r, s.attrs.cx + s.attrs.r]
        : [s.attrs.x1, s.attrs.x2];
      const ys = s.tag === 'circle'
        ? [s.attrs.cy - s.attrs.r, s.attrs.cy + s.attrs.r]
        : [s.attrs.y1, s.attrs.y2];
      assert.ok(Math.min(...xs) >= -18 && Math.max(...xs) <= 2, `${kind} x range`);
      assert.ok(Math.min(...ys) >= -6 && Math.max(...ys) <= 6, `${kind} y range`);
    }
  }
});

test('glyph composition matches the notation semantics', () => {
  assert.equal(erdGlyphSpecs('one').length, 1);                       // 单竖线
  assert.equal(erdGlyphSpecs('zero').length, 1);                     // 圆环
  assert.equal(erdGlyphSpecs('zero')[0].tag, 'circle');
  assert.equal(erdGlyphSpecs('zeroOrOne').length, 2);                // ○|
  assert.equal(erdGlyphSpecs('zeroOrOne').filter((s) => s.tag === 'circle').length, 1);
  assert.equal(erdGlyphSpecs('many').length, 3);                     // 三叉爪
  assert.equal(erdGlyphSpecs('oneOrMany').length, 4);                // 爪 + 竖线
  // 爪尖贴着端点（x=-1），爪根距端点 12
  const claw = erdGlyphSpecs('many');
  for (const s of claw) {
    assert.equal(s.attrs.x2, -1);
    assert.equal(s.attrs.x1, -12);
  }
});
