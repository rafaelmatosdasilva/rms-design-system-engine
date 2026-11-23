  /* ── The system's own font family ───────────────────────────────────────────────────────────────────────────── */
  // The family once, as its own token (TOKENS.typeFamily). Everything the page draws of the system is set in it (its
  // variable), as a product's page using it would be, never in the font the project's own site shell writes on its
  // body: so a brand's family reaches every component that inherits its font. Its text styles are on the Tokens page.
  var TYPE_FAMILY = TOKENS.typeFamily || null;
  if (TYPE_FAMILY && TYPE_FAMILY.var) { var tfs = document.createElement('style'); tfs.id = 'sg-system-family'; tfs.textContent = ':is(.pg-preview, .pg-frame-stage, .pg-variants, .pg-offstage, .sg-thumb, .sg-showroom) { font-family: var(' + TYPE_FAMILY.var + '); }'; document.head.appendChild(tfs); }
