// prototype-context.mjs - everything the engine knows about the system and the product, put in front of whoever
// makes a prototype, with what the person asked for in view.
//
// Figma alone gives a component and its options. The engine gathers much more, and a prototype uses all of it:
//   • Figma: each component's description, annotations (a `Role:` annotation is its role), each option's description,
//     the text styles and spacing tokens, the screen widths (breakpoints), the templates it composes
//     (figma-templates.snapshot.json) and the screens designers made (the screen capture);
//   • the code: what is built, which components hold which, the notes beside a component and above its CSS rule;
//   • what the team authored: contract.authored.json (whenNotToUse, useInstead, status, notes) and the layers of the
//     design intent (system, foundations, patterns, templates, pages, flows);
//   • the team's guidelines, committed or fetched from the Notion and GitLab links in ds-config.json: a section
//     named after a component goes with it, every other section is a rule for the product;
//   • each component's usage, as the style guide shows it: When to use, When not to use, Common mistakes and
//     Limitations (from Figma's description and annotations, the code's note, or contract.authored.json guidance),
//     and its Do and Don't (the captions of the pictures in the references, or contract.authored.json examples).
// From the guidelines it also reads the rules a check can hold a prototype to ("one button per screen").
//
// loadContext reads files (and refreshes a guidelines link whose file is missing or old); the rest is pure.
import { readFileSync, existsSync, statSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { guidanceView } from './styleguide-data.mjs';
import { projectPath } from './names.mjs';
import { resolve, dirname, join } from 'node:path';

const clean = (s) => String(s ?? '').replace(/@(deprecated|experimental|status|use-?instead|superseded-?by|replaced-?by|since|why|rationale)\b[ \t]*:?[^\n@]*/gi, ' ').replace(/\s+/g, ' ').trim();
// What a description or a note says a component is for, without what is there for whoever builds it: the engine's own
// placeholder ("captured from Figma"), Figma node ids, the class it maps to, a build stamp, a banner, a CSS sentence, a
// bare list of tokens. → the words left, or '' when nothing is left.
// What of a component's notes (Figma's annotations, the code's notes, what the team authored in design-intent.json)
// the agent composing a prototype is shown, and what it is not, with why, what to do and whether to remove it. Only
// the first NOTES_SHOWN are printed in its catalog block; a note that repeats its description or another note is
// dropped. i: the component in design-intent.json; purpose: what it is for, as the catalog says it.
export const NOTES_SHOWN = 3;
export const NOTE_LEFT = {
  repeatsDescription: {
    why: 'It says what the component\'s description already says, so the agent is not given it twice.',
    fix: 'Nothing, or write what the description does not say (when not to use it, a limit) instead.',
    remove: 'Yes: the description already carries it.',
  },
  repeatsNote: {
    why: 'Another note on it says the same, so only that one is given.',
    fix: 'Keep it in one place, where the team keeps it up to date.',
    remove: 'Yes, this copy.',
  },
  notShown: {
    why: `Only the first ${NOTES_SHOWN} notes of a component are printed for the agent that composes a prototype; this one still helps match a request and rule a use out, but the agent does not read it.`,
    fix: 'Write it as a When to use or When not to use line of its Figma description, or on its intent-layer page: those are given in full.',
    remove: 'No, unless it says nothing that matters for using the component.',
  },
  linkOnly: {
    why: 'It is only a link (to a Figma frame, a page), and the agent cannot open a link, so nothing of it is given.',
    fix: 'Write in words what the agent should take from what it links to (when to use it, what not to do), and keep the link for people.',
    remove: 'No: keep the link and add the words.',
  },
  buildOnly: {
    why: 'It only says how the component is built (sizes, node ids, the class it maps to, CSS), which the agent reads from Figma and the code themselves, so nothing of it is given.',
    fix: 'If it should guide its use, say what it is for or when not to use it, in words.',
    remove: 'Yes, unless a developer needs it next to the code.',
  },
};
const noteFrom = (a) => (a?.layer ? `Figma annotation on its "${a.layer}" layer` : 'Figma annotation');
export function notesOf(i = {}, purpose = null) {
  const same = (a, b) => { const k = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); return !!k(a) && !!k(b) && (k(a).includes(k(b)) || k(b).includes(k(a))); };
  const raw = [
    ...(i.design?.annotations ?? []).map((a) => ({ text: clean(a?.label ?? a), from: noteFrom(a), who: 'figma' })).filter((n) => n.text && !/^role\s*:/i.test(n.text)),
    { text: i.code?.note, from: 'the code (its note in the structure contract)', who: 'code' },
    { text: i.code?.cssComment, from: 'the code (the comment above its CSS rule)', who: 'code' },
    { text: i.authored, from: 'design-intent.json (authored)', who: 'person' },
  ].filter((n) => String(n.text ?? '').trim());
  const notes = [], left = [];
  for (const n of raw) {
    const t = intentText(n.text);
    const say = (reason) => left.push({ text: String(n.text).replace(/\s+/g, ' ').trim(), from: n.from, who: n.who, reason, ...NOTE_LEFT[reason] });
    // Nothing left once what is there for whoever builds it is taken out: a link (the agent cannot open it), else build notes.
    if (!t || /^\S*https?:\/\/\S+$/.test(t)) { say(/https?:\/\//.test(n.text) ? 'linkOnly' : 'buildOnly'); continue; }
    if (same(t, purpose)) { say('repeatsDescription'); continue; }
    if (notes.some((o) => same(o.text, t))) { say('repeatsNote'); continue; }
    notes.push({ ...n, text: t });
  }
  for (const n of notes.slice(NOTES_SHOWN)) left.push({ text: n.text, from: n.from, who: n.who, reason: 'notShown', ...NOTE_LEFT.notShown });
  return { notes: notes.map((n) => n.text), left };
}

export function intentText(s) {
  let t = clean(s)
    .replace(/(^|\s)[\w/-]+ — captured from Figma by rms-design-system-engine\.?/gi, ' ')
    .replace(/─+\s*[^─]*?\s*─+|─+/g, ' ')
    .replace(/\(\s*(?:DS\s+)?(?:node\s+)?\d+[:-](?:\d+|…)(?:[^)]*)\)/gi, ' ')
    .replace(/\b(?:DS\s+)?node\s+\d+[:-]\d+\b|\bDS\s+\d+[:-]\d+\b/gi, ' ')
    .replace(/\s*→\s*\.[\w-]+/g, ' ')
    .replace(/\bBuilt base \.[\w-]+(?:\s*\([^)]*\))?\.?/gi, ' ')
    .replace(/\bbuilt base \.[\w-]+(?:\s*\([^)]*\))?/gi, ' ');
  const sentences = t.split(/(?<=[.;])\s+/).map((x) => x.trim()).filter(Boolean)
    .filter((x) => !/::|var\(--|\b[a-z][a-zA-Z-]*=[\w.%-]+|\bCSS:|strokeSides/.test(x) && (x.match(/\d+(?:\.\d+)?px\b/g) ?? []).length < 2)
    .map((x) => x.replace(/:?\s*(?:[\w-]+\/[\w-]+(?:\/[\w-]+)*\s*,\s*){1,}[\w-]+\/[\w-]+(?:\/[\w-]+)*\s*\.?$/, '.'));
  const out = sentences.join(' ').replace(/\(\s*\)/g, ' ').replace(/\s+([.,;:])(?=\s|$)/g, '$1').replace(/([.;:,])\1+/g, '$1').replace(/^[\s.,;:]+|[\s,;:]+$/g, '').replace(/\s+/g, ' ').trim();
  return out.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length > 1 ? out : '';   // a bare name ("Input") says nothing
}
export const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : s);
const LAYERS = ['system', 'foundations', 'patterns', 'templates', 'pages', 'flows'];
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'each', 'some', 'like', 'one', 'our', 'your', 'their', 'use', 'using', 'used', 'make', 'made', 'page', 'screen', 'prototype', 'prototyp', 'mock', 'wireframe', 'design', 'system', 'component', 'components', 'into', 'onto', 'when', 'what', 'which', 'there', 'them', 'they', 'then', 'than', 'have', 'has', 'are', 'was', 'were', 'will', 'can', 'not', 'all', 'any', 'only', 'also', 'its', 'it', 'a', 'an', 'to', 'of', 'on', 'in', 'or', 'is', 'be', 'by', 'as', 'at', 'up', 'new', 'show', 'shows', 'once', 'after', 'before', 'more', 'other']);
export const wordsOf = (s) => [...new Set((String(s).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().match(/[a-zà-ú][a-zà-ú0-9]{2,}/g) ?? []).map((w) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '')).filter((w) => w.length > 2 && !STOP.has(w)))];

