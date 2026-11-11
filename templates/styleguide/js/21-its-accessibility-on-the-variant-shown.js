  // ── Its accessibility on the variant shown, tried on the live component: what Tab reaches and in what order, whether
  // each stop shows its focus (a change at least 3:1 against what is around it), a name on each control, and each
  // behaviour its role and Figma's notes ask for. Keys go in as the page's own events: one only a native element
  // answers (Space on a <button>) is given by the browser and said so.
  var FOCUSABLE = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable=""], [contenteditable="true"]';
  var INTERACTIVE = /^(button|link|checkbox|radio|switch|tab|menuitem|menuitemcheckbox|menuitemradio|option|slider|spinbutton|textbox|combobox|searchbox|treeitem)$/;
  function shown(el) { var cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || el.closest('[hidden]')) return false; var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
  function tabStops(root) {
    var all = [root].concat(Array.prototype.slice.call(root.querySelectorAll(FOCUSABLE))).filter(function (el) { return el.matches(FOCUSABLE) && !el.disabled && el.tabIndex >= 0 && shown(el) && !el.closest('[inert]'); });
    // A radio group is one stop: its checked radio, else its first.
    var groups = {};
    all = all.filter(function (el) {
      if (el.type !== 'radio' || !el.name) return true;
      var g = groups[el.name] || (groups[el.name] = all.filter(function (x) { return x.type === 'radio' && x.name === el.name; }));
      return el === (g.find(function (x) { return x.checked; }) || g[0]);
    });
    return all.filter(function (e) { return e.tabIndex > 0; }).sort(function (a, b) { return a.tabIndex - b.tabIndex; }).concat(all.filter(function (e) { return e.tabIndex === 0; }));
  }
  // What answers a click and Tab never reaches: a control by what it does as well as by its role, read as the full check
  // reads it (a11y-check.mjs). A click handler where a framework keeps it (an onclick, React's props, Vue's invokers),
  // else the pointer cursor the page gives it (the outermost, since the cursor is inherited). A part of a control, one
  // around its own control, one with a control's role and one shown disabled are not.
  function unreachedClicks(root, stops) {
    var handles = function (el) { return typeof el.onclick === 'function' || el.hasAttribute('onclick') || Object.keys(el).some(function (k) { return (k.indexOf('__reactProps$') === 0 && el[k] && (el[k].onClick || el[k].onMouseDown || el[k].onPointerDown)) || (k === '_vei' && el[k] && (el[k].onClick || el[k].onMousedown || el[k].onPointerdown)); }); };
    var points = function (el) { return getComputedStyle(el).cursor === 'pointer' && !(el !== root && el.parentElement && root.contains(el.parentElement) && getComputedStyle(el.parentElement).cursor === 'pointer'); };
    return [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).filter(function (el) {
      return stops.indexOf(el) < 0 && shown(el) && !el.closest('[disabled], [aria-disabled="true"]') && !el.matches(FOCUSABLE) && !el.querySelector(FOCUSABLE) && !(el.parentElement && el.parentElement.closest(FOCUSABLE)) && !INTERACTIVE.test(el.getAttribute('role') || '') && (handles(el) || points(el));
    });
  }
  // Its accessible name, as a screen reader reads it (the common cases): a label, its words, an icon's title.
  function textName(el) {
    var out = '';
    Array.prototype.forEach.call(el.childNodes, function (k) {
      if (k.nodeType === 3) out += k.textContent;
      else if (k.nodeType === 1 && k.getAttribute('aria-hidden') !== 'true' && !k.hidden) {
        if (k.tagName === 'IMG') out += ' ' + (k.getAttribute('alt') || '');
        else if (k.getAttribute('aria-label')) out += ' ' + k.getAttribute('aria-label');
        else if (k.tagName.toLowerCase() === 'svg') { var t = k.querySelector('title'); out += ' ' + (t ? t.textContent : ''); }
        else out += ' ' + textName(k);
      }
    });
    return out.replace(/\s+/g, ' ').trim();
  }
  function accName(el) {
    var by = (el.getAttribute('aria-labelledby') || '').trim();
    if (by) { var t = by.split(/\s+/).map(function (id) { var n = document.getElementById(id); return n ? n.textContent : ''; }).join(' ').trim(); if (t) return t; }
    if ((el.getAttribute('aria-label') || '').trim()) return el.getAttribute('aria-label').trim();
    if (el.labels && el.labels.length) { var l = Array.prototype.map.call(el.labels, function (x) { return textName(x); }).join(' ').trim(); if (l) return l; }
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return /^(button|submit|reset)$/.test(el.type) ? el.value : (el.getAttribute('title') || '').trim();   // a placeholder is not a name
    return textName(el) || (el.getAttribute('title') || '').trim();
  }
  function who(el) { var n = accName(el); return n ? '"' + n.slice(0, 40) + '"' : el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : ''); }
  function ratioOf(a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); }
  // Its focus: what changes when it takes the focus from the keyboard, and how strongly that change stands out.
  var LOOK = ['outlineStyle', 'outlineWidth', 'outlineColor', 'boxShadow', 'borderTopColor', 'borderBottomColor', 'backgroundColor', 'color', 'textDecorationLine'];
  // Where a focus can show: on it, on a box that holds it (:focus-within), or on what follows it (a hidden native input
  // whose drawn box comes next: input:focus-visible + .box). An element no one sees (at no opacity, a pixel wide) is not
  // where a person sees it.
  function seenBox(el) { var cs = getComputedStyle(el), r = el.getBoundingClientRect(); return cs.visibility !== 'hidden' && +cs.opacity > 0 && r.width > 2 && r.height > 2; }
  function focusLook(el, root) {
    var spots = [el];
    for (var up = el.parentElement; up && root.contains(up); up = up.parentElement) spots.push(up);
    for (var nx = el.nextElementSibling; nx && spots.length < 24; nx = nx.nextElementSibling) spots = spots.concat([nx], Array.prototype.slice.call(nx.querySelectorAll('*'), 0, 4));
    spots = spots.filter(seenBox);
    // Read at rest and focused, never mid-way: a transition would still show the old colour.
    var kept = spots.map(function (n) { var t = n.style.getPropertyValue('transition'), p = n.style.getPropertyPriority('transition'); n.style.setProperty('transition', 'none', 'important'); return [t, p]; });
    var restore = function () { spots.forEach(function (n, i) { if (kept[i][0]) n.style.setProperty('transition', kept[i][0], kept[i][1]); else n.style.removeProperty('transition'); }); };
    // Each one as itself and as its ::before and ::after, where a ring is often drawn (one shown only while focused too).
    var PSEUDO = ['', '::before', '::after'];
    var read = function () { return spots.map(function (n) { return PSEUDO.map(function (ps) { var cs = getComputedStyle(n, ps || null), o = {}; if (ps && /^(none|normal)$/.test(cs.content)) return null; LOOK.forEach(function (k) { o[k] = cs[k]; }); return o; }); }); };
    var was = read();
    el.focus({ focusVisible: true, preventScroll: true });
    if (document.activeElement !== el) { restore(); return null; }
    var now = read(), changed = false, best = 0;
    el.blur(); restore();
    spots.forEach(function (n, i) { PSEUDO.forEach(function (ps, j) {
      var a = was[i][j] || {}, b = now[i][j], around = behind(ps ? n : n.parentElement || n);
      if (!b || !LOOK.some(function (k) { return a[k] !== b[k]; })) return;
      changed = true;
      var drawn = b.outlineStyle !== 'none' && parseFloat(b.outlineWidth) > 0;
      if (drawn && (b.outlineStyle !== a.outlineStyle || b.outlineWidth !== a.outlineWidth || b.outlineColor !== a.outlineColor)) { var oc = rgba(b.outlineColor); if (oc) best = Math.max(best, ratioOf(over(oc, around), around)); }
      if (b.boxShadow !== a.boxShadow && b.boxShadow !== 'none') { var m = /rgba?\([^)]*\)/.exec(b.boxShadow), sc = m && rgba(m[0]); if (sc) best = Math.max(best, ratioOf(over(sc, around), around)); }
      ['borderTopColor', 'backgroundColor', 'color'].forEach(function (k) { if (a[k] === b[k]) return; var x = rgba(a[k]), y = rgba(b[k]); if (x && y) best = Math.max(best, ratioOf(over(y, around), over(x, around))); });
    }); });
    return { changed: changed, ratio: best };
  }
  // A behaviour tried: its control set up, the act done, then what changed.
  function tryBehaviour(root, row, roleKey) {
    var own = roleKey ? '[role="' + roleKey + '"]' + (roleKey === 'spinbutton' ? ',input[type=number]' : '') + (roleKey === 'textbox' ? ',input:not([type=hidden]),textarea' : '') + (roleKey === 'checkbox' ? ',input[type=checkbox]' : '') : '';
    var CONTROL = 'input:not([type=hidden]),textarea,select,button,[role=button],[role=switch],[role=checkbox],[role=tab],[role=textbox],[role=spinbutton],[role=slider],a[href]';
    var ctl = (own && (root.matches(own) ? root : root.querySelector(own))) || (root.matches(CONTROL) ? root : root.querySelector(CONTROL)) || root;
    var tag = ctl.tagName, native = (tag === 'BUTTON' || (tag === 'INPUT' && /^(button|submit|reset|checkbox|radio)$/.test(ctl.type))) ? 'click' : (tag === 'INPUT' || tag === 'TEXTAREA') ? 'type' : '';
    if (row.act.keys && native === 'click' && row.act.keys.every(function (k) { return k === ' ' || k === 'Enter'; })) return { given: 'a native <' + tag.toLowerCase() + '> answers ' + (row.act.keys[0] === ' ' ? 'Space' : 'Enter') + ' itself' };
    if (row.act.type && native === 'type') return { given: 'a native text field takes typing itself' };
    if (row.act.keys && native === 'type' && row.expect === 'valuenow' && ctl.type === 'number') return { given: 'a native number field steps with the arrow keys itself' };
    var panel = function () { var id = (ctl.getAttribute('aria-controls') || '').split(/\s+/)[0]; return id ? document.getElementById(id) : null; };
    var st = function () { return { pressed: ctl.getAttribute('aria-pressed'), checked: ctl.getAttribute('aria-checked') || ('checked' in ctl ? String(ctl.checked) : null), expanded: ctl.getAttribute('aria-expanded'), panel: !!(panel() && shown(panel())), selected: ctl.getAttribute('aria-selected'), valuenow: ctl.getAttribute('aria-valuenow') || ('value' in ctl ? String(ctl.value) : null), value: 'value' in ctl ? String(ctl.value) : '', shown: shown(root), focus: document.activeElement }; };
    var clicks = 0, count = function () { clicks++; }, stop = function (e) { if (e.target.closest && e.target.closest('a[href]')) e.preventDefault(); };
    ctl.addEventListener('click', count, true); window.addEventListener('click', stop, true);
    if (row.expect === 'focus-moves') { var items = Array.prototype.filter.call(root.querySelectorAll('button,a[href],input,[tabindex],[role=option],[role=tab],[role=radio],[role=menuitem]'), shown); (items.find(function (x) { return x.tabIndex >= 0; }) || items[0] || ctl).focus({ preventScroll: true }); }
    else ctl.focus({ preventScroll: true });
    var was = st(), at = document.activeElement || ctl;
    if (row.act.click) ctl.click();
    (row.act.keys || []).forEach(function (k) { ['keydown', 'keyup'].forEach(function (t) { at.dispatchEvent(new KeyboardEvent(t, { key: k, code: k === ' ' ? 'Space' : k, bubbles: true, cancelable: true })); }); });
    if (row.act.type) { ctl.value = (ctl.value || '') + row.act.type; ctl.dispatchEvent(new Event('input', { bubbles: true })); }
    var now = st(), flip = function (k) { return now[k] != null && now[k] !== was[k]; }, ok = false, saw = '';
    if (row.expect === 'aria-pressed') { ok = flip('pressed'); saw = 'aria-pressed stayed ' + (now.pressed || 'unset'); }
    else if (row.expect === 'aria-checked' || row.expect === 'checked') { ok = flip('checked'); saw = 'it stayed ' + (now.checked === 'true' ? 'checked' : 'unchecked'); }
    else if (row.expect === 'expanded') { ok = flip('expanded') && (!panel() || now.panel !== was.panel); saw = flip('expanded') ? 'the panel it controls did not change' : 'aria-expanded stayed ' + (now.expanded || 'unset'); }
    else if (row.expect === 'selected') { ok = now.selected === 'true'; saw = 'aria-selected is ' + (now.selected || 'unset'); }
    else if (row.expect === 'value') { ok = now.value !== was.value; saw = 'its value did not change'; }
    else if (row.expect === 'valuenow') { ok = Number(now.valuenow) > Number(was.valuenow); saw = 'its value stayed ' + (now.valuenow || 'unset'); }
    else if (row.expect === 'hidden') { ok = !now.shown || ctl.getAttribute('aria-expanded') === 'false'; saw = 'it is still shown'; }
    else if (row.expect === 'focus-moves') { ok = now.focus !== was.focus && root.contains(now.focus); saw = 'the focus stayed where it was'; }
    else if (row.expect === 'activates') { ok = clicks > 0 || ['pressed', 'checked', 'expanded', 'selected'].some(flip); saw = 'nothing happened'; }
    ctl.removeEventListener('click', count, true); window.removeEventListener('click', stop, true);
    return { ok: ok, saw: saw };
  }
  function liveA11yHTML(root, a) {
    var line = function (ok, text, wcag) { return a11yRow(ok ? 'done' : 'todo', 'In the browser', esc(text), wcag, FROM_PAGE); };
    var out = [], stops = tabStops(root), had = document.activeElement;
    liveA11yHTML.keys = [];
    var interactive = [root].concat(Array.prototype.slice.call(root.querySelectorAll('[role]'))).filter(function (el) { return INTERACTIVE.test(el.getAttribute('role') || '') && shown(el); });
    var wants = a && a.key && INTERACTIVE.test(a.key);
    var unreached = unreachedClicks(root, stops);
    // Disabled as set: Tab passes it by, as it should, and its behaviours are not tried.
    var offAll = !stops.length && [root].concat(Array.prototype.slice.call(root.querySelectorAll('input, button, select, textarea, [aria-disabled="true"]'))).some(function (el) { return el.disabled || el.getAttribute('aria-disabled') === 'true'; });
    if (offAll) return line(true, 'It is disabled as set, so Tab passes it by and a screen reader says it is unavailable.', 'WCAG 4.1.2 Name, Role, Value (A)');
    if (stops.length) out.push(line(true, 'Tab reaches ' + (stops.length === 1 ? 'it once: ' : stops.length + ' stops in this order: ') + stops.map(function (s, i) { return (stops.length > 1 ? (i + 1) + ' ' : '') + who(s); }).join(', ') + '.', 'WCAG 2.1.1 Keyboard (A)'));
    else if (wants || interactive.length || unreached.length) out.push(line(false, 'Tab never reaches it, so it cannot be used without a mouse.' + (!wants && !interactive.length ? ' It answers a click, and has no role and no tab stop.' : ''), 'WCAG 2.1.1 Keyboard (A)'));
    else out.push(a11yRow('none', 'In the browser', 'Nothing in it takes the focus, and as drawn nothing in it needs to.', 'WCAG 2.1.1 Keyboard (A)', FROM_PAGE));
    interactive.filter(function (el) { return stops.indexOf(el) < 0 && !el.closest('[disabled], [aria-disabled="true"]') && !(el.type === 'radio' && el.name); }).forEach(function (el) { out.push(line(false, who(el) + ' acts as a ' + el.getAttribute('role') + ' but Tab does not reach it.', 'WCAG 2.1.1 Keyboard (A)')); });
    if (stops.length) unreached.filter(function (el) { return interactive.indexOf(el) < 0; }).forEach(function (el) { out.push(line(false, who(el) + ' answers a click but Tab does not reach it.', 'WCAG 2.1.1 Keyboard (A)')); });
    stops.filter(function (el) { return el.tabIndex > 0; }).forEach(function (el) { out.push(line(false, who(el) + ' sets its own place in the Tab order (tabindex="' + el.tabIndex + '"), ahead of the page.', 'WCAG 2.4.3 Focus Order (A)')); });
    // Drawn as disabled (its class says so) while Tab still reaches it: a screen reader offers a control that does nothing.
    var looksOff = function (el) { for (var n = el; n && (n === root || root.contains(n)); n = n.parentElement) if (/(^|[-_\s])(is-)?disabled\b/i.test(typeof n.className === 'string' ? n.className : '')) return true; return false; };
    stops = stops.filter(function (el) {
      if (!looksOff(el)) return true;
      out.push(line(false, who(el) + ' is drawn as disabled, but Tab still reaches it. Set disabled on the control itself (or aria-disabled="true").', 'WCAG 4.1.2 Name, Role, Value (A)'));
      return false;
    });
    stops.forEach(function (el) {
      if (!/[\p{L}\p{N}]/u.test(accName(el))) out.push(line(false, who(el) + ' has no name a screen reader can read' + (accName(el) ? ' (only "' + accName(el) + '")' : '') + '. Give it words, an aria-label or a label.', 'WCAG 4.1.2 Name, Role, Value (A)'));
      var f = focusLook(el, root);
      if (!f) return;
      if (!f.changed) out.push(line(false, who(el) + ' shows no change when it takes the focus.', 'WCAG 2.4.7 Focus Visible (AA)'));
      else if (f.ratio && f.ratio < 3) out.push(line(false, 'The focus on ' + who(el) + ' stands out ' + (Math.floor(f.ratio * 10) / 10).toFixed(1) + ':1 from what is around it, needs 3:1.', 'WCAG 1.4.11 Non-text Contrast (AA)'));
    });
    if (stops.length && !out.some(function (h) { return /Focus Visible|Non-text|Name, Role/.test(h); })) out.push(line(true, (stops.length === 1 ? 'It shows its focus' : 'Each stop shows its focus') + ' and has a name.', 'WCAG 2.4.7 Focus Visible (AA)'));
    ((a && a.behaviours) || []).forEach(function (row) {
      var r = tryBehaviour(root, row, a.key);
      // The keys that did what its role asks, pressed here (or a native control's own): its contract says them.
      if (row.act.keys && (r.ok || r.given)) row.act.keys.forEach(function (k) { liveA11yHTML.keys.push(k === ' ' ? 'Space' : k); });
      out.push(r.given ? a11yRow('done', 'In the browser', 'Given by the browser: ' + esc(row.says) + ' (' + esc(r.given) + ').', row.act.keys ? 'WCAG 2.1.1 Keyboard (A)' : 'WCAG 4.1.2 Name, Role, Value (A)', FROM_PAGE) : line(r.ok, row.says.replace(/^\w/, function (ch) { return ch.toUpperCase(); }) + (r.ok ? '.' : ', but ' + r.saw + '.'), row.act.keys ? 'WCAG 2.1.1 Keyboard (A)' : 'WCAG 4.1.2 Name, Role, Value (A)'));
    });
    if (had && had.focus && document.activeElement !== had) had.focus({ preventScroll: true, focusVisible: false });
    return out.join('');
  }

