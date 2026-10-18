// guidance-rating.mjs - how much an agent can take from the team's guidance, component by component.
//
// The guidance is what the team writes for people and agents: the guidelines files the engine reads (guidelines.sources,
// and the Notion and GitLab links it fetches into files), one section per component under a heading with its name, and
// what Figma's description and annotations say. Each component is rated on what an agent needs to pick it and use it
// right, read from that text alone:
//   • a section of its own, under its exact name;
//   • what it is, when to use it, when not to, its role, an example;
//   • its properties named as Figma names them;
//   • no name that exists nowhere (a token, a property or a component the system does not have: stale or invented).
// The class says how far it goes: ready (an agent can pick it and use it from the text), partial (some of it), thin
// (little or nothing). The document as a whole gets the same class, from how many of its components are ready.
//
// An extraction test, only when asked (it spends the person's model tokens): questions the engine writes from its own
// facts (the options of each property), answered by a model that sees only the guidance, scored against those facts.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const clean = (k) => String(k).replace(/#[\d:]+$/, '');
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// What the system has, from the Figma snapshots: each component with its properties (and a variant's options), and
// every token's name. → { components: { name: { props: [{ name, type, options }] } }, tokens: Set }
export function systemFacts({ props = {}, structure = {}, vars = {} } = {}) {
  const components = {};
  for (const [name, e] of Object.entries(props ?? {})) {
    if (name.startsWith('_') || !e || typeof e !== 'object') continue;
    components[name] = { props: Object.entries(e.properties ?? {}).map(([k, d]) => ({ name: clean(k), type: d?.type ?? null, options: Array.isArray(d?.variantOptions) ? d.variantOptions.map(String) : [] })) };
  }
  for (const name of Object.keys(structure?.components ?? structure ?? {})) if (!name.startsWith('_') && !components[name]) components[name] = { props: [] };
  const tokens = new Set();
  const walk = (o, depth) => { for (const [k, v] of Object.entries(o ?? {})) { if (k.startsWith('_')) continue; if (k.includes('/')) tokens.add(k); else if (v && typeof v === 'object' && depth < 3) walk(v, depth + 1); else if (depth > 0) tokens.add(k); } };
  for (const group of ['color', 'sizing', 'typography', 'motion', 'effects', 'strings', 'booleans', 'animation', 'primitives', 'breakpoints']) walk(vars?.[group], 0);
  return { components, tokens };
}

