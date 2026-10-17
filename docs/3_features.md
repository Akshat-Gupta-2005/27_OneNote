# FEATURES — OneNote Clone

Living document. Updated at the end of every working session, as part of the work. Reasoning and
history live in [4_decisions.md](4_decisions.md).

**Last updated:** 2026-10-17 (latest). **Movable everything, consistent across page kinds:** planner
tasks drag by a grip (reorder, or drop into another month/date/tag group) and move with Alt+arrows;
Cards lists drag by their header and move with Alt+←/→; a selected freeform container nudges with
the arrow keys; Cards quick-add now understands `#label @date` like the planner. `npm test`: **98
tests pass**, 63.6 s; 30 of 30 guards proven by removal; 101 of 134 features verified.

**Before that, same day:** third customization: the four note templates (Meeting notes,
Daily journal, Project plan, Weekly planner) moved from "Add page" to **Insert → Templates**,
inserting into the current page; a new **Cards** page template (Trello-style board with labels,
covers, checklists, due dates, drag and drop and keyboard moves); and a **keyboard audit**: every
shortcut in Help is now pressed by a test. Found and fixed P13 (Delete on the page list and F2 on
sections never worked). `npm test`: **83 tests pass**, three runs in a row, 44.6–55.1 s; 22 of 22 guards
proven by removal. 96 of 129 features verified. Next: the owner's next customization; **reload open
tabs**. Later the same day: Cards backgrounds
and theme covers changed to **solid colors from the theme** (owner disliked first the fixed blue
gradient, then any gradient). `npm test` after that: 84 pass, 55.8 s.

**Earlier —** 2026-10-16: Theme tab (14 schemes, custom themes, looks), P11–P12, 52 tests.
2026-10-15 (session 3): page templates + to-do planner, `npm test` (39 tests), P9–P10,
Road to Sabre page created.
2026-10-15 (session 2): W1 docs written from observed behaviour, `npm run backup`
added, P5–P8 found and fixed. 0 tests in the repo at that point.
2026-10-14: v1 clone built in one session; P1–P4 found and fixed.

## Status legend

| Status | Meaning |
|---|---|
| `Planned` | Agreed, not started |
| `Building` | In progress right now |
| `Done` | Implemented **and** verified: seen working in a browser, by `npm test`, or via `curl`, date noted |
| `Written` | Code exists and is wired into the UI, but nobody has watched it work yet. **Not** `Done`. |
| `Cut` | Deliberately dropped. See 4_decisions.md |

★ = worth a blog post. **(T)** in "What it does" = covered by a committed test in `tests/` (run
`npm test`). Rows without (T) were verified once by hand or a throwaway script on the date shown.

