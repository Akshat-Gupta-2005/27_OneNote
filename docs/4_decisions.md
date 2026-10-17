# DECISIONS — OneNote Clone

Append-only record of choices made and problems solved.
Current state lives in [3_features.md](3_features.md).

Rows and problem entries are never edited after they are written. A reversed
decision gets a new row that names the old one. §4.4 Open decisions is the one live
section: entries are deleted when they graduate to a §4.2 row.

---

## 4.2 Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-10-14 | Use Node's built-in `node:sqlite` (`DatabaseSync`), not `better-sqlite3`. | The machine runs Node 26.11.1 on Windows. `better-sqlite3` is a native module and needs a C++ toolchain or a matching prebuilt binary; `node:sqlite` needs nothing. Cost: the API is synchronous and younger, and it pins the project to Node ≥ 22.13. Rejected: `sqlite3` (callback API, also native), Postgres (a second process to run for a single-user notes app). |
| 2026-10-14 | Express 5 for the HTTP layer, not bare `node:http`. | Routing, `express.static`, body parsers and async-error forwarding cost one dependency (65 packages, 3.3 MB in `node_modules`, measured 2026-10-15). Hand-rolling them would be ~150 lines of code nobody wants to own. Express 5 specifically because it forwards rejected promises from handlers to the error middleware. It also brought the trap in P5. |
| 2026-10-14 | Plain ES modules, no frontend framework and no build step. | Whole app is ~4.5k lines; `npm start` is the only command. React + Vite was the alternative. Rejected because it adds a build, a dev server and a node_modules tree for the frontend, and the editor is contenteditable-driven anyway, so a virtual DOM would fight it rather than help. Cost: UI state is managed by hand in `public/js/app.js` (render functions + a `state` object). |
| 2026-10-14 | Rich text uses `document.execCommand` inside `contenteditable`. | It is the only rich-text engine available without a bundler. ProseMirror / Tiptap / Lexical were rejected because they need a build step (see previous row). Known cost: `execCommand` is deprecated (still shipped by every engine), produces browser-specific HTML, and had the quirks in P1–P3. Revisit tracked as OD5. |
| 2026-10-14 | A page is freeform: absolutely positioned note containers (`.nb`) plus an SVG ink layer, like OneNote. Not a single flowing document. | The freeform canvas is the thing that makes OneNote feel like OneNote. Cost: export, search text and copy order need an explicit sort (by `y`, then `x`). See `plainText()` and `exportHtml()` in `public/js/editor.js`. |
| 2026-10-14 | Store each page's canvas as one JSON string in `pages.content` (`{v, lines, blocks[], ink[]}`), not as rows in a `blocks` table. | A page is always loaded and saved as a unit, so rows would only add joins and a diffing step to the save. The server treats `content` as opaque. Cost: no server-side queries into page structure, and every save rewrites the whole page. Fine at personal-notes scale. A page of 20 containers is tens of KB. |
| 2026-10-14 | Keep a derived plain-text column `pages.text`, computed by the client on every save, and search it with `LIKE`. Not FTS5. | Searching `content` would match HTML tags and attribute values (`div`, `style`, ink coordinates). The client already has the rendered DOM, so `innerText` is free. FTS5 was deferred, not rejected; see OD2 for the measured cost of `LIKE`. Cost: an API client that sends `content` without `text` makes that page unsearchable, with no error. Written into the contract as obligation 1. |
| 2026-10-14 | Pages are soft-deleted (`deleted_at`) and purged after 60 days. Sections and notebooks are hard-deleted (cascade) behind a confirm dialog. | Matches OneNote's recycle bin for the frequent, accidental case (deleting a page). Soft-deleting whole sections would need a restore path for orphaned parents. Rejected for v1 as complexity for a rare action. Purge runs at startup and every 6 h (`purgeTrash()` in `server/index.js`). |
| 2026-10-14 | Autosave: debounce 600 ms after the last edit, and skip the request entirely when a JSON snapshot of title + content equals the last saved one. | Without the snapshot check, merely clicking the canvas (which creates and then removes an empty container) would issue a save and bump `updated_at`, which would make "Recent notes" and "sort by modified" lie. 600 ms rather than ~2 s because a closed tab loses at most the last debounce window; `visibilitychange`/`beforeunload` also fire a `keepalive` save. |
| 2026-10-14 | `updated_at` bumps only when `title` or `content` changes, not on `level`, `sort` or `section_id`. | "Modified" should mean the note changed, not that it was dragged in the list. Verified 2026-10-15: a level-only PATCH left `updated_at` at `1792038416573` before and after. |
| 2026-10-14 | Ink strokes are stored as flat point arrays (`p: [x0, y0, x1, y1, …]`) and smoothed into SVG paths at render time, not stored as SVG `d` strings. | The eraser needs geometry: a hit test is "distance from pointer to any segment ≤ 6 px / zoom + stroke width / 2" (`hitStroke()` in `public/js/editor.js`). Hit-testing SVG paths through `elementsFromPoint` only hits the painted stroke, so a 1–2 px pen line is nearly impossible to erase. Points are rounded to 0.1 px to keep `content` small. |
| 2026-10-14 | Uploaded files go to `data/uploads/<uuid><ext>` on disk, not into SQLite or into the page as `data:` URIs. | Keeps `notes.db` small and the page JSON small, so a 600 ms autosave never re-sends a photo. Cost: the JSON backup (`/api/export`) does not include files. Documented in the README and the system guide. |
| 2026-10-14 | Uploads are served with `X-Content-Type-Options: nosniff`, and everything except a short allow-list of media types is served `Content-Disposition: attachment`. | An uploaded `.html` or `.svg` opened from `/uploads/` would otherwise run script in the app's own origin (stored XSS). Images still render in `<img>`, which ignores `Content-Disposition`. Verified 2026-10-15: `evil.html` came back with `Content-Disposition: attachment` + `nosniff`. |
| 2026-10-14 | The client uploads with `Content-Type: application/octet-stream` regardless of the file's real type. | The global `express.json()` parser runs first and would consume an `application/json` upload, leaving `express.raw()` nothing. Observed 2026-10-15: uploading `data.json` with its real MIME returned `400 {"error":"Empty upload"}`. Cheaper than reordering middleware per route. |
| 2026-10-14 | Paste: foreign HTML is sanitised to a tag allow-list with all `on*` handlers, `javascript:` URLs and most inline styles removed. HTML copied from inside the app is marked with a custom clipboard type (`application/x-onenote-clone`) and keeps its styles and `data-tag` attributes. | Web pages paste `color:black; background:white`, which is unreadable in the dark theme. Stripping styles fixes it but would also destroy our own tags and colors on internal copy/paste, hence the marker type. |
| 2026-10-14 | Highlighter colors are semi-transparent (`rgba(255, 235, 59, 0.5)` etc.), not Office's solid colors. | Solid yellow behind the dark theme's near-white text is unreadable. Translucent colors work in both themes. |
| 2026-10-14 | Tags (`data-tag` on the paragraph element, drawn with CSS `::before`) push the text right by 24 px instead of hanging in the margin like OneNote. | Clicks on a pseudo-element are delivered to its owner element, but only within the owner's box. A marker hanging outside the box would not be clickable. Detecting a click on the checkbox is `clientX − rect.left < 22 × zoom`. |
| 2026-10-14 | Bind to `127.0.0.1` by default. No authentication. | Single-user, local app. Anyone who can reach the port can read and delete everything, so exposure has to be a deliberate act (`HOST=0.0.0.0`). What to do if it is exposed is OD4. |
| 2026-10-14 | New page is `Ctrl+Alt+N`, not OneNote's `Ctrl+N`. There is no new-section shortcut. | Chrome reserves `Ctrl+N` and `Ctrl+T` and never delivers them to the page. |
| 2026-10-14 | Navigation uses hash URLs (`#/page/<id>`) with `history.pushState`, listening on `popstate`. | Gives working browser back/forward and shareable page links without server-side routing. `pushState` (not assigning `location.hash`) so the app opens the page itself and awaits it, and `popstate` only fires for real history moves. |
| 2026-10-14 | Import merges: every notebook, section and page gets a new UUID. Nothing existing is overwritten. | An import should never be able to destroy data. Cost: importing the same backup twice duplicates it. Verified 2026-10-15: re-importing a 2-notebook export produced `{"notebooks":2,"sections":4,"pages":4}` alongside the originals. |
| 2026-10-14 | Default theme is dark. | Matches the owner's OneNote setup (the screenshot the clone was built from). |
| 2026-10-15 | Keep the full documentation set (files 1–8), including `7_uml/` and `8_architecture.html`. | Owner's explicit choice. The skill's scaling table would have stopped at file 5 or 6 for a single-process app. Recorded so that dropping the diagrams later is a known reversal, not drift. |
| 2026-10-15 | The startup message is printed only after a successful bind. A failed bind prints a cause and exits with code 1. | Fix for P5. |
| 2026-10-15 | `8_architecture.html` is generated by `scripts/build-architecture.mjs` (`npm run docs:arch`) from `7_uml/*.md`, not written by hand. Mermaid is loaded from a pinned CDN build (`mermaid@11.4.1`); the master diagram is inline SVG. | Hand-copying 18 diagrams into HTML is how the page and its sources drift. A generator makes "regenerate" one command. The CDN is acceptable for a docs page, unlike the app. Checked: with the CDN blocked, the master diagram still renders and all 18 blocks show their source. |
| 2026-10-15 | Recommended live backup method is `VACUUM INTO`, not copying files. | See P8: `data/notes.db` alone can contain no tables at all while the server runs. Commands are in [6_system-guide.md](6_system-guide.md) §6. |
| 2026-10-15 | **OD1 answered:** browser tests live in the repo under `tests/`, use `playwright-core` (devDependency) driving the **installed** Chrome (`channel: 'chrome'`), and run with Node's built-in `node:test` (`npm test`). | Owner chose option 1. Every bug so far was found by driving the real browser, and this costs one small devDependency with no browser download. `node:test` rather than `@playwright/test` because it needs no config and no second runner. Rejected: `@playwright/test` (~150 MB browser, config file); API-only tests (P1–P4, P6, P7 were all UI bugs). |
| 2026-10-15 | A to-do page is marked by `type: "todo"` inside `content` and keeps `v: 1`; no `type` means a freeform canvas. | Additive: every existing page stays valid with no migration. Bumping `v` would protect nothing, because the only older client is this app's own pre-2026-10-15 JavaScript, which ignores `v` anyway. The real risk is a browser tab still running old JS: it would show a to-do page as an empty canvas and could save a canvas over it. Mitigation is documentation (reload tabs after updating; system guide §7), not a version number. |
| 2026-10-15 | The planner's "Group by" choice (Month / Date / Tag) and "Hide completed" are stored per page in `localStorage` (`oc.todo.<pageId>`), not in the page content. | Switching a view is looking, not editing. Stored in content, every switch would save and bump `updated_at`, the same problem the no-op save guard prevents. Verified: three view switches after a reload → 0 PATCH requests (`tests/todo.test.mjs`). Cost: the view does not follow you to another browser. |
| 2026-10-15 | Tasks belong to a month (`month: 'YYYY-MM'`) and may also have a date (`date: 'YYYY-MM-DD'`). A date always wins: setting one moves the task to that month. | The owner's list is planned by month first ("December: find a flat"), with exact dates for a few items. A date-only model would force fake dates onto month-level tasks; a month-only model can't give the date view. Removing a month clears its tasks' dates, because a date can't point outside its month. |
| 2026-10-15 | Quick-add syntax in every add box: `#tag` and `@date` (`@today`, `@tomorrow`, `@fri`, `@2026-12-01`, `@20 Oct`, `@20/10`, day/month). A day+month without a year takes the group's year, else the nearest year no more than 60 days back. An invalid date stays in the text. | One text box keeps adding fast, which is what the owner's screenshot shows. A date picker per add row was rejected as clutter; it exists per task instead (calendar button). Day/month order is D/M because the owner is in India. Leaving `@31/2` in the text rather than dropping it means a typo is visible, not silently lost. |
| 2026-10-15 | `POST /api/pages` accepts optional `content` and `text`. | A template page is created complete in one request, so there is never a moment where it exists empty, and it is searchable immediately. Additive to the contract. |
| 2026-10-15 | Every regression test was run once with its fix removed (the fix's lines swapped back to the buggy code, the single test run, the file restored), and is only counted when it failed that way. | A test that still passes without its fix proves nothing. The check found one test (P3) failing for the wrong reason (it depended on an earlier test's ribbon tab) and one harness bug (P10). Result: 9 of 9 guards seen failing (P1–P7, P9, no-op save). |
| 2026-10-15 | Page templates, owner's request: a **To-do planner** (a dedicated structured page) plus four freeform templates (Meeting notes, Daily journal, Project plan, Weekly planner), offered from a dropdown beside "+ Add page". | Owner chose a dedicated page over a to-do block inside a freeform page: the progress bar, grouping toggles and per-group add rows need the whole page width, and a block would have to coexist with freeform positioning. Freeform templates are just pre-filled `blocks`, so they need no new page type. |
| 2026-10-16 | Theme tab (owner's request): a color scheme is **8 seed colors** (accent, page, panels, title bar & ribbon, text, headings, links, checklist). The ~40 CSS tokens are derived from them in `public/js/theme.js`. The two Classic schemes keep the hand-tuned CSS tokens unchanged. | A custom-theme editor with 40 pickers is unusable, and hand-picking hover/border/dim colors is where home-made themes go wrong. Deriving them by mixing panel and text colors keeps every scheme internally consistent. Classic stays exact because it is the OneNote look the app was built to match. Rejected: per-theme CSS files (custom themes would need generated CSS anyway); exposing every token (too many knobs). |
| 2026-10-16 | Appearance (scheme, follow-system, look, custom themes) is stored on the **server** in `settings.appearance`, with a `localStorage` copy (`oc.appearance`) applied by an inline script in `index.html` before first paint. | Custom themes are things the owner made; losing them to "clear browsing data" would be data loss, and the server copy follows them to another browser. The local copy exists only to avoid a flash of the wrong theme while `/api/settings` loads. Rejected: localStorage only (fragile for user-made content); server only (flash on every load). |
| 2026-10-16 | Derived colors are forced to readable contrast: accent text ≥ 4.5:1 on panels, links ≥ 4.5:1 and headings ≥ 3:1 on the page, by mixing toward white/black until they pass. The editor shows live contrast ratios and warns below 4.5:1 for text. | A theme that looks right in the swatch but leaves the selected section label unreadable is the common failure of user themes. Doing it in the derivation means even a careless custom theme stays usable. Body text is not auto-corrected (it is the user's explicit choice), only warned about. |
| 2026-10-16 | "Looks" are layout settings applied as `data-*` attributes on `<html>` (`data-density`, `data-corners`, `data-page`, `data-tabs`) plus `--font-ui`. Sizes and radii became CSS variables (`--row-h`, `--rb-h`, `--head-h`, `--menu-h`, `--radius*`). Four presets set all five knobs at once; changing one knob makes the look "Custom". | Attributes keep each look a few CSS rules rather than JavaScript style writes, and they compose with any color scheme. Not offered: a global UI zoom. The page canvas maps mouse coordinates through its own zoom, and a second zoom on an ancestor would misplace every click (see the container click mapping in `point()`). |
| 2026-10-16 | The old View → Theme (Dark / Light / System) menu is removed; its three choices are the Classic Dark and Classic Light schemes and "Match system" in the Theme tab. An existing `oc.theme` preference is migrated on first load. | One place to change appearance. Keeping both would let them disagree, e.g. View saying "Light" while a custom dark scheme is active. |
| 2026-10-16 | Side effect of the look variables: radii that were 7 px (to-do rows, inputs, add buttons) are now `--radius-md` = 6 px in the Classic look. | Three radius steps (4 / 6 / 8) instead of four keeps Square and Round looks to three numbers each. The 1 px difference was judged invisible; noted so a later diff doesn't look like an accident. |
| 2026-10-17 | **Reverses part of the 2026-10-15 templates row:** Meeting notes, Daily journal, Project plan and Weekly planner are no longer page templates. They are *insert* templates (Insert → Templates) that add their containers to the page you are on, 40 px below the lowest existing container, keeping their layout. An untitled page takes the template title; otherwise the title becomes an `<h1>` (a separate heading container for multi-container templates). Undo in the toast removes exactly what was inserted. | Owner's feedback: "these 4 were basically extensions to the blank page". They produce ordinary freeform containers, so making each its own page added nothing a blank page couldn't hold, and stopped you from adding a meeting's notes to an existing project page. Page templates are now only the ones that change what a page *is*: Blank, To-do planner, Cards. |
| 2026-10-17 | **Cards** (owner's request, modelled on a Trello board screenshot) is a third structured page type, `content.type = "board"`: lists of cards with labels, cover, description, checklist and due date. Not a block inside a freeform page. | Same reasoning as the planner: a board needs the full width, horizontal scrolling and its own drag and drop. Deliberately left out of the reference: member avatars (single-user app), comment and attachment counts (no comments; attachments live on freeform pages). |
| 2026-10-17 | Board labels are a fixed palette of 8 colors (green, yellow, orange, red, purple, blue, sky, pink) that cards reference by id. Each board can name them (e.g. yellow = "Backend"). Due badges: green = complete, red = overdue, yellow = due today or tomorrow. | Fixed colors keep cards comparable at a glance and need no label-management UI. Names are per board because "red" means different things on different boards. The due colors match what the reference image and Trello users expect. |
| 2026-10-17 | **Reverses the board backgrounds in the 2026-10-17 Cards row:** board backgrounds and gradient covers are built only from theme tokens (`--accent`, `--todo`, `--surround`, `--canvas` via `color-mix`). Options: Theme tint (default), Accent, Soft, Page color. Stored old ids (`aurora`, `ocean`, `sunset`, `forest`, `dusk`) load as `tint`, old gradient covers as `g-tint`, and the old `theme` id as `page`. Label colors stay fixed. | Owner: "I hate the blue gradient, it stands differently from the theme" (screenshot: Paper theme with a fixed blue-to-pink board). Fixed gradients copied from the reference image ignored the Theme tab entirely. Deriving them means a board looks right in all 14 schemes and in custom themes with no extra work. Labels keep fixed colors because they carry meaning ("red = blocked") that must not change with the theme. A test now fails if any background contains a hex/`rgb()`/`hsl()` color (seen failing with one injected). |
| 2026-10-17 | **Refines the previous row:** board backgrounds and theme covers are **solid** colors, no gradients. Theme tint = `color-mix(accent 16%, surround)`, Accent = `color-mix(accent 42%, surround)`, Soft = `--surround`, Page = `--canvas`. Ids are unchanged (`tint`, `accent`, `soft`, `page`; covers `g-tint`, `g-accent`), so stored boards need no migration. | Owner, after seeing the theme-derived gradient: "I don't like the gradient. Ensure it is solid color matching the theme." A gradient adds a second color the theme never chose. The test now fails on any `gradient` in a background or on a rendered theme cover (seen failing with one injected). |
| 2026-10-17 | Structured pages share one interface. `PageEditor` keeps `views = { todo, board }` and an active `view` with `mount / unmount / serialize / plainText / focusFirst / exportHtml / hint / top / body`. The 17 planner-only checks became `this.structured`. | Adding the board by copying every `kind === 'todo'` branch would have doubled them. With the interface, a third structured page type is a new view class and one entry in `views`. |
| 2026-10-17 | Section and page list items are focusable with a roving `tabindex` (one Tab stop per list). The lists handle ↑/↓ (move and open), Home/End, Delete, F2 and Enter themselves, and focus is put back on the same item after every re-render. | Fix for P13. Roving tabindex is the standard pattern for a listbox: Tab moves between regions and arrows move within. Re-render restore was needed because opening a page re-renders the list, which would otherwise drop focus to `<body>` and break the next key press. |
| 2026-10-17 | Help → Keyboard shortcuts is generated from one `SHORTCUTS` list in `app.js`, grouped by where it applies (30 rows), and `tests/shortcuts.test.mjs` presses every one of them. The test also asserts the row count, so adding a shortcut without a test fails. | P13 existed because a shortcut was implemented but never pressed by anything. One list for the dialog and the test keeps them from drifting apart. |
| 2026-10-17 | The undo test uses one atomic edit (Bold on a selection), not typed text. | Seen 2026-10-17: after typing "abc" fast, Chrome sometimes split "a" and "bc" into separate undo steps, so one Ctrl+Z left "a" (1 failure in 6 runs). That is the browser's typing-merge behaviour, not the app's. An atomic edit tests Ctrl+Z/Ctrl+Y and nothing else. 8/8 clean runs after the change. |
| 2026-10-17 | Two guard checks were redone because the first mutation wasn't a real removal. (1) Deleting the section `tabindex` line still left the first section focusable via `ensureTabStop()`, the one the test clicks; the real mutation removes both. (2) Deleting the board composer's `preventDefault()` didn't make the form navigate, because the same handler re-renders and detaches the form, which cancels the submission. The guard is the submit handler itself, and removing it does fail the test. `preventDefault` stays as a second line of defence, but no test protects it. | A mutation that leaves a fallback in place proves nothing about the fallback-free path. Recorded so nobody reads "guard proven" as covering `preventDefault` alone. |
| 2026-10-17 | **Same moves on all three page kinds** (owner: "consistency in features across all 3 templates… ensure things are movable"). Freeform: drag a container by its bar, or select it and nudge with arrows (1 px, Shift = 10 px). Planner: drag a task by its grip, or Alt+↑/↓ within a group and Alt+←/→ to the next group. Cards: drag a card or a list (by its header), or Alt+arrows on a card and Alt+←/→ on a list title. Planner and Cards share one quick-add syntax (`#…` and `@date`). | One mental model: the mouse drags, Alt+arrows (or plain arrows on a selected container) do the same from the keyboard, and the add box understands the same symbols. Before this, only cards and containers were movable, and only the planner understood `#`/`@`. |
| 2026-10-17 | **A dropped planner task takes the meaning of the group it lands in:** month → its month (a date outside that month is cleared, so the task stays where it was dropped); Unscheduled → no month, no date; a date → that date and its month; No date → date cleared; a tag → that tag; No tag → tag cleared. Overdue is not a drop target. Order is the order of `data.tasks`, so a move is one splice. | Groups are computed from task fields, so the only way to "be in" a group is to have its fields. Overdue is derived from "date < today" and nothing can be dropped into the past meaningfully, so it refuses. Clearing a foreign date (rather than refusing the drop) matches what the owner asked for: the task ends up where it was dropped. |
| 2026-10-17 | **Cards quick-add resolves `#word` to a label:** a color id (`#red`) first, then a label name (case-insensitive), else it names the first label that is unnamed and unused by any card ("New label \"Backend\" (orange)") and reuses it next time. With no free label left, `#word` stays in the title. `@date` sets the due date. | Reuses `parseQuickAdd()` (with `allTags: true`) instead of a second parser. Naming a free label makes `#Backend` work on the first try without opening a labels dialog; refusing silently when none is free would lose the word, so it stays visible in the title instead. |
| 2026-10-17 | Lists move by dragging their **header** (whole header is the handle, grip shown on hover), not a separate button. Empty planner groups keep `.todo-list { min-height: 8px }`. Tests drop onto a group's add box rather than onto a task midpoint. | A header handle keeps the board uncluttered and matches how Trello behaves. Without the min-height an empty group was 0 px tall: nothing to drop on and no drop marker (Playwright's `dragTo` timed out, which is how it was found). Dropping onto a task's midpoint is ambiguous between "before" and "after", so the tests aim at the add box, which always means "end of this group". |

---

## 4.3 Problems faced and fixed

### P1 — Font size applied one step behind *(2026-10-14, caught by tests)*

**Symptom:** in a headless-Chrome run, selecting "Big " and entering `20` in the size box produced
`<div><span style="font-size: 11pt;">Big&nbsp;</span></div>`. Choosing a size from the dropdown
afterwards then produced `font-size: 20pt`, the previous request. No errors in the console.

**Root cause:** `execCommand('fontSize', false, '7')` dispatches the `input` event
**synchronously**, before it returns. The `input` handler calls `fixFontSizes()`, which converts
the `<font size="7">` marker into a `pt` span using `this.pendingFontPt`. That field was being set
on the line *after* `execCommand`, so the handler always used the previous value (or the 11 pt
default).

**Fix:** set `this.pendingFontPt = pt` before calling `execCommand`
(`setFontSize()` in `public/js/editor.js`, with a comment saying why).

**Verified:** same script re-run: `font-size: 20pt` for 20 and `font-size: 8pt` for 8. The failing
output above is the before-state, captured from the same script.

**Generalises to:** `execCommand` is not a pure function call. It fires DOM events re-entrantly,
so any state the event handlers read must be written before the call.

### P2 — Typing after inserting a table landed outside the table *(2026-10-14, caught by tests)*

**Symptom:** insert a 3×2 table, type `c1`, press Tab, type `c2`. The saved HTML was the empty
table followed by
`<blockquote style="margin: 0 0 0 40px; border: none; padding: 0px;"><div><div>c1c2…`.

**Root cause:** `insertHTML` leaves the caret *after* the inserted fragment, which ends with a
trailing `<div><br></div>` (there so the user can type below a table). With the caret outside any
cell, the Tab handler fell through to `indent`, which wraps the line in a blockquote.

**Fix:** insert the table with a temporary `data-new="1"` marker, find it, remove the marker and
place the caret in its first `<td>` (`insertTable()` in `public/js/editor.js`).

**Verified:** re-run produced `<td>c1</td><td>c2</td>` inside the table.

**Generalises to:** after any programmatic insert, decide where the caret should be and put it
there yourself. The browser's choice is "after the fragment", which is rarely what a structured
insert wants.

### P3 — Inserted images carried the surrounding text style *(2026-10-14, caught by tests)*

**Symptom:** an uploaded picture was saved as
`<img src="/uploads/….png" alt="pic.png" style="color: inherit; font-size: 14.6667px;">`.

**Root cause:** Chrome's `insertHTML` copies the computed inline style at the caret onto inserted
elements so that "formatting is preserved". 14.6667 px is the default 11 pt.

**Fix:** insert with a `data-new` marker, then strip `style` and the marker from those images
(`insertFiles()` in `public/js/editor.js`).

**Verified:** re-run saved `<img src="/uploads/….png" alt="pic.png">`.

**Generalises to:** `insertHTML` does not insert your HTML verbatim. Inspect the stored result,
not the string you passed in.

### P4 — Sanitised paste left a broken-image icon *(2026-10-14, caught by tests; fix verified 2026-10-15)*

**Symptom:** pasting `<img src=x onerror="alert(1)">` correctly removed the handler and the
invalid `src`, and left `<img>`, which renders as a broken-image icon.

**Root cause:** the sanitiser removed disallowed *attributes* but kept the *element*, and an
`<img>` without `src` is not meaningful.

**Fix:** drop `IMG` elements that have no `src` left after cleaning (`sanitizeHtml()` in
`public/js/editor.js`).

**Verified:** 2026-10-15, pasting `<p>Pasted <img src=x onerror=…><img src="javascript:…"> <a href=https://example.com onclick=…>good</a></p>`
produced `<p>Pasted  <a href="https://example.com">good</a></p>`. The fix was written on
2026-10-14 but not re-run until the next day. Noted because "fixed" was claimed before it had
been seen working.

**Generalises to:** sanitising is per element as well as per attribute: ask whether what is left
still makes sense.

### P5 — A second server instance printed "running at…" and silently exited *(2026-10-15, assumption)*

**Symptom:** with one server already on port 3125, starting another printed

    OneNote Clone running at http://127.0.0.1:3125
    Data directory: …\data-doc2

then the process exited with no error. `netstat` showed only the first process listening, and all
10 test requests were answered by the first instance's database. The log claimed success.

**Root cause:** Express 5 changed `app.listen`. If the last argument is a function, it is wired to
**both** the server's `listening` and `error` events (`node_modules/express/lib/application.js`,
v5.3.0: `server.once('error', done)`). The callback ignored its `err` argument and printed the
banner. With the bind failed, nothing kept the event loop alive (the purge interval is
`unref()`'d), so Node exited with code 0. My assumption was the Express 4 behaviour, where
EADDRINUSE throws an unhandled `error` event and crashes loudly.

**Fix:** the callback checks `err`, prints `Could not start on <host>:<port> — the port is already
in use (is another instance running?)` and exits with code 1 (`server/index.js`, end of file).

**Verified:** before: banner printed, exit code 0. After: the message above, `exit code: 1`.

**Generalises to:** read a framework's major-version changelog for anything with a callback. A
callback that silently changes from "success" to "success or failure" turns every existing caller
into a liar.

### P6 — The phone-width ribbon fix was claimed but never worked *(introduced 2026-10-14, found 2026-10-15, assumption)*

**Symptom:** on 2026-10-14 the right-hand ribbon buttons (Share, ⋯) were off-screen at 390 px. I
added `overflow-x: auto` to `.ribbon-tabs` and reported it fixed without re-checking. On
2026-10-15 a measurement at 390 px showed `.ribbon-tabs` `scrollWidth 1018, clientWidth 1018`.
The container itself was 1018 px wide, so there was nothing to scroll, and `body { overflow:
hidden }` clipped it.

**Root cause:** `.app` is a CSS grid with an implicit `auto` column. An `auto` track grows to the
min-content width of its items, and the ribbon's `white-space: nowrap` content has a min-content
width of ~1018 px. The overflow rule was correct but was applied to an element that never
overflowed.

**Fix:** `grid-template-columns: minmax(0, 1fr)` on `.app` (`public/css/app.css`).

**Verified:** at 390 px, `.app` is 390 px wide and `.ribbon-tabs` reports `scrollWidth 418,
clientWidth 390`, so it scrolls. The before-numbers above are the failing check.

**Generalises to:** `overflow` only does something if the element is constrained. In a grid or
flex layout, check the track or item is allowed to shrink (`minmax(0, …)` / `min-width: 0`)
before adding overflow rules. Also: a layout fix is not done until it has been measured.

### P7 — "Couldn't reach the server" toast repeated on every retry *(2026-10-15, caught by tests)*

**Symptom:** with the server killed mid-edit, two identical toasts appeared within 2.5 s.

**Root cause:** the toast fired on every transition into `error`. A failed save schedules a retry
after 4 s, and each retry goes `error → saving → error`, so each retry counted as a new outage.

**Fix:** an `offlineNotified` flag, set on the first `error` and cleared only on `saved`
(`setupEditorEvents()` in `public/js/app.js`).

**Verified:** a MutationObserver on `#toasts` counted 1 toast during a 10 s outage (≈3 save
attempts). After restarting the server the status returned to "All changes saved" and the text
typed during the outage was present after a reload.

**Generalises to:** notify on state changes the user cares about (online → offline), not on
internal state-machine transitions.

### P8 — `data/notes.db` on its own contained no tables *(2026-10-15, assumption)*

**Symptom:** with the owner's server running, `data/notes.db` was **4,096 bytes** and
`data/notes.db-wal` was **201,912 bytes**. A plain copy of a scratch `notes.db` taken while its
server ran failed to open with `Error: no such table: notebooks`.

**Root cause:** the database runs in WAL mode (`PRAGMA journal_mode = WAL` in `server/db.js`).
Committed writes go to `notes.db-wal` and move into `notes.db` only at a checkpoint: automatically
once the WAL reaches 1000 pages (~4 MB), or when the last connection closes cleanly. A small
personal notebook may never reach the threshold, so **all** of it, including the schema, can live
in the WAL file for as long as the server runs. The natural assumption that "the database is
`notes.db`" is wrong here.

**Fix:** no code change. Documented the safe options: stop the server cleanly (Ctrl+C runs
`db.close()`, which checkpoints) and copy the whole `data/` folder, or take a consistent live
snapshot with `VACUUM INTO` ([6_system-guide.md](6_system-guide.md) §6).

**Verified:** `VACUUM INTO 'snap.db'` against the same live scratch database produced a 49,152-byte
file containing all 5 notebooks, including one created seconds earlier that existed only in the
WAL.

**Generalises to:** in WAL mode a SQLite database is the `.db` file **plus** the `-wal` file.
Back up with the SQLite API, never by copying one file.

### P9 — A shortcut pressed right after typing moved the caret back one character *(2026-10-15, caught by tests)*

**Symptom:** the first committed run of `tests/editor.test.mjs` typed `Tagged line`, pressed
Ctrl+1, then Shift+Home and Ctrl+B. It stored `<div data-tag="todo" …><b>Tagged lin</b>e</div>`.
The caret had jumped back one character when the tag was applied, so the selection missed the
last letter. Nothing in the UI showed it. A person typing at normal speed would have hit it too.

**Root cause:** every command starts with `restoreSelection()`, which put back `this.lastRange`.
That range is updated from `selectionchange`, which the browser fires **asynchronously**. A
command run in the same task as the last keystroke restored a range that was one keystroke old,
and *moved the live caret* to it. The design assumed `lastRange` was always current. It is only
current once the event loop has turned.

**Fix:** `restoreSelection()` first checks the live selection. If the caret is inside a container
that has focus, it uses that and refreshes `lastRange`. The saved range is only a fallback for
when focus has left the page, e.g. after typing in the font-size box (`public/js/editor.js`).

**Verified:** `typed text, tags, bold and ink survive a reload` passes with the fix. With the
live-selection branch disabled (`if (false)`) it fails with the `Tagged lin</b>e` output above.

**Generalises to:** a cache fed by an asynchronous event is stale for exactly the cases where the
user is fastest. Read the source of truth when it is available, and keep the cache as a fallback.

### P10 — A failing outage test hung for 200 s instead of failing *(2026-10-15, tooling)*

**Symptom:** with P7's fix removed, the P7 test should fail in ~10 s. Instead it ran until the
outer timeout (`test timed out after 45000ms`, and 200 s under `timeout 200`). With the fix in
place it passed in 15 s.

**Root cause:** the test stops the server (`server.stop({ keepData: true })`), and the `finally`
block stops it again. `stop()` skipped killing only when `proc.exitCode !== null`, but a process
killed by a signal ends with `exitCode === null` and `signalCode === 'SIGTERM'`. The second
`stop()` re-sent the kill and awaited an `exit` event that had already fired, forever. On the
passing path the variable had been reassigned to a restarted server, so this only appeared when
the assertion failed. The harness broke exactly when it was needed.

**Fix:** `stop()` checks `exitCode === null && signalCode === null` (`tests/helpers.mjs`).

**Verified:** the same mutation run now fails in 11.2 s on the toast assertion.

**Generalises to:** test the failing path of a test harness, not only the passing one. Running
each regression test with its fix removed (the mutation check) is what exposed this.

### P11 — The theme editor became unreadable while previewing an unreadable theme *(2026-10-16, design trap, caught by looking)*

**Symptom:** in the first screenshot of the editor, with a dark page color (`#101820`) picked on
a light base, the editor panel itself turned grey-on-grey. The "Light" base button was dark text
on a dark fill, and the panel looked disabled. The contrast list correctly said `Text on page
1.4:1 ⚠`, but in a panel that was hard to read. No test would have flagged it, because every
value was technically correct.

**Root cause:** the live preview writes the draft's tokens onto `<html>`, and the editor is part
of the same document, so it inherited them. The preview was designed to show how the app looks;
the editor that controls it was never meant to be previewed.

**Fix:** when the editor opens, it snapshots the computed values of every token and pins them as
custom properties on the dialog element (`openThemeEditor()` in `public/js/theme.js`). Descendants
resolve `var(--…)` from the dialog first, so the panel keeps the colors that were on screen when
it opened, whatever the preview does.

**Verified:** `tests/theme.test.mjs` "create theme…" asserts that the dialog's `--menu-bg` equals
the pre-editor value after setting an unreadable text color. With the pinning loop removed, that
test fails.

**Generalises to:** when a control previews its own effect on the whole page, exempt the control.
Otherwise the moment the preview is worst is the moment you can't reach Cancel.

### P12 — Font size intermittently did nothing when chosen right after selecting text *(2026-10-16, caught by tests, flaky)*

**Symptom:** the full suite, unchanged in that area, failed the P1 test once:
`<div>Big&nbsp;</div>` with no `font-size` span. Re-running `tests/editor.test.mjs` five times
failed 3 times out of 5. The test selects "Big " (Shift+Home) and immediately fills the font-size box.

**Root cause:** the same asynchronous `selectionchange` as P9, on the other path. P9 fixed commands
run while the caret is still in the page. Here focus *leaves* the page for the font-size input.
If `selectionchange` for the Shift+Home selection fires only after focus has moved, the handler
sees the selection inside the input, ignores it, and `lastRange` stays at the earlier collapsed
caret. Applying the size to a collapsed range creates no span. It began showing up in this session
probably because loading `theme.js` shifted timing, not because the theme code is involved.

**Fix:** the `focusout` handler for a container records the selection at the moment focus leaves,
while it is still in the container (`public/js/editor.js`).

**Verified:** statistically, because the bug is a race. Same filtered test run 8 times: with the fix
**8/8 pass**, and 8/8 again in a second batch; with the recording disabled **6 pass, 2 fail**. The
full suite then passed twice in a row.

**Generalises to:** when a fix for an async-event race covers one path (P9: focus stays), list
the other paths that read the same cache (focus leaves, focus returns) and check each. A flaky
test is a bug report with a probability attached, not noise to re-run away.

### P13 — Delete on a page in the list, and F2 on a section, never worked *(2026-10-17, found by a user)*

**Symptom:** the owner reported "delete was not working". Reproduced in Chrome: click a page in the
page list, press Delete → the page stays, and `document.activeElement` is `BODY`. Click a section,
press F2 → no rename box. Delete on a selected note container (Esc, then Delete) *did* work, so
"Delete" was broken in one place and fine in another.

**Root cause:** both handlers were written as "if the key event came from inside `#pageList` /
`#sectionList`". The `<li>` items had no `tabindex`, so clicking one never focused it, and key
events went to `<body>`. The handlers were unreachable. Neither was ever exercised by a test (the
shortcut list in Help didn't even mention them), so nothing caught it.

**Fix:** see the 2026-10-17 decision row on list keyboard support: items are focusable
(roving `tabindex`), a click focuses the item, and the lists handle Delete, F2, Enter and the
arrow keys themselves.

**Verified:** `tests/shortcuts.test.mjs` presses Delete on a focused page (page goes to Deleted
pages, Undo brings it back) and F2 on a section (rename box appears). Both fail with the old
non-focusable items.

**Generalises to:** a keyboard handler scoped to an element is dead code unless something can focus
that element. Test keyboard paths by pressing keys after a real click, not by dispatching events at
the target.

---

## 4.4 Open decisions

### OD2 — Keep `LIKE` search, or move to SQLite FTS5?

**Blocks:** nothing today. Measured 2026-10-15 (scratch DB, ~2 KB of text per page, median of 5
warm requests via `curl`, Windows 10, Node 26.11.1):

| Pages | `zebracorn` (20 hits) | `proxmox snapshot` (2 terms) | no match |
|---|---|---|---|
| 2,001 | 24 ms | 24 ms | 26 ms |
| 20,001 | 201 ms | 214 ms | 228 ms |

`LIKE '%…%'` is a full scan, so it grows linearly with the amount of text.

**Options:**

| Option | Costs | Buys you |
|---|---|---|
| Keep `LIKE` | Linear; ~200 ms at 20k pages; no ranking, no stemming ("backups" ≠ "backup") | Substring matches inside words; zero code |
| FTS5 virtual table kept in sync with `pages.text` (triggers) | A migration; trigger maintenance; prefix matching only (`immi*`), not mid-word | Sub-ms lookups, `bm25()` ranking, `snippet()` built in |

**Leaning:** keep `LIKE`. A personal notebook reaching 20k pages is years away, and 200 ms is
still usable.

**What would settle it:** search taking >150 ms on the real `data/notes.db` (time
`/api/search?q=…`), or wanting ranked results.

**Raised:** 2026-10-15.

### OD3 — What should happen when two tabs or devices edit the same page?

**Blocks:** nothing while there is one browser tab. Today the last save wins silently: tab A's
next autosave overwrites tab B's edits with no warning.

**Options:**

| Option | Costs | Buys you |
|---|---|---|
| Leave last-write-wins | Silent data loss if two tabs are open on one page | Nothing to build |
| Optimistic concurrency: client sends the `updated_at` it loaded; server returns `409` if it changed; client shows "page changed elsewhere, reload?" | A contract change (new field + 409), a conflict UI | No silent loss; cheap to build |
| Live sync (SSE/WebSocket + merge) | Large: needs a merge model for freeform HTML blocks | True multi-device editing |

**Leaning:** optimistic concurrency, but only once this is used on more than one device.

**What would settle it:** the first time the owner opens it on a second device (OD4 makes that
likely).

**Raised:** 2026-10-15.

### OD4 — If the app is exposed beyond localhost (e.g. on a homelab), how is it protected?

**Blocks:** using it from a phone or a second machine. There is no authentication, and anyone who
reaches the port can read, export and delete everything.

**Options:**

| Option | Costs | Buys you |
|---|---|---|
| Stay localhost-only | No access from other devices | Nothing to secure |
| Reverse proxy with auth in front (Caddy/Nginx basic auth, Authelia, Tailscale-only access) | Infra outside this repo | App stays simple; TLS comes from the proxy |
| Built-in login (single password, session cookie) | Code + session handling + CSRF care; must be right | Works anywhere `npm start` works |

**Leaning:** Tailscale-only, or a reverse proxy with auth. Security code that lives outside the
app is code that cannot be broken by app changes.

**What would settle it:** the owner deciding whether this should be reachable from a phone.

**Raised:** 2026-10-15.

### OD5 — Stay on `execCommand`, or move the editor to a real editor engine?

**Blocks:** nothing today. It becomes pressing if a customization needs structured content
(e.g. collaborative editing, reliable Markdown export, nested-list manipulation) or if a browser
changes `execCommand` behaviour.

**Options:**

| Option | Costs | Buys you |
|---|---|---|
| Stay on `execCommand` | Deprecated API; browser-specific HTML; quirks like P1–P3 | Zero dependencies; no build step |
| ProseMirror / Tiptap per container | A bundler (reverses the no-build decision), a schema, a migration of stored HTML | A document model, reliable transforms, undo across operations |

**Leaning:** stay. Every quirk hit so far was fixed in under 10 lines.

**What would settle it:** a planned customization that `execCommand` cannot do cleanly.

**Raised:** 2026-10-15.
