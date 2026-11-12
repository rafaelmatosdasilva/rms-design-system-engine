# Collaboration

How the engine publishes the living style guide and the playground. What each part promises, and what to ask for it, is on the [features page](features.md#collaboration). All pages: [technical documentation](README.md).

**On this page**

- [Publish a living style guide](#publish-a-living-style-guide)
- [Try components in a playground](#try-components-in-a-playground)

## Publish a living style guide

[The style guide](features.md#publish-a-living-style-guide) is one page with every token and component, from what Figma and the code agree on, in `.design-system-engine-out/styleguide/index.html`.

**[See an example](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/)**, the RMS Design System's style guide, built by this engine and published by that design system, so it shows what the engine makes today.

- **One component at a time.** A page for one component checks it first, against Figma and for accessibility, then shows it and the components it nests, `styleguide/modal.html`.
- **One link for the team.** Publishing writes the CI job that publishes it on every push, to GitHub Pages or GitLab Pages, so everyone opens the same page built from what is merged. A local run stays a preview.
- **It updates on its own.** The job builds again in three cases, so a change anywhere reaches the page:
  - On every push to the design system's default branch.
  - At once, when the intent layer's own repository says it changed. Publishing writes that repository's small job to `.design-system-engine-out/intent-layer-job.yml`, with the token to add once.
  - Every hour, when the intent layer, a store, the Figma file or the engine moved since the last build. An hour with nothing new stops in seconds. On GitLab, add the hourly schedule once (Build → Pipeline schedules).
- **A guide published to your team's store** updates by itself too. Publishing to the store also writes a job for the store's own project (`.design-system-engine-out/style-guide-store-job.yml`), for teams whose code is in a repository they may only read, written for the store's own default branch, never one assumed to be `main`:
  - it builds from your company's profile, which says where the code, the intent layer, the stores and Figma are;
  - it runs every hour when something moved, and at once when the intent layer's job starts it;
  - it never runs on a push to the store, since the page it sends is one;
  - it sends the page with the project's own access token, and GitLab decides what that token may do.
  - **A token that may write but not read is refused, not guessed at.** Sending the page reads the project's files first: that is how the engine tells what is already there from what is new. A token your host lets commit but not read the repository (a fine-grained token without **Repository: Read**) stops the publish and says so, rather than sending every file as new and leaving the store between two builds.
- **Your own copy is rebuilt when you ask.** A round, the build that publishes, never starts by itself: no job is installed on your computer and nothing runs on a schedule. Ask for a round (`--auto`, or [in words](features.md#publish-a-living-style-guide)) and it reads what moved since the last build - your design system's code, Figma, the intent layer, your team's stores and profile, the engine itself - and runs only the steps those feed, publishing to your team's store only a page that changed ([Rebuilt when you ask](#rebuilt-when-you-ask)).
- **The page on your computer keeps up with your git, the engine and the code.** After each commit and each pull, or at the end of a Claude Code turn once the engine or the code it reads moved, it is built again quickly and never published ([See a change in seconds](#see-a-change-in-seconds)).
- **A job written before** builds only on a push to the system. Publishing says so when your intent layer lives elsewhere, and leaves your job as it is: take the new triggers from `--publish-styleguide --print`.
- **Easy to host.** The page keeps its styles, code, fonts and data in an `assets` folder beside it, each file named by what it holds. To open it on your computer, download `index.html` and the `assets` folder. A host serves them once and a browser keeps them, so after a rebuild a visitor downloads only the page and its data, and the component panel opens from what is already there. It still opens from disk, double-clicked.
- **Read by machines too.** Every build writes the page's twin in text beside it, from the same data the page is drawn from: an index and one file per component ([Read by machines too](#read-by-machines-too)).
- **The first screen loads first.** What only a component's own page reads (its code, its whole changelog, its Code Connect, its Figma images) is a small file of its own in `assets`, loaded when that component opens. The Status page, the menu and the overview show without waiting for it.
- **Three more load when first used.**
  - The brands' embedded fonts, when a brand is chosen.
  - The Showroom screens' drawings, when the Showroom or a screen's card is shown.
  - What the agents read of each intent layer page, when its row opens on the Documentation page.
  - An address that shows one at once (a brand already chosen, `#showroom`, `#documentation`) loads it with the page.
- **A large guide is published in parts.** On GitLab, a guide too large for one commit goes as several: its pictures first, then its data, then the page that links them. The page never names a file that is not there yet. If someone else commits in between, the rest waits for the next round, and the run says how many parts landed.
- **The component panel downloads nothing twice.** The panel is the page again, in a frame. It takes the data the page around it already holds, so a host that sends no cache header costs no second download.
- **One template for every project.** Every project fills the same template (`templates/styleguide.template.html`) with its own data, so an improvement there reaches every design system on its next run. A project can still use its own (`styleguide.template` in `ds-config.json`).
- **The template comes in parts.** Its file is the page's frame; its styles and its script are parts of their own under `templates/styleguide/` (`css/` and `js/`, one area of the page each, such as the Overview, the Tokens page or the Status page), joined in order when the page is built. A change is reviewed and tested one area at a time, and the page they make is the same. A project's own template can be one file, or use parts the same way (a line `/*@part …*/` in its styles, `//@part …` in its script).

### Rebuilt when you ask

Some teams have no CI runner, so no pipeline ever rebuilds their guide. A round on a person's own computer does it instead: `--auto` builds one now and stops. Nothing is installed and nothing runs on a schedule - a round happens because someone asked for one - and because it runs only what the change reached, asking costs a fraction of a whole build.

- **It runs only what the change feeds.** One table in `lib/auto-build.mjs` says which steps each source feeds:

  | What moved | What runs |
  |---|---|
  | The intent layer | The contracts and the design intent, then the style guide, its check and the publish. No audit. |
  | The themes | The style guide, its check and the publish |
  | The code, Figma, the snapshots, the team's decisions or the profile | The audit, then everything after it |
  | The engine | Everything, since its output may differ. Each step's own caches keep it short. |

- **It publishes only a page that changed.** With a style guide store set, the published `built-from.json` keeps the page's fingerprint, so a build that made the same page sends only that record.
- **It tells a CI your git host cannot reach.** A CI on a company network often polls the store, because the git host may not send webhooks into that network, so a published page waits for the next poll. Your computer is inside that network, so the engine can call the CI itself once the write has landed. Name the links under the part's store, in `ds-config.json` or your team's profile:

  ```json
  "stores": { "styleguide": { "write": "https://gitlab.acme.test/design/site",
                              "notify": { "url": "https://ci.acme.test/job/style-guide/build", "authEnv": "ACME_CI_AUTH" } } }
  ```

  - `notify` is a link, `{ "url", "method", "authEnv" }` (`method` is `POST` unless you say `PUT` or `GET`), or a list of them. Any CI with a trigger link works: a remote build with a user's API token, a generic webhook. Every part's store takes one, not only the style guide's.
  - **The credential stays in `.env`.** `authEnv` names its variable: `user:token` is sent as Basic, anything else as a Bearer token. Not set yet? The run says which variable to add and calls nothing.
  - **Only a write that landed.** A commit or a push on the branch, or a folder written. Never a merge request (nothing is on the branch until someone merges it), a store that already had the files, a refused write, or an `--offline` run.
  - **Never another token.** A variable the engine uses for something else (`GITLAB_TOKEN`, `GITLAB_WRITE_TOKEN`, `GITHUB_TOKEN`, `FIGMA_TOKEN`, a store's `tokenEnv`) is refused, so a profile can never send one of your tokens to a host it was not made for. Only `https` links are called (`http` only on `localhost`), and a link with a password in it is refused: put the password in `.env`.
  - **One line per link:** `🔔 Style guide: told ci.acme.test/job/style-guide/build (201)`. The line never shows the link's query or a credential. A CI that refuses, or does not answer in 10 seconds, gets a line of its own, and the write still counts.
- **Never from a branch of your own.** A checkout on another branch than its remote's default is built, never published.
- **A failed step is never published.** The round says where it failed, and the next round tries it again.
- **One round at a time.** A lock file stops a second round while one runs.
- **A round never waits for ever.** A step still running after 90 minutes (`styleguide.stepMinutes`) is stopped with its browsers, and the log says so.
- **One line a round** in `.design-system-engine-out/watch.log`: what moved, what ran, how long, and whether it published.
- **A scheduler of your own.** `--auto` is one round and an exit code, so a cron entry or a CI job of your own can call it on whatever rhythm you choose. The engine never writes one for you.
- **Never two at once.** An audit, a build or a publish you start while a round runs waits for it to end first, so the two never write the same files or share the computer.
- **No token is stored.** Each step reads them from the project's `.env`, as every run does.
- **`--guide-status`** says whether the style guide the team opens is behind what it is built from, and what this folder's last round did.

### See a change in seconds

A full build tries every component's accessibility in a browser, so it takes minutes on a large system. While you work, a quick build shows your change in seconds and keeps what the last full build found.

- **`--styleguide --quick` builds the page for you to look at.** On a system of 174 components and 5 themes it took about 20 seconds, against 11 minutes for a full build.
- **What it keeps.** The accessibility saved by the last full build, and the Showroom as it last measured it. A component changed since is tried by the browser that opens the page.
- **What it leaves out.** No accessibility tried while building, no pictures of the guide's own pages, and nothing read from or sent to your team's stores.
- **One component, faster still.** Add `--component` with its name for a page of that component and the ones it nests. Its audit is not run first, as it is for a full build.
- **`--styleguide --watch` builds again on each save.** It follows your project, the style guide's template and the engine, and builds a moment after you save. Several files saved together make one build. Ctrl+C stops it.
- **Built again after each commit and each pull.** Once you have built the page here, your git builds it again quickly after a commit, a merge or a pull, and a rebase. Your copy stays as your git is, with no command of yours.
  - **Git never waits.** The build runs on its own and ends with the page. A commit goes ahead at once.
  - **Never unasked.** Nothing is built where no page was built yet, nothing on CI, and nothing with `"hooks": false`.
  - **One build at a time.** Several commits close together make one build, then one more for what came in meanwhile.
  - **What it printed** is in `.design-system-engine-out/styleguide-rebuild.log`.
  - **It comes by itself.** A project set up with the engine's hooks gets these on its next run ([A commit warns, a push refuses](audit.md#a-commit-warns-a-push-refuses)).
- **Built again where there is no git too.** A project whose code the engine takes from GitLab, in a folder that is no git repository, has no commit to follow. There, the page is held to what it was built from: at the end of each Claude Code turn in the project, it is built again, quickly, when the engine updated or the code moved since.
  - **Once each.** The page says which engine and which code it was built from, so it is built again only when one of them changed.
  - **Never by an older engine.** With two engines on one computer, neither builds over the other's newer page.
  - **Still nothing in the background.** A turn of yours is what asks; no job and no schedule.
- **Built again when the engine updates.** Every page this computer built is built again, quickly, the moment the engine gets a new version: a merge pulled in, or its daily update. You do not need to open the project.
  - **Only the pages it left behind.** A page built by the new engine already, or with `"hooks": false` in its project, stays as it is.
  - **Its own list.** The engine keeps the folders where it built a page in `~/.claude/.rms-design-system-engine-pages.json`, on this computer only. A folder that is gone leaves the list. Pages built in a temporary folder, by a test or on CI are never on it.
  - **The installed engine only.** The engine's own git hook does it, and it is written only into the copy Claude Code runs, on `main`. A clone you develop the engine in never builds your pages.
- **Never published.** A quick page carries a mark, and no store takes it. Build the full guide (`--styleguide`) before you publish.
- **Its times are kept apart.** `--timing` says where the time went, and `timing.json` keeps them under `styleguide --quick`, so they never replace the full build's.

### What's in it

| Page | What you find there |
|---|---|
| Overview | A card for each foundation and component, with a thumbnail drawn from your own code, and a search across everything |
| Status | How far the system has come, in one number and by area, and everything still open with who acts and what to do |
| Foundations | Colours, typography, spacing, radii, motion and icons |
| Components | One page for each component, in areas you switch between |
| Templates | Each page template, what it is made of and the frame it comes from, when you list templates |

What every page shares:

- **The top of the menu.** Your logo, when `styleguide.logo` names one. With none, the default mark, RMS DS, whatever the system is called (its name on hover), over "Living control center". No version: a version read from the code says nothing about the Figma file the same guide shows.
- **One count for the components.** The menu's Components number is the Code card's Built number. The menu lists every component the Status table counts as built, a part inside its component however deep it sits, and a component only the code has too.
- **Every table sorts.** Click a column's name to sort by it, and again for the other way round.
- **Filters in one order.** All first, then the filters (Who acts), then the statuses, all as far apart as each other.
- **Column widths by what they hold.** Each column has its share of the table, so leaving one out never squeezes the rest. A column with nothing in any row is left out (Motion's What to do when nothing is to do).
- **A row's panel reads as text.** Every line in one colour and weight, and never a table or a box drawn like one: what a table would say is said as labelled values.

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
- **You check by hand.** What only a person can judge. Once you have, [tell Claude](features.md#test-accessibility) and the row is Done, with your name and the date, until the component changes.

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
| Rules | Only when the Figma review finds something on it: each construction rule it breaks, as a task with its fix for whoever keeps the Figma file, linked to its node in Figma |
| Accessibility | One table by WCAG 2.2 criterion: its task number, the criterion, who acts, its status and when it was last checked. What to do, what Figma states and what was found are in the row's panel |
| Documentation | What it is, when to use it and when not, common mistakes, limitations, Do and Don't pictures, its role and an example, with what is still to write |
| Motion | Everything that moves in it, the code's timing beside Figma's |
| Built with | The system's components it is made of |
| Parts | The components placed only inside it (a dropdown's row, a table's cell), each with its own documentation, written in this component's page |
| Used in | Each product that uses it, with a picture and how many times. A product that draws its own version (Gate [10]) is there too |
| History | Every change in one table: each code commit (its issues and release), each Figma change, each intent layer commit and each decision, with who did it and when. A change to its page in the intent layer (its contract) names who made it too |

Each area has its own link (`#c-chip/accessibility`). The address also keeps what you set in the Playground (`#c-chip?Size=L&width=phone`), so a link opens that exact variant.

The Playground is its own part, still in early development: see [Try components in a playground](#try-components-in-a-playground).

Also on each component.

- **API.** The props, events and slots your code declares, required ones marked. A plain HTML and CSS system has no API to read, so it is left out.
- **Code.** Its head stays in view as you scroll, with Copy code as a plain underlined button. Exactly what the Playground shows, as a product writes it (`<Chip size="l" />`), or the HTML with only the classes your CSS styles.
- **A token's panel.** Click any token to see its value in each mode, the components that use it, and a button to copy it.
- **Not agreed yet.** A prop only one side has, a different default or a token that differs is left out and counted at the top, so you decide each one first.
- **Only in the code.** A component only your code has keeps its own page and its place in the menu, marked Only in the code, with its file and its props. Its Status row says Figma is Missing, with what to do in an i: add it to Figma, or remove it from the code. Its Parity is N/A. `styleguide.showCodeOnly: false` leaves these off the pages, a task each.
- **Coverage.** How much of its file your tests cover, beside its Code Connect.
- **Its stage is a task, not a label on its page.** Your team sets it as `status` in `contract.authored.json`, as `Status: beta` in its Figma description, or with `@deprecated` in its code. The Status page asks for it:
  - With no stage set, a Stage task says what the page measures, in the Status table's words: Stable when Parity is Match, Accessibility Met and Documentation Written (with at least 80% of its lines covered when your tests report coverage), Beta otherwise, with what is left.
  - With a stage that differs from what the page measures, the task says both, to keep it or change it.
  - A component being retired names what replaces it, from the release that retired it or from a line such as "use button instead" in Figma or its code.

### Templates

A template is a page frame in Figma made of your system's components, such as a settings page or a list with a side panel. List yours under `templates` in `ds-config.json` and the style guide gets a Templates page.

- **What it is made of.** The components Figma places in it, in Figma's order. Each one with a page of its own is linked.
- **Whether the code uses each one.** Each component says In the code, Not in the code, Kept out on purpose or In progress. It is the same answer the template check gives (Gate [17]).
- **Its code file.** The file it is built in, and how many of its components that file uses. With no file found, it says so and nothing is compared.
- **The frame it comes from.** A picture of the frame from Figma, beside the list, and a link to see it in Figma. The picture comes from your reference images, or from Figma with `FIGMA_TOKEN`.
- **The order.** When the code places the components in another order than Figma, it says so. It is a note, never a failure.

### The intent layer

Your intent layer (why each piece exists and how to use it) is read on every run: DSDS or Markdown (MDX) pages, in a GitLab project, a GitHub repository or a folder of your project, or pages kept in Notion or Confluence. On a Markdown page, written for people, only a line that tells what to do is one of its rules; a line that only describes (what the variants are, how it is laid out) stays on its documentation for people, so agents are not handed every paragraph. Links between its pages lead to those pages where the layer lives, and images, lines of links and HTML entities are left out. Each component's Documentation shows it beside Figma, the code and the contract, each line with where it came from and a link to its page; agents get it in the contracts, `llms.txt` and the prototypes, so they can compose a page that has no Figma layout yet. The Documentation page (once the Intent layer page) reviews every page with one decision (Delete, Move, Rename, Name, Write, Improve, Keep, Add), why, and each change to make in the layer, and gathers what is still to write about each component from every source, with where to write it (Figma, the intent layer). It also flags Remove on each component whose Figma annotations or code notes no agent reads: a note that repeats the description, is only a link, or is past the three an agent is shown. A note in the code that only says how the component is built, or repeats another, is left alone: it is there for developers.

When the layer changes, the style guide follows.

- **A change the engine makes is published at once.** A fix copied from the style guide and run in Claude Code (an answer to a proposal, drafts approved, changed or dropped, a part named, lines drafted), or one the engine makes on its own (`intentLayer.autoFix`), is committed to the layer. The same command then:
  - builds the style guide again from the layer as it is now;
  - checks the new page: built from that commit, with the pages the change was about;
  - publishes it where your team's guide lives: its store (set in `ds-config.json` or your company's profile), else your publish job on GitHub or GitLab, started with your token (`GITHUB_TOKEN`, or `GITLAB_WRITE_TOKEN`). Without one, it gives the link to start the job by hand.
- **A change made in the layer by hand** builds the page again on its own too. See It updates on its own, above.
- **Each build says what moved.** It names the pages that changed since the layer was last read, and checks the whole layer again: names that do not exist, the guidance rating and rules that contradict Figma or the code.
- **A private layer needs a token.** The job reads it with `INTENT_LAYER_TOKEN` (GitHub) or `GITLAB_TOKEN` (GitLab). Without one it cannot read the layer: it builds from the copy kept in the project, if there is one, and says so in its log.

Each rule on a page is said as what holds it. The page's Documentation panel and `--check-intent` count them: how many rules, how many checked, checkable and judgment.

| Status | What it means |
| --- | --- |
| Checked | A check the engine already runs enforces it, and the check is named: the edit check's colours, sizes, prop values or imports, the static accessibility check, the nesting rules, or a guard you said yes to before. |
| Checkable | A guard could hold it on every edit: a component never inside another, a prop value or combination not allowed, a token never to write, a prop or slot always there, an import replaced, at most so many of a component on one screen. |
| Judgment | A person judges it, or a model judging the page. |

- **A checkable rule proposes its guard.** Say yes or no on the Documentation page, or with `--intent-decide <key> yes`. A yes writes the guard into `contract.authored.json` (an import into `ds-config.json`), and the rule is checked from then on, linked to it. A no is kept, and the rule stays one agents read.
- **A vague rule gets a rewrite.** One that names no component, prop, value, token or count ("use it appropriately") is given one sentence a reviewer can check, from what the page says. A yes drafts it under Rules for your review.
- **A rewrite keeps what the rule means.** Every word the rule is about is still in it, or no rewrite is proposed. Two rules are never given the same sentence. A label in the rule ("Put Secondary, Cancel, Clear or Back before Primary") is a name, not a vague word.
- **Each rule is about its own component.** A page that documents two components often writes each name as a heading among its rules. That line is not a rule, and the rules under it are about that component. A count of something inside it ("a maximum of 2 visible buttons" under a footer bar) is not a count of the bar on a screen, so it gets no guard.
- **A guard never contradicts the component.** A value its code takes is never forbidden outright, nor a setting the page's own lines use. Such a rule means something else, and stays one a person judges.
- **Agents are held to them.** Each rule in a contract carries its status. Checked and checkable rules are hard constraints.
- **English and Portuguese.** The same rule, written in either, is read the same way.

With no intent layer, every row can still be finished.

- **Do and don't.** Write lines that start with `Do:` or `Don't:` in its Figma description, in the comment above its CSS rule, or in `contract.authored.json` under `guidance.doDont`. Agents get them with its pictures.
- **Properties.** The contract the engine writes from Figma and the code is the one agents read, so there is nothing to publish.
- **Text styles.** A text style's description in Figma counts as its token's, like a variable's.
- **Role.** A component whose root is a plain element (a `span`, a `div`) with nothing to press, type in or go to has no role, read from its code: nobody has to decide it.

### Guidance for agents

Agents read your guidelines and Figma's descriptions to pick and use each component. [Ask Claude](features.md#gather-usage-guidelines) to rate them, and each component gets a class.

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

### The page is checked too

The style guide is held to what a page owes the people who read it, as a product's page is.

- **Every file it links to is there.** A script, a style sheet or a picture the page names that is missing fails the check, so a page with a hole is never published.
- **Its size is shown.** Every build says how much the page and its files weigh, with the largest files. Past 25 MB it warns, since the page is slow to open on a phone.
- **Its own pages are compared between builds.** A build that opens the page in a browser takes a picture of each page in the menu: Status, the foundations and each component, 40 at most. It compares each one with the picture from the last build.
  - Only in a folder that keeps its builds: the first build there takes none, and a CI run, which throws its folder away, takes none either.
  - Words are hidden in the pictures, so a date or a count that changes every build is not a change.
  - A page that changed is named, with how much of it changed, and a picture marking what changed is in `.design-system-engine-out/styleguide-shots/diff`.
  - It never fails the build. A change you meant is fine; one nobody meant is a fault in the page.

### Modes

Each component and foundation has its own switch for each mode collection, and the page has one for colour. By default everything follows your device (Dark when it is set to dark, Phone sizes in a narrow window) until you pick a mode. A mode your code has no CSS for yet is shown as such, never drawn with Figma's values.

### It works on a phone

Every page fits a 320 pixel screen (WCAG 1.4.10). Cards sit two side by side, every table reads as a block per row, and the menu opens from a Menu button.

### Read by machines too

Every build writes the page's twin in text beside it, from the same object the page itself is drawn from, so an agent handed only the page's address gets the system's own answers rather than the most common button on the internet. Written by the build, never by hand, so it cannot drift from the page beside it.

- **Where it is.** `llms.txt` beside `index.html`, and one file per component in `c/`. A component's file is named as the page names its section, so `index.html#c-modal` and `c/modal.md` are the same component.
- **What the index holds.** A line per component: what it is, its props, what to avoid, its parts, what it composes with, and whether its design and code differ. Then the token families, how many variables the code uses, and how many WCAG criteria are checked. A part is listed under its root, never as a component to choose.
- **What a component's file holds.** How to write it (its import line, its tag, its syntax), its props with their types, defaults and values, its events and slots, what it is for, when to use it and when not to, its rules, the mistakes made with it, what it cannot do, its parts, what it is used in, the tokens it uses, its accessibility, where its design and code differ, and where it came from.
- **Nothing is invented.** A fact the data does not hold is a line that is not written, and a heading with nothing under it is left out.
- **Published with the page.** The job that publishes the style guide publishes the twin with it, so one address serves both readers. A component the system no longer holds leaves with its file.
- **Not the same as the local index.** For an agent working in your repository the engine also writes `contracts/llms.txt` and `contracts/catalog.json`, with the catalog for checking generated UI. Those stay beside the contracts, where only somebody who can run the engine reaches them. This twin is the published page's.

### The Status table

One row for each component, with one word per state. The cards above the table and the filter chips use the same words.

| Column | States |
|---|---|
| Figma | Found, Missing |
| Code | Built, Unsure, Missing |
| Parity | Match, Partial, Differs, Unsure |
| Accessibility | Met, Issues, Review, Untested |
| Documentation | Written, Partial, Missing |

- **Cards.** Parity, Code, Accessibility and Documentation, all over the same whole: everything the table lists. The big number is the share of the work done, in the table's word (51% Match). The bar draws that share in green and splits the rest into what waits for a person (yellow) and what is to fix (red), and its legend says those shares in the table's words. At its foot, on one line: how many are complete, the same count the filter shows for the done word (1 of 180 complete), and a link that opens the table filtered to what is most urgent (See Missing). It says complete, not the big number's word, because it counts whole components while the big number counts the work.
  - **Parity** counts every property, token and value compared, in what the code has built.
  - **Code** counts the rows themselves: built, unsure or missing.
  - **Accessibility** counts WCAG 2.2 AA criteria over the whole system. A criterion is met when nothing fails it, to review when only a check by hand is left, and failing when anything fails it.
  - **Documentation** counts what people write. Its page existing and its properties, which the engine writes itself, are not counted.
- **Parts.** A Figma name with a slash (`chartBars/bar`) is a part, not a row: its parent's row counts what it has left, and the parent's details list it under Parts. A part of a part counts in the row of the component at the top, never in a row of its own.
- **Opening a component.** A row, or its arrow, opens the component's page in a panel from the right, with its tabs. A Parity, Accessibility or Documentation cell with something left opens that area, filtered to what is to fix or decide.
- **N/A and Untested.** N/A has no dot and no arrow, since there is nothing to open. N/A and Untested carry an i that says why. A component only one side has says what to do in an i on the side that lacks it.
- **Sorting.** Every column sorts both ways, Parity first.
- **Filters.** One chip per column, named only until a state is chosen, so nothing looks applied. Each opens a list of All and the column's states, with how many rows each would show. Chips combine (Code: Built and Documentation: Missing is what is built and undocumented), each list counting beside the others' choices. Choosing a state sorts by its column; Clear filters drops them all.
- **The address.** It keeps the view, the filters and the open panel with its tab (`#status/parity?code=Missing&doc=Missing&open=c-chip/accessibility`), so a link opens the page as it was. `#health` and `#tasks` open the Status page too.

## Try components in a playground

Early development. Each component's page opens on its Playground: the component drawn from your own markup and CSS, with Figma's props as controls, every state, your modes and a Width switch.

- **Inspect.** Outlines each part, padding and gap. Click one to see what it is and its value (`chip padding left · --padding-s · 8px`), and click inside to go one level deeper.
- **Figma beside the code.** Off unless `styleguide.figmaCompare` is `true` in `ds-config.json`. Then a Figma button shows Figma's image of the variant you set, beside the component or over it with a slider. The images come from `.design-system-engine-refs/` or, with `FIGMA_TOKEN` in `.env`, straight from Figma.
- **Width.** Shows the component at each breakpoint your Figma file gives (Phone 350, Desktop 1680), else at 375, 768 and 1280 pixels, with your media queries applied.
- **It works as in your products.** Your system's own scripts run (`systemScripts` in `ds-config.json`), a selection moves when you click it, and an overlay opens with its own animation.
