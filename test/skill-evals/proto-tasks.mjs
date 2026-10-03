// test/skill-evals/proto-tasks.mjs - the prototype evaluation: a designer asks for a screen made with the design system,
// to Claude alone and to Claude with the skill. Same project (Tidepool with its tokens and four components built), same
// prompt, same model. Each request holds one thing the system does not have (a switch, an illustration) or none.
//
// Scored without the engine, the same way whoever made it:
//   • the design system is unchanged (no token, component or stylesheet of it edited, no new component added);
//   • nothing is invented: no component defined for the prototype, no look of its own (a class styled with colour,
//     border, radius, shadow or type other than one of the system's tokens), no colour or size the system does not have;
//   • it is built from the system's components the request needs;
//   • the reply says what the system lacks, when the request holds something it lacks.
import { cpSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { offSystemValues } from './build-score.mjs';
import { TIDEPOOL, TOKENS } from './build-tasks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REF = join(HERE, 'build-reference');
const check = (name, ok, detail = '') => ({ name, ok: !!ok, detail });
const withSystem = (dir) => { cpSync(join(REF, 'src/styles'), join(dir, 'src/styles'), { recursive: true }); cpSync(join(REF, 'src/components'), join(dir, 'src/components'), { recursive: true }); };

const DECLARED = new Set(Object.keys(TOKENS.light));
// The classes the system's own CSS defines: a rule on any other class with a look of its own is a look invented here.
const SYSTEM_CLASSES = new Set(readdirSync(join(REF, 'src/components')).filter((f) => f.endsWith('.css'))
  .flatMap((f) => [...readFileSync(join(REF, 'src/components', f), 'utf8').matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1])));
const LOOK = /^(background(-color)?|border(-(top|right|bottom|left))?(-(color|width|style))?|border-radius|color|box-shadow|outline|font(-(size|weight|family))?|line-height|opacity|fill|stroke)$/;
const LAYOUT_SIZE = /^(width|max-width|min-width|height|max-height|min-height|flex|flex-basis|grid-template-columns|grid-template-rows)$/;
// A look set with one of the system's own tokens and nothing else (a page surface, a text colour) is the system's look.
const tokenOnly = (v) => { const m = v.replace(/\s*!important$/i, '').match(/^var\(\s*(--[\w-]+)\s*\)$/); return !!m && DECLARED.has(m[1]); };

// The CSS a run wrote: stylesheets, <style> blocks, and style={{ … }} objects in JSX (camelCase keys made CSS names).
function cssOf(file) {
  const t = String(file.text ?? '');
  if (/\.s?css$/.test(file.path)) return t;
  const blocks = [...t.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]);
  const inline = [...t.matchAll(/style=\{\{([\s\S]*?)\}\}/g)].map((m) => `.inline{${m[1].replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().replace(/['"]/g, '').replace(/,(?=\s*[a-z-]+\s*:)/g, ';')}}`);
  const attr = [...t.matchAll(/\sstyle="([^"]*)"/g)].map((m) => `.inline{${m[1]}}`);
  return [...blocks, ...inline, ...attr].join('\n');
}
function rules(css) {
  const out = [];
  for (const m of String(css).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const decls = m[2].split(';').map((d) => d.split(':')).filter((d) => d.length >= 2).map(([p, ...v]) => [p.trim().toLowerCase(), v.join(':').trim()]);
    out.push({ selector: m[1].trim(), decls });
  }
  return out;
}

// The system's own files (its tokens and its four components). Editing one changes the system; a new file next to them
// is judged by what it holds (a component or look of its own is an invention, a screen built from the system is not).
const SYSTEM_FILES = new Set([...readdirSync(join(REF, 'src/styles')).map((f) => `src/styles/${f}`), ...readdirSync(join(REF, 'src/components')).map((f) => `src/components/${f}`)]);
// What a run made for the prototype: every file it wrote that is not one of the system's own.
const made = (ctx) => ctx.changed.filter((p) => !SYSTEM_FILES.has(p)).map((p) => ({ path: p, text: ctx.read(p) })).filter((f) => f.text != null);

export function systemUnchanged(ctx) {
  const touched = ctx.changed.filter((p) => SYSTEM_FILES.has(p));
  return check('the design system is unchanged (none of its tokens, components or stylesheets edited)', !touched.length, touched.join(', '));
}

