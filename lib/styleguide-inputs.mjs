// styleguide-inputs.mjs - what the style guide is built from must be there, or the page is not built.
//
// A page built without them is worse than no page: it is a page people believe. Without the Figma capture every
// component reads as one only the code has, the playground draws what nothing was compared against, and the parity
// figures are of nothing. Without the logo and the fonts the page is the team's in name only.
//
// The difference that matters, and the reason this is not one rule: a system with no Figma at all is a project the
// engine supports, and its page is honestly built from the code alone. A system whose setup *names* a store for its
// Figma capture and whose capture is not here has lost it on the way - a token that may not read it, a first run
// before anyone refreshed - and building then says things that are not true.
//
// What this does NOT judge: whether the font files cover the family the tokens name. The build settles that later
// with everything it needs to be right - it looks for every family the page names in the system's own files, then on
// the font services, and says which was found nowhere (font-embed.mjs). A check here could only count files in a
// folder, which says nothing: a system whose tokens name a web font keeps no files at all and draws perfectly. The
// fault the owner cares about - text in the browser's own face because the tokens were never read - is caught where
// it happens, by the stylesheet guard that runs before this one (token-css.mjs).
//
//   missingFigma(ROOT, cfg)        → the snapshots a setup names a store for and are not here
//   missingBrandFiles(ROOT, cfg)   → { logo, fonts }: what the setup names and is not on disk
//   takeBrandFiles(ROOT, cfg, …)   → the logo and the fonts fetched from the store that holds them
//   inputsOnRun(ROOT, cfg, …)      → { lines, stop }: said, taken where it can be, stopped where it must
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';

// Where a store keeps what no repository the engine reads carries: the logo and the font files. The page embeds both,
// so every person who builds needs them, and nobody's computer is where they should live.
export const SETUP_PATH = 'setup';

const read = (f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } };

// The Figma capture a page is built from. Only what the page actually reads: its variables (the tokens), its structure
// (each component's layers and box) and the values each variant draws.
export function figmaSnapshots(cfg) {
  return [
    cfg.paths?.snapshotVars ?? 'src/figma-vars.snapshot.json',
    cfg.paths?.snapshotStructure ?? 'src/figma-structure.snapshot.json',
  ];
}

// → the snapshot files that are not here. A file of nothing ({}) counts as not here: it is what a failed read leaves.
export function missingFigma(ROOT, cfg) {
  return figmaSnapshots(cfg).filter((p) => {
    const t = read(resolve(ROOT, p));
    if (t == null) return true;
    try { const j = JSON.parse(t); return !Object.keys(j).filter((k) => !k.startsWith('_')).length; } catch { return true; }
  });
}

// What the setup names for the page's own identity, and whether it is on disk. fonts: the folder, empty or absent.
export function missingBrandFiles(ROOT, cfg) {
  const logo = cfg.styleguide?.logo ? String(cfg.styleguide.logo) : null;
  const fontDir = cfg.paths?.fonts ?? 'fonts';
  const fontFiles = (() => { try { return readdirSync(resolve(ROOT, fontDir), { recursive: true }).filter((f) => /\.(woff2?|ttf|otf)$/i.test(String(f))); } catch { return []; } })();
  return {
    logo: logo && !existsSync(resolve(ROOT, logo)) ? logo : null,
    fonts: fontFiles.length ? null : fontDir,
  };
}

