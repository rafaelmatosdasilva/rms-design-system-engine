# Usage: every command, option and output

Part of the rms-design-system-engine reference (`rms-design-system-engine --reference usage`). The rules that always apply are in the main guide.

## Usage

```
/rms-design-system-engine
```

**You do NOT have to audit the whole design system.** Scope the run to one or more chosen
components - the common case when you are working on, or checking, a single component:

```bash
rms-design-system-engine --component ButtonPrimary                # one component
rms-design-system-engine --component ButtonPrimary,Toast          # several (comma-separated)
rms-design-system-engine --component ButtonPrimary --component Toast   # or repeated
```

In a scoped run the gates report **only** findings that belong to the chosen components;
everything else is collapsed to a single "… N findings outside scope - not audited" line,
and a gate that failed only on out-of-scope items passes for that run. This is what keeps a
single-component check clean instead of drowning in the rest of the DS. Because a component
**contains** others (a button may hold an icon, a card a badge), the scope **auto-expands**
to the nested components used inside the chosen ones (found via their source files, so the
parent is never passed while a child it depends on is broken); the banner lists what was
pulled in. Only a component's own source counts: the file the shared pairing gives it
(`component-pairing.mjs`: `componentFiles` always wins; a strong sign such as the file's name,
the component it declares, its first class or its folder pairs alone, as `HbIconButton.vue` is
iconButton's and `Chip/index.tsx` chip's; weak signs such as a generic file name, the library's
prefix, the tokens the file uses or a state-word sibling pair only when two agree, and one alone
is only a proposal to confirm or pin). A page that shows several components, the theme CSS, a native element (`<button>`,
`type="button"`) and a name inside a longer one (button inside iconButton) pull in nothing. A
finding that names a component belongs to that component; one that names none (a token, a
shared rule) belongs to the scope when its file mentions a component in scope. The burndown
of a scoped run counts only its components. Set a default in `ds-config.json → scopeComponents: ["ButtonPrimary"]` if a repo
should always run scoped. Omit the flag to audit the whole DS.

**A name the system does not have.** A component asked for that is in neither the Figma data nor the code (no file
named for it, no element with its class) is said: "nothing about it was checked", in the report and the summary
(**Nothing checked**), and the NEXT line asks the person which component they mean, never a pass. The router knows the
components only the code has (a file whose first element carries a class of its own) as well as Figma's, and before
any is known (no snapshot yet) it still scopes to a name written as one (`buttonPrimary`, "the card component").

**No Figma data captured yet.** With a Figma file set up and no snapshot readable, nothing was compared with Figma:
the summary says so (**No Figma data captured yet, so nothing was compared with Figma**, and **Nothing compared with
Figma yet** in place of In parity when the code's own checks pass), and the NEXT line is the capture
(`--recipe refresh-figma`), then the same run again.

**Only part of the run.** `--only` runs the part asked for and nothing else; the report and the summary say what ran,
so a part never reads as the whole system passing:
```bash
rms-design-system-engine --only accessibility             # the accessibility check alone (from the code, and in the browser when it can)
rms-design-system-engine --only parity                    # every gate against Figma, without the accessibility check
rms-design-system-engine --only 3                         # one gate by number (1 to 25), or by name: --only "token values", --only states,props
rms-design-system-engine --component chip --only accessibility   # with a scope, as any run
```
A word it does not know prints the list of gates. `--baseline` needs the whole run, and the trend and the "since the
last run" comparison are kept for whole runs only. The router turns "check the accessibility of the button", "without
accessibility" or "only the token values gate" into the right `--only`.

**Utility flags (no full audit - run the terminal command directly):**
```bash
rms-design-system-engine --init                          # first-time setup only: asks where the code is and for the Figma link (optional), scaffolds config files, then exits; a project already set up keeps its ds-config.json (--reconfigure replaces it)
rms-design-system-engine --init --project=<. | folder | GitHub or GitLab link> --figma-url=<url>   # non-interactive setup (for agents/CI): --project required (or --theme-css=<path>), --figma-url and --figma-source-url=<url> optional; --then='<request>' routes the request that led to setup once it is done
rms-design-system-engine --init --figma-url=<url>           # a project already set up: read another Figma file or a branch of it (a branch link names the branch); only figmaFileKey changes, then refresh the Figma data
rms-design-system-engine --version                       # am I on the latest? compares local vs remote (a normal run also nudges once/day)
rms-design-system-engine --update                        # update to the latest - no re-download
rms-design-system-engine --link-command                  # (re)point the /rms-design-system-engine command at the install via symlink
rms-design-system-engine --trend                         # show last 20 audit runs + pass/fail trend
rms-design-system-engine --exemption-debt                # list every exemption/escape-hatch (debt report + legibility: temporary/permanent/owner; totals show on every run)
rms-design-system-engine --code-drift                    # list props that exist in code but not in Figma (code→design "sync back" advisory; totals show on every run)
rms-design-system-engine --contract-completeness         # list components whose emitted contract has no description (agent-readiness gaps; totals show on every run)
rms-design-system-engine --agent-rules [--write[=<file>]]  # the engine's rules for an agent with no hooks (Cursor, Copilot): shown, and asked about; --write puts them in AGENTS.md, CLAUDE.md, .cursorrules, .github/copilot-instructions.md or .cursor/rules (those the project has, else AGENTS.md), between markers, once the person says yes (the hook holds it until then)
rms-design-system-engine --sign-off "chip size=xl" --by "<who>"  # a named person signs off what an edit adds to the system itself (a token, a component's option): the hook lets that edit through; --sign-off alone lists them
rms-design-system-engine --edit-check [file …]           # the check the hook makes on each UI edit, on demand: the files named, else every UI file changed since the last commit; exits 1 when something the system does not have was added
rms-design-system-engine --query badge --hb-radius-control  # a component's props (names exactly as the code writes them, Figma's where they differ) and where it lives, or a token's variable, values per mode and, for a text colour, the surfaces it reads on
rms-design-system-engine --figma-change chip "add xl to size like l"  # a change to a component Figma has, only what changes, with its report (what changes, where it is used, what breaks); --change-report chip after, the read before beside the read after
rms-design-system-engine --spec "a tag like the chip"     # the spec of a new component built in Figma like one the system has: only its variables, components and names; what it cannot ground is a question (--ops adds the steps; --figma-build <name> writes the Figma script)
rms-design-system-engine --hygiene                       # list every Figma file hygiene finding: values with no variable or style, detached instances, no auto layout, no description, variables bound outside their scope or left on all scopes (the first 15 show on every run)
rms-design-system-engine --census                        # every value written by hand in the project's styles (colours, spacing, radii, font sizes, durations, layers, shadows), each with its line and the token to use, the files that guess most first; keeps the count in design-system-engine-census.json so it only falls (exits 1 when a file has more than it); --census --all lists every line
rms-design-system-engine --prune                         # list prune candidates: deprecated tokens, single-option variants, single-use components (totals show on every run)
rms-design-system-engine --duplication                   # list DS names restated by hand-maintained surfaces (opt-in via ds-config duplication.surfaces; totals show on every run)
rms-design-system-engine --code-connect                  # list stale/invalid Figma Code Connect mappings vs the contract (auto-detected from committed *.figma.tsx; totals show on every run)
rms-design-system-engine --guidance-rating [--extract]   # how much an agent can take from the guidance: ready, partial or thin per component; --extract asks a model (your tokens)
rms-design-system-engine --no-docs                       # skip the design-intent layer this run (emitted by default; local, gitignored)
rms-design-system-engine --refresh-figma                 # read Figma the best way there is: design.json, figma-cli, else says how
rms-design-system-engine --from-figma-cli [design.json]  # read figma-cli's design.json into the snapshots
rms-design-system-engine --capture-script vars <n|sums>  # write the read-only script for chunk n of Figma's variables, text styles and effect styles (sums: the checksums alone), to run unchanged with use_figma; save its answer as it came. Each answer is compact (a short record per variable, colours in hex, numbers in their shortest exact form) and near 19,000 bytes, so about 1,900 variables take about ten
rms-design-system-engine --capture-script components <sums|sums new|next>  # the same for the components, kept by component id: sums gives each component's checksum, a page at a time (the next page when one is left, 'sums new' starts over), next reads as many of the components no answer holds yet as fit in one answer, compressed (one read at a time; a number reads the same as next); each runs the recipes' Step 1c functions, state walk and raw-value sweep in Figma, and none switches Figma's page
rms-design-system-engine --capture-import [vars|components]  # check every saved answer against the checksum Figma computed, name the chunks to read again (answers saved in the form before still read, or are named to read again), and once all are there write the vars snapshot, or the structure and props snapshots with component-values.snapshot.json, component-state-tokens.json and component-state-bindings.json (keeping what a chunk did not read, naming the components no longer in Figma)
rms-design-system-engine --styleguide                    # the style guide of what Figma and the code agree on, only
rms-design-system-engine --component modal --styleguide  # audit that component (Figma and accessibility in a browser), then a page of it and the components it nests (styleguide/modal.html), its address printed
rms-design-system-engine --styleguide --no-a11y-bake     # the page without its accessibility tried while it is built (a page only measured, as a CI's first build is)
rms-design-system-engine --guide-status                  # is the style guide the team opens (its store) behind what it is built from, and is its pipeline running
rms-design-system-engine --publish-styleguide            # write the CI job that publishes the style guide on every push (GitHub Pages or GitLab Pages, from the git remote; --host github|gitlab, --print to only show it)
rms-design-system-engine --docs                          # ALSO build the styleguide HTML this run (design-intent itself is already automatic)
rms-design-system-engine --no-contracts                  # skip the standard contract + DTCG tokens this run (emitted by default; local, gitignored)
rms-design-system-engine --contracts-out <dir>          # publish the contracts (one per code file, schema, README) into a shared repository's folder; never pushes
rms-design-system-engine --watch-intent-layer [min]     # keep running: build the style guide again each time the intent layer gets a new commit (checks every 5 min)
rms-design-system-engine --check-intent [file|folder]   # whether what intent-layer pages say is true of the system: a page (or folder) before it is written to the layer, or the whole layer; exits 1 on any finding
rms-design-system-engine --intent-changes               # make the changes the Intent layer review asks for in the layer's own files (repeated lines out, contradicted sentences written again as drafts, missing parts drafted), into .design-system-engine-out/intent-changes/ to read first
rms-design-system-engine --intent-changes --merge-request  # the same, sent to the layer as one merge request for the team to review; only when the person asks
rms-design-system-engine --writes                       # what this project lets the engine change, one answer per place; --writes <figma|code|generated|engine> <yes|ask|no> records one
rms-design-system-engine --intent-autofix on|off        # whether each run of the audit and of the style guide fixes the intent layer and commits it straight on its branch (ds-config.json → intentLayer.autoFix "commit")
rms-design-system-engine --intent-decide                 # the engine's proposed answer to each of the team's decisions on the Documentation page (Fix, Add, Move), with its key and what it rests on
rms-design-system-engine --intent-decide "<key>[,<key>]" yes|no  # the team's answer ("all" for every open one), kept in design-system-engine-intent-decisions.json; what the answer changes in the intent layer is made and committed at once (a no to a Move merges the part into its parent's page, a no to a Fix writes the sentence again as a draft, a page to write is started from its code), and a Fix not answered yet is left as it is
rms-design-system-engine --review-drafts                 # every draft in the intent layer to review: its page, its section, its text
rms-design-system-engine --review-drafts <file>          # a person's review of them, [{ page, line, do: approve | change | drop, to }], made in the layer's files (a change checked against the system first); --commit or --merge-request sends it, only when asked
rms-design-system-engine --review-drafts --approve <page>  # one decision, as each page's drafts give it: --approve or --drop every draft on the page (or one: <page> '<line>'), --change <page> '<line>' '<new words>' ; --task '<title>' keeps it to that task's drafts, --expect <n> to the number the person saw, --said '<their words>' keeps them with it; <page> may be 'the System page'
rms-design-system-engine --draft '<page>' '<section>' '<line>' ['<line>'…] --task '<title>'  # lines drafted for the team to review, under that section, marked **Draft (<title>, <day>):**; --commit or --merge-request sends them, only when asked
rms-design-system-engine --intent-changes --commit      # the same, as one commit straight on the layer's branch, only while it is where it was read (drafts keep their marker); only when the person asks
rms-design-system-engine --intent-changes --drafts-from <file>  # the drafts from answers already written (when the claude command cannot draft, the requests are in .design-system-engine-out/intent-draft-request.md); --no-drafts: only the mechanical changes
rms-design-system-engine --decision <what it is about> "<what was decided>" [--ruled-out "<option>"]... [--why "<reason>"]  # one line under the Decisions heading of that page in the intent layer (a component, pattern, template, flow, foundation or the system), with who and when; written locally to read first, --commit or --merge-request sends it, only when the person asks
rms-design-system-engine --decisions                     # every decision recorded, newest first, wherever it was made
rms-design-system-engine --part <part> <root|none>         # the team's answer to a part question: placed only inside <root> (written on the root's page in the intent layer, under Parts as ### <part>, and as a decision), or none, a component of its own; written locally to read first, --commit or --merge-request sends it, only when the person asks
rms-design-system-engine --store                         # where each part lives (snapshots, intent layer, contracts, style guide, decisions, themes) and what this person may do there, as GitLab answers
rms-design-system-engine --store <part>=<link|folder|nowhere> [--store <part>.path=<folder in it>] [--store <part>.branch=<branch>]   # name where a part lives (ds-config.json → stores); who may change it is GitLab's answer, never asked
rms-design-system-engine --profile <link|file>           # set up from the company's profile (or take its new version): the shared setup and the stores, nothing asked; kept in ds-config.json and read again each run
rms-design-system-engine --profile-new [file] [--name <company>]     # ask where each part lives, one question a part (a terminal; else --store), then write this setup as the company's profile
rms-design-system-engine --profile-export [file] [--name <company>]  # write this setup as the company's profile as it is: no token, nothing one person set for themself
rms-design-system-engine --make-command <client> --profile <link> [--dir <folder>]   # write the command the team installs, /rms-design-system-engine-<client>: the engine with that profile
rms-design-system-engine --readmes                       # the README of each repository the setup names (the profile's, each store's) brought up to date now, where GitLab lets this person, and what happened to each (every run does it quietly)
rms-design-system-engine --refresh-snapshots             # send the snapshots this folder holds to the snapshots store, when GitLab lets this person write it
rms-design-system-engine --share-theme <file.theme.json>…  # send a theme saved from the style guide to the team's themes store, for everyone's Theme choice
rms-design-system-engine --baseline                      # capture today's failing gates as accepted adoption debt (commit design-system-engine-baseline.json)
rms-design-system-engine --baseline --findings           # the same, each failing ❌ line accepted on its own
rms-design-system-engine --keep --match <words> [--component <name>] --reason "<why>" [--by <name>] [--truth figma|code] [--review <date|90d>]   # keep the open differences of the last full audit that match, on purpose, with the person's reason (commit design-system-engine-kept.json)
rms-design-system-engine --keep                          # list the kept differences
rms-design-system-engine --unkeep --match <words> [--component <name>]   # take kept differences back: open again on the next audit
rms-design-system-engine --baseline --findings --match radi   # only the lines that name it (the radius, not the rest)
rms-design-system-engine --no-baseline                   # ignore any design-system-engine-baseline.json this run (enforce every gate)
rms-design-system-engine --checked badge 1.3.3 --by "QA"  # the person checked a criterion only a person can judge: Done in the style guide, by them and when, until the component changes (commit design-system-engine-checked.json)
rms-design-system-engine --unchecked badge 1.3.3          # take it back: to check again
rms-design-system-engine --rename-sweep                  # a token renamed in Figma, renamed everywhere in one change: one patch for the system and one per product, every rule, script and doc, the old name kept in the theme pointing at the new one (nothing applied)
rms-design-system-engine --rename-sweep --since v2.3.0   # the renames since that git ref, not since the last committed read of Figma; --no-keep-old drops the old names
rms-design-system-engine --figma-motion                  # write the read-only script that reads, on every page, Figma's prototype transitions between variants, each component's Motion keyframes and animation styles, and the overlays its prototype opens, to run with use_figma
rms-design-system-engine --figma-motion <answer.json>    # keep its answer as the motion snapshot (paths.snapshotMotion) and say each transition the code makes otherwise (at once, another duration, another curve), and each component's loop, opening and closing that differ (motion-components.mjs)
rms-design-system-engine --figma-examples                # read the examples the design team placed in Figma (each component's instances on its pages, outside the component itself: its words, its icons, the instances it holds), through figma-cli in parts when it answers, else write the script for the session's Figma tool (--from N for each part); the style guide's Playground opens each component as its best example
rms-design-system-engine --figma-examples <answers.json…> # keep the saved answers as the examples snapshot (paths.snapshotExamples, figma-examples.snapshot.json beside the variables snapshot)
rms-design-system-engine --figma-brands                  # read the system's brands: Figma's extended collections (each a skin over the system's own collections, its colours and its sizes) and the variables each overrides in each mode, from the file that holds them (the FigCli plugin open on it), through figma-cli a collection at a time when it answers, else the read-only script for the Figma tool (--collection "<name>" --from N)
rms-design-system-engine --figma-brands <answers.json…>   # keep the saved answers as the brands snapshot (paths.snapshotBrands, figma-brands.snapshot.json beside the variables snapshot); the style guide's Brand switch puts each brand on every preview and the Showroom, never on the page around them
rms-design-system-engine --brands-css <a.css b.css | addresses…>  # the same brands snapshot from the brands' own stylesheets (one file a brand, named by the file; /* extends: <brand> */ puts it under another; each block's variables in the mode its selector names, a block with none in the base mode), or the files ds-config.json lists in brands.css: the brands can live in the code's repository instead of Figma
# the style guide's Showroom: each showroom/<Screen>.vue (a screen from Figma written with the system's own components; what the code lacks a stand-in in showroom/stand-ins/) drawn by the project's build, at Figma's size and breakpoint, in the brand and mode chosen. The Showroom page lists the screens as a grid of cards (each its screen in small); a card opens the screen's own page (#showroom/<Screen>), the screen alone until Differences is pressed: then each note of its <Screen>.json (missing, and differs: fixedHere or not) is numbered, pinned over its part of the screen (the note's at, a selector, else the part named data-figma or data-stand-in) and listed beside it in a line (its say; the whole of it, what, under it), filtered by kind; a pin clicked shows its note on the screen. A screen is liquid: laid out to its breakpoint's width (Auto, the room there is, Desktop from 1440px; Desktop, 1440px; Laptop, Figma's own), and Full browser shows it alone over the whole browser window. The screens are drawn and measured at Laptop, Figma's size. Corrections several screens share can sit in one stylesheet (showroom/shared/), each still listed in every screen's own list
rms-design-system-engine --showroom-compare [--refresh] [--tolerance=N]  # each Showroom screen measured against the Figma screen it was written from (its link in <Screen>.json): Figma's box for every text and component (showroom/<Screen>.figma-layout.json, read through figma-cli when missing, else the script for the Figma tool), the built page measured in Chrome, every text matched by its words and every part named with data-figma, each one more than N px (2) off listed, furthest first. Every --styleguide build runs it too, says it in its summary and shows it beside each screen
rms-design-system-engine --figma-effects                 # write the read-only script that reads each component's shadows and blurs, gradient and image fills, Clip content, blend mode and opacity, on it and its layers two levels deep, to run with use_figma
rms-design-system-engine --figma-effects <answer.json>   # keep its answer as the effects snapshot (paths.snapshotEffects) and say each one the code draws otherwise (effects-parity.mjs)
rms-design-system-engine --figma-screens                 # write the read-only script that reads the screens ds-config.json names (frames and screens), to run with use_figma
rms-design-system-engine --figma-screens <answer.json>   # keep its answer as the screen layout snapshot (paths.screenLayout) and compare each product's page with its screens
rms-design-system-engine --figma-a11y                    # write the read-only script that reads the same screens for accessibility: each text and lone icon with what is drawn behind it, inside instances, and each control under 24 by 24, to run with use_figma
rms-design-system-engine --figma-a11y <answer.json>      # keep its answer as the screen accessibility snapshot (paths.screenA11y) and say what the screens owe (screen-a11y.mjs); every audit with accessibility says it again
rms-design-system-engine --summary                       # print the plain result of the last run again (relay it as is); a full audit's has the components passing, drifting and not checked under its verdict, and says when the Figma file is only partly or not reliable enough to compare
rms-design-system-engine --install-hooks                 # add the project's Claude Code hooks (done by --init); --remove-hooks takes them out
rms-design-system-engine --doctor                        # check the install (command link, hooks, Chrome, Node) with the one fix for each problem
rms-design-system-engine --route "<request>"             # the first step for any request: the recipe, the exact command, SAY and NEXT (the project's hook runs it for /rms-design-system-engine requests)
rms-design-system-engine --recipe [name]                 # print a task recipe from the skill's cookbook (no name lists them)
rms-design-system-engine --reference [name]              # print a reference file from the skill (no name lists them)
rms-design-system-engine --guide classic|current         # link the command to the guide as one file (as before the split), or back
node ~/.claude/skills/rms-design-system-engine/parity-check.mjs --fix                   # auto-fix sizing/typography divergences in theme.css
node ~/.claude/skills/rms-design-system-engine/setup-webhook.mjs --list                 # list registered Figma webhooks for this file
```

### Build mode

A project whose code has no design tokens yet starts in **build mode** (`ds-config.json` → `"build": true`): setup
chooses it when the code's folder has no stylesheet of tokens and a Figma file is given, or when it runs with `--build`. The engine still writes no code; it says what to build and
checks each piece once it exists.

- **What is left to build, in order.** The report ends with a `🧱 TO BUILD` line: the tokens first, then each component
  Figma has and the code does not yet, a component after the ones it nests. NEXT names the next item with its commands.
  Something still to build is never a failure; once it exists it is compared like everything else.
- **Tokens.** The token check writes every Figma variable the theme does not declare yet, exactly as the theme should
  declare it (name, value, the block for each mode and breakpoint), to `.design-system-engine-out/handback/tokens-to-build.css`,
  to copy into the theme file. A declared token with a wrong value still fails.
- **Components.** `--query <name>` prints a component's build sheet: its class, height, padding, gap, radius and colours
  with their variables, the text style, the selector of each state and variant (a modifier class such as `.chip--l`,
  a pseudo-class for a state: `:hover:not(:disabled)`, `:active`, `:focus-visible`, `:disabled`), its role and the
  components it nests. A variant gets a selector only when it changes a style (one that only shows a layer, such as an
  icon, is markup). A colour Figma paints with no variable is named with its value, to write as it is and report,
  never as an invented variable. An experimental component gets its sheet when asked for, though it stays off the
  build list. Every line is what the structure check compares once the component exists, so a component built from
  the sheet needs no `structure-contract.mjs` entry; an entry the project writes always wins. When a product already
  uses the component, one line shows how its code writes it, with the file and line, to copy.
- **Colour pairs.** For every text and icon colour, the engine works out the one surface it was made for: read from
  the names (`content/on-interactive` goes with `surface/interactive`, `text/primary` with `surface/primary`) and
  confirmed against the values in every mode. `--query` on that colour prints `goes on: <surface>` with the contrast
  the two give, before the list of every surface it would also work on; `llms.txt` carries the whole list, and the
  tokens contract keeps it per token. Given only the list of what would work, an agent picks a different grey on
  every card, which is how a page ends up correct and wrong at once. The edit check flags a colour put on a surface
  it was not made for, with the contrast there: every token is the system's own, so nothing is invented, and what is
  wrong is the pairing. A pair whose names say they go together and whose values do not meet 4.5:1 is reported as
  what it is, never dropped for failing: the system's own words against its own numbers.
- **Component stylesheets.** A component built into its own stylesheet (`src/components/button.css`) is found by its
  class and added to `paths.themeCSS` after the token file, said once in the report, so every gate reads it.
- **A token an edit invents.** In any project, a custom property an edit adds with a value of its own (a colour, a size) that Figma has no variable for is handed back, in the theme too; one that only points at the system's tokens, or that Figma has, is not.
- **A new component is a decision.** A class rule an edit adds whose declarations are mostly a system component's (most of the larger rule written alike) goes back at once: use that component, with a new option if it needs one, or ask the person whether the new one belongs in the system. Never kept without asking.
- **A change to the system itself is signed off.** An edit that gives the theme (`paths.themeCSS`) a token it did not declare, or a component a quoted option beside its own that its contract does not have (`['s', 'l', 'xl']`), adds to what every product gets: the project's hook holds it until a named person signs it off. `--sign-off "<what>" --by "<who>"` records it in `design-system-engine-signoffs.json` (the hook asks first unless the person's latest message gives the sign-off), and the edit then goes through; `--sign-off` alone lists them. The record is never edited by hand, and `--signed-off` on `--figma-build` and `--figma-change` is held the same way.
- **A last check before the agent finishes.** The Stop hook runs the edit check once more over every UI file the session changed, against the last commit; a value the system does not have that an edit left in place goes back once, with the file and the line. Lines that were already in the commit do not count.
- **Never a secret in the chat.** Whatever the request, the Stop hook sends back once a final reply that asks the person for a token, key or password: the person puts it in the project's `.env` themselves. A design token named in a question is not a secret.
- **Measured differences fail.** In build mode a value the browser measures on the rendered component that differs from Figma (a height, a line height, a colour) fails Gate [13] (Structure), and its direction is always back to Figma's value: the code was just written from it. A value the page could only read as the browser's default is shown, not failed. `renderedParityStrict: false` keeps them advisory.
- **The role, even with only states.** Figma's role annotation is read in the markup of every component that has one, also when all its props are states (a field whose only prop is `State` still has to be a real `<input>`).
- **The sentence owed.** Building a component Figma paints with a colour that has no variable, the route asks for one line in the reply saying so, and the Stop hook sends the agent back when the reply leaves it out: twice at most, so a first hand-back spent on something else does not lose it.
- **While building.** The edit check counts the tokens still to build as the system's own, so a component written
  before its tokens is still checked against them. Unused tokens are expected and do not fail.

