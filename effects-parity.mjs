// effects-parity.mjs - shadows, blurs, gradients, clipping and blend modes against Figma (A9).
//
// The colour, size and type checks compare a component's fills, strokes, radii and text with Figma's. What else it draws
// was read on neither side: its shadows (Figma's drop and inner shadows, the code's box-shadow), its blurs (a layer blur,
// filter: blur(); a background blur, backdrop-filter: blur()), a gradient or an image fill (background-image), whether it
// clips what overflows it (Figma's Clip content, the code's overflow) and how it blends (a blend mode, mix-blend-mode),
// and its opacity. This reads Figma's with a read-only Plugin API capture (EFFECTS_CAPTURE_JS, kept as
// figma-effects.snapshot.json), the code's from the component's own rule in the system's CSS, and says each that differs.

import { blankComments, walkCss } from './css-source.mjs';
import { lengthPx, parseColor } from './css-values.mjs';
import { customProps } from './motion-components.mjs';

// Run with use_figma or figma-cli on the file (PAGE_IDS: the pages to read, null for every page). It only reads: each
// component's own frame (a set's default variant, its first) and its layers to two levels down: their effects (with
// the variable or the effect style behind each), a gradient or an image fill, Clip content, blend mode and opacity.
export const EFFECTS_CAPTURE_JS = `
const PAGE_IDS = __PAGE_IDS__;
const pages = PAGE_IDS ? (await Promise.all(PAGE_IDS.map((id) => figma.getNodeByIdAsync(id)))).filter(Boolean) : figma.root.children;
const out = {};
const varName = async (b) => { if (!b || !b.id) return null; const v = await figma.variables.getVariableByIdAsync(b.id); return v ? v.name : null; };
const rgba = (c) => (c ? { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255), a: Math.round((c.a == null ? 1 : c.a) * 1000) / 1000 } : null);
const read = async (n) => {
  const rec = {};
  const fx = ('effects' in n ? n.effects : []) || [];
  if (fx.length) {
    rec.effects = [];
    for (const e of fx) {
      if (e.visible === false) continue;
      rec.effects.push({ type: e.type, color: rgba(e.color), x: e.offset ? e.offset.x : null, y: e.offset ? e.offset.y : null, radius: e.radius == null ? null : e.radius, spread: e.spread == null ? null : e.spread, colorVar: await varName(e.boundVariables && e.boundVariables.color) });
    }
    if ('effectStyleId' in n && n.effectStyleId && typeof n.effectStyleId === 'string') { const st = await figma.getStyleByIdAsync(n.effectStyleId); if (st) rec.effectStyle = st.name; }
  }
  const fills = ('fills' in n && Array.isArray(n.fills) ? n.fills : []).filter((f) => f.visible !== false && f.type !== 'SOLID');
  if (fills.length) rec.fills = fills.map((f) => ({ type: f.type, stops: f.gradientStops ? f.gradientStops.map((s) => ({ at: Math.round(s.position * 1000) / 1000, color: rgba(s.color) })) : undefined, scaleMode: f.scaleMode, blendMode: f.blendMode && f.blendMode !== 'NORMAL' ? f.blendMode : undefined }));
  if ('clipsContent' in n && n.clipsContent) rec.clips = true;
  if ('blendMode' in n && n.blendMode && n.blendMode !== 'PASS_THROUGH' && n.blendMode !== 'NORMAL') rec.blendMode = n.blendMode;
  if ('opacity' in n && n.opacity < 1) rec.opacity = Math.round(n.opacity * 1000) / 1000;
  return rec;
};
// Only what draws something past the colours the other checks read, so the answer stays small on a large file.
const kept = (r) => !!(r.effects || r.fills || r.blendMode || r.opacity != null || r.parts || r.clips);
const walk = async (n, depth) => {
  const rec = await read(n);
  if (depth < 2 && 'children' in n) {
    const parts = {};
    for (const c of n.children) {
      if (c.type === 'TEXT' || c.visible === false) continue;
      const p = await walk(c, depth + 1);
      if (kept(p)) parts[c.name] = p;
    }
    if (Object.keys(parts).length) rec.parts = parts;
  }
  return rec;
};
for (const page of pages) {
  await figma.setCurrentPageAsync(page);
  for (const set of page.findAllWithCriteria({ types: ['COMPONENT_SET'] })) if (set.children[0]) { const r = await walk(set.children[0], 0); out[set.name] = kept(r) ? r : {}; }
  for (const c of page.findAllWithCriteria({ types: ['COMPONENT'] })) if (!c.parent || c.parent.type !== 'COMPONENT_SET') { const r = await walk(c, 0); if (kept(r)) out[c.name] = r; }
}
return { _captured: new Date().toISOString(), _note: 'Read-only capture of each component\\'s effects, gradient and image fills, Clip content, blend mode and opacity (effects-parity.mjs).', components: out };
`;

