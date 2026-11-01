// page-criteria.mjs - the WCAG criteria that belong to a page, never to a component, tried on a product's own pages and
// across them: each page titled (2.4.2) and in a language (3.1.1), a skip link or landmarks to pass the repeated blocks
// (2.4.1), navigation in the same order (3.2.3) and named alike (3.2.4) from page to page, help in the same place
// (3.2.6), a flow never asking twice for what it was given (3.3.7, where the flows are named) and a legal or financial
// step that can be checked, corrected or undone (3.3.4).
//
//   PAGE_FACTS                          → in-page expression: what one page shows of these (run by a11y-check.mjs on a
//                                         whole page, never on a component's)
//   pageCriteria(pages, { flows })      → { criteria: { [sc]: { st, note, pages } }, findings, groups, flows }
//   pageCriteriaTodos(pagesResult)      → the style guide's rows for what is to fix or to check, one per criterion
//
// Honest by design: what a machine can decide (a title, a language, a main landmark, the order of the same links) is
// passed or failed; what it cannot (whether a step commits money, whether a field is filled in once the flow runs) is
// for a person (st 'check'), never a pass. Pages are compared within one product (or one site) only.

// ── In the page ─────────────────────────────────────────────────────────────────────────────────────────────────
// Each control in the order of the page, with its name, its link and the landmark it sits in; each navigation with its
// items; the skip link; the landmarks; each form with its fields and the words of its submit buttons.
export const PAGE_FACTS = `(() => {
  const clean = (s) => String(s || '').replace(/\\s+/g, ' ').trim();
  const byIds = (ids) => clean(String(ids || '').split(/\\s+/).map((id) => { const e = id && document.getElementById(id); return e ? e.textContent : ''; }).join(' '));
  const nameOf = (el) => clean(el.getAttribute('aria-label')) || byIds(el.getAttribute('aria-labelledby')) || clean(el.innerText || el.textContent) || clean(el.getAttribute('title')) || clean(el.value) || clean([...el.querySelectorAll('img[alt]')].map((i) => i.alt).join(' '));
  const top = (n) => !n.parentElement || !n.parentElement.closest('article, aside, main, nav, section');
  const regionOf = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const r = (n.getAttribute('role') || '').toLowerCase(), t = n.tagName.toLowerCase();
      if (r === 'navigation' || t === 'nav') return 'nav';
      if (r === 'main' || t === 'main') return 'main';
      if (r === 'search' || t === 'search') return 'search';
      if (r === 'complementary' || t === 'aside') return 'aside';
      if (r === 'banner' || (t === 'header' && top(n))) return 'banner';
      if (r === 'contentinfo' || (t === 'footer' && top(n))) return 'footer';
    }
    return 'page';
  };
  const count = (sel) => document.querySelectorAll(sel).length;
  const CONTROL = 'a[href], button, [role="link"], [role="button"], [role="menuitem"], input[type="submit"], input[type="button"]';
  const controls = [...document.querySelectorAll(CONTROL)].slice(0, 600).map((el) => {
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    let abs = null; try { abs = href && !/^(#|javascript:)/i.test(href) ? new URL(href, location.href).href.replace(/#.*$/, '').replace(/\\/$/, '') : null; } catch (e) { abs = null; }
    return { name: nameOf(el).slice(0, 80), href: abs, raw: href, region: regionOf(el) };
  }).filter((c) => c.name);
  let unnamed = 0;
  const navs = [...document.querySelectorAll('nav, [role="navigation"]')].map((n) => {
    const label = clean(n.getAttribute('aria-label')) || byIds(n.getAttribute('aria-labelledby'));
    return { label: label || 'navigation ' + (++unnamed), items: [...n.querySelectorAll(CONTROL)].map(nameOf).filter(Boolean).map((s) => s.slice(0, 80)) };
  });
  // The skip link: an in-page link among the first few stops of the page.
  const FOCUS = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const first = [...document.querySelectorAll(FOCUS)].filter((el) => !el.disabled).slice(0, 3);
  const sk = first.find((el) => el.tagName === 'A' && /^#.+/.test(el.getAttribute('href') || ''));
  const skipTo = sk ? decodeURIComponent(sk.getAttribute('href').slice(1)) : null;
  const skip = sk ? { name: nameOf(sk).slice(0, 80), to: skipTo, there: !!(document.getElementById(skipTo) || document.getElementsByName(skipTo)[0]) } : null;
  // Each form, with the fields it asks for and the words of what sends it; fields in no form are the page's own.
  const FIELD = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]), select, textarea';
  const labelOf = (f) => clean(f.getAttribute('aria-label')) || byIds(f.getAttribute('aria-labelledby')) || clean([...(f.labels || [])].map((l) => l.textContent).join(' ')) || clean(f.getAttribute('placeholder'));
  const fieldOf = (f) => {
    const sel = f.tagName === 'SELECT' ? f.querySelector('option[selected]') : null;
    return { name: clean(f.getAttribute('name') || f.id), label: labelOf(f).slice(0, 80), type: (f.getAttribute('type') || f.tagName).toLowerCase(),
      autocomplete: clean(f.getAttribute('autocomplete')).toLowerCase(), filled: f.tagName === 'SELECT' ? !!(sel && sel.value) : !!clean(f.value) };
  };
  const words = (root) => clean([...root.querySelectorAll('h1, h2, h3, legend, label, p')].map((e) => e.textContent).join(' ')).slice(0, 600);
  const forms = [...document.querySelectorAll('form')].map((form) => ({
    fields: [...form.querySelectorAll(FIELD)].map(fieldOf),
    submit: [...form.querySelectorAll('button:not([type="button"]):not([type="reset"]), input[type="submit"]')].map(nameOf).filter(Boolean).map((s) => s.slice(0, 60)),
    actions: [...form.querySelectorAll('button, a[href], [role="button"]')].map(nameOf).filter(Boolean).map((s) => s.slice(0, 60)),
    checks: [...form.querySelectorAll('input[type="checkbox"]')].map(labelOf).filter(Boolean),
    words: words(form),
  }));
  const loose = [...document.querySelectorAll(FIELD)].filter((f) => !f.closest('form'));
  if (loose.length) forms.push({ fields: loose.map(fieldOf), submit: [...document.querySelectorAll('button, input[type="submit"], [role="button"]')].filter((b) => !b.closest('form, nav')).map(nameOf).filter(Boolean).map((s) => s.slice(0, 60)),
    actions: [...document.querySelectorAll('button, a[href], [role="button"]')].filter((b) => !b.closest('form')).map(nameOf).filter(Boolean).map((s) => s.slice(0, 60)),
    checks: [...document.querySelectorAll('input[type="checkbox"]')].filter((c) => !c.closest('form')).map(labelOf).filter(Boolean), words: words(document.body), loose: true });
  return {
    url: location.href, title: clean(document.title), lang: clean(document.documentElement.getAttribute('lang') || document.documentElement.getAttribute('xml:lang')),
    landmarks: { main: count('main, [role="main"]'), nav: count('nav, [role="navigation"]'), banner: count('[role="banner"]') + [...document.querySelectorAll('header')].filter(top).length,
      footer: count('[role="contentinfo"]') + [...document.querySelectorAll('footer')].filter(top).length, headings: count('h1, h2, h3, h4, h5, h6, [role="heading"]') },
    skip, navs, controls, forms,
  };
})()`;

