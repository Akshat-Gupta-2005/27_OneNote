import { api } from './api.js';
import { h, esc, toast, showMenu, fmtDate, fmtTime, fmtSize } from './ui.js';
import { TodoView } from './todo.js';
import { BoardView } from './board.js';
import { TabView } from './tab.js';

const NS = 'http://www.w3.org/2000/svg';
const OWN_MIME = 'application/x-onenote-clone';
const SAVE_DELAY = 600;
const EMPTY_HTML = '<div><br></div>';
const LEAF_BLOCKS = 'div, p, li, h1, h2, h3, h4, h5, h6, pre';
const INLINE = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'SUB', 'SUP', 'SPAN', 'FONT', 'MARK', 'A', 'CODE', 'SMALL']);
const LINE_CLASSES = { narrow: 'lines-narrow', college: 'lines-college', 'grid-small': 'grid-small', 'grid-large': 'grid-large' };

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const r1 = (n) => Math.round(n * 10) / 10;

// ---------- ink geometry ----------
function toPath(p) {
  if (p.length <= 2) return `M${p[0]} ${p[1]} l0.01 0`;
  let d = `M${p[0]} ${p[1]}`;
  for (let i = 2; i < p.length - 2; i += 2) {
    d += ` Q${p[i]} ${p[i + 1]} ${r1((p[i] + p[i + 2]) / 2)} ${r1((p[i + 1] + p[i + 3]) / 2)}`;
  }
  return d + ` L${p[p.length - 2]} ${p[p.length - 1]}`;
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function hitStroke(s, x, y, radius) {
  const p = s.p;
  if (p.length <= 2) return Math.hypot(x - p[0], y - p[1]) <= radius;
  for (let i = 0; i < p.length - 2; i += 2) {
    if (distToSegment(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= radius) return true;
  }
  return false;
}

// ---------- paste sanitizing ----------
const DROP_TAGS = new Set(['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'CANVAS',
  'FORM', 'INPUT', 'BUTTON', 'SELECT', 'TEXTAREA', 'SVG', 'MATH', 'HEAD', 'VIDEO', 'AUDIO', 'SOURCE', 'BASE', 'FRAME', 'FRAMESET']);
const KEEP_TAGS = new Set(['A', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'INS', 'SUB', 'SUP', 'P', 'DIV', 'SPAN', 'BR',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'PRE', 'CODE', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD',
  'TH', 'IMG', 'HR', 'FONT', 'MARK', 'SMALL', 'CAPTION']);
const SAFE_STYLE = ['font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'text-align', 'vertical-align'];

export function sanitizeHtml(html, own = false) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walk = (parent) => {
    for (const node of [...parent.childNodes]) {
      if (node.nodeType === Node.COMMENT_NODE) { node.remove(); continue; }
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = node.tagName.toUpperCase();
      if (DROP_TAGS.has(tag)) { node.remove(); continue; }
      walk(node);
      if (!KEEP_TAGS.has(tag)) { node.replaceWith(...node.childNodes); continue; }
      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();
        if (name === 'style' && !own) {
          const kept = SAFE_STYLE.map((p) => (node.style.getPropertyValue(p) ? `${p}: ${node.style.getPropertyValue(p)}` : '')).filter(Boolean).join('; ');
          if (kept) node.setAttribute('style', kept);
          else node.removeAttribute('style');
          continue;
        }
        let keep = false;
        if (name === 'href' && tag === 'A') keep = /^(https?:|mailto:|tel:|\/uploads\/|#)/i.test(value);
        else if (name === 'src' && tag === 'IMG') keep = /^(https?:|data:image\/(png|jpe?g|gif|webp);|\/uploads\/)/i.test(value);
        else if (['alt', 'colspan', 'rowspan', 'title'].includes(name)) keep = true;
        else if (own && (name === 'style' || name === 'class' || name.startsWith('data-') || (name === 'contenteditable' && value === 'false'))) keep = true;
        if (!keep) node.removeAttribute(attr.name);
      }
      if (tag === 'IMG' && !node.hasAttribute('src')) node.remove();
      else if (!own && tag === 'SPAN' && !node.attributes.length) node.replaceWith(...node.childNodes);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

function caretRangeAt(x, y) {
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(p.offsetNode, p.offset);
    r.collapse(true);
    return r;
  }
  return document.caretRangeFromPoint?.(x, y) || null;
}

function attachmentHtml(up) {
  return `<a class="attachment" contenteditable="false" href="${esc(up.url)}" title="Click to open">📎 ${esc(up.name)} <small>${fmtSize(up.size)}</small></a>&nbsp;`;
}

// =====================================================================

export class PageEditor extends EventTarget {
  constructor() {
    super();
    this.canvas = document.getElementById('canvas');
    this.inner = document.getElementById('pageInner');
    this.titleEl = document.getElementById('pageTitle');
    this.dateEl = document.getElementById('pageDate');
    this.timeEl = document.getElementById('pageTime');
    this.ink = document.getElementById('inkLayer');
    this.imgHandle = document.getElementById('imgHandle');
    this.emptyEl = document.getElementById('canvasEmpty');

    this.page = null;
    this.strokes = [];
    this.lines = 'none';
    this.mode = 'type';
    this.zoom = 1;
    this.pen = { color: 'auto', width: 2 };
    this.highlighter = { color: '#ffeb3b', width: 14 };

    this.savedSnapshot = null;
    this.dirty = false;
    this.timer = null;
    this.inflight = null;

    this.lastRange = null;
    this.activeContent = null;
    this.pendingFontPt = null;
    this.painter = null;
    this.selectedImg = null;
    this.rec = null;
    this.extentFrame = 0;
    this.selFrame = 0;

    // 'canvas' = freeform page. Structured pages ('todo' planner, 'board' of cards, 'tab' of money)
    // are rendered by a view object instead of containers; every view has mount/unmount/serialize/
    // plainText/focusFirst/exportHtml and top/body elements.
    this.kind = 'canvas';
    const onChange = () => this.scheduleSave();
    this.views = { todo: new TodoView({ onChange }), board: new BoardView({ onChange }), tab: new TabView({ onChange }) };
    this.view = null;

    this.bind();
  }

  emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail }));
  }

  // ================= event wiring =================
  bind() {
    const { inner } = this;

    // Click on empty canvas => new note container
    inner.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || this.mode !== 'type' || e.target !== inner || this.structured) return;
      e.preventDefault();
      this.deselectBlocks();
      this.hideImgHandle();
      if (!this.page) return;
      const { x, y } = this.point(e);
      this.focusBlock(this.addBlock({ x: Math.max(0, x - 8), y: Math.max(12, y - 10) }));
    });

    // Move / resize containers
    inner.addEventListener('pointerdown', (e) => this.onBlockPointerDown(e));

    inner.addEventListener('focusout', (e) => {
      if (e.target.classList?.contains('nb-handle')) {
        e.target.parentElement.classList.remove('selected');
        return;
      }
      const content = e.target.closest?.('.nb-content');
      if (!content) return;
      // Record the selection as focus leaves (e.g. into the font-size box). `selectionchange` is
      // async and may only fire after focus has moved, too late to see this selection (P12).
      const sel = getSelection();
      if (sel.rangeCount && content.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        this.lastRange = sel.getRangeAt(0).cloneRange();
        this.activeContent = content;
      }
      const block = content.parentElement;
      const to = e.relatedTarget;
      if (to && (block.contains(to) || to.closest('.ribbon, .menu, .modal-overlay'))) return;
      setTimeout(() => {
        if (block.isConnected && !block.contains(document.activeElement) && this.isEmptyBlock(block)) {
          block.remove();
          this.scheduleSave();
        }
      }, 0);
    });

    inner.addEventListener('input', (e) => {
      const content = e.target.closest?.('.nb-content');
      if (!content) return;
      this.fixFontSizes(content);
      this.clearSearchHighlight();
      this.hideImgHandle();
      this.scheduleSave();
      this.queueExtent();
    });

    inner.addEventListener('keydown', (e) => this.onKeyDown(e));
    inner.addEventListener('click', (e) => this.onClick(e));
    inner.addEventListener('contextmenu', (e) => {
      const handle = e.target.closest('.nb-handle');
      if (!handle) return;
      e.preventDefault();
      const block = handle.parentElement;
      showMenu({ x: e.clientX, y: e.clientY }, [
        { label: 'Delete note container', icon: 'trash', danger: true, onClick: () => { block.remove(); this.scheduleSave(); } },
      ]);
    });

    // Title
    this.titleEl.addEventListener('input', () => {
      if (!this.page) return;
      this.page.title = this.titleText();
      this.emit('title', this.page.title);
      this.clearSearchHighlight();
      this.scheduleSave();
    });
    this.titleEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (this.structured) {
          this.view.focusFirst();
          return;
        }
        const first = this.blocks().sort((a, b) => a.offsetTop - b.offsetTop)[0];
        if (first) this.focusBlock(first, true);
        else this.focusBlock(this.addBlock({ x: 60, y: 100 }));
      }
    });

    // Clipboard & drop
    inner.addEventListener('paste', (e) => this.onPaste(e));
    inner.addEventListener('copy', (e) => this.onCopy(e, false));
    inner.addEventListener('cut', (e) => this.onCopy(e, true));
    inner.addEventListener('dragover', (e) => {
      if (this.page && e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    inner.addEventListener('drop', (e) => this.onDrop(e));

    // Track the selection so ribbon commands can restore it
    document.addEventListener('selectionchange', () => {
      const sel = getSelection();
      if (!sel.rangeCount) return;
      const r = sel.getRangeAt(0);
      const node = r.commonAncestorContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      const content = el?.closest?.('.nb-content');
      if (content && inner.contains(content)) {
        this.lastRange = r.cloneRange();
        this.activeContent = content;
        this.emitSelection();
      }
    });

    document.addEventListener('mouseup', () => {
      if (this.painter) setTimeout(() => this.applyPainter(), 0);
    });

    // Ink
    this.ink.addEventListener('pointerdown', (e) => this.onInkDown(e));
    this.ink.addEventListener('pointermove', (e) => this.onInkMove(e));
    this.ink.addEventListener('pointerup', () => this.onInkUp());
    this.ink.addEventListener('pointercancel', () => this.onInkUp());

    // Image resize handle
    this.imgHandle.addEventListener('pointerdown', (e) => this.onImgResize(e));
  }

  emitSelection() {
    cancelAnimationFrame(this.selFrame);
    this.selFrame = requestAnimationFrame(() => this.emit('selection'));
  }

  // ================= page lifecycle =================
  load(page) {
    this.stopDictation();
    this.cancelPainter();
    this.setMode('type');
    this.page = page;
    this.clearBlocks();
    this.unmountView();
    this.hideImgHandle();
    this.clearSearchHighlight();

    let data = {};
    if (page.content) {
      try { data = JSON.parse(page.content); } catch { data = { blocks: [{ x: 60, y: 100, html: page.content }] }; }
    }
    this.kind = this.views[data?.type] ? data.type : 'canvas';
    this.inner.classList.toggle('todo-mode', this.kind === 'todo');
    this.inner.classList.toggle('board-mode', this.kind === 'board' || this.kind === 'tab');
    this.inner.classList.toggle('tab-mode', this.kind === 'tab');
    if (this.structured) {
      this.view = this.views[this.kind];
      this.lines = 'none';
      this.strokes = [];
      this.view.mount(this.inner, this.inner.querySelector('.page-head'), data, page.id);
    } else {
      this.lines = data.lines || 'none';
      this.strokes = Array.isArray(data.ink) ? data.ink : [];
      for (const b of data.blocks || []) this.addBlock(b);
    }

    this.titleEl.textContent = page.title || '';
    this.dateEl.textContent = fmtDate(page.created_at);
    this.timeEl.textContent = fmtTime(page.created_at);
    this.renderInk();
    this.applyLines();
    this.inner.hidden = false;
    this.emptyEl.hidden = true;
    this.updateExtent();

    this.savedSnapshot = this.snapshot();
    this.dirty = false;
    this.lastRange = null;
    this.activeContent = null;
    this.canvas.scrollTo(0, 0);
    this.emit('status', 'saved');
  }

  showEmpty(...nodes) {
    this.stopDictation();
    this.page = null;
    this.clearBlocks();
    this.unmountView();
    this.strokes = [];
    this.renderInk();
    this.inner.hidden = true;
    this.emptyEl.replaceChildren(...nodes);
    this.emptyEl.hidden = false;
  }

  get structured() {
    return this.kind !== 'canvas';
  }

  unmountView() {
    for (const v of Object.values(this.views)) v.unmount();
    this.view = null;
    this.kind = 'canvas';
    this.inner.classList.remove('todo-mode', 'board-mode', 'tab-mode');
  }

  /** Set the page title as if typed (used when inserting a template into an untitled page). */
  setTitle(text) {
    if (!this.page) return;
    this.titleEl.textContent = text;
    this.page.title = this.titleText();
    this.emit('title', this.page.title);
    this.scheduleSave();
  }

  focusTitle() {
    this.titleEl.focus();
    const r = document.createRange();
    r.selectNodeContents(this.titleEl);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }

  titleText() {
    return this.titleEl.textContent.replace(/\s*\n\s*/g, ' ').trim();
  }

  // ================= saving =================
  serialize() {
    if (this.structured) return this.view.serialize();
    const blocks = [];
    for (const b of this.blocks()) {
      if (this.isEmptyBlock(b)) continue;
      blocks.push({
        id: b.dataset.id,
        x: Math.round(parseFloat(b.style.left) || 0),
        y: Math.round(parseFloat(b.style.top) || 0),
        w: b.style.width ? Math.round(parseFloat(b.style.width)) : null,
        html: b.querySelector('.nb-content').innerHTML,
      });
    }
    return { v: 1, lines: this.lines, blocks, ink: this.strokes };
  }

  plainText() {
    if (this.structured) return this.view.plainText();
    return this.blocks()
      .sort((a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft)
      .map((b) => b.querySelector('.nb-content').innerText.trim())
      .filter(Boolean)
      .join('\n\n');
  }

  snapshot() {
    return JSON.stringify({ t: this.titleText(), c: this.serialize() });
  }

  scheduleSave() {
    if (!this.page) return;
    this.dirty = true;
    this.emit('status', 'dirty');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), SAVE_DELAY);
  }

  async save({ keepalive = false } = {}) {
    clearTimeout(this.timer);
    this.timer = null;
    if (this.inflight) await this.inflight.catch(() => {});
    const page = this.page;
    if (!page) return;
    const snap = this.snapshot();
    if (snap === this.savedSnapshot) {
      this.dirty = false;
      this.emit('status', 'saved');
      return;
    }
    const body = { title: this.titleText(), content: JSON.stringify(this.serialize()), text: this.plainText() };
    this.emit('status', 'saving');
    const req = api.patch(`/pages/${page.id}`, body, { keepalive });
    this.inflight = req;
    try {
      const res = await req;
      if (this.page === page) {
        this.savedSnapshot = snap;
        if (!this.timer) {
          this.dirty = false;
          this.emit('status', 'saved');
        }
      }
      this.emit('saved', res);
    } catch (err) {
      console.error('Save failed', err);
      this.emit('status', 'error');
      if (this.page === page) {
        this.dirty = true;
        this.timer = setTimeout(() => this.save(), 4000);
      }
    } finally {
      if (this.inflight === req) this.inflight = null;
    }
  }

  async flush() {
    if (this.timer || this.dirty) await this.save();
    else if (this.inflight) await this.inflight.catch(() => {});
  }

  // ================= blocks =================
  blocks() {
    return [...this.inner.querySelectorAll(':scope > .nb')];
  }

  clearBlocks() {
    for (const b of this.blocks()) b.remove();
  }

  addBlock({ id, x = 60, y = 100, w = null, html = '' } = {}) {
    const block = h('div', { class: 'nb', dataset: { id: id || uid() } });
    block.style.left = `${x}px`;
    block.style.top = `${y}px`;
    if (w) {
      block.style.width = `${w}px`;
      block.style.maxWidth = 'none';
    }
    const content = h('div', { class: 'nb-content', contenteditable: 'true', spellcheck: 'true' });
    content.innerHTML = html || EMPTY_HTML;
    block.append(
      h('div', { class: 'nb-handle', tabindex: '-1', title: 'Drag to move · Delete to remove' }),
      content,
      h('div', { class: 'nb-resize', title: 'Drag to resize' }),
    );
    this.inner.append(block);
    return block;
  }

  /**
   * Add a group of containers (an insert template) below everything already on the page,
   * keeping their layout relative to each other. Returns the new elements.
   */
  insertBlocks(specs) {
    if (!this.page || this.structured || !specs.length) return [];
    const existing = this.blocks().filter((b) => !this.isEmptyBlock(b));
    const top = existing.length ? existing.reduce((m, b) => Math.max(m, b.offsetTop + b.offsetHeight), 0) + 40 : 100;
    const minY = Math.min(...specs.map((s) => s.y));
    const added = specs.map((s) => this.addBlock({ ...s, id: undefined, y: top + (s.y - minY) }));
    this.updateExtent();
    this.scheduleSave();
    added[0].scrollIntoView({ block: 'nearest' });
    return added;
  }

  isEmptyBlock(block) {
    const c = block.querySelector('.nb-content');
    return !c.textContent.trim() && !c.querySelector('img, table, hr, a.attachment');
  }

  focusBlock(block, atEnd = false) {
    const content = block.querySelector('.nb-content');
    content.focus({ preventScroll: true });
    const r = document.createRange();
    if (atEnd) {
      r.selectNodeContents(content);
      r.collapse(false);
    } else {
      const first = content.firstElementChild;
      r.setStart(first && first.matches(LEAF_BLOCKS) ? first : content, 0);
      r.collapse(true);
    }
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    this.lastRange = r.cloneRange();
    this.activeContent = content;
    block.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  selectBlock(block) {
    this.deselectBlocks();
    block.classList.add('selected');
    block.querySelector('.nb-handle').focus({ preventScroll: true });
  }

  deselectBlocks() {
    for (const b of this.inner.querySelectorAll('.nb.selected')) b.classList.remove('selected');
  }

  /** Make sure there is a caret in some container; creates one below the existing content if needed. */
  ensureCaret() {
    if (this.structured) {
      if (this.page) toast(this.view.hint);
      return false;
    }
    if (this.restoreSelection()) return true;
    if (!this.page) return false;
    const bottom = this.blocks().reduce((m, b) => Math.max(m, b.offsetTop + b.offsetHeight), 76);
    this.focusBlock(this.addBlock({ x: 60, y: bottom + 24 }));
    return true;
  }

  onBlockPointerDown(e) {
    const handle = e.target.closest('.nb-handle');
    const resizer = e.target.closest('.nb-resize');
    if ((!handle && !resizer) || e.button !== 0) return;
    e.preventDefault();
    const block = e.target.closest('.nb');
    this.selectBlock(block);
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = block.offsetLeft;
    const oy = block.offsetTop;
    const ow = block.getBoundingClientRect().width / this.zoom;
    let moved = false;
    const move = (ev) => {
      const dx = (ev.clientX - sx) / this.zoom;
      const dy = (ev.clientY - sy) / this.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (resizer) {
        block.style.width = `${Math.round(Math.max(80, ow + dx))}px`;
        block.style.maxWidth = 'none';
      } else {
        block.style.left = `${Math.round(Math.max(0, ox + dx))}px`;
        block.style.top = `${Math.round(Math.max(12, oy + dy))}px`;
      }
      this.queueExtent();
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      if (moved) this.scheduleSave();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  onKeyDown(e) {
    if (e.target.classList?.contains('nb-handle')) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.target.parentElement.remove();
        this.scheduleSave();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.focusBlock(e.target.parentElement, true);
      } else if (e.key.startsWith('Arrow') && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // Nudge the selected container: 1 px, or 10 px with Shift (the drag handle's keyboard twin).
        e.preventDefault();
        const block = e.target.parentElement;
        const step = e.shiftKey ? 10 : 1;
        const dx = { ArrowLeft: -step, ArrowRight: step }[e.key] || 0;
        const dy = { ArrowUp: -step, ArrowDown: step }[e.key] || 0;
        block.style.left = `${Math.max(0, (parseFloat(block.style.left) || 0) + dx)}px`;
        block.style.top = `${Math.max(12, (parseFloat(block.style.top) || 0) + dy)}px`;
        this.queueExtent();
        this.scheduleSave();
      }
      return;
    }
    const content = e.target.closest?.('.nb-content');
    if (!content) return;
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      const cell = this.currentCell();
      if (cell) this.moveCell(cell, e.shiftKey ? -1 : 1);
      else this.exec(e.shiftKey ? 'outdent' : 'indent');
    } else if (e.key === 'Escape') {
      this.selectBlock(content.parentElement);
    }
  }

  onClick(e) {
    const content = e.target.closest?.('.nb-content');
    if (!content) return;
    const tagged = e.target.closest('[data-tag]');
    if (tagged && content.contains(tagged) && e.clientX - tagged.getBoundingClientRect().left < 22 * this.zoom) {
      if (tagged.dataset.tag === 'todo') {
        tagged.dataset.checked = tagged.dataset.checked === 'true' ? 'false' : 'true';
        this.scheduleSave();
      }
      e.preventDefault();
      return;
    }
    const link = e.target.closest('a[href]');
    if (link && content.contains(link) && (link.classList.contains('attachment') || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener');
      return;
    }
    if (e.target.tagName === 'IMG') this.selectImage(e.target);
    else this.hideImgHandle();
  }

  // ================= extent / zoom / lines =================
  point(e) {
    const r = this.inner.getBoundingClientRect();
    return { x: (e.clientX - r.left) / this.zoom, y: (e.clientY - r.top) / this.zoom };
  }

  queueExtent() {
    cancelAnimationFrame(this.extentFrame);
    this.extentFrame = requestAnimationFrame(() => this.updateExtent());
  }

  updateExtent() {
    if (this.structured) {
      // Structured pages are normal flowing documents: let CSS size it.
      this.inner.style.width = '';
      this.inner.style.height = '';
      return;
    }
    const head = this.inner.querySelector('.page-head');
    let maxX = head.offsetLeft + head.offsetWidth;
    let maxY = head.offsetTop + head.offsetHeight;
    for (const b of this.blocks()) {
      maxX = Math.max(maxX, b.offsetLeft + b.offsetWidth);
      maxY = Math.max(maxY, b.offsetTop + b.offsetHeight);
    }
    for (const s of this.strokes) {
      for (let i = 0; i < s.p.length; i += 2) {
        maxX = Math.max(maxX, s.p[i]);
        maxY = Math.max(maxY, s.p[i + 1]);
      }
    }
    this.inner.style.width = `${Math.ceil(maxX + 400)}px`;
    this.inner.style.height = `${Math.ceil(maxY + 400)}px`;
  }

  setZoom(z) {
    this.zoom = Math.max(0.25, Math.min(3, Math.round(z * 100) / 100));
    this.inner.style.setProperty('--zoom', this.zoom);
    this.hideImgHandle();
    return this.zoom;
  }

  applyLines() {
    this.inner.classList.remove(...Object.values(LINE_CLASSES));
    if (LINE_CLASSES[this.lines]) this.inner.classList.add(LINE_CLASSES[this.lines]);
  }

  setLines(lines) {
    if (!this.page) return;
    if (this.structured) return toast('Rule lines are only available on freeform pages.');
    this.lines = lines;
    this.applyLines();
    this.scheduleSave();
  }

  // ================= selection helpers =================
  restoreSelection() {
    if (!this.page) return false;
    // If the caret is in a container right now, trust it: `selectionchange` fires
    // asynchronously, so lastRange can lag the last keystroke (P9).
    const sel = getSelection();
    if (sel.rangeCount) {
      const live = sel.getRangeAt(0);
      const liveNode = live.commonAncestorContainer;
      const liveContent = (liveNode.nodeType === 1 ? liveNode : liveNode.parentElement)?.closest?.('.nb-content');
      if (liveContent && this.inner.contains(liveContent) && document.activeElement === liveContent) {
        this.lastRange = live.cloneRange();
        this.activeContent = liveContent;
        return true;
      }
    }
    const r = this.lastRange;
    if (!r) return false;
    const node = r.commonAncestorContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const content = el?.closest?.('.nb-content');
    if (!content || !this.inner.contains(content)) return false;
    if (document.activeElement !== content) content.focus({ preventScroll: true });
    sel.removeAllRanges();
    sel.addRange(r);
    this.activeContent = content;
    return true;
  }

  selectedBlocks() {
    const r = this.lastRange;
    const content = this.activeContent;
    if (!r || !content) return [];
    return [...content.querySelectorAll(LEAF_BLOCKS)].filter(
      (el) => !el.querySelector('div, p, li, h1, h2, h3, h4, h5, h6, pre, ul, ol, table') && r.intersectsNode(el),
    );
  }

  currentCell() {
    const r = this.lastRange;
    if (!r || !this.activeContent) return null;
    const node = r.startContainer;
    const el = node.nodeType === 1 ? node : node.parentElement;
    const cell = el?.closest('td, th');
    return cell && this.activeContent.contains(cell) ? cell : null;
  }

  formatState() {
    const r = this.lastRange;
    if (!r || !this.activeContent?.isConnected || document.activeElement !== this.activeContent) return null;
    let el = r.startContainer;
    if (el.nodeType !== 1) el = el.parentElement;
    if (!el) return null;
    const cs = getComputedStyle(el);
    const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
    const blk = el.closest('h1, h2, h3, h4, h5, h6, pre, blockquote:not([style])');
    return {
      bold: q('bold'),
      italic: q('italic'),
      underline: q('underline'),
      strike: q('strikeThrough'),
      ul: q('insertUnorderedList'),
      ol: q('insertOrderedList'),
      font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
      size: Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2,
      block: blk && this.activeContent.contains(blk) ? blk.tagName.toLowerCase() : 'div',
      tag: el.closest('[data-tag]')?.dataset.tag || null,
    };
  }

  // ================= formatting commands =================
  exec(cmd, value = null, css = false) {
    if (!this.restoreSelection()) return false;
    document.execCommand('styleWithCSS', false, css);
    const ok = document.execCommand(cmd, false, value);
    this.scheduleSave();
    this.emitSelection();
    return ok;
  }

  setFont(name) {
    return this.exec('fontName', name, true);
  }

  setColor(color) {
    return this.exec('foreColor', color || 'inherit', true);
  }

  setHighlight(color) {
    return this.exec('hiliteColor', color || 'transparent', true);
  }

  setFontSize(pt) {
    if (!this.restoreSelection()) return;
    // Set before execCommand: it fires 'input' synchronously, which runs fixFontSizes.
    this.pendingFontPt = pt;
    document.execCommand('styleWithCSS', false, false);
    document.execCommand('fontSize', false, '7');
    this.fixFontSizes(this.activeContent);
    this.scheduleSave();
    this.emitSelection();
  }

  /** execCommand('fontSize') only knows sizes 1-7; convert the marker <font size=7> into real pt sizes. */
  fixFontSizes(content) {
    if (!content) return;
    const fonts = content.querySelectorAll('font[size="7"]');
    if (!fonts.length) return;
    const sel = getSelection();
    const saved = sel.rangeCount ? [sel.anchorNode, sel.anchorOffset, sel.focusNode, sel.focusOffset] : null;
    const spans = [];
    for (const f of fonts) {
      const span = document.createElement('span');
      span.style.fontSize = `${this.pendingFontPt || 11}pt`;
      span.append(...f.childNodes);
      for (const inner of span.querySelectorAll('[style]')) inner.style.removeProperty('font-size');
      f.replaceWith(span);
      spans.push(span);
    }
    try {
      if (saved && saved[0].isConnected && saved[2].isConnected) sel.setBaseAndExtent(...saved);
      else {
        const r = document.createRange();
        r.setStartBefore(spans[0].firstChild || spans[0]);
        r.setEndAfter(spans[spans.length - 1].lastChild || spans[spans.length - 1]);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      if (sel.rangeCount) this.lastRange = sel.getRangeAt(0).cloneRange();
    } catch { /* selection could not be restored */ }
  }

  setBlockStyle(tag) {
    return this.exec('formatBlock', `<${tag}>`);
  }

  clearFormatting() {
    if (!this.restoreSelection()) return;
    document.execCommand('removeFormat');
    document.execCommand('formatBlock', false, '<div>');
    this.scheduleSave();
    this.emitSelection();
  }

  toggleTag(tag) {
    if (!this.ensureCaret()) return;
    let blocks = this.selectedBlocks();
    if (!blocks.length) {
      document.execCommand('formatBlock', false, '<div>');
      this.lastRange = getSelection().getRangeAt(0).cloneRange();
      blocks = this.selectedBlocks();
    }
    if (!blocks.length) return;
    const allHave = blocks.every((b) => b.dataset.tag === tag);
    for (const b of blocks) {
      if (allHave || tag == null) {
        delete b.dataset.tag;
        delete b.dataset.checked;
      } else {
        b.dataset.tag = tag;
        if (tag === 'todo') b.dataset.checked ??= 'false';
        else delete b.dataset.checked;
      }
    }
    this.scheduleSave();
    this.emitSelection();
  }

  insertHtml(html) {
    if (!this.ensureCaret()) return false;
    document.execCommand('insertHTML', false, html);
    this.scheduleSave();
    return true;
  }

  insertText(text) {
    if (!this.ensureCaret()) return false;
    document.execCommand('insertText', false, text);
    this.scheduleSave();
    return true;
  }

  selectedText() {
    return this.lastRange && this.activeContent?.isConnected ? this.lastRange.toString() : '';
  }

  insertLink(url, text) {
    url = url.trim();
    if (!url) return;
    if (!/^[a-z][\w+.-]*:/i.test(url) && !url.startsWith('/') && !url.startsWith('#')) url = `https://${url}`;
    if (!/^(https?:|mailto:|tel:|\/|#)/i.test(url)) return toast('That link type is not allowed.');
    if (!this.ensureCaret()) return;
    const hasSelection = this.lastRange && !this.lastRange.collapsed;
    if (hasSelection && (!text || text === this.lastRange.toString())) {
      document.execCommand('createLink', false, url);
    } else {
      document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(text || url)}</a>&nbsp;`);
    }
    this.scheduleSave();
  }

  insertTable(rows, cols) {
    const row = `<tr>${'<td><br></td>'.repeat(cols)}</tr>`;
    if (!this.insertHtml(`<table data-new="1"><tbody>${row.repeat(rows)}</tbody></table><div><br></div>`)) return;
    const table = this.activeContent?.querySelector('table[data-new]');
    if (!table) return;
    table.removeAttribute('data-new');
    const r = document.createRange();
    r.setStart(table.querySelector('td'), 0);
    r.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    this.lastRange = r.cloneRange();
  }

  tableOp(op) {
    const cell = this.currentCell();
    if (!cell) return toast('Put the cursor inside a table first.');
    const row = cell.parentElement;
    const table = cell.closest('table');
    const idx = cell.cellIndex;
    const blankCell = (like) => {
      const c = document.createElement(like.tagName.toLowerCase());
      c.innerHTML = '<br>';
      return c;
    };
    if (op === 'rowAbove' || op === 'rowBelow') {
      const tr = document.createElement('tr');
      for (const c of row.cells) tr.append(blankCell(c));
      row[op === 'rowAbove' ? 'before' : 'after'](tr);
    } else if (op === 'colLeft' || op === 'colRight') {
      for (const r of table.rows) {
        const ref = r.cells[Math.min(idx, r.cells.length - 1)];
        if (ref) ref[op === 'colLeft' ? 'before' : 'after'](blankCell(ref));
      }
    } else if (op === 'delRow') {
      if (table.rows.length <= 1) table.remove();
      else row.remove();
    } else if (op === 'delCol') {
      for (const r of [...table.rows]) r.cells[idx]?.remove();
      if (!table.rows[0]?.cells.length) table.remove();
    } else if (op === 'delTable') {
      table.remove();
    }
    this.scheduleSave();
    this.queueExtent();
  }

  moveCell(cell, dir) {
    const table = cell.closest('table');
    let cells = [...table.querySelectorAll('td, th')];
    let next = cells[cells.indexOf(cell) + dir];
    if (!next && dir > 0) {
      this.tableOp('rowBelow');
      cells = [...table.querySelectorAll('td, th')];
      next = cells[cells.indexOf(cell) + 1];
    }
    if (!next) return;
    const r = document.createRange();
    r.selectNodeContents(next);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
    this.lastRange = r.cloneRange();
  }

  // ================= files & images =================
  async insertFiles(files) {
    if (!files.length || !this.ensureCaret()) return;
    const page = this.page;
    let range = this.lastRange.cloneRange();
    for (const file of files) {
      const t = toast(`Uploading ${file.name}…`, { timeout: 0 });
      try {
        const up = await api.upload(file);
        if (this.page !== page) break;
        const html = file.type.startsWith('image/')
          ? `<img data-new="1" src="${esc(up.url)}" alt="${esc(up.name)}">`
          : attachmentHtml(up);
        this.lastRange = range;
        if (!this.restoreSelection()) this.ensureCaret();
        document.execCommand('insertHTML', false, html);
        // Chrome copies the surrounding text style onto inserted images; drop it.
        for (const img of this.inner.querySelectorAll('img[data-new]')) {
          img.removeAttribute('style');
          img.removeAttribute('data-new');
        }
        range = getSelection().getRangeAt(0).cloneRange();
        this.lastRange = range;
        this.scheduleSave();
      } catch (err) {
        console.error(err);
        toast(`Couldn't upload ${file.name}`);
      } finally {
        t.dismiss();
      }
    }
    this.queueExtent();
  }

  selectImage(img) {
    this.selectedImg = img;
    this.positionImgHandle();
    this.imgHandle.hidden = false;
    const r = document.createRange();
    r.selectNode(img);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }

  positionImgHandle() {
    const img = this.selectedImg;
    if (!img?.isConnected) return this.hideImgHandle();
    const r = img.getBoundingClientRect();
    const ir = this.inner.getBoundingClientRect();
    this.imgHandle.style.left = `${(r.right - ir.left) / this.zoom}px`;
    this.imgHandle.style.top = `${(r.bottom - ir.top) / this.zoom}px`;
  }

  hideImgHandle() {
    this.imgHandle.hidden = true;
    this.selectedImg = null;
  }

  onImgResize(e) {
    const img = this.selectedImg;
    if (!img) return;
    e.preventDefault();
    const sx = e.clientX;
    const sw = img.getBoundingClientRect().width / this.zoom;
    const move = (ev) => {
      img.style.width = `${Math.round(Math.max(24, sw + (ev.clientX - sx) / this.zoom))}px`;
      img.style.height = 'auto';
      this.positionImgHandle();
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      this.scheduleSave();
      this.queueExtent();
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  onPaste(e) {
    const content = e.target.closest?.('.nb-content');
    if (!content || !e.clipboardData) return;
    const dt = e.clipboardData;
    const files = [...dt.files];
    if (files.length) {
      e.preventDefault();
      this.lastRange = getSelection().getRangeAt(0).cloneRange();
      this.insertFiles(files);
      return;
    }
    const html = dt.getData('text/html');
    if (html) {
      e.preventDefault();
      document.execCommand('insertHTML', false, sanitizeHtml(html, dt.types.includes(OWN_MIME)));
    }
  }

  onCopy(e, cut) {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !e.clipboardData) return;
    const range = sel.getRangeAt(0);
    const anc = range.commonAncestorContainer;
    const ancEl = anc.nodeType === 1 ? anc : anc.parentElement;
    const content = ancEl?.closest('.nb-content');
    if (!content) return;
    // Keep inline formatting that wraps a partial selection (e.g. part of a bold word).
    let frag = range.cloneContents();
    for (let node = ancEl; node && node !== content && INLINE.has(node.tagName); node = node.parentElement) {
      const wrap = node.cloneNode(false);
      wrap.append(frag);
      frag = wrap;
    }
    const div = document.createElement('div');
    div.append(frag);
    e.clipboardData.setData('text/html', div.innerHTML);
    e.clipboardData.setData('text/plain', sel.toString());
    e.clipboardData.setData(OWN_MIME, '1');
    e.preventDefault();
    if (cut) document.execCommand('delete');
  }

  onDrop(e) {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || !this.page) return;
    e.preventDefault();
    if (this.structured) return toast('Files can only be added to freeform pages.');
    const content = e.target.closest?.('.nb-content');
    const r = content && caretRangeAt(e.clientX, e.clientY);
    if (r && content.contains(r.startContainer)) {
      this.lastRange = r;
      this.activeContent = content;
    } else {
      const { x, y } = this.point(e);
      this.focusBlock(this.addBlock({ x: Math.max(0, x - 8), y: Math.max(12, y - 10) }));
    }
    this.insertFiles(files);
  }

  // ================= ink =================
  setMode(mode) {
    if (mode !== 'type' && this.structured) {
      toast('Drawing is only available on freeform pages.');
      mode = 'type';
    }
    this.mode = mode;
    this.inner.classList.toggle('draw', mode !== 'type');
    this.inner.classList.toggle('erase', mode === 'eraser');
    if (mode !== 'type') {
      this.hideImgHandle();
      if (this.inner.contains(document.activeElement)) document.activeElement.blur();
    }
    this.emit('mode', mode);
  }

  strokePath(s) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', toPath(s.p));
    p.setAttribute('stroke-width', s.w);
    p.style.stroke = s.c === 'auto' ? 'var(--ink-auto)' : s.c;
    if (s.t === 'hl') p.classList.add('hl');
    return p;
  }

  renderInk() {
    this.ink.replaceChildren(...this.strokes.map((s) => this.strokePath(s)));
  }

  onInkDown(e) {
    if (this.mode === 'type' || !this.page || (e.button !== 0 && e.button !== 5)) return;
    e.preventDefault();
    this.ink.setPointerCapture(e.pointerId);
    const { x, y } = this.point(e);
    if (this.mode === 'eraser' || e.button === 5) {
      this.erasing = true;
      this.eraseAt(x, y);
      return;
    }
    const hl = this.mode === 'hl';
    const tool = hl ? this.highlighter : this.pen;
    this.cur = { t: hl ? 'hl' : 'pen', c: tool.color, w: tool.width, p: [r1(x), r1(y)] };
    this.curPath = this.strokePath(this.cur);
    this.ink.append(this.curPath);
  }

  onInkMove(e) {
    if (this.cur) {
      const events = e.getCoalescedEvents?.() || [];
      const p = this.cur.p;
      for (const ev of events.length ? events : [e]) {
        const { x, y } = this.point(ev);
        if (Math.hypot(x - p[p.length - 2], y - p[p.length - 1]) >= 1) p.push(r1(x), r1(y));
      }
      this.curPath.setAttribute('d', toPath(p));
    } else if (this.erasing) {
      const { x, y } = this.point(e);
      this.eraseAt(x, y);
    }
  }

  onInkUp() {
    if (this.cur) {
      this.strokes.push(this.cur);
      this.cur = null;
      this.curPath = null;
      this.scheduleSave();
      this.queueExtent();
    }
    this.erasing = false;
  }

  eraseAt(x, y) {
    const before = this.strokes.length;
    this.strokes = this.strokes.filter((s) => !hitStroke(s, x, y, 6 / this.zoom + s.w / 2));
    if (this.strokes.length !== before) {
      this.renderInk();
      this.scheduleSave();
    }
  }

  clearInk() {
    const n = this.strokes.length;
    if (!n) return 0;
    this.strokes = [];
    this.renderInk();
    this.scheduleSave();
    return n;
  }

  // ================= search highlight =================
  highlight(query) {
    this.clearSearchHighlight();
    if (!query || !window.CSS?.highlights || typeof Highlight === 'undefined') return;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const ranges = [];
    const roots = this.structured
      ? [this.titleEl, this.view.top, this.view.body]
      : [this.titleEl, ...this.inner.querySelectorAll('.nb-content')];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.data.toLowerCase();
        for (const t of terms) {
          for (let i = text.indexOf(t); i !== -1; i = text.indexOf(t, i + t.length)) {
            const r = new Range();
            r.setStart(n, i);
            r.setEnd(n, i + t.length);
            ranges.push(r);
          }
        }
      }
    }
    if (!ranges.length) return;
    CSS.highlights.set('search-hit', new Highlight(...ranges));
    ranges[0].startContainer.parentElement?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  clearSearchHighlight() {
    window.CSS?.highlights?.delete('search-hit');
  }

  // ================= format painter =================
  startPainter() {
    if (!this.restoreSelection()) {
      toast('Click inside some formatted text first.');
      return false;
    }
    let el = this.lastRange.startContainer;
    if (el.nodeType !== 1) el = el.parentElement;
    const cs = getComputedStyle(el);
    const base = getComputedStyle(this.activeContent);
    const q = (c) => document.queryCommandState(c);
    let bg = null;
    for (let n = el; n && n !== this.activeContent; n = n.parentElement) {
      const c = getComputedStyle(n).backgroundColor;
      if (c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) { bg = c; break; }
    }
    this.painter = {
      bold: q('bold'), italic: q('italic'), underline: q('underline'), strikeThrough: q('strikeThrough'),
      color: cs.color !== base.color ? cs.color : null,
      font: cs.fontFamily !== base.fontFamily ? cs.fontFamily.split(',')[0].replace(/["']/g, '') : null,
      size: cs.fontSize !== base.fontSize ? Math.round(parseFloat(cs.fontSize) * 0.75 * 2) / 2 : null,
      bg,
    };
    this.inner.classList.add('painting');
    this.emit('painter', true);
    return true;
  }

  cancelPainter() {
    if (!this.painter) return;
    this.painter = null;
    this.inner.classList.remove('painting');
    this.emit('painter', false);
  }

  applyPainter() {
    const p = this.painter;
    const sel = getSelection();
    if (!p || !sel.rangeCount || sel.isCollapsed) return;
    const node = sel.getRangeAt(0).commonAncestorContainer;
    const content = (node.nodeType === 1 ? node : node.parentElement)?.closest('.nb-content');
    if (!content) return;
    this.lastRange = sel.getRangeAt(0).cloneRange();
    this.activeContent = content;
    document.execCommand('styleWithCSS', false, false);
    for (const cmd of ['bold', 'italic', 'underline', 'strikeThrough']) {
      if (document.queryCommandState(cmd) !== p[cmd]) document.execCommand(cmd);
    }
    document.execCommand('styleWithCSS', false, true);
    if (p.color) document.execCommand('foreColor', false, p.color);
    document.execCommand('hiliteColor', false, p.bg || 'transparent');
    if (p.font) document.execCommand('fontName', false, p.font);
    this.lastRange = sel.getRangeAt(0).cloneRange();
    if (p.size) this.setFontSize(p.size);
    this.cancelPainter();
    this.scheduleSave();
  }

  // ================= dictation =================
  toggleDictation(lang) {
    if (this.rec) {
      this.stopDictation();
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      toast('Dictation is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (!this.ensureCaret()) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = lang || navigator.language || 'en-US';
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const text = e.results[i][0].transcript.trim();
        if (!text || !this.restoreSelection()) continue;
        const r = this.lastRange;
        const before = r.startContainer.nodeType === 3 ? r.startContainer.data.slice(0, r.startOffset) : '';
        document.execCommand('insertText', false, (before && !/\s$/.test(before) ? ' ' : '') + text);
        this.lastRange = getSelection().getRangeAt(0).cloneRange();
        this.scheduleSave();
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') toast('Microphone access was blocked.');
      else if (e.error !== 'no-speech' && e.error !== 'aborted') toast(`Dictation error: ${e.error}`);
    };
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      this.emit('dictation', false);
    };
    rec.start();
    this.rec = rec;
    this.emit('dictation', true);
  }

  stopDictation() {
    if (!this.rec) return;
    const rec = this.rec;
    this.rec = null;
    rec.stop();
    this.emit('dictation', false);
  }

  // ================= export =================
  exportHtml() {
    if (!this.page) return null;
    const origin = location.origin;
    const body = this.structured ? this.view.exportHtml(this.titleText() || 'Untitled page') : this.blocks()
      .filter((b) => !this.isEmptyBlock(b))
      .sort((a, b) => a.offsetTop - b.offsetTop || a.offsetLeft - b.offsetLeft)
      .map((b) => `<section>${b.querySelector('.nb-content').innerHTML}</section>`)
      .join('\n')
      .replace(/(src|href)="\/uploads\//g, `$1="${origin}/uploads/`);
    const title = this.titleText() || 'Untitled page';
    const tagCss = { todo: '☐', important: '⭐', question: '❓', critical: '❗', idea: '💡', contact: '👤' };
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{font:11pt/1.4 Calibri,Carlito,'Segoe UI',sans-serif;max-width:820px;margin:40px auto;padding:0 16px;color:#222}
h1.page-title{font-weight:300;font-size:22pt;border-bottom:1px solid #ccc;padding-bottom:4px;margin-bottom:4px}
.meta{color:#777;font-size:9pt;margin:0 0 28px}
section{margin-bottom:22px}
table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px;vertical-align:top}
img{max-width:100%}pre{background:#f3f3f3;padding:6px 8px}
[data-tag]{position:relative;padding-left:24px}[data-tag]::before{position:absolute;left:0}
${Object.entries(tagCss).map(([k, v]) => `[data-tag="${k}"]::before{content:"${v}"}`).join('')}
[data-tag="todo"][data-checked="true"]::before{content:"☑"}
</style></head>
<body>${this.structured ? body : `<h1 class="page-title">${esc(title)}</h1><p class="meta">${esc(this.dateEl.textContent)} ${esc(this.timeEl.textContent)}</p>
${body}`}
</body></html>`;
  }
}
