import { svg } from './icons.js';

/** Tiny DOM builder: h('div', { class: 'x', onclick }, child, ...) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ================= Menus & popovers =================
let stack = []; // open menus, outermost first

export function closeMenus() {
  for (const m of stack) {
    m.remove();
    m._onClose?.();
  }
  stack = [];
}

function closeFrom(menu) {
  const i = stack.indexOf(menu);
  if (i < 0) return;
  for (const m of stack.splice(i)) {
    m.remove();
    m._onClose?.();
  }
}

function place(el, at, { sub = false } = {}) {
  document.body.append(el);
  const r = el.getBoundingClientRect();
  const vw = innerWidth;
  const vh = innerHeight;
  let x;
  let y;
  if (at instanceof Element) {
    const a = at.getBoundingClientRect();
    if (sub) {
      x = a.right + 2;
      y = a.top - 4;
      if (x + r.width > vw - 8) x = a.left - r.width - 2;
    } else {
      x = a.left;
      y = a.bottom + 2;
      if (y + r.height > vh - 8) y = Math.max(8, a.top - r.height - 2);
    }
  } else {
    x = at.x;
    y = at.y;
    if (y + r.height > vh - 8) y = Math.max(8, vh - r.height - 8);
  }
  if (x + r.width > vw - 8) x = Math.max(8, vw - r.width - 8);
  el.style.left = `${Math.max(8, x)}px`;
  el.style.top = `${Math.max(8, y)}px`;
}

/**
 * Show a menu at an element or {x, y}.
 * Items: { label, icon, hint, checked, danger, disabled, onClick, submenu: [...] }
 *        { separator: true } | { heading: 'Text' } | { swatches: [...], value, onPick, none: bool }
 *        { element: Node }
 */
export function showMenu(at, items, { sub = false, keepFocus = true, onClose, className = '' } = {}) {
  if (!sub) closeMenus();
  const menu = h('div', { class: `menu ${className}`, role: 'menu' });
  menu._onClose = onClose;
  if (keepFocus) menu.addEventListener('mousedown', (e) => e.preventDefault());

  for (const it of items) {
    if (!it) continue;
    if (it.separator) { menu.append(h('div', { class: 'menu-sep' })); continue; }
    if (it.heading) { menu.append(h('div', { class: 'menu-heading' }, it.heading)); continue; }
    if (it.element) { menu.append(it.element); continue; }
    if (it.swatches) {
      const row = h('div', { class: 'menu-swatches' });
      if (it.none) {
        row.append(h('button', { class: 'swatch none' + (it.value == null ? ' on' : ''), title: 'No color', onclick: () => { closeMenus(); it.onPick(null); } }));
      }
      for (const c of it.swatches) {
        row.append(h('button', {
          class: 'swatch' + (c === it.value ? ' on' : ''), title: c, style: { background: c },
          onclick: () => { closeMenus(); it.onPick(c); },
        }));
      }
      menu.append(row);
      continue;
    }
    const btn = h('button', { class: 'menu-item' + (it.danger ? ' danger' : ''), role: 'menuitem', disabled: it.disabled },
      h('span', { class: 'mi-icon', style: it.iconColor ? { color: it.iconColor } : null, html: it.icon ? svg(it.icon, 16) : it.checked ? svg('check', 16) : '' }),
      h('span', { class: 'mi-label', style: it.labelStyle || null }, it.label),
      it.hint ? h('span', { class: 'mi-hint' }, it.hint) : null,
      it.submenu ? h('span', { class: 'mi-arrow', html: svg('chevronRight', 14) }) : null);
    btn.addEventListener('mouseenter', () => {
      if (menu._child && menu._child._owner !== btn) closeFrom(menu._child);
      if (it.submenu && !it.disabled && !(menu._child && menu._child._owner === btn)) openSub();
    });
    function openSub() {
      const items = typeof it.submenu === 'function' ? it.submenu() : it.submenu;
      const child = showMenu(btn, items, { sub: true });
      child._owner = btn;
      menu._child = child;
      btn.classList.add('open');
      child._onClose = () => { btn.classList.remove('open'); if (menu._child === child) menu._child = null; };
    }
    btn.addEventListener('click', () => {
      if (it.submenu) { if (!menu._child) openSub(); return; }
      closeMenus();
      it.onClick?.();
    });
    menu.append(btn);
  }
  place(menu, at, { sub });
  stack.push(menu);
  return menu;
}

