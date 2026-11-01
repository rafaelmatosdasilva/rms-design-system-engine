// page-judgment.mjs - a model judges each Showroom screen against its brief, only when asked (--judge-pages).
//
// The page review (page-quality.mjs, showroom-quality.mjs) reads a screen's structure: what can be measured. What
// cannot be measured is judgement: whether each part uses the component made for what it does, whether one action
// reads first on the screen as it is drawn, whether a destructive action looks louder than the main decision, whether
// the screen is arranged as its brief says. A model reads each screen's screenshot and its code, the components it uses
// with what each is for, and its brief, against a fixed list of named decisions, and answers each one: holds, breaks or
// unclear, with what it saw, how much it matters, and one sentence a reviewer can check on the screen.
//
// Only decisions that should be the same every time are named (DECISIONS). A project can judge fewer of them
// (pageJudgment.decisions in ds-config.json); anything not named is left unjudged, so a page keeps room for variety.
// The model is asked through the person's own command (pageJudgment.cmd), the way the guidance rating's extraction
// test asks one (guidance-rating.mjs askModel): the prompt on stdin, the answer on stdout. It spends the person's model
// tokens, so it runs only when asked, and each answer is kept by the screenshot's hash and the rubric's (the decisions
// asked, their words, the brief), so a screen that did not change is never paid for twice. What it finds is advisory:
// shown beside the page review, never a failure. A decision judged broken on three screens becomes a proposed rule
// (lessons.mjs, like the page review's own findings).
//
//   decisionsFrom(cfg)                       → { decisions: [{ id, label, ask, rule }], unknown: [name] }
//   judgmentPrompt(screen, decisions)        → the prompt for one screen
//   parseAnswer(stdout)                      → { text, cost }   (claude -p --output-format json, or plain text)
//   parseJudgment(text, decisions)           → [{ decision, label, verdict, severity, evidence, check }] | null
//   judgePages(ROOT, cfg, { ask, shoot })    → { screens, asked, cached, cost, failed, why }
//   judgmentLine(run) / judgmentLines(run)   → what the run says
//   showroomReviews(ROOT, cfg)               → { [screen]: { review, judged } } for the style guide
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { OUT_DIR } from './names.mjs';
import { REPEAT_RULES } from './lessons.mjs';

export const RESULT_FILE = `${OUT_DIR}/page-judgment.json`;
export const CACHE_FILE = `${OUT_DIR}/page-judgment-cache.json`;
export const SHOTS_DIR = `${OUT_DIR}/page-judgment`;
// The command that answers a prompt on stdin: claude, printing its answer with what it cost, allowed to read only (the
// screenshot), with no MCP server of the session loaded.
export const DEFAULT_CMD = 'claude -p --output-format json --tools Read --allowedTools Read --strict-mcp-config';
// Bumped when the prompt's wording changes, so a kept answer to the old words is asked again.
const PROMPT_VERSION = 1;

// The decisions a model is asked about, each one that should be decided the same way every time. Their rules are the
// ones a repeated finding proposes (lessons.mjs REPEAT_RULES, judge:<id>).
export const DECISIONS = {
  component: { label: 'The right component', ask: 'The right component for the intent: each part of the screen uses the system component made for what that part does (read what each component is for, below), never one made for something else, and never an element made by hand where the system has a component for it.' },
  primary: { label: 'One main action', ask: 'One main action: one action on the screen reads first, by colour, weight, size and place; every other action looks secondary. An action inside a dialog or a panel belongs to that layer, not to the screen.' },
  destructive: { label: 'Nothing destructive in front', ask: 'Nothing destructive in front: an action that deletes, removes, discards or cancels is never more prominent than the main decision of the screen, not louder in colour, not bigger, not placed first.' },
  layout: { label: 'Arranged as its brief says', brief: true, ask: 'Arranged as its brief says: the screen puts first what its brief says matters most, groups what the brief groups, and shows nothing the brief does not ask for.' },
};
const VERDICTS = ['holds', 'breaks', 'unclear'];
const SEVERITIES = ['high', 'medium', 'low'];

