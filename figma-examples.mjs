// figma-examples.mjs - the examples the design team placed in the Figma file: each component's instances on its pages
// (outside the component itself), with what they say, so the style guide's Playground opens each component as it is
// really used (a navigation bar with Início, Transferências, Pagamentos…) instead of with placeholder words.
//
//   examplesCaptureScript({ max })   → the read-only Plugin API script (it changes nothing in Figma)
//   examplesSnapshot(answer)         → { _read, components: { name: [example] } }, the snapshot kept beside the others
//   bestExample(snap, name)          → the example a component opens with, or null
//
// An example: { page, frame, props: { Figma property: value }, texts: [its own words], items: [{ component, props,
// texts }] }: its properties as set on the instance (an instance swap by the name of the component it shows), its words
// in reading order, and each instance it holds directly (a bar's tabs, a list's rows), each with the same. The best
// examples come first: one in a frame named for examples, then one on the component's own page, then one on a screen.

// The script run in Figma. Every page is loaded; each component set (or component outside a set) not private to the
// file (a name starting with . or _) gives the instances of its variants, best first, at most `max` of them.
// from, count: the slice of the file's components this run reads (in the file's order), so a large file is read in
// parts each short enough for the Figma tool; the answer says where the next part starts (next) and how many there are.
export function examplesCaptureScript({ max = 3, from = 0, count = 40 } = {}) {
  return `// Read-only: the examples of each component placed in this file. It changes nothing.
await figma.loadAllPagesAsync();
const MAX = ${Number(max) || 3};
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const privateName = (n) => /^[_.]/.test(String(n || '').replace(/^[^A-Za-z0-9_.]+/, ''));
const pageOf = (n) => { let p = n; while (p && p.type !== 'PAGE') p = p.parent; return p; };
const frameOf = (n) => { let p = n.parent, top = null; while (p && p.type !== 'PAGE') { if (p.type === 'FRAME' || p.type === 'SECTION' || p.type === 'COMPONENT' || p.type === 'COMPONENT_SET') top = p; p = p.parent; } return top; };
const inComponent = (n) => { let p = n.parent; while (p && p.type !== 'PAGE') { if (p.type === 'COMPONENT' || p.type === 'COMPONENT_SET') return true; p = p.parent; } return false; };
const ownerName = (mc) => (mc && mc.parent && mc.parent.type === 'COMPONENT_SET' ? mc.parent.name : mc ? mc.name : null);
const names = new Map();
async function swapName(id) { if (!id) return null; if (names.has(id)) return names.get(id); const n = await figma.getNodeByIdAsync(id); const v = n ? ownerName(n.type === 'COMPONENT' ? n : null) || n.name : null; names.set(id, v); return v; }
async function propsOf(i) {
  const out = {};
  for (const [k, p] of Object.entries(i.componentProperties || {})) {
    const key = k.replace(/#[\\d:]+$/, '');
    out[key] = p.type === 'INSTANCE_SWAP' ? await swapName(p.value) : p.value;
  }
  return out;
}
function textsOf(n, stopAtInstances) {
  const out = [];
  const walk = (k) => { if (!k || k.visible === false) return; if (k.type === 'TEXT') { const t = String(k.characters || '').trim(); if (t) out.push(t); return; } if (stopAtInstances && k.type === 'INSTANCE' && k !== n) return; for (const c of k.children || []) walk(c); };
  walk(n);
  return out.slice(0, 12).map((t) => t.slice(0, 60));
}
// The instances it holds directly: those inside it that are not inside another instance it holds.
function itemsOf(n) {
  const out = [];
  const walk = (k) => { for (const c of k.children || []) { if (c.visible === false) continue; if (c.type === 'INSTANCE') out.push(c); else walk(c); } };
  walk(n);
  return out.slice(0, 10);
}
// Figma's own placeholder words for a component (its text properties' defaults: Label, Title): an example that only
// repeats them shows nothing the default does not.
const placeholders = (c) => { const out = new Set(['label', 'title', 'description', 'text', 'placeholder']); try { for (const d of Object.values(c.componentPropertyDefinitions || {})) if (d.type === 'TEXT' && d.defaultValue) out.add(String(d.defaultValue).trim().toLowerCase()); } catch (e) {} return out; };
async function exampleOf(i, comp, ph) {
  const page = pageOf(i), frame = frameOf(i);
  const items = [];
  for (const k of itemsOf(i)) { const mc = await k.getMainComponentAsync(); items.push({ component: ownerName(mc), props: await propsOf(k), texts: textsOf(k, false).slice(0, 4) }); }
  const props = await propsOf(i), texts = textsOf(i, true);
  const words = [...Object.values(props).filter((v) => typeof v === 'string'), ...texts, ...items.flatMap((x) => x.texts)].map((t) => String(t).trim().toLowerCase()).filter(Boolean);
  const real = words.filter((t) => !ph.has(t.replace(/\s*\d+$/, ''))).length;
  // Real words first (an example that only repeats the placeholders comes last), then one in a frame named for
  // examples, then one on the component's own page.
  const score = (real ? 0 : 20) + (/example|usage|showcase|demo/i.test((frame && frame.name) || '') ? 0 : 10) + (squash(page && page.name).includes(squash(comp)) ? 0 : 5) + (items.length ? 0 : 1) - Math.min(real, 5);
  return { page: page ? page.name : null, frame: frame ? frame.name : null, props, texts, items, score };
}
const out = {};
const owners = [];
for (const page of figma.root.children) for (const n of page.findAllWithCriteria({ types: ['COMPONENT_SET', 'COMPONENT'] })) {
  if (n.type === 'COMPONENT' && n.parent && n.parent.type === 'COMPONENT_SET') continue;
  if (privateName(n.name)) continue;
  owners.push(n);
}
const FROM = ${Number(from) || 0}, COUNT = ${Number(count) || 40};
for (const c of owners.slice(FROM, FROM + COUNT)) {
  const variants = c.type === 'COMPONENT_SET' ? c.children.filter((v) => v.type === 'COMPONENT') : [c];
  const found = [];
  for (const v of variants) { let list = []; try { list = await v.getInstancesAsync(); } catch (e) {} for (const i of list) if (!inComponent(i) && i.visible !== false) found.push(i); if (found.length > 400) break; }
  if (!found.length) continue;
  const examples = [];
  const ph = placeholders(c);
  // Those with words of their own first (a quick look at their texts), so a component used on many screens is read
  // where it says something real, not where it repeats its placeholders.
  const said = (i) => textsOf(i, true).some((t) => !ph.has(t.toLowerCase().replace(/\s*\d+$/, '')));
  const pick = found.filter(said).slice(0, 30).concat(found.filter((i) => !said(i)).slice(0, 10));
  for (const i of pick) examples.push(await exampleOf(i, c.name, ph));
  examples.sort((a, b) => a.score - b.score || b.items.length - a.items.length || b.texts.length - a.texts.length);
  const seen = new Set(), keep = [];
  for (const e of examples) { const key = JSON.stringify([e.props, e.texts, e.items.map((x) => x.texts)]); if (seen.has(key)) continue; seen.add(key); delete e.score; keep.push(e); if (keep.length >= MAX) break; }
  out[c.name] = keep;
}
return JSON.stringify({ _read: new Date().toISOString(), _file: figma.root.name, total: owners.length, next: FROM + COUNT < owners.length ? FROM + COUNT : null, components: out });
`;
}

