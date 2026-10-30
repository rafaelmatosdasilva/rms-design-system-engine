# /rms-design-system-engine - the engine of a design system

**Loading this page runs nothing.** With a shell, run the command yourself, now: with arguments, `rms-design-system-engine <those arguments>`; then answer from what it prints (its `NEXT:` line says what to do after). Never wait for it to run on its own. With no shell, use the engine's MCP tools (`query`, `catalog`, `check_ui`, `summary`): the same answers. A shell, where there is one, comes first.

**In one line:** given a Figma design system and its codebase, decide whether the code
matches the design, and emit machine-readable facts (real token names, values, selectors
and component relationships) that other tools and AI agents can consume without guessing.

**The model — four layers:**
- **Facts** — what Figma has: the captured snapshot + the DTCG `tokens.json`.
- **Contracts** — what the code must satisfy: `<component>.contract.json`.
- **Intent** — why it exists and how it should be used: `design-intent.json`.
- **Evaluation** — whether generated code satisfies those constraints: the evals (feed
  `evals-history.json`, an advisory trend — never the source of truth).

Two deterministic checks stand on the Facts: **parity** (the repo's OWN code vs Facts — is the DS
right?) and **evaluation** (an agent's GENERATED code vs Contracts + Intent — does the agent use the
DS right?). The mechanical checks are the authority; an LLM judge is optional and secondary, never
the primary validator.

**What it does:** Verifies that the code matches Figma. Every gate compares what Figma
defines against what the code implements - nothing more. It does not lint style or judge
the design; it only answers "does the code agree with Figma?". The gates cover:

| What it checks | What passing means |
|---|---|
| **Code matches Figma** | Token values, alias chains per mode, structure, tokens used in screens, icons, states all agree with Figma |
| **Data is up to date** | The Figma snapshots and build output are current, so you are never auditing a stale picture of the DS |
| **Clean CSS** | No unused variables, no values that contradict Figma, no parent rule overriding a child component |
| **What the audit covered** | Which DS components and states the audit actually reached - so gaps are visible, not silent |

**Why this matters for AI:** an agent never has to infer the design system from a Figma
file and invent component names, token values or selectors. It reads the verified facts
this skill emits (the contract and `llms.txt`), so what it builds is grounded, not guessed.

> ## ⛔ INVARIANT — parity runs on ANY Figma plan (non-negotiable)
>
> **No gate or refresh may call a plan-gated Figma endpoint.** Every snapshot the audit needs is
> produced by the **Plugin-API capture (Phase 1, Step 1c)** — which works on every plan and needs no
> special access — and committed to the repo. The Node audit only reads those committed snapshots and
> refreshes the few it can via endpoints that work on any plan; it never depends on a plan-specific
> API. A run that finds a stale snapshot must refresh it with the Plugin-API capture and **still go
> green**; if it cannot, that is a capture bug to fix — not a plan to blame.
>
> **Forbidden "fixes" (they re-introduce a plan dependency this rule exists to kill):** raising or
> removing `maxSnapshotAgeDays` to get past a stale snapshot; skipping/downgrading a gate because a
> refresh could not run; or committing with a bypass. If you ever feel the need to do one of these,
> the correct action is to run the Plugin-API capture instead.
> Do not weaken this rule in a later edit — it is the whole reason the engine is plan-agnostic.

**Report in the chat, in plain English.** The audit prints a gate summary to the
console; relay those results to the user directly in the conversation, in plain language -
which gates passed, which failed, and what each failure means. The parity output is
**always the conversation** - the skill never produces a file, document, or HTML report as
its result. Never declare parity while anything is red. **An audit request is a request to report, not to
fix:** report what is red and what the fix is, and change code, config or snapshots only when the person asks
for that fix.

## Recipes and reference (read the one that fits before acting)

