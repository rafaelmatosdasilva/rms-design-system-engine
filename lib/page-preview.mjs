// page-preview.mjs - a prototype written in the product's own code, opened so a person can look at it.
//
// The route wrote the page and checked it and left nowhere to see it. On the run this came from, the agent built a
// preview by hand - the product's own setup around one page, the theme's stylesheet, the gaps drawn as boxes - and
// reviewing the page in it is where the owner found most of what the check missed. Every team would otherwise
// build that same viewer.
//
// It is the harness the check already uses to draw the page (page-render.mjs): the same server, the same project
// build, so the preview is the page the check measured and not a second rendering of it. What this adds is a
// person: the server stays up, and each gap is drawn where it sits.
import { resolve } from 'node:path';

// What the page says about itself, drawn over it. A gap is written in the page as a box the code does not fill
// (data-missing) or a part of a component the system lacks (data-gap-part): both are in the DOM already, so the
// overlay outlines what is there rather than guessing where a need belongs.
export const GAP_SELECTOR = '[data-missing], [data-gap-part]';
export const PREVIEW_STYLE = `
  [data-dse-gap-outline] { outline: 2px dashed #b45309 !important; outline-offset: 2px; position: relative; }
  [data-dse-gap-label] { position: absolute; z-index: 2147483000; transform: translateY(-100%);
    background: #b45309; color: #fff; font: 11px/1.4 ui-monospace, monospace; padding: 2px 6px; border-radius: 3px;
    pointer-events: none; white-space: nowrap; }
  [data-dse-gap-note] { position: fixed; right: 12px; bottom: 12px; z-index: 2147483001; max-width: 42ch;
    background: #1c1917; color: #fafaf9; font: 12px/1.5 ui-sans-serif, system-ui; padding: 10px 12px;
    border-radius: 6px; box-shadow: 0 6px 24px rgba(0,0,0,.3); }
  [data-dse-gap-note] b { color: #fbbf24; }
`;

// The script the preview runs in the page: outline every gap, label it with what is needed, and say how many there
// are. Written here rather than built in the page so the words come from the check, never from the markup.
export function previewScript(gaps = []) {
  const needs = gaps.map((g) => String(g?.need ?? '').trim()).filter(Boolean);
  return `(() => {
  const style = document.createElement('style');
  style.textContent = ${JSON.stringify(PREVIEW_STYLE)};
  document.head.appendChild(style);
  const needs = ${JSON.stringify(needs)};
  const marks = [...document.querySelectorAll(${JSON.stringify(GAP_SELECTOR)})];
  marks.forEach((el, i) => {
    el.setAttribute('data-dse-gap-outline', '');
    const said = el.getAttribute('data-missing') || el.getAttribute('data-gap-part') || needs[i] || 'a need the system does not meet';
    const tag = document.createElement('span');
    tag.setAttribute('data-dse-gap-label', '');
    tag.textContent = said;
    el.appendChild(tag);
  });
  const note = document.createElement('div');
  note.setAttribute('data-dse-gap-note', '');
  note.innerHTML = marks.length
    ? '<b>' + marks.length + ' gap' + (marks.length === 1 ? '' : 's') + '</b> drawn where they are. Each is a need the system does not meet; nothing here was invented to fill one.'
    : '<b>No gaps</b>: every part of this page is the system\\'s.';
  document.body.appendChild(note);
  return marks.length;
})()`;
}

// Open the page and leave it open. → { url, gaps, close } or { why } when it cannot be served.
export async function previewPage(ROOT, cfg, file, { gaps = [], onReady = null } = {}) {
  const abs = resolve(ROOT, file);
  const syntax = /\.vue$/i.test(file) ? 'vue' : /\.(jsx|tsx)$/i.test(file) ? 'react' : null;
  if (!syntax) return { why: `a ${String(file).split('.').pop()} page has no preview yet: only a Vue or a React page is drawn` };
  const group = syntax === 'vue' ? 'showroom:prototype' : 'prototype';
  let h;
  try {
    h = syntax === 'vue'
      ? await (await import('./vue-harness.mjs')).startVueHarness(ROOT, cfg, [group], { locate: () => abs })
      : await (await import('./component-harness.mjs')).startHarness(ROOT, cfg, [group], { locate: () => abs });
  } catch (e) { return { why: `the page could not be served (${String(e.message).split('\n')[0]})` }; }
  if (!h?.url) return { why: h?.why ?? 'the page could not be served' };
  onReady?.(h.url);
  return { url: h.url, gaps: gaps.length, script: previewScript(gaps), close: () => h.close?.() };
}

// What the person is told, with the address to open and what they are looking at.
export function previewLines({ url, gaps }) {
  return [
    `Preview: ${url}`,
    gaps
      ? `   ${gaps} gap${gaps === 1 ? ' is' : 's are'} drawn on it where ${gaps === 1 ? 'it sits' : 'they sit'}: each is a need the system does not meet.`
      : '   No gaps: every part of this page is the system\'s.',
    '   It is the page the check measured, served by the project\'s own build. Ctrl-C closes it.',
  ];
}
