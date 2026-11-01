// writing-formats.mjs - the dates the code writes, against the format the intent layer's writing rules give.
//
// A page of the intent layer writes the format as a person reads it (`d mmm yyyy, hh:mm`, an example `5 jun 2025`);
// the code writes it as a date library does (moment, dayjs: format('D MMM YYYY')). Read from both, without running
// anything:
//   format:  a helper writes a whole date (day, month and year) in an order or padding no rule gives.
//   case:    a helper writes the month with a capital where the rule's examples write it in lowercase, or the other way.
//   unlike:  two helpers of the code write the month two ways (one with a capital, one without).
// Pure: writingFindings({ rules, files }) → [{ kind, says, file, line }]; rules: the intent layer's text, files: [{ file, text }].

const MONTHS = /\b\d{1,2} ([A-Za-zÀ-ÿ]{3})\.? \d{4}\b/g;
// A format written for a person (d mmm yyyy, dd/mm/yyyy, hh:mm) as a date library writes it (D MMM YYYY, DD/MM/YYYY, HH:mm).
export function libraryFormat(f) {
  let afterHour = false;
  return String(f).trim().replace(/[a-z]+/gi, (t) => {
    const l = t.toLowerCase();
    if (/^h+$/.test(l)) { afterHour = true; return 'HH'; }
    if (/^s+$/.test(l)) return 'ss';
    if (/^d+$/.test(l)) return l.length === 1 ? 'D' : 'DD';
    if (/^y+$/.test(l)) return l.length <= 2 ? 'YY' : 'YYYY';
    if (/^m+$/.test(l)) return afterHour && l.length === 2 ? 'mm' : l.length >= 4 ? 'MMMM' : l.length === 3 ? 'MMM' : l.length === 2 ? 'MM' : 'M';
    return t;
  });
}
const isFormat = (s) => /^[dmyhs]{1,4}([ /.:,-]+[dmyhs]{1,4}){1,5}$/i.test(String(s).trim()) && /d/i.test(s) && /y/i.test(s);
const whole = (f) => /D/.test(f) && /M/.test(f) && /Y/.test(f);
// A format for a machine (an input's value, an API's date: YYYY-MM-DD, DD-MM-YYYY with numbers only and no space), not
// for a person to read: the writing rules do not apply to it.
const forMachine = (f) => /^(Y{4}[-/.]?M{2}[-/.]?D{2}|D{2}[-/.]M{2}[-/.]Y{4})(T.*)?$/.test(f.replace(/\s+/g, ''));

// The formats the rules give, and how their examples write the month (lower, upper or null when they show none).
export function ruleFormats(text) {
  const formats = [...new Set([...String(text).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]).filter(isFormat).map(libraryFormat))];
  const cases = [...String(text).matchAll(MONTHS)].map((m) => (m[1] === m[1].toLowerCase() ? 'lower' : m[1][0] === m[1][0].toUpperCase() ? 'upper' : null)).filter(Boolean);
  const month = cases.length && cases.every((c) => c === cases[0]) ? cases[0] : null;
  return { formats, month, example: (String(text).match(MONTHS) ?? [])[0] ?? null };
}

// Each helper of the code that writes a date: its name, file, line, the formats it passes, and whether it gives the
// month a capital of its own (format('MMM').charAt(0).toUpperCase()).
export function codeFormats(files = []) {
  const out = [];
  for (const { file, text } of files) {
    if (!/format\(\s*['"`][^'"`]*[DMY]/.test(text)) continue;
    // A helper: from one exported or named function to the next.
    const starts = [...text.matchAll(/(?:export\s+)?(?:const|function)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|\()/g)];
    starts.forEach((m, i) => {
      const body = text.slice(m.index, starts[i + 1]?.index ?? text.length);
      const formats = [...body.matchAll(/format\(\s*['"`]([^'"`]*)['"`]\s*\)/g)].map((x) => x[1]).filter((f) => /[DMY]/.test(f));
      if (!formats.length) return;
      // Pieces joined in a template (D, then MMM, then YYYY) are one format written in parts, each piece once.
      const piece = (f) => /^(D{1,2}|M{1,4}|Y{2,4}|HH|mm)$/.test(f);
      const pieces = formats.filter(piece).filter((f, i, a) => a.indexOf(f) === i);
      const full = formats.filter((f) => !piece(f));
      const capital = /format\(\s*['"`]M{3,4}['"`]\s*\)\s*\.charAt\(0\)\.toUpperCase\(\)/.test(body) || /capitali[sz]e\w*\([^)]*format\(\s*['"`]M{3,4}/.test(body);
      out.push({ name: m[1], file, line: text.slice(0, m.index).split('\n').length, formats: [...full, ...(pieces.length > 1 ? [pieces.join(' ')] : [])], capital });
    });
  }
  return out;
}

export function writingFindings({ rules = '', files = [] } = {}) {
  const rule = ruleFormats(rules);
  const helpers = codeFormats(files);
  const out = [];
  if (!rule.formats.length && !rule.month) return out;
  const where = (h) => `${h.name} (${h.file}:${h.line})`;
  for (const h of helpers) {
    for (const f of h.formats.filter((x) => whole(x) && !forMachine(x))) {
      if (rule.formats.length && !rule.formats.includes(f)) out.push({ kind: 'format', file: h.file, line: h.line, says: `${where(h)} writes a date as ${f}; the writing rules give ${rule.formats.join(', ')}.` });
    }
    const writesMonth = h.formats.some((f) => /M{3}/.test(f));
    if (writesMonth && rule.month === 'lower' && h.capital) out.push({ kind: 'case', file: h.file, line: h.line, says: `${where(h)} writes the month with a capital; the writing rules write it in lowercase (${rule.example}).` });
    if (writesMonth && rule.month === 'upper' && !h.capital && h.formats.some((f) => /MMM/.test(f))) out.push({ kind: 'case', file: h.file, line: h.line, says: `${where(h)} writes the month as the locale does; the writing rules write it with a capital (${rule.example}).` });
  }
  // Two helpers that write the month two ways, said once.
  const months = helpers.filter((h) => h.formats.some((f) => /M{3}/.test(f)));
  const up = months.filter((h) => h.capital), low = months.filter((h) => !h.capital);
  if (up.length && low.length) out.push({ kind: 'unlike', file: up[0].file, line: up[0].line, says: `${up.map((h) => h.name).join(', ')} write${up.length === 1 ? 's' : ''} the month with a capital and ${low.map((h) => h.name).join(', ')} without: the same date reads two ways on one screen.` });
  return out;
}
