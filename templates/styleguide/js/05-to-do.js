  /* ── To do: every difference and everything not built yet, numbered, by who acts ──────────────────────────────
     In Figma (the person), in the code, or a decision first. The numbers are the same in each component's
     own list, so "do 3 and 7" names them. */
  // Who acts on an item: you in the Figma file, the code, you deciding which side is
  // right when Figma and the code each have a case, or you checking by hand what only a person can judge.
  var WHO = { figma: 'You in Figma', code: 'A developer in the code', figmaCode: 'In Figma and in the code', both: 'You decide', person: 'You check by hand' };
  // The team that owns what a task is about (ds-config.json owners: a component, a layer or a token prefix to a team),
  // said after who acts: the longest key that is the component's name, or a token prefix the task names ("primitives/");
  // "*" for everything else. None set: nothing said. A task that already knows its team (a product's own) says that one.
  // A key may be a glob ("tile*"), and a value a name or { team, decides } (the team is said here; who decides is said
  // beside what waits on them, decided-by.mjs).
  var OWNERS = (typeof DATA !== 'undefined' && DATA.owners) || {};
  function teamNote(about, team) {
    if (team) return ' · ' + team;
    var teamName = function (v) { return v && typeof v === 'object' ? (v.team || v.decides || '') : (v || ''); };
    var a = String(about || ''), keys = Object.keys(OWNERS).sort(function (x, y) { return y.length - x.length; });
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], kl = k.toLowerCase(), al = a.toLowerCase();
      var glob = k !== '*' && k.indexOf('*') >= 0 && new RegExp('^' + kl.split('*').map(function (x) { return x.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }).join('.*') + '$').test(al);
      if (k !== '*' && teamName(OWNERS[k]) && (al === kl || glob || (k.indexOf('/') >= 0 && al.indexOf(kl) >= 0))) return ' · ' + teamName(OWNERS[k]);
    }
    return teamName(OWNERS['*']) ? ' · ' + teamName(OWNERS['*']) : '';
  }
  // Whether the system has a Figma file at all: with none, every fix is the code's.
  var HAS_FIGMA = typeof COMPONENTS === 'undefined' || COMPONENTS.some(function (c) { return !c.codeOnly; });
  // A colour's contrast lives in the system's colours: fixed in Figma and in the code alike when it has both.
  var COLOUR_SC = /^1\.4\.(3|6|11)$/;
  // Who acts on an accessibility row: Figma when what is missing is in Figma (a role not stated yet), never when the
  // code fails what a Figma note asks (the note is right, the code changes); a colour pair is a design decision; what
  // only a person can judge is checked by hand; the rest is the code's. its: the row's open items ({ st, from }).
  function a11yWho(sc, how, its, note) {
    var from = its.map(function (it) { return it.from || ''; }).join(' ');
    var failed = its.some(function (it) { return it.st === 'todo'; });
    // What waits on its try in a browser is the code's to answer and the audit's to run, a duty a Figma note asked for
    // included: nothing about it is to do in Figma.
    var waits = its.length && its.every(function (it) { return /Tried once the audit runs/.test(it.html || ''); });
    return waits ? WHO.code : /Figma/.test(from) && !failed ? WHO.figma : COLOUR_SC.test(sc) ? (HAS_FIGMA ? WHO.figmaCode : WHO.code) : how === 'person' || (!its.length && /a person checks/.test(note)) ? WHO.person : WHO.code;
  }
  function doWhat(t) { var r = String(t || '').replace(/^In (the code|Figma), /, ''); return r.charAt(0).toUpperCase() + r.slice(1); }   // the label already says where
  var TODO = [], TODO_NO = {};
  COMPONENTS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
    (c.differences || []).forEach(function (x) { TODO.push({ kind: 'parity', who: x.who || 'both', comp: c.name, key: c.name + '\u0000' + x.what, say: x.plain || x.what, todo: x.todo }); });
    (c.a11yFindings || []).forEach(function (x) { TODO.push({ kind: 'a11y', who: x.who || 'both', comp: c.name, key: c.name + '\u0000' + x.what, say: x.plain || x.what, todo: x.todo }); });
    (c.unbuilt || []).forEach(function (u) { TODO.push({ kind: 'parity', who: 'code', comp: c.name, say: 'Figma has the ' + u.label + ' property on ' + c.name + '; the code does not build it yet.', todo: 'Build the ' + u.label + ' property of ' + c.name + ' in the code, remove it from Figma, or keep it as a known exception.' }); });
    // A component only the code has, while Figma has components of its own: Figma's to make, or the code's to retire.
    if (c.codeOnly && c.codeOnly.figma) TODO.push({ kind: 'parity', who: 'figma', comp: c.name, say: 'The code has ' + c.name + ' (' + c.codeOnly.file + '); Figma has no component for it.', todo: 'Add ' + c.name + ' to Figma, remove it from the code, or keep it as a known exception.' });
  });
  // A control the page needs and the system lacks: drawn with a stand-in until the system has one.
  // A control the page draws itself (its segmented control, tooltip, card) is the template's, never the system's work:
  // no task. The system's own gaps are in Parity.
  // What the tokens owe (descriptions to write in Figma, a value written by hand twice, an alias to a removed token).
  (DATA.systemTodo || []).forEach(function (t) { if (t.component) return;   /* one tied to a component is on that component's page */ TODO.push({ who: t.who, comp: null, area: t.area || 'System', type: t.type || 'Tokens, ' + t.kind.toLowerCase(), pairing: t.pairing, match: t.match, team: t.team, say: t.say, todo: t.todo, st: t.st, scope: t.scope || null }); });
  // A component whose file is still to confirm (a proposal, or files near its name) is that decision, not one to build.
  var PAIRING = {}; (DATA.systemTodo || []).forEach(function (t) { if (t.pairing) PAIRING[t.pairing] = true; });
  // A component only the code has, once Figma's components are captured: not on the page, a task each, with its file.
  (DATA.notInFigma || []).forEach(function (k) { TODO.push({ who: 'figma', comp: null, area: 'Parity', type: 'Component', codeOnly: k.name, codeFile: k.file, say: 'The code has ' + k.name + ' (' + k.file + '); Figma has no component for it.', todo: 'Add ' + k.name + ' to Figma, remove it from the code, or keep it as a known exception.', scope: k.scope || null }); });
  ((DATA.notAgreed && DATA.notAgreed.waiting) || []).forEach(function (w) { var n = String(w).replace(/ \(not built yet\)$/, ''); if (PAIRING[n]) return; TODO.push({ who: 'code', comp: null, figmaOnly: n, say: 'Figma has the ' + n + ' component; the code does not have it yet.', todo: 'Build ' + n + ' in the code.', scope: (DATA.notAgreed.scopes || {})[n] || null }); });
  // A Figma name with a slash is a part of the component named before it (chartBars/bar is chartBars's), never a
  // component of its own: counted and listed with its parent. The parent is the component of that name, a leading mark
  // or a trailing note left out (🟡 tableCell (deprecated) is tableCell/amount's), else the family's own name.
  var bareName = function (n) { return String(n).replace(/^[^A-Za-z0-9]+/, '').replace(/\s*\([^)]*\)\s*$/, '').trim(); };
  var PARENT_NAME = {};
  COMPONENTS.forEach(function (c) { if (c.name.indexOf('/') < 0) PARENT_NAME[bareName(c.name).toLowerCase()] = c.name; });
  // A part the engine found by its name and its root's nesting (component-parts.mjs: tileListRow is
  // tileList's), or the team said: its root, as a slash names it.
  var PART_ROOT = {};
  COMPONENTS.forEach(function (c) { if (c.partOf && c.partOf.root) PART_ROOT[String(c.name).trim()] = c.partOf.root; });
  TODO.forEach(function (t) { var n = String(t.figmaOnly || t.pairing || '').trim(); if (n && n.indexOf('/') < 0 && !PARENT_NAME[bareName(n).toLowerCase()]) PARENT_NAME[bareName(n).toLowerCase()] = n; });
  // A component listed in the menu: not a part (its page opens from its parent's), and, when the system is compared
  // with Figma, one both sides have: one only the code has is flagged on Status, as one only Figma has, not listed.
  // In the menu: the system's components, one each. A part opens from its parent; one only the code has, or one the code
  // has only as a CSS class (no component yet), from its Status row.
  function inMenu(c) { return !parentOf(c.name) && !(c.codeOnly && c.codeOnly.figma) && !cssOnly(c); }
  // A family with no page of its own (navigation: navigation/TabMobile, navigation/TabDesktop…) is one entry in the menu,
  // as it is one row on Status, opening its first member; its members are not listed one by one.
  function menuFamily(c) {
    var f = parentOf(c.name); if (!f || (c.codeOnly && c.codeOnly.figma)) return null;
    return COMPONENTS.some(function (x) { return x.name === f; }) ? null : f;
  }
  function menuCount() { var fam = {}; COMPONENTS.forEach(function (c) { var f = menuFamily(c); if (f) fam[f] = 1; }); return COMPONENTS.filter(inMenu).length + Object.keys(fam).length; }
  function parentOf(n) { var x = String(n).trim(), i = x.indexOf('/'); if (PART_ROOT[x]) return PART_ROOT[x]; if (i <= 0) return null; var f = bareName(x.slice(0, i)); return PARENT_NAME[f.toLowerCase()] || f; }
  function familyKey(n) { return parentOf(n) || (String(n).trim() || '(no name)'); }
  // A component a Showroom screen found missing from the code (checked when the screen was built): Missing, whatever
  // file the pairing only suggests.
  var SR_MISSING = {};
  (DATA.showroom || []).forEach(function (s) { (s.missing || []).forEach(function (m) { if (m && m.kind === 'component' && m.name) SR_MISSING[m.name] = m.what; }); });
  // A Showroom finding about a component (cardLedger's colours, the logo sideNavHeader cannot show) is that component's:
  // a Parity row of its own, never a task apart. SR_FOR: component → findings; SR_ON: finding → placed.
  var SR_FOR = {}, SR_ON = {};
  (function () {
    var names = COMPONENTS.filter(function (c) { return !c.codeOnly; }).map(function (c) { return c.name; });
    (DATA.showroom || []).forEach(function (s) { (s.missing || []).forEach(function (m) {
      if (!m || !m.name || m.kind === 'component') return;
      var on = names.filter(function (n) { return n === m.name || new RegExp('(^|[^\\w])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])').test(m.what || ''); });
      on.forEach(function (n) { var l = SR_FOR[n] = SR_FOR[n] || []; if (!l.some(function (x) { return x.m.name === m.name; })) l.push({ m: m, screens: [] }); var f = l.filter(function (x) { return x.m.name === m.name; })[0]; f.screens.push(s.title || s.key); });
      if (on.length) SR_ON[m.name] = true;
    }); });
  })();
  // What a Showroom screen needs that belongs to no component of the system (a brand's logo) is the product's, not the
  // system's: the screen draws its stand-in, and it is no task. One about a component is that component's (SR_FOR).
  (function () {
    var rows = {}; COMPONENTS.forEach(function (c) { rows[c.name] = true; }); TODO.forEach(function (t) { if (t.figmaOnly || t.pairing) rows[String(t.figmaOnly || t.pairing).trim()] = true; });
    var found = {};
    (DATA.showroom || []).forEach(function (s) { (s.missing || []).forEach(function (m) { if (!m || !m.name || (m.kind === 'component' && rows[m.name]) || SR_ON[m.name]) return; (found[m.kind + '\u0000' + m.name] = found[m.kind + '\u0000' + m.name] || { m: m, screens: [] }).screens.push(s.title || s.key); }); });
  })();
  var ORDER = ['figma', 'code', 'both'];
  TODO.sort(function (a, b) { return ORDER.indexOf(a.who) - ORDER.indexOf(b.who); });
  TODO.forEach(function (t, i) { t.no = i + 1; });   // numbered again in the order the Status page shows (fillTodo)

