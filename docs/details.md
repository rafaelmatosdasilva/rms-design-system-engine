# Technical documentation

This page is for developers. It explains how the engine works, how to run it, and what each check does. For everyday use in plain words, start with [Features and capabilities](features.md). What to ask in Claude Code is on the [Commands](commands.md) page.

The complete lists live in the guide Claude reads. Every option is in `reference/usage.md`, every setting in `reference/config.md` and every gate in `reference/gates.md`, with the recipes in `cookbook/` and the short guide in `rms-design-system-engine.md`.

**On this page**

- [How it works](#how-it-works)
- [Install and update](#install-and-update)
- [Run it](#run-it)
- [What it checks](#what-it-checks)
- [More checks beside the gates](#more-checks-beside-the-gates)
- [Accessibility](#accessibility)
- [Working with AI tools](#working-with-ai-tools)
- [Inside Claude Code](#inside-claude-code)
- [The files it creates](#the-files-it-creates)
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
- **A shared store can live on GitHub too.** Point a store at a GitHub repository (`{ "github": "https://github.com/<owner>/<repo>", "path": "snapshots" }`) and the engine reads it with git, the same way you clone it yourself — no second API, no token of the engine's own. Writing back to GitHub is not built yet, and the run says so rather than pretending.
- **Each commit says whose run made it.** A shared store is usually written with the team's own token, so without this every change looks like that token. The commit now carries the person who ran it as its author (the name their git uses, or `--by "<name>"`), while the token's owner stays the committer — so GitLab's roles and audit trail are untouched and you can still tell three people's runs apart.
- **No token? Your own git access is enough to read.** If you already clone your team's projects — over SSH, or with a credential helper — the engine reads the shared files that way and you need no token at all. It only does this where there is no token, so nothing changes if you have one, and it never stops to ask you for a password: if git cannot get in by itself, the run says what is missing and carries on. Writing back still needs a token, because GitLab decides what you may write from the role that token carries.
- **History without git.** The mirror has no git history, so the history the engine shows (each component's changelog, the reason a line changed, the commit an agreement records) comes through the same API. It is kept per commit in `.gitlab-history.json`, so a later run asks only for the files that moved.
- **When GitLab is down.** The run checks the mirror already there and says which commit it is.

Files the engine writes in the mirror (`ds-config.json`, snapshots, its output) are kept from one refresh to the next. Commands that only print (`--version`, `--route`, `--recipe`) never call GitLab.

### Ask in Claude Code

The easy way is to ask in plain language. Every request is on the [Commands](commands.md) page.

How a component's name is read.

- Spaces, capitals, dashes and word order do not matter, so *primary button* finds buttonPrimary.
- A word only one component has scopes the run to that one.
- A plural (*the buttons*) scopes it to every component with that word.
- A word several components share (*the button*, with buttonPrimary and iconButton) is asked about first, and nothing runs until you answer. Words for an aspect of the check (text, icon, state) never name a component.

### From the terminal

The same requests as terminal commands, for scripts and CI.

```bash
rms-design-system-engine                       # the whole design system
rms-design-system-engine --component input     # one component (or a few: input,button)
rms-design-system-engine --check-ui ui.json     # check a UI an AI tool generated against your components
rms-design-system-engine --query badge          # one component or token, names written exactly; a token says what it is for (its Figma description), a text colour also lists the surfaces it can be read on
rms-design-system-engine --component chip --baseline --findings --match radi   # accept one known difference (the chip's radius) as debt; everything else keeps failing
rms-design-system-engine --keep --component chip --match height --reason "the product needs a larger tap target"   # keep a difference on purpose, with its reason
rms-design-system-engine --only accessibility   # only the accessibility check
rms-design-system-engine --only parity          # every check against Figma, without accessibility
rms-design-system-engine --only 3               # one gate by number, or by name: --only "token values", --only states,props
```

- `--only` runs that part and nothing else, and the summary says so, so a part never reads as the whole system passing. A word it does not know prints the list of gates.
- `--baseline` needs the whole run.
- Every option is in `reference/usage.md` (`rms-design-system-engine --reference usage`).

## What it checks

Every run compares your code with Figma and reports in plain words. The 25 gates are listed in [Features and capabilities](features.md#the-checks). Here is what a developer needs to know about each.

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

### In the browser

- **Renders correctly in a browser.** Checked on the real result, not just the code on paper. A component the page holds but does not draw on load (in a closed panel) is measured from its sample markup, the rule's `probe`.
- **What this audit covered.** So you can see nothing slipped through.

### Every difference in one list

A full audit writes `.design-system-engine-out/differences.md` and `differences.json`.

- Each difference between Figma and the code, grouped by the component it names.
- Marked new when the last run did not have it. One whose line number only moved is not new.
- Each check that did not run is named at the top, so a difference it would have found is never mistaken for a pass.
- Lines that only point at a difference (a Figma link, who last changed it, what was skipped) stay in the audit and out of the list.

Under its verdict, the summary of a full audit counts the components that pass, drift (an open difference) and were not checked, with the names when there are few. Beside them, `findings.json` holds every finding of every check as one record, with its rule in plain words, its evidence and its verdict.

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

Nothing is applied until you ask.

### Product screens

The screen capture (`--figma-screens`, read only) records where each instance sits on the screens `ds-config.json` names (`frames` and `screens`). Each product's built page (`ui.html` beside its source, else `<product>/ui.html`) is opened at each screen's width, height and colour mode, and compared in reading order.

- **What is compared.** Which components and how many, their order, the space between neighbours (more than 2px apart) and whether the ones that line up in Figma line up on the page.
- **Who is a neighbour.** Only components in the same scope, placed in one component's slots or on the screen itself. A component inside another and outside its slots is that component's own part, left to its own check.
- **Lists.** Three or more of one component are compared by whether they are there and where the first item sits. The space after a list is not compared.
- **Free space in a row.** A gap wider than any the screen's layouts use is allowed 2% of what sits before it, since text draws slightly wider or narrower in Chrome than in Figma.
- **Another state.** A page that lacks more than a third of a screen's components (at least three) opens in another state. It is listed as not compared, with the way to fix it, a `setup` script on the screen's entry (inline, or a file path such as `screens/results.js`).
- **Large answers.** One answer from Figma holds at most 20 KB. The capture keeps a list to its first three items, takes as many screens as fit, and writes the script for the rest with a NEXT line until every screen is read.

### Mode combinations

The collections that switch (a colour mode by media, class or attribute, a sizing mode by breakpoint) are combined, up to 64 combinations (`🎛`). Each is set at once on a page holding only the theme, and every root token is read. A token that differs from Figma's value only in that combination is listed with the combination (`Dark with Phone`), and so is a text and background pair that falls below its WCAG ratio only there. They go to the Tasks page under The system.

### Values written by hand

The census (`🧮`) counts each colour, spacing, radius, font size, duration, layer and shadow a token should carry, with the token to use when one has that value, the files that guess most first. `rms-design-system-engine --census` lists each one and keeps the count, so it only falls. A file with more than before fails the run.

## Accessibility

The check is against WCAG 2.2 at level A and AA. axe-core's rules run in the same check, and every control is tried hovered, focused and pressed, so it is the whole check in one run. Every problem comes with its fix in plain words.

### Two parts

- **From the code, always.** No browser and no page needed. It finds a button or link with only an icon and no label, an image whose alt is a file name, a removed focus outline, a mouse-only control, a hidden element that still takes focus, a misspelled `aria-*`, a page with no language or no main heading, zoom blocked and animations with no reduced-motion option. `"a11yStatic": false` turns this part off.
- **In the browser, when a page can be opened.** It goes deeper. A dialog or menu that Escape does not close, or that leaves focus somewhere other than the control that opened it. A modal dialog that lets Tab leave it. A tip a tap never shows. A message that appears with nothing said to a screen reader. A state lost in high-contrast mode. Variants told apart only by a colour some people cannot see.

### Contrast

- Measured against what is really painted behind each text, the layers at its centre in paint order, so text over a sibling or a `::before` is measured on that.
- A text colour is checked against its background token by name (`badge/label/warning` on `badge/background/warning`).
- Where the code paints the background as a tint (a `color-mix` or an opacity), only the rendered contrast decides. A tint is measured in every colour mode over each surface the system defines (Figma colour tokens with `/surface/` in the name, or `a11y.surfaces`), and the worst is reported with its surface.
- The pairs follow what Figma draws. The capture records, for each text and icon colour, the fill of the layer right under it.

### Target size

Measured by the WCAG circle in every mode, at the page's own width and again on a 320 pixel screen, where a control that shrinks is caught (`320px wide`).

### Focus

A focus outline taken off a class counts as put back when a more specific rule shows focus on every element the class is put on (`button:focus-visible` for a class used only on buttons).

### Products' pages

Run on the style guide, it also opens each product's built page whole, with every rule, axe-core's heading order and landmarks among them. On a whole page the Tab walk also says when the focus goes back up the page within a column (2.4.3) and when it lands on a control no one can see (2.4.7). `a11y.products: false` leaves the products out.

### How sure each finding is

- **Blocker.** Measured on the page against WCAG 2.1 A or AA.
- **Warning.** Read from the code, a contract or a Figma note, and can be wrong.
- **Advisory.** Beyond AA, or for a person to judge.

The check ends with one line, `Verdict: 1 blocker · 2 warnings · 1 advisory · WCAG 2.1 AA`. A must-pass check (`"a11yStrict": true`) never stops on an advisory.

## Working with AI tools

### What it writes for agents

`contracts/llms.txt` says what to use, not only what exists. It opens by telling an agent three things.

- The design system is part of the project.
- Build nothing by hand that a component covers.
- Ask `--query` before guessing a name.

**It also notices when an agent did not read.** `--catalog` remembers which components' cards it handed over, and `--check-ui` says which components the generated page used without one. It is a warning, never a refusal — a card can reach an agent another way — and a project where nothing has been handed over yet says nothing at all rather than flagging everything. Agents that skip a component's card are where most layout and prop mistakes start, so this names the cause instead of the symptoms.

Then it says which source decides when two disagree. The goal of the people who use the product first, then verified research, then the system's documented standards, then accepted past decisions, then general heuristics, with this system's own source named at each level and WCAG 2.2 AA as the floor. It stays small enough to read whole. For a large system the full catalog stays in `catalog.json`.

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
- No script switches Figma's page: switching it is saved with the file, so a capture that only reads would still change it.
- With figma-cli connected, the engine runs the same scripts through it, so both ways of reading Figma give the same snapshots.

### Every output says what it was built from

Every snapshot, the contracts and the style guide record the code's commit (and whether it had uncommitted changes), Figma's file version or when Figma was read, and the engine's commit.

A run whose inputs are older than those of the output already there keeps that output and says so. `--force` replaces it. A run from the same inputs, or from two branches that cannot be ordered, writes as before.

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
| `DESIGN_SYSTEM_ENGINE_USAGE_LOG=1` | Records which recipes and commands ran, locally |

Put tokens in a `.env` in the folder you run the engine from.
