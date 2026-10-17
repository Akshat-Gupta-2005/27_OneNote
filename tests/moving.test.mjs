// Moving things, consistently across page types: planner tasks and board lists can be dragged and
// moved with Alt+arrows (like board cards and freeform containers already could), and the Cards
// composer understands the planner's #/@ quick syntax.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, addFromTemplate, waitSaved } from './helpers.mjs';

const pad = (n) => String(n).padStart(2, '0');
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const iso = (d) => `${monthKey(d)}-${pad(d.getDate())}`;

describe('planner: moving tasks', () => {
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

  const inGroup = (key) => page.$$eval(`.todo-group[data-key="${key}"] .todo-text`, (e) => e.map((x) => x.textContent));
  const add = async (key, text) => {
    const box = page.locator(`.todo-composer[data-key="${key}"] input`);
    if (!(await box.count())) await page.click(`.todo-group[data-key="${key}"] [data-act="add"]`);
    await box.fill(text);
    await box.press('Enter');
  };
  const row = (text) => page.locator(`.todo-task:has(.todo-text:text-is("${text}"))`);
  // Drop just above the bottom edge of a group's list: "at the end of this group".
  const dropAtEnd = async (task, key) => {
    const list = page.locator(`.todo-group[data-key="${key}"] .todo-list`);
    const box = await list.boundingBox();
    await task.dragTo(list, { targetPosition: { x: 60, y: Math.max(1, box.height - 2) } });
  };

  it('add boxes advertise the quick syntax', async () => {
    await page.click(`.todo-group[data-key="${cur}"] [data-act="add"]`);
    assert.match(await page.getAttribute(`.todo-composer[data-key="${cur}"] input`, 'placeholder'), /#tag @date/);
  });

  it('drag reorders inside a month', async () => {
    for (const t of ['Alpha', 'Bravo', 'Charlie']) await add(cur, t);
    await row('Charlie').dragTo(row('Alpha'), { targetPosition: { x: 40, y: 4 } });
    assert.deepEqual(await inGroup(cur), ['Charlie', 'Alpha', 'Bravo']);
  });

  it('drag into another month moves the task there and drops a date outside that month', async () => {
    const day = new Date(now.getFullYear(), now.getMonth(), Math.min(now.getDate(), 28));
    await add(cur, `Dated @${iso(day)}`);
    await dropAtEnd(row('Dated'), next);
    assert.deepEqual(await inGroup(next), ['Dated']);
    assert.equal(await row('Dated').locator('.todo-chip.date').count(), 0, 'the old date no longer fits the month, so it is cleared');
  });

  it('Alt+↑/↓ reorder and Alt+←/→ move between groups, keeping focus on the task', async () => {
    await row('Bravo').locator('.todo-text').focus();
    await page.keyboard.press('Alt+ArrowUp');
    assert.deepEqual(await inGroup(cur), ['Charlie', 'Bravo', 'Alpha']);
    await page.keyboard.press('Alt+ArrowDown');
    assert.deepEqual(await inGroup(cur), ['Charlie', 'Alpha', 'Bravo']);
    await page.keyboard.press('Alt+ArrowRight');
    assert.deepEqual(await inGroup(next), ['Dated', 'Bravo']);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Bravo');
    await page.keyboard.press('Alt+ArrowLeft');
    assert.deepEqual(await inGroup(cur), ['Charlie', 'Alpha', 'Bravo']);
  });

  it('date view: dropping on a date gives the task that date; dropping on "No date" clears it', async () => {
    await page.click('[data-view="date"]');
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3);
    await add('nodate', `Anchor @${iso(target)}`);
    await dropAtEnd(row('Alpha'), `d-${iso(target)}`);
    assert.deepEqual(await inGroup(`d-${iso(target)}`), ['Anchor', 'Alpha']);
    await dropAtEnd(row('Alpha'), 'nodate');
    assert.ok((await inGroup('nodate')).includes('Alpha'));
  });

  it('tag view: dropping on a tag sets it; "No tag" removes it', async () => {
    await page.click('[data-view="tag"]');
    await add('t-', 'Tagged #Work');
    await dropAtEnd(row('Charlie'), 't-Work');
    assert.deepEqual(await inGroup('t-Work'), ['Tagged', 'Charlie']);
    await dropAtEnd(row('Charlie'), 't-');
    assert.ok((await inGroup('t-')).includes('Charlie'));
  });

  it('the new order and groups survive a reload', async () => {
    await page.click('[data-view="month"]');
    const before = { cur: await inGroup(cur), next: await inGroup(next) };
    await waitSaved(page);
    await page.reload();
    await page.waitForSelector('.todo-view');
    assert.deepEqual({ cur: await inGroup(cur), next: await inGroup(next) }, before);
    assert.deepEqual(page.errors, []);
  });
});

