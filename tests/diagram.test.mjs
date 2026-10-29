// Diagrams on freeform pages: lines between containers that lay themselves out (n8n style), the line
// menu and labels, drag-out-to-create, multi-select, alignment guides and container styles.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, waitSaved, api } from './helpers.mjs';

describe('diagrams', () => {
  let server;
  let browser;
  let page;
  let pageId;

  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
    page = await newPage(browser);
    await openApp(page, server.url);
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const origin = () => page.locator('#pageInner').boundingBox();
  // (:text-is doesn't match .nb-content: its text sits in a child <div>.)
  const nb = (text) => page.locator('.nb').filter({ has: page.locator('.nb-content', { hasText: new RegExp(`^${text}$`) }) });
  const linkCount = () => page.locator('.link').count();
  /** Page-px rect of a container. */
  const rect = (text) => nb(text).evaluate((b) => {
    const r = b.getBoundingClientRect();
    return { x: parseFloat(b.style.left), y: parseFloat(b.style.top), w: r.width, h: r.height };
  });
  /** First and last point of the i-th line's path, in page px. */
  const ends = (i = 0) => page.evaluate((n) => {
    const p = document.querySelectorAll('.link .link-line')[n];
    const len = p.getTotalLength();
    const a = p.getPointAtLength(0);
    const b = p.getPointAtLength(len);
    return { from: { x: a.x, y: a.y }, to: { x: b.x, y: b.y }, d: p.getAttribute('d') };
  }, i);
  /** Viewport point at the middle of the i-th line. */
  async function lineMid(i = 0) {
    const o = await origin();
    const m = await page.evaluate((n) => {
      const p = document.querySelectorAll('.link .link-line')[n];
      const q = p.getPointAtLength(p.getTotalLength() / 2);
      return { x: q.x, y: q.y };
    }, i);
    return { x: o.x + m.x, y: o.y + m.y };
  }
  async function addBox(text, x, y) {
    const o = await origin();
    await page.mouse.click(o.x + x, o.y + y);
    await page.keyboard.type(text);
  }
  /** Drag a container's dot onto another container (by text) or onto an empty page point {x, y}. */
  async function dragPort(from, side, to) {
    const o = await origin();
    const port = await nb(from).locator(`.nb-port[data-side="${side}"]`).boundingBox();
    await page.mouse.move(port.x + port.width / 2, port.y + port.height / 2);
    await page.mouse.down();
    let tx;
    let ty;
    if (typeof to === 'string') {
      const r = await nb(to).boundingBox();
      tx = r.x + r.width / 2;
      ty = r.y + r.height / 2;
    } else {
      tx = o.x + to.x;
      ty = o.y + to.y;
    }
    await page.mouse.move(tx, ty, { steps: 8 });
    await page.mouse.up();
  }
  async function dragHandle(text, dx, dy, { beforeUp } = {}) {
    const hb = await nb(text).locator('.nb-handle').boundingBox();
    await page.mouse.move(hb.x + 20, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + 20 + dx, hb.y + hb.height / 2 + dy, { steps: 10 });
    const seen = beforeUp ? await beforeUp() : null;
    await page.mouse.up();
    return seen;
  }
  async function lineMenu(i, item, sub) {
    const m = await lineMid(i);
    await page.mouse.click(m.x, m.y, { button: 'right' });
    if (sub) {
      await page.hover(`.menu .menu-item:has-text("${item}")`);
      await page.click(`.menu .menu-item:has-text("${sub}")`);
    } else {
      await page.click(`.menu .menu-item:has-text("${item}")`);
    }
  }

  it('layout maths: facing sides, spread ports, three shapes, guides', async () => {
    const r = await page.evaluate(async () => {
      const d = await import('/js/diagram.js');
      const A = { x: 0, y: 0, w: 100, h: 40 };
      const boxes = new Map([['a', A], ['b', { x: 300, y: -200, w: 100, h: 40 }], ['c', { x: 300, y: 0, w: 100, h: 40 }], ['e', { x: 300, y: 200, w: 100, h: 40 }]]);
      const mk = (to, shape = 'curve') => ({ id: `a-${to}`, from: 'a', to, ends: 'end', shape });
      const routes = d.routeLinks(boxes, [mk('e'), mk('b'), mk('c')]);
      const one = (shape) => d.routeLinks(new Map([['a', A], ['c', { x: 300, y: 80, w: 100, h: 40 }]]), [mk('c', shape)]).get('a-c').d;
      return {
        right: d.facingSides(A, { x: 300, y: 10, w: 80, h: 30 }),
        below: d.facingSides(A, { x: 20, y: 200, w: 80, h: 30 }),
        left: d.facingSides(A, { x: -300, y: 0, w: 80, h: 30 }),
        wideAbove: d.facingSides({ x: 0, y: 300, w: 600, h: 40 }, { x: 500, y: 0, w: 80, h: 30 }),
        portYs: ['a-b', 'a-c', 'a-e'].map((id) => routes.get(id).p1.y),
        portX: routes.get('a-c').p1.x,
        curve: one('curve'),
        elbow: one('elbow'),
        straight: one('straight'),
        snap: d.snapToGuides({ x: 103, y: 500, w: 50, h: 20 }, [{ x: 100, y: 0, w: 80, h: 30 }], 6),
        noSnap: d.snapToGuides({ x: 300, y: 500, w: 50, h: 20 }, [{ x: 100, y: 0, w: 80, h: 30 }], 6),
      };
    });
    assert.deepEqual(r.right, ['right', 'left']);
    assert.deepEqual(r.below, ['bottom', 'top']);
    assert.deepEqual(r.left, ['left', 'right']);
    assert.deepEqual(r.wideAbove, ['top', 'bottom'], 'a wide box below a small one links vertically');
    assert.equal(r.portX, 100, 'lines leave from the right edge');
    assert.ok(r.portYs[0] < r.portYs[1] && r.portYs[1] < r.portYs[2], `ports ordered top→bottom by target, never crossing: ${r.portYs}`);
    assert.match(r.curve, / C/);
    assert.doesNotMatch(r.elbow, / C/);
    assert.match(r.elbow, / Q/, 'elbows have rounded corners');
    assert.match(r.straight, /^M[\d. -]+ L[\d. -]+$/);
    assert.deepEqual(r.snap, { dx: -3, dy: 0, gx: 100, gy: null });
    assert.deepEqual(r.noSnap, { dx: 0, dy: 0, gx: null, gy: null });
  });

  it('drag a dot onto another container to link them; the line follows when a box moves', async () => {
    await page.click('#addPage');
    await page.waitForFunction(() => document.activeElement?.id === 'pageTitle');
    await page.keyboard.type('Flow');
    pageId = await page.evaluate(() => location.hash.slice(7));
    await addBox('Login', 80, 160);
    await addBox('Home', 420, 160);
    await dragPort('Login', 'right', 'Home');
    assert.equal(await linkCount(), 1);
    assert.equal(await nb('Login').evaluate((b) => b.classList.contains('linked')), true, 'linked boxes get a border');
    const L = await rect('Login');
    let e = await ends();
    assert.ok(Math.abs(e.from.x - (L.x + L.w)) < 1.5, `starts on Login's right edge (${e.from.x} vs ${L.x + L.w})`);
    assert.match(e.d, / C/, 'curved by default');

    await dragHandle('Home', -340, 200);
    const L2 = await rect('Login');
    e = await ends();
    assert.ok(Math.abs(e.from.y - (L2.y + L2.h)) < 1.5, `now leaves Login's bottom (${e.from.y} vs ${L2.y + L2.h})`);
    assert.equal((await rect('Home')).x, L2.x, 'Home snapped to Login\'s left edge');
  });

  it('drag a dot onto empty canvas: a new linked box with the caret in it; left empty, it goes away', async () => {
    await dragPort('Login', 'right', { x: 480, y: 170 });
    assert.equal(await linkCount(), 2);
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('.nb-content')), true, 'caret in the new box');
    await page.keyboard.type('Error');
    const E = await rect('Error');
    const L = await rect('Login');
    assert.ok(E.x >= L.x + L.w, 'placed to the right, where the line was dragged');

    await dragPort('Error', 'right', { x: 820, y: 170 });
    assert.equal(await linkCount(), 3);
    await nb('Login').locator('.nb-content').click(); // leave the new box without typing
    await page.waitForFunction(() => document.querySelectorAll('.link').length === 2);
    assert.equal(await page.locator('.nb').count(), 3, 'Login, Home, Error: no empty box left');
  });

  it('line menu: shape, arrows, dashed, color; a label from double-click is searchable', async () => {
    await lineMenu(0, 'Shape', 'Elbow');
    assert.doesNotMatch((await ends(0)).d, / C/);
    await lineMenu(0, 'Arrows', 'Both ends');
    assert.equal(await page.locator('.link >> nth=0').locator('.link-arrow').count(), 2);
    await lineMenu(0, 'Dashed');
    assert.equal(await page.locator('.link.dashed').count(), 1);
    await lineMenu(0, 'Color');
    await page.hover('.menu .menu-item:has-text("Color")');
    await page.click('.menu .swatch[title="#e35d6a"]');
    assert.match(await page.getAttribute('.link >> nth=0', 'style'), /#e35d6a/);

    const m = await lineMid(0);
    await page.mouse.dblclick(m.x, m.y);
    await page.fill('.modal input', 'signs in');
    await page.click('.modal .btn.primary');
    assert.equal(await page.textContent('.link-label'), 'signs in');
    await waitSaved(page);
    const hit = (await api(server.url, 'GET', '/search?q=signs%20in')).json;
    assert.equal(hit[0]?.title, 'Flow');
  });

  it('click a line and press Delete; Undo brings it back', async () => {
    const m = await lineMid(1);
    await page.mouse.click(m.x, m.y);
    assert.equal(await page.locator('.link.selected').count(), 1);
    await page.keyboard.press('Delete');
    assert.equal(await linkCount(), 1);
    await page.click('.toast:has-text("Deleted line") .toast-action');
    assert.equal(await linkCount(), 2);
  });

  it('container style: fill, shape and border from the right-click menu', async () => {
    const hb = await nb('Home').locator('.nb-handle').boundingBox();
    await page.mouse.click(hb.x + 20, hb.y + hb.height / 2, { button: 'right' });
    await page.hover('.menu .menu-item:has-text("Fill")');
    await page.click('.menu .swatch[title="#4a90e2"]');
    await page.mouse.click(hb.x + 20, hb.y + hb.height / 2, { button: 'right' });
    await page.hover('.menu .menu-item:has-text("Shape")');
    await page.click('.menu .menu-item:has-text("Pill")');
    const s = await nb('Home').evaluate((b) => ({ fill: b.dataset.fill, shape: b.dataset.shape, bg: getComputedStyle(b).backgroundColor, radius: getComputedStyle(b).borderTopLeftRadius }));
    assert.equal(s.fill, '#4a90e2');
    assert.equal(s.shape, 'pill');
    assert.notEqual(s.bg, 'rgba(0, 0, 0, 0)');
    assert.equal(s.radius, '999px');
    await page.mouse.click(hb.x + 20, hb.y + hb.height / 2, { button: 'right' });
    await page.hover('.menu .menu-item:has-text("Border")');
    await page.click('.menu .menu-item:has-text("Never")');
    await nb('Login').locator('.nb-content').click(); // deselect (a selected box shows an accent frame)
    await page.mouse.move(0, 0);
    assert.equal(await nb('Home').evaluate((b) => getComputedStyle(b, '::before').borderTopColor), 'rgba(0, 0, 0, 0)', '"Never" hides the border even though it is linked');
  });

  it('drag a rectangle to select several; they move together and Delete removes them with Undo', async () => {
    const o = await origin();
    const L = await rect('Login');
    const H = await rect('Home');
    // From empty space above-left of Login to past Home's bottom-right.
    await page.mouse.move(o.x + L.x - 20, o.y + L.y - 30);
    await page.mouse.down();
    await page.mouse.move(o.x + Math.max(L.x + L.w, H.x + H.w) + 20, o.y + H.y + H.h + 20, { steps: 8 });
    await page.mouse.up();
    assert.equal(await page.locator('.nb.selected').count(), 2);
    await dragHandle('Login', 0, 40);
    assert.equal((await rect('Login')).y, L.y + 40);
    assert.equal((await rect('Home')).y, H.y + 40, 'the other selected box moved too');
    await nb('Login').locator('.nb-handle').focus();
    await page.keyboard.press('Delete');
    assert.equal(await nb('Login').count() + await nb('Home').count(), 0);
    assert.equal(await linkCount(), 0, 'their lines went with them');
    await page.click('.toast:has-text("Deleted 2 note containers") .toast-action');
    assert.equal(await nb('Login').count(), 1);
    assert.equal(await linkCount(), 2, 'Undo brings the lines back too');
  });

  it('a guide shows while a box lines up with another, and it snaps', async () => {
    await nb('Login').locator('.nb-content').click();
    const E = await rect('Error');
    const L = await rect('Login');
    // Drag Error so its left edge lands 3 px right of Login's left edge.
    const guide = await dragHandle('Error', L.x + 3 - E.x, 0, { beforeUp: () => page.locator('.align-guide.v').count() });
    assert.equal(guide, 1, 'a vertical guide while dragging');
    assert.equal(await page.locator('.align-guide').count(), 0, 'guides go away on drop');
    // It snapped: one of its left / center / right edges now sits exactly on another box's edge.
    const edges = (r) => [r.x, r.x + r.w / 2, r.x + r.w].map((v) => Math.round(v * 2) / 2);
    const mine = edges(await rect('Error'));
    const theirs = [...edges(await rect('Login')), ...edges(await rect('Home'))];
    assert.ok(mine.some((v) => theirs.includes(v)), `Error ${mine} lines up with one of ${theirs}`);

    // Alt turns snapping off: no guide, and it lands exactly where it was dropped.
    const before = (await rect('Error')).x;
    await page.keyboard.down('Alt');
    const noGuide = await dragHandle('Error', 3, 0, { beforeUp: () => page.locator('.align-guide').count() });
    await page.keyboard.up('Alt');
    assert.equal(noGuide, 0);
    assert.equal((await rect('Error')).x, before + 3);
  });

  it('lines, labels and styles survive a reload; old pages without links still load', async () => {
    await waitSaved(page);
    const saved = JSON.parse((await api(server.url, 'GET', `/pages/${pageId}`)).json.content);
    assert.equal(saved.links.length, 2);
    assert.ok(saved.links.some((l) => l.label === 'signs in' && l.shape === 'elbow' && l.dash && l.ends === 'both'));
    assert.deepEqual(saved.blocks.find((b) => b.html.includes('Home')).style, { fill: '#4a90e2', shape: 'pill', border: 'never' });
    await page.reload();
    await page.waitForSelector('.link');
    assert.equal(await linkCount(), 2);
    assert.equal(await page.textContent('.link-label'), 'signs in');
    assert.equal(await nb('Home').getAttribute('data-shape'), 'pill');
    await page.click('#pageList .page-item:has-text("Getting started")');
    await page.waitForSelector('.nb-content:has-text("Welcome")');
    assert.equal(await linkCount(), 0);
    assert.deepEqual(page.errors, []);
  });
});
