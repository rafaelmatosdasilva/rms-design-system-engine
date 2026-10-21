// wcag-page.js - the WCAG 2.1 A and AA checks that run in the page, on one component's root element.
//
// Plain browser code with no imports: the audit's Chrome injects it (a11y-check.mjs), the style guide carries it in
// its page (styleguide-gen.mjs) and runs it on every variant. Two calls, on window.__wcag21:
//   check(root, opts)    → { findings: [{ kind, sc, desc }], ran: [kind], spoken: [{ desc, role, name, says }] }
//                          what the markup and the CSS show, and what a screen reader says on each control
//   interact(root, opts) → Promise of { findings, ran }    what it does when used (hover, focus, input, press, keys)
// `ran` names each check that had something to look at (a component with no link never runs the link check), so a
// criterion with nothing failing is said to be met only where it was tried. `desc` locates the element as the audit
// does (tag#id.class), so a finding names the component it sits in. opts: { name } (the component's name, for the
// status-message check), { wait } (ms a hover or focus is given to show its content, 300 by default), { triggers } (how many
// elements the hover check tries, 10 by default), { keys } (true where the component's own script is on the page: its
// keys are pressed; drawn as markup alone, nothing would answer them), { skip } (key checks the caller makes itself with real keys: 'arrows', 'escape',
// 'focusreturn', 'modalescape').
(function (g) {
  'use strict';
  var FOCUSABLE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex],[contenteditable=""],[contenteditable=true]';
  var CONTROL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio],[role=option],[role=combobox],[role=textbox],[role=searchbox],[role=slider],[role=spinbutton],[tabindex]:not([tabindex="-1"])';
  var ROLES = ('alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary ' +
    'contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img image insertion link list ' +
    'listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph ' +
    'presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status ' +
    'strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem').split(' ').concat(
    // The roles of the ARIA modules for digital publishing (doc-*) and graphics (graphics-*), valid on the web too.
    ('doc-abstract doc-acknowledgments doc-afterword doc-appendix doc-backlink doc-biblioentry doc-bibliography doc-biblioref doc-chapter doc-colophon ' +
    'doc-conclusion doc-cover doc-credit doc-credits doc-dedication doc-endnote doc-endnotes doc-epigraph doc-epilogue doc-errata doc-example doc-footnote ' +
    'doc-foreword doc-glossary doc-glossref doc-index doc-introduction doc-noteref doc-notice doc-pagebreak doc-pagefooter doc-pageheader doc-pagelist ' +
    'doc-part doc-preface doc-prologue doc-pullquote doc-qna doc-subtitle doc-tip doc-toc graphics-document graphics-object graphics-symbol').split(' '));
  var ARIA = ('activedescendant atomic autocomplete braillelabel brailleroledescription busy checked colcount colindex colindextext colspan controls current ' +
    'describedby description details disabled dropeffect errormessage expanded flowto grabbed haspopup hidden invalid keyshortcuts label labelledby ' +
    'level live modal multiline multiselectable orientation owns placeholder posinset pressed readonly relevant required roledescription rowcount ' +
    'rowindex rowindextext rowspan selected setsize sort valuemax valuemin valuenow valuetext').split(' ');
  var BOOL = { atomic: 1, busy: 1, disabled: 1, expanded: 1, hidden: 1, modal: 1, multiline: 1, multiselectable: 1, readonly: 1, required: 1, selected: 1 };
  var TRI = { checked: 1, pressed: 1 };
  // The values an enumerated ARIA attribute takes.
  var TOKEN_VALUES = { live: 'off polite assertive', current: 'page step location date time true false', haspopup: 'false true menu listbox tree grid dialog',
    sort: 'ascending descending none other', orientation: 'horizontal vertical undefined', autocomplete: 'inline list both none', relevant: 'additions removals text all' };
  // The states a role must carry (ARIA 1.2, required states and properties), when the role is written on an element that
  // does not give them natively (a <input type=checkbox> carries its checked state; a <div role=checkbox> must say it).
  var REQUIRED = { checkbox: ['checked'], radio: ['checked'], switch: ['checked'], menuitemcheckbox: ['checked'], menuitemradio: ['checked'],
    slider: ['valuenow'], scrollbar: ['valuenow', 'controls'], combobox: ['expanded'], heading: ['level'], meter: ['valuenow'] };
  var NATIVE = { checkbox: 'input[type=checkbox]', radio: 'input[type=radio]', switch: 'input[type=checkbox]', slider: 'input[type=range]',
    combobox: 'select,input:not([type])[list],input[type=text][list],input[type=search][list]', heading: 'h1,h2,h3,h4,h5,h6', meter: 'meter' };
  var IDREFS = ['labelledby', 'describedby', 'controls', 'owns', 'activedescendant', 'errormessage', 'details', 'flowto'];
  // A role that has to sit inside another (WCAG 1.3.1, ARIA's required context).
  var CONTEXT = { tab: '[role=tablist]', option: '[role=listbox],[role=group],[role=combobox],select,datalist', menuitem: '[role=menu],[role=menubar],[role=group]',
    menuitemcheckbox: '[role=menu],[role=menubar],[role=group]', menuitemradio: '[role=menu],[role=menubar],[role=group]', treeitem: '[role=tree],[role=group]',
    row: 'table,[role=table],[role=grid],[role=treegrid],[role=rowgroup]', cell: '[role=row],tr', gridcell: '[role=row],tr', columnheader: '[role=row],tr', rowheader: '[role=row],tr', listitem: '[role=list],ul,ol,menu' };
  // A field asking for something about the person (WCAG 1.3.5) and the autocomplete token it needs.
  var PURPOSE = [[/e-?mail/i, 'email'], [/phone|mobile|\btel\b/i, 'tel'], [/first.?name|given.?name|forename/i, 'given-name'], [/last.?name|family.?name|surname/i, 'family-name'],
    [/full.?name|your.?name|^name$/i, 'name'], [/user.?name|login/i, 'username'], [/new.?password/i, 'new-password'], [/password/i, 'current-password'],
    [/street|address.?line|^address/i, 'street-address'], [/postal|post.?code|zip/i, 'postal-code'], [/\bcity\b|town/i, 'address-level2'], [/country/i, 'country-name'],
    [/organi[sz]ation|company/i, 'organization'], [/birth|bday|date.?of.?birth/i, 'bday'], [/credit.?card|card.?number/i, 'cc-number']];
  var TOKENS = ('name honorific-prefix given-name additional-name family-name honorific-suffix nickname username new-password current-password one-time-code ' +
    'organization-title organization street-address address-line1 address-line2 address-line3 address-level4 address-level3 address-level2 address-level1 ' +
    'country country-name postal-code cc-name cc-given-name cc-additional-name cc-family-name cc-number cc-exp cc-exp-month cc-exp-year cc-csc cc-type ' +
    'transaction-currency transaction-amount language bday bday-day bday-month bday-year sex url photo tel tel-country-code tel-national tel-area-code ' +
    'tel-local tel-extension email impp').split(' ');
  var VAGUE = /^(click here|here|more|read more|learn more|see more|link|this|go|details|continue|info)$/i;
  var STATUSY = /toast|snack|notif|alert|banner|status|message|feedback|loader|loading|spinner|progress|saving|saved/i;
  var LIVE = '[role=status],[role=alert],[role=log],[role=marquee],[role=timer],[role=progressbar],[aria-live]:not([aria-live=off]),output';
  var LOADING = '[role=progressbar],[role=status],[aria-busy=true]';

  function vis(el) {
    var s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
    for (var p = el; p && p !== document.documentElement; p = p.parentElement) { if (p.hidden || getComputedStyle(p).display === 'none') return false; }
    var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  }
  function desc(el) { return (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).join('.') : '')).slice(0, 80); }
  function scope(root) { return [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))); }
  function text(el) {
    var out = '';
    (function walk(n) {
      if (n.nodeType === 3) { out += n.textContent; return; }
      if (n.nodeType !== 1 || n.getAttribute('aria-hidden') === 'true') return;
      var s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden') return;
      if (n.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(n.type)) out += ' ' + n.value + ' ';
      for (var i = 0; i < n.childNodes.length; i++) walk(n.childNodes[i]);
      if (/^(DIV|P|LI|BR|H[1-6])$/.test(n.tagName)) out += ' ';
    })(el);
    return out.replace(/\s+/g, ' ').trim();
  }
  function byIds(ids) { return String(ids || '').split(/\s+/).filter(Boolean).map(function (i) { return document.getElementById(i); }); }
  function labelled(el) {
    if (el.getAttribute('aria-labelledby')) return byIds(el.getAttribute('aria-labelledby')).filter(Boolean).map(function (n) { return n.textContent; }).join(' ').replace(/\s+/g, ' ').trim();
    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
    return null;
  }
  function name(el) {
    var n = labelled(el); if (n) return n;
    if (el.labels && el.labels.length) return Array.prototype.map.call(el.labels, function (l) { return text(l); }).join(' ').trim();
    if (el.tagName === 'IMG' || (el.tagName === 'INPUT' && el.type === 'image')) return (el.getAttribute('alt') || '').trim();
    var t = text(el); if (t) return t;
    var img = el.querySelector('img[alt]'); if (img) return img.getAttribute('alt').trim();
    var st = el.querySelector('svg title'); if (st) return st.textContent.trim();
    return (el.getAttribute('title') || '').trim();
  }
  var norm = function (s) { return String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); };

  // ── Colour, for a control's boundary (WCAG 1.4.11) ──
  var paint = null;
  function rgba(s) {
    var m = String(s).match(/rgba?\(([^)]+)\)/);
    if (m) { var p = m[1].split(/[ ,/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
    // Chrome keeps oklch(), lab() and color() as written: the browser paints one pixel of it and that pixel is read.
    var fn = String(s).match(/(?:oklch|oklab|lab|lch|color|hsla?|hwb)\([^)]*\)/); if (!fn) return null;
    try {
      if (!paint) { var cv = document.createElement('canvas'); cv.width = cv.height = 1; paint = cv.getContext('2d', { willReadFrequently: true }); }
      paint.clearRect(0, 0, 1, 1); paint.fillStyle = '#000'; paint.fillStyle = fn[0]; paint.fillRect(0, 0, 1, 1);
      var d = paint.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: Math.round(d[3] / 255 * 1000) / 1000 };
    } catch (e) { return null; }
  }
  function over(f, b) { return { r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 }; }
  function behind(el) {
    var layers = [];
    for (var p = el; p; p = p.parentElement) { var c = rgba(getComputedStyle(p).backgroundColor); if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; } }
    var bg = { r: 255, g: 255, b: 255, a: 1 };
    for (var i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  }
  function lum(c) { var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  // What draws a control's edge: the element itself, or (a native box drawn hidden) the box its label shows.
  function edgeOf(el) {
    var s = getComputedStyle(el);
    var hiddenNative = el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type) && (+s.opacity === 0 || s.appearance === 'none' && el.getBoundingClientRect().width < 2 || s.clipPath !== 'none' || el.getBoundingClientRect().width < 2);
    if (!hiddenNative) return el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type) && s.appearance !== 'none' ? null : el;   // a native box the browser draws: its own edge
    var host = (el.labels && el.labels[0]) || el.parentElement; if (!host) return null;
    var best = null, bw = 0;
    Array.prototype.forEach.call(host.querySelectorAll('*'), function (n) {
      if (n === el || !vis(n)) return;
      var r = n.getBoundingClientRect(); if (r.width > 40 || r.height > 40 || r.width < 6) return;
      var ns = getComputedStyle(n), w = Math.max(parseFloat(ns.borderTopWidth) || 0, parseFloat(ns.borderLeftWidth) || 0);
      var fill = rgba(ns.backgroundColor);
      if (w > bw || (!best && fill && fill.a > 0)) { best = n; bw = w; }
    });
    return best;
  }
  function boundary(el) {
    var s = getComputedStyle(el), bg = behind(el.parentElement || el), own = rgba(s.backgroundColor), best = 0;
    ['Top', 'Right', 'Bottom', 'Left'].forEach(function (side) {
      if ((parseFloat(s['border' + side + 'Width']) || 0) < 1 || s['border' + side + 'Style'] === 'none') return;
      var c = rgba(s['border' + side + 'Color']); if (!c || c.a === 0) return;
      best = Math.max(best, ratio(over(c, bg), bg));
    });
    if (own && own.a > 0) best = Math.max(best, ratio(over(own, bg), bg));
    var sh = s.boxShadow && s.boxShadow !== 'none' ? rgba(s.boxShadow) : null;
    if (sh && sh.a > 0) best = Math.max(best, ratio(over(sh, bg), bg));
    return best;
  }

  // 1.4.11 Non-text contrast: the edge of a field, a checkbox, a radio or a switch stands out 3:1 from what is around it.
  function edgeCheck(root, all, shown, push, seen) {
    shown.concat(all.filter(function (el) { return el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type); })).forEach(function (el) {
      var field = (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|image|range|color|file|hidden)$/i.test(el.type)) || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA' || /^(textbox|searchbox|combobox)$/.test(el.getAttribute('role') || '');
      var box = el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type) || /^(checkbox|radio|switch)$/.test(el.getAttribute('role') || '');
      if (!field && !box || el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      var edge = field ? el : edgeOf(el); if (!edge || !vis(edge)) return;
      // A field drawn inside a wrapper that carries its edge (an input in a bordered wrapper): the wrapper's edge is the one seen.
      if (field && edge.parentElement && edge.parentElement !== root.parentElement) { var w = edge.parentElement; if (w.getBoundingClientRect().height <= edge.getBoundingClientRect().height + 16 && boundary(w) > boundary(edge)) edge = w; }
      seen('boundary');
      var r = boundary(edge);
      // No edge drawn at all (a field shown as plain text) asks nothing of 1.4.11; an edge drawn too faint does.
      if (r > 0 && r < 3) push('boundary', '1.4.11', edge, 'its edge stands out ' + (Math.floor(r * 10) / 10).toFixed(1) + ':1 from what is around it, needs 3:1');
    });
  }

  function check(root, opts) {
    opts = opts || {};
    var out = [], ran = {}, all = scope(root).filter(function (el) { return el.nodeType === 1; });
    var push = function (kind, sc, el, why) { out.push({ kind: kind, sc: sc, desc: (el ? desc(el) : '') + (why ? ' (' + why + ')' : '') }); };
    var seen = function (kind) { ran[kind] = 1; };
    var shown = all.filter(vis);

    // 1.1.1 Non-text content: an image with no alt, an image button with no alt, a role=img with no name.
    shown.forEach(function (el) {
      if (el.tagName === 'IMG') { seen('textalt'); if (!el.hasAttribute('alt')) push('textalt', '1.1.1', el, 'no alt'); else if (/\.(png|jpe?g|gif|svg|webp)$/i.test(el.getAttribute('alt'))) push('textalt', '1.1.1', el, 'its alt is a file name'); }
      else if (el.tagName === 'INPUT' && el.type === 'image') { seen('textalt'); if (!(el.getAttribute('alt') || labelled(el))) push('textalt', '1.1.1', el, 'an image button with no alt'); }
      else if (el.getAttribute('role') === 'img') { seen('textalt'); if (!labelled(el) && !el.querySelector('title')) push('textalt', '1.1.1', el, 'role="img" with no name'); }
    });

    // 1.2.2 Captions and 1.4.2 Audio control: a video with no captions track; sound that starts by itself.
    shown.forEach(function (el) {
      if (!/^(VIDEO|AUDIO)$/.test(el.tagName)) return;
      seen('media');
      if (el.tagName === 'VIDEO' && !el.querySelector('track[kind=captions],track[kind=subtitles]')) push('captions', '1.2.2', el, 'no captions track');
      if (el.autoplay && !el.muted) push('autoaudio', '1.4.2', el, 'plays sound by itself');
    });

    // 1.3.1 Info and relationships: groups of choices named as a group, tables with headers, roles in the context they need.
    var radios = shown.filter(function (el) { return (el.tagName === 'INPUT' && el.type === 'radio') || el.getAttribute('role') === 'radio'; });
    var groups = {};
    radios.forEach(function (r) { var k = r.name || (r.parentElement && desc(r.parentElement)); (groups[k] = groups[k] || []).push(r); });
    Object.keys(groups).forEach(function (k) {
      var list = groups[k]; if (list.length < 2) return;
      seen('group');
      var holder = list[0].closest('fieldset,[role=radiogroup],[role=group]');
      var named = holder && (holder.tagName === 'FIELDSET' ? !!(holder.querySelector('legend') && text(holder.querySelector('legend'))) || !!labelled(holder) : !!labelled(holder));
      if (!named) push('group', '1.3.1', list[0].closest('[class]') || list[0], 'radio buttons with no group named around them (a fieldset with a legend, or role="radiogroup" with aria-label)');
    });
    shown.forEach(function (el) {
      var role = el.getAttribute('role');
      if ((role === 'radiogroup' || role === 'group' && el.querySelector('input,[role=radio],[role=checkbox]')) ) { seen('group'); if (!labelled(el)) push('group', '1.3.1', el, 'role="' + role + '" with no name'); }
      if (el.tagName === 'TABLE' && el.querySelectorAll('td').length > 1) { seen('table'); if (!el.querySelector('th,[role=columnheader],[role=rowheader]')) push('table', '1.3.1', el, 'a data table with no header cells'); }
      if (role && CONTEXT[role]) { seen('context'); if (!el.parentElement || !el.parentElement.closest(CONTEXT[role])) push('context', '1.3.1', el, 'role="' + role + '" outside ' + CONTEXT[role].split(',')[0]); }
      if (el.tagName === 'LI') { seen('context'); if (!el.parentElement || !/^(UL|OL|MENU)$/.test(el.parentElement.tagName) && !el.parentElement.closest('[role=list]')) push('context', '1.3.1', el, '<li> outside a list'); }
    });

    // 1.3.2 Meaningful sequence and 2.4.3 Focus order: what Tab reaches comes in the order it is seen.
    var stops = shown.filter(function (el) { return el.matches(FOCUSABLE) && el.tabIndex >= 0 && !el.disabled; });
    if (stops.length > 1) {
      seen('order');
      var rtl = getComputedStyle(root).direction === 'rtl';
      for (var i = 1; i < stops.length; i++) {
        var a = stops[i - 1].getBoundingClientRect(), b = stops[i].getBoundingClientRect();
        var row = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) / 2;
        var back = row ? (rtl ? b.left > a.left + 4 : b.right < a.left + 4 && b.left < a.left - 4) : b.bottom <= a.top;
        if (back && !stops[i].contains(stops[i - 1]) && !stops[i - 1].contains(stops[i])) { push('order', '2.4.3', stops[i], 'Tab reaches it after ' + desc(stops[i - 1]) + ', which is shown after it'); break; }
      }
    }

    // 1.3.5 Identify input purpose: a field asking about the person says what it asks for (autocomplete).
    shown.forEach(function (el) {
      if (!(el.tagName === 'INPUT' && /^(text|email|tel|password|url|)$/i.test(el.getAttribute('type') || '') || el.tagName === 'SELECT')) return;
      var hint = [el.name, el.id, el.getAttribute('placeholder'), name(el), el.type === 'email' ? 'email' : '', el.type === 'tel' ? 'phone' : ''].join(' ');
      var hit = PURPOSE.filter(function (p) { return p[0].test(hint); })[0]; if (!hit) return;
      seen('autocomplete');
      var ac = (el.getAttribute('autocomplete') || '').trim().toLowerCase().split(/\s+/).pop();
      if (TOKENS.indexOf(ac) < 0) push('autocomplete', '1.3.5', el, 'asks for ' + hit[1] + ' with ' + (ac ? 'autocomplete="' + ac + '"' : 'no autocomplete') + ', needs autocomplete="' + hit[1] + '"');
    });

    edgeCheck(root, all, shown, push, seen);

    // 2.2.2 Pause, stop, hide and 2.3.1 Three flashes: what moves by itself for more than 5 seconds, what flashes.
    var secs = function (v) { return Math.max.apply(null, [0].concat(String(v).split(',').map(function (x) { x = x.trim(); return (x.slice(-2) === 'ms' ? parseFloat(x) / 1000 : parseFloat(x)) || 0; }))); };
    shown.forEach(function (el) {
      var s = getComputedStyle(el); if (s.animationName === 'none') return;
      var d = secs(s.animationDuration), n = s.animationIterationCount === 'infinite' ? Infinity : Math.max.apply(null, String(s.animationIterationCount).split(',').map(parseFloat));
      if (!(d > 0)) return;
      seen('moving');
      var loading = el.closest(LOADING) || STATUSY.test((typeof el.className === 'string' ? el.className : '') + ' ' + (el.parentElement && typeof el.parentElement.className === 'string' ? el.parentElement.className : ''));
      // A loading indicator that turns fast is a spinner, not a flash: only one inside role=progressbar or role=status is let go.
      if (n === Infinity && d < 0.34 && !el.closest(LOADING)) push('flash', '2.3.1', el, 'repeats ' + Math.round(1 / d) + ' times a second');
      if (d * n > 5 && !loading && s.animationPlayState !== 'paused') push('pause', '2.2.2', el, 'moves for more than 5 seconds with no way to stop it');
    });

    // 2.4.4 Link purpose: a link says where it goes.
    shown.forEach(function (el) {
      if (!el.matches('a[href],[role=link]')) return;
      seen('link');
      var n = name(el);
      if (!n) push('link', '2.4.4', el, 'no words');
      else if (VAGUE.test(n.trim()) && !el.getAttribute('aria-describedby')) push('link', '2.4.4', el, '"' + n.trim() + '" says nothing about where it goes');
    });

    // 3.3.2 Labels or instructions: a field's placeholder is not its label (it goes once typing starts, and is often faint).
    shown.forEach(function (el) {
      if (!el.matches('input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=image]):not([type=range]):not([type=color]),textarea') || !el.getAttribute('placeholder')) return;
      seen('placeholderlabel');
      if (!labelled(el) && !(el.labels && el.labels.length && text(el.labels[0])) && !(el.getAttribute('title') || '').trim()) push('placeholderlabel', '3.3.2', el, 'named only by its placeholder "' + el.getAttribute('placeholder').slice(0, 30) + '", which goes once typing starts');
    });

    // 2.4.6 Headings and labels: none is empty.
    shown.forEach(function (el) {
      if (/^H[1-6]$/.test(el.tagName) || el.getAttribute('role') === 'heading') { seen('emptylabel'); if (!text(el) && !labelled(el)) push('emptylabel', '2.4.6', el, 'an empty heading'); }
      if (el.tagName === 'LABEL' || el.tagName === 'LEGEND') { seen('emptylabel'); if (!text(el) && !el.querySelector('input,select,textarea')) push('emptylabel', '2.4.6', el, 'an empty ' + el.tagName.toLowerCase()); }
    });

    // 2.5.3 Label in name: the words on a control are in the name a screen reader and voice control use.
    shown.forEach(function (el) {
      if (!el.matches(CONTROL)) return;
      var given = labelled(el); if (!given) return;
      var shownWords = norm(text(el)); if (!shownWords || shownWords.length < 2) return;
      seen('labelname');
      if (norm(given).indexOf(shownWords) < 0) push('labelname', '2.5.3', el, 'shows "' + text(el).slice(0, 30) + '" but is named "' + given.slice(0, 30) + '"');
    });

    // 4.1.1 Parsing and 4.1.2 Name, role, value: ids once, roles and ARIA that exist, references that resolve, values ARIA allows.
    var twice = {};
    all.forEach(function (el) {
      if (el.id) { seen('aria'); if (!twice[el.id] && document.querySelectorAll('[id="' + el.id.replace(/"/g, '\\"') + '"]').length > 1) { twice[el.id] = 1; push('dupid', '4.1.1', el, 'id="' + el.id + '" is used more than once'); } }
      var role = el.getAttribute('role');
      if (role) {
        seen('aria');
        var roles = role.split(/\s+/).filter(Boolean);
        roles.forEach(function (r) { if (ROLES.indexOf(r) < 0) push('aria', '4.1.2', el, 'role="' + r + '" is not an ARIA role'); });
        // The first role ARIA knows is the one used: a screen reader cannot tell its state when a required one is missing.
        var used = roles.filter(function (r) { return ROLES.indexOf(r) >= 0; })[0];
        if (used && REQUIRED[used] && !(NATIVE[used] && el.matches(NATIVE[used]))) {
          var missing = REQUIRED[used].filter(function (k) { return !el.hasAttribute('aria-' + k); });
          if (missing.length) push('aria', '4.1.2', el, 'role="' + used + '" without ' + missing.map(function (k) { return 'aria-' + k; }).join(' and '));
        }
      }
      Array.prototype.forEach.call(el.attributes, function (at) {
        if (at.name.indexOf('aria-') !== 0) return;
        seen('aria');
        var k = at.name.slice(5), v = at.value.trim();
        if (ARIA.indexOf(k) < 0) { push('aria', '4.1.2', el, at.name + ' is not an ARIA attribute'); return; }
        if (BOOL[k] && !/^(true|false|undefined)$/.test(v)) push('aria', '4.1.2', el, at.name + '="' + v + '" takes true or false');
        if (TRI[k] && !/^(true|false|mixed|undefined)$/.test(v)) push('aria', '4.1.2', el, at.name + '="' + v + '" takes true, false or mixed');
        if (k === 'invalid' && !/^(true|false|grammar|spelling)$/.test(v)) push('aria', '4.1.2', el, at.name + '="' + v + '" takes true, false, grammar or spelling');
        if (TOKEN_VALUES[k] && (k === 'relevant' ? v.split(/\s+/) : [v]).some(function (t) { return TOKEN_VALUES[k].split(' ').indexOf(t) < 0; })) push('aria', '4.1.2', el, at.name + '="' + v + '" takes ' + TOKEN_VALUES[k].split(' ').join(', '));
        if (IDREFS.indexOf(k) >= 0 && v && byIds(v).some(function (n) { return !n; })) push('aria', '4.1.2', el, at.name + ' points to an id that is not on the page');
      });
      if (el.getAttribute('aria-hidden') === 'true') {
        seen('aria');
        var f = el.matches(FOCUSABLE) && el.tabIndex >= 0 && !el.disabled ? el : Array.prototype.filter.call(el.querySelectorAll(FOCUSABLE), function (n) { return n.tabIndex >= 0 && !n.disabled && vis(n); })[0];
        if (f) push('aria', '4.1.2', f, 'aria-hidden="true" on something Tab reaches');
      }
    });

    // 2.5.7 Dragging movements: something moved by dragging (draggable, a grab or move cursor) in a component that has no
    // other control to do it with one click or tap. A slider's track takes a click, and a part inside the dragged one is it.
    shown.forEach(function (el) {
      var cur = getComputedStyle(el).cursor, drag = el.getAttribute('draggable') === 'true';
      if (!drag && !/^(grab|grabbing|move)$/.test(cur)) return;
      if (el.closest('input[type=range],[role=slider],[role=scrollbar]') || el.parentElement && (el.parentElement.closest('[draggable=true]') || !drag && getComputedStyle(el.parentElement).cursor === cur)) return;
      seen('dragging');
      // The other way to do it sits beside it or in it (a list's move buttons, an item's menu), not anywhere on the page.
      var others = scope(el.parentElement && root.contains(el.parentElement) ? el.parentElement : root).filter(function (n) { return n.nodeType === 1 && n !== el && !n.contains(el) && n.matches(CONTROL) && vis(n); });
      if (!others.length) push('dragging', '2.5.7', el, (drag ? 'draggable' : 'a ' + cur + ' cursor') + ', with no button or click that does the same');
    });

    // 3.3.8 Accessible authentication: a password field lets a password manager fill it (paste is tried when it is used).
    shown.forEach(function (el) {
      if (!el.matches('input[type=password],input[autocomplete=one-time-code]')) return;
      seen('auth');
      if ((el.getAttribute('autocomplete') || '').trim().toLowerCase() === 'off') push('authfill', '3.3.8', el, 'autocomplete="off" on a password field');
    });

    // 4.1.2 A link with nowhere to go (href="#", javascript:) that a script turns into an action: it is announced as a link,
    // and Space does nothing on it.
    shown.forEach(function (el) {
      if (!el.matches('a[href="#"],a[href^="javascript:"]') || el.getAttribute('role')) return;
      seen('link');
      push('fakelink', '4.1.2', el, 'href="' + el.getAttribute('href').slice(0, 24) + '" goes nowhere, so it acts as a button');
    });

    // 4.1.3 Status messages: a message, a toast or a loader is announced without taking focus.
    var statusy = function (el) { return STATUSY.test((typeof el.className === 'string' ? el.className : '') + ' ' + (el.id || '')) || el === root && STATUSY.test(opts.name || ''); };
    var cands = shown.filter(function (el) { return statusy(el) && !el.matches(CONTROL) && !el.closest('button,a,[role=dialog],[role=alertdialog]') && (text(el) || el.getAttribute('aria-label')); });
    cands = cands.filter(function (el) { return !cands.some(function (o) { return o !== el && o.contains(el); }); });
    cands.forEach(function (el) {
      seen('status');
      if (!el.matches(LIVE) && !el.closest(LIVE) && !el.querySelector(LIVE)) push('status', '4.1.3', el, 'a message a screen reader is not told about (role="status", role="alert" or aria-live)');
    });

    // What a screen reader says on each control: its name, its role, its state ("Save, button, pressed"). A name that
    // says nothing ("icon", "button", a file or an icon's name), or says the role a second time ("Close button, button"),
    // fails 2.4.6; two links with the same words going to different places fail 2.4.4.
    var spoken = [], said = {};
    shown.filter(function (el) { return el.matches(CONTROL) || el.tagName === 'IMG' || el.getAttribute('role') === 'img'; }).forEach(function (el) {
      var r = roleOf(el); if (!r) return;
      var n = name(el), says = announce(el, r, n);
      spoken.push({ desc: desc(el), role: r, name: n, says: says });
      if (!n) return;
      seen('weakname');
      var w = weak(n, r);
      if (w) push('weakname', '2.4.6', el, 'a screen reader says "' + says.slice(0, 60) + '": ' + w);
      if (r === 'link' && el.getAttribute('href')) { seen('samename'); var k = norm(n); (said[k] = said[k] || []).push(el); }
    });
    Object.keys(said).forEach(function (k) {
      var list = said[k], to = list.map(function (a) { return a.href; });
      if (to.filter(function (h, i) { return to.indexOf(h) === i; }).length > 1) push('samename', '2.4.4', list[1], list.length + ' links say "' + name(list[0]).slice(0, 30) + '" and go to different places');
    });

    return { findings: out, ran: Object.keys(ran), spoken: spoken };
  }

  // ── What a screen reader says ──
  var IMPLICIT = { A: function (el) { return el.hasAttribute('href') ? 'link' : ''; }, BUTTON: 'button', SUMMARY: 'button', TEXTAREA: 'textbox', IMG: function (el) { return el.getAttribute('alt') === '' ? '' : 'img'; },
    SELECT: function (el) { return el.multiple || el.size > 1 ? 'listbox' : 'combobox'; }, H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading',
    INPUT: function (el) { var t = (el.type || 'text').toLowerCase(), by = { checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: el.list ? 'combobox' : 'searchbox', button: 'button', submit: 'button', reset: 'button', image: 'button', hidden: '' }; return t in by ? by[t] : el.list ? 'combobox' : 'textbox'; } };
  function roleOf(el) {
    var r = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
    if (r && r !== 'none' && r !== 'presentation') return r;
    var i = IMPLICIT[el.tagName]; return typeof i === 'function' ? i(el) : i || (el.matches(FOCUSABLE) && el.tabIndex >= 0 ? 'generic' : '');
  }
  // The words for each role and state, as screen readers say them (NVDA and VoiceOver say much the same).
  var SAY_ROLE = { img: 'image', textbox: 'edit text', searchbox: 'search field', combobox: 'combo box', listbox: 'list box', menuitem: 'menu item', menuitemcheckbox: 'menu item checkbox',
    menuitemradio: 'menu item radio', spinbutton: 'stepper', radio: 'radio button', option: 'option', generic: 'group' };
  function announce(el, r, n) {
    var a = function (k) { return el.getAttribute('aria-' + k); }, parts = [n || '(no name)', SAY_ROLE[r] || r];
    if (r === 'heading') parts[1] = 'heading level ' + (a('level') || (el.tagName.match(/^H(\d)$/) || [])[1] || 2);
    var checked = a('checked') != null ? a('checked') : el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type) ? String(el.indeterminate ? 'mixed' : el.checked) : null;
    if (checked != null) parts.push(checked === 'mixed' ? 'mixed' : checked === 'true' ? (r === 'switch' ? 'on' : 'checked') : (r === 'switch' ? 'off' : 'not checked'));
    if (a('pressed') === 'true') parts.push('pressed'); else if (a('pressed') === 'false') parts.push('not pressed');
    if (a('expanded') === 'true') parts.push('expanded'); else if (a('expanded') === 'false') parts.push('collapsed');
    if (a('selected') === 'true') parts.push('selected');
    if (a('current') && a('current') !== 'false') parts.push('current' + (a('current') === 'true' ? '' : ' ' + a('current')));
    if (/^(true|menu|listbox|dialog|tree|grid)$/.test(a('haspopup') || '') && r !== 'combobox') parts.push('has popup');
    if (el.required || a('required') === 'true') parts.push('required');
    if (a('invalid') && a('invalid') !== 'false') parts.push('invalid entry');
    if (el.disabled || a('disabled') === 'true') parts.push('dimmed');
    if (r === 'slider' || r === 'spinbutton') { var v = a('valuetext') || a('valuenow') || el.value; if (v) parts.splice(1, 0, v); }
    var more = byIds(a('describedby')).filter(Boolean).map(function (d) { return d.textContent; }).join(' ').replace(/\s+/g, ' ').trim();
    return parts.join(', ') + (more ? '. ' + more : '');
  }
  // A name that tells nothing of what the control does: a placeholder word, a role, a file or an icon's own name.
  var GENERIC = /^(icon|image|img|picture|photo|graphic|svg|logo|button|btn|link|click|tap|press|label|text|title|untitled|placeholder|item|element|component|control|field|input|lorem ipsum.*|x|\W)$/i;
  var ROLE_WORD = { button: /\bbutton$/i, link: /\blink$/i, checkbox: /\bcheck ?box$/i, radio: /\bradio( button)?$/i, switch: /\b(toggle|switch)$/i, tab: /\btab$/i, img: /\b(image|icon|picture)$/i, menuitem: /\bmenu item$/i };
  function weak(n, r) {
    var t = n.trim();
    if (GENERIC.test(t)) return 'the name says nothing of what it is for';
    if (/\.(svg|png|jpe?g|gif|webp)$/i.test(t)) return 'the name is a file name';
    if (/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(t) || /^(ic|icon|svg)[-_ ]/i.test(t)) return 'the name is an icon\'s or a file\'s name ("' + t.slice(0, 24) + '"), not what it does';
    // A short name ending with its role ("Close button"); a sentence that happens to end so ("A card around its link") is not.
    var words = t.split(/\s+/).length;
    if (!ROLE_WORD[r] || !ROLE_WORD[r].test(t) || words > 3) return '';
    return words > 1 ? 'the role is said twice (the name ends with "' + t.match(ROLE_WORD[r])[0].trim() + '")' : 'the name is only its role';
  }

  // ── What it does when used ──
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var fire = function (el, type, init) {
    var E = /^pointer/.test(type) && g.PointerEvent ? PointerEvent : /^(mouse|click)/.test(type) ? MouseEvent : /^key/.test(type) ? KeyboardEvent : /^focus|^blur/.test(type) ? FocusEvent : Event;
    var o = { bubbles: !/^(mouseenter|mouseleave|pointerenter|pointerleave|focus|blur)$/.test(type), cancelable: true, view: g, button: 0 };
    for (var k in init || {}) o[k] = init[k];
    el.dispatchEvent(new E(type, o));
  };
  var showing = function () { return Array.prototype.filter.call(document.body.querySelectorAll('*'), vis); };
  // What appeared covers or replaces something that showed before (1.4.13 asks Escape only of that): it lies over another
  // element, or one that showed is gone. A button that appears in the room it makes (a row's action on hover) covers nothing.
  var covers = function (pop, before) {
    var r = pop.getBoundingClientRect();
    return before.some(function (n) {
      if (n === pop || n.contains(pop) || pop.contains(n)) return false;
      if (!n.isConnected || !vis(n)) return true;
      var q = n.getBoundingClientRect();
      return q.width > 0 && q.height > 0 && r.left < q.right - 1 && q.left < r.right - 1 && r.top < q.bottom - 1 && q.top < r.bottom - 1;
    });
  };
  // Another page: the path changed, a page was pushed on the history, or a window opened. A page that only writes its
  // own state into its address (replaceState, a query or a hash, as the style guide does for the props) has not moved.
  var nav = { pushed: 0, opened: 0 };
  function page() { return location.pathname + '|' + nav.pushed + '|' + nav.opened; }
  function state(root) {
    return [page(), document.querySelectorAll('dialog[open],[role=dialog],[role=alertdialog],[aria-modal=true]').length,
      // A tooltip shown or hidden is not the page acting: a tip closes when anything is pressed, as it should (1.4.13).
      scope(root).filter(function (el) { return !(el.nodeType === 1 && el.closest && el.closest('[role=tooltip]')); }).map(function (el) { return el.nodeType === 1 ? [el.getAttribute('aria-pressed'), el.getAttribute('aria-checked'), el.getAttribute('aria-expanded'), el.getAttribute('aria-selected'), el.checked, el.className].join() : ''; }).join('|'),
      root.isConnected].join('§');
  }

  function interact(root, opts) {
    opts = opts || {};
    var wait = opts.wait || 300, out = [], ran = {};
    var push = function (kind, sc, el, why) { out.push({ kind: kind, sc: sc, desc: desc(el) + (why ? ' (' + why + ')' : '') }); };
    // A native radio or checkbox drawn hidden behind its own look still takes the focus and the value: its label shows it.
    var seenOn = function (el) { return vis(el) || !!(el.labels && el.labels[0] && vis(el.labels[0])); };
    var controls = scope(root).filter(function (el) { return el.nodeType === 1 && el.matches(CONTROL) && seenOn(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; }).slice(0, 24);
    var keep = document.activeElement;
    // A person who takes the focus somewhere else on the page while this runs (a click on a filter, the Brand choice)
    // stops it: what it was trying is left untried, never half-measured, and the focus stays where they put it.
    var hurt = null, INTERRUPTED = { interrupted: true };
    // `own` is set while a key check moves the focus itself (a menu drawn at the end of the page takes it).
    var own = false;
    var watch = function (e) { if (!own && e.target && e.target !== document.body && !root.contains(e.target) && !(e.target.closest && e.target.closest('.pg-offstage'))) hurt = e.target; };
    document.addEventListener('focusin', watch, true);
    var nap = function (ms) { return sleep(ms).then(function () { if (hurt) throw INTERRUPTED; }); };
    var stopSubmit = function (e) { e.preventDefault(); submitted = true; };
    var realOpen = window.open, realPush = history.pushState;
    window.open = function () { nav.opened++; return null; };
    history.pushState = function () { nav.pushed++; return realPush.apply(history, arguments); };
    var submitted = false;
    document.addEventListener('submit', stopSubmit, true);
    return (async function () {
      // 1.4.13 Content on hover or focus: what appears can be closed with Escape, stays while the pointer moves onto it,
      // and stays until the person moves away.
      var cand = scope(root).filter(function (el) { return el.nodeType === 1 && vis(el); });
      var triggers = cand.filter(function (el) { return el.hasAttribute('data-tip') || el.hasAttribute('aria-describedby') || el.hasAttribute('data-tooltip'); })
        .concat(cand.filter(function (el) { return el.matches(CONTROL) && !el.hasAttribute('data-tip') && !el.hasAttribute('aria-describedby'); })).slice(0, opts.triggers || 10);
      for (var t = 0; t < triggers.length; t++) {
        var el = triggers[t];
        var on = function () { fire(el, 'pointerover'); fire(el, 'pointerenter'); fire(el, 'mouseover'); fire(el, 'mouseenter'); if (el.matches(FOCUSABLE)) el.focus({ preventScroll: true }); };
        var offEl = function (to) { fire(el, 'pointerout', { relatedTarget: to || null }); fire(el, 'pointerleave', { relatedTarget: to || null }); fire(el, 'mouseout', { relatedTarget: to || null }); fire(el, 'mouseleave', { relatedTarget: to || null }); };
        // What shows when it is hovered or focused: the outermost element that was not showing before. A trigger that says
        // it has a tip (data-tip, aria-describedby) is given longer, as a tooltip often waits a second before it shows.
        var patient = el.hasAttribute('data-tip') || el.hasAttribute('aria-describedby') || el.hasAttribute('data-tooltip');
        var before = [];
        var appear = async function () {
          before = showing(); var until = Date.now() + (patient ? Math.max(wait, 1600) : wait), found = null;
          on();
          while (!found && Date.now() < until) {
            await nap(50);
            // The trigger drawn again (the page redrew itself on the hover or the focus): nothing popped up from it.
            if (!el.isConnected) return null;
            // What a page draws for itself and hides from assistive technology (a guide's overlay) is not content shown.
            var fresh = showing().filter(function (n) { return before.indexOf(n) < 0 && !el.contains(n) && !n.contains(el) && !n.closest('[aria-hidden="true"]'); });
            found = fresh.filter(function (n) { return !fresh.some(function (o) { return o !== n && o.contains(n); }); })[0] || null;
          }
          return found;
        };
        var leave = async function () { offEl(null); if (document.activeElement === el) el.blur(); await nap(wait); };
        var pop = await appear();
        if (pop) {
          ran.hovercontent = 1;
          fire(document.activeElement || document.body, 'keydown', { key: 'Escape', code: 'Escape' }); fire(document, 'keydown', { key: 'Escape', code: 'Escape' });
          // Given time to fade out (a transition of a few tenths of a second) before it is said to stay. A fade it started
          // is taken to its end at once: in a page the browser does not draw (one of several tried at a time), a
          // transition never moves on, and a tip that closed would read as one still shown.
          for (var tEsc = 0; tEsc < 12 && pop.isConnected && vis(pop); tEsc++) {
            if (pop.getAnimations) pop.getAnimations().forEach(function (a) { try { a.finish(); } catch (e) { /* an endless one is left */ } });
            if (vis(pop)) await nap(50);
          }
          if (pop.isConnected && vis(pop) && covers(pop, before)) push('hovercontent', '1.4.13', el, 'what it shows (' + desc(pop) + ') does not close with Escape');
          await leave();
          pop = await appear();
          if (pop) {
            offEl(pop); fire(pop, 'pointerover'); fire(pop, 'pointerenter'); fire(pop, 'mouseover'); fire(pop, 'mouseenter');
            await nap(Math.max(150, wait));
            if (!(pop.isConnected && vis(pop))) push('hovercontent', '1.4.13', el, 'what it shows (' + desc(pop) + ') goes away when the pointer moves onto it');
            fire(pop, 'mouseleave'); fire(pop, 'pointerleave');
          }
          await leave();
          pop = await appear();
          if (pop) { await nap(1500); if (!(pop.isConnected && vis(pop))) push('hovercontent', '1.4.13', el, 'what it shows (' + desc(pop) + ') goes away on its own'); }
        }
        await leave();
      }
      // 3.2.1 On focus: taking the focus changes nothing else (no new page, no dialog, the focus stays).
      for (var i = 0; i < controls.length; i++) {
        var c = controls[i]; ran.onfocus = 1;
        var href = page(), dialogs = document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true]').length;
        c.focus({ preventScroll: true }); await nap(40);
        var moved = document.activeElement !== c && !c.contains(document.activeElement) && document.activeElement !== document.body;
        if (page() !== href || moved || document.querySelectorAll('dialog[open],[role=dialog],[aria-modal=true]').length > dialogs)
          push('onfocus', '3.2.1', c, page() !== href ? 'taking the focus opens another page' : moved ? 'taking the focus moves it to ' + desc(document.activeElement) : 'taking the focus opens a dialog');
        c.blur();
      }
      // 3.2.2 On input: changing a value changes nothing else (no page, no form sent, the focus stays).
      var fields = scope(root).filter(function (el) { return el.nodeType === 1 && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(button|submit|reset|image|hidden|file)$/i.test(el.type) && seenOn(el) && !el.disabled && !el.readOnly; }).slice(0, 6);
      for (var f = 0; f < fields.length; f++) {
        var x = fields[f]; ran.oninput = 1;
        var href2 = page(); submitted = false;
        x.focus({ preventScroll: true });
        var was = x.type === 'checkbox' || x.type === 'radio' ? x.checked : x.tagName === 'SELECT' ? x.selectedIndex : x.value;
        if (x.type === 'checkbox' || x.type === 'radio') x.checked = !x.checked;
        else if (x.tagName === 'SELECT') { if (x.options.length < 2) continue; x.selectedIndex = (x.selectedIndex + 1) % x.options.length; }
        else x.value = String(x.value || '') + '1';
        fire(x, 'input'); fire(x, 'change'); await nap(60);
        var gone = document.activeElement !== x && document.activeElement !== document.body && !x.contains(document.activeElement);
        if (page() !== href2 || submitted || gone) push('oninput', '3.2.2', x, page() !== href2 ? 'changing it opens another page' : submitted ? 'changing it sends the form' : 'changing it moves the focus to ' + desc(document.activeElement));
        if (x.type === 'checkbox' || x.type === 'radio') x.checked = was; else if (x.tagName === 'SELECT') x.selectedIndex = was; else x.value = was;
        fire(x, 'input'); fire(x, 'change'); x.blur();
      }
      // 3.3.8 Accessible authentication: a password or a one-time code can be pasted (a password manager, a copied code).
      var secrets = scope(root).filter(function (el) { return el.nodeType === 1 && el.matches('input[type=password],input[autocomplete=one-time-code]') && seenOn(el) && !el.disabled && !el.readOnly; }).slice(0, 4);
      for (var q = 0; q < secrets.length; q++) {
        ran.auth = 1;
        var ev;
        try { var dt = new DataTransfer(); dt.setData('text/plain', 'x'); ev = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }); } catch (e) { ev = new Event('paste', { bubbles: true, cancelable: true }); }
        secrets[q].dispatchEvent(ev);
        if (ev.defaultPrevented) push('authpaste', '3.3.8', secrets[q], 'it cancels a paste');
      }
      // 2.5.2 Pointer cancellation: pressing a control does nothing until it is released, so sliding off cancels it.
      // A handle that is dragged (a splitter, a resize grip) acts on the press by nature and is left out.
      var press = controls.filter(function (el) { var s = getComputedStyle(el); return !/resize|move|grab/.test(s.cursor) && el.getAttribute('role') !== 'separator' && !/resize|drag|handle|splitter|grip/i.test(typeof el.className === 'string' ? el.className : '') && !/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName); });
      for (var p = 0; p < press.length; p++) {
        var b = press[p]; ran.pointerdown = 1;
        // A press on nothing first closes what an earlier step left open (a menu or a tip that closes on any press
        // outside it), and a page still changing by itself is let settle: only what the press itself changes counts.
        fire(document.body, 'pointerdown'); fire(document.body, 'mousedown'); fire(document.body, 'pointerup'); fire(document.body, 'mouseup');
        var s0 = state(root), was0 = desc(b);
        for (var settle = 0; settle < 6; settle++) { await nap(50); var s1 = state(root); if (s1 === s0) break; s0 = s1; }
        fire(b, 'pointerdown'); fire(b, 'mousedown'); await nap(50);
        var changed = state(root) !== s0;
        fire(document.body, 'pointerup'); fire(document.body, 'mouseup');
        if (changed) out.push({ kind: 'pointerdown', sc: '2.5.2', desc: was0 + ' (it acts when pressed, before the pointer is released)' });
        if (!root.isConnected) break;
      }
      // 2.1.1 and 2.4.3, the keys of the ARIA Authoring Practices: arrows, Home and End in a tab list, a menu, a list box
      // and a radio group; a combobox opens on Down and closes on Escape; a menu button's menu closes on Escape and gives
      // the focus back; Tab stays inside a modal dialog. Only where the component's own script runs (opts.keys): drawn as
      // markup alone, nothing answers a key. `skip` leaves out what the caller checks itself with real keys.
      if (opts.keys) { own = true; try { await keyPatterns(root, opts.skip || [], push, ran, nap); } finally { own = false; } }
      if (hurt) throw INTERRUPTED;
      if (keep && keep.focus && keep !== document.body) keep.focus({ preventScroll: true }); else if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return { findings: out, ran: Object.keys(ran) };
    })().finally(function () { window.open = realOpen; history.pushState = realPush; document.removeEventListener('submit', stopSubmit, true); document.removeEventListener('focusin', watch, true); if (hurt && hurt.isConnected && document.activeElement !== hurt) hurt.focus({ preventScroll: true }); });
  }

  // ── The keys of the ARIA Authoring Practices (APG), pressed as the component's script hears them ──
  var KEYCODE = { ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, Escape: 27, Tab: 9, Enter: 13 };
  function press(el, k, extra) {
    var o = { key: k, code: k, bubbles: true, cancelable: true, composed: true };
    Object.keys(extra || {}).forEach(function (x) { o[x] = extra[x]; });
    var e = new KeyboardEvent('keydown', o);
    // Older scripts read keyCode or which, which the event's options cannot set.
    try { Object.defineProperty(e, 'keyCode', { get: function () { return KEYCODE[k] || 0; } }); Object.defineProperty(e, 'which', { get: function () { return KEYCODE[k] || 0; } }); } catch (x) { /* read as given */ }
    el.dispatchEvent(e); el.dispatchEvent(new KeyboardEvent('keyup', o));
    return e;
  }
  var GROUPS = [['tablist', '[role=tab]'], ['menu', '[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]'], ['menubar', '[role=menuitem],[role=menuitemcheckbox],[role=menuitemradio]'],
    ['listbox', '[role=option]'], ['radiogroup', '[role=radio]']];
  var marks = function (els) { return els.map(function (el) { return [el.getAttribute('aria-selected'), el.getAttribute('aria-checked'), el.getAttribute('aria-expanded')].join(); }).join('|'); };
  async function keyPatterns(root, skip, push, ran, nap) {
    var usable = function (el) { return vis(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true'; };
    // Arrows, Home and End move along the items of a composite.
    for (var gi = 0; gi < GROUPS.length; gi++) {
      var role = GROUPS[gi][0];
      var groups = scope(root).filter(function (el) { return el.nodeType === 1 && el.getAttribute('role') === role && vis(el); }).slice(0, 3);
      for (var gj = 0; gj < groups.length; gj++) {
        var grp = groups[gj];
        var items = Array.prototype.filter.call(grp.querySelectorAll(GROUPS[gi][1]), function (it) { return usable(it) && it.closest('[role=' + role + ']') === grp; });
        if (items.length < 2) continue;
        // The focus sits on the container that names its current item (aria-activedescendant), or on the item Tab reaches.
        var viaActive = grp.hasAttribute('aria-activedescendant') && grp.tabIndex >= 0;
        var start = items.filter(function (it) { return it.tabIndex >= 0; })[0] || items.filter(function (it) { return it.getAttribute('aria-selected') === 'true' || it.getAttribute('aria-checked') === 'true'; })[0] || items[0];
        var host = viaActive ? grp : start;
        host.focus({ preventScroll: true });
        if (document.activeElement !== host) continue;
        var at = function () { var a = viaActive ? document.getElementById(grp.getAttribute('aria-activedescendant') || '') : document.activeElement; return items.indexOf(a); };
        var on = function () { return viaActive ? grp : document.activeElement; };
        var was = marks(items), from = at();
        var vertical = role === 'menu' || role === 'listbox' || grp.getAttribute('aria-orientation') === 'vertical';
        var keys = role === 'radiogroup' ? ['ArrowDown', 'ArrowRight'] : [vertical ? 'ArrowDown' : 'ArrowRight'];
        var moved = false;
        for (var ki = 0; ki < keys.length && !moved; ki++) { press(on(), keys[ki]); await nap(30); moved = at() >= 0 && at() !== from; }
        press(on(), 'End'); await nap(30); var toEnd = at() === items.length - 1;
        press(on(), 'Home'); await nap(30); var toHome = at() === 0;
        if (skip.indexOf('arrows') < 0) { ran.arrows = 1; if (!moved) push('arrows', '2.1.1', grp, 'role="' + role + '": ' + keys.join(' or ') + ' does not move to the next ' + (role === 'tablist' ? 'tab' : role === 'radiogroup' ? 'choice' : 'item')); }
        // Home and End are asked where the arrows work: without them, the arrows are what is missing.
        if (moved && role !== 'radiogroup') { ran.homeend = 1; if (!toEnd || !toHome) push('homeend', '2.1.1', grp, 'role="' + role + '": ' + (!toEnd && !toHome ? 'Home and End do' : !toEnd ? 'End does' : 'Home does') + ' not go to the ' + (!toEnd && !toHome ? 'first and the last' : !toEnd ? 'last' : 'first') + ' item'); }
        // What following the focus selected (a tab shown, a choice made) is put back.
        if (marks(items) !== was && start.isConnected) { start.click(); start.focus({ preventScroll: true }); }
        if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
      }
    }
    // A combobox opens its list on Down and closes it on Escape, the focus staying in it.
    var combos = scope(root).filter(function (el) { return el.nodeType === 1 && el.getAttribute('role') === 'combobox' && el.tagName !== 'SELECT' && usable(el) && el.getAttribute('aria-expanded') === 'false'; }).slice(0, 2);
    for (var ci = 0; ci < combos.length; ci++) {
      var cb = combos[ci], field = cb.matches(FOCUSABLE) ? cb : cb.querySelector('input,[tabindex]') || cb;
      field.focus({ preventScroll: true });
      if (document.activeElement !== field) continue;
      ran.comboboxkeys = 1;
      press(field, 'ArrowDown'); await nap(60);
      if (cb.getAttribute('aria-expanded') !== 'true') { push('comboboxkeys', '2.1.1', cb, 'Down does not open its list'); field.blur(); continue; }
      press(document.activeElement || field, 'Escape'); await nap(60);
      var stays = document.activeElement === field || cb.contains(document.activeElement);
      if (cb.getAttribute('aria-expanded') === 'true') { push('comboboxkeys', '2.1.1', cb, 'Escape does not close its list'); press(field, 'Escape'); }
      else if (!stays) push('comboboxkeys', '2.1.1', cb, 'Escape closes its list but the focus goes to ' + (document.activeElement ? desc(document.activeElement) : 'the page'));
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
    // A menu button: its menu closes on Escape, and the focus is back on the button.
    if (skip.indexOf('escape') < 0) {
      var opens = scope(root).filter(function (el) { return el.nodeType === 1 && /^(true|menu|listbox|dialog)$/.test(el.getAttribute('aria-haspopup') || '') && el.getAttribute('aria-expanded') === 'false' && el.getAttribute('role') !== 'combobox' && usable(el); }).slice(0, 2);
      for (var oi = 0; oi < opens.length; oi++) {
        var t = opens[oi];
        t.focus({ preventScroll: true }); t.click(); await nap(80);
        if (t.getAttribute('aria-expanded') !== 'true') { t.blur(); continue; }
        ran.escape = 1;
        press(document.activeElement && document.activeElement !== document.body ? document.activeElement : t, 'Escape'); await nap(80);
        if (t.getAttribute('aria-expanded') === 'true') { push('escape', '2.1.1', t, 'what it opens does not close with Escape'); t.click(); await nap(40); }
        else if (skip.indexOf('focusreturn') < 0) { ran.focusreturn = 1; if (document.activeElement !== t) push('focusreturn', '2.4.3', t, 'Escape closes what it opens, but the focus goes to ' + (document.activeElement && document.activeElement !== document.body ? desc(document.activeElement) : 'the page')); }
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
    }
    // Tab and Shift+Tab stay inside a modal dialog: a native modal (showModal) and a page made inert behind it keep it so;
    // otherwise its script has to move the focus round from its last control to its first.
    if (skip.indexOf('modalescape') < 0) {
      var modals = scope(root).filter(function (el) { return el.nodeType === 1 && vis(el) && (el.matches('dialog[open]') || el.matches('[role=dialog][aria-modal=true],[role=alertdialog][aria-modal=true]') && getComputedStyle(el).position === 'fixed'); }).slice(0, 2);
      for (var mi = 0; mi < modals.length; mi++) {
        var dlg = modals[mi];
        var stops = Array.prototype.filter.call(dlg.querySelectorAll(FOCUSABLE), function (n) { return n.tabIndex >= 0 && !n.disabled && vis(n); });
        if (stops.length < 2) continue;
        var inert = dlg.matches(':modal') || Array.prototype.every.call(document.body.children, function (n) { return n.contains(dlg) || n.inert || n.getAttribute('aria-hidden') === 'true' || !vis(n); });
        if (inert) { ran.modalescape = 1; continue; }
        if (dlg.tagName === 'DIALOG' && !dlg.matches('[aria-modal=true]')) continue;   // shown with show(): not modal, Tab may leave
        ran.modalescape = 1;
        var last = stops[stops.length - 1], first = stops[0];
        last.focus({ preventScroll: true }); press(last, 'Tab'); await nap(30);
        var wraps = document.activeElement === first;
        first.focus({ preventScroll: true }); press(first, 'Tab', { shiftKey: true }); await nap(30);
        var back = document.activeElement === last;
        if (!wraps || !back) push('modalescape', '2.4.3', dlg, (!wraps && !back ? 'Tab and Shift+Tab' : !wraps ? 'Tab from its last control' : 'Shift+Tab from its first control') + ' can leave it for the page behind');
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      }
    }
  }

  // Only the control edges (1.4.11), for the passes that read them again in another mode or state: fast on a big page.
  function edges(root) {
    var out = [], all = scope(root).filter(function (el) { return el.nodeType === 1; });
    edgeCheck(root, all, all.filter(vis), function (kind, sc, el, why) { out.push({ kind: kind, sc: sc, desc: (el ? desc(el) : '') + (why ? ' (' + why + ')' : '') }); }, function () {});
    return { findings: out, ran: [] };
  }

  g.__wcag21 = { check: check, interact: interact, edges: edges };
})(typeof window !== 'undefined' ? window : globalThis);
