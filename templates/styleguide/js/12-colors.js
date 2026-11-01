  /* ── Colors: one card per group, each colour with its value in the mode the switch shows ─────────────────────── */
  if (FLAT.length) {
    hr(); foundationLink('colors', 'colors');
    var cs = section('colors', 'Foundations', 'Colors', null);
    foundationLead(cs, plural(FLAT.length, 'colour token', 'colour tokens') + ' of the system, each in every colour mode.');
    var cd = document.createElement('div'); cd.className = 'sg-token-cards';
    // Each colour in every colour mode side by side (Light, Dark), a swatch and its value in each, read where it is drawn.
    var drawColors = function () {
      var modes = colourModes(); if (!modes.length) modes = [{ label: 'Value', set: function (el) { return el; } }];
      cs.appendChild(cd);
      cd.innerHTML = TOKENS.colors.map(function (g) {
        return tokenCard(g.group, g.items.map(function (t) {
          return { t: t, cells: modes.map(function (m) { var c = hexOf(backgroundIn(cd, m, t.var)); return '<span class="sg-token-swatch" style="background:' + esc(c) + '"></span> ' + esc(c); }) };
        }), modes.map(function (m) { return m.label; }));
      }).join('');
    };
    // With Figma's tokens, the same tables as the Tokens page: every colour, its modes, its aliases, its details.
    var cRows = tkFoundation && tkFoundation(cs, 'colour');
    if (cRows) { var cp = cs.querySelector('h2 + p'); if (cp) cp.textContent = plural(cRows.length, 'colour token', 'colour tokens') + ' of the system, each in every mode of its collection.'; }
    else { DRAWERS.push(drawColors); drawColors(); }
  }

