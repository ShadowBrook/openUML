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
