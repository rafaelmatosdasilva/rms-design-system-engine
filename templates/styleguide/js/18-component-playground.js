  /* ── Component playground ─────────────────────────────────────────────────────────────────────────────────
     Each component is drawn from the project's own markup (the contract's probe, or the first instance in its own
     pages), else the element its Figma role asks for. Its controls are the props Figma and the code agree on; an
     option applies what the contract's propertyMap says it adds (a class, an attribute), a boolean shows or hides
     the part it names. Below: the tokens behind what is drawn, with its code. */
  // The class a preview draws a component with: its own, or, for one the system defines by id (#tt, kept once in
  // the page for the system's scripts), a class standing for that id whose rules are the id's (idAliasRules).
  function clsName(c) { return /^#/.test(c.cls || '') ? 'sg-id-' + c.cls.slice(1) : c.cls; }
  // A class (or several, space-separated) as a selector, each escaped: a name with a bracket, a space or a date in it
  // (Card (2026)) is never an invalid selector that stops what queries it.
  function clsSel(cls) { return String(cls || '').trim().split(/\s+/).filter(Boolean).map(function (k) { return '.' + (window.CSS && CSS.escape ? CSS.escape(k) : k.replace(/[^\w-]/g, '\\$&')); }).join(''); }
  // The ids an instance keeps (the label its group is named by) made unique each time it is drawn, with what points to
  // them inside it, so two copies on the page never share one.
  var ID_N = 0, ID_REFS = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-errormessage', 'aria-activedescendant', 'aria-details', 'aria-flowto', 'for', 'headers', 'list'];
  function uniqueIds(root) {
    var map = {}, n = ++ID_N;
    [root].concat(Array.prototype.slice.call(root.querySelectorAll('[id]'))).forEach(function (el) { if (el.id) { map[el.id] = el.id + '-sg' + n; el.id = map[el.id]; } });
    if (!Object.keys(map).length) return;
    [root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))).forEach(function (el) {
      ID_REFS.forEach(function (a) { var v = el.getAttribute(a); if (v) el.setAttribute(a, v.split(/\s+/).map(function (x) { return map[x] || x; }).join(' ')); });
    });
  }
  // A component its own build rendered in each variant (a Vue component): the rendering made with the props set now,
  // else the one nearest them (the default first); what it was not rendered with is set on it as on any other.
  // Each prop is independent: the drawing starts from its build's default case, and each prop set away from it adds
  // what its own case changes on the component's root (size l: class l for s; selected: class selected; disabled: the
  // attribute), so any props set together show together. A prop whose case changes more than the root (a label shown
  // or not) is drawn from its own case, the others' root changes added to it.
  function rootOf(markup) { var t = document.createElement('template'); t.innerHTML = String(markup || '').trim(); return t.content.firstElementChild; }
  function rootChange(a, b) {
    var d = { add: [], remove: [], attrs: {}, drop: [] };
    Array.prototype.forEach.call(b.classList, function (k) { if (!a.classList.contains(k)) d.add.push(k); });
    Array.prototype.forEach.call(a.classList, function (k) { if (!b.classList.contains(k)) d.remove.push(k); });
    Array.prototype.forEach.call(b.attributes, function (x) { if (x.name !== 'class' && a.getAttribute(x.name) !== x.value) d.attrs[x.name] = x.value; });
    Array.prototype.forEach.call(a.attributes, function (x) { if (x.name !== 'class' && !b.hasAttribute(x.name)) d.drop.push(x.name); });
    return d;
  }
  function sameInside(a, b) { return a.innerHTML === b.innerHTML; }
  function renderFor(c, state) {
    if (!c.renders || !c.renders.length || !state) return null;
    var base = c.renders[0], baseRoot = rootOf(base.markup);
    if (!baseRoot) return base.markup;
    var at = function (r, k) { return k.label in r.props ? String(r.props[k.label]) : String(k.type === 'BOOLEAN' ? !!k.default : (k.default == null ? '' : k.default)); };
    // The case its build drew for one prop set to this value, everything else as in the default case.
    var caseFor = function (k) {
      return c.renders.filter(function (r) {
        if (at(r, k) !== String(state[k.label])) return false;
        return Object.keys(base.props).concat(Object.keys(r.props)).every(function (x) { return x === k.label || squashKey(x) === squashKey(k.label) || String(r.props[x]) === String(base.props[x]); });
      })[0] || null;
    };
    var away = (c.controls || []).filter(function (k) { return at(base, k) !== String(state[k.label]); });
    // The case its build drew with the most of the chosen values together (alignment centred with full width on), and
    // nothing else changed: drawn as it is, the props it does not cover added one by one as below.
    var best = null, covered = [];
    c.renders.forEach(function (r) {
      if (!(c.controls || []).every(function (k) { var v = at(r, k); return v === String(state[k.label]) || v === at(base, k); })) return;
      var n = away.filter(function (k) { return at(r, k) === String(state[k.label]); });
      if (n.length > covered.length) { best = r; covered = n; }
    });
    if (best && covered.length === away.length) return best.markup;
    var from = best && covered.length > 1 ? rootOf(best.markup) : null;
    if (from) away = away.filter(function (k) { return covered.indexOf(k) < 0; });
    var cases = away.map(function (k) { return { k: k, r: caseFor(k) }; }).filter(function (x) { return x.r; });
    // The one prop that changes more than the root gives the drawing; the rest add their root changes to it.
    var inner = from ? [] : cases.filter(function (x) { var r = rootOf(x.r.markup); return r && !sameInside(baseRoot, r); });
    var start = from || (inner.length ? rootOf(inner[inner.length - 1].r.markup) : baseRoot.cloneNode(true));
    cases.forEach(function (x) {
      if (inner.length && x === inner[inner.length - 1]) return;
      var r = rootOf(x.r.markup); if (!r) return;
      var d = rootChange(baseRoot, r);
      d.remove.forEach(function (k) { start.classList.remove(k); }); d.add.forEach(function (k) { start.classList.add(k); });
      d.drop.forEach(function (a) { start.removeAttribute(a); }); Object.keys(d.attrs).forEach(function (a) { start.setAttribute(a, d.attrs[a]); });
    });
    return start.outerHTML;
  }
  function squashKey(k) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  // Whether its own build drew it with this value of the prop (a Vue component's every case): then the preview shows it.
  function renderedWith(c, p, v) { return (c.renders || []).some(function (r) { return p.label in r.props && String(r.props[p.label]) === String(v); }); }
  function baseElement(c, markup) {
    markup = markup || c.markup;
    if (markup) {
      var t = document.createElement('template'); t.innerHTML = markup.trim(); var first = t.content.firstElementChild;
      // The instance as the component is at rest: a state, a hidden flag or a layout the product gave this one copy is
      // dropped, so the props decide (a Disabled option puts disabled back).
      if (first) { ['disabled', 'aria-disabled', 'hidden', 'style'].forEach(function (a) { first.removeAttribute(a); }); uniqueIds(first); return first; }
    }
    var e;
    switch (c.role) {
      case 'button': e = document.createElement('button'); e.type = 'button'; break;
      case 'togglebutton': e = document.createElement('button'); e.type = 'button'; e.setAttribute('aria-pressed', 'false'); break;
      case 'textbox': case 'textinput': e = document.createElement('input'); e.type = 'text'; e.setAttribute('aria-label', c.name); break;
      case 'checkbox': case 'radio': e = document.createElement('input'); e.type = c.role; e.setAttribute('aria-label', c.name); break;
      case 'switch': e = document.createElement('button'); e.type = 'button'; e.setAttribute('role', 'switch'); e.setAttribute('aria-checked', 'false'); break;
      case 'link': e = document.createElement('a'); e.href = '#'; break;
      default: e = document.createElement('span');
    }
    // A stand-in, not the code's markup: the accessibility check says it is not checked instead of reading it.
    e.setAttribute('data-sg-standin', '');
    if (c.cls) e.classList.add(clsName(c));
    // Its name as the words only when no text prop fills it.
    if (e.tagName !== 'INPUT' && !(c.controls || []).some(function (k) { return k.type === 'TEXT'; })) e.textContent = c.name.charAt(0).toUpperCase() + c.name.slice(1);
    return e;
  }
  // A component the system defines by id: its rules copied for the class that stands for it in a preview.
  (function idAliasRules() {
    var ids = COMPONENTS.filter(function (c) { return /^#[\w-]+$/.test(c.cls || ''); }).map(function (c) { return c.cls.slice(1); });
    if (!ids.length) return;
    var re = new RegExp('#(' + ids.join('|') + ')(?![\\w-])', 'g'), out = [];
    var walk = function (rules, wrap) { Array.prototype.forEach.call(rules || [], function (r) {
      if (r.selectorText) { if (re.test(r.selectorText)) { re.lastIndex = 0; out.push(wrap(r.selectorText.replace(re, '.sg-id-$1') + '{' + r.style.cssText + '}')); } re.lastIndex = 0; return; }
      if (r.cssRules) walk(r.cssRules, r.conditionText ? function (x) { return wrap('@media ' + r.conditionText + '{' + x + '}'); } : wrap);
    }); };
    Array.prototype.forEach.call(document.styleSheets, function (sh) { try { walk(sh.cssRules, function (x) { return x; }); } catch (e) { /* another origin's sheet */ } });
    if (out.length) { var st = document.createElement('style'); st.textContent = out.join('\n'); document.head.appendChild(st); }
  })();
  // A component hidden at rest until a class shows it (a tooltip's visible class): the class whose own rule makes it
  // seen (opacity 1, visibility visible or a display), so the preview shows it.
  function showClass(c) {
    var base = '.' + clsName(c), found = null;
    var walk = function (rules) { Array.prototype.forEach.call(rules || [], function (r) {
      if (found) return;
      if (r.cssRules && !r.selectorText) { walk(r.cssRules); return; }
      (r.selectorText || '').split(',').forEach(function (sel) {
        var m = sel.trim().split(base + '.'); if (found || m.length !== 2 || m[0] !== '' || !/^[\w-]+$/.test(m[1])) return;
        if (r.style.opacity === '1' || r.style.visibility === 'visible' || (r.style.display && r.style.display !== 'none')) found = m[1];
      });
    }); };
    Array.prototype.forEach.call(document.styleSheets, function (sh) { try { walk(sh.cssRules); } catch (e) { /* another origin's sheet */ } });
    return found;
  }
  (function liveStateRules() {
    var out = [], map = [[':hover', '.sg-is-hover'], [':focus-visible', '.sg-is-focus-visible'], [':focus-within', '.sg-is-focus-within'], [':focus', '.sg-is-focus'], [':active', '.sg-is-active']];
    var walk = function (rules) { Array.prototype.forEach.call(rules || [], function (r) {
      if (r.cssRules && !r.selectorText) { walk(r.cssRules); return; }
      if (!r.selectorText || !/:(hover|focus|active)/.test(r.selectorText)) return;
      var sel = r.selectorText; map.forEach(function (m) { sel = sel.split(m[0]).join(m[1]); });
      out.push(sel + '{' + r.style.cssText + '}');
    }); };
    Array.prototype.forEach.call(document.styleSheets, function (sh) { try { walk(sh.cssRules); } catch (x) {} });
    var st = document.createElement('style'); st.id = 'sg-live-states'; st.textContent = out.join('\n'); document.head.appendChild(st);
  })();
  function applyEffect(e, effect, on) {
    if (!effect) return;
    // A state the page cannot hold by itself (hover, focus, pressed): the system's own rules for it, copied onto a class.
    if (effect.state) e.classList.toggle('sg-is-' + effect.state, on);
    // The part the state is set on (a checkbox's input), else the component itself.
    var t = effect.target ? (e.matches(effect.target) ? e : e.querySelector(effect.target)) : e;
    if (!t) return;
    // A class that names one of the component's own parts is that part, not a state to add to the whole.
    (effect.add || []).forEach(function (k) { if (!effect.target && e.querySelector(clsSel(k))) return; t.classList.toggle(k, on); });
    Object.keys(effect.attrs || {}).forEach(function (a) {
      if (on) t.setAttribute(a, effect.attrs[a]); else t.removeAttribute(a);
      if (a === 'checked' || a === 'disabled' || a === 'indeterminate') t[a] = on;   // the live state, not only the attribute
    });
    // The state a part is heard in, set with the look (heardOn: the field disabled inside its wrapper).
    (effect.also || []).forEach(function (x) { applyEffect(e, x, on); });
  }
  // Whether an option's look is what the component shows now: true or false, or null when the page cannot read it
  // (a live state such as hover, or an option that sets nothing).
  function effectHolds(e, effect) {
    if (!effect || effect.state) return null;
    var t = effect.target ? (e.matches(effect.target) ? e : e.querySelector(effect.target)) : e;
    if (!t) return null;
    var cls = (effect.add || []).filter(function (k) { return effect.target || !e.querySelector(clsSel(k)); }), attrs = Object.keys(effect.attrs || {});
    if (!cls.length && !attrs.length) return null;
    return cls.every(function (k) { return t.classList.contains(k); }) && attrs.every(function (a) {
      return (a === 'checked' || a === 'disabled' || a === 'indeterminate') ? !!t[a] : t.getAttribute(a) === String(effect.attrs[a]);
    });
  }
  function partsOf(e, sel) { try { return sel ? Array.prototype.slice.call(e.querySelectorAll(sel)) : []; } catch (x) { return []; } }
  // A selector list searched one selector at a time, in its own order (the first is the best match), not in page order.
  function partsInOrder(e, sel) { return String(sel || '').split(',').reduce(function (acc, one) { return acc.concat(partsOf(e, one.trim()).filter(function (k) { return acc.indexOf(k) < 0; })); }, []); }
  function textLeaf(e, sel, used) {
    if (e.tagName === 'INPUT') return e;
    // The part the prop names, even an empty one (a label the product fills at run time), never the component itself.
    var parts = partsInOrder(e, sel).filter(function (k) { return k !== e && !k.closest('svg') && !(used && used.indexOf(k) >= 0); });
    // The part whose own words they are (a label beside an icon), before a wrapper that only holds it.
    var own = function (k) { return Array.prototype.some.call(k.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); }); };
    var named = parts.find(function (k) { return k.tagName !== 'INPUT' && own(k); }) || parts.find(function (k) { return k.tagName !== 'INPUT' && k.textContent.trim() && !k.children.length; }) ||
      parts.find(function (k) { return k.tagName === 'INPUT' || !k.children.length; }) || parts.find(function (k) { return k.tagName !== 'INPUT' && k.textContent.trim(); });
    if (named) return named;
    var leaf = e;
    while (leaf.firstElementChild) { var next = Array.prototype.find.call(leaf.children, function (k) { return k.tagName.toLowerCase() !== 'svg' && k.textContent.trim() && !(used && used.some(function (u) { return u === k || k.contains(u); })); }); if (!next) break; leaf = next; }
    return leaf;
  }
  // Writes a text prop without wiping what else the element holds (an icon beside the words).
  // Writes a text prop without wiping what else the element holds (an icon beside the words), and never adds loose
  // text to an element that has none: its part, when a show prop draws it, carries the text.
  // The innermost element whose own words are these (the label its build drew), or null.
  function wordsAt(root, words) {
    var hit = null;
    Array.prototype.forEach.call([root].concat(Array.prototype.slice.call(root.querySelectorAll('*'))), function (k) { if (!hit || hit.contains(k)) { if ((k.textContent || '').trim() === words.trim() && words.trim()) hit = k; } });
    return hit;
  }
  function setText(el, v) {
    if (!el.children.length) { el.textContent = v; return; }
    var node = Array.prototype.find.call(el.childNodes, function (n) { return n.nodeType === 3 && n.textContent.trim(); });
    if (node) node.textContent = v;
  }
  function hasPart(c, sel) { var e = baseElement(c); return partsOf(e, sel).some(function (k) { return k !== e; }); }
  // A button or link on the page is the system's own text button (DATA.ui.button, read from its markup), its label in the
  // button's own label part. With none in the system, a plain link or button the browser draws: never one of the page's.
  // The system's own scripts lay out what they place (a sliding pill) on a resize: told after the page changes a control.
  var nudgeQueued = false;
  function nudge() { if (nudgeQueued) return; nudgeQueued = true; requestAnimationFrame(function () { nudgeQueued = false; try { window.dispatchEvent(new Event('resize')); } catch (e) {} }); }
  // icon: one of the system's icons after the words (a link that opens elsewhere).
  // lead: a mark of the page's own before the words (Figma, Code).
  function sysButton(tag, label, attrs, plainClass, icon, lead) {
    var b = DATA.ui && DATA.ui.button, ic = icon ? '<svg class="sg-link-icon" aria-hidden="true"><use href="#' + esc(icon) + '"/></svg>' : '';
    if (lead) label = { lead: lead, text: label };
    // With none, the page's default button (sg-btn): every such action looks the same, as a button.
    var words = label && label.lead ? label.lead + esc(label.text) : esc(label);
    if (!b) return '<' + tag + ' class="' + (plainClass ? plainClass + ' ' : '') + 'sg-btn"' + (tag === 'button' ? ' type="button"' : '') + (attrs || '') + '>' + words + ic + '</' + tag + '>';
    var text = b.label ? '<' + b.label.tag + (b.label.cls ? ' class="' + esc(b.label.cls) + '"' : '') + '>' + words + '</' + b.label.tag + '>' : words;
    return '<' + tag + ' class="' + esc(b.cls) + '"' + (tag === 'button' ? ' type="button"' : '') + (attrs || '') + '>' + text + ic + '</' + tag + '>';
  }
  // The system's icon for a link that opens elsewhere: one named for it, else an arrow.
  var LINK_ICON = (DATA.icons || []).find(function (i) { return /external|open|launch|link/i.test(i); }) || (DATA.icons || []).find(function (i) { return /arrow-?(up-)?right|arrow/i.test(i); }) || null;
  // Where the component is used: each product by its full name, linked when the config gives its page.
  function usageBadges(c) {
    var u = (c.usage || []).map(function (k) { return typeof k === 'string' ? { key: k, name: k } : k; });
    if (!u.length) return '';
    return '<span class="pg-usage-label">Used in</span>' + u.map(function (k) {
      return k.href ? sysButton('a', k.name, ' href="' + esc(k.href) + '" target="_blank" rel="noopener"', 'pg-usage-name') : '<span class="pg-usage-name">' + esc(k.name) + '</span>';
    }).join('');
  }
  // A date and time in the reader's own clock (two changes on one day read apart).
  var when = function (iso) { var d = new Date(iso); if (isNaN(d)) return String(iso || ''); var z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  // A date as a row says it, short: 16 Oct, 22:11 (the year only when it is not this one).
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var whenShort = function (iso) { var d = new Date(iso); if (isNaN(d)) return String(iso || ''); var z = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getDate() + ' ' + MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '') + ', ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
  function rowsHTML(rows) { return rows.map(function (r) { return '<tr><td>' + esc(r[0]) + '</td><td>' + linkVars(r[1]) + '</td></tr>'; }).join(''); }