export const effectsCaptureScript = (pageIds = null) => {
  const ids = pageIds == null ? null : [pageIds].flat().filter(Boolean).map((id) => String(id).replace('-', ':'));
  return EFFECTS_CAPTURE_JS.replace('__PAGE_IDS__', JSON.stringify(ids && ids.length ? ids : null)).trim() + '\n';
};

// The effects snapshot from a capture's answer (what use_figma returned, saved as a file).
export function effectsSnapshot(answer) {
  const a = typeof answer === 'string' ? JSON.parse(answer) : answer;
  const body = a?.components ? a : a?.result?.components ? a.result : null;
  if (!body) throw new Error('not an effects capture (no "components")');
  return { _updated: new Date().toISOString(), _note: 'Each component\'s effects, gradient and image fills, Clip content, blend mode and opacity, read from Figma (effects-parity.mjs EFFECTS_CAPTURE_JS).', components: body.components };
}

// ── The code's side ──

const splitTop = (s) => { const out = []; let d = 0, cur = ''; for (const ch of String(s ?? '')) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
const words = (s) => String(s ?? '').match(/(?:rgba?|hsla?|oklch|oklab|color|var|calc)\([^()]*(?:\([^()]*\)[^()]*)*\)|[^\s]+/g) ?? [];

// A box-shadow as Figma names its shadows: [{ type: DROP_SHADOW|INNER_SHADOW, x, y, radius, spread, color: [r,g,b,a] }].
export function shadowsOf(value) {
  if (!value || /^none$/i.test(String(value).trim())) return [];
  return splitTop(value).map((part) => {
    const t = words(part), inset = t.includes('inset');
    const lens = t.filter((x) => x !== 'inset' && lengthPx(x, { unitless: true }) != null).map((x) => lengthPx(x, { unitless: true }));
    const col = t.find((x) => x !== 'inset' && lengthPx(x, { unitless: true }) == null);
    return { type: inset ? 'INNER_SHADOW' : 'DROP_SHADOW', x: lens[0] ?? 0, y: lens[1] ?? 0, radius: lens[2] ?? 0, spread: lens[3] ?? 0, color: parseColor(col ?? 'currentColor') ?? null, css: part };
  });
}
// A blur() in a filter, in Figma's radius (twice the CSS blur, as Figma's Dev Mode writes it).
const blurOf = (v) => { const m = /blur\(\s*([^)]+)\)/.exec(String(v ?? '')); const px = m ? lengthPx(m[1]) : null; return px == null ? null : px * 2; };

