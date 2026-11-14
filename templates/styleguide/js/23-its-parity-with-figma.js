  // ── Its parity with Figma: every prop, variable and value Figma and the code have, each with what Figma has, what the
  // code has, the status and when it last held. Each difference the last audit found is merged into the row it is about
  // (who acts, what to do, where in the code it is); what the audit found beyond those rows, a prop Figma has that the
  // code does not build and a component only the code has are rows of their own. ─────────────────────────────────────
  var PAR_REL = { match: 'Same', differs: 'Differs from Figma', figma: 'Only in Figma', code: 'Only in code', paired: 'Both, not compared' };
  function parityIssueRows(c) {
    var out = [], diffs = c.differences || [], used = {}, at0 = (DATA.differences && DATA.differences.at) || DATA.builtAt || null, lname = c.name.toLowerCase();
    var notBuilt = {}; (c.unbuilt || []).forEach(function (u) { notBuilt[String(u.label || u).toLowerCase()] = u.label || String(u); });
    // A side in the table is its name and value; where it applies (its frame, its selector) is for the row's panel.
    var side = function (x, where) { return x ? '<code>' + (/^--[\w-]+$/.test(x.name) ? usesLink(x.name) : esc(x.name)) + '</code>' + (x.value ? '<span class="pg-par-val">' + esc(x.value) + '</span>' : '') + (where ? '<span class="pg-par-val sg-panel-only">' + esc(where) + '</span>' : '') : '<span class="pg-par-none">Not there</span>'; };
    // Where in the code a difference is (its selector and file line), as the audit wrote it.
    var whereOf = function (x) { var m = /\(([^()]*:\d+[^()]*)\)/.exec(String(x.what || '')); return m ? m[1] : ''; };
    // A mismatch is a difference, flagged as one (Differs), whoever decides which side is right: knowing it differs is
    // never unsure. Unsure is kept for what is not known yet (a pairing to confirm, a kept difference to look at again).
    var diffRow = function (x) { return { st: 'todo', who: (WHO[x.who] || WHO.both) + teamNote(c.name), todo: esc(doWhat(x.todo)), fresh: !!x.new }; };
    // A difference the team decided to keep: its reason, who decided and when; once its review date has come it is to check.
    var kept = c.kept || [], keptUsed = {};
    var keptRow = function (k) {
      var side = k.truth === 'figma' ? ' Figma is right.' : k.truth === 'code' ? ' The code is right.' : '';
      var todo = esc(capital(k.reason) + (/[.!?]$/.test(k.reason) ? '' : '.') + side) + (k.due ? ' ' + esc('Look at it again: keep it with a new review date, or fix it.') : k.review ? ' ' + esc('Look again on ' + k.review + '.') : '');
      return { st: k.due ? 'check' : 'kept', who: k.by ? 'Kept by ' + k.by : 'Kept', todo: todo, rel: k.due ? 'Kept on purpose' : '', at: k.at || null };
    };
    // What each side says, said first in every task about a value both have: "Figma says font weight is 700, and the code
    // says 400." (the owner's, 12 November 2026). Nothing when either side has no value, or they say the same.
    // A name or a value in a task's words is set apart in a pill (sg-name), never run into the sentence. → HTML
    var nm = function (x) { return '<code class="sg-name">' + esc(String(x)) + '</code>'; };
    var bothSay = function (r) {
      var f = r.figma, k = r.code; if (!f || !k || f.value == null || k.value == null || f.value === '' || k.value === '' || String(f.value) === String(k.value)) return '';
      var same = String(f.name).toLowerCase() === String(k.name).toLowerCase();
      return 'Figma says ' + nm(f.name) + ' is ' + nm(f.value) + ', and the code says ' + (same ? '' : nm(k.name) + ' is ') + nm(k.value) + '. ';
    };
    var names = function (x, r) { var w = String(x.what || '').toLowerCase(); return (r.figma && w.indexOf(lname + ' ' + String(r.figma.name).toLowerCase() + ':') === 0) || (r.type === 'Token' && r.code && w.indexOf(String(r.code.name).toLowerCase()) >= 0); };
    ((c.parity && c.parity.rows) || []).forEach(function (r, i) {
      var name = (r.figma && r.figma.name) || (r.code && r.code.name) || '';
      // The difference the audit found on this row: one that names it (badge padding left: Figma 0, ...), or its variable.
      var di = r.status !== 'differs' ? -1 : diffs.findIndex(function (x, j) {
        if (used[j]) return false;
        var w = String(x.what || '').toLowerCase();
        return (r.figma && w.indexOf(lname + ' ' + String(r.figma.name).toLowerCase() + ':') === 0) || (r.type === 'Token' && r.code && w.indexOf(String(r.code.name).toLowerCase()) >= 0);
      });
      var x = di >= 0 ? diffs[di] : null; if (x) used[di] = 1;
      var ki = r.status !== 'differs' || x ? -1 : kept.findIndex(function (k, j) { return !keptUsed[j] && names(k, r); });
      var kx = ki >= 0 ? kept[ki] : null; if (kx) keptUsed[ki] = 1;
      var row = { key: c.name + '\u0000' + (x ? x.what : 'p:' + r.type + ':' + name + ':' + i), area: 'Parity', kind: r.type, type: r.type, figma: side(r.figma, r.figma && r.figma.where), code: side(r.code, (x && whereOf(x)) || (r.code && r.code.where) || ''), rel: PAR_REL[r.status] || r.status, at: r.at || (r.status !== 'match' ? at0 : null) };
      var nb = r.status === 'figma' && r.type === 'Prop' && notBuilt[String(name).toLowerCase()];
      if (x) { var d = diffRow(x); row.st = d.st; row.who = d.who; row.todo = d.todo; row.fresh = d.fresh; }
      else if (kx) { var kr = keptRow(kx); row.st = kr.st; row.who = kr.who; row.todo = kr.todo; row.rel = kr.rel; row.at = kr.at || row.at; }
      else if (r.status === 'match') row.st = 'done';
      else if (r.renamed || r.defaultDiffers || r.holdsDiffers) {
        // Its name, its default, what it may hold, or more than one, said in one task: make them the same, in Figma or
        // in the code.
        var said = (r.renamed ? 'Figma calls it ' + nm(r.figma.name) + ', and the code calls it ' + nm(r.code.name) + '. ' : '') + (r.defaultDiffers ? 'Figma says its default is ' + nm(r.defaultDiffers.figma) + ', and the code says ' + nm(r.defaultDiffers.code) + '. ' : '')
          + (r.holdsDiffers ? 'Figma says ' + nm(r.figma.name) + ' takes ' + nm(r.holdsDiffers.figma) + ', and the code says ' + nm(r.holdsDiffers.code) + '. ' : '');
        var same = [r.renamed ? 'one name' : '', r.defaultDiffers ? 'one default' : '', r.holdsDiffers ? 'one kind of content' : ''].filter(Boolean);
        row.st = 'todo'; row.who = WHO.both; row.todo = said + esc('Use ' + (same.length > 1 ? same.slice(0, -1).join(', ') + ' and ' + same[same.length - 1] : same[0]) + ' in both: change it in Figma or in the code.');
      }
      else if (r.status === 'paired') { row.st = 'skip'; row.todo = r.why ? esc(capital(r.why) + '.') : ''; }
      else if (nb) { row.st = 'todo'; row.who = WHO.code; row.todo = 'Figma has the ' + nm(nb) + ' property, but the code does not. ' + esc('Build it in the code, remove it from Figma, or keep it as a known exception.'); }
      else if (r.status === 'figma') { row.st = 'todo'; row.who = WHO.both; row.todo = 'Figma has ' + nm(name) + ', but the code does not. ' + esc('Build it in the code, remove it from Figma, or keep it as a known exception.'); }
      else if (r.status === 'code') { row.st = 'todo'; row.who = WHO.both; row.todo = 'The code has ' + nm(name) + ', but Figma does not. ' + esc('Add it to Figma, remove it from the code, or keep it as a known exception.'); }
      else if (r.why) { row.st = 'todo'; row.who = WHO.figma; row.todo = esc(capital(r.why) + '. Take the library update in this Figma file.'); }
      else { row.st = 'todo'; row.who = WHO.both; row.todo = esc(bothSay(r) ? 'Decide which one is right, then change the other, or keep it as a known exception.' : 'Figma and the code differ here. Decide which one is right, then change the other, or keep it as a known exception.'); }
      if (row.todo && row.st !== 'done' && !r.renamed && !r.defaultDiffers && bothSay(r)) row.todo = bothSay(r) + row.todo;
      out.push(row);
    });
    // A pair its contract suggests (a Figma property and a code prop only the code has, one name holding the other): a
    // yes or a no for a person, on the Figma property's row, or a row of its own. The panel has the two decisions to copy.
    (c.pairAsks || []).forEach(function (x) {
      var cmd = function (t) { return String(t).replace(/^rms-design-system-engine\b/, ENGINE); };
      var decide = '<div class="sg-decide-grid">' + [['approve', 'Yes, the same prop', x.yes, x.yesDoes], ['drop', 'No, two props', x.no, x.noDoes]].map(function (d) {
        return '<div class="sg-decide sg-decide--' + d[0] + '" title="' + esc(d[3]) + '"><strong class="sg-decide-head">' + decideMark(d[0]) + esc(d[1]) + '</strong>' + sysButton('button', 'Copy decision', ' data-pair-copy="' + esc(cmd(d[2])) + '"') + '<span class="sg-decide-said" role="status"></span></div>';
      }).join('') + '</div>';
      var todo = esc(x.ask + ' The engine suggests the pair from their names and never takes it on its own: say yes or no.');
      var at = out.filter(function (r) { return r.type === 'Prop' && r.rel === PAR_REL.figma && r.figma.indexOf('>' + esc(x.figma) + '<') >= 0; })[0];
      if (at) { at.st = 'check'; at.who = WHO.both; at.todo = todo; at.decide = decide; }
      else out.push({ key: c.name + '\u0000pair:' + x.figma, area: 'Parity', kind: 'Prop', type: 'Prop', figma: side({ name: x.figma, value: '' }), code: side({ name: x.code, value: '' }), todo: todo, decide: decide, who: WHO.both, st: 'check', rel: PAR_REL.paired, at: at0 });
    });
    // What the audit found that is not one of the rows above: a row of its own, under the check that found it.
    diffs.forEach(function (x, j) {
      if (used[j]) return;
      var d = diffRow(x);
      var sd = sidesOf(x.what), full = onWhat(c, x.plain || x.what);
      out.push({ key: c.name + '\u0000' + x.what, area: 'Parity', kind: x.check || 'Difference', type: 'Other', figma: sd ? sd.figma : '', code: sd ? sd.code + '<span class="pg-par-val sg-panel-only">' + full + '</span>' : full, todo: d.todo, who: d.who, st: d.st, rel: PAR_REL.differs, fresh: d.fresh, at: at0 });
    });
    // A kept difference that is not one of the rows above: a row of its own, under the check that found it.
    kept.forEach(function (k, j) {
      if (keptUsed[j]) return;
      var kr = keptRow(k);
      var ksd = sidesOf(k.what), kfull = onWhat(c, k.plain || k.what);
      out.push({ key: c.name + '\u0000kept:' + k.what, area: 'Parity', kind: k.check || 'Difference', type: 'Other', figma: ksd ? ksd.figma : '', code: ksd ? ksd.code + '<span class="pg-par-val sg-panel-only">' + kfull + '</span>' : kfull, todo: kr.todo, who: kr.who, st: kr.st, rel: kr.rel, at: kr.at || at0 });
    });
    // A prop Figma has that the code does not build, when the table above has no row for it.
    (c.unbuilt || []).forEach(function (u) {
      var label = u.label || String(u);
      if (out.some(function (r) { return r.type === 'Prop' && r.st === 'todo' && r.who === WHO.code && r.figma.indexOf('>' + esc(label) + '<') >= 0; })) return;
      out.push({ key: c.name + '\u0000unbuilt:' + label, area: 'Parity', kind: 'Prop', type: 'Prop', figma: side({ name: label, value: '' }), code: side(null), todo: esc('Build the ' + label + ' property of ' + c.name + ' in the code.'), who: WHO.code, st: 'todo', rel: PAR_REL.figma, at: at0 });
    });
    // Where it moves otherwise than Figma's prototype: a change Figma animates and the code makes at once, another
    // duration, another curve. The prototype is the design: the code follows it.
    // How it moves on its own: a loop, its opening, its closing; one Figma has and the code does not is Claude's, one
    // the code has and Figma does not is for whoever keeps Figma to animate there.
    // With its Motion area's table (c.moves), these are rows of Motion, not of Parity.
    (c.moves ? [] : c.motionDiffs || []).forEach(function (m) {
      var fig = m.figma ? '<code>' + esc(m.figma.ms + 'ms') + '</code><span class="pg-par-val">' + esc(m.figma.easing + (m.motion ? ', ' + m.figma.what : ', on ' + m.trigger)) + '</span>' : side(null);
      var code = m.code ? '<code>' + esc(m.code.ms + 'ms') + '</code><span class="pg-par-val">' + esc(m.code.easing + (m.code.what ? ', ' + m.code.what : '') + ' · ' + m.code.selector + ' · ' + m.code.file + ':' + m.code.line) + '</span>' : side(null);
      var anim = m.motion === 'loop' ? 'an animation that repeats' : m.motion ? 'an animation as it ' + (m.motion === 'open' ? 'opens' : 'closes') : 'a transition';
      var todo = m.kind === 'figma-none' ? 'Animate it in Figma as the code does (' + m.code.what + ', ' + m.code.ms + 'ms, ' + m.code.easing + '), on its Motion timeline or in its prototype, or tell the code team to stop it.'
        : m.kind === 'none' ? 'Give it ' + anim + ' of ' + m.figma.ms + 'ms, ' + m.figma.easing + ', as Figma has it' + (m.motion ? ' (' + m.figma.what + ')' : '') + '.'
        : m.kind === 'duration' ? 'Make ' + (m.motion ? 'its animation' : 'the transition') + ' ' + m.figma.ms + 'ms, as Figma has it.' : 'Ease it ' + m.figma.easing + ', as Figma does.';
      out.push({ key: c.name + '\u0000motion:' + m.kind + ':' + m.trigger + ':' + m.change, area: 'Parity', kind: 'Motion', type: 'Other', figma: fig, code: code, todo: esc(capital(m.change) + '. ' + todo), who: m.kind === 'figma-none' ? WHO.figma : WHO.code, st: 'todo', rel: m.kind === 'figma-none' ? PAR_REL.code : PAR_REL.differs, at: at0 });
    });
    // What it draws past its colours: a shadow, a blur, a gradient or image fill, clipping, blending, opacity. One
    // Figma has is the code's to follow; one only the code has, or Figma's clipping, is a decision.
    (c.effectDiffs || []).forEach(function (e) {
      var fig = '<span class="pg-par-val">' + esc(capital(e.figma)) + '</span>', code = '<span class="pg-par-val">' + esc(capital(e.code)) + '</span><span class="pg-par-val">' + esc(e.at) + '</span>';
      var todo = e.side === 'code' ? 'Draw it as Figma does.' : 'Decide which one is right: add it to Figma, or change the code.';
      out.push({ key: c.name + '\u0000effect:' + (e.part || '') + ':' + e.what, area: 'Parity', kind: 'Effect', type: 'Other', figma: fig, code: code, todo: esc(capital((e.part ? e.part + ' ' : '') + e.what) + '. ' + todo), who: e.side === 'code' ? WHO.code : WHO.both, st: e.side === 'code' ? 'todo' : 'check', rel: PAR_REL.differs, at: at0 });
    });
    // A component only the code has, while Figma has components of its own: Figma's to make, or the code's to retire.
    (SR_FOR[c.name] || []).forEach(function (f) { var n = f.screens.length; out.push({ key: c.name + '\u0000showroom:' + f.m.name, area: 'Parity', kind: 'Showroom', type: 'Other', figma: side({ name: f.m.name }), code: '<span class="pg-par-none">Not there</span>', todo: esc(f.m.what + ' Needed by ' + n + (n === 1 ? ' Showroom screen.' : ' Showroom screens.')), who: WHO.code, st: 'todo', rel: PAR_REL.figma, at: at0 }); });
    if (c.codeOnly && c.codeOnly.figma) out.push({ key: c.name + '\u0000codeOnly', area: 'Parity', kind: 'Component', type: 'Other', figma: side(null), code: side({ name: c.name, value: c.codeOnly.file }), todo: esc('Make ' + c.name + ' a component in Figma, or tell the code team it is not part of the system.'), who: WHO.figma, st: 'todo', rel: PAR_REL.code, at: at0 });
    return out;
  }
  // The Parity area: a count of each status (and of what is the same, differs, or is only on one side), a filter by
  // type, and the one table, what is open first under its To do number.
  function parityHTML(c) {
    var rows = byStatus(parityIssueRows(c));
    if (!rows.length) return '<div class="pg-doc">' + naInfo(stateC('none', 'N/A')) + '</div>';
    return '<div class="pg-doc pg-par"><div class="pg-par-sum">' + statusSum(rows) + '</div>' + issueTableHTML(rows, '', '', 'Parity') + '</div>';
  }
  // Each cell of a table of several columns carries the name of its column (data-label), shown above its value on a
  // phone where each row is a block; the table keeps its roles there, as a phone's browser drops them for a block.
  function labelCells(scope) {
    Array.prototype.forEach.call((scope || document).querySelectorAll('table.pg-par-table'), function (t) {
      var heads = Array.prototype.map.call(t.querySelectorAll('thead th'), function (th) { th.setAttribute('role', 'columnheader'); return th.textContent.trim(); });
      t.setAttribute('role', 'table');
      Array.prototype.forEach.call(t.querySelectorAll('thead, tbody'), function (g) { g.setAttribute('role', 'rowgroup'); });
      Array.prototype.forEach.call(t.querySelectorAll('tr'), function (tr) { tr.setAttribute('role', 'row'); });
      Array.prototype.forEach.call(t.querySelectorAll('tbody tr'), function (tr) {
        Array.prototype.forEach.call(tr.cells, function (td, i) { td.setAttribute('role', 'cell'); if (heads[i]) td.setAttribute('data-label', heads[i]); });
      });
    });
  }
