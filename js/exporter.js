// exporter.js — export the active diagram as SVG / PNG / JPEG.
// Bounds use the canvas's effective (auto-fit) node sizes, so grown class
// boxes are never clipped.

import { viewW, viewH } from './views/nodeviews.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function contentBounds(canvas, margin = 40) {
  const pts = [];
  for (const v of canvas.diagram?.elements || []) {
    if (v.isEdge) continue;
    const h = v.$type === 'UMLLifeLine' ? viewH(v) + (v.lifeHeight || 400) : viewH(v);
    pts.push({ x: v.x, y: v.y }, { x: v.x + viewW(v), y: v.y + h });
  }
  if (!pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX - margin, y: minY - margin,
    width: maxX - minX + margin * 2,
    height: maxY - minY + margin * 2,
  };
}

export function diagramToSVG(canvas, { transparent = false } = {}) {
  const bounds = contentBounds(canvas);
  if (!bounds) return null;
  const clone = canvas.contentLayer.cloneNode(true);
  clone.removeAttribute('transform');
  const overlay = canvas.overlayLayer.cloneNode(false);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('xmlns', SVG_NS);
  svg.setAttribute('width', bounds.width);
  svg.setAttribute('height', bounds.height);
  svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
  // keep clip paths (package containment) available in the exported document
  if (canvas.defs) svg.appendChild(canvas.defs.cloneNode(true));
  if (!transparent) {
    const bg = document.createElementNS(SVG_NS, 'rect');
    bg.setAttribute('x', bounds.x);
    bg.setAttribute('y', bounds.y);
    bg.setAttribute('width', bounds.width);
    bg.setAttribute('height', bounds.height);
    bg.setAttribute('fill', '#ffffff');
    svg.appendChild(bg);
  }
  svg.appendChild(clone);
  svg.appendChild(overlay);
  return new XMLSerializer().serializeToString(svg);
}

export function downloadSVG(canvas, filename = 'diagram.svg', options = {}) {
  const s = diagramToSVG(canvas, options);
  if (!s) return false;
  downloadBlob(new Blob([s], { type: 'image/svg+xml' }), filename);
  return true;
}

function svgToCanvas(svgString, scale, background) {
  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      const ctx = c.getContext('2d');
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export async function downloadPNG(canvas, filename = 'diagram.png', scale = 2, { transparent = false } = {}) {
  const s = diagramToSVG(canvas, { transparent });
  if (!s) return false;
  const c = await svgToCanvas(s, scale, transparent ? null : '#ffffff');
  if (!c) return false;
  const blob = await canvasToBlob(c, 'image/png');
  if (!blob) return false;
  downloadBlob(blob, filename);
  return true;
}

export async function downloadJPEG(canvas, filename = 'diagram.jpg', scale = 2, quality = 0.92) {
  const s = diagramToSVG(canvas, { transparent: false });
  if (!s) return false;
  const c = await svgToCanvas(s, scale, '#ffffff');
  if (!c) return false;
  const blob = await canvasToBlob(c, 'image/jpeg', quality);
  if (!blob) return false;
  downloadBlob(blob, filename);
  return true;
}

/** Copy the diagram as a PNG to the system clipboard when the browser allows it. */
export async function copyDiagramPNG(canvas, scale = 2) {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return false;
  const s = diagramToSVG(canvas, { transparent: false });
  if (!s) return false;
  const c = await svgToCanvas(s, scale, '#ffffff');
  if (!c) return false;
  const blob = await canvasToBlob(c, 'image/png');
  if (!blob) return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Print the active diagram via a hidden iframe; the print dialog offers Save as PDF. */
export function printDiagram(canvas, title = 'Diagram') {
  const s = diagramToSVG(canvas);
  if (!s) return false;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  doc.open();
  doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>@page{margin:12mm}html,body{margin:0;padding:0;background:#fff}svg{display:block;width:100%;height:auto}</style></head><body>${s}</body></html>`);
  doc.close();
  const win = iframe.contentWindow;
  setTimeout(() => {
    try { win.focus(); win.print(); } catch (_) { /* dialogs may be blocked */ }
    setTimeout(() => iframe.remove(), 60000);
  }, 300);
  return true;
}

// ---------------- direct PDF export ----------------
// Minimal single-pass PDF writer: each diagram becomes one page holding its
// rasterized image (DCTDecode JPEG), so no browser print dialog is involved.

function pdfEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }

/**
 * Build a PDF (as a Blob) from a list of rasterized pages.
 * pages: [{ canvas: HTMLCanvasElement, title: string }]
 */
export async function buildPDF(pages) {
  // JPEG bytes keep the PDF small; canvas.toBlob is async
  const jpegs = [];
  for (const p of pages) {
    const blob = await canvasToBlob(p.canvas, 'image/jpeg', 0.92);
    jpegs.push(new Uint8Array(await blob.arrayBuffer()));
  }
  const enc = new TextEncoder();
  const chunks = [];
  let offset = 0;
  const offsets = [];
  const push = (data) => {
    const bytes = typeof data === 'string' ? enc.encode(data) : data;
    chunks.push(bytes);
    offset += bytes.length;
  };
  push('%PDF-1.4\n');
  // objects: 1 catalog, 2 pages, then per page: page obj, content obj, image obj
  const n = pages.length;
  const pageObjIds = pages.map((_, i) => 3 + i * 3);
  const objects = [];
  const addObj = (body) => { objects.push(body); return objects.length; };
  // reserve ids by pushing placeholders in order
  addObj(null); // 1 catalog placeholder
  addObj(null); // 2 pages placeholder
  pages.forEach((p, i) => {
    const wPts = Math.round(p.canvas.width * 72 / 96);
    const hPts = Math.round(p.canvas.height * 72 / 96);
    const contentId = pageObjIds[i] + 1;
    const imageId = pageObjIds[i] + 2;
    addObj(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPts} ${hPts}] `
      + `/Resources << /XObject << /Im${i} ${imageId} 0 R >> /ProcSet [/PDF /ImageC] >> `
      + `/Contents ${contentId} 0 R >>`);
    addObj(`<< /Length ${`q ${wPts} 0 0 ${hPts} 0 0 cm /Im${i} Do Q`.length} >>\nstream\nq ${wPts} 0 0 ${hPts} 0 0 cm /Im${i} Do Q\nendstream`);
    addObj(null); // image placeholder, filled below
  });
  // fill image placeholders now that ids are known
  pages.forEach((p, i) => {
    const imageId = pageObjIds[i] + 2;
    const jpg = jpegs[i];
    objects[imageId - 1] = {
      dict: `<< /Type /XObject /Subtype /Image /Width ${p.canvas.width} /Height ${p.canvas.height} `
        + `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`,
      bytes: jpg,
    };
  });
  objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  const kids = pageObjIds.map((id) => `${id} 0 R`).join(' ');
  objects[1] = `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`;
  // emit objects sequentially
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const o = objects[i];
    push(`${i + 1} 0 obj\n`);
    if (typeof o === 'string') push(o + '\n');
    else { push(o.dict + '\nstream\n'); push(o.bytes); push('\nendstream\n'); }
    push('endobj\n');
  }
  const xrefStart = offset;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const off of offsets) push(`${String(off).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

/** Export the active diagram as a direct PDF file download. */
export async function downloadPDF(canvas, filename = 'diagram.pdf', scale = 2) {
  const s = diagramToSVG(canvas, { transparent: false });
  if (!s) return false;
  const c = await svgToCanvas(s, scale, '#ffffff');
  if (!c) return false;
  const blob = await buildPDF([{ canvas: c, title: filename }]);
  downloadBlob(blob, filename);
  return true;
}
