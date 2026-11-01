// mode-combos.mjs - every combination of modes.
//
// Each switch is checked on its own: the colour modes by the colour gates, each other collection (a sizing collection
// per breakpoint) by Gate [5]. A theme can still go wrong only when two switches are on at once: a Phone block that
// also sets a colour, a Dark block that also sets a size, a rule for one mode that outranks the other's. This turns on
// every combination of the modes together, on a page holding only the theme, reads each Figma token's CSS variable as
// the browser resolves it, and compares it with Figma's value for that combination (each token takes the value of its
// own collection's mode). A value right with each switch on its own and wrong only together is listed; one wrong on
// its own is the other gates'. The text and background pairs the contrast check reads are measured in every
// combination too, from the code's values: a pair that passes with each switch alone and fails together is listed.

import { modeSwitch } from './code-capture.mjs';
import { loadModes, loadCollections } from './mode-resolver.mjs';
import { colorHex, sameValue } from './css-values.mjs';
import { contrastRatio } from './a11y-check.mjs';
import { parseColor } from './css-values.mjs';

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A media condition with alternatives ("(max-width: 480px), (hover: none) and (pointer: coarse)"): the first one the
// browser can be put in (a width, or a media feature it emulates).
export function switchFor(cssSelector) {
  const sel = String(cssSelector ?? 'root');
  if (!sel.startsWith('media:') || !sel.includes(',')) return modeSwitch({ cssSelector: sel });
  for (const alt of sel.slice(6).split(',').map((x) => x.trim()).filter(Boolean)) {
    const sw = modeSwitch({ cssSelector: `media:${alt}` });
    if (!sw.unsupported) return sw;
  }
  return modeSwitch({ cssSelector: sel });
}