const sha = (b) => createHash('sha256').update(b).digest('hex');
const flat = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cap = (s, n) => { const t = flat(s); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const readJson = (p, fallback) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; } };

// The decisions this project judges: every named one, or the ones pageJudgment.decisions lists (by name). A name the
// engine does not know is said and left out; a decision is never written in a project's own words, so it stays the
// same on every screen and every run.
export function decisionsFrom(cfg = {}) {
  const asked = Array.isArray(cfg?.pageJudgment?.decisions) ? cfg.pageJudgment.decisions.map((d) => String(d).trim()).filter(Boolean) : Object.keys(DECISIONS);
  const ids = [...new Set(asked)];
  return {
    decisions: ids.filter((id) => DECISIONS[id]).map((id) => ({ id, ...DECISIONS[id], rule: REPEAT_RULES[`judge:${id}`]?.text ?? null })),
    unknown: ids.filter((id) => !DECISIONS[id]),
  };
}

// A screen's page as a short outline the model can read beside its picture: each system component and each element
// that says something (a heading, a button, a field), with the attributes that decide how it looks and its words.
const KEEP_ATTR = /^(variant|type|kind|appearance|priority|emphasis|level|color|colour|tone|intent|size|title|label|labelContent|heading|as|role|surface|placeholder|aria-label|href|disabled|primary|danger|destructive)$/i;
const SAYS_TAG = /^(h[1-6]|button|a|input|select|textarea|label|form|nav|main|header|footer|section|article|aside|dialog|table|ul|ol|img|p)$/i;
export function outline(page, { maxLines = 160, maxChars = 7000 } = {}) {
  const lines = [];
  const go = (n, depth) => {
    const attrs = Object.entries(n.attrs ?? {}).filter(([k]) => KEEP_ATTR.test(k)).map(([k, v]) => (v === true ? k : `${k}="${cap(v, 40)}"`));
    const says = n.name || (n.tag && SAYS_TAG.test(n.tag)) || attrs.length || n.text;
    const words = n.text && !Object.values(n.attrs ?? {}).includes(n.text) ? ` "${cap(n.text, 60)}"` : '';   // its words, once
    if (says) lines.push(`${'  '.repeat(depth)}${n.name ?? `<${n.tag}>`}${attrs.length ? ` ${attrs.join(' ')}` : ''}${words}${n.line != null ? `  (line ${n.line})` : ''}`);
    for (const c of n.children ?? []) go(c, says ? depth + 1 : depth);
  };
  for (const c of page?.children ?? []) go(c, 0);
  let out = lines.slice(0, maxLines).join('\n');
  if (lines.length > maxLines) out += `\n… ${lines.length - maxLines} more`;
  return out.length > maxChars ? `${out.slice(0, maxChars)}\n…` : out;
}

// The system components a page uses, in the order it first uses them.
export function componentsOf(page) {
  const out = [];
  const go = (n) => { if (n.name && !out.includes(n.name)) out.push(n.name); for (const c of n.children ?? []) go(c); };
  go(page ?? {});
  return out;
}

// What each component is for, as the team wrote it: its intent layer page, else what design-intent.json says of it
// (Figma's description, its code note). → { name: text }
export async function componentIntents(ROOT, cfg, names) {
  const out = {};
  if (!names.length) return out;
  try {
    const il = await import('./intent-layer.mjs');
    for (const [n, t] of Object.entries(il.intentWords(il.readIntentLayer(ROOT, cfg), names, il.codeFilesOf(ROOT, cfg)))) out[n] = t;
  } catch { /* no intent layer */ }
  const theme = [cfg?.paths?.themeCSS].flat().filter(Boolean)[0] ?? 'src/theme.css';
  const di = readJson(resolve(ROOT, cfg?.docs?.out ?? join(dirname(theme), 'design-intent.json')), {});
  for (const n of names) {
    if (out[n]) continue;
    const d = di?.components?.[n];
    const t = [d?.design?.description, d?.design?.annotations?.[0], d?.code?.note].map(flat).filter(Boolean)[0];
    if (t) out[n] = t;
  }
  for (const n of Object.keys(out)) out[n] = cap(String(out[n]).split('\n').slice(0, 4).join(' · '), 400);
  return out;
}

