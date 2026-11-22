// format-tokens.mjs - how dates, numbers and money are written, read as part of the system.
//
// The order of day, month and year, the decimal mark and where the currency goes are decisions a system makes once per
// market. A system that keeps them as tokens (a collection whose modes are its markets: en-GB, pt-BR, or Market =
// Portugal) has written them down, and two things follow, both read without running anything:
//   • each format is set in every market: a format token with no value in one market is a market whose screens
//     each agent fills by guess;
//   • code that formats by hand, where the system has a format: a locale written in the code (Intl.DateTimeFormat('en-US'),
//     toLocaleDateString('pt-BR')), a date pattern given to a date library (format('DD/MM/YYYY')), or a currency symbol
//     joined to a number ('$' + price, `${amount} €`). Each is said with the system's format tokens, so it can come
//     from the market's mode instead of the code.
// A system with no format tokens is told nothing here: there is nothing to hold the code to. The intent layer's own
// writing rules are read apart (writing-formats.mjs).
//
//   formatCollections(vars)          → [{ collection, modes, tokens: { name: { mode: value } } }]
//   formatGaps(collections)          → [{ collection, token, missing: [mode] }]
//   formatFindings(text, collections) → [{ line, kind, found, says }]

// A mode named for a market: a language tag (en, en-GB, pt_BR) or a country, or a collection named for them.
const LOCALE = /^[a-z]{2,3}([-_][A-Za-z]{2,4})?$/;
const MARKET_COLLECTION = /\b(locale|locales|market|markets|region|regions|country|countries|language|languages|i18n|l10n)\b/i;
// A token that holds a format: its name says so, or its value is a pattern for a date or a number.
const FORMAT_NAME = /(^|[/._-])(format|formats|date|time|datetime|number|decimal|currency|money|price|percent)($|[/._-])/i;
const FORMAT_VALUE = /^(?=.*[dDmMyY].*[dDmMyY])[dDmMyYhHs\s/.:,-]{4,}$|[#0][#0.,\s]*[0#]|[¤$€£¥]/;

export function formatCollections(vars = {}) {
  const out = [];
  for (const [collection, c] of Object.entries(vars?.modeVariants ?? {})) {
    const modes = (c?.modes ?? []).map((m) => m.snapshotKey ?? m.name);
    const named = (c?.modes ?? []).map((m) => m.name ?? m.snapshotKey);
    const markets = MARKET_COLLECTION.test(collection) || (named.length && named.every((n) => LOCALE.test(String(n))));
    const tokens = {};
    for (const [name, v] of Object.entries(c?.vars ?? {})) {
      if (v?.kind && v.kind !== 'string' && v.kind !== 'scalar') continue;
      const vals = Object.values(v?.values ?? {}).filter((x) => x != null && x !== '');
      if (FORMAT_NAME.test(name) || vals.some((x) => FORMAT_VALUE.test(String(x)))) tokens[name] = v.values ?? {};
    }
    if (markets && Object.keys(tokens).length) out.push({ collection, modes, tokens });
  }
  return out;
}

export function formatGaps(collections = []) {
  const out = [];
  for (const c of collections) for (const [token, values] of Object.entries(c.tokens)) {
    const missing = c.modes.filter((m) => values[m] == null || String(values[m]).trim() === '');
    if (missing.length) out.push({ collection: c.collection, token, missing });
  }
  return out;
}
export const gapLine = (g) => `${g.token} (${g.collection}) has no value in ${g.missing.join(', ')}`;

// The system's format tokens, named for a person: the first few, with the collection they live in.
const tokensSaid = (collections) => {
  const names = collections.flatMap((c) => Object.keys(c.tokens).map((t) => t));
  return `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''} (${collections.map((c) => c.collection).join(', ')})`;
};
const PATTERNS = [
  { kind: 'locale', re: /\bnew\s+Intl\.(DateTimeFormat|NumberFormat|RelativeTimeFormat)\(\s*(['"`])([a-z]{2,3}(?:[-_][A-Za-z]{2,4})?)\2/g, what: (m) => `Intl.${m[1]}('${m[3]}') writes the market in the code` },
  { kind: 'locale', re: /\.(toLocaleDateString|toLocaleTimeString|toLocaleString)\(\s*(['"`])([a-z]{2,3}(?:[-_][A-Za-z]{2,4})?)\2/g, what: (m) => `${m[1]}('${m[3]}') writes the market in the code` },
  { kind: 'date', re: /\.format\(\s*(['"`])((?=[^'"`]*[DMY])[DMYHhms\s/.:,-]{4,})\1\s*\)/g, what: (m) => `format('${m[2]}') writes the date's pattern in the code` },
  { kind: 'money', re: /(['"`])[$€£¥]\1\s*\+|\+\s*(['"`])\s?[$€£¥]\2|`[^`\n]*[$€£¥]\$\{|`[^`\n]*\$\{[^}]+\}\s?[€£¥]/g, what: () => 'a currency symbol joined to a number by hand' },
];
export function formatFindings(text, collections = []) {
  if (!collections.length) return [];
  const src = String(text ?? '');
  const out = [];
  for (const p of PATTERNS) for (const m of src.matchAll(p.re)) {
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ line, kind: p.kind, found: m[0], says: `${p.what(m)}, where the system keeps its formats per market: ${tokensSaid(collections)}. Take it from the market's format instead` });
  }
  return out.sort((a, b) => a.line - b.line);
}
