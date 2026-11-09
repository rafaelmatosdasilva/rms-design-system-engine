// styleguide-machine.mjs - the style guide written for machines too, beside the page written for people.
//
// Everything the page shows is already built from the contracts, the intent layer and the audit, and it all reaches
// the page as one object (sg-data, styleguide-files.mjs). An agent handed the page's address gets none of it: a few
// megabytes of HTML whose content lives in a JavaScript file beside it. The engine writes a machine index of its own
// (contract-gen.mjs buildLlms), but local, beside the contracts, where only somebody who can run the engine reaches
// it - and when its catalog does not fit, it tells the reader to ask `--query`, which is the one thing an agent with
// only a URL cannot do. So the same build writes the page's own twin in text, next to it, from that same object:
// an index with a line per component, and one file per component holding what its page holds. Written by the build,
// never by hand, so it cannot drift from the page beside it - which is the whole argument for having it at all.
//
// Nothing here invents: a field the data does not hold is a line that is not written. Pure: no I/O (styleguide-files.mjs
// writes what this returns, and removes what an earlier build wrote that this one does not).
//
//   MACHINE_INDEX              → 'llms.txt', the index's name beside the page
//   MACHINE_DIR                → 'c', the folder the components' files go in
//   isMachineFile(rel)         → whether a file beside the page is one of these
//   componentSlug(name)        → its file's name, the page's own anchor for it (c-<slug> there)
//   machineIndex(data)         → the index's text
//   componentPage(c, data)     → one component's text
//   machineFiles(data)         → Map(rel → text): the index and every component, what a build writes

export const MACHINE_INDEX = 'llms.txt';
export const MACHINE_DIR = 'c';
const MACHINE_FILE = /^c\/[\w+.-]+\.md$/;
export const isMachineFile = (rel) => String(rel) === MACHINE_INDEX || MACHINE_FILE.test(String(rel));

// The page names each component's own section c-<slug> (styleguide-files.mjs BOOT_PARTS); its file is named the same,
// so a reader who has one address has the other.
export const componentSlug = (name) => String(name ?? '').replace(/[^\w-]+/g, '-');
const fileOf = (name) => `${MACHINE_DIR}/${componentSlug(name)}.md`;

// One line of text out of whatever the data holds: never a newline, never twice the spaces, never a stray pipe inside
// a table cell.
const one = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();
const cell = (x) => one(x).replace(/\|/g, '\\|');
// A value only where it is one a reader can write: a default the page holds as a list or a record (a chart's bars) is
// shown by the page's own control, and as words it would read as an object.
const plain = (x) => (x === null || x === undefined || typeof x === 'object' ? '' : cell(x));
const list = (x) => (Array.isArray(x) ? x.map(one).filter(Boolean) : []);
// A heading and its lines, left out whole when there is nothing under it.
const part = (heading, lines) => (lines.filter(Boolean).length ? ['', `## ${heading}`, '', ...lines.filter(Boolean)] : []);

// Where the page came from, so a reader can tell a current twin from one built from older inputs (stamp.mjs writes it
// into the page's head and sg-data keeps it).
function fromLine(data) {
  const b = data.built ?? {};
  const bits = [b.code && `code ${one(b.code).slice(0, 10)}`, b.figma && `Figma ${one(b.figma)}`, b.engine && `engine ${one(b.engine).slice(0, 10)}`, (b.at || data.builtAt) && `built ${one(b.at || data.builtAt)}`];
  return bits.filter(Boolean).join(', ');
}

// A component that is only ever placed inside another (a part) is not a component to choose: the index lists it under
// its root, as the contracts' index does.
const partsOf = (data, name) => (data.components ?? []).filter((x) => x && x.partOf && (x.partOf.root ?? x.partOf) === name).map((x) => x.name);

// The props an agent must write exactly: the code's own API where the page has it, else the controls the page offers.
function propsOf(c) {
  const api = list((c.api?.props ?? []).map((p) => (p && typeof p === 'object' ? p.name : p)));
  if (api.length) return api;
  return list((c.controls ?? []).map((x) => x && (x.prop || x.label)));
}