// The component's own look in its own rule (.chip, never .chip:hover or .chip .icon): its shadows, blurs, background
// image, overflow, blend mode and opacity, var() read through the theme. → { shadows, layerBlur, backgroundBlur,
// image, clips, blendMode, opacity, at } | null when the CSS has no rule for it
export function codeEffects(sources = [], cls, { resolve = null } = {}) {
  const c = String(cls ?? '').replace(/^\./, '');
  if (!c || /[^\w-]/.test(c)) return null;
  resolve ??= customProps(sources);
  const own = new RegExp(`^\\.${c.replace(/[-]/g, '\\-')}$`);
  const decl = {}; let at = null;
  for (const src of sources) for (const r of walkCss(blankComments(String(src.text ?? '')), src.file)) {
    if ((r.atRules ?? []).some((a) => /prefers-|@keyframes|print/.test(a))) continue;
    if (!r.selectors.some((s) => own.test(s.trim()))) continue;
    at ??= `${src.file}:${r.line}`;
    for (const d of r.decls) decl[d.prop] = resolve(d.value);
  }
  if (!at) return null;
  const bg = decl['background-image'] ?? (/gradient\(|url\(/.test(decl.background ?? '') ? decl.background : null);
  const ov = [decl.overflow, decl['overflow-x'], decl['overflow-y']].filter(Boolean).join(' ');
  return {
    shadows: shadowsOf(decl['box-shadow']),
    layerBlur: blurOf(decl.filter), backgroundBlur: blurOf(decl['backdrop-filter'] ?? decl['-webkit-backdrop-filter']),
    image: bg ? (/linear-gradient/.test(bg) ? 'GRADIENT_LINEAR' : /radial-gradient/.test(bg) ? 'GRADIENT_RADIAL' : /conic-gradient/.test(bg) ? 'GRADIENT_ANGULAR' : /url\(/.test(bg) ? 'IMAGE' : null) : null,
    stops: bg ? (bg.match(/(?:rgba?|hsla?|oklch)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) ?? []).map(parseColor).filter(Boolean) : [],
    clips: ov ? /hidden|clip/.test(ov) : null,
    blendMode: decl['mix-blend-mode'] && decl['mix-blend-mode'] !== 'normal' ? decl['mix-blend-mode'] : null,
    opacity: decl.opacity != null && !isNaN(parseFloat(decl.opacity)) ? parseFloat(decl.opacity) : null,
    at,
  };
}

// ── The comparison ──

const figRgba = (c) => (c ? [c.r, c.g, c.b, c.a] : null);
const sameRgba = (a, b) => !!a && !!b && Math.abs(a[0] - b[0]) <= 2 && Math.abs(a[1] - b[1]) <= 2 && Math.abs(a[2] - b[2]) <= 2 && Math.abs(a[3] - b[3]) <= 0.02;
const say = (c) => (c ? (c[3] < 1 ? `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${+c[3].toFixed(2)})` : `#${c.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`) : '?');
const shadowWords = (s) => `${s.type === 'INNER_SHADOW' ? 'an inner shadow' : 'a shadow'} ${s.x} ${s.y}, blur ${s.radius}, spread ${s.spread ?? 0}, ${say(s.color)}`;
const BLEND = { MULTIPLY: 'multiply', SCREEN: 'screen', OVERLAY: 'overlay', DARKEN: 'darken', LIGHTEN: 'lighten', COLOR_DODGE: 'color-dodge', COLOR_BURN: 'color-burn', HARD_LIGHT: 'hard-light', SOFT_LIGHT: 'soft-light', DIFFERENCE: 'difference', EXCLUSION: 'exclusion', HUE: 'hue', SATURATION: 'saturation', COLOR: 'color', LUMINOSITY: 'luminosity' };
const FILL_WORD = { GRADIENT_LINEAR: 'a linear gradient', GRADIENT_RADIAL: 'a radial gradient', GRADIENT_ANGULAR: 'an angular gradient', GRADIENT_DIAMOND: 'a diamond gradient', IMAGE: 'an image', VIDEO: 'a video' };

// One element's effects, Figma's against the code's: its shadows one for one, its blurs, a gradient or image fill, its
// clipping (a decision), blend mode and opacity. add(what, figma, code, side) records each that differs.
function compareOne(fig, code, add, { clips = true } = {}) {
  const fShadows = (fig.effects ?? []).filter((e) => /SHADOW/.test(e.type)).map((e) => ({ ...e, color: figRgba(e.color) }));
  const n = Math.max(fShadows.length, code.shadows.length);
  for (let i = 0; i < n; i++) {
    const f = fShadows[i], k = code.shadows[i];
    if (f && !k) { add('shadow', `draws ${shadowWords(f)}${f.colorVar ? ` (${f.colorVar})` : ''}`, 'draws none', 'code'); continue; }
    if (!f && k) { add('shadow', 'draws none', `draws ${shadowWords(k)}`, 'decide'); continue; }
    const off = [f.type !== k.type ? 'kind' : '', Math.abs((f.x ?? 0) - k.x) > 0.5 || Math.abs((f.y ?? 0) - k.y) > 0.5 ? 'offset' : '', Math.abs((f.radius ?? 0) - k.radius) > 0.5 ? 'blur' : '', Math.abs((f.spread ?? 0) - k.spread) > 0.5 ? 'spread' : '', k.color && !sameRgba(f.color, k.color) ? 'colour' : ''].filter(Boolean);
    if (off.length) add(`shadow ${off.join(', ')}`, `draws ${shadowWords(f)}${f.colorVar ? ` (${f.colorVar})` : ''}`, `draws ${shadowWords(k)}`);
  }
  // Blurs: Figma's radius is twice the CSS blur, as Figma's Dev Mode writes it.
  for (const [type, codeR, word, prop] of [['LAYER_BLUR', code.layerBlur, 'blur', 'filter: blur()'], ['BACKGROUND_BLUR', code.backgroundBlur, 'background blur', 'backdrop-filter: blur()']]) {
    const f = (fig.effects ?? []).find((e) => e.type === type);
    if (f && codeR == null) add(word, `blurs it ${f.radius} (${f.radius / 2}px in CSS)`, `has no ${prop}`);
    else if (!f && codeR != null) add(word, 'does not blur it', `blurs it ${codeR / 2}px (${prop})`, 'decide');
    else if (f && Math.abs(f.radius - codeR) > 1) add(word, `blurs it ${f.radius} (${f.radius / 2}px in CSS)`, `blurs it ${codeR / 2}px`);
  }
  const fFill = (fig.fills ?? [])[0];
  if (fFill && !code.image) add('fill', `fills it with ${FILL_WORD[fFill.type] ?? String(fFill.type).toLowerCase()}`, 'has no background image');
  else if (!fFill && code.image) add('fill', 'has no gradient or image fill', `draws ${FILL_WORD[code.image] ?? 'a background image'}`, 'decide');
  else if (fFill && code.image && fFill.type !== code.image) add('fill', `fills it with ${FILL_WORD[fFill.type] ?? fFill.type}`, `draws ${FILL_WORD[code.image] ?? 'a background image'}`);
  else if (fFill?.stops && code.stops.length && (fFill.stops.length !== code.stops.length || fFill.stops.some((st, i) => !sameRgba(figRgba(st.color), code.stops[i])))) add('gradient colours', `goes ${fFill.stops.map((st) => say(figRgba(st.color))).join(' to ')}`, `goes ${code.stops.map(say).join(' to ')}`);
  // Clip content is a decision: Figma's frames clip by default, while a page rarely needs to.
  if (clips && fig.clips === true && code.clips !== true) add('clip content', 'clips what overflows it', 'lets it show (no overflow: hidden)', 'decide');
  const fBlend = fig.blendMode ? BLEND[fig.blendMode] ?? fig.blendMode.toLowerCase() : null;
  if ((fBlend ?? null) !== (code.blendMode ?? null)) add('blend mode', fBlend ? `blends it ${fBlend}` : 'does not blend it', code.blendMode ? `blends it ${code.blendMode}` : 'does not blend it', fBlend ? 'code' : 'decide');
  const fOp = fig.opacity ?? 1, kOp = code.opacity ?? 1;
  if (Math.abs(fOp - kOp) > 0.01) add('opacity', `draws it at ${Math.round(fOp * 100)}%`, `at ${Math.round(kOp * 100)}%`);
}

// Each component's effects, Figma's against the code's: its own frame against its own rule, and each of its layers that
// draws an effect against the code's part of the same name (.badge-background, .modal__card). snap: the effects
// snapshot. classFor(name): its class. → [{ component, part, what, figma, code, at, side: 'code'|'decide', message }]
export function effectsFindings(snap, sources = [], classFor = () => null) {
  const resolve = customProps(sources), out = [];
  const kebab = (x) => String(x).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  for (const [component, fig] of Object.entries(snap?.components ?? {})) {
    const cls = String(classFor(component) ?? '').replace(/^\./, '');
    const code = cls ? codeEffects(sources, cls, { resolve }) : null;
    if (!code) continue;   // no rule of its own in the CSS: nothing to compare
    const adder = (part, at) => (what, figma, codeSays, side = 'code') => out.push({ component, part, what, figma, code: codeSays, at, side, message: `${component}${part ? ` ${part}` : ''} ${what}: Figma ${figma}, the code ${codeSays} (${at})` });
    compareOne(fig, code, adder(null, code.at));
    for (const [part, pf] of Object.entries(fig.parts ?? {})) {
      if (!(pf.effects || pf.fills || pf.blendMode || pf.opacity != null)) continue;   // a layer that only clips (an icon's frame) is not compared
      const k = kebab(part), pk = [k === kebab(cls) ? cls : null, `${cls}-${k}`, `${cls}__${k}`].filter(Boolean).map((x) => codeEffects(sources, x, { resolve })).find(Boolean);
      if (pk) compareOne(pf, pk, adder(part, pk.at), { clips: false });
    }
  }
  return out;
}

// The whole check for a project: the snapshot, the system's sheets, each component's class. → { findings, compared } | null
export async function projectEffects(ROOT, cfg = {}) {
  const { readFileSync } = await import('node:fs');
  const { resolve, dirname, join } = await import('node:path');
  const file = cfg.paths?.snapshotEffects ?? join(dirname(cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'figma-effects.snapshot.json');
  let snap;
  try { snap = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')); } catch { return null; }
  const { loadCssSources } = await import('./css-source.mjs');
  const { sourceFiles } = await import('./code-roots.mjs');
  const { loadLocator } = await import('./component-locator.mjs');
  const named = loadCssSources(ROOT, [cfg.paths?.themeCSS ?? [], ...[cfg.paths?.componentCSS ?? []]].flat()).files, have = new Set(named.map((f) => f.file));
  const sources = [...named, ...sourceFiles(ROOT, cfg).filter((f) => /\.css$/i.test(f.file) && !f.file.startsWith('..') && !have.has(f.file))];
  const locator = await loadLocator(ROOT, cfg);
  return { findings: effectsFindings(snap, sources, (n) => locator.classFor(n)), compared: Object.keys(snap.components ?? {}).length, file };
}
