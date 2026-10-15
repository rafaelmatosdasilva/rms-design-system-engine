// figma-link.mjs - a finding that names a component also links to it in Figma, so the reader opens
// the exact node instead of searching the file for it.
//
// The node ids come from the snapshots the audit already has (structure and component props); the
// file key from ds-config figmaFileKey. No network, no token: when either is missing, no link.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The file key a Figma link names. A branch link (figma.com/design/<file>/branch/<branch>/...) names the branch: the
// engine then reads the branch, which stays as it is while the main file changes. A bare key is kept as it is.
export function figmaFileKeyOf(raw) {
  const s = String(raw ?? '').trim();
  const branch = s.match(/figma\.com\/(?:design|file)\/[a-zA-Z0-9]+\/branch\/([a-zA-Z0-9]+)/);
  if (branch) return branch[1];
  const m = s.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
  return m ? m[1] : s;
}
// The main file a branch link belongs to, or null when the link is not a branch's.
export function figmaMainKeyOf(raw) {
  const m = String(raw ?? '').match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)\/branch\/[a-zA-Z0-9]+/);
  return m ? m[1] : null;
}

export function figmaLink(fileKey, nodeId) {
  if (!fileKey || !nodeId) return null;
  return `https://www.figma.com/design/${fileKey}?node-id=${String(nodeId).replace(/:/g, '-')}`;
}

// { componentName: nodeId } from the structure snapshot, then the props snapshot for the rest.
export function figmaNodeIds(root, cfg) {
  const ids = {};
  const read = (p) => { try { return JSON.parse(readFileSync(join(root, p), 'utf8')); } catch { return null; } };
  const st = read(cfg.paths?.snapshotStructure ?? 'figma-structure.snapshot.json');
  for (const [k, v] of Object.entries(st?.components ?? st ?? {})) if (!k.startsWith('_') && v?.nodeId) ids[k] = v.nodeId;
  const pr = read(cfg.paths?.compPropsSnapshot ?? 'figma-component-props.snapshot.json');
  for (const [k, v] of Object.entries(pr ?? {})) if (!k.startsWith('_') && v?.nodeId && !ids[k]) ids[k] = v.nodeId;
  return ids;
}

// A resolver for one run: linkFor('chip') → the URL, or null.
export function figmaLinker(root, cfg) {
  const ids = figmaNodeIds(root, cfg);
  return (name) => figmaLink(cfg.figmaFileKey, ids[name]);
}
