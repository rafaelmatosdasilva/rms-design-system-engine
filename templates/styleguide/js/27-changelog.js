  // ── Changelog: when Figma was last read for it, then every commit that changed it, by the release it shipped in ───
  // Its changelog in the Playground's tables: when Figma was last read, then one table per release, each commit a row
  // (its commit and pull request, what it says, its date).
  // Its Do and Don't: each example from Figma (or its references) with what it shows, the do's beside the don'ts.
  function examplesGrid(c) {
    var ex = c.examples || [];
    if (!ex.length) return '';
    return '<div class="pg-examples">' + ex.map(function (e) {
      return '<div class="pg-example"><div class="pg-ctl-label">' + (e.kind === 'do' ? 'Do' : 'Don\'t') + '</div><div class="pg-example-stage"><img loading="lazy" alt="' + esc((e.kind === 'do' ? 'Do: ' : 'Don\'t: ') + (e.caption || c.name)) + '" src="' + esc(e.src) + '" width="' + Math.round(e.w) + '" height="' + Math.round(e.h) + '"></div>' + (e.caption ? '<p class="pg-example-caption">' + esc(e.caption) + '</p>' : '') + '</div>';
    }).join('') + '</div>';
  }
  // A component's History is the History page's own table, filtered to the changes that affect it (historyTable,
  // 07-second-in-the-list.js), drawn once its page is (33). Under it, what that page does not list: when Figma was last
  // read for it, the changes made to it in Figma through the engine (each opening its before and after on the Changes in
  // Figma page) and code not committed yet. Labelled values, never a table of their own.
  function changelogHTML(c) {
    var u = c.updated || {};
    var FST = { waiting: 'Waiting to be made', made: 'Made as said', 'not as said': 'Not as said', 'taken back': 'Taken back' };
    var fc = (DATA.figmaChanges || []).filter(function (x) { return x.component === c.name; }).map(function (x) {
      return [{ html: '<a class="sg-uses-link" href="#changes-in-Figma?panel=' + esc(encodeURIComponent('doc:fc:' + x.component + ':' + x.at)) + '">' + esc(FST[x.status]) + '</a>' }, esc(x.asked || x.steps[0] || '') + ' <span class="pg-log-date">' + esc(String(x.at || '').slice(0, 10)) + '</span>' + (x.signedOff ? '<span class="pg-par-val">' + esc('Signed off by ' + (x.signedOff.reviewerSaid || x.signedOff.by) + (x.authorSaid ? ', made by ' + x.authorSaid : '')) + '</span>' : '')];
    });
    var now = [['Figma last read', u.figmaRead ? esc(when(u.figmaRead)) : ''], ['Its code', u.uncommitted ? 'Has changes not committed yet' : '']];
    return (fc.length ? panelCard('Changes in Figma', kvOne(fc)) : '') + (u.figmaRead || u.uncommitted ? panelCard('Now', kvOne(now)) : '');
  }
  // Its History area, once its page is drawn: the History page's table above what changelogHTML put there, or a line
  // that nothing is known to have changed it.
  function fillHistoryArea(sec, c) {
    var box = sec.querySelector('.pg-area[data-area="log"] .pg-doc'); if (!box) return;
    if (!historyTable(box, c.name, box.firstChild)) box.insertAdjacentHTML('afterbegin', areaInfo('No change to it is known yet. No commit, read of Figma, change of the intent layer or decision names it.'));
  }
  // Each card's preview, drawn once its area is on screen (a hidden card has no size to fit), never with ?all.
  function builtThumbs(sec) {
    if (ALL) return;
    Array.prototype.forEach.call(sec.querySelectorAll('[data-thumb]'), function (at) {
      if (at.firstChild) { fitThumb(at); return; }
      var o = COMPONENTS.find(function (k) { return k.name === at.getAttribute('data-thumb'); }); if (!o) return;
      try { var e = baseElement(o); e.classList.add('sg-thumb-live'); e.setAttribute('inert', ''); at.appendChild(e); fitThumb(at); } catch (x) {}
    });
  }
  // A text copied, the button says so for a moment and a screen reader hears it.
  // The address of a view, the area of a component after a / (#c-chip/accessibility), and after a ? the props of the
  // variant it shows (#c-chip?Size=L&Label=Save): each area has its own link to send someone to.
  var AREA_SLUG = { play: 'playground', variants: 'variants', rules: 'rules', docs: 'documentation', api: 'code', motion: 'motion', a11y: 'accessibility', parity: 'parity', built: 'built-with', parts: 'parts', used: 'used-in', log: 'history' };
  // What a page shows is in its address, so a link opens it as it is: each filter chosen (show, st, the Tokens page's
  // coll, group, kind and q, a Showroom screen's kind) and the side panel open (panel=doc:<file> | row:<area>:<row>).
  // Written in place (no new history entry); a filter at its All and a panel closed leave nothing.
  function setHashQuery(o) {
    if (ALL) return;
    var h = location.hash.slice(1), i = h.indexOf('?'), path = i < 0 ? h : h.slice(0, i), q = new URLSearchParams(i < 0 ? '' : h.slice(i + 1));
    Object.keys(o).forEach(function (k) { if (o[k] == null || o[k] === '' || o[k] === 'all') q.delete(k); else q.set(k, o[k]); });
    var str = q.toString().replace(/%2F/g, '/').replace(/%3A/g, ':'), nh = '#' + path + (str ? '?' + str : '');
    if (nh !== location.hash) history.replaceState(null, '', location.search + nh);
  }
  // Something the address names that is drawn a moment later (a table's rows, an area's chips): tried again until it is.
  function whenThere(find, act, n) { var x = find(); if (x) act(x); else if ((n || 0) < 40) setTimeout(function () { whenThere(find, act, (n || 0) + 1); }, 100); }
  function hashParts() {
    var h = location.hash.slice(1), i = h.indexOf('?'), path = decodeURIComponent(i < 0 ? h : h.slice(0, i)), j = path.indexOf('/');
    var slug = j < 0 ? '' : path.slice(j + 1), area = slug === 'changelog' ? 'log' : Object.keys(AREA_SLUG).find(function (k) { return AREA_SLUG[k] === slug; }) || null;   // a component's History was once its Changelog
    var id = j < 0 ? path : path.slice(0, j);
    // Documentation was once Coverage, then the Intent layer page: their links open it; with no page of its own (no
    // intent layer), the Status page's Documentation.
    if (id === 'documentation' || id === 'coverage' || id === 'intent-layer' || id === 'for-agents') { if (!document.getElementById('documentation')) return { id: 'status', area: null, slug: 'documentation', q: null }; id = 'documentation'; }
    if (id === 'overview') return { id: 'index', area: null, slug: '', q: null };   // the index was once Overview
    if (id === 'brand-kit') id = 'identity';   // Identity was once the brand kit
    if (id === 'construction') id = 'rules';   // Rules was once Construction
    if (id === 'todo' || id === 'tasks' || id === 'health') return { id: 'status', area: null, slug: slug, q: i < 0 ? null : new URLSearchParams(h.slice(i + 1)) };   // the page was once To do, then Tasks and Health
    return { id: id === 'whats-new' || id === 'changelog' ? 'history' : id, area: area, slug: slug, q: i < 0 ? null : new URLSearchParams(h.slice(i + 1)) };
  }
  function copyText(text, btn, said, saidText) {
    // Its words only. A button of this page can carry a mark of its own (a tick before them, an arrow after), and
    // writing over the whole of its label drops that mark for good: what changes here is the one text node the words
    // are in, inside the label part when the system's button has one, else the button itself.
    var holder = function (e) {
      for (var i = 0; i < e.children.length; i++) { var h = holder(e.children[i]); if (h) return h; }
      for (var j = 0; j < e.childNodes.length; j++) if (e.childNodes[j].nodeType === 3 && e.childNodes[j].nodeValue.trim()) return e;
      return null;
    };
    var leaf = holder(btn) || btn;
    var words = (function () {
      for (var i = leaf.childNodes.length - 1; i >= 0; i--) { var k = leaf.childNodes[i]; if (k.nodeType === 3 && k.nodeValue.trim()) return k; }
      return leaf.appendChild(document.createTextNode(''));
    })();
    var label = function (t) { words.nodeValue = t; }, was = words.nodeValue;
    var done = function () { label('Copied'); if (said) said.textContent = saidText || 'Copied'; setTimeout(function () { label(was); if (said) said.textContent = ''; }, saidText ? 3000 : 1500); };
    // Where the browser lets no page write to the clipboard, the text beside the button is selected instead, and the
    // button says which keys copy it: the person is never left with a Copy that did nothing.
    var keys = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? 'Press \u2318C' : 'Press Ctrl+C';
    var refused = function () {
      var code = btn.parentNode && btn.parentNode.querySelector('code, pre');
      if (code && window.getSelection) { var r = document.createRange(); r.selectNodeContents(code); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      label(keys); if (said) said.textContent = code ? 'Selected: ' + keys : keys;
      setTimeout(function () { label(was); if (said) said.textContent = ''; }, 4000);
    };
    var fallback = function () { var ta = document.createElement('textarea'), ok = false; ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (x) {} ta.remove(); if (ok) done(); else refused(); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
  }
  // A file handed to the person, every download of the page through here. Shown inside another page (a shared viewer, a
  // sandboxed frame), a download may do nothing and say nothing: a note says so, with the page's own address to open it
  // alone, and, for a text file, the text to copy instead.
  function framedPage() { try { return window.self !== window.top; } catch (e) { return true; } }
  function saveFile(name, type, content) {
    var url = URL.createObjectURL(new Blob([].concat(content), { type: type })), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    if (framedPage()) saveNote(name, typeof content === 'string' ? content : null);
  }
  function saveNote(name, text) {
    var had = document.querySelector('.sg-save-note'); if (had) had.remove();
    var n = document.createElement('div'); n.className = 'sg-info sg-save-note'; n.setAttribute('role', 'status');
    n.innerHTML = '<p class="sg-save-line"><b>' + esc(name) + '</b>: this page is shown inside another one, which may not hand files over. If nothing was saved, open the page on its own and download it there' + (text ? ', or copy it' : '') + '.</p><p class="sg-save-line sg-save-acts">'
      + sysButton('a', 'Open the page on its own', ' href="' + esc(location.href) + '" target="_blank" rel="noopener"') + (text ? sysButton('button', 'Copy it', ' data-save-copy') : '') + sysButton('button', 'Close', ' data-save-close') + '</p>';
    document.body.appendChild(n);
    n.addEventListener('click', function (e) { if (e.target.closest('[data-save-close]')) n.remove(); var b = e.target.closest('[data-save-copy]'); if (b) copyText(text, b); });
  }
  // A component's own file, saved as it is in the code.
  function download(name) {
    var o = COMPONENTS.find(function (k) { return k.name === name; }); if (!o || !o.source) return;
    saveFile(o.source.file.split('/').pop(), 'text/plain', o.source.text);
  }
  // The areas of a component's page, and the one last opened (kept from one component to the next).
  // The widths the playground shows a component at: as it fits (live), or in a frame of a phone's, tablet's or desktop's
  // width, where the system's own media queries apply. The one chosen stays for the next component.
  // The widths Figma sets for each breakpoint mode (a viewport width variable), else the common phone, tablet and desktop.
  var WIDTHS = [['fit', 'Fit']].concat((DATA.widths || []).length ? DATA.widths.map(function (w) { return [w.value, w.label, w.px]; }) : [['phone', 'Phone', 375], ['tablet', 'Tablet', 768], ['desktop', 'Desktop', 1280]]), WIDTH = 'fit';
  var AREAS = [['play', 'Playground'], ['variants', 'Variants'], ['parity', 'Parity'], ['rules', 'Rules'], ['a11y', 'Accessibility'], ['docs', 'Documentation'], ['motion', 'Motion'], ['api', 'Code'], ['built', 'Built with'], ['parts', 'Parts'], ['used', 'Used in'], ['products', 'Products'], ['log', 'History']], AREA = 'play';
  // The props whose options are its variants (two or more built), in Figma's order.
  function variantProps(c) { return (c.controls || []).filter(function (p) { return p.type === 'VARIANT' && (p.options || []).filter(function (o) { return !o.unbuilt; }).length > 1; }); }
  // What the Variants area shows: each variant prop's options, and each on/off prop the code builds as off and on.
  function variantRows(c) {
    return (c.controls || []).filter(function (p) { return p.type === 'BOOLEAN' ? !!(p.on || p.off || p.part) : variantProps(c).indexOf(p) >= 0; })
      .map(function (p) { return p.type === 'BOOLEAN' ? { label: p.label, options: [{ label: 'false', value: false }, { label: 'true', value: true }] } : p; });
  }
