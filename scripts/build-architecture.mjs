// Generates docs/8_architecture.html FROM docs/7_uml/*.md. Never edit the HTML by hand:
// fix the Mermaid source in 7_uml/, then run `npm run docs:arch`.
//
// The master diagram (section 0) is hand-laid inline SVG so it renders with no network and no
// JavaScript. Every Mermaid block renders client-side from a pinned CDN build, and shows its own
// source text if the library cannot load.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UML = path.join(ROOT, 'docs', '7_uml');
const OUT = path.join(ROOT, 'docs', '8_architecture.html');
const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js';
const VERSION = 'v8 — 2026-10-17 (night)';
// Earlier versions are kept as files beside the current page, never overwritten.
const HISTORY = [
  ['v1 — 2026-10-15', '8_architecture.v1.html', 'First version: clone, docs, backup.'],
  ['v2 — 2026-10-15 (session 3)', '8_architecture.v2.html', 'Page templates and the to-do planner: <code>todo.js</code> and <code>templates.js</code> in the component diagram, a <code>TodoView</code> class, the planner content shape (7.3), a template + add-task sequence (7.4), the "where a new task lands" activity (7.6), and <code>npm test</code> in the container diagram (7.1).'],
  ['v4 — 2026-10-17', '8_architecture.v4.html', 'Cards board and insert templates: <code>board.js</code> + <code>BoardView</code> and the editor\'s <code>views</code> interface (7.2), the board content shape (7.3), the Insert → Templates sequence (7.4), and the card due-badge state machine (7.5). Master diagram: editor label names <code>board.js</code>.'],
  ['v5 — 2026-10-17 (later)', '8_architecture.v5.html', 'Board backgrounds follow the theme: the board content shape (7.3) lists <code>tint · accent · soft · page</code> instead of fixed gradients.'],
  ['v6 — 2026-10-17 (latest)', '8_architecture.v6.html', 'Movable everything: <code>board.js</code> uses <code>parseQuickAdd()</code> from <code>todo.js</code> (7.2); new activity "where a dropped planner task lands" (7.6).'],
  ['v7 — 2026-10-17 (evening)', '8_architecture.v7.html', 'Planner tidy-up: + add box state machine (7.5); drops land among tasks with the same checked state (7.6).'],
  ['v3 — 2026-10-16', '8_architecture.v3.html', 'Theme tab: <code>theme.js</code> in the component diagram (7.2), the <code>settings.appearance</code> shape (7.3) and the first-paint sequence (7.4).'],
];
const CHANGES = 'Unscheduled is now shown as "No month" (7.3 task shape, 7.6 group kinds); no shape change.';

const FILES = ['7.1_hld.md', '7.2_lld.md', '7.3_data-model.md', '7.4_sequences.md', '7.5_state-machines.md', '7.6_activity.md'];

// "s7-3-data-model": ids must not start with a digit to be usable as CSS selectors.
const sectionId = (file) => 's' + file.replace('.md', '').replace(/\W+/g, '-');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => `<a href="${href.replace(/^\.\.\//, '').replace(/^7\./, '7_uml/7.')}">${text}</a>`);
}

// Minimal Markdown → HTML for the 7_uml files: headings, paragraphs, mermaid fences.
function render(md, fileId) {
  const out = [];
  let para = [];
  let n = 0;
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const lines = md.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```mermaid')) {
      flush();
      const src = [];
      while (++i < lines.length && !lines[i].startsWith('```')) src.push(lines[i]);
      n++;
      out.push(`<div class="diagram" id="${fileId}-${n}"><pre class="mermaid">\n${esc(src.join('\n'))}\n</pre><noscript><p class="note">Diagram source shown above — JavaScript is off.</p></noscript></div>`);
    } else if (/^#\s/.test(line)) {
      flush();
      out.push(`<h2>${inline(line.replace(/^#\s+/, ''))}</h2>`);
    } else if (/^##\s/.test(line)) {
      flush();
      out.push(`<h3>${inline(line.replace(/^##\s+/, ''))}</h3>`);
    } else if (!line.trim()) {
      flush();
    } else {
      para.push(line.trim());
    }
  }
  flush();
  return { html: out.join('\n'), count: n };
}

