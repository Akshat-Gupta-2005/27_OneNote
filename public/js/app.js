import { api } from './api.js';
import { hydrateIcons, svg, setIcon } from './icons.js';
import { h, esc, showMenu, showPopover, closeMenus, modal, promptDialog, confirmDialog, toast, fmtRelative } from './ui.js';
import { PageEditor } from './editor.js';
import { PAGE_TEMPLATES, INSERT_TEMPLATES, findTemplate, findInsertTemplate } from './templates.js';
import * as theme from './theme.js';

// ================= constants =================
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const SECTION_COLORS = ['#f2b636', '#3db04a', '#4a90e2', '#a874d6', '#e35d6a', '#f08b3e', '#36b5a8', '#d76fb0', '#8e9aaf', '#c8a26b', '#5c6bc0', '#26a69a'];
const NOTEBOOK_COLORS = ['#7719aa', '#4a90e2', '#3db04a', '#e35d6a', '#f08b3e', '#36b5a8', '#d76fb0', '#f2b636', '#8e9aaf', '#5c6bc0', '#c8a26b', '#26a69a'];
const HIGHLIGHTS = ['rgba(255, 235, 59, 0.5)', 'rgba(118, 255, 3, 0.4)', 'rgba(0, 229, 255, 0.4)', 'rgba(255, 64, 129, 0.4)', 'rgba(41, 121, 255, 0.4)', 'rgba(255, 82, 82, 0.45)',
  'rgba(255, 145, 0, 0.45)', 'rgba(170, 0, 255, 0.35)', 'rgba(158, 158, 158, 0.45)'];
const FONT_COLORS = ['#000000', '#ffffff', '#7f7f7f', '#c00000', '#ff0000', '#ffc000', '#ffff00', '#92d050', '#00b050', '#00b0f0', '#0070c0', '#002060',
  '#7030a0', '#e0393e', '#f08b3e', '#a874d6', '#4a90e2', '#36b5a8'];
const PEN_COLORS = ['var(--ink-auto)', '#e0393e', '#2f7de1', '#2ea44f', '#a874d6', '#f08b3e', '#000000', '#ffffff', '#ffd400', '#00b0f0', '#d76fb0', '#8d6e63'];
const INK_HL_COLORS = ['#ffeb3b', '#76ff03', '#00e5ff', '#ff4081', '#ff9100', '#b388ff'];
const FONTS = ['Calibri', 'Calibri Light', 'Arial', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas', 'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana'];
const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 72];
const STYLES = [
  { tag: 'h1', label: 'Heading 1', style: { fontSize: '16pt', color: 'var(--h1)', fontWeight: 300 } },
  { tag: 'h2', label: 'Heading 2', style: { fontSize: '14pt', color: 'var(--h2)', fontWeight: 300 } },
  { tag: 'h3', label: 'Heading 3', style: { fontSize: '12pt', color: 'var(--h3)' } },
  { tag: 'h4', label: 'Heading 4', style: { fontSize: '12pt', color: 'var(--h4)', fontStyle: 'italic' } },
  { tag: 'h5', label: 'Heading 5', style: { color: 'var(--h5)' } },
  { tag: 'h6', label: 'Heading 6', style: { color: 'var(--h6)', fontStyle: 'italic' } },
  { tag: 'blockquote', label: 'Quote', style: { fontStyle: 'italic' } },
  { tag: 'pre', label: 'Code', style: { fontFamily: 'Consolas, monospace' } },
  { tag: 'div', label: 'Normal', style: {} },
];
const TAGS = [
  { tag: 'todo', label: 'To Do', icon: 'todo', hint: 'Ctrl+1' },
  { tag: 'important', label: 'Important', icon: 'star', hint: 'Ctrl+2', color: '#f6c026' },
  { tag: 'question', label: 'Question', icon: 'question', hint: 'Ctrl+3', color: '#8a5cd6' },
  { tag: 'critical', label: 'Critical', icon: 'critical', color: '#e0393e' },
  { tag: 'idea', label: 'Idea', icon: 'idea', color: '#f2b636' },
  { tag: 'contact', label: 'Contact', icon: 'contact', color: '#4a90e2' },
];
const LINES = [
  { value: 'none', label: 'No rule lines' },
  { value: 'narrow', label: 'Narrow ruled' },
  { value: 'college', label: 'College ruled' },
  { value: 'grid-small', label: 'Small grid' },
  { value: 'grid-large', label: 'Large grid' },
];
const LANGS = [
  ['en-US', 'English (United States)'], ['en-GB', 'English (United Kingdom)'], ['en-IN', 'English (India)'], ['hi-IN', 'Hindi'],
  ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['ja-JP', 'Japanese'], ['zh-CN', 'Chinese (Simplified)'],
];
const SORTS = [
  { value: 'custom', label: 'Custom (drag to reorder)' },
  { value: 'title', label: 'Alphabetical' },
  { value: 'created', label: 'Date created' },
  { value: 'modified', label: 'Date modified' },
];
const PAGE_CMDS = new Set(['undo', 'redo', 'paste', 'bold', 'italic', 'underline', 'highlight', 'fontColor', 'painter', 'clearFormat', 'bullets',
  'numbering', 'outdent', 'indent', 'todo', 'dictate', 'picture', 'file', 'link', 'date', 'time', 'datetime', 'hr', 'newContainer',
  'modePen', 'modeHl', 'modeEraser', 'clearInk', 'print', 'exportPage', 'share']);

// ================= persistence helpers =================
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`oc.${key}`);
      return v == null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(`oc.${key}`, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
};

const prefs = Object.assign({
  highlight: HIGHLIGHTS[0],
  fontColor: '#e0393e',
  dictLang: navigator.language || 'en-US',
  pen: { color: 'auto', width: 2 },
  hl: { color: '#ffeb3b', width: 14 },
}, store.get('prefs', {}));
const savePrefs = () => store.set('prefs', prefs);

const state = {
  notebooks: [],
  notebook: null,
  sections: [],
  pages: [],
  sectionId: null,
  pageId: null,
  pane: 'notebooks',
  sort: store.get('pageSort', 'custom'),
  searchScope: store.get('searchScope', 'all'),
  lastPageBySection: store.get('lastPageBySection', {}),
  lastSectionByNotebook: store.get('lastSectionByNotebook', {}),
  settings: {},
};

const app = $('#app');
const editor = new PageEditor();
editor.pen = prefs.pen;
editor.highlighter = prefs.hl;
let pendingTitleFocus = null;
let openSeq = 0;

const isMobile = () => matchMedia('(max-width: 760px)').matches;
const findPage = (id) => state.pages.find((p) => p.id === id);
const findSection = (id) => state.sections.find((s) => s.id === id);
const pageLink = (id) => `${location.origin}${location.pathname}#/page/${id}`;

// ================= data loading =================
async function loadTree(notebookId) {
  const tree = await api.get(`/notebooks/${notebookId}/tree`);
  state.notebook = tree.notebook;
  state.sections = tree.sections;
  state.pages = tree.pages;
  const i = state.notebooks.findIndex((n) => n.id === tree.notebook.id);
  if (i >= 0) state.notebooks[i] = tree.notebook;
  store.set('lastNotebook', notebookId);
  renderNotebookButton();
}

async function refreshTree() {
  if (!state.notebook) return;
  await loadTree(state.notebook.id);
  renderSections();
  renderPages();
}

function sortedPages(sectionId) {
  const list = state.pages.filter((p) => p.section_id === sectionId);
  const name = (p) => p.title || 'Untitled page';
  const cmp = {
    custom: (a, b) => a.sort - b.sort || a.created_at - b.created_at,
    title: (a, b) => name(a).localeCompare(name(b), undefined, { numeric: true, sensitivity: 'base' }),
    created: (a, b) => b.created_at - a.created_at,
    modified: (a, b) => b.updated_at - a.updated_at,
  }[state.sort] || ((a, b) => a.sort - b.sort);
  return list.sort(cmp);
}

// ================= navigation =================
async function openNotebook(id) {
  await editor.flush();
  try {
    await loadTree(id);
  } catch {
    toast('Could not open that notebook.');
    return;
  }
  const remembered = state.lastSectionByNotebook[id];
  const section = findSection(remembered) || state.sections[0];
  if (section) {
    await selectSection(section.id);
  } else {
    state.sectionId = null;
    state.pageId = null;
    renderSections();
    renderPages();
    showNoSections();
  }
}

