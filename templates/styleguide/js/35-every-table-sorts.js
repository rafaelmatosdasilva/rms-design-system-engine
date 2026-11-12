  /* ── Every table sorts: any column, by what its cells hold ──────────────────────────────────────────────────────── */
  // Every table of the page sorts by any of its columns, as the Status table does: its column's name a button, a
  // triangle on the column sorted, a second press the other way round. A table that sorts its own way (th[data-sort]:
  // Status, Rules, History) is left to it, and a table in a preview is the system's own, never touched.
  // What a cell sorts by: what it says it means (data-sort-value: a status by how urgent it is), else its date
  // (data-at, on it or inside it), else its words, numbers as numbers (Task nr 9 before 10). An empty cell goes last
  // either way. Each body sorts on its own, and a row across the whole table (a group's name) stays where it is, the
  // rows between two such rows sorted among themselves. The order chosen is kept while the table is drawn again (a
  // filter, a mode): a table with the same columns in the same place is sorted the same way.
  var SORT_OWN = '.pg-preview, .pg-frame, .pg-offstage, .pg-variants, .pg-example-stage, .sg-showroom-screen, .sg-scope';
  var SORTED = {};   // a table's place and columns → { col, dir }
  var SORT_COLL = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null;
  function sortHeadRow(t) { return t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null; }
  function sortWidth(t) { var r = sortHeadRow(t), n = 0; if (r) Array.prototype.forEach.call(r.cells, function (c) { n += c.colSpan || 1; }); return n; }
  function sortCellAt(tr, col) { var at = 0; for (var i = 0; i < tr.cells.length; i++) { var c = tr.cells[i], span = c.colSpan || 1; if (col < at + span) return c; at += span; } return null; }
  function sortColOf(th) { var at = 0, r = th.parentNode; for (var i = 0; i < r.cells.length; i++) { if (r.cells[i] === th) return at; at += r.cells[i].colSpan || 1; } return -1; }
  function sortValueOf(td) {
    if (!td) return '';
    var v = td.getAttribute('data-sort-value'); if (v != null) return v;
    var at = td.hasAttribute('data-at') ? td : td.querySelector('[data-at]'); if (at && at.getAttribute('data-at')) return at.getAttribute('data-at');
    var copy = td.cloneNode(true);
    Array.prototype.forEach.call(copy.querySelectorAll('.sg-tip, [role="tooltip"], .sg-hidden-text'), function (n) { n.remove(); });   // what a tip says is not what the cell holds
    return copy.textContent.replace(/\s+/g, ' ').trim();
  }
  function sortCompare(a, b) { return SORT_COLL ? SORT_COLL.compare(a, b) : a < b ? -1 : a > b ? 1 : 0; }
  function sortKey(t) {
    var r = sortHeadRow(t), place = t.closest('[id]');
    return (place ? place.id : '') + '|' + t.className + '|' + (r ? Array.prototype.map.call(r.cells, function (c) { return c.textContent.trim(); }).join('|') : '');
  }
  function sortTable(t, col, dir) {
    var width = sortWidth(t);
    Array.prototype.forEach.call(t.tBodies, function (tb) {
      var rows = Array.prototype.slice.call(tb.rows), runs = [], run = [];
      rows.forEach(function (tr) {
        var across = tr.cells.length === 1 && (tr.cells[0].colSpan || 1) >= width && width > 1;   // a group's name: it stays
        if (across) { runs.push(run, [tr]); run = []; } else run.push(tr);
      });
      runs.push(run);
      runs.forEach(function (group, gi) {
        if (gi % 2 || group.length < 2) return;   // a group's name, or nothing to order
        var keyed = group.map(function (tr, i) { return { tr: tr, v: sortValueOf(sortCellAt(tr, col)), i: i }; });
        keyed.sort(function (x, y) { if (!x.v !== !y.v) return x.v ? -1 : 1; return dir * sortCompare(x.v, y.v) || x.i - y.i; });
        keyed.forEach(function (k, i) { group[i] = k.tr; });
      });
      runs.forEach(function (group) { group.forEach(function (tr) { tb.appendChild(tr); }); });
    });
    var head = sortHeadRow(t);
    if (head) Array.prototype.forEach.call(head.cells, function (th) { if (th.hasAttribute('data-sort-col')) th.setAttribute('aria-sort', sortColOf(th) === col ? (dir > 0 ? 'ascending' : 'descending') : 'none'); });
  }
  function makeSortable(t) {
    if (t._sortSeen) return; t._sortSeen = true;
    if (t.closest(SORT_OWN) || t.querySelector('th[data-sort]')) return;
    var head = sortHeadRow(t); if (!head) return;
    Array.prototype.forEach.call(head.cells, function (th) {
      if (th.hasAttribute('data-sort-col') || !th.textContent.trim() || th.querySelector('button, a, input, select') || th.classList.contains('sg-row-go')) return;
      th.setAttribute('data-sort-col', ''); th.setAttribute('aria-sort', 'none');
      th.innerHTML = '<button type="button" class="sg-mx-sort">' + th.innerHTML + MX_TRI + '</button>';
    });
    var was = SORTED[sortKey(t)]; if (was) sortTable(t, was.col, was.dir);
  }
  function sortTables(root) {
    if (root.matches && root.matches('table')) makeSortable(root);
    if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('table'), makeSortable);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('th[data-sort-col] > .sg-mx-sort'); if (!b) return;
    var th = b.parentNode, t = th.closest('table'), col = sortColOf(th), key = sortKey(t), was = SORTED[key];
    var dir = was && was.col === col ? -was.dir : 1;   // first A to Z, oldest first, the most urgent first; again, the other way
    SORTED[key] = { col: col, dir: dir };
    sortTable(t, col, dir);
    if (sortWatch) sortWatch.takeRecords();   // its own moves are not a new drawing
  });
  // A table drawn later (an area opened, a panel, a filter) sorts too; one whose rows are drawn again keeps its order.
  var sortWatch = null;
  sortTables(document);
  if (typeof MutationObserver !== 'undefined') {
    sortWatch = new MutationObserver(function (ms) {
      var again = [];
      ms.forEach(function (m) {
        if (m.target.closest && m.target.closest(SORT_OWN)) return;
        Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) sortTables(n); });
        var t = m.target.closest && m.target.closest('table');
        if (t && t._sortSeen && again.indexOf(t) < 0 && m.addedNodes.length) again.push(t);
      });
      again.forEach(function (t) { var was = SORTED[sortKey(t)]; if (was) sortTable(t, was.col, was.dir); });
      sortWatch.takeRecords();
    });
    sortWatch.observe(document.body, { childList: true, subtree: true });
  }

  // The page drawn, the last thing its script does (the page's one scope closes here).
  route();
  document.documentElement.classList.add('sg-ready');   // drawn: the page shows, never its empty shell first
})();
