# Documentation

How the engine writes each component's contract and gathers the intent layer. What each part promises, and what to ask for it, is on the [features page](features.md#documentation). All pages: [technical documentation](README.md).

**On this page**

- [Write component specs](#write-component-specs)
- [Gather usage guidelines](#gather-usage-guidelines)

## Write component specs

Each component gets a contract, rewritten from Figma and the code on every run: its props, variants, states, tokens and the components it nests. `contracts/llms.txt` is the one file AI tools read.

### What a contract says it is for

A contract's `description` comes from the first source that says what the component is for:

1. Your own words in `contract.authored.json`.
2. Its page in your intent layer: the first paragraph of what it is for.
3. Its code: the comment on the component in its own file. That is a Vue file's opening `<!-- … -->` or the doc comment above its `export default`, Svelte's `<!-- @component … -->`, or the doc comment right above a React or TypeScript component.
4. Its description in Figma.

`descriptionFrom` says which one it was: `authored`, `intent`, `code` or `figma`.

- **Nothing says?** The description is a placeholder ("captured from Figma") and there is no `descriptionFrom`. The audit counts it as a component with no description and lists it.
- **Published into the intent layer?** The page is linked, never copied back as the description.
- **Licences and lint switches** at the top of a file are not a description.

Each prop says what it is for the same way. A Figma property paired with a code prop takes its `description` from:

1. Your words in `contract.authored.json` (`propDescriptions`).
2. The code: the doc comment (or the `//` lines) right above the prop, in a Vue props object, a `defineProps` type or a TypeScript interface. Else what the component's own comment says of it (`@size {String} …`), or docgen's description.
3. Figma, when the code says nothing.

A prop only the code has (`codeOnly`) carries the code's description too.

### Props that say nothing, and drafts to approve

A prop none of those sources describes is listed, with where its description goes.

- **Where it is listed.** On the component's Documentation area in the style guide (What each prop is for), and in the audit's contract completeness line. `--contract-completeness` lists each one.
- **Where it goes.** The comment above the prop in its code file, with the file and line. A Figma property no code prop is goes in `contract.authored.json` (`propDescriptions`).
- **A draft for each code prop.** One plain sentence from what the engine knows for sure: its type and values, its default, the Figma property it pairs with, the Figma properties that set it, and how often its uses set it. Nothing more: "Size of the chip: s, m or l. Default m."
- **As a patch.** The drafts are written to `.design-system-engine-out/handback/prop-descriptions.diff`. Each one goes above its prop in the file's own style: a doc comment in a Vue props object, a `defineProps` type or a TypeScript interface, or a line in the component's own comment when that is where its props are described (`@size {String} …`).
- **You approve.** The Documentation area shows the drafts as Drafted, to approve, with the request to copy into Claude Code. The patch is applied only when you ask. The next run reads the comments back into the contract.
- **From the terminal.** `rms-design-system-engine --prop-descriptions` lists every prop that says nothing, with its draft, and writes the patch. Add component names to list only those.

### Its element, said once

`semantics.element` and `accessibility.element` always name the same element: yours from `contract.authored.json`, else the one the code's markup starts with. Where it was read is in `accessibility.element.from`. A role you write as `semantics.aria.role` is `accessibility.role` too.

### Where it lives

`livesIn.products` lists the products whose code uses the component, each with a name:

1. The product's name in `ds-config.json` (`products` with a `dir`, `pluginDirs`, or `paths.plugins` for `apps/<app>`).
2. Else its folder, for an app or package nobody listed (`apps/`, `plugins/`, `products/`, `packages/`). A package that holds the system's own components is the system's.
3. Else `this project`, marked `own: true`: the files outside every product.

### Contracts of components that are gone

A run of every component takes out the contracts it wrote earlier for components it no longer writes: gone from Figma and the code, renamed, or written before contracts had a `name`. Left there, they read as components the system still has.

- **A run of some components** (`contracts.only`) leaves the others alone.
- **A contract written by hand** in the same folder stays: only the engine's own files (they carry `x-design-system-engine`) are taken out.

### Colour pairs, not a shortlist

For every text and icon colour, the engine works out the one surface it was made for, reading the names (`content/on-interactive` goes with `surface/interactive`) and confirming it against the values. The pair goes into the contract, into `llms.txt` and into `--query`, so an agent is given the answer instead of every surface that would work: given only a shortlist, it picks a different grey on every card. An edit that puts a colour on another surface is told so at once, with the contrast the two actually give. And a pair whose names promise what its values break (white on a warning yellow) is reported as what it is: the system's own words against its own numbers.

### What a screen reader is given

Each contract's `accessibility` says what a screen reader gets from the component, so an agent builds it right the first time.

- **Its role.** What it is announced as: `button`, `link`, `textbox`.
- **Its name.** How it is given: `content` (what it holds), `prop:label` (the words of that prop), `aria-label`, `labelledby`, `label`, `alt` or `title`.
- **Its states.** The ones it announces: `aria-expanded`, `aria-pressed`, `disabled`.
- **Its focus and keys.** Whether Tab reaches it (`focusable`), and the keys it answers (`keyboard`: `Enter`, `Space`, `Escape`).
- **Each state that differs.** `byState` lists a state whose facts are not the rest's, with what tells it apart (`Disabled: True`: Tab passes it by, no keys).

Each fact says where it came from, and none is guessed:

| `from` | What it means |
|---|---|
| `measured` | The style guide's build tried every variant in a browser. |
| `code` | Read from the component's own markup, with no browser. |
| `figma` | Its role annotation in Figma. |
| `authored` | Written in `contract.authored.json`. |

- **The browser first.** It is what the code really gives. The team's own word on the role (`authored`) still comes first.
- **Nothing lost.** Where another source says otherwise, it is kept beside it (`differs`): a toggle button in Figma that the browser finds a plain button says both.
- **The code makes the name exact.** The browser says a button is named by its content; the code says that content is the `label` prop, so the name is `prop:label`.
- **Where it is kept.** The build writes what it measured to `.design-system-engine-out/a11y-facts.json`, and the next contract build reads it. `measuredAt` says the day.
- **Without a browser.** The facts come from the markup alone, marked `code`. What the markup cannot say (a root that is another component, a role set by an expression) is left out.

### Pairs the engine suggests, for you to confirm

A Figma property that no code prop is paired with may still have a near name in the code: Figma's `Content` and the code's `contentList`. The engine never pairs them on its own. It asks.

- **Where it asks.** `rms-design-system-engine --prop-pairs` lists each pair, and the component's Parity area shows it on the Figma property's row, with a yes and a no to copy.
- **A yes.** `--prop-pair <component> "<Figma property>" yes` writes the pair into `contract.authored.json` (the component's `bindings`). The next contract pairs them, with the code prop's type, description and default, and its values mapped where both sides write them with the same letters (`Large` and `large`).
- **A no.** `--prop-pair <component> "<Figma property>" no` keeps the answer there too (`declinedPairs`), so the same pair is never asked again, in the contract or by the props check.

### The contracts in DSDS too

Beside the contracts, `contracts/dsds/` holds the same components in [DSDS](https://designsystemdocspec.org) 0.23, for a team that documents its system in that format: one file per component and an index. Each says what the engine reads from Figma and the code (the variants and states, what it nests, what to use instead, its status) and links the rest, as DSDS asks: the contract as its spec, the code file as its source, the Figma component, and your own page, whose guidance is never copied back.

### The contracts in the open component specs format

`contracts/specs/` holds the same components in the open component specs format (schema 0.39), for a team that specifies its components that way. One spec per component, and `index.json`. `--contracts-out` publishes it too, in `specs/` beside the contracts.

Each spec says only what the contract knows:

- **Where Figma holds it.** Its page and node, and whether it is a set of variants or one component. The page comes from the Figma capture; a component captured before the engine read pages gets it on the next capture.
- **Its anatomy.** The frame, the frames inside it that Figma lays out, the text layer each text property writes, the instance each swap swaps, and each slot.
- **Its props.** Each with its type, its values and its default. A variant of False and True is a boolean. What the code calls the prop, and how it writes Figma's values, sits beside it.
- **Its styles, as tokens.** The frame's padding, gap, corner radius, height and type style. Its fill and stroke in the default, and what each variant paints differently. A text colour goes on the text only when the component has one text property.

Anything else is left out, never guessed: where a part sits, a part whose kind the contract does not know, a text colour with several texts to choose from. The index says what each spec leaves out. It also links each spec to its contract, its code file and its Figma component, so nothing is copied twice.

A test holds every spec the demo builds to a schema written from the format's published types, where each prop must read as exactly one kind.

### Code Connect drafts

The engine reads the Figma Code Connect files your project commits: each code prop and the Figma property it reads, a property that only decides whether another is written (in either form), and, in the template form, what fills a slot between the component's tags. A text or a swapped instance written into a slot the code has pairs with that slot. For a component that has a contract but no Code Connect file, it can draft one: `rms-design-system-engine --code-connect-draft` (see [Commands](features.md#write-component-specs)).

- **From what the contract pairs.** Each Figma property's code prop, an enum's values as Figma and the code write them, the booleans, the texts, the instances it swaps, and a switch that decides whether another prop is written.
- **Slots filled.** In the template form, what fills a slot is written between the component's tags: the default slot's content as it is, a named slot's in the element its framework uses (`slot="icon"` for a web component, `<template #icon>` for Vue), guarded by the property that decides whether it is filled.
- **React's named slots are props.** In a React draft, a named slot is written as the prop it is (`<Card header={…}>`), in either form, and the property that decides it wraps it or guards it.
- **Swapped instances and Figma slots, the documented way.** A swapped instance is `figma.instance('Icon')` in the classic form, and in the template form `getInstanceSwap('Icon')`, written as what its own Code Connect renders (`icon?.executeTemplate().example`; `renderProp` for a React prop). A Figma slot property is `figma.slot('Body')` or `getSlot('Body')`. Both need a recent Code Connect CLI.
- **Conditions in the classic form too.** A property that decides whether a prop is written wraps the call that fills it: `figma.boolean('Show caption', { true: figma.string('Caption'), false: undefined })`, the other way round when it decides it off, or an enum on the option it decides it under.
- **In the form you already use.** The classic `figma.connect` form or the template form, whichever your own files are in. With none yet, React gets the classic form and Vue, Svelte and web components the template form. `--form=classic` or `--form=template` picks one.
- **Marked as a draft.** Its first lines say so. Whatever the contract does not settle is a TODO comment where it goes: a value the code does not list, a Figma property no code prop is, the import.
- **Never in your code.** The drafts go to `.design-system-engine-out/code-connect-drafts/`, in the same folders as each component's file. A person checks each one, moves it beside its component and publishes it with their own Code Connect tooling.
- **Read back before it is written.** Each draft reads back through the same reader the engine uses for your Code Connect files, to the same pairs it was written from (a test holds it to that).

### Contract changes on a merge request

A merge request (GitLab) or pull request (GitHub) can show what it changes in the component contracts, before anyone merges it.

- **What it compares.** The contracts built from the merge request's code with the base branch's. The base is what the last build on the base branch kept, or the contracts you published last (`--base <folder>`).
- **Per component.** The props, options, states, slots, code props, events and tokens added, removed or changed.
- **What breaks.** A prop, an option or a state removed, a default changed, or a whole component removed. These are the same rules the engine uses to record a release.
- **Who uses it.** The products that use each changed component, with how many files, and the system version each product is on.

A breaking change is accounted for when any of these is true:

- A person signed it off: `rms-design-system-engine --sign-off "breaking change to cardTile" --by "<who>"`.
- It is recorded as a release in `design-system-engine-releases.json`, newer than the base.
- The component's own version has a new major in `contract.authored.json`.

What you get:

| Situation | Exit | What it says |
|---|---|---|
| A breaking change nothing accounts for | 1 | Each change, such as `− prop Size options: L (breaking)`, and how to account for it |
| Changes, none of them breaking, or every one accounted for | 0 | Each change, and who signed it off or which release holds it |
| Nothing kept from the base branch yet | 0 | That there is nothing to compare, so it passes |
| No contract could be built from this code | 2 | That nothing can be compared |

- **How strict.** `ds-config.json` `contractChanges.failOn`, or `--fail-on`: `unaccounted` (the default), `breaking` (any breaking change fails) or `never` (it only reports).
- **For the merge request.** The same report is written to `.design-system-engine-out/contract-changes.md`, ready to post as a comment.
- **It only reports.** It never changes your code. Your pipeline decides what a failing exit stops.

#### Set it up in CI

Two steps:

1. **On the base branch**, keep each build's contracts: `rms-design-system-engine --contract-changes --record`. It writes `.design-system-engine-out/contracts-last-build.json`.
2. **On each merge request or pull request**, compare: `rms-design-system-engine --contract-changes`.

GitLab (`.gitlab-ci.yml`):

```yaml
.contracts:
  image: node:24-bookworm
  before_script:
    - git clone --depth 1 https://github.com/rafaelmatosdasilva/rms-design-system-engine.git ../engine

contracts-keep:
  extends: .contracts
  script:
    - node ../engine/audit.mjs --contract-changes --record
  artifacts:
    paths: [.design-system-engine-out/contracts-last-build.json]
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

contract-changes:
  extends: .contracts
  script:
    - mkdir -p .design-system-engine-out
    - 'curl -fsSL -H "JOB-TOKEN: $CI_JOB_TOKEN" -o .design-system-engine-out/contracts-last-build.json "$CI_API_V4_URL/projects/$CI_PROJECT_ID/jobs/artifacts/$CI_DEFAULT_BRANCH/raw/.design-system-engine-out/contracts-last-build.json?job=contracts-keep" || true'
    - node ../engine/audit.mjs --contract-changes
  artifacts:
    when: always
    paths: [.design-system-engine-out/contract-changes.md]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

Before the base branch keeps its first build, nothing is fetched and the check passes, saying so.

GitHub (`.github/workflows/contract-changes.yml`):

```yaml
name: contract changes
on:
  push:
    branches: [main]
  pull_request:
jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: git clone --depth 1 https://github.com/rafaelmatosdasilva/rms-design-system-engine.git ../engine
      - uses: actions/cache/restore@v4
        with:
          path: .design-system-engine-out/contracts-last-build.json
          key: contracts-main-${{ github.sha }}
          restore-keys: contracts-main-
      - if: github.event_name == 'pull_request'
        run: node ../engine/audit.mjs --contract-changes
      - if: github.event_name == 'push'
        run: node ../engine/audit.mjs --contract-changes --record
      - if: github.event_name == 'push'
        uses: actions/cache/save@v4
        with:
          path: .design-system-engine-out/contracts-last-build.json
          key: contracts-main-${{ github.sha }}
```

Name your base branch where it says `main`. To post the report on the pull request, add a step that reads `.design-system-engine-out/contract-changes.md`.

## Gather usage guidelines

The intent layer says why each component exists, when to use it and when not, and what was decided. The engine writes what it is sure of; what needs judgement is a draft, and a person reviews and approves it.

### What the engine is sure of, it writes

A project with no intent layer gets everything the Documentation page finds as a list and nothing else, and most of those lines are never carried into a file by hand. Some of them the engine is not guessing at:

- **The element a component renders.** It read the code, in Vue, Svelte or JSX. A component whose root is a `div` is left alone — a box says nothing — and one your team already answered for keeps its answer.
- **A note that repeats the description.** An agent is shown both and reads the same thing twice, which is how a card that could have said something new says nothing.
- **Your product's own first use of a component**, as an example. Certain that the code is real; a judgement that it is the one to show, so it is written as a draft for a person to approve.

These go into `contract.authored.json` — the engine's own file and no other — and only where the project says it may (the `writes` setting above). What needs a person stays a task: a role that is a choice rather than a reading, Figma's annotations, words only a designer can give.

Two lines are never crossed. What is certain is written as final and what is judgement is written as a **Draft:**, never read as your team's word. And nothing a person wrote is ever overwritten: the engine fills what is empty and removes what repeats, and a sentence somebody chose stays as they chose it.

A component's role in the intent layer follows the same line: written as final when its code renders an element that has one (`<button>` is a button), drafted from what the component does when it renders a plain `div` or `span`, and only ever one of the ARIA roles.

A part your team does not want drafted for now is named in `intentLayer.noDrafts` in `ds-config.json` (`["role"]`, by the name your pages head it with). A page that has the part keeps it. Only the drafting stops, until you take it off the list. A draft already waiting is known by what it says too, so a "Role: button" kept under Rules is never offered a second time.

What each list holds (a page's Data lines) is the engine's own, written from the code:

- **It follows the code.** When the code changes what a list's items hold, the old line comes out and the code's new one goes in, as final, in the Markdown spec and the DSDS page alike. It is never drafted for a person.
- **The changes say only what was made.** A line planned for a page that none of its files holds is listed as not found, in the run's summary and in `CHANGES.md`, never counted as changed.

### An example on every page

Rules tell an agent what to do; an example shows it. A page with none gets one, drafted from how the products use the component.

- **The call the products write most.** The engine reads the files the usage map names for it and finds every call. The form most of them take is the example.
- **In the code's own syntax.** Vue, Svelte, JSX or a web component, as the component's contract says.
- **Only what the contract has.** Each prop, event and slot in it is one the contract names. A class, a directive or a prop the component does not take is left out.
- **None of a product's own data.** A value the prop takes stays. A product's words become `…`, and an expression is named after its prop.
- **Where it came from.** The line above it says how many of the uses take this form, and the file, line and product it was taken from.
- **A draft.** It goes under Examples, in the page's own format: a code block in a Markdown page, a block of text titled Examples in a DSDS page. Dropped, it goes whole, code and all. A component no product uses keeps the example written from its own code.

### Deciding a page's changes

A page's panel on the Documentation page holds every change it asks for, in groups. Each group has its own heading and count.

| Group | What is in it |
| --- | --- |
| New text for the page | Its drafts, each once, under its section |
| Changes to rules | The guards and rewrites its rules propose |
| Decisions about the page | Its other proposals: a page to write, a name to keep, a part's page, a page or a decision to review again |
| Other changes | What is still to write, a part's page to move, notes no agent reads |

- **Three actions per group, under its proposals.** Approve all, Change and Drop all, for everything the group proposes (never a change it has no ground for). Each copies its decision in plain words for you to paste into Claude Code ("Approve all 3 drafts"). No item has an action of its own. What you leave stays as it is.
- **One draft per section.** The engine drafts one line for each section a page lacks, never a second for the same section, and never a line the page already says.
- **Each draft beside its source.** The props it names, as the code has them (its file and the values each takes), and the line it says again, on the page or in Figma's notes or the code's comment.
- **A name only Figma has is flagged.** A Figma property the code does not take, written as a prop, is shown as a warning on its draft. The engine's own drafts never write one: they say what the code does, or call it Figma's.
- **A rewrite is offered for it.** A draft written before that names one gets a proposed rewrite. It calls the property Figma's and says what carries it in the code: a prop of the same name, or the prop or field the code's own comment says shows it. The review shows it under the draft, and listing the drafts in Claude Code shows it too, ready to take as it is or edit.

### Pages to write, most used first

A component with no page gives agents nothing to read. The engine ranks those components by how far they reach: how many products use them, in how many files, how many times.

- **The list.** `rms-design-system-engine --pages-to-write` prints it, most used first. On the Documentation page, the chip "Pages to write, most used first" shows the same rows in the same order, and each row says its rank and where it is used.
- **Filter the page.** Beside that chip, one for Source (the intent layer, Figma, your contract), one for Status (Missing, Review, Remove, Done) and one for who a row waits on. Each shows All until you choose, says how many rows your other choices would leave, and they combine; Clear filters drops them.
- **Documented elsewhere is left out.** A component documented in another page, a part of another component, and an icon or sub-part that only sits inside a documented component are listed apart, with why.
- **The first ones are started.** Each run that writes the layer starts pages for the first 10 the products use (`intentLayer.startPages`, `0` for none), beside their siblings, as a yes to writing a page would.
- **Drafted from the contract.** What it is for comes from its description. When to use it comes from the products that use it, the values its props take, its states and what it holds. Each line is a draft, never your team's words, and each passes the content check first.

### Parts are not components

Some components exist only as pieces of another: a dropdown's row, a table's cell, a chart's legend. Figma and the code keep each one as a component, but nobody places one on its own. Listed beside the others, they read as more components to choose from, and each asks for documentation of its own.

The engine finds them when two things agree. Either the name sits under the other's in Figma (`grid/Row`), or the name carries the other's and the other holds it. A part is shown inside its root, in a Parts area, and leaves the menu and the counts. Its documentation goes in the root's page, under Parts, one section per part, so it can say how that piece is used. Agents are told to place the root.

When only one thing agrees, the engine asks instead of guessing: a card on the component with an answer to copy. [Tell Claude](features.md#gather-usage-guidelines) and it records the answer in your intent layer, so it is never asked again.

### What the team already decided

Every decision somebody makes is recorded where it is made: a difference kept on purpose with its reason, a proposal answered yes or no, a difference accepted for now, a component checked by hand, a need nothing in the system fitted with what was looked at and why. Nothing gathered them, so a decision was only ever seen by whoever ran the command that made it.

Now they come together in one log, written to `DECISIONS.md` in the output folder. A `DECISIONS.md` your team wrote by hand is read as one more source and never rewritten.

A decision a person makes on purpose lives in your intent layer, on the page it is about: a component's, a pattern's, a template's, a flow's, a foundation's or the system's own. It sits under a Decisions heading, one line each: what was decided, what was ruled out, why, who and when. [Tell Claude](features.md#gather-usage-guidelines) and it writes the line for you to read first, and sends it to the layer only when you ask.

The style guide shows them in **History** (it was the Changelog): one table, a row per change, newest first, of what changed in the code, what changed in Figma, what changed in the intent layer and what was decided. Its columns are Date (with the time), Type, What, Done by and Affects. Each commit is a row of its own, with the person who made it and, for the code, the release it shipped in. A chip for each type shows only that type, and an issue with several commits shows them alone in a click. Each component's History area lists the changes to that component.

- **An intent layer change** is a card of its own: the pages it changed, the commit that made it, and the components those pages document. The engine keeps the last 50 changes it read, in the layer's snapshot.
- **Every row names who did it.** A decision already says who answered it. A row that is work instead (a commit to the code, a read of Figma, a change to the intent layer) says who did it, in the same place:
  - **One person:** *Done by* and the commit's author.
  - **Somebody else brought it in:** *Done by* the author, *pushed by* the committer, when the commit's committer is not its author, as when a maintainer merges, rebases or cherry-picks someone else's work. A commit pushed exactly as it was written keeps its author as its committer, so it shows one name: git does not keep who pushed.
  - **A pipeline:** a run started by a push, by hand or by a merge request names the person who started it. A scheduled run has nobody behind it, and GitLab names whoever owns the schedule, so the engine never takes that name: its commit says `Run-by: schedule`, and its row says *Done by the schedule*.
  - **An account:** a host's merge button, an app or an access token's bot is said as *a pipeline*, never as if it were a person.
  - **A name only**, never an address: the guide is shared with the whole team.

The part that pays is what agents get. A card now carries what was already ruled out and why, and `llms.txt` lists it under Decided against: an agent that does not know a thing was considered and rejected will propose it again, confidently, every time it is asked.

### Pages to review again

A page is right when it is written. Then its component changes: a prop is added, a value is dropped, a token is renamed. The page still says what was true before.

- **The engine notices.** It keeps each component's props, the values they take and its tokens from run to run. It also reads the code's history and the history of your Figma snapshots, from the snapshots store or from the commits of your own repository. Each commit is read once and kept, so a run reads only the new ones. It never asks Figma or GitLab again for this. The first read of Figma is not a change.
- **The page is marked, not removed.** On the Documentation page its status is Review, Changed since written, with what changed and since when. Agents still read every line, with a note beside it: check it against the contract.
- **A removed name is said.** When the page still names a prop or token the component no longer has, the page says which.
- **A person settles it.** Edit the page, or say it still holds. The answer is kept with who gave it and when. The page is not marked again until the component changes again.
- **Decisions too.** An answer the team gave (a part documented in its parent's page, a name kept, a page kept where it is) is dated the same way. When its component changes after it, the decision is marked to review again on its page and in History, and agents read it with the same note. It still stands until a person says. Say it still holds, and it is kept with who and when; withdraw it, and its question is asked again.
- **A component with no page is reviewed too.** When the team answered that a component needs no page of its own, and it changes, the Documentation page gives it a row: Review, Decision to review again, with the same answers. One documented in another page is reviewed on that page's row.

### Evidence first

When the engine proposes an answer to a decision (a page to write, a part to document in its parent's page, a name to keep, a page to review), it lists every answer it could take, each with what speaks for it:

| Where it comes from | For example |
|---|---|
| Figma | Its name sits under another component's |
| The code | Only one other file uses it |
| Products | Two products place it on its own, from the usage map |
| Your pages | The layer already documents other parts in their parent's page |
| Past decisions | The team kept the same name on another page |

Each piece is strong, some or weak. The answer with the most behind it is proposed. When another answer has as much, the proposal says the evidence is split and a person decides.

- **A change to a rule needs more than the engine.** A guard or a rewrite with nothing behind it but the engine's own reading is never proposed as a yes. It is shown with the rest, under a line saying the engine has no ground for it, with No as its answer until you say otherwise. A rule your page marks as a must, or a yes the team gave to one like it before, is proposed as usual.

### Who decides

Everything that waits on a person names the person: from `owners` in `ds-config.json`, by component or by area, with `*` for the rest ([Who owns what](audit.md#who-owns-what)).

- **On the Documentation page,** each row to review says "Waits on" and the name. A chip for each person shows only theirs: "Waiting on Cards team 3".
- **In the audit,** one line counts them: "3 waiting on Cards team, 1 waiting on QA lead".
- **An answer records who gave it.** When that is not the owner, the page and the command say so. The answer still stands; nothing is blocked.

### Your rules, read against each other

Everything written for an agent reaches it at once: your guidelines, each layer of your intent, every component's page and your project's `AGENTS.md`. Written at different times by different people, they start to disagree. The engine reads them side by side and hands you three lists:

- **Pairs that cannot both be followed.** Two rules about the same component where one allows what the other rules out, two counts of it (exactly one, against several), or two places it may only go. Whichever the agent reads last wins, so each pair is a decision nobody has made yet.
- **A rule written twice.** The same rule in two places in different words: two rules to read, one rule to follow.
- **Rules nothing can check.** A rule that names nothing your system has and that no check reads. It may still be good advice, but the agent carries it into every request and nothing can say whether an agent's work followed it.

Nothing is rewritten. Each line comes with both sentences and where each came from, for the person who owns the words, and each component's Documentation page lists the ones about it.

### Two questions agents ask your intent layer

Which token is for this? A token counts as answered when Figma's description, its own entry in the layer or a page that names it says what it is for. An entry that only repeats the token's name, its modes or what it points to is no answer. Is there a component the system doesn't have? The layer must say what to do when none fits, in one rule for every case, or an agent asked for a toast builds its own. Both show on the Documentation page, the second also in the audit's advice.

### Lists your intent layer copies

A prop table copied from the code, a whole token family listed by name, or a catalog of components written out on a page is flagged, right today or not, because it goes stale and agents take it for the whole list. Each says which generated file to link to instead: the component's contract, the file its tokens come from, or the contracts. A table that says what each token is for, an order of components, or a few picked out with a rule is guidance and left alone.