### Where the engine may write

**Read this before changing anything.** `ds-config.json` → `writes` gives one answer per place, and the whole engine
reads the same one:

| Place | What it holds |
|---|---|
| `figma` | the design file: what Figma shows (a role, a name, an annotation, a component) |
| `code` | the product's code: the files people wrote |
| `generated` | the code the engine generated: the tokens, the contracts, the style guide |
| `engine` | the engine's own files: the authored contract, the structure contract's notes, the kept differences |

Each is `yes` (write it, and say what changed; the product's code only through a branch and a pull request), `ask`
(show the person the exact change and wait for a yes, every time) or `no` (never: the change goes on the Tasks page,
for whoever owns that place). A place with no answer is `ask`, the engine asks once and records the answer, so every
session and every run read the same one rather than each asking again. `rms-design-system-engine --writes` prints
them; `--writes figma ask` records one.

Two things the setting cannot override. On CI there is nobody to answer, so `ask` is `no`; and CI never writes the
design file or the product's code whatever the setting says. Both are said out loud, never silently.

A project whose answer for the design file is `no` gets the list of Figma changes and no script to run: never write a
script of your own in its place, and say that the changes are on the Tasks page.

### The design-intent layer (auto OUTPUT, never a gate)

The design-intent layer is an **output**, not a verification — the same category as the
contracts. It runs as a post-step *after* the gates, reusing the fresh snapshots, and **never
affects pass/fail**. Because this is an **agnostic** engine, the default **adapts to the
project** instead of forcing a private file on everyone: it **auto-generates once the project
has ADOPTED it** — an existing `design-intent.json`, a `docs.out` path, or `docs.auto: true` in
`ds-config.json` — or when the run passes `--docs`/`--intent`. A **zero-signal project gets no
surprise file**. Once adopted it stays fresh **every run** (like the contracts), so an AI agent
(and the styleguide) always read a **current** DS rather than a stale one. Force it off with
**`--no-docs`** or `ds-config.json → docs.auto: false`. To guarantee it on a fresh clone (the
file is gitignored, so absent after checkout), set `docs.auto: true`. It is deliberately NOT a
gate: a gate answers "does the code match Figma?", and generating documentation is neither a
check nor something that decides the verdict. The heavier **styleguide HTML stays opt-in** — it
builds with `--styleguide`, an explicit `--docs` (alias `--intent`) or `ds-config.json → styleguide.auto:
true`, from the engine's template unless the project names its own.

It writes **one** merge-aware file, `<theme-css dir>/design-intent.json` (override with
`ds-config.json → docs.out`) — a project's **intent layer**, organised as
`{ system, foundations, components, patterns, templates, pages, flows }`. It is a generated
**view over the canonical sources — nothing is hand-copied**:

- **Design intent** ← Figma component `description` + `annotations` (from the component-props snapshot).
- **Code intent** ← each component's `structure-contract.mjs` `_note` **and** the comment that
  precedes its rule in the token CSS.
- **Facts** ← the structure snapshot (height, padding/gap tokens, fill, variants, properties).
- **Usage** ← which plugin sources reference the component's class.
- **External guidelines** ← your own doc(s) listed in `ds-config.json → guidelines: { sources: [...] }`
  (Markdown or JSON, committed to the repo). A section whose heading matches a component name attaches
  to that component (`components[name].guidelines`); the rest becomes a global `guidelines` block. This
  is how prose from an external source (a Notion export, a house styleguide) reaches agents without
  being invented or duplicated. The generator hashes the file(s) so a change is detectable, and it only
  reads the **committed** file, never the live network. A live Notion/URL fetch, when you configure one,
  is a separate capture step (Phase 1) that writes that file first, then the generator folds it in. It
  never follows links inside a doc: list every page you want in `sources`. Advisory, never a gate.

**Wiring an external guidelines doc** (e.g. a Notion page). In `ds-config.json`:
```jsonc
"guidelines": {
  "sources": ["guidelines.md"],               // the committed file the generator reads (md or json)
  "source":  { "notion": "<page url or id>" }  // OPTIONAL: refresh guidelines.md from Notion each run
}
```
`sources` alone is enough: export the doc to Markdown, commit it, done. To make the refresh automatic
from Notion, the person does three one-time things: (1) create a Notion **internal integration** and
copy its secret; (2) **share the page** with that integration; (3) put the secret in the project's
`.env` as `NOTION_TOKEN` (gitignored, so it is per-person and never committed). The page **link** in
`ds-config.json` is not secret and is committed; the **token** stays in each person's `.env`. No token,
page not shared, or offline → the audit keeps the committed `guidelines.md` and never fails. A prototype's catalog refreshes a link whose file is missing or older than `guidelines.maxAgeHours` (24) the same way. The fetch
reads one page and does not follow links inside it.

**How much an agent can take from it** (`--guidance-rating`). Rates each component's guidance (its section in
these files and Figma's description and annotations) for what an agent needs: a section headed with its exact name,
what it is, when to use it, when not to, its role, an example, and no name the system does not have (its properties
are not asked for: the contract carries them from Figma and the code). Each component is ready, partial or thin;
the document gets the same class from how many are ready. It prints what to add, writes
`.design-system-engine-out/guidance-rating.json`, and the style guide shows what no other row of each component's
Documentation area says: its Example row, and Names that do not exist when it gives one. `--extract` also runs the extraction test, which spends the
person's model tokens: a question for each property with options, answered by a model that sees only the guidance
through `guidelines.extract.cmd` (the prompt on stdin, the answers on stdout; `claude -p` by default), scored against
Figma's options. `guidelines` is also a level of `eval-run.mjs --levels`.

**The easy way: paste the link into the chat.** The agent runs `rms-design-system-engine --guidelines <link>`,
which works for GitLab and Notion alike, one or several links: it adds the link below for you, reads the page
at once, and reports whether it worked. Notion also takes a list now (`"notion": ["<link>", …]`), each
page to its own `guidelines/notion-<page>.md`; the original single link keeps writing to `sources[0]`.

**From GitLab** (wiki pages or Markdown files, on gitlab.com or a company's own GitLab), list one or
several links; each is written to its own committed file and read automatically, so there is no need to
repeat it in `sources`:
```jsonc
"guidelines": {
  "source": {
    "gitlab": [
      "https://gitlab.com/acme/design/-/wikis/Buttons",                                   // → guidelines/gitlab-buttons.md
      { "url": "https://git.acme.io/ds/docs/-/blob/main/usage.md", "file": "guidelines/usage.md" }
    ]
  }
}
```
The kind of link is read from the URL: `/-/wikis/<page>` (project or `groups/…` wiki) or
`/-/blob/<branch>/<file>.md` / `/-/raw/…` (a branch name containing `/` is resolved automatically). The host
comes from the link. A public project needs nothing else. For a private one, each person puts a GitLab
personal access token with `read_api` in the project's `.env` as `GITLAB_TOKEN` (gitignored, never
committed); for a company server, also `GITLAB_HOST=git.acme.io`. The token is only ever sent to
`gitlab.com` or `GITLAB_HOST`, so a link to any other host is fetched without it. Like Notion: no access,
offline, or a wrong link → the committed file is kept and the audit never fails. The written pages reach the
intent layer the same way as any guidelines file: a section headed with a component's name lands in that
component's `guidelines` in `design-intent.json`, the rest in the global block, as written.

**Documentation sources.** The team's written documentation for agents can come from more than one place. Each
source is an adapter (`intent-layer.mjs` → `SOURCES`) that reads its own format, read-only, into a snapshot in one
shape: pages, each with what it is for, when to use it, when not to, common mistakes, limitations, rules, its other
sections and what was left out. Everything that reads it (the design intent, the contracts, `llms.txt`, the
prototypes, the style guide and its Documentation page) takes only that shape and names each line by its source, so
another source (a design tool's own specs, another format) is one adapter, nothing else changed. Where two sources
document one component, the first configured one is its page. The first source is the intent layer below.

**The intent layer, a GitLab project of DSDS pages.** When the team documents why each piece exists and how
to use it in DSDS (the Design System Documentation Standard: an index `system.dsds.json` whose entity groups
`$ref` one file per component, foundation, pattern, template or page), `rms-design-system-engine --intent-layer
<project link>` (or `--init --documentation=<link>`) sets `ds-config.json → intentLayer` and reads it at once. A
project with no Figma file gets all of it too: its components are the code's own, each with its file's props. It is **read-only**: the engine only
asks GitLab for the project, its latest commit and one archive (GET, a `read_api` token is enough) and never
writes to the layer; the only file it writes is its own snapshot in your project. Every run reads it again through the
GitLab API when the branch's commit moved (one archive of the index's folder, read in memory, no clone), with the
same token rules as above, into `intent-layer.snapshot.json`; GitLab not reachable keeps the snapshot and says
from which commit. Each page's sections are read by title (Intent or Overview → what it is for; When to use or
Usage rules; When not to use or What not to do; Common mistakes; Limitations; a numbered title is read by its
words), with its use cases (recommended, discouraged) and checklists (rules). Facts the engine reads from Figma
and the code (anatomy, API, states, tokens, source) are left out, and so is a line written on every page of a
kind with only the name changed (a generator's filler). A page belongs to a component by its name ("Button
Main" is `buttonMain`), its identifier, or the code file it names; the group the index puts it in decides
its layer (a component in a "Templates" group is a template).

Where it is used: each component's `intentLayer` in `design-intent.json` (with its page's link), the contract's
`intent` block, a `for:` line in `llms.txt` when Figma has no description and its first `avoid:` line (the
authored `whenNotToUse` first), and the prototype context (its own `intent` lines per component, its "when not
to use" lines as never sentences the check holds; each pattern, template, page and flow page as a rule). In the
style guide each component's Documentation merges it with Figma, the code and the contract, each line under its
source with a link to its page, plus an Intent layer row: its page and how many lines were read (or, with no page,
one to write). Every row of a component's tables opens in a side panel with all of it, nothing cut short; for the
Intent layer row that is every line the engine took from the page, kind by kind, its other sections, its status and
what was left out and why. The **Intent layer** page reviews every page in one table, each with a one-word decision whose row says each
change, most urgent first, the decisions as chips that filter the table (a component no page names is a row too,
**Add**): **Delete** (it says nothing of its own once filler and facts are out, its code file is gone,
or a component's page already says it), **Move** (it is about a part of a component that has its
own page: `PointListItem` beside `pointList`), **Rename** (a component's name with a generic word added, as
"Panel General" for `panel`, when no page documents that component yet), **Name** (as in Figma) (it matches
no component the engine can find), **Fix** (it says something the system contradicts: below), **Review** (it has drafted lines to read: below), **Write**, **Improve** (it exists and says something; each change it takes is listed: what to add, what to retitle, what to
remove) or **Keep**; each with why, each change it takes and what the agents get from it. The engine never changes the
layer: the changes are the team's. The audit prints how many pages each decision has.

**What a page says is checked against the system, on every run** (`intent-truth.mjs`, no flag): every name it writes as
code (`tileOne`, `dense`, `--tile-color`, `icons/check`, a file) must be one the system has (a component, a prop,
a token, a Figma variable, an icon, a file, a word of its code or of a token's name; never a word only a comment of
the code has, nor one of the engine's own `design-intent.json`, which repeats the pages), unless the page gives it as the one not to use ("not
`x`"); a flow's or a page's own screens are the product's, so there only tokens and near misses of a system name are
held to it. A prop it sets (`prop="value"`) must be one some component has, and the value one the prop takes (its
options in the code or Figma, true or false for an on-off one); a list of values given for a prop must be its values.
What it says the component does for accessibility ("is keyboard accessible", "is announced") must not be what the
accessibility check found broken (by WCAG criterion). The code file it names must be the component's, and a page that
calls a deprecated component stable is wrong. **Out of date**: the component's props (names, and the values each
takes, in the code or Figma) changed after the page was last edited; the engine keeps them from run to run in
`.design-system-engine-out/component-changes.json` and dates the run that first saw them differ (the code's own git
history dates its file too). **Twins**: two components' pages that say the same (their own names aside, lines a template
writes on three pages or more left out), so an agent cannot tell from them when to use one and not the other. A page
with any of these is **Fix**, above every other decision but those that remove or rename it; its panel says each finding,
the sentence it is in, what the system has instead and where that comes from. The sentences found wrong are left out
of everything the engine writes for the agents (`design-intent.json`, the contracts, a component's Documentation),
listed under `wrong`, until the page is fixed. Before a page is written to the layer (by a person or an agent),
`--check-intent <file or folder>` checks it in the layer it will join and exits 1 on any finding: write it only once it
passes. It checks what is stated, not how well it is written. A name a sentence warns against (do not use it, it is deprecated, removed, no longer
there, not to be invented, not a component of the system), and a name of Figma's own drawing (a frame, a layer, a
reference screen: the engine reads Figma's components and variables, not every frame) are not findings; a page that
names the other one of a pair and says when to use which is no twin.

**Repeated lines and shared rules.** A rule a page gives by reference to one the system shares (DSDS `refs` with
`same-as`) is the system's, set on every page on purpose: it is left out of the page and never counted as a line to
take out. Repeated is the same line on half the pages of a kind or more, the same line with only the page's own names
changed (its name, identifier, code file or `metadata.aliases`) on five or more, or a line that names nothing in code
on a fifth of them or more. Sections written for people by their nature (Evidence, Examples, Cross-references,
References, See also, Related, Changelog, History, Sources) stay as they are, never asked to be retitled.

**Fixing the layer on each run: `--intent-autofix on`** (`intentLayer.autoFix: "commit"`). After the audit or the style
guide reads the layer, what `--intent-changes` would change is changed and committed straight on the layer's branch,
once a run, never offline and never failing the run: the lines written on every page taken out, sentences the system
contradicts written again, what a page lacks drafted. A drafted line keeps its `**Draft:**` marker, so it waits for the
team's review (the page's Review decision); what needs a person and no draft can settle (a name nothing in the system
confirms, a page to add, move or delete) is never touched and stays on the Documentation page. The run says what it did
in one line, with the commit's link and `CHANGES.md`. The layer is read again at once, so the guide shows it as it is.
It commits only when GitLab lets the write token push to the layer's branch (see Where each part lives); a protected
branch or a read-only token skips it with one line, and `--intent-changes --merge-request` sends the fixes for review.
When drafts cannot be written this run (the `claude` command not signed in), the mechanical changes are still made and
the requests are written as `--intent-changes` writes them. It takes the person's word once, by turning it on; turn it
off with `--intent-autofix off`.

**Proposals for the team's decisions: `--intent-decide`** (`intent-proposals.mjs`). Each Fix, Add and Move on the
Documentation page carries the engine's proposed answer and what it rests on, in a Proposal card of its panel. Add: a
component drawn from the same code file as a documented one has that page; a part of a documented component (its Figma
name under it, or its code file beside it, used only by it) is documented in that page; else its page is to be written
(only components the code has are asked a page: one only in Figma waits until it is built). Fix: a name the page itself
gives as Figma's (a sentence of it says so, and every name listed beside such a name) is kept; a newer version of a
name the system has (`tabGroupV2` of `tabGroup`, the older marked deprecated in Figma) is kept until the system has it;
a name that is a code file's (an internal part) is kept. Move: a page of a part only its parent's code uses is kept in
place, the layer writing it from its own file. A person says yes or no, in the chat or with `--intent-decide`; the
answer is kept in `design-system-engine-intent-decisions.json`, and a yes is acted on everywhere from then on (a kept
name is no longer a finding, nor left out of what the agents get; a documented part is no longer asked a page; a page
kept in place is no longer asked to move). A no leaves the decision on the page. An agent records only what the person
said, never answering for them.

**Reviewing drafts: `--review-drafts`.** The words, everywhere: a line is a **draft** (its `**Draft:**` marker), what
a person does with it is **review** it (the page's decision, the style guide's Drafts to review card). Each draft is
approved (its marker comes off), changed (its new text, checked against the system as a drafted line is, and the marker
off) or dropped (the line deleted), in the page's spec and its DSDS page alike. With no file the command lists every
draft; with a file of the person's decisions it makes them, writes `CHANGES.md`, and `--commit` or `--merge-request`
sends them. An agent writes that file only from what the person said for each line, never deciding for them; the
same can be done in the layer by hand (remove the marker to approve, delete the line to drop).

**Drafting on request: `--draft`.** "Write … as drafts I review": the agent writes the lines from what the system has,
then `--draft "<page>" "<section>" "<line>" ["<line>"…] --task "<the request's title>"` puts them under that section,
each marked `**Draft (<task>, <day>):**`, so no agent gets them and the decision for them names the task. The page is a
component's, a pattern's, a template's, a foundation's, or **the System page** (the system's own entry in the layer's
index, whose drafts are held as any page's). Written locally to read first; `--commit` or `--merge-request` sends them.

**Decisions copied from the style guide.** Each Copy decision is the system's own command, the page by its kind and
name, and the decision in words, never a file or a flag: `/rms-design-system-engine-<client> on Component Button,
Approve all 3 drafts from the task "What to do when no component fits" (28 Oct)`. The router turns it into the command
(`--review-drafts --approve 'Button' --task '…' --expect 3 --said '…'`, `--intent-decide '<the proposal>' yes`,
`--part`, `--draft`); a page that now holds another number of drafts from that task is not touched, and the person is
asked again. The words are kept with the decision (`said`) beside who made it and when.

**Making the changes: `--intent-changes`** (`intent-changes.mjs`). The review's changes made in the layer's own files:
the repeated lines taken out; each sentence the content check finds wrong written again with only what the system has;
what a component page lacks (what it is for, when to use it, when not to) drafted. A change goes into the page's
source when the page is generated from one (a Markdown spec whose metadata names the page's code file as `Source`, or
whose title is its name) and into the page itself, so both say the same until the layer is generated again. A page
written from a spec several pages share (a family's) is first given a spec of its own beside it: its Metadata (its code
file, the family spec), its API from the code, what of the family's spec the layer would no longer give its page, the
drafts the family's spec held for it alone, and, where the layer's scripts pair code files with spec names, its entry;
a folder's spec that only one page falls under is that page's own. The engine's own Data lines a page shows and its
spec does not are written in the spec too, so generating the pages again keeps them. **A line the team left open** (`[open]`, `[TBD]`, `Open question: …`, TBD, "to be decided", a line ending in `??`; not
a bare "Open:", which names a state, and never inside a code block, in the intent layer or a Figma description) is a
question, not a rule: read apart from the page (`open`), it reaches no agent, the page's decision is **Review** with the
question to settle, and a prototype request that touches it asks the person first. **A drafted line starts with `**Draft:**`**: the engine reads it apart from the page (`drafts`), no agent gets
it, and the page's decision is **Review** until a person reads it, changes what is not right and removes the marker (or
deletes the line to turn it down). Drafts are written by the `claude` command, told only what the system has (each
component's props and the values they take, its code file, what its page says), and each is kept only when the
content check finds nothing in it; a sentence nothing in the system can say is left for a person, never taken out.
When `claude` cannot draft (not installed, not signed in), the requests are written to
`.design-system-engine-out/intent-draft-request.md`: whoever runs the engine answers them as one JSON object and runs
`--intent-changes --drafts-from <that file>`. The changed files and `CHANGES.md` (each change, page by page) are written
to `.design-system-engine-out/intent-changes/`; `--merge-request` sends them to the layer as one branch, one commit and
one merge request from the commit they were made on, for the team to review. It writes with `GITLAB_WRITE_TOKEN` when
`.env` has one, else with `GITLAB_TOKEN`: give it a token that may write only where it should, the layer's own project
access token or its group's (Developer, scope `api`), and keep `GITLAB_TOKEN` read-only (`read_api`) for everything the
engine reads. `--commit` writes the same as one commit straight on the layer's branch instead, for a team that reviews
in the layer itself: only while the branch is still at the commit the changes were made on (else it says to run again),
and drafted lines keep their marker, so no agent gets them before a person has read them.

A component's Documentation reads everything written about it, wherever it is written (its intent-layer page, its
Figma description and annotations, a guidelines section headed with its name), one row per thing an agent needs: what
it is, when to use it, when not to, its role, an **Example**, its **Properties** (done: the row names its contract file, which the engine writes from
Figma and the code, and lists them; never asked for again), and **Names that do not exist** when the text gives a token, property or component the system does not have (a name with
a `*` is a family, there when one of the system's names starts with it). Each source is read the same way, so what is
missing can be written in whichever the team keeps; nothing has to be in Figma. `--guidance-rating` reads the same
sources.

The **Documentation** page does the same for Figma and the code (a system with no intent layer has it too, one row a component): a component's Figma description, its When to use and When not to use
lines and the contract reach the agents in full, while its notes (Figma annotations, the code's note and the
comment above its CSS rule) reach only the prototype context, the first three of them printed. A note that repeats
the description or another note, one that is only a link or only says how the component is built, and a note past
the first three are flagged **Remove** on the component's row, listed with why, what to do so the agents get it, and
whether to remove it, and kept as a Not given to agents row in the component's Documentation, for whoever wrote it.

Because the file is regenerated every run, the generator is **merge-aware**: it reads the existing
file and **preserves everything you authored** — each layer's `authored` string, and every
component's `authored` field — refreshing only the derived parts. So you get one file that is
auto-derived where it can be and hand-authored where it must be (the `system`/`patterns`/… layers),
and regeneration never destroys your prose. Author higher-layer/system intent directly in the
`authored` fields (Markdown strings).

**It is project-specific and private.** The engine ships only the generic generator; the *content*
is 100% derived from **your** Figma + code, on your machine. Keep the output **gitignored** (add
`design-intent.json` to `.gitignore`) and back it up privately alongside the snapshots — never
commit it to a public repo, since it carries your Figma's internal annotations and DS rationale.
Any consumer (an optional styleguide) reads this **one** JSON — single source, no
re-derivation.

#### The living styleguide (opt-in: `--styleguide`, or `--docs`)

`--styleguide` builds the styleguide HTML on its own; `--docs` builds it right after the design-intent. It is a
**generated view** of what Figma and the code agree on, never hand-maintained. Every project fills **one
template, the engine's** (`templates/styleguide.template.html`), so an improvement made there reaches every design
system on its next run; `ds-config.json → styleguide.template` points a project at a template of its own instead.
The output goes to `styleguide.out`, else `.design-system-engine-out/styleguide/index.html`. With `--component <name>`
the page holds that component and the components it nests only (found in its markup's classes and in its own file's
tags and imports, each nested one followed in turn), is written beside the whole page as `<name>.html`, and says so on
its overview; a name that is no component of the system is said, and left out.

What the engine's template shows (`styleguide-data.mjs` decides it):

- **Its look is the system's.** The template is the layout only. Every colour, text size and weight, corner radius,
  space and the icon size on the page is a role the engine fills with one of the system's own tokens: the
  background and text colour the system's own page uses (its `html`/`body` rule), a shared token before one a
  component owns, its text styles, radii and spacing scale, its icons' Figma size (`styleguide.chrome` names a role
  by hand: `{ "accent": "--brand" }`). Every box (the Playground, its tables, the code, each section of the documentation)
  has the look of the system's own card (`cardLook`: its border colour and width, its radius and shadow), as the
  overview's cards are that card. The page's text is the system's body rule, which the components inherit as in
  the product. Its switches are the system's own segmented control and its text inputs its own text field, read from
  their markup (a row of the same element where one carries the selected class). A control the system lacks (or that
  is not read yet) gets the template's default, drawn with the system's tokens: a segmented control (options in a
  track, the chosen one raised), a tooltip (a round trigger and a bubble, on the Status page's cards) and a card (the
  tables' border, corners and shadow); a text field gets its search field as a stand-in, else a plain input. These
  are the template's own controls, not the system's work: never a task on the Status page (`ui.gaps` lists them for
  whoever reads the data). Each text size takes the system's text style nearest to the
  template's default for it (12, 13, 14 and 15px) when one is within 2px, else the default stays; a colour role the
  system has no token for is left to the browser's own and listed.
- **Foundations**: colours, typography, spacing, radii and other sizes, each the CSS variable itself, shown only
  when the token check (`parity-check.mjs --json` → `passVars`) finds it equal to Figma in every mode; a size that
  changes with a mode shows the value of the mode its section's size switch picks (the switch, with no visible label
  and room below it, changes only the samples and their values, never the page around them); icons from the icon sheet. The
  colours sit six a row, each as wide as the room, so its Figma name and variable read whole (three on a phone).
  Motion (`motionTokens`, `styleguide-data.mjs`): every custom property whose value is a duration or an easing
  curve, named as Figma's motion variable of the same value (`figma.motion.explicit`, else the naming convention),
  each with a dot that crosses its track on Play (a duration at a steady pace, an easing over the longest duration,
  its curve drawn beside it; at once for a person who asks for less motion); where the system answers
  `prefers-reduced-motion` and what it ends, or that it does not yet; and the system's motion as its fundamentals, in
  one table (`motionOverview`, `motion-components.mjs`): each timing its components move with (a duration, a curve and a
  delay), from the fastest, each with a dot that crosses its track on Play, the variables it is written with and their
  Figma names, what it is for (Repeats, Opens, Closes, On hover, On press, On focus), the components that move so,
  each once and linked to its Motion tab, Figma's timing for them, and For the system: a purpose with several timings
  (choose one for every component), a timing several components share (keep it as one variable), one written as values
  (make it a variable); a duration or curve variable no component uses is a row too (use it, or remove it). The rows
  come from each component's own (`motionSpec`): its loop (a spinner turning), its opening and its closing, the code's
  (its `@keyframes` on it or a part of it, a transition an open or closed state plays, a size it transitions) beside
  Figma's (its Motion keyframes and animation styles, an overlay its prototype opens, played backwards as it closes,
  variants that lead to each other after a delay and back); each transition Figma's prototype animates between its
  variants against each one the code plays then, compared from the code as it is now (`projectMotion`, the last audit's
  `motion.json` when it cannot be read); and every other transition or animation the code gives it. When the code has durations or easings and Figma has no motion
  variables at all, the system's tasks say so, for You in Figma: add them to a variable collection named Motion
  (`motionTodos`). Each that differs is a row of the component's Motion tab and of the Status page's Motion: one Figma
  animates and the code does not, Claude's; one the code animates and Figma does not, You in Figma.
