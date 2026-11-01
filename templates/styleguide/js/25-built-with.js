  // ── Built with: the system's components it is made of, each the card the overview shows (its own preview, drawn
  // small, and its name), linked to its page ──────────────────────────────────────────────────────────────────────────
  // A component's History chips: its changes, its decisions, or both.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.sg-chip[data-hist]'); if (!b) return;
    var area = b.closest('.pg-area'), k = b.getAttribute('data-hist'); if (!area) return;
    Array.prototype.forEach.call(area.querySelectorAll('.sg-chip[data-hist]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    Array.prototype.forEach.call(area.querySelectorAll('.pg-inspect[data-hist]'), function (card) { card.hidden = k !== 'all' && card.getAttribute('data-hist') !== k; });
    if (e.isTrusted) setHashQuery({ show: k });
  });
  function builtWithHTML(c) {
    return '<div class="sg-card-grid">' + builtUses(c).map(function (n) {
      return '<a class="sg-card' + (DATA.ui && DATA.ui.card ? ' ' + esc(DATA.ui.card.cls) : ' sg-card--own') + '" href="#' + esc(cid(n)) + '"><div class="sg-thumb" aria-hidden="true" data-thumb="' + esc(n) + '"></div><h3>' + esc(n) + '</h3></a>';
    }).join('') + '</div>';
  }
  // What it is built with: the system's components it holds, its own parts aside (they have the Parts area).
  function builtUses(c) { return (c.uses || []).filter(function (n) { return (c.parts || []).indexOf(n) < 0; }); }
  // Its parts: the components only placed inside it, each a card to its own page, then what its page says of each
  // (the root's Parts section, under the part's name), or where to write it.
  function partsHTML(c) {
    var parts = (c.parts || []).map(function (n) { return COMPONENTS.find(function (k) { return k.name === n; }); }).filter(Boolean);
    var cardOf = function (p) { return '<a class="sg-card' + (DATA.ui && DATA.ui.card ? ' ' + esc(DATA.ui.card.cls) : ' sg-card--own') + '" href="#' + esc(cid(p.name)) + '"><div class="sg-thumb" aria-hidden="true" data-thumb="' + esc(p.name) + '"></div><h3>' + esc(p.name) + '</h3></a>'; };
    var page = parts[0] && parts[0].partOf && parts[0].partOf.page;
    var docs = parts.map(function (p) {
      var lines = (p.partOf && p.partOf.docs) || [];
      return '<div class="pg-inspect"><div class="pg-inspect-head"><a class="sg-uses-link" href="#' + esc(cid(p.name)) + '">' + esc(p.name) + '</a></div><table>' +
        (lines.length ? lines.map(function (l) { return '<tr><td>' + esc(l) + '</td></tr>'; }).join('')
          : '<tr><td><span class="pg-dim">Not documented yet. Write it in ' + (page ? esc(page.file) : 'its page in the intent layer') + ', under Parts, as ### ' + esc(p.name) + '.</span></td></tr>') + '</table></div>';
    }).join('');
    return '<p class="pg-par-sum">Placed only inside ' + esc(c.name) + ', never on their own. Each is documented here, in its page\'s Parts section.</p><div class="sg-card-grid">' + parts.map(cardOf).join('') + '</div><div class="pg-cards">' + docs + '</div>';
  }
