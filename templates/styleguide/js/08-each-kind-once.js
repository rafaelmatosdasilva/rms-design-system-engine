  // Each kind once, for the Documentation page and each component's Documentation area alike, so the two always show the
  // same things under the same names, in the same order: [name, where it was written (or '' when nobody wrote it), what
  // was written, where in full, what to say when it is missing].
  var guideOf = function (c, key) { return ((c.guidance || {}).sections || []).filter(function (x) { return x.key === key; })[0] || null; };
  // Its Do: and Don't: lines from Figma, the code or the contract (guidanceView → doDont), when it has any.
  var guideDo = function (c) { var d = (c.guidance || {}).doDont; return d && (d.text || []).length ? d : null; };
  var paras = function (list) { return list.map(function (t) { return '<p>' + esc(t) + '</p>'; }).join(''); };
  var figmaWhat = function (c) { return (c.description || '').replace(/@\w+/g, '').trim(); };
  var ilWhat = function (c) { return ((c.intentLayer || {}).purpose || '').trim(); };
  var guideKind = function (key, title) {
    return [title, function (c) { var s = guideOf(c, key); return s && s.text ? KNOW_FROM(s.from) : ''; },
      // What its first source says, then each other source that says it too, under its name: where each line came from.
      function (c) { var s = guideOf(c, key), page = function (u) { return u ? ' <a class="sg-uses-link" href="' + esc(u) + '" target="_blank" rel="noopener">Open its page</a>' : ''; };
        return paras(s.text) + (s.url ? '<p class="pg-par-val">' + page(s.url) + '</p>' : '') + (s.also || []).map(function (a) { return '<p class="pg-par-val">Also in ' + esc(a.from) + ':' + page(a.url) + '</p>' + paras(a.text); }).join(''); },
      function (c) { var s = guideOf(c, key); return [s].concat(s.also || []).map(function (x) { return /^[\w-]+\.\w/.test(x.from) ? x.from : capital(x.from); }).join(' · '); }, 'Not written yet.',
      function (c) { var s = guideOf(c, key); return [s].concat(s.also || []).map(function (x) { return { where: /^[\w-]+\.\w/.test(x.from) ? x.from : capital(x.from), url: x.url || (/figma/i.test(x.from) ? figmaUrlOf(c) : null), html: paras(x.text) }; }); }];
  };
  // What each source says, apart: one part per place it was read (its Figma description, its page in the intent layer,
  // the code's note), each with that place and a link to it, so two sources are never read as one.
  var figmaUrlOf = function (c) { return ((c.links || []).filter(function (l) { return l.label === 'Figma'; })[0] || {}).url || null; };
  var whatParts = function (c) {
    var out = [], note = (c.note || '').trim();
    if (figmaWhat(c)) out.push({ where: 'Its Figma description', url: figmaUrlOf(c), html: paras([figmaWhat(c)]) });
    else if (note) out.push({ where: 'The code', url: null, html: paras([note]) });
    if (ilWhat(c)) out.push({ where: 'Its page in the intent layer (' + c.intentLayer.file + ')', url: c.intentLayer.url || null, html: paras([ilWhat(c)]) });
    return out;
  };
  var roleFrom = function (a) { return a.roleFrom === 'figma' ? 'Figma' : a.roleFrom === 'contract' ? 'The contract' : 'The code'; };
  // Its role and its do and don't as its page in the intent layer writes them, the home for both (agents read them
  // there without Figma): a rule or section that starts "Role: button"; a section titled Do and don't, or rules that
  // start "Do:" / "Don't:".
  var ilTexts = function (c) { var il = c.intentLayer || {}; return (il.rules || []).map(function (r) { return { title: '', text: String(r.text || r || '') }; }).concat((il.sections || []).map(function (x) { return { title: String(x.title || ''), text: String(x.text || '') }; })); };
  var ilRole = function (c) {
    var hit = null;
    ilTexts(c).some(function (x) { var m = /^\s*role\s*[:\u2014-]\s*`?([a-z][\w -]*?)`?\s*(?:[.;(]|$)/im.exec(/^(accessibility )?role$/i.test(x.title) ? 'Role: ' + x.text : x.text); if (m) hit = m[1].trim().toLowerCase(); return !!hit; });
    return hit;
  };
  var ilDoDont = function (c) {
    var out = [];
    ilTexts(c).forEach(function (x) {
      if (/^do'?s?\s*(and|&)\s*don'?t'?s?$/i.test(x.title.trim())) out = out.concat(x.text.split(/\n+/).map(function (t) { return t.replace(/^\s*[-*]\s*/, '').trim(); }).filter(Boolean));
      else { var t = x.text.replace(/^\s*do'?s?\s*(and|&)\s*don'?t'?s?\s*:\s*/i, ''); if (/^\s*(do|don'?t|do not)\s*:/i.test(t)) out.push(t.trim()); }   // a section the reader made a rule of: "Do and don't: Do: …"
    });
    return out;
  };
  // Figma's annotation and the intent layer naming two different roles: one of them is wrong, a person checks which.
  var roleClash = function (c) { var a = (c.a11y || {}).role, i = ilRole(c); return !!(a && i && (c.a11y || {}).roleFrom === 'figma' && String(a).toLowerCase() !== i) ? { figma: String(a), il: i } : null; };
  var KNOW = [
    // What Figma or the code says it is, then what its intent-layer page says it is for, each under its source.
    ['What it is', function (c) { return figmaWhat(c) ? 'Figma' : (c.note || '').trim() ? 'The code' : ilWhat(c) ? capital(c.intentLayer.source || 'the intent layer') : ''; },
      function (c) { var own = figmaWhat(c) || (c.note || '').trim(); return paras([own || ilWhat(c)]) + (own && ilWhat(c) ? '<p class="pg-par-val">Also in ' + esc(c.intentLayer.source || 'the intent layer') + ' (' + esc(c.intentLayer.file) + '):</p>' + paras([ilWhat(c)]) : ''); },
      function (c) { var own = figmaWhat(c) ? 'From its Figma description' : (c.note || '').trim() ? 'From the code' : ''; var il = ilWhat(c) ? capital(c.intentLayer.source || 'the intent layer') + ' (' + c.intentLayer.file + ')' : ''; return [own, il].filter(Boolean).join(' · '); }, 'Not written yet.', whatParts],
    guideKind('whenToUse', 'When to use'),
    guideKind('whenNotToUse', 'When not to use'),
    guideKind('mistakes', 'Common mistakes'),
    guideKind('limitations', 'Limitations'),
    // Its do and don't: written in its intent-layer page, else as Do: and Don't: lines in its Figma description, the
    // code's note or the contract (what agents read), and its pictures in Figma for people.
    ['Do and don\'t', function (c) { var n = (c.examples || []).length, g = guideDo(c); return ilDoDont(c).length ? capital(c.intentLayer.source || 'the intent layer') : g ? KNOW_FROM(g.from) : n ? n + (n === 1 ? ' picture' : ' pictures') : ''; },
      function (c) { var g = guideDo(c); return (ilDoDont(c).length ? paras(ilDoDont(c)) : g ? paras(g.text) : '') + ((c.examples || []).length ? examplesGrid(c) : ''); },
      function (c) { var g = guideDo(c); return [ilDoDont(c).length ? capital(c.intentLayer.source || 'the intent layer') + ' (' + c.intentLayer.file + ')' : g ? (/^[\w-]+\.\w/.test(g.from) ? g.from : capital(g.from)) : '', (c.examples || []).length ? 'Figma' : ''].filter(Boolean).join(' · '); }, 'Not written yet.'],
    // Its role: its intent-layer page first, else Figma's annotation, the contract or the code; Figma and the page
    // naming two roles is said, to check.
    // A plain element at its root with no role said anywhere: none, read from the code (a11y.staticRole).
    ['Role', function (c) { var a = c.a11y || {}; return ilRole(c) ? capital(c.intentLayer.source || 'the intent layer') : a.role ? roleFrom(a) : a.staticRole ? 'The code' : ''; },
      function (c) { var x = roleClash(c), st = !ilRole(c) && !(c.a11y || {}).role && (c.a11y || {}).staticRole; if (st) return paras(['None: its root is a <' + st.tag + '>, nothing to press, type in or go to, so a screen reader reads what it holds as it is.']); return paras([ilRole(c) || c.a11y.role]) + (x ? '<p class="pg-missing">Figma\'s annotation says ' + esc(x.figma) + ', its page in the intent layer says ' + esc(x.il) + ': one of them is wrong.</p>' : ''); },
      function (c) { if (!ilRole(c) && !(c.a11y || {}).role && (c.a11y || {}).staticRole) return 'From the code (its root element)'; return [ilRole(c) ? capital(c.intentLayer.source || 'the intent layer') + ' (' + c.intentLayer.file + ')' : '', (c.a11y || {}).role ? ((c.a11y || {}).roleFrom === 'figma' ? 'From its annotation in Figma' : roleFrom(c.a11y)) : ''].filter(Boolean).join(' · '); }, 'Not written yet.']
  ];
  // Its Documentation, one row for each kind in the table every task shares: what was written (or that it is missing),
  // what to do and who writes it, and its status with where it was written. A component's own Documentation area lists
  // every kind, written or not; the Status page only the ones still to write, under the same numbers.
  // Every place the engine reads it from, any one of them: the page shows each under its source.
  var GUIDE_HINT = 'Write it in any one place the engine reads: ' + (DATA.intentLayer ? 'its page in the intent layer, under a section with that title (When to use, When not to use…); ' : '') +
    'its description in Figma, as a line that starts with that title (When to use: …); the comment above its rule in the code, the same way; or contract.authored.json under guidance.';
  var WRITE_HOW = {
    'What it is': 'Write it in any one place the engine reads: ' + (DATA.intentLayer ? 'its page in the intent layer (an Intent or Overview section), ' : '') + 'its description in Figma, or its note in the code.',
    'Do and don\'t': 'Write it in any one place the engine reads, each line starting with Do: or Don\'t:, with the markup when it helps: ' + (DATA.intentLayer ? 'its page in the intent layer, under a section titled Do and don\'t; ' : '') + 'its description in Figma; the comment above its rule in the code; or contract.authored.json under guidance.doDont. Agents read it there; pictures in Figma (frames named under examples in contract.authored.json) are for people, beside it.',
    Role: 'Write it in its page in the intent layer, as a rule that starts with Role: (Role: button). Agents read it there; an annotation in Figma says the same to people and is checked against it.'
  };
  // Its tokens: how many say what they are for (Figma's variable descriptions, what an agent reads to pick the right
  // token), each one that does not by name, and those that do with what they say.
  var tokenDocRow = function (c) {
    var t = c.tokenDocs; if (!t || !t.total) return null;
    var n = t.total - t.missing.length, all = !t.missing.length;
    var head = '<p>' + n + ' of ' + t.total + (t.total === 1 ? ' token says' : ' tokens say') + ' what ' + (t.total === 1 ? 'it is' : 'they are') + ' for.</p>';
    var miss = t.missing.length ? '<p class="pg-missing">No description: ' + t.missing.slice(0, 12).map(function (m) { return '<code>' + esc(m) + '</code>'; }).join(', ') + (t.missing.length > 12 ? ', and ' + (t.missing.length - 12) + ' more' : '') + '.</p>' : '';
    var said = (t.described || []).slice(0, 8).map(function (d) { return '<p><code>' + esc(d.figma) + '</code> ' + esc(d.description) + '</p>'; }).join('');
    return { key: c.name + '\u0000doc:tokens', area: 'Documentation', kind: 'Its tokens', written: head + miss + said,
      todo: all ? '' : esc('Write what each token is for in its description in Figma. Agents read it to pick the right token.'), who: all ? '' : WHO.figma, st: all ? 'done' : 'todo', rel: '', at: DATA.builtAt || null, src: n ? ['From the variables\' descriptions in Figma'] : [] };
  };
  // From the guidance rating (everything written about it, wherever it is written), only what no other row says: an
  // example, and the names it gives that the system does not have. What it is, when to use it, when not to and its role
  // are their own rows; its properties are in its contract, from Figma and the code, never asked for again here.
  var WHERE_TO_WRITE = function () { return 'in any one place the engine reads: ' + (DATA.intentLayer ? 'its page in the intent layer, ' : '') + 'its description in Figma, or a section of your guidelines headed with its exact name. Each is read the same way.'; };
  var agentRows = function (c) {
    var a = c.agentRating || {};
    var base = { area: 'Documentation', rel: '', at: DATA.builtAt || null, src: (a.from || []).slice(0, 3) };
    var mk = function (key, kind, written, st, todo) { return Object.assign({ key: c.name + '\u0000doc:' + key, kind: kind, written: written, st: st, todo: st === 'done' ? '' : esc(todo), who: st === 'done' ? '' : WHO.person }, base); };
    var rows = [];
    var ex = !!(a.pieces || {}).example;
    if (c.agentRating) rows.push(mk('example', 'Example', ex ? '<p>An example of it in use is written.</p>' : '<p class="pg-missing">No example yet.</p>', ex ? 'done' : 'todo',
      'Write an example of it in use (a code block, or Do and don\'t with its markup) ' + WHERE_TO_WRITE()));
    // Still to write: a ready example from its own import and props, to start from.
    if (rows.length && !ex) { var exHow = 'Write an example of it in use (a code block, or Do and don\'t with its markup) ' + WHERE_TO_WRITE(); rows[rows.length - 1].todo = notesHTML(docNotes('Example', c), exHow); rows[rows.length - 1].notes = docNotes('Example', c); rows[rows.length - 1].how = exHow; }
    // Its properties, in its contract. The one everybody reads is in the intent layer: done while it still lists what the
    // code and Figma have, a task to publish again when it does not. Only the engine's local one: a task to publish it,
    // when the system has an intent layer to publish it to; with none, the local one is the one every agent reads.
    var k = c.contract;
    if (k && (k.props || []).length) {
      var where = k.href ? '<a href="' + esc(k.href) + '" target="_blank" rel="noopener"><code>' + esc(k.file) + '</code></a>' : '<code>' + esc(k.file) + '</code>';
      var listed = k.props.map(function (n) { return '<code>' + esc(n) + '</code>'; }).join(', ');
      var publish = 'Publish the contracts again from the code project (rms-design-system-engine --contracts-out <intent layer>/specs/contracts) and open a merge request.';
      var row = !k.shared && !DATA.intentLayer
        ? mk('props', 'Properties', '<p>Its ' + k.props.length + (k.props.length === 1 ? ' property is' : ' properties are') + ' in its contract, ' + where + ', which the engine generates from Figma and the code on every run: ' + listed + '. Agents read them there; nothing to write.</p>', 'done', '')
        : !k.shared
        ? mk('props', 'Properties', '<p class="pg-missing">Its properties are only in the engine\'s local contract, ' + where + ', which nobody else reads.</p>', 'todo', 'Publish the contracts to the intent layer (rms-design-system-engine --contracts-out <intent layer>/specs/contracts) and open a merge request, so everybody reads the same one.')
        : (k.drift || []).length
          ? mk('props', 'Properties', '<p class="pg-missing">Its contract in the intent layer, ' + where + ', is out of date: ' + k.drift.map(esc).join('; ') + '.</p>', 'todo', publish)
          : mk('props', 'Properties', '<p>Its ' + k.props.length + (k.props.length === 1 ? ' property is' : ' properties are') + ' in its contract in the intent layer, ' + where + ', which the engine generates from Figma and the code: ' + listed + '. Agents read them there; nothing to write.</p>', 'done', '');
      rows.push(Object.assign(row, { src: ['Its contract (' + k.file + ')'] }));
    }
    // What each of its props is for: how many say it, each one that says nothing with where its description goes (the
    // comment above it in its code file, or contract.authored.json), and the sentences drafted for its code props, to
    // approve. The patch that writes them where the engine reads them next run is applied only when the person asks.
    var pd = c.propDocs;
    if (pd && pd.total) {
      var pmiss = pd.missing || [], pdrafts = pmiss.filter(function (m) { return m.draft; }), inPatch = pdrafts.filter(function (m) { return m.inPatch; });
      var pname = function (m) { return '<code>' + esc(m.prop) + '</code>' + (m.figma ? ' <span class="pg-dim">(Figma ' + esc(m.figma) + ')</span>' : ''); };
      var pwritten = '<p>' + pd.described + ' of ' + pd.total + (pd.total === 1 ? ' prop says what it is' : ' props say what they are') + ' for.</p>' +
        (pmiss.length ? '<p class="pg-missing">No description:</p><ul>' + pmiss.map(function (m) { return '<li>' + pname(m) + ': <code>' + esc(m.where) + '</code></li>'; }).join('') + '</ul>' : '') +
        (pdrafts.length ? '<p class="pg-par-val">Drafted, to approve</p><ul>' + pdrafts.map(function (m) { return '<li>' + pname(m) + ': ' + esc(m.draft) + (m.inPatch ? '' : ' <span class="pg-dim">(write it by hand)</span>') + '</li>'; }).join('') + '</ul>' : '');
      var ptodo = !pmiss.length ? '' : [inPatch.length && pd.patch ? 'Read each drafted line. To write them in the code, where the engine reads them on the next run, copy the request and paste it into Claude Code: it applies ' + pd.patch + '. A line that says it wrong: write the right words in the code instead.' : '',
        pmiss.length > inPatch.length ? 'Write the others where each line says: the comment above the prop in its code file, or contract.authored.json under propDescriptions.' : ''].filter(Boolean).join(' ');
      var prow = { key: c.name + '\u0000doc:propdesc', area: 'Documentation', kind: 'What each prop is for', written: pwritten, todo: esc(ptodo), who: !pmiss.length ? '' : inPatch.length ? WHO.both : WHO.code, st: pmiss.length ? 'todo' : 'done', rel: '', at: DATA.builtAt || null, src: ['Its contract' + (k ? ' (' + k.file + ')' : '')] };
      if (inPatch.length && pd.patch && pd.apply) prow.decide = '<div class="sg-decide-grid"><div class="sg-decide sg-decide--approve" title="' + esc('Applies the patch: each drafted line goes above its prop in the code.') + '"><strong class="sg-decide-head">' + decideMark('approve') + esc('Apply the ' + inPatch.length + (inPatch.length === 1 ? ' draft' : ' drafts')) + '</strong>' + sysButton('button', 'Copy request', ' data-pair-copy="' + esc(pd.apply) + '"') + '<span class="sg-decide-said" role="status"></span></div></div>';
      rows.push(prow);
    }
    // What agents got wrong with it in prototypes, and why: what its documentation lacked (to write), or what is written
    // and was not followed (to review: say it more plainly, or higher on its page).
    var inv = c.inventions;
    if (inv && inv.count) {
      var needs = Object.keys(inv.needs || {}), WRITE = { example: 'an example of it in use (the engine writes one from the product\'s own code with --intent-changes)', fields: 'what each item of its lists holds, in its code comment', page: 'its page in the intent layer' };
      rows.push(mk('invented', 'What agents got wrong', '<p' + (needs.length ? ' class="pg-missing"' : '') + '>' + inv.count + (inv.count === 1 ? ' mistake' : ' mistakes') + ' in prototypes' + (needs.length ? ', because ' + needs.map(function (n) { return esc(inv.needs[n].why); }).join(', and ') : ', with what they needed written') + ':</p>' +
        '<ul>' + (inv.last || []).map(function (l) { return '<li>' + esc(l.message) + ' <span class="pg-dim">(' + esc(l.page) + ')</span></li>'; }).join('') + '</ul>',
        needs.length ? 'todo' : 'check', needs.length ? 'Write ' + needs.map(function (n) { return WRITE[n] || n; }).join('; and ') + '.' : 'What agents needed is written, and they still got it wrong: say it more plainly, or higher on its page.'));
      rows[rows.length - 1].src = ['The prototypes\' checks'];
    }
    // What an agent cannot learn about it (its props, events, slots and lists no comment and no page explains).
    var cov = c.docCoverage || [];
    if (cov.length) {
      var groups = {}, LABEL = { prop: 'Props', event: 'Events', slot: 'Slots', fields: 'Lists with nothing on what they hold', field: 'Fields the product gives that no comment lists', values: 'Values nothing helps choose between', keyboard: 'What the keyboard does', apart: 'What tells it apart', overflow: 'What it does when its content does not fit', oneAction: 'What it shows with one action only' };
      cov.forEach(function (m) { (groups[m.kind] = groups[m.kind] || []).push(m); });
      rows.push(mk('unsaid', 'What its documentation does not say', '<p class="pg-missing">' + cov.length + (cov.length === 1 ? ' thing an agent cannot learn' : ' things an agent cannot learn') + ' from its documentation:</p><ul>' + Object.keys(groups).map(function (k) { return '<li><strong>' + esc(LABEL[k] || k) + '</strong>: ' + (groups[k].every(function (m) { return m.what === c.name; }) ? esc(groups[k][0].why.charAt(0).toUpperCase() + groups[k][0].why.slice(1)) + '.' : groups[k].map(function (m) { return '<code>' + esc(m.what) + '</code>'; }).join(', ')) + '</li>'; }).join('') + '</ul>', 'todo',
        Object.keys(groups).map(function (k) { var w = groups[k].map(function (m) { return m.what; }).filter(function (x) { return x !== c.name; }); return (LABEL[k] || k) + (w.length ? ' (' + w.join(', ') + ')' : '') + '. ' + groups[k][0].write; }).join(' ')));
      rows[rows.length - 1].src = ['Its code and its intent layer page'];
    }
    // Its "when to use" lines are all its family's: nothing tells an agent when this one and not a sibling (Missing).
    if (c.noOwnUse) { rows.push(mk('ownuse', 'When to use it, not a sibling', '<p class="pg-missing">Every "when to use" line on its page is shared word for word with other components: none tells an agent when this one is right and its siblings are not.</p>', 'todo', 'Write one "when to use" line on its intent layer page that says the need only it meets.')); rows[rows.length - 1].src = ['The "which component?" test']; }
    // Needs its own page names, for which agents picked another component: two pages claiming one use, or a purpose
    // that does not say enough (to review).
    if ((c.confusions || []).length) {
      rows.push(mk('confused', 'Agents picked another component', '<p class="pg-missing">For ' + c.confusions.length + (c.confusions.length === 1 ? ' need' : ' needs') + ' its page names, agents chose another component:</p><ul>' + c.confusions.slice(0, 6).map(function (x) { return '<li>"' + esc(x.text) + '": <code>' + esc(x.chose || 'nothing') + '</code></li>'; }).join('') + '</ul>', 'check',
        'Say in its purpose what sets it apart from ' + [...new Set(c.confusions.map(function (x) { return x.chose; }).filter(Boolean))].slice(0, 3).join(', ') + ', and name the other one in its "when not to use", or take the need off the page that does not own it.'));
      rows[rows.length - 1].src = ['The "which component?" test'];
    }
    // Two rules about it that cannot both be followed, and the same rule written twice in two places
    // (--prototype --rules). Nothing is rewritten for the team: whichever the agent reads last wins, so the pair is a
    // decision for whoever owns the words.
    var WHY = { words: 'one allows what the other rules out', count: 'two counts of it', place: 'two places it may only go' };
    if ((c.ruleClash || []).length) {
      rows.push(mk('clash', 'Rules that cannot both be followed', '<p class="pg-missing">' + c.ruleClash.length + (c.ruleClash.length === 1 ? ' pair of rules about it disagrees' : ' pairs of rules about it disagree') + ', so whichever an agent reads last wins:</p><ul>' +
        c.ruleClash.slice(0, 6).map(function (x) { return '<li>"' + esc(x.said) + '" <span class="pg-dim">(' + esc(x.saidFrom) + ')</span><br>against <span class="pg-dim">' + esc(WHY[x.why] || x.why) + '</span>: "' + esc(x.against) + '" <span class="pg-dim">(' + esc(x.againstFrom) + ')</span></li>'; }).join('') + '</ul>', 'todo',
        'Settle each pair where it is written: keep one sentence, and take the other out or say when each holds.'));
      rows[rows.length - 1].src = ['The rules read against each other'];
    }
    if ((c.ruleTwice || []).length) {
      rows.push(mk('twice', 'A rule written twice', '<p>' + c.ruleTwice.length + (c.ruleTwice.length === 1 ? ' rule about it is' : ' rules about it are') + ' written in two places in different words: two rules to read, one rule to follow.</p><ul>' +
        c.ruleTwice.slice(0, 6).map(function (x) { return '<li>"' + esc(x.kept) + '" <span class="pg-dim">(' + esc(x.keptFrom) + ')</span><br>again: "' + esc(x.repeat) + '" <span class="pg-dim">(' + esc(x.repeatFrom) + ')</span></li>'; }).join('') + '</ul>', 'check',
        'Keep the sentence that says more, and take the other out or point it at the first.'));
      rows[rows.length - 1].src = ['The rules read against each other'];
    }
    if ((a.unknown || []).length) rows.push(mk('unknown', 'Names that do not exist', '<p class="pg-missing">' + a.unknown.map(function (u) { return '<code>' + esc(u) + '</code>'; }).join(', ') + ': named in what is written, but the system has no token, property or component by that name.</p>', 'todo',
      'Rename each to the name the system uses, or take it out: an agent would look for something that is not there.'));
    return rows;
  };
  // Its page in the team's intent layer: the link, and its rules (what it is for, when and when not to use it are merged
  // into the rows below, each under its source). No page: one to write; a page no agent reads: why, on the For agents
  // page.
  var intentRow = function (c) {
    var il = c.intentLayer; if (!il) return null;
    if (il.none) return { key: c.name + '\u0000doc:intent', area: 'Documentation', kind: 'Intent layer', written: '<p class="pg-missing">No page names it.</p>',
      todo: esc('Write its page in the intent layer, titled ' + c.name + ', as ' + ((DATA.intentLayer || {}).namesFrom || 'Figma') + ' names it.'), who: WHO.person, st: 'todo', rel: '', at: DATA.builtAt || null, src: [] };
    var said = ['purpose', 'whenToUse', 'whenNotToUse', 'mistakes', 'limitations', 'rules'].some(function (k) { var v = il[k]; return Array.isArray(v) ? v.length : !!v; });
    var link = il.url ? '<p><a class="sg-uses-link" href="' + esc(il.url) + '" target="_blank" rel="noopener">' + esc(il.file) + '</a></p>' : '<p>' + esc(il.file) + '</p>';
    // Everything read from its page, as the engine holds it, kind by kind; then what was left out and why.
    var IL_READ = [['purpose', 'What it is for'], ['whenToUse', 'When to use'], ['whenNotToUse', 'When not to use'], ['mistakes', 'Common mistakes'], ['limitations', 'Limitations'], ['rules', 'Rules']];
    var listOf = function (v) { return Array.isArray(v) ? v : v ? [v] : []; };
    var n = IL_READ.reduce(function (t, k) { return t + listOf(il[k[0]]).length; }, 0) + listOf(il.sections).length;
    var body = IL_READ.map(function (k) { var l = listOf(il[k[0]]); return l.length ? '<p class="pg-par-val">' + esc(k[1]) + '</p>' + paras(l) : ''; }).join('') +
      listOf(il.sections).map(function (x) { return '<p class="pg-par-val">' + esc(x.title) + ' (another section)</p>' + paras([x.text]); }).join('') +
      (il.status ? '<p class="pg-par-val">Status</p>' + paras([il.status]) : '') +
      (listOf(il.facts).length || il.repeated ? '<p class="pg-par-val">Left out</p>' + paras([].concat(listOf(il.facts).length ? [listOf(il.facts).join(', ') + ': facts the engine reads from Figma and the code'] : [], il.repeated ? [il.repeated + ' lines the same on every page of its kind'] : [])) : '');
    // In the table: its page and how much was read; the row opens everything read, in the side panel (writtenFull).
    var none = said ? '' : '<p class="pg-missing">Its page says nothing an agent reads: the Intent layer page says why, and what to change.</p>';
    return { key: c.name + '\u0000doc:intent', area: 'Documentation', kind: 'Intent layer', written: link + '<p class="pg-par-val">' + n + (n === 1 ? ' line' : ' lines') + ' read from its page. Open the row to see them.</p>' + none,
      writtenFull: link + '<p class="pg-par-val">What was read from its page (' + n + (n === 1 ? ' line' : ' lines') + ')</p>' + body + none,
      todo: said ? '' : esc('Change its page as the Intent layer page says.'), who: said ? '' : WHO.person, st: said ? 'done' : 'check', rel: '', at: DATA.builtAt || null, src: [capital(il.source || 'the intent layer') + ' (' + il.file + ')'] };
  };
  // What the engine could not settle about it (component-parts.mjs): is it a part of another component? Each answer a
  // card to copy into Claude Code, which records it in the intent layer.
  var partQuestionRow = function (c) {
    var q = (DATA.partQuestions || []).filter(function (x) { return x.part === c.name; })[0]; if (!q) return null;
    // The answer in the person's words: the system's command, the component, then what it is.
    var run = function (to) { return ENGINE + ' on Component ' + c.name + ', ' + (to === 'none' ? 'It is its own component' : 'It is a part of Component ' + to); };
    var card = function (k, head, says, copy) { return '<div class="sg-decide sg-decide--' + k + '" title="' + esc(says) + '"><strong class="sg-decide-head">' + decideMark(k) + esc(head) + '</strong>' + sysButton('button', 'Copy decision', ' data-part-copy="' + esc(copy) + '"') + '</div>'; };
    var cards = q.roots.map(function (r) { return card('approve', 'Part of ' + r, 'Shown and documented inside ' + r + ', never on its own.', run(r)); })
      .concat(q.roots.length ? [] : [card('change', 'Part of another', 'Claude Code asks which component it belongs to.', ENGINE + ' on Component ' + c.name + ', Ask me which component it is a part of')])
      .concat([card('drop', 'Its own component', 'It stays a component of the system, placed on its own.', run('none'))]);
    var ask = q.roots.length ? 'Is ' + c.name + ' a part of ' + q.roots.join(' or ') + '?' : 'Is ' + c.name + ' a part of another component?';
    return { key: c.name + '\u0000doc:part?', area: 'Documentation', kind: 'Part or component', written: '<p class="sg-il-line"><strong>' + esc(ask) + '</strong></p><p class="sg-il-line">' + esc(capital(q.why)) + '.</p><div class="sg-decide-grid">' + cards.join('') + '</div>',
      todo: esc('Say whether it is a part, then copy your decision and paste it into Claude Code.'), who: WHO.both, st: 'check', rel: '', at: DATA.builtAt || null, src: ['Figma\'s names', 'The code (what each component holds)'] };
  };
  document.addEventListener('click', function (e) { var cp = e.target.closest && e.target.closest('[data-part-copy]'); if (cp) copyText(cp.getAttribute('data-part-copy'), cp); });
  // A part's documentation: what its root's page says of it under Parts (### its name), or where to write it.
  var partDocRow = function (c) {
    var lines = c.partOf.docs || [], page = c.partOf.page, root = c.partOf.root;
    var where = page ? (page.url ? '<a class="sg-uses-link" href="' + esc(page.url) + '" target="_blank" rel="noopener">' + esc(page.file) + '</a>' : esc(page.file)) : esc(root + '\'s page in the intent layer');
    return { key: c.name + '\u0000doc:part', area: 'Documentation', kind: 'In ' + root + '\'s page', written: lines.length ? '<p class="pg-par-val">Under Parts, in ' + where + '</p>' + paras(lines) : '<p class="pg-missing">' + esc(root) + '\'s page says nothing of it yet.</p>',
      todo: lines.length ? '' : esc('Write it in ' + (page ? page.file : root + '\'s page') + ', under Parts, as ### ' + c.name + ': what it is in ' + root + ' and how it is used there.'), who: lines.length ? '' : WHO.person, st: lines.length ? 'done' : 'todo', part: { name: c.name, root: root, file: page ? page.file : '' }, rel: '', at: DATA.builtAt || null, src: page ? [capital('the intent layer') + ' (' + page.file + ')'] : [] };
  };
  // Its notes no agent is given (Figma's annotations, the code's notes): each with why, what to do, and whether to remove
  // it; who acts is whoever wrote it.
  var leftRow = function (c) {
    var l = c.notesLeft || []; if (!l.length) return null;
    var whoOf = function (n) { return n.who === 'figma' ? WHO.figma : n.who === 'code' ? WHO.code : WHO.person; };
    return { key: c.name + '\u0000doc:left', area: 'Documentation', kind: 'Not given to agents', written: leftHTML(l),
      todo: esc(l.length === 1 ? 'Change it or remove it, as it says.' : 'Change or remove each, as it says.'), who: whoOf(l[0]), st: 'check', rel: '', at: DATA.builtAt || null,
      src: l.map(function (n) { return capital(n.from); }).filter(function (x, i, a) { return a.indexOf(x) === i; }) };
  };
  // Written, but too thin to say anything: under four words, or a line that only names its section ("Overview
  // section."). Such a row is never Ready: it is to check, with why.
  var WEAK = function (html) { var t = plainText(html || '').replace(/\s+/g, ' ').trim(); return !!t && (t.split(' ').filter(function (w) { return /[a-z]{2}/i.test(w); }).length < 4 || /^[\w\s\/'’&-]{1,40}\bsection\.?$/i.test(t)); };
  // Where each kind belongs, for a row still to write: its Source is that place (one, the team's own), never where the
  // engine happened to look. A written row's Source stays where it was read.
  var DOC_HOME = function () { return DATA.intentLayer ? 'Its page in the intent layer' : 'Its description in Figma'; };
  var WRITE_TO = { 'What it is': DOC_HOME, 'When to use': DOC_HOME, 'When not to use': DOC_HOME, 'Common mistakes': DOC_HOME, Limitations: DOC_HOME, Example: DOC_HOME, 'Intent layer': function () { return 'Its page in the intent layer'; },
    'Do and don\'t': DOC_HOME, Role: DOC_HOME, 'Its tokens': function () { return 'Its variables\' descriptions in Figma'; }, Properties: function () { return 'Its shared contract'; } };
  var writeTo = function (r) { return r.st === 'todo' && WRITE_TO[r.kind] ? Object.assign({}, r, { src: [WRITE_TO[r.kind]()], writeTo: true }) : r; };
  function docIssueRows(c) {
    if (c.codeOnly) return [];
    // A part is documented in its root's page, under Parts: that section is all it asks for.
    if (c.partOf && c.partOf.root) return [partDocRow(c)].map(writeTo);
    var asked = partQuestionRow(c);
    if (asked) return [asked].concat(docRowsOf(c, tokenDocRow(c), agentRows(c), intentRow(c), leftRow(c))).map(writeTo);
    var tok = tokenDocRow(c), ag = agentRows(c), ir = intentRow(c), lr = leftRow(c);
    return docRowsOf(c, tok, ag, ir, lr).map(writeTo);
  }
  // What to write, for this component: the points the system already knows that belong under that kind, each from what was
  // read (its controls, its code API, its Figma description, its own guidance), so the person writes from facts, not from
  // a blank page. [] when nothing specific is known: the general advice stands alone.
  function roleOfTag(t) { return ({ button: 'button', a: 'link', nav: 'navigation', ul: 'list', ol: 'list', table: 'table', dialog: 'dialog', select: 'combobox', textarea: 'textbox', form: 'form' })[t] || null; }
  function sentencesOf(text) { return String(text || '').replace(/@\w+/g, '').split(/(?<=[.!?])\s+|\n+/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function docNotes(kind, c) {
    var api = c.api || {}, props = api.props || [], ctl = c.controls || [], out = [];
    var propOf = function (n) { return props.filter(function (p) { return p.name === n; })[0] || null; };
    var g = function (key) { var x = guideOf(c, key); return x ? [].concat(x.text || []) : []; };
    if (kind === 'Limitations') {
      ctl.forEach(function (k) { (k.onlyWith || []).forEach(function (w) { out.push(k.label + ' applies only while ' + w.label + ' is ' + (w.on ? 'on' : 'off') + '.'); }); });
      ctl.forEach(function (k) { var p = propOf(k.prop), fig = (k.options || []).map(function (o) { return String(o.label); }); var extra = p && fig.length ? (p.values || []).filter(function (v) { return fig.indexOf(String(v)) < 0; }) : []; if (extra.length) out.push('The code also accepts ' + k.prop + ' ' + extra.join(', ') + '; Figma does not draw ' + (extra.length > 1 ? 'them' : 'it') + '.'); });
      props.filter(function (p) { return p.required; }).forEach(function (p) { out.push(p.name + ' must always be given.'); });
      if (api.file && !(api.slots || []).length) { var txt = props.filter(function (p) { return /string/.test(p.type || '') && /label|text|title|content|icon/i.test(p.name); }).map(function (p) { return p.name; }); out.push('It takes no content of its own' + (txt.length ? ': only ' + txt.join(' and ') : '') + '.'); }
    } else if (kind === 'Example' && c.import && c.import.line) {
      var tag = (/import\s+(\w+)/.exec(c.import.line) || [])[1], words = ((c.renders || [])[0] || {}).props || {};
      var text = ctl.filter(function (k) { return k.type === 'TEXT' && propOf(k.prop); }).map(function (k) { return k.prop + '="' + (words[k.label] || k.default || k.label) + '"'; });
      if (tag) out.push(c.import.line + '  <' + tag + (text.length ? ' ' + text.join(' ') : '') + ' />');
    } else if (kind === 'Role') {
      var root = c.source && /<template>\s*<([a-zA-Z-]+)/.exec(c.source.text || ''), role = root && roleOfTag(root[1].toLowerCase());
      if (role) out.push('Its root is a <' + root[1] + '>: write "Role: ' + role + '" in its page in the intent layer.');
    } else if (kind === 'Do and don\'t') {
      g('whenNotToUse').concat(g('mistakes')).slice(0, 3).forEach(function (t) { out.push('A don\'t, with the right use beside it: ' + t); });
    } else if (kind === 'When to use' || kind === 'When not to use') {
      var re = kind === 'When to use' ? /^use\b/i : /^(do not|don't|avoid|never)\b/i;
      sentencesOf(c.description).filter(function (t) { return re.test(t); }).slice(0, 3).forEach(function (t) { out.push('From its Figma description: ' + t); });
    }
    return out.slice(0, 5);
  }
  // The points to cover, then how to write them.
  function notesHTML(notes, how) { return (notes.length ? '<strong>Points to cover</strong></p><ul class="sg-doc-notes">' + notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul><p class="pg-par-val">' : '') + esc(how); }
  function docRowsOf(c, tok, ag, ir, lr) {
    return (ir ? [ir] : []).concat(lr ? [lr] : []).concat(KNOW.map(function (k) {
      var has = !!k[1](c), body = has ? k[2](c) : '', parts = has && k[5] ? k[5](c).filter(function (p) { return p.html; }) : null, weak = has && (k[0] === 'Role' ? !!roleClash(c) : k[0] !== 'Do and don\'t' && WEAK(body));   // a role is one word by nature: it is to check only when two sources name two roles
      return { key: c.name + '\u0000doc:' + k[0], area: 'Documentation', kind: k[0], written: has ? body + (weak ? '<p class="pg-missing">Too thin to say anything: write a full sentence.</p>' : '') : '<p class="pg-missing">' + esc(k[4]) + '</p>',
        todo: has && !weak ? '' : notesHTML(docNotes(k[0], c), (weak ? 'What is written is too short to tell an agent anything. ' : '') + (WRITE_HOW[k[0]] || GUIDE_HINT)), notes: has && !weak ? [] : docNotes(k[0], c), how: has && !weak ? '' : (weak ? 'What is written is too short to tell an agent anything. ' : '') + (WRITE_HOW[k[0]] || GUIDE_HINT), who: has && !weak ? '' : !DATA.intentLayer && !weak ? WHO.figma : WHO.person, st: !has ? 'todo' : weak ? 'check' : 'done', rel: weak ? 'Too thin' : '', at: DATA.builtAt || null, src: has ? (parts && parts.length ? parts.map(function (p) { return p.where; }) : [k[3](c)]) : [], srcLinks: parts ? parts.map(function (p) { return p.url; }) : null, writtenParts: parts && parts.length > 1 ? parts : null };
    })).concat(ag).concat(tok ? [tok] : []);
  }
  function docOpen(c) { var n = docIssueRows(c).filter(isOpen).length; return { todo: n > 0, say: n ? n + ' to fix' : '' }; }
  function knowledgeHTML(c) {
    var rows = byStatus(docIssueRows(c));
    if (!rows.length) return '';
    return '<div class="pg-doc pg-par pg-knowledge"><div class="pg-par-sum">' + statusSum(rows) + '</div>' + issueTableHTML(rows, '', '', 'Documentation') + '</div>';
  }
  // Documentation, Accessibility and the rest in the Playground's tables: a section of rows (Usage, Documentation,
  // Accessibility, Anatomy) becomes a card whose head is its title, each row a name and its text. The same on a
  // component's page and on the Documentation page.
  function docCards(root) {
    Array.prototype.forEach.call(root.querySelectorAll('.pg-footer > .pg-doc'), function (d) {
      var h = d.firstElementChild;
      if (!h || h.tagName !== 'H3' || !d.querySelector(':scope > dl.pg-updated')) return;
      var card = document.createElement('div'); card.className = 'pg-inspect pg-doc-card';
      var head = document.createElement('div'); head.className = 'pg-inspect-head'; card.appendChild(head);
      while (d.firstChild) (d.firstChild === h ? head : card).appendChild(d.firstChild);
      d.appendChild(card);
    });
  }
  // What the team has written for every component is on the Status page (#status/documentation), each component's
  // Documentation table with a kind not written yet: no page of its own (an old #documentation or #coverage link opens it).
  if ((DATA.screens || []).length) {
    hr(); navLink('in-use', 'in use');
    var iu = section('in-use', 'In use', 'The system in use', 'Screens built with the system.');
    var sc = document.createElement('div'); sc.className = 'sg-screens'; iu.appendChild(sc);
    DATA.screens.forEach(function (s) { var f = document.createElement('figure'); f.className = 'sg-screen'; f.innerHTML = '<img alt="" src="' + esc(s.src) + '"><figcaption>' + esc(s.caption || '') + '</figcaption>'; sc.appendChild(f); });
  }
  // Templates: each page frame Figma composes of the system's components (DATA.templates), what it is made of in Figma's
  // order, whether its code uses each one, and the frame it comes from. A component with a page of its own is linked.
  if ((DATA.templates || []).length) {
    hr(); navLink('templates', 'templates');
    var tp = section('templates', 'System', 'Templates', '');
    var tl = document.createElement('div'); tl.className = 'sg-templates'; tp.appendChild(tl);
    var TPL_STATE = { used: ['In the code', 'connected'], missing: ['Not in the code', 'deprecated'], exempt: ['Kept out on purpose', ''], 'in-progress': ['In progress', 'beta'], 'not-compared': ['Not compared', ''] };
    DATA.templates.forEach(function (t) {
      var a = document.createElement('article'); a.className = 'sg-template'; a.id = 'template-' + String(t.name).replace(/[^\w-]+/g, '-');
      var parts = t.parts || [], inCode = parts.filter(function (p) { return p.state === 'used'; }).length, compared = parts.filter(function (p) { return p.state === 'used' || p.state === 'missing'; }).length;
      var meta = [];
      if (t.inProgress) meta.push('In progress: its code is not compared yet');
      else if (t.file) meta.push('Built in <code>' + esc(t.file) + '</code>' + (compared ? ', ' + inCode + ' of ' + plural(compared, 'component', 'components') + ' in the code' : ''));
      else if (parts.length) meta.push('No code file found. A developer names it in <code>templates[].file</code> in <code>ds-config.json</code>');
      if (t.figma) meta.push('<a href="' + esc(t.figma) + '" target="_blank" rel="noopener">See in Figma</a>');
      var list = parts.length ? '<ol class="sg-template-parts" aria-label="What ' + esc(t.name) + ' is made of">' + parts.map(function (p) {
        var st = TPL_STATE[p.state] || [p.state, ''];
        var name = HAS_PAGE[p.name] ? '<a href="#' + cid(p.name) + '">' + esc(p.name) + '</a>' : esc(p.name);
        return '<li><span>' + name + '</span><span class="sg-status' + (st[1] ? ' sg-status--' + st[1] : '') + '">' + esc(st[0]) + '</span></li>';
      }).join('') + '</ol>' : '<p class="sg-template-note">Figma places none of the system\'s components in it.</p>';
      var notes = [];
      if (t.order) notes.push('The code places them in another order: ' + t.order.code.map(esc).join(', ') + '.');
      if (parts.some(function (p) { return p.state === 'missing'; })) notes.push('A developer uses each component marked Not in the code, or the team keeps it out on purpose with its reason.');
      if (!t.picture && t.pictureWhy) notes.push('No picture of the frame: ' + esc(t.pictureWhy) + '.');
      a.innerHTML = '<h3>' + esc(t.name) + '</h3>' + (meta.length ? '<p class="sg-template-meta">' + meta.join(' · ') + '</p>' : '') +
        '<div class="sg-template-body' + (t.picture ? '' : ' sg-template-body--parts') + '">' +
          (t.picture ? '<figure class="sg-screen"><img alt="' + esc(t.name) + ' in Figma" src="' + esc(t.picture.src) + '"' + (t.picture.w ? ' width="' + Math.round(t.picture.w) + '" height="' + Math.round(t.picture.h) + '"' : '') + '><figcaption>The frame in Figma</figcaption></figure>' : '') +
          '<div>' + list + notes.map(function (n) { return '<p class="sg-template-note">' + n + '</p>'; }).join('') + '</div>' +
        '</div>';
      tl.appendChild(a);
    });
  }
  // The History last in the System group: first the pages about the system as it is, then what changed in it and why.
  (function () { var a = nav.querySelector('a[href="#history"]'), last = Array.prototype.slice.call(nav.querySelectorAll('a[href="#status"], a[href="#showroom"], a[href="#documentation"], a[href="#in-use"], a[href="#templates"]')).pop(); if (a && last && (a.compareDocumentPosition(last) & Node.DOCUMENT_POSITION_FOLLOWING)) last.insertAdjacentElement('afterend', a); })();

