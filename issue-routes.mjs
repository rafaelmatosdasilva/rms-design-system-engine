// issue-routes.mjs - which kind of fix an open issue gets, and who may make it.
//
// An issue the engine opened names a difference. Three kinds of fix close one, and the engine already builds all
// three; what was missing was the sentence saying which one this issue needs, so a person reading the tracker is not
// the one who has to work it out every time:
//
//   intent  what is written is wrong or missing: drafts in the intent layer, always for a person to approve.
//   code    a value the code can change to match Figma: a branch and a merge request, where the host lets the token.
//   figma   work in the design file: the hand-back, for a person. The engine never decides a design.
//   person  everything else, and everything it is not sure of. Saying "a person decides" is an answer.
//
// The route is read from what the check is, never from how bad the finding sounds. A check about documentation is a
// documentation fix whatever it found; a hygiene finding in the Figma file is Figma's whatever the code does. Where
// the engine cannot tell, it says a person decides rather than guessing - a wrong route costs more than no route,
// because somebody follows it.
//
// Nothing is carried out here. Each route names the command that makes that fix, and what the project lets the
// engine do there (writes.mjs), so the line a person reads is the same line whether or not they may run it.

// A check whose fix is words rather than values.
const INTENT = /^(Documentation|Intent layer|Guidance|What agents got wrong|Docs tell the truth)/i;
// A check whose fix is in the design file.
const FIGMA = /^(Figma file hygiene|Figma frame unchanged)/i;
// A check whose fix is a value the code carries, where Figma is the one that decides it.
const CODE = /^(Token values|Structure|Transitions|Motion|Shadows|Markup|All states are built|Nested components|Clean CSS|No invented|Component props|Sub-components|Templates compose|Required pieces|Icons|Renders correctly|Tokens used in screens|Every mode is covered)/i;

export const ROUTES = ['intent', 'code', 'figma', 'person'];
export const ROUTE = {
  intent: { said: 'written', how: 'drafts in the intent layer, for a person to approve', cmd: 'rms-design-system-engine --intent-changes', place: 'engine' },
  code: { said: 'the code', how: 'a branch and a merge request in the code project', cmd: 'rms-design-system-engine --component <name>', place: 'code' },
  figma: { said: 'the design file', how: 'the hand-back, for a person to apply in Figma', cmd: 'rms-design-system-engine --figma-edits', place: 'figma' },
  person: { said: 'a person', how: 'nobody but a person can say which side is right', cmd: null, place: null },
};

// Which fix a finding needs, and why that one. Read from the check it came from, never from its words.
// → { route, why }
export function routeFor(finding = {}) {
  const check = String(finding.check ?? '');
  if (finding.side === 'figma' || FIGMA.test(check)) return { route: 'figma', why: `${check || 'the finding'} is work in the design file` };
  if (INTENT.test(check)) return { route: 'intent', why: `${check} is about what is written, not what is built` };
  // A difference the code can close only where Figma is the side that decides: otherwise it is a decision.
  if (CODE.test(check) && finding.difference) return { route: 'code', why: `${check} is a value the code carries and Figma decides` };
  return { route: 'person', why: finding.difference ? `nothing says which side of ${check || 'this'} is right` : `${check || 'this'} is not a difference between the two sides` };
}

// Every open issue with the fix it needs. issues: what the tracker has, keyed (issues.mjs); findings: this run's.
// An issue whose difference no run finds any more is not routed: it is already being closed.
// → [{ key, iid, title, route, why, how, cmd, may }]
export function routePlan(issues = [], findings = [], { keyOf, writes = {} } = {}) {
  const byKey = new Map(findings.map((f) => [keyOf(f), f]));
  const out = [];
  for (const i of issues) {
    const f = byKey.get(i.key);
    if (!f) continue;
    const { route, why } = routeFor(f);
    const place = ROUTE[route].place;
    out.push({ key: i.key, iid: i.iid ?? null, title: i.title ?? f.evidence, component: f.component ?? null, route, why, how: ROUTE[route].how, cmd: ROUTE[route].cmd, may: place ? writes[place] ?? 'ask' : null });
  }
  return out;
}

// How many of each, so a tracker of two hundred reads as four numbers.
export const routeCounts = (plan = []) => Object.fromEntries(ROUTES.map((r) => [r, plan.filter((x) => x.route === r).length]).filter(([, n]) => n));

// What a person reads: each kind together, with the one command that makes it and what the project allows there.
export function routeLines(plan = [], { most = 6 } = {}) {
  if (!plan.length) return [];
  const out = [`🛠  ${plan.length} open issue${plan.length === 1 ? '' : 's'}, by the fix each one needs:`];
  for (const r of ROUTES) {
    const mine = plan.filter((x) => x.route === r);
    if (!mine.length) continue;
    const may = mine[0].may;
    const gate = r === 'person' ? '' : may === 'yes' ? ' (this project lets the engine make it)' : may === 'no' ? ' (this project does not let the engine write there: a task for whoever owns it)' : ' (the engine shows the change and waits for a yes)';
    out.push(`  ${mine.length} for ${ROUTE[r].said}: ${ROUTE[r].how}${ROUTE[r].cmd ? ` — ${ROUTE[r].cmd}` : ''}${gate}`);
    for (const x of mine.slice(0, most)) out.push(`     ${x.iid ? `#${x.iid} ` : ''}${x.title}`);
    if (mine.length > most) out.push(`     …and ${mine.length - most} more`);
  }
  return out;
}
