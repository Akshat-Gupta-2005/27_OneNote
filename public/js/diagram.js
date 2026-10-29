// Diagrams on a freeform page: lines that link note containers and lay themselves out (n8n style),
// plus the geometry for alignment guides.
//  - routeLinks() picks the sides of two boxes that face each other, spreads several lines leaving
//    one side so they don't cross, and draws a curved, elbow or straight path. Pure, so it is tested
//    on its own.
//  - LinkLayer renders the lines in an SVG under the containers and owns selecting a line, its menu,
//    its label and delete-with-undo. The editor tells it where the boxes are.
import { h, showMenu, promptDialog, toast } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
/** One palette for line colors, box borders and box fills (the section colors). */
export const DIAGRAM_COLORS = ['#8e9aaf', '#e35d6a', '#f08b3e', '#f2b636', '#3db04a', '#36b5a8', '#4a90e2', '#a874d6', '#d76fb0'];
const NORMAL = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] };
const ENDS = ['end', 'both', 'none'];
const SHAPES = ['curve', 'elbow', 'straight'];
const PORT_GAP = 22; // px between lines that leave the same side of a box
const ARROW = 10;

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const r1 = (n) => Math.round(n * 10) / 10;
const pt = (p) => `${r1(p.x)} ${r1(p.y)}`;

/** Coerce stored links; drops ones whose boxes are missing (`ids`, a Set) or that link a box to itself. */
export function normalizeLinks(raw, ids = null) {
  const out = [];
  const seen = new Set();
  for (const l of Array.isArray(raw) ? raw : []) {
    if (!l || typeof l.from !== 'string' || typeof l.to !== 'string' || l.from === l.to) continue;
    if (ids && (!ids.has(l.from) || !ids.has(l.to))) continue;
    const id = typeof l.id === 'string' && l.id && !seen.has(l.id) ? l.id : uid();
    seen.add(id);
    out.push({
      id,
      from: l.from,
      to: l.to,
      ends: ENDS.includes(l.ends) ? l.ends : 'end',
      dash: !!l.dash,
      shape: SHAPES.includes(l.shape) ? l.shape : 'curve',
      color: DIAGRAM_COLORS.includes(l.color) ? l.color : null,
      label: typeof l.label === 'string' ? l.label.trim().slice(0, 80) : '',
    });
  }
  return out;
}

// ---------- routing ----------
/**
 * The sides of boxes a and b that face each other, e.g. ['right', 'left'] when b is to the right.
 * Decided by the bigger gap between them, so a wide box above a narrow one still links top/bottom.
 */
