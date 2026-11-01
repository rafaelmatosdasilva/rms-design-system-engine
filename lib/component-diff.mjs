// component-diff.mjs - what a build or a change does to a component, as the difference between two structured reads of
// it (figma-ops.mjs modelOf, predict), never a description from memory.
//
//   diffModels(before, after) → { skeleton, architecture, variables }: each a list of { change: added | removed |
//     renamed | changed, what, from?, to? }. Layers, axes, options and properties are matched by their key (the node id
//     when the capture has one, else what it was first called), so a rename is a rename, never a removal and an addition.
//   diffLines(diff, { indent }) → the same in a few lines, section by section
//
// Pure: no file is read or written here.

const byKey = (list = []) => new Map(list.map((x) => [x.k, x]));

export function diffModels(a, b) {
  const skeleton = [], architecture = [], variables = [];
  if (!b) return { skeleton, architecture, variables };
  a ??= { name: null, axes: [], properties: [], variants: [], layers: {}, binds: {}, description: '' };
  if (a.name && a.name !== b.name) architecture.push({ change: 'renamed', what: 'component', from: a.name, to: b.name });

  // Skeleton: the layers, by key.
  for (const [k, l] of Object.entries(b.layers ?? {})) {
    const was = a.layers?.[k];
    if (!was) skeleton.push({ change: 'added', what: `${l.type === 'INSTANCE' ? `${l.of ?? 'an'} instance` : String(l.type).toLowerCase()} ${l.path}` });
    else if (was.path !== l.path) skeleton.push({ change: was.path.split('/').at(-1) === l.path.split('/').at(-1) ? 'moved' : 'renamed', what: 'layer', from: was.path, to: l.path });
  }
  for (const [k, l] of Object.entries(a.layers ?? {})) if (!b.layers?.[k]) skeleton.push({ change: 'removed', what: `layer ${l.path}` });

  // Architecture: axes and their options, properties, the variants, what it nests, its description and where it sits.
  const ax = byKey(a.axes), bx = byKey(b.axes);
  for (const [k, x] of bx) {
    const was = ax.get(k);
    if (!was) { architecture.push({ change: 'added', what: `variant axis ${x.name} (${x.options.map((o) => o.name).join(', ')})` }); continue; }
    if (was.name !== x.name) architecture.push({ change: 'renamed', what: 'variant axis', from: was.name, to: x.name });
    const wo = byKey(was.options), no = byKey(x.options);
    for (const [ok, o] of no) { const w = wo.get(ok); if (!w) architecture.push({ change: 'added', what: `option ${x.name}=${o.name}` }); else if (w.name !== o.name) architecture.push({ change: 'renamed', what: `option of ${x.name}`, from: w.name, to: o.name }); }
    for (const [ok, o] of wo) if (!no.has(ok)) architecture.push({ change: 'removed', what: `option ${x.name}=${o.name}` });
  }
  for (const [k, x] of ax) if (!bx.has(k)) architecture.push({ change: 'removed', what: `variant axis ${x.name}` });
  const pa = byKey(a.properties), pb = byKey(b.properties);
  const KIND = { BOOLEAN: 'boolean', TEXT: 'text', INSTANCE_SWAP: 'swap', SLOT: 'slot' };
  for (const [k, p] of pb) {
    const was = pa.get(k);
    if (!was) architecture.push({ change: 'added', what: `${KIND[p.kind] ?? p.kind} property ${p.name}${p.default != null ? ` (${p.default} unless set)` : ''}` });
    else {
      if (was.name !== p.name) architecture.push({ change: 'renamed', what: 'property', from: was.name, to: p.name });
      if (String(was.default) !== String(p.default) && p.kind !== 'INSTANCE_SWAP') architecture.push({ change: 'changed', what: `${p.name} unless set`, from: was.default, to: p.default });
    }
  }
  for (const [k, p] of pa) if (!pb.has(k)) architecture.push({ change: 'removed', what: `property ${p.name}` });
  const va = new Set(a.variants ?? []), vb = new Set(b.variants ?? []);
  if (a.name && va.size !== vb.size) architecture.push({ change: 'changed', what: 'variants', from: va.size, to: vb.size });
  const wired = (m) => new Map(Object.entries(m.layers ?? {}).flatMap(([k, l]) => Object.entries(l.wired ?? {}).map(([f, p]) => [`${k}|${f}`, { p, path: l.path, f }])));
  const wa = wired(a), wb = wired(b);
  const WORD = { visible: 'shows', characters: 'writes', mainComponent: 'swaps' };
  for (const [k, w] of wb) if (!wa.has(k) && !architecture.some((x) => x.change === 'added' && x.what.endsWith(` ${w.p}`))) architecture.push({ change: 'added', what: `${w.p} ${WORD[w.f] ?? w.f} ${w.path}` });
  // A new component built as a copy starts with no description of its own, and beside the one it is a copy of.
  const copyOf = b.from && b.from === a.name;
  if (a.name && !copyOf && (a.description ?? '') !== (b.description ?? '')) architecture.push({ change: b.description ? (a.description ? 'changed' : 'added') : 'removed', what: 'description', ...(b.description ? { to: b.description } : {}) });
  if (a.name && !copyOf && ((a.page ?? null) !== (b.page ?? null) || (a.section ?? null) !== (b.section ?? null))) architecture.push({ change: 'moved', what: 'component', from: [a.page, a.section].filter(Boolean).join(' › '), to: [b.page, b.section].filter(Boolean).join(' › ') });

  // Variables: each binding, layer and field, from → to.
  const path = (m, key) => { const [k, f] = key.split('|'); return `${k === '' ? 'its frame' : m.layers?.[k]?.path ?? k} ${f}`; };
  // Each layer and field holds every variant's variables (a list): one moved to another is changed, else added or removed.
  const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);
  const gone = (k) => k.split('|')[0] in (a.layers ?? {}) && !(k.split('|')[0] in (b.layers ?? {}));
  for (const k of new Set([...Object.keys(a.binds ?? {}), ...Object.keys(b.binds ?? {})])) {
    if (gone(k)) continue;
    const was = list(a.binds?.[k]), now = list(b.binds?.[k]);
    const out = was.filter((v) => !now.includes(v)), inn = now.filter((v) => !was.includes(v));
    const where = path(b.binds?.[k] ? b : a, k);
    if (out.length && inn.length) variables.push({ change: 'changed', what: where, from: out.join(', '), to: inn.join(', ') });
    else if (inn.length) variables.push({ change: 'added', what: where, to: inn.join(', ') });
    else if (out.length) variables.push({ change: 'removed', what: where, from: out.join(', ') });
  }
  return { skeleton, architecture, variables };
}

const SECTION = { skeleton: 'Skeleton (its layers)', architecture: 'Architecture (axes, options, properties, what it nests)', variables: 'Variables (each binding)' };
export function diffLines(d, { indent = '   ', most = 12 } = {}) {
  const out = [];
  for (const k of ['skeleton', 'architecture', 'variables']) {
    const list = d?.[k] ?? [];
    if (!list.length) continue;
    out.push(`${indent}${SECTION[k]}:`);
    for (const x of list.slice(0, most)) out.push(`${indent}   ${{ added: '+', removed: '−', renamed: '↻', moved: '→', changed: '~' }[x.change] ?? '·'} ${x.what}${x.from != null && x.to != null ? `: ${x.from} → ${x.to}` : x.from != null || x.to != null ? `: ${x.from ?? x.to}` : ''}`);
    if (list.length > most) out.push(`${indent}   … and ${list.length - most} more`);
  }
  return out;
}
