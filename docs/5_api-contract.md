# OneNote Clone — Interface Contract

## 0. What this file is

This is the HTTP JSON API under `/api` that the browser frontend (`public/js/`) is built
against, and that any script or future client may use. Anything not written here is an
implementation detail and may change without notice. All examples were captured from a running
server on 2026-10-15 (ids and timestamps are real values from that run).

Base URL: `http://127.0.0.1:3000/api` by default (`PORT` and `HOST` env vars). No
authentication. Every request and response body is JSON unless stated otherwise.

## 1. Obligations on the client

Read these first. Every one of them fails **silently** or with a misleading message if ignored.

| # | Rule | What breaks if you don't |
|---|---|---|
| 1 | Whenever you send `content` for a page, also send `text`: the plain text of the page. | Search (`/search`) reads only `text`. The page saves fine and is never found. No error. |
| 2 | Send `content` as a **JSON-encoded string**, not an object. | An object is silently ignored: `200 OK`, nothing stored. |
| 3 | Upload files with `Content-Type: application/octet-stream`, whatever the file really is. | An `application/json` body is consumed by the JSON parser first, and the upload fails with `400 {"error":"Empty upload"}`. |
| 4 | Put the original filename in `X-Filename`, **URI-encoded** (`encodeURIComponent`). | A name containing `%` that is not valid encoding is replaced with `file`, and the extension is lost. |
| 5 | Branch on the HTTP status code, never on `error` text. | Messages are human text and change. Some are raw parser messages. |
| 6 | Treat `DELETE /notebooks/:id` and `DELETE /sections/:id` as permanent. | They cascade to every section and page below, including pages in the trash. Only page deletion is reversible. |
| 7 | Expect last-write-wins. There is no version check. | Two clients saving the same page overwrite each other without warning. |
| 8 | Timestamps are integers in **milliseconds** since the Unix epoch. | Treating them as seconds puts dates in the year 58,000. |
| 9 | Do not send `keepalive` fetches larger than 64 KB. | Browsers reject them. The frontend uses `keepalive` only for the save on tab close, best effort. |
| 10 | Never save over a page whose `content.type` you don't understand (e.g. `"todo"`). *(Added 2026-10-15.)* | The planner data is replaced by whatever you send. The server does not check. |

## 2. Data shapes

### Notebook

```json
{"id":"e4887623-eff3-4dc5-91f8-d286cb0bb07d","name":"Work","color":"#4a90e2","sort":1,"created_at":1792038193312,"updated_at":1792038193312}
```

| Field | Meaning |
|---|---|
| `id` | UUID, assigned by the server. |
| `name` | 1–200 chars. Empty or whitespace becomes `New Notebook` on create and `Untitled notebook` on rename. Never a 400. |
| `color` | `#rrggbb`. Invalid values are silently ignored (default `#7719aa` on create). |
| `sort` | Display order, ascending. Not unique; ties fall back to `created_at`. |

### Section

```json
{"id":"3a444712-f00b-4d60-952c-a2546d887e23","notebook_id":"5d7de32e-f8f6-44b3-a3ac-bb11dfa4d1a8","name":"Homelab","color":"#4a90e2","sort":2,"created_at":1792038193519,"updated_at":1792038193519}
```

`name` defaults to `New Section <n>`. `color` defaults to the next entry of a 9-color palette.

### Page (list form, as in `/tree`, `PATCH` responses)

```json
{"id":"5ea75ff4-9c60-43c7-8898-04b5740c1665","section_id":"3a444712-f00b-4d60-952c-a2546d887e23","title":"BackUp","level":0,"sort":0,"created_at":1792038193519,"updated_at":1792038194051}
```

| Field | Meaning |
|---|---|
| `title` | ≤ 500 chars. `""` means untitled. The UI shows "Untitled page". |
| `level` | Subpage depth, `0`–`2`. Out-of-range values are clamped (`9` → `2`). |
| `sort` | Order within the section. |
| `updated_at` | Changes **only** when `title` or `content` changes. Moving, reordering and changing `level` do not touch it. |