## 3.3 Code map

    package.json              scripts start / dev / test / backup / docs:arch
                              dependency: express ^5.1.0 (5.3.0 installed); devDependency: playwright-core ^1.64.1
    server/
      index.js        480     Express app: all /api routes, validation, seed, trash purge, upload serving, startup error
      db.js            72     open SQLite (WAL, foreign_keys, busy_timeout), numbered migrations via PRAGMA user_version
    public/
      index.html      315     shell + first-paint appearance script: title bar, ribbon (6 tab panels), rail, side-panel views, canvas, hidden file inputs
      css/app.css     883     theme tokens (dark/light), look variables + data-* rules, layout, ribbon, panes,
                              containers, tags, ink, to-do planner, cards board, theme gallery/editor,
                              menus, mobile, print
      js/app.js      1608     state + navigation, CRUD, list keyboard, templates menu + insert templates, Theme tab, drag & drop,
                              search/recent/trash panes, ribbon commands & dropdowns, shortcuts, save-status UI, boot
      js/editor.js   1359     PageEditor: load/serialize/autosave, structured views (todo | board), containers + arrow nudge, insertBlocks(),
                              formatting, tags, tables, uploads, paste sanitising, copy, drop, ink + eraser,
                              search highlight, format painter, dictation, HTML export
      js/todo.js      780     To-do planner: data model + normalize, quick-add parser, Month/Date/Tag grouping,
                              drag/keyboard task moves (applyGroup), rendering, task/month menus, date popover, view prefs, export
      js/templates.js 108     PAGE_TEMPLATES (Blank, To-do planner, Cards) + INSERT_TEMPLATES (4 note templates)
      js/board.js     663     Cards board: data model + normalize, lists, cards, card dialog, card + list drag & drop,
                              keyboard, #label @date quick-add (uses parseQuickAdd from todo.js)
      js/theme.js     541     appearance: color math, 14 schemes, token derivation, looks, gallery, theme editor,
                              server persistence + first-paint cache
      js/ui.js        251     h() builder, menus/submenus/popovers, modal/prompt/confirm, toasts, date/size formatters
      js/icons.js     105     inline SVG icon set, hydrateIcons(), setIcon()
      js/api.js        32     fetch wrapper (JSON + errors), upload()
    scripts/
      backup.mjs       32     VACUUM INTO snapshot + page-count check (npm run backup)
      build-architecture.mjs 224  generates docs/8_architecture.html from docs/7_uml/*.md (npm run docs:arch)
    tests/
      helpers.mjs     118     throwaway server (free port, temp DATA_DIR), installed Chrome/Edge, page helpers
      api.test.mjs    121     contract: shapes, errors, silent-failure obligations, export/import, P5
      editor.test.mjs 168     persistence, P1–P4, P6, P7, P9, no-op save guard
      todo.test.mjs   216     planner: parser, views, progress, edit, undo, persistence, search, refusals
      templates.test.mjs 93   page vs insert templates, placement below notes, title rules, undo, refusal on boards
      board.test.mjs  188     Cards: lists, card dialog, badges, drag & drop, keyboard moves, persistence, search
      shortcuts.test.mjs 272  every shortcut in Help (36), incl. list Delete/F2 (P13), container nudge
      moving.test.mjs 181     drag + Alt-arrow moves: planner tasks across views, Cards lists, Cards #label @date
      theme.test.mjs  205     Theme tab: schemes, preview, looks, editor, persistence, first paint, import, system mode
    docs/                     this documentation set; 8_architecture.html is generated, never hand-edited

Line counts: `wc -l`, 2026-10-17 (latest). App + backup script: 7,229; docs generator: 224; tests: 1,562;
total 9,015.

**Not yet built:** section groups, OneNote file import, multi-device sync/conflict detection,
authentication, scheduled backups, cleanup of orphaned uploads, Markdown export, collapsing
subpages in the page list, drag-to-reorder tasks inside the planner, recurring tasks, CI.

### The central pipeline: an edit becoming durable

| Step | File | State | What happens |
|---|---|---|---|
| 1 | `public/js/editor.js` `bind()` (canvas) or `todo.js` `change()` (planner) | edit | `scheduleSave()` restarts a 600 ms timer; status → "Saving…" |
| 2 | `editor.js` `save()` | timer fired | Snapshot `{title, serialize()}` compared with the last saved one. **Equal → stop, no request.** `serialize()` returns the canvas or the planner data depending on `kind`. |
| 3 | `public/js/api.js` | request | `PATCH /api/pages/:id` `{title, content: string, text}` |
| 4 | `server/index.js` | handler | Fields validated, one `UPDATE`, `updated_at` bumped |
| 5 | `server/db.js` / SQLite | committed | Row written to `data/notes.db-wal` (checkpointed into `notes.db` later) |
| 6 | `public/js/app.js` `setupEditorEvents()` | `saved` / `status` | Page list updated; "All changes saved". On failure: one toast, retry every 4 s |

## 3.4 Features

### Storage and server

| Feature | Status | What it does | Lives in | Star |
|---|---|---|---|---|
| SQLite schema + migrations | Done 2026-10-15 | Fresh `DATA_DIR` → 4 tables, `user_version` 1, seeded "My Notebook / Quick Notes / Getting started" (T) | `server/db.js`, `seed()` in `server/index.js` | |
| Notebook/section/page REST API | Done 2026-10-15 | Every route's success and error shape captured with `curl`; error table asserted (T) | `server/index.js` | |
| Create a page with content in one request | Done 2026-10-15 | `POST /api/pages` with `content` + `text` → stored as sent and searchable at once (T) | `POST /api/pages` | |
| Insert page below another | Done 2026-10-15 | `after_id` puts B directly under A, C stays after B (T) | `POST /api/pages` | |
| Soft delete + restore + permanent delete | Done 2026-10-15 | `DELETE` → `/trash`; `restore` returns `notebook_id`; `?permanent=1` → 404 after (T) | `server/index.js` | |
| Trash purge after 60 days | Written | Runs at startup and every 6 h. Never observed purging (needs 60-day-old rows) | `purgeTrash()` | |
| Cascading deletes | Done 2026-10-15 | Deleting a notebook → its `/tree` 404s and creating a page in its old section → `400 Unknown section` | FK `ON DELETE CASCADE` | |
| `updated_at` only on title/content | Done 2026-10-15 | Level-only PATCH leaves it; title PATCH bumps it; `level: 9` clamps to 2 (T) | `PATCH /api/pages/:id` | |
| Uploads stored on disk, served safely | Done 2026-10-15 | `.json` served `attachment` + `nosniff`; JSON-typed upload refused (obligation 3) (T) | `/api/uploads`, `/uploads` static | |
| JSON export / import (API) | Done 2026-10-15 | Import of an export → same counts, all-new ids (T) | `/api/export`, `/api/import` | |
| Search API, multi-term | Done 2026-10-15 | `proxmox snapshot` matches pages with both terms; ~24 ms at 2k pages | `/api/search` | |
| Startup error reporting | Done 2026-10-15 | Port taken → `…the port is already in use…`, exit 1, no banner (P5) (T) | end of `server/index.js` | ★★ |
| `npm run backup` | Done 2026-10-15 | `VACUUM INTO` while running; snapshot opens with its page count. Used on the owner's data before adding Road to Sabre: `notes-2026-10-15-05-24-33.db` (P8) | `scripts/backup.mjs` | ★★★ |

### Navigation and organisation

| Feature | Status | What it does | Lives in | Star |
|---|---|---|---|---|
| Notebook → section → page panes | Done 2026-10-14 | Layout matches the owner's OneNote screenshot; dark and light screenshots taken | `index.html`, `renderSections/renderPages` in `app.js` | |
| Add section + inline rename | Done 2026-10-14 | New section → input focused → typed "Projects" → saved | `addSection`, `startRenameSection` | |
| Add page, title focus | Done 2026-10-15 | `+ Add page` focuses the title (T) | `addPage`, `titleEl` keydown | |
| Add notebook | Done 2026-10-14 | Created "Work" with "New Section 1" | `addNotebook` | |
| Delete page + Undo toast | Done 2026-10-14 | Delete opens the next page; Undo restores and reopens the deleted one | `deletePage`, `restorePage` | |
| Drag to reorder pages | Done 2026-10-14 | Dragged 3rd page to the top; order survived reload | `reorderPage` | |
| Back/forward + page links | Done 2026-10-14 | Browser Back returned from the new notebook to the previous page | `navigateToPage`, `popstate` | |
| Context menus (section) | Done 2026-10-14 | Right-click menu rendered (screenshot) | `sectionMenu` | |
| Rename/recolor/delete notebook | Written | Notebook picker ⋯ menu | `notebookMenu` | |
| Section color, delete, reorder, move to notebook | Written | Section context menu, drag | `sectionMenu`, `reorderSection`, `moveSection` | |
| Drag page onto section (move) | Written | | `movePage` | |
| Subpages (make/promote, new subpage) | Written | API `level` verified; UI menu items not exercised | `pageMenu`, `setPageLevel` | |
| Move page dialog (any notebook) | Written | | `moveDialog` | |
| Page sort modes | Written | Custom / alphabetical / created / modified | `sortedPages`, `setSort` | |
| Recent notes pane | Written | API verified; pane not opened in a test | `loadRecent` | |
| Deleted pages pane (restore / delete forever / empty) | Written | API verified; pane not opened in a test | `loadTrash` | |
| Search pane | Done 2026-10-14 | `immich` → found "BackUp" → clicking opened it | `runSearch`, `openResult` | |
| Search-hit highlighting on the page | Written | CSS Custom Highlight API; not checked visually | `highlight()` in `editor.js` | |
| Mobile drawer layout | Done 2026-10-15 | 390 px: page 390 px wide, ribbon tabs scroll (P6) (T) | `@media (max-width: 760px)` | ★ |

### Page templates and the to-do planner

| Feature | Status | What it does | Lives in | Star |
|---|---|---|---|---|
| "+ Add page ▾" page templates | Done 2026-10-17 | Blank page, To-do planner, Cards: the templates that change what a page *is* (T) | `PAGE_TEMPLATES`, `openTemplateMenu()` | |
| Page template from the page context menu | Written | Same list as a submenu; not exercised | `pageMenu` | |
| Insert → Templates into the current page | Done 2026-10-17 | Meeting notes, Daily journal, Project plan, Weekly planner added 40 px below the lowest container, layout kept (T) | `insertTemplate()` in `app.js`, `insertBlocks()` | |
| Title rules when inserting | Done 2026-10-17 | Untitled page takes the template title; otherwise an `<h1>` (or a heading container for multi-container templates) (T) | `insertTemplate()` | |
| Undo an insert | Done 2026-10-17 | Toast Undo removes exactly the inserted containers (T); a stale toast says the page is no longer open | `insertTemplate()` | |
| Meeting notes / Daily journal / Project plan / Weekly planner content | Done 2026-10-17 | Same sections as before; Weekly: Monday of this week, 2 rows (T) | `INSERT_TEMPLATES` | |
| Inserted notes searchable | Done 2026-10-17 | `Agenda` finds the page after the autosave (T) | editor autosave | |
| Refused on planner and board pages | Done 2026-10-17 | Toast "freeform pages only", nothing added (T) | `insertTemplate()` | |
| To-do planner page type | Done 2026-10-15 | Eyebrow, big title, description, `x of y done` + %, progress bar; no containers or ink on the page (T) | `todo.js`, `kind` in `editor.js` | |
| Month view | Done 2026-10-15 | Month groups with range or custom subtitle, NOW badge, done/total, editable note, add box per month (T) | `groups()` in `todo.js` | |
| Date view | Done 2026-10-15 | Overdue first (LATE), one group per date with TODAY badge and "in n days", No date last; add box per date (T) | `groups()` | |
| Tag view | Done 2026-10-15 | One group per tag in first-use order + No tag; adding in a group applies its tag (T) | `groups()` | |
| Quick-add `#tag @date` | Done 2026-10-15 | 10 parser cases incl. `@20 Oct`, `@3/11`, `@sat`, next-year roll, invalid `@31/2` kept as text (T). Add boxes hint `· #tag @date` since 2026-10-17 (T) | `parseQuickAdd()` | ★ |
| Drag tasks to reorder or re-file | Done 2026-10-17 | Grip on hover. Within a group: reorder. Into another group: takes its month (a date outside it is cleared), date, tag, or "none". Overdue refuses drops. Survives reload (T) | `dropTarget()`, `applyGroup()`, `moveTask()` | ★ |
| Move tasks with the keyboard | Done 2026-10-17 | Alt+↑/↓ within the group; Alt+←/→ to the previous/next group (skips Overdue); focus follows the task (T) | `moveByKey()` | |
| `@date` moves a task to its month | Done 2026-10-15 | Added under this month with next month's date → appears under next month (T) | `addTask()` | |
| Check off, progress and counts | Done 2026-10-15 | 1 of 3 → 33%; month count 1/2 (T) | `onClick` toggle | |
| Hide completed | Done 2026-10-15 | Done tasks hidden, counts unchanged (T) | `prefs.hideDone` | |
| Inline edit | Done 2026-10-15 | Click text → input → Enter saves (T) | `startEdit()` | |
| Remove with Undo | Done 2026-10-15 | Undo restores the task at its old position (T) | `remove()` | |
| Due-date popover | Done 2026-10-15 | "Tomorrow" quick pick sets the date chip (T). Typing a date in the picker not exercised | `datePopover()` | |
| Tag menu, task ⋯ menu (move to month, mark done), month subtitle dialog | Written | Not exercised | `tagMenu`, `taskMenu`, `monthMenu` | |
| Add month / remove month → Unscheduled | Done 2026-10-15 | New month group appears; removing a month with n tasks puts n under Unscheduled (T) | `addMonth()`, `monthMenu()` | |
| View remembered per page; switching views never saves | Done 2026-10-15 | Tag view restored after reload; 3 switches → 0 PATCH (T) | `prefs` in `localStorage` `oc.todo.<id>` | ★ |
| Header, notes and tasks persist | Done 2026-10-15 | Eyebrow, description, month note, done state survive reload (T) | `serialize()` | |
| Planner text searchable | Done 2026-10-15 | `verification forms` finds the planner (T); `PyTest` finds Road to Sabre on the owner's server | `todoPlainText()` | |
| Drawing / containers / rule lines / file drop refused on planner pages | Done 2026-10-15 | Pen mode and New container leave the page unchanged, with a toast (T) | guards in `editor.js`, `app.js` | |
| Planner HTML export, phone layout | Written | Not exercised | `exportHtml()`, CSS media query | |
| Owner's "Road to Sabre" page | Done 2026-10-15 | Created in Quick Notes from the screenshots: 41 tasks (15/3/17/6), 1 done, 7 tags, January subtitle "Joining month". Rendered on a scratch copy first: `1 of 41 done 2%`, counts `1/15 0/3 0/17 0/6` | owner's `data/` | |

### Page canvas and editing

| Feature | Status | What it does | Lives in | Star |
|---|---|---|---|---|
| Click anywhere → new container | Done 2026-10-14 | Created at the click point, including at 120% zoom ((1000,700) → (990,688)) | `bind()` mousedown, `point()` | |
| Drag container by handle | Done 2026-10-14 | Moved to (260, 200), persisted | `onBlockPointerDown` | |
| Arrow keys nudge the selected container | Done 2026-10-17 | 1 px, 10 px with Shift; never past the left/top edge; saved (T) | `onKeyDown()` in `editor.js` | |
| Resize container / Delete key on handle | Written | | `onBlockPointerDown`, `onKeyDown` | |
| Empty containers discarded | Done 2026-10-15 | 3 clicks with no typing → 0 empty containers left (T) | `focusout` handler | |
| No-op autosave skipped | Done 2026-10-15 | 3 clicks → **0** PATCH; same with the guard removed → test fails (T) | `save()` snapshot check | ★★ |
| Autosave + reload persistence | Done 2026-10-15 | Title, plain and tagged lines, bold, ink stroke present after reload (T) | `save()`, `load()` | |
| Commands act on the live caret | Done 2026-10-15 | Ctrl+1 straight after typing no longer moves the caret back one character (P9); a selection made just before focusing the font-size box is kept (P12, 8/8 vs 6/8 without) (T) | `restoreSelection()` | ★★ |
| Offline retry + recovery | Done 2026-10-15 | Server stopped → "Couldn't save — retrying", exactly 1 toast in 9.5 s → restarted → saved and present after reload (P7) (T) | `save()`, `setupEditorEvents` | |
| Title + created date/time | Done 2026-10-14 | Title persisted; date line shown (locale format: "October 14, 2026 · 10:34 PM") | `load()` | |
| Bold (Ctrl+B) | Done 2026-10-15 | `<b>Tagged line</b>` stored (T) | `exec()` | |
| Styles dropdown (Heading 1–6, Quote, Code, Normal) | Done 2026-10-14 | Heading 1 → `<h1>A heading</h1>` | `setBlockStyle` | |
| Font size (box and dropdown) | Done 2026-10-15 | 20 → `20pt` span, 8 → `8pt` span (P1) (T) | `setFontSize`, `fixFontSizes` | ★ |
| Font name, italic, underline, strike, sub/sup | Written | | `exec`, `setFont` | |
| Highlight & font color palettes | Written | | `setHighlight`, `setColor` | |
| Format painter | Written | | `startPainter`, `applyPainter` | |
| Clear formatting | Written | | `clearFormatting` | |
| Bullets/numbering/indent/alignment | Written | Tab-indent seen working incidentally during P2 | `exec` | |
| Tags: To Do via Ctrl+1 | Done 2026-10-15 | `data-tag="todo" data-checked="false"` stored (T) | `toggleTag` | |
| To Do checkbox click toggles | Done 2026-10-14 | Click on the box → `data-checked="true"` | `onClick` | |
| Other tags (Important, Question, Critical, Idea, Contact) | Written | Important renders on the welcome page (screenshot); applying from the menu not exercised | `toggleTag`, CSS `[data-tag]` | |
| Table insert grid + Tab between cells | Done 2026-10-15 | `<td>c1</td><td>c2</td>` (P2) (T) | `insertTable`, `moveCell` | |
| Table row/column operations | Written | | `tableOp` | |
| Picture insert (file picker) | Done 2026-10-15 | Uploaded `<img>` has no `style` or `data-new` (P3) (T) | `insertFiles` | |
| File attachments, image resize handle, drag-drop files, paste images | Written | | `insertFiles`, `onImgResize`, `onDrop`, `onPaste` | |
| Paste sanitising (foreign HTML) | Done 2026-10-15 | Scripts, `on*`, `javascript:`, styles and src-less `<img>` removed; safe link kept (P4) (T) | `sanitizeHtml` | |
| Internal copy keeps formatting | Written | Custom clipboard type `application/x-onenote-clone` | `onCopy` | |
| Links (dialog, Ctrl+K, Ctrl+click opens) | Written | | `linkDialog`, `insertLink`, `onClick` | |
| Date / time / date & time insert | Written | | `insertStamp` | |
| Dictation (Web Speech API) | Written | Needs a microphone; cannot be tested headless | `toggleDictation` | |
| Rule lines and grids | Written | | `setLines`, `.lines-*` CSS | |
| Zoom 25–300% | Done 2026-10-14 | Click placement correct at 120% | `setZoom` | |
| Pen ink, persisted | Done 2026-10-15 | 1 stroke present after reload (T) | `onInk*`, `renderInk` | |
| Eraser | Done 2026-10-14 | Drag across a stroke → 1 → 0 strokes | `eraseAt`, `hitStroke` | ★★ |
| Highlighter ink, pen colors/thickness, clear ink | Written | | `inkToolMenu`, `clearInk` | |
| Full page view, print, export page HTML | Written | | `toggleFullPage`, `print`, `exportHtml` | |
| Backup export/import from the ⋯ menu | Written | API verified (T); UI file picker path not exercised | `appMenu`, `importBackup` | |
| Display name | Written | API verified (`displayName`) | `changeDisplayName` | |

### Cards board

| Feature | Status | What it does | Lives in | Star |
|---|---|---|---|---|
| Cards page template | Done 2026-10-17 | New page with To do / Doing / Done lists on the theme-tinted background (T) | `emptyBoard()` in `board.js` | |
| Add cards | Done 2026-10-17 | Enter adds and keeps the box open; Esc closes; the Add card button never navigates (T) | `addCard()`, composer form | |
| Card face | Done 2026-10-17 | Cover (label color, or a tall solid theme color), label pills, title, badges: description, checklist `2/3` (green when complete), due date (T) | `cardEl()` | |
| Due date states | Done 2026-10-17 | Red overdue, green complete (T); yellow "due soon" seen in code only | `dueState()` | |
| Card dialog | Done 2026-10-17 | Title, list, labels, description, checklist with progress (67% at 2/3), due + complete, cover, Delete (T) | `openCard()` | |
| Drag and drop | Done 2026-10-17 | Cards between lists and above another card (T); lists by their header, with a drop marker (T) | `onDragStart()`, `colDropTarget()`, `moveColumnTo()` | |
| Keyboard | Done 2026-10-17 | Arrows move focus; Alt+arrows move the card; Alt+←/→ on a list title moves the list; Enter opens; Delete deletes with Undo (T) | `onKeyDown()` | ★ |
| Quick-add `#label @date` | Done 2026-10-17 | `#red` or a label name picks that label; an unknown `#Backend` names the first free label (toast) and is reused after; `@20 Oct` sets the due date; a line of only symbols is refused (T) | `addCard()`, `resolveLabel()` + `parseQuickAdd()` | ★ |
| Lists | Done 2026-10-17 | Add, rename (click title), move left/right, delete (asks if not empty) (T) | `columnMenu()`, `renameColumn()` | |
| Label names | Done 2026-10-17 | Named labels show on hover (T) | `labelsMenu()` | |
| Backgrounds are solid theme colors | Done 2026-10-17 | Theme tint (default), Accent, Soft, Page color: solid `color-mix` of theme tokens; no fixed colors and no gradients allowed (both guards tested); old fixed-gradient boards and covers load as the tint (T); seen on Paper and Classic Dark | `backgroundMenu()`, `labelsMenu()` | |
| Persistence + search | Done 2026-10-17 | Survives reload; checklist items searchable (T) | `serialize()`, `boardPlainText()` | |
| Delete a non-empty list asks first, board HTML export | Written | Not exercised | `deleteColumn()`, `exportHtml()` | |

### Keyboard

| Feature | Status | What it does | Lives in | Star |
|---|---|---|---|---|
| Every shortcut in Help is pressed by a test | Done 2026-10-17 | 36 rows in 5 groups; the dialog row count is asserted (T) | `SHORTCUTS` in `app.js`, `tests/shortcuts.test.mjs` | ★ |
| Page list: ↑/↓/Home/End, Delete, F2, Enter | Done 2026-10-17 | Delete → Deleted pages with Undo, focus stays in the list (P13) (T) | `listKeys()` in `setupNav()` | |
| Section list: ↑/↓, Delete (asks), F2, Enter | Done 2026-10-17 | F2 shows the rename box (P13) (T) | `listKeys()` | |
| Planner: Delete / Enter / F2 on a focused task | Done 2026-10-17 | Delete removes with Undo and focuses the next task (T) | `onKeyDown()` in `todo.js` | |

### Theme tab (appearance)

| Feature | Status | What it does | Lives in | Star |
|---|---|---|---|---|
| Theme tab between View and Help | Done 2026-10-16 | Tab order Home·Insert·Draw·View·Theme·Help (T) | `index.html` | |
| 14 color schemes | Done 2026-10-16 | Classic Dark/Light (hand-tuned CSS) + 12 derived (Midnight, Arctic, Forest, Nightshade, Espresso, Solar Dark/Light, Paper, Rose, Ocean, High Contrast Dark/Light); all pass their contrast checks (T) | `SCHEMES` in `theme.js` | |
| Scheme gallery with hover preview | Done 2026-10-16 | Hover shows the scheme on the whole app; leaving/Escape restores (T) | `openSchemeGallery()` | |
| Quick swatches in the ribbon | Done 2026-10-16 | One click switches; active swatch marked (T) | `renderThemeTab()` in `app.js` | |
| Match system (Classic Light / Dark) | Done 2026-10-16 | Follows `prefers-color-scheme` live (T) | `setFollowSystem()` | |
| Create / edit your own theme | Done 2026-10-16 | 8 color pickers, Dark/Light base, "copy colors from"; app previews live; Cancel restores (T) | `openThemeEditor()` | |
| Derived palette with enforced contrast | Done 2026-10-16 | ~40 tokens from 8 seeds; accent text ≥ 4.5:1, links ≥ 4.5:1, headings ≥ 3:1 even from a pale accent (T) | `deriveTokens()`, `ensureContrast()` | ★★ |
| Live readability report | Done 2026-10-16 | Text/panels/title bar/accent/checklist ratios with ✓/⚠; ⚠ at 1.4:1 shown (T) | `contrastReport()` | |
| Editor stays readable during preview | Done 2026-10-16 | Panel pins its own token values (P11) (T) | `openThemeEditor()` | ★ |
| Theme codes: copy / import | Done 2026-10-16 | Code → import creates a new theme; invalid code → toast, nothing added (T) | `themeCode()`, `importThemeCode()` | |
| Duplicate / delete custom theme | Done 2026-10-16 | Deleting the active theme falls back to Classic of the same base (T). Duplicate not exercised | `customMenu()` | |
| Looks: Classic, Modern, Compact, Cozy | Done 2026-10-16 | Preset sets all 5 knobs; Compact → 30 px section rows (T) | `LOOKS`, CSS `html[data-*]` | |
| Look knobs: density, corners, font, page, section tabs | Done 2026-10-16 | Paper page has a shadow; Dot tabs are round; Georgia applies to the UI; any knob change → "Custom" (T). Corners and Filled tabs seen in screenshots only | `openLookOptionMenu()` | |
| Saved on the server, applied before first paint | Done 2026-10-16 | Survives reload; with `app.js` blocked the inline script still applies accent + density (T) | `settings.appearance`, `oc.appearance`, `index.html` | ★ |
| Reset appearance | Done 2026-10-16 | Back to Classic Dark + Classic look; custom themes kept (T) | `resetAppearance()` | |
| Migration from the old Dark/Light/System setting | Written | `oc.theme` read once when the server has no `appearance`; not exercised | `fromLegacy()` | |

### Tooling

| Feature | Status | What it does | Lives in | Star |
|---|---|---|---|---|
| `npm test` | Done 2026-10-17 | 98 tests in 9 suites, all pass, 63.6 s (was 83 in 44.6–55.1 s before `moving.test.mjs`); each suite gets its own server on a free port and a temp `DATA_DIR` | `tests/` | |
| Regression tests proven by removing the fix | Done 2026-10-17 | 30 of 30 guards fail with their fix removed. Latest 8: planner drop, month drop clears a foreign date, planner Alt+arrows, date-view drop, list drop, list Alt+arrows, label reuse by name, container nudge. Earlier 22: 15 earlier (P1–P7, P9, no-op save, theme ×6) + 7 on 2026-10-17 (page and section focusability for P13, list focus restore, planner Delete, card dialog Enter, composer submit handler, insert placement). Found P10 earlier; this round showed two mutations that were not real removals (see decisions) | mutation scripts | ★★ |

### Deferred and rejected

| Feature | Status | Note |
|---|---|---|
| FTS5 search | Planned (conditional) | OD2: only if search on real data passes 150 ms |
| Conflict detection between tabs | Planned (conditional) | OD3: needed once a second device is used |
| Authentication | Planned (conditional) | OD4: only if exposed beyond localhost |
| Editor engine (ProseMirror/Tiptap) | Planned (conditional) | OD5: only if `execCommand` blocks a customization |
| Section groups, OneNote import | Planned | Not requested yet. Candidates for W3 |
| To-do block inside a freeform page | Cut | Owner chose a dedicated planner page (decisions 2026-10-15) |
| `Ctrl+N` / `Ctrl+T` shortcuts | Cut | Chrome never delivers them to pages. `Ctrl+Alt+N` instead (decisions 2026-10-14) |

## 3.5 Current state / measured results

All measured on Windows 10, Node 26.11.1, installed Chrome, scratch `DATA_DIR`s (not the owner's
data) unless stated.

| What | Result | How |
|---|---|---|
| Tests in repo | **98 pass, 0 fail**, 9 suites, 63.6 s | `npm test`, 2026-10-17 (latest). Before `moving.test.mjs`: 83 in 44.6–55.1 s over three runs |
| Regression guards seen failing without their fix | 30 / 30 | mutation scripts: swap the fix back out, run the test file, check the named test failed, restore the file |
| Features verified / total | **101 Done / 134** (33 Written, 0 Building) | Rows in the §3.4 feature tables (not "Deferred") |
| Server start → first API response (fresh data dir, includes seeding) | 888 ms | 2026-10-15 session 2, bash loop polling `curl` every 50 ms |
| Search, 2,001 pages × ~2 KB text | 24 ms (1 term), 24 ms (2 terms), 26 ms (no match) | 2026-10-15 session 2, median of 5 warm `curl -w %{time_total}` |
| Search, 20,001 pages × ~2 KB text | 201 / 214 / 228 ms | same |
| DB size at 20,001 pages | 94.6 MB (`notes.db` after checkpoint) | `stat`. ~4.7 KB/page because text is stored twice (HTML in `content`, plain in `text`) |
| Owner's live DB | `notes.db` 4,096 B, `notes.db-wal` 201,912 B | `stat` on 2026-10-15 while the server ran (P8) |
| Backup of owner's data before adding Road to Sabre | 49,152 B, 2 pages | `npm run backup`, 2026-10-15 session 3 |
| Dependencies | 1 runtime (express) + 1 dev (playwright-core); 66 packages, 17 MB in `node_modules`, 14 MB of it playwright-core | `ls node_modules \| wc -l`, `du -sh` |
| Source size | 7,229 lines app + backup; 224 docs generator; 1,562 tests | `wc -l`, 2026-10-17 |

## 3.6 Talking points

### ★★★ The database file was 4 KB. All my notes were in the other file.

SQLite in WAL mode writes every commit to `notes.db-wal`, and only folds it into `notes.db` at a
checkpoint, automatically at ~4 MB of WAL or on a clean shutdown. While my server was running,
`data/notes.db` was 4,096 bytes and `notes.db-wal` was 201,912 bytes. A copy of just `notes.db`
opened fine and then failed with `no such table: notebooks`. Even the schema had not been
checkpointed yet.

The naive backup ("copy the database file") silently produces an empty database for exactly the
users most likely to do it: people with small personal databases that never hit the auto-checkpoint
threshold. The answer is to back up through SQLite itself. `VACUUM INTO` over a read-only
connection gives a consistent, compacted copy while the app keeps writing, and the snapshot
contained a notebook that existed only in the WAL. That's what `npm run backup` does, and it
re-opens the snapshot and counts pages before claiming success (P8, `scripts/backup.mjs`).

### ★★ The selection I restored was one keystroke old

Every ribbon command first puts the selection back where it was, because clicking the ribbon can
move focus. The saved selection came from `selectionchange`, which browsers fire
**asynchronously**. Pressing Ctrl+1 in the same instant as the last keystroke restored a caret one
character behind, and moved the real caret there. The visible result was `<b>Tagged lin</b>e`
after Ctrl+1, Shift+Home, Ctrl+B.

Nobody noticed by hand, because people pause between typing and clicking. A test that types and
presses a shortcut immediately is faster than any person, and that's exactly the case where the
cache is stale. The fix trusts the live selection whenever the caret is in the page, and keeps the
saved one only for when focus has genuinely left (P9, `restoreSelection()`). A day later a flaky
test showed the same race on the other path: focus leaving for the font-size box before
`selectionchange` fired. The selection is now also recorded on `focusout` (P12). One cache, two
ways to read it stale.

### ★★ Express 5 printed "running at…" and then quietly exited

Starting a second instance on a busy port printed the normal startup banner, exited with code 0,
and left the *first* instance (with a different data folder) answering every request. Express 5
wires `app.listen`'s callback to the server's `error` event as well as `listening`, so a callback
written for Express 4 treats a failed bind as success. Nothing kept the event loop alive, so Node
simply finished.

What makes it worth telling is that the failure mode is a lie, not a crash: the log says the
opposite of what happened, and the symptom shows up somewhere else entirely (the wrong notes in the
browser). The fix is four lines; the lesson is to read major-version changelogs for every callback
signature (P5, `server/index.js`).

### ★★ Proving the tests by breaking the code

Each regression test was run once with its fix taken back out: the fixed lines swapped for the
original buggy ones, only that test run, then the file restored. 9 of 9 failed as they should.
The exercise also caught two things a green run never shows. The P3 test "failed" without its fix,
but by timing out, because on its own it never opened the Insert tab. And the P7 test hung for
200 s instead of failing, because the harness stopped an already-stopped server and waited forever
for an `exit` event that had fired before (`exitCode` is `null` for a signal-killed process;
`signalCode` isn't). A test suite is code too, and its failure path is the part you only exercise
when you need it (P10).

### ★★ Eight colors in, forty tokens out, readable by construction

The app's look comes from ~40 CSS variables: hover, selected, borders, dim text, heading levels,
rule lines, checklist tints. A theme editor with 40 pickers is unusable, and home-made themes
usually break on exactly the colors nobody thinks to pick, like a pale accent that makes the
selected section's label vanish. So a theme is 8 seed colors, and `deriveTokens()` builds the rest
by mixing panel and text colors. Any color that must stay legible is pushed toward white or black
until it passes WCAG contrast: accent text 4.5:1 on panels, links 4.5:1, headings 3:1. A pale
yellow accent on near-white panels still produces a readable selected label (tested). Body text
is the one color not auto-corrected, because it's the user's explicit choice. The editor shows
its ratio live and warns instead.

### ★ The control that previews the page must not preview itself

The theme editor applies every change to the whole app as you drag the color picker. The first
screenshot showed the problem: trying a dark page on a light base made the editor's own panel
grey-on-grey, so the Cancel button was hardest to find exactly when the preview was worst. The
fix pins the panel to the token values on screen when it opened, by setting them as custom
properties on the dialog itself, so nothing inside it inherits the preview (P11).

### ★ A shortcut nobody could press

"Delete wasn't working," said the owner. In Chrome: click a page in the list, press Delete,
nothing happens, and `document.activeElement` is `<body>`. The handler said "if the key came
from inside the page list", but list items had no `tabindex`, so a click never focused them and
no key ever came from inside the list. F2 on sections was dead for the same reason. Both had been
in the code since day one, unreachable. The fix is the listbox pattern (roving tabindex, arrows
inside the list). The lesson is the test: Help → Keyboard shortcuts is now generated from the same
list that `tests/shortcuts.test.mjs` walks, pressing each key after a real click, so a shortcut can't
exist without being exercised (P13).

### ★★ Clicking around shouldn't count as editing

Clicking an empty spot creates a note container, and leaving it empty removes it again. A naive
autosave sees a DOM change and saves, which bumps the page's modified time, so "Recent notes"
fills with pages you only looked at. The save compares a JSON snapshot of the page with the last
one saved and sends nothing if they are equal. The same rule shaped the planner: its Month / Date
/ Tag switch lives in `localStorage`, not the page, so switching views is never an edit (3 switches
→ 0 PATCH, tested).

### ★★ Ink is stored as points so the eraser can do geometry

Strokes are stored as flat `[x0, y0, x1, y1, …]` arrays and smoothed into SVG paths only when
drawn. The obvious alternative, storing the SVG `d` string and erasing whatever SVG element is under
the pointer, makes a 2 px pen line almost impossible to hit. With points, erasing is a
distance-to-segment test with a radius of `6 px / zoom + stroke width / 2`, so thin lines erase as
easily as thick ones and the hit radius stays constant on screen at any zoom (`hitStroke()`).

### ★ Three page kinds, one way to move things

A freeform page, a planner and a board store very different things (positioned HTML containers, a
flat task list, lists of cards), but the owner should not have to learn three interaction models.
So each one now gets the same pair: the mouse **drags** (a container by its bar, a task by its grip,
a card or a list by its header) and the keyboard does the same move (arrows nudge a selected
container; Alt+arrows move a task or card; Alt+←/→ on a list title moves the list). The planner
and the board also share one add-box parser, so `#…` and `@20 Oct` mean the same thing in both.

The interesting part was the planner, because its groups are not containers: "October", "20 Oct"
and "#Sabre" are views computed from task fields. Dropping a task into a group therefore has to
*give it that group's fields* (`applyGroup()`), and a few rules fall out of that: dropping into
October clears a November date (or the task would bounce straight back out), and Overdue refuses
drops because it is "date < today", not a place. Order is just the order of the task array, so a
move is one splice whatever the view.

### ★ Month first, date optional

The owner plans in months ("December: find a flat") and only some tasks have real dates. So a task
has a `month` and may also have a `date`, and a date always wins: typing `@20 Nov` into October's
add box files the task under November and says so. One quick-add box understands `#tag` and
`@today`, `@sat`, `@20 Oct` and `@3/11` (day/month). A date without a year picks the group's year,
or the nearest year no more than 60 days back, so `@5 jan` typed in October means next January. An
impossible date like `@31/2` stays in the task text, so the typo stays visible instead of
vanishing (`parseQuickAdd()`, 10 cases in `tests/todo.test.mjs`).

### ★ A layout fix I reported done that had never worked

At 390 px the ribbon's right-hand buttons were off-screen. I added `overflow-x: auto` and called it
fixed. The next day a measurement showed the ribbon was 1,018 px wide inside a 390 px viewport, so
it had nothing to scroll. The grid column was `auto`, which grows to its content's min-content
width, and `nowrap` made that 1,018 px. `minmax(0, 1fr)` fixed it (P6). The point isn't the CSS.
I reported a fix done because the reasoning was right, without re-running the check that showed
the bug.

### ★ `execCommand` fires events before it returns

Font size was always one step behind. `execCommand('fontSize')` dispatches `input` synchronously,
and my `input` handler read a value I set on the next line (P1). With `execCommand` the order of
lines matters in a way it doesn't for a normal function call.

## 3.7 Open items

- [ ] **Reload open browser tabs** to get task/list dragging, Alt-arrow moves, container nudge and Cards `#label @date` (and, from earlier, Insert → Templates, Cards and the keyboard fixes (frontend-only
      change; no server restart needed).
- [ ] **Owner: next customization** (W3). Templates were the first.
- [ ] Verify the 33 `Written` features with tests (W2.5).
- [ ] Time `/api/search` on the real `data/notes.db` once it has real content (OD2 input).
- [ ] Decide on a backup routine: `npm run backup` + copying `uploads/` exists, but nothing runs it.
