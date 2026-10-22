// client.js — OpenAI-compatible chat completions client for AI diagram generation.
// Works with OpenAI / DeepSeek / Moonshot / Qwen / Zhipu / OneAPI relays and
// local runtimes (Ollama, LM Studio) that expose the same endpoint shape.

/** Trim trailing slashes so callers can pass base URLs with or without /v1. */
function joinUrl(baseUrl, path) {
  return String(baseUrl || '').replace(/\/+$/, '') + path;
}

/**
 * One chat completion. Returns the assistant message content.
 * Config: { baseUrl, apiKey, model, temperature?, timeoutMs?, signal? }
 * messages: [{ role: 'system'|'user'|'assistant', content }]
 */
export async function chatCompletion(config, messages) {
  if (!config || !config.baseUrl) throw new Error('未配置 API 地址（Base URL）');
  if (!config.model) throw new Error('未配置模型名称');
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || 120000);
  if (config.signal) {
    if (config.signal.aborted) controller.abort();
    else config.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  let res;
  try {
    res = await fetch(joinUrl(config.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature ?? 0.2,
        ...(config.jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('请求已取消或超时');
    throw new Error(`网络请求失败: ${err.message}（请检查 API 地址与跨域 CORS 设置）`);
  }
  clearTimeout(timer);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API 返回 ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json().catch(() => { throw new Error('API 返回的不是 JSON'); });
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('API 响应中没有 choices[0].message.content');
  return content;
}

/**
 * Extract the first balanced JSON object/array from model output.
 * Tolerates ```json fences and prose around the payload.
 */
export function extractJson(text) {
  const raw = String(text || '');
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [];
  if (fenced) candidates.push(fenced[1]);
  candidates.push(raw);
  for (const cand of candidates) {
    const start = cand.search(/[{[]/);
    if (start < 0) continue;
    const open = cand[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < cand.length; i++) {
      const ch = cand[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === open) depth += 1;
      else if (ch === close) {
        depth -= 1;
        if (depth === 0) {
          try { return JSON.parse(cand.slice(start, i + 1)); } catch { break; }
        }
      }
    }
  }
  throw new Error('模型输出中没有可解析的 JSON');
}

/** Quick connectivity probe: returns short model reply text. */
export async function testConnection(config) {
  const reply = await chatCompletion(config, [
    { role: 'user', content: 'Reply with the single word: OK' },
  ]);
  return reply.trim().slice(0, 50);
}

/**
 * Streaming chat completion (SSE). Returns the full content when done;
 * onDelta(fullSoFar) fires as tokens arrive. signal aborts mid-stream.
 */
export async function chatCompletionStream(config, messages, { onDelta, signal } = {}) {
  if (!config || !config.baseUrl) throw new Error('未配置 API 地址（Base URL）');
  if (!config.model) throw new Error('未配置模型名称');
  const headers = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs || 180000);
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  let res;
  try {
    res = await fetch(joinUrl(config.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature ?? 0.2,
        ...(config.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('已停止生成');
    throw new Error(`网络请求失败: ${err.message}（请检查 API 地址与跨域 CORS 设置）`);
  }
  if (!res.ok) {
    clearTimeout(timer);
    const text = await res.text().catch(() => '');
    throw new Error(`API 返回 ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!res.body) throw new Error('当前环境不支持流式响应');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let streamError = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) {
            full += delta;
            onDelta?.(full);
          }
          if (chunk?.error) streamError = chunk.error.message || String(chunk.error);
        } catch { /* partial line across chunks is tolerated */ }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('已停止生成');
    throw new Error(`流式读取失败: ${err.message}`);
  }
  clearTimeout(timer);
  if (streamError) throw new Error(`API 流式错误: ${streamError}`);
  if (!full) throw new Error('流式响应为空');
  return full;
}