### Page (full form, `GET /pages/:id`)

Adds `content`, `text`, `deleted_at`, plus `notebook_id` and `section_name` from the joins:

```json
{"id":"5ea75ff4-9c60-43c7-8898-04b5740c1665","section_id":"3a444712-f00b-4d60-952c-a2546d887e23","title":"BackUp","content":"{\"v\":1,\"lines\":\"none\",\"blocks\":[{\"id\":\"b1\",\"x\":60,\"y\":100,\"w\":null,\"html\":\"<div>Get a harddisk</div>\"}],\"ink\":[]}","text":"Get a harddisk","level":0,"sort":0,"created_at":1792038193519,"updated_at":1792038194051,"deleted_at":null,"notebook_id":"5d7de32e-f8f6-44b3-a3ac-bb11dfa4d1a8","section_name":"Homelab"}
```

`deleted_at`: `null` means live. A number means it is in the trash. A client **must not**
treat a trashed page as editable. The frontend refuses to open one.

### Page `content` (the string, decoded): schema `v: 1`

The server stores this opaquely. It is a contract between clients.

```json
{
  "v": 1,
  "lines": "none",
  "blocks": [{ "id": "b1", "x": 60, "y": 100, "w": null, "html": "<div>Get a harddisk</div>" }],
  "ink": [{ "t": "pen", "c": "auto", "w": 2, "p": [700, 650, 710, 659.5, 720.1, 668.2] }]
}
```

| Field | Meaning |
|---|---|
| `lines` | `none` · `narrow` · `college` · `grid-small` · `grid-large` |
| `blocks[].x/y` | Container position in CSS px at 100% zoom, from the page's top-left. |
| `blocks[].w` | Fixed width in px, or `null` = auto width (max 640 px). |
| `blocks[].html` | Container HTML. Tags are `data-tag="todo\|important\|question\|critical\|idea\|contact"` on a paragraph element; a To Do also has `data-checked="true\|false"`. |
| `ink[].t` | `pen` or `hl` (highlighter, drawn at 42% opacity). |
| `ink[].c` | `#rrggbb`, or `auto` = the theme's ink color (white in dark, near-black in light). |
| `ink[].p` | Flat `[x0, y0, x1, y1, …]`, rounded to 0.1 px. |

An empty string `""` is a valid `content` and means a blank page. Content that is not valid JSON is
loaded by the frontend as a single container holding that string as HTML.

### Page `content`: to-do planner *(Added 2026-10-15.)*

A content object with `"type": "todo"` is a planner page, not a canvas. No `type` (or any other
value) means the canvas format above. `v` stays `1`.

```json
{
  "v": 1,
  "type": "todo",
  "eyebrow": "VIT → BENGALURU · OCT 2026 – JAN 2027",
  "subtitle": "Everything between now and the first day of the internship…",
  "months": [
    { "key": "2026-10", "note": "Finish the faculty projects…", "sub": "" },
    { "key": "2027-01", "note": "Settle in before day one.", "sub": "Joining month" }
  ],
  "tasks": [
    { "id": "7c0e…", "text": "Finish project 1: build, report and demo", "done": true, "doneAt": 1792050000000,
      "tag": "College", "date": null, "month": "2026-10", "created": 1792050000000 }
  ]
}
```

| Field | Meaning |
|---|---|
| `months[].key` | `YYYY-MM`. Order in the array does not matter; clients sort by key. |
| `months[].sub` | Text shown instead of the date range (e.g. "Joining month"). `""` = show `1–31 Oct`. |
| `tasks[].month` | `YYYY-MM` or `null` (shown as "No month"; called Unscheduled before 2026-10-17). |
| `tasks[].date` | `YYYY-MM-DD` or `null`. **If set, it must lie inside `month`.** The frontend enforces it on load (date wins). |
| `tasks[].tag` | Free text ≤ 40 chars, or `null`. Tags exist only as values on tasks; there is no tag list. |
| `tasks[].doneAt`, `created` | ms epoch, informational. |

