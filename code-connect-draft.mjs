// code-connect-draft.mjs - a draft Code Connect file for each component the contracts pair with Figma and the code but
// no Code Connect file maps yet, written from what the contract already pairs: each Figma property's code prop, an
// enum's values as Figma and the code write them, the booleans (and the ones that hold the opposite), the texts, the
// instances it swaps, and the attributes a property decides are written at all.
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
// goes (a value the code does not list, a Figma property no code prop is, a slot, the import). It is written to the
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
    else if (kind === 'SLOT') todos.push(`${p.name}: a Figma slot, filled in the code's ${c.slot ?? c.prop} slot: write what goes in it`);
    else {
      const code = c.as === 'defaultSlot' ? 'children' : c.prop ?? c.slot;
      const e = { figma: p.name, kind, code, as: c.as };
      if (kind === 'VARIANT') { const v = valuesFor(p, c); e.values = v.map; if (v.todo) todos.push(v.todo); }
      else if (kind === 'BOOLEAN' && c.inverted) e.negated = true;
      else if (kind === 'INSTANCE_SWAP' && c.as === 'prop') todos.push(`${p.name}: the instance it swaps becomes ${code}; check how its value is written`);
      if (c.source === 'name' || c.source === 'convention') e.byName = true;
      entries.push(e);
    }
    for (const cond of p.conditions ?? []) entries.push({ figma: p.name, kind, code: cond.code, condition: true, ...(cond.negated ? { negated: true } : {}), ...(cond.equals != null ? { equals: cond.equals } : {}), ...(cond.unclear ? { unclear: true } : {}) });
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
  for (const e of entries.filter((x) => x.condition)) todos.push(`${e.figma}: decides whether ${e.code} is written${e.negated ? ' (when it is off)' : e.equals != null ? ` (when it is ${e.equals})` : ''}; the classic form writes that in the example`);
  lines.push(`figma.connect(${tag}, ${q(url)}, {`, '  props: {');
  const pairs = [];
  for (const e of values) {
    if (!ident(e.code)) { todos.push(`${e.figma}: its code prop ${e.code} is not a name JavaScript can use as a key`); continue; }
    const call = e.kind === 'VARIANT' ? `figma.enum(${q(e.figma)}, ${mapText(e.values)})`
      : e.kind === 'BOOLEAN' ? `figma.boolean(${q(e.figma)}${e.negated ? ', { true: false, false: true }' : ''})`
      : e.kind === 'TEXT' ? `figma.string(${q(e.figma)})`
      : e.kind === 'INSTANCE_SWAP' ? `figma.instance(${q(e.figma)})` : null;
    if (!call) { todos.push(`${e.figma}: a Figma ${e.kind} property, which a draft does not write`); continue; }
    lines.push(`    ${e.code}: ${call},${e.byName ? '   // TODO: paired by its name: check it is that prop' : ''}`);
    pairs.push({ figma: e.figma, code: e.code, role: 'value', ...(e.values ? { values: e.values } : {}) });
  }
  lines.push('  },');
  const attrs = pairs.filter((p) => p.code !== 'children').map((p) => `${p.code}={props.${p.code}}`);
  const kids = pairs.some((p) => p.code === 'children');
  lines.push(`  example: (props) => <${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}${kids ? `>{props.children}</${tag}>` : ' />'},`, '})');
  return { lines, pairs };
}

function template(contract, entries, todos, url) {
  const syntax = contract.source.code.syntax;
  const tag = contract.source.code.tag || contract.name;
  const vars = new Map();
  const varOf = (e) => {
    if (vars.has(e.figma)) return vars.get(e.figma).name;
    let name = camel(e.figma) || 'value';
    while ([...vars.values()].some((v) => v.name === name) || name === 'figma') name += '_';
    const getter = e.kind === 'VARIANT' ? `getEnum(${q(e.figma)}, ${mapText(e.values ?? {})})` : e.kind === 'BOOLEAN' ? `getBoolean(${q(e.figma)})` : e.kind === 'TEXT' ? `getString(${q(e.figma)})` : e.kind === 'INSTANCE_SWAP' ? `getInstanceSwap(${q(e.figma)})` : null;
    if (!getter) return null;
    vars.set(e.figma, { name, line: `const ${name} = figma.selectedInstance.${getter}` });
    return name;
  };
  const pairs = [];
  const attrFor = (e, v) => {
    const bool = e.kind === 'BOOLEAN' || (e.kind === 'VARIANT' && Object.values(e.values ?? {}).every((x) => typeof x === 'boolean'));
    if (syntax === 'html' && bool) return `\${${e.negated ? '!' : ''}${v} ? ' ${e.code}' : ''}`;
    if (syntax === 'vue' && (bool || e.kind === 'INSTANCE_SWAP')) return ` :${e.code}="\${${e.negated ? '!' : ''}${v}}"`;
    if (syntax === 'svelte' && bool) return ` ${e.code}={\${${e.negated ? '!' : ''}${v}}}`;
    return ` ${e.code}="\${${e.negated ? '!' : ''}${v}}"`;
  };
  const values = entries.filter((e) => !e.condition && e.code !== 'children');
  for (const e of entries.filter((x) => !x.condition && x.code === 'children')) todos.push(`${e.figma}: fills the code's default slot; write it inside the tag`);
  const conditions = entries.filter((e) => e.condition);
  const parts = [];
  for (const e of values) {
    const v = varOf(e);
    if (!v) { todos.push(`${e.figma}: a Figma ${e.kind} property, which a draft does not write`); continue; }
    // The properties that decide whether this attribute is written, each as the contract says it decides.
    const guards = conditions.filter((c) => c.code === e.code && !c.unclear);
    const tests = guards.map((g) => { const gv = varOf(g); return gv ? (g.equals != null ? `${gv} === ${literal(g.equals)}` : `${g.negated ? '!' : ''}${gv}`) : null; }).filter(Boolean);
    const attr = attrFor(e, v);
    parts.push(tests.length ? `\${${tests.join(' && ')} ? \`${attr.replace(/`/g, '\\`')}\` : ''}` : attr);
    pairs.push({ figma: e.figma, code: e.code, role: 'value', ...(e.negated ? { negated: true } : {}), ...(e.values ? { values: e.values } : {}) });
    for (const g of guards) if (vars.has(g.figma)) pairs.push({ figma: g.figma, code: g.code, role: 'condition', ...(g.negated ? { negated: true } : {}), ...(g.equals != null ? { equals: g.equals } : {}) });
    if (e.byName) todos.push(`${e.figma}: paired with ${e.code} by its name: check it is that prop`);
  }
  for (const c of conditions) if (!values.some((e) => e.code === c.code) || c.unclear) todos.push(`${c.figma}: decides whether ${c.code} is written${c.negated ? ' (when it is off)' : ''}, and no Figma property fills ${c.code}: write it`);
  const fn = syntax === 'html' ? 'html' : 'code';
  const lines = [`// url=${url}`, `// source=${contract.source.code.file}`, `// component=${tag}`, ...header(contract, 'template'), `import figma from 'figma'`, '', ...[...vars.values()].map((v) => v.line), '',
    'export default {', `  example: figma.${fn}\`<${tag}${parts.join('')}${syntax === 'html' ? `></${tag}>` : ' />'}\`,`, `  id: ${q(tag)},`, '}'];
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
