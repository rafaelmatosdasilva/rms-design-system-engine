# Technical details

The [README](../README.md) covers everyday use in plain words. This page is for developers: how the engine works, every check in detail, and the options behind them. The full guide the AI reads is `rms-design-system-engine.md`, with its recipes in `cookbook/` and its reference in `reference/`.

## How it works

It is not a "does this look like Figma?" screenshot comparison. It reads what your design system really defines in Figma (the tokens, and each component's parts, states and options) and checks your code against that, precisely. It also writes those facts out in a simple form, so AI tools build with the real design system instead of guessing.

It reads your code the same careful way it reads Figma. Once per run it opens your pages in a browser and records what the code really produces: every token in every mode, each component's sizes and states, its props, icons, markup and which components sit inside which. Each fact says where it came from and how sure the reading is. When the tool can't read something reliably, it says so instead of blaming the design.

It also gives AI tools that generate interfaces a catalog of your real components (their options, and which components go inside which), and `--check-ui` checks what they generate against it, every time, without changing it.

## Updates

```bash
rms-design-system-engine --update
```

The skill updates itself: once a day, before an audit, it pulls the latest version and says so in one line. It only does this when the install is on `main` with no local changes, never on CI, and `DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1` turns it off. `rms-design-system-engine --update` updates it by hand, and `--version` tells you if you are behind. You never re-download.

Keep a single copy: link anything that needs the skill's files to `~/.claude/skills/rms-design-system-engine`, the folder that updates itself, instead of keeping a clone of your own.

## Run it

First time in a project, set it up once (it asks a couple of quick questions):

```bash
cd my-project
rms-design-system-engine --init
```

Then the easy way is to just ask, in plain language, inside Claude Code:

- *"check the whole design system against Figma"*: checks everything
- *"check input"*: checks the `input` component (and its parts) and reports only that
- *"which props does the badge take?"*: answers from the design system, names written exactly

Or from the terminal:

```bash
rms-design-system-engine                       # the whole design system
rms-design-system-engine --component input     # one component (or a few: input,button)
rms-design-system-engine --check-ui ui.json     # check a UI an AI tool generated against your components
rms-design-system-engine --query badge          # one component or token, names written exactly; a text colour also lists the surfaces it can be read on
rms-design-system-engine --component chip --baseline --findings --match radi   # accept one known difference (the chip's radius) as debt; everything else keeps failing
rms-design-system-engine --only accessibility   # only the accessibility check
rms-design-system-engine --only parity          # every check against Figma, without accessibility
rms-design-system-engine --only 3               # one gate by number, or by name: --only "token values", --only states,props
```

`--only` runs that part and nothing else, and the summary says so, so a part never reads as the whole system passing. A word it does not know prints the list of gates. `--baseline` needs the whole run. Every option is in `reference/usage.md` (`rms-design-system-engine --reference usage`).

## What it checks

Every run compares your code against Figma and reports it in plain words:

- **Data is up to date:** you are checking against today's Figma, not an old copy.
- **Figma frame unchanged:** the design still looks like the version you approved.
- **Token values** match: colours, sizes and fonts, in every mode (light and dark).
- **Tokens used in** screens exist in the code: nothing a screen uses is missing.
- **Every mode is** covered: things that should change between light and dark really do.
- **Exception lists are** valid: your "ignore this" notes still point at real things.
- **No invented CSS** variables: every variable traces back to a real Figma token.
- **Docs tell the** truth: they mention only things that actually exist.
- **No invented text** casing: no forced UPPERCASE the design never asked for.
- **No hand-built DS** components: a screen uses the real component, not a hand-styled copy.
- **Clean CSS:** nothing unused, nothing that contradicts Figma. A focus ring's outline, which Figma has no value for, is listed apart, not failed.
- **Nested components keep** their own styles: one component's look does not leak into another.
- **Structure:** the right height, spacing and corners, from the design.
- **All states are** built: hover, disabled, selected and the rest, each with the right values.
- **Component props match** Figma: the same names, defaults and choices, spelled exactly the same. `Size` and `size` are two prop names (a slot's name too), and the finding shows the letters that differ (`letter case S → s`). `L` and `large`, or `Large` and `large`, are two values; the finding says which code value it most likely is. The catalog tells AI tools the right name for each wrong one they are likely to guess (`error` → `danger`).
- **Sub-components match Figma:** the parts Figma nests are the ones the code uses.
- **Templates compose the** right components: each page uses the components Figma composes.
- **Markup:** ids, classes and icons match, and every control the design shows is built.
- **Required pieces are** in place: icon slots, component slots and form controls.
- **Icons:** from the shared set, drawn the same as Figma.
- **Transitions:** the durations and easings from the design.
- **Motion:** movement values match Figma, when your design defines them.
- **Shadows and blurs:** match Figma, when your design defines them.
- **Renders correctly in** a browser: checked on the real result, not just the code on paper.
- **What this audit** covered: so you can see nothing slipped through.
- **Instructions for AI agents tell the truth:** `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, Cursor and Copilot rules and skills are found on their own, and every component, prop value, token and CSS variable they name must exist, with each prop written the way the code writes it (`Tone=` where the code has `tone` is flagged). A wrong name there makes every agent that reads it build the wrong thing. A file that only says what not to use is noted too: saying the design system is installed and its components are the ones to use is what moves agents onto it. Advisory; `"steering": false` in `ds-config.json` turns it off.

**Every difference in one list.** A full audit writes `.design-system-engine-out/differences.md` and `differences.json`: each difference between Figma and the code, grouped by the component it names, marked new when the last run did not have it (one whose line number only moved is not new), next to where the hand-back says how each side would change. Lines that only point at a difference stay in the audit and out of the list: a Figma link, who last changed it, what was skipped or how much was compared. Each check that did not run is named at the top, so a difference it would have found is never mistaken for a pass. The summary points to it after every run; the style guide, when there is one, shows each component's own.

**Every mode, every collection.** A collection whose values change with a mode (a sizing collection per breakpoint) is captured in every mode and checked per mode even when `ds-config.json` names no collections: Gate [5] finds where the theme sets each mode (an `@media`, a `[data-…]` or class block), and a mode the code never implements fails with every value it owes. In the style guide, such a mode is switched with the theme's own values for it (the media query's block, under `[data-size]`), so a phone size can be seen on a desktop and a desktop size on a phone; the page starts in the mode the device gets, and the switch lists what the mode changes. A preview never uses an instance hidden at rest (a hidden class or attribute, an inline `display: none`, or a class whose rule hides it).

When the **products live in their own repositories**, checked out beside the design system, `ds-config.json` names them (`pluginDirs`, or `codeRoots` for any other folder) and every scan reads their code as the project's own: a variable or class only a product uses is not unused, and a value a product writes by hand is still found.

It also spots a **primitive written by hand**, once the library owner declares which styling means which component (`primitives` in `ds-config.json`): a `<span>` given the body text style and the secondary colour is `<Text size="medium" color="secondary">`, and a flex `<div>` with the system's gap is its `Stack`. No token check sees these, their values are the system's own; the audit lists each, the edit check hands it back when an AI adds one, and `llms.txt` gives generators the table.

It also spots **workarounds around a component**: a screen that lays its own control over a component (a clear button over a text field, actions over a list row) is doing what the component cannot, so it is reported to the design system as a missing slot or prop, not as the screen's mistake. `"workarounds": false` in `ds-config.json` turns it off.

In a **Tailwind** project each component's own classes are compared with what Figma states for it (`h-9` against a 36px height, `px-3 py-2` against its padding tokens, `rounded-control`, `bg-action-primary`), and a difference names the class to write. It also reads the classes with a value in brackets (`rounded-[4px]`, `bg-[#b42318]`), which step outside the theme where no CSS rule is written: when your `@theme` has the same value it names the utility to write (`rounded-control`, `bg-status-danger`), otherwise it says the value is not in the design system. `"tailwind": false` in `ds-config.json` turns it off. `--init` sees a Tailwind theme and sets `"namingConvention": { "preset": "tailwind" }` under `figma` in `ds-config.json`; with it, Figma's token names are matched to the theme's own (`surface/base/color` to `--color-surface-base`, `space/2` to `--spacing-2`), and a theme variable used through its utility (`bg-action-primary`) counts as used.

It also checks the **Figma file itself**, for whoever keeps it: a colour, radius, padding, gap or text with no variable or style, an instance detached from its component, a variant with no auto layout, a component with no description, an instance whose layer spells its component's name another way (`Button Tertiary` for `buttonTertiary`, which an agent reading the file would copy). Code can only match what Figma states. Advice only; the parity never changes a value in Figma. `"figmaHygiene": false` in `ds-config.json` turns it off.

It also does an **accessibility** check: it flags anything that would make the design hard to use (text that is hard to read, a button with no label, something you cannot reach with the keyboard) and tells you, in plain words, how to fix it. Part of it always runs straight from the code and the CSS, with no browser and no page to open (a button or link with only an icon and no label, an image whose alt is a file name, a removed focus outline, a mouse-only control, a hidden element that still takes focus, a misspelled `aria-*`, a page with no language or no main heading, zoom blocked, animations with no reduced-motion option); when a page can be opened, the browser check goes deeper (among others, a dialog or menu that Escape does not close, or that leaves the focus somewhere other than the control that opened it). `"a11yStatic": false` in `ds-config.json` turns the code part off.

Does your guidance help your AI tools? `node eval-run.mjs --levels bare,steering,parity` runs the same generation tasks three ways: with the prompt alone, with your own instruction files (`AGENTS.md`, `CLAUDE.md`, rules), and with what this skill writes for agents (`contracts/llms.txt`). It scores each by the same checks (design-system tokens and classes, accessibility) and says what each kind of guidance adds or costs against the prompt alone. A case says the component it expects (`"component": "chip"`), and the agent never sees it: the prompt says the intent, and a result that builds its own instead of using the component fails, because a screen built by hand has nothing to get wrong on the other checks and would otherwise look like the best result. A prompt that names a component is flagged before the run, since its score would measure reading the prompt, not finding the component. When the results are `.tsx` or `.jsx` and a TypeScript compiler is at hand, each one is also type-checked against your components' props, written the way your code writes them: `tone="error"` where the badge takes neutral, success or danger is a type error, as it would be in your build (`"evals": { "compile": false }` turns it off). It needs your own generate command in `ds-config.json` (`evals.generate.cmd`), spends your model tokens, and never gates the repo; with `--ci` it fails when a run is worse than the last one (zero-fix down more than 5 points, or more avoidance, type errors or accessibility findings).

What it writes for agents says what to use, not only what exists: `contracts/llms.txt` opens by telling an agent that the design system is part of the project, to build nothing by hand that a component covers, and to ask `--query` before guessing a name. It stays small enough to read whole: for a large system the full catalog table stays in `catalog.json`.

It keeps to your **Figma quota**. A Figma seat has a limited number of API calls a day or a month, so each refresh says how many calls it made, asks each thing once, and is skipped when the Figma file has not changed since the last complete refresh (one call to check; `FIGMA_REFRESH=force` refreshes anyway). When Figma answers with a daily or monthly limit, the refresh stops at once, says how long Figma asks to wait, and keeps the snapshots as they were, instead of spending more calls on retries.

Everything is advice with a clear fix. It points at the problem, it does not silently change your code.

## Inside Claude Code

The engine makes the decisions, not the AI model, so it behaves the same on a small model as on a large one:

- **Every request is routed by the engine.** `--init` adds project hooks (`.claude/settings.local.json`, never committed). With them, each `/rms-design-system-engine` request arrives already matched to the right recipe and the exact command to run, with the words to use for what the tool cannot do (it never changes a value in Figma, and never fakes a Figma refresh). The one write to Figma is the engine's own `--figma-edits` script (a component's role the code already states), run only after you say yes.
- **The hooks also keep the rules.** A Figma snapshot is never edited by hand, and the AI asks you before a commit, a push, a `ds-config.json` edit, or a code change you did not ask for.
- **The answer says what you need to hear.** When a request needs a sentence said as it is (the Figma data was not refreshed, the tool does not change that in Figma) and the AI's last reply leaves it out, the hook sends it back once to add it.
- **The AI cannot make a check pass on its own.** Accepting a difference as known debt (`--baseline`, or editing `design-system-engine-baseline.json`), adding an exception to `design-system-engine-map.mjs`, or replacing an approved picture in `.design-system-engine-refs/` waits for you, unless your latest message asked for it. `design-system-engine-agreed.json`, the record of what Figma and the code last agreed on, is written by the audit alone.
- **Every UI edit is checked when it is made.** After the AI edits a style, markup or component file, the hook reads only what that edit added and hands back, with the right name, anything the design system does not have: a colour written by hand (and the token that has it), a padding, gap, corner radius or font size written by hand (and the token that has the value, or the nearest ones), a CSS variable declared nowhere, a prop value or prop name a component does not take, in a Tailwind project a class with a value in brackets, an accessibility problem it added (a button with only an icon and no name, an image with no alt, a clickable div, a focus outline removed, a misspelt `aria-*`), each with its fix, and a comment that switches a check off (`eslint-disable`, `@ts-ignore` and the like), with the rules it names. The AI fixes it before moving on, whether or not it thought to ask. Silent when the edit is clean; your own components, the browser's own attributes, token definitions, comments and data are never flagged. `"editCheck": false` in `ds-config.json` turns this part off.
- **Short guide, recipes on demand.** The AI reads a short guide, then only the recipe the task needs (`rms-design-system-engine --recipe` lists them). Measured on 20 real requests: every one done right on both a large and a small model, at about a fifth of the cost of the old one-file guide (results in `test/skill-evals/RESULTS.md`).
- **Going back is one command.** `rms-design-system-engine --guide classic` switches to the old one-file guide, `--guide current` switches back.
- `rms-design-system-engine --doctor` checks the install. `--remove-hooks` (or `"hooks": false` in `ds-config.json`) turns the hooks off. Projects set up before the router, the edit check or the final check existed get them on their next run.
- Optional and local only: `DESIGN_SYSTEM_ENGINE_USAGE_LOG=1` records which recipes and commands ran in `.design-system-engine-out/skill-usage.json`. Nothing is ever sent anywhere.

## The files it creates

Commit the files it creates so your whole team and CI check against the same design. The deeper setup and every option live in the full guide.
