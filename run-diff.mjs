// run-diff.mjs - what changed since the last run. The audit records the findings it printed; the
// next run lists the ones that are new, the ones that are gone, and the ones whose count or value
// moved, so a long report still says at a glance what this change did.
//
// A finding is a line the report printed in a failing or warning place:
//   • a failing gate's name, its lines that are not passes, and every ❌ or ⚠️ line under any gate;
//   • after the verdict, every listed item (indented, or a • bullet) under a ⚠️/❌/ℹ️ heading.
// Headers and counts vary with the numbers in them, so each finding is keyed by its section and its
// own text. Two findings whose text differs only in numbers are one finding that changed.
// Pure: the audit reads and writes the file.

const ANSI = /\x1b\[[0-9;]*m/g;
const GATE = /^(✅|❌|⚠️|⏭)\s+\[(\d+)\]\s+(.+?)(?:\s{2}\(.*)?$/;
const HEADING = /^(⚠️|ℹ️|❌|✅|📌|♿|🧭|🎨|🧩|🎯)\s+(?:\[[^\]]+\]\s+)?([^:]+?)(?::|$)/;
// A zero count on a fail line is not a finding: "❌ FAIL  0", "❌ MISSING  0 selectors", "❌ FAIL  0/140 (…)".
export const ZERO_FAIL = /^❌\s+[A-Z][A-Z ?]*?\s+0(\/\d+)?(\s|$)/;

export function collectFindings(lines) {
  const out = new Set();
  let phase = 'gates', section = null, sectionBad = false;
  for (const raw of lines) {
    for (const l0 of String(raw).replace(ANSI, '').split('\n')) {
      const line = l0.replace(/\s+$/, '');
      const t = line.trim();
      if (!t) continue;
      if (/^(PARITY  ·|GATE SUMMARY)/.test(t)) { phase = 'skip'; continue; }
      if (/^(AUDIT FAILED|ALL GATES PASS|EVERY GATE THAT RAN|NO REGRESSIONS)/.test(t)) { phase = 'advisory'; section = null; continue; }
      // The design's own debt (what the Figma file owes) is not a code finding: never tracked, never in the burndown.
      if (/^(AI-READINESS SCORECARD|📓|📐|♿ Accessibility in the Figma file)/.test(t)) { section = null; continue; }
      if (phase === 'gates') {
        const g = line.match(GATE);
        if (g) { section = g[3].trim(); sectionBad = g[1] === '❌'; if (sectionBad) out.add(`${section} :: gate fails`); continue; }
        if (!section || ZERO_FAIL.test(t) || /^─/.test(t)) continue;   // a divider inside a gate's output is no finding
        if (/^(❌|⚠️|✗)/.test(t) || (sectionBad && !/✓|^(✅|ℹ️|➡️)/.test(t))) out.add(`${section} :: ${t}`);
      } else if (phase === 'advisory') {
        if (/^─/.test(t)) { section = t.includes('Accessibility') ? 'Accessibility' : section; continue; }
        const h = !/^\s/.test(line) && line.match(HEADING);
        if (h) { section = h[2].replace(/\d+/g, '#').trim(); continue; }
        if (section && (/^\s{4,}\S/.test(line) || t.startsWith('•')) && !/^(Why it matters|What to do|Run with|Want the exact)/.test(t)) out.add(`${section} :: ${t}`);
      }
    }
  }
  return [...out];
}

const shape = (k) => k.replace(/-?\d+(\.\d+)?/g, '#');

export function diffFindings(prev, cur) {
  const p = new Set(prev), c = new Set(cur);
  let added = cur.filter((k) => !p.has(k));
  let gone = prev.filter((k) => !c.has(k));
  const changed = [];
  const goneByShape = new Map();
  for (const k of gone) { const s = shape(k); if (!goneByShape.has(s)) goneByShape.set(s, []); goneByShape.get(s).push(k); }
  added = added.filter((k) => {
    const same = goneByShape.get(shape(k));
    if (!same?.length) return true;
    changed.push({ from: same.shift(), to: k });
    return false;
  });
  const moved = new Set(changed.map((x) => x.from));
  gone = gone.filter((k) => !moved.has(k));
  return { added, gone, changed };
}

export function diffReport(d, { max = 15 } = {}) {
  const lines = [];
  const list = (icon, items, fmt) => {
    for (const x of items.slice(0, max)) lines.push(`     ${icon} ${fmt(x)}`);
    if (items.length > max) lines.push(`       … ${items.length - max} more`);
  };
  const tail = (k) => k.split(' :: ').slice(1).join(' :: ');
  const head = (k) => k.split(' :: ')[0];
  list('new     ', d.added, (k) => `${head(k)}: ${tail(k)}`);
  list('gone    ', d.gone, (k) => `${head(k)}: ${tail(k)}`);
  list('changed ', d.changed, (x) => `${head(x.to)}: ${tail(x.from)}  →  ${tail(x.to)}`);
  return lines;
}

// Burndown (idea I45): the open findings per component, most first, so a library is worked down one
// component at a time with --component. A finding belongs to the most specific component named in its
// text (buttonPrimary before button; "button-primary" and "radii/chip" count). A gate's own "gate fails"
// line is not a finding of any component. `prev` (the last run's findings for the same scope) gives the
// count each component had then.
const kebab = (x) => x.replace(/([a-z0-9])([A-Z])/g, '$1-$2');
const words = (name) => [name, kebab(name)].map((x) => x.toLowerCase());
export function componentOf(finding, names) {
  // The text as written, and with its PascalCase split, so HbIconButton.vue names iconButton.
  const texts = [String(finding).toLowerCase(), kebab(String(finding)).toLowerCase()];
  const hits = names.filter((n) => words(n).some((w) => { const re = new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`); return texts.some((t) => re.test(t)); }));
  const best = hits.reduce((a, n) => (!a || n.length > a.length ? n : a), null);
  // A line that names two components apart (button, badge) is no one component's.
  return best && hits.every((n) => best.toLowerCase().includes(n.toLowerCase())) ? best : null;
}
// Lines that are not a finding of anything: a count ("❌ FAIL  1", "⚠️  NEW SKIP  0"), the fix under a
// finding, a gate that printed no result line.
// A scoped run's note about the findings it left out ("… 2 finding(s) outside badge") names the scope, not a finding of it.
const NOT_A_FINDING = / :: ((❌|⚠️)\s+[A-Z][A-Z ?]*\s+\d|Fix:|⚠️\s+this gate printed no result line|… \d+ finding\(s\) outside )/;
// Work in the Figma file, not in the code the burndown works down.
const FIGMA_WORK = /^Figma file hygiene :: /;

export function burndown(findings, names, prev = null) {
  const count = (list) => {
    const by = new Map();
    let loose = 0;
    for (const f of list ?? []) {
      if (/ :: gate fails$/.test(f) || / :: (🔗|↳)/.test(f) || NOT_A_FINDING.test(f) || FIGMA_WORK.test(f)) continue;   // a gate's own verdict, a link, a note or a count
      const c = componentOf(f, names);
      if (c) by.set(c, (by.get(c) ?? 0) + 1); else loose++;
    }
    return { by, loose };
  };
  const now = count(findings), was = prev ? count(prev) : null;
  const rows = [...now.by].map(([name, open]) => ({ name, open, was: was ? (was.by.get(name) ?? 0) : null }))
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const done = was ? [...was.by.keys()].filter((n) => !now.by.has(n)).sort() : [];
  return { rows, loose: now.loose, done };
}

export function burndownLines(b, { top = 8, scoped = false } = {}) {
  if (!b.rows.length && !b.done.length) return [];
  const fmt = (r) => `${r.name} ${r.open}${r.was != null && r.was !== r.open ? ` (was ${r.was})` : ''}`;
  const lines = [`Burndown, open findings per component: ${b.rows.slice(0, top).map(fmt).join(' · ') || 'none'}${b.rows.length > top ? ` · ${b.rows.length - top} more` : ''}${b.loose ? ` · ${b.loose} not tied to a component` : ''}`];
  if (b.done.length) lines.push(`   cleared since the last run: ${b.done.join(', ')}`);
  if (b.rows.length && !scoped) {
    // A tie is said, with how it was broken, so whoever reads it does not have to pick.
    const tied = b.rows.slice(1).filter((r) => r.open === b.rows[0].open).map((r) => r.name);
    lines.push(`   next up: ${b.rows[0].name}${tied.length ? ` (tied with ${tied.join(', ')} at ${b.rows[0].open}; a tie goes in name order)` : ''}. Run with --component ${b.rows[0].name}, fix, run again.`);
  }
  return lines;
}

// ── The one list of differences between Figma and the code ──────────────────────────────────────────────────────
// Every finding of this run that is a difference between the two sides (not the freshness of the data, not an
// accessibility note), grouped by the component it names, else under "the whole system", each marked new when the
// last run did not have it. Written to <out>/differences.md and differences.json; the style guide reads the JSON, so
// a component's page lists its own open differences, and the hand-back files say how each side would change.
const NOT_A_DIFFERENCE = /^(Data is up to date|Accessibility[^:]*|Token contrast|What this audit actually checked|Exemption debt) :: /;
// A line that points at a difference rather than being one: a Figma link, who last changed it, what was skipped,
// how much was compared, the proposed patches. It stays in the audit, next to what it explains.
const POINTER = /^(↳|🔗|⏭|📋|coverage source:|least checked:)|not a difference from Figma|\bskipped\b/;
export function differences(findings = [], names = [], prev = null) {
  // A difference keeps its identity when only its line number moved (an edit higher up the same file).
  const same = (f) => String(f).replace(/(\.[\w]+):\d+\b/g, '$1');
  const old = new Set((prev ?? []).map(same));
  const items = findings.filter((f) => !NOT_A_FINDING.test(f) && !NOT_A_DIFFERENCE.test(f) && !/ :: gate fails$/.test(f)).map((f) => {
    const i = f.indexOf(' :: ');
    return { component: componentOf(f, names), check: i > 0 ? f.slice(0, i) : '', what: i > 0 ? f.slice(i + 4).replace(/^\s*(❌|⚠️|ℹ️)\s*/, '') : f, side: FIGMA_WORK.test(f) ? 'figma' : 'decide', new: prev ? !old.has(same(f)) : false };
  }).filter((it) => !POINTER.test(it.what.trim()));
  const groups = new Map();
  for (const it of items) { const k = it.component ?? ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  return { total: items.length, fresh: items.filter((x) => x.new).length, groups: [...groups].sort((a, b) => (a[0] === '') - (b[0] === '') || b[1].length - a[1].length).map(([component, list]) => ({ component: component || null, items: list })) };
}
export function differencesMarkdown(d, { at = '', handback = {} } = {}) {
  const out = ['# Differences between Figma and the code', '',
    `${d.total} open${d.fresh ? `, ${d.fresh} new since the last run` : ''}${at ? ` · ${at}` : ''}. Written by rms-design-system-engine on every full audit: the one list to work from. Each line says what differs and where; fix the side that is wrong, or accept a difference on purpose (\`--baseline --findings\`), and the next run takes it off.`];
  if (d.notChecked?.length) out.push('', `Not checked this run, so a difference there would not show: ${d.notChecked.map((n) => `${n.check} (${n.why})`).join('; ')}.`);
  if (handback.code || handback.figma) out.push('', `How each side would change: ${[handback.code && `the code, \`${handback.code}\` (apply only when you ask)`, handback.figma && `Figma, \`${handback.figma}\``].filter(Boolean).join('; ')}.`);
  for (const g of d.groups) {
    out.push('', `## ${g.component ?? 'The whole system'} (${g.items.length})`, '');
    for (const it of g.items) out.push(`- ${it.new ? '**new** ' : ''}${it.check ? `${it.check}: ` : ''}${it.what}${it.side === 'figma' ? ' _(in Figma)_' : ''}`);
  }
  return out.join('\n') + '\n';
}

// ── A difference in plain English, for people (the style guide) ───────────────────────────────────────────────────
// The audit's lines are written for the engine and an agent ("modal.fontSizeVar: contract=null  Figma=\"l\""). Each
// kind is said again as a sentence a designer or developer reads at once; a line no rule knows is kept as it is.
const FIELD = {
  h: 'height', w: 'width', fontSizeVar: 'text size', fontWeightVar: 'text weight', lineHeightVar: 'line height',
  fillStructure: 'fill', strokeOnDefault: 'border at rest', strokeOnAnyState: 'border', innerRadiusVar: 'inner corner radius',
  radiusVar: 'corner radius', gapVar: 'space between its items', paddingVar: 'padding', 'paddingVar.lr': 'padding on the left and right',
  'paddingVar.tb': 'padding on the top and bottom', minHeight: 'minimum height',
};
const unq = (v) => String(v ?? '').trim().replace(/^"(.*)"$/, '$1');
function plainValue(field, raw) {
  const v = unq(raw);
  if (v === 'null' || v === '') return 'none';
  if (/uncontracted/.test(v)) return null;   // the contract does not describe the part
  if (/no longer bound/.test(v)) return 'no token any more';
  if (field === 'fillStructure') return { none: 'no fill', direct: 'a fill on the component itself', before: 'a fill on a layer behind its content' }[v] ?? v;
  if (/^stroke/.test(field)) return v === 'true' ? 'a border' : v === 'false' ? 'no border' : v;
  if (/^(fontSize|fontWeight|lineHeight)Var$/.test(field)) return `the ${v} text style`;
  if (field === 'h' || field === 'w' || field === 'minHeight') return /^\d/.test(v) ? `${v}px` : v;
  if (/^\{/.test(v)) { try { const o = JSON.parse(v); return [o.tb && `${o.tb} on the top and bottom`, o.lr && `${o.lr} on the left and right`].filter(Boolean).join(' and ') || 'none'; } catch { return v; } }
  return v;
}
const WHERE = (s) => (s ? s.replace(/^\(|\)$/g, '').split(' · ').pop() : '');
export function plainDifference(what = '') {
  const s = String(what).trim();
  let m;
  // A contract field against Figma: "modal.children.header.gapVar: contract=… Figma=…"
  if ((m = /^([\w-]+)\.(.+?):\s*contract=(.+?)\s{1,}Figma=(.+)$/.exec(s))) {
    const [, comp, path, c, f] = m;
    const part = /^children\.(.+)\.([\w.]+)$/.exec(path);
    const field = part ? part[2] : path;
    const name0 = FIELD[field] ?? field.replace(/Var$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    const name = (part ? name0.replace(/ its items$/, ' the items') : name0) + (part ? ` in its ${part[1]} part` : '');
    const fv = plainValue(field, f), cv = plainValue(field, c);
    const has = field === 'fillStructure' || /^stroke/.test(field);   // "has no fill", "has a border"
    const say = (v) => (has ? `it has ${v}` : v === 'none' ? `no ${name} is set` : v === 'no token any more' ? `the ${name} no longer uses a token` : `the ${name} is ${v}`);
    if (cv === null) return `In Figma the ${name} is ${fv}; the code's contract (its written spec) does not describe that part yet.`;
    return `In Figma ${say(fv)}; the code's contract (its written spec) says ${say(cv)}.`;
  }
  // A measured value: "node font size: Figma m (11px), rendered 13px via --l-size  (.var-name · file:75)  → set …  [code moved, Figma is behind]"
  if ((m = /^([\w-]+) (.+?)(?: \(([^)]*=[^)]*)\))?: Figma (.+?), rendered (.+?)(?:\s+\(([^()]*(?:\([^()]*\))?[^()]*)\))?(?:\s+→\s+(.+?))?(?:\s+\[(.+?)\])?$/.exec(s))) {
    const [, , prop, combo, f, r, where, fix, lead] = m;
    const when = combo ? `When ${combo.replace(/=/g, ' is ').replace(/,\s*/g, ' and ')}, the` : 'The';
    let say;
    if (/^paints a background$/.test(f) || f === 'paints a background') say = 'Figma has a background; the code draws none.';
    else if (/^no background$/.test(f)) say = 'Figma has no background; the code draws one.';
    else if (/^border on /.test(f)) say = `Figma has a ${f.replace(/^border on /, 'border on the ')}; the code shows none.`;
    else {
      const sized = !/weight/i.test(prop);
      const px = (v) => (sized && /^\d+(\.\d+)?$/.test(v) ? `${v}px` : /^[a-z]{1,3} \(.+\)$/i.test(v) && /font|line/i.test(prop) ? v.replace(/^(\w+) \((.+)\)$/, 'the $1 text style ($2)') : v);
      const p2 = prop.replace(/\(left\/right\)/, 'on the left and right').replace(/\(top\/bottom\)/, 'on the top and bottom');
      say = `${when} ${p2} is ${px(f)} in Figma and ${px(r).replace(/ via (--[\w-]+)/, ' (from $1)')} in the code.`;
    }
    const file = WHERE(where);
    const leadSay = lead ? /code moved/.test(lead) ? ' The code changed last, so Figma should follow it.' : /Figma moved/.test(lead) ? ' Figma changed last, so the code should follow it.' : '' : '';
    // The fix itself is said once, as the action (plainAction), not here again.
    return `${say}${leadSay}`.replace(/\.\.(\s|$)/g, '.$1') + (file ? ` (${file})` : '');
  }
  // Something the products lay over the component: "node: .a, .b laid over it (file). The component may be missing …"
  if ((m = /^(?:[\w-]+|(a [\w\s]+? \([^)]+\))): (.+?) laid over it \((.+?)\)\. (.+)$/.exec(s))) return `In a product, ${m[2]} ${/,/.test(m[2]) ? 'are' : 'is'} placed on top of ${m[1] ?? 'it'} (${m[3]}). ${m[4]}`;
  // A stroke the code draws that Figma does not have.
  if ((m = /^[\w-]+: "([^"]+)" has `([^`]+)` - Figma has no stroke/.exec(s))) return `The code draws a border (${m[2]} on ${m[1]}); Figma has no border in any variant.`;
  // Contrast: "x [State=Hover · light]: 1.23:1 (needs 4.5:1)  #e8e8e8 (--a) on #ffffff (--b)  (file)"
  if ((m = /^[\w-]+ \[(.+?)\]: ([\d.]+):1 \(needs ([\d.]+):1\)\s+(#\w+) \((--[\w-]+)\) on (#\w+) \((--[\w-]+)\)/.exec(s))) {
    const state = m[1].split(' · ').map((x) => x.replace(/^State=/, '').replace(/^default$/, 'at rest')).join(', in ').replace(/, in (light|dark)$/, ', in $1 mode');
    return `${state[0].toUpperCase()}${state.slice(1)}, its text (${m[5]}) on its background (${m[7]}) has a contrast of ${m[2]} to 1; it needs ${m[3]} to 1 to be read easily.`;
  }
  // Token layering: "· overlay/color"
  if ((m = /^·\s+([\w/ -]+)$/.exec(s))) return `In Figma, ${m[1].trim()} holds a raw colour instead of pointing at another token, as most of the system's tokens do.`;
  return s;
}

// ── What to do about a difference, and who does it ────────────────────────────────────────────────────────────────
// → { who: 'figma' | 'code' | 'both', todo }. Figma leads unless the engine measured that the code changed last; a
// fix the audit names is said as it is, else the one way to make the two sides agree.
export function plainAction(what = '', component = '') {
  const s = String(what).trim();
  const name = component || (s.match(/^([\w-]+)/) ?? [])[1] || 'the component';
  let m;
  if ((m = /^([\w-]+)\.(.+?):\s*contract=(.+?)\s{1,}Figma=(.+)$/.exec(s))) {
    const f = unq(m[4]);
    if (/no longer bound/.test(f)) return { who: 'both', todo: `Decide which side is right: bind a token there again in Figma, or tell me to take it out of the code's contract (structure-contract.mjs).` };
    return { who: 'code', todo: `Update the code's contract (structure-contract.mjs) for ${name} to say what Figma says. Tell me to do it.` };
  }
  // A measured value: the property it names ("actionBar min height"), the fix said for that property.
  const measured = /^([\w-]+) (.+?)(?: \([^)]*=[^)]*\))?: Figma .+?, rendered /.exec(s);
  const what2 = measured ? `the ${measured[1]} ${measured[2].replace(/\(left\/right\)/, 'on the left and right').replace(/\(top\/bottom\)/, 'on the top and bottom')}` : name;
  const fixFor = (fix) => (/^(in Figma, )?set (it to )?/.test(fix) ? `set ${what2} to ${fix.replace(/^(in Figma, )?set (it to )?/, '')}` : fix);
  if ((m = /\[(code moved, Figma is behind|Figma moved, code is behind)\]/.exec(s))) {
    const fix = (/→\s+(.+?)\s+\[/.exec(s) ?? [])[1];
    if (/code moved/.test(m[1])) return { who: 'figma', todo: fix ? `In Figma, ${fixFor(fix)}.` : `In Figma, change ${what2} to match the code.` };
    return { who: 'code', todo: fix ? `In the code, ${fixFor(fix)}. Tell me to do it.` : `Make ${what2} in the code match Figma. Tell me to do it.` };
  }
  if (measured) {
    const fix = (/→\s+(.+?)(?:\s+\[|$)/.exec(s) ?? [])[1];
    return { who: 'code', todo: fix ? `In the code, ${fixFor(fix)}. Tell me to do it.` : `Make ${what2} in the code match Figma. Tell me to do it.` };
  }
  if (/ has `[^`]+` - Figma has no stroke/.test(s)) return { who: 'both', todo: `Decide: tell me to remove the border from the code, or add it to ${name} in Figma.` };
  if (/: [\d.]+:1 \(needs [\d.]+:1\)/.test(s)) return { who: 'both', todo: `Pick colours with more contrast for ${name}: change them in Figma, then tell me to update the code.` };
  if ((m = /^·\s+([\w/ -]+)$/.exec(s))) return { who: 'figma', todo: `In Figma, point ${m[1].trim()} at another token instead of a raw colour.` };
  if (/ laid over it /.test(s)) return { who: 'both', todo: `Decide: add a slot or prop for this action to ${name} in Figma (then tell me to build it), or tell me to leave it as the product's own.` };
  return { who: 'both', todo: 'Look at it in the differences file and tell me which side is right.' };
}
