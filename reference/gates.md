# Gate-specific rules

Part of the rms-design-system-engine reference (`rms-design-system-engine --reference gates`). The rules that always apply are in the main guide.

---


## Gate [13] (Structure) - Figma annotation parity

Every Figma annotation attached to a component node is a design specification. The audit fetches `doc.annotations[]` for every component via the REST API and stores them in `figma-component-props.snapshot.json`. Gate [13] (Structure) then enforces that each annotation is acknowledged in the contract and, where applicable, verified in CSS.

### How it works

1. **`audit.mjs` refresh** - `refreshComponentProps()` fetches `doc.annotations[]` alongside `componentPropertyDefinitions` for every component node. Nodes with either properties **or** annotations are included in the snapshot. (`/nodes` works on any plan with a token.)
2. **Gate [13] (Structure) check** - for every component in the snapshot that has annotations, `structure-check.mjs` looks up `CONTRACT[key].annotations` and verifies each annotation label is present. Missing label → `FAIL`. If a CSS selector is provided, it must exist in the CSS - not found → `FAIL`. An accessibility note the accessibility check verifies (a role, name, heading level or alt text, see *Writing accessibility notes in Figma* in `rms-design-system-engine --reference usage`) passes without an entry.
3. **`anyFail`** - annotation failures count the same as property failures; the gate exits non-zero.

### Plugin API capture (no token, any plan)

No token? Generate the same file inside Figma via `use_figma` / the plugin console, then save it as `figma-component-props.snapshot.json` at project root and commit it. `componentPropertyDefinitions` is readable on a COMPONENT_SET (or a standalone COMPONENT), so this needs no token or special plan access - it feeds Gate [15] (component prop parity) and Gate [13] (Structure) at full strength:

```js
const result = {};
const sets = figma.root.findAll(n =>
  n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent?.type !== 'COMPONENT_SET'));
for (const node of sets) {
  let props = {};
  try { props = node.componentPropertyDefinitions ?? {}; } catch { /* variant child - skip */ }
  const anns = node.annotations ?? [];
  // Notes on inner layers of the default variant (the first one; a standalone component is its own).
  const base = node.type === 'COMPONENT_SET' ? node.children[0] : node;
  const layerAnnotations = (base.findAll?.((n) => (n.annotations ?? []).length > 0) ?? []).slice(0, 50)
    .map((n) => ({ layer: n.name, nodeId: n.id, annotations: n.annotations }));
  if (Object.keys(props).length || anns.length || layerAnnotations.length)
    result[node.name] = { nodeId: node.id, properties: props, annotations: anns, ...(layerAnnotations.length ? { layerAnnotations } : {}) };
}
return JSON.stringify({ _updated: new Date().toISOString(), ...result }, null, 2);
```

### `component-composition.snapshot.json` - Plugin API capture (no token, any plan)

Feeds Gate [16] (Sub-components match Figma). For each component, records the set of OTHER DS components it instantiates. Run in Figma (via `use_figma` / the Plugin console), save as `component-composition.snapshot.json` at project root, and commit it:

```js
const compSetName = (inst) => {
  const mc = inst.mainComponent; if (!mc) return null;
  return (mc.parent && mc.parent.type === 'COMPONENT_SET') ? mc.parent.name : mc.name;
};
const result = {};
const roots = figma.root.findAll(n =>
  n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent?.type !== 'COMPONENT_SET'));
for (const node of roots) {
  const nested = new Set();
  for (const inst of node.findAllWithCriteria({ types: ['INSTANCE'] })) {
    const name = compSetName(inst);
    if (name && name !== node.name) nested.add(name);
  }
  if (nested.size) result[node.name] = [...nested].sort();
}
return JSON.stringify({ _updated: new Date().toISOString(), ...result }, null, 2);
```

### `figma-templates.snapshot.json` - auto-captured in Phase 1 (REST `/nodes`, any plan)

