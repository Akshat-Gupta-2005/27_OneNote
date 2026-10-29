// Appearance: color schemes (built-in + user-made) and "looks" (density, corners, font, page
// style, section tabs). A scheme is 8 seed colors; every CSS token is derived from them, except
// the two Classic schemes, which keep the hand-tuned tokens in app.css.
//
// Source of truth: settings.appearance on the server. A resolved copy is cached in localStorage
// ('oc.appearance') so the inline script in index.html can apply it before first paint.
import { h, showMenu, showPopover, closeMenus, modal, promptDialog, confirmDialog, toast } from './ui.js';
import { svg } from './icons.js';

// ---------- color math ----------
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export function parseHex(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (rgb) => `#${rgb.map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
export function mix(a, b, t) {
  const A = parseHex(a);
  const B = parseHex(b);
  return toHex(A.map((v, i) => v + (B[i] - v) * t));
}
const rgba = (hex, a) => { const [r, g, b] = parseHex(hex); return `rgba(${r}, ${g}, ${b}, ${a})`; };
export function luminance(hex) {
  const c = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG contrast ratio, 1–21. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
/** Nudge fg toward white (dark bg) or black (light bg) until it reaches `min` contrast. */
export function ensureContrast(fg, bg, min) {
  const target = luminance(bg) < 0.4 ? '#ffffff' : '#000000';
  let c = fg;
  for (let i = 0; i < 24 && contrast(c, bg) < min; i++) c = mix(c, target, 0.12);
  return c;
}
const onColor = (bg) => (contrast('#ffffff', bg) >= contrast('#111111', bg) ? '#ffffff' : '#111111');

// ---------- schemes ----------
export const SEEDS = [
  ['accent', 'Accent', 'Selection, buttons, active tab'],
  ['canvas', 'Page', 'Where you write'],
  ['panel', 'Panels', 'Sections and pages lists'],
  ['chrome', 'Title bar & ribbon', 'Top of the window'],
  ['text', 'Text', 'Body text everywhere'],
  ['heading', 'Headings', 'Heading 1–6 on pages'],
  ['link', 'Links', 'Links on pages'],
  ['todo', 'Checklists', 'To-do planner accent'],
];

const S = (accent, canvas, panel, chrome, text, heading, link, todo) => ({ accent, canvas, panel, chrome, text, heading, link, todo });

export const SCHEMES = [
  // css: true → keep the hand-tuned tokens in app.css; seeds are only for previews and "start from".
  { id: 'classic-dark', name: 'Classic Dark', base: 'dark', css: true, seeds: S('#a98ae0', '#1e1e1e', '#262626', '#1f1f1f', '#e8e8e8', '#8ab4f8', '#8ab4f8', '#4fbfb0') },
  { id: 'classic-light', name: 'Classic Light', base: 'light', css: true, seeds: S('#7719aa', '#ffffff', '#f3f3f3', '#f3f3f3', '#222222', '#2e75b5', '#0b62c4', '#0d8a7c') },
  { id: 'midnight', name: 'Midnight', base: 'dark', seeds: S('#7aa2f7', '#1a1b26', '#16161e', '#13131a', '#c0caf5', '#7dcfff', '#7aa2f7', '#9ece6a') },
  { id: 'arctic', name: 'Arctic', base: 'dark', seeds: S('#88c0d0', '#2e3440', '#3b4252', '#2b303b', '#e5e9f0', '#8fbcbb', '#81a1c1', '#a3be8c') },
  { id: 'forest', name: 'Forest', base: 'dark', seeds: S('#7fb069', '#1b2420', '#1f2b25', '#17201b', '#e2ead9', '#a8d08d', '#8fc1e3', '#7fb069') },
  { id: 'nightshade', name: 'Nightshade', base: 'dark', seeds: S('#bd93f9', '#282a36', '#21222c', '#1d1e26', '#f8f8f2', '#ff79c6', '#8be9fd', '#50fa7b') },
  { id: 'espresso', name: 'Espresso', base: 'dark', seeds: S('#e0a96d', '#24201c', '#2b2520', '#1f1b17', '#ece0d1', '#e8b77a', '#9fc5e8', '#a3c48f') },
  { id: 'paper-dark', name: 'Paper Dark', base: 'dark', seeds: S('#cf8f5e', '#2a2520', '#312b25', '#221e1a', '#ebe0cd', '#dba574', '#8fb9db', '#93bb7a') },
  { id: 'solar-dark', name: 'Solar Dark', base: 'dark', seeds: S('#268bd2', '#002b36', '#073642', '#00222b', '#c5d1d1', '#b58900', '#2aa198', '#859900') },
  { id: 'hc-dark', name: 'High Contrast Dark', base: 'dark', seeds: S('#ffd400', '#000000', '#000000', '#000000', '#ffffff', '#00e5ff', '#82b1ff', '#00e676') },
  { id: 'solar-light', name: 'Solar Light', base: 'light', seeds: S('#268bd2', '#fdf6e3', '#eee8d5', '#e8e1cb', '#4a5a60', '#cb4b16', '#1f6fb0', '#6c7a00') },
  { id: 'paper', name: 'Paper', base: 'light', seeds: S('#9c5b2e', '#fbf6ec', '#f1e9da', '#ebe1cf', '#3b3228', '#7a4a24', '#2f6690', '#4f7942') },
  { id: 'rose', name: 'Rose', base: 'light', seeds: S('#c2185b', '#fffafb', '#fbeef1', '#f6e3e8', '#3a2a30', '#ad1457', '#6a1b9a', '#2e7d32') },
  { id: 'ocean', name: 'Ocean', base: 'light', seeds: S('#1565c0', '#f7fbff', '#eaf2fb', '#e1ecf8', '#1d2b3a', '#0d47a1', '#1565c0', '#00897b') },
  { id: 'hc-light', name: 'High Contrast Light', base: 'light', seeds: S('#0000c8', '#ffffff', '#ffffff', '#ffffff', '#000000', '#000080', '#0000ee', '#006400') },
];

/** Every CSS token, derived from a scheme's seeds. */
export function deriveTokens({ base, seeds: s }) {
  const dark = base === 'dark';
  return {
    titlebar: s.chrome,
    ribbon: s.chrome,
    rail: mix(s.chrome, s.panel, 0.55),
    sections: s.panel,
    pages: mix(s.panel, s.text, 0.035),
    canvas: s.canvas,
    'menu-bg': dark ? mix(s.panel, s.text, 0.06) : mix(s.canvas, '#ffffff', 0.6),
    'input-bg': mix(s.panel, s.canvas, 0.5),
    hover: mix(s.panel, s.text, 0.08),
    selected: mix(s.panel, s.text, 0.14),
    active: mix(s.panel, s.text, 0.2),
    border: mix(s.panel, s.text, 0.1),
    'border-strong': mix(s.panel, s.text, 0.2),
    text: s.text,
    'text-dim': mix(s.text, s.canvas, 0.32),
    'text-faint': mix(s.text, s.canvas, 0.55),
    accent: s.accent,
    'accent-text': ensureContrast(s.accent, s.panel, 4.5),
    'accent-strong': s.accent,
    'on-accent': onColor(s.accent),
    link: ensureContrast(s.link, s.canvas, 4.5),
    'title-line': mix(s.canvas, s.text, 0.3),
    'nb-border': mix(s.canvas, s.text, 0.25),
    'nb-handle': mix(s.canvas, s.text, 0.09),
    'table-border': mix(s.canvas, s.text, 0.38),
    rule: rgba(s.accent, 0.22),
    'code-bg': mix(s.canvas, s.text, 0.06),
    'ink-auto': s.text,
    surround: dark ? mix(s.canvas, '#000000', 0.35) : mix(s.canvas, '#000000', 0.07),
    h1: ensureContrast(s.heading, s.canvas, 3),
    h2: ensureContrast(s.heading, s.canvas, 3),
    h3: ensureContrast(mix(s.heading, s.text, 0.35), s.canvas, 3),
    h4: ensureContrast(mix(s.heading, s.text, 0.2), s.canvas, 3),
    h5: ensureContrast(s.heading, s.canvas, 3),
    h6: ensureContrast(mix(s.heading, s.text, 0.35), s.canvas, 3),
    todo: s.todo,
    'todo-ink': onColor(s.todo),
    'todo-soft': rgba(s.todo, dark ? 0.16 : 0.12),
  };
}
const TOKEN_KEYS = Object.keys(deriveTokens(SCHEMES[0]));

/** Contrast checks shown in the editor (and asserted for built-ins in tests). */
export function contrastReport({ seeds: s }) {
  return [
    ['Text on page', contrast(s.text, s.canvas), 4.5],
    ['Text on panels', contrast(s.text, s.panel), 4.5],
    ['Text on title bar', contrast(s.text, s.chrome), 4.5],
    ['Accent vs page', contrast(s.accent, s.canvas), 3],
    ['Checklist vs page', contrast(s.todo, s.canvas), 3],
  ];
}

// ---------- looks ----------
export const LOOK_OPTIONS = {
  density: { label: 'Density', icon: 'rows', options: [['compact', 'Compact'], ['comfortable', 'Comfortable'], ['spacious', 'Spacious']] },
  corners: { label: 'Corners', icon: 'corner', options: [['square', 'Square'], ['rounded', 'Rounded'], ['round', 'Round']] },
  font: {
    label: 'Font', icon: 'type',
    options: [
      ['segoe', 'Segoe UI', "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"],
      ['system', 'System', "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif"],
      ['trebuchet', 'Trebuchet', "'Trebuchet MS', 'Segoe UI', sans-serif"],
      ['verdana', 'Verdana', "Verdana, 'Segoe UI', sans-serif"],
      ['georgia', 'Georgia (serif)', "Georgia, 'Times New Roman', serif"],
      ['mono', 'Monospace', "'Cascadia Mono', Consolas, 'JetBrains Mono', monospace"],
    ],
  },
  page: { label: 'Page', icon: 'pageSheet', options: [['flat', 'Flat'], ['paper', 'Paper sheet']] },
  tabs: { label: 'Section tabs', icon: 'bookmark', options: [['bar', 'Bar'], ['dot', 'Dot'], ['filled', 'Filled rows']] },
};

export const LOOKS = [
  { id: 'classic', name: 'Classic', hint: 'The OneNote look', values: { density: 'comfortable', corners: 'rounded', font: 'segoe', page: 'flat', tabs: 'bar' } },
  { id: 'modern', name: 'Modern', hint: 'Roomy, round, paper page', values: { density: 'spacious', corners: 'round', font: 'system', page: 'paper', tabs: 'dot' } },
  { id: 'compact', name: 'Compact', hint: 'More on screen', values: { density: 'compact', corners: 'square', font: 'segoe', page: 'flat', tabs: 'bar' } },
  { id: 'cozy', name: 'Cozy', hint: 'Soft, filled section rows', values: { density: 'spacious', corners: 'round', font: 'trebuchet', page: 'paper', tabs: 'filled' } },
];

// ---------- state ----------
const DEFAULT = { scheme: 'classic-dark', followSystem: false, look: { ...LOOKS[0].values }, custom: [] };
const darkMedia = matchMedia('(prefers-color-scheme: dark)');
let current = structuredClone(DEFAULT);
let persist = null;
let previewing = false;

const isHex = (v) => !!parseHex(v);
function cleanTheme(t) {
  if (!t || typeof t !== 'object') return null;
  const seeds = {};
  for (const [k] of SEEDS) {
    if (!isHex(t.seeds?.[k])) return null;
    seeds[k] = `#${t.seeds[k].replace('#', '').toLowerCase()}`;
  }
  return {
    id: typeof t.id === 'string' && t.id.startsWith('custom-') ? t.id : `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: String(t.name || 'My theme').trim().slice(0, 40) || 'My theme',
    base: t.base === 'light' ? 'light' : 'dark',
    seeds,
    custom: true,
  };
}

export function normalizeAppearance(raw) {
  const a = structuredClone(DEFAULT);
  if (!raw || typeof raw !== 'object') return a;
  a.custom = (Array.isArray(raw.custom) ? raw.custom : []).map(cleanTheme).filter(Boolean);
  a.followSystem = !!raw.followSystem;
  a.scheme = allSchemes(a).some((s) => s.id === raw.scheme) ? raw.scheme : DEFAULT.scheme;
  for (const key of Object.keys(LOOK_OPTIONS)) {
    const v = raw.look?.[key];
    if (LOOK_OPTIONS[key].options.some(([id]) => id === v)) a.look[key] = v;
  }
  return a;
}

/** Older builds stored only 'oc.theme' = 'dark' | 'light' | 'system'. */
function fromLegacy() {
  try {
    const old = JSON.parse(localStorage.getItem('oc.theme') || 'null');
    if (old === 'light') return { scheme: 'classic-light' };
    if (old === 'system') return { followSystem: true };
  } catch { /* ignore */ }
  return null;
}

export function allSchemes(a = current) {
  return [...SCHEMES, ...a.custom];
}
export const findScheme = (id) => allSchemes().find((s) => s.id === id);

export function activeScheme() {
  if (current.followSystem) return findScheme(darkMedia.matches ? 'classic-dark' : 'classic-light');
  return findScheme(current.scheme) || SCHEMES[0];
}

export function getAppearance() {
  return current;
}

export function lookName() {
  const match = LOOKS.find((l) => Object.entries(l.values).every(([k, v]) => current.look[k] === v));
  return match ? match.name : 'Custom';
}

// ---------- applying ----------
function applyScheme(scheme) {
  const root = document.documentElement;
  root.dataset.theme = scheme.base;
  for (const k of TOKEN_KEYS) root.style.removeProperty(`--${k}`);
  const tokens = scheme.css ? {} : deriveTokens(scheme);
  for (const [k, v] of Object.entries(tokens)) root.style.setProperty(`--${k}`, v);
  return tokens;
}

function applyLook(look) {
  const root = document.documentElement;
  for (const key of ['density', 'corners', 'page', 'tabs']) root.dataset[key] = look[key];
  const font = LOOK_OPTIONS.font.options.find(([id]) => id === look.font)?.[2];
  if (font) root.style.setProperty('--font-ui', font);
  return font;
}

function apply() {
  previewing = false;
  const scheme = activeScheme();
  const tokens = applyScheme(scheme);
  const font = applyLook(current.look);
  try {
    localStorage.setItem('oc.appearance', JSON.stringify({
      base: scheme.base, tokens, followSystem: current.followSystem, font,
      attrs: { density: current.look.density, corners: current.look.corners, page: current.look.page, tabs: current.look.tabs },
    }));
  } catch { /* storage unavailable */ }
  document.dispatchEvent(new CustomEvent('appearancechange', { detail: { scheme, look: current.look } }));
}

function commit() {
  apply();
  persist?.(structuredClone(current));
}

/** Call once at boot with the server settings and a function that saves `appearance`. */
export function initAppearance({ settings = {}, save } = {}) {
  persist = save;
  current = normalizeAppearance(settings.appearance ?? fromLegacy());
  apply();
  darkMedia.addEventListener('change', () => { if (current.followSystem) apply(); });
}

export function setScheme(id) {
  if (!findScheme(id)) return;
  current.scheme = id;
  current.followSystem = false;
  commit();
}
export function setFollowSystem(on) {
  current.followSystem = !!on;
  commit();
}
export function setLook(id) {
  const look = LOOKS.find((l) => l.id === id);
  if (!look) return;
  current.look = { ...look.values };
  commit();
}
export function setLookOption(key, value) {
  if (!LOOK_OPTIONS[key]?.options.some(([id]) => id === value)) return;
  current.look[key] = value;
  commit();
}
export function resetAppearance() {
  current = { ...structuredClone(DEFAULT), custom: current.custom };
  commit();
}

/** Show a scheme without saving it (gallery hover, editor live preview). */
export function previewScheme(scheme) {
  previewing = true;
  applyScheme(scheme);
}
export function endPreview() {
  if (previewing) apply();
}

function saveCustom(theme) {
  const t = cleanTheme(theme);
  const i = current.custom.findIndex((c) => c.id === t.id);
  if (i >= 0) current.custom[i] = t;
  else current.custom.push(t);
  current.scheme = t.id;
  current.followSystem = false;
  commit();
  return t;
}

export function deleteCustom(id) {
  const t = current.custom.find((c) => c.id === id);
  if (!t) return;
  current.custom = current.custom.filter((c) => c.id !== id);
  if (current.scheme === id) current.scheme = t.base === 'light' ? 'classic-light' : 'classic-dark';
  commit();
}

export function themeCode(scheme) {
  return JSON.stringify({ name: scheme.name, base: scheme.base, seeds: scheme.seeds });
}

export function importThemeCode(code) {
  let parsed;
  try { parsed = JSON.parse(code); } catch { return null; }
  const t = cleanTheme({ ...parsed, id: undefined });
  return t ? saveCustom(t) : null;
}

// =====================================================================
// UI
// =====================================================================
export function schemeDotStyle(scheme) {
  return `--d1:${scheme.seeds.canvas};--d2:${scheme.seeds.accent}`;
}

function mock(scheme) {
  const s = scheme.seeds;
  return h('div', {
    class: 'scheme-mock', 'aria-hidden': 'true',
    style: `--m-chrome:${s.chrome};--m-panel:${s.panel};--m-canvas:${s.canvas};--m-text:${s.text};--m-accent:${s.accent};--m-heading:${s.heading}`,
  },
  h('div', { class: 'm-bar' }),
  h('div', { class: 'm-body' },
    h('div', { class: 'm-side' }, h('i'), h('i'), h('i')),
    h('div', { class: 'm-page' }, h('b'), h('i'), h('i'), h('i'))));
}

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
  } catch {
    await promptDialog('Copy this theme code', { value: text, okLabel: 'Done' });
  }
}

function customMenu(anchor, scheme) {
  showMenu(anchor, [
    { label: 'Edit…', icon: 'edit', onClick: () => openThemeEditor({ edit: scheme }) },
    { label: 'Duplicate…', icon: 'copy', onClick: () => openThemeEditor({ from: scheme, name: `${scheme.name} copy` }) },
    { label: 'Copy theme code', icon: 'link', onClick: () => copy(themeCode(scheme), 'Theme code copied') },
    { separator: true },
    {
      label: 'Delete', icon: 'trash', danger: true,
      onClick: async () => {
        if (await confirmDialog('Delete theme?', `"${scheme.name}" will be removed.`, { okLabel: 'Delete theme' })) deleteCustom(scheme.id);
      },
    },
  ]);
}

/** The scheme gallery popover. Hovering a card previews it; closing without a click restores. */
export function openSchemeGallery(anchor) {
  const active = activeScheme();
  const card = (scheme) => {
    const el = h('button', {
      class: `scheme-card${!current.followSystem && scheme.id === current.scheme ? ' on' : ''}`,
      'data-scheme-card': scheme.id, title: scheme.name, 'aria-pressed': String(scheme.id === active.id),
      onmouseenter: () => previewScheme(scheme),
      onfocus: () => previewScheme(scheme),
      onclick: (e) => {
        if (e.target.closest('.card-more')) return;
        closeMenus();
        setScheme(scheme.id);
      },
    },
    mock(scheme),
    h('span', { class: 'scheme-card-name' }, !current.followSystem && scheme.id === current.scheme ? h('span', { html: svg('check', 14) }) : null, scheme.name));
    if (scheme.custom) {
      el.append(h('span', {
        class: 'card-more', role: 'button', tabindex: '0', title: 'Theme options', 'aria-label': `${scheme.name} options`, html: svg('more', 14),
        onclick: (e) => { e.stopPropagation(); customMenu(e.currentTarget, scheme); },
      }));
    }
    return el;
  };
  const grid = (list) => h('div', { class: 'gallery-grid' }, list.map(card));
  const follow = h('label', { class: 'todo-toggle' },
    h('input', {
      type: 'checkbox', checked: current.followSystem, 'data-follow-system': '1',
      onchange: (e) => { setFollowSystem(e.target.checked); closeMenus(); },
    }),
    'Match system (Classic Light / Dark)');
  const wrap = h('div', { class: 'gallery', onmouseleave: endPreview },
    h('div', { class: 'gallery-head' }, h('div', { class: 'menu-heading' }, 'Dark'), follow),
    grid(SCHEMES.filter((s) => s.base === 'dark')),
    h('div', { class: 'menu-heading' }, 'Light'),
    grid(SCHEMES.filter((s) => s.base === 'light')),
    h('div', { class: 'menu-heading' }, 'Your themes'),
    h('div', { class: 'gallery-grid' },
      current.custom.map(card),
      h('button', { class: 'scheme-card new', 'data-new-theme': '1', onclick: () => { closeMenus(); openThemeEditor(); } },
        h('span', { html: svg('plus', 20) }), 'Create theme'),
      h('button', { class: 'scheme-card new', 'data-import-theme': '1', onclick: () => { closeMenus(); importThemeDialog(); } },
        h('span', { html: svg('upload', 20) }), 'Import theme code')));
  showPopover(anchor, wrap, { keepFocus: false, onClose: endPreview });
}

export async function importThemeDialog() {
  const code = await promptDialog('Import theme', { label: 'Paste a theme code (from "Copy theme code")', placeholder: '{"name":"…","base":"dark","seeds":{…}}', okLabel: 'Import' });
  if (!code) return;
  const t = importThemeCode(code);
  toast(t ? `Imported "${t.name}"` : 'That is not a valid theme code.');
}

/** Create or edit a custom theme. Every change previews live on the app; Cancel restores. */
export async function openThemeEditor({ edit = null, from = null, name = null } = {}) {
  // Freeze the panel's own colors at what is on screen now, so the live preview can never make
  // the editor itself unreadable (e.g. while trying a dark page on a light base).
  const rootStyle = getComputedStyle(document.documentElement);
  const frozen = [...TOKEN_KEYS, 'shadow', 'mark'].map((k) => [k, rootStyle.getPropertyValue(`--${k}`).trim()]);
  const frozenScheme = rootStyle.colorScheme;
  const start = edit || from || activeScheme();
  const draft = {
    id: edit?.id,
    name: name || edit?.name || 'My theme',
    base: start.base,
    seeds: { ...start.seeds },
  };
  const nameInput = h('input', { class: 'input', value: draft.name, 'aria-label': 'Theme name', maxlength: '40' });
  const baseSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Base' });
  const startSelect = h('select', { class: 'select', 'aria-label': 'Start from' },
    h('option', { value: '' }, 'Start from…'),
    allSchemes().map((s) => h('option', { value: s.id }, s.name)));
  const colorInputs = {};
  const hexLabels = {};
  const grid = h('div', { class: 'color-grid' });
  for (const [key, label, hint] of SEEDS) {
    colorInputs[key] = h('input', { type: 'color', value: draft.seeds[key], 'data-seed': key, 'aria-label': label });
    hexLabels[key] = h('small', {}, draft.seeds[key]);
    grid.append(h('label', { class: 'color-field', title: hint }, colorInputs[key], h('span', {}, label, hexLabels[key])));
  }
  const report = h('div', { class: 'contrast-list', 'aria-live': 'polite' });

  const refresh = () => {
    baseSeg.replaceChildren(...['dark', 'light'].map((b) => h('button', {
      type: 'button', class: draft.base === b ? 'on' : '', 'aria-pressed': String(draft.base === b), 'data-base': b,
      onclick: () => { draft.base = b; refresh(); },
    }, b === 'dark' ? 'Dark' : 'Light')));
    for (const [key] of SEEDS) {
      colorInputs[key].value = draft.seeds[key];
      hexLabels[key].textContent = draft.seeds[key];
    }
    report.replaceChildren(...contrastReport(draft).flatMap(([label, ratio, min]) => [
      h('span', {}, label),
      h('b', { class: ratio >= min ? 'ok' : 'bad', title: `Needs ${min}:1` }, `${ratio.toFixed(1)}:1 ${ratio >= min ? '✓' : '⚠'}`),
    ]));
    previewScheme(draft);
  };
  for (const [key] of SEEDS) {
    colorInputs[key].addEventListener('input', () => { draft.seeds[key] = colorInputs[key].value; refresh(); });
  }
  startSelect.addEventListener('change', () => {
    const s = findScheme(startSelect.value);
    if (!s) return;
    draft.base = s.base;
    draft.seeds = { ...s.seeds };
    startSelect.value = '';
    refresh();
  });

  const body = h('div', { class: 'theme-form' },
    h('label', { class: 'field-label' }, 'Name'), nameInput,
    h('div', { class: 'row2' },
      h('div', {}, h('div', { class: 'field-label' }, 'Base'), baseSeg),
      h('div', {}, h('div', { class: 'field-label' }, 'Copy colors from'), startSelect)),
    h('div', { class: 'field-label' }, 'Colors — the app updates as you pick'),
    grid,
    h('div', { class: 'field-label' }, 'Readability'),
    report);

  refresh();
  const result = await modal({
    title: edit ? 'Edit theme' : 'Create theme',
    side: true,
    body,
    actions: [{ label: 'Cancel' }, { label: edit ? 'Save' : 'Save theme', primary: true, value: () => ({ ...draft, name: nameInput.value }) }],
    onOpen: (dlg) => {
      for (const [k, v] of frozen) if (v) dlg.style.setProperty(`--${k}`, v);
      dlg.style.colorScheme = frozenScheme;
      dlg.style.color = 'var(--text)';
      dlg.classList.add('theme-editor');
      nameInput.focus();
      nameInput.select();
    },
  });
  if (!result) {
    endPreview();
    return null;
  }
  const saved = saveCustom(result);
  toast(edit ? `Saved "${saved.name}"` : `Created "${saved.name}"`);
  return saved;
}

export function openLookMenu(anchor) {
  const name = lookName();
  showMenu(anchor, [
    { heading: 'Look' },
    ...LOOKS.map((l) => ({ label: l.name, hint: l.hint, checked: name === l.name, onClick: () => setLook(l.id) })),
  ]);
}

export function openLookOptionMenu(anchor, key) {
  const opt = LOOK_OPTIONS[key];
  showMenu(anchor, [
    { heading: opt.label },
    ...opt.options.map(([id, label, stack]) => ({
      label, checked: current.look[key] === id, labelStyle: key === 'font' ? { fontFamily: stack } : null,
      onClick: () => setLookOption(key, id),
    })),
  ]);
}