async function selectSection(id, { pageId } = {}) {
  state.sectionId = id;
  if (state.notebook) {
    state.lastSectionByNotebook[state.notebook.id] = id;
    store.set('lastSectionByNotebook', state.lastSectionByNotebook);
  }
  renderSections();
  renderPages();
  const pages = sortedPages(id);
  const target = pageId || (pages.find((p) => p.id === state.lastPageBySection[id]) || pages[0])?.id;
  if (target) {
    await navigateToPage(target);
  } else {
    await editor.flush();
    state.pageId = null;
    renderPages();
    showSectionEmpty();
  }
}

function navigateToPage(id, { replace = false, quiet = false } = {}) {
  const hash = `#/page/${id}`;
  if (replace || !location.hash) history.replaceState(null, '', hash);
  else if (location.hash !== hash) history.pushState(null, '', hash);
  return openPage(id, { quiet });
}

async function openPage(id, { force = false, quiet = false } = {}) {
  if (!force && editor.page?.id === id) {
    if (isMobile()) setPanelVisible(false);
    return true;
  }
  const seq = ++openSeq;
  await editor.flush();
  let page;
  try {
    page = await api.get(`/pages/${id}`);
  } catch (err) {
    if (seq === openSeq && !quiet) toast(err.status === 404 ? 'That page no longer exists.' : 'Could not open the page.');
    return false;
  }
  if (seq !== openSeq) return false;
  if (page.deleted_at) {
    if (!quiet) toast('That page is in Deleted pages. Restore it to open it.');
    return false;
  }
  try {
    if (state.notebook?.id !== page.notebook_id) await loadTree(page.notebook_id);
    else if (!findPage(id)) await loadTree(page.notebook_id);
  } catch {
    return false;
  }
  if (seq !== openSeq) return false;

  state.sectionId = page.section_id;
  state.pageId = id;
  state.lastPageBySection[page.section_id] = id;
  state.lastSectionByNotebook[page.notebook_id] = page.section_id;
  store.set('lastPageBySection', state.lastPageBySection);
  store.set('lastSectionByNotebook', state.lastSectionByNotebook);
  store.set('lastPage', id);

  renderSections();
  renderPages();
  editor.load(page);
  updateDocTitle();
  updateRibbonState();
  updateHistoryButtons();
  $(`#pageList [data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  if (pendingTitleFocus === id) {
    pendingTitleFocus = null;
    editor.focusTitle();
  }
  if (isMobile()) setPanelVisible(false);
  return true;
}

function updateDocTitle() {
  const title = editor.page ? editor.page.title || 'Untitled page' : state.notebook?.name || 'Notes';
  document.title = `${title} – OneNote Clone`;
}

function updateHistoryButtons() {
  if (!window.navigation) return;
  $('#navBack').disabled = !navigation.canGoBack;
  $('#navFwd').disabled = !navigation.canGoForward;
}

addEventListener('popstate', () => {
  const m = location.hash.match(/^#\/page\/([\w-]+)/);
  if (m) openPage(m[1]);
  updateHistoryButtons();
});

// ================= empty states =================
function showSectionEmpty() {
  editor.showEmpty(
    h('h3', {}, 'This section is empty'),
    h('p', {}, 'Add a page to start taking notes.'),
    h('button', { class: 'btn primary', onclick: () => addPage() }, 'Add page'),
  );
  history.replaceState(null, '', location.pathname);
  updateDocTitle();
}

function showNoSections() {
  editor.showEmpty(
    h('h3', {}, 'This notebook has no sections'),
    h('p', {}, 'Sections keep related pages together.'),
    h('button', { class: 'btn primary', onclick: () => addSection() }, 'Add section'),
  );
  history.replaceState(null, '', location.pathname);
  updateDocTitle();
}

function showNoNotebooks() {
  state.notebook = null;
  state.sections = [];
  state.pages = [];
  state.sectionId = null;
  state.pageId = null;
  renderNotebookButton();
  renderSections();
  renderPages();
  editor.showEmpty(
    h('h3', {}, 'No notebooks yet'),
    h('p', {}, 'Create a notebook to get started.'),
    h('button', { class: 'btn primary', onclick: () => addNotebook() }, 'Create notebook'),
  );
  history.replaceState(null, '', location.pathname);
}

// ================= rendering =================
function renderNotebookButton() {
  const nb = state.notebook;
  $('#nbName').textContent = nb ? nb.name : 'No notebook';
  const icon = $('#nbIcon');
  icon.innerHTML = svg('notebook', 18);
  icon.style.color = nb?.color || 'var(--text-dim)';
}

function renderSections() {
  const list = $('#sectionList');
  if (list.querySelector('.rename-input')) return; // don't clobber an in-progress rename
  const keep = rememberListFocus(list);
  list.replaceChildren();
  if (!state.notebook) return;
  if (!state.sections.length) {
    list.append(h('li', { class: 'list-empty' }, 'No sections yet.'));
    return;
  }
  for (const s of state.sections) {
    list.append(h('li', {
      class: 'sec-item' + (s.id === state.sectionId ? ' active' : ''),
      dataset: { id: s.id }, draggable: 'true', role: 'option', title: s.name, style: `--c:${s.color}`,
      tabindex: s.id === state.sectionId ? '0' : '-1',
      'aria-selected': String(s.id === state.sectionId),
    }, h('span', { class: 'sec-tab', style: `--c:${s.color}` }), h('span', { class: 'sec-name' }, s.name)));
  }
  ensureTabStop(list);
  keep();
}

function renderPages() {
  const list = $('#pageList');
  const keep = rememberListFocus(list);
  list.replaceChildren();
  if (!state.sectionId) return;
  const pages = sortedPages(state.sectionId);
  if (!pages.length) {
    list.append(h('li', { class: 'list-empty' }, 'No pages in this section.'));
    return;
  }
  for (const p of pages) {
    const level = state.sort === 'custom' ? p.level : 0;
    list.append(h('li', {
      class: 'page-item' + (p.id === state.pageId ? ' active' : '') + (p.title ? '' : ' untitled'),
      dataset: { id: p.id }, draggable: 'true', role: 'option', style: `--lvl:${level}`,
      title: p.title || 'Untitled page', 'aria-selected': String(p.id === state.pageId),
      tabindex: p.id === state.pageId ? '0' : '-1',
    }, h('span', { class: 'page-name' }, p.title || 'Untitled page')));
  }
  ensureTabStop(list);
  keep();
}

// List items are focusable (one Tab stop per list, arrows move within it). Re-rendering replaces
// the <li>s, so put focus back on the same item, or on the active one if it was deleted (P13).
function rememberListFocus(list) {
  const had = list.contains(document.activeElement);
  const id = had ? document.activeElement.closest('[data-id]')?.dataset.id : null;
  return () => {
    if (!had) return;
    const el = (id && list.querySelector(`[data-id="${CSS.escape(id)}"]`)) || list.querySelector('.active') || list.querySelector('[data-id]');
    el?.focus({ preventScroll: true });
  };
}

function ensureTabStop(list) {
  if (!list.querySelector('[tabindex="0"]')) list.querySelector('[data-id]')?.setAttribute('tabindex', '0');
}

function renderUser() {
  $('#userName').textContent = state.settings.displayName || 'Me';
}

// ================= notebooks =================
function openNotebookPicker() {
  const wrap = h('div', { class: 'nb-pop' }, h('div', { class: 'menu-heading' }, 'Notebooks'));
  for (const nb of state.notebooks) {
    wrap.append(h('div', { class: 'nb-row' + (nb.id === state.notebook?.id ? ' current' : '') },
      h('button', { class: 'nb-row-main', onclick: () => { closeMenus(); openNotebook(nb.id); } },
        h('span', { class: 'nb-icon', style: `color:${nb.color}`, html: svg('notebook', 18) }),
        h('span', {}, nb.name)),
      h('button', {
        class: 'nb-row-more', title: 'Notebook options', html: svg('more', 16),
        onclick: (e) => { e.stopPropagation(); notebookMenu(nb, e.currentTarget); },
      })));
  }
  wrap.append(h('div', { class: 'menu-sep' }),
    h('button', { class: 'menu-item', onclick: () => { closeMenus(); addNotebook(); } },
      h('span', { class: 'mi-icon', html: svg('plus', 16) }), h('span', { class: 'mi-label' }, 'Add notebook')));
  showPopover($('#nbSwitch'), wrap);
}

function notebookMenu(nb, anchor) {
  showMenu(anchor, [
    { label: 'Open', icon: 'notebook', onClick: () => openNotebook(nb.id) },
    { label: 'Rename', icon: 'edit', onClick: () => renameNotebook(nb) },
    { label: 'Notebook color', icon: 'palette', submenu: [{ swatches: NOTEBOOK_COLORS, value: nb.color, onPick: (c) => updateNotebook(nb, { color: c }) }] },
    { separator: true },
    { label: 'Delete notebook', icon: 'trash', danger: true, onClick: () => deleteNotebook(nb) },
  ]);
}

async function addNotebook() {
  const name = await promptDialog('New notebook', { label: 'Notebook name', value: 'New Notebook', okLabel: 'Create' });
  if (!name) return;
  const color = NOTEBOOK_COLORS[state.notebooks.length % NOTEBOOK_COLORS.length];
  const nb = await api.post('/notebooks', { name, color });
  state.notebooks.push(nb);
  await openNotebook(nb.id);
  toast(`Created "${nb.name}"`);
}

async function renameNotebook(nb) {
  const name = await promptDialog('Rename notebook', { label: 'Notebook name', value: nb.name, okLabel: 'Rename' });
  if (name && name !== nb.name) updateNotebook(nb, { name });
}

async function updateNotebook(nb, fields) {
  const updated = await api.patch(`/notebooks/${nb.id}`, fields);
  Object.assign(nb, updated);
  if (state.notebook?.id === nb.id) Object.assign(state.notebook, updated);
  renderNotebookButton();
  updateDocTitle();
}

async function deleteNotebook(nb) {
  const ok = await confirmDialog('Delete notebook?', `"${nb.name}" and every section and page inside it will be permanently deleted. This can't be undone.`, { okLabel: 'Delete notebook' });
  if (!ok) return;
  if (state.notebook?.id === nb.id) await editor.flush();
  await api.del(`/notebooks/${nb.id}`);
  state.notebooks = state.notebooks.filter((n) => n.id !== nb.id);
  toast(`Deleted "${nb.name}"`);
  if (state.notebook?.id === nb.id) {
    if (state.notebooks.length) await openNotebook(state.notebooks[0].id);
    else showNoNotebooks();
  }
}

// ================= sections =================
async function addSection() {
  if (!state.notebook) return addNotebook();
  await editor.flush();
  const { section, page } = await api.post('/sections', { notebook_id: state.notebook.id });
  state.sections.push(section);
  state.pages.push(page);
  await selectSection(section.id, { pageId: page.id });
  startRenameSection(section.id);
}

function startRenameSection(id) {
  const s = findSection(id);
  const li = $(`#sectionList [data-id="${id}"]`);
  if (!s || !li) return;
  const nameEl = li.querySelector('.sec-name');
  const input = h('input', { class: 'rename-input', value: s.name, 'aria-label': 'Section name' });
  nameEl.replaceWith(input);
  li.draggable = false;
  input.focus();
  input.select();
  let done = false;
  const finish = async (commit) => {
    if (done) return;
    done = true;
    const value = input.value.trim();
    input.remove();
    if (commit && value && value !== s.name) await updateSection(s, { name: value });
    renderSections();
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

async function updateSection(s, fields) {
  try {
    Object.assign(s, await api.patch(`/sections/${s.id}`, fields));
  } catch {
    toast('Could not update the section.');
  }
  renderSections();
}

async function moveSection(s, notebookId) {
  await editor.flush();
  await api.patch(`/sections/${s.id}`, { notebook_id: notebookId });
  const nb = state.notebooks.find((n) => n.id === notebookId);
  toast(`Moved "${s.name}" to ${nb?.name || 'notebook'}`);
  if (s.id === state.sectionId) {
    await openNotebook(notebookId);
  } else {
    await refreshTree();
  }
}

async function deleteSection(s) {
  const count = state.pages.filter((p) => p.section_id === s.id).length;
  const ok = await confirmDialog('Delete section?',
    `"${s.name}" and its ${count} page${count === 1 ? '' : 's'} will be permanently deleted. This can't be undone.`, { okLabel: 'Delete section' });
  if (!ok) return;
  const idx = state.sections.indexOf(s);
  if (s.id === state.sectionId) await editor.flush();
  await api.del(`/sections/${s.id}`);
  state.sections = state.sections.filter((x) => x.id !== s.id);
  state.pages = state.pages.filter((p) => p.section_id !== s.id);
  if (s.id === state.sectionId) {
    const next = state.sections[idx] || state.sections[idx - 1];
    if (next) await selectSection(next.id);
    else {
      state.sectionId = null;
      state.pageId = null;
      renderSections();
      renderPages();
      showNoSections();
    }
  } else {
    renderSections();
  }
  toast(`Deleted section "${s.name}"`);
}

function sectionMenu(s, at) {
  const others = state.notebooks.filter((n) => n.id !== state.notebook?.id);
  showMenu(at, [
    { label: 'Rename', icon: 'edit', onClick: () => startRenameSection(s.id) },
    { label: 'Section color', icon: 'palette', submenu: [{ swatches: SECTION_COLORS, value: s.color, onPick: (c) => updateSection(s, { color: c }) }] },
    { label: 'Move to notebook', icon: 'move', disabled: !others.length, submenu: () => others.map((n) => ({ label: n.name, onClick: () => moveSection(s, n.id) })) },
    { label: 'New section', icon: 'plus', onClick: () => addSection() },
    { separator: true },
    { label: 'Delete section', icon: 'trash', danger: true, onClick: () => deleteSection(s) },
  ]);
}

async function reorderSection(id, targetId, after) {
  const ids = state.sections.map((s) => s.id).filter((x) => x !== id);
  ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, id);
  state.sections.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  state.sections.forEach((s, i) => { s.sort = i; });
  renderSections();
  await api.put('/reorder', { kind: 'sections', ids });
}

// ================= pages =================
async function addPage({ after, level = 0, template = 'blank' } = {}) {
  if (!state.sectionId) {
    if (state.notebook) return addSection();
    return addNotebook();
  }
  await editor.flush();
  const tpl = findTemplate(template) || findTemplate('blank');
  const payload = tpl.build(new Date());
  const page = await api.post('/pages', { section_id: state.sectionId, after_id: after, level, ...payload });
  await refreshTree();
  // A blank page starts at its title; a template already has one, so leave focus alone.
  if (tpl.id === 'blank') pendingTitleFocus = page.id;
  await navigateToPage(page.id);
}

/**
 * Insert a template's containers into the open freeform page. An untitled page takes the
 * template's title; otherwise the title becomes a heading above the inserted notes. Undoable.
 */
function insertTemplate(id) {
  const tpl = findInsertTemplate(id);
  if (!tpl || !editor.page) return;
  if (editor.structured) return toast('Templates can be inserted into freeform pages only.');
  const { title, blocks } = tpl.build(new Date());
  const tookTitle = !editor.titleText();
  let specs = blocks;
  if (tookTitle) {
    editor.setTitle(title);
  } else if (blocks.length === 1) {
    specs = [{ ...blocks[0], html: `<h1>${esc(title)}</h1>${blocks[0].html}` }];
  } else {
    const minY = Math.min(...blocks.map((b) => b.y));
    specs = [{ x: 60, y: minY - 56, w: null, html: `<h1>${esc(title)}</h1>` }, ...blocks];
  }
  const added = editor.insertBlocks(specs);
  if (!added.length) return;
  toast(`Inserted ${tpl.name}`, {
    action: 'Undo',
    timeout: 6000,
    onAction: () => {
      if (!added[0].isConnected) return toast('That page is no longer open.');
      for (const b of added) b.remove();
      if (tookTitle) editor.setTitle('');
      editor.scheduleSave();
      editor.updateExtent();
    },
  });
}

function templateItems(opts = {}) {
  return PAGE_TEMPLATES.map((t) => ({ label: t.name, icon: t.icon, hint: t.hint, onClick: () => addPage({ ...opts, template: t.id }) }));
}

function openTemplateMenu(anchor, opts = {}) {
  showMenu(anchor, [{ heading: 'New page from template' }, ...templateItems(opts)]);
}

async function setPageLevel(page, level) {
  page.level = level;
  renderPages();
  await api.patch(`/pages/${page.id}`, { level });
}

async function deletePage(id) {
  const page = findPage(id);
  if (!page) return;
  const list = sortedPages(page.section_id);
  const idx = list.findIndex((p) => p.id === id);
  const isCurrent = id === state.pageId;
  if (isCurrent) await editor.flush();
  try {
    await api.del(`/pages/${id}`);
  } catch {
    toast('Could not delete the page.');
    return;
  }
  state.pages = state.pages.filter((p) => p.id !== id);
  if (isCurrent) {
    const next = list[idx + 1] || list[idx - 1];
    state.pageId = null;
    if (next) await navigateToPage(next.id, { replace: true });
    else {
      renderPages();
      showSectionEmpty();
    }
  } else {
    renderPages();
  }
  toast(`Deleted "${page.title || 'Untitled page'}"`, { action: 'Undo', onAction: () => restorePage(id), timeout: 6000 });
}

async function restorePage(id) {
  try {
    const r = await api.post(`/pages/${id}/restore`);
    if (state.notebook?.id === r.notebook_id) await refreshTree();
    await navigateToPage(id);
    if (state.pane === 'trash') loadTrash();
  } catch {
    toast('Could not restore the page.');
  }
}

async function movePage(pageId, sectionId) {
  const page = findPage(pageId);
  if (page && page.section_id === sectionId) return;
  const isCurrent = pageId === state.pageId;
  if (isCurrent) await editor.flush();
  try {
    await api.patch(`/pages/${pageId}`, { section_id: sectionId });
  } catch {
    toast('Could not move the page.');
    return;
  }
  await refreshTree();
  if (isCurrent) await openPage(pageId, { force: true });
  toast('Page moved');
}

async function moveDialog(page) {
  const sections = await api.get('/sections');
  const select = h('select', { class: 'select', 'aria-label': 'Destination section' });
  const groups = new Map();
  for (const s of sections) {
    if (!groups.has(s.notebook_id)) {
      const g = h('optgroup', { label: s.notebook_name });
      groups.set(s.notebook_id, g);
      select.append(g);
    }
    groups.get(s.notebook_id).append(h('option', { value: s.id, selected: s.id === page.section_id }, s.name));
  }
  const target = await modal({
    title: 'Move page',
    body: [h('p', {}, `Move "${page.title || 'Untitled page'}" to:`), select],
    actions: [{ label: 'Cancel' }, { label: 'Move', primary: true, value: () => select.value }],
    onOpen: () => select.focus(),
  });
  if (target && target !== page.section_id) movePage(page.id, target);
}

function pageMenu(page, at) {
  const list = sortedPages(page.section_id);
  const index = list.indexOf(page);
  const custom = state.sort === 'custom';
  showMenu(at, [
    { label: 'New page below', icon: 'plus', onClick: () => addPage({ after: page.id, level: page.level }) },
    { label: 'New subpage', icon: 'indent', onClick: () => addPage({ after: page.id, level: Math.min(2, page.level + 1) }) },
    { label: 'New page from template', icon: 'copy', submenu: () => templateItems({ after: page.id, level: page.level }) },
    { separator: true },
    { label: 'Rename', icon: 'edit', onClick: () => renamePage(page) },
    custom && page.level < 2 ? { label: 'Make subpage', icon: 'indent', disabled: index <= 0, onClick: () => setPageLevel(page, page.level + 1) } : null,
    custom && page.level > 0 ? { label: 'Promote subpage', icon: 'outdent', onClick: () => setPageLevel(page, page.level - 1) } : null,
    { label: 'Move to…', icon: 'move', onClick: () => moveDialog(page) },
    { label: 'Copy link to page', icon: 'link', onClick: () => copyText(pageLink(page.id), 'Link copied') },
    { separator: true },
    { label: 'Delete page', icon: 'trash', danger: true, hint: 'Del', onClick: () => deletePage(page.id) },
  ]);
}

async function renamePage(page) {
  if (editor.page?.id === page.id) editor.focusTitle();
  else {
    pendingTitleFocus = page.id;
    await navigateToPage(page.id);
  }
}

async function reorderPage(id, targetId, after) {
  if (state.sort !== 'custom') {
    setSort('custom');
    toast('Switched to custom sorting so pages can be reordered.');
  }
  const ids = sortedPages(state.sectionId).map((p) => p.id).filter((x) => x !== id);
  ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, id);
  ids.forEach((pid, i) => { const p = findPage(pid); if (p) p.sort = i; });
  renderPages();
  await api.put('/reorder', { kind: 'pages', ids });
}

function setSort(value) {
  state.sort = value;
  store.set('pageSort', value);
  renderPages();
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    await promptDialog('Copy this link', { value: text, okLabel: 'Done' });
  }
}