Feeds Gate [17] (Templates compose the right components). For each frame listed in `ds-config.json → templates[]`, records the ordered top-level DS component instances it composes - `{ templates: { "Consult": { name, nodeId, components: ["Filters", "SidePanel"] } } }`. Captured automatically by `refreshTemplateComposition` in `audit.mjs` whenever `FIGMA_TOKEN` + `templates[]` are set (walks each frame, records INSTANCE/COMPONENT names in document order, does **not** descend into an instance's internals). Auto-generated - do not edit by hand; the gate is inert (PASS) until it exists.

### `figma-icons.snapshot.json` - Plugin API capture (no token, any plan)

Feeds Gate [20] (Icons)'s inventory part. The DS icon set often lives in a **separate library file** with its own structure, so run this **inside that icon library file** (via `use_figma` / the Plugin console), save as `figma-icons.snapshot.json` at project root, and commit it. Adjust the page filter and the name derivation to that file's convention:

```js
const ICON_PAGE = null;          // e.g. 'Icons' to limit to one page, or null for all
const STRIP_PREFIX = '';         // e.g. 'Icon/' if names are 'Icon/arrow-left'
const NAME_FROM_LAST = false;    // true to keep only the last '/'-segment of the name
const icons = new Set();
for (const node of figma.root.findAll(n => n.type === 'COMPONENT' || n.type === 'COMPONENT_SET')) {
  if (ICON_PAGE) { let p = node; while (p && p.type !== 'PAGE') p = p.parent; if (!p || p.name !== ICON_PAGE) continue; }
  let name = node.name;
  if (STRIP_PREFIX && name.startsWith(STRIP_PREFIX)) name = name.slice(STRIP_PREFIX.length);
  if (NAME_FROM_LAST && name.includes('/')) name = name.split('/').pop();
  name = name.trim();
  if (name) icons.add(name);
}
return JSON.stringify({ _updated: new Date().toISOString(), icons: [...icons].sort() }, null, 2);
```

With a token instead, set `ds-config.json → iconLibraryFileKey` (and optional `icons: { page, namePrefix, nameFrom: 'last' }`) and the audit refreshes this file automatically from the library's `/components` on any plan.

### CONTRACT.annotations schema

```js
// in structure-contract.mjs
someComponent: {
  annotations: {
    // Selector existence - just verifies the rule exists
    'Another annotation label': 'css-selector',

    // Property assertion - verifies a specific property uses the right token
    'Background must match surface': { sel: '.myComp', prop: 'background', expectedVar: '--area-bg' },

    // Exact value assertion
    'Must be transparent': { sel: '.myComp::after', prop: 'content', expected: 'none' },

    // Prose-only - acknowledged, nothing to verify in CSS
    'Accessibility note': null,
  },
  propertyMap: { /* ... */ },
},
```

- **`'css-selector'`** - selector must exist in the compiled CSS. Minimum check - only use when existence alone is enough.
- **`{ sel, prop, expectedVar }`** - verifies that `sel`'s `prop` uses `var(--expectedVar[, fallback])`. Use this for token-driven properties like `background`, `color`, `gap`. Catches wrong token even if the selector exists.
- **`{ sel, prop, expected }`** - verifies an exact CSS value (e.g. `'none'`, `'transparent'`). Use for non-token assertions.
- **`null`** - prose-only guidance (e.g. accessibility notes, copy constraints). Acknowledged but no CSS required.

**Prefer `{ sel, prop, expectedVar }` over a plain selector** whenever the annotation specifies a visual property - it's the only form that would have caught `background: var(--bg)` being wrong while `.sectionHeader` still existed.

### Reading annotations correctly

Annotations describe design intent, not CSS mechanics. Read them for what they require the code to guarantee:

| Annotation says | Correct CSS | Wrong CSS |
|---|---|---|
| "inherit from the parent surface / never leave undefined" | `background: var(--surface-token)` - always a defined value | `background: inherit` - resolves to transparent if parent has none |
| "never visible without a label" | show/hide guard class (e.g. `.no-label .label { display: none }`) | omit the element in JS conditionally |
| "matches the containing surface" | use the surface's token var, not a hardcoded color | `background: #1a1a1a` |

**Key rule:** "inherit" in annotation prose means "take on the same value as the surface" - implement with the surface token var, not the CSS `inherit` keyword.

### Workflow when an annotation appears

1. `pnpm design-system-engine` fails: `someComponent: annotation "..." not acknowledged in CONTRACT.annotations`
2. Read the annotation - decide what it requires in code
3. Implement the CSS if needed
4. Add to `CONTRACT.annotations` with the appropriate selector or `null`
5. Re-run `pnpm design-system-engine` - gate must pass before closing

---


## Gate [13] - childFramePadding HTML structure check

When `structure-contract.mjs` has a component entry with `childFramePadding[]`, the CSS padding rule targets a child element (e.g. `.buttonTertiary span`). If the HTML renders bare text without that child element, the padding is silently missing - the CSS rule matches nothing.

**Run this check after every Gate [13] (Structure) pass** (or any time you add a `childFramePadding` entry to the contract):

For each component that has `childFramePadding` entries:
1. Extract the `cssSelector` for each entry (e.g. `.buttonTertiary span` → child tag = `span`, parent class = `buttonTertiary`)
2. Grep every file in `ds-config.json → paths.pluginCSS` for the parent class
3. For every match that is a **text-bearing button** (i.e. the button content is visible text, not a pure SVG icon), verify the text is wrapped in the required child element
4. Flag any bare-text instance as ❌ with the file path, line number, and the required fix (wrap text in `<span>...</span>` or whichever element the `cssSelector` requires)

**What counts as "text-bearing":** the button innerHTML contains a text node or interpolated string literal that is not an SVG - e.g. `>Cancel<`, `>${text}<`, `>${label}<`. Icon-only buttons (SVG-only content) do not need the child wrapper.

**Example grep pattern for `.buttonTertiary`:**
```bash
grep -rn "buttonTertiary" apps/ --include="ui.src.html" | grep -v "\.buttonTertiary\b"
```
Then for each matched line, check whether text content is wrapped: `>Cancel<` is ❌, `><span>Cancel</span><` is ✅.

---


## Gate [13] (Structure) - Surface container token enforcement

Verifies that every surface container in `SURFACE_CONTAINERS` declares `--area-bg: var(--bgVar)` in its CSS rule. This ensures components using `var(--area-bg, fallback)` automatically inherit the correct surface color without per-instance wiring.

Add to `structure-contract.mjs`:

```js
export const SURFACE_CONTAINERS = [
  { sel: '.main-panel',   bgVar: '--bg'        },
  { sel: '.detail-panel', bgVar: '--bg-detail'  },
];
```

`structure-check.mjs` Gate [13] (Structure) verifies that each listed selector has `--area-bg: var(--bgVar[...])` in its CSS block. Fails if missing or uses the wrong var.

**When to add an entry:** any time you add a new surface container (a wrapper that gives components a distinct background context).

---


## Gate [13] (Structure) - Button class-base rules

Catches icon-only buttons (and other modifier-class buttons) using the wrong DS base class. The classic failure: a ghost icon button that should be `.buttonGhost` is coded as `.buttonTertiary.buttonCompact`, giving it a visible border on hover.

**How it works:** Gate [13] (Structure) scans every plugin HTML source file for `<button>` elements whose class list includes a _modifier class_ defined in `BUTTON_CLASS_RULES`. For each match, it checks that at least one of the `allowedBases` classes is also present. If not, it fails with the file path and full class string.

```js
// structure-contract.mjs
export const BUTTON_CLASS_RULES = [
  // modifier: class that triggers the check
  // allowedBases: at least one must appear on the same <button>
  { modifier: 'buttonCompact', allowedBases: ['buttonGhost'] },
];
```

**When to add an entry:** any time you introduce a modifier class that must only combine with specific base DS component classes. The gate is project-agnostic - `BUTTON_CLASS_RULES` in the consuming project's `structure-contract.mjs` drives the check.

---


## Gate [13] (Structure) - Inverse annotation check (WARN)

In addition to the Figma→Contract direction (annotation must be acknowledged), Gate [13] (Structure) also warns in the **Contract→Figma** direction: if a `propertyMap` entry maps a CSS selector but no Figma annotation covers that property name, a `⚠️ WARN` is emitted.

This is a warning, not a failure - it does not block the audit. Its purpose: surface documentation gaps and create pressure to add Figma annotations for behavioral CSS you've already implemented.

**To silence a warn:** add a Figma annotation to the component set explaining why the behavior exists.

---


## Gate [20] - Icons match Figma (SVG symbol audit)

Every `<symbol>` element in any plugin HTML file must be declared in `ICON_SYMBOLS` in `structure-contract.mjs`. Undocumented symbols fail the gate.

**DS icons** must record the Figma node ID so the path is traceable back to source. Always fetch the path from Figma via MCP (`get_design_context` + `curl` the asset URL) - never hand-draw.

**Plugin-specific icons** must be marked `PLUGIN-SPECIFIC` with a description of their visual purpose.

```js
// structure-contract.mjs
export const ICON_SYMBOLS = {
  // DS icon - string form (no transform required)
  'icon-close': 'DS ICON - Icon/Close node 123-456; X mark',

  // DS icon - fill-based with transform + size + strokeNone guard
  'icon-fit':  { desc: 'DS ICON - Icon/Fit node 149-101965; four outward-pointing arrows', transform: 'rotate(-45 7.081 7.081)', size: 16, strokeNone: true },
  // DS icon - stroke-based with size + strokeBased guard
  'icon-info': { desc: 'DS ICON - Icon/Info node 67-46370; stroke circle with "i" mark', size: 12, strokeBased: true },

  // Plugin-specific - custom icon with no DS backing
  'icon-type-text': 'PLUGIN-SPECIFIC - Figma "T" text node type indicator; issue list',
};
```

### Icon-slot container sizes (`iconCheck.iconSlotSelectors`)

The `<svg>` render size is only half the story: the div that wraps an icon has its own
fixed `width`/`height`, and if that box is off-grid it constrains the icon no matter what
the svg says - a 14px slot held a 16px glyph overflowing while 12px ones looked undersized,
and the render-size scan never saw it because it's a CSS rule, not an svg attribute. List
the slot selectors in `iconCheck.iconSlotSelectors`; `OFF-GRID SLOT` checks each rule's
`width`/`height` against the same derived grid, and also fails a selector that matches no
CSS rule (so the list can't silently rot). Same grid as the render-size check - no second
source of truth.

### Dead icons - defined but never rendered

A `<symbol>` that nothing references still has to be kept in sync with the DS forever,
and it hides the fact that a feature was removed. `DEAD ICON` fails any documented symbol
whose id appears nowhere in the reference corpus (scanned HTML/JS, plus
`iconCheck.usageSources`) outside its own definition - no `<use href>`, no lookup table,
no JS string.

Ids built by concatenation are handled: a concrete prefix like `'#icon-arrow-' + dir`
exempts the `icon-arrow-*` family (reported as a note, never failed), because those
literals never appear whole. A bare `'#' + variable` is deliberately *not* treated as
dynamic - it would exempt everything and mask every dead icon; in practice its values
come from a lookup whose literal ids are in source anyway. Genuine exceptions go in
`iconCheck.deadIconExemptions` with a note.

This is a cleanup routine, not just a guard: on its first run against a real project it
found three symbols (`icon-scan`, `icon-arrow-down`, `icon-star`) that no built plugin
rendered - including two that had just been faithfully wired to the DS. An icon audit
that only checks fidelity to Figma will happily verify an icon nothing uses.

### Every DS entry must be in the snapshot

A `DS ICON` entry that names a `nodeId` but has no `figma-icons.snapshot.json` entry is
compared against nothing - no path check, no viewBox check - while still printing as a
verified DS icon in the report. That is the same failure shape as a fresh-but-empty
snapshot: invisible precisely because it looks fine.

`NOT SNAPSHOTTED` fails those entries. Phase 1 must export every DS icon so the snapshot
carries `name`, `viewBox` and `paths` for each.

### Path comparison tolerates render noise

Figma re-renders SVG exports on demand, and the coordinates it emits differ in the last
decimal places between renders of an unchanged component (`2.15065` one minute,
`2.15072` the next). Exact string comparison therefore reports "changed in Figma" for
sub-micron noise - and a gate that cries wolf is a gate people stop reading.

Path comparison matches the command sequence exactly and the numbers within
`iconCheck.pathTolerance` (default `0.01`, far below one device pixel at any icon size).
A genuine edit moves geometry by orders of magnitude more, and any change to the command
sequence or token count still fails outright.

### On-grid render sizes (`iconCheck.enforceIconSizes`)

A DS ships icons at a fixed set of frame sizes; rendering one off-grid upscales or crams
it. The allowed set is **not hardcoded** - it is derived as the union of every DS icon's
own frame size, read from the snapshot viewBox ("0 0 16 16" → 16) captured during the
Figma scan. Add a 24px icon to the DS and 24 is allowed automatically; nothing to edit.

Enable with `iconCheck.enforceIconSizes: true`. `OFF-GRID SIZE` then fails any DS-icon
render size outside the derived set, covering static `<svg …><use href="#id">`
(width/height anywhere in the tag) and lookup tables `href: '#id', size: N`. CSS-only
sizes are not policed; dynamically-built sizes (`'<svg width="' + n`) are invisible to the
static scan - keep the builder on-grid by construction. `iconCheck.allowedSizes` can pin
an explicit set, but derivation is the default and the point.

### Exact-name mode (`iconCheck.exactName`)

By default the gate accepts any faithful suffix of a namespaced DS name - `Icon/var/color`
passes as `#icon-color` or `#icon-var-color`. When a project sets
`iconCheck.exactName: true`, the sprite id must be the **exact** full Figma component
name (kebab-cased, `Icon-` → `icon-`), with no short forms. `Icon-object-text` must be
`#icon-object-text`, never `#icon-text`. Use this when the DS carries one canonical name
per icon and you never want a component silently aliased behind a shorter id. Deliberate
exceptions - one component reused at two sizes for two roles - still declare
`idDiffersFromDsName`.

### One sprite sheet - no per-plugin symbols

Once `paths.sharedIconSources` is configured, that declares the intent to keep a single
icon sheet, and any `<symbol>` defined inside an individual plugin file fails as
**`PER-PLUGIN SYMBOL`**. A plugin-local icon can't be reused, a DS update fixes only
that one copy, and when the id also exists in the shared sheet the two silently drift -
which one renders comes down to document order.

Opt out per icon with `iconCheck.perPluginSymbolExemptions: ['icon-x']`, or entirely
with `iconCheck.allowPerPluginSymbols: true`.

### The sprite id must derive from the DS component name

A DS entry's sprite id is checked against the name of the Figma component it claims to
come from. `"Icon/Fit"` must be `#icon-fit`; `"Icon/arrowRight"` must be
`#icon-arrow-right`. The derivation is mechanical - last path segment, variant
assignments (`size=small`) dropped, camelCase to kebab, prefixed with `icon-`
(override via `iconCheck.spriteIdPrefix` in `ds-config.json`).

Name authority, in order: the `name` field in `figma-icons.snapshot.json` (captured
from Figma, so it tracks renames automatically) → a declared `dsName` → the name
parsed out of `desc`. **Phase 1 must record `name` alongside `nodeId` when capturing
icons** - without it the check falls back to human-typed prose, which is exactly what
drifts.

This closes the rename class of miss. Path and viewBox checks only compare an icon
against the node its entry names, so they stay green when the entry names the wrong
node - the code ships one icon while the contract documents another.

Four failures come out of this:

- **`SPRITE ID ≠ DS NAME`** - the id and the component have drifted. Rename the sprite,
  repoint the entry, or declare the difference with
  `idDiffersFromDsName: '<reason>'`.
- **`DS NAME UNKNOWN`** - no name from any source, so the id is verified against
  nothing. Add `dsName`. (A check that silently checks zero things is the worse bug.)
- **`STALE DS NAME`** - a declared `dsName` contradicts the snapshot: renamed in Figma.
- **`STALE WAIVER`** - an `idDiffersFromDsName` whose id now matches anyway. Remove it,
  so a future real divergence still fails.

Plus **`ORPHANED DS ENTRY`** - a DS entry whose key matches no `<symbol>` anywhere.
That is usually the surviving half of a rename: the old key keeps "documenting" an
icon that no longer ships while the renamed sprite reads as undocumented.

**Never auto-generate `idDiffersFromDsName`.** It records a human's reason for a
deliberate divergence. Deriving it from whatever the code currently does turns the
gate into a rubber stamp - it would quietly bless a wrong icon instead of surfacing
it. Transcribing a reason already written down in `desc` is fine; inventing one is
not.

**Object form:** use `{ desc, dsName?, idDiffersFromDsName?, transform?, size?, strokeNone?, strokeBased? }` for DS icons that require additional checks:

- **`transform`** - when the Figma component wraps the SVG path in a rotation (visible as `-rotate-X` in the Figma component code). The gate verifies a `<g transform="...">` with that exact value is present inside the `<symbol>`. Prevents correct path + wrong orientation.
- **`size`** - the DS-specified icon container size in pixels (e.g. `16`). The gate finds every `<svg width="N" height="N"><use href="#id">` in HTML files and verifies `N === size`. Catches icons rendered at the wrong pixel dimensions.
- **`strokeNone: true`** - for fill-only DS icons that appear inside contexts with broad CSS stroke rules (e.g. `.buttonTertiary svg { stroke: var(--buttonTertiary-text) }`). The gate verifies the symbol body contains `stroke="none"` on a shape element. Without this, the CSS-inherited stroke adds unintended visual weight, making the icon appears thicker in button contexts than in other contexts (overlay labels, etc.).
- **`strokeBased: true`** - for stroke-only DS icons (circle outlines, line icons). The gate verifies the `<symbol>` tag itself has `fill="none"`. Without this, replacing the stroke icon with a fill-based SVG would pass all size and color checks while looking completely different (hollow circle vs filled circle). Use this for any DS icon whose Figma BOOLEAN_OPERATION or path uses stroke rendering, not fill.

- **`dsName`** - the DS component's exact Figma name, when the snapshot has no `name`
  for it or the `desc` prose does not carry it in `<name> node <id>` form.
- **`idDiffersFromDsName`** - a written reason why this sprite id deliberately does not
  derive from the DS component name (e.g. two sprites drawn from one component at
  different sizes). Required for any intentional divergence; never generated.

**When the gate fails:**
- Undocumented symbol → fetch from Figma, add contract entry
- Sprite id ≠ DS name → rename the sprite, repoint the entry, or declare the waiver
- Missing transform → wrap `<path>` in `<g transform="...">` matching the contract value
- Wrong render size → update the `<svg width="N" height="N">` wrapping `<use href="#id">` to match the contract `size`
- Missing stroke guard → add `stroke="none"` to the `<path>` inside the symbol
- Not stroke-based → add `fill="none"` to the `<symbol ...>` opening tag and use stroke rendering

**Every new implementation edge case must add a gate check** - fix the code AND extend the contract/gate so the same mistake cannot recur silently.

**Never add a `DS ICON` entry without verifying the path came from Figma** - that would defeat the purpose of the gate.
