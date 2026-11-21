// a11y-ibm.mjs - IBM's Equal Access Checker beside axe-core and the engine's own checks: a second rule engine.
//
// Every automated finding came from axe-core and the engine's own code, and one rule engine has its blind spots. IBM's
// Equal Access Checker (accessibility-checker-engine, Apache 2.0) has rules of its own. When it is there, it runs on the
// same pages, against WCAG 2.2, and each problem it raises is held against what the others raised on the same element
// under the same criterion:
//   confirmed   it and another (the engine's checks or axe-core) both raise it: the strongest automated evidence
//   only IBM    a finding of its own, listed as IBM's with its rule
//   only others what the engine or axe-core found and IBM did not
// It is optional, as every outside tool is: the engine uses it only when the engine's own cache has the pinned copy
// (node lib/a11y-check.mjs --fetch-ibm, never put in a project) or a11y.ibmPath names one, and the check is whole
// without it. A copy whose SHA-384 is not the pinned one is never run in a page.
//
//   IBM_VERSION, IBM_SHA384, ibmIntact(source)
//   ibmCachePath(home), fetchIbmSource(cfg, { download })   → the source, or null
//   IBM_JS(roots)                                          → the in-page script; its value is JSON of [{ rule, level, sc, desc, message }]
//   ibmFindings(results, engineFindings, axeRows, kindSc) → { rows, confirmed, summary }
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

// The version and the hash move together, as axe-core's do: read the new ace.js's sha384 and set both in one edit.
export const IBM_VERSION = '4.0.34';
export const IBM_SHA384 = 'iHsQmAmulyc3ptwmKYGRLt3Lz6Bl+i3XaOPbA8uaiaOoqDpyk9C86Elk3Qlbc7v5';
export const IBM_LABEL = 'IBM Equal Access Checker';
export const ibmIntact = (s) => typeof s === 'string' && createHash('sha384').update(s).digest('base64') === IBM_SHA384;
export const ibmCachePath = (home = homedir()) => join(home, '.cache', 'rms-design-system-engine', `ibm-ace-${IBM_VERSION}.js`);

function fileFromTgz(buf, wanted) {
  const tar = gunzipSync(buf);
  for (let off = 0; off + 512 <= tar.length;) {
    const name = tar.subarray(off, off + 100).toString('utf8').replace(/\0.*$/s, '');
    if (!name) break;
    const size = parseInt(tar.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/s, '').trim() || '0', 8);
    if (name === wanted) return tar.subarray(off + 512, off + 512 + size).toString('utf8');
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return null;
}

// The pinned ace.js: a11y.ibmPath (the project's own copy, trusted as given), then the cache. Only with download (the
// --fetch-ibm the person asks for) is it fetched, from jsDelivr then the npm registry, and kept in the cache.
export async function fetchIbmSource(cfg = {}, { download = false, home = homedir(), fetchImpl = fetch } = {}) {
  if (cfg.a11y?.ibmPath) { try { const s = readFileSync(resolve(cfg.a11y.ibmPath), 'utf8'); if (s.length > 100000 && s.includes('Checker')) return s; } catch { /* fall through */ } }
  const cached = ibmCachePath(home);
  try { const s = readFileSync(cached, 'utf8'); if (ibmIntact(s)) return s; } catch { /* not cached */ }
  if (!download) return null;
  const sources = [
    async () => { const r = await fetchImpl(`https://cdn.jsdelivr.net/npm/accessibility-checker-engine@${IBM_VERSION}/ace.js`, { signal: AbortSignal.timeout(30000) }); return r.ok ? r.text() : null; },
    async () => { const r = await fetchImpl(`https://registry.npmjs.org/accessibility-checker-engine/-/accessibility-checker-engine-${IBM_VERSION}.tgz`, { signal: AbortSignal.timeout(60000) }); return r.ok ? fileFromTgz(Buffer.from(await r.arrayBuffer()), 'package/ace.js') : null; },
  ];
  for (const get of sources) {
    let s;
    try { s = await get(); } catch { continue; }
    if (!ibmIntact(s)) continue;
    try { mkdirSync(dirname(cached), { recursive: true }); const tmp = `${cached}.${process.pid}.tmp`; writeFileSync(tmp, s); renameSync(tmp, cached); } catch { /* the cache is optional */ }
    return s;
  }
  return null;
}

