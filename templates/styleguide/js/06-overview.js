  /* ── Overview ─────────────────────────────────────────────────────────────────────────────────────────────── */
  // The menu's first group under its own label, as Foundations and Components are under theirs.
  (function () { var lab = document.createElement('div'); lab.className = 'sg-nav-label'; lab.textContent = 'System'; nav.appendChild(lab); })();
  navLink('index', 'index'); nav.querySelector('a[href="#index"]').hidden = true;   // the index stays built, off the menu: the page opens on Status
  var ov = document.getElementById('index');
  if (START && START !== 'index') ov.hidden = true;   // built hidden, as the other pages (section)
  document.getElementById('sg-hero-title').textContent = DATA.title || 'Design system';
  // Its links (the Figma file, the code) at the right of its title, with their marks, as a component's are: they stick
  // with the title as the page scrolls.
  if ((DATA.links || []).length) {
    var ovTitle = document.getElementById('sg-hero-title'), ovActs = document.createElement('div'); ovActs.className = 'sg-section-actions';
    ovActs.innerHTML = headLinksHTML(DATA.links.map(sourceLink));
    ovTitle.appendChild(ovActs);
  }
  // A page for some components only (--component X --styleguide): which ones, what they nest, and where the rest is.
  if (DATA.scope) { var sc = DATA.scope, sp = document.createElement('div'); sp.className = 'sg-pending sg-scope'; sp.innerHTML = '<b>This page shows ' + esc(sc.asked.join(', ')) + (sc.nested.length ? ' and the components ' + (sc.asked.length > 1 ? 'they nest' : 'it nests') + ': ' + esc(sc.nested.join(', ')) : '') + '.</b> The whole system\'s style guide: <code>rms-design-system-engine --styleguide</code>'; ov.appendChild(sp); }
  // Two groups, as the page has them: the foundations, then every component in the order of its sections. Each card
  // is a thumbnail (a few of the real tokens, or the component itself, drawn when its section is built) and its name.
  // Each group says what it holds (styleguide.groups in ds-config.json words it your way).
  function group(title, desc, n) { var g = document.createElement('div'); g.className = 'sg-overview-group'; g.innerHTML = '<h3>' + esc(title) + (n != null ? countHTML(n) : '') + '</h3>';   /* the group's name only: the cards say the rest */ var grid = document.createElement('div'); grid.className = 'sg-card-grid'; g.appendChild(grid); ov.appendChild(g); return grid; }
  var GROUPS = DATA.groups || {};
  // How ready it is, as a small label: only what the team said, never a guess.
  function statusPill(st) { return st ? '<span class="sg-status sg-status--' + esc(st.kind) + '">' + esc(st.status) + '</span>' : ''; }
  // What a component's header and its card say at a glance, from what the page already holds: the release its last
  // change shipped in and that change's date (its changelog), how it stands with Figma (Parity: what differs, what the
  // code does not build) and with accessibility (the last browser check), and how many products use it.
  // → { version, changed, parity: { say, todo }, a11y: { say, todo }, used }
  function factsOf(c) {
    var log = c.changelog || [], rel = log.find(function (r) { return r.release; });
    // Parity counts what its table marks too (a row that differs, one only in Figma or only in code), what differs
    // counted once whether the audit or the table says so.
    var p = c.parity && c.parity.counts, rows = (c.parity && c.parity.rows) || [], st = { differs: 0, figma: 0, code: 0 };
    rows.forEach(function (r) { if (r.status in st) st[r.status]++; });
    var differ = Math.max(p ? p.differ : (c.differences || []).length, st.differs), unbuilt = p ? p.notBuilt : (c.unbuilt || []).length;
    var parity = differ || unbuilt || st.figma || st.code ? { say: [differ ? (differ === 1 ? '1 difference' : differ + ' differences') : '', st.figma ? st.figma + ' only in Figma' : '', st.code ? st.code + ' only in code' : '', unbuilt ? unbuilt + ' not built' : ''].filter(Boolean).join(', '), todo: true }
      : { say: p && p.notCompared ? 'Agrees, ' + p.notCompared + ' not compared' : 'Agrees', todo: false };
    var ch = c.a11y && c.a11y.checked, n = ch && !ch.notRead ? ch.issues.reduce(function (s, i) { return s + ((i.details || []).length || 1); }, 0) : 0;
    n += (c.a11yFindings || []).length;   // what the audit found (a text's contrast) counts too
    var a11y = n ? { say: n === 1 ? '1 problem' : n + ' problems', todo: true } : !ch || ch.notRead ? { say: 'Not checked in a browser yet', todo: false } : { say: 'No problem found', todo: false };
    var used = (c.usage || []).length;
    return { version: rel ? rel.release : log.length ? 'Merged, no release tag yet' : null, changed: log.length ? String(log[0].date).slice(0, 10) : null, changedAt: log.length ? log[0].date : null, parity: parity, a11y: a11y, used: used };
  }
  function factsHTML(c) {
    var f = factsOf(c), item = function (k, v, todo) { return '<div><dt>' + esc(k) + '</dt><dd' + (todo ? ' class="sg-fact-todo"' : '') + '>' + esc(v) + '</dd></div>'; };
    // Under its name, only its version and when it last changed (date and time); how it stands with Figma and with
    // accessibility is on its areas (their alert icons) and its overview card.
    return (f.version || f.changedAt) ? '<dl class="pg-facts">' + (f.version ? item('Version', f.version) : '') + (f.changedAt ? item('Last changed', when(f.changedAt)) : '') + '</dl>' : '';
  }
  var THUMBS = {};
  function card(grid, id, label, title, sub, thumb, status, facts) {
    var a = document.createElement('a'); a.className = 'sg-card' + (DATA.ui && DATA.ui.card ? ' ' + DATA.ui.card.cls : ' sg-card--own'); a.href = '#' + id; a.dataset.name = title.toLowerCase();
    // The thumbnail and the name, with how ready it is when the team said so: the group heading says what it is.
    a.innerHTML = '<div class="sg-thumb" aria-hidden="true">' + (thumb || '') + '</div><h3>' + esc(title) + (status ? ' ' + statusPill(status) : '') + '</h3>' + (facts || '');
    grid.appendChild(a); THUMBS[id] = a.querySelector('.sg-thumb'); return a;
  }
  var fGrid = group('Foundations', GROUPS.foundations || 'The values every component is made of: colours, type, spacing, radii and icons, each the token itself, in every mode.');
  var ramp = ((TOKENS.colors || [])[0] || { items: [] }).items, step = Math.max(1, Math.floor(ramp.length / 5));
  if (FLAT.length) card(fGrid, 'colors', 'Foundations', 'colors', FLAT.length + ' colour tokens, in every mode.', ramp.filter(function (t, i) { return i % step === 0; }).slice(0, 5).map(function (t) { return '<span class="sg-thumb-dot" style="background:var(' + esc(t.var) + ')"></span>'; }).join(''));
  if ((TOKENS.typography || []).length) card(fGrid, 'typography', 'Foundations', 'typography', TOKENS.typography.length + ' text styles.', TOKENS.typography.map(function (t) { return '<span style="' + (t.size ? 'font-size:var(' + esc(t.size.var) + ');' : '') + (t.weight ? 'font-weight:var(' + esc(t.weight.var) + ')' : '') + '">Aa</span>'; }).join(''));
  if ((TOKENS.spacing || []).length) card(fGrid, 'spacing', 'Foundations', 'spacing', TOKENS.spacing.length + ' gap and padding tokens.', '<div class="sg-thumb-col">' + TOKENS.spacing.slice().sort(function (a, b) { return parseFloat(a.value) - parseFloat(b.value); }).filter(function (t, i, all) { return i % Math.max(1, Math.floor(all.length / 4)) === 0; }).slice(0, 4).map(function (t) { return '<span class="sg-thumb-bar" style="width:calc(var(' + esc(t.var) + ') * 4)"></span>'; }).join('') + '</div>');
  if ((TOKENS.radii || []).length) card(fGrid, 'radii', 'Foundations', 'radii', TOKENS.radii.length + ' radius tokens.', TOKENS.radii.slice(0, 4).map(function (t) { return '<span class="sg-thumb-box" style="border-radius:var(' + esc(t.var) + ')"></span>'; }).join(''));
  // An easing's curve, time across and progress up, drawn in the text colour: on the motion page and its card.
  function motionCurve(b) {
    if (!b) return '';
    var x = function (v) { return (2 + v * 36).toFixed(1); }, y = function (v) { return (38 - v * 36).toFixed(1); };
    return '<svg class="sg-motion-curve" viewBox="0 0 40 40" aria-hidden="true"><path class="sg-motion-axis" d="M2 2V38H38"/><path d="M' + x(0) + ' ' + y(0) + 'C' + x(b[0]) + ' ' + y(b[1]) + ' ' + x(b[2]) + ' ' + y(b[3]) + ' ' + x(1) + ' ' + y(1) + '"/></svg>';
  }
  var MOT = DATA.motion || null, motN = MOT ? (MOT.durations || []).length + (MOT.easings || []).length : 0;
  var motTimings = MOT ? (MOT.overview || []).filter(function (r) { return !r.unused; }).length : 0;
  // A text style's sample: a line in small letters and capitals with figures and signs, told with the system's own
  // counts (never a project's name), then its capitals and figures.
  var SPECIMEN = (function () {
    var n = function (v) { return Number(v || 0).toLocaleString('en'); }, comps = COMPONENTS.length, styles = (TOKENS.typography || []).length, icons = (DATA.icons || []).length;
    return comps && styles ? 'Quick fox: ' + n(comps) + ' components, ' + n(styles) + ' text styles' + (icons ? ' & ' + n(icons) + ' icons' : '') + '. Zero lazy dogs, 100% system!' : 'Jackdaws love my big sphinx of quartz: 1,234,567,890 times!';
  })();
  // An easing as its curve's four numbers: the browser's named ones, or the cubic-bezier the code writes.
  function bezierOf(e) {
    var named = { linear: [0, 0, 1, 1], ease: [0.25, 0.1, 0.25, 1], 'ease-in': [0.42, 0, 1, 1], 'ease-out': [0, 0, 0.58, 1], 'ease-in-out': [0.42, 0, 0.58, 1] };
    var k = String(e || 'ease').trim().toLowerCase(), m = k.match(/^cubic-bezier\(([^)]+)\)$/);
    if (named[k]) return named[k];
    if (m) { var n = m[1].split(',').map(parseFloat); return n.length === 4 && n.every(function (v) { return isFinite(v); }) ? n : null; }
    return null;
  }
  // The card's preview: the timings the components move with most, each its curve and a dot crossing in its own
  // duration and easing (then resting), from the code's own values; the system's easing tokens when it has no timings.
  function motionThumb() {
    // The curve the components move with most (else the system's first easing), large, and a dot travelling along it:
    // time across, progress up. Nothing to read: the picture is the motion. Still when less motion is asked for.
    var top = (MOT.overview || []).filter(function (r) { return !r.unused && r.ms && r.ms <= 10000; }).slice().sort(function (a, b) { return (b.uses || []).length - (a.uses || []).length; })[0];
    var b = top ? bezierOf(top.easing) : ((MOT.easings || [])[0] || {}).bezier;
    b = b || [0.25, 0.1, 0.25, 1];
    var X = function (v) { return (12 + v * 176).toFixed(1); }, Y = function (v) { return (108 - v * 96).toFixed(1); };
    var d = 'M' + X(0) + ' ' + Y(0) + ' C' + X(b[0]) + ' ' + Y(b[1]) + ' ' + X(b[2]) + ' ' + Y(b[3]) + ' ' + X(1) + ' ' + Y(1);
    return '<div class="sg-thumb-spline"><svg viewBox="0 0 200 120" aria-hidden="true"><path class="sg-thumb-spline-axis" d="M12 12V108H188"/><path class="sg-thumb-spline-curve" d="' + d + '"/></svg><span class="sg-thumb-spline-dot" style="offset-path: path(\'' + d + '\')"></span></div>';
  }
  if (MOT && (MOT.overview || []).length) card(fGrid, 'motion', 'Foundations', 'motion', motTimings ? motTimings + (motTimings === 1 ? ' timing' : ' timings') + ' the components move with.' : motN + ' duration and easing tokens.', motionThumb());
  if ((DATA.icons || []).length) card(fGrid, 'icons', 'Foundations', 'icons', DATA.icons.length + ' icons from the system\'s sheet.', DATA.icons.slice(0, 5).map(function (id) { return '<svg width="24" height="24" aria-hidden="true"><use href="#' + esc(id) + '"/></svg>'; }).join(''));
  var cGrid = COMPONENTS.length ? group('Components', GROUPS.components || 'Each one drawn from the code itself, with what Figma and the code agree on. Open one to try it, read how to use it and see where it is used.', COMPONENTS.length) : null;
  // Its Figma description, else its note, else the props it offers.
  var about = function (c) {
    var d = (c.description || '').replace(/@\w+/g, '').trim() || (c.note || '').trim(); if (d) return d;
    var ps = (c.controls || []).map(function (p) { return p.label; });
    return ps.length ? ps.slice(0, 3).join(', ') + (ps.length > 3 ? ' and ' + (ps.length - 3) + ' more' : '') + '.' : c.role ? 'A ' + c.role + '.' : 'No props yet.';
  };
  COMPONENTS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) { if (!parentOf(c.name)) card(cGrid, cid(c.name), 'Components', c.name, about(c), '', c.status); });   // its card: the thumbnail and the name only
  // A component's thumbnail is its own preview, drawn small and inert, once its section has drawn it. Never with ?all:
  // the engine measures that page, and a shrunken copy would be read as the component.
  function thumbOf(c, src) {
    var at = THUMBS[cid(c.name)]; if (!at || !src || ALL) return;
    at.innerHTML = ''; var k = src.cloneNode(true); k.classList.add('sg-thumb-live'); k.setAttribute('inert', ''); at.appendChild(k);
    if (!ov.hidden) fitThumb(at);   // the index hidden: fitted when it opens (route), nothing to measure before
  }
  // Scaled to fit its card once the overview is on screen (a hidden card has no size to fit). What it draws is measured,
  // not only its own box: a part may reach past it (a modal's buttons wider than its panel, a row wider than its cell),
  // and what a part clips (a list that scrolls) is not drawn. The drawing is then centred in the picture.
  function fitThumb(at) {
    var k = at.querySelector('.sg-thumb-live'); if (!k || !at.clientWidth) return;
    // A still picture: a component's own animation (a modal that scales in) would hold its transform over the fit.
    k.style.animation = 'none'; k.style.transition = 'none'; k.style.transform = '';
    // Squeezed to the card, a component can spill out of its own box (a modal's buttons past its panel): it is drawn
    // as wide as its content needs, then scaled down with the rest.
    k.style.width = ''; k.style.maxWidth = '';
    var over = k.scrollWidth - k.clientWidth; if (over > 1) { k.style.maxWidth = 'none'; k.style.width = (k.offsetWidth + over) + 'px'; }
    var L = Infinity, T = Infinity, R = -Infinity, B = -Infinity;
    (function drawn(e) {
      var s = getComputedStyle(e); if (s.display === 'none') return;
      var b = e.getBoundingClientRect();
      if (s.visibility !== 'hidden' && b.width * b.height >= 1) { L = Math.min(L, b.left); T = Math.min(T, b.top); R = Math.max(R, b.right); B = Math.max(B, b.bottom); }
      if (e !== k && s.overflowX !== 'visible' && s.overflowY !== 'visible') return;
      for (var i = 0; i < e.children.length; i++) drawn(e.children[i]);
    })(k);
    if (!(R > L && B > T)) return;
    var a = at.getBoundingClientRect(), kb = k.getBoundingClientRect();
    var f = Math.min(1, (at.clientWidth - 24) / (R - L), (at.clientHeight - 24) / (B - T));
    var cx = (kb.left + kb.right) / 2, cy = (kb.top + kb.bottom) / 2;
    var tx = (a.left + a.right) / 2 - cx - f * ((L + R) / 2 - cx), ty = (a.top + a.bottom) / 2 - cy - f * ((T + B) / 2 - cy);
    if (f < 1 || Math.abs(tx) > 0.5 || Math.abs(ty) > 0.5) k.style.transform = 'translate(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px) scale(' + f.toFixed(3) + ')';
  }
  // Health: the system as a dashboard, how far each area has come weighted into one number, and the
  // components with the most left (fillHealth, from the rows the Status page lists). No task is listed here: they are
  // on the Status page.
  // Showroom: whole screens the design team drew in Figma, written with the system's own components (DATA.showroom,
  // each a showroom/<Screen>.vue the project's build draws), shown in the brand and mode chosen. The page lists them as
  // a grid of cards, each its screen in small; a card opens the screen on a page of its own (#showroom/<Screen>), beside
  // what the code still lacks for it (its stand-ins) and where the code's component differs from Figma's.
  var SHOWROOM_CARD = null;   // a Showroom screen's card, for a component's Used in
  if ((DATA.showroom || []).length) {
    hr(); navLink('showroom', 'showroom');
    var sr = section('showroom', 'System', 'Showroom', '');
    var brandNameOf = function (k) { var b = ((DATA.brands && DATA.brands.list) || []).filter(function (x) { return x.key === k; })[0]; return b ? b.name : k; };
    var srLead = sr.querySelector(':scope > p');
    var srGrid = document.createElement('div'); srGrid.className = 'sg-card-grid sg-showroom-grid'; sr.appendChild(srGrid);
    var srDetail = document.createElement('div'); srDetail.className = 'sg-showroom-detail'; srDetail.hidden = true; sr.appendChild(srDetail);
    var SCREENS = {}, fits = [], detailFit = null, srMeasured = null;
    var metaOf = function (s) { return [s.brand ? 'Designed in ' + brandNameOf(s.brand) : '', s.modes ? Object.keys(s.modes).map(function (k) { return s.modes[k]; }).join(' · ') : ''].filter(Boolean).join(' · '); };
    // A screen drawn at Figma's size, at the breakpoint Figma's screen is designed at (its Laptop sizes) whatever the
    // window, its colour mode following the page's switch; scaled to the room its box has, never wider.
    // The system's breakpoint switch (its axis with Laptop and Desktop), and a screen's frame at each: the screen is
    // laid out to the frame's width (it is liquid), as tall as Figma's screen in proportion. Auto takes the room there
    // is (Desktop from 1440px, never under Laptop's 1024px); only Laptop and Desktop, the breakpoints these screens hold.
    var BP_AXIS = AXES.filter(function (a) { return !a.colour && a.attr && a.values.some(function (x) { return /^laptop$/i.test(x.label); }); })[0] || null;
    var BP_LABEL = { laptop: 'Laptop', desktop: 'Desktop' };
    var frameOf = function (s, choice, room) {
      var fw = (s.size && s.size[0]) || 1280, fh = (s.size && s.size[1]) || 800, w = choice === 'desktop' ? 1440 : choice === 'laptop' ? fw : Math.max(1024, Math.round(room));
      return { w: w, h: Math.round(w * fh / fw), bp: choice === 'auto' ? (w >= 1440 ? 'desktop' : 'laptop') : choice };
    };
    var setBreakpoint = function (screen, bp) {
      if (!BP_AXIS) return;
      var v = BP_AXIS.values.filter(function (x) { return String(x.label).toLowerCase() === bp; })[0];
      if (v && v.value) screen.setAttribute(BP_AXIS.attr, v.value); else screen.removeAttribute(BP_AXIS.attr);
    };
    // A screen in its box: its frame (pick, from the room the box has; else Figma's own size), its breakpoint, scaled
    // down only when the frame is wider than the box.
    var drawAt = function (s, screen, box, pick) {
      // On a screen's page the room is its column's (the stage's holder), and the stage hugs the screen drawn in it:
      // a frame narrower than the column leaves no empty band beside the screen.
      var room = function () { return pick && box.parentElement && box.parentElement.classList.contains('sg-showroom-room') ? box.parentElement.clientWidth : box.clientWidth; };
      var named = Object.keys(s.modes || {}).map(function (k) { return String(s.modes[k]).toLowerCase(); });
      AXES.forEach(function (a) { if (a.colour || !a.attr) return; var v = a.values.filter(function (x) { return named.indexOf(String(x.label).toLowerCase()) >= 0; })[0]; if (v && v.value) screen.setAttribute(a.attr, v.value); });
      // Its frame from the start, before the system's components measure the room they have (a table drops its
      // fixed column widths when it thinks it overflows).
      var first = pick ? pick(room() || 1280) : frameOf(s, 'laptop', 0);
      screen.style.width = first.w + 'px'; screen.style.height = first.h + 'px';
      if (pick) setBreakpoint(screen, first.bp);
      return function () {
        if (box.hasAttribute('data-measuring')) return;   // held still while the build measures it at Figma's size
        if (screen.closest('.sg-showroom-full')) return;   // full browser: the window sizes it, not its place on the page
        var r = room(); if (!r) return;
        var f = pick ? pick(r) : frameOf(s, 'laptop', 0);
        screen.style.width = f.w + 'px'; screen.style.height = f.h + 'px';
        if (pick) setBreakpoint(screen, f.bp);
        var k = Math.min(1, r / f.w); screen.style.transform = 'scale(' + k + ')'; box.style.height = Math.ceil(f.h * k) + 'px';
        if (pick) box.style.width = Math.floor(f.w * k) + 'px';
        screen.dataset.frame = f.bp;
      };
    };
    // The breakpoint: the screen fills the room it has (never under its least), unless the build's measurement asks for
    // Laptop (Figma's).
    var frameChoice = function () { return window.__dseShowroomFrame || 'auto'; };
    // The grid: one card a screen, the screen itself in small (its drawing, nothing in it to reach or read twice).
    // A screen's card: its name and the screen in small; its fit (drawn again to the card's width) on a._fit.
    // The screens' drawings are in a later file (styleguide-files.mjs): a card made before it is here gets its screen once
    // it is; the grid's cards wait for the Showroom to open, a card shown elsewhere (a component's Used in) asks for it.
    var srPending = function (s) { return s.markup === '' && !laterHere('showroom'); }, srWaiting = [];
    var srLoad = function () {
      needLater('showroom', function (ok) {
        if (!ok) return;
        srWaiting.splice(0).forEach(function (w) { w(); });
        var at = srDetail.dataset.at; if (at && !srDetail.hidden) { delete srDetail.dataset.at; sr._screen(at); }
        if (typeof refit === 'function') refit();
      });
    };
    var screenCard = function (s, wait) {
      var a = document.createElement('a'); a.className = 'sg-card' + (DATA.ui && DATA.ui.card ? ' ' + DATA.ui.card.cls : ' sg-card--own'); a.href = '#showroom/' + encodeURIComponent(s.key); a.dataset.screenKey = s.key;
      a.innerHTML = '<h3>' + esc(s.title || s.key) + '</h3>';   // the screen's name alone
      var thumb = document.createElement('div'); thumb.className = 'sg-thumb sg-showroom-thumb'; thumb.setAttribute('aria-hidden', 'true');
      var draw = function () {
        if (!s.markup) return;
        var small = document.createElement('div'); small.className = 'sg-showroom sg-showroom-screen'; small.setAttribute('inert', ''); small.innerHTML = s.markup;
        Array.prototype.forEach.call(small.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
        Array.prototype.forEach.call(small.querySelectorAll('a, button, input, select, textarea, [tabindex]'), function (e) { e.setAttribute('tabindex', '-1'); });
        thumb.appendChild(small); a._draw = drawAt(s, small, thumb); a._draw();
      };
      // Its fit, whenever its screen is drawn: until then, nothing to size.
      if (s.markup || srPending(s)) a._fit = function () { if (a._draw) a._draw(); };
      if (srPending(s)) { srWaiting.push(draw); if (!wait) srLoad(); } else draw();
      a.insertBefore(thumb, a.firstChild);
      return a;
    };
    SHOWROOM_CARD = screenCard;
    // The grid's filter: the screens grouped by product (a screen's own "product", else the brand it is drawn in), All
    // first, then each group in the order its first screen comes; any number of products. Each choice has its own
    // address (#showroom/<product>), so it can be linked to; #showroom alone is always All. A segmented control while the
    // groups are few, a dropdown when there are many. Hidden on a screen's page.
    var groupOf = function (s) { return String(s.product || s.brand || ''); };
    var groupName = function (g) { var b = ((DATA.brands && DATA.brands.list) || []).filter(function (x) { return x.key === g; })[0]; return b ? b.name : g; };
    var GROUPS = []; DATA.showroom.forEach(function (s) { var g = groupOf(s); if (g && GROUPS.indexOf(g) < 0) GROUPS.push(g); });
    var srGroup = 'all';
    var srFilter = null;
    var showGroup = function (g) {
      srGroup = g;
      Array.prototype.forEach.call(srGrid.children, function (a) { a.hidden = g !== 'all' && groupOf(SCREENS[a.dataset.screenKey] || {}) !== g; });
      if (srFilter) Array.prototype.forEach.call(srFilter.querySelectorAll('.sg-chip'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === g ? 'true' : 'false'); });
      if (typeof refit === 'function') refit();   // the cards shown sized to the room (not yet there on the first draw)
    };
    if (GROUPS.length > 1) {
      var count = function (g) { return DATA.showroom.filter(function (s) { return g === 'all' || groupOf(s) === g; }).length; };
      var opts = [{ v: 'all', label: 'All', count: count('all') }].concat(GROUPS.map(function (g) { return { v: g, label: groupName(g), count: count(g) }; }));
      srFilter = document.createElement('div'); srFilter.className = 'sg-size-switch sg-showroom-groups';
      // The products as chips, each with its count in the badge; they wrap however many there are.
      srFilter.innerHTML = '<span class="sg-chips" role="group" aria-label="Product">' + opts.map(function (o) { return '<button type="button" class="sg-chip" data-v="' + esc(o.v) + '" aria-pressed="' + (o.v === srGroup) + '">' + esc(o.label) + countHTML(o.count) + '</button>'; }).join('') + '</span>';
      srGrid.insertAdjacentElement('beforebegin', srFilter);
      // A choice goes to its own address; the router shows it (and Back returns to the one before).
      var goGroup = function (g) { location.hash = '#showroom' + (g === 'all' ? '' : '/' + encodeURIComponent(g)); };
      Array.prototype.forEach.call(srFilter.querySelectorAll('.sg-chip'), function (b) { b.addEventListener('click', function () { if (b.dataset.v !== srGroup) goGroup(b.dataset.v); }); });
    }
    DATA.showroom.forEach(function (s) {
      SCREENS[s.key] = s;
      var a = screenCard(s, true);
      if (a._fit) fits.push(a._fit);
      srGrid.appendChild(a);
    });
    if (srFilter) showGroup(srGroup);
    var refit = function () { fits.forEach(function (f) { f(); }); if (detailFit) detailFit(); };
    var sro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(refit) : null; if (sro) sro.observe(sr);
    document.addEventListener('sg-brand', refit);
    // How a screen measured against Figma when the page was built (the build writes it in): how many texts and parts
    // are off, each with how far, as an accordion of its own.
    var fillMeasure = function (box) {
      var r = srMeasured && srMeasured[box.getAttribute('data-measure-for')]; if (!r) return;
      var ok = !r.off;
      box.innerHTML = '<h4>Measured against Figma</h4><p class="sg-showroom-kind">' + (ok ? 'Every text and part within ' + r.tol + 'px of Figma.' : r.off + ' texts or parts more than ' + r.tol + 'px off, the furthest first.') + '</p>' +
        (ok ? '' : '<ul>' + r.lines.slice(0, 30).map(function (l) { var at = l.indexOf(': '); return '<li><details class="sg-acc"><summary><span class="sg-acc-title"><b>' + esc(at > 0 ? l.slice(0, at) : l) + '</b></span><span class="sg-acc-mark" aria-hidden="true"></span></summary><p>' + esc(at > 0 ? l.slice(at + 2) : '') + '</p></details></li>'; }).join('') + '</ul>');
      box.hidden = false;
    };
    window.__dseShowroomMeasure = function (m) { srMeasured = m; Array.prototype.forEach.call(srDetail.querySelectorAll('[data-measure-for]'), fillMeasure); };
    if (window.__dseShowroomMeasured) srMeasured = window.__dseShowroomMeasured;
    window.__dseShowroomKeys = Object.keys(SCREENS);
    // The screens built to run (DATA.showroomLive): loaded once, each mounted where its drawing is when its page opens,
    // so a person uses it as the product does; the drawing stays when it cannot run.
    if (DATA.showroomLive && DATA.showroomLive.js) {
      try {
        var lst = document.createElement('style'); lst.id = 'sg-showroom-css'; lst.textContent = DATA.showroomLive.css || ''; document.head.appendChild(lst);
        var lsc = document.createElement('script'); lsc.textContent = DATA.showroomLive.js; document.head.appendChild(lsc);
      } catch (e) { /* the drawings stay */ }
    }
    // A screen's own page: the screen as wide as the page lets it, what it lacks and where it differs beside it (under
    // it on a narrower window). Drawn when it is first opened, so the grid's page carries one screen at a time.
    // A screen's notes, numbered as their pins on the screen: what the code lacks (a stand-in for now), what this screen
    // corrects, and what it draws as the code has it.
    var NOTE_KIND = { missing: 'Missing in the code', fixed: 'Fixed in this screen', code: 'As the code has it' };
    var notesOf = function (s) {
      return (s.missing || []).map(function (x) { return { n: x, kind: 'missing', sub: x.kind + (x.standIn ? ', a stand-in for now' : '') }; })
        .concat((s.differs || []).map(function (x) { return { n: x, kind: x.fixedHere === false ? 'code' : 'fixed', sub: x.fixedHere === false ? 'drawn as the code has it' : 'corrected in this screen' }; }))
        .map(function (x, i) { x.no = i + 1; return x; });
    };
    // Where a note's part is on the screen: the element its note points at (at, a selector in the screen's own list),
    // else the one named for it (data-figma, or a stand-in's data-stand-in); a note naming several parts is pinned on
    // the first found, the words in brackets left out.
    var partOf = function (screen, n) {
      if (n.at) { try { var hit = screen.querySelector(n.at); if (hit) return hit; } catch (e) { /* not a selector */ } }
      var names = String(n.name || '').split(/,/).map(function (x) { return x.replace(/\(.*?\)/g, '').trim(); }).filter(Boolean);
      for (var i = 0; i < names.length; i++) {
        var nm = names[i], all = screen.querySelectorAll('[data-figma], [data-stand-in]');
        var el = Array.prototype.find.call(all, function (e) { return e.getAttribute('data-figma') === nm || e.getAttribute('data-stand-in') === nm; });
        if (el) return el;
      }
      return null;
    };
    var noteItem = function (x) {
      // Its part and what differs in a line (say); the whole of it under it, opened.
      return '<li class="sg-note" data-note="' + x.no + '" data-kind="' + x.kind + '"><details class="sg-acc"><summary><span class="sg-note-no sg-pin--' + x.kind + '" aria-hidden="true">' + x.no + '</span><span class="sg-acc-title"><b>' + esc(x.n.name) + '</b><span class="sg-showroom-kind">' + esc(x.n.say || x.sub) + '</span></span><span class="sg-acc-mark" aria-hidden="true"></span></summary><p>' + esc(x.n.what || '') + '</p></details></li>';
    };
    // A screen's page review, under it: the review read from its code (one main action, nothing destructive in front,
    // no card in a card, headings in order), its score and each finding with its line; then, when a model judged it on
    // its screenshot (--judge-pages), each decision named with its verdict, what it saw and the sentence to check,
    // said plainly to be a model's judgment and advisory. The build writes the last judgment in (srJudged).
    var srJudged = window.__dseShowroomJudged || null;
    var VERDICT = { holds: 'Holds', breaks: 'Breaks', unclear: 'Unclear' };
    var reviewHTML = function (s) {
      var rv = s.review, j = (srJudged && srJudged[s.key]) || s.judged;
      if (!rv && !j) return '';
      var acc = function (title, kind, body) { return '<li><details class="sg-acc"><summary><span class="sg-acc-title"><b>' + esc(title) + '</b>' + (kind ? '<span class="sg-showroom-kind">' + esc(kind) + '</span>' : '') + '</span><span class="sg-acc-mark" aria-hidden="true"></span></summary>' + body + '</details></li>'; };
      var out = '<section class="sg-showroom-gaps sg-showroom-review" aria-label="Page review" data-review-for="' + esc(s.key) + '">';
      if (rv) {
        var fs = rv.findings || [];
        out += '<h3>Page review</h3><p class="sg-showroom-kind">Read from its code: ' + esc(String(rv.score)) + '/10. ' + (fs.length ? fs.length + ' thing' + (fs.length === 1 ? '' : 's') + ' a page should not do.' : 'Nothing a page should not do.') + ' Advisory.</p>' +
          (fs.length ? '<ul>' + fs.map(function (f) { return '<li class="sg-showroom-review-row"><span class="sg-acc-title"><b>' + esc(f.message) + '</b>' + (f.line != null ? '<span class="sg-showroom-kind">Line ' + esc(String(f.line)) + '</span>' : '') + '</span></li>'; }).join('') + '</ul>' : '');
      }
      if (j) {
        var jf = j.findings || [], un = j.unjudged || [], when = j.at ? new Date(j.at) : null;
        out += '<h3>Judged by a model</h3><p class="sg-showroom-kind">A model read its screenshot and its code against ' + jf.length + ' named decision' + (jf.length === 1 ? '' : 's') + (when && !isNaN(when) ? ' on ' + when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '') + '. Advisory: a person checks each one.</p>' +
          '<ul>' + jf.map(function (f) { return acc(f.label || f.decision, (VERDICT[f.verdict] || f.verdict) + (f.verdict === 'holds' ? '' : ' · ' + f.severity), (f.evidence ? '<p>' + esc(f.evidence) + '</p>' : '') + (f.check ? '<p>Check: ' + esc(f.check) + '</p>' : '')); }).join('') + '</ul>' +
          (un.length ? '<p class="sg-showroom-kind">Not judged: ' + un.map(function (u) { return esc((u.label || u.decision) + ' (' + u.why + ')'); }).join(', ') + '.</p>' : '');
      }
      return out + '</section>';
    };
    window.__dseShowroomJudge = function (j) {
      srJudged = j;
      var box = srDetail.querySelector('[data-review-for]'), s = box && SCREENS[box.getAttribute('data-review-for')];
      if (s) box.outerHTML = reviewHTML(s);
    };
    // A screen's page heads the section as a component's does: the group's tag with Showroom beside it (back to the
    // grid), a back button and the screen's name as the title, its actions at the right level with it.
    var srTitle = sr.querySelector(':scope > h2'), srBadge = sr.querySelector(':scope > .sg-section-badge'), srName = null;
    var srCrumb = document.createElement('a'); srCrumb.className = 'sg-crumb'; srCrumb.href = '#showroom'; srCrumb.textContent = 'Showroom'; srCrumb.hidden = true;
    if (srBadge) srBadge.insertAdjacentElement('afterend', srCrumb);
    var srActions = document.createElement('div'); srActions.className = 'sg-section-actions'; srActions.hidden = true; (srTitle || sr).appendChild(srActions);
    // The screen's buttons under the title (Full browser, Differences): on a screen's page only, never on the grid.
    var srSwitch = document.createElement('div'); srSwitch.className = 'sg-size-switch sg-showroom-frames'; srSwitch.hidden = true;
    srSwitch.innerHTML = '<span class="sg-showroom-tools"></span>';   // beside it, the screen's Full browser and Differences
    if (srTitle) srTitle.insertAdjacentElement('afterend', srSwitch);
    var BACK_SVG = '<svg class="sg-showroom-back-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>';
    var headFor = function (s) {
      if (srName == null && srTitle) srName = titleText(srTitle);
      srCrumb.hidden = !s; srActions.hidden = !s; srSwitch.hidden = !s;
      if (srTitle) {
        if (s) { srTitle.classList.add('sg-screen-title'); srTitle.innerHTML = sysButton('a', '', ' href="#showroom" aria-label="All screens"', '', null, BACK_SVG) + '<span>' + esc(s.title || s.key) + '</span>'; }
        else { srTitle.classList.remove('sg-screen-title'); srTitle.textContent = srName; }
        srTitle.appendChild(srActions);
      }
    };
    sr._screen = function (key) {
      var s = SCREENS[key] || null;
      // The Showroom shown: its drawings asked for (each card, and this screen, drawn once they are here).
      if (DATA.showroom.some(srPending)) srLoad();
      // The grid: the product its address names, else All (never a filter left from before).
      if (!s && srFilter) showGroup(GROUPS.indexOf(key) >= 0 ? key : 'all');
      srGrid.hidden = !!s; if (srLead) srLead.hidden = !!s; if (srFilter) srFilter.hidden = !!s; srDetail.hidden = !s; sr._title = s ? (s.title || s.key) : null;
      headFor(s);
      if (!s) { detailFit = null; refit(); return null; }   // its cards sized at once, not a frame later
      // Opened again: the same page, back in its default view (the screen alone, no differences shown).
      if (srDetail.dataset.at === key) { if (srDetail._closeNotes) srDetail._closeNotes(); requestAnimationFrame(refit); return s; }
      srDetail.dataset.at = key;
      var meta = metaOf(s), notes = notesOf(s);
      var count = function (k) { return notes.filter(function (x) { return x.kind === k; }).length; };
      // The filter in a few words, so its choices sit on one line beside the screen.
      var SHORT = { missing: 'Not in code', fixed: 'Fixed', code: 'As code' };
      var kinds = [{ v: 'all', label: 'All', count: notes.length }].concat(['missing', 'fixed', 'code'].filter(count).map(function (k) { return { v: k, label: SHORT[k], count: count(k), say: NOTE_KIND[k] }; }));
      srSwitch.querySelector('.sg-showroom-tools').innerHTML = (s.markup ? sysButton('button', 'Full browser', ' data-full', '', null, FULL_SVG) : '') +
        (notes.length ? sysButton('button', 'Differences', ' data-differences aria-pressed="false" aria-expanded="false" aria-controls="sg-notes-' + esc(s.key) + '"') : '');
      var dBtn = srSwitch.querySelector('[data-differences]'); if (dBtn) dBtn.insertAdjacentHTML('beforeend', countHTML(notes.length));
      srActions.innerHTML = (s.figma ? sysButton('a', 'Figma', ' href="' + esc(s.figma) + '" target="_blank" rel="noopener"', '', null, FIGMA_SVG) : '');
      srDetail.innerHTML = '<div class="sg-showroom-body">' +
          '<div class="sg-showroom-room">' + (s.markup ? '<div class="sg-showroom-stage"><div class="sg-showroom sg-showroom-screen" data-screen="' + esc(s.key) + '">' + s.markup + '</div><div class="sg-pins" aria-hidden="true" hidden></div></div>' : '<p class="sg-info"><span class="sg-mx-why">' + esc('It could not be drawn: ' + plainWhy(s.why) + '.') + whyTip(s.why) + '</span></p>') + reviewHTML(s) + '</div>' +
          '<div class="sg-showroom-notes" id="sg-notes-' + esc(s.key) + '" hidden>' +
            '<section class="sg-showroom-gaps" aria-label="Where this screen differs from Figma">' +
              (notes.length ? '<div class="sg-notes-top"><div class="sg-showroom-filter"><span class="sg-chips" role="group" aria-label="Show">' + kinds.map(function (k) {
                // Each kind a chip in its pins' colour (the dot is the legend), its count in the badge.
                return '<button type="button" class="sg-chip" data-v="' + esc(k.v) + '" aria-pressed="' + (k.v === 'all') + '"' + (k.say ? ' title="' + esc(k.say) + '"' : '') + '>' + (k.v === 'all' ? '' : '<span class="sg-chip-dot sg-pin--' + esc(k.v) + '" aria-hidden="true"></span>') + esc(k.label) + countHTML(k.count) + '</button>';
              }).join('') + '</span></div></div>' : '') +
              (notes.length ? '<ol class="sg-notes">' + notes.map(noteItem).join('') + '</ol>' : '<p>Nothing: every part is the system\'s own, as Figma draws it.</p>') +
            '</section>' +
          '</div>' +
        '</div>';
      var stage = srDetail.querySelector('.sg-showroom-stage'), screen = srDetail.querySelector('.sg-showroom-screen');
      // The breakpoint chosen; while its differences are shown, Figma's own frame (Laptop) fitted to the room left, so the
      // pins sit where Figma drew those parts, and the switch is off.
      var choice = frameChoice(), diffOn = false;
      var fit = stage && screen ? drawAt(s, screen, stage, function (room) { return frameOf(s, diffOn ? 'laptop' : choice, room); }) : null;
      // Full browser: the product alone, filling the browser's window as it will in use (never the display's full
      // screen: a product always runs in a browser); its breakpoint from the window's width. Esc, or the button, brings it back.
      var fullBtn = srSwitch.querySelector('[data-full]');
      if (fullBtn && screen) fullBtn.addEventListener('click', function () {
        var ov = document.createElement('div'); ov.className = 'sg-showroom-full sg-showroom'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', (s.title || s.key) + ', full browser');
        var place = document.createComment('screen'), keep = [screen.style.width, screen.style.height, screen.style.transform];
        screen.parentNode.insertBefore(place, screen);
        ov.appendChild(screen);
        ov.insertAdjacentHTML('beforeend', '<div class="sg-showroom-full-exit">' + sysButton('button', 'Exit full browser', ' data-exit') + '</div>');
        document.body.appendChild(ov);
        var size = function () { screen.style.width = innerWidth + 'px'; screen.style.height = innerHeight + 'px'; screen.style.transform = 'none'; setBreakpoint(screen, innerWidth >= 1440 ? 'desktop' : 'laptop'); };
        var done = false, back = function () {
          if (done) return; done = true;
          removeEventListener('resize', size); document.removeEventListener('keydown', esc);
          place.parentNode.insertBefore(screen, place); place.remove(); ov.remove();
          screen.style.width = keep[0]; screen.style.height = keep[1]; screen.style.transform = keep[2];
          refit(); fullBtn.focus();
        };
        var esc = function (e) { if (e.key === 'Escape') back(); };
        size(); addEventListener('resize', size); document.addEventListener('keydown', esc);
        ov.querySelector('[data-exit]').addEventListener('click', back);
        ov.querySelector('[data-exit]').focus({ preventScroll: true });
      });
      // Each note's pin over its part of the screen, placed again whenever the screen is (its size, the brand, the mode).
      var pins = stage && stage.querySelector('.sg-pins'), shown = 'all';
      var item = function (no) { return srDetail.querySelector('.sg-note[data-note="' + no + '"]'); };
      var placePins = function () {
        if (!pins || pins.hidden) return;
        var o = stage.getBoundingClientRect(), taken = {};
        Array.prototype.forEach.call(pins.querySelectorAll('.sg-pin'), function (p) { p.remove(); });
        notes.forEach(function (x) {
          var el = partOf(screen, x.n), li = item(x.no);
          if (li) li.classList.toggle('sg-note--away', !el);
          if (!el || (shown !== 'all' && shown !== x.kind)) return;
          var r = el.getBoundingClientRect(), key = Math.round(r.left) + ',' + Math.round(r.top), k = taken[key] = (taken[key] || 0) + 1;
          var pin = document.createElement('span'); pin.className = 'sg-pin sg-pin--' + x.kind; pin.textContent = x.no; pin.dataset.note = x.no;
          pin.style.left = Math.min(o.width - 12, Math.max(12, r.left - o.left + 12 + (k - 1) * 24)) + 'px';
          pin.style.top = Math.min(o.height - 12, Math.max(12, r.top - o.top + 12)) + 'px';
          pin.title = x.n.name;
          pins.appendChild(pin);
        });
      };
      // A note lit on the screen and in the list together: its part outlined, its pin raised, its row marked.
      var light = function (no) {
        Array.prototype.forEach.call(srDetail.querySelectorAll('.sg-pin, .sg-note'), function (e) { e.classList.toggle('is-on', e.dataset.note === String(no)); });
        var old = pins && pins.querySelector('.sg-pin-box'); if (old) old.remove();
        var x = notes[no - 1], el = x && partOf(screen, x.n);
        if (!el || !pins) return;
        var o = stage.getBoundingClientRect(), r = el.getBoundingClientRect(), box = document.createElement('span');
        box.className = 'sg-pin-box sg-pin-box--' + x.kind;
        box.style.left = (r.left - o.left) + 'px'; box.style.top = (r.top - o.top) + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
        pins.insertBefore(box, pins.firstChild);
      };
      // A pin clicked: its note in a card beside it on the screen (its line, its kind), and opened in the panel.
      var card = null;
      var closeCard = function () { if (card) { card.remove(); card = null; } };
      var openNote = function (no, pin) {
        closeCard(); light(no);
        var x = notes[no - 1], li = item(no), d = li && li.querySelector('details'); if (!x) return;
        if (d) { d.open = true; li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        if (!pin) return;
        card = document.createElement('div'); card.className = 'sg-pin-card'; card.setAttribute('role', 'note');
        card.innerHTML = '<b>' + no + ' · ' + esc(x.n.name) + '</b><span class="sg-pin-card-kind">' + esc(NOTE_KIND[x.kind]) + '</span><p>' + esc(x.n.say || x.n.what || '') + '</p>';
        pins.appendChild(card);
        var o = stage.getBoundingClientRect(), r = pin.getBoundingClientRect(), right = r.right - o.left + 8 + card.offsetWidth <= o.width;
        card.style.left = Math.max(8, right ? r.right - o.left + 8 : r.left - o.left - 8 - card.offsetWidth) + 'px';
        card.style.top = Math.max(8, Math.min(o.height - card.offsetHeight - 8, r.top - o.top - 8)) + 'px';
      };
      if (pins) {
        pins.addEventListener('mouseover', function (e) { var p = e.target.closest('.sg-pin'); if (p) light(+p.dataset.note); });
        pins.addEventListener('click', function (e) { var p = e.target.closest('.sg-pin'); if (p) { e.stopPropagation(); openNote(+p.dataset.note, p); } });
        stage.addEventListener('click', function (e) { if (card && !e.target.closest('.sg-pin-card')) { closeCard(); light(0); } });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && card) { closeCard(); light(0); } });
      }
      // The screen alone until the person asks for its differences: then the panel beside it and the pins over it.
      var body = srDetail.querySelector('.sg-showroom-body'), panel = srDetail.querySelector('.sg-showroom-notes'), toggle = srSwitch.querySelector('[data-differences]');
      var showNotes = function (on) {
        if (!panel) return;
        panel.hidden = !on; if (pins) pins.hidden = !on; body.classList.toggle('is-open', on);
        diffOn = on;
        if (toggle) { toggle.setAttribute('aria-pressed', on ? 'true' : 'false'); toggle.setAttribute('aria-expanded', on ? 'true' : 'false'); }
        if (!on) { light(0); closeCard(); }
        refit();
      };
      // The panel as tall as the window leaves it: from where it stands (stuck under the title and switch, or lower
      // before the page scrolls) to the window's foot, so the page never scrolls for it.
      var fitQueued = false, fitNotes = function () {
        fitQueued = false;
        if (!panel || panel.hidden) return;
        var t = srTitle, w = srSwitch;
        sr.style.setProperty('--sr-head-h', Math.max(0, (t ? t.getBoundingClientRect().height : 0) + (w && !w.hidden ? w.getBoundingClientRect().height : 0) - 1) + 'px');
        if (window.innerWidth < 901) { panel.style.height = ''; return; }
        // down to where the page's own room under the screen begins, so panel and page end together at the window's foot
        var under = Math.max(0, document.documentElement.scrollHeight - (body.getBoundingClientRect().bottom + window.scrollY));
        panel.style.height = Math.max(0, window.innerHeight - panel.getBoundingClientRect().top - under) + 'px';
      };
      var queueFit = function () { if (!fitQueued) { fitQueued = true; requestAnimationFrame(fitNotes); } };
      window.addEventListener('scroll', queueFit, { passive: true }); window.addEventListener('resize', queueFit);
      var showNotesFirst = showNotes; showNotes = function (on) { showNotesFirst(on); fitNotes(); };
      if (toggle) toggle.addEventListener('click', function () { showNotes(panel.hidden); });
      showNotes(false);
      srDetail._closeNotes = function () { if (panel && !panel.hidden) showNotes(false); };
      Array.prototype.forEach.call(srDetail.querySelectorAll('.sg-note'), function (li) {
        li.addEventListener('mouseenter', function () { light(+li.dataset.note); });
        li.querySelector('summary').addEventListener('focus', function () { light(+li.dataset.note); });
      });
      // The filter: one kind of note at a time, on the screen and in the list.
      var filter = srDetail.querySelector('.sg-showroom-filter');
      if (filter) Array.prototype.forEach.call(filter.querySelectorAll('.sg-chip'), function (b) {
        b.setAttribute('aria-pressed', b.dataset.v === shown ? 'true' : 'false');
        b.addEventListener('click', function () {
          shown = b.dataset.v; Array.prototype.forEach.call(filter.querySelectorAll('.sg-chip'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
          setHashQuery({ kind: shown });
          Array.prototype.forEach.call(srDetail.querySelectorAll('.sg-note'), function (li) { li.hidden = shown !== 'all' && li.dataset.kind !== shown; });
          closeCard(); placePins();
        });
      });
      detailFit = fit ? function () { fit(); placePins(); } : null;   // the screen's size is set at once, so its parts can be found at once
      // Drawn again whenever its own column changes (the differences beside it growing, a window resized): the screen
      // shrinks to the room, never cut.
      var roomEl = srDetail.querySelector('.sg-showroom-room'); if (roomEl && sro) sro.observe(roomEl);
      Array.prototype.forEach.call(srDetail.querySelectorAll('[data-measure-for]'), fillMeasure);
      if (screen && window.__dseShowroom) { try { window.__dseShowroom.mount(screen, s.key); } catch (e) { /* the drawing stays */ } }
      refit(); requestAnimationFrame(refit);
      return s;
    };
  }
  // Status: how the system stands, its four numbers at the top (fillHealth), then everything still open by kind, each
  // with who does it (fillTodo, its lists once the accessibility checks below are defined). Once two pages, Health and
  // Tasks: their addresses open it.
  hr(); navLink('status', 'status');
