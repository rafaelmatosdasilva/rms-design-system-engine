# Check the whole design system

**Use when.** the person asks for the parity of the whole design system ("run the parity", "full audit").

## Steps

1. Refresh the Figma data first when a refresh path exists (`--recipe refresh-figma`); otherwise say which snapshots were used.
2. Run `rms-design-system-engine`.
3. Relay the SUMMARY; the phases below say what each part of the run covers.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference gates`: the gate-specific rules
- `rms-design-system-engine --reference usage`: every option

```recipe-check
rms-design-system-engine
```

---


## How to Execute

| Phase | Step | Purpose | Must pass |
|---|---|---|---|
| **1** | **Figma Refresh** | **Query live Figma, diff snapshots, overwrite both files, verify resolvers** | **Snapshots fresh; every change reconciled** |
| **2** | **`rms-design-system-engine`** | **All 25 gates - snapshot auto-refreshed; bound tokens from REST or committed snapshot** | **0 ❌ gates** |
| 2 | Component walk | Deep per-component inspection of all states, vars, tokens | 0 new divergences |
| 2 | Master Token Table | Single source of truth with resolved hex for every token | 0 ❌ rows |

---

# PHASE 2 - Code Parity

---


## Phase 2 - Bound token walk

`bound-tokens.json` is a **committed snapshot** - works on any Figma plan, no token, including CI. It needs no special plan access: capture it once (either way below), commit it, and everyone runs against it with nothing installed.

### Standard: Plugin API capture (any plan, no token)

This is the universal path. Run it in Figma (via `use_figma` or the Plugin console), save the output as `bound-tokens.json`, and commit it:

```js
const collections = await figma.variables.getLocalVariableCollectionsAsync();
const idToName = {};
for (const col of collections) {
  for (const id of col.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) idToName[id] = v.name;
  }
}
function collectBound(node, out) {
  if (!node) return;
  const bv = node.boundVariables ?? {};
  for (const val of Object.values(bv)) {
    const entries = Array.isArray(val) ? val : [val];
    for (const e of entries) {
      if (e?.type === 'VARIABLE_ALIAS' && idToName[e.id]) out.add(idToName[e.id]);
    }
  }
  for (const child of node.children ?? []) collectBound(child, out);
}
// Frame node IDs from ds-config.json frames[]
const FRAME_IDS = ['308-10425', '42-210732', '106-36547']; // update per project
const tokenSet = new Set();
const missing = [];
for (const raw of FRAME_IDS) {
  // ds-config stores URL-style ids ("308-10425"); the Plugin API only resolves the
  // colon form ("308:10425") and returns null - not an error - for the dashed one.
  // Without this replace the walk finds nothing and writes an EMPTY snapshot that
  // still looks fresh, which is exactly the failure Gate [1] (Data is up to date)'s empty-check exists for.
  const node = await figma.getNodeByIdAsync(raw.replace(/-/g, ':'));
  if (node) collectBound(node, tokenSet); else missing.push(raw);
}
// Fail loudly rather than writing an empty file that reads as a successful capture.
if (missing.length) throw new Error('frames not found: ' + missing.join(', '));
if (tokenSet.size === 0) throw new Error('walk found 0 bound tokens - refusing to write an empty snapshot');
return { _updated: new Date().toISOString(), ...Object.fromEntries([...tokenSet].map(t => [t, true])) };
```

> **Node ids: dashed vs colon.** Every `getNodeByIdAsync` call in these captures must
> normalise `-` to `:`. Figma URLs and `ds-config.json` use the dashed form; the Plugin
> API accepts only the colon form and answers `null` for anything else. Because `null`
> is indistinguishable from "node deleted", a dashed id degrades silently into an empty
> capture instead of an error. Normalise at the call site and throw when a configured
> frame does not resolve.

Save the returned JSON as `bound-tokens.json` at project root and commit it. The `_updated` stamp lets Gate [1] (Data is up to date) track the file's freshness - a stamp ≤24h old keeps Gate [4] (Tokens used in screens exist in CSS) fully green on any plan. Run this whenever DS frames change significantly.

### Optional convenience: auto-refresh with a token

This file is produced by the Phase 1 Plugin API walk (works on any plan, no special access) and committed; `audit.mjs` reads it as-is. **No token and no special plan access are ever required.**

**If `bound-tokens.json` is missing entirely:** Gate [4] (Tokens used in screens exist in CSS) hard-fails. Generate it via the plugin capture above (any plan, no token).

---


## Phase 2 - Step 2: Run all 25 audit gates

```bash
rms-design-system-engine
```

All 25 gates must pass. Gate [1] (Data is up to date) is ✅ right after a live Phase 1 refresh; when the refresh was skipped (no token / COMPONENT_SET / MCP not authorised) it reports the snapshot's age as an advisory instead - that is expected, not a failure.

Gates are grouped by theme. Within a group, earlier gates are prerequisites for later ones.

| Gate | Script | Group | What it checks |
|---|---|---|---|
| [1] | inline | **Up to date** | **Data is up to date** - Snapshot files pulled today and compiled outputs not older than source. Also fails any snapshot that is **fresh but empty**: a capture that returns nothing writes a file holding only its `_updated` stamp, which makes its consuming gate a silent no-op while the audit still reports green. Age alone cannot see that, so the entry count is checked too. **Component inventory** - the live DS component list (every `COMPONENT_SET`/`COMPONENT` on the components page, via `/nodes?ids={componentsPage}&depth=1` - works on any plan and, unlike `/component_sets`, sees unpublished components) is diffed against the structure snapshot's keys, so a component **added** to the DS (a brand-new `loader`) or **removed** always surfaces **by name** and fails the gate. This closes the blind spot where a token-value diff can't see a whole new component the snapshot never listed - the change most likely to ship unaudited. Genuinely-unused DS components go in `knownUnimplementedComponents` (the same exemption Gate [25] (What this audit actually checked) uses); set `figma.componentsPage` in `ds-config.json` to the DS components page node id to enable it. **File version drift (advisory, never a hard fail)** - both the vars and structure snapshots carry a `_figmaVersion`. Figma versions the **whole file**, so any edit anywhere (an unrelated component, a comment, a moved frame) bumps it - a mismatch does **not** mean the audited component changed. It is therefore surfaced as a `⚠️` advisory suggesting a Phase 1 re-run if the change touched audited components, and does not fail the gate. Real drift is still hard-failed elsewhere: the component inventory here (added/removed components), and the value/structure/icon gates that compare the snapshot against the code directly. Always ✅ after Phase 1 runs. |
| [2] | `visual-regression-check.mjs` | **Up to date** | **Figma frame unchanged** - the live Figma frame screenshot matches the stored reference. Skips if `FIGMA_TOKEN` isn't set or no frames are configured. |
| [3] | `parity-check.mjs` | **Tokens** | **Token values match Figma** - Every token across every mode matches Figma. NEW SKIP = token in Figma but no CSS var yet - treat as ❌. `⏳ PENDING FIGMA SYNC` when code matches the upstream DS source but the primary snapshot has a newer value (not a code bug). |
| [4] | `bound-check.mjs` | **Tokens** | **Tokens used in screens exist in CSS** - Every token actively used in the Figma frames has a CSS variable. Runs at full strength on any plan against `bound-tokens.json`; staleness of that file surfaces in Gate [1] (Data is up to date), not here. |
| [5] | `mode-completeness-check.mjs` | **Tokens** | **Every mode is covered** - Every token meant to vary between modes actually does - light vs dark, compact vs comfortable, any DS mode. Nothing frozen at the same value where modes should differ. |
| [6] | `exemption-check.mjs` | **Tokens** | **Exception lists are valid** - Tokens marked as "skip this" are cross-checked against the snapshot. Stale exemptions (token renamed or removed) are flagged. |
| [7] | `naming-check.mjs` | **Tokens** | **No invented CSS variables** - Every CSS variable name traces back to a real Figma token. Catches invented variables with no DS counterpart. |
| [8] | `docs-truth-check.mjs` | **Docs integrity** | **Docs tell the truth** - A documentation surface (a living styleguide or any DS doc) must reference **only DS things that exist** - never invented or stale tokens, and reuse DS icons rather than hand-drawing them. Verifies (1) every `var(--x)` used in the doc is declared somewhere real (the canonical `theme.css`/`pluginCSS`, or the doc's own `:root`/chrome vars - a self-contained doc that inlines the theme still gets caught when it references a var declared *nowhere*, e.g. a `--radius-sm` chip); (2) every DS token path shown as a label (`radii/… gap/… padding/… typography/… general/…`) is a real key in the vars/sizing snapshot (an invented `radii/whatever` fails); and (3) every icon `<use href="#id">` resolves to a `<symbol id="id">` defined in the doc's own DS icon sheet or the `pluginCSS`/HTML surfaces (a dangling/typo'd icon id fails). It also enforces the DS **construction rules** for the doc's own CSS: (4) **no all-caps** — `text-transform: uppercase` is invented styling (the DS has none) → fails; (5) **colours are variables** — a colour literal (`#hex`/`rgb()`/`hsl()`) as the value of a visual property in a rule is a hardcoded colour → fails (a `--token: #hex` *declaration* is the variable, so it never trips). And it **advises** (never fails) on: an inline `<svg>` that draws its own icon (a `<path>`/`<circle>`/… outside a `<symbol>`) instead of `<use>`-ing a DS one; and a hardcoded `font-size` in a rule (prefer the DS text-scale vars `--s/m/l-size` — advisory because a doc legitimately needs a few display heading sizes the 3-tier component scale doesn't provide). Comments (`/* … */`, `<!-- … -->`) are stripped before the usage scan, so prose *about* the DS never counts as a reference. Opt-in and generic: runs only when `ds-config.json → docs: { surfaces: ["apps/styleguide/index.html", …] }` is set; a no-op PASS otherwise. Completeness ("the DS has 8 radii, the doc shows 5") and non-token claims (a fake text style) are out of scope here - the design-intent GENERATOR (`--docs`) is the upstream cure, deriving the doc from canonical sources so invention is impossible. **Hard rule for construction: when you build a doc/styleguide, never use a component, icon, text style, token or var the system doesn't have, and never invent - reuse the DS.** |
| [9] | `case-check.mjs` | **Docs integrity** | **No invented text casing** - Figma text styles carry no forced casing, so a `text-transform: uppercase | lowercase | capitalize` in the token/component CSS (`paths.themeCSS` + `paths.pluginCSS`) is invented styling that drifts from Figma - the same "no all-caps" rule the docs-truth gate applies to a styleguide, applied to the DS CSS itself. Caught a real case: a `.group-label` "uppercase group heading" that had no Figma text style behind it and had spread into two plugins. A DS that genuinely defines an upper/lower/title text style (Figma `textCase`) exempts it via `ds-config.json → knownTextTransforms` (the casing word, or a `"<file>:<line>"`). |
| [10] | `reimplementation-check.mjs` | **Docs integrity** | **No hand-built DS components** - A screen that **re-builds** a DS component by hand instead of using it ("não uses HTML/CSS local para simular componentes"). Two parts. **(a) Figma screens to code**: every DS component a product screen uses in Figma (`figma-screen-components.snapshot.json`, Phase 1 Step 1e) must be used by that product's code, as a class attribute, `className` or `classList` (a CSS rule or a comment is not a use). A screen component the code never uses **fails** (the stepper drawn as `buttonStepper` in Figma and hand-built in code); `screenComponentsStrict: false` makes it advice, `knownReimplementations: ["<plugin>/<component>"]` excuses one. A component the DS has not built yet (`knownUnimplementedComponents`) is said on a `⏭` line as not checked, since no product can use it until the DS builds it. **(b) Look-alikes**: an interactive element of a role the DS owns (`reimplementationRoles`, default `["button", "input"]`) that does not carry the DS class for it yet is locally styled to reconstruct it (`background`/`border`/`border-radius`/`padding` from a local class rule, an id rule or an inline `style`). A part the theme styles inside a component (`.field .field-icon`) and the theme's own rules never count. It scans `reimplementationSurfaces[]`, else the products' own UI files. **Advisory** by default, a hard fail under `reimplementationStrict: true`; exempt via `knownReimplementations` (`["ui.html#.save-btn"]`). A part that cannot run (no code to scan, screens not captured) says so on a ⏭ line, and the summary lists it under Not checked; with neither part able to run the gate is not run. |
| [11] | inline · `container-containment-check.mjs` | **Clean CSS** | **Clean CSS** - No declared-but-orphaned CSS vars (unused weight), no **undeclared var() usages** (a fallback-less `var(--x)` whose `--x` is declared nowhere - the signature of a renamed/deleted token still referenced; declarations are matched in CSS and JS `setProperty`, and usages with an explicit fallback are treated as self-documenting and skipped), and raw literal values in CSS rules (hardcoded hex, px, etc.) that **contradict Figma** - a literal is flagged only when the component that rule belongs to has no matching value in Figma (see Hard Rule 5). Scoping is **per component** via `component-values.snapshot.json` (a full raw-value sweep of every node of each component); a file is attributed to the component whose base selector it contains, and a literal equal to a value that component uses in Figma is parity and passes (`ℹ️ … parity OK, not failed [Component]`). Falls back to a global value set when the sweep snapshot is absent or a file maps to no component. `100vw` is never suppressed. A length in an `outline` / `outline-offset` of a `:focus`, `:focus-visible` or `:focus-within` rule (a focus ring) with no Figma match is listed apart (`ℹ️ … focus ring literal(s) set apart`), never failed: Figma draws no outline to compare it with; a hex colour in that ring is still checked. Also scans for hand-drawn icons: a `data:image/svg+xml` CSS `background-image` with a literal or `%23`-encoded color is a hand-drawn icon bypassing the DS icon sprite (`<use href="#icon-X">`) and its `currentColor`/`var()` token binding - invisible to Gates [18]/[19] since it's a CSS string, not DOM markup. Intentional exceptions go in `ds-config.json → knownHardcodedExceptions`. Literals written inside a `/* … */` block comment are ignored: the scanner resolves real comment state from the file rather than per grep line, so prose in a multi-line comment (`#ffffff light, #171717 dark`) is not mistaken for a declaration - a single-line `/* … */` strip cannot see interior lines. **Test files are excluded from the hardcoded-value scan** (`*.test.*`, `*.spec.*`, and `test/` / `__tests__/` / `__mocks__/` / `e2e/` dirs): assertions and fixtures legitimately contain literal hexes, colour codes, and regex patterns (e.g. `/PANTONE#20485#20C/`) that are not CSS and must not read as stray hardcoded colours. The exclusion applies to the hardcoded scan only, not the var-usage scan. Also - **safe size containment** (`container-containment-check.mjs`): a selector that sets `container-type: inline-size` (or `size`) on a shrink-to-fit element (`display:inline-*`) with no definite inline size is flagged. Inline-size containment removes the element's content-driven width, so a hugging box collapses and any `@container` label-shrink (`max-width:0`) latches permanently - the control renders its icons but not its labels, while every token/structure gate stays green because nothing about the tokens is wrong (the DS segmented-control bug where `container-type` sat on the auto-width `button` instead of the `.full-width` variant that has a definite `flex:1 1 0` basis). A definite `width`/`inline-size`/`flex-basis`/`flex:1 1 0`, or a block-level `display`, clears it; exempt a deliberate case via `ds-config.json → knownContainerTypeExceptions`. |
| [12] | `subcomponent-isolation-check.mjs` | **Clean CSS** | **Nested components keep their styles** - Two checks: (a) parent component styles don't bleed into nested DS sub-components (broad `.class element` rules must be in `ALLOWED_BROAD_RULES`); (b) **plugin overrides of DS base classes** - any plugin-file rule that targets a class with a standalone base rule in theme CSS AND sets identity properties (color, background, border, padding, gap, height, font, opacity, shadow) must be documented in `PLUGIN_DS_OVERRIDES` (structure-contract.mjs) with the reason it cannot live in the base. Layout-only rules (width, margin, position, flex) pass freely. |
| [13] | `structure-check.mjs` | **Structure** | **Structure matches Figma** - Height, spacing, font, and radius all point to the right design tokens - no hardcodes, no gaps. Also enforces `childFramePadding` HTML structure: text-bearing buttons must wrap text in the required child element (e.g. `<span>`) so CSS padding applies. |
| [14] | `state-check.mjs` `state-binding-check.mjs` `component-selector-check.mjs` `state-opacity-check.mjs` | **Structure** | **All states are built** - Four checks in one: (a) all Figma component states have tokens in code (`state-check`); (b) every `CONTRACT.propertyMap` state selector exists in CSS (`state-binding-check`); (c) state-suffix vars (`-hover`, `-selected`, `-disabled`, `-focus`, `-checked`) only appear inside selectors with a matching state indicator (`component-selector-check`); (d) **per-state opacity** - when the structure snapshot captures `components[Comp].variantOpacity = { disabled: 0.4 }` (or `disabledOpacity`), the CSS rule for that state (`.comp:disabled`, `.disabled`, `[disabled]`, …) must use that exact opacity (`state-opacity-check`); inert until the value is captured, so it never false-positives. Intentional exceptions go in `ds-config.json → knownStateExemptions`. |
| [15] | `component-prop-check.mjs` | **Structure** | **Component props match Figma** - Compares each Figma component's property NAMES (from `figma-component-props.snapshot.json`) against the code component's declared props, read straight from the source so it never depends on Figma Code Connect. Supports Vue (`defineProps` / `props` option) and React (Props type / destructured params / `propTypes`); add more via `PROP_EXTRACTORS`. A Figma property pairs with the code prop of the same name (letter case and separators aside) or a documented alias; with neither it is a **MISSING** fail, and a paired name not written exactly the same (`Size` and `size`, `Show Label` and `showLabel`) is a **NAME** fail that shows the letters that differ (`letter case S → s`); a Figma component with properties but no resolvable code file is a **NO FILE** fail (no silent skips: map it in `ds-config.json → componentFiles`, or exempt via `knownUnimplementedComponents`). Real renames are documented in `ds-config.json → componentPropAliases` (`{ "buttonPrimary": { "size": "buttonSize" } }`) and count as matches; likely renames are surfaced as advisory suggestions. Extra code props with no Figma property are advisory; event handlers (`onClick`) and pass-through props (`children`, `className`, `style`, `ref`, `key`, `id`, `aria-*`, `data-*`) are never listed. A name recorded in `contract.authored.json` bindings or `componentPropAliases` is the agreed one, letter case included. **Role**: a component whose Figma annotation states a role (`Role: togglebutton`) must hold that role's markup in its own file (a `<button>` with `aria-pressed` for a toggle), read without a browser; a root that is the system's own component is left to the browser check; a miss is a **ROLE** fail. **Beyond names, it checks values**: for a matched prop it compares the Figma `defaultValue` against the code default (Vue `withDefaults`/`default:`, React default params/`defaultProps`) and, for `VARIANT` properties, verifies the code accepts every Figma variant option (from a TS string-literal union) - so a wrong default or an unimplemented variant (`large` missing) is a **VALUE** fail. Value checks only fire when the code side is readable, so parsing gaps never produce false positives. **Slots**: a Figma `INSTANCE_SWAP` property is a slot, not a value prop, so it is matched against a code **slot** (Vue `<slot>`/`defineSlots`, React `children`/`ReactNode`) rather than a prop of that name - a Figma slot with no code slot is a **SLOT** fail, and a slot paired by a name not written exactly as the Figma property (`Leading Icon` and `leadingIcon`) is a **NAME** fail too. **The Figma `State` axis is skipped here** - a `State` variant (hover/focus/active/…) maps to CSS pseudo-classes, not a code prop, so it belongs to Gate [14] (All states are built); Gate [15] (Component props match Figma) would otherwise wrongly flag a missing `state` prop. It skips a property named `state`/`states` or any VARIANT whose options are all interaction states (override via `ds-config.json → knownStateProps`). Boolean state props like `disabled`/`selected` remain real props and are checked. The snapshot is required (missing ⇒ exit 2, "not run") and should be committed; capture it with no token via the plugin (see Gate [13] (Structure)). |
| [16] | `component-composition-check.mjs` | **Structure** | **Sub-components match Figma** - A DS component contains other DS components (a Card holds a Badge, a Button an Icon). This verifies the set of sub-components Figma nests inside a component equals the set the code uses. Reads `component-composition.snapshot.json` (`{ "Card": ["Badge"] }`, committed, captured with no token via the plugin) and detects a sub-component in code by its base selector or its name as a JSX tag / import - so it never depends on Code Connect. A Figma-nested sub-component the code doesn't use is a **MISSING** fail; a component with nested children but no resolvable code file is a **NO FILE** fail (map it in `ds-config.json → componentFiles`). Code using a component Figma doesn't nest is advisory. Exempt a pair via `ds-config.json → knownCompositionExceptions` (`["Card/Badge"]`) or a whole component via `knownUnimplementedComponents`. |
| [17] | `template-composition-check.mjs` | **Structure** | **Templates compose the right components** - One level ABOVE the sub-component gate. A DS *template* / *page* frame (a Consult view, an Operation screen) composes several DS components; a designer re-composes that frame in Figma (adds a Filters bar, swaps a SidePanel for a DetailFullPage) and no component-level gate notices. This verifies each registered template frame's code uses the components Figma composes. **Opt-in and generic**, exactly like `screens[]`/`docs.surfaces`: runs only when `ds-config.json → templates[]` is set (`[{ "name": "Consult", "nodeId": "12:345", "file"?: "src/…/Consult.vue" }]`); a no-op PASS otherwise, and **inert** (PASS) until `figma-templates.snapshot.json` is captured, so it never false-positives before the first run. Phase 1 (`refreshTemplateComposition`, REST `/nodes`, any plan) records the ordered top-level component instances each template frame composes - WITHOUT descending into an instance's internals (those are the sub-component gate's job). Detection of a component in the template code reuses the sub-component gate's logic (base selector, JSX tag, or import), so it never depends on Code Connect. A composed component the template code doesn't use is **MISSING** (advisory by default; a hard fail under `templateCompositionStrict: true`); a template with composed components but no resolvable code file is a **NO FILE** fail (map it via `templates[].file`); a differing composition **ORDER** is advisory. Exempt a pair via `ds-config.json → knownTemplateExceptions` (`["Consult/Filters"]`) or a whole template via `knownUnimplementedComponents`. Template code is searched under `templateSrcDirs` (falls back to `componentSrcDirs`). |
| [18] | `html-structure-check.mjs` · `screen-element-check.mjs` | **Markup** | **Markup matches** - Two parts. **(a) HTML fingerprint** (`html-structure-check.mjs`): element IDs, DS component classes on interactive elements, icon `<use href>` refs with context, and **button inner structure** (whether each id'd `<button>` has SVG, span children with their classes, and text content). Which classes count as DS component classes is the project's own list, `ds-config.json → htmlStructureClasses`. Without it, the classes the saved snapshot already fingerprints are used (so an existing project keeps its result with no config edit); with neither, element ids and icon references are still fingerprinted and component classes are not. The engine ships no default list. Diffs against stored snapshot; any undeclared structural change is ❌. Accept: `node ~/.claude/skills/rms-design-system-engine/html-structure-check.mjs --accept`. **(b) Screen element completeness** (`screen-element-check.mjs`) - the other gates only compare elements present on BOTH sides, so a whole control the DESIGN has but the CODE never built (an "Export" button, a modal, an extra toggle) shipped unaudited. For every screen in `ds-config.json → screens[]` (detail views / modals, distinct from the whole-plugin `frames[]` visual gate) the DS control inventory is captured into `figma-screens.snapshot.json` (`refreshScreenElements`: each interactive INSTANCE's component + first TEXT label) and each must have a code counterpart **of the same kind**. Kind-aware on purpose: a label appearing as an id, a comment, or a JS identifier (`#export-section`, `requestExport`) is **not** a counterpart - only visible text inside a matching element, or a quoted dynamic/attribute label like `'Run on selection'`, counts. Interactive families only (button, switch, radio, segmented, checkbox, input, modal); decorative components aren't required. A control with no counterpart is **advisory by default** (visible in the report, never blocks a deferred design), a hard fail under `screenElementStrict: true`; deliberate different realizations (e.g. Export built as inline sections) go in `knownScreenElementExemptions` (`["my-app/Export"]`). Beyond presence, two divergences are caught for controls that *are* built: **(i) wrong DS component** (`MISMATCH`) - a button-family control whose label sits on the wrong variant class (the design's `ButtonTertiary` built as `.buttonSecondary`), checked against the exact button-variant class on the `<button>` that encloses the label as visible text (not any button class in a window, so a neighbouring button isn't mistaken for it); **(ii) missing row separators** (`SEP GAP`) - a DS divider / `<hr>` the design places *between* controls (the divider class is `ds-config.json → separatorClasses`, else every captured DS component whose name says divider or separator, the same rule the capture uses), captured as a per-screen `rowSeparators` count in the snapshot (a separator carries no label, so it can only be checked by count) and compared against what the code renders. Both are advisory unless `screenElementStrict`. Inert until the snapshot exists. |
| [19] | `icon-slot-check.mjs` `component-slot-check.mjs` `form-control-check.mjs` | **Markup** | **Required pieces are in place** - Exhaustiveness across three asset types: (a) icon slots - every slot in `ICON_USAGES` uses the exact DS icon specified; every `<button id="X">` with `<use href="#icon-">` must be declared; (b) component slots - every slot in `COMPONENT_USAGES` uses the correct DS component class; every `<button id>` carrying a class that needs a slot declaration must be declared (the classes come from the project: `ds-config.json → declaredComponentClasses`, else every class `COMPONENT_USAGES` already declares); (c) **form controls** (13c) - bespoke form controls use their DS component's tokens (a search field bordered with the divider token instead of the input token stays green under every value gate), AND **native radio/checkbox must not render natively**: a `<input type=radio\|checkbox>` can only be DS-styled by visually SUPPRESSING the native control (opacity:0 / clipped / appearance:none) and drawing a styled sibling - so a native control the CSS never suppresses is rendering with browser chrome instead of the DS component (the bug where a `.radio-input` class carried no hiding rule and the browser drew a native red radio). Generic, no config; exempt a deliberate native control via `ds-config.json → knownNativeControlExceptions`. |
| [20] | `pseudo-element-check.mjs` `icon-check.mjs` `icon-freshness-check.mjs` `icon-inventory-check.mjs` | **Markup** | **Icons match Figma** - Four-part check. **(d) Inventory (Figma → code)**: closes the loop the other way - every icon the DS defines in Figma must have a code symbol. The DS icon set usually lives in a **separate library file** with its own structure, so the inventory is captured from that library into `figma-icons.snapshot.json` (`{ "icons": [...] }`) and each name is matched to a `#<iconSpritePrefix><name>` symbol/reference in the code (normalised, so `Arrow Left` ↔ `icon-arrow-left`). A Figma icon with no code symbol is **MISSING** (a new DS icon shipped unimplemented). Configure `ds-config.json → iconLibraryFileKey` (the icon library file), optional `icons: { page, namePrefix, nameFrom: 'last' }` filters for that file's structure, `iconSpritePrefix` (default `icon-`), and exempt via `knownUnimplementedIcons`. Inert until the snapshot exists, so it never false-positives. Capture: with a token, `refreshIcons` reads the library file's `/components` (any plan); with no token, run the plugin capture in `rms-design-system-engine --reference gates` in the library file. The other three parts: (a) `::before`/`::after` pseudo-elements declared in the structure contract; (b) every SVG `<symbol>` in `ICON_SYMBOLS` - DS icons with Figma node ID, plugin icons marked `PLUGIN-SPECIFIC`, with path data verified against snapshot, and **every DS sprite id derived from its DS component's name** (catches renames and wrong-component entries; deliberate differences need `idDiffersFromDsName`); (c) **live Figma freshness** - for every DS icon with a `nodeId`, fetches the live SVG from Figma REST API and compares path data against the snapshot, AND fetches the node's live **name** (`/nodes?ids=…`) and flags a **rename**. Code references DS icons by their exact Figma name (`#icon-download` ↔ `Icon-download`; the icon-id HARD RULE), so a DS rename that keeps the same nodeId but changes the name (`Icon-download` → `Icon-export`) leaves the code pointing at a stale id - and a rename need not change the geometry, so the path check alone can miss it. The name check is **case-insensitive** (ids are case-normalised, so `Icon-Fit`→`Icon-fit` is not a real drift) and **skips variant-property names** (a live name like `size=small` means the nodeId now resolves into a size-variant set, not a rename - the set name is unchanged). Requires `FIGMA_TOKEN`; part (c) skips if not set. |
| [21] | `transition-check.mjs` | **Animation** | **Transitions match** - Every selector in `TRANSITION_CONTRACT` (structure-contract.mjs) must have a CSS `transition:` declaration containing each documented part (duration, easing, property). Catches animation drift before Figma EASING/TIMING tokens exist. |
| [22] | `motion-check.mjs` | **Animation** | **Motion** - Easing and duration variables in Figma (the Motion collection) match their CSS custom properties. Opt-in: a no-op unless `figma.motion` is configured and the snapshot has a `motion` map. |
| [23] | `effect-check.mjs` | **Animation** | **Shadows and blurs** - Figma effect styles (drop/inner shadow, layer/background blur) match the CSS they are tokenised into. The comparison is **semantic**: both sides are parsed into shadow layers (`inset`, x, y, blur, spread, colour), so equivalent CSS spellings never diff (`0` vs `0px`, an omitted spread, `inset` or the colour first or last, hex vs `rgb()` vs `rgb(0 0 0 / 20%)`, rem lengths, a colour held in a nested `var()`); alpha is compared at 8-bit precision and layers as a set. A mismatch names the field (`layer 1 blur: Figma 3px, CSS 6px`). Accepts both capture shapes this guide documents (the canonical string, and the structured effect array). A blur maps to CSS `blur(Npx)` at radius × `figma.effects.blurScale` (default `0.5`: Figma's blur radius is twice CSS's, as its own Dev Mode export does); a blur-only style is expected in the style's var, a style with shadows AND a blur expects the blur in `<var>-blur`, or map both with `explicit: { "<style>": { "shadow": "--x", "blur": "--y" } }`. Opt-in: a no-op unless `figma.effects` is configured and the snapshot has an `effects` map. |
| [24] | `rendered-check.mjs` | **Rendered output** | **Renders correctly in a browser** - Launches headless Chrome via CDP (no npm deps; Node ≥ 22 built-in WebSocket), loads each built plugin `ui.html` from `file://`, and asserts `getComputedStyle` values from `RENDERED_ASSERTIONS` (structure-contract.mjs). Catches what static text analysis cannot: cascade/specificity surprises (a later rule silently overriding the DS base), wrong `var()` resolution, and stale builds. Components that only exist at runtime (toasts, list rows) are instantiated via the entry's `probe` HTML, injected into an absolutely-positioned hidden host so the app shell's flex layout cannot stretch/shrink them. Entries with `forcePseudo: ['hover']` (or `focus`/`active`) are measured under `CSS.forcePseudoState` - the only way to verify the geometry of pseudo-class rules (e.g. "content must not shift on hover": assert the `:hover` gap equals the default). Add `forcePseudoOn: '<selector>'` to put the pseudo-class on a DIFFERENT element than the one measured - hover a row, assert a button inside it. Without it a parent rule such as `.row:hover svg` (0,2,1) can silently outrank a child rule like `.action-btn svg` (0,1,1) and no assertion can see it, because forcing `:hover` on the measured element never matches the parent selector. Add `pseudo: '::before'` (or `'::after'`) to read that layer instead of the element: a component that draws its background or its lines as their own layers, as Figma does, is checked where it paints. **Color scheme is emulated per assertion** via `Emulation.setEmulatedMedia`, so a check on a mode-varying token (e.g. a dark-mode text color) can never silently flip with the host OS appearance - headless Chrome otherwise follows the machine's `prefers-color-scheme` (light on CI, often dark on a dev Mac). Each entry runs under its own `colorScheme: 'dark' \| 'light'`, defaulting to `ds-config.json → rendered.colorScheme` (else `'light'`, the `:root` base). Geometry assertions are mode-independent and need no `colorScheme`. **Four DS-sourced expected-value shortcuts** keep hand-typed values from going stale: `figmaVar: '<figma path>'` takes a colour from that Figma variable in the assertion's `colorScheme` mode (the vars snapshot), so a border or background colour follows the variable instead of a typed `rgb()`, and a variable the snapshot lacks is skipped with the reason; `iconSizeOf: '<component>'` sources an icon width/height check from that component's `iconSize` in the structure snapshot (catches icon-size drift like the 12px→16px search icon), `frameGeom: { node, path? }` sources a container padding/gap/height check from the named node's box in the **frame-geometry snapshot** (`figma-frame-geometry.snapshot.json` - per-container `h`/`pad[t,r,b,l]`/`gap` captured from the DS layout frame), and `textStyle: '<name>'` sources computed `font-size`/`font-weight`/`line-height` from that named DS text style in the **typography snapshot** (catches an element that renders the wrong type by inheriting a heavier weight - the checkbox label that inherited 700 while the DS style is 600). `frameGeom` catches context/spacing bugs the component-only checks miss - e.g. the 7px `.view-toggle-row` bottom padding that stacked on the first divider - and tracks the live frame automatically. **Auto mode (`ds-config.json → rendered.auto: true`)** generates the assertions for you: for every component with a fixed height in the structure snapshot and a base selector, it adds a `height` assertion (expected = the Figma height) against each built UI in `paths.plugins`, with a bare-element probe fallback. So you get browser-level height checks with **no hand-typed values and no contract entries**. Height is the safe context-independent case; colours (name their variable with `figmaVar`) and layout props (need real context) stay manual via `RENDERED_ASSERTIONS`, which always override the auto entries. Skips gracefully when Chrome is absent (`CHROME_PATH` to point at a binary). Transitions and animations are disabled before measuring: `getComputedStyle` reports the CURRENT animated value, so a transitioned property (e.g. `border-color 0.15s`) reads as the RESTING value the instant a pseudo-state is forced - producing a false failure against a value the user never sees at rest. |
| [25] | `coverage-check.mjs` | **Audit self-check** | **What this audit actually checked** - The one gate that checks the audit *itself*. Cross-references every DS component in the structure snapshot against the checks the contract declares (CONTRACT entry, CSS selector map, RENDERED_ASSERTIONS/FRAME_GEOMETRY_MAP/CROSS_PLUGIN, CSS_BASE_RULE_VARS, per-variant capture) and prints a coverage matrix. Surfaces the blind spots the other gates can't: a DS component modelled by **nothing** (advisory, or fail under `coverageStrict:true` - unless in `knownUnimplementedComponents`), components with **no rendered/browser assertion** (geometry only checked statically), and **single-variant** components with no per-variant capture (sibling states invisible). This is how a newly-added DS component or state stops being silently unchecked. Also reports **MODE-BLIND** assertions - a `RENDERED_ASSERTIONS` entry pinned to one `colorScheme` when the snapshot has several modes, so the unasserted mode has no browser-level guard. Mode list comes from the snapshot (never hardcoded light/dark); advisory by default, fail under `renderedModeStrict:true`. Note the token *value* in every mode is already covered by gate [3] - this dimension is about which CSS rule wins, so it matters where a cascade/specificity conflict could resolve differently per mode. Also reports **UNVERIFIED FILL** - every component that *paints its own background* (`fillStructure: 'direct'` - a container / overlay / sticky header, the class where a missing or transparent paint lets whatever is behind bleed through) but has **no rendered `backgroundColor` assertion**. A missing background is invisible to every other gate: "transparent" is not a wrong token, it is a missing paint, so gate [3] (which checks the token's *value*) stays green while the code element never applies it - exactly how the panel/header "content bleeds through the slot" bugs shipped. This makes the check *exhaustive by construction*: the engine enumerates all such fills every run rather than waiting for someone to notice a bleed by eye. `'before'` fills (a `::before`/Background-child pill behind a leaf control) are excluded - their element is legitimately transparent and their value is gate [3]'s job. Advisory by default (lists them); set `fillCoverageStrict:true` to hard-fail until each has a `backgroundColor` rendered assertion (both modes, via the MODE-BLIND check), or park a reviewed exception in `ds-config.json → knownUnverifiedFills`. |

**Gate [3] (Token values) fix mode:** run `node ~/.claude/skills/rms-design-system-engine/parity-check.mjs --fix` to auto-apply sizing/typography value fixes. Color divergences require manual review.

**Dead CSS classes (Gate [11] (Clean CSS), advisory).** Unused *variables* were checked; unused *rules*
were not. A whole class can be a stale copy of a DS component - styled, maintained, even
resized during refactors - while nothing on screen has ever carried it. A class counts as
used if its name appears anywhere outside a stylesheet: stripping the CSS from every scanned
file leaves markup, JS strings and template literals, which is where a class legitimately gets
applied.

Runtime-composed names are handled. The prefix is rarely a standalone literal - it is the tail
of a longer string, as in `'<div class="menuList result-item t-' + iss.type`, so the trailing
name fragment of any string spliced with `+` or `${…}` exempts that whole family. Advisory by
default because this is a heuristic and a check that blocks a build on a guess gets muted; set
`ds-config.json → deadCssStrict: true` to enforce, or list individual survivors in
`knownDeadCssExceptions`.

**Nearest-step suggestions for off-scale spacing.** When the hygiene scan flags a spacing
literal, it prints the DS steps either side of it - `padding 7px → 4px (padding/xs) or 8px
(padding/s)` - sourced from the snapshot's sizing tokens. Suggestions only: spacing is a design
decision and "nearest" is not always "right", so two candidates are offered rather than one.
Restricted to the `gap/`, `padding/` and `radii/` families and matched per declaration, so a
component dimension that happens to be 6px is never offered as a spacing step, and a single-line
rule holding both a padding and a border-radius gets the right family for each.

**Truncated lists are written in full.** Every capped list also writes the complete set to
`.design-system-engine-out/<name>.txt` and names the file. A capped list is a half-truth: "80 hit(s)" that
prints 20 sends you off to write your own scanner - which is exactly what happened before this
existed. Add `.design-system-engine-out` to the project's `.gitignore`.

**Gate [13] (Structure) covers plugin CSS.** The stroke-width check used to give up when a component's
selector was not in the theme file, which quietly exempted every component a plugin styles
itself - precisely where a hardcoded border width survives unnoticed.

**The exception list is audited too.** `knownHardcodedExceptions` used to be write-only -
every other exemption map in this engine is validated, that one was merely read. Two ways it
rots, both of which hide real drift indefinitely:

- **STALE** - the code an entry excused is gone, so it now silently pre-approves whatever
  similar value appears next. On its first run this found 14 dead entries in a mature project,
  several masking spacing that did not match the DS scale at all.
- **BROAD** - a bare substring like `"gap: 6px"` exempts that value in *every* file, including
  the design-system base. Prefer `{ file, pattern }` so an exemption covers only the case a
  human actually reviewed.

Both are advisory warnings printed under Gate [11] (Clean CSS). To verify a stale entry is really dead,
delete it and re-run: if nothing resurfaces, it was.

**Primitive ramp comes from the snapshot.** When Phase 1 captures a `primitives` section,
`parity-check.mjs` derives the neutral ramp from it and `NEUTRAL_LIGHT`/`NEUTRAL_DARK` in
`design-system-engine-map.mjs` become a fallback. Before this, the same numbers lived in the token CSS, in
design-system-engine-map and in Figma - three copies that drift apart, and moving a DS primitive would fail
every token aliasing it while pointing at the tokens rather than the stale map. Keys are the
trailing number of the primitive name (`primitives/Neutral 800` → `800`); override the
extraction with `figma.primitiveKeyRe` in `ds-config.json`.

**History:** every run appends to `design-system-engine-history.json`. View trend: `rms-design-system-engine --trend`.

---


## Phase 2 - State walk (auto, enables Gates [13] + [14])

**No manual step needed.** `audit.mjs` auto-generates two files by walking every COMPONENT_SET:

### `component-state-tokens.json` - flat count map (Gate [14] (All states are built))

`{ "token/name": count }` - every token found in any variant state. Gate [14] (All states are built) (`state-check.mjs`) reads this and verifies all captured tokens have CSS vars.

**Hard Rule 7 - visibility gating (three states).** Visible token → hard requirement (`❌ UNCOVERED` fails when the CSS var is missing). Hidden + visibility boolean → can be toggled on later, so the code must permit it: missing var ⇒ `⚠️ UNCOVERED-TOGGLEABLE`, an advisory that is surfaced but does **not** fail the gate. Hidden with no boolean → `⏭ HIDDEN-STATIC`, ignored. The refresh records `_hiddenOnly` (all hidden-only tokens) and `_hiddenToggleable` (the subset gated by a `boundVariables.visible` boolean) so `state-check.mjs` can separate the advisory case from the ignored one.

**If the auto-refresh fails** (no `FIGMA_TOKEN` or the fetch fails): Gate [14] (All states are built) uses whatever exists. If missing, Gate [14] (All states are built) hard-fails (exit 2).

> `_`-prefixed keys are metadata and ignored by every consumer - the refresh writes an `_updated` stamp so Gate [1] (Data is up to date) can track the file's freshness, plus `_hiddenOnly`/`_hiddenToggleable` for Hard Rule 7.

**Plugin API capture (any plan, no token)** - run this in Figma (via `use_figma` or Plugin console), save the output as `component-state-tokens.json` at project root, and commit it:

```js
const idToName = {};
for (const v of await figma.variables.getLocalVariablesAsync()) idToName[v.id] = v.name;
const counts = {};
const all = new Set(), visible = new Set(), toggle = new Set();
function collect(node, hidden, gated) {
  const bv = node.boundVariables;
  if (bv) for (const val of Object.values(bv)) {
    const refs = Array.isArray(val) ? val : [val];
    for (const r of refs) {
      const n = idToName[r?.id]; if (!n) continue;
      counts[n] = (counts[n] ?? 0) + 1; all.add(n);
      if (!hidden) visible.add(n); else if (gated) toggle.add(n);
    }
  }
}
function walk(n, hidden = false, gated = false) {
  const isHidden = hidden || n.visible === false;
  const isGated  = gated  || n.boundVariables?.visible != null;
  collect(n, isHidden, isGated);
  if ('children' in n) for (const c of n.children) walk(c, isHidden, isGated);
}
const page = figma.root.children.find(p => p.name.toLowerCase().includes('component')) ?? figma.currentPage;
for (const node of page.children) if (node.type === 'COMPONENT_SET' || node.type === 'COMPONENT') walk(node);
const hiddenOnly = [...all].filter(t => !visible.has(t));
return {
  _updated: new Date().toISOString(),
  _hiddenOnly: hiddenOnly.sort(),
  _hiddenToggleable: hiddenOnly.filter(t => toggle.has(t)).sort(),
  ...counts,
};
```

### `component-state-bindings.json` - structured binding map (Gate [13] (Structure) auto-derivation)

```json
{ "ButtonPrimary": { "State=Default": { "props": { "state": "default" }, "bindings": [
  { "token": "buttonPrimary/background/color", "bindingField": "fills", "isText": false, "depth": 0 },
  { "token": "buttonPrimary/text/color",       "bindingField": "fills", "isText": true,  "depth": 1 }
] } } }
```

Gate [13] (Structure) auto-derives CSS var assertions using **naming convention** - no `CONTRACT.propertyMap` dependency:

- **Component name → CSS selector:** every gate asks one shared finder (`component-locator.mjs`), so all of them agree. First answer wins: `ds-config.json → componentSelectors` (e.g. `"Input": ".inputGroup"`, `"Tooltip": "#tooltip"`), then the contract's `COMPONENT_CSS_SELECTORS[name].main`, then a name that already is a selector (`.x`, `#x`), then the convention (lowercase the first letter of the Figma component set name, `"ButtonSecondary"` → `.buttonSecondary`).
- **Variant props → CSS modifier:** `state=hover` → `:hover`, `state=focus` → `:focus`, `state=active`/`pressed` → `:active`, `state=focus-within` → `:focus-within`, `state=default`/any `=false` → base selector. Unknown values (e.g. `"negative"`, `"selected"`, `"true"`) → variant skipped, no assertion generated.

Only standard, universally-derivable states are mapped - no false positives for project-specific state semantics. Manual `CSS_BASE_RULE_VARS` entries handle non-standard states (badge severity levels, toast loading/success, etc.).

Coverage:

| Figma binding | Node type | Auto-derived CSS assertion |
|---|---|---|
| `fills` | Root frame | `background: var(--token-var)` |
| `strokes` | Root frame | `border-color: var(--token-var)` (with `border:` shorthand fallback) |
| `fills` | Direct TEXT child | `color: var(--token-var)` |

Manual `CSS_BASE_RULE_VARS` entries always override auto-derived for the same `selector+prop`. Use them for edge cases: shorthand combiners, deeply-nested selectors, or explicit exception overrides.

**If the auto-refresh fails** (no `FIGMA_TOKEN` or the fetch fails): Gate [13] (Structure) falls back to manual `CSS_BASE_RULE_VARS` only. No gate noise - the count just shows `(N manual)` instead of `(N auto-derived · M manual)`.

**Plugin API capture (any plan, no token)** - run this in Figma (via `use_figma` or Plugin console), save the output as `component-state-bindings.json` at project root (gitignored):

```js
const idToVar = {};
const allVars = await figma.variables.getLocalVariablesAsync();
for (const v of allVars) idToVar[v.id] = v;

function getBindings(node, maxDepth = 1, depth = 0) {
  if (depth > maxDepth) return [];
  const isText = node.type === 'TEXT';
  const result = [];
  for (const field of ['fills', 'strokes']) {
    const refs = Array.isArray(node.boundVariables?.[field])
      ? node.boundVariables[field]
      : node.boundVariables?.[field] ? [node.boundVariables[field]] : [];
    for (const r of refs) {
      const v = idToVar[r?.id];
      if (v) result.push({ token: v.name, bindingField: field, isText, depth });
    }
  }
  if ('children' in node) {
    for (const child of node.children) result.push(...getBindings(child, maxDepth, depth + 1));
  }
  return result;
}

const result = {};
const sets = figma.root.findAll(n => n.type === 'COMPONENT_SET');
for (const set of sets) {
  const variants = {};
  for (const variant of set.children) {
    if (variant.type !== 'COMPONENT') continue;
    const props = {};
    for (const part of (variant.name ?? '').split(',')) {
      const eq = part.indexOf('=');
      if (eq !== -1) props[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim().toLowerCase();
    }
    const bindings = getBindings(variant, 1, 0);
    if (bindings.length) variants[variant.name] = { props, bindings };
  }
  if (Object.keys(variants).length) result[set.name] = variants;
}
return JSON.stringify(result, null, 2);
```

### `component-values.snapshot.json` - per-component raw-value sweep (Gate [11] (Clean CSS) parity scoping)

Powers the **per-component** parity scoping of the hardcoded-value gate (Hard Rule 5). For each component it records every raw geometry number and colour its nodes actually use - **not tokens, the literal values** - swept from ALL nodes (all variants, all descendants, hidden included). The gate checks a file's hardcoded literals against the component that file belongs to, so a `24px` is parity only when *that component's own* Figma node is 24px.

`{ "ButtonPrimary": { "nums": [4, 24, 40, 48], "colors": ["2563eb", "ffffff"], "hygiene": { … } }, … }`

The same sweep records each component's **Figma file hygiene** in `hygiene`: values with no variable and no style (a solid fill or stroke colour, a corner radius, a padding, a gap in an auto layout, a text layer with no text style), frames detached from an instance (the Plugin API capture only; REST has no such flag), variants with two or more layers and no auto layout, and whether the component has a description. The audit lists them in a `🎨 Figma file hygiene` block, for whoever keeps the Figma file: code can only match what Figma states. Vector artwork and instances are left out (an instance holds its own component's values). Advisory, never a gate; `"figmaHygiene": false` turns it off and `--hygiene` lists every finding. The parity never changes a value in Figma.

**Optional convenience - auto-refresh (REST):** `audit.mjs` regenerates it on every run when `FIGMA_TOKEN` is set. Not required; the plugin capture below is the universal, any-plan, no-token path.

**Plugin API capture (any plan, no token)** - run this in Figma (via `use_figma` or the Plugin console), save as `component-values.snapshot.json` at project root, and commit it:

```js
const round = (n) => Math.round(n * 100) / 100;
function collectRaw(node, nums, colors) {
  if (!node) return;
  const pushN = (v) => { const n = Number(v); if (Number.isFinite(n) && n !== 0) { nums.add(round(n)); nums.add(Math.round(n)); } };
  pushN(node.width); pushN(node.height);
  pushN(node.cornerRadius);
  for (const k of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) pushN(node[k]);
  pushN(node.strokeWeight); pushN(node.itemSpacing);
  pushN(node.paddingLeft); pushN(node.paddingRight); pushN(node.paddingTop); pushN(node.paddingBottom);
  if (node.fontSize && typeof node.fontSize === 'number') pushN(node.fontSize);
  const hex = (c) => { const to = (x) => Math.round((x ?? 0) * 255).toString(16).padStart(2, '0'); return (to(c.r) + to(c.g) + to(c.b)).toLowerCase(); };
  for (const p of ['fills', 'strokes']) for (const paint of (Array.isArray(node[p]) ? node[p] : [])) if (paint?.type === 'SOLID' && paint.color) colors.add(hex(paint.color));
  for (const e of (Array.isArray(node.effects) ? node.effects : [])) if (e?.color) colors.add(hex(e.color));
  for (const child of node.children ?? []) collectRaw(child, nums, colors);
}
// The Figma file hygiene record (the same function as the engine's figma-hygiene.mjs).
function hygieneOf(root, description, budget = { n: Infinity }, names = {}) {
  const out = { raw: [], rawCount: 0, noAutoLayout: [], description: !!String(description ?? '').trim() };
  const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const mainName = (n) => {
    if (names[n.componentId]) return names[n.componentId];
    try { const m = n.mainComponent; return m ? (m.parent && m.parent.type === 'COMPONENT_SET' ? m.parent.name : m.name) : null; } catch (e) { return null; }
  };
  const has = (o, k) => { const v = o ? o[k] : null; return Array.isArray(v) ? v.some(Boolean) : !!v; };
  const bound = (n, k) => has(n.boundVariables, k);
  const styled = (n, kind) => has(n.styles, kind) || (typeof n[kind + 'StyleId'] === 'string' && n[kind + 'StyleId'] !== '');
  const hex = (c) => '#' + [c.r, c.g, c.b].map((x) => Math.round((x || 0) * 255).toString(16).padStart(2, '0')).join('');
  const num = (v) => typeof v === 'number' && isFinite(v) && v > 0;
  const kids = (n) => (Array.isArray(n.children) ? n.children : []);
  const artwork = /^(VECTOR|BOOLEAN_OPERATION|STAR|LINE|POLYGON|REGULAR_POLYGON)$/;
  const raw = (at, field, value) => { out.rawCount++; if (out.raw.length < 12) out.raw.push({ at, field, value }); };
  const corners = ['topLeftRadius', 'topRightRadius', 'bottomRightRadius', 'bottomLeftRadius'];
  const sides = [['paddingTop', 'top'], ['paddingRight', 'right'], ['paddingBottom', 'bottom'], ['paddingLeft', 'left']];
  let detached = null;
  const walk = (n, at) => {
    if (!n || typeof n !== 'object' || budget.n <= 0) return;
    budget.n--;
    if (n.type === 'INSTANCE') {   // an instance, overrides included, reads as its own component's values
      const main = mainName(n);
      if (main && n.name !== main && key(n.name) === key(main)) { out.renamed = out.renamed || []; out.renamed.push({ at, layer: n.name, component: main }); }
      return;
    }
    if (n.detachedInfo !== undefined) { detached = detached || []; if (n.detachedInfo) detached.push(at); }
    if (!artwork.test(n.type)) {
      for (const [list, kind] of [['fills', 'fill'], ['strokes', 'stroke']]) {
        const paints = Array.isArray(n[list]) ? n[list] : [];
        paints.forEach((p, i) => {
          if (!p || p.type !== 'SOLID' || p.visible === false || !p.color) return;
          const viaNode = n.boundVariables && Array.isArray(n.boundVariables[list]) && n.boundVariables[list][i];
          if (has(p.boundVariables, 'color') || viaNode || styled(n, kind)) return;
          raw(at, kind, hex(p.color));
        });
      }
    }
    const radii = Array.isArray(n.rectangleCornerRadii) ? n.rectangleCornerRadii : corners.map((k) => n[k]);
    const radius = num(n.cornerRadius) ? n.cornerRadius : Math.max(0, ...radii.filter(num));
    if (radius > 0 && !bound(n, 'cornerRadius') && !corners.some((k) => bound(n, k))) raw(at, 'radius', radius);
    const loose = sides.filter(([k]) => num(n[k]) && !bound(n, k)).map(([k, w]) => `${w} ${n[k]}`);
    if (loose.length) raw(at, 'padding', loose.join(', '));
    const auto = n.layoutMode && n.layoutMode !== 'NONE';
    if (auto && num(n.itemSpacing) && kids(n).length > 1 && !bound(n, 'itemSpacing')) raw(at, 'gap', n.itemSpacing);
    if (n.type === 'TEXT' && !styled(n, 'text') && !bound(n, 'fontSize')) {
      const size = typeof n.fontSize === 'number' ? n.fontSize : n.style && n.style.fontSize;
      raw(at, 'text style', size ? `${size}px` : 'mixed');
    }
    for (const c of kids(n)) walk(c, `${at}/${c.name}`);
  };
  const variants = root && root.type === 'COMPONENT_SET' ? kids(root) : [root];
  for (const v of variants) {
    if (!v) continue;
    if (kids(v).length > 1 && (!v.layoutMode || v.layoutMode === 'NONE')) out.noAutoLayout.push(v.name);
    walk(v, v.name);
  }
  if (detached) out.detached = detached;
  return out;
}
const result = {};
// Components, and component sets as one entry (a variant is part of its set, not a component of its own).
for (const set of figma.root.findAll(n => n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent?.type !== 'COMPONENT_SET'))) {
  const nums = new Set(), colors = new Set();
  collectRaw(set, nums, colors);
  result[set.name] = { nums: [...nums].sort((a, b) => a - b), colors: [...colors].sort(), hygiene: hygieneOf(set, set.description) };
}
return JSON.stringify({ _updated: new Date().toISOString(), ...result }, null, 2);
```

> **Attribution is agnostic.** A file is scoped to the component whose **base selector** it contains (`componentSelectors` override, else the DS convention `.<lowerFirst(Name)>`), matched after normalising both sides (drop `.`/`#`, strip non-alphanumerics, lowercase) - so `.button-primary` in a Vue `<style>` matches `ButtonPrimary`. A file that matches no component falls back to the global value set. No per-file config is required; add `componentSelectors` entries only for non-convention selectors.

---


## Phase 2 - Steps 3–10: When are manual steps required?

| Condition | Steps 3–10 |
|---|---|
| All 25 gates pass AND Phase 1 found no new tokens | **Spot-check** - sample 1–2 components per run; full walk not required |
| Any gate ❌ OR Phase 1 found new/changed tokens | **Mandatory** - run the full sequence before declaring parity |
| New component added to DS | **Mandatory** - Step 3 deep-walk for that component at minimum |

Gate failures take priority. Fix every ❌ before running the manual steps.

---


## Phase 2 - Step 3: Component deep-walk

For every DS component, walk all states and extract fill/stroke/padding/gap/radius/text with bound variable names. Use the `describe()` pattern:

```js
function getVar(node, prop) {
  const bv = node.boundVariables?.[prop]; if (!bv) return null;
  const ref = Array.isArray(bv) ? bv[0] : bv;
  return idToVar[ref?.id]?.name || null;
}
function toHex(c) { const h=[c.r,c.g,c.b].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join(''); const a=c.a===undefined?1:c.a; return '#'+h+(a>=1?'':Math.round(a*255).toString(16).padStart(2,'0')); }
function describe(n, depth=0) {
  const o = { id: n.id, name: n.name, type: n.type, w: Math.round(n.width), h: Math.round(n.height) };
  try { if (n.layoutMode) o.layoutMode = n.layoutMode; } catch{}
  try { o.padding = {t:n.paddingTop,r:n.paddingRight,b:n.paddingBottom,l:n.paddingLeft};
        o.paddingVar = getVar(n,'paddingTop') || getVar(n,'paddingLeft'); } catch{}
  try { if (n.itemSpacing) { o.gap = n.itemSpacing; o.gapVar = getVar(n,'itemSpacing'); } } catch{}
  try { if (n.cornerRadius && n.cornerRadius !== figma.mixed) { o.radius=n.cornerRadius; o.radiusVar=getVar(n,'cornerRadius'); } } catch{}
  try { if (n.fills?.length && n.fills[0].type==='SOLID') { o.fill=toHex(n.fills[0].color); o.fillVar=getVar(n,'fills'); } } catch{}
  try {
    if (n.strokes?.length) {
      o.strokeVar=getVar(n,'strokes'); o.strokeWeight=n.strokeWeight;
      o.strokeStyle=(n.dashPattern?.length>0)?'dashed':'solid';
    } else { o.strokes='none'; }
  } catch{}
  try { if (n.type==='TEXT') { o.fontSize=n.fontSize; o.fontWeight=n.fontWeight; o.textFillVar=getVar(n,'fills'); } } catch{}
  if (depth<3 && n.children) o.children=n.children.map(c=>describe(c,depth+1));
  return o;
}
```

**Critical:** always query `State=Default` CHILD, never the SET.

**Stroke presence rule:** if `strokes: 'none'` on the Default state → CSS must use a transparent border (`border: ... solid transparent`). Never use a token color on the default state's border.

Compare results against your `structure-contract.mjs`. Any drift → update contract AND CSS together.

**Adding a new component to the contract:** when a component graduates from `knownUnimplementedComponents` to a real contract entry, the contract and the `figma-structure.snapshot.json` must declare the **exact same set of structural fields** (`h`, `gapVar`, `paddingVar`, `fontSizeVar`, `fontWeightVar`, `fillStructure`, `innerInset`, `innerRadiusVar`, `strokeOnDefault`, `strokeOnAnyState`). Gate [13] (Structure) compares them field-by-field - a field present in the snapshot but absent (`undefined`) in the contract is a divergence even if both values would be `null`. Always include all structural fields in the contract explicitly, setting unknown/inapplicable ones to `null`.

**After adding structural fields, wire up CSS enforcement - or the fields are documentation only.** Gate [13] (Structure) verifies that the contract and snapshot agree with each other, but it does NOT automatically verify that the CSS implements those values. You must explicitly wire each structural fact into a CSS check:

1. **`CSS_HEIGHT_RULES`** - for every component where `h` is a fixed number (not `null` or `'auto'`), add an entry:
   ```js
   export const CSS_HEIGHT_RULES = {
     myComponent: { selector: '.myComponent', prop: 'height' },   // h is fixed
     myOther:     { selector: '.myOther',     prop: 'min-height' }, // h is a minimum
   };
   ```
   Gate [13] (Structure) verifies the declared selector has a `height`/`min-height` rule that uses the right token var (via `FIGMA_LAYOUT_TO_CSS`). A component with `h: 24` in the snapshot but no `CSS_HEIGHT_RULES` entry means Gate [13] (Structure) will never catch a CSS height regression.

   **`sizing: 'hug'`** - for a component that *hugs its content* (an `inline-flex` label+icon with no fixed height in code - a badge, radio, checkbox, tooltip popover), add `sizing: 'hug'` to its contract entry. Its captured `h` is then treated as **informational**: Gate [13] (Structure) skips the exact-height contract↔snapshot comparison (and Gate [13] (Structure) the per-variant-height coverage), so a sub-pixel or content re-measure (`20 → 19`) doesn't churn and doesn't force a paired contract edit. Every other structural field is still compared, and a `fixed` component (the default - no `sizing` key) still fails on any height mismatch. Use `'hug'` only when there is genuinely no fixed height to enforce; a component with a `CSS_HEIGHT_RULES` entry is `fixed` by definition.

2. **`COMPONENT_CSS_SELECTORS`** - for every component in `CSS_HEIGHT_RULES`, add a matching entry so Gate [13] (Structure) knows which CSS selector to check for padding, gap, and radius:
   ```js
   export const COMPONENT_CSS_SELECTORS = {
     myComponent: { main: '.myComponent' },
   };
   ```
   Without this, Gate [13] (Structure) skips padding and gap binding checks for the component entirely.

3. **`CSS_PROPERTY_ASSERTIONS`** - use this for any structural constraint that Gate [13] (Structure) cannot auto-verify from the root binding alone. Common cases:
   - `gapVar` or `paddingVar` that is bound on a **child frame** (not the root) - the snapshot records `null` but CSS must still use the right var
   - `innerRadiusVar` - verify `border-radius` on the right selector uses the correct var
   - Explicit value checks (`expected: '40px'`) when Figma doesn't use a variable but the DS still mandates a specific value
   ```js
   { sel: '.myComponent', prop: 'gap',           expectedVar: '--gap-s'       },
   { sel: '.myComponent', prop: 'border-radius', expectedVar: '--radius-full' },
   { sel: '.myComponent', prop: 'height',        expected:    '24px'          },
   ```

**Checklist for every new contract entry:**
- [ ] All structural fields in contract match snapshot (Gate [13] (Structure))
- [ ] `CSS_HEIGHT_RULES` entry if `h` is a fixed number
- [ ] `COMPONENT_CSS_SELECTORS` entry (required for padding/gap/radius checks)
- [ ] `CSS_PROPERTY_ASSERTIONS` for any padding/gap/radius/height that isn't auto-verifiable from the root binding
- [ ] `propertyMap` for every Figma variant/state property
- [ ] Run `node ~/.claude/skills/rms-design-system-engine/structure-check.mjs` and confirm ✅ PASS X/X (X = total contract count)

**State/variant selectors - full chain:** for every non-default Figma state or variant property value (Hover, Disabled, Selected, Size=Small, etc.), document in `structure-contract.mjs → STATE_SELECTORS`:
- `selector` - the CSS selector that activates this state
- `vars` - for each visual property in this state, the exact token var that must be used

`structure-check.mjs` verifies: (1) the selector exists in CSS, and (2) the selector's rule uses the declared token var for each property. Token values are Gate [3] (Token values)'s job - this gate verifies the *wiring*. Together they form the complete chain: Figma state exists → selector exists → correct var is bound → var resolves to correct hex.

---


## Phase 2 - Step 4: Hardcoded value scan (A–F)

Run across all production CSS files:

**A.** Hex colors in rules (not `:root` declarations) - must use `var(--)` 
**B.** Hardcoded font sizes - must use your scale vars
**C.** Hardcoded border radius - must use your sizing token vars
**D.** Hardcoded border widths - must use your sizing token vars
**E.** Hardcoded spacing - must use your gap/padding token vars
**F.** JS inline styles (`element.style.color = ...`)

Document intentional exceptions in `ds-config.json → knownHardcodedExceptions`.

---


## Phase 2 - Step 5: State coverage check

For every DS component with multiple states, verify a corresponding CSS rule exists and is reachable.

---


## Phase 2 - Step 6: Mode override completeness

Every token where modes have different values must have an explicit CSS override for non-default modes (or use a self-resolving var that already carries both values). Gate [3] (Token values) catches this automatically for all tokens in the snapshot.

---


## Phase 2 - Step 7: Screenshots

Gate [2] (Figma frame unchanged) handles this automatically if `FIGMA_TOKEN` is set. For manual review: use `get_screenshot` with `figmaFileKey` and each `frames[].nodeId` from `ds-config.json`. Compare against `.design-system-engine-refs/` reference images. Flag any visible difference not already surfaced by the automated gates.

To accept a visual change after verifying it's intentional:
```bash
mv .design-system-engine-refs/<frame-id>.new.png .design-system-engine-refs/<frame-id>.png
```

---


## Phase 2 - Step 8: Build freshness

If your project has a build step:

```bash
# rebuild, then check for uncommitted changes in built output
git status --short -- '<your built output paths>'
```

Expected: empty output. Any listed file = stale build.

---


## Phase 2 - Step 9: Master Token Table

Produce one table covering every Figma component token:

| Figma token | CSS var | Name | Mode A Figma | Mode A Code | A | Mode B Figma | Mode B Code | B | Alias |
|---|---|---|---|---|---|---|---|---|---|

- `none` = token exists in Figma, no CSS var yet
- `via --alias` = covered by a semantic alias documented in `design-system-engine-map.mjs`
- `~` = Figma value null/missing
- **Mode A Code / Mode B Code must show the actual resolved value**, not just the var reference

After the table: Divergence summary (❌ rows), Unused vars, New Figma tokens.