// ── Words ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Help, as people offer it: a help page, a contact, a chat, a phone or an email.
const HELP = /\b(help|support|contact|faq|frequently asked|chat|customer service|assistance)\b/i;
const HELP_HREF = /^(mailto:|tel:)|\/(help|support|contact|faq)\b/i;
// What sends money, signs or commits data: the words of a submit button.
export const LEGAL = /\b(pay|payment|buy|purchase|place (an |the |my )?order|order now|check ?out|transfer|send money|donate|subscribe|sign(?! ?(in|up|out|on)\b)|sign (the |this )?(contract|agreement|form)|(i )?agree( and| &| to)?|accept (the )?(terms|offer|agreement|contract|quote)|apply (now|for)|submit (the |my )?(application|claim|return|form)|file (the |my )?(claim|return)|book now|confirm (the |my )?(booking|payment|order|purchase|transfer)|delete (the |my )?(account|data|profile)|close (the |my )?account|cancel (the |my )?(subscription|plan|account)|withdraw|deposit|invest|trade|sell)\b/i;
// A way to check, correct or undo it: a review step, a confirming checkbox, a back or edit, an undo or a cancellation.
const REVIEW = /\b(review|summary|check (your|the) (details|order|answers)|confirm|correct|edit|change|back|undo|cancel|can be cancelled|withdraw within|refund)\b/i;
const VALID_LANG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

const norm = (s) => String(s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
const key = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const listed = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs.join(''));
const quote = (xs) => listed(xs.map((x) => `"${x}"`));

