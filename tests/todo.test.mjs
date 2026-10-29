import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, addFromTemplate, waitSaved, api } from './helpers.mjs';

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthName = (d) => d.toLocaleString('en-US', { month: 'long' });

describe('to-do planner', () => {
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

  const tasks = () => page.$$eval('.todo-task .todo-text', (els) => els.map((e) => e.textContent));
  const progress = () => page.textContent('.todo-progress');
  const composer = (key) => page.locator(`.todo-composer[data-key="${key}"] input`);
  // Add boxes are closed until the group's + opens them.
  const add = async (key, text) => {
    if (!(await composer(key).count())) await page.click(`.todo-group[data-key="${key}"] [data-act="add"]`);
    await composer(key).fill(text);
    await composer(key).press('Enter');
  };

  it('quick-add parser understands #tag and @date forms', async () => {
    const r = await page.evaluate(async () => {
      const { parseQuickAdd } = await import('/js/todo.js');
      const today = new Date(2026, 9, 15); // Thu 15 Oct 2026
      const p = (s, o = {}) => parseQuickAdd(s, { today, ...o });
      return {
        both: p('Sign offer letter #Sabre @20 Oct'),
        iso: p('Pay rent @2026-12-01'),
        tomorrow: p('Call home @tomorrow'),
        weekday: p('Gym @sat'),
        slash: p('Exam @3/11'),
        nextYear: p('Joining @5 jan'),
        defaultMonth: p('Review @20 Oct', { defaultMonth: '2027-10' }),
        invalid: p('Party @31/2'),
        onlyTag: p('#College'),
        midWordHash: p('Learn C# basics'),
      };
    });
    assert.deepEqual(r.both, { text: 'Sign offer letter', tag: 'Sabre', date: '2026-10-20' });
    assert.equal(r.iso.date, '2026-12-01');
    assert.equal(r.tomorrow.date, '2026-10-16');
    assert.equal(r.weekday.date, '2026-10-17');
    assert.equal(r.slash.date, '2026-11-03');
    assert.equal(r.nextYear.date, '2027-01-05', 'a date >60 days in the past rolls to next year');
    assert.equal(r.defaultMonth.date, '2027-10-20', 'year comes from the group being added to');
    assert.equal(r.invalid.date, null);
    assert.equal(r.invalid.text, 'Party @31/2', 'an invalid date is left in the text, not silently dropped');
    assert.deepEqual(r.onlyTag, { text: '', tag: 'College', date: null });
    assert.equal(r.midWordHash.tag, null);
  });

  it('creates a planner page from the template with this month marked NOW', async () => {
    await addFromTemplate(page, 'To-do planner');
    await page.waitForSelector('.todo-view');
    assert.equal(await page.textContent('#pageTitle'), 'To-do planner');
    const heads = await page.$$eval('.todo-group-head h3', (e) => e.map((x) => x.textContent));
    assert.equal(heads.length, 4, 'three months + No month');
    assert.equal(heads[0], monthName(new Date()));
    assert.equal(heads[3], 'No month', 'No month is always there, even when empty');
    assert.equal(await page.textContent('.todo-month .todo-badge'), 'NOW');
    assert.match(await progress(), /0 of 0 done\s*0%/);
    assert.equal(await page.locator('.nb').count(), 0, 'no freeform containers on a to-do page');
  });

  it('adds tasks with tags, and @date moves a task to its month', async () => {
    const now = new Date();
    const cur = `m-${iso(now).slice(0, 7)}`;
    await add(cur, 'Finish project 1 #College');
    await add(cur, 'Sign the offer letter #Sabre');
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 10);
    await add(cur, `Exam revision @${iso(nextMonth)}`);
    assert.deepEqual(await page.$$eval(`.todo-group[data-key="${cur}"] .todo-text`, (e) => e.map((x) => x.textContent)), ['Finish project 1', 'Sign the offer letter']);
    const nextKey = `m-${iso(nextMonth).slice(0, 7)}`;
    assert.deepEqual(await page.$$eval(`.todo-group[data-key="${nextKey}"] .todo-text`, (e) => e.map((x) => x.textContent)), ['Exam revision']);
    assert.equal(await page.textContent(`.todo-group[data-key="${cur}"] .todo-chip`), 'College');
    assert.match(await progress(), /0 of 3 done/);
    assert.equal(await composer(cur).inputValue(), '', 'composer clears after adding');
    assert.ok(await composer(cur).evaluate((el) => el === document.activeElement), 'focus stays in the composer');
  });

  it('checking a task updates the progress bar and group count', async () => {
    await page.click('.todo-task:has-text("Finish project 1") .todo-check');
    assert.equal(await page.getAttribute('.todo-task:has-text("Finish project 1") .todo-check', 'aria-checked'), 'true');
    assert.match(await progress(), /1 of 3 done\s*33%/);
    assert.match(await page.textContent('.todo-month .todo-count'), /1\/2/);
  });

  it('date view groups by due date, with overdue tasks first', async () => {
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    await page.click('[data-view="date"]');
    await add('nodate', `Overdue thing @${iso(yesterday)}`);
    await add('nodate', 'Due today @today');
    const heads = await page.$$eval('.todo-group-head h3', (e) => e.map((x) => x.textContent));
    assert.equal(heads[0], 'Overdue');
    assert.ok(heads.includes('No date'));
    assert.equal(heads.at(-1), 'No date', 'undated tasks go last');
    assert.equal(await page.textContent('.todo-overdue .todo-text'), 'Overdue thing');
    assert.equal(await page.textContent('.todo-group:has(.todo-badge:has-text("TODAY")) .todo-text'), 'Due today');
    assert.equal(await page.locator('.todo-overdue [data-act="add"]').count(), 0, 'no + under Overdue');
  });

  it('tag view groups by tag, and adding inside a tag group applies the tag', async () => {
    await page.click('[data-view="tag"]');
    const heads = await page.$$eval('.todo-group-head h3', (e) => e.map((x) => x.textContent));
    assert.deepEqual(heads, ['College', 'Sabre', 'No tag']);
    await add('t-Sabre', 'Background verification');
    assert.deepEqual(await page.$$eval('.todo-group[data-key="t-Sabre"] .todo-text', (e) => e.map((x) => x.textContent)), ['Sign the offer letter', 'Background verification']);
  });

  it('hide completed hides done tasks but keeps the counts', async () => {
    await page.click('[data-view="month"]');
    await page.check('[data-act="hide-done"]');
    assert.ok(!(await tasks()).includes('Finish project 1'));
    assert.match(await progress(), /1 of 6 done/);
    await page.uncheck('[data-act="hide-done"]');
    assert.ok((await tasks()).includes('Finish project 1'));
  });

  it('edits task text inline', async () => {
    await page.click('.todo-text:has-text("Background verification")');
    await page.fill('.todo-edit', 'Background verification forms');
    await page.press('.todo-edit', 'Enter');
    assert.ok((await tasks()).includes('Background verification forms'));
  });

  it('remove is undoable and restores the task in place', async () => {
    const before = await tasks();
    const row = page.locator('.todo-task:has-text("Sign the offer letter")');
    await row.hover();
    await row.locator('.todo-remove').click();
    assert.ok(!(await tasks()).includes('Sign the offer letter'));
    await page.click('.toast-action:has-text("Undo")');
    assert.deepEqual(await tasks(), before);
  });

  it('sets a date from the date popover', async () => {
    const row = page.locator('.todo-task:has-text("Background verification forms")');
    await row.hover();
    await row.locator('[data-act="date"]').click();
    await page.click('.todo-date-quick button:has-text("Tomorrow")');
    const t = new Date();
    const tomorrow = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1);
    const label = `${tomorrow.getDate()} ${tomorrow.toLocaleString('en-US', { month: 'short' })}`;
    assert.match(await row.locator('.todo-chip.date').textContent(), new RegExp(`^${label}`));
  });

  it('header fields, month notes and tasks survive a reload; view switches do not save', async () => {
    await page.click('.todo-eyebrow');
    await page.keyboard.type('VIT → BENGALURU');
    await page.click('.todo-subtitle');
    await page.keyboard.type('Everything before day one.');
    await page.click('.todo-month .todo-note');
    await page.keyboard.type('Finish the faculty projects.');
    await page.click('[data-view="tag"]');
    await waitSaved(page);
    const before = await tasks();

    const patches = [];
    page.on('request', (r) => { if (r.method() === 'PATCH') patches.push(r.url()); });
    await page.reload();
    await page.waitForSelector('.todo-view');
    assert.equal(await page.getAttribute('[data-view="tag"]', 'aria-pressed'), 'true', 'view remembered per page');
    await page.click('[data-view="month"]');
    await page.click('[data-view="date"]');
    await page.click('[data-view="month"]');
    await page.waitForTimeout(900);
    assert.equal(patches.length, 0, 'switching views must not save the page');

    assert.equal(await page.textContent('.todo-eyebrow'), 'VIT → BENGALURU');
    assert.equal(await page.textContent('.todo-subtitle'), 'Everything before day one.');
    assert.equal(await page.textContent('.todo-month .todo-note'), 'Finish the faculty projects.');
    assert.deepEqual((await tasks()).sort(), before.sort());
    assert.equal(await page.getAttribute('.todo-task:has-text("Finish project 1") .todo-check', 'aria-checked'), 'true');
  });

  it('task text is searchable', async () => {
    const r = await api(server.url, 'GET', '/search?q=verification%20forms');
    assert.equal(r.json.length, 1);
    assert.equal(r.json[0].title, 'To-do planner');
  });

  it('No month takes tasks without a month and sits below Add month', async () => {
    await add('unscheduled', 'Someday maybe');
    assert.deepEqual(await page.$$eval('.todo-unscheduled .todo-text', (e) => e.map((x) => x.textContent)), ['Someday maybe']);
    assert.equal(await page.$eval('.todo-add-month', (b) => b.nextElementSibling.matches('.todo-unscheduled')), true);
    await page.focus('.todo-task:has-text("Someday maybe") .todo-text');
    await page.keyboard.press('Delete');
    assert.equal(await page.locator('.todo-unscheduled .todo-task').count(), 0);
  });

  it('adds a month, and removing a month with tasks moves them to No month', async () => {
    const before = await page.locator('.todo-month').count();
    await page.click('[data-act="add-month"]');
    assert.equal(await page.locator('.todo-month').count(), before + 1);
    const first = page.locator('.todo-month').first();
    const n = await first.locator('.todo-task').count();
    await first.locator('[data-act="month-menu"]').click();
    await page.click('.menu .menu-item:has-text("Remove month")');
    await page.click('.modal .btn:has-text("Remove month")');
    assert.equal(await page.locator('.todo-unscheduled .todo-task').count(), n);
  });

  it('drawing and note containers are refused on a to-do page', async () => {
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
