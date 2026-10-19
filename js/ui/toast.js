// toast.js — transient bottom-right notifications.

let holder = null;

export function showToast(message, type = 'info') {
  if (!holder) {
    holder = document.createElement('div');
    holder.id = 'toast-holder';
    document.body.appendChild(holder);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  holder.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, 2200);
}
