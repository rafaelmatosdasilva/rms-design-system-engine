  /* ── Spacing, radii, other sizes ──────────────────────────────────────────────────────────────────────────── */
  // One card per family of the name (gap, padding), each from the smallest to the largest, with the family as its head.
  function sizeList(id, title, list, sample) {
    if (!(list || []).length) return;
    hr(); foundationLink(id, title.toLowerCase());
    var s = section(id, 'Foundations', title, null);
    foundationLead(s, plural(list.length, id === 'radii' ? 'radius token' : 'spacing token', id === 'radii' ? 'radius tokens' : 'spacing tokens') + ' of the system, each at every breakpoint.');
    var fams = [], byFam = {};
    list.forEach(function (t) { var f = t.figma.indexOf('/') > 0 ? t.figma.split('/')[0] : title.toLowerCase(); if (!byFam[f]) { byFam[f] = []; fams.push(f); } byFam[f].push(t); });
    var d = document.createElement('div'); d.className = 'sg-token-cards';
    // Every breakpoint side by side, its value read where it is drawn; ordered by the first one's value.
    var draw = function () {
      var modes = sizeModes(); if (!modes.length) modes = [{ label: 'Value', set: function (el) { return el; } }];
      s.appendChild(d);
      var val = {}; list.forEach(function (t) { val[t.var] = modes.map(function (m) { return sizedValue(d, m.set, t.var) || t.value; }); });
      d.innerHTML = fams.map(function (f) {
        var rows = byFam[f].slice().sort(function (a, b) { return (parseFloat(val[a.var][0]) || 0) - (parseFloat(val[b.var][0]) || 0); });
        return tokenCard(f, rows.map(function (t) { return { sample: sample ? sample(t) : null, t: t, cells: val[t.var].map(esc) }; }), modes.map(function (m) { return m.label; }));
      }).join('');
    };
    var sRows = tkFoundation && tkFoundation(s, id === 'radii' ? 'radius' : 'spacing');
    if (sRows) { var sp = s.querySelector('h2 + p'); if (sp) sp.textContent = plural(sRows.length, id === 'radii' ? 'radius token' : 'spacing token', id === 'radii' ? 'radius tokens' : 'spacing tokens') + ' of the system, each in every mode of its collection.'; }
    else { DRAWERS.push(draw); draw(); }
  }
  sizeList('spacing', 'Spacing', TOKENS.spacing, null);   // names and values only: a bar per space read as a chart
  sizeList('radii', 'Radii', TOKENS.radii, function (t) { return '<span class="sg-token-radius" style="border-radius:var(' + esc(t.var) + ')"></span>'; });

