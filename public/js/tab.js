// Tab: a structured page type (content.type === 'tab') for keeping money straight with people.
// One list per person; each item is something one of you paid for (qty × each = total). The list
// head shows who owes whom. Items can be combined into one agreed amount, and paid off (all of
// them, or a selection), which folds them away under a "Paid <date>" row. Uses the Cards board's
// list and card styles, so it looks like a Cards page.
import { h, esc, showMenu, modal, confirmDialog, toast } from './ui.js';
import { svg } from './icons.js';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BG = 'color-mix(in srgb, var(--accent) 16%, var(--surround))'; // the Cards "Theme tint"

// ---------- numbers (no currency: just the math) ----------
const round2 = (n) => Math.round(n * 100) / 100;
/** 15 → "15", 33.333 → "33.33", never "-0". */
export const fmt = (n) => String(round2(n) || 0);
const num = (v) => {
  const n = typeof v === 'string' && !v.trim() ? NaN : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** An item stores the number you typed (`price`) and whether it is per item or the total. */
export const itemTotal = (i) => round2(i.per === 'unit' ? i.price * i.qty : i.price);
export const itemEach = (i) => round2(i.per === 'unit' ? i.price : i.price / i.qty);
/** Signed from your side: + means they owe you, − means you owe them. */
const net = (i) => (i.payer === 'me' ? itemTotal(i) : -itemTotal(i));
const sum = (items) => round2(items.reduce((s, i) => s + net(i), 0));

function fmtDay(ts) {
  const d = new Date(ts);
  return `${d.getDate()} ${SHORT[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ''}`;
}

/** "Adarsh owes you 469" / "You owe Adarsh 20" / "All square". */
export function balanceText(name, b) {
  if (b > 0) return `${name} owes you ${fmt(b)}`;
  if (b < 0) return `You owe ${name} ${fmt(-b)}`;
  return 'All square';
}

/**
 * Quick-add syntax, written the way you'd jot it on a card:
 *   40 special maggi          total 40
 *   15 3x masala              total 15 for 3 (5 each)
 *   3x5 masala                3 at 5 each (total 15)
 *   249 + 19 biryani + maza   total 268 (only + is understood)
 *   maggi 30                  a trailing number works too
 *   -20 shuttle               a leading − means they paid
 * Returns { name, qty, price, per, payer } or { error }.
 */
export function parseTabEntry(raw) {
  const N = '\\d+(?:\\.\\d+)?';
  let s = String(raw ?? '').trim();
  let payer = 'me';
  if (/^[-−]/.test(s)) { payer = 'him'; s = s.slice(1).trim(); }
  let qty = 1;
  let price = null;
  let per = 'total';
  let m;
  if ((m = s.match(new RegExp(`^(${N})\\s*[x×]\\s*(${N})(?![\\d.])\\s*(.*)$`, 'i')))) {
    qty = Number(m[1]);
    price = Number(m[2]);
    per = 'unit';
    s = m[3];
  } else if ((m = s.match(new RegExp(`^(${N}(?:\\s*\\+\\s*${N})*)(?![\\d.x×])\\s*(.*)$`, 'i')))) {
    price = round2(m[1].split('+').reduce((a, b) => a + Number(b), 0));
    s = m[2];
    const q = s.match(new RegExp(`^(${N})[x×](?!\\d)\\s*(.*)$`, 'i'));
    if (q) { qty = Number(q[1]); s = q[2]; }
  } else if ((m = s.match(new RegExp(`^(.*?)\\s+(${N})$`)))) {
    s = m[1];
    price = Number(m[2]);
  }
  const name = s.trim().slice(0, 200);
  if (price == null) return { error: 'Start with the price, e.g. "40 maggi" or "3x5 masala".' };
  if (!name) return { error: 'Type what it was for, too.' };
  if (!(qty > 0)) return { error: 'The quantity must be more than 0.' };
  return { name, qty, price, per, payer };
}

// ---------- splitting a bill ----------
export const SPLIT_METHODS = [['equal', 'Equal'], ['exact', 'Exact'], ['percent', 'Percent'], ['shares', 'Shares'], ['fraction', 'Fraction']];
const methodName = (m) => SPLIT_METHODS.find(([id]) => id === m)?.[1].toLowerCase() || m;

/** "1/3" → 0.333…, "0.5" → 0.5; anything else → null. */
function parseFraction(s) {
  const m = String(s ?? '').trim().match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[2]) > 0 ? Number(m[1]) / Number(m[2]) : null;
  return num(s);
}

/** Round each share to 2 decimals and give the leftover cents to the biggest, so they add up exactly. */
function fixRounding(total, raw) {
  const shares = raw.map(round2);
  const diff = round2(total - shares.reduce((a, b) => a + b, 0));
  if (diff && shares.length) {
    const i = raw.indexOf(Math.max(...raw));
    shares[i] = round2(shares[i] + diff);
  }
  return shares;
}

/**
 * Each included person's share of `total`. `values` holds what was typed per person (ignored for
 * equal): an amount (exact), a percent, a number of shares, or a fraction like "1/3".
 * Returns { shares, status } when it adds up, otherwise { error }.
 */
