// exporter.js — export active diagram as SVG / PNG

export function diagramToSVG(canvas) {
  const clone = canvas.contentLayer.cloneNode(true);
  clone.removeAttribute('transform');
  const overlay = canvas.overlayLayer.cloneNode(false);
  // compute bounds
  const pts = [];
  for (const v of canvas.diagram.elements) {
    if (!v.isEdge) pts.push({ x: v.x, y: v.y }, { x: v.x + v.width, y: v.y + v.height });
  }
  if (!pts.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const m = 20;
  const w = maxX - minX + m * 2, h = maxY - minY + m * 2;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  svg.setAttribute('viewBox', `${minX - m} ${minY - m} ${w} ${h}`);
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  bg.setAttribute('x', minX - m); bg.setAttribute('y', minY - m);
  bg.setAttribute('width', w); bg.setAttribute('height', h);
  bg.setAttribute('fill', '#ffffff');
  svg.appendChild(bg);
  svg.appendChild(clone);
  svg.appendChild(overlay);
  return new XMLSerializer().serializeToString(svg);
}

export function downloadSVG(canvas, filename = 'diagram.svg') {
  const s = diagramToSVG(canvas);
  if (!s) return false;
  const blob = new Blob([s], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
  return true;
}

export function downloadPNG(canvas, filename = 'diagram.png', scale = 2) {
  const s = diagramToSVG(canvas);
  if (!s) return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([s], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width * scale; c.height = img.height * scale;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = filename;
        a.click();
        resolve(true);
      }, 'image/png');
    };
    img.onerror = () => resolve(false);
    img.src = url;
  });
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