// The answer as it came back (a JSON string, or the tool's wrapping of it) → the snapshot.
// Every part read through a runner (figma-cli eval: run(script) → what it printed): a part retried when the connection
// drops, one figma-cli cuts (it stops an answer at 20,000 characters) read a component at a time, one still too large
// left out and said. → the snapshot.
export async function readExamplesWith(run, { max = 2, count = 4, log = () => {}, wait = 8000 } = {}) {
  const parts = [];
  let from = 0;
  while (from != null) {
    let size = count, text = null;
    for (let tries = 0; tries < 3 && text == null;) {
      const out = String(await run(examplesCaptureScript({ max, from, count: size })) ?? '');
      if (/output cut at/i.test(out)) {
        if (size > 1) { size = 1; continue; }
        log(`the component at ${from} holds more than one answer can carry: left out`);
        text = JSON.stringify({ next: from + 1, components: {} });
      } else if (/"components"/.test(out)) text = out;
      else { tries++; await new Promise((r) => setTimeout(r, wait)); }
    }
    if (text == null) throw new Error(`no answer from Figma for the components from ${from}`);
    parts.push(text);
    const d = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    from = d.next ?? null;
    log(`${Object.keys(d.components).length} components read${from != null ? `, the next from ${from}` : ''}`);
  }
  return examplesSnapshot(parts);
}

// One answer, or several (the parts of one read), each a JSON string or the tool's wrapping of it.
export function examplesSnapshot(answers) {
  const parse = (answer) => {
    const text = String(answer ?? '').trim();
    const at = text.indexOf('{'), end = text.lastIndexOf('}');
    if (at < 0 || end < at) throw new Error('no examples in the answer');
    let data = JSON.parse(text.slice(at, end + 1));
    if (typeof data === 'string') data = JSON.parse(data);
    if (!data || typeof data.components !== 'object') throw new Error('no examples in the answer');
    return data;
  };
  const parts = [].concat(answers).map(parse);
  const components = Object.assign({}, ...parts.map((d) => d.components));
  return { _read: parts[0]._read ?? new Date().toISOString(), ...(parts[0]._file ? { _file: parts[0]._file } : {}), components };
}

// The example a component opens with: of those the capture kept (best placed first), the one whose words differ most
// from Figma's own placeholders (Label, Title), so it opens as it is really used. entry: its props snapshot entry.
export function bestExample(snap, name, entry = null) {
  const list = snap?.components?.[name];
  if (!Array.isArray(list) || !list.length) return null;
  const defaults = new Set(Object.values(entry?.properties ?? {}).filter((d) => d?.type === 'TEXT').map((d) => String(d.defaultValue ?? '').trim()).filter(Boolean));
  const placeholder = (t) => defaults.has(String(t).trim()) || /^(label|title|description|text|placeholder|value)\s*\d*$/i.test(String(t).trim());
  const real = (e) => [...Object.values(e.props ?? {}).filter((v) => typeof v === 'string'), ...(e.texts ?? []), ...(e.items ?? []).flatMap((x) => x.texts ?? [])].filter((t) => String(t).trim() && !placeholder(t)).length;
  return list.map((e, i) => ({ e, i, n: real(e) })).sort((a, b) => b.n - a.n || a.i - b.i)[0].e;
}
