// nodeviews.js — SVG rendering for node-shaped diagram views.
// Each renderer draws into a <g class="node-main"> and reports compartment boxes
// used for text editing and hit-testing.

import { Rect } from '../core/geometry.js';
import { VISIBILITY } from '../core/metamodel.js';

const SVGNS = 'http://www.w3.org/2000/svg';

/** Width of the name gutter at the left of a timing-diagram lane. */
export const TIMING_LANE_LABEL_W = 110;

export function svgEl(tag, attrs = {}, parent = null) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  if (parent) parent.appendChild(el);
  return el;
}

/**
 * Effective node size: the persisted width/height is the user's minimum, while
 * `__autoW` / `__autoH` cache the size required by the current content. They are
 * derived layout values (not serialized), so adding/removing members can shrink
 * a box without turning layout into an undoable model edit.
 */
export function viewW(v) { return Math.max(v.width || 0, v.__autoW || 0); }
export function viewH(v) { return Math.max(v.height || 0, v.__autoH || 0); }

/** Instance notation: `name : Classifier` (UML object/instance). */
export function instanceLabel(model) {
  const cls = (model && model.classifier) || '';
  const name = (model && model.name) || '';
  if (!cls) return name;
  return name ? `${name} : ${cls}` : `: ${cls}`;
}

/** `{tag=value, ...}` suffix (StarUML property string). */export function fmtTags(el) {
  const tags = (el && el.tags) || [];
  if (!tags.length) return '';
  const parts = tags
    .map((t) => (t.value !== undefined && t.value !== '' ? `${t.name}=${t.value}` : t.name))
    .filter(Boolean);
  return parts.length ? ` {${parts.join(', ')}}` : '';
}

export function fmtAttribute(a, opts = {}) {
  const vis = opts.showVisibility === false ? '' : (VISIBILITY[a.visibility]?.symbol ?? '+');
  const staticPrefix = a.isStatic ? 'underline' : '';
  const typePart = opts.showType === false || !a.type ? '' : `: ${a.type}`;
  const multPart = opts.showMultiplicity === false || !a.multiplicity ? '' : ` [${a.multiplicity}]`;
  const defPart = a.defaultValue ? ` = ${a.defaultValue}` : '';
  return { text: `${vis}${a.name}${typePart}${multPart}${defPart}${fmtTags(a)}`, staticPrefix };
}