- **Components**: each drawn from the project's own markup (the contract's probe, else the first instance in its
  own pages, else what its source renders: a React component's return, a Vue component as the project's own build
  (Vite, Nuxt, Vue CLI or webpack) renders it once its packages are installed (its bound classes, and the CSS its
  `<style>` blocks compile to, SCSS and scoped ones included; `vue-harness.mjs`), else its template read with its props'
  default words, else the element its Figma role asks for) with its own CSS. A Vue component is rendered in each of its
  variants, and the Playground draws the one its props pick as it renders, so an option that adds or removes an
  element (an icon only Large has) shows it, not only its class; a combination never rendered starts from the nearest
  one. A page for one component (`--component X --styleguide`) renders only it and what it nests. The summary says how
  many Vue components were drawn as their build renders them, naming it, and why not when none was (no packages
  installed, no build tool). Once Figma's components are captured,
  a component only the code has (each file whose first element carries a class of its own, in its `components` folder
  when it has one, that no Figma component is paired with) keeps its own page and its place in the menu, marked
  **Only in the code**, with its file and the props its code declares; its Status row says Figma is Missing, with a tip:
  add it to Figma, or remove it from the code. The run counts them apart (`1 only in the code`).
  `styleguide.showCodeOnly: false` in `ds-config.json` leaves them off the pages and the menu instead, a task each on
  the Status page with its file (`1 in the code and not in Figma, on the Status page`), and a page for one of them
  (`--component X --styleguide`) says so. Before Figma's data is captured, every component is the
  code's: shown with its file and the props its code declares, marked **Only in the code** and compared with nothing
  in Figma, and the run says so (`3 only in the code`) instead of counting them agreed. Its controls are the props Gate [15] (Component props match Figma)
  matched, labelled with Figma's names; an option applies what the contract's `propertyMap` says it adds (a class,
  an attribute; a live state such as `:hover` is offered but disabled); a switch shows or hides the part it names.
  When an option's look is drawn on the component but a screen reader hears it on a part (a field's wrapper takes
  `.field--disabled` while the field itself is disabled), the contract's `heardOn` names the part and its state per
  option (`heardOn: { Disabled: { True: '.field__input:disabled' } }`): the option sets both, and the state check
  counts what the part says.
  An HTML and CSS system has no code props to pair, so a Figma prop is a control when the code realizes it: the
  contract's `propertyMap` (found by its options when the contract spells the prop another way), `htmlRealizations`,
  a modifier class the CSS has, or a `:disabled` rule; a prop nothing realizes is counted at the top. The system's
  modes are switched inside the playground, each named as Figma names its collection (`figma.colorCollection`,
  Styling; a sizing collection by its own name, Sizing, the name kept for screen readers and not shown): the sizing
  mode at its top left, the colour mode and any other at its bottom right, never among the component's props. Under it,
  its specs (see Specs) follow the controls as they change. Below them, the tokens behind what is drawn now (each
  visible part, read again on every change made there) with its code on their right, the code as tall as what it holds
  and never taller than the tokens. There is no table of every token it has: that is Parity, where each variable's name
  opens its value per mode and what uses it. Where two tokens share a value, the tables name the one the component's
  rules use, then one that names the part. Above it, its documentation, the products it is **used in** (each by
  its full name, linked when `styleguide.plugins` gives its page), and **what differs from Figma**, from the
  differences list the last full audit wrote.
- **A component's page in areas**: Playground (with its specs), Variants, Documentation, Accessibility, Parity and Used in, one at a time on
  the system's segmented control (every one at once on the measuring page, `?all`). Above them, its import line
  (`styleguide-data.mjs` `importOf`: the file's package and path, else `@/` and its path under `src/`, or
  `styleguide.importFrom` with `{path}` and `{name}`) and its file to download. The area switch stays at the top as the
  page scrolls, the component's name beside it once its heading has scrolled away (a foundation's title stays at the
  top too), and every table's head under them on every page: the card's head, then the table's own head row
  (`stickHeight` measures how far the bars reach, `--pg-areas-h`, and a card's head, `--pg-card-head-h`); Parity carries the system's alert icon (an icon named warning or alert) before its label while its table
  marks something (a row that differs, one only in Figma or only in code, a prop not built), Accessibility while a
  problem stands (the last browser check's or the audit's), and Documentation while a kind is not written yet (`docOpen`),
  what each marks said to a screen reader. Each section of rows (Anatomy in the Playground, Details in Documentation) is one of the
  Playground's tables, its title the head; the History is a table per release; Parity is one table of everything the
  component has, whatever the Playground shows (each prop, each variable, each value the audit compares), the same
  table as the Status page's Parity (`issueTableHTML`, `ISSUE_COLS`): Task nr (the Status page's number, open rows
  only), Type, Figma (its name and value), Code (its name and value, and where in the
  code a difference is), What to do (who acts above it) and Status (a sign and the system's colour, To fix, To check,
  Done or Not compared, with what it is under any but Done, differs from Figma, only in Figma, only in code, both not
  compared, New in the last audit when the last audit found it first, and when it last held). Each difference the audit found is merged into
  the row it is about (`parityIssueRows`); what it found beyond those rows, a prop Figma has that the code does not build
  and a component only the code has are rows of their own. The Status page holds the open rows of every component,
  each kind in a table of its own shape, one card per component, one kind shown at a time with a filter (Parity, Motion,
  Documentation, Migration, Products, System, the page's own items and Accessibility last, each when it has any; no
  All), numbered in that order, so what the browser still tries is numbered after the rest and no other number moves:
  Parity's columns are the Parity area's, Accessibility's the Accessibility area's (Task nr, WCAG criterion, Figma
  states, Found, What to do, Status), Documentation's the Documentation area's (Task nr, Kind, Source, Status,
  Last checked; what is written, what to do and each source's file in the row's panel), only its kinds not written yet (`docRows`), and the rest Task nr, Where or Type, What to do and
  Status. The count at the top is the shown kind's, and every open row is numbered, Documentation's too. Under The system, what the tokens owe (`tokenTodos`, area System): the
  semantic tokens with no description in Figma (You in Figma), Figma variables that point at one no longer in the file
  (You in Figma), tokens in the code that point at one declared nowhere (Claude in the code), the same value written by
  hand in two tokens (You decide), each one row with its first names (a token one component uses is the system's own
  choice, not a row). A token belongs to every component that uses it: in its code, named after it, bound on its
  Figma component (the structure snapshot), or pointed at by one of those; its missing description shows on each of
  them, a component with no page included (its Status row's Documentation tab), and one description written in Figma
  clears them all. A token nothing uses yet (in Figma, in the code however the code spells it, or by a brand that sets
  its own value or points at it) is no fault in a white-label system: its panel says Not used yet, and it is no task,
  its description included. Open rows first, a count of each status above it, a filter by type (props, variables, values, other), its head kept in
  view under the areas as the rows scroll by (on a phone the table scrolls sideways instead); in the Playground's card
  table. The code is as tall as
  what it holds, never taller than the tokens table on its left; past that it scrolls inside. In the controls a text comes right after the boolean that shows it
  (`showFirst`: Show Text and Text Content, or both on the same part). **Built with** is an area of its own when the component is made of others (`nestedComponents`: the
  classes its markup holds, or the tags and imports of its file), each the overview's card with its own preview.
- **Playground links**: a control and the preview follow each other (a radio picked in the preview sets State); a
  label edit writes only its words into its part. An option the contract maps to another element's selector (a
  product's own markup) is not the component's (`ownSelector`): a chosen state (Selected, Checked, On) falls back to
  the component's own `:checked` rule, and an option the code does not build is offered as not built.
- **Documentation** (its first card): the table every task shares (`docIssueRows`, `ISSUE_COLS.Documentation`), as Parity and Accessibility are, a count of each status above it (with an intent layer, the Documentation page gathers it for every component, its rows Review, Missing or Keep; `#documentation`, `#intent-layer` and `#coverage` open it, else `#status/documentation`). Role and Do and don't are read from its page in the intent layer first (a rule `Role: button`; a section titled Do and don't, or rules that start `Do:` / `Don't:`), where agents read them without Figma, and a missing one is to write there; Figma's role annotation naming another role is to check, and its do and don't pictures stay for people. Its columns are Task nr, Kind, Source (where it was read, by name only: Figma, Intent layer, Code, Contract, Guidelines; the file in the row's panel), Status and Last checked; what is written and what to do (who writes it, You in Figma, and where) are in the row's panel (`PANEL_ONLY`). One row for every kind (What it is, When to use, When not to use, Common mistakes, Limitations, Do and don't, Role, Example, Properties: done, naming its contract file), what is still to write first; the Status page's Documentation shows the same rows, only those still to write, under the same numbers. Then the API, and Details (Figma's notes, the slots, the code's own note). Where the component is used is its own area, Used in. The usage kinds (`guidanceView`): When to use, When not to use, Common mistakes, Limitations, from a
  line of Figma's description or annotations or the code's note that starts with the section's name, else
  `contract.authored.json` → `components.<name>.guidance` (`whenToUse`, `whenNotToUse`, `mistakes`, `limitations`, a
  string or a list); a missing one is said in its Documentation. Common mistakes the team has not written are what the
  last audit found the products doing with it (a rule laid over it, a look-alike built by hand, a parent's rule
  overriding it), said so.
- **An address for each area**: a component's area is in the address after a slash (`#c-chip/accessibility`, `/documentation`, `/parity`, `/variants`, `/built-with`, `/used-in`, `/changelog`; the Playground has none), kept as the areas are switched and opened directly from a shared link, before the props of the variant (`#c-chip/accessibility?Size=L`).
- **The page's width**: the content takes the whole width the screen gives beside the menu, with no cap, so a wide screen shows wider tables and stages.
- **The page's own reading**: every button says what it does in words (Menu and Close menu, on a phone; on a wide
  screen the menu is always there), and the style guide check fails when the page's text roles fall below 4.5:1 on its
  backgrounds in any colour mode (`pageContrast`, from the tokens' values; written into the page for the check).
- **The stage's bars**: above the component, a bar in the tables' head colour with the sizing mode (Desktop, Phone) at
  its left and Inspect at its right; below it, a bar with the colour mode (Light, Dark) at its right and, while
  inspecting, what is picked at its left. They keep the stage (the checkerboard) apart from what changes it; the
  checkerboard itself is square, the bars round the stage's corners.
- **An instance from a page keeps what names it**: an id the instance itself points to (the label a radio group is named
  by, through `aria-labelledby` or `for`) stays with the copy (`keepReferencedIds`), and each drawing makes it unique
  (`uniqueIds`), so no two copies share an id and none points at a missing one. A control a product named by
  `aria-label` (an icon-only button) that the props now give visible words loses that name, so its words name it
  (2.5.3).
- **Inspect**, in the top bar (none on the measuring page): the Playground turns into its anatomy, in the live
  component's place, so a prop is changed and inspected in one place: an inert copy of the component as the controls set
  it, redrawn as they change (a text typed too), at the size the Playground draws it (smaller only to fit), each part and each padding and gap outlined, a slot in
  the accent, never filled with a colour (`annotate`). A click on the component, a part, or a padding or gap band (each
  space over the parts, each part over the component) says in one line what it is and its value (a part's padding,
  gap, fill, line, corners, shadow, text style and colour; an icon's size and colour; a space's token and value),
  outlined in the accent, the rest of the component dimmed around it and the other boxes faded; a second click goes
  back up a level, and a click on the stage outside the component lets go of it. What sits inside the part picked is drawn as parts too, one level per click, as a double click in
  Figma reaches a layer in a group, and the line names the path (`Actions › buttonSecondary › text`). The modes
  switched while inspecting (Light, Dark, Desktop, Phone) redraw it in that mode, what is picked kept, and a Width
  chosen while inspecting (Phone, Tablet, Desktop) draws it at that width, never beside the width's frame. Done inspecting
  brings the live component back and leaves nothing of the anatomy beside it. A component
  shown in an overlay is drawn as its own element.
- **Width**, in the Playground (none on the measuring page): Fit (the live preview), Phone (375px), Tablet (768px) or
  Desktop (1280px), a frame of that width written with the page's own stylesheets, its icon sheet, the component as
  drawn now and the system's own scripts (`systemScripts`), so its media queries apply and it works there (a click
  moves a selection, as in the live preview), scaled down to fit the room.
- **Figma beside the code**, in the Playground (a Figma button, only for a component with a Figma image; none on the
  measuring page): the Figma image of the variant set (its variant props equal to the Playground's; the default image
  only while every variant prop is at its default) beside a still, inert copy of the component as drawn, or over it,
  clipped by a slider; a small one drawn up to 4 times larger, both alike. A variant with no image says so. Images
  (`figmaVariantImages`, `visual-diff.mjs`): `<visualRefs>/components/<name>/<Prop=Value, Prop=Value>.png` and
  `<visualRefs>/components/<name>.png` for its default, else the Figma REST API with `FIGMA_TOKEN` (every variant of
  its component set in one images call, cached under `visual/figma-variants/` until `_figmaVersion` changes). They go
  in the page, up to `styleguide.figmaImagesMB` (8) in all; `styleguide.figmaImages: false` for none. It returns the
  width to Fit, and a width chosen turns it off.
- **Do and Don't** (`exampleImages`, `visual-diff.mjs`), in its Documentation card: the pictures in
  `<visualRefs>/components/<name>/do/` and `dont/` (each file named for its caption; a leading number orders them),
  then the Figma nodes `contract.authored.json` → `components.<name>.examples` names (`[{ "kind": "do" | "dont",
  "nodeId", "caption" }]`, fetched with `FIGMA_TOKEN`). Within the page's Figma image budget. A variant image of another
  scale says so in its name (`Size=L@1x.png`); 2x by default. The Figma panel says its image is in the mode its frame
  uses in Figma.
- **History** (view `#history`, when the code has history or a decision is recorded; an old `#changelog` or `#whats-new` link opens it): every component's changes and every decision gathered by release, newest
  first (not released yet on top), one row per issue with its commits and what they affect, one row per read of Figma that changed a component
  (tagged Figma: what changed in each), one row per decision (tagged Decision: what was ruled out, why, who) with the page it is
  about. Chips (All, Code, Figma, Decisions, each when it has rows) filter it, each with its own address (`#history?show=decisions`). **What:** the one the
  message starts with (`#4521 - …`, or the team's own pattern, `changelog.ticket`: `"#\\d+|REL-\\d+"`); else the one the
  merge or pull request it came by closes ("Closes #45" in its title or description), said `via !12`; else that request
  (`!12` on GitLab, `PR #70` elsewhere); "No issue" only for a commit made straight on the branch. A link pattern read
  from the project's own changelog (`[#n](…n)`) goes only to `#n` tickets; `changelog.ticketUrl` to every ticket.
  **Affects:** the components whose code it changed, as pills, then where else it changed the system, as quieter pills
  read from its own diff: Figma (the components and tokens its snapshots changed), Documentation, Examples (demo
  pages, stories), Tokens, Code (sub-components and helpers), Tests, Agent files (`.claude/`, AGENTS.md), Version (the
  version it set), Style guide, Pipeline, Setup (`ds-config.json`), else its folders. A part is named for the
  component it belongs to when it sits under the same `folder/File` as the component's code
  (`docs/components/chip/Chip.md` for `chip/Chip.vue`), else by the components its changed lines
  name. Each pill links to where the change is seen: the component's page when it names one, the Documentation or
  Tokens page, the release's tag, else the commit. A project read from GitLab asks, once per commit, for its changes
  and its merge request (kept in `.gitlab-history.json`, at most 300 commits a run).
- **Disabled**: a prop named Disabled, on, disables the native controls inside (`input`, `button`, `select`, `textarea`),
  as a product sets them; the live accessibility check then says Tab passes it by, as it should, and measures focus
  with transitions off, so a ring that fades in is read at its end.
- **A token's panel** (`tokenUses`): every token's name on the page (foundations, a component's tables) opens a panel
  in place, the page left where it is: its Figma name, its value in each mode, the components whose own rules use it
  and those that use it through another token whose value names it (in any mode, with the token it came through),
  each linked to its page, and a button to copy it. Escape or a click outside closes it, the focus back on the name.
  The full list stays at `#uses?t=--name`. Search also finds each component's props and their options.
- **A link to each variant**: the address carries the props set away from their defaults and the width
  (`#c-chip?Size=L&width=phone`), kept with `history.replaceState` while that view shows; a link opened sets them and
  the controls follow (a value the component does not have is left at its default). The address bar holds it, so no
  button copies it. A component opened with a width chosen is drawn at that width; a test draw never reaches the address.
- **Parity** (`parityView`, `parityRows`): one row per Figma prop (paired with the code prop, else only in Figma; a Figma
  slot the contract gives a part of its own is paired with that part (`.modal-slot`); every slot is marked in the
  Playground as the area it takes, dashed and named Slot inside, in place of the placeholder its markup holds
  (`drawSlots`): its own part (`.pg-slot-area`, at least 40 by 96 pixels so an empty one is seen), or, for a slot whose
  content the markup puts straight inside the component (a card, a status bar), the area that content takes drawn over
  it inside the component's frame (`.pg-slot-host`), the parts of its other slots left as they are; the placeholder is
  kept unseen so the component keeps its size, and the HTML shown drops the mark;
  a slot only Figma has is said under the component's name (`slotsHTML`); in an
  HTML and CSS system a slot or component swap is the markup's content, with code props a slot is `children`) and
  per code prop Figma lacks; per CSS variable its rules use (the token check's values in each mode, the same or differs;
  no Figma variable, only in code) and per Figma variable named after it with no CSS variable; per value the agreed
  record has seen (the same since both sides agreed, or differs since it last moved). Each open difference is in its row, with who acts and what to do.
- **Links** (`component-changelog.mjs`): on the overview, the Figma file (`figmaFileKey`), the code repository
  (`package.json` repository, else the origin remote) and `styleguide.links` (`[{ "label", "url" }]`); on each
  component, its Figma node, its code (its own file, else the line of its rule in the theme stylesheet, on
  `styleguide.branch` or the origin's default branch), its page in the intent layer, its contract (a copy written
  beside the guide, `contracts/<name>.contract.json`, so the button opens the file), `styleguide.componentDocs`
  (`"https://wiki/…/{name}"`), `contract.authored.json` → `components.<name>.links`, as buttons at the top right of
  its header.
- **At a glance** (`factsOf`), under its name, on one line: its class (`.modal-card`), Version (the release its last
  change shipped in), Last changed, its date and time, and how to import it. How it stands with Figma and with accessibility is on those areas (their alert icons) and on its
  overview card, in one line, a fact that needs work marked with ! and in bold, never by colour alone.
- **Variants**, an area of its own when a variant prop has two options built or an on/off prop is built: each option of
  each variant prop and both sides of each on/off prop (false, true), one per row with its name, drawn by the Playground itself (the other props as it sets them) and copied still and inert,
  the Playground left as it was; Try it sets that option there. An option Figma has and the code does not build says
  so.
- **Status and coverage** (`statusView`, `coverageOf`): under its name and on its overview card, stable, beta or
  deprecated from `contract.authored.json` → `components.<name>.status`, a `Status:` (or `Maturity:`) line in Figma's
  description or annotations, or `@deprecated` / `@beta` / `@status x` in its code; never guessed. Coverage is its own
  file's line coverage from Istanbul's json-summary (`styleguide.coverage`, else `coverage/coverage-summary.json`).
  The overview counts each status and says what each group holds (`styleguide.groups: { foundations, components }`).
- **History**, an area of its own (`#c-chip/history`; an old `/changelog` link opens it): what the team decided about it first, then when Figma was last read for it, then each commit that changed it (its own file,
  or a line of the shared stylesheet holding its class; the project's own files only), grouped by the release tag
  (`v*`) that holds it, each linked to its commit and its pull request.
- **Parts** (`#c-<root>/parts`): the components placed only inside it (`component-parts.mjs`), each a card to its own
  page, then what the root's page says of each under its Parts section (`### <part>`), or where to write it. A part is
  found when its Figma path sits under the component's (`grid/Row`), or when its name carries the root's (or both share
  a stem of two words or more) and the root holds it while it does not hold the root. One of the two alone is a
  question on the component's Documentation, with an answer to copy each (`--part`); `Part of: <root>` in Figma's
  description answers it too. A part is not listed as a component (the menu, the overview, Status fold it into its
  root), its page says whose part it is, its Documentation is its root's Parts section, and the Documentation page asks
  no page of its own for it (a page it has is to move into the root's Parts). Contracts and `llms.txt` list it under
  its root, from `.design-system-engine-out/parts.json`, which the style guide's build writes.
- **Used in**: a card per product that uses it: the product's own picture (`styleguide.plugins[].image`, else
  `docs/preview.png`, `docs/screenshot.png`, `preview.png` … beside its page), else its page pictured in Chrome as it
  opens with the component's places marked (`product-shots.mjs`, window size from its `showUI` call), and how many
  times its class appears in the product's source page. A use is the class put on an element (`class-use.mjs`: a class
  attribute, `className`, `classList`), never a word in a comment or a CSS rule. A product whose screens use it in Figma
  (`figma-screen-components.snapshot.json`) while its code never does is listed too, said to build it by hand there.
  `styleguide.productShots: false` turns the pictures off.
- **Code**: the code for what the playground shows, with the system's button to copy it. With a framework file
  (`component-api.mjs` `callName`): the component's tag with the props set, in its syntax (jsx, vue, svelte, a custom
  element), each value as the code spells it, a default left out, every prop the code requires written (`={…}`).
  Else the HTML the preview draws, keeping only the classes the system's CSS styles.
- **API**: from the component's file (`component-api.mjs`): its props, each one the code requires marked `*` (a TS
  member without `?`, `required: true`, PropTypes `.isRequired`; a default makes it not required; nothing guessed),
  its events (Vue `defineEmits`/`emits`/`emit()`, Svelte `dispatch()`, a React `on*` prop, docgen and custom
  elements manifest events) and its slots. Left out when the code states none (an HTML and CSS system).
- **Motion**, between Documentation and Accessibility: everything that moves in the component in the table every task
  shares (`motionSpec`, `motionIssueRows`, `ISSUE_COLS.Motion`), a count of each status above it: Task nr, What happens
  (Repeats, Opens, Closes, On hover, On press, On focus, or When a state it names changes, with what moves and the part
  under it: turns a full circle, `.modal-card`, `.modal.is-closing .modal-overlay`), Code (its duration, curve and delay,
  the variables it is written with, the rule's file and line, and whether a prefers-reduced-motion rule that wins stops
  it), Figma (its duration and curve, and where in Figma: its Motion timeline, an animation style, the overlay its
  prototype opens or a transition between its variants), What to do (Claude in the code when the code differs from Figma
  or does not animate what Figma does; You in Figma when the code animates a loop, an opening or a closing Figma does
  not) and Status (Done when the two match; To fix; Only in the code, nothing to do, for a hover or focus Figma's
  prototype does not animate; Figma not read yet). Its tab carries the alert icon while a row is to fix (`motionOpen`),
  and the Status page's Motion lists those rows under the same numbers; with this table, motion is no longer a row of
  Parity. A component shown in an overlay is read with the overlay it opens in, its backdrop too; one that does not move
  says so.
- **Accessibility**, one table by WCAG 2.2 criterion at A and AA (`a11yIssueRows`), the same table as the Status page's Accessibility, in
  the same card as the Playground's tables: Task nr (open rows only), Area (Accessibility, with the criterion and its
  level; a click, a key or the pointer resting on it opens what it means in plain words and how it is checked, the token
  panel's own pop-up, Escape closing it), Figma (what Figma's annotations state for it), Code (what was found, each
  finding or duty on its own line with its sign, naming the component, its variant or its part, `onWhat`, and what
  passed and where), What to do (who acts above it; each finding's own fix, what a person checks, "On badge, its Label
  part, a person checks that…", or what has still to run, else what the criterion asks) and Status (✕ To fix, ! To
  check, ✓ Done, a sign and the system's colour, with New in the last audit, when it was last tried and where each
  finding is read from under it: a Figma annotation, `contract.authored.json`, its code, the style guide in the
  browser, the last audit or the audit's code capture, a person). A criterion only a person can judge (1.3.3, 1.4.5,
  2.4.6, 3.1.2, 3.3.3, 3.3.7 and the media ones) says how to mark it (Checked it? Tell Claude badge 1.3.3 is checked); once
  the person has, `--checked` records who and when with the component's signature (its CSS rules, its contract entry, its
  source file) in `design-system-engine-checked.json`, and the row is Done, Checked by them on that day, until the
  component changes, then To check again, saying who checked it before. With nothing to fix or to check the summary
  says Meets WCAG 2.2 at level A and AA. Only what applies to the component is listed: a criterion of the page that uses it (a
  title, a skip link, orientation, consistent navigation), video and sound it does not play, what it has nothing for
  (no link for 2.4.4), and what asks of controls or fields on a component with none in any variant (keyboard,
  focus, labels, errors) are left out. To fix first, then to check, then done; a AAA criterion a check stands for (a
  comfortable target size, motion from interactions, a focus ring's thickness) comes last as advisory and is not counted. Above it a count of
  each status, and when the audit last ran (or that it has not), with what is excused (`behaviourExceptions`).
  Under each criterion: what the audit found on it that is about accessibility rather than Figma (a text's contrast
  in one variant and mode, `splitFindings`, with who acts and what to do); the last browser check's findings
  from `.design-system-engine-out/a11y.json`; what its code does (`a11y-static.mjs` findings given to it by
  `wcagStatics`); its role's duties and Figma's notes (`role-markup.mjs`, `behaviour-contract.mjs`: element, name,
  keys, part roles), to fix only when the audit found that kind of problem; and what this page finds trying every
  variant (none on the measuring page): every combination up to 32, else each option beside the defaults, the
  Playground laid out out of sight and drawn again as set, each result said once with the variants it holds in.
  The tries are the Tab stops in order, a name and a visible focus on each stop, a stop drawn as disabled that Tab
  still reaches, each behaviour tried with the page's own events (a key only a native element answers is said to be
  given by the browser), the text contrast in every variant and colour mode, the WCAG 2.2 checks of `wcag-page.js`,
  and what it does when used (hover, focus, input, press) on six variants that can be used. A criterion is done when
  its check ran and found nothing (the page's run, `ran` in the last audit's `a11y.json` for zoom, spacing, reflow,
  a keyboard trap, a focus hidden under other content and target size, the code read for the rest) and to check when only a person can judge it, with what to look
  at.
