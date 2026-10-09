// capture-compare.mjs - compare the code capture with the Figma snapshots, field by field.
//
// Two uses:
//   • calibration: on a project whose parity is green, Figma and code already agree, so every
//     difference found here is a bug in the code capture, not in the project;
//   • the foundation for the authoring model: the same neutral comparison works whichever side
//     leads (the author decides who is behind, this module only says what differs).
//
// Tokens: every Figma colour and sizing token (per mode) through the project's own naming
// (design-system-engine-map.mjs EXPLICIT / EXPLICIT_SIZING, else naming-convention.mjs), and the text scale
// through design-system-engine-map TYPO. Components: height, padding, gap, radius, font size and weight,
// fill structure and default stroke, from figma-structure.snapshot.json.
// A code fact the capture could not read reliably is "not comparable", never a difference.

import { pathHash } from './icon-source.mjs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveNamingSpec, tokenToVar, withTextScaleKeys } from './naming-convention.mjs';
import { sameValue } from './component-capture.mjs';
import { parseColor, colorHex } from './css-values.mjs';
import { projectPath } from './names.mjs';

export async function loadParityMaps(ROOT, cfg) {
  const p = resolve(ROOT, cfg.paths?.parityMap ?? projectPath(ROOT, 'map'));
  let m = {};
  if (existsSync(p)) { try { m = await import(pathToFileURL(p).href); } catch { /* optional */ } }
  return {
    EXPLICIT: m.EXPLICIT ?? {}, EXPLICIT_SIZING: m.EXPLICIT_SIZING ?? {},
    SKIP_TOKENS: m.SKIP_TOKENS ?? new Set(), NULL_TOKENS: m.NULL_TOKENS ?? new Set(), KNOWN_NULL: m.KNOWN_NULL ?? new Set(),
    SIZING_SKIP: m.SIZING_SKIP ?? new Map(), TYPO: m.TYPO ?? {},
  };
}

const toNum = (v) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };
const isColor = (v) => /^(#|rgba?\(|hsla?\(|oklch\(|oklab\(|color\(|transparent$)/i.test(String(v ?? '').trim());
const valueMatch = (a, b) => {
  const kind = isColor(a) || isColor(b) ? 'color' : 'height';
  return sameValue(kind, String(a).trim(), String(b).trim());
};

// Tokens: Figma value vs the code capture's resolved value for the mapped CSS var, per mode.
export function compareTokens(code, vars, cfg, maps) {
  const spec = resolveNamingSpec(cfg);
  const out = { match: 0, differ: [], missingInCode: [], notComparable: [], skipped: 0 };
  const settle = makeSettle(out);
  const check = (token, cssVar, mode, figmaValue) => {
    const fact = code.tokens?.[cssVar]?.modes?.[mode];
    if (!fact) { out.missingInCode.push({ token, cssVar, mode }); return; }
    if (fact.confidence === 'uncertain') { out.notComparable.push({ token, cssVar, mode, why: 'the code reading is uncertain' }); return; }
    const same = valueMatch(figmaValue, fact.value);
    if (same === null) out.notComparable.push({ token, cssVar, mode, figma: figmaValue, code: fact.value, why: 'values are not comparable' });
    else settle(same === true, { token, cssVar, mode, figma: figmaValue, code: fact.value, at: code.tokens[cssVar].declaredAt });
  };
  // Token names resolve exactly as Gate 3 resolves them: the trailing "/color" is dropped first
  // (when the naming convention drops it), then design-system-engine-map EXPLICIT, then the convention.
  const dropColor = (spec.dropSegments ?? []).includes('color');
  for (const [mode, tokens] of Object.entries(vars.color ?? {})) {
    for (const [key, value] of Object.entries(tokens ?? {})) {
      const token = dropColor ? key.replace(/\/color$/, '') : key;
      if (maps.SKIP_TOKENS.has(token) || maps.NULL_TOKENS.has(token) || value == null) { out.skipped++; continue; }
      const cssVar = Object.prototype.hasOwnProperty.call(maps.EXPLICIT, token) ? maps.EXPLICIT[token] : tokenToVar(token, spec);
      if (!cssVar) { out.skipped++; continue; }   // the project maps it to no variable on purpose
      check(token, cssVar, mode, value);
    }
  }
  const firstMode = Object.keys(code.tokens ? Object.values(code.tokens)[0]?.modes ?? {} : {})[0] ?? 'light';
  for (const [token, value] of Object.entries(vars.sizing ?? {})) {
    if (maps.SIZING_SKIP.has(token) || value == null) { out.skipped++; continue; }
    check(token, maps.EXPLICIT_SIZING[token] ?? tokenToVar(token, spec, { raw: true }), firstMode, value);
  }
  for (const [cssVar, [scale, prop]] of Object.entries(maps.TYPO)) {
    const value = vars.typography?.[scale]?.[prop];
    if (value == null) { out.skipped++; continue; }
    check(`typography/${scale}/${prop}`, cssVar, firstMode, value);
  }
  return out;
}

// A Figma colour token's CSS variable, resolved the way Gate 3 resolves it.
export function colorVarOf(token, spec, maps) {
  const dropColor = (spec.dropSegments ?? []).includes('color');
  const t = dropColor ? String(token).replace(/\/color$/, '') : token;
  return Object.prototype.hasOwnProperty.call(maps.EXPLICIT, t) ? maps.EXPLICIT[t] : tokenToVar(t, spec);
}
// A Figma paint ({ token, hex, opacity }) as the colour it draws in one mode, opacity included.
function paintIn(vars, mode, paint) {
  if (!paint) return null;
  const t = paint.token;
  const v = t ? (vars.color?.[mode]?.[t] ?? vars.color?.[mode]?.[String(t).replace(/\/color$/, '')] ?? vars.color?.[mode]?.[`${t}/color`]) : paint.hex;
  const c = parseColor(v);
  if (!c) return null;
  const a = c[3] * (typeof paint.opacity === 'number' ? paint.opacity : 1);
  return colorHex(`rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`);
}
const axesOf = (name) => Object.fromEntries(String(name).split(',').map((p) => p.split('=').map((x) => x.trim().toLowerCase())).filter((p) => p.length === 2));

// Every compared fact is also recorded, matching or not, as { key, figma, code, same }: the record of
// what both sides last agreed on (agreed.mjs, idea I47) is built from these.
const factValue = (v) => (v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v));
export function factOf(d) {
  return { key: d.token ? `token ${d.token} [${d.mode}]` : `${d.component} · ${d.field}`, figma: factValue(d.figmaValue ?? d.figma), code: factValue(d.code) };
}
function makeSettle(out) {
  out.facts ??= [];
  return (ok, d) => {
    out.facts.push({ ...factOf(d), same: !!ok, ...(d.component ? { component: d.component } : {}) });
    if (ok) out.match++; else out.differ.push(d);
  };
}

