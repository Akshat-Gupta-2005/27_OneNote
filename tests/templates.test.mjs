import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, addFromTemplate, waitSaved, api } from './helpers.mjs';

describe('templates', () => {
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

  const insert = async (name) => {
    await page.click('.rtab[data-tab="insert"]');
    await page.click('[data-drop="templates"]');
    await page.click(`.menu .menu-item:has-text("${name}")`);
  };
  const headings = (sel = '.nb-content') => page.$$eval(`${sel} h1, ${sel} h2, ${sel} h3`, (e) => e.map((x) => x.textContent));

  it('Add page ▾ offers page templates only: Blank, To-do planner, Cards', async () => {
    await page.click('#addPageMenu');
    const names = await page.$$eval('.menu .menu-item .mi-label', (e) => e.map((x) => x.textContent));
    assert.deepEqual(names, ['Blank page', 'To-do planner', 'Cards']);
    await page.keyboard.press('Escape');
  });

  it('Insert → Templates offers the four note templates', async () => {
    await page.click('.rtab[data-tab="insert"]');
    await page.click('[data-drop="templates"]');
    const names = await page.$$eval('.menu .menu-item .mi-label', (e) => e.map((x) => x.textContent));
    assert.deepEqual(names, ['Meeting notes', 'Daily journal', 'Project plan', 'Weekly planner']);
    await page.keyboard.press('Escape');
  });

  it('inserting into an untitled page gives the page the template title', async () => {
    await addFromTemplate(page, 'Blank page');
    await insert('Meeting notes');
    assert.match(await page.textContent('#pageTitle'), /^Meeting — /);
    assert.deepEqual(await headings(), ['Details', 'Agenda', 'Notes', 'Decisions', 'Action items']);
    assert.equal(await page.locator('.nb-content [data-tag="todo"]').count(), 2);
    await waitSaved(page);
    assert.match((await api(server.url, 'GET', '/search?q=Agenda')).json[0]?.title || '', /^Meeting — /, 'saved and searchable');
  });

  it('inserting into a page that has notes adds below them, with the template name as a heading', async () => {
    const before = await page.$$eval('.nb', (b) => b.map((x) => x.offsetTop + x.offsetHeight));
    const bottom = Math.max(...before);
    await insert('Project plan');
    const added = page.locator('.nb').last();
    assert.ok(await added.evaluate((el, b) => el.offsetTop >= b + 40, bottom), 'placed 40 px below the lowest container');
    assert.deepEqual(await added.locator('h1, h2').allTextContents(), ['Project plan', 'Goal', 'Milestones', 'Risks', 'Next steps', 'Links']);
    assert.match(await page.textContent('#pageTitle'), /^Meeting — /, 'the page title is left alone');
  });

  it('a multi-container template keeps its layout and gets a heading container', async () => {
    const before = await page.locator('.nb').count();
    await insert('Weekly planner');
    assert.equal(await page.locator('.nb').count(), before + 9, 'heading + 7 days + notes');
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const pos = await page.$$eval('.nb', (b) => b.slice(-9).map((x) => ({ x: x.offsetLeft, y: x.offsetTop, text: x.textContent })));
    assert.match(pos[0].text, /^Week of /);
    assert.match(pos[1].text, new RegExp(`^Monday ${monday.getDate()}`));
    assert.equal(pos[2].y, pos[1].y, 'Monday and Tuesday share a row');
    assert.ok(pos[5].y > pos[1].y, 'Friday starts the second row');
  });

  it('Undo in the toast removes exactly what was inserted', async () => {
    const before = await page.locator('.nb').count();
    await insert('Daily journal');
    assert.equal(await page.locator('.nb').count(), before + 3);
    // Earlier inserts' toasts may still be showing; the newest one is last.
    await page.locator('.toast:has-text("Inserted Daily journal") .toast-action').click();
    assert.equal(await page.locator('.nb').count(), before);
  });

  it('templates cannot be inserted into a planner or a board', async () => {
    await addFromTemplate(page, 'Cards');
    await page.waitForSelector('.board-view');
    await insert('Meeting notes');
    await page.waitForSelector('.toast:has-text("freeform pages only")');
    assert.equal(await page.locator('.nb').count(), 0);
    assert.deepEqual(page.errors, []);
  });
});
