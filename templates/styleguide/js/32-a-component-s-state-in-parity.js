  /* ── A component's state in Parity, Accessibility and Documentation, and its words: decided here only. The Status
     table, its cards and filters, and the component's own area tabs all read it, so a word or a rule changed here
     changes everywhere. ────────────────────────────────────────────────────────────────────────────────────────── */
  // why: the reason a state's word does not say itself (an N/A), the same in the table's tip and the area's info box.
  // Why a check could not run, in plain words (the raw error is for a developer: in the tip beside it, never in the
  // sentence). Every place that says a check did not run says it so.
  function plainWhy(raw) {
    var r = String(raw || '');
    if (/no markup/i.test(r)) return 'the code has no markup for it yet';
    if (/not opened/i.test(r)) return 'the test browser never opened it';
    if (/time(d)? ?out|ran out of time/i.test(r)) return 'the test ran out of time before reaching it';
    if (/cannot|undefined|not a function|not defined|typeerror|referenceerror|error|failed|not rendered|not drawn/i.test(r)) return 'it broke when the test drew it on its own: its code needs something the test did not give it, such as a setting, data or a service';
    return 'it was not drawn on the page the test opened';
  }
  // The raw reason, tidied, for a developer: what the browser said.
  function rawWhy(raw) { return String(raw || '').replace(/^\w+\)\s*\(/, '').replace(/\)?\s*\(?not rendered\)?$/i, '').replace(/^\(|\)$/g, '').trim(); }
  function whyTip(raw) { var d = rawWhy(raw); return d ? tipHTML('What the test browser said: ' + d, 'Technical detail') : ''; }
  function stateC(cls, say, fix, dec, why) { return { cls: cls, say: say, fix: fix || 0, dec: dec || 0, why: why || '' }; }
  // The checks a state counts: its own count, else what it has to fix or decide (Missing documentation: one, to write).
  function checksOf(x) { return !x || x.say === 'N/A' || x.say === 'Untested' ? 0 : x.n != null ? x.n : x.fix + x.dec; }
  // Why an area is N/A, as precisely as is known: only one side has the component, or nothing of that kind applies.
  var NA_WHY = {
    codeOnly: 'Only the code has this component: Figma has nothing to compare it with.',
    figmaOnly: 'Only Figma has this component: the code has nothing to compare it with yet.',
    // Accessibility is tried on the code, not compared: one not in the code has nothing to try yet.
    figmaOnlyA11y: 'Not in the code yet: there is nothing to try in a browser until it is built.',
    cssOnly: 'Not a component of the code yet (the code has only its CSS class): nothing to compare until it is built.',
    cssOnlyA11y: 'Not a component of the code yet (the code has only its CSS class): nothing to try in a browser until it is built.',
    Parity: 'Nothing of it was read from Figma or the code to compare yet.',
    Accessibility: 'No accessibility check applies to it.',
    Documentation: 'No kind of documentation applies to it.'
  };
  // A word whose reason is not plain, said in a tip beside it: N/A, and Untested while the browser tests it.
  var STATE_WHY = {
    'N/A': 'Not applicable: only Figma or only the code has this component, or it has nothing of this kind to check.',
    Untested: 'Being tested in the background in this browser; this updates as soon as its results are in.'
  };
  // The word with its coloured dot (N/A has no state to colour: the word alone).
  function statePill(cls, say) { return '<span class="pg-par-status pg-par--' + cls + (say === 'Untested' ? ' is-untested' : '') + '">' + (say === 'N/A' ? '' : '<span class="pg-par-sign" aria-hidden="true"></span>') + esc(say) + '</span>'; }
  // withA11y: its accessibility has been tried (here, or baked into the page); else it is Untested.
  function componentStates(c, withA11y) {
    if (withA11y === undefined) withA11y = ALL || !!c.__a11y;
    var all = healthRowsOf(healthAllRows(c, withA11y)), untested = !withA11y;
    var of = function (a) { var rows = all.filter(function (r) { return r.area === a; }); return { n: rows.length, fix: rows.filter(function (r) { return r.st === 'todo'; }).length, dec: rows.filter(function (r) { return r.st === 'check'; }).length }; };
    var p = of('Parity'), a = of('Accessibility'), d = of('Documentation');
    if (untested) a = { n: 0, fix: 0, dec: 0 };
    // Only the code has it: nothing in Figma to compare with, so nothing to fix or decide in Parity (its one task, to add
    // it to Figma or remove it from the code, is on its Figma side).
    if (c.codeOnly) p = { n: 0, fix: 0, dec: 0 };
    // Match: all its props, tokens and values the same in Figma and the code. Partial: some the same, some not.
    // Differs: none the same, something to fix. N/A: only one side has it, or nothing to compare.
    // Unsure: nothing known to differ, only things to decide (none the same yet, none different either).
    var par = !p.n ? stateC('none', 'N/A', 0, 0, c.codeOnly ? NA_WHY.codeOnly : NA_WHY.Parity) : !p.fix && !p.dec ? stateC('match', 'Match') : p.n - p.fix - p.dec > 0 ? stateC('figma', 'Partial', p.fix, p.dec) : !p.fix ? stateC('figma', 'Unsure', 0, p.dec) : stateC('differs', 'Differs', p.fix, p.dec);
    // Met: nothing to fix or decide. Issues: something to fix. Review: something to decide. Untested: not tried yet.
    var acc = untested ? stateC('none', 'Untested') : a.fix ? stateC('differs', 'Issues', a.fix, a.dec) : a.dec ? stateC('figma', 'Review', 0, a.dec) : a.n ? stateC('match', 'Met') : stateC('none', 'N/A', 0, 0, NA_WHY.Accessibility);
    // Written: everything written. Missing: nothing written at all. Partial: anything between, text to check included.
    var doc = !d.n ? stateC('none', 'N/A', 0, 0, c.codeOnly ? NA_WHY.codeOnly : NA_WHY.Documentation) : !d.fix && !d.dec ? stateC('match', 'Written') : d.fix === d.n ? stateC('differs', 'Missing', d.fix, d.dec) : stateC('figma', 'Partial', d.fix, d.dec);
    // How many checks each state counts, so a card can say how much of them is done (its percentage).
    par.n = p.n; acc.n = a.n; doc.n = d.n;
    return { par: par, acc: acc, doc: doc, all: all, untested: untested, fix: p.fix + a.fix + d.fix + (c.codeOnly ? 1 : 0), dec: p.dec + a.dec + d.dec };
  }
  // The stage the page suggests for it, from what it measures, in the Status row's own words: Stable when Parity is
  // Match, Accessibility Met and Documentation Written (N/A counts as met) and, when the project's tests report it, at
  // least STABLE_COVERAGE of its lines covered; Deprecated when a release retired it or Figma or the code says so, with
  // what replaces it; Beta otherwise, with what is left. None while its accessibility is untested, and none for a
  // component only one side has. The team's own stage (c.status) is never replaced: the suggestion is said beside it
  // only when they differ.
  var STABLE_COVERAGE = 80;
  function suggestedStage(c) {
    if (c.retiring) return { kind: 'deprecated', status: 'Deprecated', why: [c.retiring.from ? 'retired, as ' + c.retiring.from + ' says' : 'retired'], instead: c.retiring.instead || null };
    if (c.codeOnly || cssOnly(c)) return null;
    var s = componentStates(c);
    if (s.untested) return null;
    var left = [];
    if (s.par.say !== 'Match') left.push('Parity ' + s.par.say);
    if (s.acc.say !== 'Met' && s.acc.say !== 'N/A') left.push('Accessibility ' + s.acc.say);
    if (s.doc.say !== 'Written' && s.doc.say !== 'N/A') left.push('Documentation ' + s.doc.say);
    if (c.coverage && c.coverage.lines < STABLE_COVERAGE) left.push('tests cover ' + Math.round(c.coverage.lines) + '% of its lines, under ' + STABLE_COVERAGE + '%');
    return left.length ? { kind: 'beta', status: 'Beta', why: left }
      : { kind: 'stable', status: 'Stable', why: ['Parity Match, Accessibility ' + s.acc.say + ', Documentation ' + s.doc.say + (c.coverage ? ', tests cover ' + Math.round(c.coverage.lines) + '% of its lines' : '')] };
  }
  // The stage the page measures, on the Tasks page: one to set when the team gave none, one to look at again when it
  // differs from the team's. The team makes it its own with status in contract.authored.json.
  function stageRows(c) {
    var sug = suggestedStage(c), team = c.status;
    if (!sug || (team && team.kind === sug.kind)) return [];
    var why = sug.why.join('; ');
    var said = team ? 'Its stage says ' + team.status + '; what the page measures makes it ' + sug.status + ' (' + why + ').' : 'No stage yet: what the page measures makes it ' + sug.status + ' (' + why + ').';
    var how = team ? 'Keep ' + team.status + ', or change its status in contract.authored.json.' : 'Set its status in contract.authored.json (' + sug.kind + ').';
    return [{ key: c.name + '\u0000stage', area: 'System', kind: 'Stage', figma: '', code: '', todo: esc(said) + '<span class="pg-todo">' + esc(how + (sug.instead ? ' Use ' + sug.instead + ' instead.' : '')) + '</span>',
      who: WHO.both, st: 'check', rel: '', at: DATA.builtAt || null,
      scope: { scope: 'shared', reason: 'Shared: its stage is what every product reads before it uses ' + c.name + '.' } }];
  }
  // A component's area tab and the state it carries, as its Status row says it.
  var AREA_STATE = { parity: 'par', a11y: 'acc', docs: 'doc' };
  function areaState(btn, x) {
    if (!btn) return;
    Array.prototype.forEach.call(btn.querySelectorAll('.sg-tab-state'), function (n) { n.remove(); });
    if (x) btn.insertAdjacentHTML('beforeend', stateMark(x));
  }
  // On a tab, the state's dot alone, its word said to a screen reader; N/A, nothing (its area says why, in an info box).
  function stateMark(x) { return !x || x.say === 'N/A' ? '' : '<span class="sg-tab-state"><span class="pg-par-status pg-par--' + x.cls + (x.say === 'Untested' ? ' is-untested' : '') + '"><span class="pg-par-sign" aria-hidden="true"></span></span><span class="sg-hidden-text">, ' + esc(x.say) + '</span></span>'; }
  // An area whose state is N/A says why at its top, in the same words as the Status table's tip (STATE_WHY).
  function naInfo(x) { return x && x.say === 'N/A' ? areaInfo(x.why || STATE_WHY['N/A']) : ''; }
  // The one info box an area uses to say why it has nothing to show (N/A, nothing moves, no commit, not used yet).
  function areaInfo(words) { return '<p class="sg-info sg-area-na">' + esc(words) + '</p>'; }
  function areaNA(area, x) {
    if (!area) return;
    var had = area.querySelector('.sg-area-na'); if (had) had.remove();
    var at = area.querySelector('.pg-footer') || area; if (x && x.say === 'N/A') at.insertAdjacentHTML('afterbegin', naInfo(x));
  }
  // Each row's status in its area's own words, the Status page's: Parity Differs, Unsure, Match; Accessibility Issues,
  // Review, Met; Documentation Missing, Partial, Written. Elsewhere, the general words (STATUS).
  var ROW_WORD = {
    Parity: { todo: 'Differs', check: 'Unsure', done: 'Match' },
    Accessibility: { todo: 'Issues', check: 'Review', done: 'Met' },
    Documentation: { todo: 'Missing', check: 'Partial', done: 'Written' }
  };
  function rowWord(st, area) { return (ROW_WORD[area] && ROW_WORD[area][st]) || (STATUS[st] || STATUS.none)[1]; }
  // The four cards above the table, read from its rows: the same components (one a family, a part with its parent)
  // and the same states, in the same words (Match, Differs; Built, Unsure, Missing; Met, Issues, Review,
  // Untested; Written, Partial, Missing). The big number is what is done; the bar and its legend split the rest.
  function fillHealth(mx) {
    if (!hl || !mx) return;
    var figmaRows = mx.filter(function (o) { return o.figma; }), built = figmaRows.filter(function (o) { return o.code === 'found' || o.code === 'css'; });
    var BAR = { match: 'done', figma: 'check', differs: 'fix', none: 'none' };
    var ORDER_ = { done: 0, check: 1, fix: 2, none: 3 };
    // Each state of a column, counted: its words as the table says them, its colour as its dot has it.
    var states = function (list, pick, na) {   // na: what the grey part says (a check that cannot apply to it)
      var by = {}, out = [];
      list.forEach(function (o) { var x = pick(o), w = x.say === '–' ? 'N/A' : x.say; if (!by[w]) { by[w] = { cls: BAR[x.cls] || 'none', n: 0, word: w }; out.push(by[w]); } by[w].n++; });
      return out.sort(function (p, q) { var a = MX_ORDER.indexOf(p.word), b = MX_ORDER.indexOf(q.word); return (a < 0 ? 99 : a) - (b < 0 ? 99 : b) || ORDER_[p.cls] - ORDER_[q.cls]; }).map(function (x) { return { cls: x.cls, n: x.n, word: x.word, say: x.n + ' ' + (x.word === 'N/A' ? (na || 'with nothing to compare') : /^[A-Z]{2}/.test(x.word) ? x.word : x.word.charAt(0).toLowerCase() + x.word.slice(1)) }; });   // N/A said in words: only one side has it, or nothing of this kind to check
    };
    var countOf = function (parts, word) { return (parts.filter(function (x) { return x.word === word; })[0] || { n: 0 }).n; };
    // Each link in the table's own word for the rows it opens (See Differs), with no count.
    var nx = function (n, word, area) { return n ? { n: n, area: area, say: 'See ' + word } : null; };
    // Rows of checks, each done, to check (it waits for a person) or to fix: how many of each.
    var rowsSplit = function (rows) { var s = { all: 0, fix: 0, dec: 0 }; rows.forEach(function (r) { s.all++; if (r.st === 'todo') s.fix++; else if (r.st === 'check') s.dec++; }); return s; };
    // Of every check a column's rows count (never one N/A or not tried yet), how many are to check and to fix.
    var checksSplit = function (list, k) { var s = { all: 0, fix: 0, dec: 0 }; list.forEach(function (o) { var x = o[k], n = checksOf(x); if (!n) return; var f = Math.min(n, x.fix), d = Math.min(n - f, x.dec); s.all += n; s.fix += f; s.dec += d; }); return s; };
    // A card in shares of 100: what is done, the big number, rounded down so 100% is all done, and the rest split between
    // to check and to fix so the three always add up to 100. The bar draws these shares and its legend says them, so
    // what the bar shows is what the numbers say. words: the table's words for what is done, to check and to fix.
    var card = function (title, s, words, next) {
      var o = { title: title, pct: null, pctWord: words[0], rest: [], next: next };
      if (!s.all) return o;
      var pct = Math.floor((s.all - s.fix - s.dec) / s.all * 100), rest = 100 - pct, fix = s.fix + s.dec ? Math.round(rest * s.fix / (s.fix + s.dec)) : 0;
      o.pct = pct;
      o.rest = [{ cls: 'check', pct: rest - fix, word: words[1], any: s.dec > 0 }, { cls: 'fix', pct: fix, word: words[2], any: s.fix > 0 }].filter(function (x) { return x.any; });
      return o;
    };
    var share = function (p) { return p < 1 ? '<1%' : p + '%'; };
    var tile = function (o) {
      var tip = o.how ? tipHTML(o.how, 'How ' + o.title + ' is counted', o.howParts ? { parts: o.howParts } : undefined) : '';
      var parts = o.pct == null ? [] : [{ cls: 'done', pct: o.pct, any: o.pct > 0 }].concat(o.rest);
      var barHTML = '<span class="sg-health-bar" aria-hidden="true">' + parts.filter(function (x) { return x.any; }).map(function (x) { return '<span class="is-' + x.cls + '" style="width:' + Math.max(1, x.pct) + '%"></span>'; }).join('') + '</span>';
      // Only what is left, side by side: its share, in the table's word. What a browser has not tried yet is said apart,
      // with no share: none of it is counted yet.
      var items = o.rest.map(function (x) { return '<span class="pg-par-status pg-par--' + (x.cls === 'fix' ? 'differs' : 'figma') + '"><span class="pg-par-sign" aria-hidden="true"></span>' + esc(share(x.pct) + ' ' + x.word) + '</span>'; }).join('') +
        (o.untested ? '<span class="pg-par-status pg-par--none is-untested"><span class="pg-par-sign" aria-hidden="true"></span>' + esc(o.untested + ' Untested') + '</span>' : '');
      var legend = items ? '<p class="sg-health-legend">' + items + '</p>' : '';
      // At its foot, on one line: how many of everything in the system are done in full here (complete, never the big
      // number's word, which counts the work), and the link down to the table with that filter on (its arrow points down).
      var done = '<p class="sg-health-done"><svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.25"/><path d="M5.5 8.2l1.7 1.7 3.3-3.4"/></svg><b>' + o.doneN + '</b> of ' + o.total + ' complete</p>';
      var next = o.next && o.next.area ? '<button type="button" class="sg-health-anchor" data-go-area="' + esc(o.next.area) + '">' + esc(o.next.say) +
        '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M4 9l4 4 4-4"/></svg></button>' : '';
      // The share done, big, after a green dot that ties it to the green of the bar, and its word beside it (51% Match).
      var count = '<div class="sg-health-count"><p class="sg-health-num">' + (o.pct == null ? '–' : '<span class="sg-health-dot" aria-hidden="true"></span><span class="sg-health-pct">' + o.pct + '%</span><span class="sg-health-out">' + esc(o.pctWord) + '</span>') + '</p></div>';
      return '<div class="sg-health-tile"><div class="sg-health-top"><p class="sg-health-label">' + esc(o.title) + '</p>' + tip + '</div>' + count + barHTML + legend + '<div class="sg-health-go">' + done + next + '</div></div>';
    };
    // Every card counts over the same whole: everything the table lists, as its All filter does. Parity compares only
    // what the code has built; Accessibility tries only that, in a browser.
    var builtRows = figmaRows.filter(function (o) { return o.code !== 'missing'; });
    var parP = states(mx, function (o) { return o.par || { say: 'N/A' }; }), codeP = states(mx, function (o) { return { cls: { found: 'match', css: 'match', unsure: 'figma', missing: 'differs' }[o.code], say: MX_WORD.code[o.code] }; });
    var accP = states(mx, function (o) { return o.acc || { say: 'N/A' }; }), docP = states(mx, function (o) { return o.doc || { say: 'N/A' }; });
    // Accessibility by criterion, over the whole system: a criterion is met when nothing tried fails it or waits on it,
    // to review when only a check by hand is left somewhere, failing when anything fails it. One that fails anywhere is
    // not met: that is how an audit reads WCAG.
    var bySc = {};
    // Documentation by what people write: the page existing and its properties are the engine's own, never counted.
    var docOwn = [];
    COMPONENTS.forEach(function (c) {
      var s = componentStates(c);
      s.all.forEach(function (r) {
        if (r.area === 'Accessibility' && r.k && r.k.sc) { var was = bySc[r.k.sc]; bySc[r.k.sc] = r.st === 'todo' || was === 'todo' ? 'todo' : r.st === 'check' || was === 'check' ? 'check' : 'done'; }
        if (r.area === 'Documentation' && !c.codeOnly && r.kind !== 'Intent layer' && r.kind !== 'Properties') docOwn.push(r);
      });
    });
    var scSplit = rowsSplit(Object.keys(bySc).map(function (k) { return { st: bySc[k] }; }));
    // Each tile's link goes to what is most urgent: what fails first, then what is only part done.
    var pT = card('Parity', checksSplit(builtRows, 'par'), ['Match', 'Unsure', 'Differs'], nx(countOf(parP, 'Differs'), 'Differs', 'Parity') || nx(countOf(parP, 'Partial'), 'Partial', 'ParityPartial') || nx(countOf(parP, 'Unsure'), 'Unsure', 'ParityUnsure'));
    // Code's checks are the rows themselves: built, the rest unsure (or only its CSS class) or missing.
    var unsureN = countOf(codeP, 'Unsure'), cssN = countOf(codeP, 'CSS only'), missingN = countOf(codeP, 'Missing');
    var iT = card('Code', { all: mx.length, fix: missingN, dec: unsureN + cssN }, ['Built', cssN && unsureN ? 'Unsure or CSS only' : cssN ? 'CSS only' : 'Unsure', 'Missing'], missingN ? nx(missingN, 'Missing', 'Implementation') : nx(unsureN, 'Unsure', 'Unsure'));
    var aT = card('Accessibility', scSplit, ['Met', 'Review', 'Issues'], nx(countOf(accP, 'Issues'), 'Issues', 'Accessibility') || nx(countOf(accP, 'Review'), 'Review', 'AccessibilityReview'));
    aT.untested = countOf(accP, 'Untested');
    var dT = card('Documentation', rowsSplit(docOwn), ['Written', 'Partial', 'Missing'], nx(countOf(docP, 'Missing'), 'Missing', 'Documentation') || nx(countOf(docP, 'Partial'), 'Partial', 'DocumentationPartial'));
    [[pT, parP], [iT, codeP], [aT, accP], [dT, docP]].forEach(function (x) { x[0].total = mx.length; x[0].doneN = countOf(x[1], x[0].pctWord); });
    // What each card counts, said simply: one or two fixed sentences a person reads at a glance (25 words at most, nothing
    // made from data: test/styleguide-template.test.mjs holds them to it).
    pT.how = 'How closely the code matches Figma, in every property, token and value. The line under it counts what matches in full.';
    iT.how = 'How much of the system exists in the code. The line under it counts what is built.';
    aT.how = 'How many WCAG 2.2 AA criteria the system meets, tried in a browser on every variant. Shown for the theme chosen at the top.';
    // The criteria that belong to a page are not counted on the card: each one left is a row of the table below.
    dT.how = 'How much of each component\'s documentation is written. The line under it counts what is written in full.';
    var tiles = [pT, iT, aT, dT].map(tile).join('');
    var html = '<div class="sg-health"><div class="sg-health-tiles">' + tiles + '</div></div>';
    var box = hl.querySelector('.sg-health-box') || hl.appendChild(document.createElement('div'));
    box.className = 'sg-health-box';
    if (box._drawn !== html) { box.innerHTML = html; box._drawn = html; }
    // Each link filters the table to the rows its card counted: Documentation counts every Figma component, built in the
    // code or not, so its links never add Code: Built (the components not built yet are documented too, or missing).
    if (!box._go) { box._go = true; box.addEventListener('click', function (e) { var b = e.target.closest('[data-go-area]'); if (b) goTask.apply(null, ({ Implementation: [null, { code: 'Missing' }, 'Code'], Unsure: [null, { code: 'Unsure' }, 'Code'], Parity: ['Parity', { figma: 'Found', code: 'Built', par: 'Differs' }], Accessibility: ['Accessibility', { figma: 'Found', code: 'Built', acc: 'Issues' }], Documentation: ['Documentation', { figma: 'Found', doc: 'Missing' }], ParityPartial: ['Parity', { figma: 'Found', code: 'Built', par: 'Partial' }], ParityUnsure: ['Parity', { figma: 'Found', code: 'Built', par: 'Unsure' }], AccessibilityReview: ['Accessibility', { figma: 'Found', code: 'Built', acc: 'Review' }], DocumentationPartial: ['Documentation', { figma: 'Found', doc: 'Partial' }] })[b.getAttribute('data-go-area')] || [b.getAttribute('data-go-area')]); }); }
  }
  // Only the kind chosen, its own tables, and its own count of what is to fix and to check; the numbers stay as they are.
  // Accessibility last: what a browser still has to try is numbered after the rest, so no other number moves.
  // What the page itself stands in for (a control the system lacks) comes last, as the Style guide's own.
  var TODO_KINDS = ['Parity', 'Rules', 'Motion', 'Documentation', 'Migration', 'Products', 'System', 'Accessibility', 'Style guide'];
  // The tabs in the cards' order (Parity, Accessibility, Documentation), then the rest; the numbering keeps its own.
  var TAB_ORDER = ['Parity', 'Accessibility', 'Documentation', 'Motion', 'Migration', 'Products', 'System', 'Style guide'];
  // The Status page's table: which area it is sorted by (#status/parity), and which chip is chosen.
  var todoArea = 'Parity';
  // The column the table is sorted by and which way (1 up, -1 down), the sort's arrow, and the table's columns.
  var todoKey = 'Parity', todoDir = -1;
  var MX_COLS = ['Component', 'Figma', 'Code', 'Parity', 'Accessibility', 'Documentation', 'Last checked'];
  // Each column's states in one word, the same in the table, the cards and the chips.
  var MX_WORD = { code: { found: 'Built', css: 'CSS only', unsure: 'Unsure', missing: 'Missing' } };
  // One order for a column's states, the cards' legends and the filters' lists alike: done first, then what is to
  // check, then what is to fix, then what was not tried.
  var MX_ORDER = ['Found', 'Built', 'Match', 'Met', 'Written', 'Partial', 'Unsure', 'Review', 'Missing', 'Differs', 'Issues', 'Untested', 'N/A'];
  var MX_CHIP_COLS = [
    ['Figma', 'figma', function (o) { return o.figma ? 'Found' : 'Missing'; }],
    ['Code', 'code', function (o) { return MX_WORD.code[o.code]; }],
    ['Parity', 'par', function (o) { return o.par.say; }],
    ['Accessibility', 'acc', function (o) { return o.acc.say; }],
    ['Documentation', 'doc', function (o) { return o.doc.say; }]
  ];
  var MX_COL_OF = { figma: 'Figma', code: 'Code', par: 'Parity', acc: 'Accessibility', doc: 'Documentation' };
  var MX_AREAS = ['Parity', 'Accessibility', 'Documentation'];
  // The Status page's address says what it shows, so a link opens it as it is: the area it is sorted by
  // (#status/parity), each filter (?code=Missing&doc=Missing), a sort another than the area's (sort=Component&dir=up),
  // and the component open in the panel with its tab and filter (open=c-chip/accessibility?st=todo).
  var MX_FILTERS = {}, PANEL_PATH = null;
  function todoLink() {
    if (ALL || hashParts().id !== 'status') return;
    var q = [];
    Object.keys(MX_FILTERS).forEach(function (k) { if (MX_FILTERS[k]) q.push(k + '=' + encodeURIComponent(MX_FILTERS[k])); });
    if (todoKey && todoKey !== todoArea) q.push('sort=' + encodeURIComponent(todoKey));
    if (todoDir > 0 && todoKey) q.push('dir=up');
    if (PANEL_PATH) q.push('open=' + encodeURIComponent(PANEL_PATH));
    var h = '#status' + (todoArea ? '/' + todoArea.toLowerCase() : '') + (q.length ? '?' + q.join('&') : '');
    if (h !== location.hash) history.replaceState(null, '', h);
  }
  // A card's next step: the table sorted by its area, only the components with work left, brought up under the bar.
  // key: the column to sort by when it is not the area's own (the Code column for what the code lacks).
  // A chip's list, as the Brand selector's: open on a click or the arrow keys, the arrow keys, Home and End move, Enter
  // or Space picks, Escape or Tab closes, a click outside closes.
  function mxMenu(btn, open, back) {
    var list = document.getElementById(btn.getAttribute('aria-controls')); if (!list) return;
    var opts = Array.prototype.slice.call(list.querySelectorAll('[role="option"]'));
    var setActive = function (i) { list._i = Math.max(0, Math.min(opts.length - 1, i)); opts.forEach(function (o, k) { o.classList.toggle('is-active', k === list._i); }); if (opts[list._i]) list.setAttribute('aria-activedescendant', opts[list._i].id); };
    if (!list._wired) {
      list._wired = true;
      list.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(list._i + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(list._i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); setActive(0); }
        else if (e.key === 'End') { e.preventDefault(); setActive(opts.length - 1); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (opts[list._i]) opts[list._i].click(); }
        else if (e.key === 'Escape') { e.preventDefault(); mxMenu(btn, false, true); }
        else if (e.key === 'Tab') mxMenu(btn, false);
      });
      list.addEventListener('mousemove', function (e) { var o = e.target.closest('[role="option"]'); if (o) setActive(opts.indexOf(o)); });
      btn.addEventListener('keydown', function (e) { if (/^(ArrowDown|ArrowUp)$/.test(e.key)) { e.preventDefault(); mxMenu(btn, true); } });
    }
    if (open) {
      Array.prototype.forEach.call(document.querySelectorAll('.sg-chip-menu[aria-expanded="true"]'), function (b) { if (b !== btn) mxMenu(b, false); });
      list.hidden = false; btn.setAttribute('aria-expanded', 'true');
      var sel = opts.map(function (o) { return o.getAttribute('aria-selected'); }).indexOf('true'); setActive(sel < 0 ? 0 : sel); list.focus({ preventScroll: true });
      btn._outside = function (e) { if (!btn.parentElement.contains(e.target)) mxMenu(btn, false); }; document.addEventListener('mousedown', btn._outside, true);
    } else {
      list.hidden = true; btn.setAttribute('aria-expanded', 'false');
      if (btn._outside) document.removeEventListener('mousedown', btn._outside, true);
      if (back) btn.focus();
    }
  }
  function goTask(area, chip, key) {
    var box = td.querySelector('.sg-todo'); if (!box) return;
    todoArea = area || null; todoKey = key || todoArea; todoDir = -1;
    // The chips a card's count is made of (Documentation's: in Figma, in the code, documentation Missing), the rest cleared.
    MX_FILTERS = {}; if (chip && typeof chip === 'object') Object.keys(chip).forEach(function (k) { MX_FILTERS[k] = chip[k]; }); else if (chip) MX_FILTERS[chip.split(':')[0]] = chip.split(':').slice(1).join(':');
    showTodoArea(box); todoLink();
    var table = box.querySelector('.sg-matrix'), head = box.querySelector('.sg-todo-head');
    if (table) window.scrollTo({ top: table.getBoundingClientRect().top + window.scrollY - (head ? head.offsetHeight + (parseFloat(getComputedStyle(head).top) || 0) : 0), behavior: 'smooth' });
  }
  // A row's arrow opens the component's own page in a panel over the Status page, the same view as its page (loaded
  // whole, without the menu and the bar: ?embed); a cell's arrow opens it on that area, filtered to what is to fix or
  // to decide. The X, Escape or a click outside closes it, the focus going back to the arrow.
  var MX_X = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
  // Close the panel: two arrows pointing back to the right, the way it came.
  var MX_COLLAPSE = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5 7.5 8 4 11.5M8.5 4.5 12 8l-3.5 3.5"/></svg>';
  // Open on that area: a diagonal arrow, drawn as the page's other marks are.
  var MX_DIAG = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 11 11 5M6 5h5v5"/></svg>';
  var LINK_GO = MX_DIAG.replace('<svg ', '<svg class="sg-link-go" ');   // the arrow after a link pill's words
  var MX_ARROW = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
  // The panel's page: this one, embedded, in the same theme and modes (its address less the embed flag, plus it).
  function panelBase() { var search = location.search.replace(/([?&])embed(=[^&]*)?(&|$)/, '$1').replace(/[?&]$/, ''); return location.pathname + search + (search ? '&' : '?') + 'embed'; }
  // Loaded once, in the background, after the page settles, and kept (parked out of sight) when the panel closes: opening
  // a component then only changes the page's address inside, so it shows at once instead of loading the whole guide again.
  function preloadComponentPanel() {
    if (html.classList.contains('sg-embed') || !COMPONENTS.length) return;
    var m = componentPanel(), frame = m.querySelector('.sg-comp-panel-frame');
    if (m._open || frame._base === panelBase()) return;
    m.classList.add('is-parked'); m.hidden = false;
    frame._base = panelBase(); frame._loaded = false; frame.src = frame._base + '#' + homeId();
  }
  function openComponentPanel(name, href, area, filter, from) {
    var m = componentPanel();
    var frame = m.querySelector('.sg-comp-panel-frame'), path = href + (area ? '/' + area : '') + (filter ? '?st=' + filter : '');
    m.querySelector('.sg-comp-panel-box').setAttribute('aria-label', name);
    m.querySelector('.sg-comp-panel-close').setAttribute('aria-label', 'Close ' + name);
    frame.title = name;
    PANEL_PATH = path.slice(1);
    var w = null; try { w = frame._loaded && frame._base === panelBase() ? frame.contentWindow : null; } catch (e) { w = null; }
    if (w) { try { if (w.__sgClosePanels) w.__sgClosePanels(); w.scrollTo(0, 0); w.location.replace(w.location.pathname + w.location.search + path); } catch (e) { w = null; } }   // an item opens on its first level: nothing the last one opened inside stays open   // the page already there: only its address, no new history entry
    if (!w) { frame.classList.remove('is-ready'); frame._base = panelBase(); frame._loaded = false; frame.src = frame._base + path; }
    frame.setAttribute('data-at', panelBase() + path);   // the address shown inside, loaded or only routed to
    todoLink();
    m.classList.remove('is-parked'); m.hidden = false; m._from = from || null; document.documentElement.classList.add('sg-panel-open');
    m._open = true;
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (m._open) m.classList.add('is-open'); }); });   // unless closed in the meantime
    m.querySelector('.sg-comp-panel-box').focus({ preventScroll: true });   // the dialog itself, so no ring shows on its close button; Tab reaches it next
  }
  function componentPanel() {
    var m = document.getElementById('sg-comp-panel');
    if (!m) {
      m = document.createElement('div'); m.id = 'sg-comp-panel'; m.className = 'sg-comp-panel'; m.hidden = true;
      // The page alone, sliding in from the right at the window's full height, its close button hanging off its edge.
      m.innerHTML = '<div class="sg-comp-panel-scrim" data-panel-close></div><div class="sg-comp-panel-box" role="dialog" aria-modal="true" tabindex="-1">' +
        '<button type="button" class="sg-btn sg-comp-panel-close" data-panel-close aria-label="Close">' + MX_COLLAPSE + '</button>' +   // first, so Tab reaches it before the page
        '<iframe class="sg-comp-panel-frame" title="Component"></iframe></div>';
      // Shown once the page inside has its own colours: never a white flash while it loads.
      m.querySelector('.sg-comp-panel-frame').addEventListener('load', function () {
        if (this.getAttribute('src') === 'about:blank') return;
        this._loaded = true; this.classList.add('is-ready');
        // Its tab and filter, as the page inside writes them, written into this page's address too.
        var w = this.contentWindow, follow = function () { try { var hh = w.location.hash.slice(1), cur = PANEL_PATH; if (hh && cur !== null && hh !== cur) { PANEL_PATH = hh; todoLink(); } } catch (e) { /* another origin */ } };
        try { w.addEventListener('hashchange', follow); w.addEventListener('popstate', follow); var rs = w.history.replaceState.bind(w.history); w.history.replaceState = function () { rs.apply(null, arguments); follow(); }; } catch (e) { /* another origin */ }
      });
      (document.querySelector('.sg-layout') || document.body).appendChild(m);   // inside the page's frame: its colour roles, its brand
      m.addEventListener('click', function (e) { if (e.target.closest('[data-panel-close]')) closeComponentPanel(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && e.isTrusted && m._open) { e.preventDefault(); closeComponentPanel(); } });   // a person's Escape, never the accessibility try's
    }
    return m;
  }
  // Every panel this page holds over itself (a row's, a token's), closed at once: what a component's page opened inside
  // a panel never opens again with it. A panel's page holding a component's page calls it on the page inside.
  window.__sgClosePanels = function () {
    Array.prototype.forEach.call(document.querySelectorAll('.sg-comp-panel:not(#sg-comp-panel)'), function (p) { p._open = false; p.classList.remove('is-open'); p.hidden = true; });
    if (!(document.getElementById('sg-comp-panel') || {})._open) document.documentElement.classList.remove('sg-panel-open');
  };
  var closeInner = function (frame) { try { var w = frame && frame.contentWindow; if (w && w.__sgClosePanels) w.__sgClosePanels(); } catch (e) { /* another origin */ } };
  function closeComponentPanel() {
    var m = document.getElementById('sg-comp-panel'); if (!m || !m._open) return;
    closeInner(m.querySelector('.sg-comp-panel-frame'));   // the next item opens on its first level only
    m._open = false; m.classList.remove('is-open'); document.documentElement.classList.remove('sg-panel-open');
    PANEL_PATH = null; todoLink();
    setTimeout(function () { if (!m._open) m.classList.add('is-parked'); }, 200);   // after it slides out: parked, its page kept for the next one
    if (m._from && document.contains(m._from)) m._from.focus();
  }
  // Opened from an address: sorted by the area it names, else by what is left in all of them; every component shown.
  function openTodoKind(slug, q) {
    var box = td.querySelector('.sg-todo');
    // With none named, by Parity (the first card), the most left first, its arrow showing.
    todoArea = MX_AREAS.filter(function (a) { return a.toLowerCase() === String(slug || '').toLowerCase(); })[0] || 'Parity';
    todoKey = todoArea; todoDir = -1;
    // What the address asks for: its filters, its sort, the component open in the panel.
    MX_FILTERS = {};
    if (q) {
      Object.keys(MX_COL_OF).forEach(function (k) { if (q.get(k)) MX_FILTERS[k] = q.get(k); });
      if (q.get('sort') && MX_COLS.indexOf(q.get('sort')) >= 0) todoKey = q.get('sort');
      if (q.get('dir') === 'up') todoDir = 1;
    }
    if (box) showTodoArea(box);
    var open = q && q.get('open');
    if (open && open !== PANEL_PATH) { var id = open.split(/[/?]/)[0], c = COMPONENTS.filter(function (x) { return cid(x.name) === id; })[0]; openComponentPanel(c ? c.name : id, '#' + open, '', '', null); }
    else if (!open && PANEL_PATH) closeComponentPanel();
  }
  // The chip chosen shows its rows; the sort puts what has most to fix first, in the area chosen or in all of them.
  function showTodoArea(box) {
    var body = box.querySelector('.sg-matrix tbody'); if (!body) return;
    var col = todoArea ? MX_COLS.indexOf(todoArea) : -1, F = MX_FILTERS, ci = MX_COLS.indexOf(todoKey), dir = ci < 0 ? -1 : todoDir;
    var on = Object.keys(F).filter(function (k) { return F[k]; });
    var passes = function (r, but) { return on.every(function (k) { return k === but || r.getAttribute('data-st-' + k) === F[k]; }); };
    var rows = Array.prototype.filter.call(body.rows, function (r) { return r.classList.contains('sg-mx-row'); });
    // What a row is sorted on: its name, Found before Missing, its date, or in an area (or all of them) what is left.
    var val = function (r) {
      if (ci < 0) return [+r.dataset.fix, +r.dataset.dec];
      if (ci === 0) return [r.dataset.name.toLowerCase()];
      var d = r.cells[ci].dataset;
      return ci === 1 || ci === 2 ? [d.ok === '1' ? 0 : 1] : ci === 6 ? [d.at || ''] : [+d.rank || 0, +d.fix, +d.dec];
    };
    rows.sort(function (a, b) {
      var x = val(a), y = val(b);
      for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return (x[i] < y[i] ? -1 : 1) * dir;
      return a.dataset.name.localeCompare(b.dataset.name);
    });
    rows.forEach(function (r) {
      body.appendChild(r); r.hidden = !passes(r);
    });
    tableNone(body.parentNode, 'components');
    Array.prototype.forEach.call(box.querySelectorAll('.sg-chip-menu'), function (b) {
      var g = b.dataset.mxg, w = F[g] || '', list = document.getElementById(b.getAttribute('aria-controls'));
      b.querySelector('.sg-chip-word').textContent = w || 'All';
      b.setAttribute('aria-pressed', w ? 'true' : 'false');
      Array.prototype.forEach.call(list ? list.querySelectorAll('[role="option"]') : [], function (o) {
        var ow = o.dataset.mx.slice(g.length + 1), n = rows.filter(function (r) { return passes(r, g) && (!ow || r.getAttribute('data-st-' + g) === ow); }).length;
        o.querySelector('.sg-count').outerHTML = countHTML(n);
        o.setAttribute('aria-selected', ow === w ? 'true' : 'false');
        o.hidden = !!ow && !n && ow !== w;   // a state the other chips leave no row in is not offered
        if (ow && ow === w) b.querySelector('.sg-chip-n').innerHTML = countHTML(n);   // chosen: its count on the chip too
      });
      if (!w) b.querySelector('.sg-chip-n').innerHTML = '';
    });
    var clear = box.querySelector('[data-mx-clear-all]'); if (clear) clear.hidden = !on.length;
    Array.prototype.forEach.call(box.querySelectorAll('.sg-matrix th[data-sort]'), function (th) { th.setAttribute('aria-sort', th.dataset.sort === todoKey ? (todoDir > 0 ? 'ascending' : 'descending') : 'none'); });
    todoHeadHeight();
  }
  // What the browser found on each component. Tried once while the page was built (--styleguide opens it in a browser
  // and keeps the results in it, sg-a11y-baked): the Status page and every Accessibility area show those results at
  // once, the final ones, with nothing running in the viewer's browser. A component the build could not try is tried in
  // the viewer's browser and kept there, so it is never tried again until it changes. Each component's own signature
  // (what is drawn and what its accessibility check reads) and the page's (its styles and scripts) say whether what was
  // kept still holds; what the data says (the audit, the code) is read again on every visit.
  function sigOf(text) { var h = 5381; for (var i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  // The build's own run: the page opened by --styleguide to try a share of the components (#status?bake=1/4).
  var BAKING = !ALL && /(^|[?&])bake=\d+\/\d+/.test(location.hash);
  var BAKED = null;
  try { BAKED = JSON.parse((document.getElementById('sg-a11y-baked') || {}).textContent || 'null'); } catch (e) { BAKED = null; }
  function compSig(c) { return PAGE_SIG + '.' + sigOf(COMP_DATA[c.name] || ''); }
  // Each theme its own results (a theme changes the colours contrast is measured on): the ones shown are the chosen
  // theme's, the default one when none is. An older page's single set (BAKED.results) is the default one's.
  var themeKey = function (k) { return k && ((DATA.brands && DATA.brands.list) || []).some(function (b) { return b.key === k; }) ? k : 'default'; };
  var A11Y_THEME = themeKey(html.getAttribute('data-brand') || URLQ.get('brand') || (function () { try { return localStorage.getItem('sg-brand'); } catch (e) { return null; } })());
  function bakedFor(t) { return !BAKED ? null : BAKED.themes ? BAKED.themes[t] || null : t === 'default' ? BAKED.results || null : null; }
  var A11Y_BASE = 'sg-a11y-kept', A11Y_KEY = A11Y_BASE + ':' + A11Y_THEME;
