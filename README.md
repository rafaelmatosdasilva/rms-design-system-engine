# rms-figma-code-parity

Checks that your code actually matches your design system: the real colours, sizes, fonts and component rules from Figma, not just whether it looks about right. It tells you exactly what is out of sync and where to fix it. It works the same on code you wrote and on code an AI wrote.

## How it works

It is not a "does this look like Figma?" screenshot comparison. It reads what your design system really defines in Figma (the tokens, and each component's parts, states and options) and checks your code against that, precisely. It also writes those facts out in a simple form, so AI tools build with the real design system instead of guessing.

It reads your code the same careful way it reads Figma. Once per run it opens your pages in a browser and records what the code really produces: every token in every mode, each component's sizes and states, its props, icons, markup and which components sit inside which. Each fact says where it came from and how sure the reading is. When the tool can't read something reliably, it says so instead of blaming the design.

It also gives AI tools that generate interfaces a catalog of your real components (their options, and which components go inside which), and `--check-ui` checks what they generate against it, every time, without changing it.

## Install (once per computer)

In your terminal (the Terminal app on Mac, or Windows Terminal), paste this and press Enter:

```bash
curl -fsSL https://raw.githubusercontent.com/rafaelmatosdasilva/rms-figma-code-parity/main/install.sh | bash
```

## Update

```bash
rms-figma-code-parity --update
```

The skill updates itself: once a day, before an audit, it pulls the latest version and says so in one line. It only does this when the install is on `main` with no local changes, never on CI, and `PARITY_NO_AUTO_UPDATE=1` turns it off. `rms-figma-code-parity --update` updates it by hand, and `--version` tells you if you are behind. You never re-download.

Keep a single copy: link anything that needs the skill's files to `~/.claude/skills/rms-figma-code-parity`, the folder that updates itself, instead of keeping a clone of your own.

## Run it

First time in a project, set it up once (it asks a couple of quick questions):

```bash
cd my-project
rms-figma-code-parity --init
```

Then the easy way is to just ask, in plain language, inside Claude Code:

- *"run the parity on the whole design system"*: checks everything
- *"run the parity on input"*: checks the `input` component (and its parts) and reports only that

Or from the terminal:

```bash
rms-figma-code-parity                       # the whole design system
rms-figma-code-parity --component input     # one component (or a few: input,button)
rms-figma-code-parity --check-ui ui.json     # check a UI an AI tool generated against your components
```

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
- **Component props match** Figma: the same names, defaults and choices, spelled exactly the same (`L` and `large`, or `Large` and `large`, are a difference; the finding says which code value it most likely is). The catalog tells AI tools the right name for each wrong one they are likely to guess (`error` → `danger`).
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
- **Instructions for AI agents tell the truth:** `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, Cursor and Copilot rules and skills are found on their own, and every component, prop value, token and CSS variable they name must exist. A wrong name there makes every agent that reads it build the wrong thing. Advisory; `"steering": false` in `ds-config.json` turns it off.

It also does an **accessibility** check: it flags anything that would make the design hard to use (text that is hard to read, a button with no label, something you cannot reach with the keyboard) and tells you, in plain words, how to fix it. Part of it always runs straight from the code and the CSS, with no browser and no page to open (a button with only an icon and no label, a removed focus outline, a mouse-only control, a misspelled `aria-*`); when a page can be opened, the browser check goes deeper. `"a11yStatic": false` in `ds-config.json` turns the code part off.

Everything is advice with a clear fix. It points at the problem, it does not silently change your code.

## Inside Claude Code

The engine makes the decisions, not the AI model, so it behaves the same on a small model as on a large one:

- **Every request is routed by the engine.** `--init` adds project hooks (`.claude/settings.local.json`, never committed). With them, each `/rms-figma-code-parity` request arrives already matched to the right recipe and the exact command to run, with the words to use for what the tool cannot do (it never changes Figma, and never fakes a Figma refresh).
- **The hooks also keep the rules.** A Figma snapshot is never edited by hand, and the AI asks you before a commit, a push, a `ds-config.json` edit, or a code change you did not ask for.
- **Short guide, recipes on demand.** The AI reads a short guide, then only the recipe the task needs (`rms-figma-code-parity --recipe` lists them). Measured on 20 real requests: every one done right on both a large and a small model, at about a fifth of the cost of the old one-file guide (results in `test/skill-evals/RESULTS.md`).
- **Going back is one command.** `rms-figma-code-parity --guide classic` switches to the old one-file guide, `--guide current` switches back.
- `rms-figma-code-parity --doctor` checks the install. `--remove-hooks` (or `"hooks": false` in `ds-config.json`) turns the hooks off. Projects set up before the router existed get it on their next run.
- Optional and local only: `PARITY_USAGE_LOG=1` records which recipes and commands ran in `.parity-out/skill-usage.json`. Nothing is ever sent anywhere.

## That's it

Commit the files it creates so your whole team and CI check against the same design. The deeper setup and every option live in the full guide.

## License

[MIT](LICENSE) © Rafael Matos da Silva. Free to use, change and share. Just keep the copyright line.