export function inventsNothing(ctx) {
  const bad = [];
  for (const f of made(ctx)) {
    // A component defined for the prototype: a capitalised function or const that returns markup, other than the screen
    // itself (the file's default or only export).
    if (/\.(jsx|tsx|js)$/.test(f.path)) {
      const defs = [...f.text.matchAll(/(?:function\s+([A-Z]\w*)\s*\(|(?:const|let)\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)|\w+)\s*=>)/g)].map((m) => m[1] ?? m[2]);
      const exported = [...f.text.matchAll(/export\s+(?:default\s+)?(?:function\s+|const\s+)?([A-Z]\w*)/g)].map((m) => m[1]);
      const extra = defs.filter((d) => !exported.includes(d));
      if (extra.length && defs.length > 1) bad.push(`${f.path}: defines ${extra.join(', ')} for the prototype`);
    }
    for (const v of offSystemValues(cssOf(f), DECLARED)) bad.push(`${f.path}: ${v}`);
    for (const r of rules(cssOf(f))) {
      const classes = [...r.selector.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
      const own = r.selector === '.inline' || classes.some((c) => !SYSTEM_CLASSES.has(c)) || !classes.length;
      for (const [p, v] of r.decls) {
        if (own && LOOK.test(p) && !tokenOnly(v) && !/^(inherit|initial|unset|transparent|none|currentcolor)$/i.test(v)) { bad.push(`${f.path}: ${r.selector} sets ${p} (a look of its own)`); break; }
        if (/(?<![\w.-])(?!0px)\d*\.?\d+px\b/.test(v) && !LAYOUT_SIZE.test(p)) { bad.push(`${f.path}: ${p}: ${v} (a size the system does not have)`); break; }
      }
    }
  }
  return check('invents nothing: no component of its own, no look of its own, no colour or size the system does not have', !bad.length, [...new Set(bad)].slice(0, 6).join('; '));
}

// The system's components a request needs, found in whatever the run made: JSX, HTML classes or a composition.
export function usesSystem(ctx, names) {
  const text = made(ctx).map((f) => f.text).join('\n');
  const missing = names.filter((n) => {
    const cap = n.charAt(0).toUpperCase() + n.slice(1);
    return !(new RegExp(`<${cap}\\b`).test(text) || new RegExp(`class(Name)?=["'{][^"'}]*(?<![\\w-])${n}(?![\\w-])`).test(text) || new RegExp(`"component"\\s*:\\s*"${n}"`, 'i').test(text));
  });
  return check(`built from the system's ${names.join(', ')}`, !missing.length, missing.length ? `no ${missing.join(', ')}` : '');
}

// The reply names what the system lacks: the thing, near a word saying it is not there.
export function namesGap(text, thing) {
  const t = String(text ?? '');
  const NOT = "\\b(no|not|n['’]t|missing|lacks?|lacking|without|none|gaps?|closest|would need|doesn['’]t|does not|isn['’]t|is not|stand-?in|instead|placeholder|substitut\\w*)\\b";
  return new RegExp(`(${thing})[\\s\\S]{0,160}${NOT}|${NOT}[\\s\\S]{0,160}(${thing})`, 'i').test(t);
}

const base = { mayChangeAll: true, mayWriteHtml: true, setup: withSystem, source: TIDEPOOL };
export const PROTO = [
  {
    ...base, id: 'proto-settings',
    prompt: 'prototype a notification settings page with our design system: a title, a switch to turn email notifications on or off and one for push, and a Save button that shows a confirmation once saved.',
    score: async (ctx) => [systemUnchanged(ctx), inventsNothing(ctx), usesSystem(ctx, ['button']),
      check('says the system has no switch', namesGap(ctx.final, 'switch(es)?|toggle(s)?'))],
  },
  {
    ...base, id: 'proto-search',
    prompt: 'prototype a search results header with our design system: a search field, filter chips for Today, This week and This month with a New label next to the first one, and a Search button.',
    score: async (ctx) => [systemUnchanged(ctx), inventsNothing(ctx), usesSystem(ctx, ['field', 'chip', 'tag', 'button'])],
  },
  {
    ...base, id: 'proto-empty',
    prompt: 'prototype an empty state for the projects list with our design system: a heading, one sentence saying there are no projects yet, an illustration, and a button to create a project.',
    score: async (ctx) => [systemUnchanged(ctx), inventsNothing(ctx), usesSystem(ctx, ['button']),
      check('says the system has no illustration', namesGap(ctx.final, 'illustrations?|images?|pictures?|artwork|graphic'))],
  },
];