const MASTER = `
<svg class="master" viewBox="0 0 960 450" role="img" aria-labelledby="mt">
  <title id="mt">Master diagram: browser modules, the Node process, the data folder, and the planned remote path</title>
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
    </marker>
  </defs>
  <!-- Browser -->
  <rect class="zone" x="20" y="20" width="400" height="280" rx="10"/>
  <text class="zt" x="36" y="46">Browser tab (public/)</text>
  <rect class="box" x="40" y="62" width="170" height="64" rx="6"/>
  <text class="bt" x="125" y="88">app.js</text><text class="bs" x="125" y="108">navigation · ribbon · theme.js</text>
  <rect class="box" x="230" y="62" width="170" height="64" rx="6"/>
  <text class="bt" x="315" y="88">editor.js</text><text class="bs" x="315" y="108">PageEditor · todo.js · board.js</text>
  <rect class="box soft" x="40" y="150" width="170" height="52" rx="6"/>
  <text class="bt" x="125" y="172">ui.js · icons.js</text><text class="bs" x="125" y="190">menus · dialogs · SVG</text>
  <rect class="box" x="230" y="150" width="170" height="52" rx="6"/>
  <text class="bt" x="315" y="172">api.js</text><text class="bs" x="315" y="190">fetch wrapper · upload</text>
  <rect class="box soft" x="40" y="228" width="170" height="52" rx="6"/>
  <text class="bt" x="125" y="250">localStorage</text><text class="bs" x="125" y="268">oc.* prefs (per browser)</text>
  <text class="lbl" x="240" y="250">app → editor: methods</text>
  <text class="lbl" x="240" y="268">editor → app: events</text>
  <line class="ln" x1="210" y1="86" x2="228" y2="86" marker-end="url(#arr)"/>
  <line class="ln" x1="315" y1="126" x2="315" y2="148" marker-end="url(#arr)"/>
  <line class="ln" x1="125" y1="126" x2="125" y2="148" marker-end="url(#arr)"/>
  <!-- Node -->
  <rect class="zone" x="540" y="20" width="400" height="130" rx="10"/>
  <text class="zt" x="556" y="46">One Node process: npm start</text>
  <rect class="box" x="560" y="62" width="170" height="64" rx="6"/>
  <text class="bt" x="645" y="88">server/index.js</text><text class="bs" x="645" y="108">Express 5 · /api · static</text>
  <rect class="box" x="750" y="62" width="170" height="64" rx="6"/>
  <text class="bt" x="835" y="88">server/db.js</text><text class="bs" x="835" y="108">node:sqlite · migrations</text>
  <line class="ln" x1="730" y1="94" x2="748" y2="94" marker-end="url(#arr)"/>
  <!-- HTTP -->
  <line class="ln strong" x1="400" y1="176" x2="558" y2="100" marker-end="url(#arr)"/>
  <text class="lbl" x="420" y="118">HTTP JSON /api</text>
  <!-- Data -->
  <rect class="zone" x="540" y="190" width="400" height="140" rx="10"/>
  <text class="zt" x="924" y="216" text-anchor="end">DATA_DIR (./data)</text>
  <rect class="box" x="560" y="232" width="110" height="80" rx="6"/>
  <text class="bt" x="615" y="262">uploads/</text><text class="bs" x="615" y="282">uuid.ext · not in</text><text class="bs" x="615" y="298">JSON export</text>
  <rect class="box" x="690" y="232" width="110" height="80" rx="6"/>
  <text class="bt" x="745" y="262">notes.db</text><text class="bs" x="745" y="282">can be 4 KB</text><text class="bs" x="745" y="298">(P8)</text>
  <rect class="box warn" x="816" y="232" width="110" height="80" rx="6"/>
  <text class="bt" x="871" y="262">notes.db-wal</text><text class="bs" x="871" y="282">recent writes:</text><text class="bs" x="871" y="298">part of the DB</text>
  <line class="ln" x1="615" y1="126" x2="615" y2="230" marker-end="url(#arr)"/>
  <line class="ln" x1="800" y1="126" x2="760" y2="230" marker-end="url(#arr)"/>
  <line class="ln" x1="870" y1="126" x2="870" y2="230" marker-end="url(#arr)"/>
  <!-- Backup -->
  <rect class="box soft" x="660" y="380" width="180" height="52" rx="6"/>
  <text class="bt" x="750" y="402">npm run backup</text><text class="bs" x="750" y="420">VACUUM INTO (read-only)</text>
  <line class="ln" x1="750" y1="380" x2="750" y2="314" marker-end="url(#arr)"/>
  <!-- Planned -->
  <rect class="box planned" x="40" y="380" width="250" height="52" rx="6"/>
  <text class="bt" x="165" y="402">Phone / second device</text><text class="bs" x="165" y="420">PLANNED · needs OD3 + OD4</text>
  <polyline class="ln planned" points="290,406 500,406 500,140 538,140" marker-end="url(#arr)"/>
  <text class="lbl" x="310" y="396">via auth proxy / Tailscale</text>
</svg>`;

