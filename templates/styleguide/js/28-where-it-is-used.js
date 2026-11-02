  // ── Where it is used: a card per product, its own page pictured as it opens with each place the component sits on it
  // marked, linked to the product ─────────────────────────────────────────────────────────────────────────────────────
  // The Showroom's screens built with it (each screen's imports), as the Showroom's own cards, after its products.
  function usedScreensHTML(c) {
    var screens = (DATA.showroom || []).filter(function (s) { return (s.uses || []).indexOf(c.name) >= 0; });
    if (!screens.length) return '';
    return '<h3 class="pg-usedin-title">In the Showroom</h3><div class="sg-card-grid sg-showroom-grid pg-usedin-screens" data-screens="' + esc(screens.map(function (s) { return s.key; }).join(' ')) + '"></div>';
  }
  function usedInHTML(c) {
    var u = (c.usage || []).map(function (k) { return typeof k === 'string' ? { key: k, name: k } : k; });
    var screens = usedScreensHTML(c);
    if (!u.length) return (screens ? '' : areaInfo('Not found in any of the products\' pages.')) + screens;
    return '<h3 class="pg-usedin-title">In the products</h3><div class="sg-card-grid pg-usedin">' + u.map(function (k) {
      var p = (DATA.products || {})[k.key] || null, boxes = (p && p.boxes && p.boxes[c.name]) || [];
      var pct = function (v, of) { return (Math.round(v / of * 10000) / 100) + '%'; };
      // The picture says nothing the card's words do not: its name is the title beside it and the line under it says
      // where the component is marked, so a screen reader hears each once (alt="", never the name twice).
      var shot = p ? '<div class="pg-shot"><img loading="lazy" src="' + p.shot + '" alt="">' +
        (p.w ? boxes.map(function (b) { return '<span class="pg-mark" style="left:' + pct(b[0], p.w) + ';top:' + pct(b[1], p.h) + ';width:' + pct(b[2], p.w) + ';height:' + pct(b[3], p.h) + '"></span>'; }).join('') : '') + '</div>' : '';
      var where = k.ownInstead ? 'Draws its own instead (' + k.ownInstead + '); its Tasks say to use this one.' : k.figmaOnly ? 'Its screens use it in Figma; its code builds it by hand.' : k.places ? (k.places === 1 ? 'Once in its code.' : k.places + ' times in its code.') : '';
      var note = [where, !p || p.from === 'image' ? '' : boxes.length ? (boxes.length === 1 ? 'Marked where it shows when the product opens.' : 'Marked in the ' + boxes.length + ' places it shows when the product opens.') : 'Not on the screen it opens with.'].filter(Boolean).join(' ');
      var tag = k.href ? 'a' : 'div', cls = 'sg-card' + (DATA.ui && DATA.ui.card ? ' ' + DATA.ui.card.cls : ' sg-card--own');
      return '<' + tag + ' class="' + cls + '"' + (k.href ? ' href="' + esc(k.href) + '" target="_blank" rel="noopener"' : '') + '>' + shot + '<h3>' + esc(k.name) + '</h3>' + (note ? '<p class="pg-selector">' + esc(note) + '</p>' : '') + '</' + tag + '>';
    }).join('') + '</div>' + screens;
  }

  // A component that takes the whole window or most of it (a dialog, a drawer, a full view): its Playground as tall as
  // the page lets it be, so it shows as it opens, never as a strip.
  function isBig(c) { return !!((c.motion && c.motion.overlay) || /(^|\s)(dialog|alertdialog)(\s|$)/.test(c.role || '') || /modal|dialog|drawer|sheet|full\s*-?view|fullscreen|page\b|layout|screen/i.test(c.name || '')); }