export function splitShares(total, method, values) {
  const n = values.length;
  if (!(total > 0)) return { error: 'Enter the total.' };
  if (!n) return { error: 'Tick who it is split between.' };
  const sumOf = (v) => v.reduce((a, b) => a + b, 0);
  if (method === 'equal') return { shares: fixRounding(total, values.map(() => total / n)), status: `${n} way${n === 1 ? '' : 's'} · ${fmt(total / n)} each` };
  const parse = method === 'fraction' ? parseFraction : num;
  const v = values.map(parse);
  if (v.some((x) => x == null || x < 0)) {
    return { error: { exact: 'Enter an amount for everyone ticked.', percent: 'Enter a percent for everyone ticked.', shares: 'Enter shares for everyone ticked.', fraction: 'Enter a fraction like 1/3 for everyone ticked.' }[method] };
  }
  const s = sumOf(v);
  if (method === 'exact') {
    const left = round2(total - s);
    if (left) return { error: left > 0 ? `${fmt(left)} left to assign` : `${fmt(-left)} more than the total` };
    return { shares: v.map(round2), status: `Adds up to ${fmt(total)}` };
  }
  if (method === 'percent') {
    if (Math.abs(s - 100) >= 0.01) return { error: `Adds up to ${fmt(s)}%, needs 100%` };
    return { shares: fixRounding(total, v.map((p) => (total * p) / 100)), status: 'Adds up to 100%' };
  }
  if (method === 'shares') {
    if (!(s > 0)) return { error: 'Give someone at least 1 share.' };
    return { shares: fixRounding(total, v.map((w) => (total * w) / s)), status: `${fmt(s)} share${s === 1 ? '' : 's'} · 1 share = ${fmt(total / s)}` };
  }
  if (method === 'fraction') {
    if (Math.abs(s - 1) >= 0.001) return { error: `Adds up to ${fmt(s)}, needs 1` };
    return { shares: fixRounding(total, v.map((f) => total * f)), status: 'Adds up to 1' };
  }
  return { error: 'Pick how to split it.' };
}

/**
 * A tab only tracks what is between you and each person, so a split records:
 *  - you paid: each other person's share, as an item they owe you;
 *  - someone paid: only your share, as an item you owe them.
 * `rows` is [{ id: 'me' | personId, share }].
 */
export function splitRecords(payer, rows) {
  if (payer === 'me') return rows.filter((r) => r.id !== 'me' && r.share > 0).map((r) => ({ person: r.id, share: r.share, payer: 'me' }));
  const mine = rows.find((r) => r.id === 'me');
  return mine?.share > 0 ? [{ person: payer, share: mine.share, payer: 'him' }] : [];
}

/** A new, empty tab: people are added with "+ Add person". */
export function emptyTab() {
  return { v: 1, type: 'tab', people: [] };
}

function normItem(raw, depth = 0) {
  if (!raw || typeof raw !== 'object') return null;
  const qty = num(raw.qty);
  const price = num(raw.price);
  const parts = depth < 6 && Array.isArray(raw.parts) ? raw.parts.map((p) => normItem(p, depth + 1)).filter(Boolean) : [];
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
    name: (typeof raw.name === 'string' ? raw.name.trim().slice(0, 200) : '') || 'Untitled',
    qty: qty > 0 ? qty : 1,
    price: price == null ? 0 : Math.abs(price),
    per: raw.per === 'unit' ? 'unit' : 'total',
    payer: raw.payer === 'him' ? 'him' : 'me',
    created: Number(raw.created) || 0,
    settled: depth === 0 && typeof raw.settled === 'string' ? raw.settled : null,
    parts: parts.length ? parts : null,
    // Set on items made by "Split a bill": the bill's total, how it was split, and how many ways.
    split: raw.split && num(raw.split.total) > 0
      ? {
        total: round2(num(raw.split.total)),
        method: SPLIT_METHODS.some(([m]) => m === raw.split.method) ? raw.split.method : 'equal',
        ways: Math.max(1, Math.round(num(raw.split.ways) || 1)),
      }
      : null,
  };
}

/** Coerce stored or imported data into a valid tab. Never throws. */
export function normalizeTab(raw = {}) {
  const people = (Array.isArray(raw?.people) ? raw.people : []).filter((p) => p && typeof p === 'object').map((p) => {
    const payments = (Array.isArray(p.payments) ? p.payments : [])
      .filter((x) => x && typeof x.id === 'string' && x.id)
      .map((x) => ({ id: x.id, at: Number(x.at) || 0 }));
    const ids = new Set(payments.map((x) => x.id));
    const items = (Array.isArray(p.items) ? p.items : []).map((i) => normItem(i)).filter(Boolean);
    for (const i of items) if (i.settled && !ids.has(i.settled)) i.settled = null;
    return {
      id: typeof p.id === 'string' && p.id ? p.id : uid(),
      name: (typeof p.name === 'string' ? p.name.trim().slice(0, 80) : '') || 'Someone',
      items,
      // A payment that covers no items any more is dropped.
      payments: payments.filter((x) => items.some((i) => i.settled === x.id)),
    };
  });
  return { v: 1, type: 'tab', people };
}

export function tabPlainText(d) {
  const lines = [];
  const add = (i) => { lines.push(i.name); for (const p of i.parts || []) add(p); };
  for (const p of d.people) {
    lines.push(p.name);
    for (const i of p.items) add(i);
  }
  return lines.filter(Boolean).join('\n');
}

// =====================================================================

export class TabView {
  constructor({ onChange }) {
    this.onChange = onChange;
    this.hint = 'This is a Tab page. Add items with "+ Add item".';
    this.data = null;
    this.pageId = null;
    this.composer = null; // person id whose "add item" box is open, or 'person'
    this.select = null;   // { person, ids: Set } while picking items to combine or pay
    this.expanded = new Set(); // payment ids whose folded items are shown (view state only)
    this.refocus = null;
    this.drag = null;
    this.top = h('div', { class: 'board-top' });
    this.body = h('div', { class: 'tab-view' });
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.body.addEventListener('keydown', (e) => this.onKeyDown(e));
    this.body.addEventListener('submit', (e) => {
      const form = e.target.closest('[data-act-form]');
      if (!form) return;
      e.preventDefault();
      this.submitComposer(form, form.querySelector('[data-composer]').value);
    });
    this.body.addEventListener('dragstart', (e) => this.onDragStart(e));
    this.body.addEventListener('dragover', (e) => this.onDragOver(e));
    this.body.addEventListener('drop', (e) => this.onDrop(e));
    this.body.addEventListener('dragend', () => this.clearDrag());
  }