// A screen's brief, when one is known: "brief" in its <Screen>.json (text, or lines), else a <Screen>.brief.md beside it.
export function briefOf(dir, screen) {
  const meta = readJson(join(dir, `${screen}.json`), {});
  const b = Array.isArray(meta.brief) ? meta.brief.join('\n') : meta.brief;
  if (typeof b === 'string' && b.trim()) return cap(b, 2000);
  try { const t = readFileSync(join(dir, `${screen}.brief.md`), 'utf8').trim(); if (t) return t.length > 2000 ? `${t.slice(0, 1999)}…` : t; } catch { /* none */ }
  return null;
}

// The decisions a screen is judged on: one that reads a brief is left unjudged when the screen has none.
export function decisionsFor(decisions, { brief }) {
  return { ask: decisions.filter((d) => !d.brief || brief), unjudged: decisions.filter((d) => d.brief && !brief).map((d) => ({ decision: d.id, label: d.label, why: 'no brief for this screen' })) };
}

// screen: { title, file, shot (its absolute path), brief, components: [{ name, intent }], outline }
export function judgmentPrompt(screen, decisions) {
  const comps = screen.components?.length
    ? screen.components.map((c) => `- ${c.name}${c.intent ? `: ${c.intent}` : ': (nothing written about what it is for)'}`).join('\n')
    : '- none of the system\'s components: every part is written by hand';
  return [
    'You review one screen of a product built with a design system. Judge only the decisions listed below, each on the screenshot and on the code together. Say nothing about anything else.',
    '',
    `Screenshot: read the image file at ${screen.shot} before you answer. It shows the screen as a person sees it.`,
    `Screen: ${screen.title}${screen.file ? ` (${screen.file})` : ''}`,
    `Brief: ${screen.brief ? `\n${screen.brief}` : 'none given'}`,
    '',
    'The system components it uses, each with what the system says it is for:',
    comps,
    '',
    'Its code, as an outline (each system component or element, the attributes that decide how it looks, its words, its line):',
    screen.outline || '(empty)',
    '',
    'The decisions to judge:',
    ...decisions.map((d, i) => `${i + 1}. ${d.id}: ${d.ask}`),
    '',
    'Answer with JSON only, no other text, one entry per decision in the order above:',
    `{"findings":[{"decision":"${decisions.map((d) => d.id).join('|')}","verdict":"holds|breaks|unclear","severity":"high|medium|low","evidence":"what you see on the screen and in the code, naming the part and where it is","check":"one sentence a reviewer can check on the screen"}]}`,
    'Severity: high when a person would act on the wrong thing, medium when the screen reads less clearly, low otherwise. A decision that holds is low. Use unclear only when the screenshot and the code cannot tell.',
    '',
  ].join('\n');
}

// What the command printed: claude -p --output-format json wraps the answer with what it cost; any other command's
// output is the answer itself. → { text, cost (US dollars, or null), error }
export function parseAnswer(stdout) {
  const raw = String(stdout ?? '').trim();
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === 'object' && !Array.isArray(j) && typeof j.result === 'string') {
      const cost = Number(j.total_cost_usd ?? j.cost_usd);
      return { text: j.result, cost: Number.isFinite(cost) ? cost : null, error: j.is_error ? cap(j.result, 200) || 'the command said it failed' : null };
    }
  } catch { /* plain text */ }
  return { text: raw, cost: null, error: null };
}

