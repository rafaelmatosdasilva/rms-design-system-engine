// behaviour-contract.mjs - part roles and behaviours as contracts, checked in the browser.
//
// A role says what a component is (role-markup.mjs, a11y-check.mjs roleContractExpression). Two things more make it
// work for someone using a keyboard or a screen reader:
//   - its parts: the label that names the control, the error message linked while it shows, the indicator that stays
//     silent because the control already says its state, the + and - of a stepper that each have a name. Specs and
//     Figma's annotations write them as a role on the inner layer ("role: label", "role: errormessage").
//   - its behaviours: what a person can do with it. A toggle flips with Space, a disclosure opens what it controls, a
//     tab takes the selection, a text box takes typing. Written once per role here; a Figma annotation can add one
//     ("Escape closes", "arrow keys move"). Each runs in Chrome on the first instance of the component a page shows.
// A behaviour needs the component's own script, so it is checked on a page that runs it (a11y.urls, --url, Storybook,
// the app), never on the engine's style guide, which draws markup only; there it is listed as not checked.
// An exception is the person's decision with its reason: contract.authored.json → components[name].behaviourExceptions
// { "<behaviour id>": "<why, with a link to the ADR or pull request that decided it>" }. Without a link it does not hold.
//
// Pure: the expressions run in the page; a11y-check.mjs drives them (clicks, keys) over the DevTools Protocol.

// part role → what it owes the control it belongs to.
export const PART_ROLES = {
  label: 'names the control: a <label for> it, the control inside it, or aria-labelledby on the control',
  errormessage: 'is linked to the control while it shows (aria-describedby or aria-errormessage), with aria-invalid="true" on the control',
  description: 'is linked to the control with aria-describedby',
  indicator: 'is silent for screen readers (aria-hidden="true"): the control already says its state',
  increment: 'is a button with a spoken name ("Increase", "Add one")',
  decrement: 'is a button with a spoken name ("Decrease", "Remove one")',
  placeholder: 'is not the control\'s only name: the control has a label too',
  value: 'is exposed by the control (aria-valuenow or aria-valuetext on a spinbutton or slider, or the input\'s own value)',
  panel: 'is named by the control\'s aria-controls, so the control says what it opens',
};
const PART_ALIASES = { error: 'errormessage', errortext: 'errormessage', helper: 'description', helpertext: 'description', hint: 'description', caption: 'description',
  supportingtext: 'description', icon: 'indicator', decoration: 'indicator', checkmark: 'indicator', check: 'indicator', thumb: 'indicator', heart: 'indicator', chevron: 'indicator', stepup: 'increment', plus: 'increment',
  stepdown: 'decrement', minus: 'decrement', content: 'panel', region: 'panel' };
const norm = (w) => String(w ?? '').toLowerCase().replace(/[\s_-]+/g, '');
export const partRoleOf = (word) => { const w = norm(word); const r = PART_ALIASES[w] ?? w; return PART_ROLES[r] ? r : null; };