- **What no check reads** (`a11yView().sources`, built in `styleguide-gen.mjs`, `unreadRows`), rows of the same table,
  each with its status (To check when it states accessibility in a way a check could read, else Not needed, read by
  the agents): each Figma annotation on it and on its layers that no check reads (`annotationUses` in
  `a11y-check.mjs` gives it no use: a sizing note, a usage note), with how to write it so one does (its own wording when
  the engine can tell what it means, `annotationWording`, which `--figma-edits` also lists in Figma), and the team's
  guidelines (`guidelines.sources`, the Notion and GitLab pages fetched into files), the section named after the
  component, read by the agents as design intent and by no check. Where each row is read from is under its status.
- **In use**: the approved pictures of `frames[]` (Gate [2] (Figma frame unchanged)'s references in `visualRefs`), six at most.
- **Modes**: an axis per mode collection (colour from `figma.modes`, size from the sizing collection), for the page
  and, where the CSS nests, for one component. A mode the code has no CSS for is offered but disabled ("in Figma,
  not in the code yet"): the page never draws Figma's values as if the code had them.
- **Not agreed yet**: a prop on one side only, another default, a token that differs, a component not built yet:
  left out and counted in one line at the top, for the person to decide.

A project's own template is filled through markers:

- `{{AGREED}}` ← the agreed view above, as JSON.
- `{{ICON_SHEET}}` ← the DS icon `<symbol>` set, lifted from a built plugin `ui.html` (`styleguide.iconSource`), or built from a folder of SVG files, one icon each (`styleguide.iconSource` naming a folder, else the folder named `icon` or `icons` the code keeps five or more in, the one under `src/` first: `icon-folder.mjs`). Each icon is named by its path in the folder (`m/alert-m.svg` → `m-alert-m`), and the ids inside each file are kept apart from the other files'. An icon of that sheet that paints itself white is listed by the style guide check, never a failure of the page.
- `{{USAGE}}` ← which plugins reference each component's class (scanned from plugin source).
- `{{DOCS}}` / `{{DOCS_CODE}}` ← Figma descriptions and code notes, from the design-intent JSON (hardcoded pixel dimensions are stripped — docs describe with tokens).
- `{{THEME_CSS}}` ← the token CSS inlined verbatim, with its `@media (prefers-color-scheme: dark)` guarded to `:root:not([data-color])` so the manual light/dark toggle wins; `{{COMPONENT_CSS}}` ← the component stylesheets outside the theme.

**Its accessibility is tried while it is built.** After writing the page, `--styleguide` opens it in Chrome
(`styleguide-bake.mjs`, four pages at once, each trying a share of the components, `#status?bake=1/4`) and has it try
every variant of every component as its Accessibility area does, then keeps what each found in the page
(`<script id="sg-a11y-baked">`, with when it ran and each component's signature). Whoever opens the page reads those
results at once on the Status page and in every Accessibility area, the final ones, with nothing running in their
browser; a component's area never tries again on its own. A component the build could not try (no Chrome there, its
signature changed) is tried in the viewer's browser and kept there (`localStorage`). Until every component is tried,
only Accessibility waits: every other kind is listed at once with its final numbers (Accessibility is numbered last,
so no other number moves), the Accessibility card shows only how far the try has got and the table
says Not checked for what is not tried yet, and the menu shows no count; then Accessibility's list is drawn once, final. `--no-a11y-bake` (or `styleguide.bakeA11y: false`) builds the page
without it; without Chrome it is skipped and said, and a script error the page throws while trying is printed
under the count.

**Each theme has its own results.** A theme changes the colours contrast is measured on, so the build tries every
component in each theme the page offers (the default theme, and each brand that is not only the base of others), and the page
shows the results of the theme chosen at the top; choosing another shows its own, and what it has not tried yet is
tried as it is shown. **The results are saved with the snapshots** (`a11y-results.snapshot.json`), each under its component's signature
(its code, the system's CSS, the check itself), per theme (`themes: { default, <brand>… }`; an older file with one set is the default theme's). The next build puts them in the page first and tries only the
components whose signature changed: nothing changed, nothing tried again. A build that tried something saves the file
and, when the team keeps its snapshots in a store (`stores.snapshots`), sends it there as one commit when GitLab lets
this person, or the pipeline's token, write it; so everyone's build, and the page the team publishes, start from the
same results. With no store the file stays in the folder.

**How long each task has been open** (`open-since.snapshot.json`): the same build asks the page for every open task and
keeps, for each, the day a build first found it (a closed one leaves; one found again starts again), with the snapshots
and sent to their store as the results are. The page shows it under each open task's status (Open 3 days, Open 5
weeks), so what is stuck shows apart from what is new; a build without the browser shows the record as of the last
one that had it.

**Downloads** (the tokens, the icons, a component's file) go through one helper; in a page
shown inside another one (a shared viewer, a sandboxed frame) that may not hand files over, a note says so, with the
page's own address to open it alone and, for a text file, a button to copy it instead.

**Who decided, and when**: every decision the engine records keeps the person with the day: an answer to a proposal
(`--intent-decide`), each line accepted as debt (`--baseline`, under `accepted`), a difference kept on purpose
(`--keep`), a check made by hand (`--checked`). The name is `--by "<name>"`, else the one git uses (`git config
user.name`); the Documentation page says who declined a proposal and when.

**The page is checked against the system it shows.** After building it, `--styleguide` checks the page's own CSS
(every `<style>` but the system's, which the template marks `data-system`): a colour, font, text size, weight, line
height, corner radius or space that is not one of the system's tokens fails it, and so does what the static
accessibility check finds in its markup; the run exits 1. `--styleguide-check [page]` runs the same check on a page
already built, after a project added its own links to it.

**Published for the team.** A local `--styleguide` is a preview. `--publish-styleguide` writes the CI job that makes
it one link everyone opens, rebuilt from what is merged on every push to the default branch: for GitHub Pages
(`.github/workflows/style-guide.yml`) or GitLab Pages (a `pages` job, in `.gitlab-ci.yml` or, beside a pipeline the
project has, `.gitlab/style-guide.gitlab-ci.yml` to include), as the git remote says. The job checks out the engine and
the products in `products.json` beside the system, builds the page, runs the audit (a failing audit still publishes:
the page shows the differences), builds the page again, checks it (a page that fails is not published) and publishes
`public/`. A job already there is never overwritten, and nothing is committed. A GitHub Pages site is public even from
a private repository (only GitHub Enterprise Cloud keeps it private); GitLab Pages can be kept to project members.

**Is the published page behind?** With a style guide store (`stores.styleguide`), each publish writes beside the page
what it was built from (`built-from.json`: the engine's commit and each source's latest commit, as `--ci-changed` reads
them: the code, each store read from GitLab, the profile, the Figma file). A run compares it with the sources now, at
most every six hours, and says in one line what moved since and when the page was published; where the token may read
the store's pipelines (GitLab's Pipeline: Read), also a pipeline that has waited for a runner or failed. A style guide
build always asks, and says how to publish when the page is behind; with `"styleguide": { "publish": "auto" }` it
publishes itself, where GitLab lets the person write the store, so a pipeline that cannot run never leaves the team on
an old page; `--no-publish` builds a preview that is never published. `--guide-status` asks now. The Status page shows, by its title, when it was built and with which engine.

Config: `styleguide: { template?, out?, iconSource?, plugins?, chrome?, publish? }` (`publish: "auto"`: a build publishes to the style guide store when the published page is behind). `plugins` is `[{ key, match, name?, href? }]`, a short usage label per app, a fragment of its source path, its full name and its page; without it each app in `paths.plugins` gets a short label made from its name (the initials of a name with two or more words, `order-history` → `OH`, the name itself for one word, and full names if two apps would share a label). Because it renders **only** what the
DS actually contains and agrees on, the styleguide can never invent or drift — the same guarantee Gate 20
(docs-truth) checks on the output.

#### The standard contract layer (emitted automatically each run)

**Every run** (after the gates, whenever a vars snapshot exists) **also emits a machine-readable
contract** in a standard, interoperable format (a per-component JSON contract + W3C DTCG tokens). On
by default so it never goes stale; opt out per-run with `--no-contracts` or per-project
with `ds-config.json → contracts.auto: false`. It splits captured from authored by file:

- **`contract.authored.json`** (project root, **committed**) — the AUTHORED hub: per component,
  `bindings` (Figma prop → `{ attribute: "codeName" }` for a rename, `{ slot: "slotName" }` for a slot),
  plus optional `semantics`, `notes`, `version`, `description`, `propDescriptions`, and optional
  **agent guidance** — `whenNotToUse` (string), `useInstead` (a name or a list) and `neverCombineWith`
  (a list) — so an AI knows when not to reach for a component and what pairings are invalid — and an
  optional **decision status**: `status` (`current` | `deprecated` | `experimental`), `supersededBy`
  (the component that won), `since`, and `rationale` (the *why*), so an agent never finds two right
  answers with no note saying which one won. Decisions
  only, no captured values, so it is safe to commit and applies in CI. Scaffolded once (empty bindings),
  then hand-owned; the generator never rewrites it.
- **`contracts/`** (**local, gitignored**) — the generated CAPTURED views, refreshed every run:
  `tokens.json` (W3C DTCG: `$type`/`$value`, per-mode under `$extensions`, referenced by
  `{family.token}`), one **standard** `<name>.contract.json` each (`id`, `version`, `props[]` with
  `bindings.figma`/`bindings.code`, `anatomy`, `states`, `variants`, `semantics`, plus optional `whenNotToUse`/`useInstead` and
  `relationships` — `composesWith` derived from the composition snapshot, `neverCombineWith` authored,
  and a `status` block when the DS says something about the decision: authored fields win, and a Figma
  component description that already uses a tag convention fills the gaps — `@deprecated [why]`,
  `@experimental`, `@status <state>`, `@use-instead <Name>` (also `@superseded-by`/`@replaced-by`),
  `@since <x>`, `@why <text>`; the convention is read, never imposed, and no tags + nothing authored = no
  field. A deprecated **token** whose Figma description names its replacement or reason gets that
  explanation as its DTCG `$deprecated` string (`"Use radii/button instead. too sharp"`) instead of a bare `true`),
  `contract.schema.json`, and an `llms.txt` AI index (which opens by telling an agent to use these components,
  build nothing by hand that one covers and ask `--query` before guessing a name, then gives the order of authority with
  this system's own source at each level, `authority.mjs`; it also lists each component's guidance and
  composition, tags a non-current component `[deprecated]`/`[experimental]`, and gives it a
  `status: deprecated · use X instead · since 2.0 · why: …` line). They carry the DS's real values, so a single
  `.gitignore` keeps them local. When these are present, a token divergence also **cites its source**:
  the token's verified value from `tokens.json` and the file that declares it, so a fix (by a person or
  an agent) is applied against the real fact, not a guess. Absent contracts, the citation degrades to
  naming the token and its convention var.

The generator reads `contract.authored.json` + the snapshots and merges them into the local views (the
authored decisions win). Nothing generates a surface from any of it. **Gate 14** reads the authored
`bindings` to resolve a prop rename or slot instead of guessing (a wrong binding never masks a real gap
— it still fails); no other gate reads the contract. A malformed `bindings` entry (a typo'd key) is
flagged in the run output, never silently ignored. Each run also reports **advisory** signals (never
pass/fail): breaking vs additive contract changes since the last run, newly-deprecated tokens and
components; **decision status** (how many components are deprecated / experimental, and every decision
an agent would misread — guidance (`useInstead`) or composition that still sends it to a deprecated
component, a `supersededBy` that names no DS component or a component that is itself deprecated (the chain
is followed to the one that won), and a deprecation with neither a replacement nor a reason; first 12 each
run, all with `--status`); token
references that resolve to nothing (a silent-failure risk), and tokens used where a different `$type`
is expected; **contract completeness** (how many emitted contracts carry a description, semantics and
whenNotToUse/useInstead guidance, naming those with no description so agent-readiness gaps are visible;
full list with `--contract-completeness`); **exemption debt** (every escape-hatch surfaced for periodic review, tagged by legibility:
temporary vs permanent, owner, and review-by, so temporary bypasses get cleared and permanent ones stay
accountable; totals each run, full list with `--exemption-debt`); **code→design drift** (props that
exist in code but not in Figma, surfaced as a "sync back to the design" advisory so code-ahead-of-design
is visible; the engine only surfaces it, the designer decides; totals each run, full list with
`--code-drift`; each component's line names its props); **component code** (`component-faults.mjs`: what a screen
runs into in a Vue component's own file, read without running it, each with its line: an element no rule styles, a
modifier class with no rule, one click firing an event twice, a slot repeated by a `v-for` with nothing passed, a prop
read only when mounted, a longer text prop whose line breaks are lost, a prop that takes HTML in one component of a
folder and text in another, an on/off that hides more than Figma's (the parts another Figma on/off shows, read from the
structure snapshot's toggles), and a slot Figma stretches its content in that sits in a column of the code drawing it at
its own width; a part it imports to draw itself, such as a base picked at run time, is read as its own; the
code's to fix, on the component's page and the Tasks page); **writing rules** (`writing-formats.mjs`: each date helper
of the code, as its moment/dayjs format, against the formats the intent layer's writing rules give (`d mmm yyyy`) and
how their examples write the month; a date for a machine, `YYYY-MM-DD`, is left alone; said for the whole system); and **token layering** (a structure-agnostic check: it imposes no
tier model, only measures the DS's own aliasing rate and, when references are the DS's norm, surfaces
the few tokens that hold a raw value instead); **token contrast** (computes WCAG contrast from the token
values, per mode, and flags pairs below AA; a no-browser complement to the render a11y gate. Pairs are
**derived** from the token-name convention — a component's `text`/`label`/`icon` token paired with the
background sharing its state/variant qualifier, on by default, opt out with `a11y.derivePairs: false` —
and/or **declared** in `ds-config.json → a11y.tokenPairs: [{text, bg, large?}]`; icon/stroke roles use the
3:1 non-text bar); **declared token tiers** (opt-in — only when
`ds-config.json → tiers: [{ name, match, mayReference?, layer?, holds? }]` is set: classifies each token by the
project's own regexes and flags a token that aliases a tier its `mayReference` disallows; with `layer`
numbering the tiers from the base up, each layer points at the one before it, so a token that skips a
layer (a component token straight to a primitive) or points back at a later one is listed too; only the
token it aliases counts, not the rest of the chain; `holds` names the kinds of token a tier keeps
(`color`, `sizing`, `typography`, `string`, `boolean`), so a colour in a sizes-only layer is listed;
never imposes a tier model, zero config = does not run); and an **AI-readiness scorecard** (a running R/Y/G
measure across gate health, coverage, documentation and guidance, aggregated from the signals above,
never a grade and never blocking); and **prune candidates** (a leaner library is cheaper for an agent
to read and mis-picks less: surfaces deprecated tokens still present, variant axes that do not vary
(a "variant" prop with one option), components used in exactly one place, and the token budget: the same
colour written by hand in two tokens, with no alias (two primitives for one colour, a token that repeats a primitive
instead of pointing at it; tokens that point at the same one share its value by design and are never listed) and
tokens only one component uses (a candidate to keep inside it) — each a QUESTION, never
a verdict; totals each run, full list with `--prune`). One more **opt-in, project-declared** advisory:
**list duplication** (`ds-config.json → duplication: { surfaces: ["AGENTS.md", ".cursorrules", …], minCluster? }`) —
a DS list copied by hand into an agent-instruction file, skill, or doc drifts into a stale parallel truth
(and a stale list is what makes an agent hallucinate). Flags a declared hand-maintained surface that restates
a cluster of DS component/token names (and calls out the same list duplicated across two or more surfaces),
so it can reference the generated `llms.txt`/contracts instead of keeping a copy; totals each run, names with
`--duplication`. Generated surfaces (the styleguide) are not listed here — showing every component is their job.
It also **validates Figma Code Connect** when present (auto-detected from committed `*.figma.tsx`/`*.figma.ts`,
or `ds-config.json → codeConnect.files`): Code Connect is a downstream artifact that can go stale, so the
audit diffs each mapping against the emitted contract — joined by Figma **node id** — and flags a mapping
that names a prop or enum option the contract no longer has (fix the mapping, not the contract; names with
`--code-connect`). Like every plan-gated capability it reads **only what is already committed locally and
never calls the Enterprise Code Connect API**, so any-plan projects are unaffected (no files = does not run).
Each emitted `<component>.contract.json` also carries a **usage
scaffold** (the element plus each prop with a concrete example value, derived from the contract itself
so an agent instantiates the component without guessing). Two more **opt-in, project-declared** advisories
(never imposed, never fail): **closed vocabulary** (`ds-config.json → closedVocab: { bannedTags, surfaces,
suggest? }` — counts raw container tags the project banned, in the declared surfaces) and **multi-brand
coverage** (flags a token defined in some brands but missing in others). Brands are resolved by
`resolveBrands`, plan-agnostically: **declared** `ds-config.json → brands: [snapshotKey, …]` wins; else a
captured **collections manifest** that marks a brand collection (the Enterprise / extended-collections
enhancement, read as data the any-plan capture wrote — never a plan-gated API call); else it **suggests**
candidate multi-mode collections but never assumes (modes may be theme/density/locale, not brands). Override paths with
`ds-config.json → contracts.{authored,out,tokensOut,schemaOut,llmsOut,propTypesOut}`; the engine ships only the generator.

**Figma prop types.** The same run writes `contracts/figma-props.d.ts`: per component, a `<Name>FigmaProps`
interface (one union per variant property, `boolean` for a True/False variant or a boolean property,
`string` for text, `unknown` for an instance slot) and a `<Name>FigmaDefaults` type. Names follow the props
check (an authored binding, then `componentPropAliases`, then camelCase); interaction states are left out,
as they are CSS. Type a component's props with it (`const check: ChipFigmaProps = {} as ChipProps`, or use
it as the props type) and `tsc` shows prop drift in the editor and in CI. `contracts/` stays local, so set
`contracts.propTypesOut` to a committed path when CI should check it.

#### Where each part lives: stores and a company's profile (`--store`, `--profile`)

A team keeps each part of the engine's own files where it chose: the Figma and code snapshots, the intent layer, the
contracts, the style guide, the differences kept on purpose (`kept`: a design rule agents follow, so a team keeps them
with its intent layer; with the decisions when the setup names no place for them) and the other decisions (answers to
proposals, accepted debt, checks made by hand), each in a GitLab project (a folder in it, a branch of it) or a folder (`stores.mjs`). `ds-config.json → stores`
names the place of each; the configuration reference has the format. Each run reads the snapshots, the kept
differences and the decisions from their stores when the store's commit moved, never over a file changed on this computer since it was last read
(that one is kept, and said). The contracts (`--contracts-out` with no folder), the style guide
(`--publish-styleguide`), the kept differences (after `--keep`), the decisions (after `--intent-decide`, `--checked`),
the snapshots
(`--refresh-snapshots`) and the intent layer (`--intent-changes --commit`, `--review-drafts --commit`, the fixes made on
each run) are written to theirs. A store brings into the project only its own kind of file (a snapshots store only
`*.snapshot.json`), never a `.env` or a hook.

**The team's themes** (`stores.themes`, often a `themes` folder in the style guide's own repository): the themes a
style guide module lets people make: one system's themes, flat (`<name>.theme.json` in the folder its `path` names; a
store several systems share points `path` at the system's own folder). Each run reads them into the
engine's own folder (`.design-system-engine-out/themes`), never the project's, and the style guide shows them in its
Theme choice, with the themes in the person's own module data folder beside them (the store's when both have one).
Each style guide build sends the themes this person keeps (their module data folder, or saved beside the page) that the store lacks, or holds an older version of, when GitLab lets them write it: a theme made reaches everyone with no step of its own, and a newer one a colleague sent is never replaced. `--share-theme <file>` sends one by hand.

**Who may write is GitLab's answer, never the setup's.** Before the first write to a place in a run the engine asks
GitLab, with the token that would write: the token's role in the project (Developer or more writes), whether it may
push to the branch (a protected branch it may not push takes a merge request instead), and a commit with nothing in it,
which a token that may write sees refused as empty (400) and a read-only token as forbidden (403), since a
fine-grained token cannot be asked for its scopes. Nothing is written by that. When GitLab says no, nothing is sent and
one line says why and who can grant it; the run goes on. When the branch moved since the run read the store (another
run wrote it), each file is merged and nothing written meanwhile is overwritten: one only this run changed is sent, one
only the store changed is taken, and one both changed keeps the copy built from newer inputs (its stamp); one whose
inputs cannot be ordered is held and named, and `--force` sends it. The engine runs on each person's computer and could be edited:
GitLab's roles, protected branches and per-project tokens are the lock, and they stay one even if it is bypassed.

**A link that moved still works.** Each GitLab link (the code, the intent layer, a store, the profile) is asked of
GitLab first: a project that moved or was renamed is found where it is now, and a link that names the project by its
name instead of its path finds the one project of that name in that group. Every call then goes to the project by its
id, which a move never changes, and the run says once which path to write instead.

**Tokens stay in each person's `.env`.** A place may name its own variable (`tokenEnv`, one token per project, the
least each needs); else `GITLAB_TOKEN` reads and `GITLAB_WRITE_TOKEN` writes. A place may also name only the token that
writes there (`writeTokenEnv`): a pipeline sets it to the project's own access token, and a computer without it writes
with `GITLAB_WRITE_TOKEN`, else with the person's `GITLAB_TOKEN`. A token goes only to gitlab.com or a host
named in `GITLAB_HOST`.