// The logo and the fonts taken from the store that keeps them (its setup/ folder), into where the setup names them.
// → { took: [paths written], why: a line when the store has nothing to give }
export async function takeBrandFiles(ROOT, cfg, want, { stores = null } = {}) {
  const st = stores ?? await import('./stores.mjs');
  const place = st.storesOf(cfg).styleguide?.read ?? st.storesOf(cfg).styleguide?.write ?? st.storesOf(cfg).snapshots?.read ?? null;
  if (!place?.gitlab) return { took: [], why: 'no store holds them' };
  const api = st.gitlabApi(ROOT, place);
  if (api?.error) return { took: [], why: api.error };
  const tree = [];
  for (let page = 1; page <= 10; page++) {
    const r = await api.get(`/repository/tree?path=${encodeURIComponent(SETUP_PATH)}&recursive=true&per_page=100&page=${page}`);
    if (!r.ok) return { took: [], why: `the store answered ${r.status} for ${SETUP_PATH}/` };
    const items = await r.json();
    for (const it of items ?? []) if (it.type === 'blob') tree.push(it.path);
    if (!items || items.length < 100) break;
  }
  const took = [];
  const grab = async (from, to) => {
    const r = await api.get(`/repository/files/${encodeURIComponent(from)}/raw`);
    if (!r.ok) return;
    mkdirSync(dirname(resolve(ROOT, to)), { recursive: true });
    writeFileSync(resolve(ROOT, to), Buffer.from(await r.arrayBuffer()));
    took.push(to);
  };
  if (want.logo) { const f = tree.find((p) => /\/logo\.svg$/i.test(p)); if (f) await grab(f, want.logo); }
  if (want.fonts) for (const f of tree.filter((p) => /\.(woff2?|ttf|otf)$/i.test(p))) await grab(f, join(want.fonts, basename(f)));
  return { took, why: took.length ? null : `${SETUP_PATH}/ holds no logo or fonts` };
}

// What every style guide build asks before it builds. → { lines, stop }
export async function inputsOnRun(ROOT, cfg, { offline = false, take = takeBrandFiles } = {}) {
  const lines = [];
  // The Figma capture. A setup that names a store for it says the capture exists: not having it is losing it, never
  // a system without Figma. One that names no store is a project built from its code, and its page says so honestly.
  const gone = missingFigma(ROOT, cfg);
  if (gone.length) {
    const { storesOf } = await import('./stores.mjs');
    const named = !!storesOf(cfg).snapshots?.read;
    if (named) {
      lines.push(`❌ The Figma capture is not here (${gone.join(', ')}), and this setup reads it from a store. Built without it, every component reads as one only the code has, the playground draws what nothing was compared against, and the parity figures are of nothing.`);
      lines.push('NEXT: tell the person the page was not built and why; the capture comes from the store on every run, so this is an access or a network answer - rms-design-system-engine --store says what GitLab allows.');
      return { lines, stop: true };
    }
    lines.push(`ℹ️  No Figma capture here (${gone.join(', ')}) and no store named for one: the page is built from the code alone, and says so.`);
  }
  // The logo and the fonts the page embeds. A page without them is plain, not untrue, so they are taken where a store
  // holds them and never stopped for. The store's setup/ folder is the only shared copy: nobody's computer is where
  // the team's logo and licensed font files should live.
  const want = missingBrandFiles(ROOT, cfg);
  if (want.logo || want.fonts) {
    if (offline) lines.push(`⚠️  ${[want.logo, want.fonts].filter(Boolean).join(' and ')} not here, and this run reads nothing over the network: the page is built without them.`);
    else {
      const r = await take(ROOT, cfg, want);
      if (r.took.length) lines.push(`🎨 Taken from the store for this page: ${r.took.length === 1 ? r.took[0] : `${r.took.length} files (${[want.logo && 'the logo', want.fonts && 'the fonts'].filter(Boolean).join(', ')})`}.`);
      // Only the logo is named as missing. Font files are not: the build looks for every family the page names in the
      // system's files and on the font services, and says which was found nowhere - a judgement no count of files in a
      // folder can make, and one that is wrong far more often than it is right.
      const left = missingBrandFiles(ROOT, cfg);
      if (left.logo) lines.push(`⚠️  The page is built without a logo (${left.logo}): ${r.why ?? 'the store has none'}. Put it in the store's ${SETUP_PATH}/ folder and every person who builds gets it.`);
    }
  }
  return { lines, stop: false };
}
