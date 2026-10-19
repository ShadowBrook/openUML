// dialogs.js — modal dialogs (input / confirm / about)

export function showInputDialog({ title = '输入', label = '', value = '', placeholder = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('dialog-overlay');
    const box = document.getElementById('dialog-box');
    document.getElementById('dialog-title').textContent = title;
    const body = document.getElementById('dialog-body');
    body.innerHTML = '';
    if (label) {
      const l = document.createElement('div');
      l.style.marginBottom = '8px';
      l.textContent = label;
      body.appendChild(l);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = placeholder;
    body.appendChild(input);
    const buttons = document.getElementById('dialog-buttons');
    buttons.innerHTML = '';
    const ok = document.createElement('button');
    ok.className = 'btn primary';
    ok.textContent = '确定';
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = '取消';
    buttons.appendChild(ok);
    buttons.appendChild(cancel);
    const close = (val) => { overlay.classList.add('hidden'); resolve(val); };
    ok.onclick = () => close(input.value);
    cancel.onclick = () => close(null);
    overlay.classList.remove('hidden');
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); close(input.value); }
      if (e.key === 'Escape') close(null);
      e.stopPropagation();
    });
  });
}

export function showConfirmDialog({ title = '确认', message = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('dialog-overlay');
    document.getElementById('dialog-title').textContent = title;
    const body = document.getElementById('dialog-body');
    body.innerHTML = `<div style="max-width:380px;line-height:1.6">${message}</div>`;
    const buttons = document.getElementById('dialog-buttons');
    buttons.innerHTML = '';
    const ok = document.createElement('button');
    ok.className = 'btn primary';
    ok.textContent = '确定';
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = '取消';
    buttons.appendChild(ok);
    buttons.appendChild(cancel);
    const close = (val) => { overlay.classList.add('hidden'); resolve(val); };
    ok.onclick = () => close(true);
    cancel.onclick = () => close(false);
    overlay.classList.remove('hidden');
  });
}

export function showAlertDialog({ title = '提示', message = '' } = {}) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('dialog-overlay');
    document.getElementById('dialog-title').textContent = title;
    const body = document.getElementById('dialog-body');
    body.innerHTML = `<div style="max-width:420px;line-height:1.6">${message}</div>`;
    const buttons = document.getElementById('dialog-buttons');
    buttons.innerHTML = '';
    const ok = document.createElement('button');
    ok.className = 'btn primary';
    ok.textContent = '知道了';
    ok.onclick = () => { overlay.classList.add('hidden'); resolve(); };
    buttons.appendChild(ok);
    overlay.classList.remove('hidden');
    ok.focus();
  });
}

export function showAboutDialog() {
  const overlay = document.getElementById('dialog-overlay');
  document.getElementById('dialog-title').textContent = '关于 OpenUML';
  const body = document.getElementById('dialog-body');
  body.innerHTML = `
    <div style="text-align:center;line-height:1.9;padding:6px 10px">
      <div style="font-size:30px;color:#1390d6">◈</div>
      <div style="font-size:16px;font-weight:700">OpenUML</div>
      <div style="color:#6b7272">一款受经典 UML 建模工具启发的开源在线建模工具</div>
      <div style="color:#6b7272;margin-top:6px">类图 · 用例图 · 模型资源管理器 · 属性编辑</div>
    </div>`;
  const buttons = document.getElementById('dialog-buttons');
  buttons.innerHTML = '';
  const ok = document.createElement('button');
  ok.className = 'btn primary';
  ok.textContent = '关闭';
  ok.onclick = () => overlay.classList.add('hidden');
  buttons.appendChild(ok);
  overlay.classList.remove('hidden');
}
