// page-navigation.mjs - what moves inside one page, not only what leads between pages.
//
// A prototype is checked for what leads from page to page (prototype-flows.mjs) and knows nothing of what moves
// inside one. Ask a designer's question - "a page with a tab for each section of the account" - and the page comes
// back with a tab strip, four tabs, one panel, and every check calls it whole. In a user test the second tab does
// nothing, and the person running the test finds it, not the engine.
//
// A composition already says how something moves inside a page: a part carries `opens` with the id of the part a
// click shows (prototype-pieces.mjs rule 2). So the reading is narrow and honest: a part that navigates, that
// offers more than one choice, and where nothing on the page is opened at all, switches nothing. Anything subtler
// than that - whether the right panel is behind the right tab - is not something a composition says, and guessing
// it would be an opinion with nothing under it.
//
// Nothing here writes the missing link. A navigator that switches nothing is a question for whoever drew it.
import { nodesOf } from './prototype-pieces.mjs';

// What navigates inside a page, by the component's own name or by what the part says it is. The system's own
// names first, then the words a team uses when their component is called something else.
export const NAVIGATORS = /\b(tab ?(strip|bar|list|s)?|tabs?|segmented( control)?|stepper|wizard|side ?(rail|nav)|nav ?rail|accordion|disclosure|collapsible|sub ?nav|pager|pagination|separador(es)?|abas?)\b/i;

// How many choices a navigator offers, as the composition says it: a list prop (tabs, items, steps, options), or
// the parts inside it. One choice is not navigation.
export function choicesOf(node, kids = []) {
  for (const k of ['tabs', 'items', 'steps', 'options', 'sections', 'pages']) {
    const v = node.props?.[k];
    if (Array.isArray(v)) return v.length;
  }
  return kids.length;
}

// The words a part says about itself, for deciding whether it navigates. A component's name is written the way
// code writes one, so SegmentedControl is read as two words: without that it matched nothing and the check was
// quietly blind to every component named in camel case, which is most of them.
export const spaced = (s) => String(s).replace(/([a-z0-9])([A-Z])/g, '$1 $2');
const saysOf = (n) => [n.component, n.props?.label, n.props?.Label, n.props?.title, n.props?.purpose, n.props?.role, n.props?.standInFor]
  .filter((x) => typeof x === 'string' && x.trim()).map(spaced).join(' · ');

// The parts of a page that navigate inside it. → [{ id, component, choices }]
export function navigatorsIn(ui) {
  const { nodes } = nodesOf(ui);
  const kidsOf = (id) => nodes.filter((n) => n.parent === id);
  return nodes
    .filter((n) => NAVIGATORS.test(saysOf(n)))
    .map((n) => ({ id: n.id, component: n.component, choices: choicesOf(n, kidsOf(n.id)) }))
    .filter((n) => n.choices > 1);                 // one choice is not navigation, and saying so would be noise
}

// A navigator switches something when anything on the page is opened by a click: `opens` is how a composition
// says that. Read over the whole page rather than per navigator, because which part opens which is the
// composition's business and a page with one working navigator is not the case this is for.
export const switchesSomething = (ui) => nodesOf(ui).nodes.some((n) => typeof n.props?.opens === 'string' && n.props.opens.trim());

// → [{ level, kind, need, message }] for one page. Empty when the page navigates, or does not try to.
export function navigationFindings(name, ui) {
  const navs = navigatorsIn(ui);
  if (!navs.length || switchesSomething(ui)) return [];
  const said = navs.map((n) => `${n.component} (${n.choices} choices)`).join(', ');
  return [{
    level: 'warning', kind: 'navigation', need: `what ${navs[0].component} switches on ${name}`,
    message: `"${name}" has ${said} and nothing on the page opens anything: in a user test the second choice does nothing. Give each choice "opens" with the id of the part it shows, or say the page is one view and the choices lead elsewhere`,
  }];
}

// Every page of a prototype. pages: { name: ui }.
export function allNavigationFindings(pages = {}) {
  return Object.entries(pages).flatMap(([n, ui]) => navigationFindings(n, ui));
}
