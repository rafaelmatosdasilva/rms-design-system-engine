# Maintaining the engine and the skill

Part of the rms-design-system-engine reference (`rms-design-system-engine --reference maintainers`). The rules that always apply are in the main guide.

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

**Two fictional libraries keep the engine general.** `test/fixtures/demo-ds` (Tidepool) and
`test/fixtures/harbor-ds` (Harbor) are audited end to end and compared with committed reports
(`test/demo-ds.test.mjs`, `test/harbor-ds.test.mjs`). Their conventions differ on purpose: React and a
data-attribute theme in one, Vue, a class theme, a variable prefix and snapshot files under their own names in
the other. Each plants known differences, and the test checks each one is found and nothing else fails. A
check built around one library's habits shows up as a false failure in the other: Harbor exposed prop values
read in lowercase, a focus ring counted as a border and as a literal with no Figma value, and a flex-shrink rule
that failed every fixed-height control. A new check runs on both before it ships.

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

## Skill evaluation - a guide change is measured before it ships

The guide is instructions for an agent, so a change to it (the main file, a recipe or a reference file) can
make the skill worse in ways no unit test sees. `test/skill-evals/` runs the real skill headless
(`claude -p "/rms-design-system-engine <task>"`) on fixed tasks and scores each run by code: what the agent ran,
the files after, and the rules it must never break (asking for a token in the chat, committing, pushing,
hand-editing a snapshot or `ds-config.json`, applying the hand-back unasked). It spends model tokens, so it is
not part of `node --test`.

```bash
node test/skill-evals/run.mjs --variant cookbook --model claude-sonnet-5 --runs 5 --set all --jobs 1 --resume
node test/skill-evals/run.mjs --variant cookbook --model claude-haiku-4-5-20251001 --runs 3 --set all --jobs 1 --resume
node test/skill-evals/report.mjs --a baseline --b cookbook --model claude-sonnet-5 --runs 5 --model claude-haiku-4-5-20251001 --runs 3
```

- **Variants.** `baseline` is the guide at a git ref (`--ref`, default the `guide-monolith` tag), `cookbook`
  the guide in the checkout, `skill` the same as a native Claude Code Skill (`SKILL.md` built from the main
  file). Every variant runs on the same engine; only the guide differs.
- **Isolation.** Each run gets a fresh copy of the demo design system and a fresh `HOME` holding only the
  variant, no MCP servers, a fixed tool list, a turn limit and a budget, and none of the evaluating session's
  environment.
- **The same project on both sides.** Each version is measured on its own checkout, so the demo design system
  (`test/fixtures/demo-ds`) is part of what is measured: a change to it changes every task. Every run records
  the project's hash, and `RESULTS.md` records it ("Project measured"). A test that needs more in the demo lays
  a folder over its copy instead (`fixtureProject(…, { overlay })`, as `test/fixtures/demo-primitives` does);
  when the demo itself has to change, the version before is measured again on the new one.
- **Tasks.** `tasks.mjs` is the development set, used while writing recipes; `heldout.mjs` is the held-out
  set, not looked at while writing them. Adoption is decided on the held-out set. Private tasks
  (`DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_TASKS`) write only under `DESIGN_SYSTEM_ENGINE_EVAL_PRIVATE_OUT`, never in the repository.
- **A run the API refused is not a result.** A usage limit or a 429 stops the pool without writing a row;
  the same command with `--resume` carries on. A results file from another guide or engine is refused.
- **Adoption rule** (`report.mjs`, applied by code, per model): no held-out task with a lower pass rate (a
  lower task is re-run 10 more times on both variants before it counts), no new rule violation, a total pass
  rate equal or higher, and fewer input tokens; the development set shows no lower task either. The report
  refuses to decide on a partial measurement.
- **Scorers are code, and they are tested** (`test/skill-evals.test.mjs`). When a transcript read by hand
  disagrees with its score, the scorer is fixed, and `rescore.mjs` scores the saved runs again.

Any change to the guide files needs a fresh evaluation run before it is merged. `test/guide-structure.test.mjs`
keeps the split whole (index, recipe template, a 30 KB cap on the main file, no paragraph in two files, every
pointer resolves, every recipe-check command runs on the demo).

### Rendered assertions per mode

**Every mode-varying token needs a rendered assertion per mode.** A `RENDERED_ASSERTIONS`
entry pins one `colorScheme`. If the token resolves differently per mode and only one mode
is asserted, the other is unguarded and will drift undetected - which is exactly how the
light-mode hover colour in the refresh-figma recipe's real case went stale. When you add an assertion for a colour that
varies by mode, add the sibling assertion for the other mode in the same commit.
