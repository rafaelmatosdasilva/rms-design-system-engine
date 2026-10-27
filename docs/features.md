# Features and capabilities

Everything the engine does, in plain words. What to ask in Claude Code is on the [Commands](commands.md) page. For how each check works, see the [technical documentation](details.md).

**On this page**

- [How you use it](#how-you-use-it)
- [Check your code against Figma](#check-your-code-against-figma)
- [The checks](#the-checks)
- [Accessibility](#accessibility)
- [The living style guide](#the-living-style-guide)
- [Prototypes](#prototype-with-your-design-system)
- [Build from Figma](#start-from-figma-only)
- [Keep products aligned](#keep-products-aligned)
- [Bring Figma in line with the code](#bring-figma-in-line-with-the-code)
- [Good to know](#good-to-know)

## How you use it

Ask in Claude Code, in your own words, after `/rms-design-system-engine`. **[Every request](commands.md)** is on the Commands page, grouped by type, with what you get.

- **One component, its own findings.** When you check one component, accessibility findings are listed only when they are about that component, in its own file or on an element that carries its class. A page that only uses it keeps its findings to itself.
- **The browser part needs your packages.** When the project's packages are not installed, the run tells you. Install them and run again.
- **Name the component the way your system does.** Spaces, capitals, dashes and word order do not matter, so *button primary*, *Button Primary* and *primary button* all check buttonPrimary alone. A word only one component has checks that one, and a plural (*the buttons*) checks every component with that word. A word several components share (*the button*, in a system with buttonPrimary and iconButton) makes Claude ask which one first, so a request about one component never checks the whole library.

### Every difference in one list

Each full check writes `.design-system-engine-out/differences.md`, every difference between Figma and the code in one place.

- Grouped by component, with what is new since the last check.
- Under each component, where it lives (the products that use it and what it sits inside), so you see how far a fix reaches.
- At the top, each check that did not run, so a gap is never mistaken for a pass.

It is written whether or not you have a style guide, and the summary of every check says where it is.

### Differences you keep on purpose

Some differences are decisions, not mistakes. When your team decides to keep one, [tell Claude](commands.md#tokens-and-changes) and give the reason.

- It is recorded in `design-system-engine-kept.json` with the reason, who decided and when. Commit it.
- Add `--truth figma` or `--truth code` to say which side is right, and `--review 90d` (or a date) to look at it again later.
- A kept difference never fails a check. It is listed under Kept on purpose, in the differences list and on the component's Parity area, with its reason.
- It is that exact difference that is kept. If Figma or the code changes its value, the difference is open again.
- Only you keep a difference. The AI asks you first, and it never writes a reason for you.
- `--keep` alone lists what is kept. `--unkeep --match <words>` takes one back.

This is not debt. Debt (`--baseline`) is a difference you will fix later. A kept difference is one you decided to keep.

## Check your code against Figma

The engine reads what your design system defines in Figma, its tokens and each component's parts, states and options. Then it checks your code against it, value by value and in a real browser. It is not a screenshot comparison.

### What it compares

- **Tokens.** Colours, sizes, fonts, shadows and durations, in every mode (Light and Dark, Desktop and Phone).
- **Components.** Props, defaults and options, every state (hover, focus, pressed, disabled, selected), heights, spacing, corners and markup.
- **Icons.** From the shared set, drawn the same way as in Figma.
- **Motion and effects.** How each component moves, and what it draws beyond its colours (both below).
- **Product screens.** Where each product puts each component (below).

Every difference comes with its fix in plain words and who acts, you in Figma or Claude in the code.

### Which file is each component

The engine finds the code file of each Figma component on its own, so you write no map.

- **By its name.** The file's name, the name it declares, the class on its first element, or its folder and file name (`buttons/Secondary.vue` is buttonSecondary).
- **By a generic file name.** `switches/General.vue` is switch, not switchGeneral. So are Default, Base, Main and the only file in a folder, and `cards/Primary.vue` when Figma has no cardPrimary.
- **By its tokens.** The tokens a file writes or uses name the component they belong to, whatever the file is called.
- **One file, two states.** When Figma has tooltipOpen and tooltipClosed and the code builds both in one file, both are paired with it.
- **One file, two styles.** When Figma has bannerTopPrimary and bannerTopSecondary and the code has `banners/Top.vue` with a prop that chooses the style (`useSecondaryStyle`), both are paired with it.
- **Two signs, or you confirm.** A name pairs on its own. A weaker sign (a generic file name, the tokens, a library prefix, a state word) needs a second one that agrees, such as the tokens or the props. One alone is a proposal: the audit and the style guide's Tasks list it to confirm, or to pin in `componentFiles`. It is never applied on its own.
- **Only in Figma.** A component with no file is named with the files closest to its name.
- **Your map wins.** `componentFiles` in `ds-config.json` always decides.

### Components of one type, built the same way

The components of one type in Figma (every button, every input) are compared with each other, not only with the code.

- **One state, one shape.** Disabled is a property of its own on most buttons and an option of State on a few: those few are named, with the way most of them do it.
- **One thing, one name.** `labelContent` on most buttons and `Label` on one: that one is named.
- **What most of them have.** Most inputs have a label and a required mark: one without them is listed to check.

Each is a decision for your team in Figma, and keeping it as it is, as a known exception, is always an option.

### Every combination of modes

The gates check each mode on its own. When you have two collections that switch (Light and Dark, Desktop and Phone), every combination is also opened in the browser, such as Dark on a phone or Light on a desktop.

- Each token is compared with Figma's value in that combination.
- Each text and background pair the system uses is measured for contrast.

Only what is wrong together and right in each mode alone is listed, with the combination. A phone rule that sets a colour, so Dark on a phone keeps Light's, is a typical case. These show on the style guide's Tasks page, under The system.

### How components move

Figma says how things move in three places, and the engine reads all of them.

- **Between states.** A variant that leads to another on hover or press, with its duration and curve (Smart animate, 300ms, ease out). Gate 21 also holds the code to the transitions your team wrote down.
- **On their own.** A spinner turning, a panel, modal or toast opening and closing. Figma says it on its Motion timeline, in the overlays its prototype opens and in variants that lead to each other after a delay.
- **In the code.** `@keyframes` animations, and the transitions a state plays when it opens or closes (a drawer's `.is-open`).

When Claude [refreshes the Figma data](commands.md#set-up) with the Figma tool of your session, it also reads Figma's side, on every page, without changing anything. Each movement is then compared.

- One Figma animates and the code does not, or with another duration or curve, is Claude's to fix in the code.
- One only the code animates is yours to add in Figma, or to ask the code team to stop.

Each one is a row in the component's Motion tab and on the Status page, under Motion. The style guide's motion page also puts the system's timings in one table, fastest first, with what each is for, the components that use it and what the system could tidy up.

### What each component draws beyond its colours

A card's shadow, a scrim's blur, a banner's gradient, a frame that clips what overflows it, a layer that blends or is see-through.

When Claude [refreshes the Figma data](commands.md#set-up) with the Figma tool of your session, it also reads these for each component and its layers, two levels deep, without changing anything. Then each is compared with the component's own rule in the code (`box-shadow`, `filter`, `backdrop-filter`, `overflow`, `mix-blend-mode` and `opacity`).

- One Figma draws and the code does not, or draws differently, is Claude's.
- One only the code draws, or a clip Figma sets that the code leaves open, is a decision for both.

Each is an Effect row in the component's Parity area and on the Status page.

### Each product's screen, as designed

A component can match Figma on its own while a product puts it in the wrong place. When Claude [refreshes the Figma data](commands.md#set-up), it also reads the screens `ds-config.json` names for each product, without changing Figma. Each product's built page is then opened at the width, height and colour mode of its screen, and compared.

- Which components, and how many.
- Their order.
- The space between neighbours.
- Whether the ones that line up in Figma line up on the page.

A list (three or more of one component) is compared by whether it is there and where it starts, since how many rows it shows is data. A page that opens in another state than its screen, empty before its data arrives, is said once and not compared until its screen has a `setup`, a script that puts the page in that state. Each product with a difference is a row on the Status page, under Products.

### Nothing passes by accident

- A check that had nothing to read shows **Not run** with the reason, never Pass.
- What a check cannot see is listed as not comparable, with the reason, not as a difference.
- Every check is tested with a mistake planted on purpose.

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
| 25 | What this audit actually checked | So you can see that nothing slipped through |

## Accessibility

Each component is tried in a real browser against WCAG 2.2 at level A and AA. axe-core, the scanner most accessibility tools are built on, runs on the same page every time. One run is the whole check, so nothing else needs to run beside it.

### Where it runs

- **Your components.** On a page you name, your style guide or your built pages. React and Vue components with no page to open are rendered straight from their own code, in each Figma variant, with no dev server.
- **What your app gives them.** A Vue component that reads a Pinia store or links with Vue Router gets your project's own, when your `package.json` lists it and it is installed.
- **Your products' pages.** When the check runs on the style guide, each product's built page is opened whole, and every rule runs on it. Findings are named after the product and listed on the Status page under Products. `a11y.products: false` leaves them out.
- **Your designed screens in Figma.** When Claude [refreshes the Figma data](commands.md#set-up), it also reads the screens `ds-config.json` names for text and icon contrast and target size, without changing Figma. [Updating Figma](commands.md#update-figma) pins each problem on its layer once you say yes.

### What it tries

- **Every state and colour mode.** Each control is measured again while hovered, focused and pressed, in every colour mode, its text and its edge.
- **The keyboard.** The Tab key is followed through the page. It finds an element a mouse can click that Tab never reaches, a keyboard trap, focus that jumps back up the page and focus that lands where no one can see it. A modal dialog must keep the focus inside.
- **Screen readers.** Each press that shows something is heard as a screen reader hears it, so a toast or an error that appears with nothing said is found. The report prints what a screen reader says for each component (`checkbox, Remember me, not checked`), so you can judge the words without opening VoiceOver or NVDA.
- **Contrast.** Measured against what is really painted behind the text, see-through text and colours in `oklch()` included. An icon that carries meaning and a control's edge are held to 3:1 in every colour mode.
- **Touch and small screens.** Target size is measured in every mode, at the page's width and again on a 320 pixel screen. Each tip is tapped with a touch screen emulated. A control under the comfortable 44 pixels gets advice.
- **Reading needs.** Wider text spacing, zoom, Windows high-contrast mode and colour blindness. Two variants told apart only by red and green are found.
- **Roles from Figma.** Each component is held to the role in your Figma annotations, what it must expose (a toggle's pressed state, a field's label, a stepper's value) and what a person can do with it (Space flips a toggle, ArrowUp steps a stepper).
- **Hidden components.** A modal, menu or popover kept behind a button is opened first, never with a button that deletes, sends or submits. One that nothing opens is said not checked, never clean.
- **Signing in and dragging.** A password field that refuses paste or a password manager is found, and so is something moved only by dragging.

### What you get

- Every problem with its fix in plain words, named after the component it is in.
- How many texts, icons and controls were measured, and every element with its verdict.
- One verdict line, such as `Verdict: 1 blocker · 2 warnings · 1 advisory · WCAG 2.1 AA`.

How sure each finding is.

- **Blocker.** Measured on the page against WCAG.
- **Warning.** Read from the code, a contract or a Figma note, and can be wrong.
- **Advisory.** Beyond AA, or for a person to judge.

`--no-axe` and `--no-states` leave a part out, and then the result says not all of it was checked.

### Only what changed is tried again

- **Each page's results are kept.** They are saved under what the page rests on: its components and your CSS, your settings, and the check itself.
- **An unchanged page is not opened again.** The next run puts its results back, and the report says how many pages it reused. When nothing changed, no browser opens and the check takes seconds.
- **A change is tried at once.** A style guide is checked a few components a page, so a change to one component tries only its page again.
- **Live pages are always tried.** A page from a dev server or a link can change without the engine knowing, so it is never reused.
- `--fresh` (or `a11y.reuse: false`) tries every page again.

### What the design owes

Some problems belong to the Figma file. They are listed for whoever keeps it.

- An interactive component with no focus state, so the code has to invent the focus ring.
- An error state with no message, so the error is shown by colour alone.
- A control under 24 pixels.

Meanwhile Claude writes a visible focus ring and leaves an error message's words to you.

Every rule the check applies is in the [technical documentation](details.md#accessibility).

## The living style guide

[The style guide](commands.md#style-guide) is one page with every token and component, from what Figma and the code agree on, in `.design-system-engine-out/styleguide/index.html`.

**[See an example](https://rafaelmatosdasilva.github.io/rms-ds-figma-plugins/)**, the RMS Design System's style guide, built by this engine and published by that design system, so it shows what the engine makes today.

- **One component at a time.** A page for one component checks it first, against Figma and for accessibility, then shows it and the components it nests, `styleguide/modal.html`.
- **One link for the team.** Publishing writes the CI job that publishes it on every push, to GitHub Pages or GitLab Pages, so everyone opens the same page built from what is merged. A local run stays a preview.
- **Light to host.** The page keeps its styles, code, fonts and data in an `assets` folder beside it, each file named by what it holds. To open it on your computer, download `index.html` and the `assets` folder. A host serves them once and a browser keeps them, so after a rebuild a visitor downloads only the page and its data, and the component panel opens from what is already there. It still opens from disk, double-clicked.
- **One template for every project.** Every project fills the same template (`templates/styleguide.template.html`) with its own data, so an improvement there reaches every design system on its next run. A project can still use its own (`styleguide.template` in `ds-config.json`).

### What's in it

| Page | What you find there |
|---|---|
| Overview | A card for each foundation and component, with a thumbnail drawn from your own code, and a search across everything |
| Health | How far the system has come, in one number and by area |
| Tasks | Everything still open, with who acts and what to do |
| Foundations | Colours, typography, spacing, radii, motion and icons |
| Components | One page for each component, in areas you switch between |

### Status

One page for how the system stands and what is left. It is second in the list, under the index; `#health` and `#tasks` open it.

- **Four cards at the top.** Parity, Code, Accessibility and Documentation, read from the table's rows: the big number is what is done (Match, Found, Pass, Ready) out of the same components, and the bar and its legend split the rest in the table's own states and colours (Not checked grey).
- **One table of the components.** A row for each component, in one word per state, the same in the cards and the chips: Figma and Code (Found, Unsure, Missing), Parity (Match, Partial, Differs, Unsure), Accessibility (Pass, Issues, Review, Untested), Documentation (Ready, Partial, Missing), and when it was last checked. A part (a Figma name with a slash, `chartBars/bar`) is no row of its own: its parent's row counts what it has left and the parent's details list it under Parts. A row, or its arrow at the end, opens the component's own page in a panel that slides in from the right at the window's full height (the same view as its page, with its tabs); a Parity, Accessibility or Documentation cell with something left opens it on that area, filtered to what is to fix or to decide. N/A has no dot and no arrow: there is nothing to open. N/A and Untested carry an i that says why; a component only one side has says what to do in an i on the side that lacks it. The address says it all (#status/parity?code=Missing&doc=Missing&open=c-chip/accessibility), the panel's tab included, so a link opens the page as it was. Every column sorts both ways with a triangle, Parity first. The filters are one chip a column (Figma, Code, Parity, Accessibility, Documentation), named only until a state is chosen, so nothing looks applied: each opens a list (the Brand selector's) of All and the column's states with how many rows each would show. The chips combine (Code: Found and Documentation: Missing is what is built and undocumented), each list counting beside the others' choices and leaving out a state with none; Clear filters drops them all. Choosing a state sorts the table by its column. Each card's button opens one of them (See the 60 missing components).
- **Not tied to one component.** Under the table, the system's own tasks: token descriptions, components whose file is still to confirm, controls the page stands in for.

Every row says what to do and who acts.

- **You in Figma.** A change you make in the Figma file, a colour that fails contrast included.
- **A developer in the code.** Whoever your team chooses: a developer, or an agent such as Claude given the task numbers (do 3 and 7). The page's words never assume which.
- **A known exception.** Wherever only one side has something, keeping it on purpose is an option too, with its reason.
- **You decide.** Figma and the code each have a case.
- **You check by hand.** What only a person can judge. Once you have, [tell Claude](commands.md#accessibility) and the row is Done, with your name and the date, until the component changes.

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
| Accessibility | One table by WCAG 2.2 criterion, with what Figma states, what was found, what to do and who acts |
| Documentation | What it is, when to use it and when not, common mistakes, limitations, Do and Don't pictures, its role and an example, with what is still to write |
| Motion | Everything that moves in it, the code's timing beside Figma's |
| Built with | The system's components it is made of |
| Used in | Each product that uses it, with a picture and how many times. A product that draws its own version (Gate [10]) is there too |
| Changelog | Each Figma change and each code commit, by release, with links |

Each area has its own link (`#c-chip/accessibility`). The address also keeps what you set in the Playground (`#c-chip?Size=L&width=phone`), so a link opens that exact variant.

In the Playground.

- **Inspect.** Outlines each part, padding and gap. Click one to see what it is and its value (`chip padding left · --padding-s · 8px`), and click inside to go one level deeper.
- **Figma beside the code.** The Figma button shows Figma's image of the variant you set, beside the component or over it with a slider. The images come from `.design-system-engine-refs/` or, with `FIGMA_TOKEN` in `.env`, straight from Figma.
- **Width.** Shows the component at each breakpoint your Figma file gives (Phone 350, Desktop 1680), else at 375, 768 and 1280 pixels, with your media queries applied.
- **It works as in your products.** Your system's own scripts run (`systemScripts` in `ds-config.json`), a selection moves when you click it, and an overlay opens with its own animation.

Also on each component.

- **API.** The props, events and slots your code declares, required ones marked. A plain HTML and CSS system has no API to read, so it is left out.
- **Code.** Its head stays in view as you scroll, with Copy code as a plain underlined button. Exactly what the Playground shows, as a product writes it (`<Chip size="l" />`), or the HTML with only the classes your CSS styles.
- **A token's panel.** Click any token to see its value in each mode, the components that use it, and a button to copy it.
- **Not agreed yet.** A prop only one side has, a different default or a token that differs is left out and counted at the top, so you decide each one first.
- **Only in the code.** A component only your code has keeps its own page and its place in the menu, marked Only in the code, with its file and its props. Its Status row says Figma is Missing, with what to do in an i: add it to Figma, or remove it from the code. Its Parity is N/A. `styleguide.showCodeOnly: false` leaves these off the pages, a task each.
- **Status and coverage.** Stable, beta or deprecated when your team says so, and how much of its file your tests cover.

### The intent layer

Your intent layer (why each piece exists and how to use it, as DSDS pages on GitLab) is read on every run. Each component's Documentation shows it beside Figma, the code and the contract, each line with where it came from and a link to its page; agents get it in the contracts, `llms.txt` and the prototypes, so they can compose a page that has no Figma layout yet. The Documentation page (once the Intent layer page) reviews every page with one decision (Delete, Move, Rename, Name, Write, Improve, Keep, Add), why, and each change to make in the layer, and gathers what is still to write about each component from every source, with where to write it (Figma, the intent layer). It also flags Remove on each component whose Figma annotations or code notes no agent reads: a note that repeats the description, is only a link, or is past the three an agent is shown. A note in the code that only says how the component is built, or repeats another, is left alone: it is there for developers.

With no intent layer, every row can still be finished.

- **Do and don't.** Write lines that start with `Do:` or `Don't:` in its Figma description, in the comment above its CSS rule, or in `contract.authored.json` under `guidance.doDont`. Agents get them with its pictures.
- **Properties.** The contract the engine writes from Figma and the code is the one agents read, so there is nothing to publish.
- **Text styles.** A text style's description in Figma counts as its token's, like a variable's.
- **Role.** A component whose root is a plain element (a `span`, a `div`) with nothing to press, type in or go to has no role, read from its code: nobody has to decide it.

### Guidance for agents

Agents read your guidelines and Figma's descriptions to pick and use each component. [Ask Claude](commands.md#ask-the-system) to rate them, and each component gets a class.

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

### Modes

Each component and foundation has its own switch for each mode collection, and the page has one for colour. By default everything follows your device (Dark when it is set to dark, Phone sizes in a narrow window) until you pick a mode. A mode your code has no CSS for yet is shown as such, never drawn with Figma's values.

### It works on a phone

Every page fits a 320 pixel screen (WCAG 1.4.10). Cards sit two side by side, every table reads as a block per row, and the menu opens from a Menu button.

## Prototype with your design system

Describe a screen in your own words and get it made only of your design system's components, with their own options. Nothing is invented and nothing in the system changes. When a screen needs something the system lacks, the prototype shows a labelled box or marks the component standing in, and the need goes on a list for your design team.

Measured on twelve prototype requests, Claude alone made 17 of 36 right with Opus and 3 of 36 with Haiku. With the engine, 36 of 36 and 35 of 36 ([case study](../CASE-STUDY.md)).

What to ask is in [Prototypes and building](commands.md#prototypes-and-building) on the Commands page.

### What you get

- **A page made of your real system.** Your components and tokens, in light and dark, under `.design-system-engine-out/prototypes/`. It draws at once, even offline.
- **Every state.** Empty, error, loading and any state your guidelines or your request name, each switchable on the page.
- **Every screen size.** Each state is tried from phone to desktop, with the words as written and 40% longer, as a translation makes them. Text that spills, a label on two lines and a target too small to tap are listed.
- **Click-through flows.** Pages link to each other, so you can click through a sign-up or a checkout, checked against the flows your guidelines describe.
- **It works.** Your system's own scripts run, so a selection moves, a toggle switches, a field takes typing and a dialog opens and closes with Escape.
- **A design review.** Each page is reviewed in the browser and scored out of 10 for alignment, spacing rhythm, one main action, a heading that leads and lines short enough to read. Claude fixes what scores low.
- **Checked in the browser.** Measured against the screen your designers made, and run through the accessibility check.
- **Pages that match.** Page padding, space between sections, text styles, where actions sit and what they are called, never Save on one page and Submit on another.

### It uses what your team knows

Before Claude writes a prototype, it sees what was read (Figma, the code, your recorded decisions, your guidelines from Notion, GitLab or the project) and the guidelines, components and screens that fit your request. Each component comes with what it is for, when to use it and when not, its common mistakes and its Do and Don't.

- A retired component is never used.
- A rule like one button per screen is checked.
- A component your documentation rules out for a use is not used for it.

The rules arrive in tiers, from the most general to the most specific: the engine's own, true of any design system; your design system's; and the product's own (a product page or flow in your intent layer, and the project's `AGENTS.md`). Where two disagree, the more specific one wins — a product narrowing a general rule is how a design system gets used, not a fault. Only a pair written inside one tier, by two people with the same authority, is a decision nobody has made, and those are the ones the sweep below hands you.

### What a prototype is

A short file listing which components go where, with which options (`prototypes/<name>.json`). The engine checks it first. One that uses a component or an option the system lacks is not drawn, and each line says why.

Where your system has no layout components, the engine lends neutral ones (a page, a stack, a row, columns) that use only your spacing tokens and text styles, and adds layout components to the list.

### What the team already decided

Every decision somebody makes is recorded where it is made: a difference kept on purpose with its reason, a proposal answered yes or no, a difference accepted for now, a component checked by hand, a need nothing in the system fitted with what was looked at and why. Nothing gathered them, so a decision was only ever seen by whoever ran the command that made it.

Now they come together in one log, shown beside each component's Changelog and written to `DECISIONS.md` in the output folder. A `DECISIONS.md` your team wrote by hand is read as one more source and never rewritten.

The part that pays is what agents get. A card now carries what was already ruled out and why: an agent that does not know a thing was considered and rejected will propose it again, confidently, every time it is asked.

### Your rules, read against each other

Everything written for an agent reaches it at once: your guidelines, each layer of your intent, every component's page and your project's `AGENTS.md`. Written at different times by different people, they start to disagree. The engine reads them side by side and hands you three lists:

- **Pairs that cannot both be followed.** Two rules about the same component where one allows what the other rules out, two counts of it (exactly one, against several), or two places it may only go. Whichever the agent reads last wins, so each pair is a decision nobody has made yet.
- **A rule written twice.** The same rule in two places in different words: two rules to read, one rule to follow.
- **Rules nothing can check.** A rule that names nothing your system has and that no check reads. It may still be good advice, but the agent carries it into every request and nothing can say whether a prototype followed it.

Nothing is rewritten. Each line comes with both sentences and where each came from, for the person who owns the words, and each component's Documentation page lists the ones about it.

### The gap list

Every prototype's gaps are kept in `.design-system-engine-out/prototypes/gaps.json`, the most needed first. Each says what was searched, the nearest components, what stands in meanwhile and why none fit, so whoever decides works from the evidence. Ask to send them to Figma and they become your design team's to do list there, one card per need, written only after you say yes.

## Start from Figma only

Open an empty project, set it up with your Figma link and ask for what to build. With no code yet, the engine starts in build mode. What Figma has and the code does not is listed as to build, in order, never as a failure.

What to ask is in [Prototypes and building](commands.md#prototypes-and-building) on the Commands page.

Claude writes the code. The engine gives it Figma's exact names and values first, and checks every piece after.

Measured on a small design system in Figma (tokens, four components and a screen), Claude with the Figma MCP alone built 8 of 18 pieces right with Opus, 16 of 30 with Sonnet and 4 of 18 with Haiku. With the engine all three built all of them. The [case study](../CASE-STUDY.md) gathers every measurement, and the full log is in [test/skill-evals/RESULTS.md](../test/skill-evals/RESULTS.md).

## Keep products aligned

- **Rename a token everywhere.** A token renamed in Figma is renamed in one change ([Tokens and changes](commands.md#tokens-and-changes)). The engine pairs each old name with its new one by value in every mode, and writes one patch for the system and one for each product. The old name stays in the theme, pointing at the new one, until every product has moved.
- **Retire a component or a token.** Mark it deprecated in Figma or in the code, and the engine lists every place still using it with what to write instead (`handback/migrations.md`), plus a patch for each token swap. The style guide shows it on the old component's page (Use chip instead, still used in 12 places).
- **Catch near copies.** A product that builds a component by hand, or styles a class almost like one of yours, comes back to you as a decision. Use the component, with a new option if it needs one, or add the new one to the system on purpose.
- **Colour pairs, not a shortlist.** For every text and icon colour, the engine works out the one surface it was made for, reading the names (`content/on-interactive` goes with `surface/interactive`) and confirming it against the values. The pair goes into the contract, into `llms.txt` and into `--query`, so an agent is given the answer instead of every surface that would work: given only a shortlist, it picks a different grey on every card. An edit that puts a colour on another surface is told so at once, with the contrast the two actually give. And a pair whose names promise what its values break (white on a warning yellow) is reported as what it is: the system's own words against its own numbers.
- **Count values written by hand.** Every colour, size, radius or duration a token should carry, with the token to use. Every check counts them, and the count only falls.
- **Products in their own repositories.** Name them in `ds-config.json` (`pluginDirs`, or `codeRoots` for any folder) and every scan reads their code as the project's own.

Nothing is applied until you ask.

## Bring Figma in line with the code

When the code already states something Figma does not, the engine can write it into Figma for you.

- **Each component's accessibility spec,** as the code gives it, in the Accessibility category. Its role (a real `<button>` gets `Role: button`), what names it, its states, the keys its role owes and what a screen reader says.
- **The designed screens' accessibility problems,** each pinned on its layer with its WCAG number and its fix, and a summary for each screen, in the category Accessibility Review.

Both are replaced on each run, so what is fixed clears.

What to ask is in [Update Figma](commands.md#update-figma) on the Commands page.

- **You see the list first.** Each change names the component, what it adds and why. Nothing changes until you say yes.
- **The engine writes the change, not the AI.** It writes the script, Claude runs it through the Figma MCP, and the project hooks refuse any other write to Figma.
- **Only what the code already proves.** A component whose role differs between Figma and the code is listed for you to decide. Descriptions, missing components and layouts are never written. They stay on the hand-back list for your design team.

## Good to know

- **Share the results with your team.** Commit the files it creates in your project, so everyone, and your automated builds, check against the same design.
- **Figma stays as it is.** It only reads Figma. It tells you what to change there, and a person makes that change.
- **Reading Figma, the best way available.** [Refreshing the Figma data](commands.md#set-up) picks it for you. A `design.json` newer than the saved data first, then [figma-cli](https://github.com/silships/figma-cli) when Figma Desktop is connected to it (no API key, no rate limit, every mode), then the Figma tool of your Claude session, then the Figma API with a token. After you run `figma-cli snapshot`, the next check reads its `design.json` on its own.
- **Large Figma files, read in checked pieces.** Through the Figma tool of your Claude session, the tokens and the components are read a few at a time, each piece checked against a checksum Figma computes. Nothing is copied by hand, and a later refresh reads only the pieces that changed. See [Large Figma files](details.md#large-figma-files).
- **A Figma branch keeps a long scan steady.** Give the engine a branch's link, and it reads the branch instead of the main file. Edits on main then do not restart a scan. [Ask for it](commands.md#set-up) on a project already set up, and only the Figma file changes. Branches need a Figma Organization or Enterprise plan; a duplicate of the file works the same way on any plan.
- **Which TypeScript reads your components.** Your project's own, else one installed for the whole machine (a global npm folder, `NODE_PATH`, `tsc` on the PATH). Set `DESIGN_SYSTEM_ENGINE_TYPESCRIPT=project` to use only the project's own. `DESIGN_SYSTEM_ENGINE_CHROME=none` reads the code with no browser, even where Chrome is installed.
- **More detail.** Every option and how each check works are in the [technical documentation](details.md).
