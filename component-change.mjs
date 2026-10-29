// component-change.mjs - a change to a component the system has, made in Figma the system's way, with its change report.
//
// The most common case: a component gets a new option, a property, a variable moved to another. The change is only what
// it changes (figma-ops.mjs operations), each checked against the system; everything new follows its construction
// grammar, and nothing outside it is touched. Before anything is written, the report compares the component as the capture
// reads it now with the same component once the change is made (a prediction); once it is made and Figma is read again, it
// compares the read before with the read after (the real result), and says where the real result differs from the
// prediction. Layers are matched by their key (the node id when the capture has it), so a rename is a rename.
//
//   parseChange(text, model) → { ops, unread }: the changes said in words the engine reads itself ("add xl to size like
//     l", "add a boolean showBadge on Content/Badge", "rename Label to Text", "remove the option size=xs", "bind Content
//     gap to spacing/s"); what it cannot read is unread, for the agent to write as operations
//   changeOf({ component, asked, ops, captures, grammar, livesIn }) → the change: the operations as grounded, the
//     report (skeleton, architecture, variables), where the component is used, what breaks, what is held for sign-off,
//     and the faults it already had (listed apart, never fixed)
//   changeLines(change) → what the run prints
//   realOf(change, after) → { real, mismatch }: the real difference, and where it is not the predicted one
//   realLines(result, component) → what the run prints after
//   changesView(ROOT) → every change, for the style guide's Changes in Figma page and each component's History: the ones
//     waiting to be made (changes/<component>.change.json) and the ones made and read again (changes/done/), newest first
//
// Pure but for changesView, which reads the changes the engine kept.
import { ground, predict, modelOf, opWords, FIELDS, optionNamed } from './figma-ops.mjs';
import { diffModels, diffLines } from './component-diff.mjs';

const W = `["'\`]?`;
const NAME = '([\\w/=.-]+(?: [\\w-]+)?)';
const CLAUSE = /\s*(?:;|\n|\.\s+|,\s*then\s+|\s+and then\s+|\s+then\s+)\s*/i;