### Page `content`: cards board *(Added 2026-10-17.)*

`"type": "board"`, `v` stays `1`. Same obligation 10 as planners: a client that doesn't know it
must not save over it.

Captured 2026-10-17 from a board built through the UI (trimmed to 2 of the 8 labels and 1 card):

```json
{"v":1,"type":"board","background":"aurora","labels":[{"id":"green","name":""},{"id":"yellow","name":""}],"columns":[{"id":"4aa41b30-f3d8-446b-aba4-bf76efb7b298","title":"Doing","cards":[{"id":"167ce331-33fe-4ffe-a21c-66ec9fe37e5f","title":"Build the API","description":"REST endpoints for notes","labels":["yellow","blue"],"checklist":[{"id":"c5c08507-05ef-44eb-9907-9520c6480e51","text":"Schema","done":true},{"id":"6e0b5bdd-1953-4d14-8f34-03fcc5a5643f","text":"Routes","done":true},{"id":"8e9d1680-514d-4716-9794-212ea6f4c217","text":"Tests","done":false}],"due":"2026-07-15","dueDone":false,"cover":null,"created":1792169052001}]}]}
```

*(2026-10-17:)* this capture predates theme-derived backgrounds; `"aurora"` now loads as `"tint"`.

| Field | Values |
|---|---|
| `background` | `tint` · `accent` · `soft` · `page`, all solid colors drawn from the active theme. Unknown → `tint`; the pre-2026-10-17 ids `aurora`/`ocean`/`sunset`/`forest`/`dusk` load as `tint` and `theme` as `page`. *(Changed 2026-10-17.)* |
| `labels[]` | Always the 8 fixed ids `green yellow orange red purple blue sky pink`, each with an optional `name` (≤ 40). |
| `cards[].labels` | Label ids; unknown ids are dropped on load. |
| `cards[].due` / `dueDone` | `YYYY-MM-DD` or `null`; `dueDone` marks the due date complete (green badge). |
| `cards[].cover` | A label id (solid color), `g-tint` or `g-accent` (theme gradient), or `null`. Any other `g-…` loads as `g-tint`. *(Changed 2026-10-17.)* |
| order | Array order is display order, for both `columns` and `cards`. |

The frontend's `normalizeBoard()` fills defaults, gives missing ids, and turns an empty card title
into "Untitled card".

### Page `content`: tab (money with people) *(Added 2026-10-29.)*

`"type": "tab"`, `v` stays `1`. Same obligation 10: a client that doesn't know it must not save
over it. No currency is stored or shown; amounts are plain numbers.

Example (one person, one combined item that was paid, one open item):

```json
{"v":1,"type":"tab","people":[{"id":"a","name":"Adarsh","payments":[{"id":"pay1","at":1793000000000}],"items":[{"id":"c","name":"Maggi and masala","qty":1,"price":106,"per":"total","payer":"me","created":1793000000000,"settled":"pay1","parts":[{"id":"1","name":"special maggi","qty":1,"price":40,"per":"total","payer":"me","created":1792900000000,"settled":null,"parts":null},{"id":"5","name":"shuttle","qty":1,"price":20,"per":"total","payer":"him","created":1792900000000,"settled":null,"parts":null}]},{"id":"8","name":"masala","qty":3,"price":5,"per":"unit","payer":"me","created":1793000000000,"settled":null,"parts":null}]}]}
```