// The model's answer, held to the rubric: only the decisions asked, each verdict and severity one of the words asked,
// its evidence and check kept short. An answer that is not the JSON asked for is null (asked again on the next run).
export function parseJudgment(text, decisions) {
  const t = String(text ?? '').replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  let j; try { j = JSON.parse(t.slice(a, b + 1)); } catch { return null; }
  const list = Array.isArray(j) ? j : Array.isArray(j?.findings) ? j.findings : null;
  if (!list) return null;
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const out = [];
  for (const f of list) {
    const d = byId.get(String(f?.decision ?? '').trim());
    const verdict = String(f?.verdict ?? '').trim().toLowerCase();
    if (!d || !VERDICTS.includes(verdict) || out.some((x) => x.decision === d.id)) continue;
    const severity = SEVERITIES.includes(String(f?.severity ?? '').trim().toLowerCase()) ? String(f.severity).trim().toLowerCase() : (verdict === 'holds' ? 'low' : 'medium');
    out.push({ decision: d.id, label: d.label, verdict, severity, evidence: cap(f?.evidence, 400), check: cap(f?.check, 240) });
  }
  return out.length ? out.sort((x, y) => decisions.findIndex((d) => d.id === x.decision) - decisions.findIndex((d) => d.id === y.decision)) : null;
}

// A screen's own picture, kept beside it (showroom/<Screen>.png, .jpg, .webp): used as it is, never taken again.
export function ownShot(dir, screen) {
  return ['.png', '.jpg', '.jpeg', '.webp'].map((e) => join(dir, screen + e)).find(existsSync) ?? null;
}

// Each Showroom screen as the built style guide draws it (Chrome): at Figma's size, unscaled, in the brand and the
// colour mode its screen is designed in, saved as a PNG in the engine's own folder. → { shots: { key: path }, why }
export async function captureShots(ROOT, cfg, keys, { pageFile = resolve(ROOT, cfg?.styleguide?.out ?? `${OUT_DIR}/styleguide/index.html`), outDir = resolve(ROOT, SHOTS_DIR), metas = {} } = {}) {
  if (!keys.length) return { shots: {}, why: null };
  if (!existsSync(pageFile)) return { shots: {}, why: `no built style guide at ${relative(ROOT, pageFile)} to take the screenshots from (build it with rms-design-system-engine --styleguide)` };
  const { findChrome, launchChrome, connectCDP, openPage, waitForTrue, FILE_PAGE_LOADED } = await import('./cdp.mjs');
  const { pathToFileURL } = await import('node:url');
  const chrome = findChrome({ playwright: true });
  if (!chrome || typeof WebSocket === 'undefined') return { shots: {}, why: 'Chrome not found (set CHROME_PATH)' };
  const themeOf = (m) => { const v = Object.entries(m?.modes ?? {}).find(([a]) => /theme|colou?r|mode|styling/i.test(a))?.[1]; return /dark/i.test(v ?? '') ? 'dark' : 'light'; };
  let browser = null, cdp = null;
  const shots = {};
  try {
    browser = await launchChrome(chrome, { tmpPrefix: 'dse-judge-' });
    cdp = await connectCDP(browser.wsUrl);
    const { send } = cdp;
    const { sessionId } = await openPage(send, pathToFileURL(pageFile).href + '#showroom');
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false }, sessionId);
    await waitForTrue(send, sessionId, FILE_PAGE_LOADED, { attempts: 400, intervalMs: 50 });
    await new Promise((r) => setTimeout(r, 1200));
    mkdirSync(outDir, { recursive: true });
    for (const key of keys) {
      const ready = `(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        window.__dseShowroomFrame = 'laptop';
        location.hash = '#showroom/' + encodeURIComponent(${JSON.stringify(key)});
        await wait(500);
        const sc = document.querySelector('.sg-showroom-detail .sg-showroom-screen[data-screen="' + CSS.escape(${JSON.stringify(key)}) + '"]');
        if (!sc) return null;
        document.documentElement.setAttribute('data-theme', ${JSON.stringify(themeOf(metas[key]))});
        const brand = ${JSON.stringify(metas[key]?.brand ?? null)};
        if (brand) document.documentElement.setAttribute('data-brand', brand); else document.documentElement.removeAttribute('data-brand');
        await wait(200);
        const stage = sc.parentElement;
        stage.setAttribute('data-measuring', '');
        stage.style.cssText = 'position:fixed;left:0;top:0;width:' + sc.style.width + ';height:' + sc.style.height + ';z-index:99999;overflow:hidden;border:0';
        sc.style.transform = 'none';
        await wait(400);
        const r = sc.getBoundingClientRect();
        return JSON.stringify({ w: Math.round(r.width), h: Math.round(r.height) });
      })()`;
      try {
        const r = await send('Runtime.evaluate', { expression: ready, awaitPromise: true, returnByValue: true }, sessionId);
        const box = r.result?.value ? JSON.parse(r.result.value) : null;
        if (!box?.w || !box?.h) continue;
        const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: box.w, height: box.h, scale: 1 }, captureBeyondViewport: true }, sessionId);
        if (!shot?.data) continue;
        const file = join(outDir, `${key.replace(/[^\w.-]+/g, '-')}.png`);
        writeFileSync(file, Buffer.from(shot.data, 'base64'));
        shots[key] = file;
        await send('Runtime.evaluate', { expression: `(() => { const sc = document.querySelector('.sg-showroom-detail .sg-showroom-screen'); if (sc) { const st = sc.parentElement; st.style.cssText = ''; st.removeAttribute('data-measuring'); } location.hash = '#showroom'; })()` }, sessionId);
      } catch { /* this screen has no screenshot */ }
    }
  } catch (e) { return { shots, why: String(e?.message ?? e).split('\n')[0] }; }
  finally { try { cdp?.close(); } catch { /* closed */ } try { browser?.kill(); } catch { /* gone */ } }
  return { shots, why: null };
}

