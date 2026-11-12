// flow-walk.mjs - a flow actually walked, for WCAG 3.3.7 Redundant Entry.
//
// Opening a flow's pages one after another says what each one asks for, never whether the flow fills it in: a field
// the flow would have carried over looks empty to a reader that typed nothing, so the criterion was left to a person
// (page-criteria.mjs). Walking it gives each step values of its own, sends it, and reads what the next page asks for
// then: a field asked again, still empty, after the step before was given it, is the criterion failing; nothing asked
// twice, with the flow having moved on each time, is the criterion passing.
//
// It types into a running product and presses its buttons, so:
//   • it runs only where the project asks for it (ds-config.json → a11y.walkFlows: true), never by default;
//   • it never types into a password field or one that asks for a card (the criterion excepts a password anyway);
//   • it stops before a step whose button reads as paying, signing or deleting (LEGAL, page-criteria.mjs), and says
//     so: what it walked up to there is reported, the rest stays a person's;
//   • the values are made up, so a step can refuse them. A flow that did not move on says that, and leaves the
//     criterion to a person rather than passing it.
//
//   walkValue(field)                    → the value to type for one field, from what the field asks for
//   mayFill(field) / maySend(form)      → whether this field is typed into, whether this form may be sent
//   WALK_FILL / WALK_SEND               → in-page expressions (a11y-check.mjs evaluates them)
//   walkFlows(flows, { page })          → [{ name, steps, given, asked, stopped }]
import { fieldKey, LEGAL } from './page-criteria.mjs';

// What to type, by what the field asks for (its autocomplete token first, then its type). Invented, generic values
// only: nothing here is a real person, address or account.
export const WALK_BY_TOKEN = {
  email: 'someone@example.com', tel: '+15550100', 'tel-national': '5550100', url: 'https://example.com',
  name: 'Example Person', 'given-name': 'Example', 'family-name': 'Person', 'additional-name': 'Middle', nickname: 'Example',
  'street-address': '1 Example Street', 'address-line1': '1 Example Street', 'address-line2': 'Flat 2', 'address-line3': '',
  'address-level1': 'Exampleshire', 'address-level2': 'Exampleton', 'postal-code': 'EX1 1EX', country: 'GB', 'country-name': 'Exampleland',
  organization: 'Acme', 'organization-title': 'Tester', username: 'example.person', bday: '1990-01-01', sex: '', language: 'en',
};
export const WALK_BY_TYPE = { email: 'someone@example.com', tel: '+15550100', url: 'https://example.com', number: '7', range: '7',
  date: '2030-01-01', 'datetime-local': '2030-01-01T10:00', month: '2030-01', week: '2030-W02', time: '10:00', search: 'example', textarea: 'Example answer' };
// A field nothing is ever typed into: a password (3.3.7 excepts it, and it is not ours to type), and anything that
// asks for a card or an account number.
const NEVER = /^(password|cc-|card|iban|bic|swift|account-number|sort-code|routing|cvv|cvc|csc|ssn|tax-id|passport)/i;
export const mayFill = (f = {}) => !(String(f.type ?? '') === 'password' || NEVER.test(String(f.autocomplete ?? '')) || NEVER.test(String(f.name ?? '')) || /\b(card|cvv|cvc|security code|iban|account number|sort code|passport)\b/i.test(String(f.label ?? '')));
export function walkValue(f = {}) {
  if (!mayFill(f)) return null;
  const tok = String(f.autocomplete ?? '').split(/\s+/).filter((t) => t && !/^(on|off|section-.*|shipping|billing|home|work|mobile|fax|pager)$/.test(t)).pop();
  if (tok && WALK_BY_TOKEN[tok] !== undefined) return WALK_BY_TOKEN[tok] || 'Example';
  const type = String(f.type ?? 'text').toLowerCase();
  if (WALK_BY_TYPE[type] !== undefined) return WALK_BY_TYPE[type];
  const says = `${f.label ?? ''} ${f.name ?? ''}`;
  for (const [word, re] of [['someone@example.com', /e-?mail/i], ['+15550100', /phone|tel\b|mobile/i], ['EX1 1EX', /post ?code|zip/i], ['1 Example Street', /address|street/i], ['Example Person', /\bname\b/i]]) if (re.test(says)) return word;
  return 'Example';
}

// Whether this form may be sent: never one whose button reads as paying, signing, ordering or deleting, and never one
// that asks for a card. → { ok: true } | { stop: <what reads that way> }
export function maySend(form = {}) {
  const word = (form.submit ?? []).find((s) => LEGAL.test(String(s)));
  if (word) return { stop: `its button reads "${word}"` };
  const pay = (form.fields ?? []).find((f) => !mayFill(f) && String(f.type ?? '') !== 'password');
  if (pay) return { stop: `it asks for ${pay.label || pay.name || 'a card'}` };
  if (!(form.submit ?? []).length) return { stop: 'it has no button that sends it' };
  return { ok: true };
}

// The form a step is walked through: the one that asks for the most, as a reader would fill in the step's own form and
// not the newsletter box beside it. → index into facts.forms, or -1
export const stepForm = (facts = {}) => (facts.forms ?? []).reduce((best, f, i, list) => ((f.fields ?? []).length > (list[best]?.fields ?? []).length ? i : best), 0) ?? -1;

