// Planner tidy-up (owner request 2026-10-17): add boxes hide behind a + beside each heading,
// checked tasks sink to the bottom of their group (each half keeps its own order), and Tag view
// lists tags A→Z.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, addFromTemplate, waitSaved } from './helpers.mjs';

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

describe('planner: + add boxes, checked last, tags A→Z', () => {
  let server;
  let browser;
  let page;
  const now = new Date();
  const cur = `m-${monthKey(now)}`;
  const next = `m-${monthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1))}`;

  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
    page = await newPage(browser);
    await openApp(page, server.url);
    await addFromTemplate(page, 'To-do planner');
    await page.waitForSelector('.todo-view');
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const plus = (key) => page.locator(`.todo-group[data-key="${key}"] [data-act="add"]`);
  const box = (key) => page.locator(`.todo-composer[data-key="${key}"] input`);
  const inGroup = (key) => page.$$eval(`.todo-group[data-key="${key}"] .todo-text`, (e) => e.map((x) => x.textContent));
  const row = (text) => page.locator(`.todo-task:has(.todo-text:text-is("${text}"))`);
  const isActive = (loc) => loc.evaluate((el) => el === document.activeElement);

  it('shows a + per group and no add boxes or Add buttons until one is clicked', async () => {
    assert.equal(await page.locator('.todo-composer').count(), 0);
    assert.equal(await page.locator('.todo-view button:text-is("Add")').count(), 0, 'no Add buttons');
    assert.ok(await plus(cur).count(), 'the current month has a +');
    await plus(cur).click();
    assert.equal(await page.locator('.todo-composer').count(), 1);
    assert.ok(await isActive(box(cur)), 'the box opens focused');
    assert.match(await box(cur).getAttribute('placeholder'), /#tag @date/);
  });

  it('Enter adds and keeps the box open; Esc closes it and returns focus to the +', async () => {
    for (const t of ['Delta', 'Alpha', 'Charlie', 'Bravo']) { await box(cur).fill(t); await box(cur).press('Enter'); }
    assert.deepEqual(await inGroup(cur), ['Delta', 'Alpha', 'Charlie', 'Bravo'], 'tasks keep the order they were added in');
    assert.ok(await isActive(box(cur)));
    await box(cur).press('Escape');
    assert.equal(await page.locator('.todo-composer').count(), 0);
    assert.ok(await isActive(plus(cur)));
  });

  it('clicking away closes an empty box but keeps one with text in it', async () => {
    await plus(cur).click();
    await page.click('.todo-subtitle');
    await page.waitForFunction(() => !document.querySelector('.todo-composer'));
    await plus(cur).click();
    await box(cur).fill('half-typed');
    await page.click('.todo-subtitle');
    await page.waitForTimeout(100);
    assert.equal(await box(cur).inputValue(), 'half-typed', 'typed text is never thrown away');
    await box(cur).fill('');
    await box(cur).press('Escape');
  });

  it('a click on something below an open empty box still lands', async () => {
    await plus(next).click();
    await box(next).fill('Echo');
    await box(next).press('Enter');
    await box(next).press('Escape');
    await plus(cur).click(); // empty box above next month's tasks
    await row('Echo').locator('.todo-check').click();
    assert.equal(await row('Echo').locator('.todo-check').getAttribute('aria-checked'), 'true');
    await row('Echo').locator('.todo-check').click();
  });

  it('checked tasks sink to the bottom; both halves keep their order; unchecking restores it', async () => {
    await row('Alpha').locator('.todo-check').click();
    assert.deepEqual(await inGroup(cur), ['Delta', 'Charlie', 'Bravo', 'Alpha']);
    assert.ok(await isActive(row('Alpha').locator('.todo-check')), 'focus follows the task');
    await row('Delta').locator('.todo-check').click();
    assert.deepEqual(await inGroup(cur), ['Charlie', 'Bravo', 'Delta', 'Alpha'], 'checked ones keep their own order');
    await row('Delta').locator('.todo-check').click();
    assert.deepEqual(await inGroup(cur), ['Delta', 'Charlie', 'Bravo', 'Alpha'], 'unchecked Delta is back at the top');
  });

  it('moves never mix the halves: Alt+↑ stops at the first checked task, drag past it lands last of the unchecked', async () => {
    await row('Alpha').locator('.todo-text').focus();
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await inGroup(cur), ['Delta', 'Charlie', 'Bravo', 'Alpha']);
    // Nothing moved underneath either: unchecked, Alpha returns to its original second place.
    await row('Alpha').locator('.todo-check').click();
    assert.deepEqual(await inGroup(cur), ['Delta', 'Alpha', 'Charlie', 'Bravo']);
    await row('Alpha').locator('.todo-check').click();
    const list = page.locator(`.todo-group[data-key="${cur}"] .todo-list`);
    const b = await list.boundingBox();
    await row('Delta').dragTo(list, { targetPosition: { x: 60, y: b.height - 2 } });
    assert.deepEqual(await inGroup(cur), ['Charlie', 'Bravo', 'Delta', 'Alpha']);
  });

  it('Tag view lists tags A→Z, ignoring case, with No tag last', async () => {
    await page.click('[data-view="tag"]');
    for (const t of ['x #money', 'y #Career', 'z #skills', 'w #NoSQL', 'v #InfoSec']) {
      if (!(await box('t-').count())) await plus('t-').click();
      await box('t-').fill(t);
      await box('t-').press('Enter');
    }
    const heads = await page.$$eval('.todo-group-head h3', (e) => e.map((x) => x.textContent));
    assert.deepEqual(heads, ['Career', 'InfoSec', 'money', 'NoSQL', 'skills', 'No tag']);
  });

  it('order and checked state survive a reload', async () => {
    await page.click('[data-view="month"]');
    const before = await inGroup(cur);
    await waitSaved(page);
    await page.reload();
    await page.waitForSelector('.todo-view');
    assert.deepEqual(await inGroup(cur), before);
    assert.equal(await page.locator('.todo-composer').count(), 0, 'boxes start closed');
    assert.deepEqual(page.errors, []);
  });
});
