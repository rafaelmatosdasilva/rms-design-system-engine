// destructive.mjs - what a destructive action owes, by how much damage it does.
//
// An action that can be undone runs at once and offers undo. One that can be undone only for a while says how long.
// One that is permanent asks first, with the safe option selected. Without the kind written down, an agent builds a
// one-click delete for something nobody can get back, or a confirmation in front of something that undoes itself.
//
// The team writes each kind in its intent layer, on any page (a component's, a pattern's): a section titled
// "Destructive actions" (or "Deleting", "Irreversible actions"), one line an action, or any line that names a
// destructive action and says whether it can be undone ("Deleting a project is permanent", "Archiving can be undone for
// 30 days"). The page review then checks a built page against it.
//
//   destructiveKinds(entities)                → [{ action, verb, object, kind, within, page, line }]
//   destructiveFindings(root, kinds, { markup, script }) → [{ kind, message, line | path }]
//   destructiveLines(kinds)                   → llms.txt's lines

const VERB = /\b(delet\w*|remov\w*|discard\w*|eras\w*|destroy\w*|archiv\w*|revok\w*|cancel\w*|clear\w*|reset\w*|purg\w*|wip\w*|leav\w*|unpublish\w*|disconnect\w*|deactivat\w*|terminat\w*|overwrit\w*)\b/i;
const PERMANENT = /\b(permanent\w*|irreversibl\w*|cannot be (undone|recovered|restored)|can'?t be (undone|recovered|restored)|no way back|for good|forever|not recoverable|unrecoverable)\b/i;
const TIMED = /\b(?:undone|restored|recovered|undo\w*|restor\w*|recover\w*)\b[^.]*?\b(?:for|within|during|up to)\s+((?:\d+|one|two|three|seven|ten|thirty)\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?))/i;
const UNDOABLE = /\b(can be undone|undoable|offers? undo|with (an )?undo|reversibl\w*|can be restored|can be recovered|is restorable)\b/i;
const SECTION = /destructive|delet|irreversible|undo/i;

const stem = (w) => String(w ?? '').toLowerCase().replace(/(ing|ion|ed|es|e|s)$/, '');