// Where the theme sets a collection's variables, for each of its modes (the first is the base): an @media block
// (not a colour preference), a [data-…] or a class block, named by the mode's key, else the one block there is.
export function collectionSwitches(section, cssText, cssVars) {
  const sets = (body) => cssVars.some((v) => new RegExp(`${esc(v)}\\s*:`).test(body));
  const blocks = [];
  const css = String(cssText ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/@media\s*([^{]+)\{((?:[^{}]|\{[^{}]*\})*)\}/g)) if (!/prefers-color-scheme|prefers-contrast/.test(m[1]) && sets(m[2])) blocks.push({ selector: `media:${m[1].trim().replace(/\s+/g, ' ')}`, words: [] });
  for (const m of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
    if (!sets(m[2])) continue;
    for (const sel of m[1].split(',').map((x) => x.trim())) {
      const data = sel.match(/\[data-([\w-]+)=["']?([\w-]+)["']?\]/), cls = sel.match(/^(?::root|html)?\.([\w-]+)/);
      if (data) blocks.push({ selector: `data:${data[1]}=${data[2]}`, words: [data[2]] });
      else if (cls) blocks.push({ selector: `class:${cls[1]}`, words: [cls[1]] });
    }
  }
  const modes = section?.modes ?? [];
  return modes.map((m, i) => {
    if (i === 0) return { ...m, cssSelector: 'root' };
    const key = String(m.snapshotKey ?? m.name).toLowerCase();
    const hit = blocks.find((b) => b.words.some((w) => String(w).toLowerCase() === key)) ?? (modes.length === 2 && blocks.length === 1 ? blocks[0] : null);
    return { ...m, cssSelector: hit?.selector ?? null };
  });
}

// The switches of the project: the colour modes, then each other collection with two modes or more.
// → [{ name, colour?, modes: [{ name, key, sw }], tokens: { figmaName: { cssVar, values: { key: value }, kind } } }]
export function comboAxes(cfg = {}, vars = {}, cssText = '', { colourVar = (n) => null, scalarVar = (n) => null } = {}) {
  const axes = [];
  const colourModes = loadModes(cfg).filter((m) => vars.color?.[m.snapshotKey]);
  if (colourModes.length > 1) {
    const names = [...new Set(colourModes.flatMap((m) => Object.keys(vars.color[m.snapshotKey] ?? {})))].filter((n) => !n.startsWith('_'));
    const tokens = {};
    for (const n of names) { const v = colourVar(n); if (v) tokens[n] = { cssVar: v, kind: 'color', values: Object.fromEntries(colourModes.map((m) => [m.snapshotKey, vars.color[m.snapshotKey]?.[n] ?? null])) }; }
    axes.push({ name: cfg.figma?.colorCollection || 'Colour', colour: true, modes: colourModes.map((m) => ({ name: m.name, key: m.snapshotKey, sw: modeSwitch(m) })), tokens });
  }
  const declared = new Map(loadCollections(cfg).map((c) => [c.name, c]));
  for (const [name, section] of Object.entries(vars.modeVariants ?? {})) {
    if (name === cfg.figma?.colorCollection || !Array.isArray(section?.modes) || section.modes.length < 2) continue;
    const tokens = {};
    for (const [n, v] of Object.entries(section.vars ?? {})) { const cv = scalarVar(n, v); if (cv) tokens[n] = { cssVar: cv, kind: v?.kind === 'color' ? 'color' : 'scalar', values: v?.values ?? {} }; }
    const modes = declared.get(name)?.modes ?? collectionSwitches(section, cssText, Object.values(tokens).map((t) => t.cssVar));
    if (modes.some((m) => !m.cssSelector)) continue;   // a mode the code does not implement: Gate [5]'s to say
    axes.push({ name, modes: modes.map((m) => ({ name: m.name ?? m.snapshotKey, key: String(m.snapshotKey ?? m.name), sw: switchFor(m.cssSelector) })), tokens });
  }
  return axes.filter((a) => a.modes.every((m) => !m.sw.unsupported));
}

// Every combination of one mode from each axis, the all-base one first. → [[modeIndex per axis]].
export function combinations(axes, { max = 64 } = {}) {
  let out = [[]];
  for (const a of axes) out = out.flatMap((c) => a.modes.map((_, i) => [...c, i]));
  return out.slice(0, max);
}

// One switch made of several: the media features together (a later one wins for the same feature), the scripts in
// turn, the narrowest window.
const DEFAULT_MEDIA = { 'prefers-color-scheme': 'light', 'prefers-contrast': 'no-preference', 'prefers-reduced-motion': 'no-preference', 'forced-colors': 'none' };
export function mergeSwitches(sws) {
  // Each switch states the preferences it does not set at their default (a breakpoint says light, no-preference):
  // only what a switch sets away from the default is its own, so a breakpoint never turns Dark back to light.
  const media = new Map();
  for (const sw of sws) for (const f of sw.media ?? []) if (!media.has(f.name)) media.set(f.name, { name: f.name, value: DEFAULT_MEDIA[f.name] ?? f.value });
  for (const sw of sws) for (const f of sw.media ?? []) if (DEFAULT_MEDIA[f.name] !== f.value) media.set(f.name, f);
  const widths = sws.map((s) => s.viewport).filter(Boolean);
  return { media: [...media.values()], apply: sws.map((s) => s.apply).filter(Boolean).join('; ') || null, undo: sws.map((s) => s.undo).filter(Boolean).join('; ') || null, viewport: widths.length ? Math.min(...widths) : null };
}

const label = (axes, combo) => combo.map((i, a) => axes[a].modes[i].name).join(' with ');
const same = (a, b, kind) => {
  if (a == null || b == null) return a === b;
  if (kind === 'color') { const x = colorHex(a), y = colorHex(b); return x && y ? x === y : String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }
  return sameValue(a, b, 'length') ?? String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
};

// What goes wrong only together. readings: [{ combo, vars: { cssVar: value } }] (combinations() order). A token is
// judged in each combination that holds a mode other than the base on some other axis: wrong there and right in the
// combination with its own axis's mode and every other axis at its base.
// → [{ token, cssVar, combo: 'Dark with Phone', got, want, alone }]
export function comboFindings(axes, readings) {
  const out = [];
  const at = new Map(readings.map((r) => [r.combo.join(','), r.vars]));
  axes.forEach((axis, a) => {
    for (const [token, t] of Object.entries(axis.tokens)) {
      for (const r of readings) {
        if (!r.combo.some((i, b) => b !== a && i !== 0)) continue;   // its own switch alone
        const alone = r.combo.map((i, b) => (b === a ? i : 0));
        const want = t.values[axis.modes[r.combo[a]].key];
        if (want == null) continue;
        const got = r.vars?.[t.cssVar] ?? null, base = at.get(alone.join(','))?.[t.cssVar] ?? null;
        if (!same(base, want, t.kind) || same(got, want, t.kind)) continue;
        out.push({ token, cssVar: t.cssVar, combo: label(axes, r.combo), got: got ?? 'nothing', want, alone: label(axes, alone) });
      }
    }
  });
  return out;
}

// The pairs that pass with each switch alone and fail together, from the code's values. pairs: [{ name?, text, bg,
// large? }] (CSS variables). → [{ name, combo, ratio, need }]
export function comboContrast(axes, readings, pairs) {
  const out = [];
  const at = new Map(readings.map((r) => [r.combo.join(','), r.vars]));
  const ratio = (vars, p) => { const t = parseColor(vars?.[p.text]), b = parseColor(vars?.[p.bg]); if (!t || !b || b[3] < 1) return null; const mix = (i) => t[i] * t[3] + b[i] * (1 - t[3]); return contrastRatio({ r: mix(0), g: mix(1), b: mix(2) }, { r: b[0], g: b[1], b: b[2] }); };
  for (const p of pairs ?? []) {
    const need = p.large ? 3 : 4.5;
    for (const r of readings) {
      if (r.combo.filter((i) => i !== 0).length < 2) continue;   // a switch alone is the contrast check's
      const x = ratio(r.vars, p);
      if (x == null || x >= need) continue;
      // Each switch of the combination alone, every other at its base, passes.
      const alone = r.combo.map((i, a) => r.combo.map((j, b) => (b === a ? j : 0))).filter((c) => c.some((i) => i !== 0));
      if (!alone.every((c) => { const y = ratio(at.get(c.join(',')), p); return y == null || y >= need; })) continue;
      out.push({ name: p.name ?? `${p.text} on ${p.bg}`, combo: label(axes, r.combo), ratio: +x.toFixed(2), need });
    }
  }
  return out;
}

// In the browser: every combination set on a page holding only the theme, every root variable read.
// send: a DevTools session (cdp.mjs connectCDP), page: the theme page's file URL. → [{ combo, vars }]
export async function readCombinations(send, page, axes, { max = 64 } = {}) {
  const { openLoaded, READ_ROOT_VARS } = await import('./code-capture.mjs');
  const { targetId, sessionId } = await openLoaded(send, page);
  if (!sessionId) return null;
  const out = [];
  try {
    for (const combo of combinations(axes, { max })) {
      const sw = mergeSwitches(combo.map((i, a) => axes[a].modes[i].sw));
      await send('Emulation.setEmulatedMedia', { features: sw.media }, sessionId);
      await send('Emulation.setDeviceMetricsOverride', { width: sw.viewport ?? 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
      if (sw.apply) await send('Runtime.evaluate', { expression: sw.apply }, sessionId);
      const r = await send('Runtime.evaluate', { expression: READ_ROOT_VARS, returnByValue: true }, sessionId);
      out.push({ combo, vars: r.result?.value?.vars ?? {} });
      if (sw.undo) await send('Runtime.evaluate', { expression: sw.undo }, sessionId);
    }
  } finally { await send('Target.closeTarget', { targetId }).catch(() => {}); }
  return out;
}

// The whole check for a project, in the browser. → { axes, combos, findings, contrast } | { why }
export async function modeCombinations(ROOT, cfg = {}, { chromePath = null, pairs = [] } = {}) {
  const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const { join, resolve } = await import('node:path');
  const { pathToFileURL } = await import('node:url');
  const { loadCssSources } = await import('./css-source.mjs');
  const { themePage } = await import('./code-capture.mjs');
  const { resolveNamingSpec, tokenToVar } = await import('./naming-convention.mjs');
  const { OUT_DIR, projectPath } = await import('./names.mjs');
  let vars = {};
  try { vars = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'utf8')); } catch { return { why: 'no vars snapshot' }; }
  const files = loadCssSources(ROOT, [cfg.paths?.themeCSS ?? []].flat()).files;
  const spec = resolveNamingSpec(cfg);
  let explicit = {}, explicitSizing = {};
  try { const map = await import(pathToFileURL(join(ROOT, projectPath(ROOT, 'map'))).href); explicit = map.EXPLICIT ?? {}; explicitSizing = map.EXPLICIT_SIZING ?? {}; } catch { /* no map */ }
  const axes = comboAxes(cfg, vars, files.map((f) => f.text).join('\n'), {
    colourVar: (n) => (Object.prototype.hasOwnProperty.call(explicit, n) ? explicit[n] : tokenToVar(n, spec)),
    scalarVar: (n) => (Object.prototype.hasOwnProperty.call(explicitSizing, n) ? explicitSizing[n] : tokenToVar(n, spec, { raw: true })),
  });
  if (axes.length < 2) return { axes, combos: 0, findings: [], contrast: [] };
  const { findChrome, launchChrome, connectCDP } = await import('./cdp.mjs');
  const chrome = chromePath ?? findChrome();
  if (!chrome) return { why: 'Chrome not found' };
  const dir = join(ROOT, OUT_DIR, 'tmp');
  mkdirSync(dir, { recursive: true });
  const page = join(dir, 'mode-combinations.html');
  writeFileSync(page, themePage(files));
  const browser = await launchChrome(chrome, { tmpPrefix: 'mode-combos-' });
  try {
    const { send, close } = await connectCDP(browser.wsUrl);
    const readings = await readCombinations(send, pathToFileURL(page).href, axes);
    close();
    if (!readings) return { why: 'the theme page did not load' };
    return { axes, combos: readings.length, findings: comboFindings(axes, readings), contrast: comboContrast(axes, readings, pairs) };
  } finally { browser.kill(); }
}

// The text and background pairs the contrast check reads (declared in a11y.tokenPairs, and derived from the token names
// and what Figma draws together), as CSS variables. → [{ name, text, bg, large? }]
export async function projectPairs(ROOT, cfg = {}) {
  const { readFileSync, existsSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  let vars = {};
  try { vars = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'utf8')); } catch { return []; }
  const names = [...new Set(Object.values(vars.color ?? {}).flatMap((m) => Object.keys(m ?? {})))];
  let pairs = [...(Array.isArray(cfg.a11y?.tokenPairs) ? cfg.a11y.tokenPairs : [])];
  if (cfg.a11y?.derivePairs !== false && names.length) {
    const { deriveContrastPairs, applyDrawnOn } = await import('./pair-derive.mjs');
    let derived = deriveContrastPairs(names, { boundaries: cfg.a11y?.nonTextPairs === true });
    try { const p = resolve(ROOT, cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json'); if (existsSync(p)) { const st = JSON.parse(readFileSync(p, 'utf8')); derived = applyDrawnOn(derived, st.components ?? st).pairs; } } catch { /* the names alone */ }
    pairs = [...pairs, ...derived];
  }
  const { colorVarOf, loadParityMaps } = await import('./capture-compare.mjs');
  const { resolveNamingSpec } = await import('./naming-convention.mjs');
  const spec = resolveNamingSpec(cfg), maps = await loadParityMaps(ROOT, cfg);
  const seen = new Set(), out = [];
  for (const p of pairs) {
    if (!p?.text || !p?.bg) continue;
    const text = colorVarOf(p.text, spec, maps), bg = colorVarOf(p.bg, spec, maps);
    if (!text || !bg || seen.has(`${text}|${bg}`)) continue;
    seen.add(`${text}|${bg}`);
    out.push({ name: p.name ?? `${p.text} on ${p.bg}`, text, bg, ...(p.large ? { large: true } : {}) });
  }
  return out;
}

// The style guide's To do rows for the system, from the audit's mode-combinations.json. → [{ kind, who, say, todo }]
export function comboTodos(saved) {
  const f = saved?.findings ?? [], c = saved?.contrast ?? [];
  const out = [];
  const some = (xs, n = 3) => xs.slice(0, n).join('; ') + (xs.length > n ? `; and ${xs.length - n} more` : '');
  if (f.length) out.push({ kind: 'Modes together', who: 'code',
    say: `${f.length} token${f.length === 1 ? ' takes' : 's take'} a value Figma does not have only when two modes are on together, each mode alone being right (${some(f.map((x) => `${x.cssVar} in ${x.combo} is ${x.got}, Figma ${x.want}`))}).`,
    todo: 'Make each mode\'s block set only its own variables, so one never undoes another.' });
  if (c.length) out.push({ kind: 'Modes together', who: 'code',
    say: `${c.length} text and background pair${c.length === 1 ? ' fails' : 's fail'} contrast only when two modes are on together (${some(c.map((x) => `${x.name} in ${x.combo}, ${x.ratio}:1 for ${x.need}:1`))}).`,
    todo: 'Fix the variable that changes in the combination, so the pair keeps its contrast.' });
  return out;
}
