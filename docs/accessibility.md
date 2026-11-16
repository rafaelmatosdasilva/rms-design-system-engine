# Accessibility

How the engine tests the accessibility of every component, and of your products' pages, in a real browser. What each part promises, and what to ask for it, is on the [features page](features.md#audit). All pages: [technical documentation](README.md).

**On this page**

- [Test accessibility](#test-accessibility)
  - [The Accessibility page](#the-accessibility-page)
  - [Pages and flows](#pages-and-flows)
  - [Beyond A and AA](#beyond-a-and-aa)
  - [Video and sound](#video-and-sound)
  - [Judgement calls, pre-sorted](#judgement-calls-pre-sorted)
  - [What a screen reader actually says](#what-a-screen-reader-actually-says)
  - [Which browser answered it](#which-browser-answered-it)

## Test accessibility

The check is against WCAG 2.2 at level A and AA. axe-core's rules run in the same check, and every control is tried hovered, focused and pressed, so one run covers all of it (see [what it cannot tell you](#what-it-cannot-tell-you)). Every problem comes with its fix in plain words.

### Where it runs

- **Your own stories, when you keep them.** If the project has Storybook and no target is named, the check runs on
  the stories themselves — every component in every state your team decided mattered, with the content it really
  carries, on the page that runs its own script. A finding is said as the component and the state you named it
  (`Button · Disabled`), not as a story URL.
- **Across your system, not its first corner.** When there are more stories than the check will open in one run, it
  takes one state of each component before a second of any, so a cap covers the system rather than whichever
  components the index lists first. The run says how many components it reached.
- **Your components.** On a page you name, your style guide or your built pages. React and Vue components with no page to open are rendered straight from their own code, in each Figma variant, with no dev server.
- **First as a person meets them.** Each starts at rest, then each state is drawn on its own. A set whose first option is `disabled` is still tried enabled, so Tab, focus and the keys are tested where people use it.
- **What your app gives them.** A Vue component that reads a Pinia store or links with Vue Router gets your project's own, when your `package.json` lists it and it is installed.
- **What your entry installs.** Whatever your `main.js` puts on the app goes on each component too, however it does it: `app.use`, a property set on every component (a translation function), `app.provide`, a mixin, or a setup function handed the app.
- **The data a page would pass.** A component drawn alone gets what a page would give it. A value it hands on to a child takes the child's type: a number for an amount the child does sums on, an icon for the child's icon. One the child has its own fallback for is left unset.
- **Lists inside its data.** The items of a list inside an object get the fields the code reads of them, and those a child it hands each item to reads. A list inside an item gets items too, three levels down, so a tree ends.
- **A field it only tests.** A field the code only checks (`v-if="item.badge"`) is off, so it does not turn on for every item.
- **The route it reads.** A component that reads the current route is drawn at a path its code expects, such as a name of the table it looks the path up in. The params, query and route name it reads are given too, and a router of the project's own that it imports is moved to the same place. When none can be read, its reason says so.
- **An icon of its own folder.** An icon that loads from a folder its code lists gets the name of a file in that folder.
- **One that cannot draw says why.** Its reason is given once, with how many of its cases it hits, such as a method called on an element it does not draw in that case, the input that was missing when it read a field of nothing, a list method called on what is not a list, or a date that is not one. The raw error follows it. It is reported as not checked, and the rest of the page is still kept for the next run.

### What it tries

- **Every state and colour mode.** Each control is measured again while hovered, focused and pressed, in every colour mode, its text and its edge.
- **High contrast mode and reduced motion.** Each is tried as well, and reported apart from AA (see [beyond A and AA](#beyond-a-and-aa)).
- **The keyboard.** The Tab key is followed through the page. It finds an element a mouse can click that Tab never reaches, a keyboard trap, focus that jumps back up the page and focus that lands where no one can see it. A modal dialog must keep the focus inside.
- **Reading order.** On each variant, the words, images and controls come in the code in the order they are seen, with one control or none as well as many (WCAG 1.3.2). Content hidden from screen readers is left out.
- **A control by what it does.** A `<div>` that answers a click with no role and no tab stop is a control no keyboard reaches, on its component's page too, not a part that needs no focus.
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
- One verdict line, such as `Verdict: 1 blocker · 2 warnings · 1 advisory · WCAG 2.2 AA`.

`--no-axe` and `--no-states` leave a part out, and then the result says not all of it was checked.

### The Accessibility page

The style guide has a page of its own for accessibility, under Documentation in the menu, as Rules and Documentation have theirs.

- **One table for every component.** Each row is one criterion of one component, the same row its own Accessibility area shows, under the same task number.
- **The same panel.** A row opens the panel it opens on the component's page, with what to do first, and under it a link to where the fix is made: See in Figma on a designer's task, See in code (the component's file) on a developer's, then the component it is on (a link to its page) and where it was read, then the criterion's level and its principle (Level AA · Operable).
- **Only A and AA.** The criteria WCAG 2.2 AA asks for, and nothing else. What the engine looks at beyond them (high contrast mode, reduced motion, AAA advice) and a Figma note no check reads stay on each component's own Accessibility area.
- **Filters.** A chip for each status (Issues, Review, Met) and one for what differs by browser, then the level and who acts. They combine, and each says how many rows it would leave. The component is in each row, and the principle and what a criterion depends on are in its panel.
- **A card a level.** Level A and Level AA, each the share of its criteria the system meets, with a bar for each principle (perceivable, operable, understandable, robust). The tip at each card's top right gives the sum in plain words.
- **Drawn at once.** The table shows as the page opens, with every result already known (tried when the page was built, or kept by this browser).
- **Being tried in this browser.** A component not tried yet has its rows say so, with a grey dot. When its try ends, each of its rows is drawn again where it is: nothing moves and nothing is sorted again while you read. The cards count only what is known.
- **The same table on a component's page.** Its Accessibility area is this table, built by the same code and limited to that component.
- **On the Status page.** Its Accessibility card counts the criteria that pass in one browser and fail in another, and opens this page with that filter on.

**How the percentage is worked out.** The engine checks for WCAG 2.2 AA, and AA asks for every criterion of level A and of level AA. The numbers count criteria, never rows or components, the way an audit reads WCAG, and none is an average.

| A criterion is | When |
|---|---|
| Met | No component fails it, and none waits on a review |
| To review | No component fails it, but at least one waits on a person's check |
| Failing | At least one component fails it |

- **Level A.** The level A criteria met ÷ all level A criteria.
- **Level AA.** The level A and level AA criteria met ÷ all of them. Levels build on each other, as WCAG conformance does: a system meets AA only when it meets every criterion of both, so the AA card counts both. 100% there means the system meets AA.
- **On the Status page.** Its Accessibility card is the same number as Level AA here, worked out by the same code.
- **Rounded down.** Every number, so 100% only ever means all of them are met.
- **In each card's tip.** The sum in plain words, such as *Level A criteria met ÷ all level A criteria, rounded down*. The counts themselves are under each percentage (12 of 22).
- **The ring and the bars.** A ring splits its criteria into met, to review and failing. Each principle's bar does the same for its own criteria, with no number of its own.
- **Why not rows.** A row is one criterion on one component. Counted that way, the many simple components that pass would hide the few that fail, and a system with no component meeting level A could still read 75%.
- **What is left out.** A criterion that does not apply to a component (video and sound on a button) is not counted for it. What is looked at beyond A and AA (high contrast mode, reduced motion, AAA advice) is on each component's own Accessibility area, never on this page or in its numbers.

### Two parts

- **From the code, always.** No browser and no page needed. It finds a button or link with only an icon and no label, an image whose alt is a file name, a removed focus outline, a mouse-only control, a hidden element that still takes focus, a misspelled `aria-*`, a page with no language or no main heading, zoom blocked and animations with no reduced-motion option. `"a11yStatic": false` turns this part off.
- **In the browser, when a page can be opened.** It goes deeper. A dialog or menu that Escape does not close, or that leaves focus somewhere other than the control that opened it. A modal dialog that lets Tab leave it. A tip a tap never shows. A message that appears with nothing said to a screen reader. A state lost in high-contrast mode. Variants told apart only by a colour some people cannot see.

### Contrast

- Measured against what is really painted behind each text, the layers at its centre in paint order, so text over a sibling or a `::before` is measured on that.
- A text colour is checked against its background token by name (`badge/label/warning` on `badge/background/warning`).
- Where the code paints the background as a tint (a `color-mix` or an opacity), only the rendered contrast decides. A tint is measured in every colour mode over each surface the system defines (Figma colour tokens with `/surface/` in the name, or `a11y.surfaces`), and the worst is reported with its surface.
- The pairs follow what Figma draws. The capture records, for each text and icon colour, the fill of the layer right under it.
- A border token a control shows itself by (an input's outline, a tile you pick) is held at 3:1 against the page by its border or its fill, as WCAG 1.4.11 asks of the boundary, even where borders are otherwise not paired. One that a control and something decorative (a card, a divider) both use is named as doing two jobs, with a control border of its own proposed. Advisory: `.design-system-engine-out/token-jobs.json`.

### Target size

Measured by the WCAG circle in every mode, at the page's own width and again on a 320 pixel screen, where a control that shrinks is caught (`320px wide`).

### Focus

A focus outline taken off a class counts as put back when a more specific rule shows focus on every element the class is put on (`button:focus-visible` for a class used only on buttons).

### A control's parts

A control's parts are checked with it: the label tied to its field, the error joined by `aria-describedby` while it shows (with `aria-invalid` set), the hint joined the same way, the indicator (a check, a chevron) silent for screen readers, the + and - of a stepper each with a name. Figma's layer annotations say which layer is which part ("role: label"); where nobody annotated them, the layers' own names say it (Label, Error message, Helper text, Chevron, Plus), and the finding says it was read from the name. The accessibility spec offered to Figma lists the parts the code's markup shows, so annotating them is one approval away. Before any browser, a field's own source is read for the same wiring (a `<label>` tied with `for` or wrapping the field, the error and hint joined with `aria-describedby`, `aria-invalid` while the error shows, an indicator with `aria-hidden`), and what is missing is said with the role check.

- **On the build sheet.** A component still to build lists its parts: each with its role, what it owes the control, and where that is checked once it exists (read in its source, then tried in the browser, or tried in the browser only).
- **A label across a shadow root.** A label outside another component, whose control sits inside that component's shadow root, cannot be tied by any id: browsers do not reach into a shadow root yet. It is said apart, as wiring no browser makes yet (an advisory, in the source check and in the browser), never as a plain failure.

### Products' pages

Run on the style guide, it also opens each product's built page whole, with every rule, axe-core's heading order and landmarks among them. On a whole page the Tab walk also says when the focus goes back up the page within a column (2.4.3) and when it lands on a control no one can see (2.4.7). `a11y.products: false` leaves the products out.

Findings are named after the product and listed on the Status page under Products.

### Pages and flows

Some WCAG criteria belong to a page, not to a component. They are tried on each product page the check opens (a product's built page, a page given with `--url` or `a11y.urls`, a page found on the dev server), and across the pages of one product. Pages of two products are never compared.

| Criterion | What is tried | How it can end |
|---|---|---|
| 2.4.2 Page Titled | A title on each page, not the same on two pages | Passes, to fix, or a person checks two pages that share a title |
| 3.1.1 Language of Page | A `lang` on the page, written as a language tag | Passes or to fix |
| 2.4.1 Bypass Blocks | A main landmark, or a skip link that lands on the page | Passes or to fix. A long header with no skip link is advice |
| 3.2.3 Consistent Navigation | Each navigation, by its name, keeps the items it shares in the same order | Passes or to fix |
| 3.2.4 Consistent Identification | A link to the same place, in a header, navigation or footer, reads the same on each page | To fix, or a person checks the buttons and icons |
| 3.2.6 Consistent Help | Help (a help page, a contact, a chat) stays in the same part of the page, among the same things | Passes or to fix |
| 3.3.7 Redundant Entry | A field a later page of a flow asks for again, empty when it opens | A person checks; passes or to fix once the flow is walked through |
| 3.3.4 Error Prevention | A form whose button reads as paying, signing or deleting, with or without a way to review or undo it | A person checks |
| 1.3.4 Orientation | What in the page's own styles or scripts locks it to one orientation | Passes, to fix, or a person reads words that ask for a rotation |
| 2.4.5 Multiple Ways | How many ways the product offers of finding a page | Passes or to fix |

- **Flows.** Name each flow in `ds-config.json` → `a11y.flows`, its pages in order: `[{ "name": "Checkout", "pages": ["cart.html", "/checkout/address", "/checkout/pay"] }]`. A page is matched by its address or the end of it. With no flow named, 3.3.7 is a person's to check.
- **A flow walked through.** `a11y.walkFlows: true` fills each step in with values of its own and sends it, then reads what the next step asks for. A field asked again after the flow was really given it is a fail, not a question for a person. It types into your running product, so:
  - nothing is walked unless you ask for it;
  - nothing is ever typed into a password field, or one that asks for a card, an account or a government number;
  - it stops before a step whose button reads as paying, signing, ordering or deleting, and says how far it got;
  - it stops when a step does not move on, since the made-up values may have been refused;
  - the last step is read, never sent.
- **Orientation.** 1.3.4 is read from each page's own style sheets and inline scripts: a rule inside an `(orientation: …)` query that hides the page or turns it on its side, and `screen.orientation.lock()`, are the page's to fix; words asking the reader to rotate the device are a person's to read, since only a person knows whether the page is one the standard excepts (a game, a piano keyboard). A style sheet from another origin cannot be read, and the pass says how many were left out.
- **More than one way.** 2.4.5 counts the ways one product offers of finding a page: its menu, a search, a sitemap, breadcrumbs, and links between its own pages. Two or more pass. A product whose pages are all steps of one named flow is the process the criterion excepts, and passes with that said.
- **What a person decides.** Without a walk the pages are opened one by one and never filled in, so a field a flow fills once it runs looks empty here. Whether a step really commits money or data, and whether its review lets people correct it, is read from words only. These end as A person checks, never as Passes.
- **One page alone.** 3.2.3, 3.2.4 and 3.2.6 need two pages of the product. With one, the check says so and asks for more pages.
- **Where it shows.** The check prints each criterion with how it stands and the pages it was tried on, and `--json` keeps them under `pages`. On the style guide's Status page, each one left to fix or to check is a row under Accessibility, with its pages.

### Beyond A and AA

Two things the check looks at are not asked for by WCAG 2.2 at level A or AA. Each is a row of its own on a component's Accessibility area, named in words, listed after the criteria and always advisory — no criterion is marked as failing for them:

- **Forced colours.** In Windows high contrast mode the browser throws your colours away and paints with the reader's own. The check looks for an icon or a text the mode makes vanish, a state that then looks like the rest, a focus ring that was only a shadow, and the edge of a field, checkbox, radio or switch that read at rest and is gone there (a box-shadow, or a background colour standing in for a border). An edge already too faint at rest is 1.4.11's own finding and is not counted twice.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, anything that still transitions or animates.

Both are the audit's: the mode is set through the browser, which the style guide's own page cannot do, so each row says to run the audit until one has.

Why apart: an icon that disappears in high contrast mode used to be reported as WCAG 1.4.11 failing, and a focus ring as 2.4.7. That told a team an AA criterion was broken where the standard asks for nothing at all — and a conformance claim has to be true about the standard, not about everything worth fixing.

### Video and sound

A component that plays video or sound runs the media criteria (1.2.1 to 1.2.5, 1.4.2) and no other component does. A video with no captions track (1.2.2) and sound that starts by itself (1.4.2) are found in the browser; what only a person can judge — whether a transcript is accurate, whether live captions keep up, whether what the picture shows is described — is a row with the steps to check it. A component that plays nothing leaves all of these out.

### Judgement calls, pre-sorted

Three criteria are a person's to settle and no machine's: whether a heading or a label says what follows it (2.4.6),
whether an error message says how to put it right (3.3.3), and whether a link's own words say where it goes (2.4.4).
The checks find what a pattern can find — an empty heading, a name that says little, a "click here" — and the rest is
a reading. An auditor goes through every heading and every message in turn, and most of them are fine.

Ask for it and a model reads the words first:

```bash
rms-design-system-engine --judge-a11y
```

- **It reads words, nothing else.** Each component's own code gives its headings and labels, its link words and what
  it shows as an error. The model sees those lines and the question each criterion asks — not the component, not its
  props, not its look.
- **It decides nothing.** Every wording comes back *likely*, *unclear* or *fine*, with one short reason. No criterion
  passes or fails on it: the row keeps the status the checks gave it, and the list sits under it as what to look at
  first. *Unclear* is a real answer — a label that reads oddly on its own may be clear beside what it labels.
- **It never writes the words.** The reason says what it read, never a replacement: the words are the team's.
- **It runs only when you ask, and once per wording.** It spends your model tokens through your own command
  (`a11yJudgement.cmd`), and an answer is kept by the words themselves, so the same heading is never paid for twice.

### What a screen reader actually says

What a screen reader says is read from Chrome's accessibility tree on every run. That is what the browser hands over,
not what a person hears. Ask for it and the engine listens with a real one:

```bash
rms-design-system-engine --hear
```

- **The computer's own reader.** VoiceOver on a Mac, NVDA on Windows, driven through Guidepup. `--reader nvda` or
  `--reader voiceover` names one, and `--component menu` hears one component.
- **Each control, as Tab reaches it.** Each component the style guide draws opens in a browser window in front. The
  focus moves to each control in turn, and what the reader said is recorded.
- **Held against the browser.** The name, the role and every state the browser gives must be in what was said, in
  that reader's own words ("dimmed" is VoiceOver's "unavailable"). A state it drops, or a name it never says, is
  listed with what it left out.
- **A measurement, and advisory.** It is shown on the component's 4.1.2 row with the reader and the day. No criterion
  passes or fails on it, since a reader's quirk is not the component's failure. Once the component changes, the row
  says to hear it again.
- **It speaks aloud and changes nothing.** The reader talks while it runs. A reader that cannot be driven yet is said
  with what to turn on (on a Mac: "Allow VoiceOver to be controlled with AppleScript" in VoiceOver Utility), and the
  engine never turns it on itself.
- **Kept in one file.** `.design-system-engine-out/heard-by-reader.json`, which the style guide reads.

### Which browser answered it

Engines differ in layout, fonts, form controls and focus rings, so a run in one browser answers some criteria for
all of them and others for that browser alone. Each criterion says which it is, and its row says so under what was
found:

| What it depends on | Criteria | What the row says |
|---|---|---|
| The code, the markup or your own values | A missing alternative text, contrast from the tokens, an orientation lock in the page's CSS, a title, a language | *Same in every browser* |
| The browser | What Tab reaches, where the focus shows and whether anything hides it, reflow at 320px, zoom, text spacing, what an input does when it changes, dragging, target size | Each browser's result, *Chrome ✓ · Firefox ✓ · WebKit ✕*, where the other browsers tried it |
| Chrome's accessibility tree | What a screen reader hears (4.1.2) | *Chrome only* — no other engine exposes one, and a tool that works it out itself reads the same everywhere |

**Tried in Firefox and WebKit too.** Six of the criteria a browser decides are tried again in the other browsers, on
each component the style guide draws:

- **Which ones.** What Tab reaches (2.1.1), whether the focus shows when it gets there (2.4.7), reflow at 320px
  (1.4.10), text spacing (1.4.12), zoom to 200% (1.4.4) and target size (2.5.8).
- **The same measurements.** They are plain scripts run in the page, with real Tab presses. Chrome is measured by the
  same code in the same pass, so a difference is never two ways of measuring.
- **Only what differs is said.** A fault in Chrome is reported once, by the Chrome run. One that only another browser
  has is a finding of its own on the row, *Fails in WebKit only: no visible focus when Tab reaches it,
  button.icon*, and the row keeps the worst status across browsers.
- **Firefox by default, Safari when asked.** Firefox runs whenever it is installed. Safari opens a window of its own,
  so it runs when `a11y.browsers` names `webkit`, and `a11y.browsers: false` turns the pass off
  ([config](../reference/config.md)).
- **Option+Tab in Safari.** Safari moves Tab between text fields only, unless a person turns on "Press Tab to
  highlight each item". The pass presses Option+Tab there, which reaches every control, and the row says so.
- **The Safari it opens is closed again.** Safari keeps the copy a session started running after the session ends,
  one more for every session. The engine quits exactly the copies it started, when it is done or stopped. Your own
  Safari is never touched.
- **A browser that is missing is said.** The run names it rather than passing over it, and the rows keep saying
  *Tried in Chrome*.
- **Counted on the Status page.** Its Accessibility card says how many criteria differ by browser, and opens
  [the Accessibility page](#the-accessibility-page) on them.

The other criteria a browser decides (what an input does when it changes, dragging, content on hover, a focus hidden
by something else) are still tried in Chrome alone, and their rows say so. Rendered parity is drawn in the same
browsers (see [Measure Figma-code parity](audit.md#in-the-browser)), through the same drivers.

### How sure each finding is

- **Blocker.** Measured on the page against WCAG 2.1 A or AA.
- **Warning.** Read from the code, a contract or a Figma note, and can be wrong.
- **Advisory.** Beyond AA, or for a person to judge.

The check ends with one line, `Verdict: 1 blocker · 2 warnings · 1 advisory · WCAG 2.2 AA`. A must-pass check (`"a11yStrict": true`) never stops on an advisory.

### Who acts on each finding

A criterion is not a task. One criterion often owes work to more than one person, and a single finding can owe two
of them a step each: a colour pair is picked in Figma, then used in the code.

| Person | What falls to them |
|---|---|
| A designer, in Figma | Colour pairs, focus states, target sizes, a visible label, a role not stated yet |
| A developer, in the code | Markup, ARIA, keyboard, focus, ids, reading order |
| Whoever writes the words | Alternative text, a link's words, a label, a heading, a page title, captions |
| Whoever owns the flow | Help in the same place, navigation alike across pages, a step that can be undone |
| A person checks it by hand | What no machine decides: whether a heading describes its section, whether an error says how to put it right |

- **It comes from the finding, not the criterion.** Each kind of finding names the people it owes work to, and what
  each of them does. A kind that names nobody is the code's, in one step.
- **Two people, in order.** Where a finding owes two steps, each person gets their own task and the second says which
  step it is (`2/2`), so a task read on its own still says it follows another's.
- **It travels with the result.** Every finding in `a11y.json` carries its tasks, so an agent reading the file knows
  who acts without being told.
- **Where it shows.** The check prints the tasks under each finding, and ends with a count per person. On a
  component's Accessibility area each criterion becomes one row per person, with a **Who acts** column and a filter
  that takes several people at once, so a team sees only its own work. What is done keeps its person, so a team can
  see what it has finished as well as what is left.

### What a person checks by hand

Nine criteria only a person can decide, and two more the checks try but a person settles. The engine says what to
look at, **how to look at it**, and keeps the answer only while it is still true.

- **A few short steps, per criterion.** Each one says the two or three things to do before judging: zoom the page to
  200% and see whether the text blurs, make the field fail and read the message, walk the flow from its first step.
  They are the same for everyone, so two people checking the same criterion check the same way.
- **What to do when it fails.** The last step says to leave it unchecked and whose task it becomes, rather than
  pretending every check ends in a pass.
- **Say you checked it.** `rms-design-system-engine --checked <component> <criterion> --by "<name>"
  --with "<browser and screen reader>"`. `--with` is free text, said back as it was written: a closed list would be
  wrong the day a new version ships.
- **Why `--with` matters.** A criterion read out loud is only checked for the pair that read it. A check made in
  VoiceOver says nothing about NVDA, and the page no longer lets one stand for the other.
- **It expires on its own.** The record keeps the component as it was (its CSS rules, its contract entry, its source
  file). Change any of them and the row reads *To check again*, saying who checked it before and with what.
- **It is their word, and the page says so.** Nothing confirms the screen reader was running, or that it said what
  the person reports. The row reads *Done* — their word is what the criterion asks for — and says whose word it is,
  what they checked with (or that they did not say), and that the engine measured none of it. Where every other row
  names the measurement it came from, this one reads *A person's word (QA, 5 Nov)*.
- **What meeting the standard rests on.** When a component meets WCAG 2.2 at A and AA, the badge adds how many of
  its criteria rest on a person's word, so nobody reads the claim as measured throughout. A conformance report has to
  know the difference, and this is where it comes from.

### Only what changed is tried again

- **Each page's results are kept.** They are saved under what the page rests on: its components and your CSS, your settings, and the check itself.
- **A token change tries only the components that use it.** Each component is signed with its own CSS rules and the tokens they reach, through `var()` and in every brand. A colour changed in Figma tries again only the components that show it.
- **A token the whole page shares tries every component.** That is a token the style guide's frame or your global CSS uses (a page background, the body text).
- **An unchanged page is not opened again.** The next run puts its results back, and the report says how many pages it reused. When nothing changed, no browser opens and the check takes seconds.
- **An engine update tries again only what it could have changed.** Results are signed by what decides them: the
  checks, the thresholds, the rules they run and the in-page script. What a finding is called, why it matters,
  what to do about it and who does it are words, kept apart and left out of the signature, so a reworded finding
  never makes a whole system check itself again. A comment on a line of its own is left out too; one after code
  is kept, because finding where it really begins means reading the strings around it, and a signature that
  guessed wrong would put back results the engine should have checked again.
- **A change is tried at once.** A style guide is checked a few components a page, so a change to one component tries only its page again.
- **An engine update re-checks only what it changes.** The check is signed by the parts of the engine that measure: a new page in the style guide, or how the browser is driven, keeps every result. A component whose name is not valid CSS is said not checked once, and its page is still kept.
- **A change to your CSS's comments or spacing keeps every result.** Only the rules count.
- **A change to the style guide's own screens keeps every result.** The Status table, the Documentation panel and the other screens around the components never reach what the check measures. When only that CSS changed, each part's page is opened just long enough to read what surrounds its components, and its results are put back. A change around a component (its stage, the page behind it) still tries it again.
- **The report says why a page was tried again:** the check changed, the CSS every component shares changed, which components changed and the tokens that moved them, or it was never checked before.
- **Several pages are tried at once.** When many need trying, a few browsers share them out (`a11y.parallel`, by default a quarter of the computer's cores), and the report is the same as one browser's.
- **Each part lays out only its own components.** The style guide's own screens (Status, History, Documentation) are left out of a part's page. They hold a copy of every component, and on a big guide laying them out made each part slow, until the browser stopped answering.
- **A run stays inside its time.** The browsers that share the parts, and then the run itself, each stop on their own before `a11y.timeoutSec` runs out. What they checked is kept, so the next run goes on from there.
- **A check of a few components opens only their parts.** `--component` no longer goes through the whole guide to reach them.
- **Live pages are always tried.** A page from a dev server or a link can change without the engine knowing, so it is never reused.
- `--fresh` (or `a11y.reuse: false`) tries every page again.

### Accessibility never gets worse

A conformance claim holds only if the next release keeps it. So a merge request (GitLab) or pull request (GitHub) can fail when it adds an accessibility problem the last build did not have.

- **What it compares.** This run's accessibility result with the one the last build on the base branch kept.
- **Only blockers count.** A warning or an advisory never fails it.
- **Only components and products' pages.** A finding on the page around them is left out, and so are prototypes.
- **Old problems are not new.** A blocker the base branch already had is ignored, even when its measured value moves.
- **Each blocker is keyed the same way every time.** By its component or product page, the element and its variant, the state, the colour mode, the WCAG criterion and the kind of problem.

What you get:

| Situation | Exit | What it says |
|---|---|---|
| A new blocker | 1 | Each one, such as `new: cardTile, disabled (Light), 1.4.3 contrast 3.1:1` |
| No new blocker | 0 | That, and each blocker fixed since, as good news |
| No build kept a result yet | 0 | That there is nothing to compare, so it passes |
| This run has no result of its own | 2 | That the check did not measure anything, so nothing can be compared |

- **A component this run could not read** is listed as not checked, never as fixed.
- **It only reports.** It never changes your code. Your pipeline decides what a failing exit stops.

#### Set it up in CI

Two steps, both after the audit:

1. **On the base branch**, keep each build's result: `rms-design-system-engine --a11y-no-worse --record`. It writes `.design-system-engine-out/a11y-last-build.json`.
2. **On each merge request or pull request**, compare: `rms-design-system-engine --a11y-no-worse`.

The pipeline carries the file from the base branch to each merge request: as the last job's artifact on GitLab, in the cache on GitHub.

GitLab (`.gitlab-ci.yml`):

```yaml
.a11y:
  image: node:24-bookworm
  variables:
    CHROME_PATH: /usr/bin/chromium
  before_script:
    - apt-get update -qq && apt-get install -y -qq chromium > /dev/null
    - git clone --depth 1 https://github.com/rafaelmatosdasilva/rms-design-system-engine.git ../engine

a11y-keep:
  extends: .a11y
  script:
    - node ../engine/audit.mjs --only accessibility || true
    - node ../engine/audit.mjs --a11y-no-worse --record
  artifacts:
    paths: [.design-system-engine-out/a11y-last-build.json]
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

a11y-no-worse:
  extends: .a11y
  script:
    - mkdir -p .design-system-engine-out
    - 'curl -fsSL -H "JOB-TOKEN: $CI_JOB_TOKEN" -o .design-system-engine-out/a11y-last-build.json "$CI_API_V4_URL/projects/$CI_PROJECT_ID/jobs/artifacts/$CI_DEFAULT_BRANCH/raw/.design-system-engine-out/a11y-last-build.json?job=a11y-keep" || true'
    - node ../engine/audit.mjs --only accessibility || true
    - node ../engine/audit.mjs --a11y-no-worse
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

GitLab keeps the artifact of the latest successful job on each branch, so the merge request reads the base branch's last one. Before the first, nothing is fetched and the check passes, saying so.

GitHub (`.github/workflows/a11y-no-worse.yml`):

```yaml
name: accessibility never gets worse
on:
  push:
    branches: [main]
  pull_request:
jobs:
  a11y:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: git clone --depth 1 https://github.com/rafaelmatosdasilva/rms-design-system-engine.git ../engine
      - uses: actions/cache/restore@v4
        with:
          path: .design-system-engine-out
          key: a11y-main-${{ github.sha }}
          restore-keys: a11y-main-
      - run: node ../engine/audit.mjs --only accessibility || true
      - if: github.event_name == 'pull_request'
        run: node ../engine/audit.mjs --a11y-no-worse
      - if: github.event_name == 'push'
        run: node ../engine/audit.mjs --a11y-no-worse --record
      - if: github.event_name == 'push'
        uses: actions/cache/save@v4
        with:
          path: .design-system-engine-out
          key: a11y-main-${{ github.sha }}
```

GitHub's runners already have Chrome. A pull request can read the caches its base branch saved, and the cache also lets the check reuse the pages that did not change. Name your base branch where it says `main`.

### What the Figma file is missing

Some problems belong to the Figma file. They are found in Figma alone, before any code exists, and listed for whoever keeps it.

- **Contrast.** Each text colour on each surface it is drawn on, in every mode: 4.5:1 for text, 3:1 for an icon or large text.
- **What it is drawn on.** The fill painted right under the text, looked for inside the layers before it too, so a button's fill on the `Background` inside its state instance counts.
- **Pairs the system makes.** A text colour is also measured on the background its name pairs it with, and on every surface when nothing is drawn under it.
- **Not measured, said.** A text on nothing its own component paints, when no surface is known, is said to be unmeasured, never passed. The surfaces are the colours named as one (`surface/…`, `background/…`, an app's own background such as `appBackground`), or the ones `a11y.surfaces` in `ds-config.json` names.
- **Focus.** An interactive component with no focus state, so the code has to invent the focus ring.
- **Focus ring.** A ring drawn in the focus state is held to 3:1 against every surface, in every mode.
- **A control's edge.** A field, a dropdown, a checkbox, a radio, a switch or a slider is found by its edge, not its words. A name that could mean something else (a toggle, a stepper, a field shown read-only) counts only when the code confirms an input. The capture reads these edges for the components whose name says they take input, so the answers Figma sends stay small. In each variant that is not disabled, at least one of its layers (its fill or its border) must reach 3:1 against what is painted under it, in every mode (WCAG 1.4.11). On nothing of its own, it is held against every surface the system defines. A button or a chip with its own words needs no edge.
- **Target size.** A control under 24 pixels tall or wide, in any of its variants.
- **Which components are controls.** Figma's `Role:` note says it first. Then the code, once the browser has measured it: a component that is itself a control there (Tab reaches it, or it has a control's role) is one, whatever its name. A measurement never rules one out: it may have tried a disabled variant, and a dialog's facts are its first button's. Otherwise its name says it:
  - a control's name (`iconButton`, `textField`), or the type first (`buttonBold`, `fieldPlain`);
  - the last part of a path (`nav/TabCompact` is a tab);
  - a row of what opens to pick from is what is picked (`dropdownPickerRow` is an option, `menuRow` a menu item);
  - a segmented control is a radio group;
  - a group or a part of controls is not one (`checkboxStack`, `tabBar`), nor a spacer;
  - a name that starts with a container and ends on a control names the container (`dialogLink` is a dialog);
  - a word that names other things too (a stepper, a toggle, a field shown read-only) counts only when the code confirms it;
  - last, its states: a component drawn hovered, pressed, focused or disabled is something a person operates, whatever its name (a menu entry, a card that opens), unless its name ends on a part (a row's background, a label).
- **Role.** A control with no `Role:` note: the note says which role the code gives it.
- **Name.** A control that shows no words and has no note naming it (`aria-label: "Close"`).
- **Error.** An error state with no message, so the error is shown by colour alone.
- **Advice, apart from WCAG's failures.** What the code needs to be told and Figma does not say, listed after the failures and on a frame of its own on the design team's to do page ("Advice for the Figma file"):
  - an image with no note for its alt text, or to say it is decorative;
  - a disabled variant that says nowhere why it is disabled (no note, no helper or tooltip text);
  - a control with no hover, pressed or disabled state, and no error state for one that takes input;
  - a control with no accessibility note at all, and nothing about it in its description.
- **Reading order.** Words placed by hand in another layer order than they are seen in, so the code built from the layers reads in another order (WCAG 1.3.2). A frame in auto layout is always in order, artwork is never read, and labels that share no row or column (round a chart) have no order to keep.

Each gap reaches the design team:

- **In Figma.** `--figma-edits` puts each one on the page "Design system to do", in a frame "Accessibility the design owes": one card per gap, with its WCAG criterion and its fix. It is written only after you say yes, and afresh each time, so what is fixed clears.
- **On the style guide.** Each one is on its component's Accessibility list and on the Status page, for you in Figma.

Meanwhile Claude writes a visible focus ring and leaves the words of an error message or a name to you. `"designA11y": false` in `ds-config.json` turns this off.

### What it cannot tell you

An automated check finds many failures, but it cannot show that a product meets WCAG.

- **Meaning.** Whether a label, an error message or a heading makes sense is for a person to judge.
- **Whole tasks.** Whether someone using a screen reader or only a keyboard can finish a flow from start to end is tried by a person.
- **Where it shows.** These are listed as You check by hand on the Status page, and a row stays open until someone says it was checked.