// ================= nav pane wiring =================
function setupNav() {
  const secList = $('#sectionList');
  const pageList = $('#pageList');

  secList.addEventListener('click', (e) => {
    if (e.target.closest('.rename-input')) return;
    const li = e.target.closest('.sec-item');
    if (li && li.dataset.id !== state.sectionId) selectSection(li.dataset.id);
  });
  secList.addEventListener('dblclick', (e) => {
    const li = e.target.closest('.sec-item');
    if (li && !e.target.closest('.rename-input')) startRenameSection(li.dataset.id);
  });
  secList.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('.sec-item');
    if (!li) return;
    e.preventDefault();
    sectionMenu(findSection(li.dataset.id), { x: e.clientX, y: e.clientY });
  });
  // Keyboard on the lists (items are focusable; see rememberListFocus). Arrows move and open,
  // Home/End jump, Delete deletes, F2 renames, Enter moves on (sections → pages → page).
  const listKeys = (list, itemSel, { open, remove, rename, enter }) => (e) => {
    const li = e.target.closest(itemSel);
    if (!li || e.target.closest('.rename-input') || e.ctrlKey || e.metaKey || e.altKey) return;
    const items = [...list.querySelectorAll(itemSel)];
    const i = items.indexOf(li);
    const go = (j) => {
      const el = items[Math.max(0, Math.min(j, items.length - 1))];
      if (!el || el === li) return;
      el.focus();
      open(el.dataset.id);
    };
    const handled = {
      ArrowDown: () => go(i + 1), ArrowUp: () => go(i - 1), Home: () => go(0), End: () => go(items.length - 1),
      Delete: () => remove(li.dataset.id), F2: () => rename(li.dataset.id), Enter: () => enter(li.dataset.id),
    }[e.key];
    if (!handled) return;
    e.preventDefault();
    handled();
  };
  secList.addEventListener('keydown', listKeys(secList, '.sec-item', {
    open: (id) => { if (id !== state.sectionId) selectSection(id); },
    remove: (id) => deleteSection(findSection(id)),
    rename: (id) => startRenameSection(id),
    enter: () => $('#pageList .page-item.active, #pageList .page-item')?.focus(),
  }));
  pageList.addEventListener('keydown', listKeys(pageList, '.page-item', {
    open: (id) => navigateToPage(id),
    remove: (id) => deletePage(id),
    rename: (id) => renamePage(findPage(id)),
    enter: () => editor.focusTitle(),
  }));

  pageList.addEventListener('click', (e) => {
    const li = e.target.closest('.page-item');
    if (li) navigateToPage(li.dataset.id);
  });
  pageList.addEventListener('contextmenu', (e) => {
    const li = e.target.closest('.page-item');
    if (!li) return;
    e.preventDefault();
    pageMenu(findPage(li.dataset.id), { x: e.clientX, y: e.clientY });
  });

  $('#addSection').addEventListener('click', () => addSection());
  $('#addPage').addEventListener('click', () => addPage());
  $('#addPageMenu').addEventListener('click', (e) => openTemplateMenu(e.currentTarget.closest('.pane-foot')));
  $('#nbSwitch').addEventListener('click', openNotebookPicker);
  $('#sortBtn').addEventListener('click', (e) => {
    showMenu(e.currentTarget, [{ heading: 'Sort pages by' }, ...SORTS.map((s) => ({ label: s.label, checked: s.value === state.sort, onClick: () => setSort(s.value) }))]);
  });

  for (const btn of $$('.rail-btn')) btn.addEventListener('click', () => railClick(btn.dataset.pane));
  $('#navBack').addEventListener('click', () => history.back());
  $('#navFwd').addEventListener('click', () => history.forward());
  $('#userName').addEventListener('click', changeDisplayName);
  $('#emptyTrash').addEventListener('click', emptyTrash);

  // Drag and drop for sections and pages
  let drag = null;
  const clearMarks = () => $$('.drop-before, .drop-after, .drop-into').forEach((el) => el.classList.remove('drop-before', 'drop-after', 'drop-into'));
  const after = (e, li) => {
    const r = li.getBoundingClientRect();
    return e.clientY > r.top + r.height / 2;
  };
  for (const [list, kind] of [[secList, 'section'], [pageList, 'page']]) {
    list.addEventListener('dragstart', (e) => {
      const li = e.target.closest('[data-id]');
      if (!li) return;
      drag = { kind, id: li.dataset.id };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', li.dataset.id);
      li.classList.add('dragging');
    });
    list.addEventListener('dragend', () => {
      drag = null;
      clearMarks();
      $$('.dragging').forEach((el) => el.classList.remove('dragging'));
    });
  }
  pageList.addEventListener('dragover', (e) => {
    if (drag?.kind !== 'page') return;
    e.preventDefault();
    clearMarks();
    const li = e.target.closest('.page-item');
    if (li && li.dataset.id !== drag.id) li.classList.add(after(e, li) ? 'drop-after' : 'drop-before');
  });
  pageList.addEventListener('drop', (e) => {
    if (drag?.kind !== 'page') return;
    e.preventDefault();
    const li = e.target.closest('.page-item');
    clearMarks();
    if (li && li.dataset.id !== drag.id) reorderPage(drag.id, li.dataset.id, after(e, li));
  });
  secList.addEventListener('dragover', (e) => {
    const li = e.target.closest('.sec-item');
    if (!drag || !li) return;
    e.preventDefault();
    clearMarks();
    if (drag.kind === 'page') {
      if (li.dataset.id !== state.sectionId) li.classList.add('drop-into');
    } else if (li.dataset.id !== drag.id) {
      li.classList.add(after(e, li) ? 'drop-after' : 'drop-before');
    }
  });
  secList.addEventListener('drop', (e) => {
    const li = e.target.closest('.sec-item');
    if (!drag || !li) return;
    e.preventDefault();
    clearMarks();
    if (drag.kind === 'page') movePage(drag.id, li.dataset.id);
    else if (li.dataset.id !== drag.id) reorderSection(drag.id, li.dataset.id, after(e, li));
  });
}