export function facingSides(a, b) {
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const dx = b.x + b.w / 2 - (a.x + a.w / 2);
  const dy = b.y + b.h / 2 - (a.y + a.h / 2);
  // Overlapping boxes have no gap either way: compare how far apart the centers are instead.
  const horizontal = gapX >= 0 || gapY >= 0 ? gapX >= gapY : Math.abs(dx) / (a.w + b.w) >= Math.abs(dy) / (a.h + b.h);
  if (horizontal) return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

function sidePoint(box, side, offset = 0) {
  if (side === 'left') return { x: box.x, y: box.y + box.h / 2 + offset };
  if (side === 'right') return { x: box.x + box.w, y: box.y + box.h / 2 + offset };
  if (side === 'top') return { x: box.x + box.w / 2 + offset, y: box.y };
  return { x: box.x + box.w / 2 + offset, y: box.y + box.h };
}

function curve(p1, n1, p2, n2) {
  // Leave and enter straight out of the sides, then bend: the further apart, the wider the sweep.
  const k = Math.max(30, Math.min(160, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.45));
  const c1 = { x: p1.x + n1[0] * k, y: p1.y + n1[1] * k };
  const c2 = { x: p2.x + n2[0] * k, y: p2.y + n2[1] * k };
  return {
    d: `M${pt(p1)} C${pt(c1)} ${pt(c2)} ${pt(p2)}`,
    mid: { x: (p1.x + 3 * c1.x + 3 * c2.x + p2.x) / 8, y: (p1.y + 3 * c1.y + 3 * c2.y + p2.y) / 8 },
  };
}

function roundedPolyline(pts, radius) {
  let d = `M${pt(pts[0])}`;
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
  const toward = (from, to, len) => {
    const l = dist(from, to) || 1;
    return { x: from.x + ((to.x - from.x) * len) / l, y: from.y + ((to.y - from.y) * len) / l };
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const [a, b, c] = [pts[i - 1], pts[i], pts[i + 1]];
    const r = Math.min(radius, dist(a, b) / 2, dist(b, c) / 2);
    if (r < 0.5) { d += ` L${pt(b)}`; continue; }
    d += ` L${pt(toward(b, a, r))} Q${pt(b)} ${pt(toward(b, c, r))}`;
  }
  return `${d} L${pt(pts[pts.length - 1])}`;
}

function elbow(p1, p2, horizontal) {
  // Out of the first side, across at the halfway line, into the second side: right angles only.
  const pts = horizontal
    ? [p1, { x: (p1.x + p2.x) / 2, y: p1.y }, { x: (p1.x + p2.x) / 2, y: p2.y }, p2]
    : [p1, { x: p1.x, y: (p1.y + p2.y) / 2 }, { x: p2.x, y: (p1.y + p2.y) / 2 }, p2];
  return { d: roundedPolyline(pts, 10), mid: { x: (pts[1].x + pts[2].x) / 2, y: (pts[1].y + pts[2].y) / 2 } };
}

function arrowHead(tip, ux, uy) {
  const bx = tip.x - ux * ARROW;
  const by = tip.y - uy * ARROW;
  const w = ARROW * 0.45;
  return `M${pt(tip)} L${r1(bx - uy * w)} ${r1(by + ux * w)} L${r1(bx + uy * w)} ${r1(by - ux * w)} Z`;
}

/**
 * Lay out every link between boxes. `boxes` is a Map of id → {x, y, w, h} (page px).
 * Returns a Map of link id → { d, mid, arrows: [path d…], sides: [fromSide, toSide], p1, p2 }.
 */
export function routeLinks(boxes, links) {
  const plans = [];
  const groups = new Map(); // "boxId:side" → ends leaving that side
  for (const l of links) {
    const a = boxes.get(l.from);
    const b = boxes.get(l.to);
    if (!a || !b) continue;
    const [sa, sb] = facingSides(a, b);
    const plan = { l, a, b, sa, sb, oa: 0, ob: 0 };
    plans.push(plan);
    for (const [box, side, other, key] of [[a, sa, b, 'oa'], [b, sb, a, 'ob']]) {
      const k = `${box === a ? l.from : l.to}:${side}`;
      if (!groups.has(k)) groups.set(k, []);
      // Order lines on a side by where their other end is, so neighbours never cross.
      const order = side === 'left' || side === 'right' ? other.y + other.h / 2 : other.x + other.w / 2;
      groups.get(k).push({ plan, key, order, len: side === 'left' || side === 'right' ? box.h : box.w });
    }
  }
  for (const ends of groups.values()) {
    ends.sort((x, y) => x.order - y.order);
    const n = ends.length;
    const gap = Math.min(PORT_GAP, (ends[0].len * 0.8) / Math.max(1, n - 1));
    ends.forEach((e, i) => { e.plan[e.key] = n > 1 ? (i - (n - 1) / 2) * gap : 0; });
  }
  const out = new Map();
  for (const { l, a, b, sa, sb, oa, ob } of plans) {
    const p1 = sidePoint(a, sa, oa);
    const p2 = sidePoint(b, sb, ob);
    const n1 = NORMAL[sa];
    const n2 = NORMAL[sb];
    let path;
    let u2 = [-n2[0], -n2[1]]; // arrow direction at the end: into the box
    let u1 = [-n1[0], -n1[1]];
    if (l.shape === 'straight') {
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
      u2 = [(p2.x - p1.x) / len, (p2.y - p1.y) / len];
      u1 = [-u2[0], -u2[1]];
      path = { d: `M${pt(p1)} L${pt(p2)}`, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
    } else if (l.shape === 'elbow') {
      path = elbow(p1, p2, sa === 'left' || sa === 'right');
    } else {
      path = curve(p1, n1, p2, n2);
    }
    const arrows = [];
    if (l.ends === 'end' || l.ends === 'both') arrows.push(arrowHead(p2, ...u2));
    if (l.ends === 'both') arrows.push(arrowHead(p1, ...u1));
    out.set(l.id, { d: path.d, mid: path.mid, arrows, sides: [sa, sb], p1, p2 });
  }
  return out;
}

/** The start of a line being dragged out of a box's side, and its temporary path to the pointer. */
export function dragPath(box, side, to) {
  const p1 = sidePoint(box, side);
  const n1 = NORMAL[side];
  return curve(p1, n1, to, [-n1[0], -n1[1]]).d;
}

// ---------- alignment guides ----------
/**
 * Snap a moving rectangle to the edges or centers of others. Returns the extra dx/dy to apply and
 * where to draw guides: { dx, dy, gx: x of a vertical guide | null, gy: y of a horizontal guide | null }.
 */
export function snapToGuides(moving, others, threshold) {
  const xs = (r) => [r.x, r.x + r.w / 2, r.x + r.w];
  const ys = (r) => [r.y, r.y + r.h / 2, r.y + r.h];
  let bx = null;
  let by = null;
  for (const o of others) {
    for (const ox of xs(o)) {
      for (const mx of xs(moving)) {
        const d = ox - mx;
        if (Math.abs(d) <= threshold && (!bx || Math.abs(d) < Math.abs(bx.d))) bx = { d, at: ox };
      }
    }
    for (const oy of ys(o)) {
      for (const my of ys(moving)) {
        const d = oy - my;
        if (Math.abs(d) <= threshold && (!by || Math.abs(d) < Math.abs(by.d))) by = { d, at: oy };
      }
    }
  }
  return { dx: bx?.d ?? 0, dy: by?.d ?? 0, gx: bx?.at ?? null, gy: by?.at ?? null };
}

// =====================================================================

export class LinkLayer {
  /**
   * host: the page element the layer lives in. getBoxes(): Map of box id → {x, y, w, h}.
   * onChange(): a link was added, edited or removed (save + re-render).
   */
  constructor({ host, getBoxes, onChange }) {
    this.getBoxes = getBoxes;
    this.onChange = onChange;
    this.links = [];
    this.selectedId = null;
    this.temp = null;
    this.svg = document.createElementNS(NS, 'svg');
    this.svg.setAttribute('class', 'link-layer');
    this.labels = h('div', { class: 'link-labels' });
    host.prepend(this.svg, this.labels);

    const linkOf = (e) => this.links.find((l) => l.id === e.target.closest?.('[data-link]')?.dataset.link);
    for (const el of [this.svg, this.labels]) {
      el.addEventListener('pointerdown', (e) => {
        const l = linkOf(e);
        if (!l || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        this.select(l.id);
      });
      el.addEventListener('dblclick', (e) => { const l = linkOf(e); if (l) this.editLabel(l); });
      el.addEventListener('contextmenu', (e) => {
        const l = linkOf(e);
        if (!l) return;
        e.preventDefault();
        this.select(l.id);
        this.menu(l, { x: e.clientX, y: e.clientY });
      });
      el.addEventListener('keydown', (e) => {
        const l = linkOf(e);
        if (!l) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); this.remove(l.id); }
        else if (e.key === 'Enter' || e.key === 'F2') { e.preventDefault(); this.editLabel(l); }
        else if (e.key === 'Escape') { e.preventDefault(); this.select(null); }
      });
    }
    // Clicking anywhere else lets go of the selected line.
    document.addEventListener('pointerdown', (e) => {
      if (this.selectedId && !e.target.closest?.('[data-link], .menu, .modal-overlay')) this.select(null);
    }, true);
  }

  set(links) {
    this.links = links;
    this.selectedId = null;
  }

  find(id) {
    return this.links.find((l) => l.id === id);
  }

  /** Link two boxes (once: an existing link between them, either way round, is selected instead). */
  add(from, to) {
    const existing = this.links.find((l) => (l.from === from && l.to === to) || (l.from === to && l.to === from));
    if (existing) {
      this.select(existing.id);
      return existing;
    }
    const link = { id: uid(), from, to, ends: 'end', dash: false, shape: 'curve', color: null, label: '' };
    this.links.push(link);
    this.onChange();
    return link;
  }

  update(link, patch) {
    Object.assign(link, patch);
    this.onChange();
  }

  remove(id) {
    const i = this.links.findIndex((l) => l.id === id);
    if (i < 0) return;
    const [link] = this.links.splice(i, 1);
    if (this.selectedId === id) this.selectedId = null;
    this.onChange();
    toast('Deleted line', {
      action: 'Undo',
      timeout: 6000,
      onAction: () => {
        const boxes = this.getBoxes();
        if (!boxes.has(link.from) || !boxes.has(link.to)) return toast('Its containers are gone.');
        this.links.splice(Math.min(i, this.links.length), 0, link);
        this.onChange();
      },
    });
  }

  select(id) {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.render();
    if (id) this.svg.querySelector(`[data-link="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  }

  async editLabel(link) {
    const v = await promptDialog(link.label ? 'Edit label' : 'Add label', { label: 'Shown on the middle of the line', value: link.label, okLabel: 'Save' });
    if (v == null || !this.links.includes(link)) return;
    this.update(link, { label: v.slice(0, 80) });
  }

  menu(link, at) {
    const pick = (field, options) => options.map(([v, label]) => ({ label, checked: link[field] === v, onClick: () => this.update(link, { [field]: v }) }));
    showMenu(at, [
      { label: link.label ? 'Edit label…' : 'Add label…', icon: 'edit', hint: 'F2', onClick: () => this.editLabel(link) },
      { label: 'Arrows', icon: 'forward', submenu: () => pick('ends', [['end', 'One end  →'], ['both', 'Both ends  ↔'], ['none', 'No arrows  —']]) },
      { label: 'Shape', icon: 'corner', submenu: () => pick('shape', [['curve', 'Curved'], ['elbow', 'Elbow'], ['straight', 'Straight']]) },
      { label: 'Dashed', checked: link.dash, onClick: () => this.update(link, { dash: !link.dash }) },
      { label: 'Color', icon: 'palette', submenu: [{ swatches: DIAGRAM_COLORS, value: link.color, none: true, onPick: (c) => this.update(link, { color: c }) }] },
      { label: 'Reverse direction', icon: 'move', onClick: () => this.update(link, { from: link.to, to: link.from }) },
      { separator: true },
      { label: 'Delete line', icon: 'trash', danger: true, hint: 'Del', onClick: () => this.remove(link.id) },
    ]);
  }

  // ---------- the line being dragged out of a box ----------
  startTemp(box, side) {
    this.temp = { box, side, to: null };
  }

  moveTemp(to) {
    if (!this.temp) return;
    this.temp.to = to;
    this.render();
  }

  endTemp() {
    this.temp = null;
    this.render();
  }

  /**
   * Draw every line. Links whose boxes are gone are dropped here, so deleting a container takes its
   * lines with it. Returns the ids of boxes that have at least one line (they get a border).
   */
  render() {
    const boxes = this.getBoxes();
    this.links = this.links.filter((l) => boxes.has(l.from) && boxes.has(l.to));
    if (this.selectedId && !this.find(this.selectedId)) this.selectedId = null;
    const hadFocus = this.svg.contains(document.activeElement);
    const routes = routeLinks(boxes, this.links);
    const el = (tag, attrs) => {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
      return n;
    };
    const groups = [];
    const labels = [];
    for (const l of this.links) {
      const r = routes.get(l.id);
      if (!r) continue;
      const g = el('g', {
        class: `link${l.dash ? ' dashed' : ''}${l.id === this.selectedId ? ' selected' : ''}`,
        'data-link': l.id, tabindex: '-1', style: l.color ? `--lc:${l.color}` : null,
        role: 'button', 'aria-label': `Line${l.label ? ` "${l.label}"` : ''}. Delete removes it, Enter edits the label.`,
      });
      g.append(el('path', { class: 'link-hit', d: r.d }), el('path', { class: 'link-line', d: r.d }));
      for (const a of r.arrows) g.append(el('path', { class: 'link-arrow', d: a }));
      groups.push(g);
      if (l.label) {
        labels.push(h('div', {
          class: `link-label${l.id === this.selectedId ? ' selected' : ''}`, 'data-link': l.id, title: 'Double-click to edit',
          style: `left:${r1(r.mid.x)}px;top:${r1(r.mid.y)}px;${l.color ? `--lc:${l.color}` : ''}`,
        }, l.label));
      }
    }
    if (this.temp?.to) {
      const box = boxes.get(this.temp.box);
      if (box) groups.push(el('path', { class: 'link-temp', d: dragPath(box, this.temp.side, this.temp.to) }));
    }
    this.svg.replaceChildren(...groups);
    this.labels.replaceChildren(...labels);
    if (hadFocus && this.selectedId) this.svg.querySelector(`[data-link="${CSS.escape(this.selectedId)}"]`)?.focus({ preventScroll: true });
    return new Set(this.links.flatMap((l) => [l.from, l.to]));
  }
}
