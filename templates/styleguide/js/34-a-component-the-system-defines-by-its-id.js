  // A component the system defines by its id (a tooltip its script fills, #tt) is one element in the page, as in a
  // product, so the system's own script finds it.
  COMPONENTS.forEach(function (c) { if (/^#[\w-]+$/.test(c.cls || '') && !document.getElementById(c.cls.slice(1))) { var one = document.createElement('div'); one.id = c.cls.slice(1); document.body.appendChild(one); } });
  var refreshers = [];
  // Everything drawn again for a brand or mode change (each page only while it shows: lazyDraw).
  // A panel's head stuck (its content scrolled under it) carries the full-width line.
  document.addEventListener('scroll', function (e) { var d = e.target; if (!d || !d.classList || !d.classList.contains('sg-tk-detail')) return; var h = d.querySelector('.sg-panel-head'); if (h) h.classList.toggle('sg-sticky-edge', d.scrollTop > 0); }, true);
  function redrawAll() { refreshers.concat(DRAWERS).forEach(function (r) { try { r(); } catch (e) {} }); }
  // The components' group says how many there are: Components (117).
  if (COMPONENTS.length) { var lab = document.createElement('div'); lab.className = 'sg-nav-label'; lab.dataset.group = 'Components'; lab.innerHTML = 'Components' + countHTML(menuCount()); nav.appendChild(lab); }
  // Each component is its own view, drawn the first time it is opened (every view at once with ?all, as the engine's
  // own checks open the page). Its card's thumbnail is its markup at first, then its drawn preview.
  var ALL = /[?&]all\b/.test(location.search), BUILDERS = {};
  // With ?all&only=a,b only those components are drawn: the engine's accessibility check takes a big system in parts.
  var ONLY = (function () { var m = /[?&]only=([^&]*)/.exec(location.search); return m ? decodeURIComponent(m[1]).split(',') : null; })();
  var MENU_FAMS = {}, FAM_FIRST = {};   // the families already given their one menu entry; each family's first member in Figma's order, as Status opens it
  COMPONENTS.forEach(function (c) { var f = menuFamily(c); if (f && !FAM_FIRST[f]) FAM_FIRST[f] = c.name; });
  COMPONENTS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
    BUILDERS[cid(c.name)] = function () {
      hr();
      var cardEl = buildCard(c); main.appendChild(cardEl); cardEl.hidden = false;
      cardEl._refresh();   // measure after it is in the page: a detached node computes to nothing
      thumbOf(c, cardEl.querySelector('.pg-preview').firstElementChild);
      cardEl._area('play', true);   // a component opens on its Playground
      refreshers.push(lazyDraw(cardEl, cardEl._refresh));   // redrawn on a brand or mode change while it shows, else when it is opened
      return cardEl;
    };
    BUILDERS[cid(c.name)]._c = c;   // drawn once its part is here (needPart)
    if (inMenu(c)) navLink(cid(c.name), c.name);   // a part has its page, opened from its parent's Parts; one only the code has, its page from Status
    else { var fam = menuFamily(c); if (fam && !MENU_FAMS[fam]) { MENU_FAMS[fam] = 1; navLink(cid(FAM_FIRST[fam] || c.name), fam); } }
    if (ALL) { if (!ONLY || ONLY.indexOf(c.name) >= 0) BUILDERS[cid(c.name)](); } else { try { thumbOf(c, baseElement(c)); } catch (e) {} }
  });
  if (!COMPONENTS.length && !FLAT.length) { var empty = document.createElement('p'); empty.className = 'pg-empty'; empty.textContent = 'Nothing agreed yet.'; main.appendChild(empty); }

  // The menu: its buttons say what they do in words (the system's own text button), never an icon alone. On a wide
  // screen it is always there. On a phone, Menu at the top opens the sidebar as a panel over the page (the system's
  // overlay), closed by Close menu, the overlay, a link or Escape.
  (function () {
    var bar = document.getElementById('sg-topbar'), side = document.getElementById('sg-sidebar'), scrim = document.getElementById('sg-scrim');
    document.getElementById('sg-topbar-title').textContent = DATA.title || 'Design system';
    bar.insertAdjacentHTML('afterbegin', sysButton('button', 'Menu', ' id="sg-menu"'));
    side.querySelector('.sg-sidebar-header').insertAdjacentHTML('afterbegin', sysButton('button', 'Close menu', ' id="sg-nav-close"'));
    var menu = document.getElementById('sg-menu'), shut = document.getElementById('sg-nav-close');
    shut.classList.add('sg-nav-close');
    if (DATA.ui && DATA.ui.overlay) scrim.classList.add(DATA.ui.overlay);
    menu.setAttribute('aria-controls', 'sg-sidebar'); menu.setAttribute('aria-expanded', 'false');
    // What sticks to the top of a page (a component's areas) sits under the top bar when one shows.
    var cbar = document.getElementById('sg-controlbar');
    var stickTop = function () {
      var h = getComputedStyle(bar).display === 'none' ? 0 : bar.getBoundingClientRect().height;
      if (cbar && getComputedStyle(cbar).position === 'sticky') h += cbar.getBoundingClientRect().height;   // the page's top bar too
      h = Math.max(0, h - 1);   // what sticks under the bars tucks under their edge (stuckH)
      document.documentElement.style.setProperty('--sg-sticky-top', h + 'px');
    };
    window.addEventListener('resize', stickTop); stickTop();
    // Measured again whenever a bar changes height (its fonts arriving, a mode or a brand drawn again), so nothing scrolls
    // in a sliver between the bars and what sticks under them.
    if (typeof ResizeObserver !== 'undefined') { var stickRO = new ResizeObserver(stickTop); stickRO.observe(bar); if (cbar) stickRO.observe(cbar); }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(stickTop);
    var open = function (on) {
      document.body.classList.toggle('sg-nav-open', on); menu.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) setTimeout(function () { shut.focus({ preventScroll: true }); }, 50); else menu.focus();   // never the search: no keyboard pops up
    };
    menu.addEventListener('click', function () { open(true); });
    shut.addEventListener('click', function () { open(false); });
    scrim.addEventListener('click', function () { open(false); });
    side.addEventListener('click', function (e) { if (e.target.closest('.sg-nav a') && document.body.classList.contains('sg-nav-open')) { document.body.classList.remove('sg-nav-open'); menu.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('sg-nav-open')) open(false); });
  })();

  // Search: the system's own text field in the page's top bar, over everything the page holds (components with their
  // descriptions, annotations and props, every token by its Figma name and variable, type styles, icons, to-dos and
  // sections). While it has words, a flyout under it shows what matches, in what it is set to look in. Escape clears it.
  var sMount = document.getElementById('sg-search');
  if (sMount) {
    sMount.innerHTML = DATA.ui && DATA.ui.field ? DATA.ui.field.markup : '<input type="text" class="sg-input">';
    sMount.insertAdjacentHTML('afterbegin', '<svg class="sg-search-mark" viewBox="0 0 16 16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M7 11.33a4.33 4.33 0 1 0 0-8.66 4.33 4.33 0 0 0 0 8.66Zm3.07-1.26L13.5 13.5"/></svg>');
    var q = sMount.querySelector('input'); q.type = 'search'; q.placeholder = 'Search'; q.setAttribute('aria-label', 'Search the style guide'); q.removeAttribute('value');
    // Its clear button: the page's own (the browser's is hidden), 32px square inside the field, shown while it has words.
    var qClear = document.createElement('button'); qClear.type = 'button'; qClear.className = 'sg-btn sg-search-clear'; qClear.setAttribute('aria-label', 'Clear the search'); qClear.hidden = true;
    qClear.innerHTML = '<svg class="sg-link-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    q.insertAdjacentElement('afterend', qClear);
    var qClearShow = function () { qClear.hidden = !q.value; };
    q.addEventListener('input', qClearShow);
    qClear.addEventListener('mousedown', function (e) { e.preventDefault(); });
    qClear.addEventListener('click', function () { q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); qClearShow(); q.focus(); });
    // The results open in a flyout under the field, over the page: a switch of what to look in (All, Components,
    // Tokens, Icons), then what matches; the navigation stays as it is.
    // While the search is open the page holds still: its loops wait, its animations pause, nothing under it reacts to
    // the pointer, so the search has the whole attention.
    var quiet = function (on) { document.documentElement.classList.toggle('sg-searching', !!on); };
    var fly = document.createElement('div'); fly.className = 'sg-search-flyout'; fly.hidden = true;
    var KINDS = [['all', 'All'], ['components', 'Components'], ['tokens', 'Tokens'], ['icons', 'Icons']];
    // What to search in, as chips (the page's filters all are).
    fly.innerHTML = '<span class="sg-chips" role="group" aria-label="Search in">' + KINDS.map(function (k) { return '<button type="button" class="sg-chip" data-v="' + k[0] + '" aria-pressed="' + (k[0] === 'all') + '">' + esc(k[1]) + '</button>'; }).join('') + '</span>';
    var scope = 'all';
    var kindOf = function (r) { return /^Component/.test(r.kind) ? 'components' : /^Icon(?! stroke)/.test(r.kind) ? 'icons' : 'tokens'; };
    var kindChips = Array.prototype.slice.call(fly.querySelectorAll('.sg-chip'));
    kindChips.forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.v === scope ? 'true' : 'false'); b.addEventListener('mousedown', function (e) { e.preventDefault(); }); b.addEventListener('click', function () { scope = b.dataset.v; kindChips.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); }); search(); }); });
    var results = document.createElement('div'); results.className = 'sg-nav sg-results'; results.id = 'sg-results'; results.hidden = true; results.setAttribute('role', 'region'); results.setAttribute('aria-label', 'Search results');
    fly.appendChild(results); sMount.appendChild(fly);
    // Once the results scroll under the chips, the line every stuck bar has, across the flyout.
    fly.addEventListener('scroll', function () { var ch = fly.querySelector('.sg-chips'); if (ch) ch.classList.toggle('sg-sticky-edge', fly.scrollTop > 0); });
    q.setAttribute('aria-controls', 'sg-results');
    var INDEX = null;
    var index = function () {
      if (INDEX) return INDEX;
      INDEX = [];
      var add = function (kind, label, href, find, more) { INDEX.push({ kind: kind, label: label, href: href, find: find || null, hay: [label].concat(more || []).join(' ').toLowerCase() }); };   /* only components, tokens and icons, each by its own name and values */
      COMPONENTS.forEach(function (c) {
        if (cssOnly(c)) return;   // not a component of the code yet: no page to find
        add('Component', c.name, '#' + cid(c.name), null, [c.cls]);   /* by its name and class: not its props, slots or words */
        ((c.ownTokens && c.ownTokens.colors) || []).concat((c.ownTokens && c.ownTokens.sizes) || []).forEach(function (t) { add('Token in ' + c.name, t.figma, '#' + cid(c.name), t.figma, [t.var, t.value]); });
      });
      FLAT.forEach(function (t) { add('Colour', t.figma, '#colors', t.figma, [t.var]); });
      [['spacing', 'Spacing'], ['radii', 'Radius']].forEach(function (k) { (TOKENS[k[0]] || []).forEach(function (t) { add(k[1], t.figma, '#' + k[0], t.figma, [t.var, t.value]); }); });
      [['durations', 'Duration'], ['easings', 'Easing']].forEach(function (k) { ((DATA.motion || {})[k[0]] || []).forEach(function (t) { add(k[1], t.figma || t.var, '#motion', t.figma, [t.var, t.value]); }); });
      (TOKENS.typography || []).forEach(function (t) { add('Type style', t.scale, '#typography', null, ['size', 'weight', 'lh', 'family'].map(function (k) { return t[k] ? [t[k].figma, t[k].var, t[k].value].join(' ') : ''; })); });
      (TOKENS.iconStrokes || []).forEach(function (t) { add('Icon stroke', t.figma, '#icons', t.figma, [t.var, t.value]); });
      var FIGI = DATA.iconFigma || {};
      (DATA.icons || []).forEach(function (id) { var n = (FIGI[id] && FIGI[id].name) || id, px = FIGI[id] && FIGI[id].size; add('Icon' + (px ? ' ' + px + 'px' : ''), n, '#icons', n, [id]); });
      return INDEX;
    };
    var pending = null;
    // A token, icon or style found: its own place on the page is brought into view and marked for a moment.
    var reveal = function () {
      if (!pending) return; var f = pending; pending = null;
      var sec = document.getElementById(f.href.slice(1)); if (!sec || !f.find) return;
      var el = Array.prototype.find.call(sec.querySelectorAll('*'), function (k) { return !k.children.length && k.textContent.trim() === f.find; });
      if (!el) return;
      var box = el.closest('.color-chip, .icon-chip, .spacing-row, .radius-chip, tr') || el;
      box.scrollIntoView({ block: 'center' }); box.classList.add('sg-found'); setTimeout(function () { box.classList.remove('sg-found'); }, 1600);
    };
    window.addEventListener('hashchange', function () { setTimeout(reveal, 0); });
    var go = function (r) {
      pending = r;
      if (location.hash === r.href) setTimeout(reveal, 0); else location.hash = r.href;
      if (document.body.classList.contains('sg-nav-open')) { document.body.classList.remove('sg-nav-open'); document.getElementById('sg-menu').setAttribute('aria-expanded', 'false'); }
    };
    var found = [];
    var search = function () {
      var words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      fly.hidden = !words.length; results.hidden = !words.length; quiet(!fly.hidden);
      if (!words.length) { results.innerHTML = ''; found = []; return; }
      // Every match counted by kind, each chip's count in its badge; the list shows the chosen kind.
      var hits = index().filter(function (r) { return words.every(function (w) { return r.hay.indexOf(w) >= 0; }); }), per = { all: hits.length };
      hits.forEach(function (r) { var k = kindOf(r); per[k] = (per[k] || 0) + 1; });
      kindChips.forEach(function (b) { var had = b.querySelector('.sg-count'); if (had) had.remove(); b.insertAdjacentHTML('beforeend', countHTML(per[b.dataset.v] || 0)); });
      found = hits.filter(function (r) { return scope === 'all' || kindOf(r) === scope; })
        .sort(function (a, b) { var p = function (r) { var l = r.label.toLowerCase(); return l === words.join(' ') ? 0 : l.indexOf(words[0]) === 0 ? 1 : l.indexOf(words[0]) >= 0 ? 2 : 3; }; return p(a) - p(b); }).slice(0, 60);
      results.innerHTML = found.length ? found.map(function (r, n) { return '<a href="' + esc(r.href) + '" data-n="' + n + '"><span class="sg-result"><span>' + esc(r.label) + '</span><span class="sg-result-kind">' + esc(r.kind) + '</span></span></a>'; }).join('')
        : '<p class="sg-search-none" role="status">Nothing matches ' + esc(q.value.trim()) + '.</p>';
    };
    results.addEventListener('click', function (e) { var a = e.target.closest('a[data-n]'); if (!a) return; e.preventDefault(); go(found[+a.dataset.n]); });
    q.addEventListener('input', search);
    // The flyout closes when the focus leaves the search (a click elsewhere, Tab past it) and opens again on its words.
    sMount.addEventListener('focusout', function () { setTimeout(function () { if (!sMount.contains(document.activeElement)) { fly.hidden = true; quiet(false); } }, 0); });
    document.addEventListener('pointerdown', function (e) { if (!sMount.contains(e.target)) { fly.hidden = true; quiet(false); } });   /* a click anywhere else closes it, and the page moves again */
    q.addEventListener('focus', function () { if (q.value.trim()) search(); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { q.value = ''; search(); qClearShow(); }
      if (e.key === 'Enter' && found.length) { e.preventDefault(); go(found[0]); }
    });
  }

  // Global mode controls: every axis on <html>; a change re-reads every card and re-syncs the per-card controls.
  var mount = document.getElementById('mode-controls');
  // A change on the page applies to every component: each one's own choice of that mode is dropped, so it follows.
  if (mount && AXES.length) { var pageModes = SGModes.controls(html, function (axis) {
    if (axis && axis.attr) document.querySelectorAll('.pg-preview[' + axis.attr + '], .sg-scope[' + axis.attr + ']').forEach(function (p) { p.removeAttribute(axis.attr); if (axis.colour) p.style.colorScheme = ''; });
    redrawAll(); SGModes.syncAll();
  }, function (a) { return a.attr !== 'data-size'; }); mount.appendChild(pageModes); SGModes.register(pageModes); }   // a size (breakpoint) is switched on each component and section, not for the page
  // The system's brands (DATA.brands, Figma's extended collections): a choice beside the page's mode that puts the brand
  // chosen on everything the page shows of the system (each preview, the Showroom), and its look on the page around it. The
  // system's own values are the first choice; a brand under another is named under it. Remembered on this device only.
  // What the build's drawing could not carry in its markup, given back wherever it appears (a checkbox's indeterminate
  // state, a property set from script, written by the harness as data-dse-indeterminate).
  var domState = function (root) { if (root && root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('input[data-dse-indeterminate]'), function (i) { i.indeterminate = true; }); };
  domState(document);
  if (typeof MutationObserver !== 'undefined') new MutationObserver(function (ms) { ms.forEach(function (m) { Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) { if (n.matches && n.matches('input[data-dse-indeterminate]')) n.indeterminate = true; else domState(n); } }); }); }).observe(document.body, { childList: true, subtree: true });
  // A select the page draws itself (the brand's): a button with the choice and a list mark, and a list under it, over a
  // select kept for the choice (its change is what acts). A list box as WAI-ARIA has it: the arrow keys, Home and End
  // move, Enter or Space picks, Escape or Tab closes, a click outside closes.
  var LIST_MARK = '<svg class="sg-dd-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 4h7.5M6 8h7.5M6 12h7.5M2.5 4h.01M2.5 8h.01M2.5 12h.01"/></svg>';
  function customSelect(sel, labelId) {
    var wrap = sel.parentElement, id = sel.id + '-list';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'sg-select-trigger'; btn.id = sel.id + '-trigger';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', id);
    btn.setAttribute('aria-labelledby', labelId + ' ' + btn.id);
    // Its name inside it, before the choice (Brand  Acme · Retail), when its label is said for a screen reader only.
    var named = document.getElementById(labelId) || (wrap.parentElement && wrap.parentElement.querySelector('[id="' + labelId + '"]'));   // not on the page yet when drawn
    btn.innerHTML = (named && named.classList.contains('sg-dd-named') ? '<span class="sg-dd-label" aria-hidden="true">' + esc(named.textContent) + '</span>' : '') + '<span class="sg-dd-value"></span>' + LIST_MARK;
    var list = document.createElement('div'); list.className = 'sg-select-list'; list.id = id; list.setAttribute('role', 'listbox'); list.setAttribute('aria-labelledby', labelId); list.tabIndex = -1; list.hidden = true;
    var fill = function () {
      list.innerHTML = '';
      Array.prototype.forEach.call(sel.options, function (o, i) {
        var opt = document.createElement('div'); opt.className = 'sg-dd-option'; opt.id = id + '-' + i; opt.setAttribute('role', 'option'); opt.dataset.v = o.value; opt.textContent = o.textContent;
        list.appendChild(opt);
      });
    };
    fill();
    wrap.appendChild(btn); wrap.appendChild(list);
    var lab = document.getElementById(labelId); if (lab) { lab.removeAttribute('for'); lab.addEventListener('click', function () { btn.focus(); }); }
    var opts = function () { return Array.prototype.slice.call(list.querySelectorAll('[role="option"]')); }, active = -1;
    var setActive = function (i) { var o = opts(); active = Math.max(0, Math.min(o.length - 1, i)); o.forEach(function (x, k) { x.classList.toggle('is-active', k === active); }); if (o[active]) { list.setAttribute('aria-activedescendant', o[active].id); o[active].scrollIntoView({ block: 'nearest' }); } };
    var sync = function () { var cur = sel.value; btn.querySelector('.sg-dd-value').textContent = (sel.options[sel.selectedIndex] || {}).textContent || ''; opts().forEach(function (x) { x.setAttribute('aria-selected', x.dataset.v === cur ? 'true' : 'false'); }); };
    var open = function () { list.hidden = false; btn.setAttribute('aria-expanded', 'true'); setActive(sel.selectedIndex); list.focus({ preventScroll: true }); document.addEventListener('mousedown', outside, true); };
    var close = function (back) { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); if (back) btn.focus(); };
    var choose = function (i) { var o = opts()[i]; if (!o) return; if (sel.value !== o.dataset.v) { sel.value = o.dataset.v; sel.dispatchEvent(new Event('change', { bubbles: true })); } sync(); close(true); };
    var outside = function (e) { if (!wrap.contains(e.target)) close(false); };
    btn.addEventListener('click', function () { if (list.hidden) open(); else close(true); });
    btn.addEventListener('keydown', function (e) { if (/^(ArrowDown|ArrowUp|Enter| )$/.test(e.key)) { e.preventDefault(); open(); } });
    list.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
      else if (e.key === 'End') { e.preventDefault(); setActive(opts().length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(active); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close(false);
    });
    list.addEventListener('click', function (e) { var o = e.target.closest('[role="option"]'); if (o) choose(opts().indexOf(o)); });
    list.addEventListener('mousemove', function (e) { var o = e.target.closest('[role="option"]'); if (o) setActive(opts().indexOf(o)); });
    sel.addEventListener('change', sync);
    sync();
    return { sync: sync, refresh: function () { fill(); sync(); } };
  }
  var BRANDS = DATA.brands && DATA.brands.list && DATA.brands.list.length ? DATA.brands : null, BRAND_CTL = null;
  if (BRANDS) {
    var bst = document.createElement('style'); bst.id = 'sg-brand-css'; bst.textContent = (BRANDS.faces || '') + '\n' + (BRANDS.css || ''); document.head.appendChild(bst);
    // The brands' embedded fonts, in a later file of their own: loaded the first time a brand is chosen.
    var brandFonts = function () { needLater('fonts', function (ok) { if (ok) bst.textContent = (BRANDS.faces || '') + '\n' + (BRANDS.css || ''); }); };
    // The guide around the previews takes the brand too, its look only: its colours, its corners and its family, read
    // from the page's own map of roles to the system (each --sg-* colour and radius role, and what is made of them, as
    // the lines and a switch's choice), declared again where the brand's values are; its sizes and spacing stay its own.
    (function () {
      // Only what is read from a variable (a fixed colour is the same in any brand); the dark scheme's own as well. Every
      // see-through fill (a1 to a5, a hover, a choice, the menu's) is made again from the brand's own text colour, so each
      // one blends with the brand, never a grey worked out before it.
      var LOOK = /^--sg-(bg|bg-2|surface|bg-2-own|surface-own|stage|text|text-2|muted|border|accent|warning|positive|negative|radius(-\w+)?)$/, MADE = /var\(--sg-/, decl = {}, dark = {};
      // Whatever the page makes from those roles that comes out a colour (a fill, a line, a tint), by what it is, never by
      // its name: so any role added later, and any brand's colours, blend the same way. A size made from them stays put.
      var rootCS = getComputedStyle(document.documentElement);
      var isColour = function (k) { var v = rootCS.getPropertyValue(k).trim(); return !!v && !/^-?[\d.]+(px|rem|em|%|s|ms)?$/.test(v) && typeof CSS !== 'undefined' && CSS.supports('color', v) || /^[\w-]+ (solid|dashed) /.test(v); };
      Array.prototype.forEach.call(document.styleSheets, function (sh) {
        var rules; try { rules = sh.cssRules; } catch (e) { return; }
        Array.prototype.forEach.call(rules || [], function (r) {
          var sel = r.selectorText || '', isDark = /data-sg-scheme="dark"/.test(sel) && /:root/.test(sel);
          if (!r.style || !(isDark || /(^|,)\s*:root\b/.test(sel))) return;
          for (var i = 0; i < r.style.length; i++) { var k = r.style[i], v = r.style.getPropertyValue(k).trim(); if (/^--sg-/.test(k) && /var\(/.test(v) && (LOOK.test(k) || (MADE.test(v) && isColour(k)))) (isDark ? dark : decl)[k] = v; }
        });
      });
      // The panels made from the brand's background and text, in both schemes, as the page's own are.
      ['--sg-bg-2', '--sg-surface'].forEach(function (k) { decl[k] = 'var(' + k + '-own, color-mix(in srgb, var(--sg-text) 3%, var(--sg-bg)))'; delete dark[k]; });
      var fam = TOKENS.typeFamily && TOKENS.typeFamily.var ? 'font-family: var(' + TOKENS.typeFamily.var + ');' : '';
      var body = Object.keys(decl).map(function (k) { return k + ': ' + decl[k] + ';'; }).join(' ');
      var cst = document.createElement('style'); cst.id = 'sg-brand-chrome';
      var darkBody = Object.keys(dark).map(function (k) { return k + ': ' + dark[k] + ';'; }).join(' ');
      cst.textContent = '[data-brand] .sg-layout { ' + body + ' ' + fam + ' background: var(--sg-bg); min-height: 100vh; }' + (darkBody ? '\n[data-sg-scheme="dark"][data-brand] .sg-layout { ' + darkBody + ' }' : '');
      document.head.appendChild(cst);
    })();
    var brandOf = function (k) { return BRANDS.list.filter(function (b) { return b.key === k; })[0] || null; };
    // A brand's own family is drawn when this computer has it, or Google Fonts serves it (asked for once); when neither
    // does, the switch says so: its components are then drawn in the fallback, not the brand's font.
    var asked = {};
    var fontNote = document.createElement('p'); fontNote.className = 'sg-mode-diff'; fontNote.setAttribute('aria-live', 'polite'); fontNote.hidden = true;
    var checkFonts = function (k) {
      var fams = (brandOf(k) || {}).fonts || [];
      fontNote.hidden = true;
      if (!fams.length || !document.fonts) return;
      var has = function (f) { var t = document.createElement('span'); t.textContent = 'mmmmmmmmmmlli'; t.style.cssText = 'position:absolute;visibility:hidden;font-size:40px;font-family:monospace'; document.body.appendChild(t); var a = t.offsetWidth; t.style.fontFamily = '"' + f + '",monospace'; var b = t.offsetWidth; t.remove(); return a !== b; };
      fams.forEach(function (f) {
        if (has(f) || asked[f] || (BRANDS.embedded || []).indexOf(f) >= 0) return;
        asked[f] = true;
        var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(f).replace(/%20/g, '+') + ':wght@100..900&display=swap'; document.head.appendChild(l);
      });
      setTimeout(function () {
        var missing = fams.filter(function (f) { return !has(f) && (BRANDS.embedded || []).indexOf(f) < 0; });
        if (html.getAttribute('data-brand') !== k || !missing.length) return;
        fontNote.textContent = missing.join(' and ') + (missing.length === 1 ? ' is' : ' are') + ' not on this computer or on Google Fonts: its components are drawn in the fallback font.';
        fontNote.hidden = false;
      }, 1500);
    };
    var setBrand = function (k) {
      if (k && brandOf(k)) { html.setAttribute('data-brand', k); brandFonts(); } else html.removeAttribute('data-brand');
      try { if (k) localStorage.setItem('sg-brand', k); else localStorage.removeItem('sg-brand'); } catch (e) {}
      setQuery('brand', k && brandOf(k) ? k : 'default');   // the address always names the theme, the default one too
      redrawAll();
      checkFonts(k);
      try { document.dispatchEvent(new CustomEvent('sg-brand', { detail: k })); } catch (e) {}
    };
    var bWrap = document.createElement('div'); bWrap.className = 'sg-brand-ctl';
    var bId = 'sg-brand-select';
    bWrap.innerHTML = '<label class="sg-mode-label sg-dd-named" id="' + bId + '-label" for="' + bId + '">Theme</label><span class="sg-dd"><select id="' + bId + '" class="sg-input sg-select-native" tabindex="-1" aria-hidden="true">' +
      '<option value="">Default</option>' +
      // A brand others are built on (Acme, the base of Retail, Wealth and Travel) is not a brand of its own: only what
      // is built on it is offered, named with the base it comes from (Acme · Retail).
      (function () {
        var isBase = function (b) { return BRANDS.list.some(function (x) { return x.parent === b.key; }); };
        return BRANDS.list.filter(function (b) { return !isBase(b); }).map(function (b) { var up = b.parent && brandOf(b.parent); return '<option value="' + esc(b.key) + '">' + esc(up ? up.name + ' · ' + b.name : b.name) + '</option>'; }).join('');
      })() + '</select></span>';
    var bSel = bWrap.querySelector('select');
    bSel.addEventListener('change', function () { setBrand(bSel.value); });
    var bDrop = customSelect(bSel, bId + '-label');
    BRAND_CTL = { select: bSel, set: setBrand, refresh: bDrop.refresh, sync: bDrop.sync };
    var kept = null; try { kept = localStorage.getItem('sg-brand'); } catch (e) {}
    if (URLQ.get('brand') != null) kept = URLQ.get('brand');   // the address's brand first: a shared link opens in it
    bWrap.appendChild(fontNote);
    if (mount) mount.appendChild(bWrap);
    if (kept && brandOf(kept) && bSel.querySelector('option[value="' + kept + '"]')) { bSel.value = kept; setBrand(kept); }
    else setQuery('brand', 'default');
    bDrop.sync();
  }
  // The browser's own setting leads until someone picks a mode: when it changes (the computer goes dark at night, the
  // window narrows), the page and every component not switched by hand follow it.
  AXES.forEach(function (axis) {
    var mq = axis.media && window.matchMedia ? window.matchMedia(axis.media) : null;
    // The measuring page (?all) keeps every drawn component as it is when the colour scheme changes: the engine
    // switches the scheme while it reads them, and a redraw would replace the very elements it is reading.
    if (mq && mq.addEventListener) mq.addEventListener('change', function () { if (!ALL) redrawAll(); SGModes.syncAll(); });
  });
  // The same for a colour mode the page follows the device on itself (the code has no media query for it).
  if (SGModes.prefers && SGModes.prefers.addEventListener) SGModes.prefers.addEventListener('change', function () { if (!ALL && SGModes.follow()) { redrawAll(); SGModes.syncAll(); } });

  // What uses a token (#uses?t=--name): the components that use it in their own rules, then those that use it through
  // another token, each linked to its page. Built the first time it is opened, written again for each token.
  BUILDERS.uses = function () {
    var s = section('uses', 'Token', 'Token', null);
    var named = function (v) {
      var hit = null;
      (TOKENS.colors || []).forEach(function (g) { g.items.forEach(function (t) { if (t.var === v) hit = t.figma; }); });
      ['spacing', 'radii', 'sizing', 'iconStrokes'].forEach(function (k) { (TOKENS[k] || []).forEach(function (t) { if (t.var === v) hit = t.figma; }); });
      (TOKENS.typography || []).forEach(function (t) { ['size', 'weight', 'lh', 'ls', 'family'].forEach(function (k) { if (t[k] && t[k].var === v) hit = t[k].figma; }); });
      return hit;
    };
    var body = document.createElement('div'); body.className = 'sg-uses pg-doc'; s.appendChild(body);
    s._link = function (q) {
      var v = (q && q.get('t')) || '', fig = named(v), u = usesOf(v, fig), val = v ? getComputedStyle(html).getPropertyValue(v).trim() : '';
      var link = function (n) { return '<a class="sg-uses-link" href="#' + esc(cid(n)) + '">' + esc(n) + '</a>'; };
      var by = function (a, b) { return (a.name || a).localeCompare(b.name || b); }, n = u.direct.length + u.via.length;
      s.querySelector('h2').textContent = v || 'Token';
      body.innerHTML = '<p>' + esc(!n ? 'No component uses it.' : (n === 1 ? 'One component uses it' : n + ' components use it') + (u.via.length ? ', ' + (u.direct.length ? u.direct.length + ' in their own rules and ' : '') + u.via.length + ' through another token.' : '.')) + '</p><dl class="pg-updated">' +
        (fig ? '<div><dt>In Figma</dt><dd><p>' + esc(fig) + '</p></dd></div>' : '') +
        (val ? '<div><dt>Its value now</dt><dd><p>' + esc(val) + '</p></dd></div>' : '') +
        '<div><dt>Used by</dt><dd>' + (u.direct.length ? u.direct.slice().sort(by).map(function (x) { return '<p>' + link(x) + '</p>'; }).join('') : '<p>No component uses it in its own rules.</p>') + '</dd></div>' +
        (u.via.length ? '<div><dt>Through another token</dt><dd>' + u.via.slice().sort(by).map(function (x) { return '<p>' + link(x.name) + ', through ' + usesLink(x.through) + '</p>'; }).join('') + '</dd></div>' : '') +
        '</dl>';
    };
    s._link(hashParts().q);
    return s;
  };

  // One view at a time: the overview, a foundation or a component, by the address (#c-badge), so each can be shared.
  // With ?all every view shows, one after another, as before.
  var links = document.querySelectorAll('.sg-nav a');
  // The page opens on Status; the index is not in the menu and its address opens Status too.
  function homeId() { return document.getElementById('status') || (typeof BUILDERS !== 'undefined' && BUILDERS.status) ? 'status' : 'index'; }
  // The component panel's page loaded once the page has settled and the browser is idle, so the first component opens at once.
  (function () { var go = function () { setTimeout(function () { (window.requestIdleCallback || setTimeout)(preloadComponentPanel); }, 1500); }; if (document.readyState === 'complete') go(); else window.addEventListener('load', go); })();
  // Where the page shown starts, from the top of the document (under the bars, past the page's own padding): its
  // sections' scroll margin, so the browser's own jump to the section the address names (#status, once the page has
  // loaded) leaves the page at its top. Measured again as the bars or the page change size; not with ?all.
  function pageTop() {
    var s = ALL ? null : main.querySelector(':scope > section:not([hidden])');
    if (s) html.style.setProperty('--sg-page-top', Math.max(0, Math.round(s.getBoundingClientRect().top + window.scrollY)) + 'px');
  }
  if (!ALL && window.ResizeObserver) new ResizeObserver(pageTop).observe(main);
  // The page shown while a component's part loads (a moment), never a blank one: its name, then that it is loading, or
  // that its part could not be read (a file missing beside the page). The component's own page replaces it.
  function partWaitPage(c, failed) {
    var s = document.getElementById('sg-part-wait');
    if (!s) { s = document.createElement('section'); s.id = 'sg-part-wait'; s.className = 'sg-section'; main.appendChild(s); }
    s.innerHTML = '<div class="sg-section-badge">Components</div><h2>' + esc(c.name) + '</h2><p class="' + (failed ? 'pg-missing' : 'pg-dim') + '" role="status">' +
      esc(failed ? 'Its details could not be loaded: ' + PARTS[c.name] + ' is not beside the page, or the connection dropped. Open the page again.' : 'Loading its details…') + '</p>';
    Array.prototype.forEach.call(main.children, function (k) { if (k.matches('section, .sg-hr')) k.hidden = k !== s; });
    pageTop();
  }
  function route() {
    if (!location.hash || /^#(index|overview)$/.test(location.hash)) { if (homeId() !== 'index') history.replaceState(null, '', location.search + '#' + homeId()); }
    else if (/^#(documentation|coverage|intent-layer|for-agents)$/.test(location.hash)) history.replaceState(null, '', location.search + (document.getElementById('documentation') ? '#documentation' : '#status/documentation'));   // the address says where it lives now: the Documentation page, else (no intent layer) the Status page's
    else if (/^#(changelog|whats-new)([\/?]|$)/.test(location.hash)) history.replaceState(null, '', location.search + '#history' + location.hash.replace(/^#(changelog|whats-new)/, ''));   // History was once the Changelog
    else if (/^#brand-kit([\/?]|$)/.test(location.hash)) history.replaceState(null, '', location.search + '#identity' + location.hash.replace(/^#brand-kit/, ''));   // Identity was once the brand kit
    else if (/^#(todo|tasks|health)([\/?]|$)/.test(location.hash)) history.replaceState(null, '', '#status' + location.hash.replace(/^#(todo|tasks|health)/, ''));   // the page was once To do, then Tasks and Health
    var at = hashParts(), id = at.id || homeId(), built = !!document.getElementById(id);
    // A component whose part is not here yet: its page says so while it loads, then is drawn as the address asks.
    var partOf = !built && BUILDERS[id] && BUILDERS[id]._c;
    if (partOf && needPart(partOf, function (ok) { if ((hashParts().id || homeId()) !== id) return; if (ok) route(); else partWaitPage(partOf, true); })) { partWaitPage(partOf, false); return; }
    if (!built && BUILDERS[id]) BUILDERS[id]();
    if (built && document.getElementById(id)._link) document.getElementById(id)._link(at.q);
    // An area named in the address (#c-chip/accessibility) opens on it; moving to another component opens its Playground.
    var sec0 = document.getElementById(id);
    if (sec0 && sec0._area && (at.area || (id !== route.last && built))) sec0._area(at.area || 'play', true);
    // Opened on an area filtered (#c-chip/accessibility?st=todo): its chip chosen once that area has its rows.
    var stWant = at.q && at.q.get('st');
    if (sec0 && stWant) (function pick(n) { var chip = sec0.querySelector('.pg-area:not([hidden]) .sg-chip[data-st="' + stWant + '"]'); if (chip) { if (chip.getAttribute('aria-pressed') !== 'true') chip.click(); } else if (n < 40) setTimeout(function () { pick(n + 1); }, 250); })(0);
    route.last = id;
    var target = document.getElementById(id) && document.getElementById(id).matches('main > section') ? document.getElementById(id) : document.getElementById(homeId()) || document.getElementById('index');
    if (target._screen) target._screen(at.slug);   // the Showroom: its grid, or the screen the address names (#showroom/<Screen>)
    // The filter and the panel the address names, once they are drawn: the page bar's chip (show), a Showroom screen's
    // kind of note (kind), the side panel (panel).
    var qWant = function (k) { return at.q && at.q.get(k); };
    if (qWant('show')) whenThere(function () { return target.querySelector('.sg-todo-head .sg-chip[data-chip="' + qWant('show') + '"], .pg-area:not([hidden]) .sg-chip[data-hist="' + qWant('show') + '"]'); }, function (c) { if (c.getAttribute('aria-pressed') !== 'true') c.click(); });
    if (qWant('kind')) whenThere(function () { return target.querySelector('.sg-showroom-filter .sg-chip[data-v="' + qWant('kind') + '"]'); }, function (c) { if (c.getAttribute('aria-pressed') !== 'true') c.click(); });
    var panelWant = qWant('panel'), openPanel = document.querySelector('.sg-comp-panel:not([hidden])');
    if (panelWant && !(openPanel && openPanel._open && openPanel._key === panelWant)) whenThere(function () {
      return /^doc:/.test(panelWant) ? (target._openKey && target._openKey(panelWant)) : /^row:/.test(panelWant) ? openRowKey(panelWant) : false;
    }, function () {});
    if (!ALL) Array.prototype.forEach.call(main.children, function (k) { if (k.matches('section, .sg-hr')) k.hidden = k !== target; });
    pageTop();
    links.forEach(function (a) { var on = a.getAttribute('href').slice(1) === target.id; a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (target.id === 'index') Object.keys(THUMBS).forEach(function (k) { fitThumb(THUMBS[k]); });
    if (target._dirty) { var drawNow = target._dirty; target._dirty = null; drawNow(); }   // drawn now it shows
    // Its tag says the menu group it sits under (System, Foundations, Components), whatever that label says.
    var tLink = nav.querySelector('a[href="#' + target.id + '"]'), tGroup = tLink && tLink.previousElementSibling;
    while (tGroup && !tGroup.classList.contains('sg-nav-label')) tGroup = tGroup.previousElementSibling;
    var tTag = target.querySelector('.sg-section-badge'); if (tTag && tGroup) tTag.textContent = tGroup.dataset.group || tGroup.textContent;
    if (target.id === 'status') { openTodoKind(at.slug, at.q); setTimeout(a11ySweep, 300); }   // its accessibility number and tasks wait on the try
    underTitle(target);
    // A section's own action level with its title, as a component's Figma and Code links are.
    Array.prototype.forEach.call(target.querySelectorAll(':scope > .sg-section-actions'), function (box) { var t = target.querySelector(':scope > h2'); if (t) box.style.top = (t.offsetTop + (t.offsetHeight - box.offsetHeight) / 2) + 'px'; });
    // Each switch on the page shown says the mode its part is really in: a component's own was set before its page was
    // in the document, when it could not see the page's mode.
    SGModes.syncAll();
    if (!ALL) {
      // Only a page opened (another one than the last): drawn again in place (the Status page filling as components are
      // tried), it keeps where the person is, their scroll and their focus.
      var page = target.id + (target._screen ? '/' + (target._title ? at.slug : '') : ''), fresh = route.at !== page; route.at = page;
      if (fresh) { window.scrollTo(0, 0); requestAnimationFrame(function () { window.scrollTo(0, 0); }); }   // every page opens at its top, the browser's own jump to the address's section undone
      var h = target.querySelector('h1, h2'); document.title = (target._title ? target._title + ' · ' + (srName || 'showroom') + ' · ' : (h && target.id !== 'index' ? titleText(h) + ' · ' : '')) + (DATA.title || 'Design system') + ' · Living style guide';
      if (h && route.ran && fresh) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    route.ran = true; nudge();
  }
  // Every page's title is its name in the menu (Status, Identity, Colors): one name for one place.
  Array.prototype.forEach.call(nav.querySelectorAll('a[href^="#"]'), function (a) {
    var sec = document.getElementById(a.getAttribute('href').slice(1)); if (!sec || sec.classList.contains('pg-card-section')) return;
    var h = sec.querySelector('h1, h2'), name = a.textContent.replace(/\s*\(\d+\)$/, '').trim();
    if (!h || !name) return;
    var words = Array.prototype.find.call(h.childNodes, function (n) { return n.nodeType === 3 && n.nodeValue.trim(); });
    if (words) words.nodeValue = name; else if (!h.children.length) h.textContent = name;   // the actions it holds stay
  });
  // The controls' width: dragged from the line beside them (the arrow keys on it, 16px a press), one width for every
  // component, kept in this browser. A double click (or Escape) gives back the width the page chose.
  (function () {
    var root = document.documentElement, KEY = 'sg-panel-w', MIN = 340;
    // Never narrower than the width the page gives it: only wider, for a long text or a list of options.
    var defaultW = function (card) {
      var sized = root.classList.contains('sg-panel-sized'); if (sized) root.classList.remove('sg-panel-sized');
      var w = card.querySelector('.pg-panel').offsetWidth; if (sized) root.classList.add('sg-panel-sized'); return w;
    };
    var bounds = function (card) { var stage = parseFloat(getComputedStyle(card).getPropertyValue('--sg-stage-min')) || 400, least = defaultW(card); return { min: least, max: Math.max(least, card.clientWidth - stage) }; };
    var say = function (grip) { var card = grip.closest('.pg-preview-card'), p = card && card.querySelector('.pg-panel'); if (!p) return; var b = bounds(card); grip.setAttribute('aria-valuemin', b.min); grip.setAttribute('aria-valuemax', Math.round(b.max)); grip.setAttribute('aria-valuenow', Math.round(p.offsetWidth)); };
    var set = function (w, keep) {
      if (w == null) { root.classList.remove('sg-panel-sized'); root.style.removeProperty('--pg-panel-w'); }
      else { root.style.setProperty('--pg-panel-w', Math.round(w) + 'px'); root.classList.add('sg-panel-sized'); }
      if (keep) try { if (w == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, String(Math.round(w))); } catch (e) { /* this visit only */ }
    };
    try { var kept = parseFloat(localStorage.getItem(KEY)); if (kept >= MIN) set(kept, false); } catch (e) { /* the page's own width */ }
    var clampTo = function (card, w) { var b = bounds(card); return Math.min(b.max, Math.max(b.min, w)); };
    document.addEventListener('pointerdown', function (e) {
      var grip = e.target.closest && e.target.closest('.pg-panel-grip'); if (!grip || e.button !== 0) return;
      var card = grip.closest('.pg-preview-card'), right = card.getBoundingClientRect().right;
      e.preventDefault(); grip.setPointerCapture(e.pointerId); grip.classList.add('is-dragging'); root.classList.add('sg-panel-dragging');
      var move = function (ev) { set(clampTo(card, right - ev.clientX), false); say(grip); };
      var end = function () { grip.classList.remove('is-dragging'); root.classList.remove('sg-panel-dragging'); grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', end); grip.removeEventListener('pointercancel', end); set(card.querySelector('.pg-panel').offsetWidth, true); say(grip); };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    });
    document.addEventListener('dblclick', function (e) { var grip = e.target.closest && e.target.closest('.pg-panel-grip'); if (grip) { set(null, true); say(grip); } });
    document.addEventListener('keydown', function (e) {
      var grip = e.target.closest && e.target.closest('.pg-panel-grip'); if (!grip) return;
      var card = grip.closest('.pg-preview-card'), now = card.querySelector('.pg-panel').offsetWidth, b = bounds(card), w;
      if (e.key === 'ArrowLeft') w = now + 16; else if (e.key === 'ArrowRight') w = now - 16; else if (e.key === 'Home') w = b.max; else if (e.key === 'End') w = b.min;
      else if (e.key === 'Escape') { set(null, true); say(grip); return; } else return;
      e.preventDefault(); set(clampTo(card, w), true); say(grip);
    });
    document.addEventListener('focusin', function (e) { if (e.target.classList && e.target.classList.contains('pg-panel-grip')) say(e.target); });
  })();
  // Every link inside a table to another page of the guide (a component's, a token's) is a link pill: its words, then the
  // arrow, the one style for moving around the guide in a table (a template rule); several in a cell sit side by side,
  // no comma between them. A link out of the guide (a commit, the intent layer's page on GitLab) stays an underlined
  // link. Tables the system draws itself (a preview, a Showroom screen) are its own and left as they are.
  var PILL_SKIP = '.pg-preview, .pg-frame, .pg-frame-stage, .pg-variants, .pg-offstage, .pg-anat-wrap, .sg-thumb, .sg-showroom, thead, .sg-tip';
  function pillLinks(root) {
    // Where a Changelog row's commits changed things besides a component (sg-where-pill) is a pill too, in or out of the
    // guide, so the cell reads as one row of pills.
    Array.prototype.forEach.call((root || document).querySelectorAll('table a[href^="#"]:not(.sg-link-pill):not(.sg-card):not(.sg-mx-go), table a.sg-where-pill:not(.sg-link-pill)'), function (a) {
      if (a.closest(PILL_SKIP) || a.closest('.sg-link-pill')) return;
      a.classList.add('sg-link-pill', 'sg-link-pill--table');
      if (!a.title) a.title = a.textContent.trim();   // its whole name on hover, when the pill cuts it short
      if (!a.querySelector(':scope > .sg-link-words')) { var w = document.createElement('span'); w.className = 'sg-link-words'; while (a.firstChild) w.appendChild(a.firstChild); a.appendChild(w); }
      a.insertAdjacentHTML('beforeend', LINK_GO);
      // The comma between two pills goes: the pills stand apart by themselves.
      var prev = a.previousSibling;
      if (prev && prev.nodeType === 3 && /^\s*,\s*$/.test(prev.nodeValue) && prev.previousSibling && prev.previousSibling.classList && prev.previousSibling.classList.contains('sg-link-pill--table')) prev.nodeValue = ' ';
      var next = a.nextSibling;
      if (next && next.nodeType === 3 && /^\s*,\s*$/.test(next.nodeValue) && next.nextSibling && next.nextSibling.nodeName === 'A' && /^#/.test(next.nextSibling.getAttribute('href') || '')) next.nodeValue = ' ';
    });
  }
  (function () {
    // A page shown in a panel (a component's, opened from the Status page): its badge says the page under the panel first.
    var under = (function () { try { if (window.parent && window.parent !== window) { var ps = window.parent.document.querySelector('.sg-section:not([hidden])'), h = ps && ps.querySelector(':scope > h2'); return h ? titleText(h) : ''; } } catch (e) { /* another origin */ } return ''; })();
    var markUnder = function () { if (under) Array.prototype.forEach.call(document.querySelectorAll('.sg-section-badge:not([data-trail])'), function (b) { if (!b.closest('.sg-panel-head')) b.setAttribute('data-trail', under); }); };
    var queued = false, run = function () { queued = false; pillLinks(document); markUnder(); };
    run();
    if (typeof MutationObserver !== 'undefined') new MutationObserver(function () { if (!queued) { queued = true; setTimeout(run, 0); } }).observe(document.querySelector('.sg-layout') || document.body, { childList: true, subtree: true });
  })();
  // The lowest bar stuck at the top carries the line under it (sg-sticky-edge), on every page alike.
  // Every bar that sticks, chip rows included: the line is always under the lowest one, on every page (a template rule).
  var STICKY = '.sg-hero > h1, .pg-head, .pg-areas, .sg-section:not(.pg-card-section) > h2, .sg-size-switch, .sg-todo-head, .sg-overview-group > h3, .sg-tokens-chips, .pg-card-section .pg-par-sum', stickQueued = false;
  function markStuck() {
    stickQueued = false;
    var edge = null;
    Array.prototype.forEach.call(main.querySelectorAll(STICKY), function (el) {
      el.classList.remove('sg-sticky-edge', 'sg-sticky-band');
      if (!el.offsetParent || window.scrollY <= 0) return;
      if (el.getBoundingClientRect().top <= (parseFloat(getComputedStyle(el).top) || 0) + 1) { if (!edge || el.getBoundingClientRect().bottom > edge.getBoundingClientRect().bottom) edge = el; }
    });
    if (edge) {
      edge.classList.add('sg-sticky-edge');
      // The gap under it only where a table's head sticks below it: elsewhere nothing is cut above the content.
      var page = edge.closest('.sg-section');
      if (page && page.querySelector('.pg-inspect-head, .pg-par-table, .sg-token-card thead')) edge.classList.add('sg-sticky-band');
    }
  }
  window.addEventListener('scroll', function () { if (!stickQueued) { stickQueued = true; requestAnimationFrame(markStuck); } }, { passive: true });
  window.addEventListener('hashchange', route);
  // Skip to content: the title of the page shown, so the next Tab is inside it.
  var skip = document.querySelector('[data-skip]');
  if (skip) { skip.className += ' sg-btn'; skip.addEventListener('click', function (e) { e.preventDefault(); var h = document.getElementById(hashParts().id || homeId()); h = h && h.querySelector('h1, h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } }); }
  window.addEventListener('resize', function () { underTitle(document.getElementById(hashParts().id || homeId())); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { underTitle(document.getElementById(hashParts().id || homeId())); });
  // What a module (ds-config.json → styleguide.modules, inlined after this script) builds with: the page's own buttons,
  // selects and side panel, the system's tokens, and the place beside the Theme choice (made when the system has no
  // brands, so a module's control always has one).
  window.SG = {
    esc: esc, sysButton: sysButton, customSelect: customSelect, sidePanelPage: sidePanelPage,
    tokens: TOKENS, allVars: DATA.allVars || [], brands: BRANDS, title: DATA.title || '', components: COMPONENTS,
    // A component's markup as the page draws it: its first rendering (the code's own), else the markup read from it.
    markupOf: function (c) { return (c && c.renders && c.renders[0] && c.renders[0].markup) || (c && c.markup) || ''; },
    // The Showroom's screens, and one drawn in a box as its card draws it (inert, scaled to the box): drawScreen returns
    // the screen's element and its fit, to call again when the box changes size.
    axes: AXES,   // the system's modes: each { attr, colour, values: [{ label, value }] }
    icons: { figma: FIGMA_SVG },
    redraw: function () { redrawAll(); },   // every page drawn again: a module's theme applied over the brand   // the page's own marks, so a module draws them alike
    brandChoice: BRAND_CTL,   // the Theme choice: { select, set(brand), refresh(), sync() }, when the system has brands
    screens: DATA.showroom || [],
    drawScreen: function (s, box) {
      if (!s || !s.markup || typeof drawAt !== 'function') return null;
      var el = document.createElement('div'); el.className = 'sg-showroom sg-showroom-screen'; el.setAttribute('inert', ''); el.innerHTML = s.markup;
      Array.prototype.forEach.call(el.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
      box.innerHTML = ''; box.appendChild(el);
      var fit = drawAt(s, el, box); fit();
      return { el: el, fit: fit };
    },
    openPanel: function (o) {
      var m = panelShell(o.id || 'sg-module-panel', o.title || 'Panel');
      m.querySelector('.sg-row-detail').innerHTML = sidePanelPage({ crumbs: o.crumbs || [], title: o.title || '', body: o.body || '' });
      panelShow(m, o.from || document.activeElement);
      if (o.onOpen) o.onOpen(m.querySelector('.sg-panel-body'), m);
      return { el: m, close: function () { m._shut(); } };
    },
    themeBar: function () {
      var bar = mount && mount.querySelector('.sg-brand-ctl');
      if (!bar && mount) { bar = document.createElement('div'); bar.className = 'sg-brand-ctl'; mount.appendChild(bar); }
      return bar || null;
    },
    on: function (type, fn) { document.addEventListener(type, fn); }
  };
  route();
  document.documentElement.classList.add('sg-ready');   // drawn: the page shows, never its empty shell first
})();