// The run: each Showroom screen's screenshot, code, components and brief, judged on the decisions asked, from the
// cache when its screenshot and rubric are the same as last time, else asked of the model. Writes RESULT_FILE (the
// last judgment, which the style guide and the run summary read) and keeps the answers in CACHE_FILE.
// ask(prompt) → { ok, out, why }: the person's command (askModel), or a stand-in in tests.
// shoot(keys, metas) → { shots: { key: path }, why }: the screenshots the screens have no picture of their own for.
export async function judgePages(ROOT, cfg = {}, { ask = null, shoot = null, now = new Date().toISOString() } = {}) {
  const dir = resolve(ROOT, cfg.paths?.showroom ?? 'showroom');
  const { showroomQuality } = await import('./showroom-quality.mjs');
  const rows = await showroomQuality(ROOT, cfg, { withPage: true });
  const { decisions, unknown } = decisionsFrom(cfg);
  const run = { at: now, decisions: decisions.map((d) => d.id), unknown, screens: [], asked: 0, cached: 0, cost: 0, costKnown: true, failed: [], why: null };
  if (!rows.length) return { ...run, why: 'no Showroom screen to judge' };
  if (!decisions.length) return { ...run, why: 'no decision to judge (pageJudgment.decisions names none the engine knows)' };
  if (!ask) {
    const { askModel } = await import('./guidance-rating.mjs');
    const cmd = cfg.pageJudgment?.cmd ?? DEFAULT_CMD;
    ask = (prompt) => askModel(prompt, cmd, { cwd: ROOT, timeout: 600000 });
  }
  const metas = Object.fromEntries(rows.map((r) => [r.screen, readJson(join(dir, `${r.screen}.json`), {})]));
  const own = Object.fromEntries(rows.map((r) => [r.screen, ownShot(dir, r.screen)]).filter(([, p]) => p));
  const need = rows.map((r) => r.screen).filter((k) => !own[k]);
  const taken = need.length ? await (shoot ?? ((keys, m) => captureShots(ROOT, cfg, keys, { metas: m })))(need, metas) : { shots: {}, why: null };
  const shots = { ...(taken.shots ?? {}), ...own };
  const cache = readJson(resolve(ROOT, CACHE_FILE), {});
  for (const r of rows) {
    const shot = shots[r.screen];
    const title = metas[r.screen]?.title ?? r.screen;
    if (!shot) { run.failed.push({ screen: r.screen, why: taken.why ?? 'no screenshot of it (the style guide could not draw it)' }); continue; }
    const brief = briefOf(dir, r.screen);
    const { ask: asking, unjudged } = decisionsFor(decisions, { brief });
    const rubric = sha(JSON.stringify({ v: PROMPT_VERSION, decisions: asking.map((d) => [d.id, d.ask]), brief }));
    let image; try { image = readFileSync(shot); } catch { run.failed.push({ screen: r.screen, why: 'its screenshot could not be read' }); continue; }
    const key = `${sha(image)}:${rubric}`;
    const names = componentsOf(r.page);
    const base = { screen: r.screen, title, file: r.file, shot: relative(ROOT, shot), brief: !!brief, unjudged };
    if (cache[key]?.findings) {
      run.cached += 1;
      run.screens.push({ ...base, at: cache[key].at, cached: true, cost: 0, findings: cache[key].findings });
      continue;
    }
    const intents = await componentIntents(ROOT, cfg, names);
    const prompt = judgmentPrompt({ title, file: r.file, shot: resolve(shot), brief, components: names.map((n) => ({ name: n, intent: intents[n] ?? null })), outline: outline(r.page) }, asking);
    const answered = await ask(prompt);
    run.asked += 1;
    if (!answered?.ok) { run.failed.push({ screen: r.screen, why: answered?.why || 'the command failed' }); continue; }
    const { text, cost, error } = parseAnswer(answered.out);
    if (cost == null) run.costKnown = false; else run.cost += cost;
    if (error) { run.failed.push({ screen: r.screen, why: error }); continue; }
    const findings = parseJudgment(text, asking);
    if (!findings) { run.failed.push({ screen: r.screen, why: 'the answer was not the JSON asked for' }); continue; }
    cache[key] = { at: now, findings, cost };
    run.screens.push({ ...base, at: now, cached: false, cost, findings });
  }
  run.cost = Math.round(run.cost * 10000) / 10000;
  mkdirSync(resolve(ROOT, OUT_DIR), { recursive: true });
  writeFileSync(resolve(ROOT, CACHE_FILE), JSON.stringify(cache, null, 1) + '\n');
  writeFileSync(resolve(ROOT, RESULT_FILE), JSON.stringify({ $description: 'Each Showroom screen judged by a model on the decisions named (rms-design-system-engine --judge-pages). Advisory; the engine\'s own record.', ...run }, null, 1) + '\n');
  // A decision judged broken counts toward a proposed rule, as a page review's finding does (lessons.mjs).
  if (run.screens.length) { try { (await import('./lessons.mjs')).noteReview(ROOT, run.screens.map((s) => ({ place: s.screen, kinds: s.findings.filter((f) => f.verdict === 'breaks').map((f) => f.decision) })), { now, prefix: 'judge' }); } catch { /* a help, never a blocker */ } }
  return run;
}

