// figma-analytics.mjs - where a library component is used in every team file, from Figma's Library Analytics API.
//
// The engine reads the code and the Figma screens it is given; a component's instances in the team's other files are
// only known to Figma. Its Library Analytics API says, per component, how many instances and files use it, on the plans
// that have it (Enterprise). Without it, or without a token that may read it, the answer says why, and a change report
// keeps saying those files were not seen.
//
//   libraryUsage(component, { fileKey, token, get }) → { instances, files } | { unseen: why }
//
// One GET (component usages, grouped by component), read once per run.
const API = 'https://api.figma.com/v1/analytics/libraries';
const cache = new Map();

export async function libraryUsage(component, { fileKey, token, get = globalThis.fetch } = {}) {
  if (!fileKey) return { unseen: 'no Figma file is set' };
  if (!token) return { unseen: 'no FIGMA_TOKEN, so Figma\'s library analytics were not read' };
  if (!cache.has(fileKey)) cache.set(fileKey, (async () => {
    const r = await get(`${API}/${fileKey}/component/usages?group_by=component`, { headers: { 'X-Figma-Token': token } }).catch(() => null);
    if (!r) return { unseen: 'Figma could not be reached' };
    if (r.status === 403 || r.status === 401) return { unseen: 'Figma\'s library analytics need an Enterprise plan and a token that may read them' };
    if (!r.ok) return { unseen: `Figma answered ${r.status}` };
    const j = await r.json().catch(() => null);
    return { rows: j?.rows ?? j?.meta?.rows ?? [] };
  })());
  const got = await cache.get(fileKey);
  if (got.unseen) return got;
  // A component set's variants are rows of their own: they are added up under the set's name.
  const mine = got.rows.filter((x) => (x.component_set_name ?? x.component_name) === component);
  if (!mine.length) return { instances: 0, files: 0 };
  return { instances: mine.reduce((n, x) => n + Number(x.usages ?? x.num_instances ?? 0), 0), files: Math.max(...mine.map((x) => Number(x.files_using ?? x.num_files ?? 0))) };
}
