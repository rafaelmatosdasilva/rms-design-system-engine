# Audit

How the engine checks your Figma library, lints your code and compares Figma with the code. What each part promises, and what to ask for it, is on the [features page](features.md#audit). All pages: [technical documentation](README.md).

**On this page**

- [Check your Figma library](#check-your-figma-library-rules)
- [Lint your codebase](#lint-your-codebase-rules)
- [Compare Figma and code](#measure-figma-code-parity)
- [What a check actually is](#what-a-check-actually-is)

## Check your Figma library rules

These read the Figma file for whoever keeps it, and never fail a run.

| Check | What it finds | How to turn it off |
|---|---|---|
| The Figma file itself | Values with no token, detached instances, missing auto layout or descriptions | `"figmaHygiene": false` |

### The Figma file itself

For whoever keeps the Figma file, it lists a colour, radius, padding, gap or text with no token or style, an instance detached from its component, an empty frame that draws nothing (a spacer is the auto layout's gap), a variant with no auto layout, a variant option named by its look (`Color=Blue` where a role belongs), a spacing or size token off the grid the library keeps (8px or 4px, mined from its own values), a mode spelled two ways across collections, a status colour family missing where the others are there, a component with no description, an instance whose layer spells its component's name another way, a property bound to a token meant for other properties, and tokens left on all scopes. Only what is drawn counts: the shapes a boolean operation merges are painted with the operation's own fill, a layer hidden with no property to show it is never seen, a mask's own colour never shows, and padding does nothing outside auto layout, so their values are left out.

Code can only match what Figma states, so the summary says first when the file is not reliable enough to compare.

- Under 90% of its values bound to a token or style, or of its variants in auto layout, it is only partly reliable.
- Under 60%, a match or a difference can be chance, and the least reliable components are named.

### How your system builds a component in Figma

Every run reads your components and writes down how they are built: how components, properties and variant options are named, whether layers have names of their own (every layer of every variant, `Frame 12` or a `Union` left as Figma named it, or a text layer Figma names after its words), auto layout everywhere (a variant's own frame, and each row of words or controls inside it placed by hand, such as a divider and its label set side by side; a chart, a map or an image's overlay is drawn freely on purpose and left out), whether a component binds its own variables or the shared ones, a description on each. Nothing is a rule until every component follows it: each line is a rule, to fix (most follow it, or your team decided it) or to decide. It reads how each component is built inside too: every variant's layers, auto layout, what each property drives, styles, nesting and slots, and the shape each family (the buttons, the cards) is built in. The style guide's Rules page lists them; each fix copies into Claude Code, and renames are made in Figma for you ([how to ask](features.md#check-your-figma-library-rules)).

Two more things it reads of every layer, which make a rule about *which* token possible rather than only about whether there is one:

- **What each variant binds, layer by layer.** For every variant, each of its layers and the variable each field of that layer binds. A component can bind a variable everywhere and still bind the wrong one; until now the component was read as a whole, so nothing could say that a disabled button takes the default's text colour.
- **How each text layer grows and truncates.** What it resizes on, whether it ends in an ellipsis, and after how many lines. A label that truncates at one line and one that grows are different things to build.

From what each variant binds come three rules about the token itself. Like every rule here, each is what most of your components already do:

- **A state binds its own token.** A disabled button that keeps the default's text colour is flagged, but only when your system has a disabled colour for it to use.
- **A component uses its own tokens and the shared ones.** A chip that binds a button's token is flagged.
- **A text layer uses a text colour.** A label bound to a background or surface colour is flagged. `on-surface` counts as a text colour.

How your tokens are named is read from the names themselves, the way most of them are written:

- **One case.** A name part written another way, such as `text-color` where the rest is camelCase.
- **One word for one idea.** `pressed` where the system says `press`, or `bg` beside `background`.
- **One scale for sizes.** `medium` where every other size is `m`.
- **Sizes in order.** A set where `m` is larger than `l`.
- **The usual states.** An interactive role missing the hover or press most roles have. A selected and an unselected colour don't need a hover, so they're left out.
- **Parts in their usual place.** A state placed earlier in a name than most names place it, `color` at the start of a name where most names end with it, `hover/background` where most names say `background/hover`, or `negative/text` where most say `text/negative`.
- **Values on your scale.** A spacing of 18 where every other spacing and radius is a step of 4. Hairlines (1 or 2px) and pill radii are left out.
- **Something to sit on a surface.** A role with a background colour and no text or icon colour beside it.

How your tokens are layered is read from the tokens themselves, so you never have to declare it:

- **The layers come from the aliases.** A group of tokens that point at nothing is a base; one that mostly points at another sits on it. Layers can be collections of their own (Primitives, Semantic) or groups of names inside one collection (`primitives/…`, `semantic/…`).
- **A token that skips its layer is flagged.** For example, a component token pointing straight at a primitive where the rest go through a semantic token.
- **So is a long or circular alias chain.** Longer than most of your system's, or one that comes back on itself.
- **And a token named like another collection's.** For example, `primitives/…` sitting in Semantic.
- **Nothing is imposed.** A group of tokens that points in every direction has no clear layer, so it gets no rule.

With the layers known, four more checks on what components bind:

- **No base token on a component.** A primitive bound directly, where the rest of your system binds a semantic or component token.
- **A family rounds its corners alike.** One button on a different radius token from the others of its size.
- **A shared token is shared.** A token in a shared layer that only one component uses belongs to that component.
- **A component's own token is used.** One that nothing binds and no token points at is left over.

### Components of one type, built the same way

The components of one type in Figma (every button, every input) are compared with each other, not only with the code.

- **States set the same way.** Disabled is a property of its own on most buttons and an option of State on a few: those few are named, with the way most of them do it.
- **One thing, one name.** `labelContent` on most buttons and `Label` on one: that one is named.
- **What most of them have.** Most inputs have a label and a required mark: one without them is listed to check.
- **Every combination built.** A variant missing from a component's grid of options, such as no `Size=m, State=press`.
- **The same options and default.** `buttonPrimary` takes sizes `l, m, s` where the other buttons take `m, s`, or starts on another size. A state axis is each component's own, so it's left out of this one.
- **The same order and sizing.** Properties listed in another order, or a frame that fills where the family hugs.
- **The same states.** A button without the press state the other buttons have.
- **Text that fits the same way.** A label that truncates where the family's grow.
- **Aligned, filled and padded alike.** Among the members of a family built from the same parts: a card centred where the others start at the top, a title that fills where the others let the body fill, padding on `space/l` where the others use `space/m` at the same size, a minimum height the others don't set, 10px of padding at size m where the others have 8px, an icon shown by a variant where the others use a yes/no property, a Size property that also changes the label's text style when on the others it changes only the padding, or a card whose fill uses a shared token when the others use a card token.

More readings of the library:

- **Annotated like its family.** A tab with no Accessibility annotation when almost every other tab has one.
- **Nested properties within reach.** A badge inside a card whose own properties don't show in the card's properties panel, when most nested components show theirs. An agent can only set what the panel shows.
- **A property says what it drives.** The properties panel is all an agent sees of a component, so `showExtra` driving a layer called Dot is flagged.
- **Components no product uses.** One your code builds that no product's code uses, read from the contracts' catalog. Your style guide's own pages don't count as a product.
- **Components nothing uses.** One that isn't placed on any page of your file and that no other component holds. It's for someone to check, never removed.
- **A component that repeats an option.** `buttonLarge` beside a `button` whose Size already takes `large`.
- **Two components that do one job.** Built the same and given the same properties, like `badgeInfo` and `badgeNote`. It's a pair to look at; the engine never merges them.
- **One name for one part.** The icon is called `Icon` in most components and `Glyph` in one.
- **Parts in the usual order.** One button with its label before its icon, where the other buttons put the icon first. It is checked inside a family only, so a trailing icon elsewhere is not flagged.
- **The icon that goes with a label.** An `xs` icon beside an `s/strong` label, where almost every `s/strong` label in your library has an `m` icon.
- **What a family holds.** A button holding an avatar when no other button does. It's flagged for someone to check, since some nestings are legitimate.
- **Corners, opacity and borders on variables.** A frame with two corners on another radius variable, an opacity of 40% typed in, or a border weight typed in, when most of your library uses variables for these.
- **Borders on the same side.** A border outside its layer when most borders sit inside.
- **Text styles that explain themselves.** A text style with no description when most have one, and a text style no component uses.
- **Text styles used as they say.** A description that names *Chip Labels* as an example, when no chip sets a text in that style. Only the components a description names are read, never what a layer happens to be called.
- **Swaps and slots say what goes in them.** A slot or swap property that lists no preferred components, when most do.
- **Defaults your examples use.** A button that starts disabled when every example in your file shows it enabled. Uses inside other components' examples count too.
- **Words in one case.** Tabs labelled in Title Case when most components' examples are in Sentence case.
- **What a use must fill in.** A text property every example replaces, which starts on words that read as real (`42%`) rather than a placeholder (`Label`), so a use left on it looks finished. Agents also get the list of text properties a use must set.
- **Room for long words.** A label that grows on one line with nothing to stop it, when its examples run past four words. Ending in an ellipsis or a maximum width gives it room.
- **Icon-only uses keep their name.** An icon-only button whose hidden label is left on `Label`. Those words are what a screen reader calls it.
- **Shadows change one way.** A card whose hover shows a separate shadow layer, when most cards change their own effect.
- **One size scale.** At size `s`, a component 32px tall when most are 40px, or one holding an `xl` icon at size `m` where most hold an `m` icon. With the scale written down, a new size can be built from it instead of copied.
- **Hover shown one way.** A button that shows its hover with an overlay layer when most change their own fill.
- **A slot or a swap, consistently.** An `Icon` property that is a slot in one component and an instance swap in most.
- **The gap between two parts.** An icon and a label spaced by `space/m` in one chip and by `space/xs` in most, at the same size.
- **Your declared tiers.** If `ds-config.json` declares `tiers`, a token pointing where its tier may not now shows on the Rules page, not only in the audit summary.

Each is a decision for your team in Figma, and keeping it as it is, as a known exception, is always an option.

### One Rules page for Figma and the code

How your system is built, on both sides, is one page in the style guide's menu, called Rules. It is the clean base an AI builds on: what is broken there gets copied into everything built next.

- **How far along each side is.** Above the filters, a card for Figma and one for the code, the Status page's own cards:
  - A ring of every rule in the colour of its state: done, to decide, to fix. In its middle, the share done.
  - Beside it, a bar per area in the same colours, the weakest area first, so an area with nothing done still shows what is under way.
- **One table, a row per rule.** Each row says its side (Figma or Code), how many follow it, and who owns it: Design, Engineering, or both. A rule nothing breaks says so.
- **Sort it your way.** Every column head sorts by it, and again for the other way round.
- **Filter by any column.** A chip for each status, with its colour, so what is to fix is one click away; beside them a list for Source and one for Area. Each says how many rules your other choices would leave, they combine, and Clear filters drops them.
- **Checks that wait on Figma are named.** A new check that reads something your last Figma capture doesn't have yet finds nothing until Figma is read again. Rather than look like a clean library, the page says how many checks wait and what they read, with the request to refresh Figma ready to copy ([how to ask](features.md#set-up)). The summary of the rules says it too.
- **One card for the decision.** A row opens in the side panel: what the engine suggests, every component or place it would change, and the approval under it, in one card to read top to bottom.
- **Each change said once.** The components on the left, linked, and the changes they take on the right, one a line. Components that take the same changes share one entry. Labelled values, never a table or a box drawn like one.
- **Checked where it lives.** Each component a Figma rule changes opens in your Figma file, at its own node, marked with Figma's icon. A rule about the code links to the component's page instead.
- **In Figma.** The rules above, what the file check finds (values with no token or style, detached instances, layers named unlike their component, variables used outside their scope), components of one type compared, and your tokens: named by role, described, layered where their value changes, and what each brand overrides.
- **In the code.** What [Lint your codebase](#lint-your-codebase-rules) finds: values written by hand, aliases to deleted tokens, invented variables, hand-built components and near copies in your products.
- **The code is never changed for you.** A code fix is handed back as a patch to apply.

To keep it out of the menu, set `styleguide.construction` to `"unlisted"` ([all options](../reference/config.md)).

## Lint your codebase rules

Two kinds of finding, one for each part of your code: the system's own tokens and themes, and the apps that use them.

What it finds is shown as rules too. Each check's findings become rows on the style guide's Construction page, beside Figma's, so both sides of how your system is built read as one list.

### In your tokens and themes

Advice on keeping the system healthy as it grows, never a failure.

| Check | What it finds | How to turn it off |
|---|---|---|
| System health | Risks as the system grows, such as tokens named after a product | `"systemHealth": false` |
| Mode combinations | What breaks only in a combination of modes, such as Dark on a phone | `modeCombinations: false` |

#### System health

Advice on keeping the system healthy as it grows (`🧭 System health`), never a failure.

- A colour mode set below a product's root, so part of the page draws in another mode.
- A product that brings in two of the system's themes, one overriding the other by load order.
- Semantic tokens with no description in Figma. What a token is for is what an agent reads to pick it.
- A Storybook preview stylesheet that styles a component, so the catalogue shows it right while products draw it as the code does.
- Two components whose own rules are nearly the same.
- Tokens named by look (`blue-500`) rather than role, or after a product or brand (`harborNotes/accent`).
- Aliases to a removed token, with the commit that removed it.
- The token budget, the same colour written by hand in two tokens instead of one primitive, and tokens only one component uses.
- A class a product styles almost as one of the system's components, as a decision, never a drift.

A component only the code has is written to `handback/figma-to-build.md` with its props and tokens, to build it in Figma.

#### A token in the right layer

A token belongs in the first layer where its value can change. A collection with modes (Light and Dark, a brand) is where values change with them; a token in it defined the same way in every mode (the same alias or value) never uses them, and can live in a layer without modes that aliases this one, following every mode through it. The audit says how many of a moded collection's tokens are like that, by family. Advice only: Figma's collections are your team's design.

#### Mode combinations

The gates check each mode on its own. When you have two collections that switch (Light and Dark, Desktop and Phone), every combination is also opened in the browser, such as Dark on a phone or Light on a desktop.

- Each token is compared with Figma's value in that combination.
- Each text and background pair the system uses is measured for contrast.

Only what is wrong together and right in each mode alone is listed, with the combination. A phone rule that sets a colour, so Dark on a phone keeps Light's, is a typical case. These show on the style guide's Status page, under The system.

The collections that switch (a colour mode by media, class or attribute, a sizing mode by breakpoint) are combined, up to 64 combinations (`🎛`). Each is set at once on a page holding only the theme, and every root token is read. A token that differs from Figma's value only in that combination is listed with the combination (`Dark with Phone`), and so is a text and background pair that falls below its WCAG ratio only there. They go to the Status page under The system.

#### Who owns what

`owners` in `ds-config.json` names the team that owns each component, token layer or token prefix: `{ "primitives/": "Brand team", "semantic/": "Design system team", "tileCard": "Cards team", "*": "Product teams" }`. The Status page then says the team after who acts ("You in Figma · Brand team"), the longest key that fits first: a component's own name, else a token prefix the task names, else `*`.

- A key can be a pattern: `"tile*"` covers every tile, `"patterns/"` every pattern page.
- The owner is also who decides what waits on a person about it: a proposal, a page's drafts, a page to review again, a change held for sign-off.
- When the person who decides is not the team's name, give both: `"tileCard": { "team": "Cards team", "decides": "QA lead" }`.

See [Who decides](documentation.md#who-decides) for what the Documentation page does with it.

#### Brands that pin what they inherit

For a system with brands (Figma's extended collections), System health lists each value a brand sets exactly as it inherits it from the brand it extends. It changes nothing today, and pins the value: the brand no longer follows when its parent changes it. Keep each the brand must hold and remove the rest. A brand may set any variable, a component's own and ones nothing reads yet included; that is never listed. Advice, never a failure.

### In your apps' code

These run beside the gates. Most give advice and never fail a run, and each can be turned off in `ds-config.json`.

| Check | What it finds | How to turn it off |
|---|---|---|
| Instructions for AI agents | Wrong names in `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, Cursor and Copilot rules | `"steering": false` |
| Primitives written by hand | A `<span>` styled as your Text component, a flex `<div>` with the system's gap | Runs only when `primitives` is set |
| Workarounds | A control laid over a component, a sign of a missing slot or prop | `"workarounds": false` |
| Tailwind | Classes that differ from Figma, and values in brackets outside the theme | `"tailwind": false` |
| Values written by hand | Every value a token should carry, with the token to use | `"census": false` (a run fails when a file's count grows) |
| A commit warns, a push refuses | What a commit or a push uses that has a finding | `--remove-hooks`, or `"hooks": false` |

#### Near copies of a component

A product that builds a component by hand, or styles a class almost like one of yours, comes back to you as a decision. Use the component, with a new option if it needs one, or add the new one to the system on purpose.

#### Local or shared

Every gap the engine finds and every change an agent proposes is sorted into one of two kinds, with the reason in one line.

- **Local.** It stays in one product: its own screen, its own CSS, its version, its pages. Its team acts, and it waits on no one.
- **Shared.** It changes what other products get: a shared component's options or props, a token, a contract, a component in Figma. It waits on the person who decides for it, from `owners` in `ds-config.json` ([Who owns what](#who-owns-what)).

How it is judged:

| What | How |
|---|---|
| Where it lives | The system (its theme, its components and their contracts, its Figma file) or one product. One the engine cannot place counts as shared until someone says. |
| Effect on other products | How many products' code uses the component, from the usage map. |
| How hard it is to undo | A removal, a rename or a breaking change is hard. A changed value is less so. An addition is easy. |
| Ambiguity | A decision between Figma and the code, or a place the engine could not tell. |

The last three set its risk (high, medium or low), which the reason says. For example: "Shared: cardTile's size=xs is the system's: 3 products use it (Northwind, Acme shop, Acme admin); hard to undo, high risk."

Where you see it:

- **The style guide's Status page.** Each task says Local or Shared beside who acts, and the reason when you open it. A task whose files are all one product's is that product's.
  - A component only one side has is counted too. Only in Figma, not built yet: shared, the system's to build. Only in one product's code (the usage map): local, that product's own.
- **The intent layer's proposals.** Each Fix, Add, Move and review says which, with its reason, on the Documentation page and in `--intent-decide`. One about a component's page (or a template's, a pattern's, a foundation's) is shared. One about a product's flow or page is local.
- **The issues the engine opens.** Each issue's body has one line: "Shared: waits on Cards lead — the reason" or "Local: the product team's own — the reason". A difference in a product's own files is local: a control its screen builds by hand, or anything else whose files are all that product's (the same reading as the usage map). Any other difference is the system's. The list of open issues by the fix each needs counts them too.
- **The edit check.** After an AI edit, its message ends with whether the file is the product's own or the system's, and on whom a shared one waits.
- **A change held for sign-off.** The guard says why it is shared and who decides it.
- **A change in Figma.** `--figma-change` prints it, and the Changes in Figma page shows it.

#### Instructions for AI agents

`AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, Cursor and Copilot rules and skills are found on their own. Every component, prop value and token they name must exist, with each prop written the way the code writes it (`Tone=` where the code has `tone` is flagged). A wrong name there makes every agent that reads it build the wrong thing.

A file that only says what not to use is noted too. Saying that the design system is installed and its components are the ones to use is what moves agents onto it.

#### Primitives written by hand

Once the library owner declares which styling means which component (`primitives` in `ds-config.json`), the engine spots it written by hand. A `<span>` given the body text style and the secondary colour is `<Text size="medium" color="secondary">`, and a flex `<div>` with the system's gap is its `Stack`. No token check sees these, since their values are the system's own. The audit lists each one, the edit check hands it back when an AI adds one, and `llms.txt` gives generators the table.

#### The names your agents actually invent

The catalog rejects names by meaning: a system whose values are `error` and `warn` tells an agent that `danger` means `error`. That catches what a reasonable agent would guess.

It does not catch what *your* agents guessed. `--check-ui` already knows them — every time it says `"Pill" is not in the catalog (did you mean Chip?)`, an agent invented a name and the check knew the right one. Those are now kept (`.design-system-engine-out/invented.json`, local and cumulative) and fed back into the catalog, so the next agent reads them beside the real values instead of finding out after writing the page. A name invented once will be invented again, by the same model reading the same documentation.

Only inventions the check could correct go into the catalog: an entry that cannot say what to write instead would send an agent nowhere. The rest are still counted, because knowing a name gets invented is worth something on its own.

The same names are written into each component's contract (`invented`, with the right name and how often) and beside the component in `llms.txt` ("agents here wrote: prop showFooters → showFooter"), so an agent reads them whichever file it opens. They come from both checks, `--check-ui` and the check of pages written as code, props, values and events alike.

#### Workarounds around a component

A screen that lays its own control over a component (a clear button over a text field, actions over a list row) is doing what the component cannot. It is reported to the design system as a missing slot or prop, not as the screen's mistake.

**Once is an oddity; three times is a gap.** When the same thing is built by hand around the same component in more than one file, the run says so separately: that is a piece the design system does not have, and documentation does not fix it — the component does. Prototypes count alongside product screens, because an agent drawing a page meets what a component lacks before any product does. The list is also written to `.design-system-engine-out/missing-apis.json`, for whoever owns the component.

#### Tailwind

- Each component's own classes are compared with what Figma states for it (`h-9` against a 36px height, `px-3 py-2` against its padding tokens), and a difference names the class to write. What is compared:
  - height, padding, corner, gap, and the fill, text and border colours;
  - text size, weight and line height, and border width;
  - shadow, from Figma's effects, and motion: a hover that Figma animates needs `transition` with its duration and easing.
- **Each variant on its own.** The classes each option writes are read (`cva` and `tailwind-variants`, a map of option to classes, a conditional on the prop), so Figma's Large is compared with the Large classes, not with every class in the file.
- **Each state.** `hover:`, `active:`, `focus-visible:`, `disabled:` and `aria-`/`data-` classes are compared with the colour Figma binds in that state. A state Figma draws differently with no class for it is named, with the class to add.
- **Each mode.** In dark mode (or a brand), each colour is checked as the theme's override block or a `dark:` class draws it, against the value Figma gives that variable in the mode.
- **Tailwind v3 too.** A `tailwind.config` theme (and its `extend`) is read as text, never run, so its colours, spacing, corners, type, shadows and durations name the utility to write, as a v4 `@theme` does.
- A class with a value in brackets (`rounded-[4px]`, `bg-[#b42318]`) steps outside the theme. When your `@theme` has the same value, it names the utility to write. Otherwise it says the value is not in the design system.
- `--init` sees a Tailwind theme and sets `"namingConvention": { "preset": "tailwind" }`. Figma's token names are then matched to the theme's own (`surface/base/color` to `--color-surface-base`), and a theme variable used through its utility counts as used.

#### Values written by hand

The census (`🧮`) counts each colour, spacing, radius, font size, duration, layer and shadow a token should carry, with the token to use when one has that value, the files that guess most first. `rms-design-system-engine --census` lists each one and keeps the count, so it only falls. A file with more than before fails the run.

#### A commit warns, a push refuses

`--install-hooks` (and `--init`) also adds git hooks to the project. Two check what your change uses: `pre-commit` and `pre-push`. Three build your local style guide again after a change: `post-commit`, `post-merge` and `post-rewrite` ([Built again after each commit](collaboration.md#see-a-change-in-seconds)).

- **A commit warns.** It lists what the commit adds that has a finding, and always goes ahead.
- **A push refuses.** While one of those findings is left, the push stops with the list. Fix them and push again.
- **Only what the change uses.** The lines the commit or push adds, read against what they replace. The rest of the system's differences never stop either one.
- **What counts.** What the edit check finds on those lines: a value written by hand, a token declared nowhere, a prop a component does not take. And a difference the last full audit found in a component or token those lines use.
- **What never counts.** A difference you accepted as debt, one you keep on purpose, or one that is Figma's work alone.
- **A finding marked wrong** (`--wrong`) is shown, but never stops a push.
- **Nothing slow.** The two checks never open a browser or reach the network. They read the audit's findings as the last full run left them, so run the audit again once a change fixes one.
- **Your own hooks stay yours.** The hooks go in `.git/hooks`, never committed. When the project already has a hook of the same name (its own `pre-commit`, `post-commit`, …), or keeps its hooks in a committed folder, the engine changes nothing and prints the one line to add there.
- `--remove-hooks`, or `"hooks": false` in `ds-config.json`, turns them off with the others.

## Measure Figma-code parity

Every run compares your code with Figma and reports in plain words, through 25 checks called gates. To run just one, see [Compare Figma and code](features.md#measure-figma-code-parity) on the Commands page.

The engine reads what your design system defines in Figma, its tokens and each component's parts, states and options. Then it checks your code against it, value by value and in a real browser. It is not a screenshot comparison.

### The gates

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

### What it compares

- **Tokens.** Colours, sizes, fonts, shadows and durations, in every mode (Light and Dark, Desktop and Phone).
- **Components.** Props, defaults and options, every state (hover, focus, pressed, disabled, selected), heights, spacing, corners and markup.
- **Slots.** A Figma slot is paired with the code's slot of the same word (Figma's slotBody is the code's sheet-body), and an on/off that shows it with the slot being filled. When each side has one slot named otherwise, they are paired and the name difference is said.
- **Icons.** From the shared set, drawn the same way as in Figma, whether the code keeps them in one sprite or as one SVG file each (Figma's icons matched to the files by Code Connect's links).
- **Motion and effects.** How each component moves, and what it draws beyond its colours (both below).
- **Product screens.** Where each product puts each component (below).

- **Parts.** Each part of a component is paired with the element that draws it, and measured on its own element.
  - Paired by its name (Label with `.btn__label`).
  - Or by the Figma layer's own id, written on the element (`data-figma-node="12:34"`), for a part whose class says nothing of its name.
  - Or, for a part that is another component (an icon), by that component's class, when the file puts it on one element only.
  - Its gap and padding are compared with the frame of that name in Figma, and its text with the text style Figma sets that layer in.
  - A difference names the part (`chip › Label font weight`) with the rule and the line that set it.
- **Sub-frames in the structure contract.** A frame the contract names whose gap or padding differs is said with the file and line of the rule that sets it.

Every difference comes with its fix in plain words and who acts, you in Figma or Claude in the code.

### Data and tokens

- **Data is up to date.** You are checking against today's Figma, not an old copy.
- **Figma frame unchanged.** The design still looks like the version you approved.
- **Token values match.** Colours, sizes and fonts, in every mode. A colour in a collection that also holds sizes is compared as a colour, so `#0037fa`, `#0037FA` and `#0037faff` are the same.
- **Text styles match.** Every field of every text style is compared with the code: size, weight, line height, letter spacing and case.
  - A field bound to a token in Figma is paired with the code's token of the same name, by the naming convention. Every style that binds it is compared, with no map entry.
  - A `TYPO` entry in `design-system-engine-map.mjs` still wins. It may name one style (`'s/regular'`), a scale whose every style it feeds (`'s'`), or a list.
  - A field whose token changes with a breakpoint is compared in every breakpoint, against the CSS each one resolves to.
  - The family is compared once for all the styles that use it: with the token they bind, else with the font your page text uses. A difference is one finding.
  - A field nothing names is listed as not compared, never passed.
- **Tokens used in screens exist.** Nothing a screen uses is missing from the code.
- **Every mode is covered.** Things that should change between modes really do. Gate [5] (Every mode is covered) finds where the theme sets each mode, in an `@media`, a `[data-…]` or a class block. A mode the code never implements fails with every value it owes.
- **Exception lists are valid.** Your "ignore this" notes still point at real things.
- **No invented tokens.** Every token in the code traces back to a real Figma token.
- **Docs tell the truth.** They mention only things that actually exist.
- **No invented text casing.** No forced UPPERCASE the design never asked for.

A collection whose values change with a mode (a sizing collection per breakpoint) is captured and checked in every mode, even when `ds-config.json` names no collections. Each breakpoint is measured in every colour mode too, and each state's rule is traced in every mode, so a dark hover that differs names the dark rule.

### Components

- **What Figma does not publish is no component of yours, but its construction is checked.** A component whose name starts with a dot or an underscore (`.tableCell`, `_base`), with or without a status mark in front of it (`🟡 .tableCell`), is private to the library: a building block of other components, not one of your system. Your code is never asked for it, it is not counted as missing, and it gets no page in the style guide. How it is built is still checked: its layers Figma named (`Frame 3`) and the values typed by hand in it are listed with the others, under its own name.
- **No hand-built DS components.** A screen uses the real component, not a hand-styled copy.
  - A product's own version of a system component is listed too, as advice. It is found by what it draws (a class that loops the same animation as a component's part, `.spinner` beside the loader's `.loader-spinner`) or by its name (a class of its own that starts with a component's name and says nothing more, `loading-state`).
  - A class beside a system class on the same element dresses the component and is left alone.
  - A component a screen draws only as another component's part (a status bar's divider) belongs to that component.
  - `"Product/component"` in `knownReimplementations` keeps one on purpose.
- **Clean CSS.** Nothing unused, nothing that contradicts Figma. A focus ring's outline, which Figma has no value for, is listed apart, not failed.
- **Nested components keep their own styles.** One component's look does not leak into another. It also catches a component that loses its own hover, press or focus to the component around it: a chip whose `.chip .button { background: none }` comes after the button's hover, so the button never shows it.
- **Structure.** The right height, spacing and corners, from the design.
  - A stroke Figma draws inside the box may be an inset ring in the code (`box-shadow: inset 0 0 0 1.5px …`), which adds no size and counts as that stroke.
  - A border, outline or background the code draws on a component Figma draws with none, in any variant, fails (focus rules aside). This holds for the system's rules and a product's alike, on the component itself, its `::before` or its `::after`.
  - A paint made only of the tokens of a component Figma nests inside (a divider drawn as a `::after` line) belongs to that part. `knownPhantomFillExceptions` names a selector allowed one.
- **All states are built.** Hover, disabled, selected and the rest, each with the right values.
- **Component props match Figma.** The same names, defaults and choices, spelled exactly the same.
  - `Size` and `size` are two prop names, and the finding shows the letters that differ (`letter case S → s`).
  - `L` and `large` are two values, and the finding says which code value it most likely is.
  - The catalog tells AI tools the right name for each wrong one they are likely to guess (`error` → `danger`).
- **Sub-components match Figma.** The parts Figma nests are the ones the code uses.
- **Templates compose the right components.** Each page uses the components Figma composes.
- **Markup.** Ids, classes and icons match, and every control the design shows is built.
- **Required pieces are in place.** Icon slots, component slots and form controls.
- **Icons.** From the shared set, drawn the same as Figma.

### Motion and effects

- **Transitions.** The durations and easings from the design.
- **Motion.** Movement values match Figma, when your design defines them.
- **Shadows.** They match Figma, when your design defines them.

### In the browser

- **Renders correctly in a browser.** Checked on the real result, not just the code on paper. A component the page holds but does not draw on load (in a closed panel) is measured from its sample markup, the rule's `probe`.
- **What this audit covered.** So you can see nothing slipped through.

### Brands change values, not structure

For a system with brands, each component is read in every brand as the browser draws it: the elements it draws, how each is laid out and which show. A brand should change only values, such as colours, fonts, corners and sizes. When a rule for one brand hides a part, adds one or lays one out another way, the audit names the component, the brand and what changed, against the first brand. A fix made for one brand then cannot quietly break another. Advice, never a failure: whoever keeps the brand decides.

### Every difference in one list

A full audit writes `.design-system-engine-out/differences.md` and `differences.json`.

- Each difference between Figma and the code, grouped by the component it names.
- Under each component, where it lives (the products that use it and what it sits inside), so you see how far a fix reaches.
- Marked new when the last run did not have it. One whose line number only moved is not new.
- Each check that did not run is named at the top, so a difference it would have found is never mistaken for a pass.
- Lines that only point at a difference (a Figma link, who last changed it, what was skipped) stay in the audit and out of the list.

Under its verdict, the summary of a full audit counts the components that pass, drift (an open difference) and were not checked, with the names when there are few. Beside them, `findings.json` holds every finding of every check as one record, with its rule in plain words, its evidence and its verdict.

It is written whether or not you have a style guide, and the summary of every check says where it is.

### Differences you keep on purpose

Some differences are decisions, not mistakes. When your team decides to keep one, [tell Claude](features.md#measure-figma-code-parity) and give the reason.

- It is recorded in `design-system-engine-kept.json` with the reason, who decided and when. Commit it.
- Add `--truth figma` or `--truth code` to say which side is right, and `--review 90d` (or a date) to look at it again later.
- A kept difference never fails a check. It is listed under Kept on purpose, in the differences list and on the component's Parity area, with its reason.
- It is that exact difference that is kept. If Figma or the code changes its value, the difference is open again.
- Only you keep a difference. The AI asks you first, and it never writes a reason for you.
- `--keep` alone lists what is kept. `--unkeep --match <words>` takes one back.

This is not debt. Debt (`--baseline`) is a difference you will fix later. A kept difference is one you decided to keep.

### Nothing passes by accident

- A check that had nothing to read shows **Not run** with the reason, never Pass.
- What a check cannot see is listed as not comparable, with the reason, not as a difference.
- Every check is tested with a mistake planted on purpose.

### When a check is wrong

Not every finding is right. A check that raises things it should not is the quietest failure the engine can have: people stop reading its lines, and then miss the true one.

`rms-design-system-engine --wrong --match <words> --why "<what the check misread>"` records a finding of the last full audit as wrong, with why it is wrong, who said so and when, in `design-system-engine-wrong.json` (commit it); `--wrong` alone lists them and `--unwrong --match <words>` takes one back. A check called wrong more than once is named in every run afterwards, however few findings it raised that day, because the thing to fix is the check. Each finding marked wrong is also a case its check must pass: every full run says which it still raises, and which its check no longer raises, so you know when a fix took and the mark can go.

**A marked finding is never hidden.** Silencing a line because someone once called it wrong would turn one person's judgement into everybody's blind spot, and a check that misreads one project may be right in the same words in another. The record exists to get the check fixed. It is also not the same as keeping a difference (`--keep`): keeping one says the engine was right and the team chose otherwise; marking one wrong says the engine was wrong.

## What a check actually is

Every check is tried against a fault on purpose: each one passes a clean project and names the mistake in a broken one. That proves a check *works*. It does not tell you what it **is** — and the same finding is advice on one project and a refused merge on the next.

Thirteen checks change behaviour with a setting in `ds-config.json`, and the two kinds look identical from outside.

**Advice until you ask for more.** Off unless you turn them on. The finding prints as `ℹ️` and the run still passes, so an agent may ignore it. Set the key to `true` to make it stop the merge:

| Setting | What it decides |
|---|---|
| `coverageStrict` | a component no check models at all |
| `deadCssStrict` | CSS no rule uses any more |
| `fillCoverageStrict` | a background nothing asserts, so a missing fill would ship unseen |
| `htmlCompositionStrict` | a sub-component Figma nests that the code does not use |
| `htmlRealizationStrict` | a prop Figma has that the code does not realise |
| `orphanUsedStrict` | a token bound in Figma that no CSS variable carries |
| `reimplementationStrict` | a component built by hand where the system has one |
| `renderedModeStrict` | a rendered assertion that covers some modes and not all |
| `templateCompositionStrict` | a page missing a component its Figma template composes |
| `versionLockStrict` | a product left on an older version of the system |
| `screenElementStrict` | an element on a screen the code never builds |

**Stops the merge until you ask for less.** On unless you turn them off. Set the key to `false` to make the finding advice:

| Setting | What it decides |
|---|---|
| `renderedParityStrict` | what the browser draws against what the design says |
| `screenComponentsStrict` | a designed screen built from something other than the system |

Every other check always fails on its fault, and nothing in your configuration excuses it.

**Why this is written down.** A check nobody tried against a fault is a promise, not a check — and a check whose strength nobody recorded is a promise of unknown size. Teams plan around what a gate will stop; the honest answer is sometimes "advice, until you ask for more". The table is read from the code itself, so a new setting cannot be added without appearing here.
