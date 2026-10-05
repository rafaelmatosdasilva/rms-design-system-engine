// Token values a product loads at runtime from hosted stylesheets, one per mode (light-desktop.css, dark-tablet.css):
// setup takes every one of them, so no mode is left out and nobody is asked which, and writes one local token file
// the checks can read. The base is the light (else first) colour mode at the desktop (else first) size; each other
// colour mode is a :root[data-theme="…"] block, each other size mode a :root[data-size="…"] block, and a file that
// is both (dark-tablet) adds what neither block gives it. Every block holds only what differs from what it builds on.

const COLOUR = /^(light|dark|dim|night|day|contrast|high-?contrast|hc)$/i;
const BASE_COLOUR = /^light$/i, BASE_SIZE = /^(desktop|large|lg|xl|default|base)$/i;

// The words of a file's name that tell its mode apart from the others': a URL's last path part, without .css or a query.
const stemOf = (url) => decodeURIComponent(String(url).split(/[?#]/)[0].split('/').pop() || '').replace(/\.css$/i, '');
const wordsOf = (url) => stemOf(url).split(/[-_.]+/).filter(Boolean);

// Every custom property a stylesheet declares, last one wins: { '--x': 'value' }.
export function declaredVars(css) {
  const out = {};
  const clean = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)/g)) out[m[1]] = m[2].trim();
  return out;
}

// Which word of the names is which mode: → { axes: [{ at, kind: 'colour'|'size', values, base }], modeOf(url) }.
export function hostedAxes(urls) {
  const words = urls.map(wordsOf);
  const len = Math.max(0, ...words.map((w) => w.length));
  const axes = [];
  for (let at = 0; at < len; at++) {
    const values = [...new Set(words.map((w) => (w[at] ?? '').toLowerCase()))];
    if (values.length < 2) continue;
    const kind = values.some((v) => COLOUR.test(v)) ? 'colour' : 'size';
    const base = values.find((v) => (kind === 'colour' ? BASE_COLOUR : BASE_SIZE).test(v)) ?? values[0];
    axes.push({ at, kind, values, base });
  }
  // One axis of each kind: a second varying word of the same kind joins the first (light-v2) as part of its value.
  const modeOf = (url) => { const w = wordsOf(url).map((x) => x.toLowerCase()); return Object.fromEntries(axes.map((a) => [a.kind, w[a.at] ?? ''])); };
  return { axes, modeOf };
}

const block = (sel, vars) => (Object.keys(vars).length ? `${sel} {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}\n` : '');
const diff = (vars, from) => Object.fromEntries(Object.entries(vars).filter(([k, v]) => from[k] !== v));

// files: [{ url, css }] → { css, base: { colour, size }, colours: [], sizes: [] }
export function mergeHosted(files) {
  if (!files.length) return { css: '', base: {}, colours: [], sizes: [] };
  if (files.length === 1) return { css: `/* From ${files[0].url} */\n${files[0].css}\n`, base: {}, colours: [], sizes: [] };
  const { axes, modeOf } = hostedAxes(files.map((f) => f.url));
  const colourAxis = axes.find((a) => a.kind === 'colour'), sizeAxis = axes.find((a) => a.kind === 'size');
  const base = { colour: colourAxis?.base ?? '', size: sizeAxis?.base ?? '' };
  const keyOf = (m) => `${m.colour ?? ''}|${m.size ?? ''}`;
  const byMode = new Map(files.map((f) => [keyOf({ colour: colourAxis ? modeOf(f.url).colour : '', size: sizeAxis ? modeOf(f.url).size : '' }), { ...f, vars: declaredVars(f.css) }]));
  const at = (colour, size) => byMode.get(keyOf({ colour, size }));
  const baseFile = at(base.colour, base.size) ?? byMode.values().next().value;
  const baseVars = baseFile.vars;
  let css = `/* Written by rms-design-system-engine setup from the hosted token stylesheets, every mode:\n${files.map((f) => ` *   ${f.url}`).join('\n')}\n * Run setup again to take them afresh. */\n`;
  css += block(':root', baseVars);
  const colours = (colourAxis?.values ?? []).filter((v) => v !== base.colour), sizes = (sizeAxis?.values ?? []).filter((v) => v !== base.size);
  const colourVars = {}, sizeVars = {};
  for (const c of colours) { const f = at(c, base.size); if (f) { colourVars[c] = diff(f.vars, baseVars); css += block(`:root[data-theme="${c}"]`, colourVars[c]); } }
  for (const s of sizes) { const f = at(base.colour, s); if (f) { sizeVars[s] = diff(f.vars, baseVars); css += block(`:root[data-size="${s}"]`, sizeVars[s]); } }
  // Both at once: what the file sets that the two blocks together do not.
  for (const c of colours) for (const s of sizes) {
    const f = at(c, s); if (!f) continue;
    const layered = { ...baseVars, ...(colourVars[c] ?? {}), ...(sizeVars[s] ?? {}) };
    css += block(`:root[data-theme="${c}"][data-size="${s}"]`, diff(f.vars, layered));
  }
  return { css, base, colours, sizes };
}

// The hosted stylesheets setup can take: full URLs to .css files (a template with ${…} in it is not one), never a
// known CDN's (fonts, highlighters).
export function takeableUrls(hints) {
  return [...new Set(hints.filter((h) => /^https?:\/\/[^\s'"`]+\.css(\?[^\s'"`]*)?$/i.test(h) && !/\$\{|\{\{/.test(h) && !/cdnjs|jsdelivr|unpkg|googleapis|gstatic|cloudflare/i.test(h)))];
}

// Download each one (Node's own fetch) → [{ url, css }]; one that fails is left out and said.
export async function fetchHosted(urls, { fetchImpl = globalThis.fetch, log = () => {} } = {}) {
  const out = [];
  for (const url of urls) {
    try {
      const r = await fetchImpl(url);
      if (!r.ok) { log(`${url}: ${r.status}`); continue; }
      const css = await r.text();
      if (!/--[\w-]+\s*:/.test(css)) { log(`${url}: declares no token`); continue; }
      out.push({ url, css });
    } catch (e) { log(`${url}: ${e.message}`); }
  }
  return out;
}
