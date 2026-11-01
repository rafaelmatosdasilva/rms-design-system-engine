// handoff.mjs - what a developer needs to build a prototype, on one page.
//
// A prototype is handed over by sending someone the file. They then read it to work out which components it uses,
// which of those are the system's and which were made up, where each one lives in the code, and what is still
// unresolved in it. Every one of those answers already exists by the time the page has been checked; nothing
// collected them.
//
// This collects them. It measures nothing new and decides nothing: a package that disagreed with the check would be
// worse than no package, so every number in it comes from the check that produced it.
//
//   handoffPackage({ … }) → the facts, for a file
//   handoffLines(pkg)     → the page a person reads
//
// Pure: no I/O. The command writes it.

const byUse = (a, b) => b.times - a.times || a.name.localeCompare(b.name);

// name, file, syntax: the prototype. used: { component: times } (page-check). gaps: what the system lacked.
// findings: the check's own. page: the system as the check read it. request: what was asked for, when it is known.
// links: where this page goes next ({ to, label }), for a flow of several.
export function handoffPackage({ name, file, syntax = null, used = {}, gaps = [], findings = [], page = { components: {} }, request = null, links = [], at = new Date().toISOString() } = {}) {
  const components = Object.entries(used).map(([n, times]) => {
    const c = page.components?.[n] ?? {};
    return {
      name: n, times,
      tag: c.tag ?? null,
      // Where it lives. A component the check knows but cannot place in the code is said as such rather than left
      // blank: "we could not find it" and "it has no file" are different things to whoever picks this up.
      file: c.file ?? null,
      props: Object.keys(c.props ?? {}).sort(),
    };
  }).sort(byUse);
  const open = findings.filter((f) => f.level === 'error');
  const advisory = findings.filter((f) => f.level && f.level !== 'error');
  return {
    name, file, syntax, request, at,
    components,
    // What the page needed that the system does not have. These are the reason a prototype is worth handing over at
    // all: they are the design system's work, not the page's.
    gaps: gaps.map((g) => ({ need: g.need ?? null, closest: g.closest ?? null, why: g.why ?? null })),
    open: open.map((f) => ({ line: f.line ?? null, message: f.message, kind: f.kind ?? null })),
    advisory: advisory.map((f) => ({ line: f.line ?? null, message: f.message, kind: f.kind ?? null })),
    links: links.map((l) => ({ to: l.to, label: l.label ?? null })),
    ready: open.length === 0,
  };
}

const bullet = (s) => `- ${s}`;

// The package as a page. Written for whoever builds it, so it opens with what it is made of rather than with what is
// wrong: a list of problems first reads as a page not worth building.
export function handoffLines(pkg) {
  const out = [`# ${pkg.name}`, ''];
  if (pkg.request) out.push(`**Asked for.** ${pkg.request}`, '');
  out.push(`**Built from** \`${pkg.file}\`${pkg.syntax ? ` (${pkg.syntax})` : ''}. ${pkg.ready ? 'Nothing is unresolved in it.' : `${pkg.open.length} thing${pkg.open.length === 1 ? '' : 's'} still unresolved, below.`}`, '');

  out.push('## What it is made of', '');
  if (!pkg.components.length) out.push('Nothing of the design system: every part of this page was written by hand, which is itself the finding.', '');
  else {
    out.push('| Component | Used | Written as | Its file |', '|---|---|---|---|');
    for (const c of pkg.components) out.push(`| ${c.name} | ${c.times}× | ${c.tag ? `\`<${c.tag}>\`` : '—'} | ${c.file ? `\`${c.file}\`` : '*not found in the code*'} |`);
    out.push('');
  }

  if (pkg.gaps.length) {
    out.push('## What the system does not have', '', 'These are the design system\'s work, not the page\'s. A prototype is worth handing over mostly for these.', '');
    for (const g of pkg.gaps) out.push(bullet(`**${g.need ?? 'a part'}**${g.closest ? ` — nearest in the system: ${g.closest}` : ''}${g.why ? `. ${g.why}` : ''}`));
    out.push('');
  }

  if (pkg.open.length) {
    out.push('## Still unresolved', '', 'Each of these fails the check. They are the page\'s own, and they are what to fix first.', '');
    for (const f of pkg.open) out.push(bullet(`${f.line ? `line ${f.line}: ` : ''}${f.message}`));
    out.push('');
  }
  if (pkg.advisory.length) {
    out.push('## Worth a look', '');
    for (const f of pkg.advisory) out.push(bullet(`${f.line ? `line ${f.line}: ` : ''}${f.message}`));
    out.push('');
  }
  if (pkg.links.length) {
    out.push('## Where it goes', '');
    for (const l of pkg.links) out.push(bullet(`${l.label ? `"${l.label}" → ` : ''}${l.to}`));
    out.push('');
  }
  out.push(`*Everything here comes from the page check of ${pkg.at.slice(0, 10)}; nothing was measured again for it.*`);
  return out;
}
