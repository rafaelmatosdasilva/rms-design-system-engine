  /* ── Every switch on the page is the system's own segmented control (DATA.ui.segmented, read from its markup). With
     none (or none read yet), the page's default one (.sg-seg-default); DATA.ui.gaps says so, on the overview and in the
     Status page. ─────────────────────────────────────────────── */
  // The tokens no component uses yet: a white-label system's, kept for a brand or a component to come.
  var NOT_USED_YET = {}; (DATA.notUsedYet || []).forEach(function (n) { NOT_USED_YET[n] = true; });
  var SEG = DATA.ui && DATA.ui.segmented, RADIO = SEG && SEG.item.radio, RADIO_NO = 0;
