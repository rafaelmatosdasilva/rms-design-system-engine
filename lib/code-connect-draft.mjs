// code-connect-draft.mjs - a draft Code Connect file for each component the contracts pair with Figma and the code but
// no Code Connect file maps yet, written from what the contract already pairs: each Figma property's code prop, an
// enum's values as Figma and the code write them, the booleans (and the ones that hold the opposite), the texts, the
// instances it swaps (figma.instance; getInstanceSwap(…)?.executeTemplate().example, as Code Connect's template API
// renders one), a Figma slot property (figma.slot; getSlot), what fills a slot (between the tags in the template form;
// a prop in React's, <Card header={…}>), and the attributes a property decides are written at all (a guard in the
// template form, the call that wraps the prop's own in the classic one).
//
//   draftFor(contract, { form, figmaFile })           → { file, text, pairs, todos } | null
//   draftsFor(contracts, maps, { form, figmaFile })   → { drafts, skipped: [{ name, why }] }
//   formOf(text)                                      → 'template' | 'classic': the form one Code Connect file is in
//
// Two forms, as code-connect-map.mjs reads them: the classic one (figma.connect(Button, 'url', { props, example }),
// React's) and the template one (figma.selectedInstance.get… into a variable, written into figma.code or figma.html),
// for Vue, Svelte and web components. A project that has Code Connect files already gets the form they use.
//
// A draft is a draft: its first lines say so, and whatever the contract does not settle is a TODO comment where it
// goes (a value the code does not list, a Figma property no code prop is, the import). It is written to the
// engine's own folder, never into the code: a person checks it, moves it beside the component and publishes it with
// their own Code Connect tooling. Pure: no file is read or written here.
import { isStateAxis } from './contract-code.mjs';

const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const squash = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const yesNo = (p) => p.type === 'enum' && Array.isArray(p.options) && p.options.length === 2 && p.options.every((o) => /^(true|false)$/i.test(String(o)));
const ident = (s) => /^[A-Za-z_$][\w$]*$/.test(String(s));
const camel = (s) => String(s).trim().replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[A-Z]/, (c) => c.toLowerCase()).replace(/^(\d)/, '_$1');

