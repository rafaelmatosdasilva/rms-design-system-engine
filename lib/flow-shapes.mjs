// flow-shapes.mjs - the shapes a flow comes in, and what each one owes.
//
// A designer asks for an operation in several steps: sign in, a one-time code, a confirmation, a success page.
// The engine checks that the pages link and knows nothing of the shapes, so a code step with no way to ask for
// another one, a destructive step with no way out, and a middle step that quietly ends the journey all pass.
//
// Each shape is read from the pages themselves - their name, their title, the words on their parts - never from
// what the request said, because what was asked for and what was drawn are the two things being compared. A shape
// that is recognised owes certain parts, and a page missing one is said as a question for the designer. Nothing
// here writes a page or adds a part: the engine does not invent, and a shape is a reading, not an instruction.
//
// The one thing this settles that nothing else could: `--prototype --flow` names the pages a journey ends on and
// cannot tell whether that is right ("the end of a flow, or a page that needs a way on"). A page that looks like
// a success page is an ending; a payment step is not, and an ending there means the next page was never drawn.
import { nodesOf } from './prototype-pieces.mjs';

// What the page's own parts say. A page is known to be a shape by its name as well (a page called `otp` is one),
// but a part it owes has to be an actual part: a success page called "done" does not have a way on because its
// file is called done, and reading the name on both sides let exactly that pass.
export function partWords(ui) {
  return nodesOf(ui).nodes
    .flatMap((n) => [n.component, n.props?.label, n.props?.Label, n.props?.text, n.props?.Text, n.props?.title, n.props?.purpose, n.props?.heading, n.props?.need, n.props?.standInFor])
    .filter((x) => typeof x === 'string' && x.trim()).join(' · ');
}
export const pageWords = (name, ui) => `${String(name).replace(/([a-z])([A-Z])/g, '$1 $2')} · ${partWords(ui)}`;

// Each shape: how a page is known to be one, and what being one owes. `ends` says a page of this shape is where a
// journey stops, so the flow view's open question about it is answered rather than repeated.
export const SHAPES = {
  'a one-time code step': {
    is: /\b(one[- ]?time (code|password)|\botp\b|verification code|verify your (email|number|phone)|c[óo]digo( de)? (verifica[çc][ãa]o|[úu]nico)|two[- ]factor|\b2fa\b)\b/i,
    owes: [
      { part: 'a way to ask for another code', is: /\b(resend|send (it )?again|request (a )?new code|did ?n[o']?t (get|receive)|reenviar|novo c[óo]digo)\b/i },
      { part: 'a way back to change where it was sent', is: /\b(back|previous|change|edit|wrong (number|email)|voltar|anterior|alterar)\b/i },
    ],
  },
  'a sign-in step': {
    is: /\b(sign[- ]?in|sign in|log[- ]?in|log in|entrar|iniciar sess[ãa]o)\b/i,
    owes: [{ part: 'a way out for somebody who cannot get in', is: /\b(forgot|reset|trouble|help|recover|esqueci|recuperar)\b/i }],
  },
  'a destructive step': {
    is: /\b(delete|remove permanently|destroy|close (the )?account|cancel (the )?(order|subscription|account)|eliminar|apagar)\b/i,
    owes: [{ part: 'a way out that is not the destructive one', is: /\b(cancel|keep|go back|not now|never ?mind|voltar|manter)\b/i }],
  },
  'a success page': {
    is: /\b(success|succeeded|all set|thank you|thanks|confirmed|completed?|done|sucesso|obrigad[oa]|conclu[íi]d[oa])\b/i,
    ends: true,
    owes: [{ part: 'a way on to whatever comes after it', is: /\b(done|close|continue|back to|go to|finish|view|see|concluir|voltar)\b/i }],
  },
};
export const SHAPE_NAMES = Object.keys(SHAPES);

// Which shapes a page is. A page can be more than one, and being none is the ordinary case, not a finding.
export function shapesOf(name, ui) {
  const said = pageWords(name, ui);
  return SHAPE_NAMES.filter((k) => SHAPES[k].is.test(said));
}

// What a page of a shape owes and does not have. → [{ page, shape, part }]
export function owedBy(name, ui) {
  const said = partWords(ui);                            // the parts only: see partWords
  const out = [];
  for (const shape of shapesOf(name, ui)) {
    for (const o of SHAPES[shape].owes ?? []) if (!o.is.test(said)) out.push({ page: name, shape, part: o.part });
  }
  return out;
}

// Every finding the shapes make over a whole flow. pages: { name: ui }; g: flowGraph(pages).
export function shapeFindings(pages = {}, g = null) {
  const out = [];
  for (const n of Object.keys(pages)) {
    for (const o of owedBy(n, pages[n])) {
      out.push({ level: 'warning', kind: 'flow', need: `${o.part} on ${n}`,
        message: `"${n}" is ${o.shape} and is missing ${o.part}: a person who needs it here has nowhere to go. Add it from the system, or say why this flow does not need it` });
    }
  }
  if (!g) return out;
  // The flow view names where a journey ends and cannot tell whether that is right. A shape can.
  for (const n of g.deadEnds ?? []) {
    const shapes = shapesOf(n, pages[n] ?? {});
    if (shapes.includes('a success page')) continue;                     // an ending, and the right one
    const mid = shapes.filter((s) => !SHAPES[s].ends);
    if (!mid.length) continue;                                           // nothing known: the flow view's open question stands
    out.push({ level: 'warning', kind: 'flow', need: `what follows ${n}`,
      message: `the journey ends on "${n}", which is ${mid[0]} and not an ending: the page after it was never drawn. Draw it, or give a part of "${n}" a "goesTo" to where it goes` });
  }
  return out;
}