export function parseChange(text = '', model = null) {
  const ops = [], unread = [];
  const axes = model?.axes ?? [], props = model?.properties ?? [], layers = Object.values(model?.layers ?? {}).map((l) => l.path);
  const axisOf = (opt) => axes.find((a) => a.options.some((o) => o.name === opt))?.name ?? axes.find((a) => optionNamed(model, a.name, opt))?.name ?? null;
  const pathOf = (n) => layers.find((p) => p === n) ?? layers.find((p) => p.split('/').at(-1).toLowerCase() === String(n).toLowerCase()) ?? n;
  const isLayer = (n) => layers.some((p) => p === n || p.split('/').at(-1).toLowerCase() === String(n).toLowerCase());
  // The component and Figma named in the words are where it is, not what changes: "add xl to the chip's size in Figma".
  const esc = (x) => String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const n = model?.name ? esc(model.name) : null;
  const own = n ? [new RegExp(`\\b(?:the )?${n}'s\\s+`, 'gi'), new RegExp(`\\s+(?:to|on|of|in|from|for) (?:the )?${n}\\b(?=\\s*(?:$|,|\\s(?:in|like|as|copied|from)\\b))`, 'gi'), new RegExp(`\\b(?:the )?${n}\\s+`, 'gi')] : [];
  for (const raw of String(text).split(CLAUSE).map((x) => x.trim().replace(/[.,]+$/, '')).filter(Boolean)) {
    let c = raw.replace(/^(?:please\s+|and\s+|also\s+)/i, '').replace(/\s+(?:in|no|na) figma\b/i, '');
    for (const r of own) c = c.replace(r, '').replace(/\s{2,}/g, ' ').trim();
    // "the Label layer" is the layer Label.
    c = c.replace(/\b(?!a\b|an\b|the\b|new\b)([\w/-]+) layer\b/i, 'layer $1');
    let m;
    // add a boolean|text|swap property <name> on|for <layer>
    if ((m = c.match(new RegExp(`^add (?:an? )?(?:new )?(boolean|text|swap|instance swap)(?: property)? ${W}([\\w -]+?)${W} (?:on|for|to|driving|that (?:shows|writes|swaps)) (?:the )?(?:layer )?${W}([\\w/ -]+?)${W}(?:,? (default|on|off|shown|hidden|unless set)(?:[: ]+${W}([\\w -]+?)${W})?)?$`, 'i')))) {
      const kind = m[1].toLowerCase() === 'instance swap' ? 'swap' : m[1].toLowerCase();
      const said = m[5] ?? (/^(on|off|shown|hidden)$/i.test(m[4] ?? '') ? m[4] : null);
      const def = said == null ? (kind === 'boolean' ? true : null) : kind === 'boolean' ? !/^(false|off|no|hidden)$/i.test(said) : said;
      ops.push({ op: 'addProperty', name: m[2].trim(), kind, default: def, layer: pathOf(m[3].trim()) });
      continue;
    }
    // add <option> to <axis> [like <option>] · add a <axis> <option> [like <option>] · add <axis>=<option>
    if ((m = c.match(new RegExp(`^add (?:an? )?(?:new )?(?:option |variant )?${W}([\\w.-]+)${W} (?:to|on|in) (?:the )?${W}([\\w-]+)${W}(?: (?:axis|variant|property|options?))?(?:,? (?:like|as|copied from|from) (?:the )?${W}([\\w.-]+)${W}(?: one)?)?$`, 'i'))) && axes.some((a) => a.name.toLowerCase() === m[2].toLowerCase())) {
      ops.push({ op: 'addOption', axis: axes.find((a) => a.name.toLowerCase() === m[2].toLowerCase()).name, option: m[1], ...(m[3] ? { like: m[3] } : {}) });
      continue;
    }
    if ((m = c.match(new RegExp(`^add (?:an? )?(?:new )?${W}([\\w-]+)${W}(?:=| option | )${W}([\\w.-]+)${W}(?:,? (?:like|as|copied from|from) (?:the )?${W}([\\w.-]+)${W}(?: one)?)?$`, 'i'))) && axes.some((a) => a.name.toLowerCase() === m[1].toLowerCase())) {
      ops.push({ op: 'addOption', axis: axes.find((a) => a.name.toLowerCase() === m[1].toLowerCase()).name, option: m[2], ...(m[3] ? { like: m[3] } : {}) });
      continue;
    }
    // add an <option> <axis> [, like the <option> one] · remove the <option> <axis>
    const axisNamed = (w) => axes.find((a) => a.name.toLowerCase() === String(w).toLowerCase())?.name ?? null;
    const LIKE = `(?:,? (?:like|as|copied from|from) (?:the )?${W}([\\w.-]+)${W}(?: one)?)?`;
    if ((m = c.match(new RegExp(`^add (?:an? )?(?:new )?${W}([\\w.-]+)${W} ([\\w-]+)(?: option| variant)?${LIKE}$`, 'i'))) && axisNamed(m[2])) {
      ops.push({ op: 'addOption', axis: axisNamed(m[2]), option: m[1], ...(m[3] ? { like: m[3] } : {}) });
      continue;
    }
    if ((m = c.match(new RegExp(`^(?:remove|delete|drop) (?:the )?${W}([\\w.-]+)${W} ([\\w-]+)(?: option| variant)?$`, 'i'))) && axisNamed(m[2])) {
      ops.push({ op: 'removeOption', axis: axisNamed(m[2]), option: m[1] });
      continue;
    }
    // remove the <axis> <option> ("remove the size small")
    if ((m = c.match(new RegExp(`^(?:remove|delete|drop) (?:the )?([\\w-]+)(?: option| variant)? ${W}([\\w.-]+(?: [\\w-]+)?)${W}$`, 'i'))) && axisNamed(m[1]) && optionNamed(model, axisNamed(m[1]), m[2])) {
      ops.push({ op: 'removeOption', axis: axisNamed(m[1]), option: optionNamed(model, axisNamed(m[1]), m[2]) });
      continue;
    }
    // rename [the component|axis|option|property|layer] <from> to <to>
    if ((m = c.match(new RegExp(`^rename (?:the )?(?:(component|axis|variant|option|property|layer) )?${W}${NAME}${W} (?:to|as|into) ${W}([\\w/ -]+?)${W}$`, 'i')))) {
      const from = m[2].trim(), to = m[3].trim();
      // Figma calls a variant axis a property too: a "property" that is an axis is renamed as one.
      const said0 = { variant: 'axis' }[m[1]?.toLowerCase()] ?? m[1]?.toLowerCase();
      const said = said0 === 'property' && !props.some((p) => p.name === from) && axes.some((a) => a.name === from) ? 'axis' : said0;
      if (from.includes('=')) { const [axis, opt] = from.split('='); ops.push({ op: 'rename', what: 'option', axis, from: opt, to }); continue; }
      const what = said ?? (props.some((p) => p.name === from) ? 'property' : axes.some((a) => a.name === from) ? 'axis' : axisOf(from) ? 'option' : isLayer(from) ? 'layer' : from === model?.name ? 'component' : null);
      if (!what) { unread.push(raw); continue; }
      ops.push(what === 'option' ? { op: 'rename', what, axis: axisOf(from), from, to } : what === 'layer' ? { op: 'rename', what, from: pathOf(from), to } : { op: 'rename', what, from, to });
      continue;
    }
    // remove [the] [option|property|layer] <name>
    if ((m = c.match(new RegExp(`^(?:remove|delete|drop) (?:the )?(?:(option|property|layer) )?${W}${NAME}${W}$`, 'i')))) {
      const n = m[2].trim(), what = m[1]?.toLowerCase();
      if (n.includes('=')) { const [axis, option] = n.split('='); ops.push({ op: 'removeOption', axis, option }); continue; }
      if (what === 'property' || (!what && props.some((p) => p.name === n))) { ops.push({ op: 'removeProperty', name: n }); continue; }
      if (what === 'option' || (!what && axisOf(n))) { ops.push({ op: 'removeOption', axis: axisOf(n), option: n }); continue; }
      if (what === 'layer' || (!what && isLayer(n))) { ops.push({ op: 'removeLayer', layer: pathOf(n) }); continue; }
      unread.push(raw); continue;
    }
    // bind [the] <layer|frame> <field> to <variable>
    if ((m = c.match(new RegExp(`^bind (?:the )?(?:${W}([\\w/ -]+?)${W}(?:'s)? )?(${FIELDS.join('|')}|font ?size|stroke ?weight|corner ?radius|padding [xy]) (?:to|with) ${W}([\\w/.#()-]+)${W}(?: where ${W}([\\w-]+)=([\\w.-]+)${W})?$`, 'i')))) {
      const field = m[2].replace(/\s+(\w)/, (_, x) => x.toUpperCase()).replace(/^cornerRadius$/i, 'radius').replace(/^padding([xy])$/i, (_, x) => `padding${x.toUpperCase()}`);
      const layer = !m[1] || /^(component|frame|its frame|it|root)$/i.test(m[1].trim()) ? '' : pathOf(m[1].trim());
      ops.push({ op: 'bind', layer, field, variable: m[3], ...(m[4] ? { where: { [m[4]]: m[5] } } : {}) });
      continue;
    }
    // move every <variable> to <variable>
    if ((m = c.match(new RegExp(`^(?:rebind|move|replace) (?:every (?:binding of )?)?${W}([\\w/.-]+)${W} (?:to|with|by) ${W}([\\w/.-]+)${W}$`, 'i'))) && m[1].includes('/')) { ops.push({ op: 'rebind', from: m[1], to: m[2] }); continue; }
    // its description: "…"
    if ((m = c.match(/^(?:set |write |change |update )?(?:its |the )?description(?: to| as|:)?\s+(?:["“](.+)["”]|(.+))$/i))) { ops.push({ op: 'describe', text: (m[1] ?? m[2]).trim() }); continue; }
    unread.push(raw);
  }
  return { ops, unread };
}

