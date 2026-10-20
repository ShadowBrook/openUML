// dialog.js — "AI 画图…" dialog: prompt → LLM → DSL → preview → insert.

import { chatCompletion, chatCompletionStream, extractJson, testConnection } from './client.js';
import { systemPrompt, validateDsl, buildDiagram } from './dsl.js';
import { repository } from '../core/repository.js';
import { serializeProject } from '../core/commands.js';
import { showToast } from '../ui/toast.js';
import { t } from '../ui/i18n.js';

const AI_PREFS_KEY = 'openuml-ai';

/** AI connection settings: key stays in sessionStorage unless "remember" is on. */
export function loadAiConfig() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(AI_PREFS_KEY) || '{}'); } catch { saved = {}; }
  let key = '';
  try { key = sessionStorage.getItem(AI_PREFS_KEY + '-key') || ''; } catch { /* private mode */ }
  if (saved.rememberKey) {
    try { key = localStorage.getItem(AI_PREFS_KEY + '-key') || key; } catch { /* ignore */ }
  }
  return {
    baseUrl: saved.baseUrl || '',
    apiKey: key,
    model: saved.model || '',
    rememberKey: !!saved.rememberKey,
  };
}

export function saveAiConfig(config) {
  const { baseUrl, model, rememberKey } = config;
  try {
    localStorage.setItem(AI_PREFS_KEY, JSON.stringify({
      baseUrl: baseUrl.trim(), model: model.trim(), rememberKey: !!rememberKey,
    }));
    if (rememberKey) localStorage.setItem(AI_PREFS_KEY + '-key', config.apiKey || '');
    else localStorage.removeItem(AI_PREFS_KEY + '-key');
    sessionStorage.setItem(AI_PREFS_KEY + '-key', config.apiKey || '');
  } catch { /* private mode */ }
}

/**
 * Generate a diagram from a prompt. One self-repair round: when the model's
 * JSON fails validation, the errors go back to the model for a corrected try.
 * onStatus(msg) reports progress; returns the built { diagram, ... } payload.
 */
export async function generateDiagram(config, prompt, { onStatus = () => {}, onDelta, signal } = {}) {
  const messages = [
    { role: 'system', content: systemPrompt() },
    { role: 'user', content: prompt },
  ];
  const complete = () => chatCompletionStream({ ...config, jsonMode: true }, messages, { onDelta, signal });
  onStatus('正在请求模型…');
  let content = await complete();
  let dsl;
  try {
    dsl = extractJson(content);
  } catch (err) {
    onStatus('输出无法解析，请模型重试…');
    messages.push({ role: 'assistant', content }, { role: 'user', content: `你的输出无法解析为 JSON（${err.message}）。请只输出一个 JSON 对象，不要任何其他文字。` });
    content = await complete();
    dsl = extractJson(content);
  }
  let check = validateDsl(dsl);
  if (!check.ok && check.errors.length) {
    onStatus(`校验未通过（${check.errors.length} 处），自动修复中…`);
    messages.push({ role: 'assistant', content }, { role: 'user', content: `生成的 DSL 有以下问题：\n- ${check.errors.join('\n- ')}\n请修正后重新只输出一个完整 JSON 对象。` });
    content = await complete();
    dsl = extractJson(content);
    check = validateDsl(dsl);
  }
  if (!check.ok) throw new Error('DSL 校验失败:\n- ' + check.errors.join('\n- '));
  onStatus('构建图表…');
  const built = buildDiagram(dsl, { name: prompt.slice(0, 24) || 'AI Diagram' });
  return { ...built, dsl };
}

/** Insert a built diagram into the project and open it. Returns the diagram. */
export function insertDiagram(built) {
  const parent = (() => {
    let n = repository.selectedModel || repository.root;
    while (n) {
      if (n.type === 'Model' || n.type === 'Package') return n;
      n = n.__parent;
    }
    return repository.root.ownedElements[0] || repository.root;
  })();
  repository.addChild(parent, built.diagram);
  for (const m of built.models) repository.addChild(built.diagram, m);
  repository._reindex();
  return built.diagram;
}

