// product-health.mjs - a product's own health report, beside the system's.
//
// The system's report (system-health.mjs, --health) answers for the system. A product team asks other things: is the
// product built from the system, do its pages read in order and work for everyone, what does it load and send, does it
// test itself, does it measure how it is used, and is it on the system's latest release. The engine already reads part
// of each, from the product's own folder and pages, without running the product. Each question is answered in the
// engine's four layers, the same way as the system's: a rating from the evidence, what was read, what was not seen,
// the command that would answer it, and what only the product's team can tell.
//
//   PRODUCT_QUESTIONS
//   productHealth(ev)                        → rows, as system-health's health() gives them
//   readProductEvidence(ROOT, cfg, name, OUT) → ev, or null when no product of that name is set up
//   headingsOf(html) / weightOf(html, assets) / hostsIn(text) / measuresIn(text) - the readings, pure
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

const CMD = 'rms-design-system-engine';
export const PRODUCT_QUESTIONS = [
  { id: 'built', layer: 'facts', question: 'Is it built from the system, rather than beside it?', run: CMD, team: 'which of its own components it would give up if the system had one' },
  { id: 'reading', layer: 'facts', question: 'Do its pages read in order, one main heading and no level skipped?', run: `${CMD} --health --product <name>`, team: 'whether the words on its pages are the ones its people use' },
  { id: 'hosts', layer: 'facts', question: 'Which other hosts does it load from or send to?', run: `${CMD} --health --product <name>`, team: 'which of those hosts it is allowed to send its people\'s data to' },
  { id: 'access', layer: 'contracts', question: 'Do its pages work by keyboard, with a screen reader and in every theme?', run: `${CMD} --a11y --url <one of its pages>`, team: 'what people who use assistive technology said when they used it' },
  { id: 'tests', layer: 'contracts', question: 'Does it test itself?', run: `${CMD} --health --product <name>`, team: 'whether the tests run before every release, and are trusted' },
  { id: 'release', layer: 'intent', question: "Is it on the system's latest release?", run: CMD, team: 'what holds it on an older release, and when it moves' },
  { id: 'weight', layer: 'evaluation', question: 'How much does a page of it load?', run: `${CMD} --health --product <name>`, team: 'how fast its pages open for its people, on the networks they use' },
  { id: 'measures', layer: 'evaluation', question: 'Does it measure how it is used?', run: `${CMD} --health --product <name>`, team: 'what it is meant to help its people do, and how it knows they did' },
];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const few = (list, n = 5) => `${list.slice(0, n).join(' · ')}${list.length > n ? ' · …' : ''}`;
const none = (why) => ({ rating: null, evidence: [], unseen: [why] });

