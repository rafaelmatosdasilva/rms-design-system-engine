// showroom-quality.mjs - the product's own screens (the Showroom: showroom/<Screen>.vue, built with the system) read as
// pages, by the same review a page in the project's code gets (page-quality.mjs): one main action in view, a
// destructive action never louder than the main one, a card inside a card, a heading level skipped, a label that is
// only a placeholder, several alerts on one page, sections all at one weight. Each finding with its line, and each
// screen a score out of 10. It reads the screens' code only; nothing is drawn and nothing is changed.
//
//   showroomQuality(ROOT, cfg) → [{ screen, file, score, findings: [{ kind, message, line }] }] (none: [])
//   showroomQualityLines(rows) → the report's lines
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

// A screen built with the system gets its headings from the system's own components: a header given a title
// (a page header given title="Orders") is the page's heading, though no <h1> is written. The first is read as
// the main heading, any after it as level 2, so the review does not find a page with no heading.
// And a card set to draw no surface of its own (surface="none", variant="plain") is laid out inside another card as
// any part is: it is no card inside a card.
const TITLED = /header|heading|title/i;
const NO_SURFACE = /^(none|plain|flat|ghost|transparent|bare)$/i;
export function titledHeadings(root) {
  let first = true;
  const visit = (n) => {
    if (n.name && /card|tile/i.test(n.name) && Object.entries(n.attrs ?? {}).some(([k, v]) => /style|appearance|surface|variant/i.test(k) && typeof v === 'string' && NO_SURFACE.test(v))) { n.tag = 'div'; n.name = null; }
    if (n.name && TITLED.test(n.name) && typeof n.attrs?.title === 'string' && n.attrs.title.trim() && !Object.keys(n.attrs).some((k) => /^(level|headingLevel|aria-level)$/i.test(k))) {
      n.attrs = { ...n.attrs, level: first ? '1' : '2' };
      first = false;
    }
    for (const c of n.children ?? []) visit(c);
  };
  visit(root);
  return root;
}

export async function showroomQuality(ROOT, cfg = {}, { system = null } = {}) {
  const dir = resolve(ROOT, cfg.paths?.showroom ?? 'showroom');
  let files = [];
  try { files = readdirSync(dir).filter((f) => /\.(vue|svelte|jsx|tsx|html)$/i.test(f)).sort(); } catch { return []; }
  if (!files.length) return [];
  const pc = await import('./page-check.mjs');
  const { habitReview, fromPageTree } = await import('./page-quality.mjs');
  const sys = system ?? await pc.pageSystem(ROOT, cfg);
  const templates = (sys.context?.templates ?? sys.templates ?? []).map((t) => t?.name ?? t);
  const out = [];
  for (const f of files) {
    const abs = join(dir, f), rel = relative(ROOT, abs);
    let text = ''; try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    let r; try { r = pc.checkPage(rel, text, { ...sys, ROOT }); } catch { continue; }
    if (!r?.tree) continue;
    const q = habitReview(titledHeadings(fromPageTree(r.tree, r.markup ?? '')), { templates });
    out.push({ screen: f.replace(/\.[^.]+$/, ''), file: rel, score: q.score, findings: q.findings.map((x) => ({ kind: x.kind, message: x.message, ...(x.line != null ? { line: x.line } : {}) })) });
  }
  return out;
}

export function showroomQualityLines(rows, { max = 4 } = {}) {
  const off = rows.filter((r) => r.findings.length);
  if (!rows.length) return [];
  const head = `🎨 Showroom screens as pages: ${off.length ? `${off.length} of ${rows.length} with something a page should not do` : `all ${rows.length} read as pages should`} (one main action, nothing destructive in front, no card in a card, headings in order). Advisory.`;
  const lines = [head];
  for (const r of off) {
    lines.push(`     ${r.screen} ${r.score}/10  (${r.file})`);
    for (const f of r.findings.slice(0, max)) lines.push(`       · ${f.line != null ? `line ${f.line}: ` : ''}${f.message}`);
    if (r.findings.length > max) lines.push(`       · … ${r.findings.length - max} more`);
  }
  return lines;
}
