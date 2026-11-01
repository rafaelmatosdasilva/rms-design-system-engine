  // ── The contrast of its text, measured as it is drawn now (this mode, these props) ─────────────────────────────────
  // Every colour read through a 1×1 canvas, so any colour syntax the browser accepts is read the same way.
  var px = (function () { try { var cv = document.createElement('canvas'); cv.width = cv.height = 1; return cv.getContext('2d', { willReadFrequently: true }); } catch (e) { return null; } })();
  function rgba(col) {
    if (!px || !col) return null;
    px.clearRect(0, 0, 1, 1); px.fillStyle = '#000'; px.fillStyle = col; px.fillRect(0, 0, 1, 1);
    var d = px.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255];
  }
  function lum(c) { var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); }
  function over(top, under) { var a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; }
  // A ::before or ::after that covers its box and paints a background, laid over the box's own (::after on top).
  function covers(n) {
    var r = n.getBoundingClientRect(), out = [];
    ['::after', '::before'].forEach(function (ps) {
      var p = getComputedStyle(n, ps); if (!p || p.content === 'none' || p.display === 'none') return;
      var b = rgba(p.backgroundColor); if (!b || !b[3]) return;
      var fits = Math.abs(parseFloat(p.width) - r.width) < 2 && Math.abs(parseFloat(p.height) - r.height) < 2;
      if (fits || (/absolute|fixed/.test(p.position) && p.top === '0px' && p.left === '0px' && p.right === '0px' && p.bottom === '0px')) out.push(b);
    });
    return out;
  }
  // A box laid under the element that is not one of its parents (a backdrop placed by its position, a sibling's
  // fill): the last one drawn under the middle of its words, read by geometry, since the check runs out of sight.
  function under(el) {
    var host = el.closest('.pg-preview, .pg-offstage, .pg-frame, .pg-variants'); if (!host) return null;
    var tn = Array.prototype.filter.call(el.childNodes, function (k) { return k.nodeType === 3 && k.textContent.trim(); })[0], r;
    if (tn) { var rg = document.createRange(); rg.selectNodeContents(tn); r = rg.getBoundingClientRect(); } else r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    var x = r.left + r.width / 2, y = r.top + r.height / 2, hit = null;
    Array.prototype.forEach.call(host.querySelectorAll('*'), function (b) {
      if (b === el || b.contains(el) || el.contains(b)) return;
      var q = b.getBoundingClientRect(); if (x < q.left || x > q.right || y < q.top || y > q.bottom) return;
      var bg = rgba(getComputedStyle(b).backgroundColor);
      if ((bg && bg[3] > 0) || covers(b).length) hit = b;
    });
    return hit;
  }
  // What is behind an element: the backgrounds of it and every box above it, laid over each other, with what covers a
  // box (its ::before, its ::after) and a box laid under it that is not a parent.
  function behind(el) {
    var layers = [], below = under(el), stop = false;
    var add = function (n) { covers(n).concat([rgba(getComputedStyle(n).backgroundColor)]).forEach(function (b) { if (!stop && b && b[3] > 0) { layers.push(b); if (b[3] >= 1) stop = true; } }); };
    for (var n = el; n && n.nodeType === 1 && !stop; n = n.parentElement) {
      if (below && n !== el && n.contains(below)) { add(below); below = null; if (stop) break; }
      add(n);
    }
    var base = [255, 255, 255, 1];
    for (var i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  }
  // The text that stands out least against what is behind it, and what it needs (4.5:1, 3:1 when large).
  function contrastLowest(root) {
    var lowest = null;
    var els = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
    els.forEach(function (el) {
      var own = Array.prototype.some.call(el.childNodes, function (k) { return k.nodeType === 3 && k.textContent.trim(); }) || (el.tagName === 'INPUT' && (el.value || el.placeholder));
      if (!own) return;
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
      for (var up = el; up && up !== root.parentElement; up = up.parentElement) if (up.hidden || getComputedStyle(up).display === 'none') return;   // not drawn in this state
      if (el.closest(':disabled, [aria-disabled="true"]')) return;   // WCAG 1.4.3 exempts a control that cannot be used
      var fg = rgba(cs.color); if (!fg) return;
      var bg = behind(el), col = over(fg, bg);
      var l1 = lum(col), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      var size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && (+cs.fontWeight || 400) >= 700);
      var need = large ? 3 : 4.5, words = (el.tagName === 'INPUT' ? (el.value || el.placeholder) : el.textContent).replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!lowest || ratio / need < lowest.ratio / lowest.need) lowest = { ratio: ratio, need: need, words: words };
    });
    return lowest;
  }
  function contrastHTML(root) {
    var lowest = contrastLowest(root);
    if (!lowest) return a11yRow('none', 'Text contrast', 'No text drawn in this state.', 'WCAG 1.4.3 Contrast (Minimum) (AA)', FROM_PAGE);
    var ok = lowest.ratio >= lowest.need;
    return a11yRow(ok ? 'done' : 'todo', 'Text contrast', esc((Math.floor(lowest.ratio * 10) / 10).toFixed(1)) + ':1 on "' + esc(lowest.words) + '", needs ' + lowest.need + ':1 (' + (lowest.need === 3 ? 'large text' : 'text') + '), in the mode and state shown.', 'WCAG 1.4.3 Contrast (Minimum) (AA)', FROM_PAGE);
  }

