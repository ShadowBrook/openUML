import { t } from './i18n.js';

// validation-panel.js — modal model-validation results with click-to-locate.

import { issueCounts } from '../core/validator.js';

const SEVERITY_LABEL = () => ({ error: t('错误'), warning: t('警告'), info: t('提示') });

export function showValidationDialog({ issues, onLocate, onRevalidate }) {
  const overlay = document.getElementById('dialog-overlay');
  document.getElementById('dialog-title').textContent = t('模型校验');
  const body = document.getElementById('dialog-body');
  body.innerHTML = '';
  const counts = issueCounts(issues);

  const summary = document.createElement('div');
  summary.className = 'validation-summary';
  for (const sev of ['error', 'warning', 'info']) {
    const item = document.createElement('span');
    item.className = `val-summary-item val-${sev}`;
    item.textContent = `${SEVERITY_LABEL()[sev]} ${counts[sev] || 0}`;
    summary.appendChild(item);
  }
  body.appendChild(summary);

  const close = () => {
    document.removeEventListener('keydown', onKey);
    overlay.classList.add('hidden');
  };

  if (!issues.length) {
    const ok = document.createElement('div');
    ok.className = 'validation-empty';
    ok.textContent = t('未发现模型问题。');
    body.appendChild(ok);
  } else {
    const list = document.createElement('div');
    list.className = 'validation-list';
    for (const issue of issues) {
      const row = document.createElement('div');
      row.className = `validation-row val-${issue.severity}`;
      const badge = document.createElement('span');
      badge.className = `val-badge val-${issue.severity}`;
      badge.textContent = SEVERITY_LABEL()[issue.severity] || issue.severity;
      row.appendChild(badge);
      const text = document.createElement('div');
      text.className = 'validation-message';
      const msg = document.createElement('div');
      msg.textContent = issue.message;
      text.appendChild(msg);
      if (issue.label) {
        const label = document.createElement('div');
        label.className = 'validation-location';
        label.textContent = issue.label;
        text.appendChild(label);
      }
      row.appendChild(text);
      if (issue.diagramId || issue.modelId || issue.viewId) {
        const btn = document.createElement('button');
        btn.className = 'btn validation-locate';
        btn.textContent = '定位';
        btn.onclick = () => {
          close();
          onLocate(issue);
        };
        row.appendChild(btn);
      }
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  const buttons = document.getElementById('dialog-buttons');
  buttons.innerHTML = '';
  const revalidate = document.createElement('button');
  revalidate.className = 'btn';
  revalidate.textContent = t('重新验证');
  revalidate.onclick = () => {
    close();
    if (onRevalidate) onRevalidate();
  };
  const ok = document.createElement('button');
  ok.className = 'btn primary';
  ok.textContent = t('关闭');
  ok.onclick = close;
  buttons.appendChild(revalidate);
  buttons.appendChild(ok);

  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      document.removeEventListener('keydown', onKey);
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  overlay.classList.remove('hidden');
  ok.focus();
}
