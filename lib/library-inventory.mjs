// library-inventory.mjs - the system's components as Figma's published library lists them, read against the file.
//
// The library keeps what was published, under the name and shape it had then. A component published on its own and
// later made a variant of another (promoTile, now `state=rest` inside `.promoTile`) stays in the library list as a
// component of the system until Figma drops it, and a component renamed since keeps its old name there. So each
// entry is read in the file as it is now: a node that is gone, or that is now a variant, is no component of the
// system, and one renamed counts by its name now. When the file cannot be read, the library list stands as it is.
//
// Pure: the caller fetches.
import { unpublished } from './figma-capture.mjs';

// The node ids to read in the file, in groups small enough for one request each.
export function libraryNodeIds(sets = [], components = [], size = 200) {
  const ids = [...new Set([...sets, ...standalone(components)].map((e) => e.node_id).filter(Boolean))];
  const groups = [];
  for (let i = 0; i < ids.length; i += size) groups.push(ids.slice(i, i + size));
  return groups;
}

const standalone = (components) => components.filter((c) => !c.containing_frame?.containingStateGroup);
// A variant's name is its property values (`state=rest, size=m`).
const isVariant = (node) => node?.type === 'COMPONENT' && /=/.test(String(node.name ?? ''));

// sets, components: the `meta` lists of /component_sets and /components. live: node id → { type, name } as /nodes
// gives it (null for a node that is gone), or null when the file could not be read.
export function libraryInventory(sets = [], components = [], live = null) {
  const names = new Set();
  for (const e of [...sets, ...standalone(components)]) {
    let name = e.name;
    if (live) {
      const node = live[e.node_id];
      if (node === null) continue;              // gone from the file
      if (node) {
        if (isVariant(node)) continue;          // now a variant of another component
        name = node.name;
      }
    }
    if (!unpublished(name)) names.add(name);
  }
  return names;
}
