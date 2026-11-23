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

For whoever keeps the Figma file, it lists a colour, radius, padding, gap or text with no token or style, an instance detached from its component, an empty frame that draws nothing (a spacer is the auto layout's gap), a variant with no auto layout, a variant option named by its look (`Color=Blue` where a role belongs), a spacing or size token off the grid the library keeps (8px or 4px, mined from its own values), a mode spelled two ways across collections, a status colour family missing where the others are there, a colour scale step that reaches 4.5:1 in one colour and not in another at the same number, a component with no description, an instance whose layer spells its component's name another way, a property bound to a token meant for other properties, and tokens left on all scopes. Only what is drawn counts: the shapes a boolean operation merges are painted with the operation's own fill, a layer hidden with no property to show it is never seen, a mask's own colour never shows, and padding does nothing outside auto layout, so their values are left out.

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
- **A base token never points up.** A primitive that points at a semantic token makes the layer below move with the one above.
- **A component token never points at another component's.** `chip/bg` pointing at `card/bg` changes the chip whenever the card changes. Only names of your library's own components count, so one semantic group pointing at another is fine.
- **And a token named like another collection's.** For example, `primitives/…` sitting in Semantic.
- **Nothing is imposed.** A group of tokens that points in every direction has no clear layer, so it gets no rule.

When your code has its own names for how things are laid out, each auto-layout frame is checked against them:

- **The code's layout parts are read from its CSS.** A class named after a layout (`l-stack`, `o-cluster`, `ds-grid`) that lays out its children, with what it sets: its direction, gap, wrap and alignment.
- **Each frame is named after the part it is laid out as.** A vertical frame called `Frame 47` is the code's Stack, so the fix says to name it Stack. A row that wraps is a Cluster, and one that does not wrap is not.
- **Its gap is bound to a spacing variable.** A frame the code has a part for, with a gap typed by hand, is listed with that gap.
- **Nothing is guessed.** With no layout parts in the code, there is nothing to name a frame after, and no rule.

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
- **Nothing overlaps or spills.** A label drawn over its icon, a part cut off by a frame that clips, or one sitting outside its parent, named with its layer and variant. A fault is never a style, so it is always to fix. It needs a Figma read taken since this check came in.
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
- **What to do first, and where.** A row opens in the side panel, with its own link to share. What to do comes first, and right under it every component or place it changes, then its status, owner and why.
- **In your pipeline.** A ready-made GitHub Action runs the check on every pull request: an error for a rule your team decided, which stops the merge, and a warning for every other rule a component does not follow. One line in your workflow adds it ([how](../cookbook/ci-and-hooks.md)).
- **A list you can read row by row.** One component or place a row, a line between rows, in columns labelled once at the top:
  - A rename shows the name now and the name it takes. A token renamed whole shows its full new name (`typography/xxxs/lineHeight`).
  - Anything else says what to do on that row, such as the scopes a variable is bound with ("Scope it to text fill").
  - Long names stay whole and break only between their `/` parts.
- **Checked where it lives.** A Figma rule has **See in Figma** under What to do: the component's node when it is one, the file when there are several. Each component in its list opens at its own node too, marked with Figma's icon. The engine never changes Figma for you: a person makes the change there. A rule about the code links to the component's page instead.
- **In Figma.** The rules above, what the file check finds (values with no token or style, detached instances, layers named unlike their component, variables used outside their scope), components of one type compared, and your tokens: named by role, described, layered where their value changes, and what each brand overrides.
- **In the code.** [How your code builds a component](#how-your-system-builds-a-component-in-the-code), and what [Lint your codebase](#lint-your-codebase-rules) finds: values written by hand, aliases to deleted tokens, invented variables, hand-built components and near copies in your products.
- **The code is never changed for you.** A code fix is handed back as a patch to apply.

To keep it out of the menu, set `styleguide.construction` to `"unlisted"` ([all options](../reference/config.md)).

### Taking a change in Figma back

The engine only reads Figma, unless you say yes to a change: a rename, a description, the design team's to do page. Every change it writes there can be taken back.

- **Every write records what it replaced.** Once the change has run, the engine writes the way back beside it.
- **You see it before it runs.** The engine lists what the way back puts back, step by step, and runs it only after you say yes.
- **All or nothing.** If part of a change cannot be put back, the way back changes nothing and says why. A file put back halfway looks undone when it is not.
- **Its own frames are written again.** The to do page is simply drawn afresh on the next run.

The full list of options is in the reference (`--reference usage`, *--figma-edits* and *The way back from a Figma write*).

## Lint your codebase rules

Two kinds of finding, one for each part of your code: the system's own tokens and themes, and the apps that use them.

What it finds is shown as rules too. Each check's findings become rows on the style guide's Rules page, beside Figma's, so both sides of how your system is built read as one list.

### How your system builds a component in the code

Every run reads your system's own component files the way it reads Figma, and writes down how they are written. Nothing is a rule until every component follows it: each line is a rule, to fix (most follow it, or your team decided it) or to decide. The rules sit on the Rules page under Code, beside Figma's, and in `contracts/construction.json`.

What it reads, as rules:

- **The framework and the files.** What a component is written in (a Vue file, a React one, a Lit or an Angular class), where its file sits (`src/components/<family>/`) and how the file is named.
- **The props.** How each kind of prop is named (a yes/no, a choice of options, a text, a number), the word a yes/no begins or ends with (`is…`, `show…`), and how an option is written (`in-progress` or `inProgress`).
- **What says what it is for.** A comment on each component and on each prop.
- **The way to Figma.** Each component Figma has, joined to it by a Code Connect file, and each Figma property mapped to a prop or a slot.
- **Stories that still hold.** Each value a component's stories and examples set is one its prop still takes: a story's args (`args: { size: 'xs' }`) and each call of the component written in a story or examples file (`<Button size="xs" />`), its literal values only. A story builds whatever it sets, so a size the system dropped keeps showing in every story that used it, and everyone who copies the story copies it. This one is a rule from the first component with stories, not a habit most follow: every break is to fix, with its file, line and story, and `--construction-check` fails on it unless your team says no.
- **States.** How each state is written, state by state: a pseudo-class (`:disabled`), a class (`.is-disabled`), a data attribute or an ARIA attribute.
- **Class names.** How a part's class is named (`button__label`, `button-label` or `label`), and a variant's (`button--large`).
- **Tokens.** Whether a component's styles use custom properties made for it (`--button-…`) or the shared tokens directly. Which way is your team's to say, so it waits for the answer.
- **Its look.** A shadow, a border colour, an opacity, the corners and the text, each written with a token rather than by hand, and whether the corners share one radius token.
- **Its own API.** Whether a component declares custom properties of its own for what may be overridden.
- **Its words.** The words a component shows when given none (a text prop's default, a slot's fallback) and the words in its stories, in the case most components use. And no words written straight into its markup, such as `<span>Close</span>` or `alt="picture"`, which nobody using the component can change or translate.

A rule your team already wrote into its linter counts as decided:

- **Read from your configs.** Your stylelint and ESLint configs, such as `vue/prop-name-casing`, `selector-class-pattern`, `color-no-hex` or `declaration-strict-value`.
- **Shown as your team's.** The rule's panel on the Rules page says where it was written (`eslint.config.js:72`) and how many findings your own linter reports for that setting, so there is one list, not two.
- **Only when it agrees.** A setting decides a rule only when it says what the rule says. One that is turned off decides nothing.
- **Your linter, run locally.** It runs from your project's own `node_modules` only, and is never installed for you.

Your linters also run for everything they report, not only the settings that decide a rule:

- **Your config as it is.** A config that only extends a preset (`next/core-web-vitals`, `plugin:vue/recommended`) is still your team's choice of rules. Each linter with a config runs on the component files and reports its findings by rule, such as `react-hooks/purity (1)`.
- **Said when it cannot run.** When your setup cannot start (a config your installed version cannot load, a plugin missing, the linter not installed), the engine says so in the linter's own words, such as `ESLint 8.57.1 could not run: TypeError: …`. It never runs another version in its place.
- **Where you see it.** Under the code's rules when you ask about them, and in `--construction-check`, as information that never fails the check. Its `--json` holds every finding with its file and line.

Beside the rules, each component's anatomy, read as deeply as Figma's:

- **Each state** and how it is written, with its file and line.
- **Its parts** with their element and class, in the order the markup writes them, and whether each is shown only on a condition.
- **Which prop changes what.** The class a prop puts on, and every declaration that class sets, on the component or on a part.
- **Each shadow** with the attributes it writes (offsets, blur, spread, colour, inset) and how it is turned off. A shadow with four attributes in Figma and three in the CSS is then a difference that can be named.
- **Borders, the radius of each corner and opacity**, with the token each uses.
- **How it wraps and sizes.** `flex-wrap`, the row gap against the column gap, the minimum width, and whether it hugs its content or fills its space.
- **The text each part sets.**
- **What only the code has.** The custom properties it declares and reads (its own API, safe to override), and those it reads from the theme.

It reads the code capture when there is one (its props come from the compiler and the Code Connect files), else the component files themselves, with each Vue or Svelte file's own styles and the stylesheets a React file imports. The engine changes no code: a component to fix is handed back as a patch to apply. Your team decides a rule the same way as Figma's ([how to ask](features.md#lint-your-codebase-rules)), and `--construction-check` fails on a decided rule a component breaks.

**In CI.** Beside those errors, a rule nobody has decided yet that components already break is a **warning**: said, never a failure, so a pipeline shows the work ahead without blocking on it. `--warnings-as-errors` fails on both, and `--json` writes the same as data for a job that posts it. The step to copy is in [the CI recipe](../cookbook/ci-and-hooks.md).

### One prop vocabulary across the system

The family rules hold a family to one name and one set of options. These hold every component to them, in Figma and in the code:

- **One idea, one name.** A button's words come through `label`, a chip's through `text`: the name most components use is the one kept, and each other is listed.
- **One set of values.** A size that runs S to L on most components and sm to lg on one is listed, said as another scale where it is one.
- **The catalog answers with the system's name.** Each prop carries the names an agent would guess for it. A prototype that writes `text` on a button is told the system calls it `label`, and `--query text` says the same.

### States use the system's state tokens

- **In every mode.** A role's states (hover, pressed) are set in every mode its rest is: a hover with no dark value is listed.
- **In Figma.** A variant for a state binds that state's own token. Keeping the rest token, or a step picked by hand (`blue/700`), is listed where the state token exists.
- **In the code.** A component's `:hover`, `:active`, `:focus` or `:disabled` rule writes the system's state token where one exists. A primitive, a colour by hand or the rest token is listed with the token to write. It holds from the first component that has one, unless your team says no.
- **As an agent edits.** The edit check says the same, with the token to write, on the line it added.

### Classes nothing styles, and styles nothing uses

The checks above read what your styles *do* with the system's values, so they see a colour written by hand and miss the debt that has no styles at all. This reads your two lists of classes against each other, in both directions:

- **A class your markup puts on an element that no stylesheet styles.** Usually a style that was deleted and left the class behind. It is the oldest thing in a product and the cheapest to delete.
- **A class a stylesheet defines that no markup ever puts on.** A rule nothing can reach.

Both appear on the style guide's Rules page under Code, each with its file and line. The engine deletes nothing: each one is handed back for a person to decide.

Nothing is guessed:

- A class your code builds at runtime (`` `card--${kind}` ``) is never called unused, nor are the ones a router or a transition puts on.
- An id is not a class, and a dot inside a comment, an attribute selector or a `url()` is not a class either.
- A bound class is its quoted names, never the props that decide them: `:class="{ 'error': errorState }"` puts on `error`.

### A score for your code's health

Your Figma library gets one number from the rules your team keeps. Your code now gets the same number, from its own rules, because the two checks are one idea on different material: read what the thing is built on, then say how closely it is followed.

- **One number a side**, on the Rules page's Figma and Code cards: how closely the rules are followed, across everything they read.
- **Classified by area**, so you can see which part is weakest.
- **How it is counted, in its tip.** The mark at each card's top right says what its ring counts: the rules every component already follows, out of all the rules read from that side, rounded down.
- **With its trend**: the change since the last day the page was built. Each side keeps its own history.

A rule still to decide, or one your team set aside, counts for nothing. The ring on each card still says how many rules are done, which is a different thing, so neither number stands for the other.

### In your tokens and themes

Advice on keeping the system healthy as it grows, never a failure.

| Check | What it finds | How to turn it off |
|---|---|---|
| System health | Risks as the system grows, such as tokens named after a product | `"systemHealth": false` |
| Mode combinations | What breaks only in a combination of modes, such as Dark on a phone | `modeCombinations: false` |

#### System health

Advice on keeping the system's own token layer healthy as it grows (`🧭 System health`), never a failure.

- Semantic tokens with no description in Figma. What a token is for is what an agent reads to pick it.
- Two components whose own rules are nearly the same.
- Colour tokens a person cannot tell apart, in every mode they share, offered as one merge each: which one stays, which would point at it, and the components the merge reaches. Two neighbouring steps of a grey scale stay apart, two colours with different jobs (white text on a button, a white surface) stay apart, a token named after a component is never the one kept over a shared one, and a token that already points at another is that one.
- Tokens named by look (`blue-500`) rather than role, or after a product or brand (`harborNotes/accent`).
- Aliases to a removed token, with the commit that removed it.
- A colour token the code mixes at 0%, so it never shows. A `color-mix()` gives all of the mix to the other colour, often an opacity token given to the wrong side. It is read through a stylesheet function that returns one, such as a Sass `@function`.
- The token budget, the same colour written by hand in two tokens instead of one primitive, and tokens only one component uses.
- The common set a system lacks:
  - It lists the system against the 23 components nearly every product builds with (button, link, text input, select, checkbox, radio, switch, form field, dialog, menu, tabs, table, card, alert, toast, tooltip, avatar, badge, icon, pagination, progress, skeleton, empty state).
  - Three columns: Figma, the code and the intent layer. A side the engine has nothing to read from is left out, never counted as missing.
  - It matches by meaning, not exact name: a modal is a dialog, a snackbar a toast, a TextField a text input, an IconButton a button.
  - It names each one missing on every side, and each that is on some sides only.
  - It counts the five token categories (colour, spacing, radius, elevation, typography) that have tokens, and how many values of an untokenised one the styles write by hand.
  - A gap the team leaves on purpose (`commonSet.leaveOut` in `ds-config.json`) is said as kept, with its reason, never as missing.
- Governance on paper, held against what happened:
  - It reads the team's own contribution guide, release process and changelog for the rules they state.
  - It holds each breaking change in the last five releases to those rules: a major version, a changelog entry that names it, and a migration note.
  - A breaking change is one its commit marks (`!:`, a `BREAKING CHANGE:` footer) or one the engine recorded when it published the contracts.
  - A rule the documents do not state is never checked. With no such documents, it says nothing.
  - It says when commits stop following Conventional Commits, when the guide asks for them.
  - Where the engine keeps the team's issues on GitLab, it names open issues left past the guide's own stale or duplicate limit, in days.

What a *product* does with the system is a product leaving it, so it is said under the drift check instead (`🪢 Drift from the system`), not here. Each part does what its line on the [features page](features.md) says:

- A colour mode set below a product's root, so part of the page draws in another mode.
- A product that brings in two of the system's themes, one overriding the other by load order.
- A Storybook preview stylesheet that styles a component, so the catalogue shows it right while products draw it as the code does.
- A class a product styles almost as one of the system's components, as a decision, never a drift.
- A product that has quietly left the system gets one block of its own:
  - **Stopped upgrading:** how many majors and minors it is behind the system's latest version, and, when the system's version tags give the dates, for how long, counted from the version after its own.
  - **Copied and changed:** a class in its folder that nearly copies one of the system's components, with what differs.
  - **Built its own:** a component it defines beside the system's, by the same name, by its own name before it (ShopButton), or by a known alias (Modal for a dialog). A wrapper that brings in the system's package is not one.
  - Each line says where it is (file and line) and is a need the system does not meet yet. Ask the product's team what it needed.
  - The version a product uses is the one its lockfile pinned (package-lock, yarn or pnpm), before the range its package.json accepts.
- The same job done differently across products:
  - It reads each product's pages and says what job each one does: a create flow, an edit form, a detail page, a list or table page, a search, a settings page, a sign-in or the navigation.
  - The job comes from the file's name or its folder's (`CreateOrder.jsx`, `orders/[id]`), else from what the page is built from (a table makes a list page).
  - It groups the pages that do the same job in two or more products and says what differs: the system components that carry it, their order, and where the main action sits.
  - Each difference is a question for the teams: is it earned? Align the products, or keep it.
  - A job kept different on purpose (`sameJobs.keep` in `ds-config.json`) is said as kept, with its reason.

A component only the code has is written to `handback/figma-to-build.md` with its props and tokens, to build it in Figma.

#### Proposals from how the system is used

What two or more products work around is the system asking for a change (`rms-design-system-engine --proposals`).

- **Overrides in the code:** a rule of a product's own that styles a system component's class, or an inline style on its tag. A product's own class is not one, and neither is a custom property.
- **Detaches in Figma:** a frame in a product's screen detached from a system component, read from the screens capture (`--figma-screens`).
- When the same override (one component's one property) or the same detach repeats in two or more products, it becomes a proposal: what to change, where it was seen (file and line, or the screen) and the products that use the component, which the change would reach.
- A person decides each one: `--proposal <id> --accept`, `--reject "<why>"` or `--research`, always with `--by "<who>"`. A rejection needs its reason.
- Decisions are kept in `design-system-engine-proposals.json`. A rejected proposal is said in one line with its reason, never drafted again as new.
- The full check says in one line, under the drift check, how many are open. The proposals are written to `handback/proposals.md`.

#### System health report

Ask how healthy your design system is and the engine answers from what it already found (`rms-design-system-engine --health`). Run the full check first: the report reads its results.

- Fourteen questions, grouped by the engine's four layers:
  - **Facts**, is the picture right: is what the engine read current, do Figma and the code agree, does each part have one name, do the styles use tokens, can one colour stand in for another at the same step.
  - **Contracts**, does the code hold: the team's own rules, accessibility in every theme, tests and stories.
  - **Intent**, is it whole and explained: the parts nearly every product builds with, each component's purpose and when to use it, releases against the team's own documents.
  - **Evaluation**, is it used: products on the system and keeping up, whether an agent can learn it, and whether what agents build with it passes.
- Each answer is good, mixed or poor, with the evidence behind it, such as "9 of 12 checks pass".
- Each says what the engine did not see, such as a browser that is not installed.
- A question with no evidence is left unanswered. It says why and names the command that would answer it, and never guesses.
- Each names what only the team can tell, such as who decides what goes into the system.
- Each report is kept, so the next one says which answers got better or worse.
- The report is written to `.design-system-engine-out/system-health.md`. `--inspection` is the command's earlier name and still works.

#### A product's own health report

Ask how a product is doing and the engine answers for that product, beside the system's report (`rms-design-system-engine --health --product <name>`). It reads the product's folder and its built pages, and never runs or changes them.

- Eight questions, in the same four layers:
  - **Facts**: is it built from the system rather than beside it, do its pages read in order (one main heading, no level skipped), and which other hosts does its code load from or send to.
  - **Contracts**: do its pages work for everyone (from an accessibility run on its pages), and does it test itself.
  - **Intent**: is it on the system's latest release.
  - **Evaluation**: how much a page of it loads from its own folder, and whether it measures how it is used.
- **Its pages opened in a browser.** With Chrome on the computer, each built page is opened in it too: every request to another host, and the time to the first thing drawn and to everything loaded, once on a normal network and once on a slow one (400 ms, 400 kbit/s). `--no-browser` reads the files only.
- Each answer has its evidence, what the engine did not see (what a page sends once a person signs in, how it opens in Firefox or Safari), the command that answers it, and what only the product's team can tell.
- It is written to `.design-system-engine-out/product-health-<name>.md`, and kept, so the next report says what got better or worse.

#### A product's screens, drawn from the system

Ask to see a product's screens built from the system and the engine redraws each built page (`rms-design-system-engine --product-screens <product>`).

- **Each region marked.** Every part of a header, a navigation or a section is the system's own component, the product's own built where the system has one, or a stand-in where the system has none.
- **Drawn in the engine's workshop.** Each screen is written as a composition in `.design-system-engine-out/workshop/<product>/`, which `--prototype <file>` draws. Nothing is written into your Storybook or the product.
- **What drifted.** Each run keeps the marks, so the next one says which screens moved: a part that was the system's and is now the product's own, a region added or gone.

#### Dates, numbers and money

When your system keeps its formats as tokens, in a collection whose modes are its markets (`en-GB`, `pt-BR`, or a Market collection), they are read like any other mode:

- **In every market.** A format token with no value in one market is listed.
- **Not by hand.** Code that writes a locale (`Intl.DateTimeFormat('en-US')`, `toLocaleDateString('pt-BR')`), gives a date library a pattern (`format('DD/MM/YYYY')`) or joins a currency symbol to a number is listed with the system's format tokens. The edit check says the same as an agent writes it.
- A system with no format tokens is told nothing: there is nothing to hold the code to.

#### A product's way onto the system

Ask for an adoption plan and the engine turns what it found about a product into the steps that bring it onto the system (`rms-design-system-engine --adoption-plan <product>`). Run the full check first: it reads the product's copies, own components and version from it.

- Every finding gets one of four answers, each with who acts:
  - **Use the system's**: the system has the token or component. The product's team switches.
  - **Ask the system**: the system lacks it, such as a value used in three places with no token. The system's team answers, in Figma first and then in code.
  - **Keep, with a reason**: a person decides it stays.
  - **Move up a version**: the product runs an older version.
- Each item lists its places, file and line, and a size from how many places it touches (S, M or L).
- The steps put what needs no decision first, so the product's count falls at once.
- Each step ends on the engine check that goes quiet once it is done, such as the census listing no value a token says.
- The engine changes nothing in the product: the plan is written to `.design-system-engine-out/handback/adoption-<product>.md`.

#### Browser support

Advice on the web features your code uses, against the browsers your team supports (`🌐 Browser support`), never a failure.

- It reads the browsers your team supports from `supportedBrowsers` in `ds-config.json`, then `browserslist` in `package.json`, then `.browserslistrc`.
- Only explicit minimums are read (`chrome >= 111`, `safari 16.4`). A query like `last 2 versions` needs usage data, so the audit asks you for explicit minimums instead.
- With no targets anywhere, it says nothing. It never guesses which browsers you support.
- Each CSS, HTML or JavaScript feature a supported browser does not run is listed with its line, the first version that runs it, and how to keep it working.
- A feature you already guard is left out: inside `@supports`, after a fallback value in the same rule, or behind a check in a script.
- Old patterns the platform now replaces (`-webkit-box`, `-ms-` prefixes, `keyCode`, `document.write()`) are named with their replacement.
- The system's own code and each product's code are listed apart.
- Which browser version runs what comes from [web-features](https://github.com/web-platform-dx/web-features), the data the browser vendors keep behind Baseline. The engine keeps one pinned copy in its own cache, downloaded once and checked against its pinned hash, never put in your project.
- With the data, a feature no list of the engine's names is checked too: each CSS property, selector and at-rule, and each HTML element, the data knows. A version that changed is right the day the data says so.
- With no copy (offline before the first download) or with the data turned off (`"webFeatures": { "data": false }`), the engine's own table checks the features it lists. The line says which one it used.

#### A token in the right layer

A token belongs in the first layer where its value can change. A collection with modes (Light and Dark, a brand) is where values change with them; a token in it defined the same way in every mode (the same alias or value) never uses them, and can live in a layer without modes that aliases this one, following every mode through it. The audit says how many of a moded collection's tokens are like that, by family. Advice only: Figma's collections are your team's design.

#### A colour scale step means the same in every colour

A system with colour scales (blue 100 to 900, red 100 to 900) numbers its steps so a designer can swap one colour for another at a step and keep the look. That only holds when each step is about as light in every colour. A yellow is much lighter than a blue at the same number, so its 600 may fail as text where blue's 600 passes.

- **The scales are read from the names.** A family, then a number: `blue/600`, `Neutral 600` or `red-600`. A family needs three steps or more.
- **Each mode reads its own.** A dark mode whose scales run the other way is measured as it is.
- **A step that splits is listed.** On the system's own page surface, in each mode, a step that reaches 4.5:1 in some colours and falls under it in others, with how light each one looks (OKLCH lightness).
- **So is a swap that would break.** A text colour or a surface that points at a step today and passes, and would fall under its ratio at the same step of another colour, with the colours that break it.
- **Both are to decide, never to fix.** Even out the steps, or say in the intent layer which colours may not stand in for each other.
- **Where a colour is picked.** The style guide's colour page shows each step the scales share, every colour's token at it with its contrast on the page in each mode, and each step's card says whether it reads in every colour, in none, or splits, with the colours that fall short.
- **In the health report.** "Can one colour stand in for another at the same step?" is answered from the same lists.
- A system with a single scale (a neutral grey) has nothing to compare, so the Rules page, the colour page and the health report show none of it.

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

#### shadcn/ui

A shadcn/ui system is read as its own kind of React, from its `components.json`:

- **Its components are its ui folder.** The folder `components.json` names (through your `@/` alias in `tsconfig.json`) holds the components, each file named in kebab case and read by the name it exports: `dropdown-menu.tsx` is `DropdownMenu`.
- **A registry is read from its `registry.json`.** A project that publishes a shadcn registry keeps its library in the folder its `registry:ui` items list. That folder is read, not the ui folder `components.json` names, which holds only what its own site installed.
- **Its slots name its parts.** A component says what it is in `data-slot`, and each element's slot is its name: `menu-content` is a part of `menu`, the family a file is named for. Tailwind's utilities (`flex-1`, `bg-border`) are never read as a part. A component built with Base UI's `useRender` passes its slot in its props (`"data-slot": "badge"`) and is read the same way.
- **Its variants are its props.** A component that takes `VariantProps<typeof buttonVariants>` has a prop for each axis of that `cva` call, with its options and the default `cva` gives it. `tailwind-variants`' `tv` is read the same way. Figma's variants are then compared with these props like any other.
- **`asChild` is composition.** A component that hands its element to its child (Radix's `Slot`) takes `asChild`, said as a yes/no prop and never drawn on its own, since it needs a child to draw.
- **Radix's states are drawn too.** A component that renders a Radix primitive's `Root`, passes its props on (`{...props}`) and styles a Radix state (`data-[state=checked]:bg-primary`) takes the prop Radix sets that state from: `checked`, `pressed` (`data-state="on"`), `open`, and `disabled` for `data-[disabled]`. Each is drawn as a case of its own, so its look is compared with Figma's Checked or Pressed variant. In the default case it is left to Radix, so a switch still switches.
- **On its style guide page too.** The page carries the Tailwind your build compiles, so each component looks as it ships there. Tailwind's reset (its preflight and your own base rules) applies only where components are drawn, never to the guide around them. A component is known by its `data-slot` (`data-slot="switch"`), since its classes are Tailwind's. Any Tailwind system whose theme file is Tailwind's entry (`@import "tailwindcss"`) gets the same.
- **Drawn as it ships.** With React and Vite installed, the components are drawn by your own Vite config, so its alias and its Tailwind plugin compile the classes and Radix runs: a switch switches, and its `data-[state=checked]` classes follow.

#### Lit and Angular

A component written as a class is read the way a Vue or React one is, into the same props, slots and events.

- **Known by its imports.** A class that extends `LitElement`, or carries `@Component` from `@angular/core`, is a component, whatever its file is called. A spec or a story file is never one. An Angular service is not either.
- **Named by its file.** `acme-button.ts` is `acme-button`, and `badge.component.ts` is `badge`. An Angular app's root component (`app.ts`, `app.component.ts`) is the app, never one of its system's components.
- **What it takes.** Lit's reactive properties, decorated (`@property() tone = 'primary'`) or listed in `static properties`, with the defaults its constructor gives. Angular's inputs, decorated (`@Input()`, with an alias, `required`, a getter or a setter) or signals (`input()`, `input.required()`, `model()`). A union of strings (`'s' | 'm' | 'l'`) gives a prop's options, even one a formatter wrapped over several lines.
- **What it inherits.** The props and events of the class it extends, when that class is your own (imported from `./…`), up to three classes up. A prop the component declares itself wins.
- **What it keeps to itself.** Lit's internal state (`@state()`, `state: true`) is no prop, as a Vue component's data is not.
- **What it sends.** Lit's events (`new CustomEvent('acme-press')`, or a base class's `this.emit('acme-press')`), and those its doc comment names (`@event`, `@fires`). Angular's outputs (`@Output()`, `output()`), and a model's own `<name>Change`.
- **What it holds.** Lit's `<slot>`, and those its doc comment names (`@slot`). Angular's `<ng-content>`, named by the attribute its `select` asks for (`[icon]`, `[slot=icon]`), else its class (`.icon`). What a select rules out (`:not(…)`) never names it. An Angular template in its own file (`templateUrl`) is read too.
- **Its class.** An Angular component's `host` class, else the first class its template's first element carries, a `<slot>` aside. Lit's `classMap({ menu: true, … })` gives the class it always sets. A class written with `${…}` is a modifier, never the component's name.
- **Used by its tag.** A component another one puts in its template as a custom element (`<acme-icon-button>`) counts as used.
- **A manifest first.** A Lit system that ships a Custom Elements Manifest is read from it, and from its files where it says nothing.
- **Proven on real code.** A public Lit library of 58 components and a public Angular library of 77 were read this way: 42 and 67 of them with their class (the rest draw no element of their own), with their options, defaults, descriptions, events and slots.
- **Lit drawn as it ships.** With Lit and Vite installed, each Lit component is drawn by your own Vite in a real browser, in each of its cases, each value set as a property as Lit reads it. Its tag is the one it defines, or the one a file beside it registers. The accessibility check and the browser measurements read through its shadow root.
- **On the style guide too.** Each case is kept as a declarative shadow root, with the styles Lit adopted inside it, so the page shows it as Lit drew it without running Lit. `styleguide.renderLit: false` leaves them undrawn.
- **Your own build only.** A Lit library built without Vite (with Rollup or the web dev server alone) is said so, and its components get the checks that read code.
- **Angular compiled by your own compiler.** With Angular installed, its compiler (`@angular/compiler-cli`, the one `ng build` runs) compiles each Angular component ahead of time, with your own tsconfig, its template and its stylesheets inside it. A stylesheet in Sass is compiled by your own Sass, as your builder does. What the compiler refuses (a template naming what the component lacks) is said with its own error.
- **Angular drawn as it ships.** Your own Vite (yours, or the one `@angular/build` installs) serves the compiled components, and your own Angular draws each in each of its cases, on the element its selector names. Each value is set as an input by the name a template uses (an alias among them), what a person puts in it is projected into its `<ng-content>`, and a library that ships partly compiled (Angular Material) is finished by your own `@angular/compiler`. No zone.js is needed from Angular 18 on, and before that your own zone.js runs. The accessibility check and the browser measurements read it drawn.
- **On the style guide too.** Each case is kept as Angular drew it, with the styles Angular scoped to it and a library's own styles beside it. `styleguide.renderAngular: false` leaves them undrawn.
- **Proven on a real app.** An app the Angular CLI made (Angular 22, SCSS, no zone.js) with Angular Material had all three of its components drawn in all ten of their cases: Material's buttons and slide toggle among them, its theme and its styles kept.
- **Every case can draw.** A prop a component requires (`input.required()`) is given in every case, never only in its own, since without it the component refuses to draw. This holds for every framework.

#### Values written by hand

The census (`🧮`) counts each colour, spacing, radius, font size, duration, layer and shadow a token should carry, with the token to use when one has that value, the files that guess most first. `rms-design-system-engine --census` lists each one and keeps the count, so it only falls. A file with more than before fails the run.

- **The token for each one.** A colour no token holds is named with the nearest colour token by how it looks, with how far it is. Past a small difference, the system has no colour near it, and it says so. A semantic token is named before a primitive that holds the same value.
- **A fix, when you ask.** `rms-design-system-engine --census --fix` writes a patch that puts each exact token where its value was. You apply it, and the engine changes nothing itself. A nearest one is named and left for you to choose.
- **In Figma too.** The Figma file's hygiene report names the variable for each fill, stroke, radius, gap and border that has none, and writes the bindings for the exact ones. Where two layers of a variant share a name, each binding names the node it was read on, so it never lands on the other. `--figma-change` takes them, behind its sign-off. Refresh Figma once for the capture to keep each node.
- **The semantic token first.** Where a semantic token and a primitive hold the same value, the census, the edit check and the fixes all name the semantic one first.

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


### A copy of the system inside a product

Some teams copy the system's components into their own repository at a release and import from the copy. Read as it is, a copy passes for the system. So each file of it is held to the same file of the system at the release the product pinned (`--prototype --pin`), else the copy's own `release`.

- **The same** as the release: nothing to do.
- **From an older release:** bring the copy up to the release.
- **From a later release:** content a newer release already has, named. Move the pin to that release rather than ask the system for it.
- **Changed in the copy:** content the system never had. A fix made there, an accessibility one most of all, reaches no other product, and is lost when the product is built from the system. Each one is listed by the commit that made it, as one request for the system to take or refuse.
- **Missing from the copy**, or **only in the copy**, said too.

`rms-design-system-engine --prototype --copies` checks every copy.

- **The patch that brings the copy to its release.** The files from an older release and the ones missing from the copy are handed back as one patch (`.design-system-engine-out/handback/copy-<copy>.diff`), applied in the product with `git apply`. The changes made inside the copy are never in it: they are requests.
- **Read in a moment.** Files are compared by their git object ids, and what each was found to be is kept by its content, so the next check reads again only what changed. A page that imports from a copy is held to the system's component it copies.

```json
"copies": [{ "dir": "../acme-shop/src/library", "from": "components" }]
```

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
  - A turned part (a chevron) is compared at its angle. Figma turns counter-clockwise and CSS clockwise, so Figma's 90° is the code's `rotate(-90deg)`, and -90° and 270° are the same turn.
- **Icons are two sizes.** The icon's box and the glyph drawn inside it (16 inside 24) are each compared, so a glyph stretched to fill its box is found.
- **One font face, however it is named.** Figma's Inter in Semi Bold, a file called `Inter-SmBld.otf` and the CSS's `Inter SemiBold` are the same face, so none of them is reported as a different or missing font.
- **How it is put together.** Figma's anatomy against the code's, part by part, each with the line to patch:
  - a part Figma always shows that the code renders only on a condition, or one a Figma property shows that the code always renders;
  - a part's text set by hand where Figma sets a text style;
  - corners on one variable in Figma and several values in the code, or the other way round;
  - a different number of shadow layers, and a frame that wraps on one side only.
  Your parity score may fall at first: these differences were always there, and now they are seen.
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
  - What each may hold is compared too. Figma's `label` text property takes words, and a code `label: ReactNode` takes anything, an icon or a spinner included. A swap that takes only some components is held against a code type that names them (`typeof Icon | typeof Spinner`).
  - When your team says which is right (`holds` in `contract.authored.json`), the contract names the side to change.
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
- **On your own stories.** With a Storybook built to files (`storybook build`), each story is a page the values are measured on, after your style guide and your apps: a component drawn nowhere else is measured on its story, with its real content and its own script, rather than as a bare element of its class. A state a story draws is found there as drawn. The capture reads one story of each component before a second of any, up to 40 (`codeReading.storyPages`).
  - **Each story against its own variant.** A story's args say which Figma variant it shows (`size: 'Large'` is `size=Large`). The component's base values are measured on a story that shows Figma's default variant, and every other story is measured as drawn and held to the variant it shows: *`button` → `height (size=Large, story Large)`: Figma `44`, the code `36px`*.
  - **A story Figma has nothing for is named,** never compared: an option Figma does not list, or a state it never draws.
  - **Never read as your code.** The built Storybook is Storybook's own bundle: the lint and every other reader of your code pass over it, as they do `dist`.
- **With your own React.** A React system with React and Vite installed has its components drawn by them, every Figma variant on one page, with their state, context and portals run: a component drawn nowhere else is measured as React draws it, in every mode, rather than from its JSX read as text. Without React or Vite the JSX is read as before. `codeReading.harness: false` turns it off.
- **With or without a structure contract.** What the browser measured is compared with Figma whenever there is a fresh code capture and Figma's structure snapshot. A hand-written structure contract adds its own checks on top, and a system read straight from Figma and its code gets the measured comparison without one.
- **Each mode on what was drawn.** A colour is compared in every mode with Figma's value in that mode. A rule that names Figma's variable counts as a match only where that variable is what draws the colour: a dark theme's own rule that paints over it is named, with the rule that should carry the variable.
- **The same in Firefox and Safari.** Each value is drawn again in Firefox whenever it is installed, and in WebKit, Safari's engine, when Playwright drives it ([Playwright, when it is here](setup.md#playwright-when-it-is-here)) or when you ask for Safari (`rendered.browsers` in `ds-config.json`). Only what differs from Chrome is said: *in Firefox, `.toolbar` → `height` is `54px` (Chrome draws `56px`)*.
  - Chrome stays the browser the contract is held to. A difference in another browser is advisory: yours to decide, never a failure.
  - Nothing is installed for it but the browser. Firefox is driven headless through WebDriver BiDi, and Safari through the WebDriver macOS ships.
  - Safari opens a window while it runs and draws in your Mac's own appearance, so it is off unless you turn it on. Turn on its remote automation once with `safaridriver --enable`.
  - Playwright's WebKit runs headless on any computer and draws in light and dark alike, so it is on by default when it is here.
  - The full list of options is in [`reference/config.md`](../reference/config.md).
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
- **Why each one is there, where the engine can read it.** Who acts follows from the cause:
  - **the code got it wrong:** the record of what Figma and the code last agreed on says the code moved since, or that Figma moved and the code has not followed;
  - **a product is on an older version:** the product's pinned version of the system is behind the system's own, so moving it up may settle it;
  - **kept on purpose:** the team's kept differences, listed apart.
  - Any other is **not sorted**, with the question that would settle it, never a guess. Whether the spec never said, or the system disagrees with itself, is not read yet.

Under its verdict, the summary of a full audit counts the components that pass, drift (an open difference) and were not checked, with the names when there are few. Beside them, `findings.json` holds every finding of every check as one record, with its rule in plain words, its evidence and its verdict.

It is written whether or not you have a style guide, and the summary of every check says where it is.

### The same findings where you already review code

A finding on a page of its own is read less than one beside the line it is about. Add one flag to the audit in your
pipeline and the findings arrive in the surface your team already uses.

| Host | Flag | What you add to the job | What you see |
|---|---|---|---|
| GitHub | `--sarif` | Upload `findings.sarif` with `github/codeql-action/upload-sarif` | Each finding on its line in the pull request, under Code scanning, with a check a branch rule can wait on |
| GitLab | `--code-quality` | Name `code-quality.json` as the job's `artifacts.reports.codequality` | Each finding in the merge request's widget and on the line |

The recipes are in the [CI cookbook](../cookbook/ci-and-hooks.md).

**How a finding finds its line.** From the file and line its own words name, else from the file the catalog says that
component lives in. Some findings are about the system and not a file at all — "3 of 3 semantic tokens have no
description" — and those keep no line. They are carried in the SARIF without one, left out of GitLab's report, which
has no entry without a path, and **counted in the line the run prints**, so a report with fewer findings than the run
found is never mistaken for all of them.

**Severity is the verdict, not a new opinion.** A check that fails is an error, one that only advises is a warning.
What blocks a merge stays your own CI rule.

### The run's result in your team's chat

A scheduled run finishes at night and only the person who looks finds out. Add `--notify` and it posts one line —
what failed, what is open, where to read the whole of it, and a link to the job.

- Put the address in your CI's secrets as `DSE_CHAT_WEBHOOK`. It must be `https`.
- It is read from there and nowhere else. Never `ds-config.json`, never a file, never printed, so a public repository
  cannot carry it.
- It posts one field, `{ "text": "…" }`, which is what most chat services read. If yours reads another, name it:
  `DSE_CHAT_FORMAT=content`. The engine keeps no list of vendors' addresses, so a chat you host yourself works the
  same as a hosted one.
- With the variable unset, the run says what to set and posts nothing.

### Differences you keep on purpose

Some differences are decisions, not mistakes. When your team decides to keep one, [tell Claude](features.md#measure-figma-code-parity) and give the reason.

- It is recorded in `design-system-engine-kept.json` with the reason, who decided and when, and who owns it (`--owner`, else you). Commit it.
- The reason has to say something. One that is too short, only says it is on purpose (intentional, by design), repeats another kept difference's words, or is short and names nothing the difference is about is refused, and you write it again.
- Add `--truth figma` or `--truth code` to say which side is right, and `--review 90d` (or a date) to look at it again later.
- A kept difference never fails a check. It is listed under Kept on purpose, in the differences list and on the component's Parity area, with its reason.
- It is that exact difference that is kept. If Figma or the code changes its value, the difference is open again.
- Only you keep a difference. The AI asks you first, and it never writes a reason for you.
- `--keep` alone lists what is kept. `--unkeep --match <words>` takes one back.

This is not debt. Debt (`--baseline`) is a difference you will fix later. A kept difference is one you decided to keep.

### Every exception says why, and whose

Three things stop a finding from failing a run: a difference kept on purpose, a value `ds-config.json` excuses (`knownHardcodedExceptions`), and debt accepted with `--baseline`. Each is a decision, so each says why it exists, who answers for it and since when.

- **Kept differences** need a reason that says something, and record an owner (`--owner`, else whoever kept it).
- **Excused values** are written `{ "file", "pattern", "reason", "owner", "since" }`. Each run lists the ones with no reason, owner or date, or with a reason that says nothing.
- **Accepted debt** keeps `--reason` and `--owner` on each line it accepts. Each run lists the lines with neither.
- **Adding to any of these waits for you.** The AI asks first, and it never writes a reason for you.

### A rule that reached zero stays at zero

A code or Figma rule most components follow is a warning until your team decides it. Once every component follows it, it is **held**: the next break fails `--construction-check`, as a rule your team decided does. The date it was first followed by all is kept in `contracts/construction.json`, so commit it. Where that file is not on disk (a pipeline that builds the contracts fresh), the check reads the version your repository last committed, and says when it found neither, so a run that holds nothing is seen to. A rule your team answered no to is never held.

### A deprecation has one release of grace

A component or token marked deprecated with a date (`@since 2026-11-01`) or a version (`@since 2.4.0`) warns while products move off it. Once two releases of the system (its git tags) have shipped since then, every place that still uses it fails the run, each one named with what replaces it. A deprecation with no date only warns.

### Which layer each finding belongs to

A change is checked three ways, and the report keeps them apart:

- **Rules.** The engine answers yes or no, the same every time. Every gate is one.
- **Guidance.** A model reads the change against what your team wrote (`--judge-a11y`), for a person to confirm.
- **Taste.** How it looks and reads. Only a person in a review can call it.

Each finding in `findings.json` says its `layer`, and what its check did with it (`does`): **prevents** (the hook held the edit), **catches** (it fails the run) or **advises** (it is said, and stops nothing). The end of each run's summary says what each layer answered and what is left for the reviewer.

### Nothing passes by accident

- A check that had nothing to read shows **Not run** with the reason, never Pass.
- What a check cannot see is listed as not comparable, with the reason, not as a difference.
- Every check is tested with a mistake planted on purpose.
- Every check that can be written another way is tested with legal work written that way too: a colour as `rgb()`, a hover guarded with `:not(:disabled)`, a transition in its longhands, a time in seconds, a shadow without its zeros. It must say the same as it does of the usual way. A check that refuses legal work is fixed, never the work.

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
| `versionLockStrict` | a Figma file saved again since its snapshot was taken |
| `screenElementStrict` | an element on a screen the code never builds |

**Stops the merge until you ask for less.** On unless you turn them off. Set the key to `false` to make the finding advice:

| Setting | What it decides |
|---|---|
| `renderedParityStrict` | what the browser draws against what the design says |
| `screenComponentsStrict` | a designed screen built from something other than the system |

Every other check always fails on its fault, and nothing in your configuration excuses it.

**Why this is written down.** A check nobody tried against a fault is a promise, not a check — and a check whose strength nobody recorded is a promise of unknown size. Teams plan around what a gate will stop; the honest answer is sometimes "advice, until you ask for more". The table is read from the code itself, so a new setting cannot be added without appearing here.

### The rails an agent meets while it works

The checks above judge a run. The rails judge an agent's edit as it is made, and each one is tried the same way: an edit that is right, which must pass, and one built to break it.

| Rail | What it is | Tried against | Gone around by |
|---|---|---|---|
| The guard | **Holds the edit** before it is made, until a person answers | a token the theme did not declare · an option a component does not have · a shared token's value changed · a Figma capture written by hand | `hooks: false` |
| The edit check | **Notices**, once the edit is made | a colour no token holds · a prop value no component takes · a check switched off in a comment | `hooks: false` · `editCheck: false` |
| Its accessibility rules | **Notices** | a button with only an icon and no name | the two above · `a11yStatic: false` |
| Its copies | **Notices** | a component copied rather than used | the two above · `systemHealth: false` |
| The stop check | **Notices**, before the agent's answer goes out, twice at most | a value the system does not have left in a changed file | `hooks: false` |

Only the guard stops anything. The rest tell the agent at once, and the edit is already in the file. The settings that go around a rail are read from the rails' own code too, so a new one cannot be added without appearing here.
