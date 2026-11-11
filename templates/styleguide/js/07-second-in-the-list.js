  // Second in the list, under the index: where someone looks first after the system itself.
  (function () { var a = nav.querySelector('a[href="#status"]'), o = nav.querySelector('a[href="#index"]'); if (a && o) o.insertAdjacentElement('afterend', a); })();
  var td = section('status', 'Status', 'How the system is doing', '');   // no line under its title: the cards say it
  var hl = td, hlBox = document.createElement('div'); hlBox.className = 'sg-health-box'; td.appendChild(hlBox);
  // Rules: how the system is built, in Figma and in the code (DATA.construction, construction-page.mjs). One table,
  // a row a rule: in Figma the rules it builds a component by (construction-grammar.mjs), the Figma file's own hygiene,
  // the components of one type compared with each other and the tokens; in the code what the code linting finds. Each
  // row says its side and who fixes it, its status (a rule once every component follows it; to fix when most do, the
  // team decided it, or it is the system's own rule; to decide otherwise) and how many follow it. Every column head
  // sorts by it, again for the other way round. A row opens in the side panel: what is suggested, every component or
  // place it changes and the decision under them, in one card; each fix is copied into Claude Code (renames are made by the engine's script,
  // --figma-fix; a name to give, layout and bindings are a person's; the code's change is a patch handed back). No
  // exceptions: a component follows it or is to fix. In the menu, unless the team leaves it out (styleguide.construction).
  // The page lives at #rules; #construction, the address it had, opens it still.
  if (DATA.construction) (function () {
    var G = DATA.construction, RULES = G.rules || [];
    hr(); if (G.listed) navLink('rules', 'rules');
    var sec = section('rules', 'System', 'Rules', '');
    // The kind of rule each is, in five: how things are named, whatever is named; how a component is built inside; its
    // properties (its axes, its options and the shape its family shares); the values it binds, a Figma variable and a
    // style alike, which are one thing to a design system; and what says what it is for. Each rule keeps the finer kind
    // the engine judged it by (layers, nesting, wiring, placement) - this is how the page groups them, so no filter
    // offers one row and no word stands in two columns. Side says whether a rule is Figma's or the code's; an area
    // never does.
    var AREA = {
      naming: 'Naming',
      layout: 'Structure', layers: 'Structure', nesting: 'Structure', placement: 'Structure', wiring: 'Structure', interactions: 'Structure',
      architecture: 'Properties', products: 'Properties',
      variables: 'Tokens', tokens: 'Tokens', styles: 'Tokens',
      documentation: 'Documentation', code: 'Documentation'
    };
    // Read in the order a person meets them, never A to Z: what things are called, what a component takes, how it is
    // built, what it binds, what says what it is for.
    var AREA_ORDER = ['Naming', 'Properties', 'Structure', 'Tokens', 'Documentation'];
    var ST = { fix: ['differs', 'Fix'], decide: ['figma', 'Decide'], rule: ['match', 'Done'] };
    var ORDER = { fix: 0, decide: 1, rule: 2 };
    // Where each rule is, and who fixes it, as the Status page's To do says it.
    var SIDE = { figma: 'Figma', code: 'Code' };   // where a rule was read from, as the column head and the crumbs say it
    var OWNER = { figma: 'Design', code: 'Engineering', both: 'Design and engineering' };
    var rows = RULES.slice().sort(function (a, b) { return (a.side === 'code') - (b.side === 'code') || ORDER[a.status] - ORDER[b.status] || b.toFix.length - a.toFix.length; });
    var dot = function (k, label) { return '<span class="pg-par-status pg-par--' + k + '"><span class="pg-par-sign" aria-hidden="true"></span>' + esc(label) + '</span>'; };
    var known = {}; COMPONENTS.forEach(function (c) { known[c.name] = 1; });
    var FIGMA_URLS = G.figmaUrls || {};
    var compHTML = function (n) { return known[n] ? '<a class="sg-uses-link" href="#' + esc(cid(n)) + '">' + esc(n) + '</a>' : esc(n); };
    // What a rule breaks at: a component, or a place (a file and line, a token, a brand) when it is not one.
    var atOf = function (t) { return t.component || t.where || ''; };
    var comps = function (r) { var seen = {}, out = []; r.toFix.forEach(function (t) { var a = atOf(t); if (!seen[a]) { seen[a] = 1; out.push(a); } }); return out; };
    var byComponent = function (r) { return r.toFix.every(function (t) { return !!t.component; }); };
    var unit = function (r, n) { return byComponent(r) ? (n === 1 ? 'component' : 'components') : (n === 1 ? 'place' : 'places'); };
    var plural2 = function (n) { return n === 1 ? 'component' : 'components'; };
    var followHTML = function (r) {
      if (r.of == null) { var n = comps(r).length; return n ? n + ' ' + unit(r, n) + ' to change' : '<span class="pg-missing">Nothing breaks it</span>'; }
      return r.follows + ' of ' + r.of + ' <span class="pg-par-val sg-cx-share">(' + Math.round(r.follows / (r.of || 1) * 100) + '%)</span>';
    };
    var cmd = 'rms-design-system-engine';
    // The one change for every component a rule has to fix, as it is copied into Claude Code: renames the engine writes,
    // names for unnamed layers Claude proposes as one list, layout and bindings Claude walks through; the code's change
    // handed back as a patch, never written over the code people wrote.
    var applyAll = function (r) {
      var cs = comps(r), n = cs.length, f = (r.toFix[0] || {}).fix || {};
      var lead = 'Make every ' + (byComponent(r) ? 'component' : 'place') + ' follow the system\'s construction rule "' + r.says + '" (' + n + ' ' + unit(r, n) + ' to change: ' + cs.join(', ') + '). ';
      if (r.side === 'code') return lead + (r.status === 'decide' ? 'Give me one list with each one and the choice it takes, for me to decide; change no code.' : 'Hand each change back as a patch for a person to apply; change no code yourself.');
      if (f.what) return lead + 'Run ' + cmd + ' --figma-fix --rule ' + r.id + ', then apply the script it writes.';
      if (f.layers) return lead + 'Run ' + cmd + ' --figma-fix --rule ' + r.id + ': read in Figma what each unnamed layer holds, propose one list of names, and once I approve it run it again with --names and apply the script it writes.';
      if (r.status === 'decide') return lead + 'Give me one list with each one and the choice it takes, for me to decide; change nothing in Figma yet.';
      return lead + 'The engine does not change layout or variable bindings: give me one list of what to change in Figma, component by component, in the order to do it.';
    };
    var copyBtn = function (k, head, text) { return '<div class="sg-decide sg-decide--' + k + '"><strong class="sg-decide-head">' + decideMark(k) + esc(head) + '</strong>' + sysButton('button', 'Copy', ' data-cx-copy="' + esc(text) + '"') + '<span class="sg-decide-said" role="status"></span></div>'; };
    var rowHTML = function (r, i) {
      return '<tr class="sg-row-open" tabindex="0" data-cx-row="' + i + '" data-chip="' + r.status + '" data-f data-f-area="' + esc(AREA[r.area] || capital(r.area)) + '" data-f-source="' + esc(SIDE[r.side] || SIDE.figma) + '" data-f-status="' + esc(ST[r.status][1]) + '"><td><strong>' + esc(r.says) + '</strong></td><td>' + esc(AREA[r.area] || capital(r.area)) + '</td><td>' + esc(SIDE[r.side] || SIDE.figma) + '</td><td>' + followHTML(r) + '</td><td>' + esc(OWNER[r.who] || OWNER.figma) + '</td><td>' + dot(ST[r.status][0], ST[r.status][1]) + '</td><td class="sg-row-go">' + USERS_ARROW + '</td></tr>';
    };
    // A column head sorts by it; clicked again, the other way round. A name A to Z, a share and a status with what is
    // most open first; rules of the same value keep the page's own order. A row keeps its number (data-cx-row), so it
    // opens the rule it opened before however the table is sorted.
    var SORT = [
      ['Rule', function (r) { return r.says.toLowerCase(); }],
      ['Area', function (r) { return (AREA[r.area] || capital(r.area)).toLowerCase(); }],
      ['Source', function (r) { return (SIDE[r.side] || SIDE.figma).toLowerCase(); }],
      ['Follow it', function (r) { return r.of ? r.follows / r.of : comps(r).length ? 0 : 1; }],
      ['Owned by', function (r) { return (OWNER[r.who] || OWNER.figma).toLowerCase(); }],
      ['Status', function (r) { return ORDER[r.status]; }]
    ];
    var sortOf = {}; SORT.forEach(function (c) { sortOf[c[0]] = c[1]; });
    var cxKey = function (r) { return 'cx:' + r.id; };
    var panel = function (i, from) {
      var r = rows[i]; if (!r) return;
      var m = panelShell('sg-cx-panel', 'Rules'); m._key = cxKey(r);
      var card = function (head, html) { return html ? '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">' + esc(head) + '</div><div class="sg-row-detail-body">' + html + '</div></div>' : ''; };
      var cs = comps(r), byC = {}, n = cs.length;
      r.toFix.forEach(function (t) { var a = atOf(t); (byC[a] = byC[a] || []).push(t); });
      var WAY_HEAD = { own: 'Variables made for each component', shared: 'Shared variables' };
      var lower = function (x) { return String(x).replace(/^\w/, function (c) { return c.toLowerCase(); }); };
      var pct = r.of ? Math.round(r.follows / r.of * 100) : null;
      // What the engine suggests, from what most of the system already does; one decision for every component.
      var suggest, decide;
      if (r.status === 'rule') { suggest = '<p class="sg-il-line">' + esc((r.of == null ? 'Nothing found that breaks it.' : 'Every one follows it.') + ' Nothing to change.') + '</p>'; decide = ''; }
      else if (r.kind === 'break') {
        suggest = (r.of != null ? '<p class="sg-il-line">' + esc(r.follows + ' of ' + r.of + ' (' + pct + '%) already follow it.') + '</p>' : '') + '<p class="sg-il-line"><strong>' + esc(r.todo || '') + '</strong></p>';
        decide = '<div class="sg-decide-grid">' + copyBtn('approve', n === 1 ? (r.status === 'decide' ? 'Decide on it' : 'Apply it') : (r.status === 'decide' ? 'Decide on all ' : 'Apply to all ') + n, applyAll(r)) + '</div>';
      }
      else if (r.ways) {
        var best = r.ways[0], other = r.ways[1];
        suggest = '<p class="sg-il-line"><strong>' + esc(WAY_HEAD[best.way]) + '</strong>: ' + esc(best.follows + ' of ' + r.of + ' components already do this (' + lower(best.says) + ').') + '</p><p class="sg-il-line"><span class="pg-par-val">' + esc(other.follows + ' go the other way (' + lower(other.says) + '). Choose one; the others are then changed to match.') + '</span></p>';
        decide = '<div class="sg-decide-grid">' + r.ways.map(function (w, k) { return copyBtn(k ? 'change' : 'approve', (k ? '' : 'Suggested: ') + WAY_HEAD[w.way], 'The system\'s construction rule: "' + w.says + '". Run ' + cmd + ' --construction ' + r.id + ' ' + w.way + '.'); }).join('') + '</div>';
      }
      else if (r.status === 'decide') {
        suggest = '<p class="sg-il-line">' + esc(r.follows + ' of ' + r.of + ' ' + unit(r, r.of) + ' (' + pct + '%) already do this.') + '</p><p class="sg-il-line">' + (pct >= 50 ? '<strong>' + esc('Suggested: make it the rule, and change the ' + n + ' that don\'t.') + '</strong>' : esc('Fewer than half do: make it the rule only if it is how the system should be built; then ' + n + ' are to change.')) + '</p>';
        decide = '<div class="sg-decide-grid">' + copyBtn('approve', 'Make it the rule', 'Make it a construction rule of the system: "' + r.says + '". Run ' + cmd + ' --construction ' + r.id + ' yes.') + copyBtn('drop', 'Not a rule', 'It is not a construction rule of the system: "' + r.says + '". Run ' + cmd + ' --construction ' + r.id + ' no.') + '</div>';
      }
      else {
        suggest = '<p class="sg-il-line">' + esc(r.follows + ' of ' + r.of + ' ' + unit(r, r.of) + ' (' + pct + '%) already do this.') + '</p><p class="sg-il-line"><strong>' + esc('Suggested: change the ' + n + ' ' + unit(r, n) + ' that don\'t, so every one does.') + '</strong></p>';
        decide = '<div class="sg-decide-grid">' + copyBtn('approve', 'Apply to all ' + n, applyAll(r)) + '</div>';
      }
      // The draft: every component or place the suggestion changes, as labelled values (kvOne): the components on the
      // left, what they take on the right, one change a line. Components that take the same changes share one entry, so
      // what they share is said once. Never a table and never a box drawn as one (a border, a head, lines between rows):
      // the draft sits in a row of the rules' own table, in a card of its panel (the owner's choice, 11 November 2026). Only a
      // Figma task links to Figma, so the person can check there whether it holds and what it is about; any other opens
      // the component's page.
      var saysOf = function (c) { return byC[c].map(function (t) { return (t.fix && t.fix.say) || t.value; }); };
      var groups = [], at = {};
      cs.forEach(function (c) { var says = saysOf(c), k = says.join('\u0000'); if (!(k in at)) { at[k] = groups.length; groups.push({ says: says, cs: [] }); } groups[at[k]].cs.push(c); });
      var pill = function (c) { var u = r.side === 'figma' && FIGMA_URLS[c]; return u ? '<a class="sg-uses-link sg-cx-figma" href="' + esc(u) + '" target="_blank" rel="noopener" title="' + esc('Open ' + c + ' in Figma') + '">' + FIGMA_SVG + esc(c) + '</a>' : byComponent(r) ? compHTML(c) : '<code>' + esc(c) + '</code>'; };
      var list = n ? '<div class="sg-cx-changes"><p class="sg-il-label">' + esc((byComponent(r) ? 'Components it changes (' : 'Places it changes (') + n + ')') + '</p>'
        + kvOne(groups.map(function (g) { return [{ html: '<ul class="sg-cx-pills">' + g.cs.map(function (c) { return '<li>' + pill(c) + '</li>'; }).join('') + '</ul>' }, g.says.map(function (x) { return '<span class="sg-cx-say">' + esc(x) + '</span>'; }).join('')]; }), 'sg-cx-kv') + '</div>' : '';
      // A family's rule: every way its components are built, how many each, so the choice is seen whole.
      var fam = /^family-/.test(r.id) ? (G.families || []).filter(function (x) { return 'family-' + x.family === r.id; })[0] : null;
      // Labelled values, as the draft is: the panel opens from a row of the rules' table.
      var ways = fam ? '<div class="sg-cx-changes"><p class="sg-il-label">' + esc('How the ' + fam.components + ' in the family are built') + '</p>' + kvOne(fam.shapes.map(function (x) { return [x[0], esc(x[1] + (x[1] === 1 ? ' component' : ' components'))]; }), 'sg-cx-kv') + '</div>' : '';
      // What is suggested, what it changes and the decision are one card: the draft is read, then approved under it.
      var body = card('Status', '<p>' + dot(ST[r.status][0], ST[r.status][1]) + '</p>') + card('Owned by', '<p>' + esc((OWNER[r.who] || OWNER.figma) + ', ' + (r.side === 'code' ? 'in the code' : 'in Figma')) + '</p>')
        + card(r.status === 'rule' ? 'Nothing to change' : 'Suggested change', suggest + ways + list + decide);
      m.querySelector('.sg-row-detail').onclick = function (e) { var cp = e.target.closest('[data-cx-copy]'); if (cp) copyText(cp.getAttribute('data-cx-copy'), cp, cp.parentNode.querySelector('.sg-decide-said'), 'Paste it in Claude Code'); };
      m.querySelector('.sg-row-detail').innerHTML = sidePanelPage({ crumbs: ['Rules', SIDE[r.side] || SIDE.figma, ST[r.status][1]], title: r.says, body: body });
      panelShow(m, from);
    };
    // The checks that wait on a fresh read of Figma: a check that finds nothing because the capture predates it must
    // never read as a library with nothing wrong (capture-waits.mjs).
    // The library's health: one number from the rules the team keeps, each kind's beside it, and the change since the
    // last day it was built (library-score.mjs). A list, as everything around the rules' table is.
    if (G.score) {
      var SC = G.score, delta = SC.previous ? SC.score - SC.previous.score : null;
      sec.insertAdjacentHTML('beforeend', '<div class="pg-par-card sg-cx-score"><p class="sg-cx-score-head"><strong>' + esc('Library health ' + SC.score) + '</strong>'
        + (delta == null ? '' : ' <span class="sg-cx-score-trend">' + esc((delta > 0 ? '+' : delta < 0 ? '−' : '±') + Math.abs(delta) + ' since ' + String(SC.previous.at).slice(0, 10)) + '</span>') + '</p>'
        + '<ul class="sg-cx-score-areas">' + SC.areas.map(function (a) { return '<li><span>' + esc(AREA[a.area] || capital(a.area)) + '</span><strong>' + esc(String(a.score)) + '</strong></li>'; }).join('') + '</ul>'
        + '<p class="sg-cx-score-note">' + esc('From the rules the team keeps: the share of components each already fits, averaged by kind. A rule still to decide counts for nothing.') + '</p></div>');
    }
    var WAIT = G.waiting || [];
    if (WAIT.length) { var nW = WAIT.reduce(function (k, w) { return k + w.rules.length; }, 0);
      sec.insertAdjacentHTML('beforeend', '<div class="pg-par-card sg-cx-wait" role="note"><p><strong>' + esc(nW + ' Figma check' + (nW === 1 ? '' : 's') + ' wait on a fresh read of Figma') + '</strong></p><p>' + esc('The last capture predates what they read: ' + WAIT.map(function (w) { return w.what; }).join('; ') + '. Until Figma is read again they find nothing, which says nothing about the library.') + '</p>'
        // The copy as a decision's, without its mark: decideMark is set further down the script, after this page is drawn.
        + '<div class="sg-decide sg-decide--approve"><strong class="sg-decide-head">Refresh Figma</strong>' + sysButton('button', 'Copy', ' data-cx-copy="' + esc('/rms-design-system-engine refresh the Figma data') + '"') + '<span class="sg-decide-said" role="status"></span></div></div>'); }
    sec.insertAdjacentHTML('beforeend', '<div class="pg-par-card"><div class="pg-par-scroll"><table class="pg-par-table sg-issues sg-cx-table"><colgroup><col class="sg-cx-rule"><col class="sg-cx-col"><col class="sg-cx-col"><col class="sg-cx-col"><col class="sg-cx-col"><col class="sg-cx-col"><col></colgroup><thead><tr>' + SORT.map(function (c) { return '<th data-sort="' + esc(c[0]) + '" aria-sort="none"><button type="button" class="sg-mx-sort">' + esc(c[0]) + MX_TRI + '</button></th>'; }).join('') + '<th class="sg-row-go"><span class="sg-hidden-text">Open</span></th></tr></thead><tbody>' + rows.map(rowHTML).join('') + '</tbody></table></div></div>');
    tableNone(sec.querySelector('.sg-cx-table'), 'rules', { head: 'No rule has been mined yet', say: 'A rule is read from what most components already do. The next run that reads the library fills this table.' });
    var open = function (tr) { if (tr) panel(+tr.getAttribute('data-cx-row'), tr); };
    // Sorted in place: the rows are moved, never built again, so a row the filter hid stays hidden and the panel still finds it.
    var sortKey = null, sortDir = 1;
    var sortBy = function (key) {
      var val = sortOf[key]; if (!val) return;
      sortDir = sortKey === key ? -sortDir : 1; sortKey = key;
      var tb = sec.querySelector('.sg-cx-table tbody');
      Array.prototype.slice.call(tb.children).sort(function (a, b) {
        var x = rows[+a.getAttribute('data-cx-row')], y = rows[+b.getAttribute('data-cx-row')], u = val(x), v = val(y);
        return (u < v ? -1 : u > v ? 1 : 0) * sortDir || ORDER[x.status] - ORDER[y.status];
      }).forEach(function (tr) { tb.appendChild(tr); });
      Array.prototype.forEach.call(sec.querySelectorAll('.sg-cx-table th[data-sort]'), function (th) { th.setAttribute('aria-sort', th.getAttribute('data-sort') === key ? (sortDir > 0 ? 'ascending' : 'descending') : 'none'); });
    };
    sec.addEventListener('click', function (e) {
      // The request to read Figma again, copied as a rule's decision is.
      var cp = e.target.closest('.sg-cx-wait [data-cx-copy]'); if (cp) { copyText(cp.getAttribute('data-cx-copy'), cp, cp.parentNode.querySelector('.sg-decide-said')); return; }
      var th = e.target.closest('th[data-sort]'); if (th) { sortBy(th.getAttribute('data-sort')); return; }
      if (e.target.closest('a, button')) return; open(e.target.closest('tr[data-cx-row]'));
    });
    sec.addEventListener('keydown', function (e) { var tr = e.target.closest && e.target.closest('tr[data-cx-row]'); if (tr && e.target === tr && e.key === 'Enter') { e.preventDefault(); open(tr); } });
    sec._openKey = function (key) { var i = rows.findIndex(function (r) { return cxKey(r) === key; }); if (i >= 0) panel(i, null); return i >= 0; };
    // All, then a chip a status with its own dot, read at a glance, then the area and the side as lists. They combine,
    // and each says how many rows it would leave beside the others.
    var cxStatusChips = ['fix', 'decide', 'rule'].map(function (k) { return { key: k, label: ST[k][1], dot: ST[k][0], col: 'status', word: ST[k][1] }; });
    filterBar(sec, { total: rows.length, said: 'rules', chips: cxStatusChips, cols: [{ key: 'status' }, { key: 'area', label: 'Area', order: AREA_ORDER }, { key: 'source', label: 'Source' }] });
  })();
  // Changes in Figma: each change made to a component in Figma through the engine (DATA.figmaChanges, component-change.mjs).
  // One table, a row a change: the component, what was asked, its steps and its status (waiting to be made, made as said,
  // not as said). A row opens its before and after in the side panel: what the change said it would do (the read before
  // beside the same once changed), what Figma shows once read again, and where it is not what was said; where the
  // component is used, what it breaks, what it adds and who signed it off, and the faults it already had.
  var FCH = DATA.figmaChanges || [];
  var fcKey = function (x) { return 'doc:fc:' + x.component + ':' + x.at; };
  if (FCH.length) (function () {
    hr(); navLink('changes-in-Figma', 'changes in Figma');
    var sec = section('changes-in-Figma', 'Changes', 'Changes in Figma', '');
    var ST = { waiting: ['figma', 'Waiting to be made'], made: ['match', 'Made as said'], 'not as said': ['differs', 'Not as said'], 'taken back': ['figma', 'Taken back'] };
    var dot = function (k, label) { return '<span class="pg-par-status pg-par--' + k + '"><span class="pg-par-sign" aria-hidden="true"></span>' + esc(label) + '</span>'; };
    var known = {}; COMPONENTS.forEach(function (c) { known[c.name] = 1; });
    var compHTML = function (n) { return known[n] ? '<a class="sg-uses-link" href="#' + esc(cid(n)) + '/history">' + esc(n) + '</a>' : esc(n); };
    var SIGN = { added: '+', removed: '−', renamed: '↻', moved: '→', changed: '~' };
    var SECT = { skeleton: 'Its layers', architecture: 'Axes, options and properties', variables: 'Variables' };
    var diffTable = function (d) {
      var items = [];
      ['skeleton', 'architecture', 'variables'].forEach(function (k) { (d && d[k] || []).forEach(function (x) { items.push([['Part', esc(SECT[k])], ['What', '<span aria-hidden="true">' + esc(SIGN[x.change] || '·') + '</span> ' + esc(capital(x.change)) + ' ' + esc(x.what)],
        ['Before → after', (x.from != null ? '<code>' + esc(x.from) + '</code>' : '') + (x.from != null && x.to != null ? ' → ' : '') + (x.to != null ? '<code>' + esc(x.to) + '</code>' : '')]]); }); });
      // A list: the panel opens from a row of the Changes in Figma table.
      return items.length ? kvList(items) : '<p class="sg-il-line">Nothing changes.</p>';
    };
    var rowHTML = function (x, i) {
      return '<tr class="sg-row-open" tabindex="0" data-fc-row="' + i + '" data-chip="' + esc(x.status) + '"><td>' + compHTML(x.component) + '</td><td><strong>' + esc(x.asked || x.steps[0] || '') + '</strong><span class="pg-par-val">' + esc(x.steps.length + ' step' + (x.steps.length === 1 ? '' : 's')) + '</span></td><td>' + esc(String(x.at || '').slice(0, 10)) + '</td><td>' + dot(ST[x.status][0], ST[x.status][1]) + '</td><td class="sg-row-go">' + USERS_ARROW + '</td></tr>';
    };
    var panel = function (i, from) {
      var x = FCH[i]; if (!x) return;
      var m = panelShell('sg-fc-panel', 'Changes in Figma'); m._key = fcKey(x);
      var card = function (head, html) { return html ? '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">' + esc(head) + '</div><div class="sg-row-detail-body">' + html + '</div></div>' : ''; };
      var lines = function (l) { return (l || []).map(function (t) { return '<p class="sg-il-line">' + esc(t) + '</p>'; }).join(''); };
      var u = x.usedBy, lib = u && u.library;
      var used = u ? lines([u.products.length ? 'The code of ' + u.products.join(', ') : '', u.inside.length ? 'Inside ' + u.inside.join(', ') : '', u.screens ? u.screens + ' Figma screen' + (u.screens === 1 ? '' : 's') : '',
        lib && lib.instances != null ? lib.instances + ' instance' + (lib.instances === 1 ? '' : 's') + ' in ' + lib.files + ' team file' + (lib.files === 1 ? '' : 's') + ' (Figma\'s library analytics)' : 'Team files the engine does not read are not counted' + (lib && lib.unseen ? ': ' + lib.unseen : '') + '.'].filter(Boolean)) : '';
      var after = x.status === 'waiting' ? '<p class="sg-il-line">Not made yet: once the script runs and Figma is read again, rms-design-system-engine --change-report ' + esc(x.component) + ' fills this in.</p>'
        : diffTable(x.real) + (x.mismatch.length ? '<p class="sg-il-line"><strong>' + esc('Not what the change said (' + x.mismatch.length + ')') + '</strong></p>' + lines(x.mismatch.map(function (y) { return capital(y.change) + ' ' + y.what + (y.from != null || y.to != null ? ': ' + [y.from, y.to].filter(function (z) { return z != null; }).join(' → ') : ''); })) : '<p class="sg-il-line">It is what the change said.</p>');
      var body = card('Status', '<p>' + dot(ST[x.status][0], ST[x.status][1]) + '</p>' + (x.readAt ? '<p class="sg-il-line"><span class="pg-dim">' + esc('Figma read again ' + String(x.readAt).slice(0, 10)) + '</span></p>' : ''))
        + card('Its steps', lines(x.steps))
        + card('What the change said it does', diffTable(x.report))
        + card('What Figma shows once it was made', after)
        + card('Where it is used', used)
        + card('What it breaks', lines(x.breaking.map(function (b) { return b.what; })))
        + card('What it adds to the system', lines(x.held.map(function (h) { return h.what; })))
        + card('Local or shared', x.scope ? lines([x.scope.reason]) : '')
        + card('Signed off', x.signedOff ? lines([(x.signedOff.reviewerSaid || x.signedOff.by) + ', ' + String(x.signedOff.at || '').slice(0, 10)].concat(x.authorSaid ? ['Made by ' + x.authorSaid + ', reviewed by ' + (x.signedOff.reviewerSaid || x.signedOff.by) + '.'] : []).concat(x.signedOff.notOwner && x.decider ? [x.decider.name + ' decides it: the sign-off stands, and they should hear of it.'] : [])) : x.decider ? lines(['Waits on ' + x.decider.name + '.']) + (x.authorSaid ? lines(['Made by ' + x.authorSaid + ': someone else reviews it.']) : '') : '')
        + card('Faults it already had, not fixed by this change', lines(x.faults.map(function (f) { return f.says + (f.value ? ': ' + f.value : ''); })));
      m.querySelector('.sg-row-detail').innerHTML = sidePanelPage({ crumbs: ['Changes in Figma', x.component], title: x.asked || x.steps[0] || x.component, body: body });
      panelShow(m, from);
    };
    sec.insertAdjacentHTML('beforeend', '<div class="pg-par-card"><div class="pg-par-scroll"><table class="pg-par-table sg-issues sg-fc-table"><thead><tr><th>Component</th><th>The change</th><th>Asked</th><th>Status</th><th class="sg-row-go"><span class="sg-hidden-text">Open</span></th></tr></thead><tbody>' + FCH.map(rowHTML).join('') + '</tbody></table></div></div>');
    var open = function (tr) { if (tr) panel(+tr.getAttribute('data-fc-row'), tr); };
    sec.addEventListener('click', function (e) { if (e.target.closest('a, button')) return; open(e.target.closest('tr[data-fc-row]')); });
    sec.addEventListener('keydown', function (e) { var tr = e.target.closest && e.target.closest('tr[data-fc-row]'); if (tr && e.target === tr && e.key === 'Enter') { e.preventDefault(); open(tr); } });
    sec._openKey = function (key) { var i = FCH.findIndex(function (x) { return fcKey(x) === key; }); if (i >= 0) panel(i, null); return i >= 0; };
    var nOf = function (st) { return FCH.filter(function (x) { return x.status === st; }).length; };
    pageBar(sec, { said: 'decisions', chips: [{ key: 'not as said', label: 'Not as said', n: nOf('not as said'), dot: 'differs' }, { key: 'waiting', label: 'Waiting', n: nOf('waiting'), dot: 'figma' }, { key: 'made', label: 'Made as said', n: nOf('made'), dot: 'match' }, { key: 'taken back', label: 'Taken back', n: nOf('taken back'), dot: 'figma' }].filter(function (c) { return c.n; }) });
  })();
  // History: every change in one table, newest first, a row each, with its date and time, who did it and what it
  // affects: the code's commits (the issues each names, the release it shipped in), what each read of Figma changed in a
  // component, the intent layer's commits, and what the team decided (a component, a pattern, a template, a foundation,
  // the system), what it ruled out and why. Chips show one type of change (each row tagged with which).
  var CHANGES = [];
  COMPONENTS.forEach(function (c) { (c.changelog || []).forEach(function (r) { CHANGES.push({ comp: c.name, r: r }); }); });
  // Everything the developers did, release by release (DATA.releaseLog: every commit, whatever it changed); without it,
  // the commits that changed a component, from the components' changelogs.
  var RLOG = DATA.releaseLog || [];
  var DECISIONS = (DATA.decisions || []).slice();
  if (CHANGES.length || RLOG.length || DECISIONS.length || (DATA.intentChanges || []).length) {
    hr(); navLink('history', 'history');
    var wn = section('history', 'Changes', 'History', '');
    // The components each commit changed, from their changelogs.
    var compsOf = {};
    CHANGES.forEach(function (x) { var k = x.r.sha || x.r.subject, l = compsOf[k] = compsOf[k] || []; if (l.indexOf(x.comp) < 0) l.push(x.comp); });
    var newestFirst = function (a, b) { return String(b.r.date) > String(a.r.date) ? 1 : String(b.r.date) < String(a.r.date) ? -1 : 0; };
    var order = [];
    if (RLOG.length) order = RLOG.map(function (g) {
      var commits = (g.commits || []).map(function (r) { return { r: r, comps: compsOf[r.sha] || [] }; }).sort(newestFirst);
      return { k: g.release || '', on: g.releasedAt || '', at: commits.length ? String(commits[0].r.date) : '', commits: commits };
    }).filter(function (g) { return g.commits.length; });
    else {
      var rel = {}, seen = {};
      CHANGES.forEach(function (x) { var k = x.r.release || '', id = x.r.sha || x.r.subject; if (!rel[k]) { rel[k] = { k: k, commits: [], at: '' }; order.push(rel[k]); } if (!seen[id]) { seen[id] = 1; rel[k].commits.push({ r: x.r, comps: compsOf[id] }); } if (String(x.r.date) > rel[k].at) rel[k].at = String(x.r.date); if (x.r.releasedAt) rel[k].on = String(x.r.releasedAt); });
      order.forEach(function (g) { g.commits.sort(newestFirst); });
    }
    order.sort(releaseOrder);
    // The decisions of each day, a card of their own: a decision has no code version, so it is dated, never released.
    var byDay = {};
    DECISIONS.forEach(function (d) {
      var at = String(d.at || '').slice(0, 10), home = byDay[at];
      if (!home) { home = byDay[at] = { k: '', on: '', at: at, commits: [], day: at, decisions: [] }; order.push(home); }
      home.decisions.push(d);
    });
    // Each read of Figma that changed what it says of a component: one row a read (the commit that saved it), the
    // components it changed and what changed in each, in the release that holds it. Its commit is not a code row too.
    var FIGMA = {}, figmaReads = [];
    COMPONENTS.forEach(function (c) { (c.figmaLog || []).forEach(function (r) {
      var k = r.sha || r.subject, x = FIGMA[k];
      if (!x) { x = FIGMA[k] = { r: r, comps: [] }; figmaReads.push(x); }
      x.comps.push({ name: c.name, changed: r.changed || [] });
    }); });
    order.forEach(function (g) { g.commits = g.commits.filter(function (x) { return !FIGMA[x.r.sha || x.r.subject]; }); });
    // A read of Figma is a release of the design: a card of its own, beside the code's releases, newest first by date.
    figmaReads.sort(newestFirst).forEach(function (x, i) { order.push({ k: '', on: '', at: String(x.r.date), commits: [], read: x, firstRead: i === figmaReads.length - 1 }); });
    // Each change read from the intent layer (DATA.intentChanges): a card of its own too, dated by its commit, with the
    // pages it changed and the components they document.
    (DATA.intentChanges || []).forEach(function (x) { order.push({ k: '', on: '', at: String(x.at || ''), commits: [], layer: x }); });
    order = order.filter(function (g) { return g.commits.length || g.read || g.layer || (g.decisions || []).length; });
    // One table, a row each, newest first: a commit to the code, what a read of Figma changed in a component, a commit to
    // the intent layer, a decision. Its date and time, its type, what it did, what it affects, who did it (last, so the
    // rows of one moment run unbroken across What and Affects). The chips show
    // one type; a ticket's count of commits shows that ticket's alone.
    // The components a change affects: links the table turns into pills (pillLinks), the first five shown, the rest one
    // click away ("9 more").
    var PILLS_SHOWN = 5;
    var pillsHTML = function (names, area) {
      return names.map(function (n, i) { return '<a href="#' + esc(cid(n)) + (area ? '/' + area : '') + '"' + (i >= PILLS_SHOWN ? ' hidden' : '') + '>' + esc(n) + '</a>'; }).join(' ') +
        // The rest one click away, a pill as the ones beside it (their height, their words' size).
        (names.length > PILLS_SHOWN ? ' <button type="button" class="sg-link-pill sg-link-pill--table" data-pills-more>' + (names.length - PILLS_SHOWN) + ' more</button>' : '');
    };
    // What changed in Figma, said plainly: a property's name without the word, a text's old and new words quoted.
    var figmaChange = function (t) {
      t = String(t).replace(/^property /, '');
      var m = /^(.+?) (TEXT|BOOLEAN|VARIANT|INSTANCE_SWAP|SLOT)(?: · (.*))? → (?:TEXT|BOOLEAN|VARIANT|INSTANCE_SWAP|SLOT)(?: · (.*))?$/.exec(t);
      return m ? m[1] + ' "' + (m[3] || '') + '" → "' + (m[4] || '') + '"' : t;
    };
    var isFirst = function (c) { return c.changed.length === 1 && /first time/.test(c.changed[0]); };
    var line = function (html) { return '<p class="sg-il-line">' + html + '</p>'; };
    var quiet = function (text) { return '<span class="pg-log-date">' + text + '</span>'; };
    var shaLink = function (url, short) { return url ? '<a class="sg-uses-link" href="' + esc(url) + '" target="_blank" rel="noopener"><code>' + esc(short) + '</code></a>' : '<code>' + esc(short) + '</code>'; };
    // Who did it (who-did-it.mjs): its own column, the names alone (the column says Done by), one a line. One person
    // under two names on the page (an account's qa.lead, the QA Lead it signs with) is said by the name they sign
    // with. A row nobody is known for leaves it empty.
    var nameKey = function (n) { return String(n).toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ').trim(); };
    var namesOf = function (b) { return String(b || '').replace(/^Done by /, '').split(', ').map(function (n) { return n.trim(); }).filter(Boolean); };
    var signed = {};
    var learn = function (b) { namesOf(b).forEach(function (n) { n.split(' · pushed by ').forEach(function (p) { var k = nameKey(p); if (!signed[k] || (!/\s/.test(signed[k]) && /\s/.test(p))) signed[k] = p; }); }); };
    var whoCell = function (bys) {
      var list = [];
      bys.forEach(function (b) { namesOf(b).forEach(function (n) { n = n.split(' · pushed by ').map(function (p) { return signed[nameKey(p)] || p; }).join(' · pushed by '); if (list.indexOf(n) < 0) list.push(n); }); });
      return '<td class="sg-log-who">' + list.map(function (n) { return line(esc(n)); }).join('') + '</td>';
    };
    // Its day, and its time where it has one, as the reader's clock says it.
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    // The release the change shipped in, under the day it was made: the column that already answers when, and the
    // page's own version tag, so a release reads the same here as it does beside the system's name. A change no
    // release holds yet, and everything that ships in none (a read of Figma, a decision), simply has no tag.
    var releaseTag = function (rel) {
      if (!rel || !rel.k) return '';
      var on = rel.on ? 'Released on ' + String(rel.on).slice(0, 10) : 'Released';
      var tag = '<span class="sg-status">' + esc(rel.k) + '</span>';
      return line(rel.url ? '<a class="sg-log-release" href="' + esc(rel.url) + '" target="_blank" rel="noopener" title="' + esc(on) + '">' + tag + '</a>'
        : '<span class="sg-log-release" title="' + esc(on) + '">' + tag + '</span>');
    };
    var dateCell = function (at, rel) {
      var s = String(at || ''), t = Date.parse(s), tag = releaseTag(rel);
      if (!/T\d/.test(s) || isNaN(t)) return '<td class="sg-log-when">' + line(esc(s.slice(0, 10))) + tag + '</td>';
      var d = new Date(t);
      // The day and its time on one line, the release under them when there is one (the owner's, 11 November 2026).
      return '<td class="sg-log-when">' + line(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())) + tag + '</td>';
    };
    var ROWS = [];
    // group: rows of one moment (a read of Figma, the decisions a person gave one day) share their Date, Type and Done by.
    var add = function (at, chip, type, what, bys, affects, tickets, group, release) { (bys || []).forEach(learn); ROWS.push({ at: String(at || ''), chip: chip, type: type, what: what, bys: bys || [], affects: affects, tickets: tickets || [], group: group || null, release: release || null }); };
    // The code: each commit, the issues it names (each linked, with how many commits it has when more than one), what it
    // says, and the release it shipped in, once it has shipped.
    var ticketsOf = function (r) { return r.tickets || (r.ticket ? [{ ticket: r.ticket, ticketUrl: r.ticketUrl }] : []); };
    var commitsOf = {};
    order.forEach(function (g) { g.commits.forEach(function (x) { ticketsOf(x.r).forEach(function (t) { commitsOf[t.ticket] = (commitsOf[t.ticket] || 0) + 1; }); }); });
    var ticketLine = function (r) {
      var ts = ticketsOf(r);
      if (!ts.length) return line(quiet(r.request ? requestLink(r.request) : 'No issue'));
      return line(ts.map(function (t) {
        var name = t.ticketUrl ? '<a class="sg-uses-link" href="' + esc(t.ticketUrl) + '" target="_blank" rel="noopener">' + esc(t.ticket) + '</a>' : esc(t.ticket);
        var n = commitsOf[t.ticket] || 0;
        return name + (n > 1 ? ' ' + quiet('· <button type="button" class="sg-log-only" data-ticket="' + esc(t.ticket) + '">' + n + ' commits</button>') : '');
      }).join('  '));
    };
    var releaseOf = function (g, r) {
      // A commit no release holds yet: nothing to show (only a release is worth a tag).
      if (!g.k) return null;
      var url = r.url ? r.url.replace(/\/-\/commit\/[0-9a-f]+$/, '/-/tags/' + encodeURIComponent(g.k)).replace(/\/commit\/[0-9a-f]+$/, '/releases/tag/' + encodeURIComponent(g.k)) : null;
      return { k: g.k, on: g.on || '', url: url && url !== r.url ? url : null };
    };
    var noWho = function (r) { var o = {}; for (var k in r) o[k] = r[k]; o.by = null; return o; };
    order.forEach(function (g) { g.commits.forEach(function (x) {
      var r = x.r, comps = (x.comps || []).slice().sort();
      var affects = (comps.length ? pillsHTML(comps) : '') + ((r.where || []).length ? (comps.length ? ' ' : '') + whereHTML(r.where) : '');
      add(r.date, 'code', 'Code', ticketLine(r) + line(commitLine(noWho(r))), [r.by], affects || quiet('No component'), ticketsOf(r).map(function (t) { return t.ticket; }), null, releaseOf(g, r));
    }); });
    // Figma: what each read changed in each component, a row each; the components read for the first time, one row.
    // Who did it: the designers who saved the versions since the read before (figma-versions.mjs), then whoever ran the read.
    var figmaBys = function (r) { return (r.editors || []).concat(r.by && (r.editors || []).indexOf(r.by) < 0 ? [r.by] : []); };
    order.forEach(function (g) {
      if (!g.read) return;
      var x = g.read, saved = line(quiet('Saved in ') + shaLink(x.r.url, x.r.short || ''));
      x.comps.filter(function (c) { return !isFirst(c); }).sort(function (a, b) { return a.name < b.name ? -1 : 1; }).forEach(function (c) { add(x.r.date, 'figma', 'Figma', line(esc(c.changed.map(figmaChange).join('; '))) + saved, figmaBys(x.r), pillsHTML([c.name], 'history'), null, 'figma:' + (x.r.sha || x.r.date)); });
      var first = x.comps.filter(isFirst).map(function (c) { return c.name; }).sort();
      if (first.length) add(x.r.date, 'figma', 'Figma', line('Read for the first time') + saved, figmaBys(x.r), pillsHTML(first, 'history'), null, 'figma:' + (x.r.sha || x.r.date));
    });
    // The comments left on a component in Figma (figma-comments.mjs): a thread a row, what it says, its replies, and
    // whether it is resolved; who wrote it and who answered. No link to the file: only a Figma task carries one.
    COMPONENTS.forEach(function (c) { (c.figmaComments || []).forEach(function (t) {
      var said = esc('“' + t.text + '”') + ((t.replies || []).length ? ' ' + quiet(t.replies.length + ' repl' + (t.replies.length === 1 ? 'y' : 'ies')) : '') + ' ' + quiet(t.resolved ? 'Resolved' : 'Open');
      var bys = [t.by].concat((t.replies || []).map(function (r) { return r.by; })).filter(function (b, i, a) { return b && a.indexOf(b) === i; });
      add(t.at, 'figma', 'Figma comment', line(said), bys, pillsHTML([c.name], 'history'), null, 'comment:' + c.name + ':' + t.at);
    }); });
    // The intent layer: each commit, what it says, the pages it changed (those of no component named), and the commit.
    // A change the engine sent in parts (GitLab refuses one commit that large: "… (part 2 of 3)") is one change: one row,
    // its pages and files together, each of its commits named.
    var layers = [], partOf = function (x) { var m = /^(.*) \(part (\d+) of (\d+)\)$/.exec(String(x.says || '')); return m ? { base: m[1], k: +m[2], n: +m[3] } : null; };
    order.forEach(function (g) {
      if (!g.layer) return;
      var x = g.layer, p = partOf(x), last = layers[layers.length - 1];
      var one = { at: x.at, says: p ? p.base : x.says, by: x.by, pages: x.pages.slice(), components: x.components.slice(), alone: x.alone ? x.alone.slice() : null, added: Array.isArray(x.added) ? x.added.slice() : null, files: x.files || 0, commits: x.to ? [{ to: x.to, url: x.url, k: p ? p.k : 0 }] : [], key: p ? p.base + '|' + (x.by || '') + '|' + p.n : null };
      if (one.key && last && last.key === one.key) {
        one.pages.forEach(function (n) { if (last.pages.indexOf(n) < 0) last.pages.push(n); });
        one.components.forEach(function (n) { if (last.components.indexOf(n) < 0) last.components.push(n); });
        if (one.alone && last.alone) one.alone.forEach(function (n) { if (last.alone.indexOf(n) < 0) last.alone.push(n); });
        if (one.added && last.added) one.added.forEach(function (n) { if (last.added.indexOf(n) < 0) last.added.push(n); }); else last.added = null;   // one part not known: not known for the whole
        last.files += one.files; last.commits = last.commits.concat(one.commits); if (String(one.at) > String(last.at)) last.at = one.at;
        return;
      }
      layers.push(one);
    });
    // The pages a change touched, in counts by kind on one line: its components' pages counted (they are under Affects),
    // the other pages named while they are few, the token pages counted (each one's name is its token); every other name
    // one click away (Show all), never a list of a thousand names in a row of the table (the owner's, 11 November 2026).
    // comps: the names among them that document a component.
    var NOT_YET_NAMED = 5;
    var pagesSaid = function (all, comps) {
      comps = comps || [];
      var ofComp = all.filter(function (n) { return comps.indexOf(n) >= 0; }), names = all.filter(function (n) { return comps.indexOf(n) < 0; });
      var tokens = names.filter(function (n) { return /^--/.test(n); }), pages = names.filter(function (n) { return !/^--/.test(n); });
      var said = [];
      if (ofComp.length) said.push(plural(ofComp.length, 'component page', 'component pages'));
      if (pages.length) said.push(plural(pages.length, 'page', 'pages') + (pages.length <= NOT_YET_NAMED ? ' (' + pages.join(', ') + ')' : ''));
      if (tokens.length) said.push(plural(tokens.length, 'token page', 'token pages'));
      var whole = pages.length > NOT_YET_NAMED || tokens.length;
      return '<span class="sg-log-also">' + esc(said.join(' and ')) + '</span>' + (whole ? ' <button type="button" class="sg-link-pill sg-link-pill--table" data-list-more>Show all</button><span class="pg-par-val sg-log-list" hidden>' + esc(names.join(', ')) + '</span>' : '');
    };
    layers.forEach(function (x) {
      x.components.sort(); x.commits.sort(function (a, b) { return a.k - b.k; });
      // The pages that document no component, named here: the others are under Affects, as their components. A page is
      // known by what documents it (the build's match), never by its name, which is rarely the component's (Table Body
      // Cell Tooltip documents table/Cell/tooltip). A guide built before the match was kept falls back on the name.
      var others = x.alone || x.pages.filter(function (p) { return !x.components.some(function (n) { return n.toLowerCase().replace(/[^a-z0-9]/g, '') === String(p).toLowerCase().replace(/[^a-z0-9]/g, ''); }); });
      var count = x.pages.length ? plural(x.pages.length, 'page', 'pages') + ' changed' : plural(x.files || 0, 'file', 'files') + ' changed, none of them a page';
      // The count under the commit's own words, unless they say it already ("… 16 pages changed …").
      var saysCount = x.says && String(x.says).indexOf(count.split(',')[0]) >= 0;
      // What it added apart from what it changed, each on its own line, when the reader knows which pages it made; a
      // change read before that says the count, and the pages of no component as Also changed.
      var comps = x.pages.filter(function (p) { return others.indexOf(p) < 0; });
      var split = x.added && x.pages.length ? (function () {
        var made = x.pages.filter(function (p) { return x.added.indexOf(p) >= 0; }), edited = x.pages.filter(function (p) { return x.added.indexOf(p) < 0; });
        return (made.length ? line(quiet('Added: ') + pagesSaid(made, comps)) : '') + (edited.length ? line(quiet('Changed: ') + pagesSaid(edited, comps)) : '');
      })() : null;
      add(x.at, 'intent', 'Intent layer', (x.says ? line(esc(x.says)) : '') + (split != null ? split : (x.says && saysCount ? '' : line(x.says ? quiet(esc(count)) : esc(count))) + (others.length ? line(quiet('Also changed: ') + pagesSaid(others)) : '')) +
        (x.commits.length ? line(quiet('Committed in ') + x.commits.map(function (c) { return shaLink(c.url, c.to.slice(0, 8)); }).join(', ')) : ''), [x.by], x.components.length ? pillsHTML(x.components, 'documentation') : quiet('No component'));
    });
    // The decisions: what was decided, ruled out and why, and what it is about.
    order.forEach(function (g) { (g.decisions || []).forEach(function (d) {
      // A page of the intent layer named like a component of the system opens that component's Documentation.
      var pageComp = !d.component && d.page && COMPONENTS.some(function (c) { return c.name === d.page; }) ? d.page : null;
      var about = d.component && COMPONENTS.some(function (c) { return c.name === d.component; }) ? '<a class="sg-uses-link" href="#' + esc(cid(d.component)) + '/history">' + esc(d.component) + '</a>'
        : pageComp ? '<a class="sg-uses-link" href="#' + esc(cid(pageComp)) + '/documentation">' + esc(pageComp) + '</a>'
        : d.url ? '<a class="sg-uses-link" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.page || d.about) + '</a>' : esc(d.page || d.component || 'The system');
      // A lesson (a correction a person made) and a rule from repeated findings say what each became, and a lesson that
      // came back says which guard did not hold.
      var type = d.kind === 'lesson' ? 'Lesson' : d.kind === 'rule' || d.kind === 'proposed' ? 'Rule' : d.kind === 'signed' ? 'Sign-off' : 'Decision';
      add(d.at, 'decisions', type, line('<strong>' + esc(d.what) + '</strong>') +
        (d.ruledOut && d.ruledOut.length ? line('Ruled out ' + esc(d.ruledOut.join(', ')) + '.') : '') + (d.why ? line(esc(capital(d.why).replace(/\.?$/, '.'))) : '') +
        (d.became ? line(esc(d.became.replace(/\.?$/, '.'))) : '') + (d.back ? line(esc(capital(d.back).replace(/\.?$/, '.'))) : '') +
        // Its component changed since it was decided: it still stands, to review again.
        (d.review ? line('<span class="pg-par-val">' + esc(d.review) + '</span>') : '') +
        // A sign-off: who made the change and who reviewed it, never the same one.
        (d.author ? line(esc('Made by ' + d.author + ', reviewed by ' + (d.reviewer || d.by) + '.')) : '') +
        line(quiet(esc(capital(d.said)))), [d.by], about, null, 'decisions:' + String(d.at || '').slice(0, 10) + ':' + (d.by || ''));
    }); });
    var stamp = function (s) { var t = Date.parse(s); return isNaN(t) ? 0 : t; };
    ROWS.sort(function (a, b) { return stamp(b.at) - stamp(a.at); });
    var box = document.createElement('div'); box.className = 'pg-cards'; wn.appendChild(box);
    // Sorted by Date, newest first, as the page opens. Only the columns rows of one moment share can sort: What and
    // Affects are one row's own, so ordering by them would tear a moment apart.
    // The columns in the words the other tables use (the owner's, 11 November 2026): Source, as the Documentation table
    // names where a thing comes from (Code, Figma, Intent layer, Decisions, the chips above), never Type, which names a
    // kind of task. What kind of decision or note a row is (a Lesson, a Comment) leads its What.
    var SOURCE_OF = { code: 'Code', figma: 'Figma', intent: 'Intent layer', decisions: 'Decisions' };
    var sourceOf = function (x) { return SOURCE_OF[x.chip] || x.type; };
    var kindOf = function (x) { var s = sourceOf(x); return x.type === s ? '' : x.type === 'Figma comment' ? 'Comment' : x.type; };
    var LOG_SORT = { 'Date': function (x) { return stamp(x.at); }, 'Source': function (x) { return sourceOf(x); }, 'Done by': function (x) { return (x.bys || []).join(' '); } };
    var logHead = ['Date', 'Source', 'What', 'Affects', 'Done by'].map(function (name) {
      return LOG_SORT[name] ? '<th scope="col" data-sort="' + esc(name) + '" aria-sort="' + (name === 'Date' ? 'descending' : 'none') + '"><button type="button" class="sg-mx-sort">' + esc(name) + MX_TRI + '</button></th>'
        : '<th scope="col">' + esc(name) + '</th>';
    }).join('');
    box.innerHTML = '<p class="pg-par-sum sg-log-only-bar" hidden></p><div class="pg-par-card"><div class="pg-par-scroll"><table class="pg-par-table sg-log"><thead><tr>' + logHead + '</tr></thead><tbody>' +
      ROWS.map(function (x, i) {
        // Rows of one moment, side by side: their Date, Type and Done by once, across them all (staying in view as they scroll).
        var n = 1; if (x.group && (i === 0 || ROWS[i - 1].group !== x.group)) while (ROWS[i + n] && ROWS[i + n].group === x.group) n++;
        var lead = !x.group || i === 0 || ROWS[i - 1].group !== x.group, span = n > 1 ? ' rowspan="' + n + '"' : '';
        var shared = function (cell) { return cell.replace(/^<td class="([^"]+)">([\s\S]*)<\/td>$/, '<td class="$1"' + span + '><div class="sg-log-stick">$2</div></td>'); };
        return '<tr data-chip="' + x.chip + '"' + (lead ? ' data-log-row="' + i + '"' : '') + (x.tickets.length ? ' data-tickets="' + esc(' ' + x.tickets.join(' ') + ' ') + '"' : '') + (x.group ? ' data-group="' + esc(x.group) + '"' : '') + (lead ? '' : ' class="sg-log-more"') + '>' +
          (lead ? shared(dateCell(x.at, x.release)) + shared('<td class="sg-log-type">' + esc(sourceOf(x)) + '</td>') : '') + '<td class="sg-log-what">' + (kindOf(x) ? line(quiet(esc(kindOf(x)))) : '') + x.what + '</td><td>' + x.affects + '</td>' + (lead ? shared(whoCell(x.bys)) : '') + '</tr>';
      }).join('') + '</tbody></table></div></div>';
    // The table itself, held now: box is a var another page reuses, so by the time a head is measured or a column is
    // clicked it may name another page's. Everything below works from this table, never from box.
    var logHeadEl = box.querySelector('table.sg-log > thead'), logTable = logHeadEl.parentNode;
    // Sorted in place, a moment at a time: a lead row and the rows under it move together, so the cells they share
    // keep the rows they span. The rows are moved, never built again, so a row a chip or a ticket hid stays hidden.
    var logKey = 'Date', logDir = -1;
    var logSort = function (key) {
      var val = LOG_SORT[key]; if (!val) return;
      logDir = logKey === key ? -logDir : 1; logKey = key;
      var tb = logTable.tBodies[0], blocks = [], cur = null;
      Array.prototype.forEach.call(tb.children, function (tr) {
        if (cur && tr.classList.contains('sg-log-more')) { cur.trs.push(tr); return; }
        cur = { x: ROWS[+tr.getAttribute('data-log-row')], trs: [tr] }; blocks.push(cur);
      });
      blocks.sort(function (a, b) { var u = val(a.x), v = val(b.x); return (u < v ? -1 : u > v ? 1 : 0) * logDir || stamp(b.x.at) - stamp(a.x.at); });
      blocks.forEach(function (b) { b.trs.forEach(function (tr) { tb.appendChild(tr); }); });
      Array.prototype.forEach.call(logTable.querySelectorAll('th[data-sort]'), function (th) { th.setAttribute('aria-sort', th.getAttribute('data-sort') === key ? (logDir > 0 ? 'ascending' : 'descending') : 'none'); });
    };
    // The shared cells stick under the table's head: how tall the head is, again whenever it changes (shown, resized).
    var headH = function () { if (logHeadEl.offsetHeight) logTable.style.setProperty('--sg-log-head-h', logHeadEl.offsetHeight + 'px'); };
    headH(); if (typeof ResizeObserver !== 'undefined') new ResizeObserver(headH).observe(logHeadEl);
    // The code, Figma, the intent layer or the decisions: a chip for each type the page has, when it has two.
    var kinds = [['code', 'Code'], ['figma', 'Figma'], ['intent', 'Intent layer'], ['decisions', 'Decisions']].map(function (x) { return { key: x[0], label: x[1], n: box.querySelectorAll('tr[data-chip="' + x[0] + '"]').length }; }).filter(function (c) { return c.n; });
    if (kinds.length > 1) pageBar(wn, { said: 'changes', chips: kinds });
    // A ticket's commits alone, said above the table with a way back to every row.
    var onlyBar = box.querySelector('.sg-log-only-bar');
    var showTicket = function (t) {
      Array.prototype.forEach.call(box.querySelectorAll('tbody tr'), function (tr) { tr.hidden = !!t && (tr.getAttribute('data-tickets') || '').indexOf(' ' + t + ' ') < 0; });
      tableNone(logTable, 'changes');
      onlyBar.hidden = !t;
      onlyBar.innerHTML = t ? esc('The commits of ' + t) + ' ' + sysButton('button', 'Show every change', ' data-ticket-all') : '';
      if (t) Array.prototype.forEach.call(wn.querySelectorAll('.sg-chip[data-chip]'), function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-chip') === 'all' ? 'true' : 'false'); });
    };
    box.addEventListener('click', function (e) {
      var th = e.target.closest('th[data-sort]'); if (th) { logSort(th.getAttribute('data-sort')); return; }
      var only = e.target.closest('[data-ticket]'); if (only) { showTicket(only.getAttribute('data-ticket')); return; }
      if (e.target.closest('[data-ticket-all]')) { showTicket(null); return; }
      var all = e.target.closest('[data-list-more]'); if (all) { var list = all.nextElementSibling; if (list) list.hidden = false; all.remove(); return; }
      var b = e.target.closest('[data-pills-more]'); if (!b) return; Array.prototype.forEach.call(b.parentNode.querySelectorAll('a[hidden]'), function (p) { p.hidden = false; }); b.remove();
    });
    wn.addEventListener('sg-chip', function () { onlyBar.hidden = true; onlyBar.innerHTML = ''; });
  }
  // Every part of the documentation no agent is given, whatever its source: why, what to do so it is, remove it or not.
  var leftHTML = function (list) { return list.map(function (n) { return '<div class="sg-il-not"><p class="sg-il-line"><strong>' + esc(capital(n.what || n.text)) + '</strong>' + (n.from ? '<span class="pg-par-val">' + esc(capital(n.from)) + '</span>' : '') + '</p><p class="sg-il-line">' + esc(n.why) + '</p>' + (n.fix ? '<p class="sg-il-line"><span class="sg-il-label">To use it</span> ' + esc(n.fix) + '</p>' : '') + (n.remove ? '<p class="sg-il-line"><span class="sg-il-label">Remove it?</span> ' + esc(n.remove) + '</p>' : '') + '</div>'; }).join(''); };
  // A page's head, the same on every page that has one: its title stays at the top (the template's sticky title), what
  // it links to at its top right, and its chips in the bar that sticks under the title with the template's spacing (as
  // the Status page's). chips: [{ key, label, n, dot }] (dot: the status kind its colour comes from: differs, figma,
  // match, none), All first; a click shows only the table rows with that key (data-chip on each row). One table per
  // page: the chips filter its rows, never split it.
  // A table's filters, as the Status page's table filters: one chip a column, each showing All until a value is chosen,
  // its list saying how many rows each value would leave beside the other chips' choices, and the chips combining. A
  // value the others leave no row in is not offered. All, and Clear filters, drop them. A row carries its value for a
  // column in data-f-<key>; a column a row can hold several of (a page read from Figma and the intent layer) is marked
  // multi, and its values are separated by a bar, so a value with a space in it is still one value. Rows are hidden, never drawn again, so the sort and the panel still find
  // them. A column every row answers the same way is no filter, so it is left out.
  function filterBar(sec, o) {
    var h = sec.querySelector(':scope > h2');
    if (h && (o.links || []).length) { h.classList.add('sg-h2-links'); h.insertAdjacentHTML('beforeend', headLinksHTML(o.links)); }
    var trs = Array.prototype.slice.call(sec.querySelectorAll('tbody > tr[data-f]'));
    var val = function (tr, k) { return tr.getAttribute('data-f-' + k) || ''; };
    var has = function (tr, c, w) { return c.multi ? val(tr, c.key).split('|').indexOf(w) >= 0 : val(tr, c.key) === w; };
    var cols = (o.cols || []).map(function (c) {
      var seen = {}, words = [];
      trs.forEach(function (tr) { (c.multi ? val(tr, c.key).split('|') : [val(tr, c.key)]).forEach(function (w) { if (w && !seen[w]) { seen[w] = 1; words.push(w); } }); });
      var at = function (w) { var i = (c.order || []).indexOf(w); return i < 0 ? 99 : i; };
      words.sort(function (a, b) { return at(a) - at(b) || a.localeCompare(b); });
      return { key: c.key, label: c.label, multi: c.multi, words: words };
    }).filter(function (c) { return c.label && c.words.length > 1; });   // a column with no name is not drawn: a chip beside it matches on it
    if (!trs.length || !cols.length) return null;
    var F = {}, C = '';
    var colOf = function (k) { return (o.cols || []).filter(function (c) { return c.key === k; })[0] || { key: k }; };
    var onChip = function (tr, c) { return c.word ? has(tr, colOf(c.col), c.word) : !!tr.getAttribute('data-f-' + c.key); };
    var chips = (o.chips || []).filter(function (c) { return trs.some(function (tr) { return onChip(tr, c); }); });
    var chipOf = function (k) { return chips.filter(function (c) { return c.key === k; })[0]; };
    var inCols = function (tr, skip) { return cols.every(function (c) { return c.key === skip || !F[c.key] || has(tr, c, F[c.key]); }); };
    var passes = function (tr, skip) { return (!C || onChip(tr, chipOf(C))) && inCols(tr, skip); };
    var bar = document.createElement('div'); bar.className = 'sg-todo-head';
    bar.innerHTML = '<p class="pg-par-sum sg-todo-sum"><span class="sg-chips" role="group" aria-label="Filter">' +
      '<button type="button" class="sg-chip" data-f-all aria-pressed="true">All' + countHTML(o.total == null ? trs.length : o.total) + '</button>' +
      cols.map(function (c) {
        var id = 'sg-f-' + (sec.id || 'page') + '-' + c.key;
        return '<span class="sg-chip-dd"><button type="button" class="sg-chip sg-chip-menu" data-fg="' + esc(c.key) + '" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + id + '" aria-pressed="false">' +
          '<span class="sg-chip-label">' + esc(c.label) + '</span><span class="sg-chip-word"></span><span class="sg-chip-n"></span>' + FILTER_MARK + '</button>' +
          '<span class="sg-select-list" id="' + id + '" role="listbox" aria-label="' + esc(c.label) + '" tabindex="-1" hidden>' +
          [''].concat(c.words).map(function (w, i) { return '<span class="sg-dd-option" role="option" id="' + id + '-' + i + '" data-f="' + esc(c.key + ':' + w) + '" aria-selected="false"><span>' + esc(w || 'All') + '</span><span class="sg-count"></span></span>'; }).join('') +
          '</span></span>';
      }).join('') +
      chips.map(function (c) { return '<button type="button" class="sg-chip" data-chip="' + esc(c.key) + '" aria-pressed="false">' + (c.dot ? '<span class="pg-par-status pg-par--' + esc(c.dot) + '"><span class="pg-par-sign" aria-hidden="true"></span></span>' : '') + esc(c.label) + '<span class="sg-count"></span></button>'; }).join('') +
      '<button type="button" class="sg-mx-clear" data-f-clear hidden>Clear filters</button></span></p>';
    if (h) h.insertAdjacentElement('afterend', bar); else sec.prepend(bar);
    var draw = function () {
      trs.forEach(function (tr) { tr.hidden = !passes(tr); });
      if (trs.length) tableNone(trs[0].closest('table'), o.said);
      var on = cols.filter(function (c) { return F[c.key]; }).length + (C ? 1 : 0);
      bar.querySelector('[data-f-all]').setAttribute('aria-pressed', on ? 'false' : 'true');
      bar.querySelector('[data-f-clear]').hidden = !on;
      chips.forEach(function (c) {
        var b = bar.querySelector('.sg-chip[data-chip="' + c.key + '"]');
        b.setAttribute('aria-pressed', C === c.key ? 'true' : 'false');
        b.querySelector('.sg-count').outerHTML = countHTML(trs.filter(function (tr) { return onChip(tr, c) && inCols(tr); }).length);
      });
      cols.forEach(function (c) {
        var b = bar.querySelector('.sg-chip-menu[data-fg="' + c.key + '"]'), w = F[c.key] || '';
        b.querySelector('.sg-chip-word').textContent = w || 'All';
        b.setAttribute('aria-pressed', w ? 'true' : 'false');
        b.querySelector('.sg-chip-n').innerHTML = '';
        Array.prototype.forEach.call(document.getElementById(b.getAttribute('aria-controls')).querySelectorAll('[role="option"]'), function (op) {
          var ow = op.getAttribute('data-f').slice(c.key.length + 1);
          var n = trs.filter(function (tr) { return passes(tr, c.key) && (!ow || has(tr, c, ow)); }).length;   // what the other chips leave it
          op.querySelector('.sg-count').outerHTML = countHTML(n);
          op.setAttribute('aria-selected', ow === w ? 'true' : 'false');
          op.hidden = !!ow && !n && ow !== w;   // a value the other chips leave no row in is not offered
          if (ow && ow === w) b.querySelector('.sg-chip-n').innerHTML = countHTML(n);   // chosen: its count on the chip too
        });
      });
      sec.dispatchEvent(new CustomEvent('sg-filter', { detail: F }));
    };
    bar.addEventListener('click', function (e) {
      var m = e.target.closest('.sg-chip-menu'); if (m) { mxMenu(m, m.getAttribute('aria-expanded') !== 'true'); return; }
      if (e.target.closest('[data-f-all], [data-f-clear]')) { F = {}; C = ''; draw(); return; }
      var ch = e.target.closest('.sg-chip[data-chip]'); if (ch) { C = C === ch.getAttribute('data-chip') ? '' : ch.getAttribute('data-chip'); draw(); return; }
      var op = e.target.closest('.sg-dd-option[data-f]'); if (!op) return;
      var dd = op.closest('.sg-chip-dd'); if (dd) mxMenu(dd.querySelector('.sg-chip-menu'), false, true);
      var k = op.getAttribute('data-f').split(':')[0], w = op.getAttribute('data-f').slice(k.length + 1);
      if (w) F[k] = w; else delete F[k];
      draw();
    });
    draw();
    return bar;
  }
  function pageBar(sec, o) {
    var h = sec.querySelector(':scope > h2');
    if (h && (o.links || []).length) { h.classList.add('sg-h2-links'); h.insertAdjacentHTML('beforeend', headLinksHTML(o.links)); }
    if (!(o.chips || []).length) return null;
    var total = o.total != null ? o.total : o.chips.reduce(function (t, c) { return t + c.n; }, 0);   // total: when a row may count under two chips
    var chip = function (k, label, n, dot) { return '<button type="button" class="sg-chip" data-chip="' + esc(k) + '" aria-pressed="' + (k === 'all') + '">' + (dot ? '<span class="pg-par-status pg-par--' + esc(dot) + '"><span class="pg-par-sign" aria-hidden="true"></span></span>' : '') + esc(label) + countHTML(n) + '</button>'; };
    var bar = document.createElement('div'); bar.className = 'sg-todo-head';
    bar.innerHTML = '<p class="pg-par-sum sg-todo-sum"><span class="sg-chips" role="group" aria-label="Show">' + chip('all', 'All', total) + o.chips.map(function (c) { return chip(c.key, c.label, c.n, c.dot); }).join('') + '</span></p>';
    if (h) h.insertAdjacentElement('afterend', bar); else sec.prepend(bar);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('.sg-chip[data-chip]'); if (!b) return;
      var k = b.getAttribute('data-chip');
      Array.prototype.forEach.call(bar.querySelectorAll('.sg-chip[data-chip]'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      var chipped = [];
      Array.prototype.forEach.call(sec.querySelectorAll('tr[data-chip]'), function (tr) { tr.hidden = k !== 'all' && tr.getAttribute('data-chip') !== k && (' ' + (tr.getAttribute('data-chip-group') || '') + ' ').indexOf(' ' + k + ' ') < 0; var t = tr.closest('table'); if (t && chipped.indexOf(t) < 0) chipped.push(t); });   // a chip shows its own rows, or a group of them (data-chip-group, one or several)
      chipped.forEach(function (t) { tableNone(t, o.said); });
      sec.dispatchEvent(new CustomEvent('sg-chip', { detail: k }));
      if (e.isTrusted) setHashQuery({ show: k });
    });
    return bar;
  }
  // Intent layer: a review of every page of the team's intent layer in one table, each page with one decision (delete
  // it, move it then delete it, rename it, name it as Figma does, write it, complete it, tidy it, keep it), why, and each
  // change it takes; then each component no page is written for. The most urgent decisions first.
  // Documentation (once the Intent layer page): every page of the intent layer and every component, what is written
  // about it from every source (the intent layer, Figma, the code, the contract) and what is still to write, and where.
  // Its rows read each component's documentation, defined further down: it is drawn with the Status page's first lists.
  // A decision's own mark (Documentation's drafts, a part's question): a tick, a pencil, a bin.
  var DECIDE_MARK = { approve: '<path d="m3 8.5 3.2 3L13 4.5"/>', change: '<path d="M10.5 2.5 13.5 5.5 5.5 13.5H2.5V10.5Z"/><path d="m9 4 3 3"/>', drop: '<path d="M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 9h6.6l.7-9"/>' };
  var decideMark = function (k) { return DECIDE_MARK[k] ? '<svg class="sg-decide-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + DECIDE_MARK[k] + '</svg>' : ''; };
  // A word quoted for the shell, as a command to paste takes it.
  var shq = function (s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; };
  // What every decision copied from the guide starts with: the system's own command (styleguide-gen.mjs → engineCommand),
  // so whoever pastes it runs it for this system and no other.
  var ENGINE = DATA.engineCommand || 'rms-design-system-engine';
  // The page a decision is about, by its kind and name as the guide shows them: "Component Button", "Template Checkout",
  // "Legend, part of Component Pie chart", "the System page". Never its file: the person reads what they decide on.
  var ilOn = function (p) {
    if (!p || p.absent || p.system) return 'the System page';
    if (p.tokens) return 'the Tokens page';
    if (p.about && p.about.partOf) return p.name + ', part of Component ' + p.about.partOf;
    if (p.missingFor) return 'Component ' + p.missingFor;
    if (p.recheckFor) return 'Component ' + p.recheckFor;
    var kind = ({ templates: 'Template', foundations: 'Foundation', patterns: 'Pattern', flows: 'Flow', pages: 'Page' })[p.layer];
    var name = (p.about && p.about.is) || p.component || p.name;
    return kind ? kind + ' ' + p.name : name ? 'Component ' + name : 'the System page';   // a row with no name is the system's
  };
  // The task that wrote a page's drafts, as the decision names it: ' from the task "<title>" (28 Oct)', or '' when the
  // drafts name none or several.
  var ilTaskOf = function (drafts) {
    var t = (drafts || []).map(function (d) { return d.task || ''; }), one = t[0];
    if (!one || t.some(function (x) { return x.toLowerCase() !== one.toLowerCase(); })) return '';
    var at = (drafts[0] || {}).at, d = at ? new Date(at + 'T12:00:00') : null;
    return ' from the task "' + one + '"' + (d && !isNaN(d) ? ' (' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ')' : '');
  };
  var IL = DATA.intentLayer, fillDocs = null;
  // A system with no intent layer has the page too: one row a component, its documentation read from Figma and the code.
  var NO_LAYER = !(IL && (IL.pages || []).length);
  if (!NO_LAYER || COMPONENTS.some(function (c) { return !c.codeOnly; })) {
    if (NO_LAYER) IL = { pages: [], noPage: [] };
    hr(); navLink('documentation', 'documentation');
    var ilSec = section('documentation', 'System', 'Documentation', '');
    fillDocs = function () {
    var ilSrc = IL.source || {};
    var ilLink = function (p) { return (p.url ? '<a class="sg-uses-link" href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.name || p.file) + '</a>' : esc(p.name || p.file)) + '<span class="pg-par-val">' + esc(p.file || '') + '</span>'; };
    // What a page is for: the component it names; a template, the component built from the same code file, else
    // "Template" and its file; any other page, its layer (a foundation, a pattern). Never the page's own kind field.
    var IL_LAYER = { templates: 'Template', foundations: 'Foundation', patterns: 'Pattern', flows: 'Flow', pages: 'Page' };
    var compLink = function (n) { return '<a class="sg-uses-link" href="#' + esc(cid(n)) + '">' + esc(n) + '</a>'; };
    var ilFor = function (p) {
      if (p.component) return compLink(p.component);
      // A page that names no component but is about one: the one it belongs to (a part's), or the one it is (under
      // another name).
      if (p.about && p.about.partOf) return '<span class="sg-il-partof">Part of</span>' + compLink(p.about.partOf);
      if (p.about && p.about.is) return compLink(p.about.is);
      if (p.layer === 'components') return '<span class="pg-missing">No component</span>';
      if (p.layer === 'templates') {
        var built = p.code && COMPONENTS.filter(function (c) { return ((c.api && c.api.file) || '') === p.code; })[0];
        return built ? compLink(built.name) : 'Template' + (p.code ? '<span class="pg-par-val">' + esc(String(p.code).split('/').pop()) + '</span>' : '');
      }
      return esc(IL_LAYER[p.layer] || capital(String(p.layer || '').replace(/s$/, '')));
    };
    var ilGets = function (p) { return ((p.gets || []).length ? p.gets.map(function (g) { return '<p class="sg-il-line"><strong>' + esc(capital(g.what)) + (g.lines > 1 ? ' (' + esc(String(g.lines)) + ' lines)' : '') + '</strong><span class="pg-par-val">' + esc(g.to.join(', ')) + '</span></p>'; }).join('') : '<p class="pg-missing">Nothing.</p>')
      + ((p.wrong || []).some(function (f) { return f.line && (f.kind === 'name' || f.kind === 'claim'); }) ? '<p class="pg-missing">Not the sentences the system contradicts: they are left out until they are fixed.</p>' : ''); };
    // A page kept as it is: its Keep says it all, so What to do and Why stay empty rather than repeat it on every row.
    // A proposal still to answer is an item of What to do, with the page's other changes (ilChanges).
    // A component's own proposals when the row is for one with no page (to add, or a decision about it to review again).
    var ilOwn = function (p) { return p.missingFor ? [(IL.addProposals || {})[p.missingFor]].filter(Boolean) : p.recheckFor ? [(IL.noPageRechecks || {})[p.recheckFor]].filter(Boolean) : (p.proposals || []); };
    // A change to a rule (a guard, a rewrite) is decided under Changes to rules, never also under Proposal.
    var isRuleChange = function (x) { return x.kind === 'guard' || x.kind === 'rewrite'; };
    // Every proposal not answered yet: an item of the page's review, decided with its other changes (ilChanges).
    var ilOpen = function (p) { return ilOwn(p).filter(function (x) { return !x.answer; }); };
    // Its first line in bold, unless plain: under the proposed changes' own heading, which is bold.
    var ilTodo = function (p, plain) { return (p.todo || []).map(function (t, i) { return '<p class="sg-il-line">' + (i || plain ? '' : '<strong>') + esc(t) + (i || plain ? '' : '</strong>') + '</p>'; }).join('') || (p.action === 'keep' ? '' : '<p class="pg-missing">Nothing to change.</p>'); };
    // What on it the system contradicts (the content check), first: each finding, the sentence it is in, and what the
    // system has instead, with where that comes from.
    var ilWrong = function (p) { return (p.wrong || []).map(function (f) { return '<p class="sg-il-line"><strong>' + esc((IL.wrongKinds || {})[f.kind] || f.kind) + '</strong>' + '<span class="sg-il-text">' + (f.line ? '\u201c' + esc(f.line) + '\u201d' : esc(f.says)) + '</span><span class="sg-il-label">What the system has</span><span class="sg-il-text">' + esc(f.truth) + (f.source ? ' From ' + esc(f.source) + '.' : '') + '</span></p>'; }).join(''); };
    // The engine's proposed answer to a decision that is the team's (Fix, Add, Move), what it rests on, and how to say
    // yes or no to it is said in What to do (intent-proposals.mjs). A no keeps the decision on the page as it was.
    // Evidence first: each answer it could take, the one it proposes marked, with what speaks for each, where that comes
    // from and how strongly (intent-proposals.mjs → candidatesFor). Who it waits on, and who answered it.
    var IL_STRENGTH = { strong: 'Strong', some: 'Some', weak: 'Weak' };
    var ilCandidates = function (x) {
      return (x.candidates || []).map(function (c) {
        return '<div class="sg-il-group"><p class="sg-il-head">' + esc((c.answer === x.recommends ? 'Proposed · ' : '') + capital(c.says)) + '</p>'
          + (c.evidence.length ? c.evidence.map(function (e) { return '<p class="sg-il-item">' + esc(e.says) + '<span class="pg-par-val">' + esc(e.from + ' · ' + (IL_STRENGTH[e.strength] || e.strength)) + '</span></p>'; }).join('') : '<p class="sg-il-item pg-missing">Nothing the engine read speaks for it.</p>') + '</div>';
      }).join('');
    };
    var ilAnsweredBy = function (x) {
      var who = x.by || x.at ? ' by ' + esc(x.by || 'someone') + (x.at ? ' on ' + esc(String(x.at).slice(0, 10)) : '') : '';
      var other = x.notOwner && x.decider ? ' ' + esc(x.decider.name) + ' decides it: the answer stands, and they should hear of it.' : '';
      return x.answer === 'no' && x.kind === 'recheck' ? '<p class="sg-il-line"><span class="pg-par-val">Withdrawn' + who + ': its question is asked again.' + other + '</span></p>'
        : x.answer === 'no' && x.kind !== 'review' ? '<p class="sg-il-line"><span class="pg-par-val">Declined' + who + ': it stays for the team to settle another way.' + other + '</span></p>'
        : x.answer ? '<p class="sg-il-line"><span class="pg-par-val">Answered ' + esc(x.answer) + who + '.' + other + '</span></p>'
        : x.decider ? '<p class="sg-il-line"><span class="pg-par-val">Waits on ' + esc(x.decider.name) + '.</span></p>' : '';
    };
    var ilProposal = function (p) {
      var list = ilOwn(p).filter(function (x) { return !isRuleChange(x); });
      return list.map(function (x) {
        return '<p class="sg-il-line"><strong>' + esc(x.kind === 'fix' ? x.subject + ': ' : '') + esc(x.proposal) + '</strong></p>'
          + (x.split ? '<p class="sg-il-line"><span class="pg-par-val">The evidence is split: a person decides.</span></p>' : '')
          // Local or shared, with its reason (local-shared.mjs): only a shared one waits on who decides it.
          + (x.scope && x.scope.reason ? '<p class="sg-il-line"><span class="pg-par-val" data-scope="' + esc(x.scope.scope) + '">' + esc(x.scope.reason) + '</span></p>' : '')
          + ((x.candidates || []).length ? ilCandidates(x) : (x.evidence || []).map(function (e) { return '<p class="sg-il-line"><span class="pg-par-val">' + esc(e) + '</span></p>'; }).join(''))
          + ilAnsweredBy(x);   // how to answer: in What to do
      }).join('');
    };
    // What the agents read from it, word for word, by kind: the one place to see what reaches them.
    var IL_READ = [['review', 'Note beside it'], ['purpose', 'Intent'], ['whenToUse', 'When to use'], ['whenNotToUse', 'When not to use'], ['mistakes', 'Common mistakes'], ['limitations', 'Limitations'], ['rules', 'Rules'], ['sections', 'Other sections']];
    // Each source with where it is written (the intent layer's spec, else its page), then what else the agents read
    // about the component: Figma's description and annotations, the code's note.
    var ilSourceHead = function (name, where) { return '<p class="sg-il-line"><strong>' + esc(name) + '</strong>' + (where ? '<span class="pg-par-val">' + esc(where) + '</span>' : '') + '</p>'; };
    var ilOthersOf = function (p) { return p.missingFor ? ((IL.noPageOthers || {})[p.missingFor] || []) : (p.others || []); };
    var ilReads = function (p) {
      var r = p.reads || {};
      // Each section a block of its own: its title, then its lines close together; a clear space before the next section.
      var own = IL_READ.filter(function (k) { return (r[k[0]] || []).length; }).map(function (k) { return '<div class="sg-il-group"><p class="sg-il-head">' + esc(k[1]) + '</p>' + r[k[0]].map(function (t) { return '<p class="sg-il-item">' + esc(t) + '</p>'; }).join('') + '</div>'; }).join('');
      return (own ? ilSourceHead('Intent layer', p.spec || p.file) + own : '') + ilOthersOf(p).map(function (o) { return ilSourceHead(o.source) + o.lines.map(function (t) { return '<p class="sg-il-line">' + esc(t) + '</p>'; }).join(''); }).join('');
    };
    // Its rules, each said as what holds it (rule-checks.mjs): checked, with the check that enforces it; checkable, with
    // the guard it becomes (its yes or no is under Proposal and What to do); judgment; a vague one with the sentence
    // proposed in its place. The count first.
    var IL_RULE = { checked: 'Checked', checkable: 'Checkable', judgment: 'Judgment' };
    var ilRules = function (p) {
      var r = p.ruleCheck; if (!r || !r.n) return '';
      var head = '<p class="sg-il-line"><strong>' + esc(r.n + ' rule' + (r.n === 1 ? '' : 's') + ': ' + r.checked + ' checked, ' + r.checkable + ' checkable, ' + r.judgment + ' judgment' + (r.vague ? ' (' + r.vague + ' vague)' : '')) + '</strong></p>';
      return head + r.rules.map(function (x) {
        var no = x.answer === 'no' ? ' Declined.' : '';
        var said = x.status === 'checked' ? 'Held by ' + x.check + '.'
          : x.status === 'checkable' ? (x.proposal ? 'A check could hold it: ' + x.proposal.text + no : capital(x.check || '') + '.')
          : x.vague ? (x.rewrite ? 'Too vague to check. Proposed instead: ' + x.rewrite + no : 'Too vague to check: say the component, prop, token or count it means.')
          : 'A person judges it, or a model judging the page.';
        return '<div class="sg-il-group"><p class="sg-il-head">' + esc(IL_RULE[x.status] + (x.vague ? ' · Vague' : '')) + '</p><p class="sg-il-item">' + esc(x.text) + '<span class="pg-par-val">' + esc(said) + '</span></p></div>';
      }).join('');
    };
    // A component with no intent layer: what the agents read about it is its own documentation, as written, grouped by
    // where each piece is written (Figma's description or annotation, the code, the contract, the guidelines), each under
    // its kind, as an intent-layer page's reads are.
    var noLayerReads = function (p) {
      var c = docComp(p), by = {}, order = [];
      try { docIssueRows(c).forEach(function (r) { if (r.st !== 'done' || !r.written || r.kind === 'Intent layer') return; var w = srcNames(r.src || []).join(' · ') || 'The system'; if (!by[w]) { by[w] = []; order.push(w); } by[w].push(r); }); } catch (e) { /* its own area says it */ }
      return order.map(function (w) { return ilSourceHead(w) + by[w].map(function (r) { return '<div class="sg-il-group"><p class="sg-il-head">' + esc(r.kind) + '</p>' + r.written + '</div>'; }).join(''); }).join('');
    };
    // The sources a row's content comes from, in a word each, for the table.
    // Which layer of the intent layer a page belongs to: its area, as the Rules page has one, with a filter of its own.
    var IL_AREA = { system: 'System', foundations: 'Foundations', components: 'Components', patterns: 'Patterns', templates: 'Templates', pages: 'Pages', flows: 'Flows' };
    var IL_AREA_ORDER = ['System', 'Foundations', 'Components', 'Patterns', 'Templates', 'Pages', 'Flows'];
    // The rows the page makes itself carry no layer of their own, and each belongs somewhere: the system's tokens are a
    // foundation, the system's own row is the system, and a component with no page yet is still a component.
    var ilArea = function (p) {
      if (p.tokens) return IL_AREA.foundations;
      if (p.absent) return IL_AREA.system;
      if (p.missingFor) return IL_AREA.components;
      return IL_AREA[p.layer] || (p.layer ? capital(p.layer) : '');
    };
    // Where a page's text comes from, as words: the Sources column joins them, and the Source filter offers them.
    var ilSourceWords = function (p) {
      if (p.tokens) return ['Figma', 'Intent layer'];
      if (p.absent) return ['Intent layer'];
      if (p.noLayer) { var c0 = docComp(p), w0 = []; try { docIssueRows(c0).forEach(function (r) { if (r.st === 'done') srcNames(r.src || []).forEach(function (x) { if (x && w0.indexOf(x) < 0) w0.push(x); }); }); } catch (e) { /* none */ } return w0; }
      var r = p.reads || {}, out = [];
      if (!p.missingFor && IL_READ.some(function (k) { return (r[k[0]] || []).length; })) out.push('Intent layer');
      ilOthersOf(p).forEach(function (o) { var w = /^Figma/.test(o.source) ? 'Figma' : o.source; if (out.indexOf(w) < 0) out.push(w); });
      return out;
    };
    var ilSources = function (p) { var w = ilSourceWords(p); return w.length ? esc(w.join(', ')) : '<span class="pg-missing">None</span>'; };
    // A page's status in one word, as the filter and the chips before it said it.
    var IL_WORD = { review: 'Review', write: 'Missing', remove: 'Remove', keep: 'Done' };
    // Everything a page asks to change, in one place, in groups each under its own heading and count: New text for the
    // page (its drafts, each once, beside where it comes from), Changes to rules (the guards and rewrites its rules
    // propose, rule-checks.mjs: one with nothing but the engine's own reading behind it says so on its own line, No its
    // answer until a person says otherwise), and Other changes (what is still to write, a part's page to move, the notes no agent
    // reads). Three actions a group, under it, never on an item: Approve all, Change, Drop all, each copying its decision
    // on everything the group shows, in the person's words, for Claude Code. Never where each is written (Claude Code finds it).
    var REVIEW_LINE = /^Review (its draft|these \d+ drafts)\b/;   // the engine's line for the drafts alone (intent-layer.mjs): the card says it for every change
    // Where a draft comes from (draft-sources.mjs): each prop it names as the code has it, a name only Figma has (never
    // a prop the code takes: said as a warning), and the line it says again, wherever it is written.
    var ilDraftFrom = function (d, p) {
      // A drafted example says where its code is from in its own line.
      var f = d.from; if (!f) return d.code != null ? '' : '<span class="sg-il-source">' + esc('Source: none found on the page, in Figma or in the code.') + '</span>';
      var file = function (x) { return String(x || '').split('/').pop(); };
      var code = file(p.code || ((f.props || []).filter(function (x) { return x.file; })[0] || {}).file) || 'the code';
      var tick = function (x) { return '`' + x + '`'; };
      var out = (f.props || []).filter(function (x) { return x.from !== 'Figma'; }).map(function (x) { return 'The code: ' + tick(x.name) + ', a prop of ' + (file(x.file) || code) + (x.options && x.options.length ? ', takes ' + x.options.map(tick).join(', ') : '') + '.'; });
      var carries = function (n) { var k = (f.carriers || {})[n]; return k ? ' The code carries it in ' + (k.field ? 'the ' + tick(k.field) + ' field of ' + tick(k.prop) : tick(k.prop)) + '.' : ''; };
      var warn = (f.figmaOnly || []).map(function (n) { return 'Figma: ' + tick(n) + ' is a property of the Figma component, not a prop ' + code + ' takes.' + carries(n) + ' Change the draft to say what the code does, or name it as Figma\'s.'; });
      // The rewrite offered (draft-sources.mjs → rewriteOf), for the person to take to Claude Code or edit.
      if (f.rewrite && f.rewrite !== d.text) warn.push('Proposed instead: ' + f.rewrite);
      if (f.line) out.push('Says again: “' + f.line.text + '” (' + f.line.from + ').');
      return warn.map(function (t) { return '<span class="sg-il-source sg-il-source--warn">' + esc(t) + '</span>'; }).join('') + out.map(function (t) { return '<span class="sg-il-source">' + esc(t) + '</span>'; }).join('');
    };
    // One item: what it is and its body, with the words each answer adds to its group's decision (steps: approve,
    // change, drop). Its callers' other words (changeTo, opt) are not used: the panel edits nothing in place.
    var ilItem = function (head, body, steps) {
      var said = function (k) { return steps[k] ? ' data-il-' + k + '="' + esc(steps[k]) + '"' : ''; };
      return '<div class="sg-il-line sg-il-change sg-il-item" data-il-item' + said('approve') + said('change') + said('drop') + '><strong>' + esc(head) + '</strong>' + body + '</div>';
    };
    // A group: its heading and count, its items, those the engine has no ground for (quiet: shown like the rest, under a
    // line saying so, and left as they are by its actions), then its three actions below them all: Approve all, Change,
    // Drop all. Each copies its decision on the items above that line, never on those.
    var IL_DO = [['approve', 'Approve all', 'Approve'], ['change', 'Change', 'Change'], ['drop', 'Drop all', 'Drop']];
    var ilGroup = function (key, head, items, all, quiet) {
      quiet = quiet || []; var n = items.length + quiet.length; if (!n) return '';
      all = all || {};
      var said = function (k) { return all[k] ? ' data-il-all-' + k + '="' + esc(all[k]) + '"' : ''; };
      var acts = items.length ? '<div class="sg-il-group-actions" role="group" aria-label="' + esc(head) + '">' + IL_DO.map(function (d) {
        return sysButton('button', items.length === 1 || d[0] === 'change' ? d[2] : d[1] + ' ' + items.length, ' data-il-all="' + key + '" data-il-do="' + d[0] + '" title="' + esc('Copies the decision: paste it in Claude Code') + '"', 'sg-il-act', null, decideMark(d[0]));
      }).join('') + '<span class="sg-decide-said" role="status"></span></div>' : '';
      return '<div class="sg-il-group-decide" data-il-group="' + key + '"' + said('approve') + said('change') + said('drop') + '><div class="sg-il-group-head"><strong>' + esc(head + ' (' + n + ')') + '</strong></div>' + items.join('')
        + (quiet.length ? '<div class="sg-il-quiet"><p class="sg-il-quiet-head">' + esc(quiet.length === 1 ? 'The engine has no ground for the change below: No, unless you say otherwise.' : 'The engine has no ground for the ' + quiet.length + ' changes below: No to each, unless you say otherwise.') + '</p>' + quiet.join('') + '</div>' : '') + acts + '</div>';
    };
    // A group's decision, in the person's words: the group's own words for it when it has them (all: "Approve all 3
    // drafts"), else each item's in turn (steps: those the group proposes, never one it has no ground for).
    // → the decision to copy, or '' when there is nothing to decide.
    var ilGroupDecision = function (on, all, steps) {
      var said = all ? [all] : steps.filter(Boolean);
      return said.length ? on + capital(said.join('; then ')) + '.' : '';
    };
    // open: the page's proposals not answered yet. Its rule changes are Changes to rules; the others (a page to write, a
    // name to keep, a part's page, a page to review again) Decisions about the page, each with the same three actions.
    var ilChanges = function (p, write, notes, task, open) {
      var seen = {}, drafts = [];
      (p.missingFor ? [] : p.drafts || []).forEach(function (d) {
        var k = String(d.where) + '\u0000' + String(d.text).replace(/\s+/g, ' ').trim();
        if (seen[k]) return; seen[k] = 1; drafts.push(d);
      });
      write = write || []; notes = notes || []; open = open || [];
      var rules = open.filter(isRuleChange), asks = open.filter(function (x) { return !isRuleChange(x); });
      var off = notes.filter(function (n) { return /^yes/i.test(n.remove || ''); }), fix = notes.filter(function (n) { return off.indexOf(n) < 0; });
      var parts = write.filter(function (x) { return x.part; }), toWrite = write.filter(function (x) { return !x.part; });
      var nd = drafts.length, n = nd + open.length + write.length + notes.length;
      if (!n) return '';
      var noteOf = function (x) { return capital(x.what || x.text); }, q = function (x) { return '"' + x + '"'; };
      var noteBody = function (x, why) { return '<span class="pg-par-val">“' + esc(noteOf(x)) + '”</span><span class="sg-il-text">' + esc(why) + '</span>'; };
      // Each decision in the person's words: the system's command, the page by its kind and name, then each item's. Never
      // a file or a flag: Claude Code finds the page and runs the rest.
      var on = ENGINE + ' on ' + ilOn(p) + ', ', from = ilTaskOf(p.missingFor ? [] : p.drafts);
      var noFile = function (w) { return String(w || '').replace(/^[^,]*\.(?:md|json)\b,?\s*/i, ''); };
      var draftItems = drafts.map(function (d) {
        var t = String(d.text);
        return ilItem(d.where, '<span class="pg-par-val">' + esc(t) + '</span>' + (d.code != null ? '<pre class="sg-il-example"><code>' + esc(String(d.code)) + '</code></pre>' : '') + ilDraftFrom(d, p),
          { approve: 'Approve the draft ' + q(t), change: 'Change the draft ' + q(t) + ': ask me for my words', changeTo: 'Change the draft ' + q(t) + ' to "{to}"', drop: 'Drop the draft ' + q(t) },
          null, { edit: t, tips: { approve: 'Agents use it as written from the next run.', drop: 'It is deleted; no agent ever gets it.' } });
      });
      // A proposal's answers: its own (options) when it lists them, else yes and no; approve is the first, drop the other.
      var answers = function (x) { var o = (x.options && x.options.length) ? x.options : [{ answer: 'yes', does: x.yes || '' }, { answer: 'no', does: x.no || '' }]; return [o[0], o[1] || o[0]]; };
      var says = function (a, x) { var w = String(a.answer).toLowerCase(); return (w === 'yes' ? 'Yes' : w === 'no' ? 'No' : q(a.answer)) + ' to ' + q(x.proposal); };
      var ruleItem = function (x, def) {
        var to = x.kind === 'rewrite' ? x.rewrite : String(x.proposal).replace(/^[\s\S]*?as a check: /, '');
        var yes = ((x.candidates || []).filter(function (c) { return c.answer === 'yes'; })[0] || {}).evidence || [], a = answers(x);
        var why = x.quiet ? 'Only the engine\'s own reading of the rule speaks for it: nothing the team wrote or decided does.' : yes.map(function (e) { return e.says; }).join(' ');
        return ilItem(x.kind === 'rewrite' ? 'Rewrite the rule' : 'Hold the rule as a check', '<span class="pg-par-val">“' + esc(x.rule || '') + '”</span><span class="sg-il-label">' + esc(x.kind === 'rewrite' ? 'As' : 'With the check') + '</span><span class="sg-il-text">' + esc(to) + '</span>' + (why ? '<span class="sg-il-source">' + esc(why) + '</span>' : '') + ilAnsweredBy(x),
          { approve: says(a[0], x), change: 'Change ' + q(x.proposal) + ': ask me for my words', changeTo: 'Change ' + q(x.proposal) + ' to "{to}"', drop: says(a[1], x) }, def, { edit: to, tips: { approve: a[0].does, drop: a[1].does } });
      };
      var askItem = function (x) {
        var a = answers(x), head = ({ add: 'A page to write', fix: 'A name to keep', move: 'A part\'s page', review: 'A page to review again', recheck: 'A decision to review again' })[x.kind] || 'A decision';
        return ilItem(head, '<span class="pg-par-val">' + esc((x.kind === 'fix' ? x.subject + ': ' : '') + x.proposal) + '</span>' + (x.split ? '<span class="sg-il-source">The evidence is split: a person decides.</span>' : '') + ilAnsweredBy(x),
          { approve: says(a[0], x), change: 'Change ' + q(x.proposal) + ': ask me for my words', changeTo: 'Change ' + q(x.proposal) + ' to "{to}"', drop: says(a[1], x) }, null, { edit: x.proposal, tips: { approve: a[0].does, drop: a[1].does } });
      };
      var otherItems = toWrite.map(function (x) { return ilItem((x.check ? 'To check · ' : 'To draft · ') + x.what, x.html, { approve: 'write ' + q(x.what) + (noFile(x.where) ? ' ' + noFile(x.where) : '') + ' as drafts I review', change: 'for ' + q(x.what) + ', ask me what to write', changeTo: 'for ' + q(x.what) + ', write "{to}" as a draft I review' }, null, { edit: '', tips: { approve: 'Claude Code drafts it for you to review.', drop: 'It stays to write.' } }); })
        .concat(parts.map(function (x) { return ilItem(x.what, x.html, { approve: 'copy what this page says into Component ' + x.part.root + '\'s page, under Parts, as ### ' + x.part.name + ', then delete this page', change: 'ask me what to copy into Component ' + x.part.root + '\'s page' }, null, { tips: { drop: 'The page stays as it is.' } }); }))
        .concat(off.map(function (x) { return ilItem('Remove · ' + capital(x.from || 'a note'), noteBody(x, x.why || x.remove.replace(/^yes[:,]?\s*/i, '') || 'Nothing in it reaches an agent.'), { approve: 'remove ' + q(noteOf(x)) + ' where it lives', change: 'for ' + q(noteOf(x)) + ', ask me what to change', changeTo: 'change ' + q(noteOf(x)) + ' to "{to}" where it lives' }, null, { edit: noteOf(x), tips: { drop: 'The note stays as it is.' } }); }))
        .concat(fix.map(function (x) { return ilItem('Change · ' + capital(x.from || 'a note'), noteBody(x, [x.why, x.fix].filter(Boolean).join(' ')), { approve: 'for ' + q(noteOf(x)) + ', ' + (x.fix ? x.fix.charAt(0).toLowerCase() + x.fix.slice(1).replace(/\.$/, '') : 'say what an agent should take from it'), change: 'for ' + q(noteOf(x)) + ', ask me what to change', changeTo: 'change ' + q(noteOf(x)) + ' to "{to}" where it lives' }, null, { edit: noteOf(x), tips: { drop: 'The note stays as it is.' } }); }));
      var html = ilGroup('drafts', 'New text for the page', draftItems, { approve: (nd === 1 ? 'Approve its draft' : 'Approve all ' + nd + ' drafts') + from, change: nd === 1 ? 'Change its draft: ask me for my words' : 'Change the drafts: ask me which, and for my words', drop: (nd === 1 ? 'Drop its draft' : 'Drop all ' + nd + ' drafts') + from })
        + ilGroup('rules', 'Changes to rules', rules.filter(function (x) { return !x.quiet; }).map(function (x) { return ruleItem(x); }), null, rules.filter(function (x) { return x.quiet; }).map(function (x) { return ruleItem(x, 'drop'); }))
        + ilGroup('asks', 'Decisions about the page', asks.map(askItem), null)
        + ilGroup('other', 'Other changes', otherItems, { drop: 'write nothing new and leave ' + (notes.length ? 'its notes' : 'the page') + ' as ' + (notes.length ? 'they are' : 'it is') });
      var lead = (task && !/pg-missing/.test(task) ? task : '') + '<p class="sg-il-line">' + esc('Approve all, Change or Drop all under a group copies its decision; paste it into Claude Code. What you leave stays as it is.' + (nd ? ' Agents won\'t use ' + (nd === 1 ? 'the draft' : 'the drafts') + ' until you approve.' : '')) + '</p>';
      return lead + '<div class="sg-il-draft" data-il-review data-il-on="' + esc(on) + '"><div class="sg-il-draft-text">' + html + '</div></div>';
    };
    var ilWhy = function (p) { return ilWrong(p) + (p.component || p.layer !== 'components' ? ((p.notUsed || []).length ? p.notUsed.map(function (n) { return '<p class="sg-il-line"><strong>' + esc(capital(n.what)) + '</strong><span class="pg-par-val">' + esc(n.why) + '</span></p>'; }).join('') : (p.action === 'keep' || (p.wrong || []).length ? '' : '<p class="pg-missing">Everything on it reaches the agents.</p>')) : '<p class="sg-il-line">' + esc((p.notUsed[0] || {}).why || '') + '</p>'); };
    // What is still to write about the component a row is for, from every source: each piece of its documentation not
    // written yet or to check (its Documentation area's rows), with where to write it (Figma, the intent layer). Its page
    // in the intent layer is the row's own decision, never repeated here.
    var docComp = function (p) { var n = p.missingFor || p.component || (p.about && p.about.is); return n ? COMPONENTS.filter(function (c) { return c.name === n; })[0] || null : null; };
    var docLeft = function (p) {
      if (p._left) return p._left;
      var c = docComp(p), out = [];
      // A part with a draft waiting on its page is the draft's to review, never also missing.
      var drafted = {}; (p.drafts || []).forEach(function (d) { var w = String(d.where || '').toLowerCase(), t = String(d.text || ''); drafted[/^\s*(do|don'?t|do not)\s*:/i.test(t) || /do\b.*don/.test(w) ? 'Do and don\'t' : /limit/.test(w) ? 'Limitations' : /mistake/.test(w) ? 'Common mistakes' : /example/.test(w) ? 'Example' : /role/.test(w) ? 'Role' : /not to use/.test(w) ? 'When not to use' : /when to use/.test(w) ? 'When to use' : /purpose|intent/.test(w) ? 'What it is' : w] = 1; });
      // A "when to use" line drafted is also the line of its own the "which component?" test asks for, once approved.
      if (drafted['When to use']) drafted['When to use it, not a sibling'] = 1;
      if (c) try { docIssueRows(c).forEach(function (r) { if ((r.st === 'todo' || r.st === 'check') && r.kind !== 'Intent layer' && r.kind !== 'Its tokens' && r.kind !== 'Not given to agents' && !drafted[r.kind]) out.push({ kind: r.kind, st: r.st, part: r.part, where: srcNames(r.src || []).join(' · '), notes: r.notes || [], how: r.how || '', todo: unescapeHTML(plainText(r.todo || '')).replace(/\s+/g, ' ').trim() }); }); } catch (e) { /* its own area says it */ }
      return (p._left = out);
    };
    // Its tokens' descriptions are written once a token, not once a component (many share them): they are one row of
    // their own, the Tokens row, never repeated on each component's.
    // Where what is missing is written: "in Figma", "in the intent layer", or both.
    var docWhere = function (p, st) { var w = []; docLeft(p).filter(function (x) { return !st || x.st === st; }).forEach(function (x) { String(x.where || '').split(' · ').forEach(function (s) { if (s && w.indexOf(s) < 0) w.push(s); }); }); return w; };
    // Where what is missing is to be written, said under Missing: In Figma, In the intent layer, or both.
    var docTopic = function (p) { if (p.tokens) return 'In Figma or the intent layer'; if (p.absent) return 'In the intent layer'; var w = docWhere(p, 'todo').map(function (x) { return /^Figma$/.test(x) ? 'Figma' : 'the ' + x.replace(/^The /, '').toLowerCase(); }); return !w.length ? '' : 'In ' + w.join(' and '); };
    // Each thing still to write, as one block: what to write (or check). Where it goes (the spec file and its section, the
    // page's JSON being generated from it; Figma's description; the code's comment) is said only in the decision Claude
    // Code is given, which writes it.
    var SECTION_OF = { 'What it is': 'Purpose', 'When to use': 'When to use', 'When not to use': 'When not to use', 'Common mistakes': 'Common mistakes', Limitations: 'Limitations', Example: 'Example', Role: 'Role', 'Do and don\'t': 'Do and don\'t' };
    var wherePlain = function (p, x) {
      return String(x.where || '').split(' · ').filter(Boolean).map(function (w) {
        if (/intent layer/i.test(w)) { var f = p.spec || p.file; return f ? f + (SECTION_OF[x.kind] ? ', under ## ' + SECTION_OF[x.kind] : '') + (p.specShared ? ' (a spec several components share: written for this one by name)' : '') : 'its page in the intent layer'; }
        if (/^figma$/i.test(w)) return 'its Description in Figma';
        if (/code/i.test(w)) return p.code ? 'its code comment, in ' + p.code : 'its code comment';
        return w;
      }).join(' or ');
    };
    var docWriteOf = function (p) { return docLeft(p).map(function (x) {
      // A part's documentation goes in its root's page under its name, opening with what this page says it is.
      if (x.part) { var says = (p.drafts || []).filter(function (d) { return /purpose|intent/i.test(d.where); }).map(function (d) { return d.text; })[0] || ((p.reads || {}).purpose || [])[0];
        return { what: 'Add to ' + x.part.root + '\'s page', part: x.part, html: '<span class="sg-il-text"><strong>' + esc(x.part.name) + '</strong>: ' + esc(says || 'everything this page says.') + '</span>' }; }
      return { what: x.kind, check: x.st === 'check', where: wherePlain(p, x), html: ''
      // The points to cover as a list, then how to write it.
      + ((x.notes || []).length ? '<span class="sg-il-label">Points to cover</span><ul class="sg-il-points">' + x.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '')
      + ((x.how || x.todo) ? ((x.notes || []).length ? '<span class="sg-il-label">How to write it</span>' : '') + '<span class="sg-il-text">' + esc(x.how || x.todo) + '</span>' : '') }; }); };
    // Review: a person decides or checks (a decision of the intent layer's, a draft, a piece written too thin to use).
    // Missing: only to write, nothing to decide. A row can be both; Keep, neither.
    // Remove: the notes on the component (Figma's annotations, the code's) that no agent is given, each with why, how to
    // keep it instead, and whether to remove it (once the For agents page).
    var notesOff = function (p) { var c = !p.tokens && docComp(p); return (c && c.notesLeft) || []; };
    var needsRemove = function (p) { return notesOff(p).length > 0; };
    var removeTopic = function (p) { var n = notesOff(p).length; return n + (n === 1 ? ' note no agent reads' : ' notes no agent reads'); };
    var needsReview = function (p) { if (p.absent) return !!(p.drafts || []).length; return !p.tokens && (!!p.missingFor || p.action !== 'keep' || docLeft(p).some(function (x) { return x.st === 'check'; })); };
    var needsWrite = function (p) { if (p.absent) return !(p.drafts || []).length; return p.tokens ? p.tokens.missing.length > 0 : docLeft(p).some(function (x) { return x.st === 'todo'; }); };
    var isKeep = function (p) { return !needsReview(p) && !needsWrite(p) && !needsRemove(p); };
    // A page whose component changed since it was written: its review is that, whatever else it waits on.
    var isStale = function (p) { return (p.wrong || []).some(function (f) { return f.kind === 'stale'; }); };
    var reviewTopic = function (p) { return isStale(p) && p.action === 'review' ? 'Changed since written' : p.recheck && p.action === 'review' ? 'Decision to review again' : p.missingFor || p.action !== 'keep' ? labelOf(p.missingFor ? 'missing' : p.action) : 'To check'; };
    // Who a row waits on (ds-config.json owners, decided-by.mjs): its page's, else its component's, else the system's.
    var deciderOf = function (p) { var d = p.decider || (docComp(p) || {}).decider || (p.absent ? IL.systemDecider : null); return d && d.name ? d.name : null; };
    // Each decision's colour, as the statuses: red to fix, yellow to decide or complete, green done.
    var IL_DOT = { 'delete': 'differs', move: 'differs', missing: 'differs', fix: 'differs', review: 'figma', rename: 'figma', name: 'figma', write: 'figma', improve: 'figma', keep: 'match' };
    var labels = (IL.actionLabels || []).concat([['missing', 'Add']]);
    var rows = IL.pages.slice().sort(function (x, y) { return labels.findIndex(function (l) { return l[0] === x.action; }) - labels.findIndex(function (l) { return l[0] === y.action; }); })
      // The components with no page, most used first (pages-to-write.mjs), when the usage map ranks them.
      .concat((IL.noPage || []).slice().sort(function (a, b) { var r = IL.pagesToWrite || {}, x = (r[a] || {}).rank || 1e9, y = (r[b] || {}).rank || 1e9; return x - y; }).map(function (n) { return { action: 'missing', decision: 'Add', missingFor: n }; }))
      // An Add answered with no page, its component changed since: a row of its own, to review the decision again.
      .concat(Object.keys(IL.noPageRechecks || {}).sort().map(function (n) { var x = IL.noPageRechecks[n]; return { action: 'review', decision: 'Review', recheckFor: n, recheck: 1, decider: x.decider || null }; }))
      .concat(NO_LAYER ? COMPONENTS.filter(function (c) { return !c.codeOnly; }).map(function (c) { return { action: 'keep', component: c.name, noLayer: true }; }).sort(function (x, y) { return x.component.localeCompare(y.component); }) : []);
    // The Tokens row, first: every token a component uses, and those whose variable in Figma has no description yet.
    (function () {
      var used = {}, missing = {};
      COMPONENTS.forEach(function (c) { var t = c.tokenDocs; if (!t || !t.total) return; (t.missing || []).forEach(function (m) { missing[m] = 1; used[m] = 1; }); (t.described || []).forEach(function (d) { used[d.figma] = 1; }); });
      var total = Object.keys(used).length; if (!total && !Object.keys(missing).length) return;
      rows.unshift({ action: 'keep', tokens: { missing: Object.keys(missing).sort(), total: Math.max(total, Object.keys(missing).length) } });
    })();
    // The system's row, first, while the layer does not say what to do when no component fits (layer-questions.mjs).
    // With drafts on the System page (the system's own entry), the row is theirs to review, and nothing is still to write.
    if ((IL.systemDrafts || []).length) rows.unshift({ action: 'review', absent: IL.absent || { kinds: [], asked: 0, answered: 0 }, system: true, drafts: IL.systemDrafts });
    else if (IL.absent && !IL.absent.rule && IL.absent.asked) rows.unshift({ action: 'write', absent: IL.absent });
    // Every row but Keep waits on a person: its status is Review, and what kind of review is said under it (a draft's
    // review is "Drafts", the others their decision: Move, Fix, Add…).
    // Under Review, the topic of the review, never an answer to it (the Proposal card answers): a page of a part of a
    // component, a name not in the system, a component with no page, drafts…
    var IL_TOPIC = { review: 'Drafts', move: 'Part of a component', fix: 'Not in the system', missing: 'No intent page', 'delete': 'Says nothing of its own', rename: 'Named differently', name: 'Named differently', write: 'Nothing for agents', improve: 'Incomplete' };
    // A page with nothing left to do reads Done here (the intent layer's own decision for it is Keep).
    var labelOf = function (k) { if (k === 'keep') return 'Done'; if (IL_TOPIC[k]) return IL_TOPIC[k]; var l = labels.filter(function (x) { return x[0] === k; })[0]; return l ? l[1] : k; };
    // One status a row: Review (yellow) when a person decides or checks anything, with what under it (and, when there is
    // also something to write, where); else Missing (red), with where to write it; else Done.
    var statusPill = function (cls, word, under) { return '<span class="sg-il-status"><span class="pg-par-status pg-par--' + cls + '"><span class="pg-par-sign" aria-hidden="true"></span>' + esc(word) + '</span>' + (under ? '<span class="pg-par-val">' + esc(under) + '</span>' : '') + '</span>'; };
    // One status a row: Review, else Missing, else Remove, else Done; what else the row has is said under it.
    var statusOf = function (p) { return isKeep(p) ? 'keep' : needsReview(p) ? 'review' : needsWrite(p) ? 'write' : 'remove'; };
    // A row with notes no agent reads says Remove under its status, and is found by the Remove chip whatever its status.
    var removeUnder = function (p) { return needsRemove(p) ? ['Remove ' + removeTopic(p)] : []; };
    var decisionCell = function (k, p) { var st = statusOf(p); return st === 'keep' ? statusPill(IL_DOT.keep, labelOf('keep'))
      : st === 'review' ? statusPill('figma', 'Review', [reviewTopic(p)].concat(needsWrite(p) ? ['Missing ' + docTopic(p).charAt(0).toLowerCase() + docTopic(p).slice(1)] : [], removeUnder(p), deciderOf(p) ? ['Waits on ' + deciderOf(p)] : []).join(' · '))
      : st === 'write' ? statusPill('differs', 'Missing', [docTopic(p)].concat(removeUnder(p)).join(' · ')) : statusPill('differs', 'Remove', removeTopic(p)); };
    // Each row's cells, once: the table shows For, File, Sources, Decision and when its file last changed; a click on the row (or
    // Enter) opens it in the side panel, with what to do, why and what the agents get from it.
    // When the page's file last changed in the intent layer (its last commit), as a date and time.
    var ilWhen = function (x) { var d = new Date(x); return isNaN(d) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    // When a row with no file of its own (the Tokens, a component with no page or no intent layer) was last checked: its
    // documentation's latest check, else the build's.
    var docAt = function (p) { var at = null, c = !p.tokens && docComp(p); if (c) try { docIssueRows(c).forEach(function (r) { if (r.at && (!at || r.at > at)) at = r.at; }); } catch (e) { /* none */ } at = at || DATA.builtAt; return at ? esc(ilWhen(at)) : ''; };
    // Where the products use a component with no page, and its place among the pages to write (pages-to-write.mjs);
    // the first ones are started on the next run that writes the layer, their lines drafts to review.
    var ilReachOf = function (n) { var r = (IL.pagesToWrite || {})[n]; if (!r) return ''; var x = r.reach || {}, ps = x.products || [], k = function (v, one) { return v + ' ' + one + (v === 1 ? '' : 's'); };
      return '<p class="sg-il-line"><strong>' + esc('Number ' + r.rank + ' of the pages to write, most used first') + '</strong><span class="pg-par-val">' + esc((ps.length ? ps.slice(0, 3).join(', ') + (ps.length > 3 ? ' and ' + (ps.length - 3) + ' more' : '') + ' use it: ' + k(x.files || 0, 'file') + ', ' + k(x.uses || 0, 'use') + '.' : 'No product uses it yet.') + (r.next ? ' The next run that writes the layer starts its page, its lines drafts to review.' : '')) + '</span></p>'; };
    var ilCellsOf = function (p) {
      if (p.tokens) { var tm = p.tokens.missing, tn = p.tokens.total;
        return { decision: decisionCell('keep', p), file: '<span class="pg-missing">—</span>', forWhat: '<a class="sg-uses-link" href="#tokens">Tokens</a>', updated: docAt(p), reads: '',
          write: tm.length ? [{ what: 'Their descriptions (' + tm.length + ')', html: '<span class="sg-il-label">What to write</span><span class="sg-il-text">One sentence on what each token is for. Agents read it to pick the right token. A line that only repeats the token\'s name, its modes or what it points to does not count.</span><span class="sg-il-label">Where</span><span class="sg-il-text">In Figma, in each variable\'s Description' + (tm.some(function (m) { return /^text style /.test(m); }) ? ', or a text style\'s own Description' : '') + '. Or in the intent layer, on the token\'s own entry or on a page that names it, like Colors.</span><span class="sg-il-label">The tokens</span><span class="sg-il-codes">' + tm.map(function (m) { return '<code>' + esc(m) + '</code>'; }).join('') + '</span>' }] : [],
          todo: tm.length ? '<p class="sg-il-line"><strong>Say what ' + tm.length + ' of the ' + tn + ' tokens the components use are for. An agent asking which token to use for something finds nothing on them yet.</strong></p>' : '',
          why: '<p class="sg-il-line">' + esc((tn - tm.length) + ' of ' + tn + ' tokens the components use say what they are for, in Figma or in the intent layer.') + '</p>', gets: '' }; }
      if (p.absent) { var ab = p.absent, asked = ab.kinds.filter(function (k) { return !k.said; }).map(function (k) { return k.kind; });
        var held = (p.drafts || []).length;
        return { decision: decisionCell(held ? 'review' : 'write', p), file: ab.entry ? (ab.entryUrl ? '<a class="sg-uses-link" href="' + esc(ab.entryUrl) + '" target="_blank" rel="noopener">' + esc(ab.entry) + '</a>' : esc(ab.entry)) : '<span class="pg-missing">—</span>', forWhat: 'The system', updated: docAt(p), reads: '', remove: '',
          write: held ? [] : [{ what: 'What to do when no component fits', html: '<span class="sg-il-label">What to write</span><span class="sg-il-text">One rule for every case, like "Use only the components in this system. If none fits, say so and ask before building one."</span><span class="sg-il-label">Where</span><span class="sg-il-text">On the system\'s page in the intent layer' + (ab.entry ? ', ' + esc(ab.entry) : '') + '.</span>' + (asked.length ? '<span class="sg-il-label">What agents ask for that the system does not have</span><span class="sg-il-codes">' + asked.map(function (k) { return '<code>' + esc(k) + '</code>'; }).join('') + '</span>' : '') }],
          todo: held ? '<p class="sg-il-line"><strong>Review the drafts on the System page. Agents won\'t use them until you decide.</strong></p>' : '<p class="sg-il-line"><strong>Add one rule to the system\'s page that says what agents do when no component fits. Today an agent asked for a component the system does not have builds one of its own.</strong></p>',
          why: '<p class="sg-il-line">' + esc(ab.answered + ' of ' + ab.asked + ' components agents often ask for, and the system does not have, are answered. None of the intent layer\'s pages, and no agent file of this project, says what to do when none fits.') + '</p>', gets: '' }; }
      if (p.missingFor) return { decision: decisionCell('missing', p), write: docWriteOf(p), notes: notesOff(p), file: '<span class="pg-missing">—</span>', forWhat: '<a class="sg-uses-link" href="#' + esc(cid(p.missingFor)) + '">' + esc(p.missingFor) + '</a>',
        updated: docAt(p), reads: '', todo: '<p class="sg-il-line"><strong>Write a page for ' + esc(p.missingFor) + ' in the intent layer, titled ' + esc(p.missingFor) + ', as ' + esc(IL.namesFrom || 'Figma') + ' names it.</strong></p>', why: '<p class="sg-il-line">No page names this component, by name or by code file.</p>' + ilReachOf(p.missingFor), gets: '<p class="pg-missing">Nothing.</p>' };
      if (p.recheckFor) { var rx = (IL.noPageRechecks || {})[p.recheckFor] || {};
        return { decision: decisionCell('review', p), write: [], notes: [], file: '<span class="pg-missing">—</span>', forWhat: compLink(p.recheckFor), updated: docAt(p), reads: '', gets: '',
          todo: '<p class="sg-il-line"><strong>' + esc('Review a decision again: ' + ((rx.stale || {}).truth || '') + ' Confirm it still holds, or withdraw it.') + '</strong></p>',
          why: '<p class="sg-il-line">' + esc('No page of its own: ' + ((rx.was || {}).by || 'the team') + ' answered ' + ((rx.was || {}).answer || '') + ' to "' + ((rx.was || {}).proposal || rx.decision) + '"' + ((rx.was || {}).at ? ' on ' + String(rx.was.at).slice(0, 10) : '') + '.') + '</p>' }; }
      if (p.noLayer) return { decision: decisionCell('keep', p), write: docWriteOf(p), notes: notesOff(p), file: '', forWhat: ilFor(p), todo: '', why: '', reads: noLayerReads(p), gets: '', updated: docAt(p) };
      return { decision: decisionCell(p.action, p), write: docWriteOf(p), notes: notesOff(p), file: ilLink(p), forWhat: ilFor(p), todo: ilTodo(p), why: ilWhy(p), reads: ilReads(p), gets: ilGets(p), updated: p.updatedAt ? esc(ilWhen(p.updatedAt)) : '' };
    };
    var waitsKey = function (d) { return 'waits-' + String(d).toLowerCase().replace(/[^a-z0-9]+/g, '-'); };
    var rowHTML = function (p, i) {
      var c = ilCellsOf(p);
      return '<tr class="sg-row-open" tabindex="0" data-il-row="' + i + '" data-chip="' + esc(isKeep(p) ? 'keep' : p.tokens ? 'tokens' : p.absent ? 'system' : p.missingFor ? 'missing' : p.action === 'keep' ? 'left' : p.action) + '"' + (isKeep(p) ? '' : ' data-chip-group="' + [({ review: 'toReview', write: 'toWrite', remove: 'toRemove' })[statusOf(p)]].concat(needsRemove(p) && statusOf(p) !== 'remove' ? ['toRemove'] : [], statusOf(p) === 'review' && deciderOf(p) ? [waitsKey(deciderOf(p))] : [], p.missingFor && (IL.pagesToWrite || {})[p.missingFor] ? ['pagesToWrite'] : []).join(' ') + '"') + ' data-f data-f-source="' + esc(ilSourceWords(p).join('|')) + '" data-f-status="' + esc(IL_WORD[statusOf(p)] || '') + '" data-f-waits="' + esc((statusOf(p) === 'review' && deciderOf(p)) || '') + '" data-f-area="' + esc(ilArea(p)) + '"' + (p.missingFor && (IL.pagesToWrite || {})[p.missingFor] ? ' data-f-pagesToWrite="1"' : '') + '><td>' + c.forWhat + '</td><td>' + esc(ilArea(p)) + '</td>' + (NO_LAYER ? '' : '<td>' + c.file + '</td>') + '<td>' + ilSources(p) + '</td><td>' + c.decision + '</td><td class="sg-il-when">' + c.updated + '</td><td class="sg-row-go">' + USERS_ARROW + '</td></tr>';
    };
    // A row's own address: its file, the component it is missing for, or the Tokens and system rows by their name.
    var ilKey = function (p, i) { return 'doc:' + (p.tokens ? 'tokens' : p.absent ? 'system' : p.file || p.missingFor || (p.recheckFor ? 'recheck:' + p.recheckFor : null) || p.name || i); };
    var ilLaterFailed = false;
    var ilPanel = function (i, from) {
      var p = rows[i]; if (!p) return;
      // What the agents read of each page is in a later file (styleguide-files.mjs): the panel opens once it is here.
      // One that cannot be read opens it without (asked for again on the next load of the page).
      if (!ilLaterFailed && needLater('intentLayer', function (ok) { if (!ok) ilLaterFailed = true; ilPanel(i, from); })) return;
      var c = ilCellsOf(p), m = panelShell('sg-il-panel', 'Documentation');
      m._key = ilKey(p, i);
      var card = function (head, html) { return html ? '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">' + esc(head) + '</div><div class="sg-row-detail-body">' + html + '</div></div>' : ''; };
      // Its status first, then the proposal to say yes or no to, then what to do: every change it proposes in one place
      // (its drafts, what is still to write, the notes to remove or change) and one decision on all of them; then what the
      // page is and why.
      var own = !(p.tokens || p.absent || p.missingFor || p.recheckFor || p.noLayer) && Object.assign({}, p, { todo: (p.todo || []).filter(function (t) { return !REVIEW_LINE.test(t); }) });
      var todo = ilChanges(p, c.write, c.notes, own ? ilTodo(own, true) : c.todo, ilOpen(p)), task = own ? ilTodo(own) : c.todo;
      var body = card('Status', '<p>' + c.decision + '</p>') + card('Proposal', ilProposal(p)) + card('What to do', todo || task) + card('File', c.file) + card('For', c.forWhat) + card('What the agents read', c.reads) + card('Rules', ilRules(p)) + card('Why', c.why) + card('Where it goes', c.gets) + card('Last updated', c.updated ? '<p>' + c.updated + '</p>' : '');
      // A group's Approve all, Change or Drop all copies its decision on what it proposes (not what it has no ground for), said
      // beside them once copied.
      var detail = m.querySelector('.sg-row-detail');
      detail.onclick = function (e) {
        var box = e.target.closest('[data-il-review]');
        var all = e.target.closest('[data-il-all]');
        if (all && box) {
          var k = all.getAttribute('data-il-do'), g = all.closest('[data-il-group]'), shown = Array.prototype.filter.call(g.querySelectorAll('[data-il-item]'), function (it) { return !it.closest('.sg-il-quiet'); });
          copyText(ilGroupDecision(box.getAttribute('data-il-on'), g.getAttribute('data-il-all-' + k), shown.map(function (it) { return it.getAttribute('data-il-' + k); })), all, all.parentNode.querySelector('.sg-decide-said'), 'Paste it in Claude Code');
          return;
        }
        var cp = e.target.closest('[data-il-copy]'); if (cp) copyText(cp.getAttribute('data-il-copy'), cp, cp.parentNode.querySelector('.sg-decide-said'), cp.getAttribute('data-il-said'));
      };
      m.querySelector('.sg-row-detail').innerHTML = sidePanelPage({ crumbs: ['Documentation'].concat(statusOf(p) === 'review' ? ['Review', reviewTopic(p)] : statusOf(p) === 'write' ? ['Missing'] : statusOf(p) === 'remove' ? ['Remove'] : [labelOf('keep')]), title: p.tokens ? 'Tokens' : p.absent ? 'The system' : p.missingFor || p.recheckFor || p.name || p.file || p.component || 'Page', body: body });
      panelShow(m, from);
    };
    // A link to a page's panel (panel=doc:<file>) opens it.
    ilSec._openKey = function (key) { var i = rows.findIndex(function (p, j) { return ilKey(p, j) === key; }); if (i >= 0) ilPanel(i, null); return i >= 0; };
    // The rows to review, by who they wait on, as a filter of its own ("Waiting on Cards team"): a row that waits on
    // nobody answers it with nothing, so the chip offers only the teams there are.
    var ilBox = document.createElement('div'); ilBox.className = 'pg-par-card'; ilSec.appendChild(ilBox);
    ilBox.innerHTML = '<div class="pg-par-scroll"><table class="pg-par-table sg-issues sg-il' + (NO_LAYER ? ' sg-il-nofile' : '') + '"><thead><tr><th>For</th><th>Area</th>' + (NO_LAYER ? '' : '<th>File</th>') + '<th>Sources</th><th>Status</th><th>Last updated</th><th class="sg-row-go"><span class="sg-hidden-text">Open</span></th></tr></thead><tbody>' + rows.map(rowHTML).join('') + '</tbody></table></div>';
    var IL_STATUS_DOT = { write: IL_DOT.missing, review: IL_DOT.review, remove: IL_DOT['delete'], keep: IL_DOT.keep };
    var ilStatusChips = ['write', 'review', 'remove', 'keep'].map(function (k) { return { key: k, label: IL_WORD[k], dot: IL_STATUS_DOT[k], col: 'status', word: IL_WORD[k] }; });
    filterBar(ilSec, { links: sourceLinks(ilSrc.url), total: rows.length, said: 'pages',
      chips: ilStatusChips.concat([{ key: 'pagesToWrite', label: 'Pages to write, most used first', dot: 'differs' }]),
      cols: [{ key: 'status' }, { key: 'area', label: 'Area', order: IL_AREA_ORDER }, { key: 'source', label: 'Source', multi: true, order: ['Intent layer', 'Figma', 'Code'] }, { key: 'waits', label: 'Waiting on' }] });
    ilBox.addEventListener('click', function (e) { var tr = e.target.closest('tr[data-il-row]'); if (!tr || e.target.closest('a, button') || String(window.getSelection && window.getSelection()).length) return; ilPanel(+tr.getAttribute('data-il-row'), tr); });
    ilBox.addEventListener('keydown', function (e) { var tr = e.target.closest && e.target.closest('tr[data-il-row]'); if (tr && e.target === tr && e.key === 'Enter') { e.preventDefault(); ilPanel(+tr.getAttribute('data-il-row'), tr); } });
    };
  }
  // The notes no agent is given (once the For agents page) are on the Documentation page, flagged Remove, each with
  // why, how to keep it instead and whether to remove it.
  // Documentation: what the team has written about each component. What it is, how to use it, pictures of it used well
  // and badly and its role, each as the team wrote it (Figma, the code, the contract). A kind nobody wrote is said
  // missing, never guessed. A component's Documentation area shows its own; the Documentation page gathers the same
  // cards for every component, the thinnest first, so the first is the next thing to write.
  // A documentation source is named by its own label: "the intent layer (docs/x.json)" is The intent layer.
  var KNOW_FROM = function (from) { var src = /^(.+?) \([^()]*\)$/.exec(from || ''); return src && !/authored|contract/i.test(from) ? capital(src[1]) : /^Figma/.test(from || '') ? 'Figma' : /^the code$/i.test(from || '') ? 'The code' : /authored|contract/i.test(from || '') ? 'The contract' : from ? 'The last audit' : ''; };
