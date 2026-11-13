  // A component the build went through with nothing to try in a browser is kept too (live: null), so it is not tried here.
  function useKept(c, k, baked) {
    if (!k || k.sig !== compSig(c) || !(k.live || baked)) return;
    c.__a11y = { items: (c.a11y ? a11yStaticItems(c) : []).concat(k.items || []), live: k.live || null, liveItems: k.items || [], baked: !!baked };
    if (k.parts) c.__textParts = k.parts;   // its text parts, as drawn when it was tried, named in what a person checks
  }
  // Results kept from an earlier build (the page's own, or saved with the snapshots) count wherever the component is the
  // same as when it was tried, the build included: it tries only what changed since.
  function loadA11y() {
    var baked = bakedFor(A11Y_THEME) || {};
    COMPONENTS.forEach(function (c) { useKept(c, baked[c.name], true); });
    if (!BAKING) {
      try { var kept = JSON.parse(localStorage.getItem(A11Y_KEY) || 'null') || {}; COMPONENTS.forEach(function (c) { if (!c.__a11y) useKept(c, kept[c.name], false); }); } catch (e) { /* none kept */ }
    }
  }
  loadA11y();
  // Another theme chosen: its own results, and what it has not tried yet is tried as it is shown.
  document.addEventListener('sg-brand', function (e) {
    var t = themeKey(e.detail); if (t === A11Y_THEME) return;
    A11Y_THEME = t; A11Y_KEY = A11Y_BASE + ':' + t;
    COMPONENTS.forEach(function (c) { c.__a11y = null; c.__textParts = null; });
    loadA11y(); fillTodo(); redrawAll();
  });
  function keepA11y() {
    if (BAKING) return;
    try {
      var o = JSON.parse(localStorage.getItem(A11Y_KEY) || 'null') || {};
      COMPONENTS.forEach(function (c) { if (c.__a11y && c.__a11y.live && !c.__a11y.baked) o[c.name] = { sig: compSig(c), live: c.__a11y.live, items: c.__a11y.liveItems || [], parts: c.__textParts || [] }; });
      localStorage.setItem(A11Y_KEY, JSON.stringify(o));
    } catch (e) { /* not kept: tried again next time */ }
  }
  // What this page tried, for the build to keep in the page: { name: { sig, live, items } }.
  window.__sgA11yResults = function () { var o = {}; COMPONENTS.forEach(function (c) { if (c.__a11y) o[c.name] = { sig: compSig(c), live: c.__a11y.live || null, items: c.__a11y.liveItems || [], parts: c.__textParts || [] }; }); return o; };
  fillTodo();
  if (fillDocs) { fillDocs(); fillDocs = null; }
  // Every component not tried yet in this browser, one after another, while the Status page is open: each built out of
  // sight, its Accessibility check run as its own area runs it, kept, then the list drawn again with what it found.
  var sweepAt = 0, sweeping = false, sweepMissed = [], partFailed = {};
  // The components the sweep tried and could not measure in the browser (nothing drawn to try), for the build to name.
  window.__sgSweepMissed = function () { return sweepMissed.slice(); };
  // A component the sweep draws out of sight can take the focus on its own (a modal that opens, a field that focuses
  // itself): while a person is on a control of the page, any focus that lands out of sight goes straight back to them.
  var personFocus = null;
  document.addEventListener('focusin', function (e) {
    var t = e.target, away = t && t.closest && t.closest('.pg-offstage');
    if (away) { if (personFocus && personFocus.isConnected && personFocus !== t && !personFocus.closest('.pg-offstage')) personFocus.focus({ preventScroll: true }); return; }
    personFocus = t && t !== document.body ? t : null;
  }, true);
  document.addEventListener('focusout', function () { setTimeout(function () { if (!document.activeElement || document.activeElement === document.body) personFocus = null; }, 0); }, true);
  // The try in this browser waits while the person uses the page (a pointer moving, a key, a tooltip open, and two
  // seconds after): each component tried draws the Status page again, which would close what they are reading.
  var lastTouch = 0;
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(function (t) { document.addEventListener(t, function (e) { if (e.isTrusted) lastTouch = Date.now(); }, { capture: true, passive: true }); });
  var personBusy = function () { return !BAKING && (Date.now() - lastTouch < 2000 || !!document.querySelector('.sg-tip:hover, .sg-tip:focus-within, .sg-comp-panel:not([hidden])')); };
  function a11ySweep() {
    // The component panel (?embed) is this page again: the page around it tries every component already.
    if (ALL || sweeping || html.classList.contains('sg-embed')) return;
    // Only once the page has loaded (its fonts, its images): before then a component's check waits for the load, and the
    // sweep would pass it untried, its facts never measured.
    if (document.readyState !== 'complete') { if (!a11ySweep.waiting) { a11ySweep.waiting = true; window.addEventListener('load', function () { setTimeout(function () { a11ySweep.waiting = false; a11ySweep(); }, 60); }, { once: true }); } return; }
    var list = COMPONENTS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    var share = /(?:^|[?&])bake=(\d+)\/(\d+)/.exec(location.hash);
    if (BAKING && share) list = list.filter(function (c, i) { return i % +share[2] === +share[1]; });
    sweeping = true;
    (function next() {
      if (sweepAt >= list.length || hashParts().id !== 'status') { sweeping = false; if (sweepAt >= list.length) { sweepAt = 0; window.__sgSweepDone = true; } keepA11y(); fillTodo(); return; }
      if (personBusy() && !(list[sweepAt].__a11y && (list[sweepAt].__a11y.live || list[sweepAt].__a11y.baked))) return setTimeout(next, 500);
      var c = list[sweepAt++], id = cid(c.name);
      if (c.__a11y && (c.__a11y.live || c.__a11y.baked)) return setTimeout(next, 0);
      // Its part first, as its page needs it: loaded, then this component tried. One whose part cannot be read is not
      // tried, and named with those the sweep could not measure.
      if (!partHere(c) && !partFailed[c.name] && needPart(c, function (ok) { if (!ok) partFailed[c.name] = true; setTimeout(next, 0); })) { sweepAt--; return; }
      if (partFailed[c.name]) { if (!c.__a11y) c.__a11y = { items: c.a11y ? a11yStaticItems(c) : [], live: null }; if (sweepMissed.indexOf(c.name) < 0) sweepMissed.push(c.name); return setTimeout(next, 0); }
      var sec = null; try { sec = document.getElementById(id) || (BUILDERS[id] && BUILDERS[id]()); } catch (e) { setTimeout(next, 0); throw e; }
      if (!sec || !sec._a11yRun) { if (!c.__a11y) c.__a11y = { items: c.a11y ? a11yStaticItems(c) : [], live: null }; return setTimeout(next, 0); }   // nothing to try in a browser
      sec.hidden = false; sec.classList.add('pg-offstage');
      var finish = function () {
        sec.classList.remove('pg-offstage');
        // Only the page being viewed shows: the person may have moved on while this one was tried.
        var here = document.getElementById(hashParts().id || homeId()); if (!here || !here.matches('main > section')) here = document.getElementById('index');
        Array.prototype.forEach.call(main.children, function (k) { if (k.matches('section, .sg-hr')) k.hidden = k !== here; });
        // The next one is tried whatever happens here: one component's error never stops the rest.
        try { if (!c.__a11y) c.__a11y = { items: c.a11y ? a11yStaticItems(c) : [], live: null }; if (!c.__a11y.live && sec.querySelector('.pg-a11y-rows') && sweepMissed.indexOf(c.name) < 0) sweepMissed.push(c.name); keepA11y(); fillTodo(); } finally { setTimeout(next, 30); }
      };
      try { sec._a11yRun(finish); } catch (e) { finish(); }
    })();
  }
  // The criteria with their status for the component, from its items and how each criterion is known. live: what this
  // page's run tried ({ ran: { check: 1 }, tried, usedN }), or null before it ran (and on the page of every component).
  // Each criterion with its status for the component (the rows its Accessibility area shows, and what the Status page
  // gathers): [{ k, st, its, note, how, fig }].
  function a11yStatus(c, items, live) {
    var a = c.a11y || {}, ch = a.checked, audited = a.audited;
    var tried = !!live || !!(audited && audited.ran.indexOf('wcag21') >= 0);
    var by = {};
    items.forEach(function (it) { (by[it.sc] = by[it.sc] || []).push(it); });
    // The criteria, then what the checks look at beyond them (forced colours, reduced motion): each a row of its own,
    // in its own words, never a criterion (wcag21.mjs BEYOND_AA). They are the audit's: both are emulated through the
    // browser's protocol, which this page cannot do, so a row reads Run the audit until one has run.
    var crit = (WCAG ? WCAG.criteria.slice() : []);
    if (WCAG && WCAG.beyond) WCAG.beyond.forEach(function (b) { crit.push({ sc: b.sc, name: b.name, level: '', how: b.how, kinds: b.kinds, says: b.says, browser: b.browser, extra: true, beyond: true }); });
    // A criterion the checks stand for beyond WCAG 2.2 A and AA (a AAA one: a focus ring's thickness, a comfortable target): listed when it has a
    // finding, named as its label names it.
    Object.keys(by).forEach(function (sc) {
      if (crit.some(function (k) { return k.sc === sc; })) return;
      if (/\(beyond WCAG 2\.2 at A and AA\)$/.test(by[sc][0].label || '')) return;   // its own row is already in the list
      var m = /WCAG [\d.]+ (.+) \((A+)\)$/.exec(by[sc][0].label || '');
      crit.push({ sc: sc, name: m ? m[1] : '', level: m ? m[2] : '', how: 'auto', says: 'Beyond WCAG 2.2 at A and AA (a AAA criterion), advisory.', extra: true });
    });
    var rows = crit.map(function (k) {
      var its = (by[k.sc] || []).filter(function (it) { return it.st !== 'none'; }), st = null, note = '';
      var fig = (a.notes || []).filter(function (n) { return n.sc.indexOf(k.sc) >= 0; }).map(function (n) { return n.text; });
      var how = (WCAG_HOW[k.how] || '') + (fig.length ? ', with the Figma annotation' + (fig.length > 1 ? 's ' : ' ') + fig.join(', ') : '');
      var texts = /^(1\.3\.3|1\.4\.5|3\.1\.2|1\.4\.12|2\.4\.6)$/.test(k.sc) && (c.__textParts || []).length ? ', its ' + c.__textParts.join(', ') : '';
      var person = k.person ? 'On ' + c.name + texts + ', a person checks that ' + k.person.replace(/^\w/, function (x) { return x.toLowerCase(); }) : '';
      if (k.extra && !k.beyond) st = 'done';
      else if (k.how === 'page') st = null;   // the page that uses it answers for it
      else if (k.how === 'media' && !(live && live.ran.media)) st = null;   // it plays no video or sound
      else if (k.how === 'person' || (k.how === 'media' && !k.kinds)) { st = 'check'; note = person; }
      else if (k.how === 'static') { st = WCAG.staticRan ? 'done' : 'check'; note = WCAG.staticRan ? 'Passes, its code read. ' + k.says : 'Read once the audit runs over the code.'; }
      else if (k.how === 'audit') {
        var did = audited && audited.ran.indexOf(WCAG_AUDIT[k.sc]) >= 0;
        st = did ? 'done' : 'check';
        // Not tried by the audit that ran: a component the code has no markup for is built first; one it did not reach is
        // tried by running it again.
        var why = ch && ch.notRead ? ch.why || '' : null;
        note = did ? 'Passes, tried by the last audit in a browser. ' + k.says : why != null ? (/no markup/.test(why) ? 'Build ' + c.name + ' in the code: the audit tries this once the page draws it from the code.' : 'The last audit could not try ' + c.name + ': ' + plainWhy(why) + '. Run it again once that is fixed.') : !audited ? 'Run the audit, it tries this on ' + c.name + ' in a browser.' : WCAG_AUDIT[k.sc] === 'reflow' ? 'The last audit did not try ' + c.name + ' 320 pixels wide. Run it again.' : 'The last audit did not get to ' + c.name + '. Run it again.';
      } else if (k.ran && live && !k.ran.some(function (r) { return live.ran[r]; }) && !its.length) st = null;   // nothing in it that this asks about
      else if (!tried && !(ch && !ch.notRead)) { st = 'check'; note = 'Tried on ' + c.name + ' when its Accessibility area is open.'; }
      else {
        st = k.person ? 'check' : 'done';
        var used = /^(1\.4\.13|2\.5\.2|3\.2\.1|3\.2\.2)$/.test(k.sc) && live && live.usedN != null, n = used ? live.usedN : live && live.tried;
        // Done says what passed and where it was tried, in the words of the criterion; one a person still checks says
        // that no problem was found, then what the person looks at.
        var where = live ? (n === 1 ? 'the variant tried' : 'all ' + n + ' variants' + (used ? ' that can be used' : '')) : 'the last audit in a browser';
        note = its.some(function (it) { return it.st === 'done'; }) ? person : k.person ? 'No problem found in ' + where + '. ' + person : 'Passes in ' + where + '. ' + k.says;
      }
      // What asks of a control or a field, on a component with none in any variant: not asked of it (unless a finding says
      // otherwise).
      if (live && !live.ran.control && /^(2\.1\.1|2\.1\.2|2\.4\.3|2\.4\.7|2\.5\.2|2\.5\.3|3\.2\.1|3\.2\.2|4\.1\.2|1\.4\.13)$/.test(k.sc)) { st = null; its = its.filter(function (it) { return it.st === 'todo'; }); }
      if (live && !live.ran.field && /^(3\.3\.1|3\.3\.2|3\.3\.3|1\.3\.5)$/.test(k.sc)) { st = null; its = its.filter(function (it) { return it.st === 'todo'; }); }
      // Beyond A and AA (a AAA criterion) a finding is advice: something to check and decide, never a must-fix.
      if (its.some(function (it) { return it.st === 'todo'; })) st = k.extra ? 'check' : 'todo';
      else if (its.some(function (it) { return it.st === 'check'; }) && st) st = 'check';
      else if (!st && its.some(function (it) { return it.st === 'done'; })) st = 'done';
      // What a person checked by hand: Done, by whom and when, while the component is as it was then; once it has
      // changed, to check again, saying who checked it before. Asked of a person only: a finding still open keeps it open.
      var ok = k.person && st === 'check' && !its.some(function (it) { return it.st === 'todo' || it.st === 'check'; }) && (a.confirmed || {})[k.sc];
      // What it was checked with, when the person said: a criterion read out loud is only checked for the pair that
      // read it, so the page says which rather than letting the row stand for every browser and screen reader.
      // A record is testimony, never a measurement: nothing confirms the screen reader was running, or that it said
      // what the person reports. The row still reads Done - their word is what the criterion asks for - but it says
      // whose word it is, what they checked with (or that they did not say), and that the engine measured none of it.
      var withSaid = ok && ok.using ? ', in ' + ok.using : ', and they did not say what they checked with';
      var said = false;
      if (ok && ok.current) { st = 'done'; said = true; note = 'Said by ' + ok.by + ' on ' + String(ok.at).slice(0, 10) + withSaid + ': their word, not a measurement the engine made. ' + k.person; }
      else if (ok) note = 'Said by ' + ok.by + ' on ' + String(ok.at).slice(0, 10) + withSaid + ', before ' + c.name + ' changed - and their word, not a measurement. ' + person;
      if (k.person && st === 'check' && !its.some(function (it) { return it.st === 'todo'; })) note += ' Once someone has checked it, record it as checked and this row reads Done.';
      if (!st) return null;
      return { k: k, st: st, its: its, note: note, how: how, fig: fig, said: said };
    }).filter(Boolean);
    return rows;
  }
  // What is open on its Accessibility area, as the area counts it: { todo, say } (3 to fix, 5 to check).
  function a11yOpen(c, items, live) {
    var rows = [];
    try { rows = a11yStatus(c, items || (c.__a11y ? c.__a11y.items : c.a11y ? a11yStaticItems(c) : []), live !== undefined ? live : c.__a11y ? c.__a11y.live : null).filter(function (r) { return !r.k.extra; }); } catch (e) { rows = []; }
    var fix = rows.filter(function (r) { return r.st === 'todo'; }).length, check = rows.filter(function (r) { return r.st === 'check'; }).length + unreadRows(c).filter(isOpen).length;
    return { todo: fix + check > 0, say: [fix ? fix + ' to fix' : '', check ? check + ' to check' : ''].filter(Boolean).join(', ') };
  }
  // Its Accessibility rows, one per criterion, in the table every issue shares: the criterion (what it means opens from
  // its name) under the area; what Figma's annotations state for it; what was found (each finding with its own sign, or
  // what passed and where); what to do (each finding's fix, else what a person checks or what still has to run, else
  // what the criterion asks); who acts; its status; when and where it was read. To fix first, then to check, then done;
  // what goes beyond WCAG 2.2 A and AA last, apart. Each row keeps its criterion, items and note (k, its, note) for the
  // Status page.
  function a11yIssueRows(c, items, live) {
    var rows = a11yStatus(c, items, live), ch = c.a11y && c.a11y.checked;
    var order = { todo: 0, check: 1, done: 2 }, num = function (sc) { return sc.split('.').map(function (x) { return ('000' + x).slice(-3); }).join('.'); };
    rows.sort(function (p, q) { return (!!p.k.extra - !!q.k.extra) || order[p.st] - order[q.st] || (num(p.k.sc) < num(q.k.sc) ? -1 : 1); });
    return rows.map(function (r) {
      // "1.4.3 Contrast (Minimum) (AA)" for a criterion; "Forced colours: icons, borders… " for a row beyond A and AA,
      // written exactly as the engine labels its findings (styleguide-data.mjs wcagLabel).
      var name = r.k.sc + (r.k.beyond ? ': ' : ' ') + r.k.name + (r.k.level ? ' (' + r.k.level + ')' : '');
      var found = r.its.map(function (it) { var y = STATUS[it.st] || STATUS.done; return '<div class="pg-a11y-item"><span class="pg-par--' + y[2] + '"><span class="pg-par-sign" aria-hidden="true">' + y[0] + '</span></span> ' + it.html + '</div>'; }).join('');
      // Its note, as the area always said it under what was found (never on a row to fix): what passed and where stays
      // there; what a person checks, or what has still to run, is what to do.
      var note = r.st === 'todo' ? '' : r.note || '', act = '', cut = note.indexOf('On ' + c.name);
      if (/a person checks that/.test(note) && cut >= 0) { act = note.slice(cut); note = note.slice(0, cut).trim(); }
      else if (/^(Run the audit|Build .* in the code: the audit|For every component|The last audit did not get|Tried on .* when its Accessibility area is open|Read once the audit runs)/.test(note)) { act = note; note = ''; }
      if (note) found += '<div class="pg-a11y-item pg-a11y-quiet">' + esc(note) + '</div>';
      // Where it was tried, by what the criterion depends on: the same in every browser, in each browser (and only
      // Chrome runs today), or Chrome alone for what a screen reader hears.
      var triedLine = WCAG && WCAG.tried ? WCAG.tried[r.k.browser || 'same'] : '';
      if (triedLine) found += '<div class="pg-a11y-item pg-a11y-quiet">' + esc(triedLine) + '</div>';
      // What to do: each open finding's own fix, then what a person checks or what has still to run; a finding with no
      // fix of its own, what the criterion asks.
      var todos = [];
      r.its.forEach(function (it) { if (it.todo && it.st !== 'done' && todos.indexOf(it.todo) < 0) todos.push(it.todo); });
      if (act) todos.push(esc(act));
      // The few short things to do to see it (wcag21.mjs), so two people checking the same criterion check the same
      // way, and the command that records it with who checked and what they checked with.
      if (r.k.steps && r.k.steps.length && r.st === 'check') {
        todos.push('<ol class="pg-a11y-steps">' + r.k.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
          '<p class="pg-a11y-say">Then say so: <code>rms-design-system-engine --checked ' + esc(c.name) + ' ' + esc(r.k.sc) + ' --by "&lt;name&gt;" --with "&lt;browser and screen reader&gt;"</code></p>');
      }
      // A finding with no fix of its own: what the criterion asks, said where it is fixed (the colours in Figma and in the
      // code when the system has both, else the code), as who acts says.
      if (!todos.length && r.st === 'todo' && r.k.says) todos.push(esc((COLOUR_SC.test(r.k.sc) ? (HAS_FIGMA ? 'Change the colours in Figma and in the code so ' : 'Change the colours in the code so ') : 'Change the code so ') + r.k.says.replace(/^\w/, function (k) { return k.toLowerCase(); })));
      // The wordings a model listed for this criterion on this component (--judge-a11y): what to look at first, in
      // its own words, marked as a reading of the words and not a decision - the row's status is untouched by it.
      var listed = ((WCAG && WCAG.judged && WCAG.judged[c.name] ? WCAG.judged[c.name].words : []) || []).filter(function (w) { return w.sc === r.k.sc && w.verdict !== 'fine'; });
      if (listed.length) todos.push('<p class="pg-a11y-listed">' + esc(listed.length === 1 ? 'One wording to look at first, from a model\'s reading of the words (it decides nothing):' : listed.length + ' wordings to look at first, from a model\'s reading of the words (it decides nothing):') + '</p><ul class="pg-a11y-listed-list">' +
        listed.map(function (w) { return '<li><b>' + esc('"' + w.text + '"') + '</b> ' + esc('(' + w.where + (w.verdict === 'unclear' ? ', unclear from the words alone' : '') + ')') + (w.why ? ' - ' + esc(w.why) : '') + '</li>'; }).join('') + '</ul>');
      // What is still to be tried once the audit runs in a browser: running it is what to do.
      if (!todos.length && r.st === 'check' && r.its.some(function (it) { return /Tried once the audit runs/.test(it.html); })) todos.push(esc('Run the audit, it tries this on ' + c.name + ' in a browser.'));
      var open = r.its.filter(function (it) { return it.st !== 'done'; });
      // Who acts: the code's when the code fails it (a role not stated in Figma beside it waits its turn), else the first
      // finding's own, else how the criterion is known.
      var failed = open.some(function (it) { return it.st === 'todo' && !it.who; });
      var own = failed ? null : r.its.map(function (it) { return it.who; }).filter(Boolean)[0];
      // The people this criterion owes work to, each with their own steps: a finding can owe two of them a step each
      // (a colour pair picked in Figma, then used in the code), so one criterion becomes one row per person. A row
      // with nothing of its own keeps the single answer a11yWho gives.
      // A row that is done still says who did it, so a team can see its own work as well as its own backlog.
      var byWho = [], seen = {}, from = r.st === 'done' ? r.its : open;
      from.forEach(function (it) {
        (it.tasks || []).forEach(function (t) {
          var g = seen[t.who] || (seen[t.who] = { who: t.who, todos: [], step: t.step, steps: t.steps });
          if (g.todos.indexOf(t.todo) < 0) g.todos.push(t.todo);
          if (t.step > g.step) { g.step = t.step; g.steps = t.steps; }
          if (byWho.indexOf(g) < 0) byWho.push(g);
        });
      });
      byWho.sort(function (p, q) { return p.step - q.step || ORDER.indexOf(p.who) - ORDER.indexOf(q.who); });
      // Where it is read from: each finding's own source, else how the criterion is known; Figma's annotations stand in
      // the Figma column.
      var src = [];
      r.its.forEach(function (it) { if (it.from && src.indexOf(it.from) < 0) src.push(it.from); });
      // A criterion a person answered is read from their word, and the row says so where every other row says which
      // measurement it came from.
      if (r.said) { var sb = (c.a11y.confirmed || {})[r.k.sc] || {}; src.unshift('A person\'s word (' + (sb.by || 'someone') + ', ' + String(sb.at || '').slice(0, 10) + ')'); }
      if (!src.length) src.push(r.k.how === 'audit' && c.a11y && c.a11y.checked && c.a11y.checked.at ? auditOn(c.a11y.checked.at) : WCAG_SRC[r.k.how] || r.how || '');
      // Its date, its own check's: tried now on this page, the last audit's day, else when the page was built (what the
      // code and Figma said then).
      var rowAt = src.indexOf(FROM_PAGE) >= 0 ? (live && live.at) || new Date().toISOString() : src.some(function (x) { return /^Tested (on|at the last audit)/.test(x); }) ? (ch && ch.at) || DATA.builtAt || null : DATA.builtAt || null;
      var base = { key: c.name + '\u0000a:' + r.k.sc, area: 'Accessibility', kind: name, kindHTML: ALL ? esc(name) : tipHTML((r.k.beyond ? '' : 'WCAG ') + name, '', { label: name, parts: [['What it means', r.k.says], ['How it is checked', r.how]] }),
        figma: r.fig.map(function (x) { return '<div>' + esc(x) + '</div>'; }).join(''), code: found, todo: todos.map(function (x) { return '<div>' + x + '</div>'; }).join(''),
        who: r.st === 'todo' || r.st === 'check' ? (r.k.extra ? WHO.both : own || a11yWho(r.k.sc, r.k.how, open, r.note)) : '', st: r.st, at: rowAt, src: src, extra: !!r.k.extra, said: !!r.said, fresh: open.some(function (it) { return it.fresh; }), k: r.k, its: r.its, note: r.note,
        // To check only because its check has not run yet (no audit, not reached, not built, not opened): not a check that ran.
        unrun: r.st === 'check' && (/^(Run the audit|Build .* in the code: the audit|The last audit did not|Tried on .* when its Accessibility area is open|Read once the audit runs)/.test(act || r.note || '') || r.its.some(function (it) { return /Tried once the audit runs/.test(it.html); })) };
      // Owed to one person, or to nobody yet: the row as it was. Owed to several: one row each, with that person's
      // steps alone, and the step said (1 of 2) so a row read on its own still says it follows another's.
      // Nothing open to split (a row that is done, or one with no task of its own): one row, carrying every person it
      // touches, so a filter on any of them still finds it.
      if (!base.who || byWho.length < 2) {
        base.whoKey = byWho.length ? byWho.map(function (g) { return g.who; }).join(' ') : (WHO_OF[base.who] || '');
        return [base];
      }
      return byWho.map(function (g) {
        return Object.assign({}, base, { key: base.key + '\u0000' + g.who, whoKey: g.who, who: WHO[g.who] + teamNote(c.name),
          step: g.step, steps: g.steps, todo: g.todos.map(function (x) { return '<div>' + esc(capital(x)) + '</div>'; }).join('') });
      });
    }).reduce(function (a, b) { return a.concat(b); }, []);
  }

  // A text that shows only while a boolean is on (Show Text and Text Content, show-label and label-content, or both
  // acting on the same part) comes right after that boolean, which decides whether it is seen; the rest keep their
  // order and nothing is left out. list: the controls in Figma's order; propOf(item) its prop, or none.
  // Whether an on/off prop shows a text prop's words (Show Text and Text Content, or both acting on the same part).
  function showsText(b, t) {
    var word = function (x, cut) { return String(x || '').toLowerCase().replace(cut, '').replace(/[^a-z0-9]+/g, ''); };
    var n = word(b.label, /^\s*show[\s_-]*/); return b.type === 'BOOLEAN' && t.type === 'TEXT' && ((n && n === word(t.label, /[\s_-]*content\s*$/)) || (!!b.part && b.part === t.part));
  }
  // A control with no name only in the variants where an on/off prop hides its words (an icon-only button, a box with no
  // text): it fails as it is, and what to do is the product's, which names it where it uses it that way. sets: the props
  // of each variant it fails in; props: the component's. → what to do, or '' when it fails with its words shown too.
  function namedWhereUsed(sets, props) {
    var bools = props.filter(function (b) { return props.some(function (x) { return showsText(b, x); }); }), offs = [];
    var every = sets.length && sets.every(function (set) {
      var off = bools.filter(function (b) { var v = b.label in set ? set[b.label] : !!b.default; return v === false || v === 'false'; });
      off.forEach(function (b) { if (offs.indexOf(b.label) < 0) offs.push(b.label); });
      return off.length > 0;
    });
    return every && offs.length ? 'With ' + offs.join(' or ') + ' off it shows no words, so nothing names it. Where a product uses it that way, give it a name there: an aria-label, or aria-labelledby on words beside it. Say so in its Usage.' : '';
  }
  function showFirst(list, propOf) {
    var out = list.slice(), shows = showsText;
    out.filter(function (k) { var p = propOf(k); return p && p.type === 'TEXT'; }).forEach(function (t) {
      var b = out.find(function (k) { var p = propOf(k); return p && shows(p, propOf(t)); });
      if (!b) return;
      out.splice(out.indexOf(t), 1); out.splice(out.indexOf(b) + 1, 0, t);
    });
    return out;
  }

  function buildCard(c) {
    var props = c.controls || [];
    var state = {};
    function byDefault(p) { return p.type === 'BOOLEAN' ? !!p.default : (p.default == null ? '' : String(p.default)); }
    props.forEach(function (p) { state[p.label] = byDefault(p); });
    // A link to the variant shown: the props set away from their defaults and the width, read when it opens, so a
    // shared link opens exactly that variant. A value the component does not have is left at its default.
    function fromLink(q) {
      if (!q) return false; var any = false;
      props.forEach(function (p) {
        if (!q.has(p.label)) return; var v = q.get(p.label);
        if (p.type === 'BOOLEAN') { if (v !== 'true' && v !== 'false') return; state[p.label] = v === 'true'; }
        else if (p.type === 'VARIANT') { if (!(p.options || []).some(function (o) { return o.label === v && !o.unbuilt; })) return; state[p.label] = v; }
        else state[p.label] = v;
        any = true;
      });
      if (q.has('width') && WIDTHS.some(function (w) { return w[0] === q.get('width'); })) { WIDTH = q.get('width'); any = true; }
      return any;
    }
    function linkFor() {
      var q = props.filter(function (p) { return state[p.label] !== byDefault(p); }).map(function (p) { return encodeURIComponent(p.label) + '=' + encodeURIComponent(String(state[p.label])); });
      if (WIDTH !== 'fit') q.push('width=' + WIDTH);
      // The props set are the Playground's: only its address carries them; another area's address is the area alone.
      var onPlay = !areaNow || areaNow === 'play';
      // Another area keeps what its own address says: its filter and the panel open in it (st, panel).
      if (!onPlay) { var now = hashParts(); if (now.area === areaNow && now.q) ['st', 'show', 'panel'].forEach(function (k) { if (now.q.get(k)) q.push(k + '=' + encodeURIComponent(now.q.get(k)).replace(/%2F/g, '/').replace(/%3A/g, ':')); }); }
      var keep = onPlay ? q : q.filter(function (x) { return /^(st|show|panel)=/.test(x); });
      return '#' + sec.id + (onPlay ? '' : '/' + AREA_SLUG[areaNow]) + (keep.length ? '?' + keep.join('&') : '');
    }
    // Kept as the variant changes, without a new step in the browser's history; only while this view is the one shown.
    var probing = false;   // a test draw (where a text lands) is never written to the address or into a width frame
    // While the area the address names is not shown yet, nothing is written over it.
    function writeLink() { if (ALL || probing || hashParts().id !== sec.id) return; if (!areaNow && hashParts().area) return; var h = linkFor(); if (h !== location.hash) history.replaceState(null, '', h); }
    var sec = document.createElement('section'); sec.id = cid(c.name); sec.className = 'sg-section pg-card-section';
    if (!ALL && hashParts().id === sec.id) fromLink(hashParts().q);
    var facts = factsOf(c), states = componentStates(c);
    // Its documentation: Figma's description and annotations first, then the code's own note.
    var figDesc = c.description && c.description.replace(/@\w+/g, '').trim();
    var figNotes = (c.annotations || []).filter(function (a) { return a && a !== figDesc; });
    // What is not one of the kinds the Coverage page counts: Figma's notes, its slots, the code's own note when Figma has
    // the description (else the note is what it is, above).
    var docRows = (figNotes.length ? '<div><dt>From Figma</dt><dd>' + figNotes.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('') + '</dd></div>' : '') +
      (c.slots ? '<div><dt>Slots</dt><dd>' + c.slots.map(function (sl) {
        var what = sl.preferredOnly ? (sl.preferred.length ? 'Takes only ' + sl.preferred.join(', ') : sl.preferredCount ? 'Takes only its ' + (sl.preferredCount === 1 ? 'preferred component' : sl.preferredCount + ' preferred components') : 'Set in Figma to take only preferred components, with none listed yet') : (sl.preferred.length ? 'Takes any content; suggested ' + sl.preferred.join(', ') : 'Takes any content the product puts in it');
        var count = sl.min && sl.max ? ', ' + sl.min + ' to ' + sl.max + ' items' : sl.min ? ', at least ' + sl.min + (sl.min === 1 ? ' item' : ' items') : sl.max ? ', at most ' + sl.max + ' items' : '';
        return '<p><b>' + esc(sl.name) + '</b> ' + esc(what + count + '.' + (sl.emptyAtFirst ? ' Empty until the product fills it.' : '') + (sl.description ? ' ' + sl.description : '')) + '</p>';
      }).join('') + '</dd></div>' : '') +
      (c.note && figDesc ? '<div><dt>From the code</dt><dd><p>' + esc(c.note) + '</p></dd></div>' : '') +
      // Its file and the props its code declares, for a component only the code has (no Figma props to show them by).
      (c.codeOnly ? '<div><dt>In the code</dt><dd><p><code>' + esc(c.codeOnly.file) + '</code></p>' + ((c.codeOnly.props || []).length ? '<ul class="pg-code-props">' + c.codeOnly.props.map(function (p) {
        return '<li><code>' + esc(p.name) + '</code>' + (p.options ? ' ' + esc(p.options.join(' | ')) : '') + (p.default != null ? ', ' + esc('default ' + p.default) : '') + (p.required ? ', required' : '') + '</li>';
      }).join('') + '</ul>' : '<p>No props declared.</p>') + '</dd></div>' : '');
    sec.innerHTML =
      '<div class="pg-header"><div class="sg-section-badge">Component</div>' +
        // Its name, and at its top right where else it lives (its Figma node, its code, the team's pages).
        '<div class="pg-head"><h2>' + esc(c.name) + '</h2>' + headLinksHTML(c.links) + '</div>' +
        // A part: placed only inside its root, documented in the root's page.
        (parentOf(c.name) && COMPONENTS.some(function (x) { return x.name === parentOf(c.name); }) ? '<p class="pg-status"><span class="sg-status">Part</span><span>Of <a class="sg-uses-link" href="#' + esc(cid(parentOf(c.name))) + '/parts">' + esc(parentOf(c.name)) + '</a>, placed only inside it. Its documentation is in ' + esc(parentOf(c.name)) + '\'s page.</span></p>' : '') +
        // A component only the code has: said at its top, so nothing on its page reads as agreed with Figma.
        (c.codeOnly ? '<p class="pg-status pg-code-only"><span class="sg-status sg-status--code-only">Only in the code</span><span>' + (c.codeOnly.figma ? 'Figma has no component for it: compared with nothing in Figma.' : 'No Figma data yet: compared with nothing in Figma.') + '</span></p>' : '') +
        // One the code has only as a CSS class: said at its top, so its preview and its missing props read for what they are.
        (cssOnly(c) ? '<p class="pg-status pg-code-only"><span class="sg-status sg-status--code-only">Missing in the code</span><span>' + esc('The code has only its CSS class' + (c.cls ? ' (.' + c.cls + ')' : '') + ', no component file: it is not a component of the code yet, so it has no props to read or try, and its preview is drawn from Figma.') + '</span></p>' : '') +
        // Connected by the project's own Code Connect: a badge, its file named on hover.
        // (its status, Code Connect and test coverage open the line of its class, version and last change, below)
        // Retired and still in use: what replaces it and how much still moves, each place a row of the Status page.
        (c.migration ? '<p class="pg-status pg-migration">' + (c.status ? '' : statusPill({ kind: 'deprecated', status: 'Deprecated' })) + '<span>' + esc((c.migration.toName ? 'Use ' + c.migration.toName + ' instead. ' : 'Nothing replaces it yet. ') + 'Still used in ' + c.migration.count + (c.migration.count === 1 ? ' place' : ' places') + ' (' + c.migration.products.map(function (p) { return p.name + ' ' + p.count; }).join(', ') + '), each on the ') + '<a href="#status">Status</a> page.</span></p>' : '') +
        // Its class, its version, when it last changed and how to import it: one line, wrapping only when the room runs out.
        '<div class="pg-meta">' + (c.coverage || c.codeConnect || !c.codeOnly ? '<p class="pg-status"' + (c.coverage || c.codeConnect ? '' : ' hidden') + '>' + (c.codeConnect ? '<span class="sg-status sg-status--connected" title="' + esc('Code Connect: ' + c.codeConnect.file) + '">' + CODE_CONNECT_SVG + 'Code Connect</span>' : '') + (c.coverage ? '<span>Tests cover ' + esc(String(Math.round(c.coverage.lines))) + '% of its lines</span>' : '') + '</p>' : '') + (c.cls ? '<p class="pg-selector"><code>' + esc(/^#/.test(c.cls) ? c.cls : '.' + c.cls) + '</code></p>' : '') + (ALL ? '' : factsHTML(c)) + '</div>' +
      '</div>' +
      // Each area says where it stands: Parity, Accessibility and Documentation in the Status row's own words and dots
      // (componentStates), Motion with the system's alert icon while something moves otherwise than Figma.
      '<div class="pg-areas"><div class="pg-areas-scroll">' + tabsHTML(AREAS.filter(function (a) { return (a[0] !== 'products' || copyRows(c).length) && (a[0] !== 'built' || builtUses(c).length) && (a[0] !== 'parts' || (c.parts || []).length) && (a[0] !== 'variants' || (!ALL && variantRows(c).length)) && (a[0] !== 'api' || !!apiHTML(c) || !!docRows || !!importHTML(c)); }).map(function (a) {
        // Parity, Accessibility and Documentation carry their state, the Status row's word (componentStates); Motion,
        // which the Status page does not rate, its alert icon while something is to do.
        if (AREA_STATE[a[0]]) return { v: a[0], label: a[1], state: states[AREA_STATE[a[0]]] };
        // Motion carries the same dot as the other areas: something to fix, else matched where it moves.
        var f = a[0] === 'motion' ? motionOpen(c) : null;
        if (f && f.todo) return { v: a[0], label: a[1], state: { cls: 'differs', say: f.say } };
        return { v: a[0], label: a[1], state: f && motionIssueRows(c).length ? { cls: 'match', say: 'Match' } : null };
      })) + '</div></div>' +
      // Playground: the component drawn, its controls, the tokens behind what is drawn and its code.
      '<div class="pg-area" data-area="play">' +
      '<div class="pg-stage"><div class="pg-preview-card' + (isBig(c) ? ' pg-preview-card--tall' : '') + '"><div class="pg-preview-col"><div class="pg-stage-bar pg-stage-bar--top"><div class="pg-stage-mode"></div><div class="pg-stage-tools"></div></div><div class="pg-preview"></div><div class="pg-frame" hidden></div><div class="pg-anatomy" hidden></div><div class="pg-stage-bar pg-stage-bar--bottom"><div class="pg-actions"></div><p class="pg-anat-line" hidden></p><div class="pg-stage-mode"></div></div><div class="pg-panel-grip" role="separator" aria-orientation="vertical" aria-label="Controls width" tabindex="0" title="Drag to resize the controls. Double-click to reset."></div></div><div class="pg-panel">' +
        (ALL ? '' : '<div class="pg-ctl pg-width"><div class="pg-ctl-label">Width</div>' + segHTML(WIDTHS.map(function (w) { return { v: w[0], label: w[1] }; }), 'Width') + '</div>') +
        '<div class="pg-controls"></div></div></div>' +
        (ALL || !(c.figmaShots || []).length ? '' : '<div class="pg-inspect pg-compare" hidden><div class="pg-inspect-head">Figma beside the code</div><div class="pg-compare-bar">' + segHTML([{ v: 'side', label: 'Side by side' }, { v: 'over', label: 'Over' }], 'Figma beside the code') +
          '<label class="pg-ctl-label pg-compare-amount">How much of Figma shows <input type="range" min="0" max="100" value="50"></label></div><div class="pg-compare-body"></div></div>') +
        // The tokens behind what is drawn now, following every change made here, its code on their right. Every token the
        // component has is in Parity.
        '<div class="pg-code-row"><div class="pg-inspect"><div class="pg-inspect-head">Tokens</div><table class="pg-tokens"></table></div>' +
        '<div class="pg-code"><div class="pg-code-head"><span class="pg-code-title">' + (c.api && c.api.tag ? 'Code' : 'HTML') + '</span>' + '<button type="button" class="sg-token-link" data-copy>Copy code</button>' + '<span class="sg-hidden-text" role="status"></span></div><pre><code></code></pre></div></div>' + '</div>' +
      '</div>' +
      // Variants: every option of each variant prop and both sides of each on/off prop, one per row, the other props as the Playground sets them.
      (ALL || !variantRows(c).length ? '' : '<div class="pg-area" data-area="variants"><div class="pg-footer"><div class="pg-variants"></div></div></div>') +
      // Documentation: Figma's and the code's own words, and when each side last changed.
      '<div class="pg-area" data-area="docs"><div class="pg-footer">' + naInfo(states.doc) +
        knowledgeHTML(c) +
        '</div></div>' +
      // API: its props (each one the code says must be given marked), the events it sends and its slots, as the code has them.
      // with its Details (its slots and what each takes), how it is built rather than how it is used.
      // Code: how a product brings it in (its import, its file), then its API and its Details.
      (apiHTML(c) || docRows || importHTML(c) ? '<div class="pg-area" data-area="api"><div class="pg-footer">' + codeImportHTML(c) + apiHTML(c) +
        (docRows ? '<div class="pg-doc"><h3>Details</h3><dl class="pg-updated">' + docRows + '</dl></div>' : '') + '</div></div>' : '') +
      // Motion: how it moves, as a spec, the code's beside Figma's.
      '<div class="pg-area" data-area="motion"><div class="pg-footer">' + motionHTML(c) + '</div></div>' +
      '<div class="pg-area" data-area="a11y"><div class="pg-footer">' + naInfo(states.acc) + a11yHTML(c) + '</div></div>' +
      '<div class="pg-area" data-area="parity"><div class="pg-footer">' + (states.par.say === 'N/A' ? naInfo(states.par) : parityHTML(c)) + '</div></div>' +
      (builtUses(c).length ? '<div class="pg-area" data-area="built"><div class="pg-footer"><div class="pg-doc">' + builtWithHTML(c) + '</div></div></div>' : '') +
      ((c.parts || []).length ? '<div class="pg-area" data-area="parts"><div class="pg-footer"><div class="pg-doc">' + partsHTML(c) + '</div></div></div>' : '') +
      '<div class="pg-area" data-area="used"><div class="pg-footer"><div class="pg-doc">' + usedInHTML(c) + '</div></div></div>' +
      // Products: a class a product styles almost as this one, a decision each (use it, or add the new one on purpose).
      (copyRows(c).length ? '<div class="pg-area" data-area="products"><div class="pg-footer"><div class="pg-doc pg-par">' + issueTableHTML(byStatus(copyRows(c)), '', '', 'Products') + '</div></div></div>' : '') +
      '<div class="pg-area" data-area="log"><div class="pg-footer"><div class="pg-doc">' + changelogHTML(c) + '</div></div></div>';
    var preview = sec.querySelector('.pg-preview'), controlsEl = sec.querySelector('.pg-controls'), frame = sec.querySelector('.pg-frame');
    // A component taller than the stage: the room above and below it shrinks first (to the stage's least), then the stage
    // grows to it, so it always shows whole and centred, never cut at the bottom with the room left at the top.
    (function () {
      var box = preview && preview.closest('.pg-preview-card'), col = preview && preview.closest('.pg-preview-col'); if (!box || !col) return;
      var watched = null, ro = window.ResizeObserver ? new ResizeObserver(function () { fit(); }) : null;
      var fit = function () {
        var kids = Array.prototype.filter.call(preview.children, function (k) { return k.offsetHeight; }); if (!kids.length) return;
        box.style.removeProperty('--pg-stage-room'); box.classList.remove('pg-preview-card--fit');
        var top = Infinity, bottom = -Infinity; kids.forEach(function (k) { var r = k.getBoundingClientRect(); top = Math.min(top, r.top); bottom = Math.max(bottom, r.bottom); });
        var content = bottom - top, room = parseFloat(getComputedStyle(box).getPropertyValue('--pg-stage-room')) || 0, xl = getComputedStyle(document.documentElement).getPropertyValue('--sg-space-xl').trim(), least = (parseFloat(xl) * (/rem$/.test(xl) ? 16 : 1)) || 24;
        var avail = (parseFloat(getComputedStyle(col).maxHeight) || Infinity) - (col.offsetHeight - preview.offsetHeight);
        if (content + 2 * room <= avail) return;
        var r2 = Math.floor((avail - content) / 2);
        if (r2 >= least) box.style.setProperty('--pg-stage-room', r2 + 'px');
        else { box.style.setProperty('--pg-stage-room', least + 'px'); box.classList.add('pg-preview-card--fit'); }
      };
      var watch = function () { var k = preview.firstElementChild; if (ro && k !== watched) { if (watched) ro.unobserve(watched); if (k) ro.observe(k); watched = k; } fit(); };
      if (window.MutationObserver) new MutationObserver(watch).observe(preview, { childList: true });
      watch();
    })();
    // Its Used in: the Showroom's screens built with it, each the Showroom's own card, drawn to its width once shown.
    if (SHOWROOM_CARD) Array.prototype.forEach.call(sec.querySelectorAll('.pg-usedin-screens'), function (box) {
      box.dataset.screens.split(' ').forEach(function (k) {
        var s = (DATA.showroom || []).filter(function (x) { return x.key === k; })[0]; if (!s) return;
        var card = SHOWROOM_CARD(s); box.appendChild(card);
        var th = card.querySelector('.sg-thumb');
        if (card._fit && th && typeof ResizeObserver !== 'undefined') new ResizeObserver(function () { card._fit(); }).observe(th);
      });
    });
    // The component at a chosen width: a frame of that width holding the page's own stylesheets, the icon sheet and the
    // component as drawn now, so the system's media queries apply; scaled down to fit the room, never up. It is live
    // too: the system's scripts run in it and it can be used, by mouse or keyboard.
    function renderFrame() {
      if (!frame || probing) return;
      // Inspecting: the anatomy stands in for both, drawn at the Width chosen.
      if (inspecting) { frame.hidden = true; frame.innerHTML = ''; preview.hidden = true; requestAnimationFrame(drawAnatomy); return; }
      if (WIDTH === 'fit' || ALL) { frame.hidden = true; frame.innerHTML = ''; preview.hidden = false; return; }
      var w = WIDTHS.find(function (x) { return x[0] === WIDTH; });
      preview.hidden = true; frame.hidden = false;
      var head = Array.prototype.map.call(document.querySelectorAll('style, link[rel="stylesheet"]'), function (n) { return n.outerHTML; }).join('');
      var attrs = function (el, only) { return Array.prototype.filter.call(el.attributes, function (a) { return !only || only.test(a.name); }).map(function (a) { return ' ' + a.name + '="' + esc(a.value) + '"'; }).join(''); };
      var sheet = document.querySelector('body > svg');
      var html = '<!doctype html><html' + attrs(document.documentElement) + '><head><meta charset="utf-8">' + head + '</head><body style="margin:0">' + (sheet ? sheet.outerHTML : '') +
        '<div class="pg-frame-stage"' + attrs(preview, /^data-/) + '>' + Array.prototype.map.call(preview.children, function (n) { return n.outerHTML; }).join('') + '</div>' +
        // The system's own scripts run in the frame too, so it works there as in a product (a selection moves, an overlay opens).
        Array.prototype.map.call(document.querySelectorAll('script[data-system-script]'), function (n) { return n.outerHTML; }).join('') + '</body></html>';
      frame.innerHTML = '<div class="pg-frame-device"><div class="pg-frame-label">' + esc(w[1] + ' · ' + w[2] + 'px wide') + '</div><div class="pg-frame-box"><iframe title="' + esc(c.name + ' at ' + w[2] + ' pixels wide') + '"></iframe></div></div>';
      var box = frame.querySelector('.pg-frame-box'), ifr = frame.querySelector('iframe');
      ifr.style.width = w[2] + 'px';
      // Written in at once (a font stylesheet the page links can keep a load waiting), then sized to what it holds,
      // again whenever that or the room changes (a font arriving, the window resized).
      // A component opened with a width already chosen is drawn before its page is on screen: the frame then has no
      // document yet, so it is drawn on the next frame, once the page is placed.
      var d = ifr.contentDocument;
      if (!d) { if (!frame.isConnected) requestAnimationFrame(function () { if (frame.isConnected) renderFrame(); }); return; }
      d.open(); d.write(html); d.close();
      var st = d.querySelector('.pg-frame-stage');
      selectionMoves(st);   // a click moves a selection here too, as in the live preview
      function fit() {
        var h = Math.max(120, Math.ceil(st.getBoundingClientRect().height)), fcs = getComputedStyle(frame);
        var room = frame.clientWidth - parseFloat(fcs.paddingLeft) - parseFloat(fcs.paddingRight), k = Math.min(1, (room > 0 ? room : w[2]) / w[2]);
        ifr.style.height = h + 'px'; ifr.style.transform = 'scale(' + k + ')'; box.style.width = w[2] * k + 'px'; box.style.height = h * k + 'px';
      }
      fit();
      if (window.ResizeObserver) { var ro = new ResizeObserver(fit); ro.observe(st); ro.observe(frame); }
      ifr.addEventListener('load', fit);
    }
    var widthBar = sec.querySelector('.pg-width');
    var compareBtn = null, compareOn = false;
    function showWidth(v) {
      WIDTH = v; writeLink();
      if (v !== 'fit' && compareOn) { compareOn = false; if (compareBtn) compareBtn.setAttribute('aria-pressed', 'false'); }
      if (widthBar) segItems(widthBar).forEach(function (b) { segSelect(b, b.dataset.v === v); });
      renderFrame();
    }
    if (widthBar) segItems(widthBar).forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.v !== WIDTH) showWidth(b.dataset.v); }); });
    if (widthBar) segItems(widthBar).forEach(function (b) { segSelect(b, b.dataset.v === WIDTH); });   // the width last chosen
    docCards(sec);
    labelCells(sec);
    var tTokens = sec.querySelector('.pg-tokens');
    // The code as tall as what it holds, never taller than the tokens beside it: past their height it scrolls inside.
    // On its own row, its own height.
    var codeBox = sec.querySelector('.pg-code'), tokBox = tTokens && tTokens.closest('.pg-inspect');
    function codeHeight() {
      if (!codeBox || !tokBox) return;
      codeBox.style.maxHeight = '';
      if (tokBox.offsetHeight && Math.abs(codeBox.offsetTop - tokBox.offsetTop) < 2) codeBox.style.maxHeight = tokBox.offsetHeight + 'px';
    }
    if (window.ResizeObserver && tokBox) new ResizeObserver(codeHeight).observe(tokBox);
    // The code for what the preview shows now: the component as a product writes it (its tag and the props set here,
    // each value as the code spells it; a prop the code requires and the playground does not set is written with …),
    // else the HTML the preview draws. Copied by the system's own button.
    var codeEl = sec.querySelector('.pg-code code'), copyBtn = sec.querySelector('.pg-code [data-copy]'), copySaid = sec.querySelector('.pg-code [role="status"]');
    function showCode(e) { codeEl.innerHTML = codeColours(c.api && c.api.tag ? callCode(c, props, state) : htmlCode(e)); }
    copyBtn.addEventListener('click', function () { copyText(codeEl.textContent, copyBtn, copySaid); });
    Array.prototype.forEach.call(sec.querySelectorAll('[data-copy-text]'), function (b) { b.addEventListener('click', function () { copyText(b.getAttribute('data-copy-text'), b, b.parentNode.querySelector('[role="status"]')); }); });
    Array.prototype.forEach.call(sec.querySelectorAll('[data-download]'), function (b) { b.addEventListener('click', function () { download(b.getAttribute('data-download')); }); });
    // One area at a time (every one at once on the measuring page, ?all); the one chosen stays chosen on the next
    // component. A link to the parity area from the line that says what differs.
    var areaBar = sec.querySelector('.pg-areas');
    // What sticks under the areas (every table's head) knows how tall they are.
    var areasHeight = function () { stickHeight(sec); };
    if (window.ResizeObserver) new ResizeObserver(areasHeight).observe(areaBar); else areasHeight();
    // Its title row (its name, its Figma and Code links) sticks at the top as the page scrolls, the areas under it: both
    // plain bars that keep their size, so nothing moves as they stick.
    var headRow = sec.querySelector('.pg-head');
    if (headRow) { var headHeight = function () { sec.style.setProperty('--pg-head-h', stuckH(headRow) + 'px'); areasHeight(); }; headHeight(); if (window.ResizeObserver) new ResizeObserver(headHeight).observe(headRow); }
    function showArea(v, kept) {
      // The area last chosen, kept for the next component only when that one has it (not every one is built with others).
      if (!sec.querySelector('.pg-area[data-area="' + v + '"]')) v = 'play';   // Specs, once its own area, is in the Playground
      if (!kept) AREA = v;
      areaNow = v;
      Array.prototype.forEach.call(sec.querySelectorAll('.pg-area'), function (a) { a.hidden = !ALL && a.getAttribute('data-area') !== v; });
      segItems(areaBar).forEach(function (b) { tabSelect(b, b.dataset.v === v); });
      // The area chosen in view in the scrolling bar, the page itself left where it is.
      var strip = areaBar.querySelector('.pg-areas-scroll'), on = segItems(areaBar).find(function (b) { return b.dataset.v === v; });
      if (strip && on && strip.scrollWidth > strip.clientWidth) { var sr = strip.getBoundingClientRect(), br = on.getBoundingClientRect(); if (br.left < sr.left || br.right > sr.right) strip.scrollLeft += br.left < sr.left ? br.left - sr.left - 8 : br.right - sr.right + 8; }
      if (v === 'play') { nudge(); codeHeight(); if (inspecting) requestAnimationFrame(drawAnatomy); }
      if (v === 'variants') requestAnimationFrame(drawVariants);
      if (v !== 'a11y' && wcagStop) wcagStop();
      if (v === 'a11y') checkLive();
      if (v === 'built' || v === 'parts') requestAnimationFrame(function () { builtThumbs(sec); });
      if (!kept) writeLink();   // the address names the area, to send someone straight to it
      markTaskCols(sec);
      stickHeight(sec);   // its cards' heads, now in view, measured for the table heads under them
    }
    segItems(areaBar).forEach(function (b) { b.addEventListener('click', function () { showArea(b.dataset.v); }); });
    Array.prototype.forEach.call(sec.querySelectorAll('[data-area-go]'), function (b) { b.addEventListener('click', function () { showArea(b.getAttribute('data-area-go')); }); });
    sec._area = showArea;
    // Anatomy: a copy of the component as the Playground draws it now, larger, with each part numbered (a slot outlined
    // in the accent), each padding and gap outlined and numbered after them and named by its token in the list (numbers,
    // never colours, so nothing reads as a token's colour), and how it lines its items up.
    // One that covers the window has none (a modal is drawn as its card). Never on the measuring page (?all).
    var anatBox = sec.querySelector('.pg-anatomy'), drawnWidth = 0;
    // Its parts, paddings and gaps, measured on root (a copy of the live component, as the Playground sets it): each part
    // outlined and numbered in reading order (a slot in the accent), each padding and gap outlined and numbered after
    // them, and how it lines up its items. box(el) gives a rect in the drawing's own coordinates, mark and num draw.
    function annotate(root, box, mark, num) {
      function px(v) { return parseFloat(v) || 0; }
      var spacing = [];
      function spaces(el, label) {
        var b = box(el), cs = getComputedStyle(el);
        var bt = px(cs.borderTopWidth), br = px(cs.borderRightWidth), bb = px(cs.borderBottomWidth), bl = px(cs.borderLeftWidth);
        var pt = px(cs.paddingTop), pr = px(cs.paddingRight), pb = px(cs.paddingBottom), pl = px(cs.paddingLeft);
        var iw = b.w - bl - br, ih = b.h - bt - bb;
        var band = { top: [b.x + bl, b.y + bt, iw, pt], bottom: [b.x + bl, b.y + b.h - bb - pb, iw, pb], left: [b.x + bl, b.y + bt + pt, pl, ih - pt - pb], right: [b.x + b.w - br - pr, b.y + bt + pt, pr, ih - pt - pb] };
        var sideCss = { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft };
        // Each band says what it is when Specs picks it: its side and the token behind it.
        Object.keys(band).forEach(function (side) { mark('pg-anat-space', band[side], { key: label + ' padding ' + side, what: label + ' padding ' + side, value: sideTok(el, sideCss[side], 'pad') }); });
        // Each listed padding is numbered on its own band: top for all four or top and bottom, left for left and right.
        if (pt || pr || pb || pl) padRows(el, cs).forEach(function (r) { if (r[1] === '0') return; var side = /left/.test(r[0]) ? 'left' : /right/.test(r[0]) ? 'right' : /bottom$/.test(r[0]) && !/top/.test(r[0]) ? 'bottom' : 'top'; spacing.push({ what: label + ' ' + r[0].replace(/-/g, ' '), value: r[1], at: band[side], key: label + ' padding ' + side }); });
        var flex = /flex|grid/.test(cs.display), row = /^row/.test(cs.flexDirection) && !/grid/.test(cs.display);
        if (!flex || !px(row ? cs.columnGap : cs.rowGap)) return;
        var kids = Array.prototype.filter.call(el.children, function (n) { var ncs = getComputedStyle(n); var r = n.getBoundingClientRect(); return ncs.position !== 'absolute' && ncs.position !== 'fixed' && r.width > 0 && r.height > 0; })
          .map(box).sort(function (q, z) { return row ? q.x - z.x : q.y - z.y; });
        var first = null;
        for (var i = 1; i < kids.length; i++) {
          var q = kids[i - 1], z = kids[i], at = null;
          if (row && z.x - (q.x + q.w) > 0.5) at = [q.x + q.w, b.y + bt + pt, z.x - q.x - q.w, ih - pt - pb];
          if (!row && z.y - (q.y + q.h) > 0.5) at = [b.x + bl + pl, q.y + q.h, iw - pl - pr, z.y - q.y - q.h];
          if (at) { mark('pg-anat-space', at, { key: label + ' gap', what: label + ' gap', value: sideTok(el, row ? cs.columnGap : cs.rowGap, 'gap') }); first = first || at; }
        }
        if (first) spacing.push({ what: label + ' gap', value: sideTok(el, row ? cs.columnGap : cs.rowGap, 'gap'), at: first, key: label + ' gap' });
      }
      // Its parts: the contract's named parts, else the elements directly inside it. Seen only: a part drawn hidden (a
      // native input under its drawn box, at no opacity) is not one a person sees.
      function seen(n) { var r = n.getBoundingClientRect(), ncs = getComputedStyle(n); return r.width > 1 && r.height > 1 && ncs.visibility !== 'hidden' && ncs.opacity !== '0'; }
      function nameOf(n) { var cls = (n.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0]; return n.tagName.toLowerCase() === 'svg' ? 'icon' : cls || (n.children.length ? 'group' : n.textContent.trim() ? 'text' : n.tagName.toLowerCase()); }
      // A layer Figma named on its own (Frame 106) says nothing: its class names it instead.
      var named = (c.anatomy || []).map(function (p) { var hit = partsOf(root, p.selector).filter(function (n) { return n !== root && seen(n); })[0]; return hit ? { el: hit, name: /^(frame|group|rectangle|ellipse|vector|instance)\s*\d+$/i.test(p.name) ? nameOf(hit) : p.name, slot: p.slot || (!!c.slots && /slot/i.test(nameOf(hit))) } : null; }).filter(Boolean);
      var parts = named.concat(Array.prototype.filter.call(root.children, function (n) { return seen(n) && !named.some(function (p) { return p.el === n || p.el.contains(n) || n.contains(p.el); }); }).map(function (n) { return { el: n, name: nameOf(n), slot: !!c.slots && /slot/i.test(nameOf(n)) }; }));
      // Numbered in reading order: top to bottom, then start to end.
      parts.sort(function (q, z) { var ra = q.el.getBoundingClientRect(), rz = z.el.getBoundingClientRect(); var sameLine = ra.top < rz.bottom && rz.top < ra.bottom; return sameLine ? ra.left - rz.left : ra.top - rz.top; });
      parts = parts.filter(function (p, i) { return parts.findIndex(function (q) { return q.el === p.el; }) === i; }).slice(0, 12);
      spaces(root, c.name);
      parts.forEach(function (p) { if (p.el.children.length) spaces(p.el, p.name); });
      parts.forEach(function (p, i) { var b = box(p.el); p.key = 'part ' + (i + 1) + ' ' + p.name; mark('pg-anat-part' + (p.slot ? ' is-slot' : ''), [b.x, b.y, b.w, b.h], { key: p.key, name: p.name, el: p.el }); num(i + 1, b.x, b.y); });
      spacing.forEach(function (sp, i) { num(parts.length + i + 1, sp.at[0] + sp.at[2] / 2, sp.at[1] + sp.at[3] / 2); });
      var cs = getComputedStyle(root), lines = '';
      if (/flex/.test(cs.display)) {
        var rowDir = /^row/.test(cs.flexDirection);
        var along = { center: 'centred', 'flex-end': 'from the end', end: 'from the end', 'space-between': 'spread to both ends', 'space-around': 'spread evenly', 'space-evenly': 'spread evenly' }[cs.justifyContent] || 'from the start';
        var across = { center: 'centred', 'flex-end': 'at the end', end: 'at the end', baseline: 'on the text baseline', stretch: 'stretched', normal: 'stretched' }[cs.alignItems] || 'at the start';
        lines = 'Its items sit in a ' + (rowDir ? 'row' : 'column') + ', ' + along + ', ' + across + (rowDir ? ' up and down.' : ' side to side.');
      }
      return { parts: parts, spacing: spacing, lines: lines };
    }
    // A layer of marks over a drawing: outlines and numbers, at scale k. A mark that says what it is (info) can be picked.
    function marker(layer, k) {
      var placed = [];
      return {
        mark: function (cls, at, info) { if (at[2] < 0.5 || at[3] < 0.5) return; var m = document.createElement('div'); m.className = cls; m.style.left = at[0] * k + 'px'; m.style.top = at[1] * k + 'px'; m.style.width = at[2] * k + 'px'; m.style.height = at[3] * k + 'px'; if (info) { m._info = info; m.setAttribute('data-hit', info.key); } layer.appendChild(m); },
        // A number that would cover another moves to the nearest free place around where it belongs, a line back to it.
        num: function (n, x, y) {
          var e = document.createElement('span'); e.className = 'pg-anat-num'; e.textContent = String(n); layer.appendChild(e);
          var w = e.offsetWidth + 2, h = e.offsetHeight + 2, x0 = x * k, y0 = y * k;
          function free(px, py) { return placed.every(function (q) { return Math.abs(q[0] - px) >= (q[2] + w) / 2 || Math.abs(q[1] - py) >= (q[3] + h) / 2; }); }
          var at = [x0, y0];
          for (var ring = 1; !free(at[0], at[1]) && ring <= 6; ring++) {
            var tries = [[0, -h * ring], [0, h * ring], [-w * ring, 0], [w * ring, 0], [-w * ring, -h * ring], [w * ring, -h * ring], [-w * ring, h * ring], [w * ring, h * ring]];
            for (var t = 0; t < tries.length; t++) if (free(x0 + tries[t][0], y0 + tries[t][1])) { at = [x0 + tries[t][0], y0 + tries[t][1]]; break; }
          }
          if (at[0] !== x0 || at[1] !== y0) {
            var dx = at[0] - x0, dy = at[1] - y0, lead = document.createElement('div'); lead.className = 'pg-anat-lead';
            lead.style.left = x0 + 'px'; lead.style.top = y0 + 'px'; lead.style.width = Math.sqrt(dx * dx + dy * dy) + 'px'; lead.style.transform = 'rotate(' + Math.atan2(dy, dx) + 'rad)';
            layer.insertBefore(lead, layer.firstChild);
          }
          e.style.left = at[0] + 'px'; e.style.top = at[1] + 'px'; placed.push([at[0], at[1], w, h]);
        }
      };
    }
    function drawAnatomy() {
      if (!anatBox || !cur || !preview.firstElementChild || anatBox.offsetParent === null) return;
      anatBox.innerHTML = '';
      // In the modes the Playground is set to (colour, sizing): the copy is drawn with the same tokens.
      AXES.forEach(function (a) {
        if (a.classes) a.values.forEach(function (v) { if (v.value) anatBox.classList.toggle(v.value, preview.classList.contains(v.value)); });
        else if (preview.hasAttribute(a.attr)) anatBox.setAttribute(a.attr, preview.getAttribute(a.attr)); else anatBox.removeAttribute(a.attr);
      });
      // A component shown in an overlay (a modal over the window) is drawn as itself: its own element, without the layer.
      var src = preview.firstElementChild;
      if ((c.motion && c.motion.overlay) || getComputedStyle(src).position === 'fixed') { var own = c.cls && src.querySelector(clsSel(clsName(c))); if (own) src = own; }
      var copy = src.cloneNode(true);
      // At the width the Playground last drew it (it is hidden while this area shows), so the copy lays out the same.
      // At the Width chosen (Phone, Tablet, Desktop): laid out as that width's frame lays it out, whole; at Fit, at the
      // width the Playground last drew it (it is hidden while inspecting), so the copy lays out the same.
      var wv = WIDTH !== 'fit' && WIDTHS.find(function (x) { return x[0] === WIDTH; });
      var pw = src.getBoundingClientRect().width || (src === preview.firstElementChild ? drawnWidth : 0);
      if (!wv && pw) { copy.style.width = pw + 'px'; copy.style.boxSizing = 'border-box'; }
      copy.setAttribute('inert', ''); copy.setAttribute('aria-hidden', 'true');
      uniqueIds(copy);
      var stage = document.createElement('div'); stage.className = 'pg-anat-stage';
      var wrap = document.createElement('div'); wrap.className = 'pg-anat-wrap'; wrap.appendChild(copy);
      var marks = document.createElement('div'); marks.className = 'pg-anat-marks'; marks.setAttribute('aria-hidden', 'true');
      stage.appendChild(wrap); stage.appendChild(marks); anatBox.appendChild(stage);
      var root = copy; if (c.only) { try { root = copy.querySelector(c.only) || copy; } catch (err) { /* not a selector: the whole */ } }
      if (/^(fixed|absolute)$/.test(getComputedStyle(root).position)) { anatBox.textContent = 'This component sits over the page, so it is inspected in the browser rather than here.'; return; }
      if (wv) { wrap.classList.add('pg-frame-stage'); wrap.style.width = wv[2] + 'px'; wrap.style.boxSizing = 'border-box'; }
      var whole = (wv ? wrap : copy).getBoundingClientRect(), rr = root.getBoundingClientRect();
      // At the size the Playground draws it, always: one wider than the area scrolls sideways, as the Playground does.
      var k = 1;
      stage.style.width = whole.width * k + 'px'; stage.style.height = whole.height * k + 'px';
      // Measured from where the copy sits now (the stage moves once it is sized), before it is scaled.
      function box(el) { var r = el.getBoundingClientRect(), o = wrap.getBoundingClientRect(); return { x: r.left - o.left, y: r.top - o.top, w: r.width, h: r.height }; }
      var m = marker(marks, k), b0 = box(root);
      m.mark('pg-anat-root', [b0.x, b0.y, b0.w, b0.h], { key: 'part 0 ' + c.name, name: c.name, el: root });   // under the rest: a click on the component itself
      var r = annotate(root, box, m.mark, m.num);
      // Nested parts: along the path picked, the elements inside each picked part are drawn as parts too, so whatever
      // sits in a group (an icon in a button in a footer) can be reached, one level per click.
      var hitOf = function (key) { return marks.querySelector('[data-hit="' + (window.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); };
      var seenEl = function (n) { var nr = n.getBoundingClientRect(), ncs = getComputedStyle(n); return nr.width > 1 && nr.height > 1 && ncs.visibility !== 'hidden' && ncs.opacity !== '0'; };
      var nameEl = function (n) { var cl = (n.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0]; return n.tagName.toLowerCase() === 'svg' ? 'icon' : cl || (n.children.length ? 'group' : n.textContent.trim() ? 'text' : n.tagName.toLowerCase()); };
      var chain = anatPath; anatPath = [];
      for (var ci = 0; ci < chain.length; ci++) {
        var ph = hitOf(chain[ci]), pel = ph && ph._info && ph._info.el;
        if (!ph) break;
        anatPath.push(chain[ci]);
        if (!pel || pel.tagName.toLowerCase() === 'svg') continue;
        var last = ci === chain.length - 1;
        Array.prototype.filter.call(pel.children, seenEl).forEach(function (n, j) {
          var bb = box(n), nm = nameEl(n);
          m.mark('pg-anat-part is-nested' + (last ? ' is-inside' : ''), [bb.x, bb.y, bb.w, bb.h], { key: chain[ci] + ' > ' + (j + 1) + ' ' + nm, name: nm, el: n });
        });
      }
      anatPicked = anatPath[anatPath.length - 1] || null;
      wrap.style.transform = 'scale(' + k + ')';
      // What is picked: the tokens it is drawn with; nothing picked, how to pick.
      var hit = anatPicked && hitOf(anatPicked), info = hit && hit._info;
      if (hit) hit.classList.add('is-picked'); else anatPicked = null;
      marks.classList.toggle('has-pick', !!hit);
      // One line: what is picked and its values; nothing picked, how to pick.
      if (anatLine) anatLine.innerHTML = !info ? 'Click a part, a padding or a gap to see what it is and its value.'
        : info.el && isSlot(info.el) ? '<b>' + esc(anatPath.map(function (key) { var h = hitOf(key); return h && h._info ? h._info.name : ''; }).filter(Boolean).join(' › ') || info.name) + '</b>  ·  ' + esc(['a placeholder for content, which brings its own look'].concat(pickedValues(info.el).filter(function (v) { return /^(padding|gap)\b/.test(v); })).join('  ·  '))
        : info.el ? '<b>' + esc(anatPath.map(function (key) { var h = hitOf(key); return h && h._info ? h._info.name : ''; }).filter(Boolean).join(' › ') || info.name) + '</b>  ·  ' + esc(pickedValues(info.el).join('  ·  ') || 'nothing of its own')
        : '<b>' + esc(info.what) + '</b>  ·  ' + esc(info.value);
    }
    // Variants: each option drawn by the Playground itself (its own refresh), copied still and inert into its row, then
    // the Playground set back as it was. Each row names its prop and option; a click on Try it sets it in the Playground.
    var variantsBox = sec.querySelector('.pg-variants'), drawingVariants = false;
    function drawVariants() {
      if (!variantsBox || drawingVariants || !cur) return;
      drawingVariants = true;
      var keep = {}; Object.keys(state).forEach(function (k) { keep[k] = state[k]; });
      var html = '';
      try {
        // Its combinations first: every mix of the props that show or hide a part (an icon, a label), each drawn by the
        // component's own code. A mix its code draws the same as one before it, or draws empty, is one the code does not
        // allow (its logic decides), so it is left out.
        var colourAttrs0 = AXES.filter(function (ax) { return ax.colour; }).map(function (ax) { return ax.attr; });
        var shows = (c.controls || []).filter(function (p) { return p.type === 'BOOLEAN' && !!(p.on || p.off || p.part || p.showsPart) && /^(show|has)/i.test(p.label); }).slice(0, 4);
        if (shows.length >= 2) {
          var seenMix = {}, mixes = '';
          for (var mi = (1 << shows.length) - 1; mi >= 1; mi--) {
            var on = shows.filter(function (p, i) { return mi & (1 << i); });
            shows.forEach(function (p) { state[p.label] = on.indexOf(p) >= 0; }); refresh();
            var msrc = preview.firstElementChild; if (!msrc) continue;
            var drawn = msrc.textContent.trim() || msrc.querySelector('svg, img, input');
            var mkey = msrc.outerHTML.replace(/\s(id|for|aria-[a-z]+)="[^"]*"/g, '');
            if (!drawn || seenMix[mkey]) continue;
            seenMix[mkey] = true;
            var mcopy = msrc.cloneNode(true); mcopy.setAttribute('inert', ''); mcopy.setAttribute('aria-hidden', 'true'); uniqueIds(mcopy);
            var mmodes = Array.prototype.filter.call(preview.attributes, function (a) { return /^data-/.test(a.name) && colourAttrs0.indexOf(a.name) < 0; }).map(function (a) { return ' ' + a.name + '="' + esc(a.value) + '"'; }).join('');
            var mname = on.map(function (p) { var w = p.label.replace(/^(show|has)/i, ''); return w.charAt(0).toUpperCase() + w.slice(1); }).join(' + ') + (on.length === 1 ? ' only' : '');
            mixes += '<div class="pg-variant-row"><div class="pg-ctl-label">' + esc(mname) + '</div><div class="pg-variant-stage"' + mmodes + '>' + mcopy.outerHTML + '</div>' +
              sysButton('button', 'Try it', ' data-try-mix="' + esc(on.map(function (p) { return p.label; }).join('|')) + '" data-mix-of="' + esc(shows.map(function (p) { return p.label; }).join('|')) + '"') + '</div>';
          }
          shows.forEach(function (p) { state[p.label] = keep[p.label]; });
          if (mixes) html += '<div class="pg-inspect pg-variant-group"><div class="pg-inspect-head"><h3>Combinations</h3></div>' + mixes + '</div>';
        }
        variantRows(c).forEach(function (p) {
          html += '<div class="pg-inspect pg-variant-group"><div class="pg-inspect-head"><h3>' + esc(p.label) + '</h3></div>';
          (p.options || []).forEach(function (o) {
            if (o.unbuilt) { html += '<div class="pg-variant-row"><div class="pg-ctl-label">' + esc(o.label) + '</div><p class="pg-empty">Figma has it; the code does not build it yet.</p></div>'; return; }
            var val = 'value' in o ? o.value : o.label;
            state[p.label] = val; refresh();
            var src = preview.firstElementChild, copy = src ? src.cloneNode(true) : null;
            if (copy) { copy.setAttribute('inert', ''); copy.setAttribute('aria-hidden', 'true'); uniqueIds(copy); }
            // The Playground's other modes (its sizing) carry over; colour follows the page's mode, so each variant reads on
            // the page's background whatever the Playground's own colour switch says.
            var colourAttrs = AXES.filter(function (ax) { return ax.colour; }).map(function (ax) { return ax.attr; });
            var modes = Array.prototype.filter.call(preview.attributes, function (a) { return /^data-/.test(a.name) && colourAttrs.indexOf(a.name) < 0; }).map(function (a) { return ' ' + a.name + '="' + esc(a.value) + '"'; }).join('');
            html += '<div class="pg-variant-row"><div class="pg-ctl-label">' + esc(o.label) + (val === keep[p.label] ? ' (in the Playground)' : '') + '</div><div class="pg-variant-stage"' + modes + '>' + (copy ? copy.outerHTML : '') + '</div>' +
              sysButton('button', 'Try it', ' data-try="' + esc(p.label) + '" data-v="' + esc(o.label) + '"') + '</div>';
          });
          html += '</div>';
          state[p.label] = keep[p.label];
        });
      } finally { Object.keys(keep).forEach(function (k) { state[k] = keep[k]; }); refresh(); drawingVariants = false; }
      variantsBox.innerHTML = html;
    }
    if (variantsBox) variantsBox.addEventListener('click', function (e) {
      // A combination tried: its props set together in the Playground.
      var mx = e.target.closest && e.target.closest('[data-try-mix]');
      if (mx) {
        var onSet = mx.getAttribute('data-try-mix').split('|');
        mx.getAttribute('data-mix-of').split('|').forEach(function (l) { state[l] = onSet.indexOf(l) >= 0; });
        Object.keys(syncs).forEach(function (k) { syncs[k](); });
        showArea('play'); refresh(); return;
      }
      var b = e.target.closest && e.target.closest('[data-try]'); if (!b) return;
      var tv = b.getAttribute('data-v'), tp = (c.controls || []).find(function (p) { return p.label === b.getAttribute('data-try'); });
      state[b.getAttribute('data-try')] = tp && tp.type === 'BOOLEAN' ? tv === 'true' : tv;
      Object.keys(syncs).forEach(function (k) { syncs[k](); });
      showArea('play'); refresh();
    });
    var anatPicked = null, anatPath = [], anatLine = sec.querySelector('.pg-anat-line');
    // A slot is only a place for content: the style guide marks it, and only the spacing the component gives it is its own.
    // Figma's slot frame holds only its spacing (its padding and the gap between what is put in it), checked against the
    // code's like every other part's; the rest of what shows there is the page's mark.
    function isSlot(el) { return el.classList.contains('pg-slot-area') || !!el.closest('.pg-slot-area') || (el.hasAttribute('data-slot') && !el.closest('.pg-preview')); }
    // What a picked part is drawn with, by its tokens: an icon's size and colour; else its padding, gap, fill, line,
    // corners, shadow, text style and colour (what it has of them).
    function pickedValues(el) {
      if (el.tagName.toLowerCase() === 'svg') { var r = el.getBoundingClientRect(), k = parseFloat((anatBox.querySelector('.pg-anat-wrap') || {}).style ? (anatBox.querySelector('.pg-anat-wrap').style.transform.match(/scale\(([\d.]+)\)/) || [0, 1])[1] : 1) || 1; return ['size ' + Math.round(r.width / k) + '×' + Math.round(r.height / k) + 'px', 'colour ' + tok(el, getComputedStyle(el).color, 'color', c.name)]; }
      return lookRows(el, false).filter(function (x) { return x[1] !== '-' && x[1] !== 'none' && x[1] !== 'transparent' && x[1] !== '0'; }).map(function (x) { return x[0] + ' ' + x[1]; });
    }
    // A click picks a part; one inside the part picked goes a level down; the part picked again goes a level up.
    function pickAnatomy(key) {
      var at = anatPath.indexOf(key);
      if (at >= 0) anatPath = anatPath.slice(0, at);   // picked again: back to the part around it
      else {
        var parent = key.lastIndexOf(' > ') > 0 ? key.slice(0, key.lastIndexOf(' > ')) : null, pi = parent ? anatPath.indexOf(parent) : -1;
        anatPath = pi >= 0 ? anatPath.slice(0, pi + 1).concat(key) : [key];
      }
      drawAnatomy();
    }
    // A click outside the component (the stage around it) lets go of what is picked.
    if (anatBox) anatBox.addEventListener('click', function (e) { var h = e.target.closest && e.target.closest('.pg-anat-marks [data-hit]'); if (!h) { if (anatPath.length) { anatPath = []; drawAnatomy(); } return; } e.preventDefault(); pickAnatomy(h.getAttribute('data-hit')); });
    // Figma beside the code: the Figma image of the variant set (its variant props equal to the Playground's), beside a
    // still copy of the component as drawn, or over it, as much of it as the slider says. A variant Figma has no image
    // of is said so, never shown with another's.
    var compareEl = sec.querySelector('.pg-compare'), compareMode = 'side';
    function shotFor() {
      var best = null, bestN = -1, atDefault = props.every(function (p) { return p.type !== 'VARIANT' || state[p.label] === byDefault(p); });
      (c.figmaShots || []).forEach(function (sh) {
        if (!sh.variant) { if (atDefault && bestN < 0) { best = sh; bestN = 0; } return; }
        var n = 0, ok = Object.keys(sh.variant).every(function (k) {
          var p = props.find(function (q) { return q.type === 'VARIANT' && low(q.label) === low(k); });
          if (!p) return true;
          n++; return low(state[p.label]) === low(sh.variant[k]);
        });
        if (ok && n > bestN) { best = sh; bestN = n; }
      });
      return best;
    }
    function drawCompare() {
      if (!compareEl) return;
      compareEl.hidden = !compareOn;
      if (!compareOn || !cur) return;
      var body = compareEl.querySelector('.pg-compare-body'), sh = shotFor(), amount = compareEl.querySelector('input[type="range"]');
      compareEl.querySelector('.pg-compare-amount').hidden = compareMode !== 'over' || !sh;
      if (!sh) { body.innerHTML = '<p class="pg-empty">Figma has no image of this variant yet' + ((c.figmaShots || []).length ? ' (it has ' + c.figmaShots.length + ')' : '') + '.</p>'; return; }
      var src = preview.firstElementChild;
      if ((c.motion && c.motion.overlay) || getComputedStyle(src).position === 'fixed') { var own = c.cls && src.querySelector(clsSel(clsName(c))); if (own) src = own; }
      var copy = src.cloneNode(true), w = src.getBoundingClientRect().width;
      if (w) { copy.style.width = w + 'px'; copy.style.boxSizing = 'border-box'; }
      copy.setAttribute('inert', ''); copy.setAttribute('aria-hidden', 'true');
      uniqueIds(copy);
      var img = '<img loading="lazy" class="pg-compare-img" alt="' + esc(c.name + ' in Figma') + '" src="' + esc(sh.src) + '" width="' + Math.round(sh.w) + '" height="' + Math.round(sh.h) + '">';
      // A small one drawn larger, both by the same amount, so a pixel of difference can be seen.
      var k = Math.max(1, Math.min(4, Math.floor(120 / Math.max(1, sh.h, src.getBoundingClientRect().height))));
      // Figma draws it in the mode its frame uses there; the page's own mode switch brings the code to the same one.
      var larger = '<p class="pg-empty">' + (k > 1 ? 'Both drawn ' + k + ' times larger. ' : '') + 'Figma\'s image is in the mode its frame uses in Figma; switch ' + esc((AXES.find(function (a) { return a.attr !== 'data-size'; }) || { label: 'the mode' }).label) + ' in the playground to match it.</p>';
      if (compareMode === 'side') {
        body.innerHTML = larger + '<div class="pg-compare-row"><div class="pg-compare-fig"><div class="pg-ctl-label">Figma</div><div class="pg-compare-stage"><div class="pg-compare-layer">' + img + '</div></div></div><div class="pg-compare-fig"><div class="pg-ctl-label">Code</div><div class="pg-compare-stage"><div class="pg-compare-layer pg-compare-code"></div></div></div></div>';
        body.querySelector('.pg-compare-code').appendChild(copy);
        Array.prototype.forEach.call(body.querySelectorAll('.pg-compare-layer'), function (l) { l.style.zoom = k; });
      } else {
        body.innerHTML = larger + '<div class="pg-compare-row"><div class="pg-compare-stage"><div class="pg-compare-layer pg-compare-over">' + img + '<div class="pg-compare-cut"></div></div></div></div>';
        var layer = body.querySelector('.pg-compare-layer'); layer.insertBefore(copy, layer.firstChild); layer.style.zoom = k;
        var cut = function () { var x = +amount.value; layer.querySelector('.pg-compare-img').style.clipPath = 'inset(0 ' + (100 - x) + '% 0 0)'; layer.querySelector('.pg-compare-cut').style.left = x + '%'; };
        amount.oninput = cut; cut();
      }
    }
    if (compareEl) {
      var cmpBar = compareEl.querySelector('.pg-compare-bar');
      segItems(cmpBar).forEach(function (b) { segSelect(b, b.dataset.v === compareMode); b.addEventListener('click', function () { compareMode = b.dataset.v; segItems(cmpBar).forEach(function (x) { segSelect(x, x === b); }); drawCompare(); }); });
    }
    // The Accessibility table, drawn from the items the data gives and those this page's run finds, with a count of each
    // status above it and when the last audit ran.
    var a11yEl = sec.querySelector('.pg-a11y-rows'), a11ySumEl = sec.querySelector('.pg-a11y-sum'), a11yNote = sec.querySelector('.pg-a11y-note');
    // What this browser tried before (kept on the Status page) shows at once, until this page tries it again.
    var staticItems = c.a11y ? a11yStaticItems(c) : [], liveItems = (c.__a11y && c.__a11y.liveItems) || [], liveNow = (c.__a11y && c.__a11y.live) || null;
    // The parts of what is drawn that hold words (its label, its description), by their own class, for the rows a person
    // checks on its words.
    function textParts() {
      var root = cur || preview, out = [];
      if (!root) return out;
      root.querySelectorAll('*').forEach(function (k) {
        if (k.closest('svg') || !Array.prototype.some.call(k.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); })) return;
        var cl = (typeof k.className === 'string' && k.className.split(/\s+/).filter(function (x) { return x && !/^(sg-|pg-)/.test(x); })[0]) || '';
        var nm = cl ? (cl.replace(new RegExp('^' + (c.cls || c.name).replace(/^[#.]/, '') + '[-_]*', 'i'), '') || cl).replace(/^\w/, function (x) { return x.toUpperCase(); }) + ' part' : 'text';
        if (out.indexOf(nm) < 0) out.push(nm);
      });
      return out.slice(0, 4);
    }
    function a11yRender(live) {
      if (!a11yEl) return;
      if (live !== undefined) liveNow = live;
      var tp = textParts(); if (tp.length || !c.__textParts) c.__textParts = tp;   // before it is drawn: the parts kept with its results
      if (liveNow && !liveNow.at) liveNow.at = new Date().toISOString();
      a11yEl.innerHTML = a11yIssueRows(c, staticItems.concat(liveItems), liveNow).concat(unreadRows(c)).map(function (r) { return issueRowHTML(r, 'Accessibility'); }).join('');
      if (liveNow) { c.__a11y = { items: staticItems.concat(liveItems), live: liveNow, liveItems: liveItems.slice(), baked: !!(c.__a11y && c.__a11y.baked && c.__a11y.live === liveNow) }; fillTodo(); if (!checking) keepA11y(); }   // the Status page lists what it shows
      // Its tab carries its state, as its Status row says it, once the browser has tried it.
      var accNow = componentStates(c).acc;
      areaState(sec.querySelector('.pg-areas [data-v="a11y"]'), accNow); areaNA(sec.querySelector('.pg-area[data-area="a11y"]'), accNow);
      labelCells(a11yEl.closest('.pg-a11y'));
      var n = {};
      Array.prototype.forEach.call(a11yEl.rows, function (r) { if (!r.hasAttribute('data-extra')) n[r.dataset.status] = (n[r.dataset.status] || 0) + 1; });
      // What meeting the standard rests on: a criterion a person answered is their word, and a claim that does not say
      // so reads as though the engine measured all of it.
      function saidRest(rows) {
        var said = 0;
        Array.prototype.forEach.call(rows, function (r) { if (r.hasAttribute('data-said')) said++; });
        return said ? ' \u00b7 ' + said + (said === 1 ? ' criterion on a person\'s word' : ' criteria on a person\'s word') : '';
      }
      a11ySumEl.innerHTML = chipsHTML({ todo: n.todo, check: n.check, done: n.done }, 'Accessibility', whoChipsHTML(a11yEl.rows)) +
        // Nothing to fix or to check, the checks a person makes included: it meets WCAG 2.2 at A and AA.
        (!n.todo && !n.check && n.done ? '<span class="pg-par-status pg-par--' + STATUS.done[2] + ' pg-a11y-meets"><span class="pg-par-sign" aria-hidden="true">' + STATUS.done[0] + '</span>Meets WCAG 2.2 at level A and AA' + saidRest(a11yEl.rows) + '</span>' : '');
      var ch = c.a11y && c.a11y.checked;
      // Only what a row cannot say: when each check ran is in its own row.
      a11yNote.innerHTML = [!ch ? esc('The audit has not run in a browser yet: it adds real key presses, zoom, text spacing and a keyboard trap.') : ch.notRead ? '<span class="sg-mx-why">' + esc('The last audit (' + when(ch.at) + ') could not try it: ' + plainWhy(ch.why) + '. Run the audit again once that is fixed.') + whyTip(ch.why) + '</span>' : '',
        (c.a11y && c.a11y.excused || []).length ? esc('Not asked of it, ' + c.a11y.excused.map(function (x) { return x.says + ' (' + x.reason + ')'; }).join('; ') + '.') : ''].filter(Boolean).join(' ');
      a11yNote.hidden = !a11yNote.textContent;
      stickHeight(sec);   // its chips, now filled, measured for the table's head under them
    }
    a11yRender(liveNow);
    // Every variant tried in the browser (checkLive, below), its rows in the Accessibility table.
    var liveSig = null, checking = false, areaNow = null;
    // Every variant, as Parity lists everything the component has: each one tried on the live component whenever the
    // Accessibility area shows (the Playground laid out out of sight for it, one task, nothing painted), the text
    // contrast measured in each colour mode too, and what each check found said once, with the variants it holds in.
    // Every combination when there are 32 or fewer, else each option on its own beside the defaults. The Playground is
    // drawn again as it was set.
    function a11yCombos() {
      var axes = variantRows(c).map(function (p) { return { label: p.label, opts: (p.options || []).filter(function (o) { return !o.unbuilt; }).map(function (o) { return { label: o.label, val: 'value' in o ? o.value : o.label }; }) }; }).filter(function (a) { return a.opts.length; });
      var total = axes.reduce(function (n, a) { return n * a.opts.length; }, 1), combos = [];
      if (total <= 32) (function rec(i, set, names) {
        if (i === axes.length) { combos.push({ set: set, name: names.join(', ') || 'as it is' }); return; }
        axes[i].opts.forEach(function (o) { var next = {}; Object.keys(set).forEach(function (k) { next[k] = set[k]; }); next[axes[i].label] = o.val; rec(i + 1, next, names.concat(axes[i].label + '=' + o.label)); });
      })(0, {}, []);
      else { combos.push({ set: {}, name: 'its defaults' }); axes.forEach(function (a) { a.opts.forEach(function (o) { var one = {}; one[a.label] = o.val; combos.push({ set: one, name: a.label + '=' + o.label }); }); }); }
      return { combos: combos, every: total <= 32 };
    }
    // The Status page has every component tried in the background, as its Accessibility area does; cb when it is done.
    var bgRun = null;
    sec._a11yRun = function (cb) {
      if (ALL || !a11yEl || !cur) { cb(); return; }
      // Before the page has loaded the check waits for the load: so does cb, never told it is done with nothing tried.
      if (document.readyState !== 'complete') { window.addEventListener('load', function () { setTimeout(function () { sec._a11yRun(cb); }, 60); }, { once: true }); return; }
      // A check already under way (the area was just opened) ends first; then every variant is tried again for this one.
      if (checking) { var before = bgRun; bgRun = function () { if (before) before(); sec._a11yRun(cb); }; return; }
      bgRun = cb; liveSig = null; checkLive();
      if (!checking && bgRun) { var f = bgRun; bgRun = null; f(); }   // nothing left running after it
    };
    function checkLive() {
      if (ALL || !a11yEl || !cur || (areaNow !== 'a11y' && !bgRun)) return;
      if (!bgRun && c.__a11y && c.__a11y.live) return;   // tried already, by the build or in this browser: its results stand
      // Tried once the page has started: the system's scripts, which run after this one, add their own elements, and one
      // added during a hover would be taken for what the hover shows.
      if (document.readyState !== 'complete') { if (!checkLive.waiting) { checkLive.waiting = true; window.addEventListener('load', function () { setTimeout(function () { checkLive.waiting = false; checkLive(); }, 50); }); } return; }
      // A mode or a setting changed while what it does was being tried: that try ends, and every variant is tried again.
      var sig0 = Array.prototype.map.call(document.documentElement.attributes, function (x) { return x.name + x.value; }).join();
      if (wcagStop && sig0 !== liveSig) wcagStop();
      if (checking) return;
      var sig = Array.prototype.map.call(document.documentElement.attributes, function (x) { return x.name + x.value; }).join();
      if (sig === liveSig) return;
      checking = true; liveSig = sig;
      var play = sec.querySelector('[data-area="play"]'), keep = {}, wasPreview = preview.hidden, wasPlay = play.hidden;
      Object.keys(state).forEach(function (k) { keep[k] = state[k]; });
      var colours = AXES.filter(function (a) { return a.scoped && a.attr !== 'data-size' && !a.classes; });
      var keptAttrs = colours.map(function (a) { return [a.attr, preview.getAttribute(a.attr)]; });
      var modeSets = [[]];
      colours.forEach(function (a) { var next = []; modeSets.forEach(function (ms) { a.values.forEach(function (v) { if (v.value) next.push(ms.concat([[a, v]])); }); }); if (next.length) modeSets = next; });
      // Colours read as they settle in each mode, never halfway through a component's own transition.
      play.hidden = false; play.classList.add('pg-offstage'); preview.hidden = false; preview.classList.add('pg-still');
      var plan = a11yCombos(), groups = [], byKey = {}, lowest = null, failing = 0, measured = 0, wran = {}, wkinds = {}, spoken = {}, spokenOrder = [], facts = [], factsBy = {};
      // Each variant is drawn, then measured once the system's own scripts have answered the change: their observers add
      // roles, Tab stops, names and wiring a moment after it is drawn, as in a product, so it is never measured in the
      // same step it is drawn in. A message to the page itself is the next task without a timer's wait.
      var settle = function (fn) { var ch = new MessageChannel(); ch.port1.onmessage = function () { ch.port1.close(); fn(); }; ch.port2.postMessage(0); };
      var restore = function () {
        keptAttrs.forEach(function (k) { if (k[1] == null) preview.removeAttribute(k[0]); else preview.setAttribute(k[0], k[1]); });
        play.classList.remove('pg-offstage'); play.hidden = wasPlay; preview.hidden = wasPreview; preview.classList.remove('pg-still');
        Object.keys(keep).forEach(function (k) { state[k] = keep[k]; });
        Object.keys(syncs).forEach(function (k) { syncs[k](); });
        refresh();
        checking = false;
      };
      // again: how it is tried once the person leaves; it answers false then, and the variants wait for it.
      var measure = function (cb, again) {
        // Never while a person is on a control of the page (the Brand choice, the search, a filter): the check moves the
        // focus to each control it tries, which would close their list or take their typing. It waits until they leave.
        // Any control of the page a person is on (a field, a list, the Status page's filter, a menu it opened), not only a
        // field: wherever the focus is outside what is being tried, it stays there.
        var busy = document.activeElement, inPage = busy && busy !== document.body && busy !== document.documentElement && !preview.contains(busy) && !(busy.closest && busy.closest('.pg-offstage'));
        // One the person cannot see any more (a closed panel gave the focus back to a button on a page since hidden) is
        // left until the browser's next frame takes it away: no one is on it, so nothing waits for it.
        if (inPage && (!document.contains(busy) || !busy.getClientRects().length)) inPage = false;
        // The build's own run has no person on the page: nothing to wait for.
        if (inPage && !BAKING) { busy.addEventListener('blur', function () { setTimeout(again, 50); }, { once: true }); return false; }
        var root = preview.firstElementChild || cur, tb = document.createElement('tbody');
        // Whether it holds anything a person acts on, or a field, in any variant: what asks of controls and fields only
        // applies then.
        var all0 = [root].concat(Array.prototype.slice.call(root.querySelectorAll('*')));
        if (all0.some(function (el) { return el.matches('a[href],button,input:not([type=hidden]),select,textarea,summary,[tabindex]:not([tabindex="-1"]),[contenteditable=""],[contenteditable=true],[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=menuitem],[role=option],[role=slider],[role=spinbutton],[role=combobox],[role=textbox],[role=searchbox]'); })) wran.control = 1;
        if (all0.some(function (el) { return el.matches('input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]),select,textarea,[role=textbox],[role=searchbox],[role=combobox],[role=spinbutton],[contenteditable=""],[contenteditable=true]'); })) wran.field = 1;
        try { tb.innerHTML = liveA11yHTML(root, c.a11y); } catch (e) { tb.innerHTML = a11yRow('check', 'In the browser', 'It could not be tried here.', '', FROM_PAGE); }
        // Its control as a screen reader is given it in this variant (its role, where its name comes from, the states it
        // announces, whether Tab reaches it, the keys it answers), kept with the results for its contract: the same facts
        // once, with the variants they hold in.
        if (window.__wcag21 && window.__wcag21.facts) try {
          var fx = window.__wcag21.facts(root), kd = liveA11yHTML.keys || [];
          fx.keys = fx.keys.concat(kd.filter(function (k, i) { return fx.keys.indexOf(k) < 0 && kd.indexOf(k) === i; }));
          var fk = JSON.stringify(fx);
          if (!factsBy[fk]) { factsBy[fk] = { f: fx, when: [] }; facts.push(factsBy[fk]); }
          factsBy[fk].when.push(cb.set);
        } catch (e) { /* the other variants' facts stand */ }
        // WCAG 2.1 (wcag-page.js): what its markup and its CSS show in this variant.
        if (window.__wcag21) try {
          var w = window.__wcag21.check(root, { name: c.name }), byKind = {};
          w.ran.forEach(function (k) { wran[k] = 1; });
          // What a screen reader says on each control, gathered across the variants (the same words said once).
          (w.spoken || []).forEach(function (sp) { if (!spoken[sp.says]) { spoken[sp.says] = []; spokenOrder.push(sp.says); } spoken[sp.says].push(cb.name); });
          w.findings.forEach(function (f) { (byKind[f.kind] = byKind[f.kind] || []).push(f.desc); });
          Object.keys(byKind).forEach(function (k) {
            wkinds[k] = Math.max(wkinds[k] || 0, byKind[k].length);
            tb.insertAdjacentHTML('beforeend', a11yRow('todo', 'In the browser', esc(wcagTitle(k, byKind[k].length) + '. ' + wcagFix(k)) + placesTag(byKind[k].map(placeOf)), wcagLabelOf(wcagScOf(k)), FROM_PAGE));
          });
        } catch (e) { /* the rest of the table stands */ }
        // The same check with only the words of its control differing (Tab reaches "Text", Tab reaches "Description")
        // is one row: what it found, in the variants it holds in.
        Array.prototype.forEach.call(tb.rows, function (tr) {
          var html = tr.cells[1].innerHTML, plain = html.replace(/"[^"]*"/g, '"…"');
          var key = tr.dataset.status + '|' + plain + '|' + tr.cells[3].textContent;
          if (!byKey[key]) { byKey[key] = { st: tr.dataset.status, html: html, plain: plain, wcag: tr.cells[3].textContent, where: [], sets: [] }; groups.push(byKey[key]); }
          if (byKey[key].html !== html) byKey[key].mixed = true;
          byKey[key].where.push(cb.name); byKey[key].sets.push(cb.set);
        });
        modeSets.forEach(function (ms) {
          ms.forEach(function (m) { preview.setAttribute(m[0].attr, m[1].value); });
          var lo = contrastLowest(root); if (!lo) return;
          measured++; if (lo.ratio < lo.need) failing++;
          if (!lowest || lo.ratio / lo.need < lowest.ratio / lowest.need) { lowest = lo; lowest.where = cb.name + ms.map(function (m) { return ' · ' + (m[1].label || m[1].value); }).join(''); }
        });
        keptAttrs.forEach(function (k) { if (k[1] == null) preview.removeAttribute(k[0]); else preview.setAttribute(k[0], k[1]); });
      };
      (function step(i) {
        if (i >= plan.combos.length) { restore(); return finish(); }
        var cb = plan.combos[i];
        try {
          props.forEach(function (p) { state[p.label] = byDefault(p); });
          Object.keys(cb.set).forEach(function (k) { state[k] = cb.set[k]; });
          refresh();
        } catch (e) { restore(); return finish(); }   // drawn no further: what was tried stands
        // The next variant waits while this one waits for the person to leave a control, so none is left untried.
        var tryIt = function () { var waits = false; try { waits = measure(cb, tryIt) === false; } catch (e) { /* this variant could not be tried; the rest are */ } if (!waits) step(i + 1); };
        settle(tryIt);
      })(0);
      function finish() {
        var n = plan.combos.length, scope = function (where) {
          if (where.length === n) return n === 1 ? '' : plan.every ? ' In all ' + n + ' variants.' : ' In every option.';
          return ' In ' + where.slice(0, 3).join('; ') + (where.length > 3 ? ' and ' + (where.length - 3) + ' more' : '') + '.';
        };
        // Each check's result as an item under its criterion, with the variants it holds in; the text contrast as one.
        // A control with no name only where an on/off prop hides its words (an icon-only button, a box with no text): it
        // fails as it is, and what to do is said: the product that uses it that way names it there.
        liveItems = groups.map(function (g) { var say = g.st === 'todo' && /has no name a screen reader can read/.test(g.html) ? namedWhereUsed(g.sets, props) : ''; return { sc: scOfLabel(g.wcag), label: g.wcag, st: g.st, todo: esc(say), html: (g.mixed ? g.plain.replace(/: "…"/g, ', on what each variant shows').replace(/"…"/g, 'its control') : g.html) + esc(scope(g.where)), from: FROM_PAGE }; }).filter(function (it) { return it.sc; });
        // What a screen reader says on its controls, in the variants tried: the words a person hears, name, role, state.
        if (spokenOrder.length) liveItems.push({ sc: '4.1.2', label: wcagLabelOf('4.1.2'), st: 'done', from: FROM_PAGE,
          html: 'A screen reader says ' + spokenOrder.slice(0, 8).map(function (t) { return '“' + esc(t) + '”' + (spoken[t].length < n && n > 1 ? ' (' + esc(spoken[t].slice(0, 2).join('; ') + (spoken[t].length > 2 ? ' and ' + (spoken[t].length - 2) + ' more' : '')) + ')' : ''); }).join(', ') + (spokenOrder.length > 8 ? ', and ' + (spokenOrder.length - 8) + ' more' : '') + '.' });
        if (lowest) liveItems.push({ sc: '1.4.3', label: 'WCAG 1.4.3 Contrast (Minimum) (AA)', st: failing ? 'todo' : 'done', from: FROM_PAGE, html: failing
          ? esc((Math.floor(lowest.ratio * 10) / 10).toFixed(1)) + ':1 on "' + esc(lowest.words) + '" in ' + esc(lowest.where) + ', needs ' + lowest.need + ':1. Too low in ' + failing + ' of ' + measured + ' variants and colour modes.'
          : 'Text at least ' + esc((Math.floor(lowest.ratio * 10) / 10).toFixed(1)) + ':1 in all ' + measured + ' variants and colour modes (the lowest on "' + esc(lowest.words) + '" in ' + esc(lowest.where) + '), needs ' + lowest.need + ':1.' });
        var live = { ran: wran, tried: n };
        if (facts.length) live.facts = facts;
        a11yRender(live);
        wcagUse(plan, live);
        if (!checking && bgRun) { var f = bgRun; bgRun = null; f(); }   // nothing left to try after it (no in-page checks)
      }
    }
    // What it does when used (WCAG 2.1, wcag-page.js interact): what shows on hover or focus, what taking the focus or
    // changing a value does, whether a press acts before the release. Tried on the first six variants, one at a time,
    // out of sight as the rest; its rows join the table and the criteria above are counted again.
    var wcagStop = null;
    function wcagUse(plan, live) {
      if (!window.__wcag21 || !a11yEl) return;
      checking = true;
      var stopped = false;
      var play = sec.querySelector('[data-area="play"]'), keep = {}, wasPreview = preview.hidden;
      Object.keys(state).forEach(function (k) { keep[k] = state[k]; });
      play.hidden = false; play.classList.add('pg-offstage'); preview.hidden = false;
      // Six variants that can be used: one drawn disabled (nothing in it takes the focus, an input or a press) is passed
      // over while others remain.
      var all = plan.combos, combos = [], found = {}, order = [];
      var usable = function (root) { return [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).some(function (el) { return el.matches && el.matches('a[href],button,input,select,textarea,summary,[tabindex],[role=button],[role=link],[role=checkbox],[role=radio],[role=switch],[role=tab],[role=option],[role=menuitem],[role=slider],[role=spinbutton],[data-tip],[aria-describedby]') && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('[disabled],[aria-disabled="true"]'); }); };
      var done = function () {
        if (stopped) return;
        stopped = true; wcagStop = null;
        live.usedN = combos.length;
        play.classList.remove('pg-offstage'); play.hidden = !ALL && areaNow !== 'play'; preview.hidden = wasPreview;
        Object.keys(keep).forEach(function (k) { state[k] = keep[k]; });
        Object.keys(syncs).forEach(function (k) { syncs[k](); });
        refresh();
        checking = false;
        order.forEach(function (key) {
          var f = found[key];
          liveItems.push({ sc: f.sc, label: wcagLabelOf(f.sc), st: 'todo', from: FROM_PAGE, html: esc(wcagTitle(f.kind, 1) + '. ' + wcagFix(f.kind) + (f.where.length === combos.length ? (combos.length > 1 ? ' In all ' + combos.length + ' variants tried.' : '') : ' In ' + f.where.slice(0, 3).join('; ') + (f.where.length > 3 ? ' and ' + (f.where.length - 3) + ' more' : '') + '.')) + placesTag([placeOf(f.desc)]) });
        });
        a11yRender(live);
        if (bgRun) { var f = bgRun; bgRun = null; f(); }
      };
      // Leaving the area, or a new mode, ends it at once: the Playground is drawn again as set.
      wcagStop = function () { done(); };
      var retried = {};   // how many times each variant was started again after a person stopped it
      (function next(i) {
        if (stopped) return;
        if (i >= all.length || combos.length >= 6) { if (!combos.length && all.length) combos.push(all[0]); return done(); }
        props.forEach(function (p) { state[p.label] = byDefault(p); });
        Object.keys(all[i].set).forEach(function (k) { state[k] = all[i].set[k]; });
        refresh();
        var root = preview.firstElementChild || cur;
        if (!usable(root)) return next(i + 1);
        combos.push(all[i]);
        var cb = all[i];
        // Never while a person is on a control of the page outside it: tried once they leave it; one they take mid-way
        // stops the try, which runs again from this variant once they leave.
        // The build's own run has no person: the focus its component's script moves is never taken for one.
        var personOn = function () { if (BAKING) return null; var a = document.activeElement; return a && a !== document.body && a !== document.documentElement && !preview.contains(a) && !(a.closest && a.closest('.pg-offstage')) ? a : null; };
        // A variant stopped by a person is tried again once they leave, three times at most: then it is left untried and
        // the rest go on, so a component whose own script keeps moving the focus never holds the others up.
        retried[i] = (retried[i] || 0);
        var later = function () { if (++retried[i] > 3) { setTimeout(function () { if (!stopped) next(i + 1); }, 0); return; } setTimeout(function () { if (stopped) return; if (personOn()) later(); else next(i); }, 400); };
        if (personOn()) { combos.pop(); later(); return; }
        // Its keys (arrows, Home and End, Escape, Tab in a modal) only where the system's own script is on the page.
        window.__wcag21.interact(root, { wait: 200, triggers: 6, keys: !!document.querySelector('script[data-system-script]'), person: !BAKING }).then(function (r) {
          r.ran.forEach(function (k) { live.ran[k] = 1; });
          r.findings.forEach(function (f) {
            var key = f.kind + '|' + f.desc;
            if (!found[key]) { found[key] = { kind: f.kind, sc: f.sc, desc: f.desc, where: [] }; order.push(key); }
            found[key].where.push(cb.name);
          });
        }, function (e) { if (e && e.interrupted) { combos.pop(); later(); throw e; } /* this variant could not be tried */ }).then(function () { if (!stopped) next(i + 1); }, function () {});
      })(0);
    }
    // Per-component mode controls, inside the playground: only the axes that nest, so this preview can differ from the
    // page. The sizing mode (Desktop, Phone) at its top left, the colour mode and any other collection at its bottom right; they are the
    // system's modes, not the component's props. The stage keeps room for them above and below the component.
    var stageCol = sec.querySelector('.pg-preview-col'), barBottom = sec.querySelector('.pg-stage-bar--bottom');
    if (stageCol && AXES.some(function (a) { return a.scoped; })) {
      var slots = stageCol.querySelectorAll('.pg-stage-mode');
      [function (a) { return a.scoped && a.attr === 'data-size'; }, function (a) { return a.scoped && a.attr !== 'data-size'; }].forEach(function (which, i) {
        if (!AXES.some(which)) return;
        var row = SGModes.controls(preview, function () { refresh(); if (inspecting) requestAnimationFrame(drawAnatomy); }, which);
        slots[i].appendChild(row); SGModes.register(row);
      });
    }
    // The bottom bar shows while it holds something: the colour mode, a button that plays how it moves (at its left), or
    // what the inspector picked.
    function bottomBar() { if (barBottom) barBottom.hidden = !barBottom.querySelector('.pg-stage-mode').children.length && !barBottom.querySelector('.pg-actions').children.length && !inspecting; }
    var inspecting = false;
    bottomBar();
    var cur = null;   // the element the props act on, as last drawn
    var leaves = {};   // the part each text prop wrote into, as last drawn
    function refresh() {
      preview.innerHTML = '';
      var e = baseElement(c, renderFor(c, state));
      preview.appendChild(e);
      // A component that takes its width from where it is placed (a divider line) draws nothing in a centred stage:
      // it gets the stage's width, as it would in a product's row.
      if (!e.children.length && !e.textContent.trim() && e.getBoundingClientRect().width < 1) e.style.width = '100%';
      // Centred in the playground: a margin the instance has in its product (where it sits there) is not its own.
      e.style.margin = '0';
      // One the code lets grow to fill its place, up to a width (a dialog's max-width), shrinks in a centred stage: drawn
      // as wide as Figma fixes it, never wider than the code allows or the stage has room for.
      if (c.figmaWidth && e.getBoundingClientRect().width < c.figmaWidth - 1) {
        var grows = false;
        for (var k = e, d = 0; k && d < 4 && !grows; k = k.firstElementChild, d++) { var mw = parseFloat(getComputedStyle(k).maxWidth); grows = mw >= c.figmaWidth - 1; }
        if (grows) e.style.width = 'min(100%, ' + c.figmaWidth + 'px)';
      }
      // Hidden at rest until a class shows it (a tooltip): shown, as it is seen in use. One fixed to the window
      // (a tooltip at the pointer), not an overlay: drawn in place in the playground.
      var ecs = getComputedStyle(e);
      if (c.cls && (ecs.opacity === '0' || ecs.visibility === 'hidden')) { var sc = showClass(c); if (sc) { e.classList.add(sc); e.style.transition = 'none'; } }
      if (ecs.position === 'fixed' && !(c.motion && c.motion.overlay)) { e.style.position = 'relative'; e.style.inset = 'auto'; }
      // A component that lives inside another (one segment of a segmented control): drawn once, inside its parent,
      // and its props act on it, not on the parent.
      // A part that is not a selector the browser parses draws the whole, so one bad name never stops the page.
      if (c.only) { var ones = []; try { ones = Array.prototype.slice.call(e.querySelectorAll(c.only)); } catch (err) { /* not a selector */ } if (ones.length) { ones.slice(1).forEach(function (k) { k.remove(); }); e = ones[0]; } }
      cur = e;
      var written = [], hidden = []; leaves = {};
      // Shows, hides and options first, text last, so a part a show prop draws gets its text.
      props.slice().sort(function (a, b) { return (a.type === 'TEXT') - (b.type === 'TEXT'); }).forEach(function (p) {
        var v = state[p.label];
        // Disabled on: the native controls in it are disabled too, as a product sets them, so Tab passes them by and a
        // screen reader says so; a look of disabled alone leaves them working.
        if (/^\s*disabled\s*$/i.test(p.label) && (p.type === 'BOOLEAN' || p.type === 'VARIANT')) {
          var off = p.type === 'BOOLEAN' ? !!v : /^(true|yes|on)$/i.test(String(v));
          [e].concat(Array.prototype.slice.call(e.querySelectorAll('input, button, select, textarea'))).forEach(function (k) { if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(k.tagName)) k.disabled = off; });
        }
        if (p.type === 'VARIANT') (p.options || []).forEach(function (o) { applyEffect(e, o, o.label === v); });
        else if (p.type === 'BOOLEAN') {
          if (p.on || p.off) {
            applyEffect(e, p.on, !!v); applyEffect(e, p.off, !v);
            if (v && p.part && !partsOf(e, p.part).some(function (k) { return k !== e; })) addPart(e, p);   // an off modifier's part no instance holds
          }
          else if (p.part) {
            var have = partsOf(e, p.part).filter(function (k) { return k !== e; });
            if (!v) { have.forEach(function (k) { k.remove(); }); hidden = hidden.concat(lastCompound(p.part)); }
            else if (!have.length) addPart(e, p);   // no instance in the products has it: drawn from the code's own CSS
          }
        } else if (p.type === 'TEXT' && p.fromCode) {
          // A text only its build draws (no part in the contract): written where the build drew its default words.
          var drawn = leaves[p.label] && e.contains(leaves[p.label]) ? leaves[p.label] : wordsAt(e, String(p.default));
          if (drawn) { setText(drawn, v); written.push(drawn); leaves[p.label] = drawn; }
        } else if (p.type === 'TEXT' && v) {
          if (lastCompound(p.part).some(function (x) { return hidden.indexOf(x) >= 0; })) return;   // its show prop is off
          // Its own part missing from the instance (a class the code styles): drawn, never written into another part.
          if (/^\.[\w-]+$/.test(lastCompound(p.part)[0]) && !partsInOrder(e, p.part).some(function (k) { return k !== e && written.indexOf(k) < 0; })) { addPart(e, p); return; }
          var leaf = textLeaf(e, p.part, written);   // a part another text prop already wrote is not this one's
          if (leaf.tagName === 'INPUT') { if (/value/i.test(p.label)) { leaf.value = v; leaf.setAttribute('value', v); } else leaf.placeholder = v; }
          else setText(leaf, v);
          written.push(leaf); leaves[p.label] = leaf;
        }
      });
      // A control the instance named by aria-label (an icon-only button in a product) that the props now give visible
      // words: its words name it, as voice control expects (WCAG 2.5.3), so the old name goes.
      [e].concat(Array.prototype.slice.call(e.querySelectorAll('[aria-label]'))).forEach(function (k) {
        var given = k.getAttribute('aria-label'), shown = (k.textContent || '').replace(/\s+/g, ' ').trim();
        if (given && shown && /^(BUTTON|A)$/.test(k.tagName) && given.toLowerCase().indexOf(shown.toLowerCase()) < 0) k.removeAttribute('aria-label');
      });
      inspect(e);
      drawSlots();
      drawnWidth = (preview.firstElementChild && preview.firstElementChild.getBoundingClientRect().width) || drawnWidth;
      if (AREA === 'variants' && !drawingVariants) requestAnimationFrame(drawVariants);
      dependents();
    }
    // A control whose prop the code uses only while another is on (labelContent with showLabel on, alignment with
    // fullWidth on) is disabled while that one is not: nothing it sets would show. Its tooltip says what it waits for.
    function dependents() {
      Array.prototype.forEach.call(controlsEl ? controlsEl.children : [], function (k) {
        var p = k._prop; if (!p || !(p.onlyWith || []).length) return;
        var met = p.onlyWith.every(function (w) { var v = state[w.label]; return (v === true || String(v).toLowerCase() === 'true') === !!w.on; });
        k.classList.toggle('is-off', !met);
        Array.prototype.forEach.call(k.querySelectorAll('input, select, textarea, button:not(.sg-tip-btn)'), function (x) { x.disabled = !met; });
      });
    }
    // Each slot of the component (a Figma SLOT) marked where it sits: the area it takes, named Slot inside it (and its own
    // name when it has one), in place of the placeholder its markup holds. A slot the code gives a part of its own
    // (.modal-slot) is that part; one whose content the markup puts straight inside the component (a card, a status bar,
    // a segmented control's segments) is the area that content takes, the parts of its other slots left as they are.
    var SLOTS = ((c.parity && c.parity.rows) || []).filter(function (r) { return r.type === 'Prop' && r.figma && /^slot$/.test(r.figma.value) && r.code; });
    function slotName(r) { return /^slot$/i.test(r.figma.name) ? 'Slot' : 'Slot ' + r.figma.name; }
    function drawSlots() {
      if (!SLOTS || !SLOTS.length || !cur) return;
      // The parts that are not the slot's content: the slots the code gives a part of their own, and the parts the
      // controls show, hide or fill (a title, an icon).
      var partSel = SLOTS.filter(function (r) { return /^[.#]/.test(r.code.name); }).map(function (r) { return r.code.name; })
        .concat((c.controls || []).map(function (k) { return k.part; }).filter(function (sel) { return sel && /^[.#[]/.test(sel); }));
      SLOTS.forEach(function (r) {
        var own = /^[.#]/.test(r.code.name), els = [];
        try { els = own ? (cur.matches(r.code.name) ? [cur] : []).concat(Array.prototype.slice.call(cur.querySelectorAll(r.code.name))) : [cur]; } catch (e) { return; }
        els.forEach(function (el) {
          if (el !== cur) { el.classList.add('pg-slot-area'); el.setAttribute('data-slot', slotName(r)); return; }
          if (el.querySelector(':scope > .pg-slot-fill')) return;
          // The component itself holds the slot's content: that content gives way to an area in its place, at least the
          // size a slot needs to be read, so the component grows around it and its other parts still show.
          var kids = Array.prototype.filter.call(el.children, function (k) { return !partSel.some(function (sel) { try { return k.matches(sel) || k.querySelector(sel); } catch (e) { return false; } }); });
          var rs = kids.map(function (k) { return k.getBoundingClientRect(); }).filter(function (q) { return q.width || q.height; });
          var w = rs.length ? Math.max.apply(null, rs.map(function (q) { return q.right; })) - Math.min.apply(null, rs.map(function (q) { return q.left; })) : 0;
          var h = rs.length ? Math.max.apply(null, rs.map(function (q) { return q.bottom; })) - Math.min.apply(null, rs.map(function (q) { return q.top; })) : 0;
          var fill = document.createElement('div');
          fill.className = 'pg-slot-area pg-slot-fill'; fill.setAttribute('data-slot', slotName(r)); fill.setAttribute('aria-hidden', 'true');
          // Its width is the content's, never more than the room it has: a minimum would hold a component wider than a
          // narrow screen (a 469px action bar at 320px) and fail its reflow for a size the page set, not the system.
          fill.style.width = 'min(' + Math.max(w, 96) + 'px, 100%)'; fill.style.minHeight = Math.max(h, 40) + 'px';
          el.insertBefore(fill, kids[0] || null);
          kids.forEach(function (k) { k.classList.add('pg-slot-gone'); });
        });
      });
    }
    // The tokens table beside the code, read from the component as it is drawn now.
    // Every change in the Playground passes here (a control, a text typed, the component used in the preview), so the
    // anatomy is drawn again from it, once a frame.
    var anatQueued = false;
    function inspect(e) {
      if (inspecting && !anatQueued) { anatQueued = true; requestAnimationFrame(function () { anatQueued = false; drawAnatomy(); }); }
      var el = (c.cls && (e.classList.contains(clsName(c)) ? e : e.querySelector(clsSel(clsName(c))))) || e;
      tTokens.innerHTML = rowsHTML(lookRows(el, true).concat(partRows(el, c.name)));
      writeLink(); checkLive(); codeHeight();
      showCode(e);
      nudge();
      if (WIDTH !== 'fit') renderFrame();
      if (compareOn) requestAnimationFrame(drawCompare);
    }
    // What an element is drawn with, by the tokens behind it: its spacing, fill, line, corners, shadow, text. The
    // component's own rows (whole) add the colours its states set elsewhere; a part clicked in Inspect has its own.
    function lookRows(el, whole) {
      // Its text colour and font only when it draws text itself (a button whose label is a part of its own has only the
      // browser's colour: its label part says its colour and font).
      var ownText = Array.prototype.some.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); }) || /^(INPUT|TEXTAREA)$/.test(el.tagName);
      var cs = getComputedStyle(el), bw = cs.borderTopWidth, hasGap = cs.gap && cs.gap !== 'normal' && cs.gap !== '0px', texted = (whole || ownText) && drawsText(el);
      var shadow = cs.boxShadow && cs.boxShadow !== 'none' ? (c.allTokens || []).filter(function (t) { return t.props.some(function (p) { return /shadow/.test(p); }); }) : [];
      return [].concat(
        padRows(el, cs),
        [['gap', hasGap ? tok(el, cs.gap, 'gap') : '-']],
        [['background', (cs.backgroundColor === 'rgba(0, 0, 0, 0)') ? 'transparent' : tok(el, cs.backgroundColor, 'color', c.name)]],
        [['border', bw === '0px' ? 'none' : (tok(el, cs.borderTopColor, 'color', c.name) + '  ·  ' + bw + ' ' + cs.borderTopStyle)]],
        radiusRows(el, cs),
        cs.boxShadow && cs.boxShadow !== 'none' ? [['shadow', (shadow.length === 1 ? (shadow[0].figma || shadow[0].var) + '  ·  ' : '') + cs.boxShadow]] : [],
        texted ? [['color', tok(el, cs.color, 'color', c.name)]] : [],
        whole ? extraColorRows(el, preview, c.name) : [],
        texted ? fontFields(el, cs) : [],
        cs.opacity !== '1' ? [['opacity', cs.opacity]] : []
      );
    }
    // A part no instance in the products holds, made from the selector the code styles it with: an icon from the
    // system's own sheet at its icon size, else an element with the selector's classes and the text its text prop gives.
    function lastCompound(sel) { return String(sel || '').split(',').map(function (x) { return x.trim().split(/\s+/).pop(); }); }
    function addPart(e, p) {
      var simple = lastCompound(p.part)[0], tag = (/^[a-z][\w-]*/i.exec(simple) || [])[0] || 'span';
      var classes = (simple.match(/\.[\w-]+/g) || []).map(function (k) { return k.slice(1); });
      // An icon prop's part is an icon, whatever the selector names it by (.icon-left).
      if (tag === 'svg' || (!/^[a-z]/i.test(simple) && /icon|glyph|symbol/i.test(simple + ' ' + (p.label || '')))) {
        var id = (DATA.icons || [])[0]; if (!id) return;
        var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg'), use = document.createElementNS(ns, 'use');
        var size = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sg-icon'), 10) || 16;
        svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('aria-hidden', 'true');
        classes.forEach(function (k) { svg.classList.add(k); });
        use.setAttribute('href', '#' + id); svg.appendChild(use); e.insertBefore(svg, e.firstChild); return;
      }
      var el = document.createElement(tag);
      classes.forEach(function (k) { el.classList.add(k); });
      var mine = lastCompound(p.part);
      var t = props.find(function (k) { return k.type === 'TEXT' && k.part && lastCompound(k.part).some(function (x) { return mine.indexOf(x) >= 0; }); });
      // A part the code draws as a shape (a priority dot: its own CSS gives it a size while empty) is no text part:
      // it stays empty and comes before the component's words, as a leading mark does.
      if (!t) {
        e.appendChild(el); var box = el.getBoundingClientRect(); el.remove();
        if (box.width > 0 && box.height > 0) {
          var first = props.find(function (k) { return k.type === 'TEXT' && k.part; }), at = first && textLeaf(e, first.part);
          var words = at && at !== e && Array.prototype.find.call(at.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
          if (words) at.insertBefore(el, words); else if (at && at !== e) at.parentNode.insertBefore(el, at); else e.insertBefore(el, e.firstChild);
          return;
        }
      }
      if (t) el.textContent = state[t.label] || t.default || '';
      // A text part no text prop writes (Show Description alone) gets its own name, so showing it shows something.
      else if (!/^(svg|img|input|hr|br)$/i.test(tag)) el.textContent = String(p.label || '').replace(/^show[\s-]+/i, '').replace(/^\w/, function (c) { return c.toUpperCase(); });
      // Beside the component's other text parts, in the order of its props (a title before its description).
      var rank = function (k) { return /title|heading/i.test(k.label) ? -1 : props.indexOf(k); };   // a title leads
      var me = rank(t || p), next = null, last = null;
      props.slice().sort(function (a, b) { return rank(a) - rank(b); }).forEach(function (k) {
        if (k.type !== 'TEXT' || k === t || !k.part) return;
        var at = partsInOrder(e, k.part).find(function (x) { return x !== e && !x.closest('svg') && x.tagName !== 'INPUT'; });
        if (!at) return;
        if (rank(k) > me && !next) next = at; else if (rank(k) < me) last = at;
      });
      if (next) next.parentNode.insertBefore(el, next); else if (last) last.parentNode.insertBefore(el, last.nextSibling); else e.appendChild(el);
    }
    function textLands(p) {
      var keep = {}, probe = 'sg' + Math.random().toString(36).slice(2, 8);
      props.forEach(function (k) { keep[k.label] = state[k.label]; if (k.type === 'BOOLEAN') state[k.label] = true; });
      var at = false;
      probing = true;
      try {
        state[p.label] = probe; refresh();
        at = preview.innerHTML.indexOf(probe) >= 0 || Array.prototype.some.call(preview.querySelectorAll('input'), function (i) { return i.value === probe || i.placeholder === probe; });
      } finally { probing = false; props.forEach(function (k) { state[k.label] = keep[k.label]; }); refresh(); }
      return at;
    }
    // ── The component works as in a product ────────────────────────────────────────────────────────────────────────
    // A group of items one of which is selected (a segmented control, tabs): a click moves the selection, as the
    // product's own code would. Native inputs (a radio, a checkbox, a field) already work.
    var MARK = /^(is-)?(selected|active|current|checked|on)$/i;
    function selectionMoves(box, after) { box.addEventListener('click', function (ev) {
      for (var n = ev.target; n && n !== box; n = n.parentElement) {
        var p = n.parentElement; if (!p || !box.contains(p)) break;
        var sibs = Array.prototype.filter.call(p.children, function (k) { return k.tagName === n.tagName; });
        if (sibs.length < 2) continue;
        var marked = sibs.find(function (k) { return Array.prototype.some.call(k.classList, function (x) { return MARK.test(x); }) || /true/.test(k.getAttribute('aria-selected') || k.getAttribute('aria-pressed') || k.getAttribute('aria-checked') || ''); });
        if (!marked) continue;
        if (n.disabled || n.getAttribute('aria-disabled') === 'true' || marked === n) return;
        var cls = Array.prototype.filter.call(marked.classList, function (x) { return MARK.test(x); });
        sibs.forEach(function (k) { cls.forEach(function (x) { k.classList.toggle(x, k === n); }); ['aria-selected', 'aria-pressed', 'aria-checked'].forEach(function (a) { if (marked.hasAttribute(a)) k.setAttribute(a, k === n ? 'true' : 'false'); }); });
        if (after) after(); return;
      }
    }); }
    selectionMoves(preview, nudge);
    // Using the component sets its props: a switch flipped, a box ticked, a value typed in the preview shows in the
    // controls, as long as the option it lands on is one the page can read from the component.
    var syncs = {};
    function readBack() {
      if (!cur || !preview.contains(cur)) return;
      var changed = false;
      props.forEach(function (p) {
        var v = state[p.label], next = v;
        if (p.type === 'VARIANT') {
          var opts = p.options || [], now = opts.find(function (o) { return o.label === v; });
          if (now && now.state) return;   // a live state the page holds by a class of its own
          var holds = opts.filter(function (o) { return effectHolds(cur, o) === true; });
          var mine = now && effectHolds(cur, now);
          if (mine === true) return;
          if (holds.length) next = holds.sort(function (a, b) { return ((b.add || []).length + Object.keys(b.attrs || {}).length) - ((a.add || []).length + Object.keys(a.attrs || {}).length); })[0].label;
          else if (mine === false) { var plain = opts.filter(function (o) { return effectHolds(cur, o) === null && !o.state; }); if (plain.length === 1) next = plain[0].label; }
        } else if (p.type === 'BOOLEAN' && (p.on || p.off)) {
          var on = effectHolds(cur, p.on), off = effectHolds(cur, p.off);
          if (on === true && off !== true) next = true;
          else if (off === true && on !== true) next = false;
          else if (on === false && off !== false) next = false;
          else if (off === false && on !== false) next = true;
        } else if (p.type === 'TEXT' && /value/i.test(p.label)) {
          var leaf = textLeaf(cur, p.part);
          if (leaf && leaf.tagName === 'INPUT') next = leaf.value;
        }
        if (next !== v) { state[p.label] = next; changed = true; if (syncs[p.label]) syncs[p.label](); }
      });
      if (changed) inspect(cur);
    }
    ['click', 'change', 'input'].forEach(function (t) { preview.addEventListener(t, function () { setTimeout(readBack, 0); }); });
    // A component its build draws (no script of its own runs on the page): a click on it flips the state it is in (a
    // switch on, a box ticked, a tab chosen), as using it in a product does, and the controls follow. Not while it is
    // disabled, nor while Inspect picks its parts; a radio or a tab is chosen, never unchosen, by a click.
    var STATE_RE = /^(is)?(active|checked|selected|pressed|on|toggled|open|expanded|modelvalue|value)$/;
    var stateProp = c.renders ? props.filter(function (p) { return p.type === 'BOOLEAN' && STATE_RE.test(squashKey(p.label)) && renderedWith(c, p, !(p.type === 'BOOLEAN' ? !!p.default : p.default)); })[0] : null;
    if (stateProp) {
      preview.classList.add('pg-preview--usable');
      preview.addEventListener('click', function (e) {
        if (inspecting || !cur || !cur.contains(e.target)) return;
        var off = props.filter(function (p) { return p.type === 'BOOLEAN' && /^(is)?disabled$/.test(squashKey(p.label)); })[0];
        if (off && state[off.label]) return;
        var picks = /^(radio|tab|option|menuitemradio)$/i.test(c.role || '') || /^(radio|tab)/i.test(c.name);
        var next = picks ? true : !state[stateProp.label];
        if (next === state[stateProp.label]) return;
        e.preventDefault();
        state[stateProp.label] = next; if (syncs[stateProp.label]) syncs[stateProp.label](); refresh();
      });
    }
    // How it moves (DATA, read from the system's CSS): its entry and exit replayed, an overlay opened with its own
    // container, layers and open and closing classes. Each button is the system's own.
    var actions = sec.querySelector('.pg-actions'), mv = c.motion;
    function action(label, fn) { actions.insertAdjacentHTML('beforeend', sysButton('button', label)); var b = actions.lastElementChild; b.addEventListener('click', function () { fn(b); }); bottomBar(); }
    // Inspect: the Playground turns into its anatomy, the component as set, larger, each part, padding and gap outlined;
    // a click on one says in one line what it is and its value. Again puts the live component back.
    var tools = sec.querySelector('.pg-stage-tools');
    if (!ALL && tools && anatBox) {
      tools.insertAdjacentHTML('beforeend', sysButton('button', 'Inspect', ' aria-pressed="false"'));
      var inspectBtn = tools.lastElementChild;
      inspectBtn.addEventListener('click', function () {
        inspecting = !inspecting;
        // Inspect always draws it at Fit, the component in the middle of the stage.
        if (inspecting && WIDTH !== 'fit') showWidth('fit');
        inspectBtn.setAttribute('aria-pressed', inspecting ? 'true' : 'false');
        (inspectBtn.querySelector('span') || inspectBtn).textContent = inspecting ? 'Done inspecting' : 'Inspect';
        drawnWidth = (preview.firstElementChild && preview.firstElementChild.getBoundingClientRect().width) || drawnWidth;
        // One of the two at a time, whatever the Width: the anatomy in the stage, or the Playground (live, or in its
        // Width's frame).
        anatBox.hidden = !inspecting; if (anatLine) anatLine.hidden = !inspecting;
        if (!inspecting) { anatPicked = null; anatPath = []; anatBox.innerHTML = ''; }
        bottomBar();
        renderFrame();
        if (!inspecting) nudge();
      });
    }
    // Opened again by a link: its variant set, the controls following.
    sec._link = function (q) {
      if (!fromLink(q)) { writeLink(); return; }
      Object.keys(syncs).forEach(function (k) { syncs[k](); });
      if (widthBar) segItems(widthBar).forEach(function (b) { segSelect(b, b.dataset.v === WIDTH); });
      refresh();
    };
    if (!ALL && compareEl) { action('Figma', function (b) { compareOn = !compareOn; b.setAttribute('aria-pressed', compareOn ? 'true' : 'false'); if (compareOn && WIDTH !== 'fit') showWidth('fit'); drawCompare(); }); compareBtn = actions.lastElementChild; compareBtn.setAttribute('aria-pressed', 'false'); }
    function playTime(root) { var ms = 0; [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).forEach(function (k) { var cs = getComputedStyle(k); cs.animationDuration.split(',').forEach(function (d, i) { var t = (parseFloat(d) || 0) * (/ms$/.test(d.trim()) ? 1 : 1000) + (parseFloat((cs.animationDelay.split(',')[i] || '0')) || 0) * 1000; ms = Math.max(ms, t); }); }); return ms; }
    if (mv && mv.overlay) action('Open ' + c.name, function (trigger) {
      var o = mv.overlay, src = preview.firstElementChild; if (!src) return;
      var wrap = document.createElement('div'); wrap.className = o.container + ' ' + o.open + ' sg-overlay-host';   // the brand and the Playground's modes reach it
      AXES.forEach(function (a) { if (a.attr && preview.hasAttribute(a.attr)) wrap.setAttribute(a.attr, preview.getAttribute(a.attr)); if (a.classes) a.values.forEach(function (v) { if (v.value && preview.classList.contains(v.value)) wrap.classList.add(v.value); }); });
      o.layers.forEach(function (z) { var d = document.createElement('div'); d.className = z; wrap.appendChild(d); });
      var card = src.cloneNode(true); if (!card.getAttribute('role')) card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', c.name);
      // It opens as in a product: over the whole browser window, in the system's own container.
      wrap.appendChild(card); document.body.appendChild(wrap);
      var closing = false;
      function key(e) { if (e.key === 'Escape') close(); }
      function close() {
        if (closing) return; closing = true; document.removeEventListener('keydown', key, true);
        if (o.closing) wrap.classList.add(o.closing);
        setTimeout(function () { wrap.remove(); trigger.focus(); }, o.closing ? playTime(wrap) + 30 : 0);
      }
      wrap.addEventListener('click', function (e) { if (e.target === wrap || o.layers.some(function (z) { return e.target.classList.contains(z); }) || e.target.closest('button, a')) close(); });
      document.addEventListener('keydown', key, true);
      var first = Array.prototype.find.call(card.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'), function (k) { return !k.disabled && k.getClientRects().length && getComputedStyle(k).visibility !== 'hidden'; });
      if (!first) { card.setAttribute('tabindex', '-1'); first = card; }
      first.focus();
    });
    // A component its build draws teleported away (a modal, opened over the window by its own wrapper): opened over the
    // page from that drawing, the system's own overlay and motion with it; closed by Escape, a click outside it or any of
    // its buttons.
    else if (!(mv && mv.overlay) && (c.renders || []).some(function (r) { return r.label === 'opened'; })) action('Open ' + c.name, function (trigger) {
      var r = c.renders.filter(function (x) { return x.label === 'opened'; })[0], wrap = rootOf(r.markup); if (!wrap) return;
      AXES.forEach(function (a) { if (a.attr && preview.hasAttribute(a.attr)) wrap.setAttribute(a.attr, preview.getAttribute(a.attr)); if (a.classes) a.values.forEach(function (v) { if (v.value && preview.classList.contains(v.value)) wrap.classList.add(v.value); }); });
      var card = wrap.querySelector('[class]:not(:empty)') || wrap; if (!card.getAttribute('role')) card.setAttribute('role', 'dialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-label', c.name);
      // In a layer of its own over the whole window, as the product's app gives it one: its overlay fills it, centred.
      var host = document.createElement('div'); host.className = 'sg-overlay-host'; host.appendChild(wrap); document.body.appendChild(host);
      var closing = false;
      function key(e) { if (e.key === 'Escape') close(); }
      function close() { if (closing) return; closing = true; document.removeEventListener('keydown', key, true); setTimeout(function () { host.remove(); trigger.focus(); }, playTime(wrap) + 30); }
      wrap.addEventListener('click', function (e) { if (!card.contains(e.target) || e.target.closest('button, a')) close(); });
      document.addEventListener('keydown', key, true);
      var first = Array.prototype.find.call(card.querySelectorAll('button, a[href], input, select, textarea, [tabindex]'), function (k) { return !k.disabled && k.getClientRects().length; });
      if (!first) { card.setAttribute('tabindex', '-1'); first = card; }
      first.focus();
    });
    // A component that enters and leaves with a Vue transition (a toast sliding up): Hide and Show play its own leave and
    // enter classes on the drawing, as Vue sets them, so it moves with its own timing and curve.
    else if (c.vueTransition && !(mv && mv.entry)) (function () {
      var tn = c.vueTransition, shown = true;
      var span = function (el) { var cs = getComputedStyle(el), d = (cs.transitionDuration + ',' + cs.animationDuration).split(',').map(parseFloat).filter(isFinite); return Math.max.apply(null, d.concat([0])) * 1000 + 50; };
      var play = function (el, phase, done) {
        el.classList.add(tn + '-' + phase + '-from', tn + '-' + phase + '-active'); void el.offsetWidth;
        requestAnimationFrame(function () { el.classList.remove(tn + '-' + phase + '-from'); el.classList.add(tn + '-' + phase + '-to');
          setTimeout(function () { el.classList.remove(tn + '-' + phase + '-active', tn + '-' + phase + '-to'); if (done) done(); }, span(el)); });
      };
      action('Hide ' + c.name, function (trigger) {
        var el = preview.firstElementChild; if (!el) return;
        if (shown) { play(el, 'leave', function () { el.style.visibility = 'hidden'; }); shown = false; trigger.textContent = 'Show ' + c.name; }
        else { el.style.visibility = ''; play(el, 'enter'); shown = true; trigger.textContent = 'Hide ' + c.name; }
      });
    })();
    else if (mv && mv.entry) action('Play entry', function () { var src = preview.firstElementChild; if (src) src.replaceWith(src.cloneNode(true)); });
    if (mv && !mv.overlay) (mv.exits || []).forEach(function (x) { action('Play exit', function () {
      var src = preview.firstElementChild; if (!src) return; src.classList.add(x);
      setTimeout(function () { setTimeout(refresh, 400); }, playTime(src));
    }); });
    sec._refresh = refresh;
    // Every control is one segmented control showing the actual value: a boolean as false/true, a variant by its
    // option names, a text prop as a field. An option the page cannot show (a live state such as :hover, or a
    // markup-only switch) is offered but disabled.
    props.forEach(function (p) {
      var ctl = document.createElement('div'); ctl.className = 'pg-ctl'; if (p.at != null) ctl.dataset.at = p.at; ctl._prop = p;
      // A prop only the code's API takes says so: Figma has no prop for it.
      // What the label says beyond its name is in a tooltip beside it: a prop only the code's API takes, and a value the
      // code applies only while another prop is on (alignment with fullWidth).
      var when = (p.onlyWith || []).length ? 'Applies only with ' + p.onlyWith.map(function (w) { return w.label + (w.on ? ' on' : ' off'); }).join(' and ') : '';
      var tip = [p.fromCode ? 'From the code\'s API: Figma has no prop for it' : '', when].filter(Boolean).join('. ');
      // The page's own tooltip, its round "i" beside the name, says it (its bubble placed over the panel, never cut).
      var name = esc(p.label) + (p.prop !== p.label ? '<code>' + esc(p.prop) + '</code>' : '');
      var label = '<div class="pg-ctl-label">' + (tip ? '<span class="sg-mx-why"><span>' + name + '</span>' + tipHTML(tip, 'About ' + p.label) + '</span>' : name) + '</div>';
      if (p.type === 'TEXT') {
        ctl.innerHTML = label + (DATA.ui && DATA.ui.field ? DATA.ui.field.markup : '<input type="text" class="sg-input">');
        var field = ctl.querySelector('input'); field.value = state[p.label]; field.setAttribute('aria-label', p.label);
        // Only its words change: written into its part as drawn, so whatever else is set, in the controls or by using the
        // component in the preview (a radio picked, a box ticked), stays as it is. Emptied, or with no part yet, it is
        // drawn again.
        field.addEventListener('input', function () {
          state[p.label] = field.value;
          var leaf = leaves[p.label];
          if (!field.value || !leaf || !cur || !cur.isConnected || !cur.contains(leaf)) { refresh(); return; }
          if (leaf.tagName === 'INPUT') { if (/value/i.test(p.label)) { leaf.value = field.value; leaf.setAttribute('value', field.value); } else leaf.placeholder = field.value; }
          else setText(leaf, field.value);
          inspect(cur);
        });
        syncs[p.label] = function () { field.value = state[p.label]; };
        // A text the preview has nowhere to put (no part in the code for it, with every show prop on) is offered but not
        // editable, so a field never seems to do nothing.
        if (!textLands(p)) { field.disabled = true; field.title = 'No part in the code holds this text yet'; }
      } else {
        var opts = p.type === 'VARIANT' ? (p.options || []).map(function (o) { return { v: o.label, off: o.unbuilt || (o.live && !o.state && !(o.add || []).length && !Object.keys(o.attrs || {}).length), unbuilt: o.unbuilt }; })
          : [{ v: 'false' }, { v: 'true', off: !p.on && !p.off && !p.part && !renderedWith(c, p, true), drawn: p.part && !hasPart(c, p.part) }];   // a part no instance holds is drawn from the code's CSS
        var titleOf = function (o) { return o.drawn ? 'No instance in the products has this part: drawn from the code\'s own CSS for it' : o.unbuilt ? 'Figma has this option; the code does not build it yet' : o.off ? 'Shown live, not as a style the page can set' : '' ; };
        var choose = function (v) { var next = p.type === 'VARIANT' ? v : v === 'true'; if (next === state[p.label]) return; state[p.label] = next; sync(); refresh(); };
        var sync;
        if (p.type !== 'VARIANT') {
          // A boolean: a switch on the row's right, on when true. Its true the page cannot draw: the switch is off and says why.
          var onOpt = opts[1];
          ctl.innerHTML = label + '<button type="button" class="pg-switch" role="switch" aria-checked="false" aria-label="' + esc(p.label) + '"' + (onOpt.off ? ' disabled title="' + esc(titleOf(onOpt)) + '"' : onOpt.drawn ? ' title="' + esc(titleOf(onOpt)) + '"' : '') + '></button>';
          var sw = ctl.querySelector('.pg-switch');
          sync = function () { sw.setAttribute('aria-checked', String(state[p.label]) === 'true' ? 'true' : 'false'); };
          sw.addEventListener('click', function () { if (sw.disabled) return; choose(String(state[p.label]) === 'true' ? 'false' : 'true'); });
        } else if (opts.length <= 3 && opts.reduce(function (n, o) { return n + String(o.v).length; }, 0) <= 18) {
          // A few short options: a small segmented control on the row's right.
          ctl.innerHTML = label + segHTML(opts.map(function (o) { return { v: o.v, label: o.v, off: o.off, title: titleOf(o) }; }), p.label);
          sync = function () { segItems(ctl).forEach(function (b) { segSelect(b, b.dataset.v === String(state[p.label])); }); nudge(); };
          segItems(ctl).forEach(function (b) { b.addEventListener('click', function () { if (b.disabled || b.getAttribute('aria-disabled') === 'true') return; choose(b.dataset.v); }); });
        } else {
          // More, or longer: a dropdown on the row's right, an option the page cannot draw listed but disabled.
          ctl.innerHTML = label + '<span class="sg-select"><select class="sg-input" aria-label="' + esc(p.label) + '">' + opts.map(function (o) { return '<option value="' + esc(o.v) + '"' + (o.off ? ' disabled' : '') + (o.off ? ' title="' + esc(titleOf(o)) + '"' : '') + '>' + esc(o.v) + '</option>'; }).join('') + '</select></span>';
          var sel = ctl.querySelector('select');
          sync = function () { sel.value = String(state[p.label]); };
          sel.addEventListener('change', function () { choose(sel.value); });
        }
        syncs[p.label] = sync;
        sync();
      }
      controlsEl.appendChild(ctl);
    });
    // Figma's props the code does not build yet: listed with the rest, offered but not drawn.
    (c.unbuilt || []).forEach(function (u) {
      var ctl = document.createElement('div'); ctl.className = 'pg-ctl'; if (u.at != null) ctl.dataset.at = u.at;
      ctl.innerHTML = '<div class="pg-ctl-label">' + esc(u.label) + '</div><span class="pg-ctl-none" title="Figma has this prop; the code does not build it yet">Not in code</span>';
      controlsEl.appendChild(ctl);
    });
    // In Figma's order (its panel's: variants first, then the rest as Figma lists them), built or not.
    var ordered = Array.prototype.slice.call(controlsEl.children).map(function (k, i) { return { k: k, at: k.dataset.at === undefined ? 1e6 + i : +k.dataset.at }; })
      .sort(function (a, b) { return a.at - b.at; }).map(function (x) { return x.k; });
    showFirst(ordered, function (k) { return k._prop; }).forEach(function (k) { controlsEl.appendChild(k); });
    dependents();
    if (!props.length && !(c.unbuilt || []).length) { var none = document.createElement('div'); none.className = 'pg-empty'; none.textContent = c.codeOnly ? 'Only in the code: its props are under Documentation, compared with nothing in Figma.' : 'No agreed props yet.'; controlsEl.appendChild(none); }
    return sec;
  }

