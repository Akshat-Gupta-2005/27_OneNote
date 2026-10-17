import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launchBrowser, newPage, openApp, api } from './helpers.mjs';

describe('Theme tab', () => {
  let server;
  let browser;
  let page;

  before(async () => {
    server = await startServer();
    browser = await launchBrowser();
    page = await newPage(browser);
    await openApp(page, server.url);
    await page.click('.rtab[data-tab="theme"]');
  });
  after(async () => {
    await browser?.close();
    await server?.stop();
  });

  const cssVar = (name) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  const settings = async () => (await api(server.url, 'GET', '/settings')).json.appearance;
  const waitSettings = (fn) => page.waitForFunction(() => true).then(async () => {
    for (let i = 0; i < 40; i++) {
      const a = await settings();
      if (a && fn(a)) return a;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('appearance was not saved to the server');
  });

  it('sits between View and Help', async () => {
    const tabs = await page.$$eval('.rtab', (t) => t.map((x) => x.textContent));
    assert.deepEqual(tabs, ['Home', 'Insert', 'Draw', 'View', 'Theme', 'Help']);
    assert.equal(await page.isVisible('[data-panel="theme"]'), true);
    assert.equal(await page.textContent('#schemeName'), 'Classic Dark');
  });

  it('every built-in scheme passes its own contrast checks, and derivation fixes a weak accent', async () => {
    const r = await page.evaluate(async () => {
      const t = await import('/js/theme.js');
      const failures = t.SCHEMES.flatMap((s) => t.contrastReport(s).filter(([, ratio, min]) => ratio < min).map(([l]) => `${s.id}: ${l}`));
      // A pale accent on pale panels would make the selected-section label unreadable.
      const weak = { base: 'light', seeds: { accent: '#ffe08a', canvas: '#ffffff', panel: '#f5f5f5', chrome: '#eeeeee', text: '#222222', heading: '#ffd54f', link: '#9ad0ff', todo: '#2e7d32' } };
      const d = t.deriveTokens(weak);
      return { failures, accentText: t.contrast(d['accent-text'], weak.seeds.panel), link: t.contrast(d.link, weak.seeds.canvas), h1: t.contrast(d.h1, weak.seeds.canvas) };
    });
    assert.deepEqual(r.failures, []);
    assert.ok(r.accentText >= 4.5, `accent text ${r.accentText}`);
    assert.ok(r.link >= 4.5, `link ${r.link}`);
    assert.ok(r.h1 >= 3, `heading ${r.h1}`);
  });

  it('gallery: hovering previews a scheme, leaving restores it', async () => {
    const before = await cssVar('--canvas');
    await page.click('[data-drop="schemes"]');
    await page.hover('[data-scheme-card="arctic"]');
    assert.equal(await cssVar('--canvas'), '#2e3440');
    await page.mouse.move(1300, 800);
    await page.keyboard.press('Escape');
    assert.equal(await cssVar('--canvas'), before);
    assert.equal(await page.textContent('#schemeName'), 'Classic Dark');
  });

  it('picking a scheme applies it everywhere and saves it on the server', async () => {
    await page.click('[data-drop="schemes"]');
    await page.click('[data-scheme-card="paper"]');
    assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
    assert.equal(await cssVar('--canvas'), '#fbf6ec');
    assert.equal(await page.textContent('#schemeName'), 'Paper');
    const a = await waitSettings((x) => x.scheme === 'paper');
    assert.equal(a.followSystem, false);
  });

  it('quick swatches switch schemes in one click', async () => {
    await page.click('#schemeQuick [data-scheme="midnight"]');
    assert.equal(await cssVar('--canvas'), '#1a1b26');
    assert.equal(await page.getAttribute('#schemeQuick [data-scheme="midnight"]', 'aria-pressed'), 'true');
  });

  it('looks: a preset sets every knob; changing one knob makes it Custom', async () => {
    await page.click('[data-drop="looks"]');
    await page.click('.menu .menu-item:has-text("Compact")');
    assert.equal(await page.getAttribute('html', 'data-density'), 'compact');
    assert.equal(await page.$eval('.sec-item', (el) => el.getBoundingClientRect().height), 30);
    assert.equal(await page.textContent('#lookName'), 'Look: Compact');

    await page.click('[data-drop="look-page"]');
    await page.click('.menu .menu-item:has-text("Paper sheet")');
    assert.notEqual(await page.$eval('#pageInner', (el) => getComputedStyle(el).boxShadow), 'none');
    assert.equal(await page.textContent('#lookName'), 'Look: Custom');

    await page.click('[data-drop="look-tabs"]');
    await page.click('.menu .menu-item:has-text("Dot")');
    assert.equal(await page.$eval('.sec-tab', (el) => getComputedStyle(el).borderRadius), '50%');

    await page.click('[data-drop="look-font"]');
    await page.click('.menu .menu-item:has-text("Georgia")');
    assert.match(await page.$eval('body', (el) => getComputedStyle(el).fontFamily), /^Georgia/);

    const a = await waitSettings((x) => x.look.font === 'georgia');
    assert.deepEqual(a.look, { density: 'compact', corners: 'square', font: 'georgia', page: 'paper', tabs: 'dot' });
  });

  it('create theme: live preview, contrast warning, editor stays readable, saved and selected', async () => {
    const panelBefore = await cssVar('--menu-bg');
    await page.click('[data-cmd="themeNew"]');
    await page.waitForSelector('.theme-editor');
    await page.fill('.theme-editor input[aria-label="Theme name"]', 'Sunset');
    await page.fill('[data-seed="accent"]', '#ff6b35');
    assert.equal(await cssVar('--accent'), '#ff6b35', 'the app previews the accent live');
    // Make text unreadable on the page: the editor must warn, and must itself stay readable.
    await page.fill('[data-seed="canvas"]', '#202020');
    await page.fill('[data-seed="text"]', '#2a2a2a');
    assert.match(await page.textContent('.contrast-list'), /Text on page\s*1\.\d:1 ⚠/);
    assert.equal(await page.$eval('.theme-editor', (el) => getComputedStyle(el).getPropertyValue('--menu-bg').trim()), panelBefore);
    await page.fill('[data-seed="text"]', '#f0f0f0');
    assert.match(await page.textContent('.contrast-list'), /Text on page\s*\d+\.\d:1 ✓/);
    await page.click('.modal .btn.primary');
    assert.equal(await page.textContent('#schemeName'), 'Sunset');
    assert.equal(await page.isDisabled('#themeEditBtn'), false);
    const a = await waitSettings((x) => x.custom.length === 1);
    assert.equal(a.custom[0].name, 'Sunset');
    assert.equal(a.custom[0].seeds.accent, '#ff6b35');
    assert.equal(a.scheme, a.custom[0].id);
  });

  it('cancelling the editor restores the previous colors', async () => {
    const before = await cssVar('--canvas');
    await page.click('[data-cmd="themeEdit"]');
    await page.waitForSelector('.theme-editor');
    await page.fill('[data-seed="canvas"]', '#00ff00');
    assert.equal(await cssVar('--canvas'), '#00ff00');
    await page.click('.modal .btn:has-text("Cancel")');
    assert.equal(await cssVar('--canvas'), before);
  });

  it('the theme and look survive a reload, and are applied before the app script runs', async () => {
    await page.reload();
    await page.waitForSelector('.nb');
    assert.equal(await page.textContent('#schemeName'), 'Sunset');
    assert.equal(await cssVar('--accent'), '#ff6b35');
    // First paint: with app.js blocked, only the inline script in index.html can apply the cache.
    const bare = await newPage(browser);
    await bare.goto(server.url);
    await bare.evaluate((cache) => localStorage.setItem('oc.appearance', cache), await page.evaluate(() => localStorage.getItem('oc.appearance')));
    await bare.route('**/js/app.js', (r) => r.abort());
    await bare.reload();
    const early = await bare.evaluate(() => ({
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
      density: document.documentElement.dataset.density,
    }));
    assert.deepEqual(early, { accent: '#ff6b35', density: 'compact' });
    await bare.context().close();
  });

  it('theme code copies out and imports back as a new theme; bad codes are refused', async () => {
    const code = await page.evaluate(async () => {
      const t = await import('/js/theme.js');
      return t.themeCode(t.activeScheme());
    });
    await page.click('[data-cmd="themeImport"]');
    await page.fill('.modal input', code.replace('Sunset', 'Sunset 2'));
    await page.click('.modal .btn.primary');
    assert.equal(await page.textContent('#schemeName'), 'Sunset 2');
    await page.click('[data-cmd="themeImport"]');
    await page.fill('.modal input', '{"name":"bad","seeds":{"accent":"red"}}');
    await page.click('.modal .btn.primary');
    await page.waitForSelector('.toast:has-text("not a valid theme code")');
    assert.equal((await waitSettings((x) => x.custom.length === 2)).custom.length, 2);
  });

  it('deleting the active custom theme falls back to the Classic scheme of the same base', async () => {
    await page.click('[data-drop="schemes"]');
    const card = page.locator('.scheme-card:has-text("Sunset 2")');
    await card.hover();
    await card.locator('.card-more').click();
    await page.click('.menu .menu-item:has-text("Delete")');
    await page.click('.modal .btn:has-text("Delete theme")');
    assert.equal(await page.textContent('#schemeName'), 'Classic Dark');
    assert.equal((await waitSettings((x) => x.custom.length === 1)).scheme, 'classic-dark');
  });

  it('match system follows the OS light/dark setting', async () => {
    await page.click('[data-drop="schemes"]');
    await page.click('[data-follow-system]'); // toggling closes the gallery, so check() would wait forever
    await page.emulateMedia({ colorScheme: 'light' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
    assert.equal(await page.textContent('#schemeName'), 'System (Classic Light)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await cssVar('--canvas'), '#1e1e1e');
  });

  it('reset returns to Classic Dark + Classic look and keeps your themes', async () => {
    await page.click('[data-cmd="themeReset"]');
    await page.click('.modal .btn:has-text("Reset")');
    assert.equal(await page.textContent('#schemeName'), 'Classic Dark');
    assert.equal(await page.textContent('#lookName'), 'Look: Classic');
    const a = await waitSettings((x) => x.scheme === 'classic-dark' && !x.followSystem && x.look.density === 'comfortable');
    assert.equal(a.custom.length, 1);
    assert.deepEqual(page.errors, []);
  });
});