// The form one file is in, as code-connect-map.mjs tells them apart.
export const formOf = (text) => (/figma\.selectedInstance|figma\.currentLayer/.test(text) || (/\/\/\s*url\s*=/.test(text) && !/figma\.connect\(/.test(text)) ? 'template' : 'classic');

// An enum's values, Figma's option → the code's value: Code Connect's map when the contract holds one, else each option
// matched to the code's own value of the same name; what matches nothing is written as Figma has it, with a TODO.
function valuesFor(p, c) {
  const opts = (p.options ?? []).map(String);
  if (c.valueMap && Object.keys(c.valueMap).length) return { map: c.valueMap, todo: null };
  if (yesNo(p)) {
    const map = Object.fromEntries(opts.map((o) => [o, /^true$/i.test(o) !== !!c.inverted]));
    const sure = c.type === 'boolean' || typeof c.default === 'boolean';
    return { map, todo: sure ? null : `${p.name}: Figma's ${opts.join(' and ')} written as true and false; the code does not say it takes a boolean` };
  }
  const code = Array.isArray(c.options) ? c.options.map(String) : null;
  const map = {}, unmatched = [];
  for (const o of opts) {
    const hit = code?.find((x) => same(x, o)) ?? code?.find((x) => squash(x) === squash(o));
    map[o] = hit ?? o;
    if (code && hit == null) unmatched.push(o);
  }
  const todo = !code ? `${p.name}: the code lists no values, so each is written as Figma has it` : unmatched.length ? `${p.name}: the code has no value for ${unmatched.join(', ')} (it has ${code.join(', ')})` : null;
  return { map, todo };
}
const literal = (v) => (typeof v === 'boolean' || typeof v === 'number' ? String(v) : q(v));
const mapText = (map) => `{ ${Object.entries(map).map(([k, v]) => `${ident(k) ? k : q(k)}: ${literal(v)}`).join(', ')} }`;

// What the contract pairs, one entry a Figma property: { figma, kind, code, as, values?, negated?, todo? }, or a TODO.
function readPairs(contract) {
  const entries = [], todos = [];
  for (const p of contract.props ?? []) {
    const c = p.bindings?.code;
    const kind = p.bindings?.figma?.kind ?? null;
    if (!c || !(c.prop || c.slot)) {
      if (!p.conditions?.length) {
        const state = p.type === 'enum' && isStateAxis(p.name, p.options ?? []);
        todos.push(state ? `${p.name}: a state Figma draws (${(p.options ?? []).join(', ')}); the code shows it without a prop, so it maps to none` : `${p.name}: no code prop the contract pairs it with${p.suggestion ? ` (the code has ${p.suggestion}: record the binding in contract.authored.json if it is that one)` : ''}`);
      }
    } else if (c.key) todos.push(`${p.name}: fills ${c.prop}.${c.key}, a key of an object prop, which a draft does not write`);
    else if (c.derived) todos.push(`${p.name}: ${c.prop} is computed from it, not its value: write how`);
    else {
      const code = c.as === 'defaultSlot' ? 'children' : c.prop ?? c.slot;
      // A slot it fills: written between the component's tags in the template form ('default': its default slot).
      const e = { figma: p.name, kind, code, as: c.as, ...(c.as === 'defaultSlot' ? { slot: 'default' } : c.as === 'slot' ? { slot: c.slot ?? c.prop } : {}) };
      if (kind === 'VARIANT') { const v = valuesFor(p, c); e.values = v.map; if (v.todo) todos.push(v.todo); }
      else if (kind === 'BOOLEAN' && c.inverted) e.negated = true;
      if (c.source === 'name' || c.source === 'convention') e.byName = true;
      entries.push(e);
    }
    for (const cond of p.conditions ?? []) entries.push({ figma: p.name, kind, options: p.options, code: cond.code, condition: true, ...(cond.slot ? { slot: true } : {}), ...(cond.negated ? { negated: true } : {}), ...(cond.equals != null ? { equals: cond.equals } : {}), ...(cond.unclear ? { unclear: true } : {}) });
  }
  return { entries, todos };
}

const urlOf = (contract, figmaFile) => {
  const key = contract.source?.figma?.file || figmaFile;
  const node = String(contract.source?.figma?.nodeId || contract.figmaNodeId).replace(':', '-');
  return { url: `https://www.figma.com/design/${key || 'FILE_KEY'}/${encodeURIComponent(contract.name)}?node-id=${node}`, todo: key ? null : 'the Figma file\'s key: FILE_KEY stands in for it in the link' };
};
const baseOf = (file) => String(file).split('/').pop().replace(/\.[^.]+$/, '');
const dirOf = (file) => String(file).split('/').slice(0, -1).join('/');
const header = (contract, form) => [
  `// DRAFT written by rms-design-system-engine from the contract of ${contract.name}: nothing here is published.`,
  `// Check each TODO, move the file beside ${contract.source.code.file}, then publish it with your own Code Connect tooling.`,
  ...(form === 'template' ? [] : ['// Each prop below is one the contract pairs: Figma\'s property on the right, the code\'s prop on the left.']),
];

function classic(contract, entries, todos, url) {
  const tag = contract.source.code.tag && ident(contract.source.code.tag) ? contract.source.code.tag : camel(contract.name).replace(/^./, (x) => x.toUpperCase());
  const values = entries.filter((e) => !e.condition);
  const lines = [...header(contract, 'classic'), `import figma from '@figma/code-connect'`, `import { ${tag} } from './${baseOf(contract.source.code.file)}'   // TODO: a default export is imported without the braces`, ''];
  const conditions = entries.filter((x) => x.condition);
  lines.push(`figma.connect(${tag}, ${q(url)}, {`, '  props: {');
  const pairs = [], guarded = new Set();
  // A property that decides whether the prop is written wraps its call: figma.boolean('Show caption', { true: …,
  // false: undefined }), the other way round when it decides it off; an enum on the option it decides it under.
  const wrap = (g, inner) => {
    if (g.kind === 'BOOLEAN' && g.equals == null) return `figma.boolean(${q(g.figma)}, ${g.negated ? `{ true: undefined, false: ${inner} }` : `{ true: ${inner}, false: undefined }`})`;
    const on = g.kind === 'VARIANT' ? (g.equals != null ? (g.negated ? null : g.equals) : (g.options ?? []).find((o) => /^(true|false)$/i.test(String(o)) && /^true$/i.test(String(o)) !== !!g.negated)) : null;
    return on != null ? `figma.enum(${q(g.figma)}, { ${ident(on) ? on : q(on)}: ${inner} })` : null;
  };
  for (const e of values) {
    if (!ident(e.code)) { todos.push(`${e.figma}: its code prop ${e.code} is not a name JavaScript can use as a key`); continue; }
    let call = e.kind === 'VARIANT' ? `figma.enum(${q(e.figma)}, ${mapText(e.values)})`
      : e.kind === 'BOOLEAN' ? `figma.boolean(${q(e.figma)}${e.negated ? ', { true: false, false: true }' : ''})`
      : e.kind === 'TEXT' ? `figma.string(${q(e.figma)})`
      : e.kind === 'INSTANCE_SWAP' ? `figma.instance(${q(e.figma)})`
      : e.kind === 'SLOT' ? `figma.slot(${q(e.figma)})` : null;
    if (!call) { todos.push(`${e.figma}: a Figma ${e.kind} property, which a draft does not write`); continue; }
    const guards = [];
    // A slot is a prop here (children, the default one): what decides it is filled wraps it the same way.
    const codeOf = (c) => (c.slot && c.code === 'default' ? 'children' : c.code);
    for (const g of conditions.filter((c) => codeOf(c) === e.code && !c.unclear && c.figma !== e.figma)) {
      const w = wrap(g, call);
      if (!w) continue;
      call = w; guards.push(g); guarded.add(g);
    }
    lines.push(`    ${e.code}: ${call},${e.byName ? '   // TODO: paired by its name: check it is that prop' : ''}`);
    pairs.push({ figma: e.figma, code: e.code, role: 'value', ...(e.negated ? { negated: true } : {}), ...(e.values ? { values: e.values } : {}) });
    for (const g of guards) pairs.push({ figma: g.figma, code: e.code, role: 'condition', ...(g.kind === 'BOOLEAN' ? (g.negated ? { negated: true } : {}) : { equals: g.equals ?? (g.options ?? []).find((o) => /^(true|false)$/i.test(String(o)) && /^true$/i.test(String(o)) !== !!g.negated) }) });
  }
  for (const c of conditions) if (!guarded.has(c)) todos.push(`${c.figma}: decides whether ${c.code} is written${c.negated ? ' (when it is off)' : c.equals != null ? ` (when it is ${c.equals})` : ''}${values.some((e) => e.code === c.code) ? '' : `, and no Figma property fills ${c.code}`}: write it in the example`);
  lines.push('  },');
  const attrs = pairs.filter((p) => p.role === 'value' && p.code !== 'children').map((p) => `${p.code}={props.${p.code}}`);
  const kids = pairs.some((p) => p.role === 'value' && p.code === 'children');
  lines.push(`  example: (props) => <${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${kids ? `>{props.children}</${tag}>` : ' />'},`, '})');
  return { lines, pairs };
}

function template(contract, all, todos, url) {
  const syntax = contract.source.code.syntax;
  // React's named slots are props: written as the attribute (<Card header={…}>), and what decides them as its condition.
  const slotProps = new Set(syntax === 'jsx' ? all.filter((e) => !e.condition && e.slot && e.slot !== 'default').map((e) => e.slot) : []);
  const plain = ({ slot, ...rest }) => rest;
  const entries = all.map((e) => (!e.condition && slotProps.has(e.slot) ? { ...plain(e), code: e.slot } : e.condition && e.slot && slotProps.has(e.code) ? plain(e) : e));
  const fn = syntax === 'html' ? 'html' : 'code';
  const tag = contract.source.code.tag || contract.name;
  const vars = new Map();
  const varOf = (e) => {
    if (vars.has(e.figma)) return vars.get(e.figma).name;
    let name = camel(e.figma) || 'value';
    while ([...vars.values()].some((v) => v.name === name) || name === 'figma') name += '_';
    const getter = e.kind === 'VARIANT' ? `getEnum(${q(e.figma)}, ${mapText(e.values ?? {})})` : e.kind === 'BOOLEAN' ? `getBoolean(${q(e.figma)})` : e.kind === 'TEXT' ? `getString(${q(e.figma)})` : e.kind === 'INSTANCE_SWAP' ? `getInstanceSwap(${q(e.figma)})` : e.kind === 'SLOT' ? `getSlot(${q(e.figma)})` : null;
    if (!getter) return null;
    vars.set(e.figma, { name, line: `const ${name} = figma.selectedInstance.${getter}` });
    return name;
  };
  const pairs = [];
  // A swapped instance is written as what its own Code Connect renders (getInstanceSwap(…)?.executeTemplate().example);
  // a Figma slot property as the slot itself (getSlot), which Code Connect renders as a reference to it.
  const fillOf = (e, v) => (e.kind === 'INSTANCE_SWAP' ? `${v}?.executeTemplate().example` : v);
  const attrFor = (e, v) => {
    const bool = e.kind === 'BOOLEAN' || (e.kind === 'VARIANT' && Object.values(e.values ?? {}).every((x) => typeof x === 'boolean'));
    // React's: a swapped instance through Code Connect's own helper, a slot as the node it is.
    if (syntax === 'jsx' && e.kind === 'INSTANCE_SWAP') return `\${figma.helpers.react.renderProp(${q(e.code)}, ${fillOf(e, v)})}`;
    if (syntax === 'jsx' && e.kind === 'SLOT') return ` ${e.code}={\${${v}}}`;
    if (syntax === 'html' && bool) return `\${${e.negated ? '!' : ''}${v} ? ' ${e.code}' : ''}`;
    if (syntax === 'vue' && (bool || e.kind === 'INSTANCE_SWAP' || e.kind === 'SLOT')) return ` :${e.code}="\${${e.negated ? '!' : ''}${fillOf(e, v)}}"`;
    if (e.kind === 'INSTANCE_SWAP' || e.kind === 'SLOT') return ` ${e.code}="\${${fillOf(e, v)}}"`;
    if (syntax === 'svelte' && bool) return ` ${e.code}={\${${e.negated ? '!' : ''}${v}}}`;
    return ` ${e.code}="\${${e.negated ? '!' : ''}${v}}"`;
  };
  const values = entries.filter((e) => !e.condition && !e.slot);
  const content = entries.filter((e) => !e.condition && e.slot);
  const conditions = entries.filter((e) => e.condition);
  const testsOf = (guards) => guards.map((g) => { const gv = varOf(g); return gv ? (g.equals != null ? `${gv} === ${literal(g.equals)}` : `${g.negated ? '!' : ''}${gv}`) : null; }).filter(Boolean);
  // What a property decides is written only when it holds; a part that holds a rendered snippet (a swapped instance, a
  // slot) is itself a figma template, since Code Connect's snippets are never joined as text.
  const guarded = (tests, text, snippet = false) => (tests.length ? `\${${tests.join(' && ')} ? ${snippet ? `figma.${fn}` : ''}\`${text.replace(/[\\`]/g, '\\$&')}\` : ''}` : text);
  const snippetOf = (e) => e.kind === 'INSTANCE_SWAP' || e.kind === 'SLOT';
  const condPair = (g) => ({ figma: g.figma, code: g.code, role: 'condition', ...(g.slot ? { slot: true } : {}), ...(g.negated ? { negated: true } : {}), ...(g.equals != null ? { equals: g.equals } : {}) });
  const parts = [];
  for (const e of values) {
    const v = varOf(e);
    if (!v) { todos.push(`${e.figma}: a Figma ${e.kind} property, which a draft does not write`); continue; }
    // The properties that decide whether this attribute is written, each as the contract says it decides.
    const guards = conditions.filter((c) => c.code === e.code && !c.unclear && !c.slot);
    parts.push(guarded(testsOf(guards), attrFor(e, v), snippetOf(e)));
    pairs.push({ figma: e.figma, code: e.code, role: 'value', ...(e.negated ? { negated: true } : {}), ...(e.values ? { values: e.values } : {}) });
    for (const g of guards) if (vars.has(g.figma)) pairs.push(condPair(g));
    if (e.byName) todos.push(`${e.figma}: paired with ${e.code} by its name: check it is that prop`);
  }
  // What fills a slot goes between the tags: the default slot's content as it is, a named slot's in the element the
  // code's framework names it with (slot="icon" for a web component, <template #icon> for Vue).
  const inner = [];
  for (const e of content) {
    const named = e.slot !== 'default';
    if (named && (!/^[\w-]+$/.test(e.slot) || !['html', 'vue', 'svelte'].includes(syntax))) { todos.push(`${e.figma}: fills the code's ${e.slot} slot, which a draft does not write in ${syntax}: write it inside the tag`); continue; }
    const v = varOf(e);
    if (!v) { todos.push(`${e.figma}: a Figma ${e.kind} property, which a draft does not write`); continue; }
    const fill = `\${${fillOf(e, v)}}`;
    const text = !named ? fill : syntax === 'vue' ? `<template #${e.slot}>${fill}</template>` : syntax === 'svelte' ? `<svelte:fragment slot="${e.slot}">${fill}</svelte:fragment>` : `<span slot="${e.slot}">${fill}</span>`;
    const guards = conditions.filter((c) => c.slot && c.code === e.slot && !c.unclear);
    inner.push(guarded(testsOf(guards), text, snippetOf(e)));
    pairs.push({ figma: e.figma, code: e.slot, role: 'value', slot: true });
    for (const g of guards) if (vars.has(g.figma)) pairs.push(condPair(g));
    if (named && syntax === 'svelte') todos.push(`${e.figma}: written into the ${e.slot} slot the Svelte 4 way; a Svelte 5 component takes it as a snippet`);
  }
  for (const c of conditions) {
    const filled = c.slot ? content.some((e) => e.slot === c.code) : values.some((e) => e.code === c.code);
    if (!filled || c.unclear) todos.push(`${c.figma}: decides whether ${c.slot ? `the ${c.code} slot is filled` : `${c.code} is written`}${c.negated ? ' (when it is off)' : ''}, and no Figma property fills ${c.code}: write it`);
  }
  const lines = [`// url=${url}`, `// source=${contract.source.code.file}`, `// component=${tag}`, ...header(contract, 'template'), `import figma from 'figma'`, '', ...[...vars.values()].map((v) => v.line), '',
    'export default {', `  example: figma.${fn}\`<${tag}${parts.join('')}${inner.length || syntax === 'html' ? `>${inner.join('')}</${tag}>` : ' />'}\`,`, `  id: ${q(tag)},`, '}'];
  return { lines, pairs };
}