// A field's meaning across pages: its autocomplete token when it names one (email, postal-code), else its name or label.
export function fieldKey(f) {
  const tok = String(f.autocomplete ?? '').split(/\s+/).filter((t) => t && !/^(on|off|section-.*|shipping|billing|home|work|mobile|fax|pager)$/.test(t)).pop();
  return key(tok) || key(f.name) || key(f.label);
}

// The pages that are one product (or one site): compared with each other, never with another product's.
export function groupsOf(pages) {
  const by = new Map();
  for (const p of pages) {
    let site = p.product ?? null;
    if (!site) { try { const u = new URL(p.url ?? p.label); site = u.protocol === 'file:' ? 'file' : u.origin; } catch { site = 'pages'; } }
    if (!by.has(site)) by.set(site, []);
    by.get(site).push(p);
  }
  return [...by].map(([site, list]) => ({ site, pages: list }));
}

// The first pair of shared items whose order differs between two lists: [a, b] with a before b in `was`, b before a in `now`.
export function orderBreak(was, now) {
  const inNow = new Set(now), inWas = new Set(was);
  const a = [...new Set(was.filter((x) => inNow.has(x)))], b = [...new Set(now.filter((x) => inWas.has(x)))];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return [a[i], b[i]];
  return null;
}

// A flow's page, matched by its label, its address or the end of either.
const matches = (p, want) => { const w = String(want); return [p.label, p.url].some((x) => x && (x === w || x.endsWith(w) || x.endsWith(`/${w}`))); };