// The pieces an agent needs, each found in the text by a line that starts with its name or by what it plainly is.
const PIECES = [
  ['what', 'What it is', (t) => /\b(what it is|purpose|description)\s*[:–—-]/i.test(t) || /^\s*[A-Z][^\n:]{20,}[.!]/m.test(t)],
  ['whenToUse', 'When to use', (t) => /\b(when to use|use (it )?when|usage|quando usar)\b/i.test(t)],
  ['whenNotToUse', 'When not to use', (t) => /\b(when not to use|do not use|don'?t use|avoid|quando n[ãa]o usar)\b/i.test(t)],
  ['role', 'Role', (t) => /\b(role|aria-|screen reader|accessib|acessib)/i.test(t)],
  ['example', 'An example', (t) => /```|\bexample\b|\bexemplo\b|\bdo\s*(and|&)\s*don'?t\b|<[a-z][\w-]*[\s>]/i.test(t)],
];

// The names a text gives as code: `like-this`, `--a-variable`, `group/name`.
const namesIn = (t) => [...String(t).matchAll(/`([^`\n]{2,60})`/g)].map((m) => m[1].trim());

// One component's guidance against the system. text: what the guidance says about it (its section and Figma's
// description). → { name, cls, pieces: { key: bool }, props: { named, total, missing }, unknown: [], add: [] }
export function rateComponent(name, text, facts) {
  const t = String(text ?? '').trim();
  const comp = facts.components?.[name] ?? { props: [] };
  const pieces = Object.fromEntries(PIECES.map(([k, , has]) => [k, !!t && has(t)]));
  const propNames = [...new Set(comp.props.map((p) => p.name))];
  const named = propNames.filter((p) => new RegExp(`(^|[^\\w])${esc(p)}([^\\w]|$)`, 'i').test(t));
  const known = new Set([...facts.tokens ?? [], ...propNames, ...comp.props.flatMap((p) => p.options), ...Object.keys(facts.components ?? {})].map(norm));
  const unknown = [...new Set(namesIn(t).filter((n) => /^--|\/|^[a-z]+[A-Z]\w*$/.test(n) && !known.has(norm(n)) && !known.has(norm(n.replace(/^--/, '')))))];
  // What to add, the names that mislead an agent first.
  const add = unknown.map((u) => `\`${u}\` exists nowhere in the system: rename it or take it out`);
  if (!t) add.push(`a section headed ${name}, its exact name`);
  for (const [k, title] of PIECES) if (t && !pieces[k]) add.push(title.toLowerCase());
  const missingProps = propNames.filter((p) => !named.includes(p));
  if (t && missingProps.length) add.push(`its ${missingProps.length === 1 ? 'property' : 'properties'} by name: ${missingProps.slice(0, 6).join(', ')}${missingProps.length > 6 ? ', …' : ''}`);
  const core = ['what', 'whenToUse', 'whenNotToUse', 'role'].filter((k) => pieces[k]).length;
  const propShare = propNames.length ? named.length / propNames.length : 1;
  const cls = !t ? 'thin' : core === 4 && pieces.example && propShare >= 0.5 && !unknown.length ? 'ready' : core >= 2 ? 'partial' : 'thin';
  return { name, cls, pieces, props: { named: named.length, total: propNames.length, missing: missingProps }, unknown, add };
}

// The whole guidance. sections: { component: text } (each component's own text), general: the rest. → { cls, ready,
// partial, thin, total, components: [rating], unmatched: [headings that name no component] }
export function rateGuidance({ sections = {}, general = '', headings = [] } = {}, facts) {
  const components = Object.keys(facts.components ?? {}).sort().map((n) => rateComponent(n, sections[n] ?? '', facts));
  const count = (c) => components.filter((r) => r.cls === c).length;
  const ready = count('ready'), partial = count('partial'), thin = count('thin'), total = components.length;
  const share = total ? ready / total : 0, some = total ? (ready + partial) / total : 0;
  const cls = !total ? 'thin' : share >= 0.8 ? 'ready' : some >= 0.5 ? 'partial' : 'thin';
  const byKey = new Map(Object.keys(facts.components ?? {}).map((n) => [norm(n), n]));
  const unmatched = headings.filter((h) => !byKey.has(norm(h)));
  return { cls, ready, partial, thin, total, components, unmatched, generalLength: String(general).length };
}

// What the guidance says about each component: its guidelines section (heading = its name, any spelling the engine
// matches) and Figma's description and annotations. gl: ingestGuidelines() of intent-gen.mjs. figmaText: { name: text }.
export function sectionsFrom(gl, facts, figmaText = {}) {
  const byKey = new Map(Object.keys(facts.components ?? {}).map((n) => [norm(n), n]));
  const sections = {}, headings = [];
  for (const s of gl?.sections ?? []) {
    headings.push(s.heading);
    const name = byKey.get(norm(s.heading));
    if (name) sections[name] = [sections[name], s.body].filter(Boolean).join('\n\n');
  }
  for (const [name, t] of Object.entries(figmaText)) if (byKey.has(norm(name)) && String(t ?? '').trim()) sections[name] = [sections[name], t].filter(Boolean).join('\n\n');
  return { sections, general: gl?.general ?? '', headings };
}

// Figma's own words for each component, from the props snapshot (description, annotations, layer annotations).
export function figmaWords(props = {}) {
  const out = {};
  for (const [name, e] of Object.entries(props ?? {})) {
    if (name.startsWith('_') || !e || typeof e !== 'object') continue;
    const ann = [...(e.annotations ?? []), ...(e.layerAnnotations ?? []).flatMap((l) => l.annotations ?? [])].map((a) => a?.label ?? a?.labelMarkdown ?? '').filter(Boolean);
    const t = [e.description ?? '', ...ann].join('\n').trim();
    if (t) out[name] = t;
  }
  return out;
}

// ── The extraction test: questions from the engine's facts, a model that sees only the guidance ─────────────────────
// One question for each property with options: "Which options does the <prop> property of <component> take?" The
// answer is scored by how many of its real options it names. → [{ id, component, q, expect: [options] }]
export function extractionQuestions(facts, { max = 40 } = {}) {
  const qs = [];
  for (const [name, c] of Object.entries(facts.components ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    for (const p of c.props) if (p.options.length >= 2) qs.push({ id: `${name}.${p.name}`, component: name, q: `Which options does the ${p.name} property of the ${name} component take? Answer with the options only, separated by commas, or say "not in the document".`, expect: p.options });
  }
  return qs.slice(0, max);
}
// The prompt the model gets: the guidance, then the questions, one answer per line.
export function extractionPrompt(guidanceText, qs) {
  return `Answer only from the design system guidance below. Do not guess: when the guidance does not say, answer "not in the document".\n\n--- GUIDANCE ---\n${guidanceText}\n--- END ---\n\nAnswer each question on its own line, starting with its number and a closing bracket, like 1) answer.\n\n${qs.map((q, i) => `${i + 1}) ${q.q}`).join('\n')}\n`;
}
// The answers against the facts. → { score (0..1), byComponent: { name: share }, answers: [{ id, got, found, of }] }
export function scoreExtraction(qs, out) {
  const lines = new Map([...String(out ?? '').matchAll(/^\s*(\d+)\)\s*(.*)$/gm)].map((m) => [Number(m[1]), m[2]]));
  const answers = qs.map((q, i) => {
    const got = lines.get(i + 1) ?? '';
    const words = new Set(got.split(/[,;/]|\s+or\s+|\s+and\s+/i).map(norm).filter(Boolean));
    const found = q.expect.filter((o) => words.has(norm(o))).length;
    return { id: q.id, component: q.component, got, found, of: q.expect.length };
  });
  const byComponent = {};
  for (const a of answers) { const b = (byComponent[a.component] ??= { found: 0, of: 0 }); b.found += a.found; b.of += a.of; }
  const all = answers.reduce((s, a) => [s[0] + a.found, s[1] + a.of], [0, 0]);
  return { score: all[1] ? all[0] / all[1] : 0, byComponent: Object.fromEntries(Object.entries(byComponent).map(([k, v]) => [k, v.of ? v.found / v.of : 0])), answers };
}
// Ask the model through the person's own command (guidelines.extract.cmd, default `claude -p`): the prompt on stdin,
// the answer on stdout. → { out, ok, why }
export function askModel(prompt, cmd = 'claude -p', { timeout = 300000, env = process.env } = {}) {
  const r = spawnSync(cmd, { shell: true, input: prompt, encoding: 'utf8', timeout, env, maxBuffer: 16 * 1024 * 1024 });
  if (r.error || r.status !== 0) return { out: '', ok: false, why: String(r.error?.message ?? r.stderr ?? `exit ${r.status}`).trim().split('\n')[0] };
  return { out: r.stdout ?? '', ok: true };
}

// ── The report ───────────────────────────────────────────────────────────────────────────────────────────────────
const CLS = { ready: 'Ready', partial: 'Partial', thin: 'Thin' };
export function ratingLines(r, { extraction = null, max = 12 } = {}) {
  const lines = [`📘 Guidance for agents: ${CLS[r.cls]}. ${r.ready} of ${r.total} component${r.total === 1 ? '' : 's'} ready, ${r.partial} partial, ${r.thin} thin.`];
  if (extraction) lines.push(`   Extraction test: a model that saw only the guidance named ${Math.round(extraction.score * 100)}% of the property options right.`);
  const weak = r.components.filter((c) => c.cls !== 'ready').sort((a, b) => (a.cls === b.cls ? a.name.localeCompare(b.name) : a.cls === 'thin' ? -1 : 1));
  for (const c of weak.slice(0, max)) lines.push(`   • ${c.name} (${c.cls}): add ${c.add.slice(0, 4).join('; ')}${c.add.length > 4 ? '; …' : ''}`);
  if (weak.length > max) lines.push(`   … and ${weak.length - max} more in .design-system-engine-out/guidance-rating.json.`);
  if (r.unmatched.length) lines.push(`   Headings that name no component: ${r.unmatched.slice(0, 8).join(', ')}${r.unmatched.length > 8 ? ', …' : ''}. Head each component's section with its exact name.`);
  return lines;
}

// The facts as a project keeps them. cfg: ds-config.json. → systemFacts()
export function readFacts(ROOT, cfg) {
  const read = (p, fallback) => { for (const f of [p, fallback].filter(Boolean)) { const a = resolve(ROOT, f); if (existsSync(a)) { try { return JSON.parse(readFileSync(a, 'utf8')); } catch { /* unreadable */ } } } return {}; };
  const P = cfg?.paths ?? {};
  const props = read(P.compPropsSnapshot, 'figma-component-props.snapshot.json');
  return { facts: systemFacts({ props, structure: read(P.snapshotStructure, 'figma-structure.snapshot.json'), vars: read(P.snapshotVars, 'figma-vars.snapshot.json') }), props };
}
