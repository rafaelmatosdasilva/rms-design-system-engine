  /* ── Brand kit: the system at a glance, every value its own token ───────────────────────────────────────────────── */
  // Its main hues and type in one card, the primitive ramps (the neutral one as a wall), semantic pairs with their
  // contrast, its type set large, its shapes, icons and motion. Every value is drawn through the token's
  // own variable, so the brand and mode chosen on the page show; Figma's value stands behind it where the code has no
  // variable. Drawn again when the brand or mode changes. A part with nothing in the system for it is left out.
  // (the brand kit is drawn when it shows: lazyDraw)
  if (ALL_TOKENS.some(function (t) { return t.modes && t.values; })) {
    hr(); foundationLink('identity', 'identity');
    var bk = section('identity', 'Foundations', 'Identity', null);
    var bkOut = document.createElement('div'); bkOut.className = 'sg-bk'; bk.appendChild(bkOut);
    var BK_ALL = ALL_TOKENS.filter(function (t) { return t.modes && t.values; });
    // A colour is any token whose value is one, whatever Figma scopes it to (a ramp scoped to strokes too is still colour).
    var bkIsCol = function (t) { return (t.values || []).some(function (v) { return /^(#[0-9a-f]{3,8}|rgba?\()/i.test(String(v || '')); }); };
    var bkCols = BK_ALL.filter(bkIsCol);
    var bkLeaf = function (n) { return String(n).split('/').pop(); };
    // A token's own name: the last part of its path that says what it is, never the kind it ends on (color, value).
    // A short name that still says whose it is: its last two telling parts (button/radius, card/all).
    var bkShort = function (n) { return String(n); };   // a token is named by its full name, as in Figma
    var bkName = function (n) { var p = String(n).split('/'), k = p.length - 1; while (k > 0 && /^(colou?r|value|default|base|fill)$/i.test(p[k])) k--; return p[k]; };
    // Figma's value for the mode the page shows: its dark one on a dark page, the widest screen for a size.
    var bkFig = function (t) {
      var m = t.modes || [], d = m.findIndex(function (x) { return /dark|night/i.test(x); }), i = m.length - 1;
      // A colour, or any token with a light and a dark mode (a switch on in light and off in dark), in the page's mode.
      if (bkIsCol(t) || d >= 0) { var dark = document.documentElement.getAttribute('data-sg-scheme') === 'dark', l = m.findIndex(function (x) { return !/dark|night/i.test(x); }); i = dark && d >= 0 ? d : Math.max(0, l); }
      var v = t.values[Math.max(0, i)]; return v == null ? '' : String(v);
    };
    // A token's value as the brand chosen has it: its variable's value on the page (a brand or mode changes it), else
    // Figma's.
    // A token the code has no variable for (a shadow's display switch) is still read from the page when the chosen
    // theme writes it, under the variable named after it (base/shadow/anyDisplay → --base-shadow-anyDisplay).
    var bkNow = function (t) { var cs = getComputedStyle(bkOut), v = t.var ? cs.getPropertyValue(t.var).trim() : ''; if (!v && t.figma) v = cs.getPropertyValue('--' + String(t.figma).replace(/\//g, '-')).trim(); return v || bkFig(t); };
    // A token as CSS: its variable, Figma's value behind it.
    // A token as CSS: its code variable, else the one a theme writes for it under its Figma name (a shadow's offsets in a
    // theme that draws it as a line), Figma's own value behind either.
    var bkCss = function (t, unit) { var v = bkFig(t); if (unit && /^-?[\d.]+$/.test(v)) v += unit; var nm = t.var || (t.figma ? '--' + String(t.figma).replace(/\//g, '-').replace(/[^A-Za-z0-9_-]/g, '-') : ''); return nm ? 'var(' + nm + (v ? ', ' + v : '') + ')' : v; };
    // What a token draws now, read where it is drawn (the brand's and the mode's own value).
    var bkProbe = null;
    var bkMemo = {};   // each reading once per drawing: the same token is read many times over
    var bkRead = function (prop, css) { var key = prop + '|' + css; if (key in bkMemo) return bkMemo[key]; return (bkMemo[key] = bkReadNow(prop, css)); };
    var bkReadNow = function (prop, css) { if (!bkProbe) { bkProbe = document.createElement('span'); bkProbe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none'; bkOut.appendChild(bkProbe); } bkProbe.style[prop] = ''; bkProbe.style[prop] = css; return getComputedStyle(bkProbe)[prop]; };
    // A colour as #rrggbb(aa), whatever form the browser gives it in (rgb(), color(srgb r g b / a)).
    var bkHex = function (t) { return bkCssHex(bkCss(t)); };
    var bkCssHex = function (css) {
      var c = bkRead('color', css), m = String(c).match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)$/);
      if (m) c = 'rgba(' + [m[1], m[2], m[3]].map(function (x) { return Math.round(+x * 255); }).join(', ') + ', ' + (m[4] == null ? 1 : m[4]) + ')';
      return hexOf(c);
    };
    var bkPx = function (t) { var n = parseFloat(bkRead('width', bkCss(t, 'px'))); return isFinite(n) ? Math.round(n * 10) / 10 : null; };
    var bkRgb = function (c) { var h = String(c).replace(/^#/, ''); if (!/^[0-9a-f]{6}/i.test(h)) return null; return [0, 2, 4].map(function (i) { return parseInt(h.slice(i, i + 2), 16) / 255; }); };
    var bkLum = function (c) { var r = bkRgb(c); if (!r) return null; r = r.map(function (x) { return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2]; };
    var bkRatio = function (a, b) { var x = bkLum(a), y = bkLum(b); return x == null || y == null ? null : (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    var bkChroma = function (c) { var r = bkRgb(c); return r ? Math.max.apply(null, r) - Math.min.apply(null, r) : 0; };
    var isPrim = function (t) { return !(t.aliases || []).some(Boolean); };
    var used = {}; BK_ALL.forEach(function (t) { (t.aliases || []).forEach(function (a) { if (a) used[a] = (used[a] || 0) + 1; }); });
    // The brand chosen in the page's switch, else the system's own title.
    var bkBrand = function () {
      // The theme chosen in the page's switch, by name; the system's own name on its default one.
      var sel = document.getElementById('sg-brand-select');
      return sel && sel.value && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : (DATA.title || 'Design system');
    };
    // The exploded view's leader lines, from each plane's far corner to its callout, drawn where both are now.
    var dpLeads = function (iso, moving) {   // moving: the layers mid-animation; the names follow, nothing is centred or kept
      var svg = iso.querySelector('.sg-bk-dp-leads'); if (!svg) return;
      var box = iso.getBoundingClientRect(), out = '';
      if (!box.width) return;
      // Each name beside its layer's bottom right corner: just past the furthest corner, at the corner's height, pushed
      // down only as far as needed for the names not to touch, in the stack's order; a short elbow joins them.
      var f = function (n) { return n.toFixed(1); }, rows = [];
      Array.prototype.forEach.call(iso.querySelectorAll('.sg-bk-dp-call'), function (c) {
        var a = iso.querySelector('.sg-bk-dp-plane[data-z="' + c.getAttribute('data-z') + '"] > .sg-bk-dp-anchor'); if (!a) return;
        var p = a.getBoundingClientRect(); rows.push({ c: c, x: p.left - box.left, y: p.top - box.top, h: c.offsetHeight });
      });
      if (!rows.length) { svg.innerHTML = ''; return; }
      var gap = parseFloat(getComputedStyle(iso).getPropertyValue('--sg-space-xs')) || 4;
      var x0 = Math.max.apply(null, rows.map(function (r) { return r.x; })) + gap * 6;
      // A layer picked lifts: the names keep the places they have at rest (only the leader lines follow the layer), and
      // the drawing is not centred again, so nothing moves under the pointer.
      // A layer is always picked: the places are kept per card size and spread (worked out once for each), never per pick.
      var restKey = Math.round(box.width) + 'x' + Math.round(box.height) + ':' + (iso.getAttribute('data-state') || '');
      var focused = iso._rest && iso._rest.key === restKey && !iso._centring && Math.max.apply(null, rows.map(function (r) { return r.x; })) + gap * 3 <= iso._rest.x0;
      if (focused) x0 = iso._rest.x0;
      else if (iso._centredKey === restKey && iso._rest && iso._rest.key === restKey) x0 = Math.max(x0, iso._rest.x0);   // a lifted layer only pushes the names right
      // Always in the stack's order, the top layer first, whatever the state lifts.
      rows.sort(function (a, b) { return +b.c.getAttribute('data-z') - +a.c.getAttribute('data-z'); });
      var last = -1e9;
      var ys = {};
      rows.forEach(function (r) {
        var z = r.c.getAttribute('data-z'), y = focused && iso._rest.ys[z] != null ? iso._rest.ys[z] : Math.max(r.y, last + r.h + gap); last = y; ys[z] = y;
        r.c.style.left = f(x0) + 'px'; r.c.style.top = f(y) + 'px';
        var x2 = x0 - 3, mx = Math.max(r.x + 4, x2 - 10);
        out += '<g class="' + (r.c.getAttribute('data-z') === iso.getAttribute('data-focus') ? 'is-on' : '') + '"><polyline points="' + f(r.x) + ',' + f(r.y) + ' ' + f(mx) + ',' + f(r.y) + ' ' + f(x2) + ',' + f(y) + '"/><path d="M' + f(r.x - 4) + ' ' + f(r.y) + 'h8M' + f(r.x) + ' ' + f(r.y - 4) + 'v8"/></g>';
      });
      if (!focused && !moving) iso._rest = { key: restKey, x0: x0, ys: ys };
      // The stack and its names together centred across the card: moved by what the names add on the right. Once per card
      // size and spread (exploded or stacked): a layer picked, lifting, never moves the drawing.
      if (!iso._centring && !focused && !moving && iso._centredKey !== restKey) {
        var st = iso.querySelector('.sg-bk-dp-stack'), lo = 1e9, hi = -1e9;
        Array.prototype.forEach.call(iso.querySelectorAll('.sg-bk-dp-plane'), function (p) { var q = p.getBoundingClientRect(); lo = Math.min(lo, q.left - box.left); });
        rows.forEach(function (r) { hi = Math.max(hi, r.c.getBoundingClientRect().right - box.left); });
        var dx = box.width / 2 - (lo + hi) / 2;   /* the drawing and its names, one block, centred in the card */
        var room = box.width - gap * 8, span = hi - lo;
        if (st && span > room + 1) { iso._fit = Math.max(0.4, (iso._fit || 1) * room / span * 0.96); st.style.scale = iso._fit.toFixed(3); iso._centring = true; dpLeads(iso); iso._centring = false; iso._rest = null; dpLeads(iso); return; }   /* too wide with its names: smaller, then centred again */
        if (st && Math.abs(dx) > 1) { iso._dx = (iso._dx || 0) + dx; var ty = (getComputedStyle(st).translate || '').split(' ')[1] || '0px'; st.style.translate = Math.round(iso._dx) + 'px ' + ty;   /* across only: the height is dpPlace's */ iso._centring = true; dpLeads(iso); iso._centring = false; return; }
        iso._centredKey = restKey;   // centred: kept until the card's size or spread changes
      }
      svg.innerHTML = out;
    };
    // The frame round the preview at the drawing's scale (its header, 9% of the preview's height, is Figma's 80px one).
    var dpK = function (h) { return Math.min(1, h * 0.09 / 80).toFixed(3); };
    var dpFrame = function () {
      Array.prototype.forEach.call(bkOut.querySelectorAll('.sg-bk-t.sg-bk-dp'), function (b) { var sc = b.querySelector('.sg-bk-dp-scene'), h = sc ? sc.offsetHeight : 0; if (h) { b.style.setProperty('--dp-kn', dpK(h)); sc.style.setProperty('--dp-k', dpK(h)); } });
      Array.prototype.forEach.call(bkOut.querySelectorAll('.sg-bk-dp-plane'), function (p) { if (p.offsetHeight) p.style.setProperty('--dp-k', dpK(p.offsetHeight)); });
    };
    // Each drawing's names placed again whenever its card changes size or its planes finish moving: the drawing and its
    // names stay one block, centred, whatever laid the card out last (a font, the window, a panel).
    var dpWatch = function (iso) {
      if (iso._dpWatched) return; iso._dpWatched = true;
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { dpLeads(iso); }).observe(iso);
      // The layers spread with transitions of their own: the names follow once each has arrived (one placing per frame),
      // and once more after the longest, should a transition never end (a hidden tab).
      var queued = 0, again = function () { if (queued) return; queued = setTimeout(function () { queued = 0; dpLeads(iso); }, 16); };
      // While they move, the names move with them, frame by frame.
      var until = 0, follow = function () { var go = !until; until = performance.now() + 450; if (go) (function tick() { dpLeads(iso, true); if (performance.now() < until) requestAnimationFrame(tick); else until = 0; })(); };
      var mine = function (e) { return e.target === st || (e.target.classList && e.target.classList.contains('sg-bk-dp-plane')); };
      var st = iso.querySelector('.sg-bk-dp-stack');
      if (st) { st.addEventListener('transitionstart', function (e) { if (mine(e)) follow(); }); ['transitionend', 'transitioncancel'].forEach(function (t) { st.addEventListener(t, function (e) { if (mine(e)) again(); }); }); }
      setTimeout(again, 900);
    };
    var dpLeadsAll = function () { dpFrame(); Array.prototype.forEach.call(bkOut.querySelectorAll('.sg-bk-dp-iso'), function (iso) { dpWatch(iso); dpLeads(iso); }); };
    if (!bkOut._dpLeadsOn) { bkOut._dpLeadsOn = 1; window.addEventListener('resize', function () { dpLeadsAll(); }); }
    // ── How the icons are drawn, read from their pixels: the system's icons are outlined shapes, so the stroke, its ends
    // and its corners are measured, not read from attributes. Each icon is drawn ten times its size; its stroke is the
    // width most often crossed, row by row and column by column; its line, thinned to one pixel, gives an end (where
    // the line stops) and a corner (where it turns most sharply). An end or a corner is round when a disc of half the
    // stroke, rolled inside the shape, still covers it. → { id, w, end, corner, set } (units of the icon's own grid)
    // The magnified icon and its two lenses, drawn from iconAnatomy(): the icon on its grid at the left with a ring
    // where each lens looks and the stroke measured across its line; at the right each lens drawn large, the icon's own
    // pixel grid behind it, the cap's half-stroke circle and the corner's turn marked, named underneath.
    function lensTile(an, sw) {
      var bx = an.box, z = Math.max(bx[2], bx[3]), big = 583 / z, frameX = 815, frameY = 48, ox = frameX - bx[0] * big, oy = frameY - bx[1] * big;
      var at = function (p) { return [ox + p[0] * big, oy + p[1] * big]; }, num = function (n) { return String(Math.round(n * 100) / 100); };
      // The icon's own drawing in the words' colour (its fills from a class would not reach a <use>).
      var body = String(document.getElementById(an.id).innerHTML).replace(/(fill|stroke)="(?!none)[^"]*"/gi, '$1="currentColor"').replace(/(fill|stroke):\s*(?!none)[^;"]+/gi, '$1:currentColor');
      // Drawn large, its stroke lighter than the icon's (read heavy at that size): 48% in the lenses, 62% in the big icon.
      // Each outline eaten into by a mask, square at its corners so an inside corner stays sharp, as drawn. The measures
      // below are of the stroke as drawn where they sit (cut and wd in the lenses, bigCut and bigWd on the big icon).
      var THIN = 0.48, cut = an.w * (1 - THIN) / 2, wd = an.w * THIN, BIG_THIN = 0.62, bigCut = an.w * (1 - BIG_THIN) / 2, bigWd = an.w * BIG_THIN;
      var icon = function (x, y, k, c) {
        if (c == null) c = cut;
        var m = 'sg-bk-lens-thin-' + (lensTile.n = (lensTile.n || 0) + 1);
        return '<svg x="' + x + '" y="' + y + '" width="' + (bx[2] * k) + '" height="' + (bx[3] * k) + '" viewBox="' + bx.join(' ') + '" class="sg-bk-lens-icon" fill="currentColor" overflow="visible">' +
          '<mask id="' + m + '" maskUnits="userSpaceOnUse" x="' + (bx[0] - bx[2]) + '" y="' + (bx[1] - bx[3]) + '" width="' + (bx[2] * 3) + '" height="' + (bx[3] * 3) + '"><g style="color:#fff">' + body + '</g><g class="sg-bk-lens-erode" style="color:#000;--bk-line-w:' + (c * 2) + 'px">' + body + '</g></mask>' +
          '<g mask="url(#' + m + ')">' + body + '</g></svg>';
      };
      var gridLines = function (x0, y0, x1, y1, step, cls) { var g = ''; for (var gx = x0; gx <= x1 + 0.1; gx += step) g += '<line x1="' + gx + '" y1="' + y0 + '" x2="' + gx + '" y2="' + y1 + '"/>'; for (var gy = y0; gy <= y1 + 0.1; gy += step) g += '<line x1="' + x0 + '" y1="' + gy + '" x2="' + x1 + '" y2="' + gy + '"/>'; return '<g class="' + cls + '">' + g + '</g>'; };
      // The stroke's edges and the gap's tips where the thinner stroke has them: each edge half the cut in, each tip half the cut back.
      var edgesAt = function (t) { return an.thick && [0, 1].map(function (k) { var e = k ? an.thick.e2 : an.thick.e1, o2 = k ? an.thick.e1 : an.thick.e2; return [e[0] + (o2[0] - e[0]) / 2 * (1 - t), e[1] + (o2[1] - e[1]) / 2 * (1 - t)]; }); }, thickAt = edgesAt(THIN);
      var gapAt = an.gap && (function () { var a = an.gap.a, b = an.gap.b, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / d * cut, uy = (b[1] - a[1]) / d * cut; return [[a[0] - ux, a[1] - uy], [b[0] + ux, b[1] + uy]]; })();
      // The join's two outer edges, where they meet, moved in toward its curve's centre.
      var cornerEdge = function (c) {
        if (c == null) c = cut;
        var oo = an.corner.o, ta = an.corner.ta, tb = an.corner.tb, sideX = Math.abs(ta[0] - oo[0]) > Math.abs(ta[1] - oo[1]), p = [sideX ? ta[0] : tb[0], sideX ? tb[1] : ta[1]];
        return [p[0] + Math.sign(oo[0] - p[0]) * c, p[1] + Math.sign(oo[1] - p[1]) * c];
      };
      // Two by two at the left, the icon at the right, as they sit on it: the corner and the open gap above, the stroke's thickness and the end below.
      var lenses = [an.corner && { p: an.corner.at, kind: 'corner', round: an.corner.round }, an.gap && { p: an.gap.at, kind: 'gap' }, an.thick && { p: an.thick.at, kind: 'thick' }, an.end && { p: an.end.at, kind: 'end', round: an.end.round }].filter(Boolean);
      var R = 55, LR = 95, out = '', caps = '', VW = 1440, VH = 680;
      // The icon, large, on its pixel grid inside its own box.
      // Its frame is drawn by the page (lensFrame below), in the brand's own corner radius.
      out += icon(frameX, frameY, big, bigCut);
      // The construction line over it: the line each stroke is drawn on, a ring at each end, a dot at each turn.
      if (an.build) {
        // Drawn through its points as they are: a straight stays straight, a rounded turn is its many short steps.
        var curve = function (ps) { return ps.map(function (p, k) { var c = at(p); return (k ? 'L' : 'M') + c[0].toFixed(2) + ' ' + c[1].toFixed(2); }).join(''); };
        out += '<g class="sg-bk-lens-build">' + an.build.paths.map(function (ps) { return '<path d="' + curve(ps) + '"/>'; }).join('') + '</g>' +
          an.build.ends.map(function (p) { var c = at(p); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (an.w * big * 0.3) + '" class="sg-bk-lens-end"/>'; }).join('') +
          an.build.turns.map(function (p) { var c = at(p); return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + (an.w * big * 0.22) + '" class="sg-bk-lens-turn"/>'; }).join('');
      }
      lenses.forEach(function (l) { var c = at(l.p); out += '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="' + R + '" class="sg-bk-lens-ring"/>'; });
      // Each lens, large, side by side beside the icon: the icon drawn so the point sits in the middle, clipped to the
      // circle, its name and what it shows under it.
      // One scale for all four, so the stroke is as thick in each: the one that holds both ends of the gap, if smaller.
      var lensZoom = Math.min(LR * 2 / (an.w * 3.2), an.gap ? LR * 1.8 / (an.gap.gap + cut * 2 + wd) : Infinity);
      lenses.forEach(function (l, i) {
        // The group, lenses and their words, centred on the icon's frame.
        var cx = 345 + (i % 2) * (LR * 2 + 80), cy = 57 + LR + Math.floor(i / 2) * (LR * 2 + 95 + 28), id = 'sg-bk-lens-' + i;
        var zoom = lensZoom;
        var on = function (p) { return [cx + (p[0] - l.p[0]) * zoom, cy + (p[1] - l.p[1]) * zoom]; };
        // The icon's own pixel grid: a line at each whole unit of its drawing.
        // The grid, half a stroke apart, laid on the stroke's own edges: a line runs along each edge of a straight stretch.
        // Anchored on the edge this lens shows: the cap's centre (its edges and tip half a stroke out), the gap's first tip
        // and the line's middle, the thickness's edge, the join's two outer edges.
        var step = wd / 2, anchor = l.p;
        if (l.kind === 'thick') anchor = thickAt[0];
        else if (l.kind === 'gap') anchor = gapAt[0];
        else if (l.kind === 'corner' && an.corner.ta) anchor = cornerEdge();
        var ga = on(anchor), gs = step * zoom, gx0 = ga[0] - Math.ceil((ga[0] - (cx - LR)) / gs) * gs, gy0 = ga[1] - Math.ceil((ga[1] - (cy - LR)) / gs) * gs;
        var g0 = gridLines(gx0, gy0, cx + LR, cy + LR, gs, 'sg-bk-lens-grid');
        var o = on([bx[0], bx[1]]);
        out += '<clipPath id="' + id + '"><circle cx="' + cx + '" cy="' + cy + '" r="' + LR + '"/></clipPath>' +
          '<g clip-path="url(#' + id + ')"><rect x="' + (cx - LR) + '" y="' + (cy - LR) + '" width="' + (LR * 2) + '" height="' + (LR * 2) + '" class="sg-bk-lens-ground"/>' + g0 + icon(o[0], o[1], zoom) + '</g>' +
          '<circle cx="' + cx + '" cy="' + cy + '" r="' + LR + '" class="sg-bk-lens-ring"/>';
        // The cap: a circle as wide as the stroke on the cap's centre. The join: the circle its outer curve is drawn on.
        if (l.kind === 'end' && l.round) out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (((an.end.wid || an.w) / 2 - cut) * zoom) + '" class="sg-bk-lens-mark"/><circle cx="' + cx + '" cy="' + cy + '" r="8" class="sg-bk-lens-dot"/>';
        if (l.kind === 'corner') {
          if (an.corner.r > an.w * 0.1 && an.corner.ta) {
            // The outer curve itself, dashed over it from one arm's edge to the other's.
            // Drawn just outside the curve, on its centre, so the dashes are not lost on the edge.
            var oc = on(an.corner.o), rr = Math.max(an.corner.r - cut, 0) * zoom + 6, grow = function (p) { var q = on(p), k = rr / (Math.hypot(q[0] - oc[0], q[1] - oc[1]) || 1); return [oc[0] + (q[0] - oc[0]) * k, oc[1] + (q[1] - oc[1]) * k]; };
            var p1 = grow(an.corner.ta), p2 = grow(an.corner.tb), sw = ((p1[0] - oc[0]) * (p2[1] - oc[1]) - (p1[1] - oc[1]) * (p2[0] - oc[0])) > 0 ? 1 : 0;
            out += '<path d="M' + p1[0] + ' ' + p1[1] + ' A' + rr + ' ' + rr + ' 0 0 ' + sw + ' ' + p2[0] + ' ' + p2[1] + '" class="sg-bk-lens-mark"/>';
          } else out += '<circle cx="' + cx + '" cy="' + cy + '" r="8" class="sg-bk-lens-dot"/>';
        }
        if (l.kind === 'gap') {
          // The gap measured tip to tip.
          var t1 = on(gapAt[0]), t2 = on(gapAt[1]), gx = t2[0] - t1[0], gy = t2[1] - t1[1], gd = Math.hypot(gx, gy) || 1, vx = gx / gd, vy = gy / gd, nx = -vy * 20, ny = vx * 20;
          out += '<g class="sg-bk-lens-measure"><line x1="' + t1[0] + '" y1="' + t1[1] + '" x2="' + t2[0] + '" y2="' + t2[1] + '"/>' +
            '<line x1="' + (t1[0] - nx) + '" y1="' + (t1[1] - ny) + '" x2="' + (t1[0] + nx) + '" y2="' + (t1[1] + ny) + '"/><line x1="' + (t2[0] - nx) + '" y1="' + (t2[1] - ny) + '" x2="' + (t2[0] + nx) + '" y2="' + (t2[1] + ny) + '"/></g>';
        }
        if (l.kind === 'thick') {
          // The stroke measured edge to edge, across the line.
          var k1 = on(thickAt[0]), k2 = on(thickAt[1]), dx3 = an.thick.dir[0] * 28, dy3 = an.thick.dir[1] * 28;
          out += '<g class="sg-bk-lens-measure"><line x1="' + k1[0] + '" y1="' + k1[1] + '" x2="' + k2[0] + '" y2="' + k2[1] + '"/>' +
            '<line x1="' + (k1[0] - dx3) + '" y1="' + (k1[1] - dy3) + '" x2="' + (k1[0] + dx3) + '" y2="' + (k1[1] + dy3) + '"/><line x1="' + (k2[0] - dx3) + '" y1="' + (k2[1] - dy3) + '" x2="' + (k2[0] + dx3) + '" y2="' + (k2[1] + dy3) + '"/></g>';
        }
        var title = l.kind === 'end' ? (l.round ? 'Round cap' : 'Flat cap') : l.kind === 'gap' ? 'Open stroke' : l.kind === 'thick' ? 'Even stroke' : (l.round ? 'Round join' : 'Sharp join');
        // Said in words, no measures: what a person sees.
        var sub = l.kind === 'end' ? (l.round ? 'the line ends, in a soft round tip' : 'the line ends, cut square')
          : l.kind === 'gap' ? 'the line breaks, then starts again'
          : l.kind === 'thick' ? (an.set.sameW === an.set.read ? 'one weight, on every icon' : 'one weight, all along the line')
          : (l.round ? 'turns in a curve, no sharp points' : 'turns to a point, no curve');
        // Its name and what it shows under it, in the page's own text sizes (laid over the drawing, not scaled with it).
        caps += '<div class="sg-bk-lens-cap" style="left:' + (cx / VW * 100) + '%;top:' + ((cy + LR + 20) / VH * 100) + '%"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>';
      });
      // The icon's frame, drawn by the page at its own size (so its dashes keep their spacing and its corner the brand's
      // radius), with a grid behind the icon half a stroke apart, laid on the icon's own outer edges, clipped to the frame.
      var gStep = bigWd / 2, gAt = an.thick ? edgesAt(BIG_THIN)[0] : an.end ? an.end.at : [bx[0], bx[1]];
      if (an.corner && an.corner.ta) gAt = cornerEdge(bigCut);
      var gLines = '', pct = function (v, o, n) { return ((v - o) / n * 100) + '%'; };
      for (var gv = gAt[0] - Math.floor((gAt[0] - bx[0]) / gStep) * gStep; gv <= bx[0] + bx[2] + 1e-6; gv += gStep) gLines += '<line x1="' + pct(gv, bx[0], bx[2]) + '" y1="0" x2="' + pct(gv, bx[0], bx[2]) + '" y2="100%"/>';
      for (var gh = gAt[1] - Math.floor((gAt[1] - bx[1]) / gStep) * gStep; gh <= bx[1] + bx[3] + 1e-6; gh += gStep) gLines += '<line x1="0" y1="' + pct(gh, bx[1], bx[3]) + '" x2="100%" y2="' + pct(gh, bx[1], bx[3]) + '"/>';
      var lensFrame = '<div class="sg-bk-lens-frame" style="left:' + (frameX / VW * 100) + '%;top:' + (frameY / VH * 100) + '%;width:' + (bx[2] * big / VW * 100) + '%;height:' + (bx[3] * big / VH * 100) + '%">' +
        '<svg aria-hidden="true"><clipPath id="sg-bk-lens-clip"><rect width="100%" height="100%"/></clipPath><g clip-path="url(#sg-bk-lens-clip)" class="sg-bk-lens-fgrid">' + gLines + '</g><rect width="100%" height="100%" class="sg-bk-lens-fline"/></svg>' +
        '<span class="sg-bk-lens-name">' + esc(String(an.id).replace(/^(ic|icon)[-_]/i, '').replace(/^[smlx]{1,2}-/i, '').replace(/-[smlx]{1,2}$/i, '')) + '</span></div>';   // the icon's name, inside its frame
      // The colour squares, stacked at the left, the icon in each: drawn by the page, in the brand's corner radius.
      var sq = 105, sqGap = (583 - 117 * 4) / 3, sqTop = frameY + (583 - (sq * 4 + sqGap * 3)) / 2, squares = (sw || []).slice(0, 4).map(function (o, k) {
        return '<div class="sg-bk-lens-sw" style="left:' + ((105 - sq / 2) / VW * 100) + '%;top:' + ((sqTop + k * (sq + sqGap)) / VH * 100) + '%;width:' + (sq / VW * 100) + '%;height:' + (sq / VH * 100) + '%;background:' + esc(o.bg) + ';color:' + esc(o.fg) + '"><svg viewBox="' + bx.join(' ') + '" fill="currentColor" aria-hidden="true">' + body + '</svg></div>';
      }).join('');
      return '<div class="sg-bk-lens-wrap">' + squares + lensFrame + '<svg class="sg-bk-geo sg-bk-lens" viewBox="0 0 ' + VW + ' ' + VH + '" aria-hidden="true" data-stroke="' + an.w + '" data-cap="' + (an.end ? (an.end.round ? 'round' : 'flat') : '') + '" data-join="' + (an.corner ? (an.corner.round ? 'round' : 'sharp') : '') + '" data-gap="' + (an.gap ? num(an.gap.gap) : '') + '">' + out + '</svg>' + caps + '</div>';
    }
    var anatomyCache = {};
    function iconAnatomy(ids) {
      var key = ids.join('|'); if (anatomyCache[key] !== undefined) return anatomyCache[key];
      var S = 10, cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
      var read = function (id) {
        var sym = document.getElementById(id); if (!sym) return null;
        var vb = (sym.getAttribute('viewBox') || '0 0 24 24').split(/[\s,]+/).map(Number), W = Math.round(vb[2] * S), H = Math.round(vb[3] * S);
        if (!(W > 0 && H > 0) || W > 1200 || H > 1200) return null;
        cv.width = W; cv.height = H; ctx.clearRect(0, 0, W, H);
        var drawn = 0;
        Array.prototype.forEach.call(sym.querySelectorAll('path,circle,rect,ellipse,polygon,polyline,line'), function (el) {
          var attr = function (k) { for (var n = el; n && n !== sym.parentNode; n = n.parentNode) if (n.getAttribute && n.getAttribute(k) != null) return n.getAttribute(k); return null; };
          var fill = attr('fill'), stroke = attr('stroke'), sw = parseFloat(attr('stroke-width')) || 1, p = new Path2D(), g = function (k) { return parseFloat(el.getAttribute(k)) || 0; };
          var t = el.tagName.toLowerCase();
          if (t === 'path') p = new Path2D(el.getAttribute('d') || '');
          else if (t === 'circle') p.arc(g('cx'), g('cy'), g('r'), 0, 2 * Math.PI);
          else if (t === 'ellipse') p.ellipse(g('cx'), g('cy'), g('rx'), g('ry'), 0, 0, 2 * Math.PI);
          else if (t === 'rect') { if (p.roundRect) p.roundRect(g('x'), g('y'), g('width'), g('height'), g('rx') || g('ry')); else p.rect(g('x'), g('y'), g('width'), g('height')); }
          else if (t === 'line') { p.moveTo(g('x1'), g('y1')); p.lineTo(g('x2'), g('y2')); }
          else { var pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number); for (var i = 0; i + 1 < pts.length; i += 2) p[i ? 'lineTo' : 'moveTo'](pts[i], pts[i + 1]); if (t === 'polygon') p.closePath(); }
          ctx.setTransform(S, 0, 0, S, -vb[0] * S, -vb[1] * S);
          var tf = el.getAttribute('transform');
          if (tf) try { var m = new DOMMatrix(tf.replace(/(\d)\s+(?=[-\d.])/g, '$1,')); ctx.transform(m.a, m.b, m.c, m.d, m.e, m.f); } catch (e) { /* drawn without it */ }
          ctx.fillStyle = ctx.strokeStyle = '#000';
          if (stroke && stroke !== 'none') { ctx.lineWidth = sw; ctx.lineCap = attr('stroke-linecap') || 'butt'; ctx.lineJoin = attr('stroke-linejoin') || 'miter'; ctx.stroke(p); drawn++; }
          if (fill !== 'none' || !stroke || stroke === 'none') { ctx.fill(p, attr('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero'); drawn++; }
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (!drawn) return null;
        var px = ctx.getImageData(0, 0, W, H).data, on = new Uint8Array(W * H), count = 0;
        for (var i = 0; i < W * H; i++) if (px[i * 4 + 3] > 127) { on[i] = 1; count++; }
        if (!count) return null;
        // The stroke: the run most often crossed (a filled area or a slanted line crosses wider, and less often).
        var runs = {}, tally = function (len) { if (len >= 3 && len < W / 4) runs[len] = (runs[len] || 0) + 1; };
        for (var y = 0; y < H; y++) { var r = 0; for (var x = 0; x <= W; x++) { if (x < W && on[y * W + x]) r++; else { tally(r); r = 0; } } }
        for (var x2 = 0; x2 < W; x2++) { var r2 = 0; for (var y2 = 0; y2 <= H; y2++) { if (y2 < H && on[y2 * W + x2]) r2++; else { tally(r2); r2 = 0; } } }
        var best = 0, bestN = 0;
        Object.keys(runs).forEach(function (k) { var n = (runs[k] || 0) + (runs[+k - 1] || 0) + (runs[+k + 1] || 0); if (n > bestN) { bestN = n; best = +k; } });
        if (!best) return null;
        // The stroke Figma gives it, else the one its code draws, else the one measured.
        var given = ((DATA.iconFigma || {})[id] || {}).stroke, line = sym.querySelector('[stroke-width]'), src = 'pixels', capIs = null, joinIs = null;
        var w = Math.round(best / S * 4) / 4;
        if (given) { w = given.weight; capIs = given.cap; joinIs = given.join; src = 'figma'; }
        else if (line && parseFloat(line.getAttribute('stroke-width')) > 0) { w = parseFloat(line.getAttribute('stroke-width')); capIs = line.getAttribute('stroke-linecap') || 'butt'; joinIs = line.getAttribute('stroke-linejoin') || 'miter'; src = 'code'; }
        // Thinned to one pixel (Zhang and Suen).
        var sk = on.slice(), nb = function (a, x, y) { return [a[(y - 1) * W + x], a[(y - 1) * W + x + 1], a[y * W + x + 1], a[(y + 1) * W + x + 1], a[(y + 1) * W + x], a[(y + 1) * W + x - 1], a[y * W + x - 1], a[(y - 1) * W + x - 1]]; };
        for (var it = 0, changed = true; changed && it < 60; it++) {
          changed = false;
          for (var pass = 0; pass < 2; pass++) {
            var del = [];
            for (var yy = 1; yy < H - 1; yy++) for (var xx = 1; xx < W - 1; xx++) {
              if (!sk[yy * W + xx]) continue;
              var P = nb(sk, xx, yy), B = P.reduce(function (a, v) { return a + v; }, 0); if (B < 2 || B > 6) continue;
              var A = 0; for (var k = 0; k < 8; k++) if (!P[k] && P[(k + 1) % 8]) A++; if (A !== 1) continue;
              if (pass === 0 ? (P[0] * P[2] * P[4] || P[2] * P[4] * P[6]) : (P[0] * P[2] * P[6] || P[0] * P[4] * P[6])) continue;
              del.push(yy * W + xx);
            }
            if (del.length) { changed = true; del.forEach(function (q) { sk[q] = 0; }); }
          }
        }
        var nbs = function (q) { var x = q % W, y = (q - x) / W, out = []; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; var X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && sk[Y * W + X]) out.push(Y * W + X); } return out; };
        // Walk k steps along the line from q, away from where it came: the point reached (or null at a fork).
        // Two next pixels side by side are one line turning (the thinning leaves a step); apart, a fork.
        var walk = function (q, from, k, least) {
          var prev = from, cur = q, dist = function (m, o) { return Math.hypot(m % W - o % W, Math.floor(m / W) - Math.floor(o / W)); };
          for (var s = 0; s < k; s++) {
            var n = nbs(cur).filter(function (m) { return m !== prev && nbs(prev).indexOf(m) < 0; });
            if (n.length > 1 && n.every(function (m) { return n.every(function (o) { return o === m || dist(m, o) < 1.5; }); })) n = [n.sort(function (x, y) { return dist(y, prev) - dist(x, prev); })[0]];
            if (n.length !== 1) return least && s >= least ? cur : null;   // a fork: far enough, where it is
            prev = cur; cur = n[0];
          }
          return cur;
        };
        // A turn is read two strokes along each way (a wide rounded corner only shows its turn from that far), or as far as
        // the line goes before a fork, a stroke at least.
        var stepK = Math.max(4, Math.round(best * 2)), ends = [], corners = [];
        for (var q = 0; q < W * H; q++) {
          if (!sk[q]) continue;
          var n0 = nbs(q);
          if (n0.length === 1) { var far = walk(n0[0], q, Math.round(best)); if (far != null) ends.push({ q: q, toward: far }); }   // a spur from a square corner is shorter than the stroke
          else if (n0.length === 2) {
            var a = walk(n0[0], q, stepK, best), b = walk(n0[1], q, stepK, best); if (a == null || b == null) continue;
            var qx = q % W, qy = (q - qx) / W, ax = a % W - qx, ay = (a - a % W) / W - qy, bx = b % W - qx, by = (b - b % W) / W - qy;
            var cos = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
            if (cos > -0.35) corners.push({ q: q, cos: cos, a: a, b: b });   // turns by more than about 70 degrees
          }
        }
        // Round where a disc of half the stroke, rolled inside the shape, covers what is near the point.
        var R = Math.max(2, best / 2 - 0.75), disc = [];
        for (var dy = -Math.ceil(R); dy <= Math.ceil(R); dy++) for (var dx = -Math.ceil(R); dx <= Math.ceil(R); dx++) if (dx * dx + dy * dy <= R * R) disc.push([dx, dy]);
        var round = function (q) {
          var cx = q % W, cy = (q - cx) / W, half = Math.round(best * 1.5), fits = {}, lost = 0;
          var at = function (x, y) { return x >= 0 && y >= 0 && x < W && y < H && on[y * W + x]; };
          var ok = function (x, y) { var k = y * W + x; if (fits[k] === undefined) fits[k] = at(x, y) && disc.every(function (d) { return at(x + d[0], y + d[1]); }); return fits[k]; };
          for (var y = cy - half; y <= cy + half; y++) for (var x = cx - half; x <= cx + half; x++) {
            if (!at(x, y)) continue;
            if (!disc.some(function (d) { return ok(x + d[0], y + d[1]); })) lost++;
          }
          return lost < 0.15 * R * R;   // a square corner loses about 0.2 R² each
        };
        var pt = function (q) { var x = q % W; return [(x + 0.5) / S + vb[0], ((q - x) / W + 0.5) / S + vb[1]]; };
        var toU = function (x, y) { return [x / S + vb[0], y / S + vb[1]]; }, cen = function (q) { return [q % W + 0.5, Math.floor(q / W) + 0.5]; };
        var unit = function (x, y) { var d = Math.hypot(x, y) || 1; return [x / d, y / d]; };
        // Sub-pixel: how much of a point the drawing covers (its edges are anti-aliased), and how far along a direction an
        // edge is crossed, so a mark lands on the stroke's real edge, not on the pixel next to it.
        var cover = function (x, y) {
          var x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5), fx = x - 0.5 - x0, fy = y - 0.5 - y0;
          var g = function (X, Y) { return X < 0 || Y < 0 || X >= W || Y >= H ? 0 : px[(Y * W + X) * 4 + 3] / 255; };
          return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
        };
        var cross = function (x, y, ux, uy, max) {
          var prev = cover(x, y), inside = prev >= 0.5;
          for (var t = 0.25; t <= max; t += 0.25) { var c = cover(x + ux * t, y + uy * t); if ((c >= 0.5) !== inside) return t - 0.25 + 0.25 * (prev - 0.5) / ((prev - c) || 1); prev = c; }
          return null;
        };
        // The middle of the stroke across a point inside it, and its width there.
        // Only a clean cross-section counts: one as wide as the stroke (not into a curve or a crossing line).
        var across = function (x, y, u) {
          if (cover(x, y) < 0.5) return null;
          var t1 = cross(x, y, -u[1], u[0], best * 2), t2 = cross(x, y, u[1], -u[0], best * 2);
          if (t1 == null || t2 == null || Math.abs(t1 + t2 - best) > best * 0.12) return null;
          return { x: x - u[1] * (t1 - t2) / 2, y: y + u[0] * (t1 - t2) / 2, w: t1 + t2 };
        };
        corners.sort(function (a, b) { return b.cos - a.cos; });
        // The cap's centre: half a stroke back from the tip, the tip found by going on along the line until the shape stops
        // (thinning stops the line short of it, by an amount that varies).
        var capAt = function (e) {
          var ex = e.q % W, ey = (e.q - ex) / W, tx = e.toward % W, ty = (e.toward - tx) / W, dx = ex - tx, dy = ey - ty, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d, t = 0;
          while (t < best * 2) { var X = Math.round(ex + ux * (t + 0.5)), Y = Math.round(ey + uy * (t + 0.5)); if (X < 0 || Y < 0 || X >= W || Y >= H || !on[Y * W + X]) break; t += 0.5; }
          var c = t - best / 2;
          return [(ex + ux * c) / S + vb[0], (ey + uy * c) / S + vb[1]];
        };
        // An end, exactly: the line's middle read across it a stroke and two strokes back, its tip where the shape stops
        // along that middle, the cap's centre half its width back from the tip.
        var endAt = function (e) {
          var c0 = capAt(e), C = [(c0[0] - vb[0]) * S, (c0[1] - vb[1]) * S], tw = cen(e.toward), u = unit(C[0] - tw[0], C[1] - tw[1]);
          var m1 = across(C[0] - u[0] * best * 1.2, C[1] - u[1] * best * 1.2, u), m2 = across(C[0] - u[0] * best * 2.2, C[1] - u[1] * best * 2.2, u);
          if (m1 && m2) u = unit(m1.x - m2.x, m1.y - m2.y);
          var base = m1 || { x: C[0] - u[0] * best, y: C[1] - u[1] * best, w: best }, wid = m1 && m2 ? (m1.w + m2.w) / 2 : base.w;
          var t = cross(base.x, base.y, u[0], u[1], best * 4); if (t == null) t = best * 1.5;
          var T = [base.x + u[0] * t, base.y + u[1] * t];
          return { at: toU(T[0] - u[0] * wid / 2, T[1] - u[1] * wid / 2), tip: toU(T[0], T[1]), toward: toU(base.x, base.y), dir: u, wid: wid / S, mid: m1 };
        };
        // Each end once.
        var tips = [];
        ends.forEach(function (e) {
          var r = endAt(e);
          if (!tips.some(function (o) { return Math.hypot(o.at[0] - r.at[0], o.at[1] - r.at[1]) < w; })) { r.q = e.q; tips.push(r); }
        });
        // Where the line is open: two ends that face each other across a short gap (the nearest pair, the highest first).
        var gap = null;
        tips.forEach(function (a, i) { tips.slice(i + 1).forEach(function (b) {
          var dx = b.at[0] - a.at[0], dy = b.at[1] - a.at[1], d = Math.hypot(dx, dy) || 1;
          if (a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] > -0.8 || (dx * a.dir[0] + dy * a.dir[1]) / d < 0.8 || d > w * 6) return;
          // One line through both: its axis joins the two ends' middles, each tip found along it.
          var ta = a.tip, tb = b.tip;
          if (a.mid && b.mid) {
            var ax = unit(b.mid.x - a.mid.x, b.mid.y - a.mid.y), da = cross(a.mid.x, a.mid.y, ax[0], ax[1], best * 4), db = cross(b.mid.x, b.mid.y, -ax[0], -ax[1], best * 4);
            if (da != null && db != null) { ta = toU(a.mid.x + ax[0] * da, a.mid.y + ax[1] * da); tb = toU(b.mid.x - ax[0] * db, b.mid.y - ax[1] * db); }
          }
          var g = { a: a, b: b, ta: ta, tb: tb, mid: [(ta[0] + tb[0]) / 2, (ta[1] + tb[1]) / 2], gap: Math.round(Math.hypot(tb[0] - ta[0], tb[1] - ta[1]) * 4) / 4 };
          if (!gap || g.mid[1] < gap.mid[1] - w || (Math.abs(g.mid[1] - gap.mid[1]) <= w && g.gap < gap.gap)) gap = g;
        }); });
        // The cap: the lowest end not at the gap. The join: the turn nearest the top left, at its sharpest.
        var free = tips.filter(function (t) { return !gap || (t !== gap.a && t !== gap.b); });
        var low = (free.length ? free : tips).sort(function (a, b) { return b.at[1] - a.at[1]; })[0];
        var end = low ? { at: low.at, toward: low.toward, wid: low.wid, round: capIs ? capIs === 'round' : round(low.q) } : null;
        var tl = corners.slice().sort(function (a, b) { var p1 = pt(a.q), p2 = pt(b.q); return p1[0] + p1[1] - p2[0] - p2[1]; })[0], cq = null;
        if (tl) { var tp = pt(tl.q); cq = corners.filter(function (c) { var p2 = pt(c.q); return Math.hypot(p2[0] - tp[0], p2[1] - tp[1]) < w * 2; }).sort(function (a, b) { return b.cos - a.cos; })[0]; }
        // A turn, exactly: each arm's middle line read across it, where the two lines meet, the corner their outer edges
        // make, and how far in the drawing's outer curve starts from it along the turn's bisector: its radius, and centre.
        var turnAt = function (c) {
          // Each arm read at several distances out from the turn; the two farthest clean cross-sections give its line.
          var K = cen(c.q), arm = function (e) {
            var E = cen(e), u = unit(E[0] - K[0], E[1] - K[1]), ok = [];
            [1, 0.85, 0.7, 0.55, 0.4].forEach(function (f) { if (ok.length < 2) { var m = across(K[0] + (E[0] - K[0]) * f, K[1] + (E[1] - K[1]) * f, u); if (m) ok.push(m); } });
            if (ok.length === 2 && Math.hypot(ok[0].x - ok[1].x, ok[0].y - ok[1].y) > 2) u = unit(ok[0].x - ok[1].x, ok[0].y - ok[1].y);
            return ok[0] ? { x: ok[0].x, y: ok[0].y, u: u, w: ok[0].w } : null;
          };
          var A = arm(c.a), B = arm(c.b); if (!A || !B) return null;
          var den = A.u[0] * B.u[1] - A.u[1] * B.u[0]; if (Math.abs(den) < 0.2) return null;
          var tA = ((B.x - A.x) * B.u[1] - (B.y - A.y) * B.u[0]) / den, P = [A.x + A.u[0] * tA, A.y + A.u[1] * tA];
          var bis = unit(A.u[0] + B.u[0], A.u[1] + B.u[1]), half = Math.acos(Math.max(-1, Math.min(1, A.u[0] * B.u[0] + A.u[1] * B.u[1]))) / 2, sn = Math.sin(half) || 1, wid = (A.w + B.w) / 2;
          var Q = [P[0] - bis[0] * wid / 2 / sn, P[1] - bis[1] * wid / 2 / sn], d = cross(Q[0], Q[1], bis[0], bis[1], best * 6) || 0;
          var r = 1 / sn - 1 > 0.01 ? d / (1 / sn - 1) : 0, O = [Q[0] + bis[0] * r / sn, Q[1] + bis[1] * r / sn];
          // Where the curve meets each arm's outer edge (out from its centre, away from the other arm), and its middle.
          var out = function (u, v) { var k = u[0] * v[0] + u[1] * v[1]; return unit(-(v[0] - k * u[0]), -(v[1] - k * u[1])); }, nA = out(A.u, B.u), nB = out(B.u, A.u);
          var mr = Math.max(0, r - wid / 2);   // the lens on the middle of the stroke where it turns
          return { at: toU(O[0] - bis[0] * mr, O[1] - bis[1] * mr), o: toU(O[0], O[1]), r: r / S, ta: toU(O[0] + nA[0] * r, O[1] + nA[1] * r), tb: toU(O[0] + nB[0] * r, O[1] + nB[1] * r), wid: wid / S };
        };
        var turn = cq ? turnAt(cq) : null;
        // A plain stretch of line, for its thickness: the straight point of the line farthest from every end and turn
        // whose cross-section is clean, read edge to edge.
        var keys = tips.map(function (t) { return t.at; }).concat(corners.map(function (c) { return pt(c.q); })), thick = null, far0 = 0;
        for (var q3 = 0; q3 < W * H; q3++) {
          if (!sk[q3]) continue;
          var n3 = nbs(q3); if (n3.length !== 2) continue;
          var P3 = pt(q3), dmin = keys.reduce(function (m, k) { return Math.min(m, Math.hypot(k[0] - P3[0], k[1] - P3[1])); }, Infinity);
          if (dmin <= far0) continue;
          var a3 = walk(n3[0], q3, Math.round(best)), b3 = walk(n3[1], q3, Math.round(best)); if (a3 == null || b3 == null) continue;
          var K3 = cen(q3), A3 = cen(a3), B3 = cen(b3), ua3 = unit(A3[0] - K3[0], A3[1] - K3[1]), ub3 = unit(B3[0] - K3[0], B3[1] - K3[1]);
          if (ua3[0] * ub3[0] + ua3[1] * ub3[1] > -0.985) continue;   // straight there
          var u3 = unit(A3[0] - B3[0], A3[1] - B3[1]), m3 = across(K3[0], K3[1], u3); if (!m3) continue;
          far0 = dmin; thick = { at: toU(m3.x, m3.y), e1: toU(m3.x - u3[1] * m3.w / 2, m3.y + u3[0] * m3.w / 2), e2: toU(m3.x + u3[1] * m3.w / 2, m3.y - u3[0] * m3.w / 2), dir: u3, wid: m3.w / S };
        }
        var corner = cq ? { at: turn ? turn.at : pt(cq.q), r: turn ? turn.r : 0, o: turn && turn.o, ta: turn && turn.ta, tb: turn && turn.tb, round: joinIs ? joinIs === 'round' : round(cq.q) } : null;
        // The construction line: the thinned line traced into paths (a staircase pixel the thinning leaves is skipped),
        // a spur shorter than the stroke dropped, each end carried on to its cap's centre, and simplified to its corners
        // (Ramer-Douglas-Peucker, a twentieth of a unit). Its turns: one per corner, at its sharpest.
        // Only where the line sits a half stroke inside the shape (its exact distance to the outside, Felzenszwalb's
        // transform): the spurs thinning leaves toward a corner's outer point fall away.
        var INF = 1e9, dt = new Float64Array(W * H);
        for (var qd = 0; qd < W * H; qd++) dt[qd] = on[qd] ? INF : 0;
        var pass1 = function (f, n) {
          var d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
          for (var q = 1; q < n; q++) { var sx; do { var r = v[k]; sx = ((f[q] + q * q) - (f[r] + r * r)) / (2 * q - 2 * r); if (sx <= z[k]) k--; else break; } while (k >= 0); k++; v[k] = q; z[k] = sx; z[k + 1] = INF; }
          k = 0; for (var q2 = 0; q2 < n; q2++) { while (z[k + 1] < q2) k++; d[q2] = (q2 - v[k]) * (q2 - v[k]) + f[v[k]]; }
          return d;
        };
        for (var yy2 = 0; yy2 < H; yy2++) { var row = pass1(dt.subarray(yy2 * W, yy2 * W + W), W); for (var xx2 = 0; xx2 < W; xx2++) dt[yy2 * W + xx2] = row[xx2]; }
        for (var xx3 = 0; xx3 < W; xx3++) { var colv = new Float64Array(H); for (var yy3 = 0; yy3 < H; yy3++) colv[yy3] = dt[yy3 * W + xx3]; var cd = pass1(colv, H); for (var yy4 = 0; yy4 < H; yy4++) dt[yy4 * W + xx3] = cd[yy4]; }
        var deep2 = Math.pow(best * 0.42, 2), line = sk.slice();
        for (var qp = 0; qp < W * H; qp++) if (line[qp] && dt[qp] < deep2) line[qp] = 0;
        // One pixel wide everywhere: a pixel whose neighbours stay joined without it is dropped (a step, a two-pixel clump
        // on a slant), an end and a fork kept.
        for (var pass2 = 0, gone = 1; gone && pass2 < 8; pass2++) {
          gone = 0;
          for (var qs = 0; qs < W * H; qs++) {
            if (!line[qs]) continue;
            var xs = qs % W, ys = (qs - xs) / W, ring = [];
            for (var dy4 = -1; dy4 <= 1; dy4++) for (var dx4 = -1; dx4 <= 1; dx4++) { if (!dx4 && !dy4) continue; var rx4 = xs + dx4, ry4 = ys + dy4; if (rx4 >= 0 && ry4 >= 0 && rx4 < W && ry4 < H && line[ry4 * W + rx4]) ring.push([dx4, dy4]); }
            if (ring.length < 2) continue;
            var seen4 = [ring[0]], stack4 = [ring[0]];
            while (stack4.length) { var c4 = stack4.pop(); ring.forEach(function (o) { if (seen4.indexOf(o) < 0 && Math.abs(o[0] - c4[0]) <= 1 && Math.abs(o[1] - c4[1]) <= 1) { seen4.push(o); stack4.push(o); } }); }
            if (seen4.length === ring.length) { line[qs] = 0; gone = 1; }
          }
        }
        var lnb = function (q) { var x = q % W, y = (q - x) / W, o = []; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { if (!dx && !dy) continue; var X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H && line[Y * W + X]) o.push(Y * W + X); } return o; };
        var done = {}, runs = [];
        for (var qn = 0; qn < W * H; qn++) {
          if (!line[qn] || lnb(qn).length === 2) continue;
          lnb(qn).forEach(function (m) {
            if (done[qn + '>' + m]) return;
            var path = [qn, m], prev = qn, cur = m;
            while (lnb(cur).length === 2 && path.length < W * H) { var nx = lnb(cur).filter(function (o) { return o !== prev; })[0]; if (nx == null || nx === qn) break; path.push(nx); prev = cur; cur = nx; }
            done[qn + '>' + m] = done[cur + '>' + prev] = 1;
            runs.push(path);
          });
        }
        var tipOf = {}; tips.forEach(function (t) { tipOf[t.q] = t; });
        var simplify = function (pts, eps) {
          if (pts.length < 3) return pts;
          var a = pts[0], b = pts[pts.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-9, far = 0, at = 0;
          for (var k = 1; k < pts.length - 1; k++) { var dd = Math.abs((pts[k][0] - a[0]) * dy - (pts[k][1] - a[1]) * dx) / L; if (dd > far) { far = dd; at = k; } }
          return far > eps ? simplify(pts.slice(0, at + 1), eps).slice(0, -1).concat(simplify(pts.slice(at), eps)) : [a, b];
        };
        // A spur (one free end, shorter than the stroke) is the thinning's, not the drawing's; a short stroke on its own is kept.
        var freeEnd = function (q) { return lnb(q).length === 1; }, endsAt = [];
        var stretch = function (r, k) { var q = r[k === 0 ? 0 : r.length - 1], deep = r[k === 0 ? Math.min(r.length - 1, Math.round(best)) : Math.max(0, r.length - 1 - Math.round(best))]; return tipOf[q] ? tipOf[q].at : endAt({ q: q, toward: deep }).at; };
        // Smoothed (the thinning steps a pixel at a time), then simplified.
        var smooth = function (pts) { return pts.map(function (p, k) { if (k < 2 || k > pts.length - 3) return p; var sx = 0, sy = 0; for (var j = -2; j <= 2; j++) { sx += pts[k + j][0]; sy += pts[k + j][1]; } return [sx / 5, sy / 5]; }); };
        var kept = runs.filter(function (r) {
          var fa = freeEnd(r[0]) && !tipOf[r[0]], fb = freeEnd(r[r.length - 1]) && !tipOf[r[r.length - 1]];
          return !((fa !== fb) && r.length < best);   // a piece between two forks stays, however short
        });
        // Each point is the stroke's true middle across it (sub-pixel), so a straight stretch is straight; where no clean
        // cross-section exists (at a fork), the line runs on straight to the fork.
        var rawPts = [], build = kept.map(function (r) {
          var pts = [];
          for (var k = 0; k < r.length; k++) {
            var A = cen(r[Math.max(0, k - 3)]), B = cen(r[Math.min(r.length - 1, k + 3)]), C = cen(r[k]), m = across(C[0], C[1], unit(B[0] - A[0], B[1] - A[1]));
            if (m) pts.push(toU(m.x, m.y));
          }
          if (pts.length < 2) pts = r.length > 4 ? smooth(r.map(pt)) : r.map(pt);
          var onTo = function (P, p0, p1) { var u = unit(p0[0] - p1[0], p0[1] - p1[1]), t = (P[0] - p0[0]) * u[0] + (P[1] - p0[1]) * u[1]; return t > 0 ? [p0[0] + u[0] * t, p0[1] + u[1] * t] : null; };
          // A free end: on the line itself, half a stroke back from where the line leaves the shape (the cap's centre).
          var capOn = function (a, b) {
            var u = unit(a[0] - b[0], a[1] - b[1]), ax = (a[0] - vb[0]) * S, ay = (a[1] - vb[1]) * S, t = cross(ax, ay, u[0], u[1], best * 4);
            return t == null ? null : toU(ax + u[0] * (t - best / 2), ay + u[1] * (t - best / 2));
          };
          var lineEnd = function (first) { var n = pts.length, a = first ? pts[0] : pts[n - 1], b = first ? pts[Math.min(n - 1, 4)] : pts[Math.max(0, n - 5)]; return n > 1 ? capOn(a, b) : null; };
          if (freeEnd(r[0])) { var e0 = lineEnd(true) || stretch(r, 0); pts.unshift(e0); endsAt.push(e0); } else if (pts.length > 1) { var f0 = onTo(pt(r[0]), pts[0], pts[1]); if (f0) pts.unshift(f0); }
          if (freeEnd(r[r.length - 1])) { var e1 = lineEnd(false) || stretch(r, 1); pts.push(e1); endsAt.push(e1); } else if (pts.length > 1) { var f1 = onTo(pt(r[r.length - 1]), pts[pts.length - 1], pts[pts.length - 2]); if (f1) pts.push(f1); }
          rawPts.push(pts.slice());
          return simplify(pts, 0.03);
        });
        // Where strokes meet (an arrow's tip, a bar into a side) they join where their middle lines cross: a T's bar runs
        // on to the side's own line, a tip sits where its two arms' lines meet (the thinning stops short of both).
        var meet = {}, joins = [];
        kept.forEach(function (r, k) { [[r[0], 0], [r[r.length - 1], 1]].forEach(function (e) { if (!freeEnd(e[0])) (meet[e[0]] = meet[e[0]] || []).push([k, e[1]]); }); });
        Object.keys(meet).forEach(function (n) {
          var m = meet[n]; if (m.length < 2) return;
          var N = pt(+n), near = m.length === 2 ? w * 1.5 : w;
          // Each arm's line read on the stroke's true middle, a stroke or so out from the meeting (near it, thinning bends it).
          var seg = function (e) {
            var ps = e[1] ? rawPts[e[0]].slice().reverse() : rawPts[e[0]], d = function (p) { return Math.hypot(p[0] - N[0], p[1] - N[1]); };
            var a = ps.filter(function (p) { return d(p) > near; })[0], b = ps.filter(function (p) { return d(p) > near + w * 2; })[0] || ps[ps.length - 1];
            return a && b && d(b) > d(a) ? [a, unit(a[0] - b[0], a[1] - b[1])] : null;
          };
          var arms = m.map(seg); if (arms.some(function (A) { return !A; })) return;
          var crossAt = function (A, P, u) { var den = A[1][0] * u[1] - A[1][1] * u[0]; if (Math.abs(den) < 0.2) return null; var t = ((P[0] - A[0][0]) * u[1] - (P[1] - A[0][1]) * u[0]) / den; return [A[0][0] + A[1][0] * t, A[0][1] + A[1][1] * t]; };
          var X;
          if (m.length === 2) X = crossAt(arms[0], arms[1][0], arms[1][1]);   // a tip: its two arms' lines cross
          else {
            // A T: the side is the two arms most nearly opposite, its line through their points either side of the meeting
            // (straight there, however it curves further on); each other arm runs on to it.
            var pi = 0, pj = 1, lo = 2;
            for (var i3 = 0; i3 < arms.length; i3++) for (var j3 = i3 + 1; j3 < arms.length; j3++) { var dd3 = arms[i3][1][0] * arms[j3][1][0] + arms[i3][1][1] * arms[j3][1][1]; if (dd3 < lo) { lo = dd3; pi = i3; pj = j3; } }
            var P0 = arms[pi][0], su = unit(arms[pj][0][0] - P0[0], arms[pj][0][1] - P0[1]), hits = [];
            arms.forEach(function (A, k3) { if (k3 !== pi && k3 !== pj) { var h = crossAt(A, P0, su); if (h) hits.push(h); } });
            if (hits.length) X = [hits.reduce(function (s3, h) { return s3 + h[0]; }, 0) / hits.length, hits.reduce(function (s3, h) { return s3 + h[1]; }, 0) / hits.length];
          }
          if (!X || Math.hypot(X[0] - N[0], X[1] - N[1]) > w * 1.5) return;
          // The bent part near the meeting goes; each arm runs straight to the crossing.
          m.forEach(function (e) {
            var ps = build[e[0]], keep = ps.filter(function (p) { return Math.hypot(p[0] - X[0], p[1] - X[1]) > near; });
            if (keep.length < 1) keep = [e[1] ? ps[0] : ps[ps.length - 1]];
            build[e[0]] = e[1] ? keep.concat([X]) : [X].concat(keep);
          });
          if (m.length === 2) joins.push(X);   // a tip is a turn; a T is not
        });
        // The turns: each corner once at its sharpest, and any point where the simplified line bends by more than 60 degrees.
        var turnDots = [], addTurn = function (p) { if (!turnDots.concat(endsAt).some(function (o) { return Math.hypot(o[0] - p[0], o[1] - p[1]) < w * (turnDots.indexOf(o) >= 0 ? 2 : 1.2); })) turnDots.push(p); };   // two strokes apart, never on an end
        // The cap lens shows the same end the construction line draws (read on the line itself).
        if (end) { var nearE = endsAt.slice().sort(function (a, b) { return Math.hypot(a[0] - end.at[0], a[1] - end.at[1]) - Math.hypot(b[0] - end.at[0], b[1] - end.at[1]); })[0]; if (nearE && Math.hypot(nearE[0] - end.at[0], nearE[1] - end.at[1]) < w) { end.at = nearE; end.wid = best / S; } }
        joins.forEach(addTurn);
        corners.slice().sort(function (a, b) { return b.cos - a.cos; }).forEach(function (c) { addTurn(pt(c.q)); });
        build.forEach(function (ps) { for (var k = 1; k < ps.length - 1; k++) { var u1 = unit(ps[k][0] - ps[k - 1][0], ps[k][1] - ps[k - 1][1]), u2 = unit(ps[k + 1][0] - ps[k][0], ps[k + 1][1] - ps[k][1]); if (u1[0] * u2[0] + u1[1] * u2[1] < 0.5) addTurn(ps[k]); } });
        return { id: id, w: w, src: src, box: vb, end: end, corner: corner, thick: thick, build: { paths: build, ends: endsAt, turns: turnDots }, gap: gap ? { at: gap.mid, a: gap.ta, b: gap.tb, gap: gap.gap } : null };
      };
      var all = ids.slice(0, 24).map(function (id) { try { return read(id); } catch (e) { return null; } }).filter(Boolean);
      var out = null;
      if (all.length) {
        var wCount = {}; all.forEach(function (a) { wCount[a.w] = (wCount[a.w] || 0) + 1; });
        var wSet = Number(Object.keys(wCount).sort(function (a, b) { return wCount[b] - wCount[a]; })[0]);
        var pick = all.filter(function (a) { return a.end && a.corner && a.gap && a.w === wSet; })[0] || all.filter(function (a) { return a.end && a.corner && a.w === wSet; })[0] || all.filter(function (a) { return a.end || a.corner; })[0];
        if (pick) {
          var ends = all.filter(function (a) { return a.end; }), corners = all.filter(function (a) { return a.corner; });
          out = { id: pick.id, w: pick.w, src: pick.src, box: pick.box, end: pick.end, corner: pick.corner, gap: pick.gap, thick: pick.thick, build: pick.build,
            set: { read: all.length, sameW: wCount[wSet], w: wSet, ends: ends.length, roundEnds: ends.filter(function (a) { return a.end.round; }).length, corners: corners.length, roundCorners: corners.filter(function (a) { return a.corner.round; }).length } };
        }
      }
      anatomyCache[key] = out;
      return out;
    }
    var bkDraw = function () {
      if (bkProbe) { bkProbe.remove(); bkProbe = null; }
      bkMemo = {};
      // The brand's values apply where a theme is set: the kit carries the page's own, so it reads the brand chosen.
      var colAxis = AXES.filter(function (a) { return a.colour && a.attr && !a.classes; })[0];
      if (colAxis) { var tv = SGModes.effective(colAxis, document.documentElement); if (tv) bkOut.setAttribute(colAxis.attr, tv); else bkOut.removeAttribute(colAxis.attr); }
      // The page's layout stays put from theme to theme: its own spacing, read where no theme reaches (the root), so a
      // theme with more room moves nothing; the theme's spacing shows in its samples (the spacing card, the cards' pads).
      var rootCs = getComputedStyle(document.documentElement);
      ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl'].forEach(function (k) { var v = rootCs.getPropertyValue('--sg-space-' + k).trim(); if (v) bkOut.style.setProperty('--sg-space-' + k, v); });
      ['--sg-card-gap', '--sg-radius'].forEach(function (n) { var v = rootCs.getPropertyValue(n).trim(); if (v) bkOut.style.setProperty(n, v); });
      var html = '';
      var prim = bkCols.filter(isPrim), sem = bkCols.filter(function (t) { return !isPrim(t); });
      // The lightest and darkest from the system's own ramp (its primitives and base colours, the ones a theme restyles),
      // never a component's own colour (a map's water) that keeps one value in every theme; words that need black or
      // white take these, so they follow the theme too.
      var ramp = prim.filter(function (t) { return /^(primitives?|base)\//i.test(t.figma); }); if (!ramp.length) ramp = prim;
      // A see-through colour (an overlay) is never a ground: only solid ones are ranked.
      var bkSolid = ramp.filter(function (t) { var h = bkHex(t) || ''; return !/^#[0-9a-f]{8}$/i.test(h) || /ff$/i.test(h); }); if (bkSolid.length) ramp = bkSolid;
      var lightest = ramp.slice().sort(function (a, b) { return (bkLum(bkHex(b)) || 0) - (bkLum(bkHex(a)) || 0); })[0];
      var darkestT = ramp.slice().sort(function (a, b) { return (bkLum(bkHex(a)) || 0) - (bkLum(bkHex(b)) || 0); })[0];
      var ink = darkestT ? bkHex(darkestT) : '#000000', paper = lightest ? bkHex(lightest) : '#ffffff';
      var INK = darkestT ? bkCss(darkestT) : ink, PAPER = lightest ? bkCss(lightest) : paper;
      // A system with no light-to-dark ramp of its own (its colours all one side): the page's own ground and text, which
      // always read on each other.
      if ((bkRatio(ink, paper) || 0) < 4.5) {
        var bkToHex = function (c) { var m = String(c).match(/[\d.]+/g); return m && m.length >= 3 ? '#' + m.slice(0, 3).map(function (n) { return ('0' + Math.round(+n).toString(16)).slice(-2); }).join('') : null; };
        var pgBg = bkToHex(bkRead('color', 'var(--sg-bg)')), pgTx = bkToHex(bkRead('color', 'var(--sg-text)'));
        if (pgBg && pgTx) { var bgDark = (bkLum(pgBg) || 0) < (bkLum(pgTx) || 0); ink = bgDark ? pgBg : pgTx; paper = bgDark ? pgTx : pgBg; INK = bgDark ? 'var(--sg-bg)' : 'var(--sg-text)'; PAPER = bgDark ? 'var(--sg-text)' : 'var(--sg-bg)'; }
      }
      var inkOrPaper = function (h) { return (bkRatio(h, ink) || 0) >= (bkRatio(h, paper) || 0) ? INK : PAPER; };
      // Words on a colour: the secondary hue when it reads on it (4.5:1 at least, in the brand and mode shown), else black
      // or white, whichever reads better.
      var onOf = function (h, min) { if (second && second !== hero) { var sh = bkHex(second); if ((bkRatio(h, sh) || 0) >= (min || 4.5)) return bkCss(second); } return inkOrPaper(h); };
      // On the main hue the words are the secondary hue whenever it reads as large type does (3:1): the brand's own pair.
      var paint = function (t) { var h = bkHex(t); return 'style="--bk:' + esc(bkCss(t)) + ';--bk-on:' + esc(t === second ? (bkRatio(h, bkHex(hero)) >= 3 ? bkCss(hero) : onOf(h)) : onOf(h, t === hero ? 3 : 4.5)) + '"'; };
      // The kit's own corners are the system's radius tokens: its middle one for a card, its smallest for a small part,
      // its largest for a pill.
      var RAD = [], hadR = {};
      BK_ALL.filter(function (t) { return t.type === 'radius' || /radius/i.test(bkLeaf(t.figma)); }).forEach(function (t) { var n = bkPx(t); if (n != null && !hadR[n]) { hadR[n] = 1; RAD.push({ t: t, n: n }); } });
      RAD.sort(function (a, b) { return a.n - b.n; });
      var radPos = RAD.filter(function (r) { return r.n > 0; });
      // The kit's corners: the general card's own radius (card, cardDefault, cardPrimary), as its shadow is that card's.
      var cardRadT = BK_ALL.filter(function (t) { return /(^|\/)card(-?general|-?primary|-?default|-?base)?\/radius\/(all|top-?left)$/i.test(t.figma); }).sort(function (a, b) { return a.figma.split('/').length - b.figma.split('/').length || a.figma.length - b.figma.length; })[0];
      var radCard = cardRadT ? { t: cardRadT, n: bkPx(cardRadT) } : RAD.find(function (r) { return /(^|\/)(m|md|medium|card)$/i.test(r.t.figma); }) || radPos[Math.floor(radPos.length / 2)];
      // The buttons' corners (buttonPrimary's, else any button's): the kit's bars take them, as the system's controls do.
      var btnRadT = BK_ALL.filter(function (t) { return /(^|\/)button[^/]*\/radius\/(all|top-?left)$/i.test(t.figma); }).sort(function (a, b) { return (/buttonPrimary\//i.test(b.figma) ? 1 : 0) - (/buttonPrimary\//i.test(a.figma) ? 1 : 0) || a.figma.length - b.figma.length; })[0];
      if (btnRadT) bkOut.style.setProperty('--bk-btn-r', bkCss(btnRadT, 'px')); else bkOut.style.removeProperty('--bk-btn-r');
      if (radCard) { bkOut.style.setProperty('--bk-rad', bkCss(radCard.t, 'px')); bkOut.style.setProperty('--bk-rad-s', bkCss(radPos[0].t, 'px')); bkOut.style.setProperty('--bk-rad-l', bkCss(radPos[radPos.length - 1].t, 'px')); }
      // The kit's cards are drawn as the brand draws its own: its border thickness, and its shadow only when the brand
      // has shadows on (its "display" switch for all of them).
      var lineT = BK_ALL.filter(function (t) { return /(^|\/)border\/(all|left|top|width)$/i.test(t.figma) && bkPx(t) != null; }).sort(function (a, b) { return a.figma.split('/').length - b.figma.split('/').length; })[0];
      bkOut.style.setProperty('--bk-line-w', lineT ? 'max(1px, ' + bkCss(lineT, 'px') + ')' : 'var(--sg-line-width, 1px)');   // at least 1px: a card always has its edge
      var shOn = BK_ALL.filter(function (t) { return /(^|\/)shadow\/(all-?)?display$/i.test(t.figma); }).sort(function (a, b) { return a.figma.split('/').length - b.figma.split('/').length; })[0];
      // Shadows are on unless the brand switches them off; then none is drawn or named anywhere in the kit.
      var shadowsOn = !shOn || /^true$/i.test(bkNow(shOn));
      bkOut.style.setProperty('--bk-shadow', '0 0 #0000');   // set from the brand's card shadow below, when it has one on
      // Its two hues (named so in Figma, else its most used hues) colour the hero and every sample.
      var hues = prim.filter(function (t) { return bkChroma(bkHex(t)) > 0.15; }).sort(function (a, b) { return (used[b.figma] || 0) - (used[a.figma] || 0); });
      var hero = bkCols.find(function (t) { return /primary-?hue/i.test(t.figma); }) || bkCols.find(function (t) { return /(^|\/)(brand|primary)/i.test(t.figma); }) || hues[0];
      var second = bkCols.find(function (t) { return t !== hero && /secondary-?hue/i.test(t.figma); }) || bkCols.find(function (t) { return t !== hero && /secondary/i.test(t.figma); }) || hues.filter(function (t) { return t !== hero; })[0];
      if (hero) { var h1 = bkHex(hero), h2 = second ? bkHex(second) : h1; bkOut.style.setProperty('--bk-1', bkCss(hero)); bkOut.style.setProperty('--bk-1-on', onOf(h1, 3)); bkOut.style.setProperty('--bk-2', second ? bkCss(second) : bkCss(hero)); bkOut.style.setProperty('--bk-2-on', second ? onOf(h2) : onOf(h1)); }
      // The family: the system's text style family (the brand's own), else a family token.
      var famT = BK_ALL.find(function (t) { return /font-?family/i.test(t.figma); }), TF = TOKENS.typeFamily;
      var famCss = TF && TF.var ? 'var(' + TF.var + ')' : famT ? bkCss(famT) : '';
      var famName = famCss ? String(bkRead('fontFamily', famCss)).split(',')[0].replace(/["']/g, '').trim() : '';
      var weights = BK_ALL.filter(function (t) { return /weight/i.test(bkLeaf(t.figma)) && /^(base|typography|font)/i.test(t.figma); }).slice(0, 3);
      var colls = {}; BK_ALL.forEach(function (t) { colls[t.collection || ''] = 1; });
      // 1. The hero: the brand's name, its type, its two hues and its third colour (the app's background, as Figma names it).
      var third = bkCols.find(function (t) { return t !== hero && t !== second && /app-?background/i.test(t.figma); }) || bkCols.find(function (t) { return t !== hero && t !== second && /tertiary/i.test(t.figma); }) ||
        prim.slice().sort(function (a, b) { return (bkLum(bkHex(a)) || 0) - (bkLum(bkHex(b)) || 0); })[0];
      if (hero) {
        var tile = function (t) { return '<div class="sg-bk-tile sg-bk-tile--small" ' + paint(t) + '><span>' + esc(t.figma) + '</span><b>' + esc(bkHex(t).toUpperCase()) + '</b></div>'; };
        html += '<div class="sg-bk-hero"><div class="sg-bk-tile sg-bk-tile--hero" ' + paint(hero) + '><span class="sg-bk-hero-ghost" aria-hidden="true"' + (famCss ? ' style="font-family:' + esc(famCss) + '"' : '') + '>Aa</span><div class="sg-bk-tile-head"><b class="sg-bk-brand">' + esc(bkBrand()) + '</b><span>' +
          (DATA.version ? 'v' + esc(String(DATA.version).replace(/^v/, '')) + '  ·  ' : '') + plural(Object.keys(colls).length, 'collection', 'collections') + '  ·  ' + plural(BK_ALL.length, 'token', 'tokens') + '</span></div>' +
          '<div><div class="sg-bk-big"' + (famCss ? ' style="font-family:' + esc(famCss) + '"' : '') + '>Aa</div><div class="sg-bk-tile-sub">' + esc(famName) +
          weights.map(function (w) { return '<span class="sg-bk-weight" style="' + (famCss ? 'font-family:' + esc(famCss) + ';' : '') + 'font-weight:' + esc(bkCss(w)) + '">' + esc(bkLeaf(w.figma).replace(/weight$/i, '') || 'weight') + '</span>'; }).join('') + '</div></div>' +
          '<div class="sg-bk-tile-foot"><span>' + esc(hero.figma) + '</span><b>' + esc(bkHex(hero).toUpperCase()) + '</b></div></div>' +
          '<div class="sg-bk-side">' + (second ? tile(second) : '') + (third ? tile(third) : '') + '</div></div>';
      }
      // 2. Colour: the primitive ramps in Figma's order, the greyest one as a wall; the colours that stand alone as cards.
      var ramps = [], byKey = {};
      prim.forEach(function (t) { var k = t.figma.replace(/[-_\/ ]?\d+$/, ''); if (!byKey[k]) { byKey[k] = []; ramps.push(k); } byKey[k].push(t); });
      var strips = ramps.filter(function (k) { return byKey[k].length >= 3; }), alone = [];
      ramps.forEach(function (k) { if (byKey[k].length < 3) alone = alone.concat(byKey[k]); });
      var greyOf = function (k) { var l = byKey[k]; return l.reduce(function (s, t) { return s + bkChroma(bkHex(t)); }, 0) / l.length; };
      var wall = strips.slice().sort(function (a, b) { return greyOf(a) - greyOf(b) || byKey[b].length - byKey[a].length; })[0];
      if (wall) {
        var wl = byKey[wall];
        html += '<div class="sg-bk-wall">' + wl.map(function (t) { return '<span ' + paint(t) + ' title="' + esc(t.figma + '  ' + bkHex(t)) + '"><i>' + esc(bkLeaf(t.figma)) + '<b>' + esc(bkHex(t).toUpperCase()) + '</b></i></span>'; }).join('') + '</div>';
      }
      html += '%%BK-SW%%';   /* the colours that stand alone go here, under the neutral ramp (built just below) */
      strips.filter(function (k) { return k !== wall; }).forEach(function (k) {
        html += '<div class="sg-bk-ramp-row"><div class="sg-bk-ramp-name">' + esc(bkLeaf(k)) + '</div><div class="sg-bk-ramp">' + byKey[k].map(function (t) { return '<span ' + paint(t) + ' title="' + esc(t.figma + '  ' + bkHex(t)) + '"></span>'; }).join('') + '</div></div>';
      });
      alone = alone.filter(function (t) { return used[t.figma] && t !== hero && t !== second && t !== third; });
      html += '%%BK-RUN%%';   // the running values go here, above the colour cards (built further down, from the motion and shapes)   // a colour other tokens point at, never the hero's own   // a colour other tokens point at, or a hue: never a one-off
      // Each colour that stands alone, shown as the semantic token that uses it (the one with the shortest name, so the
      // role itself), under its full name, the primitive it points at beneath.
      var semOf = function (p) { return bkCols.filter(function (t) { return (t.aliases || []).indexOf(p.figma) >= 0; }).sort(function (a, b) { return a.figma.split('/').length - b.figma.split('/').length; })[0]; };
      var SWATCHES = '';   // placed under the neutral ramp
      // The system's status colours first (positive, negative, warning, info…), whatever they point at or not: one each,
      // its shortest name; else the colours that stand alone.
      var STATUS = /(^|\/)(positive|success|accept|negative|error|danger|warning|alert|caution|pending|info|information|notice)(\/|$)/i, stSeen = {};
      var ROLE = { positive: 'positive', success: 'positive', accept: 'positive', negative: 'negative', error: 'negative', danger: 'negative', warning: 'warning', alert: 'warning', caution: 'warning', pending: 'pending', info: 'info', information: 'info', notice: 'info' };
      var ROLES = ['positive', 'negative', 'warning', 'pending', 'info'];
      var stCols = bkCols.filter(function (t) { return STATUS.test(t.figma) && bkHex(t); }).sort(function (a, b) { return a.figma.split('/').length - b.figma.split('/').length || a.figma.length - b.figma.length; })
        .filter(function (t) { var k = ROLE[(t.figma.match(STATUS) || [])[2].toLowerCase()]; if (stSeen[k]) return false; stSeen[k] = t; return true; })
        .sort(function (a, b) { return ROLES.indexOf(ROLE[(a.figma.match(STATUS) || [])[2].toLowerCase()]) - ROLES.indexOf(ROLE[(b.figma.match(STATUS) || [])[2].toLowerCase()]); });
      if (stCols.length >= 2) alone = stCols.slice(0, 5).map(function (t) { return { figma: t.figma, _self: t }; });   /* one per role, five at most */
      if (alone.length) SWATCHES = '<div class="sg-bk-swatches">' + alone.slice(0, 12).map(function (p) {
        var t = p._self || semOf(p) || p;
        return '<div class="sg-bk-swatch" title="' + esc(t.figma) + '"><i ' + paint(t) + '></i><span><b>' + esc(t.figma) + '</b>' + esc(bkHex(t).toUpperCase()) + '</span></div>';
      }).join('') + '</div>';
      html = html.replace('%%BK-SW%%', SWATCHES);
      // 3. Semantic pairs: a background and the text Figma names for it, its words on it, the contrast between them.
      var GEN = /^(background|surface|fill|bg|text|label|content|foreground|fg|color|colour|default)$/i;
      var bgs = sem.filter(function (t) { return /background|surface|fill|(^|\/)bg(\/|$)/i.test(t.figma); }), txts = sem.filter(function (t) { return /(^|\/)(text|label|content|foreground|fg)(\/|$)/i.test(t.figma); });
      var role = function (t) { return t.figma.split('/').filter(function (p) { return !GEN.test(p); }); };
      var pairs = [], seenP = {};
      bgs.forEach(function (b) {
        var r = role(b); if (!r.length || pairs.length >= 10) return;
        var tx = txts.find(function (t) { var q = role(t); return q.length && r.every(function (p) { return q.indexOf(p) >= 0; }) && q.length <= r.length + 1; });
        if (!tx) return; var bv = bkHex(b), tv = bkHex(tx); if (seenP[bv + tv] || !bkRgb(bv) || !bkRgb(tv)) return; seenP[bv + tv] = 1;
        pairs.push({ b: b, t: tx, r: bkRatio(bv, tv) });
      });
      // The spacing steps the bento draws, each value once, each drawn by its token.
      var GAPS = [], hadG = {};
      BK_ALL.filter(function (t) { return t.type === 'spacing'; }).forEach(function (t) { var n = bkPx(t); if (n && !hadG[n]) { hadG[n] = 1; GAPS.push({ t: t, n: n }); } });
      GAPS.sort(function (a, b) { return a.n - b.n; }); GAPS = GAPS.slice(0, 8);
      // The icons the bento samples, at sizes that vary.
      var icons = (DATA.icons || []).filter(function (id) { return document.getElementById(id); });
      if (icons.length) {
        // An icon drawn in the colour of the words around it: its own fills and strokes made the current colour, so an
        // icon and its label are one token.
        var use = function (id, z) {
          var sym = document.getElementById(id), body = String(sym.innerHTML).replace(/(fill|stroke)="(?!none)[^"]*"/gi, '$1="currentColor"').replace(/(fill|stroke):\s*(?!none)[^;"]+/gi, '$1:currentColor');
          return '<svg class="sg-bk-icon" style="width:' + z + 'px;height:' + z + 'px" viewBox="' + esc(sym.getAttribute('viewBox') || '0 0 24 24') + '" aria-hidden="true">' + body + '</svg>';
        };
      }
      // How the system moves: the samples the bento sets moving, each at its own duration and easing.
      // Only the system's own motion tokens (its Figma variables, or the custom properties its code declares), never a
      // value a component writes by hand: each easing with the duration named as it is (modal-easing-out with
      // modal-duration-out), and every other duration with the system's first easing.
      var MOV = [], MOT = DATA.motion || {};
      var mvMs = function (v) { v = String(v).trim(); var n = parseFloat(v); return /ms$/i.test(v) ? n : /s$/i.test(v) ? n * 1000 : n; };
      var mvStem = function (n) { return String(n).replace(/^--/, '').replace(/duration|easing|ease|timing|curve/ig, '').replace(/[^a-z]/ig, '').toLowerCase(); };
      var DTK = (MOT.durations || []).map(function (t) { return { name: t.figma || t.var, ms: Math.round(mvMs(t.value)) }; }).filter(function (x) { return x.ms > 0; });
      var ETK = (MOT.easings || []).map(function (t) { return { name: t.figma || t.var, ease: String(t.value).trim() }; }).filter(function (x) { return x.ease; });
      ETK.forEach(function (e) { var d = DTK.filter(function (x) { return mvStem(x.name) === mvStem(e.name); })[0] || DTK[Math.floor(DTK.length / 2)]; if (d && MOV.length < 6) MOV.push({ name: String(e.name).replace(/^--/, ''), ms: d.ms, ease: e.ease, kind: /out|exit|close|hide/i.test(e.name) ? 'fade' : 'slide' }); });
      DTK.forEach(function (d) { if (MOV.length < 6 && !MOV.some(function (m) { return m.ms === d.ms; })) MOV.push({ name: String(d.name).replace(/^--/, ''), ms: d.ms, ease: ETK.length ? ETK[0].ease : 'ease', kind: 'slide' }); });
      BK_ALL.filter(function (t) { return /duration/i.test(t.figma) && parseFloat(bkFig(t)) > 0; }).forEach(function (t) {
        var n = parseFloat(bkFig(t)), ms = Math.round(n < 10 ? n * 1000 : n); if (MOV.length >= 8) return;
        MOV.push({ name: t.figma.split('/').slice(0, -1).join(' · '), ms: ms, ease: 'ease-in-out', kind: 'slide' });
      });
      // 3. The rest as one bento: type set large, motion, shapes, icons and pairs mixed, each tile in the
      // brand's own hues, every value its token. Its words read on its colour in any mode (the secondary hue or black
      // or white); its type is the brand's family, set for effect rather than at the scale's sizes.
      var h1x = hero ? bkHex(hero) : ink, h2x = second ? bkHex(second) : paper;
      // A colour that reads on a background: the one wanted when it does (3:1 for large type, 4.5:1 for small), else
      // the theme's darkest or lightest.
      var readOn = function (bg, want, wantCss, min) { if (want && (bkRatio(bg, want) || 0) >= (min || 4.5)) return wantCss; return inkOrPaper(bg); };
      var HUE1 = hero ? bkCss(hero) : ink, HUE2 = second ? bkCss(second) : paper;
      var markOn = function (bg) { return (bkRatio(bg, h2x) || 0) >= 3 ? HUE2 : (bkRatio(bg, h1x) || 0) >= 3 ? HUE1 : readOn(bg); };
      var bg2x = bkCssHex('var(--bk-card)');
      var tileCss = function (bg, bgCss, fg) { return 'style="--t-bg:' + esc(bgCss) + ';--t-fg:' + esc(fg) + '"'; };
      var on1 = readOn(h1x, h2x, HUE2, 3), on2 = readOn(h2x, h1x, HUE1), onP = readOn(paper, h1x, HUE1, 3);
      var onIsmall = readOn(ink, paper, PAPER), onPsmall = readOn(paper, ink, INK);
      // The light tiles' ground: the theme's lightest in light, its darkest in dark, so none glares on a dark page; with
      // the hue that reads on it (onG) for a large word, a mark or a line.
      var darkPage = document.documentElement.getAttribute('data-sg-scheme') === 'dark';
      // Every card that is not a colour sample stands on one ground (the page's, a step up), so none glares or sinks.
      var GROUND = 'var(--bk-card)', onG = readOn(bg2x, h1x, HUE1, 3), groundTile = tileCss(bg2x, GROUND, 'var(--sg-muted)');
      var fam = famCss ? 'font-family:' + esc(famCss) + ', system-ui, sans-serif;' : '',   /* a computer without the family still draws a sans */ strong = weights.length ? 'font-weight:' + esc(bkCss(weights[weights.length - 1])) + ';' : '';
      var T = [];   // [classes, attributes, inner]
      var add = function (cls, attrs, inner) { T.push('<div class="sg-bk-t ' + cls + '" ' + attrs + '>' + inner + '</div>'); };
      var onC1big = readOn(h1x, h2x, HUE2, 3);
      // The ticker, right under the colours, across the whole width: the brand's values, each with its colour.
      var RUN = '', tick = [], hadN = {};
      bkCols.forEach(function (t) { var n = bkName(t.figma); if (!hadN[n] && tick.length < 14) { hadN[n] = 1; tick.push(t); } });
      if (tick.length) {
        var vals = [];
        tick.slice(0, 6).forEach(function (t) { vals.push('<span class="sg-bk-tick-pill"><i class="sg-bk-tick-dot" style="background:' + esc(bkCss(t)) + '"></i>' + esc(bkHex(t).slice(0, 7).toUpperCase()) + '</span>'); });
        MOV.slice(0, 3).forEach(function (m) { vals.splice(vals.length - 2, 0, '<span class="sg-bk-tick-pill">' + m.ms + 'ms ' + esc(m.ease) + '</span>'); });
        if (radPos.length) vals.splice(2, 0, '<span class="sg-bk-tick-pill">' + esc(bkName(radPos[radPos.length - 1].t.figma)) + ' ' + radPos[radPos.length - 1].n + 'px</span>');
        if (GAPS.length) vals.splice(4, 0, '<span class="sg-bk-tick-pill">spacing ' + GAPS[0].n + ' → ' + GAPS[GAPS.length - 1].n + '</span>');
        if (hero && second) vals.splice(1, 0, '<span class="sg-bk-tick-pill">' + (bkRatio(h1x, h2x) || 0).toFixed(1) + ':1</span>');
        RUN = '<div class="sg-bk-ticker"><div class="sg-bk-tick-row sg-bk-tick-small" style="' + fam + '">' + new Array(5).join(vals.join('')) + '</div></div>';   // its values on the page, four times over: half of it is wider than any page, so it runs without a gap
      }
      // Geometry and motion: the radii drawn with their construction lines, the depth of a shadow with its offsets, the
      // card's radius, the easings as curves with their handles (a dot running each, in its own time) and the durations
      // as bars that fill in theirs. Every number is the brand's token.
      // Two accents that read on these tiles' ground (3:1 at least), in any brand and mode: the hues first, then the
      // ramp's ends.
      var bg2 = groundTile, ac1 = markOn(bg2x);
      var ac2 = [[HUE2, h2x], [PAPER, paper], [INK, ink], [HUE1, h1x]].filter(function (c) { return c[0] !== ac1 && (bkRatio(bg2x, c[1]) || 0) >= 3; }).map(function (c) { return c[0]; })[0] || readOn(bg2x);
      // Radius and border, read as one: three cards in one language. A line is solid where the component has a border
      // (the theme's width) and dashed where it has none; only the component in focus is in the hue, the rest neutral.
      // One loop goes through the components people meet most: in the first card the outline glides to its height in
      // Figma and its radius (one scale), in the second its corner grows from square to its radius, in the third the hue
      // runs round its tiles' edges. Each card's caption names it. A shape, a corner or a tile picks a component and holds it.
      var crMi = function (t) { var m = t.modes || [], d = m.findIndex(function (x) { return /dark|night/i.test(x); }); if (d < 0) return m.length - 1; var l = m.findIndex(function (x) { return !/dark|night/i.test(x); }); return darkPage ? d : Math.max(0, l); };
      var crBy = {}; BK_ALL.forEach(function (t) { crBy[t.figma.toLowerCase()] = t; });
      var crEnd = function (t) { var cur = t, name = t.figma; for (var g = 0; cur && g < 8; g++) { var a = (cur.aliases || [])[crMi(cur)]; if (!a) break; name = a; cur = crBy[String(a).toLowerCase()]; } return name; };
      var crRad = BK_ALL.filter(function (t) { return /\/radius\//i.test(t.figma); });
      var crOf = function (re) {
        var own = crRad.filter(function (t) { return re.test(t.figma.split('/')[1] || ''); });
        own.sort(function (a, b) { var r = function (t) { return /(all|top-?left|left-?right)$/i.test(t.figma) ? 0 : 1; }; return r(a) - r(b) || a.figma.length - b.figma.length; });
        return own[0] || null;
      };
      var RH = DATA.figmaHeights || {}, SH = DATA.figmaShapes || {}, rlW = lineT ? (bkPx(lineT) || 1) : 1, rlDisp = {}, rlSeq = [];
      BK_ALL.forEach(function (t) { var m = t.figma.match(/^[^/]+\/([^/]+)\/border\/(?:default\/)?display$/i); if (m && !(m[1] in rlDisp)) { rlDisp[m[1]] = /^true$/i.test(bkNow(t)); rlSeq.push(m[1]); } });
      // A system with no border switch of its own: each component's border as Figma draws its default variant.
      if (!rlSeq.length) Object.keys(SH).forEach(function (n) { if (SH[n].stroke != null) { rlDisp[n] = SH[n].stroke; rlSeq.push(n); } });
      var rlExact = function (n) { return new RegExp('^' + String(n).replace(/[^\w-]/g, '') + '$', 'i'); };
      // A component's radius: its own radius token where the system names one per component, else the radius variable
      // Figma binds on its frame (or the radius it draws), whatever the system calls it.
      var rlVarPx = function (v) { if (!v) return null; var k = String(v).toLowerCase(), t = crBy[k] || BK_ALL.find(function (x) { return x.figma.toLowerCase().replace(/\/(all|value)$/, '') === k; }); return t ? bkPx(t) : null; };
      var rlOf = function (n) { var t = crOf(rlExact(n)), sh = SH[n] || {}, vp = rlVarPx(sh.rVar), r = t ? (bkPx(t) || 0) : vp != null ? vp : sh.rPx != null ? sh.rPx : 0;
        return { name: n, r: r, token: t ? String(crEnd(t)).replace(/^(advanced|semantic|base)\//, '') : (sh.rVar || ''), h: RH[n] || sh.h || 0, on: n in rlDisp ? rlDisp[n] : false }; };
      // How many components share each radius, and how many have their border on, for the captions.
      var rlNames = COMPONENTS.map(function (c) { return c.name; }); Object.keys(SH).forEach(function (n) { if (rlNames.indexOf(n) < 0) rlNames.push(n); });
      var rlCount = {}; rlNames.forEach(function (n) { var r = rlOf(n).r; rlCount[r] = (rlCount[r] || 0) + 1; });
      var rlOnN = rlSeq.filter(function (n) { return rlDisp[n]; }).length, rlAll = rlSeq.length;
      // The examples: the system's own components that have a radius, one for each radius and size they come in (a small
      // pill, a card, a modal…), from the smallest up, eight at most; square ones only when too few are round.
      var rlBucket = function (h) { return !h ? 0 : h <= 32 ? 1 : h <= 64 ? 2 : h <= 160 ? 3 : 4; };
      var rlGroups = {}, rlAllOf = rlNames.map(rlOf);
      rlAllOf.filter(function (c) { return c.r > 0; }).forEach(function (c) { var k = c.r + ':' + rlBucket(c.h), had = rlGroups[k], score = function (x) { return (/primary|default|base/i.test(x.name) ? 0 : 1) * 100 + x.name.length; }; if (!had || score(c) < score(had)) rlGroups[k] = c; });
      var crList = Object.keys(rlGroups).map(function (k) { return rlGroups[k]; });
      if (crList.length < 3) rlAllOf.filter(function (c) { return !c.r && c.h; }).forEach(function (c) { if (crList.length < 4 && !crList.some(function (x) { return rlBucket(x.h) === rlBucket(c.h) && x.r === c.r; })) crList.push(c); });
      // First the surfaces people meet most, whatever the system calls them (a panel, a modal, a toast, a card, a button, a
      // floating button), each its main one (primary, default, base, or the shortest name), round ones first.
      var rlMain = function (x) { return (x.r > 0 ? 0 : 1000) + (/primary|default|base/i.test(x.name) ? 0 : 100) + x.name.length; };
      var rlFirst = [/panel/i, /modal|dialog/i, /toast|snack/i, /card/i, /^(?!.*(float|fab)).*button/i, /float|fab/i].map(function (re) { return rlAllOf.filter(function (c) { return re.test(c.name) && c.h; }).sort(function (x, y) { return rlMain(x) - rlMain(y); })[0]; }).filter(function (c, i, all) { return c && all.indexOf(c) === i; });
      crList = crList.filter(function (c) { return rlFirst.indexOf(c) < 0 && !rlFirst.some(function (f) { return f.name === c.name; }); });
      // Then the rest, eight in all, spread across the sizes: one from each size in turn (small, medium, large…).
      var rlBy = {}; crList.forEach(function (c) { var k = rlBucket(c.h); (rlBy[k] = rlBy[k] || []).push(c); });
      Object.keys(rlBy).forEach(function (k) { rlBy[k].sort(function (a, b) { return b.r - a.r || (/primary|default|base/i.test(a.name) ? -1 : 1); }); });
      var rlSpread = rlFirst.slice(0, 8), rlKeys = Object.keys(rlBy).sort();
      for (var rr = 0; rlSpread.length < 8 && rlKeys.some(function (k) { return rlBy[k][rr]; }); rr++) rlKeys.forEach(function (k) { if (rlBy[k][rr] && rlSpread.length < 8) rlSpread.push(rlBy[k][rr]); });
      crList = rlSpread.sort(function (a, b) { return (a.h || 999) - (b.h || 999) || a.r - b.r; });
      var rlGhost = crList;
      // The texture: sixteen tiles, the components in the system's order, the ones in the loop among them, each shape
      // (its roundness, its border on or off) a few times at most.
      var rlRound = function (c) { return c.h ? Math.min(1, c.r / (c.h / 2)) : Math.min(1, c.r / 20); };
      var rlKey = function (c) { return Math.round(rlRound(c) * 5) + (c.on ? 'on' : 'off'); };
      var rlPick = crList.filter(function (c) { return c.name in rlDisp; }).map(function (c) { return c.name; }), rlKinds = {};
      rlSeq.forEach(function (n) { rlKinds[rlKey(rlOf(n))] = 1; });
      var rlCap = Math.max(2, Math.ceil(16 / Math.max(1, Object.keys(rlKinds).length))), rlSeen = {};
      rlPick.forEach(function (n) { var k = rlKey(rlOf(n)); rlSeen[k] = (rlSeen[k] || 0) + 1; });
      rlSeq.forEach(function (n) { if (rlPick.length >= 16 || rlPick.indexOf(n) >= 0) return; var k = rlKey(rlOf(n)); if ((rlSeen[k] || 0) >= rlCap) return; rlSeen[k] = (rlSeen[k] || 0) + 1; rlPick.push(n); });
      rlPick.sort(function (a, b) { return rlSeq.indexOf(a) - rlSeq.indexOf(b); });
      if (crList.length >= 3) {
        // Each component in the first card at its height in Figma and its radius, one scale; the widths are set by its
        // kind (Figma fixes none): a bar spans the drawing, a box is square, the rest grow with their height.
        var W = 360, H = 330, rlTall = Math.max.apply(null, rlGhost.map(function (c) { return c.h; }).filter(function (h) { return h <= 260; }).concat([1])), DS = Math.min(1.1, (H - 80) / rlTall);   /* one very tall panel does not shrink the rest */
        var rlBox = function (c) { var h = Math.min(Math.max(c.h || 40, 16) * DS, H - 30), w = /header|bar|nav|toast|banner/i.test(c.name) || h >= 150 ? W - 40 : /checkbox|radio|switch|toggle|avatar|icon/i.test(c.name) ? h : Math.min(W - 80, 120 + h * 2);
          return [Math.round((W - w) / 2), Math.round((H - h) / 2), Math.round(w), Math.round(h), Math.round(Math.min(c.r * DS, h / 2) * 10) / 10]; };
        var rlC = {};
        crList.concat(rlPick.map(rlOf)).concat(rlGhost).forEach(function (c) {
          if (rlC[c.name]) return;
          var same = rlCount[c.r] || 1;
          rlC[c.name] = { b: rlBox(c), r: c.r, on: c.on, cap: [
            [c.name + ' radius', c.r + 'px', c.r ? c.token : 'no radius, square'],
            [c.name + ' corner', String(same), (same === 1 ? 'component' : 'components') + ' with a ' + (c.r ? c.r + 'px' : 'square') + ' corner'],
            [c.name + ' border', c.on ? rlW + 'px' : 'none', c.on ? 'border on, as on ' + rlOnN + ' of ' + rlAll + ' components' + (lineT ? '  ·  ' + lineT.figma : '') : 'no border, as on ' + (rlAll - rlOnN) + ' of ' + rlAll + ' components']] };
        });
        var rlLoop = crList.map(function (c) { return c.name; }), c0 = rlC[rlLoop[0]], q0 = c0.b, cx0 = q0[0] + q0[4], cy0 = q0[1] + q0[4];
        var rlCapH = function (i) { var t = c0.cap[i]; return '<div class="sg-bk-rl-cap" data-i="' + i + '" style="--bk-cr:' + esc(ac1) + '"><span class="sg-bk-rl-t" style="' + fam + strong + '">' + esc(t[0]) + '</span><b style="' + fam + strong + '">' + esc(t[1]) + '</b><span class="sg-bk-rl-k">' + esc(t[2]) + '</span></div>'; };
        var rlLine = function (c, more) { return 'sg-bk-rl-line' + (c.on ? '' : ' is-off') + (more ? ' ' + more : ''); };
        var draw = '<div class="sg-bk-rl-stage"><svg class="sg-bk-rl-draw sg-bk-geo" viewBox="0 0 ' + W + ' ' + H + '" data-c="' + esc(JSON.stringify(rlC)) + '" data-loop="' + esc(JSON.stringify(rlLoop)) + '" data-ease="' + esc((EZ && EZ.length ? EZ[0].b : [0.42, 0, 0.58, 1]).join(',')) + '" data-ms="' + ((DU && DU.length ? DU.map(function (d) { return d.ms; }).filter(function (m) { return m <= 800; }).slice(-1)[0] : 0) || 500) + '" role="img" aria-label="' + esc('The radius of ' + rlLoop.join(', ')) + '">' +
          // every component in the loop drawn faint, the largest behind, each one an outline to click
          crList.slice().sort(function (a, b) { var p = rlC[a.name].b, r = rlC[b.name].b; return r[2] * r[3] - p[2] * p[3]; }).map(function (c) { var q = rlC[c.name].b, g = 'x="' + q[0] + '" y="' + q[1] + '" width="' + q[2] + '" height="' + q[3] + '" rx="' + q[4] + '"';
            return '<g class="sg-bk-rl sg-bk-rl-gh" data-k="' + esc(c.name) + '"><title>' + esc(c.name) + '</title><rect class="' + rlLine(c, 'sg-bk-rl-ghost') + '" ' + g + '/><rect class="sg-bk-rl-hit" ' + g + '/></g>'; }).join('') +
          '<g class="sg-bk-guide"><line class="sg-rv" x1="' + cx0 + '" y1="10" x2="' + cx0 + '" y2="' + (H - 10) + '"/><line class="sg-rh" x1="10" y1="' + cy0 + '" x2="' + (W - 10) + '" y2="' + cy0 + '"/><circle class="sg-rc" cx="' + cx0 + '" cy="' + cy0 + '" r="' + Math.max(0.01, q0[4]) + '"/></g>' +
          '<rect class="' + rlLine(rlC[rlLoop[0]], 'sg-bk-rl-lit') + '" x="' + q0[0] + '" y="' + q0[1] + '" width="' + q0[2] + '" height="' + q0[3] + '" rx="' + q0[4] + '"/>' +
          '<line class="sg-rl sg-bk-geo-ink" x1="' + cx0 + '" y1="' + cy0 + '" x2="' + (cx0 - q0[4] * 0.7071) + '" y2="' + (cy0 - q0[4] * 0.7071) + '"/><circle class="sg-rd sg-bk-geo-dot" cx="' + cx0 + '" cy="' + cy0 + '" r="3"/>' +
          '<text class="sg-rt sg-bk-geo-title" x="' + (cx0 + 10) + '" y="' + (cy0 + 20) + '">r = ' + c0.r + '</text></svg></div>';
        add('w2 h3 sg-bk-bare-pad sg-bk-rl-card', groundTile + ' data-rl="0"', draw.replace('<svg ', '<svg style="--bk-cr:' + esc(ac1) + ';--rl-w:' + rlW + 'px" ') + rlCapH(0));
        var crS = 3, crArc = function (r) { var R = Math.min(r * crS, 86); return 'M8 96 V' + (8 + R) + (R ? ' A' + R + ' ' + R + ' 0 0 1 ' + (8 + R) + ' 8' : '') + ' H96'; };
        add('w2 h3 sg-bk-bare-pad sg-bk-rl-card', groundTile + ' data-rl="1"', '<div class="sg-bk-rl-stage"><div class="sg-bk-corners" style="--bk-cr:' + esc(ac1) + ';--rl-w:' + rlW + 'px">' + crList.map(function (c, i) {
          return '<figure class="sg-bk-cr sg-bk-rl" data-k="' + esc(c.name) + '" data-r="' + c.r + '" title="' + esc(c.name) + '"><svg class="sg-bk-cr-svg" viewBox="0 0 104 104" aria-hidden="true"><path class="sg-bk-cr-g" d="M8 96 V8 H96"/><g class="sg-bk-cr-con"></g><path class="' + rlLine(c, 'sg-bk-cr-a') + '" pathLength="100" style="animation-delay:' + (i * 0.15).toFixed(2) + 's" d="' + crArc(c.r) + '"/></svg>' +
            '<figcaption class="sg-bk-cr-cap"><b style="' + fam + strong + '">' + esc(c.name).replace(/([a-z])([A-Z])/g, '$1<wbr>$2') + '</b><span>' + c.r + 'px</span></figcaption></figure>';
        }).join('') + '</div></div>' + rlCapH(1));
        add('w2 h3 sg-bk-bare-pad sg-bk-rl-card', groundTile + ' data-rl="2"', '<div class="sg-bk-rl-stage"><div class="sg-bk-rl-tex" role="img" aria-label="' + esc(rlOnN + ' of ' + rlAll + ' components bordered, ' + rlW + 'px') + '" style="--bk-cr:' + esc(ac1) + ';--rl-w:' + rlW + 'px">' + rlPick.map(function (n, i) {
          var c = rlOf(n), rx = Math.round(rlRound(c) * 49), g = 'x="1" y="1" width="98" height="98" rx="' + rx + '"';
          return '<svg class="sg-bk-tl sg-bk-rl" data-k="' + esc(n) + '" viewBox="0 0 100 100"><title>' + esc(n) + '</title><mask id="sg-bk-tm' + i + '" class="sg-bk-tl-mask" maskUnits="userSpaceOnUse" x="-10" y="-10" width="120" height="120"><rect class="sg-bk-tl-m" pathLength="100" ' + g + '/></mask><rect class="' + rlLine(c, 'sg-bk-tl-base') + '" ' + g + '/><rect class="' + rlLine(c, 'sg-bk-tl-hl') + '" mask="url(#sg-bk-tm' + i + ')" ' + g + '/></svg>';
        }).join('') + '</div></div>' + rlCapH(2));
      }

      // The card's radius, large, with its corner drawn.
      // The radius card (its value large) is kept off the page for now: the radius drawing says it.
      if (false && radCard) add('w3 h1 sg-bk-radcard', tileCss(h1x, HUE1, onC1big), '<b style="' + fam + strong + '">' + radCard.n + '</b><span>' + esc(bkShort(radCard.t.figma)) + '<br>corner ' + radCard.n + 'px</span><svg viewBox="0 0 60 60" aria-hidden="true"><path d="M4 56 V22 A18 18 0 0 1 22 4 H56" class="is-strong" style="fill:none;stroke:currentColor"/><path d="M4 22 H22 V4" style="fill:none;stroke:currentColor;stroke-dasharray:2 3"/></svg>');
      // Depth: the system's strongest shadow, its offsets drawn as dashed ghosts, its values beside it.
      var SH = null, SHS = [];
      BK_ALL.forEach(function (t) {
        if (!/(^|\/)blur$/i.test(t.figma)) return; var base = t.figma.replace(/\/blur$/i, ''), get = function (k) { return BK_ALL.find(function (x) { return x.figma.toLowerCase() === (base + '/' + k).toLowerCase(); }); };
        var x = get('x'), y = get('y'), b = bkPx(t), on = get('display'); if (!x || !y || !b) return;
        var live = on ? /^true$/i.test(bkNow(on)) : shadowsOn;   // its own switch, else the brand's switch for all
        SHS.push({ base: base, x: x, y: y, blur: t, b: b, spread: get('spread'), color: get('color'), on: on, live: live });
        // The strongest shadow that is on; with none on, the strongest there is, drawn flat.
        if (!SH || (live && !SH.live) || (live === SH.live && b > SH.b)) SH = { base: base, x: x, y: y, blur: t, b: b, spread: get('spread'), color: get('color'), on: on, live: live };
      });
      // The kit's cards: the brand's own card shadow when one is on (a card's, the shortest-named first), else none.
      // The general card first (card, cardPrimary, cardDefault), then any other card.
      var cardRank = function (g) { var n = g.base.split('/').slice(-2, -1)[0] || ''; return /^card$/i.test(n) ? 0 : /^card-?general$/i.test(n) ? 1 : /^card-?(primary|default|base)$/i.test(n) ? 2 : /card/i.test(n) ? 3 : 9; };
      var byCard = function (a, b) { return cardRank(a) - cardRank(b) || a.base.length - b.base.length; };
      // The general card decides: its shadow when its own switch is on, else none (another card's shadow never stands in).
      var genCard = SHS.filter(function (g) { return cardRank(g) < 3; }).sort(byCard)[0], cardSH = genCard && genCard.live ? genCard : null;
      if (cardSH) bkOut.style.setProperty('--bk-shadow', bkCss(cardSH.x, 'px') + ' ' + bkCss(cardSH.y, 'px') + ' ' + bkCss(cardSH.blur, 'px') + (cardSH.spread ? ' ' + bkCss(cardSH.spread, 'px') : '') + ' ' + (cardSH.color ? bkCss(cardSH.color) : 'rgba(0, 0, 0, .2)'));
      var anyCard = SHS.filter(function (g) { return cardRank(g) < 9; }).sort(byCard)[0];
      var general = SHS.filter(function (g) { return cardRank(g) < 3; }).sort(byCard)[0];
      if (general) cardSH = general.live ? general : null;   // the general card decides: its shadow on or off
      SH = general || cardSH || anyCard || SH;   // the card is the example: its shadow, on or off
      if (SH) {
        var sx = bkPx(SH.x) || 0, sy = bkPx(SH.y) || 0, sc = SH.color ? bkCss(SH.color) : 'rgba(0, 0, 0, .2)';
        var shadow = bkCss(SH.x, 'px') + ' ' + bkCss(SH.y, 'px') + ' ' + bkCss(SH.blur, 'px') + (SH.spread ? ' ' + bkCss(SH.spread, 'px') : '') + ' ' + sc;
        // Shadows off: the card all the same, flat, and the switch that turns them off named.
        var off = !SH.live, offBy = SH.on || shOn;
        // The depth of the card is shown by the exploded view below (its tile here is gone).
      }
      // The shapes (radii, border, depth) in their own rows, a little taller than the rest.
      var GEO = T.splice(0, T.length);
      // The easings as curves: their handles, a dot running each in its own duration, its numbers beside it.
      // One chart for each way the system moves (its easing and duration), up to four, sharing their tile's width; the
      // duration scale beside them.
      var CURVES = '', EZ = [], seenE = {}, seenEM = {}; MOV.forEach(function (m) { var b = bezierOf(m.ease), k = m.ease + m.ms; if (b && !seenEM[k] && EZ.length < 4) { seenEM[k] = 1; seenE[m.ease] = 1; EZ.push({ m: m, b: b }); } });
      if (EZ.length) {
        var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        // A chart that fills its share of the tile: its lines scale (the stroke stays the same), its dots and words stay
        // crisp, and the running dot moves across in even time and up along the easing, as the value does.
        var plot = function (e) {
          var b = e.b, dur = Math.max(e.m.ms, 160) * 2, P = 'M0 100 C' + b[0] * 100 + ' ' + (1 - b[1]) * 100 + ' ' + b[2] * 100 + ' ' + (1 - b[3]) * 100 + ' 100 0';
          return '<div class="sg-bk-curve"><div class="sg-bk-curve-plot"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
            '<line x1="0" y1="100" x2="100" y2="100" class="sg-bk-geo-axis"/><line x1="0" y1="100" x2="0" y2="0" class="sg-bk-geo-axis"/><line x1="0" y1="0" x2="100" y2="0" class="sg-bk-guide-l"/>' +
            // The curve's handles, faint and without knobs: drawn to explain the curve, nothing to drag.
            '<line x1="0" y1="100" x2="' + b[0] * 100 + '" y2="' + (1 - b[1]) * 100 + '" class="sg-bk-handle-l"/><line x1="100" y1="0" x2="' + b[2] * 100 + '" y2="' + (1 - b[3]) * 100 + '" class="sg-bk-handle-l"/>' +
            '<path d="' + P + '" class="is-strong" style="fill:none;stroke:' + esc(ac1) + '"/></svg>' +
            '<i class="sg-bk-runner" style="animation-duration:' + dur + 'ms, ' + dur + 'ms;animation-timing-function:linear, ' + esc(e.m.ease) + '"></i>' +
            '<span class="sg-bk-curve-name"><b>' + esc(e.m.name) + '</b>cubic-bezier(' + b.join(', ') + ')</span></div>' +
            '<div class="sg-bk-curve-axis"><span>0ms</span><span>' + e.m.ms + 'ms</span></div></div>';
        };
        var CURVES = '<div class="sg-bk-curves">' + EZ.map(plot).join('') + '</div>';   // placed after the duration scale, on its right
      }
      // The durations as bars filling in their own time and easing.
      var DU = [], seenD = {}; MOV.forEach(function (m) { if (!seenD[m.ms]) { seenD[m.ms] = 1; DU.push(m); } }); DU.sort(function (a, b) { return a.ms - b.ms; });
      if (DU.length) add('w2 h2', groundTile, '<b class="sg-bk-dur-title" style="' + fam + strong + '">duration scale</b><div class="sg-bk-durs">' + DU.slice(0, 5).map(function (m, i) {
        return '<span>' + m.ms + 'ms</span><i style="background:' + esc(i === DU.length - 1 ? onG : 'var(--sg-muted)') + ';animation-duration:' + Math.max(m.ms, 100) + 'ms;animation-timing-function:' + esc(m.ease) + '"></i>';
      }).join('') + '</div><span class="sg-bk-dur-note">' + esc(Object.keys(seenE).concat(DU.map(function (m) { return m.ease; })).filter(function (v, i, a) { return a.indexOf(v) === i; }).slice(0, 3).join('  ·  ')) + '</span>');
      if (CURVES) add('w4 h2', bg2, CURVES);
      // The pairs as one stripe across the width, running: each background with the text Figma names for it.
      var PAIRS = '', pn = {};
      // The system's own surfaces: each component's background with its text on it and its own radius (the toast's
      // variants first, then the buttons, then any other component that has all three), named; the semantic pairs when the
      // system has none. "Aa" in the text colour, the contrast between them, the radius drawn in the corner.
      var SURF_H = [7.4, 6, 8.2, 6.5, 7.8, 6, 6.9];   // heights in rows of 16px, alternating, so the stripe moves
      var STATE = /^(hover|press|pressed|active|focus|focused|selected|disabled|error|statelayer|appearance)$/i;
      var byComp = {};
      BK_ALL.forEach(function (t) {
        var p = t.figma.split('/'), at = p.indexOf('background'); if (at < 1 || !/colou?r$/i.test(p[p.length - 1]) || !bkIsCol(t)) return;
        var mid = p.slice(at + 1, -1); if (mid.some(function (x) { return STATE.test(x); })) return;
        var base = p.slice(0, at).join('/'), v = mid.filter(function (x) { return !/^default$/i.test(x); }).join('/');
        (byComp[base] = byComp[base] || { base: base, bgs: [] }).bgs.push({ t: t, v: v });
      });
      var findT = function (re) { return BK_ALL.find(function (x) { return re.test(x.figma); }); };
      var escRe = function (x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
      var compRank = function (n) { return /(^|\/)toast$/i.test(n) ? 0 : /button-?primary$/i.test(n) ? 1 : /button-?secondary$/i.test(n) ? 2 : /button-?(negative|danger|destructive)$/i.test(n) ? 3 : /button-?(positive|success)$/i.test(n) ? 4 : /button/i.test(n) ? 5 : /badge|tag|chip|alert|banner|snackbar/i.test(n) ? 6 : 7; };
      var SURF = [];
      Object.keys(byComp).sort(function (a, b) { return compRank(a) - compRank(b) || a.length - b.length; }).forEach(function (base) {
        var e = byComp[base], B = escRe(base);
        var rad = findT(new RegExp('^' + B + '/radius/(all|top-?left)$', 'i'));
        if (!rad) return;
        e.bgs.forEach(function (bg) {
          if (SURF.length >= 12) return;
          var V = bg.v ? escRe(bg.v) + '/' : '';
          var fg = findT(new RegExp('^' + B + '/(icon-?text|text|label|content)/' + V + '(default/)?colou?r$', 'i')) || (bg.v ? null : findT(new RegExp('^' + B + '/(icon-?text|text|label)/colou?r$', 'i')));
          if (!fg) return;
          var bh = bkHex(bg.t), fh = bkHex(fg); if (!bkRgb(bh) || !bkRgb(fh)) return;
          SURF.push({ name: base.split('/').filter(function (x) { return !/^(advanced|base|semantic)$/i.test(x); }).join('/') + (bg.v ? ' · ' + bg.v : ''), b: bg.t, t: fg, r: bkRatio(bh, fh), rad: rad, rn: bkPx(rad) });
        });
      });
      var surfaceHTML = function (o, i) {
        var rn = Math.min(o.rn || 0, 24);
        var corner = '<svg class="sg-bk-corner" viewBox="0 0 28 28" aria-hidden="true"><path d="M2 26 V' + (2 + rn) + (rn ? ' A' + rn + ' ' + rn + ' 0 0 1 ' + (2 + rn) + ' 2' : '') + ' H26"/></svg>';
        return '<span class="sg-bk-surface" style="--bk:' + esc(bkCss(o.b)) + ';--bk-on:' + esc(bkCss(o.t)) + ';height:calc(var(--sg-space-l) * ' + SURF_H[i % SURF_H.length] + ')' + (o.rad ? ';border-radius:' + esc(bkCss(o.rad, 'px')) : '') + '" title="' + esc(o.t.figma + ' on ' + o.b.figma + (o.rad ? ', ' + o.rad.figma : '')) + '">' + corner +
          '<span class="sg-bk-surface-top"><b style="' + fam + strong + '">Aa</b><span>' + (o.r ? o.r.toFixed(1) + ':1' : '') + '</span></span>' +
          '<span class="sg-bk-surface-meta">' + esc(o.b.figma) + '</span></span>';   // its background's variable only (the rest in its title)
      };
      var pchips;
      if (SURF.length) pchips = SURF.map(surfaceHTML).join('');
      else pchips = pairs.filter(function (p) { var n = bkHex(p.b) + bkHex(p.t); if (pn[n]) return false; pn[n] = 1; return true; }).map(function (p, i) {
        var r = RAD.length ? RAD[i % RAD.length] : null;
        return surfaceHTML({ name: p.b.figma, b: p.b, t: p.t, r: p.r, rad: r ? r.t : null, rn: r ? r.n : 0 }, i);
      }).join('');
      if (pchips) PAIRS = '<div class="sg-bk-stripe"><div class="sg-bk-stripe-run">' + new Array(5).join(pchips) + '</div></div>';   // four times over, endless
      // Icons and charts: one icon magnified with two lenses (its end and its corner), and the system's own charts drawn
      // from their tokens (the pie's slices, the columns' bars).
      var ICON = '';
      var mono = icons.filter(function (id) { var el = document.getElementById(id), h = el ? el.innerHTML : ''; return !/(fill|stroke)="#(?!000|fff)[0-9a-f]{3,6}"/i.test(h) && !/(fill|stroke)="(?!none|currentColor)[a-z]+"/i.test(h); });
      if (!mono.length) mono = icons;
      // An icon's own size: the one Figma gives it, else its drawing's.
      var natOf = function (id) { var F = DATA.iconFigma || {}; if (F[id] && F[id].size) return F[id].size; var vb = (document.getElementById(id).getAttribute('viewBox') || '').split(/[\s,]+/); return Number(vb[3]) || Number(vb[2]) || 24; };   // its height: an icon drawn a little wider (26 × 24) is still 24
      // The icons at the size most of them have, for the cells and chips: an illustration-sized one stays out.
      var sizeCount = {}; mono.forEach(function (id) { var z = natOf(id); sizeCount[z] = (sizeCount[z] || 0) + 1; });
      var usual = Number(Object.keys(sizeCount).sort(function (a, b) { return sizeCount[b] - sizeCount[a]; })[0]), monoStd = mono.filter(function (id) { return natOf(id) === usual; });
      if (!monoStd.length) monoStd = mono;
      var nameOf = function (id) { return String(id).replace(/^(ic|icon)[-_]/i, '').replace(/^[smlx]{1,2}-/i, '').replace(/-[smlx]{1,2}$/i, ''); };
      var IT = [], addI = function (cls, attrs, inner) { IT.push('<div class="sg-bk-t ' + cls + '" ' + attrs + '>' + inner + '</div>'); };
      if (mono.length) {
        // One icon, magnified on its grid, with two lenses: where its line ends and where it turns, each drawn again
        // large beside it, its pixel grid behind, with the stroke measured across it.
        var an = iconAnatomy(monoStd.slice(Math.floor(monoStd.length / 4)).concat(monoStd.slice(0, Math.floor(monoStd.length / 4))));
        // The icon in the system's own icon colours: the four used most (each value once), each on the brand ground it
        // reads best on (the primary, ink or paper, 3:1 at least; never the card's own ground, where the square would
        // vanish), the grounds varied.
        var swGrounds = [{ css: HUE1, hex: h1x }, { css: INK, hex: ink }, { css: PAPER, hex: paper }], swByHex = {};
        bkCols.filter(function (t) { return /icon/i.test(t.figma); }).forEach(function (t) { var swHx = bkHex(t); if (!bkRgb(swHx)) return; (swByHex[swHx] = swByHex[swHx] || { t: t, n: 0 }).n++; });
        var swUsed = {}, iconSw = [];
        Object.keys(swByHex).sort(function (a, b) { return swByHex[b].n - swByHex[a].n; }).forEach(function (swHx) {
          if (iconSw.length >= 4) return;
          var swOk = swGrounds.map(function (g, k) { return { g: g, k: k, r: bkRatio(swHx, g.hex) || 0 }; }).filter(function (o) { return o.r >= 3; })
            .sort(function (a, b) { return ((swUsed[a.k] || 0) - (swUsed[b.k] || 0)) || (b.r - a.r); })[0];
          if (!swOk) return;
          swUsed[swOk.k] = (swUsed[swOk.k] || 0) + 1; iconSw.push({ bg: swOk.g.css, fg: bkCss(swByHex[swHx].t) });
        });
        // Too few: the brand's own pairs fill it (on the primary, paper on ink, ink on paper).
        [{ bg: HUE1, fg: onC1big }, { bg: INK, fg: PAPER }, { bg: PAPER, fg: INK }, { bg: HUE1, fg: INK }].forEach(function (o) { if (iconSw.length < 4) iconSw.push(o); });
        // One is always on the primary, last: in an icon colour that reads on it (3:1), else the brand's colour for words on it.
        if (!iconSw.some(function (o) { return o.bg === HUE1; })) {
          var onHue = Object.keys(swByHex).filter(function (h) { return (bkRatio(h, h1x) || 0) >= 3; }).sort(function (a, b) { return swByHex[b].n - swByHex[a].n; })[0];
          iconSw[3] = { bg: HUE1, fg: onHue ? bkCss(swByHex[onHue].t) : onC1big };
        } else iconSw.push(iconSw.splice(iconSw.findIndex(function (o) { return o.bg === HUE1; }), 1)[0]);
        // One in the primary itself, third, linked to its token (not a component's that only shares its value in one
        // mode or brand), on the neutral ground it reads best on.
        var hueOn = [{ css: INK, hex: ink }, { css: PAPER, hex: paper }].sort(function (a, b) { return (bkRatio(h1x, b.hex) || 0) - (bkRatio(h1x, a.hex) || 0); })[0];
        iconSw = iconSw.filter(function (o) { return o.bg === HUE1 || String(bkCssHex(o.fg)).toLowerCase() !== String(h1x).toLowerCase(); });
        iconSw.splice(Math.min(2, iconSw.length - 1), 0, { bg: hueOn.css, fg: HUE1 });
        iconSw = iconSw.slice(0, 3).concat(iconSw.slice(-1));
        // The first two on the two neutrals, in every mode: the light one first, then the dark one with a light icon.
        // An icon colour of the system's on each is kept; a square missing is the neutrals' own pair.
        if (iconSw.length > 3) {
          var inkDark = (bkRatio(ink, '#ffffff') || 0) >= (bkRatio(paper, '#ffffff') || 0), LIGHT = inkDark ? PAPER : INK, DARK = inkDark ? INK : PAPER;
          if (iconSw[0].bg !== LIGHT && iconSw[1].bg === LIGHT) iconSw.splice(0, 2, iconSw[1], iconSw[0]);
          if (iconSw[0].bg !== LIGHT) iconSw[0] = { bg: LIGHT, fg: DARK };
          if (iconSw[1].bg !== DARK) iconSw[1] = { bg: DARK, fg: LIGHT };
        }
        if (an) addI('w6 h5 sg-bk-bare-pad sg-bk-lens-t', bg2, lensTile(an, iconSw));
      }
      ICON = '<div class="sg-bk-bento">' + IT.join('') + '</div>'; IT = [];   // the charts follow, at the end of the kit
      // The charts, moving: the system's own chart tokens (the pie's slices and separator, the columns' bars, column,
      // labels and lines, the bars' tracks and fills), set moving in the brand's own motion. The values are a sample that
      // changes on a loop: each change eases in over one of the brand's durations, in its easing, one part after the
      // other a short duration apart. Still with reduced motion.
      var chTok = function (re) { return BK_ALL.find(function (t) { return re.test(t.figma); }); };
      var chEz = EZ && EZ.length ? EZ[0] : null, chEase = chEz ? 'cubic-bezier(' + chEz.b.join(', ') + ')' : (MOV[0] ? MOV[0].ease : 'ease-in-out');
      var chMsList = DU && DU.length ? DU.map(function (d) { return d.ms; }) : [200, 400];
      var chMs = chMsList.filter(function (m) { return m <= 800; }).slice(-1)[0] || chMsList[0], chStep = Math.max(40, Math.min(chMsList[0], 120));
      var chMotion = '<span class="sg-bk-ch-motion">' + chMs + 'ms  ·  ' + esc(chEase) + '</span>';
      // The pie: its slices, as a ring; its separator's thickness the gap between them; the first share in the middle.
      var slices = BK_ALL.filter(function (t) { return /chart-?pie\/slice\/[^/]+\/colou?r$/i.test(t.figma); }).slice(0, 5);
      if (!slices.length) slices = [hero, second, third].filter(Boolean);
      if (slices.length) {
        var sep = chTok(/chart-?pie\/separator\/static\/thickness$/i), SHARE = [35, 25, 20, 20, 15].slice(0, slices.length), tot = SHARE.reduce(function (a, b) { return a + b; }, 0), C = 2 * Math.PI * 70, acc = 0;
        var arcs = slices.map(function (t, i) { var len = C * SHARE[i] / tot, a = '<circle cx="100" cy="100" r="70" style="stroke:' + esc(bkCss(t)) + ';stroke-dasharray:' + len.toFixed(1) + ' ' + C.toFixed(1) + ';stroke-dashoffset:' + (-acc).toFixed(1) + ';--i:' + i + '"/>'; acc += len; return a; }).join('');
        var gaps = sep ? slices.map(function (t, i) { var at = SHARE.slice(0, i).reduce(function (x, y) { return x + y; }, 0) / tot * 360; return '<line x1="100" y1="100" x2="190" y2="100" style="stroke:' + esc(INK) + ';stroke-width:' + esc(bkCss(sep, 'px')) + ';transform:rotate(' + at.toFixed(1) + 'deg);--i:' + i + '"/>'; }).join('') : '';
        addI('w2 h3 sg-bk-ch-pie-t', groundTile, '<span class="sg-bk-geo-note">' + esc(bkShort(slices[0].figma.replace(/\/[^/]+\/[^/]+$/, ''))) + '</span>' +
          '<div class="sg-bk-ch-ring"><svg viewBox="0 0 200 200" class="sg-bk-pie" data-c="' + C.toFixed(1) + '" aria-hidden="true">' + arcs + gaps + '</svg><b class="sg-bk-ch-mid" style="' + fam + strong + 'color:' + esc(bkCss(slices[0])) + '">' + Math.round(SHARE[0] / tot * 100) + '%</b></div>' +
          '<span class="sg-bk-geo-note">' + (sep ? 'separator ' + bkPx(sep) + 'px  ·  ' : '') + plural(slices.length, 'slice', 'slices') + '</span>');
      }
      // The columns: the bars idle, the tallest selected with its column behind it, the labels idle and selected, the
      // lines across at their own thickness and colour.
      var barSel = chTok(/chart-?column\/bar\/background\/selected\/colou?r$/i), barIdle = chTok(/chart-?column\/bar\/background\/idle\/colou?r$/i), barR = chTok(/chart-?column\/bar\/radius\/top-?left$/i);
      var colSel = chTok(/chart-?column\/column\/background\/selected\/colou?r$/i), colR = chTok(/chart-?column\/column\/radius\/selected\/top-?left$/i);
      var labIdle = chTok(/chart-?column\/bar\/label\/idle\/colou?r$/i), labSel = chTok(/chart-?column\/bar\/label\/selected\/colou?r$/i);
      var lineC = chTok(/chart-?column\/lines\/background\/colou?r$/i), lineW = chTok(/chart-?column\/lines\/thickness$/i);
      if (barSel || barIdle) {
        var HTS = [40, 72, 55, 90, 30, 64], DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], bR = barR ? bkCss(barR, 'px') : 'var(--bk-rad-s)';
        var colVars = '--c-idle:' + (barIdle ? bkCss(barIdle) : HUE2) + ';--c-sel:' + (barSel ? bkCss(barSel) : HUE1) + ';--c-col:' + (colSel ? bkCss(colSel) : 'transparent') + ';--c-col-r:' + (colR ? bkCss(colR, 'px') : bR) + ';--c-bar-r:' + bR +
          ';--c-lab:' + (labIdle ? bkCss(labIdle) : 'inherit') + ';--c-lab-sel:' + (labSel ? bkCss(labSel) : 'inherit') + ';--c-line:' + (lineC ? bkCss(lineC) : 'currentColor') + ';--c-line-w:' + (lineW ? bkCss(lineW, 'px') : 'var(--bk-line-w, 1px)');
        addI('w4 h3 sg-bk-ch-col-t', groundTile, '<div class="sg-bk-col-head"><b style="' + fam + strong + '">' + esc(bkShort((barSel || barIdle).figma.split('/').slice(0, 2).join('/'))) + '</b>' + chMotion + '</div>' +
          '<div class="sg-bk-ch-cols" style="' + esc(colVars) + '">' + HTS.map(function (h, i) { return '<span class="' + (i === 3 ? 'is-sel' : '') + '" style="--i:' + i + '"><span class="sg-bk-ch-bar"><i style="height:' + h + '%"></i></span><small>' + DAYS[i] + '</small></span>'; }).join('') + '</div>');
      }
      // The bars: one for each state the system has a track and a fill for, each filling to its share.
      var hStates = ['positive', 'informative', 'neutral', 'warning', 'negative'].map(function (st) { var tr = chTok(new RegExp('chart-?bar\\/track\\/' + st + '\\/colou?r$', 'i')), fi = chTok(new RegExp('chart-?bar\\/percentage\\/' + st + '\\/colou?r$', 'i')); return tr && fi ? { st: st, tr: tr, fi: fi } : null; }).filter(Boolean);
      if (hStates.length) {
        var hBg = chTok(/chart-?bar\/background\/colou?r$/i), hLab = chTok(/chart-?bar\/label\/colou?r$/i), hR = chTok(/chart-?bar\/radius\/all$/i), PCT = [72, 48, 60, 35, 20];
        var hbg = hBg ? bkHex(hBg) : paper;
        addI('w6 h2 sg-bk-ch-bar-t', tileCss(hbg, hBg ? bkCss(hBg) : PAPER, hLab ? bkCss(hLab) : readOn(hbg)), '<div class="sg-bk-col-head"><b style="' + fam + strong + '">' + esc(bkShort(hStates[0].tr.figma.split('/').slice(0, 2).join('/'))) + '</b>' + chMotion + '</div>' +
          '<div class="sg-bk-ch-bars">' + hStates.map(function (h, i) { return '<span style="--i:' + i + '"><small>' + esc(h.st) + '</small><span class="sg-bk-ch-track" style="background:' + esc(bkCss(h.tr)) + ';border-radius:' + esc(hR ? bkCss(hR, 'px') : 'var(--bk-rad-s)') + '"><i style="width:' + PCT[i] + '%;background:' + esc(bkCss(h.fi)) + ';border-radius:inherit"></i></span><b>' + PCT[i] + '%</b></span>'; }).join('') + '</div>');
      }
      // The order on the page: the bars, full width, then the pie beside the columns.
      if (hStates.length) IT.unshift(IT.pop());
      var CHARTS = IT.length ? '<div class="sg-bk-bento sg-bk-charts" style="--ch-ms:' + chMs + 'ms;--ch-ease:' + esc(chEase) + ';--ch-step:' + chStep + 'ms" data-loop="' + Math.max(2400, chMs * 6) + '">' + IT.join('') + '</div>' : '';
      html = html.replace('%%BK-RUN%%', RUN);
      // Under the colours: geometry and motion, the pairs, the icons and charts, and the numbers to close.
      // Numbers: the brand's own values set huge, cropped by their tiles, in its hues: how many tokens (counting up),
      // its largest radius, its durations sliding, its contrast, its icon sizes rolling, its spacing, its values running.
      var NT = [], addN = function (cls, attrs, inner) { NT.push('<div class="sg-bk-t sg-bk-num ' + cls + '" ' + attrs + '>' + inner + '</div>'); };
      var lbl = function (t, side) { return '<span class="sg-bk-num-label' + (side ? ' is-right' : '') + '">' + esc(t) + '</span>'; };
      addN('w4 h3', groundTile, lbl(plural(Object.keys(colls).length, 'collection', 'collections') + ' · tokens') + '<b class="sg-bk-num-xl" style="' + fam + strong + 'color:' + esc(onG) + '" data-bk-count="' + BK_ALL.length + '">' + BK_ALL.length + '</b>');
      if (radPos.length) { var rl = radPos[radPos.length - 1]; addN('w2 h2', groundTile, lbl(bkShort(rl.t.figma)) + '<b class="sg-bk-num-l is-right" style="' + fam + strong + 'color:' + esc(onG) + '">' + rl.n + '</b>'); }
      var msList = DU.map(function (m) { return m.ms; });
      if (msList.length) addN('w2 h1 sg-bk-num-run', groundTile, '<b class="sg-bk-num-slide" style="' + fam + strong + '">' + msList.map(function (v) { return v + '<em style="color:' + esc(onG) + '">ms</em>'; }).join(' ') + '</b>');
      if (hero && second) addN('w2 h2', tileCss(h2x, HUE2, on2), lbl('contrast · ' + second.figma + ' on ' + hero.figma) + '<b class="sg-bk-num-m" style="' + fam + strong + 'color:' + esc(readOn(h2x, h1x, HUE1, 3)) + '">' + (bkRatio(h1x, h2x) || 0).toFixed(1) + '<small>:1</small></b>');
      var izs = mono.length ? Object.keys(sizeCount).map(Number).sort(function (a, b) { return a - b; }).slice(0, 4) : [];
      if (izs.length > 1) addN('w2 h2', bg2, lbl('icon sizes') + '<div class="sg-bk-num-roll" style="' + fam + strong + '"><div style="--n:' + izs.length + '">' + izs.concat([izs[0]]).map(function (z, i) { return '<span' + (i % 2 ? ' style="color:' + esc(ac1) + '"' : '') + '>' + z + '</span>'; }).join('') + '</div></div>');
      if (GAPS.length) addN('w2 h2', groundTile, lbl('spacing · ' + GAPS[0].n + ' → ' + GAPS[GAPS.length - 1].n, true) + '<b class="sg-bk-num-l" style="' + fam + strong + 'color:' + esc(onG) + '">' + GAPS[GAPS.length - 1].n + '</b><b class="sg-bk-num-s" style="' + fam + '">' + GAPS[0].n + '</b>');
      var NUMS = '<div class="sg-bk-bento">' + NT.join('') + '</div>';
      // Regular to Display, and the scale: the body style (the regular one nearest 16px) turning into the largest, its
      // cap height, x-height, baseline and line height measured in the brand's own family; every size the brand has,
      // each set in its own tokens; and the sizes as bars. Every number is the brand's.
      var MORPH = '';
      var tv = function (o) { return o && o.var ? 'var(' + o.var + ')' : ''; };
      var STY = (TOKENS.typography || []).filter(function (st) { return st.size && st.size.var; }).map(function (st) {
        var px = parseFloat(bkRead('fontSize', tv(st.size))) || parseFloat(st.size.value) || 0;
        var w = st.weight ? (parseFloat(bkRead('fontWeight', tv(st.weight))) || parseFloat(st.weight.value) || 400) : 400;
        var lh = st.lh ? parseFloat(bkRead('lineHeight', tv(st.lh))) || 0 : 0;
        var lsPx = st.ls ? parseFloat(bkRead('letterSpacing', tv(st.ls))) || 0 : 0;
        return { st: st, name: st.scale || st.size.figma, px: px, w: w, lh: lh, ls: px ? lsPx / px : 0 };
      }).filter(function (x) { return x.px; });
      var near16 = function (list) { return list.slice().sort(function (a, b) { return Math.abs(a.px - 16) - Math.abs(b.px - 16) || a.w - b.w; })[0]; };
      var reg = near16(STY.filter(function (x) { return /regular|body|book|normal/i.test(x.name); })) || near16(STY);
      var disp = STY.slice().sort(function (a, b) { return b.px - a.px || b.w - a.w; })[0];
      // A small scale whose body style is also its largest (13, 11 and 9px): the next style is the one compared with.
      if (reg && disp === reg && STY.length > 1) reg = near16(STY.filter(function (x) { return x !== disp; }));
      if (reg && disp && disp !== reg) {
        // The family's own proportions, measured at the display size: its cap height and x-height.
        var famFont = String(bkRead('fontFamily', famCss || 'inherit'));
        var cv = document.createElement('canvas').getContext('2d'), metric = function (ch) { cv.font = disp.w + ' 100px ' + famFont; var m = cv.measureText(ch); return (m.actualBoundingBoxAscent || 0) / 100; };
        // Measured in the family itself: when it has not loaded yet (a fallback's letters measured), drawn again once it has.
        var fontStr = disp.w + ' 100px ' + famFont;
        if (document.fonts && !document.fonts.check(fontStr) && !bkOut._fontWait) { bkOut._fontWait = 1; document.fonts.load(fontStr).then(function () { if (document.fonts.check(fontStr)) bkDraw(); }); }
        var capR = metric('H') || 0.7, xR = metric('x') || 0.5;
        var F = 250, BASE = 250, W2 = 420;   // the drawing: letters 250 units tall on a baseline at 250
        // The weights the text styles use, each named as the styles name it (m/regular: regular): the letters and the
        // scale step through them together, one after the other.
        var WTS = [], wName = {}; STY.forEach(function (x) { if (WTS.indexOf(x.w) < 0) WTS.push(x.w); var nm = String(x.name).split('/').slice(-1)[0]; if (!wName[x.w] && nm !== String(x.name)) wName[x.w] = nm; }); WTS.sort(function (a, b) { return a - b; });
        var wChips = WTS.length > 1 ? '<span class="sg-bk-tm-ws">' + WTS.map(function (w) { return '<i>' + w + (wName[w] ? '  ·  ' + esc(wName[w]) : '') + '</i>'; }).join('') + '</span>' : '';
        var lhPx = disp.lh || Math.round(disp.px * 1.2);
        // The scale: one line for each size the brand has (its regular style where there is one), largest first.
        var bySize = {}; STY.forEach(function (x) { var k = Math.round(x.px); if (!bySize[k] || (x === reg) || (/regular/i.test(x.name) && bySize[k] !== reg)) bySize[k] = x; });
        var scale = Object.keys(bySize).map(Number).sort(function (a, b) { return b - a; }).map(function (k) { return bySize[k]; }).slice(0, 8);
        // Every breakpoint's sizes in the theme chosen, read from its own variables (a probe in each mode): the tile steps
        // through them, each in each weight, the letters, the scale and the bars together. Starts at the page's own.
        var bpMode = (DATA.modes || []).find(function (m) { return m.attr === 'data-size'; }), bpEl = bkOut.closest('[data-size]'), bpVal = bpEl ? bpEl.getAttribute('data-size') : '';
        var bpList = bpMode && (bpMode.values || []).length ? bpMode.values : [{ label: '', value: '' }];
        var tmProbe = document.createElement('div'); tmProbe.hidden = true; bkOut.appendChild(tmProbe);
        var BPV = bpList.map(function (m) {
          if (m.value) tmProbe.setAttribute('data-size', m.value); else tmProbe.removeAttribute('data-size');
          var cs = getComputedStyle(tmProbe), at = function (v, dflt) { var n = parseFloat(cs.getPropertyValue(v)); return isFinite(n) && n > 0 ? Math.round(n) : dflt; };
          return { label: m.label, px: scale.map(function (x) { return at(x.st.size.var, Math.round(x.px)); }), lh: disp.st.lh && disp.st.lh.var ? at(disp.st.lh.var, Math.round(lhPx)) : Math.round(lhPx) };
        });
        tmProbe.remove();
        var bpAt = Math.max(0, bpList.findIndex(function (m) { return m.value === bpVal; }));
        var maxAll = Math.max.apply(null, BPV.map(function (b) { return Math.max.apply(null, b.px); })), now = BPV[bpAt];
        var regAt = scale.indexOf(reg), xxlNow = now.px[0];
        // The drawing at this breakpoint's largest size, relative to the largest of all, so a smaller one draws smaller.
        var fNow = F * xxlNow / maxAll, guide = function (cls, y, label, muted) { return '<g class="' + cls + '" style="transform:translateY(' + Math.round(y) + 'px)"><line x1="0" y1="0" x2="' + W2 + '" y2="0" class="' + (muted ? 'is-mute is-dash' : cls === 'sg-tm-x' ? 'is-acc is-dash' : 'is-acc') + '"/><text x="4" y="-6" class="' + (muted ? 'is-mute' : 'is-acc') + '">' + label + '</text></g>'; };
        var lhY = function (b, f) { return BASE + (b.lh / b.px[0] - 1) * f + f * 0.22; };
        var bpChips = bpList.length > 1 ? '<span class="sg-bk-tm-ws sg-bk-tm-bps">' + bpList.map(function (m, i) { return '<i data-bp="' + i + '" role="button" tabindex="0" class="' + (i === bpAt ? 'is-on' : '') + '">' + esc(m.label) + '</i>'; }).join('') + '</span>' : '';
        var wChips = WTS.length > 1 ? '<span class="sg-bk-tm-ws sg-bk-tm-wts">' + WTS.map(function (w) { return '<i data-w="' + w + '" role="button" tabindex="0">' + w + (wName[w] ? '  ·  ' + esc(wName[w]) : '') + '</i>'; }).join('') + '</span>' : '';
        var left = '<div class="sg-bk-tm-left">' + bpChips +
          '<svg class="sg-bk-tm-svg" viewBox="0 0 ' + W2 + ' 330" preserveAspectRatio="xMinYMid meet" aria-hidden="true">' +
          '<text x="4" y="22" class="is-mute sg-tm-size">' + esc(String(disp.name).split('/')[0]) + '  ·  ' + xxlNow + 'px</text>' +
          guide('sg-tm-cap', BASE - capR * fNow, 'cap height  ·  ' + Math.round(capR * xxlNow) + 'px') +
          guide('sg-tm-x', BASE - xR * fNow, 'x-height  ·  ' + Math.round(xR * xxlNow) + 'px') +
          guide('sg-tm-base', BASE, 'baseline') +
          guide('sg-tm-lh', lhY(now, fNow), 'line height  ·  ' + now.lh + 'px', true) +
          '<text x="100" y="' + BASE + '" class="sg-bk-tm-aa" style="font-size:' + Math.round(fNow) + 'px;' + (famCss ? 'font-family:' + esc(famCss) + ';' : '') + 'font-weight:var(--tm-w, ' + disp.w + ');letter-spacing:' + disp.ls + 'em">Aa</text></svg>' + wChips + '</div>';
        // The system talking about itself, one line a size, largest first: its own counts, family and sizes, so no row
        // claims a role (a size is a heading in one product and a number in another); one line each, cut where the tile ends.
        var nComp = typeof COMPONENTS !== 'undefined' ? menuCount() : 0,   // as the menu counts them: no parts (a family once), none only the code has
          nCol = Object.keys(colls).length;
        var nTok = typeof tkRows !== 'undefined' && tkRows ? tkRows.length : BK_ALL.length;   // as the Tokens page counts them: every collection
        var SAYS = ['100% system', nTok.toLocaleString('en') + ' tokens', plural(nCol, 'collection', 'collections') + (nComp ? ', ' + plural(nComp, 'component', 'components') : ''),
          (famName ? 'Set in ' + famName + ', ' : '') + plural(scale.length, 'size', 'sizes') + ' and ' + plural(WTS.length, 'weight', 'weights'),
          'Every value here is a token', 'Built from Figma, checked against code', 'One name for each value, in every theme', 'Change it once, it changes everywhere'];
        // The primary hue on the largest only: large text reads at 3:1, where small text needs 4.5. Each sample set at the
        // breakpoint shown (its size in px), in the weight shown (--tm-w), its other values its own tokens.
        var rows = scale.map(function (x, i) {
          var css = 'font-size:' + now.px[i] + 'px;font-weight:var(--tm-w, ' + (x.st.weight ? tv(x.st.weight) : x.w) + ');' + (x.st.lh ? 'line-height:' + tv(x.st.lh) + ';' : '') + (x.st.ls ? 'letter-spacing:' + tv(x.st.ls) + ';' : '') + (famCss ? 'font-family:' + famCss + ';' : '') + (i === 0 ? 'color:var(--bk-1);' : '');   /* the largest in the tile's accent, which reads on its ground */
          return '<div class="sg-bk-tm-row' + (x === reg ? ' is-reg' : '') + '"><span class="sg-bk-tm-size">' + esc(String(x.name).split('/')[0]) + '  ·  <span class="sg-tm-px">' + now.px[i] + '</span></span><span class="sg-bk-tm-say" style="' + esc(css) + '">' + esc(SAYS[i] || SAYS[SAYS.length - 1]) + '</span></div>';
        }).join('');
        var howOf = function (b) { var r = b.px[regAt] || reg.px; return '<b>' + Math.round(b.px[0] / r * 10) / 10 + '×</b> the size' + (disp.w !== reg.w ? ', <b>' + (disp.w > reg.w ? '+' : '') + (disp.w - reg.w) + '</b> weight' : ''); };
        var mid = '<div class="sg-bk-tm-mid"><span class="sg-bk-tm-kicker">The scale  ·  ' + plural(scale.length, 'size', 'sizes') + '</span><div class="sg-bk-tm-rows">' + rows + '</div>' +
          '<p class="sg-bk-tm-note" style="' + fam + '">' + esc(String(reg.name).split('/')[0]) + ' → ' + esc(String(disp.name).split('/')[0]) + ': <span class="sg-tm-how">' + howOf(now) + '</span></p></div>';
        // The sizes as bars, smallest to largest, none singled out; a dotted mark on each at that size in every other
        // breakpoint, so a change shows at a glance.
        var onHue = readOn(h1x, paper, PAPER, 3), nS = scale.length;
        var bars = '<div class="sg-bk-tm-bars" style="background:' + esc(HUE1) + ';color:' + esc(onHue) + '"><span class="sg-bk-tm-kicker">Size  ·  px</span><div class="sg-bk-tm-cols">' +
          scale.slice().reverse().map(function (x, i) { var k = nS - 1 - i; return '<span data-k="' + k + '" title="' + esc(x.name) + '"><i style="height:' + Math.round(now.px[k] / maxAll * 100) + '%;background:currentColor;opacity:' + (0.5 + 0.5 * i / Math.max(1, nS - 1)).toFixed(2) + ';transition-delay:' + i * 45 + 'ms"></i>' +
            BPV.map(function (b, j) { return '<s data-bp="' + j + '" style="bottom:' + Math.round(b.px[k] / maxAll * 100) + '%"' + (j === bpAt ? ' hidden' : '') + '></s>'; }).join('') + '</span>'; }).join('') +
          '</div><span class="sg-bk-tm-ends"><span class="sg-tm-min">' + now.px[nS - 1] + '</span><span class="sg-tm-max">' + now.px[0] + '</span></span></div>';
        var tmData = { bp: BPV.map(function (b) { return { px: b.px, lh: b.lh }; }), at: bpAt, max: maxAll, w: WTS, cap: capR, x: xR, F: F, base: BASE, reg: regAt, dw: disp.w - reg.w };
        MORPH = '<div class="sg-bk-bento"><div class="sg-bk-t w6 h5 sg-bk-block sg-bk-tm" data-weights="' + WTS.join(',') + '" data-tm="' + esc(JSON.stringify(tmData)) + '" ' + groundTile.replace('style="', 'style="--bk-1:' + esc(markOn(darkPage ? ink : paper)) + ';') + ' >'   /* the letters and guides in a hue that reads on this ground, else its text colour */ + left + mid + bars + '</div></div>';
      }
      // Depth: the system's surfaces, each only its background, its border where it has one and its shadow, lifted only
      // where its own switch is on (a shadow's values do not lift it, its display does). A stacked preview of a page built
      // from them, the modal on top and see-through, beside every surface the system gives a shadow, one size each.
      var DEPTH = '', shBases = [];
      BK_ALL.forEach(function (t) { var m = /^(.*)\/shadow\/blur$/i.exec(t.figma); if (m && shBases.indexOf(m[1]) < 0) shBases.push(m[1]); });
      if (shBases.length) {
        var dpBy = {}; BK_ALL.forEach(function (t) { dpBy[t.figma.toLowerCase()] = t; });
        var dpTk = function (base, rest) { for (var i = 0; i < rest.length; i++) { var t = dpBy[(base + '/' + rest[i]).toLowerCase()]; if (t) return t; } return null; };
        var BG = ['background/default/color', 'background/color', 'background/idle/color'];
        var dpSurf = function (base, bgT) {
          var on = dpTk(base, ['shadow/display']), lifted = on ? /^true$/i.test(bkNow(on)) : false;
          var x = dpTk(base, ['shadow/X']), y = dpTk(base, ['shadow/Y']), b = dpTk(base, ['shadow/blur']), sp = dpTk(base, ['shadow/spread']), c = dpTk(base, ['shadow/color']);
          // A background with a switch of its own (a header that has none in dark) is drawn only where it is on; where it
          // is off the page shows through, so it takes the page's own background.
          var bgOn = bgT ? null : dpTk(base, ['background/default/display', 'background/display']);
          var bg = bgT || (bgOn && !/^true$/i.test(bkNow(bgOn)) ? dpBy['base/appbackground/color'] || null : dpTk(base, BG)), r = dpTk(base, ['radius/all', 'radius/topLeft', 'radius/leftRight']);
          var bd = dpTk(base, ['border/default/color', 'border/color']), bw = dpTk(base, ['border/default/all', 'border/all']), bdOn = dpTk(base, ['border/display', 'border/default/display']);
          var border = bd && bw && (!bdOn || /^true$/i.test(bkNow(bdOn))) && parseFloat(bkNow(bw)) > 0;
          var num = function (t) { return String(Math.round((parseFloat(bkNow(t)) || 0) * 10) / 10); };
          return { name: base, lifted: lifted, bare: !bg && !border, rad: r ? num(r) : null, fx: lifted && x && y && b ? [x, y, b, sp].map(function (t) { return t ? num(t) : '0'; }).join(' ') + (c ? ' · ' + bkHex(c) : '') : null, bgHex: bg ? bkHex(bg) : null, line: border ? '--dp-line:' + bkCss(bd) + ';--dp-line-w:' + bkCss(bw, 'px') + ';' : '',
            css: 'background:' + (bg ? bkCss(bg) : 'transparent') + ';' + (r ? 'border-radius:calc(' + bkCss(r, 'px') + ' * var(--dp-k, 1));' : '') + (border ? 'border:calc(' + bkCss(bw, 'px') + ' * var(--dp-k, 1)) solid ' + bkCss(bd) + ';' : '') +
              'box-shadow:' + (lifted && x && y && b ? [x, y, b].concat(sp ? [sp] : []).map(function (t) { return 'calc(' + bkCss(t, 'px') + ' * var(--dp-k, 1))'; }).join(' ') + ' ' + (c ? bkCss(c) : 'currentColor') : 'none') + ';' };   /* all at the drawing's scale */
        };
        // A surface with a background for each status (a toast: positive, info, alert, negative) is one sample each.
        var dpList = [];
        shBases.forEach(function (base) {
          var st = ['info', 'positive', 'alert', 'negative'].map(function (k) { return dpTk(base, ['background/' + k + '/color']); }).filter(Boolean);
          if (!dpTk(base, BG) && st.length) st.forEach(function (t) { var x = dpSurf(base, t); x.status = String(t.figma).split('/').slice(-2, -1)[0]; dpList.push(x); }); else dpList.push(dpSurf(base));
        });
        var dpRank = function (n) { return /header|panel|navigation|menu/i.test(n) ? 0 : /card|pop|drop/i.test(n) ? 1 : /button/i.test(n) ? 2 : /toast/i.test(n) ? 3 : 4; };
        dpList = dpList.map(function (x, i) { return [x, i]; }).sort(function (a, b) { return dpRank(a[0].name) - dpRank(b[0].name) || a[1] - b[1]; }).map(function (p) { return p[0]; });
        var dpFind = function (re) { return dpList.find(function (x) { return re.test(x.name); }); };
        var dpCard = dpFind(/cardPrimary$/i) || dpFind(/card/i);
        var dpP = { card: dpCard, card2: dpCard, card3: dpCard, card4: dpCard, header: dpFind(/^header/i) || dpFind(/header/i), button: dpFind(/buttonPrimary$/i) || dpFind(/button/i), button2: dpFind(/buttonSecondary$/i), drop: dpFind(/drop$/i) || dpFind(/pop-?over$/i), toast: dpList.find(function (x) { return /toast/i.test(x.name) && x.status === 'positive'; }) || dpFind(/toast/i), panel: dpFind(/^\w*panel$/i) || dpFind(/panel/i),   // the action bar's own panel
          fab: dpFind(/floating.*primary$/i) || dpFind(/floating/i), modal: dpFind(/modal$/i) || dpFind(/modal/i) };
        // Each in proportion to the header as Figma draws them (header 80, button 40, floating button 64), the toast a little lower.
        // Drawn back to front: the page's cards (two columns in two rows, one margin from the sides and between them, running
        // under the header and the action bar), the header, the floating button in the second row's bottom
        // right corner, a drop-down panel open from the header over them, the action bar, then the toast one
        // margin and a step above the bottom, over the bar's top edge (centred, a layer above it), the modal last, solid, its secondary and primary buttons
        // side by side along its foot. The margin is the scene's width (cqw),
        // so it is the same across and down.
        var dpM = '2cqw', dpIn = 'calc(' + dpM + ' + var(--sg-space-l))', dpLow = 'calc(14% + var(--sg-space-l))';
        var dpCol = function (side, top, bottom) { return side + ':' + dpM + ';width:calc((100% - ' + dpM + ' * 3) / 2);top:' + top + ';bottom:' + bottom; };
        // The rows run past the drawing's top and bottom (clipped there): only the corners between them show, as a page
        // that scrolls on past what is in view.
        var dpRow = [['-12%', 'calc(50% + ' + dpM + ' / 2)'], ['calc(50% + ' + dpM + ' / 2)', '-12%']];
        var dpPlace = { card: dpCol('left', dpRow[0][0], dpRow[0][1]), card2: dpCol('right', dpRow[0][0], dpRow[0][1]), card3: dpCol('left', dpRow[1][0], dpRow[1][1]),
          card4: dpCol('right', dpRow[1][0], dpRow[1][1]), header: 'left:0;top:0;right:0;height:9%',
          drop: 'left:8%;top:4%;width:30%;height:20%', panel: 'left:0;right:0;bottom:0;height:9%', fab: 'right:' + dpIn + ';bottom:' + dpLow + ';height:7.2%;aspect-ratio:1',
          toast: 'left:50%;bottom:calc(' + dpM + ' + var(--sg-space-s));width:50%;height:7.2%;transform:translateX(-50%)',
          modal: 'left:50%;top:50%;width:52%;height:34%;transform:translate(-50%,-50%)' };
        // A toast holds its buttons at its end: the system's quietest button (its fourth level, else its third), in that
        // button's own tokens.
        var dpQuiet = ['quaternary', 'tertiary'].map(function (lvl) { var t = BK_ALL.find(function (x) { return new RegExp('(^|/)button' + lvl + '/background/default/color$', 'i').test(x.figma); }); return t ? t.figma.replace(/\/background\/default\/color$/i, '') : null; }).filter(Boolean)[0];
        var dpQ = dpQuiet ? dpSurf(dpQuiet) : null;
        var dpInner = { toast: dpQ ? '<b style="right:2%;' + dpQ.css + '"></b><b style="right:17.5%;' + dpQ.css + '"></b>' : '' };
        // Each surface named on hover (its component, and its status where it has one).
        var dpTitle = function (x) { return esc(String(x.name).replace(/^(advanced|semantic|base)\//, '') + (x.status ? ' · ' + x.status : '')); };
        var appBgT = dpBy['base/appbackground/color'], dpBg = appBgT ? bkHex(appBgT) : paper;
        var dpBtn = function (x, side) { return x ? '<i title="' + dpTitle(x) + '" style="bottom:var(--sg-space-l);' + side + ':var(--sg-space-l);width:calc((100% - var(--sg-space-l) * 2 - var(--sg-space-s)) / 2);height:13%;' + x.css + '"></i>' : ''; };
        dpInner.modal = dpBtn(dpP.button2, 'left') + dpBtn(dpP.button, 'right');
        var dpModalBtns = [dpP.button2, dpP.button].filter(Boolean);
        delete dpP.button; delete dpP.button2;
        // The bar along the foot is the system's action bar when it has one: in its own tokens, else in the panel's that
        // Figma paints it with, under its own name.
        var dpBarC = (typeof COMPONENTS !== 'undefined' ? COMPONENTS : []).find(function (c) { return /^action-?bar$/i.test(c.name); });
        if (dpBarC) { var dpBarB = shBases.find(function (b) { return /(^|\/)action-?bar$/i.test(b); }); dpP.panel = dpBarB ? dpSurf(dpBarB) : dpP.panel ? Object.assign({}, dpP.panel, { name: dpBarC.name, css: dpP.panel.css.replace(/border-radius:[^;]*;/, 'border-radius:0;') }) : null;   /* the panel's colours, not its corners: the bar itself has none */ }
        // The bars run along the page's edges: their corners on the edge are square.
        var dpEdge = { header: 'border-top-left-radius:0;border-top-right-radius:0;', panel: 'border-bottom-left-radius:0;border-bottom-right-radius:0;' };
        var dpZ = { card: 1, card2: 1, card3: 1, card4: 1, header: 2, panel: 2, fab: 3, drop: 4, toast: 5, modal: 6 };   /* the floating button, then the drop-down panel over it */
        var dpScene = Object.keys(dpPlace).map(function (k) { return dpP[k] ? '<i data-z="' + dpZ[k] + '" title="' + dpTitle(dpP[k]) + '" style="' + dpPlace[k] + ';' + dpP[k].css + (dpEdge[k] || '') + '">' + (dpInner[k] || '') + '</i>' : ''; }).join('');
        var dpOn = dpList.filter(function (x) { return x.lifted; }).length;
        // The same stack pulled apart, one plane per height: the page, the cards on it, the bars, what floats (a drop-down
        // panel, the floating button), the toast, the modal on top; each surface where it is in the stack, in its own
        // tokens and shadow, so what casts onto what shows.
        // How far apart, as the slider left it (kept when a theme or a mode draws the page again).
        var dpEx = bkOut._dpEx != null ? bkOut._dpEx : 1.5;
        if (!bkOut._dpExOn) { bkOut._dpExOn = 1; bkOut.addEventListener('input', function (e) { var r = e.target; if (!r.hasAttribute || !r.hasAttribute('data-dp-ex')) return; bkOut._dpEx = r.value; var iso = r.closest('.sg-bk-dp-iso'); if (iso) { iso.style.setProperty('--dp-ex', r.value); dpLeads(iso); clearTimeout(iso._leads); iso._leads = setTimeout(function () { dpLeads(iso); }, 450); } }); }
        var dpT = bkOut._dpT != null ? bkOut._dpT : 0;
        if (!bkOut._dpmOn) {
          bkOut._dpmOn = 1;
          var dpmSet = function (stage, v) { bkOut._dpT = v; stage.style.setProperty('--t', v); var r = stage.querySelector('[data-dpm]'); if (r) r.value = v; };
          bkOut.addEventListener('input', function (e) { var r = e.target; if (!r.hasAttribute || !r.hasAttribute('data-dpm')) return; var st = r.closest('.sg-bk-dpm-stage'); if (st) dpmSet(st, r.value); });
          bkOut.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('[data-dpm-play]'); if (!b) return;
            var st = b.closest('.sg-bk-dpm-stage'), from = +(bkOut._dpT || 0), to = from > .5 ? 0 : 1, a = performance.now();
            if (matchMedia('(prefers-reduced-motion: reduce)').matches) { dpmSet(st, to); return; }
            (function step(n) { var k = Math.min(1, (n - a) / 1400), ease = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; dpmSet(st, (from + (to - from) * ease).toFixed(3)); if (k < 1) requestAnimationFrame(step); })(a);
          });
        }
        var dpPlanesOf = function (place) { return [0, 1, 2, 3, 4, 5, 6].map(function (z) {
          var own = Object.keys(place).filter(function (k) { return dpP[k] && dpZ[k] === z; });
          return '<div class="sg-bk-dp-plane" data-z="' + z + '"' + (own.some(function (k) { return dpP[k].lifted; }) || (z === 6 && dpModalBtns.some(function (x) { return x.lifted; })) ? ' data-lifts' : '') + ' style="--z:' + z + (z ? '' : ';background:' + esc(appBgT ? bkCss(appBgT) : dpBg)) + '">' + own.map(function (k) { return '<i title="' + dpTitle(dpP[k]) + '" style="' + place[k] + ';' + dpP[k].css + (dpEdge[k] || '') + '">' + (dpInner[k] || '') + '</i>'; }).join('') + '<i class="sg-bk-dp-anchor"></i></div>';
        }).join(''); };
        var dpPlanes = dpPlanesOf(dpPlace);
        // Each height named (what sits there and its depth on hover: the shadow, x y blur spread · colour, of the first
        // that casts one, else flat, and the radius).
        var dpLevel = ['Page', 'Cards', 'Bars', 'Floating', 'Panel', 'Toast', 'Modal'];
        var dpShort = function (x) { return String(x.name).replace(/^(advanced|semantic|base)\//, '') + (x.status ? ' · ' + x.status : ''); };
        var dpCalls = dpLevel.map(function (label, z) {
          var on = Object.keys(dpPlace).filter(function (k) { return dpP[k] && dpZ[k] === z; }).map(function (k) { return dpP[k]; }).concat(z === 6 ? dpModalBtns : []);
          var names = on.map(dpShort).filter(function (n, i, a) { return a.indexOf(n) === i; });
          var cast = on.find(function (x) { return x.fx; }), rad = on.find(function (x) { return x.rad != null; });
          var spec = z ? (cast ? 'shadow ' + cast.fx : 'flat') + (rad ? ' · r ' + rad.rad : '') : (appBgT ? bkHex(appBgT) : '');
          return '<div class="sg-bk-dp-call" role="button" tabindex="0" data-z="' + z + '" title="' + esc(names.join(' · ') + (spec ? ' · ' + spec : '')) + '"><span class="sg-bk-dp-idx">0' + z + '</span>' + esc(label) + '</div>';
        }).reverse().join('');
        // Each layer's shadow as its tokens: x y blur spread and the colour, each with the token it is read from and,
        // after an arrow, every alias it follows down to the primitive, in this theme and mode; a layer whose shadow is
        // off says so, the page has none.
        var dpMi = function (t) { var m = t.modes || [], d = m.findIndex(function (x) { return /dark|night/i.test(x); }); if (d < 0) return m.length - 1; var l = m.findIndex(function (x) { return !/dark|night/i.test(x); }); return document.documentElement.getAttribute('data-sg-scheme') === 'dark' ? d : Math.max(0, l); };
        var dpChain = function (t) { var out = [t.figma], cur = t; for (var g = 0; cur && g < 8; g++) { var a = (cur.aliases || [])[dpMi(cur)]; if (!a) break; out.push(a); cur = dpBy[String(a).toLowerCase()]; } return out; };
        var dpTkName = function (n) { return esc(String(n).replace(/^(advanced|semantic|base)\//, '')); };
        var dpChainHtml = function (t) { var c = dpChain(t); return dpTkName(c[0]) + (c.length > 1 ? ' <span>→ ' + c.slice(1).map(dpTkName).join(' → ') + '</span>' : ''); };
        var dpNum = function (t) { return t ? String(Math.round((parseFloat(bkNow(t)) || 0) * 10) / 10) : '0'; };
        var dpSpecs = dpLevel.map(function (label, z) {
          var main = Object.keys(dpPlace).filter(function (k) { return dpP[k] && dpZ[k] === z; }).map(function (k) { return dpP[k]; })[0];
          var row = function (k, v, t) { return '<tr><td>' + k + '</td><td class="sg-bk-dp-v">' + v + '</td><td>' + (t || '') + '</td></tr>'; };
          var rows = '';
          if (!z || !main) rows = row('shadow', '<b style="' + strong + '">no shadow</b>');
          else if (!main.lifted) rows = row('shadow', '<b style="' + strong + '">switched off</b>');
          else {
            var b = main.name, part = { x: dpTk(b, ['shadow/X']), y: dpTk(b, ['shadow/Y']), blur: dpTk(b, ['shadow/blur']), spread: dpTk(b, ['shadow/spread']) }, col = dpTk(b, ['shadow/color']);
            var vals = ['x', 'y', 'blur', 'spread'].map(function (k) { return k + ' <b style="' + strong + '">' + dpNum(part[k]) + '</b>'; }).join(' ');
            var aliased = ['x', 'y', 'blur', 'spread'].filter(function (k) { return part[k] && dpChain(part[k]).length > 1; }).map(function (k) { var c = dpChain(part[k]); return k + ' <span>→ ' + c.slice(1).map(dpTkName).join(' → ') + '</span>'; });
            rows = row('shadow', vals, dpTkName(b) + '/shadow/{X, Y, blur, spread}' + (aliased.length ? '  ·  ' + aliased.join('  ·  ') : '')) +
              (col ? row('color', '<i class="sg-bk-dp-sw" style="background:' + esc(bkCss(col)) + '"></i><b style="' + strong + '">' + esc(bkHex(col) || '') + '</b>', dpChainHtml(col)) : '');
          }
          return '<table class="sg-bk-dp-spec" data-z="' + z + '"' + (z === (bkOut._dpFocus != null ? bkOut._dpFocus : 6) ? '' : ' hidden') + '><caption class="sg-bk-dp-name" style="' + fam + strong + '">' + esc(label) + '</caption>' + rows + '</table>';
        }).join('');
        // The full-width view: the page wider, its modal as wide as in the preview (52% of a 5:8 stack's width, by height).
        var dpWide = Object.assign({}, dpPlace, { modal: 'left:50%;top:50%;width:32.5cqh;height:34%;transform:translate(-50%,-50%)' });
        // No card behind the block: the surfaces sit on the page; the stacked preview alone is a card, on the theme's app
        // background, as a page built from those surfaces would be.
        DEPTH = '<div class="sg-bk-bento"><div class="sg-bk-t w6 h5 sg-bk-block sg-bk-dp" style="' + esc(dpCard ? dpCard.line : '') + '" role="img" aria-label="' + esc(dpOn + ' of ' + dpList.length + ' surfaces cast a shadow') + '">' +
          '<div class="sg-bk-dp-scene" style="' + esc((appBgT ? 'background:' + bkCss(appBgT) + ';' : '') + (dpCard ? dpCard.line : '') + '--dp-hue:' + onG + ';') + '">' + dpScene + '</div>' +
          '<div class="sg-bk-dp-iso" data-state="exploded" data-focus="' + (bkOut._dpFocus != null ? bkOut._dpFocus : 6) + '" style="' + esc((dpCard ? dpCard.line : '') + 'background-color:var(--bk-card);--t-fg:var(--sg-text);color:var(--sg-text);--dp-hue:' + onG + ';--bk-hue:' + onG + ';') + '">' +
          '<div class="sg-bk-dp-stack">' + dpPlanes + '</div><svg class="sg-bk-dp-leads" aria-hidden="true"></svg><div class="sg-bk-dp-calls">' + dpCalls + '</div>' +
          dpSpecs + '</div></div></div>';
      }
      // At the foot, the brand's personality, read from what its tokens draw in this theme and mode: eight axes of
      // opposites (each pole across the circle from its opposite), the dashed ring the balance between them, the shape
      // reaching as far towards a pole as the tokens lean to it. Each axis says what it was read from.
      var PMAP = '';
      // The personality is the brand's, not the mode's: every token is read in light (colour in each mode, averaged), so
      // the words and the shape are the same in light and dark.
      (function () {
        var fx = AXES.filter(function (a) { return a.colour && a.attr && !a.classes; })[0], fxL = fx && fx.values.filter(function (v) { return !(v.value && /dark|night/i.test(v.label + ' ' + v.value)); })[0];
        var fxWas = fx ? bkOut.getAttribute(fx.attr) : null;
        if (fx && fxL) { bkOut.setAttribute(fx.attr, fxL.value || 'light'); bkMemo = {}; }
        try { return (function () {
        var cl = function (v) { return isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0; }, med = function (a) { a = a.slice().sort(function (x, y) { return x - y; }); return a.length ? a[Math.floor(a.length / 2)] : null; };
        var px = function (t) { var n = parseFloat(bkNow(t)); return isFinite(n) ? n : null; };
        if (!hero) return;
        // Colour is read in each colour mode the system has: a brand vivid in light and grey in dark reads as both. Its hue
        // reads warm or cool (that is mostly what it moves); a vivid primary adds a little intensity; the text's contrast
        // on the app's background reads safe and present when it is the strongest; grounds of pure white (in dark, pure
        // black) read distant.
        // Warmth by hue: reds, oranges and yellows (around 35°) warm; from 70° away (greens, purples) neutral; blues cool.
        var warmOf = function (h, sat) { var d = Math.abs(((h - 35) % 360 + 540) % 360 - 180); return cl(1 - (d - 35) / 35) * Math.min(1, sat * 1.4); };
        // How much a component is seen: 1 + the screens that hold it. Grounds, hues and shadows weigh by it, so what the
        // interface shows most counts most.
        var norm = function (n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }, compUse = {};
        COMPONENTS.forEach(function (c) { compUse[norm(c.name)] = 1 + (c.usage || []).length; });
        var useOf = function (t) { var p = t.figma.split('/'); for (var i = 0; i < p.length; i++) { var w = compUse[norm(p[i])]; if (w) return w; } return /app-?background|base\//i.test(t.figma) ? 20 : 1; };
        var mAx = AXES.filter(function (a) { return a.colour && a.attr && !a.classes; })[0];
        var mDark = mAx && mAx.values.filter(function (v) { return v.value && /dark|night/i.test(v.label + ' ' + v.value); })[0], mLight = mAx && mAx.values.filter(function (v) { return v !== mDark; })[0];
        var MODES = mDark && mLight ? [['light', mLight.value || 'light'], ['dark', mDark.value]] : [['', null]];
        var txT = bkCols.filter(function (t) { return /(^|\/)text\/(primary|default|main)|text-?(primary|default|main)/i.test(t.figma) && !/button|link|chip|tag|badge|input/i.test(t.figma); })[0];
        var bgT = bkCols.filter(function (t) { return /app-?background/i.test(t.figma); })[0];
        var grounds = bkCols.filter(function (t) { return /(background|surface|container|app-?bg|canvas)/i.test(t.figma) && !/text|icon|border|stroke|shadow|state-?layer/i.test(t.figma); });
        var colourIn = function (m) {
          var was = mAx ? bkOut.getAttribute(mAx.attr) : null;
          if (m[1] != null) { bkOut.setAttribute(mAx.attr, m[1]); bkMemo = {}; }
          var h = bkHex(hero), rgb = h && bkRgb(h), c = { mode: m[0] };
          if (rgb) {
            var mx = Math.max.apply(null, rgb), mn = Math.min.apply(null, rgb), hu = 0; c.sat = mx - mn;
            if (c.sat > 0) { hu = mx === rgb[0] ? ((rgb[1] - rgb[2]) / c.sat) % 6 : mx === rgb[1] ? (rgb[2] - rgb[0]) / c.sat + 2 : (rgb[0] - rgb[1]) / c.sat + 4; hu = (hu * 60 + 360) % 360; }
            c.hue = hu; c.warmth = warmOf(hu, c.sat); c.vivid = Math.min(1, c.sat * 1.3);
            var g2 = second && second !== hero ? bkRgb(bkHex(second) || '') : null;   // the secondary counts too, a third as much
            if (g2) { var x2 = Math.max.apply(null, g2), n2 = Math.min.apply(null, g2), d2 = x2 - n2; if (d2 > 0.15) { var hu2 = x2 === g2[0] ? ((g2[1] - g2[2]) / d2) % 6 : x2 === g2[1] ? (g2[2] - g2[0]) / d2 + 2 : (g2[0] - g2[1]) / d2 + 4; c.warmth = c.warmth * 0.7 + warmOf((hu2 * 60 + 360) % 360, d2) * 0.3; } }
          } else { c.sat = 0; c.hue = 0; c.warmth = 0; c.vivid = 0; }
          c.cr = (txT && bgT && bkRatio(bkHex(txT), bkHex(bgT))) || bkRatio(ink, paper) || 12; c.crK = cl((c.cr - 9) / 6);
          var pure = m[0] === 'dark' ? /^0{6}(ff)?$/i : /^f{6}(ff)?$/i;
          c.pure = grounds.length ? grounds.filter(function (t) { return pure.test(String(bkHex(t) || '').replace(/^#/, '')); }).length / grounds.length : 0;
          c.say = (c.sat > 0.45 ? 'a vivid' : c.sat > 0.2 ? 'a muted' : 'a grey') + ' primary';
          // Blue reads corporate; grounds of plain white and grey (untinted) read neutral, uncommitted, corporate.
          c.blue = Math.pow(Math.max(0, Math.cos((c.hue - 220) * Math.PI / 180)), 2) * Math.min(1, c.sat * 1.4);
          // Grounds, each weighed by how much its component is seen: in a colour (a brand that dares), neutral (no tint).
          var gW = 0, gTint = 0, gNeu = 0; grounds.forEach(function (t) { var g = bkRgb(bkHex(t) || ''); if (!g) return; var w = useOf(t), d = Math.max.apply(null, g) - Math.min.apply(null, g); gW += w; if (d > 0.12) gTint += w; if (d < 0.04) gNeu += w; });
          c.tinted = gW ? gTint / gW : 0; c.neutral = gW ? gNeu / gW : 0;
          if (m[1] != null) { if (was == null) bkOut.removeAttribute(mAx.attr); else bkOut.setAttribute(mAx.attr, was); bkMemo = {}; }
          return c;
        };
        var COL = MODES.map(colourIn);
        // The palette: how many hue families the primitives hold (status colours aside). Greys, one primary and one
        // contrast colour read corporate; many hues read friendly.
        var hueBins = {}; (sem.length ? sem : prim).forEach(function (t) { var w = useOf(t); if (/error|danger|success|warning|info|alert|positive|negative|critical/i.test(t.figma)) return; var g = bkRgb(bkHex(t) || ''); if (!g) return; var x = Math.max.apply(null, g), y = Math.min.apply(null, g), d = x - y; if (d < 0.25) return; var hh = x === g[0] ? ((g[1] - g[2]) / d) % 6 : x === g[1] ? (g[2] - g[0]) / d + 2 : (g[0] - g[1]) / d + 4; var bin = Math.round(((hh * 60 + 360) % 360) / 30) % 12; hueBins[bin] = (hueBins[bin] || 0) + w; });
        var binSum = Object.keys(hueBins).reduce(function (n, k) { return n + hueBins[k]; }, 0); Object.keys(hueBins).forEach(function (k) { if (hueBins[k] < binSum * 0.1) delete hueBins[k]; });
        var hueN = Object.keys(hueBins).length, palK = hueN <= 2 ? 1 : hueN >= 5 ? -1 : (3.5 - hueN) / 1.5;
        // Corners: the controls' radius in px (a pill counts as half its height), else the radii's middle. Up to 2px reads
        // square (cold, direct, pragmatic); from there the corners invite, and from 16px they read warm.
        var H = DATA.figmaHeights || {}, ctl = [];
        BK_ALL.forEach(function (t) { var p = t.figma.split('/'), comp = p[1] || ''; if (!/\/radius\/(all|top-?left)$/i.test(t.figma) || !/^(button|chip|tag|badge|checkbox|tab|toggle|switch|input)/i.test(comp) || !H[comp]) return; var r = px(t); if (r != null) ctl.push(Math.min(r, H[comp] / 2)); });
        var radAll = BK_ALL.filter(function (t) { return /radius/i.test(t.figma) && !/display/i.test(t.figma); }).map(px).filter(function (n) { return n != null && n >= 0 && n < 200; });
        var rPx = ctl.length ? med(ctl) : radAll.length ? med(radAll) : 8;
        var soft = Math.max(0, Math.min(1, (rPx - 2) / 14)), rWarm = cl((rPx - 12) / 12);   // warm from about 24px
        // Lines: the border width most tokens follow; over 1px reads graphic, bold, technical, retro.
        var follow = {}; BK_ALL.forEach(function (t) { (t.aliases || []).forEach(function (a) { if (a) follow[a] = (follow[a] || 0) + 1; }); });
        var lineT = BK_ALL.filter(function (t) { return /border|stroke/i.test(t.figma) && !/colou?r|radius|display|appearance/i.test(t.figma) && isPrim(t) && px(t) != null; }).sort(function (a, b) { return (follow[b.figma] || 0) - (follow[a.figma] || 0); })[0];
        var line = lineT ? px(lineT) : 1, thick = line > 1 ? Math.min(1, line - 1) : 0;   // 2px already reads thick
        // Shadows: how many are on, how blurred, how dark. A marked one (little blur, dark) reads graphic, technical,
        // retro; a faded one (wide blur, faint) refined; none at all direct, flat, without distraction.
        var shD = BK_ALL.filter(function (t) { return /shadow\/(.*\/)?display$/i.test(t.figma); }), shOn = shD.filter(function (t) { return /^true$/i.test(bkNow(t)); }).length;
        // Prevalence: a shadow counts as much as its component is used across the interface (the screens that hold it),
        // so a card shadow seen everywhere weighs more than a pop-over's.
        var shW = function (t) { var p = t.figma.split('/'), i = p.map(function (x) { return x.toLowerCase(); }).indexOf('shadow'); return compUse[norm(i > 0 ? p[i - 1] : p[0])] || 1; };
        var shAll = shD.reduce(function (n, t) { return n + shW(t); }, 0), shOnW = shD.filter(function (t) { return /^true$/i.test(bkNow(t)); }).reduce(function (n, t) { return n + shW(t); }, 0);
        var share = shAll ? shOnW / shAll : 0, blur = med(BK_ALL.filter(function (t) { return /shadow\/blur$/i.test(t.figma); }).map(px).filter(function (n) { return n != null; })) || 0;
        var alpha = med(BK_ALL.filter(function (t) { return /shadow\/colou?r$/i.test(t.figma); }).map(function (t) { var v = String(bkNow(t)).trim(), m = v.match(/rgba?\(([^)]+)\)/); if (m) { var q = m[1].split(/[\s,\/]+/).filter(Boolean); return q.length > 3 ? parseFloat(q[3]) * (/%/.test(q[3]) ? 0.01 : 1) : 1; } m = v.match(/^#?([0-9a-f]{8})$/i); return m ? parseInt(m[1].slice(6), 16) / 255 : /^#?[0-9a-f]{6}$/i.test(v) ? 1 : null; }).filter(function (n) { return n != null && isFinite(n); }));
        if (alpha == null) alpha = 0.15;
        var marked = share ? (1 - Math.min(1, blur / 16)) * 0.6 + Math.min(1, alpha / 0.35) * 0.4 : 0, faded = share ? 1 - marked : 0;
        var dim = Math.min(1, share * 1.6) * (0.4 + 0.6 * Math.min(1, blur / 24)), mk   /* shadows on half of what is seen already read deep */ = marked * share, fd = faded * share;   // as much as the shadows are on
        // Softness is subtlety, not corners alone: round corners, faded shadows, thin type, fine lines. No shadow, heavy
        // type and thick lines keep a round interface from reading soft.
        var shSoft = share ? (faded * 2 - 1) * Math.min(1, share * 2) - (1 - Math.min(1, share * 2)) : -1;
        // Type: the family's kind; thin type reads premium, soft, serene; heavy type heavy, graphic, present.
        var fam = String(famName || '').toLowerCase();
        var kind = /mono|code|courier/.test(fam) ? ['monospace', 1] : /serif|times|georgia|garamond|playfair|merriweather|lora|baskerville|caslon|didot|bodoni|fraunces|crimson|cormorant|spectral|tiempos|freight|canela|ivar|recoleta|minion|sabon|bembo|cardo/.test(fam) && !/sans/.test(fam) ? ['serif', -0.7] : /rounded|nunito|quicksand|varela|comfortaa/.test(fam) ? ['rounded sans', -0.9] : /futura|poppins|montserrat|avenir|gotham|circular|manrope|outfit|geometric|product sans|urbanist/.test(fam) ? ['geometric sans', 0.4] : /open sans|source sans|fira sans|lato|segoe|frutiger|myriad|noto sans|calibri|gill/.test(fam) ? ['humanist sans', -0.4] : ['grotesque sans', 0.3];
        var wNums = weights.map(function (t) { var n = parseFloat(bkNow(t)); return isFinite(n) && n >= 100 && n <= 1000 ? n : null; }).filter(function (n) { return n != null; });
        var wMax = wNums.length ? Math.max.apply(null, wNums) : 400, wMin = wNums.length ? Math.min.apply(null, wNums) : 400, typeW = cl((wMax - 500) / 200);   // 400 thin-ish, 600 already thick
        // Motion: slow reads premium, fast reads a startup's agility; an overshoot adds speed.
        var ms = med(MOV.map(function (m) { return m.ms; })), over = MOV.some(function (m) { var c = String(m.ease).match(/cubic-bezier\(([^)]+)\)/); return c && c[1].split(',').map(parseFloat).some(function (n, k) { return (k === 1 || k === 3) && (n > 1 || n < 0); }); });
        var speed = ms ? cl((260 - ms) / 160) : 0;
        // Space: the middle gap and padding, against 12px; more room breathes, reads premium.
        var sp = med(BK_ALL.filter(function (t) { return /(^|\/)(spacing|gap|padding)(\/|$)/i.test(t.figma) && !/radius/i.test(t.figma); }).map(px).filter(function (n) { return n != null && n > 0 && n < 200; }));
        var airy = sp ? cl((sp / 12 - 1) * 1.5) : 0;
        var shSay = !shD.length ? 'no shadows in the system' : !shOn ? 'no shadow on' : (marked >= 0.5 ? 'marked' : 'faded') + ' shadows (blur ' + blur + 'px)';
        // Safe is the standard that commits to nothing: bold choices (thick lines, marked shadows, the heaviest type) are
        // not safe, so they take back as much of a lean to Safe as they are bold.
        var boldPick = Math.min(1, thick * 0.45 + mk * 0.45 + Math.max(0, typeW - 0.5) * 0.4), safeCut = function (v) { return v < 0 ? v * (1 - boldPick) : v; };
        // The proof in plain words: each signal on a simple scale (vivid colours, high contrast, subtle shadows), not its value.
        var P = {
          colour: function (c) { return c.sat > 0.6 ? 'vivid colours' : c.sat > 0.3 ? 'soft colours' : 'muted colours'; },
          contrast: function (c) { return c.cr >= 12 ? 'very high contrast' : c.cr >= 7 ? 'high contrast' : c.cr >= 4.5 ? 'moderate contrast' : 'low contrast'; },
          grounds: function (c) { return c.tinted > 0.25 ? 'coloured backgrounds' : c.neutral >= 0.5 ? 'neutral backgrounds' : 'tinted backgrounds'; },
          hue: function (c) { return c.warmth > 0.3 ? 'a warm hue' : c.warmth < -0.3 ? 'a cool hue' : 'a neutral hue'; },
          corners: rPx <= 2 ? 'square corners' : rPx <= 8 ? 'subtle rounding' : rPx <= 16 ? 'rounded corners' : 'very rounded corners',
          lines: line <= 1 ? 'fine lines' : line < 3 ? 'firm lines' : 'thick lines',
          shadows: !shD.length || !shOn ? 'no shadows' : marked >= 0.5 ? 'hard shadows' : share < 0.35 ? 'few, subtle shadows' : 'subtle shadows',
          type: (wMax >= 700 ? 'heavy' : wMax >= 600 ? 'strong' : wMax <= 400 ? 'light' : 'regular') + ', ' + ({ monospace: 'code-like', 'grotesque sans': 'neutral', 'geometric sans': 'geometric', 'humanist sans': 'friendly', serif: 'classic', 'rounded sans': 'rounded' }[kind[0]] || 'plain') + ' type',
          motion: !ms ? '' : over ? 'bouncy motion' : ms <= 150 ? 'quick motion' : ms <= 300 ? 'steady motion' : 'slow motion',
          space: airy > 0.3 ? 'generous space' : airy < -0.3 ? 'tight space' : 'regular space',
          palette: hueN <= 2 ? 'one accent colour' : 'a colourful palette',
          blue: function (c) { return c.blue > 0.5 ? 'a blue hue' : ''; } };
        var axes = function (c) {
          // Safe first: the standard (whites and greys, one accent, strong contrast, regular weights) commits to nothing.
          var safeV = safeCut(cl(airy * 0.25 - typeW * 0.3 - speed * 0.2 + (thick ? -thick * 0.3 : 0.05) + fd * 0.25 - mk * 0.15 + (0.5 - c.vivid) * 0.1 + (kind[0] === 'serif' ? 0.3 : kind[0] === 'geometric sans' ? 0.1 : 0) + (wMin < 400 ? 0.15 : 0) - c.crK * 0.35 - (c.pure - 0.2) * 0.4 - (c.neutral - 0.5) * 0.5 + c.tinted * 0.6 - palK * 0.2 - c.blue * 0.15 - 0.1));   // blue reads safe
          // Bold is daring: heavy outlines, hard shadows, colour on the grounds, a vivid hue; heavy type a little. A brand
          // that reads safe is not bold.
          var boldV = cl((c.vivid * 2 - 1) * 0.15 + typeW * 0.2 + thick * 0.45 + (shD.length && !shOn ? 0.1 : 0) + mk * 0.3 + c.tinted * 0.6 + c.crK * 0.1 - 0.1 + (safeV < 0 ? safeV * 0.9 : 0));
          if (safeV < 0 && boldV > 0) safeV *= 1 - boldV;
          return [
          ['Bold', 'Quiet', boldV, 'weight ' + wMax + ', ' + line + 'px lines', c.say + ', contrast ' + c.cr.toFixed(1) + ':1', [P.colour(c), P.contrast(c), P.lines, P.type, P.shadows, P.grounds(c)]],
          ['Flat', 'Dimensional', cl(1 - 2 * dim), shD.length ? (shOn ? 'shadows on ' + shOn + ' of ' + shD.length + ' parts, ' + Math.round(share * 100) + '% of where they are used, blur ' + blur + 'px' : 'no shadow on any of ' + shD.length + ' parts') : 'no shadows in the system', '', [P.shadows]],
          // Flat reads technical, and so does blue; flat with lines over 1px reads a little sharp too.
          ['Technical', 'Human', cl(kind[1] * 0.4 + (1 - 2 * soft) * 0.25 + thick * 0.25 + typeW * 0.15 + mk * 0.3 - fd * 0.15 + (1 - Math.min(1, share * 2)) * 0.15 + Math.max(0, 1 - 2 * dim) * 0.3 + c.blue * 0.15), (famName || 'its type') + ' (' + kind[0] + '), ' + line + 'px lines, ' + shSay, '', [P.type, P.blue(c), P.corners, P.lines, P.shadows]],
          ['Sharp', 'Soft', cl(-((soft * 2 - 1) * 0.25 + shSoft * 0.3 - typeW * 0.2 + (thick ? -thick : 0.3) * 0.25) + Math.max(0, 1 - 2 * dim) * thick * 0.25), rPx + 'px corners, ' + shSay + ', weight ' + wMax + ', ' + line + 'px lines', '', [P.corners, P.shadows, P.lines, P.type]],
          ['Corporate', 'Friendly', cl(-(soft * 2 - 1) * 0.3 + c.blue * 0.15 - (over ? 0.15 : 0) + (c.pure - 0.2) * 0.5 + (c.neutral - 0.5) * 0.5 - c.tinted * 0.6 + palK * 0.25 + c.crK * 0.2 + 0.1), rPx + 'px corners, ' + hueN + (hueN === 1 ? ' hue' : ' hues') + ' in the palette', 'hue ' + Math.round(c.hue) + '°, contrast ' + c.cr.toFixed(1) + ':1, ' + Math.round(c.neutral * 100) + '% of grounds neutral, ' + Math.round(c.pure * 100) + '% pure ' + (c.mode === 'dark' ? 'black' : 'white'), [P.grounds(c), P.palette, P.corners, P.contrast(c)]],
          ['Fast', 'Calm', cl(speed * 0.6 + (c.vivid - 0.5) * 0.2 + typeW * 0.15 + thick * 0.2 + mk * 0.2 + (over ? 0.15 : 0) + c.crK * 0.2 - (kind[0] === 'serif' ? 0.1 : 0)), (ms ? 'transitions ' + ms + 'ms' + (over ? ', overshoot' : '') : 'no motion tokens') + ', weight ' + wMax, 'contrast ' + c.cr.toFixed(1) + ':1', [P.motion, P.contrast(c), P.colour(c), P.lines]],
          // Premium is elegance: room, thin type, slow motion, faded shadows, hairlines, a softer contrast, quiet colour.
          // Safe is the standard that commits to nothing: the strongest contrast, regular weights and lines, the usual speed.
          ['Premium', 'Safe', safeV,
            'type ' + wMin + '–' + wMax + (sp ? ', spacing ' + sp + 'px' : '') + (ms ? ', ' + ms + 'ms' : '') + ', ' + shSay, 'contrast ' + c.cr.toFixed(1) + ':1', [P.grounds(c), P.blue(c), P.contrast(c), P.space, P.type, P.motion, P.shadows]],
          ['Warm', 'Cool', cl(c.warmth * 0.45 + rWarm * 0.3 + shSoft * 0.25), rPx + 'px corners, ' + shSay, 'primary hue ' + Math.round(c.hue) + '°', [P.hue(c), P.corners, P.shadows]]   // colour helps, but corners and soft shadows warm as much
        ]; };
        var AXM = COL.map(axes), two = AXM.length > 1;
        // Each axis leans as the modes do together; the evidence says each mode's colour where they differ.
        var AX = AXM[0].map(function (ax, k) {
          var lean = AXM.reduce(function (n, m) { return n + m[k][2]; }, 0) / AXM.length;
          var cs = AXM.map(function (m) { return m[k][4]; }), col = !cs[0] ? '' : two && cs[0] !== cs[1] ? 'in light ' + cs[0] + '; in dark ' + cs[1] : cs[0];
          var pl = AXM.map(function (m) { return m[k][5] || []; }), bits = pl[0].filter(Boolean).filter(function (b, i, a) { return a.indexOf(b) === i; });
          if (two) pl[1].forEach(function (b) { if (b && bits.indexOf(b) < 0) bits.push(b + ' in dark'); });
          return [ax[0], ax[1], lean, ax[3] + (col ? ', ' + col : ''), bits.filter(Boolean)];
        });
        // The shape: each pole 0.5 ± half its lean (opposites sum to the whole), sixteen points round the circle.
        var n = AX.length, R = 130, C = 170, lab = '', grid = '';
        [1 / 3, 2 / 3, 1].forEach(function (k) { grid += '<circle cx="' + C + '" cy="' + C + '" r="' + (R * k).toFixed(1) + '" fill="none" stroke="currentColor" stroke-opacity=".15"/>'; });
        grid += '<circle cx="' + C + '" cy="' + C + '" r="' + R / 2 + '" fill="none" stroke="currentColor" stroke-opacity=".35" class="sg-bk-pers-ring"/>';
        for (var k = 0; k < n; k++) { var a0 = (k * 180 / n - 90) * Math.PI / 180; grid += '<line x1="' + (C + Math.cos(a0) * R).toFixed(1) + '" y1="' + (C + Math.sin(a0) * R).toFixed(1) + '" x2="' + (C - Math.cos(a0) * R).toFixed(1) + '" y2="' + (C - Math.sin(a0) * R).toFixed(1) + '" stroke="currentColor" stroke-opacity=".15"/>'; }
        var topPoles = AX.map(function (ax) { return { pole: ax[2] >= 0 ? ax[0] : ax[1], k: Math.abs(ax[2]) }; }).sort(function (x, y) { return y.k - x.k; }).slice(0, 3).filter(function (x) { return x.k >= 0.1; }).map(function (x) { return x.pole; });
        var ptsOf = function (A) { var p = []; [0, 1].forEach(function (side) { A.forEach(function (ax, k) { var a = ((k * 180 / n) + side * 180 - 90) * Math.PI / 180, str = side ? 0.5 - ax[2] / 2 : 0.5 + ax[2] / 2; p.push([C + Math.cos(a) * R * str, C + Math.sin(a) * R * str]); }); }); return p; };
        [0, 1].forEach(function (side) { AX.forEach(function (ax, k) {
          var a = ((k * 180 / n) + side * 180 - 90) * Math.PI / 180, str = side ? 0.5 - ax[2] / 2 : 0.5 + ax[2] / 2;
          var lx = (C + Math.cos(a) * (R + 22)) / 340 * 100, ly = (C + Math.sin(a) * (R + 22)) / 340 * 100, lead = topPoles.indexOf(ax[side]) >= 0;
          lab += '<span class="sg-bk-pers-l' + (lead ? ' is-lead' : str >= 0.5 ? '' : ' is-faint') + '" style="left:' + lx.toFixed(1) + '%;top:' + ly.toFixed(1) + '%' + (lead ? ';color:' + esc(ac1) : '') + '">' + esc(ax[side]) + '</span>';
        }); });
        // Light: filled in the accent, solid, its points filled. Dark: on top of it, in the words' colour (never the
        // accent, which may be the same in both), dashed, its points hollow, so it shows even where the two lie close.
        var poly = function (p, dark) { var ink = dark ? 'currentColor' : esc(ac1); return '<polygon points="' + p.map(function (q) { return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' ') + '" fill="' + (dark ? 'none' : ink) + '" fill-opacity="' + (dark ? '0' : '.2') + '" stroke="' + ink + '" class="sg-bk-pers-shape' + (dark ? ' is-dark' : '') + '" vector-effect="non-scaling-stroke" stroke-linejoin="round"' + '/>' +
          p.map(function (q) { return '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="2.5" class="sg-bk-pers-dot' + (dark ? ' is-dark' : '') + '" fill="' + (dark ? 'var(--bk-card, var(--sg-bg))' : ink) + '"' + (dark ? ' stroke="currentColor" vector-effect="non-scaling-stroke"' : '') + '/>'; }).join(''); };
        // The two readings the same (no point a pixel apart): one shape, and the key says so.
        var same = two && ptsOf(AXM[0]).every(function (q, i) { var d = ptsOf(AXM[1])[i]; return Math.abs(q[0] - d[0]) < 1 && Math.abs(q[1] - d[1]) < 1; });
        var shape = two && !same ? poly(ptsOf(AXM[0])) + poly(ptsOf(AXM[1]), true) : poly(ptsOf(AXM[0]));
        var keyLine = function (dark) { return '<svg class="sg-bk-pers-kl' + (dark ? ' is-dark' : '') + '" aria-hidden="true"><line x1="0" y1="50%" x2="100%" y2="50%" stroke="' + (dark ? 'currentColor' : esc(ac1)) + '"/></svg>'; };
        var key = two ? '<div class="sg-bk-pers-h sg-bk-pers-key">' + (same ? keyLine() + 'Light and dark read the same' : keyLine() + 'Light' + keyLine(true) + 'Dark') + '</div>' : '';
        // In words: one claim (the strongest leaning, as a person would say it), the three strongest in plain words (each
        // as heavy as it leans), then the proof: each one's tokens.
        var lean = AX.map(function (ax) { return { pole: ax[2] >= 0 ? ax[0] : ax[1], k: Math.abs(ax[2]), why: ax[3], bits: ax[4] || [] }; }).sort(function (x, y) { return y.k - x.k; });
        var lc = function (w) { return w.toLowerCase(); }, list = function (xs) { return xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs.join(''); };
        // Said in the chart's own order (Bold before Friendly before Warm), so the same three read the same in every theme.
        var order = function (x) { for (var k = 0; k < AX.length; k++) if (AX[k][0] === x.pole || AX[k][1] === x.pole) return k; return 0; };
        var top3 = lean.slice(0, 3).filter(function (x) { return x.k >= 0.1; }).sort(function (x, y) { return order(x) - order(y); });
        var head = list(top3.map(function (x, i) { return i ? lc(x.pole) : x.pole; }));
        // The title: the brand defined as one would describe it (a warm and bold brand, with a retro touch and a
        // technological feel).
        var c0 = COL[0], t3 = lean.filter(function (x) { return x.k >= 0.1; }).slice(0, 3), flat = 1 - 2 * dim;
        var ADJ = { Bold: 'bold', Quiet: 'understated', Flat: 'flat', Dimensional: 'tactile', Technical: 'technical', Human: 'human', Sharp: 'sharp', Soft: 'soft',
          Corporate: 'corporate', Friendly: 'friendly', Fast: 'energetic', Calm: 'calm', Premium: 'premium', Safe: 'safe', Warm: 'warm', Cool: 'cool' };
        var FEEL = { Bold: 'bold', Quiet: 'quiet', Flat: 'clean', Dimensional: 'tactile', Technical: 'technological', Human: 'human', Sharp: 'sharp', Soft: 'soft',
          Corporate: 'corporate', Friendly: 'friendly', Fast: 'energetic', Calm: 'calm', Premium: 'premium', Safe: 'reassuring', Warm: 'warm', Cool: 'cool' };
        // Its character, from the tokens: a serif reads classic and traditional; thick lines or hard shadows read retro; soft far shadows and room, luxurious; very
        // round corners on a warm hue, playful; white and grey with one accent, polished; colour on the grounds, colourful.
        var touch = kind[0] === 'serif' ? 'with a classic, traditional touch' : mk >= 0.25 || thick >= 0.5 ? 'with a retro touch' : fd >= 0.3 && airy > 0.2 ? 'with a touch of luxury' : rPx > 16 && c0.warmth > 0.3 ? 'with a playful touch' :
          c0.tinted > 0.25 ? 'with colour to spare' : c0.neutral >= 0.5 && hueN <= 2 ? 'with a polished finish' : line <= 1 ? 'with a light hand' : '';
        var adjs = t3.slice(0, 2).map(function (x) { return ADJ[x.pole]; });
        // Simple: its two strongest leanings, the character its tokens give it, and the feel of the third.
        var feel = t3[2] ? 'a ' + FEEL[t3[2].pole] + ' feel' : '';
        var claim = !adjs.length ? 'A balanced brand' + (touch ? ', ' + touch : '') + '.' :
          (/^[aeiou]/.test(adjs[0]) ? 'An ' : 'A ') + adjs.join(' and ') + ' brand' + (touch && feel ? ', ' + touch + ' and ' + feel : touch ? ', ' + touch : feel ? ' with ' + feel : '') + '.';
        // The brand's weights, heaviest for the strongest.
        var wAt = function (i) { return weights.length ? 'font-weight:' + esc(bkCss(weights[Math.max(0, weights.length - 1 - i)])) + ';' : ''; };
        var chips = function (x) { return x.bits.slice(0, 5).map(function (t) { return '<span class="sg-bk-tick-pill">' + esc(t) + '</span>'; }).join(''); };
        var proof = top3.slice().sort(function (x, y) { return y.k - x.k; }).map(function (x, i) { return '<b style="' + fam + wAt(i) + '">' + esc(x.pole) + '</b><span>' + Math.round(x.k * 100) + '%</span><div class="sg-bk-pers-chips">' + chips(x) + '</div>'; }).join('');
        var DOES = { Bold: 'speaks up', Quiet: 'lowers its voice', Flat: 'keeps it simple', Dimensional: 'gives things weight', Technical: 'sweats the details', Human: 'tells you a story', Sharp: 'gets to the point', Soft: 'takes the edge off',
          Corporate: 'means business', Friendly: 'holds the door open', Fast: 'never keeps you waiting', Calm: 'takes its time', Premium: 'cares about the finish', Safe: 'plays it safe', Warm: 'makes you feel at home', Cool: 'keeps a cool head' };
        var said = top3.slice().sort(function (x, y) { return y.k - x.k; }).map(function (x) { return esc(DOES[x.pole] || lc(x.pole)); });   // one weight: a sentence, not a ranking
        var words = said.length ? 'It ' + (said.length > 1 ? said.slice(0, -1).join(', ') + ' and ' + said[said.length - 1] : said[0]) + '.' : '';
        PMAP = '<div class="sg-bk-bento"><div class="sg-bk-t w6 h5 sg-bk-block sg-bk-pers" ' + bg2 + ' role="group" aria-label="' + esc('Personality: ' + (head || 'balanced')) + '" data-axes="' + esc(JSON.stringify(AX.map(function (ax) { return [ax[0], ax[1], Math.round(ax[2] * 100), ax[3]]; }))) + '">' +
          '<div class="sg-bk-pers-top"><span class="sg-bk-pers-h">Personality · read from ' + BK_ALL.length + ' tokens' + (two ? ', in light and dark' : '') + '</span></div>' +
          '<div class="sg-bk-pers-body"><div class="sg-bk-pers-words">' +
          '<p class="sg-bk-pers-t" style="' + fam + strong + 'color:' + esc(ac1) + '">' + esc(claim) + '</p>' +
          (words ? '<p class="sg-bk-pers-w" style="' + fam + '">' + words + '</p>' : '') +
          '<div class="sg-bk-pers-ev">' + proof + '</div></div>' +
          '<div class="sg-bk-pers-chart" role="img" aria-label="' + esc('Personality: ' + lean.map(function (x) { return x.pole + ' ' + Math.round(x.k * 100) + '%'; }).join(', ')) + '"><svg class="sg-bk-pers-svg" viewBox="0 0 340 340" aria-hidden="true">' + grid + shape + '</svg><div class="sg-bk-pers-labs" aria-hidden="true">' + lab + '</div></div></div>' +
          key + '</div></div>';
      })(); } finally { if (fx && fxL) { if (fxWas == null) bkOut.removeAttribute(fx.attr); else bkOut.setAttribute(fx.attr, fxWas); bkMemo = {}; } }
      })();
      html += (GEO.length ? '<div class="sg-bk-bento sg-bk-bento--geo">' + GEO.join('') + '</div>' : '') + MORPH + '<div class="sg-bk-bento">' + T.join('') + '</div>' + DEPTH + ICON + PMAP;   /* typography above motion */   // the contrast pairs (PAIRS) and the charts (CHARTS) are built, kept off the page for now   // the numbers (NUMS) are built, kept off the page for now   // motion, then type, icons, surfaces, numbers and charts
      bkOut.innerHTML = html;
      dpLeadsAll(); setTimeout(dpLeadsAll, 500);
      // The type tile steps through every breakpoint, each in every weight (regular, then strong, then the next
      // breakpoint): the letters, the scale and the bars together. A breakpoint or a weight clicked holds it. Still, with
      // reduced motion: the page's own breakpoint and each sample in its own weight.
      clearInterval(bkOut._tmTimer); clearInterval(bkOut._chTimer); clearInterval(bkOut._radTimer);
      var tmT = bkOut.querySelector('.sg-bk-tm[data-tm]');
      if (tmT) {
        var TD = JSON.parse(tmT.getAttribute('data-tm')), nW = Math.max(1, TD.w.length), nB = TD.bp.length, tmHold = false;
        var tmQ = function (sel) { return tmT.querySelectorAll(sel); }, tmSet = function (sel, txt) { var e = tmT.querySelector(sel); if (e) e.textContent = txt; };
        var tmShow = function (s) {
          var bi = Math.floor(s / nW) % nB, wi = s % nW, b = TD.bp[bi], xxl = b.px[0], f = TD.F * xxl / TD.max;
          if (TD.w.length > 1) tmT.style.setProperty('--tm-w', TD.w[wi]);
          tmQ('.sg-bk-tm-bps i').forEach(function (c) { c.classList.toggle('is-on', +c.getAttribute('data-bp') === bi); });
          tmQ('.sg-bk-tm-wts i').forEach(function (c, k) { c.classList.toggle('is-on', k === wi); });
          // The letters at this breakpoint's largest size, the guides eased to where they fall.
          var aa = tmT.querySelector('.sg-bk-tm-aa'); if (aa) aa.style.fontSize = Math.round(f) + 'px';
          var put = function (cls, y, label) { var g = tmT.querySelector(clsSel(cls)); if (!g) return; g.style.transform = 'translateY(' + Math.round(y) + 'px)'; if (label) g.querySelector('text').textContent = label; };
          put('sg-tm-cap', TD.base - TD.cap * f, 'cap height  ·  ' + Math.round(TD.cap * xxl) + 'px');
          put('sg-tm-x', TD.base - TD.x * f, 'x-height  ·  ' + Math.round(TD.x * xxl) + 'px');
          put('sg-tm-lh', TD.base + (b.lh / xxl - 1) * f + f * 0.22, 'line height  ·  ' + b.lh + 'px');
          var sz = tmT.querySelector('.sg-tm-size'); if (sz) sz.textContent = sz.textContent.replace(/\d+px$/, xxl + 'px');
          // The scale at this breakpoint, a size that differs from the page's own in the hue.
          tmQ('.sg-bk-tm-row').forEach(function (r, k) { var say = r.querySelector('.sg-bk-tm-say'), px = r.querySelector('.sg-tm-px'); if (say) say.style.fontSize = b.px[k] + 'px'; if (px) { px.textContent = b.px[k]; px.classList.toggle('is-diff', b.px[k] !== TD.bp[TD.at].px[k]); } });
          var r = b.px[TD.reg] || 1, how = tmT.querySelector('.sg-tm-how'); if (how) how.innerHTML = '<b>' + Math.round(xxl / r * 10) / 10 + '×</b> the size' + (TD.dw ? ', <b>' + (TD.dw > 0 ? '+' : '') + TD.dw + '</b> weight' : '');
          // The bars grow to it; the marks show the same size in the other breakpoints.
          tmQ('.sg-bk-tm-cols > span').forEach(function (col) { var k = +col.getAttribute('data-k'), i = col.querySelector('i'); if (i) i.style.height = Math.round(b.px[k] / TD.max * 100) + '%'; col.querySelectorAll('s').forEach(function (m) { m.hidden = +m.getAttribute('data-bp') === bi; }); });
          tmSet('.sg-tm-min', b.px[b.px.length - 1]); tmSet('.sg-tm-max', xxl);
        };
        var tmStep = TD.at * nW;
        tmQ('.sg-bk-tm-bps i').forEach(function (c) { var go = function () { tmHold = true; tmStep = +c.getAttribute('data-bp') * nW + tmStep % nW; tmShow(tmStep); }; c.addEventListener('click', go); c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
        tmQ('.sg-bk-tm-wts i').forEach(function (c, k) { var go = function () { tmHold = true; tmStep = Math.floor(tmStep / nW) * nW + k; tmShow(tmStep); }; c.addEventListener('click', go); c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { tmShow(tmStep); if (nB * nW > 1) bkOut._tmTimer = setInterval(function () { if (tmHold || sgQuiet()) return; tmStep = (tmStep + 1) % (nB * nW); tmShow(tmStep); }, 1800); }
      }
      // The depth view, always exploded, steps through its layers as the type drawing steps: the one in focus lit, its
      // name and line in the hue, its shadow's tokens below; a name picked holds it. Still, with reduced motion: the top.
      clearInterval(bkOut._dpTimer);
      var dpIso = bkOut.querySelector('.sg-bk-dp-iso');
      // Where the stack sits: centred in the view while no layer is in focus; with one, centred in what the layer's text
      // below leaves, so the text has its room. Measured from the planes as drawn, moved by the difference.
      var dpPlace = function () {
        var st = dpIso && dpIso.querySelector('.sg-bk-dp-stack'); if (!st) return;
        var ir = dpIso.getBoundingClientRect(); if (!ir.height) return;
        var ps = Array.prototype.map.call(dpIso.querySelectorAll('.sg-bk-dp-plane'), function (x) { return x.getBoundingClientRect(); }).filter(function (r) { return r.height; });
        if (!ps.length) return;
        var top = Math.min.apply(null, ps.map(function (r) { return r.top; })), bot = Math.max.apply(null, ps.map(function (r) { return r.bottom; }));
        var tr = getComputedStyle(st).translate, cur = tr && tr !== 'none' ? parseFloat(tr.split(' ')[1] || '0') || 0 : 0;
        var spec = dpIso.hasAttribute('data-focus') ? dpIso.querySelector('.sg-bk-dp-spec:not([hidden])') : null;
        var room = spec ? spec.getBoundingClientRect().height + (parseFloat(getComputedStyle(dpIso).getPropertyValue('--sg-space-l')) || 0) : 0;
        var want = Math.max(ir.top, ir.top + (ir.height - room - (bot - top)) / 2);   // never cut at the top, where the view is too short for both
        var tx = tr && tr !== 'none' ? tr.split(' ')[0] : '0px';
        st.style.translate = tx + ' ' + Math.round(cur + want - top) + 'px';   // up and down only: across is the centring's
      };
      if (dpIso && typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { dpPlace(); }).observe(dpIso);
      if (dpIso) {
        var dpFocus = function (z) {
          bkOut._dpFocus = z;
          if (z == null || z < 0) dpIso.removeAttribute('data-focus'); else dpIso.setAttribute('data-focus', z);
          dpIso.querySelectorAll('.sg-bk-dp-plane').forEach(function (p) { p.classList.toggle('is-on', +p.getAttribute('data-z') === z); });
          dpIso.querySelectorAll('.sg-bk-dp-call').forEach(function (c) { c.classList.toggle('is-on', +c.getAttribute('data-z') === z); });
          dpIso.querySelectorAll('.sg-bk-dp-spec').forEach(function (t) { t.hidden = +t.getAttribute('data-z') !== z; });
          if (dpSc) { if (z == null || z < 0) dpSc.removeAttribute('data-focus'); else dpSc.setAttribute('data-focus', z); dpSc.querySelectorAll(':scope > i').forEach(function (i) { i.classList.toggle('is-on', +i.getAttribute('data-z') === z); }); }
          dpLeads(dpIso);
          dpPlace();
        };
        // The preview and the exploded view are one: a surface clicked in either picks its layer in both (the page
        // itself, a click on the preview between its surfaces), and holds it.
        var dpSc = bkOut.querySelector('.sg-bk-dp-scene');
        var dpPick = function (z) { var again = bkOut._dpHold && bkOut._dpFocus === z; bkOut._dpHold = true; dpFocus(again ? -1 : z); };   /* the same one again lets it go: every layer shown */
        if (dpSc) dpSc.addEventListener('click', function (e) { var i = e.target.closest && e.target.closest('.sg-bk-dp-scene > i'); dpPick(i ? +i.getAttribute('data-z') : 0); });
        // A click anywhere but on a name shows every layer at once, and holds it so.
        dpIso.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.sg-bk-dp-call')) return; var i = e.target.closest && e.target.closest('.sg-bk-dp-plane > i'); if (i) { dpPick(+i.parentNode.getAttribute('data-z')); return; } bkOut._dpHold = true; dpFocus(-1); });
        dpIso.querySelectorAll('.sg-bk-dp-call').forEach(function (c) { var go = function () { bkOut._dpHold = true; dpFocus(+c.getAttribute('data-z')); }; c.addEventListener('click', go); c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }); });
        dpFocus(bkOut._dpFocus != null ? bkOut._dpFocus : 6);
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) bkOut._dpTimer = setInterval(function () { if (bkOut._dpHold || sgQuiet()) return; dpFocus(((bkOut._dpFocus != null ? bkOut._dpFocus : 6) + 6) % 7); }, 1800);
      }
      // The type drawing's scale, kept as it is resized, so its labels stay the kit's label size however large the letters.
      var tmSvg = bkOut.querySelector('.sg-bk-tm-svg');
      if (bkOut._tmRO) bkOut._tmRO.disconnect();
      if (tmSvg) {
        var tmK = function () { var c = tmSvg.getScreenCTM && tmSvg.getScreenCTM(); if (c && c.a > 0) tmSvg.style.setProperty('--tm-k', c.a.toFixed(3)); };
        tmK(); if (window.ResizeObserver) { bkOut._tmRO = new ResizeObserver(tmK); bkOut._tmRO.observe(tmSvg); }
      }
      // Radius and border: one loop through the components, the three cards following it (still, with reduced motion,
      // until a corner or a tile is picked). In the first card the outline glides to the component's size and radius,
      // its corner's lines and r following; in the second its corner grows from square to its radius, its construction
      // drawn while it moves and drawn back after; in the third the hue runs round its tiles' edges, one after another.
      var rlSvg = bkOut.querySelector('.sg-bk-rl-draw');
      if (rlSvg) {
        var rlC = JSON.parse(rlSvg.getAttribute('data-c') || '{}'), rlLoop = JSON.parse(rlSvg.getAttribute('data-loop') || '[]'), rz = rlSvg.getAttribute('data-ease').split(',').map(Number), rms = Number(rlSvg.getAttribute('data-ms')) || 500, rlStill = matchMedia('(prefers-reduced-motion: reduce)').matches;
        // The easing's curve solved for its progress at a time (the cubic-bezier the brand writes).
        var bez = function (t) { var cx = 3 * rz[0], bx = 3 * (rz[2] - rz[0]) - cx, ax = 1 - cx - bx, cy = 3 * rz[1], by = 3 * (rz[3] - rz[1]) - cy, ay = 1 - cy - by, u = t, k;
          for (k = 0; k < 8; k++) { var xu = ((ax * u + bx) * u + cx) * u - t, d = (3 * ax * u + 2 * bx) * u + cx; if (Math.abs(xu) < 1e-4 || !d) break; u -= xu / d; }
          return ((ay * u + by) * u + cy) * u; };
        var q = function (s) { return rlSvg.querySelector(s); }, lit = q('.sg-bk-rl-lit'), rv = q('.sg-rv'), rh = q('.sg-rh'), rc = q('.sg-rc'), rl = q('.sg-rl'), rd = q('.sg-rd'), rt = q('.sg-rt');
        var set = function (el, o) { if (el) for (var k in o) el.setAttribute(k, o[k]); };
        var rDraw = function (b) { var cx = b[0] + b[4], cy = b[1] + b[4];
          set(lit, { x: b[0], y: b[1], width: b[2], height: b[3], rx: b[4] }); set(rv, { x1: cx, x2: cx }); set(rh, { y1: cy, y2: cy }); set(rc, { cx: cx, cy: cy, r: Math.max(0.01, b[4]) });
          set(rl, { x1: cx, y1: cy, x2: cx - b[4] * 0.7071, y2: cy - b[4] * 0.7071 }); set(rd, { cx: cx, cy: cy }); set(rt, { x: cx + 10, y: cy + 20 }); };
        var rCur = (rlC[rlLoop[0]] || {}).b.slice(), tween = function (ms, step, done) { if (rlStill) { step(1); if (done) done(); return; } var t0 = performance.now(); (function f(now) { var p = Math.min(1, (now - t0) / ms); step(bez(p)); if (p < 1) requestAnimationFrame(f); else if (done) done(); })(t0); };
        var crArc = function (R) { return 'M8 96 V' + (8 + R) + (R ? ' A' + R + ' ' + R + ' 0 0 1 ' + (8 + R) + ' 8' : '') + ' H96'; };
        var conAt = function (con, R, k, a) { var c = 8 + R, e = R * 0.7071 * k; con.innerHTML = R > 1 ? '<line class="sg-bk-geo-ink" x1="' + c + '" y1="' + c + '" x2="' + (c - e) + '" y2="' + (c - e) + '"/><circle class="sg-bk-geo-dot" cx="' + c + '" cy="' + c + '" r="2"/><circle class="sg-bk-geo-dot" cx="' + (c + Math.cos(a) * R * (k < 1 ? k : 1)) + '" cy="' + (c + Math.sin(a) * R * (k < 1 ? k : 1)) + '" r="' + (2.4 * k) + '"/>' : ''; };
        var grow = function (fig) { var path = fig.querySelector('.sg-bk-cr-a'), con = fig.querySelector('.sg-bk-cr-con'), R = Math.min(Number(fig.getAttribute('data-r')) * 3, 86);
          path.style.animation = 'none';
          tween(900, function (e) { path.setAttribute('d', crArc(R * e)); if (!rlStill) conAt(con, R * e, 1, Math.PI * (1 + 0.25 * e)); }, function () {
            if (rlStill) return; setTimeout(function () { var t0 = performance.now(); (function f(now) { var p = Math.min(1, (now - t0) / 700), k = 1 - bez(p); con.style.opacity = k; conAt(con, R, k, Math.PI * 1.25); if (p < 1) requestAnimationFrame(f); else { con.innerHTML = ''; con.style.opacity = ''; } })(t0); }, 500); }); };
        // Shown at once (now: the page drawn again for another theme or mode, so the change between them reads), or moved to.
        var show = function (n, now) { var c = rlC[n]; if (!c) return;
          var from = rCur.slice(); if (rt) rt.textContent = 'r = ' + c.r; lit.setAttribute('class', 'sg-bk-rl-line sg-bk-rl-lit' + (c.on ? '' : ' is-off'));
          if (now) { rCur = c.b.slice(); rDraw(rCur); bkOut.classList.add('sg-bk-rl-now'); setTimeout(function () { bkOut.classList.remove('sg-bk-rl-now'); }, 60); }
          else tween(rms + 200, function (e) { for (var k = 0; k < 5; k++) rCur[k] = from[k] + (c.b[k] - from[k]) * e; rDraw(rCur); });
          bkOut.querySelectorAll('.sg-bk-cr[data-k]').forEach(function (f) { var on = f.getAttribute('data-k') === n; f.classList.toggle('is-lit', on); if (on && !now) grow(f); });
          bkOut.querySelectorAll('.sg-bk-rl-gh').forEach(function (g) { g.classList.toggle('is-lit', g.getAttribute('data-k') === n); });
          var k = 0; bkOut.querySelectorAll('.sg-bk-tl').forEach(function (t) { var on = t.getAttribute('data-k') === n; t.style.setProperty('--d', on ? (k++ * 0.12) + 's' : '0s'); t.classList.toggle('is-lit', on); });
          bkOut.querySelectorAll('.sg-bk-rl-cap').forEach(function (cap) { var v = c.cap[Number(cap.getAttribute('data-i'))]; cap.children[0].textContent = v[0]; cap.children[1].textContent = v[1]; cap.children[2].textContent = v[2]; });
        };
        var rAt = Math.max(0, rlLoop.indexOf(bkOut._rlNow)); if (bkOut._rlHold && !rlC[bkOut._rlHold]) bkOut._rlHold = null;
        bkOut.querySelectorAll('.sg-bk-cr[data-k], .sg-bk-tl, .sg-bk-rl-gh').forEach(function (el) { el.addEventListener('click', function () { var n = el.getAttribute('data-k'); bkOut._rlHold = bkOut._rlHold === n ? null : n; if (bkOut._rlHold) show(n); }); });
        show(bkOut._rlHold || rlLoop[rAt], true); bkOut._rlNow = rlLoop[rAt];
        if (!rlStill) bkOut._radTimer = setInterval(function () { if (bkOut._rlHold || sgQuiet()) return; rAt = (rAt + 1) % rlLoop.length; bkOut._rlNow = rlLoop[rAt]; show(rlLoop[rAt]); }, Math.max(2600, rms * 5));
      }
      // The charts take a new sample on a loop, each part easing to it in the brand's motion (still, with reduced motion).
      var chRoot = bkOut.querySelector('.sg-bk-charts');
      if (chRoot && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        var chRand = function (n, lo) { var r = [], i; for (i = 0; i < n; i++) r.push(lo + Math.random() * (100 - lo)); return r; };
        var chCycle = function () {
          var pie = chRoot.querySelector('.sg-bk-pie');
          if (pie) {
            var cs = pie.querySelectorAll('circle'), ls = pie.querySelectorAll('line'), w = chRand(cs.length, 30), sum = w.reduce(function (a, b) { return a + b; }, 0), C = Number(pie.getAttribute('data-c')), acc = 0;
            cs.forEach(function (c, i) { var len = C * w[i] / sum; c.style.strokeDasharray = len.toFixed(1) + ' ' + C.toFixed(1); c.style.strokeDashoffset = (-acc).toFixed(1); if (ls[i]) ls[i].style.transform = 'rotate(' + (acc / C * 360).toFixed(1) + 'deg)'; acc += len; });
            var mid = chRoot.querySelector('.sg-bk-ch-mid'); if (mid) mid.textContent = Math.round(w[0] / sum * 100) + '%';
          }
          var cols = chRoot.querySelectorAll('.sg-bk-ch-cols > span');
          if (cols.length) { var hs = chRand(cols.length, 20), top = hs.indexOf(Math.max.apply(null, hs)); cols.forEach(function (c, i) { c.querySelector('i').style.height = Math.round(hs[i]) + '%'; c.classList.toggle('is-sel', i === top); }); }
          chRoot.querySelectorAll('.sg-bk-ch-bars > span').forEach(function (r) { var v = Math.round(10 + Math.random() * 85); r.querySelector('i').style.width = v + '%'; r.querySelector('b').textContent = v + '%'; });
        };
        bkOut._chTimer = setInterval(function () { if (!sgQuiet()) chCycle(); }, Number(chRoot.getAttribute('data-loop')) || 3000);
      }
      if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) Array.prototype.forEach.call(bkOut.querySelectorAll('[data-bk-count]'), function (el) {
        var end = +el.getAttribute('data-bk-count'), t0 = null, step = function (t) { t0 = t0 || t; var p = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
        requestAnimationFrame(step);
      });
    };
    var bkRun = lazyDraw(bk, bkDraw); DRAWERS.push(bkRun); bkRun();
  }
  if (ALL_TOKENS.length) {
    hr(); foundationLink('tokens', 'tokens');
    var tk = section('tokens', 'Foundations', 'Tokens', null);
    // Only the collections Figma has: a token whose collection the capture did not keep is in none (All collections lists it).
    var tkCollOf = function (t) { return t.collection || ''; };
    // Each token's modes and values: Figma's own when the page has them (breakpoints from the smallest screen up), else
    // read where they are drawn (a colour in each colour mode, any other at each breakpoint).
    var tkRows = (function () {
      var cm = colourModes(), sm = sizeModes(), one = [{ label: 'Value', set: function (el) { return el; } }];
      if (!cm.length) cm = one; if (!sm.length) sm = one;
      var probe = document.createElement('div'); tk.appendChild(probe);
      var rows = ALL_TOKENS.map(function (t) {
        var labels, values;
        if (t.modes) {
          var idx = t.modes.map(function (m, i) { return i; });
          if (t.modes.every(function (m) { return TK_SCREEN.indexOf(String(m).toLowerCase()) >= 0; })) idx.sort(function (x, y) { return TK_SCREEN.indexOf(String(t.modes[x]).toLowerCase()) - TK_SCREEN.indexOf(String(t.modes[y]).toLowerCase()); });
          labels = idx.map(function (i) { return t.modes[i]; }); values = idx.map(function (i) { return t.values[i]; });
          var aliases = t.aliases ? idx.map(function (i) { return t.aliases[i]; }) : null;
          if (labels.length === 1 && /^Mode \d+$/i.test(String(labels[0]))) labels = ['Value'];   // Figma's default name for a collection's only mode: its value, plainly
        } else {
          var modes = t.type === 'colour' ? cm : sm;
          labels = modes.map(function (m) { return m.label; });
          values = modes.map(function (m) { return t.type === 'colour' ? hexOf(backgroundIn(probe, m, t.var)) : (sizedValue(probe, m.set, t.var) || t.value || ''); });
        }
        return { t: t, coll: tkCollOf(t), path: String(t.figma).split('/'), labels: labels, values: values, aliases: (t.modes && aliases) || null };
      });
      probe.remove(); return rows;
    })();
    var TK_COLLS = []; tkRows.forEach(function (r) { if (r.coll && TK_COLLS.indexOf(r.coll) < 0) TK_COLLS.push(r.coll); });
    // A collection's columns: the modes its tokens have (one with a single value shows it under each).
    // A collection's columns: its modes by name, one mode named too (fr-FR); "Value" only for tokens with no mode at all.
    var tkModesOf = function (rows) { var m = rows.reduce(function (m, r) { return r.labels.length > m.length ? r.labels : m; }, []); return m.length ? m : ['Value']; };
    // What kind of token it is, as Figma marks it: a colour, a number, a string, a boolean, a timing or an easing.
    var tkKind = function (r) {
      var v = String(r.values[0] == null ? '' : r.values[0]).trim(), n = String(r.t.figma || '');
      if (/^(true|false)$/i.test(v)) return 'boolean';
      if (/^(#[0-9a-f]{3,8}|rgba?\(.+\))$/i.test(v)) return 'colour';
      if (/easing|timing-?function|timming-?function|bezier/i.test(n) || /cubic-bezier|^\[object/i.test(v)) return 'easing';
      if (/duration|delay/i.test(n) || /^[\d.]+m?s$/.test(v)) return 'timing';
      return /^-?[\d.]+(px|%|rem|em)?$/.test(v) ? 'number' : 'text';
    };
    var tkIcon = function (body) { return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>'; };
    var TK_MARK = {
      number: tkIcon('<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M7 5.2 6.2 10.8M9.8 5.2 9 10.8M5.2 7h5.8M4.9 9h5.8"/>'),
      text: tkIcon('<rect x="2.5" y="2.5" width="11" height="11" rx="2.5"/><path d="M5.5 5.5h5M8 5.5v5.2M7 10.7h2"/>'),
      boolean: tkIcon('<rect x="1.5" y="4.5" width="13" height="7" rx="3.5"/><circle cx="5" cy="8" r="1.8"/>'),
      timing: tkIcon('<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.2l2.2 1.4"/>'),
      easing: tkIcon('<path d="M3 13c4.5 0 4-10 10-10"/>')
    };
    var TK_FILTER_MARK = '<svg class="sg-dd-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3"/></svg>';   // the Status filters' own mark
    var TK_PALETTE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5a5.5 5.5 0 0 0 0 11c.8 0 1.2-.6 1.2-1.2 0-.7-.5-1-.5-1.6 0-.6.5-1.1 1.1-1.1h1.3a2.9 2.9 0 0 0 2.9-2.9C14 4.7 11.3 2.5 8 2.5Z"/><circle cx="5.2" cy="7.6" r=".6"/><circle cx="6.8" cy="5.2" r=".6"/><circle cx="9.6" cy="5.2" r=".6"/></svg>';
    // The Status table's own arrow (it opens what it points at), and the menu's chevron for a group that opens.
    var TK_GO = '<svg class="sg-link-go" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11 11 5M6 5h5v5"/></svg>';
    var TK_CHEV = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"/></svg>';
    var tkOpen = {};   // the groups opened by their chevron
    var TK_ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
    // A token's details in a panel from the right, as the Status table opens a component: what it is, its code name, its
    // values in each mode, and the components that use it. Simple, one screen.
    var openTokenPanel = function (name, from) {
      var r = tkRows.find(function (x) { return x.t.figma === name; }); if (!r) return;
      openTokenPanel._name = name;
      var m = document.getElementById('sg-tk-panel');
      if (!m) {
        m = document.createElement('div'); m.id = 'sg-tk-panel'; m.className = 'sg-comp-panel sg-comp-panel--narrow'; m.hidden = true;
        m.innerHTML = '<div class="sg-comp-panel-scrim" data-panel-close></div><div class="sg-comp-panel-box" role="dialog" aria-modal="true" aria-label="Token details" tabindex="-1"><button type="button" class="sg-btn sg-comp-panel-close" data-panel-close aria-label="Close">' + MX_COLLAPSE + '</button><div class="sg-tk-detail"></div></div>';
        (document.querySelector('.sg-layout') || document.body).appendChild(m);
        var shut = function () { m._open = false; m.classList.remove('is-open'); document.documentElement.classList.remove('sg-panel-open'); setTimeout(function () { if (!m._open) m.hidden = true; }, 200); if (m._from && document.contains(m._from)) m._from.focus(); };
        m.addEventListener('click', function (e) {
          var cp = e.target.closest('.sg-tk-copy'); if (cp) { copyText(cp.getAttribute('data-copy-text'), cp, null); return; }
          // A component's whole row opens it, as a Status row does.
          var alias = e.target.closest('.sg-tk-detail .sg-tk-alias'); if (alias) { openTokenPanel(alias.getAttribute('data-alias'), m._from); return; }
          var urow = e.target.closest('.sg-tk-users tr.is-link'); if (urow && !e.target.closest('a')) { var go = urow.querySelector('a.sg-mx-go'); if (go) { location.hash = go.getAttribute('href'); shut(); return; } }
          if (e.target.closest('[data-panel-close]') || e.target.closest('.sg-tk-detail a[href^="#c-"]')) shut();
        });
        m.addEventListener('keydown', function (e) { if (e.key === 'Escape' && e.isTrusted) { e.stopPropagation(); shut(); } });
      }
      var u = usesOf(r.t.var, r.t.figma), comps = [];
      (u.direct || []).forEach(function (n) { if (comps.indexOf(n) < 0) comps.push(n); });
      (u.via || []).forEach(function (x) { if (comps.indexOf(x.name) < 0) comps.push(x.name); });
      comps.sort();
      var row = function (k, v) { return v ? '<div><dt>' + esc(k) + '</dt><dd>' + v + '</dd></div>' : ''; };
      // Its values as the main table shows them: one row, each mode a column, in the theme chosen on the page.
      var vals = '<div class="pg-par-scroll"><table class="pg-par-table sg-tk-vals"><thead><tr>' + r.labels.map(function (l) { return '<th scope="col">' + esc(l) + '</th>'; }).join('') + '</tr></thead><tbody><tr>' +
        r.labels.map(function (l, i) { return tkCell(r, l, i); }).join('') + '</tr></tbody></table></div>';
      var det = m.querySelector('.sg-tk-detail');
      det.innerHTML = sidePanelPage({ crumbs: trailHere(from).concat([r.coll || 'Tokens']).concat(r.path.slice(0, -1)), title: r.path[r.path.length - 1], sub: r.t.figma, body:
        // What it is, in a card's table as every part of a panel is: what it styles, its name in the code, what it is for.
        '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">Token</div><table class="pg-par-table sg-tk-facts"><tbody>' + [['What it styles', esc(TYPE_LABEL[r.t.type] || r.t.type)], ['In the code', r.t.var ? '<span class="sg-tk-code-line"><code>' + esc(r.t.var) + '</code><button type="button" class="sg-token-link sg-tk-copy" data-copy-text="' + esc(r.t.var) + '">Copy</button></span>' : '<span class="pg-missing">Not in the code</span>'], ['What it is for', r.t.description ? esc(r.t.description) : '<span class="pg-missing">Not written yet</span>']].map(function (x) { return '<tr><th scope="row">' + esc(x[0]) + '</th><td>' + x[1] + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">Values</div>' + vals + '</div>' +
        '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">Used by ' + plural(comps.length, 'component', 'components') + '</div>' + usersTable(comps) + '</div>' });
      m._from = from || null; m.hidden = false; m._open = true; document.documentElement.classList.add('sg-panel-open');
      panelHeads(m);   // its tables' heads stuck under the panel's head as it scrolls
      requestAnimationFrame(function () { requestAnimationFrame(function () { if (m._open) m.classList.add('is-open'); }); });
      m.querySelector('.sg-comp-panel-box').focus({ preventScroll: true });
    };
    var state = { coll: '', group: '', kind: '', q: '' };
    // From the address: #tokens?collection=Theme&group=advanced/button&show=colour&q=gap.
    (function () { var i = location.hash.indexOf('?'); if (location.hash.indexOf('#tokens') !== 0 || i < 0) return; var q = new URLSearchParams(location.hash.slice(i + 1)); state.coll = q.get('collection') || ''; state.group = q.get('group') || ''; state.kind = q.get('show') || ''; state.q = q.get('q') || ''; })();
    var tkLink = function () {
      if (location.hash.indexOf('#tokens') !== 0) return;
      var q = []; if (state.coll) q.push('collection=' + encodeURIComponent(state.coll)); if (state.group) q.push('group=' + encodeURIComponent(state.group)); if (state.kind) q.push('show=' + encodeURIComponent(state.kind)); if (state.q) q.push('q=' + encodeURIComponent(state.q));
      var h = '#tokens' + (q.length ? '?' + q.join('&') : ''); if (h !== location.hash) history.replaceState(null, '', h);
    };
    var box = document.createElement('div'); box.className = 'sg-tk';
    // The side list, as Figma's panel: its collections, then the chosen one's groups.
    box.innerHTML = '<nav class="sg-tk-side" aria-label="Collections and groups"><div class="sg-tk-label">Collections' + countHTML(tkRows.length) + '</div><div class="sg-tk-colls-side"></div><div class="sg-tk-label">Groups</div><div class="sg-tk-groups"></div></nav>' +
      '<div class="sg-tk-main"><div class="sg-tk-tables"></div></div>';
    tk.appendChild(box);   // no chips above: the collections are in the side list, the foundations have their own pages
    var sideColls = box.querySelector('.sg-tk-colls-side'), sideGroups = box.querySelector('.sg-tk-groups'), tables = box.querySelector('.sg-tk-tables');
    // The side list's height, kept on the table's column as it changes (a group opened, a collection chosen): see .sg-tk-main.
    (function () { var side = box.querySelector('.sg-tk-side'), main = box.querySelector('.sg-tk-main'); if (!window.ResizeObserver) return; new ResizeObserver(function () { main.style.setProperty('--tk-side-h', side.offsetHeight + 'px'); }).observe(side); })();
    var matches = function (r, ignore, also) {
      if (ignore !== 'coll' && state.coll && r.coll !== state.coll) return false;
      if (ignore !== 'group' && also !== 'group' && state.group && (r.path.slice(0, -1).join('/') + '/').indexOf(state.group + '/') !== 0) return false;
      if (ignore !== 'kind' && state.kind && r.t.type !== state.kind) return false;
      if (state.q) { var q = state.q.toLowerCase(); if (String(r.t.figma).toLowerCase().indexOf(q) < 0 && String(r.t.var || '').toLowerCase().indexOf(q) < 0) return false; }
      return true;
    };
    var item = function (cls, attrs, label, n, on, depth) { return '<button type="button" class="sg-tk-item ' + cls + '"' + attrs + ' aria-pressed="' + on + '"' + (depth ? ' style="padding-left:calc(var(--sg-space-m) + ' + depth + ' * var(--sg-space-m))"' : '') + '><span>' + esc(label) + '</span>' + countHTML(n) + '</button>'; };   // its count in the chips' own badge
    // The tables of a list of tokens: one a collection, its modes as columns, its tokens under a row naming their group
    // (spacing / gap). The Tokens page and every foundation page show them so.
    // Figma's own order: its groups in the order Figma lists them (where each first appears), level by level, and the
    // tokens in each as Figma lists them (neutral1000 to neutral000 stays so). Never alphabetical.
    // How tall the modes' row is, so a group's row sticks right under it.
    var tkHeadRoom = function (root) {
      var set = function () { Array.prototype.forEach.call(root.querySelectorAll('.sg-tk-table'), function (t) { var h = t.querySelector('thead tr'); if (h && h.offsetHeight) t.style.setProperty('--tk-colhead-h', stuckH(h) + 'px'); }); };
      set(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(set);
    };
    var tkFigmaOrder = function (paths) {
      var first = {};
      paths.forEach(function (p, n) { for (var d = 1; d <= p.length; d++) { var k = p.slice(0, d).join('/'); if (!(k in first)) first[k] = n; } });
      var key = function (p) { var k = []; for (var d = 1; d <= p.length; d++) k.push(first[p.slice(0, d).join('/')]); return k; };
      return function (a, b) { var x = key(a), y = key(b); for (var i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) return x[i] - y[i]; return x.length - y.length; };
    };
    // A token's value for the brand chosen in the page's switch, in a mode (Light, Phone…): read where the brand's values
    // apply, on a probe carrying that mode. With the system's own values (no brand), Figma's stand.
    var tkProbes = {};   // one probe for each mode, its computed style read for every token (one style pass a mode)
    // One value cell, as the main table and a token's details both draw it: its value in the chosen theme (Figma's own
    // where it has none), a colour's swatch, and a token that points at another shows it, as Figma does (its name in a
    // pill, its value as its title).
    var tkCell = function (r, label, at, attrs) {
      var v = tkBrandValue(r, label) || r.values[at], al = r.aliases && r.aliases[at];
      v = v == null ? '' : String(v);
      var sw = /^(#[0-9a-f]{3,8}|rgba?\(.+\))$/i.test(v) ? '<span class="sg-token-swatch" style="background:' + esc(v) + '"></span>' : '';
      if (al) return '<td class="sg-token-value"' + (attrs || '') + '><button type="button" class="sg-link-pill sg-tk-alias" data-alias="' + esc(al) + '" title="' + esc(al + (v ? '\n' + v : '')) + '">' + (sw || '<span class="sg-tk-mark" aria-hidden="true">' + (TK_MARK[tkKind(r)] || '') + '</span>') + '<span class="sg-link-words">' + esc(al) + '</span>' + TK_GO + '</button></td>';
      return '<td class="sg-token-value"' + (attrs || '') + '>' + (sw ? sw + ' ' : '') + esc(v) + '</td>';
    };
    var tkBrandValue = function (r, label) {
      if (!r.t.var || !document.documentElement.getAttribute('data-brand')) return null;
      var pr = tkProbes[label];
      if (!pr) {
        var el = document.createElement('span'); el.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
        AXES.forEach(function (a) { if (!a.attr || a.classes) return; var v = (a.values || []).filter(function (x) { return String(x.label).toLowerCase() === String(label).toLowerCase(); })[0]; if (v && v.value) el.setAttribute(a.attr, v.value); });
        tk.appendChild(el); pr = tkProbes[label] = { el: el, cs: getComputedStyle(el) };
      }
      var raw = pr.cs.getPropertyValue(r.t.var).trim(); if (!raw) return null;
      if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw.toLowerCase();
      if (/^rgba?\(/i.test(raw)) return hexOf(raw);
      var colour = /^(#[0-9a-f]{3,8}|rgba?\()/i.test(String((r.values || [])[0] || ''));
      if (colour) { pr.el.style.color = raw; var c = getComputedStyle(pr.el).color; pr.el.style.color = ''; return hexOf(c); }   // a colour written otherwise (color-mix…): the browser's reading
      return raw;
    };
    var tkTablesHTML = function (shown) {
      var colls = TK_COLLS.concat(['']).filter(function (c) { return shown.some(function (r) { return r.coll === c; }); });
      // One table: each collection opens on a row naming it and its modes, the widest collection setting the columns.
      var cols = colls.reduce(function (n, c) { return Math.max(n, tkModesOf(shown.filter(function (r) { return r.coll === c; })).length); }, 1);
      var many = colls.length > 1;
      var sections = colls.map(function (c, ci) {
        var rows = shown.filter(function (r) { return r.coll === c; }), modes = tkModesOf(rows), last = null, body = '';
        // A collection with fewer modes spreads them over the columns, so its values get the same room.
        var span = function (i) { var n = Math.floor(cols / modes.length) + (i < cols % modes.length ? 1 : 0); return n > 1 ? ' colspan="' + n + '"' : ''; };
        var byFigma = tkFigmaOrder(rows.map(function (r) { return r.path; }));
        rows.slice().sort(function (x, y) { return byFigma(x.path, y.path); }).forEach(function (r) {
          var g = r.path.slice(0, -1);
          // The group's path, each part opening that folder (advanced / cardTile / background).
          var part = function (i) { return '<button type="button" class="sg-tk-crumb" data-goto-coll="' + esc(c) + '" data-goto-group="' + esc(g.slice(0, i + 1).join('/')) + '">' + (i === g.length - 1 ? '<b>' + esc(g[i]) + '</b>' : esc(g[i])) + '</button>'; };
          if (g.join('/') !== last) { last = g.join('/'); body += '<tr class="sg-tk-group"><th scope="rowgroup" colspan="' + (cols + 2) + '">' + (g.length ? g.map(function (x, i) { return part(i); }).join(' / ') : '<b>' + esc(c || 'Tokens') + '</b>') + '</th></tr>'; }
          // Before its name, what kind of token it is, as Figma marks it (a colour's swatches are in its modes' columns).
          var kind = tkKind(r), mark = '<span class="sg-tk-mark" aria-hidden="true">' + (kind === 'colour' ? TK_PALETTE : TK_MARK[kind]) + '</span>';
          body += '<tr data-token="' + esc(r.t.figma) + '"><td><span class="sg-tk-name">' + mark + '<span class="sg-tk-names">' + esc(r.path[r.path.length - 1]) + '</span></span></td>' + modes.map(function (m, i) {
            return tkCell(r, modes[i], r.labels.length === modes.length ? i : 0, span(i));
          }).join('') + '<td class="sg-tk-open-cell"><button type="button" class="sg-mx-go" data-detail="' + esc(r.t.figma) + '" aria-label="Details of ' + esc(r.t.figma) + '">' + TK_ARROW + '</button></td></tr>';
        });
        var headRow = '<tr' + (ci ? ' class="sg-tk-collhead"' : '') + '><th scope="col" class="sg-token-name-col">' + (many ? '<b>' + esc(c || 'No collection read yet') + '</b> <span class="sg-tk-n">' + rows.length + '</span>' : 'Name') + '</th>' +
          modes.map(function (m, i) { return '<th scope="col"' + span(i) + '>' + esc(m) + '</th>'; }).join('') + '<th scope="col" class="sg-tk-open-cell"><span class="sg-hidden-text">Details</span></th></tr>';
        return { head: headRow, body: body };
      });
      var title = many ? plural(shown.length, 'token', 'tokens') + '  ·  ' + plural(colls.length, 'collection', 'collections') : esc(colls[0] || 'No collection read yet') + '  ·  ' + plural(shown.length, 'token', 'tokens');
      return '<div class="pg-inspect sg-token-card sg-tk-table"><div class="pg-inspect-head">' + title + '</div><table><thead>' + sections[0].head + '</thead>' +
        sections.map(function (x, i) { return '<tbody>' + (i ? x.head : '') + x.body + '</tbody>'; }).join('') + '</table></div>';
    };
    var draw = function () {
      // Collections, All first, with how many each holds under the search and filter.
      // Figma's collections as one filter chip, the Status page's own: named until one is chosen, its list with how many each holds.
      // A collection's count is the whole collection's (a search narrows it; a group chosen in the list below does not).
      var nOf = function (c) { return tkRows.filter(function (r) { return (!c || r.coll === c) && matches(r, 'coll', 'group'); }).length; };
      if (!state.coll || TK_COLLS.indexOf(state.coll) < 0) state.coll = TK_COLLS[0] || '';   // always one collection, as in Figma
      sideColls.innerHTML = TK_COLLS.map(function (c) { return item('', ' data-coll="' + esc(c) + '"', c, nOf(c), state.coll === c); }).join('');
      // The groups of what is shown, as a tree: every level of its names but the last.
      var inView = tkRows.filter(function (r) { return matches(r, 'group'); }), tree = {}, order = [];
      inView.forEach(function (r) { for (var d = 1; d < r.path.length; d++) { var g = r.path.slice(0, d).join('/'); if (!tree[g]) { tree[g] = 0; order.push(g); } tree[g]++; } });
      var byFigmaG = tkFigmaOrder(inView.map(function (r) { return r.path; }));
      order.sort(function (a, b) { return byFigmaG(a.split('/'), b.split('/')); });   // the groups as Figma lists them
      // A tree, as Figma's panel: the top level always; a group's own groups under it once it is open (its chevron, or
      // choosing it or one inside it).
      var isOpen = function (g) { return tkOpen[g] === true || (tkOpen[g] !== false && (state.group + '/').indexOf(g + '/') === 0); };
      var shownG = function (g) { var p = g.split('/'); for (var d = 1; d < p.length; d++) if (!isOpen(p.slice(0, d).join('/'))) return false; return true; };
      var hasKids = function (g) { return order.some(function (x) { return x.indexOf(g + '/') === 0; }); };
      // Lines as Figma's tree draws them: down from a group, an elbow to each group inside it, down past an ancestor
      // while one of its own follows. The chosen group, when open, holds what is inside it in one block.
      var vis = order.filter(shownG), up = function (x) { return x.split('/').slice(0, -1).join('/'); };
      var sel = state.group && isOpen(state.group) && hasKids(state.group) ? state.group : '';
      sideGroups.innerHTML = item('', ' data-group=""', 'All', inView.length, !state.group) + vis.map(function (g, i) {
        var parts = g.split('/'), d = parts.length - 1, guides = '';
        for (var k = 0; k < d; k++) {
          var a = parts.slice(0, k + 2).join('/'), more = vis.slice(i + 1).some(function (y) { return up(y) === up(a); });
          if (k === d - 1) guides += '<span class="sg-tk-guide" data-t="' + (more ? 'tee' : 'end') + '" style="--k:' + k + '"></span>';
          else if (more) guides += '<span class="sg-tk-guide" data-t="pass" style="--k:' + k + '"></span>';
        }
        var inSel = sel && g.indexOf(sel + '/') === 0, lastIn = inSel && !(vis[i + 1] && vis[i + 1].indexOf(sel + '/') === 0);
        var cls = 'sg-tk-row' + (sel === g ? ' is-sel-open' : '') + (inSel ? ' is-in-sel' : '') + (lastIn ? ' is-in-sel-last' : '');
        return '<div class="' + cls + '" style="--d:' + d + '">' + guides + (hasKids(g) ? '<button type="button" class="sg-tk-twist" data-twist="' + esc(g) + '" aria-expanded="' + isOpen(g) + '" aria-label="' + (isOpen(g) ? 'Close ' : 'Open ') + esc(parts[parts.length - 1]) + '">' + TK_CHEV + '</button>' : '<span class="sg-tk-twist" aria-hidden="true"></span>') +
          item('', ' data-group="' + esc(g) + '"', parts[parts.length - 1], tree[g], state.group === g) + '</div>';
      }).join('');
      // A table a collection, its modes as columns, its tokens under a row naming their group (spacing / gap).
      var shown = tkRows.filter(function (r) { return matches(r); });
      tables.innerHTML = !shown.length ? '<p class="sg-info sg-area-na">No token matches.</p>' : tkTablesHTML(shown);
      tkHeadRoom(tables);
      tkLink(); stickHeight(tk);
    };
    // The brand or mode changed: its values again, when it shows, and an open token's details with them.
    var tkRun = lazyDraw(tk, function () { draw(); var m = document.getElementById('sg-tk-panel'); if (m && m._open && openTokenPanel._name) openTokenPanel(openTokenPanel._name, m._from); }); DRAWERS.push(tkRun);
    // Another page sends someone here (#tokens?collection=…&group=…&token=…): that view, the token's row in view.
    var tkFocus = function (name) { var row = Array.prototype.find.call(tables.querySelectorAll('tr[data-token]'), function (tr) { return tr.getAttribute('data-token') === name; }); if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('is-target'); setTimeout(function () { row.classList.remove('is-target'); }, 1600); } };
    window.addEventListener('hashchange', function () {
      if (location.hash.indexOf('#tokens?') !== 0) return;
      var q = new URLSearchParams(location.hash.slice(location.hash.indexOf('?') + 1)); state.coll = q.get('collection') || ''; state.group = q.get('group') || ''; state.kind = q.get('show') || '';
      draw(); var want = q.get('token'); if (want) setTimeout(function () { tkFocus(want); }, 60);
    });
    // Every foundation page shows its own tokens in the same tables (colours on Colors, and so on): an alias or a group's
    // path there opens it on this page; the arrow opens the same details. → the tables, or null with none of that kind.
    tkFoundation = function (sec, type) {
      var rows = tkRows.filter(function (r) { return r.t.type === type; }); if (!rows.length) return null;
      var box = document.createElement('div'); box.className = 'sg-tk-tables sg-tk-found'; sec.appendChild(box);
      var fill = lazyDraw(sec, function () { box.innerHTML = tkTablesHTML(rows); tkHeadRoom(box); }); fill(); DRAWERS.push(fill);   // drawn when its page shows, again on a brand change
      var go = function (coll, group, token) { location.hash = '#tokens?' + (coll ? 'collection=' + encodeURIComponent(coll) + '&' : '') + (group ? 'group=' + encodeURIComponent(group) + '&' : '') + (token ? 'token=' + encodeURIComponent(token) : '').replace(/&$/, ''); };
      box.addEventListener('click', function (e) {
        var dt = e.target.closest('[data-detail]'); if (dt) { openTokenPanel(dt.getAttribute('data-detail'), dt); return; }
        var tr = !e.target.closest('button, a') && e.target.closest('tr[data-token]'); if (tr) { openTokenPanel(tr.getAttribute('data-token'), tr.querySelector('[data-detail]')); return; }
        var a = e.target.closest('.sg-tk-alias'); if (a) { var name = a.getAttribute('data-alias'), to = tkRows.find(function (r) { return r.t.figma === name; }); if (to) go(to.coll, to.path.slice(0, -1).join('/'), name); return; }
        var cr = e.target.closest('.sg-tk-crumb'); if (cr) go(cr.getAttribute('data-goto-coll'), cr.getAttribute('data-goto-group'));
      });
      return rows;
    };
    // An alias opens the token it points at: its collection and group, the row in view and marked a moment.
    tables.addEventListener('click', function (e) {
      var dt = e.target.closest('[data-detail]'); if (dt) { openTokenPanel(dt.getAttribute('data-detail'), dt); return; }
      var tr = !e.target.closest('button, a') && e.target.closest('tr[data-token]'); if (tr) { openTokenPanel(tr.getAttribute('data-token'), tr.querySelector('[data-detail]')); return; }
      var cr = e.target.closest('.sg-tk-crumb');
      if (cr) { state.coll = cr.getAttribute('data-goto-coll'); state.group = cr.getAttribute('data-goto-group'); draw(); var top = tk.querySelector('.sg-tk'); if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' }); return; }
      var a = e.target.closest('.sg-tk-alias'); if (!a) return;
      var name = a.getAttribute('data-alias'), to = tkRows.find(function (r) { return r.t.figma === name; }); if (!to) return;
      state.coll = to.coll; state.group = to.path.slice(0, -1).join('/'); state.kind = ''; draw();
      var row = Array.prototype.find.call(tables.querySelectorAll('tr[data-token]'), function (tr) { return tr.getAttribute('data-token') === name; });
      if (row) { row.scrollIntoView({ block: 'center' }); row.classList.add('is-target'); setTimeout(function () { row.classList.remove('is-target'); }, 1600); }
    });
    box.addEventListener('click', function (e) {
      var tw = e.target.closest('[data-twist]');
      if (tw) { var tg = tw.getAttribute('data-twist'), was = tw.getAttribute('aria-expanded') === 'true'; tkOpen[tg] = !was; if (was && (state.group + '/').indexOf(tg + '/') === 0 && state.group !== tg) state.group = tg; draw(); return; }
      // A group clicked: chosen and opened; clicked again, closed (and opened again on the next click).
      var gi = e.target.closest('.sg-tk-groups [data-group]');
      if (gi && gi.getAttribute('data-group')) { var gg = gi.getAttribute('data-group'), row = gi.closest('.sg-tk-row'), tw2 = row && row.querySelector('[data-twist]'); if (state.group === gg && tw2) tkOpen[gg] = tw2.getAttribute('aria-expanded') !== 'true'; else { state.group = gg; if (tw2) tkOpen[gg] = true; } draw(); return; }
      var c = e.target.closest('[data-coll]'), g = e.target.closest('[data-group]'), k = e.target.closest('[data-kind]');
      if (c) { state.coll = c.getAttribute('data-coll'); state.group = ''; }
      else if (g) state.group = g.getAttribute('data-group');
      else if (k) state.kind = k.getAttribute('data-kind');
      else return;
      draw();
    });
    tkRun();
    // Every token in every mode in one file, by collection: its Figma name, the code's name, what it styles, its value in each mode.
    var tkActs = document.createElement('div'); tkActs.className = 'sg-section-actions'; tkActs.innerHTML = sysButton('button', 'Download all tokens', null, null, null, DOWNLOAD_SVG);
    (tk.querySelector(':scope > h2') || tk).appendChild(tkActs);
    tkActs.querySelector('button').addEventListener('click', function () {
      var out = { name: (DATA.title || 'Design system') + ' tokens', exported: new Date().toISOString(), collections: TK_COLLS.map(function (c) {
        var rows = tkRows.filter(function (r) { return r.coll === c; });
        return { name: c, modes: tkModesOf(rows), tokens: rows.map(function (r) { var values = {}; r.labels.forEach(function (m, i) { values[m] = r.values[i]; }); return { name: r.t.figma, code: r.t.var || null, type: r.t.type, values: values }; }) };
      }) };
      saveFile('tokens.json', 'application/json', JSON.stringify(out, null, 2));
    });
  }