/** Serialize a built diagram for the preview pane. */
export function previewText(built) {
  const lines = [`图表: ${built.diagram.name}`, `节点 ${built.nodeCount} · 连线 ${built.edgeCount}`, ''];
  for (const v of built.diagram.elements.filter((e) => !e.isEdge)) {
    lines.push(`• ${v.$type.replace(/^UML/, '')} ${v.name || ''}`);
  }
  for (const e of built.diagram.elements.filter((x) => x.isEdge)) {
    lines.push(`  ↳ ${e.$type.replace(/^UML/, '')}${e.name ? ' ' + e.name : ''}`);
  }
  return lines.join('\n');
}

/** Open the AI drawing dialog. onOpenDiagram(diagram) opens the inserted tab. */
export function showAiDiagramDialog({ onOpenDiagram } = {}) {
  const cfg = loadAiConfig();
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';
  overlay.innerHTML = `
    <div class="dialog-box" style="width:600px;max-height:640px;display:flex;flex-direction:column">
      <div class="dialog-title">AI 画图（Beta）</div>
      <div class="dialog-body" style="display:flex;flex-direction:column;gap:8px;min-height:0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
          <label style="display:flex;flex-direction:column;gap:2px;font-size:11px">API 地址（OpenAI 兼容，含 /v1）
            <input id="ai-base" type="text" placeholder="https://api.deepseek.com/v1" value="${cfg.baseUrl}"></label>
          <label style="display:flex;flex-direction:column;gap:2px;font-size:11px">API Key
            <input id="ai-key" type="password" placeholder="sk-…" value="${cfg.apiKey}"></label>
        </div>
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:6px;align-items:end">
          <label style="display:flex;flex-direction:column;gap:2px;font-size:11px">模型
            <input id="ai-model" type="text" placeholder="deepseek-chat / gpt-4o-mini / qwen2.5:7b …" value="${cfg.model}"></label>
          <label style="display:flex;align-items:center;gap:4px;font-size:11px;height:26px">
            <input id="ai-remember" type="checkbox" ${cfg.rememberKey ? 'checked' : ''}>记住 Key</label>
          <button class="btn" id="ai-test" style="height:26px">试连</button>
        </div>
        <div style="display:flex;gap:6px;align-items:center;font-size:11px">
          <span style="color:var(--text-dim)">模板:</span>
          <select id="ai-tpl" style="flex:1">
            <option value="">（自定义描述）</option>
            <option value="类图：画一个电商订单系统的类图。Order 有 id、total，可以 submit 和 cancel；Customer 拥有 0..* 个 Order；Order 由 1 个 Payment 结算（组合）；Payment 是抽象概念用接口表示，Order 实现它">类图 · 电商订单</option>
            <option value="类图：画一个图书馆管理系统的领域模型。Book、Member、Loan 三个类，Member 与 Loan 一对多，Loan 引用 Book；Book 有 isbn/title/author，Loan 有借出日期和归还日期">类图 · 图书馆领域模型</option>
            <option value="对象图：展示一张已支付的订单快照，订单编号 ORD-2026-001，总额 299.00，状态为已支付，包含两个商品行对象">对象图 · 订单快照</option>
            <option value="序列图：用户在客户端登录，客户端把账号密码发给服务端校验，服务端查数据库验证，数据库返回校验结果，服务端把登录结果返回给客户端">序列图 · 登录流程</option>
            <option value="活动图：下单流程，从开始节点提交订单，判断库存是否足够：足够则发货再进入结束节点，不足则取消订单进入结束节点">活动图 · 下单流程</option>
          </select>
        </div>
        <label style="display:flex;flex-direction:column;gap:2px;font-size:11px">描述你要画的图
          <textarea id="ai-prompt" rows="5" style="resize:vertical;font-family:inherit"
            placeholder="例如：画一个电商订单系统的类图，Order 包含id、total，可以 submit；Customer 拥有多个 Order；Order 与 Payment 是一对一是组合关系"></textarea></label>
        <div id="ai-status" style="font-size:11px;min-height:14px;color:var(--text-dim)"></div>
        <pre id="ai-preview" style="display:none;flex:1;min-height:120px;max-height:220px;overflow:auto;
          border:1px solid var(--panel-border,#ccc);background:#fff;padding:6px;font-family:var(--mono-font);font-size:11px;white-space:pre-wrap"></pre>
      </div>
      <div class="dialog-actions">
        <button class="btn" id="ai-gen">生成</button>
        <button class="btn" id="ai-stop" style="display:none">停止</button>
        <button class="btn primary" id="ai-insert" disabled>插入为新图表</button>
        <button class="btn" id="ai-close">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // lazy lookups: element references are resolved at use time, never cached
  const field = (id) => overlay.querySelector('#' + id);
  const statusEl = () => field('ai-status');
  const readConfig = () => ({
    baseUrl: field('ai-base').value.trim(),
    apiKey: field('ai-key').value.trim(),
    model: field('ai-model').value.trim(),
    rememberKey: field('ai-remember').checked,
  });

  let built = null;
  let abortCtl = null;

  const onTpl = () => {
    const tplText = field('ai-tpl').value;
    if (tplText) field('ai-prompt').value = tplText;
  };

  const onTest = async () => {
    const conf = readConfig();
    if (!conf.baseUrl || !conf.model) { statusEl().textContent = '请先填写 API 地址与模型'; return; }
    statusEl().textContent = '试连中…';
    try {
      const reply = await testConnection(conf);
      statusEl().textContent = `连接成功：${reply || '(空回复)'}`;
    } catch (err) {
      statusEl().textContent = `连接失败：${err.message}`;
    }
  };

  const setBusy = (busy) => {
    field('ai-gen').style.display = busy ? 'none' : '';
    field('ai-stop').style.display = busy ? '' : 'none';
    field('ai-insert').disabled = busy || !built;
  };

  const onGenerate = async () => {
    const conf = readConfig();
    if (!conf.baseUrl || !conf.model) { statusEl().textContent = '请先填写 API 地址与模型'; return; }
    const prompt = field('ai-prompt').value.trim();
    if (!prompt) { statusEl().textContent = '请输入图的描述'; return; }
    saveAiConfig(conf);
    built = null;
    setBusy(true);
    const previewEl = field('ai-preview');
    previewEl.style.display = 'none';
    abortCtl = new AbortController();
    let received = 0;
    const onDelta = (full) => {
      received = full.length;
      statusEl().textContent = `生成中… 已接收 ${received} 字（再次点击停止可中断）`;
    };
    statusEl().textContent = '正在请求模型…';
    try {
      built = await generateDiagram(conf, prompt, {
        onStatus: (msg) => { statusEl().textContent = msg; },
        onDelta,
        signal: abortCtl.signal,
      });
      statusEl().textContent = `生成成功：节点 ${built.nodeCount} · 连线 ${built.edgeCount}`;
      previewEl.textContent = previewText(built);
      previewEl.style.display = 'block';
    } catch (err) {
      statusEl().textContent = `失败：${err.message}`;
    } finally {
      setBusy(false);
      abortCtl = null;
    }
  };

  const onStop = () => { abortCtl?.abort(); };

  const onInsert = () => {
    if (!built) return;
    const diagram = insertDiagram(built);
    overlay.remove();
    onOpenDiagram?.(diagram);
    showToast(`已插入 AI 生成的图表「${diagram.name}」`);
  };

  // event delegation: no per-button queries at construction time
  overlay.addEventListener('click', (e) => {
    const id = e.target && e.target.id;
    if (id === 'ai-test') onTest();
    else if (id === 'ai-gen') onGenerate();
    else if (id === 'ai-stop') onStop();
    else if (id === 'ai-insert') onInsert();
    else if (id === 'ai-close') overlay.remove();
  });
  overlay.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'ai-tpl') onTpl();
  });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') overlay.remove(); });
}
