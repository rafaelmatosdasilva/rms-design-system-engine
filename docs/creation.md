# Creation

How the engine builds prototypes with your real components. What each part promises, and what to ask for it, is on the [features page](features.md#creation). All pages: [technical documentation](README.md).

**On this page**

- [Prototype with your real components](#prototype-with-your-real-components)

## Prototype with your real components

### What it writes for agents

`contracts/llms.txt` says what to use, not only what exists. It opens by telling an agent three things.

- The design system is part of the project.
- Build nothing by hand that a component covers.
- Ask `--query` before guessing a name.

Each component's line names its props as the code takes them. Where Figma and the code call the same prop by different names, the code's name is the one printed, because what the agent writes is code and the Figma name is one the code refuses.

**It also notices when an agent did not read.** `--catalog` remembers which components' cards it handed over, and `--check-ui` says which components the generated page used without one. It is a warning, never a refusal — a card can reach an agent another way — and a project where nothing has been handed over yet says nothing at all rather than flagging everything. Agents that skip a component's card are where most layout and prop mistakes start, so this names the cause instead of the symptoms.

Then it says which source decides when two disagree. The goal of the people who use the product first, then verified research, then the system's documented standards, then accepted past decisions, then general heuristics, with this system's own source named at each level and WCAG 2.2 AA as the floor. Under the tokens it says what each is for in your team's own words, from the descriptions you write on the variables in Figma, the brand's first, so an agent picks a colour by its purpose and not by its name alone. The notes your team writes in Figma outside any component (on its foundations, brand and pattern pages) are said too, by page, once the annotation categories are read (`--annotation-categories`); a note for whoever draws the file (Authoring) is left out. It stays small enough to read whole. For a large system the full catalog stays in `catalog.json`.

### It clicks the page, not only draws it

A page can look finished and do nothing. A menu toggle that never opens, a close button with no hover, a sortable header that sorts nothing — all of them photograph perfectly, and all of them cost a reviewer the time the check should have spent.

So the check uses the page it drew. It reads what each control says about itself, and then it clicks the rest:

| What it tries | What it expects |
|---|---|
| A part that opens another (a dialog, a menu) | It shows, the focus moves inside, Escape closes it, the focus comes back |
| A field | It takes what is typed |
| A toggle (a switch, a toggle button) | It flips, and flips back |
| A part with `aria-expanded` | It shows what it controls, and hides it again |
| Everything else clickable — a row, a sortable header, a checkbox over a list, load more | Clicking it changes something on the page |

That last line is the one that catches most. A row or a column header says nothing about itself in its markup, so there is no attribute to check: the page is simply watched while the control is clicked, and a control that changes no element, no attribute and no text anywhere is named.

This runs for a page written in your product's own code as well as for a composition. The page is drawn fresh for it, so a control is judged on the page as a person meets it, not on one the size checks have already stretched.

### The code's own width, beside the design's

A card used to say what the design drew and nothing about what your code does with it. That is half the story, and the missing half is the one that breaks a layout: an agent kept filter buttons at the width the design gave them, laid three beside a search bar the code lets fill the row, and every label was cut to a letter.

So each card now carries both:

```
width:             fixed at 90px, never under 200px
width in the code: fixed at 90px, never under 70px
```

Where the two disagree, the page check says so — naming both sides and the rule in your code that decided it, so you can go straight to it.

**It reads your code's capture, never a component's own file.** A width usually lives in a rule several components share (a dropdown's 280–500 in its base, through tokens), and reading one file alone would call it missing.

**A difference is a finding, not a gap.** A gap means your design system lacks something and the design team must decide — that list writes into Figma. A width the code and the design disagree about is neither: it is a fact about the code, reported where the other page findings are.

**Every reading says how sure it is.** A value read from one source alone, or one your two readings disagreed on, is marked as such rather than printed as plain fact; a width the capture could not read is said out loud, because silence would read as "the code constrains nothing" — the opposite.
### A behaviour has to rest on a rule

Someone asked for nested rows that select with their parent. The agent built exactly that — and no rule in the system covered it, while the system's own helper did it differently. The prototype taught the team a pattern nobody had decided.

A review request is a **question about your documentation**, not an instruction. So when a page wires one of these behaviours and nothing in your documentation describes it, the check says so:

| Behaviour | Wired as |
|---|---|
| selection | `select`, `selected`, `v-model`, `checked` |
| sorting | `sort`, `sortBy`, `order` |
| expansion | `expand`, `expanded`, `toggle`, `collapse` |
| filters | `filter`, `filters` |

```
Table wires selection (update:selected) and no rule describes it:
leave it as the code does it, and put the question to the team
```

Each card says which behaviours your documentation already covers, so an agent knows before it wires one — and says nothing where it covers none, since most components select, sort, expand and filter nothing and a line on every card saying so is noise.

A rule counts as covering a behaviour when the component's own documentation describes it, or when a product rule names that component. A rule about a gallery does not license sorting on a table.

Said once per component and behaviour, never once per use. And when no documentation has been read at all, nothing is held to a rule — reporting every behaviour on every page because nothing was loaded would be worse than saying nothing.

### A preview to review it in

The route writes a prototype in your product's own code and checks it — and used to leave nowhere to look at it. On the run this came from, the agent built a viewer by hand, and reviewing the page in it is where most of what the check missed was found. Every team would otherwise build that same thing.

```
rms-design-system-engine --prototype prototypes/settings.vue --preview
```

It is **the page the check measured**, served by your project's own build — not a second rendering that might differ. Each gap is outlined where it sits and labelled with what is needed, so a need the system does not meet is visible rather than buried in a list:

```
Preview: http://localhost:5173/…
   2 gaps are drawn on it where they sit: each is a need the system does not meet.
```

Only when you ask for it. A server nobody wants is a server nobody closes; Ctrl-C ends it.

### Icons are held to the ones your code has

A prototype uses your code's icons, never Figma's. An icon that exists only in the Figma library — or one an agent invented from a name it saw there — renders as **nothing** in the product: a blank where a control should be, on a page that otherwise looks finished.

So every icon a page passes is held against the symbols your code actually defines, and one it does not have is an error, with the nearest name your code does have:

```
Button icon="searc": the code has no such icon, so it draws nothing (its nearest is "icon-search")
```

The name is compared bare, so `chevron-down` and `icon-chevron-down` are the same icon however your project writes it.

Two things it deliberately does not do. A value the page decides at runtime is left alone — the check cannot know what the data holds, and guessing would be worse than silence. And a project whose icon sources it could not read says nothing at all, rather than calling every icon on the page missing.

### Lessons: a correction becomes a guard

When you correct what an AI made, the correction is usually said once, in a chat, and lost. The next agent makes the same mistake. A lesson keeps it.

**Keep one.** [Tell Claude](features.md#prototype-with-your-real-components) what was wrong and why, or run `rms-design-system-engine --lesson "<what was wrong>" --why "<your reason>"` (add `--component <name>` when it is about one component).

- It is kept in `design-system-engine-lessons.json`, beside your other decisions, with who said it and when. Commit it.
- Why is required. The AI asks you for it and never writes one for you.
- The same lesson told again is not a second lesson: it is the first one coming back.

**Each lesson is proposed in the strongest form that holds it.** The engine says which, and where a yes writes it:

| Form | When | Where a yes writes it |
|---|---|---|
| A check | The engine can measure it: a component inside another, a prop combination, a value written by hand, an import with what replaces it | The authored contract (`neverCombineWith`, or its `guards`), or `imports` in `ds-config.json`. The edit check holds it from the next edit |
| A step agents read | It is about how the agent works, such as asking before adding a token | Said to the agent with every request in Claude Code, and in the engine's section of `AGENTS.md` and the other instruction files that have it |
| A rule for your guidelines | Anything else | One sentence a reviewer can check, drafted on the component's page or the System page of your intent layer, for your team to approve |

Answer with `--lesson-answer <id> yes` or `no`. A no is kept too, so the same guard is not proposed again. `--rule "<sentence>"` gives a step or a rule in your own words. Only your answer writes anything: the hooks ask you first.

**Where corrections come from.**

- **What you say.** Any correction, recorded as above.
- **A line you changed.** The hook remembers the lines an AI writes. A line that is gone without an AI edit taking it was changed by a person. `--lessons` lists it, with what it reads now, and `--lesson --edit <n> --why "<reason>"` makes it a lesson. It is never one until you give why, and `--unlesson --edit <n>` takes it off the list when it was no correction. A file rewritten or reformatted as a whole is not read as corrections.
- **A finding marked wrong.** A [finding you mark wrong](audit.md#when-a-check-is-wrong), a page review's among them, is a correction of the engine. Its guard is already written: the case its check must pass.

**Findings that repeat become proposed rules.** The same page-review finding on three Showroom screens, the same decision [a model judged](#a-model-judges-each-screen-when-you-ask) broken on three screens, or the same edit-check finding in three edits, is proposed as one sentence (`R-page-primary`, `R-judge-primary`, `R-edit-colour`):

- A page review's becomes a rule for your guidelines, such as "Each screen has one primary action in view".
- A model's judgment becomes one too, such as "A destructive action never looks more prominent than the main decision".
- An edit check's becomes a step agents read, such as "Write every colour as one of the system's colour tokens". The check already catches it; the step tells the agent before it writes.
- Only decisions that should be the same every time are named. A judgement, such as which section of a page matters most, never is.
- A finding that stays on one screen is counted once. Fixed and made again, it counts again.

**A lesson that comes back is said.** When the same mistake is found again after its guard was written, `--lessons` and the run say so, with the guard that did not hold. A check that caught it held; the agent was still not told before it wrote.

**Where you see them.**

- Every full run ends with one line: how many lessons hold and as what, what waits for your yes, and what came back.
- `--lessons` lists each lesson with what it became, the proposed rules and the changed lines. `--unlesson <id>` takes one back.
- The style guide shows them with the decisions, on the History page and on each component's History, with what each became.
- Agents are told what a lesson ruled out, the same way they are told every other decision.

The page review reads each screen's structure. How a page looks, rather than how it is built, is judged only when you ask a model to (below), and a lesson about it is kept as a rule for your guidelines.

### A model judges each screen, when you ask

The page review measures what it can: one main action, nothing destructive in front, no card in a card, headings in order. Some decisions can't be measured. Is this the right component for what the part does? Does one action really read first, as the screen is drawn? `--judge-pages` asks a model, and only when you run it.

**What the model gets, for each Showroom screen.**

- Its screenshot. A picture kept beside the screen (`showroom/<Screen>.png`) is used as it is; otherwise it is taken from the built style guide, at Figma's size, in the screen's brand and mode.
- Its code, as a short outline: each component and element, the props that decide how it looks, its words and its line.
- The components it uses, each with what your intent layer (or Figma's description) says it is for.
- Its brief, when one is known: `"brief"` in its `<Screen>.json`, or a `<Screen>.brief.md` beside it.

**What it judges.** A short, fixed list of named decisions, the same on every screen and every run:

| Decision | What holds |
|---|---|
| `component` | Each part uses the component made for what it does |
| `primary` | One action reads first; every other looks secondary |
| `destructive` | A destructive action never looks louder than the main decision |
| `layout` | The screen is arranged as its brief says. Not judged when the screen has no brief |

- `pageJudgment.decisions` in `ds-config.json` judges fewer of them. A name the engine doesn't know is said and left out.
- Anything not on the list is left unjudged, so pages keep room to differ.

**What comes back.** For each decision: holds, breaks or unclear, how much it matters (high, medium, low), what the model saw, and one sentence a reviewer can check on the screen.

- It is advisory. It never fails a run.
- The style guide shows it under each screen in the Showroom, beside the page review, headed "Judged by a model".
- The run ends with one line: what broke, and what it cost. Each full run repeats the last judgment's line, with what it cost then. Nothing is asked again.
- A decision judged broken on three screens becomes a [proposed rule](#lessons-a-correction-becomes-a-guard), like the page review's.

**What it costs.** It spends your model tokens: one request per screen, through your own command.

- The default is `claude -p`, allowed to read only the screenshot, with its answer and its price printed as JSON. `pageJudgment.cmd` changes it: any command that reads the prompt on stdin and prints the answer. A command that doesn't print a price is said to.
- Each answer is kept by the screenshot's hash and the rubric's (the decisions asked, their words and the brief). A screen that didn't change is never paid for twice; change the screen, the brief or the decisions, and it is asked again.
- Everything stays in the engine's own folder: `.design-system-engine-out/page-judgment.json` (the last run), `page-judgment-cache.json` and the screenshots it took.

### Does your guidance help your AI tools?

`node lib/eval-run.mjs --levels bare,steering,parity` runs the same generation tasks three ways, with the prompt alone, with your own instruction files (`AGENTS.md`, `CLAUDE.md`, rules), and with what this skill writes for agents (`contracts/llms.txt`). Each is scored by the same checks, design-system tokens and classes and accessibility, so you see what each kind of guidance adds or costs.

- **Finding the component is part of the test.** A case names the component it expects (`"component": "chip"`), and the agent never sees it. A result that builds its own instead fails. A prompt that names a component is flagged before the run.
- **Type checks.** When results are `.tsx` or `.jsx` and a TypeScript compiler is at hand, each one is type-checked against your components' props (`"evals": { "compile": false }` turns it off).
- **What it needs.** Your own generate command in `ds-config.json` (`evals.generate.cmd`). It spends your model tokens and never gates the repo. With `--ci` it fails when a run is worse than the last one.

### Is your guidance ready for agents?

`rms-design-system-engine --guidance-rating` rates the guidelines files and Figma's descriptions for what an agent can take from each component, and writes `.design-system-engine-out/guidance-rating.json`.

- **Per component.** Ready, partial or thin, from its own section (headed with its exact name), what it is, when to use it and when not, its role, an example, and its properties named as Figma names them.
- **Stale names.** A name in backticks that is no token, property or component of the system is listed to rename or take out.
- **The extraction test.** `--extract` asks a model, through `guidelines.extract.cmd` (`claude -p` by default), the options of each property from the guidance alone, and scores the answers. It uses your model tokens.
- **The guidance evaluation.** `guidelines` is a level of `eval-run.mjs --levels`, so you see whether agents build better with your guidelines.
- **In the style guide.** Each component's rating sits in its Documentation area.
