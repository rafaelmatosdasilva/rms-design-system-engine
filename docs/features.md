# Features and capabilities

What the engine does for design and product teams. How each part works is in the [technical documentation](details.md), and what to ask in Claude Code is on the [Commands](commands.md) page.

Every feature reads the same shared knowledge about your system: what each component is, how it's built and why it exists. What one feature learns, the others use.

Each section says why it matters, then what it does not do well today. A line marked *(Coming soon)* is not ready yet.

**On this page**

| Feature | What it does for you | Builds on | Stage |
|---|---|---|---|
| [Write component contracts](#write-component-contracts) | One up-to-date spec per component, written from your Figma file and your code: its options, states and what goes inside it. People and AI tools read the same spec, and nobody maintains it by hand. | Your Figma file and code | Ready to use |
| [Write the intent layer](#write-the-intent-layer) | Why each component exists and when to use it, gathered in one place from your docs and past decisions. What it can't be sure of goes to a person; guidelines that contradict each other are flagged. | Contracts | Ready to use |
| [Review the Figma library](#review-the-figma-library) | Every check compares against your Figma file, so the file has to be right. This lists what makes it unreliable (values not linked to the system, detached copies, components built against your own rules), each with its fix, on the style guide's Tasks page for whoever keeps the file. | Your Figma file | Ready to use |
| [Track system health](#track-system-health) | Warns about risks before they spread as the system grows: a colour named after one product, a token that points to one that was deleted, a combination that only breaks in dark mode on a phone. | Contracts | Ready to use |
| [Compare Figma and code](#compare-figma-and-code) | Checks that what was built matches what was designed, in every theme, as a real browser draws it. Each difference says who should fix it, so visual QA stops being done by eye. | Contracts, Figma library | Ready to use |
| [Catch drift in product code and AI edits](#catch-drift-in-product-code-and-ai-edits) | Shows where products stopped using the system: copied components, hard-coded colours or spacing, invented names, each with what to use instead. What the system is missing goes on a list for design. | Contracts, intent | Ready to use |
| [Test accessibility](#test-accessibility) | Tests each component the way people use it: contrast, keyboard, focus, touch size and what a screen reader says. Fix it once in the component and every screen benefits. | Contracts, Compare | Early development |
| [Build with AI, on the system](#build-with-ai-on-the-system) | AI tools build with your real components, rules and past decisions: in your product's code today, and as clickable prototypes for user tests *(Coming soon)*. Each change is checked as it's made, and what the system lacks goes on a list for design. | Contracts, intent, Catch drift | Early development |
| [Publish a living style guide](#publish-a-living-style-guide) | One site the whole team shares: each component's playground, spec, Figma match, accessibility and history, plus who needs to do what next. | Everything above | Early development |
| [Fit your team's setup](#fit-your-teams-setup) | Works with what you already use: code on GitLab, Figma branches, very large files. | — | Early development |
| [Update Figma from the code](#update-figma-from-the-code) | Sends what developers learn back to designers in Figma: accessibility notes, screen issues and links to the code, only after you approve. | Compare, accessibility | Coming soon |
| [Keep products on the system](#keep-products-on-the-system) | Helps every product move to the next system version: which version each one runs, a ready-made fix per product, one ticket per difference. | Catch drift, health | Coming soon |
| [Generate components in Figma](#generate-components-in-figma) | Describe a component in plain words and get it built in Figma with your own styles, names and structure, ready for sign-off. | Contracts, intent, Figma library | Coming soon |
| [Build code from Figma](#build-code-from-figma) | For a system that exists only in Figma: the order to build it in, exact names and values, and a check after each piece. | Contracts, Compare | Coming soon |

**Compare or Catch drift?** Compare asks "does the code match the design?"; Catch drift asks "do products use the system?". **Catch drift or Build with AI?** Catch drift finds problems after the fact; Build with AI prevents them as things are built.

Also on this page: [What you can count on](#what-you-can-count-on).

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

*Today: it reads DSDS or Markdown and MDX pages from GitLab, GitHub (Enterprise too) or a folder in your project, and pages kept in Notion or Confluence. Its own fixes go back where the layer lives, in its own format: a commit or a merge request on GitLab, a commit or a pull request on GitHub, or the pages in your folder rewritten for you to commit. Notion and Confluence are only read: each fix is listed for a person to make there. The engine writes only what it is sure of; everything else is a draft for a person to approve.*

- Reads your documentation where it already lives: a docs folder, a documentation site's pages, the `.mdx` beside each component, or a Notion or Confluence page and the pages under it. A component's usage, accessibility and style tabs become one page, and Do and Don't examples become when to use it and when not.
- Shows why each component exists, when to use it and when not, beside Figma and the code.
- Writes what it is sure of, such as the element a component renders, and drafts the rest, such as an example, for a person to approve.
- Keeps every decision in one history: differences kept on purpose, proposals answered, what was ruled out and why.
- Marks a page to review again when its component changes after the page was written: what changed and since when. Agents still read the page, with a note beside it. A person confirms it, or edits it.
- Does the same for the team's answers: a decision whose component changed since is marked to review again, confirmed or withdrawn by a person.
- Shows each proposal with every answer it could take and the evidence for each: where it comes from (Figma, the code, the products, your pages, past decisions) and how strong it is.
- Names who decides each thing that waits on a person, from the owners you set, and counts what waits on each.
- Reads your guidelines against each other: rules that contradict, rules written twice and rules nothing can check.
- Flags lists copied into the layer that will go stale, and names the generated file to link instead.
- Rates how ready your guidance is for AI agents, component by component.
- Never overwrites a sentence a person wrote.
- A change to the layer reaches the published style guide on its own, checked on the pages it was about.

## Review the Figma library

**Ready to use** · **Why it matters:** Every check compares against your Figma file, so a clean library is what makes every other result trustworthy.

*Today: it only reads Figma. Renames are applied after you say yes; every other fix is for your design team to make.*

- Finds values with no token or style, detached instances, missing auto layout and missing descriptions.
- Writes down how your system builds components (names, properties, layers, variables) and lists the ones that break it, on a Construction page.
- Fixes a component's construction, such as renaming its layers, after you say yes.
- Compares components of one kind, so every button sets its states and names its options the same way.
- Says when the file is not reliable enough to compare, before any result.

## Track system health

**Ready to use** · **Why it matters:** Structural risks show up before they spread.

*Today: advice only. None of it fails a run.*

- Tokens named by look (blue-500) or after a product, instead of by role.
- Aliases that point at a removed token, with the change that removed it.
- Tokens in a layer where they never change, that could live a layer up.
- What breaks only in a combination of modes, such as dark on a phone.
- Brands that pin a value they should inherit from the brand they extend.
- Two components whose own rules are nearly the same.
- A health number per area on the style guide's Status page.

## Compare Figma and code

**Ready to use** · **Why it matters:** No more visual QA by eye. Drift is caught before release, not by users.

*Today: each component is measured in a real browser. Components with no page to open are drawn straight from their own code, which works for most React and Vue components, not yet for all. One that cannot be drawn says why.*

- Compares every colour, size, font, shadow and duration with Figma, in every mode (light and dark, phone and desktop).
- Checks each component's options, defaults and states: hover, focus, pressed, disabled and selected.
- Measures heights, spacing, corners and alignment as a browser draws them, not with a screenshot.
- Finds the code file of each Figma component on its own, so nobody writes a map.
- Checks icons, slots and the parts inside each component.
- Checks that a brand changes only values, never which parts a component draws or how they are laid out.
- Warns when a Figma frame changed since the version you approved.
- Puts every difference in one list, with who fixes it: the designer in Figma or a developer in the code.
- Runs 25 checks, called gates, each listed in the [technical documentation](details.md#the-gates).
- Compares how components move and what they draw beyond their colours, such as shadows and blurs. *(Coming soon)*
- Checks each product page against its Figma screen: which components, their order, spacing and alignment. *(Coming soon)*

## Catch drift in product code and AI edits

**Ready to use** · **Why it matters:** Shortcuts do not pile up until the system falls apart.

*Today: everything here is advice and fails no run, except values written by hand, whose count may only go down.*

- Spots a product screen or an AI edit that builds its own copy of a system component.
- Counts colours and sizes written by hand, with the token to use instead, and keeps the count going down.
- Flags CSS variables and text casing the design never asked for.
- Finds a control laid over a component, a sign it is missing an option. The same one built three times is a gap in the system.
- Sorts each gap and each proposed change into local (it stays in one product) or shared (it changes what other products get), with the reason in one line. Only the shared ones wait on the person who decides.
- Checks Tailwind classes against Figma.
- Names faults in a component's own code that show only when a screen uses it, such as a click that fires twice. *(Coming soon)*
- Keeps what the system lacks on a list for your design team, and sends it to Figma as to-do cards after you say yes. *(Coming soon)*

## Test accessibility

**Early development** · **Why it matters:** Problems are fixed once, in the component, not in every screen later.

*Today: automated checks against WCAG 2.2 A and AA. They find many failures, but they cannot prove a product meets WCAG or judge whether its words make sense. What a screen reader says is read from the browser, not from VoiceOver or NVDA themselves.*

- Tries every component in a real browser, in every state and colour mode.
- Measures contrast against what is really painted behind the text.
- Follows the Tab key through each page to find traps, lost focus and controls a keyboard never reaches.
- Measures touch targets, on the page and again on a small 320 pixel screen.
- Checks reading needs: text spacing, zoom, high-contrast mode and colour blindness.
- Says how sure each finding is: blocker, warning or advisory, in one verdict per component.
- Tries what belongs to a page across your products' own pages: a title and a language, a skip link, the same navigation and help in the same place, and a flow that never asks twice. What only a person can decide, such as a payment step, is left to a person.
- Lists what the Figma file is missing, such as a focus state or an error message.
- Tries again only what changed, so a second run takes seconds.
- Fails a merge request or pull request that adds an accessibility blocker the last build did not have, and says what it fixed.
- Checks your designed screens in Figma for contrast and target size. *(Coming soon)*

## Build with AI, on the system

**Early development** · **Why it matters:** AI builds fast but invents components. This keeps it on your real system, in your product's code and in prototypes.

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

## Publish a living style guide

**Early development** · **Why it matters:** Design, engineering and product see the same status, with no doc going stale.

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
- The page is checked like a product. Every file it links to must be there, its size is shown, and each build compares pictures of its own pages with the last build's.

## Fit your team's setup

**Early development** · **Why it matters:** It works with the tools you already use.

*Today: every browser check runs in Chrome.*

- Reads code straight from GitLab, on gitlab.com or your own host, without a clone.
- Follows a Figma branch, so edits on the main file do not restart a long scan.
- Reads very large Figma files in checked pieces, and only what changed on the next refresh.
- Reads Figma the best way available: figma-cli, the Figma tool of your Claude session, or the Figma API.
- Answers agents that have no terminal, such as prototyping tools, through MCP. *(Coming soon)*

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
- Names a product late to move on the Tasks list, for its own team.
- Opens one issue per difference in your tracker, and closes it once it is fixed.
- Reviews the screens a product builds with the system as pages, and scores each out of 10.
- Reads products kept in their own repositories.

## Generate components in Figma

**Coming soon** · **Why it matters:** New components follow the system's rules from the start.

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