**Start every request with the router.** When the request already came with a `ROUTE:` block (the project's
hook routed it), follow that block. Otherwise run the router, passing the request exactly as the person wrote it:
`rms-design-system-engine --route "<the request>"` (not on PATH: `node ~/.claude/skills/rms-design-system-engine/audit.mjs
--route "<the request>"`). It prints the recipe that fits, the exact command to run (`RUN:`), any rule that applies
(`NOTE:`), the sentences to say (`SAY:`), one `NEXT:` line, and the recipe itself. Do what it prints: run the `RUN:`
command and relay its SUMMARY, or, when it says to run nothing, answer from the recipe it printed. Put each `SAY:`
line in your final reply word for word (when it names a condition, only when that condition holds). Do not pick a
recipe or a command yourself. A request that names no system: say which you took and why, or ask.

This guide holds the rules that always apply. The steps for each task are in a **recipe**: before acting, print
the one that fits with `rms-design-system-engine --recipe <name>` (or read
`~/.claude/skills/rms-design-system-engine/cookbook/<name>.md`, the skill's install folder). Follow it, relay the
engine's SUMMARY, and take its NEXT line. If no recipe fits, read the reference. **A question is a task too**
("how do I…", "what does … mean", "why does …"): print its recipe first and answer from what the recipe and the
reference it points to say, never from memory or from this table alone.

| When the person wants | Recipe |
|---|---|
| to check one component or part ("audit the chip", "verifica o badge") | `audit-component` |
| the whole design system checked | `full-audit` |
| the Figma data refreshed, or it is stale | `refresh-figma` |
| to set the parity up (no `ds-config.json` yet) | `first-setup` |
| to add a GitLab or Notion guidelines link, or where the intent layer is | `guidelines-links` |
| a difference fixed (in code, or what to change in Figma) | `fix-a-difference` |
| known differences accepted as debt | `accept-debt` |
| states, variants or combinations mapped or explained | `states-and-variants` |
| a note in Figma about what a component is or does (a toggle, a button, a heading, its label), accessibility notes, or an accessibility finding explained | `a11y-notes` |
| components compared with their Figma images (`codeReading.visual`) | `visual-diff` |
| to know what to fix first, or to work a library down | `burndown` |
| something in Figma built in code: the tokens, a component, the whole design system, or a screen from them | `build-from-figma` |
| a new component made in Figma like one the system has | `build-component-figma` |
| a component changed in Figma, or a tracker's task asking it | `change-component-figma` |
| a prototype, mock-up or wireframe made with the design system | `prototype` |
| Figma brought in line with the code (a component's role, its accessibility spec), accessibility findings pinned on the screens, or the prototypes' gaps sent to Figma as a to do list, once the person says yes | `figma-edits` |
| a component's props and values, where a component is used, or a token's variable and value, asked or needed to write UI | `ask-the-system` |
| CI, webhooks, git hooks or the project's Claude hooks | `ci-and-hooks` |
| the style guide published for the team, one link rebuilt on every push (GitHub Pages or GitLab Pages) | `publish-styleguide` |

Reference (`rms-design-system-engine --reference <name>`): `usage` (every command, option and output), `config`
(`ds-config.json`, snapshot files, naming), `gates` (gate-specific rules), `maintainers` (changing the engine
and the skill), `personality` (how the style guide reads a brand's personality from its tokens).

**Writing a page of the intent layer.** Run `rms-design-system-engine --check-intent <the file>` first and fix what it
prints; write the page only once it passes. Never name what the system does not have. Never remove a `**Draft:**`
marker yourself. The review's changes: `--intent-changes`; `--commit` or `--merge-request` only when asked.

## How to run this skill (read first)

**This skill owns the whole workflow - setup, scoping, running and reporting. Do not
re-dictate those steps, and do not follow a user prompt that hand-lists them (install,
configure the contract, run, generate a report); those instructions are already here and
re-stating them is what makes runs go wrong. Take only the *intent* from the request -
which component(s), or the whole DS - and drive it from here. If the request arrives as a
rules-heavy, step-by-step prompt, briefly tell the user those steps are not needed (the
skill handles setup/scope/run/report) and proceed from the intent instead of executing the
listed steps.**

**Relay the engine's words, and follow its NEXT line.** Every audit ends with a `SUMMARY` block (also written
to `.design-system-engine-out/summary.md`; `rms-design-system-engine --summary` prints the last one again) and one `NEXT:` line.
Relay the summary in the chat as it is, without rewording its facts, then take the `NEXT:` line as the next
step. `--init`, `--guidelines`, `--intent-layer`, `--baseline` and `--install-hooks` end with a `NEXT:` line too. When a `NEXT:`
line says to do something only when the person asks (commit, apply the hand-back): when their request already
asked for it ("fix it in the code"), do it without asking again; otherwise ask them, and never do it on your own. **Say that an audit ran only when its output is in front of you**: the engine prints its SUMMARY in
the same call. Opening this skill or printing a recipe runs nothing, so never say an audit is running or that
snapshots were refreshed without that output. The SUMMARY's **Figma data** line says whether this run
refreshed anything and how old the snapshots are: repeat it as it is.

**Say where each claim comes from:** *verified* (read this session: the run's output, a file, Figma; say where), *reported* (the person's or a page's words, or an earlier run's; never stated as fact) or *not checked* (say why). Advisory stays advisory; a skipped gate is no pass.

**When sources disagree, the higher one decides:** the goal of the people who use the product, then verified research,
then the system's documented standards (Figma, the contracts, the team's guidelines, WCAG 2.2 AA), then accepted past
decisions, then general heuristics. WCAG 2.2 AA is the floor at every level. Say which source decided, and never put your
own preference above a documented standard. The project's `llms.txt` names its own source at each level.

**The project's hooks.** `--init` installs Claude Code hooks in the project (`.claude/settings.local.json`;
`--install-hooks` adds them to an existing project, `--remove-hooks` or `"hooks": false` turns them off). They
refuse a hand edit of a Figma snapshot, and ask the person before a `ds-config.json` edit, a commit, a push,
applying the hand-back, accepting a difference (`--baseline` or the baseline file), keeping one on purpose (`--keep` or `design-system-engine-kept.json`), marking a check made by hand (`--checked`, only when the person says they checked it), an exception, a code name
recorded for a Figma name (`contract.authored.json`), replacing an approved reference picture, or a code edit, unless the person's latest message asked for that change. After a UI
edit they hand back what it added that the design system does not have (a colour or size written by hand, a
variable declared nowhere, a prop value a component does not take), an accessibility problem it added, and any
comment that switches a check off: fix it in that file before going on. A request made with
`/rms-design-system-engine` arrives already routed (the `ROUTE:` block above). When a hook refuses or asks, that is
the answer: do not work around it (no other tool, no shell edit); tell the person what it said.

