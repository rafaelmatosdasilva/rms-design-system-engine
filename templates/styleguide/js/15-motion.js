  /* ── Motion: the system's durations and easings, each played on demand; less motion; Figma's prototype ───────── */
  // Each duration moves a dot across its track at a steady pace, each easing over the system's own longest duration, its
  // curve drawn beside it. Nothing moves until Play is pressed, and for a person who asks for less motion the dots go
  // straight to their end, as the system's own rule has it.
  var motionTiming = function (m) { return m.ms + 'ms, ' + m.easing; };
  function motionCard(head, cols, rows, cls) {
    return '<div class="pg-par-card sg-motion-proto' + (cls ? ' ' + cls : '') + '">' + (head ? '<div class="pg-inspect-head">' + head + '</div>' : '') + '<div class="pg-par-scroll"><table class="pg-par-table"><thead><tr>' + cols.map(function (x) { return '<th>' + esc(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div></div>';
  }
  // Its Motion, one row for everything that moves in it, in the table every task shares: what happens (when it plays,
  // what moves and the part), the code's timing with its variables, the rule it is in and whether it stops for less
  // motion, Figma's timing and where in Figma it comes from, what to do and who does it, and its status. The component
  // shows every row; the Status page only those still to do, under the same numbers.
  function motionIssueRows(c) {
    var at0 = DATA.builtAt || null, val = function (t) { return t ? '<span class="pg-par-val">' + esc(t) + '</span>' : ''; };
    // The motion tokens the code names after it that Figma has no variables for: one task, for whoever keeps Figma.
    var varRows = (DATA.systemTodo || []).filter(function (t) { return t.component === c.name && t.kind === 'Motion variables'; }).map(function (t) {
      return { key: c.name + '\u0000motion:variables', area: 'Motion', kind: 'Variables', kindHTML: esc('Motion variables'), code: '<code>' + esc((t.vars || []).join(', ')) + '</code>', figma: '<span class="pg-par-none">None</span>', todo: esc(t.todo), who: WHO.figma, st: 'todo', rel: PAR_REL.code, at: at0 };
    });
    var timing = function (m) { return motionTiming(m) + (m.delay ? ', after ' + m.delay + 'ms' : ''); };
    return varRows.concat((c.moves || []).map(function (r) {
      var anim = /^(Repeats|Opens|Closes)$/.test(r.when) ? 'an animation' : 'a transition';
      var todo = r.status === 'differs' ? 'Make it ' + r.figma.ms + 'ms, ' + r.figma.easing + ', as Figma has it (' + r.figma.from + ').'
        : r.status === 'figma-none' ? 'Animate it in Figma as the code does (' + r.what + ', ' + r.code.ms + 'ms, ' + r.code.easing + '), on its Motion timeline or in its prototype, or stop it in the code.'
        : r.status === 'code-none' ? 'Give it ' + anim + ' of ' + r.figma.ms + 'ms, ' + r.figma.easing + ', as Figma has it (' + r.figma.from + ').' : '';
      var st = r.status === 'same' ? 'done' : r.status === 'differs' || r.status === 'figma-none' || r.status === 'code-none' ? 'todo' : 'none';
      return { key: c.name + '\u0000motion:' + r.when + ':' + (r.part || '') + ':' + r.what, area: 'Motion', kind: r.when, kindHTML: esc(r.when) + val(r.what) + (r.part ? '<span class="pg-par-val"><code>' + esc(r.part) + '</code></span>' : ''),
        code: r.code ? '<code>' + esc(timing(r.code)) + '</code>' + val(r.code.vars.join(', ')) + val(r.code.at) + val(r.code.calm ? 'Stops for less motion' : 'Keeps moving for less motion') : '<span class="pg-par-none">None</span>',
        figma: r.figma ? '<code>' + esc(motionTiming(r.figma)) + '</code>' + val(capital(r.figma.from)) : '<span class="pg-par-none">' + esc(r.status === 'unread' ? 'Not read yet' : 'None') + '</span>',
        todo: esc(todo), who: st === 'todo' ? (r.status === 'figma-none' ? WHO.figma : WHO.code) : '', st: st,
        rel: r.status === 'code-only' ? 'Only in the code' : r.status === 'unread' ? 'Figma not read yet' : r.status === 'figma-none' ? PAR_REL.code : r.status === 'code-none' ? PAR_REL.figma : r.status === 'differs' ? PAR_REL.differs : '', at: at0, unrun: r.status === 'unread' };
    }));
  }
  function motionOpen(c) { var n = motionIssueRows(c).filter(isOpen).length; return { todo: n > 0, say: n ? n + ' to fix' : '' }; }
  // Its Motion area: that table under the area's own title, a count of each status above it; what does not move said so.
  function motionHTML(c) {
    var rows = byStatus(motionIssueRows(c));
    if (!rows.length) return '<div class="pg-doc">' + areaInfo('It does not move: no transition or animation in its code, and none in Figma.') + '</div>';
    return '<div class="pg-doc pg-par pg-motion"><div class="pg-par-sum">' + statusSum(rows) + '</div>' + issueTableHTML(rows, '', '', 'Motion') + '</div>';
  }
  var MOTION = DATA.motion || null;
  // The system's motion as its fundamentals, in one table: each timing its components move with, from the fastest, a dot
  // that crosses its track on Play, the variables it is written with and their Figma names, what it is used for, the
  // components that move so (each once), Figma's timing for them, and what the system could do (a purpose that has other
  // timings too, a timing several components share, one written as values, a variable nothing uses).
  if (MOTION && (MOTION.overview || []).length) {
    hr(); foundationLink('motion', 'motion');
    // One short line: how many, and whether they stop for someone who asks for less motion.
    var less = MOTION.reduced ? 'They stop when someone asks for less motion.' : 'They don\'t stop yet when someone asks for less motion.';
    var mo = section('motion', 'Foundations', 'Motion', less);
    foundationLead(mo, plural(MOTION.overview.length, 'motion', 'motions') + ', each with its timing and curve.');
    // Play at the top right, as a page's own actions are, with its mark.
    var moActs = document.createElement('div'); moActs.className = 'sg-section-actions';
    moActs.innerHTML = sysButton('button', 'Play', ' data-motion-play', '', null, PLAY_SVG);
    mo.querySelector('h2').appendChild(moActs);
    var longest = MOTION.overview.reduce(function (m, r) { return Math.max(m, r.ms || 0); }, 0), baseMs = Math.max(longest, 200);
    var track = function (attrs) { return '<span class="sg-motion-sample"><span class="sg-motion-track"><span class="sg-motion-dot"' + attrs + '></span></span></span>'; };
    var known = function (n) { return COMPONENTS.some(function (c) { return c.name === n; }); };
    var PURPOSE_WORD = { Repeats: 'repeating', Opens: 'opening', Closes: 'closing', 'On hover': 'a hover', 'On press': 'a press', 'On focus': 'the focus' };
    var FIGMA_SAYS = { same: 'Same', differs: 'Differs', none: 'None in Figma', unread: 'Not read yet' };
    var systemSays = function (r) {
      if (r.unused) return 'No component uses it: use it, or remove it.';
      var out = r.alsoTimed.map(function (a) { return capital(PURPOSE_WORD[a.purpose] || a.purpose.toLowerCase()) + ' has ' + a.timings + ' timings: choose one for every component.'; });
      if (r.shared > 1) out.push('Shared by ' + r.shared + ' components' + (r.values ? ': make it one token.' : '.'));
      else if (r.values) out.push('Written as values: make it a token.');
      return out.join(' ');
    };
    var moTokens = function () { if (tkFoundation) tkFoundation(mo, 'motion'); };
    var mc = document.createElement('div');
    mc.innerHTML = motionCard('', ['Timing', 'Tokens', 'For', 'Used by', 'Figma', 'For the system'], MOTION.overview.map(function (r) {
      var timing = r.ms != null ? r.ms + 'ms' + (r.easing ? ', ' + r.easing : '') + (r.delay ? ', after ' + r.delay + 'ms' : '') : r.easing;
      var dot = track(' data-ms="' + (r.ms || baseMs) + '" data-ease="' + esc(r.easing || 'linear') + '"');
      var vars = r.vars.length ? r.vars.map(function (v) { return '<code>' + esc(v.var) + '</code><span class="pg-par-val">' + esc(v.figma || 'not in Figma') + '</span>'; }).join('') : esc('Written as values');
      // The components that move so, each once and linked to its Motion tab: what moves and how is on that tab.
      var users = r.uses.map(function (u) { return u.component; }).filter(function (n, i, all) { return all.indexOf(n) === i; });
      var uses = users.length ? users.map(function (n) { return known(n) ? '<a class="sg-uses-link" href="#' + esc(cid(n)) + '/motion">' + esc(n) + '</a>' : esc(n); }).join(', ') : esc('Nothing');
      return '<tr' + (r.unused ? ' data-unused' : '') + '><td>' + dot + '<code>' + esc(timing) + '</code></td><td>' + vars + '</td><td>' + esc(r.purposes.join(', ') || 'Nothing yet') + '</td><td>' + uses + '</td><td>' + esc(FIGMA_SAYS[r.figma] || '') + (r.figmaTiming && r.figma === 'differs' ? '<span class="pg-par-val">' + esc(r.figmaTiming) + '</span>' : '') + '</td><td>' + esc(systemSays(r)) + '</td></tr>';
    }), 'sg-motion-system');
    while (mc.firstChild) mo.appendChild(mc.firstChild);
    moTokens();   // its tokens, in the Tokens page's tables
    labelCells(mo);
    mo.querySelector('[data-motion-play]').addEventListener('click', function () {
      var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      Array.prototype.forEach.call(mo.querySelectorAll('.sg-motion-dot'), function (d) {
        var end = d.parentNode.clientWidth - d.offsetWidth, frames = [{ transform: 'translateX(0)' }, { transform: 'translateX(' + end + 'px)' }];
        if (d._run) d._run.cancel();
        if (calm || !d.animate) { d.style.transform = 'translateX(' + end + 'px)'; return; }
        d.style.transform = '';
        d._run = d.animate(frames, { duration: Number(d.getAttribute('data-ms')) || 300, easing: d.getAttribute('data-ease') || 'linear', fill: 'forwards' });
      });
    });
  }