// ================= side panel (notebooks / search / recent / trash) =================
function panelVisible() {
  return isMobile() ? app.classList.contains('drawer-open') : !app.classList.contains('panes-hidden');
}

function setPanelVisible(visible) {
  if (isMobile()) app.classList.toggle('drawer-open', visible);
  else {
    app.classList.toggle('panes-hidden', !visible);
    store.set('panesHidden', !visible);
  }
  updateRail();
}

function railClick(pane) {
  if (pane === state.pane && panelVisible()) {
    setPanelVisible(false);
    return;
  }
  showPane(pane);
  setPanelVisible(true);
}

function showPane(pane) {
  state.pane = pane;
  for (const v of $$('.view')) v.classList.toggle('active', v.dataset.view === pane);
  updateRail();
  if (pane === 'search') {
    const input = $('#searchInput');
    setTimeout(() => { input.focus(); input.select(); }, 0);
    runSearch();
  } else if (pane === 'recent') {
    loadRecent();
  } else if (pane === 'trash') {
    loadTrash();
  }
}

function updateRail() {
  const visible = panelVisible();
  for (const b of $$('.rail-btn')) b.classList.toggle('active', visible && b.dataset.pane === state.pane);
}

function markTerms(text, q) {
  let out = esc(text);
  const terms = q.split(/\s+/).filter(Boolean).map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (terms.length) out = out.replace(new RegExp(`(${terms.join('|')})`, 'gi'), '<mark>$1</mark>');
  return out;
}

