// nodeviews.js — SVG rendering for node-shaped diagram views.
// Each renderer draws into a <g class="node-main"> and reports compartment boxes
// used for text editing and hit-testing.

import { Rect } from '../core/geometry.js';
import { VISIBILITY } from '../core/metamodel.js';

const SVGNS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

export function fmtAttribute(a) {
  const vis = VISIBILITY[a.visibility]?.symbol ?? '+';
  const staticPrefix = a.isStatic ? 'underline' : '';
  const typePart = a.type ? `: ${a.type}` : '';
  const defPart = a.defaultValue ? ` = ${a.defaultValue}` : '';
  return { text: `${vis}${a.name}${typePart}${defPart}`, staticPrefix };
}

export function fmtOperation(op) {
  const vis = VISIBILITY[op.visibility]?.symbol ?? '+';
  const params = (op.parameters || []).map((p) => `${p.name}${p.type ? ': ' + p.type : ''}`).join(', ');
  const ret = op.returnType ? `: ${op.returnType}` : '';
  return { text: `${vis}${op.name}(${params})${ret}`, staticPrefix: op.isStatic ? 'underline' : '' };
}

function drawName(g, x, y, w, text, { fontSize = 12, bold = true, italic = false, color = '#353535', stereotype = null } = {}) {
  const lines = [];
  let yy = y;
  if (stereotype) {
    const st = svgEl('text', {
      x: x + w / 2, y: yy + fontSize, 'text-anchor': 'middle',
      'font-size': fontSize, 'font-style': 'italic', fill: color, 'font-family': 'inherit',
    }, g);
    st.textContent = stereotype;
    yy += fontSize + 2;
    lines.push(st);
  }
  const t = svgEl('text', {
    x: x + w / 2, y: yy + fontSize, 'text-anchor': 'middle',
    'font-size': fontSize, 'font-weight': bold ? 700 : 400,
    'font-style': italic ? 'italic' : 'normal', fill: color, 'font-family': 'inherit',
  }, g);
  t.textContent = text;
  lines.push(t);
  return lines;
}

function drawCompartmentList(g, items, box, fontSize, color) {
  const out = [];
  let y = box.y + 4;
  for (const it of items) {
    const t = svgEl('text', {
      x: box.x + 6, y: y + fontSize, 'font-size': fontSize, fill: color, 'font-family': 'inherit',
    }, g);
    t.textContent = it.text;
    if (it.staticPrefix === 'underline') t.setAttribute('text-decoration', 'underline');
    out.push({ el: t, y: y + fontSize });
    y += fontSize + 4;
  }
  return out;
}

function compartmentHeight(items, fontSize) {
  if (!items.length) return 12;
  return items.length * (fontSize + 4) + 4;
}

/**
 * Base node renderer. view = {x,y,width,height,fillColor,lineColor,fontColor,fontSize}
 * model = the referenced model element.
 */