| Field | Values |
|---|---|
| `items[].price` + `per` | The number that was typed, ≥ 0. `per: "total"` → it is the item's total and each = total ÷ qty; `per: "unit"` → it is the price of one and total = price × qty. Storing what was typed avoids rounding drift (100 for 3 stays 100, shown as 33.33 each). |
| `items[].qty` | > 0, decimals allowed. Missing or ≤ 0 loads as 1. |
| `items[].payer` | `me` (they owe you) or `him` (you owe them). The UI shows the person's name, not "him". |
| `items[].settled` | The id of the payment that covers it, or `null` while open. Pointing at a missing payment loads as `null`. |
| `items[].parts` | For a combined item, the original items (their `settled` is always `null`); otherwise `null`. The combined item's own `price` is the agreed amount, which may differ from the parts' sum. |
| `items[].split` | *(Added 2026-10-29.)* On items made by "Split a bill": `{total, method, ways}` with `method` one of `equal exact percent shares fraction`; otherwise `null`. Display only: the item's own `price` is the share. Bad values load as `null`; an unknown method as `equal`. |
| `payments[]` | `{id, at}` only. A payment's amount is the signed sum of the items that point at it, never stored. A payment no item points at is dropped on load. |
| order | Array order is display order for `people` and for open items. |

Balance for a person = Σ over open items of (+total if `payer` is `me`, −total if `him`).

Clients must tolerate missing fields (the frontend's `normalizeTodo()` fills defaults and drops
tasks with empty text). A client that does not understand `type: "todo"` **must not save over
such a page.** It would replace the planner with a canvas. The view choice (Month/Date/Tag, hide
completed) is not stored in the page.

## 3. Notebooks

| Method & path | Body | Success | Notes |
|---|---|---|---|
| `GET /notebooks` | — | `200` `[Notebook]` | Ordered by `sort`, `created_at`. |
| `POST /notebooks` | `{"name":"Work","color":"#4a90e2"}` | `201` Notebook | Also creates section "New Section 1" with one empty page. |
| `PATCH /notebooks/:id` | `{"name"?, "color"?}` | `200` Notebook | `404` if unknown. |
| `DELETE /notebooks/:id` | — | `204` | **Permanent, cascades.** `404` if unknown. |
| `GET /notebooks/:id/tree` | — | `200` `{notebook, sections:[Section], pages:[Page list form]}` | Excludes trashed pages. `404 {"error":"Notebook not found"}`. |

## 4. Sections

| Method & path | Body | Success | Notes |
|---|---|---|---|
| `GET /sections` | — | `200` `[{id,name,color,notebook_id,notebook_name}]` | All sections in all notebooks, for "Move to…" pickers. |
| `POST /sections` | `{"notebook_id":"…","name"?,"color"?}` | `201` `{section, page}` | Creates one empty page too. `page` here has **no** `content`/`text` fields. `400 {"error":"Unknown notebook"}`. |
| `PATCH /sections/:id` | `{"name"?, "color"?, "notebook_id"?}` | `200` Section | `notebook_id` moves the section (to the end). |
| `DELETE /sections/:id` | — | `204` | **Permanent, cascades.** |

Example `POST /sections` response:

```json
{"section":{"id":"3a444712-f00b-4d60-952c-a2546d887e23","notebook_id":"5d7de32e-f8f6-44b3-a3ac-bb11dfa4d1a8","name":"Homelab","color":"#4a90e2","sort":2,"created_at":1792038193519,"updated_at":1792038193519},"page":{"id":"5ea75ff4-9c60-43c7-8898-04b5740c1665","section_id":"3a444712-f00b-4d60-952c-a2546d887e23","title":"","level":0,"sort":0,"created_at":1792038193519,"updated_at":1792038193519}}
```

## 5. Pages

| Method & path | Body | Success | Notes |
|---|---|---|---|
| `POST /pages` | `{"section_id":"…","title"?,"level"?,"after_id"?,"content"?,"text"?}` | `201` full page row | `after_id` inserts directly below that page and shifts the rest down. Otherwise the page goes at the end. `content`/`text` (strings) create the page already filled, e.g. from a template; obligations 1 and 2 apply. *(content/text added 2026-10-15.)* `400 {"error":"Unknown section"}`. |
| `GET /pages/:id` | — | `200` Page full form | Returns trashed pages too (check `deleted_at`). `404 {"error":"Page not found"}`. |
| `PATCH /pages/:id` | any of `title`, `content` (string), `text`, `level`, `section_id` | `200` Page list form | `section_id` moves the page to the end of that section and resets `level` to 0. Unknown fields are ignored. |
| `DELETE /pages/:id` | — | `204` | Moves to trash. Purged automatically after 60 days. |
| `DELETE /pages/:id?permanent=1` | — | `204` | Gone for good. |
| `POST /pages/:id/restore` | — | `200` `{id, section_id, notebook_id}` | Use `notebook_id` to navigate to the restored page. |

