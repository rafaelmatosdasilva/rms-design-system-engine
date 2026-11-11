# Setup

How to install the engine, keep it up to date and run it, what it adds to Claude Code and how other AI tools reach it, and the files and settings it uses. What each part promises, and what to ask for it, is on the [features page](features.md#set-up). All pages: [technical documentation](README.md).

**On this page**

- [Install and update](#install-and-update)
- [Run it](#run-it)
- [Inside Claude Code](#inside-claude-code)
- [In other AI tools](#in-other-ai-tools)
- [The files it creates](#the-files-it-creates)
- [Good to know](#good-to-know)
- [Environment variables](#environment-variables)

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

### A company's own setup

A team whose setup lives in a profile installs everything with one line: the engine, the team's own command, a work folder and the token to reach their projects.

```bash
curl -fsSL <the installer> | bash -s -- --client <team> --profile <the profile's link>
```

- **It asks for your GitLab token** and keeps it only in that folder's `.env`, read without showing on screen. Nothing is passed on the command line.
- **The folder** is `~/<team>-design-system`, or wherever `--folder` says.
- **It ends where the work starts.** Your token lives in that folder and the engine reads it from where it runs, so the installer opens Claude Code there for you — or, with no terminal to ask in, writes out the line that gets there. It never leaves you to guess which folder to open.

### Staying up to date

The skill updates itself. Once a day, before an audit, it pulls the latest version and says so in one line.

- It only does this when the install is on `main` with no local changes, and never on CI.
- `DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1` turns it off.
- `rms-design-system-engine --update` updates it by hand, and `--version` tells you if you are behind.
- A new version is published on GitHub every 50 merged changes, listing everything that went into it, so each version is a comparable piece of work rather than whatever happened to land in a given week. A security fix, or a fix for a problem that stops people, comes out at once. Your install does not wait for either: it follows the latest code once a day, so a change reaches you the day after it is merged. Watch the repository (**Watch → Custom → Releases**) to hear about each version.
- `rms-design-system-engine --doctor` checks the install, axe-core included. The install fetches axe-core, so the first accessibility check needs no network.

Keep a single copy. Link anything that needs the skill's files to `~/.claude/skills/rms-design-system-engine`, the folder that updates itself, instead of keeping a clone of your own.

## Run it

### Set up a project

The first time in a project, set it up once. It asks a couple of quick questions.

It writes your `ds-config.json`. A full example of its settings is in [ds-config.example.json](ds-config.example.json), and every setting is explained in `reference/config.md`.

```bash
cd my-project
rms-design-system-engine --init
```

Setup ends with a first result, so you see what the engine is for before learning anything else:

- **One component, checked.** The one Figma and your code pair most fully, compared with Figma (`--first-result`, or `--first-result <component>` for another).
- **Its three main findings.** What fails first, one per check, each with what to do and who does it.
- **What to ask next.** Three requests to try, such as showing that component in the style guide.
- With no Figma data yet, it says to run the first audit, which reads Figma, then shows the first result.

### Tokens your product loads at runtime

Some systems do not declare their token values in a file in the repository: the product fetches a stylesheet per mode as it starts (`light_desktop.css`, `dark_phone.css`). Setup downloads every one it can reach and merges them into one local file, `src/styles/tokens.hosted.css`, each mode in its own block, and `paths.themeCSS` in `ds-config.json` names it.

Everything the engine measures is compared against those values, so that one file matters more than any other:

- **The address is kept.** `paths.themeCSSFrom` records where the stylesheets came from. One mode's address is enough — the engine asks for the rest by itself.
- **A run that measures finds it gone and takes it again.** The file is the engine's own, so it rebuilds it rather than measuring against nothing. A command that reads no token values (writing a CI job, adding a guidelines link) is not held up by it.
- **A run that cannot take it again stops.** Without the token values, every token reads as undeclared and every component as different from Figma: a page that says your system is broken when nothing is. The run says which file is missing instead.
- **A system built from Figma is exempt.** When your tokens are written from Figma (`build: true`), the file they go into is not there until they are written, and the gate for it already lists what to write.
- **Ask for it any time** ([ask in Claude Code](features.md#set-up)), for instance when the hosted values changed and you want them now.

A file **you** named in `paths.themeCSS` is yours, not the engine's: if it is missing, the run says so and changes nothing.

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
- **A Figma read is sent at once.** When Figma is read again (`--refresh-figma`, `--from-figma-cli`, or a whole capture through the session's Figma tool), the snapshots go to the team's snapshots store in the same run, so everyone's next run reads them and the style guide's History lists the read. `--keep-snapshots` keeps them in this folder; `--refresh-snapshots` sends them later.
- **A shared store can live on GitHub too.** Point a store at a GitHub repository (`{ "github": "https://github.com/<owner>/<repo>", "path": "snapshots" }`) and the engine reads it with git, the same way you clone it yourself — no second API, no token of the engine's own. Writing back works the same way: there is no second API and no token of the engine's own, so what you may push is what GitHub already lets you push — your key, the branch's protection, your role.
- **Each commit says whose run made it.** A shared store is usually written with the team's own token, so without this every change looks like that token. The commit now carries the person who ran it as its author (the name their git uses, or `--by "<name>"`), while the token's owner stays the committer — so GitLab's roles and audit trail are untouched and you can still tell three people's runs apart.
- **No token? Your own git access is enough to read.** If you already clone your team's projects — over SSH, or with a credential helper — the engine reads the shared files that way and you need no token at all. It only does this where there is no token, so nothing changes if you have one, and it never stops to ask you for a password: if git cannot get in by itself, the run says what is missing and carries on. **Writing works the same way.** The engine builds the commit inside that mirror and pushes it, without checking anything out, so your folders are untouched. What you may push is still your host's to decide. On GitLab, a protected branch gets a merge request instead, as it does with a token: the engine pushes to a branch of its own and asks GitLab, through its push options, to open the merge request for a Maintainer to merge. On GitHub, a protected branch refuses exactly as it would from your terminal, and the run tells you what it said.
- **History without git.** The mirror has no git history, so the history the engine shows (each component's changelog, the reason a line changed, the commit an agreement records) comes through the same API. It is kept per commit in `.gitlab-history.json`, so a later run asks only for the files that moved. A team that keeps its snapshots in a store has each read of Figma there: every refresh it sent is one commit of the store, and each component's History lists the ones that changed it, linked to that commit (kept in `.design-system-engine-out/snapshots-history.json`, each commit read once).
- **When GitLab is down.** The run checks the mirror already there and says which commit it is.

Files the engine writes in the mirror (`ds-config.json`, snapshots, its output) are kept from one refresh to the next. Commands that only print (`--version`, `--route`, `--recipe`) never call GitLab.

**Your setup apart from the code.** Set `DESIGN_SYSTEM_ENGINE_WORKSPACE` to a folder and the engine's own files (the setup, the snapshots, the contracts, the history, the hand-back, the output) live there, per host and project, instead of inside the mirror. Each run puts them into the mirror before it reads anything and takes back what it wrote when it ends, so the mirror is only a copy of the code that you can keep in a cache (`DESIGN_SYSTEM_ENGINE_MIRRORS`) or delete. The first run with the setting moves in what your mirror already holds. If a run stops before the end, nothing is lost: the next run keeps the newer copy.

### Ask in Claude Code

The easy way is to ask in plain language. Every request is on the [Commands](features.md) page.

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
rms-design-system-engine --contract-changes     # on a merge request: what it changes in each component's contract, failing on a breaking change nobody accounted for
rms-design-system-engine --code-connect-draft   # a draft Code Connect file for each component that has none, in .design-system-engine-out/code-connect-drafts
```

- `--only` runs that part and nothing else, and the summary says so, so a part never reads as the whole system passing. A word it does not know prints the list of gates.
- `--baseline` needs the whole run.
- Every option is in `reference/usage.md` (`rms-design-system-engine --reference usage`).

### Figma quota

A Figma seat has a limited number of API calls a day or a month.

- Each refresh says how many calls it made, and asks each thing once.
- It is skipped when the Figma file has not changed since the last complete refresh (one call to check). `FIGMA_REFRESH=force` refreshes anyway.
- When Figma answers with a limit, the refresh stops at once, says how long to wait, and keeps the snapshots as they were.

## Inside Claude Code

The engine makes the decisions, not the AI model, so it behaves the same on a small model as on a large one.

### Every request is routed

`--init` adds project hooks (`.claude/settings.local.json`, never committed). With them, each `/rms-design-system-engine` request arrives already matched to the right recipe and the exact command to run, with the words to use for what the tool cannot do. It never changes a value in Figma and never fakes a Figma refresh. The one write to Figma is the engine's own `--figma-edits` script, run only after you say yes.

### The hooks keep the rules

- A Figma snapshot is never edited by hand.
- The AI asks you before a commit, a push, a `ds-config.json` edit, or a code change you did not ask for.
- When a request needs a sentence said as it is (the Figma data was not refreshed) and the AI's reply leaves it out, the hook sends it back once to add it.
- **The AI cannot make a check pass on its own.** Accepting a difference as debt (`--baseline`, or editing `design-system-engine-baseline.json`), keeping one on purpose (`--keep`, or editing `design-system-engine-kept.json`), adding an exception to `design-system-engine-map.mjs`, or replacing an approved picture in `.design-system-engine-refs/` waits for you, unless your latest message asked for it. `design-system-engine-agreed.json` is written by the audit alone.
- **A lesson's answer is yours.** `--lesson-answer`, or an edit to `design-system-engine-lessons.json`, waits for your yes or no.
- **A change to the system waits for a sign-off.** An edit that adds a token to the theme or an option to a component is held until someone signs it off. The agent that made it never does: see [A second reviewer](#a-second-reviewer).

### A second reviewer

The agent that made a change to the system never signs it off. Someone else reviews it first.

- **Who made it is written down.** When the hook holds the edit, it keeps the agent's session with it (`.design-system-engine-out/held-for-sign-off.json`, the engine's own file). A change in Figma keeps who asked for it the same way.
- **A person signs it off.** `rms-design-system-engine --sign-off "<what>" --by "<who>"`, with the name the person gives.
- **The author is refused.** A sign-off is refused, with the reason, when the reviewer is the one who made the change: the same name, the same agent session, or an agent's own name where a person's goes.
- **Or a second agent reviews it.** `rms-design-system-engine --second-review "<what>"`, run from another agent session, runs the engine's checks on the change again: the edit check on what it adds, a token whose value the theme already has, an option the component already has written another way, and what a change in Figma still has to answer or breaks. It records itself as the reviewer.
- **Some changes always wait for a person.** A removal, a rename, a breaking change or one of high risk, whatever the setting.

`review` in `ds-config.json` sets who may review:

| `review.second` | Who signs it off |
|---|---|
| `"person"` (the default) | A person. A second review still runs, and its findings wait for them. |
| `"agent-or-person"` | A person, or a second agent review that finds nothing. |

The sign-offs keep who made each change and who reviewed it (`design-system-engine-signoffs.json`). `--sign-off` alone lists them, and the style guide's History shows both names on each one, and on each change in Figma.

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
- What a [lesson](creation.md#lessons-a-correction-becomes-a-guard) became a check for: a prop combination or a value a person corrected before.
- What a rule of your intent layer became a check for, once you said yes: also a prop or slot a component always has, and at most so many of a component on one screen.

The AI fixes it before moving on. The check is silent when the edit is clean, and never flags your own components, token definitions, comments or data. `"editCheck": false` turns it off.

### A short guide, recipes on demand

The AI reads a short guide, then only the recipe the task needs (`rms-design-system-engine --recipe` lists them). Measured on 20 real requests, every one was done right on both a large and a small model, at about a fifth of the cost of the old one-file guide (results in `test/skill-evals/RESULTS.md`).

- `rms-design-system-engine --guide classic` switches to the old one-file guide, and `--guide current` switches back.
- `--remove-hooks`, or `"hooks": false` in `ds-config.json`, turns the hooks off. Projects set up before a hook existed get it on their next run.
- `DESIGN_SYSTEM_ENGINE_USAGE_LOG=1` records which recipes and commands ran, in `.design-system-engine-out/skill-usage.json`. It is local only, and nothing is ever sent anywhere.

## In other AI tools

The engine is built for Claude Code, but its answers and checks work in any AI tool. Install it as usual (the installer puts it in `~/.claude/skills/rms-design-system-engine` and the `rms-design-system-engine` command on your PATH), then connect your tool one of two ways.

**What you get, and what you don't.**

- **You get** the answers about your system (each component's props, each token and what it is for), the check of a UI an AI tool built, and every audit the command line runs.
- **In Cursor and Codex you also get** the guide and the [hooks that keep the rules](#the-hooks-keep-the-rules), set up as below.
- **You don't get** the skill evaluation anywhere but Claude Code: it runs on Claude, so how well another tool follows the guide is not measured yet.

### In Cursor and Codex

Both read the guide from the project's instructions and run the same guard as Claude Code, as their own hooks. In the project, run:

```bash
rms-design-system-engine --agent-rules --write
rms-design-system-engine --install-hooks --tool cursor,codex
```

- **The guide.** The first command writes the engine's section into the instruction files the project already has, or into `AGENTS.md`, which both tools read, when it has none. A project with a `.cursor/rules` folder also gets `.cursor/rules/design-system.mdc`. To choose the file yourself, use `--write=AGENTS.md`. It tells the agent to route each request first (`--route`) and follow what it prints, the same recipes Claude Code follows.
- **The guard.** The second writes `.cursor/hooks.json` and `.codex/hooks.json`. Name only the tools you use. A project that already has a `.cursor` or `.codex` folder gets them with every `--install-hooks`. Hooks you wrote there are kept, and both files are added to `.gitignore`, since they hold this machine's path to the engine.
- **Trust them once.** Cursor runs a project's hooks in a trusted workspace. Codex runs them once you trust them: open `/hooks` in Codex and trust each one.

**Where they differ from Claude Code.**

- **Neither can ask you before a file edit.** Where Claude Code would ask, Cursor and Codex hold the edit and tell the agent why. Ask for the change in your own words and the agent can try again. Cursor still asks you before a command, such as a push.
- **Cursor routes from the guide, not the hook.** Its hooks cannot add the route to your message, so the line in `AGENTS.md` does it.
- **Not measured yet.** The skill evaluation runs on Claude, so how reliably each tool follows the guide is still to be measured.

### Another tool with a terminal

Windsurf, Gemini CLI and VS Code's agent, like Cursor and Codex, can run commands, so they use the command line directly, as in [from the terminal](#from-the-terminal). Add this to the tool's own instructions for the project (`AGENTS.md`, `.cursor/rules`, `GEMINI.md` or `.github/copilot-instructions.md`), so the agent asks the system before it guesses:

```text
This project has a design system checked by rms-design-system-engine.
Before using a component or token, run: rms-design-system-engine --query <its name>
After building a UI, check it: rms-design-system-engine --check-ui <the file>
Never invent a component, prop or token the query does not list.
```

### A tool through MCP

A tool with no terminal, or one you would rather connect through MCP, starts the engine's MCP server. It answers with four tools: `query`, `catalog`, `check_ui` and `summary` (what each returns is in `reference/usage.md`, under The same answers through MCP). In each snippet, replace `<engine>` with the install folder (`~/.claude/skills/rms-design-system-engine` written out in full, since these files do not expand `~`) and `<project>` with your project's folder.

Claude Desktop (`claude_desktop_config.json`), Cursor (`.cursor/mcp.json`), Windsurf (`~/.codeium/windsurf/mcp_config.json`) and Gemini CLI (`.gemini/settings.json`) share one format:

```json
{
  "mcpServers": {
    "design-system": {
      "command": "node",
      "args": ["<engine>/mcp.mjs", "--project=<project>"]
    }
  }
}
```

VS Code (`.vscode/mcp.json`):

```json
{
  "servers": {
    "design-system": {
      "type": "stdio",
      "command": "node",
      "args": ["<engine>/mcp.mjs", "--project=<project>"]
    }
  }
}
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.design-system]
command = "node"
args = ["<engine>/mcp.mjs", "--project=<project>"]
```

Claude Code itself, when you want the server there too:

```bash
claude mcp add design-system -- node ~/.claude/skills/rms-design-system-engine/mcp.mjs --project="$PWD"
```

Restart the tool, then ask it something only the engine knows, such as "Use the design-system query tool to look up the button", to check it is connected.

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
- Each component's Figma page comes from the checksums. When the answers name none (answers saved before the checksums did), the page the file already held is kept, and the import names once the components left with none, whose specs then name no page.
- On a refresh only the checksums are asked, and only the components that changed are read again.
- No script switches Figma's page: switching it is saved with the file, so a capture that only reads would still change it.
- With figma-cli connected, the engine runs the same scripts through it, so both ways of reading Figma give the same snapshots.

### Every output says what it was built from

Every snapshot, the contracts and the style guide record the code's commit (and whether it had uncommitted changes), Figma's file version or when Figma was read, and the engine's commit.

A run whose inputs are older than those of the output already there keeps that output and says so. `--force` replaces it. A run from the same inputs, or from two branches that cannot be ordered, writes as before.

### Where the engine may write, and where it must never

Until now the answer was the same in every project, and it was always the most cautious one: write a script, show it, ask again. One setting in `ds-config.json` now says it per place, and the whole engine reads the same answer:

| Place | What it holds |
|---|---|
| The design file | What Figma shows: a role, a name, an annotation, a component |
| The code the engine generated | The tokens, the contracts, the style guide |
| The engine's own files | The authored contract, the structure contract's notes, the kept differences |

**Your product's code is not on that list, and never will be.** The engine does not change code people wrote. What it finds there comes back as a patch for a person to apply and as the difference on that component's page in the style guide. At most it writes the intent layer; everything else it flags.

Each gets **yes** (write it, and say what changed), **ask** (show the exact change and wait for a yes, every time) or **no** (never: the change goes on the Status page, for whoever owns that place). A place with no answer is asked about once, and the answer is recorded, so every session and every run read the same one. `rms-design-system-engine --writes` shows them; `--writes figma ask` sets one.

Two things the setting cannot override. On CI there is nobody to answer, so **ask** becomes **no**. And CI never writes the design file or the product's code, whatever the setting says: a run nobody is watching changing what people wrote is how a team stops trusting the engine.

A project that says never gets the list of Figma changes and no script to run. A script nobody may run is a loaded gun left on the table.

## Good to know

- **Figma stays as it is.** It only reads Figma. It tells you what to change there, and a person makes that change.
- **Reading Figma, the best way available.** [Refreshing the Figma data](features.md#set-up) picks it for you. A `design.json` newer than the saved data first, then [figma-cli](https://github.com/silships/figma-cli) when Figma Desktop is connected to it (no API key, no rate limit, every mode), then the Figma tool of your Claude session, then the Figma API with a token. After you run `figma-cli snapshot`, the next check reads its `design.json` on its own.
- **Which TypeScript reads your components.** Your project's own, else one installed for the whole machine (a global npm folder, `NODE_PATH`, `tsc` on the PATH). The global folder is found even when `npm` is not on the PATH, as in an agent's shell that skips the profile setting up nvm or Volta. Set `DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project` to use only the project's own. `DESIGN_SYSTEM_ENGINE_CHROME=none` reads the code with no browser, even where Chrome is installed.

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
| `DESIGN_SYSTEM_ENGINE_FIGMA_CLI=none` | Never asks figma-cli, even where it is installed and Figma answers |
| `DESIGN_SYSTEM_ENGINE_MIRRORS=<folder>` | Keeps every project mirror in one folder on this computer (for example `~/.cache/rms-engine/mirrors`), per host and project, instead of beside the work |
| `DESIGN_SYSTEM_ENGINE_WORKSPACE=<folder>` | Keeps the engine's own files of a GitLab project (setup, snapshots, contracts, history, hand-back, output) in that folder, per host and project, apart from the mirror of its code |
| `DESIGN_SYSTEM_ENGINE_USAGE_LOG=1` | Records which recipes and commands ran, locally |

Put tokens in a `.env` in the folder you run the engine from.

### When a host refuses

A refusal used to say only that something failed, and one status code has several different fixes behind it. Each one now names the permission that is missing and where it is given:

| Host | What the token needs | Where you add it |
|---|---|---|
| Figma | `file_content:read` (and `file_dev_resources:read` for Code Connect) | figma.com → Settings → Security → Personal access tokens |
| GitHub | Read access to the repository (Contents: Read) | github.com → Settings → Developer settings → Personal access tokens |
| GitLab | The `read_api` scope | your GitLab → Preferences → Access tokens |
| Notion | Read content, **and the page shared with the integration** | notion.so/profile/integrations → your integration → Capabilities |
| Confluence | Read permission for the space | id.atlassian.com → Security → API tokens |

Three things look alike and are not, so each is said apart:

- **401** — the token is wrong, expired or revoked. Reissue it.
- **403** — the token is fine; it lacks the permission, or the thing was never shared with it. Notion's most common cause is the second: an integration cannot see a page until someone adds it under **Connections**.
- **404** — the link may be wrong, *or* it is private and your token cannot reach it. A private page with no access looks exactly like one that does not exist, so both are named rather than sending you to check a link that was right.

The token itself is never printed.