export function renderNode(g, view, model, kind) {
  const x = view.x, y = view.y, w = view.width, h = view.height;
  const fill = view.fillColor || '#ffffff';
  const line = view.lineColor || '#353535';
  const fontColor = view.fontColor || '#353535';
  const fs = view.fontSize || 12;
  const meta = { textSlots: {}, compartments: {} };

  switch (kind) {
    case 'class':
    case 'datatype':
    case 'interface': {
      const attrs = (model.attributes || []).map(fmtAttribute);
      const ops = (model.operations || []).map(fmtOperation);
      const nameH = (view.stereotypeShown ? fs + 2 : 0) + fs + 10;
      const attrH = compartmentHeight(attrs, fs);
      const opH = compartmentHeight(ops, fs);
      const stereotype = kind === 'interface' ? '«interface»' : (view.stereotypeShown ? model.stereotype || null : (model.stereotype || null));
      // frame
      svgEl('rect', { x, y, width: w, height: h, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      // name compartment
      drawName(g, x, y + 4, w, model.name, { fontSize: fs, color: fontColor, stereotype, italic: kind === 'datatype' });
      let yy = y + nameH;
      svgEl('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: line, 'stroke-width': 1 }, g);
      meta.compartments.attributes = new Rect(x + 1, yy, w - 2, attrH);
      drawCompartmentList(g, attrs, { x, y: yy, width: w }, fs, fontColor);
      yy += attrH;
      svgEl('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: line, 'stroke-width': 1 }, g);
      meta.compartments.operations = new Rect(x + 1, yy, w - 2, opH);
      drawCompartmentList(g, ops, { x, y: yy, width: w }, fs, fontColor);
      yy += opH;
      if (yy < y + h - 1) svgEl('line', { x1: x, y1: y + h, x2: x + w, y2: y + h, stroke: line }, g);
      meta.textSlots.name = { box: new Rect(x, y, w, nameH), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'enumeration': {
      const lits = (model.literals || []).map((l) => ({ text: l.name }));
      const nameH = fs + 10;
      const litH = compartmentHeight(lits, fs);
      svgEl('rect', { x, y, width: w, height: h, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      drawName(g, x, y + 4, w, model.name, { fontSize: fs, color: fontColor, stereotype: '«enumeration»' });
      let yy = y + nameH;
      svgEl('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: line }, g);
      meta.compartments.literals = new Rect(x + 1, yy, w - 2, litH);
      drawCompartmentList(g, lits, { x, y: yy, width: w }, fs, fontColor);
      meta.textSlots.name = { box: new Rect(x, y, w, nameH), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'actor': {
      // stick figure + name below
      const figH = h - fs - 4;
      const cx = x + w / 2;
      const headR = Math.min(w, figH) * 0.18;
      const stroke = { stroke: line, 'stroke-width': 1.4, fill: 'none' };
      svgEl('circle', { cx, cy: y + headR + 2, r: headR, ...stroke, fill: fill, class: 'node-frame' }, g);
      const bodyTop = y + headR * 2 + 4;
      svgEl('line', { x1: cx, y1: y + headR * 2 + 2, x2: cx, y2: bodyTop + figH * 0.45, ...stroke }, g);
      svgEl('line', { x1: cx - w * 0.38, y1: bodyTop + figH * 0.15, x2: cx + w * 0.38, y2: bodyTop + figH * 0.15, ...stroke }, g);
      svgEl('line', { x1: cx, y1: bodyTop + figH * 0.45, x2: cx - w * 0.32, y2: y + figH, ...stroke }, g);
      svgEl('line', { x1: cx, y1: bodyTop + figH * 0.45, x2: cx + w * 0.32, y2: y + figH, ...stroke }, g);
      const t = svgEl('text', { x: cx, y: y + h + fs, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x - 20, y + h, w + 40, fs + 4), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'usecase': {
      const rx = w / 2, ry = h / 2;
      svgEl('ellipse', { cx: x + rx, cy: y + ry, rx, ry, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      // wrap text into up to 3 lines
      const words = model.name.split(/\s+/);
      const lines = [];
      let cur = '';
      for (const wd of words) {
        const test = cur ? cur + ' ' + wd : wd;
        if (test.length * fs * 0.62 > w * 0.86 && cur) { lines.push(cur); cur = wd; } else cur = test;
      }
      if (cur) lines.push(cur);
      const totalH = lines.length * (fs + 2);
      let ty = y + ry - totalH / 2 + fs;
      for (const ln of lines) {
        const t = svgEl('text', { x: x + rx, y: ty, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor }, g);
        t.textContent = ln;
        ty += fs + 2;
      }
      meta.textSlots.name = { box: new Rect(x, y + ry - totalH / 2 - 2, w, totalH + 4), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'package': {
      const tabH = 16, tabW = Math.min(60, w * 0.5);
      svgEl('rect', { x, y, width: tabW, height: tabH, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      svgEl('rect', { x, y: y + tabH - 1, width: w, height: h - tabH + 1, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const t = svgEl('text', { x: x + tabW / 2, y: y + 12, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, tabW, tabH), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'subject': {
      // system boundary rectangle with title tab at top-left
      svgEl('rect', { x, y, width: w, height: h, fill: 'none', stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      const label = (model.stereotype ? model.stereotype + ' ' : '') + model.name;
      const t = svgEl('text', { x: x + 10, y: y + 16, 'font-size': fs + 1, 'font-weight': 700, fill: fontColor }, g);
      t.textContent = label;
      meta.textSlots.name = { box: new Rect(x, y, Math.max(120, w * 0.8), 22), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'lifeline': {
      // head box + dashed lifetime line
      const headH = view.height;
      svgEl('rect', { x, y, width: w, height: headH, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const t = svgEl('text', { x: x + w / 2, y: y + headH / 2 + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor }, g);
      t.textContent = model.name;
      const lifeH = view.lifeHeight || 400;
      svgEl('line', { x1: x + w / 2, y1: y + headH, x2: x + w / 2, y2: y + headH + lifeH, stroke: line, 'stroke-width': 1, 'stroke-dasharray': '6 4' }, g);
      meta.textSlots.name = { box: new Rect(x, y, w, headH), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'text': {
      // view-only text element (StarUML "Text")
      const t = svgEl('text', { x: x + 2, y: y + fs, 'font-size': fs, fill: view.fontColor || '#353535' }, g);
      t.textContent = view.text || '';
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: view.text || '', field: 'text', align: 'left' };
      break;
    }
    case 'rect':
    case 'roundrect': {
      const rr = kind === 'roundrect' ? 8 : 0;
      svgEl('rect', { x, y, width: w, height: h, rx: rr, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      break;
    }
    case 'ellipse': {
      svgEl('ellipse', { cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      break;
    }
    case 'state':
    case 'action': {
      // rounded rectangle, name centered near the top (UML state / action)
      const rr = kind === 'state' ? 12 : 9;
      svgEl('rect', { x, y, width: w, height: h, rx: rr, ry: rr, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const t = svgEl('text', { x: x + w / 2, y: y + fs + 8, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor, 'font-style': 'italic' }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, w, fs + 14), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'initial': {
      svgEl('circle', { cx: x + w / 2, cy: y + h / 2, r: Math.min(w, h) / 2, fill: '#353535', stroke: '#353535', 'stroke-width': 1, class: 'node-frame' }, g);
      break;
    }
    case 'final': {
      const r = Math.min(w, h) / 2;
      svgEl('circle', { cx: x + w / 2, cy: y + h / 2, r, fill: '#fff', stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      svgEl('circle', { cx: x + w / 2, cy: y + h / 2, r: r * 0.55, fill: '#353535', stroke: '#353535' }, g);
      break;
    }
    case 'flowfinal': {
      const r = Math.min(w, h) / 2;
      const cx = x + w / 2, cy = y + h / 2;
      svgEl('circle', { cx, cy, r, fill: '#fff', stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      const k = r * 0.7071;
      svgEl('line', { x1: cx - k, y1: cy - k, x2: cx + k, y2: cy + k, stroke: line, 'stroke-width': 1.2 }, g);
      svgEl('line', { x1: cx - k, y1: cy + k, x2: cx + k, y2: cy - k, stroke: line, 'stroke-width': 1.2 }, g);
      break;
    }
    case 'history': {
      const r = Math.min(w, h) / 2;
      svgEl('circle', { cx: x + w / 2, cy: y + h / 2, r, fill: '#fff', stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      const t = svgEl('text', { x: x + w / 2, y: y + h / 2 + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor }, g);
      t.textContent = view.$type === 'UMLDeepHistory' ? 'H*' : 'H';
      break;
    }
    case 'junction': {
      // filled diamond (small)
      const cx = x + w / 2, cy = y + h / 2;
      const s = Math.min(w, h) / 2;
      svgEl('path', { d: `M ${cx} ${cy - s} L ${cx + s} ${cy} L ${cx} ${cy + s} L ${cx - s} ${cy} Z`, fill: '#353535', stroke: '#353535', class: 'node-frame' }, g);
      break;
    }
    case 'decision':
    case 'merge': {
      const cx = x + w / 2, cy = y + h / 2;
      const sw = w / 2, sh = h / 2;
      svgEl('path', { d: `M ${cx} ${cy - sh} L ${cx + sw} ${cy} L ${cx} ${cy + sh} L ${cx - sw} ${cy} Z`, fill, stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      break;
    }
    case 'fork': {
      // filled bar (fork/join node)
      svgEl('rect', { x, y, width: w, height: h, fill: '#353535', stroke: '#353535', class: 'node-frame' }, g);
      break;
    }
    case 'note': {
      const fold = 12;
      svgEl('path', {
        d: `M ${x} ${y} L ${x + w - fold} ${y} L ${x + w} ${y + fold} L ${x + w} ${y + h} L ${x} ${y + h} Z`,
        fill: view.fillColor || '#ffffef', stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      svgEl('path', { d: `M ${x + w - fold} ${y} L ${x + w - fold} ${y + fold} L ${x + w} ${y + fold}`, fill: 'none', stroke: line }, g);
      const text = model.documentation || '';
      const words = text.split(/\s+/).filter(Boolean);
      const maxChars = Math.floor((w - 10) / (fs * 0.62));
      const lines = [];
      let cur = '';
      for (const wd of words) {
        const test = cur ? cur + ' ' + wd : wd;
        if (test.length > maxChars && cur) { lines.push(cur); cur = wd; } else cur = test;
        if (lines.length >= Math.floor((h - 10) / (fs + 3))) break;
      }
      if (cur && lines.length < Math.floor((h - 10) / (fs + 3))) lines.push(cur);
      let ty = y + 8 + fs;
      for (const ln of lines) {
        const t = svgEl('text', { x: x + 6, y: ty, 'font-size': fs, fill: '#555' }, g);
        t.textContent = ln;
        ty += fs + 3;
      }
      meta.textSlots.body = { box: new Rect(x, y, w, h), text: model.documentation || '', field: 'documentation', align: 'left' };
      meta.textSlots.name = meta.textSlots.body;
      break;
    }
  }
  return meta;
}