const sections = [];
let total = 0;
for (const f of FILES) {
  const md = fs.readFileSync(path.join(UML, f), 'utf8');
  const id = sectionId(f);
  const { html, count } = render(md, id);
  total += count;
  sections.push(`<section id="${id}">\n<p class="src">Source: <a href="7_uml/${f}">7_uml/${f}</a> · ${count} diagram${count === 1 ? '' : 's'}</p>\n${html}\n</section>`);
}

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OneNote Clone Architecture</title>
<!-- GENERATED by scripts/build-architecture.mjs from docs/7_uml/*.md. Do not edit by hand. -->
<style>
  :root { --bg:#ffffff; --fg:#1f2328; --dim:#59636e; --line:#d1d9e0; --zone:#f6f8fa; --box:#ffffff; --accent:#7719aa; --warn:#fff4d6; --warnline:#d4a72c; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1117; --fg:#e6edf3; --dim:#9198a1; --line:#3d444d; --zone:#151b23; --box:#0d1117; --accent:#c4adf0; --warn:#2b2111; --warnline:#9e7a1d; } }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 -apple-system, 'Segoe UI', system-ui, sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 32px 16px 80px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 21px; margin: 40px 0 8px; padding-top: 16px; border-top: 1px solid var(--line); }
  h3 { font-size: 16px; margin: 24px 0 6px; }
  p { margin: 8px 0; max-width: 78ch; }
  .sub, .src, .note { color: var(--dim); font-size: 13px; }
  code { font: 13px Consolas, 'Cascadia Mono', monospace; background: var(--zone); padding: 1px 4px; border-radius: 4px; }
  a { color: var(--accent); }
  nav { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 16px 0 8px; font-size: 14px; }
  .diagram { margin: 12px 0 20px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; overflow-x: auto; background: #fff; }
  .diagram pre { margin: 0; color: #1f2328; font: 12px/1.45 Consolas, monospace; white-space: pre; }
  .master { width: 100%; height: auto; color: var(--fg); display: block; margin: 12px 0; }
  .master .zone { fill: var(--zone); stroke: var(--line); }
  .master .box { fill: var(--box); stroke: var(--fg); stroke-width: 1.2; }
  .master .box.soft { stroke: var(--dim); }
  .master .box.warn { fill: var(--warn); stroke: var(--warnline); }
  .master .box.planned, .master .ln.planned { stroke-dasharray: 6 5; stroke: var(--dim); fill: none; }
  .master .zt { font: 600 13px system-ui, sans-serif; fill: var(--dim); }
  .master .bt { font: 600 14px system-ui, sans-serif; fill: var(--fg); text-anchor: middle; }
  .master .bs { font: 11.5px system-ui, sans-serif; fill: var(--dim); text-anchor: middle; }
  .master .bs.left { text-anchor: start; }
  .master .lbl { font: italic 12px system-ui, sans-serif; fill: var(--dim); }
  .master .ln { stroke: currentColor; stroke-width: 1.3; fill: none; }
  .master .ln.strong { stroke-width: 2; }
  table { border-collapse: collapse; margin: 8px 0; font-size: 14px; }
  td, th { border: 1px solid var(--line); padding: 5px 10px; text-align: left; vertical-align: top; }
</style>
</head>
<body>
<main>
<h1>OneNote Clone · Architecture</h1>
<p class="sub">${VERSION} · ${total} Mermaid diagrams generated from <code>docs/7_uml/</code> + 1 master diagram · prose: <a href="6_system-guide.md">6_system-guide.md</a></p>
<nav>
  <a href="#master">0 Master</a>${FILES.map((f) => `<a href="#${sectionId(f)}">${f.replace('.md', '').replace('_', ' ')}</a>`).join('')}<a href="#changes">Changes</a>
</nav>

<section id="master">
<h2>0 · Master diagram</h2>
<p>The whole system on one canvas. Hand-laid SVG, so it renders with no network and no JavaScript.
The server never looks inside a page: a page's canvas is one JSON string built and parsed by
<code>editor.js</code>. <code>notes.db</code> and <code>notes.db-wal</code> are drawn as two
boxes because together they are the database (P8). Dashed = not built. The server binds
<code>127.0.0.1:3000</code> with no auth, purges pages trashed more than 60 days ago (at startup and
every 6 h), and stores <code>pages.content</code> as an opaque string.</p>
${MASTER}
</section>

${sections.join('\n\n')}

<section id="changes">
<h2>Changes since the previous version</h2>
<table>
  <tr><th>Version</th><th>What changed</th></tr>
${HISTORY.map(([v, file, what]) => `  <tr><td><a href="${file}">${v}</a></td><td>${what}</td></tr>`).join('\n')}
  <tr><td>${VERSION} (this page)</td><td>${CHANGES}</td></tr>
</table>
</section>
</main>
<script src="${MERMAID}"></script>
<script>
  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'strict' });
  }
</script>
</body>
</html>
`;

fs.writeFileSync(OUT, page);
console.log(`Wrote ${path.relative(ROOT, OUT)}: ${total} Mermaid diagrams from ${FILES.length} files + master SVG.`);
