  // ── The code a product writes ─────────────────────────────────────────────────────────────────────────────────────
  var low = function (x) { return String(x == null ? '' : x).toLowerCase().replace(/[\s_-]+/g, ''); };
  var attrText = function (x) { return String(x).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); };
  // The component's own tag with the props set in the playground, in its framework's syntax. A value equal to the
  // code's default (else Figma's) is left out, as a product leaves it out.
  // A tag's code coloured: its punctuation, tag name, attributes, values and bindings each in its own span, the words as
  // they are (copied as text, they are the code itself).
  function codeColours(text) {
    var e = function (x) { return String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
    var re = /(<\/?)([A-Za-z][\w.-]*)|([:@]?[A-Za-z_][\w:.-]*)(=)("[^"]*"|\{[^}]*\})|(\/?>)/g, out = '', at = 0, m;
    text = String(text);
    while ((m = re.exec(text))) {
      out += e(text.slice(at, m.index)); at = re.lastIndex;
      if (m[2]) out += '<span class="tk-punct">' + e(m[1]) + '</span><span class="tk-tag">' + e(m[2]) + '</span>';
      else if (m[3]) out += '<span class="tk-attr">' + e(m[3]) + '</span><span class="tk-punct">=</span><span class="' + (/^\{/.test(m[5]) || /^:/.test(m[3]) ? 'tk-bind' : 'tk-str') + '">' + e(m[5]) + '</span>';
      else out += '<span class="tk-punct">' + e(m[6]) + '</span>';
    }
    return out + e(text.slice(at));
  }
  function callCode(c, props, state) {
    var api = c.api, syn = api.syntax, attrs = [];
    var codeProp = function (n) { return (api.props || []).find(function (q) { return low(q.name) === low(n); }); };
    props.forEach(function (p) {
      if (p.showsPart) return;   // Figma's switch for a part: the code shows it by giving the part's props
      var name = p.prop || p.label, q = codeProp(name), v = state[p.label];
      // Every prop the Playground sets, at its value now, the defaults too: the code draws what the preview shows.
      if (p.type === 'BOOLEAN') {
        attrs.push(v ? name : syn === 'vue' ? ':' + name + '="false"' : syn === 'html' ? null : name + '={false}');
      } else if (p.type === 'VARIANT') {
        var val = q && q.values ? (q.values.find(function (x) { return low(x) === low(v); }) || v) : v;
        if (val != null && val !== '') attrs.push(name + '="' + attrText(val) + '"');
      } else if (p.type === 'TEXT' && v) {
        attrs.push(name + '="' + attrText(v) + '"');
      }
    });
    (api.props || []).forEach(function (q) {
      if (q.required && !attrs.some(function (a) { return a && low(a.replace(/^:/, '').split(/[=\s]/)[0]) === low(q.name); })) attrs.push(q.name + (syn === 'vue' || syn === 'html' ? '="…"' : '={…}'));
    });
    // Each list it was drawn with (a bar's tabs), written as the code takes it.
    Object.keys(c.codeLists || {}).forEach(function (k) {
      // A list or an object (a chart's slices, a box's params), each value as the code writes it, nested ones too.
      var lit = function (v) {
        if (Array.isArray(v)) return '[' + v.map(lit).join(', ') + ']';
        if (v && typeof v === 'object') return '{ ' + Object.keys(v).map(function (f) { return f + ': ' + lit(v[f]); }).join(', ') + ' }';
        return typeof v === 'string' ? "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'" : String(v);
      };
      var list = lit(c.codeLists[k]);
      attrs.push(syn === 'vue' ? ':' + k + '="' + list.replace(/"/g, '&quot;') + '"' : syn === 'html' ? null : k + '={' + list + '}');
    });
    attrs = attrs.filter(Boolean);
    var one = attrs.length ? ' ' + attrs.join(' ') : '';
    var open = '<' + api.tag + (one.length > 60 ? '\n  ' + attrs.join('\n  ') + '\n' : one);
    return syn === 'html' ? open + '></' + api.tag + '>' : open + (one.length > 60 ? '/>' : ' />');
  }
  // The HTML the preview draws, indented, without what the page itself set on it (its centring margin).
  var VOID_TAG = /^(area|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
  // The classes and data attributes the system's CSS styles: one the product put on its instance (a hook of its own) is
  // not shown.
  var SYS_CLASSES = null;
  function systemClasses() {
    if (SYS_CLASSES) return SYS_CLASSES;
    SYS_CLASSES = {};
    var walk = function (rules) { Array.prototype.forEach.call(rules || [], function (r) {
      if (r.selectorText) {
        (r.selectorText.match(/\.[\w-]+/g) || []).forEach(function (k) { SYS_CLASSES[k.slice(1)] = 1; });
        (r.selectorText.match(/\[\s*(data-[\w-]+)/g) || []).forEach(function (k) { SYS_CLASSES['[' + k.replace(/^\[\s*/, '')] = 1; });   // a data attribute the CSS styles by
      }
      if (r.cssRules) walk(r.cssRules);
    }); };
    Array.prototype.forEach.call(document.styleSheets, function (sh) { try { walk(sh.cssRules); } catch (x) { /* a sheet the page cannot read */ } });
    return SYS_CLASSES;
  }
  function htmlCode(e) {
    var copy = e.cloneNode(true);
    copy.style.removeProperty('margin'); copy.style.removeProperty('width');
    Array.prototype.forEach.call(copy.querySelectorAll('.pg-slot-fill'), function (n) { n.remove(); });   // the Playground's slot mark
    if (!copy.getAttribute('style')) copy.removeAttribute('style');
    var known = systemClasses();
    [copy].concat(Array.prototype.slice.call(copy.querySelectorAll('*'))).forEach(function (n) {
      Array.prototype.slice.call(n.classList).forEach(function (k) { if (!known[k]) n.classList.remove(k); });
      Array.prototype.slice.call(n.attributes).forEach(function (at) { if (/^data-/.test(at.name) && !known['[' + at.name]) n.removeAttribute(at.name); });
      if (n.hasAttribute('class') && !n.getAttribute('class').trim()) n.removeAttribute('class');
    });
    var text = function (t) { return t.replace(/\s+/g, ' ').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
    var attrs = function (n) { return Array.prototype.map.call(n.attributes, function (a) { return a.value === '' ? ' ' + a.name : ' ' + a.name + '="' + attrText(a.value) + '"'; }).join(''); };
    function out(n, depth) {
      var pad = new Array(depth + 1).join('  ');
      if (n.nodeType === 3) { var t = text(n.textContent); return t ? pad + t : ''; }
      if (n.nodeType !== 1) return '';
      var tag = n.tagName.toLowerCase(), open = '<' + tag + attrs(n) + '>';
      if (VOID_TAG.test(tag)) return pad + open;
      var kids = Array.prototype.filter.call(n.childNodes, function (k) { return k.nodeType === 1 || (k.nodeType === 3 && k.textContent.trim()); });
      if (!kids.length) return pad + open + '</' + tag + '>';
      if (kids.length === 1 && kids[0].nodeType === 3) return pad + open + text(kids[0].textContent) + '</' + tag + '>';
      return pad + open + '\n' + kids.map(function (k) { return out(k, depth + 1); }).filter(Boolean).join('\n') + '\n' + pad + '</' + tag + '>';
    }
    return out(copy, 0);
  }
