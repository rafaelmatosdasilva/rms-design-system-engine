  // ── Its accessibility: its role, what it owes (each with its WCAG criterion), the contrast of its text as drawn, and
  // what the last browser check found on it ──────────────────────────────────────────────────────────────────────────

  // Accessibility, one table like Parity's: each thing asked of it in plain words, its status as a sign and the
  // system's colour (done, to fix, not checked yet, not needed) and its WCAG criterion. What to fix first; then what
  // the browser finds on the variant shown (tried live) and its text contrast; then what its role asks for, checked by
  // the last audit in a browser. A count of each above it.
  var A11Y = { done: ['✓', 'Done', 'match'], todo: ['✕', 'To fix', 'differs'], check: ['!', 'To check', 'figma'], none: ['–', 'Not needed', 'none'] };
  // from: where the row's information is read (a Figma annotation, the contract, the code, this page, the last audit).
  function a11yRow(st, what, html, wcag, from) {
    var x = A11Y[st];
    return '<tr data-status="' + st + '"><td class="pg-par-type">' + esc(what) + '</td><td>' + html + '</td>' +
      '<td><span class="pg-par-status pg-par--' + x[2] + '"><span class="pg-par-sign" aria-hidden="true">' + x[0] + '</span>' + esc(x[1]) + '</span></td>' +
      '<td class="pg-par-at">' + esc(wcag || '') + '</td>' + (from === undefined ? '' : '<td class="pg-a11y-from">' + esc(from) + '</td>') + '</tr>';
  }
  // Where a status was checked, said plainly under it.
  var FROM_PAGE = 'Tested now', FROM_AUDIT = 'Tested at the last audit';
  // The last audit's test, by its day: Tested on 15 Oct (the year only when it is not this one).
  var auditOn = function (at) { var d = new Date(at); if (!at || isNaN(d)) return FROM_AUDIT; return 'Tested on ' + d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
  // One Accessibility table, by WCAG criterion, the same table as Parity's and the Status page's: only the criteria that
  // apply to the component (a page's own, video and sound it does not play, what it has nothing for, are left out), to
  // fix first, then to check, then done; each with what Figma states, what was found, what to do, who acts, its status
  // and when and where it was read. What a criterion means opens from its name. Above it a count of each, and when the
  // last audit ran; in it, as rows of their own, what Figma and the team wrote that no check reads.
  function a11yHTML(c) {
    var a = c.a11y; if (!a) return '';
    return '<div class="pg-doc pg-par pg-a11y"><div class="pg-par-sum pg-a11y-sum"></div><p class="sg-info pg-wcag-note pg-a11y-note"></p>' + issueTableHTML([], 'pg-a11y-rows', '', 'Accessibility') + '</div>';
  }
  // What no check reads, each a row: each Figma annotation on it a check does not read (with the wording one reads, when
  // the engine can tell what it means) and the team's guidelines, which the agents read as design intent. One that states
  // accessibility in a way a check could read is to check (written the way a check reads it); the rest needs nothing.
  function unreadRows(c) {
    return ((c.a11y || {}).sources || []).filter(function (x) { return x.st === 'agents'; }).map(function (x) {
      var figma = /annotation|Figma/.test(x.from);
      return { key: c.name + '\u0000u:' + x.from + ':' + x.what, area: 'Accessibility', kind: x.from, figma: figma ? esc(x.what) : '', code: '', todo: (figma ? '' : esc(x.what) + '<span class="pg-todo">') + unreadFix(x) + (figma ? '' : '</span>'),
        who: x.todo ? (/annotation/.test(x.from) ? WHO.figma : WHO.person) : '', st: x.todo ? 'check' : 'none', rel: 'Read by the agents, no check uses it', at: DATA.builtAt || null, src: [x.from] };
    });
  }
  function unreadFix(x) { return (x.kind && x.kind !== 'accessibility' ? 'Nothing: its Figma category (' + esc(x.kind.charAt(0).toUpperCase() + x.kind.slice(1)) + ') makes it design intent, which the agents read.' : x.wording ? 'Write it in Figma as ' + esc(x.wording) + ' (--figma-edits lists it).' : /annotation/.test(x.from) ? 'Write it as Role: button, Alt: what it shows, Heading level 2, Escape closes, the arrow keys move, Enter and Space activate, or Role: label on a layer.' : 'Nothing: the agents read it as design intent.'); }
  // Where a finding or a duty is, said with it: the component, its variant or the part it is on.
  function figmaOf(c) { var l = (c.links || []).find(function (x) { return /figma/i.test(x.label); }); return l ? l.url : null; }
  // What the data says about the component, each finding or duty as an item under its criterion: what the audit found
  // (from the code capture and in a browser), what its code does, its role and what that role and Figma's notes ask.
  // { sc, label (as WCAG names it), st, html, from }
  // A text that does not name the component starts with it ("On badge, ...").
  // A token's value checked against the code ("[color/Light] base/x/color → --base-x-color: CSS var not declared"): what
  // Figma has (the token, its mode) and what the code has (not declared, else its variable), each in a few words.
  function sidesOf(what) {
    var m = /^\[([^\]\/]+)\/([^\]]+)\]\s+(\S+)\s+→\s+(--[\w-]+)(?::\s*(.+))?$/.exec(String(what || '').trim()); if (!m) return null;
    var tok = m[3].replace(/^(advanced|base|semantic|primitives?|core|global)\//i, ''), mode = m[2] === '-' ? '' : m[2];
    return { figma: '<code>' + esc(tok) + '</code>' + (mode ? '<span class="pg-par-val">' + esc(mode) + '</span>' : ''),
      code: /not declared/i.test(m[5] || '') ? 'Not declared' : '<code>' + esc(m[4]) + '</code>' };
  }
  function onWhat(c, text) {
    var t = String(text || '');
    return new RegExp('(^|[^\\w-])' + c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^\\w-]|$)', 'i').test(t) ? esc(t.replace(/^\w/, function (k) { return k.toUpperCase(); })) : 'On <b>' + esc(c.name) + '</b>, ' + esc(t.replace(/^[A-Z](?=[a-z]*[\s,])/, function (k) { return k.toLowerCase(); }));
  }
  function scOfLabel(label) { var m = /WCAG (\d+\.\d+\.\d+)/.exec(label || ''); return m ? m[1] : null; }
  function a11yStaticItems(c) {
    var a = c.a11y || {}, ch = a.checked, ran = ch && !ch.notRead, items = [];
    // html: what was found (or what is asked); todo: what to do about it, when said apart; who: who acts, when said.
    var add = function (label, st, html, from, todo, who, fresh) { var sc = scOfLabel(label); if (sc) items.push({ sc: sc, label: label, st: st, html: html, from: from, todo: todo || '', who: who || '', fresh: !!fresh }); };
    (c.a11yFindings || []).forEach(function (x) {
      var contrast = /contrast/i.test((x.check || '') + ' ' + (x.what || ''));
      add(x.wcag || (contrast ? 'WCAG 1.4.3 Contrast (Minimum) (AA)' : ''), 'todo', onWhat(c, x.plain || x.what), 'Found in the code by the last audit', x.todo ? esc(doWhat(x.todo)) : '', x.todo ? (WHO[x.who] || WHO.both) + teamNote(c.name) : '', x.new);
    });
    if (ran) ch.issues.forEach(function (i) { add(i.wcag, 'todo', onWhat(c, i.title + '.') + placesTag(i.items || i.details.map(placeOf)), auditOn(ch.at), esc(capital(i.fix))); });
    var stat = {};
    (a.static || []).forEach(function (f) { (stat[f.kind] = stat[f.kind] || []).push(f); });
    Object.keys(stat).forEach(function (k) { add(wcagLabelOf(wcagScOf(k)), 'todo', esc(wcagTitle(k, stat[k].length) + '.') + placesTag(stat[k].map(function (f) { var p = placeOf(f.desc); p.where = f.file + ':' + f.line; return p; })), 'Its code', esc(wcagFix(k, stat[k][0].fix))); });
    // Its role: what it is and what that role and Figma's notes ask of it (the first duty says what it is).
    if (!a.role) add('WCAG 4.1.2 Name, Role, Value (A)', 'check', 'The role of ' + esc(c.name) + ' is not stated yet.', 'From Figma, once it is annotated', 'In Figma, add an annotation to the ' + esc(c.name) + ' component' + (figmaOf(c) ? ' (<a class="sg-uses-link" href="' + esc(figmaOf(c)) + '" target="_blank" rel="noopener">open it in Figma</a>)' : '') + ' that says its role in the form Role: name (Role: dialog, Role: button, Role: list), and its duties are listed here.', WHO.figma);
    // A duty fails when the audit found its own kind of problem (the role's markup, a behaviour, a part, a name, the
    // keys), not when another finding shares its criterion.
    var DUTY = /^(rolecontract|behaviour|partrole|annotation|semantics|name|keyboard|activate|arrows|escape|focusreturn)$/;
    (a.expects || []).forEach(function (x) {
      var failed = ran && ch.issues.some(function (i) { return i.wcag && x.wcag && i.wcag === x.wcag && DUTY.test(i.kind); });
      add(x.wcag, !ran ? 'check' : failed ? 'todo' : 'done', (!ran || failed ? onWhat(c, x.says) : esc(x.says.replace(/^\w/, function (k) { return k.toUpperCase(); }))) + (ran ? '' : ' Tried once the audit runs it in a browser.'), x.from || '', failed ? esc('Change the code so ' + x.says.replace(/^\w/, function (k) { return k.toLowerCase(); }).replace(/([^.])$/, '$1.')) : '');
    });
    return items;
  }
  // WCAG 2.2 at level A and AA (DATA.wcag21, from wcag21.mjs): each criterion, how the engine covers it, and the plain
  // words of each new check. The page runs the in-page checks itself (window.__wcag21, wcag-page.js) on every variant.
  var WCAG = DATA.wcag21 && DATA.wcag21.criteria ? DATA.wcag21 : null;
  var WCAG_SC = {};
  if (WCAG) WCAG.criteria.forEach(function (k) { (k.kinds || []).forEach(function (kind) { if (!WCAG_SC[kind]) WCAG_SC[kind] = k.sc; }); });
  function wcagScOf(kind) { return WCAG_SC[kind] || ''; }
  function wcagLabelOf(sc) {
    var k = WCAG && WCAG.criteria.find(function (x) { return x.sc === sc; });
    return k ? 'WCAG ' + k.sc + ' ' + k.name + ' (' + k.level + ')' : sc ? 'WCAG ' + sc : '';
  }
  function wcagTitle(kind, n) {
    var g = WCAG && WCAG.guide[kind];
    return !g ? kind : n === 1 ? g.one : g.many.replace('{n}', n);
  }
  function wcagFix(kind, own) { var g = WCAG && WCAG.guide[kind]; return String(own || (g ? g.fix : '')).replace(/^\w/, function (ch) { return ch.toUpperCase(); }).replace(/([^.])$/, '$1.'); }
  // Each criterion's status for the component. live: what this page's run found on every variant ({ kinds: { kind: n },
  // sc: { sc: n }, ran: { check: 1 }, tried: n }), or null before it ran (and on the page of every component).
  var WCAG_HOW = { auto: 'Tried in the browser on every variant', audit: 'Tried by the audit in a browser', static: 'Read in the code', person: 'A person checks', page: 'The page that uses it', media: 'Video and sound only' };
  var WCAG_SRC = { auto: FROM_PAGE, audit: FROM_AUDIT, static: 'Read from the code', person: 'Checked by a person', page: 'Up to the page that uses it', media: 'Only for video and sound' };
  var WCAG_AUDIT = { '1.4.4': 'zoom', '1.4.10': 'reflow', '1.4.12': 'spacing', '2.1.2': 'tabtrap', '2.4.11': 'tabtrap', '2.5.8': 'targets' };

  // A retired component still in use: one row for each product that still uses it, with its first places and
  // what replaces it; every place is in migrations.md beside the audit's other hand-back files.
  function migrationRows(c) {
    var m = c.migration; if (!m) return [];
    return m.products.map(function (p) {
      return { key: c.name + '\u0000migration:' + p.name, area: 'Migration', kind: 'Retired', figma: '', code: '<code>' + esc(p.name) + '</code><span class="pg-par-val">' + esc(p.count + (p.count === 1 ? ' place' : ' places')) + '</span>',
        where: esc(p.name) + '<span class="pg-par-val">' + esc(p.count + (p.count === 1 ? ' place' : ' places') + ': ' + p.at.join(', ') + (p.count > p.at.length ? ', and ' + (p.count - p.at.length) + ' more' : '')) + '</span>',
        todo: esc('Move ' + (p.name === 'This system' ? 'this system' : p.name) + ' off ' + c.name + ' (' + p.at.join(', ') + (p.count > p.at.length ? ', and ' + (p.count - p.at.length) + ' more' : '') + ').') + '<span class="pg-todo">' + esc((m.toName ? 'Use ' + m.toName + ' instead. ' : 'Decide what replaces it first. ') + 'Every place is in migrations.md.') + '</span>',
        who: m.toName ? WHO.code : WHO.both, st: m.toName ? 'todo' : 'check', rel: '', at: DATA.builtAt || null,
        scope: { scope: 'local', reason: 'Local: moving ' + (p.name === 'This system' ? "the system's own pages" : p.name) + ' off ' + c.name + ' changes ' + (p.name === 'This system' ? 'those pages' : p.name + "'s own code") + ' only: no other product gets it.' } };
    });
  }
  // Documentation not written yet: the open rows of its Documentation area, in that same table.
  function docRows(c) { return docIssueRows(c).filter(isOpen); }
  // A class a product styles almost as this component: a decision, one row each, to use the component or to add
  // the new one to the system on purpose.
  function copyRows(c) {
    return (c.copies || []).map(function (x) {
      return { key: c.name + '\u0000copy:' + x.product + ':' + x.cls, area: 'Products', kind: 'Near copy', figma: '', code: '<code>.' + esc(x.cls) + '</code><span class="pg-par-val">' + esc(x.product + ', ' + x.file + ':' + x.line) + '</span>',
        where: esc(x.product) + '<span class="pg-par-val"><code>.' + esc(x.cls) + '</code> ' + esc(x.file + ':' + x.line) + '</span>',
        todo: esc(x.product + '\'s .' + x.cls + ' is nearly ' + c.name + ' (' + x.same + ' of ' + x.of + ' declarations alike' + (x.differ.length ? '; it differs in ' + x.differ.slice(0, 4).join(', ') : '') + ').') + '<span class="pg-todo">' + esc('Decide: use ' + c.name + ' in ' + x.product + ', with a new option if it needs one, or add .' + x.cls + ' to the system on purpose. Your team decides which.') + '</span>',
        who: WHO.both, st: 'check', rel: '', at: DATA.builtAt || null,
        scope: { scope: 'local', reason: 'Local: ' + x.product + "'s own class, so swapping it for " + c.name + ' changes ' + x.product + ' only. Adding it to the system instead would be shared.' } };
    });
  }
  // Every open item, by component, in the table each component's own areas show: its Parity rows to fix or to check,
  // then its Accessibility rows (a criterion the browser has not tried yet waits for that try); the system's own items
  // first. Numbered in the order the page shows them, and each component's areas show the same numbers.
  function fillTodo() {
    var order = [];
    // The system's own items (a control the page needs and the system lacks, a component only Figma has): rows of the
    // same table, the system's first.
    var sys = TODO.filter(function (t) { return !t.comp; }).map(function (t, i) {
      var comp = /^Figma has the (.+) component; the code does not have it yet\.$/.exec(t.say || '');
      // A component only the code has: its file on the code's side, nothing on Figma's.
      if (t.codeFile) return { from: t, key: '\u0000system:' + i + ':' + t.say, area: 'Parity', kind: 'Component', figma: '<span class="pg-par-none">Not there</span>', code: '<code>' + esc(t.codeFile) + '</code>', todo: esc(t.say) + '<span class="pg-todo">' + esc(doWhat(t.todo)) + '</span>', who: (WHO[t.who] || WHO.both) + teamNote(t.say, t.team), st: 'todo', rel: PAR_REL.code, at: DATA.builtAt || null };
      return { key: '\u0000system:' + i + ':' + t.say, area: t.area || (comp ? 'Parity' : 'Style guide'), kind: t.type || (comp ? 'Component' : 'Stand-in'), figma: comp ? '<code>' + esc(comp[1]) + '</code>' : '', code: comp ? '<span class="pg-par-none">Not there</span>' : '', todo: esc(t.say) + '<span class="pg-todo">' + esc(doWhat(t.todo)) + '</span>', who: (WHO[t.who] || WHO.both) + teamNote(t.say, t.team), st: t.st || (t.who !== 'both' ? 'todo' : 'check'), rel: comp ? PAR_REL.figma : '', from: t, at: DATA.builtAt || null };
    });
    if (sys.length) order.push({ name: null, rows: sys });
    COMPONENTS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (c) {
      var rows = parityIssueRows(c).filter(isOpen);
      try {
        var tried = c.__a11y, pending = /when its Accessibility area is open\.$/;
        a11yIssueRows(c, tried ? tried.items : c.a11y ? a11yStaticItems(c) : [], tried ? tried.live : null).forEach(function (r) {
          if (!isOpen(r)) return;
          if (!(tried && tried.live) && !r.its.length && pending.test(r.note)) return;   // waits for its try in the browser
          rows.push(r);
        });
        unreadRows(c).filter(isOpen).forEach(function (r) { rows.push(r); });
      } catch (e) { /* its accessibility is read on its own page */ }
      migrationRows(c).forEach(function (r) { rows.push(r); });
      copyRows(c).forEach(function (r) { rows.push(r); });
      motionIssueRows(c).filter(isOpen).forEach(function (r) { rows.push(r); });
      docRows(c).forEach(function (r) { rows.push(r); });
      if (rows.length) order.push({ name: c.name, rows: rows });
    });
    // Each kind on its own, in its own table: Parity, Accessibility, Documentation and the rest, each by component, the
    // system's first. Numbered in the order the kinds and their tables show them, in each what is to fix before what is
    // to check; a component's own areas name the same numbers.
    var kindsSeen = [];
    order.forEach(function (g) { g.rows.forEach(function (r) { if (kindsSeen.indexOf(r.area) < 0) kindsSeen.push(r.area); }); });
    var kinds = TODO_KINDS.filter(function (a) { return kindsSeen.indexOf(a) >= 0; }).concat(kindsSeen.filter(function (a) { return TODO_KINDS.indexOf(a) < 0; }));
    // Until every component is tried in this browser, Accessibility waits on its own: the other kinds show at once, with
    // their final numbers, and Accessibility is listed without rows or a count, how far the try has got under it.
    var tried = COMPONENTS.filter(function (c) { return c.__a11y; });
    var wait = !ALL && tried.length < COMPONENTS.length;
    kinds = kinds.filter(function (a) { return a !== 'Accessibility'; }).concat(wait || kinds.indexOf('Accessibility') >= 0 ? ['Accessibility'] : []);
    var byKind = kinds.map(function (a) {
      return { area: a, wait: wait && a === 'Accessibility', groups: wait && a === 'Accessibility' ? [] : order.map(function (g) { return { name: g.name, rows: byStatus(g.rows.filter(function (r) { return r.area === a; })) }; }).filter(function (g) { return g.rows.length; }) };
    });
    // Numbered in the order the kinds show, Accessibility last, so no other number moves when its rows come in.
    var no = 0;
    Object.keys(TODO_NO).forEach(function (k) { delete TODO_NO[k]; });
    byKind.forEach(function (k) { k.groups.forEach(function (g) { g.rows.forEach(function (r) { r.no = ++no; TODO_NO[r.key] = r.no; }); }); });
    // While the rest is still being tried, what a component already tried has to fix is numbered too, after everything
    // else: its own Accessibility area shows the number, and no other number moves when more come in.
    if (wait) order.forEach(function (g) { if (!tried.some(function (c) { return c.name === g.name; })) return; byStatus(g.rows.filter(function (r) { return r.area === 'Accessibility'; })).forEach(function (r) { if (!TODO_NO[r.key]) TODO_NO[r.key] = ++no; }); });
    var all = byKind.reduce(function (n, k) { return n + k.groups.reduce(function (m, g) { return m + g.rows.length; }, 0); }, 0);
    fillTodoNos(document);
    var link = nav.querySelector('a[href="#status"]');
    var box = td.querySelector('.sg-todo') || td.appendChild(document.createElement('div')); box.className = 'sg-todo';
    // The menu's count waits for every kind, so it never changes in front of the reader.
    if (link) { var had = link.querySelector('.sg-count'); if (had) had.remove(); }   // no number in the menu: the page itself counts
    // One row a component: Figma's and the code's (found, or missing), whether the two match, whether it passes
    // accessibility, how far its documentation is, and when it was last checked. A component only Figma has, or only
    // the code, is a row too. A row opens a panel under it with what is left, in the tables its own areas show.
    var pill = statePill;
    // Its state ranks it when its column sorts the table (Missing, then Partial or To decide, then Not checked, then
    // done), what is left after that.
    var rankOf = function (cls, say) { return cls === 'differs' ? 4 : cls === 'figma' ? 3 : say === 'Untested' ? 2 : cls === 'match' ? 1 : 0; };
    var WHY = STATE_WHY;
    // The word, then the page's own tip mark (?) beside it, its reason in the bubble.
    var tipPill = function (cls, say, why) { return '<span class="sg-mx-why">' + pill(cls, say) + tipHTML(why || WHY[say], 'Why ' + say) + '</span>'; };
    var cell = function (cls, say, fix, dec) { return '<td data-fix="' + (fix || 0) + '" data-dec="' + (dec || 0) + '" data-rank="' + rankOf(cls, say) + '" data-ok="' + (cls === 'match' ? 1 : 0) + '">' + (WHY[say] ? tipPill(cls, say) : pill(cls, say)) + '</td>'; };
    var FOUND = '<td data-ok="1">' + pill('match', 'Found') + '</td>', MISSING = '<td data-ok="0">' + pill('differs', 'Missing') + '</td>';
    var ago = function (at) {
      var m = Math.round((Date.now() - new Date(at).getTime()) / 60000);
      if (!(m >= 0)) return '–';
      if (m < 1) return 'Just now';
      if (m < 60) return m + ' min ago';
      var h = Math.round(m / 60); if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
      var d = Math.round(h / 24); return d + (d === 1 ? ' day ago' : ' days ago');
    };
    var latest = function (rows) { return rows.reduce(function (m, r) { return r.at && (!m || r.at > m) ? r.at : m; }, null) || DATA.builtAt || null; };
    var counts = { all: 0, work: 0, nocode: 0, unsure: 0, done: 0, untested: 0 };
    var C = stateC;
    var cellOf = function (x) { return cell(x.cls, x.say, x.fix, x.dec); };
    var CODE = { found: '<td data-ok="1">' + pill('match', 'Found') + '</td>', css: '<td data-ok="1"><span class="sg-mx-why">' + pill('match', 'CSS only') + tipHTML('Found only as a CSS class in the code: no component file, so it has no props to read or try, and its preview is drawn from Figma.', 'What CSS only means') + '</span></td>', unsure: '<td data-ok="0">' + pill('figma', 'Unsure') + '</td>', missing: '<td data-ok="0">' + pill('differs', 'Missing') + '</td>' };
    // A row: its name, Figma's and the code's side (found, unsure, missing), its Parity, Accessibility and Documentation,
    // what is left, when it was last checked, and its details.
    var mxRow = function (o) { return o; };
    // An area's cell: its state, and when there is something to see, a small arrow that opens the component on that
    // area, filtered to what is to fix (or to decide).
    var areaCell = function (o, x, slug, label) {
      var href = x.href !== undefined ? x.href : o.href;
      var see = href && x.say !== 'N/A' && (x.fix || x.dec), st = x.st !== undefined ? x.st : x.fix ? 'todo' : x.dec ? 'check' : '', why = x.why || WHY[x.say];
      // An area with something open is a link to it: its state in a link pill, the page's one style for a link in a table.
      var link = see ? '<button type="button" class="sg-link-pill sg-mx-go--cell" data-open="' + esc(href) + '" data-name="' + esc(o.name) + '" data-area="' + slug + '" data-filter="' + st + '" aria-label="Open ' + esc(o.name) + ' on ' + label + ', ' + esc(x.say) + '">' + pill(x.cls, x.say) + LINK_GO + '</button>' : '';
      return '<td' + (see ? ' class="sg-mx-cell-go"' : '') + ' data-fix="' + (x.fix || 0) + '" data-dec="' + (x.dec || 0) + '" data-rank="' + rankOf(x.cls, x.say) + '" data-ok="' + (x.cls === 'match' ? 1 : 0) + '">' +
        (see ? (why ? '<span class="sg-mx-why">' + link + tipHTML(why, 'Why ' + x.say) + '</span>' : link) : why ? tipPill(x.cls, x.say, x.why) : pill(x.cls, x.say)) + '</td>';
    };
    var rowHTML = function (o) {
      counts.all++; if (o.fix || o.dec) counts.work++; if (o.nocode) counts.nocode++; if (o.unsure) counts.unsure++; if (o.done) counts.done++; if (o.untested) counts.untested++;
      return '<tr class="sg-mx-row' + (o.href ? ' is-link' : '') + '" data-name="' + esc(o.name) + '" data-fix="' + (o.fix || 0) + '" data-dec="' + (o.dec || 0) + '" data-done="' + (o.done ? 1 : 0) + '" data-untested="' + (o.untested ? 1 : 0) + '" data-nocode="' + (o.nocode ? 1 : 0) + '" data-unsure="' + (o.unsure ? 1 : 0) + '" data-st-figma="' + (o.figma ? 'Found' : 'Missing') + '" data-st-code="' + esc(MX_WORD.code[o.code]) + '" data-st-par="' + esc(o.par.say) + '" data-st-acc="' + esc(o.acc.say) + '" data-st-doc="' + esc(o.doc.say) + '">' +
        '<td><span class="sg-mx-name" title="' + esc(o.name) + '">' + esc(o.name) + '</span></td>' +
        // What to do about one only Figma or only the code has: a tip on the side that lacks it.
        (o.codeWhy && !o.figma ? '<td data-ok="0"><span class="sg-mx-why">' + pill('differs', 'Missing') + tipHTML(o.codeWhy, 'What to do about ' + o.name) + '</span></td>' : o.figma ? CODE.found : CODE.missing) +
        (o.codeWhy && o.figma ? '<td data-ok="0"><span class="sg-mx-why">' + pill(o.code === 'unsure' ? 'figma' : 'differs', MX_WORD.code[o.code]) + tipHTML(o.codeWhy, 'What to do about ' + o.name) + '</span></td>' : CODE[o.code]) +
        areaCell(o, o.par, 'parity', 'Parity') + areaCell(o, o.acc, 'accessibility', 'Accessibility') + areaCell(o, o.doc, 'documentation', 'Documentation') +
        '<td class="sg-mx-at" data-at="' + esc(o.at || '') + '"' + (o.at ? ' title="' + esc(when(o.at)) + '"' : '') + '>' + (o.at ? esc(ago(o.at)) : '–') + '</td>' +
        '<td class="sg-mx-open-cell">' + (o.href ? '<button type="button" class="sg-mx-go" data-open="' + esc(o.href) + '" data-name="' + esc(o.name) + '" aria-label="Open ' + esc(o.name) + '">' + MX_ARROW + '</button>' : '') + '</td></tr>';
    };
    var mxRows = COMPONENTS.map(function (c) {
      var st = componentStates(c, ALL || !!c.__a11y), all = st.all, untested = st.untested, parC = st.par, accC = st.acc, docC = st.doc, fix = st.fix, dec = st.dec;
      // Only a CSS class in the code: Missing there, as one only Figma has; nothing compared or tried until it is built.
      if (cssOnly(c)) { parC = C('none', 'N/A', 0, 0, NA_WHY.cssOnly); accC = C('none', 'N/A', 0, 0, NA_WHY.cssOnlyA11y); docC = C('differs', 'Missing', 1, 0); fix = 1; dec = 0; untested = false; }
      return mxRow({ name: c.name, figma: !c.codeOnly, code: cssOnly(c) ? 'missing' : 'found', nocode: cssOnly(c), par: parC, acc: accC, doc: docC, fix: fix, dec: dec, done: !fix && !dec && !untested, untested: untested, at: latest(all), href: cssOnly(c) ? null : '#' + cid(c.name),   // no component in the code: nothing to open, as one only Figma has
        codeWhy: cssOnly(c) ? 'The code has only its CSS class' + (c.cls ? ' (.' + c.cls + ')' : '') + ', no component file: it is not a component of the code yet. Build it as one, with the props Figma gives it.' : c.codeOnly && c.codeOnly.figma ? 'The code has ' + c.name + ' (' + c.codeOnly.file + '); Figma has no component for it. Add ' + c.name + ' to Figma, remove it from the code, or keep it as a known exception.' : '' });
    });
    // A component of Figma's the code may have (a file suggested, or several as likely: Unsure, to confirm), one it has
    // no file for (Missing), or one only the code has (No Figma): its one row, what to do in a tip on its Code cell.
    var shown = {}; COMPONENTS.forEach(function (c) { shown[c.name] = true; });
    sys.filter(function (r) { return r.from && (r.from.figmaOnly || r.from.codeOnly || r.from.pairing); }).forEach(function (r) {
      var name = String(r.from.figmaOnly || r.from.pairing || r.from.codeOnly).trim() || '(no name)';
      if (shown[name]) return; shown[name] = true;
      var f = !r.from.codeOnly, unsure = !!r.from.pairing && r.from.match !== 'none' && !SR_MISSING[name];
      mxRows.push(mxRow({ name: name, figma: f, code: !f ? 'found' : unsure ? 'unsure' : 'missing',
        par: unsure ? C('none', 'N/A', 0, 0, 'Its file in the code is still to confirm (Code: Unsure): nothing is compared until it is.') : C('none', 'N/A', 0, 0, f ? NA_WHY.figmaOnly : NA_WHY.codeOnly), acc: C('none', 'N/A', 0, 0, f ? NA_WHY.figmaOnlyA11y : NA_WHY.codeOnly), doc: f && !unsure ? C('differs', 'Missing', 1, 0) : C('none', 'N/A', 0, 0, f ? NA_WHY.figmaOnly : NA_WHY.codeOnly),
        fix: unsure ? 0 : 1, dec: unsure ? 1 : 0, nocode: f && !unsure, unsure: unsure, at: r.at,
        codeWhy: (SR_MISSING[name] ? 'The Showroom found it missing from the code. ' : '') + String(r.todo || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim() }));
    });
    // A part (chartBars/bar) is no row of its own: it joins its parent's row, what it has left counted there, and is
    // listed in the parent's details (its Parts tab). A family with no component of its own name (navigation/LinkCompact,
    // navigation/RailWide) is one row in its name, made of its parts.
    var RANK = function (x) { return x.cls === 'differs' ? 4 : x.cls === 'figma' ? 3 : x.say === 'Untested' ? 2 : x.cls === 'match' ? 1 : 0; };
    var worst = function (xs, rename) { var w = xs.reduce(function (m, x) { return RANK(x) > RANK(m) ? x : m; }, xs[0]), out = C(w.cls, rename && /^No (code|Figma)$/.test(w.say) ? 'Differs' : w.say, xs.reduce(function (n, x) { return n + x.fix; }, 0), xs.reduce(function (n, x) { return n + x.dec; }, 0)); out.n = xs.reduce(function (n, x) { return n + checksOf(x); }, 0); return out; };
    var heads = {}, rows = [];
    mxRows.forEach(function (o) { if (!parentOf(o.name)) heads[o.name] = o; });
    mxRows.forEach(function (o) {
      var pa = parentOf(o.name);
      if (!pa) { rows.push(o); return; }
      var h = heads[pa];
      if (!h) { h = heads[pa] = { name: pa, family: true, figma: true, code: 'missing', par: null, acc: null, doc: null, fix: 0, dec: 0, untested: false, at: null }; rows.push(h); }
      (h.parts = h.parts || []).push(o);
    });
    rows.forEach(function (h) {
      if (!h.parts) return;
      var all = (h.family ? [] : [h]).concat(h.parts);
      // Each state opens the one that sets it (the part whose state the row shows, read before the row's own is
      // replaced), on what that one has to fix or decide, so the page it opens says the same word; one with no page of
      // its own opens nothing.
      // Its Parity, Accessibility and Documentation are read from what has a page to open (the component and its parts in
      // the code); a part only Figma has counts in the Code column, never as a state that opens nothing.
      var paged = all.filter(function (x) { return x.href; }), areaOf = paged.length ? paged : all;
      var setBy = {};
      ['par', 'acc', 'doc'].forEach(function (k) {
        var from = areaOf.filter(function (x) { return x[k]; }).reduce(function (m, x) { return !m || RANK(x[k]) > RANK(m[k]) ? x : m; }, null);
        if (from) setBy[k] = { href: from.href || null, st: from[k].fix ? 'todo' : from[k].dec ? 'check' : '' };
      });
      h.par = worst(areaOf.map(function (x) { return x.par; }), true); h.acc = worst(areaOf.map(function (x) { return x.acc; })); h.doc = worst(areaOf.map(function (x) { return x.doc; }));
      ['par', 'acc', 'doc'].forEach(function (k) { if (setBy[k]) { h[k].href = setBy[k].href; h[k].st = setBy[k].st; } });
      h.fix = all.reduce(function (n, x) { return n + (x.fix || 0); }, 0); h.dec = all.reduce(function (n, x) { return n + (x.dec || 0); }, 0);
      h.untested = all.some(function (x) { return x.untested; }); h.done = !h.fix && !h.dec && !h.untested;
      h.at = all.reduce(function (m, x) { return x.at && (!m || x.at > m) ? x.at : m; }, null);
      if (h.family) { h.code = h.parts.some(function (x) { return x.code === 'found'; }) ? 'found' : h.parts.some(function (x) { return x.code === 'css'; }) ? 'css' : h.parts.some(function (x) { return x.code === 'unsure'; }) ? 'unsure' : 'missing'; h.nocode = h.code === 'missing'; h.unsure = h.code === 'unsure'; }
      // It opens its own page, else (a family with no component of its name) its first part's.
      if (!h.href) h.href = (h.parts.filter(function (x) { return x.href; })[0] || {}).href || null;
    });
    fillHealth(rows);   // the cards count what the table shows
    var rowsHTML = rows.sort(function (a, b) { return a.name.localeCompare(b.name); }).map(rowHTML).join('');
    // The filters: one chip a column, its name inside, All until a state is chosen, so nothing looks applied. Each
    // opens a list (the Brand selector's) of All and the column's states, with how many rows each would show beside
    // the other chips' choices (filled in by showTodoArea). The chips combine; Clear filters drops them all.
    var chipsRow = '<span class="sg-chips" role="group" aria-label="Filter">' + MX_CHIP_COLS.map(function (g) {
      var words = [];
      rows.forEach(function (o) { var w = g[2](o); if (w && w !== '–' && w !== 'N/A' && words.indexOf(w) < 0) words.push(w); });
      words.sort(function (a, b) { return MX_ORDER.indexOf(a) - MX_ORDER.indexOf(b); });
      if (!words.length) return '';
      var id = 'sg-mx-dd-' + g[1];
      return '<span class="sg-chip-dd"><button type="button" class="sg-chip sg-chip-menu" data-mxg="' + g[1] + '" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + id + '" aria-pressed="false">' +
        '<span class="sg-chip-label">' + esc(g[0]) + '</span><span class="sg-chip-word"></span><span class="sg-chip-n"></span>' + FILTER_MARK + '</button>' +
        '<span class="sg-select-list" id="' + id + '" role="listbox" aria-label="' + esc(g[0]) + '" tabindex="-1" hidden>' + [''].concat(words).map(function (w, i) { return '<span class="sg-dd-option" role="option" id="' + id + '-' + i + '" data-mx="' + esc(g[1] + ':' + w) + '" aria-selected="false"><span>' + esc(w || 'All') + '</span><span class="sg-count"></span></span>'; }).join('') + '</span></span>';
    }).join('') + '<button type="button" class="sg-mx-clear" data-mx-clear-all hidden>Clear filters</button></span>';
    var head = MX_COLS.map(function (a) { return '<th data-sort="' + a + '" aria-sort="none"><button type="button" class="sg-mx-sort">' + esc(a) + MX_TRI + '</button></th>'; }).join('') + '<th class="sg-mx-open-cell"><span class="sg-hidden-text">Open</span></th>';
    var table = '<div class="pg-par-card"><div class="pg-par-scroll"><table class="pg-par-table sg-matrix"><thead><tr>' + head + '</tr></thead><tbody>' + rowsHTML + '</tbody></table></div></div>';
    // What belongs to no one component (the system's tokens, a control the page stands in for): each kind's own table
    // under the components', its rows numbered as before. A component only one side has is a row of the table above.
    var inTable = function (r) { return r.from && (r.from.figmaOnly || r.from.codeOnly || r.from.pairing); };
    var sysHTML = byKind.map(function (k) { var g = k.groups.filter(function (x) { return !x.name; })[0], rows = g ? g.rows.filter(function (r) { return !inTable(r); }) : []; return rows.length ? issueTableHTML(rows, '', esc(k.area === 'Style guide' ? 'Missing components' : k.area === 'System' ? 'Tokens' : k.area), k.area) : ''; }).filter(Boolean).join('');
    var html = '<div class="sg-todo-head"><p class="pg-par-sum sg-todo-sum">' + chipsRow + '</p></div>' +
      table +
      (sysHTML ? '<h3 class="sg-mx-sys-head">Not tied to one component</h3><div class="sg-mx-sys">' + sysHTML + '</div>' : '');
    if (box._drawn === html) return;
    box.innerHTML = html; box._drawn = html;
    if (!box._mx) { box._mx = true; box.addEventListener('click', function (e) {
      var m = e.target.closest('.sg-chip-menu'); if (m) { mxMenu(m, m.getAttribute('aria-expanded') !== 'true'); return; }
      if (e.target.closest('[data-mx-clear-all]')) { MX_FILTERS = {}; showTodoArea(box); todoLink(); return; }
      var c = e.target.closest('.sg-dd-option[data-mx]'); if (c) {
        var dd = c.closest('.sg-chip-dd'); if (dd) mxMenu(dd.querySelector('.sg-chip-menu'), false, true);
        var g = c.dataset.mx.split(':')[0], w = c.dataset.mx.slice(g.length + 1);
        if (w) MX_FILTERS[g] = w; else delete MX_FILTERS[g];
        var k = MX_COL_OF[g]; if (w && k) { todoKey = k; todoDir = -1; todoArea = MX_AREAS.indexOf(k) >= 0 ? k : null; }
        showTodoArea(box); todoLink(); return;
      }
      // The whole cell opens what its arrow opens (its tip, if any, stays its own).
      var cellGo = !e.target.closest('.sg-tip, .sg-mx-go, .sg-mx-go--cell') && e.target.closest('td.sg-mx-cell-go'); if (cellGo) { var cb = cellGo.querySelector('.sg-mx-go--cell'); if (cb) openComponentPanel(cb.dataset.name, cb.dataset.open, cb.dataset.area || '', cb.dataset.filter || '', cb); return; }
      // The rest of a row opens the component's own page, as its arrow does.
      var rowGo = !e.target.closest('.sg-tip, .sg-mx-go, a, button') && e.target.closest('tr.sg-mx-row.is-link'); if (rowGo) { var rb = rowGo.querySelector('td.sg-mx-open-cell .sg-mx-go'); if (rb) openComponentPanel(rb.dataset.name, rb.dataset.open, '', '', rb); return; }
      var go = e.target.closest('.sg-mx-go, .sg-mx-go--cell'); if (go) { openComponentPanel(go.dataset.name, go.dataset.open, go.dataset.area || '', go.dataset.filter || '', go); return; }
      // A column head sorts by it; again, the other way round. A name or a date first A to Z and oldest first, the
      // rest with the most left first.
      var th = e.target.closest('th[data-sort]'); if (th) { var k = th.dataset.sort; todoDir = todoKey === k ? -todoDir : k === 'Component' || k === 'Last checked' ? 1 : -1; todoKey = k; todoArea = MX_AREAS.indexOf(k) >= 0 ? k : null; showTodoArea(box); todoLink(); }
    }); }
    showTodoArea(box);
    labelCells(td);
    todoHeadHeight();
  }
  // Each card's head row sticks under the filter and the counts, whatever their height at this width.
  // Not while the pages are first built: the router measures the page it opens once they are (route → underTitle).
  function todoHeadHeight() { if (route.last !== undefined) underTitle(document.getElementById('status')); }