**A company's profile** (`profile.mjs`): the shared setup (`config`: the Figma file, the paths, everything but what one
person sets for themself), where the code is (`project`), and the stores, in one JSON
(`design-system-engine-profile.json`) its maintainers keep in a private repository everyone can read and only they can
change. `--profile-new` asks one thing a part, where it lives (a GitLab link with the folder and branch in it, a
folder, or nowhere; in a terminal, else it takes `--store <part>=<place>`), never who may read or write it, and writes
it from this setup; `--profile-export` writes it as it is. Neither ever writes a token or a personal key (`intentLayer.autoFix`,
`intentLayer.draftModel`, `codeRoots`, `pluginDirs`, `codeReading.hookBrowser`, `webhook`, `hooks`,
`styleguide.modules`), and nothing named like a secret. `--profile <link or file>` writes it into this folder's
`ds-config.json`: its shared keys and stores win, what the person set for themself stays, keys it does not name stay,
and `profile` remembers where it came from. Each later run reads it again (with the person's own `GITLAB_TOKEN`) and
takes a new version when its maintainers changed it; `--offline` keeps the one there. Setup by a profile asks nothing:
the run says what GitLab lets this person do with each part.

**One line for a company's people**: `curl -fsSL …/install.sh | bash -s -- --client <client> --profile <link>
[--folder <work folder>]` installs the engine, writes the company's command, asks for the person's GitLab token in the
terminal (hidden, with how to make one: `read_api` to read, `api` to also change things; one token for every project,
since GitLab lets it write only where the person's role allows) and keeps it in the work folder's `.env` (mode 600),
then sets the folder up from the profile. The token is never on the command line.

**The company's command**: `--make-command <client> --profile <link>` writes
`~/.claude/skills/rms-design-system-engine-<client>/SKILL.md` (or into `--dir`, to share it in the company's private
repository): the engine run with that profile. Each colleague installs the engine and that command, puts their own
tokens in `.env`, and runs `/rms-design-system-engine-<client>`: nothing else to set up, and a location changed in the
profile reaches everyone on their next run. One profile and one command per client, side by side; none of it is ever
in the engine.

**Each repository's README says what is there** (`readmes.mjs`). The profile's repository gets its whole README from the
profile file: how each person sets up (the install line, the token, the command), where each part lives, what the
repository holds; and the command each person installs (`<command>/SKILL.md`). Its client name is the profile's
`client`, else the command folder the repository holds. Every other repository a store names gets a section of the
engine's in its README, between two markers (`<!-- rms-design-system-engine:start … -->` and `…:end -->`): what the
engine keeps there and who writes it, the snapshots it holds, its pipeline (the variables `.gitlab-ci.yml` lists in its
comments, and its schedules) or, with none, that whoever runs the engine publishes the style guide, who can do what, and the related projects. What the team wrote around the markers stays;
a README without them gets the section under its title. Each run generates them, compares them with what is there and
writes only what differs, where GitLab lets the person running it write (a commit, or one merge request the engine keeps
open); a run without that access changes nothing and says nothing. A repository is asked again only when its branch
moved, the setup changed or the engine did, so a person who may only read is not asked on every run. `--readmes` does it
now and says what happened to each; `"readmes": false` in `ds-config.json` turns it off.

#### Publishing the contracts to a shared repository (`--contracts-out <dir>`)

The local `contracts/` stay local. To give a team one shared contract per component (beside its intent layer, say),
`rms-design-system-engine --contracts-out <dir>` writes the contracts in their published form into a folder of
another repository's clone, and nothing else: one contract per code file (`contracts.layout: "code"`, see the
configuration reference), `contract.schema.json`, and a generated `README.md` (what a contract holds, where each part
comes from, coverage counts, and the Figma components with no file of their own). No token values, catalog,
`llms.txt` or `.gitignore`; no copy of the intent layer's text (`intentPage` links to the page). A contract the code
no longer has is removed. The same inputs give the same files, so an unchanged system gives no diff. The engine never
commits or pushes a folder it was given: review the diff, commit it on a branch, and open a merge request. With no
folder, the contracts store gets them (`stores.contracts`), as one commit or a merge request when GitLab lets this person
write it (see Where each part lives). The published contracts are
generated: changes go into the code, Figma or `contract.authored.json`, never into the files.

Each published contract carries, beside the Figma half: `bindings.code` per property (the code prop or slot, who
decided the pairing: `authored`, `alias`, `codeConnect` or `name`; its type, options, default, required, description;
the Code Connect `valueMap`; `inverted` when the code holds the opposite of the Figma value, as `showClose` and
`hideClose`), `conditions` (the attributes a property only decides are written, from the Code Connect template),
`differences` (default, options, name), `codeOnly`, `events` with payloads, `codeSlots` (the code's slots, with the props
each hands its content; `slots` stays Figma's instance swaps and what each accepts), `states`
(Figma's state axis and the code's pseudo-classes), `tokens` per state, and `accessibility` (element, role, ARIA,
keyboard, each with where it was read), `anatomy` (the root and the inner frames Figma binds a padding or a gap
on; a gap on a frame of one item is left out, and padding bound to a border width is `borderInset`), and
`source.code.commit` (the last commit that changed the component's file, so an unchanged component keeps the same
file). The props gate (Gate 14) pairs Figma and the code the same way
(`prop-binding.mjs`), so the two never disagree.

Once published, the shared contracts are what the style guide links to. The intent-layer sync reads them with the
pages (`shared-contracts.mjs`): each component's **Contract** button opens its file on GitLab, and its Documentation
**Properties** row is done while the shared contract still lists what the code and Figma have, and a task to publish
again when it does not (a prop, event, slot or Figma property added or gone, or a contract in another format). With
none published, the row names the engine's local contract as a task to publish it.

#### The code capture (every run, and `--capture-code` on its own)

Figma is captured once per run into snapshots every gate reads. The code is now captured the same way:
each audit run writes `.design-system-engine-out/code.snapshot.json` (local, keep `.design-system-engine-out` gitignored; setup adds
it) before the gates start, and every fact in it says **where it came from** and **how sure the reading
is**. It is cached by content, so an unchanged project reuses it at once; after a code change the
browser part takes a few seconds per component. `rms-design-system-engine --capture-code` runs it on its
own. `ds-config.json → codeReading.capture: "off"` skips it in the audit (the gates then keep their own
readings, and Gate [25] (What this audit actually checked) says the capture did not run). Inside a git hook the capture is static only, so a
commit never waits for the browser: a pre-commit hook is detected on its own, any other hook passes
`--hook`, and `codeReading.hookBrowser: true` brings the browser back. The next normal run redoes the
capture with the browser.

- **Two readings of every token.** Chrome (via `cdp.mjs`) opens the theme and the built pages, switches
  into each mode the way its `cssSelector` says (media emulation, a class, a data attribute, a viewport
  width) and reads every custom property as the browser resolved it, including tokens a page injects at
  runtime. `css-source.mjs` reads the same CSS statically: a real block parser (`@media`, `@layer`,
  `@supports`, nesting, strings, `;` inside `url()`), local `@import` followed, `<style>` blocks read out
  of HTML, file and line kept, and each mode resolved by the actual cascade (importance, specificity,
  source order), so a later `:root` that silently overrides a dark block is seen as the browser sees it.
- **Components measured where they render.** Each component (found through `component-locator.mjs`) is
  measured in the generated styleguide or the built pages: a plain instance first, one that carries text
  next; a usage with extra classes or an id is copied into a neutral host without them (and the removed
  extras are recorded); a hidden one is measured as a copy; else a probe from `structure-contract.mjs`; else,
  for a React component, the markup its own JSX returns (`jsx-markup.mjs`: the element types, the classes
  that are always there, string attributes and default text, so a `<span>` or an `<input>` is measured as
  one); else a bare element built from the selector, its contract children and the parts the selector map
  names (lowest confidence, and never a height, since it has no content). When the rule already sets Figma's
  height and the drawn box is another, the fix names the cause: an inline element that ignores a height, or
  padding and border outside a content box. The parts the contract names
  (`fontSel`, `radiusSel`, `gapSel`, `beforeSel`) and the first element holding text (what Figma's font
  fields describe) are measured too. Numbers are repeatable: fixed viewport and pixel ratio, fonts loaded,
  transitions off.
- **Every value traced.** `CSS.getMatchedStylesForNode` names the declaration that won (importance, then
  cascade order, inline last), its `var()` token, its rule and its source `file:line` (the built page's
  line is kept as `renderedAt`). Inherited values name the ancestor rule; values no author rule sets are
  labelled browser defaults and are not code facts. When another rule beats the component's own base rule,
  the override is recorded (`overrides: { baseRule, baseValue, baseAt }`).
- **States produced for real.** From each component's `propertyMap`: `:hover`/`:focus`/`:active` forced,
  classes, attributes, `:disabled`/`:checked` applied, a BEM modifier swapped in; a state that cannot be put
  on the instance is looked for, on every page, on an element already in it. Anything still not produced
  is listed with the reason.
- **Confidence on every fact.** `verified` (the browser and the source agree on the rule that won),
  `single-source`, `uncertain` (the readings disagree: reported as a reading problem, never as a design
  difference), `not-read` with the reason, or `default`. Known browser rules are applied, not flagged:
  border widths drawn in whole pixels (the declared `1.5px` stays the code's fact, `drawn: 1px` beside it), an
  inside stroke drawn as an inset ring (`box-shadow: inset 0 0 0 1.5px`, so it adds no height) compared by the
  ring's width and colour, never by the border it does not have,
  a unitless line-height is a multiple of the font size, a `min-height` larger than `height` wins.
- **Cached by content.** A hash of every input; an unchanged project reuses the snapshot instantly
  (`--force` recaptures). `ds-config.json → codeReading: { browser: "auto" | "off", pages: [...], out }`.
  Without Chrome every fact is `single-source` from the static reading and says why.
- **Component APIs (props).** Read from the best source the project already has, never a new dependency:
  a Custom Elements Manifest (`custom-elements.json`), react-docgen or vue-docgen JSON
  (`codeReading.docgen`), the project's own TypeScript compiler when installed (the `Props` type read by
  syntax: allowed values, booleans, defaults, Vue `defineProps`/`withDefaults`), then text patterns. A
  Storybook index (`storybook-static/index.json`, or `codeReading.storybookIndex`) and committed Figma
  Code Connect files (`*.figma.tsx`, joined to the Figma component by node id) only say which file is
  which component and which code prop a Figma property maps to; they never supply values. Each prop is
  `verified` when two sources agree, `uncertain` when they disagree. With `frameworkComponents: false` no
  props are read (the components are markup and CSS).
- **Icons.** Every sprite `<symbol>` with its file and line, `viewBox`, path data and fill/stroke flags,
  and every literal use (`file:line`).
- **Markup.** Each app's fingerprint, the same one Gate [18] (Markup) compares.
- **Nesting.** Which DS components sit inside which, read in the rendered page (so markup built by
  JavaScript counts) and in the component's source file. Both readings agree: `verified`.

**The gates read the same way.** The props, nesting, icon and markup gates use the capture's readers
(`component-api.mjs`, `component-source.mjs`, `icon-source.mjs`, `markup-source.mjs`), and Gate [3] (Token values)
reads the theme with the capture's cascade-aware reader: every `:root` block, local `@import`, and each
mode resolved as the browser resolves it (a `:root` written after a dark block wins in dark mode too, and
Gate [3] (Token values) now reports that). Where a gate needs a fact only the capture has, it reads the snapshot, and
only while the snapshot still matches the code:
- Gate [3] (Token values): a token the browser and the CSS text disagree on is listed as "could not read reliably"
  (not verified, so the gate stays red) instead of blaming the design.
- Gate [16] (Sub-components match Figma): a sub-component the rendered page shows inside its parent counts as used, so JavaScript-built
  nesting passes, and a parent with no source file is judged by what renders.
- Gate [25] (What this audit actually checked): one `CODE CAPTURE` line with what was read (tokens, components measured, states, props,
  icons, nesting) and how, or that the capture is missing or out of date.

**`--capture-code --compare`** lays the capture beside the Figma snapshots, field by field, and writes
`.design-system-engine-out/code-vs-figma.json`. Tokens resolve exactly as Gate 3 resolves them (the trailing `/color`
dropped, then `design-system-engine-map` `EXPLICIT` / `EXPLICIT_SIZING`, then the naming convention; `SKIP_TOKENS`,
`NULL_TOKENS` and an explicit `null` skipped). Component fields: a height only where the code fixes one (a
`height` rule compared as the drawn box, a `min-height` by its value), padding, gap and radius by token or
value, font against the first text element, background as "paints or not" (Figma often paints on a child
layer, code on the element). On a project whose parity is green this is a calibration: every difference is
either a capture bug to fix or a real fact about the code that no gate looks at yet. Gate [13] (Structure)
runs the same token, icon and nesting comparison on every audit, after the components. `MEASURED TOKENS` lists a
Figma token the page resolves to another value only where the browser alone read it (a script, or a stylesheet
the page loads that Gate 3 does not read), with what sets it to look for. Everything else is already listed by its
own gate (tokens by Gate 3, icons by the icon check, nesting by the sub-component check), so one line counts it
(`📋 measured too: tokens 346 match · icons 40 match`, with how many differ and which check lists
them) and nothing is listed twice. Advisory like the rest of `MEASURED`; `renderedParityStrict` (and build mode)
makes a listed token fail the gate.

#### The component catalog and `--check-ui` (for UI generators)

A generator (an AI agent, a small model in the browser, a template tool) composes real design-system UI
only when it is told exactly what exists, and its output is checked every time. Every run writes
`contracts/catalog.json` beside the contracts: each component with its props (allowed values, defaults,
and the code prop name when known; a prop only the code has, such as a Vue `variant` Figma has no property for, is
listed as the code names it, `codeOnly`, read from the component's own file when no fresh code capture holds it), the
components it may contain (from Figma's composition and the
nesting the code capture saw), what it must never contain, its status, and where it lives (`livesIn`, also
in each contract): the products whose code uses it, with how many files and uses (a page built from a source
beside it counted once), the system's own pages that show it, the components it sits inside and the ones it
holds, and the Figma screens that draw it. `--query` prints it, and `differences.md` names it under each
component, so a difference in a component five products use reads as the larger change it is. `llms.txt` gets the same
catalog as an aligned table (`Badge  Tone=info|warn  Text=text`), because small models read aligned
tables far better than JSON Schema. Interaction states (hover, focus) are not props a generator sets:
the component owns them. When the code capture is fresh, each entry also has `rendered`: its size on a
real page, `targetSize` for a control (with `atLeast24`, WCAG 2.5.8), and what each state changes, by
token where the code uses one (`"State=Hover": { "backgroundColor": "var(--btn-bg-hover)" }`).

`rms-design-system-engine --check-ui <generated.json>` checks one generated UI against that catalog. It
accepts a flat A2UI-style list (`{ root, components: [{ id, component, children: [ids], …props }] }`) or a
nested `{ component, props, children }` tree. The check is deterministic and prompt-blind: it never
repairs the UI and never adds anything, so it can be run on every generation. Its rules are written
down once (only catalog components; only listed props and values; booleans are true or false; unique
ids, one root, existing children, one parent each, no cycles; nothing inside a component it must never
combine with), and every finding names the rule it breaks. A deprecated component, a node not attached
to the tree, or a child the design system never nests there is a warning; an experimental one is a warning that
says it may be used for what it is for. Given a page or a component file instead (HTML, JSX, Vue, CSS), it runs the
check every edit gets on what changed since the last commit, never failing the file as JSON. Findings are also written to
`.design-system-engine-out/ui-check.json`, so a generation log can keep them beside the raw output; the error count is
the generation's quality score. Exit 1 on any error.

#### The construction grammar (`--query construction`, `--construction`, `--figma-fix`, `--construction-check`)

How the system builds a component in Figma, mined on every run from its own components and written to
`contracts/construction.json`: how a component, each kind of property (boolean, text, instance swap, slot, variant) and
each variant option is named, the word a kind of property begins or ends with (`show…`, `…Content`), whether layers carry
names of their own (never Figma's `Frame 235`) and in which case, whether every component and variant lays out with auto
layout, whether a component binds its own variables (`<prefix>/<component>/…`) or the shared ones, colour and spacing
apart, and whether it carries a description. Nothing is imposed: each line is what the system's own components already
do, seen on three or more, with how many follow it and which do not. There are no exceptions: a component follows it or
is to fix. Each line has a status:

- **Rule**: every component follows it. Nothing to do.
- **To fix**: four in five or more follow it, or the team made it the rule. The others are to fix; it is a rule once every
  one does.
- **To decide**: fewer follow it and the team has not decided. `--construction <rule id> yes` makes it the rule (its
  components to fix), `no` drops it; the answer is kept in the authored contract (`construction`).

`--figma-fix <component> [<rule id>] [<value>] [--to <name>]` writes what one component must change to follow the rules
as the script `--figma-edits` writes (`.design-system-engine-out/handback/figma-apply.js`), run with the Figma tool once
the person says yes; `--figma-fix --rule <rule id>` does every component of one rule. The engine renames only: the
component, a property, an option, a layer in every variant (never inside an instance). `--to` gives another name, and
names a layer Figma left unnamed (Claude reads what it holds and proposes one). Layout and variable bindings are a
person's: said, never written. The variant axes the system already uses, with their options, are kept as a vocabulary
to reuse. `--query construction` prints it all; building or changing a component in Figma follows it.

How each component is built inside comes from the skeleton the Figma capture reads (`figma-skeleton.snapshot.json`):
every text layer with a text style, every shadow with an effect style, no layer hidden without a property to show it,
every boolean, text and swap property driving a layer, icons as instances never drawn vectors, layers in the auto layout
flow, nested components and variables from this file, no pinned variable mode, one layer structure across a component's
variants, hover and pressed states reached by prototype reactions, swap properties listing what they take, each
component in a section, a link to its code; and for each family of three or more (the buttons, the cards), the shape
most are built in (its root's auto layout and what it holds, in order); the order a frame's layers come in, and each
component on its family's page. From the structure capture: where a component's padding sits (its own frame, or a layer
inside it), and whether a yes/no variant changes how the component looks: one whose two variants differ only in layers
shown or hidden (the same fill, stroke, text, padding, gap and corners) is a boolean property in all but name. Each is a
line with the same statuses.

The style guide has a **Construction** page: one table, a row per line with its status, how many follow it and what is to
do, filtered by status. A row opens in the side panel: the decision to copy for a line to decide, and each component to
fix with its fix to copy into Claude Code (Fix it, Another name, Name a layer; Fix all for a rule's renames). The page is
in no menu and no search, opened only by its link (`#construction`), until the team lists it (`styleguide.construction`).

A rule the team decided is checked on every run, beside the gates (a gate compares Figma with the code; this is Figma
beside its own rules): the run's summary has a **Construction** line with each decided rule a component breaks, and
`--construction-check` says the same and exits 1, for a pipeline that fails on it. Nothing is said until the team decided
a rule.

#### A component built in Figma (`--spec`, `--figma-build`)

**--spec.** `--spec "<description>" [--like <component>] [--name <name>] [--ops <file.json>]` writes the spec of a new
component to `.design-system-engine-out/specs/<name>.spec.json`, in DSDS's shape (its traits and what it nests), with the
engine's own part: what was asked, the component it is like, the operations that make it, its questions, what it adds to
the system and the names it wrote the system's way. It starts as a copy of the component it is most like (named with
`like`, else the one whose name shares its words, else it asks), and takes only the operations that make it what was
asked. Each is checked against the system: a variable, a component, a text style or a layer it names must be the
system's, else it is a question with the nearest the system has; a value (`#ff0000`, `16px`) is always a question, never
written. A new name (the component, an axis, an option, a property, a layer) is written as the system's construction
grammar writes that kind of name. The variables the component it is like was given as its own, and its description,
are asked. Run again with `--spec --name <name> --ops <file>`: the spec keeps what was asked, and the file holds every
operation so far. The operations, each an object with `op`:

- `rename { what: component | axis | option | property | layer, from, to, axis? }`
- `addOption { axis, option, like }` (its variants copied from the option it is like), `removeOption { axis, option }`,
  `addAxis { axis, options, default? }`
- `addProperty { name, kind: boolean | text | swap, default, layer }` (the layer it drives), `removeProperty { name }`,
  `setDefault { property, value }`