// ── the readings, pure ──
// The headings of a page in order, and what breaks the order: no main heading, more than one, a level skipped.
export function headingsOf(html) {
  const levels = [...String(html ?? '').matchAll(/<h([1-6])\b[^>]*>/gi)].map((m) => Number(m[1]));
  const skips = levels.slice(1).map((l, i) => [levels[i], l]).filter(([a, b]) => b > a + 1).map(([a, b]) => `h${a} to h${b}`);
  const ones = levels.filter((l) => l === 1).length;
  return { levels, skips, ones };
}
// What a page loads from its own folder: the page, and each stylesheet, script and image it names there. Bytes, as
// read from disk (a built page, before compression). assets(path) → bytes or null.
export function weightOf(html, assets = () => null) {
  const refs = [...String(html ?? '').matchAll(/<(?:link|script|img|source)\b[^>]*?\b(?:href|src|srcset)=["']([^"'#?\s]+)/gi)].map((m) => m[1]).filter((u) => !/^(https?:)?\/\//i.test(u) && !/^data:/i.test(u));
  let bytes = Buffer.byteLength(String(html ?? '')), found = 0;
  for (const r of [...new Set(refs)]) { const b = assets(r); if (b != null) { bytes += b; found++; } }
  return { bytes, assets: found, named: new Set(refs).size };
}
// The other hosts a product's code names: in a script, a stylesheet, an image or a request it makes (fetch, XHR, a
// beacon, a socket). A link a person follows is not loading anything, and is left out.
export function hostsIn(text) {
  const out = new Set();
  const src = String(text ?? '');
  for (const m of src.matchAll(/(?:\bsrc=|\bhref=)["'](https?:)?\/\/([a-z0-9.-]+)/gi)) if (!/<a\b[^>]*$/i.test(src.slice(Math.max(0, m.index - 200), m.index))) out.add(m[2].toLowerCase());
  for (const m of src.matchAll(/\b(?:fetch|sendBeacon|open|WebSocket|EventSource|axios(?:\.\w+)?|ky(?:\.\w+)?)\(\s*(?:['"`]\s*\w*\s*['"`]\s*,\s*)?['"`](?:https?|wss?):\/\/([a-z0-9.-]+)/gi)) out.add(m[1].toLowerCase());
  return [...out].filter((h) => !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(h) && !/\.(test|localhost|example|invalid)$/.test(h)).sort();
}
// How a product measures its use: the analytics it loads or calls, by the names their code is written with.
const MEASURES = [['Google Analytics', /\bgtag\(|googletagmanager\.com|google-analytics\.com/], ['Plausible', /plausible\.io|\bplausible\(/], ['PostHog', /posthog/i], ['Matomo', /matomo|_paq\.push/], ['Umami', /umami/i], ['Segment', /analytics\.(track|page|identify)\(|segment\.(com|io)/], ['Mixpanel', /mixpanel/i], ['Amplitude', /amplitude/i], ['its own events', /\b(track|logEvent|sendEvent|trackEvent)\(\s*['"`]/]];
export const measuresIn = (text) => MEASURES.filter(([, re]) => re.test(String(text ?? ''))).map(([n]) => n);

// ── the answers ──
const ANSWER = {
  built({ departures }) {
    if (!departures) return none('the last full run wrote no departures for the products (run the engine once)');
    const { copies = 0, own = 0, names = [] } = departures;
    const n = copies + own;
    return { rating: !n ? 'good' : n <= 3 ? 'mixed' : 'poor', evidence: [n ? `${plural(copies, 'copy', 'copies')} of the system's components and ${plural(own, 'component', 'components')} of its own built beside them${names.length ? `: ${few(names)}` : ''}` : 'no copy of a system component and none built beside one'], unseen: ['a component built in a way the engine does not read as one (a shape drawn in markup, a canvas)'] };
  },
  reading({ pages }) {
    if (!pages?.length) return none('no built page of the product to read (paths.plugins with its built page)');
    const bad = pages.filter((p) => p.headings.skips.length || p.headings.ones !== 1);
    return { rating: !bad.length ? 'good' : bad.length < pages.length ? 'mixed' : 'poor', evidence: [`${plural(pages.length, 'page', 'pages')} read`, ...bad.slice(0, 4).map((p) => `${p.file}: ${[p.headings.ones !== 1 ? `${p.headings.ones} main headings` : null, p.headings.skips.length ? `a level skipped (${p.headings.skips.join(', ')})` : null].filter(Boolean).join(' and ')}`)], unseen: ['the headings and words a page draws once its script runs'] };
  },
  hosts({ hosts, files }) {
    if (!files) return none('no folder of the product to read (products or pluginDirs in ds-config.json)');
    return { rating: hosts.length ? 'mixed' : 'good', evidence: [hosts.length ? `${plural(hosts.length, 'other host', 'other hosts')} named in its code: ${few(hosts)}` : `none named in its code (${plural(files, 'file', 'files')} read)`], unseen: ['a request the code builds at run time, from a value it reads'] };
  },
  access({ a11y }) {
    if (!a11y) return none("no accessibility run on the product's pages");
    return { rating: a11y.blockers ? 'poor' : a11y.warnings ? 'mixed' : 'good', evidence: [`${plural(a11y.pages, 'page', 'pages')} checked: ${plural(a11y.blockers, 'blocker', 'blockers')}, ${plural(a11y.warnings, 'warning', 'warnings')}`], unseen: ['what only a person with the assistive technology can tell'] };
  },
  tests({ tests, files }) {
    if (!files) return none('no folder of the product to read');
    return { rating: tests ? 'good' : 'poor', evidence: [tests ? `${plural(tests, 'test file', 'test files')} in its folder` : 'no test file in its folder (*.test.*, *.spec.*)'], unseen: ['whether they pass, and whether they run before a release'] };
  },
  release({ product, latest, compare }) {
    if (!product?.uses) return none('which release of the system it uses (products.<name>.uses, or its package.json)');
    if (!latest) return none("the system's own latest release");
    const behind = compare ? compare(product.uses, latest) < 0 : product.uses !== latest;
    return { rating: behind ? 'mixed' : 'good', evidence: [`it uses ${product.uses}, and the latest is ${latest}`], unseen: [] };
  },
  weight({ pages }) {
    if (!pages?.length) return none('no built page of the product to read');
    const kb = (b) => `${Math.round(b / 1024)} KB`;
    const heaviest = [...pages].sort((a, b) => b.weight.bytes - a.weight.bytes)[0];
    return { rating: heaviest.weight.bytes <= 500 * 1024 ? 'good' : heaviest.weight.bytes <= 1500 * 1024 ? 'mixed' : 'poor', evidence: [`the heaviest page, ${heaviest.file}, loads ${kb(heaviest.weight.bytes)} from its own folder (${plural(heaviest.weight.assets, 'file', 'files')} beside the page)`], unseen: ['what it loads from other hosts', 'how long it takes to open, in a browser and on a slow network'] };
  },
  measures({ measures, files }) {
    if (!files) return none('no folder of the product to read');
    return { rating: measures.length ? 'good' : 'poor', evidence: [measures.length ? `it measures with ${measures.join(', ')}` : 'nothing in its code measures how it is used'], unseen: ['what it measures, and whether anyone reads it'] };
  },
};
export const productHealth = (ev = {}) => PRODUCT_QUESTIONS.map((q) => ({ ...q, run: q.run.replace('<name>', ev.product?.name ?? '<name>'), ...ANSWER[q.id](ev) }));

// ── reading the evidence ──
const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const walk = (dir, test, out = [], depth = 0) => {
  if (depth > 8) return out;
  let list; try { list = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of list) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!/^(node_modules|dist|build|coverage|out|\.git)$/.test(e.name) && !e.name.startsWith('.')) walk(p, test, out, depth + 1); }
    else if (test(e.name)) out.push(p);
  }
  return out;
};
export async function readProductEvidence(ROOT, cfg = {}, name, OUT_DIR = '.design-system-engine-out') {
  const rel = await import('./releases.mjs');
  const product = rel.productsOf(ROOT, cfg).find((p) => p.name === name);
  if (!product) return null;
  const dir = product.dir ? resolve(ROOT, product.dir) : null;
  const ev = { product, latest: rel.systemVersion(ROOT, cfg), compare: rel.compareVersions };
  if (dir && existsSync(dir)) {
    const code = walk(dir, (n) => /\.(m?[jt]sx?|vue|svelte|html?)$/.test(n));
    const text = code.map((f) => { try { return readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
    ev.files = code.length;
    ev.hosts = hostsIn(text);
    ev.measures = measuresIn(text);
    ev.tests = walk(dir, (n) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(n)).length;
  }
  const { productPages } = await import('./code-roots.mjs');
  const pages = productPages(ROOT, cfg).filter((p) => p.product === name || (dir && resolve(p.file).startsWith(dir)));
  ev.pages = pages.map((p) => {
    const html = (() => { try { return readFileSync(p.file, 'utf8'); } catch { return ''; } })();
    const at = (u) => { try { return statSync(resolve(dirname(p.file), u.replace(/^\//, ''))).size; } catch { return null; } };
    return { file: p.file.slice(resolve(ROOT).length + 1) || p.file, headings: headingsOf(html), weight: weightOf(html, at) };
  });
  // What the last full run found it built beside the system (departures.json: its copies and its own components).
  const dep = readJson(join(ROOT, OUT_DIR, 'departures.json'));
  if (dep) {
    const b = (dep.products ?? []).find((x) => x.product === name);
    ev.departures = { copies: (b?.forks ?? []).length, own: (b?.parallels ?? []).length, names: [...(b?.forks ?? []).map((f) => f.like), ...(b?.parallels ?? []).map((x) => x.name)].filter(Boolean) };
  } else ev.departures = null;
  // The accessibility run, when it read this product's pages (a11y.urls on them).
  const a = readJson(join(ROOT, OUT_DIR, 'a11y.json'));
  const mine = (a?.issues ?? []).filter((i) => dir && String(i.url ?? i.page ?? '').includes(String(product.dir ?? name).replace(/^\.\//, '')));
  const pagesRun = new Set((a?.pages ?? []).map((x) => String(x.url ?? x)).filter((u) => dir && u.includes(String(product.dir ?? name).replace(/^\.\//, ''))));
  ev.a11y = pagesRun.size || mine.length ? { pages: pagesRun.size || new Set(mine.map((i) => i.url ?? i.page)).size, blockers: mine.filter((i) => i.blocker || i.level === 'blocker' || i.impact === 'critical' || i.impact === 'serious').length, warnings: mine.filter((i) => !(i.blocker || i.level === 'blocker' || i.impact === 'critical' || i.impact === 'serious')).length } : null;
  return ev;
}