// ── In the page ─────────────────────────────────────────────────────────────────────────────────────────────────
// Fill one form's fields with the values given, each by the name the facts named it with, and say what was typed.
// Events are fired as a person's typing fires them, so a framework that keeps its own state sees the value.
// The fields a page's own facts listed, in the same order: one form's, or - where the fields are in no form at all,
// as a page built without one has them - the page's own, which is the list PAGE_FACTS calls loose.
export const WALK_FILL = (index, values, loose = false) => `(() => {
  const FIELD = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]):not([type=checkbox]):not([type=radio]), select, textarea';
  const forms = [...document.querySelectorAll('form')];
  const root = ${loose} ? document : (forms[${index}] || document);
  const fields = [...root.querySelectorAll(FIELD)].filter((f) => ${loose} ? !f.closest('form') : true);
  const want = ${JSON.stringify(values)};
  const out = [];
  fields.forEach((el, i) => {
    const v = want[i];
    if (v === null || v === undefined) return;
    try {
      if (el.tagName === 'SELECT') {
        const opt = [...el.options].find((o) => o.value && !o.disabled && o.value === v) || [...el.options].find((o) => o.value && !o.disabled);
        if (!opt) return;
        el.value = opt.value;
      } else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      out.push({ i, value: el.tagName === 'SELECT' ? el.value : v });
    } catch (e) { /* a field the page will not let us set is left as it was */ }
  });
  return out;
})()`;

// Send the form: click what sends it, and say the words of the button clicked. The page may navigate, so nothing is
// read after the click here.
export const WALK_SEND = (index, loose = false) => `(() => {
  const forms = [...document.querySelectorAll('form')];
  const root = ${loose} ? document : (forms[${index}] || document);
  const b = [...root.querySelectorAll('button:not([type=button]):not([type=reset]), input[type=submit], [role=button]')].filter((x) => ${loose} ? !x.closest('form, nav') : true)[0];
  if (!b) return null;
  const words = (b.innerText || b.value || b.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim();
  b.click();
  return { clicked: words.slice(0, 60) };
})()`;

// ── The walk ────────────────────────────────────────────────────────────────────────────────────────────────────
// flows: the flows matched to the pages checked ([{ name, steps: [{ label, url, forms }] }], page-criteria's
// flowList). page(url) → { read(), fill(index, values), send(index), close() }, where read() gives that page's facts
// (PAGE_FACTS): a11y-check.mjs opens a real page, the tests a fake one.
// → [{ name, walked: [{ label, given: [{ key, label, value }], sent, stopped, landed, moved, last }], asked: [{ page,
//      label, key, after }], ended }]
export async function walkFlows(flows = [], { page, limit = 6 } = {}) {
  const out = [];
  for (const fl of flows) {
    if (!fl || (fl.steps ?? []).length < 2) continue;
    const walked = [], asked = [], given = new Map();
    let ended = null;
    const steps = fl.steps.slice(0, limit);
    for (const [at, step] of steps.entries()) {
      const last = at === steps.length - 1;
      let p = null;
      try { p = await page(step.url ?? step.label); } catch (e) { ended = `${step.label} did not open (${String(e.message ?? e).split('\n')[0]})`; break; }
      try {
        const facts = (await p.read()) ?? {};
        const i = stepForm(facts);
        const form = (facts.forms ?? [])[i];
        // What this page asks again: a field whose meaning an earlier step was given, empty now that the earlier
        // step was really filled in and sent.
        for (const f of form?.fields ?? []) {
          const k = fieldKey(f);
          const was = given.get(k);
          if (k && was && !f.filled && String(f.type ?? '') !== 'password') asked.push({ page: step.label, label: f.label || f.name || k, key: k, after: was });
        }
        // The last step is read, never filled in or sent: what it asks for is the whole answer by then, and sending
        // it would press a button in the product for nothing.
        if (last) { walked.push({ label: step.label, given: [], sent: false, last: true }); continue; }
        if (!form) { walked.push({ label: step.label, given: [], sent: false, stopped: 'it has no form' }); continue; }
        const values = (form.fields ?? []).map((f) => walkValue(f));
        const typed = (await p.fill(i, values, !!form.loose)) ?? [];
        const mine = typed.map((t) => ({ key: fieldKey(form.fields[t.i] ?? {}), label: (form.fields[t.i] ?? {}).label || (form.fields[t.i] ?? {}).name || '', value: t.value })).filter((x) => x.key);
        for (const x of mine) if (!given.has(x.key)) given.set(x.key, step.label);
        const may = maySend(form);
        if (may.stop) { walked.push({ label: step.label, given: mine, sent: false, stopped: may.stop }); ended = `stopped before sending ${step.label}: ${may.stop}`; break; }
        const sent = await p.send(i, !!form.loose);
        const after = (await p.read()) ?? {};
        const moved = !!sent && (String(after.url ?? '') !== String(facts.url ?? '') || String(after.title ?? '') !== String(facts.title ?? ''));
        walked.push({ label: step.label, given: mine, sent: !!sent, ...(sent?.clicked ? { clicked: sent.clicked } : {}), moved, landed: String(after.url ?? '') || null });
        if (!moved) { ended = `${step.label} did not move on when it was sent${sent?.clicked ? ` ("${sent.clicked}")` : ''}: the values it was given may have been refused`; break; }
      } finally { await p.close?.(); }
    }
    out.push({ name: fl.name, walked, asked, ended });
  }
  return out;
}