- `addLayer { parent, index?, layer: { type: instance | text | frame, name, of?, variant?, style?, text?, layout? } }`
  (an instance of one of the system's components, a text with one of its text styles, or a frame), `removeLayer { layer }`
- `bind { layer, field, variable, where? }` (`''` is the component's own frame; field: fill, stroke, gap, padding,
  paddingX, paddingY, paddingTop…, radius, fontSize, strokeWeight, width, height; where: `{ size: "l" }` for some
  variants), `rebind { from, to }` (every binding of one variable moved to another)
- `describe { text }`, `place { page?, section? }`; and to start one, `clone { from, name }` (what `--like` writes) or
  `create { name, axes?, layout? }` when no component is like it

A layer is named by its path inside the component (`Content/Label`).

**--figma-build.** `--figma-build <name> [--signed-off "<who>"]` checks the spec again against the capture as it is now,
and builds nothing while a question is left. A new component, and a new option, axis or property on one, adds to the
system and waits for a named person to sign it off; `--signed-off` records who and when in the spec. It then writes the
steps to `.design-system-engine-out/handback/figma-build.json` and the Figma script to `handback/figma-apply.js` (the one
script the project's hooks let `use_figma` run, once the person says yes; a project whose `writes.figma` is `no` gets the
steps alone). The script copies the component it is like beside it, makes only the listed steps in every variant, and
returns what it changed, skipped and could not find. Then the Figma snapshots are refreshed and `--construction-check`
and `--hygiene` say what they find on it.

**--figma-change.** `--figma-change <component> "<change>" [--ops <file.json>] [--task <issue link>] [--signed-off "<who>"]`
changes a component the system has, only what changes, with the same operations. It reads a few changes in words (`add
xl to size like l`, `add a boolean showBadge on Content/Badge`, `rename Label to Text`, `remove the option size=xs`, `bind
Content gap to spacing/s`, `move chip/label/color to text/default`, `description: "…"`) and says what it could not read;
`--ops` gives them as operations, `--task` reads the change from a GitLab issue. It writes the change to
`.design-system-engine-out/changes/<component>.change.json` and prints its report, from two structured reads of the
component (the capture now, and the same once the change is made), never from memory: its skeleton (each layer added,
removed or renamed, matched by node id, so a rename is never a removal and an addition), its architecture (variant axes
and options, properties, what each drives, the variants), its variables (each layer and field's bindings, from → to),
and where it is used (its contract's products, the components it sits inside, the screens, and with `FIGMA_TOKEN` its
instances in every team file from Figma's library analytics, on the plans that have them; otherwise those files are said
not seen, and why). A removal or a rename breaks what leans on it; a new option, axis or property adds to
the system: both wait for `--signed-off`. The faults the component already has by the construction grammar's rules are
listed apart, never fixed with the change. Then the script (`handback/figma-apply.js`), run with `use_figma` once the
person says yes.

**--change-report.** `--change-report <component>`, once Figma is read again: the read before beside the read after,
section by section, and each place where it is not what the change said (warned when Figma was last read before the
change). Each report is kept in the change's file (`done`) and, once made, in `changes/done/`. The style guide has a
**Changes in Figma** page: one table, a row a change (its component, what was asked, waiting, made as said or not as
said), each opening its before and after in the side panel (what the change said it does, what Figma shows once read
again, where it is used, what it breaks and adds, who signed it off, the faults it already had); each component's History
lists its changes, linked to that panel.

#### A scheduled pipeline (`--ci-changed`)

`rms-design-system-engine --ci-changed` says whether anything a build is made from moved since the last build, for a
pipeline started on a schedule because nothing can start it on a change (a code repository the team may only read). It
reads the latest commit of the code (its GitLab mirror), of each store read from GitLab (for its folder), of the intent
layer and of the profile's file, Figma's version of the file (with `FIGMA_TOKEN`) and the engine's own commit, with the
tokens every run reads (the environment, else `.env`). Exit 0 names what moved (or that no build is recorded yet); exit 3
says nothing did. `--ci-changed --record`, after a build that succeeded, keeps them in
`.design-system-engine-out/ci-last-build.json`. A store the build only writes (the published style guide) is never read,
so its own commit starts nothing; a folder with no commit yet is a state of its own; a source that cannot be read counts
as moved.

#### Prototypes

`rms-design-system-engine --prototype --catalog` prints everything a prototype may use, in this order: what it was read
from (each Figma snapshot with its age, the code, the authored contract, each guidelines file with the Notion or GitLab
link it came from, and a link not fetched yet); for this request, what applies to it; the catalog's components with
their options (a component the code does not have is marked: it is drawn as a labelled box); what each component is for;
the team's rules for the product, in tiers; the rules the check holds every prototype to; the templates in Figma; how the
product's pages are arranged; the engine's layout pieces with the spacing tokens, text styles and screen widths they
take; the format; and the prototypes already in `prototypes/`. For a request (`--for`) it first lists what the system cannot decide from it, under
**ASK FIRST**: which kind of page, when the request names none of the system's page templates or fits several alike (a
template that lays a panel, a drawer or a dialog over a page is not a kind of page); what the page is for, when nothing
in the request matches what any component is for; and each question the documentation leaves open on what it touches.
Its NEXT line then says to ask the person and wait; `--answered`, with the answers added to `--for`, asks nothing.

**The rules come in tiers, and the more specific one wins.** Three kinds of rule reach an agent at once: the engine's
own, true of any design system it checks; the design system's, written by the team that owns it; and a product's own
(a product page or flow in the intent layer, and the project's own instruction file for agents). The catalog prints
them in that order, from the most general to the most specific, with one line saying the ladder, so an agent that
meets two rules it cannot both follow knows which one holds: the one written closer to what it is building. A rule is
placed by where it was written, never by what it says, and a system whose rules are all of one tier reads as it always
did. A product narrowing the system's general rule is how a design system is used, not a fault.

**Each component carries what was already decided against it.** Every decision a person makes is recorded where it is
made (a difference kept on purpose with its reason, a proposal answered yes or no, a difference accepted for now, a
component checked by hand, a need nothing fitted with what was looked at and why). They are gathered into one log,
written to `.design-system-engine-out/DECISIONS.md` and shown beside each component's Changelog, and a card carries
the ones that rule an option out: `decided against: <what>, <why> (<how it was decided>, <who>, <when>)`. An agent
that does not know a thing was considered and rejected proposes it again, confidently, every time it is asked. A
`DECISIONS.md` the team wrote by hand is read as one more source and never rewritten.

A system of more than 30 components or rules is shown in full only where the request needs it, so the catalog is read
whole instead of skimmed: `--for "<the request>"` (or the request the project's hook saved) picks the components it
points to, the ones its designed screen and starting pages are made of, and the ones the guidelines it touches and those
components' own rules name as code writes them (`` `TabStrip` ``, `buttonPrimary`, `<Toolbar>`), at most 16. Every other
component is one line, every other rule is named by its page, and the token pages are counted (their tokens are in the
scales). `--detail <name or rule title>,…` prints any of them in full. A component whose own page only points to its
family's spec takes what it is for from the next line; one with nothing from Figma or the code takes its purpose and
role (`Role:`) from the intent layer, whose lines are each said once (a family's shared rule and the component's own)
and whose examples (`Example:`) are shown as examples.

- **A page in the system's own code.** When the system's components are code (Vue, Svelte, React, custom elements), the
  catalog shows each component it gives in full as a usage card: its import as the product's code writes it, its props
  (type, values, default, required) with the fields of each list or object prop (from its doc comment, `- id {String}`
  under `@tabs {Array}`), its events as the framework writes a listener, its slots, and its first use in the code with
  the data it binds; then how the project writes a page (its import alias, its script style, whether any component takes
  a two-way binding, the helpers its uses import). The prototype is then `prototypes/<Name>.<ext>`, and
  `--prototype <that file>` checks it (`page-check.mjs`, the engine's own markup reader: no dependency). Each of these is
  an error: a tag that is not one of the system's components or an import of one that does not exist (with the closest
  name), a component of its own, a prop, value, event, slot or two-way binding the component does not have, a required
  prop left out, `"false"` written as text, a list item with a field the component does not take (a field its own code
  reads counts, the comment may leave it out) or without one every use in the code gives, a part outside its container,
  more of a component than the guidelines allow, and a page that starts from none of the templates the documentation
  has. What every edit is held to (a colour or size of its own, an undeclared variable, an accessibility problem) and the
  project's own ESLint and Stylelint (run, never fixing) are part of it; a finding the lint fixes itself (indentation,
  quotes) is counted apart as formatting, for the project's lint run to fix. `<div data-missing="<need>" data-searched="…"
  data-why="…" />` is a gap, kept in `prototypes/gaps.json`. It ends with ✅ Ready or ❌ Not ready. The project's hook runs
  the same check on every edit of a page in `prototypes/` (`prototype.dir` in `ds-config.json`), from the system the
  last `--prototype` run kept (`.design-system-engine-out/prototypes/page-system.json`); so does `--check-ui <page>`.
<<<<<<< HEAD
  `--prototype <file> --handoff` writes `prototypes/<name>.handoff.md` beside it: what the page is made of (each
  component, how often, how it is written and where its file is), what the system lacked for it, and what is still
  unresolved. It measures nothing new - every number comes from the check that just ran - and it is written whether or
  not the page is ready, because a page that is not ready is exactly the one someone else needs the facts about.
=======
  `--prototype <file> --comment "<what you saw>" [--on <component>] [--line <n>]` keeps what a person said about the
  page beside it (`prototypes/<name>.comments.json`, committed), and `--close <id> --answer "<what changed>"` closes
  one with what it produced. Every run of that page prints the open ones, oldest first, above what the check found: a
  person's words outrank a rule, and whoever reads them is about to change the page. Closing one needs an answer,
  because a comment closed with nothing said is one nobody can learn from.
>>>>>>> 1352113 (What a person said about a prototype is kept with it)
- **As a page, the same for every framework** (`page-quality.mjs`, `page-render.mjs`). Beside the system's own checks,
  the page is read for the habits agents fall into (🎨 AS A PAGE, a score out of 10): a card inside a card, more than
  one main action in view (an action inside a dialog or a panel is that layer's own), a destructive action styled as
  the main one, more than one main heading or a heading level skipped, a field labelled only by its placeholder,
  several alerts on one page, and three sections or more with no heading. Then the states it owes (🧪): a list with
  nothing for when it is empty, a form that shows no error, data it loads with nothing shown meanwhile, each with the
  system's own component for it where it has one. Read from the page's structure, so a Vue, React, Svelte or HTML page
  is read alike. A page the checks pass is then drawn (📱 EVERY SIZE): a Vue page by the project's own build, a React
  page through the engine's stand-in for React (TypeScript, the project's or a global one), at Figma's breakpoints (else
  a phone's, a tablet's and a desktop's width), its words as written and 40% longer; what runs past the screen, is
  cut, wraps inside a control, or is under 24px to tap on a phone is said with its words. A page it cannot draw (another
  framework, a page or a component on it that throws) says why, and nothing is guessed; `--no-browser` skips it. Each
  ⚠️ line is fixed, or the reply says why it stays. A composition gets the habits the browser review does not measure
  (🎨 HABITS).
- **What agents invent, and why.** Each page check (the command and the edit hook) keeps every mistake in
  `.design-system-engine-out/prototypes/inventions.json`, each with why: a gap in the documentation (the component has
  no page in the intent layer, its page shows no example of it in use, or its code comment does not say what a list
  takes) or written and not followed (a rule the agent missed, an example it wrote otherwise). The report ends with
  📓 lines for the gaps. What the code answers for sure is written: an example the intent layer gets
  (`--intent-changes`, and the audit's `intentLayer.autoFix`) is the product's own first use of the component, its
  `data-*` and `class` left out, written as final; the rest shows on the Documentation page as **What agents got
  wrong**: to write (Missing) where the documentation lacks something, to check (Review) where it is written and was
  still missed. The page system read without Figma: the intent layer's pages name each component and template and
  its code file; with no intent layer, the code's own component files.
- **The documentation under load.** Three tests find where agents cannot tell what to use or how, and the
  Documentation page lists each finding (`.design-system-engine-out/prototypes/`):
  - `--prototype --coverage` (no agent, instant): what an agent cannot learn about each component, a prop, event or
    slot no comment and no intent layer line names, a list whose items no comment describes, a field the product's
    code gives that no comment lists, and a component with no page, purpose or example (`doc-coverage.json`; the row
    **What its documentation does not say**, Missing).
  - `--prototype --rules` (no agent, instant): everything written for the agent, read against itself
    (`rules-sweep.json`). Three lists, and nothing is rewritten: pairs that cannot both be followed (opposite words
    about the same component, two counts of it, two places it may only go), a rule written twice in two places in
    different words, and rules that name nothing the system has and no check reads (advice, not rules). The project's
    own instruction file for agents (`AGENTS.md` and the rest) is read for what it says about the system and nothing
    else; the engine's own section in it is left out. Pairs written in two different tiers are settled by the ladder
    (below) and only counted; what is listed to settle is the pairs written inside one tier, by two people with the
    same authority. Each component's Documentation page lists the ones about it (the rows **Rules that cannot both
    be followed** and **A rule written twice**).
  - `--prototype --scenarios [--model <id>]`: each component's "when to use" lines, its own names taken out (a line
    naming another component is skipped), become needs; an agent given only what each component is for picks one, and
    a wrong pick is a confusion (`stress.json`; the row **Agents picked another component**, to review). A "when to use"
    line several components share word for word cannot tell an agent which one to use: it is never asked, and is
    listed; a component whose every line is shared has the row **When to use it, not a sibling** (Missing).
  - `--prototype --sweep [--requests <n>] [--model <id>]` (12 by default): a page for each of the intent layer's
    product pages, templates and patterns, written once from the catalog, kept in `prototypes/sweep/` and scored by the
    page check; each mistake goes into `inventions.json` with its why, and the report counts the pages written with
    nothing invented. The agent first names the components it needs in full (as `--detail` lets it), then writes the
    page. A `data-missing` need a component's name says (a secret field, secretField) is an error unless the page
    names it in `data-searched` and says in `data-why` why it does not fit. Run it again after writing what was missing
    to see the count fall.
  Both agent tests use the `claude` command (`--model`, default the drafting model) and print why when it cannot answer.
  **Each test closes what it can.** At its end (and at the start of every engine run) the intent layer is fixed when
  `intentLayer.autoFix` is `"commit"` and GitLab lets the person write. What the code says for certain is written as
  final on the component's own spec and page: what each list or object holds (**Data**: the fields its comment names
  and those the product's code gives it), and an example from the product's own use. Data is the engine's section: each
  run takes out a line the code no longer says (a field renamed or gone) and writes the new one, so the page follows the
  code with nothing to review. Events, props and slots are the intent layer generator's own definitions, read from the
  code; an event whose definition only names it ("Event emitted by the component.") is listed as a gap. What needs
  judgement is drafted, marked `**Draft:**` (Review): a "when to use" of its own for a component whose every line is
  shared, and when to use it and not the component agents picked instead. A page written from a spec several
  components share is not changed (listed: give it a spec of its own). The sure parts are written even when nothing
  can be drafted (no `claude` here).
- **Where a component goes** is read from the documentation as written, and the check holds every prototype to it: a
  sentence that names the component and its container as the system names them (`` `searchField` only inside the
  toolbar``, ``Do not place `TabItem` without `TabStrip` ``) makes a part outside that container an error. One that
  allows another owner (`unless another component lays it out`) is an error only when nothing of the system holds
  the part. An unknown prop is an error with the closest real name (`did you mean variant?`).
- **What each component is for** comes from everything the team wrote, read as the design intent reads it
  (`intent-gen.mjs`, nothing written): the Figma description and annotations (a `Role:` annotation is shown as its
  role), each option's description, the code's notes and the comment above its CSS rule, the authored contract
  (`whenNotToUse`, `useInstead`, status, notes) and the guidelines section named after it. Its usage, as the style
  guide shows it (When to use, When not to use, Common mistakes, Limitations: a line of Figma's description or
  annotations, the code's note, else `guidance` in the authored contract), and its Do and Don't (the captions of the
  pictures in `<refs>/components/<name>/do` and `dont`, and the `examples` the authored contract names) are listed with
  it. A common mistake and a Don't rule a use out as a never sentence does, when two of their words are in it.
- **The team's rules** are every other guidelines section, each with its file (`guidelines.sources`, and the files the
  Notion and GitLab links are fetched into), and the authored layers of `design-intent.json` (system, foundations,
  patterns, templates, pages, flows). A link whose file is missing or older than `guidelines.maxAgeHours` (24) is
  fetched again first, as the audit does (`DESIGN_SYSTEM_ENGINE_NO_FETCH=1` skips it); with no token or no network the
  committed file is kept, and a link never fetched is listed with ⚠️.
- **For this request.** The request is the one made with the command in the last hour (the prompt hook keeps it in
  `.design-system-engine-out/prototypes/request.json`), or `--for "<text>"`. Against it: the guidelines' opening text
  and the sections its words touch, in full; the components its words point to (by name, description, options, notes
  or guidelines); and the closest page to start from, made already or designed in Figma.
- **Rules the check holds.** A plain sentence in the guidelines, "one button per screen", "at most two fields on a
  page", is a limit: a prototype with more is not drawn, and the error quotes the sentence and its section.
- **What the request asks for.** A component the request names (every word of its name is in it: "an empty state"
  → emptyState) that the prototype does not use is a warning the reply owes: add it, or say why. A kind of component
  the request names that the system has none of (a switch, a toast, a dialog, a progress bar, or a message confirming
  something saved, sent or done when the system has no toast, banner, alert or notification), shown neither as a
  Missing box nor with `standInFor` (nor by a part whose `purpose` names it), is a warning the reply owes too: the
  system has no such component, say so. The same line for several parts is said once, with how many. A component the
  documentation rules out for the request's words ("a message confirming…" and a tag that is never a message that comes
  and goes), used anyway, is an error, unless the node says what else it is for in `"purpose"` (a note, like
  `standInFor`, that the check reads and the drawing ignores).
- **Uses the documentation rules out.** A sentence with never, not for, do not or avoid in a component's guidelines,
  notes or `whenNotToUse` rules out the words after it, up to the end of its clause ("it never submits anything" rules
  out submitting, not the rest of the sentence). A request word it names lists that component as ruled out, not as one
  the request points to; a stand-in it names is an error (show the need as a Missing box), and a label it names is a
  warning.
- **Templates in Figma** are `figma-templates.snapshot.json` (`templates` in `ds-config.json`): the components each
  template composes, in order. **Screen widths** are the Figma breakpoints; a `Page.width` that is none of them is a
  warning.
- **Designed screens.** The screen capture (`paths.screenLayout`, or `figma-screen-layout.snapshot.json` beside the
  Figma snapshots) is read even before `--from-screens` brings it into `prototypes/`: its screens count as the product's
  pages and as places to start from. The product's screens the audit records with the components each uses
  (`paths.snapshotScreenComponents`, `figma-screen-components.snapshot.json`) are listed in the catalog, the most used
  first; a request that names a product or a screen gets that screen in view (what a new page for it is made of), and a
  product's name never points to a component whose note mentions it.
- **What each component is for** is what a designer reads: the engine's own placeholder description, Figma node ids,
  the class a component maps to, a build stamp, a banner, a CSS sentence (`::before`, `h=32`, `CSS:`) and a bare list of
  tokens are left out, and a note that only repeats the description is not repeated.

`rms-design-system-engine --prototype prototypes/<name>.json` checks a composition (the format `--check-ui` reads, nested
or flat) and, when it holds, draws it as one page under `.design-system-engine-out/prototypes/<name>.html`: each
component from its own markup (the contract's probe, a page instance, or its React source) with the project's CSS, in
every mode the system has, with a switch for the colour modes and one that outlines the engine's pieces.
The page is set in the design's font: one installed on the machine is used as it is, one the system's CSS ships with
`@font-face` comes from it, and any other is asked of Google Fonts after the page has loaded (never with
`prototypeFonts: false` in `ds-config.json`). The page never waits for it: it draws at once in the system's own font
stack, the design's family first, and a font found nowhere (not installed, not one of Google's, no network) is said on
the page's bar and as a 🔤 line, the page and its pictures set in the system's fallback.
The rules are `--check-ui`'s, plus:
- **The engine's pieces** (Page, Stack, Row, Columns, Text) exist only where the system has no component of that name.
  They carry no colour, border or font of their own: `gap` and `padding` take a spacing token, `Text.style` a text
  style, `Page.width` the screen's width in px; `grow` takes the room a parent leaves. The page takes the system's own
  page surface, text colour and font family. Each piece used is a layout gap, the pieces of one prototype said in one
  line ("Row, Stack and Page layout components"). The engine's on/off options take `"true"` and `"false"` written as
  words, as a component's do.
- **Filling the container.** Figma's fill container belongs to the instance, so any part takes `"stretch": true` (as
  wide, or as high in a row, as what holds it) or `"grow": true` (the room left). A component the system makes fill its
  container (Figma sizes it to fill across, or its CSS gives its own class `width: 100%` or `flex: 1`) fills the
  arrangement it is in, and an arrangement holding one fills its own, up to the page; one Figma sizes to fill down (a
  panel) takes the height left in a column. When the products' screens are read (`--figma-screens`), what they do
  decides: a component most of whose instances fill their parent's width there (a status bar fixed in its master,
  stretched across every window) fills it in a prototype, and one fixed on every screen stays its own size, whatever
  its Figma master says; a component no screen shows keeps its master's sizing. A Row that lines its parts up at the end, the centre or apart takes the
  width to do it.
- **Slots.** A Figma slot is a place for other components, shown in the catalog as `<its children>`: it takes any
  component unless Figma lists the few it takes. A component given children is drawn from the plainest copy with a part
  for each of its slots (a panel's head and main), each slot emptied of what the product put in it; a child goes in the
  slot it names with `"inSlot": "<slot>"`, else in the main one. Words given to a slot (`"Slot": "…"`) are what it
  holds when no child fills it.
- **A need nothing fits** is `{ "component": "Missing", "props": { "need": "…", "kind": "…", "closest": "…" } }`, drawn
  as a labelled box. A component used for a need it does not quite meet carries `"standInFor": "<the need>"`: the page
  marks it where it is drawn (a dashed box and "Stand-in for <the need>", on a layer of its own so the component is
  untouched), counts the stand-ins on its bar ("Stand-ins (2)", which turns the marks off and on), and leaves the
  marks out of its pictures. A stand-in for a component the system has (`"standInFor": "date picker"` where it has
  datePicker) is a ⚠️ line: the system's own is used.
- **An option Figma and the code do not share by name** is drawn on the part its name points to: a text option
  (`TitleContent`) writes the element whose class says title, or the one holding Figma's default text, or the
  component's own text for a label; an on/off option (`Show Description`) set off removes the part it names. A page
  instance's own state (a `hidden` class, a position on its page) is taken off. An option with no such part is drawn
  without it, with a warning once per component.
- **Copies from the products' pages.** A component that is one part of another's markup (a segment of a segmented
  control) is drawn as that part, inside its parent, which keeps its own pieces (the pill) and takes the children in
  place of its own. A copy of a component the system's CSS styles keeps the classes the system's own CSS knows and those
  its options point at; the product's own (its panel's width) stay in the product, and so does the name the page gave
  it (`aria-label`). Each copy keeps its ids to itself. An option is set as the style guide sets it: on its part (a
  switch's checkbox), on and off, with the state a part is heard in (`heardOn`). A field's value option sets its value;
  words for a part the copy lacks go nowhere, and Figma's default words never go through a guessed part. Figma's
  default that leaves a component inert or alarming (a field `Disabled=True`, a `State` of Error), drawn because the
  composition does not choose, is a ⚠️ line.
- **Gaps.** Missing boxes, stand-ins, the engine's pieces and components the code does not have go on the gaps list:
  `.design-system-engine-out/prototypes/gaps.json` keeps every prototype's (`byPrototype`) and the merged list, the most
  needed first. Each gap records what was tried (`tried`), so whoever decides works from the evidence: what was
  searched (the agent's `searched` on the Missing box or stand-in, and the system's own components by name and
  description), the components nearest to the need, what stands in for it meanwhile, and why none fit (the agent's
  `why`, the guidelines). The gaps list and the summary say it on each line; the prototype's own page keeps the short
  line. The Stop hook holds the reply to the gaps of the prototype just drawn. The page lists its own gaps
  (Gaps on its bar), each marked stand-in, missing or by its kind, with "Show on the page": it scrolls to the parts the
  gap comes from and flashes them (the layout gap turns on the engine's outline); a part that is not drawn now (in
  another state, or inside what a click opens) is said so.
- **It works as in the product.** The system's own scripts (`systemScripts`) run on the page, a click moves a
  selection (tabs, a segmented control, a list), a field takes typing, and a link stays on the page. A part that opens
  another carries `"opens": "<id>"` and the part it opens has that `"id"`: it is drawn closed and opens on a click, as
  the system's overlay when its CSS has one (container, layers, open and closing classes, as the style guide plays it),
  else as a popover under the part; Escape, a click outside or a button inside closes it and the focus goes back. An
  `opens` that names no part, the page or itself is an error. A part it opens drawn with the engine's layout pieces
  (a Stack of buttons, not a Missing box or a stand-in) goes on the gaps list as a dialog or menu the system lacks. A
  request that has a part open another (a button that opens a confirmation, a menu) owes an `opens`: a state alone is a
  ⚠️ line. Each state is held to the request and the documentation as the page is: a tag a "saved" state adds where
  the guidelines rule a tag out for a message is an error. With Chrome, each one is tried: it must open with the
  focus inside, close with Escape and give the focus back, each field must take typing, each toggle (a switch, a toggle
  button, a checkbox the system draws) must turn on and off when clicked, and each part that shows another
  (`aria-expanded` with `aria-controls`) must show and hide it; what does not is a ⚠️ line under 🖱. The page does what
  a product would where the system's own scripts do not: a click moves the selection in a group, flips a toggle (its
  `aria-pressed` or `aria-checked` and the class the system's CSS turns on for it), and shows or hides what a part
  controls; a component the system defines by id (a tooltip, `#tt`) is one element in the page, for its script. A
  toggle button (`aria-pressed`) is on or off on its own beside others like it, never one of a pick-one group; once a
  selection moves, the system's script is told the window changed, so what follows the selection (a sliding pill) moves
  with it. A modal it opens keeps the focus inside it while Tab moves, a radio group one stop. A part that shows no
  words or groups others carries `"name": "<what it is for>"`, what a screen reader says; a part with a tooltip carries
  `"tip": "<its words>"`, set where the tooltip is carried so the system's script shows it. The drawn page's own
  accessibility findings (a control or group with no name, a heading, a text's contrast) are ⚠️ lines with their fix;
  what the system's components do themselves is one line for the audit.
- **Every state.** A composition names its other states beside it, `"states": { "<name>": { "<id>": { …that part in
  this state… } } }` (in the composition, or beside `"prototype"` in the file), each naming by `id` only the parts that
  differ; `null` leaves a part out, and a part with no `component` keeps its own with the `props` given over its own.
  Each state is checked as a whole page (a state that names no part is an error), its gaps join the prototype's, and
  the page has a switch for it (`#state=<name>` opens one). A value written as a person would (`false` for an option of
  False and True, an option in another case) is read as the system writes it. The page owes an empty state when it
  shows a list (two or more of the same system component that is not a control, two or more arrangements alike, a
  row each with a name and a tag, a component named or made for a list, table, grid or feed, or a request that says
  list; fields, buttons and chips side by side are a form or a set of choices), an error state when it takes input (a
  field and a button), and each state the request
  names ("with a loading state") or the team's guidelines ask of the page or of a component it uses ("every list shows
  an empty state"). A state is found by its kind, whatever its name ("No results" is an empty state). One not given is
  a ⚠️ line the reply owes.
- **Every screen size and state, with longer words.** With Chrome, each state is drawn at every screen width (Figma's
  breakpoints, else Phone 375, Tablet 768 and Desktop 1280; a size mode of the same name is turned on, else the
  system's media query decides), with the words as written and 40% longer, as a translation makes them. What runs past
  the screen's edge (measured part by part, since a system often hides the page's overflow), a text cut by a box or an
  ellipsis, a text that runs out of its component, a control's label on two lines, and on a phone a target under 24px
  (WCAG 2.5.8; what a click lands on, a label or a `::after` laid over a bigger box included) are ⚠️ lines under 📱,
  each with the widths and states it happens at; the ones that happen with the words as written are owed in the reply.
  A system component that is under 24px at its own size is one line for the audit. A page that gives itself a width
  (`Page.width`) is tried at it too ("Its own"). A picture is saved for each width (`<name>@<width>.png`) and each state
  (`<name>.<state>.png`, at the page's own width when it has one). Row `wrap` and Columns `minWidth` (the narrowest a column may be, in px) let a layout fit a
  narrow screen.
- **Flows.** A part that leads to another page carries `"goesTo": "<prototype name>"` (`"<name>#<state>"` for one of
  its states); a click on the drawn page opens it, and a link to a page not drawn yet is a ⚠️ line the reply owes.
  `rms-design-system-engine --prototype --flow` reads every prototype in `prototypes/` and lists each link, where the
  flow starts and where it ends, and the team's flows: steps joined by arrows ("Sign-up: Account → Plan → Welcome") in
  the guidelines or the design intent's flows layer, or a numbered or bulleted list under a heading that says flow,
  journey or funnel. Each step is matched to the prototype whose name or main heading shares its words; a step with no
  prototype, and two steps in a row whose pages do not link, are ❌ lines, and so is a file in `prototypes/` that is not
  one page (several pages in one file, a draft left behind). A link whose words go back (Back, Previous)
  is a way back, not a step. The pages of a flow are held to each other as the product's pages are, every page of it
  voting and the flow's own order breaking a tie, and when one page after the first has a way back, every one must.
  A flow with a ❌ line exits 1 and is not done: each one is fixed in the page it names and the flow run again until
  it says ✅ the flow holds.
- **Design review.** With Chrome, the drawn page is reviewed as a designer would before anyone sees it, and scored out
  of 10 under 🎨: the parts of a column start on one line (a component's own margin that pushes one in is named), one
  arrangement keeps one spacing and the page a few, one part styled as the primary action is in view (the system's
  primary component, or a class or option that says primary), the main heading is the largest text and each heading
  smaller than the one above it and larger or heavier than its text, a line of text runs under about 90
  characters, and two parts of an arrangement never touch, unless both are system components with a surface of their
  own (a background or a border: a panel on a status bar), drawn to meet. Each ⚠️ line says what to change; the reply owes the ones it keeps. A heading already in the system's
  largest text style, the same as its body text, cannot be made larger: an ℹ️ line and a gap the reply names (no
  heading style), never taken off the score.
- **A retired component** (status deprecated) is an error that names its replacement.
- **What the documentation says.** After drawing, each system component the prototype uses is listed beside what it
  uses it for (its labels and stand-ins) and what the documentation says it is for, so a use it is not for stands out:
  that use gets `standInFor`, or a Missing box, and the prototype is drawn again.
- **The product's other pages.** A prototype is compared with the other prototypes in `prototypes/`: page padding, the
  space between sections, the screen width, the page heading's text style, where the actions sit and how they line up,
  the frame (the containers at the top of the layout, a component holding other parts or named as a bar, panel, header,
  window or nav, like an action bar and a side panel), the text styles of body text and section headings, what each
  kind of action is called and the component it is (save, cancel, go on, go back, delete, create: "Save" on every page,
  never "Submit" on one; a button for it everywhere, never a chip on one page), and the answer given to each need the
  system lacks (a chip as a stand-in on one page and a Missing box on another is a difference). A decision counts when
  two pages share it (the page being drawn votes too), or one screen a designer made in Figma (in the screen capture,
  or a starting point from `--from-screens`), and no other value weighs as much; where nothing is shared yet (one page, or pages that disagree
  evenly), the first page made sets it, for the pages made after it only, so a product with no patterns or templates
  still gets pages that match. `prototypes/conventions.json` (`{ "page": { "padding":
  … }, "heading": { "style": … }, "actions": { "at": "end", "justify": "end" }, "needs": { "<need>": "<answer>" } }`),
  written by the team, wins. Each difference is listed with the pages it differs from, and the Stop hook holds the
  reply to it like a gap. `rms-design-system-engine --prototype --consistency` compares every page with the others.
- **The drawn page against the designed screens.** With Chrome, the drawn page is opened and measured: every part's
  box, the page's padding, the space between its sections, each text's size. A prototype that redraws a designed screen
  (same name) is compared with it part by part: each component and text in its place (the first from the page's corner,
  each next one from the part before it, so a part drawn wider moves nothing after it into a finding) and at its size. A
  new page is compared with the designed screen it started from, or the one sharing the most components: the page's
  width, padding and spacing, and the size of each component the two share with the same options. A difference in the
  page's own arrangement (padding, spacing, a part's place) is a ⚠️ line the Stop hook holds the reply to; a component
  drawn at another size than Figma's is a • line for the audit, since it is the component's code. A picture of the page
  is saved beside it (`<name>.png`), and Claude looks at it before answering. With a Figma image of the screen
  (`.design-system-engine-refs/screens/<screen>.png`, at any scale, or FIGMA_TOKEN), the share of pixels that differ is
  printed, with a diff image. `--no-browser` draws without measuring.
- **Drawn as the designed screen shows.** A screen read from Figma (`--from-screens`, the screen capture records each
  layer's place, the screen's modes, what clips and what fills its parent, and the words each small instance shows) is
  drawn in its own modes (`Page.mode`), at its fixed size with what overflows cut (`Page.height`, `clip`), with each
  side's padding (`paddingTop` … `paddingLeft`), filling its parent as in Figma (`grow` along, `stretch` across). A
  layer placed over the layout (connector lines, a background) is left out and listed. A component Figma has and the
  code lacks keeps what the screen put inside it and its size. A frame bound to one of the system's colour tokens is
  drawn with the code's variable for it (`surface`; a text's `color`), and is still listed as a container the system
  could own. An option value turns on the class the system's CSS adds for it (Selected=True the class that says
  selected); one the CSS has no class for is drawn without it, with a warning. Each instance's own words are written
  into its text parts, and an instance that shows no words (an icon-only button) shows none.
- **Accessibility of the drawn page.** With Chrome, the page also goes through the accessibility check (contrast in
  every mode, names, one main heading, the keyboard; the engine's bar left out). What the composition itself causes (no
  main heading, a text colour that does not read on its surface) is a ⚠️ line the reply owes; what a system component
  does is a • line for the audit.
- A composition with an error is not drawn (exit 1). A file `{ "prototype": …, "gaps": [...] }` adds the gaps written
  beside it.

`rms-design-system-engine --prototype --from-screens <capture.json>` turns designed screens into starting points:
`prototypes/<screen>.json`, each drawn at once. The capture is `SCREEN_CAPTURE_JS` in `screen-layout.mjs`, a read-only
Plugin API script run with the Figma MCP (`use_figma`) or figma-cli on the screens' node ids; it records where each
layer sits on its screen and whether it fills its parent (an older capture is placed by auto layout). Each screen keeps its
arrangement (auto layout direction, gap and padding as spacing tokens, Fill as `grow`, alignment), the system's
components with their options and what their slots hold; a local component that holds others (a whole screen made a
component) is read as layout and listed as a template or component the system could own; a frame with its own fill,
border or corner, a typed number, a text with no style, a shape and a component the catalog lacks are gaps. It ends with
the spacing habits across the screens and the structures that repeat (template candidates). A starting point already
in `prototypes/` is kept unless `--force`.

#### --figma-edits (Figma brought in line with the code, once the person says yes)

`rms-design-system-engine --figma-edits` lists what the code already states that Figma does not, as edits the engine
writes itself (`figma-edits.mjs`). Today that is a component's role: each component's markup as the code shows it
(every instance the pages, scripts, JSX or structure contract give; the role most of them have, a number field among
text fields still a text field) gives a role in the engine's vocabulary (`button`, `togglebutton`, `disclosure`,
`textbox`, `checkbox`, `radio`, `switch`, `spinbutton`, `link`, `dialog`, `tab`). A Figma component that states no role
gets the annotation `Role: <role>`; one whose Figma role differs from the code is listed for a person to decide and
never changed. A wrapper around several controls (a stepper, a group) has no single role and is left out, as is a
component the code does not show. Each property or option named otherwise than most of the system's names
(`naming-consistency.mjs`, the same list the props check prints) is renamed in its component set: an option in each
variant's name (`state=default` → `state=Default`), then a property (`editComponentProperty`, "show-icon" → "Show
Icon"); one already renamed is skipped. Every need the prototypes found the system lacks (`prototypes/gaps.json`, merged) becomes
the design team's to do list: a page "Design system to do" with a frame "Gaps from prototypes", one card per need (what
kind, what the prototypes use meanwhile or the closest component, and which prototypes need it), the most needed first,
written afresh each time; nothing else in the file is touched. Each accessibility annotation no check reads
(`annotationUses` gives it no use) goes on the same page, in a frame "Annotations no check reads": its component and
layer, its words, and the wording a check reads when the engine can tell what it means (`annotationWording`: "This is a
button" → `Role: button`, "Esc" → `Escape closes it`, "H2" → `Heading level 2`, a quoted name → `aria-label: …`, a
layer named Error → `Role: errormessage`). A note is listed when its category is Accessibility, or when it has no
category and the engine reads an accessibility meaning in it; a note in a design-intent category (Intent,
Implementation, Content, Authoring), or one the engine reads nothing in, is for people and the agents, never a to do
(see *Annotation categories*). The annotations themselves are never changed. With gaps and no Figma snapshot, only the
gaps list is written.

