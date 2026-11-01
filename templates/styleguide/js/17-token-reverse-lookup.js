  /* ── Token reverse lookup: the token behind each computed value, resolved live ──────────────────────────────
     Every custom property the page declares is collected once; at inspect time an element's computed value is
     matched against each one resolved in that element's own context, so it stays right in every mode. */
  var VAR_NAMES = (function () {
    var seen = {}, names = [];
    function scan(rules) { for (var i = 0; i < rules.length; i++) { var r = rules[i]; if (r.style) for (var j = 0; j < r.style.length; j++) { var p = r.style[j]; if (p.slice(0, 2) === '--' && p.slice(0, 5) !== '--sg-' && !seen[p]) { seen[p] = 1; names.push(p); } } if (r.cssRules) scan(r.cssRules); } }
    try { for (var s = 0; s < document.styleSheets.length; s++) { try { scan(document.styleSheets[s].cssRules); } catch (e) {} } } catch (e) {}
    return names;
  })();
  function toRGBA(str) {
    str = (str || '').trim(); if (!str) return null;
    var cm = str.match(/^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?\s*\)/i);
    if (cm) { var a = cm[4]; a = a == null ? 1 : (a.indexOf('%') >= 0 ? parseFloat(a) / 100 : parseFloat(a)); return [Math.round(cm[1] * 255), Math.round(cm[2] * 255), Math.round(cm[3] * 255), a]; }
    if (str[0] === '#') { var h = str.length === 4 ? '#' + str[1] + str[1] + str[2] + str[2] + str[3] + str[3] : str; if (h.length < 7) return null; var n = parseInt(h.slice(1, 7), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
    var m = str.match(/rgba?\(([^)]+)\)/i);
    if (m) { var p = m[1].split(/[,\s\/]+/).filter(Boolean).map(parseFloat); return [Math.round(p[0]), Math.round(p[1]), Math.round(p[2]), p[3] == null ? 1 : p[3]]; }
    // Any other colour the page writes (a brand's colour at an opacity, color-mix(…); a named colour): as the browser
    // draws it, so a variable written that way is still found by the colour it gives.
    var drawn = probeColor(str); return drawn && drawn !== str ? toRGBA(drawn) : null;
  }
  var COLOR_PROBE = null, COLOR_DRAWN = {};
  function probeColor(str) {
    if (Object.prototype.hasOwnProperty.call(COLOR_DRAWN, str)) return COLOR_DRAWN[str];
    if (!COLOR_PROBE) { COLOR_PROBE = document.createElement('i'); COLOR_PROBE.hidden = true; document.body.appendChild(COLOR_PROBE); }
    COLOR_PROBE.style.color = ''; COLOR_PROBE.style.color = str;
    return (COLOR_DRAWN[str] = COLOR_PROBE.style.color ? getComputedStyle(COLOR_PROBE).color : '');
  }
  // A colour's key: its channels, and its opacity when it is see-through (a 6% tint is not the colour itself).
  function colorKey(str) { var c = toRGBA(str); return c ? c[0] + ',' + c[1] + ',' + c[2] + (c[3] < 0.995 ? ',' + Math.round(c[3] * 100) : '') : null; }
  function norm(v, cat) { v = (v || '').trim(); return cat === 'color' ? (colorKey(v) || v) : v; }
  function resolvedVar(el, name) { return getComputedStyle(el).getPropertyValue(name).trim(); }
  // The kind of a token by its name, so a padding value is matched against padding tokens first.
  var KIND = { pad: /padding|inset|space/i, gap: /gap|space/i, radius: /radi|corner/i, fontsize: /(font|text|type)?.*size|^--[a-z]+-size$/i };
  // The variable the code's own rule sets a property with on this element (color: var(--button-label-color)), the rule
  // that wins it (the most specific, then the last), the one an ancestor sets for a property it inherits. → its name, or
  // null when no rule names one. Read from the page's own stylesheets, as the browser applies them.
  var RULES = null;
  function styleRules() {
    if (RULES) return RULES; RULES = [];
    var walk = function (list) { Array.prototype.forEach.call(list || [], function (r) {
      if (r.selectorText && r.style) RULES.push(r);
      else if (r.cssRules) { if (r.media && window.matchMedia && !window.matchMedia(r.media.mediaText).matches) return; walk(r.cssRules); }
    }); };
    Array.prototype.forEach.call(document.styleSheets, function (sh) { try { walk(sh.cssRules); } catch (e) { /* another origin's sheet */ } });
    return RULES;
  }
  function specificity(sel) {
    var bare = sel.replace(/:(?:where)\([^)]*\)/g, '');
    var a = (bare.match(/#[\w-]+/g) || []).length, b = (bare.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length, c = (bare.replace(/\[[^\]]*\]|\([^)]*\)/g, '').match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
    return a * 10000 + b * 100 + c;
  }
  var SHORT = { 'background-color': ['background'], 'border-top-color': ['border-color', 'border-top', 'border'], 'padding-top': ['padding'], 'padding-right': ['padding'], 'padding-bottom': ['padding'], 'padding-left': ['padding'], 'border-top-left-radius': ['border-radius'], 'border-top-right-radius': ['border-radius'], 'border-bottom-right-radius': ['border-radius'], 'border-bottom-left-radius': ['border-radius'], 'row-gap': ['gap'], 'column-gap': ['gap'] };
  var INHERITS = /^(color|font-size|font-weight|line-height|letter-spacing|fill|stroke)$/;
  // → the variable's name; '' when a rule sets it with a value of its own (no token), or, inside a preview, when nothing
  // of the component sets it; null when nothing says.
  function declaredVar(el, prop) {
    var inPreview = el.closest && el.closest('.pg-preview');
    for (var at = el; at && at.nodeType === 1; at = INHERITS.test(prop) ? at.parentElement : null) {
      // Its inline style first, then the rules, then its own attribute (an SVG's fill="var(--icon-color)"), as a browser
      // weighs them.
      var own = (at.style && at.style.getPropertyValue(prop)) || '';
      if (/var\(/.test(own)) return /var\(\s*(--[\w-]+)/.exec(own)[1];
      var best = null, bestSp = -1;
      styleRules().forEach(function (r) {
        var v = r.style.getPropertyValue(prop); (SHORT[prop] || []).forEach(function (sp) { if (!v) v = r.style.getPropertyValue(sp); });
        if (!v) return;
        r.selectorText.split(',').forEach(function (sel) { var ok = false; try { ok = at.matches(sel.trim()); } catch (e) {} if (!ok) return; var sp = specificity(sel) + (r.style.getPropertyPriority(prop) ? 1e6 : 0); if (sp >= bestSp) { bestSp = sp; best = v; } });
      });
      if (!best && at.getAttribute && at.getAttribute(prop)) best = at.getAttribute(prop);
      if (best) { var m = /var\(\s*(--[\w-]+)/.exec(best); return m ? m[1] : (/^(inherit|currentcolor)$/i.test(best.trim()) && INHERITS.test(prop) ? declaredVar(at.parentElement, /^(fill|stroke)$/.test(prop) && /currentcolor/i.test(best) ? 'color' : prop) : ''); }
      if (at.classList && at.classList.contains('pg-preview')) return '';   // never past the stage: the page's own text is not the component's
    }
    return inPreview ? '' : null;
  }
  // Which of its properties the value is, for a value the inspector was given alone.
  var PROPS_OF = { color: ['color', 'background-color', 'border-top-color', 'fill', 'stroke'], pad: ['padding-top', 'padding-right', 'padding-bottom', 'padding-left'], radius: ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius'], gap: ['row-gap', 'column-gap'] };
  function tokenName(el, value, cat, compName) {
    if (!value || value === 'none' || value === 'normal' || value === '0px' || value === '0') return null;
    var target = norm(value, cat); if (target == null) return null;
    // The variable its own rule names, when it draws this value: what the code says, never a guess by value.
    if (el && el.nodeType === 1) {
      var ecs = getComputedStyle(el);
      var props = (PROPS_OF[cat] || []).filter(function (p) { return norm(ecs.getPropertyValue(p), cat) === target; });
      var said = false;
      for (var i = 0; i < props.length; i++) { var d = declaredVar(el, props[i]); if (d && norm(resolvedVar(el, d), cat) === target) return d; if (d != null) said = true; }
      // Inside a component, what its code sets with no token (a transparent border) or does not set is named by no token.
      if (said && el.closest && el.closest('.pg-preview')) return null;
    }
    var vcs = getComputedStyle(el), rv = function (n) { return vcs.getPropertyValue(n).trim(); };   // one computed style for every variable
    var hits = VAR_NAMES.filter(function (n) { return (cat === 'color' || !KIND[cat] || KIND[cat].test(n)) && norm(rv(n), cat) === target; });
    if (!hits.length && cat !== 'color') hits = VAR_NAMES.filter(function (n) { return norm(rv(n), cat) === target; });
    if (!hits.length) return null;
    var own = compName ? '--' + String(compName).toLowerCase().replace(/[^a-z0-9]+/g, '-') : null;
    // Several tokens with the same value: the one the component's own rules use first, then one that names the part
    // (badge/label for .badge-label), so a label's colour is not called the icon's.
    var comp = compName ? COMPONENTS.find(function (k) { return k.name === compName; }) : COMPONENTS.find(function (k) { return k.cls && el.closest && el.closest(clsSel(clsName(k))); });
    var uses = comp && comp.allTokens ? comp.allTokens.map(function (t) { return t.var; }) : [];
    var words = String(el.getAttribute && el.getAttribute('class') || '').split(/[\s_-]+/).filter(function (w) { return w.length > 2 && (!comp || w.toLowerCase() !== String(comp.cls || '').toLowerCase()); }).map(function (w) { return w.toLowerCase(); });
    function rank(n) {
      var l = n.toLowerCase(), r = own && l.indexOf(own + '-') === 0 ? 0 : /semantic|text|surface|background|border|content/.test(n) ? 1 : /primitive|neutral|gray|grey|[0-9]{2,}/.test(n) ? 3 : 2;
      if (uses.indexOf(n) >= 0) r -= 0.5;
      if (words.some(function (w) { return l.indexOf(w) >= 0; })) r -= 0.25;
      return r;
    }
    return hits.sort(function (a, b) { var d = rank(a) - rank(b); return d || (a.length - b.length); })[0];
  }
  function rgbToHex(c) { return '#' + [c[0], c[1], c[2]].map(function (n) { return ('0' + n.toString(16)).slice(-2); }).join(''); }
  function tok(el, value, cat, compName) {
    var t = tokenName(el, value, cat, compName);
    if (cat === 'color') { var c = toRGBA(value); if (!c) return t || value; var hex = rgbToHex(c) + (c[3] < 0.999 ? ' ' + Math.round(c[3] * 100) + '%' : ''); return t ? t + '  ·  ' + hex : hex; }
    return t ? t + '  ·  ' + value : value;
  }
  function sideTok(el, v, cat) { if (v === '0px' || v === '0') return '0'; var n = tokenName(el, v, cat); return n ? n + '  ·  ' + v : v; }
  function padRows(el, cs) {
    var t = cs.paddingTop, r = cs.paddingRight, b = cs.paddingBottom, l = cs.paddingLeft;
    if (t === r && r === b && b === l) return [['padding', sideTok(el, t, 'pad')]];
    if (t === b && l === r) return [['padding-top-bottom', sideTok(el, t, 'pad')], ['padding-left-right', sideTok(el, l, 'pad')]];
    return [['padding-top', sideTok(el, t, 'pad')], ['padding-right', sideTok(el, r, 'pad')], ['padding-bottom', sideTok(el, b, 'pad')], ['padding-left', sideTok(el, l, 'pad')]];
  }
  function radiusRows(el, cs) {
    var tl = cs.borderTopLeftRadius, tr = cs.borderTopRightRadius, br = cs.borderBottomRightRadius, bl = cs.borderBottomLeftRadius;
    function one(v) { return (v === '0px' || v === '0') ? '0' : sideTok(el, v, 'radius'); }
    if (tl === tr && tr === br && br === bl) return [['radius', one(tl)]];
    return [['border-top-left-radius', one(tl)], ['border-top-right-radius', one(tr)], ['border-bottom-right-radius', one(br)], ['border-bottom-left-radius', one(bl)]];
  }
  // The text style whose size and weight the element carries, named the way the typography section names it.
  function textStyleOf(el, cs) {
    return (TOKENS.typography || []).find(function (t) { return t.size && resolvedVar(el, t.size.var) === cs.fontSize && (!t.weight || String(resolvedVar(el, t.weight.var)) === String(cs.fontWeight)); }) || null;
  }
  // Every field of a text as drawn, each with the variable it comes from: its style's own (size, line height, weight,
  // letter spacing) and the system's family. [[field, value]]; a field the browser leaves at normal is left out.
  function fontFields(el, cs) {
    var st = textStyleOf(el, cs), v = function (k) { return st && st[k] && st[k].var ? st[k].var : null; };
    var withVar = function (name, value) { return name ? name + '  ·  ' + value : value; };
    var lh = cs.lineHeight === 'normal' ? null : cs.lineHeight, ls = cs.letterSpacing === 'normal' || cs.letterSpacing === '0px' ? null : cs.letterSpacing;
    var fam = String(cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
    return [['text style', st ? st.scale : '-'], ['font size', withVar(v('size'), cs.fontSize)], ['line height', lh ? withVar(v('lh'), lh) : 'normal'], ['font weight', withVar(v('weight'), cs.fontWeight)]]
      .concat(ls ? [['letter spacing', withVar(v('ls'), ls)]] : [])
      .concat(fam ? [['font family', withVar(TYPE_FAMILY && TYPE_FAMILY.var && /^--/.test(TYPE_FAMILY.var) ? TYPE_FAMILY.var : null, fam)]] : []);
  }
  // The same on one line, for a part of the component: its style, size / line height / weight, then each variable.
  function fontTok(el, cs) {
    var st = textStyleOf(el, cs), lh = cs.lineHeight === 'normal' ? 'normal' : cs.lineHeight;
    var vars = st ? ['size', 'lh', 'weight', 'ls'].map(function (k) { return st[k] && st[k].var; }).filter(Boolean) : [];
    return (st ? st.scale + '  ·  ' : '') + cs.fontSize + ' / ' + lh + ' / ' + cs.fontWeight + (vars.length ? '  ·  ' + vars.join('  ·  ') : '');
  }
  // Each part drawn inside the component, as it is now (a prop that shows, hides or restyles a part changes these rows):
  // an icon by its size and colour, a text by its text style and colour.
  // Whether the component, as drawn now, shows any text: a part hidden by a prop (Show Text off) takes its text style
  // and colour out of the tokens with it.
  function drawsText(root) {
    return [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).some(function (k) {
      if (!(Array.prototype.some.call(k.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); }) || /^(INPUT|TEXTAREA)$/.test(k.tagName))) return false;
      var b = k.getBoundingClientRect(), cs = getComputedStyle(k);
      return b.width > 2 && b.height > 2 && cs.visibility !== 'hidden' && +cs.opacity > 0;
    });
  }
  function partRows(root, compName) {
    var rows = [], seen = {};
    root.querySelectorAll('*').forEach(function (k) {
      if (rows.length >= 10 || k.closest('svg') !== k && k.closest('svg')) return;
      var b = k.getBoundingClientRect(); if (b.width <= 2 || b.height <= 2) return;
      var kcs = getComputedStyle(k); if (kcs.visibility === 'hidden' || +kcs.opacity === 0) return;   // a part no one sees (a native input under its drawn box) is not listed
      var name = (k.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0] || k.tagName.toLowerCase();
      var v;
      if (k.tagName.toLowerCase() === 'svg') {
        // Its colour as its shapes are drawn (a path's own fill="var(--icon-color)"), else the one the icon carries.
        var shape = Array.prototype.find.call(k.querySelectorAll('path, circle, rect, polygon, ellipse, line, polyline'), function (x) { var xs = getComputedStyle(x); return (xs.fill && xs.fill !== 'none') || (xs.stroke && xs.stroke !== 'none'); });
        var scs = shape ? getComputedStyle(shape) : null, src = shape && scs.fill && scs.fill !== 'none' ? shape : k;
        var col = (scs ? [scs.fill, scs.stroke] : []).concat([kcs.color, kcs.stroke, kcs.fill]).filter(function (x) { return x && x !== 'none' && x !== 'rgba(0, 0, 0, 0)'; })[0];
        v = Math.round(b.width) + '×' + Math.round(b.height) + 'px' + (col ? '  ·  ' + tok(src, col, 'color', compName) : '');
        name = name === 'svg' ? 'icon' : name;
      } else if (Array.prototype.some.call(k.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); }) || /^(INPUT|TEXTAREA)$/.test(k.tagName)) {
        v = fontTok(k, kcs) + '  ·  ' + tok(k, kcs.color, 'color', compName);
      } else return;
      var key = name + v; if (seen[key]) return; seen[key] = 1;
      rows.push([name, v]);
    });
    return rows;
  }
  function extraColorRows(el, preview, compName) {
    var rows = [], seen = {};
    function mark(node, v) { var t = tokenName(node, v, 'color', compName); if (t) seen[t] = 1; }
    var rcs = getComputedStyle(el); mark(el, rcs.color); mark(el, rcs.backgroundColor); mark(el, rcs.borderTopColor);
    var iconN = 0;
    preview.querySelectorAll('svg').forEach(function (svg) {
      var scs = getComputedStyle(svg);
      var cands = [scs.color, scs.stroke, scs.fill].filter(function (v) { return v && v !== 'none' && v !== 'rgb(0, 0, 0)' && v !== 'rgba(0, 0, 0, 0)'; });
      for (var i = 0; i < cands.length; i++) { var t = tokenName(svg, cands[i], 'color', compName); if (t && !seen[t]) { seen[t] = 1; iconN++; rows.push([iconN > 1 ? 'icon ' + iconN : 'icon', tok(svg, cands[i], 'color', compName)]); break; } }
    });
    preview.querySelectorAll('*').forEach(function (node) {
      if (node === el || node.tagName.toLowerCase() === 'svg' || node.closest('svg')) return;
      var ownText = false; for (var i = 0; i < node.childNodes.length; i++) if (node.childNodes[i].nodeType === 3 && node.childNodes[i].textContent.trim()) ownText = true;
      if (!ownText) return;
      var col = getComputedStyle(node).color, t = tokenName(node, col, 'color', compName);
      if (t && !seen[t]) { seen[t] = 1; var cl = (typeof node.className === 'string' && node.className) ? node.className.split(' ')[0].replace(/^[a-zA-Z]+-/, '') : node.tagName.toLowerCase(); rows.push([(cl || 'text') + ' color', tok(node, col, 'color', compName)]); }
    });
    return rows;
  }

