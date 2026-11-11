  // ── Links: where else it lives (Figma, its code, the team's documentation), each opening in a new tab ────────────
  function headLinksHTML(list) {
    if (!(list || []).length) return '';
    // Named for where it takes you (Figma, Code), each with the page's own mark for it, never one of the system's icons.
    var mark = function (label) { return /^figma$/i.test(label) ? FIGMA_SVG : /^code$/i.test(label) ? CODE_SVG : EXTERNAL_SVG; };   // any other: the mark of a link to another site
    return '<div class="pg-head-links">' + list.map(function (l) { return sysButton('a', /^code$/i.test(l.label) ? 'Code' : /^figma$/i.test(l.label) ? 'Figma' : l.label, ' href="' + esc(l.url) + '" target="_blank" rel="noopener"', null, null, mark(l.label)); }).join('') + '</div>';
  }
  // A link of the system's named for where it takes you: its Figma file is Figma, its repository Code, any other its own.
  function sourceLink(l) { return { url: l.url, label: /^contracts$/i.test(l.label) ? 'Contracts' : /figma/i.test(l.label + ' ' + l.url) ? 'Figma' : /code|repo|git/i.test(l.label + ' ' + l.url) ? 'Code' : l.label }; }
  // Where a page's documentation is read from, each a link at its top right: the Figma file, the code, the intent layer.
  // Only the sources the page reads (words: its Source filter's words), in that filter's order: no link to a place
  // nothing on the page comes from.
  function sourceLinks(layer, words) {
    var own = (DATA.links || []).map(sourceLink), pick = function (k) { return own.filter(function (l) { return l.label === k; }).slice(0, 1); };
    var of = { 'Intent layer': layer ? [{ label: 'Intent layer', url: layer }] : [], Figma: pick('Figma'), Contract: pick('Contracts'), Code: pick('Code') };
    return (words || ['Figma', 'Code', 'Intent layer']).reduce(function (out, w) { return out.concat(of[w] || []); }, []);
  }
  function linksHTML(list) {
    if (!(list || []).length) return '';
    return '<div class="pg-import pg-links"><span class="pg-usage-label">Links</span>' + list.map(function (l) { return sysButton('a', l.label, ' href="' + esc(l.url) + '" target="_blank" rel="noopener"'); }).join('') + '</div>';
  }
