  /* ── Mode engine: the system's mode collections as axes ─────────────────────────────────────────────────────────
     One entry per axis (DATA.modes). An attribute axis sets data-* on <html>, or on one preview when the axis is
     scoped (its CSS nests, as a Figma mode does on a frame); a class axis toggles a class on <html>. The first value
     is the base: choosing it clears the attribute so the :root defaults apply. */
  var AXES = DATA.modes || [];
