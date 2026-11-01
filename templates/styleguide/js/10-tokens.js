  /* ── Tokens: every foundation's variables on one page (colors, typography, spacing, radii, motion), grouped as Figma's
     collections, each mode a column; every variable in every mode in one file ──────────────────────────────────── */
  // Every variable Figma has (DATA.allVars: its name, the code's variable when the code declares it, its type, its
  // collection, its value in each mode), else the tokens the foundations show, read where they are drawn.
  function collectionOf(t) { return t.collection || String(t.figma || t.var || '').replace(/^--/, '').split('/')[0] || 'tokens'; }
  var TYPE_LABEL = { colour: 'Colour', typography: 'Typography', spacing: 'Spacing', radius: 'Radius', border: 'Border', shadow: 'Shadow', motion: 'Motion', number: 'Number', boolean: 'Boolean', text: 'Text' };
  var TYPE_ORDER = ['colour', 'typography', 'spacing', 'radius', 'border', 'shadow', 'motion', 'number', 'boolean', 'text'];
  var ALL_TOKENS = (function () {
    if ((DATA.allVars || []).length) return DATA.allVars.map(function (v) { return { figma: v.figma, var: v.var, type: v.type, collection: v.collection, modes: v.modes, values: v.values, aliases: v.aliases || null, description: v.description || '' }; });
    var out = [], seen = {};
    var add = function (t, type) {
      if (!t) return; if (typeof t === 'string') t = { var: t };
      if (!t.var || seen[t.var]) return; seen[t.var] = 1;
      out.push({ figma: t.figma || t.var.replace(/^--/, ''), var: t.var, type: type, value: t.value, collection: collectionOf(t) });
    };
    (TOKENS.colors || []).forEach(function (g) { (g.items || []).forEach(function (t) { add(t, 'colour'); }); });
    (TOKENS.typography || []).forEach(function (st) { ['size', 'weight', 'lh', 'ls', 'textTransform'].forEach(function (k) { if (st[k]) add(st[k], 'typography'); }); });
    if (TOKENS.typeFamily && /^--/.test(TOKENS.typeFamily.var || '')) add(TOKENS.typeFamily, 'typography');
    (TOKENS.spacing || []).forEach(function (t) { add(t, 'spacing'); });
    (TOKENS.radii || []).forEach(function (t) { add(t, 'radius'); });
    ((DATA.motion && DATA.motion.overview) || []).forEach(function (r) { (r.vars || []).forEach(function (v) { add(v, 'motion'); }); });
    return out;
  })();
  // The Tokens page, as Figma's own panel: its collections (All first), the chosen one's groups as a tree, and a table
  // with that collection's own modes as columns; a search and the foundations' filter (Colors, Typography, Spacing,
  // Radii, Motion) narrow what it lists. All collections at once: one table, each collection opening on a row of its own modes.
  var tkFoundation = null;   // set by the Tokens page: a foundation page's own tables (null with no Figma tokens)
  var TK_FILTER = [['', 'All'], ['colour', 'Colors'], ['typography', 'Typography'], ['spacing', 'Spacing'], ['radius', 'Radii'], ['motion', 'Motion']];
  var TK_SCREEN = ['watch', 'phone', 'mobile', 'small', 'tablet', 'medium', 'laptop', 'large', 'desktop', 'wide', 'xl'];
