// Freeform editor behaviour, including a regression test for every editor bug in
// docs/4_decisions.md (P1–P4, P6, P7) and the no-op autosave guard.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, waitSaved } from './helpers.mjs';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVR42mNk+M9Qz0AEYBxVSFQhRhGD/6gBRIUYRQyOGkQUAgAhJwwRfK4RngAAAABJRU5ErkJggg==', 'base64');

describe('freeform editor', () => {
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

  const newBlankPage = async () => {
    await page.click('#addPage');
    await page.waitForFunction(() => document.activeElement?.id === 'pageTitle');
  };
  const html = () => page.$$eval('.nb-content', (els) => els.map((e) => e.innerHTML).join(' || '));

  it('typed text, tags, bold and ink survive a reload', async () => {
    await newBlankPage();
    await page.keyboard.type('Persistence');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Plain line');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Tagged line');
    await page.keyboard.press('Control+1');
    await page.keyboard.down('Shift'); await page.keyboard.press('Home'); await page.keyboard.up('Shift');
    await page.keyboard.press('Control+b');
    await page.click('.rtab[data-tab="draw"]');
    await page.click('[data-cmd="modePen"]');
    await page.mouse.move(800, 600); await page.mouse.down(); await page.mouse.move(900, 640, { steps: 6 }); await page.mouse.up();
    await page.keyboard.press('Escape');
    await page.click('.rtab[data-tab="home"]');
    await waitSaved(page);
    await page.reload();
    await page.waitForSelector('.nb');
    assert.equal(await page.textContent('#pageTitle'), 'Persistence');
    const h = await html();
    assert.match(h, /<div>Plain line<\/div>/);
    assert.match(h, /data-tag="todo"[^>]*><b>Tagged line<\/b>/);
    assert.equal(await page.locator('#inkLayer path').count(), 1);
  });

  it('P1: font size applies the size just chosen, not the previous one', async () => {
    await page.mouse.click(700, 420);
    await page.keyboard.type('Big ');
    await page.keyboard.down('Shift'); await page.keyboard.press('Home'); await page.keyboard.up('Shift');
    await page.fill('#fontSize', '20');
    await page.press('#fontSize', 'Enter');
    assert.match(await html(), /<span style="font-size: 20pt;">Big&nbsp;<\/span>/);
    await page.keyboard.press('End');
    await page.keyboard.type(' small');
    await page.keyboard.down('Shift'); for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
    await page.click('[data-drop="size"]');
    await page.click('.menu .menu-item >> text="8"');
    assert.match(await html(), /<span style="font-size: 8pt;">small<\/span>/);
  });

  it('P2: the caret lands in the first cell after inserting a table', async () => {
    await page.mouse.click(700, 560);
    await page.click('.rtab[data-tab="insert"]');
    await page.click('[data-drop="table"]');
    await page.hover('.table-grid-cells div[data-r="2"][data-c="3"]');
    await page.click('.table-grid-cells div[data-r="2"][data-c="3"]');
    await page.keyboard.type('c1');
    await page.keyboard.press('Tab');
    await page.keyboard.type('c2');
    assert.match(await html(), /<td>c1<\/td><td>c2<\/td>/);
  });

  it('P3: inserted pictures carry no copied inline style', async () => {
    await page.mouse.click(1000, 200);
    await page.keyboard.type('Picture: ');
    await page.click('.rtab[data-tab="insert"]');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-cmd="picture"]')]);
    await chooser.setFiles({ name: 'pic.png', mimeType: 'image/png', buffer: PNG });
    await page.waitForSelector('.nb-content img[src^="/uploads/"]');
    const img = await page.$eval('.nb-content img', (i) => i.outerHTML);
    assert.doesNotMatch(img, /style=|data-new/);
    await page.click('.rtab[data-tab="home"]');
  });

  it('P4: pasted HTML is sanitised and src-less images are dropped', async () => {
    await page.mouse.click(1100, 300);
    const out = await page.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/html', '<p style="color:black">Pasted <script>alert(1)</script><img src=x onerror="alert(1)"><img src="javascript:alert(1)"> <a href="javascript:alert(1)">bad</a> <a href="https://example.com" onclick="x()">good</a></p>');
      document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
      return document.activeElement.innerHTML;
    });
    assert.doesNotMatch(out, /<script|onerror|onclick|javascript:|<img|color:/);
    assert.match(out, /<a href="https:\/\/example.com">good<\/a>/);
  });

  it('clicking the canvas without typing does not save', async () => {
    await waitSaved(page);
    const patches = [];
    const onReq = (r) => { if (r.method() === 'PATCH') patches.push(r.url()); };
    page.on('request', onReq);
    for (let i = 0; i < 3; i++) await page.mouse.click(1000 + i * 40, 700);
    await page.mouse.click(300, 160);
    await page.waitForTimeout(1200);
    page.off('request', onReq);
    assert.equal(patches.length, 0);
    assert.equal(await page.$$eval('.nb', (b) => b.filter((x) => !x.textContent.trim() && !x.querySelector('img, table')).length), 0, 'empty containers are discarded');
  });

  it('P6: at phone width the page fits the screen and the ribbon tabs scroll', async () => {
    const phone = await newPage(browser, { viewport: { width: 390, height: 800 } });
    await openApp(phone, server.url);
    const m = await phone.evaluate(() => ({
      app: document.querySelector('.app').getBoundingClientRect().width,
      scroll: document.querySelector('.ribbon-tabs').scrollWidth,
      client: document.querySelector('.ribbon-tabs').clientWidth,
    }));
    assert.equal(m.app, 390);
    assert.equal(m.client, 390);
    assert.ok(m.scroll > m.client, `ribbon tabs should overflow and scroll (scroll ${m.scroll}, client ${m.client})`);
    await phone.context().close();
  });

  it('no console errors during the run', () => {
    assert.deepEqual(page.errors, []);
  });
});

describe('server outage while editing (P7)', () => {
  it('shows one toast per outage, then saves the edits once the server is back', async () => {
    let server = await startServer();
    const browser = await launchBrowser();
    try {
      const page = await newPage(browser);
      await openApp(page, server.url);
      await page.evaluate(() => {
        window.__toasts = 0;
        new MutationObserver((rs) => rs.forEach((r) => { window.__toasts += r.addedNodes.length; }))
          .observe(document.getElementById('toasts'), { childList: true });
      });
      const { port, dataDir } = server;
      await server.stop({ keepData: true });
      await page.mouse.click(900, 320);
      await page.keyboard.type('typed while server down');
      await page.waitForTimeout(9500); // first save + 2 retries at 4 s
      assert.equal(await page.textContent('#saveStatus'), "Couldn't save — retrying");
      assert.equal(await page.evaluate(() => window.__toasts), 1);
      server = await startServer({ port, dataDir });
      await page.waitForFunction(() => document.getElementById('saveStatus').textContent === 'All changes saved', null, { timeout: 8000 });
      await page.reload();
      await page.waitForSelector('.nb');
      assert.ok((await page.$$eval('.nb-content', (e) => e.map((x) => x.textContent))).some((t) => t.includes('typed while server down')));
    } finally {
      await browser.close();
      await server.stop();
    }
  });
});
