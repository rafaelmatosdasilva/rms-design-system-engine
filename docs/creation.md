# Creation

How the engine makes new themes of your system, and builds prototypes with your real components. What each part promises, and what to ask for it, is on the [features page](features.md#creation). All pages: [technical documentation](README.md).

**On this page**

- [Design themes over your system](#design-themes-over-your-system)
- [Prototype with your real components](#prototype-with-your-real-components)

## Design themes over your system

The theme editor is built into every style guide the engine builds, and needs no extra install. While it is Coming soon on the [features page](features.md#design-themes-over-your-system), a built page does not show it: its New theme button and Create new theme… stay hidden. A page built for showing it turns it on in the page's own data (`enabled: true` in the `sg-theme-editor-data` block).

### Where it opens

- In a system with themes of its own, the Theme choice lists **Create new theme…** last. It unfolds into its four starts.
- In a system with no themes, a **+** button beside the mode switches opens the same four starts.
- Each theme you made is listed in the Theme choice too, with a pencil to edit it and a bin to delete it.

### The four starts

| Start | Today |
|---|---|
| From scratch | Works: the form below |
| From a Figma file | Takes the file's link and keeps it as a draft; reading its variables comes next |
| Upload tokens | Takes a JSON, CSS or .zip file and keeps it as a draft; reading it comes next |
| From references | Takes pictures and keeps them as a draft; reading them comes next |

### What the form sets

The panel shows the form on the left and a preview on the right, in a frame of its own. Only that frame takes the theme while you work, so the rest of the guide stays as your system draws it.

- **Name** and **font family**: the families your system uses, common web fonts, or any other by name. A font your computer lacks is loaded from Google Fonts, so what you pick is what you see.
- **Primary and secondary colours**, the **app background**, and each **gradient** your system gives in stops (a part's `background/start` and `background/end` tokens).
- **Button and card roundness**, **spacing** (every gap, padding and margin, scaled together), **border thickness**, **shadows** on or off and their **blur**.

Each setting reaches the tokens named for it and every token that follows them, so the whole chain changes and nothing else does.

### The preview

The preview opens on the **specimen**, a screen the engine builds from your own system, so every system has something to preview. Your Showroom's screens follow it in the same list.

- **One grid of components.** Every tile is a component as your code renders it, never a drawing. Buttons come first, primary leading, each with up to four of the variants its code renders. Then fields, choices, status, messages, navigation, surfaces, data and the rest.
- **Nothing invented.** The build plans the specimen (`lib/specimen.mjs`) and checks every component it places against the component catalog, with the same check prototypes, `--check-ui` and the MCP `check_ui` tool use. A component the check refuses, or one the code does not render, is left off. With no catalog yet (no audit has run), there is no specimen.
- **Full screen.** The button at the end of the preview's bar shows it at the screen's real size. Escape brings the form back.
- **Every screen scrolls.** A new screen shows only once the theme is on it, so your original brand never flashes first.

### Light and dark

- A colour is given in light. Its dark value is worked out the way your system moves its own: the same step of the scale, in the new hue.
- A new colour's ramp keeps each step as light as the system's own step, with its colour strongest at its own lightness.
- Every text and icon drawn on a colour is held to WCAG AA (4.5:1). When the worked-out colour falls short, the nearest shade that reads is taken instead.
- You can set a dark value by hand. The reset button beside it goes back to the worked-out one.

### One component's tokens

Click a component on the screen. It is picked the way Figma picks: the outermost first, then each click goes a level deeper, layer by layer toward where you clicked (a table, its rows, a row, a cell, its text).

- **What you edit stays marked.** The picked part keeps its outline and a label with its name. The head of the card shows the path to it, each step a click back, and lists the components inside it, each a click away.
- **Only its own tokens.** The form shows the tokens that part really draws with, as the browser's cascade decides, its hover, focus and press included. Hovering a token outlines the parts that draw with it.
- **Values as they are now.** Each token shows its value with the theme on it, in light and dark, and follows as you change the theme.
- **Units from how a token is used.** A token its rules use as `calc(var(…) * 1%)` reads as a percentage, an opacity from 0 to 1 as a percentage, a size in pixels as px, and anything else as a plain number.
- **Corner radius and text style.** A picked part shows its corner radius, and a text shows which of your text styles it is drawn in. Changing either changes that part in every copy of the component. A text style keeps changing per breakpoint as yours do, since it is set through the style's own variables.
- **The app background.** Clicking where no component is picks the screen itself.
- A change there wins over the theme's wider settings. **Done** brings the theme's own settings back.

### Where a theme is kept

| Place | What it holds |
|---|---|
| This browser | A working copy of each theme, and the one in use, kept per system so a theme made on one guide never shows on another |
| Your themes folder | One file per theme, `<name>.theme.json`, in a folder per system: `~/.claude/rms-design-system-engine-themes/<system>/` unless `styleguide.themes` names another |
| The team's themes store | Every theme the team made, when `stores.themes` is set: each build sends yours that it lacks |

- The first save asks for the folder once (Chrome writes into it from then on). Other browsers download the file, to be put there by hand.
- The next build reads the folder back into the page. A newer file replaces the browser's copy, and a theme you deleted is not brought back.
- The link names the theme in use (`?theme=coral-reef`), so a link opens the guide with it.

### What it never does

- It changes no code. A theme is tokens over your system, never a change to the system or to a product.
- It is kept outside every project, so nothing you try lands in a repository by accident.

The settings are in [the configuration reference](../reference/config.md).

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
### Several directions, not the first one that fits

A request used to get one answer. The catalog named the components it touched, whoever read it picked a shell that fit, and a page got built. That is one direction out of several your system already supports — chosen by whoever read first, and invisible to everyone afterwards.

So the directions are named before anything is written:

```
3 DIRECTIONS  each built on the system, to compare before one is chosen:
   1. BoardPage — Records in columns by status, dragged between them. (the request names it)
      built from: DataTable, Button
   2. ListPage — A list of records starts here. (another shell the documentation offers)
      built from: DataTable, Button
   Build each as its own prototype and compare them; the components are the same, the shell is what differs.
```

Each direction starts from a shell your documentation actually describes, says what that shell is for in your documentation's own first sentence, and is built from the same components. **What differs is the shell, never whether the page is the system's.**

Two things it will not do:

- **It never invents a direction to reach a number.** A system with one documented shell gets one direction, and says so plainly: *"Another direction would be invented, not the system's."* Three made-up alternatives would be worse than the single honest answer they replaced, because each would read to a reviewer as something your team had decided.
- **It never offers a panel, a drawer or a dialog as a way to build a page.** Those live *inside* a page. A shell is excluded by what its name says and by what your documentation says it is for.

A shell your documentation says nothing about still appears, and says it has none — being undocumented is worth seeing, not worth hiding.

### A prototype is the journey, not a screen

You take a prototype to a user test, hand it to a development team and show it to a client. Isolated pages fail all three — so a folder of pages that do not link is a failure, not a partial success.

The engine already knew which pages were joined and never said anything about the ones that were not. Now it does:

```
⚠️  3 prototypes and no link between any of them (orders, detail, settings): this is a
    folder of pages, not a prototype. Give the part that leads on "goesTo": "<page>", so
    it can be clicked through in a user test and handed on as one thing
```

And for a page left out of an otherwise joined-up prototype:

```
⚠️  nothing leads to "settings" and it leads nowhere: it is drawn beside the prototype
    rather than in it. Give the part that reaches it "goesTo": "settings", or say it is
    a page of its own
```

Three things it deliberately stays quiet about:

- **One page.** One page is not a flow, and saying so would be noise.
- **A page your own written flow already names.** The step that fails to link to it says the same thing; one mistake should not read as two.
- **A page that is reached and stops.** `--prototype --flow` already names it under `ends:`, beside the start and the links, which reads better than the same fact alone in a list of faults.
### A page's own navigation

The flow check reads what leads from page to page. It knew nothing of what moves *inside* one — so ask for "a page with a tab for each section of the account" and the page comes back with a tab strip, four tabs, one panel, and every check calls it whole. In a user test the second tab does nothing, and the person running the test finds it rather than the engine.

A composition already says how something moves inside a page: a part carries `opens` with the id of the part a click shows. So the reading is narrow:

```
⚠️  "account" has TabStrip (3 choices) and nothing on the page opens anything: in a
    user test the second choice does nothing. Give each choice "opens" with the id of
    the part it shows, or say the page is one view and the choices lead elsewhere
```

Tabs, segmented controls, steppers, side rails, accordions and pagination all count. **One choice is not navigation** and says nothing.

**What it deliberately does not ask:** whether the right panel sits behind the right tab. A composition does not say which choice shows which part, so one `opens` anywhere on the page is enough. Guessing the pairing would be an opinion with nothing under it — which is the thing this check exists to catch.

### What a prototype still owes a developer

Your prototypes are meant to reach production — handed to the development team as the starting point, not as a picture to rebuild. What that needs was written down nowhere, so the handoff was a conversation each time, and the parts obvious to whoever drew the page were the parts that got missed.

At the end of a run, the engine says what is left:

```
🤝 BEFORE A DEVELOPER TAKES "Orders" FORWARD  4 of 4 thing(s) the product does,
   that this page does not yet:
   • a route — the product declares its pages with a router (src/router), and nothing
     here registers this page: a developer has to wire it before anyone can reach it
   • its data from the store — the product keeps state in a store (src/stores), and
     this page carries its own: the numbers on screen are the ones somebody typed
   • its words as translations — the product has translated words (src/locales), and
     the words here are written into the page: they would ship in one language
   • a test — the product has tests, and this page has none
```

**Every convention is read from your product, never assumed.** No router in your dependencies and nothing asks for a route. No translations and nobody mentions hardcoded words. A list of good practice your project never adopted would be noise — and worse, it would read as your team's own rules.

Two more limits worth knowing:

- **A store and translations are only owed where the page actually carries words of its own.** A page with nothing hardcoded has nothing to move yet, and asking would be inventing work.
- **The engine says these, it never does them.** It does not write your product's code, so no route is registered and no translation key is created. This is the list a person works through, in their own project.

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

### What a template's body holds

A template is the shell of a page; what goes inside it is the page. The check read whether a page **started** from a template and never read what the template was **filled with**.

In one run the agent put radio buttons inside a filters panel. The team uses dropdowns — and nothing in the documentation says which control a filter takes, so the check had nothing to hold the page to and said nothing. The prototype reached review teaching a control nobody had chosen.

Now the body is read against what the documentation says it holds:

- **The documentation describes the body, and the page put something else in it.** Named as this prototype's choice, so a reviewer knows it was not decided.
- **The documentation never says what the body holds.** Said once for the template, listing what went into it — not once for every component.

```
FiltersPanel's documentation says what its body holds and never names RadioGroup:
it is this prototype's choice. Keep it and put the question to the team, or use
what the documentation names
```

A **warning**, never an error. What the page does may well be right; what is wrong is that nobody decided it. Said once per template, with a long body counted rather than listed. With no documentation read at all, nothing is held to a body — a page questioned because nothing was loaded would be worse than silence.

### A pointer nobody can follow is not documentation

A page whose whole documentation reads *"See the Filters family spec"* — where there is no Filters spec — counts as **documented** to every check that asks. It is not: nobody can follow it.

So a page whose documentation is only such a pointer becomes an open question instead, reaching whoever makes a page the same way the intent layer's own questions do:

```
Orders: its documentation is only a pointer to Filters, and there is no Filters
to read: nothing says what this page is for or what goes on it. What should it say?
```

A page that says anything of its own is documented, however thin — only a pointer and nothing else counts as none.

### A gap reaches the team by itself

A prototype finds what your system does not have — a component it lacks, an option, a token. Those used to sit in a file and a chat, and someone had to remember to carry them to the people who decide. On the run this came from, they were only written up after being asked for twice.

Now the check drafts them itself, on the page each one belongs to:

```
3 gaps drafted for the team, on 2 pages:
   Button - Options: 1
   System - When to use: 2
   Written here only. They reach the team's drafts with --commit:
   the intent layer is theirs, not the engine's.
```

**Each gap goes where it would be answered.** One naming a component of your system goes on that component's page, under the section that would answer it (an option under Options, a token under Tokens). One naming nothing your system has is the System page's — it is a thing your system does not have yet. A page is never guessed from the words of the need: only a component name your system actually has counts.

**Nothing is sent until you ask.** The intent layer is your repository. The drafts are written locally and reach the team's Drafts to review with `--commit` — the same gate `--draft` has always used.

Each line says what was needed, what the prototype did meanwhile, and which prototype asked, so whoever reads it can go and look.

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