export const readJudgment = (ROOT) => readJson(resolve(ROOT, RESULT_FILE), null);

// Dollars as the command said them, to a tenth of a cent under a dollar ($0.043), cents above.
const money = (n) => { let t = n.toFixed(n > 0 && n < 0.001 ? 4 : n < 1 ? 3 : 2); if (n < 1 && /\.\d{2}0$/.test(t)) t = t.slice(0, -1); return `$${t}`; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
// What it cost: the new answers' price as the command reported it; the cached ones paid nothing.
function costSaid(run) {
  const parts = [];
  if (run.asked) parts.push(run.costKnown ? `${money(run.cost)} for ${plural(run.asked, 'screen')} asked` : `${plural(run.asked, 'screen')} asked (the command did not say what it cost)`);
  if (run.cached) parts.push(`${plural(run.cached, 'screen')} from the cache, nothing paid`);
  return parts.length ? parts.join(', ') : 'nothing asked';
}

// The run's one line. → a string, or null when nothing was judged.
export function judgmentLine(run, { last = false } = {}) {
  if (!run || (!run.screens?.length && !run.failed?.length)) return null;
  if (!run.screens?.length) return `⚖️  Pages not judged by a model${last ? ` on ${String(run.at ?? '').slice(0, 10)}` : ''}: ${plural(run.failed.length, 'screen')} could not be (${run.failed[0].why}${run.failed.length > 1 ? '; …' : ''}). Cost ${last ? 'then ' : ''}${costSaid(run)}.`;
  const broken = (run.screens ?? []).flatMap((s) => s.findings.filter((f) => f.verdict === 'breaks').map((f) => `${s.title}: ${f.label.toLowerCase()}`));
  const head = `⚖️  Pages judged by a model${last ? ` on ${String(run.at ?? '').slice(0, 10)}` : ''}: ${plural(run.screens?.length ?? 0, 'screen')}`;
  const found = broken.length ? `${plural(broken.length, 'decision')} judged broken (${broken.slice(0, 3).join('; ')}${broken.length > 3 ? '; …' : ''})` : 'every decision asked holds or is unclear';
  return `${head}, ${found}. Advisory. Cost ${last ? 'then ' : ''}${costSaid(run)}${run.failed?.length ? `; ${plural(run.failed.length, 'screen')} not judged` : ''}.`;
}

export function judgmentLines(run, { max = 4 } = {}) {
  if (run?.why) return [`⚖️  Pages not judged: ${run.why}.`];
  const out = [];
  if (run.unknown?.length) out.push(`   pageJudgment.decisions names ${run.unknown.join(', ')}, which the engine does not judge (it judges ${Object.keys(DECISIONS).join(', ')}).`);
  for (const s of run.screens) {
    const shown = s.findings.filter((f) => f.verdict !== 'holds');
    out.push(`     ${s.title}  (${s.file}${s.cached ? ', from the cache' : ''}): ${shown.length ? `${plural(shown.length, 'decision')} to look at` : `all ${s.findings.length} decisions hold`}`);
    for (const f of shown.slice(0, max)) out.push(`       · ${f.label} ${f.verdict} (${f.severity}): ${f.evidence}${f.check ? ` Check: ${f.check}` : ''}`);
    if (shown.length > max) out.push(`       · … ${shown.length - max} more in ${RESULT_FILE}`);
    for (const u of s.unjudged ?? []) out.push(`       · ${u.label}: not judged, ${u.why}.`);
  }
  for (const f of run.failed) out.push(`     ${f.screen}: not judged, ${f.why}.`);
  const line = judgmentLine(run);
  return line ? [line, ...out] : out;
}

// For the style guide: each Showroom screen's page review (read from its code) and, when a model judged it, that
// judgment, from the last run (nothing is asked here). → { [screen]: { review: { score, findings }, judged } }
export async function showroomReviews(ROOT, cfg = {}) {
  const out = {};
  try {
    const { showroomQuality } = await import('./showroom-quality.mjs');
    for (const r of await showroomQuality(ROOT, cfg)) out[r.screen] = { review: { score: r.score, findings: r.findings } };
  } catch { /* no review */ }
  const last = readJudgment(ROOT);
  for (const s of last?.screens ?? []) (out[s.screen] ??= {}).judged = judgedView(s);
  return out;
}
export const judgedView = (s) => ({ at: s.at, findings: s.findings, unjudged: s.unjudged ?? [] });
// The judgments as the built page takes them (window.__dseShowroomJudged). → { [screen]: judgedView }
export const judgedForPage = (run) => Object.fromEntries((run?.screens ?? []).map((s) => [s.screen, judgedView(s)]));
