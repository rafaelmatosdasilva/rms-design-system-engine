// anatomy-parity.mjs - Figma's anatomy and the code's held against each other, where the value checks cannot look.
//
// The parity checks compare values (a colour, a padding, a size), each shadow one for one (effects-parity.mjs) and a
// paired part's text against its layer's text style (part-pairing.mjs). The code is now read as deeply as Figma
// (code-grammar.mjs anatomyOf) and two things of how a component is built are read on both sides and compared nowhere:
//   • its corners: one variable for all four in Figma and four of the code's own, or the other way round;
//   • its parts: one Figma always shows that the code renders on a condition (v-if, &&, {#if}), or one Figma shows by a
//     property (its visibility wired to a yes/no) that the code always renders.
// Each difference names the component, the part and the line of its file to look at. Only what both sides say is
// compared: a part the pairing cannot pair, a component with no corners on one side, is left alone, never guessed.
//
//   figmaAnatomy(entry)                         → { corners: { shared, vars } | null, parts: { name: { wired } } }
//   anatomyFindings({ name, entry, file, text, anatomy }) → [{ component, part, what, figma, code, at, message }]
//   projectAnatomy(ROOT, cfg)                   → { compared, findings } | null (no skeleton or no component files)

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { layerNames, partFacts, pairedHow } from './part-pairing.mjs';

const CORNERS = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];

// What Figma says of a component's build, from its skeleton entry (figma-skeleton.snapshot.json): the variables its
// frame binds to its corners in its first variant, and each named part's visibility, wired to a property in any variant.
export function figmaAnatomy(entry) {
  if (!entry) return { corners: null, parts: {} };
  const binds = entry.binds ?? {}, first = binds[Object.keys(binds)[0]] ?? {}, own = first[''] ?? {};
  const vars = CORNERS.map((k) => own[k] ?? null);
  const corners = vars.some(Boolean) ? { shared: vars.every((v) => v && v === vars[0]), vars: [...new Set(vars.filter(Boolean))] } : null;
  // Each name's wiring in every variant: a name two layers share with different wiring (a Label shown by a property
  // inside one group and always inside another) says nothing of one part, so it is left out, as part-pairing.mjs leaves
  // out a fact that is not the same everywhere.
  const seen = {};
  const walk = (t) => {
    for (const c of t?.c ?? []) {
      const n = String(c.n ?? '').trim();
      if (n) (seen[n] ??= new Set()).add(c.wired?.visible ?? '');
      if (c.t !== 'INSTANCE') walk(c);
    }
  };
  for (const t of entry.trees ?? []) walk(t);
  const parts = {};
  for (const [n, ws] of Object.entries(seen)) if (ws.size === 1) { const w = [...ws][0]; parts[n] = { wired: w || null }; }
  return { corners, parts };
}

