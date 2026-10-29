# Technical documentation

This page explains, in detail, how the engine works, how to run it, and what each check does. For a short list of everything it can do, start with [Features and capabilities](features.md). What to ask in Claude Code is on the [Commands](commands.md) page.

The complete lists live in the guide Claude reads. Every option is in `reference/usage.md`, every setting in `reference/config.md` and every gate in `reference/gates.md`, with the recipes in `cookbook/` and the short guide in `rms-design-system-engine.md`.

**On this page**

- [How it works](#how-it-works)
- [Install and update](#install-and-update)
- [Run it](#run-it)
- [What it checks](#what-it-checks)
- [More checks beside the gates](#more-checks-beside-the-gates)
- [Accessibility](#accessibility)
- [The style guide](#the-style-guide)
- [Prototype with your design system](#prototype-with-your-design-system)
- [Start from Figma only](#start-from-figma-only)
- [Keep products aligned](#keep-products-aligned)
- [Bring Figma in line with the code](#bring-figma-in-line-with-the-code)
- [Working with AI tools](#working-with-ai-tools)
- [Inside Claude Code](#inside-claude-code)
- [The files it creates](#the-files-it-creates)
- [Good to know](#good-to-know)
- [Environment variables](#environment-variables)

## How it works

- **It reads Figma precisely.** What your design system really defines, the tokens and each component's parts, states and options. It is not a "does this look like Figma?" screenshot comparison.
- **It reads your code the same way.** Once per run it opens your pages in a browser and records what the code really produces, every token in every mode, each component's sizes, states, props, icons and markup, and which components sit inside which.
- **Every fact has a source.** Each one says where it came from and how sure the reading is. When something cannot be read reliably, the engine says so instead of blaming the design.
- **It writes the facts out for AI tools.** A catalog of your real components, their options and which go inside which, so AI tools build with the real system instead of guessing. `--check-ui` checks what they generate against it, every time, without changing it.
- **It pairs each Figma component with its code file.** One shared pairing (`component-pairing.mjs`) answers for every check, the style guide and the router, so they all agree. Details below.

The whole flow, step by step, is on the [FigJam board](https://www.figma.com/board/W5UEjkrLv5t4fqsGPQWqk8/rms-design-system-engine-flow?node-id=0-1).

### Which code file is each Figma component

Each sign the code gives counts. A strong sign pairs on its own. A weak one needs a second sign that agrees.

| Sign | Strength | Example |
| --- | --- | --- |
| File name | Strong | `Button.vue`, `button-primary.tsx` |
| Name it declares | Strong | `name: 'buttonPrimary'`, `function ButtonPrimary` |
| Class on its first element | Strong | `.button-primary` |
| Folder and file name | Strong | `buttons/Secondary.vue` is buttonSecondary, `card-box/index.vue` is cardBox |
| Only file with its selector | Strong | the one file that holds `.chip` |
| Generic file name | Weak | `switches/General.vue` is switch (also Default, Base, Main, the only file in a folder, and `cards/Primary.vue` when Figma has no cardPrimary) |
| Library prefix | Weak | `HbBadge.vue` or `.hb-badge` is badge |
| Tokens | Weak | a file using `var(--advanced-tooltip-bg)` is tooltip's, read through the tokens snapshot and your naming convention |
| State word | Weak | tooltipOpen and tooltipClosed are both `Tooltip.vue` |
| Props | Backs another sign | its props hold two thirds of Figma's properties |

- **Paired.** A strong sign, or two that agree.
- **Proposed.** One weak sign alone. Never applied: the audit prints it (`🔗`), the props and sub-component checks name it in their "no code file" line, and the style guide lists it under Tasks, Parity, to confirm or pin.
- **Only in Figma.** No sign at all. The files nearest its name are named, among those no other component has.
- **Never taken twice on a weak sign.** A file a name gives to one component is not offered to another on its tokens alone, unless the two differ only by a state word.
- **One file, two styles.** When Figma has bannerTopPrimary and bannerTopSecondary and the code has `banners/Top.vue` with a prop that chooses the style (`useSecondaryStyle`), both are paired with it.
- **`componentFiles` always wins.** It pins a pair by hand in `ds-config.json`.
- **Its class.** With no `componentSelectors` or contract selector, a component's class is the one its paired file writes for its name, else the class of that file's first element. A file named after the component keeps the convention's class (`.chip` for `Chip.jsx`).

## Install and update

### What the engine needs on your machine

Two things are required. The installer refuses to go on without them.

| Required | Why |
|---|---|
| **Git** | The install is a clone, so updates are a pull and never a re-download. |
| **Node.js 22 or newer** | The engine talks to Chrome over Node's built-in WebSocket, which older versions do not have. |

Two more are optional, and each decides how much a run can see. The installer checks for them and prints the one line that installs whatever is missing.

| Optional | What you lose without it | How to get it |
|---|---|---|
| **Google Chrome** | Nothing is measured as a browser draws it: rendered parity, the accessibility check and every picture are skipped. | [Install Chrome](https://google.com/chrome), or point `CHROME_PATH` at the one you already keep. |
| **TypeScript 5** | Your components' JSX and props are read from their text alone, so fewer components are understood. | A project with its own `typescript` 5 is already fine. Otherwise `npm i -g typescript@5`. |

> **Ask for TypeScript 5 by name.** A plain `npm i -g typescript` installs version 7, the rewrite, which reads no JSX. The engine treats it as no TypeScript at all rather than failing midway through a run, and says so.

### Staying up to date

The skill updates itself. Once a day, before an audit, it pulls the latest version and says so in one line.

- It only does this when the install is on `main` with no local changes, and never on CI.
- `DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1` turns it off.
- `rms-design-system-engine --update` updates it by hand, and `--version` tells you if you are behind.
- Every Monday a new version is published on GitHub when something changed: a release with the list of what was merged since the last one. Watch the repository (**Watch → Custom → Releases**) to hear about each one.
- `rms-design-system-engine --doctor` checks the install, axe-core included. The install fetches axe-core, so the first accessibility check needs no network.

Keep a single copy. Link anything that needs the skill's files to `~/.claude/skills/rms-design-system-engine`, the folder that updates itself, instead of keeping a clone of your own.

## Run it

### Set up a project

The first time in a project, set it up once. It asks a couple of quick questions.

```bash
cd my-project
rms-design-system-engine --init
```

### A Figma branch

- A branch link (`figma.com/design/<file>/branch/<branch>/...`) names the branch. Every read then follows the branch, which stays as it is while the main file changes.
- On a project already set up, `rms-design-system-engine --init --figma-url=<link>` changes only `figmaFileKey`. Refresh the Figma data next, so the snapshots come from the new file.
- Branches need a Figma Organization or Enterprise plan. A duplicate of the file works the same way on any plan.

### Code on GitLab

The code can be read straight from GitLab instead of a folder, on gitlab.com or a company-hosted GitLab.

```bash
rms-design-system-engine --init --project=https://<your GitLab>/<group>/<project>
```

Add `/-/tree/<branch>` for a branch other than the default one.

- **Always the latest commit.** It keeps a mirror of the branch's latest commit beside where it runs, through the GitLab API, with no git, no clone and no SSH key. Every run asks GitLab for the latest commit first and fetches again only when the branch has moved.
- **You see what was checked.** The summary names the commit, `Code checked: GitLab <project> @ <branch> <commit>`.
- **Private projects.** Put `GITLAB_TOKEN` (a personal access token with the `read_api` scope) in a `.env` in the folder you run it from. For a company host, add `GITLAB_HOST=<host>` beside it. A run started inside the mirror finds them there too, in the folder that holds the mirror. The token is only sent to gitlab.com or that host, and never printed.
- **A shared store can live on GitHub too.** Point a store at a GitHub repository (`{ "github": "https://github.com/<owner>/<repo>", "path": "snapshots" }`) and the engine reads it with git, the same way you clone it yourself — no second API, no token of the engine's own. Writing back works the same way: there is no second API and no token of the engine's own, so what you may push is what GitHub already lets you push — your key, the branch's protection, your role.
- **Each commit says whose run made it.** A shared store is usually written with the team's own token, so without this every change looks like that token. The commit now carries the person who ran it as its author (the name their git uses, or `--by "<name>"`), while the token's owner stays the committer — so GitLab's roles and audit trail are untouched and you can still tell three people's runs apart.
- **No token? Your own git access is enough to read.** If you already clone your team's projects — over SSH, or with a credential helper — the engine reads the shared files that way and you need no token at all. It only does this where there is no token, so nothing changes if you have one, and it never stops to ask you for a password: if git cannot get in by itself, the run says what is missing and carries on. **Writing works the same way.** The engine builds the commit inside that mirror and pushes it, without checking anything out, so your folders are untouched. What you may push is still your host's to decide. On GitLab, a protected branch gets a merge request instead, as it does with a token: the engine pushes to a branch of its own and asks GitLab, through its push options, to open the merge request for a Maintainer to merge. On GitHub, a protected branch refuses exactly as it would from your terminal, and the run tells you what it said.
- **History without git.** The mirror has no git history, so the history the engine shows (each component's changelog, the reason a line changed, the commit an agreement records) comes through the same API. It is kept per commit in `.gitlab-history.json`, so a later run asks only for the files that moved. A team that keeps its snapshots in a store has each read of Figma there: every refresh it sent is one commit of the store, and each component's History lists the ones that changed it, linked to that commit (kept in `.design-system-engine-out/snapshots-history.json`, each commit read once).
- **When GitLab is down.** The run checks the mirror already there and says which commit it is.

Files the engine writes in the mirror (`ds-config.json`, snapshots, its output) are kept from one refresh to the next. Commands that only print (`--version`, `--route`, `--recipe`) never call GitLab.

**Your setup apart from the code.** Set `DESIGN_SYSTEM_ENGINE_WORKSPACE` to a folder and the engine's own files (the setup, the snapshots, the contracts, the history, the hand-back, the output) live there, per host and project, instead of inside the mirror. Each run puts them into the mirror before it reads anything and takes back what it wrote when it ends, so the mirror is only a copy of the code that you can keep in a cache (`DESIGN_SYSTEM_ENGINE_MIRRORS`) or delete. The first run with the setting moves in what your mirror already holds. If a run stops before the end, nothing is lost: the next run keeps the newer copy.

### Ask in Claude Code

The easy way is to ask in plain language. Every request is on the [Commands](commands.md) page.

How a component's name is read.

- Spaces, capitals, dashes and word order do not matter, so *primary button* finds buttonPrimary.
- A word only one component has scopes the run to that one.
- A plural (*the buttons*) scopes it to every component with that word.
- A word several components share (*the button*, with buttonPrimary and iconButton) is asked about first, and nothing runs until you answer. Words for an aspect of the check (text, icon, state) never name a component.

When you ask.

- **One component, its own findings.** When you check one component, accessibility findings are listed only when they are about that component, in its own file or on an element that carries its class. A page that only uses it keeps its findings to itself.
- **The browser part needs your packages.** When the project's packages are not installed, the run tells you. Install them and run again.

### From the terminal

The same requests as terminal commands, for scripts and CI.

```bash
rms-design-system-engine                       # the whole design system
rms-design-system-engine --component input     # one component (or a few: input,button)
rms-design-system-engine --check-ui ui.json     # check a UI an AI tool generated against your components
rms-design-system-engine --query badge          # one component or token, names written exactly; a token says what it is for (its Figma description), a text colour also lists the surfaces it can be read on; a name it does not know finds the closest by spelling, by its words and by what each is for ("main action"), and says what to ask next
rms-design-system-engine --component chip --baseline --findings --match radi   # accept one known difference (the chip's radius) as debt; everything else keeps failing
rms-design-system-engine --keep --component chip --match height --reason "the product needs a larger tap target"   # keep a difference on purpose, with its reason
rms-design-system-engine --only accessibility   # only the accessibility check
rms-design-system-engine --only parity          # every check against Figma, without accessibility
rms-design-system-engine --only 3               # one gate by number, or by name: --only "token values", --only states,props
rms-design-system-engine --a11y-no-worse        # after the audit on a merge request: fails on an accessibility blocker the base branch did not have
```

- `--only` runs that part and nothing else, and the summary says so, so a part never reads as the whole system passing. A word it does not know prints the list of gates.
- `--baseline` needs the whole run.
- Every option is in `reference/usage.md` (`rms-design-system-engine --reference usage`).

### For an agent with no terminal

A prototyping tool or a chat assistant that cannot run commands gets the same answers through MCP. Add the engine as an MCP server, pointed at your project:

```bash
claude mcp add design-system -- node ~/.claude/skills/rms-design-system-engine/mcp.mjs --project=/path/to/your/project
```

It offers four tools: `query` (a component or token, as `--query`), `catalog` (everything a screen may use), `check_ui` (as `--check-ui`) and `summary` (the last audit's). Each runs the same command, so the answers are the same as in a terminal. A folder that remembers its project (`.design-system-engine-project`) answers for that project.

Both routes are measured on the same tasks:

- `node test/skill-evals/run.mjs --set route --route shell` gives the agent a shell; `mcp` gives it the MCP server and no shell; `both` gives it the two; `none` gives it neither.
- `node test/skill-evals/route-report.mjs` prints, per route, the runs that pass, the time, tokens and tool calls a run, and how each run reached the engine.

## What it checks

Every run compares your code with Figma and reports in plain words. The 25 gates are listed in [Features and capabilities](features.md#the-checks). Here is what a developer needs to know about each.

The engine reads what your design system defines in Figma, its tokens and each component's parts, states and options. Then it checks your code against it, value by value and in a real browser. It is not a screenshot comparison.

### What it compares

- **Tokens.** Colours, sizes, fonts, shadows and durations, in every mode (Light and Dark, Desktop and Phone).
- **Components.** Props, defaults and options, every state (hover, focus, pressed, disabled, selected), heights, spacing, corners and markup.
- **Slots.** A Figma slot is paired with the code's slot of the same word (Figma's slotBody is the code's sheet-body), and an on/off that shows it with the slot being filled. When each side has one slot named otherwise, they are paired and the name difference is said.
- **Icons.** From the shared set, drawn the same way as in Figma, whether the code keeps them in one sprite or as one SVG file each (Figma's icons matched to the files by Code Connect's links).
- **Motion and effects.** How each component moves, and what it draws beyond its colours (both below).
- **Product screens.** Where each product puts each component (below).

Every difference comes with its fix in plain words and who acts, you in Figma or Claude in the code.

### Data and tokens

- **Data is up to date.** You are checking against today's Figma, not an old copy.
- **Figma frame unchanged.** The design still looks like the version you approved.
- **Token values match.** Colours, sizes and fonts, in every mode. A colour in a collection that also holds sizes is compared as a colour, so `#0037fa`, `#0037FA` and `#0037faff` are the same.
- **Text styles match.** Every field of every text style is compared with the code: size, weight, line height, letter spacing and case.
  - A field bound to a token in Figma is paired with the code's token of the same name, by the naming convention. Every style that binds it is compared, with no map entry.
  - A `TYPO` entry in `design-system-engine-map.mjs` still wins. It may name one style (`'s/regular'`), a scale whose every style it feeds (`'s'`), or a list.
  - A field whose token changes with a breakpoint is compared in every breakpoint, against the CSS each one resolves to.
  - The family is compared once for all the styles that use it: with the token they bind, else with the font your page text uses. A difference is one finding.
  - A field nothing names is listed as not compared, never passed.
- **Tokens used in screens exist.** Nothing a screen uses is missing from the code.
- **Every mode is covered.** Things that should change between modes really do. Gate [5] (Every mode is covered) finds where the theme sets each mode, in an `@media`, a `[data-…]` or a class block. A mode the code never implements fails with every value it owes.
- **Exception lists are valid.** Your "ignore this" notes still point at real things.
- **No invented tokens.** Every token in the code traces back to a real Figma token.
- **Docs tell the truth.** They mention only things that actually exist.
- **No invented text casing.** No forced UPPERCASE the design never asked for.

A collection whose values change with a mode (a sizing collection per breakpoint) is captured and checked in every mode, even when `ds-config.json` names no collections. Each breakpoint is measured in every colour mode too, and each state's rule is traced in every mode, so a dark hover that differs names the dark rule.

### Components

- **No hand-built DS components.** A screen uses the real component, not a hand-styled copy.
  - A product's own version of a system component is listed too, as advice. It is found by what it draws (a class that loops the same animation as a component's part, `.spinner` beside the loader's `.loader-spinner`) or by its name (a class of its own that starts with a component's name and says nothing more, `loading-state`).
  - A class beside a system class on the same element dresses the component and is left alone.
  - A component a screen draws only as another component's part (a status bar's divider) belongs to that component.
  - `"Product/component"` in `knownReimplementations` keeps one on purpose.
- **Clean CSS.** Nothing unused, nothing that contradicts Figma. A focus ring's outline, which Figma has no value for, is listed apart, not failed.
- **Nested components keep their own styles.** One component's look does not leak into another.
- **Structure.** The right height, spacing and corners, from the design.
  - A stroke Figma draws inside the box may be an inset ring in the code (`box-shadow: inset 0 0 0 1.5px …`), which adds no size and counts as that stroke.
  - A border, outline or background the code draws on a component Figma draws with none, in any variant, fails (focus rules aside). This holds for the system's rules and a product's alike, on the component itself, its `::before` or its `::after`.
  - A paint made only of the tokens of a component Figma nests inside (a divider drawn as a `::after` line) belongs to that part. `knownPhantomFillExceptions` names a selector allowed one.
- **All states are built.** Hover, disabled, selected and the rest, each with the right values.
- **Component props match Figma.** The same names, defaults and choices, spelled exactly the same.
  - `Size` and `size` are two prop names, and the finding shows the letters that differ (`letter case S → s`).
  - `L` and `large` are two values, and the finding says which code value it most likely is.
  - The catalog tells AI tools the right name for each wrong one they are likely to guess (`error` → `danger`).
- **Sub-components match Figma.** The parts Figma nests are the ones the code uses.
- **Templates compose the right components.** Each page uses the components Figma composes.
- **Markup.** Ids, classes and icons match, and every control the design shows is built.
- **Required pieces are in place.** Icon slots, component slots and form controls.
- **Icons.** From the shared set, drawn the same as Figma.

### Components of one type, built the same way

The components of one type in Figma (every button, every input) are compared with each other, not only with the code.

- **States set the same way.** Disabled is a property of its own on most buttons and an option of State on a few: those few are named, with the way most of them do it.
- **One thing, one name.** `labelContent` on most buttons and `Label` on one: that one is named.
- **What most of them have.** Most inputs have a label and a required mark: one without them is listed to check.

Each is a decision for your team in Figma, and keeping it as it is, as a known exception, is always an option.

### What a screen runs into in a component's own code

Some faults show only when a screen uses the component, before any difference with Figma. The engine reads each component's own file (Vue for now) and names them, each with its line:

- **No style.** An element whose class no rule styles, drawn with the browser's defaults, or a modifier class that changes nothing (a read-only class with no rule).
- **Fires twice.** One click on a child sends the same event twice, because the click also reaches a parent that sends it.
- **Same content in every row.** A slot inside a repeated row that passes nothing to it.
- **Read once.** A prop read only when the component appears, so a screen cannot open, close or change it afterwards.
- **Line breaks lost.** A description or a message shown on one line, its new lines gone.
- **Takes HTML in one, text in another.** The same prop in one family, bold and line breaks working in one component and not in its sibling.
- **Hides more than in Figma.** An on/off that hides only its own part in Figma (a drop area) also hides the label or the helper in the code.
- **Shrinks what Figma stretches.** A slot Figma stretches what is put in it to its width, where the code's column draws it at its own width.

Dates are read too: a helper that writes a date in a format your intent layer's writing rules do not give, a month written with a capital the rules write in lowercase, or two helpers that write the same month two ways. Said for the whole system, with the helper and its line.

Each is on the component's page and on the Tasks page, with the fix. They are advice, never a failed check: whether to change the component is your team's call.

### Motion and effects

- **Transitions.** The durations and easings from the design. Once Figma's prototype is read (`--figma-motion`), each change it animates between a component's variants is compared with the code's transition into that state, as advice (`🎞`).
  - A change the code makes at once, another duration (more than 10ms apart) or another curve is listed.
  - A spring has no CSS curve, so only its duration is compared.
  - Each component's own loop, opening and closing are compared with the code's `@keyframes` and the transitions its open and closed states play.
- **Motion.** Movement values match Figma, when your design defines them.
- **Shadows and blurs.** They match Figma, when your design defines them. Once each component's effects are read (`--figma-effects`), each is compared with its own rule in the code, as advice (`🌫`).
  - Each shadow's offset, blur, spread and colour.
  - A layer or background blur. Figma's radius is twice the CSS `blur()`.
  - A gradient's kind and colours, an image fill, Clip content against `overflow`, a blend mode and opacity.
  - Each layer against the code's part of the same name (`.badge-background`).

### How components move

Figma says how things move in three places, and the engine reads all of them.

- **Between states.** A variant that leads to another on hover or press, with its duration and curve (Smart animate, 300ms, ease out). Gate 21 also holds the code to the transitions your team wrote down.
- **On their own.** A spinner turning, a panel, modal or toast opening and closing. Figma says it on its Motion timeline, in the overlays its prototype opens and in variants that lead to each other after a delay.
- **In the code.** `@keyframes` animations, and the transitions a state plays when it opens or closes (a drawer's `.is-open`).

When Claude [refreshes the Figma data](commands.md#set-up) with the Figma tool of your session, it also reads Figma's side, on every page, without changing anything. Each movement is then compared.

- One Figma animates and the code does not, or with another duration or curve, is Claude's to fix in the code.
- One only the code animates is yours to add in Figma, or to ask the code team to stop.

Each one is a row in the component's Motion tab and on the Status page, under Motion. The style guide's motion page also puts the system's timings in one table, fastest first, with what each is for, the components that use it and what the system could tidy up.

### What each component draws beyond its colours

A card's shadow, a scrim's blur, a banner's gradient, a frame that clips what overflows it, a layer that blends or is see-through.

When Claude [refreshes the Figma data](commands.md#set-up) with the Figma tool of your session, it also reads these for each component and its layers, two levels deep, without changing anything. Then each is compared with the component's own rule in the code (`box-shadow`, `filter`, `backdrop-filter`, `overflow`, `mix-blend-mode` and `opacity`).

- One Figma draws and the code does not, or draws differently, is Claude's.
- One only the code draws, or a clip Figma sets that the code leaves open, is a decision for both.

Each is an Effect row in the component's Parity area and on the Status page.

### In the browser

- **Renders correctly in a browser.** Checked on the real result, not just the code on paper. A component the page holds but does not draw on load (in a closed panel) is measured from its sample markup, the rule's `probe`.
- **What this audit covered.** So you can see nothing slipped through.

### Every difference in one list

A full audit writes `.design-system-engine-out/differences.md` and `differences.json`.

- Each difference between Figma and the code, grouped by the component it names.
- Under each component, where it lives (the products that use it and what it sits inside), so you see how far a fix reaches.
- Marked new when the last run did not have it. One whose line number only moved is not new.
- Each check that did not run is named at the top, so a difference it would have found is never mistaken for a pass.
- Lines that only point at a difference (a Figma link, who last changed it, what was skipped) stay in the audit and out of the list.

Under its verdict, the summary of a full audit counts the components that pass, drift (an open difference) and were not checked, with the names when there are few. Beside them, `findings.json` holds every finding of every check as one record, with its rule in plain words, its evidence and its verdict.

It is written whether or not you have a style guide, and the summary of every check says where it is.

### Differences you keep on purpose

Some differences are decisions, not mistakes. When your team decides to keep one, [tell Claude](commands.md#tokens-and-changes) and give the reason.

- It is recorded in `design-system-engine-kept.json` with the reason, who decided and when. Commit it.
- Add `--truth figma` or `--truth code` to say which side is right, and `--review 90d` (or a date) to look at it again later.
- A kept difference never fails a check. It is listed under Kept on purpose, in the differences list and on the component's Parity area, with its reason.
- It is that exact difference that is kept. If Figma or the code changes its value, the difference is open again.
- Only you keep a difference. The AI asks you first, and it never writes a reason for you.
- `--keep` alone lists what is kept. `--unkeep --match <words>` takes one back.

This is not debt. Debt (`--baseline`) is a difference you will fix later. A kept difference is one you decided to keep.

### Nothing passes by accident

- A check that had nothing to read shows **Not run** with the reason, never Pass.
- What a check cannot see is listed as not comparable, with the reason, not as a difference.
- Every check is tested with a mistake planted on purpose.

## More checks beside the gates

These run beside the gates. Most give advice and never fail a run, and each can be turned off in `ds-config.json`.

| Check | What it finds | How to turn it off |
|---|---|---|
| Instructions for AI agents | Wrong names in `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, Cursor and Copilot rules | `"steering": false` |
| Primitives written by hand | A `<span>` styled as your Text component, a flex `<div>` with the system's gap | Runs only when `primitives` is set |
| Workarounds | A control laid over a component, a sign of a missing slot or prop | `"workarounds": false` |
| Tailwind | Classes that differ from Figma, and values in brackets outside the theme | `"tailwind": false` |
| The Figma file itself | Values with no token, detached instances, missing auto layout or descriptions | `"figmaHygiene": false` |
| System health | Risks as the system grows, such as tokens named after a product | `"systemHealth": false` |
| Product screens | Each product's page against the screens designed for it | `screenParity: false` |
| Mode combinations | What breaks only in a combination of modes, such as Dark on a phone | `modeCombinations: false` |
| Values written by hand | Every value a token should carry, with the token to use | `"census": false` (a run fails when a file's count grows) |

### Instructions for AI agents

`AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, Cursor and Copilot rules and skills are found on their own. Every component, prop value and token they name must exist, with each prop written the way the code writes it (`Tone=` where the code has `tone` is flagged). A wrong name there makes every agent that reads it build the wrong thing.

A file that only says what not to use is noted too. Saying that the design system is installed and its components are the ones to use is what moves agents onto it.

### Primitives written by hand

Once the library owner declares which styling means which component (`primitives` in `ds-config.json`), the engine spots it written by hand. A `<span>` given the body text style and the secondary colour is `<Text size="medium" color="secondary">`, and a flex `<div>` with the system's gap is its `Stack`. No token check sees these, since their values are the system's own. The audit lists each one, the edit check hands it back when an AI adds one, and `llms.txt` gives generators the table.

### The names your agents actually invent

The catalog rejects names by meaning: a system whose values are `error` and `warn` tells an agent that `danger` means `error`. That catches what a reasonable agent would guess.

It does not catch what *your* agents guessed. `--check-ui` already knows them — every time it says `"Pill" is not in the catalog (did you mean Chip?)`, an agent invented a name and the check knew the right one. Those are now kept (`.design-system-engine-out/invented.json`, local and cumulative) and fed back into the catalog, so the next agent reads them beside the real values instead of finding out after writing the page. A name invented once will be invented again, by the same model reading the same documentation.

Only inventions the check could correct go into the catalog: an entry that cannot say what to write instead would send an agent nowhere. The rest are still counted, because knowing a name gets invented is worth something on its own.

The same names are written into each component's contract (`invented`, with the right name and how often) and beside the component in `llms.txt` ("agents here wrote: prop showFooters → showFooter"), so an agent reads them whichever file it opens. They come from both checks, `--check-ui` and the check of pages written as code, props, values and events alike.

### When a check is wrong

Not every finding is right. A check that raises things it should not is the quietest failure the engine can have: people stop reading its lines, and then miss the true one.

`rms-design-system-engine --wrong --match <words> --why "<what the check misread>"` records a finding of the last full audit as wrong, with why it is wrong, who said so and when, in `design-system-engine-wrong.json` (commit it); `--wrong` alone lists them and `--unwrong --match <words>` takes one back. A check called wrong more than once is named in every run afterwards, however few findings it raised that day, because the thing to fix is the check. Each finding marked wrong is also a case its check must pass: every full run says which it still raises, and which its check no longer raises, so you know when a fix took and the mark can go.

**A marked finding is never hidden.** Silencing a line because someone once called it wrong would turn one person's judgement into everybody's blind spot, and a check that misreads one project may be right in the same words in another. The record exists to get the check fixed. It is also not the same as keeping a difference (`--keep`): keeping one says the engine was right and the team chose otherwise; marking one wrong says the engine was wrong.

### Workarounds around a component

A screen that lays its own control over a component (a clear button over a text field, actions over a list row) is doing what the component cannot. It is reported to the design system as a missing slot or prop, not as the screen's mistake.

**Once is an oddity; three times is a gap.** When the same thing is built by hand around the same component in more than one file, the run says so separately: that is a piece the design system does not have, and documentation does not fix it — the component does. Prototypes count alongside product screens, because an agent drawing a page meets what a component lacks before any product does. The list is also written to `.design-system-engine-out/missing-apis.json`, for whoever owns the component.

### Tailwind

- Each component's own classes are compared with what Figma states for it (`h-9` against a 36px height, `px-3 py-2` against its padding tokens), and a difference names the class to write.
- A class with a value in brackets (`rounded-[4px]`, `bg-[#b42318]`) steps outside the theme. When your `@theme` has the same value, it names the utility to write. Otherwise it says the value is not in the design system.
- `--init` sees a Tailwind theme and sets `"namingConvention": { "preset": "tailwind" }`. Figma's token names are then matched to the theme's own (`surface/base/color` to `--color-surface-base`), and a theme variable used through its utility counts as used.

### The Figma file itself

For whoever keeps the Figma file, it lists a colour, radius, padding, gap or text with no token or style, an instance detached from its component, a variant with no auto layout, a component with no description, an instance whose layer spells its component's name another way, a property bound to a token meant for other properties, and tokens left on all scopes.

Code can only match what Figma states, so the summary says first when the file is not reliable enough to compare.

**Dev Mode, from the code.** `--figma-edits` also offers to link each component set to its code file (a Dev resource) and to give each variable its CSS name as its Web code syntax (`var(--name)`), so Dev Mode and the Figma MCP hand developers and agents the names the code uses. Like every edit there, nothing is written until you say yes; a link already there is left, and a variable whose code syntax said something else is changed and listed. `devMode: false` in `ds-config.json` leaves them out.

- Under 90% of its values bound to a token or style, or of its variants in auto layout, it is only partly reliable.
- Under 60%, a match or a difference can be chance, and the least reliable components are named.

### System health

Advice on keeping the system healthy as it grows (`🧭 System health`), never a failure.

- A colour mode set below a product's root, so part of the page draws in another mode.
- A product that brings in two of the system's themes, one overriding the other by load order.
- Semantic tokens with no description in Figma. What a token is for is what an agent reads to pick it.
- A Storybook preview stylesheet that styles a component, so the catalogue shows it right while products draw it as the code does.
- Two components whose own rules are nearly the same.
- Tokens named by look (`blue-500`) rather than role, or after a product or brand (`harborNotes/accent`).
- Aliases to a removed token, with the commit that removed it.
- The token budget, the same colour written by hand in two tokens instead of one primitive, and tokens only one component uses.
- A class a product styles almost as one of the system's components, as a decision, never a drift.

A component only the code has is written to `handback/figma-to-build.md` with its props and tokens, to build it in Figma.

### Retiring and renaming

- **Retired components and tokens.** A component marked deprecated (`@deprecated` and `@use-instead` in its Figma description, or `contract.authored.json`), a token whose Figma description says `@deprecated`, or an old name a rename kept. The audit lists each in `handback/migrations.md`, with what replaces it, when and why, and every file and line still using it, docs included. Each token swap gets a patch (`migrations.diff`, `migrations-<product>.diff`).
- **Renamed tokens.** `rms-design-system-engine --rename-sweep` pairs each old name with its new one by value in every mode, and writes one patch for the system and one for each product, every rule, script and doc. The old name stays in the theme pointing at the new one until every product has moved. A full audit says in one line when the code still writes a renamed token by its old name.

**Which version each product uses.** Each time the contracts are published with a breaking change (a prop, option or state removed, a default changed, a token removed), the release is recorded with the system's version, the day and what broke, in `design-system-engine-releases.json` (commit it), with the day by which the products move to it (`migrationDays`, 90 by default). Each product says the version it uses (`products` in `ds-config.json`, or its own `package.json` depending on the system's package), and `rms-design-system-engine --products` tells each one behind which changes since its version its own files touch, and by when; one past that day is named late. Nothing is blocked.

- **Its docs too.** A product's README and every Markdown or MDX page in its folder are read with its code (never its changelog). Docs kept elsewhere are named in its entry: `"docs": "handbook/shop"`. In a doc, a component counts only as the code writes it (`tileCard`, `<tile-card>`, `<TileCard>`), never as a word of prose.
- **Late, on the Tasks list.** A product still on an older version past a release's day is a task under Products on the style guide's Tasks list: what it is still on, what it was to take by when, and how many of its files the changes touch. Its own team acts: `"team"` in its `products` entry, else `owners` under its name (Who owns what), else its name's team.

Nothing is applied until you ask.

### Product screens

A component can match Figma on its own while a product puts it in the wrong place. When Claude [refreshes the Figma data](commands.md#set-up), it also reads the screens `ds-config.json` names for each product, without changing Figma. Each product's built page is then opened at the width, height and colour mode of its screen, and compared.

The screen capture (`--figma-screens`, read only) records where each instance sits on the screens `ds-config.json` names (`frames` and `screens`). Each product's built page (`ui.html` beside its source, else `<product>/ui.html`) is opened at each screen's width, height and colour mode, and compared in reading order.

- **What is compared.** Which components and how many, their order, the space between neighbours (more than 2px apart) and whether the ones that line up in Figma line up on the page.
- **Who is a neighbour.** Only components in the same scope, placed in one component's slots or on the screen itself. A component inside another and outside its slots is that component's own part, left to its own check.
- **Lists.** Three or more of one component are compared by whether they are there and where the first item sits. The space after a list is not compared.
- **Free space in a row.** A gap wider than any the screen's layouts use is allowed 2% of what sits before it, since text draws slightly wider or narrower in Chrome than in Figma.
- **Another state.** A page that lacks more than a third of a screen's components (at least three) opens in another state. It is listed as not compared, with the way to fix it, a `setup` script on the screen's entry (inline, or a file path such as `screens/results.js`).
- **Large answers.** One answer from Figma holds at most 20 KB. The capture keeps a list to its first three items, takes as many screens as fit, and writes the script for the rest with a NEXT line until every screen is read.

### Who owns what

`owners` in `ds-config.json` names the team that owns each component, token layer or token prefix: `{ "primitives/": "Brand team", "semantic/": "Design system team", "tileCard": "Cards team", "*": "Product teams" }`. The Tasks list then says the team after who acts ("You in Figma · Brand team"), the longest key that fits first: a component's own name, else a token prefix the task names, else `*`.

### A token in the right layer

A token belongs in the first layer where its value can change. A collection with modes (Light and Dark, a brand) is where values change with them; a token in it defined the same way in every mode (the same alias or value) never uses them, and can live in a layer without modes that aliases this one, following every mode through it. The audit says how many of a moded collection's tokens are like that, by family. Advice only: Figma's collections are your team's design.

### Mode combinations

The gates check each mode on its own. When you have two collections that switch (Light and Dark, Desktop and Phone), every combination is also opened in the browser, such as Dark on a phone or Light on a desktop.

- Each token is compared with Figma's value in that combination.
- Each text and background pair the system uses is measured for contrast.

Only what is wrong together and right in each mode alone is listed, with the combination. A phone rule that sets a colour, so Dark on a phone keeps Light's, is a typical case. These show on the style guide's Tasks page, under The system.

The collections that switch (a colour mode by media, class or attribute, a sizing mode by breakpoint) are combined, up to 64 combinations (`🎛`). Each is set at once on a page holding only the theme, and every root token is read. A token that differs from Figma's value only in that combination is listed with the combination (`Dark with Phone`), and so is a text and background pair that falls below its WCAG ratio only there. They go to the Tasks page under The system.

### Values written by hand

The census (`🧮`) counts each colour, spacing, radius, font size, duration, layer and shadow a token should carry, with the token to use when one has that value, the files that guess most first. `rms-design-system-engine --census` lists each one and keeps the count, so it only falls. A file with more than before fails the run.

## Accessibility

The check is against WCAG 2.2 at level A and AA. axe-core's rules run in the same check, and every control is tried hovered, focused and pressed, so one run covers all of it (see [what it cannot tell you](#what-it-cannot-tell-you)). Every problem comes with its fix in plain words.

### Where it runs

- **Your components.** On a page you name, your style guide or your built pages. React and Vue components with no page to open are rendered straight from their own code, in each Figma variant, with no dev server.
- **What your app gives them.** A Vue component that reads a Pinia store or links with Vue Router gets your project's own, when your `package.json` lists it and it is installed.
- **What your entry installs.** Whatever your `main.js` puts on the app goes on each component too, however it does it: `app.use`, a property set on every component (a translation function), `app.provide`, a mixin, or a setup function handed the app.
- **The data a page would pass.** A component drawn alone gets what a page would give it. A value it hands on to a child takes the child's type: a number for an amount the child does sums on, an icon for the child's icon. One the child has its own fallback for is left unset.
- **Lists inside its data.** The items of a list inside an object get the fields the code reads of them, and those a child it hands each item to reads. A list inside an item is given empty.
- **The route it reads.** A component that reads the current route is drawn at a path its code expects, such as a name of the table it looks the path up in. When none can be read, its reason says so.
- **An icon of its own folder.** An icon that loads from a folder its code lists gets the name of a file in that folder.
- **One that cannot draw says why.** Its reason is given once, with how many of its cases it hits, such as a method called on an element it does not draw in that case, or the input that was missing when it read a field of nothing. It is reported as not checked, and the rest of the page is still kept for the next run.
- **Your designed screens in Figma.** When Claude [refreshes the Figma data](commands.md#set-up), it also reads the screens `ds-config.json` names for text and icon contrast and target size, without changing Figma. [Updating Figma](commands.md#update-figma) pins each problem on its layer once you say yes.

### What it tries

- **Every state and colour mode.** Each control is measured again while hovered, focused and pressed, in every colour mode, its text and its edge.
- **The keyboard.** The Tab key is followed through the page. It finds an element a mouse can click that Tab never reaches, a keyboard trap, focus that jumps back up the page and focus that lands where no one can see it. A modal dialog must keep the focus inside.
- **Screen readers.** Each press that shows something is heard as a screen reader hears it, so a toast or an error that appears with nothing said is found. The report prints what a screen reader says for each component (`checkbox, Remember me, not checked`), so you can judge the words without opening VoiceOver or NVDA.
- **Contrast.** Measured against what is really painted behind the text, see-through text and colours in `oklch()` included. An icon that carries meaning and a control's edge are held to 3:1 in every colour mode.
- **Touch and small screens.** Target size is measured in every mode, at the page's width and again on a 320 pixel screen. Each tip is tapped with a touch screen emulated. A control under the comfortable 44 pixels gets advice.
- **Reading needs.** Wider text spacing, zoom, Windows high-contrast mode and colour blindness. Two variants told apart only by red and green are found.
- **Roles from Figma.** Each component is held to the role in your Figma annotations, what it must expose (a toggle's pressed state, a field's label, a stepper's value) and what a person can do with it (Space flips a toggle, ArrowUp steps a stepper).
- **Hidden components.** A modal, menu or popover kept behind a button is opened first, never with a button that deletes, sends or submits. One that nothing opens is said not checked, never clean.
- **Signing in and dragging.** A password field that refuses paste or a password manager is found, and so is something moved only by dragging.

### What you get

- Every problem with its fix in plain words, named after the component it is in.
- How many texts, icons and controls were measured, and every element with its verdict.
- One verdict line, such as `Verdict: 1 blocker · 2 warnings · 1 advisory · WCAG 2.2 AA`.

`--no-axe` and `--no-states` leave a part out, and then the result says not all of it was checked.

### Two parts

- **From the code, always.** No browser and no page needed. It finds a button or link with only an icon and no label, an image whose alt is a file name, a removed focus outline, a mouse-only control, a hidden element that still takes focus, a misspelled `aria-*`, a page with no language or no main heading, zoom blocked and animations with no reduced-motion option. `"a11yStatic": false` turns this part off.
- **In the browser, when a page can be opened.** It goes deeper. A dialog or menu that Escape does not close, or that leaves focus somewhere other than the control that opened it. A modal dialog that lets Tab leave it. A tip a tap never shows. A message that appears with nothing said to a screen reader. A state lost in high-contrast mode. Variants told apart only by a colour some people cannot see.

### Contrast

- Measured against what is really painted behind each text, the layers at its centre in paint order, so text over a sibling or a `::before` is measured on that.
- A text colour is checked against its background token by name (`badge/label/warning` on `badge/background/warning`).
- Where the code paints the background as a tint (a `color-mix` or an opacity), only the rendered contrast decides. A tint is measured in every colour mode over each surface the system defines (Figma colour tokens with `/surface/` in the name, or `a11y.surfaces`), and the worst is reported with its surface.
- The pairs follow what Figma draws. The capture records, for each text and icon colour, the fill of the layer right under it.
- A border token a control shows itself by (an input's outline, a tile you pick) is held at 3:1 against the page by its border or its fill, as WCAG 1.4.11 asks of the boundary, even where borders are otherwise not paired. One that a control and something decorative (a card, a divider) both use is named as doing two jobs, with a control border of its own proposed. Advisory: `.design-system-engine-out/token-jobs.json`.

### Target size

Measured by the WCAG circle in every mode, at the page's own width and again on a 320 pixel screen, where a control that shrinks is caught (`320px wide`).

### Focus

A focus outline taken off a class counts as put back when a more specific rule shows focus on every element the class is put on (`button:focus-visible` for a class used only on buttons).

### A control's parts

A control's parts are checked with it: the label tied to its field, the error joined by `aria-describedby` while it shows (with `aria-invalid` set), the hint joined the same way, the indicator (a check, a chevron) silent for screen readers, the + and - of a stepper each with a name. Figma's layer annotations say which layer is which part ("role: label"); where nobody annotated them, the layers' own names say it (Label, Error message, Helper text, Chevron, Plus), and the finding says it was read from the name. The accessibility spec offered to Figma lists the parts the code's markup shows, so annotating them is one approval away. Before any browser, a field's own source is read for the same wiring (a `<label>` tied with `for` or wrapping the field, the error and hint joined with `aria-describedby`, `aria-invalid` while the error shows, an indicator with `aria-hidden`), and what is missing is said with the role check.

- **On the build sheet.** A component still to build lists its parts: each with its role, what it owes the control, and where that is checked once it exists (read in its source, then tried in the browser, or tried in the browser only).
- **A label across a shadow root.** A label outside another component, whose control sits inside that component's shadow root, cannot be tied by any id: browsers do not reach into a shadow root yet. It is said apart, as wiring no browser makes yet (an advisory, in the source check and in the browser), never as a plain failure.

### Products' pages

Run on the style guide, it also opens each product's built page whole, with every rule, axe-core's heading order and landmarks among them. On a whole page the Tab walk also says when the focus goes back up the page within a column (2.4.3) and when it lands on a control no one can see (2.4.7). `a11y.products: false` leaves the products out.

Findings are named after the product and listed on the Status page under Products.

### How sure each finding is

- **Blocker.** Measured on the page against WCAG 2.1 A or AA.
- **Warning.** Read from the code, a contract or a Figma note, and can be wrong.
- **Advisory.** Beyond AA, or for a person to judge.

The check ends with one line, `Verdict: 1 blocker · 2 warnings · 1 advisory · WCAG 2.2 AA`. A must-pass check (`"a11yStrict": true`) never stops on an advisory.

### Only what changed is tried again

- **Each page's results are kept.** They are saved under what the page rests on: its components and your CSS, your settings, and the check itself.
- **An unchanged page is not opened again.** The next run puts its results back, and the report says how many pages it reused. When nothing changed, no browser opens and the check takes seconds.
- **A change is tried at once.** A style guide is checked a few components a page, so a change to one component tries only its page again.
- **An engine update re-checks only what it changes.** The check is signed by the parts of the engine that measure: a new page in the style guide, or how the browser is driven, keeps every result. A component whose name is not valid CSS is said not checked once, and its page is still kept.
- **Live pages are always tried.** A page from a dev server or a link can change without the engine knowing, so it is never reused.
- `--fresh` (or `a11y.reuse: false`) tries every page again.

### Accessibility never gets worse

A conformance claim holds only if the next release keeps it. So a merge request (GitLab) or pull request (GitHub) can fail when it adds an accessibility problem the last build did not have.

- **What it compares.** This run's accessibility result with the one the last build on the base branch kept.
- **Only blockers count.** A warning or an advisory never fails it.
- **Only components and products' pages.** A finding on the page around them is left out, and so are prototypes.
- **Old problems are not new.** A blocker the base branch already had is ignored, even when its measured value moves.
- **Each blocker is keyed the same way every time.** By its component or product page, the element and its variant, the state, the colour mode, the WCAG criterion and the kind of problem.

What you get:

| Situation | Exit | What it says |
|---|---|---|
| A new blocker | 1 | Each one, such as `new: cardTile, disabled (Light), 1.4.3 contrast 3.1:1` |
| No new blocker | 0 | That, and each blocker fixed since, as good news |
| No build kept a result yet | 0 | That there is nothing to compare, so it passes |
| This run has no result of its own | 2 | That the check did not measure anything, so nothing can be compared |

- **A component this run could not read** is listed as not checked, never as fixed.
- **It only reports.** It never changes your code. Your pipeline decides what a failing exit stops.

#### Set it up in CI

Two steps, both after the audit:

1. **On the base branch**, keep each build's result: `rms-design-system-engine --a11y-no-worse --record`. It writes `.design-system-engine-out/a11y-last-build.json`.
2. **On each merge request or pull request**, compare: `rms-design-system-engine --a11y-no-worse`.

The pipeline carries the file from the base branch to each merge request: as the last job's artifact on GitLab, in the cache on GitHub.

GitLab (`.gitlab-ci.yml`):

```yaml
.a11y:
  image: node:24-bookworm
  variables:
    CHROME_PATH: /usr/bin/chromium
  before_script:
    - apt-get update -qq && apt-get install -y -qq chromium > /dev/null
    - git clone --depth 1 https://github.com/rafaelmatosdasilva/rms-design-system-engine.git ../engine

a11y-keep:
  extends: .a11y
  script:
    - node ../engine/audit.mjs --only accessibility || true
    - node ../engine/audit.mjs --a11y-no-worse --record
  artifacts:
    paths: [.design-system-engine-out/a11y-last-build.json]
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

a11y-no-worse:
  extends: .a11y
  script:
    - mkdir -p .design-system-engine-out
    - 'curl -fsSL -H "JOB-TOKEN: $CI_JOB_TOKEN" -o .design-system-engine-out/a11y-last-build.json "$CI_API_V4_URL/projects/$CI_PROJECT_ID/jobs/artifacts/$CI_DEFAULT_BRANCH/raw/.design-system-engine-out/a11y-last-build.json?job=a11y-keep" || true'
    - node ../engine/audit.mjs --only accessibility || true
    - node ../engine/audit.mjs --a11y-no-worse
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

GitLab keeps the artifact of the latest successful job on each branch, so the merge request reads the base branch's last one. Before the first, nothing is fetched and the check passes, saying so.

GitHub (`.github/workflows/a11y-no-worse.yml`):

```yaml
name: accessibility never gets worse
on:
  push:
    branches: [main]
  pull_request:
jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: git clone --depth 1 https://github.com/rafaelmatosdasilva/rms-design-system-engine.git ../engine
      - uses: actions/cache/restore@v4
        with:
          path: .design-system-engine-out
          key: a11y-main-${{ github.sha }}
          restore-keys: a11y-main-
      - run: node ../engine/audit.mjs --only accessibility || true
      - if: github.event_name == 'pull_request'
        run: node ../engine/audit.mjs --a11y-no-worse
      - if: github.event_name == 'push'
        run: node ../engine/audit.mjs --a11y-no-worse --record
      - if: github.event_name == 'push'
        uses: actions/cache/save@v4
        with:
          path: .design-system-engine-out
          key: a11y-main-${{ github.sha }}
```

GitHub's runners already have Chrome. A pull request can read the caches its base branch saved, and the cache also lets the check reuse the pages that did not change. Name your base branch where it says `main`.

### What the Figma file is missing

Some problems belong to the Figma file. They are listed for whoever keeps it.

- An interactive component with no focus state, so the code has to invent the focus ring.
- An error state with no message, so the error is shown by colour alone.
- A control under 24 pixels.

Meanwhile Claude writes a visible focus ring and leaves an error message's words to you.

### What it cannot tell you

An automated check finds many failures, but it cannot show that a product meets WCAG.

- **Meaning.** Whether a label, an error message or a heading makes sense is for a person to judge.
- **Whole tasks.** Whether someone using a screen reader or only a keyboard can finish a flow from start to end is tried by a person.
- **Where it shows.** These are listed as You check by hand on the Status page, and a row stays open until someone says it was checked.

## The style guide

[The style guide](commands.md#style-guide) is one page with every token and component, from what Figma and the code agree on, in `.design-system-engine-out/styleguide/index.html`.

**[See an example](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/)**, the RMS Design System's style guide, built by this engine and published by that design system, so it shows what the engine makes today.

- **One component at a time.** A page for one component checks it first, against Figma and for accessibility, then shows it and the components it nests, `styleguide/modal.html`.
- **One link for the team.** Publishing writes the CI job that publishes it on every push, to GitHub Pages or GitLab Pages, so everyone opens the same page built from what is merged. A local run stays a preview.
- **Easy to host.** The page keeps its styles, code, fonts and data in an `assets` folder beside it, each file named by what it holds. To open it on your computer, download `index.html` and the `assets` folder. A host serves them once and a browser keeps them, so after a rebuild a visitor downloads only the page and its data, and the component panel opens from what is already there. It still opens from disk, double-clicked.
- **One template for every project.** Every project fills the same template (`templates/styleguide.template.html`) with its own data, so an improvement there reaches every design system on its next run. A project can still use its own (`styleguide.template` in `ds-config.json`).

### What's in it

| Page | What you find there |
|---|---|
| Overview | A card for each foundation and component, with a thumbnail drawn from your own code, and a search across everything |
| Health | How far the system has come, in one number and by area |
| Tasks | Everything still open, with who acts and what to do |
| Foundations | Colours, typography, spacing, radii, motion and icons |
| Components | One page for each component, in areas you switch between |

### Status

One page for how the system stands and what is left. It is second in the list, under the index.

- **Four cards at the top.** Parity, Code, Accessibility and Documentation: how many components are done in each, and what is left.
- **One table of the components.** A row for each component, with its state in Figma, Code, Parity, Accessibility and Documentation, and when it was last checked. A row opens the component's page in a side panel. Filters narrow the table by state, and a link keeps what you chose. How the table works is in [The Status table](#the-status-table).
- **Not tied to one component.** Under the table, the system's own tasks: token descriptions, components whose file is still to confirm, controls the page stands in for.

Every row says what to do and who acts.

- **You in Figma.** A change you make in the Figma file, a colour that fails contrast included.
- **A developer in the code.** Whoever your team chooses: a developer, or an agent such as Claude given the task numbers (do 3 and 7). The page's words never assume which.
- **A known exception.** Wherever only one side has something, keeping it on purpose is an option too, with its reason.
- **You decide.** Figma and the code each have a case.
- **You check by hand.** What only a person can judge. Once you have, [tell Claude](commands.md#accessibility) and the row is Done, with your name and the date, until the component changes.

Each row also shows its status (To fix, To check, New in the last audit), when it was last updated and where it was read. The system's own items come first. Under The system you find what the tokens owe, such as descriptions to write in Figma, a token named after a product, an alias that points nowhere, and a retired token still in use.

Accessibility is tried while the page is built and kept in it, so the page opens with the final results and nothing runs while you read. A component the build could not try is tried in your browser instead. A page whose own script fails is never published, so the last good page stays.

### Each component's page

At the top, the component's name and how a product imports it, with buttons to copy it or download its file. Beside it, its version, when it last changed, and links to See in Figma, See in code and your team's own pages. Then one area at a time. Parity, Accessibility and Documentation carry their Status dot on their tab (N/A none), from the same rules as the Status table, so a word or a rule changed once changes everywhere. Their chips and each row's status use the Status words too: Parity Differs, Unsure, Match; Accessibility Issues, Review, Pass; Documentation Missing, Partial, Ready. An area with nothing to show (N/A, nothing moves, no commit yet, not used anywhere) says why in an info box, N/A in the same words as the Status table's tip.

| Area | What it shows |
|---|---|
| Playground | The component drawn from your own markup and CSS, with Figma's props as controls, every state, your modes and a Width switch. Below it, the tokens behind what is drawn and the code to copy |
| Specs | Its parts, paddings and gaps |
| Variants | Every option of each prop, one per row, with Try it to set it in the Playground |
| Parity | Every prop, token and value compared with Figma, each marked Done, To fix, To check or Not compared |
| Accessibility | One table by WCAG 2.2 criterion, with what Figma states, what was found, what to do and who acts |
| Documentation | What it is, when to use it and when not, common mistakes, limitations, Do and Don't pictures, its role and an example, with what is still to write |
| Motion | Everything that moves in it, the code's timing beside Figma's |
| Built with | The system's components it is made of |
| Parts | The components placed only inside it (a dropdown's row, a table's cell), each with its own documentation, written in this component's page |
| Used in | Each product that uses it, with a picture and how many times. A product that draws its own version (Gate [10]) is there too |
| History | Each Figma change and each code commit, by release, with links, and what the team decided about it |

Each area has its own link (`#c-chip/accessibility`). The address also keeps what you set in the Playground (`#c-chip?Size=L&width=phone`), so a link opens that exact variant.

In the Playground.

- **Inspect.** Outlines each part, padding and gap. Click one to see what it is and its value (`chip padding left · --padding-s · 8px`), and click inside to go one level deeper.
- **Figma beside the code.** The Figma button shows Figma's image of the variant you set, beside the component or over it with a slider. The images come from `.design-system-engine-refs/` or, with `FIGMA_TOKEN` in `.env`, straight from Figma.
- **Width.** Shows the component at each breakpoint your Figma file gives (Phone 350, Desktop 1680), else at 375, 768 and 1280 pixels, with your media queries applied.
- **It works as in your products.** Your system's own scripts run (`systemScripts` in `ds-config.json`), a selection moves when you click it, and an overlay opens with its own animation.

Also on each component.

- **API.** The props, events and slots your code declares, required ones marked. A plain HTML and CSS system has no API to read, so it is left out.
- **Code.** Its head stays in view as you scroll, with Copy code as a plain underlined button. Exactly what the Playground shows, as a product writes it (`<Chip size="l" />`), or the HTML with only the classes your CSS styles.
- **A token's panel.** Click any token to see its value in each mode, the components that use it, and a button to copy it.
- **Not agreed yet.** A prop only one side has, a different default or a token that differs is left out and counted at the top, so you decide each one first.
- **Only in the code.** A component only your code has keeps its own page and its place in the menu, marked Only in the code, with its file and its props. Its Status row says Figma is Missing, with what to do in an i: add it to Figma, or remove it from the code. Its Parity is N/A. `styleguide.showCodeOnly: false` leaves these off the pages, a task each.
- **Status and coverage.** Stable, beta or deprecated when your team says so, and how much of its file your tests cover.

### The intent layer

Your intent layer (why each piece exists and how to use it) is read on every run: DSDS or Markdown (MDX) pages, in a GitLab project, a GitHub repository or a folder of your project. On a Markdown page, written for people, only a line that tells what to do is one of its rules; a line that only describes (what the variants are, how it is laid out) stays on its documentation for people, so agents are not handed every paragraph. Links between its pages lead to those pages where the layer lives, and images, lines of links and HTML entities are left out. Each component's Documentation shows it beside Figma, the code and the contract, each line with where it came from and a link to its page; agents get it in the contracts, `llms.txt` and the prototypes, so they can compose a page that has no Figma layout yet. The Documentation page (once the Intent layer page) reviews every page with one decision (Delete, Move, Rename, Name, Write, Improve, Keep, Add), why, and each change to make in the layer, and gathers what is still to write about each component from every source, with where to write it (Figma, the intent layer). It also flags Remove on each component whose Figma annotations or code notes no agent reads: a note that repeats the description, is only a link, or is past the three an agent is shown. A note in the code that only says how the component is built, or repeats another, is left alone: it is there for developers.

With no intent layer, every row can still be finished.

- **Do and don't.** Write lines that start with `Do:` or `Don't:` in its Figma description, in the comment above its CSS rule, or in `contract.authored.json` under `guidance.doDont`. Agents get them with its pictures.
- **Properties.** The contract the engine writes from Figma and the code is the one agents read, so there is nothing to publish.
- **Text styles.** A text style's description in Figma counts as its token's, like a variable's.
- **Role.** A component whose root is a plain element (a `span`, a `div`) with nothing to press, type in or go to has no role, read from its code: nobody has to decide it.

### Guidance for agents

Agents read your guidelines and Figma's descriptions to pick and use each component. [Ask Claude](commands.md#ask-the-system) to rate them, and each component gets a class.

| Class | What it means |
|---|---|
| Ready | An agent can pick it and use it from what you wrote |
| Partial | Some of it is there |
| Thin | Little or nothing is there |

- **What it looks for.** A section headed with the component's exact name, what it is, when to use it, when not to, its role and an example. Its properties are not asked for: its contract carries them from Figma and the code.
- **Names that mislead.** A token, property or component named in the text that the system does not have is listed first, to rename or take out. A name with a `*` (`--card-*`) is a family, there when one of the system's names starts with it.
- **Where you see it.** In each component's Documentation area, one row per piece (Example; Properties, done, naming the contract file that holds them; Names that do not exist; beside What it is and When to use), and on the Status page's tasks under Documentation while something is missing.
- **A test with a model, when you ask.** A model answers questions from your guidance alone, such as the options of each property, and the engine scores the answers against the real ones. It uses your model tokens.
- **The whole document** gets a class too, from how many of its components are ready.
- **What a screen meets first.** Each component's Documentation area also asks what its page leaves open at the edges: what it does when its content does not fit (it scrolls, wraps, is cut or grows), and, for a component with two actions, what it shows with one. Asked only where it applies, and no more once the page says it.

### Foundations

Every table shows each mode as a column of its own, side by side, never a switch: the breakpoints from Phone to Desktop, the colours in Light and Dark. Each row has its name as in Figma, the code's name under it, then its value in each mode. The columns line up from one table to the next, the header row stays in view as you scroll, and a narrow window wraps the names instead of scrolling sideways.

- **Brand kit.** The system at a glance, for the brand chosen: its main hues with its family set large, the primitive ramps, its colour names and values running across the page, its type set for effect, semantic pairs with their contrast, its shapes, motion samples that move as the system does, and its icons lighting up in a grid. Every value is one of its tokens.
- **Tokens.** Every token Figma has, as Figma keeps them: a Collection filter (Figma's own collections, never one made up), the groups as a tree you open and close, and a table for each collection with its own modes as columns. Filter chips at the top show only Colors, Typography, Spacing, Radii or Motion. Each row has a mark for its kind, its name and its values. An alias shows as Figma's pill and opens the token it points at. The arrow at the end of a row opens its details: what it styles, its name in the code with Copy, what it is for, its values and the components that use it. Download all tokens saves them all, in every mode, as one JSON file.
- **Colours, typography, spacing, radii and motion.** Each page shows its own tokens in the Tokens page's tables, with the same aliases and details; an alias or a group's path opens it on the Tokens page.
- **Colours.** The primitive ramp first, then the semantic roles, each mode with its swatch and value.
- **Typography.** The family once, with its letters drawn. Then Figma's text styles in Figma's order, each under its full name (`s/regular`), with the fields Figma gives it: size, weight, line height, letter spacing and case.
  - A style shows only when every one of its fields was compared and agrees, in every breakpoint. The others are named at the top and listed on the Status page.
  - When the family differs, the styles use the code's family, with a note.
- **Spacing and radii.** One card per family, smallest first.
- **Motion.** The durations and easings, each played when you press Play, each easing's curve drawn, and what the system does for someone who asks for less motion.
- **Icons.** Grouped by size, shown at the size Figma gives them, with their stroke widths.
  - From your sprite, or from a folder of SVG files, one icon each (such as `src/assets/icons`), found on its own. `styleguide.iconSource` names either one.

A token shows only when the token check finds it equal to Figma in every mode. Anything named after a component, its colours or sizes, is shown in that component instead.

### It looks like your system

The template is only the layout. Every colour, weight and space on the page is one of your tokens. Its text sizes and its corners are the template's own, so its chips, counts and cards look the same in every brand.

- The page's controls are its own, drawn with your tokens: a segmented control, buttons (solid, so nothing behind shows through), fields, a card, and one tooltip used everywhere (the Status page's i and a WCAG criterion's name alike). A chosen filter, an open dropdown and a field you type in share one look: the page's background, outlined.
- The engine fails the page when anything on it is not from your system, or when its own text falls below 4.5:1 in any colour mode.
- Page titles use your own heading style. `"title-scale"` in `styleguide.chrome` changes their size.
- A colour you set in `styleguide.chrome` carries to the ones that follow it. A new `bg` is also the stage behind each component, unless you set `stage` too.

### Modes

Each component and foundation has its own switch for each mode collection, and the page has one for colour. By default everything follows your device (Dark when it is set to dark, Phone sizes in a narrow window) until you pick a mode. A mode your code has no CSS for yet is shown as such, never drawn with Figma's values.

### It works on a phone

Every page fits a 320 pixel screen (WCAG 1.4.10). Cards sit two side by side, every table reads as a block per row, and the menu opens from a Menu button.

### The Status table

One row for each component, with one word per state. The cards above the table and the filter chips use the same words.

| Column | States |
|---|---|
| Figma, Code | Found, Unsure, Missing |
| Parity | Match, Partial, Differs, Unsure |
| Accessibility | Pass, Issues, Review, Untested |
| Documentation | Ready, Partial, Missing |

- **Cards.** Parity, Code, Accessibility and Documentation, read from the table's rows. The big number is what is done (Match, Found, Pass, Ready) out of the same components; the bar splits the rest in the table's own states and colours (Not checked grey). Each card's button opens the table filtered to what is left (See the 60 missing components).
- **Parts.** A Figma name with a slash (`chartBars/bar`) is a part, not a row: its parent's row counts what it has left, and the parent's details list it under Parts.
- **Opening a component.** A row, or its arrow, opens the component's page in a panel from the right, with its tabs. A Parity, Accessibility or Documentation cell with something left opens that area, filtered to what is to fix or decide.
- **N/A and Untested.** N/A has no dot and no arrow, since there is nothing to open. N/A and Untested carry an i that says why. A component only one side has says what to do in an i on the side that lacks it.
- **Sorting.** Every column sorts both ways, Parity first.
- **Filters.** One chip per column, named only until a state is chosen, so nothing looks applied. Each opens a list of All and the column's states, with how many rows each would show. Chips combine (Code: Found and Documentation: Missing is what is built and undocumented), each list counting beside the others' choices. Choosing a state sorts by its column; Clear filters drops them all.
- **The address.** It keeps the view, the filters and the open panel with its tab (`#status/parity?code=Missing&doc=Missing&open=c-chip/accessibility`), so a link opens the page as it was. `#health` and `#tasks` open the Status page too.

## Prototype with your design system

Describe a screen in your own words and get it made only of your design system's components, with their own options. Nothing in the system changes, and the page check flags anything on the page that is not from the system. When a screen needs something the system lacks, the prototype shows a labelled box or marks the component standing in, and the need goes on a list for your design team.

Measured on twelve prototype requests, Claude alone made 17 of 36 right with Opus and 3 of 36 with Haiku. With the engine, 36 of 36 and 35 of 36 ([case study](../CASE-STUDY.md)).

**Handing one over.** A prototype is usually handed over by sending someone the file, and they read it to work out what it uses, where each component lives and what is still open. `--handoff` writes that as one page beside the prototype: what it is made of, what the design system lacked for it, and what is unresolved. It measures nothing new, and it is written whether or not the page is ready - a page that is not ready is exactly the one someone else needs the facts about.

**What you said about it, kept with it.** A prototype is reviewed by someone saying what is wrong, usually in a chat window nobody reads again - and the agent that changes the page next gets the request and the findings, but not the one thing that matters most: what the person who asked for it said when they saw it. `--comment` keeps that beside the prototype, pinned to a component when it is about one, and every later run shows what nobody has answered yet. Closing a comment records what changed because of it.

What to ask is in [Prototypes and building](commands.md#prototypes-and-building) on the Commands page.

### What you get

- **A page made of your real system.** Your components and tokens, in light and dark, under `.design-system-engine-out/prototypes/`. It draws at once, even offline.
- **Every state.** Empty, error, loading and any state your guidelines or your request name, each switchable on the page.
- **Every screen size.** Each state is tried from phone to desktop, with the words as written and 40% longer, as a translation makes them. Text that spills, a label on two lines and a target too small to tap are listed.
- **Click-through flows.** Pages link to each other, so you can click through a sign-up or a checkout, checked against the flows your guidelines describe.
- **It works.** Your system's own scripts run, so a selection moves, a toggle switches, a field takes typing and a dialog opens and closes with Escape.
- **A design review.** Each page is reviewed in the browser and scored out of 10 for alignment, spacing rhythm, one main action, a heading that leads and lines short enough to read. Claude fixes what scores low.
- **Checked in the browser.** Measured against the screen your designers made, and run through the accessibility check.
- **Pages that match.** Page padding, space between sections, text styles, where actions sit and what they are called, never Save on one page and Submit on another.

### It uses what your team knows

Before Claude writes a prototype, it sees what was read (Figma, the code, your recorded decisions, your guidelines from Notion, GitLab or the project) and the guidelines, components and screens that fit your request. Each component comes with what it is for, when to use it and when not, its common mistakes and its Do and Don't.

- A retired component is never used.
- A rule like one button per screen is checked.
- A component your documentation rules out for a use is not used for it.

The rules arrive in tiers, from the most general to the most specific: the engine's own, true of any design system; your design system's; and the product's own (a product page or flow in your intent layer, and the project's `AGENTS.md`). Where two disagree, the more specific one wins — a product narrowing a general rule is how a design system gets used, not a fault. Only a pair written inside one tier, by two people with the same authority, is a decision nobody has made, and those are the ones the sweep below hands you.

### What a prototype is

A short file listing which components go where, with which options (`prototypes/<name>.json`). The engine checks it first. One that uses a component or an option the system lacks is not drawn, and each line says why.

Where your system has no layout components, the engine lends neutral ones (a page, a stack, a row, columns) that use only your spacing tokens and text styles, and adds layout components to the list.

### Where the engine may write, and where it must never

Until now the answer was the same in every project, and it was always the most cautious one: write a script, show it, ask again. One setting in `ds-config.json` now says it per place, and the whole engine reads the same answer:

| Place | What it holds |
|---|---|
| The design file | What Figma shows: a role, a name, an annotation, a component |
| The code the engine generated | The tokens, the contracts, the style guide |
| The engine's own files | The authored contract, the structure contract's notes, the kept differences |
| The team's issue tracker | One issue per difference, closed when no run finds it any more |

**Your product's code is not on that list, and never will be.** The engine does not change code people wrote. What it finds there comes back as a patch for a person to apply and as the difference on that component's page in the style guide. At most it writes the intent layer; everything else it flags.

Each gets **yes** (write it, and say what changed), **ask** (show the exact change and wait for a yes, every time) or **no** (never: the change goes on the Tasks page, for whoever owns that place). A place with no answer is asked about once, and the answer is recorded, so every session and every run read the same one. `rms-design-system-engine --writes` shows them; `--writes figma ask` sets one.

Two things the setting cannot override. On CI there is nobody to answer, so **ask** becomes **no**. And CI never writes the design file or the product's code, whatever the setting says: a run nobody is watching changing what people wrote is how a team stops trusting the engine.

A project that says never gets the list of Figma changes and no script to run. A script nobody may run is a loaded gun left on the table.

### Differences become issues, and close themselves

A difference reaches whoever can fix it only if somebody carries it there by hand, and a list read once is a list nobody acts on. Name a project for issues and the engine keeps one issue per difference:

- **Never twice.** An issue is keyed the way a kept difference is keyed — its check and its words, without the icon and without a line number — so the same difference found again finds its own issue instead of opening another. An edit higher up the file does not make it a new problem.
- **Closed by the check, not by hand.** An issue the next run no longer finds is closed, with a line saying why. Nobody tidies up after the engine.
- **A difference kept on purpose never opens one.** Your team already decided it. Reopening it every week is how a team learns to ignore the engine.

Issues a person wrote are never touched: the engine finds its own by a mark in the body. It opens, comments why it is closing, and closes — nothing else. Reporter is enough for all of it, so GitLab still decides who may.

The plan is always written to `.design-system-engine-out/issues.json`, whether or not it is sent, and sending follows the `writes` setting above. CI never sends: a run nobody is watching filling your tracker is how a team stops trusting the engine.

Each open issue also says **which of three fixes it needs**, read from the check it came from rather than from how bad the finding sounds:

| | |
|---|---|
| **written** | what is written is wrong or missing: drafts in the intent layer, always for a person to approve |
| **the code** | a value that does not match Figma: a patch handed back for a person to apply, and the difference on the component's page |
| **the design file** | work in Figma: the hand-back, for a person. The engine never decides a design |
| **a person** | everything else. Saying "a person decides" is an answer |

The engine already built all three; what was missing was the sentence saying which one this issue needs, so whoever reads the tracker is not the one working it out every time. Where it cannot tell, it says a person decides rather than guessing: a wrong route costs more than no route, because somebody follows it.

### What the engine is sure of, it writes

A project with no intent layer gets everything the Documentation page finds as a list and nothing else, and most of those lines are never carried into a file by hand. Some of them the engine is not guessing at:

- **The element a component renders.** It read the code, in Vue, Svelte or JSX. A component whose root is a `div` is left alone — a box says nothing — and one your team already answered for keeps its answer.
- **A note that repeats the description.** An agent is shown both and reads the same thing twice, which is how a card that could have said something new says nothing.
- **Your product's own first use of a component**, as an example. Certain that the code is real; a judgement that it is the one to show, so it is written as a draft for a person to approve.

These go into `contract.authored.json` — the engine's own file and no other — and only where the project says it may (the `writes` setting above). What needs a person stays a task: a role that is a choice rather than a reading, Figma's annotations, words only a designer can give.

Two lines are never crossed. What is certain is written as final and what is judgement is written as a **Draft:**, never read as your team's word. And nothing a person wrote is ever overwritten: the engine fills what is empty and removes what repeats, and a sentence somebody chose stays as they chose it.

### Parts are not components

Some components exist only as pieces of another: a dropdown's row, a table's cell, a chart's legend. Figma and the code keep each one as a component, but nobody places one on its own. Listed beside the others, they read as more components to choose from, and each asks for documentation of its own.

The engine finds them when two things agree. Either the name sits under the other's in Figma (`grid/Row`), or the name carries the other's and the other holds it. A part is shown inside its root, in a Parts area, and leaves the menu and the counts. Its documentation goes in the root's page, under Parts, one section per part, so it can say how that piece is used. Agents are told to place the root.

When only one thing agrees, the engine asks instead of guessing: a card on the component with an answer to copy. [Tell Claude](commands.md#tokens-and-changes) and it records the answer in your intent layer, so it is never asked again.

### What the team already decided

Every decision somebody makes is recorded where it is made: a difference kept on purpose with its reason, a proposal answered yes or no, a difference accepted for now, a component checked by hand, a need nothing in the system fitted with what was looked at and why. Nothing gathered them, so a decision was only ever seen by whoever ran the command that made it.

Now they come together in one log, written to `DECISIONS.md` in the output folder. A `DECISIONS.md` your team wrote by hand is read as one more source and never rewritten.

A decision a person makes on purpose lives in your intent layer, on the page it is about: a component's, a pattern's, a template's, a flow's, a foundation's or the system's own. It sits under a Decisions heading, one line each: what was decided, what was ruled out, why, who and when. [Tell Claude](commands.md#tokens-and-changes) and it writes the line for you to read first, and sends it to the layer only when you ask.

The style guide shows them in **History** (it was the Changelog): one table, by release, of what changed in the code, what changed in Figma and what was decided, each row tagged Code, Figma or Decision. A chip for each shows only that kind. Each component's History area does the same for that component.

The part that pays is what agents get. A card now carries what was already ruled out and why, and `llms.txt` lists it under Decided against: an agent that does not know a thing was considered and rejected will propose it again, confidently, every time it is asked.

### Your rules, read against each other

Everything written for an agent reaches it at once: your guidelines, each layer of your intent, every component's page and your project's `AGENTS.md`. Written at different times by different people, they start to disagree. The engine reads them side by side and hands you three lists:

- **Pairs that cannot both be followed.** Two rules about the same component where one allows what the other rules out, two counts of it (exactly one, against several), or two places it may only go. Whichever the agent reads last wins, so each pair is a decision nobody has made yet.
- **A rule written twice.** The same rule in two places in different words: two rules to read, one rule to follow.
- **Rules nothing can check.** A rule that names nothing your system has and that no check reads. It may still be good advice, but the agent carries it into every request and nothing can say whether a prototype followed it.

Nothing is rewritten. Each line comes with both sentences and where each came from, for the person who owns the words, and each component's Documentation page lists the ones about it.

### The gap list

Every prototype's gaps are kept in `.design-system-engine-out/prototypes/gaps.json`, the most needed first. Each says what was searched, the nearest components, what stands in meanwhile and why none fit, so whoever decides works from the evidence. Ask to send them to Figma and they become your design team's to do list there, one card per need, written only after you say yes.

## Start from Figma only

Open an empty project, set it up with your Figma link and ask for what to build. With no code yet, the engine starts in build mode. What Figma has and the code does not is listed as to build, in order, never as a failure.

What to ask is in [Prototypes and building](commands.md#prototypes-and-building) on the Commands page.

Claude writes the code. The engine gives it Figma's exact names and values first, and checks every piece after.

Measured on a small design system in Figma (tokens, four components and a screen), Claude with the Figma MCP alone built 8 of 18 pieces right with Opus, 16 of 30 with Sonnet and 4 of 18 with Haiku. With the engine all three built all of them. The [case study](../CASE-STUDY.md) gathers every measurement, and the full log is in [test/skill-evals/RESULTS.md](../test/skill-evals/RESULTS.md).

## Keep products aligned

Renaming and retiring tokens and components is in [Retiring and renaming](#retiring-and-renaming), and the count of values written by hand in [Values written by hand](#values-written-by-hand).

- **Catch near copies.** A product that builds a component by hand, or styles a class almost like one of yours, comes back to you as a decision. Use the component, with a new option if it needs one, or add the new one to the system on purpose.
- **Colour pairs, not a shortlist.** For every text and icon colour, the engine works out the one surface it was made for, reading the names (`content/on-interactive` goes with `surface/interactive`) and confirming it against the values. The pair goes into the contract, into `llms.txt` and into `--query`, so an agent is given the answer instead of every surface that would work: given only a shortlist, it picks a different grey on every card. An edit that puts a colour on another surface is told so at once, with the contrast the two actually give. And a pair whose names promise what its values break (white on a warning yellow) is reported as what it is: the system's own words against its own numbers.
- **Two questions agents ask your intent layer.** Which token is for this? A token counts as answered when Figma's description, its own entry in the layer or a page that names it says what it is for. An entry that only repeats the token's name, its modes or what it points to is no answer. Is there a component the system doesn't have? The layer must say what to do when none fits, in one rule for every case, or an agent asked for a toast builds its own. Both show on the Documentation page, the second also in the audit's advice.
- **Lists your intent layer copies.** A prop table copied from the code, a whole token family listed by name, or a catalog of components written out on a page is flagged, right today or not, because it goes stale and agents take it for the whole list. Each says which generated file to link to instead: the component's contract, the file its tokens come from, or the contracts. A table that says what each token is for, an order of components, or a few picked out with a rule is guidance and left alone.
- **The contracts in DSDS too.** Beside the contracts, `contracts/dsds/` holds the same components in [DSDS](https://designsystemdocspec.org) 0.23, for a team that documents its system in that format: one file per component and an index. Each says what the engine reads from Figma and the code (the variants and states, what it nests, what to use instead, its status) and links the rest, as DSDS asks: the contract as its spec, the code file as its source, the Figma component, and your own page, whose guidance is never copied back.
- **How your system builds a component in Figma.** Every run reads your components and writes down how they are built: how components, properties and variant options are named, whether layers have names of their own, auto layout everywhere, whether a component binds its own variables or the shared ones, a description on each. Nothing is a rule until every component follows it: each line is a rule, to fix (most follow it, or your team decided it) or to decide. It reads how each component is built inside too: every variant's layers, auto layout, what each property drives, styles, nesting and slots, and the shape each family (the buttons, the cards) is built in. A Construction page in the style guide, opened by its link, lists them with what is to do; each fix copies into Claude Code, and renames are made in Figma for you ([how to ask](commands.md#update-figma)).
- **Your Showroom screens, reviewed as pages.** Each screen your product builds with the system (`showroom/`) gets the review a page in your code gets: one main action in view, nothing destructive louder than it, no card inside a card, headings in order, a label that is more than a placeholder. Each finding with its line and each screen a score out of 10. The system's own header with a title counts as the page's heading, and a card set to draw no surface is laid out as any part. Advice, never a failure.
- **Brands that pin what they inherit.** For a system with brands (Figma's extended collections), System health lists each value a brand sets exactly as it inherits it from the brand it extends. It changes nothing today, and pins the value: the brand no longer follows when its parent changes it. Keep each the brand must hold and remove the rest. A brand may set any variable, a component's own and ones nothing reads yet included; that is never listed. Advice, never a failure.
- **Products in their own repositories.** Name them in `ds-config.json` (`pluginDirs`, or `codeRoots` for any folder) and every scan reads their code as the project's own.

Nothing is applied until you ask.

## Bring Figma in line with the code

When the code already states something Figma does not, the engine can write it into Figma for you.

- **Each component's accessibility spec,** as the code gives it, in the Accessibility category. Its role (a real `<button>` gets `Role: button`), what names it, its states, the keys its role owes and what a screen reader says.
- **The designed screens' accessibility problems,** each pinned on its layer with its WCAG number and its fix, and a summary for each screen, in the category Accessibility Review.

Both are replaced on each run, so what is fixed clears.

What to ask is in [Update Figma](commands.md#update-figma) on the Commands page.

- **You see the list first.** Each change names the component, what it adds and why. Nothing changes until you say yes.
- **The engine writes the change, not the AI.** It writes the script, Claude runs it through the Figma MCP, and the project hooks refuse any other write to Figma.
- **Only what the code already proves.** A component whose role differs between Figma and the code is listed for you to decide. Descriptions, missing components and layouts are never written. They stay on the hand-back list for your design team.

## Working with AI tools

### What it writes for agents

`contracts/llms.txt` says what to use, not only what exists. It opens by telling an agent three things.

- The design system is part of the project.
- Build nothing by hand that a component covers.
- Ask `--query` before guessing a name.

**It also notices when an agent did not read.** `--catalog` remembers which components' cards it handed over, and `--check-ui` says which components the generated page used without one. It is a warning, never a refusal — a card can reach an agent another way — and a project where nothing has been handed over yet says nothing at all rather than flagging everything. Agents that skip a component's card are where most layout and prop mistakes start, so this names the cause instead of the symptoms.

Then it says which source decides when two disagree. The goal of the people who use the product first, then verified research, then the system's documented standards, then accepted past decisions, then general heuristics, with this system's own source named at each level and WCAG 2.2 AA as the floor. Under the tokens it says what each is for in your team's own words, from the descriptions you write on the variables in Figma, the brand's first, so an agent picks a colour by its purpose and not by its name alone. The notes your team writes in Figma outside any component (on its foundations, brand and pattern pages) are said too, by page, once the annotation categories are read (`--annotation-categories`); a note for whoever draws the file (Authoring) is left out. It stays small enough to read whole. For a large system the full catalog stays in `catalog.json`.

### Does your guidance help your AI tools?

`node eval-run.mjs --levels bare,steering,parity` runs the same generation tasks three ways, with the prompt alone, with your own instruction files (`AGENTS.md`, `CLAUDE.md`, rules), and with what this skill writes for agents (`contracts/llms.txt`). Each is scored by the same checks, design-system tokens and classes and accessibility, so you see what each kind of guidance adds or costs.

- **Finding the component is part of the test.** A case names the component it expects (`"component": "chip"`), and the agent never sees it. A result that builds its own instead fails. A prompt that names a component is flagged before the run.
- **Type checks.** When results are `.tsx` or `.jsx` and a TypeScript compiler is at hand, each one is type-checked against your components' props (`"evals": { "compile": false }` turns it off).
- **What it needs.** Your own generate command in `ds-config.json` (`evals.generate.cmd`). It spends your model tokens and never gates the repo. With `--ci` it fails when a run is worse than the last one.

### Is your guidance ready for agents?

`rms-design-system-engine --guidance-rating` rates the guidelines files and Figma's descriptions for what an agent can take from each component, and writes `.design-system-engine-out/guidance-rating.json`.

- **Per component.** Ready, partial or thin, from its own section (headed with its exact name), what it is, when to use it and when not, its role, an example, and its properties named as Figma names them.
- **Stale names.** A name in backticks that is no token, property or component of the system is listed to rename or take out.
- **The extraction test.** `--extract` asks a model, through `guidelines.extract.cmd` (`claude -p` by default), the options of each property from the guidance alone, and scores the answers. It uses your model tokens.
- **The guidance evaluation.** `guidelines` is a level of `eval-run.mjs --levels`, so you see whether agents build better with your guidelines.
- **In the style guide.** Each component's rating sits in its Documentation area, and the whole document's on the Health page beside AI readiness.

### Figma quota

A Figma seat has a limited number of API calls a day or a month.

- Each refresh says how many calls it made, and asks each thing once.
- It is skipped when the Figma file has not changed since the last complete refresh (one call to check). `FIGMA_REFRESH=force` refreshes anyway.
- When Figma answers with a limit, the refresh stops at once, says how long to wait, and keeps the snapshots as they were.

Everything is advice with a clear fix. It points at the problem and never silently changes your code.

## Inside Claude Code

The engine makes the decisions, not the AI model, so it behaves the same on a small model as on a large one.

### Every request is routed

`--init` adds project hooks (`.claude/settings.local.json`, never committed). With them, each `/rms-design-system-engine` request arrives already matched to the right recipe and the exact command to run, with the words to use for what the tool cannot do. It never changes a value in Figma and never fakes a Figma refresh. The one write to Figma is the engine's own `--figma-edits` script, run only after you say yes.

### The hooks keep the rules

- A Figma snapshot is never edited by hand.
- The AI asks you before a commit, a push, a `ds-config.json` edit, or a code change you did not ask for.
- When a request needs a sentence said as it is (the Figma data was not refreshed) and the AI's reply leaves it out, the hook sends it back once to add it.
- **The AI cannot make a check pass on its own.** Accepting a difference as debt (`--baseline`, or editing `design-system-engine-baseline.json`), keeping one on purpose (`--keep`, or editing `design-system-engine-kept.json`), adding an exception to `design-system-engine-map.mjs`, or replacing an approved picture in `.design-system-engine-refs/` waits for you, unless your latest message asked for it. `design-system-engine-agreed.json` is written by the audit alone.

### Every UI edit is checked as it is made

After the AI edits a style, markup or component file, the hook reads only what that edit added and hands back anything the design system does not have, with the right name.

- A colour written by hand (hex, `rgb()`, `hsl()`, `oklch()` or a name like `green`), with the token that has it.
- A padding, gap, radius or font size written by hand, with the token that has the value or the nearest ones.
- A token declared nowhere, and a prop name or value a component does not take.
- In a Tailwind project, a class with a value in brackets.
- An accessibility problem it added, such as an icon-only button with no name, an image with no alt, a clickable div or a removed focus outline.
- A comment that switches a check off (`eslint-disable`, `@ts-ignore`), with the rules it names.
- An import from the library your system replaced, or from inside the system's package (`imports` in `ds-config.json`), with the import to write.
- A component put inside another the way your system never does, with where it goes instead.
- A class rule that nearly copies one of your components.

The AI fixes it before moving on. The check is silent when the edit is clean, and never flags your own components, token definitions, comments or data. `"editCheck": false` turns it off.

### Other AI tools, without hooks

Cursor, Copilot and other agents read only their own instruction file.

- `rms-design-system-engine --agent-rules` shows a short section for it (ask the engine for a component's contract before UI work, use only the system's tokens and components, run the edit check before committing). Once you say yes, it writes it into the files your project has (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, `.cursor/rules`), between markers so it is updated in place.
- `rms-design-system-engine --edit-check` runs the same check the hook makes on every UI file changed since the last commit, or the files you name, and fails when something the system does not have was added.

### A short guide, recipes on demand

The AI reads a short guide, then only the recipe the task needs (`rms-design-system-engine --recipe` lists them). Measured on 20 real requests, every one was done right on both a large and a small model, at about a fifth of the cost of the old one-file guide (results in `test/skill-evals/RESULTS.md`).

- `rms-design-system-engine --guide classic` switches to the old one-file guide, and `--guide current` switches back.
- `--remove-hooks`, or `"hooks": false` in `ds-config.json`, turns the hooks off. Projects set up before a hook existed get it on their next run.
- `DESIGN_SYSTEM_ENGINE_USAGE_LOG=1` records which recipes and commands ran, in `.design-system-engine-out/skill-usage.json`. It is local only, and nothing is ever sent anywhere.

## The files it creates

Commit the files it creates, so your whole team and CI check against the same design.

### What setup writes

Setup writes only what it can read. Before Figma is captured it cannot know which collection holds your colours or your sizes, your colour modes, or how your CSS names Figma's tokens. It lists them in `ds-config.json` (`figma.fromCapture`), and the first capture fills each one and says what it set.

It also looks beside the project for products that use the system. When the folder above holds more than 2,000 entries (a temporary or home folder), it skips that look and says so, and you name any products in `ds-config.json` → `pluginDirs`.

The CSS naming is found by trying each way on your tokens, Figma's `iconText` kept or not, camelCase split or not, and `/color` or `/default` kept (`--button-background-default-color`) or dropped.

### How Figma's values are kept

The capture keeps Figma's values as Figma resolves them.

- A token that points at a library's token is followed into the library. One whose target was deleted is reported as a broken alias.
- A colour with its own opacity keeps its alpha wherever it sits.
- A duration is kept in ms. A number token is read as seconds below 10 (0.3 is 300ms) and as ms from 10 up. A number that is not a duration (a scale, a spring's stiffness) stays a number.
- Each text style is kept under its full name, so `xl/regular` and `m/regular` stay two styles, in Figma's order, with its family.
- A text style field bound to a token takes the token's value in the mode your code's root shows (the mode `ds-config.json` sets on `root`). The value Figma keeps on the style is only the mode it last drew. The style records which variable each field binds (`vars`).
- A weight or an opacity is a plain number, never `500px`: its scopes say so, or a text style binds it as its weight.
- A collection `ds-config.json` names in `figma.collections` keeps its numbers and strings in `sizing` too, each in its root mode, so a value that is the same at every breakpoint is not lost.
- A component whose size is bound to a scale's token (`typography/s/font-size`) records the scale. Its contract uses that scale's style its weight names, else the regular one (`s/regular`).
- A collection that holds both colours and sizes keeps its colour modes' names for its sizes.

### Large Figma files

Nobody copies a value by hand. The engine writes a read-only script for one chunk at a time, small enough for the Figma tool's answer.

- `--capture-script vars 0` reads the tokens, text styles and effect styles.
- `--capture-script components sums` reads the components' checksums, then `--capture-script components next` reads the components, one call at a time. Each component is put together in Figma with the recipes' own functions: sizes, padding, gaps, colours, every variant, the props, every raw value and the variables each state is bound to.
- Every answer passes through the agent twice, read and then saved, so each one is compact and near the Figma tool's cap of 20,480 bytes:
  - A token is a short record: an alias is the token's id, a colour its hex, a number the shortest decimal that reads back to Figma's exact value.
  - The components' facts travel compressed, since they repeat their token, layer and variant names. Each read takes as many as fit.
  - On a file of about 1,900 tokens and 200 components, that is about ten calls for the tokens and twenty for the components, where it was over a hundred and over two hundred.
- The engine reads each answer back into what Figma holds, so the snapshots are the ones the full answers gave, byte for byte.
- Each answer carries a checksum Figma computed over what it holds. The components' checksums are one per component, so one added while the capture runs moves no other.
- A large file's checksums come in several pages, each short enough for the Figma tool, and a component too large for one answer comes in several.
- Answers saved before this compact form still read. When new checksums no longer match them, the import says which to read again.
- `--capture-import` checks every saved answer against it, names a chunk cut or changed while it was saved, and once all are there builds the snapshots: the structure, the props, the raw values, and the state tokens and bindings.
- A component's facts the capture does not read are kept. A component no longer in Figma is taken out, and the import names it.
- On a refresh only the checksums are asked, and only the components that changed are read again.
- Each component's motion and effects (`--figma-motion`, `--figma-effects`) are read the same way:
  - First the checksums, one per component (and one per page for the overlays its prototype opens), a page of them at a time.
  - Then only the components whose checksum the last capture did not have, as many as fit in each answer. The others are reused from what the last capture kept.
  - Each record is checked against its checksum. One cut or edited while it was saved is refused. When Figma changed after the checksums were read, the checksums are read again and nothing read is lost.
  - Each step writes the next script and says what to run. The snapshot is written once every component is held.
- No script switches Figma's page: switching it is saved with the file, so a capture that only reads would still change it.
- With figma-cli connected, the engine runs the same scripts through it, so both ways of reading Figma give the same snapshots.

### Every output says what it was built from

Every snapshot, the contracts and the style guide record the code's commit (and whether it had uncommitted changes), Figma's file version or when Figma was read, and the engine's commit.

A run whose inputs are older than those of the output already there keeps that output and says so. `--force` replaces it. A run from the same inputs, or from two branches that cannot be ordered, writes as before.

## Good to know

- **Figma stays as it is.** It only reads Figma. It tells you what to change there, and a person makes that change.
- **Reading Figma, the best way available.** [Refreshing the Figma data](commands.md#set-up) picks it for you. A `design.json` newer than the saved data first, then [figma-cli](https://github.com/silships/figma-cli) when Figma Desktop is connected to it (no API key, no rate limit, every mode), then the Figma tool of your Claude session, then the Figma API with a token. After you run `figma-cli snapshot`, the next check reads its `design.json` on its own.
- **Which TypeScript reads your components.** Your project's own, else one installed for the whole machine (a global npm folder, `NODE_PATH`, `tsc` on the PATH). Set `DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project` to use only the project's own. `DESIGN_SYSTEM_ENGINE_CHROME=none` reads the code with no browser, even where Chrome is installed.

## Environment variables

| Variable | What it does |
|---|---|
| `FIGMA_TOKEN` | Reads Figma through its API, and lets the style guide fetch Figma's images |
| `FIGMA_REFRESH=force` | Refreshes from Figma even when the file has not changed |
| `GITLAB_TOKEN` | Reads a private GitLab project (a personal access token with `read_api`) |
| `GITLAB_HOST` | The host of a company GitLab |
| `DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1` | Turns off the daily self-update |
| `DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project` | Uses only the project's own TypeScript |
| `DESIGN_SYSTEM_ENGINE_CHROME=none` | Reads the code with no browser, even where Chrome is installed |
| `DESIGN_SYSTEM_ENGINE_MIRRORS=<folder>` | Keeps every project mirror in one folder on this computer (for example `~/.cache/rms-engine/mirrors`), per host and project, instead of beside the work |
| `DESIGN_SYSTEM_ENGINE_WORKSPACE=<folder>` | Keeps the engine's own files of a GitLab project (setup, snapshots, contracts, history, hand-back, output) in that folder, per host and project, apart from the mirror of its code |
| `DESIGN_SYSTEM_ENGINE_USAGE_LOG=1` | Records which recipes and commands ran, locally |

Put tokens in a `.env` in the folder you run the engine from.
