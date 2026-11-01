  // ── How a product brings it in: its import line (copied), its file (downloaded), and what it is built with ────────
  // Its import and file, first in its Code area.
  function codeImportHTML(c) { var h = importHTML(c); return h ? '<div class="pg-doc pg-code-import">' + h + '</div>' : ''; }
  function importHTML(c) {
    var out = '';
    if (c.import) out += '<div class="pg-import"><span class="pg-usage-label">Import</span><code>' + esc(c.import.line) + '</code>' + sysButton('button', 'Copy import', ' data-copy-text="' + esc(c.import.line) + '"') + (c.source ? sysButton('button', 'Download file', ' data-download="' + esc(c.name) + '"') : '') + '<span class="sg-hidden-text" role="status"></span></div>';
    // Its own functions in the system's script: imported from a module, else called as the script names them.
    ((c.import && c.import.uses) || []).forEach(function (u) {
      out += '<div class="pg-import"><span class="pg-usage-label">' + (u.module ? 'Import' : 'Script') + '</span><code>' + esc(u.line) + '</code>' + (u.module ? '' : '<span class="pg-selector">from ' + esc(u.from) + '</span>') + sysButton('button', u.module ? 'Copy import' : 'Copy call', ' data-copy-text="' + esc(u.line) + '"') + '<span class="sg-hidden-text" role="status"></span></div>';
    });
    return out;
  }
