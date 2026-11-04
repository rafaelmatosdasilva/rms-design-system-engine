# Features and capabilities

What the engine does for design and product teams. Every part reads the same knowledge about your system, so what one learns, the others use. How each part works is in the [technical documentation](details.md), and what to ask Claude Code is on the [Commands](commands.md) page.

**On this page**

| Feature | What it does for you | Stage |
|---|---|---|
| [Write component contracts](#write-component-contracts) | One up-to-date spec per component, written from your Figma file and your code: its options, states and what goes inside it. People and AI tools read the same spec, and nobody maintains it by hand. | Ready to use |
| [Write the intent layer](#write-the-intent-layer) | Why each component exists and when to use it, gathered in one place from your docs and past decisions. What it can't be sure of goes to a person, and guidelines that contradict each other are flagged. | Ready to use |
| [Review the Figma library](#review-the-figma-library) | Checks your Figma file is fit to be the source everything else compares against. Your design team gets a list of what to fix, so no result rests on a broken file. | Ready to use |
| [Track system health](#track-system-health) | Flags the tokens that will cause trouble as the system grows, such as names tied to a colour or aliases to deleted tokens. They are cheapest to fix early, and nothing here fails a run. | Ready to use |
| [Catch drift in product code and AI edits](#catch-drift-in-product-code-and-ai-edits) | Shows where products stopped using the system: copied components, hard-coded colours or spacing, invented names, each with what to use instead. What the system is missing goes on a list for design. | Ready to use |
| [Compare Figma and code](#compare-figma-and-code) | Checks that what was built matches what was designed, in every theme, as a real browser draws it. Each difference says who should fix it, so visual QA stops being done by eye. | Ready to use |
| [Publish a living style guide](#publish-a-living-style-guide) | One site the whole team shares: each component's playground, spec, Figma match, accessibility and history, plus who needs to do what next. | Ready to use |
| [Fit your team's setup](#fit-your-teams-setup) | Works straight from your repositories, with no clone and nothing duplicated. Figma and the code are read from one place the whole team shares, so nobody keeps a copy in sync. | Early development |
| [Test accessibility](#test-accessibility) | Tests each component the way people use it, from contrast to screen readers, and splits each criterion into tasks for the people who own it, in order. Fix it once and every screen benefits. | Early development |
| [Build with AI, on the system](#build-with-ai-on-the-system) | AI builds prototypes and product code with your real components, and nothing invented gets past the checks. What passes a user test can ship without being redrawn. | Coming soon |
| [Update Figma from the code](#update-figma-from-the-code) | Sends what developers learn back to designers in Figma: accessibility notes, screen issues and links to the code, only after you approve. | Coming soon |
| [Keep products on the system](#keep-products-on-the-system) | Helps every product move to the next system version: which version each one runs, a ready-made fix per product, one ticket per difference. | Coming soon |
| [Generate components in Figma and code](#generate-components-in-figma-and-code) | Describe a component in plain words and get it built with your own styles, names and structure, where you choose: in Figma, in code, or both. Ready for sign-off. | Coming soon |
| [Build code from Figma](#build-code-from-figma) | For a system that exists only in Figma: the order to build it in, exact names and values, and a check after each piece. | Coming soon |

## Write component contracts

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

## Write the intent layer

**Ready to use** · **Why it matters:** What designers know becomes something teammates and agents can read.

*Today: it reads DSDS or Markdown and MDX pages from GitLab, GitHub (Enterprise too) or a folder in your project, and pages kept in Notion or Confluence. Its own fixes go back where the layer lives, in its own format: a commit or a merge request on GitLab, a commit or a pull request on GitHub, or the pages in your folder rewritten for you to commit. Notion and Confluence are only read: each fix is listed for a person to make there. The engine writes only what it is sure of. Everything else is a draft for a person to approve.*

- Reads your documentation where it already lives: a docs folder, a documentation site's pages, the `.mdx` beside each component, or a Notion or Confluence page and the pages under it. A component's usage, accessibility and style tabs become one page, and Do and Don't examples become when to use it and when not.
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

## Review the Figma library

**Ready to use** · **Why it matters:** Every other result is only as good as the file it compares against.

*Today: it only reads Figma. Renames are applied after you say yes. Every other fix is for your design team to make.*

- Finds values with no token or style, detached instances, missing auto layout and missing descriptions.
- Writes down how your system builds components (names, properties, layers, variables) and lists the ones that break it, on a Construction page.
- Fixes a component's construction, such as renaming its layers, after you say yes.
- Compares components of one kind, so every button sets its states and names its options the same way.
- Says when the file is not reliable enough to compare, before any result.

## Track system health

**Ready to use** · **Why it matters:** The token layer is where a system ages badly, and it is cheapest to put right early.

*Today: advice only. None of it fails a run.*

- Tokens named by look (blue-500) or after a product, instead of by role.
- Aliases that point at a removed token, with the change that removed it.
- Tokens in a layer where they never change, that could live a layer up.
- What breaks only in a combination of modes, such as dark on a phone.
- Brands that pin a value they should inherit from the brand they extend.
- Two components whose own rules are nearly the same.
- A health number per area on the style guide's Status page.

## Catch drift in product code and AI edits

**Ready to use** · **Why it matters:** Shortcuts do not pile up until the system falls apart.

*Today: everything here is advice and fails no run, except values written by hand, whose count may only go down, and a push whose change uses something with a finding.*

- Spots a product screen or an AI edit that builds its own copy of a system component.
- Counts colours and sizes written by hand, with the token to use instead, and keeps the count going down.
- Flags CSS variables and text casing the design never asked for.
- Finds a control laid over a component, a sign it is missing an option. The same one built three times is a gap in the system.
- Sorts each gap and each proposed change into local (it stays in one product) or shared (it changes what other products get), with the reason in one line. Only the shared ones wait on the person who decides.
- Checks Tailwind classes against Figma.
- Warns at a commit and stops a push, only for what the change uses: a value written by hand, a name the system does not have, or a difference in a component it uses. The rest of the system's debt never slows a commit.
- Names faults in a component's own code that show only when a screen uses it, such as a click that fires twice. *(Coming soon)*
- Keeps what the system lacks on a list for your design team, and sends it to Figma as to-do cards after you say yes. *(Coming soon)*

## Compare Figma and code

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
- Runs 25 checks, called gates, each listed in the [technical documentation](details.md#the-gates).
- Compares how components move and what they draw beyond their colours, such as shadows and blurs. *(Coming soon)*
- Checks each product page against its Figma screen: which components, their order, spacing and alignment. *(Coming soon)*

## Publish a living style guide

**Ready to use** · **Why it matters:** Design, engineering and product see the same status, with no doc going stale.

*Today: it shows only what Figma and the code agree on. Anything still different is a task, not drawn.*

- One site with every token and component of your system.
- For each component: a playground with live controls, its specs, every variant, Figma beside the code, parity, accessibility and history.
- A status page: how far each component is in Figma, code, accessibility and documentation.
- A task list that says who acts and which team owns each component or token layer.
- Foundations: colours, type, spacing, corners, motion and icons, every mode side by side.
- A Templates page: each page template, the components it is made of in Figma's order, whether its code uses each one, and its frame from Figma.
- Every colour and space on the page is one of your tokens, so it looks like your system.
- Publishes to GitHub Pages or GitLab Pages on every push, and works on a phone.
- Updates on its own when the intent layer changes: a fix you copy from it into Claude Code is on the published page minutes later, and so is a change made by hand, even in another repository.
- Your own copy builds itself again whenever the code, Figma, the intent layer, a store or the engine changes, in the background from login on. It is on by default: setup turns it on, and one setting turns it off. It runs only what the change feeds, and publishes to your team's store only a page that changed, so a team with no CI runner stays up to date.
- The page is checked like a product. Every file it links to must be there, its size is shown, and each build compares pictures of its own pages with the last build's.

## Fit your team's setup

**Early development** · **Why it matters:** Your tools stay as they are, and the engine fits around them.

*Today: every browser check runs in Chrome.*

- Reads code straight from GitLab, on gitlab.com or your own host, without a clone.
- Follows a Figma branch, so edits on the main file do not restart a long scan.
- Reads very large Figma files in checked pieces, and only what changed on the next refresh.
- Reads Figma the best way available: figma-cli, the Figma tool of your Claude session, or the Figma API.
- Answers agents that have no terminal, such as prototyping tools, through MCP. *(Coming soon)*

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

## Build with AI, on the system

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

## Update Figma from the code

**Coming soon** · **Why it matters:** Designers see in Figma what developers already know.

- Writes each component's accessibility spec into Figma.
- Pins accessibility problems on the layers of your designed screens.
- Links each component to its code file in Dev Mode.
- Shows you every change first. Nothing changes until you say yes.

## Keep products on the system

**Coming soon** · **Why it matters:** Products take up system changes without a migration project.

- Renames a token everywhere in one change, with a patch for each product.
- Lists every place still using a retired component or token, with what to use instead.
- Tells each product which system version it runs, and what a newer one changes for it, in its code and its docs.
- Names a product late to move on the Status page, for its own team.
- Opens one issue per difference in your tracker, and closes it once it is fixed.
- Reviews the screens a product builds with the system as pages, and scores each out of 10.
- Reads products kept in their own repositories.

## Generate components in Figma and code

**Coming soon** · **Why it matters:** New components follow the system's rules from the start, in the design and in the code.

- You choose where it is built: in Figma and in code, only in Figma, or only in code, from the same description.
- In code, it is written the way your components already are: your framework, file layout, props, tokens and names, with nothing the system does not have.
- Built in both, the two are checked against each other before anyone signs off, so they start out matching.
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

## Build code from Figma

**Coming soon** · **Why it matters:** Engineering starts from the designed system, not an interpretation of it.

- With no code yet, lists what to build, in order, instead of failing.
- Gives Claude Figma's exact names and values before it writes the code.
- Checks every piece once it is built.

## What you can count on

**Why it matters:** You can trust what it reports.

- It never changes code people wrote. It flags what it finds and hands back a patch.
- It only reads Figma, unless you say yes to a change.
- A check that could not run says Not run, never Pass.
- Every check is tested with a mistake planted on purpose.
- A difference your team decides to keep is kept, with its reason, and stops failing.
