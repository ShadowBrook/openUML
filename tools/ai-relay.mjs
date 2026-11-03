#!/usr/bin/env node
// ai-relay.mjs — 本地 AI 中继（纯 JS，零依赖）。GitHub Pages 等静态部署场景使用：
//
//   node tools/ai-relay.mjs [端口=8643]
//
// 然后在「AI 画图」对话框选择「自定义代理地址」，填入：
//   http://127.0.0.1:8643/ai-proxy
//
// 契约与 serve.py 的 /ai-proxy、Cloudflare Worker 模板完全一致：
// POST /ai-proxy + X-Target-URL 头 = 转发到真实 API（SSE 流式透传）。
// 浏览器把 http://127.0.0.1 视为安全上下文，https 页面调用不受混合内容限制。
import http from 'node:http';

const PORT = Number(process.argv[2] || 8643);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Target-URL, Authorization',
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
  if (req.method !== 'POST' || req.url.split('?')[0] !== '/ai-proxy') {
    res.writeHead(404, CORS); res.end('not found (POST /ai-proxy only)'); return;
  }
  const target = req.headers['x-target-url'];
  if (!target || !String(target).startsWith('http')) {
    res.writeHead(400, CORS); res.end('missing X-Target-URL'); return;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = { 'Content-Type': 'application/json', Accept: req.headers.accept || 'text/event-stream' };
  if (req.headers.authorization) headers.Authorization = req.headers.authorization;
  try {
    const up = await fetch(target, { method: 'POST', headers, body: Buffer.concat(chunks) });
    res.writeHead(up.status, {
      'Content-Type': up.headers.get('content-type') || 'application/json',
      ...CORS,
    });
    if (up.body) for await (const c of up.body) res.write(c);  // SSE 流式透传
    res.end();
  } catch (e) {
    res.writeHead(502, { 'Content-Type': 'application/json', ...CORS });
    res.end(JSON.stringify({ error: { message: 'relay upstream failed: ' + e.message } }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`AI relay: http://127.0.0.1:${PORT}/ai-proxy （填入 AI 画图对话框的「自定义代理地址」）`);
});
