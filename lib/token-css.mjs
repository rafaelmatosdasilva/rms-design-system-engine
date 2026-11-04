// token-css.mjs - the stylesheets that declare the design tokens (ds-config.json → paths.themeCSS). Every value the
// engine measures is compared against them, so one of them gone is not a small thing: each token reads as undeclared,
// every component differs from Figma, and the style guide shows a system that looks broken when nothing is. A run
// says so before it measures anything.
//
// One of them is the engine's own: the hosted stylesheets a product loads at runtime, downloaded and merged into one
// local file at setup (hosted-tokens.mjs). The addresses it took them from are kept beside the file's path
// (paths.themeCSSFrom), so a run that finds it gone takes it again rather than comparing against nothing. A file a
// person named is theirs: the run stops and says which one, and what it held.
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fetchHosted, mergeHosted, siblingUrls, takeableUrls } from './hosted-tokens.mjs';

// Where the setup puts the merged hosted stylesheets (audit.mjs writes it there too).
export const HOSTED_FILE = 'src/styles/tokens.hosted.css';

const list = (v) => [v ?? []].flat().map(String).filter(Boolean);
const isUrl = (p) => /^https?:\/\//i.test(p);

// The files paths.themeCSS names that are not on disk. A URL there is not a file and is never missing.
export function missingThemeCss(ROOT, cfg) {
  return list(cfg.paths?.themeCSS).filter((p) => !isUrl(p) && !existsSync(resolve(ROOT, p)));
}

// The addresses the hosted file was taken from: what the setup recorded, else what the product's own code loads its
// tokens from (a template address, ${theme}_desktop.css, is not one the engine can ask for).
export function hostedSources(ROOT, cfg, { hints = [] } = {}) {
  const kept = list(cfg.paths?.themeCSSFrom).filter(isUrl);
  return kept.length ? kept : takeableUrls(hints);
}

// Every mode the system has, by the names the Figma capture gives them (Theme: light, dark; Breakpoint: desktop,
// phone), so a stylesheet per mode is asked for beside the ones recorded.
export function modeNames(ROOT, cfg) {
  try {
    const v = JSON.parse(readFileSync(resolve(ROOT, cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json'), 'utf8'));
    return Object.values(v.modeVariants ?? {}).flatMap((d) => (d?.modes ?? []).map((m) => String(m.snapshotKey ?? m.name ?? '')).filter(Boolean));
  } catch { return []; }
}

// The hosted stylesheets taken again into the one local file, every mode of them. → { ok, file, took, from, line }
export async function retakeHosted(ROOT, cfg, { urls = null, fetchImpl, file = HOSTED_FILE } = {}) {
  const from = (urls && urls.length ? urls.map(String).filter(isUrl) : hostedSources(ROOT, cfg));
  if (!from.length) return { ok: false, from: [], took: 0, file, line: `⚠️  Nothing says where ${file} was taken from: ds-config.json → paths.themeCSSFrom names no address, and the code loads its tokens from an address it builds as it runs. Give the addresses once (rms-design-system-engine --refresh-token-css <url> …) and the engine keeps them.` };
  const named = await fetchHosted(from, { fetchImpl, log: () => {} });
  const files = [...named];
  if (files.length) files.push(...await fetchHosted(siblingUrls(from, modeNames(ROOT, cfg)), { fetchImpl, log: () => {} }));
  if (!files.length) return { ok: false, from, took: 0, file, line: `⚠️  None of the hosted token stylesheets could be read (${from.join(', ')}): the run has no token values to compare against.` };
  const merged = mergeHosted(files);
  const out = resolve(ROOT, file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, merged.css);
  const modes = [[merged.base.colour, ...merged.colours].filter(Boolean).join(', '), [merged.base.size, ...merged.sizes].filter(Boolean).join(', ')].filter(Boolean).join(' × ');
  const tokens = new Set((merged.css.match(/--[\w-]+(?=\s*:)/g) ?? [])).size;
  return { ok: true, from, took: files.length, file, line: `🎨 ${file} taken again from ${from.length === 1 ? from[0] : `${from.length} addresses`}: ${files.length} stylesheet(s)${modes ? `, every mode (${modes})` : ''}, ${tokens} tokens.` };
}

// What every run checks: the token stylesheets the setup named are on disk. The engine's own file it takes again; one
// a person named it cannot. → { lines, stop }
export async function themeCssOnRun(ROOT, cfg, { offline = false, fetchImpl, retake = retakeHosted } = {}) {
  // A system that builds its tokens from Figma (build: true) names the file they will be written into, which is not
  // there until they are: the gate for that file says so itself and lists what to write, so a run is never stopped
  // for it.
  if (cfg?.build === true) return { lines: [], stop: false };
  const gone = missingThemeCss(ROOT, cfg);
  if (!gone.length) return { lines: [], stop: false };
  const lines = [], left = [];
  for (const p of gone) {
    if (p !== HOSTED_FILE) { left.push(p); continue; }
    if (offline) { lines.push(`⚠️  ${p} is not here, and this run reads nothing over the network: the token values it holds are missing from every comparison.`); left.push(p); continue; }
    const r = await retake(ROOT, cfg, { fetchImpl });
    lines.push(r.line);
    if (!r.ok) left.push(p);
  }
  if (!left.length) return { lines, stop: false };
  lines.push(`❌ The design tokens are read from ${left.join(', ')} (ds-config.json → paths.themeCSS), and ${left.length === 1 ? 'that file is not here' : 'those files are not here'}. Nothing is measured against nothing: every token would read as undeclared and every component as different from Figma.`);
  lines.push(`NEXT: tell the person which file is missing and that nothing was measured; ask whether to take it again from where their tokens are hosted (rms-design-system-engine --refresh-token-css <url>, which keeps the address), or to point paths.themeCSS at the file that declares their tokens.`);
  return { lines, stop: true };
}
