  // Second in the list, under the index: where someone looks first after the system itself.
  (function () { var a = nav.querySelector('a[href="#status"]'), o = nav.querySelector('a[href="#index"]'); if (a && o) o.insertAdjacentElement('afterend', a); })();
  var td = section('status', 'Status', 'How the system is doing', '');   // no line under its title: the cards say it
  var hl = td, hlBox = document.createElement('div'); hlBox.className = 'sg-health-box'; td.appendChild(hlBox);
  // Construction: how the system builds a component in Figma (DATA.construction, construction-grammar.mjs). One table, a
  // row a rule: its status (a rule only once every component follows it; to fix when most do or the team decided it; to
  // decide otherwise), how many follow it and what is to do. A row opens in the side panel: the decision to copy for a
  // rule to decide, and each component to fix with its fix to copy into Claude Code (renames are made by the engine's
  // script, --figma-fix; a name to give, layout and bindings are a person's). No exceptions: a component follows it or is
  // to fix. In no menu and no search unless the team lists it (styleguide.construction): opened by its link.
  if (DATA.construction) (function () {
    var G = DATA.construction, RULES = G.rules || [];
    hr(); if (G.listed) navLink('construction', 'construction');
    var sec = section('construction', 'System', 'Construction', '');
    // The kind of rule each is (construction-grammar.mjs → judge): every rule on names together, whatever is named; how
    // each component is built inside (the skeleton) in its own kinds.
    var AREA = { naming: 'Naming convention', layout: 'Layout', variables: 'Variables', documentation: 'Documentation', layers: 'Layers', styles: 'Styles', wiring: 'Wiring', nesting: 'Nesting', interactions: 'Interactions', placement: 'Placement', code: 'Code', architecture: 'Architecture' };
    var ST = { fix: ['differs', 'To fix'], decide: ['figma', 'To decide'], rule: ['match', 'Rule'] };
    var ORDER = { fix: 0, decide: 1, rule: 2 };
    var rows = RULES.slice().sort(function (a, b) { return ORDER[a.status] - ORDER[b.status] || b.toFix.length - a.toFix.length; });
    var dot = function (k, label) { return '<span class="pg-par-status pg-par--' + k + '"><span class="pg-par-sign" aria-hidden="true"></span>' + esc(label) + '</span>'; };
    var known = {}; COMPONENTS.forEach(function (c) { known[c.name] = 1; });
    var compHTML = function (n) { return known[n] ? '<a class="sg-uses-link" href="#' + esc(cid(n)) + '">' + esc(n) + '</a>' : esc(n); };
    var comps = function (r) { var seen = {}, out = []; r.toFix.forEach(function (t) { if (!seen[t.component]) { seen[t.component] = 1; out.push(t.component); } }); return out; };
    var plural2 = function (n) { return n === 1 ? 'component' : 'components'; };
    var todoOf = function (r) {
      var n = comps(r).length;
      if (r.status === 'rule') return '<span class="pg-missing">Nothing</span>';
      // Said as the rule the way most go, never as a question: the team confirms it, or takes the other way.
      if (r.status === 'decide') return r.ways ? 'Confirm it, or take the other way: ' + r.ways.map(function (w) { return w.follows + ' ' + (w.way === 'own' ? 'use variables made for them' : 'use shared variables'); }).join(', ') : 'Decide whether it is the rule; then ' + n + ' ' + plural2(n) + ' to fix';
      return 'Fix ' + n + ' ' + plural2(n);
    };
    var cmd = 'rms-design-system-engine';
    // The one change for every component a rule has to fix, as it is copied into Claude Code: renames the engine writes,
    // names for unnamed layers Claude proposes as one list, layout and bindings Claude walks through.
    var applyAll = function (r) {
      var cs = comps(r), n = cs.length, f = (r.toFix[0] || {}).fix || {};
      var lead = 'Make every component follow the system\'s construction rule "' + r.says + '" (' + n + ' ' + plural2(n) + ' to change: ' + cs.join(', ') + '). ';
      if (f.what) return lead + 'Run ' + cmd + ' --figma-fix --rule ' + r.id + ', then apply the script it writes.';
      if (f.layers) return lead + 'Run ' + cmd + ' --figma-fix --rule ' + r.id + ': read in Figma what each unnamed layer holds, propose one list of names, and once I approve it run it again with --names and apply the script it writes.';
      return lead + 'The engine does not change layout or variable bindings: give me one list of what to change in Figma, component by component, in the order to do it.';
    };
    var copyBtn = function (k, head, text) { return '<div class="sg-decide sg-decide--' + k + '"><strong class="sg-decide-head">' + decideMark(k) + esc(head) + '</strong>' + sysButton('button', 'Copy', ' data-cx-copy="' + esc(text) + '"') + '<span class="sg-decide-said" role="status"></span></div>'; };
    var rowHTML = function (r, i) {
      var n = comps(r).length;
      return '<tr class="sg-row-open" tabindex="0" data-cx-row="' + i + '" data-chip="' + r.status + '"><td><strong>' + esc(r.says) + '</strong></td><td>' + esc(AREA[r.area] || capital(r.area)) + '</td><td>' + r.follows + ' of ' + r.of + '<span class="pg-par-val">' + Math.round(r.follows / r.of * 100) + '%</span></td><td>' + todoOf(r) + '</td><td>' + dot(ST[r.status][0], ST[r.status][1]) + '</td><td class="sg-row-go">' + USERS_ARROW + '</td></tr>';
    };
    var cxKey = function (r) { return 'cx:' + r.id; };
    var panel = function (i, from) {
      var r = rows[i]; if (!r) return;
      var m = panelShell('sg-cx-panel', 'Construction'); m._key = cxKey(r);
      var card = function (head, html) { return html ? '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">' + esc(head) + '</div><div class="sg-row-detail-body">' + html + '</div></div>' : ''; };
      var cs = comps(r), byC = {}, n = cs.length;
      r.toFix.forEach(function (t) { (byC[t.component] = byC[t.component] || []).push(t); });
      var WAY_HEAD = { own: 'Variables made for each component', shared: 'Shared variables' };
      var lower = function (x) { return String(x).replace(/^\w/, function (c) { return c.toLowerCase(); }); };
      var pct = Math.round(r.follows / r.of * 100);
      // What the engine suggests, from what most of the system already does; one decision for every component.
      var suggest, decide;
      if (r.status === 'rule') { suggest = 'Every component follows it. Nothing to change.'; decide = ''; }
      else if (r.ways) {
        var best = r.ways[0], other = r.ways[1];
        suggest = '<p class="sg-il-line"><strong>' + esc(WAY_HEAD[best.way]) + '</strong>: ' + esc(best.follows + ' of ' + r.of + ' components already do this (' + lower(best.says) + ').') + '</p><p class="sg-il-line"><span class="pg-par-val">' + esc(other.follows + ' go the other way (' + lower(other.says) + '). Choose one; the others are then changed to match.') + '</span></p>';
        decide = '<div class="sg-decide-grid">' + r.ways.map(function (w, k) { return copyBtn(k ? 'change' : 'approve', (k ? '' : 'Suggested: ') + WAY_HEAD[w.way], 'The system\'s construction rule: "' + w.says + '". Run ' + cmd + ' --construction ' + r.id + ' ' + w.way + '.'); }).join('') + '</div>';
      }
      else if (r.status === 'decide') {
        suggest = '<p class="sg-il-line">' + esc(r.follows + ' of ' + r.of + ' components (' + pct + '%) already do this.') + '</p><p class="sg-il-line">' + (pct >= 50 ? '<strong>' + esc('Suggested: make it the rule, and change the ' + n + ' that don\'t.') + '</strong>' : esc('Fewer than half do: make it the rule only if it is how the system should be built; then ' + n + ' are to change.')) + '</p>';
        decide = '<div class="sg-decide-grid">' + copyBtn('approve', 'Make it the rule', 'Make it a construction rule of the system: "' + r.says + '". Run ' + cmd + ' --construction ' + r.id + ' yes.') + copyBtn('drop', 'Not a rule', 'It is not a construction rule of the system: "' + r.says + '". Run ' + cmd + ' --construction ' + r.id + ' no.') + '</div>';
      }
      else {
        suggest = '<p class="sg-il-line">' + esc(r.follows + ' of ' + r.of + ' components (' + pct + '%) already do this.') + '</p><p class="sg-il-line"><strong>' + esc('Suggested: change the ' + n + ' ' + plural2(n) + ' that don\'t, so every one does.') + '</strong></p>';
        decide = '<div class="sg-decide-grid">' + copyBtn('approve', 'Apply to all ' + n, applyAll(r)) + '</div>';
      }
      var list = n ? '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">' + esc('Components it changes (' + n + ')') + '</div><div class="pg-par-scroll"><table class="pg-par-table"><thead><tr><th>Component</th><th>What changes</th></tr></thead><tbody>'
        + cs.map(function (c) { return '<tr><td>' + compHTML(c) + '</td><td>' + byC[c].map(function (t) { return '<p class="sg-il-line"><span>' + esc((t.fix && t.fix.say) || t.value) + '</span></p>'; }).join('') + '</td></tr>'; }).join('') + '</tbody></table></div></div>' : '';
      // A family's rule: every way its components are built, how many each, so the choice is seen whole.
      var fam = /^family-/.test(r.id) ? (G.families || []).filter(function (x) { return 'family-' + x.family === r.id; })[0] : null;
      var ways = fam ? '<table class="pg-par-table"><thead><tr><th>Built as</th><th>Components</th></tr></thead><tbody>' + fam.shapes.map(function (x) { return '<tr><td>' + esc(x[0]) + '</td><td>' + x[1] + '</td></tr>'; }).join('') + '</tbody></table>' : '';
      var body = card('Status', '<p>' + dot(ST[r.status][0], ST[r.status][1]) + '</p>') + card('Suggestion', suggest) + card('Decision', decide) + (ways ? '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">' + esc('How the ' + fam.components + ' in the family are built') + '</div><div class="pg-par-scroll">' + ways + '</div></div>' : '') + list;
      m.querySelector('.sg-row-detail').onclick = function (e) { var cp = e.target.closest('[data-cx-copy]'); if (cp) copyText(cp.getAttribute('data-cx-copy'), cp, cp.parentNode.querySelector('.sg-decide-said'), 'Paste it in Claude Code'); };
      m.querySelector('.sg-row-detail').innerHTML = sidePanelPage({ crumbs: ['Construction', ST[r.status][1]], title: r.says, body: body });
      panelShow(m, from);
    };
    sec.insertAdjacentHTML('beforeend', '<div class="pg-par-card"><div class="pg-par-scroll"><table class="pg-par-table sg-issues sg-cx-table"><colgroup><col class="sg-cx-rule"><col class="sg-cx-col"><col class="sg-cx-col"><col class="sg-cx-col"><col class="sg-cx-col"><col></colgroup><thead><tr><th>Rule</th><th>Area</th><th>Follow it</th><th>To do</th><th>Status</th><th class="sg-row-go"><span class="sg-hidden-text">Open</span></th></tr></thead><tbody>' + rows.map(rowHTML).join('') + '</tbody></table></div></div>');
    var open = function (tr) { if (tr) panel(+tr.getAttribute('data-cx-row'), tr); };
    sec.addEventListener('click', function (e) { if (e.target.closest('a, button')) return; open(e.target.closest('tr[data-cx-row]')); });
    sec.addEventListener('keydown', function (e) { var tr = e.target.closest && e.target.closest('tr[data-cx-row]'); if (tr && e.target === tr && e.key === 'Enter') { e.preventDefault(); open(tr); } });
    sec._openKey = function (key) { var i = rows.findIndex(function (r) { return cxKey(r) === key; }); if (i >= 0) panel(i, null); return i >= 0; };
    var nOf = function (st) { return rows.filter(function (r) { return r.status === st; }).length; };
    pageBar(sec, { chips: [{ key: 'fix', label: 'To fix', n: nOf('fix'), dot: 'differs' }, { key: 'decide', label: 'To decide', n: nOf('decide'), dot: 'figma' }, { key: 'rule', label: 'Rules', n: nOf('rule'), dot: 'match' }].filter(function (c) { return c.n; }) });
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
    var ST = { waiting: ['figma', 'Waiting to be made'], made: ['match', 'Made as said'], 'not as said': ['differs', 'Not as said'] };
    var dot = function (k, label) { return '<span class="pg-par-status pg-par--' + k + '"><span class="pg-par-sign" aria-hidden="true"></span>' + esc(label) + '</span>'; };
    var known = {}; COMPONENTS.forEach(function (c) { known[c.name] = 1; });
    var compHTML = function (n) { return known[n] ? '<a class="sg-uses-link" href="#' + esc(cid(n)) + '/history">' + esc(n) + '</a>' : esc(n); };
    var SIGN = { added: '+', removed: '−', renamed: '↻', moved: '→', changed: '~' };
    var SECT = { skeleton: 'Its layers', architecture: 'Axes, options and properties', variables: 'Variables' };
    var diffTable = function (d) {
      var rows = [];
      ['skeleton', 'architecture', 'variables'].forEach(function (k) { (d && d[k] || []).forEach(function (x) { rows.push('<tr><td>' + esc(SECT[k]) + '</td><td><span aria-hidden="true">' + esc(SIGN[x.change] || '·') + '</span> ' + esc(capital(x.change)) + ' ' + esc(x.what) + '</td><td>' + (x.from != null ? '<code>' + esc(x.from) + '</code>' : '') + (x.from != null && x.to != null ? ' → ' : '') + (x.to != null ? '<code>' + esc(x.to) + '</code>' : '') + '</td></tr>'); }); });
      return rows.length ? '<div class="pg-par-scroll"><table class="pg-par-table"><thead><tr><th>Part</th><th>What</th><th>Before → after</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '<p class="sg-il-line">Nothing changes.</p>';
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
    pageBar(sec, { chips: [{ key: 'not as said', label: 'Not as said', n: nOf('not as said'), dot: 'differs' }, { key: 'waiting', label: 'Waiting', n: nOf('waiting'), dot: 'figma' }, { key: 'made', label: 'Made as said', n: nOf('made'), dot: 'match' }].filter(function (c) { return c.n; }) });
  })();
  // History: every change gathered by the release it shipped in, newest first, each a table of what was done and what
  // it affects: the code's commits, each read of Figma that changed what Figma says of a component, and what the team
  // decided in that time (a component, a pattern, a template, a foundation, the system), what it ruled out and why.
  // Chips show the code's changes, Figma's, the decisions, or all of them (each row tagged with which).
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
    var dayOf = function (g) { var t = Date.parse(g.k && g.on ? g.on : g.at); return isNaN(t) ? 0 : t; };
    order.sort(function (a, b) { return dayOf(b) - dayOf(a) || releaseOrder(a, b); });
    // The components a change affects: links the table turns into pills (pillLinks), the first ones shown, the rest one
    // click away.
    var PILLS_SHOWN = 10;
    var pillsHTML = function (names, area) {
      return names.map(function (n, i) { return '<a href="#' + esc(cid(n)) + (area ? '/' + area : '') + '"' + (i >= PILLS_SHOWN ? ' hidden' : '') + '>' + esc(n) + '</a>'; }).join(' ') +
        (names.length > PILLS_SHOWN ? ' ' + sysButton('button', (names.length - PILLS_SHOWN) + ' more', ' data-pills-more') : '');
    };
    // What changed in Figma, said plainly: a property's name without the word, a text's old and new words quoted.
    var figmaChange = function (t) {
      t = String(t).replace(/^property /, '');
      var m = /^(.+?) (TEXT|BOOLEAN|VARIANT|INSTANCE_SWAP|SLOT)(?: · (.*))? → (?:TEXT|BOOLEAN|VARIANT|INSTANCE_SWAP|SLOT)(?: · (.*))?$/.exec(t);
      return m ? m[1] + ' "' + (m[3] || '') + '" → "' + (m[4] || '') + '"' : t;
    };
    var isFirst = function (c) { return c.changed.length === 1 && /first time/.test(c.changed[0]); };
    var figmaRows = function (x) {
      var first = x.comps.filter(isFirst), changed = x.comps.filter(function (c) { return !isFirst(c); });
      // What changed, then the components read for the first time, named; the commit that saved the read under the last.
      var rows = changed.slice().sort(function (a, b) { return a.name < b.name ? -1 : 1; }).map(function (c) { return ['<p class="sg-il-line">' + esc(c.changed.map(figmaChange).join('; ')) + '</p>', pillsHTML([c.name], 'history')]; });
      var names = first.map(function (c) { return c.name; }).sort();
      // The components it read for the first time are named once, as their pills under Affects.
      if (names.length) rows.push(['<p class="sg-il-line">Read for the first time</p>', pillsHTML(names, 'history')]);
      var sha = x.r.url ? '<a class="sg-uses-link" href="' + esc(x.r.url) + '" target="_blank" rel="noopener"><code>' + esc(x.r.short) + '</code></a>' : '<code>' + esc(x.r.short || '') + '</code>';
      if (rows.length) rows[rows.length - 1][0] += '<p class="sg-il-line"><span class="pg-log-date">Saved in ' + sha + '</span></p>';
      return rows.map(function (r) { return '<tr data-chip="figma"><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('');
    };
    // A read of Figma is dated, never released: Figma, and the day it was read.
    var figmaHead = function (g) { return '<span class="sg-log-tag">Figma</span>' + esc(String(g.read.r.date).slice(0, 10)); };
    // A change to the intent layer: what it changed, the commit that made it, and the components its pages document.
    var layerSha = function (x) { return !x.to ? '' : x.url ? '<a class="sg-uses-link" href="' + esc(x.url) + '" target="_blank" rel="noopener"><code>' + esc(x.to.slice(0, 8)) + '</code></a>' : '<code>' + esc(x.to.slice(0, 8)) + '</code>'; };
    var layerWhat = function (x) { return x.pages.length ? plural(x.pages.length, 'page', 'pages') + ' changed' : plural(x.files || 0, 'file', 'files') + ' changed, none of them a page'; };
    var layerRows = function (x) {
      // A page whose component is under Affects is named there only: the others (a pattern, a foundation) are named here.
      var others = x.pages.filter(function (p) { return !x.components.some(function (n) { return n.toLowerCase().replace(/[^a-z0-9]/g, '') === String(p).toLowerCase().replace(/[^a-z0-9]/g, ''); }); });
      return '<tr data-chip="intent"><td><p class="sg-il-line"><strong>' + esc(layerWhat(x)) + '</strong></p>' + (others.length ? '<p class="sg-il-line"><span class="pg-par-val">' + esc(others.join(', ')) + '</span></p>' : '') +
        (x.to ? '<p class="sg-il-line"><span class="pg-log-date">Committed in ' + layerSha(x) + '</span></p>' : '') + '</td><td>' + (x.components.length ? pillsHTML(x.components, 'documentation') : '<span class="pg-log-date">No component</span>') + '</td></tr>';
    };
    var decisionRow = function (d) {
      // A page of the intent layer named like a component of the system opens that component's Documentation.
      var pageComp = !d.component && d.page && COMPONENTS.some(function (c) { return c.name === d.page; }) ? d.page : null;
      var about = d.component && COMPONENTS.some(function (c) { return c.name === d.component; }) ? '<a class="sg-uses-link" href="#' + esc(cid(d.component)) + '/history">' + esc(d.component) + '</a>'
        : pageComp ? '<a class="sg-uses-link" href="#' + esc(cid(pageComp)) + '/documentation">' + esc(pageComp) + '</a>'
        : d.url ? '<a class="sg-uses-link" href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.page || d.about) + '</a>' : esc(d.page || d.component || 'The system');
      // A lesson (a correction a person made) and a rule from repeated findings say what each became, and a lesson that
      // came back says which guard did not hold.
      var tag = d.kind === 'lesson' ? 'Lesson' : d.kind === 'rule' || d.kind === 'proposed' ? 'Rule' : d.kind === 'signed' ? 'Sign-off' : 'Decision';
      return '<tr data-chip="decisions"><td><p class="sg-il-line"><span class="sg-log-tag">' + tag + '</span> <strong>' + esc(d.what) + '</strong></p>' +
        (d.ruledOut && d.ruledOut.length ? '<p class="sg-il-line">Ruled out ' + esc(d.ruledOut.join(', ')) + '.</p>' : '') + (d.why ? '<p class="sg-il-line">' + esc(capital(d.why).replace(/\.?$/, '.')) + '</p>' : '') +
        (d.became ? '<p class="sg-il-line">' + esc(d.became.replace(/\.?$/, '.')) + '</p>' : '') + (d.back ? '<p class="sg-il-line">' + esc(capital(d.back).replace(/\.?$/, '.')) + '</p>' : '') +
        // Its component changed since it was decided: it still stands, to review again.
        (d.review ? '<p class="sg-il-line"><span class="pg-par-val">' + esc(d.review) + '</span></p>' : '') +
        // A sign-off: who made the change and who reviewed it, never the same one.
        (d.author ? '<p class="sg-il-line">' + esc('Made by ' + d.author + ', reviewed by ' + (d.reviewer || d.by) + '.') + '</p>' : '') +
        '<p class="sg-il-line"><span class="pg-log-date">' + esc(capital(d.said) + (d.by ? ' by ' + d.by : '') + (d.at ? ' on ' + String(d.at).slice(0, 10) : '')) + '</span></p></td><td>' + about + '</td></tr>';
    };
    var box = document.createElement('div'); box.className = 'pg-cards'; wn.appendChild(box);
    // One row per issue (the team's unit of work: its commits, whatever each changed), then what it affects: the
    // components its commits changed (none for a change outside them). A commit made for no issue is a row of its own.
    var codeRow = function (t) {
      var comps = []; t.items.forEach(function (x) { x.comps.forEach(function (n) { if (comps.indexOf(n) < 0) comps.push(n); }); });
      // Where else its commits changed things, once each (the same part named by two commits of an issue: once).
      var where = [], seenW = {}; t.items.forEach(function (x) { (x.r.where || []).forEach(function (w) { var k = w.kind + ':' + w.label + ':' + (w.names || []).join(','); if (!seenW[k]) { seenW[k] = 1; where.push(w); } }); });
      // A row for no issue leads with the merge or pull request it came by, when there is one: only a commit made
      // straight on the branch says no issue.
      var first = t.items[0].r, lead = t.ticket ? '' : '<p class="sg-il-line"><span class="pg-log-date">' + (first.request ? requestLink(first.request) : 'No issue') + '</span></p><p class="sg-il-line">';
      var affects = (comps.length ? pillsHTML(comps.sort()) : '') + (where.length ? (comps.length ? ' ' : '') + whereHTML(where) : '');
      var cell = lead + ticketHTML(t, function (x) { return commitLine(x.r); }) + (t.ticket ? '' : '</p>');
      return '<tr data-chip="code"><td>' + cell + '</td><td>' + (affects || '<span class="pg-log-date">No component</span>') + '</td></tr>';
    };
    var when = function (x) { var t = Date.parse(x); return isNaN(t) ? 0 : t; };
    // A card's head: the code's release (or the code merged since the last one), a read of Figma's day, or the day of
    // the decisions it holds.
    var cardHead = function (g) {
      if (g.read) return figmaHead(g);
      if (g.layer) return '<span class="sg-log-tag">Intent layer</span>' + esc(String(g.layer.at || '').slice(0, 10));
      if (g.day) return esc(g.day);
      var n = byTicket(g.commits, function (x) { return x.r; }).length; return '<span class="sg-log-tag">Code</span>' + releaseHead(g) + '  ·  ' + n + (n === 1 ? ' issue' : ' issues');
    };
    box.innerHTML = order.map(function (g) {
      // Its decisions, reads of Figma and issues together, newest first, each with its own date.
      var rows = (g.decisions || []).map(function (d) { return { at: String(d.at || ''), html: decisionRow(d) }; })
        .concat(byTicket(g.commits, function (x) { return x.r; }).map(function (t) { return { at: String(t.items[0].r.date || ''), html: codeRow(t) }; }));
      rows.sort(function (a, b) { return when(b.at) - when(a.at); });
      return '<div class="pg-inspect"><div class="pg-inspect-head">' + cardHead(g) + '</div><table class="sg-log"><thead><tr><th scope="col">What</th><th scope="col">Affects</th></tr></thead><tbody>' + (g.read ? figmaRows(g.read) : g.layer ? layerRows(g.layer) : rows.map(function (r) { return r.html; }).join('')) + '</tbody></table></div>';
    }).join('');
    // The code, Figma, the decisions or all: a chip for each kind the page has, when it has two, and a release with
    // nothing of the kind chosen out of the way (read from the page itself: box is a var another page reuses).
    var kinds = [['code', 'Code'], ['figma', 'Figma'], ['intent', 'Intent layer'], ['decisions', 'Decisions']].map(function (x) { return { key: x[0], label: x[1], n: box.querySelectorAll('tr[data-chip="' + x[0] + '"]').length }; }).filter(function (c) { return c.n; });
    if (kinds.length > 1) pageBar(wn, { chips: kinds });
    box.addEventListener('click', function (e) { var b = e.target.closest('[data-pills-more]'); if (!b) return; Array.prototype.forEach.call(b.parentNode.querySelectorAll('a[hidden]'), function (p) { p.hidden = false; }); b.remove(); });
    wn.addEventListener('sg-chip', function (e) { Array.prototype.forEach.call(e.currentTarget.querySelectorAll('.pg-inspect'), function (card) { card.hidden = !card.querySelector('tbody tr:not([hidden])'); }); });
  }
  // Every part of the documentation no agent is given, whatever its source: why, what to do so it is, remove it or not.
  var leftHTML = function (list) { return list.map(function (n) { return '<div class="sg-il-not"><p class="sg-il-line"><strong>' + esc(capital(n.what || n.text)) + '</strong>' + (n.from ? '<span class="pg-par-val">' + esc(capital(n.from)) + '</span>' : '') + '</p><p class="sg-il-line">' + esc(n.why) + '</p>' + (n.fix ? '<p class="sg-il-line"><span class="sg-il-label">To use it</span> ' + esc(n.fix) + '</p>' : '') + (n.remove ? '<p class="sg-il-line"><span class="sg-il-label">Remove it?</span> ' + esc(n.remove) + '</p>' : '') + '</div>'; }).join(''); };
  // A page's head, the same on every page that has one: its title stays at the top (the template's sticky title), what
  // it links to at its top right, and its chips in the bar that sticks under the title with the template's spacing (as
  // the Status page's). chips: [{ key, label, n, dot }] (dot: the status kind its colour comes from: differs, figma,
  // match, none), All first; a click shows only the table rows with that key (data-chip on each row). One table per
  // page: the chips filter its rows, never split it.
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
      Array.prototype.forEach.call(sec.querySelectorAll('tr[data-chip]'), function (tr) { tr.hidden = k !== 'all' && tr.getAttribute('data-chip') !== k && (' ' + (tr.getAttribute('data-chip-group') || '') + ' ').indexOf(' ' + k + ' ') < 0; });   // a chip shows its own rows, or a group of them (data-chip-group, one or several)
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
    var ilSources = function (p) { if (p.tokens) return 'Figma, Intent layer'; if (p.absent) return 'Intent layer';
      if (p.noLayer) { var c0 = docComp(p), w0 = []; try { docIssueRows(c0).forEach(function (r) { if (r.st === 'done') srcNames(r.src || []).forEach(function (x) { if (x && w0.indexOf(x) < 0) w0.push(x); }); }); } catch (e) { /* none */ } return w0.length ? esc(w0.join(', ')) : '<span class="pg-missing">None</span>'; } var r = p.reads || {}, out = []; if (!p.missingFor && IL_READ.some(function (k) { return (r[k[0]] || []).length; })) out.push('Intent layer'); ilOthersOf(p).forEach(function (o) { var w = /^Figma/.test(o.source) ? 'Figma' : o.source; if (out.indexOf(w) < 0) out.push(w); }); return out.length ? esc(out.join(', ')) : '<span class="pg-missing">None</span>'; };
    // Everything a page asks to change, in one place, in groups each under its own heading and count: New text for the
    // page (its drafts, each once, beside where it comes from), Changes to rules (the guards and rewrites its rules
    // propose, rule-checks.mjs: one with nothing but the engine's own reading behind it folded away, No its answer until
    // a person says otherwise), and Other changes (what is still to write, a part's page to move, the notes no agent
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
    // A group: its heading and count, its items, those folded away (quiet, which its actions leave as they are), then its
    // three actions below them all: Approve all, Change, Drop all. Each copies its decision on what the group shows.
    var IL_DO = [['approve', 'Approve all', 'Approve'], ['change', 'Change', 'Change'], ['drop', 'Drop all', 'Drop']];
    var ilGroup = function (key, head, items, all, quiet) {
      quiet = quiet || []; var n = items.length + quiet.length; if (!n) return '';
      all = all || {};
      var said = function (k) { return all[k] ? ' data-il-all-' + k + '="' + esc(all[k]) + '"' : ''; };
      var acts = items.length ? '<div class="sg-il-group-actions" role="group" aria-label="' + esc(head) + '">' + IL_DO.map(function (d) {
        return sysButton('button', items.length === 1 || d[0] === 'change' ? d[2] : d[1] + ' ' + items.length, ' data-il-all="' + key + '" data-il-do="' + d[0] + '" title="' + esc('Copies the decision: paste it in Claude Code') + '"', 'sg-il-act', null, decideMark(d[0]));
      }).join('') + '<span class="sg-decide-said" role="status"></span></div>' : '';
      return '<div class="sg-il-group-decide" data-il-group="' + key + '"' + said('approve') + said('change') + said('drop') + '><div class="sg-il-group-head"><strong>' + esc(head + ' (' + n + ')') + '</strong></div>' + items.join('')
        + (quiet.length ? '<details class="sg-il-quiet"><summary>' + esc(quiet.length + (quiet.length === 1 ? ' more the engine has no ground for: No, unless you say otherwise' : ' more the engine has no ground for: No to each, unless you say otherwise')) + '</summary>' + quiet.join('') + '</details>' : '') + acts + '</div>';
    };
    // A group's decision, in the person's words: the group's own words for it when it has them (all: "Approve all 3
    // drafts"), else each item's in turn (steps: those the group shows, never what is folded away).
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
      return '<tr class="sg-row-open" tabindex="0" data-il-row="' + i + '" data-chip="' + esc(isKeep(p) ? 'keep' : p.tokens ? 'tokens' : p.absent ? 'system' : p.missingFor ? 'missing' : p.action === 'keep' ? 'left' : p.action) + '"' + (isKeep(p) ? '' : ' data-chip-group="' + [({ review: 'toReview', write: 'toWrite', remove: 'toRemove' })[statusOf(p)]].concat(needsRemove(p) && statusOf(p) !== 'remove' ? ['toRemove'] : [], statusOf(p) === 'review' && deciderOf(p) ? [waitsKey(deciderOf(p))] : [], p.missingFor && (IL.pagesToWrite || {})[p.missingFor] ? ['pagesToWrite'] : []).join(' ') + '"') + '><td>' + c.forWhat + '</td>' + (NO_LAYER ? '' : '<td>' + c.file + '</td>') + '<td>' + ilSources(p) + '</td><td>' + c.decision + '</td><td class="sg-il-when">' + c.updated + '</td><td class="sg-row-go">' + USERS_ARROW + '</td></tr>';
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
      // A group's Approve all, Change or Drop all copies its decision on what it shows (not what is folded away), said
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
    var counts = { keep: rows.filter(isKeep).length, write: rows.filter(function (p) { return statusOf(p) === 'write'; }).length, remove: rows.filter(needsRemove).length };
    // The rows to review, by who they wait on: one chip each ("Waiting on Cards team 3"), most first.
    var waits = {}; rows.forEach(function (p) { var d = statusOf(p) === 'review' && deciderOf(p); if (d) waits[d] = (waits[d] || 0) + 1; });
    var waitChips = Object.keys(waits).sort(function (a, b) { return waits[b] - waits[a] || a.localeCompare(b); }).map(function (d) { return { key: waitsKey(d), label: 'Waiting on ' + d, n: waits[d], dot: 'figma' }; });
    pageBar(ilSec, { links: sourceLinks(ilSrc.url), chips: (function () { var toReview = rows.filter(needsReview).length;
      var toStart = rows.filter(function (p) { return p.missingFor && (IL.pagesToWrite || {})[p.missingFor]; }).length;
      return (toReview ? [{ key: 'toReview', label: 'Review', n: toReview, dot: 'figma' }] : []).concat(waitChips).concat(toStart ? [{ key: 'pagesToWrite', label: 'Pages to write, most used first', n: toStart, dot: 'differs' }] : []).concat(counts.write ? [{ key: 'toWrite', label: 'Missing', n: counts.write, dot: 'differs' }] : []).concat(counts.remove ? [{ key: 'toRemove', label: 'Remove', n: counts.remove, dot: 'differs' }] : []).concat(counts.keep ? [{ key: 'keep', label: labelOf('keep'), n: counts.keep, dot: IL_DOT.keep }] : []); })(), total: rows.length });
    var ilBox = document.createElement('div'); ilBox.className = 'pg-par-card'; ilSec.appendChild(ilBox);
    ilBox.innerHTML = '<div class="pg-par-scroll"><table class="pg-par-table sg-issues sg-il' + (NO_LAYER ? ' sg-il-nofile' : '') + '"><thead><tr><th>For</th>' + (NO_LAYER ? '' : '<th>File</th>') + '<th>Sources</th><th>Status</th><th>Last updated</th><th class="sg-row-go"><span class="sg-hidden-text">Open</span></th></tr></thead><tbody>' + rows.map(rowHTML).join('') + '</tbody></table></div>';
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