Two accessibility edits come with them, each in an annotation category of its own and replaced on each run, so what is
fixed clears and nothing doubles:
- **The screens' findings, pinned where they are** (once the screens are read with `--figma-a11y`): each failing layer
  gets one annotation listing all its issues (what is wrong in plain words, then its WCAG number, then the fix), and
  each screen a summary with the counts, in the category "Accessibility Review" (red). A layer inside an instance cannot
  carry an annotation, so the capture records the outermost instance it sits in. What has no layer to pin it on (a
  screen with no fill behind its text, or a snapshot read before layer ids were kept) is said in the screen's summary.
- **Each component's accessibility spec, as the code gives it**: its role (or, when Figma says otherwise, that the
  role is a decision still open), what names it (`aria-labelledby`, `aria-label`, a label, its words, or only a
  tooltip), the states its markup says (`aria-pressed`, `aria-expanded`, `disabled`…), the keys its role owes (Tab
  reaches it; Enter and Space press a button; Escape closes a dialog and the focus goes back), and what a screen reader
  says for it (`heard`, from the last accessibility check), in the category "Accessibility" (blue), for whoever builds
  it. A component whose spec states its role gets no separate `Role:` edit. A wrapper of several controls with no
  state of its own has nothing to state and is left out. The engine's own notes are never listed among the
  annotations no check reads.

It writes `.design-system-engine-out/handback/figma-edits.json` (each edit, its Figma node, what it adds and why) and
`figma-apply.js`, a Figma plugin script that makes exactly those edits, leaves a component that already states a role
as it is, keeps every annotation a person wrote, and returns `{ changed, skipped, missing }` (and `todo`, the list it wrote). The agent shows the list, and only when the person says yes runs
the script unchanged with the Figma MCP's `use_figma`; the project hooks refuse any other script that writes to Figma,
and ask first when the person's last message does not approve. Then `--refresh-figma` reads the new annotations.
Descriptions, missing components and layout are never written: they stay in `changes-in-Figma.md`.

#### Adoption baseline / ratchet (opt-in, gate-level)

A real codebase is rarely 100% green on day one. Rather than a wall of red (ignored) or turning gates
off (drift hides), run `--baseline` once to record **today's failing gates as accepted debt** in a
committed `design-system-engine-baseline.json`. After that, a normal run **tolerates** those baselined gates (shown
as `⚠️ Debt`, verdict `NO REGRESSIONS ✅`) but **fails on any gate not in the baseline that goes red** —
a real regression. Debt only ratchets **down**: a baselined gate that goes green is surfaced as "ready
to ratchet" so you can re-run `--baseline` to lock it in (it can no longer regress silently); stale
entries (a renamed/removed gate) are flagged for pruning. It is gate-level on purpose — it uses only
the pass/fail the audit already has for all 25 gates, so it is fully deterministic and imposes no
structure. Off by default (no file = no baseline); ignore a file for one run with `--no-baseline`, or
per-project with `ds-config.json → baseline.enabled: false` (path via `baseline.path`).

**Per finding.** `--baseline --findings` records each failing gate's `❌` lines instead of the gate, so one
known difference can be accepted while everything else in the same gate keeps blocking. A failing gate whose
`❌` lines are all accepted is debt; any other `❌` line is a regression, including an accepted one whose value
changed (it is new text). The run lists the new lines, and the accepted lines that no longer appear as fixed,
to drop with the next `--baseline --findings`. A failing gate with no `❌` line to accept is recorded as a gate.
`--match <words>` (comma-separated) accepts only the lines that contain one of them, with their gate's count
line, and adds them to the file (nothing accepted before is dropped): `--component chip --baseline --findings
--match radi` accepts the chip's radius and keeps its prop names failing. The router adds it when the person
names the kind of difference (radius, height, width, padding, gap, colour, props).

#### Kept on purpose (`--keep`)

