  // ── Its code API: the props (a * on each one the code says must be given), the events it sends, its slots ─────────
  function apiHTML(c) {
    var api = c.api; if (!api) return '';
    var req = (api.props || []).some(function (p) { return p.required; });
    var props = (api.props || []).map(function (p) {
      var what = p.values ? p.values.join(', ') : p.type || '';
      var def = p.default != null ? 'default ' + p.default : '';
      return '<tr><td>' + esc(p.name) + (p.required ? '<span class="pg-req" aria-hidden="true"> *</span><span class="sg-hidden-text"> (required)</span>' : '') + '</td><td>' + esc([what, def].filter(Boolean).join('  ·  ') || '-') + '</td></tr>';
    }).join('');
    var box = function (head, body, legend) { return '<div class="pg-inspect"><div class="pg-inspect-head">' + head + '</div><table>' + body + '</table>' + (legend || '') + '</div>'; };
    var list = function (xs) { return xs.map(function (x) { return '<tr><td>' + esc(x) + '</td></tr>'; }).join(''); };
    return '<div class="pg-doc"><h3>API</h3><div class="pg-inspect-grid">' +
      (props ? box('Props', props, req ? '<div class="pg-legend"><span aria-hidden="true">* </span>Must be given</div>' : '') : '') +
      ((api.events || []).length ? box('Events', list(api.events)) : '') +
      ((api.slots || []).length ? box('Slots', list(api.slots)) : '') +
      '</div><p class="pg-selector">Read from <code>' + esc(api.file) + '</code></p></div>';
  }
