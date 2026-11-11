  /* ── One table for every issue: the Status page, and each component's Parity and Accessibility areas ─────────────
     The same columns everywhere: its issue number (the Status page's), its area (Parity or Accessibility, with the type or the WCAG criterion
     under it), what Figma has and what the code has, what to do with who acts above it, and the status with when it was
     last updated and where it was read under it. The Status page lists the open rows of every component; a component's area lists all of its own,
     the open ones under the same numbers. A row: { key, area, kind, kindHTML, type, figma, code, todo (html), who, st,
     rel, at, src, extra }. */
  // What each status says: ready to fix (the answer is known: the code follows Figma), needs a decision (someone says
  // which side is right first), done.
  var STATUS = { todo: ['✕', 'Ready to fix', 'differs'], check: ['!', 'Needs a decision', 'figma'], done: ['✓', 'Done', 'match'], kept: ['≠', 'Kept on purpose', 'none'], none: ['–', 'Not needed', 'none'], skip: ['–', 'Not compared', 'none'] };
  function isOpen(r) { return r.st === 'todo' || r.st === 'check'; }
  // How long each open task has been open: when a build first found it (open-since.snapshot.json, put in the page as
  // sg-open-since). A task it does not list is as new as this build.
  var OPEN_SINCE = (function () { try { return JSON.parse((document.getElementById('sg-open-since') || {}).textContent || '{}') || {}; } catch (e) { return {}; } })();
  function openDays(r) { var at = isOpen(r) && OPEN_SINCE[r.key]; if (!at) return 0; var d = Math.floor((Date.parse(DATA.builtAt || new Date().toISOString()) - Date.parse(at)) / 864e5); return d > 0 ? d : 0; }
  function openFor(r) { var d = openDays(r); return !d ? '' : d < 14 ? 'Open ' + d + (d === 1 ? ' day' : ' days') : d < 60 ? 'Open ' + Math.floor(d / 7) + ' weeks' : 'Open ' + Math.floor(d / 30) + ' months'; }
  // The one line under a status, the table's and the panel's: what it says, else that it is new, else how it is checked,
  // with no date (its date is in Last checked): a check a person still has to make says it is still to make.
  // A source by name only: what it is (Figma, the intent layer, the code, the contract, a guidelines file), never its path.
  function srcNames(src) {
    var name = function (x) { x = String(x || ''); return /intent layer/i.test(x) ? 'Intent layer' : /contract/i.test(x) ? 'Contract' : /figma|variables/i.test(x) ? 'Figma' : /guideline|\.md\b|notion|wiki/i.test(x) ? 'Guidelines' : /code|css|\.(vue|jsx?|tsx?)\b|comment|stylesheet/i.test(x) ? 'Code' : /^(the )?references|pictures|\.png\b/i.test(x) ? 'References' : x; };
    var out = []; (src || []).forEach(function (x) { var n = name(x); if (n && out.indexOf(n) < 0) out.push(n); }); return out;
  }  // Documentation has four sources and no other (the owner's rule): Figma, the code, the contract, the intent layer. The
  // team's own written pages, wherever they live (a Markdown file, Notion, a wiki), are its intent layer; a picture is
  // Figma's; anything else is no source of documentation.
  var DOC_SOURCES = ['Intent layer', 'Figma', 'Contract', 'Code'];
  function docSrcNames(src) {
    var out = [];
    // The code is a source where it says something itself (its element read, a comment above a prop); a bare file path a
    // line merely cites (the stylesheet a guidance line points to) documents nothing.
    (src || []).forEach(function (x) { var n = srcNames([x])[0], w = n === 'Guidelines' ? 'Intent layer' : n === 'References' ? 'Figma' : n;
      if (w === 'Code' && /^[\w@./-]+\.(css|scss|less|js|mjs|cjs|ts|tsx|jsx|vue|svelte)$/i.test(String(x).trim())) return;
      if (DOC_SOURCES.indexOf(w) >= 0 && out.indexOf(w) < 0) out.push(w); });
    return out;
  }

  function statusLine(r) {
    var how = function (x) { return String(x || '').replace(/^Tested (on .+|now|at the last audit)$/, 'Tested in a browser').replace(/^Checked by a person$/, r.st === 'done' ? 'Checked by a person' : 'To check by a person'); };
    return (r.st === 'done' ? '' : r.rel) || (r.fresh && isOpen(r) ? 'New in the last audit' : '') || (r.writeTo || r.area === 'Documentation' ? '' : how((r.src || []).filter(Boolean)[0]));   // a Documentation row's Source says where
  }
  function statusHTML(st, sub, area) { var x = STATUS[st] || STATUS.none; return '<span class="pg-par-status pg-par--' + x[2] + '"><span class="pg-par-sign" aria-hidden="true">' + x[0] + '</span>' + esc(rowWord(st, area)) + '</span>' + (sub ? '<span class="pg-par-val">' + esc(sub) + '</span>' : ''); }
  // Each kind of issue in a table of its own shape: Parity compares Figma with the code, Accessibility a criterion with
  // what Figma states and what was found, Documentation a kind with what is written, and the rest where it is and what
  // to do. A component's own Parity, Accessibility and Documentation areas show the same tables as the Status page.
  // Local or shared (local-shared.mjs): a row's own, else its component's (what changes a system component every
  // product using it gets). Said beside who acts, its reason on hover and in the row's panel; only a shared one waits.
  function rowScope(r) { if (r.scope) return r.scope; if (r.from && r.from.scope) return r.from.scope; var c = HAS_PAGE[String(r.key || '').split('\u0000')[0]]; return (c && c.scope) || null; }
  function scopeWords(x) { return x ? (x.scope === 'shared' ? 'Shared' + (x.decider && x.decider.name ? ', waits on ' + x.decider.name : '') : 'Local, waits on no one') : ''; }
  function scopeHTML(x) { return x ? '<span class="sg-todo-scope" data-scope="' + esc(x.scope) + '" title="' + esc(x.reason || '') + '">' + esc(scopeWords(x)) + '</span>' : ''; }
  var ISSUE_CELL = {
    no: function (r) { var n = isOpen(r) ? TODO_NO[r.key] : null; return '<td class="pg-par-type sg-todo-no" data-todo-key="' + esc(encodeURIComponent(r.key)) + '">' + (n || '') + '</td>'; },
    kind: function (r) { return '<td class="sg-todo-area">' + (r.kindHTML || esc(r.kind || '')) + '</td>'; },
    // Figma and the code: the name and its value under it, to compare; a finding written out in full is the row panel's.
    figma: function (r) { return '<td>' + clip(firstLine(r.figma)) + '</td>'; },
    // When it was last updated, in a column of its own: short, the full date and time on hover.
    updated: function (r) { return '<td class="pg-at-cell">' + (r.at ? '<span class="pg-at-date" title="' + esc(when(r.at)) + '">' + esc(whenShort(r.at)) + '</span>' : '') + '</td>'; },
    written: function (r) { return '<td class="pg-written">' + clip(r.written) + '</td>'; },
    code: function (r) { return '<td>' + clip(firstLine(r.code)) + '</td>'; },
    where: function (r) { return '<td>' + (r.where || r.code || esc(r.kind || '')) + '</td>'; },
    todo: function (r) { return '<td>' + (r.who && r.area !== 'Accessibility' ? '<span class="sg-todo-who">' + esc(r.who) + '</span>' : '') + (isOpen(r) ? scopeHTML(rowScope(r)) : '') + (r.steps > 1 ? '<span class="sg-todo-step" title="' + esc('Step ' + r.step + ' of ' + r.steps + ': it follows another person\u2019s task') + '">' + r.step + '/' + r.steps + '</span>' : '') + (r.todo || '') + '</td>'; },
    // Who acts, in a column of its own: an accessibility task says the person, so a team can see its own work without
    // opening every row.
    whoCell: function (r) { return '<td class="sg-todo-whocell">' + (r.who ? '<span class="sg-todo-who">' + esc(r.who) + '</span>' : '') + '</td>'; },
    // Where it was read, by name only (Figma, Intent layer, Code, Contract, Guidelines); the file and its path are in the
    // row's panel.
    source: function (r) { return '<td class="sg-src-cell">' + esc((r.area === 'Documentation' ? docSrcNames : srcNames)(r.src).join(' · ')) + '</td>'; },
    // Its status in the table: the word, and one line under it (what it says, else that it is new, else where it was
    // read, unless its table has a Source column); every source is in the row's panel.
    status: function (r) {
      // How it was checked, its date left to the Last checked column (one date per row, never two).
      // Then, open, how long it has been open: what is stuck apart from what is new.
      var one = [r.area === 'Documentation' ? (r.st === 'done' ? '' : r.rel || '') : statusLine(r), openFor(r)].filter(Boolean).join(' \u00b7 ');
      return '<td' + (openDays(r) ? ' data-open-days="' + openDays(r) + '"' : '') + '>' + statusHTML(r.st, '', r.area) + (one ? '<span class="pg-par-val sg-one-line" title="' + esc(one) + '">' + esc(one) + '</span>' : '') + '</td>';
    }
  };
  var ISSUE_COLS = {
    Parity: [['Task nr', 'no'], ['Type', 'kind'], ['Figma', 'figma'], ['Code', 'code'], ['What to do', 'todo'], ['Status', 'status'], ['Last checked', 'updated']],
    Accessibility: [['Task nr', 'no'], ['What to do', 'todo'], ['Who acts', 'whoCell'], ['WCAG', 'kind'], ['What the Figma notes say', 'figma'], ['What the check found', 'code'], ['Status', 'status'], ['Last checked', 'updated']],
    Motion: [['Task nr', 'no'], ['What happens', 'kind'], ['Code', 'code'], ['Figma', 'figma'], ['What to do', 'todo'], ['Status', 'status'], ['Last checked', 'updated']],
    Documentation: [['Task nr', 'no'], ['Kind', 'kind'], ['Source', 'source'], ['What is written', 'written'], ['What to do', 'todo'], ['Status', 'status'], ['Last checked', 'updated']],
    Migration: [['Task nr', 'no'], ['Where', 'where'], ['What to do', 'todo'], ['Status', 'status'], ['Last checked', 'updated']],
    Products: [['Task nr', 'no'], ['Where', 'where'], ['What to do', 'todo'], ['Status', 'status'], ['Last checked', 'updated']],
    System: [['Task nr', 'no'], ['Type', 'kind'], ['What to do', 'todo'], ['Status', 'status'], ['Last checked', 'updated']],
    Page: [['Task nr', 'no'], ['Kind', 'kind'], ['What to do', 'todo'], ['Status', 'status'], ['Last checked', 'updated']]
  };
  var colsOf = function (area) { return ISSUE_COLS[area] || ISSUE_COLS.System; };
  // What a table leaves to its row's panel: Accessibility's Found and What to do are read in full there, so the table has
  // room for the criterion and Figma's states; Documentation's table is its task, kind, status and when it was checked,
  // what is written and what to do read in its panel.
  // Accessibility keeps what it found for the panel, but never its task: two tasks of one criterion differ only by
  // their words, so a table without them would show the same row twice.
  var PANEL_ONLY = { Parity: ['todo'], Accessibility: ['figma', 'code'], Documentation: ['written', 'todo'] };   // the rest: the row's panel
  var tableColsOf = function (area) { var off = PANEL_ONLY[area] || []; return colsOf(area).filter(function (col) { return off.indexOf(col[1]) < 0; }); };
  var ROW_GO_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
  // A long cell (what is written, what was found, what Figma states) shows its first lines in the table; the whole row
  // opens in the side panel (openRowPanel).
  function firstLine(html) { var d = document.createElement('div'); d.innerHTML = html || ''; Array.prototype.forEach.call(d.querySelectorAll('.sg-panel-only'), function (n) { n.remove(); }); return d.innerHTML; }
  function clip(html) { html = html || ''; return /<(p|div|details|table|ul)\b/i.test(html) || plainText(html, '').length > 180 ? '<div class="sg-cell-clip">' + html + '</div>' : html; }
  var ROW_DETAIL = [];   // every row drawn, by its index: what its side panel shows
  // A row's own address in a link (panel=row:<area>:<component>|<what>), the same however many times it is drawn.
  function rowKey(d) { return 'row:' + (d.area || '') + ':' + String(d.r.key || d.r.kind || '').replace(/\u0000/g, '|'); }
  function openRowKey(key) { for (var i = ROW_DETAIL.length - 1; i >= 0; i--) if (rowKey(ROW_DETAIL[i]) === key) { openRowPanel(i, null); return true; } return false; }
  function issueRowHTML(r, area) {
    var a = area || r.area, id = ROW_DETAIL.push({ r: r, area: a }) - 1;
    return '<tr class="sg-row-open" data-row-detail="' + id + '" tabindex="0" data-status="' + r.st + '"' + (r.area ? ' data-area="' + esc(r.area) + '"' : '') + (r.whoKey ? ' data-who="' + esc(r.whoKey) + '"' : '') + (r.type ? ' data-type="' + esc(r.type) + '"' : '') + (r.extra ? ' data-extra' : '') + '>' +
      tableColsOf(a).map(function (col) { return ISSUE_CELL[col[1]](r); }).join('') + '<td class="sg-row-go">' + ROW_GO_SVG + '</td></tr>';
  }
  // A row in full, in a panel from the right, as a token opens: each column of its table as a card, nothing cut short,
  // and what the table only counts (what was read from a page) written out.
  function openRowPanel(id, from) {
    var d = ROW_DETAIL[id]; if (!d) return;
    var r = d.r, m = panelShell('sg-row-panel', 'Row details');
    m._key = rowKey(d);
    // Its title: what the row is about, its words alone (a criterion's tip, what it means, stays out of it).
    var tmp = document.createElement('div'); tmp.innerHTML = r.kind ? esc(r.kind) : r.kindHTML || '';
    Array.prototype.forEach.call(tmp.querySelectorAll('.sg-tip, [role="tooltip"], .sg-hidden-text'), function (x) { x.remove(); });
    var title = tmp.textContent.trim() || d.area || 'Row';
    // The tip the row's name carries in the table, after the panel's title too (a copy, its ids its own).
    var tipNode = null, tipBox = document.createElement('div'); tipBox.innerHTML = r.kindHTML || '';
    var tipSrc = tipBox.querySelector('.sg-tip');
    if (tipSrc) { tipNode = tipSrc.cloneNode(true); Array.prototype.forEach.call([tipNode].concat(Array.prototype.slice.call(tipNode.querySelectorAll('[id], [aria-describedby], [aria-controls]'))), function (n) { ['id', 'aria-describedby', 'aria-controls'].forEach(function (a) { if (n.getAttribute && n.getAttribute(a)) n.setAttribute(a, n.getAttribute(a) + '-panel'); }); }); }
    // Its task number, as the table and the Status page number it.
    var nr = isOpen(r) ? TODO_NO[r.key] : null;
    var comp = String(r.key || '').split('\u0000')[0];
    var card = function (head, html) { return html ? '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">' + esc(head) + '</div><div class="sg-row-detail-body">' + html + '</div></div>' : ''; };
    // A source in the intent layer opens there: the component's own page, or the layer itself when no page is written yet.
    var ilHref = function (x) { if (!/intent layer/i.test(x)) return null; var own = HAS_PAGE[comp] && HAS_PAGE[comp].intentLayer; return (own && own.url) || (DATA.intentLayer && DATA.intentLayer.source && DATA.intentLayer.source.url) || null; };
    var ilFile = function (url) { var m = /\/-\/blob\/[^/]+\/(.+)$/.exec(url); return m ? decodeURIComponent(m[1]) : url.replace(/^https?:\/\//, ''); };
    // Each source on its own line, linked to where it is: its page in the intent layer (with its file), the component in
    // Figma; the row's own link when it carries one.
    var figmaOf = function () { var c0 = HAS_PAGE[comp]; return c0 ? figmaUrlOf(c0) : null; };
    var srcLines = function () { return (r.src || []).filter(Boolean).map(function (x, i) { var url = (r.srcLinks || [])[i] || ilHref(x) || (/figma/i.test(x) ? figmaOf() : null), file = url && /intent layer/i.test(x) && x.indexOf(ilFile(url)) < 0 ? ilFile(url) : ''; return '<p>' + (url ? '<a class="sg-uses-link" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(x) + '</a>' + (file ? '<span class="pg-par-val">' + esc(file) + '</span>' : '') : esc(x)) + '</p>'; }).join(''); };
    var hasSource = colsOf(d.area).some(function (col) { return col[1] === 'source'; });
    // An open task opens with what to do (and, for something still to write, where); what it is and why come after.
    var taskOpen = r.st && r.st !== 'done', order = colsOf(d.area).filter(function (col) { return ['no', 'kind'].indexOf(col[1]) < 0; });
    if (taskOpen) order = order.filter(function (col) { return col[1] === 'todo'; }).concat(order.filter(function (col) { return col[1] !== 'todo'; }));
    // Who acts has a column of its own only where the table has one (Accessibility); everywhere else it is said in
    // what to do, which is then the only place it appears.
    var whoCol = order.some(function (c) { return c[1] === 'whoCell'; });
    var body = order.map(function (col) {
      var k = col[1];
      // Its source, said once: what it was read from, or, still to write, nothing yet and where it belongs.
      if (k === 'source') return r.writeTo ? '' : card(col[0], srcLines() || '<p class="pg-missing">Nothing.</p>');   // still to write: where is in What to do
      // Written in two places: what each says, apart, under where it was read.
      if (k === 'written' && (r.writtenParts || []).length > 1) return r.writtenParts.map(function (p) { return card(col[0] + ' · ' + p.where.replace(/\s*\([^()]*\)$/, ''), p.html); }).join('');
      // Who acts has a column of its own, so it is its own card below, never inside this one.
      if (k === 'whoCell') return card(col[0], r.who ? '<p><span class="sg-todo-who">' + esc(r.who) + '</span></p>' : '');
      if (k === 'todo') return card(col[0], (!whoCol && r.who ? '<p><span class="sg-todo-who">' + esc(r.who) + '</span></p>' : '') + (isOpen(r) && rowScope(r) ? '<p class="sg-il-line">' + esc(rowScope(r).reason) + (rowScope(r).scope === 'shared' && rowScope(r).decider ? ' It waits on ' + esc(rowScope(r).decider.name) + '.' : '') + '</p>' : '') + (r.todo ? '<div class="sg-il-line">' + ((r.notes || []).length ? '<span class="sg-il-label">Points to cover</span><ul class="sg-il-points">' + r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul><span class="sg-il-label">How to write it</span><span class="sg-il-text">' + esc(r.how) + '</span>' : (r.writeTo && srcLines() ? '<span class="sg-il-label">What to do</span>' : '') + '<span class="sg-il-text">' + r.todo + '</span>') + (r.writeTo && srcLines() ? '<span class="sg-il-label">Where</span><span class="sg-il-text">' + srcLines().replace(/<\/?p>/g, ' ').trim() + '</span>' : '') + '</div>' + (r.decide || '') : ''));   // nothing to do: no card; a decision to copy after it (a pair to confirm)
      // Its status, where it was read and when it was last checked: three cards, as the table's columns are apart.
      if (k === 'status') { var line = statusLine(r); return card(col[0], '<p>' + statusHTML(r.st, '', d.area) + '</p>' + (line ? '<p class="pg-par-val">' + esc(line) + '</p>' : '')) + (hasSource ? '' : card('Where it was read', srcLines())); }
      if (k === 'updated') return card(col[0], r.at ? '<p>' + esc(when(r.at)) + '</p>' : '');
      var v = k === 'where' ? (r.where || r.code || '') : k === 'written' && r.writtenFull ? r.writtenFull : r[k];
      return card(col[0], v || '<p class="pg-missing">Nothing.</p>');
    }).join('');
    // What it affects, for an accessibility check: each place the check found, in a table of what it is (the part, what
    // of it, its element), the words on it, the state and mode it was seen in, and its measure against what it needs.
    // What it affects: each place its findings carry (placesTag), in a table of the part, what of it, its element, the
    // words on it, the state and mode it was seen in, and its measure against what it needs.
    var hits = [], tmpP = document.createElement('div');
    tmpP.innerHTML = (r.its || []).map(function (it) { return it.html || ''; }).join('') + (r.code || '');
    Array.prototype.forEach.call(tmpP.querySelectorAll('.sg-places[data-places]'), function (n) { try { hits = hits.concat(JSON.parse(n.getAttribute('data-places'))); } catch (e) { /* none */ } });
    var seenP = {}; hits = hits.filter(function (x) { var k = JSON.stringify(x); if (seenP[k]) return false; seenP[k] = 1; return true; });
    if (hits.length) {
      var COLS = [['Part', function (x) { return esc(x.part || '') + (x.places > 1 ? '<span class="pg-par-val">' + x.places + ' places</span>' : ''); }],
        ['What', function (x) { return esc(x.what || ''); }], ['Element', function (x) { return x.element ? '<code>' + esc(x.element) + '</code>' : ''; }],
        ['Words', function (x) { return x.text ? esc('"' + x.text + '"') : ''; }], ['State', function (x) { return esc(x.state || ''); }],
        ['Mode', function (x) { return esc(x.mode || ''); }], ['Measured', function (x) { return x.measured ? esc(x.measured) + (x.needs ? '<span class="pg-par-val">needs ' + esc(x.needs) + '</span>' : '') : ''; }],
        ['In the code', function (x) { return x.where ? '<code>' + esc(x.where) + '</code>' : ''; }]];
      var used = COLS.filter(function (cc) { return hits.some(function (x) { return cc[1](x); }); });
      // A list: the panel opens from a row of an issue table.
      var tbl = kvList(hits.map(function (x) { return used.map(function (cc) { return [cc[0], cc[1](x)]; }); }), 'sg-affects');
      body = '<div class="pg-inspect sg-token-card"><div class="pg-inspect-head">What it affects</div>' + tbl + '</div>' + body;
    }
    var det = m.querySelector('.sg-row-detail');
    var trail = trailHere(from);
    if (comp && trail.indexOf(comp) < 0) trail.push(comp);
    det.innerHTML = sidePanelPage({ crumbs: trail.concat([d.area || 'Task', nr ? 'Task ' + nr : '']), title: title, titleTip: tipNode ? tipNode.outerHTML : '', body: body });
    det.onclick = function (e) { var cp = e.target.closest('[data-pair-copy]'); if (cp) copyText(cp.getAttribute('data-pair-copy'), cp, cp.parentNode.querySelector('.sg-decide-said'), 'Paste it in Claude Code'); };
    panelShow(m, from);
  }
  // The side panel from the right a row opens in (and a module's, window.SG.openPanel): its scrim, its close button,
  // Escape, and the focus given back to what opened it.
  function panelShell(id, label) {
    var m = document.getElementById(id); if (m) return m;
    m = document.createElement('div'); m.id = id; m.className = 'sg-comp-panel sg-comp-panel--wide'; m.hidden = true;
    m.innerHTML = '<div class="sg-comp-panel-scrim" data-panel-close></div><div class="sg-comp-panel-box" role="dialog" aria-modal="true" aria-label="' + esc(label) + '" tabindex="-1"><button type="button" class="sg-btn sg-comp-panel-close" data-panel-close aria-label="Close">' + MX_COLLAPSE + '</button><div class="sg-tk-detail sg-row-detail"></div></div>';
    (document.querySelector('.sg-layout') || document.body).appendChild(m);
    m._shut = function () { if (m._key && new URLSearchParams(location.hash.split('?')[1] || '').get('panel') === m._key) setHashQuery({ panel: null }); m._open = false; m.classList.remove('is-open'); document.documentElement.classList.remove('sg-panel-open'); setTimeout(function () { if (!m._open) m.hidden = true; }, 200); if (m._from && document.contains(m._from)) m._from.focus(); };
    m.addEventListener('click', function (e) { if (e.target.closest('[data-panel-close]') || e.target.closest('.sg-row-detail a[href^="#"]')) m._shut(); });
    m.addEventListener('keydown', function (e) { if (e.key === 'Escape' && e.isTrusted) { e.stopPropagation(); m._shut(); } });
    return m;
  }
  // Every side panel's tables keep their heads in view as the panel scrolls, as the page's do: each card's head stuck
  // under the panel's head, its table's head under the card's. The CSS places them from the heights measured here, once
  // the panel is shown, again once it has slid in and its title has its final lines, and whenever its head changes size.
  function panelHeads(m) {
    var det = m.querySelector('.sg-row-detail'), ph = det && det.querySelector('.sg-panel-head'); if (!det) return;
    var heads = function () {
      if (ph && ph.offsetHeight) det.style.setProperty('--sg-panel-head-h', stuckH(ph) + 'px');
      Array.prototype.forEach.call(det.querySelectorAll('.sg-panel-body .pg-inspect'), function (c) { var h = c.querySelector(':scope > .pg-inspect-head'); if (h && h.offsetHeight) c.style.setProperty('--pg-card-head-h', stuckH(h) + 'px'); });
    };
    heads(); setTimeout(heads, 300);
    if (typeof ResizeObserver !== 'undefined' && ph && !ph._sized) { ph._sized = true; new ResizeObserver(heads).observe(ph); }
  }
  function panelShow(m, from) {
    m._from = from || null; m.hidden = false; m._open = true; document.documentElement.classList.add('sg-panel-open');
    if (m._key) setHashQuery({ panel: m._key });   // its own address, to send
    // Every panel opens at its top, whatever was opened in it before and how far it was scrolled.
    var sc = m.querySelector('.sg-row-detail'); if (sc) sc.scrollTop = 0;
    panelHeads(m);
    requestAnimationFrame(function () { requestAnimationFrame(function () { if (m._open) m.classList.add('is-open'); }); });
    m.querySelector('.sg-comp-panel-box').focus({ preventScroll: true });
  }
  // A click on a row (not on a link or a button in it), or Enter on it, opens it in full. Only a row this panel holds (it
  // carries its number): a table with a panel of its own (the Intent layer's) opens that one alone.
  document.addEventListener('click', function (e) {
    var tr = e.target.closest && e.target.closest('tr.sg-row-open[data-row-detail]'); if (!tr) return;
    if (e.target.closest('a, button, input, select, textarea, summary, label, [contenteditable]') || String(window.getSelection && window.getSelection()).length) return;
    openRowPanel(+tr.getAttribute('data-row-detail'), tr);
  });
  document.addEventListener('keydown', function (e) { var tr = e.target.closest && e.target.closest('tr.sg-row-open[data-row-detail]'); if (tr && e.target === tr && e.key === 'Enter') { e.preventDefault(); openRowPanel(+tr.getAttribute('data-row-detail'), tr); } });
  // Each open row's task number, as the Status page numbers it.
  function fillTodoNos(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.sg-todo-no[data-todo-key]'), function (el) {
      var tr = el.closest('tr'), n = TODO_NO[decodeURIComponent(el.dataset.todoKey)];
      el.textContent = n && tr && (tr.dataset.status === 'todo' || tr.dataset.status === 'check') ? n : '';
    });
    markTaskCols(root);
  }
  // A table where nothing is open (everything done or not needed) has no Task nr column: there is no task in it.
  function markTaskCols(root) {
    Array.prototype.forEach.call(root.querySelectorAll('table.sg-issues'), function (t) {
      var cells = t.querySelectorAll('td.sg-todo-no');
      t.classList.toggle('sg-no-tasks', !!cells.length && !Array.prototype.some.call(cells, function (k) { return k.textContent.trim(); }));
    });
  }
  function issueTableHTML(rows, bodyCls, head, area) {
    var cols = tableColsOf(area || ((rows || [])[0] || {}).area);
    return '<div class="pg-par-card' + (head ? ' sg-todo-card' : '') + '">' + (head ? '<div class="pg-inspect-head">' + head + '</div>' : '') + '<div class="pg-par-scroll"><table class="pg-par-table sg-issues sg-cols-' + cols.length + (area === 'Accessibility' ? ' sg-issues--a11y' : '') + '"><thead><tr>' + cols.map(function (col) { return '<th' + (col[1] === 'no' ? ' class="sg-todo-no-head"' : '') + '>' + esc(col[0]) + '</th>'; }).join('') + '<th class="sg-row-go"><span class="sg-hidden-text">Open</span></th></tr></thead><tbody' + (bodyCls ? ' class="' + bodyCls + '"' : '') + '>' + (rows || []).map(function (r) { return issueRowHTML(r, area); }).join('') + '</tbody></table></div></div>';
  }
  // A count of each status above a table, as the Status page counts them.
  function statusSum(rows) {
    var n = {}; rows.forEach(function (r) { if (!r.extra) n[r.st] = (n[r.st] || 0) + 1; });
    var area = rows.length && rows.every(function (r) { return r.area === rows[0].area; }) ? rows[0].area : null;
    return chipsHTML(n, area);
  }
  // The chips: All, then each status there is, its dot, its name and its count in the segments' badge; a click shows
  // only those rows (filterChips).
  function chipsHTML(n, area) {
    var sts = ['todo', 'check', 'done', 'kept', 'skip'].filter(function (k) { return n[k]; }), all = sts.reduce(function (t, k) { return t + n[k]; }, 0);
    if (!all) return '';
    var chip = function (k, label, count) { return '<button type="button" class="sg-chip" data-st="' + k + '" aria-pressed="' + (k === 'all') + '">' + (k === 'all' ? '' : '<span class="pg-par-status pg-par--' + STATUS[k][2] + '"><span class="pg-par-sign" aria-hidden="true"></span></span>') + esc(label) + countHTML(count) + '</button>'; };
    // One status only: nothing to filter, so the chip alone, shown chosen (it is all there is) and not a button, so it
    // cannot be unchosen (no All beside it).
    if (sts.length === 1) return '<span class="sg-chips"><span class="sg-chip sg-chip--only"><span class="pg-par-status pg-par--' + STATUS[sts[0]][2] + '"><span class="pg-par-sign" aria-hidden="true"></span></span>' + esc(rowWord(sts[0], area)) + countHTML(all) + '</span></span>';
    return '<span class="sg-chips" role="group" aria-label="Show">' + chip('all', 'All', all) + sts.map(function (k) { return chip(k, rowWord(k, area), n[k]); }).join('') + '</span>';
  }
  // ── Who acts, as a filter beside the status chips ────────────────────────────────────────────────────────────────
  // An accessibility table says the person on every row, so a team can show its own work and nobody has to read the
  // rest. Several at once, because one criterion often owes work to more than one of them. The shape is the Status
  // page's own filter (a chip that opens a listbox, each choice with how many rows it has), and it combines with the
  // status chips: a row is shown when both let it through.
  var WHO_DD = 0;
  function whoChipsHTML(rows) {
    var n = {}, keys = [], total = 0;
    Array.prototype.forEach.call(rows, function (tr) {
      if (tr.hasAttribute('data-extra')) return;
      if (String(tr.dataset.who || '').trim()) total++;
      String(tr.dataset.who || '').split(' ').filter(Boolean).forEach(function (k) { if (!n[k]) { n[k] = 0; keys.push(k); } n[k]++; });
    });
    if (keys.length < 2) return '';   // one person, or none said: nothing to filter
    keys.sort(function (a, b) { return ORDER.indexOf(a) - ORDER.indexOf(b); });
    var id = 'sg-who-dd-' + (++WHO_DD);
    return '<span class="sg-chip-dd sg-who-dd"><button type="button" class="sg-chip sg-chip-menu" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + id + '" aria-pressed="false">' +
      '<span class="sg-chip-label">Who acts</span><span class="sg-chip-word">All</span><span class="sg-chip-n"></span>' + FILTER_MARK + '</button>' +
      '<span class="sg-select-list" id="' + id + '" role="listbox" aria-multiselectable="false" aria-label="Who acts" tabindex="-1" hidden>' +
      '<span class="sg-dd-option" role="option" data-whopick="all" aria-selected="true"><span>All</span><span class="sg-count">' + total + '</span></span>' +
      keys.map(function (k) { return '<span class="sg-dd-option" role="option" data-whopick="' + esc(k) + '" aria-selected="false"><span>' + esc(WHO[k]) + '</span><span class="sg-count">' + n[k] + '</span></span>'; }).join('') +
      '</span></span>';
  }
  // The rows this filter lets through, and the words on its chip: none chosen is All.
  function applyWho(dd) {
    var list = document.getElementById(dd.querySelector('.sg-chip-menu').getAttribute('aria-controls'));
    var picked = Array.prototype.filter.call(list.querySelectorAll('.sg-dd-option'), function (o) { return o.getAttribute('aria-selected') === 'true'; })
      .map(function (o) { return o.dataset.whopick; }).filter(function (k) { return k !== 'all'; });   // All is every row: no filter at all
    var scope = dd.closest('.pg-par, .sg-todo') || dd.parentElement, shown = 0;
    Array.prototype.forEach.call(scope.querySelectorAll('table.sg-issues tbody tr'), function (tr) {
      var has = !picked.length || picked.some(function (k) { return (' ' + (tr.dataset.who || '') + ' ').indexOf(' ' + k + ' ') >= 0; });
      tr.classList.toggle('sg-who-off', !has);
      if (has && !tr.classList.contains('sg-st-off')) shown++;
    });
    var btn = dd.querySelector('.sg-chip-menu');
    btn.setAttribute('aria-pressed', picked.length ? 'true' : 'false');
    btn.querySelector('.sg-chip-word').textContent = !picked.length ? 'All' : picked.length === 1 ? String(WHO[picked[0]]).split(',')[0] : String(WHO[picked[0]]).split(',')[0] + ' +' + (picked.length - 1);
    btn.querySelector('.sg-chip-n').textContent = shown;
    Array.prototype.forEach.call(scope.querySelectorAll('.pg-par-card'), function (card) {
      card.classList.toggle('sg-st-empty', !Array.prototype.some.call(card.querySelectorAll('tbody tr'), function (tr) { return !tr.classList.contains('sg-st-off') && !tr.classList.contains('sg-who-off') && !tr.hidden; }));
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.sg-who-dd .sg-chip-menu');
    if (b) {
      var list = document.getElementById(b.getAttribute('aria-controls')), open = b.getAttribute('aria-expanded') !== 'true';
      list.hidden = !open; b.setAttribute('aria-expanded', String(open));
      return;
    }
    var o = e.target.closest && e.target.closest('.sg-who-dd .sg-dd-option[data-whopick]');
    if (o) {
      Array.prototype.forEach.call(o.parentElement.querySelectorAll('.sg-dd-option'), function (x) { x.setAttribute('aria-selected', x === o ? 'true' : 'false'); });
      applyWho(o.closest('.sg-who-dd')); return;
    }
    if (!(e.target.closest && e.target.closest('.sg-who-dd'))) Array.prototype.forEach.call(document.querySelectorAll('.sg-who-dd .sg-chip-menu[aria-expanded="true"]'), function (x) {
      x.setAttribute('aria-expanded', 'false'); document.getElementById(x.getAttribute('aria-controls')).hidden = true;
    });
  });
  function chipsCount(rows) { var n = {}; Array.prototype.forEach.call(rows, function (tr) { if (!tr.hasAttribute('data-extra')) n[tr.dataset.status] = (n[tr.dataset.status] || 0) + 1; }); return n; }
  function applyChip(b) {
    var group = b.closest('.sg-chips'), scope = group.closest('.pg-par, .sg-todo') || group.parentElement, st = b.dataset.st;
    scope._chip = st;
    Array.prototype.forEach.call(group.querySelectorAll('.sg-chip'), function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
    Array.prototype.forEach.call(scope.querySelectorAll('table.sg-issues tbody tr'), function (tr) { tr.classList.toggle('sg-st-off', st !== 'all' && tr.dataset.status !== st); });
    Array.prototype.forEach.call(scope.querySelectorAll('.pg-par-card'), function (card) { card.classList.toggle('sg-st-empty', !Array.prototype.some.call(card.querySelectorAll('tbody tr'), function (tr) { return !tr.classList.contains('sg-st-off') && !tr.classList.contains('sg-who-off') && !tr.hidden; })); });
    Array.prototype.forEach.call(scope.querySelectorAll('.sg-who-dd'), function (dd) { applyWho(dd); });   // the two filters agree on what is shown
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.sg-chip[data-st]'); if (b) { applyChip(b); if (e.isTrusted && hashParts().id !== 'status') setHashQuery({ st: b.dataset.st }); } });
  var ST_ORDER = { todo: 0, check: 1, done: 2, kept: 3, skip: 4, none: 5 };
  function byStatus(rows) { return rows.map(function (r, i) { return [r, i]; }).sort(function (p, q) { return (!!p[0].extra - !!q[0].extra) || ST_ORDER[p[0].st] - ST_ORDER[q[0].st] || p[1] - q[1]; }).map(function (x) { return x[0]; }); }
  function capital(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