// The faults the component already has, by the grammar's rules to fix: listed apart, never fixed with the change.
const faultsOf = (grammar, component) => (grammar?.figma?.rules ?? []).filter((r) => r.status === 'fix').flatMap((r) => r.toFix.filter((t) => t.component === component).map((t) => ({ rule: r.id, says: r.says, value: t.value })));

// library: what Figma's library analytics say of it in every team file ({ instances, files }), or why that was not
// seen ({ unseen }): figma-analytics.mjs.
export function changeOf({ component, asked = '', ops = [], captures = {}, grammar = null, livesIn = null, library = null, at = null } = {}) {
  const before = modelOf(component, captures);
  const grounded = ground(ops, { captures, grammar, target: component });
  const after = predict(before, grounded.ops, captures);
  return {
    kind: 'change', component, nodeId: before?.nodeId ?? null, asked, at,
    ops: grounded.ops, questions: grounded.questions, named: grounded.named, held: grounded.held, breaking: grounded.breaking,
    report: diffModels(before, after), usedBy: usageOf(livesIn, library), faults: faultsOf(grammar, component), before, predicted: after,
  };
}

// Where it is used, from its contract (usage-map.mjs → livesIn): the products whose code uses it, the components it sits
// inside, the screens that draw it. Team files the engine does not read are said, not guessed.
function usageOf(l, library = null) {
  if (!l && !library) return null;
  const products = (l?.products ?? []).map((p) => `${p.name ?? 'the system\'s own pages'} (${p.files} file${p.files === 1 ? '' : 's'})`);
  return { products, inside: (l?.inside ?? []).map((x) => (typeof x === 'string' ? x : x.name)).filter(Boolean), screens: (l?.screens ?? []).length, ...(library ? { library } : {}) };
}