`POST /pages` with `after_id` and `level` (captured):

```json
{"id":"cc1cafb0-479d-4b40-9951-647c1ae5d5ad","section_id":"3a444712-f00b-4d60-952c-a2546d887e23","title":"","content":"","text":"","level":1,"sort":1,"created_at":1792038193986,"updated_at":1792038193986}
```

The save the frontend sends on every autosave:

```http
PATCH /api/pages/5ea75ff4-9c60-43c7-8898-04b5740c1665
Content-Type: application/json

{"title":"BackUp","content":"{\"v\":1,\"lines\":\"none\",\"blocks\":[…],\"ink\":[]}","text":"Get a harddisk"}
```

## 6. Trash

| Method & path | Success | Notes |
|---|---|---|
| `GET /trash` | `200` `[{id,title,deleted_at,section_id,section_name,section_color,notebook_id,notebook_name}]` | Newest first. |
| `DELETE /trash` | `204` | Permanently deletes every trashed page. |

## 7. Ordering

`PUT /reorder` with `{"kind":"notebooks|sections|pages","ids":["…","…"],"levels"?:{"<pageId>":1}}` →
`204`. Sets each id's `sort` to its array index. `levels` (pages only) sets subpage depth in the
same transaction. Ids not in the array keep their old `sort`, so send the complete sibling list.
`400 {"error":"kind and ids are required"}` for any other `kind`.

## 8. Search and recent

`GET /search?q=<terms>[&notebook=<id>]`: every whitespace-separated term (max 8) must appear in the
title **or** the text, case-insensitive for ASCII, matching substrings. Title matches rank first,
then newest-modified. At most 100 results. Empty `q` → `[]`.

```json
[{"id":"5ea75ff4-9c60-43c7-8898-04b5740c1665","title":"BackUp","updated_at":1792038194051,"created_at":1792038193519,"section_id":"3a444712-f00b-4d60-952c-a2546d887e23","section_name":"Homelab","section_color":"#4a90e2","notebook_id":"5d7de32e-f8f6-44b3-a3ac-bb11dfa4d1a8","notebook_name":"My Notebook","snippet":"Get a harddisk"}]
```

`snippet` is ≤ ~150 chars of `text` around the first term, with `…` where cut. It is plain text:
escape it before inserting into HTML.

`GET /recent[?limit=n]`: same shape (snippet from the start of the text), ordered by
`updated_at` descending, default 40, max 100.

## 9. Settings

`GET /settings` → `200` `{"displayName":"Akshat"}`. `PUT /settings` with an object → `204`. Keys must
match `^[\w.-]{1,64}$`. Other keys are **silently dropped** (e.g. `"bad key!"`). Values may be any
JSON. Known keys: `displayName`, `appearance` *(added 2026-10-16)*.

`appearance` is written by the Theme tab (whole object on every change, debounced 300 ms).
Captured 2026-10-16 after choosing the Compact look, the Georgia font and creating "Sunset":

```json
{"appearance":{"scheme":"custom-mvb6556tyi86","followSystem":false,"look":{"density":"compact","corners":"square","font":"georgia","page":"flat","tabs":"bar"},"custom":[{"id":"custom-mvb6556tyi86","name":"Sunset","base":"dark","seeds":{"accent":"#ff6b35","canvas":"#1e1e1e","panel":"#262626","chrome":"#1f1f1f","text":"#e8e8e8","heading":"#8ab4f8","link":"#8ab4f8","todo":"#4fbfb0"},"custom":true}]}}
```

