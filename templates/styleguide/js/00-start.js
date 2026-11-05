(function () {
  // The page's data: set by its data file beside it (styleguide-files.mjs), or written in the page itself.
  var DATA_TAG = document.getElementById('sg-data');
  var DATA = self.SG_DATA || JSON.parse(self.SG_DATA_JSON || (DATA_TAG && DATA_TAG.type === 'application/json' && DATA_TAG.textContent) || '{}');
  var TOKENS = DATA.tokens || { colors: [], spacing: [], radii: [], sizing: [], typography: [] };
  var COMPONENTS = DATA.components || [];
  // A component's part (styleguide-files.mjs): what only its own page reads, in a file of its own (DATA.sgParts names
  // it), loaded when that page opens. One the page loaded with it (the component the address names, every one with
  // ?all) is put in its component before anything is drawn; a page written whole has none, and every part is here.
  var PARTS = DATA.sgParts || {}, PART_IN = {}, PART_WAIT = {};
  function partTake(c) {
    var make = self.SG_PARTS && self.SG_PARTS[c.name]; if (!make) return false;
    var f = make().fields || {}; Object.keys(f).forEach(function (k) { c[k] = f[k]; });
    PART_IN[c.name] = true; return true;
  }
  function partHere(c) { return !c || !PARTS[c.name] || !!PART_IN[c.name]; }
  // The part of a component, loaded when it is not here yet (from the page around the panel when it holds it, else its
  // file): true while it loads, done(ok) called once it has (ok false: it could not be read); false when it is here.
  function needPart(c, done) {
    if (partHere(c) || partTake(c) || (self.SG_PART_TAKE && self.SG_PART_TAKE(c.name) && partTake(c))) return false;
    if (PART_WAIT[c.name]) { PART_WAIT[c.name].push(done); return true; }
    PART_WAIT[c.name] = [done];
    var s = document.createElement('script'), file = PARTS[c.name];
    (self.SG_PART_FILES = self.SG_PART_FILES || {})[c.name] = file;
    s.onload = s.onerror = function () {
      var ok = false; try { ok = partTake(c); } catch (e) { ok = false; }
      if (!ok) s.remove();   // asked for again next time
      var waiting = PART_WAIT[c.name] || []; delete PART_WAIT[c.name];
      waiting.forEach(function (f) { f(ok); });
    };
    s.src = file; document.head.appendChild(s);
    return true;
  }
  COMPONENTS.forEach(function (c) { if (PARTS[c.name]) partTake(c); });
  // What the first screen never shows, each in a later file of its own (styleguide-files.mjs → LATERS; DATA.sgLater names
  // it): the brands' embedded fonts, the Showroom screens' drawings, the intent layer's text. The data keeps each value's
  // place, empty, until it is loaded; then each is put back where it was. One the page loaded with it (the address shows
  // it at once) is put back before anything is drawn.
  var LATER = DATA.sgLater || {}, LATER_IN = {}, LATER_WAIT = {};
  var LATER_GIVE = {
    fonts: function (f) { if (DATA.brands) DATA.brands.faces = f; },
    showroom: function (m) { (DATA.showroom || []).forEach(function (x) { if (x && x.markup === '' && Object.prototype.hasOwnProperty.call(m, x.key)) x.markup = m[x.key]; }); },
    intentLayer: function (t) { var il = DATA.intentLayer; if (!il) return; (t.pages || []).forEach(function (x, i) { var p = il.pages && il.pages[i]; if (x && p) Object.keys(x).forEach(function (k) { p[k] = x[k]; }); }); if (t.noPageOthers) il.noPageOthers = t.noPageOthers; }
  };
  function laterTake(k) {
    if (LATER_IN[k]) return true;
    var make = self.SG_LATER && self.SG_LATER[k]; if (!make || !LATER_GIVE[k]) return false;
    LATER_GIVE[k](make()); LATER_IN[k] = true; return true;
  }
  function laterHere(k) { return !LATER[k] || !!LATER_IN[k]; }
  // A later file, loaded when it is not here yet: true while it loads, done(ok) called once it has; false when it is here.
  function needLater(k, done) {
    if (laterHere(k) || laterTake(k)) return false;
    if (LATER_WAIT[k]) { LATER_WAIT[k].push(done); return true; }
    LATER_WAIT[k] = [done];
    var s = document.createElement('script');
    (self.SG_LATER_FILES = self.SG_LATER_FILES || {})[k] = LATER[k];
    s.onload = s.onerror = function () {
      var ok = false; try { ok = laterTake(k); } catch (e) { ok = false; }
      if (!ok) s.remove();   // asked for again next time
      var waiting = LATER_WAIT[k] || []; delete LATER_WAIT[k];
      waiting.forEach(function (f) { f(ok); });
    };
    s.src = LATER[k]; document.head.appendChild(s);
    return true;
  }
  Object.keys(LATER).forEach(laterTake);
  // A component the code has only as a CSS class (its class in the stylesheet, no component file, nothing it renders):
  // found, yet with no props to read or try, so its page draws it from Figma's structure.
  // Where an accessibility finding is, as places of a table (What it affects, in the row's panel), never a run-on list in
  // a sentence: each place's part, what of it, its element. Carried inside the finding's text as a hidden mark the panel
  // reads (placesTag), so every source of findings says its places one way.
  var PLACE_TAG = { button: 'Button', a: 'Link', input: 'Field', select: 'Select', textarea: 'Text field', img: 'Image', svg: 'Icon', path: 'Icon', g: 'Icon', label: 'Label', li: 'List item', ul: 'List', table: 'Table' };
  function placeOf(desc) {
    var d = String(desc || ''), m = /^(.*?)\s*\((.*)\)\s*(?:in\s+(.+))?$/.exec(d), own = (m ? m[1] : d.split(' in ')[0]).trim(), what = m ? m[2] : '';
    var tag = /^<(\w+)>/.exec(own), el = /^(\w+)?[#.]/.exec(own), word = tag ? tag[1] : el && el[1] ? el[1] : '';
    var cls = /\.([\w-]+)/.exec(own);
    var part = PLACE_TAG[String(word).toLowerCase()] || (cls ? cls[1].replace(/[-_]+/g, ' ').replace(/^\w/, function (k) { return k.toUpperCase(); }) : '');
    return { part: part, what: what || (tag ? d.replace(/^<\w+>\s*/, '').split(' in ')[0] : ''), element: tag ? '<' + tag[1] + '>' : own };
  }
  function placesTag(list) { list = (list || []).filter(Boolean); return list.length ? '<span class="sg-places" hidden data-places="' + esc(JSON.stringify(list)) + '"></span>' : ''; }
  function cssOnly(c) { return !!c && !c.codeOnly && !(c.api && c.api.file) && !c.source && !c.markup && !(c.renders || []).length; }
  // The page is still while the search is open (the loops below skip a beat).
  var sgQuiet = function () { return document.documentElement.classList.contains('sg-searching'); };
  // The page keeps the root size it loaded with: a system whose own CSS sizes text on a mode attribute (data-color, data-size)
  // would otherwise shrink or grow every rem on the page when a mode is switched on <html>.
  document.documentElement.style.fontSize = getComputedStyle(document.documentElement).fontSize;
  // The whole page in the family the theme chosen names (its font token, as that theme sets it), whatever the code's own page
  // rule writes by hand; read again whenever the theme, the brand or the mode changes.
  (function () {
    var tf = TOKENS.typeFamily && TOKENS.typeFamily.var ? TOKENS.typeFamily.var : ((TOKENS.typography || []).map(function (t) { return t.family && t.family.var; }).filter(Boolean)[0] || null);
    if (!tf) return;
    var apply = function () { var at = document.querySelector('.sg-layout') || document.body, fam = getComputedStyle(at).getPropertyValue(tf).trim(); document.body.style.fontFamily = fam ? fam + ', system-ui, sans-serif' : ''; };
    apply();
    // Read once the theme's own styles have landed (a brand's are written into the page just after its attribute).
    var later = function () { apply(); setTimeout(apply, 60); };
    if (typeof MutationObserver !== 'undefined') { var fo = new MutationObserver(later); fo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-brand', 'data-theme', 'data-sg-scheme', 'class'] }); fo.observe(document.head, { childList: true, subtree: true, characterData: true }); }
  })();
  // The room a card lets its stuck head paint past its edge: the page's radius as a plain length, which is all the
  // browser takes there (a system whose radius is calc(12px + 4px) would otherwise get none, and its card borders show).
  (function () { var p = document.createElement('div'); p.style.cssText = 'position:absolute;visibility:hidden;width:var(--sg-radius)'; document.body.appendChild(p); var w = p.getBoundingClientRect().width; p.remove(); if (w > 0) document.documentElement.style.setProperty('--sg-clip-m', Math.ceil(w) + 'px'); })();
  // What each component is, as the data gives it, taken before anything is drawn (drawing adds to it): the base of its
  // signature, which says whether accessibility results kept for it still hold (compSig).
  var COMP_DATA = {};
  COMPONENTS.forEach(function (c) {
    var a = {}; Object.keys(c.a11y || {}).forEach(function (k) { if (!/^(checked|audited|static|sources)$/.test(k)) a[k] = c.a11y[k]; });
    // Where a render was placed on the page it was measured in (top: 112665px) is not the component: left out.
    var renders = c.renders ? JSON.parse(JSON.stringify(c.renders).replace(/\b(top|left|right|bottom|inset)\s*:\s*-?[\d.]+px/g, '$1:*')) : null;
    COMP_DATA[c.name] = noScopeIds(JSON.stringify([c.name, c.cls, c.role, c.markup, c.markups, c.controls, a].concat(renders ? [renders] : [])));
  });
  // The system's CSS as its rules, in any order: a bundler can write the same rules in another order on each build
  // (the project's Vite does), which changes nothing a result rests on.
  // A Vue component's scoped id (data-v-1a2b3c4d) is a hash of where its file sits on the computer that built the page:
  // the same component built in another folder, or by the team's pipeline, gets another one. Left out of every
  // signature, so results saved anywhere hold wherever the page is built.
  function noScopeIds(text) { return String(text).replace(/data-v-[0-9a-f]{6,}/g, 'data-v'); }
  function cssSigText(css) { return noScopeIds(css).split('}').map(function (x) { return x.trim(); }).filter(Boolean).sort().join('}'); }
  // What a component's accessibility result rests on beyond its own data: the system's CSS and the checks themselves
  // (wcag-page.js). Never the page's own code, its data or what a build measures, which change with every build: a
  // result kept in this browser holds until the code, Figma or the checks change, and only what changed is tried again.
  var PAGE_SIG = sigOf(Array.prototype.filter.call(document.querySelectorAll('style[data-system], script:not([type="application/json"])'), function (s) { return s.tagName === 'STYLE' || /wcag-page\.js/.test(s.textContent.slice(0, 200)); }).map(function (s) { return s.tagName === 'STYLE' ? cssSigText(s.textContent) : s.textContent; }).join('\u0000'));
  var html = document.documentElement, main = document.getElementById('sg-main'), nav = document.getElementById('sg-nav');
  // A page opens at its top (route), a reload too: the browser puts back where the person had scrolled only once the
  // page has loaded, after the page has opened at its top, so the page keeps its own place instead.
  try { history.scrollRestoration = 'manual'; } catch (e) { /* an older browser: it keeps its own */ }
  // Opened in the Status page's panel (?embed): the component's page alone, no menu and no bar.
  if (/[?&]embed\b/.test(location.search)) html.classList.add('sg-embed');
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  // A text's words, its tags taken out (sep in their place) until none is left, and any < or > a broken tag left
  // behind with them: for measuring a cell, a plain line or a copied task, never markup to put in the page.
  function plainText(html, sep) { var s = String(html == null ? '' : html), was; sep = sep == null ? ' ' : sep; do { was = s; s = s.replace(/<[^<>]*>/g, sep); } while (s !== was); return s.replace(/[<>]/g, ''); }
  // Its entities as characters, &amp; last, so a text that says &amp;lt; reads &lt;, never <.
  function unescapeHTML(s) { return String(s == null ? '' : s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
  // A component's place on the page: its name, any character an address reads (a slash, a space) as a dash.
  function cid(n) { return 'c-' + String(n).replace(/[^\w-]+/g, '-'); }
  // How far down a bar that sticks under this one sits: this one's real height (its fraction of a pixel too, which a
  // rounded height loses), less a pixel, so the bar under it tucks under its edge and nothing scrolling ever shows
  // between two stuck bars, whatever the browser rounds. The one above is drawn over the one under it.
  function stuckH(el) { return el ? Math.max(0, el.getBoundingClientRect().height - 1) : 0; }
  // Each item of the menu with the page's own mark before it: one for each page of the system and each foundation, one
  // shared by every component. Drawn with lines in the text's colour, never one of the system's icons.
  var NAV_MARK = {
    'identity': '<path d="M8 1.8a6.2 6.2 0 1 0 0 12.4c1 0 1.3-.8.8-1.5-.5-.8 0-1.7 1-1.7h1.5a3 3 0 0 0 3-3c0-3.4-2.8-6.2-6.3-6.2z"/><circle cx="4.8" cy="7.2" r=".7"/><circle cx="7.6" cy="4.6" r=".7"/><circle cx="10.8" cy="6.2" r=".7"/>',   // a painter's palette
    tokens: '<path d="M8 2 14 5 8 8 2 5Z"/><path d="M2 8l6 3 6-3"/><path d="M2 11l6 3 6-3"/>',
    index: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
    health: '<path d="M1.5 8h3l1.5-4 3 8 1.5-4h4"/>',
    status: '<path d="M1.5 8h3l1.5-4 3 8 1.5-4h4"/>',
    history: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
    documentation: '<path d="M4 2h5.5L12 4.5V14H4Z"/><path d="M6 7h4M6 9.5h4M6 12h2.5"/>',
    colors: '<circle cx="8" cy="8" r="6"/><path d="M8 2v12M2.8 5h10.4M2.8 11h10.4"/>',
    typography: '<path d="M3 4V3h10v1M8 3v10M6 13h4"/>',
    spacing: '<path d="M2 3v10M14 3v10M5 8h6M5 8l1.5-1.5M5 8l1.5 1.5M11 8l-1.5-1.5M11 8l-1.5 1.5"/>',
    radii: '<path d="M3 13V8a5 5 0 0 1 5-5h5"/>',
    motion: '<path d="M2 11c3 0 3-6 6-6s3 6 6 6"/><circle cx="8" cy="5" r="1.2"/>',
    icons: '<path d="M8 2l1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2 4.4 13.1l.7-4L2.2 6.3l4-.6z"/>',
    showroom: '<rect x="1.5" y="2.5" width="13" height="9" rx="1.5"/><path d="M5.5 14h5M8 11.5V14"/>',
    templates: '<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M2 6h12M6 6v8"/>',   // a page frame: its header, a side column and the content
    component: '<path d="M8 1.6l2.2 2.2L8 6 5.8 3.8zM3.8 5.8 6 8l-2.2 2.2L1.6 8zM12.2 5.8 14.4 8l-2.2 2.2L10 8zM8 10l2.2 2.2L8 14.4l-2.2-2.2z"/>',   // four diamonds, as Figma marks a component
  };
  NAV_MARK['changes-in-Figma'] = NAV_MARK.history;   // the changes made in Figma: History's mark
  function navMark(id) { return '<svg class="sg-nav-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + (NAV_MARK[id] || (/^c-/.test(id) ? NAV_MARK.component : NAV_MARK.component)) + '</svg>'; }
  // A page's name starts with a capital (Status, Identity, In use); a component's is written as the system names it.
  function navLink(id, label, parent) { var a = document.createElement('a'); a.href = '#' + id; var l = String(label); if (!/^c-/.test(id)) l = l.charAt(0).toUpperCase() + l.slice(1); a.innerHTML = navMark(id) + esc(l); (parent || nav).appendChild(a); }
  // The foundations in the menu under their own label, as the components are under theirs.
  function foundationLink(id, label) {
    if (!foundationLink.labelled) { var lab = document.createElement('div'); lab.className = 'sg-nav-label'; lab.textContent = 'Foundations'; nav.appendChild(lab); foundationLink.labelled = true; }
    navLink(id, label);
  }
  // The page the address opens, read as the router will (its older names too; none: Status). Every other page is built
  // hidden, so what a page measures as it is built lays out the page shown only; each is measured again when it opens.
  var START = (function () {
    if (/[?&]all\b/.test(location.search)) return null;   // ?all: every page shows
    var id = decodeURIComponent(location.hash.slice(1).split(/[\/?]/)[0] || '');
    return !id || /^(documentation|coverage|todo|tasks|health)$/.test(id) ? 'status' : id === 'overview' ? 'index' : id === 'whats-new' || id === 'changelog' ? 'history' : id;
  })();
  function section(id, badge, title, lead) {
    var s = document.createElement('section'); s.id = id; s.className = 'sg-section';
    // A page is its title and what it shows: no line of description under the title.
    s.innerHTML = (badge ? '<div class="sg-section-badge">' + esc(badge) + '</div>' : '') + '<h2>' + esc(title) + '</h2>';
    if (START && START !== id) s.hidden = true;
    main.appendChild(s); return s;
  }
  function foundationLead(sec, text) {}   // kept for the pages that call it: no line under a page's title
  var plural = function (n, one, many) { return n + ' ' + (n === 1 ? one : many); };
  // The size an icon's name gives it (m-close-m, close-s, s-arrow): the system's own name for that size, or ''.
  var iconSizeName = function (id) { var m = String(id).match(/^(xxs|xs|s|m|l|xl|xxl)[-_]/i) || String(id).match(/[-_](xxs|xs|s|m|l|xl|xxl)$/i); return m ? m[1].toLowerCase() : ''; };
  // An asset in the icon sprite is not an icon: a logo, a wordmark, a map pin, an illustration. Named so, or drawn
  // well off square (an icon may be a little wider, 26 × 24; a logo is 109 × 28, a pin 32 × 40). Assets stay off the
  // icons page and out of the icon counts.
  var isAsset = function (id) {
    if (/(^|[-_\s])(logos?|wordmark|lockup|brandmark|illustrations?|pins?|markers?)([-_\s]|$)/i.test(id) && !iconSizeName(id)) return true;
    if (/(^|[-_\s])(logos?|wordmark|lockup|brandmark)([-_\s]|$)/i.test(id)) return true;
    var el = document.getElementById(id), p = ((el && el.getAttribute('viewBox')) || '').split(/[\s,]+/).map(Number), r = p[2] > 0 && p[3] > 0 ? p[2] / p[3] : 1;
    return r > 1.2 || r < 0.85;
  };
  DATA.icons = (DATA.icons || []).filter(function (id) { return !isAsset(id); });
  // A title's own words, without the actions it holds.
  // Code Connect's mark: two links hooked into each other (the code and its Figma component).
  var CODE_CONNECT_SVG = '<svg class="sg-status-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6.2 10.3 9.6 6.9a1.6 1.6 0 0 1 2.3 2.3L8.5 12.6"/><path d="M9.8 5.7 6.4 9.1a1.6 1.6 0 0 1-2.3-2.3l3.4-3.4"/></svg>';
  function titleText(h) { var c = h.cloneNode(true); Array.prototype.forEach.call(c.querySelectorAll('.sg-section-actions, .pg-head-links'), function (x) { x.remove(); }); return c.textContent.trim(); }
  // How tall the menu's head is, for each group's name to stick under it.
  (function () { var side = document.getElementById('sg-sidebar'), head = side && side.querySelector('.sg-sidebar-header'); if (!head) return; var set = function () { side.style.setProperty('--sg-sidebar-head-h', stuckH(head) + 'px'); }; set(); addEventListener('resize', set); if (typeof ResizeObserver !== 'undefined') new ResizeObserver(set).observe(head); })();
  // The menu's own stuck line: under its head while the menu scrolls, or under the group's name stuck beneath it.
  (function () {
    var side = document.getElementById('sg-sidebar'), head = side && side.querySelector('.sg-sidebar-header'); if (!head) return;
    var queued = false, mark = function () {
      queued = false;
      var top = head.getBoundingClientRect().bottom, stuck = null;
      Array.prototype.forEach.call(side.querySelectorAll('.sg-nav-label'), function (l) { l.classList.remove('sg-sticky-edge'); if (side.scrollTop > 0 && Math.abs(l.getBoundingClientRect().top - top) < 1.5) stuck = l; });
      if (stuck) stuck.classList.add('sg-sticky-edge');
      head.classList.toggle('sg-sticky-edge', side.scrollTop > 0 && !stuck);
    };
    side.addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(mark); } }, { passive: true });
  })();
  function hr() { var h = document.createElement('hr'); h.className = 'sg-hr'; main.appendChild(h); }
  // How far down what sticks at the top of a page reaches (its title and size switch, a component's areas, the Tasks
  // page's filter and counts), for every table's head to stick under it (--pg-areas-h); and how tall a card's head is,
  // for the table's own head row to stick under that (--pg-card-head-h).
  var STICK_BARS = '.sg-hero > h1, .pg-head, .pg-areas, .sg-section > h2, .sg-size-switch, .sg-todo-head, .sg-tokens-chips';
  // A foundation's size switch, or the Status page's chips, stay in view under the page's title as it scrolls: measured
  // again when the window changes and once the fonts are in, as the title's height can change with them.
  function underTitle(target) {
    if (!target) return;
    var tTitle = target.querySelector(':scope > h2'), tSwitch = Array.prototype.filter.call(target.querySelectorAll('.sg-size-switch'), function (x) { return !x.hidden; })[0] || target.querySelector('.sg-todo-head');   // the switch shown (the Showroom has one on its grid, another on a screen's page)   // what sticks under the title (a size switch, the Tasks' filter)
    if (tTitle && tTitle.offsetParent) target.style.setProperty('--sg-title-h', stuckH(tTitle) + 'px');   // the Status page's chips: the bar is drawn again, the page keeps it
    if (tTitle && tSwitch && tTitle.offsetParent && !tSwitch.classList.contains('sg-todo-head')) tSwitch.style.top = 'calc(var(--sg-sticky-top, 0px) + ' + stuckH(tTitle) + 'px)';
    stickHeight(target);
  }
  function stickHeight(sec) {
    if (!sec) return;
    var headRow = sec.querySelector('.pg-header > .pg-head'); if (headRow && headRow.offsetParent) sec.style.setProperty('--pg-head-h', stuckH(headRow) + 'px');   // a component's title row, the areas sticking under it
    var top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sg-sticky-top')) || 0, low = top;
    Array.prototype.forEach.call(sec.querySelectorAll(STICK_BARS), function (el) {
      if (!el.offsetParent || getComputedStyle(el).position !== 'sticky') return;
      low = Math.max(low, (parseFloat(getComputedStyle(el).top) || 0) + stuckH(el));
    });
    sec.style.setProperty('--pg-bars-h', (low - top) + 'px');   // the page's own bars: a component's chips stick under them
    Array.prototype.forEach.call(sec.querySelectorAll('.pg-card-section .pg-par-sum'), function (el) {
      if (!el.offsetParent || getComputedStyle(el).position !== 'sticky') return;
      low = Math.max(low, (parseFloat(getComputedStyle(el).top) || 0) + stuckH(el));
    });
    sec.style.setProperty('--pg-areas-h', (low - top) + 'px');   // with its chips: the cards' heads stick under all of them
    var head = Array.prototype.filter.call(sec.querySelectorAll('.pg-inspect-head'), function (h) { return h.offsetParent; })[0];
    if (head) sec.style.setProperty('--pg-card-head-h', stuckH(head) + 'px');
    // Each card its own: a table's head row sticks under its own card's head, however tall that head is.
    Array.prototype.forEach.call(sec.querySelectorAll('.pg-inspect-head'), function (h) { if (h.offsetParent && h.parentElement) h.parentElement.style.setProperty('--pg-card-head-h', stuckH(h) + 'px'); });
  }
  // A token's name, wherever the page shows it, opens a panel in place: its Figma name, its value in each mode, the
  // components that use it (each linked to its page) and a button to copy it. Nothing moves; Escape or a click outside
  // closes it, the focus going back to the name.
  var USES = DATA.tokenUses || {}, USES_F = DATA.tokenUsesFigma || {};
  // Every component that uses a token: in its own rules or through another token (USES, by the code's variable), and
  // by Figma's name (USES_F: named after it, bound on its Figma component, or reached through an alias).
  var HAS_PAGE = {}; (DATA.components || []).forEach(function (c) { HAS_PAGE[c.name] = c; });   // a component with a page of its own, linked; one only in Figma, named
  // The side panels' one template, as a component's page is laid out: a head that stays at the panel's top as it scrolls
  // (what it is, its name, its full name or path) and the body under it, cards a card gap apart.
  // Where a page or a panel sits, from the outermost: the page under a panel holding a component's page (the Status
  // page), the page or component it was opened from. Read from the page it is in, and from the page around it when it
  // is itself shown in a panel.
  function trailHere(from) {
    var t = [], head = function (sec) { var h = sec && sec.querySelector(':scope > h2, :scope .pg-head h1, :scope .pg-head h2, :scope > h1'); return h ? titleText(h) : ''; };
    try { if (window.parent && window.parent !== window) { var up = head(window.parent.document.querySelector('.sg-section:not([hidden])')); if (up) t.push(up); } } catch (e) { /* another origin */ }
    var here = head((from && from.closest && from.closest('.sg-section')) || document.querySelector('.sg-section:not([hidden])'));
    if (here && t[t.length - 1] !== here) t.push(here);
    return t;
  }
  // A panel's head: where it is (each level, from the outermost), then its title, then what it is in full.
  function sidePanelPage(o) {
    var crumbs = (o.crumbs || []).filter(Boolean);
    return '<header class="sg-panel-head">' + (crumbs.length ? '<nav class="sg-panel-crumbs" aria-label="Where you are">' + crumbs.map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</nav>' : o.badge ? '<p class="sg-section-badge">' + esc(o.badge) + '</p>' : '') + '<h2>' + esc(o.title) + (o.titleTip ? ' ' + o.titleTip : '') + '</h2>' + (o.sub ? '<p class="sg-panel-sub">' + esc(o.sub) + '</p>' : '') + '</header>' +
      '<div class="sg-panel-body">' + o.body + '</div>';
  }
  // The components a token is used by, as the Status table shows them: whether Figma has each (Found) and the code (Built), and an
  // arrow to its page (one only in Figma has none to open).
  var STATUS_PILL = function (ok, yes) { return '<span class="pg-par-status pg-par--' + (ok ? 'match' : 'differs') + '"><span class="pg-par-sign" aria-hidden="true"></span>' + (ok ? yes || 'Found' : 'Missing') + '</span>'; };
  var USERS_ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
  function usersTable(names) {
    if (!names.length) return '<p class="sg-tk-none">No component uses it.</p>';
    return '<div class="pg-par-scroll"><table class="pg-par-table sg-tk-users"><thead><tr><th scope="col">Component</th><th scope="col">Figma</th><th scope="col">Code</th><th scope="col" class="sg-mx-open-cell"><span class="sg-hidden-text">Open</span></th></tr></thead><tbody>' +
      names.map(function (n) { var c = HAS_PAGE[n], inFigma = c ? !c.codeOnly : true, inCode = !!c;
        return '<tr class="sg-mx-row' + (c ? ' is-link' : '') + '"><td><span class="sg-mx-name" title="' + esc(n) + '">' + esc(n) + '</span></td><td>' + STATUS_PILL(inFigma) + '</td><td>' + STATUS_PILL(inCode, 'Built') + '</td>' +
          '<td class="sg-mx-open-cell">' + (c ? '<a class="sg-mx-go" href="#' + esc(cid(n)) + '" aria-label="Open ' + esc(n) + '">' + USERS_ARROW + '</a>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>';
  }
  function usesOf(v, figma) {
    var u = (v && USES[v]) || { direct: [], via: [] }, f = USES_F[String(figma || '').replace(/\/colou?r$/i, '')] || [], direct = (u.direct || []).slice();
    f.forEach(function (n) { if (direct.indexOf(n) < 0 && !(u.via || []).some(function (x) { return x.name === n; })) direct.push(n); });
    return { direct: direct, via: u.via || [] };
  }
  function usesLink(v) { return /[?&]all\b/.test(location.search) ? esc(v) : '<button type="button" class="sg-token-link" data-token="' + esc(v) + '" aria-expanded="false" aria-haspopup="dialog">' + esc(v) + '</button>'; }
  var TOKEN_INFO = (function () {
    var out = {}, T = DATA.tokens || {};
    (T.colors || []).forEach(function (g) { (g.items || []).forEach(function (t) { out[t.var] = t; }); });
    ['spacing', 'radii', 'sizing', 'iconStrokes'].forEach(function (k) { (T[k] || []).forEach(function (t) { if (t && t.var) out[t.var] = t; }); });
    (T.typography || []).forEach(function (t) { ['size', 'weight', 'lh', 'ls', 'family'].forEach(function (k) { if (t[k] && t[k].var) out[t[k].var] = t[k]; }); });
    return out;
  })();
  var tokenPop = null, tokenFrom = null;
  function closeToken(back) { if (!tokenPop || tokenPop.hidden) return; tokenPop.hidden = true; if (tokenFrom) { tokenFrom.setAttribute('aria-expanded', 'false'); if (back) tokenFrom.focus(); } tokenFrom = null; }
  function popPanel() {
    if (!tokenPop) {
      tokenPop = document.createElement('div'); tokenPop.className = 'sg-token-pop'; tokenPop.setAttribute('role', 'dialog'); tokenPop.hidden = true; document.body.appendChild(tokenPop);
      tokenPop.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closeToken(true); } });
      // A panel opened by the pointer resting on its button stays while the pointer is on the panel.
      tokenPop.addEventListener('mouseenter', function () { clearTimeout(tipTimer); });
      tokenPop.addEventListener('mouseleave', function () { if (tokenPop.dataset.byHover) tipSoon(); });
    }
    return tokenPop;
  }
  // The panel under (or over) the button that opened it, the focus in it when a click or a key opened it.
  function placePop(btn, focus) {
    tokenPop.hidden = false;
    var r = btn.getBoundingClientRect(), w = Math.min(520, window.innerWidth - 32);   // as wide as the room allows, up to 520px
    tokenPop.style.width = w + 'px';
    tokenPop.style.left = Math.max(16, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 16)) + 'px';
    var below = r.bottom + window.scrollY + 6, h = tokenPop.offsetHeight;
    tokenPop.style.top = (r.bottom + h + 6 > window.innerHeight && r.top - h - 6 > 0 ? r.top + window.scrollY - h - 6 : below) + 'px';
    if (tokenFrom && tokenFrom !== btn) tokenFrom.setAttribute('aria-expanded', 'false');
    tokenFrom = btn; btn.setAttribute('aria-expanded', 'true');
    if (focus) { delete tokenPop.dataset.byHover; tokenPop.setAttribute('tabindex', '-1'); tokenPop.focus({ preventScroll: true }); } else tokenPop.dataset.byHover = '1';
  }
  var tipTimer = null;
  function tipSoon() { clearTimeout(tipTimer); tipTimer = setTimeout(function () { if (tokenPop && tokenPop.dataset.byHover) closeToken(false); }, 300); }
  function tokenModes(t, btn) {
    var at = btn && btn.closest && btn.closest('.pg-card-section'), stage = at && at.querySelector('.pg-preview'), out = [];
    var nowOf = function (ax) {
      var v = (stage && stage.getAttribute(ax.attr)) || document.documentElement.getAttribute(ax.attr);
      return v || (ax.media && window.matchMedia && window.matchMedia(ax.media).matches ? ax.mediaValue : ax.restValue);
    };
    AXES.forEach(function (ax) {
      var now = nowOf(ax);
      if (ax.colour && t.values) ax.values.forEach(function (m) { if (t.values[m.value] != null) out.push({ label: m.label, value: String(t.values[m.value]), now: m.value === now }); });
      else if (!ax.colour && t.figma && ax.changes) ax.values.forEach(function (m) {
        var ch = (ax.changes[m.value] || []).find(function (x) { return x.name === t.figma; });
        out.push({ label: m.label, value: ch ? ch.to : (t.value || ''), now: m.value === now });
      });
    });
    return out.filter(function (r) { return r.value; });
  }
  function openToken(btn) {
    var v = btn.getAttribute('data-token'), t = TOKEN_INFO[v] || {}, u = usesOf(v, t.figma);
    popPanel();
    var now = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    // Its value in every mode of every collection that changes it (Light and Dark, Desktop and Phone), the one drawn
    // where its button sits marked (the Playground's own modes, else the page's).
    var rows = tokenModes(t, btn), differs = rows.some(function (r) { return r.value !== rows[0].value; });
    var values = !rows.length ? '<p>' + esc(t.value || now || '-') + '</p>' : rows.map(function (r) { return '<p>' + esc(r.label) + '  ·  ' + esc(r.value) + (r.now && differs ? '  ·  <b>shown now</b>' : '') + '</p>'; }).join('') + (differs ? '' : '<p>The same in every mode.</p>');
    var comps = u.direct.map(function (n) { return { n: n }; }).concat(u.via.map(function (x) { return { n: x.name, through: x.through }; }));
    var seenC = {}; comps = comps.filter(function (c) { if (seenC[c.n]) return false; seenC[c.n] = 1; return true; }).sort(function (a, b) { return a.n.localeCompare(b.n); });
    tokenPop.setAttribute('aria-label', v);
    tokenPop.innerHTML = '<p class="sg-token-pop-name"><code>' + esc(v) + '</code></p><dl class="pg-updated">' +
      (t.figma ? '<div><dt>In Figma</dt><dd><p>' + esc(t.figma) + '</p></dd></div>' : '') +
      // What it is for, as Figma describes it; a semantic token with none says so (a primitive needs none).
      (t.description ? '<div><dt>What it is for</dt><dd><p>' + esc(t.description) + '</p></dd></div>' : t.figma && !t.primitive ? '<div><dt>What it is for</dt><dd><p class="pg-missing">Not written yet.</p></dd></div>' : '') +
      '<div><dt>' + (rows.length ? 'In each mode' : 'Its value') + '</dt><dd>' + values + '</dd></div>' +
      '<div><dt>Used by</dt><dd>' + (comps.length ? comps.slice(0, 12).map(function (c) { return '<p><a class="sg-uses-link" href="#' + esc(cid(c.n)) + '">' + esc(c.n) + '</a>' + (c.through ? ', through ' + esc(c.through) : '') + '</p>'; }).join('') + (comps.length > 12 ? '<p><a class="sg-uses-link" href="#uses?t=' + encodeURIComponent(v) + '">and ' + (comps.length - 12) + ' more</a></p>' : '') : (t.figma && NOT_USED_YET[String(t.figma).replace(/\/colou?r$/, '')] ? '<p>Not used yet: kept for a brand or a component to come. Its description says which.</p>' : '<p>No component uses it yet.</p>')) + '</dd></div></dl>' +
      '<div class="sg-token-pop-actions">' + sysButton('button', 'Copy ' + v, ' data-copy-token') + '</div>';
    tokenPop.querySelector('[data-copy-token]').addEventListener('click', function (e) { copyText('var(' + v + ')', e.currentTarget); });
    Array.prototype.forEach.call(tokenPop.querySelectorAll('a'), function (a) { a.addEventListener('click', function () { closeToken(false); }); });
    placePop(btn, true);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.sg-token-link');
    if (b) { e.preventDefault(); clearTimeout(tipTimer); if (tokenFrom === b && tokenPop && !tokenPop.hidden && !tokenPop.dataset.byHover) closeToken(true); else openToken(b); return; }
    if (tokenPop && !tokenPop.hidden && !tokenPop.contains(e.target) && !fromCheck(e)) closeToken(false);
  });
  // A click or a key the accessibility check gives a component in the preview while it tries it never closes the panel
  // a person opened.
  function fromCheck(e) { return !e.isTrusted && !!(e.target && e.target.closest && e.target.closest('.pg-preview, .pg-offstage, .pg-frame, .pg-variants')); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !fromCheck(e)) closeToken(true); });
  window.addEventListener('hashchange', function () { closeToken(false); });
  function linkVars(text) { return esc(text).replace(/(^|[^\w-])(--[\w-]+)/g, function (m, pre, v) { return pre + usesLink(v); }); }
  if (DATA.title) { document.getElementById('sg-title').textContent = DATA.title; document.title = DATA.title + ' · Living style guide'; }
  // The system's logo at the top of the menu, in place of its name (still said to a screen reader); it follows the
  // page's light and dark.
  // The top of the menu: the system's name (or the project's own logo, styleguide.logo, when it gives one, the name then
  // said to a screen reader only), and beside it the system's version.
  var lhead = document.querySelector('.sg-sidebar-header'), lfirst = lhead && lhead.querySelector('#sg-title');
  if (lhead && DATA.logo && DATA.logo.svg) {
    Array.prototype.forEach.call(lhead.querySelectorAll('p'), function (p) { p.classList.add('sg-hidden-text'); });
    var la = document.createElement('a'); la.className = 'sg-logo'; la.href = '#status'; la.setAttribute('aria-label', (DATA.title || 'Design system') + ', status');
    la.innerHTML = DATA.logo.svg; var lsvg = la.querySelector('svg'); if (lsvg) { lsvg.setAttribute('aria-hidden', 'true'); lsvg.setAttribute('focusable', 'false'); }
    lhead.insertBefore(la, lhead.firstChild); lfirst = la;
  }
  // Its version: the newest release its changelog has (styleguide.version, when set), so it moves on with each release;
  // a click opens the changelog.
  var newest = DATA.version || null;
  if (!newest) (DATA.components || []).forEach(function (k) { (k.changelog || []).forEach(function (r) { if (r.release && (!newest || versionAfter(r.release, newest))) newest = r.release; }); });
  if (lfirst && newest) {
    var row = document.createElement('div'); row.className = 'sg-logo-row'; lhead.insertBefore(row, lfirst); row.appendChild(lfirst);
    var vtag = document.createElement('a'); vtag.className = 'sg-logo-version'; vtag.href = '#history'; vtag.setAttribute('aria-label', 'Version ' + newest + ', changelog');
    vtag.innerHTML = '<span class="sg-status">' + esc(/^v/i.test(newest) ? newest : 'v' + newest) + '</span>';   // the page's tag, inside a plain link
    row.appendChild(vtag);
  }
  // Whether release a is later than release b (v2.10.01 after v2.9.3): their numbers compared one by one.
  // The releases of a changelog in order: what is not released yet first, then the newest version (v2.12.00 before
  // v2.11.01, whatever day each one's last commit was). g: { k: its tag, '' when none yet; at: its newest commit's date;
  // on: the day it was tagged }.
  function releaseOrder(a, b) { return (a.k ? 1 : 0) - (b.k ? 1 : 0) || (a.k && b.k && a.k !== b.k ? (versionAfter(a.k, b.k) ? -1 : 1) : (b.at > a.at ? 1 : b.at < a.at ? -1 : 0)); }
  // Commits grouped by the ticket each was made for (r.ticket, read from its subject), in the order given (newest first);
  // a commit for no ticket is a group of its own. → [{ ticket, ticketUrl, items }]
  function byTicket(list, rOf) {
    var out = [], at = {};
    list.forEach(function (x) { var r = rOf(x), k = r.ticket ? 't:' + r.ticket : 'c:' + (r.sha || r.subject); if (!at[k]) { at[k] = { ticket: r.ticket || null, ticketUrl: r.ticketUrl || null, items: [] }; out.push(at[k]); } at[k].items.push(x); });
    return out;
  }
  // What a commit says (without its ticket, its pull request and any co-author line) and its link.
  function commitLine(r, extra) {
    var sha = r.url ? '<a class="sg-uses-link" href="' + esc(r.url) + '" target="_blank" rel="noopener"><code>' + esc(r.short) + '</code></a>' : '<code>' + esc(r.short) + '</code>';
    var says = String(r.says || r.subject).replace(/\s*Co-Authored-By:[\s\S]*$/i, '').replace(/\s*\(#\d+\)\s*$/, '');
    // The merge or pull request it came in by, after it, when its row is an issue's (a row with no issue leads with it).
    var req = r.ticket && r.request ? ' <span class="pg-log-date">' + (r.via ? 'via' : '·') + '</span> ' + requestLink(r.request) : '';
    return esc(says) + ' ' + sha + req + doneByHTML(r) + (extra || '');
  }
  // Who did it (who-did-it.mjs), beside what a decision says of who answered it: the commit's author, and who brought
  // it in when that is somebody else, or the schedule for a run nobody started.
  function doneByHTML(r) { return r && r.by ? ' <span class="pg-log-date">' + esc(r.by) + '</span>' : ''; }
  function requestLink(q) { return q.url ? '<a class="sg-uses-link" href="' + esc(q.url) + '" target="_blank" rel="noopener">' + esc(q.label) + '</a>' : esc(q.label); }
  // Where a commit changed the system besides a component's code (change-where.mjs): Figma's data, the documentation, the
  // tokens, the version, the pipeline, the setup, a folder; each linked to where the change is seen, quieter than a
  // component, after the components.
  function whereHTML(list) {
    return (list || []).map(function (w) {
      var one = /^(docs|figma|examples|tests|code)$/.test(w.kind) && (w.names || []).length === 1 ? w.names[0] : null;
      var label = w.label + (one ? ': ' + one : w.kind === 'figma' ? [w.count ? w.count + ' component' + (w.count === 1 ? '' : 's') : '', w.tokens ? w.tokens + ' token' + (w.tokens === 1 ? '' : 's') : ''].filter(Boolean).map(function (x) { return ' · ' + x; }).join('') : w.count && w.kind !== 'other' ? ' · ' + w.count : '');
      // The components it names, when several: in its title, for whoever hovers.
      var title = !one && (w.names || []).length > 1 ? ' title="' + esc(w.names.join(', ')) + '"' : '';
      var href = one ? '#' + cid(one) : w.url;
      var ext = href && !/^#/.test(href);
      return href ? '<a class="sg-uses-link sg-where-pill" href="' + esc(href) + '"' + title + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(label) + '</a>' : '<span class="sg-log-where"' + title + '>' + esc(label) + '</span>';
    }).join(' ');
  }
  // A ticket's cell: the ticket (linked to its issue), then each of its commits on a line; a commit for no ticket, alone.
  function ticketHTML(t, line) {
    if (!t.ticket) return line(t.items[0]);
    var head = t.ticketUrl ? '<a class="sg-uses-link" href="' + esc(t.ticketUrl) + '" target="_blank" rel="noopener"><strong>' + esc(t.ticket) + '</strong></a>' : '<strong>' + esc(t.ticket) + '</strong>';
    return '<p class="sg-il-line">' + head + '</p>' + t.items.map(function (x) { return '<p class="sg-il-line">' + line(x) + '</p>'; }).join('');
  }
  // Its head: the release and the day it came out (its tag's), else its newest commit's day.
  function releaseHead(g, k) { return (k || esc(g.k || 'Merged, no release tag yet')) + '  ·  ' + (g.k && g.on ? 'released ' + esc(g.on.slice(0, 10)) : esc(String(g.at).slice(0, 10))); }
  function versionAfter(a, b) { var x = String(a).match(/\d+/g) || [], y = String(b).match(/\d+/g) || []; for (var i = 0; i < Math.max(x.length, y.length); i++) { var d = (+x[i] || 0) - (+y[i] || 0); if (d) return d > 0; } return false; }