describe('cards: moving lists and quick add', () => {
  let server;
  let browser;
  let page;

  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
    page = await newPage(browser);
    await openApp(page, server.url);
    await addFromTemplate(page, 'Cards');
    await page.waitForSelector('.board-view');
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const listTitles = () => page.$$eval('.board-col-title', (e) => e.map((x) => x.textContent));
  const head = (name) => page.locator(`.board-col:has(.board-col-title:text-is("${name}")) .board-col-head`);
  const addCard = async (list, text) => {
    await page.locator(`.board-col:has(.board-col-title:text-is("${list}")) [data-act="open-composer"]`).click();
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
  };

  it('drag a list by its header to reorder lists', async () => {
    await head('Done').dragTo(head('To do'), { targetPosition: { x: 10, y: 10 } });
    assert.deepEqual(await listTitles(), ['Done', 'To do', 'Doing']);
  });

  it('Alt+←/→ on a list title moves the list and keeps focus on it', async () => {
    await page.focus('.board-col-title:text-is("Done")');
    await page.keyboard.press('Alt+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    assert.deepEqual(await listTitles(), ['To do', 'Doing', 'Done']);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Done');
    await page.keyboard.press('Alt+ArrowLeft');
    assert.deepEqual(await listTitles(), ['To do', 'Done', 'Doing']);
    await page.keyboard.press('Alt+ArrowRight');
  });

  it('the composer understands #color labels and @dates, like the planner', async () => {
    assert.match(await page.locator('[data-act="open-composer"]').first().evaluate(async (btn) => { btn.click(); await new Promise((r) => setTimeout(r, 50)); return document.querySelector('[data-composer]').placeholder; }), /#label @date/);
    await page.keyboard.press('Escape');
    await addCard('To do', 'Fix login #red #blue @20 Oct');
    const card = page.locator('.board-card:has(.card-title:text-is("Fix login"))');
    assert.equal(await card.count(), 1, 'the symbols are removed from the title');
    assert.deepEqual(await card.locator('.card-label').evaluateAll((l) => l.map((x) => x.title)), ['Red', 'Blue']);
    assert.match(await card.locator('.card-badge.due').textContent(), /Oct 20/);
  });

  it('an unknown #word becomes the name of an unused label, and is reused after that', async () => {
    await addCard('To do', 'Build API #Backend');
    await page.waitForSelector('.toast:has-text("New label \\"Backend\\"")');
    const first = page.locator('.board-card:has(.card-title:text-is("Build API")) .card-label');
    assert.equal(await first.getAttribute('title'), 'Backend');
    await addCard('Doing', 'Write tests #backend');
    const second = page.locator('.board-card:has(.card-title:text-is("Write tests")) .card-label');
    assert.equal(await second.evaluate((el) => el.style.getPropertyValue('--l')), await first.evaluate((el) => el.style.getPropertyValue('--l')), 'same label, matched by name');
  });

  it('a line with only symbols adds nothing', async () => {
    const before = await page.locator('.board-card').count();
    await addCard('Done', '#red @today');
    await page.waitForSelector('.toast:has-text("Type the card title too")');
    assert.equal(await page.locator('.board-card').count(), before);
  });

  it('list order and cards survive a reload', async () => {
    await waitSaved(page);
    const titles = await listTitles();
    await page.reload();
    await page.waitForSelector('.board-view');
    assert.deepEqual(await listTitles(), titles);
    assert.equal(await page.locator('.board-card').count(), 3);
    assert.deepEqual(page.errors, []);
  });
});