// The index: what the system holds, a line each, every line pointing at the file that holds the rest.
export function machineIndex(data = {}) {
  const comps = (data.components ?? []).filter((c) => c && c.name);
  const whole = comps.filter((c) => !c.partOf);
  const from = fromLine(data);
  const tokenFamilies = Object.keys(data.tokens ?? {}).filter((k) => !k.startsWith('$'));
  const lines = [`# ${one(data.title) || 'Design system'} - machine-readable index`, '',
    `> Written by rms-design-system-engine from the same data as the style guide beside it (index.html), on every build.`
    + ` ${whole.length} components, ${(data.allVars ?? []).length} variables.${from ? ` From ${from}.` : ''}`, '',
    // A list of what exists leaves an agent free to build its own; one sentence saying the system is installed is what
    // moves it onto the system (the same sentence the contracts' index carries, for the same reason).
    '**Use these components.** This design system is part of this project: build nothing by hand that a component below'
    + ' already covers, and write every component, prop, value and token name exactly as it is written here.', '',
    `Each component has its own file with its props, its tokens, its accessibility and where its design and code differ: read \`./${MACHINE_DIR}/<name>.md\`. Nothing here is written by hand.`,
    '', '## Components', ''];
  for (const c of whole) {
    const props = propsOf(c);
    const inside = partsOf(data, c.name);
    lines.push(`- [${c.name}](./${fileOf(c.name)})${c.description ? ` - ${one(c.description)}` : ''}${props.length ? ` · props: ${props.join(', ')}` : ''}`);
    const avoid = list(c.intentLayer?.whenNotToUse)[0];
    if (avoid) lines.push(`    - avoid: ${avoid}`);
    if (inside.length) lines.push(`    - parts (placed only inside it, never on their own): ${inside.join(', ')}`);
    if (list(c.uses).length) lines.push(`    - composes: ${list(c.uses).join(', ')}`);
    const differ = c.parity?.counts?.differ ?? (c.differences ?? []).length;
    if (differ) lines.push(`    - the design and the code differ in ${differ} place${differ === 1 ? '' : 's'}: see its file`);
  }
  return [...lines,
    ...part('Tokens', [tokenFamilies.length ? `- families: ${tokenFamilies.join(', ')}` : '',
      (data.usedTokens ?? []).length ? `- ${(data.usedTokens ?? []).length} of ${(data.allVars ?? []).length} variables are used in the code.` : '',
      (data.icons ?? []).length ? `- ${(data.icons ?? []).length} icons.` : '']),
    ...part('Accessibility', [Object.keys(data.wcag21?.criteria ?? {}).length ? `- ${Object.keys(data.wcag21.criteria).length} WCAG 2.1 criteria are checked on every build.` : '']),
    ...part('Decided against', ruledOutLines(data.decisions, null)),
    ''].join('\n');
}

// The tokens a component holds: the page's own list where it has one (a property and the variable it reads), else the
// variables the sweep found on it, which is what most components have.
function tokenLines(c) {
  const own = (c.tokens ?? []).filter((t) => t && t.var);
  if (own.length) return own.map((t) => `- ${one(t.prop)}: ${one(t.var)}`);
  return (c.allTokens ?? []).filter((t) => t && t.var).map((t) => `- ${one(t.var)}${list(t.props).length ? ` (${list(t.props).join(', ')})` : ''}`);
}

// The values an option takes, as the page's own controls hold them ({ label }, realizedControls in styleguide-data.mjs;
// an older page kept them as plain words). The label is what a person picks and what the code is written with.
const optionsOf = (ctl) => (ctl?.options ?? []).map((o) => one(o && typeof o === 'object' ? o.label : o)).filter(Boolean).join(', ');

// An accessibility note the page shows (a11y-check.mjs keeps it as { text, uses, sc, kind }, and an older page as a
// plain string): its words, with the success criterion it is about where it names one.
function noteLines(notes) {
  return (notes ?? []).map((n) => (typeof n === 'string' ? one(n) : `${one(n?.text)}${n?.sc ? ` (WCAG ${one(n.sc)})` : ''}`)).filter(Boolean).map((l) => `- ${l}`);
}

// What the team looked at and turned down (decisions.mjs: { component, what, ruledOut: [string], why }). Only the
// decisions that rule an option out are worth an agent's reading: one that does not is history, and one that does
// stops the same option being proposed again. for: a component's name, or null for the system's own.
function ruledOutLines(decisions, forComponent) {
  return (decisions ?? [])
    .filter((d) => d && list(d.ruledOut).length && (forComponent ? d.component === forComponent : !d.component))
    .map((d) => `- ${list(d.ruledOut).join(', ')} - turned down${d.what ? `, ${one(d.what)}` : ''}${d.why ? `: ${one(d.why)}` : ''}`);
}

// How much of a component was compared, written only when something was: four zeroes say nothing and a component with
// no comparison at all should not carry a heading about one.
function countsLine(counts) {
  if (!counts || !Object.values(counts).some((n) => Number(n) > 0)) return '';
  return `${counts.agree ?? 0} agree, ${counts.differ ?? 0} differ, ${counts.notBuilt ?? 0} not built, ${counts.notCompared ?? 0} not compared.`;
}

