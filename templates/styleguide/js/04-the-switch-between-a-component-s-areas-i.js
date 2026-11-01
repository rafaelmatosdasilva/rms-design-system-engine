  /* ── The switch between a component's areas is the system's own tabs (DATA.ui.tabs, read from its markup). With none,
     the page's own: a row of words with a line under the chosen one, in the system's colours, text styles and spacing,
     without a note, a base the page always has. ─────────────────────────────────────────────────────────────── */
  var TABS = DATA.ui && DATA.ui.tabs;
  function tabsHTML(items) {
    var tag = TABS ? TABS.item.tag : 'button', cls = TABS ? TABS.item.classes.join(' ') : 'sg-tab';
    // The page's own tabs are a tab list: one Tab stop (the chosen tab), the arrow keys move between them.
    return (TABS ? TABS.open : '<div class="sg-tabs" role="tablist">') + items.map(function (o) {
      var text = TABS && TABS.item.label ? '<span class="' + esc(TABS.item.label) + '">' + esc(o.label) + '</span>' : esc(o.label);
      if (o.icon) text = WARN_SVG + text;
      if (o.say) text += '<span class="sg-hidden-text">, ' + esc(o.say) + '</span>';
      if (o.count != null) text += countHTML(o.count);   // its number in the segments' badge
      if (o.state) text += stateMark(o.state);   // its area's state, the Status row's dot
      return '<' + tag + (tag === 'button' ? ' type="button"' : '') + (TABS ? '' : ' role="tab"') + (cls ? ' class="' + esc(cls) + '"' : '') + ' data-v="' + esc(o.v) + '">' + text + '</' + tag + '>';
    }).join('') + (TABS ? TABS.close : '</div>');
  }
  function tabSelect(el, on) {
    if (TABS) {
      (TABS.selected.add || []).forEach(function (k) { el.classList.toggle(k, on); });
      (TABS.selected.remove || []).forEach(function (k) { el.classList.toggle(k, !on); });
      Object.keys(TABS.selected.attrs || {}).forEach(function (a) { if (on) el.setAttribute(a, TABS.selected.attrs[a]); else el.removeAttribute(a); });
    } else el.classList.toggle('is-on', on);
    sayChoice(el, on);
    if (el.getAttribute('role') === 'tab') el.tabIndex = on ? 0 : -1;
    if (on) nudge();
  }
  // In a tab list, the arrow keys (and Home and End) move to the next tab and choose it, as a tab list does.
  document.addEventListener('keydown', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[role="tab"]'), list = t && t.closest('[role="tablist"]');
    if (!list || !/^(ArrowRight|ArrowLeft|ArrowDown|ArrowUp|Home|End)$/.test(e.key)) return;
    var tabs = Array.prototype.filter.call(list.querySelectorAll('[role="tab"]'), function (k) { return !k.disabled && k.getClientRects().length; }), i = tabs.indexOf(t);
    var j = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : /Right|Down/.test(e.key) ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
    e.preventDefault(); tabs[j].focus(); tabs[j].click();
  });
  function segItems(box) { return Array.prototype.slice.call(box.querySelectorAll('[data-v]')); }

  // The page's address carries the brand it shows the system in (?brand=retail, before the page's own #anchor), so a link
  // opens the guide as it was shared; changing it writes it back, without a new entry in the history. The mode is never
  // kept there: the page opens in this device's mode on every load (a link's ?mode=dark opens it once, then is dropped).
  var URLQ = (function () { try { return new URLSearchParams(location.search); } catch (e) { return { get: function () { return null; } }; } })();
  function setQuery(k, v) { try { var u = new URL(location.href); if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* a page opened as a file in a browser that refuses it */ } }
  var SGModes = (function () {
    // The mode the page starts in: the one the code's own media query draws on this device or window, else the first.
    function base(axis) { return axis.media && window.matchMedia && window.matchMedia(axis.media).matches ? axis.mediaValue : (axis.restValue != null ? axis.restValue : axis.values[0].value); }
    // A colour switch with a dark mode starts on Auto, following this device's setting, even when the code has no media
    // query of its own (a data-theme the product sets): then the page sets the mode the device asks for, and follows it
    // when it changes, until a mode is picked by hand.
    var PREFERS = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null, AUTO = {};
    function darkOf(axis) { return axis.colour && !axis.media && !axis.classes && axis.attr ? axis.values.filter(function (v) { return v.value && /dark|night/i.test(v.label + ' ' + v.value); })[0] || null : null; }
    function deviceValue(axis) {
      var d = darkOf(axis); if (d && PREFERS && PREFERS.matches) return d.value;
      return axis.restValue != null ? axis.restValue : (axis.values.filter(function (v) { return v !== d; })[0] || axis.values[0]).value;
    }
    function follow() { var moved = false; AXES.forEach(function (a) { if (AUTO[a.attr] && darkOf(a)) { var v = deviceValue(a); if ((html.getAttribute(a.attr) || '') !== v) { apply(html, a, v); moved = true; } } }); return moved; }
    // A mode the address asks for (?mode=dark): the page starts in it, not following the device.
    var asked = String(URLQ.get('mode') || '').toLowerCase(), fixed = {};
    if (asked) setQuery('mode', '');   // honoured once: a reload goes back to the device's mode
    AXES.forEach(function (a) { if (!a.colour || !asked || asked === 'auto') return; var v = a.values.filter(function (x) { return String(x.label).toLowerCase() === asked || String(x.value).toLowerCase() === asked; })[0]; if (!v) return; fixed[a.attr] = true; if (v.value) html.setAttribute(a.attr, v.value); else html.removeAttribute(a.attr); html.style.colorScheme = schemeOf(a, v.value); });
    AXES.forEach(function (a) { if (darkOf(a) && !html.hasAttribute(a.attr) && !fixed[a.attr]) AUTO[a.attr] = true; });
    function apply(scope, axis, value) {
      if (axis.classes) { axis.values.forEach(function (v) { if (v.value) scope.classList.remove(v.value); }); if (value) scope.classList.add(value); }
      else if (!value) scope.removeAttribute(axis.attr); else scope.setAttribute(axis.attr, value);
      // The browser's own colours (a field, a scrollbar, the template's defaults) follow the mode chosen, not the device.
      if (axis.colour) {
        scope.style.colorScheme = schemeOf(axis, value);
        if (scope === html) {
          var was = html.getAttribute('data-sg-scheme'), now = schemeOf(axis, value) || (PREFERS && PREFERS.matches ? 'dark' : 'light');
          html.setAttribute('data-sg-scheme', now);
          // Chrome keeps a visited link's colour from before the switch (pale links in the menu): the page styled again
          // at once, within the frame, so every colour is the new scheme's. The scroll stays where it was.
          if (was && was !== now) { var y = window.scrollY; html.style.display = 'none'; void html.offsetHeight; html.style.display = ''; window.scrollTo(0, y); }
        }
      }
    }
    function schemeOf(axis, value) { var d = axis.values.filter(function (v) { return v.value && /dark|night/i.test(v.label + ' ' + v.value); })[0]; return d ? (value === d.value ? 'dark' : 'light') : ''; }
    function effective(axis, scope) {
      if (axis.classes) { var on = axis.values.find(function (v) { return v.value && html.classList.contains(v.value); }); return on ? on.value : base(axis); }
      var a = scope.closest('[' + axis.attr + ']');
      return (a && a.getAttribute(axis.attr)) || base(axis);
    }
    function control(axis, scope, onChange) {
      var wrap = document.createElement('div'); wrap.className = 'sg-mode-ctl';
      // Two choices, no Auto: the page starts in the mode this device asks for (and follows it until a mode is picked by
      // hand), its switch showing that mode. Each component's switch shows the mode it is in.
      var items = axis.values.map(function (v) { return { v: v.value, label: v.label, off: !!v.notInCode, title: v.notInCode ? v.label + ' is in Figma, not in the code yet' : '' }; });
      // The page's own switch in the menu has no word over it (the switch is still named for a screen reader).
      wrap.innerHTML = (scope === html ? '' : '<span class="sg-mode-label">' + esc(axis.label) + '</span>') + segHTML(items, axis.label);
      // On the page's own switch, what the chosen mode changes in the code (axis.changes, from the theme's own values).
      var diff = null;
      if (scope === html && axis.changes) { diff = document.createElement('p'); diff.className = 'sg-mode-diff'; diff.setAttribute('aria-live', 'polite'); wrap.appendChild(diff); }
      wrap._sync = function () {
        var c = effective(axis, scope), on = c;
        segItems(wrap).forEach(function (b) {
          segSelect(b, b.dataset.v === on);
        });
        nudge();
        if (!diff) return;
        var list = axis.changes[c] || [], on = axis.values.find(function (v) { return v.value === c; });
        diff.textContent = list.length ? (on ? on.label : c) + ' changes ' + list.map(function (x) { return x.name + ' ' + x.from + ' → ' + x.to; }).join(' · ') : '';
        diff.hidden = !list.length;
      };
      wrap._sync();
      segItems(wrap).forEach(function (b) { b.addEventListener('click', function () { if (b.disabled || b.getAttribute('aria-disabled') === 'true') return; if (/true/.test(b.getAttribute('aria-pressed') || b.getAttribute('aria-checked') || b.getAttribute('aria-selected') || '') || b.dataset.on === '1') return;   // the choice already set changes nothing
      if (b.dataset.v === '__auto') { if (darkOf(axis)) { AUTO[axis.attr] = true; follow(); } else { scope.removeAttribute(axis.attr); scope.style.colorScheme = ''; } }
      else { if (scope === html) AUTO[axis.attr] = false; apply(scope, axis, b.dataset.v); }
      wrap._sync(); if (onChange) onChange(axis); }); });
      return wrap;
    }
    function controls(scope, onChange, which) {
      var box = document.createElement('div'); box.className = 'sg-modes'; var ctls = [];
      AXES.forEach(function (a) { if (which(a)) { var w = control(a, scope, onChange); ctls.push(w); box.appendChild(w); } });
      box._sync = function () { ctls.forEach(function (w) { w._sync(); }); };
      return box;
    }
    var boxes = [];
    follow();   // the page starts in the mode this device asks for
    return { controls: controls, effective: effective, follow: follow, prefers: PREFERS, register: function (b) { boxes.push(b); }, syncAll: function () { boxes.forEach(function (b) { b._sync(); }); } };
  })();

  // The stage behind each preview is the system's own page surface, so a dark mode reads as dark.
  var FLAT = []; (TOKENS.colors || []).forEach(function (g) { FLAT = FLAT.concat(g.items); });

