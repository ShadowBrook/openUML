// menubar.js — top menu bar with dropdowns + context menu support

export function buildMenu(items) {
  const bar = document.getElementById('menubar');
  const overlay = document.getElementById('menu-overlay');
  bar.innerHTML = '';
  let openBtn = null;

  function closeMenus() {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    if (openBtn) openBtn.classList.remove('open');
    openBtn = null;
  }

  function showDropdown(anchor, menuItems) {
    closeMenus();
    overlay.classList.remove('hidden');
    const dd = document.createElement('div');
    dd.className = 'menu-dropdown';
    const r = anchor.getBoundingClientRect();
    dd.style.left = r.left + 'px';
    dd.style.top = r.bottom + 'px';
    fillMenu(dd, menuItems);
    overlay.appendChild(dd);
    openBtn = anchor;
    anchor.classList.add('open');
    // keep on screen
    const ddRect = dd.getBoundingClientRect();
    if (ddRect.right > window.innerWidth) dd.style.left = (window.innerWidth - ddRect.width - 4) + 'px';
  }

  function fillMenu(dd, menuItems) {
    for (const item of menuItems) {
      if (item === '---') {
        const sep = document.createElement('div');
        sep.className = 'menu-sep';
        dd.appendChild(sep);
        continue;
      }
      const el = document.createElement('div');
      el.className = 'menu-item' + (item.disabled ? ' disabled' : '');
      if (item.checked) {
        const c = document.createElement('span');
        c.className = 'checkmark';
        c.textContent = '✓';
        el.appendChild(c);
      }
      const label = document.createElement('span');
      label.textContent = item.label;
      el.appendChild(label);
      if (item.shortcut) {
        const sc = document.createElement('span');
        sc.className = 'shortcut';
        sc.textContent = item.shortcut;
        el.appendChild(sc);
      }
      el.onclick = (e) => {
        e.stopPropagation();
        closeMenus();
        if (item.action) item.action();
      };
      el.onmouseenter = () => {
        if (item.submenu) {
          // simple: replace dropdown content on hover of submenu parents
          dd.querySelectorAll('.submenu-host').forEach((n) => n.remove());
          const sub = document.createElement('div');
          sub.className = 'menu-dropdown submenu-host';
          const r = el.getBoundingClientRect();
          sub.style.left = r.right + 'px';
          sub.style.top = r.top + 'px';
          fillMenu(sub, item.submenu);
          overlay.appendChild(sub);
        } else {
          dd.parentElement.querySelectorAll('.submenu-host').forEach((n) => n.remove());
        }
      };
      dd.appendChild(el);
    }
  }

  for (const topItem of items) {
    const btn = document.createElement('div');
    btn.className = 'menu-top';
    btn.textContent = topItem.label;
    btn.onclick = (e) => {
      e.stopPropagation();
      if (openBtn === btn) { closeMenus(); return; }
      showDropdown(btn, topItem.submenu);
    };
    btn.onmouseenter = () => {
      if (openBtn && openBtn !== btn) showDropdown(btn, topItem.submenu);
    };
    bar.appendChild(btn);
  }

  overlay.onclick = closeMenus;
  return { closeMenus };
}

/** standalone context menu at client position */
export function showContextMenu(x, y, items) {
  const existing = document.getElementById('context-menu');
  existing.innerHTML = '';
  existing.classList.remove('hidden');
  for (const item of items) {
    if (item === '---') {
      const sep = document.createElement('div');
      sep.className = 'menu-sep';
      existing.appendChild(sep);
      continue;
    }
    const el = document.createElement('div');
    el.className = 'menu-item' + (item.disabled ? ' disabled' : '');
    const label = document.createElement('span');
    label.textContent = item.label;
    el.appendChild(label);
    if (item.shortcut) {
      const sc = document.createElement('span');
      sc.className = 'shortcut';
      sc.textContent = item.shortcut;
      el.appendChild(sc);
    }
    el.onclick = (e) => {
      e.stopPropagation();
      hideContextMenu();
      if (item.action) item.action();
    };
    existing.appendChild(el);
  }
  existing.style.left = '0px';
  existing.style.top = '0px';
  const r = existing.getBoundingClientRect();
  existing.style.left = Math.min(x, window.innerWidth - r.width - 6) + 'px';
  existing.style.top = Math.min(y, window.innerHeight - r.height - 6) + 'px';
  setTimeout(() => {
    const closer = (e) => {
      if (!existing.contains(e.target)) { hideContextMenu(); window.removeEventListener('mousedown', closer); }
    };
    window.addEventListener('mousedown', closer);
  }, 0);
}

export function hideContextMenu() {
  const existing = document.getElementById('context-menu');
  existing.classList.add('hidden');
  existing.innerHTML = '';
}
