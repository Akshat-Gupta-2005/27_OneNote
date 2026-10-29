// Presses every shortcut listed in Help → Keyboard shortcuts (SHORTCUTS in app.js), with real
// clicks to put focus where a person's would be. Includes the P13 regressions (Delete/F2 on lists).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, waitSaved, api } from './helpers.mjs';

describe('keyboard shortcuts', () => {
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

  const pageNames = () => page.$$eval('#pageList .page-name', (e) => e.map((x) => x.textContent));
  const html = () => page.evaluate(() => document.activeElement.closest('.nb-content')?.innerHTML ?? '');
  /** A fresh container with one line of text selected, ready for a formatting shortcut. */
  async function freshLine(text, y = 300) {
    await page.click('.rtab[data-tab="home"]');
    await page.mouse.click(1100, y);
    await page.keyboard.type(text);
    await page.keyboard.down('Shift');
    await page.keyboard.press('Home');
    await page.keyboard.up('Shift');
  }
  /** Back to the notebooks pane, so one failed test can't leave the next looking at search. */
  async function showNotebooks() {
    if (!(await page.isVisible('#sectionList'))) await page.click('.rail-btn[data-pane="notebooks"]');
    await page.waitForSelector('#sectionList', { state: 'visible' });
  }
  async function newBlankPage(title) {
    await page.click('#addPage');
    await page.waitForFunction(() => document.activeElement?.id === 'pageTitle');
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
  }

  it('the shortcuts dialog lists every group (36 shortcuts)', async () => {
    await page.click('.rtab[data-tab="help"]');
    await page.click('[data-cmd="shortcuts"]');
    const groups = await page.$$eval('.kbd-group th', (e) => e.map((x) => x.textContent));
    assert.deepEqual(groups, ['Anywhere', 'Typing on a page', 'Section and page lists', 'To-do planner', 'Cards']);
    assert.equal(await page.locator('.kbd-table tr:not(.kbd-group)').count(), 36);
    await page.click('.modal .btn:has-text("Close")');
  });

  // ---------- anywhere ----------
  it('Ctrl+Alt+N creates a page and focuses its title', async () => {
    const before = (await pageNames()).length;
    await page.click('#canvas', { position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press('Control+Alt+n');
    await page.waitForFunction(() => document.activeElement?.id === 'pageTitle');
    assert.equal((await pageNames()).length, before + 1);
    await page.keyboard.type('Shortcut lab');
    await page.keyboard.press('Enter');
  });

  it('Ctrl+E opens search with the box focused', async () => {
    await page.keyboard.press('Control+e');
    // The app focuses the box on the next tick, so wait for it rather than reading it at once.
    await page.waitForFunction(() => document.activeElement?.id === 'searchInput', null, { timeout: 2000 });
    await showNotebooks();
  });

  it('Ctrl+S saves immediately', async () => {
    await page.mouse.click(1100, 200);
    await page.keyboard.type('save me');
    const req = page.waitForRequest((r) => r.method() === 'PATCH', { timeout: 400 }); // well under the 600 ms debounce
    await page.keyboard.press('Control+s');
    await req;
    await waitSaved(page);
  });

  it('Esc leaves draw mode', async () => {
    await page.click('.rtab[data-tab="draw"]');
    await page.click('[data-cmd="modePen"]');
    assert.ok(await page.evaluate(() => document.getElementById('pageInner').classList.contains('draw')));
    await page.keyboard.press('Escape');
    assert.ok(!(await page.evaluate(() => document.getElementById('pageInner').classList.contains('draw'))));
  });

  // ---------- typing ----------
  it('Ctrl+B / I / U', async () => {
    await freshLine('styled');
    await page.keyboard.press('Control+b');
    await page.keyboard.press('Control+i');
    await page.keyboard.press('Control+u');
    const h = await html();
    assert.match(h, /<b>/);
    assert.match(h, /<i>/);
    assert.match(h, /<u>/);
  });

  it('Ctrl+Alt+H highlights', async () => {
    await freshLine('marked', 360);
    await page.keyboard.press('Control+Alt+h');
    assert.match(await html(), /background-color: rgba\(255, 235, 59/);
  });

  it('Ctrl+K opens the link dialog', async () => {
    await freshLine('link me', 420);
    await page.keyboard.press('Control+k');
    await page.waitForSelector('.modal .modal-title:has-text("Insert link")');
    await page.keyboard.press('Escape');
  });

  it('Ctrl+. bullets and Ctrl+/ numbering', async () => {
    await freshLine('bulleted', 480);
    await page.keyboard.press('Control+.');
    assert.match(await html(), /<ul>/);
    await freshLine('numbered', 540);
    await page.keyboard.press('Control+/');
    assert.match(await html(), /<ol>/);
  });

  it('Tab indents and Shift+Tab outdents', async () => {
    await freshLine('indented', 600);
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    assert.match(await html(), /<blockquote/);
    await page.keyboard.press('Shift+Tab');
    assert.doesNotMatch(await html(), /<blockquote/);
  });

  it('Ctrl+1 / 2 / 3 tag the line To Do / Important / Question', async () => {
    for (const [key, tag, y] of [['1', 'todo', 660], ['2', 'important', 700], ['3', 'question', 740]]) {
      await freshLine(`tag ${tag}`, y);
      await page.keyboard.press(`Control+${key}`);
      assert.match(await html(), new RegExp(`data-tag="${tag}"`));
    }
  });

  it('Ctrl+Alt+1…6 set headings and Ctrl+Alt+0 sets normal text', async () => {
    await freshLine('heading', 260);
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await page.keyboard.press(`Control+Alt+${n}`);
      assert.match(await html(), new RegExp(`<h${n}>heading</h${n}>`));
    }
    await page.keyboard.press('Control+Alt+0');
    assert.match(await html(), /<div>heading<\/div>/);
  });

  it('Alt+Shift+D / T / F insert date, time, both', async () => {
    await page.mouse.click(1300, 300);
    await page.keyboard.press('Alt+Shift+d');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Alt+Shift+t');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Alt+Shift+f');
    const text = await page.evaluate(() => document.activeElement.innerText);
    const year = String(new Date().getFullYear());
    assert.equal(text.split(year).length - 1, 2, `date and date+time both contain the year: ${text}`);
    assert.match(text, /\d{1,2}:\d{2}/);
  });

  it('Ctrl+Z undoes and Ctrl+Y redoes', async () => {
    // One atomic edit (Bold), because Chrome groups quick typing into undo steps unpredictably.
    await freshLine('abc', 420);
    await page.keyboard.press('Control+b');
    assert.match(await html(), /<b>abc<\/b>/);
    await page.keyboard.press('Control+z');
    assert.doesNotMatch(await html(), /<b>/);
    await page.keyboard.press('Control+y');
    assert.match(await html(), /<b>abc<\/b>/);
  });

  it('arrows move the selected container: 1 px, or 10 px with Shift', async () => {
    await page.click('.nb-content:has-text("abc")');
    await page.keyboard.press('Escape');
    const pos = () => page.evaluate(() => { const b = document.activeElement.parentElement; return [parseFloat(b.style.left), parseFloat(b.style.top)]; });
    const [x0, y0] = await pos();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('ArrowUp');
    assert.deepEqual(await pos(), [x0 + 3, y0 + 9]);
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('nb-handle')), 'still selected');
    await waitSaved(page);
  });

  it('Esc selects the container and Delete removes it', async () => {
    const before = await page.locator('.nb').count();
    await page.click('.nb-content:has-text("abc")');
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('nb-handle')));
    await page.keyboard.press('Delete');
    assert.equal(await page.locator('.nb').count(), before - 1);
  });

  // ---------- lists (P13) ----------
  it('pages: Delete on a clicked page deletes it, and Undo restores it', async () => {
    await showNotebooks();
    await newBlankPage('Delete me');
    await waitSaved(page);
    await page.click('#pageList .page-item:has-text("Delete me")');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Delete me', 'clicking a page focuses it');
    await page.keyboard.press('Delete');
    await page.waitForFunction(() => ![...document.querySelectorAll('#pageList .page-name')].some((e) => e.textContent === 'Delete me'));
    assert.ok((await api(server.url, 'GET', '/trash')).json.some((p) => p.title === 'Delete me'));
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('page-item')), 'focus stays in the list');
    // The page's own toast: the container deleted in the previous test has an Undo toast too.
    await page.click('.toast:has-text("Delete me") .toast-action');
    await page.waitForFunction(() => [...document.querySelectorAll('#pageList .page-name')].some((e) => e.textContent === 'Delete me'));
  });

  it('pages: ↑ / ↓ / Home / End move and open; F2 and Enter go to the title', async () => {
    await showNotebooks();
    await page.click('#pageList .page-item >> nth=0');
    const names = await pageNames();
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction((n) => document.getElementById('pageTitle').textContent === n, names[1]);
    await page.keyboard.press('End');
    await page.waitForFunction((n) => document.getElementById('pageTitle').textContent === n, names.at(-1));
    await page.keyboard.press('Home');
    await page.waitForFunction((n) => document.getElementById('pageTitle').textContent === n, names[0]);
    await page.keyboard.press('ArrowUp'); // already first: stays
    assert.equal(await page.textContent('#pageTitle'), names[0]);
    await page.keyboard.press('F2');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pageTitle');
    await page.click('#pageList .page-item.active');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'pageTitle');
  });

  it('sections: F2 renames, ↓ opens the next section, Delete asks first, Enter goes to pages', async () => {
    await showNotebooks();
    await page.click('#sectionList .sec-item >> nth=0');
    await page.keyboard.press('F2');
    assert.equal(await page.locator('#sectionList .rename-input').count(), 1, 'F2 shows the rename box (P13)');
    await page.keyboard.press('Escape');
    await page.click('#sectionList .sec-item >> nth=0');
    await page.keyboard.press('ArrowDown');
    await page.waitForFunction(() => document.querySelector('#sectionList .sec-item.active')?.textContent === 'New Section 1');
    await page.keyboard.press('Delete');
    await page.waitForSelector('.modal .modal-title:has-text("Delete section?")');
    await page.click('.modal .btn:has-text("Cancel")');
    assert.equal(await page.locator('#sectionList .sec-item').count(), 2);
    await page.click('#sectionList .sec-item:has-text("Quick Notes")'); // New Section 1 has no pages to go into
    await page.waitForFunction(() => document.querySelector('#pageList .page-item'));
    await page.keyboard.press('Enter');
    assert.ok(await page.evaluate(() => document.activeElement.classList.contains('page-item')));
  });

  // ---------- planner ----------
  it('planner: Enter/F2 edit a focused task and Delete removes it', async () => {
    await showNotebooks();
    await page.click('#addPageMenu');
    await page.click('.menu .menu-item:has-text("To-do planner")');
    await page.waitForSelector('.todo-view');
    await page.locator('.todo-group [data-act="add"]').first().click();
    const box = page.locator('.todo-composer input').first();
    for (const t of ['First task', 'Second task']) { await box.fill(t); await box.press('Enter'); }
    await page.focus('.todo-text:has-text("First task")');
    await page.keyboard.press('Enter');
    await page.waitForSelector('.todo-edit');
    await page.keyboard.press('Escape');
    await page.focus('.todo-text:has-text("First task")');
    await page.keyboard.press('F2');
    await page.waitForSelector('.todo-edit');
    await page.keyboard.press('Escape');
    await page.focus('.todo-text:has-text("First task")');
    await page.keyboard.press('Delete');
    assert.deepEqual(await page.$$eval('.todo-text', (e) => e.map((x) => x.textContent)), ['Second task']);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Second task', 'focus moves to the next task');
    assert.deepEqual(page.errors, []);
  });
});
