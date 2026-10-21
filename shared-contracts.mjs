// shared-contracts.mjs - the component contracts a team keeps in its intent layer repository (published there with
// --contracts-out, through a merge request), as the intent-layer sync read them: where each one is, and whether it still
// says what the code and Figma say today.
//
//   contractSummaries(files, urlOf) → [{ name, names, file, url, format, codeFile, props, events, slots, figma }]
//       files: Map(path → parsed JSON) from the layer's archive; only *.contract.json files with a name are read.
//       urlOf(path): the link to that file on GitLab.
//       format: 1 for the engine's contract format, 'older' for any other shape (read for its link and names only).
//   sharedContractFor(contracts, name, codeFile) → the summary for one component (by its name, a name it is also drawn
//       as, or its code file), or null
//   contractDrift(summary, now) → [what differs], [] when it agrees. now: { codeProps, events, slots, figmaProps }, each a
//       list of names, or null when that side was not read (then it is not compared).
const names = (list) => [...new Set((list ?? []).map((x) => (typeof x === 'string' ? x : x?.name)).filter(Boolean))];
const strip = (k) => String(k).split('#')[0].trim();

function summaryOf(path, c, url) {
  if (c?.schemaVersion === 1) {
    const figma = (c.props ?? []).filter((p) => p?.bindings?.figma);
    return {
      name: c.name, names: [c.name, ...names(c.source?.figma?.alsoDrawnAs)], file: path, url, format: 1,
      codeFile: c.source?.code?.file ?? null,
      props: names([...figma.map((p) => (p.bindings.code?.prop && !p.bindings.code.key ? p.bindings.code.prop : null)), ...names(c.codeOnly)]),
      events: names(c.events), slots: names(c.codeSlots), figma: names(figma),
    };
  }
  // Another shape: a name and its code file are enough for its link; what it lists is read where it says it.
  return {
    name: c.name, names: names([c.name, ...(c.names ?? [])]), file: path, url, format: 'older',
    codeFile: c.vueSource ?? c.source?.code?.file ?? null,
    props: names(c.props), events: names(c.emits ?? c.events), slots: names(c.slots),
    figma: names((c.figma ?? []).flatMap((f) => f?.properties ?? [])),
  };
}

export function contractSummaries(files, urlOf = () => null) {
  const out = [];
  for (const [path, c] of files ?? []) {
    if (!/\.contract\.json$/i.test(path) || !c || typeof c !== 'object' || typeof c.name !== 'string') continue;
    out.push(summaryOf(path, c, urlOf(path)));
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

export function sharedContractFor(contracts, name, codeFile = null) {
  const list = contracts ?? [];
  const file = codeFile ? String(codeFile).replace(/\\/g, '/') : null;
  return list.find((c) => c.name === name) ?? list.find((c) => (c.names ?? []).includes(name))
    ?? (file ? list.find((c) => c.codeFile && (file === c.codeFile || file.endsWith('/' + c.codeFile))) : null) ?? null;
}

export function contractDrift(summary, { codeProps = null, events = null, slots = null, figmaProps = null } = {}) {
  if (!summary) return [];
  if (summary.format !== 1) return ['it is in an older format, without the engine\'s pairing of Figma and the code'];
  const out = [];
  const compare = (now, listed, has, listsGone) => {
    if (!Array.isArray(now)) return;
    const n = names(now.map(strip)), l = new Set(listed);
    const added = n.filter((x) => !l.has(x)), gone = [...l].filter((x) => !n.includes(x));
    if (added.length) out.push(`${has} it does not list: ${added.join(', ')}`);
    if (gone.length) out.push(`${listsGone}: ${gone.join(', ')}`);
  };
  compare(codeProps, summary.props, 'the code has props', 'it lists props the code no longer has');
  compare(events, summary.events, 'the code has events', 'it lists events the code no longer has');
  compare(slots, summary.slots, 'the code has slots', 'it lists slots the code no longer has');
  compare(figmaProps, summary.figma, 'Figma has properties', 'it lists Figma properties Figma no longer has');
  return out;
}
