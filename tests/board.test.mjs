import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, addFromTemplate, waitSaved, api } from './helpers.mjs';

describe('Cards board', () => {
  let server;
  let browser;
  let page;

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

  const col = (name) => page.locator(`.board-col:has(.board-col-title:text-is("${name}"))`);
  const titles = (name) => col(name).locator('.card-title').allTextContents();
  async function addCards(list, ...names) {
    await col(list).locator('[data-act="open-composer"]').click();
    for (const n of names) {
      await page.keyboard.type(n);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.press('Escape');
  }

  it('the Cards template creates a board with To do / Doing / Done', async () => {
    await addFromTemplate(page, 'Cards');
    await page.waitForSelector('.board-view');
    assert.equal(await page.textContent('#pageTitle'), 'Cards');
    assert.deepEqual(await page.$$eval('.board-col-title', (e) => e.map((x) => x.textContent)), ['To do', 'Doing', 'Done']);
    assert.equal(await page.locator('.nb').count(), 0);
  });

  it('add cards: Enter adds and keeps the box open, Esc closes it', async () => {
    await addCards('To do', 'Design landing page', 'Write copy', 'Pick fonts');
    assert.deepEqual(await titles('To do'), ['Design landing page', 'Write copy', 'Pick fonts']);
    assert.equal(await page.locator('.board-composer').count(), 0);
    // The "Add card" button submits the composer form; it must not navigate the page.
    await col('Doing').locator('[data-act="open-composer"]').click();
    await page.keyboard.type('Build the API');
    const url = page.url();
    await col('Doing').locator('.board-composer button[type="submit"]').click();
    assert.equal(page.url(), url);
    assert.deepEqual(await titles('Doing'), ['Build the API']);
    await page.keyboard.press('Escape');
    assert.match(await page.textContent('.board-stats'), /3 lists · 4 cards/);
  });

  it('the card dialog sets labels, description, checklist, due date and cover', async () => {
    await page.click('.board-card:has-text("Build the API")');
    await page.waitForSelector('.card-dialog');
    await page.click('.label-chip[data-label="yellow"]');
    await page.click('.label-chip[data-label="blue"]');
    await page.fill('.card-desc', 'REST endpoints for notes');
    const item = page.locator('.card-dialog input[aria-label="New checklist item"]');
    for (const t of ['Schema', 'Routes', 'Tests']) { await item.fill(t); await item.press('Enter'); }
    assert.equal(await page.isVisible('.card-dialog'), true, 'Enter in the checklist box must not close the dialog');
    await page.click('.check-item input[type="checkbox"] >> nth=0');
    await page.click('.check-item input[type="checkbox"] >> nth=1');
    await page.waitForTimeout(300); // bar width transition
    const pct = await page.$eval('.card-dialog .todo-bar-fill', (el) => el.style.width);
    assert.equal(pct, '67%');
    await page.fill('.card-dialog input[aria-label="Due date"]', '2026-01-15');
    await page.click('[data-cover="g-tint"]');
    await page.click('.modal .btn:has-text("Done")');
    const card = page.locator('.board-card:has-text("Build the API")');
    assert.equal(await card.locator('.card-label').count(), 2);
    assert.equal(await card.locator('.card-cover.tall').count(), 1);
    assert.doesNotMatch(await card.locator('.card-cover').evaluate((el) => getComputedStyle(el).backgroundImage), /gradient/, 'theme covers are solid');
    assert.match(await card.locator('.card-badges').textContent(), /2\/3/);
    assert.equal(await card.locator('.card-badge.due.overdue').count(), 1, 'a past due date shows as overdue');
    assert.equal(await card.locator('.card-badge[title="This card has a description"]').count(), 1);
  });

  it('marking the due date complete turns the badge green', async () => {
    await page.click('.board-card:has-text("Build the API")');
    await page.check('.card-dialog input[aria-label="Due date complete"]');
    await page.click('.modal .btn:has-text("Done")');
    assert.equal(await page.locator('.board-card:has-text("Build the API") .card-badge.due.done').count(), 1);
  });

  it('drag a card to another list', async () => {
    await page.dragAndDrop('.board-card:has-text("Write copy")', '.board-col:has(.board-col-title:text-is("Done")) .board-cards');
    assert.deepEqual(await titles('Done'), ['Write copy']);
    assert.deepEqual(await titles('To do'), ['Design landing page', 'Pick fonts']);
  });

  it('drag a card above another card in the same list', async () => {
    await page.dragAndDrop('.board-card:has-text("Pick fonts")', '.board-card:has-text("Design landing page")', { targetPosition: { x: 20, y: 4 } });
    assert.deepEqual(await titles('To do'), ['Pick fonts', 'Design landing page']);
  });

  it('keyboard: arrows move focus, Alt+arrows move the card, Enter opens, Delete deletes (with Undo)', async () => {
    await page.focus('.board-card:has-text("Pick fonts")');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.querySelector('.card-title').textContent), 'Design landing page');
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await titles('To do'), ['Design landing page', 'Pick fonts']);
    await page.keyboard.press('Alt+ArrowRight');
    assert.deepEqual(await titles('Doing'), ['Design landing page', 'Build the API']);
    assert.equal(await page.evaluate(() => document.activeElement.querySelector('.card-title').textContent), 'Design landing page', 'focus follows the moved card');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => document.activeElement.querySelector('.card-title').textContent), 'Write copy');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.card-dialog');
    await page.keyboard.press('Escape');
    await page.focus('.board-card:has-text("Write copy")');
    await page.keyboard.press('Delete');
    assert.deepEqual(await titles('Done'), []);
    await page.click('.toast-action:has-text("Undo")');
    assert.deepEqual(await titles('Done'), ['Write copy']);
  });

  it('lists: add, rename, move and delete', async () => {
    await page.click('[data-act="open-list-composer"]');
    await page.keyboard.type('Blocked');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.click('.board-col-title:text-is("Blocked")');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Waiting');
    await page.keyboard.press('Enter');
    await col('Waiting').locator('[data-act="col-menu"]').click();
    await page.click('.menu .menu-item:has-text("Move left")');
    assert.deepEqual(await page.$$eval('.board-col-title', (e) => e.map((x) => x.textContent)), ['To do', 'Doing', 'Waiting', 'Done']);
    await col('Waiting').locator('[data-act="col-menu"]').click();
    await page.click('.menu .menu-item:has-text("Delete list")');
    assert.deepEqual(await page.$$eval('.board-col-title', (e) => e.map((x) => x.textContent)), ['To do', 'Doing', 'Done'], 'an empty list is deleted without asking');
  });

  it('backgrounds are solid theme colors: no fixed colors, no gradients; label names', async () => {
    const bgVar = () => page.$eval('.board-area', (el) => el.style.getPropertyValue('--board-bg'));
    assert.match(await bgVar(), /var\(--accent\)/, 'the default background is the theme tint');
    const options = await page.evaluate(async () => (await import('/js/board.js')).BACKGROUNDS.map(([id, , css]) => [id, css]));
    for (const [id, css] of options) {
      assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, `${id} must use theme tokens only`);
      assert.doesNotMatch(css, /gradient/i, `${id} must be a solid color`);
    }
    await page.click('[data-act="background"]');
    await page.click('.menu .menu-item:has-text("Accent")');
    assert.match(await bgVar(), /var\(--accent\) 42%/);
    await page.click('[data-act="labels"]');
    await page.click('.menu .menu-item:has-text("Yellow")');
    await page.fill('.modal input', 'Backend');
    await page.click('.modal .btn.primary');
    assert.equal(await page.getAttribute('.board-card:has-text("Build the API") .card-label >> nth=0', 'title'), 'Backend');
  });

  it('everything survives a reload, and card text is searchable', async () => {
    await waitSaved(page);
    await page.reload();
    await page.waitForSelector('.board-view');
    assert.deepEqual(await titles('Doing'), ['Design landing page', 'Build the API']);
    const card = page.locator('.board-card:has-text("Build the API")');
    assert.match(await card.locator('.card-badges').textContent(), /2\/3/);
    assert.equal(await card.locator('.card-badge.due.done').count(), 1);
    assert.match(await page.$eval('.board-area', (el) => el.style.getPropertyValue('--board-bg')), /var\(--accent\) 42%/);
    const hit = (await api(server.url, 'GET', '/search?q=Routes')).json;
    assert.equal(hit[0]?.title, 'Cards', 'checklist items are searchable');
  });

  it('boards saved with the old fixed gradients load with theme colors', async () => {
    const r = await page.evaluate(async () => {
      const { normalizeBoard } = await import('/js/board.js');
      const d = normalizeBoard({ background: 'aurora', columns: [{ title: 'A', cards: [{ title: 'x', cover: 'g-sunset' }, { title: 'y', cover: 'red' }] }] });
      const p = normalizeBoard({ background: 'theme', columns: [] });
      return { bg: d.background, covers: d.columns[0].cards.map((c) => c.cover), oldPage: p.background };
    });
    assert.deepEqual(r, { bg: 'tint', covers: ['g-tint', 'red'], oldPage: 'page' });
  });

  it('drawing and note containers are refused on a board', async () => {
    await page.click('.rtab[data-tab="draw"]');
    await page.click('[data-cmd="modePen"]');
    assert.equal(await page.evaluate(() => document.getElementById('pageInner').classList.contains('draw')), false);
    await page.click('.rtab[data-tab="insert"]');
    await page.click('[data-cmd="newContainer"]');
    assert.equal(await page.locator('.nb').count(), 0);
    await page.click('.rtab[data-tab="home"]');
    assert.deepEqual(page.errors, []);
  });
});
