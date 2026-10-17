import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { openDb, tx } from './db.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(ROOT, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const TRASH_DAYS = 60;

const SECTION_COLORS = ['#f2b636', '#3db04a', '#4a90e2', '#a874d6', '#e35d6a', '#f08b3e', '#36b5a8', '#d76fb0', '#8e9aaf'];
const HEX = /^#[0-9a-f]{6}$/i;

fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = openDb(path.join(DATA_DIR, 'notes.db'));

const now = () => Date.now();
const uid = () => randomUUID();

// ---------- small query helpers ----------
const one = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);

function insert(table, row) {
  const keys = Object.keys(row);
  run(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => row[k]));
  return row;
}

function update(table, id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return 0;
  return run(`UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => fields[k]), id).changes;
}

function nextSort(table, column, value) {
  const where = column ? `WHERE ${column} = ?` : '';
  return one(`SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM ${table} ${where}`, ...(column ? [value] : [])).s;
}

function cleanName(value, fallback, max = 200) {
  const s = typeof value === 'string' ? value.trim().slice(0, max) : '';
  return s || fallback;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (m) => '\\' + m);
}

function snippet(text, term) {
  const flat = (text || '').replace(/\s+/g, ' ').trim();
  if (!term) return flat.slice(0, 140);
  const i = flat.toLowerCase().indexOf(term.toLowerCase());
  if (i < 0) return flat.slice(0, 140);
  const start = Math.max(0, i - 50);
  return (start > 0 ? '…' : '') + flat.slice(start, i + term.length + 90) + (i + term.length + 90 < flat.length ? '…' : '');
}

// ---------- seed + housekeeping ----------
function seed() {
  if (one('SELECT COUNT(*) AS n FROM notebooks').n > 0) return;
  const t = now();
  const blocks = [
    {
      id: uid(), x: 60, y: 100, w: null,
      html: [
        '<h2>Welcome to your notebook 👋</h2>',
        '<div>This works like OneNote: <b>click anywhere</b> on the page to start a new note container.</div>',
        '<div>Drag a container by its top bar to move it. Everything saves automatically.</div>',
        '<div><br></div>',
        '<div data-tag="todo" data-checked="true">Open the app</div>',
        '<div data-tag="todo">Create a section with <b>+ Add section</b></div>',
        '<div data-tag="todo">Try the <b>Draw</b> tab to sketch with a pen or highlighter</div>',
        '<div data-tag="todo">Press <b>Ctrl+E</b> to search across all your notes</div>',
        '<div data-tag="important">Right-click sections and pages for more options</div>',
      ].join(''),
    },
  ];
  const content = JSON.stringify({ v: 1, lines: 'none', blocks, ink: [] });
  const text = 'Welcome to your notebook. Click anywhere on the page to start a new note container.';
  tx(db, () => {
    const nb = insert('notebooks', { id: uid(), name: 'My Notebook', color: '#7719aa', sort: 0, created_at: t, updated_at: t });
    const quick = insert('sections', { id: uid(), notebook_id: nb.id, name: 'Quick Notes', color: SECTION_COLORS[0], sort: 0, created_at: t, updated_at: t });
    insert('sections', { id: uid(), notebook_id: nb.id, name: 'New Section 1', color: SECTION_COLORS[1], sort: 1, created_at: t, updated_at: t });
    insert('pages', { id: uid(), section_id: quick.id, title: 'Getting started', content, text, level: 0, sort: 0, created_at: t, updated_at: t });
  });
}

function purgeTrash() {
  run('DELETE FROM pages WHERE deleted_at IS NOT NULL AND deleted_at < ?', now() - TRASH_DAYS * 86400000);
}

seed();
purgeTrash();
setInterval(purgeTrash, 6 * 3600000).unref();

// ---------- app ----------
const app = express();
app.disable('x-powered-by');

const jsonDefault = express.json({ limit: '25mb' });
const jsonLarge = express.json({ limit: '500mb' });
app.use('/api', (req, res, next) => (req.path === '/import' ? jsonLarge : jsonDefault)(req, res, next));

app.use(express.static(path.join(ROOT, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d',
  immutable: true,
  setHeaders(res, file) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Only render "safe" media inline; everything else downloads so it can't run in our origin.
    if (!/\.(png|jpe?g|gif|webp|bmp|avif|ico|mp4|webm|mp3|wav|ogg|pdf|txt)$/i.test(file)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
  },
}));

// ----- notebooks -----
app.get('/api/notebooks', (req, res) => {
  res.json(all('SELECT * FROM notebooks ORDER BY sort, created_at'));
});

app.post('/api/notebooks', (req, res) => {
  const t = now();
  const name = cleanName(req.body.name, 'New Notebook');
  const color = HEX.test(req.body.color) ? req.body.color : '#7719aa';
  const nb = tx(db, () => {
    const nb = insert('notebooks', { id: uid(), name, color, sort: nextSort('notebooks'), created_at: t, updated_at: t });
    const sec = insert('sections', { id: uid(), notebook_id: nb.id, name: 'New Section 1', color: SECTION_COLORS[0], sort: 0, created_at: t, updated_at: t });
    insert('pages', { id: uid(), section_id: sec.id, title: '', content: '', text: '', level: 0, sort: 0, created_at: t, updated_at: t });
    return nb;
  });
  res.status(201).json(nb);
});

app.patch('/api/notebooks/:id', (req, res) => {
  const fields = {};
  if (req.body.name !== undefined) fields.name = cleanName(req.body.name, 'Untitled notebook');
  if (HEX.test(req.body.color)) fields.color = req.body.color;
  fields.updated_at = now();
  if (!update('notebooks', req.params.id, fields)) throw httpError(404, 'Notebook not found');
  res.json(one('SELECT * FROM notebooks WHERE id = ?', req.params.id));
});

app.delete('/api/notebooks/:id', (req, res) => {
  if (!run('DELETE FROM notebooks WHERE id = ?', req.params.id).changes) throw httpError(404, 'Notebook not found');
  res.status(204).end();
});

app.get('/api/notebooks/:id/tree', (req, res) => {
  const notebook = one('SELECT * FROM notebooks WHERE id = ?', req.params.id);
  if (!notebook) throw httpError(404, 'Notebook not found');
  const sections = all('SELECT * FROM sections WHERE notebook_id = ? ORDER BY sort, created_at', notebook.id);
  const pages = all(
    `SELECT p.id, p.section_id, p.title, p.level, p.sort, p.created_at, p.updated_at
       FROM pages p JOIN sections s ON s.id = p.section_id
      WHERE s.notebook_id = ? AND p.deleted_at IS NULL
      ORDER BY p.sort, p.created_at`,
    notebook.id,
  );
  res.json({ notebook, sections, pages });
});

// ----- sections -----
app.get('/api/sections', (req, res) => {
  res.json(all(
    `SELECT s.id, s.name, s.color, s.notebook_id, n.name AS notebook_name
       FROM sections s JOIN notebooks n ON n.id = s.notebook_id
      ORDER BY n.sort, n.created_at, s.sort, s.created_at`,
  ));
});

app.post('/api/sections', (req, res) => {
  const { notebook_id } = req.body;
  if (!one('SELECT id FROM notebooks WHERE id = ?', notebook_id)) throw httpError(400, 'Unknown notebook');
  const t = now();
  const count = one('SELECT COUNT(*) AS n FROM sections WHERE notebook_id = ?', notebook_id).n;
  const result = tx(db, () => {
    const section = insert('sections', {
      id: uid(),
      notebook_id,
      name: cleanName(req.body.name, `New Section ${count + 1}`),
      color: HEX.test(req.body.color) ? req.body.color : SECTION_COLORS[count % SECTION_COLORS.length],
      sort: nextSort('sections', 'notebook_id', notebook_id),
      created_at: t,
      updated_at: t,
    });
    const page = insert('pages', { id: uid(), section_id: section.id, title: '', content: '', text: '', level: 0, sort: 0, created_at: t, updated_at: t });
    return { section, page: { ...page, content: undefined, text: undefined } };
  });
  res.status(201).json(result);
});

app.patch('/api/sections/:id', (req, res) => {
  const fields = {};
  if (req.body.name !== undefined) fields.name = cleanName(req.body.name, 'Untitled section');
  if (HEX.test(req.body.color)) fields.color = req.body.color;
  if (req.body.notebook_id) {
    if (!one('SELECT id FROM notebooks WHERE id = ?', req.body.notebook_id)) throw httpError(400, 'Unknown notebook');
    fields.notebook_id = req.body.notebook_id;
    fields.sort = nextSort('sections', 'notebook_id', req.body.notebook_id);
  }
  fields.updated_at = now();
  if (!update('sections', req.params.id, fields)) throw httpError(404, 'Section not found');
  res.json(one('SELECT * FROM sections WHERE id = ?', req.params.id));
});

app.delete('/api/sections/:id', (req, res) => {
  if (!run('DELETE FROM sections WHERE id = ?', req.params.id).changes) throw httpError(404, 'Section not found');
  res.status(204).end();
});

// ----- pages -----
app.post('/api/pages', (req, res) => {
  const { section_id, after_id } = req.body;
  if (!one('SELECT id FROM sections WHERE id = ?', section_id)) throw httpError(400, 'Unknown section');
  const t = now();
  const page = tx(db, () => {
    let sort;
    const after = after_id && one('SELECT sort FROM pages WHERE id = ? AND section_id = ?', after_id, section_id);
    if (after) {
      run('UPDATE pages SET sort = sort + 1 WHERE section_id = ? AND sort > ?', section_id, after.sort);
      sort = after.sort + 1;
    } else {
      sort = nextSort('pages', 'section_id', section_id);
    }
    return insert('pages', {
      id: uid(),
      section_id,
      title: cleanName(req.body.title, '', 500),
      // Optional so a page can be created from a template in one request.
      content: typeof req.body.content === 'string' ? req.body.content : '',
      text: typeof req.body.text === 'string' ? req.body.text : '',
      level: Math.max(0, Math.min(2, Number(req.body.level) || 0)),
      sort,
      created_at: t,
      updated_at: t,
    });
  });
  res.status(201).json(page);
});

app.get('/api/pages/:id', (req, res) => {
  const page = one(
    `SELECT p.*, s.notebook_id, s.name AS section_name
       FROM pages p JOIN sections s ON s.id = p.section_id
      WHERE p.id = ?`,
    req.params.id,
  );
  if (!page) throw httpError(404, 'Page not found');
  res.json(page);
});

app.patch('/api/pages/:id', (req, res) => {
  const b = req.body;
  const page = one('SELECT id, section_id FROM pages WHERE id = ?', req.params.id);
  if (!page) throw httpError(404, 'Page not found');
  const fields = {};
  if (typeof b.title === 'string') fields.title = b.title.slice(0, 500);
  if (typeof b.content === 'string') fields.content = b.content;
  if (typeof b.text === 'string') fields.text = b.text;
  if (b.level !== undefined) fields.level = Math.max(0, Math.min(2, Number(b.level) || 0));
  if (b.section_id && b.section_id !== page.section_id) {
    if (!one('SELECT id FROM sections WHERE id = ?', b.section_id)) throw httpError(400, 'Unknown section');
    fields.section_id = b.section_id;
    fields.sort = nextSort('pages', 'section_id', b.section_id);
    fields.level = 0;
  }
  if ('title' in fields || 'content' in fields) fields.updated_at = now();
  update('pages', page.id, fields);
  res.json(one('SELECT id, section_id, title, level, sort, created_at, updated_at FROM pages WHERE id = ?', page.id));
});

app.delete('/api/pages/:id', (req, res) => {
  const changes = req.query.permanent
    ? run('DELETE FROM pages WHERE id = ?', req.params.id).changes
    : run('UPDATE pages SET deleted_at = ? WHERE id = ?', now(), req.params.id).changes;
  if (!changes) throw httpError(404, 'Page not found');
  res.status(204).end();
});

app.post('/api/pages/:id/restore', (req, res) => {
  if (!run('UPDATE pages SET deleted_at = NULL WHERE id = ?', req.params.id).changes) throw httpError(404, 'Page not found');
  res.json(one('SELECT p.id, p.section_id, s.notebook_id FROM pages p JOIN sections s ON s.id = p.section_id WHERE p.id = ?', req.params.id));
});

// ----- trash -----
app.get('/api/trash', (req, res) => {
  res.json(all(
    `SELECT p.id, p.title, p.deleted_at, p.section_id, s.name AS section_name, s.color AS section_color,
            n.id AS notebook_id, n.name AS notebook_name
       FROM pages p JOIN sections s ON s.id = p.section_id JOIN notebooks n ON n.id = s.notebook_id
      WHERE p.deleted_at IS NOT NULL
      ORDER BY p.deleted_at DESC`,
  ));
});

app.delete('/api/trash', (req, res) => {
  run('DELETE FROM pages WHERE deleted_at IS NOT NULL');
  res.status(204).end();
});

// ----- ordering -----
app.put('/api/reorder', (req, res) => {
  const table = { notebooks: 'notebooks', sections: 'sections', pages: 'pages' }[req.body.kind];
  const ids = Array.isArray(req.body.ids) ? req.body.ids : null;
  if (!table || !ids) throw httpError(400, 'kind and ids are required');
  const levels = req.body.levels || {};
  tx(db, () => {
    ids.forEach((id, i) => {
      if (table === 'pages' && levels[id] !== undefined) {
        run('UPDATE pages SET sort = ?, level = ? WHERE id = ?', i, Math.max(0, Math.min(2, Number(levels[id]) || 0)), id);
      } else {
        run(`UPDATE ${table} SET sort = ? WHERE id = ?`, i, id);
      }
    });
  });
  res.status(204).end();
});

// ----- search / recent -----
const PAGE_CRUMBS = `
  SELECT p.id, p.title, p.text, p.updated_at, p.created_at, p.section_id,
         s.name AS section_name, s.color AS section_color, n.id AS notebook_id, n.name AS notebook_name
    FROM pages p JOIN sections s ON s.id = p.section_id JOIN notebooks n ON n.id = s.notebook_id
   WHERE p.deleted_at IS NULL`;

app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) return res.json([]);
  const where = [];
  const args = [];
  for (const term of terms) {
    const like = `%${escapeLike(term)}%`;
    where.push(`(p.title LIKE ? ESCAPE '\\' OR p.text LIKE ? ESCAPE '\\')`);
    args.push(like, like);
  }
  if (req.query.notebook) {
    where.push('n.id = ?');
    args.push(String(req.query.notebook));
  }
  const rows = all(
    `${PAGE_CRUMBS} AND ${where.join(' AND ')}
     ORDER BY (p.title LIKE ? ESCAPE '\\') DESC, p.updated_at DESC LIMIT 100`,
    ...args, `%${escapeLike(terms[0])}%`,
  );
  res.json(rows.map(({ text, ...r }) => ({ ...r, snippet: snippet(text, terms[0]) })));
});

app.get('/api/recent', (req, res) => {
  const limit = Math.min(100, Number(req.query.limit) || 40);
  const rows = all(`${PAGE_CRUMBS} ORDER BY p.updated_at DESC LIMIT ?`, limit);
  res.json(rows.map(({ text, ...r }) => ({ ...r, snippet: snippet(text) })));
});

// ----- settings -----
app.get('/api/settings', (req, res) => {
  const out = {};
  for (const { key, value } of all('SELECT key, value FROM settings')) {
    try { out[key] = JSON.parse(value); } catch { out[key] = value; }
  }
  res.json(out);
});

app.put('/api/settings', (req, res) => {
  const entries = Object.entries(req.body || {}).filter(([k]) => /^[\w.-]{1,64}$/.test(k));
  tx(db, () => {
    for (const [key, value] of entries) {
      run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
    }
  });
  res.status(204).end();
});

// ----- uploads -----
app.post('/api/uploads', express.raw({ type: () => true, limit: '100mb' }), (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) throw httpError(400, 'Empty upload');
  let original = 'file';
  try { original = decodeURIComponent(req.get('x-filename') || 'file'); } catch { /* keep default */ }
  const name = path.basename(original).replace(/[^\w.\- ()]/g, '_').slice(-120) || 'file';
  const ext = path.extname(name).toLowerCase().replace(/[^.\w]/g, '').slice(0, 10);
  const file = uid() + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, file), req.body);
  res.status(201).json({ url: `/uploads/${file}`, name, size: req.body.length });
});

// ----- backup -----
app.get('/api/export', (req, res) => {
  const data = {
    app: 'onenote-clone',
    version: 1,
    exported_at: now(),
    notebooks: all('SELECT * FROM notebooks ORDER BY sort'),
    sections: all('SELECT * FROM sections ORDER BY notebook_id, sort'),
    pages: all('SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY section_id, sort'),
  };
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="notes-backup-${stamp}.json"`);
  res.json(data);
});