**If the `rms-design-system-engine` command is not on PATH** (a plain `command not found`),
do not stop and do not hand-simulate setup: run `node ~/.claude/skills/rms-design-system-engine/audit.mjs <same flags>`
(the install folder), that exact path, never searched for (a search can miss a linked install). Every
`rms-design-system-engine …` below works the same way.

**First-time setup is interactive in the engine - let it run, don't re-ask the questions
yourself.** When `ds-config.json` is missing, running the audit drops into the engine's own
setup interview. An agent turn or CI cannot reliably answer stdin prompts, so pass the
answers as flags: setup then completes in one command:

```bash
node <install-dir>/audit.mjs --init \
  --project='.' \
  --figma-url='<DS file URL or key>' \
  --theme-css='src/styles/theme.css'        # comma-separate multiple files
  # --project: where the code is (. for this folder, another folder, or a GitHub or GitLab link), required
  # --figma-url: optional; --figma-source-url='<upstream DS URL>': optional, consumer/branded-fork files
```

**Setup asks the person, in one message, before it writes anything: where the code is (this folder,
another folder, or a link to its repository on GitHub or GitLab), the link to the Figma file, and a link to the
written documentation for agents (an intent layer in a repository or a docs folder, a wiki or Notion page).** The code is required and never
guessed; the Figma link is optional (without it only the code's own checks run, nothing is compared with Figma,
and the components are the code's own), and so is the documentation link (`--documentation=<link>`). The router asks what the request leaves out, in one message; a setup run
that does not know where the code is writes nothing, and its NEXT line asks. Pass the answer as
`--project=<folder or link>` (`.` for this folder; a GitHub link is cloned beside the folder, `owner/repo`
means GitHub; a GitLab link, gitlab.com or a company's own, is read through GitLab's API, never cloned:
see Where the project is in `--reference config`), or name the token file with `--theme-css`. A request for something else that sent the
person to setup is passed along with `--then='<the request>'`; setup's NEXT line routes it again. Every other choice takes the option that
keeps the most of the system, without asking. `--theme-css` may be omitted when the engine
auto-detects a single token CSS file. A code folder with no design tokens yet starts in build mode
from Figma (`--recipe build-from-figma`), or with `--build`. The project is remembered in the folder it ran from, so
later runs there go to it without `--project`. Token values loaded from hosted stylesheets (one per
mode, such as light and dark × desktop, laptop, tablet) are all taken: setup takes every full
stylesheet address it finds in the code, or the ones `--theme-css` lists (URLs and local files mixed), and writes them
into one local file, `src/styles/tokens.hosted.css`, each mode in its own block. When the code
builds the address from parts (`${theme}-${device}.css`), list every combination the code allows
in `--theme-css`; never ask which modes to keep or whether to merge. Only when no value can be read
from anywhere does setup exit with a clear error: say so plainly instead of forcing a green run.

Route by intent:

- **One or a few components** (the common case - "audit ButtonPrimary", "check the button",
  "run the parity on input"): **whenever the request names a specific component or part of the
  DS, you MUST run scoped to it - pass that name to `--component`.** Do this automatically; the
  user does not need to say "scoped" or know the flag exists. Naming the part IS the request to
  scope to it.
  ```bash
  rms-design-system-engine --component input                # scope to whatever the user named
  rms-design-system-engine --component ButtonPrimary        # or A,B  / repeat --component
  ```
  Then every gate reports **only** findings that belong to that component; DS-wide issues in
  other components are collapsed to a "… N findings outside scope - not audited" line and never
  fail the run - so the whole report is about the one thing being audited, which is the point.
  Run the scoped script directly and report its banner in the chat. This is lean and
  deterministic. Do **not** run the full Phase 1/Phase 2 workflow for a single-component
  check - that is exactly the heavy path that produces noisy, confusing output where a gate
  "fails" on something the user is not auditing. The scope auto-expands to nested sub-components.
  Only run unscoped when the user explicitly asks for the whole DS / a full audit.

  > **A scoped run STILL refreshes *that component* first — "scoped" narrows the audit, it does
  > NOT mean "audit the stale snapshot".** "Lean" means skip the DS-*wide* walk of every other
  > component, never skip Phase 1 for the component you were asked about. When a live refresh is
  > available (token / MCP / Plugin API), before auditing the named component you MUST re-capture
  > **its** live state: its bound + variant tokens (so a **new variable** on it is caught), and its
  > structure INCLUDING its variant set (so it becoming a `COMPONENT_SET`, gaining a `type=…`
  > variant, or changing a slot is caught), then reconcile and re-stamp `_figmaVersion`. The whole
  > reason someone scopes to a component is that they just changed it — auditing its *old* snapshot
  > and reporting green is the worst possible answer. The real miss this rule exists to stop: a
  > `panel` scoped run reported all-green while the designer had just split `panel/background/color`
  > into `panel/background/primary` + a new `panel/background/secondary` and turned the panel into a
  > `type=primary/secondary` set — none of which the committed snapshot knew, because the scoped run
  > never refreshed it. Note `versionLockStrict` alone will NOT save you here: the component
  > **inventory** check compares component *names*, and `panel` is still named `panel`, so a
  > component gaining variants/variables slips through a name diff — only re-capturing the scoped
  > component surfaces it. And never stamp `_figmaVersion` from a capture that skipped the scoped
  > component's variants/variables: a version stamped over a partial capture reads "fresh" while
  > hiding exactly the change you were asked to check.
- **The whole design system:** run `rms-design-system-engine` in the terminal (or `/rms-design-system-engine` in Claude Code),
  then follow the `full-audit` recipe (`rms-design-system-engine --recipe full-audit`).
- **The style guide:** a request that names it gets it, accessibility named or not ("show the
  accessibility of buttonPrimary in the style guide"): `--styleguide`, with `--component <name>` when
  it names one. That page holds the component and the ones it nests only, written beside the whole
  system's page (`styleguide/<name>.html`), never in its place. Accessibility asked for alone stays
  in the chat (`--only accessibility`) and builds no page.
- **Another design system than this folder's:** when the request names a system this folder is not
  set up for ("the style guide for Northwind DS"), the router asks for that system's code (a folder or
  a link to its repository) and its Figma link at once, in one message, and the request runs there with
  `--project`. Never run this folder's system in its place. A cloud session cannot read a folder on
  the person's computer: ask for the repository link, and say that to work on a local folder they run
  `claude remote-control` in it, or open it in the Claude Desktop app.

**Running the command means running the WHOLE thing - Phase 1 included - whenever Phase 1
CAN run.** An unscoped invocation is a request for a full audit, not a Phase-2-only pass over
whatever snapshots happen to be committed. So if a live refresh is available - a valid
`FIGMA_TOKEN`, an authorised Figma MCP, or the Plugin API (`use_figma`, which works on any plan
with no token) - **do the Phase 1 refresh; do not skip it just because auditing the committed
snapshots is fewer steps.** Skipping the refresh and reporting green against 5-day-old snapshots
is the failure mode this line exists to prevent: stale snapshots pass against outdated data, so
real DS drift (retuned tokens, a resized component) stays invisible while every gate reads green.
Only narrow the run when the user explicitly asks for a specific scope (e.g. one component, or
"just re-run the gates").

**Phase 1 (live Figma refresh) is best-effort, not mandatory - "best-effort" means run it when
you CAN, not skip it when it's inconvenient.** Run it whenever a refresh path is available (token,
MCP, or the Plugin API) AND the target is a real screen/frame. When it is genuinely not available
(no token, no MCP, no Plugin API access, or a `COMPONENT_SET` definition URL with no frames),
**skip the live refresh and audit the committed snapshots as they are.** Never hand-improvise Figma
reads or hand-fill snapshot values to fake a refresh - that is unreliable and is a top source of
confusion. And never overwrite a snapshot with a lossy capture: a one-shot structure/icon grab that
mis-selects a variant or measures a wrapper injects *false* drift, which is worse than a stale-but-
accurate snapshot - refresh a snapshot only with a capture faithful to the documented Step 1c/icon
logic, and leave the others stale (say so) rather than corrupt them. Whatever you skip, state it
plainly and which snapshot the audit used; the gates still run, and "Data is up to date" will note
the snapshot's age.