A difference the team decided to keep is not debt: debt is what will be fixed. `--keep --match <words>` (with
`--component <name>` when the person names one) records the open differences of the last full audit that match, in a
committed `design-system-engine-kept.json`: the difference as the audit said it, `--reason` in the person's own words
(required, never written for them), who decided (`--by`, else the git user) and when, `--truth figma|code` when one side
is right, and `--review` (a date, or `90d`, `6m`, `1y`) when to look at it again. On every run a kept difference never
fails its gate (a gate whose failing lines are all kept passes), its line is shown as `✋ kept on purpose` with the
reason, and it leaves the open differences: `differences.md` lists it under Kept on purpose, and the style guide's
Parity area shows it with the status Kept on purpose. What is kept is that difference with those values, matched by its
check and its words (a file's line number and the severity icon aside): when a value changes on either side, it is open
again and the decision is listed as no longer found, to drop with `--unkeep --match <words>` or to keep again. A kept
difference whose review date has come is To check in the style guide. Agents get each one as a rule: its component's
contract lists it under `kept` (what differs, the side that is right, why; never who), and the prototype context says
it beside the component, so an agent follows the side the team chose. `--keep` alone lists the decisions. Only the
person keeps a difference: the project's hooks ask before `--keep` or an edit of the file unless their latest message
says to keep it.

#### Values written by hand (`--census`)

`rms-design-system-engine --census` reads every style file the project has (`.css`, `.scss`, `.less`, the `<style>`
blocks of `.vue`, `.svelte` and pages) and lists each literal a token should carry, with its line and the token to use
when the theme has one with that value (`raw-census.mjs`): a colour (an error, a token or not), a spacing (padding,
margin, gap: an error, when the theme names spacing), a corner radius or a font size (an error when a token holds the
value, a warning when none does), a duration (a warning, with its token when one holds it), a z-index other than -1, 0
or 1 and a shadow written out (warnings). The theme files' custom properties are the tokens themselves and are not
counted; their other rules are. 0, a 1px hairline, a pill's 999px radius, `calc()` and a value inside `var()` are left
alone; the same value written twice on one line counts once. Files are listed with the ones that guess most first.

The first run writes the count as the baseline (`design-system-engine-census.json`, committed with the change); a run
with fewer errors lowers it; a run where a file has more errors than the baseline names the file and exits 1, so the
count only falls. Every full audit prints the totals and the file with the most (`🧮`, advisory); `"census": false` in
`ds-config.json` leaves that line out.

#### Every check tested with a planted mistake

`test/planted-faults.test.mjs` runs each of the 25 checks on a copy of the demo design system, set up so it has
something to read, once clean and once with one known mistake (a token with another value, a dark value removed, a
variable Figma does not have, a hover removed, a prop renamed, a border Figma does not draw, a transition slower than
the contract, a frame changed in Figma, a component drawn at another height in the browser…): it must pass the first
and fail the second, naming the mistake. A check with nothing to read says so: in the gate list it is **Not run**, with
its reason, never Pass (a check whose every part was skipped is counted as not run, in the summary and in the
scorecard's gate health).

#### Accessibility check (advisory, from the render)

A mechanical, agnostic accessibility pass (`a11y-check.mjs`) that reuses the Gate 22 CDP/headless-Chrome
flow. It reports **WCAG AA contrast** per theme (computed `color` vs the background really painted behind the text: the layers at its centre in paint order, a sibling laid under it or a `::before` or `::after` that covers its box included, not only its ancestors; in each declared colour mode and in each pair that can be on at once, such as dark with high contrast or a colour mode with another colour collection's modes),
**accessible name + role** (interactive nodes from the accessibility tree — a component that never exposes
aria), **visible focus** (a computed style change when focused **and** that change actually visible — the focus ring's colour has ≥ 3:1 contrast against its background, WCAG 1.4.11; a field whose frame shows its focus (`:focus-within` on the box around it, when it holds only that control) passes, its frame's ring measured the same way, as does a part beside it in that box (a radio's circle, a switch's track); a native checkbox or radio hidden under such a part is judged by it, a control that takes no focus (inside an inert thumbnail) is not judged, and a style that eases in or out is read where its transition ends), **state exposure** (an element whose state
is shown only by a CSS class — `.selected` / `.checked` / `.disabled` / `.invalid` / … — with no matching
`aria-*` or native state, so assistive tech never hears it; the state-class→aria map is common-English by
default, extend via `a11y.stateClasses`), and **keyboard reachability** (an interactive control that cannot
be reached by keyboard — an interactive role on a non-focusable element, or a native control with
`tabindex=-1`), **a control said only in a tooltip** (`tooltipname`: an icon whose only name is its `title`, which
no one on a touch screen or a keyboard sees; words beside the icon, or `aria-label` at least) and **icon contrast**
(`iconcontrast`, WCAG 1.4.11: an icon that carries meaning, the only content of a control or one with a name of its
own, at 3:1 against its background in every theme; its colour is its painted fill or stroke, a sprite's
`<use href>` read from its `<symbol>`, a masked icon's background). The static check adds the same title-only icon
button or link, and a sprite `<symbol>` painted in one fixed colour of its own (it keeps it in the dark theme).
Findings come from measured pixels and the a11y tree, no assumed DS shape (No-imposed-structure).

**Advisory by default**, and the report is written in **plain language, no jargon** — each issue says what is
wrong, why it matters to a real person, and what to do about it. Three audiences, one set of findings:
the default is the plain human summary; **`--a11y`** adds the exact elements (still plain); **`--json`** emits
the same findings as a machine-readable record (selector, contrast ratio, theme, role, and the fix) for an
agent or CI. When it runs against anything other than the styleguide it ends with a one-line tip on how to
get the deepest, per-state result. **Each finding says how sure the check is of it**: a **blocker** is measured
on the rendered page against a WCAG 2.2 A or AA criterion (a contrast, the name the accessibility tree gives, a key
pressed and nothing happening); a **warning** is read from the code, the contract or a Figma note, or is a pattern
that usually fails (a placeholder as the only label, an action on pointerdown), so it can be wrong; an **advisory**
is beyond AA (a focus ring under 2px, motion left on when the person asked for less, a control under the comfortable
44px touch size, text a colour-blind person cannot read) or for a person to judge (text on an image). The report lists
blockers first and ends with one line, `Verdict: 1 blocker · 2 warnings · 1 advisory · WCAG 2.2 AA` (`· not all of it
checked` when a page could not be read or opened, axe-core could not be loaded, or a part was left out); `--json`
carries `severity` on each issue and the same counts in `verdict`. `ds-config.json → a11yStrict: true` promotes
blockers and warnings to a hard fail; an advisory never stops a run. The run's summary, the one the chat relays,
carries the verdict and each kind of problem with its count and the components it is in, blockers first. It
runs inside the audit and standalone: `node a11y-check.mjs [--component A,B|.selector] [--url <page>] [--a11y|--json] [--no-axe] [--no-states]`
(`--component` scopes the sweep and accepts a raw CSS selector too). **Skips cleanly** (exit 0) with no
browser, never a false fail. Deps: Node >= 22 (built-in WebSocket), Chrome/Chromium (or `CHROME_PATH`), and
a render target.

**Render targets are agnostic — it does not assume a Figma plugin, and aims for zero questions.** It checks
whatever surface the project serves, in this order:
1. **Configured / built** — `--url <route>` (repeatable/comma; runs with **no `ds-config.json`** at all),
   or `ds-config.json → a11y.urls`.
2. **The generated styleguide** (the preferred default when it exists) — `ds-config.json → styleguide.out`
   (else `apps/styleguide/index.html`, else the engine template's `.design-system-engine-out/styleguide/index.html`),
   opened via `file://`. It renders **every component × every
   state on one static page**, so the sweep is deterministic, complete and needs **no dev server**, and —
   because each state is its own instance in the resting DOM — the existing checks get **per-state coverage
   for free** (a disabled/checked/error instance is measured directly). The checks that press keys, click or type act
   only on components drawn in a preview (`.pg-preview`), never on the page's own controls built from them. A guide with more than six components is
   checked in parts of six, the same page drawing only its own (`?all&only=a,b`), each finding named as the guide's:
   on one page with every component its whole-page checks (the Tab walk, text spacing, reflow, zoom) outlasted any
   time limit, and nothing it found was kept. `a11y.styleguide:false` opts out;
   `a11y.regenerateStyleguide:true` rebuilds it first (via `styleguide-gen.mjs`) so a11y never audits a
   stale one. Falls through to the built plugin UIs (`apps/*/ui.html`) when there is no styleguide.
   **Each product's own page** comes after the guide (a run on the whole guide, no `--component`): the built page
   of each product in `paths.plugins` (`ui.html` beside the `pluginCSS` source, else `<product>/ui.html`), opened
   whole, with every rule, axe-core's page rules (heading order, landmarks) included. Each finding carries its
   product (`product` in `a11y.json`) and the style guide lists them on the Status page under Products, one row per
   product. `a11y.products: false` leaves them out.
   **The components rendered from their own code** (`component-harness.mjs`) — in build mode, or when there is no
   page to open: each React component (`.jsx`/`.tsx`) in each of its Figma variants on one served page, its CSS
   linked and its JSX turned into calls to a small stand-in for React that keeps each component's state and updates
   the page in place (TypeScript from the project, else the global npm folder). The page acts as an app does: it
   gives a field or a spinbutton a name, and tells a controlled toggle its new state when it reports a click. So
   names, roles, parts and behaviours are tried on what ships, with no dev server. One it cannot load is listed as
   not rendered, never clean. `a11y.harness: false` turns it off.
   **A Vue system's components, rendered with the project's own build** (`vue-harness.mjs`), once its packages are
   installed: every `.vue` component (Figma's, and the ones only the code has) in each of its variants on one page,
   checked beside the other targets on every run, so a variant no page shows is still tried. The build is the one the
   project uses, read from its files: Nuxt (`nuxt.config`: its whole app in its dev server, client-side, its modules,
   auto-imports and auto-registered components, the CSS its config names, the page every route shows replaced by the
   components', its build files in the engine's output folder), Vite (`vite.config`: its plugins, aliases and the SCSS
   its components share; with `@vitejs/plugin-vue` when it has no config), Vue CLI (`vue.config.js` or
   `@vue/cli-service`: the webpack config Vue CLI resolves) or webpack (`webpack.config` with `vue-loader`); the page
   loads the token CSS and the stylesheets the project's `src/main` imports. Each variant is given
   back what it reports, as the page using it would: an `update:<prop>` event sets that prop, a toggle's click flips
   the state it was told; Figma's values are written as the code's own options write them. A project whose packages
   are not installed, or that has none of these builds, is told so, never rendered with tools of the engine's.
   **Every variant, every run.** The components rendered from their code are tried in Figma's variants when Figma has
   the component (the default, each other value of each variant prop, each on/off prop flipped), else in the code's
   own props' (each value of each option, booleans on and off, each text emptied or set, each icon emptied), up to
   `a11y.maxVariants` (16) each.
3. **Auto-discovery (the default when nothing is configured)** — it reads `package.json`, **starts the
   project's dev server** (`storybook` / `dev` / `serve` / `start` / `preview`, or `a11y.serve`), reads the
   URL it prints, and **enumerates the pages itself**: Storybook stories → else static router routes → else
   the base page. The routes are read from the usual router file and every file under `src/router` or
   `src/routes` (route modules included), as `/#/…` addresses when the router uses hash history. Scoped to a
   component, it opens only the pages whose view uses it, the component's own page first. A project whose
   packages are not installed is told so, and a generated style guide that draws no component is not used.
   A component whose class no element in the code has is said at once, with the classes that hold its name
   (`.modal-wrapper` for modal), never waited for on every page. The check's time grows with its pages and
   modes (`a11y.timeoutSec` sets it, and the audit waits for it past its other gates' limit). A check stopped by it
   keeps what the pages it finished found, and says the page it was on and the ones it never reached not checked
   (a style guide's part by its components), never clean.
   **A component shown only after an action** (a modal behind its "Show modal" button, a menu kept hidden until
   its trigger is pressed, a popover, a toast): when the scoped component is not seen on a page after two seconds,
   the controls that may open it are pressed in turn, up to 8: those whose words name it first, then those that say
   they open something (`aria-haspopup`, `aria-expanded`, `aria-controls`), then the rest. Never one inside it, one
   that submits a form, or one whose words delete, send, save or sign out (unless they name it); a link does not
   navigate, a press that leaves the page is undone by loading it again, and Escape closes what a press opened that
   was not it. Once it shows, it is checked open, Escape included, and the report says what opened it (`opened` in
   `--json`). One no press showed is said, never clean (`notRead`).
   Override the base with `a11y.baseUrl`, delay the sweep for SPA hydration with
   `a11y.waitFor`, or turn the whole thing off with `a11y.discover: false`.
4. **Ask (last resort)** — only when auto-discovery finds nothing does the skill ask the user for the one
   render URL. It **never fabricates a config or crawls the repo**; with no target it skips cleanly and says
   how to provide one.

So a Storybook or router-based DS runs fully automatically the first time — no config, no questions; a
bespoke app that exposes no page index is the only case that needs a `--url` / `a11y.urls` hint (set once).

**The whole check, every run.** Nothing else needs to be run beside it:
- **axe-core runs in every accessibility check** (no npm dependency: downloaded once, pinned, then cached) on the
  same page: its WCAG 2.0, 2.1 and 2.2 A and AA rules, the ones it keeps experimental that stand for a criterion (an
  orientation lock, a label not in the name, a paragraph styled as a heading, table headers, an element in the Tab
  order with no role) and its best practices (heading order, landmarks, a dialog's name, a page's one main heading).
  Each element it fails is located as the engine's own findings are (`tag#id.class` and its component), so an element
  both report is reported once, by the engine; what only axe-core found is a finding of its own, one per rule
  (`axe:<rule>` in `--json`, with `rule`, `wcag`, `url` and its `elements`), a blocker for a serious or critical WCAG
  rule, a warning for a moderate one, an advisory for a minor one or a best practice. The report ends with how many
  of the elements axe-core failed are its own and how many were already the engine's. The install and every
  `--update` fetch it into the cache (`node a11y-check.mjs --fetch-axe`, the same pinned hash), so the first check
  needs no network, and `--doctor` says whether it is there. It cannot be downloaded (offline, blocked) and no copy is
  cached: said as not checked, never clean (`a11y.axePath` points at a local copy).
- **Every control hovered, focused and pressed**, in every colour mode (the pseudo-class forced through the DevTools
  protocol, as a pointer or the keyboard sets it): its text measured again (`hovercontrast`, `statecontrast` with its
  `state`, 1.4.3) and the edge of a field, a checkbox, a radio or a switch (`stateedge`, 1.4.11). Only what reads fine
  at rest and fails in the state is reported; what pressed shares with hover or focus is said once, and a plain link
  pressed, which takes the browser's own red, is not the system's.
- `--no-axe`, `--no-states` (or `a11y.axe: false`, `a11y.interactionStates: false`) leave one out for a run: the report
  says what was left out (`leftOut` in `--json`) and the verdict that not all of it was checked.
- **What was measured** — the report says how many texts, icons and controls were read, in how many components and
  themes, and how many instances of each component the per-component checks tried; `--json` carries `measured`, and
  every element with its verdict (`elements`: text and icons with their ratio, controls with their focus) in the file
  the audit keeps (with `--a11y` on the screen too).
- **What a screen reader says** — for the first instance of each component (or the page itself), the lines VoiceOver
  and NVDA read from the same accessibility tree: `checkbox, Remember me, not checked · button, Bold, not pressed`.
  Words for a person to judge (whether a name says what it does), shown for a run about a few components or with
  `--a11y`, and in `--json` as `heard`.
- **What a screen reader says when something changes** — each press that shows something (a reveal button, a control
  that opens a dialog or a menu) is recorded as it happens: the words each live region takes, said politely or at once
  (`role="alert"`, `aria-live="assertive"`), and where the focus goes. Printed as one line per press, for a run about
  a few components or with `--a11y` (`Export opens dialog: the focus goes to dialog "Export"`, `pressing "Save" shows
  toast: says "Saved" politely`), and in `--json` as `heardOnChange` (`{ page, what, says, said, focus }`). A message that appears with no
  live region and no focus moving to it, or in a live region put in the page already holding its words, which most
  screen readers never say, is a finding (`unannounced`, 4.1.3) naming the press that showed it; the in-page status
  check then says the same element once.

**Deeper checks (every run, every page).** Each is isolated: a check that cannot run on a page is skipped
there, never a failure.
- **Every colour mode, switched properly** — media emulation, a class or a data attribute on the root, or
  high contrast, the same way the code capture switches them — and contrast, focus and the focus ring are
  checked in every mode (a finding in several modes is reported once, with its modes).
- **Real keyboard focus** — a Tab key press first, so `:focus-visible` styles show as a keyboard user sees
  them. A focus style drawn with a background change, an underline or on `::before`/`::after` counts; a ring
  drawn outside the element is measured against the parent's background.
- **Target size (2.5.8)** — a control under 24×24 whose 24px circle, on its centre, touches another control or
  another small control's circle, in every mode, at the page's own width and again on a 320px screen, where a control
  that shrinks is measured too (one finding per control, with the modes it is small in; one small only on the narrow
  screen says `320px wide`). Links in
  running text, and inputs whose label is the target, are exempt. A control between 24 and 44 pixels is an advisory
  (`target44`, 2.5.5): a finger covers about 44 on a touch screen.
- **Keyboard walk** — a real Tab walk, then the same with Shift+Tab: a focus trap (one control three presses running,
  or Tab going round two to six controls while the page has more; a round inside a modal dialog is its own and is
  left alone), any positive `tabindex` (visits out of order), and a focused control completely covered by other
  content such as a sticky header (2.4.11; on real pages, not on the styleguide, whose sticky header is its own chrome).
- **Focus order and lost focus, on a whole page** (a product's page, a page named with `--url`) — the first round of
  the Tab walk is followed on the page: a stop drawn above the one before it in the same column sends the reader back
  up the page (`pageorder`, 2.4.3; a bar fixed or sticky on screen is left alone), and a stop the focus lands on with
  nothing seen (off the screen, inside a closed panel, no size) loses them (`focushidden`, 2.4.7). A skip link that
  shows when it has the focus is seen.
- **Clickable, but not by keyboard (2.1.1)** — an element a script makes clickable that Tab never reaches: its handler
  read where a framework keeps it (an `onclick`, React's props, Vue's invokers), or, for one with a pointer cursor,
  Chrome's own list of its listeners (one added with `addEventListener`). A part inside a control, a label, a card
  around its own link or button, and a dialog's backdrop are left alone.
- **Keyboard activation** — a control built from a plain element (`role="button"`, `checkbox`, `switch`,
  `tab`, `link`…) that does nothing on Enter (and Space for buttons, checkboxes and switches). The click is
  caught before the element's own handler, so the check never navigates or submits.
- **Arrow keys** — a radio group, tab list, menu or list box whose items do not move with the arrow keys.
- **The keys of each pattern (ARIA Authoring Practices)** — where the component's own script runs (an app page, or a
  style guide that inlines `systemScripts`): a tab list, menu or list box that moves with the arrows but not with Home
  and End (`homeend`, 2.1.1); a combobox whose list does not open on Down or close on Escape with the focus kept in it
  (`comboboxkeys`, 2.1.1). On a style guide the same run also presses Escape on a menu button and Tab in a modal, as
  the audit does with real keys. Drawn as markup alone, nothing answers a key, so nothing is pressed.
- **What a screen reader says** — each control's name, role and state, as NVDA and VoiceOver say them ("Bold,
  button, pressed"), shown under 4.1.2 in the style guide. A name nobody sees (an `aria-label`, a title, alt text) that
  says little fails 2.4.6 (`weakname`): a placeholder word or a role ("icon", "button"), a file or an icon's name
  ("chevron-down"), the role said twice ("Close button, button"). A visible label is the design's own words and is left
  alone. Two links with the same words going to different places fail 2.4.4 (`samename`).
- **Dialogs and Escape** — an open dialog that does not close on Escape. Each control that opens a dialog, a
  menu or a list (`aria-haspopup`, or `aria-expanded` with `aria-controls`; up to 8 a page) is opened, Escape
  is pressed, and what it opened must close and give the focus back to that control. A link does not navigate
  and a form does not submit while it runs. A dialog already open as the page loads is judged when it lies over
  the page (in the top layer, or fixed); one drawn in the page's flow with nothing that opened it (a specimen on a
  style guide) is listed as not judged (`notJudged` in `--json`), never failed.
- **A modal keeps the focus** — each modal dialog that opens (one shown with `showModal()`, or one with
  `aria-modal="true"` lying over the page) is walked with Tab past its last control and Shift+Tab past its first: the focus must stay inside it
  (`modalescape`, 2.4.3). A non-modal dialog may let the focus go.
- **One main heading** — an app page (a `--url` page or a route found on its own, not the styleguide or a
  story) has one `h1`, which a screen reader jumps to. The code part flags a page file with text and no `h1`,
  or several.
- **Zoom to 200% (1.4.4)** — text that becomes cut off when the page is shown at twice its size.
- **Focus ring thickness (2.4.13, AAA, advisory)** — a focus ring thinner than 2 CSS pixels. The browser's
  own ring is not counted.
- **Figma accessibility annotations** — a note that states a role, a name, a heading level or alt text is
  checked against what the component renders (see *Writing accessibility notes in Figma* below). Other notes
  stay notes.
- **Part roles** — a note `Role: label` (or `errormessage`, `description`, `indicator`, `increment`,
  `decrement`, `placeholder`, `value`, `panel`; also `error`, `helper text`, `hint`, `icon`, `plus`, `minus`) on an
  inner layer says what that part owes its control: a label names it (a `<label for>`, the control inside it, or
  `aria-labelledby`), an error message is linked while it shows (`aria-describedby` or `aria-errormessage`, with
  `aria-invalid="true"`), a description is linked with `aria-describedby`, an indicator stays silent
  (`aria-hidden="true"`), a step button has a name with a word in it (a lone `-` is not one), a placeholder is not the
  only name, a value is exposed by its spinbutton or slider, a panel is named by `aria-controls`. The part is the
  contract's child of that name, else the element whose class ends with the layer's name. The build sheet lists
  each part's duty.
- **Behaviours** — what a person can do with a component comes with its role and runs in Chrome on the
  first instance a page shows: Space flips a toggle button's `aria-pressed`; a click and Space flip a switch or a
  checkbox; a click flips a disclosure's `aria-expanded` and shows or hides its panel; a click selects a tab and no
  other; typing writes into a text box. A Figma note adds one: `Escape closes`, `arrow keys move`, `Enter and Space
  activate`. A behaviour needs the component's own script, so it runs on a page that has it (`a11y.urls`, `--url`,
  Storybook, the app); on the engine's style guide, which draws markup only, it is listed as not checked. An
  exception is the person's: `contract.authored.json → components[name].behaviourExceptions` `{ "<behaviour id>":
  "<why, with a link to the ADR or pull request>" }` (ids: `keys-toggle`, `click-toggle`, `click-expand`,
  `click-select`, `types`, `escape-closes`, `arrows-move`, `keys-activate`). Without a link it is still checked, and
  that is reported. The build sheet lists each role's behaviours. On the style guide they run when the project lists
  its scripts in `systemScripts`.
- **States follow their props** — on the style guide, an option that shows a state (Selected, Pressed, Checked,
  Expanded, Error, Disabled) and changes only a class is reported: a screen reader still hears the component as it
  was. The attribute its role names goes with it (`aria-pressed` for a toggle button, `aria-selected` for a tab,
  `aria-checked` for a switch or checkbox, `aria-expanded`, `aria-invalid`, `disabled`). A computed ARIA attribute in
  JSX (`aria-pressed={pressed ? 'true' : 'false'}`) is drawn with the props' defaults, so the drawn component says what
  the real one does.

**Writing accessibility notes in Figma.** Use Figma's annotation tool on the component (the component set or
a standalone component), in the **Accessibility** category. One fact per line, or per sentence ending in `. ` or
`;`. The keywords are English; the value can be in any language.

**Annotation categories.** Figma lets each note carry one category, and the category says what the note is:

| Category | What the engine does with the note |
|---|---|
| Accessibility | A requirement: the accessibility check verifies it, and one no check reads is a task (rewrite it so a check reads it) |
| Intent, Implementation, Content, Authoring | Design intent: the agents read it; never a requirement, never a task, never acknowledged in Gate [13] (Structure) |
| No category, or one the file deleted | Read as before: the text decides (a note the engine reads no accessibility in is design intent) |

The REST API does not return a note's category, so it is captured apart with the Plugin API:
`rms-design-system-engine --annotation-categories` writes the read-only script for the Figma tool of the session
(`.design-system-engine-out/figma-capture/annotation-categories.js`); save what it returns, as it is, under the same
folder, then run `rms-design-system-engine --annotation-categories <file …>`, which keeps it in
`figma-annotation-categories.snapshot.json` beside the component-props snapshot. On a large file, run the script once
per page (`PAGE_IDS` at its top) and pass every result. A note finds its category by its node and its words, so a note
reworded in Figma has none until the next capture. Other category names map in `ds-config.json → annotations.categories`
(`{ "Notas de acessibilidade": "accessibility" }`); the defaults also read Development and Interaction as
Implementation, Documentation as Intent, Designers and Figma as Authoring.

| Note | Checked against the rendered component |
|---|---|
| `Role: button` | The role a screen reader announces (an ARIA role) |
| `Role: togglebutton` | A button that also exposes `aria-pressed`. Also `textinput` (a text box), `searchinput` (a search box), `iconbutton` (a button) |
| `aria-label: Close dialog` | The accessible name, ignoring case (also `Accessible name:`, `Screen reader label:`) |
| `Heading level 2` · `H2` | A heading, at that level |
| `Alt: Sales chart` | An image whose text alternative is that text |

Example of one note: `Role: button. aria-label: Close dialog`.

- **On an inner layer.** A note on a layer inside the component's default variant (the first one) is checked on
  the part the contract names the same way: `CONTRACT[component].children` with that `name` and a
  `cssSelector`. A layer with no such part is listed as not checked, with what to add.
- **No Gate [13] (Structure) entry needed.** A note the accessibility check can verify passes Gate [13] (Structure) on its own,
  and a note in a design-intent category is not counted there; only prose notes with no category (or in Accessibility)
  still need `CONTRACT.annotations`.
- **Where the notes come from.** The component-props snapshot, refreshed with `FIGMA_TOKEN` or the Plugin API
  capture below (both record `annotations` on the component and `layerAnnotations` on its inner layers).
- **A name that changes with content** ("3 items") is compared as written, so it is reported as a difference.
  Describe such names in prose instead.
- **Reduced motion (2.3.3)** — under `prefers-reduced-motion: reduce`, anything that still transitions or
  animates.
- **Forced colours** — under `forced-colors: active` (Windows high contrast), a focus indicator that
  disappears because it was only a shadow or a background, and an icon or a text the mode makes vanish
  (`forcedcontrast`: an icon drawn as a background colour, a CSS mask, takes the page's colour). A selected, checked,
  pressed or current item (`aria-selected`, `aria-checked`, `aria-pressed`, `aria-current`, or a state word in its
  class) that, in the mode, draws exactly what an item of the same kind beside it at rest draws (the colours the mode
  leaves, borders, outline, weight, decoration, opacity, and every part, a check mark or an icon) is a finding
  (`forcedstate`, 1.4.11). A native checkbox or radio is drawn by the system, which keeps its state.
- **Colour vision** — text that passes WCAG, read as people who do not see red, green or blue see it (the
  matrices Chrome's own vision simulator uses): one that falls below its ratio for one of them is an advisory
  (`cvdcontrast`, with the `vision` that loses it; red on black is the usual case). Two variants of one component
  that are drawn the same but for their colour (the same text, borders, weight and parts) and stand clearly apart in
  normal vision (a colour difference, ΔE, of 25 or more on their background, text or border) but all within 18 under
  one simulation are an advisory too (`cvdvariant`, 1.4.1, with the `vision`): a success badge and an error badge with nothing but red and
  green between them.
- **Text spacing (1.4.12)** — the spacing a reader may set (line height 1.5, letter spacing 0.12em, word
  spacing 0.16em); text that becomes cut off, or that spills out of a box that keeps its height onto what is
  next to it (the same at 200% zoom). A box that scrolls keeps its text reachable.
- **Semantics** — each component's rendered role (accessibility tree) against the contract's authored
  `semantics` (`contract.authored.json`).
- **What a role requires** — for each component with a role (the contract's `semantics`, or a Figma note,
  which wins), up to 20 rendered instances are checked for what that role needs:
  - a toggle button has `aria-pressed`, and clicking changes it (clicked back afterwards)
  - a checkbox, radio or switch has a real control (a native input, or the role with `aria-checked`) and a
    label; a switch exposes `role="switch"`
  - a text field has a label; in its error state it has `aria-invalid="true"` and `aria-describedby` to its
    message; `aria-describedby` points to an element that exists
  - a tab is `role="tab"` inside a `role="tablist"`, and the selected one has `aria-selected="true"`
  - anything that looks disabled is `disabled` or `aria-disabled`
  A state is read from the instance's classes or `data-state` (error or invalid, selected, active or
  current, disabled). Nothing is checked for a component without a declared role.
- **Reflow at 320px (1.4.10)** — each component on a 320px screen, in every run that checks components: one
  that cannot be narrower than the screen (its min-content, as nothing around it asks for more) is named with
  the width it needs. Content that needs two dimensions (a data table, a picture, code) is left out, as WCAG
  does. The whole page at 320px stays opt-in with `a11y.reflow: true`; the engine's style guide fits 320
  pixels (its Parity filter and a control with many options scroll sideways).
- **WCAG 2.2, the rest a component can be checked for** (`wcag-page.js`, run on up to 24 instances of each
  component, so a grid of chips is judged on its chips, the first one also used) — an image or `role="img"` with no words (1.1.1); a video with no captions
  track, sound that plays by itself (1.2.2, 1.4.2); radio buttons with no named group, a data table with no header
  cells, a tab, an option or a list item outside the container its role needs (1.3.1); controls Tab reaches in
  another order than they are shown (1.3.2, 2.4.3); a field that asks for a name, an email, a phone or an address
  with no matching `autocomplete` (1.3.5); the edge of a field, a checkbox, a radio or a switch under 3:1 against what
  is around it, a field's wrapper counted as its edge and a field with no edge drawn left alone (1.4.11); what
  shows on hover or focus that Escape does not close, that goes when the pointer moves onto it, or that goes by
  itself (1.4.13, a trigger with `data-tip` or `aria-describedby` given 1.6 seconds to show its tip); a tip that
  shows on hover but not when the same trigger is tapped with a touch screen emulated (`tapcontent`, 1.4.13), often
  because the tap opens and closes it at once; an
  animation that runs more than 5 seconds with no pause, a loader excepted, or flashes more than three times a
  second (2.2.2, 2.3.1); a link with no words or with "click here" (2.4.4); an empty heading, label or legend
  (2.4.6); a control whose `aria-label` leaves out the words it shows (2.5.3); a control that acts on the press
  rather than the release (2.5.2); taking the focus, or changing a value, that opens a page, sends a form, opens a
  dialog or moves the focus (3.2.1, 3.2.2); something moved only by dragging (`draggable`, a grab cursor) with no
  button or click beside it that does the same (2.5.7, a warning); a password or one-time-code field that cancels a
  paste, or turns autofill off (3.3.8); an id used twice, a role or an `aria-*` attribute ARIA does not have, a value
  it does not take, a reference to a missing id, `aria-hidden` over something Tab reaches, a link with nowhere to go
  (`href="#"`, `javascript:`) that acts as a button (4.1.2; WCAG 2.2 removed 4.1.1, and a duplicate id is counted
  here); a toast, a status line or a loader that no live region announces (4.1.3). Each finding carries its criterion in
  `--json` (`wcag`), and `ran` lists the page-wide checks that finished (`wcag21`, `tabtrap`, `spacing`, `reflow`,
  `zoom`, `states`, `targets`), so a criterion is said to be met only where its check ran. A tooltip drawn by CSS `:hover` alone is
  tried through the focus, as events from a page cannot hover.
- **WCAG 2.1 in the code, no browser needed** (`a11y-static.mjs`, every script, `.vue` and `.svelte` scripts
  included) — a single letter, number or sign as a shortcut on the whole page with no Ctrl, Alt or Cmd (2.1.4);
  something hidden, closed or removed by itself after 1 to 20 seconds, unless its timer stops while it has the
  pointer or the focus (2.2.1); a gesture with two fingers or more (2.5.1); an action on shaking or tilting the
  device (2.5.4). Printed with the rest of the code's accessibility in the audit. A rule that takes the focus
  outline off a class in every state (`.quiet { outline: none }`) counts as put back when a more specific rule shows
  focus on every element of a kind (`button:focus-visible` beats one class) and the markup, or the markup a script
  writes, puts the class only on elements of that kind; a class also put on a `<div>`, or a rule as specific as
  the one taking the outline off, is still reported.
- **State contrast, no browser needed** — from the code capture: each component's text against its own
  background in every mode and every state the capture produced (hover, selected, error…). Disabled states
  are exempt. A see-through background (a tint made with opacity or `color-mix()`) is blended over what
  the capture saw behind it and over each surface the system defines in that mode (its colour tokens with
  `/surface/` in the name, or `a11y.surfaces`), the worst one reported with its surface. Each finding names the two colour tokens, the rule's file and line, and
  links the component in Figma. Printed with the token contrast in the audit.
- **Token contrast** — see-through text is blended over its background; a see-through background (no
  known surface under it) is skipped; disabled pairs are exempt; pairs come from every mode's token names,
  corrected by what Figma draws (the structure snapshot's `drawnOn`): a text is paired with the background
  Figma draws it on, and a pair the names suggest is left out and listed when Figma paints that background in the same component but never under the text.
  A text token with the same colour as its background token, or a background the code paints as a tint
  (a `color-mix` or an opacity), is reported as not comparable: only the rendered state contrast measures it,
  over every surface the system defines in that mode, worst first.
  Border, outline and focus-ring tokens are paired at 3:1 with `a11y.nonTextPairs: true` (opt-in: a border is
  often decorative); dividers never are.
- **On the styleguide, only the design system's components are checked** (their selectors), not the page's
  own navigation and notes. The styleguide pins its own `data-color` mode; the check (and the code capture)
  sets it to each mode it measures, so dark is really measured in dark.
- **One element failing the same way in many places is one finding**, with the number of places and a few
  of its texts, and each element names the design-system component it sits in.
- **axe-core** must match a pinned SHA-384 hash before it is ever injected into a page (from the CDN, or
  from the npm registry's package when a CDN is blocked). With `a11yStrict`, its blockers and warnings
  count toward failing the check as the engine's own do.
- **axe-core** is cached in `~/.cache/rms-design-system-engine` after the first download (or `a11y.axePath`
  points at a local copy), and is scoped to the checked components.

A component's text contrast is measured in each mode the system declares and in each pair of them that can be on at
once (dark with high contrast); the style guide measures every combination of its colour switches, reading a sibling
laid under the text and a `::before` or `::after` that covers a box. The system's text and background pairs are also
checked in every combination of two switches (the `🎛` check, `modeCombinations` in config.md). The Figma side
is read by `--figma-a11y` (contrast and target size on Figma's own screens) and its findings are pinned there by
`--figma-edits`.

#### Evals (a separate entry point — measures agent OUTPUT, never gates the repo)

`eval-run.mjs` points the DS-conformance core at an agent's GENERATED output instead of the repo, so you
can measure whether agents actually follow the DS. Configure in `ds-config.json → evals`:
```jsonc
"evals": {
  "cases": [ { "id": "login", "prompt": "build a login screen with the DS", "component": "input" } ],
  "outDir": "evals", "ext": "html",   // candidates at evals/<id>.<ext>
  "strict": false,                     // true → exit 1 when any candidate has a violation
  "runs": 1,                           // with generate.cmd, run each case N times (3–5 signal, 10+ definitive)
  "generate": { "cmd": "your-agent-cli" },  // OPTIONAL: produce the candidate from the prompt
  "judge":    { "cmd": "your-judge-cli" }   // OPTIONAL: advisory LLM-judge
}
```
Run: `node eval-run.mjs`. For each case it reads the candidate `outDir/<id>.<ext>` and flags the same
mechanical failures the gates catch — raw color/dimension literals that should be tokens, `var(--x)` not
in the DS var universe (invented) — and reports per-case + aggregate metrics (produced?, zero-fix rate,
violations, **inline-style count**, and, when generating, **avg generation time**), appending to
`evals-history.json`. With `evals.runs > 1` (and a `generate.cmd`) each case is generated and checked
**N times** and reported as a reliability fraction (`k/N runs clean`), since agent output is
non-deterministic. **Advisory** (exit 0 unless `evals.strict`), and it **never gates the repo audit**.

**Generation and the judge are pluggable commands** (any agent/CLI, no provider lock-in):
- `evals.generate.cmd` — run with `--generate` (or when a candidate is missing): the prompt is piped on
  stdin, the DS context (`llms.txt`) path is in `$EVAL_CONTEXT`, `$EVAL_ID`/`$EVAL_COMPONENT` are set, and
  the command's **stdout** becomes the candidate (written to `evals/<id>.<ext>`). The prompt is the case's
  `prompt` alone: the expected `component` is for the scoring, so do not pass `$EVAL_COMPONENT` to the agent.
  The command may write what the generation spent to the file `$EVAL_USAGE` names (a number of tokens, or the
  agent's JSON usage, `{ input_tokens, output_tokens }`); the summary then adds `avg N tokens a generation`, and the
  history keeps it.
- A case's `component` is what it expects: a candidate that does not use it (its class, or a tag of its name)
  avoided the system and fails (`avoided-component`), and the summary counts `N avoided the system`. A prompt
  that names a component is flagged before the run, since its score would measure reading the prompt.
- `evals.judge.cmd` — advisory only: gets `{id,prompt,component,guidance,candidate}` as JSON on stdin (where
  `guidance` is the component's own description + whenNotToUse/useInstead from its contract, so the judge
  assesses "right component / correct usage" against the DS's rules, not blind) and must print
  a JSON verdict `{ok, notes}` (right component for the intent, empty/error states). It never gates.
- `evals.levels` (or `--levels bare,steering,parity`) — does the team's guidance help? The same cases run per
  level: `bare` (no context), `steering` (the project's own instruction files, AGENTS.md, CLAUDE.md, rules,
  joined into `evals/.context/steering.md`) and `parity` (`contracts/llms.txt`). The command gets the level in
  `$EVAL_LEVEL` and the file in `$EVAL_CONTEXT`. Each level is scored by the same checks, the accessibility read
  from the code included (a clean case has no violation and no accessibility finding), and compared with bare.
  A level with nothing to give says why and is not run. A command that does not read its stdin is fine.
Both **degrade safely** (a missing/failing command just leaves the committed candidates and skips the judge).
Spec: `plans/PARITY-evals-spec.md`.
