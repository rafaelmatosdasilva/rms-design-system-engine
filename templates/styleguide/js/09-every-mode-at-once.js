  /* ── Every mode at once: a foundation's values in one column per mode (Phone, Tablet, Laptop, Desktop; Light, Dark) ── */
  // Each mode is the attributes that put it on an element (data-size="phone"), the system's own mode CSS reads them on
  // any element; a value is read on a probe that carries them. Several axes: one column per combination.
  var DRAWERS = [];   // every foundation's drawing, read again when the page's brand or mode changes
  // A page's drawing done when it is shown: built the first time it is opened, drawn again on a brand or mode change
  // only while it shows (else the next time it is opened). With ?all, every page draws at once.
  function lazyDraw(sec, fn) {
    return function () {
      var here = typeof route === 'function' && route.last ? route.last : (decodeURIComponent(location.hash.slice(1).split(/[\/?]/)[0] || '') || homeId());   // the address's page: the router is not ready while pages build
      if (ALL || here === sec.id) { sec._dirty = null; fn(); } else sec._dirty = fn;
    };
  }
  function modesOf(pick) {
    var axes = AXES.filter(pick), combos = [{ label: [], attrs: {} }];
    axes.forEach(function (a) {
      var next = [];
      combos.forEach(function (c) { (a.values || []).forEach(function (v) { var at = {}; Object.keys(c.attrs).forEach(function (k) { at[k] = c.attrs[k]; }); at[a.attr] = v.value; next.push({ label: c.label.concat(v.label), attrs: at }); }); });
      combos = next.length ? next : combos;
    });
    // Breakpoints from the smallest screen up, as they are read (Phone, Tablet, Laptop, Desktop); colours as they come.
    var SCREEN = ['watch', 'phone', 'mobile', 'small', 'tablet', 'medium', 'laptop', 'large', 'desktop', 'wide', 'xl'];
    var rank = function (c) { var i = -1; c.label.forEach(function (l) { var k = SCREEN.indexOf(String(l).toLowerCase()); if (k > i) i = k; }); return i; };
    if (combos.every(function (c) { return rank(c) >= 0; })) combos.sort(function (x, y) { return rank(x) - rank(y); });
    return combos.map(function (c) { return { label: c.label.join(' · ') || 'Value', set: function (el) { Object.keys(c.attrs).forEach(function (k) { el.setAttribute(k, c.attrs[k]); }); return el; } }; });
  }
  // A size is never a colour: spacing, radii and text change with the breakpoints only, never with Light and Dark.
  var sizeModes = function () { return modesOf(function (a) { return a.scoped && !a.colour && a.attr !== 'data-color' && !a.classes; }); };
  // The colour modes (Light and Dark) on the colours page.
  var colourModes = function () { return modesOf(function (a) { return a.scoped && !a.classes && a.attr !== 'data-size' && (a.colour || a.attr === 'data-color'); }); };
  // A value as a mode draws it: read on a probe that carries the mode.
  function sizedValue(box, sized, v) { var probe = sized(document.createElement('span')); box.appendChild(probe); var x = live(probe, v); probe.remove(); return x; }
  function backgroundIn(box, mode, v) { var probe = mode.set(document.createElement('span')); probe.style.background = 'var(' + v + ')'; box.appendChild(probe); var x = getComputedStyle(probe).backgroundColor; probe.remove(); return x; }
  function live(el, v) { return getComputedStyle(el).getPropertyValue(v).trim(); }
  // A colour as the browser draws it, written as hex (its alpha after it when it has one).
  function hexOf(c) {
    var m = String(c).match(/[\d.]+/g); if (!m || m.length < 3 || /^color\(/.test(c)) return c;
    var two = function (n) { return ('0' + Math.max(0, Math.min(255, Math.round(n))).toString(16)).slice(-2); };
    return '#' + m.slice(0, 3).map(function (x) { return two(+x); }).join('') + (m.length > 3 && +m[3] < 1 ? two(+m[3] * 255) : '');
  }
  // A group of tokens as one card, as a typography style is: its name as the card's head, then one row per token with
  // its sample, its Figma name, its variable and its value.
  // A token's name: Figma's, and the code's variable under it (the variable opens its panel).
  function tokenNameCell(figma, v) {
    return '<span class="sg-token-name">' + esc(figma || v || '').replace(/\//g, '/<wbr>') + '</span>' + (figma && v ? '<span class="sg-token-var">' + usesLink(v) + '</span>' : '');
  }
  // cols: the modes' names, one value column each (r.cells, HTML); with none, one Value column (r.value).
  function tokenCard(head, rows, cols) {
    var plain = rows.every(function (r) { return r.sample == null; });   // a list with no samples: its name, variable and values
    cols = cols && cols.length ? cols : ['Value'];
    return '<div class="pg-inspect sg-token-card' + (plain ? ' sg-token-card--plain' : '') + '"><div class="pg-inspect-head">' + esc(head) + '</div><div class="sg-token-scroll"><table><thead><tr>' + (plain ? '' : '<th scope="col" class="sg-token-sample">Preview</th>') + '<th scope="col" class="sg-token-name-col">Name</th>' + cols.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      var cells = r.cells || [esc(r.value || '')];
      return '<tr>' + (plain ? '' : '<td class="sg-token-sample">' + r.sample + '</td>') + '<td>' + tokenNameCell(r.t.figma, r.t.var) + '</td>' + cells.map(function (c) { return '<td class="sg-token-value">' + c + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table></div></div>';
  }

