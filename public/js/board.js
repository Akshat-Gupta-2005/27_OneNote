// Cards board: a structured page type (content.type === 'board'), Trello-style. Lists of cards,
// each card with labels, cover, description, checklist and due date. Rendered instead of the
// freeform canvas, saved through the same PageEditor autosave as every other page.
import { h, esc, showMenu, closeMenus, modal, promptDialog, confirmDialog, toast } from './ui.js';
import { svg } from './icons.js';
import { parseQuickAdd } from './todo.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = (n) => String(n).padStart(2, '0');
const isoToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDue = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${SHORT[m - 1]} ${d}${y !== new Date().getFullYear() ? `, ${y}` : ''}`;
};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const LABELS = [
  ['green', '#4bce97', 'Green'], ['yellow', '#f5cd47', 'Yellow'], ['orange', '#fea362', 'Orange'], ['red', '#f87168', 'Red'],
  ['purple', '#9f8fef', 'Purple'], ['blue', '#579dff', 'Blue'], ['sky', '#6cc3e0', 'Sky'], ['pink', '#e774bb', 'Pink'],
];
const labelColor = (id) => LABELS.find(([l]) => l === id)?.[1];

// Board backgrounds and theme covers are SOLID colors mixed from theme tokens, so they follow the
// active color scheme (owner, 2026-10-17: first "the blue gradient stands differently from the
// theme", then "I don't like the gradient, make it a solid color matching the theme").
// Older boards stored fixed-gradient ids; those map to 'tint'.
const THEME_FILLS = {
  tint: ['Theme tint', 'color-mix(in srgb, var(--accent) 16%, var(--surround))'],
  accent: ['Accent', 'color-mix(in srgb, var(--accent) 42%, var(--surround))'],
  soft: ['Soft', 'var(--surround)'],
};
export const BACKGROUNDS = [...Object.entries(THEME_FILLS).map(([id, [name, css]]) => [id, name, css]), ['page', 'Page color', 'var(--canvas)']];
// Cover ids keep their 'g-' prefix (stored in existing cards); they are solid now too.
const COVERS = [...LABELS.map(([id, color, name]) => [id, name, color]), ['g-tint', 'Theme tint', THEME_FILLS.tint[1]], ['g-accent', 'Accent', THEME_FILLS.accent[1]]];
const coverCss = (id) => COVERS.find(([c]) => c === id)?.[2];

/** A new board: three empty lists on the theme-tinted background. */
export function emptyBoard() {
  return {
    v: 1,
    type: 'board',
    background: 'tint',
    labels: LABELS.map(([id]) => ({ id, name: '' })),
    columns: ['To do', 'Doing', 'Done'].map((title) => ({ id: uid(), title, cards: [] })),
  };
}

/** Coerce stored or imported data into a valid board. Never throws. */
export function normalizeBoard(raw = {}) {
  const str = (v, max = 2000) => (typeof v === 'string' ? v.slice(0, max) : '');
  const labelIds = new Set(LABELS.map(([id]) => id));
  const names = new Map((Array.isArray(raw.labels) ? raw.labels : []).map((l) => [l?.id, str(l?.name, 40)]));
  const card = (c) => ({
    id: typeof c.id === 'string' && c.id ? c.id : uid(),
    title: str(c.title, 500).trim() || 'Untitled card',
    description: str(c.description, 20000),
    labels: [...new Set((Array.isArray(c.labels) ? c.labels : []).filter((l) => labelIds.has(l)))],
    checklist: (Array.isArray(c.checklist) ? c.checklist : [])
      .filter((i) => i && str(i.text).trim())
      .map((i) => ({ id: typeof i.id === 'string' && i.id ? i.id : uid(), text: str(i.text, 500).trim(), done: !!i.done })),
    due: DATE_RE.test(c.due) ? c.due : null,
    dueDone: !!c.dueDone,
    cover: coverCss(c.cover) ? c.cover : String(c.cover || '').startsWith('g-') ? 'g-tint' : null,
    created: Number(c.created) || 0,
  });
  return {
    v: 1,
    type: 'board',
    background: raw.background === 'theme' ? 'page' : BACKGROUNDS.some(([id]) => id === raw.background) ? raw.background : 'tint',
    labels: LABELS.map(([id]) => ({ id, name: names.get(id) || '' })),
    columns: (Array.isArray(raw.columns) ? raw.columns : []).filter(Boolean).map((col) => ({
      id: typeof col.id === 'string' && col.id ? col.id : uid(),
      title: str(col.title, 200).trim() || 'Untitled list',
      cards: (Array.isArray(col.cards) ? col.cards : []).filter(Boolean).map(card),
    })),
  };
}

export function boardPlainText(d) {
  const names = new Map(d.labels.map((l) => [l.id, l.name]));
  const lines = [];
  for (const col of d.columns) {
    lines.push(col.title);
    for (const c of col.cards) {
      lines.push([c.title, ...c.labels.map((l) => names.get(l)).filter(Boolean)].join(' · '));
      if (c.description) lines.push(c.description);
      for (const i of c.checklist) lines.push(i.text);
    }
  }
  return lines.filter(Boolean).join('\n');
}

function dueState(card) {
  if (!card.due) return null;
  if (card.dueDone) return 'done';
  const today = isoToday();
  if (card.due < today) return 'overdue';
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const t = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  return card.due <= t ? 'soon' : 'later';
}

// =====================================================================

export class BoardView {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.hint = 'This is a card board. Add cards with "+ Add a card".';
    this.data = null;
    this.pageId = null;
    this.composer = null; // column id whose "add a card" box is open, or 'list' for a new list
    this.refocus = null;  // { card } or { composer } to restore focus after a render
    this.drag = null;
    this.top = h('div', { class: 'board-top' });
    this.body = h('div', { class: 'board-view' });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.body.addEventListener('dragstart', (e) => this.onDragStart(e));
    this.body.addEventListener('dragover', (e) => this.onDragOver(e));
    this.body.addEventListener('drop', (e) => this.onDrop(e));
    this.body.addEventListener('dragend', () => this.clearDrag());
    this.body.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-act-form]');
      if (!form) return;
      e.preventDefault(); // never let a composer form navigate
      this.submitComposer(form);
    });
  }

  mount(inner, headEl, data, pageId) {
    this.data = normalizeBoard(data);
    this.pageId = pageId;
    this.composer = null;
    inner.insertBefore(this.top, headEl);
    inner.append(this.body);
    this.render();
  }

  unmount() {
    this.top.remove();
    this.body.remove();
    this.data = null;
    this.pageId = null;
  }

  serialize() { return this.data; }
  plainText() { return boardPlainText(this.data); }

  focusFirst() {
    (this.body.querySelector('.board-card') || this.body.querySelector('[data-act="open-composer"]'))?.focus();
  }

  // ---------- data ----------
  change() {
    this.render();
    this.onChange();
  }

  locate(cardId) {
    for (const col of this.data.columns) {
      const i = col.cards.findIndex((c) => c.id === cardId);
      if (i >= 0) return { col, card: col.cards[i], index: i };
    }
    return null;
  }

  colById(id) {
    return this.data.columns.find((c) => c.id === id);
  }

  /**
   * Add a card from the composer. Same quick syntax as the to-do planner: `#label` (a color like
   * #red, or a label's name like #Backend; several allowed) and `@date` (@today, @20 Oct, …).
   * An unknown #word names the first label that has no name and isn't on any card yet.
   */
  addCard(colId, raw) {
    const col = this.colById(colId);
    if (!col || !raw.trim()) return;
    const parsed = parseQuickAdd(raw, { allTags: true });
    const labels = [];
    const unmatched = [];
    for (const word of parsed.tags) {
      const id = this.resolveLabel(word);
      if (id) { if (!labels.includes(id)) labels.push(id); } else unmatched.push(`#${word}`);
    }
    const title = [parsed.text, ...unmatched].filter(Boolean).join(' ').trim();
    if (!parsed.text) {
      toast('Type the card title too, not just #labels or an @date.');
      return;
    }
    col.cards.push({ id: uid(), title: title.slice(0, 500), description: '', labels, checklist: [], due: parsed.date, dueDone: false, cover: null, created: Date.now() });
    this.refocus = { composer: colId };
    this.change();
  }

  resolveLabel(word) {
    const w = word.toLowerCase();
    const named = this.data.labels.find((l) => l.id === w) || this.data.labels.find((l) => l.name && l.name.toLowerCase() === w);
    if (named) return named.id;
    const used = new Set(this.data.columns.flatMap((c) => c.cards.flatMap((k) => k.labels)));
    const free = this.data.labels.find((l) => !l.name && !used.has(l.id));
    if (!free) return null;
    free.name = word.slice(0, 40);
    toast(`New label "${free.name}" (${LABELS.find(([id]) => id === free.id)[2].toLowerCase()})`);
    return free.id;
  }

  moveCard(cardId, toColId, toIndex) {
    const from = this.locate(cardId);
    const to = this.colById(toColId);
    if (!from || !to) return;
    from.col.cards.splice(from.index, 1);
    const index = Math.max(0, Math.min(toIndex ?? to.cards.length, to.cards.length));
    to.cards.splice(index, 0, from.card);
    this.refocus = { card: cardId };
    this.change();
  }

  removeCard(cardId) {
    const at = this.locate(cardId);
    if (!at) return;
    at.col.cards.splice(at.index, 1);
    const neighbour = at.col.cards[at.index] || at.col.cards[at.index - 1];
    this.refocus = neighbour ? { card: neighbour.id } : null;
    this.change();
    const pid = this.pageId;
    toast(`Deleted card "${at.card.title.length > 40 ? `${at.card.title.slice(0, 40)}…` : at.card.title}"`, {
      action: 'Undo',
      timeout: 6000,
      onAction: () => {
        if (this.pageId !== pid || !this.data) return toast('That page is no longer open.');
        const col = this.colById(at.col.id) || this.data.columns[0];
        if (!col) return;
        col.cards.splice(Math.min(at.index, col.cards.length), 0, at.card);
        this.refocus = { card: at.card.id };
        this.change();
      },
    });
  }

  addColumn(title) {
    if (!title.trim()) return;
    this.data.columns.push({ id: uid(), title: title.trim().slice(0, 200), cards: [] });
    this.refocus = { composer: 'list' };
    this.change();
  }

  async deleteColumn(colId) {
    const col = this.colById(colId);
    if (!col) return;
    const pid = this.pageId;
    if (col.cards.length && !(await confirmDialog('Delete list?', `"${col.title}" and its ${col.cards.length} card${col.cards.length === 1 ? '' : 's'} will be deleted.`, { okLabel: 'Delete list' }))) return;
    if (this.pageId !== pid) return;
    this.data.columns = this.data.columns.filter((c) => c.id !== colId);
    this.change();
  }

  moveColumn(colId, dir) {
    const cols = this.data.columns;
    const i = cols.findIndex((c) => c.id === colId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= cols.length) return;
    [cols[i], cols[j]] = [cols[j], cols[i]];
    this.change();
  }

  // ---------- rendering ----------
  render() {
    if (!this.data) return;
    const d = this.data;
    const bg = BACKGROUNDS.find(([id]) => id === d.background)?.[2] || 'none';
    const cardCount = d.columns.reduce((n, c) => n + c.cards.length, 0);
    const toolbar = h('div', { class: 'board-toolbar' },
      h('span', { class: 'board-stats' }, `${d.columns.length} list${d.columns.length === 1 ? '' : 's'} · ${cardCount} card${cardCount === 1 ? '' : 's'}`),
      h('button', { class: 'btn small', 'data-act': 'labels' }, h('span', { html: svg('bookmark', 14) }), 'Labels'),
      h('button', { class: 'btn small', 'data-act': 'background' }, h('span', { html: svg('palette', 14) }), 'Background'));
    const cols = h('div', { class: 'board-cols' },
      d.columns.map((col) => this.columnEl(col)),
      this.addListEl());
    this.body.replaceChildren(toolbar, h('div', { class: `board-area${d.background === 'page' ? ' plain' : ''}`, style: `--board-bg:${bg}` }, cols));

    if (this.refocus?.colTitle) this.body.querySelector(`.board-col[data-col="${CSS.escape(this.refocus.colTitle)}"] .board-col-title`)?.focus();
    else if (this.refocus?.card) this.body.querySelector(`.board-card[data-card="${CSS.escape(this.refocus.card)}"]`)?.focus();
    else if (this.refocus?.composer) this.body.querySelector(`[data-composer="${CSS.escape(this.refocus.composer)}"]`)?.focus();
    this.refocus = null;
  }

  columnEl(col) {
    const open = this.composer === col.id;
    return h('section', { class: 'board-col', 'data-col': col.id, 'aria-label': col.title },
      h('header', { class: 'board-col-head', draggable: 'true', title: 'Drag to move this list · Alt+←/→ on the title' },
        h('span', { class: 'todo-grip', 'aria-hidden': 'true', html: svg('grip', 14) }),
        h('h3', { class: 'board-col-title', tabindex: '0', 'data-act': 'rename-col', title: 'Click to rename' }, col.title),
        h('span', { class: 'board-count' }, String(col.cards.length)),
        h('button', { class: 'todo-icon-btn', 'data-act': 'col-menu', title: 'List actions', 'aria-label': `${col.title} actions`, html: svg('more', 16) })),
      h('div', { class: 'board-cards', 'data-col': col.id }, col.cards.map((c) => this.cardEl(c))),
      open
        ? h('form', { class: 'board-composer', 'data-act-form': 'card' },
          h('textarea', { class: 'board-input', rows: '2', placeholder: 'Card title…  #label @date', 'data-composer': col.id, 'aria-label': `New card in ${col.title}` }),
          h('div', { class: 'board-composer-row' },
            h('button', { class: 'btn primary small', type: 'submit' }, 'Add card'),
            h('button', { class: 'todo-icon-btn', type: 'button', 'data-act': 'close-composer', title: 'Cancel', html: svg('close', 16) })))
        : h('button', { class: 'board-add-card', 'data-act': 'open-composer', 'data-col-id': col.id }, h('span', { html: svg('plus', 16) }), 'Add a card'));
  }

  addListEl() {
    if (this.composer === 'list') {
      return h('form', { class: 'board-col board-new-list', 'data-act-form': 'list' },
        h('input', { class: 'board-input', placeholder: 'Enter list title…', 'data-composer': 'list', 'aria-label': 'New list title' }),
        h('div', { class: 'board-composer-row' },
          h('button', { class: 'btn primary small', type: 'submit' }, 'Add list'),
          h('button', { class: 'todo-icon-btn', type: 'button', 'data-act': 'close-composer', title: 'Cancel', html: svg('close', 16) })));
    }
    return h('button', { class: 'board-col board-add-list', 'data-act': 'open-list-composer' }, h('span', { html: svg('plus', 16) }), 'Add another list');
  }

  cardEl(c) {
    const names = new Map(this.data.labels.map((l) => [l.id, l.name]));
    const done = c.checklist.filter((i) => i.done).length;
    const due = dueState(c);
    const badges = [
      c.description ? h('span', { class: 'card-badge', title: 'This card has a description', html: svg('rows', 14) }) : null,
      c.checklist.length ? h('span', { class: `card-badge${done === c.checklist.length ? ' complete' : ''}`, title: 'Checklist items' }, h('span', { html: svg('todo', 14) }), `${done}/${c.checklist.length}`) : null,
      due ? h('span', { class: `card-badge due ${due}`, title: { done: 'Complete', overdue: 'Overdue', soon: 'Due soon', later: 'Due date' }[due] }, h('span', { html: svg('clock', 14) }), fmtDue(c.due)) : null,
    ].filter(Boolean);
    const cover = c.cover ? coverCss(c.cover) : null;
    return h('div', {
      class: 'board-card', tabindex: '0', draggable: 'true', role: 'button', 'data-card': c.id,
      'aria-label': `${c.title}. Enter to open, Delete to remove, Alt+arrows to move.`,
    },
    cover ? h('div', { class: `card-cover${c.cover.startsWith('g-') ? ' tall' : ''}`, style: `background:${cover}` }) : null,
    c.labels.length ? h('div', { class: 'card-labels' }, c.labels.map((l) => h('span', { class: 'card-label', style: `--l:${labelColor(l)}`, title: names.get(l) || LABELS.find(([id]) => id === l)[2] }))) : null,
    h('div', { class: 'card-title' }, c.title),
    badges.length ? h('div', { class: 'card-badges' }, badges) : null);
  }

  // ---------- events ----------
  onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act && this.body.contains(act)) {
      const colEl = act.closest('.board-col');
      const colId = colEl?.dataset.col;
      switch (act.dataset.act) {
        case 'open-composer': this.composer = act.dataset.colId; this.refocus = { composer: this.composer }; this.render(); return;
        case 'open-list-composer': this.composer = 'list'; this.refocus = { composer: 'list' }; this.render(); return;
        case 'close-composer': this.composer = null; this.render(); return;
        case 'col-menu': this.columnMenu(act, colId); return;
        case 'rename-col': this.renameColumn(act, colId); return;
        case 'labels': this.labelsMenu(act); return;
        case 'background': this.backgroundMenu(act); return;
        default: return;
      }
    }
    const card = e.target.closest('.board-card');
    if (card) this.openCard(card.dataset.card);
  }

  onKeyDown(e) {
    const form = e.target.closest?.('[data-act-form]');
    if (form && e.target.matches('textarea, input')) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.composer = null; this.render(); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (form.dataset.actForm === 'card') this.addCard(this.composer, e.target.value);
        else this.addColumn(e.target.value);
      }
      return;
    }
    if (e.target.classList.contains('board-col-title') && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const colId = e.target.closest('.board-col').dataset.col;
      this.refocus = { colTitle: colId };
      this.moveColumn(colId, e.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (e.target.classList.contains('board-col-title') && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault();
      this.renameColumn(e.target, e.target.closest('.board-col').dataset.col);
      return;
    }
    const cardEl = e.target.closest?.('.board-card');
    if (!cardEl || e.target !== cardEl) return;
    const id = cardEl.dataset.card;
    const at = this.locate(id);
    const ci = this.data.columns.indexOf(at.col);
    const focusCard = (col, index) => {
      const c = col?.cards[Math.max(0, Math.min(index, col.cards.length - 1))];
      if (c) this.body.querySelector(`.board-card[data-card="${CSS.escape(c.id)}"]`)?.focus();
    };
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.openCard(id); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.removeCard(id); }
    else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); if (ci > 0) this.moveCard(id, this.data.columns[ci - 1].id, at.index); }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); if (ci < this.data.columns.length - 1) this.moveCard(id, this.data.columns[ci + 1].id, at.index); }
    else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); if (at.index > 0) this.moveCard(id, at.col.id, at.index - 1); }
    else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); if (at.index < at.col.cards.length - 1) this.moveCard(id, at.col.id, at.index + 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusCard(at.col, at.index + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCard(at.col, at.index - 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); focusCard(this.data.columns[ci - 1], at.index); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); focusCard(this.data.columns[ci + 1], at.index); }
  }

  // The composer is a <form>; submitting via the button goes through here.
  submitComposer(form) {
    const field = form.querySelector('[data-composer]');
    if (form.dataset.actForm === 'card') this.addCard(this.composer, field.value);
    else this.addColumn(field.value);
  }

  onDragStart(e) {
    const card = e.target.closest?.('.board-card');
    if (card) {
      this.drag = card.dataset.card;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-board-card', this.drag);
      card.classList.add('dragging');
      return;
    }
    // A list is dragged by its header (cards inside it start their own drags above).
    const head = e.target.closest?.('.board-col-head');
    if (!head) return;
    const colEl = head.closest('.board-col');
    this.dragCol = colEl.dataset.col;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-board-list', this.dragCol);
    colEl.classList.add('dragging');
  }

  /** Where a dragged list would land: before which list (by horizontal midpoint), or at the end. */
  colDropTarget(e) {
    if (!this.dragCol || !e.target.closest?.('.board-cols')) return null;
    const cols = [...this.body.querySelectorAll('.board-col[data-col]')].filter((c) => c.dataset.col !== this.dragCol);
    const before = cols.find((c) => { const r = c.getBoundingClientRect(); return e.clientX < r.left + r.width / 2; }) || null;
    return { before, index: before ? cols.indexOf(before) : cols.length };
  }

  moveColumnTo(colId, index) {
    const cols = this.data.columns;
    const col = this.colById(colId);
    if (!col) return;
    cols.splice(cols.indexOf(col), 1);
    cols.splice(Math.max(0, Math.min(index, cols.length)), 0, col);
    this.change();
  }

  dropTarget(e) {
    const list = e.target.closest?.('.board-col')?.querySelector('.board-cards');
    if (!list) return null;
    const cards = [...list.querySelectorAll('.board-card')].filter((c) => c.dataset.card !== this.drag);
    const before = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; });
    return { list, colId: list.dataset.col, before, index: before ? cards.indexOf(before) : cards.length };
  }

  onDragOver(e) {
    if (this.dragCol) {
      const t = this.colDropTarget(e);
      if (!t) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      for (const el of this.body.querySelectorAll('.col-drop-before, .col-drop-end')) el.classList.remove('col-drop-before', 'col-drop-end');
      if (t.before) t.before.classList.add('col-drop-before');
      else this.body.querySelector('.board-cols').classList.add('col-drop-end');
      return;
    }
    if (!this.drag) return;
    const t = this.dropTarget(e);
    if (!t) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    for (const el of this.body.querySelectorAll('.drop-before, .drop-end')) el.classList.remove('drop-before', 'drop-end');
    if (t.before) t.before.classList.add('drop-before');
    else t.list.classList.add('drop-end');
  }

  onDrop(e) {
    if (this.dragCol) {
      const t = this.colDropTarget(e);
      if (!t) return;
      e.preventDefault();
      const id = this.dragCol;
      this.clearDrag();
      this.moveColumnTo(id, t.index);
      return;
    }
    if (!this.drag) return;
    const t = this.dropTarget(e);
    if (!t) return;
    e.preventDefault();
    const id = this.drag;
    this.clearDrag();
    this.moveCard(id, t.colId, t.index);
  }

  clearDrag() {
    this.drag = null;
    this.dragCol = null;
    for (const el of this.body.querySelectorAll('.drop-before, .drop-end, .dragging, .col-drop-before, .col-drop-end')) {
      el.classList.remove('drop-before', 'drop-end', 'dragging', 'col-drop-before', 'col-drop-end');
    }
  }

  // ---------- menus ----------
  renameColumn(titleEl, colId) {
    const col = this.colById(colId);
    if (!col) return;
    const input = h('input', { class: 'board-input title', value: col.title, 'aria-label': 'List title' });
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (commit && v && v !== col.title) { col.title = v.slice(0, 200); this.change(); }
      else this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  columnMenu(anchor, colId) {
    const i = this.data.columns.findIndex((c) => c.id === colId);
    showMenu(anchor, [
      { label: 'Add card', icon: 'plus', onClick: () => { this.composer = colId; this.refocus = { composer: colId }; this.render(); } },
      { label: 'Rename list', icon: 'edit', onClick: () => { const t = this.body.querySelector(`.board-col[data-col="${CSS.escape(colId)}"] .board-col-title`); if (t) this.renameColumn(t, colId); } },
      { label: 'Move left', icon: 'back', disabled: i <= 0, onClick: () => this.moveColumn(colId, -1) },
      { label: 'Move right', icon: 'forward', disabled: i >= this.data.columns.length - 1, onClick: () => this.moveColumn(colId, 1) },
      { separator: true },
      { label: 'Delete list', icon: 'trash', danger: true, onClick: () => this.deleteColumn(colId) },
    ]);
  }

  backgroundMenu(anchor) {
    showMenu(anchor, [
      { heading: 'Board background' },
      ...BACKGROUNDS.map(([id, name]) => ({
        label: name, checked: this.data.background === id,
        onClick: () => { this.data.background = id; this.change(); },
      })),
    ]);
  }

  labelsMenu(anchor) {
    const pid = this.pageId;
    showMenu(anchor, [
      { heading: 'Name your labels' },
      ...this.data.labels.map((l) => ({
        label: l.name || `${LABELS.find(([id]) => id === l.id)[2]} (no name)`,
        iconColor: labelColor(l.id), icon: 'bookmark',
        onClick: async () => {
          const v = await promptDialog('Label name', { label: 'Shown on hover and in the card editor', value: l.name, okLabel: 'Save' });
          if (v !== null && this.pageId === pid) { l.name = v.slice(0, 40); this.change(); }
        },
      })),
    ]);
  }

  // ---------- card dialog ----------
  async openCard(cardId) {
    const at = this.locate(cardId);
    if (!at) return;
    const { card } = at;
    const pid = this.pageId;
    const live = () => { if (this.pageId === pid) { this.render(); this.onChange(); } };

    const titleInput = h('input', { class: 'input card-title-input', value: card.title, 'aria-label': 'Card title' });
    titleInput.addEventListener('input', () => { if (titleInput.value.trim()) { card.title = titleInput.value.trim().slice(0, 500); live(); } });

    const listSelect = h('select', { class: 'select', 'aria-label': 'List' },
      this.data.columns.map((c) => h('option', { value: c.id, selected: c.id === this.locate(card.id)?.col.id }, c.title)));
    listSelect.addEventListener('change', () => this.moveCard(card.id, listSelect.value));

    const labelRow = h('div', { class: 'card-label-picker' });
    const renderLabels = () => labelRow.replaceChildren(...LABELS.map(([id, color, fallback]) => {
      const name = this.data.labels.find((l) => l.id === id)?.name || fallback;
      const on = card.labels.includes(id);
      return h('button', {
        type: 'button', class: `label-chip${on ? ' on' : ''}`, style: `--l:${color}`, 'aria-pressed': String(on), 'data-label': id, title: name,
        onclick: () => { card.labels = on ? card.labels.filter((l) => l !== id) : [...card.labels, id]; renderLabels(); live(); },
      }, on ? h('span', { html: svg('check', 12) }) : null, name);
    }));
    renderLabels();

    const dueInput = h('input', { type: 'date', class: 'input', value: card.due || '', 'aria-label': 'Due date' });
    const dueDone = h('input', { type: 'checkbox', checked: card.dueDone, 'aria-label': 'Due date complete' });
    dueInput.addEventListener('change', () => { card.due = dueInput.value || null; live(); });
    dueDone.addEventListener('change', () => { card.dueDone = dueDone.checked; live(); });

    const coverRow = h('div', { class: 'menu-swatches cover-swatches' });
    const renderCovers = () => coverRow.replaceChildren(
      h('button', { type: 'button', class: `swatch none${card.cover ? '' : ' on'}`, title: 'No cover', 'data-cover': '', onclick: () => { card.cover = null; renderCovers(); live(); } }),
      ...COVERS.map(([id, name, css]) => h('button', {
        type: 'button', class: `swatch${card.cover === id ? ' on' : ''}`, style: `background:${css}`, title: name, 'data-cover': id,
        onclick: () => { card.cover = id; renderCovers(); live(); },
      })));
    renderCovers();

    const desc = h('textarea', { class: 'input card-desc', rows: '4', placeholder: 'Add a more detailed description…', 'aria-label': 'Description' }, card.description);
    desc.addEventListener('input', () => { card.description = desc.value; live(); });

    const checklist = h('div', { class: 'card-checklist' });
    const progress = h('div', { class: 'todo-bar small' }, h('div', { class: 'todo-bar-fill' }));
    const newItem = h('input', { class: 'input', placeholder: 'Add an item… (Enter)', 'aria-label': 'New checklist item' });
    const renderChecklist = () => {
      const done = card.checklist.filter((i) => i.done).length;
      progress.firstChild.style.width = `${card.checklist.length ? Math.round((done * 100) / card.checklist.length) : 0}%`;
      checklist.replaceChildren(...card.checklist.map((item) => h('div', { class: 'check-item' },
        h('input', { type: 'checkbox', checked: item.done, 'aria-label': item.text, onchange: (e) => { item.done = e.target.checked; renderChecklist(); live(); } }),
        h('input', { class: 'check-text', value: item.text, 'aria-label': 'Checklist item', onchange: (e) => { if (e.target.value.trim()) { item.text = e.target.value.trim(); live(); } } }),
        h('button', { type: 'button', class: 'todo-icon-btn', title: 'Remove item', html: svg('close', 14), onclick: () => { card.checklist = card.checklist.filter((i) => i !== item); renderChecklist(); live(); } }))));
    };
    newItem.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !newItem.value.trim()) return;
      e.preventDefault();
      card.checklist.push({ id: uid(), text: newItem.value.trim().slice(0, 500), done: false });
      newItem.value = '';
      renderChecklist();
      live();
    });
    renderChecklist();

    const section = (label, ...kids) => h('div', { class: 'card-section' }, h('div', { class: 'field-label' }, label), ...kids);
    const result = await modal({
      title: 'Card',
      wide: true,
      enterToSubmit: false,
      className: 'card-dialog',
      body: [
        titleInput,
        h('div', { class: 'row2' }, section('List', listSelect), section('Due date', h('div', { class: 'due-row' }, dueInput, h('label', { class: 'todo-toggle' }, dueDone, 'Complete')))),
        section('Labels', labelRow),
        section('Description', desc),
        section('Checklist', progress, checklist, newItem),
        section('Cover', coverRow),
      ],
      actions: [{ label: 'Delete card', danger: true, value: 'delete' }, { label: 'Done', primary: true, value: 'done' }],
      onOpen: () => { titleInput.focus(); titleInput.select(); },
    });
    if (this.pageId !== pid) return;
    if (result === 'delete') this.removeCard(card.id);
    else {
      this.refocus = { card: card.id };
      this.render();
    }
  }

  exportHtml(title) {
    const names = new Map(this.data.labels.map((l) => [l.id, l.name || LABELS.find(([id]) => id === l.id)[2]]));
    const cols = this.data.columns.map((col) => `<section><h2>${esc(col.title)} <small>(${col.cards.length})</small></h2><ul>${col.cards.map((c) => {
      const extras = [
        c.labels.length ? c.labels.map((l) => names.get(l)).join(', ') : '',
        c.checklist.length ? `${c.checklist.filter((i) => i.done).length}/${c.checklist.length} done` : '',
        c.due ? `due ${fmtDue(c.due)}${c.dueDone ? ' ✓' : ''}` : '',
      ].filter(Boolean).join(' · ');
      return `<li><b>${esc(c.title)}</b>${extras ? ` <small>${esc(extras)}</small>` : ''}${c.description ? `<p>${esc(c.description)}</p>` : ''}</li>`;
    }).join('')}</ul></section>`).join('\n');
    return `<h1 class="page-title">${esc(title)}</h1>${cols}`;
  }
}
