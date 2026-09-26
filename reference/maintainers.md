# Maintaining the engine and the skill

Part of the rms-figma-code-parity reference (`rms-figma-code-parity --reference maintainers`). The rules that always apply are in the main guide.

---


## Engine Evolution - closing the loop on every miss

Every audit that finds a real divergence is also evidence about the audit itself.
Two questions must be answered before the run is closed, and the second is the one
that gets skipped:

1. **Does the project need a new contract entry?** (assertion, exemption, snapshot
   field) - this hardens *this* project. Already covered by the Audit Rules in the main guide.
2. **Could the engine have caught it in any project?** - if yes, the gate is
   incomplete and fixing only the contract leaves every other consumer exposed.

Ask (2) explicitly, per finding. Most answers are "no, project-specific" - that's
fine and expected. When the answer is yes, the same session must:

- fix it in the gate script, driven by config/contract values, never a project name
- add or extend the check so the same class of miss fails next time
- update this doc and `README.md` in the **same commit** as the code
- commit and push to the engine repo before moving on

**Worked example (2026-07-23).** A project's `figma-component-props.snapshot.json`
held only its `_updated` stamp because an earlier capture had returned nothing.
Gate [1] validated age and existence, so it reported "✓ updated today" while Gate
[10g] silently checked zero annotations - a real DS annotation went unverified for
weeks and the audit stayed green throughout.

The project-level fix was to re-run the capture. The engine-level fix was the one
that mattered: Gate [1] now counts non-metadata entries in every snapshot and fails
a file that is fresh but empty, naming the gate left checking nothing. A stale
snapshot is bad; an empty one is worse, because stale data still gets checked.

**Worked example (2026-07-24).** Two new sprites were added to a plugin's shared icon
sheet. Gate [14] flagged both as undocumented - correct, but it missed the more
interesting half: the contract already held an entry for one of them under a stale key
(`icon-zoom`) whose own description said `Icon/Fit`. The id and the DS component had
been out of sync for as long as the entry existed, and no gate looked at the
relationship between them. Auditing the rest of the sheet the same way turned up an
entry pointing at `Icon/object/variable` - a component that does not exist in the DS
file at all; the real component is `Icon/object/token`.

Neither miss was detectable by the existing checks. Path and viewBox comparison starts
from the node the entry names, so an entry naming the wrong node compares the icon
against itself and passes. The project fix was to rename the key and document the new
icons. The engine fix was to make the sprite id answerable to the DS component's own
name, with the snapshot's captured `name` as the authority so a Figma rename shows up
on the next refresh rather than whenever someone rereads the prose. Orphaned DS entries
now fail too - a rename leaves debris at both ends, and only one end was visible.

**The test for a good engine fix:** it must be expressible without naming the
project that surfaced it. If the fix needs a hardcoded component, token or path,
it belongs in that project's `structure-contract.mjs`, not here.

**What must never be auto-fixed.** Declaration gaps - undocumented broad rules,
missing contract entries, state exemptions, unacknowledged annotations - encode a
human's reason for a deliberate divergence. Generating them from whatever the code
currently does converts the audit into a rubber stamp: it would have recorded "the
code uses the retired token, noted" and hidden a DS state change instead of
surfacing it. Auto-fix mechanical value divergences only (`--fix`); everything else
must fail until a person decides.

**Worked example (2026-08-02) - the guard that had to stay a rendered assertion.**
A `.menuList svg { color: menuList/iconPrimary }` broad rule silently dimmed a
`.infoButton` nested inside a menuList row: both rules are `.class tag` at equal
specificity, and `.menuList svg` came later in source, so it won for the badge's SVG
- rendering it N500 `#5e5e5e` instead of the infoButton's own N300 `#bfbfbf`. Gate
[9] had already passed `.menuList svg` as "ISOLATED"; documenting a broad rule does
not prove every sub-component nested under it survives.

The tempting engine fix - a static check that flags any broad `.P tag` that could
shadow a sub-component `.S tag` - was built and **thrown away**: it cannot know which
components actually nest. It reported 18–156 findings, almost all impossible nestings
(`.infoButton svg` "shadowing" `.empty-state svg`), because CSS alone has no DOM
model, and here the real nesting is created in a JS template string the static HTML
scan never sees either. A gate that noisy gets muted, which is worse than no gate.

The correct guard is a **rendered assertion** measuring the sub-component's computed
colour *in its parent context* (`selector: '.menuList .infoButton svg'`, with a
`probe` that nests them), one per mode. It uses the real cascade, so it is exact and
silent until it actually regresses - verified by reverting the CSS fix and watching
only those two assertions fail. The lesson: when the risk is a cascade/nesting
outcome, the guard belongs in Gate [16] (rendered), not in a static selector scan.
The isolation-fix override rules themselves are then documented in `ALLOWED_BROAD_RULES`
as `ISOLATION FIX`.
