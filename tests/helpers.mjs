// Shared test harness: a throwaway server (own port, own temp DATA_DIR) and the installed
// Chrome (or Edge) driven by playwright-core. Nothing here touches ./data.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

/** Start `node server/index.js` on a free port with a fresh temp data dir. */
export async function startServer({ port, dataDir } = {}) {
  port ??= await freePort();
  dataDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'oc-test-'));
  const proc = spawn(process.execPath, ['server/index.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', DATA_DIR: dataDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  proc.stdout.on('data', (d) => { output += d; });
  proc.stderr.on('data', (d) => { output += d; });
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10000;
  for (;;) {
    if (proc.exitCode !== null) throw new Error(`server exited early:\n${output}`);
    try {
      const res = await fetch(`${url}/api/notebooks`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) throw new Error(`server did not start:\n${output}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    url,
    port,
    dataDir,
    proc,
    output: () => output,
    async stop({ keepData = false } = {}) {
      // A process killed by a signal has exitCode === null but signalCode set; checking only
      // exitCode made a second stop() wait forever for an 'exit' that had already fired.
      if (proc.exitCode === null && proc.signalCode === null) {
        proc.kill();
        await new Promise((r) => proc.once('exit', r));
      }
      if (!keepData) fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** Installed Chrome, falling back to Edge, or CHROME_PATH if set. */
export async function launchBrowser() {
  if (process.env.CHROME_PATH) return chromium.launch({ executablePath: process.env.CHROME_PATH });
  try {
    return await chromium.launch({ channel: 'chrome' });
  } catch {
    return chromium.launch({ channel: 'msedge' });
  }
}

/** A page with console errors and uncaught exceptions collected into page.errors. */
export async function newPage(browser, { viewport = { width: 1400, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  return page;
}

export async function api(base, method, url, body) {
  const res = await fetch(`${base}/api${url}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { status: res.status, json, headers: res.headers };
}

/** Wait until the title bar reports that everything is saved. */
export async function waitSaved(page) {
  await page.waitForFunction(() => document.getElementById('saveStatus').textContent === 'All changes saved', null, { timeout: 5000 });
}

/** Open the app and wait for the first page to load. */
export async function openApp(page, url) {
  await page.goto(url);
  await page.waitForSelector('#pageTitle');
  await page.waitForFunction(() => !document.getElementById('pageInner').hidden);
}

/** Create a page from a template through the "Add page ▾" menu. */
export async function addFromTemplate(page, name) {
  const before = await page.evaluate(() => location.hash);
  await page.click('#addPageMenu');
  await page.click(`.menu .menu-item:has-text("${name}")`);
  // Wait until the new page is the one open, not just until some page is active.
  await page.waitForFunction((prev) => location.hash !== prev && location.hash.startsWith('#/page/')
    && document.querySelector('#pageList .page-item.active')?.dataset.id === location.hash.slice(7), before);
}