---

Full parity workflow in one command: Phase 1 (live Figma refresh) runs before Phase 2 (code audit) **when it can**, so you don't accidentally audit a stale snapshot.

> **When Phase 1 can run, prefer a fresh query** - a same-day snapshot from a *prior session* may miss renames or additions. Resuming after a summary, compaction or a new conversation, re-query when a live refresh is available; else proceed with the committed snapshot and say so - do not block or improvise.

A Figma value is read in **every mode** of its collection, never from the one a frame shows (`--recipe refresh-figma`, *Read every mode*).

---


## Hard Rules

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
9. **CSS alias chains must mirror Figma exactly.** When Figma aliases a component token directly to a primitive (e.g. `primitives/Neutral 700`), the CSS var must chain through the matching primitive var (e.g. `var(--neutral-700)`). Routing through a semantic intermediate (`var(--border)`, `var(--bg)`, `var(--text-muted)`) is never acceptable as a substitute - even when the resolved hex is identical. A `🔗 ALIAS FAIL` from Gate [3] (Token values) is always fixed in CSS; there is no exemption map.
8. **Every DS sub-component nested inside another DS component must retain its own CSS styles.** A parent component's rule that combines a component class with a bare element tag (`.card svg { color: X }`) directly targets that element - direct targeting beats inheritance. When adding any CSS rule of the form `.<componentClass> <elementTag> { <visual-property> }`, either (a) prove it's a leaf component, or (b) add explicit `.<subComponent> <elementTag> { }` overrides later in the cascade. Add every such rule to the `ALLOWED` map in `subcomponent-isolation-check.mjs`. Gate [12] (Nested components keep their own styles) enforces this mechanically.