// One component, in the order a reader needs it: what it is, how to write it, what it takes, then what is known about it.
export function componentPage(c = {}, data = {}) {
  const from = fromLine(data);
  const il = c.intentLayer ?? {};
  const props = (c.api?.props ?? []).filter((p) => p && typeof p === 'object' && p.name);
  const controls = (c.controls ?? []).filter((x) => x && (x.prop || x.label));
  const propRows = props.length
    ? ['| prop | type | default | values |', '|---|---|---|---|',
      ...props.map((p) => { const ctl = controls.find((x) => x.prop === p.name) ?? {}; return `| ${cell(p.name)} | ${cell(p.type)} | ${plain(ctl.default)} | ${cell(optionsOf(ctl))} |`; })]
    : (controls.length ? ['| option | type | default |', '|---|---|---|', ...controls.map((x) => `| ${cell(x.prop || x.label)} | ${cell(x.type)} | ${plain(x.default)} |`)] : []);
  const diffs = (c.differences ?? []).filter((d) => d && (d.plain || d.what));
  const finds = (c.a11yFindings ?? []).filter((f) => f && (f.plain || f.what));
  const inside = partsOf(data, c.name);
  return [`# ${c.name}`, '',
    c.description ? one(c.description) : '',
    '', `> Written by rms-design-system-engine from the style guide's own data, on every build${from ? ` (${from})` : ''}. Never edit this file: the next build writes it again. The page for people is \`../index.html#c-${componentSlug(c.name)}\`.`,
    ...part('Write it like this', [c.import?.line ? '```' : '', c.import?.line ? one(c.import.line) : '', c.api?.syntax ? one(c.api.syntax) : '', c.import?.line ? '```' : '',
      c.api?.tag ? `Its tag is \`${one(c.api.tag)}\`.` : '', c.api?.file ? `Its code is \`${one(c.api.file)}\`.` : '']),
    ...part('What it takes', propRows),
    ...part('Events', list(c.api?.events).map((e) => `- ${e}`)),
    ...part('Slots', list(c.api?.slots ?? c.slots).map((s) => `- ${s}`)),
    ...part('What it is for', [il.purpose ? one(il.purpose) : '']),
    ...part('When to use it', list(il.whenToUse).map((x) => `- ${x}`)),
    ...part('When not to use it', list(il.whenNotToUse).map((x) => `- ${x}`)),
    ...part('Rules', list(il.rules).map((x) => `- ${x}`)),
    ...part('Mistakes made with it', list(il.mistakes).map((x) => `- ${x}`)),
    ...part('What it cannot do', list(il.limitations).map((x) => `- ${x}`)),
    ...part('Its parts', inside.length ? [`Placed only inside it, never on their own: ${inside.join(', ')}.`] : []),
    ...part('What it is used in', list(c.uses).map((x) => `- ${x}`)),
    ...part('The tokens it uses', tokenLines(c)),
    ...part('Accessibility', [c.a11y?.role ? `Its role is \`${one(c.a11y.role)}\`${c.a11y.roleFrom ? ` (${one(c.a11y.roleFrom)})` : ''}.` : '',
      list(c.a11y?.expects).length ? `It expects: ${list(c.a11y.expects).join(', ')}.` : '',
      ...noteLines(c.a11y?.notes),
      ...finds.map((f) => `- ${one(f.plain || f.what)}${f.wcag ? ` (WCAG ${one(f.wcag)})` : ''}${f.todo ? ` To fix: ${one(f.todo)}` : ''}`)]),
    ...part('Where the design and the code differ', [countsLine(c.parity?.counts),
      ...diffs.map((d) => `- ${one(d.plain || d.what)}${d.todo ? ` To fix: ${one(d.todo)}` : ''}`)]),
    ...part('Decided against', ruledOutLines(data.decisions, c.name)),
    ...part('Where it came from', [...(c.links ?? []).filter((l) => l && l.url).map((l) => `- [${one(l.label) || one(l.url)}](${one(l.url)})`),
      ...(c.changelog ?? []).slice(0, 5).filter((x) => x && x.subject).map((x) => `- ${one(x.date)} ${one(x.subject)}${x.by ? ` (${one(x.by)})` : ''}`)]),
    ''].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}

// The whole twin: the index and one file per component, in the page's own order.
export function machineFiles(data = {}) {
  const files = new Map();
  if (!(data.components ?? []).some((c) => c && c.name)) return files;   // no components, nothing to say
  files.set(MACHINE_INDEX, machineIndex(data));
  for (const c of data.components) if (c && c.name) files.set(fileOf(c.name), componentPage(c, data));
  return files;
}
