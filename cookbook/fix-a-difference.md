# Fix a difference

**Use when.** the person asks for a difference to be fixed, in the code or in Figma.

## Steps

1. Fix exactly what they asked for, nothing else. The measured difference names the rule, file and line, and the value to write.
2. For several code changes, `.design-system-engine-out/handback/code-changes.diff` holds them: show it, and apply it (`git apply`) only when they ask.
3. A value in Figma is never changed by the skill: `.design-system-engine-out/handback/figma-changes.md` lists what to change there, for the person to do. What the code already states and Figma does not (a component's role) is the `figma-edits` recipe, applied once the person says yes.
4. A component or token the system retired that is still used: `.design-system-engine-out/handback/migrations.md` lists what replaces each and every file and line, product by product, and `migrations*.diff` holds the token swaps. Show them, and apply only what the person asks for. A class a product styles almost as a system component is a decision for the person: use the component (with a new option if it needs one), or add the new one to the system. Never decide it yourself.
5. Run the same audit again to confirm.

**What parity holds the code to.** A fix keeps every one of these, and a value that breaks one is still a difference:

1. **Every Figma component token must have a dedicated CSS variable.** No token may be covered only by an inline value. `via` is acceptable only when a semantic alias is documented in `design-system-engine-map.mjs`.
2. **Every CSS variable must be wired into at least one CSS rule.** A declared-but-unused var must be deleted. Variables are declared when the component exists in code, not before.
3. **Naming convention must be followed exactly.** A correct value under a wrong name is still a divergence.
4. **All modes must match.** A token correct in one mode but wrong in another is still a divergence - this applies to every mode your DS defines: light/dark, compact/comfortable, any breakpoint-based sizing mode, etc.
5. **A hardcoded value is a divergence only when it contradicts Figma - scoped per component.** This is a *parity* skill, not a style linter - it does not push `var()` over literals for its own sake. A raw literal in a CSS rule is flagged only when the component that rule belongs to has **no matching value** for it in Figma; when Figma uses that same value on that component, the literal has 100% parity and passes, token-backed or not. Scoping is per component via `component-values.snapshot.json` - a full raw-value sweep of **every node** of each component (all variants, all descendants, hidden included). A file's literals are checked against the component whose base selector the file contains. Matches are reported as info (`ℹ️ … parity OK, not failed [Component]`) so they stay visible and auditable. **Fallback:** when `component-values.snapshot.json` is absent, or a file maps to no component, the gate falls back to the global value set (resolved token colours across every mode + all sizing/typography numerics + captured structural geometry) - coarser, but non-breaking. `100vw` (a scrollbar-clipping rendering bug) is never suppressed. A length in an `outline` of a `:focus` rule (a focus ring) that Figma has no value for is listed apart, never failed: Figma draws no outline to compare it with; a colour in that ring is still checked. Document deliberate literals Figma has no counterpart for - layout math like `50%`, positioning zeros - in `ds-config.json → knownHardcodedExceptions`.
6. **New Figma component tokens detected during any audit step must be implemented in code before the audit closes.**
7. **Requirement follows use, with a middle ground for elements that can be switched on later. Three states, not two:**
   - **Visible token** (bound on a visible node in some variant) → a hard requirement. Missing CSS var ⇒ `❌ UNCOVERED`, Gate [14] (All states are built) fails. It is "meant to be used" now.
   - **Hidden + visibility boolean** (`boundVariables.visible`, itself or via a hidden ancestor) → the element is off *here* but can be **toggled on in a future project or state**, so the code must **permit** that: if its CSS var exists the code already supports activation (`✅`); if the var is missing the element could not render when switched on ⇒ `⚠️ UNCOVERED-TOGGLEABLE`, an **advisory that is surfaced but does not fail** the gate (it is legitimately off in this project). So it is *checked*, not silently ignored.
   - **Hidden, no boolean** (statically off, dead) → `⏭ HIDDEN-STATIC`, never a requirement, ignored.

   The capture records this via `_hiddenOnly`/`_hiddenToggleable` in `component-state-tokens.json`. (This replaces the earlier "hidden + boolean → always implement" stance: a DS element switched off downstream must not *fail* a consumer that has it off - but because it can be turned on later, its missing wiring is still raised as an advisory so someone can decide.)
8. **CSS alias chains must mirror Figma exactly.** When Figma aliases a component token directly to a primitive (e.g. `primitives/Neutral 700`), the CSS var must chain through the matching primitive var (e.g. `var(--neutral-700)`). Routing through a semantic intermediate (`var(--border)`, `var(--bg)`, `var(--text-muted)`) is never acceptable as a substitute - even when the resolved hex is identical. A `🔗 ALIAS FAIL` from Gate [3] (Token values) is always fixed in CSS; there is no exemption map.
9. **Every DS sub-component nested inside another DS component must retain its own CSS styles.** A parent component's rule that combines a component class with a bare element tag (`.card svg { color: X }`) directly targets that element - direct targeting beats inheritance. When adding any CSS rule of the form `.<componentClass> <elementTag> { <visual-property> }`, either (a) prove it's a leaf component, or (b) add explicit `.<subComponent> <elementTag> { }` overrides later in the cascade. Add every such rule to the `ALLOWED` map in `subcomponent-isolation-check.mjs`. Gate [12] (Nested components keep their own styles) enforces this mechanically.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Sending it back*, *Which side moved*

```recipe-check
rms-design-system-engine --summary
```
