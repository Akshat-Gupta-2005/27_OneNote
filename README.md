# OneNote Clone

A self-hosted, OneNote-style notes web app. Notebooks → color-coded sections → pages (with subpages), a freeform page canvas, ink, tags, and everything saved automatically to SQLite.

## Run it

Requires **Node.js 22.13+** (uses the built-in `node:sqlite`, so there are no native modules to compile).

On Windows, double-click **`start.bat`**. It installs dependencies on first run, picks the next free port if 3000 is taken (VS Code Live Preview often holds it), opens the app in your browser once it answers, and if the app is already running just opens it. Close the window to stop the server.

```bash
npm install
npm start          # http://127.0.0.1:3000
npm run dev        # same, restarts on server file changes
npm test           # 117 browser + API tests against throwaway servers (uses your installed Chrome or Edge)
npm run backup     # consistent snapshot of the database into backups/
```

Environment variables:

| Variable   | Default      | Purpose                                                   |
|------------|--------------|-----------------------------------------------------------|
| `PORT`     | `3000`       | HTTP port                                                 |
| `HOST`     | `127.0.0.1`  | Bind address. Use `0.0.0.0` to reach it from your LAN      |
| `DATA_DIR` | `./data`     | Where the database (`notes.db`) and `uploads/` are stored |

> There is no login. If you expose it beyond your own machine, put it behind a reverse proxy with authentication.

## Features

- **Notebooks / sections / pages**: create, rename, recolor, reorder by drag and drop, and move pages between sections and notebooks. Pages can be made subpages.
- **Page templates** ("+ Add page ▾"): a **To-do planner** (checklist page with a progress bar, grouped by **month, due date or tag**, quick entry like `Sign offer letter #Sabre @20 Oct`, inline editing, undoable removal, "hide completed", drag tasks by their grip or move them with Alt+arrows, a small + beside each heading to add, ticked tasks drop to the bottom, tags listed A→Z) and **Cards** (a board of lists and cards with colored labels, covers, checklists, due dates, quick entry like `Fix login #Backend @20 Oct`, drag and drop for cards and whole lists, and keyboard moves), and **Tab** (money with people: one list per person, items as qty × each = total with who paid, quick entry like `15 3x masala` or `-20 shuttle`, a running "Adarsh owes you 469", combine items into one agreed amount, and mark some or all items paid so they fold away).
- **Insert → Templates**: add Meeting notes, a Daily journal, a Project plan or a Weekly planner to the page you are on, below what is already there (Undo in the toast).
- **Keyboard**: every shortcut is listed in Help → Keyboard shortcuts, including list navigation (↑/↓, Delete, F2, Enter), task, card and list moves (Alt+arrows), and nudging a selected container (arrows, Shift = 10 px).
- **Freeform canvas**: click anywhere on a page to start a note container. Drag a container by its top bar, resize it from the top-right corner, and press `Delete` to remove a selected container.
- **Rich text**: fonts, sizes, bold/italic/underline/strike, highlight and font colors, a format painter, bullets and numbering, indents, alignment, heading/quote/code styles, links and tables.
- **Tags**: To Do (clickable checkbox), Important, Question, Critical, Idea and Contact.
- **Insert**: pictures, file attachments, links, tables, date/time and horizontal lines. You can also paste or drag images and files straight onto the page.
- **Draw**: pen and highlighter in several colors and thicknesses, an eraser, and clear-all.
- **Dictate**: voice typing through the Web Speech API (works in Chrome and Edge).
- **Search** across all notebooks or the current one (`Ctrl+E`), with matches highlighted on the page.
- **Recent notes**, plus **Deleted pages** with restore. Deleted pages are kept for 60 days.
- **View**: rule lines and grids, zoom, full-page view, print, and export a page as HTML.
- **Theme tab**: 15 color schemes (Classic Dark/Light, Midnight, Arctic, Forest, Nightshade, Espresso, Paper Dark, Solar Dark/Light, Paper, Rose, Ocean, High Contrast Dark/Light) with hover preview and "match system"; **create your own theme** from 8 colors with a live preview and readability check, and share it as a theme code; **looks** (Classic, Modern, Compact, Cozy) plus density, corners, interface font, paper-sheet pages and section-tab style. Saved on the server, so your themes survive clearing the browser.
- **Backup**: export everything to JSON and import it again (from the `⋯` menu).
- Back/forward navigation and shareable page links (`/#/page/<id>`).

## Data

- `data/notes.db`: SQLite database (notebooks, sections, pages, settings).
- `data/uploads/`: pictures and attachments.

To back up everything, including files, copy the whole `data/` folder while the server is stopped. **Never copy `notes.db` on its own.** In WAL mode, recent writes (on a small database, everything) live in `notes.db-wal`. While the server is running, use `npm run backup`, which writes a consistent snapshot to `backups/`, and copy `data/uploads/` alongside it. The JSON export contains all notes but not the uploaded files.

## Documentation

Living project docs are in [`docs/`](docs/). Start with [`docs/3_features.md`](docs/3_features.md) (what exists and what is verified), then [`docs/6_system-guide.md`](docs/6_system-guide.md) (running, backing up, troubleshooting), then [`docs/8_architecture.html`](docs/8_architecture.html) (diagrams; regenerate with `npm run docs:arch`).

## Project layout

```
server/
  index.js   Express app + REST API
  db.js      SQLite connection and schema migrations
public/
  index.html App shell (title bar, ribbon, panes, canvas)
  css/app.css
  js/app.js     Navigation, ribbon, menus, search, shortcuts
  js/editor.js  Page canvas: containers, formatting, ink, paste/drop, autosave
  js/ui.js      Menus, dialogs, toasts, DOM helpers
  js/icons.js   Inline SVG icons
  js/api.js     Fetch wrapper
```

## API (summary)

| Method | Path | |
|---|---|---|
| GET/POST | `/api/notebooks` | list / create |
| PATCH/DELETE | `/api/notebooks/:id` | rename, recolor / delete |
| GET | `/api/notebooks/:id/tree` | sections + page list |
| POST | `/api/sections` · PATCH/DELETE `/api/sections/:id` | |
| POST | `/api/pages` · GET/PATCH/DELETE `/api/pages/:id` | DELETE moves the page to the trash; `?permanent=1` deletes it for good |
| POST | `/api/pages/:id/restore` | restore from the trash |
| GET/DELETE | `/api/trash` | |
| PUT | `/api/reorder` | `{ kind, ids }` |
| GET | `/api/search?q=&notebook=` · `/api/recent` | |
| POST | `/api/uploads` | raw body, `X-Filename` header |
| GET/POST | `/api/export` · `/api/import` | JSON backup |