// What the measured comparison actually reached (idea I53), so a clean result is honest about its reach:
// per component, the facts compared, those that differ, and those not comparable with each reason; plus
// the components not captured at all. Takes any number of comparison results.
export function censusOf(...results) {
  const components = {};
  const row = (c) => (components[c] ??= { compared: 0, differ: 0, notComparable: 0, reasons: {} });
  const notCaptured = new Set();
  for (const r of results) {
    for (const f of r?.facts ?? []) if (f.component) { const x = row(f.component); x.compared++; if (!f.same) x.differ++; }
    for (const n of r?.notComparable ?? []) if (n.component) { const x = row(n.component); x.notComparable++; x.reasons[n.why] = (x.reasons[n.why] ?? 0) + 1; }
    for (const n of r?.notCaptured ?? []) notCaptured.add(n);
  }
  const all = Object.values(components);
  return {
    compared: all.reduce((k, x) => k + x.compared, 0),
    notComparable: all.reduce((k, x) => k + x.notComparable, 0),
    notCaptured: [...notCaptured].sort(),
    components: Object.fromEntries(Object.entries(components).sort(([a], [b]) => a.localeCompare(b))),
  };
}

// The census as report lines: one total, then the components with the most facts not comparable.
export function censusLines(c, top = 3) {
  const n = Object.keys(c.components).length;
  const lines = [`census: ${c.compared} facts compared on ${n} component${n === 1 ? '' : 's'} · ${c.notComparable} not comparable · ${c.notCaptured.length} component${c.notCaptured.length === 1 ? '' : 's'} not captured${c.notCaptured.length ? ` (${c.notCaptured.slice(0, 5).join(', ')}${c.notCaptured.length > 5 ? ', ...' : ''})` : ''}`];
  const worst = Object.entries(c.components).filter(([, x]) => x.notComparable).sort(([a, x], [b, y]) => y.notComparable - x.notComparable || a.localeCompare(b)).slice(0, top);
  for (const [name, x] of worst) {
    const [why, k] = Object.entries(x.reasons).sort(([a, p], [b, q]) => q - p || a.localeCompare(b))[0];
    lines.push(`least checked: ${name}, ${x.notComparable} not comparable of ${x.compared + x.notComparable} (mostly ${why}, ${k})`);
  }
  return lines;
}

// Components: each Figma structure field against the measured and traced code facts.
// An inset ring, as a box-shadow draws Figma's inside stroke (inset 0 0 0 1.5px, in either order Chrome or CSS
// writes it): → { width, color } when it is one, with a colour that shows; else null.
export function insetRingOf(shadow) {
  for (const one of String(shadow ?? '').split(/,(?![^(]*\))/)) {
    if (!/\binset\b/i.test(one)) continue;
    const color = (one.match(/(rgba?|hsla?|color-mix|oklch|lab|lch)\([^)]*(\([^)]*\)[^)]*)*\)|#[0-9a-f]{3,8}\b/i) ?? [''])[0];
    const lengths = one.replace(color, ' ').replace(/\binset\b/i, ' ').trim().split(/\s+/).filter(Boolean).map((x) => parseFloat(x));
    if (lengths.length !== 4 || lengths.some((n) => !Number.isFinite(n)) || lengths[0] || lengths[1] || lengths[2] || !(lengths[3] > 0)) continue;
    if (/^(transparent|rgba\([^)]*,\s*0\))$/i.test(color.replace(/\s+/g, ' '))) continue;
    return { width: lengths[3], color: color || 'currentcolor' };
  }
  return null;
}