  mount(inner, headEl, data, pageId) {
    this.data = normalizeTab(data);
    this.pageId = pageId;
    this.composer = null;
    this.select = null;
    this.expanded = new Set();
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
  plainText() { return tabPlainText(this.data); }

  focusFirst() {
    (this.body.querySelector('.tab-item') || this.body.querySelector('[data-act="open-composer"], [data-act="open-person-composer"]'))?.focus();
  }

  // ---------- data ----------
  change() {
    this.render();
    this.onChange();
  }

  person(id) {
    return this.data.people.find((p) => p.id === id);
  }

  locate(itemId) {
    for (const person of this.data.people) {
      const index = person.items.findIndex((i) => i.id === itemId);
      if (index >= 0) return { person, item: person.items[index], index };
    }
    return null;
  }

  openItems(p) {
    return p.items.filter((i) => !i.settled);
  }

  addPerson(name) {
    const clean = name.trim().slice(0, 80);
    if (!clean) return;
    const p = { id: uid(), name: clean, items: [], payments: [] };
    this.data.people.push(p);
    // Straight into adding that person's first item.
    this.composer = p.id;
    this.refocus = { composer: p.id };
    this.change();
  }

  addItem(personId, raw) {
    const p = this.person(personId);
    if (!p || !raw.trim()) return;
    const parsed = parseTabEntry(raw);
    if (parsed.error) {
      toast(parsed.error);
      return;
    }
    p.items.push({ id: uid(), ...parsed, created: Date.now(), settled: null, parts: null });
    this.refocus = { composer: personId };
    this.change();
  }

  removeItem(itemId) {
    const at = this.locate(itemId);
    if (!at || at.item.settled) return;
    at.person.items.splice(at.index, 1);
    const open = this.openItems(at.person);
    const neighbour = open.find((i) => at.person.items.indexOf(i) >= at.index) || open.at(-1);
    this.refocus = neighbour ? { item: neighbour.id } : null;
    this.change();
    const pid = this.pageId;
    toast(`Removed "${at.item.name.length > 40 ? `${at.item.name.slice(0, 40)}…` : at.item.name}"`, {
      action: 'Undo',
      timeout: 6000,
      onAction: () => {
        if (this.pageId !== pid || !this.data) return toast('That page is no longer open.');
        const p = this.person(at.person.id);
        if (!p) return;
        p.items.splice(Math.min(at.index, p.items.length), 0, at.item);
        this.refocus = { item: at.item.id };
        this.change();
      },
    });
  }

  /** Move an open item to person `toId`, before item `beforeId` (or to the end). */
  moveItem(itemId, toId, beforeId = null) {
    const at = this.locate(itemId);
    const to = this.person(toId);
    if (!at || !to || at.item.settled || beforeId === itemId) return;
    at.person.items.splice(at.index, 1);
    const i = beforeId ? to.items.findIndex((x) => x.id === beforeId) : -1;
    to.items.splice(i < 0 ? to.items.length : i, 0, at.item);
    this.refocus = { item: itemId };
    this.change();
  }

  /** Record a payment that covers exactly `items`; they fold away under it. */
  markPaid(p, items) {
    if (!items.length) return;
    const pay = { id: uid(), at: Date.now() };
    p.payments.push(pay);
    for (const i of items) i.settled = pay.id;
    this.select = null;
    this.change();
    const pid = this.pageId;
    toast(`Marked ${items.length} item${items.length === 1 ? '' : 's'} paid`, {
      action: 'Undo',
      timeout: 6000,
      onAction: () => { if (this.pageId === pid && this.data) this.undoPayment(p.id, pay.id); },
    });
  }

  undoPayment(personId, payId) {
    const p = this.person(personId);
    if (!p) return;
    for (const i of p.items) if (i.settled === payId) i.settled = null;
    p.payments = p.payments.filter((x) => x.id !== payId);
    this.expanded.delete(payId);
    this.change();
  }

  async combine(p) {
    const items = this.openItems(p).filter((i) => this.select?.ids.has(i.id));
    if (items.length < 2) return;
    const pid = this.pageId;
    const s = sum(items);
    const nameInput = h('input', { class: 'input', value: [...new Set(items.map((i) => i.name))].join(', ').slice(0, 200), 'aria-label': 'Name' });
    const totalInput = h('input', { class: 'input', type: 'number', step: 'any', min: '0', inputmode: 'decimal', value: fmt(Math.abs(s)), 'aria-label': 'Total' });
    let payer = s < 0 ? 'him' : 'me';
    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Paid by' });
    const renderSeg = () => seg.replaceChildren(...[['me', 'Me'], ['him', p.name]].map(([v, label]) => h('button', {
      type: 'button', class: payer === v ? 'on' : '', 'aria-pressed': String(payer === v), 'data-payer': v,
      onclick: () => { payer = v; renderSeg(); },
    }, label)));
    renderSeg();
    const result = await modal({
      title: `Combine ${items.length} items`,
      className: 'tab-dialog',
      body: [
        h('label', { class: 'field-label' }, 'Name'), nameInput,
        h('label', { class: 'field-label' }, 'Total you agreed on'), totalInput,
        h('p', { class: 'tab-note' }, `The items add up to ${this.signedText(p, s)}.`),
        h('div', { class: 'field-label' }, 'Paid by'), seg,
      ],
      actions: [{ label: 'Cancel' }, { label: 'Combine', primary: true, value: () => ({ name: nameInput.value.trim(), total: num(totalInput.value) }) }],
      onOpen: () => { totalInput.focus(); totalInput.select(); },
    });
    if (!result || this.pageId !== pid) return;
    if (result.total == null || result.total < 0) return toast('Enter the total as a number.');
    const at = Math.min(...items.map((i) => p.items.indexOf(i)));
    const combined = {
      id: uid(), name: (result.name || nameInput.value || 'Combined').slice(0, 200), qty: 1, price: round2(result.total), per: 'total',
      payer, created: Date.now(), settled: null, parts: items,
    };
    p.items = p.items.filter((i) => !items.includes(i));
    p.items.splice(Math.min(at, p.items.length), 0, combined);
    this.select = null;
    this.refocus = { item: combined.id };
    this.change();
  }

  uncombine(itemId) {
    const at = this.locate(itemId);
    if (!at?.item.parts) return;
    at.person.items.splice(at.index, 1, ...at.item.parts);
    this.refocus = { item: at.item.parts[0].id };
    this.change();
  }

  // ---------- split a bill ----------
  async openSplit() {
    const people = this.data.people;
    if (!people.length) return toast('Add a person first, then split a bill with them.');
    const pid = this.pageId;
    let method = 'equal';
    let edited = false; // once you type a per-person value, changing the total no longer refills them
    const rows = [{ id: 'me', name: 'Me' }, ...people.map((p) => ({ id: p.id, name: p.name }))].map((r) => ({ ...r, on: true }));

    const nameInput = h('input', { class: 'input', placeholder: 'What was it for?', 'aria-label': 'What was it for', maxlength: '200' });
    const totalInput = h('input', { class: 'input', type: 'number', step: 'any', min: '0', inputmode: 'decimal', placeholder: 'Total', 'aria-label': 'Total' });
    const payerSelect = h('select', { class: 'select', 'aria-label': 'Paid by' }, rows.map((r) => h('option', { value: r.id }, r.name)));
    const seg = h('div', { class: 'seg split-methods', role: 'group', 'aria-label': 'How to split' });
    const status = h('p', { class: 'tab-note split-status' });
    const recorded = h('p', { class: 'tab-note split-recorded' });
    let okBtn = null;

    for (const r of rows) {
      r.check = h('input', { type: 'checkbox', checked: true, 'aria-label': `Include ${r.name}` });
      r.input = h('input', { class: 'input', 'aria-label': `${r.name}'s part`, autocomplete: 'off' });
      r.share = h('span', { class: 'split-share' });
      r.el = h('div', { class: 'split-row', 'data-split-row': r.id }, h('label', { class: 'split-who' }, r.check, h('span', {}, r.name)), r.input, r.share);
      r.check.addEventListener('change', () => { r.on = r.check.checked; prefill(); update(); });
      r.input.addEventListener('input', () => { edited = true; update(); });
    }
    const included = () => rows.filter((r) => r.on);

    // Sensible starting values for each method, so most splits need only a tweak.
    const prefill = () => {
      edited = false;
      const on = included();
      const n = on.length;
      const total = num(totalInput.value) || 0;
      const even = (t) => (n ? fixRounding(t, on.map(() => t / n)).map(fmt) : []);
      const values = {
        exact: total ? even(total) : on.map(() => ''),
        percent: even(100),
        shares: on.map(() => '1'),
        fraction: on.map(() => `1/${n}`),
        equal: on.map(() => ''),
      }[method];
      on.forEach((r, i) => { r.input.value = values[i]; });
      for (const r of rows) {
        // Equal needs no per-person value: the box keeps its grid cell (so shares stay aligned) but is invisible.
        r.input.disabled = !r.on || method === 'equal';
        if (!r.on) r.input.value = '';
        r.input.classList.toggle('ghost', method === 'equal');
        r.input.placeholder = { exact: 'Amount', percent: '%', shares: 'Shares', fraction: 'e.g. 1/3' }[method] || '';
      }
    };

    const compute = () => {
      const on = included();
      const res = splitShares(num(totalInput.value) ?? 0, method, on.map((r) => r.input.value));
      const shareRows = res.shares ? on.map((r, i) => ({ id: r.id, share: res.shares[i] })) : [];
      return { on, res, records: res.shares ? splitRecords(payerSelect.value, shareRows) : [], shareRows };
    };

    const update = () => {
      const { on, res, records, shareRows } = compute();
      for (const r of rows) {
        const s = shareRows.find((x) => x.id === r.id);
        r.share.textContent = s ? fmt(s.share) : '';
        r.el.classList.toggle('off', !r.on);
      }
      status.textContent = res.error || res.status;
      status.classList.toggle('bad', !!res.error);
      const name = (id) => rows.find((r) => r.id === id).name;
      let text = '';
      if (res.shares) {
        if (records.length) {
          text = `Adds: ${records.map((x) => (x.payer === 'me' ? `${name(x.person)} owes you ${fmt(x.share)}` : `you owe ${name(x.person)} ${fmt(x.share)}`)).join(' · ')}`;
          const others = payerSelect.value !== 'me' ? on.filter((r) => r.id !== 'me' && r.id !== payerSelect.value) : [];
          if (others.length) text += `. ${others.map((r) => r.name).join(', ')}'s part stays between them and ${name(payerSelect.value)}.`;
        } else {
          text = payerSelect.value === 'me' ? 'Nothing to add: the whole bill is your share.' : 'Nothing to add: you are not part of this split.';
        }
      }
      recorded.textContent = text;
      if (okBtn) okBtn.disabled = !records.length;
    };

    const renderSeg = () => seg.replaceChildren(...SPLIT_METHODS.map(([id, label]) => h('button', {
      type: 'button', class: method === id ? 'on' : '', 'aria-pressed': String(method === id), 'data-method': id,
      onclick: () => { method = id; renderSeg(); prefill(); update(); },
    }, label)));
    totalInput.addEventListener('input', () => { if (!edited) prefill(); update(); });
    payerSelect.addEventListener('change', update);
    renderSeg();
    prefill();
    update();

    const ok = await modal({
      title: 'Split a bill',
      className: 'tab-dialog split-dialog',
      body: [
        h('div', { class: 'split-top' }, nameInput, totalInput),
        h('div', { class: 'split-payer' }, h('span', { class: 'field-label' }, 'Paid by'), payerSelect),
        h('div', { class: 'field-label' }, 'Split'), seg,
        h('div', { class: 'split-rows' }, rows.map((r) => r.el)),
        status,
        recorded,
      ],
      actions: [{ label: 'Cancel' }, { label: 'Split', primary: true, value: true }],
      onOpen: (dlg) => {
        okBtn = dlg.querySelector('.modal-actions .btn.primary');
        update();
        nameInput.focus();
      },
    });
    if (!ok || this.pageId !== pid) return;
    const { on, records } = compute();
    if (!records.length) return;
    const total = round2(num(totalInput.value));
    const name = nameInput.value.trim().slice(0, 200) || 'Split bill';
    const added = [];
    for (const rec of records) {
      const p = this.person(rec.person);
      if (!p) continue;
      const item = {
        id: uid(), name, qty: 1, price: rec.share, per: 'total', payer: rec.payer, created: Date.now(),
        settled: null, parts: null, split: { total, method, ways: on.length },
      };
      p.items.push(item);
      added.push(item.id);
    }
    this.change();
    toast(`Split ${fmt(total)} ${on.length} way${on.length === 1 ? '' : 's'}`, {
      action: 'Undo',
      timeout: 6000,
      onAction: () => {
        if (this.pageId !== pid || !this.data) return toast('That page is no longer open.');
        for (const p of this.data.people) p.items = p.items.filter((i) => !added.includes(i.id));
        this.change();
      },
    });
  }

  signedText(p, s) {
    return s < 0 ? `${fmt(-s)} (${p.name} paid)` : fmt(s);
  }

  // ---------- rendering ----------
  render() {
    if (!this.data) return;
    const d = this.data;
    if (this.select && !this.person(this.select.person)) this.select = null;
    let owed = 0;
    let owe = 0;
    for (const p of d.people) {
      const b = sum(this.openItems(p));
      if (b > 0) owed += b;
      else owe -= b;
    }
    const toolbar = h('div', { class: 'board-toolbar' },
      h('span', { class: 'board-stats tab-summary' },
        'Owed to you ', h('b', { class: 'money-in' }, fmt(owed)), ' · You owe ', h('b', { class: 'money-out' }, fmt(owe))),
      h('button', { class: 'btn small', 'data-act': 'split', title: 'Split one bill between you and others' }, h('span', { html: svg('split', 14) }), 'Split a bill'));
    const cols = h('div', { class: 'board-cols' }, d.people.map((p) => this.personEl(p)), this.addPersonEl());
    this.body.replaceChildren(toolbar, h('div', { class: 'board-area', style: `--board-bg:${BG}` }, cols));

    const r = this.refocus;
    this.refocus = null;
    if (r?.item) this.body.querySelector(`.tab-item[data-item="${CSS.escape(r.item)}"]`)?.focus();
    else if (r?.composer) this.body.querySelector(`[data-composer="${CSS.escape(r.composer)}"]`)?.focus();
    else if (r?.title) this.body.querySelector(`.board-col[data-person="${CSS.escape(r.title)}"] .board-col-title`)?.focus();
  }

  personEl(p) {
    const open = this.openItems(p);
    const b = sum(open);
    const paid = (who) => round2(open.filter((i) => i.payer === who).reduce((s, i) => s + itemTotal(i), 0));
    const selecting = this.select?.person === p.id;
    return h('section', { class: 'board-col tab-col', 'data-person': p.id, 'aria-label': p.name },
      h('header', { class: 'board-col-head' },
        h('h3', { class: 'board-col-title', tabindex: '0', 'data-act': 'rename', title: 'Click to rename' }, p.name),
        h('button', { class: 'todo-icon-btn', 'data-act': 'person-menu', title: 'Options', 'aria-label': `${p.name} options`, html: svg('more', 16) })),
      h('div', { class: `tab-balance ${b > 0 ? 'owed' : b < 0 ? 'owe' : 'square'}` },
        h('strong', {}, balanceText(p.name, b)),
        // Always shown (0 · 0 when empty), so adding the first item doesn't push the list down a line.
        h('div', { class: 'tab-paid' }, `You paid ${fmt(paid('me'))} · ${p.name} paid ${fmt(paid('him'))}`)),
      p.payments.map((pay) => this.paymentEl(p, pay)),
      h('div', { class: 'board-cards', 'data-person': p.id }, open.map((i) => this.itemEl(p, i, selecting))),
      selecting ? this.selectBar(p) : this.composerEl(p));
  }

  paymentEl(p, pay) {
    const items = p.items.filter((i) => i.settled === pay.id);
    const isOpen = this.expanded.has(pay.id);
    return h('div', { class: `tab-paid-group${isOpen ? ' open' : ''}`, 'data-payment': pay.id },
      h('button', { class: 'tab-fold', 'data-act': 'fold', 'aria-expanded': String(isOpen) },
        h('span', { html: svg(isOpen ? 'chevronDown' : 'chevronRight', 14) }),
        h('span', {}, `Paid ${fmtDay(pay.at)} · ${fmt(Math.abs(sum(items)))}`),
        h('span', { class: 'tab-fold-count' }, `${items.length} item${items.length === 1 ? '' : 's'}`)),
      isOpen
        ? h('div', { class: 'tab-fold-body' },
          items.map((i) => h('div', { class: 'tab-row' },
            h('span', {}, i.name, i.qty !== 1 ? ` ×${fmt(i.qty)}` : '', i.payer === 'him' ? ` (${p.name} paid)` : ''),
            h('span', {}, (i.payer === 'him' ? '−' : '') + fmt(itemTotal(i))))),
          h('button', { class: 'btn small', 'data-act': 'undo-payment' }, 'Undo payment'))
        : null);
  }

  itemEl(p, i, selecting) {
    const checked = selecting && this.select.ids.has(i.id);
    const total = itemTotal(i);
    const qty = i.qty !== 1 ? ` ×${fmt(i.qty)}` : '';
    return h('div', {
      class: `board-card tab-item${i.payer === 'him' ? ' him' : ''}${checked ? ' selected' : ''}`,
      tabindex: '0', draggable: selecting ? 'false' : 'true', role: selecting ? 'checkbox' : 'button',
      'aria-checked': selecting ? String(checked) : null, 'data-item': i.id,
      'aria-label': `${i.name}${qty}, ${fmt(total)}${i.payer === 'him' ? `, ${p.name} paid` : ''}.`,
    },
    // One line per item, so every item is the same height: the name shortens (…) to make room,
    // and the tags always sit just left of the amount. Green = they owe you, red = you owe them.
    selecting ? h('span', { class: 'tab-check', html: checked ? svg('check', 12) : '' }) : null,
    h('span', { class: 'tab-name', title: i.name }, i.name),
    qty ? h('span', { class: 'tab-qty' }, qty) : null,
    i.parts ? h('span', { class: 'tab-tag' }, `${i.parts.length} items`) : null,
    i.split ? h('span', { class: 'tab-tag', title: `Share of ${fmt(i.split.total)}, split ${i.split.ways} ways (${methodName(i.split.method)})` }, 'split') : null,
    i.payer === 'him' ? h('span', { class: 'tab-tag', title: `${p.name} paid` }, `${p.name} paid`) : null,
    h('span', { class: `tab-amt ${i.payer === 'him' ? 'money-out' : 'money-in'}` }, (i.payer === 'him' ? '−' : '') + fmt(total)));
  }

  composerEl(p) {
    if (this.composer !== p.id) {
      return h('button', { class: 'board-add-card', 'data-act': 'open-composer' }, h('span', { html: svg('plus', 16) }), 'Add item');
    }
    return h('form', { class: 'board-composer', 'data-act-form': 'item' },
      h('input', { class: 'board-input', placeholder: '40 maggi · 3x5 masala · -20 shuttle', 'data-composer': p.id, 'aria-label': `New item for ${p.name}`, autocomplete: 'off' }),
      h('div', { class: 'board-composer-row' },
        h('button', { class: 'btn primary small', type: 'submit' }, 'Add item'),
        h('button', { class: 'todo-icon-btn', type: 'button', 'data-act': 'close-composer', title: 'Cancel', html: svg('close', 16) })));
  }

  addPersonEl() {
    if (this.composer === 'person') {
      return h('form', { class: 'board-col board-new-list', 'data-act-form': 'person' },
        h('input', { class: 'board-input', placeholder: 'Name…', 'data-composer': 'person', 'aria-label': 'New person', autocomplete: 'off' }),
        h('div', { class: 'board-composer-row' },
          h('button', { class: 'btn primary small', type: 'submit' }, 'Add person'),
          h('button', { class: 'todo-icon-btn', type: 'button', 'data-act': 'close-composer', title: 'Cancel', html: svg('close', 16) })));
    }
    return h('button', { class: 'board-col board-add-list', 'data-act': 'open-person-composer' }, h('span', { html: svg('plus', 16) }), 'Add person');
  }

  selectBar(p) {
    const items = this.openItems(p).filter((i) => this.select.ids.has(i.id));
    return h('div', { class: 'tab-select-bar' },
      h('div', { class: 'tab-select-sum' }, items.length ? `${items.length} selected · ${this.signedText(p, sum(items))}` : 'Click items to select them'),
      h('div', { class: 'board-composer-row' },
        h('button', { class: 'btn small', 'data-act': 'combine', disabled: items.length < 2 }, 'Combine'),
        h('button', { class: 'btn small primary', 'data-act': 'mark-paid', disabled: !items.length }, 'Mark paid'),
        h('button', { class: 'btn small', 'data-act': 'cancel-select' }, 'Cancel')));
  }

  // ---------- events ----------
  onClick(e) {
    const act = e.target.closest('[data-act]');
    const colEl = e.target.closest('.board-col[data-person]');
    const p = colEl && this.person(colEl.dataset.person);
    if (act && this.body.contains(act)) {
      switch (act.dataset.act) {
        case 'split': this.openSplit(); return;
        case 'open-composer': this.composer = p.id; this.refocus = { composer: p.id }; this.render(); return;
        case 'open-person-composer': this.composer = 'person'; this.refocus = { composer: 'person' }; this.render(); return;
        case 'close-composer': this.composer = null; this.render(); return;
        case 'person-menu': this.personMenu(act, p); return;
        case 'rename': this.renamePerson(act, p); return;
        case 'fold': {
          const id = act.closest('[data-payment]').dataset.payment;
          if (!this.expanded.delete(id)) this.expanded.add(id);
          this.render();
          return;
        }
        case 'undo-payment': this.undoPayment(p.id, act.closest('[data-payment]').dataset.payment); return;
        case 'combine': this.combine(p); return;
        case 'mark-paid': this.markPaid(p, this.openItems(p).filter((i) => this.select.ids.has(i.id))); return;
        case 'cancel-select': this.select = null; this.render(); return;
        default: return;
      }
    }
    const card = e.target.closest('.tab-item');
    if (card) this.activate(card);
  }

  /** Click / Enter on an item: toggle it while selecting, otherwise open it. */
  activate(card) {
    const id = card.dataset.item;
    if (this.select && card.closest('[data-person]').dataset.person === this.select.person) {
      if (!this.select.ids.delete(id)) this.select.ids.add(id);
      this.refocus = { item: id };
      this.render();
    } else {
      this.openItem(id);
    }
  }

  onKeyDown(e) {
    const form = e.target.closest?.('[data-act-form]');
    if (form && e.target.matches('input')) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.composer = null; this.render(); }
      return; // Enter submits the form
    }
    if (e.key === 'Escape' && this.select) { e.preventDefault(); e.stopPropagation(); this.select = null; this.render(); return; }
    if (e.target.classList.contains('board-col-title') && (e.key === 'Enter' || e.key === 'F2')) {
      e.preventDefault();
      this.renamePerson(e.target, this.person(e.target.closest('[data-person]').dataset.person));
      return;
    }
    const card = e.target.closest?.('.tab-item');
    if (!card || e.target !== card) return;
    const at = this.locate(card.dataset.item);
    if (!at) return;
    const open = this.openItems(at.person);
    const oi = open.indexOf(at.item);
    const people = this.data.people;
    const pi = people.indexOf(at.person);
    const focusItem = (p, index) => {
      const list = p ? this.openItems(p) : [];
      const it = list[Math.max(0, Math.min(index, list.length - 1))];
      if (it) this.body.querySelector(`.tab-item[data-item="${CSS.escape(it.id)}"]`)?.focus();
    };
    const key = e.key;
    if (key === 'Enter' || key === ' ') { e.preventDefault(); this.activate(card); return; }
    if (this.select) return; // no moving or deleting while picking items
    if (key === 'Delete' || key === 'Backspace') { e.preventDefault(); this.removeItem(at.item.id); }
    else if (e.altKey && key === 'ArrowUp') { e.preventDefault(); if (oi > 0) this.moveItem(at.item.id, at.person.id, open[oi - 1].id); }
    else if (e.altKey && key === 'ArrowDown') { e.preventDefault(); if (oi < open.length - 1) this.moveItem(at.item.id, at.person.id, open[oi + 2]?.id || null); }
    else if (e.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      e.preventDefault();
      const to = people[pi + (key === 'ArrowLeft' ? -1 : 1)];
      if (to) this.moveItem(at.item.id, to.id, this.openItems(to)[oi]?.id || null);
    }
    else if (key === 'ArrowDown') { e.preventDefault(); focusItem(at.person, oi + 1); }
    else if (key === 'ArrowUp') { e.preventDefault(); focusItem(at.person, oi - 1); }
    else if (key === 'ArrowLeft') { e.preventDefault(); focusItem(people[pi - 1], oi); }
    else if (key === 'ArrowRight') { e.preventDefault(); focusItem(people[pi + 1], oi); }
  }

  submitComposer(form, value) {
    if (form.dataset.actForm === 'person') this.addPerson(value);
    else this.addItem(this.composer, value);
  }

  // ---------- drag and drop (open items, within or between people) ----------
  onDragStart(e) {
    const card = e.target.closest?.('.tab-item');
    if (!card || this.select) return;
    this.drag = card.dataset.item;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-tab-item', this.drag);
    card.classList.add('dragging');
  }

  dropTarget(e) {
    const list = e.target.closest?.('.board-col[data-person]')?.querySelector('.board-cards');
    if (!list) return null;
    const cards = [...list.querySelectorAll('.tab-item')].filter((c) => c.dataset.item !== this.drag);
    const before = cards.find((c) => { const r = c.getBoundingClientRect(); return e.clientY < r.top + r.height / 2; }) || null;
    return { list, personId: list.dataset.person, before };
  }

  onDragOver(e) {
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
    if (!this.drag) return;
    const t = this.dropTarget(e);
    if (!t) return;
    e.preventDefault();
    const id = this.drag;
    this.clearDrag();
    this.moveItem(id, t.personId, t.before?.dataset.item || null);
  }

  clearDrag() {
    this.drag = null;
    for (const el of this.body.querySelectorAll('.drop-before, .drop-end, .dragging')) el.classList.remove('drop-before', 'drop-end', 'dragging');
  }

  // ---------- menus ----------
  renamePerson(titleEl, p) {
    if (!p) return;
    const input = h('input', { class: 'board-input title', value: p.name, 'aria-label': 'Name' });
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (commit) => {
      if (done) return;
      done = true;
      const v = input.value.trim();
      if (commit && v && v !== p.name) { p.name = v.slice(0, 80); this.change(); }
      else this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
  }

  personMenu(anchor, p) {
    const people = this.data.people;
    const i = people.indexOf(p);
    const open = this.openItems(p);
    const move = (dir) => {
      [people[i], people[i + dir]] = [people[i + dir], people[i]];
      this.change();
    };
    showMenu(anchor, [
      { label: 'Select items…', icon: 'check', disabled: !open.length, onClick: () => { this.select = { person: p.id, ids: new Set() }; this.composer = null; this.render(); } },
      { label: 'Settle up', icon: 'todo', disabled: !open.length, onClick: () => this.markPaid(p, this.openItems(p)) },
      { separator: true },
      { label: 'Rename', icon: 'edit', onClick: () => { const t = this.body.querySelector(`.board-col[data-person="${CSS.escape(p.id)}"] .board-col-title`); if (t) this.renamePerson(t, p); } },
      { label: 'Move left', icon: 'back', disabled: i <= 0, onClick: () => move(-1) },
      { label: 'Move right', icon: 'forward', disabled: i >= people.length - 1, onClick: () => move(1) },
      { separator: true },
      { label: 'Delete person', icon: 'trash', danger: true, onClick: () => this.deletePerson(p) },
    ]);
  }

  async deletePerson(p) {
    const pid = this.pageId;
    if (p.items.length && !(await confirmDialog('Delete person?', `"${p.name}" and all ${p.items.length} item${p.items.length === 1 ? '' : 's'} (paid ones too) will be deleted.`, { okLabel: 'Delete' }))) return;
    if (this.pageId !== pid) return;
    this.data.people = this.data.people.filter((x) => x !== p);
    this.change();
  }

  // ---------- item dialog ----------
  async openItem(itemId) {
    const at = this.locate(itemId);
    if (!at) return;
    const { person: p, item } = at;
    const pid = this.pageId;
    const live = () => { if (this.pageId === pid) { this.render(); this.onChange(); } };

    const nameInput = h('input', { class: 'input card-title-input', value: item.name, 'aria-label': 'Name' });
    nameInput.addEventListener('input', () => { if (nameInput.value.trim()) { item.name = nameInput.value.trim().slice(0, 200); live(); } });

    // Qty, Each and Total stay in step: the one you type in is kept, the other is worked out.
    const field = (label, value) => h('input', { class: 'input', type: 'number', step: 'any', min: '0', inputmode: 'decimal', value, 'aria-label': label });
    const qty = field('Quantity', fmt(item.qty));
    const each = field('Each', fmt(itemEach(item)));
    const total = field('Total', fmt(itemTotal(item)));
    const sync = (from) => {
      if (from !== 'each') each.value = fmt(itemEach(item));
      if (from !== 'total') total.value = fmt(itemTotal(item));
    };
    qty.addEventListener('input', () => { const n = num(qty.value); if (n > 0) { item.qty = n; sync('qty'); live(); } });
    each.addEventListener('input', () => { const n = num(each.value); if (n >= 0) { item.per = 'unit'; item.price = n; sync('each'); live(); } });
    total.addEventListener('input', () => { const n = num(total.value); if (n >= 0) { item.per = 'total'; item.price = n; sync('total'); live(); } });

    const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Paid by' });
    const renderSeg = () => seg.replaceChildren(...[['me', 'Me'], ['him', p.name]].map(([v, label]) => h('button', {
      type: 'button', class: item.payer === v ? 'on' : '', 'aria-pressed': String(item.payer === v), 'data-payer': v,
      onclick: () => { item.payer = v; renderSeg(); live(); },
    }, label)));
    renderSeg();

    const parts = item.parts
      ? [
        h('div', { class: 'field-label' }, `Combined from ${item.parts.length} items`),
        h('div', { class: 'tab-parts' }, item.parts.map((i) => h('div', { class: 'tab-row' },
          h('span', {}, i.name, i.qty !== 1 ? ` ×${fmt(i.qty)}` : '', i.payer === 'him' ? ` (${p.name} paid)` : ''),
          h('span', {}, (i.payer === 'him' ? '−' : '') + fmt(itemTotal(i)))))),
        h('p', { class: 'tab-note' }, `They added up to ${this.signedText(p, sum(item.parts))}.`),
      ]
      : [];
    const settled = !!item.settled;
    const result = await modal({
      title: settled ? 'Item (paid)' : 'Item',
      className: 'tab-dialog',
      body: [
        nameInput,
        h('div', { class: 'tab-nums' },
          h('label', { class: 'field-label' }, 'Qty', qty),
          h('label', { class: 'field-label' }, 'Each', each),
          h('label', { class: 'field-label' }, 'Total', total)),
        h('div', { class: 'field-label' }, 'Paid by'), seg,
        item.split ? h('p', { class: 'tab-note' }, `${item.payer === 'me' ? `${p.name}'s` : 'Your'} share of ${fmt(item.split.total)}, split ${item.split.ways} ways (${methodName(item.split.method)}).`) : null,
        ...parts,
      ],
      actions: [
        { label: 'Delete', danger: true, value: 'delete' },
        item.parts ? { label: 'Uncombine', value: 'uncombine' } : null,
        { label: 'Done', primary: true, value: 'done' },
      ].filter(Boolean),
      onOpen: () => { nameInput.focus(); nameInput.select(); },
    });
    if (this.pageId !== pid) return;
    if (result === 'delete') this.removeItem(item.id);
    else if (result === 'uncombine') this.uncombine(item.id);
    else {
      this.refocus = { item: item.id };
      this.render();
    }
  }

  exportHtml(title) {
    const row = (p, i) => `<tr><td>${esc(i.name)}${i.qty !== 1 ? ` ×${fmt(i.qty)}` : ''}${i.payer === 'him' ? ` <small>(${esc(p.name)} paid)</small>` : ''}</td><td style="text-align:right">${i.payer === 'him' ? '−' : ''}${fmt(itemTotal(i))}</td></tr>`;
    const people = this.data.people.map((p) => {
      const open = this.openItems(p);
      const paid = p.payments.map((pay) => {
        const items = p.items.filter((i) => i.settled === pay.id);
        return `<h3>Paid ${esc(fmtDay(pay.at))} · ${fmt(Math.abs(sum(items)))}</h3><table>${items.map((i) => row(p, i)).join('')}</table>`;
      }).join('');
      return `<section><h2>${esc(p.name)} <small>${esc(balanceText(p.name, sum(open)))}</small></h2><table>${open.map((i) => row(p, i)).join('')}</table>${paid}</section>`;
    }).join('\n');
    return `<h1 class="page-title">${esc(title)}</h1>${people}`;
  }
}
