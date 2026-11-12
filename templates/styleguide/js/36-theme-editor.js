// The theme editor: the style guide's editor for new themes of the system. Create new theme… in the Theme choice (or a
// button beside it, for a system with no brands) opens a panel: the form on the left (from scratch today; from a Figma
// file, a file of tokens or pictures next), a Showroom screen on the right that takes the theme live while it is set,
// and a component clicked in it shows its own tokens to change. A theme is kept in this browser and as a file in the
// person's themes folder (styleguide.themes: <folder>/<system>/), which the next build puts into the page; the team's
// themes store adds the ones others made. It changes no code: a theme is tokens over the system, never the system.
// Its own script, after the page's (which it builds on: window.SG); its themes are in #sg-theme-editor-data.
(function () {
  var SG = window.SG; if (!SG || !SG.themeBar) return;
  var DATA_EL = document.getElementById('sg-theme-editor-data'), EDITOR = (function () { try { return JSON.parse((DATA_EL && DATA_EL.textContent) || '{}') || {}; } catch (e) { return {}; } })();
  var esc = SG.esc, T = SG.tokens || {}, KEY = 'sg-theme-draft';
  // Every variable of the system, each with its CSS variable: its own, else its Figma name as the system writes it
  // (a/b/c → --a-b-c; a switch has none in the page's data). A copy: the page's own data is left as it is.
  var VARS = (SG.allVars || []).map(function (v) { return Object.assign({}, v, { var: v.var || '--' + String(v.figma).split('/').join('-').replace(/\s+/g, '') }); });
  var PLUS = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>';
  var draft = (function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } })() || {};
  var keep = function () { try { localStorage.setItem(KEY, JSON.stringify(draft)); } catch (e) { /* this browser keeps nothing */ } };

  // Colour: hex ⇄ OKLCH, so a new colour keeps each step of a scale as light as the system's own step.
  // A colour as #rrggbb plus its alpha (1 when opaque), from #rgb, #rrggbb, #rrggbbaa, rgb(a)() or color(srgb …).
  var parse = function (v) {
    var raw = String(v || '').trim(), m;
    if ((m = raw.match(/#([0-9a-f]{8})\b/i))) return { hex: '#' + m[1].slice(0, 6).toLowerCase(), a: parseInt(m[1].slice(6), 16) / 255 };
    if ((m = raw.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+%?))?/i))) return { hex: '#' + [m[1], m[2], m[3]].map(function (x) { return Math.round(Math.min(1, +x) * 255).toString(16).padStart(2, '0'); }).join(''), a: m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4] };
    if ((m = raw.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/i))) return { hex: '#' + [m[1], m[2], m[3]].map(function (x) { return Math.round(+x).toString(16).padStart(2, '0'); }).join(''), a: m[4] == null ? 1 : /%$/.test(m[4]) ? parseFloat(m[4]) / 100 : +m[4] };
    var h = hexOfPlain(raw); return h ? { hex: h, a: 1 } : null;
  };
  var withAlpha = function (hex, a) { return a == null || a >= 0.999 ? hex : hex + Math.round(a * 255).toString(16).padStart(2, '0'); };
  var hexOf = function (v) { var p = parse(v); return p ? withAlpha(p.hex, p.a) : null; };
  var hex6 = function (v) { var p = parse(v); return p ? p.hex : null; };
  var alphaOf = function (v) { var p = parse(v); return p ? p.a : 1; };
  var hexOfPlain = function (v) { var m = String(v || '').match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i); if (!m) return null; var h = m[0]; return h.length === 4 ? '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3] : h.toLowerCase(); };
  var lin = function (c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  var gam = function (c) { return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; };
  var toLch = function (hex) {
    hex = hex6(hex) || '#000000';
    var r = lin(parseInt(hex.slice(1, 3), 16)), g = lin(parseInt(hex.slice(3, 5), 16)), b = lin(parseInt(hex.slice(5, 7), 16));
    var l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    var L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return { l: L, c: Math.sqrt(A * A + B * B), h: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
  };
  var rgbOf = function (L, C, H) {
    var A = C * Math.cos(H * Math.PI / 180), B = C * Math.sin(H * Math.PI / 180);
    var l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3), m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3), s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(gam);
  };
  var fromLch = function (L, C, H) {
    var rgb = rgbOf(L, C, H);
    for (var i = 0; i < 24 && rgb.some(function (x) { return x < -0.001 || x > 1.001; }); i++) { C *= 0.9; rgb = rgbOf(L, C, H); }   // inside sRGB: less colourful, never another lightness
    return '#' + rgb.map(function (x) { return Math.round(Math.min(1, Math.max(0, x)) * 255).toString(16).padStart(2, '0'); }).join('');
  };
  var hueGap = function (a, b) { var d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

  // The system's own choices, to start from: its families, its radii, its primary and secondary colours.
  var WEB_FONTS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'DM Sans', 'Manrope', 'Work Sans', 'IBM Plex Sans', 'Source Sans 3', 'Space Grotesk', 'Nunito', 'Playfair Display', 'Merriweather', 'JetBrains Mono'];
  var firstFamily = function (css) { return String(css || '').split(',')[0].replace(/["']/g, '').trim(); };
  var families = (function () {
    var out = [], add = function (f) { f = firstFamily(f); if (f && !out.some(function (x) { return x.toLowerCase() === f.toLowerCase(); })) out.push(f); };
    if (T.typeFamily) add(T.typeFamily.value || T.typeFamily.css || T.typeFamily.family);
    (T.typography || []).forEach(function (t) { if (t.family) add(t.family.value || t.family.css); });
    WEB_FONTS.forEach(add);
    return out;
  })();
  // A family drawn as chosen: one the page has no face for (and that is not one every computer has) is loaded from
  // Google Fonts, in the page and in the preview's frame, so what is chosen is what is seen and what a theme keeps.
  var SYSTEM_FONTS = /^(system-ui|-apple-system|sans-serif|serif|monospace|arial|helvetica|helvetica neue|times|times new roman|georgia|verdana|courier|courier new|segoe ui)$/i;
  var ensureFont = function (family, doc) {
    family = firstFamily(family); doc = doc || document; if (!family || SYSTEM_FONTS.test(family)) return;
    var has = Array.prototype.some.call(doc.fonts || [], function (f) { return firstFamily(f.family).toLowerCase() === family.toLowerCase(); });
    var id = 'sg-ts-font-' + family.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    if (has || doc.getElementById(id)) return;
    var l = doc.createElement('link'); l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(family).replace(/%20/g, '+') + ':wght@300;400;500;600;700;800&display=swap';
    doc.head.appendChild(l);
  };
  var pretty = function (f) { return String(f).replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); };
  var radii = (T.radii || []).map(function (r) { return { name: r.figma || r.var, v: r.var, px: parseFloat(r.value != null ? r.value : r.px) }; }).filter(function (r) { return r.name && !isNaN(r.px); });
  var radiusNamed = function (re) { return radii.filter(function (x) { return re.test(x.name); })[0] || null; };
  var colourToken = function (re) {
    var best = null;
    (T.colors || []).forEach(function (g) { (g.items || []).forEach(function (t) {
      var name = String(t.figma || t.var || ''); if (!re.test(name)) return;
      var vals = t.values || {}, v = hexOf(vals[Object.keys(vals)[0]] || t.value);
      // A semantic token (an action's or a brand's colour) before a ramp's step.
      var score = (/action|brand|interactive/i.test(name) ? 2 : 0) + (/background|fill|surface|default/i.test(name) ? 1 : 0);
      if (v && (!best || score > best.score)) best = { v: t.var, hex: v, score: score };
    }); });
    return best;
  };
  // The themes the file has (its extended collections: the brands the guide's Theme choice lists), each named with the
  // theme it extends; a theme others are built on is listed too, as one can start from it.
  var THEMES = (function () {
    var list = (SG.brands && SG.brands.list) || [], byKey = {};
    list.forEach(function (b) { byKey[b.key] = b; });
    return [['', 'Standard']].concat(list.map(function (b) { var up = b.parent && byKey[b.parent]; return [b.key, up ? up.name + ' · ' + b.name : b.name]; }));
  })();
  var PRIMARY = colourToken(/primary/i), SECONDARY = colourToken(/secondary/i);
  // The app's background: the token named for it (app, page or canvas background), from every variable the system has.
  var FONT = T.typeFamily && T.typeFamily.var ? { v: T.typeFamily.var } : null;
  // Shadows: the system's switch for them (a shadow …display token, the shortest named) and each shadow's colour token.
  // A token's CSS variable: its own, else its Figma name as the system writes it (a/b/c → --a-b-c; a switch has none in the page's data).
  var varOf = function (v) { return v.var || '--' + String(v.figma).split('/').join('-').replace(/\s+/g, ''); };
  var SHADOW = (function () { var v = VARS.filter(function (x) { return /shadow/i.test(x.figma) && /display/i.test(x.figma); }).sort(function (x, y) { return x.figma.length - y.figma.length; })[0]; return v ? { v: varOf(v), figma: v.figma, values: v.values } : null; })();
  // Every shadow's own switch: all follow the theme's choice, so what reads them (Identity) sees shadows on or off.
  var OWN = '*:not([class^="sg-"], [class*=" sg-"], [class^="pg-"], [class*=" pg-"])';   // the system's elements, not the guide's own
  var SHADOW_ALL = VARS.filter(function (x) { return /shadow/i.test(x.figma) && /display$/i.test(x.figma); }).map(varOf);
  var SHADOW_COLOURS = VARS.filter(function (v) { return v.var && /shadow/i.test(v.figma) && /colou?r$/i.test(v.figma); });
  var shadowsOn = SHADOW ? String(SHADOW.values[0]) === 'true' : true;
  var APP_BG = (function () {
    var v = VARS.filter(function (x) { return x.var && /(app|page|canvas)[\s_/-]*background|background[\s_/-]*(app|page)/i.test(x.figma) && hexOf(x.values && x.values[0]); })
      .sort(function (x, y) { return x.figma.length - y.figma.length; })[0];
    return v ? { v: v.var, hex: hexOf(v.values[0]) } : null;
  })();
  var mostFollowed = function (test) {
    var cands = VARS.filter(function (v) { return v.var && test(v.figma) && !(v.aliases && v.aliases[0]) && /^[\d.]+px$/.test(String(v.values && v.values[0]).trim()); });
    var count = function (v) { var n = 0; VARS.forEach(function (x) { if (x.aliases && x.aliases[0] === v.figma) n++; }); return n; };
    var best = cands.sort(function (x, y) { return count(y) - count(x) || x.figma.length - y.figma.length; })[0];
    return best ? { v: best.var, figma: best.figma, px: parseFloat(best.values[0]) } : null;
  };
  var BORDER = mostFollowed(function (f) { return /border|stroke/i.test(f) && !/colou?r|radius|display|appearance/i.test(f); });
  var BLUR = mostFollowed(function (f) { return /shadow/i.test(f) && /blur/i.test(f); });
  var SPACES = VARS.filter(function (v) { return v.var && /(^|\/)(spacing|gap|padding|margin)(\/|$)|padding|gap|margin/i.test(v.figma) && !/radius/i.test(v.figma) && !(v.aliases && v.aliases.some(Boolean)) && /^-?[\d.]+(px)?$/.test(String(v.values && v.values[0]).trim()); });
  // A gradient: a background the system gives in stops (…/<part>/background/start, …/end), two at least. Each is named
  // after its part (sidebarContainer → Sidebar background), and its stem (sidebar) names the texts and icons drawn on it.
  var GRADIENTS = (function () {
    var groups = {};
    VARS.forEach(function (v) { var g = String(v.figma).match(/^((?:.*\/)?([^/]+)\/background)\/(start|top|left|middle|mid|center|end|bottom|right|stop\d*)(colou?r)?$/i); if (g && v.var && hexOf(v.values && v.values[0])) (groups[g[1]] = groups[g[1]] || { part: g[2], stops: [] }).stops.push({ v: v.var, figma: v.figma, stop: g[3].toLowerCase(), hex: hexOf(v.values[0]) }); });
    var order = ['start', 'top', 'left', 'stop1', 'middle', 'mid', 'center', 'stop2', 'end', 'bottom', 'right'];
    return Object.keys(groups).filter(function (k) { return groups[k].stops.length >= 2; }).map(function (k) {
      var g = groups[k], stem = g.part.replace(/(container|wrapper|surface)$/i, '') || g.part;
      var name = stem.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); }).trim() + ' background';
      return { name: name, stem: stem, stops: g.stops.sort(function (x, y) { return order.indexOf(x.stop) - order.indexOf(y.stop); }) };
    });
  })();
  var STOPS = []; GRADIENTS.forEach(function (g) { g.stops.forEach(function (st) { st.id = 'ts-g' + STOPS.length; st.stem = g.stem; st.label = g.name + ' · ' + st.stop.charAt(0).toUpperCase() + st.stop.slice(1); STOPS.push(st); }); });
  // A colour in dark, for a token the system draws lighter or darker in dark: moved by as much as the system moves it.
  var tokenDark = function (st, hex) { var v = BYVAR[st.v]; if (!v) return hex6(hex); var n = toLch(hex), shift = toLch(shown(v, 'dark')).l - toLch(shown(v, 'light')).l; return fromLch(Math.min(0.99, Math.max(0.01, n.l + shift)), n.c, n.h); };
  var BTN = radiusNamed(/button/i) || radiusNamed(/control/i) || radii[0] || null, CARD = radiusNamed(/card/i) || radiusNamed(/container|surface/i) || radii[radii.length - 1] || null;
  var start = {
    name: '', fontFamily: families[0] || '', primary: PRIMARY ? PRIMARY.hex : '#2563eb', secondary: SECONDARY ? SECONDARY.hex : '#64748b', appBg: APP_BG ? APP_BG.hex : '#ffffff',
    buttonRadius: BTN ? BTN.px : 8, cardRadius: CARD ? CARD.px : 16, borderWidth: BORDER ? BORDER.px : 1, shadowBlur: BLUR ? BLUR.px : 16, spacing: 100, shadows: shadowsOn
  };
  var asPx = function (v) { return v && typeof v === 'object' ? v.px : v; };   // a draft kept before the sliders held { token, px }
  var brief = Object.assign({}, start, draft.brief || {});
  brief.buttonRadius = asPx(brief.buttonRadius); brief.cardRadius = asPx(brief.cardRadius);
  var source = draft.source || 'scratch';
  var ICON = function (d) { return '<svg class="sg-ts-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">' + d + '</svg>'; };
  var STARTS = [
    ['figma', 'From a Figma file', SG.icons && SG.icons.figma ? SG.icons.figma.replace(/class="[^"]*"/, 'class="sg-ts-icon"') : ICON('<path d="M6 2h4a2 2 0 0 1 0 4H6a2 2 0 0 1 0-4Z"/>')],   // the guide's own Figma mark
    ['file', 'Upload tokens', ICON('<path d="M8 10V2.5M5 5.5l3-3 3 3"/><path d="M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10"/>')],
    ['scratch', 'From scratch', ICON('<path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5Z"/><path d="M9 4l3 3"/>')],
    ['references', 'From references', ICON('<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1.2"/><path d="M14 10.5l-3.5-3.5L4 13"/>')]
  ];
  var START_SAYS = { figma: 'Read the variables of another Figma file and match them to these tokens.', file: 'Bring tokens as JSON (DTCG or a theme), CSS variables, or a .zip of them.', scratch: 'Set the colours, the type, the corners and the spacing yourself.', references: 'Upload pictures (screens, moodboards) to build a theme from them.' };
  var startName = function (k) { return (STARTS.filter(function (x) { return x[0] === k; })[0] || STARTS[2])[1]; };
  // A new theme starts from the theme the guide shows (its own brand, under a saved theme the brand that one is based on).
  var baseTheme = document.documentElement.getAttribute('data-brand') || '';

  // The theme over the system: the tokens it changes, then every token that points at one of them declared again on the
  // preview's screen, so the whole chain takes the new values there and nowhere else. Light and dark each: a new colour
  // is given in light; in dark, each token keeps the system's own dark lightness and takes the new hue, so the dark
  // values follow from the light ones as the system's do.
  var BY = {}, BYVAR = {}; VARS.forEach(function (v) { BY[v.figma] = v; if (v.var) BYVAR[v.var] = v; });
  // Each component's own tokens (advanced/cardTile/background/color → cardTile), so a component picked in the
  // preview shows what it is made of.
  var normN = function (n) { return String(n || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var COMP_TOK = {};
  var OWNER = {};   // a component token's CSS variable → its component's key
  VARS.forEach(function (v) { var p = String(v.figma).split('/'); if (!v.var || p.length < 3 || !/^(advanced|components?)$/i.test(p[0])) return; var k = normN(p[1]); (COMP_TOK[k] = COMP_TOK[k] || { name: p[1], toks: [] }).toks.push(v); OWNER[v.var] = k; });
  // The component an element of a screen belongs to: the nearest one whose class names it (card-primary, has-card-primary…).
  var compOf = function (el) {
    for (var n = el; n && n.nodeType === 1 && n.id !== 'ts-screen'; n = n.parentElement) {
      var cls = String(n.getAttribute('class') || '').split(/\s+/);
      for (var i = 0; i < cls.length; i++) { var k = normN(cls[i].replace(/^(has|is)-/, '').replace(/-(wrapper|container|styles)$/, '')); if (k && COMP_TOK[k]) return { el: n, key: k }; }
    }
    return null;
  };
  var MODES = (VARS.filter(function (v) { return (v.modes || []).length > 1; })[0] || { modes: ['Light'] }).modes;
  var modeIndex = function (mode) { var i = MODES.map(function (x) { return String(x).toLowerCase(); }).indexOf(mode); return i < 0 ? (mode === 'dark' ? Math.min(1, MODES.length - 1) : 0) : i; };
  var COLOUR_AXIS = (SG.axes || []).filter(function (a) { return a.colour && a.attr; })[0] || null;
  var axisValue = function (mode) { if (!COLOUR_AXIS) return null; var v = (COLOUR_AXIS.values || []).filter(function (x) { return new RegExp(mode, 'i').test(x.label || x.value); })[0]; return v ? v.value : null; };
  var liveHex = function (cssVar, at) {
    return hexOf((at.getPropertyValue ? at : getComputedStyle(at)).getPropertyValue(cssVar));
  };
  // What the screen shows for each colour token in each mode (the brand it is drawn in), read before any theme is on it.
  var LIVE = { light: {}, dark: {} }, MIXED = { light: {}, dark: {} };
  var readLive = function (el, mode) {
    var m = modeIndex(mode), out = LIVE[mode] = {}, mix = MIXED[mode] = {}, cs = (el.ownerDocument.defaultView || window).getComputedStyle(el);
    VARS.forEach(function (v) {
      if (!v.var || !hexOf(v.values && v.values[m])) return;
      var raw = cs.getPropertyValue(v.var).trim();
      // Made from another colour (a mix of the primary, say): it follows that colour by itself, so it is never set.
      if (/color-mix\(|var\(|calc\(/i.test(raw)) { mix[v.var] = raw; return; }
      out[v.var] = hexOf(raw) || hexOf(v.values[m]);
    });
    SPACES.forEach(function (v) { var raw = cs.getPropertyValue(v.var).trim(), n = parseFloat(raw); if (!isNaN(n)) SPACE_NOW[v.var] = { n: n, unit: /px$/.test(raw) ? 'px' : '' }; });
  };
  var SPACE_NOW = {};   // each spacing token's size as the screen shows it (its breakpoint)
  var shown = function (v, mode) { return (LIVE[mode] || {})[v.var] || hexOf(v.values && v.values[modeIndex(mode)]); };
  var rootOf = function (cssVar, mode) { var m = modeIndex(mode), v = BYVAR[cssVar], n = 0; while (v && v.aliases && v.aliases[m] && BY[v.aliases[m]] && n++ < 12) v = BY[v.aliases[m]]; return v || null; };
  // A colour's family: every token drawn in its hue that is a colour of its own (no alias in the system, or one the
  // brand shown gives its own value), each moved to the new hue at its own lightness.
  var family = function (root, mode, not) {
    var h0 = shown(root, mode); if (!h0) return [];
    var c0 = toLch(h0), m = modeIndex(mode);
    if (c0.c < 0.03) return [root];   // a grey: only itself
    return VARS.filter(function (v) {
      if (!v.var || (not && not.indexOf(v) >= 0) || (MIXED[mode] || {})[v.var]) return false;
      var h = shown(v, mode); if (!h) return false;
      var own = !(v.aliases && v.aliases[m]) || ((LIVE[mode] || {})[v.var] && LIVE[mode][v.var] !== hexOf(v.values[m]));
      var c = toLch(h); return own && c.c >= Math.max(0.06, c0.c * 0.35) && hueGap(c.h, c0.h) < 22;
    });
  };
  // The new colour in a mode: in light, as given; in dark, the root's own dark lightness, the new hue, its chroma scaled
  // as the light one was.
  // WCAG contrast of two colours (their opaque part).
  var lum = function (hex) { var h = hex6(hex) || '#000000'; return [1, 3, 5].map(function (i) { var c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }).reduce(function (t, c, i) { return t + c * [0.2126, 0.7152, 0.0722][i]; }, 0); };
  var contrast = function (a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // What a colour is read against in a mode: the texts and icons each component draws on it (its own tokens beside the
  // fill that follows it), and, where it is itself a text or an icon, the app's background. Each needs WCAG AA (4.5:1).
  var pairsFor = function (tok, mode) {
    var root = rootOf(tok.v, mode); if (!root) return [];
    var m = modeIndex(mode), reaches = function (v) { var x = v, n = 0; while (x && n++ < 14) { if (x === root) return true; x = x.aliases && x.aliases[m] && BY[x.aliases[m]]; } return false; };
    var count = {}, add = function (hex, n) { hex = hex && hex6(hex); if (hex) count[hex] = (count[hex] || 0) + (n || 1); }, bg = null;
    VARS.forEach(function (v) {
      if (!v.var || !reaches(v)) return;
      var at = String(v.figma).search(/\/(background|fill|surface)(\/|$)/i);
      // A fill drawn as a tint of the colour (a mix, or see-through) is read as the background under it, not as the colour.
      // Only a fill that shows the colour itself: a tint of it (a mix, see-through) is read as what is under it, and one
      // the brand shown gives its own colour does not follow it at all.
      if (at > 0 && ((MIXED[mode] || {})[v.var] || alphaOf(shown(v, mode)) < 0.9 || hex6(shown(v, mode)) !== hex6(shown(root, mode)))) return;
      if (at > 0) {
        // The texts of the same state as the fill (a selected fill, its selected text), else the ones of no state.
        var prefix = v.figma.slice(0, at) + '/', STATES = /\/(default|hover|press|pressed|selected|active|current|focus|disabled|done|inactive|blocked|open|checked)(\/|$)/i;
        var state = (v.figma.slice(at).match(STATES) || [])[1];
        var texts = VARS.filter(function (t) { return t.figma.indexOf(prefix) === 0 && /(icon|text|label|content)/i.test(t.figma) && /colou?r$/i.test(t.figma) && !/statelayer|border|shadow/i.test(t.figma) && !reaches(t); });
        var same = state ? texts.filter(function (t) { return (t.figma.match(STATES) || [])[1] === state; }) : [];
        (same.length ? same : texts.filter(function (t) { var st = (t.figma.match(STATES) || [])[1]; return !st || /^default$/i.test(st); })).forEach(function (t) { add(shown(t, mode)); });
      } else if (/(icon|text|label|title)/i.test(v.figma) && APP_BG) bg = hex6(shown(BYVAR[APP_BG.v] || { var: APP_BG.v }, mode));
    });
    // The colours drawn on it most (each used more than a quarter as often as the most used), and the background it sits on.
    var most = Math.max.apply(null, [0].concat(Object.keys(count).map(function (k) { return count[k]; })));
    var out = Object.keys(count).filter(function (k) { return count[k] > most / 4; });
    if (bg && out.indexOf(bg) < 0) out.push(bg);
    return out;
  };
  // The colour nearest the one worked out that every pair reads at AA; when none can, the one that reads best.
  var safe = function (tok, hex, mode) {
    var pairs = pairsFor(tok, mode); if (!pairs.length) return hex;
    var score = function (h) { return Math.min.apply(null, pairs.map(function (p) { return contrast(h, p) / 4.5; })); };
    if (score(hex) >= 1) return hex;
    var c = toLch(hex), best = null, bestScore = -1;
    for (var L = 0.2; L <= 0.97; L += 0.01) {
      var h = fromLch(L, c.c, c.h), sc = score(h);
      if (sc >= 1 && (!best || bestScore < 1 || Math.abs(L - c.l) < Math.abs(toLch(best).l - c.l))) { best = h; bestScore = sc; }
      else if (bestScore < 1 && sc > bestScore) { best = h; bestScore = sc; }
    }
    return best || hex;
  };
  var inMode = function (tok, hex, mode) {
    var worked = inModeRaw(tok, hex, mode);
    return mode === 'light' ? worked : safe(tok, worked, mode);
  };
  var inModeRaw = function (tok, hex, mode) {
    if (mode === 'light') return hex6(hex);
    var r = ramp(hex, mode, tok), k = r.filter(function (x) { return x.key; })[0];
    if (k) return k.hex;
    var rootL = rootOf(tok.v, 'light'), n = toLch(hex), cL = toLch(shown(rootL, 'light')), d = toLch(shown(rootOf(tok.v, mode), mode));   // no ramp to go by: the system's own dark lightness
    return fromLch(d.l, d.c * (n.c / Math.max(cL.c, 0.001)), n.h);
  };
  var recolour = function (tok, hex, mode, out, not, darkHex) {
    var root = rootOf(tok.v, mode); if (!root) return [];
    var list = not && not.indexOf(root) >= 0 ? [root] : family(root, mode, not);
    var newRoot = mode !== 'light' && darkHex ? hex6(darkHex) : hex6(inMode(tok, hex, mode)), was0 = shown(root, mode), c0 = toLch(was0), rn = toLch(newRoot), k = rn.c / Math.max(c0.c, 0.001);
    list.forEach(function (v) {
      var was = shown(v, mode), c = toLch(was);
      // The root's own colour, wherever a token repeats it, is the new colour exactly; another shade keeps its distance.
      var now = v === root || hex6(was) === hex6(was0) ? newRoot : fromLch(Math.min(0.99, Math.max(0.01, rn.l + (c.l - c0.l))), Math.max(0, c.c * k), rn.h);
      out[v.var] = withAlpha(now, alphaOf(was));
    });
    return list;
  };
  // The reference ramp: the system's longest scale of primitives (name + step number), each step's lightness in light
  // and in dark as the screen shows it. A new colour's ramp takes the same steps at the same lightness, in its own hue,
  // its chroma highest at its own lightness and fading to the ends; the step nearest the colour is the colour itself.
  var REF = (function () {
    var groups = {};
    VARS.forEach(function (v) { var m = String(v.figma).match(/^(.*?)(\d+)$/); if (!m || !v.var || !hexOf(v.values && v.values[0])) return; (groups[m[1]] = groups[m[1]] || []).push({ step: m[2], v: v }); });
    var best = Object.keys(groups).sort(function (x, y) { return groups[y].length - groups[x].length; })[0];
    return best && groups[best].length >= 5 ? { name: best, steps: groups[best].sort(function (x, y) { return +x.step - +y.step; }) } : null;
  })();
  // How much lighter (or darker) the system draws a colour in dark than in light: its own primary's two values.
  var darkShift = function (tok) { if (!tok) return 0; var l = rootOf(tok.v, 'light'), d = rootOf(tok.v, 'dark'); return l && d ? toLch(shown(d, 'dark')).l - toLch(shown(l, 'light')).l : 0; };
  var ramp = function (hex, mode, tok) {
    if (!REF) return [];
    var n = toLch(hex), Ls = REF.steps.map(function (s) { return toLch(shown(s.v, mode)).l; });
    // The colour's own lightness in this mode: as given in light; in dark, moved as the system moves its own.
    var target = mode === 'light' ? n.l : Math.min(0.97, Math.max(0.05, n.l + darkShift(tok)));
    var key = Ls.reduce(function (k, L, i) { return Math.abs(L - target) < Math.abs(Ls[k] - target) ? i : k; }, 0);
    var span = Math.max(target, 1 - target, 0.001);
    return REF.steps.map(function (s, i) {
      if (i === key) return { step: s.step, hex: mode === 'light' ? hex6(hex) : fromLch(target, n.c, n.h), key: true };
      // The colour's chroma carried to this step's lightness: highest at the key step, none at white or black.
      var fall = Math.max(0, 1 - Math.abs(Ls[i] - target) / span);
      return { step: s.step, hex: fromLch(Ls[i], n.c * Math.pow(fall, 0.8), n.h), key: false };
    });
  };
  var nearest = function (r, hex) { var L = toLch(hex).l; return r.reduce(function (b, x) { return !b || Math.abs(toLch(x.hex).l - L) < Math.abs(toLch(b.hex).l - L) ? x : b; }, null); };
  // The tokens a field is linked to: its token, and every token whose chain reaches it (in light), as the system names them.
  var followers = function (cssVar) {
    var users = {}, grew = true; users[cssVar] = 1;
    while (grew) { grew = false; VARS.forEach(function (v) { var to = v.aliases && v.aliases[0] && BY[v.aliases[0]]; if (v.var && to && users[to.var] && !users[v.var]) { users[v.var] = 1; grew = true; } }); }
    return VARS.filter(function (v) { return v.var !== cssVar && users[v.var]; });
  };
  var linkLine = function (tok, re) {
    if (!tok) return '<p class="sg-ts-hint">Not linked: the system has no token for it.</p>';
    var self = BYVAR[tok.v] || (tok.figma ? { figma: tok.figma } : null), f = followers(tok.v), named = re ? f.filter(function (v) { return re.test(v.figma); }) : f;
    var list = re && named.length ? named : null;
    return '<p class="sg-ts-hint sg-ts-link">' + (list ? 'Changes ' + list.length + ' token' + (list.length === 1 ? '' : 's') + ' named for it, from ' : 'Changes ') + '<code>' + esc(self ? self.figma : tok.v) + '</code>' + (!list && f.length ? ' and the ' + f.length + ' token' + (f.length === 1 ? '' : 's') + ' that follow it' : '') + '</p>';
  };
  // A background in dark: moved as the system moves its own, keeping only a hint of the hue.
  var bgDark = function (hex) { var n = toLch(hex), Ld = Math.min(0.97, Math.max(0.04, n.l + darkShift(APP_BG))); return fromLch(Ld, Math.min(n.c, 0.03), n.h); };
  var live = {};   // the colours the screen shows in light before any change
  var themeCss = function (b, scope, mode) {
    var set = {}, prim = [], m = modeIndex(mode);
    if (PRIMARY && b.primary && (b.primary !== (live.primary || PRIMARY.hex) || (mode !== 'light' && (b.dark || {}).primary))) prim = recolour(PRIMARY, b.primary, mode, set, null, (b.dark || {}).primary);
    if (SECONDARY && b.secondary && (b.secondary !== (live.secondary || SECONDARY.hex) || (mode !== 'light' && (b.dark || {}).secondary))) recolour(SECONDARY, b.secondary, mode, set, prim, (b.dark || {}).secondary);
    // The neutrals from the primary: each step of the system's neutral ramp at its own lightness, in the primary's hue.
    // A ramp the brand already tints keeps its tint, as strong next to the new colour as it was next to the old one; a
    // pure grey takes a faint tint, strongest mid-ramp, none at white or black.
    if (REF && PRIMARY && b.primary && b.primary !== (live.primary || PRIMARY.hex)) {
      var pr = rootOf(PRIMARY.v, mode), p0 = pr && toLch(shown(pr, mode)), pn = toLch(inMode(PRIMARY, b.primary, mode));
      REF.steps.forEach(function (st) {
        var was = shown(st.v, mode); if (!was || set[st.v.var]) return;
        var c = toLch(was), mid = Math.max(0, 1 - Math.abs(c.l - 0.55) / 0.45);
        var chroma = c.c > 0.004 && p0 && p0.c > 0.01 ? c.c * (pn.c / p0.c) : pn.c * 0.06 * mid;
        set[st.v.var] = withAlpha(fromLch(c.l, Math.min(chroma, 0.04), pn.h), alphaOf(was));
      });
    }
    // A roundness reaches only what is named for it: the tokens that point at the system's radius and name a card (or a
    // button). The radius itself is shared (a screen's own frame takes the card's), so it is left as it is; only when
    // nothing is named for it is the radius itself changed.
    var radiusFor = function (tok, re, px) {
      var users = {}, grew = true; users[tok.v] = 1;
      while (grew) { grew = false; VARS.forEach(function (v) { var to = v.aliases && v.aliases[m] && BY[v.aliases[m]]; if (v.var && to && users[to.var] && !users[v.var]) { users[v.var] = 1; grew = true; } }); }
      var named = VARS.filter(function (v) { return v.var && v.var !== tok.v && users[v.var] && re.test(v.figma); });
      (named.length ? named : [BYVAR[tok.v] || { var: tok.v }]).forEach(function (v) { set[v.var] = px + 'px'; });
    };
    if (APP_BG && b.appBg && (b.appBg !== (live.appBg || APP_BG.hex) || (mode !== 'light' && (b.dark || {}).appBg))) set[APP_BG.v] = mode === 'light' ? hex6(b.appBg) : ((b.dark || {}).appBg || bgDark(b.appBg));
    // Shadows through the system's own tokens: its switch, and on, each shadow in the system's own colour for this mode
    // (a brand that hides them draws them transparent).
    if (SHADOW && (b.shadows !== shadowsOn || b.shadows)) {
      set[SHADOW.v] = b.shadows ? 'true' : 'false';
      if (b.shadows) SHADOW_COLOURS.forEach(function (v) { var own = hexOf(v.values && v.values[m]); if (own) set[v.var] = own; });
    }
    // The button's radius reaches every token that follows it (buttons, the menu's items…); the card's only the cards'.
    STOPS.forEach(function (st) { var hex = (b.grad || {})[st.v]; if (!hex) return; var hand = ((b.dark || {}).grad || {})[st.v]; if (hex6(hex) === hex6((live.grad || {})[st.v] || st.hex) && !(mode !== 'light' && hand)) return; set[st.v] = mode === 'light' ? hex6(hex) : (hand || tokenDark(st, hex)); });
    if (BTN && b.buttonRadius !== BTN.px) radiusFor(BTN, /./, b.buttonRadius);
    if (CARD && b.cardRadius !== CARD.px) radiusFor(CARD, /card/i, b.cardRadius);
    if (BORDER && b.borderWidth != null && b.borderWidth !== BORDER.px) set[BORDER.v] = b.borderWidth + 'px';
    // Spacing: every gap, padding and margin of the system scaled alike, from the size the screen shows it at.
    if (b.spacing && b.spacing !== 100) SPACES.forEach(function (v) { var x = SPACE_NOW[v.var]; if (x) set[v.var] = (Math.round(x.n * b.spacing / 100 * 2) / 2) + x.unit; });
    // One blur for every shadow: the system's blur and each shadow's own.
    if (BLUR && b.shadowBlur != null && b.shadowBlur !== BLUR.px) VARS.forEach(function (v) { if (v.var && /shadow/i.test(v.figma) && /blur$/i.test(v.figma)) set[v.var] = b.shadowBlur + 'px'; });
    if (T.typeFamily && T.typeFamily.var && b.fontFamily && b.fontFamily.toLowerCase() !== String(live.font || start.fontFamily).toLowerCase()) set[T.typeFamily.var] = '"' + b.fontFamily.replace(/"/g, '') + '", system-ui, sans-serif';
    // A gradient's own words (4.5:1) and icons (3:1), at rest and chosen, readable on its background, each moved only as
    // far as it needs; the background stays as set. Its words are the texts and icons of the parts its stem names
    // (a sidebar's background: sidebarItem/text/default/color).
    var extra = '';
    var menuStops = STOPS.filter(function (st) { return BYVAR[st.v]; });
    var stemRe = function (stem) { return new RegExp('^(?:.*/)?' + stem.replace(/[^\w]/g, '') + '[^/]*/(text|icon\\w*)/(default|selected)/colou?r$', 'i'); };
    if (menuStops.length) {
      var now = function (cssVar) { return set[cssVar] || shown(BYVAR[cssVar] || { var: cssVar }, mode); };
      var reach = function (hex, against, need) {
        var ok = function (h) { return against.every(function (a) { return contrast(h, a) >= need; }); };
        if (!hex || ok(hex)) return null;
        var c = toLch(hex), best = null, bestGap = 9;
        for (var L = 0.02; L <= 0.99; L += 0.01) { var h = fromLch(L, c.c, c.h); if (ok(h) && Math.abs(L - c.l) < bestGap) { best = h; bestGap = Math.abs(L - c.l); } }
        return best;
      };
      var bgs = menuStops.map(function (st) { return now(st.v); }).filter(Boolean);
      // The brand on a gradient (its logo, drawn in the primary) reads at 3:1 on it, both ways round: the side edited
      // last leads. A background just set stays, and the logo takes the nearest shade of the primary that reads on it; a
      // colour just set stays, and the gradient's background moves only as far as it must.
      var brand = PRIMARY && now(PRIMARY.v);
      if (brand && b.menuLead === 'content') {
        menuStops.forEach(function (st) { var bg = now(st.v), moved = reach(bg, [brand], 3); if (moved) set[st.v] = withAlpha(moved, alphaOf(bg)); });
        bgs = menuStops.map(function (st) { return now(st.v); }).filter(Boolean);
      } else {
        var logo = brand && reach(brand, bgs, 3);
        if (logo) extra += '\n' + scope + ' [class*="logo"] { color: ' + logo + ' !important; }';
      }
      GRADIENTS.forEach(function (g) {
        var on = g.stops.filter(function (st) { return BYVAR[st.v]; }).map(function (st) { return now(st.v); }).filter(Boolean), re = stemRe(g.stem); if (!on.length) return;
        VARS.forEach(function (v) {
          if (!v.var || !re.test(v.figma)) return;
          var cur = now(v.var); if (!cur || alphaOf(cur) < 0.9) return;
          var fixed = reach(cur, on, /\/text\//i.test(v.figma) ? 4.5 : 3); if (fixed) set[v.var] = fixed;
        });
      });
    }
    var tk = b.tokens || {}, applyTok = function () {
      Object.keys(tk.all || {}).forEach(function (k) { set[k] = tk.all[k]; });
      if (mode !== 'light') Object.keys(tk.light || {}).forEach(function (k) { if (!(tk[mode] || {})[k] && BYVAR[k]) set[k] = tokenDark({ v: k }, tk.light[k]); });
      Object.keys(tk[mode] || {}).forEach(function (k) { set[k] = tk[mode][k]; });
    };
    applyTok();
    // Every token whose chain reaches a changed one, declared again here (pointing on, as in the system).
    var changed = {}; VARS.forEach(function (v) { if (set[v.var]) changed[v.figma] = 1; });
    var lines = [], grew = true;
    // One the brand shown writes its own way (a mix of the primary, its own colour) keeps the brand's: declared again
    // here it would lose it.
    var brandOwn = function (v) { return (MIXED[mode] || {})[v.var] || ((LIVE[mode] || {})[v.var] && hexOf(v.values && v.values[m]) && LIVE[mode][v.var] !== hexOf(v.values[m])); };
    while (grew) { grew = false; VARS.forEach(function (v) { var to = v.aliases && v.aliases[m]; if (to && changed[to] && !changed[v.figma] && BY[to] && BY[to].var && !brandOwn(v)) { changed[v.figma] = 1; lines.push(v.var + ': var(' + BY[to].var + ')'); grew = true; } }); }
    SHADOW_ALL.forEach(function (v) { set[v] = b.shadows ? 'true' : 'false'; });   // every switch, whatever the default
    applyTok();   // a component's own change wins over the theme's wider ones (its shadow on, say)
    var decl = Object.keys(set).map(function (k) { return k + ': ' + set[k]; }).concat(lines);
    // Shadows on: each component's own shadow, from its shadow tokens (X, Y, blur, spread, colour), on the elements
    // named for it (card-primary, has-card-primary, card-primary-wrapper…). Its CSS draws it only on the classes its
    // code adds when it renders, which a screen's drawing does not carry.
    var shadowRules = '';
    if (b.shadows && SHADOW) {
      var val = function (figma) { var v = BY[figma], n = 0; while (v && !set[v.var] && v.aliases && v.aliases[m] && BY[v.aliases[m]] && n++ < 12) v = BY[v.aliases[m]]; return v ? String(set[v.var] || v.values[m]) : null; };
      var groups = {};
      VARS.forEach(function (v) { var g = String(v.figma).match(/^(.*)\/shadow\/(x|y|blur|spread|colou?r)$/i); if (g) (groups[g[1]] = groups[g[1]] || {})[g[2].toLowerCase().replace('colour', 'color')] = v; });
      Object.keys(groups).forEach(function (path) {
        var g = groups[path], name = path.split('/').pop(); if (!g.color || !/^[a-z][A-Za-z0-9]+$/.test(name)) return;
        var kebab = name.replace(/([A-Z])/g, '-$1').toLowerCase();
        var px = function (t, d) { var x = t && val(t.figma); return x && /^-?[\d.]+(px)?$/.test(x.trim()) ? (parseFloat(x) + 'px') : d; };
        var colour = set[g.color.var] || shown(g.color, mode) || hexOf(val(g.color.figma)); if (!colour) return;
        var sel = ['.' + kebab, '.has-' + kebab, '.has-' + kebab + '-styles', '.' + kebab + '-wrapper', '.' + kebab + '-container'].map(function (c) { return scope + ' ' + c; }).join(', ');
        shadowRules += '\n' + sel + ' { box-shadow: ' + [px(g.x, '0px'), px(g.y, '2px'), b.shadowBlur != null ? b.shadowBlur + 'px' : px(g.blur, '16px'), px(g.spread, '0px'), colour].join(' ') + ' !important; }';
      });
    }
    return scope + ' { ' + decl.join('; ') + (decl.length ? ';' : '') + ' }' + shadowRules + extra + (b.shadows ? '' : '\n' + [' ', '::before', '::after'].map(function (p) { return scope + ' ' + OWN + p.trim(); }).join(', ') + ' { box-shadow: none !important; }') + '\n' + scope + ' { font-family: var(' + ((T.typeFamily && T.typeFamily.var) || '--x') + ', inherit); }';
  };

  // The controls, in the page's own rows (a name on the left, its control on the right).
  var row = function (label, id, control, hint) { return '<div class="pg-ctl"><label class="sg-mode-label" for="' + id + '">' + esc(label) + '</label><div class="sg-ts-field">' + control + (hint ? '<p class="sg-ts-hint">' + esc(hint) + '</p>' : '') + '<p class="sg-ts-error" id="' + id + '-error" hidden></p></div></div>'; };
  var seg = function (name, opts, on) { return '<div class="sg-seg sg-seg-default sg-ts-seg" role="group" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (String(o[0]) === String(on)) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>'; };
  // A choice: the guide's own dropdown (as its Theme choice), drawn over a select that keeps the value.
  var select = function (id, opts, on, label) { return '<span class="sg-hidden-text" id="' + id + '-label">' + esc(label) + '</span><span class="sg-dd sg-ts-dd"><select id="' + id + '" class="sg-input sg-select-native" tabindex="-1" aria-hidden="true">' + opts.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(on) ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select></span>'; };
  var dropdowns = function (root) { if (!SG.customSelect) return; Array.prototype.forEach.call(root.querySelectorAll('select.sg-select-native'), function (sel) { if (!sel._dd) sel._dd = SG.customSelect(sel, sel.id + '-label'); }); };
  var RESET = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a5 5 0 1 0 1.5-3.5"/><path d="M3 3v2.5h2.5"/></svg>';
  var colourField = function (id, v, mode) {
    var dark = mode === 'Dark', hand = dark && !!v;
    return '<label class="sg-ts-colour sg-input"><input type="color" id="' + id + '" value="' + esc(hex6(v) || '#000000') + '" aria-label="' + esc(mode) + ' colour"><input type="text" class="sg-ts-hex" id="' + id + '-hex" value="' + esc(v || '') + '" spellcheck="false" aria-label="' + esc(mode) + ' hex"' + (dark ? ' placeholder="Auto"' + (hand ? ' data-hand="1"' : '') : '') + '>' +
      (dark ? '<button type="button" class="sg-ts-auto" data-auto="' + esc(id) + '" title="Back to automatic" aria-label="Back to the automatic dark colour"' + (hand ? '' : ' hidden') + '>' + RESET + '</button>' : '') +
      '<span class="sg-ts-mode-tag">' + esc(mode) + '</span></label>';
  };
  // A colour in light and in dark: dark is worked out from light, and can be set by hand (emptied, it is worked out again).
  var colour = function (id, v, d) { return '<div class="sg-ts-pair">' + colourField(id, v, 'Light') + (COLOUR_AXIS ? colourField(id + '-d', d || '', 'Dark') : '') + '</div>'; };
  var rampHTML = function (r, label) { return '<div class="sg-ts-ramp" role="img" aria-label="' + esc(label) + '"><span class="sg-ts-ramp-label">' + esc(label) + '</span>' + r.map(function (x) { return '<span class="sg-ts-step' + (x.key ? ' is-key' : '') + '" style="background:' + x.hex + '" title="' + esc(x.step + ' · ' + x.hex) + '"></span>'; }).join('') + '</div>'; };
  // A radius: a slider from square to round, its size beside it, the system's own sizes marked under it.
  var slider = function (id, v, label, max, step, unit, min) {
    max = max || 40; step = step || 1; unit = unit || 'px'; min = min || 0;
    var marks = (max === 40 && /-r$/.test(id) ? radii : []).filter(function (r) { return r.px <= max; }).map(function (r) { return '<option value="' + r.px + '" label="' + esc(r.px + 'px') + '"></option>'; }).join('');
    return '<span class="sg-ts-range"><input type="range" id="' + id + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + esc(v) + '" list="' + id + '-marks" aria-label="' + esc(label) + '"><label class="sg-ts-num sg-input"><input type="number" class="sg-ts-hex" id="' + id + '-num" min="0" max="999" step="' + step + '" value="' + esc(v) + '" aria-label="' + esc(label) + ' in ' + unit + '"><span class="sg-ts-mode-tag" aria-hidden="true">' + unit + '</span></label></span><datalist id="' + id + '-marks">' + marks + '</datalist>';
  };

  var body = function () {
    var famIdx = families.map(function (f) { return f.toLowerCase(); }).indexOf(String(brief.fontFamily || '').toLowerCase()), famKnown = famIdx >= 0; if (famKnown) brief.fontFamily = families[famIdx];
    var screens = (SG.screens || []).filter(function (s) { return s.markup; });
    var screenKey = (screens.filter(function (s) { return s.key === draft.screen; })[0] || screens[0] || {}).key;
    var form = '<div class="sg-ts">' +
      '<div class="pg-inspect sg-token-card" data-pane="figma"' + (source === 'figma' ? '' : ' hidden') + '><div class="pg-controls">' +
        row('Name', 'ts-fig-name', '<input type="text" class="sg-input" id="ts-fig-name" value="' + esc(draft.name || '') + '" placeholder="Ocean">') +
        row('Figma link', 'ts-url', '<input type="url" class="sg-input" id="ts-url" value="' + esc(draft.url || '') + '" placeholder="https://www.figma.com/design/…">', 'Its variables are read and matched to this system\'s tokens.') +
      '</div></div>' +
      '<div class="pg-inspect sg-token-card" data-pane="file"' + (source === 'file' ? '' : ' hidden') + '><div class="pg-controls">' +
        row('Name', 'ts-file-name', '<input type="text" class="sg-input" id="ts-file-name" value="' + esc(draft.name || '') + '" placeholder="Ocean">') +
        row('File', 'ts-file', '<input type="file" class="sg-input" id="ts-file" accept=".json,.css,.zip,application/json,text/css,application/zip">', 'Tokens as JSON (DTCG or a theme), CSS variables, or a .zip of them.') +
      '</div></div>' +
      '<div class="pg-inspect sg-token-card" data-pane="references"' + (source === 'references' ? '' : ' hidden') + '><div class="pg-controls">' +
        row('Name', 'ts-ref-name', '<input type="text" class="sg-input" id="ts-ref-name" value="' + esc(draft.name || '') + '" placeholder="Ocean">') +
        row('Pictures', 'ts-refs', '<input type="file" class="sg-input" id="ts-refs" accept="image/*" multiple>', 'Screens, moodboards or brand pictures. Reading them into a theme comes next.') +
      '</div></div>' +
      '<div class="pg-inspect sg-token-card sg-ts-pick" data-pane="scratch"' + (source === 'scratch' ? '' : ' hidden') + '><p class="sg-ts-hint sg-ts-pick-empty">Click a component in the preview to change its tokens.</p></div>' +
      '<div class="pg-inspect sg-token-card" data-pane="scratch"' + (source === 'scratch' ? '' : ' hidden') + '><div class="pg-inspect-head sg-ts-pick-head"><span><b>Base customization</b></span></div><div class="pg-controls">' +
        row('Name', 'ts-name', '<input type="text" class="sg-input" id="ts-name" value="' + esc(brief.name || draft.name || '') + '" placeholder="Ocean">') +
        row('Font family', 'ts-font', select('ts-font', families.map(function (f) { return [f, f]; }).concat([['other', 'Other…']]), famKnown ? brief.fontFamily : 'other', 'Font family') +
          '<input type="text" class="sg-input" id="ts-font-other" value="' + esc(famKnown ? '' : brief.fontFamily) + '" placeholder="Family name"' + (famKnown ? ' hidden' : '') + '>') +
        row('Primary colour', 'ts-primary', colour('ts-primary', brief.primary, (brief.dark || {}).primary)) +
        row('Secondary colour', 'ts-secondary', colour('ts-secondary', brief.secondary, (brief.dark || {}).secondary)) +
        (APP_BG ? row('App background', 'ts-bg', colour('ts-bg', brief.appBg, (brief.dark || {}).appBg)) : '') +
        STOPS.map(function (st) { return row(st.label, st.id, colour(st.id, (brief.grad || {})[st.v] || st.hex, ((brief.dark || {}).grad || {})[st.v])); }).join('') +
        row('Button roundness', 'ts-btn-r', slider('ts-btn-r', brief.buttonRadius, 'Button roundness')) +
        row('Card roundness', 'ts-card-r', slider('ts-card-r', brief.cardRadius, 'Card roundness')) +
        (SPACES.length ? row('Spacing', 'ts-space', slider('ts-space', brief.spacing || 100, 'Spacing', 200, 5, '%', 50)) : '') +
        (BORDER ? row('Border thickness', 'ts-border', slider('ts-border', brief.borderWidth, 'Border thickness', 8, 0.5)) : '') +
        '<div class="pg-ctl"><span class="sg-mode-label" id="ts-shadows-label">Shadows</span><div class="sg-ts-field">' + seg('shadows', [['true', 'On'], ['false', 'Off']], String(brief.shadows)) + '</div></div>' +
        (BLUR ? row('Shadow blur', 'ts-blur', slider('ts-blur', brief.shadowBlur, 'Shadow blur', 40, 1)) : '') +
      '</div></div>' +
      '<p class="sg-info sg-ts-done" role="status" hidden></p>' +
    '</div>';
    var preview = screens.length ? '<div class="sg-ts-preview pg-inspect sg-token-card"><div class="pg-inspect-head sg-ts-preview-head"><span>Preview</span>' +
        (screens.length > 1 ? select('ts-screen', screens.map(function (s) { return [s.key, s.title || s.key]; }), screenKey, 'Screen') : '<span>' + esc(screens[0].title || screens[0].key) + '</span>') +
        (COLOUR_AXIS ? seg('mode', [['light', 'Light'], ['dark', 'Dark']], 'light') : '') + '</div><div class="sg-ts-stage"><div class="sg-ts-screen" data-screen="' + esc(screenKey) + '"></div></div></div>' : '';
    return '<div class="sg-ts-split">' + form + preview + '</div>';
  };

  // Creating a theme starts with where it comes from: the four starts, each a card, in the panel.
  var choose = function (from) {
    var panel = SG.openPanel({ id: 'sg-theme-panel', title: 'Create new theme', crumbs: ['Theme'], from: from,
      body: '<div class="sg-ts-starts">' + STARTS.map(function (x) { return '<button type="button" class="sg-card sg-card--own sg-ts-start-card" data-start="' + x[0] + '">' + x[2] + '<span class="sg-ts-start-name">' + esc(x[1]) + '</span><span class="sg-ts-start-says">' + esc(START_SAYS[x[0]] || '') + '</span></button>'; }).join('') + '</div>' });
    var b = panel.el.querySelector('.sg-ts-starts');
    b.addEventListener('click', function (e) { var c = e.target.closest('[data-start]'); if (c) open(from, c.getAttribute('data-start')); });
    var first = b.querySelector('[data-start]'); if (first) first.focus({ preventScroll: true });
  };
  var editing = null;   // the saved theme being edited, else null (a new one)
  var open = function (from, kind, theme) {
    editing = theme || null;
    var tokOver = { light: {}, dark: {}, all: {} }, picked = null;
    if (theme) { source = 'scratch'; brief = Object.assign({}, start, theme.brief || {}, { name: theme.name }); baseTheme = theme.base || ''; }
    else {
      if (kind) source = kind;
      brief = Object.assign({}, start, draft.brief || {}); brief.buttonRadius = asPx(brief.buttonRadius); brief.cardRadius = asPx(brief.cardRadius);
      baseTheme = document.documentElement.getAttribute('data-brand') || '';
    }
    var panel = SG.openPanel({ id: 'sg-theme-panel', title: theme ? theme.name : startName(source), crumbs: theme ? ['Theme', 'Edit theme'] : ['Theme', 'New theme'], body: body(), from: from });
    var root = panel.el.querySelector('.sg-ts-split'), $ = function (id) { return root.querySelector('#' + id); };
    dropdowns(root);
    var phead = panel.el.querySelector('.sg-panel-head');
    if (phead && !phead.querySelector('.sg-ts-actions')) phead.insertAdjacentHTML('beforeend', '<div class="sg-ts-actions">' + SG.sysButton('button', 'Cancel', ' data-ts="cancel"') + SG.sysButton('button', editing ? 'Save changes' : 'Create theme', ' data-ts="create" data-tone="primary"' + (editing ? ' disabled' : '')) + '</div>');
    phead.querySelector('.sg-ts-actions').onclick = function (e) { var a = e.target.closest('[data-ts]'); if (!a) return; if (a.getAttribute('data-ts') === 'cancel') return panel.close(); create(); };
    var err = function (id, text) { var e = $(id + '-error'); if (!e) return; e.textContent = text || ''; e.hidden = !text; var f = $(id); if (f) { if (text) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid'); } };
    var segVal = function (name) { var b = root.querySelector('[data-seg="' + name + '"] [aria-pressed="true"]'); return b ? b.getAttribute('data-v') : null; };

    // The preview's box, and the page's own style for the theme (kept empty: the theme goes in the preview's frame).
    var box = root.querySelector('.sg-ts-screen'), drawn = null, style = document.getElementById('sg-ts-theme');
    if (!style) { style = document.createElement('style'); style.id = 'sg-ts-theme'; document.head.appendChild(style); }
    var mode = 'light';
    // The preview: one Showroom screen in a frame of its own, made of the page's own styles, with the page's brand and
    // the mode chosen on its own <html>, so it reads in light or in dark exactly as the Showroom draws it then (inside
    // the guide's page, a screen would take the page's mode for the brand's colours); the theme's CSS is in it alone.
    var frame = null, fdoc = null, screenEl = null, tstyle = null, size = [1280, 800];
    var setMode = function (md) {
      if (!fdoc) return;
      var html = fdoc.documentElement, v = axisValue(md);
      if (COLOUR_AXIS && v != null) html.setAttribute(COLOUR_AXIS.attr, v);
      html.setAttribute('data-sg-scheme', md); html.style.colorScheme = md;
    };
    var fit = function () {
      var phd = panel.el.querySelector('.sg-panel-head'); if (phd) root.style.setProperty('--ts-head', phd.offsetHeight + 'px');   // where the cards' heads stay
      var stage = box && box.parentNode; if (!frame || !stage || !stage.clientWidth) return;
      var cs = getComputedStyle(stage), w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      var sc = box.closest('.sg-tk-detail'), pvEl = box.closest('.sg-ts-preview'), headEl = pvEl && pvEl.querySelector('.sg-ts-preview-head');
      var top = parseFloat(getComputedStyle(root).getPropertyValue('--ts-top')) || 0;
      var oneScroll = getComputedStyle(root.querySelector('.sg-ts')).overflowY === 'auto';   // side by side: the split is the room
      var h = oneScroll ? root.clientHeight - (headEl ? headEl.offsetHeight : 0) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 8 :
        sc ? sc.clientHeight - top - (headEl ? headEl.offsetHeight : 0) - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 8 : Infinity;
      // Fluid: the screen laid out in all the room there is (its own width at least, scaled down to fit when the room
      // is narrower), so it fills the stage's width and the panel's height.
      var k = Math.max(0.2, Math.min(1, w / size[0])), lw = Math.round(w / k), lh = Math.round((h > 160 ? h : size[1] * k) / k);
      frame.style.width = lw + 'px'; frame.style.height = lh + 'px'; frame.style.transform = 'scale(' + k + ')';
      if (screenEl) { screenEl.style.width = lw + 'px'; screenEl.style.height = lh + 'px'; }
      box.style.width = Math.floor(lw * k) + 'px'; box.style.height = Math.floor(lh * k) + 'px'; box.style.marginInline = 'auto';
    };
    window.addEventListener('resize', function () { fit(); });
    var draw = function (key) {
      if (!box) return;
      var s = (SG.screens || []).filter(function (x) { return x.key === key; })[0]; if (!s) return;
      box.setAttribute('data-screen', key); size = [(s.size && s.size[0]) || 1280, (s.size && s.size[1]) || 800];
      box.innerHTML = ''; frame = document.createElement('iframe'); frame.className = 'sg-ts-frame'; frame.title = 'Preview: ' + (s.title || s.key); frame.tabIndex = -1; box.appendChild(frame);
      fdoc = frame.contentDocument; fdoc.open(); fdoc.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'); fdoc.close();
      Array.prototype.forEach.call(document.documentElement.attributes, function (a) { if (a.name !== 'class' && a.name !== 'style') fdoc.documentElement.setAttribute(a.name, a.value); });
      if (baseTheme) fdoc.documentElement.setAttribute('data-brand', baseTheme); else fdoc.documentElement.removeAttribute('data-brand');
      fdoc.documentElement.removeAttribute('data-ts-theme');   // the theme being made starts from its base, never from a saved theme applied to the page
      Array.prototype.forEach.call(document.querySelectorAll('style, link[rel="stylesheet"]'), function (n) { if (n.id !== 'sg-ts-theme') fdoc.head.appendChild(fdoc.importNode(n, true)); });
      tstyle = fdoc.createElement('style'); fdoc.head.appendChild(tstyle);
      fdoc.body.style.margin = '0'; fdoc.body.style.background = 'transparent';
      screenEl = fdoc.createElement('div'); screenEl.id = 'ts-screen'; screenEl.className = 'sg-showroom sg-showroom-screen'; screenEl.setAttribute('aria-hidden', 'true');
      screenEl.style.cssText = 'position: relative; width: ' + size[0] + 'px; height: ' + size[1] + 'px;';
      screenEl.innerHTML = s.markup;
      // The screen's own other modes (its breakpoint, its language), as the Showroom sets them.
      var named = Object.keys(s.modes || {}).map(function (k) { return String(s.modes[k]).toLowerCase(); });
      (SG.axes || []).forEach(function (a) { if (a.colour || !a.attr) return; var v = (a.values || []).filter(function (x) { return named.indexOf(String(x.label).toLowerCase()) >= 0; })[0]; if (v && v.value) screenEl.setAttribute(a.attr, v.value); });
      fdoc.body.appendChild(screenEl);
      // Picking: what is under the pointer is outlined; a click picks its component, which flashes once and then shows
      // as it is, so nothing sits over what is being changed. Nothing in the screen does what it
      // would on its own (a link, a field, a button).
      var hl = fdoc.createElement('style'); hl.textContent = '#ts-screen, #ts-screen * { cursor: pointer; } #ts-screen .ts-hover:not(.ts-picked) { outline: 2px dashed var(--sg-accent, #2563eb) !important; outline-offset: 2px; } #ts-screen .ts-picked { outline: 2px solid transparent !important; outline-offset: 2px; animation: ts-picked-flash 1s ease-out; } @keyframes ts-picked-flash { 0%, 40% { outline-color: var(--sg-accent, #2563eb); } 100% { outline-color: transparent; } } @media (prefers-reduced-motion: reduce) { #ts-screen .ts-picked { animation-duration: 0.6s; animation-timing-function: steps(1, end); } }'; fdoc.head.appendChild(hl);
      var hovered = null, stop = function (e) { e.preventDefault(); e.stopPropagation(); };
      ['mousedown', 'mouseup', 'submit', 'keydown', 'dblclick', 'contextmenu'].forEach(function (t) { fdoc.addEventListener(t, stop, true); });
      fdoc.addEventListener('mouseover', function (e) { var n = nextPick(e.target); if (hovered) hovered.classList.remove('ts-hover'); hovered = !n ? null : n.part ? partEl(e.target, n.el, n.part) : n.el; if (hovered) hovered.classList.add('ts-hover'); }, true);   // what the next click picks, a layer too
      fdoc.addEventListener('mouseleave', function () { if (hovered) hovered.classList.remove('ts-hover'); hovered = null; }, true);
      fdoc.addEventListener('click', function (e) { stop(e); var n = nextPick(e.target); if (n) pick(n, n.same); }, true);
      if (picked) { var again = screenEl.querySelector('.' + picked.cls); if (again) again.classList.add('ts-picked'); }
      ['dark', 'light'].forEach(function (md) { setMode(md); readLive(screenEl, md); }); setMode(mode);
      if (FONT) live.font = firstFamily(fdoc.defaultView.getComputedStyle(screenEl).getPropertyValue(FONT.v));
      fit();
    };
    var tokSaved = (brief.tokens && typeof brief.tokens === 'object') ? brief.tokens : {};   // a theme being edited keeps its own
    ['light', 'dark', 'all'].forEach(function (k) { tokOver[k] = Object.assign({}, tokSaved[k] || {}); });
    var pickCard = root.querySelector('.sg-ts-pick');
    var tokKind = function (v) { var x = String((v.values || [])[0] == null ? '' : v.values[0]).trim(); return /^(true|false)$/i.test(x) ? 'bool' : hexOf(x) ? 'colour' : /^-?[\d.]+(px)?$/.test(x) ? 'size' : null; };
    var nowOf = function (v) { var raw = screenEl ? fdoc.defaultView.getComputedStyle(screenEl).getPropertyValue(v.var).trim() : ''; return raw || String((v.values || [])[modeIndex(mode)] || ''); };
    // A colour in light, and in dark: set by hand, else worked out from light when light was changed, else the system's.
    var lightOf = function (v) { return tokOver.light[v.var] || shown(v, 'light') || '#000000'; };
    var darkOf = function (v) { return tokOver.dark[v.var] || (tokOver.light[v.var] ? tokenDark({ v: v.var }, tokOver.light[v.var]) : shown(v, 'dark')) || lightOf(v); };
    // Every component an element sits in, the outermost first: a click picks the innermost, the others a click away.
    // The layer clicked inside a component: an icon (an svg or anything named icon), else a text (an element with words
    // of its own), else none (the component as a whole).
    // The element of that layer: the icon (its outermost icon part inside the component) or the text itself.
    var partEl = function (t, comp, part) {
      if (part === 'text') return t;
      var found = null; for (var n = t; n && n !== comp; n = n.parentElement) { if (n.tagName && /^(svg|img)$/i.test(n.tagName) || /(^|[\s-])icon/i.test(String(n.getAttribute && n.getAttribute('class') || ''))) found = n; }
      return found || t;
    };
    var partOf = function (t, comp) {
      if (!t || t === comp) return null;
      for (var n = t; n && n !== comp; n = n.parentElement) { if (n.tagName && /^(svg|use|path|img)$/i.test(n.tagName) || /(^|[\s-])icon/i.test(String(n.getAttribute && n.getAttribute('class') || ''))) return 'icon'; }
      return Array.prototype.some.call(t.childNodes || [], function (x) { return x.nodeType === 3 && x.textContent.trim(); }) ? 'text' : null;
    };
    // The tokens the picked element draws with: those its own rules (and its parts') name, its hover, focus and press
    // included (the preview reacts to them), so another variant's (a size, a type, a status it is not) stays out.
    // Nothing found: all of them.
    // The tokens the picked element really draws with, as the cascade decides: for it and its own parts (a part inside a
    // nested component is that component's), each property's winning rule (importance, specificity, order), and the
    // tokens it names, whichever component they belong to. Its hover, focus and press rules count as well (the preview
    // reacts to them), without hiding the value at rest. Another variant's or state's rules lose or do not match.
    // Nothing found: the component's own tokens.
    var specOf = function (sel) {
      sel = sel.replace(/:where\([^)]*\)/g, '');
      var ids = (sel.match(/#[\w-]+/g) || []).length;
      var cls = (sel.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)(?!is\(|not\(|where\(|has\()[\w-]+(\([^)]*\))?/g) || []).length;
      var els = (sel.replace(/\[[^\]]*\]|\([^)]*\)/g, '').match(/(^|[\s>+~(])[a-zA-Z][\w-]*/g) || []).length;
      return ids * 10000 + cls * 100 + els;
    };
    var DYN = /:(hover|focus|focus-visible|focus-within|active)\b/g;
    var usedBy = function (c) {
      if (!fdoc._tokRules) {
        var all = [], walk = function (rs) { Array.prototype.forEach.call(rs || [], function (r) { if (r.cssRules && !r.selectorText) walk(r.cssRules); else if (r.selectorText && r.style) all.push(r); }); };
        Array.prototype.forEach.call(fdoc.styleSheets, function (sh) { try { walk(sh.cssRules); } catch (e) { /* another origin's sheet */ } });
        fdoc._tokRules = [];
        all.forEach(function (r, order) {
          if (/^#ts-screen$/.test(String(r.selectorText).trim())) return;
          var decls = [];
          for (var i = 0; i < r.style.length; i++) {
            var prop = r.style[i], val = r.style.getPropertyValue(prop), m, re = /var\((--[\w-]+)/g, vars = [];
            while ((m = re.exec(val))) vars.push(m[1]);
            if (vars.length) decls.push({ prop: prop, vars: vars, imp: r.style.getPropertyPriority(prop) === 'important' });
          }
          if (!decls.length) return;
          var sels = String(r.selectorText).split(',').map(function (sel) {
            var pe = /::?(before|after|placeholder|marker)\b/.exec(sel), dyn = DYN.test(sel); DYN.lastIndex = 0;
            return { s: sel.replace(/::?(before|after|placeholder|marker)\b/g, '').replace(DYN, '').trim() || '*', pe: pe ? pe[1] : '', dyn: dyn, spec: specOf(sel) };
          });
          fdoc._tokRules.push({ order: order, sels: sels, decls: decls });
        });
      }
      var root0 = c.part && c.node ? c.node : c.el;   // a layer picked: that layer alone
      var targets = [root0].concat(Array.prototype.filter.call(root0.querySelectorAll('*'), function (n) { var ch = compChain(n); return !ch.length || ch[ch.length - 1].el === c.el; }));
      var win = {}, states = {};
      fdoc._tokRules.forEach(function (r) {
        targets.forEach(function (t, ti) {
          r.sels.forEach(function (x) {
            var ok = false; try { ok = t.matches(x.s); } catch (e) { ok = false; } if (!ok) return;
            r.decls.forEach(function (d) {
              if (x.dyn) { d.vars.forEach(function (v) { states[v] = 1; }); return; }
              var key = ti + '|' + x.pe + '|' + d.prop, w = win[key], rank = [d.imp ? 1 : 0, x.spec, r.order];
              if (!w || rank[0] > w.rank[0] || (rank[0] === w.rank[0] && (rank[1] > w.rank[1] || (rank[1] === w.rank[1] && rank[2] >= w.rank[2])))) win[key] = { rank: rank, vars: d.vars };
            });
          });
        });
      });
      // The winners' tokens, followed through the custom properties they set (a part's own --x: var(--token)).
      var out = {};
      Object.keys(win).forEach(function (k) { win[k].vars.forEach(function (v) { out[v] = 1; }); });
      Object.keys(states).forEach(function (v) { out[v] = 1; });
      var toks = Object.keys(out).filter(function (v) { return OWNER[v]; }).map(function (v) { return BYVAR[v]; }).filter(Boolean);
      return toks.length ? toks : null;
    };
    // What a click picks, as in Figma: the outermost component under the pointer first (all its tokens); a click inside
    // the one picked goes a level deeper: the component nested in it, then the layer clicked (its icon or its text).
    var nextPick = function (t) {
      var chain = compChain(t); if (!chain.length) return null;
      var at = picked ? chain.map(function (x) { return x.el; }).indexOf(picked.el) : -1;
      var mk = function (x, part) { return { el: x.el, key: x.key, cls: x.cls, chain: chain, part: part || null }; };
      if (at < 0) return mk(chain[0]);
      if (at < chain.length - 1) return mk(chain[at + 1]);
      var part = partOf(t, picked.el); if (!part || part === picked.part) return null;
      var n = mk(chain[at], part); n.same = true; n.node = partEl(t, picked.el, part); return n;
    };
    var compChain = function (el) {
      var out = [];
      for (var n = el; n && n.nodeType === 1 && n.id !== 'ts-screen'; n = n.parentElement) {
        var cls = String(n.getAttribute('class') || '').split(/\s+/);
        for (var i = 0; i < cls.length; i++) { var k = normN(cls[i].replace(/^(has|is)-/, '').replace(/-(wrapper|container|styles)$/, '')); if (k && COMP_TOK[k] && !out.some(function (x) { return x.key === k; })) { out.unshift({ el: n, key: k, cls: cls[i] }); break; } }
      }
      return out;
    };
    var pick = function (c, keep) {
      if (!keep) {
        Array.prototype.forEach.call(fdoc.querySelectorAll('.ts-picked'), function (x) { x.classList.remove('ts-picked'); }); c.el.classList.add('ts-picked');
        if (!c.chain) c.chain = compChain(c.el);
        c.cls = c.cls || (c.chain.filter(function (x) { return x.el === c.el; })[0] || {}).cls || '';
      }
      picked = c; focusMode(true);
      var comp = COMP_TOK[c.key], groups = {}, used = usedBy(c);
      (used || comp.toks).forEach(function (v) { var kind = tokKind(v); if (!kind) return; var p = String(v.figma).split('/'), rest = p.slice(2), g = (OWNER[v.var] !== c.key ? p[1] + ' · ' : '') + (rest.length > 1 ? rest[0] : 'other'); (groups[g] = groups[g] || []).push({ v: v, kind: kind, label: rest.slice(rest.length > 1 ? 1 : 0).join(' / ') || rest.join(' / ') }); });
      var colourOf = function (x, md) {
        var dark = md === 'dark', val = dark ? darkOf(x.v) : lightOf(x.v), hand = dark ? !!tokOver.dark[x.v.var] : !!tokOver.light[x.v.var];
        return '<label class="sg-ts-colour sg-input"><input type="color" data-tok="' + esc(x.v.var) + '" data-kind="colour" data-mode="' + md + '" value="' + esc(hex6(val)) + '" aria-label="' + esc(x.label + (dark ? ' in dark' : ' in light')) + '"><input type="text" class="sg-ts-hex" data-tok="' + esc(x.v.var) + '" data-kind="colour-hex" data-mode="' + md + '" value="' + esc(val) + '" spellcheck="false" aria-label="' + esc(x.label + (dark ? ' in dark, hex' : ' in light, hex')) + '">' +
          '<button type="button" class="sg-ts-auto" data-tok-reset="' + esc(x.v.var) + '" data-kind="colour" data-mode="' + md + '" title="' + (dark ? 'Back to automatic' : 'Back to the theme') + '" aria-label="' + (dark ? 'Back to the automatic dark colour' : 'Back to the theme\'s colour') + '"' + (hand ? '' : ' hidden') + '>' + RESET + '</button><span class="sg-ts-mode-tag">' + (dark ? 'Dark' : 'Light') + '</span></label>';
      };
      var rowOf = function (x) {
        var cur = nowOf(x.v), over = tokOver.all[x.v.var], ctl;
        if (x.kind === 'colour') ctl = '<div class="sg-ts-pair">' + colourOf(x, 'light') + (COLOUR_AXIS ? colourOf(x, 'dark') : '') + '</div>';
        else if (x.kind === 'size') ctl = '<label class="sg-ts-num sg-input sg-ts-tok-num"><input type="number" class="sg-ts-hex" data-tok="' + esc(x.v.var) + '" data-kind="size" step="0.5" value="' + esc(parseFloat(cur) || 0) + '" aria-label="' + esc(x.label + ' in px') + '"><span class="sg-ts-mode-tag" aria-hidden="true">px</span></label>';
        else { var on = /^true$/i.test(cur); ctl = '<div class="sg-seg sg-seg-default sg-ts-seg" role="group" aria-label="' + esc(x.label) + '">' + [['true', 'On'], ['false', 'Off']].map(function (o) { return '<button type="button" data-tok="' + esc(x.v.var) + '" data-kind="bool" data-v="' + o[0] + '" aria-pressed="' + (String(on) === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
        return '<div class="pg-ctl sg-ts-tok"><span class="sg-mode-label" title="' + esc(x.v.figma) + '">' + esc(x.label) + '</span><div class="sg-ts-field sg-ts-tok-field">' + ctl +
          (x.kind !== 'size' ? '' : '<button type="button" class="sg-ts-auto" data-tok-reset="' + esc(x.v.var) + '" data-kind="' + x.kind + '" title="Back to the theme" aria-label="Back to the theme"' + (over != null ? '' : ' hidden') + '>' + RESET + '</button>') + '</div></div>';
      };
      // Its head stays in view: the components it sits in (each a click away), the one picked, and Done.
      var trail = (c.chain || [c]).map(function (x, i) { var name = COMP_TOK[x.key].name; return x.key === c.key && !c.part ? '<b>' + esc(name) + '</b>' : x.key === c.key ? '<button type="button" class="sg-ts-trail" data-tok-part-clear>' + esc(name) + '</button>' : '<button type="button" class="sg-ts-trail" data-tok-chain="' + i + '">' + esc(name) + '</button>'; }).join('<span class="sg-ts-trail-sep" aria-hidden="true">›</span>');
      if (c.part) trail += '<span class="sg-ts-trail-sep" aria-hidden="true">›</span><b>' + esc(c.part) + '</b>';
      var n = 0, html = '<div class="pg-inspect-head sg-ts-pick-head"><span class="sg-ts-pick-trail">' + trail + '</span>' + SG.sysButton('button', 'Done', ' data-tok-done') + '</div><div class="pg-controls">';
      var PART = { icon: /icon/i, text: /text|label|title|font|typo/i };
      var shownG = Object.keys(groups).filter(function (g) { return !c.part || (c.node && used) || PART[c.part].test(g.split(' · ').pop()); });   // a layer's own rules already chose
      if (!shownG.length) shownG = Object.keys(groups);
      shownG.sort().forEach(function (g) { html += '<p class="sg-ts-tok-group">' + esc(g) + '</p>' + groups[g].map(function (x) { n++; return rowOf(x); }).join(''); });
      pickCard.innerHTML = html + (n ? '' : '<p class="sg-ts-hint">Nothing to change here: its tokens are not colours, sizes or switches.</p>') + '</div>';
      // Its head stays just under the panel's own; picked, the panel scrolls to the card's top.
      var ph = panel.el.querySelector('.sg-panel-head'), col = root.querySelector('.sg-ts'), own = col && getComputedStyle(col).overflowY === 'auto', sc = own ? col : panel.el.querySelector('.sg-tk-detail'), off = own ? 0 : (ph ? ph.offsetHeight : 0);
      if (ph) root.style.setProperty('--ts-head', ph.offsetHeight + 'px');
      if (!keep && sc) sc.scrollTo({ top: Math.max(0, sc.scrollTop + pickCard.getBoundingClientRect().top - sc.getBoundingClientRect().top - off), behavior: 'smooth' });   // the column itself scrolls when side by side
    };
    // Focus: while a component is picked, its tokens alone in the form; Done brings the theme's options back.
    var focusMode = function (on) { var f = root.querySelector('.sg-ts'); if (f) f.classList.toggle('is-focus', on); };
    var showMode = function (md) { if (!COLOUR_AXIS || mode === md) return; mode = md; setMode(mode); Array.prototype.forEach.call(root.querySelectorAll('[data-seg="mode"] > button'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === mode)); }); };
    // A token changed (null: back as it was): colours per mode, the rest for both. The dark fields follow light until set.
    var setTok = function (cssVar, kind, val, md) {
      var bucket = kind === 'colour' ? tokOver[md || 'light'] : tokOver.all;
      if (val == null) delete bucket[cssVar]; else bucket[cssVar] = val;
      var r = pickCard.querySelector('[data-tok-reset="' + cssVar + '"]' + (kind === 'colour' ? '[data-mode="' + (md || 'light') + '"]' : '')); if (r) r.hidden = val == null;
      if (kind === 'colour' && md !== 'dark' && !tokOver.dark[cssVar]) {
        var v = BYVAR[cssVar], d = v && darkOf(v), pk = pickCard.querySelector('[data-kind="colour"][data-mode="dark"][data-tok="' + cssVar + '"]');
        if (pk && d) { pk.value = hex6(d); pk.parentNode.querySelector('[data-kind="colour-hex"]').value = d; }
      }
      changed(); repaint();
    };
    pickCard.addEventListener('input', function (e) {
      e.stopPropagation();
      var t = e.target, v = t.getAttribute('data-tok'), k = t.getAttribute('data-kind'), md = t.getAttribute('data-mode'); if (!v) return;
      if (k === 'colour') { t.parentNode.querySelector('[data-kind="colour-hex"]').value = t.value; showMode(md); setTok(v, 'colour', t.value, md); }
      else if (k === 'colour-hex') { var hx = hexOf(t.value); if (hx) { t.parentNode.querySelector('[data-kind="colour"]').value = hex6(hx); showMode(md); setTok(v, 'colour', hx, md); } }
      else if (k === 'size') { var n = parseFloat(t.value); if (!isNaN(n)) setTok(v, 'size', n + 'px'); }
    });
    pickCard.addEventListener('change', function (e) { e.stopPropagation(); });
    pickCard.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target.closest('[data-tok-done]')) { picked = null; focusMode(false); Array.prototype.forEach.call(fdoc.querySelectorAll('.ts-picked'), function (x) { x.classList.remove('ts-picked'); }); pickCard.innerHTML = '<p class="sg-ts-hint sg-ts-pick-empty">Click a component in the preview to change its tokens.</p>'; return; }
      var ch = e.target.closest('[data-tok-chain]'); if (ch && picked && picked.chain) { var x = picked.chain[+ch.getAttribute('data-tok-chain')]; if (x) pick({ el: x.el, key: x.key, cls: x.cls, chain: picked.chain }); return; }
      if (e.target.closest('[data-tok-part-clear]') && picked) { picked.part = null; pick(picked, true); return; }
      var bt = e.target.closest('[data-kind="bool"]'); if (bt) { Array.prototype.forEach.call(bt.parentNode.children, function (x) { x.setAttribute('aria-pressed', String(x === bt)); }); setTok(bt.getAttribute('data-tok'), 'bool', bt.getAttribute('data-v')); return; }
      var rs = e.target.closest('[data-tok-reset]'); if (rs) { e.preventDefault(); setTok(rs.getAttribute('data-tok-reset'), rs.getAttribute('data-kind'), null, rs.getAttribute('data-mode')); setTimeout(function () { if (picked) pick(picked, true); }, 60); }
    });
    var lastSide = 'bg';   // the menu's background or its content (the colours drawn on it): which was edited last
    var byHand = function (id) { var f = $(id + '-hex'); return f && f.dataset.hand === '1' ? hexOf(f.value) : null; };
    var current = function () {
      var fam = $('ts-font').value === 'other' ? $('ts-font-other').value.trim() : $('ts-font').value;
      return { fontFamily: fam || start.fontFamily, primary: hexOf($('ts-primary-hex').value) || start.primary, secondary: hexOf($('ts-secondary-hex').value) || start.secondary, appBg: ($('ts-bg-hex') && hexOf($('ts-bg-hex').value)) || start.appBg,
        buttonRadius: Math.max(0, Math.round(+$('ts-btn-r-num').value || 0)), cardRadius: Math.max(0, Math.round(+$('ts-card-r-num').value || 0)), spacing: $('ts-space-num') ? Math.max(0, +$('ts-space-num').value || 100) : 100, borderWidth: $('ts-border-num') ? Math.max(0, +$('ts-border-num').value || 0) : start.borderWidth, shadowBlur: $('ts-blur-num') ? Math.max(0, +$('ts-blur-num').value || 0) : start.shadowBlur,
        grad: STOPS.reduce(function (o, st) { var f = $(st.id + '-hex'); if (f && hexOf(f.value)) o[st.v] = hexOf(f.value); return o; }, {}),
        menuLead: lastSide, tokens: JSON.parse(JSON.stringify(tokOver)),
        dark: { primary: byHand('ts-primary-d'), secondary: byHand('ts-secondary-d'), appBg: byHand('ts-bg-d'), grad: STOPS.reduce(function (o, st) { var d = byHand(st.id + '-d'); if (d) o[st.v] = d; return o; }, {}) }, shadows: segVal('shadows') !== 'false' };
    };
    var paint = function () {
      if (!box) return;
      var on = source === 'scratch', b = current();
      if (on && b.fontFamily && fdoc) ensureFont(b.fontFamily, fdoc);
      if (tstyle) tstyle.textContent = on ? themeCss(b, '#ts-screen', mode) : '';
      // No shadows, no blur to set: its slider is off with them.
      var noShadow = segVal('shadows') === 'false';
      ['ts-blur', 'ts-blur-num'].forEach(function (id) { var x = $(id); if (x) x.disabled = noShadow; });
      var blurRow = $('ts-blur') && $('ts-blur').closest('.pg-ctl'); if (blurRow) blurRow.classList.toggle('is-off', noShadow);
      // Each colour's dark field shows the value worked out from light until it is set by hand.
      [['ts-primary', PRIMARY, b.primary], ['ts-secondary', SECONDARY, b.secondary], ['ts-bg', APP_BG, b.appBg]].forEach(function (x) {
        var f = $(x[0] + '-d-hex'), pick = $(x[0] + '-d'); if (!f || !x[1] || !x[2] || f.dataset.hand === '1') return;
        var d = x[1] === APP_BG ? bgDark(x[2]) : inMode(x[1], x[2], 'dark'); if (!d) return;
        if (document.activeElement !== f) f.value = d; pick.value = hex6(d);
      });
      STOPS.forEach(function (st) { var f = $(st.id + '-d-hex'), pick = $(st.id + '-d'), hex = (b.grad || {})[st.v]; if (!f || !hex || f.dataset.hand === '1') return; var d = tokenDark(st, hex); if (document.activeElement !== f) f.value = d; pick.value = hex6(d); });
      fit();
    };
    var later = null, repaint = function () { clearTimeout(later); later = setTimeout(paint, 40); };
    // The colours the theme starts from, as the screen shows them; written into the fields when asked (a theme just
    // opened, or another one chosen to start from).
    var seed = function (fill) {
      live = { font: live.font, primary: PRIMARY && LIVE.light[PRIMARY.v], secondary: SECONDARY && LIVE.light[SECONDARY.v], appBg: APP_BG && LIVE.light[APP_BG.v], grad: STOPS.reduce(function (o, st) { if (LIVE.light[st.v]) o[st.v] = LIVE.light[st.v]; return o; }, {}) };
      if (fill) STOPS.forEach(function (st) { var x = live.grad[st.v]; if (x && $(st.id)) { $(st.id).value = hex6(x); $(st.id + '-hex').value = x; } });
      var FIELD = { primary: 'ts-primary', secondary: 'ts-secondary', appBg: 'ts-bg' };
      if (fill && live.font) {   // the font the screen draws: chosen, and offered when the system's list lacks it
        var fs = $('ts-font');
        if (fs && !Array.prototype.some.call(fs.options, function (o) { return o.value.toLowerCase() === live.font.toLowerCase(); })) { var op = document.createElement('option'); op.value = op.textContent = live.font; fs.insertBefore(op, fs.firstChild); }
        if (fs) { fs.value = Array.prototype.filter.call(fs.options, function (o) { return o.value.toLowerCase() === live.font.toLowerCase(); })[0].value; if (fs._dd) fs._dd.refresh(); $('ts-font-other').hidden = true; }
      }
      if (fill) Object.keys(FIELD).forEach(function (k) { var id = FIELD[k]; if (live[k] && $(id)) { $(id).value = hex6(live[k]); $(id + '-hex').value = live[k]; } });
    };
    if (box) {
      draw(box.getAttribute('data-screen'));
      seed(!draft.brief && !editing);   // a theme being edited keeps its own colours
      paint(); if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(box.parentNode); }
    panel.el.addEventListener('transitionend', fit, { once: true });
    // The preview stays in view while the form scrolls, just under the panel's own title (which stays too).
    var head = panel.el.querySelector('.sg-panel-head'), pv = root.querySelector('.sg-ts-preview');
    var under = function () {
      if (!head) return;
      // Stuck where it starts, level with the form's first card: never pushed lower than its own place.
      var scroller = panel.el.querySelector('.sg-tk-detail'), first = root.querySelector('.sg-ts > *:not([hidden])');
      var at = scroller && first ? first.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop : head.offsetHeight + 16;
      root.style.setProperty('--ts-top', Math.round(Math.max(head.offsetHeight, at)) + 'px'); root.style.setProperty('--ts-head', head.offsetHeight + 'px');
      var acts = head.querySelector('.sg-ts-actions'), pvb = root.querySelector('.sg-ts-preview');
      if (acts && pvb) acts.style.right = Math.max(0, head.getBoundingClientRect().right - pvb.getBoundingClientRect().right) + 'px';
    };
    under(); if (head && typeof ResizeObserver !== 'undefined') new ResizeObserver(under).observe(head);

    root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-seg] > button'); if (b) {
        Array.prototype.forEach.call(b.parentNode.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        var which = b.parentNode.getAttribute('data-seg');
        if (which === 'mode') { mode = b.getAttribute('data-v'); setMode(mode); }
        if (which === 'source') { source = b.getAttribute('data-v'); Array.prototype.forEach.call(root.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.getAttribute('data-pane') !== source; }); root.querySelector('.sg-ts-done').hidden = true; }
        repaint(); return;
      }
      var au = e.target.closest('[data-auto]');
      if (au) { e.preventDefault(); var f = $(au.getAttribute('data-auto') + '-hex'); f.dataset.hand = ''; f.value = ''; au.hidden = true; paint(); return; }
      var a = e.target.closest('[data-ts]'); if (!a) return;
      if (a.getAttribute('data-ts') === 'cancel') { style.textContent = ''; return panel.close(); }
      create();
    });
    // A field corrected clears its message; a colour and its hex follow each other; a slider shows its size; Other…
    // shows its field. Every change shows in the preview at once.
    var changed = function () { var sb = phead && phead.querySelector('[data-ts="create"]'); if (sb && sb.disabled) sb.disabled = false; };
    root.addEventListener('change', changed); root.addEventListener('click', function (e) { if (e.target.closest('[data-seg] > button, [data-auto]')) changed(); });
    root.addEventListener('input', function (e) {
      changed();
      if (/^ts-g\d+/.test(e.target.id)) lastSide = 'bg'; else if (/^ts-(primary|secondary)/.test(e.target.id)) lastSide = 'content';
      var id = e.target.id; err(id.replace(/-(hex|other)$/, ''), ''); err(id, '');
      if (e.target.type === 'color') $(id + '-hex').value = e.target.value;
      if (/-d(-hex)?$/.test(id)) { var did = id.replace(/-hex$/, ''), hf = $(did + '-hex'); if (e.target.type === 'color') hf.value = e.target.value; hf.dataset.hand = hf.value.trim() ? '1' : ''; var rb = root.querySelector('[data-auto="' + did + '"]'); if (rb) rb.hidden = hf.dataset.hand !== '1'; }
      // Editing a colour shows the mode it is for: light, or dark for a dark field.
      var forMode = /^ts-(primary|secondary|bg|g\d+)-d(-hex)?$/.test(id) ? 'dark' : /^ts-(primary|secondary|bg|g\d+)(-hex)?$/.test(id) ? 'light' : null;
      if (forMode && mode !== forMode) { mode = forMode; setMode(mode); Array.prototype.forEach.call(root.querySelectorAll('[data-seg="mode"] > button'), function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-v') === mode)); }); }
      if (/-hex$/.test(id) && hexOf(e.target.value) && hexOf(e.target.value).length === 7) $(id.replace(/-hex$/, '')).value = hexOf(e.target.value);
      // A slider and its number follow each other: the number may go past the slider's end (the slider then stays there).
      if (e.target.type === 'range') $(id + '-num').value = e.target.value;
      if (/-num$/.test(id)) { var rng = $(id.replace(/-num$/, '')), n = Math.max(0, +e.target.value || 0); rng.value = Math.max(+rng.min, Math.min(n, +rng.max)); }
      repaint();
    });
    root.addEventListener('change', function (e) {
      var id = e.target.id;
      if (id === 'ts-font') { $('ts-font-other').hidden = e.target.value !== 'other'; if (e.target.value === 'other') $('ts-font-other').focus(); }
      if (id === 'ts-screen') { draft.screen = e.target.value; keep(); draw(e.target.value); }
      if (id === 'ts-base') { baseTheme = e.target.value; draft.base = baseTheme; keep(); draw(box.getAttribute('data-screen')); seed(true); }
      if (id === 'ts-refs') { var n = e.target.files ? e.target.files.length : 0; err('ts-refs', ''); var hr = e.target.parentNode.querySelector('.sg-ts-hint'); if (hr && n) hr.textContent = n + ' picture' + (n === 1 ? '' : 's') + ' chosen. Reading them into a theme comes next.'; }
      if (id === 'ts-file') { var f = e.target.files && e.target.files[0]; err('ts-file', ''); var h = e.target.parentNode.querySelector('.sg-ts-hint'); if (f && h) h.textContent = f.name + ' · ' + (f.size < 1024 ? f.size + ' B' : Math.round(f.size / 1024) + ' KB'); }
      repaint();
    });
    // Closed: the page is the system's again.
    if (!panel.el._tsWrapped) { var shut = panel.el._shut; panel.el._shut = function () { var st = document.getElementById('sg-ts-theme'); if (st) st.textContent = ''; shut(); }; panel.el._tsWrapped = true; }

    var create = function () {
      var req = { source: source, at: new Date().toISOString() }, ok = true;
      var need = function (id, text) { if (!String($(id).value || '').trim()) { err(id, text); ok = false; } return String($(id).value || '').trim(); };
      if (source === 'figma') {
        req.name = need('ts-fig-name', 'Give the theme a name.');
        var url = need('ts-url', 'Paste the Figma file\'s link.');
        if (url && !/^https:\/\/(www\.)?figma\.com\/(design|file)\/[A-Za-z0-9]{10,}/.test(url)) { err('ts-url', 'That is not a Figma file\'s link (figma.com/design/…).'); ok = false; }
        req.url = url;
      } else if (source === 'references') {
        req.name = need('ts-ref-name', 'Give the theme a name.');
        var pics = $('ts-refs').files ? Array.prototype.slice.call($('ts-refs').files) : [];
        if (!pics.length) { err('ts-refs', 'Choose one or more pictures.'); ok = false; }
        req.pictures = pics.map(function (f) { return { name: f.name, size: f.size, type: f.type }; });
      } else if (source === 'file') {
        req.name = need('ts-file-name', 'Give the theme a name.');
        var f = $('ts-file').files && $('ts-file').files[0];
        if (!f) { err('ts-file', 'Choose a .json, .css or .zip file.'); ok = false; }
        else if (!/\.(json|css|zip)$/i.test(f.name)) { err('ts-file', 'Only .json, .css or .zip.'); ok = false; }
        else req.file = { name: f.name, size: f.size, type: f.type };
      } else {
        req.name = need('ts-name', 'Give the theme a name.');
        if ($('ts-font').value === 'other') need('ts-font-other', 'Name the font family.');
        ['ts-primary', 'ts-secondary'].forEach(function (id) { if (!hexOf($(id + '-hex').value)) { err(id, 'A colour as hex, like #2563eb.'); ok = false; } });
        req.brief = current(); req.base = baseTheme || null;
      }
      if (!ok) { var first = root.querySelector('[aria-invalid="true"]'); if (first) first.focus(); return; }
      draft = { source: source, name: req.name, url: req.url || draft.url, brief: req.brief || draft.brief, screen: draft.screen, base: baseTheme }; keep();
      if (req.brief) brief = Object.assign({}, start, req.brief, { name: req.name });
      var done = root.querySelector('.sg-ts-done');
      if (source === 'scratch') {
        var saved = saveTheme(req.name, baseTheme, req.brief, editing && editing.id);
        if (saved) { panel.close(); return; }
        done.textContent = 'This browser could not keep the theme.';
      } else done.textContent = 'Saved as a draft: ' + req.name + '. Reading ' + (source === 'figma' ? 'a Figma file' : source === 'references' ? 'pictures' : 'a file') + ' comes next.';
      done.hidden = false;
      try { document.dispatchEvent(new CustomEvent('sg-theme-request', { detail: req })); } catch (e) { /* an old browser: the draft is kept */ }
    };
  };

  // Saved themes: kept in this browser, each listed in the guide's Theme choice after the file's own; chosen, it is the
  // theme it is based on with its changes over it, everywhere the guide draws the system.
  var SAVED_KEY = 'sg-ts-themes', ACTIVE_KEY = 'sg-ts-active';
  // The link names the theme in use beside its base (?brand=retail&theme=ocean), so it opens the same page.
  var slugOf = function (t) { return String(t.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || t.id; };
  var themeParam = function (t) { try { var u = new URL(location.href); if (t) u.searchParams.set('theme', slugOf(t)); else u.searchParams.delete('theme'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* a page opened as a file */ } };
  var savedThemes = function () { try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch (e) { return []; } };
  // Themes are kept as files in a themes folder of their own, apart from the engine and from the system's project: one
  // file each in its <system>/ subfolder, which the build puts into the page. This browser keeps a working copy: a file newer than it
  // replaces it, and a theme deleted here is not brought back by its file.
  var GONE_KEY = 'sg-ts-deleted', FILES = (EDITOR.files || []).filter(function (t) { return t && t.id && t.name; });
  var SYS = EDITOR.system || 'system', HOME = EDITOR.folder || '';   // the themes folder, as the setup writes it (styleguide.themes)
  var gone = function () { try { return JSON.parse(localStorage.getItem(GONE_KEY) || '[]'); } catch (e) { return []; } };
  (function () {
    var list = savedThemes(), off = gone(), moved = false;
    FILES.forEach(function (t) {
      if (off.indexOf(t.id) >= 0) return;
      var at = list.map(function (x) { return x.id; }).indexOf(t.id), copy = Object.assign({}, t); delete copy.file;
      if (at < 0) { list.push(copy); moved = true; } else if (String(t.changed || '') > String(list[at].changed || '')) { list[at] = copy; moved = true; }
    });
    if (moved) try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) { /* nothing kept */ }
  })();
  var fileOf = function (t) { return slugOf(t) + '.theme.json'; };
  // The folder: Chrome writes into it once it is chosen (the choice kept in this browser); elsewhere each theme is
  // downloaded, to be put there by hand.
  var idb = function (put) {
    return new Promise(function (ok, no) {
      if (!window.indexedDB) return no();
      var r = indexedDB.open('sg-ts-folder', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('h'); };
      r.onerror = no;
      r.onsuccess = function () { var st = r.result.transaction('h', put ? 'readwrite' : 'readonly').objectStore('h'), q = put ? st.put(put, SYS) : st.get(SYS); q.onsuccess = function () { ok(q.result); }; q.onerror = no; };
    });
  };
  var askFolder = function () {
    return new Promise(function (ok) {
      var d = document.createElement('dialog'); d.className = 'sg-dialog'; d.setAttribute('aria-labelledby', 'sg-ts-folder-title');
      d.innerHTML = '<h2 class="sg-dialog-title" id="sg-ts-folder-title">Where are themes kept?</h2><p class="sg-dialog-text">Choose the <b>' + esc(HOME ? HOME.replace(/\/+$/, '') + '/' + SYS : SYS) + '</b> folder (make it first if it is not there). Each theme is saved there as a file, and the next build puts it into the style guide. (In the folder picker, Cmd+Shift+. shows hidden folders.)</p>' +
        '<div class="sg-dialog-acts">' + SG.sysButton('button', 'Download instead', ' data-no') + SG.sysButton('button', 'Choose folder', ' data-yes data-tone="primary"') + '</div>';
      (document.querySelector('.sg-layout') || document.body).appendChild(d);
      var done = function (h) { d.close(); d.remove(); ok(h); };
      d.addEventListener('click', function (e) {
        if (e.target.closest('[data-no]')) return done(null);
        if (e.target.closest('[data-yes]')) window.showDirectoryPicker({ id: 'sg-ts-themes', mode: 'readwrite' }).then(function (h) { idb(h).catch(function () {}); done(h); }, function () { done(null); });
      });
      d.addEventListener('cancel', function (e) { e.preventDefault(); done(null); });
      d.showModal();
    });
  };
  var folder = function (ask) {
    if (!window.showDirectoryPicker) return Promise.resolve(null);
    return idb().catch(function () { return null; }).then(function (h) {
      if (!h) return ask ? askFolder() : null;
      return h.queryPermission({ mode: 'readwrite' }).then(function (p) { return p === 'granted' ? p : ask ? h.requestPermission({ mode: 'readwrite' }) : p; }).then(function (p) { return p === 'granted' ? h : ask ? askFolder() : null; });
    });
  };
  var download = function (t) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' })); a.download = fileOf(t); document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000); };
  var writeTo = function (h, t) { return h.getFileHandle(fileOf(t), { create: true }).then(function (fh) { return fh.createWritable(); }).then(function (w) { return w.write(JSON.stringify(t, null, 2)).then(function () { return w.close(); }); }); };
  // Kept: written to the folder (with every theme this browser holds that the folder lacks yet, the first time), else
  // downloaded. A theme renamed leaves its old file.
  var persist = function (t, was) {
    folder(true).then(function (h) {
      if (!h) return download(t);
      var first = !FILES.length ? savedThemes().filter(function (x) { return x.id !== t.id; }) : [];
      return writeTo(h, t).then(function () { return Promise.all(first.map(function (x) { return writeTo(h, x); })); }).then(function () { if (was && fileOf(was) !== fileOf(t)) return h.removeEntry(fileOf(was)).catch(function () {}); });
    }).catch(function () { download(t); });
  };
  var unpersist = function (t) {
    if (!t) return;
    var off = gone(); if (off.indexOf(t.id) < 0) off.push(t.id); try { localStorage.setItem(GONE_KEY, JSON.stringify(off)); } catch (e) { /* nothing kept */ }
    folder(false).then(function (h) { if (h) return h.removeEntry(fileOf(t)); }).catch(function () {});
  };
  var PAGE_SCOPES = ':is(.sg-layout, .pg-preview, .pg-frame, .pg-frame-stage, .pg-variants, .pg-offstage, .pg-anat-wrap, .sg-thumb, .sg-showroom, .type-list, .sg-type-family, .sg-overlay-host)';
  var oldScope = function (id, mode) {   // the scope themes were saved with before an element's own mode counted
    var dark = COLOUR_AXIS && axisValue('dark'), at = 'html[data-ts-theme="' + id + '"][data-ts-theme]';
    return (dark ? at + (mode === 'dark' ? '[' + COLOUR_AXIS.attr + '="' + dark + '"]' : ':not([' + COLOUR_AXIS.attr + '="' + dark + '"])') : at) + ' ' + PAGE_SCOPES;
  };
  // Where a saved theme applies in a mode: the guide's drawing areas while the page is in that mode, and every element
  // that sets that mode itself (a component's own mode switch, the Identity page's tiles), which declares the system's
  // tokens again inside the page.
  var pageScope = function (id, mode) {
    if (!COLOUR_AXIS || !axisValue('dark')) return oldScope(id, mode);
    var at = 'html[data-ts-theme="' + id + '"][data-ts-theme]', own = axisValue(mode);
    return ':is(' + oldScope(id, mode) + (own ? ', ' + at + ' [' + COLOUR_AXIS.attr + '="' + own + '"]' : '') + ')';
  };
  var applied = document.createElement('style'); applied.id = 'sg-ts-applied'; document.head.appendChild(applied);
  var paintSaved = function () {
    savedThemes().forEach(function (t) { if (t.brief && t.brief.fontFamily) ensureFont(t.brief.fontFamily, document); }); applied.textContent = savedThemes().map(function (t) { var css = t.css || ''; if (css.indexOf(':is(html[') < 0) ['dark', 'light'].forEach(function (md) { css = css.split(oldScope(t.id, md)).join(pageScope(t.id, md)); }); return css; }).join('\n'); };
  var CHOICE = SG.brandChoice;
  var listSaved = function () {
    if (!CHOICE) return;
    Array.prototype.forEach.call(CHOICE.select.querySelectorAll('option[data-ts]'), function (o) { o.remove(); });
    savedThemes().forEach(function (t) { var o = document.createElement('option'); o.value = 'ts:' + t.id; o.textContent = t.name; o.setAttribute('data-ts', ''); CHOICE.select.appendChild(o); });
    var nw = document.createElement('option'); nw.value = '__ts-new'; nw.textContent = 'Create new theme…'; nw.setAttribute('data-ts', ''); CHOICE.select.appendChild(nw);
    var on = document.documentElement.getAttribute('data-ts-theme');   // the list drawn again keeps the theme in use chosen
    if (on && CHOICE.select.querySelector('option[value="ts:' + on + '"]')) CHOICE.select.value = 'ts:' + on;
    CHOICE.refresh();
    var list = CHOICE.select.parentElement.querySelector('.sg-select-list'); if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll('.sg-dd-option'), function (o) {
      if (o.dataset.v === '__ts-new') { o.classList.add('sg-ts-new-row'); o.setAttribute('aria-expanded', 'false'); o.innerHTML = PLUS_ICON + '<span>' + esc(o.textContent) + '</span>' + CHEVRON; if (!(o.previousElementSibling && o.previousElementSibling.classList.contains('sg-ts-sep'))) o.insertAdjacentHTML('beforebegin', '<div class="sg-ts-sep" role="separator"></div>'); return; }
      var id = /^ts:/.test(o.dataset.v || '') ? o.dataset.v.slice(3) : null; if (!id) return;
      var name = o.textContent; o.classList.add('sg-ts-saved');
      o.innerHTML = '<span class="sg-ts-saved-name">' + esc(name) + '</span><span class="sg-ts-saved-acts">' +
        SG.sysButton('button', '', ' data-ts-edit="' + esc(id) + '" data-size="s" title="Edit" aria-label="Edit ' + esc(name) + '"', 'sg-ts-act', null, PENCIL) +
        SG.sysButton('button', '', ' data-ts-delete="' + esc(id) + '" data-size="s" title="Delete" aria-label="Delete ' + esc(name) + '"', 'sg-ts-act', null, TRASH) + '</span>';
    });
    if (!list._tsActs) {
      list._tsActs = true;
      // A pencil or a trash acts on its theme, never choosing it: its press stops before the list's own choice.
      ['mousedown', 'click'].forEach(function (type) { list.addEventListener(type, function (e) {
        var b = e.target.closest('[data-ts-edit], [data-ts-delete]'); if (!b) return;
        e.preventDefault(); e.stopPropagation();
        if (type !== 'click') return;
        var t = savedThemes().filter(function (x) { return x.id === (b.getAttribute('data-ts-edit') || b.getAttribute('data-ts-delete')); })[0]; if (!t) return;
        list.hidden = true; var trig = list.parentElement.querySelector('.sg-select-trigger'); if (trig) trig.setAttribute('aria-expanded', 'false');
        if (b.hasAttribute('data-ts-edit')) open(trig, 'scratch', t); else confirmDelete(t, trig);
      }, true); });
      // Create new theme… opens in the list itself: the four starts under it, each opening the panel on its form. The
      // list stays open while it unfolds; a start, by the pointer or by Enter, closes it.
      var trigOf = function () { return list.parentElement.querySelector('.sg-select-trigger'); };
      var shut = function () { list.hidden = true; var t = trigOf(); if (t) t.setAttribute('aria-expanded', 'false'); };
      var unfold = function (row, on) {
        Array.prototype.forEach.call(list.querySelectorAll('.sg-ts-start-sub'), function (x) { x.remove(); });
        row.setAttribute('aria-expanded', String(!!on)); row.classList.toggle('is-open', !!on);
        if (on) row.insertAdjacentHTML('afterend', STARTS.map(function (x) { return '<div class="sg-dd-option sg-ts-start-sub" role="option" aria-selected="false" data-v="__ts-start:' + x[0] + '">' + x[2] + '<span>' + esc(x[1]) + '</span></div>'; }).join(''));
      };
      var act = function (o) {
        if (!o) return false;
        if (o.dataset.v === '__ts-new') { unfold(o, !o.classList.contains('is-open')); return true; }
        var m = /^__ts-start:(\w+)$/.exec(o.dataset.v || ''); if (!m) return false;
        var t = trigOf(); shut(); open(t, m[1]); return true;
      };
      ['mousedown', 'click'].forEach(function (type) { list.addEventListener(type, function (e) {
        var o = e.target.closest('.sg-dd-option'); if (!o || !/^__ts-/.test(o.dataset.v || '')) return;
        e.preventDefault(); e.stopPropagation();
        if (type === 'click') act(o);
      }, true); });
      list.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        var o = list.querySelector('.sg-dd-option.is-active'); if (!o || !/^__ts-/.test(o.dataset.v || '')) return;
        e.preventDefault(); e.stopImmediatePropagation(); act(o);   // before the list's own Enter, which would choose it
      }, true);
      // Closed: folded again, for the next time it opens.
      new MutationObserver(function () { if (list.hidden) { var r = list.querySelector('.sg-ts-new-row'); if (r) unfold(r, false); } }).observe(list, { attributes: true, attributeFilter: ['hidden'] });
    }
  };
  var CHEVRON = '<svg class="sg-ts-icon sg-ts-chev" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l4 4-4 4"/></svg>';
  var PLUS_ICON = '<svg class="sg-ts-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>';
  var PENCIL = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 2.5l3 3L6 13H3v-3l7.5-7.5Z"/><path d="M9 4l3 3"/></svg>';
  var TRASH = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5h11M6 4.5V3h4v1.5M4 4.5l.7 8.5a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4.5"/></svg>';
  // Deleting asks first, in a modal of the page's own look.
  var confirmDelete = function (t, back) {
    var d = document.createElement('dialog'); d.className = 'sg-dialog'; d.setAttribute('aria-labelledby', 'sg-ts-dialog-title'); d.setAttribute('aria-describedby', 'sg-ts-dialog-text');
    d.innerHTML = '<h2 class="sg-dialog-title is-danger" id="sg-ts-dialog-title">Delete ' + esc(t.name) + '?</h2><p class="sg-dialog-text" id="sg-ts-dialog-text">It is removed from the Theme list and from its theme file. This cannot be undone.</p>' +
      '<div class="sg-dialog-acts">' + SG.sysButton('button', 'Cancel', ' data-no') + SG.sysButton('button', 'Delete theme', ' data-yes data-tone="danger"') + '</div>';
    (document.querySelector('.sg-layout') || document.body).appendChild(d);   // inside the guide's layout: its type and the theme's, as every other control
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var shut = function () { if (d.classList.contains('is-closing')) return; d.classList.add('is-closing'); setTimeout(function () { d.close(); d.remove(); if (back && back.focus) back.focus(); }, still ? 0 : 160); };
    d.addEventListener('click', function (e) { if (e.target === d || e.target.closest('[data-no]')) shut(); if (e.target.closest('[data-yes]')) { deleteTheme(t.id); shut(); } });
    d.addEventListener('cancel', function (e) { e.preventDefault(); shut(); });
    d.showModal(); d.querySelector('[data-no]').focus();
  };
  var deleteTheme = function (id) {
    var t = savedThemes().filter(function (x) { return x.id === id; })[0];
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedThemes().filter(function (x) { return x.id !== id; }))); } catch (e) { return; }
    unpersist(t);
    var html = document.documentElement;
    if (html.getAttribute('data-ts-theme') === id) {   // the one in use: the page goes back to the theme it was based on
      html.removeAttribute('data-ts-theme'); try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {} themeParam(null);
      if (CHOICE) { CHOICE.set(t && t.base || ''); CHOICE.select.value = (t && t.base) || ''; }
    }
    paintSaved(); listSaved();
  };
  var useTheme = function (id) {
    var t = savedThemes().filter(function (x) { return x.id === id; })[0], html = document.documentElement;
    if (!t) { html.removeAttribute('data-ts-theme'); try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {} themeParam(null); return; }
    if (CHOICE) CHOICE.set(t.base || '');
    html.setAttribute('data-ts-theme', t.id);
    if (SG.redraw) SG.redraw();   // the pages drawn again with the theme over its brand (Identity reads its values)
    try { localStorage.setItem(ACTIVE_KEY, t.id); } catch (e) {}
    themeParam(t);
    if (CHOICE) { CHOICE.select.value = 'ts:' + t.id; lastChoice = CHOICE.select.value; CHOICE.sync(); }
  };
  var lastChoice = CHOICE ? CHOICE.select.value : '';
  if (CHOICE) CHOICE.select.addEventListener('change', function (e) {
    var v = CHOICE.select.value;
    if (v === '__ts-new') { e.stopImmediatePropagation(); CHOICE.select.value = lastChoice; CHOICE.sync(); choose(CHOICE.select.parentElement.querySelector('.sg-select-trigger')); return; }
    lastChoice = v;
    if (/^ts:/.test(v)) { e.stopImmediatePropagation(); useTheme(v.slice(3)); }
    else { document.documentElement.removeAttribute('data-ts-theme'); try { localStorage.removeItem(ACTIVE_KEY); } catch (x) {} themeParam(null); }
  }, true);
  var MODE_COLS = function (table) { return Array.prototype.map.call(table.querySelectorAll('thead th'), function (th) { var t = th.textContent.trim().toLowerCase(); return /^(light|dark)$/.test(t) ? t : null; }); };
  var probes = {};
  var probe = function (mode) {
    var p = probes[mode]; if (p && p.isConnected) return p;
    p = probes[mode] = document.createElement('div'); p.hidden = true; p.setAttribute('aria-hidden', 'true');
    var v = axisValue(mode); if (COLOUR_AXIS && v) p.setAttribute(COLOUR_AXIS.attr, v);
    (document.querySelector('.sg-main') || document.body).appendChild(p); return p;
  };
  // Read every value first, then write: a read after each write would make the page lay itself out again each time.
  // Identity's colour tiles name their value as text (a var() their colour follows, the hex written once): written
  // again with what the theme gives, back when it is left.
  var rewall = function () {
    var on = document.documentElement.hasAttribute('data-ts-theme'), jobs = [];
    Array.prototype.forEach.call(document.querySelectorAll('[style*="--bk:var(--"]'), function (el) {
      var m = /--bk:var\((--[\w-]+)/.exec(el.getAttribute('style')), b = el.querySelector('b'); if (!m || !b || !/^#?[0-9a-f]{3,8}$/i.test(b.textContent.trim().replace(/^#/, '#'))) return;
      jobs.push({ el: el, b: b, v: m[1] });
    });
    jobs.forEach(function (j) { if (on) j.val = hexOf(getComputedStyle(j.el).getPropertyValue(j.v)); });
    jobs.forEach(function (j) {
      var was = j.b.getAttribute('data-ts-was');
      if (!on) { if (was != null) { j.b.textContent = was; j.b.removeAttribute('data-ts-was'); } return; }
      if (was == null) j.b.setAttribute('data-ts-was', j.b.textContent);
      if (j.val) j.b.textContent = j.val.toUpperCase();
    });
  };
  var retable = function () {
    rewall();
    var on = document.documentElement.hasAttribute('data-ts-theme'), jobs = [];
    Array.prototype.forEach.call(document.querySelectorAll('table'), function (table) {
      var rows = table.querySelectorAll('tr[data-token]'); if (!rows.length) return;
      var cols = MODE_COLS(table);
      Array.prototype.forEach.call(rows, function (tr) {
        var v = BY[tr.getAttribute('data-token')]; if (!v || !v.var) return;
        Array.prototype.forEach.call(tr.children, function (td, i) { if (cols[i] && td.querySelector('.sg-token-swatch')) jobs.push({ td: td, mode: cols[i], v: v.var }); });
      });
    });
    if (!jobs.length) return;
    var cs = { light: on && getComputedStyle(probe('light')), dark: on && getComputedStyle(probe('dark')) };
    jobs.forEach(function (j) { if (on) { var raw = cs[j.mode].getPropertyValue(j.v).trim(); j.val = hexOf(raw) || raw; } });
    jobs.forEach(function (j) {
      var was = j.td.getAttribute('data-ts-was');
      if (!on) { if (was != null) { j.td.innerHTML = was; j.td.removeAttribute('data-ts-was'); } return; }
      if (was == null) j.td.setAttribute('data-ts-was', j.td.innerHTML);
      if (j.val) j.td.innerHTML = '<span class="sg-token-swatch" style="background:' + esc(j.val) + '"></span> ' + esc(j.val);
    });
  };
  var later2 = null, soon = function () { clearTimeout(later2); later2 = setTimeout(retable, 150); }, retableSoon = function () { soon(); };
  if (typeof MutationObserver !== 'undefined') new MutationObserver(function (list) { if (list.some(function (r) { return Array.prototype.some.call(r.addedNodes, function (n) { return n.nodeType === 1 && (n.matches('tr[data-token], table, section') || n.querySelector && n.querySelector('tr[data-token]')); }); })) soon(); }).observe(document.querySelector('.sg-main') || document.body, { childList: true, subtree: true });
  new MutationObserver(soon).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ts-theme', 'data-brand'] });
  paintSaved(); listSaved();
  setTimeout(function () { refreshOld(); }, 1500);   // defined further down: looked up when it runs
  // On load the link decides: its theme when it names one; a link with a brand and no theme, that brand alone; a bare
  // link, the theme last used here.
  (function () {
    var q = new URLSearchParams(location.search), want = q.get('theme'), a = null;
    if (want) { var t = savedThemes().filter(function (x) { return slugOf(x) === want || x.id === want; })[0]; if (t) useTheme(t.id); else themeParam(null); return; }
    if (q.has('brand')) { try { localStorage.removeItem(ACTIVE_KEY); } catch (e) {} return; }
    try { a = localStorage.getItem(ACTIVE_KEY); } catch (e) {} if (a) useTheme(a);
  })();
  // The editor's way of working a theme out: a saved theme from an older one is worked out again from what it holds (its
  // choices), against its base read in a frame of its own (as the preview reads it), in the background on load.
  var THEME_V = 6;   // 6: the page drawn again once worked out; 5: every shadow switch set, on or off; 4: shadows off switch every shadow token off and keep the guide's own lines (drawn as inset shadows)
  //                       3: the chosen font drawn (compared with the one the brand draws, loaded when missing)
  var readBase = function (base, done) {
    var f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    f.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;visibility:hidden;border:0;';
    document.body.appendChild(f);
    var d = f.contentDocument; d.open(); d.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>'); d.close();
    Array.prototype.forEach.call(document.documentElement.attributes, function (a) { if (a.name !== 'class' && a.name !== 'style' && a.name !== 'data-ts-theme') d.documentElement.setAttribute(a.name, a.value); });
    if (base) d.documentElement.setAttribute('data-brand', base); else d.documentElement.removeAttribute('data-brand');
    Array.prototype.forEach.call(document.querySelectorAll('style, link[rel="stylesheet"]'), function (n) { if (n.id !== 'sg-ts-theme' && n.id !== 'sg-ts-applied') d.head.appendChild(d.importNode(n, true)); });
    var el = d.createElement('div'); el.className = 'sg-showroom sg-showroom-screen'; d.body.appendChild(el);
    ['dark', 'light'].forEach(function (md) { var v = axisValue(md); if (COLOUR_AXIS && v != null) d.documentElement.setAttribute(COLOUR_AXIS.attr, v); readLive(el, md); });
    live.font = FONT ? firstFamily(d.defaultView.getComputedStyle(el).getPropertyValue(FONT.v)) : null;
    live = { font: live.font, primary: PRIMARY && LIVE.light[PRIMARY.v], secondary: SECONDARY && LIVE.light[SECONDARY.v], appBg: APP_BG && LIVE.light[APP_BG.v], grad: STOPS.reduce(function (o, st) { if (LIVE.light[st.v]) o[st.v] = LIVE.light[st.v]; return o; }, {}) };
    try { done(); } finally { f.remove(); }
  };
  var refreshOld = function () {
    var list = savedThemes(), old = list.filter(function (t) { return t.v !== THEME_V && t.brief; }); if (!old.length) return;
    // Each worked out against its base (read in a frame, maybe later); once all are, kept, and the page drawn again.
    var left = old.length, done = function () {
      if (--left) return;
      try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) { return; }
      paintSaved(); retableSoon();
      if (document.documentElement.getAttribute('data-ts-theme') && SG.redraw) SG.redraw();
    };
    old.forEach(function (t) { readBase(t.base, function () { t.css = ['light', 'dark'].map(function (md) { return themeCss(t.brief, pageScope(t.id, md), md); }).join('\n'); t.v = THEME_V; done(); }); });
  };
  var saveTheme = function (name, base, b, over) {
    var id = over || 'ts' + Date.now().toString(36), css = ['light', 'dark'].map(function (md) { return themeCss(b, pageScope(id, md), md); }).join('\n');
    var list = savedThemes(), at = list.map(function (t) { return t.id; }).indexOf(over), was = at >= 0 ? list[at] : null;
    var entry = { id: id, v: THEME_V, name: name, base: base || '', brief: b, css: css, at: (was && was.at) || new Date().toISOString(), changed: new Date().toISOString() };
    if (was) list[at] = entry; else list.push(entry);   // edited: in its own place in the list
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(list)); } catch (e) { return null; }
    persist(entry, was);
    paintSaved(); listSaved(); useTheme(id);
    return id;
  };

  // The button, beside the Theme choice: an icon, and a menu of the three starts in the Theme choice's own dropdown.
  if (CHOICE) return;   // the Theme choice holds Create new theme…
  var bar = SG.themeBar(); if (!bar) return;
  var wrap = document.createElement('div'); wrap.className = 'sg-dd sg-ts-new';
  wrap.innerHTML = SG.sysButton('button', '', ' data-ts-open aria-label="New theme" title="New theme" aria-haspopup="menu" aria-expanded="false" aria-controls="sg-ts-menu"', 'sg-ts-open', null, PLUS) +
    '<div class="sg-select-list sg-ts-menu" id="sg-ts-menu" role="menu" aria-label="New theme" tabindex="-1" hidden>' +
    STARTS.map(function (x, i) { return '<div class="sg-dd-option sg-ts-start" role="menuitem" tabindex="-1" id="sg-ts-menu-' + i + '" data-start="' + x[0] + '">' + x[2] + '<span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div>';
  bar.appendChild(wrap);
  var btn = wrap.querySelector('[data-ts-open]'), menu = wrap.querySelector('.sg-ts-menu'), items = function () { return Array.prototype.slice.call(menu.querySelectorAll('[role="menuitem"]')); }, at = 0;
  var mark = function (i) { var its = items(); at = (i + its.length) % its.length; its.forEach(function (x, k) { x.classList.toggle('is-active', k === at); }); menu.setAttribute('aria-activedescendant', its[at].id); };
  var outside = function (e) { if (!wrap.contains(e.target)) shut(false); };
  var shut = function (back) { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); if (back) btn.focus(); };
  var show = function () { menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); mark(STARTS.map(function (x) { return x[0]; }).indexOf(source)); menu.focus({ preventScroll: true }); document.addEventListener('mousedown', outside, true); };
  var choose = function (i) { var k = items()[i].getAttribute('data-start'); shut(false); open(btn, k); };
  btn.addEventListener('click', function () { if (menu.hidden) show(); else shut(true); });
  menu.addEventListener('click', function (e) { var o = e.target.closest('[role="menuitem"]'); if (o) choose(items().indexOf(o)); });
  menu.addEventListener('mousemove', function (e) { var o = e.target.closest('[role="menuitem"]'); if (o) mark(items().indexOf(o)); });
  menu.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); mark(at + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); mark(at - 1); }
    else if (e.key === 'Home') { e.preventDefault(); mark(0); }
    else if (e.key === 'End') { e.preventDefault(); mark(items().length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(at); }
    else if (e.key === 'Escape') { e.preventDefault(); shut(true); }
    else if (e.key === 'Tab') shut(false);
  });
})();