// ── Across the pages ────────────────────────────────────────────────────────────────────────────────────────────
// pages: [{ label, url, product?, ...PAGE_FACTS }]; flows: [{ name, pages: [label, address or the end of either] }].
// → { criteria: { [sc]: { st: 'done' | 'todo' | 'check', note, pages } }, findings: [{ kind, plugin, desc, el?, severity }],
//     groups: [{ site, pages: [label] }], flows: [{ name, pages: [label], missing: [string] }] }
export function pageCriteria(pages = [], { flows = [] } = {}) {
  const findings = [], criteria = {};
  const all = pages.map((p) => p.label);
  const push = (kind, page, desc, severity, el = null) => findings.push({ kind, plugin: page.label, desc, severity, ...(el ? { el } : {}), ...(page.product ? { product: page.product } : {}) });
  const set = (sc, st, note, on = all) => { criteria[sc] = { st, note, pages: on }; };
  if (!pages.length) return { criteria, findings, groups: [], flows: [] };
  const pageWord = (n) => `${n} page${n === 1 ? '' : 's'}`;

  // 2.4.2 Page Titled: a title on each, and not the same on different pages of one product.
  const untitled = pages.filter((p) => !p.title);
  for (const p of untitled) push('pagetitle', p, `${p.label}: no title`, 'blocker', 'html');
  const groups = groupsOf(pages);
  const same = [];
  for (const g of groups) {
    const by = new Map();
    for (const p of g.pages) if (p.title) { const k = norm(p.title); if (!by.has(k)) by.set(k, []); by.get(k).push(p); }
    for (const [, list] of by) if (list.length > 1) { same.push(list); for (const p of list.slice(1)) push('pagetitle', p, `${p.label}: the same title as ${list[0].label} ("${p.title}")`, 'advisory', 'html'); }
  }
  if (untitled.length) set('2.4.2', 'todo', `No title on ${listed(untitled.map((p) => p.label))}.`, untitled.map((p) => p.label));
  else if (same.length) set('2.4.2', 'check', `Every page has a title; ${same.map((l) => `${listed(l.map((p) => p.label))} share "${l[0].title}"`).join('; ')}. A person checks each title says which page it is.`, same.flat().map((p) => p.label));
  else set('2.4.2', 'done', `${pages.length === 1 ? 'The page has a title' : `Each of the ${pageWord(pages.length)} has a title of its own`}: ${pages.map((p) => `${p.label} "${p.title}"`).join(', ')}.`);

  // 3.1.1 Language of Page: a lang on the page, written as a language tag.
  const noLang = pages.filter((p) => !p.lang || !VALID_LANG.test(p.lang));
  for (const p of noLang) push('pagelang', p, p.lang ? `${p.label}: lang="${p.lang}" is not a language tag` : `${p.label}: no lang on <html>`, 'blocker', 'html');
  if (noLang.length) set('3.1.1', 'todo', `No language said on ${listed(noLang.map((p) => p.label))}.`, noLang.map((p) => p.label));
  else set('3.1.1', 'done', `Each page says its language: ${pages.map((p) => `${p.label} (${p.lang})`).join(', ')}.`);

  // 2.4.1 Bypass Blocks: a main landmark, or a skip link that lands somewhere. A skip link to nothing fails whatever else.
  const bad = [];
  for (const p of pages) {
    const lm = p.landmarks ?? {};
    if (p.skip && !p.skip.there) { bad.push(p); push('bypass', p, `${p.label}: the skip link "${p.skip.name}" goes to #${p.skip.to}, which is not on the page`, 'blocker', 'html'); }
    else if (!lm.main && !p.skip) { bad.push(p); push('bypass', p, `${p.label}: no main landmark and no skip link`, 'blocker', 'html'); }
    else if (!p.skip && lm.nav && (p.controls ?? []).filter((c) => c.region === 'nav' || c.region === 'banner').length > 5) push('bypass', p, `${p.label}: no skip link before ${(p.controls ?? []).filter((c) => c.region === 'nav' || c.region === 'banner').length} links in its header and navigation (its main landmark lets screen readers past them, the keyboard alone cannot)`, 'advisory', 'html');
  }
  const how = (p) => [p.skip ? `a skip link "${p.skip.name}"` : '', p.landmarks?.main ? 'a main landmark' : ''].filter(Boolean).join(' and ');
  if (bad.length) set('2.4.1', 'todo', `Nothing to pass the repeated blocks on ${listed(bad.map((p) => p.label))}.`, bad.map((p) => p.label));
  else set('2.4.1', 'done', `Each page lets a person past its repeated blocks: ${pages.map((p) => `${p.label} (${how(p)})`).join(', ')}.`);

  // Pages compared within one product: 3.2.3, 3.2.4, 3.2.6 need two pages or more of it.
  const several = groups.filter((g) => g.pages.length > 1);
  const alone = groups.length && !several.length ? `Only one page of ${groups.length === 1 ? 'the product was' : 'each product was'} tried (${listed(all)}): name more of its pages (a11y.urls, or --url) to compare them.` : '';

  // 3.2.3 Consistent Navigation: each navigation, by its name, has the items it shares with another page in the same order.
  {
    const breaks = [], seen = [];
    for (const g of several) {
      const first = new Map();
      for (const p of g.pages) for (const n of p.navs ?? []) {
        const was = first.get(n.label);
        if (!was) { first.set(n.label, { page: p, items: n.items }); continue; }
        seen.push(p.label, was.page.label);
        const br = orderBreak(was.items, n.items);
        if (br) { breaks.push(p.label); push('navorder', p, `${p.label}: navigation "${n.label}" puts "${br[1]}" before "${br[0]}"; ${was.page.label} has "${br[0]}" first`, 'warning'); }
      }
    }
    const on = [...new Set(seen)];
    if (breaks.length) set('3.2.3', 'todo', `The navigation changes order on ${listed([...new Set(breaks)])}.`, [...new Set(breaks)]);
    else if (on.length) set('3.2.3', 'done', `The same navigation in the same order on ${listed(on)}.`, on);
    else set('3.2.3', 'check', alone || `No navigation (nav) shared between the pages tried (${listed(all)}): a person compares the menus they repeat.`);
  }

  // 3.2.4 Consistent Identification: a link to the same place in the same part of the page (its header, navigation or
  // footer) reads the same on every page. Buttons and icons that do the same thing are a person's to compare.
  {
    const diff = [], shared = new Set(), seen = new Set();
    for (const g of several) {
      const first = new Map();
      for (const p of g.pages) {
        const mine = new Map();
        for (const c of p.controls ?? []) if (c.href && ['nav', 'banner', 'footer', 'aside', 'search'].includes(c.region) && !mine.has(`${c.region} ${c.href}`)) mine.set(`${c.region} ${c.href}`, c);
        for (const [k, c] of mine) {
          const was = first.get(k);
          if (!was) { first.set(k, { page: p, c }); continue; }
          shared.add(k); seen.add(p.label); seen.add(was.page.label);
          if (norm(was.c.name) !== norm(c.name)) { diff.push(p.label); push('namedalike', p, `${p.label}: the ${c.region === 'banner' ? 'header' : c.region === 'nav' ? 'navigation' : c.region} link to ${c.raw ?? c.href} reads "${c.name}"; on ${was.page.label} it reads "${was.c.name}"`, 'warning'); }
        }
      }
    }
    if (diff.length) set('3.2.4', 'todo', `A link to the same place is named otherwise on ${listed([...new Set(diff)])}.`, [...new Set(diff)]);
    else if (shared.size) set('3.2.4', 'check', `The ${shared.size} link${shared.size === 1 ? '' : 's'} the pages share in their header, navigation or footer read the same on ${listed([...seen])}. A person checks that buttons and icons that do the same thing are named alike too.`, [...seen]);
    else set('3.2.4', 'check', alone || `No link shared in a header, navigation or footer between the pages tried (${listed(all)}): a person compares what does the same thing.`);
  }

  // 3.2.6 Consistent Help: help offered on several pages sits in the same part of the page, among the same content around it.
  {
    const moved = [], seen = new Set(), helpOn = new Set();
    const helpOf = (p) => (p.controls ?? []).filter((c) => HELP.test(c.name) || HELP_HREF.test(c.raw ?? ''));
    for (const g of several) {
      const first = new Map();
      for (const p of g.pages) {
        const names = (p.controls ?? []).map((c) => norm(c.name));
        for (const h of helpOf(p)) {
          helpOn.add(p.label);
          const k = norm(h.name), was = first.get(k);
          if (!was) { first.set(k, { page: p, h, names }); continue; }
          seen.add(p.label); seen.add(was.page.label);
          // Where it sits among what both pages repeat: the region, then what comes before it.
          const common = new Set(names.filter((n) => was.names.includes(n)));
          const before = (list) => list.slice(0, list.indexOf(k)).filter((n) => common.has(n) && n !== k);
          const a = before(was.names), b = before(names);
          const lost = a.filter((n) => !b.includes(n)), gained = b.filter((n) => !a.includes(n));
          if (was.h.region !== h.region) { moved.push(p.label); push('helpplace', p, `${p.label}: "${h.name}" is in the ${h.region}; on ${was.page.label} it is in the ${was.h.region}`, 'warning'); }
          else if (lost.length || gained.length) { moved.push(p.label); push('helpplace', p, `${p.label}: "${h.name}" comes ${gained.length ? `after ${quote(gained.slice(0, 2))}` : `before ${quote(lost.slice(0, 2))}`} here, not on ${was.page.label}`, 'warning'); }
        }
      }
    }
    if (!several.length) for (const p of pages) if (helpOf(p).length) helpOn.add(p.label);
    if (moved.length) set('3.2.6', 'todo', `Help moves on ${listed([...new Set(moved)])}.`, [...new Set(moved)]);
    else if (seen.size) set('3.2.6', 'done', `Help sits in the same place on ${listed([...seen])}.`, [...seen]);
    else if (helpOn.size) set('3.2.6', 'check', alone || `Help is offered on ${listed([...helpOn])} only: a person checks it is in the same place wherever else it is offered.`, [...helpOn]);
    else set('3.2.6', 'check', `No help (a help page, a contact, a chat) found by its words on ${listed(all)}: a person checks whether any is offered, and that it sits in the same place on each page.`);
  }

  // The flows: each named sequence of pages, matched to the pages tried.
  const flowList = (flows ?? []).filter((f) => f && Array.isArray(f.pages) && f.pages.length).map((f, i) => {
    const steps = f.pages.map((w) => pages.find((p) => matches(p, w)) ?? null);
    return { name: f.name || `flow ${i + 1}`, steps: steps.filter(Boolean), missing: f.pages.filter((_, j) => !steps[j]).map(String) };
  });

  // 3.3.7 Redundant Entry: a field a later page of a flow asks for again, read from its meaning (its autocomplete token,
  // else its name or label), empty when the page opens. A password asked again is allowed (it keeps an account safe).
  // The pages are opened one by one, never filled in: a field the flow fills once it runs looks empty here, so it is a
  // person's to confirm, never a pass or a fail.
  {
    const asks = pages.some((p) => (p.forms ?? []).some((f) => f.fields.length));
    const again = [], tried = [];
    for (const fl of flowList) {
      if (fl.steps.length < 2) continue;
      tried.push(fl);
      const given = new Map();
      for (const p of fl.steps) {
        for (const form of p.forms ?? []) for (const f of form.fields) {
          const k = fieldKey(f);
          if (!k || f.type === 'password') continue;
          const was = given.get(k);
          if (was && was.page !== p && !f.filled) {
            again.push(p.label);
            const fill = f.autocomplete && f.autocomplete !== 'off' ? ` (autocomplete="${f.autocomplete}" lets a browser offer it; the flow itself should)` : '';
            push('askedagain', p, `${p.label}, in ${fl.name}: "${f.label || f.name}" is asked again, empty, after ${was.page.label} asked for it${fill}`, 'warning');
          }
          if (!was) given.set(k, { page: p });
        }
      }
    }
    const flowPages = [...new Set(tried.flatMap((f) => f.steps.map((p) => p.label)))];
    if (again.length) set('3.3.7', 'check', `Asked again, empty when the page opens, on ${listed([...new Set(again)])}. A person runs the flow and confirms whether it fills them in or offers them to pick.`, [...new Set(again)]);
    else if (tried.length) set('3.3.7', 'done', `Nothing asked twice in ${listed(tried.map((f) => `${f.name} (${f.steps.map((p) => p.label).join(' → ')})`))}.`, flowPages);
    else if (!asks) set('3.3.7', 'done', `No page tried asks for anything (${listed(all)}).`);
    else set('3.3.7', 'check', flowList.length ? `The flows named have fewer than two of the pages tried (${listed(flowList.map((f) => `${f.name}: ${f.missing.length ? `not tried ${listed(f.missing)}` : `${f.steps.length} page`}`))}): a person walks each flow.` : 'No flow named (a11y.flows: the pages of each, in order): a person walks each flow and checks it never asks twice for what it was given.');
  }

  // 3.3.4 Error Prevention (Legal, Financial, Data): a form whose submit words read as paying, signing or deleting is
  // a person's to check: it lets the person review, correct or undo before or after. A machine reads the words only.
  {
    const steps = [];
    for (const p of pages) for (const form of p.forms ?? []) {
      const word = form.submit.find((s) => LEGAL.test(s));
      if (!word) continue;
      const flow = flowList.find((fl) => fl.steps.includes(p));
      const later = flow ? flow.steps.slice(flow.steps.indexOf(p) + 1) : [];
      const here = [...form.actions.filter((a) => a !== word && REVIEW.test(a)), ...form.checks.filter((c) => REVIEW.test(c)), ...(REVIEW.test(form.words) ? ['its words'] : [])];
      const after = later.filter((q) => REVIEW.test(q.title) || (q.forms ?? []).some((f) => f.submit.some((s) => REVIEW.test(s))));
      steps.push({ p, word, way: here.length || after.length });
      if (!here.length && !after.length) push('legalstep', p, `${p.label}: "${word}" sends the form with no review, correction or undo found around it`, 'advisory');
    }
    const forms = pages.some((p) => (p.forms ?? []).some((f) => f.fields.length || f.submit.length));
    const on = [...new Set(steps.map((s) => s.p.label))];
    if (steps.length) set('3.3.4', 'check', `${listed(steps.map((s) => `"${s.word}" on ${s.p.label}${s.way ? ' (a way to review or undo it is offered)' : ' (no way to review or undo it found)'}`))}. A person checks each can be reviewed and corrected before it is sent, or undone after.`, on);
    else if (forms) set('3.3.4', 'check', `No form on ${listed(all)} reads as paying, signing or deleting by its words. A person confirms none commits money, a legal agreement or data.`);
    else set('3.3.4', 'done', `No form on the pages tried (${listed(all)}).`);
  }

  return { criteria, findings, groups: groups.map((g) => ({ site: g.site, pages: g.pages.map((p) => p.label) })), flows: flowList.map((f) => ({ name: f.name, pages: f.steps.map((p) => p.label), missing: f.missing })) };
}

// The style guide's rows for what is left on the pages: one per criterion to fix (the code's) or to check (a person's),
// each with the pages it was found on. result: a11y.json's `pages` (pageCriteria's), with `names` from wcag21.mjs.
// → [{ area: 'Accessibility', type, kind, who, st, say, todo }]
export function pageCriteriaTodos(result, names = {}) {
  const out = [];
  for (const [sc, c] of Object.entries(result?.criteria ?? {})) {
    if (c.st === 'done') continue;
    const name = names[sc] ? `${sc} ${names[sc]}` : sc;
    out.push({ area: 'Accessibility', type: `Pages, ${name}`, kind: 'Accessibility', who: c.st === 'todo' ? 'code' : 'person', st: c.st,
      say: `${name}, tried on the products' own pages: ${c.note}`,
      todo: c.st === 'todo' ? `Fix it on ${listed(c.pages)}. Each one is in the audit's accessibility list, with its fix.` : `Check it by hand on ${listed(c.pages)}.` });
  }
  return out;
}
