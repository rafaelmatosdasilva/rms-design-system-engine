// shell-targets.mjs - the files a shell command writes, read by the guard before a command runs (guard.mjs judge) and
// by the Codex hook after it ran (agent-hooks.mjs), which is why it is a module of its own: guard.mjs imports
// agent-hooks.mjs, so agent-hooks.mjs cannot import it back.

// The files a shell command writes, moves or deletes: a redirect, tee, sed -i, perl -i, rm, mv (both ends), cp
// (the copy), git rm and git mv, and a file a one-line script opens to write (Python's open(…, 'w'), write_text, Node's
// writeFileSync). Reading is never a write. Codex edits with the shell as often as with apply_patch (a recorded run
// changed a stylesheet with sed -i, test/codex-recorded.test.mjs), so a shell write is judged as the edit it is.
export function shellTargets(cmd) {
  const s = String(cmd ?? '');
  const out = [...s.matchAll(/(?<![<=\d-])>{1,2}\s*(['"]?)([^\s'";|&>()]+)\1/g)].map((m) => m[2]).filter((f) => f !== '/dev/null' && !/^&\d$/.test(f));
  for (const m of s.matchAll(/\bopen\(\s*(['"])([^'"]+)\1\s*,\s*(?:mode\s*=\s*)?(['"])[^'"]*[wax+][^'"]*\3/g)) out.push(m[2]);
  for (const m of s.matchAll(/\b(?:Path|pathlib\.Path)\(\s*(['"])([^'"]+)\1\s*\)\s*\.write_(?:text|bytes)\(/g)) out.push(m[2]);
  for (const m of s.matchAll(/\b(?:writeFileSync|appendFileSync|writeFile|appendFile)\(\s*(['"`])([^'"`]+)\1/g)) out.push(m[2]);
  for (const w of segments(s)) {
    while (w.length && (/^\w+=/.test(w[0]) || w[0] === 'sudo')) w.shift();
    if (w[0] === 'git' && (w[1] === 'rm' || w[1] === 'mv')) w.shift();
    const [c, ...args] = w;
    const files = args.filter((x) => !x.startsWith('-'));
    if (['tee', 'rm', 'mv', 'unlink', 'truncate'].includes(c)) out.push(...files);
    else if (c === 'cp' && files.length) out.push(files[files.length - 1]);
    else if (c === 'sed' && args.some((x) => /^(-[a-zA-Z]*i|--in-place)/.test(x))) out.push(...inPlaceFiles(args, 'sed'));
    else if (c === 'perl' && args.some((x) => /^-[a-zA-Z]*i/.test(x))) out.push(...inPlaceFiles(args, 'perl'));
  }
  return out.filter(Boolean);
}

// The words of each simple command, quotes taken off and redirects left out (they are read above): split on ; && || |
// & and new lines only outside quotes, so a sed script's own ";" is never a command's end.
function segments(cmd) {
  const segs = [];
  let w = [], cur = null, q = null, redirect = false;
  const word = () => { if (cur !== null) { if (redirect) redirect = false; else w.push(cur); } cur = null; };
  const end = () => { word(); if (w.length) segs.push(w); w = []; };
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    if (q) { if (ch === q) q = null; else if (ch === '\\' && q === '"' && i + 1 < cmd.length) cur += cmd[++i]; else cur += ch; continue; }
    if (ch === "'" || ch === '"') { q = ch; cur = cur ?? ''; continue; }
    if (ch === '\\' && i + 1 < cmd.length) { cur = (cur ?? '') + cmd[++i]; continue; }
    if (/\s/.test(ch) && ch !== '\n') { word(); continue; }
    if (ch === '\n' || ch === ';' || ch === '|' || (ch === '&' && cmd[i + 1] !== '>' && cmd[i - 1] !== '>')) { end(); if (cmd[i + 1] === ch) i++; continue; }
    if (ch === '>' || ch === '<') {
      if (cur !== null && /^\d+$/.test(cur)) cur = null; else word();
      while (cmd[i + 1] === '>' || cmd[i + 1] === '&') i++;
      redirect = true; continue;
    }
    cur = (cur ?? '') + ch;
  }
  end();
  return segs;
}

// The files sed -i or perl -i edit: what is left once the options, their values (sed's -i suffix, -e and -f) and the
// script (sed's first word when no -e names it) are taken out.
function inPlaceFiles(args, cmd) {
  const rest = [];
  let script = false;
  for (let i = 0; i < args.length; i++) {
    const x = args[i];
    if (cmd === 'sed' && /^(-[a-zA-Z]*i|--in-place)$/.test(x) && (args[i + 1] === '' || /^\.\w*$/.test(args[i + 1] ?? ''))) { i++; continue; }   // macOS's -i '' and a backup suffix
    if (/^-[a-zA-Z]*[ef]$/.test(x) || x === '--expression' || x === '--file') { i++; script = true; continue; }
    if (x.startsWith('-')) { if (/^-[a-zA-Z]*e./.test(x) && cmd === 'perl') script = true; continue; }
    rest.push(x);
  }
  return cmd === 'sed' && !script ? rest.slice(1) : rest;
}