function resultItem(r, { q = '', meta, actions, onOpen } = {}) {
  return h('li', { class: 'result', onclick: onOpen || (() => openResult(r.id, q)) },
    h('div', { class: 'result-title', html: markTerms(r.title || 'Untitled page', q) }),
    h('div', { class: 'result-crumb' },
      h('span', { class: 'dot', style: `--c:${r.section_color}` }),
      `${r.notebook_name} › ${r.section_name}${meta ? ` · ${meta}` : ''}`),
    r.snippet ? h('div', { class: 'result-snip', html: markTerms(r.snippet, q) }) : null,
    actions ? h('div', { class: 'result-actions' }, actions) : null);
}

async function openResult(id, q) {
  const ok = await navigateToPage(id);
  if (ok !== false && q) editor.highlight(q);
}

let searchTimer = 0;
let searchSeq = 0;
function setupSearch() {
  const input = $('#searchInput');
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 200);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#searchResults .result')?.click();
    }
  });
  for (const chip of $$('.chip[data-scope]')) {
    chip.addEventListener('click', () => {
      state.searchScope = chip.dataset.scope;
      store.set('searchScope', state.searchScope);
      updateScopeChips();
      runSearch();
    });
  }
  updateScopeChips();
}

function updateScopeChips() {
  for (const chip of $$('.chip[data-scope]')) chip.classList.toggle('on', chip.dataset.scope === state.searchScope);
}

async function runSearch() {
  const q = $('#searchInput').value.trim();
  const list = $('#searchResults');
  const seq = ++searchSeq;
  if (!q) {
    list.replaceChildren(h('li', { class: 'list-empty' }, 'Search page titles and text across your notebooks.'));
    return;
  }
  const params = new URLSearchParams({ q });
  if (state.searchScope === 'notebook' && state.notebook) params.set('notebook', state.notebook.id);
  try {
    const rows = await api.get(`/search?${params}`);
    if (seq !== searchSeq) return;
    list.replaceChildren(...(rows.length
      ? rows.map((r) => resultItem(r, { q }))
      : [h('li', { class: 'list-empty' }, `No pages match "${q}".`)]));
  } catch {
    if (seq === searchSeq) list.replaceChildren(h('li', { class: 'list-empty' }, 'Search failed.'));
  }
}

async function loadRecent() {
  const list = $('#recentList');
  try {
    const rows = await api.get('/recent');
    list.replaceChildren(...(rows.length
      ? rows.map((r) => resultItem(r, { meta: fmtRelative(r.updated_at) }))
      : [h('li', { class: 'list-empty' }, 'Nothing here yet.')]));
  } catch {
    list.replaceChildren(h('li', { class: 'list-empty' }, 'Could not load recent notes.'));
  }
}

async function loadTrash() {
  const list = $('#trashList');
  try {
    const rows = await api.get('/trash');
    $('#emptyTrash').disabled = !rows.length;
    list.replaceChildren(...(rows.length
      ? rows.map((r) => resultItem(r, {
        meta: `deleted ${fmtRelative(r.deleted_at).toLowerCase()}`,
        onOpen: () => {},
        actions: [
          h('button', { class: 'btn small', onclick: (e) => { e.stopPropagation(); restorePage(r.id); } }, 'Restore'),
          h('button', { class: 'btn small', onclick: (e) => { e.stopPropagation(); purgePage(r); } }, 'Delete forever'),
        ],
      }))
      : [h('li', { class: 'list-empty' }, 'No deleted pages.')]));
  } catch {
    list.replaceChildren(h('li', { class: 'list-empty' }, 'Could not load deleted pages.'));
  }
}

async function purgePage(r) {
  if (!(await confirmDialog('Delete forever?', `"${r.title || 'Untitled page'}" will be permanently deleted.`))) return;
  await api.del(`/pages/${r.id}?permanent=1`);
  loadTrash();
}

async function emptyTrash() {
  if (!(await confirmDialog('Empty deleted pages?', 'All deleted pages will be permanently removed.', { okLabel: 'Empty' }))) return;
  await api.del('/trash');
  loadTrash();
}

// ================= ribbon =================
function setTab(tab) {
  for (const t of $$('.rtab')) t.classList.toggle('active', t.dataset.tab === tab);
  for (const p of $$('.ribbon-panel')) p.classList.toggle('active', p.dataset.panel === tab);
  store.set('tab', tab);
}

function updateColorBars() {
  $('#hlBar').style.background = prefs.highlight;
  $('#fcBar').style.background = prefs.fontColor;
  $('#penBar').style.background = editor.pen.color === 'auto' ? 'var(--ink-auto)' : editor.pen.color;
  $('#inkHlBar').style.background = editor.highlighter.color;
}

function updateRibbonState() {
  const st = editor.formatState();
  const set = (cmd, on) => $$(`[data-cmd="${cmd}"]`).forEach((b) => b.classList.toggle('on', !!on));
  set('bold', st?.bold);
  set('italic', st?.italic);
  set('underline', st?.underline);
  set('bullets', st?.ul);
  set('numbering', st?.ol);
  set('todo', st?.tag === 'todo');
  set('painter', !!editor.painter);
  set('modeType', editor.mode === 'type');
  set('modePen', editor.mode === 'pen');
  set('modeHl', editor.mode === 'hl');
  set('modeEraser', editor.mode === 'eraser');
  set('togglePanes', !app.classList.contains('panes-hidden'));
  set('fullPage', app.classList.contains('full-page'));
  if (st) {
    if (document.activeElement !== $('#fontName')) $('#fontName').value = st.font;
    if (document.activeElement !== $('#fontSize')) $('#fontSize').value = st.size;
    $('#styleLabel').textContent = STYLES.find((s) => s.tag === st.block)?.label || 'Normal';
  }
}

function insertStamp(kind) {
  const now = new Date();
  const date = now.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  editor.insertText(kind === 'date' ? date : kind === 'time' ? time : `${date} ${time}`);
}

