// To-do planner: a structured page type (content.type === 'todo'), rendered instead of the
// freeform canvas. Tasks can be grouped by month, by due date or by tag. The grouping and the
// "hide completed" toggle are per-browser view preferences (localStorage), not page content, so
// switching views never counts as editing the page.
import { h, esc, showMenu, showPopover, closeMenus, toast, promptDialog, confirmDialog } from './ui.js';
import { svg } from './icons.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VIEWS = [['month', 'Month'], ['date', 'Date'], ['tag', 'Tag']];
const MONTH_RE = /^\d{4}-\d{2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const pad = (n) => String(n).padStart(2, '0');

// ---------- date helpers (all local time; dates are 'YYYY-MM-DD', months 'YYYY-MM') ----------
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const monthOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const fromIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (key, n) => { const [y, m] = key.split('-').map(Number); return monthOf(new Date(y, m - 1 + n, 1)); };
const daysIn = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const yearOf = (s) => Number(s.slice(0, 4));

export function monthTitle(key) {
  return MONTHS[Number(key.slice(5, 7)) - 1];
}
function monthRange(key) {
  const mon = SHORT[Number(key.slice(5, 7)) - 1];
  return `1–${daysIn(key)} ${mon}${yearOf(key) !== new Date().getFullYear() ? ` ${yearOf(key)}` : ''}`;
}
function fmtShort(iso) {
  const d = fromIso(iso);
  return `${d.getDate()} ${SHORT[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}
function relative(iso) {
  const diff = Math.round((fromIso(iso) - fromIso(isoDate(new Date()))) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `in ${diff} days` : `${-diff} days ago`;
}

/**
 * Quick-add syntax: "Submit report #College @20 Oct".
 *   #tag              → tag (letters, digits, _ and -)
 *   @today @tomorrow  @mon … @sun (next occurrence, today included)
 *   @2026-10-20  @20 Oct  @20oct  @20/10 (day/month)
 * A day+month without a year takes the year of `defaultMonth` when the months match, otherwise
 * the nearest year that is not more than 60 days in the past.
 */
export function parseQuickAdd(raw, { defaultMonth = null, today = new Date(), allTags = false } = {}) {
  let text = ` ${raw} `;
  let tag = null;
  const tags = [];
  let date = null;
  // Planner tasks have one tag (first #word); cards can take several labels (allTags).
  // Lookahead, not a consumed space, so back-to-back tags ("#a #b") both match.
  text = text.replace(allTags ? /\s#([\p{L}\p{N}_-]+)(?=\s)/gu : /\s#([\p{L}\p{N}_-]+)/u, (m, t) => { tags.push(t); return ' '; });
  tag = tags[0] ?? null;

  const pickYear = (month, day) => {
    if (defaultMonth && Number(defaultMonth.slice(5, 7)) === month) return yearOf(defaultMonth);
    const y = today.getFullYear();
    return new Date(y, month - 1, day) < addDays(today, -60) ? y + 1 : y;
  };
  const valid = (y, m, d) => {
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? isoDate(dt) : null;
  };
  const rules = [
    [/\s@(today|tod)\b/i, () => isoDate(today)],
    [/\s@(tomorrow|tmr|tom)\b/i, () => isoDate(addDays(today, 1))],
    [/\s@(sun|mon|tue|wed|thu|fri|sat)[a-z]*\b/i, (m) => {
      const target = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(m[1].toLowerCase());
      return isoDate(addDays(today, (target - today.getDay() + 7) % 7));
    }],
    [/\s@(\d{4})-(\d{1,2})-(\d{1,2})\b/, (m) => valid(+m[1], +m[2], +m[3])],
    [/\s@(\d{1,2})[\s-]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i, (m) => {
      const month = SHORT.findIndex((s) => s.toLowerCase() === m[2].toLowerCase()) + 1;
      return valid(pickYear(month, +m[1]), month, +m[1]);
    }],
    [/\s@(\d{1,2})\/(\d{1,2})\b/, (m) => valid(pickYear(+m[2], +m[1]), +m[2], +m[1])],
  ];
  for (const [re, fn] of rules) {
    const m = text.match(re);
    if (!m) continue;
    const value = fn(m);
    if (value) {
      date = value;
      text = text.replace(m[0], ' ');
    }
    break;
  }
  const result = { text: text.replace(/\s+/g, ' ').trim(), tag, date };
  if (allTags) result.tags = tags;
  return result;
}

/** A new, empty planner covering this month and the next two. */
export function emptyTodo(now = new Date()) {
  const cur = monthOf(now);
  return {
    v: 1,
    type: 'todo',
    eyebrow: '',
    subtitle: '',
    months: [0, 1, 2].map((n) => ({ key: addMonths(cur, n), note: '', sub: '' })),
    tasks: [],
  };
}

/** Coerce stored or imported data into a valid planner. Never throws. */
export function normalizeTodo(raw = {}) {
  const str = (v) => (typeof v === 'string' ? v : '');
  const d = { v: 1, type: 'todo', eyebrow: str(raw.eyebrow), subtitle: str(raw.subtitle), months: [], tasks: [] };
  const seen = new Map();
  const ensure = (key) => {
    if (!seen.has(key)) {
      const m = { key, note: '', sub: '' };
      seen.set(key, m);
      d.months.push(m);
    }
  };
  for (const m of Array.isArray(raw.months) ? raw.months : []) {
    if (!m || !MONTH_RE.test(m.key) || seen.has(m.key)) continue;
    const mm = { key: m.key, note: str(m.note), sub: str(m.sub) };
    seen.set(m.key, mm);
    d.months.push(mm);
  }
  for (const t of Array.isArray(raw.tasks) ? raw.tasks : []) {
    const text = String(t?.text ?? '').trim();
    if (!text) continue;
    const date = DATE_RE.test(t.date) ? t.date : null;
    const month = date ? date.slice(0, 7) : MONTH_RE.test(t.month) ? t.month : null;
    d.tasks.push({
      id: typeof t.id === 'string' && t.id ? t.id : uid(),
      text,
      done: !!t.done,
      doneAt: t.done ? Number(t.doneAt) || null : null,
      tag: t.tag ? String(t.tag).trim().slice(0, 40) || null : null,
      date,
      month,
      created: Number(t.created) || 0,
    });
    if (month) ensure(month);
  }
  d.months.sort((a, b) => a.key.localeCompare(b.key));
  return d;
}

export function todoPlainText(d) {
  return [
    d.eyebrow,
    d.subtitle,
    ...d.months.map((m) => [monthTitle(m.key), m.sub, m.note].filter(Boolean).join(' — ')),
    ...d.tasks.map((t) => `${t.text}${t.tag ? ` · ${t.tag}` : ''}${t.date ? ` · ${t.date}` : ''}`),
  ].filter(Boolean).join('\n');
}

// =====================================================================

export class TodoView {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.hint = 'This is a to-do page. Add tasks with the + beside each heading.';
    this.data = null;
    this.pageId = null;
    this.prefs = { view: 'month', hideDone: false };
    this.refocusKey = null;
    // One add box at a time, opened by a group's +. Kept across re-renders until closed.
    this.openAdd = null;
    this.pointerDown = false;
    document.addEventListener('pointerdown', () => { this.pointerDown = true; }, true);
    document.addEventListener('pointerup', () => { this.pointerDown = false; }, true);
    this.top = h('div', { class: 'todo-top' });
    this.body = h('div', { class: 'todo-view' });

    for (const el of [this.top, this.body]) {
      el.addEventListener('input', (e) => this.onEditableInput(e));
      el.addEventListener('keydown', (e) => this.onKeyDown(e));
      el.addEventListener('focusout', (e) => {
        const ed = e.target.closest?.('.todo-editable');
        if (ed && !ed.textContent.trim()) ed.textContent = ''; // so :empty placeholders come back
      });
    }
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('change', (e) => {
      if (e.target.dataset.act === 'hide-done') this.setPref('hideDone', e.target.checked);
    });

    // Drag and drop: reorder inside a group, or drop into another group, which takes on that
    // group's meaning (month, date, tag). groupMap is rebuilt on every render.
    this.groupMap = new Map();
    this.dragId = null;
    this.refocusTask = null;
    this.refocusCheck = null;
    this.body.addEventListener('dragstart', (e) => {
      const row = e.target.closest?.('.todo-task');
      if (!row || e.target.closest('input')) return;
      this.dragId = row.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-todo-task', this.dragId);
      row.classList.add('dragging');
    });
    this.body.addEventListener('dragover', (e) => {
      const t = this.dropTarget(e);
      if (!t) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this.clearDropMarks();
      if (t.mark) t.mark.classList.add('drop-before');
      else t.list.classList.add('drop-end');
    });
    this.body.addEventListener('drop', (e) => {
      const t = this.dropTarget(e);
      if (!t) return;
      e.preventDefault();
      const id = this.dragId;
      this.endDrag();
      this.moveTask(id, t.key, t.before?.dataset.id || null);
    });
    this.body.addEventListener('dragend', () => this.endDrag());
  }

  dropTarget(e) {
    if (!this.dragId) return null;
    const groupEl = e.target.closest?.('.todo-group');
    const g = groupEl && this.groupMap.get(groupEl.dataset.key);
    if (!g || g.kind === 'overdue') return null; // "Overdue" is computed, not a place to put things
    const list = groupEl.querySelector('.todo-list');
    // Checked tasks always sit below unchecked ones, so a task can only land among tasks with
    // the same state. Past the last of them it goes to the end of that run.
    const done = !!this.find(this.dragId)?.done;
    const all = [...list.querySelectorAll('.todo-task')].filter((r) => r.dataset.id !== this.dragId);
    const rows = all.filter((r) => r.classList.contains('done') === done);
    const before = rows.find((r) => { const b = r.getBoundingClientRect(); return e.clientY < b.top + b.height / 2; }) || null;
    const mark = before || (done ? null : all.find((r) => r.classList.contains('done')) || null);
    return { key: g.key, list, before, mark };
  }

  clearDropMarks() {
    for (const el of this.body.querySelectorAll('.drop-before, .drop-end')) el.classList.remove('drop-before', 'drop-end');
  }

  endDrag() {
    this.dragId = null;
    this.clearDropMarks();
    for (const el of this.body.querySelectorAll('.todo-task.dragging')) el.classList.remove('dragging');
  }

  /** Give a task the meaning of a group: its month, its date, its tag, or none of them. */
  applyGroup(task, g) {
    switch (g.kind) {
      case 'month':
        task.month = g.month;
        if (task.date && task.date.slice(0, 7) !== g.month) task.date = null; // a date must lie in its month
        break;
      case 'unscheduled': task.month = null; task.date = null; break;
      case 'date': task.date = g.date; task.month = g.month; break;
      case 'nodate': task.date = null; break;
      case 'tag': task.tag = g.tag ?? null; break;
      default: break;
    }
  }

  /**
   * Move a task into group `key`, placed before task `beforeId` (or at the end of that group).
   * Order is the order of data.tasks, so this is a remove + insert in that array.
   */
  moveTask(id, key, beforeId = null) {
    const task = this.find(id);
    const g = this.groupMap.get(key);
    if (!task || !g || g.kind === 'overdue' || beforeId === id) return false;
    this.applyGroup(task, g);
    const tasks = this.data.tasks;
    tasks.splice(tasks.indexOf(task), 1);
    let index;
    if (beforeId) index = tasks.findIndex((t) => t.id === beforeId);
    else {
      const last = g.tasks.filter((t) => t !== task).at(-1);
      index = last ? tasks.indexOf(last) + 1 : tasks.length;
    }
    tasks.splice(index < 0 ? tasks.length : index, 0, task);
    this.refocusTask = id;
    this.change();
    return true;
  }

  get mounted() {
    return !!this.data;
  }

  mount(inner, headEl, data, pageId) {
    this.data = normalizeTodo(data);
    this.pageId = pageId;
    this.prefs = this.loadPrefs();
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

  serialize() {
    return this.data;
  }

  plainText() {
    return todoPlainText(this.data);
  }

  focusFirst() {
    const g = [...this.groupMap.values()].find((x) => x.add);
    if (g) this.openComposer(g.key);
    else this.body.querySelector('.todo-subtitle')?.focus();
  }

  /** Open (or focus) the add box of group `key`; it replaces any other open one. */
  openComposer(key) {
    this.openAdd = key;
    this.refocusKey = key;
    this.render();
  }

  closeComposer(key, { focusPlus = false } = {}) {
    if (this.openAdd !== key) return;
    this.openAdd = null;
    this.body.querySelector(`.todo-composer[data-key="${CSS.escape(key)}"]`)?.remove();
    if (focusPlus) this.body.querySelector(`.todo-group[data-key="${CSS.escape(key)}"] [data-act="add"]`)?.focus();
  }

  // ---------- prefs ----------
  loadPrefs() {
    const base = { view: 'month', hideDone: false };
    try {
      const saved = JSON.parse(localStorage.getItem(`oc.todo.${this.pageId}`) || '{}');
      return { ...base, ...saved, view: VIEWS.some(([v]) => v === saved.view) ? saved.view : 'month' };
    } catch {
      return base;
    }
  }

  setPref(key, value) {
    this.prefs[key] = value;
    try { localStorage.setItem(`oc.todo.${this.pageId}`, JSON.stringify(this.prefs)); } catch { /* storage unavailable */ }
    this.render();
  }

  // ---------- data changes ----------
  /** Structural change: keep months in sync with tasks, re-render, save. */
  change() {
    const keys = new Set(this.data.months.map((m) => m.key));
    for (const t of this.data.tasks) {
      if (t.date) t.month = t.date.slice(0, 7);
      if (t.month && !keys.has(t.month)) {
        this.data.months.push({ key: t.month, note: '', sub: '' });
        keys.add(t.month);
      }
    }
    this.data.months.sort((a, b) => a.key.localeCompare(b.key));
    this.render();
    this.onChange();
  }

  find(id) {
    return this.data.tasks.find((t) => t.id === id);
  }

  /** Tags A→Z, ignoring case ("InfoSec" before "Money"). */
  allTags() {
    return [...new Set(this.data.tasks.map((t) => t.tag).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  }

  addTask(group, raw) {
    const parsed = parseQuickAdd(raw, { defaultMonth: group.month || null });
    if (!parsed.text) {
      toast('Type the task itself, not just a #tag or @date.');
      return false;
    }
    const task = {
      id: uid(),
      text: parsed.text,
      done: false,
      doneAt: null,
      tag: parsed.tag ?? group.tag ?? null,
      date: parsed.date ?? group.date ?? null,
      month: null,
      created: Date.now(),
    };
    task.month = task.date ? task.date.slice(0, 7) : group.month ?? null;
    this.data.tasks.push(task);
    this.refocusKey = group.key;
    this.change();
    if (this.prefs.view === 'month' && group.kind === 'month' && task.month !== group.month) {
      toast(`Added to ${task.month ? monthTitle(task.month) : 'Unscheduled'} (${fmtShort(task.date)})`);
    }
    return true;
  }

  setDate(task, iso) {
    task.date = iso;
    if (iso) task.month = iso.slice(0, 7);
    this.change();
  }

  remove(task) {
    const i = this.data.tasks.indexOf(task);
    if (i < 0) return;
    this.data.tasks.splice(i, 1);
    this.change();
    const pid = this.pageId;
    const label = task.text.length > 40 ? `${task.text.slice(0, 40)}…` : task.text;
    toast(`Removed "${label}"`, {
      action: 'Undo',
      timeout: 6000,
      onAction: () => {
        if (this.pageId !== pid || !this.data) return toast('That page is no longer open.');
        this.data.tasks.splice(Math.min(i, this.data.tasks.length), 0, task);
        this.change();
      },
    });
  }

  addMonth() {
    const last = this.data.months.at(-1)?.key || monthOf(new Date());
    const key = this.data.months.length ? addMonths(last, 1) : last;
    this.data.months.push({ key, note: '', sub: '' });
    this.openAdd = `m-${key}`;
    this.refocusKey = `m-${key}`;
    this.change();
  }

  // ---------- grouping ----------
  groups() {
    const { view } = this.prefs;
    const tasks = this.data.tasks;
    const today = isoDate(new Date());
    if (view === 'date') {
      const overdue = tasks.filter((t) => t.date && !t.done && t.date < today).sort((a, b) => a.date.localeCompare(b.date));
      const byDay = new Map();
      for (const t of tasks.filter((t) => t.date && !overdue.includes(t)).sort((a, b) => a.date.localeCompare(b.date))) {
        if (!byDay.has(t.date)) byDay.set(t.date, []);
        byDay.get(t.date).push(t);
      }
      const out = [];
      if (overdue.length) out.push({ kind: 'overdue', key: 'overdue', title: 'Overdue', badge: 'LATE', badgeClass: 'warn', tasks: overdue });
      for (const [day, list] of byDay) {
        const d = fromIso(day);
        out.push({
          kind: 'date', key: `d-${day}`, date: day, month: day.slice(0, 7), tasks: list,
          title: `${DAYS[d.getDay()]}, ${fmtShort(day)}`, sub: relative(day), badge: day === today ? 'TODAY' : null,
          add: `Add a task for ${fmtShort(day)}`,
        });
      }
      out.push({ kind: 'nodate', key: 'nodate', title: 'No date', tasks: tasks.filter((t) => !t.date), add: 'Add a task without a date (or type @20 Oct)' });
      return out;
    }
    if (view === 'tag') {
      const out = this.allTags().map((tag) => ({
        kind: 'tag', key: `t-${tag}`, tag, title: tag, tasks: tasks.filter((t) => t.tag === tag), add: `Add a task tagged ${tag}`,
      }));
      const untagged = tasks.filter((t) => !t.tag);
      out.push({ kind: 'tag', key: 't-', tag: null, title: 'No tag', tasks: untagged, add: 'Add a task (type #tag to tag it)' });
      return out;
    }
    const cur = monthOf(new Date());
    const out = this.data.months.map((m) => ({
      kind: 'month', key: `m-${m.key}`, month: m.key, note: m.note, title: monthTitle(m.key),
      sub: m.sub || monthRange(m.key), badge: m.key === cur ? 'NOW' : null,
      tasks: tasks.filter((t) => t.month === m.key), add: `Add a task to ${monthTitle(m.key)}`,
    }));
    const unscheduled = tasks.filter((t) => !t.month);
    if (unscheduled.length) out.push({ kind: 'unscheduled', key: 'unscheduled', title: 'Unscheduled', tasks: unscheduled, add: 'Add an unscheduled task' });
    return out;
  }

  // ---------- rendering ----------
  editable(tag, cls, field, value, placeholder, extra = {}) {
    return h(tag, {
      class: `${cls} todo-editable`, contenteditable: 'plaintext-only', spellcheck: 'true',
      'data-field': field, 'data-placeholder': placeholder, ...extra,
    }, value);
  }

  render() {
    if (!this.data) return;
    const d = this.data;
    const { view, hideDone } = this.prefs;
    const total = d.tasks.length;
    const done = d.tasks.filter((t) => t.done).length;
    const pct = total ? Math.round((done * 100) / total) : 0;

    this.top.replaceChildren(this.editable('div', 'todo-eyebrow', 'eyebrow', d.eyebrow, 'Add a short label'));

    const toolbar = h('div', { class: 'todo-toolbar' },
      h('div', { class: 'todo-seg', role: 'group', 'aria-label': 'Group tasks by' },
        h('span', { class: 'todo-seg-label' }, 'Group by'),
        VIEWS.map(([v, label]) => h('button', {
          class: `todo-seg-btn${view === v ? ' on' : ''}`, 'data-view': v, 'aria-pressed': String(view === v),
        }, label))),
      h('label', { class: 'todo-toggle' },
        h('input', { type: 'checkbox', 'data-act': 'hide-done', checked: hideDone }),
        'Hide completed'));

    const parts = [
      this.editable('p', 'todo-subtitle', 'subtitle', d.subtitle, 'Add a description'),
      h('div', { class: 'todo-progress' }, h('span', { class: 'todo-progress-text' }, `${done} of ${total} done`), h('span', {}, `${pct}%`)),
      h('div', { class: 'todo-bar', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div', { class: 'todo-bar-fill', style: `width:${pct}%` })),
      toolbar,
    ];
    this.groupMap = new Map();
    for (const g of this.groups()) {
      this.groupMap.set(g.key, g);
      parts.push(this.groupEl(g, hideDone));
    }
    if (view === 'month') {
      parts.push(h('button', { class: 'todo-add-month', 'data-act': 'add-month' }, h('span', { html: svg('plus', 16) }), 'Add month'));
    }
    if (this.openAdd && !this.groupMap.get(this.openAdd)?.add) this.openAdd = null; // its group is gone
    this.body.replaceChildren(...parts);

    if (this.refocusCheck) {
      this.body.querySelector(`.todo-task[data-id="${CSS.escape(this.refocusCheck)}"] .todo-check`)?.focus({ preventScroll: true });
      this.refocusCheck = null;
    }
    if (this.refocusTask) {
      this.body.querySelector(`.todo-task[data-id="${CSS.escape(this.refocusTask)}"] .todo-text`)?.focus();
      this.refocusTask = null;
    }
    if (this.refocusKey) {
      this.body.querySelector(`.todo-composer[data-key="${CSS.escape(this.refocusKey)}"] input`)?.focus();
      this.refocusKey = null;
    }
  }

  groupEl(g, hideDone) {
    // Checked tasks sink to the bottom. Each half keeps its own order (the order of data.tasks),
    // so unchecking a task puts it back where it was.
    const open = g.tasks.filter((t) => !t.done);
    const closed = g.tasks.filter((t) => t.done);
    const shown = hideDone ? open : [...open, ...closed];
    return h('section', { class: `todo-group todo-${g.kind}`, 'data-key': g.key },
      h('div', { class: 'todo-group-head' },
        h('h3', {}, g.title),
        g.sub ? h('span', { class: 'todo-sub' }, g.sub) : null,
        g.badge ? h('span', { class: `todo-badge ${g.badgeClass || ''}` }, g.badge) : null,
        g.add ? h('button', { class: 'todo-add-btn', 'data-act': 'add', title: `${g.add} (#tag @date work here)`, 'aria-label': g.add, 'aria-expanded': String(this.openAdd === g.key), html: svg('plus', 16) }) : null,
        h('span', { class: 'todo-count' }, `${closed.length}/${g.tasks.length}`),
        g.kind === 'month' ? h('button', { class: 'todo-icon-btn', 'data-act': 'month-menu', 'data-month': g.month, title: 'Month options', 'aria-label': `${g.title} options`, html: svg('more', 16) }) : null),
      g.kind === 'month' ? this.editable('p', 'todo-note', 'note', g.note, 'Add a note for this month', { 'data-month': g.month }) : null,
      h('div', { class: 'todo-list' }, shown.map((t) => this.taskEl(t, g))),
      hideDone && g.tasks.length && !shown.length ? h('p', { class: 'todo-empty' }, `All ${g.tasks.length} done`) : null,
      g.add && this.openAdd === g.key ? this.composer(g) : null);
  }

  taskEl(t, g) {
    const today = isoDate(new Date());
    const overdue = t.date && !t.done && t.date < today;
    const showDate = t.date && g.kind !== 'date';
    return h('div', { class: `todo-task${t.done ? ' done' : ''}`, 'data-id': t.id, draggable: 'true' },
      h('span', { class: 'todo-grip', 'aria-hidden': 'true', title: 'Drag to move · Alt+arrows', html: svg('grip', 14) }),
      h('button', {
        class: 'todo-check', role: 'checkbox', 'aria-checked': String(t.done), 'data-act': 'toggle',
        'aria-label': `${t.done ? 'Mark not done' : 'Mark done'}: ${t.text}`, html: t.done ? svg('check', 14) : '',
      }),
      // Text and chips share one inline box so a tag follows the last word, even when wrapping.
      h('div', { class: 'todo-main' },
        h('span', { class: 'todo-text', tabindex: '0', 'data-act': 'edit', title: 'Click to edit' }, t.text),
        t.tag && g.kind !== 'tag' ? h('button', { class: 'todo-chip', 'data-act': 'tag', title: 'Change tag' }, t.tag) : null,
        showDate ? h('button', { class: `todo-chip date${overdue ? ' overdue' : ''}`, 'data-act': 'date', title: overdue ? 'Overdue — change date' : 'Change date' }, fmtShort(t.date)) : null,
        g.kind === 'nodate' && t.month ? h('span', { class: 'todo-chip muted' }, SHORT[Number(t.month.slice(5, 7)) - 1]) : null),
      h('span', { class: 'todo-actions' },
        t.date ? null : h('button', { class: 'todo-icon-btn', 'data-act': 'date', title: 'Set a date', 'aria-label': 'Set a date', html: svg('calendar', 15) }),
        h('button', { class: 'todo-icon-btn', 'data-act': 'more', title: 'More', 'aria-label': 'More task options', html: svg('more', 15) }),
        h('button', { class: 'todo-remove', 'data-act': 'remove' }, 'Remove')));
  }

  composer(g) {
    // Every add box advertises the same quick syntax as the Cards composer. Enter adds and keeps
    // the box open for the next task; Esc, or leaving it empty, closes it.
    const placeholder = /[#@]/.test(g.add) ? g.add : `${g.add}  ·  #tag @date`;
    const input = h('input', { class: 'todo-input', placeholder, 'aria-label': g.add, autocomplete: 'off', spellcheck: 'true' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeComposer(g.key, { focusPlus: true }); }
    });
    input.addEventListener('blur', () => {
      // Wait for a click in progress to land first: removing the box shifts what is below it.
      const close = () => {
        const cur = this.body.querySelector(`.todo-composer[data-key="${CSS.escape(g.key)}"] input`);
        if (cur && !cur.value.trim() && document.activeElement !== cur) this.closeComposer(g.key);
      };
      if (this.pointerDown) document.addEventListener('pointerup', () => setTimeout(close, 0), { once: true, capture: true });
      else setTimeout(close, 0);
    });
    return h('form', {
      class: 'todo-composer', 'data-key': g.key,
      onsubmit: (e) => {
        e.preventDefault();
        if (input.value.trim() && this.addTask(g, input.value)) input.value = '';
      },
    }, input);
  }

  // ---------- interaction ----------
  onEditableInput(e) {
    const el = e.target.closest?.('.todo-editable');
    if (!el || !this.data) return;
    const value = el.textContent.replace(/\s*\n\s*/g, ' ').trim();
    if (el.dataset.field === 'note') {
      const m = this.data.months.find((x) => x.key === el.dataset.month);
      if (m) m.note = value;
    } else {
      this.data[el.dataset.field] = value;
    }
    this.onChange();
  }

  onKeyDown(e) {
    if (e.target.closest?.('.todo-editable') && (e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      e.target.blur();
      return;
    }
    // Delete on a focused task (its text or checkbox) removes it, with Undo in the toast.
    const row = e.target.closest?.('.todo-task');
    if (row && e.key === 'Delete' && !e.target.matches('input')) {
      e.preventDefault();
      const task = this.find(row.dataset.id);
      const next = row.nextElementSibling || row.previousElementSibling;
      const nextId = next?.dataset.id;
      this.remove(task);
      this.body.querySelector(`.todo-task[data-id="${CSS.escape(nextId || '')}"] .todo-text`)?.focus();
      return;
    }
    if (e.target.classList?.contains('todo-text') && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault();
      const row = e.target.closest('.todo-task');
      this.startEdit(row, this.find(row.dataset.id));
      return;
    }
    // Alt+↑/↓ reorder inside the group; Alt+←/→ move to the previous/next group (same keys as Cards).
    if (row && e.altKey && !e.ctrlKey && !e.metaKey && e.key.startsWith('Arrow') && !e.target.matches('input')) {
      e.preventDefault();
      this.moveByKey(row, e.key);
    }
  }

  moveByKey(row, key) {
    const id = row.dataset.id;
    const groupEl = row.closest('.todo-group');
    // Only among tasks with the same checked state: checked ones always stay below.
    const rows = [...groupEl.querySelectorAll('.todo-task')].filter((r) => r.classList.contains('done') === row.classList.contains('done'));
    const i = rows.indexOf(row);
    if (key === 'ArrowUp' && i > 0) this.moveTask(id, groupEl.dataset.key, rows[i - 1].dataset.id);
    else if (key === 'ArrowDown' && i < rows.length - 1) this.moveTask(id, groupEl.dataset.key, rows[i + 2]?.dataset.id || null);
    else if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const keys = [...this.groupMap.values()].filter((g) => g.kind !== 'overdue').map((g) => g.key);
      const next = keys[keys.indexOf(groupEl.dataset.key) + (key === 'ArrowLeft' ? -1 : 1)];
      if (next) this.moveTask(id, next, null);
    }
  }

  onClick(e) {
    const el = e.target.closest('[data-act], [data-view]');
    if (!el || !this.body.contains(el)) return;
    if (el.dataset.view) {
      this.setPref('view', el.dataset.view);
      return;
    }
    const row = el.closest('.todo-task');
    const task = row ? this.find(row.dataset.id) : null;
    switch (el.dataset.act) {
      case 'toggle':
        task.done = !task.done;
        task.doneAt = task.done ? Date.now() : null;
        this.refocusCheck = task.id; // the row moves (checked → bottom); focus follows it
        this.change();
        break;
      case 'add':
        if (this.openAdd === el.closest('.todo-group')?.dataset.key) this.body.querySelector(`.todo-composer[data-key="${CSS.escape(this.openAdd)}"] input`)?.focus();
        else this.openComposer(el.closest('.todo-group').dataset.key);
        break;
      case 'edit': this.startEdit(row, task); break;
      case 'tag': this.tagMenu(el, task); break;
      case 'date': this.datePopover(el, task); break;
      case 'more': this.taskMenu(el, task); break;
      case 'remove': this.remove(task); break;
      case 'month-menu': this.monthMenu(el, el.dataset.month); break;
      case 'add-month': this.addMonth(); break;
      default: break;
    }
  }

  startEdit(row, task) {
    if (!row || !task) return;
    const span = row.querySelector('.todo-text');
    if (!span) return;
    const input = h('input', { class: 'todo-edit', value: task.text, 'aria-label': 'Edit task' });
    span.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    // No re-render here: a blur caused by clicking another control must not replace that control
    // before its click lands.
    const finish = (commit) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (commit && v && v !== task.text) {
        task.text = v;
        this.onChange();
      }
      input.replaceWith(h('span', { class: 'todo-text', tabindex: '0', 'data-act': 'edit', title: 'Click to edit' }, task.text));
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  tagItems(task) {
    const pid = this.pageId;
    const set = (tag) => { if (this.pageId === pid) { task.tag = tag; this.change(); } };
    return [
      ...this.allTags().map((t) => ({ label: t, checked: task.tag === t, onClick: () => set(t) })),
      this.allTags().length ? { separator: true } : null,
      {
        label: 'New tag…', icon: 'plus',
        onClick: async () => {
          const v = await promptDialog('New tag', { label: 'Tag name', okLabel: 'Set tag' });
          const clean = v?.replace(/^#/, '').trim().slice(0, 40);
          if (clean) set(clean);
        },
      },
      task.tag ? { label: 'Remove tag', icon: 'close', onClick: () => set(null) } : null,
    ];
  }

  tagMenu(anchor, task) {
    showMenu(anchor, [{ heading: 'Tag' }, ...this.tagItems(task)]);
  }

  datePopover(anchor, task) {
    const input = h('input', { type: 'date', class: 'input', value: task.date || '', 'aria-label': 'Due date' });
    const base = new Date();
    const set = (iso) => { closeMenus(); this.setDate(task, iso); };
    const quick = (label, days) => h('button', { class: 'btn small', type: 'button', onclick: () => set(isoDate(addDays(base, days))) }, label);
    input.addEventListener('change', () => { if (input.value) set(input.value); });
    const wrap = h('div', { class: 'todo-date-pop' },
      h('div', { class: 'menu-heading' }, 'Due date'),
      input,
      h('div', { class: 'todo-date-quick' },
        quick('Today', 0), quick('Tomorrow', 1), quick('Next week', 7),
        task.date ? h('button', { class: 'btn small', type: 'button', onclick: () => set(null) }, 'Clear') : null));
    showPopover(anchor, wrap, { keepFocus: false });
    setTimeout(() => input.focus(), 0);
  }

  taskMenu(anchor, task) {
    const pid = this.pageId;
    const live = (fn) => () => { if (this.pageId === pid) fn(); };
    showMenu(anchor, [
      { label: 'Edit text', icon: 'edit', onClick: live(() => this.startEdit(this.body.querySelector(`.todo-task[data-id="${CSS.escape(task.id)}"]`), task)) },
      { label: task.date ? 'Change date…' : 'Set date…', icon: 'calendar', onClick: live(() => this.datePopover(anchor.isConnected ? anchor : this.body, task)) },
      { label: 'Tag', icon: 'palette', submenu: () => this.tagItems(task) },
      {
        label: 'Move to month', icon: 'move',
        submenu: () => [
          ...this.data.months.map((m) => ({
            label: `${monthTitle(m.key)} ${yearOf(m.key)}`, checked: task.month === m.key,
            onClick: live(() => {
              task.month = m.key;
              if (task.date && task.date.slice(0, 7) !== m.key) task.date = null;
              this.change();
            }),
          })),
          task.month ? { separator: true } : null,
          task.month ? { label: 'Unscheduled', onClick: live(() => { task.month = null; task.date = null; this.change(); }) } : null,
        ],
      },
      { label: task.done ? 'Mark not done' : 'Mark done', icon: 'check', onClick: live(() => { task.done = !task.done; task.doneAt = task.done ? Date.now() : null; this.change(); }) },
      { separator: true },
      { label: 'Remove', icon: 'trash', danger: true, onClick: live(() => this.remove(task)) },
    ]);
  }

  monthMenu(anchor, key) {
    const pid = this.pageId;
    const m = this.data.months.find((x) => x.key === key);
    if (!m) return;
    const count = this.data.tasks.filter((t) => t.month === key).length;
    showMenu(anchor, [
      {
        label: 'Edit subtitle…', icon: 'edit',
        onClick: async () => {
          const v = await promptDialog('Month subtitle', { label: `Shown next to ${monthTitle(key)}. Leave empty to show the date range.`, value: m.sub, okLabel: 'Save' });
          if (v !== null && this.pageId === pid) { m.sub = v; this.change(); }
        },
      },
      {
        label: 'Remove month', icon: 'trash', danger: true,
        onClick: async () => {
          if (count && !(await confirmDialog('Remove month?', `${count} task${count === 1 ? '' : 's'} in ${monthTitle(key)} will move to Unscheduled and lose their dates.`, { okLabel: 'Remove month' }))) return;
          if (this.pageId !== pid) return;
          for (const t of this.data.tasks) if (t.month === key) { t.month = null; t.date = null; }
          this.data.months = this.data.months.filter((x) => x.key !== key);
          this.change();
        },
      },
    ]);
  }

  exportHtml(title) {
    const d = this.data;
    const item = (t) => `<li>${t.done ? '☑' : '☐'} ${esc(t.text)}${t.tag ? ` <small>${esc(t.tag)}</small>` : ''}${t.date ? ` <small>${fmtShort(t.date)}</small>` : ''}</li>`;
    const sections = d.months.map((m) => {
      const list = d.tasks.filter((t) => t.month === m.key);
      return `<h2>${esc(monthTitle(m.key))} <small>${esc(m.sub || monthRange(m.key))}</small></h2>${m.note ? `<p>${esc(m.note)}</p>` : ''}<ul>${list.map(item).join('')}</ul>`;
    });
    const unscheduled = d.tasks.filter((t) => !t.month);
    if (unscheduled.length) sections.push(`<h2>Unscheduled</h2><ul>${unscheduled.map(item).join('')}</ul>`);
    const done = d.tasks.filter((t) => t.done).length;
    return `${d.eyebrow ? `<p class="meta">${esc(d.eyebrow)}</p>` : ''}<h1 class="page-title">${esc(title)}</h1>${d.subtitle ? `<p>${esc(d.subtitle)}</p>` : ''}<p class="meta">${done} of ${d.tasks.length} done</p>${sections.join('\n')}`;
  }
}