export function changeLines(ch) {
  const out = [`${ch.component}: the change${ch.asked ? ` asked ("${ch.asked}")` : ''}, ${ch.ops.length} step${ch.ops.length === 1 ? '' : 's'}:`, ...ch.ops.map((o) => `   • ${opWords(o)}`)];
  const d = diffLines(ch.report);
  if (d.length) out.push('What changes (the component now, beside it once the change is made):', ...d);
  if (ch.usedBy) {
    const u = ch.usedBy;
    const lib = u.library;
    const inFiles = lib?.instances != null ? `${lib.instances} instance${lib.instances === 1 ? '' : 's'} in ${lib.files} team file${lib.files === 1 ? '' : 's'} (Figma's library analytics)` : null;
    out.push(`Where it is used: ${[u.products.length ? `the code of ${u.products.join(', ')}` : null, u.inside.length ? `inside ${u.inside.join(', ')}` : null, u.screens ? `${u.screens} Figma screen${u.screens === 1 ? '' : 's'}` : null, inFiles].filter(Boolean).join('; ') || 'nowhere the engine reads'}.${inFiles ? '' : ` Team files the engine does not read are not counted${lib?.unseen ? ` (${lib.unseen})` : ''}.`}`);
  }
  if (ch.breaking.length) out.push(`Breaking (${ch.breaking.length}), held for sign-off with what they break:`, ...ch.breaking.map((b) => `   • ${b.what}`));
  if (ch.held.length) out.push(`Held for sign-off (it adds to the system): ${ch.held.map((h) => h.what).join('; ')}.`);
  if (ch.named.length) out.push('Named the way the system names things:', ...ch.named.map((n) => `   • ${n.from} → ${n.to}`));
  if (ch.faults.length) out.push(`Faults ${ch.component} already has, not fixed by this change (${ch.faults.length}; --figma-fix ${ch.component} fixes the renames):`, ...ch.faults.slice(0, 6).map((f) => `   • ${f.says}${f.value ? `: ${f.value}` : ''}`), ...(ch.faults.length > 6 ? [`   • and ${ch.faults.length - 6} more`] : []));
  if (ch.questions.length) out.push(`To answer before it is made (${ch.questions.length}):`, ...ch.questions.map((q) => `   • ${q.ask}`));
  return out;
}