// Which classes the component's markup renders on a condition, its own or one around it: an element is conditional when
// it, or any element it sits inside, carries v-if, v-else-if, v-else or v-show, or {#if} in Svelte, or is written after
// a && or a ? in JSX. Read with a stack of the open elements, so a part inside a conditional block is conditional too.
// → Map(class → conditional)
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
export function conditionalClasses(file, text) {
  let t = String(text ?? '').replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  if (/\.vue$/i.test(file)) { const a = t.search(/<template\b[^>]*>/), b = t.lastIndexOf('</template>'); t = a < 0 || b < a ? '' : t.slice(t.indexOf('>', a) + 1, b); }
  const out = new Map(), stack = [];
  const tagRe = /<(\/?)([A-Za-z][\w.:-]*)((?:\s+(?:[^>"'`{}]|"[^"]*"|'[^']*'|`[^`]*`|\{(?:[^{}]|\{[^{}]*\})*\})*)?)\s*(\/?)>/g;
  let svelteIf = 0, last = 0;
  for (const m of t.matchAll(tagRe)) {
    const between = t.slice(last, m.index); last = m.index + m[0].length;
    svelteIf += (between.match(/\{#if\b/g) ?? []).length - (between.match(/\{\/if\}/g) ?? []).length;
    const [, close, tag, attrs = '', self] = m;
    if (close) { const i = stack.map((x) => x.tag).lastIndexOf(tag); if (i > -1) stack.length = i; continue; }
    const before = t.slice(Math.max(0, m.index - 40), m.index);
    const own = /(?:^|\s)(v-if|v-else-if|v-else|v-show)\b/.test(attrs) || /(&&|\?)\s*\(?\s*$/.test(before);
    const cond = own || svelteIf > 0 || stack.some((x) => x.cond);
    const cls = /\bclass(?:Name)?\s*=\s*["'`]([^"'`]*)["'`]/.exec(attrs)?.[1];
    for (const k of String(cls ?? '').split(/\s+/).filter(Boolean)) out.set(k, (out.get(k) ?? false) || cond);
    if (!self && !VOID.has(tag.toLowerCase())) stack.push({ tag, cond });
  }
  return out;
}

// The line of the file a class is first written on: where a person looks to change how that part is rendered.
const lineOf = (text, cls) => {
  const m = new RegExp(`(?<![\\w-])${String(cls).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).exec(String(text ?? ''));
  return m ? String(text).slice(0, m.index).split('\n').length : null;
};

export function anatomyFindings({ name, entry, file = '', text = '', anatomy = null } = {}) {
  if (!entry || !anatomy) return [];
  const fig = figmaAnatomy(entry), out = [];
  const add = (part, what, figma, code, at) => out.push({ component: name, part, what, figma, code, at,
    message: `${name}${part ? ` › ${part}` : ''}: ${what}. Figma ${figma}; the code ${code}${at ? ` (${at})` : ''}.` });
  // Corners: one variable for all four against one custom property for all four.
  const r = anatomy.radius;
  if (fig.corners && r && (r.tokens?.length || r.perCorner)) {
    const codeShared = !!r.shared;
    if (fig.corners.shared && !codeShared) add(null, 'its corners are one in Figma and apart in the code', `binds all four to ${fig.corners.vars[0]}`, r.perCorner ? 'sets each corner on its own' : `uses ${r.tokens.length} custom properties for them`, r.at ?? null);
    else if (!fig.corners.shared && codeShared) add(null, 'its corners are apart in Figma and one in the code', `binds them to ${fig.corners.vars.length} variables (${fig.corners.vars.join(', ')})`, `sets all four with ${r.tokens[0]}`, r.at ?? null);
  }
  // Parts: always shown against rendered on a condition, each paired by the part pairing alone.
  const names = layerNames(entry), facts = partFacts(entry);
  const paired = pairedHow(names, text, { ids: facts.ids, instances: facts.instances });
  const conds = conditionalClasses(file, text);
  const said = new Set();   // one finding a class of the code, however many of Figma's layers pair with it (icon, Icon)
  for (const [part, how] of Object.entries(paired)) {
    const cls = /^\.([\w-]+)$/.exec(how.selector)?.[1];
    if (!cls || said.has(cls)) continue;
    const code = cls ? (anatomy.parts ?? []).find((p) => p.class === cls) : null;
    const f = fig.parts[part];
    if (!code || !f || !conds.has(cls)) continue;
    const optional = conds.get(cls);
    const at = `${file}:${lineOf(text, cls) ?? '?'}`;
    if ((!f.wired && optional) || (f.wired && !optional)) said.add(cls);
    if (!f.wired && optional) add(part, 'it is always shown in Figma and on a condition in the code', 'always shows it', 'renders it on a condition', at);
    else if (f.wired && !optional) add(part, 'it is shown by a property in Figma and always in the code', `shows it by its "${f.wired}" property`, 'always renders it', at);
  }
  return out;
}

export async function projectAnatomy(ROOT, cfg = {}) {
  const { componentFiles } = await import('./figma-capture.mjs');
  const skelPath = resolve(ROOT, componentFiles(cfg).skeleton);
  if (!existsSync(skelPath)) return null;
  let skel; try { skel = JSON.parse(readFileSync(skelPath, 'utf8')); } catch { return null; }
  const { codeInputs, anatomyOf } = await import('./code-grammar.mjs');
  let figmaProps = {}; try { figmaProps = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.compPropsSnapshot ?? 'src/figma-component-props.snapshot.json'), 'utf8')); } catch { /* none */ }
  const components = await codeInputs(ROOT, cfg, { figmaProps });
  const findings = [];
  let compared = 0;
  for (const c of components) {
    const entry = skel[c.name];
    if (!entry || !c.file) continue;
    const anatomy = anatomyOf({ file: c.file, text: c.text, styles: c.styles ?? [], root: c.root, props: Object.keys(c.api?.props ?? {}) });
    if (!anatomy) continue;
    compared++;
    findings.push(...anatomyFindings({ name: c.name, entry, file: c.file, text: c.text, anatomy }));
  }
  return compared ? { compared, findings } : null;
}
