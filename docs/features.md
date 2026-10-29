# Features and capabilities

Everything the engine can do, one line each. How each part works is in the [technical documentation](details.md), and what to ask in Claude Code is on the [Commands](commands.md) page.

**How far along each part is**

| Stage | What it means |
|---|---|
| **Stable** | Use it on real work. |
| **Beta** | It works, with the gaps named under its heading. |
| **Experimental** | Try it, and expect rough edges. |

A line with its own stage in brackets is behind the rest of its group.

**On this page**

- [Checks your code against Figma](#checks-your-code-against-figma--stable)
- [Catches problems before they ship](#catches-problems-before-they-ship--stable)
- [Accessibility](#accessibility--stable)
- [A living style guide](#a-living-style-guide--stable)
- [Prototypes with your real components](#prototypes-with-your-real-components--experimental)
- [Starts from Figma only](#starts-from-figma-only--experimental)
- [Keeps products aligned](#keeps-products-aligned--beta)
- [Brings Figma in line with the code](#brings-figma-in-line-with-the-code--beta)
- [Works with your AI tools](#works-with-your-ai-tools--stable)
- [You stay in control](#you-stay-in-control)
- [The checks](#the-checks)

## Checks your code against Figma · Stable

*Today: each component is measured in a real browser. Components with no page to open are drawn straight from their own code, which works for most React and Vue components, not yet for all.*

- Compares every colour, size, font, shadow and duration with Figma, in every mode (light and dark, phone and desktop).
- Checks each component's options, defaults and states: hover, focus, pressed, disabled and selected.
- Measures heights, spacing, corners and alignment as a browser draws them, not with a screenshot.
- Finds the code file of each Figma component on its own, so nobody writes a map.
- Checks icons, slots and the parts inside each component.
- Tries every combination of modes, such as dark on a phone.
- Compares how components move and what they draw beyond their colours, such as shadows, blurs and gradients. *(Beta)*
- Compares each product's screen with the screen designed for it. *(Beta)*
- Puts every difference in one list, with who fixes it: you in Figma, or Claude in the code.

## Catches problems before they ship · Stable

*Today: everything here is advice. None of it fails a run on its own.*

- Spots a product that builds its own copy of a system component.
- Flags CSS variables and text casing the design never asked for.
- Counts colours and sizes written by hand, with the token to use instead, and makes sure the count only goes down.
- Compares components of one kind with each other, so every button sets its states and names its options the same way.
- Finds a control laid over a component, a sign that the component is missing an option.
- Names faults in a component's own code that show only when a screen uses it, such as a click that fires twice. *(Beta: Vue only)*
- Checks Tailwind classes against Figma.
- Reviews the Figma file itself: values with no token, detached instances, missing auto layout and descriptions.

## Accessibility · Stable

*Today: automated checks against WCAG 2.2 A and AA. They find many failures, but they cannot prove a product meets WCAG or judge whether its words make sense. What a screen reader says is read from the browser, not from VoiceOver or NVDA themselves.*

- Tries every component in a real browser, in every state and colour mode.
- Measures contrast against what is really painted behind the text.
- Follows the Tab key through each page to find traps, lost focus and controls a keyboard never reaches.
- Measures touch targets, on the page and again on a small 320 pixel screen.
- Checks reading needs: text spacing, zoom, high-contrast mode and colour blindness.
- Says how sure each finding is: blocker, warning or advisory.
- Lists what the Figma file is missing, such as a focus state or an error message.
- Checks your designed screens in Figma for contrast and target size. *(Beta)*
- Tries again only what changed, so a second run takes seconds.

## A living style guide · Stable

*Today: it shows only what Figma and the code agree on. Anything still different is a task, not drawn.*

- One page with every token and component of your system.
- A status page: how far each component is in Figma, code, accessibility and documentation.
- A task list, with who acts on each item.
- A page for each component: a playground with live controls, its specs, every variant, Figma beside the code, and its history.
- Foundations: colours, type, spacing, corners, motion and icons, every mode side by side.
- It looks like your system: every colour and space on the page is one of your tokens.
- Publishes to GitHub Pages or GitLab Pages on every push, and works on a phone.
- Rates how ready your guidelines are for AI agents.
- Shows your intent layer, why each piece exists and how to use it, beside Figma and the code. *(Beta: read from DSDS pages on GitLab)*

## Prototypes with your real components · Experimental

*Today: good for simple screens. It does not yet know your products' own patterns, so richer screens and flows need a lot of guidance from you. Its quality checks are measured (layout, your rules, accessibility), so whether a screen is the right design for your users is still for a person to judge. It does not create new components in Figma.*

What it makes:

- Builds a screen you describe from your design system's components only.
- Shows each state (empty, error, loading) at each screen size.
- Links pages, so you can click through a flow.
- Writes a hand-over page and keeps review comments with the prototype.

How it checks the agent's work, in a loop, before you see it:

- Checks the agent's plan before anything is drawn. A component or option the system does not have is refused, with the reason.
- Flags anything on the page that is not from the system.
- Reviews each page's layout and scores it out of 10: alignment, spacing, one main action, a clear heading, readable lines. Claude fixes what scores low.
- Tries every state at every screen size, with text 40% longer, and lists text that spills or targets too small to tap.
- Runs the accessibility check and compares the page with the screen your designers made.
- Holds pages to each other: the same padding, text styles and action names, never Save on one and Submit on another.
- Checks your team's rules, such as one main button per screen, and the flows your guidelines describe.

What it gives back:

- Marks what the system is missing, and keeps a list of those gaps for your design team.
- Sends those gaps to Figma as to-do cards, after you say yes.
- Follows what your team already decided, and never uses a retired component.

## Starts from Figma only · Experimental

*Today: measured on a small system only, with tokens, four components and one screen.*

- With no code yet, lists what to build, in order, instead of failing.
- Gives Claude Figma's exact names and values before it writes the code.
- Checks every piece once it is built.

## Keeps products aligned · Beta

*Today: tracking which version of the system each product uses is new.*

- Renames a token everywhere in one change, with a patch for each product.
- Lists every place still using a retired component or token, with what to use instead.
- Tells each product what a newer version of the system changes for it.
- Pairs each text colour with the surface it was made for, so agents stop guessing.
- Opens one issue per difference in your tracker, and closes it once it is fixed.
- Reads products kept in their own repositories.

## Brings Figma in line with the code · Beta

*Today: it writes only what the code already proves. Descriptions, missing components and layouts stay tasks for your design team.*

- Writes each component's accessibility spec into Figma.
- Pins accessibility problems on the layers of your designed screens.
- Links each component to its code file in Dev Mode.
- Shows you every change first. Nothing changes until you say yes.

## Works with your AI tools · Stable

*Today: the live checks run in Claude Code. Other tools get the same rules, and a check you run by hand.*

- Writes a short guide for AI agents: which components and tokens exist, and what each one is for.
- Checks each UI edit the AI makes, as it makes it, and hands back anything the system does not have.
- Stops the AI from making a check pass on its own.
- Remembers names agents invent, and tells the next agent the right one.
- Measures whether your guidance actually helps agents build better.
- Adds the same rules to the instruction files of Cursor, Copilot and other agents. *(Beta)*
- Answers agents that have no terminal, such as a prototyping tool, through MCP. *(Beta)*

## You stay in control

These are principles, not features, so they have no stage.

- It never changes code people wrote. It flags what it finds and hands back a patch.
- It only reads Figma, unless you say yes to a change.
- A check that could not run says Not run, never Pass.
- Every check is tested with a mistake planted on purpose.
- A difference your team decides to keep is kept, with its reason, and stops failing.
- Commit what it creates, so everyone checks against the same design.

## The checks

Each check is called a gate. To run just one, see [Parity](commands.md#parity) on the Commands page. How each one works is in the [technical documentation](details.md#what-it-checks).

| # | Gate | What it looks at |
|---|---|---|
| 1 | Data is up to date | You are comparing with today's Figma, not an old copy |
| 2 | Figma frame unchanged | The design still looks like the version you approved |
| 3 | Token values match Figma | Colours, sizes and fonts, in every mode |
| 4 | Tokens used in screens exist | Nothing a screen uses is missing from the code |
| 5 | Every mode is covered | Things that should change between modes really do |
| 6 | Exception lists are valid | Your "ignore this" notes still point at real things |
| 7 | No invented CSS variables | Every variable in the code comes from a Figma token, under that token's name |
| 8 | Docs tell the truth | Your docs mention only things that exist |
| 9 | No invented text casing | No forced UPPERCASE the design did not ask for |
| 10 | No hand-built DS components | Screens use the real component, and no product draws its own copy of one |
| 11 | Clean CSS | Nothing unused, nothing that contradicts Figma |
| 12 | Nested components keep their styles | One component's look does not leak into another |
| 13 | Structure matches | Heights, spacing, corners, widths and alignment, measured in a browser at each breakpoint and colour mode |
| 14 | All states are built | Hover, disabled, selected and the rest, in every mode |
| 15 | Component props match Figma | The same names, defaults and choices, written one way across the system |
| 16 | Sub-components match Figma | The parts inside a component are the right ones |
| 17 | Templates compose the right components | Each page is built from what Figma shows |
| 18 | Markup matches | Classes, icons and every control the design shows |
| 19 | Required pieces are in place | Icon slots, component slots and form fields |
| 20 | Icons match Figma | From the shared set, drawn the same way |
| 21 | Transitions match | Durations and easing |
| 22 | Motion matches | When your design defines it |
| 23 | Shadows match | When your design defines them |
| 24 | Renders correctly in a browser | Checked on the real page, not only in the code, every text style and mode included |
| 25 | What this audit actually checked | Which components and states were covered, and which were skipped |