// The real difference, read again from Figma, beside the predicted one. A layer the change added has no node id in the
// prediction: it is matched to the real one by its path.
export function realOf(ch, after) {
  const real = diffModels(ch.before, after);
  const p = JSON.parse(JSON.stringify(ch.predicted ?? {}));
  const keyOfPath = Object.fromEntries(Object.entries(after?.layers ?? {}).map(([k, l]) => [l.path, k]));
  for (const [k, l] of Object.entries(p.layers ?? {})) if (k.startsWith('new:') && keyOfPath[l.path]) { p.layers[keyOfPath[l.path]] = l; delete p.layers[k]; for (const b of Object.keys(p.binds ?? {})) if (b.startsWith(`${k}|`)) { p.binds[keyOfPath[l.path] + b.slice(k.length)] = p.binds[b]; delete p.binds[b]; } }
  const keyed = (list) => Object.fromEntries((list ?? []).map((x) => [x.name, x]));
  for (const k of ['axes', 'properties']) { const r = keyed(after?.[k]); p[k] = (p[k] ?? []).map((x) => (r[x.name] ? { ...x, k: r[x.name].k, options: x.options?.map((o) => ({ ...o, k: r[x.name].options?.find((y) => y.name === o.name)?.k ?? o.k })) } : x)); }
  const left = diffModels({ ...p, name: p.name }, after);
  const mismatch = [...left.skeleton, ...left.architecture.filter((x) => x.what !== 'variants' || x.from !== x.to), ...left.variables];
  return { real, mismatch };
}

export function realLines({ real, mismatch }, component) {
  const d = diffLines(real);
  return [
    `${component}: what changed in Figma (the read before, beside the read after):`,
    ...(d.length ? d : ['   nothing: the read after is the same as the read before.']),
    mismatch.length ? `⚠️  Not what the change said (${mismatch.length}):` : '✅ It is what the change said.',
    ...mismatch.map((x) => `   • ${x.change} ${x.what}${x.from != null || x.to != null ? `: ${[x.from, x.to].filter((y) => y != null).join(' → ')}` : ''}`),
  ];
}

// Every change the engine kept: waiting to be made, or made and read again. → [{ component, at, asked, steps, status:
// 'waiting' | 'made' | 'not as said', report, real, mismatch, usedBy, breaking, held, faults, signedOff, readAt }]
export function changesView(ROOT, { outDir = '.design-system-engine-out', readdirSync, readFileSync, join } = {}) {
  const dir = join(ROOT, outDir, 'changes'), out = [];
  const read = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
  const list = (d) => { try { return readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => join(d, f)); } catch { return []; } };
  for (const f of [...list(dir), ...list(join(dir, 'done'))]) {
    const ch = read(f);
    if (!ch?.component || ch.kind !== 'change') continue;
    const last = (ch.done ?? []).at(-1);
    out.push({ component: ch.component, at: ch.at, asked: ch.asked ?? '', steps: (ch.ops ?? []).map(opWords), status: !last ? 'waiting' : last.mismatch?.length ? 'not as said' : 'made',
      report: ch.report, real: last?.real ?? null, mismatch: last?.mismatch ?? [], readAt: last?.readAt ?? null, usedBy: ch.usedBy ?? null, breaking: ch.breaking ?? [], held: ch.held ?? [], faults: ch.faults ?? [], signedOff: ch.signedOff ?? null });
  }
  // One change made twice (its file waiting, and kept once made) is shown once, as made.
  const seen = new Set();
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)) || (a.status === 'waiting') - (b.status === 'waiting')).filter((x) => { const k = `${x.component}|${x.at}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