---


## Audit Rules

- Change only what the person asked for. Asked to fix one difference (the chip's height), fix that one; list
  the other differences the audit shows and leave them as they are until the person asks.
- Never change source files to *hide* a divergence - report it.
- Always compare **all** configured modes.
- Naming violations are flagged regardless of whether the value is correct.
- When renaming: update declarations, all usages, then rebuild. Update `EXPLICIT` in both `parity-check.mjs` and `bound-check.mjs` if the old name had an explicit entry.
- When adding a token group: add CSS var + rule consumer + update `design-system-engine-map.mjs` + rebuild.
- When removing a token from DS: remove CSS var if unused (Gate [11] (Clean CSS) catches it), replace in rules if used, remove from `design-system-engine-map.mjs`, remove from `EXPLICIT`/`COVERED` if present.
- When removing an entire component from DS: Phase 1 shows many REMOVED tokens for that component. Remove all its CSS vars (Gate [11] (Clean CSS) flags any that remain). Remove all its CSS rules. Remove from `design-system-engine-map.mjs`, `EXPLICIT`, `COVERED`, and `figma-structure.snapshot.json`. Re-run bound walk to purge it from `bound-tokens.json`. Rebuild.

---


## End-of-Run Confidence Summary

After every run, report this table so the practitioner knows exactly what the audit guarantees:

| Area | Method | Confidence |
|---|---|---|
| Token values match Figma | Automated (Gate [3] (Token values) - resolver against live snapshot) | High |
| All Figma tokens have a CSS var | Automated (Gate [4] (Tokens used in screens exist in CSS) - bound-check against frame walk, auto-refreshed) | High if frames configured; **not run** if `frames: []` |
| All state tokens wired | Automated (Gate [14] (All states are built) - state walk, auto-refreshed) | High |
| No unused CSS vars | Automated (Gate [11] (Clean CSS)) | High |
| No hardcoded values in rules | Automated (Gate [11] (Clean CSS)) | High |
| Structural parity (height, padding, gap) | Automated (Gate [13] (Structure)) | High |
| Figma annotation acknowledgment + CSS verification | Automated (Gate [13] (Structure)) | High |
| Surface container --area-bg declarations | Automated (Gate [13] (Structure)) | High if SURFACE_CONTAINERS populated |
| Button modifier-class base compliance | Automated (Gate [13] (Structure)) | High if BUTTON_CLASS_RULES populated |
| Nested components keep their styles | Automated (Gate [12] (Nested components keep their own styles)) | High |
| Build freshness | Automated (Gate [1] (Data is up to date)) | High |
| Removed tokens reconciled | Manual (Phase 1 diff) | Medium - verify any "used in a rule" replacements visually |
| Component states fully wired | Automated (Gate [14] (All states are built)) | High |
| SVG symbols + path freshness | Automated (Gate [20] (Icons) - icon contract: symbol docs + path data + live Figma check) | High if all symbols documented and FIGMA_TOKEN set |
| Looks the same as Figma | Automated (Gate [2] (Figma frame unchanged), requires FIGMA_TOKEN) or Manual (Step 7 screenshots) | **Not run** if neither is configured |
| CI enforcement | GitHub Actions (`.github/workflows/design-system-engine.yml`) | High if configured |

Flag any row marked **not run** or **skipped** explicitly in the summary - do not imply full coverage.