async function linkDialog() {
  if (!editor.page) return;
  const selected = editor.selectedText();
  const text = h('input', { class: 'input', value: selected, placeholder: 'Text to display' });
  const url = h('input', { class: 'input', placeholder: 'https://example.com', spellcheck: 'false' });
  const res = await modal({
    title: 'Insert link',
    body: [h('label', { class: 'field-label' }, 'Text to display'), text, h('label', { class: 'field-label' }, 'Address'), url],
    actions: [{ label: 'Cancel' }, { label: 'Insert', primary: true, value: () => ({ text: text.value.trim(), url: url.value.trim() }) }],
    onOpen: () => (selected ? url : text).focus(),
  });
  if (res?.url) editor.insertLink(res.url, res.text);
}

function zoomBy(delta) {
  setZoom(delta === 0 ? 1 : editor.zoom + delta);
}

function setZoom(z) {
  const zoom = editor.setZoom(z);
  $('#zoomLabel').textContent = `${Math.round(zoom * 100)}%`;
  store.set('zoom', zoom);
}

function toggleFullPage() {
  const on = app.classList.toggle('full-page');
  for (const b of $$('[data-cmd="fullPage"]')) setIcon(b, on ? 'shrink' : 'expand');
  updateRibbonState();
}

// ================= Theme tab =================
const QUICK_SCHEMES = ['classic-dark', 'classic-light', 'midnight', 'arctic', 'forest', 'nightshade', 'paper', 'ocean'];
let saveAppearanceTimer = 0;

function saveAppearance(appearance) {
  clearTimeout(saveAppearanceTimer);
  saveAppearanceTimer = setTimeout(() => {
    api.put('/settings', { appearance }).catch(() => toast("Couldn't save your theme settings. They apply in this browser only until the server is back."));
  }, 300);
}

function renderThemeTab() {
  const scheme = theme.activeScheme();
  const a = theme.getAppearance();
  $('#schemeName').textContent = a.followSystem ? `System (${scheme.name})` : scheme.name;
  $('#schemeDot').setAttribute('style', theme.schemeDotStyle(scheme));
  $('#lookName').textContent = `Look: ${theme.lookName()}`;
  $('#themeEditBtn').disabled = !scheme.custom;
  const quick = [...QUICK_SCHEMES.map(theme.findScheme), ...a.custom.slice(-3)].filter(Boolean);
  $('#schemeQuick').replaceChildren(...quick.map((s) => h('button', {
    class: `scheme-dot${!a.followSystem && s.id === a.scheme ? ' on' : ''}`, style: theme.schemeDotStyle(s),
    'data-scheme': s.id, title: s.name, 'aria-label': s.name, 'aria-pressed': String(!a.followSystem && s.id === a.scheme),
  })));
}
document.addEventListener('appearancechange', () => {
  if ($('#schemeName')) renderThemeTab();
});

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const commands = {
  undo: () => editor.exec('undo'),
  redo: () => editor.exec('redo'),
  async paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) editor.insertText(text);
    } catch {
      toast('Clipboard access was blocked. Use Ctrl+V to paste.');
    }
  },
  bold: () => editor.exec('bold'),
  italic: () => editor.exec('italic'),
  underline: () => editor.exec('underline'),
  highlight: () => editor.setHighlight(prefs.highlight),
  fontColor: () => editor.setColor(prefs.fontColor),
  painter: () => (editor.painter ? editor.cancelPainter() : editor.startPainter()),
  clearFormat: () => editor.clearFormatting(),
  bullets: () => editor.exec('insertUnorderedList'),
  numbering: () => editor.exec('insertOrderedList'),
  outdent: () => editor.exec('outdent'),
  indent: () => editor.exec('indent'),
  todo: () => editor.toggleTag('todo'),
  dictate: () => editor.toggleDictation(prefs.dictLang),
  picture: () => { if (editor.ensureCaret()) $('#pictureInput').click(); },
  file: () => { if (editor.ensureCaret()) $('#fileInput').click(); },
  link: linkDialog,
  date: () => insertStamp('date'),
  time: () => insertStamp('time'),
  datetime: () => insertStamp('datetime'),
  hr: () => { if (editor.ensureCaret()) editor.exec('insertHorizontalRule'); },
  newContainer: () => {
    if (editor.structured) return toast('Note containers are only available on freeform pages.');
    const bottom = editor.blocks().reduce((m, b) => Math.max(m, b.offsetTop + b.offsetHeight), 76);
    editor.focusBlock(editor.addBlock({ x: 60, y: bottom + 24 }));
  },
  modeType: () => editor.setMode('type'),
  modeEraser: () => editor.setMode('eraser'),
  modePen: () => editor.setMode('pen'),
  modeHl: () => editor.setMode('hl'),
  async clearInk() {
    if (!editor.strokes.length) return toast('There is no ink on this page.');
    if (await confirmDialog('Clear ink?', 'Remove every pen and highlighter stroke from this page?', { okLabel: 'Clear ink' })) editor.clearInk();
  },
  togglePanes: () => {
    if (!panelVisible()) showPane(state.pane);
    setPanelVisible(!panelVisible());
  },
  fullPage: toggleFullPage,
  zoomIn: () => zoomBy(0.1),
  zoomOut: () => zoomBy(-0.1),
  zoomReset: () => zoomBy(0),
  print: async () => { await editor.flush(); window.print(); },
  exportPage: () => {
    const html = editor.exportHtml();
    if (html) downloadFile(`${(editor.titleText() || 'Untitled page').replace(/[\\/:*?"<>|]+/g, '_')}.html`, html, 'text/html');
  },
  share: () => copyText(pageLink(editor.page.id), 'Link to this page copied'),
  shortcuts: showShortcuts,
  about: showAbout,
  themeNew: () => theme.openThemeEditor(),
  themeEdit: () => {
    const s = theme.activeScheme();
    if (s.custom) theme.openThemeEditor({ edit: s });
  },
  themeImport: () => theme.importThemeDialog(),
  themeReset: async () => {
    if (await confirmDialog('Reset appearance?', 'Go back to Classic Dark and the Classic look. Your own themes are kept.', { okLabel: 'Reset', danger: false })) {
      theme.resetAppearance();
    }
  },
};

