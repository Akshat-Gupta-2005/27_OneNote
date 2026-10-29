// Simple line icons (24x24 grid, drawn with currentColor).
export const ICONS = {
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  forward: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  paste: '<rect x="8" y="2.5" width="8" height="4" rx="1"/><path d="M16 4.5h2a2 2 0 012 2V20a2 2 0 01-2 2H6a2 2 0 01-2-2V6.5a2 2 0 012-2h2"/>',
  highlight: '<path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 01-2.8 0l-5.2-5.2a2 2 0 010-2.8L14 4"/>',
  fontColor: '<path d="M6.5 17L12 3.5 17.5 17M8.6 12h6.8"/>',
  painter: '<rect x="4" y="3" width="14" height="6" rx="1.5"/><path d="M18 6h2v5h-8v3"/><rect x="10.5" y="14" width="3" height="7" rx="1"/>',
  clearFormat: '<path d="M4 7V4h16v3M9 20h4M14 4l-4 16"/><path d="M15.5 15.5l5 5M20.5 15.5l-5 5"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  bullets: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
  numbering: '<path d="M10 6h11M10 12h11M10 18h11"/><path d="M4 4h1.2v5M3.5 9h3M3.5 14.6a1.3 1.3 0 012.4.6c0 1-2.4 1.8-2.4 3H6"/>',
  outdent: '<path d="M21 5H3M21 10h-9M21 15h-9M21 20H3M7 9.5l-3 3 3 3"/>',
  indent: '<path d="M21 5H3M21 10h-9M21 15h-9M21 20H3M4 9.5l3 3-3 3"/>',
  alignLeft: '<path d="M3 6h18M3 12h12M3 18h16"/>',
  alignCenter: '<path d="M3 6h18M6 12h12M4 18h16"/>',
  alignRight: '<path d="M3 6h18M9 12h12M5 18h16"/>',
  todo: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M7.5 12.5l3 3 6-7"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/>',
  question: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01"/>',
  critical: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5h.01"/>',
  idea: '<path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9V16h7v-2.1A6 6 0 0012 3z"/>',
  contact: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
  library: '<path d="M5 4v16M9.5 4v16M14 4.5l5 15"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sort: '<path d="M4 6h10M4 11h7M4 16h4M17 5v14M14 16l3 3 3-3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  plusBox: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 8v8M8 12h8"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9.5h18M3 15h18M9 4v16M15 4v16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
  paperclip: '<path d="M21 11.5l-8.5 8.5a5 5 0 01-7-7L14 4.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4L15.5 7.6"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  calendarClock: '<path d="M21 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h5M3 10h7M8 3v4M16 3v4"/><circle cx="17" cy="17" r="5"/><path d="M17 15v2l1.3 1"/>',
  hr: '<path d="M3 12h18"/><path d="M7 7h10M7 17h10" opacity=".45"/>',
  pen: '<path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/>',
  eraser: '<path d="M7 21l-4.3-4.3a2.4 2.4 0 010-3.4l9.6-9.6a2.4 2.4 0 013.4 0l5.6 5.6a2.4 2.4 0 010 3.4L13 21"/><path d="M22 21H7M5 11l9 9"/>',
  cursor: '<path d="M9 4h6M9 20h6M12 4v16"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  shrink: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  lines: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  zoomIn: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8.5 11h5M11 8.5v5"/>',
  zoomOut: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.3-4.3M8.5 11h5"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  share: '<path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7M16 6l-4-4-4 4M12 2v13"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 116.7-9h1.8a4.5 4.5 0 010 9z"/><path d="M9.5 14l2 2 3.5-3.5"/>',
  cloudSync: '<path d="M17.5 19H9a7 7 0 116.7-9h1.8a4.5 4.5 0 010 9z"/><path d="M12 11v5M10 14l2 2 2-2"/>',
  cloudOff: '<path d="M17.5 19H9a7 7 0 116.7-9h1.8a4.5 4.5 0 010 9z"/><path d="M10 12l4 4M14 12l-4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13a1 1 0 001 1h9a1 1 0 001-1l1-13M9 7V4h6v3"/>',
  restore: '<path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8"/><path d="M3 3v5h5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M5 3h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  edit: '<path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/><path d="M14 6l3 3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  notebook: '<rect x="5" y="3" width="15" height="18" rx="2"/><path d="M9 3v18M3 7h4M3 12h4M3 17h4"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3"/>',
  move: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M11 13h6M14 10l3 3-3 3"/>',
  palette: '<path d="M12 3a9 9 0 000 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.6-1.3-.6-2.1 0-.9.7-1.6 1.6-1.6H17a4 4 0 004-4c0-4.7-4-8.7-9-8.7z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>',
  printer: '<path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/>',
  strike: '<path d="M4 12h16M16 6.5c-.8-1.5-2.3-2.5-4.3-2.5C9.3 4 7.5 5.3 7.5 7.2c0 1.6 1 2.5 2.7 3.2M8 17.5c.8 1.6 2.4 2.5 4.4 2.5 2.6 0 4.3-1.4 4.3-3.3 0-.9-.3-1.6-.9-2.2"/>',
  subscript: '<path d="M4 5l8 10M12 5l-8 10M17 20h4c0-1.5-4-2-4-4a2 2 0 014 0"/>',
  superscript: '<path d="M4 9l8 10M12 9l-8 10M17 10h4c0-1.5-4-2-4-4a2 2 0 014 0"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/>',
  rows: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  grip: '<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2M6 6l9-3 1.5 3"/>',
  corner: '<path d="M4 20V11a7 7 0 017-7h9"/>',
  type: '<path d="M5 7V5h14v2M9 19h6M12 5v14"/>',
  pageSheet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  brush: '<path d="M14.5 4.5l5 5L11 18H6v-5z"/><path d="M12.5 6.5l5 5M3 21h5"/>',
};

export function svg(name, size = 18) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Inject icons into every element that has a data-icon attribute. */
export function hydrateIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    if (el.dataset.iconDone) continue;
    el.insertAdjacentHTML('afterbegin', svg(el.dataset.icon));
    el.dataset.iconDone = '1';
  }
}

export function setIcon(el, name) {
  const old = el.querySelector('svg');
  if (old) old.outerHTML = svg(name);
  else el.insertAdjacentHTML('afterbegin', svg(name));
}
