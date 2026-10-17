# SYSTEM GUIDE — the running system, explained

For whoever has to run, fix or back up this app, usually me after a few weeks away. Every command
below was run on 2026-10-15 (Windows 10, Node 26.11.1, Git Bash), against a scratch data folder
unless it says otherwise. Diagrams of the same things are in [7_uml/](7_uml/README.md).

## 1. The shape of it

One Node process does everything: it serves the static frontend from `public/`, answers the JSON
API under `/api`, and owns the SQLite database. The browser holds all editing state and pushes the
whole page back to the server about 600 ms after you stop typing.

    browser (public/js/*)  ──HTTP/JSON──►  node server/index.js  ──node:sqlite──►  data/notes.db (+ -wal)
                           ◄─static files─                      ──fs──────────►  data/uploads/

The two halves fail differently, and that explains most of the design:

| Part | Holds | If it dies |
|---|---|---|
| Browser tab | the page being edited (in the DOM) and up to 600 ms of unsaved edits | Unsaved edits are lost unless the `keepalive` save on tab close got through. |
| Server | everything saved | The open tab keeps working, shows "Couldn't save — retrying", retries every 4 s, and catches up when the server returns. Seen working: text typed during a 10 s outage was saved after the restart (2026-10-15). |

## 2. The parts

### 2.1 The Node server: `server/index.js`

- **Why this tool:** Express 5 (`express@5.3.0` installed) on Node ≥ 22.13 for the built-in
  `node:sqlite`. No native modules. See the decisions log ([4_decisions.md](4_decisions.md), 2026-10-14 rows).
- **Owns:** the only connection to the database; schema migrations (`server/db.js`, applied on
  startup, tracked in `PRAGMA user_version`); seeding a "My Notebook" with a "Getting started" page
  on an empty database; purging pages trashed more than 60 days ago (at startup and every 6 h).
- **When it is down:** the page still renders if it was already open. The title bar says
  "Couldn't save — retrying" and one toast says "Couldn't reach the server. Your changes will be
  retried." (Both seen 2026-10-15.)

### 2.2 The frontend: `public/`

- Plain ES modules, no build. `index.html` is the whole shell (title bar, ribbon, panes, canvas).
  `js/app.js` drives navigation and the ribbon; `js/editor.js` is the page canvas (containers,
  formatting, ink, paste/drop, autosave). For a page whose content has `type: "todo"` or `"board"`
  the editor hands the page to `js/todo.js` (the planner) or `js/board.js` (Cards) instead of
  drawing a canvas. `js/templates.js` builds new pages (Blank, To-do planner, Cards) and the note
  templates inserted from Insert → Templates. `js/theme.js` owns appearance. `js/ui.js` holds menus, dialogs and toasts, `js/icons.js` the
  inline SVG icons, and `js/api.js` the fetch wrapper.
- **Owns:** per-browser preferences in `localStorage` under keys prefixed `oc.` (theme, zoom, last
  page, ribbon tab, pen colors, page sort, `oc.appearance` (a resolved copy of the theme and look,
  read by the inline script in `index.html` before first paint), and `oc.todo.<pageId>` for each
  planner's Group by /
  Hide completed). These do **not** sync between browsers and are not in any backup.
- **Loaded once per tab.** After updating the code, every open tab keeps running the old JavaScript
  until reloaded. Since 2026-10-15 that matters: an old tab doesn't know planner pages, shows one
  as an empty canvas, and would save a canvas over it if you typed there. *(From the code; not
  observed.)* Reload tabs after updating.

### 2.3 The data folder: `data/` (or `$DATA_DIR`)

| Path | What |
|---|---|
| `notes.db` | SQLite database. **May be almost empty on its own.** See §4. |
| `notes.db-wal`, `notes.db-shm` | Write-ahead log and its index. Part of the database. |
| `uploads/<uuid><ext>` | Pictures and attachments, named by random UUID. Original names live only in the page HTML. |

## 3. How they find each other

| Setting | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `127.0.0.1` | Loopback only. Another device on the LAN **cannot** reach it until you set `HOST=0.0.0.0`, and then anyone on that network can read and delete everything (no auth; see OD4). |
| `DATA_DIR` | `<repo>/data` | Resolved to an absolute path and printed at startup. |

The frontend uses relative URLs (`/api/...`, `/uploads/...`), so it works on whatever host and port
the server is on. Page links are `http://<host>:<port>/#/page/<uuid>`.

**The trap that bit:** on 2026-10-15 a second instance on an occupied port printed
`OneNote Clone running at http://127.0.0.1:3125` and then exited with code 0 (P5). That is fixed.
Now you get `Could not start on 127.0.0.1:3125 — the port is already in use (is another instance
running?)` and exit code 1. If you see the old banner from an old checkout, believe `netstat`, not
the banner.

## 4. How state is handled

- **Durable state:** `notes.db` + `notes.db-wal` + `uploads/`. Nothing else.
- **Derived state:** `pages.text` (plain text used by search) is computed by the browser from the
  page on every save. It is not rebuilt server-side; a page saved without it is unsearchable.
- **Schema:** created and migrated by `server/db.js` on every start. Each migration runs in a
  transaction and bumps `PRAGMA user_version` (currently `1`). Foreign keys with `ON DELETE
  CASCADE` are switched on per connection (`PRAGMA foreign_keys = ON`).
- **WAL mode, and why copying `notes.db` is not a backup.** Committed writes land in
  `notes.db-wal`. They move into `notes.db` only at a checkpoint: automatically once the WAL
  reaches ~4 MB, or when the server shuts down cleanly. Measured on the live `data/` folder,
  2026-10-15 09:5x with the server running: `notes.db` **4,096 bytes**, `notes.db-wal`
  **201,912 bytes**. Everything, schema included, was in the WAL. A copy of `notes.db` alone fails
  with `no such table: notebooks` (P8).
- **Test instances:** run a second server with its own `DATA_DIR` and `PORT`. It seeds itself.
- **What is NOT handled:**
  - **No scheduled backups.** `npm run backup` exists (§6), but nothing runs it.
  - The JSON export (`⋯ → Export backup`) does **not** include `uploads/`, trashed pages or settings (display name, themes and look). `npm run backup` does include settings, because it copies the whole database. Single themes can be carried over with "Copy theme code".
  - Orphaned uploads (file inserted, then removed from the page) are never deleted.
  - No auth, no TLS, no rate limits.
  - No conflict detection between two tabs on one page. The last save wins (OD3).
  - No server-side check of a page's `content.type`: a client that saves a canvas over a planner page replaces it (contract obligation 10).

## 5. One request, traced through the parts: typing a word

1. Keystroke in a container (`.nb-content`, contenteditable). The browser fires `input`.
   `PageEditor` (`public/js/editor.js`) converts any font-size markers, then calls
   `scheduleSave()`, which (re)starts a 600 ms timer and sets the status to "Saving…".
2. The timer fires `save()`. It builds a snapshot `{title, serialize()}` and compares it with the
   last saved snapshot. **If they are equal it stops here**: no request (e.g. you only clicked and
   an empty container was removed).
3. Otherwise `PATCH /api/pages/:id` with `{title, content: JSON string, text}` (`public/js/api.js`).
4. `server/index.js` validates the fields and runs one `UPDATE pages SET … WHERE id = ?`, bumping
   `updated_at` because title/content are present. The write goes to `notes.db-wal`.
5. The response (page list form) comes back. The editor records the snapshot as saved and emits
   `saved`, and `app.js` updates `updated_at` in its page list and re-sorts if sorting by
   modified/title. The status shows "All changes saved".
6. On failure (network error or 5xx): status "Couldn't save — retrying", one toast per outage,
   and a retry every 4 s until it succeeds. *(From reading the code, not observed:)* if the
   server is down, switching page also fails (it needs `GET /api/pages/:id`), so you stay on the
   page and the retries continue. Edits are lost only if the save keeps failing while the server
   otherwise answers (e.g. a `500` on PATCH) and you then switch page: `flush()` tries once more,
   and the next page's load replaces the unsaved one.

## 6. Everyday commands

Run from the repo root. Git Bash syntax; the same commands work in PowerShell except where noted.

```bash
npm install                                   # once
npm start                                     # → OneNote Clone running at http://127.0.0.1:3000
npm run dev                                   # same, restarts when server files change

PORT=3125 DATA_DIR=./scratch npm start        # throwaway instance (PowerShell: $env:PORT=3125; $env:DATA_DIR='./scratch'; npm start)

curl -s http://127.0.0.1:3000/api/notebooks   # health check: JSON array = up

npm run backup                                # consistent snapshot → backups/notes-<UTC timestamp>.db
npm run backup -- D:/somewhere/else           # …to another folder

npm run docs:arch                             # regenerate docs/8_architecture.html after editing docs/7_uml/

npm test                                      # 39 browser + API tests, ~34 s; uses installed Chrome (or Edge)
node --test --test-name-pattern="P1:" tests/editor.test.mjs   # one test by name
CHROME_PATH="C:/path/to/chrome.exe" npm test  # if Chrome/Edge isn't found automatically
```

`npm run backup` uses SQLite's `VACUUM INTO` over a read-only connection. It is safe while the
server runs, refuses to overwrite an existing file, then re-opens the snapshot and prints its page
count. Verified 2026-10-15: `Wrote …\notes-2026-10-15-04-32-01.db (49152 bytes, 9 pages).` It
does not copy `uploads/`. Copy that folder yourself.

Look inside the database (read-only, safe while running):

```bash
node -e "const {DatabaseSync}=require('node:sqlite'); const db=new DatabaseSync('data/notes.db',{readOnly:true}); console.table(db.prepare('SELECT n.name notebook, COUNT(p.id) pages FROM notebooks n LEFT JOIN sections s ON s.notebook_id=n.id LEFT JOIN pages p ON p.section_id=s.id AND p.deleted_at IS NULL GROUP BY n.id').all())"
```

Find and stop whatever holds the port (PowerShell):

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object OwningProcess
Stop-Process -Id <pid>
```

Stop the server: **Ctrl+C** in its terminal. That runs `db.close()`, which checkpoints the WAL into
`notes.db`. Killing the process (`Stop-Process -Force`, `taskkill /F`, closing the window) skips
that. Nothing is lost, because SQLite replays the WAL on the next open. Seen 2026-10-15: a
snapshot of a force-killed scratch server's database contained a notebook that existed only in
the WAL. But the WAL file stays, and must travel with `notes.db`.

> ⚠ **Destroys all notes:** stop the server, then delete `data/` (or the `DATA_DIR` folder).
> The next start creates a fresh database with the "Getting started" page. There is no undo. Run
> `npm run backup` first.

## 7. When it breaks, this is what it looks like

Only failures actually seen are listed here.

| Symptom | Usually |
|---|---|
| Title bar "Couldn't save — retrying", toast "Couldn't reach the server…" | Server stopped or crashed. Start it. The tab catches up on its own within 4 s (seen 2026-10-15). Don't close the tab first. |
| Startup prints `Could not start on 127.0.0.1:3000 — the port is already in use` | Another instance (or another app) holds the port. §6 shows how to find it. |
| http://localhost:3000 shows **"Index of /"** (a file listing) instead of the app, and the console mentions a WebSocket on port 3001 | Seen 2026-10-17: VS Code's **Live Preview** extension (defaults: 3000 + 3001) took the port first; `npm run dev` then failed to bind and exited while `--watch` kept running, so it looked alive. Stop Live Preview (Command Palette → "Live Preview: Stop Server", or set `livePreview.portNumber`) or run the app on another port: `$env:PORT=3002; npm run dev`. Check with `Get-NetTCPConnection -LocalPort 3000 -State Listen`: the owner should be `node.exe`, not `Code.exe`. |
| A copied `notes.db` opens but `no such table: notebooks` | It was copied without its `-wal` file while the server was running. Use `npm run backup` (P8). |
| Uploading a `.json` file via the API returns `400 {"error":"Empty upload"}` | It was sent as `application/json`. The UI does this correctly; scripts must send `application/octet-stream` (API contract obligation 3). |
| An old checkout prints "running at…" with your `DATA_DIR`, but the app shows someone else's notebooks | P5 in pre-2026-10-15 code: the port was taken, the new process quietly exited, and the **old** instance (with its own data folder) is answering. Seen 2026-10-15: all 10 requests were served by the first instance's database. |

## 8. Habits this codebase runs on

1. **Measure the fix, don't infer it.** P6 (a layout fix reported done that had never worked) and
   P4 (a fix not re-run until the next day) both came from trusting reasoning over a re-run. Every
   fix gets the same check that showed the bug.
2. **Silent success is the dangerous failure.** P5 printed success on a failed start. Obligations 1
   and 2 in the API contract both return `200` and do nothing. When adding behaviour, ask what
   happens when it fails and whether anyone would notice.
3. **No step that isn't `npm start`.** No build, no native modules, no second process (2026-10-14
   decisions). A customization that needs one has to justify it in the decisions log.
4. **A regression test counts once it has failed without its fix.** And the mutation must really
   remove the fix: on 2026-10-17 two first attempts left a fallback in place and "passed" (decisions
   2026-10-17). On 2026-10-15 each guard was
   run with its fix swapped back out. That found a test passing for the wrong reason (P3 relied on
   an earlier test) and a harness that hung instead of failing (P10). Each test sets up its own
   preconditions and doesn't rely on the previous test's ribbon tab or caret.

## 9. Glossary

| Term | Meaning here |
|---|---|
| **Container** / note container / block | One absolutely-positioned `div.nb` on the page canvas, holding a contenteditable `div.nb-content`. Stored as an item in `content.blocks`. |
| **Canvas** | The scrollable page area (`#canvas`) and its inner sheet `#pageInner`, where containers and ink live. |
| **Ink** | Pen/highlighter strokes, stored as point arrays in `content.ink` and drawn into the `#inkLayer` SVG. |
| **Tag** | A `data-tag` attribute on one paragraph (To Do, Important, …), drawn by CSS. Not a label on the page. |
| **Level** | A page's subpage depth (0–2). Only shown when the page list is sorted "Custom". |
| **Trash** / Deleted pages | Pages with `deleted_at` set. Purged after 60 days. |
| **Snapshot** (autosave) | JSON of title + serialized page, compared before saving to skip no-op saves. Not a backup. |
| **Snapshot** (backup) | A `VACUUM INTO` copy of the database from `npm run backup`. |
| **WAL** | SQLite's write-ahead log, `notes.db-wal`. Half of the database while the server runs. |
| **Rail** | The 48 px icon column on the far left (notebooks, search, recent, trash). |
| **Planner** / to-do page | A page whose `content.type` is `"todo"`: tasks grouped by month, date or tag, drawn by `todo.js`. No containers or ink. |
| **Board** / Cards page | A page whose `content.type` is `"board"`: lists of cards drawn by `board.js`. No containers or ink. |
| **Insert template** | Meeting notes, Daily journal, Project plan, Weekly planner: containers added to the current freeform page (Insert → Templates). Not a page type. |
| **Canvas page** / freeform page | Every other page: containers + ink. `editor.kind === 'canvas'`. |
| **Quick-add** | The add-box syntax shared by the planner and Cards (`parseQuickAdd()` in `todo.js`): `#tag` (Cards: `#label`, a color or a label name) and `@date` (`@today`, `@sat`, `@20 Oct`, `@3/11`). |
| **Grip** | The six-dot handle shown on hover: drag a planner task by it; a Cards list drags by its whole header. Keyboard twin: Alt+arrows. |
| **Group** (planner) | A month, date or tag heading in the planner. Computed from task fields, so dropping a task into a group sets those fields (`applyGroup()`). |
| **Template** | A recipe in `templates.js` that returns a filled page (`title`, `content`, `text`) for `POST /api/pages`. Not stored anywhere after creation. |
| **Scheme** / color scheme | 8 seed colors + a Dark/Light base. All other colors are derived (`deriveTokens()` in `theme.js`), except Classic Dark/Light, which use the hand-tuned tokens in `app.css`. |
| **Look** | Layout settings independent of color: density, corners, UI font, page style, section-tab style. Applied as `data-*` attributes on `<html>`. |
| **Appearance** | Scheme + look + your custom themes; `settings.appearance` on the server. |