const drops = {
  font: (a) => showMenu(a, FONTS.map((f) => ({ label: f, labelStyle: { fontFamily: `'${f}'` }, checked: $('#fontName').value === f, onClick: () => editor.setFont(f) }))),
  size: (a) => showMenu(a, SIZES.map((s) => ({ label: String(s), checked: Number($('#fontSize').value) === s, onClick: () => editor.setFontSize(s) }))),
  highlight: (a) => showMenu(a, [
    { heading: 'Highlight color' },
    { swatches: HIGHLIGHTS, value: prefs.highlight, none: true, onPick: (c) => { if (c) { prefs.highlight = c; savePrefs(); updateColorBars(); } editor.setHighlight(c); } },
  ]),
  fontColor: (a) => showMenu(a, [
    { heading: 'Font color' },
    { swatches: FONT_COLORS, value: prefs.fontColor, onPick: (c) => { prefs.fontColor = c; savePrefs(); updateColorBars(); editor.setColor(c); } },
  ]),
  moreFormat: (a) => showMenu(a, [
    { label: 'Strikethrough', icon: 'strike', onClick: () => editor.exec('strikeThrough') },
    { label: 'Subscript', icon: 'subscript', onClick: () => editor.exec('subscript') },
    { label: 'Superscript', icon: 'superscript', onClick: () => editor.exec('superscript') },
    { separator: true },
    { label: 'Code block', icon: 'code', onClick: () => editor.setBlockStyle('pre') },
  ]),
  align: (a) => showMenu(a, [
    { label: 'Align left', icon: 'alignLeft', onClick: () => editor.exec('justifyLeft') },
    { label: 'Center', icon: 'alignCenter', onClick: () => editor.exec('justifyCenter') },
    { label: 'Align right', icon: 'alignRight', onClick: () => editor.exec('justifyRight') },
  ]),
  tags: (a) => showMenu(a, [
    { heading: 'Tags' },
    ...TAGS.map((t) => ({ label: t.label, icon: t.icon, iconColor: t.color, hint: t.hint, onClick: () => editor.toggleTag(t.tag) })),
    { separator: true },
    { label: 'Remove tag', icon: 'close', onClick: () => editor.toggleTag(null) },
  ]),
  styles: (a) => {
    const current = $('#styleLabel').textContent;
    showMenu(a, STYLES.map((s) => ({ label: s.label, labelStyle: s.style, checked: s.label === current, onClick: () => editor.setBlockStyle(s.tag) })));
  },
  dictate: (a) => showMenu(a, [
    { heading: 'Dictation language' },
    ...LANGS.map(([code, label]) => ({ label, checked: prefs.dictLang === code, onClick: () => { prefs.dictLang = code; savePrefs(); } })),
  ]),
  templates: (a) => {
    if (!editor.page) return toast('Open a page first.');
    showMenu(a, [
      { heading: 'Insert into this page' },
      ...INSERT_TEMPLATES.map((t) => ({ label: t.name, icon: t.icon, hint: t.hint, onClick: () => insertTemplate(t.id) })),
    ]);
  },
  table: (a) => {
    const cells = h('div', { class: 'table-grid-cells' });
    const label = h('div', { class: 'table-grid-label' }, 'Insert table');
    for (let r = 1; r <= 6; r++) for (let c = 1; c <= 8; c++) cells.append(h('div', { dataset: { r, c } }));
    cells.addEventListener('mouseover', (e) => {
      const { r, c } = e.target.dataset;
      if (!r) return;
      for (const d of cells.children) d.classList.toggle('on', +d.dataset.r <= +r && +d.dataset.c <= +c);
      label.textContent = `${c} × ${r} table`;
    });
    cells.addEventListener('click', (e) => {
      const { r, c } = e.target.dataset;
      if (!r) return;
      closeMenus();
      editor.insertTable(+r, +c);
    });
    showMenu(a, [
      { element: h('div', { class: 'table-grid' }, cells, label) },
      { separator: true },
      { label: 'Insert row above', onClick: () => editor.tableOp('rowAbove') },
      { label: 'Insert row below', onClick: () => editor.tableOp('rowBelow') },
      { label: 'Insert column left', onClick: () => editor.tableOp('colLeft') },
      { label: 'Insert column right', onClick: () => editor.tableOp('colRight') },
      { separator: true },
      { label: 'Delete row', onClick: () => editor.tableOp('delRow') },
      { label: 'Delete column', onClick: () => editor.tableOp('delCol') },
      { label: 'Delete table', icon: 'trash', danger: true, onClick: () => editor.tableOp('delTable') },
    ]);
  },
  pen: (a) => inkToolMenu(a, 'pen', PEN_COLORS, [1, 2, 4, 7]),
  inkHl: (a) => inkToolMenu(a, 'hl', INK_HL_COLORS, [8, 14, 20, 28]),
  schemes: (a) => theme.openSchemeGallery(a),
  looks: (a) => theme.openLookMenu(a),
  'look-density': (a) => theme.openLookOptionMenu(a, 'density'),
  'look-corners': (a) => theme.openLookOptionMenu(a, 'corners'),
  'look-font': (a) => theme.openLookOptionMenu(a, 'font'),
  'look-page': (a) => theme.openLookOptionMenu(a, 'page'),
  'look-tabs': (a) => theme.openLookOptionMenu(a, 'tabs'),
  lines: (a) => showMenu(a, LINES.map((l) => ({ label: l.label, checked: editor.lines === l.value, disabled: !editor.page, onClick: () => editor.setLines(l.value) }))),
  appMenu: (a) => showMenu(a, [
    { label: 'Export backup (.json)', icon: 'download', onClick: async () => { await editor.flush(); location.href = '/api/export'; } },
    { label: 'Import backup…', icon: 'upload', onClick: () => $('#importInput').click() },
    { separator: true },
    { label: 'Deleted pages', icon: 'trash', onClick: () => { showPane('trash'); setPanelVisible(true); } },
    { label: 'Change display name', icon: 'user', onClick: changeDisplayName },
    { separator: true },
    { label: 'Keyboard shortcuts', icon: 'keyboard', onClick: showShortcuts },
    { label: 'About', icon: 'info', onClick: showAbout },
  ]),
};

function inkToolMenu(anchor, mode, colors, widths) {
  const tool = mode === 'pen' ? editor.pen : editor.highlighter;
  const toSwatch = (c) => (c === 'auto' ? 'var(--ink-auto)' : c);
  const row = h('div', { class: 'width-row' });
  for (const w of widths) {
    row.append(h('button', {
      class: 'width-opt' + (tool.width === w ? ' on' : ''), title: `${w}px`,
      style: `color:${toSwatch(tool.color)}`,
      onclick: () => { tool.width = w; savePrefs(); closeMenus(); editor.setMode(mode); },
    }, h('span', { style: `height:${Math.min(w, 14)}px;${mode === 'hl' ? 'opacity:.5' : ''}` })));
  }
  showMenu(anchor, [
    { heading: mode === 'pen' ? 'Pen color' : 'Highlighter color' },
    {
      swatches: colors, value: toSwatch(tool.color),
      onPick: (c) => { tool.color = c === 'var(--ink-auto)' ? 'auto' : c; savePrefs(); updateColorBars(); editor.setMode(mode); },
    },
    { heading: 'Thickness' },
    { element: row },
  ]);
}

function setupRibbon() {
  const ribbon = $('#ribbon');
  ribbon.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) e.preventDefault(); // keep the caret in the page
  });
  ribbon.addEventListener('click', (e) => {
    const tab = e.target.closest('.rtab');
    if (tab) return setTab(tab.dataset.tab);
    const swatch = e.target.closest('[data-scheme]');
    if (swatch) return theme.setScheme(swatch.dataset.scheme);
    const cmdBtn = e.target.closest('[data-cmd]');
    if (cmdBtn) {
      const name = cmdBtn.dataset.cmd;
      if (PAGE_CMDS.has(name) && !editor.page) return toast('Open a page first.');
      Promise.resolve(commands[name]?.()).finally(updateRibbonState);
      return;
    }
    const drop = e.target.closest('[data-drop]');
    if (drop) drops[drop.dataset.drop]?.(drop.closest('.combo, .split') || drop);
  });

  const fontName = $('#fontName');
  const fontSize = $('#fontSize');
  fontName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (fontName.value.trim()) editor.setFont(fontName.value.trim());
    } else if (e.key === 'Escape') {
      editor.restoreSelection();
    }
  });
  fontSize.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const pt = parseFloat(fontSize.value);
      if (pt >= 1 && pt <= 400) editor.setFontSize(Math.round(pt * 2) / 2);
      else toast('Enter a size between 1 and 400.');
    } else if (e.key === 'Escape') {
      editor.restoreSelection();
    }
  });
  for (const input of [fontName, fontSize]) {
    input.addEventListener('focus', () => input.select());
    input.addEventListener('blur', () => setTimeout(updateRibbonState, 0));
  }

  $('#pictureInput').addEventListener('change', (e) => {
    editor.insertFiles([...e.target.files]);
    e.target.value = '';
  });
  $('#fileInput').addEventListener('change', (e) => {
    editor.insertFiles([...e.target.files]);
    e.target.value = '';
  });
  $('#importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) importBackup(file);
  });
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('That file is not a valid backup.');
    return;
  }
  try {
    const r = await api.post('/import', data);
    state.notebooks = await api.get('/notebooks');
    toast(`Imported ${r.notebooks} notebook${r.notebooks === 1 ? '' : 's'} and ${r.pages} page${r.pages === 1 ? '' : 's'}.`);
    if (!state.notebook && state.notebooks.length) openNotebook(state.notebooks[0].id);
  } catch (err) {
    toast(`Import failed: ${err.message}`);
  }
}

async function changeDisplayName() {
  const name = await promptDialog('Display name', { label: 'Shown in the top-right corner', value: state.settings.displayName || '', okLabel: 'Save' });
  if (name == null) return;
  state.settings.displayName = name;
  renderUser();
  await api.put('/settings', { displayName: name });
}