export function compareComponents(code, structure, vars, cfg, maps) {
  const spec = resolveNamingSpec(cfg);
  const sizeVar = (t) => (t ? maps.EXPLICIT_SIZING[t] ?? tokenToVar(t, spec, { raw: true }) : null);
  const out = { match: 0, differ: [], notComparable: [], notCaptured: [] };
  const settle = makeSettle(out);
  const push = (comp, field, figma, fact, extra = {}) => {
    if (!fact || fact.confidence === 'not-read' || fact.confidence === 'uncertain') {
      out.notComparable.push({ component: comp, field, figma, why: fact?.why ?? (fact?.confidence === 'uncertain' ? 'the code reading is uncertain' : 'not read in code') });
      return;
    }
    const byVar = extra.expectedVar && fact.var === extra.expectedVar;
    const byValue = extra.figmaValue != null ? valueMatch(extra.figmaValue, fact.value) : null;
    settle(byVar || byValue === true, { component: comp, field, figma, figmaValue: extra.figmaValue ?? undefined, code: fact.value, codeVar: fact.var ?? null, expectedVar: extra.expectedVar ?? undefined, ...(extra.suggestVar ? { suggestVar: extra.suggestVar } : {}), rule: fact.rule, at: fact.at, confidence: fact.confidence });
  };
  for (const [name, f] of Object.entries(structure ?? {})) {
    const c = code.components?.[name];
    if (!c) { out.notCaptured.push(name); continue; }
    const low = c.confidence === 'low' || c.confidence === 'static-only';   // no measured box or fill
    // Height: only where the code fixes it (a height or min-height rule). Otherwise the code's
    // height follows its content, and Figma's h is just the height of its sample frame.
    // A fixed height is compared as the drawn box; a min-height (which lets content grow the box)
    // is compared as its own declared value.
    if (f.h != null) {
      const h = c.props?.height, mh = c.props?.minHeight;
      const setsHeight = h?.rule && h.confidence !== 'default' && toNum(h.value) > 0 && !/min-height|max-height/.test(h.note ?? '');
      const setsMin = mh?.rule && mh.confidence !== 'default' && toNum(mh.value) > 0;
      if (setsHeight && f.sizingV === 'FILL') {
        // Figma fills its container, and the code fixes a height of its own: the product's container no longer decides.
        settle(false, { component: name, field: 'height', figma: 'fills its container', code: toNum(h.value), rule: h.rule, at: h.at, why: 'figma-fill-code-fixed' });
      } else if (setsHeight && c.size?.height != null) {
        // The rule already says Figma's height and the drawn box is still another: say why, so the fix is not "set
        // the height" again. An inline element ignores a height; with content-box sizing, padding and border add to it.
        const display = String(c.layout?.display ?? ''), sizing = String(c.layout?.boxSizing ?? '');
        const edges = ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((n, k) => n + (toNum(c.props?.[k]?.value) || 0), 0);
        const why = Math.abs(toNum(h.value) - f.h) < 0.5 && Math.abs(c.size.height - f.h) >= 0.5
          ? (display === 'inline' ? 'inline' : sizing === 'content-box' && edges > 0 ? 'content-box' : null) : null;
        settle(Math.abs(c.size.height - f.h) < 0.5, { component: name, field: 'height', figma: f.h, code: c.size.height, rule: h.rule, at: h.at, ...(why ? { why } : {}) });
      } else if (setsMin) {
        // Figma's own minimum when the snapshot has it (minH; null: none), else its frame's height as before.
        const want = 'minH' in f ? f.minH : f.h;
        if (want == null) settle(false, { component: name, field: 'min height', figma: 'none', code: toNum(mh.value), rule: mh.rule, at: mh.at, why: 'figma-no-min' });
        else settle(Math.abs(toNum(mh.value) - want) < 0.5, { component: name, field: 'min height', figma: want, code: toNum(mh.value), rule: mh.rule, at: mh.at });
      } else {
        // No rule fixes it: the code's height follows its content. What Figma says decides the comparison (sizingV, the
        // Default variant's vertical sizing; h 'auto' in an older snapshot is a hug):
        //  · Figma fixes it: the height the browser draws is compared with Figma's, a difference when they differ;
        //  · Figma hugs too: both let the content decide, which agrees; a horizontal row's drawn height does not depend
        //    on how many items it holds, so it is compared with Figma's as well (a vertical stack grows with its items,
        //    and Figma's sample holds its own number of them, so its drawn height is not);
        //  · Figma fills its container: a CSS height left to the page fills the container the product gives it (a flex or
        //    grid parent stretches it), which agrees; Figma's sample height is only the frame it was drawn in;
        //  · the snapshot does not say: not comparable, with the refresh that makes it so.
        const sizing = f.sizingV ?? (f.h === 'auto' ? 'HUG' : null);
        const drawn = c.size?.height;
        if (sizing === 'FIXED') {
          if (drawn != null) settle(Math.abs(drawn - f.h) < 0.5, { component: name, field: 'height', figma: f.h, code: drawn, why: 'figma-fixed-code-hugs' });
          else out.notComparable.push({ component: name, field: 'height', figma: f.h, why: 'Figma fixes the height and no browser drew the code' });
        } else if (sizing === 'HUG') {
          settle(true, { component: name, field: 'height sizing', figma: 'follows its content', code: 'follows its content' });
          // A slot's content is a product's, so Figma's sample height says nothing about the component's own.
          if ((f.layout ?? 'HORIZONTAL') === 'HORIZONTAL' && typeof f.h === 'number' && !f.slot) {
            if (drawn != null) settle(Math.abs(drawn - f.h) < 0.5, { component: name, field: 'height (drawn)', figma: f.h, code: drawn });
            else out.notComparable.push({ component: name, field: 'height (drawn)', figma: f.h, why: 'no browser drew the code' });
          }
        } else if (sizing === 'FILL') settle(true, { component: name, field: 'height sizing', figma: 'fills its container', code: 'set by its container' });
        else out.notComparable.push({ component: name, field: 'height', figma: f.h, why: 'Figma\'s sizing is not in the structure snapshot (refresh it: sizingV)' });
      }
    }
    const tokenValue = (t) => (t ? vars.sizing?.[t] ?? null : null);
    // The design's default variant has a label; if every instance in the code is icon-only, its
    // padding belongs to the icon-only variant and says nothing about the labelled one.
    const iconOnly = c.instance && c.instance.hasText === false && f.fontSizeVar;
    const pad = (x) => (iconOnly ? { confidence: 'not-read', why: 'only icon-only instances were found; the design default has a label' } : x);
    // Padding: both sides of each axis (a component padded on one side only is a difference).
    const bothSides = (label, token, [a, b]) => {
      if (!token) return;
      const extra = { expectedVar: sizeVar(token), figmaValue: tokenValue(token) };
      const fa = pad(c.props?.[a]), fb = pad(c.props?.[b]);
      const bad = [fa, fb].find((x) => x && x.confidence !== 'not-read' && x.confidence !== 'uncertain' && !(x.var === extra.expectedVar || valueMatch(extra.figmaValue, x.value) === true));
      push(name, label, token, bad ?? fa, extra);
    };
    bothSides('padding (left/right)', f.paddingVar?.lr, ['paddingLeft', 'paddingRight']);
    bothSides('padding (top/bottom)', f.paddingVar?.tb, ['paddingTop', 'paddingBottom']);
    const gp = c.parts?.gap?.props ?? c.props;
    if (f.gapVar) {
      const g = [gp?.columnGap, gp?.rowGap].find((x) => x?.var === sizeVar(f.gapVar) || valueMatch(tokenValue(f.gapVar), x?.value) === true) ?? gp?.columnGap;
      push(name, 'gap', f.gapVar, g, { expectedVar: sizeVar(f.gapVar), figmaValue: tokenValue(f.gapVar) });
    }
    if (f.innerRadiusVar) {
      // A fill drawn on ::before carries the radius there.
      const r = c.parts?.radius?.props?.borderTopLeftRadius
        ?? (f.fillStructure === 'before' && c.before && toNum(c.before.borderTopLeftRadius) > 0 ? { value: c.before.borderTopLeftRadius, confidence: 'verified' } : c.props?.borderTopLeftRadius);
      // Every corner: a component rounded on some corners only is a difference (unless Figma's
      // radius itself lives on ::before, where the top-left corner stands for the layer).
      const extra = { expectedVar: sizeVar(f.innerRadiusVar), figmaValue: tokenValue(f.innerRadiusVar) };
      const corners = c.parts?.radius?.props ?? c.props ?? {};
      const others = r === c.props?.borderTopLeftRadius || r === c.parts?.radius?.props?.borderTopLeftRadius
        ? ['borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((k) => corners[k]).filter(Boolean) : [];
      const bad = [r, ...others].find((x) => x && x.confidence !== 'not-read' && x.confidence !== 'uncertain' && !(x.var === extra.expectedVar || valueMatch(extra.figmaValue, x.value) === true));
      push(name, 'radius', f.innerRadiusVar, bad ?? r, extra);
    }
    const ty = (k) => vars.typography?.[k] ?? null;
    // Font: Figma's font fields describe the component's first TEXT node, so the code side is the
    // contract's fontSel part, else the first element holding text, else the root.
    const fp = c.parts?.font?.props ?? c.parts?.text?.props ?? c.props;
    // The project's own variable for a text-style field (design-system-engine-map TYPO), proposed in a hand-back patch.
    const typoVar = (scale, prop) => Object.entries(maps.TYPO ?? {}).find(([, [sc, pr]]) => sc === scale && pr === prop)?.[0];
    if (f.fontSizeVar && ty(f.fontSizeVar)) push(name, 'font size', f.fontSizeVar, fp?.fontSize, { figmaValue: ty(f.fontSizeVar).size, suggestVar: typoVar(f.fontSizeVar, 'size') });
    if (f.fontWeightVar && ty(f.fontWeightVar)) push(name, 'font weight', f.fontWeightVar, fp?.fontWeight, { figmaValue: ty(f.fontWeightVar).weight });
    // Line height from the same text style (a unitless line height is a multiple of the font size).
    const lhText = f.text?.lineHeight;   // { unit: 'PIXELS' | 'PERCENT' | 'AUTO', value } from the extended capture
    const lhFig = lhText && lhText.unit !== 'AUTO'
      ? (lhText.unit === 'PERCENT' ? `${(lhText.value / 100) * toNum(fp?.fontSize?.value)}px` : `${lhText.value}px`)
      : (f.fontSizeVar ? ty(f.fontSizeVar)?.lh : null);
    // A line height inherited from a page-level rule (html, body, :root, *) is the page's, not the
    // component's, so it is not compared.
    const pageLevel = pageLevelRule;
    if (lhFig && fp?.lineHeight && fp.lineHeight.confidence !== 'default' && !(fp.lineHeight.inherited && pageLevel(fp.lineHeight.rule))) {
      const lh = fp.lineHeight, fs = toNum(fp.fontSize?.value);
      const px = /^[\d.]+$/.test(String(lh.value).trim()) && fs ? `${toNum(lh.value) * fs}px` : lh.value;
      push(name, 'line height', f.fontSizeVar, { ...lh, value: px }, { figmaValue: lhFig, suggestVar: lhText && lhText.unit !== 'AUTO' ? undefined : typoVar(f.fontSizeVar, 'lh') });
    }
    // Stroke. Figma's root stroke can be drawn on an inner layer in code, and a border can be
    // reserved for a hover state, so only the clear cases are compared: Figma strokes the default
    // variant and the code draws no visible border at all, or Figma names the sides (strokeSides)
    // and the code draws others. Borders Figma never draws are the phantom-border check's job.
    // A root that draws nothing at all (no border, no background, no radius) is a wrapper: the box
    // Figma strokes is a child element in code. That is a naming gap, not a design difference.
    const drawsNothing = ['Top', 'Right', 'Bottom', 'Left'].every((s) => toNum(c.props?.[`border${s}Width`]?.value) === 0)
      && /^(transparent|rgba\([^)]*,\s*0\))$/i.test(String(c.props?.backgroundColor?.value ?? 'transparent').trim())
      && toNum(c.props?.borderTopLeftRadius?.value) === 0;
    // The side a stroke is read on: the first side the code draws, a side Figma draws first. A stroke on one side only
    // (a bottom rule) is read on that side, never through the top, whose colour is the text's when it draws nothing.
    const SIDES = ['Top', 'Right', 'Bottom', 'Left'];
    const codeSides = SIDES.filter((s) => toNum(c.props?.[`border${s}Width`]?.drawn ?? c.props?.[`border${s}Width`]?.value) > 0);
    const figmaSides = Array.isArray(f.stroke?.weights) ? SIDES.filter((s, i) => f.stroke.weights[i] > 0) : [];
    const strokeSide = figmaSides.find((s) => codeSides.includes(s)) ?? codeSides[0] ?? 'Top';
    const strokeKey = c.props?.[`border${strokeSide}Color`] ? `border${strokeSide}Color` : 'borderTopColor';   // a capture from before every side was read
    if (f.strokeOnDefault === true && !low && c.props?.borderTopWidth && !c.before && drawsNothing) {
      out.notComparable.push({ component: name, field: 'stroke', figma: 'draws a border', why: 'the code root draws nothing (a wrapper); name the part that draws the box in componentSelectors or the contract' });
    } else if (f.strokeOnDefault === true && !low && c.props?.borderTopWidth && !c.before) {
      const visible = (s) => { const w = c.props?.[`border${s}Width`]; return !!w && toNum(w.drawn ?? w.value) > 0; };
      // A stroke drawn inside the box, as Figma draws an inside stroke: an inset ring (box-shadow: inset 0 0 0 1.5px …)
      // is a border on every side, in the ring's colour.
      const insetRing = !!insetRingOf(c.props?.boxShadow?.value);
      const colorSeen = insetRing || !/^(transparent|rgba\([^)]*,\s*0\))$/i.test(String(c.props?.[strokeKey]?.value ?? '').replace(/\s+/g, ' ').trim());
      const drawn = insetRing && !['Top', 'Right', 'Bottom', 'Left'].some(visible) ? ['top', 'right', 'bottom', 'left'] : ['Top', 'Right', 'Bottom', 'Left'].filter(visible).map((s) => s.toLowerCase());
      const named = f.strokeSides && !['all', 'none'].includes(f.strokeSides) ? [f.strokeSides] : null;
      const ok = named ? drawn.length === named.length && named.every((s) => drawn.includes(s)) : (drawn.length > 0 && colorSeen);
      settle(ok, { component: name, field: 'stroke', figma: named ? `border on ${named.join(', ')}` : 'draws a border', code: drawn.length && colorSeen ? `border on ${drawn.length === 4 ? 'all sides' : drawn.join(', ')}` : 'no visible border', rule: c.props?.[`border${strokeSide}Width`]?.rule, at: c.props?.[`border${strokeSide}Width`]?.at });
    }
    // Deeper facts from the extended Step 1c capture (present when the snapshot has them).
    // Width: a component Figma sizes FIXED must have its width fixed in code too.
    if (f.box?.sizing?.h === 'FIXED' && typeof f.box.width === 'number' && !low) {
      const w = c.props?.width;
      // A main component on the canvas always reads FIXED (FILL needs an auto-layout parent): a code width relative to
      // its container (width: 100%) is the page's, and what the page draws is not the component's to compare.
      if (!w?.rule) out.notComparable.push({ component: name, field: 'width', figma: f.box.width, why: 'the code width follows its content or container' });
      else if (RELATIVE_SIZE.test(String(w.declared ?? ''))) out.notComparable.push({ component: name, field: 'width', figma: f.box.width, why: `the code width follows its container (${w.declared})` });
      else settle(Math.abs((c.size?.width ?? toNum(w.value)) - f.box.width) < 0.5, { component: name, field: 'width', figma: f.box.width, code: c.size?.width ?? toNum(w.value), rule: w.rule, at: w.at });
    }
    // Stroke weight per side, when Figma records it: each side's width, not only whether it draws.
    if (Array.isArray(f.stroke?.weights) && !low && c.props?.borderTopWidth && !drawsNothing) {
      ['Top', 'Right', 'Bottom', 'Left'].forEach((s, i) => {
        const want = f.stroke.weights[i], got = c.props?.[`border${s}Width`];
        if (typeof want !== 'number' || !got) return;
        const drawnPx = toNum(got.drawn ?? got.value), declPx = toNum(got.value);
        settle(Math.abs(declPx - want) < 0.01 || Math.abs(drawnPx - want) < 0.01, { component: name, field: `border ${s.toLowerCase()} width`, figma: want, code: got.value, rule: got.rule, at: got.at });
      });
    }
    // Root opacity.
    if (typeof f.opacity === 'number' && f.opacity < 1 && c.props?.opacity) push(name, 'opacity', String(f.opacity), c.props.opacity, { figmaValue: String(f.opacity) });
    // Text: family, letter spacing, text case and line height as Figma records them on the text node.
    if (f.text && fp) {
      const fs = toNum(fp.fontSize?.value);
      const fam = String(fp.fontFamily?.value ?? '').split(',')[0].trim().replace(/^['"]|['"]$/g, '');
      if (f.text.fontFamily && fam) {
        settle(fam.toLowerCase() === String(f.text.fontFamily).toLowerCase(), { component: name, field: 'font family', figma: f.text.fontFamily, code: fam, rule: fp.fontFamily?.rule, at: fp.fontFamily?.at });
      }
      const ls = f.text.letterSpacing;
      if (ls && fp.letterSpacing && fs) {
        const want = ls.unit === 'PERCENT' ? (ls.value / 100) * fs : ls.value;
        const got = /normal/i.test(fp.letterSpacing.value) ? 0 : toNum(fp.letterSpacing.value);
        settle(Math.abs(got - want) < 0.05, { component: name, field: 'letter spacing', figma: `${+want.toFixed(2)}px`, code: fp.letterSpacing.value, rule: fp.letterSpacing.rule, at: fp.letterSpacing.at });
      }
      const CASE = { UPPER: 'uppercase', LOWER: 'lowercase', TITLE: 'capitalize', ORIGINAL: 'none' };
      if (f.text.textCase && CASE[f.text.textCase] && fp.textTransform) {
        settle(String(fp.textTransform.value) === CASE[f.text.textCase], { component: name, field: 'text case', figma: CASE[f.text.textCase], code: fp.textTransform.value, rule: fp.textTransform.rule, at: fp.textTransform.at });
      }
    }

    // Per state: height, stroke and opacity Figma records for each variant, against the state the
    // capture produced (labels matched without case or spaces: "State=hover" = "State=Hover").
    const key = (s) => String(s).toLowerCase().replace(/\s+/g, '');
    const states = Object.fromEntries(Object.entries(c.states ?? {}).map(([k, v]) => [key(k), v]));
    // A state the contract writes on a part (a checkbox's box) changes that part, not the component's height: Figma's
    // variant height is the whole component's, so it is compared with the component as drawn.
    const rootClasses = (String(c.selector ?? '').trim().split(/\s+/).pop().match(/\.[\w-]+/g) ?? []);
    const onRoot = (sel) => { if (!sel) return true; const last = String(sel).trim().split(/\s*[\s>+~]\s*/).pop().match(/\.[\w-]+/g) ?? []; return rootClasses.every((k) => last.includes(k)); };
    for (const [variant, h] of Object.entries(f.variantHeight ?? {})) {
      const st = states[key(variant)];
      if (!st || typeof h !== 'number') continue;
      if (!onRoot(st.selector)) {
        if (c.size?.height != null) settle(Math.abs(c.size.height - h) < 0.5, { component: name, field: `height (${variant})`, figma: h, code: c.size.height, why: 'drawn' });
        continue;
      }
      const hh = st.changed?.height ?? st.changed?.minHeight;
      if (!hh || !hh.rule) continue;                       // same as the default, or only its content's height
      settle(Math.abs(toNum(hh.value) - h) < 0.5, { component: name, field: `height (${variant})`, figma: h, code: toNum(hh.value), rule: hh.rule, at: hh.at });
    }
    // The fill's own opacity (a Background layer at 8%, or a paint's opacity), against the alpha the code paints its
    // background with, divided by the alpha of the variable it paints: a tint drawn with color-mix or opacity is
    // compared as Figma draws it. Default first, then each variant Figma records, against the state the capture produced.
    if (!low && !/\(style attribute\)/.test(String(c.props?.backgroundColor?.rule ?? '')) && ['direct', 'before'].includes(c.fill)) {
      const firstM = Object.keys(c.colors ?? {})[0];
      const varAlpha = (v) => { const t = v ? parseColor(code.tokens?.[v]?.modes?.[firstM]?.value) : null; return t ? t[3] : 1; };
      const fillAlpha = (bg, v) => { const d = parseColor(bg); return d && varAlpha(v) > 0 ? Math.round((d[3] / varAlpha(v)) * 100) / 100 : null; };
      const bgOf = (col) => (c.fill === 'before' ? col?.beforeBackground : col?.backgroundColor);
      const baseFact = c.props?.backgroundColor;
      const one = (field, want, bg, fact) => {
        const got = fillAlpha(bg, fact?.var);
        if (got == null || typeof want !== 'number') return;
        settle(Math.abs(got - want) < 0.015, { component: name, field, figma: want, code: got, codeVar: fact?.var ?? null, rule: fact?.rule, at: fact?.at, why: 'tint-opacity' });
      };
      if (typeof f.fillOpacity === 'number') one('background opacity', f.fillOpacity, bgOf(c.colors?.[firstM]), baseFact);
      for (const [variant, op] of Object.entries(f.variantFillOpacity ?? {})) {
        const st = states[key(variant)];
        if (!st || /^found/i.test(String(st.produced ?? ''))) continue;
        const fact = st.changed?.backgroundColor ?? baseFact;
        one(`background opacity (${variant})`, op, st.colors?.[firstM] ? bgOf(st.colors[firstM]) : fact?.value, fact);
      }
    }
    for (const [variant, op] of Object.entries(f.variantOpacity ?? {})) {
      const st = Object.entries(states).find(([k]) => k.includes(key(variant)))?.[1];
      const o = st?.changed?.opacity ?? null;
      if (!st || typeof op !== 'number') continue;
      const got = o ? toNum(o.value) : toNum(c.props?.opacity?.value ?? 1);
      settle(Math.abs(got - op) < 0.01, { component: name, field: `opacity (${variant})`, figma: op, code: got, rule: o?.rule, at: o?.at });
    }
    // Colours, from the extended Step 1c capture (colors: { fill, text, stroke }, each a paint with its
    // token, hex and opacity): the colour rendered in every mode against the token's value in that
    // mode, the paint's opacity included. The token's own variable in code is a match by itself.
    const inlineFill = /\(style attribute\)/.test(String(c.props?.backgroundColor?.rule ?? ''));
    const textFact = c.parts?.text?.props?.color ?? c.props?.color;
    const firstMode = Object.keys(c.colors ?? {})[0];
    const textInherits = !c.parts?.text?.props?.color || c.parts.text.props.color.value === c.colors?.[firstMode]?.color;
    const colourChecks = (label, paints, perMode, suffix = '', changed = {}) => {
      const slots = [
        ['fill', 'background', (col) => (c.fill === 'before' ? col.beforeBackground : col.backgroundColor), c.props?.backgroundColor],
        ['text', 'text colour', (col, m) => (m === firstMode && !suffix ? textFact?.value : textInherits ? col.color : null), textFact],
        ['stroke', 'border colour', (col) => col[strokeKey] ?? col.borderTopColor, c.props?.[strokeKey]],
      ];
      for (const [slot, field, pick, fact] of slots) {
        const paint = paints?.[slot];
        if (!paint) continue;
        if (slot === 'fill' && (inlineFill || !['direct', 'before'].includes(c.fill))) continue;   // painting at all is the background check's job
        if (slot === 'stroke' && drawsNothing) continue;                                          // drawing at all is the stroke check's job
        for (const [mode, col] of Object.entries(perMode ?? {})) {
          const want = paintIn(vars, mode, paint), got = col && pick(col, mode);
          if (!want || !got) continue;
          const expectedVar = paint.token && !suffix ? colorVarOf(paint.token, spec, maps) : undefined;
          const src = changed[{ fill: 'backgroundColor', text: 'color', stroke: strokeKey }[slot]] ?? fact;
          push(name, `${field}${suffix} [${mode}]`, paint.token ?? paint.hex, { ...(src ?? {}), value: got, confidence: src?.confidence ?? 'single-source' }, { expectedVar, figmaValue: want });
        }
      }
    };
    if (!low) colourChecks('', f.colors, c.colors);

    // Per variant, from the extended capture (variants: { "State=Hover, Size=M": { paddingPx, gapPx,
    // radiusPx, fontSize, colors } }): only what the variant changes from the default variant is
    // compared, against the state the capture produced with the same axis value.
    if (f.variants && !low) {
      const defAxes = axesOf(f.defaultVariant ?? '');
      const vfor = (label) => {
        const want = axesOf(label);
        const all = Object.entries(f.variants).filter(([v]) => { const a = axesOf(v); return Object.entries(want).every(([k, x]) => a[k] === x); });
        // Only a variant whose other axes are the default's: one that also changes another axis (Size=L
        // for an Icon=True state) is a combination, compared as one (I41), not against a single state.
        const exact = all.find(([v]) => Object.entries(axesOf(v)).every(([k, x]) => k in want || defAxes[k] === x));
        return (exact ?? (Object.keys(defAxes).length ? null : all[0]))?.[1];
      };
      const def = f.variants[f.defaultVariant] ?? { paddingPx: f.paddingPx, radiusPx: f.radiusPx, colors: f.colors };
      const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
      const setsHeight = [c.props?.height, c.props?.minHeight].some((x) => x?.rule && x.confidence !== 'default');
      const lower = (a) => new Set((a ?? []).map((x) => String(x).toLowerCase()));
      const layerCheck = (label, figLayers, codeLayers, known) => {
        if (!Array.isArray(figLayers) || !codeLayers) return;
        const fig = lower(figLayers);
        for (const [part, shown] of Object.entries(codeLayers)) {
          if (!known.has(part.toLowerCase())) continue;       // Figma has no layer by that name
          const want = fig.has(part.toLowerCase());
          settle(want === shown, { component: name, field: `layer "${part}"${label ? ` (${label})` : ''}`, figma: want ? 'shown' : 'hidden', code: shown ? 'shown' : 'hidden', confidence: 'single-source' });
        }
      };
      const knownLayers = lower(Object.values(f.variants).flatMap((v) => v.layers ?? []));
      layerCheck('', def.layers, c.layers, knownLayers);
      const compareVariant = (label, st, v) => {
        if (!v) return;
        const now = (prop) => st.changed?.[prop] ?? c.props?.[prop];
        const num = (fig, fact, field) => {
          if (typeof fig !== 'number' || !fact) return;
          const got = toNum(fact.value);
          settle(Math.abs(got - fig) < 0.5, { component: name, field: `${field} (${label})`, figma: fig, code: fact.value, rule: fact.rule, at: fact.at, confidence: fact.confidence });
        };
        if (!same(v.paddingPx, def.paddingPx)) ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'].forEach((p, i) => num(v.paddingPx?.[i], now(p), p.replace('padding', 'padding ').toLowerCase()));
        // One radius, however many corners set it: the first corner that differs stands for the rest, as on the default.
        if (!same(v.radiusPx, def.radiusPx)) {
          const corners = ['borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius'].map((p, i) => [v.radiusPx?.[i], now(p)]).filter(([fig, fact]) => typeof fig === 'number' && fact);
          const wrong = corners.find(([fig, fact]) => !(Math.abs(toNum(fact.value) - fig) < 0.5));
          if (corners.length) num(...(wrong ?? corners[0]), 'radius');
        }
        if (!same(v.gapPx, def.gapPx)) num(v.gapPx, now('columnGap'), 'gap');
        if (!same(v.fontSize, def.fontSize)) num(v.fontSize, st.changed?.fontSize ?? fp?.fontSize, 'font size');
        // Height, only where the code fixes one (otherwise it follows the content).
        if (typeof v.h === 'number' && !same(v.h, def.h) && (setsHeight || st.changed?.height?.rule || st.changed?.minHeight?.rule) && st.size?.height != null)
          num(v.h, { ...(st.changed?.height ?? st.changed?.minHeight ?? c.props?.height ?? {}), value: `${st.size.height}px` }, 'height');
        const changedPaints = Object.fromEntries(['fill', 'text', 'stroke'].filter((k) => v.colors?.[k] && !same(v.colors[k], def.colors?.[k])).map((k) => [k, v.colors[k]]));
        if (Object.keys(changedPaints).length && st.colors) colourChecks('', changedPaints, st.colors, ` (${label})`, st.changed ?? {});
        if (!same(v.layers, def.layers)) layerCheck(label, v.layers, st.layers, knownLayers);
      };
      for (const [label, st] of Object.entries(c.states ?? {})) compareVariant(label, st, vfor(label));
      // Combinations of two or more axes, measured by the capture as one (idea I41).
      for (const [variant, st] of Object.entries(c.combos ?? {})) compareVariant(variant, st, f.variants[variant]);
    }

    // Disabled wins (I40): hover or press must not change a disabled component. The capture put the
    // disabled state on with :hover (and :active) forced; any visible change is a missing guard.
    const LABEL = { color: 'text colour', backgroundColor: 'background', borderTopColor: 'border colour', opacity: 'opacity' };
    for (const g of c.disabledGuard ?? []) {
      if (g.unreachable) continue;   // the user cannot hover or press it: nothing to guard
      const props = Object.keys(g.changed ?? {});
      const first = g.changed?.[props[0]];
      settle(!props.length, { component: name, field: `${g.force} while disabled (${g.state})`, figma: 'no change', code: props.length ? `changes ${props.map((p) => LABEL[p] ?? p).join(', ')}` : 'no change', rule: first?.rule, at: first?.at, confidence: 'single-source' });
    }

    // Background: does the component paint one? Figma often draws it on a child layer and code on the
    // element itself; both paint. Only "paints" vs "does not paint" is a difference.
    // A colour set in the element's own style attribute is page content (a swatch showing its colour),
    // not the component's design, so it is not compared.
    if (f.fillStructure && !low && !inlineFill) {
      const paints = (x) => x === 'direct' || x === 'before';
      settle(paints(f.fillStructure) === paints(c.fill), { component: name, field: 'background', figma: paints(f.fillStructure) ? 'paints a background' : 'no background', code: paints(c.fill) ? 'paints a background' : 'no background', rule: c.props?.backgroundColor?.rule, at: c.props?.backgroundColor?.at });
    }
  }
  return out;
}

// Breakpoints: a component's responsive tokens (the sizing tokens the Figma breakpoint collection
// changes per mode) against what the code capture measured at that breakpoint's width.
export function compareBreakpoints(code, structure, vars) {
  const out = { match: 0, differ: [] };
  const settle = makeSettle(out);
  const bp = vars.breakpoints ?? {};
  if (!Object.keys(bp).length) return out;
  for (const [name, f] of Object.entries(structure ?? {})) {
    const c = code.components?.[name];
    if (!c?.breakpoints) continue;
    const fields = [
      ['padding (top)', f.paddingVar?.tb, 'paddingTop'], ['padding (left)', f.paddingVar?.lr, 'paddingLeft'],
      ['gap', f.gapVar, 'columnGap'], ['radius', f.innerRadiusVar, 'borderTopLeftRadius'],
    ];
    for (const [mode, tokens] of Object.entries(bp)) {
      const at = c.breakpoints[mode];
      if (!at) continue;
      for (const [field, token, prop] of fields) {
        if (!token || tokens[token] == null || at[prop] == null) continue;   // not a responsive token
        const same = valueMatch(tokens[token], at[prop]);
        if (same !== null) settle(same === true, { component: name, field: `${field} @ ${mode} (${at.width}px)`, figma: token, figmaValue: tokens[token], code: at[prop], rule: c.props?.[prop]?.rule, at: c.props?.[prop]?.at });
      }
    }
  }
  return out;
}

// Every variant built: each axis value Figma defines (from the extended capture's variants) must be
// the default's, or a state the code capture produced or found declared in code. Axis values are
// checked one by one, not every combination: code realizes axes independently (a class per value).
export function compareVariants(code, structure) {
  const out = { built: 0, missing: [], notCaptured: [] };
  for (const [name, f] of Object.entries(structure ?? {})) {
    if (!f?.variants) continue;
    const c = code.components?.[name];
    if (!c) { out.notCaptured.push(name); continue; }
    const def = axesOf(f.defaultVariant ?? '');
    const known = new Set([...Object.keys(c.states ?? {}), ...(c.statesNotProduced ?? []).map((x) => x.state)].flatMap((l) => Object.entries(axesOf(l)).map(([k, v]) => `${k}=${v}`)));
    const values = new Set(Object.keys(f.variants).flatMap((v) => Object.entries(axesOf(v)).map(([k, x]) => `${k}=${x}`)));
    // Matched without letter case (a class realizes Size=Large as .large), reported with Figma's own names.
    const asWritten = new Map(Object.keys(f.variants).flatMap((v) => String(v).split(',').map((p) => p.split('=').map((x) => x.trim())).filter((p) => p.length === 2).map(([k, x]) => [`${k.toLowerCase()}=${x.toLowerCase()}`, [k, x]])));
    for (const kv of values) {
      const [k, v] = kv.split('=');
      if (def[k] === v || known.has(kv)) out.built++;
      else { const [axis, value] = asWritten.get(kv) ?? [k, v]; out.missing.push({ component: name, axis, value }); }
    }
  }
  return out;
}

// Icons: each Figma icon (figma-icons.snapshot.json, keyed by sprite id) against the code's symbol of
// the same id, by viewBox and path data. Code-only symbols are counted (they may be app icons).
export function compareIcons(code, figmaIcons) {
  const out = { match: 0, differ: [], missingInCode: [], codeOnly: 0 };
  const icons = code.icons ?? {};
  for (const [id, f] of Object.entries(figmaIcons ?? {})) {
    if (id.startsWith('_') || !f || typeof f !== 'object' || Array.isArray(f)) continue;   // an inventory list is not an icon
    const c = icons[id];
    if (!c) { out.missingInCode.push(id); continue; }
    const diffs = [];
    if (f.viewBox && c.viewBox && f.viewBox !== c.viewBox) diffs.push(`viewBox Figma ${f.viewBox}, code ${c.viewBox}`);
    if (Array.isArray(f.paths) && pathHash(f.paths) !== c.pathHash) diffs.push(`path data differs (Figma ${f.paths.length} path(s), code ${c.paths})`);
    if (diffs.length) out.differ.push({ id, what: diffs.join(' · '), at: c.definedAt?.[0] });
    else out.match++;
  }
  out.codeOnly = Object.keys(icons).filter((id) => !(id in (figmaIcons ?? {}))).length;
  return out;
}

// Nesting: the sub-components Figma nests in each component (component-composition.snapshot.json)
// against what the code nests (rendered page or source). A parent never seen in the code is not
// comparable; a child Figma nests that the code never shows inside it is a difference.
export function compareNesting(code, composition) {
  const out = { match: 0, differ: [], notComparable: [], codeOnly: [] };
  const nest = code.nesting ?? {};
  const skip = (n) => /^icon[-/ ]/i.test(n) || String(n).startsWith('.');
  for (const [parent, list] of Object.entries(composition ?? {})) {
    if (parent.startsWith('_') || !Array.isArray(list)) continue;
    const kids = list.filter((k) => k !== parent && !skip(k));
    if (!kids.length) continue;
    const seen = nest[parent];
    if (!seen) { out.notComparable.push({ parent, why: 'not seen in the code' }); continue; }
    for (const k of kids) {
      if (seen.contains?.[k]) out.match++;
      else out.differ.push({ parent, child: k, figma: 'nests it', code: seen.instancesSeen ? `not inside any of ${seen.instancesSeen} rendered instance(s)` : 'not in its source' });
    }
    for (const k of Object.keys(seen.contains ?? {})) if (!kids.includes(k) && !skip(k)) out.codeOnly.push({ parent, child: k });
  }
  return out;
}

export async function compareCapture(ROOT, cfg, code, { readJSON }) {
  const vars = readJSON(resolve(ROOT, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json')) ?? {};
  const structure = withTextScaleKeys(readJSON(resolve(ROOT, cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json'))?.components ?? {});
  const figmaIcons = cfg.paths?.snapshotIcons ? readJSON(resolve(ROOT, cfg.paths.snapshotIcons)) : null;
  const composition = readJSON(resolve(ROOT, 'component-composition.snapshot.json'));
  const maps = await loadParityMaps(ROOT, cfg);
  return {
    tokens: compareTokens(code, vars, cfg, maps),
    components: compareComponents(code, structure, vars, cfg, maps),
    ...(figmaIcons ? { icons: compareIcons(code, figmaIcons) } : {}),
    ...(composition ? { nesting: compareNesting(code, composition) } : {}),
  };
}

// One line a person can act on: which value to write, and where. A reading from one source only
// (the browser or the stylesheet, not both) says so, since it has not been confirmed.
// A global rule (html, body, :root, *): the value is the page's reset, not the component's own. The fix
// is a declaration on the component's own rule, never an edit of the reset (it would change every element).
const RELATIVE_SIZE = /%|\b(auto|stretch|fit-content|min-content|max-content|-webkit-fill-available)\b|\d(d|s|l)?v(w|h|i|b|min|max)\b/i;
export const pageLevelRule = (r) => /^(html|body|:root|\*)(\s*,\s*(html|body|:root|\*))*$/i.test(String(r ?? '').trim());

export function measuredLine(d, moved = null) {
  const plain = typeof d.figma === 'number' ? `${d.figma}px` : /^-?[\d.]+(px|%)?$/.test(String(d.figma)) ? String(d.figma) : null;
  const want = d.expectedVar ? `var(${d.expectedVar})` : d.suggestVar ? `var(${d.suggestVar})` : (d.figmaValue ?? plain);
  const reset = pageLevelRule(d.rule);
  const where = d.at ? `${reset ? `only the global reset ${d.rule} sets it · ` : d.rule ? `${d.rule} · ` : ''}${d.at}` : null;
  const figma = `${d.figma}${d.figmaValue ? ` (${d.figmaValue})` : ''}`;
  return `${d.component} ${d.field}: Figma ${figma}, rendered ${d.code}${d.codeVar ? ` via ${d.codeVar}` : ''}`
    + (where ? `  (${where})` : '')
    + (d.confidence === 'single-source' ? '  [read from one source]' : '')
    + (moved === 'code-moved' ? `  → in Figma, set it to ${d.codeVar ? `the token behind ${d.codeVar}` : d.code}`
      : moved === 'both-moved' ? '  → decide which value wins'
      : d.why === 'figma-no-min' ? `  → Figma sets no minimum height (its content decides); remove min-height from the code, or give the component a minimum height in Figma`
      : d.why === 'figma-fill-code-fixed' ? `  → Figma fills its container; the code fixes ${d.code}px: remove the height so the product's container sets it, or fix the height in Figma`
      : d.why === 'figma-fixed-code-hugs' ? `  → Figma fixes its height at ${want}; the code sets none, so its content decides (${d.code}px drawn): set height: ${want}, or make it hug its content in Figma`
      : d.why === 'tint-opacity' ? `  → paint the background at ${Math.round(Number(d.figma) * 100)}%, as Figma's layer: color-mix(in srgb, ${d.codeVar ? `var(${d.codeVar})` : 'its colour'} ${Math.round(Number(d.figma) * 100)}%, transparent)`
      : d.why === 'inline' ? `  → the rule sets ${want}, but the element is inline and ignores a height: give it display: inline-flex (or block)`
      : d.why === 'content-box' ? `  → the rule sets ${want}, but padding and border add to it: set box-sizing: border-box`
      : reset && want ? `  → give ${d.component}'s own rule ${want} (not the reset)`
      : where && want ? `  → set ${want}` : '');
}

export function compareReport(r) {
  const t = r.tokens, c = r.components;
  const lines = ['Code capture vs Figma'];
  lines.push(`  tokens      ${t.match} match · ${t.differ.length} differ · ${t.missingInCode.length} missing in code · ${t.notComparable.length} not comparable · ${t.skipped} skipped by the project`);
  lines.push(`  components  ${c.match} match · ${c.differ.length} differ · ${c.notComparable.length} not comparable · ${c.notCaptured.length} not captured`);
  for (const d of t.differ.slice(0, 20)) lines.push(`    ✗ token ${d.token} (${d.mode}) → ${d.cssVar}: Figma ${d.figma}, code ${d.code}${d.at ? `  (${d.at})` : ''}`);
  for (const d of t.missingInCode.slice(0, 20)) lines.push(`    ✗ token ${d.token} (${d.mode}) → ${d.cssVar}: not in the code`);
  if (r.icons) lines.push(`  icons       ${r.icons.match} match · ${r.icons.differ.length} differ · ${r.icons.missingInCode.length} missing in code · ${r.icons.codeOnly} only in code`);
  if (r.nesting) lines.push(`  nesting     ${r.nesting.match} match · ${r.nesting.differ.length} differ · ${r.nesting.notComparable.length} not comparable · ${r.nesting.codeOnly.length} only in code`);
  for (const d of c.differ.slice(0, 30)) lines.push(`    ✗ ${d.component} ${d.field}: Figma ${d.figma}${d.figmaValue ? ` (${d.figmaValue})` : ''}, code ${d.code}${d.codeVar ? ` via ${d.codeVar}` : ''}${d.at ? `  (${d.rule} · ${d.at})` : ''}`);
  for (const d of (r.icons?.differ ?? []).slice(0, 20)) lines.push(`    ✗ icon #${d.id}: ${d.what}${d.at ? `  (${d.at})` : ''}`);
  for (const id of (r.icons?.missingInCode ?? []).slice(0, 20)) lines.push(`    ✗ icon #${id}: not in the code`);
  for (const d of (r.nesting?.differ ?? []).slice(0, 20)) lines.push(`    ✗ ${d.parent} → ${d.child}: Figma nests it, code ${d.code}`);
  return lines.join('\n');
}
