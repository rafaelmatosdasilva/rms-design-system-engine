// shadcn.mjs - a shadcn/ui system read as its own kind of React.
//
// A shadcn/ui system is React components copied into the project (components/ui), styled with Tailwind, their
// variants written with class-variance-authority and their behaviour from Radix. Read as plain React, the things that
// make it a system are missed: a component's props are `VariantProps<typeof buttonVariants>`, which says nothing until
// its cva call is read; a file is named in kebab case (dropdown-menu.tsx) and holds a family of parts; `asChild` hands
// the element to the child; the `@/` alias is set in components.json and tsconfig. This reads each of those.
//
//   shadcnConfig(ROOT)        → { file, uiDir, componentsDir, utils, css, alias, style, tsx } | null, from components.json
//   cvaCalls(text)            → { name: { base, variants: { axis: { option: classes } }, defaultVariants, compoundVariants } }
//   cvaProps(text)            → { prop: { options, default?, type } }: each cva axis a component's props take, and asChild
//   componentName(file)       → 'DropdownMenu' for dropdown-menu.tsx
//   shadcnScaffold(name, …)   → a component written the shadcn way: cva for its variants, cn, data-slot, asChild
//
// Pure reading: nothing is run, and the engine changes no code.
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { literalTokens, literalValue, classesIn } from './tailwind-classes.mjs';

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1')); } catch { return null; } };

