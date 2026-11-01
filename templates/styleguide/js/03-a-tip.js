  /* ── A tip: the system's own tooltip trigger (DATA.ui.tip, read from its markup); with none (or none read yet), the
     page's default one (.sg-tip), its words in a bubble the trigger describes. ─────────────────────────────────── */
  var TIP = DATA.ui && DATA.ui.tip, TIP_NO = 0;
  // The one tooltip every part of the page uses: the round "i", its words in a bubble. o.label: the words it explains
  // (a WCAG criterion's name), written plain before the "i", as the Status table's states are. o.parts adds titled
  // paragraphs under the words: [[title, text], ...].
  function tipHTML(words, name, o) {
    o = o || {};
    var body = (o.label ? '<b class="sg-tip-title">' + esc(words) + '</b>' : esc(words)) + (o.parts || []).filter(function (x) { return x[1]; }).map(function (x) { return '<span class="sg-tip-part"><b>' + esc(x[0]) + '</b>' + esc(x[1]) + '</span>'; }).join('');
    var tip;
    if (TIP && !o.label && !o.parts) tip = TIP.markup.replace('{tip}', function () { return esc(words); }).replace('{name}', function () { return esc(name); });
    else { var id = 'sg-tip-' + (++TIP_NO); tip = '<span class="sg-tip' + (o.parts ? ' sg-tip--wide' : '') + '"><button type="button" class="sg-tip-btn" aria-label="' + esc(name || ('What ' + (o.label || words) + ' means')) + '" aria-describedby="' + id + '">i</button><span class="sg-tip-bubble" role="tooltip" id="' + id + '">' + body + '</span></span>'; }
    return o.label ? '<span class="sg-mx-why">' + esc(o.label) + tip + '</span>' : tip;
  }
  // A tip inside a table opens over it, under its mark (above it when the window has no room below), never cut by the
  // table's own scroll.
  var placeTip = function (e) {
    var t = e.target.closest && e.target.closest('.sg-mx-why .sg-tip, td .sg-tip'); if (!t) return;
    var b = t.querySelector('.sg-tip-bubble'), r = t.getBoundingClientRect(); if (!b) return;
    b.style.left = Math.max(8, Math.min(r.left, window.innerWidth - b.offsetWidth - 8)) + 'px';
    b.style.top = (r.bottom + 4 + b.offsetHeight > window.innerHeight ? r.top - 4 - b.offsetHeight : r.bottom + 4) + 'px';
  };
  document.addEventListener('mouseover', placeTip, true); document.addEventListener('focusin', placeTip, true);
  // Escape closes the default tip under the pointer or the focus; it shows again once both leave it.
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') Array.prototype.forEach.call(document.querySelectorAll('.sg-tip:hover, .sg-tip:focus-within'), function (t) { t.classList.add('is-dismissed'); }); });
  document.addEventListener('mouseout', function (e) { var t = e.target.closest && e.target.closest('.sg-tip'); if (t && !t.contains(e.relatedTarget) && !t.contains(document.activeElement)) t.classList.remove('is-dismissed'); });
  document.addEventListener('focusout', function (e) { var t = e.target.closest && e.target.closest('.sg-tip'); if (t && !t.contains(e.relatedTarget) && !t.matches(':hover')) t.classList.remove('is-dismissed'); });
  // The system's own icon for a warning (its name says so), else none: the count is still said.
  // A switch that needs attention (an area with something to do) carries the page's own small warning mark, never one
  // of the system's icons: the page's sign, the same on every system.
  var ALERT_ICON = 'warn';
  // The page's own marks for a link to Figma and to the code, the same on every system.
  // Play's mark: a triangle pointing forward.
  var PLAY_SVG = '<svg class="sg-link-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5v9l7.5-4.5z"/></svg>';
  // Full screen's mark: four corners pointing out.
  var FULL_SVG = '<svg class="sg-link-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>';
  var FIGMA_SVG = '<svg class="sg-link-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1H5.67a2.33 2.33 0 0 0 0 4.67H8ZM8 1h2.33a2.33 2.33 0 0 1 0 4.67H8ZM8 5.67H5.67a2.33 2.33 0 0 0 0 4.66H8ZM8 10.33H5.67a2.33 2.33 0 1 0 2.33 2.34Z"/><circle cx="10.33" cy="8" r="2.33"/></svg>';   // Figma's mark in lines, as every mark of the page
  // A link that leaves the guide for another site (the intent layer where it lives, a team's page): a box and an arrow out.
  var EXTERNAL_SVG = '<svg class="sg-link-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2H14v4.5M14 2 7.5 8.5M12 9.5V13a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3.5"/></svg>';
  var DOWNLOAD_SVG = '<svg class="sg-link-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.5v7.5m0 0L5 7m3 3 3-3M2.5 13h11"/></svg>';
  var CODE_SVG = '<svg class="sg-link-mark" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 4 1.5 8l4 4m5-8 4 4-4 4M9.5 2.5l-3 11"/></svg>';
  var WARN_SVG = '<svg class="sg-seg-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.25"/><path d="M8 4.75V8.5M8 11.25h.01"/></svg>';
  // name: what the switch chooses. The group says it (WCAG 1.3.1, 4.1.2): the page's own row is a named group, and the
  // system's control carries the name itself, so the role its script gives it (a radio group) has its name.
  // A number beside a name (how many a filter holds), in its own small badge so it never reads as part of the name.
  function countHTML(n) { return '<span class="sg-count"><span class="sg-hidden-text"> (</span>' + esc(String(n)) + '<span class="sg-hidden-text">)</span></span>'; }
  function segHTML(items, name) {
    var tag = SEG ? SEG.item.tag : 'button', cls = SEG ? SEG.item.classes.join(' ') : '', group = 'sg-r' + (++RADIO_NO);
    var open = SEG ? SEG.open : '<div class="sg-seg sg-seg-default" role="group">';
    if (name && !/\saria-label(ledby)?=/.test(open.slice(0, open.indexOf('>')))) open = open.replace(/^<([\w-]+)/, '<$1 aria-label="' + esc(name) + '"');
    return open + items.map(function (o) {
      var text = SEG && SEG.item.label ? '<span class="' + esc(SEG.item.label) + '">' + esc(o.label) + '</span>' : esc(o.label);
      // A mark beside the words (the system's alert icon on Parity while something differs), with what it means said.
      if (o.icon) text = WARN_SVG + text;
      if (o.count != null) text += countHTML(o.count);   // its number in a small badge, apart from its name
      if (o.say) text += '<span class="sg-hidden-text">, ' + esc(o.say) + '</span>';
      // A radio: its input carries the choice and the label around it is what a click lands on.
      if (RADIO) text = '<input type="radio" name="' + group + '"' + (RADIO.length ? ' class="' + esc(RADIO.join(' ')) + '"' : '') + (o.off ? ' disabled' : '') + '>' + text;
      return '<' + tag + (tag === 'button' ? ' type="button"' : '') + (cls ? ' class="' + esc(cls) + '"' : '') + ' data-v="' + esc(o.v) + '"' + (o.off ? (RADIO ? '' : ' disabled') + ' aria-disabled="true" title="' + esc(o.title || '') + '"' : '') + '>' + text + '</' + tag + '>';
    }).join('') + (SEG ? SEG.close : '</div>');
  }
  // The page's own switch says its choice the way its role does: a radio is checked, a tab or an option selected, a plain
  // button pressed. A radio that also says pressed breaks WCAG 4.1.2, so when the system's script makes the options
  // radios after the page drew them, the pressed state is taken off (never on a component the page shows).
  var CHOICE_ROLE = /^(radio|menuitemradio|tab|option)$/;
  function sayChoice(el, on) {
    var role = el.getAttribute('role') || '';
    if (!CHOICE_ROLE.test(role)) { el.setAttribute('aria-pressed', on ? 'true' : 'false'); return; }
    el.removeAttribute('aria-pressed');
    el.setAttribute(/^(tab|option)$/.test(role) ? 'aria-selected' : 'aria-checked', on ? 'true' : 'false');
  }
  if (typeof MutationObserver !== 'undefined') new MutationObserver(function (ms) {
    ms.forEach(function (m) { var el = m.target; if (el.hasAttribute('aria-pressed') && el.hasAttribute('data-v') && CHOICE_ROLE.test(el.getAttribute('role') || '') && !el.closest('.pg-preview, .pg-frame')) sayChoice(el, el.getAttribute('aria-pressed') === 'true'); });
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['role'] });
  function segSelect(el, on) {
    if (SEG) {
      (SEG.selected.add || []).forEach(function (k) { el.classList.toggle(k, on); });
      (SEG.selected.remove || []).forEach(function (k) { el.classList.toggle(k, !on); });   // a stand-in button's quiet look, off when selected
      Object.keys(SEG.selected.attrs || {}).forEach(function (a) { if (on) el.setAttribute(a, SEG.selected.attrs[a]); else el.removeAttribute(a); });
    } else el.classList.toggle('selected', on);
    if (RADIO) { var r = el.querySelector('input'); if (r) r.checked = on; el.dataset.on = on ? '1' : ''; }
    else sayChoice(el, on);
    if (on) nudge();   // the system's own script places what follows the selection (a sliding pill) again
  }