/** Show arbitrary content as a popover anchored to an element. */
export function showPopover(at, content, opts = {}) {
  return showMenu(at, [{ element: content }], opts);
}

document.addEventListener('mousedown', (e) => {
  if (stack.length && !e.target.closest('.menu')) closeMenus();
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && stack.length) { e.stopPropagation(); closeMenus(); }
}, true);
addEventListener('resize', closeMenus);
addEventListener('blur', closeMenus);

// ================= Modal dialogs =================
export function modal({ title, body, actions = [{ label: 'OK', primary: true, value: true }], onOpen, wide = false, side = false, enterToSubmit = true, className = '' }) {
  return new Promise((resolve) => {
    closeMenus();
    const footer = h('div', { class: 'modal-actions' });
    const dlg = h('div', { class: 'modal' + (wide ? ' wide' : '') + (className ? ` ${className}` : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-title' }, title),
      h('div', { class: 'modal-body' }, body),
      footer);
    // side: a non-blocking panel on the right, so the app behind stays visible (live previews).
    const overlay = h('div', { class: `modal-overlay${side ? ' side' : ''}` }, dlg);
    const prevFocus = document.activeElement;
    let done = false;

    const close = (value) => {
      if (done) return;
      done = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      prevFocus?.focus?.({ preventScroll: true });
      resolve(value);
    };
    let primary = null;
    for (const a of actions) {
      const b = h('button', { class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : '') }, a.label);
      b.addEventListener('click', () => close(typeof a.value === 'function' ? a.value() : a.value ?? null));
      if (a.primary) primary = b;
      footer.append(b);
    }
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (enterToSubmit && e.key === 'Enter' && primary && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        primary.click();
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(null); });
    document.body.append(overlay);
    if (onOpen) onOpen(dlg);
    else (primary || footer.lastChild)?.focus();
  });
}

export async function promptDialog(title, { label, value = '', placeholder = '', okLabel = 'OK' } = {}) {
  const input = h('input', { class: 'input', value, placeholder, spellcheck: 'false' });
  const result = await modal({
    title,
    body: [label ? h('label', { class: 'field-label' }, label) : null, input],
    actions: [{ label: 'Cancel' }, { label: okLabel, primary: true, value: () => input.value }],
    onOpen: () => { input.focus(); input.select(); },
  });
  return result == null ? null : String(result).trim();
}

export async function confirmDialog(title, message, { okLabel = 'Delete', danger = true } = {}) {
  const result = await modal({
    title,
    body: h('p', {}, message),
    actions: [{ label: 'Cancel' }, { label: okLabel, primary: !danger, danger, value: true }],
  });
  return result === true;
}

// ================= Toasts =================
export function toast(message, { action, onAction, timeout = 3500 } = {}) {
  const host = document.getElementById('toasts');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', {}, message));
  let timer;
  const dismiss = () => {
    clearTimeout(timer);
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  };
  if (action) {
    el.append(h('button', { class: 'toast-action', onclick: () => { dismiss(); onAction?.(); } }, action));
  }
  host.append(el);
  if (timeout) timer = setTimeout(dismiss, timeout);
  return { dismiss, el };
}

// ================= Formatting helpers =================
export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
}
export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
export function fmtRelative(ts) {
  const diff = Date.now() - ts;
  const min = 60000;
  if (diff < min) return 'Just now';
  if (diff < 60 * min) return `${Math.floor(diff / min)} min ago`;
  if (diff < 24 * 60 * min) return `${Math.floor(diff / (60 * min))} h ago`;
  if (diff < 7 * 24 * 60 * min) return new Date(ts).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