// One line read as a kind, or null when it names no destructive action or says nothing of undoing it.
export function kindOf(line) {
  const t = String(line ?? '').replace(/\s+/g, ' ').trim();
  const v = VERB.exec(t);
  if (!v) return null;
  const timed = TIMED.exec(t);
  const kind = PERMANENT.test(t) && !timed ? 'permanent' : timed ? 'timed' : UNDOABLE.test(t) ? 'undoable' : null;
  if (!kind) return null;
  // What it acts on: the words after the verb, up to the first verb of being or punctuation ("a project", "members").
  const object = t.slice(v.index + v[0].length).replace(/^[\s:,-]+/, '').split(/\s+(?:is|are|can|cannot|can't|runs?|should|must|will|has|have)\b|[:,.;(]/i)[0].replace(/^(an?|the|your|their|its)\s+/i, '').trim().split(/\s+/).slice(0, 3).join(' ');
  return { verb: v[0].toLowerCase(), object: object.toLowerCase(), kind, within: timed ? timed[1] : null };
}

// Every destructive action a team's intent layer says the kind of, page by page. entities: the layer's entities
// ({ name, rules, mistakes, whenToUse, whenNotToUse, limitations, sections }).
export function destructiveKinds(entities = []) {
  const out = [];
  for (const e of entities) {
    const lines = [];
    for (const k of ['rules', 'whenToUse', 'whenNotToUse', 'mistakes', 'limitations']) for (const x of e[k] ?? []) lines.push(String(x?.text ?? x));
    for (const s of e.sections ?? []) if (SECTION.test(String(s.title ?? ''))) lines.push(...String(s.text ?? '').split('\n').map((l) => `${l.replace(/^\s*[-*]\s+/, '')}`));
    for (const line of lines) {
      const k = kindOf(line);
      if (k) out.push({ ...k, action: `${k.verb}${k.object ? ` ${k.object}` : ''}`, page: e.name, line: line.trim() });
    }
  }
  const seen = new Set();
  return out.filter((k) => { const key = `${stem(k.verb)}|${k.object}`; return !seen.has(key) && seen.add(key); });
}

// What each kind owes, in one sentence.
export const OWES = {
  undoable: 'runs at once and offers undo, with no confirmation in front of it',
  timed: 'runs at once, offers undo, and says how long it can be undone',
  permanent: 'asks first, with the safe option selected',
};

const OVERLAY = /dialog|modal|confirm|alert-?dialog|sheet|drawer|popconfirm/i;
const textOf = (n) => [n.text, ...Object.values(n.attrs ?? {}).filter((v) => typeof v === 'string')].filter(Boolean).join(' ');
function flat(root) {
  const out = [];
  const go = (n, parents) => { for (const c of n.children ?? []) { out.push({ n: c, parents }); go(c, [...parents, c]); } };
  go(root, []);
  return out;
}
const where = (n) => (n.line != null ? { line: n.line } : n.path != null ? { path: n.path } : {});
const isButton = (n) => (n.tag && /^(button|a)$/i.test(n.tag)) || /button|btn|action|menu-?item/i.test(n.name ?? '') || n.attrs?.role === 'button';

// The page against the kinds: each button whose words are a destructive action the layer names (its verb, and its
// object when the button says one). root: page-quality.mjs's tree. markup, script: the page's own source.
export function destructiveFindings(root, kinds = [], { markup = '', script = '' } = {}) {
  if (!kinds.length) return [];
  const all = flat(root);
  const source = `${markup}\n${script}`;
  const asks = /\bconfirm\s*\(|window\.confirm|are you sure|confirm(ation)?-?(dialog|modal)|ConfirmDialog|AlertDialog/i.test(source) || all.some(({ n }) => OVERLAY.test(n.name ?? '') || /^dialog$/i.test(n.tag ?? ''));
  const undo = /\bundo\b/i.test(source);
  const out = [];
  const said = new Set();
  for (const { n, parents } of all) {
    if (!isButton(n)) continue;
    const words = textOf(n).toLowerCase();
    const v = VERB.exec(words);
    if (!v) continue;
    const k = kinds.find((x) => stem(x.verb) === stem(v[0]) && (!x.object || words.includes(x.object.split(' ').pop().replace(/s$/, '')) || !/\s/.test(words.trim())));
    if (!k || said.has(k.action)) continue;
    said.add(k.action);
    const inConfirm = parents.some((p) => OVERLAY.test(p.name ?? '') || /^dialog$/i.test(p.tag ?? ''));
    const label = `"${(n.text ?? v[0]).slice(0, 40)}"`;
    const from = `(${k.page} says ${k.action} is ${k.kind === 'timed' ? `undoable for ${k.within}` : k.kind})`;
    if (k.kind === 'permanent') {
      if (!asks) out.push({ kind: 'destructive-kind', message: `${label} cannot be undone ${from}, and the page runs it with no confirmation: ask first, with the safe option selected`, ...where(n) });
      else if (inConfirm && Object.keys(n.attrs ?? {}).some((a) => /^(autofocus|autoFocus|initialFocus|default)$/.test(a))) out.push({ kind: 'destructive-kind', message: `${label} cannot be undone ${from}, and its confirmation selects it first: select the safe option (Cancel) instead`, ...where(n) });
    } else {
      if (inConfirm) out.push({ kind: 'destructive-kind', message: `${label} can be undone ${from}, and the page asks for a confirmation first: run it at once and offer undo`, ...where(n) });
      else if (!undo) out.push({ kind: 'destructive-kind', message: `${label} can be undone ${from}, and the page offers no undo: offer it as soon as the action runs`, ...where(n) });
      if (k.kind === 'timed' && k.within && !new RegExp(k.within.replace(/\s+/g, '\\s+'), 'i').test(source)) out.push({ kind: 'destructive-kind', message: `${label} can be undone for ${k.within} ${from}, and the page does not say how long: say it where the undo is offered`, ...where(n) });
    }
  }
  return out;
}

// llms.txt: each destructive action the layer names, with what it owes.
export function destructiveLines(kinds = []) {
  if (!kinds.length) return [];
  return ['', '## Destructive actions', '', 'How much damage each one does, as the team wrote it, and what it owes. Build each the way its kind says.',
    ...kinds.map((k) => `- ${k.action}: ${k.kind === 'timed' ? `can be undone for ${k.within}` : k.kind === 'undoable' ? 'can be undone' : 'permanent'}. It ${OWES[k.kind]}. (${k.page})`)];
}