// The part roles a component's inner layers declare: [{ layer, part }], from the component-props snapshot's
// layerAnnotations ("role: label" on the layer "Label").
export function partRolesOf(entry = {}) {
  const out = [];
  for (const l of entry.layerAnnotations ?? []) {
    for (const a of l.annotations ?? []) {
      const m = /\b(?:part\s*)?role\s*[:=]\s*["'“]?([a-z][\w -]*)/i.exec(String(a?.label ?? a?.labelMarkdown ?? '').replace(/[*_`]/g, ''));
      const part = m && partRoleOf(m[1].trim());
      if (part) { out.push({ layer: l.layer, part }); break; }
    }
  }
  return out;
}

// The part roles a control's layers say by their names when no annotation does ("Label", "Error message", "Helper
// text", "Chevron", "Plus"): the same parts, marked read from the name, so a component nobody annotated still has its
// label tied to its field and its indicator silent. Only for a control (a role is given); a layer named for a part
// twice is taken once. → [{ layer, part, fromName: true }]
const FIELD_ROLES = /^(textbox|textfield|searchbox|combobox|listbox|checkbox|radio|switch|spinbutton|slider)$/i;
export function partsFromNames(layers = [], role = null) {
  if (!role) return [];
  const out = [], seen = new Set();
  for (const layer of layers) {
    const words = String(layer ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const part = partRoleOf(words.join('')) ?? partRoleOf(words.slice(0, 2).join('')) ?? partRoleOf(words[0] ?? '');
    if (!part || part === 'panel' || part === 'value' || seen.has(part)) continue;
    // A "Label" layer of a button, a tab or a link is its own words, which name it: only a field's label is a part.
    if (part === 'label' && !FIELD_ROLES.test(String(role))) continue;
    seen.add(part); out.push({ layer, part, fromName: true });
  }
  return out;
}

// The parts a component's markup shows, by element and class: a <label>, an error, a hint or description, an indicator
// (a check, a chevron), the + and - of a stepper. → [{ part, element }] for the spec Figma is offered.
export function partsInMarkup(markup = '') {
  const out = new Map();
  for (const m of String(markup).matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const [, tag, attrs] = m, cls = (/\bclass(?:Name)?\s*=\s*["']([^"']+)["']/.exec(attrs)?.[1] ?? '').toLowerCase();
    let part = /^label$/i.test(tag) ? 'label' : null;
    for (const c of cls.split(/\s+/)) {
      if (part) break;
      const bits = c.split(/[-_]+/).filter(Boolean);
      for (let k = bits.length; k > 0 && !part; k--) { const r = partRoleOf(bits.slice(-k).join('')); if (r && r !== 'panel' && r !== 'value') part = r; }
    }
    if (part && !out.has(part)) out.set(part, `<${tag}${cls ? ` class="${cls.split(/\s+/)[0]}"` : ''}>`);
  }
  return [...out].map(([part, element]) => ({ part, element }));
}

// role → the behaviours it owes. act: what the check does (click, keys, type); expect: what must change.
export const BEHAVIOURS = {
  // A toggle that a click does not flip is already reported by its role contract: the keys are tried only once a click works.
  togglebutton: [{ id: 'keys-toggle', says: 'Space flips aria-pressed', ifClickWorks: true, sheet: 'a click and Space flip aria-pressed (a native <button> gives Space for free)', act: { keys: [' '] }, expect: 'aria-pressed' }],
  switch: [{ id: 'click-toggle', says: 'a click flips aria-checked', act: { click: true }, expect: 'aria-checked' }, { id: 'keys-toggle', says: 'Space flips it', act: { keys: [' '] }, expect: 'aria-checked' }],
  checkbox: [{ id: 'click-toggle', says: 'a click checks and unchecks it', act: { click: true }, expect: 'checked' }, { id: 'keys-toggle', says: 'Space checks and unchecks it', act: { keys: [' '] }, expect: 'checked' }],
  disclosure: [{ id: 'click-expand', says: 'a click flips aria-expanded and shows or hides the panel it controls', act: { click: true }, expect: 'expanded' }],
  tab: [{ id: 'click-select', says: 'a click selects it: aria-selected="true" on it and on no other tab of its list', act: { click: true }, expect: 'selected' }],
  textbox: [{ id: 'types', says: 'typing writes into it', act: { type: 'a' }, expect: 'value' }],
  spinbutton: [{ id: 'keys-step', says: 'ArrowUp steps it up', sheet: 'ArrowUp and ArrowDown step its value (aria-valuenow), within aria-valuemin and aria-valuemax', act: { keys: ['ArrowUp'] }, expect: 'valuenow' }],
};
const ROLE_ALIASES = { stepper: 'spinbutton', numberinput: 'spinbutton', numberfield: 'spinbutton', counter: 'spinbutton', toggle: 'togglebutton', expander: 'disclosure', accordion: 'disclosure', textinput: 'textbox', input: 'textbox', textfield: 'textbox', textarea: 'textbox', searchbox: 'textbox' };
export const roleKey = (role) => { const r = norm(role); return ROLE_ALIASES[r] ?? r; };

// A behaviour a Figma annotation states, in the words designers write.
const ANNOTATED = [
  { test: /\b(esc|escape)\b[^.;\n]{0,40}\b(clos|dismiss|hide)/i, row: { id: 'escape-closes', says: 'Escape closes it', act: { keys: ['Escape'] }, expect: 'hidden' } },
  { test: /\barrows?\b(\s+keys?)?[^.;\n]{0,40}\b(move|navigat|go|select)/i, row: { id: 'arrows-move', says: 'the arrow keys move between its items', act: { keys: ['ArrowRight', 'ArrowDown'] }, expect: 'focus-moves' } },
  { test: /\b(enter|space)\b[^.;\n]{0,40}\b(activat|press|trigger|select|toggle)/i, row: { id: 'keys-activate', says: 'Enter and Space activate it', act: { keys: ['Enter', ' '] }, expect: 'activates' } },
];
export function annotatedBehaviours(annotations = []) {
  const text = (annotations ?? []).map((a) => String(a?.label ?? a?.labelMarkdown ?? '')).join('\n');
  return ANNOTATED.filter((a) => a.test.test(text)).map((a) => ({ ...a.row, from: 'Figma annotation' }));
}

// Every behaviour a component owes: its role's, then its annotations' (not twice), with the person's exceptions applied.
// Returns { rows, excepted: [{ id, reason }], weak: [{ id, reason }] } (weak: an exception without a link, still checked).
export function behavioursFor(role, annotations = [], exceptions = {}) {
  const rows = [...(BEHAVIOURS[roleKey(role)] ?? []).map((r) => ({ ...r, from: `role ${roleKey(role)}` }))];
  for (const r of annotatedBehaviours(annotations)) if (!rows.some((x) => x.id === r.id || (x.act.keys && r.id === 'keys-activate'))) rows.push(r);
  const excepted = [], weak = [];
  const kept = rows.filter((r) => {
    const reason = exceptions?.[r.id];
    if (!reason) return true;
    if (/https?:\/\/\S+/.test(String(reason))) { excepted.push({ id: r.id, reason: String(reason) }); return false; }
    weak.push({ id: r.id, reason: String(reason) });
    return true;
  });
  return { rows: kept, excepted, weak };
}

// The build sheet's lines for a role's behaviours and a component's parts (build-list.mjs).
export const behaviourSheetLines = (role) => (BEHAVIOURS[roleKey(role)] ?? []).map((r) => r.sheet ?? r.says);
export const partSheetLines = (parts) => parts.map((p) => `the "${p.layer}" part ${PART_ROLES[p.part]}`);

// The parts a component is built with, for its build sheet: Figma's annotated parts, else the ones its layers' names
// say (a control only). layers: every layer name its variants show (the structure snapshot).
export function buildSheetParts(entry = {}, layers = [], role = null) {
  const annotated = partRolesOf(entry);
  return annotated.length ? annotated : partsFromNames(layers, role);
}

// A field's label, error, hint and indicator are read in its own source first (partWiringFindings); every part is
// tried in the browser.
const PART_IN_SOURCE = new Set(['label', 'errormessage', 'description', 'indicator']);
export const partCheckedWhere = (part, role = null) => (PART_IN_SOURCE.has(part) && FIELD_ROLES.test(norm(role)) ? 'read in its source, then tried in the browser' : 'tried in the browser');

// The build sheet's lines for the parts: each with its role, the wiring it owes the control, and where that wiring is
// checked once the component exists; a part read from a layer's name says so.
export const partBuildLines = (parts, role = null) => parts.map((p) =>
  `the "${p.layer}" part (role ${p.part}) ${PART_ROLES[p.part]}. Checked: ${partCheckedWhere(p.part, role)}${p.fromName ? ' (read from the layer\'s name: annotate it in Figma to confirm)' : ''}`);

// ── In the page ──────────────────────────────────────────────────────────────────────────────────────────────────────

// The first usable instance of a component, marked so the steps find it again; its control (the instance, or the first
// control inside it). Returns a description or null when the page shows none.
// role: the component's role; the control tried is the element that carries it (a stepper's spinbutton, not its first
// step button), else the first control inside.
export function markInstanceExpression(selector, mark, role = null) {
  return `(() => {
    const vis = (el) => { const s = getComputedStyle(el); if (s.display==='none'||s.visibility==='hidden') return false; const r = el.getBoundingClientRect(); return r.width>0 && r.height>0; };
    let els; try { els = [...document.querySelectorAll(${JSON.stringify(selector)})]; } catch { return null; }
    const CONTROL = 'input:not([type=hidden]),textarea,select,button,[role=button],[role=switch],[role=checkbox],[role=tab],[role=textbox],[role=spinbutton],[role=slider],a[href]';
    const el = els.find((e) => vis(e) && !e.closest('[disabled],[aria-disabled="true"]') && !e.matches('[disabled],[aria-disabled="true"]'));
    if (!el) return null;
    const own = ${JSON.stringify(role ? `[role="${roleKey(role)}"]${roleKey(role) === 'spinbutton' ? ',input[type=number]' : ''}${roleKey(role) === 'textbox' ? ',input:not([type=hidden]),textarea' : ''}${roleKey(role) === 'checkbox' ? ',input[type=checkbox]' : ''}` : '')};
    const mine = own ? (el.matches(own) ? el : el.querySelector(own)) : null;
    const control = mine || (el.matches(CONTROL) ? el : el.querySelector(CONTROL) || el);
    el.setAttribute('data-dse-behaviour', ${JSON.stringify(mark)});
    control.setAttribute('data-dse-control', ${JSON.stringify(mark)});
    return (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '')).slice(0, 80);
  })()`;
}

// One behaviour in three phases. 'before' records the state (and blocks navigation and submits) and focuses the
// control; the driver then clicks, presses the keys or types; 'after' says what changed: { ok, saw }; 'undo' puts a
// flipped state back (a second click) and lifts the blocks.
export function behaviourExpression(mark, row, phase) {
  return `(() => {
    const w = window, row = ${JSON.stringify(row)}, phase = ${JSON.stringify(phase)};
    const el = document.querySelector('[data-dse-behaviour="${mark}"]'), c = document.querySelector('[data-dse-control="${mark}"]');
    if (!el || !c) return null;
    const vis = (x) => { if (!x || !x.isConnected) return false; const s = getComputedStyle(x); if (s.display==='none'||s.visibility==='hidden'||x.hidden) return false; const r = x.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const panel = () => { const id = (c.getAttribute('aria-controls') || '').split(/\\s+/)[0]; return id ? document.getElementById(id) : null; };
    const state = () => ({ pressed: c.getAttribute('aria-pressed'), checked: c.getAttribute('aria-checked') ?? (('checked' in c) ? String(c.checked) : null),
      expanded: c.getAttribute('aria-expanded'), panel: vis(panel()), selected: c.getAttribute('aria-selected'),
      others: c.closest('[role=tablist]') ? [...c.closest('[role=tablist]').querySelectorAll('[role=tab][aria-selected="true"]')].filter((t) => t !== c).length : 0,
      value: 'value' in c ? String(c.value) : (c.textContent || ''), valuenow: c.getAttribute('aria-valuenow') ?? ('value' in c ? String(c.value) : null), shown: vis(el), focus: document.activeElement });
    if (phase === 'before') {
      w.__dseNav = (e) => { if (e.target && e.target.closest && e.target.closest('a[href]')) e.preventDefault(); };
      w.__dseSubmit = (e) => e.preventDefault();
      w.addEventListener('click', w.__dseNav, true); document.addEventListener('submit', w.__dseSubmit, true);
      w.__dseClicks = 0; w.__dseCount = () => w.__dseClicks++; c.addEventListener('click', w.__dseCount, true);
      if (row.expect === 'focus-moves') { const items = [...el.querySelectorAll('button,a[href],input,[tabindex],[role=option],[role=tab],[role=radio],[role=menuitem]')].filter(vis); (items.find((x) => x.tabIndex >= 0) || items[0] || c).focus(); }
      else c.focus();
      w.__dseWas = state();
      return { focused: document.activeElement === c || el.contains(document.activeElement) };
    }
    const was = w.__dseWas || {}, now = state();
    if (phase === 'after') {
      const flipped = (k) => now[k] != null && now[k] !== was[k];
      let ok = false, saw = '';
      if (row.expect === 'aria-pressed') { ok = flipped('pressed'); saw = 'aria-pressed stayed ' + (now.pressed ?? 'unset'); }
      else if (row.expect === 'aria-checked' || row.expect === 'checked') { ok = flipped('checked'); saw = (row.expect === 'checked' ? 'checked' : 'aria-checked') + ' stayed ' + (now.checked ?? 'unset'); }
      else if (row.expect === 'expanded') { ok = flipped('expanded') && (!panel() || now.panel !== was.panel); saw = !flipped('expanded') ? 'aria-expanded stayed ' + (now.expanded ?? 'unset') : !panel() ? '' : 'the panel it controls did not ' + (was.panel ? 'hide' : 'show'); if (flipped('expanded') && !panel() && !c.getAttribute('aria-controls')) { ok = true; } }
      else if (row.expect === 'selected') { ok = now.selected === 'true' && now.others === 0; saw = now.selected !== 'true' ? 'aria-selected is ' + (now.selected ?? 'unset') : now.others + ' other tab(s) still selected'; }
      else if (row.expect === 'value') { ok = now.value !== was.value; saw = 'its value did not change'; }
      else if (row.expect === 'valuenow') { const max = c.getAttribute('aria-valuemax') ?? c.getAttribute('max'); ok = Number(now.valuenow) > Number(was.valuenow) || (c.tagName === 'INPUT' && c.type === 'number') || (max != null && max !== '' && Number(was.valuenow) >= Number(max)); saw = 'aria-valuenow stayed ' + (now.valuenow ?? 'unset'); }
      else if (row.expect === 'hidden') { ok = !now.shown || c.getAttribute('aria-expanded') === 'false'; saw = 'it is still shown'; }
      else if (row.expect === 'focus-moves') { ok = now.focus !== was.focus && el.contains(now.focus); saw = 'the focus did not move to another of its items'; }
      else if (row.expect === 'activates') { ok = w.__dseClicks > 0 || ['pressed', 'checked', 'expanded', 'selected'].some(flipped); saw = 'nothing happened'; }
      w.__dseFlipped = ok && ['aria-pressed', 'aria-checked', 'checked', 'expanded'].includes(row.expect);
      return { ok, saw: ok ? '' : saw };
    }
    if (phase === 'undo') {
      if (w.__dseFlipped) { try { c.click(); } catch (e) {} }
      if (row.expect === 'value' && 'value' in c) c.value = was.value;
      c.removeEventListener('click', w.__dseCount, true);
      w.removeEventListener('click', w.__dseNav, true); document.removeEventListener('submit', w.__dseSubmit, true);
      return true;
    }
    return null;
  })()`;
}

// What each annotated part owes, on up to 20 instances. partSelector: the contract's cssSelector for the layer, else
// the element whose class carries the layer's name. Returns the problems as short sentences, and { notYet } for a
// label outside the shadow root its control sits in (wiring no browser makes yet, a finding of its own).
export function partRoleExpression(selector, partSelector, layer, part) {
  return `(() => {
    let els; try { els = [...document.querySelectorAll(${JSON.stringify(selector)})].slice(0, 20); } catch { return []; }
    const part = ${JSON.stringify(part)}, layer = ${JSON.stringify(layer)}, psel = ${JSON.stringify(partSelector)};
    const word = layer.toLowerCase().replace(/[^a-z0-9]/g, '');
    const CONTROL = 'input:not([type=hidden]),textarea,select,button,[role=button],[role=switch],[role=checkbox],[role=tab],[role=textbox],[role=spinbutton],[role=slider]';
    const vis = (x) => { const s = getComputedStyle(x); if (s.display==='none'||s.visibility==='hidden'||x.hidden) return false; const r = x.getBoundingClientRect(); return r.width>0 && r.height>0; };
    const ids = (v) => String(v || '').trim().split(/\\s+/).filter(Boolean);
    // A name has a word in it: a lone + or - is read out as a symbol, not as what the button does.
    const named = (x) => /[\\p{L}\\p{N}]/u.test((x.getAttribute('aria-label') || '') + (x.getAttribute('title') || '') + (x.getAttribute('aria-labelledby') ? 'x' : '') + (x.textContent || ''));
    const find = (el) => {
      if (psel) { try { if (el.matches(psel)) return el; const p = el.querySelector(psel); if (p) return p; } catch {} }
      const byClass = [...el.querySelectorAll('[class]')].find((k) => String(k.getAttribute('class')).toLowerCase().split(/[\\s_]+/).some((c) => c.replace(/[^a-z0-9]/g, '').endsWith(word) || c.split('-').pop() === word));
      if (byClass) return byClass;
      // No class names the part: a step button is the control's first (decrement) or last (increment) button, and a
      // value part is the control that carries it, as Figma lays them out.
      const buttons = [...el.querySelectorAll('button,[role=button]')];
      if (part === 'decrement' && buttons.length >= 2) return buttons[0];
      if (part === 'increment' && buttons.length >= 2) return buttons[buttons.length - 1];
      if (part === 'value') return el.querySelector('[role=spinbutton],[role=slider],input:not([type=hidden])');
      return null;
    };
    const out = new Set(), notYet = new Set();
    let seen = 0;
    for (const el of els) {
      const p = find(el);
      if (!p) continue;
      seen++;
      const controls = [...(el.matches(CONTROL) ? [el] : []), ...el.querySelectorAll(CONTROL)].filter((x) => x !== p && !p.contains(x));
      const c = part === 'value' && p.matches(CONTROL) ? p : controls[0];
      const say = (s) => out.add('its "' + layer + '" part (' + part + ') ' + s);
      if (part === 'indicator') {
        const announced = ((p.textContent || '').trim() || (p.tagName === 'IMG' && (p.getAttribute('alt') || '').trim()) || p.getAttribute('role') === 'img');
        if (announced && !p.closest('[aria-hidden="true"]') && !['presentation', 'none'].includes(p.getAttribute('role'))) say('is announced: give it aria-hidden="true", the control already says its state');
        continue;
      }
      if (part === 'increment' || part === 'decrement') {
        const b = p.matches('button,[role=button]') ? p : p.querySelector('button,[role=button]');
        if (!b) say('is not a button');
        else if (!named(b)) say('has no spoken name: add aria-label');
        // It stops at the end of the range: pressed past aria-valuemin (or aria-valuemax), the value stays inside it,
        // or the button turns disabled. Its own element is found again after each press (the page may draw it anew).
        const spinSel = '[role=spinbutton],[role=slider],input[type=number],input[type=range]';
        const spin = el.querySelector(spinSel);
        const lim = spin && (part === 'decrement' ? (spin.getAttribute('aria-valuemin') ?? spin.getAttribute('min')) : (spin.getAttribute('aria-valuemax') ?? spin.getAttribute('max')));
        const now = () => { const sp = el.querySelector(spinSel); return sp ? Number(sp.getAttribute('aria-valuenow') ?? sp.value) : NaN; };
        if (b && lim != null && lim !== '' && Number.isFinite(now())) {
          const index = [...el.querySelectorAll('button,[role=button]')].indexOf(b);
          const start = now(), end = Number(lim);
          for (let i = 0; i < Math.min(60, Math.abs(start - end) + 3); i++) { const k = [...el.querySelectorAll('button,[role=button]')][index]; if (!k || k.disabled || k.getAttribute('aria-disabled') === 'true') break; k.click(); }
          const got = now();
          if (part === 'decrement' ? got < end : got > end) say('goes past the ' + (part === 'decrement' ? 'minimum' : 'maximum') + ': pressed from ' + start + ', the value reached ' + got + ' (aria-' + (part === 'decrement' ? 'valuemin' : 'valuemax') + ' ' + end + '). Stop at it, or disable the button there');
          // Back to where it was, with the other step button, so the checks after this one start from the same value.
          for (let i = 0; i < 60 && now() !== start; i++) { const all = [...el.querySelectorAll('button,[role=button]')]; const o = index === 0 ? all[all.length - 1] : all[0]; if (!o || o === all[index] || o.disabled) break; o.click(); }
        }
        continue;
      }
      // A label whose control sits inside another component's shadow root: an id does not reach into it, so neither
      // for= nor aria-labelledby can tie them, whatever the code writes. Said apart, as wiring no browser makes yet.
      if (part === 'label' && !c) {
        const id = p.getAttribute('for');
        const target = id ? (el.getRootNode().getElementById ? el.getRootNode().getElementById(id) : document.getElementById(id)) : null;
        const hosts = [...(target ? [target] : []), ...el.querySelectorAll('*')].filter((x) => x !== p && !p.contains(x));
        const host = hosts.find((x) => x.shadowRoot && x.shadowRoot.querySelector(CONTROL)) || (target && target.localName.includes('-') && !target.shadowRoot ? target : null);
        if (host) { notYet.add('its "' + layer + '" part (label) is outside <' + host.localName + '>, whose control sits inside its ' + (host.shadowRoot ? '' : 'closed ') + 'shadow root, where an id cannot reach: wiring no browser makes yet'); continue; }
      }
      if (!c) { say('belongs to no control inside the component'); continue; }
      if (part === 'label') {
        const tied = (c.labels && [...c.labels].some((l) => l === p || l.contains(p) || p.contains(l))) || ids(c.getAttribute('aria-labelledby')).some((id) => id === p.id && p.id) || (p.tagName === 'LABEL' && p.contains(c));
        if (!tied) say('is not tied to its control: a <label for>, the control inside it, or aria-labelledby');
      } else if (part === 'description') {
        if (!(p.id && ids(c.getAttribute('aria-describedby')).includes(p.id))) say('is not linked to its control with aria-describedby');
      } else if (part === 'errormessage') {
        if (!vis(p)) continue;
        const linked = p.id && (ids(c.getAttribute('aria-describedby')).includes(p.id) || ids(c.getAttribute('aria-errormessage')).includes(p.id));
        if (!linked) say('shows but is not linked to its control (aria-describedby or aria-errormessage)');
        if (c.getAttribute('aria-invalid') !== 'true') say('shows while its control has no aria-invalid="true"');
      } else if (part === 'placeholder') {
        const label = (c.labels && c.labels.length) || (c.getAttribute('aria-label') || '').trim() || c.getAttribute('aria-labelledby') || (c.getAttribute('title') || '').trim();
        if (!label) say('is the control\\'s only name: give the control a label');
      } else if (part === 'value') {
        const r = c.getAttribute('role');
        if ((r === 'spinbutton' || r === 'slider') && !c.hasAttribute('aria-valuenow') && !c.hasAttribute('aria-valuetext')) say('is not exposed by its ' + r + ' (aria-valuenow or aria-valuetext)');
      } else if (part === 'panel') {
        if (!(p.id && ids(c.getAttribute('aria-controls')).includes(p.id))) say('is not named by its control\\'s aria-controls');
      }
    }
    return seen ? [...out, ...[...notYet].map((s) => ({ notYet: s }))] : ['no instance shows its "' + layer + '" part: not checked'];
  })()`;
}

// ── States follow their props ────────────────────────────────────────────────────────────────────────────────────────
// An option that shows a state (Selected=True, State=Error, Expanded) must also say it to a screen reader: the attribute
// its role names. An option that only changes the look (a class) is heard as nothing. Read from the style guide's
// controls: each option's effect is what the code's selector for it sets (classes and attributes).
const STATE_WORDS = [
  // The step or page a person is on is aria-current, whatever the role (never checked: a current step is not chosen).
  { re: /^(current)$/i, all: ['aria-current'] },
  { re: /^(selected|pressed|active|on|toggled)$/i, by: { togglebutton: ['aria-pressed'], button: ['aria-pressed'], tab: ['aria-selected'], option: ['aria-selected'], switch: ['aria-checked', 'checked'], checkbox: ['aria-checked', 'checked'], radio: ['aria-checked', 'checked'] } },
  { re: /^(checked)$/i, all: ['aria-checked', 'checked'] },
  { re: /^(expanded|open|opened)$/i, all: ['aria-expanded'] },
  // An error on a field is aria-invalid; on a message (a toast, a status) it is announced: role="alert" or aria-live.
  { re: /^(error|invalid)$/i, by: { status: ['role', 'aria-live'], alert: ['role', 'aria-live'], log: ['role', 'aria-live'] }, all: ['aria-invalid'] },
  { re: /^(disabled)$/i, all: ['disabled', 'aria-disabled'] },
];
const stateWord = (s) => String(s ?? '').replace(/^is[\s_-]*/i, '').replace(/[\s_-]+/g, '');
function expectedFor(word, role) {
  const w = STATE_WORDS.find((x) => x.re.test(stateWord(word)));
  if (!w) return null;
  return w.by?.[roleKey(role)] ?? w.all ?? null;
}
// components: [{ name, role, controls: [{ label, type: 'VARIANT' | 'BOOLEAN', options: [{ label, add, attrs }], on: { add, attrs } }] }]
export function stateFindings(components = []) {
  const out = [];
  for (const c of components) {
    for (const ctl of c.controls ?? []) {
      const pairs = ctl.type === 'BOOLEAN' ? [[ctl.label, ctl.on, 'true']] : (ctl.options ?? []).map((o) => [/^(true|on|yes)$/i.test(o.label) ? ctl.label : o.label, o, o.label]);
      for (const [word, effect, value] of pairs) {
        const want = expectedFor(word, c.role);
        if (!want || !effect) continue;
        // What it sets on the component, and on a part it is heard on (heardOn: a field disabled inside its wrapper).
        const attrs = [...Object.keys(effect.attrs ?? {}), ...(effect.also ?? []).flatMap((x) => Object.keys(x.attrs ?? {}))];
        if (!(effect.add ?? []).length && !attrs.length) continue;   // the option changes nothing that is drawn
        if (attrs.some((a) => want.includes(a))) continue;
        // An error the option itself announces (role="alert" or "status", aria-live) is heard, whatever the role is.
        if (/^(error|invalid)$/i.test(stateWord(word)) && (['alert', 'status', 'log'].includes(effect.attrs?.role) || attrs.includes('aria-live'))) continue;
        out.push({ component: c.name, control: ctl.label, value, want, message: `${c.name}: ${ctl.label}=${value} changes how it looks (${(effect.add ?? []).map((k) => `.${k}`).join(' ') || 'its attributes'}) but not what a screen reader hears: set ${want.join(' or ')} with it` });
      }
    }
  }
  return out;
}

// A field's parts wired in its own source, read without a browser (the source check, Gate [15]): its label tied to it
// (for= its id, or wrapping it), an error or a hint shown beside it joined by aria-describedby (an error with
// aria-invalid too), an indicator inside it (a chevron, a check) silent. Only what the source shows for certain: a part
// bound through a prop ({...attrs}, :aria-describedby) counts as joined. → [sentence], what the field still needs.
export function partWiringFindings(source = '', role = null) {
  if (!FIELD_ROLES.test(String(role ?? ''))) return [];
  const tpl = /<template\b[\s\S]*<\/template>/.exec(String(source))?.[0] ?? String(source);
  const control = /<(input|textarea|select)\b([^>]*)>/i.exec(tpl);
  if (!control) return [];
  const attrs = control[2], out = [];
  const bound = (name) => new RegExp(`(?:^|\\s)(?::|v-bind:)?${name}\\s*=`, 'i').test(attrs) || /v-bind\s*=\s*["']\$?attrs|\{\s*\.\.\./.test(attrs);
  const label = /<label\b([^>]*)>([\s\S]*?)<\/label>/i.exec(tpl);
  if (label && !/(?:^|\s)(?::|v-bind:)?for\s*=/.test(label[1]) && !/<(input|textarea|select)\b/i.test(label[2])) out.push('its <label> tied to it (for= the field\'s id, or wrapping the field)');
  const classes = [...tpl.matchAll(/\bclass\s*=\s*["']([^"']+)["']/g)].flatMap((m) => m[1].toLowerCase().split(/\s+/));
  const has = (re) => classes.some((c) => re.test(c));
  if (has(/error/) && !(bound('aria-describedby') || bound('aria-errormessage'))) out.push('its error message joined with aria-describedby (or aria-errormessage) while it shows');
  if (has(/error/) && !bound('aria-invalid')) out.push('aria-invalid="true" while its error shows');
  if (has(/helper|hint|description/) && !bound('aria-describedby')) out.push('its hint joined with aria-describedby');
  const indicator = [...tpl.matchAll(/<([a-z][\w-]*)\b([^>]*\bclass\s*=\s*["'][^"']*(?:chevron|checkmark|arrow)[^"']*["'][^>]*)>/gi)];
  if (indicator.some((m) => !/aria-hidden/.test(m[2]))) out.push('its indicator (a chevron, a check) silent for screen readers (aria-hidden="true")');
  return out;
}

// A field's label written outside another component that holds the field in its shadow root (<label for="q"> and
// <acme-input id="q">): an id does not reach into a shadow root, so no browser ties them yet, whatever is written. Said
// apart from what the field needs, as wiring no browser makes yet. → [sentence]
export function partWiringNotYet(source = '', role = null) {
  if (!FIELD_ROLES.test(String(role ?? ''))) return [];
  const tpl = /<template\b[\s\S]*<\/template>/.exec(String(source))?.[0] ?? String(source);
  if (/<(input|textarea|select)\b/i.test(tpl)) return [];
  const out = [];
  const valueOf = (attrs, names) => new RegExp(`(?:^|\\s)(?::|v-bind:)?(?:${names})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{([^}]*)\\})`, 'i').exec(attrs)?.slice(1).find((x) => x != null)?.trim();
  for (const m of tpl.matchAll(/<label\b([^>]*)>/gi)) {
    const id = valueOf(m[1], 'for|htmlFor');
    if (!id) continue;
    const host = [...tpl.matchAll(/<([a-z][\w]*-[\w-]*)\b([^>]*)>/gi)].find((h) => valueOf(h[2], 'id') === id);
    if (host) out.push(`its <label> is outside <${host[1]}>, whose field sits inside its shadow root, where an id cannot reach: wiring no browser makes yet`);
  }
  return out;
}
