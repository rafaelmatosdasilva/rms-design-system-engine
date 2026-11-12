# Features and capabilities

What the engine does for design and product teams. Every part reads the same knowledge about your system, so what one learns, the others use. Each part says what to ask Claude Code for it, in its **What to ask** table, and [Set up](#set-up) has the requests that set the engine up. How each part works is in the [technical documentation](README.md). The page is also the roadmap: the parts marked Coming soon are what comes next.

**On this page**

### Audit

| Feature | What it does | Status |
|---|---|---|
| [Check your Figma library rules](#check-your-figma-library-rules) | The patterns, architecture and rules your Figma library is built on, with a score for how well you follow them. | Ready to use |
| [Measure Figma-code parity](#measure-figma-code-parity) | A deep design-code comparison of colours, sizes, states and spacing in every mode, as a real browser draws them (25 gates). | Ready to use |
| [Test accessibility](#test-accessibility) | Contrast, keyboard focus, touch targets and zoom on every component, checked on the Figma designs and in a real browser. | Early development |
| [Lint your codebase rules](#lint-your-codebase-rules) | The patterns, architecture and rules your codebase is built on, with a score for how well you follow them. | Coming soon |

### Documentation

| Feature | What it does | Status |
|---|---|---|
| [Write component specs](#write-component-specs) | A contract per component with its props, states and tokens, written from Figma's descriptions and the code. | Ready to use |
| [Gather usage guidelines](#gather-usage-guidelines) | The intent layer, why each component exists and when to use it, gathered from Figma, your code's comments and your docs. | Ready to use |
| [Annotate Figma from the code](#annotate-figma-from-the-code) | Accessibility specs written into Figma, problems pinned on your screens and each component linked to its code, after you approve. | Coming soon |

### Collaboration

| Feature | What it does | Status |
|---|---|---|
| [Publish a living style guide](#publish-a-living-style-guide) | The team's control center, with Figma, the code, your docs, accessibility and decisions in one place, updated on every push. | Ready to use |
| [Try components in a playground](#try-components-in-a-playground) | A component's props changed live, in every state and theme, as the code draws it. | Early development |

### Creation

| Feature | What it does | Status |
|---|---|---|
| [Design themes over your system](#design-themes-over-your-system) | A new theme of your system's tokens, its colours, type, corners and spacing, set live in light and dark. | Coming soon |
| [Turn Figma into code](#turn-figma-into-code) | A Figma-only system turned into code, piece by piece, with each one checked. | Coming soon |
| [Turn code into Figma](#turn-code-into-figma) | Anything that exists only in your code, turned into Figma with its props as properties and its tokens as variables. | Coming soon |
| [Generate in Figma from a prompt](#generate-in-figma-from-a-prompt) | Anything your system holds, a component, pattern, template or foundation, described by you and drawn in Figma from its rules. | Coming soon |
| [Generate in code from a prompt](#generate-in-code-from-a-prompt) | Anything your system holds, a component, pattern, template or foundation, described by you and written in code from its rules. | Coming soon |
| [Prototype with your real components](#prototype-with-your-real-components) | Prototypes built by AI from your real components, with nothing invented getting past the checks. | Coming soon |

## Set up

Copy a request into Claude Code, or say it in your own words. Each part below has its own **What to ask** table; these set the engine up.

Name a component the way your system does (button primary, Button Primary and primary button all work). When a word fits several components, such as *button* in a system with buttonPrimary and iconButton, Claude asks which one first.

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine set up this project` | Asks where your code and Figma are, then sets the project up |
| `/rms-design-system-engine check the install` | Each problem with the install, and its fix |
| `/rms-design-system-engine use these guidelines <link>` | Your written guidelines from Notion or GitLab, read on every run |
| `/rms-design-system-engine use this intent layer <link or folder>` | Your intent layer (DSDS or Markdown pages on GitLab, GitHub or in a folder of your project, or pages in Notion or Confluence) read into each component's documentation, its contract and `llms.txt`, and a page that says what agents use from it |
| `/rms-design-system-engine refresh the Figma data` | Figma read again, the best way available |
| `/rms-design-system-engine take the hosted token stylesheets again` | The stylesheets your product loads its token values from, downloaded again into one local file, every mode of them, with the address kept so a later run does it by itself |
| `/rms-design-system-engine scan from this Figma branch <Figma link>` | The branch read instead of the main file, so edits on main do not restart a scan |

## Check your Figma library rules

**Ready to use** · **Why it matters:** Every other result is only as good as the file it compares against.

*Today: it only reads Figma. Renames are applied after you say yes. Every other fix is for your design team to make.*

- Finds values with no token or style, detached instances, missing auto layout and missing descriptions.
- Writes down how your system builds components and tokens (names, properties, layers, variables) and lists the ones that break it, on the style guide's Rules page, beside the code's.
- Fixes a component's construction, such as renaming its layers, after you say yes.
- Compares components of one kind, so every button sets its states and names its options the same way.
- Says when the file is not reliable enough to compare, before any result.

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine how does our system build a component in Figma?` | Its construction rules (names, properties, variants, layers, auto layout, variables), each with how many components follow it, and the questions only your team can answer |
| `/rms-design-system-engine fix the construction of the chip in Figma` | What the chip must change to follow how your system builds components, renamed in Figma after you say yes |

## Measure Figma-code parity

**Ready to use** · **Why it matters:** No more visual QA by eye. Drift is caught before release, not by users.

*Today: each component is measured in a real browser. Components with no page to open are drawn straight from their own code, which works for most React and Vue components, not yet for all. One that cannot be drawn says why.*

- Compares every colour, size, font, shadow and duration with Figma, in every mode (light and dark, phone and desktop).
- Checks each component's options, defaults and states: hover, focus, pressed, disabled and selected.
- Measures heights, spacing, corners and alignment as a browser draws them, not with a screenshot.
- Finds the code file of each Figma component on its own, so nobody writes a map.
- Checks icons, slots and the parts inside each component.
- Reads Tailwind classes as fully as CSS: each variant, state and mode, type, shadow and motion, from a v4 `@theme` or a v3 `tailwind.config`.
- Checks that a brand changes only values, never which parts a component draws or how they are laid out.
- Warns when a Figma frame changed since the version you approved.
- Puts every difference in one list, with who fixes it: the designer in Figma or a developer in the code.
- Runs 25 checks, called gates, each listed in the [technical documentation](audit.md#the-gates).
- Compares how components move and what they draw beyond their colours, such as shadows and blurs. *(Coming soon)*
- Checks each product page against its Figma screen: which components, their order, spacing and alignment. *(Coming soon)*

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine check everything` | Every check, a summary and every difference in `differences.md` |
| `/rms-design-system-engine check the button` | The same, for one component |
| `/rms-design-system-engine check the button against Figma, without accessibility` | Every check against Figma, without accessibility |
| `/rms-design-system-engine run only the token values check` | One check, by number or name |
| `/rms-design-system-engine which component should I fix first?` | The component with the most left to fix |
| `/rms-design-system-engine what did the last audit find?` | The last run's summary again, with nothing run anew |
| `/rms-design-system-engine accept the chip radius as known debt` | One known difference accepted, the rest still checked |
| `/rms-design-system-engine keep the chip height on purpose because the product needs a larger tap target` | One difference kept with your reason, never failing a check |

## Test accessibility

**Early development** · **Why it matters:** Problems are fixed once, in the component, not in every screen later.

*Today: automated checks against WCAG 2.2 A and AA. They find many failures, but they cannot prove a product meets WCAG or judge whether its words make sense. What a screen reader says is read from the browser, not from VoiceOver or NVDA themselves.*

- Tries every component in a real browser, in every state and colour mode.
- Measures contrast against what is really painted behind the text.
- Follows the Tab key through each page to find traps, lost focus and controls a keyboard never reaches.
- Measures touch targets, on the page and again on a small 320 pixel screen.
- Checks reading needs: text spacing, zoom, high-contrast mode and colour blindness.
- Says how sure each finding is: blocker, warning or advisory, in one verdict per component.
- Turns each finding into a task for a named person: a designer, a developer, whoever writes the words, whoever owns the flow, or a check by hand. One criterion often needs two of them (a colour pair is picked in Figma, then used in the code), so each gets their own task, in order. The style guide filters by person, so a team sees only its own work.
- Tells a person how to check what no machine can decide: a few short steps per criterion (zoom to 200%, try to select the text), the command that records it, and who checked, when and with which browser and screen reader. The record expires on its own when the component changes, and the page says it is to check again.
- Tries what belongs to a page across your products' own pages: a title and a language, a skip link, the same navigation and help in the same place, and a flow that never asks twice. What only a person can decide, such as a payment step, is left to a person.
- Checks the Figma file alone, before any code exists: text contrast in every mode, a focus ring, 24 pixel targets, and a note for each role and name.
- Puts each gap the Figma file has on the design team's to do list in Figma, once you say yes.
- Tries again only what changed, so a second run takes seconds.
- Fails a merge request or pull request that adds an accessibility blocker the last build did not have, and says what it fixed.
- Checks your designed screens in Figma for contrast and target size. *(Coming soon)*

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine check the accessibility of the button` | WCAG 2.2 A and AA in a real browser, with axe-core |
| `/rms-design-system-engine badge 1.3.3 is checked` | A criterion marked as checked by a person |

## Lint your codebase rules

**Coming soon** · **Why it matters:** The token layer is where a system ages badly, and shortcuts in products pile up. Both are cheapest to put right early.

*Today: everything here is advice and fails no run, except values written by hand, whose count may only go down, and a push whose change uses something with a finding.*

**In your tokens and themes**

- Tokens named by look (blue-500) or after a product, instead of by role.
- Aliases that point at a removed token, with the change that removed it.
- Tokens in a layer where they never change, that could live a layer up.
- What breaks only in a combination of modes, such as dark on a phone.
- Brands that pin a value they should inherit from the brand they extend.
- Two components whose own rules are nearly the same.
- A health number per area on the style guide's Status page.

**In your apps' code**

- Writes down the rules your code already follows and lists what breaks them, on the style guide's Construction page, beside Figma's.
- Spots a product screen or an AI edit that builds its own copy of a system component.
- Counts colours and sizes written by hand, with the token to use instead, and keeps the count going down.
- Finds classes your markup uses that nothing styles, and styles nothing uses, each with its file and line.
- Gives your code one health number from its own rules, by area, with the change since the last build.
- Counts a rule you already wrote into your ESLint or stylelint config as decided, and says where.
- Flags CSS variables and text casing the design never asked for.
- Finds a control laid over a component, a sign it is missing an option. The same one built three times is a gap in the system.
- Sorts each gap and each proposed change into local (it stays in one product) or shared (it changes what other products get), with the reason in one line. Only the shared ones wait on the person who decides.
- Checks Tailwind classes against Figma.
- Warns at a commit and stops a push, only for what the change uses: a value written by hand, a name the system does not have, or a difference in a component it uses. The rest of the system's debt never slows a commit.
- Names faults in a component's own code that show only when a screen uses it, such as a click that fires twice. *(Coming soon)*
- Keeps what the system lacks on a list for your design team, and sends it to Figma as to-do cards after you say yes. *(Coming soon)*
- Renames a token everywhere in one change, with a patch for each product. *(Coming soon)*
- Lists every place still using a retired component or token, with what to use instead. *(Coming soon)*
- Tells each product which system version it runs, and what a newer one changes for it, in its code and its docs. *(Coming soon)*
- Names a product late to move on the Status page, for its own team. *(Coming soon)*
- Opens one issue per difference in your tracker, and closes it once it is fixed. *(Coming soon)*
- Reviews the screens a product builds with the system as pages, and scores each out of 10. *(Coming soon)*
- Reads products kept in their own repositories. *(Coming soon)*

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine write the generated UI to ui.json and check it against the design system` | Each component, prop or value the generated UI uses that your system does not have |
| `/rms-design-system-engine how does our code build a component?` | Its construction rules in the code (files, props, states, class names, tokens, shadows and corners), each with how many components follow it and which do not |

## Write component specs

**Ready to use** · **Why it matters:** Developers and AI tools build from the same spec, and nobody keeps it up to date by hand.

*Today: contracts are rewritten on every run. A component with no description is listed, since a description is what an agent reads first.*

- Writes a contract for each component: its props, variants, states, tokens and the components it nests, from Figma and the code.
- Writes the one file AI tools read, with what to use, what each token is for and what was already decided against.
- Pairs each text colour with the surface it was made for, so nobody picks a different grey on every card.
- Publishes the contracts to a shared repository, and in the DSDS format for teams that document their system that way.
- Writes the contracts in the open component specs format too: each component's parts, props, slots and the tokens each part uses.
- Records each breaking change as a release of the system, so products know what moved.
- Shows on a merge request or pull request what it changes in each contract, what breaks and which products use the component.
- Checks your Figma Code Connect mappings against the contracts.
- Drafts a Figma Code Connect file for each component that has none, from what its contract pairs. A person checks it and publishes it.

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine which props does the badge take?` | A component's props and where it is used, or a token's values |
| `/rms-design-system-engine draft the Code Connect files` | A draft Code Connect file for each component that has none, from its contract, in the engine's own folder, with a TODO for what a person decides |

## Gather usage guidelines

**Ready to use** · **Why it matters:** What designers know becomes something teammates and agents can read.

*Today: it reads DSDS or Markdown and MDX pages from GitLab, GitHub (Enterprise too) or a folder in your project, and pages kept in Notion or Confluence. Its own fixes go back where the layer lives, in its own format: a commit or a merge request on GitLab, a commit or a pull request on GitHub, or the pages in your folder rewritten for you to commit. Notion and Confluence are only read: each fix is listed for a person to make there. The engine writes only what it is sure of. Everything else is a draft for a person to approve.*

- Reads your documentation where it already lives: a docs folder, a documentation site's pages, the `.mdx` beside each component, or a Notion or Confluence page and the pages under it. A component's usage, accessibility and style tabs become one page, and Do and Don't examples become when to use it and when not.
- Reads what your engineers wrote in the code too: a component's own comment and the doc comments above its props, used where your pages and Figma say nothing.
- Shows why each component exists, when to use it and when not, beside Figma and the code.
- Writes what it is sure of, such as the element a component renders, and drafts the rest, such as an example, for a person to approve.
- Drafts an example on each page that shows none: the call the products write most, in the code's own syntax, with only what the contract has and where it came from.
- Lists the components with no page, most used first, and starts pages for the first ones, with what they are for and when to use them drafted from their contracts.
- Keeps every decision in one history: differences kept on purpose, proposals answered, what was ruled out and why.
- Marks a page to review again when its component changes after the page was written: what changed and since when. Agents still read the page, with a note beside it. A person confirms it, or edits it.
- Does the same for the team's answers: a decision whose component changed since is marked to review again, confirmed or withdrawn by a person.
- Shows each proposal with every answer it could take and the evidence for each: where it comes from (Figma, the code, the products, your pages, past decisions) and how strong it is.
- Names who decides each thing that waits on a person, from the owners you set, and counts what waits on each.
- Reads your guidelines against each other: rules that contradict, rules written twice and rules nothing can check.
- Says what holds each rule on a page: a check that already enforces it, a guard the edit check could hold it with (written once you say yes), or a person's judgment. A rule too vague to check gets a rewrite a reviewer can check, drafted for your review. Read in English and Portuguese.
- Lets you decide each change to a page on its own: new text for the page, changes to rules and the other proposals, each in its own group. Each group has three actions under it, Approve all, Change and Drop all, each copying its decision for Claude Code, and each section gets one draft at most.
- Shows each draft beside where it comes from: the code's prop, the line it says again, or a name only Figma has, flagged so it is not taken for a prop.
- Offers a rewrite for a draft that names a property only Figma has, saying what carries it in the code.
- Flags lists copied into the layer that will go stale, and names the generated file to link instead.
- Rates how ready your guidance is for AI agents, component by component.
- Never overwrites a sentence a person wrote.
- A change to the layer reaches the published style guide on its own, checked on the pages it was about.

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine record that the tile has no large size, we ruled out a size per page because no screen needs it` | One decision on the tile's page in the intent layer, with what was ruled out and why, shown in History and given to agents |
| `/rms-design-system-engine the row is a part of the tile list, it is never used on its own` | Recorded on the tile list's page in the intent layer: the row shown and documented inside it, and agents told to place the list |
| `/rms-design-system-engine rate our guidelines for agents` | How much an agent can take from your guidance: ready, partial or thin, for each component, with what to add |
| `/rms-design-system-engine rate our guidelines and test extraction with a model` | The same, plus a test where a model answers questions from your guidance alone (uses your model tokens) |

## Annotate Figma from the code

**Coming soon** · **Why it matters:** Designers see in Figma what developers already know.

- Writes each component's accessibility spec into Figma.
- Pins accessibility problems on the layers of your designed screens.
- Links each component to its code file in Dev Mode.
- Shows you every change first. Nothing changes until you say yes.

## Publish a living style guide

**Ready to use** · **Why it matters:** Design, engineering and product see the same status, with no doc going stale.

*Today: it shows only what Figma and the code agree on. Anything still different is a task, not drawn.*

- One site with every token and component of your system.
- For each component: its specs, every variant, parity, accessibility and history. Its playground is a part of its own, [still in early development](#try-components-in-a-playground).
- A status page: how far each component is in Figma, code, accessibility and documentation.
- A task list that says who acts and which team owns each component or token layer.
- A History where every row names who did it: who answered a decision, and who made a change to the code, a read of Figma or a change to the intent layer, with whoever brought it in when that was somebody else.
- Foundations: colours, type, spacing, corners, motion and icons, every mode side by side.
- A Templates page: each page template, the components it is made of in Figma's order, whether its code uses each one, and its frame from Figma.
- Every colour and space on the page is one of your tokens, so it looks like your system.
- Read by machines too: the same page as text beside it, an index and one file per component, so an agent given only its address gets the system's own answers.
- Publishes to GitHub Pages or GitLab Pages on every push, and works on a phone.
- Updates on its own when the intent layer changes: a fix you copy from it into Claude Code is on the published page minutes later, and so is a change made by hand, even in another repository.
- The copy on your computer keeps up with your git, the engine and the code. Once you have built it there, it is built again after each commit and each change you pull in, and after a Claude Code turn once the engine updated or the code it reads moved. It is the quick build, for you to look at, and is never published.
- A team with no CI runner asks for a round when it wants one. It runs only what the change feeds, and publishes to your team's store only a page that changed.
- The page is checked like a product. Every file it links to must be there, its size is shown, and each build compares pictures of its own pages with the last build's.

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine build the style guide` | The living style guide |
| `/rms-design-system-engine check the modal and show it in the style guide` | One component's page |
| `/rms-design-system-engine publish the style guide for the team` | The job that publishes it on every push |
| `/rms-design-system-engine rebuild my style guide` | Your own copy built again, only the parts the change reached |

## Try components in a playground

**Early development** · **Why it matters:** Anyone can try a component in each of its options and themes before using it, with no code to write.

*Today: each prop is a control read from Figma and the code. The controls are still being tuned, so some props are missing or not shown well.*

- Draws each component from your own markup and CSS, with Figma's props as its controls.
- Every state, every theme and every breakpoint your Figma file gives.
- Inspect outlines each part, its padding and gap, with the token behind each value.
- It behaves as in your products: your system's own scripts run, a selection moves when you click it, and an overlay opens with its own animation.
- A link keeps what you set, so it opens that exact variant.

## Design themes over your system

**Coming soon** · **Why it matters:** A team can see its system as a new brand, or a product's own theme, before anyone writes a token.

*Today: a theme starts from scratch. Starting from a Figma file, a file of tokens or pictures is on its menu, and comes next.*

- Opens from the style guide's Theme choice, as **Create new theme…**, beside the system's own themes.
- Sets the colours, the font, the corners, the spacing, the borders and the shadows, with the screen on the right taking each change live.
- Works out dark from light the way your system does, so a new colour keeps each step of a scale as light as yours, and every text it sits under stays readable (WCAG AA).
- Click a component on the screen to see the tokens it really draws with, then change one of them alone.
- A theme you make is applied across the whole guide, kept as a file in your own themes folder, and named in the link, so the link opens it.
- It changes no code: a theme is tokens over your system, and the team's themes store shares it with everyone.

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine make a new theme in the style guide` | The style guide built, with Create new theme… in its Theme choice |

## Turn Figma into code

**Coming soon** · **Why it matters:** Engineering starts from the designed system, not an interpretation of it.

- With no code yet, lists what to build, in order, instead of failing.
- Gives Claude Figma's exact names and values before it writes the code.
- Checks every piece once it is built.

## Turn code into Figma

**Coming soon** · **Why it matters:** A component that exists only in code gets a Figma home, so designers can fine-tune it and Figma and the code can be compared.

- Draws a component that exists only in code as a Figma component: its props as properties and variants, its tokens as variables, its parts as layers.
- Starts from the components the style guide marks Only in the code.
- Uses only the system's own variables, text styles and components. It never makes up a value.
- Shows you every change first. Nothing is written to Figma until you say yes.

## Generate in Figma from a prompt

**Coming soon** · **Why it matters:** A new piece of the system follows its rules from the start, drawn in Figma rather than described in a ticket.

- The AI builds a new component from your description ("a tag like the chip"), starting from the one it is most like.
- Reads the rest of the same sentence ("with a size XL like L", "without the icon"), and asks about any part it could not read instead of dropping it.
- Changes an existing one ("add a size XL to the chip"), with where it is used and what the change breaks.
- Uses only the system's own variables, components, text styles and names. It never makes up a value.
- Works in a product file too: the system's variables come from its published library, imported by the key the Figma MCP finds for each.
- Asks whatever the system cannot answer, instead of guessing. When the original has variables of its own, it names the shared variable each one points at, so one answer binds them all. It never proposes binding a component straight to a primitive.
- Grows the component set to hold new variants, so none is clipped.
- Keeps every copied variant wired to its properties, and never adds a property that would drive nothing.
- Follows how your system builds components: names, properties, layers and auto layout.
- Writes nothing until someone signs it off and you say yes, then checks the result.

## Generate in code from a prompt

**Coming soon** · **Why it matters:** The same prompt reaches the code, written the way your own components already are.

- Written the way your components already are: your framework, file layout, props, tokens and names, with nothing the system does not have.
- Follows the construction rules read from your own code, not a general idea of how components are written.
- Built in both from the same prompt, the two are checked against each other before anyone signs off, so they start out matching.
- You choose where it is built: in Figma, in code, or both.
- Writes nothing until someone signs it off and you say yes, then checks the result.

## Prototype with your real components

**Coming soon** · **Why it matters:** AI builds fast but invents components. This keeps it on your real system, in your product's code and in prototypes.

*Today: the live checks run in Claude Code. Other tools get the same rules, and a check you run by hand. Prototypes are coming soon.*

**In your product's code**

- Checks each UI edit the AI makes, as it makes it, and hands back anything the system does not have.
- Gives agents the real component names, what each token is for and the decisions already made.
- Remembers names agents invent, and tells the next agent the right one.
- Stops the AI from making a check pass on its own.
- Never lets the agent that made a change to the system sign it off. A person does, or, if you allow it, a second agent that runs the engine's checks on the change again.
- Keeps each correction you make to what an AI made as a lesson, with your reason, and turns it into the strongest guard that holds it once you say yes: a check, a step agents read, or a rule for your guidelines.
- Notices a line an AI wrote that a person changed since, and asks whether it was a correction.
- Proposes a rule when the same finding comes back on three screens or in three edits.
- Has a model judge each Showroom screen on its screenshot and its code, when you ask: the right component, one main action, nothing destructive in front, laid out as its brief says. Advisory, shown beside the page review, with what it cost.
- Says when a lesson comes back, and which guard did not hold.
- Measures whether your guidance actually helps agents build better.
- Adds the same rules to the instruction files of Cursor, Copilot and other agents. *(Coming soon)*

**Prototypes with real components** *(Coming soon)*: user tests and reviews run on the real product, and what passes can ship without being redrawn.

What it makes:

- Clickable screens built only with your coded components, their real props and tokens, in light and dark.
- Each state (empty, error, loading) at each screen size.
- Pages linked, so you can click through a flow.
- A hand-over page, and review comments kept with the prototype.

How it checks the agent's work, in a loop, before you see it:

- Checks the agent's plan before anything is drawn. A component or option the system does not have is refused, with the reason.
- Reviews each page's layout and scores it out of 10: alignment, spacing, one main action, a clear heading, readable lines. Claude fixes what scores low.
- Tries every state at every screen size, with text 40% longer, and lists text that spills or targets too small to tap.
- Runs the accessibility check and compares the page with the screen your designers made.
- Holds pages to each other: the same padding, text styles and action names, never Save on one and Submit on another.
- Checks your team's rules, such as one main button per screen, and the flows your guidelines describe.
- Follows what your team already decided, and never uses a retired component.
- Holds a new page to how your product's **real pages** are built, not only to the prototypes drawn so far: which components a page holds and in what order, what each action is called, where the actions go. A project on its first day has no prototypes and no designed screens, but it has its pages. Only what the code says for certain is taken. Spacing and text styles are never guessed from it.

**What the page's own wrapper may use.** We read the transcripts of twelve measured runs looking for why agents invent. The answer was narrow and the same every time: **every invented value was in the page's own wrapper, and never in a component.** A page width written as `400px`, a line between rows as `#e0e0e0`, an empty state as an `<svg>` drawn by hand, each of them in the same tag as a `var(--padding-m)` the same agent had got right.

It used a token wherever it had been shown one, and invented wherever it had not. The catalog showed spacing and nothing else, while the theme had `--surface-page`, `--text-primary` and `--stroke-default` all along.

So the catalog now names them: what the wrapper may use, and nothing else. What a component owns stays that component's: a `--radii-button` is the button's, and a wrapper reaching for it borrows a look it was not given. A colour, a line, a corner or a width the theme does not name is a need the system lacks, and goes in the page as a gap for the design team, never as a value of the agent's own.

**A state the page owes is not a note.** A page that shows a list owes an empty state, and one that takes input owes an error state. The engine worked both out and said so, as advice, and advice gets skipped. We measured it: given the documentation alone, with those very lines in the page's own instructions, agents skipped the empty list and the form-with-a-mistake more often than anything except inventing.

So the page is now **drawn and not ready**. Drawn, because the page somebody still has to finish is exactly the one worth looking at: every size, every state, the pictures, the review. Not ready, because the run comes back unfinished and names the state.

There is an honest way out, which there has to be, and it costs a reason:

- in a composition, `"states": { "empty": "this list always has the three plans" }`: a state written as a sentence is one this page does not need, and the sentence is why.
- in a page of code, `data-no-empty="this list always has the three plans"`.

A reason too thin to be one is not taken. *A check a page cannot satisfy honestly is a check people turn off.* A starting point read from a designed screen is excused everything: it is incomplete on purpose, and failing it for not being finished is the same mistake pointing the other way.

**Every finding says which part it is about.** Watched in a measured run: an agent was told `"undefined" is not in the catalog`, could not tell which of the page's parts it meant, ran the check seventeen more times, searched the project for a schema, deleted the page, started over, and ran out of turns with nothing finished.

Both halves of that were the engine's. The finding carried the part's id all along and the report never printed it, and a part you gave no id was keyed `node-7`, a number in walk order that is findable in nothing. Now a finding opens with where it is: `Page › children[1] › children[0]`, or `"actions" (Page › children[0])` for a part you named. That is a route you can follow with the file open.

And a part with no component at all is no longer quoted as a component called `undefined`. It says what it is: a part that was never finished.

**A file in the wrong shape is told so once, not symptom by symptom.** An agent wrote a format of its own invention, `{ name, layout, gap, components: [{ type, label }] }`, and the engine answered with ten findings: the root is not a component, `"undefined"` is not in the catalog, the id `"undefined"` is used in three places. Every one true, and not one of them the thing that was wrong.

Ten symptoms of one mistake read as ten mistakes. The agent fixed them one at a time for thirty turns and was never told the file was the wrong shape. Now it gets one sentence, the shape itself, and the keys its file has instead, so it can map one onto the other.

And where your components are code, it is told something better than the shape of a composition: **which file this project writes.** The catalog of such a project says twice that a page here is a `.jsx`, and the agent wrote a `.json` anyway. Sending it off to write a *better composition* would only send it back to the wrong kind of file. So it now reads: your components are code, a page here is written in that code, write `prototypes/<Name>.jsx`.

**Each prototype carries its own evaluation.** What every check found used to live in one place, in the engine's output folder: good for counting across a project, no use to the prototype itself. A prototype is a part of its own now: read from your team's store into `prototypes/` and sent back from it. The page travelled, its handoff travelled, what people said about it travelled, and nothing about whether it holds up did.

Now `prototypes/<name>.check.json` sits beside the page, as the handoff and the comments do: which components it used and how often, the mistakes with why each happened, what the system lacked for it, the states it owes. The store carries it, and so does every file the engine keeps beside a page, named deliberately rather than left to the extensions, because the check record travelled only because it happens to be JSON and the handoff did not travel at all.

It records what was found, never a verdict of its own. And where a check never worked out whose fault each mistake was, it says nothing rather than zero: *the documentation owed none of them* is a different statement from *nobody worked it out*.

**Each component's page shows the prototypes built with it**, from those records: how often it is used in each, which ones passed their last check and which are still not ready. The page said what agents got wrong with a component and never what has been built with it, so a designer could not see, from the component, where it is actually used.

**Is it actually getting better?** Ask `are our prototypes getting better?` and the whole loop is on one screen:

1. The **patterns** a new page is held to.
2. The **mistakes**, split into the half your documentation owed and the half the agent did not follow.
3. What was **written** into the intent layer, and what is still owed.
4. What is **left for a person**, with where to write it.
5. Whether it is **improving**: mistakes a page, early against late, and whether the documentation's share of them is falling. That last number is the loop working.
6. Whether agents are **reading** a component's card before using it.

Two things it will not do. It never shows a zero where it means *not yet*: a step with nothing yet says what to run instead, because a zero and *not yet* look the same and mean opposite things. And under twelve checks it refuses to draw a trend and says so: two runs are not a trend, and a tool that draws one from two runs is a tool that says the opposite next week.

### What to ask

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine remember this lesson: the clock button was put inside the tile, because a tile holds one action` | Your correction kept with your reason, and the strongest guard that can hold it (a check, a step agents read, or a rule for your guidelines), written once you say yes |
| `/rms-design-system-engine show the lessons` | Every lesson and what it became, the rules proposed from findings that repeat, and the lines an AI wrote that a person changed since |
| `/rms-design-system-engine are our prototypes getting better?` | The whole loop on one screen: the patterns a new page is held to, what agents got wrong and whose fault each was, what was written, what is left for a person, and whether the number is falling |
| `/rms-design-system-engine judge the Showroom screens with a model` | Each screen judged on its screenshot and its code: the right component, one main action, nothing destructive in front, laid out as its brief says. Advisory, with what it cost (uses your model tokens) |

## Works with your tools

Your tools stay as they are, and the engine fits around them.

*Today: every browser check runs in Chrome.*

- Reads code straight from GitLab, on gitlab.com or your own host, without a clone.
- Follows a Figma branch, so edits on the main file do not restart a long scan.
- Reads very large Figma files in checked pieces, and only what changed on the next refresh.
- Reads Figma the best way available: figma-cli, the Figma tool of your Claude session, or the Figma API.
- Answers agents that have no terminal, such as prototyping tools, through MCP. *(Coming soon)*

## What you can count on

**Why it matters:** You can trust what it reports.

- It never changes code people wrote. It flags what it finds and hands back a patch.
- It only reads Figma, unless you say yes to a change.
- A check that could not run says Not run, never Pass.
- Every check is tested with a mistake planted on purpose.
- A difference your team decides to keep is kept, with its reason, and stops failing.
