  /* ── Typography ───────────────────────────────────────────────────────────────────────────────────────────── */
  // Only the text styles the token check compared in full and found equal (in every mode, the switch shows each), each
  // with the fields Figma gives it and nothing else: never a value the browser fills in. The family once, as its own
  // token; the styles left off, named, with the Status page saying why.
  var TYPE_FAMILY = TOKENS.typeFamily || null, TYPE_OFF = TOKENS.typeLeftOff || [];
  // What the page shows of the system is set in the system's own family (its variable), as a product's page using it
  // would be, never in the font the project's own site shell writes on its body: so a brand's family reaches every
  // component that inherits its font.
  if (TYPE_FAMILY && TYPE_FAMILY.var) { var tfs = document.createElement('style'); tfs.id = 'sg-system-family'; tfs.textContent = ':is(.pg-preview, .pg-frame-stage, .pg-variants, .pg-offstage, .sg-thumb, .sg-showroom) { font-family: var(' + TYPE_FAMILY.var + '); }'; document.head.appendChild(tfs); }
  if ((TOKENS.typography || []).length || TYPE_FAMILY || TYPE_OFF.length) {
    hr(); foundationLink('typography', 'typography');
    var ts = section('typography', 'Foundations', 'Typography', null);
    foundationLead(ts, plural((TOKENS.typography || []).length, 'text style', 'text styles') + ' of the system, each at every breakpoint.');
    if (TYPE_FAMILY && TYPE_FAMILY.differs) {
      var fd = document.createElement('div'); fd.className = 'sg-pending sg-type-family';
      fd.innerHTML = '<b>The family differs.</b> Figma\'s text styles use ' + esc(TYPE_FAMILY.figma || '') + (TYPE_FAMILY.variable ? ' (' + esc(TYPE_FAMILY.variable) + ')' : '') + ', the code ' + esc(TYPE_FAMILY.code || 'none') + (TYPE_FAMILY.var && /^--/.test(TYPE_FAMILY.var) ? ' (' + esc(TYPE_FAMILY.var) + ')' : '') + '. It is on the Status page; the styles below are drawn in the code\'s family.';
      ts.appendChild(fd);
    } else if (TYPE_FAMILY) {
      var fc = document.createElement('div'); fc.className = 'sg-token-cards sg-type-family';
      // One typography table, as every text style's: its name, then every character the system draws in the family
      // (capitals, small letters, figures and signs, in the family itself), then the family's variable and value.
      var famCss = 'font-family:' + (TYPE_FAMILY.var ? 'var(' + TYPE_FAMILY.var + ')' : 'inherit');
      var glyphs = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz', '0123456789', '! ? & @ # % € $ £ * ( ) [ ] { } . , : ; \' " / \\ + − = < > ~ ^ _ ç ã é ü ß'];
      fc.innerHTML = '<div class="type-specimen pg-inspect"><div class="pg-inspect-head">family</div><div class="type-specimen-preview sg-type-glyph-preview" style="' + esc(famCss) + '">' + glyphs.map(function (g) { return '<span>' + esc(g) + '</span>'; }).join('') + '</div>' +
        '<table><thead><tr><th scope="col">Name</th><th scope="col">Value</th></tr></thead><tbody><tr><td>' + tokenNameCell(TYPE_FAMILY.figma || 'family', TYPE_FAMILY.var && /^--/.test(TYPE_FAMILY.var) ? TYPE_FAMILY.var : null) + '</td><td class="sg-token-value">' + esc(TYPE_FAMILY.value || '') + '</td></tr></tbody></table></div>';
      ts.appendChild(fc);
    }
    // A family the code writes by hand: said first, since what it draws keeps that font in every brand.
    if ((DATA.handFonts || []).length) {
      var hf = document.createElement('div'); hf.className = 'sg-pending sg-type-hand';
      hf.innerHTML = '<span><b>The code writes the font by hand.</b> ' + DATA.handFonts.map(function (h) { return esc(h.value) + ' on <code>' + esc(h.selector) + '</code>'; }).join('; ') +
        ', not the system\'s family token: what is drawn there, and every component that inherits it, keeps that font in every brand. Write it with the token.</span>';
      ts.appendChild(hf);
    }
    if (TYPE_OFF.length) {
      var off = document.createElement('div'); off.className = 'sg-pending sg-type-off';
      off.innerHTML = '<b>Left off until Figma and the code agree:</b> ' + TYPE_OFF.map(function (x) { return esc(x.style) + ' (' + esc(x.differs.length ? 'differs' : 'not compared') + ': ' + esc(x.fields.map(function (f) { return ({ size: 'size', weight: 'weight', lh: 'line height', ls: 'letter spacing', ps: 'paragraph spacing', textTransform: 'case' })[f] || f; }).join(', ')) + ')'; }).join(', ') + '. Each is on the Status page.';
      ts.appendChild(off);
    }
    var demo = document.createElement('div'); demo.className = 'type-list sg-token-cards';   // no frame around the list: each style is its own card
    var TYPE_PROPS = [['size', 'font-size', 'size'], ['weight', 'font-weight', 'weight'], ['lh', 'line-height', 'line height'], ['ls', 'letter-spacing', 'letter spacing'], ['textTransform', 'text-transform', 'case']];
    var drawType = function () {
      var modes = sizeModes(); if (!modes.length) modes = [{ label: 'Value', set: function (el) { return el; } }];
      demo.innerHTML = '';
      TOKENS.typography.forEach(function (t) {
        var style = [];
        TYPE_PROPS.forEach(function (k) { if (t[k[0]] && t[k[0]].var) style.push(k[1] + ':var(' + t[k[0]].var + ')'); });
        // In the system's family (its variable) when it agrees with Figma: its text styles' own font, not the page's.
        if (TYPE_FAMILY && !TYPE_FAMILY.differs && TYPE_FAMILY.var) style.push('font-family:var(' + TYPE_FAMILY.var + ')');
        // No sample: each style is its fields, as every foundation's table is: its name (Figma's, the code's under it), then
        // its value at each breakpoint, read where it is drawn (a probe out of sight carries the style and the breakpoint).
        var probe = document.createElement('span'); probe.setAttribute('style', style.join(';') + ';position:absolute;visibility:hidden;');
        var drawnIn = modes.map(function (m) {
          var el = m.set(probe.cloneNode(false)); demo.appendChild(el);
          var cs = getComputedStyle(el), d0 = { size: cs.fontSize, weight: cs.fontWeight, lh: cs.lineHeight === 'normal' ? 'auto' : cs.lineHeight, ls: cs.letterSpacing === 'normal' ? '0' : cs.letterSpacing, textTransform: cs.textTransform };
          el.remove(); return d0;
        });
        var card = document.createElement('div');
        card.innerHTML = tokenCard(t.scale, TYPE_PROPS.filter(function (k) { return t[k[0]]; }).map(function (k) {
          var x = t[k[0]];
          return { t: { figma: x.figma || k[2], var: x.var }, cells: drawnIn.map(function (d0) { return esc(d0[k[0]]); }) };
        }), modes.map(function (m) { return m.label; }));
        demo.appendChild(card.firstChild);
      });
    };
    var tRows = tkFoundation && tkFoundation(ts, 'typography');
    if (!tRows) { ts.appendChild(demo); DRAWERS.push(drawType); drawType(); }
    // A brand chosen (the Brand switch) can bring its own family, weights and sizes: the styles are drawn again in it (the
    // switch's redraw does that, once), and the family's value is read where it is drawn, so the page names the brand's
    // family, not the system's.
    document.addEventListener('sg-brand', function () {
      var fv = fc && TYPE_FAMILY && TYPE_FAMILY.var ? fc.querySelector('.sg-token-value') : null;
      if (fv) fv.textContent = getComputedStyle(fc).getPropertyValue(TYPE_FAMILY.var).trim() || TYPE_FAMILY.value || '';
    });

  }