// Run in the page after ace.js: WCAG 2.2's rule set, its violations (a failure, or one it asks a person to verify),
// each with the criteria the rule stands for and the element as the engine names it (tag#id.class, and the component it
// sits in), limited to the checked components when there are any.
export const IBM_JS = (roots = null) => `(async () => {
  const roots = ${JSON.stringify(roots)};
  const desc = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ((el.className && typeof el.className === 'string' && el.className.trim()) ? '.' + el.className.trim().split(/\\s+/).join('.') : '')).slice(0, 80);
  const ownerOf = (el) => { if (!roots) return ''; let best = null, depth = -1; for (const s of roots) { let r; try { r = el.closest(s); } catch (e) { continue; } if (!r) continue; let d = 0; for (let n = r; n; n = n.parentElement) d++; if (d > depth) { depth = d; best = s; } } return best ? ' in ' + best : ''; };
  const inRoots = (el) => !roots || roots.some((s) => { try { return !!el.closest(s); } catch (e) { return false; } });
  try {
    const checker = new ace.Checker();
    const scOf = {};
    for (const g of checker.getGuidelines()) if (g.id === 'WCAG_2_2') for (const cp of g.checkpoints || []) for (const r of cp.rules || []) (scOf[r.id] ||= []).push(cp.num);
    const report = await checker.check(document, ['WCAG_2_2']);
    const out = [];
    for (const r of report.results || []) {
      if (r.value[0] !== 'VIOLATION' || (r.value[1] !== 'FAIL' && r.value[1] !== 'POTENTIAL')) continue;
      let el = null;
      try { el = document.evaluate(r.path && r.path.dom, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue; } catch (e) { el = null; }
      if (el && el.nodeType !== 1) el = el.parentElement;
      if (!el || !inRoots(el)) continue;
      out.push({ rule: r.ruleId, level: r.value[1], sc: scOf[r.ruleId] || [], desc: desc(el) + ownerOf(el), message: String(r.message || '').slice(0, 300) });
    }
    return JSON.stringify(out);
  } catch (e) { return 'ERR:' + e.message; }
})()`;

const elementOf = (desc) => String(desc ?? '').replace(/^<\w+> /, '').replace(/ in [^ ]+$/, '').replace(/::placeholder.*$/, '').split(/ \(|\s/)[0];

// IBM's results held against the engine's findings and axe-core's rows: an element and a criterion both raise is
// confirmed, the rest is IBM's own or the others' own. kindSc maps an engine kind to its criterion or criteria.
// → { rows: [finding], confirmed: [{ by, kind, desc, sc, ibm }], summary: { confirmed, onlyIbm, onlyOthers } }
export function ibmFindings(results = [], engineFindings = [], axeRows = [], kindSc = {}) {
  const others = [];
  // A kind can stand for several criteria (a control with no name fails 1.1.1, 4.1.2 or 3.3.2): any of them matches.
  const scsOf = (k, own) => [...new Set([].concat(kindSc[k] ?? [], own ?? []).map(String))];
  for (const f of engineFindings) { const sc = scsOf(f.kind, f.sc); if (sc.length) others.push({ by: 'engine', kind: f.kind, el: f.el ?? elementOf(f.desc), sc, desc: f.desc }); }
  for (const r of axeRows) for (const e of r.elements ?? []) if (r.wcag) others.push({ by: 'axe-core', kind: r.kind, el: elementOf(e), sc: scsOf(null, r.wcag), desc: e });
  const confirmed = [], matched = new Set(), mine = new Map();
  for (const x of results) {
    const el = elementOf(x.desc);
    const hits = others.filter((o) => o.el === el && o.sc.some((c) => x.sc.includes(c)));
    if (hits.length) { for (const h of hits) { confirmed.push({ by: h.by, kind: h.kind, desc: h.desc, sc: h.sc.find((c) => x.sc.includes(c)), ibm: x.rule }); matched.add(h); } continue; }
    const row = mine.get(x.rule) ?? { kind: `ibm:${x.rule}`, rule: x.rule, why: x.message, sc: x.sc, level: x.level, elements: [] };
    if (!row.elements.includes(x.desc)) row.elements.push(x.desc);
    if (x.level === 'FAIL') row.level = 'FAIL';
    mine.set(x.rule, row);
  }
  const rows = [...mine.values()].map((r) => ({
    kind: r.kind, rule: r.rule, help: r.why, why: r.why, fix: r.why, url: `https://www.ibm.com/able/requirements/checker-rule-sets`,
    wcag: r.sc[0] ?? null, by: IBM_LABEL,
    // A second engine's word alone never stops a run: a failure is a warning, a "verify this" an advisory.
    severity: r.level === 'FAIL' ? 'warning' : 'advisory',
    places: r.elements.length, desc: r.elements.slice(0, 3).join(', '), elements: r.elements,
  }));
  const keyOf = (o) => `${o.by}|${o.kind}|${o.el}`;
  const confirmedKeys = new Set([...matched].map(keyOf));
  const onlyOthers = new Set(others.filter((o) => !confirmedKeys.has(keyOf(o))).map(keyOf)).size;
  return { rows, confirmed, summary: { confirmed: confirmedKeys.size, onlyIbm: rows.reduce((n, r) => n + r.places, 0), onlyOthers } };
}
