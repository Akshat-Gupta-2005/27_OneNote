// Tab pages: money with people. Uses the owner's real "Adarsh" list as the example data.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, addFromTemplate, waitSaved, api } from './helpers.mjs';

describe('Tab', () => {
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

  const col = (name) => page.locator(`.tab-col:has(.board-col-title:text-is("${name}"))`);
  const balance = (name) => col(name).locator('.tab-balance strong').textContent();
  /** Where a person's item list starts, measured from the top of their list. */
  const headHeight = (name) => col(name).evaluate((el) => Math.round(el.querySelector('.board-cards').getBoundingClientRect().top - el.getBoundingClientRect().top));
  let emptyHead = null;
  /** [name, amount] for every open item of a person. */
  const items = (name) => col(name).locator('.tab-item').evaluateAll((els) => els.map((el) => [
    el.querySelector('.tab-name').firstChild.textContent, el.querySelector('.tab-amt').textContent]));
  const item = (person, name) => col(person).locator(`.tab-item:has(.tab-name:text-matches("^${name}"))`);
  async function addItems(person, ...lines) {
    if (!(await col(person).locator('.board-composer').count())) await col(person).locator('[data-act="open-composer"]').click();
    for (const l of lines) {
      await page.keyboard.type(l);
      await page.keyboard.press('Enter');
    }
    await page.keyboard.press('Escape');
  }
  async function personMenu(person, label) {
    await col(person).locator('[data-act="person-menu"]').click();
    await page.click(`.menu .menu-item:has-text("${label}")`);
  }
  /** Enter select mode and tick open items by position. */
  async function select(person, ...indexes) {
    await personMenu(person, 'Select items');
    for (const i of indexes) await col(person).locator('.tab-item').nth(i).click();
  }

  it('parses quick entries the way they are written on a card', async () => {
    const r = await page.evaluate(async () => {
      const { parseTabEntry } = await import('/js/tab.js');
      return ['40 special maggi', '15 3xmasala', '3x5 masala', '- 20 shuttle', '249 + 19 biryaani + maza', 'maggi 30', '1.5x40 milk', '3x maggi', '30']
        .map((s) => parseTabEntry(s));
    });
    assert.deepEqual(r.slice(0, 7), [
      { name: 'special maggi', qty: 1, price: 40, per: 'total', payer: 'me' },
      { name: 'masala', qty: 3, price: 15, per: 'total', payer: 'me' },
      { name: 'masala', qty: 3, price: 5, per: 'unit', payer: 'me' },
      { name: 'shuttle', qty: 1, price: 20, per: 'total', payer: 'him' },
      { name: 'biryaani + maza', qty: 1, price: 268, per: 'total', payer: 'me' },
      { name: 'maggi', qty: 1, price: 30, per: 'total', payer: 'me' },
      { name: 'milk', qty: 1.5, price: 40, per: 'unit', payer: 'me' },
    ]);
    assert.ok(r[7].error, 'a quantity without a price is refused');
    assert.ok(r[8].error, 'a price without a name is refused');
  });

  it('the Tab template starts empty; adding a person opens their add box', async () => {
    await addFromTemplate(page, 'Tab');
    await page.waitForSelector('.tab-view');
    assert.equal(await page.textContent('#pageTitle'), 'Tab');
    assert.equal(await page.locator('.tab-col').count(), 0);
    await page.click('[data-act="open-person-composer"]');
    await page.keyboard.type('Adarsh');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'New item for Adarsh');
    await page.keyboard.press('Escape');
    assert.equal(await balance('Adarsh'), 'All square');
    assert.equal(await col('Adarsh').locator('.tab-paid').textContent(), 'You paid 0 · Adarsh paid 0');
    emptyHead = await headHeight('Adarsh');
  });

  it('adds items with quick entry and shows who owes whom', async () => {
    await addItems('Adarsh', '40 special maggi', '30 maggi', '30 maggi', '15 3xmasala', '-20 shuttle', '249 + 19 biryaani + maza', '106 maggi');
    assert.deepEqual(await items('Adarsh'), [
      ['special maggi', '40'], ['maggi', '30'], ['maggi', '30'], ['masala', '15'], ['shuttle', '−20'], ['biryaani + maza', '268'], ['maggi', '106'],
    ]);
    assert.equal(await balance('Adarsh'), 'Adarsh owes you 469');
    assert.equal(await col('Adarsh').locator('.tab-paid').textContent(), 'You paid 489 · Adarsh paid 20');
    assert.match(await item('Adarsh', 'masala').textContent(), /×3/);
    assert.match(await item('Adarsh', 'shuttle').textContent(), /Adarsh paid/);
    assert.equal(await page.textContent('.tab-summary'), 'Owed to you 469 · You owe 0');
    assert.equal(await headHeight('Adarsh'), emptyHead, 'the first item does not push the list down');
  });

  it('green for what they owe you, red for what you owe; one line per item; tags just left of the amount', async () => {
    const look = await col('Adarsh').locator('.tab-item').evaluateAll((els) => els.map((el) => ({
      h: Math.round(el.getBoundingClientRect().height),
      amt: el.querySelector('.tab-amt').className,
      beforeAmt: el.querySelector('.tab-amt').previousElementSibling.className,
    })));
    assert.equal(new Set(look.map((x) => x.h)).size, 1, `all items the same height: ${look.map((x) => x.h)}`);
    assert.match(look[4].amt, /money-out/, 'shuttle (Adarsh paid) is red');
    assert.match(look[5].amt, /money-in/, 'biryaani (you paid) is green');
    assert.equal(look[4].beforeAmt, 'tab-tag', 'the "Adarsh paid" tag sits right before the amount');
    const colors = await page.evaluate(() => ({
      in: getComputedStyle(document.querySelector('.tab-amt.money-in')).color,
      out: getComputedStyle(document.querySelector('.tab-amt.money-out')).color,
      balance: getComputedStyle(document.querySelector('.tab-balance.owed strong')).color,
    }));
    assert.notEqual(colors.in, colors.out);
    assert.equal(colors.balance, colors.in, '"Adarsh owes you" is green');
  });

  it('the item dialog keeps qty, each and total in step', async () => {
    await item('Adarsh', 'masala').click();
    const f = (label) => page.locator(`.tab-dialog input[aria-label="${label}"]`);
    assert.equal(await f('Each').inputValue(), '5');
    await f('Quantity').fill('5');
    assert.equal(await f('Each').inputValue(), '3', 'total typed → each = total ÷ qty');
    await f('Each').fill('4');
    assert.equal(await f('Total').inputValue(), '20', 'each typed → total = each × qty');
    await f('Quantity').fill('3');
    assert.equal(await f('Total').inputValue(), '12', 'after typing each, qty changes the total');
    await f('Total').fill('100');
    assert.equal(await f('Each').inputValue(), '33.33');
    await f('Total').fill('15');
    await page.click('.tab-dialog [data-payer="him"]');
    await page.click('.tab-dialog [data-payer="me"]');
    await page.click('.modal .btn:has-text("Done")');
    assert.deepEqual((await items('Adarsh'))[3], ['masala', '15']);
    assert.equal(await balance('Adarsh'), 'Adarsh owes you 469');
  });

  it('combines selected items into one agreed amount, and can split them back', async () => {
    await select('Adarsh', 0, 1, 2, 3, 4);
    assert.equal(await col('Adarsh').locator('.tab-select-sum').textContent(), '5 selected · 95');
    await col('Adarsh').locator('[data-act="combine"]').click();
    assert.match(await page.textContent('.tab-dialog'), /add up to 95/);
    await page.fill('.tab-dialog input[aria-label="Total"]', '106');
    await page.fill('.tab-dialog input[aria-label="Name"]', 'Maggi and masala');
    await page.click('.modal .btn:has-text("Combine")');
    assert.deepEqual(await items('Adarsh'), [['Maggi and masala', '106'], ['biryaani + maza', '268'], ['maggi', '106']]);
    assert.equal(await balance('Adarsh'), 'Adarsh owes you 480');
    assert.match(await item('Adarsh', 'Maggi and masala').textContent(), /5 items/);

    await item('Adarsh', 'Maggi and masala').click();
    assert.equal(await page.locator('.tab-dialog .tab-parts .tab-row').count(), 5);
    await page.click('.modal .btn:has-text("Uncombine")');
    assert.equal(await balance('Adarsh'), 'Adarsh owes you 469');
    await select('Adarsh', 0, 1, 2, 3, 4);
    await col('Adarsh').locator('[data-act="combine"]').click();
    await page.fill('.tab-dialog input[aria-label="Total"]', '106');
    await page.fill('.tab-dialog input[aria-label="Name"]', 'Maggi and masala');
    await page.keyboard.press('Enter');
    assert.equal(await balance('Adarsh'), 'Adarsh owes you 480');
  });

  it('marks some items paid; they fold away and can be put back', async () => {
    await select('Adarsh', 0, 1);
    assert.equal(await col('Adarsh').locator('.tab-select-sum').textContent(), '2 selected · 374');
    await col('Adarsh').locator('[data-act="mark-paid"]').click();
    assert.deepEqual(await items('Adarsh'), [['maggi', '106']]);
    assert.equal(await balance('Adarsh'), 'Adarsh owes you 106');
    const fold = col('Adarsh').locator('.tab-paid-group');
    assert.match(await fold.textContent(), /Paid \d+ \w+ · 374\s*2 items/);
    await fold.locator('[data-act="fold"]').click();
    assert.equal(await fold.locator('.tab-row').count(), 2);
    await fold.locator('[data-act="undo-payment"]').click();
    assert.equal(await col('Adarsh').locator('.tab-paid-group').count(), 0);
    assert.equal(await balance('Adarsh'), 'Adarsh owes you 480');
  });

  it('Settle up pays everything left', async () => {
    await personMenu('Adarsh', 'Settle up');
    assert.equal(await balance('Adarsh'), 'All square');
    assert.equal(await col('Adarsh').locator('.tab-item').count(), 0);
    assert.match(await col('Adarsh').locator('.tab-fold').textContent(), /· 480/);
  });

  it('keyboard: Alt+→ moves an item to the next person, Delete removes it with Undo', async () => {
    await page.click('[data-act="open-person-composer"]');
    await page.keyboard.type('Riya');
    await page.keyboard.press('Enter');
    await page.keyboard.type('60 auto');
    await page.keyboard.press('Enter');
    await page.keyboard.type('-35 chai');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    assert.equal(await balance('Riya'), 'Riya owes you 25');
    await addItems('Adarsh', '50 lunch');
    await item('Adarsh', 'lunch').focus();
    await page.keyboard.press('Alt+ArrowRight');
    assert.deepEqual((await items('Riya')).map(([n]) => n), ['lunch', 'auto', 'chai']);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'lunch50');
    await page.keyboard.press('Delete');
    assert.equal(await balance('Riya'), 'Riya owes you 25');
    await page.click('.toast:has-text("Removed") .toast-action');
    assert.equal(await balance('Riya'), 'Riya owes you 75');
    assert.equal(await page.textContent('.tab-summary'), 'Owed to you 75 · You owe 0');
  });

  it('split maths: every method adds up exactly, and only you ↔ them is recorded', async () => {
    const r = await page.evaluate(async () => {
      const { splitShares, splitRecords } = await import('/js/tab.js');
      return {
        equal: splitShares(100, 'equal', ['', '', '']).shares,
        exact: splitShares(100, 'exact', ['70', '30']).shares,
        exactShort: splitShares(100, 'exact', ['70', '20']).error,
        percent: splitShares(1200, 'percent', ['50', '25', '25']).shares,
        percentBad: splitShares(1200, 'percent', ['50', '40']).error,
        shares: splitShares(90, 'shares', ['2', '1']).shares,
        fraction: splitShares(90, 'fraction', ['1/3', '2/3']).shares,
        fractionBad: splitShares(90, 'fraction', ['1/2', '1/3']).error,
        noTotal: splitShares(0, 'equal', ['']).error,
        iPaid: splitRecords('me', [{ id: 'me', share: 400 }, { id: 'a', share: 400 }, { id: 'r', share: 400 }]),
        hePaid: splitRecords('a', [{ id: 'me', share: 60 }, { id: 'a', share: 30 }, { id: 'r', share: 10 }]),
        hePaidNotMe: splitRecords('a', [{ id: 'a', share: 50 }, { id: 'r', share: 50 }]),
      };
    });
    assert.deepEqual(r.equal, [33.34, 33.33, 33.33], 'leftover cents go to one person, total stays 100');
    assert.deepEqual(r.exact, [70, 30]);
    assert.equal(r.exactShort, '10 left to assign');
    assert.deepEqual(r.percent, [600, 300, 300]);
    assert.equal(r.percentBad, 'Adds up to 90%, needs 100%');
    assert.deepEqual(r.shares, [60, 30]);
    assert.deepEqual(r.fraction, [30, 60]);
    assert.match(r.fractionBad, /needs 1/);
    assert.equal(r.noTotal, 'Enter the total.');
    assert.deepEqual(r.iPaid, [{ person: 'a', share: 400, payer: 'me' }, { person: 'r', share: 400, payer: 'me' }]);
    assert.deepEqual(r.hePaid, [{ person: 'a', share: 60, payer: 'him' }], 'when Adarsh pays, only your share is recorded');
    assert.deepEqual(r.hePaidNotMe, []);
  });

  it('Split a bill: equal three ways adds each person their share, with Undo', async () => {
    const d = (sel) => page.locator(`.split-dialog ${sel}`);
    await page.click('.tab-view [data-act="split"]');
    await d('input[aria-label="What was it for"]').fill('dinner');
    await d('input[aria-label="Total"]').fill('1200');
    assert.deepEqual(await d('.split-share').allTextContents(), ['400', '400', '400']);
    assert.equal(await d('.split-recorded').textContent(), 'Adds: Adarsh owes you 400 · Riya owes you 400');
    await page.click('.modal .btn:has-text("Split")');
    assert.equal(await balance('Adarsh'), 'Adarsh owes you 400');
    assert.equal(await balance('Riya'), 'Riya owes you 475');
    assert.match(await item('Adarsh', 'dinner').textContent(), /split/);
    await page.click('.toast:has-text("Split 1200") .toast-action');
    assert.equal(await balance('Adarsh'), 'All square');
    assert.equal(await balance('Riya'), 'Riya owes you 75');
  });

  it('Split a bill: percent that does not add up cannot be saved', async () => {
    const d = (sel) => page.locator(`.split-dialog ${sel}`);
    await page.click('.tab-view [data-act="split"]');
    await d('input[aria-label="Total"]').fill('100');
    await d('[data-method="percent"]').click();
    assert.deepEqual(await d('.split-share').allTextContents(), ['33.34', '33.33', '33.33'], 'starts evenly at 100%');
    await d('input[aria-label="Me\'s part"]').fill('50');
    await d('input[aria-label="Adarsh\'s part"]').fill('40');
    await d('input[aria-label="Riya\'s part"]').fill('0');
    assert.equal(await d('.split-status').textContent(), 'Adds up to 90%, needs 100%');
    assert.equal(await page.locator('.modal .btn.primary').isDisabled(), true);
    await page.click('.modal .btn:has-text("Cancel")');
  });

  it('Split a bill: when Adarsh pays, by shares, only your share goes on his list', async () => {
    const d = (sel) => page.locator(`.split-dialog ${sel}`);
    await page.click('.tab-view [data-act="split"]');
    await d('input[aria-label="What was it for"]').fill('cab');
    await d('input[aria-label="Total"]').fill('90');
    await d('select[aria-label="Paid by"]').selectOption({ label: 'Adarsh' });
    await d('[data-method="shares"]').click();
    await d('input[aria-label="Include Riya"]').uncheck();
    await d('input[aria-label="Me\'s part"]').fill('2');
    assert.deepEqual(await d('.split-share').allTextContents(), ['60', '30', '']);
    assert.equal(await d('.split-recorded').textContent(), 'Adds: you owe Adarsh 60');
    await page.keyboard.press('Enter');
    assert.equal(await balance('Adarsh'), 'You owe Adarsh 60');
    assert.equal(await balance('Riya'), 'Riya owes you 75', 'Riya was not in this split');
    assert.match(await item('Adarsh', 'cab').locator('.tab-amt').getAttribute('class'), /money-out/);
    await item('Adarsh', 'cab').click();
    assert.match(await page.textContent('.tab-dialog'), /Your share of 90, split 2 ways \(shares\)/);
    await page.click('.modal .btn:has-text("Done")');
  });

  it('everything survives a reload, and item names are searchable', async () => {
    await waitSaved(page);
    await page.reload();
    await page.waitForSelector('.tab-view');
    assert.equal(await balance('Adarsh'), 'You owe Adarsh 60');
    assert.equal(await balance('Riya'), 'Riya owes you 75');
    const hit = (await api(server.url, 'GET', '/search?q=biryaani')).json;
    assert.equal(hit[0]?.title, 'Tab', 'paid and combined items are still searchable');
    assert.deepEqual(page.errors, []);
  });
});