// An alias as the project resolves it: tsconfig's (or jsconfig's) paths, else the shadcn default of @/ → src/ when the
// project has a src folder, else the root (Next.js puts components at the root).
export function resolveAlias(ROOT, spec) {
  const s = String(spec ?? '');
  // Every tsconfig the project keeps (a Vite project puts its paths in one of its own beside tsconfig.json), then jsconfig.
  let configs = [];
  try { configs = readdirSync(ROOT).filter((f) => /^tsconfig(\.[\w-]+)?\.json$/.test(f)).sort((a, b) => a.length - b.length); } catch { /* none */ }
  for (const f of [...configs, 'jsconfig.json']) {
    const paths = readJson(join(ROOT, f))?.compilerOptions?.paths ?? {};
    for (const [from, to] of Object.entries(paths)) {
      const pre = from.replace(/\*$/, '');
      if (from.endsWith('*') ? s.startsWith(pre) : s === from) {
        const target = String([].concat(to)[0] ?? '').replace(/\*$/, '').replace(/^\.\//, '');
        return (target + s.slice(pre.length)).replace(/\/$/, '') || '.';
      }
    }
  }
  if (s.startsWith('@/')) return (existsSync(join(ROOT, 'src')) ? 'src/' : '') + s.slice(2);
  return s;
}

export function shadcnConfig(ROOT) {
  const c = readJson(join(ROOT, 'components.json'));
  if (!c || typeof c !== 'object' || !c.aliases) return null;
  const componentsDir = resolveAlias(ROOT, c.aliases.components ?? '@/components');
  return {
    file: 'components.json',
    uiDir: resolveAlias(ROOT, c.aliases.ui ?? `${c.aliases.components ?? '@/components'}/ui`),
    componentsDir,
    utils: c.aliases.utils ?? '@/lib/utils',
    css: c.tailwind?.css || null,
    style: c.style ?? null,
    tsx: c.tsx !== false,
  };
}

// dropdown-menu.tsx → DropdownMenu: the name shadcn exports a file's component under.
export function componentName(file) {
  return basename(String(file)).replace(/\.[jt]sx?$/, '').split(/[-_.\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
}

// Each cva (or tailwind-variants' tv) call, by the name it is kept under: its base classes, each axis's options and
// their classes, the defaults and the combinations. A class list written as an array is joined, as cva joins it.
export function cvaCalls(text) {
  const ts = literalTokens(text);
  const out = {};
  const asText = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').join(' ') : typeof v === 'string' ? v : '');
  for (let k = 0; k < ts.length; k++) {
    if (!(ts[k].t === 'id' && /^(cva|tv)$/.test(ts[k].v) && ts[k + 1]?.v === '(')) continue;
    // The name: const buttonVariants = cva(…)
    const name = ts[k - 1]?.v === '=' && ts[k - 2]?.t === 'id' ? ts[k - 2].v : null;
    let base, cfg = null, i = k + 2;
    if (ts[k].v === 'cva') {
      const [b, n] = literalValue(ts, i);
      base = asText(b); i = n;
      if (ts[i]?.v === ',') { const [c] = literalValue(ts, i + 1); cfg = c; }
    } else {
      const [c] = literalValue(ts, i);
      cfg = c; base = asText(c?.base);
    }
    const variants = {};
    for (const [axis, opts] of Object.entries(cfg?.variants ?? {})) {
      if (!opts || typeof opts !== 'object' || Array.isArray(opts)) continue;
      variants[axis] = Object.fromEntries(Object.entries(opts).map(([o, cls]) => [o, typeof cls === 'object' && !Array.isArray(cls) ? asText(cls.base ?? '') : asText(cls)]));
    }
    out[name ?? `cva${Object.keys(out).length}`] = { base, variants, defaultVariants: cfg?.defaultVariants ?? {}, compoundVariants: Array.isArray(cfg?.compoundVariants) ? cfg.compoundVariants : [] };
  }
  return out;
}

// The props a component takes from its cva call: `VariantProps<typeof buttonVariants>` names the call, each axis is
// a prop whose options are its keys, and its default is cva's. "true"/"false" keys are a yes/no prop. A component that
// takes `asChild` hands its element to its child (Radix's Slot), a yes/no prop that is off unless set.
export function cvaProps(text) {
  const src = String(text ?? '');
  const calls = cvaCalls(src);
  const named = [...src.matchAll(/VariantProps\s*<\s*typeof\s+([A-Za-z_$][\w$]*)\s*>/g)].map((m) => m[1]);
  // A file that calls one cva and passes the props to it (buttonVariants({ variant, size })) without naming the type.
  const used = Object.keys(calls).filter((n) => new RegExp(`\\b${n}\\s*\\(`).test(src.replace(new RegExp(`\\b${n}\\s*=\\s*(cva|tv)\\s*\\(`, 'g'), '')));
  const props = {};
  for (const n of [...new Set([...named, ...used])]) {
    const c = calls[n];
    if (!c) continue;
    for (const [axis, opts] of Object.entries(c.variants)) {
      const options = Object.keys(opts);
      const bool = options.length && options.every((o) => o === 'true' || o === 'false');
      const d = c.defaultVariants?.[axis];
      props[axis] = { type: bool ? 'boolean' : 'enum', ...(bool ? {} : { options }), ...(d != null ? { default: String(d) } : bool ? { default: 'false' } : {}) };
    }
  }
  // It composes rather than varies: drawn on, it needs a child to draw, so it is no variant to try (composes).
  if (/\basChild\b/.test(src)) props.asChild = { type: 'boolean', default: 'false', composes: true, description: 'Draws the child element in its place, with these styles and behaviour (Radix Slot)' };
  return props;
}

// ── Radix's states ──────────────────────────────────────────────────────────────────────────────────────────────
// A Radix primitive says its state as an attribute (data-state="checked", data-disabled), and a shadcn component
// styles that attribute (data-[state=checked]:bg-primary) rather than a pseudo-class. The prop that puts the primitive
// in the state comes from Radix through {...props}, so the component's own code names none, and its checked look was
// never drawn or compared. Each state its classes style is the Radix prop that sets it, on a component that renders a
// primitive's Root and passes its props on. → { prop: { type, default, radix, description } }
const RADIX_STATE = {
  checked: ['checked', 'data-state="checked"'], unchecked: ['checked', 'data-state="checked"'], indeterminate: ['checked', 'data-state="checked"'],
  on: ['pressed', 'data-state="on"'], off: ['pressed', 'data-state="on"'],
  open: ['open', 'data-state="open"'], closed: ['open', 'data-state="open"'],
};
export function radixStateProps(text) {
  const src = String(text ?? '');
  if (!/from\s+["'](?:@radix-ui\/[\w-]+|radix-ui)["']/.test(src) || !/<\s*[A-Z][\w$]*\.Root\b/.test(src) || !/\{\s*\.\.\.props\s*\}/.test(src)) return {};
  const variants = new Set(classesIn(src).flatMap((c) => c.variants));
  const props = {};
  for (const v of variants) {
    const m = /^(?:group-|peer-)?data-\[state=([\w-]+)\]$/.exec(v);
    const hit = m && RADIX_STATE[m[1]];
    if (hit) props[hit[0]] ??= { type: 'boolean', default: 'false', radix: true, description: `Radix sets ${hit[1]} from it, which the component's classes style` };
    if (/^(?:group-|peer-)?data-(?:\[disabled\]|disabled)$/.test(v)) props.disabled ??= { type: 'boolean', default: 'false', radix: true, description: 'Radix sets data-disabled from it, which the component\'s classes style' };
  }
  return props;
}

// A shadcn component's root element: data-slot names it (<Comp data-slot="button">), and with asChild it is the child.
export const slotOf = (text) => (/data-slot\s*=\s*["']([\w-]+)["']/.exec(String(text)) ?? [])[1] ?? null;

// ── Writing one ─────────────────────────────────────────────────────────────────────────────────────────────────
// A declaration written as the Tailwind utility that sets it from the same variable: padding: var(--space-m) is
// p-(--space-m), Tailwind 4's way to read a variable without a value in brackets. A property with no utility, or a
// value that is no variable, is left for the person, never written in brackets.
const UTIL = {
  padding: 'p', 'padding-inline': 'px', 'padding-block': 'py', 'padding-top': 'pt', 'padding-right': 'pr', 'padding-bottom': 'pb', 'padding-left': 'pl',
  'padding-inline-start': 'ps', 'padding-inline-end': 'pe', margin: 'm', 'margin-inline': 'mx', 'margin-block': 'my', gap: 'gap', 'column-gap': 'gap-x', 'row-gap': 'gap-y',
  height: 'h', width: 'w', 'min-height': 'min-h', 'min-width': 'min-w', 'max-width': 'max-w', 'max-height': 'max-h',
  'border-radius': 'rounded', 'background-color': 'bg', background: 'bg', color: 'text', 'border-color': 'border', 'border-width': 'border', 'outline-color': 'outline',
  'font-size': 'text-(length:%)', 'font-weight': 'font', 'line-height': 'leading', 'letter-spacing': 'tracking', 'box-shadow': 'shadow', opacity: 'opacity', 'font-family': 'font-(family-name:%)',
};
// A shorthand of two variables is its two sides: padding: var(--y) var(--x) is py-(--y) px-(--x).
const SIDES = { padding: ['py', 'px'], margin: ['my', 'mx'], gap: ['gap-y', 'gap-x'] };
export function utilityOf({ prop, value }) {
  const two = /^var\((--[\w-]+)\)\s+var\((--[\w-]+)\)$/.exec(String(value).trim());
  if (two && SIDES[prop]) return `${SIDES[prop][0]}-(${two[1]}) ${SIDES[prop][1]}-(${two[2]})`;
  const v = /^var\((--[\w-]+)\)$/.exec(String(value).trim());
  if (prop === 'box-sizing') return value === 'border-box' ? 'box-border' : null;
  if (!v || !UTIL[prop]) return null;
  const u = UTIL[prop];
  // A utility that reads more than one kind of value (text- is a size or a colour) says which kind it is given.
  return u.includes('%') ? u.replaceAll('%', v[1]) : `${u}-(${v[1]})`;
}

const words = (s) => String(s ?? '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
const kebab = (s) => words(s).join('-');
const pascal = (s) => words(s).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
const camel = (s) => { const p = pascal(s); return p ? p[0].toLowerCase() + p.slice(1) : p; };
const lit = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
const comment = (s) => String(s).replace(/\*\//g, '* /');

// The component written the shadcn way, from its build sheet (build-list.mjs buildSheetRules): its element by its
// role, its variants as a cva call whose classes are the sheet's rules as utilities, cn() joining a className, the
// data-slot shadcn names a component's root with, and asChild through Radix's Slot when the project has it. What the
// sheet says and no utility writes from a variable is listed for the person, as the other scaffolds do.
// → { file, text, files, owed }
export function shadcnScaffold(name, { entry = {}, rules = null, el = { tag: 'div', attrs: '' }, nested = [], owed = [], cfg = null, hasSlot = false, file: at = null } = {}) {
  if (!rules?.sel) return { file: null, text: null, owed: [`${name} has no build sheet: nothing exact to write`] };
  const fname = pascal(name), vname = `${camel(name)}Variants`, slot = kebab(name);
  const left = [...owed];
  const util = (decls, where) => decls.map((d) => { const u = utilityOf(d); if (!u) left.push(`${d.prop}: ${d.value} on ${where}: no Tailwind utility reads it from a variable, so it is not written in brackets`); return u; }).filter(Boolean);
  const base = util([{ prop: 'box-sizing', value: 'border-box' }, ...rules.base], rules.sel);
  for (const r of [...rules.raw.map((x) => `${x} on ${rules.sel}`), ...rules.variants.flatMap((v) => v.raw.map((x) => `${x} on ${v.selector}`))]) left.push(`${r}: Figma binds no variable here, so it is written as it is in the build sheet, never by the scaffold`);
  // Each Figma axis a cva axis, its options as Figma names them, each with the utilities of its rule.
  const isBool = (p) => p.type === 'enum' && (p.values ?? []).length === 2 && (p.values ?? []).every((v) => /^(true|false)$/i.test(String(v)));
  // A yes/no Figma draws as a state of the element (Disabled as :disabled) is the element's own attribute, styled with
  // Tailwind's prefix for it (disabled:opacity-…), never a cva axis: the attribute is what a person's browser sees.
  const STATE = { disabled: 'disabled', checked: 'checked', required: 'required', readonly: 'read-only' };
  const states = [];
  for (const v of rules.variants) {
    const m = /:(disabled|checked|required|read-only)\b/.exec(v.selector.slice(rules.sel.length));
    if (!m) continue;
    const pre = STATE[m[1].replace('-', '')] ?? m[1];
    states.push({ prop: camel(v.prop), on: /^true$/i.test(String(v.value)) });
    base.push(...util(v.decls, v.selector).flatMap((u) => u.split(' ')).map((u) => `${pre}:${u}`));
  }
  const asState = (n) => states.some((x) => x.prop === n);
  const axes = Object.entries(entry.props ?? {}).filter(([, p]) => p.type === 'enum' || p.type === 'boolean')
    .map(([figma, p]) => ({ name: camel(p.codeName ?? figma), bool: isBool(p) || p.type === 'boolean', values: isBool(p) || p.type === 'boolean' ? ['true', 'false'] : (p.values ?? []).map(String), def: p.default }))
    .filter((a) => /^[A-Za-z_$][\w$]*$/.test(a.name) && a.values.length && !asState(a.name));
  const variantsOf = (a) => Object.fromEntries(a.values.map((v) => {
    const rule = rules.variants.find((x) => (camel(x.prop) === a.name) && String(x.value).toLowerCase() === v.toLowerCase());
    return [v, rule ? util(rule.decls, rule.selector).join(' ') : ''];
  }));
  const texts = Object.entries(entry.props ?? {}).filter(([, p]) => p.type === 'text').map(([figma, p]) => camel(p.codeName ?? figma)).filter(Boolean);
  const utilsImport = cfg?.utils ?? '@/lib/utils';
  const note = [`${name}${entry.description ? `: ${comment(entry.description)}` : ''}`, 'Written by rms-design-system-engine --scaffold from what is exact in Figma, the shadcn/ui way; every rule below is checked once it is built.',
    ...(left.length ? ['Still yours to write (the build sheet says it, and Figma does not give it exactly):', ...left.map((l) => `  - ${comment(l)}`)] : [])];
  const cvaBody = axes.length
    ? `, {\n  variants: {\n${axes.map((a) => `    ${a.name}: {\n${Object.entries(variantsOf(a)).map(([v, c]) => `      ${/^[A-Za-z_$][\w$]*$/.test(v) ? v : lit(v)}: ${lit(c)},`).join('\n')}\n    },`).join('\n')}\n  },\n  defaultVariants: {\n${axes.map((a) => `    ${a.name}: ${a.bool ? String(/^true$/i.test(String(a.def))) : lit(String(a.def ?? a.values[0]))},`).join('\n')}\n  },\n}`
    : '';
  const inner = [...nested.map((n) => `      <${pascal(n)} />`), ...texts.map((t) => `      <span data-slot="${slot}-${kebab(t)}">{${t}}</span>`)];
  const params = ['className', ...axes.map((a) => a.name), ...texts, ...(hasSlot ? ['asChild = false'] : []), '...props'];
  const type = `React.ComponentProps<${lit(el.tag)}> & VariantProps<typeof ${vname}>${texts.length || hasSlot ? ` & { ${[...texts.map((t) => `${t}?: React.ReactNode`), ...(hasSlot ? ['asChild?: boolean'] : [])].join('; ')} }` : ''}`;
  const comp = hasSlot ? `asChild ? Slot : ${lit(el.tag)}` : null;
  const tag = hasSlot ? 'Comp' : el.tag;
  const attrs = el.attrs && !hasSlot ? ` ${el.attrs}` : '';
  const file = at ?? `${cfg?.uiDir ?? 'src/components/ui'}/${kebab(name)}.tsx`;
  const text = `import * as React from "react"
${hasSlot ? 'import { Slot } from "@radix-ui/react-slot"\n' : ''}import { cva, type VariantProps } from "class-variance-authority"

import { cn } from ${lit(utilsImport)}

/**
${note.map((l) => ` * ${l}`).join('\n')}
 */
const ${vname} = cva(${lit(base.join(' '))}${cvaBody})

function ${fname}({ ${params.join(', ')} }: ${type}) {
${comp ? `  const Comp = ${comp}\n` : ''}  return (
    <${tag}${attrs} data-slot="${slot}" className={cn(${vname}({ ${[...axes.map((a) => a.name), 'className'].join(', ')} }))} {...props}>
${inner.length ? inner.join('\n') : '      {props.children}'}
    </${tag}>
  )
}

export { ${fname}, ${vname} }
`;
  return { file, text, files: [{ file, text }], owed: left };
}