export function fmtOperation(op, opts = {}) {
  const vis = opts.showVisibility === false ? '' : (VISIBILITY[op.visibility]?.symbol ?? '+');
  if (opts.showOperationSignature === false) {
    return { text: `${vis}${op.name}${fmtTags(op)}`, staticPrefix: op.isStatic ? 'underline' : '' };
  }
  const params = (op.parameters || []).map((p) => `${p.name}${opts.showType === false || !p.type ? '' : ': ' + p.type}`).join(', ');
  const ret = opts.showType === false || !op.returnType ? '' : `: ${op.returnType}`;
  return { text: `${vis}${op.name}(${params})${ret}${fmtTags(op)}`, staticPrefix: op.isStatic ? 'underline' : '' };
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

/** Greedy word wrap; overlong words are split at the character limit. */
function wrapText(text, maxChars) {
  const raw = String(text ?? '');
  if (!maxChars || maxChars < 4 || raw.length <= maxChars) return [raw];
  const lines = [];
  let cur = '';
  for (const word of raw.split(/\s+/)) {
    if (!word) continue;
    let rest = word;
    while (rest.length > maxChars) {
      if (cur) { lines.push(cur); cur = ''; }
      lines.push(rest.slice(0, maxChars));
      rest = rest.slice(maxChars);
    }
    if (!cur) cur = rest;
    else if ((cur + ' ' + rest).length <= maxChars) cur += ' ' + rest;
    else { lines.push(cur); cur = rest; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** Nearest named owner (package/model) for `(from X)` notation. */
function namespaceOf(model) {
  let p = model && model.__parent;
  while (p) {
    if (p.type !== 'Project' && p.name) return p.name;
    p = p.__parent;
  }
  return '';
}

/** Find the UMLStereotype definition matching `model.stereotype` (project-wide DFS). */
function stereotypeModel(model) {
  if (!model || !model.stereotype) return null;
  let root = model;
  while (root.__parent) root = root.__parent;
  const found = [];
  const seen = new Set();
  (function dfs(n) {
    if (!n || typeof n !== 'object' || seen.has(n) || found.length) return;
    seen.add(n);
    if (n.type === 'UMLStereotype' && n.name === model.stereotype) { found.push(n); return; }
    for (const c of n.ownedElements || []) dfs(c);
  })(root);
  return found[0] || null;
}

/**
 * Stereotype display modes follow StarUML's UMLStereotypeDisplayKind:
 * label shows «…», decoration adds a small icon at the top-right,
 * icon replaces the top region with a large icon (…-label keeps the label).
 */
const SD_ICON_SIZE = 24;       // StarUML DECORATION_ICON_WIDTH/HEIGHT
const SD_ICON_PAD = 4;         // StarUML compartment paddings

function decorationShift(sd) {
  return sd === 'decoration' || sd === 'decoration-label' ? SD_ICON_SIZE + SD_ICON_PAD : 0;
}

function drawStereotypeIcon(g, r, stereo, line, fontColor) {
  svgEl('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: '#ffffff', stroke: line, 'stroke-width': 1 }, g);
  if (stereo && stereo.icon) {
    const t = svgEl('text', {
      x: r.x + r.w / 2, y: r.y + r.h / 2 + Math.min(r.w, r.h) * 0.22,
      'text-anchor': 'middle', 'font-size': Math.min(r.w, r.h) * 0.62, fill: fontColor,
    }, g);
    t.textContent = stereo.icon;
  } else {
    // StarUML placeholder icon: rectangle with both diagonals
    svgEl('line', { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y + r.h, stroke: line, 'stroke-width': 1 }, g);
    svgEl('line', { x1: r.x + r.w, y1: r.y, x2: r.x, y2: r.y + r.h, stroke: line, 'stroke-width': 1 }, g);
  }
}

function drawNameBlock(g, x, y, w, {
  fontSize = 12, bold = true, italic = false, color = '#353535',
  stereotype = null, nameLines = [''], namespace = '', property = '',
} = {}) {
  let yy = y;
  if (stereotype) {
    const st = svgEl('text', {
      x: x + w / 2, y: yy + fontSize, 'text-anchor': 'middle',
      'font-size': fontSize, 'font-style': 'italic', fill: color, 'font-family': 'inherit',
    }, g);
    st.textContent = stereotype;
    yy += fontSize + 2;
  }
  for (const line of nameLines) {
    const t = svgEl('text', {
      x: x + w / 2, y: yy + fontSize, 'text-anchor': 'middle',
      'font-size': fontSize, 'font-weight': bold ? 700 : 400,
      'font-style': italic ? 'italic' : 'normal', fill: color, 'font-family': 'inherit',
    }, g);
    t.textContent = line;
    yy += fontSize + 2;
  }
  if (namespace) {
    const t = svgEl('text', {
      x: x + w / 2, y: yy + fontSize - 1, 'text-anchor': 'middle',
      'font-size': Math.max(9, fontSize - 2), 'font-style': 'italic',
      fill: '#6b7272', 'font-family': 'inherit',
    }, g);
    t.textContent = `(from ${namespace})`;
    yy += fontSize;
  }
  if (property) {
    const t = svgEl('text', {
      x: x + w / 2, y: yy + Math.max(9, fontSize - 2), 'text-anchor': 'middle',
      'font-size': Math.max(9, fontSize - 2), 'font-weight': 400,
      fill: color, 'font-family': 'inherit',
    }, g);
    t.textContent = property;
    yy += Math.max(9, fontSize - 2) + 1;
  }
  return yy - y;
}

function drawCompartmentList(g, items, box, fontSize, color, wrapChars = 0) {
  const out = [];
  let y = box.y + 4;
  for (const it of items) {
    const lines = wrapChars ? wrapText(it.text, wrapChars) : [it.text];
    lines.forEach((line, idx) => {
      const t = svgEl('text', {
        x: box.x + 6, y: y + fontSize, 'font-size': fontSize, fill: color, 'font-family': 'inherit',
      }, g);
      t.textContent = line;
      if (idx === 0 && it.staticPrefix === 'underline') t.setAttribute('text-decoration', 'underline');
      out.push({ el: t, y: y + fontSize });
      y += fontSize + 4;
    });
  }
  return out;
}

function compartmentHeight(items, fontSize, wrapChars = 0) {
  if (!items.length) return 12;
  let rows = 0;
  for (const it of items) rows += wrapChars ? wrapText(it.text, wrapChars).length : 1;
  return rows * (fontSize + 4) + 4;
}

/**
 * Base node renderer. view = {x,y,width,height,fillColor,lineColor,fontColor,fontSize}
 * model = the referenced model element.
 */
export function renderNode(g, view, model, kind) {
  model = model || {};   // view-only shapes (text, time ticks) have no model
  const x = view.x, y = view.y, w = viewW(view), h = viewH(view);
  const fill = view.fillColor || '#ffffff';
  const line = view.lineColor || '#353535';
  const fontColor = view.fontColor || '#353535';
  const fs = view.fontSize || 12;
  const meta = { textSlots: {}, compartments: {} };

  switch (kind) {
    case 'class':
    case 'datatype':
    case 'interface':
    case 'information':
    case 'metaclass':
    case 'stereotype':
    case 'signal': {
      const showAttrs = !view.suppressAttributes;
      const showOps = !view.suppressOperations;
      const memberOpts = {
        showVisibility: view.showVisibility !== false,
        showType: view.showType !== false,
        showOperationSignature: view.showOperationSignature !== false,
        showMultiplicity: view.showMultiplicity !== false,
      };
      const attrs = showAttrs ? (model.attributes || []).map((a) => fmtAttribute(a, memberOpts)) : [];
      const ops = showOps ? (model.operations || []).map((o) => fmtOperation(o, memberOpts)) : [];
      const forced = {
        interface: '«interface»',
        information: '«information»',
        metaclass: '«metaClass»',
        stereotype: '«stereotype»',
        signal: '«signal»',
      }[kind];
      const sd = view.stereotypeDisplay || 'label';
      const labelShown = sd === 'label' || sd === 'decoration-label' || sd === 'icon-label';
      const stereotype = (forced || model.stereotype) && labelShown ? (forced || model.stereotype) : null;
      const stereo = !forced ? stereotypeModel(model) : null;
      const wrapChars = view.autoWrap ? Math.max(4, Math.floor((w - 10) / (fs * 0.62))) : 0;
      const nameLines = wrapChars ? wrapText(model.name, wrapChars) : [model.name];
      const namespace = view.showNamespace ? namespaceOf(model) : '';
      const property = view.showProperty !== false ? fmtTags(model) : '';
      const nameH = (stereotype ? fs + 2 : 0) + nameLines.length * (fs + 2)
        + (namespace ? fs + 1 : 0) + (property ? Math.max(9, fs - 2) + 1 : 0) + 6;
      const attrH = showAttrs ? compartmentHeight(attrs, fs, wrapChars) : 0;
      const opH = showOps ? compartmentHeight(ops, fs, wrapChars) : 0;
      // template parameters sit in a compartment overlapping the top-right corner;
      // the name/attribute/operation area is shifted down by its height (StarUML layout)
      const tps = (model.templateParameters || []).filter((p) => p && p.name);
      const tpItems = tps.map((p) => `${p.name}${p.type ? ' : ' + p.type : ''}`);
      const tpTextW = tpItems.length ? Math.max(...tpItems.map((t) => t.length * fs * 0.6)) + 14 : 0;
      const tpBoxW = tpItems.length ? Math.min(w, Math.max(46, tpTextW)) : 0;
      const tpBoxH = tpItems.length ? tpItems.length * (fs + 3) + 8 : 0;
      const tpShift = tpBoxH ? Math.max(0, tpBoxH - 8) : 0;
      const iconic = sd === 'icon' || sd === 'icon-label';
      // icon form: StarUML reserves a square (min 24px) above the compartments
      const iconH = iconic ? Math.max(SD_ICON_SIZE, Math.min(w - 4, SD_ICON_SIZE)) : 0;
      const requiredH = tpShift + iconH + nameH + attrH + opH;
      const hEff = Math.max(h, requiredH);
      meta.autoHeight = requiredH;
      // frame
      svgEl('rect', { x, y, width: w, height: hEff, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      // icon form: large icon centered in the top region (StarUML arrangeAsIconicForm)
      let contentTop = y + tpShift;
      if (iconic) {
        const regionH = hEff - tpShift - (nameH + attrH + opH);
        const side = Math.min(w - 4, Math.max(SD_ICON_SIZE, regionH));
        drawStereotypeIcon(g, { x: x + (w - side) / 2, y: contentTop + 2, w: side, h: side }, stereo, line, fontColor);
        contentTop += side + 2;
      }
      // decoration form: small icon in the top-right corner (drawAsDecorationForm)
      const nameW = w - (decorationShift(sd) ? SD_ICON_SIZE + SD_ICON_PAD * 2 : 0);
      // name compartment (tag values are the property string on their own line)
      drawNameBlock(g, x, contentTop + 4, nameW, {
        fontSize: fs, color: fontColor, stereotype, italic: kind === 'datatype',
        nameLines, namespace, property,
      });
      if (decorationShift(sd)) {
        drawStereotypeIcon(g, {
          x: x + w - SD_ICON_PAD - SD_ICON_SIZE, y: y + SD_ICON_PAD,
          w: SD_ICON_SIZE, h: SD_ICON_SIZE,
        }, stereo, line, fontColor);
      }
      // template parameter compartment at the top-right corner
      if (tpItems.length) {
        const bx = x + w - tpBoxW, by = y;
        svgEl('rect', {
          x: bx, y: by, width: tpBoxW, height: tpBoxH, fill: '#ffffff', stroke: line,
          'stroke-width': 1, 'stroke-dasharray': '5 3', class: 'node-frame',
        }, g);
        let ty = by + fs + 2;
        for (const it of tpItems) {
          const t = svgEl('text', { x: bx + 6, y: ty, 'font-size': fs - 1, fill: fontColor }, g);
          t.textContent = it;
          ty += fs + 3;
        }
      }
      let yy = contentTop + nameH;
      if (showAttrs) {
        svgEl('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: line, 'stroke-width': 1 }, g);
        meta.compartments.attributes = new Rect(x + 1, yy, w - 2, attrH);
        drawCompartmentList(g, attrs, { x, y: yy, width: w }, fs, fontColor, wrapChars);
        yy += attrH;
      }
      if (showOps) {
        svgEl('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: line, 'stroke-width': 1 }, g);
        meta.compartments.operations = new Rect(x + 1, yy, w - 2, opH);
        drawCompartmentList(g, ops, { x, y: yy, width: w }, fs, fontColor, wrapChars);
        yy += opH;
      }
      if ((showAttrs || showOps) && yy < y + hEff - 1) {
        svgEl('line', { x1: x, y1: y + hEff, x2: x + w, y2: y + hEff, stroke: line }, g);
      }
      meta.textSlots.name = { box: new Rect(x, contentTop, w, nameH + 4), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'nary': {
      const cx = x + w / 2, cy = y + h / 2;
      const hw = w / 2, hh = h / 2;
      svgEl('path', {
        d: `M ${cx} ${cy - hh} L ${cx + hw} ${cy} L ${cx} ${cy + hh} L ${cx - hw} ${cy} Z`,
        fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      if (model.name) {
        const t = svgEl('text', {
          x: cx, y: y + h + fs + 2, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor,
        }, g);
        t.textContent = model.name;
      }
      meta.textSlots.name = { box: new Rect(x, y + h + 2, w, fs + 4), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'primitive': {
      // primitive type: classifier box with a «primitive» label
      const requiredH = fs + 20;
      const hEff = Math.max(h, requiredH);
      meta.autoHeight = requiredH;
      svgEl('rect', { x, y, width: w, height: hEff, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      drawName(g, x, y + 4, w, model.name + fmtTags(model), { fontSize: fs, color: fontColor, stereotype: '«primitive»' });
      meta.textSlots.name = { box: new Rect(x, y, w, hEff), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'frame': {
      // generic UML frame: rectangle with a name tab, usable as a container
      const tabH = 20;
      const tabW = Math.min(160, Math.max(60, w * 0.55));
      svgEl('rect', {
        x, y, width: w, height: h, fill: view.fillColor || '#ffffff', stroke: line,
        'stroke-width': 1, class: 'node-frame',
      }, g);
      svgEl('path', {
        d: `M ${x} ${y} L ${x + tabW} ${y} L ${x + tabW + 8} ${y + tabH / 2} L ${x + tabW} ${y + tabH} L ${x} ${y + tabH} Z`,
        fill: '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      const t = svgEl('text', {
        x: x + 8, y: y + tabH / 2 + fs * 0.35, 'font-size': fs, 'font-weight': 700, fill: fontColor,
      }, g);
      t.textContent = model.name + fmtTags(model);
      meta.textSlots.name = { box: new Rect(x, y, tabW, tabH), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'enumeration': {
      const showLits = !view.suppressLiterals;
      const lits = showLits ? (model.literals || []).map((l) => ({ text: l.name })) : [];
      const sd = view.stereotypeDisplay || 'label';
      const labelShown = sd === 'label' || sd === 'decoration-label' || sd === 'icon-label';
      const stereotype = labelShown ? '«enumeration»' : null;
      const stereo = stereotypeModel(model);
      const wrapChars = view.autoWrap ? Math.max(4, Math.floor((w - 10) / (fs * 0.62))) : 0;
      const nameLines = wrapChars ? wrapText(model.name, wrapChars) : [model.name];
      const namespace = view.showNamespace ? namespaceOf(model) : '';
      const property = view.showProperty !== false ? fmtTags(model) : '';
      const nameH = (stereotype ? fs + 2 : 0) + nameLines.length * (fs + 2)
        + (namespace ? fs + 1 : 0) + (property ? Math.max(9, fs - 2) + 1 : 0) + 6;
      const litH = showLits ? compartmentHeight(lits, fs, wrapChars) : 0;
      const iconic = sd === 'icon' || sd === 'icon-label';
      const iconH = iconic ? SD_ICON_SIZE : 0;
      const requiredH = iconH + nameH + litH;
      const hEff = Math.max(h, requiredH);
      meta.autoHeight = requiredH;
      svgEl('rect', { x, y, width: w, height: hEff, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      let contentTop = y;
      if (iconic) {
        const regionH = hEff - (nameH + litH);
        const side = Math.min(w - 4, Math.max(SD_ICON_SIZE, regionH));
        drawStereotypeIcon(g, { x: x + (w - side) / 2, y: contentTop + 2, w: side, h: side }, stereo, line, fontColor);
        contentTop += side + 2;
      }
      const nameW = w - (decorationShift(sd) ? SD_ICON_SIZE + SD_ICON_PAD * 2 : 0);
      drawNameBlock(g, x, contentTop + 4, nameW, {
        fontSize: fs, color: fontColor, stereotype, nameLines, namespace, property,
      });
      if (decorationShift(sd)) {
        drawStereotypeIcon(g, {
          x: x + w - SD_ICON_PAD - SD_ICON_SIZE, y: y + SD_ICON_PAD,
          w: SD_ICON_SIZE, h: SD_ICON_SIZE,
        }, stereo, line, fontColor);
      }
      if (showLits) {
        const yy = contentTop + nameH;
        svgEl('line', { x1: x, y1: yy, x2: x + w, y2: yy, stroke: line }, g);
        meta.compartments.literals = new Rect(x + 1, yy, w - 2, litH);
        drawCompartmentList(g, lits, { x, y: yy, width: w }, fs, fontColor, wrapChars);
      }
      meta.textSlots.name = { box: new Rect(x, contentTop, w, nameH + 4), text: model.name, field: 'name', align: 'center' };
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
      if (model.stereotype === 'profile') {
        const st = svgEl('text', { x: x + 6, y: y + tabH + fs + 2, 'font-size': fs, 'font-style': 'italic', fill: fontColor }, g);
        st.textContent = '«profile»';
      }
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
      const headH = viewH(view);
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
    case 'component':
    case 'componentInst': {
      // component rectangle with two small tab rectangles on the left edge
      const inst = kind === 'componentInst';
      const label = inst ? instanceLabel(model) : model.name;
      svgEl('rect', { x: x + 12, y, width: w - 12, height: h, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      svgEl('rect', { x, y: y + h * 0.18, width: 12, height: h * 0.28, fill: '#fff', stroke: line, 'stroke-width': 1 }, g);
      svgEl('rect', { x, y: y + h * 0.54, width: 12, height: h * 0.28, fill: '#fff', stroke: line, 'stroke-width': 1 }, g);
      const t = svgEl('text', {
        x: x + 12 + (w - 12) / 2, y: y + h / 2 + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor,
        'text-decoration': inst ? 'underline' : 'none',
      }, g);
      t.textContent = label;
      if (inst) meta.autoWidth = label.length * fs * 0.62 + 24;
      meta.textSlots.name = { box: new Rect(x + 12, y, w - 12, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'artifact':
    case 'artifactInst': {
      // document shape with folded top-right corner
      const inst = kind === 'artifactInst';
      const label = inst ? instanceLabel(model) : model.name;
      const fold = 12;
      svgEl('path', {
        d: `M ${x} ${y} L ${x + w - fold} ${y} L ${x + w} ${y + fold} L ${x + w} ${y + h} L ${x} ${y + h} Z`,
        fill, stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      svgEl('path', { d: `M ${x + w - fold} ${y} L ${x + w - fold} ${y + fold} L ${x + w} ${y + fold}`, fill: 'none', stroke: line }, g);
      const t = svgEl('text', {
        x: x + w / 2, y: y + h / 2 + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor,
        'text-decoration': inst ? 'underline' : 'none',
      }, g);
      t.textContent = label;
      if (inst) meta.autoWidth = label.length * fs * 0.62 + 18;
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'node3d':
    case 'nodeInst': {
      // deployment node drawn as a 3D box
      const inst = kind === 'nodeInst';
      const label = inst ? instanceLabel(model) : model.name;
      const d = 8;
      svgEl('path', {
        d: `M ${x} ${y + d} L ${x + w} ${y + d} L ${x + w} ${y + h} L ${x} ${y + h} Z`,
        fill, stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      svgEl('path', { d: `M ${x} ${y + d} L ${x + d} ${y} L ${x + w + d} ${y} L ${x + w} ${y + d}`, fill: '#fff', stroke: line, 'stroke-width': 1 }, g);
      svgEl('path', { d: `M ${x + w} ${y + d} L ${x + w + d} ${y} L ${x + w + d} ${y + h - d} L ${x + w} ${y + h}`, fill: '#fff', stroke: line, 'stroke-width': 1 }, g);
      const t = svgEl('text', {
        x: x + w / 2, y: y + h / 2 + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor,
        'text-decoration': inst ? 'underline' : 'none',
      }, g);
      t.textContent = label;
      if (inst) meta.autoWidth = label.length * fs * 0.62 + 18;
      meta.textSlots.name = { box: new Rect(x, y + d, w, h - d), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'providedInterface': {
      const r = Math.max(4, Math.min(w, h) / 2 - 1);
      const cx = x + w / 2, cy = y + h / 2;
      svgEl('circle', { cx, cy, r, fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      if (model.name) {
        const t = svgEl('text', { x: x + w + 4, y: cy + fs * 0.35, 'font-size': fs, fill: fontColor }, g);
        t.textContent = model.name;
      }
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'requiredInterface': {
      const r = Math.max(4, Math.min(w, h) / 2 - 1);
      const cx = x + w / 2, cy = y + h / 2;
      svgEl('path', {
        d: `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r}`,
        fill: 'none', stroke: line, 'stroke-width': 1.4, class: 'node-frame',
      }, g);
      svgEl('line', { x1: x, y1: cy, x2: cx, y2: cy, stroke: line, 'stroke-width': 1 }, g);
      if (model.name) {
        const t = svgEl('text', { x: x + w + 4, y: cy + fs * 0.35, 'font-size': fs, fill: fontColor }, g);
        t.textContent = model.name;
      }
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'object': {
      // object: underlined "name : Classifier", plus a slot compartment
      const label = instanceLabel(model);
      const slots = (model.slots || []).filter((s) => s && (s.name || s.value));
      const slotLines = slots.map((s) => `${s.name || ''} = ${s.value ?? ''}`);
      const nameH = fs + 14;
      const slotH = slotLines.length ? slotLines.length * (fs + 4) + 6 : 0;
      const requiredH = nameH + slotH;
      const hEff = Math.max(h, requiredH);
      meta.autoHeight = requiredH;
      svgEl('rect', { x, y, width: w, height: hEff, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const nameY = slotLines.length ? y + fs + 4 : y + hEff / 2 + fs * 0.35;
      const t = svgEl('text', {
        x: x + w / 2, y: nameY, 'text-anchor': 'middle', 'font-size': fs,
        fill: fontColor, 'text-decoration': 'underline',
      }, g);
      t.textContent = label;
      if (slotLines.length) {
        svgEl('line', { x1: x, y1: y + nameH, x2: x + w, y2: y + nameH, stroke: line, 'stroke-width': 1 }, g);
        slotLines.forEach((text, i) => {
          const st = svgEl('text', {
            x: x + 6, y: y + nameH + fs + 2 + i * (fs + 4), 'font-size': fs, fill: fontColor,
          }, g);
          st.textContent = text;
        });
      }
      const widest = Math.max(label.length, ...slotLines.map((s) => s.length), 0);
      meta.autoWidth = widest * fs * 0.62 + 18;
      meta.textSlots.name = { box: new Rect(x, y, w, nameH), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'subsystem': {
      // package shape with a small component glyph in the tab
      const tabH = 18, tabW = Math.min(80, w * 0.6);
      svgEl('rect', { x, y, width: tabW, height: tabH, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      svgEl('rect', { x: x + 5, y: y + 3, width: 7, height: 6, fill: '#fff', stroke: line, 'stroke-width': 0.8 }, g);
      svgEl('rect', { x: x + 2, y: y + 5, width: 3, height: 2.4, fill: '#fff', stroke: line, 'stroke-width': 0.8 }, g);
      const t = svgEl('text', { x: x + 17, y: y + 13, 'font-size': fs, fill: fontColor }, g);
      t.textContent = model.name;
      svgEl('rect', { x, y: y + tabH - 1, width: w, height: h - tabH + 1, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      meta.textSlots.name = { box: new Rect(x, y, tabW, tabH), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'swimlaneV':
    case 'swimlaneH': {
      // partition with a title band (vertical: left band with rotated text)
      svgEl('rect', { x, y, width: w, height: h, fill: view.fillColor || '#fafbfb', stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const band = 30;
      const name = (model && model.name) || view.text || view.laneName || '';
      const nameBold = true;
      if (kind === 'swimlaneV') {
        svgEl('rect', { x, y, width: band, height: h, fill: '#f0f2f2', stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
        const g2 = svgEl('g', { transform: `translate(${x + band / 2}, ${y + h / 2}) rotate(-90)` }, g);
        const t = svgEl('text', { x: 0, y: fs * 0.35, 'text-anchor': 'middle', 'font-size': fs + 1, 'font-weight': 700, fill: fontColor }, g2);
        t.textContent = name;
        meta.textSlots.name = { box: new Rect(x, y, band, h), text: name, field: 'laneName', align: 'center' };
      } else {
        svgEl('rect', { x, y, width: w, height: band, fill: '#f0f2f2', stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
        const t = svgEl('text', { x: x + w / 2, y: y + band / 2 + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs + 1, 'font-weight': 700, fill: fontColor }, g);
        t.textContent = name;
        meta.textSlots.name = { box: new Rect(x, y, w, band), text: name, field: 'laneName', align: 'center' };
      }
      break;
    }
    case 'orthogonal': {
      svgEl('rect', {
        x, y, width: w, height: h, rx: 12, ry: 12,
        fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      const t = svgEl('text', {
        x: x + w / 2, y: y + fs + 8, 'text-anchor': 'middle',
        'font-size': fs, 'font-weight': 700, fill: fontColor,
      }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, w, fs + 14), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'region': {
      svgEl('rect', {
        x, y, width: w, height: h,
        fill: view.fillColor || 'none', stroke: line, 'stroke-width': 1,
        'stroke-dasharray': '7 4', class: 'node-frame',
      }, g);
      const t = svgEl('text', {
        x: x + 8, y: y + fs + 2, 'font-size': fs, fill: fontColor, 'font-style': 'italic',
      }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, Math.min(w, 160), fs + 8), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'submachine': {
      svgEl('rect', {
        x, y, width: w, height: h, rx: 12, ry: 12,
        fill, stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      const st = svgEl('text', {
        x: x + w / 2, y: y + 14, 'text-anchor': 'middle',
        'font-size': fs - 2, 'font-style': 'italic', fill: fontColor,
      }, g);
      st.textContent = '«submachine»';
      const t = svgEl('text', {
        x: x + w / 2, y: y + fs + 16, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor,
      }, g);
      t.textContent = model.name;
      if (model.submachine) {
        const sub = svgEl('text', {
          x: x + w / 2, y: y + fs * 2 + 18, 'text-anchor': 'middle',
          'font-size': fs - 2, fill: fontColor,
        }, g);
        sub.textContent = `→ ${model.submachine}`;
      }
      meta.textSlots.name = { box: new Rect(x, y, w, fs + 24), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'entryPoint':
    case 'exitPoint':
    case 'connectionPoint': {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.max(4, Math.min(w, h) / 2 - 1);
      svgEl('circle', { cx, cy, r, fill: '#ffffff', stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      const label = kind === 'entryPoint' ? 'E' : kind === 'exitPoint' ? 'X' : (model.name || '');
      if (label) {
        const t = svgEl('text', {
          x: cx, y: cy + fs * 0.3, 'text-anchor': 'middle', 'font-size': fs - 3, fill: fontColor,
        }, g);
        t.textContent = label;
      }
      if (kind === 'connectionPoint' && model.name) {
        const t = svgEl('text', { x: x + w + 3, y: cy + fs * 0.35, 'font-size': fs - 2, fill: fontColor }, g);
        t.textContent = model.name;
      }
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'terminate': {
      const cx = x + w / 2, cy = y + h / 2;
      const r = Math.min(w, h) / 2;
      svgEl('circle', { cx, cy, r, fill: '#ffffff', stroke: line, 'stroke-width': 1.4, class: 'node-frame' }, g);
      const k = r * 0.55;
      svgEl('line', { x1: cx - k, y1: cy - k, x2: cx + k, y2: cy + k, stroke: line, 'stroke-width': 1.6 }, g);
      svgEl('line', { x1: cx - k, y1: cy + k, x2: cx + k, y2: cy - k, stroke: line, 'stroke-width': 1.6 }, g);
      break;
    }
    case 'composite': {
      // composite state: rounded rect + name compartment line
      svgEl('rect', { x, y, width: w, height: h, rx: 12, ry: 12, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const nameH = fs + 16;
      svgEl('line', { x1: x, y1: y + nameH, x2: x + w, y2: y + nameH, stroke: line, 'stroke-width': 1 }, g);
      const t = svgEl('text', { x: x + w / 2, y: y + nameH - 7, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor, 'font-weight': 700 }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, w, nameH), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'centralBuffer':
    case 'dataStore':
    case 'activityParam': {
      const stereo = kind === 'centralBuffer' ? '«centralBuffer»'
        : kind === 'dataStore' ? '«datastore»' : '«parameter»';
      svgEl('rect', { x, y, width: w, height: h, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const st = svgEl('text', {
        x: x + 5, y: y + fs, 'font-size': fs - 2, 'font-style': 'italic', fill: fontColor,
      }, g);
      st.textContent = stereo;
      const t = svgEl('text', {
        x: x + w / 2, y: y + h / 2 + fs * 0.45, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor,
      }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'pin': {
      // input/output pin: small square attached to an action or structured node
      svgEl('rect', { x, y, width: w, height: h, fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      if (model.name) {
        const t = svgEl('text', {
          x: x + w + 4, y: y + h / 2 + fs * 0.35, 'font-size': fs - 1, fill: fontColor,
        }, g);
        t.textContent = model.name;
      }
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'structured': {
      svgEl('rect', {
        x, y, width: w, height: h, rx: 7, ry: 7,
        fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1.2, class: 'node-frame',
      }, g);
      const t = svgEl('text', {
        x: x + w / 2, y: y + fs + 6, 'text-anchor': 'middle',
        'font-size': fs, 'font-weight': 700, fill: fontColor,
      }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, w, fs + 12), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'interruptible': {
      svgEl('rect', {
        x, y, width: w, height: h,
        fill: view.fillColor || 'none', stroke: line, 'stroke-width': 1,
        'stroke-dasharray': '7 4', class: 'node-frame',
      }, g);
      const t = svgEl('text', {
        x: x + 8, y: y + fs + 2, 'font-size': fs, fill: fontColor, 'font-style': 'italic',
      }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, Math.min(w, 180), fs + 8), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'timeEvent': {
      const cx = x + w / 2;
      svgEl('path', {
        d: `M ${x + 6} ${y} L ${x + w - 6} ${y} L ${cx} ${y + h / 2} L ${x + w - 6} ${y + h} L ${x + 6} ${y + h} L ${cx} ${y + h / 2} Z`,
        fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1.2, class: 'node-frame',
      }, g);
      const t = svgEl('text', {
        x: cx, y: y + h + fs + 2, 'text-anchor': 'middle', 'font-size': fs - 1, fill: fontColor,
      }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, w, h + fs + 4), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'objectnode': {
      // object flow node: rectangle with underlined name
      svgEl('rect', { x, y, width: w, height: h, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const t = svgEl('text', { x: x + w / 2, y: y + h / 2 + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor, 'text-decoration': 'underline' }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'sendsignal':
    case 'acceptsignal': {
      // pentagon (send) / left-notched shape (accept)
      const notch = 16;
      let dPath;
      if (kind === 'sendsignal') {
        dPath = `M ${x} ${y} L ${x + w - notch} ${y} L ${x + w} ${y + h / 2} L ${x + w - notch} ${y + h} L ${x} ${y + h} Z`;
      } else {
        dPath = `M ${x + notch} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x + notch} ${y + h} L ${x} ${y + h / 2} Z`;
      }
      svgEl('path', { d: dPath, fill, stroke: line, 'stroke-width': 1, class: 'node-frame' }, g);
      const tx = x + (kind === 'sendsignal' ? (w - notch) / 2 : notch + (w - notch) / 2);
      const t = svgEl('text', { x: tx, y: y + h / 2 + fs * 0.35, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor, 'font-style': 'italic' }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'fragment': {
      // combined fragment: frame + pentagon operator tab + interaction operands
      const operands = (model.operands && model.operands.length) ? model.operands : [{ guard: '' }];
      const tabH = 22;
      svgEl('rect', { x, y, width: w, height: h, fill: view.fillColor || 'none', stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      // pentagon tab: (x,y) → (x+tw,y) → (x+tw+8,y+tabH/2) → (x+tw,y+tabH) → (x,y+tabH)
      const tw = Math.max(34, 16 + String(model.operator || 'alt').length * 7);
      svgEl('path', {
        d: `M ${x} ${y} L ${x + tw} ${y} L ${x + tw + 8} ${y + tabH / 2} L ${x + tw} ${y + tabH} L ${x} ${y + tabH} Z`,
        fill: '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      const opText = svgEl('text', {
        x: x + tw / 2, y: y + tabH / 2 + fs * 0.36, 'text-anchor': 'middle',
        'font-size': fs, 'font-weight': 700, fill: fontColor,
      }, g);
      opText.textContent = model.operator || 'alt';
      // operand separators + guards (custom boundaries when present, else even split)
      const innerY = y + tabH, innerH = Math.max(10, h - tabH);
      const n = operands.length;
      const fractions = (Array.isArray(model.operandBoundaries) && model.operandBoundaries.length === n - 1)
        ? model.operandBoundaries
        : Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);
      const starts = [innerY, ...fractions.map((f) => innerY + innerH * f)];
      operands.forEach((op, i) => {
        const oy = starts[i];
        if (i > 0) {
          svgEl('line', { x1: x, y1: oy, x2: x + w, y2: oy, stroke: line, 'stroke-width': 1, 'stroke-dasharray': '5 4' }, g);
        }
        if (op.guard) {
          const gt = svgEl('text', { x: x + 8, y: oy + fs + 6, 'font-size': fs - 1, fill: fontColor }, g);
          gt.textContent = op.guard;
        }
      });
      // operator text is editable in place
      meta.textSlots.operator = { box: new Rect(x, y, tw, tabH), text: model.operator || 'alt', field: 'operator', align: 'center' };
      break;
    }
    case 'ref': {
      // interaction use: frame with a "ref" tab, referenced interaction centered
      const tabH = 22;
      svgEl('rect', { x, y, width: w, height: h, fill: view.fillColor || 'none', stroke: line, 'stroke-width': 1.2, class: 'node-frame' }, g);
      const tw = 34;
      svgEl('path', {
        d: `M ${x} ${y} L ${x + tw} ${y} L ${x + tw + 8} ${y + tabH / 2} L ${x + tw} ${y + tabH} L ${x} ${y + tabH} Z`,
        fill: '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      const rt = svgEl('text', {
        x: x + tw / 2, y: y + tabH / 2 + fs * 0.36, 'text-anchor': 'middle',
        'font-size': fs, 'font-weight': 700, fill: fontColor,
      }, g);
      rt.textContent = 'ref';
      const t = svgEl('text', {
        x: x + w / 2, y: y + tabH + (h - tabH) / 2 + fs * 0.36, 'text-anchor': 'middle',
        'font-size': fs, fill: fontColor,
      }, g);
      t.textContent = model.name;
      meta.textSlots.name = { box: new Rect(x, y + tabH, w, h - tabH), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'collaboration':
    case 'collaborationUse': {
      // dashed ellipse (UML Collaboration / CollaborationUse)
      const label = kind === 'collaborationUse'
        ? `${model.name}${model.typeName ? ': ' + model.typeName : ''}`
        : model.name + fmtTags(model);
      svgEl('ellipse', {
        cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2,
        fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1,
        'stroke-dasharray': '6 4', class: 'node-frame',
      }, g);
      drawName(g, x, y + h / 2 - fs * 0.7, w, label, { fontSize: fs, color: fontColor });
      meta.autoWidth = label.length * fs * 0.62 + 26;
      meta.textSlots.name = { box: new Rect(x, y + h / 2 - fs, w, fs + 6), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'port': {
      // port: small square on the classifier boundary, label outside
      const label = `${model.isConjugated ? '~' : ''}${model.name}${model.typeName ? ': ' + model.typeName : ''}${model.multiplicity ? ` [${model.multiplicity}]` : ''}`;
      svgEl('rect', {
        x, y, width: w, height: h,
        fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      const t = svgEl('text', { x: x + w + 5, y: y + h / 2 + fs * 0.35, 'font-size': fs, fill: fontColor }, g);
      t.textContent = label;
      meta.textSlots.name = { box: new Rect(x + w + 3, y + h / 2 - fs, 90, fs + 6), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'part': {
      // part: rounded box; dashed when the role is a shared (non-composite) part
      const label = `${model.isConjugated ? '~' : ''}${model.name}${model.typeName ? ': ' + model.typeName : ''}${model.multiplicity ? ` [${model.multiplicity}]` : ''}`;
      svgEl('rect', {
        x, y, width: w, height: h, rx: 5, ry: 5,
        fill: view.fillColor || '#ffffff', stroke: line, 'stroke-width': 1,
        'stroke-dasharray': model.aggregation === 'composite' ? 'none' : '6 4',
        class: 'node-frame',
      }, g);
      const t = svgEl('text', {
        x: x + w / 2, y: y + h / 2 + fs * 0.35, 'text-anchor': 'middle',
        'font-size': fs, fill: fontColor, 'text-decoration': model.isStatic ? 'underline' : 'none',
      }, g);
      t.textContent = label;
      meta.autoWidth = label.length * fs * 0.62 + 20;
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'timingLifeline': {
      // horizontal lane: name gutter on the left, value line in the middle
      const labelW = TIMING_LANE_LABEL_W;
      svgEl('rect', { x, y, width: w, height: h, fill: view.fillColor || '#fcfdfd', stroke: 'none' }, g);
      svgEl('line', { x1: x, y1: y + h, x2: x + w, y2: y + h, stroke: line, 'stroke-width': 1 }, g);
      svgEl('line', { x1: x + labelW, y1: y, x2: x + labelW, y2: y + h, stroke: '#d8dede', 'stroke-width': 1 }, g);
      svgEl('line', { x1: x + labelW + 6, y1: y + h / 2, x2: x + w - 4, y2: y + h / 2, stroke: '#e3e8e8', 'stroke-width': 1 }, g);
      const t = svgEl('text', {
        x: x + 8, y: y + h / 2 + fs * 0.35, 'font-size': fs, 'font-weight': 700, fill: fontColor,
      }, g);
      t.textContent = model.name + fmtTags(model);
      meta.textSlots.name = { box: new Rect(x, y, labelW, h), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'timingState': {
      // state/condition band: name above a horizontal value line
      const cy = y + h / 2;
      svgEl('rect', { x, y, width: w, height: h, fill: view.fillColor || 'none', stroke: 'none' }, g);
      svgEl('line', { x1: x, y1: cy, x2: x + w, y2: cy, stroke: line, 'stroke-width': 1.4 }, g);
      const t = svgEl('text', {
        x: x + 4, y: y + fs + 1, 'font-size': fs, fill: fontColor, 'font-style': 'italic',
      }, g);
      t.textContent = model.name + fmtTags(model);
      meta.textSlots.name = { box: new Rect(x, y, Math.min(w, 120), h), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'timeSegment': {
      // interval marker on a state band
      const cy = y + h / 2;
      svgEl('line', { x1: x, y1: cy, x2: x + w, y2: cy, stroke: line, 'stroke-width': 1.2 }, g);
      svgEl('line', { x1: x, y1: cy - 5, x2: x, y2: cy + 5, stroke: line, 'stroke-width': 1 }, g);
      svgEl('line', { x1: x + w, y1: cy - 5, x2: x + w, y2: cy + 5, stroke: line, 'stroke-width': 1 }, g);
      if (model && model.name) {
        const t = svgEl('text', {
          x: x + w / 2, y: cy - 7, 'text-anchor': 'middle', 'font-size': fs - 1, fill: fontColor,
        }, g);
        t.textContent = model.name;
        meta.textSlots.name = { box: new Rect(x, cy - fs - 8, w, fs + 4), text: model.name, field: 'name', align: 'center' };
      }
      break;
    }
    case 'timeTick': {
      // vertical tick with a time label below the lane
      const tx = x + w / 2;
      svgEl('line', { x1: tx, y1: y, x2: tx, y2: y + h, stroke: line, 'stroke-width': 1 }, g);
      const t = svgEl('text', {
        x: tx, y: y + h + fs + 3, 'text-anchor': 'middle', 'font-size': fs - 1, fill: fontColor,
      }, g);
      t.textContent = view.text || model?.name || '';
      meta.textSlots.body = { box: new Rect(tx - 24, y - 2, 48, h + fs + 8), text: view.text || '', field: 'text', align: 'center' };
      meta.textSlots.name = meta.textSlots.body;
      break;
    }
    case 'timeConstraint': {
      const raw = (model?.name || '').trim();
      const text = raw.startsWith('{') ? raw : `{${raw || 't=0'}}`;
      const t = svgEl('text', {
        x: x + 4, y: y + h / 2 + fs * 0.35, 'font-size': fs, fill: fontColor, 'font-style': 'italic',
      }, g);
      t.textContent = text;
      meta.textSlots.name = { box: new Rect(x, y, Math.max(w, text.length * fs * 0.6 + 8), h), text: model.name, field: 'name', align: 'left' };
      break;
    }
    case 'durationConstraint': {
      const raw = (model?.name || '').trim();
      const text = raw.startsWith('{') ? raw : `{${raw || 'd=0'}}`;
      const cy = y + h / 2 + 4;
      svgEl('line', { x1: x, y1: cy, x2: x + w, y2: cy, stroke: line, 'stroke-width': 1 }, g);
      svgEl('line', { x1: x, y1: cy - 6, x2: x, y2: cy + 6, stroke: line, 'stroke-width': 1 }, g);
      svgEl('line', { x1: x + w, y1: cy - 6, x2: x + w, y2: cy + 6, stroke: line, 'stroke-width': 1 }, g);
      const t = svgEl('text', {
        x: x + w / 2, y: cy - 8, 'text-anchor': 'middle', 'font-size': fs, fill: fontColor, 'font-style': 'italic',
      }, g);
      t.textContent = text;
      meta.textSlots.name = { box: new Rect(x, y, w, h), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'interactionOverview': {
      // inline interaction: sequence-diagram frame with miniature lifelines
      const tabH = 22;
      svgEl('rect', {
        x, y, width: w, height: h, fill: view.fillColor || 'none',
        stroke: line, 'stroke-width': 1.2, class: 'node-frame',
      }, g);
      const tw = 30;
      svgEl('path', {
        d: `M ${x} ${y} L ${x + tw} ${y} L ${x + tw + 8} ${y + tabH / 2} L ${x + tw} ${y + tabH} L ${x} ${y + tabH} Z`,
        fill: '#ffffff', stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      const rt = svgEl('text', {
        x: x + tw / 2, y: y + tabH / 2 + fs * 0.36, 'text-anchor': 'middle',
        'font-size': fs, 'font-weight': 700, fill: fontColor,
      }, g);
      rt.textContent = 'sd';
      const nt = svgEl('text', {
        x: x + w / 2 + 16, y: y + fs + 5, 'text-anchor': 'middle', 'font-size': fs, 'font-weight': 700, fill: fontColor,
      }, g);
      nt.textContent = model.name;
      // miniature lifelines suggest the referenced interaction
      const innerTop = y + tabH + 22, innerBot = y + h - 12;
      for (let i = 1; i <= 3; i++) {
        const lx = x + (w * i) / 4;
        svgEl('rect', {
          x: lx - 26, y: innerTop - 16, width: 52, height: 14,
          fill: '#ffffff', stroke: line, 'stroke-width': 0.8,
        }, g);
        svgEl('line', {
          x1: lx, y1: innerTop - 2, x2: lx, y2: innerBot,
          stroke: line, 'stroke-width': 0.8, 'stroke-dasharray': '4 3',
        }, g);
      }
      meta.textSlots.name = { box: new Rect(x + tw + 10, y, w - tw - 10, tabH), text: model.name, field: 'name', align: 'center' };
      break;
    }
    case 'note':
    case 'constraint': {
      const isConstraint = kind === 'constraint';
      const fold = 12;
      svgEl('path', {
        d: `M ${x} ${y} L ${x + w - fold} ${y} L ${x + w} ${y + fold} L ${x + w} ${y + h} L ${x} ${y + h} Z`,
        fill: view.fillColor || (isConstraint ? '#ffffff' : '#ffffef'), stroke: line, 'stroke-width': 1, class: 'node-frame',
      }, g);
      svgEl('path', { d: `M ${x + w - fold} ${y} L ${x + w - fold} ${y + fold} L ${x + w} ${y + fold}`, fill: 'none', stroke: line }, g);
      // constraints render as {specification} (StarUML UMLConstraintView)
      const raw = model.documentation || '';
      const text = isConstraint ? `{${raw}}` : raw;
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
        const t = svgEl('text', { x: x + 6, y: ty, 'font-size': fs, fill: '#555', 'font-style': isConstraint ? 'italic' : 'normal' }, g);
        t.textContent = ln;
        ty += fs + 3;
      }
      meta.textSlots.body = { box: new Rect(x, y, w, h), text: raw, field: 'documentation', align: 'left' };
      meta.textSlots.name = meta.textSlots.body;
      break;
    }
  }
  return meta;
}