// Markdown into sections: the text before the first heading, then one per heading (any level).
export function sectionsOf(text) {
  const parts = String(text).split(/^#{1,6}\s+(.+)$/m);
  const general = (parts.shift() || '').trim();
  const out = general ? [{ heading: null, body: general }] : [];
  for (let i = 0; i < parts.length; i += 2) if ((parts[i + 1] || '').trim()) out.push({ heading: parts[i].trim(), body: parts[i + 1].trim() });
  return out;
}

// Where each guidelines file comes from: a Notion or GitLab link (fetched into it), or committed as it is.
function originOf(file, cfg, targets) {
  const t = targets.find((x) => x.file === file);
  return t ? `${t.provider} (${t.url})` : 'committed';
}

// A guidelines link whose file is missing, or older than guidelines.maxAgeHours (24 by default), is fetched again,
// as the audit does: written to its committed file. No token, no network: the file stays as it is, and says so.
async function refreshLinks(ROOT, cfg, targets, { fetchLinks = true } = {}) {
  const notes = [];
  const maxAge = (cfg.guidelines?.maxAgeHours ?? 24) * 3600 * 1000;
  for (const t of targets) {
    const abs = resolve(ROOT, t.file);
    const fresh = existsSync(abs) && Date.now() - statSync(abs).mtimeMs < maxAge;
    if (fresh || !fetchLinks) { if (!existsSync(abs)) notes.push({ file: t.file, provider: t.provider, url: t.url, status: 'not fetched yet' }); continue; }
    try {
      const md = t.provider === 'Notion' ? await (await import('./notion-fetch.mjs')).fetchNotionMarkdown(t.url, {}) : await (await import('./gitlab-fetch.mjs')).fetchGitlabMarkdown(t.url, {});
      if (md && md.trim()) {
        const prev = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
        if (md !== prev) { mkdirSync(dirname(abs), { recursive: true }); writeFileSync(abs, md); }
        notes.push({ file: t.file, provider: t.provider, url: t.url, status: 'fetched now' });
      } else notes.push({ file: t.file, provider: t.provider, url: t.url, status: existsSync(abs) ? 'kept (the link gave nothing)' : 'not fetched yet' });
    } catch { notes.push({ file: t.file, provider: t.provider, url: t.url, status: existsSync(abs) ? 'kept (could not fetch)' : 'not fetched yet' }); }
  }
  return notes;
}

const readJSON = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const age = (p) => { try { const h = (Date.now() - statSync(p).mtimeMs) / 3600000; return h < 1 ? 'under an hour ago' : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`; } catch { return null; } };

// Everything, read once for a prototype.
export async function loadContext(ROOT, cfg = {}, catalog = { components: {} }, { fetchLinks = true } = {}) {
  const sources = [];
  const { gitlabTargets, notionTargets, guidelineFiles, generateIntent } = await import('./intent-gen.mjs');
  const targets = [...notionTargets(cfg).map((t) => ({ ...t, provider: 'Notion' })), ...gitlabTargets(cfg).map((t) => ({ ...t, provider: 'GitLab' }))];
  const linkNotes = targets.length ? await refreshLinks(ROOT, cfg, targets, { fetchLinks }) : [];

  // The design intent: the sources read without writing; the file the audit keeps when there is one (it holds what
  // the team authored, which generateIntent carries over).
  let intent = null;
  const themeCss = Array.isArray(cfg.paths?.themeCSS) ? cfg.paths.themeCSS[0] : cfg.paths?.themeCSS;
  const intentFile = cfg.docs?.out ? resolve(ROOT, cfg.docs.out) : join(themeCss ? dirname(resolve(ROOT, themeCss)) : ROOT, 'design-intent.json');
  const structFile = resolve(ROOT, cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json');
  try { if (existsSync(structFile) || cfg.figmaFileKey === '') intent = (await generateIntent(ROOT, cfg, { write: false })).intent; } catch { /* the catalog alone still says what each component is for */ }
  if (!intent) intent = readJSON(intentFile);

  const figmaDir = dirname(structFile);
  const propsFile = resolve(ROOT, cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json');
  const varsFile = resolve(ROOT, cfg.paths?.snapshotVars ?? 'figma-vars.snapshot.json');
  if (existsSync(propsFile)) sources.push({ what: 'Figma', detail: `component descriptions, annotations and options (${cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json'}, captured ${age(propsFile)})` });
  const vars = readJSON(varsFile) ?? {};
  if (existsSync(varsFile)) sources.push({ what: 'Figma', detail: `tokens, text styles and screen widths (${cfg.paths?.snapshotVars ?? 'figma-vars.snapshot.json'}, captured ${age(varsFile)})` });
  const templatesFile = [cfg.paths?.snapshotTemplates, 'figma-templates.snapshot.json', join(figmaDir, 'figma-templates.snapshot.json')].filter(Boolean).map((p) => resolve(ROOT, p)).find(existsSync);
  const tsnap = templatesFile ? readJSON(templatesFile) : null;
  const templates = Object.values(tsnap?.templates ?? {}).filter((t) => t?.name && Array.isArray(t.components));
  if (templates.length) sources.push({ what: 'Figma', detail: `${templates.length} template${templates.length === 1 ? '' : 's'} and the components each composes (${templatesFile.replace(ROOT + '/', '')})` });
  const screensFile = [cfg.paths?.screenLayout, join(figmaDir, 'figma-screen-layout.snapshot.json'), 'figma-screen-layout.snapshot.json'].filter(Boolean).map((p) => resolve(ROOT, p)).find(existsSync) ?? null;
  const screens = screensFile ? (readJSON(screensFile)?.screens ?? []) : [];
  if (screens.length) sources.push({ what: 'Figma', detail: `${screens.length} designed screen${screens.length === 1 ? '' : 's'} (${screensFile.replace(ROOT + '/', '')})` });
  // The product's screens designed in Figma, and the system's components each one uses (how many times): a new page for
  // a product is made of what its screens are made of.
  const screenCompsFile = [cfg.paths?.snapshotScreenComponents, join(figmaDir, 'figma-screen-components.snapshot.json'), 'figma-screen-components.snapshot.json'].filter(Boolean).map((p) => resolve(ROOT, p)).find(existsSync) ?? null;
  const productScreens = productScreensOf(screenCompsFile ? readJSON(screenCompsFile) : null, catalog);
  if (productScreens.length) sources.push({ what: 'Figma', detail: `${productScreens.length} designed product screen${productScreens.length === 1 ? '' : 's'} and the components each uses (${screenCompsFile.replace(ROOT + '/', '')})` });
  if (Object.keys(catalog.components ?? {}).length) sources.push({ what: 'the code', detail: `${Object.keys(catalog.components).length} components, what each holds, notes beside them` });
  const authoredFile = cfg.contracts?.authored ? resolve(ROOT, cfg.contracts.authored) : join(ROOT, 'contract.authored.json');
  const authoredJson = existsSync(authoredFile) ? readJSON(authoredFile) : null;
  if (existsSync(authoredFile)) sources.push({ what: 'the team', detail: `${authoredFile.replace(ROOT + '/', '')} (when not to use, what instead, status, notes, usage, do and don't)` });
  // Each component's Do and Don't: the captions of its pictures in the references (do/, dont/), then the examples
  // contract.authored.json names. The words are what a prototype needs; the pictures stay in the style guide.
  const refsDir = resolve(ROOT, cfg.visualRefs ?? projectPath(ROOT, 'refs'), 'components');
  const examples = {};
  for (const name of Object.keys(catalog.components ?? {})) {
    const list = [];
    for (const kind of ['do', 'dont']) {
      const dir = join(refsDir, name.replace(/[^\w.-]+/g, '_'), kind);
      try { for (const f of readdirSync(dir).filter((x) => /\.png$/i.test(x)).sort()) list.push({ kind, caption: f.replace(/\.png$/i, '').replace(/^\d+[\s._-]+/, '') }); } catch { /* none */ }
    }
    for (const e of authoredJson?.components?.[name]?.examples ?? []) if (e?.caption && /^(do|dont|don't)$/i.test(e.kind ?? '')) list.push({ kind: /^do$/i.test(e.kind) ? 'do' : 'dont', caption: String(e.caption) });
    if (list.length) examples[name] = list;
  }
  if (Object.keys(examples).length) sources.push({ what: 'the team', detail: `Do and Don't of ${Object.keys(examples).length} component${Object.keys(examples).length === 1 ? '' : 's'}` });
  // The intent layer the design intent read (intent-layer.mjs): its pages, at the commit read, its drafts left out.
  const IL = intent?.intentLayer;
  if (IL?.pages) { const s = IL._source ?? {}; sources.push({ what: 'the intent layer', detail: `${IL.pages} page${IL.pages === 1 ? '' : 's'} from ${String(s.url ?? s.label ?? 'the intent layer').replace(/^https?:\/\//, '')}${s.ref ? ` @ ${s.ref}` : ''}${s.sha ? ` ${String(s.sha).slice(0, 8)}` : ''} (a line marked Draft, or one the system contradicts, is left out)` }); }
  if (intent && LAYERS.some((L) => intent[L]?.authored)) sources.push({ what: 'the team', detail: `the design intent's ${LAYERS.filter((L) => intent[L]?.authored).join(', ')}` });

  // The guidelines, section by section, each with where it comes from.
  const sections = [];
  for (const rel of guidelineFiles(cfg)) {
    const abs = resolve(ROOT, rel);
    if (!existsSync(abs)) continue;
    let text = '';
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    const origin = originOf(rel, cfg, targets);
    sources.push({ what: 'guidelines', detail: `${rel} (${origin === 'committed' ? 'committed' : `from ${origin}, ${age(abs)}`})` });
    if (rel.toLowerCase().endsWith('.json')) {
      for (const [k, v] of Object.entries(readJSON(abs) ?? {})) if (typeof v === 'string' && v.trim()) sections.push({ heading: /^_?general$/i.test(k) ? null : k, body: v.trim(), file: rel });
    } else for (const s of sectionsOf(text)) sections.push({ ...s, file: rel });
  }
  for (const n of linkNotes.filter((x) => x.status === 'not fetched yet')) sources.push({ what: 'guidelines', detail: `${n.provider} link ${n.url}: not fetched yet (its token goes in .env; the engine names it when it runs)`, missing: true });

  const kept = (await import('./kept.mjs')).readKept(ROOT);
  if (kept.length) sources.push({ what: 'kept differences', detail: `${kept.length} kept on purpose (design-system-engine-kept.json)` });
  const ctx = contextFrom(catalog, intent, sections, { authored: authoredJson, examples, kept });
  return { ...ctx, sources, templates, screens, screensFile, productScreens, breakpoints: breakpointsOf(vars), linkNotes };
}

// The screens a product's designers made, from the components snapshot (figma-screen-components.snapshot.json): each
// screen's name, its product, and the system's components it uses, the most used first (icons and frames left out).
export function productScreensOf(snap, catalog = { components: {} }) {
  const known = new Set(Object.keys(catalog.components ?? {}));
  return Object.values(snap?.screens ?? {}).filter((s) => s?.name).map((s) => ({
    name: s.name, product: s.plugin ?? null,
    components: Object.entries(s.components ?? {}).filter(([n]) => known.has(n)).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  })).filter((s) => s.components.length);
}
export const screenUses = (s) => s.components.map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(', ');

// The system's screen widths: { name, px } from the Figma breakpoints.
export function breakpointsOf(vars = {}) {
  return Object.entries(vars.breakpoints ?? {}).map(([name, v]) => ({ name, px: parseFloat(typeof v === 'object' ? v?.value ?? v?.$value : v) })).filter((b) => Number.isFinite(b.px));
}

// { components: { name: { purpose, role, notes, notFor, useInstead, status, guidelines, options } }, rules, limits }
// extra: { authored: contract.authored.json, examples: { name: [{ kind: 'do' | 'dont', caption }] } }
export function contextFrom(catalog = { components: {} }, intent = null, sections = null, { authored = null, examples = {}, kept = [] } = {}) {
  const components = {};
  const names = Object.keys(catalog.components ?? {});
  const byKey = new Map(names.map((n) => [n.toLowerCase().replace(/[^a-z0-9]/g, ''), n]));
  // Guideline sections named after a component go with it; the rest are the product's rules.
  const own = new Map();
  const rest = [];
  if (sections) {
    for (const s of sections) {
      const n = s.heading && byKey.get(s.heading.toLowerCase().replace(/[^a-z0-9]/g, ''));
      if (n) { if (!own.has(n)) own.set(n, []); own.get(n).push(s.body); } else rest.push(s);
    }
  }
  for (const name of names) {
    const c = catalog.components[name];
    const i = intent?.components?.[name] ?? {};
    const annotations = (i.design?.annotations ?? []).map((a) => clean(a?.label ?? a)).filter(Boolean);
    const role = annotations.map((a) => a.match(/^role\s*:\s*(.+)$/i)?.[1]).find(Boolean) ?? null;
    const purpose = intentText(c.description) || intentText(i.design?.description) || null;
    // Notes say what the component is for; one that only repeats its description, or says how it is built, is left out.
    const same = (a, b) => { const k = (x) => String(x ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); return !!k(a) && !!k(b) && (k(a).includes(k(b)) || k(b).includes(k(a))); };
    const { notes } = notesOf(i, purpose);
    const options = Object.entries(c.props ?? {}).filter(([, e]) => e.description).map(([p, e]) => `${p}: ${clean(e.description)}`);
    const guidelines = clean(own.has(name) ? own.get(name).join(' ') : i.guidelines) || null;
    // Its usage, as the style guide shows it (When to use, When not to use, Common mistakes, Limitations).
    const usage = guidanceView({ description: c.description ?? i.design?.description ?? '', annotations: i.design?.annotations ?? [], note: i.code?.note ?? '', authored: { ...(i.guidance ?? {}), ...(authored?.components?.[name]?.guidance ?? {}) } });
    const said = (key) => (usage.sections.find((x) => x.key === key)?.text ?? []).map(clean).filter(Boolean);
    const whenToUse = said('whenToUse'), mistakes = said('mistakes'), limitations = said('limitations');
    const dos = (examples[name] ?? []).filter((e) => e.kind === 'do').map((e) => clean(e.caption)).filter(Boolean);
    const donts = (examples[name] ?? []).filter((e) => e.kind === 'dont').map((e) => clean(e.caption)).filter(Boolean);
    const notFor = clean(c.whenNotToUse ?? i.guidance?.whenNotToUse) || said('whenNotToUse').join(' ') || null;
    // The team's intent layer, kept apart from Figma's and the code's words: what the agent composing a screen without a
    // Figma layout reads to know what each component is for and what not to do with it.
    const il = i.intentLayer ?? null;
    const intentLayer = il ? intentLayerOf(il) : null;
    // The role its intent layer page writes (Role: button), where Figma's annotations name none.
    const ilRole = intentLayer?.role ?? null;
    components[name] = {
      // What rules a use out: the documentation's "never" sentences, when not to use it, every common mistake and
      // every Don't (each a use the team has seen go wrong).
      never: [...neverOf([guidelines, ...notes].filter(Boolean).join(' '), notFor),
        ...mistakes.map((m) => ({ sentence: `Common mistake: ${m}`, clause: m, min: 2 })), ...donts.map((d) => ({ sentence: `Don't: ${d}`, clause: d, min: 2 })),
        ...(intentLayer?.whenNotToUse ?? []).map((x) => ({ sentence: `Intent layer: ${x}`, clause: x, min: 2 }))],
      intentLayer,
      whenToUse, mistakes, limitations, dos, donts,
      purpose: purpose ?? intentLayer?.purpose ?? null,
      role: role ?? ilRole,
      notes: [...new Set(notes)],
      options,
      notFor,
      useInstead: c.useInstead ?? i.guidance?.useInstead ?? null,
      status: c.status ?? (i.status?.state && i.status.state !== 'current' ? i.status.state : null),
      guidelines,
      // The differences the team kept on purpose (kept.mjs): the side it chose, which an agent follows, never "fixes".
      kept: kept.filter((d) => d.component === name),
    };
  }
  // Without the sections themselves (an older caller), the intent's general block stands for them.
  if (!sections && intent?.guidelines?.general) rest.push(...sectionsOf(intent.guidelines.general).map((s) => ({ ...s, file: (intent.guidelines._sources ?? [])[0] ?? null })));
  const rules = rest.map((s) => ({ title: s.heading ?? 'guidelines', text: s.body.trim(), file: s.file ?? null }));
  for (const L of LAYERS) {
    const a = intent?.[L]?.authored;
    const text = typeof a === 'string' ? a.trim() : a && typeof a === 'object' ? JSON.stringify(a) : '';
    if (text) rules.push({ title: `${L} (design intent)`, text, file: null });
    // The intent layer's pages of this layer (a pattern, a template, a page): what each is for, when and when not.
    for (const pg of intent?.[L]?.intentLayer ?? []) {
      const body = [pg.purpose, ...(pg.whenToUse ?? []).map((x) => `Use when: ${x}`), ...(pg.whenNotToUse ?? []).map((x) => `Not when: ${x}`),
        ...(pg.mistakes ?? []).map((x) => `Common mistake: ${x}`), ...(pg.limitations ?? []).map((x) => `Limitation: ${x}`), ...(pg.rules ?? [])].filter(Boolean).join('\n');
      if (body) rules.push({ title: `${pg.name} (${L}, intent layer)`, text: body, file: pg.url ?? pg.file ?? null, ...(pg.kind ? { kind: pg.kind } : {}) });
      for (const sec of pg.sections ?? []) rules.push({ title: `${pg.name} · ${sec.title} (${L}, intent layer)`, text: sec.text, file: pg.url ?? pg.file ?? null, ...(pg.kind ? { kind: pg.kind } : {}) });
    }
  }
  return { components, rules, limits: limitsFrom(components, rules, names), inside: insideFrom(components, rules, names) };
}

// A component's intent layer page as the catalog shows it: each line once (a family's shared rule often says what the
// component's own page says), its role and its examples apart from its rules (Role: button, Example: <TabStrip …>).
const sameLine = (x) => String(x).toLowerCase().replace(/\s*\((?:must|should|may)(?:-not)?\)\s*$/, '').replace(/[^a-z0-9]+/g, ' ').trim();
export function intentLayerOf(il) {
  const seen = new Set();
  const once = (list) => (list ?? []).map(clean).filter(Boolean).filter((x) => { const k = sameLine(x); return !seen.has(k) && seen.add(k); });
  const purpose = intentText(il.purpose) || null;
  const lists = { whenToUse: once(il.whenToUse), whenNotToUse: once(il.whenNotToUse), mistakes: once(il.mistakes), limitations: once(il.limitations) };
  let role = null;
  const examples = [], rules = [];
  for (const r of once(il.rules)) {
    const m = /^role\s*:\s*(.+)$/i.exec(r), ex = /^example\s*:\s*(.+)$/i.exec(r);
    if (m) role = role ?? m[1].trim();
    else if (ex) examples.push(ex[1].trim());
    else rules.push(r);
  }
  return { purpose, role, ...lists, rules, examples, file: il.url ?? il.file ?? null };
}

// Where a component may go, read from the documentation as written: "`searchField` only inside the toolbar", "Do not
// place `TabItem` without `TabStrip` unless another component lays it out". Only a
// sentence that names the component and its container as the system names them counts; anything vaguer stays words.
// → [{ component, within: [names], sentence, from, owned }]: owned, when another component may hold it instead ("unless a
// component lays it out").
export function insideFrom(components, rules, names) {
  const byKey = new Map(names.map((n) => [n.toLowerCase().replace(/[^a-z0-9]/g, ''), n]));
  const nameOf = (w) => byKey.get(String(w).toLowerCase().replace(/[^a-z0-9]/g, '')) ?? null;
  const ticked = (t) => [...String(t).matchAll(/`([A-Za-z][\w/-]*)`/g)].map((m) => nameOf(m[1])).filter(Boolean);
  const texts = [];
  for (const [n, k] of Object.entries(components)) {
    const il = k.intentLayer;
    for (const t of [k.guidelines, ...(k.mistakes ?? []), ...(il ? [...il.rules, ...il.mistakes, ...il.whenNotToUse] : [])]) if (t) texts.push({ text: t, about: n, from: `${n}'s documentation` });
  }
  for (const r of rules) if (r.kind !== 'token') texts.push({ text: r.text, about: null, from: r.title });
  const out = [], seen = new Set();
  const add = (subjects, container, sentence, from, owned) => {
    for (const c of subjects) {
      if (!container || c === container) continue;
      const key = `${c}>${container}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ component: c, within: [container], sentence: sentence.trim().replace(/^[-*]\s*/, ''), from, owned });
    }
  };
  for (const t of texts) {
    for (const sentence of String(t.text).split(/(?<=[.!?])\s+|\n+/)) {
      const owned = /\bunless\b/i.test(sentence);
      // `X` (…) only inside / only in (the) Y
      const only = /^(.*?)(?<![\w-])only\s+(?:inside|within|in)\s+(?:the\s+|a\s+|an\s+)?`?([A-Za-z][\w/-]*)`?/i.exec(sentence);
      if (only && !/\b(?:not|never)\b/i.test(only[1])) add(ticked(only[1]), nameOf(only[2]), sentence, t.from, owned);
      // Do not place `A` or `B` … without `C`
      const without = /\b(?:do not|don't|never)\s+(?:place|put|use|render)\s+(.+?)\s+without\s+`([A-Za-z][\w/-]*)`/i.exec(sentence);
      if (without) add(ticked(without[1]), nameOf(without[2]), sentence, t.from, owned);
    }
  }
  return out;
}

// A part placed where its documentation says it never goes: one with none of the containers it names among the parts
// that hold it. One another component may own is only a mistake when nothing of the system holds it (the engine's
// layout pieces are not the system's). nodes: nodesOf(ui).nodes; pieces: the engine's piece names.
export function insideFindings(inside = [], nodes = [], pieces = []) {
  if (!inside.length) return [];
  const parent = new Map();
  for (const n of nodes) for (const k of n.children ?? []) parent.set(typeof k === 'object' ? k?.id : k, n.id);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const holders = (id) => { const out = []; for (let p = parent.get(id); p != null; p = parent.get(p)) { const n = byId.get(p); if (n) out.push(n.component); } return out; };
  const out = [];
  for (const n of nodes) {
    for (const r of inside.filter((x) => x.component === n.component)) {
      const up = holders(n.id);
      if (up.some((c) => r.within.includes(c))) continue;
      if (r.owned && up.some((c) => !pieces.includes(c))) continue;
      out.push({ rule: null, source: 'the team\'s documentation', level: 'error', id: n.id, message: `${n.component} is not inside ${r.within.join(' or ')}: "${cut(r.sentence, 200)}" (${r.from}). Put it in ${r.within.join(' or ')}` });
    }
  }
  return out;
}

// The sentences that rule a use out ("Never an on/off control", "not for navigation"), and the authored whenNotToUse.
const NEVER = /\b(never|not for|not to be|don['’]t|do not|avoid|must not|no longer)\b/i;
// Each keeps its sentence (shown) and the clause after the negation (matched): "People turn it on and off; it never
// submits anything" rules out submitting, not turning on and off.
export function neverOf(text, notFor = null) {
  const out = [];
  for (const sentence of String(text ?? '').split(/(?<=[.!?])\s+/).map((x) => x.trim())) {
    const m = NEVER.exec(sentence);
    if (m) out.push({ sentence, clause: sentence.slice(m.index).split(/[;:.!?]/)[0] });
  }
  if (notFor) { const t = `Not for ${notFor.replace(/^not for\s*/i, '')}`; out.push({ sentence: t, clause: t }); }
  return out;
}

// A use the documentation rules out: the words of a stand-in or a label that one of the component's "never" sentences
// names. A common mistake or a Don't describes a whole use, so it takes two of its words. Returns [{ sentence, words }].
export function ruledOut(k, text, name = '') {
  const w = wordsOf(text).filter((x) => x !== name.toLowerCase());
  if (!k?.never?.length || !w.length) return [];
  return k.never.map((n) => ({ sentence: n.sentence, words: w.filter((x) => wordsOf(n.clause).includes(x)) })).filter((r, i) => r.words.length >= (k.never[i].min ?? 1));
}

// The rules a check can hold a prototype to, read from the guidelines as written: "one <component> per screen",
// "only one <component> on a page", "at most <n> <components> per page". Each keeps the sentence it came from.
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, single: 1 };
export function limitsFrom(components, rules, names) {
  const out = [];
  const texts = [...Object.entries(components).filter(([, k]) => k.guidelines).map(([n, k]) => ({ text: k.guidelines, about: n, from: `guidelines, ${n}` })),
    ...rules.map((r) => ({ text: r.text, about: null, from: `guidelines, ${r.title}` }))];
  for (const t of texts) {
    for (const sentence of t.text.split(/(?<=[.!?])\s+/)) {
      for (const name of names) {
        const n = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const m = new RegExp(`\\b(?:only\\s+|at most\\s+|no more than\\s+)?(one|two|three|four|five|single|\\d+)\\s+${n}s?\\s+(?:per|on each|in each|for each|on a|on the|in a)\\s+(screen|page|view|dialog)`, 'i').exec(sentence)
          ?? (t.about === name ? new RegExp(`^\\s*(one|two|three|single|\\d+)\\s+per\\s+(screen|page|view|dialog)`, 'i').exec(sentence) : null);
        if (m) out.push({ component: name, max: NUM[m[1].toLowerCase()] ?? Number(m[1]), per: m[2].toLowerCase(), sentence: sentence.trim(), from: t.from });
      }
    }
  }
  const seen = new Set();
  return out.filter((l) => !seen.has(l.component) && seen.add(l.component));
}

const said = (k) => k && (k.kept?.length || k.purpose || k.role || k.notes.length || k.notFor || k.guidelines || k.useInstead?.length || k.status || k.options?.length || k.whenToUse?.length || k.mistakes?.length || k.limitations?.length || k.dos?.length || k.donts?.length || k.intentLayer);

// One block per component for the catalog: what it is for, its role, its options' meaning, when not to use it, the
// team's notes and its guidelines. full: the names shown in full (a Set; null: every one); each other one is its
// first line only, so a catalog of hundreds of components stays short enough to be read whole.
export function purposeLines(ctx, names, { width = 400, full = null } = {}) {
  const list = names.filter((n) => said(ctx.components[n]));
  if (!list.length) return [];
  const pad = Math.min(28, Math.max(...list.map((n) => n.length)));
  const out = [];
  for (const n of list) {
    const k = ctx.components[n];
    const head = [k.purpose, k.role ? `Role ${k.role}.` : null, k.status ? `[${k.status}${k.useInstead?.length ? `: use ${k.useInstead.join(' or ')}` : ''}]` : null].filter(Boolean).join(' ');
    if (full && !full.has(n)) { out.push(`  ${n.padEnd(pad)}  ${cut(head || '(no description yet)', 110)}`); continue; }
    out.push(`  ${n.padEnd(pad)}  ${cut(head || '(no description yet)', width)}`);
    const more = (label, text) => out.push(`  ${' '.repeat(pad)}    ${label} ${cut(text, width)}`);
    for (const o of k.options) more('option', o);
    for (const u of k.whenToUse ?? []) more('use when', u);
    if (k.notFor) more('not for', `${k.notFor}${k.useInstead?.length && !k.status ? `; use ${k.useInstead.join(' or ')}` : ''}`);
    for (const m of k.mistakes ?? []) more('mistake', m);
    for (const l of k.limitations ?? []) more('limit', l);
    for (const d of k.dos ?? []) more('do', d);
    for (const d of k.donts ?? []) more('don\'t', d);
    for (const note of k.notes.slice(0, NOTES_SHOWN)) more('note', note);
    if (k.guidelines) more('guidelines', k.guidelines);
    for (const d of k.kept ?? []) more('kept on purpose', `${d.what}${d.truth ? ` (${d.truth === 'code' ? 'the code' : 'Figma'} is right)` : ''}: ${d.reason}`);
    // The intent layer, under its own name.
    const il = k.intentLayer;
    if (il) {
      if (il.purpose && il.purpose !== k.purpose) more('intent', il.purpose);
      for (const u of il.whenToUse) more('intent: use when', u);
      for (const u of il.whenNotToUse) more('intent: not for', u);
      for (const m of il.mistakes) more('intent: mistake', m);
      for (const l of il.limitations) more('intent: limit', l);
      for (const r of il.rules) more('intent: rule', r);
      for (const x of il.examples ?? []) more('intent: example', x);
    }
  }
  return out;
}

// The team's rules for the product, each section on its own line (the full text stays in its file). full: the titles
// shown with their text (a Set; null: every one); the others are named only, a few to a line.
export function ruleLines(ctx, { width = 500, full = null, above = null } = {}) {
  const shown = ctx.rules.filter((r) => (!full || full.has(r.title)) && !above?.has(r.title));
  const out = shown.map((r) => `  ${r.title}${r.file ? ` (${r.file})` : ''}: ${cut(r.text.replace(/\s+/g, ' '), width)}`);
  // The others by the page they come from (Orders · Rules → Orders), each once; a token's page is in the scales.
  const rest = full ? ctx.rules.filter((r) => !full.has(r.title) && !above?.has(r.title)) : [];
  const tokenPages = rest.filter((r) => r.kind === 'token').length;
  const named = [...new Set(rest.filter((r) => r.kind !== 'token').map((r) => r.title.split(' · ')[0].replace(/\s*\([^)]*\)\s*$/, '').trim()))];
  for (let i = 0; i < named.length; i += 10) out.push(`  ${i ? '' : 'also: '}${named.slice(i, i + 10).join('; ')}`);
  if (tokenPages) out.push(`  and ${tokenPages} token page${tokenPages === 1 ? '' : 's'}: a prototype takes its tokens from the scales below`);
  return out;
}

// What a request needs in full: the components it points to, the ones the guidelines it touches name, the ones its
// designed screen and its starting pages are made of, and the ones each of those names in its own documentation (a tab's
// page names its group): one step out, never the whole system. detail: names or rule titles asked for by name.
// → { components: Set, rules: Set }
const MOST_IN_FULL = 16;
export function detailFor(ctx, focus, detail = [], { pages = [] } = {}) {
  const names = Object.keys(ctx.components ?? {});
  const byKey = new Map(names.map((n) => [n.toLowerCase().replace(/[^a-z0-9]/g, ''), n]));
  // A name as code writes it (`Drawer`, TabStrip, buttonPrimary): in backticks, or with a capital inside it. A plain
  // word ("a component", "the menu item") names no component.
  const named = (text) => {
    const t = String(text ?? ''), out = new Set();
    const add = (w) => { const n = byKey.get(w.toLowerCase().replace(/[^a-z0-9]/g, '')); if (n) out.add(n); };
    for (const m of t.matchAll(/`([A-Za-z][\w/-]*)/g)) add(m[1]);
    for (const m of t.matchAll(/\b[A-Za-z][a-z0-9]*[A-Z][\w-]*/g)) add(m[0]);
    for (const m of t.matchAll(/(?:<|\bimport\s+)([A-Z][\w]*)/g)) add(m[1]);   // a tag or an import in an example
    return [...out];
  };
  const comps = new Set(), rules = new Set(), second = new Map(), shownAbove = new Set();
  const asked = detail.map((d) => String(d).trim()).filter(Boolean);
  for (const d of asked) {
    const n = byKey.get(d.toLowerCase().replace(/[^a-z0-9]/g, ''));
    if (n) comps.add(n);
    for (const r of ctx.rules ?? []) if (r.title.toLowerCase().includes(d.toLowerCase())) rules.add(r.title);
  }
  if (focus) {
    for (const c of focus.components ?? []) if (c.score >= 3) comps.add(c.name);   // one shared word is not enough
    for (const s of focus.screens ?? []) for (const [n] of s.components ?? []) comps.add(n);
    for (const p of focus.pages ?? []) for (const n of named(pages.find((x) => x.name === p.name)?.text ?? '')) comps.add(n);
    for (const r of focus.ruledOut ?? []) comps.add(r.name);
    // The components the guidelines it touches name, the most named first: they come after its own.
    for (const s of focus.sections ?? []) { shownAbove.add(s.title); for (const n of named(`${s.title} ${s.text}`)) second.set(n, (second.get(n) ?? 0) + 3); }
  }
  // What the request's own components need to be used right: what their rules and mistakes name (a tab's group).
  for (const n of [...comps]) {
    const k = ctx.components[n], il = k?.intentLayer;
    for (const m of named([k?.guidelines, ...(k?.mistakes ?? []), ...(il ? [...il.mistakes, ...il.rules] : [])].join(' '))) if (!comps.has(m)) second.set(m, (second.get(m) ?? 0) + 1);
  }
  for (const [n] of [...second].filter(([n]) => !comps.has(n)).sort((a, b) => b[1] - a[1])) { if (comps.size >= MOST_IN_FULL) break; comps.add(n); }
  return { components: comps, rules, shownAbove };
}

// What the person asked for, against everything known: the guidelines' opening text (it is for every page) and the
// sections the request touches, in full; the components
// its words point to (by name, description, options or guidelines), and the pages closest to it.
// pages: [{ name, label, text, designed, file }] (prototypes already made and designed screens).
export function requestFocus(ctx, request, pages = []) {
  const words = wordsOf(request);
  if (!words.length) return null;
  const hit = (text) => { const w = wordsOf(text); return words.filter((x) => w.includes(x)); };
  const sections = ctx.rules.map((r) => {
    const inHead = hit(r.title), inBody = hit(r.text);
    return { ...r, score: inHead.length * 3 + inBody.length, matched: [...new Set([...inHead, ...inBody])] };
  }).filter((r) => r.score >= 2 || r.matched.length >= 2 || r.title === 'guidelines').sort((a, b) => (b.title === 'guidelines') - (a.title === 'guidelines') || b.score - a.score).slice(0, 5);
  const positive = (k) => [k.purpose, k.role, ...k.options, ...(k.whenToUse ?? []), ...(k.intentLayer?.whenToUse ?? []), ...(k.dos ?? []), ...(k.guidelines ?? '').split(/(?<=[.!?])\s+/), ...k.notes].filter((x) => x && !NEVER.test(x)).join(' ');
  // A word many components' notes share (the product's name) points to none of them.
  const docs = Object.entries(ctx.components).map(([name, k]) => [name, hit(positive(k))]);
  const common = new Set(words.filter((w) => docs.filter(([, m]) => m.includes(w)).length > Math.max(2, docs.length / 4)));
  // A product's or a screen's name points to its designed screen, never to a component whose note mentions the product.
  for (const s of ctx.productScreens ?? []) for (const w of wordsOf(`${s.name} ${s.product ?? ''}`)) if (words.includes(w)) common.add(w);
  // Ranked: a component the request names first, then one whose documentation shares two of its words or more.
  const components = docs.map(([name, m]) => {
    const byName = words.filter((w) => name.toLowerCase().includes(w) || (name.length >= 3 && w.includes(name.toLowerCase())));
    const byDocs = m.filter((w) => !common.has(w) && !byName.includes(w));
    const inPurpose = byDocs.filter((w) => wordsOf(ctx.components[name].purpose ?? '').includes(w));
    return { name, matched: [...new Set([...byName, ...byDocs])], score: byName.length * 3 + inPurpose.length + byDocs.length, purpose: ctx.components[name].purpose };
  }).filter((c) => c.score >= 2).sort((a, b) => b.score - a.score).slice(0, 6);
  const out = Object.entries(ctx.components).flatMap(([name, k]) => ruledOut(k, request, name).map((r) => ({ name, ...r })));
  const scored = pages.map((p) => ({ ...p, matched: [...new Set([...hit(p.name), ...hit(p.text ?? '')])] })).filter((p) => p.matched.length).sort((a, b) => b.matched.length - a.matched.length || b.designed - a.designed);
  // The designed screens the request names (the product, or the screen itself): what a new page for it is made of.
  const screens = (ctx.productScreens ?? []).map((s) => ({ ...s, matched: hit(s.name) })).filter((s) => s.matched.length && s.matched.length >= Math.min(2, wordsOf(s.name).length)).sort((a, b) => b.matched.length - a.matched.length).slice(0, 2);
  return { request: String(request).trim(), words, sections, components, ruledOut: out, pages: scored.slice(0, 3), lacking: kindsLacking(ctx, request), screens };
}

// The lines the catalog prints for a request.
export function focusLines(f) {
  if (!f) return [];
  const out = ['', `FOR THIS REQUEST  "${cut(f.request.replace(/\s+/g, ' '), 160)}"`];
  if (f.pages.length) out.push(`  start from: ${f.pages.map((p) => `${p.label}${p.file ? ` (${p.file})` : ''}`).join('; ')}`);
  for (const s of f.screens ?? []) out.push(`  the designed screen for it: ${s.name} (Figma), made of ${screenUses(s)}: a new page for it is made of the same, in the same frame`);
  if (f.components.length) out.push(`  components its words point to: ${f.components.map((c) => `${c.name} (${c.matched.join(', ')}${c.purpose ? `: ${cut(c.purpose, 80)}` : ''})`).join('; ')}`);
  for (const k of f.lacking ?? []) out.push(`  the system has no ${k}: a Missing box, or the closest component with "standInFor": "${k}"; the reply says the system has no ${k}`);
  for (const r of f.ruledOut ?? []) out.push(`  ruled out by the documentation for "${r.words.join(', ')}": ${r.name}, "${cut(r.sentence, 200)}"; what the request needs there is a Missing box unless another component is for it`);
  if (f.sections.length) {
    out.push('  the team\'s guidelines that apply (follow them; say so when the request asks for something they rule out):');
    for (const s of f.sections) out.push(`    ${s.title}${s.file ? ` (${s.file})` : ''}: ${cut(s.text.replace(/\s+/g, ' '), 1200)}`);
  }
  out.push('  Every word of the request that no component is for is a Missing box, or a component with "standInFor".');
  return out;
}

// After a prototype is drawn: what the documentation says about each system component it uses, beside what the
// prototype uses it for (its labels and texts), so a use the component is not for stands out.
export function usesAgainstPurpose(ctx, nodes) {
  const byComponent = new Map();
  for (const n of nodes) {
    const k = ctx.components[n.component];
    if (!k) continue;
    const p = n.props ?? {};
    const what = p.standInFor ? `stand-in for ${p.standInFor}` : [p.Label, p.label, p.text, p.Text, p.placeholder, p.Placeholder, p['aria-label']].find((v) => typeof v === 'string' && v.trim()) ?? null;
    if (!byComponent.has(n.component)) byComponent.set(n.component, []);
    if (what) byComponent.get(n.component).push(what);
  }
  return [...byComponent].filter(([name]) => said(ctx.components[name])).map(([name, uses]) => {
    const k = ctx.components[name];
    const rule = [k.purpose, k.role ? `Role ${k.role}.` : null, k.whenToUse?.length ? `Use when ${k.whenToUse.join('; ')}.` : null, k.notFor ? `Not for ${k.notFor.replace(/^not for\s*/i, '')}` : null,
      k.mistakes?.length ? `Common mistakes: ${k.mistakes.join('; ')}.` : null, k.donts?.length ? `Don't: ${k.donts.join('; ')}.` : null, k.guidelines ? `Guidelines: ${cut(k.guidelines, 240)}` : null,
      k.intentLayer ? [k.intentLayer.purpose && !k.purpose ? `Intent layer: ${k.intentLayer.purpose}` : null, k.intentLayer.whenNotToUse.length ? `Intent layer, not for: ${k.intentLayer.whenNotToUse.join('; ')}.` : null].filter(Boolean).join(' ') || null : null].filter(Boolean).join(' ');
    return { component: name, uses: [...new Set(uses)], rule };
  });
}

// What the request asks for, held against the composition:
//   • a component the request names (all the words of its name are in it: "an empty state" → emptyState, "a switch"
//     → switch) that the composition does not use: a warning the reply owes;
//   • a component the documentation rules out for the request's words ("a message confirming…" and a tag that is
//     "never a message that comes and goes"), used anyway: an error, unless the node says in "purpose" what else it
//     is for, and that purpose is not ruled out too.
const nameWords = (n) => wordsOf(String(n).replace(/^[._]+/, ''));

// The kinds of component a request can name. One the request names and no component of the system is named for (a
// switch, when the system has a chip that people "switch on and off") is a gap: a Missing box, or a component used
// with "standInFor", never a component passed off as it.
const KINDS = ['switch', 'toggle', 'toast', 'snackbar', 'dialog', 'modal', 'tabs', 'checkbox', 'radio', 'slider', 'progress bar', 'spinner', 'tooltip', 'avatar',
  'badge', 'table', 'menu', 'dropdown', 'select', 'stepper', 'accordion', 'banner', 'alert', 'breadcrumb', 'pagination', 'date picker', 'search field', 'empty state', 'divider'];
// Needs a request says in a phrase rather than by a component's name: "a message confirming the changes were saved"
// is a toast or a banner. Each holds when the system has a component named for one of its kinds.
const PHRASES = [
  { kind: 'confirmation message', re: /\b(messages?|notices?|notifications?)\b[^.;]{0,50}\b(confirm\w*|saved|success\w*|done|sent)\b|\bconfirm\w*\b[^.;]{0,30}\b(messages?|notices?)\b|\b(success|saved) (messages?|notices?)\b/i, by: ['toast', 'snackbar', 'banner', 'alert', 'notification', 'message'] },
];
export function kindsLacking(ctx, request) {
  const asked = wordsOf(request);
  const names = Object.keys(ctx.components ?? {}).map(nameWords);
  const kinds = KINDS.filter((kind) => { const w = wordsOf(kind); return w.length && w.every((x) => asked.includes(x)) && !names.some((n) => w.every((x) => n.includes(x))); })
    .filter((kind, i, all) => !all.some((o) => o !== kind && o.includes(kind) && all.includes(o)));   // a toggle switch is one need
  for (const p of PHRASES) if (p.re.test(String(request ?? '')) && !kinds.some((k) => p.by.includes(k)) && !names.some((n) => p.by.some((b) => n.includes(b)))) kinds.push(p.kind);
  return kinds;
}
export function requestFindings(ctx, request, nodes) {
  const out = [];
  if (!request) return out;
  const asked = wordsOf(request);
  const used = new Set(nodes.map((n) => n.component));
  for (const name of Object.keys(ctx.components)) {
    const w = nameWords(name);
    if (!w.length || used.has(name) || !w.every((x) => asked.includes(x))) continue;
    out.push({ rule: null, source: 'the request', level: 'warning', id: null, said: `asked:${name}`, kind: 'request', message: `the request asks for ${w.join(' ')} and the system has ${name}, which is not in the prototype: add it, or say why it is left out` });
  }
  // A kind the request names and the system has none of: the composition says so (a Missing box, a stand-in), or the
  // reply owes it.
  for (const kind of kindsLacking(ctx, request)) {
    const w = wordsOf(kind);
    // Said by a stand-in, a Missing box, or a part whose purpose names it (judged by its own rules).
    const named = nodes.some((n) => { const t = wordsOf(`${n.props?.standInFor ?? ''} ${n.props?.purpose ?? ''} ${n.component === 'Missing' ? n.props?.need ?? '' : ''}`); return w.every((x) => t.includes(x)); });
    if (!named) out.push({ rule: null, source: 'the request', level: 'warning', id: null, said: `kind:${kind}`, kind: 'request', message: `the request asks for a ${kind} and the system has none: show it as a Missing box, or a component with "standInFor": "${kind}", and say the system has no ${kind}` });
  }
  // A request that has a part open another (a confirmation, a menu): something must carry "opens", not a state.
  if (/\b(opens?|pops? up|brings? up|shows?)( (a|an|the|its|their))? ([a-z]+ )?(confirmation|dialog|modal|menu|popover|panel|sheet|drawer|overlay)s?\b/i.test(request) && !nodes.some((n) => n.props?.opens))
    out.push({ rule: null, source: 'the request', level: 'warning', id: null, said: 'opens', kind: 'request', message: 'the request has a part open another, and nothing here opens anything: give the part that is clicked "opens" with the "id" of the part it opens (drawn closed until the click), not a state' });
  for (const n of nodes) {
    const k = ctx.components[n.component];
    if (!k || n.props?.standInFor) continue;   // a stand-in is judged by its own need
    const hits = ruledOut(k, request, n.component);
    if (!hits.length) continue;
    const purpose = n.props?.purpose;
    if (purpose && !ruledOut(k, purpose, n.component).length) continue;
    out.push({ rule: null, source: 'the team\'s documentation', level: 'error', id: n.id, message: `${n.component} is ruled out for "${hits[0].words.join(', ')}" in this request: "${hits[0].sentence}". Show that need as a Missing box; if this ${n.component} is for something else, write it in "purpose"` });
  }
  const seen = new Set();
  return out.filter((f) => { const key = f.said ?? f.message; return !seen.has(key) && seen.add(key); });
}

// The guidelines' limits a composition breaks: [{ component, max, count, sentence, from }].
export function limitFindings(limits, nodes) {
  const count = new Map();
  for (const n of nodes) count.set(n.component, (count.get(n.component) ?? 0) + 1);
  return limits.filter((l) => (count.get(l.component) ?? 0) > l.max).map((l) => ({ ...l, count: count.get(l.component) }));
}
