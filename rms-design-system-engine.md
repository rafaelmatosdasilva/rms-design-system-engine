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
hook routed it), follow that block. Otherwise run the router, passing the whole request exactly as the person wrote it, its opening words included:
`rms-design-system-engine --route "<the request>"`. It prints the recipe that fits, the exact command to run (`RUN:`), any rule that applies
(`NOTE:`), the sentences to say (`SAY:`), one `NEXT:` line, and the recipe itself. Do what it prints: run the `RUN:`
command and relay its SUMMARY, or, when it says to run nothing, answer from the recipe it printed. Put each `SAY:`
line in your final reply word for word (when it names a condition, only when that condition holds). Do not pick a
recipe or a command yourself. A request that names no system: say which you took and why, or ask.

This guide holds the rules that always apply. The steps for each task are in a **recipe**: before acting, print
the one that fits with `rms-design-system-engine --recipe <name>` (or read
`~/.claude/skills/rms-design-system-engine/cookbook/<name>.md`). Follow it, relay the
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
| to know what to fix first, work a library down, or plan an adoption | `burndown` |
| something in Figma built in code: the tokens, a component, the whole design system, or a screen from them | `build-from-figma` |
| a new component made in Figma like one the system has | `build-component-figma` |
| a component changed in Figma, or a tracker's task asking it | `change-component-figma` |
| a prototype, mock-up or wireframe made with the design system | `prototype` |
| Figma brought in line with the code (a component's role, its accessibility spec), accessibility findings pinned on the screens, or the prototypes' gaps sent to Figma as a to do list, once the person says yes | `figma-edits` |
| a component's props and values, where a component is used, or a token's variable and value, asked or needed to write UI | `ask-the-system` |
| CI, webhooks, git hooks or the project's Claude hooks | `ci-and-hooks` |
| the style guide published for the team, one link rebuilt on every push (GitHub Pages or GitLab Pages) | `publish-styleguide` |
| an idea, an article or a fix for the engine itself, not for a design system | `engine-ideas` |

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
do not stop and do not hand-simulate setup: run `node ~/.claude/skills/rms-design-system-engine/audit.mjs <same flags>`,
that exact path, never searched for (a search can miss a linked install). Every
`rms-design-system-engine …` in this guide works the same way.

**Setting the parity up** (no `ds-config.json` yet) is the `first-setup` recipe. The engine's own setup asks on stdin,
which an agent turn cannot answer, so its answers go in as flags, and the person is asked, in one message, only what the
request leaves out.

Route by intent:

- **One or a few components** (the common case - "audit ButtonPrimary", "check the button"): naming a part is the
  request to scope to it, so pass that name to `--component` without being asked, and refresh that component from Figma
  first when a refresh is available (the `audit-component` recipe). Run unscoped only when the person asks for the whole
  system.
- **The whole design system:** run `rms-design-system-engine` in the terminal (or `/rms-design-system-engine` in Claude Code),
  then follow the `full-audit` recipe.
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

**An unscoped run is a full audit:** the Figma refresh (Phase 1) runs first whenever a refresh path exists, and when
none does, the committed snapshots are audited and the reply says which (the `full-audit` recipe). Never hand-fill a
snapshot to fake a refresh.

A Figma value is read in **every mode** of its collection, never from the one a frame shows (`--recipe refresh-figma`, *Read every mode*).

---


## Hard Rules

What counts as a difference, and what a fix must keep (every Figma token its own variable, wired, named exactly, right in
every mode, its alias chain as Figma has it): the `fix-a-difference` recipe, *What parity holds the code to*.

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
