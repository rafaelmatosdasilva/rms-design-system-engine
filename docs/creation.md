# Creation

How the engine makes new themes of your system, and builds prototypes with your real components. What each part promises, and what to ask for it, is on the [features page](features.md#creation). All pages: [technical documentation](README.md).

**On this page**

- [Design themes over your system](#design-themes-over-your-system)
- [Prototype with your real components](#prototype-with-your-real-components)
- [Turn Figma into code](#turn-figma-into-code)
- [Turn code into Figma](#turn-code-into-figma)
- [Build from your documentation](#build-from-your-documentation)
- [Generate in Figma from a prompt](#generate-in-figma-from-a-prompt)
- [Generate in code from a prompt](#generate-in-code-from-a-prompt)

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
- **Primary and secondary colours**, the **app background**, the **header background** (every header's own background token, one setting for them all), and each **gradient** your system gives in stops (a part's `background/start` and `background/end` tokens).
- **Button and card roundness** (the card's also reaches the other surfaces with corners of their own: a bar, a panel, a sheet, a modal), **spacing** (every gap, padding and margin, scaled together), **border thickness**, **shadows** on or off and their **blur**.

Each setting reaches the tokens named for it and every token that follows them, so the whole chain changes and nothing else does.

- **Only what the screens use.** A setting is listed only when the screens on show draw with its token, so every setting changes something you see.
- **Spacing says what it changes.** Under its percentage, a list of each spacing token the screens use, its size now and at the percentage chosen (`spacing/gap/l 16px → 20px`), in whole pixels. Hovering one outlines what draws with it.
- **A shadow colour** for every shadow at once (the system gives each component its own), and the shadow settings locked while shadows are off.
- **Shadows off reaches every component with a shadow**: components draw their shadow from its colour token, never from the system's on-off switch, so off sets every shadow's colour to transparent, besides the switch.
- **Shadows on shows every shadow**: turned on, every shadow takes the shadow colour and blur, since the system draws some transparent or with no blur (a button's, a white card's).
- **Undo and reset.** Each colour, and each slider's number, has a reset arrow back to where it started, shown only while the value differs from it, and **Reset changes**, in the panel's top bar, puts the whole editor back as it opened. It stays disabled until something changes, and asks before it resets.
- **Number fields** have − and + on either side, and take whole pixels.

### The preview

The preview opens on the **specimen**, a screen the engine builds from your own system, so every system has something to preview. Your Showroom's screens follow it in the same list.

- **One grid of components.** Every tile is a component as your code renders it, never a drawing. Buttons come first, primary leading, each with up to four of the variants its code renders. Then fields, choices, status, messages, navigation, surfaces, data and the rest.
- **Nothing invented.** The build plans the specimen (`lib/specimen.mjs`) and checks every component it places against the component catalog, with the same check prototypes, `--check-ui` and the MCP `check_ui` tool use. A component the check refuses, or one the code does not render, is left off. With no catalog yet (no audit has run), there is no specimen.
- **Full screen.** The button at the end of the preview's bar shows it at the screen's real size. Escape brings the form back. It is for trying the screens: nothing is outlined or named there, and a click does what it does in the app.
- **No scroll bars.** A screen still scrolls, as a phone does, but shows no bar of its own.
- **Zoom and pan.** The bar's zoom is a number field like the others (− the percentage, its reset, +). Zoomed in, the preview keeps its size and its screens scroll inside it, so the form beside it scrolls as before. Hold the space bar, or the middle button, and drag to move it.
- **Every screen scrolls.** A new screen shows only once the theme is on it, so your original brand never flashes first.
- **Screens side by side.** A page built for showing the editor can ask for its screens in a row, with no list to choose from (`row: true` in its data, as `enabled` is): phone screens shown together, centred, the panel's own background around them.

### Light and dark

- A colour is given in light. Its dark value is worked out the way your system moves its own: the same step of the scale, in the new hue.
- A new colour's ramp keeps each step as light as the system's own step, with its colour strongest at its own lightness.
- Every text and icon drawn on a colour is held to WCAG AA (4.5:1). When the worked-out colour falls short, the nearest shade that reads is taken instead.
- You can set a dark value by hand. The reset button beside it goes back to the worked-out one.

### One component's tokens

Click a component on the screen. The innermost one under the pointer is picked (a button in a card is the button); clicked again, it goes a layer deeper toward where you clicked (a table, its rows, a row, a cell, its text). A component is found by the Figma name a Showroom screen marks it with (`data-figma`), else by its classes; a component the system gives only semantic tokens (`semantic/avatar/…`) is found by that name too.

- **What you edit is named.** A label with its name sits above the part picked, in the guide's own tooltip colours, and nothing outlines it, so nothing sits on what you are judging. Hovering shows what the next click picks. The head of the card starts at the component clicked, even one inside another (a tag in a table is the tag), and goes down through the layers picked in it, each step a click back to that level.
- **Text of its own.** A text in no component is picked by its text style, named on hover.
- **Only its own tokens.** A layer picked (a card's text) shows only what that layer draws with, never its component's other tokens. The form shows the tokens that part really draws with, as the browser's cascade decides, its hover, focus and press included. Hovering a token outlines the parts that draw with it.
- **Values as they are now.** Each token shows its value with the theme on it, in light and dark, and follows as you change the theme.
- **Units from how a token is used.** A token its rules use as `calc(var(…) * 1%)` reads as a percentage, an opacity from 0 to 1 as a percentage, a size in pixels as px, and anything else as a plain number.
- **Linked tokens, as Figma shows them.** A token that follows another shows that token's name in its field (a colour's with its swatch) instead of a value, and a button to detach it. Detached, it takes a value of its own, and a reset in its field links it again. A token linked to another of its own component (its corners on one radius) follows it as it changes.
- **The system's colours.** A colour's chip, or the button beside a detached colour, opens every base, semantic and primitive colour of the system, searchable, each swatch as this theme draws it. The list opens over the panel, below its field or above it when there is more room, and only the list scrolls; a click outside it, or Escape, closes it. One chosen links the token to it, its dark value following that colour's own.
- **Only real tokens.** Everything a part offers is one of the system's own tokens: its corners are its radius tokens, never a value of the editor's own.
- **A colour that never shows.** When the code mixes a colour token at 0%, its field says so: a change there never shows, and the task is for the code, on the Status page.
- **Text style.** A text shows the text style it is drawn in, and that style's own size and line height at the breakpoints the screens on show are at (phones: Phone), its breakpoint named under each value. The values are the token's own breakpoint modes. A change is the style's token's, so every text in that style follows.
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

**A colour asked for by how it looks or what it means** (`--query green`, `--query success`) is read from the tokens' own values in every mode, and from the names they carry. The answer lists the system's tokens that are that colour, or says plainly that the system has none, so an agent asked for "a small green Saved" uses the system's green or says there is none, instead of writing a hex value. A request for new UI that names a colour asks for it on its own.

Each component's line names its props as the code takes them. Where Figma and the code call the same prop by different names, the code's name is the one printed, because what the agent writes is code and the Figma name is one the code refuses.

**It also notices when an agent did not read.** `--catalog` remembers which components' cards it handed over, and `--check-ui` says which components the generated page used without one. It is a warning, never a refusal — a card can reach an agent another way — and a project where nothing has been handed over yet says nothing at all rather than flagging everything. Agents that skip a component's card are where most layout and prop mistakes start, so this names the cause instead of the symptoms.

Then it says which source decides when two disagree. The goal of the people who use the product first, then verified research, then the system's documented standards, then accepted past decisions, then general heuristics, with this system's own source named at each level and WCAG 2.2 AA as the floor. Under the tokens it says what each is for in your team's own words, from the descriptions you write on the variables in Figma, the brand's first, so an agent picks a colour by its purpose and not by its name alone. The notes your team writes in Figma outside any component (on its foundations, brand and pattern pages) are said too, by page, once the annotation categories are read (`--annotation-categories`); a note for whoever draws the file (Authoring) is left out. It stays small enough to read whole. For a large system the full catalog stays in `catalog.json`.

### In a product beside your system

A product checked out beside your system (listed in `pluginDirs` or `products` in `ds-config.json`) imports it by its package name, as products do: `import { AcmeButton } from '@acme/ds'`.

- **Its components are your system's.** The page check follows the package's entry to each component's file, so a named import, a renamed one (`AcmeBadge as Pill`) and a default one all count.
- **A name the package does not have is said as such**, with the nearest one it has.
- **The edit check reads the product's files too**, each against its last commit in the product's own repository.
- **Each card gives the import that works where the prototypes are.** In your system's folder, its own path. With `prototype.dir` set to a folder in the product, the package's name.

The package's name is `imports.system` in `ds-config.json`, else the `name` in your system's own `package.json`.

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

**Three ways a page moves.** A prototype's pages lead to each other, and most of them never touch the address bar, so the check watches for all three: something changed on the page, the address changed, or the router the page was drawn with moved. A page drawn on its own is given a router that knows every route your own router knows, by name and by path, so a control that calls `router.push({ name: 'OrderDetail' })` reaches a route instead of throwing. The router itself is never installed — only what it knows is.

**Wired, and not the same as inert.** When a control's own handler throws, the app catches it and nothing shows, which used to read as a control that does nothing and sent people looking for a missing handler that was there all along. The check now listens for that too, and names it as what it is: wired, and untried here because it needs something this page was drawn without.

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

### Documentation that is there and says nothing

An empty description is visibly empty. A sentence that restates the name is not — and an agent choosing between those components has exactly what the names gave it.

So the catalog names them:

```
📝 DOCUMENTED IN NAME ONLY  2 of 275 component(s): cardTile, fileWell
   Their description repeats the name and the words every description here shares, so it says nothing about
   what they are for: choosing between them gives an agent what the name gives and no more.
   One sentence each, saying when to use it, is what this asks for.
```

This is not a house-style opinion. It reads whether a sentence carries anything past three things:

- **The component's own name**, however it is spelled — `fileWell` and "file well" are the same word here.
- **The words your own descriptions share.** These are read from your system, never configured: if half of them open "Use for … content", then "use" and "content" are your house phrasing and say nothing about any one component. Your library's name, your framework's and your team's turn of phrase differ per system, and nothing outside your system knows them.
- **The language every design system's documentation uses** — component, library, element, widget.

What is left has to be two words of its own. One is usually the name said again in other letters.

Two things it leaves alone:

- **A field with nothing in it.** That is already shown as empty, and asking twice for the same sentence helps nobody.
- **A small system.** Under eight written descriptions, a shared word is a coincidence rather than a pattern, so nothing is taken away.

On a real system of 275 components this found two. It is meant to: a check that flags a tenth of your library is measuring your writing style, not finding a gap.

### The words you write are the words it draws

Your components are captured under the names your design file uses (`Label`, `Disabled`). Your catalog hands an agent the names your code uses (`label`, `disabled`) — because that is what a developer writes. The drawn page used to match those exactly, so a page written from the catalog matched none of them: **the words were dropped and the component's placeholder drew instead.**

Every check passed. A prototype could read `Save` on every button, and nothing said so — the component was yours, the prop was real, nothing was invented. It took a model reading the pictures to notice.

A prop is now found by the component whatever your catalog called it, for text, choices, switches and slots alike.

### The page itself, not just a report about it

A page written the way your product writes its pages was drawn in a browser to be measured, and then thrown away. The one thing a designer hands to a client or a developer — the thing itself — existed nowhere, and the run told you about a page you could not look at.

It is kept now: one picture a width, beside the page.

```
📱 EVERY SIZE  Phone (375px), Tablet (768px), Desktop (1280px) · the words as written and 40% longer: 4
   the page, as a person sees it: .design-system-engine-out/prototypes/ApproveOrder@phone.png, …@tablet.png, …@desktop.png
```

**A gap is drawn where you can see it.** A need your system has nothing for is written as an empty `div` carrying `data-missing`, which is exactly nothing on screen: the engine's own canvas drew it as a labelled box, and a page running in your product drew air. A prototype shown to a client then hid the one thing your design team has to decide. The box is drawn for the picture only, in the page the engine is holding — nothing of your code is touched, and the words come from the need you already wrote.

The picture is taken on a fresh draw, before anything clicks the page: a control that leads somewhere takes the page with it, and a picture taken afterwards is of wherever it went.

### The flow is told to you, not asked for

A designer is building a journey, not a page. So every time a page is drawn, you are told what it did to the flow it belongs to — no command to remember:

```
🔗 IN THE FLOW  3 page(s), 4 link(s)
   approve → done, orders
   ends: done (nothing leads on: the end of a flow, or a page owed a way on or back)
```

A page that leads nowhere says so the moment you draw it:

```
   lonely leads nowhere
```

and a link to a page nobody has drawn is named as an error, where you are drawing.

A folder with one page in it says nothing at all: there is no flow to speak of yet, and a number there would be noise. `--prototype --flow` still gives you the whole picture when you want it; you no longer have to know it exists to find out a page is stranded.

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

### A page made elsewhere, rebuilt from the system

A page an AI tool or a person made with styles of its own is rebuilt from your components (`--prototype --from-page <page.html or link>`).

- **What each part is for comes from its markup, never its looks.** Its landmarks, roles, headings and controls, and the names the page gave its own parts: a class called `promo-card` is a card, whatever it is painted.
- **Each part becomes your component for that job**, with the page's words in it and an option its class already says, such as a primary button.
- **What the system lacks stays visible.** It becomes a Missing box or a marked stand-in and goes on the gaps list, never a part styled for the occasion.
- **Before and after, in numbers.** Values typed by hand, style rules, inline styles, classes and fonts of its own, against what the rebuild holds.
- **The page itself is never changed.** The rebuild is a starting point in `prototypes/`, checked and drawn like any prototype.

### A prototype as text

Any prototype can be drawn as plain text to paste into code review, a ticket or a thread (`--prototype <file> --text`).

- Every box is one of your components with its name, its words and its options.
- A part the check found wrong, or one the system lacks, carries a numbered mark, with a note under the drawing.
- It is drawn from the checked composition, so a name your system does not hold can never look like one of its parts.

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
### Handed over at a fixed point

What you hand over is a tag, and whoever receives it should get the same answer when they check it again. So a prototype says once what it is built on, and every check can be held to it.

- **Pin it before the first screen.** `rms-design-system-engine --prototype --pin` writes `design-system-pin.json` in the prototypes' own repository: the system's release (its tag, or `--system v2.3.0`), the intent layer's commit when it is a folder, and the commit the work starts from. Commit it with the prototypes. A second run keeps it, unless you name a new release.
- **Pinned to what the building team uses.** With no `--system`, the pin takes the release your products build with, read from each product's lockfile, its `package.json` or `products.uses` in `ds-config.json`, and matched to the system's own tag. When products use different releases, it asks you to name one.
- **Told when the pin falls behind.** A pin that a product has moved past is said on every check and every `--pin`. A release newer than the pinned one is said when the work starts (`--prototype --catalog`), with how many prototypes it would break, so moving is decided before a page is built on the old one.
- **Renamed, not missing.** An icon or a token the system renamed is said by its new name ("the system renamed this icon to `bag`"), read from the system's own history: an icon's file renamed, or a token's declaration moved to a new name with the same value. Nothing is guessed from the names.
- **Check it at its tag.** `--prototype prototypes/Orders.vue --at handoff/orders/v1` reads the page as the tag has it, not as the folder has it today.
- **Evidence or a draft.** The report opens by saying which. It is evidence only at a tag, with the system and the intent layer in front of it the ones pinned. Otherwise it says what is missing, such as "the system here is v2.2.0, the prototype pinned v2.3.0".
- **What it added.** Every dependency the project's `package.json` gained or moved since the work began, with its version, for the building team to accept or refuse.
- **Its demonstration code.** With your convention set, the check keeps the product's code apart from code that only simulates a service or stages the demonstration. A file named as demonstration code among the product's is a finding. A product file with demonstration branches lists the lines to take out.
- **The copy of the system it holds**, held to the release it pinned. See [A copy of the system inside a product](audit.md#a-copy-of-the-system-inside-a-product).
- **Which release it was held to.** The record kept beside each prototype (`<name>.check.json`) and its handoff page name the system's release and the commits read, so a pass opened months later never reads as a current one.
- **A handoff in versions.** A handoff made at a tag is kept beside the prototypes (`<name>.handoffs/`), and the next one opens on what changed since: components used, findings fixed or new, gaps, dependencies, the copy of the system, what people wrote. A draft is compared with the last version, never kept as one.
- **Each version as it was given.** At a tag, the whole page is kept as `<name>.handoffs/<tag>.md` and never rewritten. Checking the same tag again leaves it as it is and says so, so months later the team that built the feature reads exactly what it was given.
- **What only people can say.** The first handoff writes `<name>.handoff-notes.md` beside the prototype, once. From then on it is yours, and the engine never writes it again. It has six parts, each with an owner line (`Owner: not assigned · Date: —` until someone takes it):
  - **Off the happy path:** what each screen does when something fails, while it waits, when there is nothing to show, on a slow connection.
  - **Data that shows each state:** the accounts and records to open each of those with.
  - **Where each rule is decided:** in the screen, or in a service the screen only shows.
  - **Decided on purpose:** where it departs from the system or the designed screen, and why, so nobody puts it back.
  - **Open questions:** what is not decided yet, and who answers each.
  - **Before it ships:** what looks simple here and is not.

  The handoff page carries what you wrote, with who stands behind each part, and says which parts are still empty and which have no owner. The file travels with the prototype, so the next version starts from what this one said. Given at a tag, it is read as the tag holds it.
- **Before moving to another release.** `rms-design-system-engine --prototype --against v2.4.0` holds every prototype to that release, read from git into a folder of its own, and lists what it would break in each page and what it would fix. Nothing in the system's folder or the prototypes' is changed.

All of it goes on the handoff page (`--handoff`), written beside the prototypes, under Where it was checked, What the people who made it say, The copy of the system, Product and demonstration code and What it added to the project.

The convention is yours. With none set, nothing is said about demonstration code:

```json
"prototype": {
  "dir": "../acme-shop/prototypes",
  "demo": { "simulated": ["src/mocks"], "staging": ["src/demo"], "marker": "ACME_DEMO", "words": ["mock", "fixture"] }
}
```

### The shapes a flow comes in

Ask for a multi-step operation — sign in, a one-time code, a confirmation, a success page — and the engine used to check only that the pages linked. It knew nothing of the shapes, so a code step with no way to ask for another code passed, and so did a journey that quietly stopped halfway.

Four shapes are read from the pages themselves — their name, their title, the words on their parts — and each owes something:

| The page looks like | and owes |
|---|---|
| A sign-in step | a way out for somebody who cannot get in |
| A one-time code step | a way to ask for another code, and a way back to change where it was sent |
| A destructive step | a way out that is not the destructive one |
| A success page | a way on to whatever comes after it |

```
⚠️  "code" is a one-time code step and is missing a way to ask for another code:
    a person who needs it here has nowhere to go. Add it from the system, or say
    why this flow does not need it
```

**It also settles a question nothing else could answer.** `--prototype --flow` names the pages a journey ends on and has to leave it open — *"the end of a flow, or a page that needs a way on"*. A shape decides it:

```
⚠️  the journey ends on "code", which is a one-time code step and not an ending:
    the page after it was never drawn
```

A success page is an ending and is never asked what comes next. A page of no known shape leaves the question open rather than guessing.

Two things it will not do. **It never writes the missing part** — a shape is a reading, not an instruction, and the engine does not invent. And **it reads the pages, never the request**: what you asked for and what was drawn are the two things being compared, so taking the shape from the request would compare the request with itself.
### A judgement made again and again is a rule you never wrote down

Judging one prototype tells you about that prototype. The fourth time a model says the same thing about a different flow, it is not telling you about the flow any more — it is telling you your team has a rule nobody has written down.

So the four decisions are counted across prototypes, and once the same one has broken enough times it is proposed as a guideline:

```
📏 JUDGED THE SAME WAY AGAIN  1 rule(s) this keeps asking for:
   "Every control a person reaches for in a prototype leads somewhere or changes something: nothing is drawn and dead."
      — 3 time(s) across 3 prototypes; it would go in the intent layer, the System page, under Rules, as a draft
   Written down, it stops being judged again: the team decides each one, and a no is remembered.
```

This is the same loop a correction goes through — a lesson becomes the strongest guard that can hold it — with a model's judgement as the source instead of a person's correction.

Three things it is careful about:

- **A flow is one place, not one per page.** A flow of four pages judged broken once is one count. Counting it per page would say a single judgement was four mistakes, and a rule would fall due on the first prototype anyone judged.
- **Prototype judgements and screen judgements never mix.** A rule proposed from whole flows is counted apart from one proposed from the style guide's screens: they are judged on different things, and a proposal should never cite the other as its evidence.
- **It proposes, and remembers a no.** The rule is drafted for your team to accept or turn down. Turned down, it is not asked again until the evidence has grown.

A decision that holds is never counted. Only the four fixed decisions are, because a rule is only worth proposing where the answer should be the same every time.

### Which shell your request starts from

A prototype starts from a shell — the whole-page layout everything else is laid inside — and which one it starts from is the decision every other decision sits under.

The engine ranks them by counting the words your request and a shell's description share. That works only where you happen to use your documentation's own vocabulary. Ask for a page to **browse orders** when the shell is documented for **inquiry and list** screens and the count is zero for every shell, so the order falls back to the alphabet and the catalog says the honest thing a count can say: *these are the shells, and that choice is yours.*

Which shell a request starts from is judgement, so a model can be asked:

```bash
rms-design-system-engine --prototype --catalog --judge-shell --for "a page to browse orders"
```

```
🧭 WHICH SHELL  ConsultPage · $0.01
   ConsultPage — the request is a list a person looks something up in, which is what inquiry means here
   could also: DetailPage — a row could open as one record shown in full
   Advisory: a model read the documentation, not a person. The counted order above stands on its own.
```

Three things it is held to, and they are why this is worth more than asking a model in a chat window:

- **It chooses only from your shells.** A name that is not one of them is dropped and named, never quietly swapped for the nearest. The engine's promise to a prototype is that nothing else exists, and a shell invented here would be the one place that promise broke.
- **It says where its reason came from.** Each reason is read back against that shell's own description. One that rests on nothing your documentation says is still shown, marked *(not from the documentation: the model read the name)* — so you can see which reasons came from your system and which from the model's idea of what a name means.
- **It can answer that none of them fits.** A ranking that always produces a winner cannot tell you your system is missing a shell. This one says so, and says it is worth telling the design team.

A system with one shell is not asked at all: there is nothing to choose between.

Advisory, never a failure, and never asked unless you ask — it spends your model tokens, and the counted order is a whole answer without it. Kept by your request's and your shells' hashes, so the same question is never paid for twice.

### Did what you asked for come out whole

Everything else the engine checks about a prototype is structure — the components are the system's, the pages link, a shape owes what it owes, the page still owes a route. **All of it can hold while the thing is useless.** You asked for a way to approve an order, got a page where the approve button leads nowhere, and every check passes because nothing it measures is wrong.

Whether a request came out whole is judgement, so a model is asked:

```bash
rms-design-system-engine --prototype --judge --for "a way to approve an order"
```

```
⚖️  THE REQUEST, JUDGED  2 of 4 decision(s) break · $0.08:
   ❌ Nothing drawn but dead: Approve on orders leads nowhere
      check: click Approve and see that nothing follows
   ⚠️  Fit to put in front of someone: the flow ends on the orders page
      check: there is no confirmation after approving
```

Four decisions, fixed and named — a judgement nobody can repeat is an opinion:

| | |
|---|---|
| **It does what was asked** | the flow carries out the thing the request describes, end to end |
| **Nothing drawn but dead** | every control a person reaches for leads somewhere or changes something |
| **What is missing is shown as missing** | a gap, not something faked to look finished |
| **Fit to put in front of someone** | usable in a user test with nothing explained away |
| **Nothing nobody asked for** | every part is there because you asked for it, or because your documentation says a page of this kind has it |

**The last one is the one that saves you taking things out by hand.** An agent adds a default nobody asked for — a shadow on every card, an extra confirmation step, a search box on a page that lists four things — and you notice it in review, take it out, and get it again in the next prototype. Judged, it is named with what was added and where; judged the same way three times, it becomes a constraint your team can accept, and then it stops.

It is judged against **your documentation**, not against what a model supposes a page needs: the shells your system documents are given with the question, so a component your system requires is never read as something added on top. A system that documents no shell is given none — nothing is invented to fill the gap.

**It will not judge the pages against themselves.** With no `--for`, it refuses rather than marking its own work — what was asked and what was drawn are the two things being compared.

Advisory, never a failure. Asked only when you ask, because it spends your model tokens. Kept by the pictures' hashes and the request's, so a flow that has not changed is never paid for twice. And every finding carries a **check** — one sentence you can verify on the pages yourself, so the model's word is never the last one.

### Did what you asked for come out whole

Everything else the engine checks about a prototype is structure — the components are the system's, the pages link, a shape owes what it owes, the page still owes a route. **All of it can hold while the thing is useless.** You asked for a way to approve an order, got a page where the approve button leads nowhere, and every check passes because nothing it measures is wrong.

Whether a request came out whole is judgement, so a model is asked:

```bash
rms-design-system-engine --prototype --judge --for "a way to approve an order"
```

```
⚖️  THE REQUEST, JUDGED  2 of 4 decision(s) break · $0.08:
   ❌ Nothing drawn but dead: Approve on orders leads nowhere
      check: click Approve and see that nothing follows
   ⚠️  Fit to put in front of someone: the flow ends on the orders page
      check: there is no confirmation after approving
```

Four decisions, fixed and named — a judgement nobody can repeat is an opinion:

| | |
|---|---|
| **It does what was asked** | the flow carries out the thing the request describes, end to end |
| **Nothing drawn but dead** | every control a person reaches for leads somewhere or changes something |
| **What is missing is shown as missing** | a gap, not something faked to look finished |
| **Fit to put in front of someone** | usable in a user test with nothing explained away |

**It will not judge the pages against themselves.** With no `--for`, it refuses rather than marking its own work — what was asked and what was drawn are the two things being compared.

Advisory, never a failure. Asked only when you ask, because it spends your model tokens. Kept by the pictures' hashes and the request's, so a flow that has not changed is never paid for twice. And every finding carries a **check** — one sentence you can verify on the pages yourself, so the model's word is never the last one.

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

### A part you build by hand again and again

Every prototype keeps what your system had nothing for, in `.design-system-engine-out/prototypes/gaps.json`. One prototype's gap is its own business. The same part built by hand in four prototypes is your system asking for a component.

It could not tell you that, because needs were counted on their exact words — and you write the need in your own words every time. "A top bar", "the bar at the top", "top bars": three needs, each seen once, and the thing worth knowing stayed invisible however many prototypes built it.

Now the needs are gathered by what they say:

```
🧱 BUILT BY HAND AGAIN  2 part(s) the system had nothing for in more than one prototype:
   a top bar — built by hand in 3 prototypes: Orders, Settings, Billing; closest in the system: pageHeader
      also written as: the bar at the top
   empty states — built by hand in 3 prototypes: Orders, Profile, Billing
      also written as: an empty state
   Each is the design team's to decide: a component of its own, an option on one that exists, or left as it is.
```

You are told this wherever you are already being shown what your system lacks: after a prototype is drawn, under **--flow** when you look at the whole journey, and in the report that turns Figma screens into starting points. The same lines are in `gaps.json` under `repeated`, so you can read it without running anything.

**It builds nothing.** It does not create a component, name one, or write anything into your system — it counts, and hands you the count. Whether your system grows a component is yours to decide, as everything on that list already is.

**A rewording, never a renaming.** "A top bar" and "the bar at the top" are gathered: the words about the part are the same two. "A top bar" and "page header bar" are not, because *header* and *page* are things one says of the part and the other does not. Reading those as one would take a guess, and a wrong guess tells you a part repeats when it does not — the one mistake this must not make. Every wording gathered is shown under **also written as**, so you can see what was grouped and say it was grouped wrongly.

Two prototypes is the least that counts as again: one is the prototype that needed it, and that gap is already on your list.

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

Answer with `--lesson-answer <id> yes` or `no`. `--rule "<sentence>"` gives a step or a rule in your own words. Only your answer writes anything: the hooks ask you first.

- Each proposal shows what it rests on: the screens, files or edits it was seen in, and when.
- It also shows where a yes would write it: a check, a step in the agent rules, or a rule for your guidelines.
- A proposal with no recorded cases can't be approved yet. The engine says what is missing.
- When you say no, you can also say what would change your mind with `--would-accept more`, `new` or `narrower`: more cases, a new kind of case, or a narrower wording (given with `--rule`).
- The proposal then waits until that is there, and comes back telling you what changed since your no.
- A no with nothing added is final, and the same proposal is not made again.

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

## Turn Figma into code

A system that exists only in Figma, built in code piece by piece, each piece checked against Figma once it exists.

### What it does with no code yet

- **Says what to build, in order.** Your tokens first, then each component after the ones it holds. Something still to build is never a failure.
- **Gives the exact lines.** Each component's build sheet names its class, its sizes and variables, the selector of each state and option, its role and its props, as the checks will read them.
- **Writes the starting files, when you ask.** Each component as a file and a stylesheet of its own, written from those exact lines, and handed back as a patch for you to apply.

### What a starting file holds

- **Its element and its props.** A button is a real `<button>`, and its props are named as Figma names them.
- **Every rule of its build sheet.** Its sizes, spacing and colours as your variables, a class for each option that changes its look, and its own height where an option changes it.
- **What is still yours.** What Figma does not say exactly, such as what a state is wired to or a focus ring the design does not draw, is listed at the top of the file, never made up.

- **The shadcn/ui way, in a shadcn/ui project.** Each component is a `.tsx` in the ui folder `components.json` names, its options a `cva` call, joined with `cn()` from your utils alias, its root named by `data-slot`, and `asChild` through Radix's `Slot` when your project has it. A state Figma draws on the element (Disabled) is Tailwind's prefix for it (`disabled:`), and each value is written as the utility that reads its variable (`px-(--space-m)`), never as a value in brackets.

### What it never does

- **Write into your code.** The files come back as a patch, and a file you already have is left out.
- **Choose for you.** What your components are written in, and where they go, come from your project or are asked.

The full options are in [the reference](../reference/usage.md) (*Build mode*, `--scaffold`).

## Turn code into Figma

A component that exists only in your code, drawn into Figma from what the engine reads of it.

### What it reads

- **Its props.** Each prop with options becomes a variant axis with the same options.
- **Its parts.** Each part becomes a layer, in the order your markup writes them: another of your components becomes an instance of it, a part that writes a prop's words becomes a text layer, anything else a frame.
- **What each prop drives.** A part a prop shows or hides becomes a boolean property on that layer, and a prop whose words a part writes becomes a text property.
- **Its look.** Its own base rule's background, padding, gap, border and corners, each bound to the variable it is written with. A hover's or an option's value belongs to that variant, so it is not the component's own.
- **What it is for.** Its own comment becomes its description in Figma.

### What it never does

- **Make up a value.** A size written by hand, a part's text with no text style of your system's, or a nested component Figma doesn't have is a question for you, never a guess.
- **Write without you.** It goes through the same path as a component described in words: the spec is checked against your system, held for someone to sign it off, and built in Figma only through the script you say yes to.

### A template or a pattern too

Give it a file instead of a component name, and it draws that page as a Figma frame made of your components.

- **Its layout.** Each element that holds others becomes a frame, laid out in the direction its own style sets.
- **Your components.** Each one the page uses becomes an instance of it, found through what the file itself imports.
- **Its texts.** Each one is set in the text style its class uses.
- **Its spacing.** Each gap, padding, background and corner is bound to the variable it is written with.
- **A frame, not a component.** It takes no variants. A component the page uses that Figma doesn't have is a question.

The full options are in [the reference](../reference/usage.md) (`--spec-from-code`).

## Build from your documentation

Your whole library built from your written docs alone, in Figma and in code, the same every time. It is not available yet: what it will do is on the [features page](features.md#build-from-your-documentation).

## Generate in Figma from a prompt

You describe what you need, and the engine draws it in Figma from your system's own rules.

### Not only components

- **A component.** Started from the one it is most like ("a tag like the chip").
- **A pattern, a template or a page.** A frame made of your components, started from your own one it is like ("a template like settings").
- **A flow.** Its pages side by side, each made the way your system makes it.
- **A foundation.** A new variable beside the one it is like, pointing at one of your variables.

The kinds are your intent layer's own, so nothing new is invented to say what a thing is.

### Your rules for each kind

- **Read from your own.** What every one of your templates holds is a rule, and what most hold is a fix, the way the engine reads how you build components.
- **Asked, never assumed.** A new one that lacks what every one of yours holds is a question for you.
- **A box that is too small.** A layer that runs beyond a box of a fixed size is said, for you to decide: grow the box, or shorten the layer.
- **Asked, not built literally.** A bigger size copied from a smaller one is asked what it changes, a setting for a part the component lacks is asked which part, and a copy that changes nothing is asked what makes it different, where your rules allow no twins.

### Measured every time

- **A kept set of requests.** The same build and change requests run again whenever the builder or its guide changes, some in the builder's words and some in a person's own.
- **Separate counts, never one number.** Whether the script runs, whether what was asked is there, whether anything else changed, whether only your components and variables are used, and whether it made a layout fault.
- **Whether it makes sense.** A setting named for a part shows that part, and a bigger size is bigger, not only there.
- **Your rules.** Each result is held to how your system builds components, and it can run on your own library, its results kept on your computer.
- **Checked by a person, in Figma.** A sample is built in a Figma file, before and after, for someone to say whether the counts hold.

The full options are in [the reference](../reference/usage.md) (`--spec`).

## Generate in code from a prompt

The same spec Figma is built from, written as a component file the way your own components are.

### What it follows

- **Your construction rules.** Your framework, the folder and file name, how parts and options are named, and how props are written, all read from your own code.
- **Your tokens.** Each value is the custom property your naming convention gives the variable.
- **Your text styles.** Each text is set the way your components set it, with your mixin or your class.
- **Your components.** A part that is another of your components is written as its own tag.

### What it never does

- **Change your code.** The file comes back as a patch for you to apply, never written straight into your project.
- **Skip the check.** What it wrote is read back with the code's own reader and held against the spec, so the two start out matching.

The full options are in [the reference](../reference/usage.md) (`--code-build`).

