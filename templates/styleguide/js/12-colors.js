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
    // Each step the colour scales share, every colour's token at it with its contrast on the system's own surface in each
    // mode, so a designer swapping one colour for another at the same step sees whether it still reads. A step that
    // splits is said in its card's head, with the colours that fall short. The cards are the colour cards' own (tokenCard),
    // and the page keeps no line of its own under its title.
    var STEPS = DATA.colourSteps || [];
    if (STEPS.length) {
      var sd = document.createElement('div'); sd.className = 'sg-token-cards';
      var cols = STEPS[0].modes.map(function (m) { return m + ', on ' + STEPS[0].surfaces[m]; });
      sd.innerHTML = STEPS.map(function (t) {
        // Each mode on its own: a step can read in every colour on a dark page and in none on a light one.
        var one = t.modes.length === 1;
        var head = 'Step ' + t.step + ' across colours · ' + t.modes.map(function (m) {
          var cells = t.rows.map(function (r) { return { family: r.family, c: r.cells.filter(function (c) { return c.mode === m; })[0] }; }).filter(function (x) { return x.c && x.c.ratio != null; });
          var shortOf = cells.filter(function (x) { return !x.c.reads; }).map(function (x) { return x.family; });
          var where = one ? '' : ' in ' + m;
          return !shortOf.length ? 'reads in every colour' + where : shortOf.length === cells.length ? 'under 4.5:1 in every colour' + where : 'splits' + where + ', under 4.5:1 in ' + shortOf.join(' and ');
        }).join(' · ');
        return tokenCard(head, t.rows.map(function (r) {
          return { t: { figma: r.figma, var: r.var }, cells: r.cells.map(function (c) {
            if (c.ratio == null) return esc('not in this mode');
            return '<span class="sg-token-swatch" style="background:' + esc(c.hex) + '"></span> ' + esc(c.ratio + ':1') + ' ' + esc(c.reads ? 'reads' : 'under 4.5:1');
          }) };
        }), cols);
      }).join('');
      cs.appendChild(sd);
    }
  }