| Field | Values |
|---|---|
| `scheme` | A built-in id (`classic-dark`, `classic-light`, `midnight`, `arctic`, `forest`, `nightshade`, `espresso`, `solar-dark`, `hc-dark`, `solar-light`, `paper`, `rose`, `ocean`, `hc-light`) or a `custom[].id`. Unknown → `classic-dark`. |
| `followSystem` | `true` = ignore `scheme`, use Classic Light/Dark by the OS setting. |
| `look.*` | `density`: compact·comfortable·spacious; `corners`: square·rounded·round; `font`: segoe·system·trebuchet·verdana·georgia·mono; `page`: flat·paper; `tabs`: bar·dot·filled. Unknown values fall back to the Classic look's. |
| `custom[]` | `id` must start with `custom-`; all 8 `seeds` must be `#rrggbb`, or the theme is dropped on load. `name` ≤ 40 chars. |

The server stores it opaquely. A client that writes it must send the **whole** object, because
`PUT /settings` replaces a key's value rather than merging inside it.

## 10. Uploads

`POST /uploads`, raw body ≤ 100 MB, headers `Content-Type: application/octet-stream`,
`X-Filename: <encodeURIComponent(name)>` → `201`:

```json
{"url":"/uploads/cb1a574a-caf6-4647-8838-26d57567a939.txt","name":"notes v2.txt","size":5}
```

`url` is relative to the server root. Files are served from `GET /uploads/<file>` with
`nosniff`. Anything that is not a common image, audio, video, PDF or `.txt` file is served as
`Content-Disposition: attachment` (it downloads instead of opening). `400 {"error":"Empty upload"}`
for an empty body, or for an `application/json` body (obligation 3).

## 11. Backup

`GET /export` → `200`, `Content-Disposition: attachment; filename="notes-backup-2026-10-15.json"`,
body `{"app":"onenote-clone","version":1,"exported_at":…,"notebooks":[…],"sections":[…],"pages":[…]}`.
Rows are complete database rows. Trashed pages and uploaded files are **not** included.

`POST /import` with that object (≤ 500 MB) → `201` `{"notebooks":2,"sections":4,"pages":4}`.
Everything is created with **new ids** alongside existing data, so importing twice duplicates it.
Sections whose notebook is missing from the file, and pages whose section is missing, are skipped.
`400 {"error":"Not a valid backup file"}` if any of the three arrays is missing.

## Errors

Every error body is `{"error": "<message>"}`. There are no machine-readable error codes:
**branch on the HTTP status.**

| Status | When | Example captured |
|---|---|---|
| `400` | Malformed JSON body | `{"error":"Expected property name or '}' in JSON at position 1 (line 1 column 2)"}` |
| `400` | Referenced parent does not exist | `{"error":"Unknown section"}`, `{"error":"Unknown notebook"}` |
| `400` | Invalid request shape | `{"error":"kind and ids are required"}`, `{"error":"Not a valid backup file"}`, `{"error":"Empty upload"}` |
| `404` | Unknown id | `{"error":"Page not found"}`, `{"error":"Notebook not found"}` |
| `404` | Unknown `/api` route | `{"error":"Not found"}` |
| `413` | Body over the limit (25 MB JSON, 100 MB upload, 500 MB import) | *(not captured)* |
| `500` | Bug | `{"error":"Server error"}`. Details only in the server's console. |

## Versioning

There is one client (this repo's frontend) and no version prefix. A breaking change is any change
that would make a client written against this file misbehave: removing or renaming a field,
changing a field's type or units, changing a default, or turning a silently-ignored input into an
error (or the reverse). Such a change ships in the same commit as the frontend change, with a dated
note at the affected section of this file. The page `content` schema carries its own version
(`v: 1`). A new layout must bump `v` and keep loading `v: 1`.

*(Clarified 2026-10-15.)* Adding a new page **type** with a `type` discriminator (as `"todo"` was)
is additive and does not bump `v`, because every existing page keeps its meaning. The obligation
moves to clients: one that does not know a `type` must treat the page as read-only.