// Every shortcut the app handles. tests/shortcuts.test.mjs presses each of these.
const SHORTCUTS = [
  ['Anywhere', [
    ['New page', 'Ctrl+Alt+N'], ['Search all notes', 'Ctrl+E'], ['Save now', 'Ctrl+S'],
    ['Leave draw mode / format painter', 'Esc'],
  ]],
  ['Typing on a page', [
    ['Bold / Italic / Underline', 'Ctrl+B / I / U'], ['Highlight', 'Ctrl+Alt+H'], ['Insert link', 'Ctrl+K'],
    ['Bullets / Numbering', 'Ctrl+. / Ctrl+/'], ['Indent / Outdent', 'Tab / Shift+Tab'],
    ['To Do / Important / Question tag', 'Ctrl+1 / 2 / 3'], ['Heading 1–6', 'Ctrl+Alt+1…6'], ['Normal text', 'Ctrl+Alt+0'],
    ['Insert date / time / both', 'Alt+Shift+D / T / F'], ['Undo / Redo', 'Ctrl+Z / Ctrl+Y'],
    ['Select the note container', 'Esc'], ['Delete the selected container', 'Delete'],
    ['Move the selected container (Shift = 10 px)', '← / ↑ / → / ↓'],
  ]],
  ['Section and page lists', [
    ['Move up / down (and open)', '↑ / ↓'], ['First / last', 'Home / End'], ['Delete the section or page', 'Delete'],
    ['Rename', 'F2'], ['Go into pages / the page title', 'Enter'],
  ]],
  ['To-do planner', [
    ['Edit the focused task', 'Enter / F2'], ['Delete the focused task', 'Delete'],
    ['Move the task up / down', 'Alt+↑ / Alt+↓'], ['Move the task to the previous / next group', 'Alt+← / Alt+→'],
    ['Add with a tag and a date', '#tag / @date'],
  ]],
  ['Cards', [
    ['Open the focused card', 'Enter'], ['Delete the focused card', 'Delete'], ['Move focus between cards', '↑ / ↓ / ← / →'],
    ['Move the card to another list', 'Alt+← / Alt+→'], ['Move the card up / down', 'Alt+↑ / Alt+↓'],
    ['Move a list left / right (on its title)', 'Alt+← / Alt+→'], ['Add with labels and a date', '#label / @date'],
    ['Add the typed card / list', 'Enter'], ['Close the add box', 'Esc'],
  ]],
];

function showShortcuts() {
  const keys = (k) => k.split(' / ').flatMap((part, i) => (i ? [' / ', h('kbd', {}, part)] : [h('kbd', {}, part)]));
  modal({
    title: 'Keyboard shortcuts',
    wide: true,
    body: h('table', { class: 'kbd-table' }, h('tbody', {}, SHORTCUTS.map(([group, rows]) => [
      h('tr', { class: 'kbd-group' }, h('th', { colspan: '2' }, group)),
      rows.map(([action, k]) => h('tr', {}, h('td', {}, action), h('td', {}, keys(k)))),
    ]))),
    actions: [{ label: 'Close', primary: true }],
  });
}

function showAbout() {
  modal({
    title: 'About OneNote Clone',
    body: [
      h('p', {}, 'A self-hosted notes app inspired by OneNote: notebooks, color-coded sections, pages and subpages, a freeform canvas, tags, tables, pictures, attachments, ink and full-text search.'),
      h('p', {}, 'Everything is stored in a SQLite database in the server\'s data/ folder and saved automatically as you type. Uploaded files live in data/uploads/.'),
      h('p', {}, 'Tip: click anywhere on a page to start typing in a new note container.'),
    ],
    actions: [{ label: 'Close', primary: true }],
  });
}

// ================= keyboard shortcuts =================
function setupShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (document.querySelector('.modal-overlay')) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    const inContent = !!e.target.closest?.('.nb-content');
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;

    if (mod && !e.altKey && !e.shiftKey && k === 's') { e.preventDefault(); editor.flush(); return; }
    if (mod && !e.altKey && !e.shiftKey && k === 'e') { e.preventDefault(); showPane('search'); setPanelVisible(true); return; }
    if (mod && e.altKey && k === 'n') { e.preventDefault(); addPage(); return; }
    if (e.key === 'Escape') {
      if (editor.mode !== 'type') { editor.setMode('type'); return; }
      if (editor.painter) { editor.cancelPainter(); return; }
      if (app.classList.contains('full-page') && !inField) { toggleFullPage(); return; }
    }
    if (!inContent) return;

    const run = (fn) => { e.preventDefault(); fn(); updateRibbonState(); };
    if (mod && !e.altKey && !e.shiftKey && e.code === 'Digit1') return run(() => editor.toggleTag('todo'));
    if (mod && !e.altKey && !e.shiftKey && e.code === 'Digit2') return run(() => editor.toggleTag('important'));
    if (mod && !e.altKey && !e.shiftKey && e.code === 'Digit3') return run(() => editor.toggleTag('question'));
    if (mod && e.altKey && /^Digit[1-6]$/.test(e.code)) return run(() => editor.setBlockStyle(`h${e.code.slice(-1)}`));
    if (mod && e.altKey && e.code === 'Digit0') return run(() => editor.setBlockStyle('div'));
    if (mod && e.altKey && k === 'h') return run(() => editor.setHighlight(prefs.highlight));
    if (mod && !e.altKey && e.key === '.') return run(() => editor.exec('insertUnorderedList'));
    if (mod && !e.altKey && e.key === '/') return run(() => editor.exec('insertOrderedList'));
    if (mod && !e.altKey && k === 'k') return run(linkDialog);
    if (e.altKey && e.shiftKey && !mod && k === 'd') return run(() => insertStamp('date'));
    if (e.altKey && e.shiftKey && !mod && k === 't') return run(() => insertStamp('time'));
    if (e.altKey && e.shiftKey && !mod && k === 'f') return run(() => insertStamp('datetime'));
  });
}

// ================= editor events =================
function setupEditorEvents() {
  const statusEl = $('#saveStatus');
  const syncIcon = $('#syncIcon');
  let lastStatus = '';
  let offlineNotified = false; // one toast per outage, not one per retry
  editor.addEventListener('status', (e) => {
    const s = e.detail;
    if (s === lastStatus) return;
    lastStatus = s;
    if (s === 'saved') offlineNotified = false;
    const map = {
      saved: ['All changes saved', 'cloud'],
      dirty: ['Saving…', 'cloudSync'],
      saving: ['Saving…', 'cloudSync'],
      error: ["Couldn't save — retrying", 'cloudOff'],
    };
    const [text, icon] = map[s] || map.saved;
    statusEl.textContent = editor.page ? text : '';
    statusEl.classList.toggle('error', s === 'error');
    syncIcon.title = text;
    setIcon(syncIcon, icon);
    if (s === 'error' && !offlineNotified) {
      offlineNotified = true;
      toast("Couldn't reach the server. Your changes will be retried.");
    }
  });
  editor.addEventListener('saved', (e) => {
    const res = e.detail;
    const p = findPage(res.id);
    if (!p) return;
    Object.assign(p, { title: res.title, updated_at: res.updated_at });
    if (state.sort === 'modified' || state.sort === 'title') renderPages();
  });
  editor.addEventListener('title', (e) => {
    const p = findPage(editor.page.id);
    if (p) p.title = e.detail;
    const li = $(`#pageList [data-id="${editor.page.id}"]`);
    if (li) {
      li.querySelector('.page-name').textContent = e.detail || 'Untitled page';
      li.classList.toggle('untitled', !e.detail);
      li.title = e.detail || 'Untitled page';
    }
    updateDocTitle();
  });
  editor.addEventListener('selection', updateRibbonState);
  editor.addEventListener('mode', updateRibbonState);
  editor.addEventListener('painter', updateRibbonState);
  editor.addEventListener('dictation', (e) => $('#dictateBtn').classList.toggle('on', e.detail));

  // Never lose edits when the tab is closed or hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && editor.dirty) editor.save({ keepalive: true });
  });
  addEventListener('beforeunload', (e) => {
    if (!editor.dirty) return;
    editor.save({ keepalive: true });
    if (lastStatus === 'error') e.preventDefault();
  });
  addEventListener('resize', () => {
    if (!isMobile()) app.classList.remove('drawer-open');
    updateRail();
  });
}

// ================= boot =================
async function init() {
  hydrateIcons();
  setTab(store.get('tab', 'home'));
  if (store.get('panesHidden', false) && !isMobile()) app.classList.add('panes-hidden');
  setZoom(store.get('zoom', 1));
  updateColorBars();
  setupRibbon();
  setupNav();
  setupSearch();
  setupShortcuts();
  setupEditorEvents();
  showPane('notebooks');
  if (isMobile()) setPanelVisible(true);

  try {
    [state.notebooks, state.settings] = await Promise.all([api.get('/notebooks'), api.get('/settings')]);
    theme.initAppearance({ settings: state.settings, save: saveAppearance });
  } catch {
    theme.initAppearance({ settings: {}, save: saveAppearance });
    editor.showEmpty(h('h3', {}, "Can't reach the server"), h('p', {}, 'Make sure it is running (npm start), then reload this page.'));
    return;
  }
  renderUser();

  const fromHash = location.hash.match(/^#\/page\/([\w-]+)/)?.[1];
  if (fromHash && (await openPage(fromHash))) return;
  const lastPage = store.get('lastPage', null);
  if (lastPage && (await navigateToPage(lastPage, { replace: true, quiet: true }))) return;
  if (!state.notebooks.length) return showNoNotebooks();
  const lastNb = store.get('lastNotebook', null);
  await openNotebook(state.notebooks.find((n) => n.id === lastNb)?.id || state.notebooks[0].id);
}

init();
