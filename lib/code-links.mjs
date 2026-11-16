// code-links.mjs - where a page written as code leads.
//
// A prototype drawn from a composition says where each action goes in one prop ("goesTo"), and the flow view reads
// it. A prototype written as the product writes its pages - which is what this engine asks a designer's agent to
// write, and what a developer can take forward - says the same thing in code, and nothing read it. So a journey of
// four pages, each one ready, was four pages: the flow view saw none of them, the links were there, and the thing
// a designer is actually building went unseen.
//
// Read here are the ways a page in this kind of project leads somewhere, each matched against the other prototypes
// by name, because a link to something that is not one of them is a route of the product, not a step of the flow:
//   router.push('Name') / router.push({ name: 'Name' })    a router, the usual way
//   location.href = 'Name'                                  a plain assignment
//   routeName: 'Name'                                       a route named in a prop (breadcrumbs, action rows)
//   <router-link to="Name">                                 a link in the markup
//
// What a link is called comes from the words beside it, so the flow reads as a person would say it ("Aprovar"),
// and falls back to the page it leads to. Nothing here runs the code: it is read, as everything else is.
const NAME = String.raw`['"\`]([A-Za-z][\w.-]*)['"\`]`;
const WAYS = [
  new RegExp(String.raw`router\s*\.\s*(?:push|replace)\s*\(\s*${NAME}`, 'g'),
  new RegExp(String.raw`router\s*\.\s*(?:push|replace)\s*\(\s*\{[^}]*?\bname\s*:\s*${NAME}`, 'g'),
  new RegExp(String.raw`(?:window\s*\.\s*)?location\s*\.\s*href\s*=\s*${NAME}`, 'g'),
  new RegExp(String.raw`\brouteName\s*:\s*${NAME}`, 'g'),
  new RegExp(String.raw`<router-link[^>]*\bto\s*=\s*${NAME}`, 'g'),
];

// What a link is called. A page in this kind of project names a handler and hands it to a button beside a label
// ({ label: 'Voltar', callbackFn: goBack }), so the words are found through the handler, not by nearness: the
// assignment that leads and the words that name it are often paragraphs apart. The words matter beyond reading
// well - the flow tells a way back from a step by them (Voltar, Retroceder, Back), and a link labelled with the
// page it leads to would read as a step every time, so every page would look like a start.
const handlerAt = (src, at) => {
  const before = src.slice(0, at);
  const m = [...before.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)\s*(?:=|\()/g)].pop();
  return m ? m[1] : null;
};
const labelFor = (src, fn) => {
  if (!fn) return null;
  // The object that hands this handler over, and the label written in it.
  const re = new RegExp(String.raw`\{[^{}]*?\bcallbackFn\s*:\s*${fn}\b[^{}]*?\}|\{[^{}]*?\blabel\s*:\s*['"\`]([^'"\`]{1,60})['"\`][^{}]*?\bcallbackFn\s*:\s*${fn}\b[^{}]*?\}`, 'g');
  for (const m of src.matchAll(re)) {
    const said = /\blabel\s*:\s*['"`]([^'"`]{1,60})['"`]/.exec(m[0]);
    if (said) return said[1];
  }
  return null;
};

const base = (s) => String(s).split(/[/#?]/).filter(Boolean).pop() ?? String(s);

// text: the page's source. names: every prototype there is. → [{ from, to, label }]
export function linksInCode(name, text, names = []) {
  const src = String(text ?? '');
  const known = new Map(names.map((n) => [n.toLowerCase(), n]));
  const out = [];
  const seen = new Set();
  for (const re of WAYS) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(src));) {
      const to = known.get(base(m[1]).toLowerCase());
      if (!to || to === name || seen.has(to)) continue;
      seen.add(to);
      out.push({ from: name, to, state: null, id: null, label: labelFor(src, handlerAt(src, m.index)) ?? to });
    }
  }
  return out;
}
