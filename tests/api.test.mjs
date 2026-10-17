// HTTP API contract (docs/5_api-contract.md), including the silent-failure obligations and P5.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { startServer, api, ROOT } from './helpers.mjs';

describe('API', () => {
  let server;
  let nb;
  let section;

  before(async () => {
    server = await startServer();
    nb = (await api(server.url, 'GET', '/notebooks')).json[0];
    section = (await api(server.url, 'GET', `/notebooks/${nb.id}/tree`)).json.sections[0];
  });
  after(async () => server?.stop());

  it('seeds a notebook with Quick Notes and a Getting started page', async () => {
    const tree = (await api(server.url, 'GET', `/notebooks/${nb.id}/tree`)).json;
    assert.equal(nb.name, 'My Notebook');
    assert.equal(tree.sections[0].name, 'Quick Notes');
    assert.equal(tree.pages[0].title, 'Getting started');
  });

  it('POST /pages accepts content and text (templates use this)', async () => {
    const content = JSON.stringify({ v: 1, type: 'todo', months: [], tasks: [{ id: 'a', text: 'Pack bags', done: false }] });
    const r = await api(server.url, 'POST', '/pages', { section_id: section.id, title: 'Trip', content, text: 'Pack bags' });
    assert.equal(r.status, 201);
    const page = (await api(server.url, 'GET', `/pages/${r.json.id}`)).json;
    assert.equal(page.content, content);
    assert.equal((await api(server.url, 'GET', '/search?q=pack%20bags')).json[0].id, r.json.id);
  });

  it('after_id inserts directly below a page', async () => {
    const a = (await api(server.url, 'POST', '/pages', { section_id: section.id, title: 'A' })).json;
    const c = (await api(server.url, 'POST', '/pages', { section_id: section.id, title: 'C' })).json;
    const b = (await api(server.url, 'POST', '/pages', { section_id: section.id, title: 'B', after_id: a.id })).json;
    assert.equal(b.sort, a.sort + 1);
    const pages = (await api(server.url, 'GET', `/notebooks/${nb.id}/tree`)).json.pages.filter((p) => p.section_id === section.id);
    const order = pages.sort((x, y) => x.sort - y.sort).map((p) => p.title);
    assert.ok(order.indexOf('B') === order.indexOf('A') + 1 && order.indexOf('C') > order.indexOf('B'));
    assert.ok(c.id);
  });

  it('updated_at changes for title/content edits only', async () => {
    const p = (await api(server.url, 'POST', '/pages', { section_id: section.id, title: 'T' })).json;
    await new Promise((r) => setTimeout(r, 5));
    const lvl = (await api(server.url, 'PATCH', `/pages/${p.id}`, { level: 9 })).json;
    assert.equal(lvl.updated_at, p.updated_at);
    assert.equal(lvl.level, 2, 'level is clamped');
    const t = (await api(server.url, 'PATCH', `/pages/${p.id}`, { title: 'T2' })).json;
    assert.ok(t.updated_at > p.updated_at);
  });

  it('obligation 2: content sent as an object is silently ignored (200, nothing stored)', async () => {
    const p = (await api(server.url, 'POST', '/pages', { section_id: section.id })).json;
    const r = await api(server.url, 'PATCH', `/pages/${p.id}`, { content: { v: 1 } });
    assert.equal(r.status, 200);
    assert.equal((await api(server.url, 'GET', `/pages/${p.id}`)).json.content, '');
  });

  it('obligation 3: a JSON upload must be sent as octet-stream', async () => {
    const asJson = await fetch(`${server.url}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Filename': 'data.json' }, body: '{"a":1}' });
    assert.equal(asJson.status, 400);
    const ok = await fetch(`${server.url}/api/uploads`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-Filename': encodeURIComponent('my data.json') }, body: '{"a":1}' });
    assert.equal(ok.status, 201);
    const up = await ok.json();
    assert.equal(up.name, 'my data.json');
    const file = await fetch(server.url + up.url);
    assert.equal(file.headers.get('content-disposition'), 'attachment');
    assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  });

  it('soft delete → trash → restore; permanent delete removes it', async () => {
    const p = (await api(server.url, 'POST', '/pages', { section_id: section.id, title: 'Doomed' })).json;
    assert.equal((await api(server.url, 'DELETE', `/pages/${p.id}`)).status, 204);
    assert.ok((await api(server.url, 'GET', '/trash')).json.some((x) => x.id === p.id));
    assert.equal((await api(server.url, 'POST', `/pages/${p.id}/restore`)).json.notebook_id, nb.id);
    assert.equal((await api(server.url, 'DELETE', `/pages/${p.id}?permanent=1`)).status, 204);
    assert.equal((await api(server.url, 'GET', `/pages/${p.id}`)).status, 404);
  });

  it('error shapes match the contract', async () => {
    const cases = [
      [await api(server.url, 'GET', '/pages/nope'), 404, 'Page not found'],
      [await api(server.url, 'GET', '/nothing'), 404, 'Not found'],
      [await api(server.url, 'POST', '/pages', { section_id: 'zzz' }), 400, 'Unknown section'],
      [await api(server.url, 'PUT', '/reorder', { kind: 'users', ids: [] }), 400, 'kind and ids are required'],
      [await api(server.url, 'POST', '/import', { foo: 1 }), 400, 'Not a valid backup file'],
    ];
    for (const [r, status, error] of cases) {
      assert.equal(r.status, status);
      assert.deepEqual(r.json, { error });
    }
    const bad = await fetch(`${server.url}/api/pages/x`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(bad.status, 400);
  });

  it('export → import round-trips with new ids', async () => {
    const exp = (await api(server.url, 'GET', '/export')).json;
    const r = await api(server.url, 'POST', '/import', exp);
    assert.equal(r.status, 201);
    assert.deepEqual(r.json, { notebooks: exp.notebooks.length, sections: exp.sections.length, pages: exp.pages.length });
    const all = (await api(server.url, 'GET', '/notebooks')).json;
    assert.equal(new Set(all.map((n) => n.id)).size, exp.notebooks.length * 2);
  });

  it('P5: a second instance on a busy port fails loudly with exit code 1', async () => {
    const proc = spawn(process.execPath, ['server/index.js'], {
      cwd: ROOT, env: { ...process.env, PORT: String(server.port), HOST: '127.0.0.1', DATA_DIR: server.dataDir },
    });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { out += d; });
    const code = await new Promise((r) => proc.on('exit', r));
    assert.equal(code, 1);
    assert.match(out, /port is already in use/);
    assert.doesNotMatch(out, /running at/);
  });
});
