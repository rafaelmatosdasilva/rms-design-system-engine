  // ── Its code API: the props (a * on each one the code says must be given), the events it sends, its slots ─────────
  function apiHTML(c) {
    var api = c.api; if (!api) return '';
    var req = (api.props || []).some(function (p) { return p.required; });
    var props = (api.props || []).map(function (p) {
      var what = p.values ? namePills(p.values) : esc(p.type || '');
      var def = p.default != null ? esc('default ' + p.default) : '';
      return '<tr><td>' + esc(p.name) + (p.required ? '<span class="pg-req" aria-hidden="true"> *</span><span class="sg-hidden-text"> (required)</span>' : '') + '</td><td>' + ([what, def].filter(Boolean).join(esc('  ·  ')) || '-') + '</td></tr>';
    }).join('');
    var box = function (head, body, legend) { return '<div class="pg-inspect"><div class="pg-inspect-head">' + head + '</div><table>' + body + '</table>' + (legend || '') + '</div>'; };
    var list = function (xs) { return xs.map(function (x) { return '<tr><td>' + esc(x) + '</td></tr>'; }).join(''); };
    return '<div class="pg-doc"><h3>API</h3><div class="pg-inspect-grid">' +
      (props ? box('Props', props, req ? '<div class="pg-legend"><span aria-hidden="true">* </span>Must be given</div>' : '') : '') +
      ((api.events || []).length ? box('Events', list(api.events)) : '') +
      ((api.slots || []).length ? box('Slots', list(api.slots)) : '') +
      '</div><p class="pg-selector">Read from <code>' + esc(api.file) + '</code></p></div>';
  }
  // ── What the team wrote in its Storybook: the component's description, each story as a worked example with the args it
  // is drawn with, and each place Storybook and the code or Figma disagree, each side's value named. Read from the
  // story file, as the team wrote it (its contract's Storybook part).
  // Each place a component's Storybook and its code or Figma disagree, one list item each, each side's value named. On its
  // Code area and in its Documentation, where the disagreement is a task.
  function storybookDiffers(sb) {
    var val = function (v) { return '<code class="sg-name">' + esc(String(v)) + '</code>'; };
    return ((sb && sb.differs) || []).map(function (d) {
      var other = [d.code != null ? 'the code says ' + val(d.code) : '', d.figma != null ? 'Figma says ' + val(d.figma) : ''].filter(Boolean).join(' and ');
      return '<li>' + val(d.prop) + ', ' + esc(d.what) + '. Storybook says ' + val(d.storybook) + (other ? ', and ' + other : '') + '.</li>';
    }).join('');
  }
  function storybookHTML(c) {
    var sb = c.storybookDocs; if (!sb) return '';
    var val = function (v) { return '<code class="sg-name">' + esc(String(v)) + '</code>'; };
    var rows = (sb.examples || []).map(function (e) {
      var args = Object.keys(e.args || {}).map(function (k) { return esc(k) + ' ' + val(e.args[k]); }).join(esc('  ·  '));
      return '<tr><td>' + esc(e.name) + '</td><td>' + (args || esc('its defaults')) + '</td></tr>';
    }).join('');
    var differs = storybookDiffers(sb);
    return '<div class="pg-doc pg-storybook"><h3>Storybook</h3>' + (sb.description ? '<p>' + esc(sb.description) + '</p>' : '') +
      (rows ? '<div class="pg-inspect"><div class="pg-inspect-head">Its stories</div><table>' + rows + '</table></div>' : '') +
      (differs ? '<p>Where Storybook and the code or Figma disagree:</p><ul class="pg-storybook-differs">' + differs + '</ul>' : '') +
      (sb.from ? '<p class="pg-selector">Read from <code>' + esc(sb.from) + '</code></p>' : '') + '</div>';
  }
