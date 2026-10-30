# Features and capabilities

What the engine does for design and product teams, one line each. How each part works is in the [technical documentation](details.md), and what to ask in Claude Code is on the [Commands](commands.md) page.

**How far along each part is**

| Stage | What it means |
|---|---|
| **Available ●●●** | Use it on real work. A few improvements are still to come. |
| **Available ●●○** | Use it on real work. It is being improved. |
| **Available ●○○** | Use it on real work. A lot is still being added. |
| **Planned** | Being built. Not ready for real work yet. |

Each available section says why it matters, then what it does not do well today. A line marked *(Planned)* is not ready yet.

**On this page**

| Goal | What you get | Why it matters | Stage |
|---|---|---|---|
| [Compare Figma and code](#compare-figma-and-code) | Every token, prop, state and size compared in every mode, measured in a real browser, and approved frames watched for changes. Each difference says who fixes it. | No more visual QA by eye. Drift is caught before release, not by users. | Available ●○○ |
| [Test accessibility](#test-accessibility) | Every component tested against WCAG 2.2 AA in every state and colour mode: contrast, keyboard, focus, target size and what a screen reader announces. One verdict per component. | Problems are fixed once, in the component, not in every screen later. | Available ●○○ |
| [Write component contracts](#write-component-contracts) | Each component's props, variants, states, tokens and what it nests, rewritten from Figma and the code on every run, plus the one file AI tools read. | Developers and AI tools build from the same spec, and nobody keeps it up to date by hand. | Available ●●● |
| [Draft the intent layer](#draft-the-intent-layer) | Why each component exists, when to use it and when not, and every decision in one history. Guidelines that contradict, repeat or cannot be checked are flagged. | What designers know becomes something teammates and agents can read. | Available ●●● |
| [Publish a living style guide](#publish-a-living-style-guide) | One site with a playground, specs, variants, parity, accessibility and history for each component, plus a status page and tasks that name the owning team. | Design, engineering and product see the same status, with no doc going stale. | Available ●○○ |
| [Catch drift in product code and AI edits](#catch-drift-in-product-code-and-ai-edits) | In every product screen and AI edit: hand-built copies of components, hard-coded values and made-up variables, each with what to use instead. What the system lacks goes on a list for design. | Shortcuts do not pile up until the system falls apart. | Available ●●○ |
| [Review the Figma library](#review-the-figma-library) | Values with no token, detached instances and missing auto layout, plus your system's own building rules and which components break them, with renames to apply. | A clean library is what makes every other check reliable. | Available ●●● |
| [Track system health](#track-system-health) | Tokens named after a product, broken aliases, tokens in the wrong layer, and what breaks only in combinations such as dark on a phone. | Structural risks show up before they spread. | Available ●●● |
| [Keep AI agents on the system](#keep-ai-agents-on-the-system) | Every UI edit an AI makes checked as it happens, agents given the real names and past decisions, and a measure of whether your guidance helps. | AI builds fast but invents components; this keeps it on the system. | Available ●●○ |
| [Fit your team's setup](#fit-your-teams-setup) | Reads code straight from GitLab, follows a Figma branch and handles very large files. | It works with the tools you already use. | Available ●●○ |
| [Update Figma from the code](#update-figma-from-the-code) | Accessibility specs, screen issues and Dev Mode links written into Figma, after you say yes. | Designers see in Figma what developers already know. | Planned |
| [Keep products on the system](#keep-products-on-the-system) | Token renames and retired components carried to every product with a patch each, which system version each product runs, and one issue per difference in your tracker. | Products take up system changes without a migration project. | Planned |
| [Generate components in Figma](#generate-components-in-figma) | Ask in plain words ("a tag like the chip", "add a size XL to the chip") and the AI builds or changes it in Figma with only your variables, names and structure, after someone signs it off. | New components follow the system's rules from the start. | Planned |
| [Prototype with real components](#prototype-with-real-components) | Clickable screens built only with your coded components, their real props and tokens, in light and dark, at every screen size. | User tests and reviews run on the real product. What passes can ship without being redrawn. | Planned |
| [Build code from Figma](#build-code-from-figma) | The build order from a Figma-only system, with exact names and values, and each piece checked once built. | Engineering starts from the designed system, not an interpretation of it. | Planned |

Also on this page: [What you can count on](#what-you-can-count-on).

## Compare Figma and code

**Available ●○○** · **Why it matters:** No more visual QA by eye. Drift is caught before release, not by users.

*Today: each component is measured in a real browser. Components with no page to open are drawn straight from their own code, which works for most React and Vue components, not yet for all. One that cannot be drawn says why.*

- Compares every colour, size, font, shadow and duration with Figma, in every mode (light and dark, phone and desktop).
- Checks each component's options, defaults and states: hover, focus, pressed, disabled and selected.
- Measures heights, spacing, corners and alignment as a browser draws them, not with a screenshot.
- Finds the code file of each Figma component on its own, so nobody writes a map.
- Checks icons, slots and the parts inside each component.
- Warns when a Figma frame changed since the version you approved.
- Puts every difference in one list, with who fixes it: the designer in Figma or a developer in the code.
- Runs 25 checks, called gates, each listed in the [technical documentation](details.md#the-gates).
- Compares how components move and what they draw beyond their colours, such as shadows and blurs. *(Planned)*
- Checks each product page against its Figma screen: which components, their order, spacing and alignment. *(Planned)*

## Test accessibility

**Available ●○○** · **Why it matters:** Problems are fixed once, in the component, not in every screen later.

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
- Checks your designed screens in Figma for contrast and target size. *(Planned)*

## Write component contracts

**Available ●●●** · **Why it matters:** Developers and AI tools build from the same spec, and nobody keeps it up to date by hand.

*Today: contracts are rewritten on every run. A component with no description is listed, since a description is what an agent reads first.*

- Writes a contract for each component: its props, variants, states, tokens and the components it nests, from Figma and the code.
- Writes the one file AI tools read, with what to use, what each token is for and what was already decided against.
- Pairs each text colour with the surface it was made for, so nobody picks a different grey on every card.
- Publishes the contracts to a shared repository, and in the DSDS format for teams that document their system that way.
- Records each breaking change as a release of the system, so products know what moved.
- Checks your Figma Code Connect mappings against the contracts.

## Draft the intent layer

**Available ●●●** · **Why it matters:** What designers know becomes something teammates and agents can read.

*Today: it reads DSDS or Markdown and MDX pages, from GitLab, GitHub or a folder in your project. Its own fixes are committed only to a DSDS layer on GitLab; anywhere else, each one is listed for a person to make. The engine writes only what it is sure of; everything else is a draft for a person to approve.*

- Reads your documentation where it already lives: a docs folder, a documentation site's pages, or the `.mdx` beside each component. A component's usage, accessibility and style tabs become one page, and Do and Don't examples become when to use it and when not.
- Shows why each component exists, when to use it and when not, beside Figma and the code.
- Writes what it is sure of, such as the element a component renders, and drafts the rest, such as an example, for a person to approve.
- Keeps every decision in one history: differences kept on purpose, proposals answered, what was ruled out and why.
- Reads your guidelines against each other: rules that contradict, rules written twice and rules nothing can check.
- Flags lists copied into the layer that will go stale, and names the generated file to link instead.
- Rates how ready your guidance is for AI agents, component by component.
- Never overwrites a sentence a person wrote.

## Publish a living style guide

**Available ●○○** · **Why it matters:** Design, engineering and product see the same status, with no doc going stale.

*Today: it shows only what Figma and the code agree on. Anything still different is a task, not drawn.*

- One site with every token and component of your system.
- For each component: a playground with live controls, its specs, every variant, Figma beside the code, parity, accessibility and history.
- A status page: how far each component is in Figma, code, accessibility and documentation.
- A task list that says who acts and which team owns each component or token layer.
- Foundations: colours, type, spacing, corners, motion and icons, every mode side by side.
- Every colour and space on the page is one of your tokens, so it looks like your system.
- Publishes to GitHub Pages or GitLab Pages on every push, and works on a phone.

## Catch drift in product code and AI edits

**Available ●●○** · **Why it matters:** Shortcuts do not pile up until the system falls apart.

*Today: everything here is advice and fails no run, except values written by hand, whose count may only go down.*

- Spots a prototype or product that builds its own copy of a system component.
- Counts colours and sizes written by hand, with the token to use instead, and keeps the count going down.
- Flags CSS variables and text casing the design never asked for.
- Finds a control laid over a component, a sign it is missing an option. The same one built three times is a gap in the system.
- Checks Tailwind classes against Figma.
- Keeps what the system lacks on a list for your design team, with what stands in meanwhile, and sends it to Figma as to-do cards after you say yes.
- Names faults in a component's own code that show only when a screen uses it, such as a click that fires twice. *(Planned)*

## Review the Figma library

**Available ●●●** · **Why it matters:** A clean library is what makes every other check reliable.

*Today: it only reads Figma. Renames are applied after you say yes; every other fix is for your design team to make.*

- Finds values with no token or style, detached instances, missing auto layout and missing descriptions.
- Writes down how your system builds components (names, properties, layers, variables) and lists the ones that break it, on a Construction page.
- Fixes a component's construction, such as renaming its layers, after you say yes.
- Compares components of one kind, so every button sets its states and names its options the same way.
- Says when the file is not reliable enough to compare, before any result.

## Track system health

**Available ●●●** · **Why it matters:** Structural risks show up before they spread.

*Today: advice only. None of it fails a run.*

- Tokens named by look (blue-500) or after a product, instead of by role.
- Aliases that point at a removed token, with the change that removed it.
- Tokens in a layer where they never change, that could live a layer up.
- What breaks only in a combination of modes, such as dark on a phone.
- Brands that pin a value they should inherit from the brand they extend.
- Two components whose own rules are nearly the same.
- A health number per area on the style guide's Status page.

## Keep AI agents on the system

**Available ●●○** · **Why it matters:** AI builds fast but invents components; this keeps it on the system.

*Today: the live checks run in Claude Code. Other tools get the same rules, and a check you run by hand.*

- Checks each UI edit the AI makes, as it makes it, and hands back anything the system does not have.
- Gives agents the real component names, what each token is for and the decisions already made.
- Remembers names agents invent, and tells the next agent the right one.
- Stops the AI from making a check pass on its own.
- Measures whether your guidance actually helps agents build better.
- Adds the same rules to the instruction files of Cursor, Copilot and other agents. *(Planned)*

## Fit your team's setup

**Available ●●○** · **Why it matters:** It works with the tools you already use.

*Today: every browser check runs in Chrome.*

- Reads code straight from GitLab, on gitlab.com or your own host, without a clone.
- Follows a Figma branch, so edits on the main file do not restart a long scan.
- Reads very large Figma files in checked pieces, and only what changed on the next refresh.
- Reads Figma the best way available: figma-cli, the Figma tool of your Claude session, or the Figma API.
- Answers agents that have no terminal, such as prototyping tools, through MCP. *(Planned)*

## Update Figma from the code

**Planned** · **Why it matters:** Designers see in Figma what developers already know.

- Writes each component's accessibility spec into Figma.
- Pins accessibility problems on the layers of your designed screens.
- Links each component to its code file in Dev Mode.
- Shows you every change first. Nothing changes until you say yes.

## Keep products on the system

**Planned** · **Why it matters:** Products take up system changes without a migration project.

- Renames a token everywhere in one change, with a patch for each product.
- Lists every place still using a retired component or token, with what to use instead.
- Tells each product which system version it runs, and what a newer one changes for it, in its code and its docs.
- Names a product late to move on the Tasks list, for its own team.
- Opens one issue per difference in your tracker, and closes it once it is fixed.
- Reviews the screens a product builds with the system as pages, and scores each out of 10.
- Reads products kept in their own repositories.

## Generate components in Figma

**Planned** · **Why it matters:** New components follow the system's rules from the start.

- The AI builds a new component from your description ("a tag like the chip"), starting from the one it is most like.
- Reads the rest of the same sentence ("with a size XL like L", "without the icon"), and asks about any part it could not read instead of dropping it.
- Changes an existing one ("add a size XL to the chip"), with where it is used and what the change breaks.
- Uses only the system's own variables, components, text styles and names. It never makes up a value.
- Asks whatever the system cannot answer, instead of guessing. When the original has variables of its own, it names the shared variable each one points at, so one answer binds them all. It never proposes binding a component straight to a primitive.
- Grows the component set to hold new variants, so none is clipped.
- Keeps every copied variant wired to its properties, and never adds a property that would drive nothing.
- Follows how your system builds components: names, properties, layers and auto layout.
- Writes nothing until someone signs it off and you say yes, then checks the result.

## Prototype with real components

**Planned** · **Why it matters:** User tests and reviews run on the real product. What passes can ship without being redrawn.

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

## Build code from Figma

**Planned** · **Why it matters:** Engineering starts from the designed system, not an interpretation of it.

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
