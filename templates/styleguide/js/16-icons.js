  /* ── Icons: every icon is a real one from the system's symbol sheet, referenced by id ───────────────────────── */
  if ((DATA.icons || []).length) {
    hr(); foundationLink('icons', 'icons');
    var is = section('icons', 'Foundations', 'Icons', null);
    foundationLead(is, plural(DATA.icons.length, 'icon', 'icons') + ' of the system, each at the size Figma gives it.');
    // Every icon in one file at the top right: the system's sheet as an SVG sprite, each icon a <symbol> by its id.
    var dl = document.createElement('div'); dl.className = 'sg-section-actions'; dl.innerHTML = sysButton('button', 'Download all icons', null, null, null, DOWNLOAD_SVG); (is.querySelector(':scope > h2') || is).appendChild(dl);
    dl.querySelector('button').addEventListener('click', function () {
      var sheet = document.getElementById('ds-icon-sheet'); if (!sheet) return;
      var body = DATA.icons.map(function (id) { var sym = document.getElementById(id); return sym ? sym.outerHTML : ''; }).join('\n');
      var text = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">\n' + body + '\n</svg>\n';
      saveFile(String(DATA.title || 'design-system').replace(/[^\w-]+/g, '-').toLowerCase() + '-icons.svg', 'image/svg+xml', text);
    });
    // Each icon at the size Figma gives it, named as in Figma; the symbol's own viewBox when Figma does not list it.
    var FIG = DATA.iconFigma || {};
    var own = function (id) { if (FIG[id] && FIG[id].size) return FIG[id].size; var sym = document.getElementById(id), vb = sym && sym.getAttribute('viewBox'); if (!vb) return null; var p = vb.split(/[\s,]+/); return Number(p[3]) || Number(p[2]) || null; };   // an icon's size is its height: one drawn wider than tall (26 × 24) is still 24
    var idm = document.createElement('div'); is.appendChild(idm);
    // Its stroke widths listed as the spacing is: a card, each width with its sample, names and value.
    if ((TOKENS.iconStrokes || []).length) { var st = document.createElement('div'); st.className = 'sg-token-cards sg-icon-strokes'; st.innerHTML = tokenCard('stroke widths', TOKENS.iconStrokes.map(function (t) { return { sample: '<span class="spacing-bar" style="width:var(' + esc(t.var) + ')"></span>', t: t, value: t.value }; })); is.appendChild(st); }
    // Grouped by each icon's own size (the small set, the large set), as the system draws them: one card per size, the
    // size as its head, the icons on a grid of equal cells so they line up across and down.
    function drawIcons() {
      var groups = {}, order = [];
      DATA.icons.forEach(function (id) { var n = own(id) || 0; if (!groups[n]) { groups[n] = []; order.push(n); } groups[n].push(id); });
      order.sort(function (a, b) { return a - b; });
      idm.className = 'sg-token-cards';
      idm.innerHTML = order.map(function (n) {
        // The size's name when most of its icons carry the same one (m-close-m: "m · 24px").
        var names = {}; groups[n].forEach(function (id) { var k = iconSizeName(id); if (k) names[k] = (names[k] || 0) + 1; });
        var top = Object.keys(names).sort(function (a, b) { return names[b] - names[a]; })[0], sn = top && names[top] * 2 > groups[n].length ? top + '  ·  ' : '';
        return '<div class="pg-inspect sg-icon-card"><div class="pg-inspect-head">' + (n ? sn + n + 'px' : 'Other sizes') + '</div><div class="sg-icon-grid">' + groups[n].map(function (id) {
          var at = n || '', name = FIG[id] && FIG[id].name;
          return '<div class="icon-chip"><svg aria-hidden="true"' + (at ? ' width="' + at + '" height="' + at + '" style="width:' + at + 'px;height:' + at + 'px"' : '') + '><use href="#' + esc(id) + '"/></svg><span class="color-chip-value">' + esc(name || id) + '</span></div>';
        }).join('') + '</div></div>';
      }).join('');
    }
    drawIcons();
  }

  // Pages built and reachable by their address, kept off the menu: Identity and Tokens show what they hold.
  ['colors', 'typography', 'spacing', 'radii', 'motion'].forEach(function (id) { var a = nav.querySelector('a[href="#' + id + '"]'); if (a) a.hidden = true; });

