  // ── Health: the dashboard ────────────────────────────────────────────────────────────────────────────────────────
  // Every row of each area, as each component's own areas show it; what is not compared or not needed is left out. Each
  // component counts the same in an area, and the area's score is their average, the system's the areas' scores
  // weighted (styleguide.health.weights in ds-config.json changes the weights). Accessibility waits, as on the Status page,
  // until every component is tried in this browser, and the system's number with it, so no number moves in front of the
  // reader.
  var HEALTH_AREAS = [['Parity', 35], ['Accessibility', 30], ['Documentation', 20], ['Motion', 15]].map(function (a) {
    var w = DATA.healthWeights && DATA.healthWeights[a[0]]; return [a[0], typeof w === 'number' && w >= 0 ? w : a[1]];
  });
  var HEALTH_PART = { done: 1, kept: 1, check: 0.5, todo: 0 };
  // Parity and accessibility count the component: whole when nothing in it is left, half when only checks are left
  // (nothing is known to be wrong, someone has to look), nothing while one thing is to fix. Counted by row, the hundreds
  // of values that match and criteria that pass would hide the few that do not. Documentation and motion count each
  // item (done whole, to check half, to fix nothing): each is written or built by someone, none passes by itself.
  var HEALTH_WHOLE = { Parity: true, Accessibility: true };
  function healthStanding(rows, area) {
    if (!rows.length) return null;
    if (HEALTH_WHOLE[area]) return rows.some(function (r) { return r.st === 'todo'; }) ? 0 : rows.some(function (r) { return r.st === 'check'; }) ? 0.5 : 1;
    return rows.reduce(function (s, r) { return s + HEALTH_PART[r.st]; }, 0) / rows.length;
  }
  // What an agent needs to pick a component right: what it is, when to use it and when not, its role.
  var READY_KINDS = ['What it is', 'When to use', 'When not to use', 'Role'];
  // Every row a check owes the component, those that did not run included (not compared, not reached, Figma not read).
  function healthAllRows(c, withA11y) {
    var rows = [];
    try { rows = rows.concat(parityIssueRows(c), motionIssueRows(c), docIssueRows(c)); } catch (e) { /* read on its own page */ }
    if (withA11y) try {
      var tried = c.__a11y;
      rows = rows.concat(a11yIssueRows(c, tried ? tried.items : c.a11y ? a11yStaticItems(c) : [], tried ? tried.live : null), unreadRows(c));
    } catch (e) { /* its accessibility is read on its own page */ }
    return rows.filter(function (r) { return !r.extra && (r.st in HEALTH_PART || r.st === 'skip' || r.unrun); });
  }
  // The rows each area counts, as before; a check that did not run is also said apart, as what was not checked:
  // one still to run counts as to check here, so it never reads as passed.
  var notRun = function (r) { return r.st === 'skip' || !!r.unrun; };
  // Each component's checks that did not run, with why: for whoever asks what Checked leaves out.
  // Every open task's key, for the build to record when each was first found (styleguide-bake.mjs).
  window.__sgOpenKeys = function () { var out = []; COMPONENTS.forEach(function (c) { healthAllRows(c, ALL || !!c.__a11y).forEach(function (r) { if (isOpen(r) && r.key) out.push(r.key); }); }); return out; };
  window.__sgNotRun = function () { var o = {}; COMPONENTS.forEach(function (c) { var rows = healthAllRows(c, true).filter(notRun); if (rows.length) o[c.name] = rows.map(function (r) { return [r.area, r.kind, r.st, String(r.rel || r.note || '').replace(/<[^>]+>/g, '').slice(0, 120)]; }); }); return o; };
  function healthRowsOf(all) { return all.filter(function (r) { return r.st in HEALTH_PART; }); }