export function draftFor(contract, { form = null, figmaFile = null } = {}) {
  const code = contract?.source?.code;
  if (!code?.file || !(contract.source?.figma?.nodeId || contract.figmaNodeId)) return null;
  const syntax = code.syntax ?? (/\.vue$/.test(code.file) ? 'vue' : /\.svelte$/.test(code.file) ? 'svelte' : /\.[jt]sx?$/.test(code.file) ? 'jsx' : 'html');
  const use = form ?? (syntax === 'jsx' ? 'classic' : 'template');
  const { entries, todos } = readPairs(contract);
  const { url, todo } = urlOf(contract, figmaFile);
  if (todo) todos.unshift(todo);
  const c = { ...contract, source: { ...contract.source, code: { ...code, syntax } } };
  const { lines, pairs } = use === 'classic' ? classic(c, entries, todos, url) : template(c, entries, todos, url);
  const ext = use === 'classic' ? (/\.tsx?$/.test(code.file) ? 'tsx' : 'jsx') : 'js';
  const at = lines.findIndex((l) => /^import figma/.test(l));
  const todoLines = todos.map((t) => `// TODO: ${t}`);
  const text = [...lines.slice(0, at), ...todoLines, ...lines.slice(at)].join('\n') + '\n';
  const dir = dirOf(code.file);
  return { name: contract.name, file: `${dir ? dir + '/' : ''}${baseOf(code.file)}.figma.${ext}`, form: use, text, pairs, todos };
}

// Every component paired with Figma and the code that no Code Connect file maps: its draft. maps: codeConnectMaps().
export function draftsFor(contracts = [], maps = [], { form = null, figmaFile = null } = {}) {
  const drafts = [], skipped = [], files = new Set();
  for (const c of contracts) {
    const node = c?.source?.figma?.nodeId || c?.figmaNodeId;
    if (!c?.source?.code?.file) { skipped.push({ name: c?.name, why: 'no code file the contract pairs it with' }); continue; }
    if (!node) { skipped.push({ name: c.name, why: 'no Figma component the contract pairs it with' }); continue; }
    const id = String(node).replace(/-/g, ':');
    if (c.source?.codeConnect || maps.some((m) => m.nodeId === id)) { skipped.push({ name: c.name, why: 'a Code Connect file maps it already' }); continue; }
    const d = draftFor(c, { form, figmaFile });
    if (!d) continue;
    if (files.has(d.file)) { skipped.push({ name: c.name, why: `another component drafts ${d.file}` }); continue; }
    files.add(d.file);
    drafts.push(d);
  }
  return { drafts, skipped };
}