app.post('/api/import', (req, res) => {
  const { notebooks, sections, pages } = req.body || {};
  if (!Array.isArray(notebooks) || !Array.isArray(sections) || !Array.isArray(pages)) {
    throw httpError(400, 'Not a valid backup file');
  }
  const t = now();
  const nbMap = new Map();
  const secMap = new Map();
  const counts = tx(db, () => {
    let sort = nextSort('notebooks');
    for (const nb of notebooks) {
      const id = uid();
      nbMap.set(nb.id, id);
      insert('notebooks', {
        id, name: cleanName(nb.name, 'Imported notebook'), color: HEX.test(nb.color) ? nb.color : '#7719aa',
        sort: sort++, created_at: Number(nb.created_at) || t, updated_at: Number(nb.updated_at) || t,
      });
    }
    for (const s of sections) {
      const notebook_id = nbMap.get(s.notebook_id);
      if (!notebook_id) continue;
      const id = uid();
      secMap.set(s.id, id);
      insert('sections', {
        id, notebook_id, name: cleanName(s.name, 'Section'), color: HEX.test(s.color) ? s.color : SECTION_COLORS[0],
        sort: Number(s.sort) || 0, created_at: Number(s.created_at) || t, updated_at: Number(s.updated_at) || t,
      });
    }
    let pageCount = 0;
    for (const p of pages) {
      const section_id = secMap.get(p.section_id);
      if (!section_id) continue;
      insert('pages', {
        id: uid(), section_id, title: String(p.title || ''), content: String(p.content || ''), text: String(p.text || ''),
        level: Number(p.level) || 0, sort: Number(p.sort) || 0,
        created_at: Number(p.created_at) || t, updated_at: Number(p.updated_at) || t,
      });
      pageCount++;
    }
    return { notebooks: nbMap.size, sections: secMap.size, pages: pageCount };
  });
  res.status(201).json(counts);
});

// ----- errors -----
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Server error' : err.message });
});

// Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
const server = app.listen(PORT, HOST, (err) => {
  if (err) {
    console.error(`Could not start on ${HOST}:${PORT} — ${err.code === 'EADDRINUSE' ? 'the port is already in use (is another instance running?)' : err.message}`);
    if (err.code === 'EADDRINUSE') {
      // Seen 2026-10-17: VS Code's Live Preview extension also defaults to port 3000.
      console.error('Another program (e.g. another copy of this app, or an editor preview server) has this port.');
      console.error(`Use a different one:  PowerShell: $env:PORT=3002; npm start   ·   bash: PORT=3002 npm start`);
    }
    process.exit(1);
  }
  console.log(`OneNote Clone running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Data directory: ${DATA_DIR}`);
});

function shutdown() {
  server.close();
  try { db.close(); } catch { /* already closed */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
