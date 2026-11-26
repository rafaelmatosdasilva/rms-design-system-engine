# Documentation

How the engine writes each component's contract and gathers the intent layer. What each part promises, and what to ask for it, is on the [features page](features.md#documentation). All pages: [technical documentation](README.md).

**On this page**

- [Write component specs](#write-component-specs)
- [Maintain usage guidelines](#maintain-usage-guidelines)

## Write component specs

Each component gets a contract, rewritten from Figma and the code on every run: its props, variants, states, tokens and the components it nests. `contracts/llms.txt` is the one file AI tools read.

### What a contract says it is for

A contract's `description` comes from the first source that says what the component is for:

1. Your own words in `contract.authored.json`.
2. Its page in your intent layer: the first paragraph of what it is for.
3. Its code: the comment on the component in its own file. That is a Vue file's opening `<!-- … -->` or the doc comment above its `export default`, Svelte's `<!-- @component … -->`, or the doc comment right above a React or TypeScript component.
4. Its description in Figma.

`descriptionFrom` says which one it was: `authored`, `intent`, `code` or `figma`.

- **Nothing says?** The description is a placeholder ("captured from Figma") and there is no `descriptionFrom`. The audit counts it as a component with no description and lists it.
- **Published into the intent layer?** The page is linked, never copied back as the description.
- **Licences and lint switches** at the top of a file are not a description.

Each prop says what it is for the same way. A Figma property paired with a code prop takes its `description` from:

1. Your words in `contract.authored.json` (`propDescriptions`).
2. The code: the doc comment (or the `//` lines) right above the prop, in a Vue props object, a `defineProps` type or a TypeScript interface. Else what the component's own comment says of it (`@size {String} …`), or docgen's description.
3. Figma, when the code says nothing.

A prop only the code has (`codeOnly`) carries the code's description too.

### What your Storybook already says

A team with Storybook has already written much of a spec there. With a Storybook built to files (`storybook build`), the engine reads each story file as you wrote it, never Storybook's generated props table, which only repeats the code.

- **Prop descriptions.** A prop the code leaves undescribed takes its description from the story's `argTypes`, marked as Storybook's. The code's props, types and defaults still come first.
- **The component's description.** `parameters.docs.description.component`, when the code has no comment of its own.
- **Its status.** A `deprecated` tag marks it deprecated, and `beta`, `alpha` or `experimental` marks it experimental, when nothing else sets one.
- **Its stories.** Each one is kept in the contract with the args it is drawn with, as a worked example.
- **Where they disagree.** A prop Storybook describes that the code no longer has, an option one side lists and the other does not, or a default that differs. Each is said with both sides: *`label`, a different default (Storybook says `Go`, the code has `Continue`)*.
- **Each disagreement, a change to make.** On the component's Documentation, each one is a change in the story file or the component, open until the two say the same, and counted with the rest of what its documentation needs. One with Figma in it asks you which side is right first.
- **Read once a build.** The reading is kept in the engine's output folder until the Storybook is built again. `storybook.docs: false` in `ds-config.json` turns it off.

### Props that say nothing, and drafts to approve

A prop none of those sources describes is listed, with where its description goes.

- **Where it is listed.** On the component's Documentation area in the control center (What each prop is for), and in the audit's contract completeness line. `--contract-completeness` lists each one.
- **Where it goes.** The comment above the prop in its code file, with the file and line. A Figma property no code prop is goes in `contract.authored.json` (`propDescriptions`).
- **A draft for each code prop.** One plain sentence from what the engine knows for sure: its type and values, its default, the Figma property it pairs with, the Figma properties that set it, and how often its uses set it. Nothing more: "Size of the chip: s, m or l. Default m."
- **As a patch.** The drafts are written to `.design-system-engine-out/handback/prop-descriptions.diff`. Each one goes above its prop in the file's own style: a doc comment in a Vue props object, a `defineProps` type or a TypeScript interface, or a line in the component's own comment when that is where its props are described (`@size {String} …`).
- **You approve.** The Documentation area shows the drafts as Drafted, to approve, with the request to copy into Claude Code. The patch is applied only when you ask. The next run reads the comments back into the contract.
- **From the terminal.** `rms-design-system-engine --prop-descriptions` lists every prop that says nothing, with its draft, and writes the patch. Add component names to list only those.

### Its element, said once

`semantics.element` and `accessibility.element` always name the same element: yours from `contract.authored.json`, else the one the code's markup starts with. Where it was read is in `accessibility.element.from`. A role you write as `semantics.aria.role` is `accessibility.role` too.

### Where it lives

`livesIn.products` lists the products whose code uses the component, each with a name:

1. The product's name in `ds-config.json` (`products` with a `dir`, `pluginDirs`, or `paths.plugins` for `apps/<app>`).
2. Else its folder, for an app or package nobody listed (`apps/`, `plugins/`, `products/`, `packages/`). A package that holds the system's own components is the system's.
3. Else `this project`, marked `own: true`: the files outside every product.

### Contracts of components that are gone

A run of every component takes out the contracts it wrote earlier for components it no longer writes: gone from Figma and the code, renamed, or written before contracts had a `name`. Left there, they read as components the system still has.

- **A run of some components** (`contracts.only`) leaves the others alone.
- **A contract written by hand** in the same folder stays: only the engine's own files (they carry `x-design-system-engine`) are taken out.

### Colour pairs, not a shortlist

For every text and icon colour, the engine works out the one surface it was made for, reading the names (`content/on-interactive` goes with `surface/interactive`) and confirming it against the values. The pair goes into the contract, into `llms.txt` and into `--query`, so an agent is given the answer instead of every surface that would work: given only a shortlist, it picks a different grey on every card. An edit that puts a colour on another surface is told so at once, with the contrast the two actually give. And a pair whose names promise what its values break (white on a warning yellow) is reported as what it is: the system's own words against its own numbers.

### What a screen reader is given

Each contract's `accessibility` says what a screen reader gets from the component, so an agent builds it right the first time.

- **Its role.** What it is announced as: `button`, `link`, `textbox`.
- **Its name.** How it is given: `content` (what it holds), `prop:label` (the words of that prop), `aria-label`, `labelledby`, `label`, `alt` or `title`.
- **Its states.** The ones it announces: `aria-expanded`, `aria-pressed`, `disabled`.
- **Its focus and keys.** Whether Tab reaches it (`focusable`), and the keys it answers (`keyboard`: `Enter`, `Space`, `Escape`).
- **Each state that differs.** `byState` lists a state whose facts are not the rest's, with what tells it apart (`Disabled: True`: Tab passes it by, no keys).

Each fact says where it came from, and none is guessed:

| `from` | What it means |
|---|---|
| `measured` | The control center's build tried every variant in a browser. |
| `code` | Read from the component's own markup, with no browser. |
| `figma` | Its role annotation in Figma. |
| `authored` | Written in `contract.authored.json`. |

- **The browser first.** It is what the code really gives. The team's own word on the role (`authored`) still comes first.
- **Nothing lost.** Where another source says otherwise, it is kept beside it (`differs`): a toggle button in Figma that the browser finds a plain button says both.
- **The code makes the name exact.** The browser says a button is named by its content; the code says that content is the `label` prop, so the name is `prop:label`.
- **Where it is kept.** The build writes what it measured to `.design-system-engine-out/a11y-facts.json`, and the next contract build reads it. `measuredAt` says the day.
- **Without a browser.** The facts come from the markup alone, marked `code`. What the markup cannot say (a root that is another component, a role set by an expression) is left out.

### Pairs the engine suggests, for you to confirm

A Figma property that no code prop is paired with may still have a near name in the code: Figma's `Content` and the code's `contentList`. The engine never pairs them on its own. It asks.

- **Where it asks.** `rms-design-system-engine --prop-pairs` lists each pair, and the component's Parity area shows it on the Figma property's row, with a yes and a no to copy.
- **A yes.** `--prop-pair <component> "<Figma property>" yes` writes the pair into `contract.authored.json` (the component's `bindings`). The next contract pairs them, with the code prop's type, description and default, and its values mapped where both sides write them with the same letters (`Large` and `large`).
- **A no.** `--prop-pair <component> "<Figma property>" no` keeps the answer there too (`declinedPairs`), so the same pair is never asked again, in the contract or by the props check.

### The tokens, in DTCG's official version

The contracts' tokens are one dictionary, `contracts/tokens.json`, in the W3C Design Tokens format. It follows that format's official version, [2025.10](https://www.designtokens.org/tr/2025.10/), the first stable one, published on 28 October 2025.

| Type | Written as | For example |
|---|---|---|
| Colour | its colour space, its components, an alpha when it is see-through, and a hex fallback | `{ "colorSpace": "srgb", "components": [0.0392, 0.5176, 1], "hex": "#0a84ff" }` |
| Dimension | a number and its unit, px or rem | `{ "value": 24, "unit": "px" }` |
| Typography | the font size as a dimension, the weight as a number, the line height as a multiple of the font size | `{ "fontSize": { "value": 16, "unit": "px" }, "fontWeight": 600, "lineHeight": 1.5 }` |

- **A value no format of 2025.10 holds is kept as written.** A colour CSS spells another way (`color-mix()`), and a size in `%` or `em`, are left as the design file gives them.
- **A reference stays a reference** (`{color.blue}`).
- **What you read is unchanged.** Whatever the engine shows you or an agent says the value as CSS writes it: `#0a84ff`, `24px`. The Style Dictionary and Tokens Studio files carry the same text their formats always held.
- **The same tokens from the control center.** The Tokens page saves them in three formats, made from one dictionary when the page is built:

| Download | What it holds |
|---|---|
| DTCG | Every token of Figma's variables, at its Figma name's path. An alias is the reference to its token. Every mode of its collection, its collection, what it styles and its name in the code are under `$extensions` (`com.rms.design-system-engine`). A word or a yes or no, which DTCG has no type for, keeps its value with no `$type`. |
| Tokens Studio | A set per collection. A collection with modes has its first mode in its own set, a set per other mode with only what differs in it (`Theme/Dark`), and a theme per mode that turns them on. |
| WordPress | A `theme.json` (version 3): colours, font sizes, font families, spacing, radii and shadows as presets, each named by the code's variable when there is one. A border, a duration and every other token go under `settings.custom`. A font size with a value per screen width is fluid. The other looks (Dark) are style variations, which [the WordPress view](#the-whole-system-in-a-wordpress-theme) writes beside it, with your components as its styles. |

- **Two tokens at one name.** A token where another one's group already is (or the same name in two collections) cannot be in one file. It is left out of the downloads, and each button's hint names it.
- **Watched like the other standards.** Its version is pinned in `lib/dtcg.mjs`. A newer one moves the writer through a pull request.

### The whole system in a WordPress theme

Beside the contracts, `contracts/wordpress/` holds your system as a WordPress theme's files, for a team whose site is a WordPress theme. Like the DSDS and open specs views, it is written again on every run. It holds only what `theme.json` can say: no PHP, and no block of its own.

- **The tokens** come from the same dictionary as the Tokens page's downloads, so both give the same answer.
- **The components** come from their contracts, the same facts the other views read.

What it writes:

| File | What it holds |
|---|---|
| `theme.json` | Each token's first mode. Colours, font sizes, font families, spacing, radii and shadows are presets the block editor offers by name. Everything else goes under `settings.custom`, as `--wp--custom--…` variables. Each preset's slug is the code's own variable when there is one. Your button, link, headings, caption and citation are WordPress's own elements (`styles.elements`), and your divider, quote, table and disclosure its own blocks (`styles.blocks`), each styled with those presets. |
| `styles/<mode>.json` | A style variation for each other mode a site switches to: Dark, High contrast, a second brand. It holds only what differs in that mode. A list it holds (the palette) is whole, because a variation's list replaces the theme's. The Site Editor offers each one under Styles. |
| `styles/blocks/<name>.json` | A style of a block (WordPress 6.6) for each other look of a button, a divider, a quote, a table or a disclosure (Outline, Secondary), and for each such component after the first. The editor offers each one by name. |

How a component becomes a style:

- **Where it goes.** Each component goes where WordPress keeps that thing, read from the element its contract says:

  | Element | WordPress's place |
  |---|---|
  | `button`, `a`, `h1` to `h6` | its button, link and heading elements |
  | `figcaption` or `caption`, `cite` | its caption and cite elements |
  | `hr` (or a `separator` role), `blockquote`, `table`, `details` | its Separator, Quote, Table and Details blocks |

  A button and a link with no element in the contract are known by their name (`buttonPrimary`). Every other place is read from the element alone, so a `quoteCard` that is a `div` is never taken for a quote.
- **What it holds.** Its padding, corner radius and type style from its anatomy, and its fill, text and border colours from what its default variant paints with. Each token is the theme's own preset (`var:preset|color|brand-fill`), else its `--wp--custom--…` variable, else its value. So a change in Figma reaches every style through its token.
- **Its states.** Hover, focus and pressed become `:hover`, `:focus` and `:active`, holding only what changes. A link's visited state becomes `:visited`. `theme.json` takes a state on the button and the link only, so a state of any other place is said rather than written where WordPress would not read it.
- **What has no place is said.** A chip, a tab or a field has no core block or element in WordPress, a disabled state has no place in `theme.json`, and neither does a height. The run lists each one with why, and nothing is dropped in silence.
- **One place among several is not none.** A `pre` is WordPress's Code block or its Preformatted one, and an `img` its Image block or its Avatar. The element does not say which, so the run says WordPress has both and the choice is the team's, and never that there is no place for it.

How modes are carried:

- **A look is a style variation.** Light and Dark, or two brands, are modes a site switches between, so each other mode gets a file of its own.
- **A screen width is fluid.** Modes named for screens (Phone, Tablet, Desktop, or a number of pixels) are one value growing with the screen. A font size gets `fluid` from its narrowest screen's value to its widest's, so WordPress scales it between them. Every other font size says `fluid: false`, since turning fluid on would scale them all.
- **What no file carries is counted.** A spacing with a value per screen has no fluid form in `theme.json`, so the first screen's value is written and the run says how many there are.
- **Radii need WordPress 6.9.** That is the version that added radius presets (`settings.border.radiusSizes`).
- **Proven in a real WordPress.** The suite loads the view into WordPress itself (WordPress Playground, the pinned version in `test/wordpress-real.test.mjs`) and reads back what it resolved: the presets, the style variations, the Button block's styles, and the CSS it writes for the button, its hover, a fluid size and an Outline look.

Making it on request:

- **Asked in Claude Code, Figma is read first.** "Export the Figma tokens to WordPress" reads Figma's variables and components again, then makes the view. When Figma cannot be read in that session, you are told, and the view comes from the last capture.
- **Only Figma is needed.** The view is made from Figma alone, so a folder with nothing set up needs one answer: the Figma link, never asked when the request gives it. Setup then runs in that folder (built from Figma when it holds no code) and the view is made right after. A folder named in the request is the theme's, for the patch. Say it as you like: in quotes, with a space (`~/Local Sites/acme/…`), from `wp-content/`, or as its `theme.json`. In a project set up from its code alone, you are asked for the link before anything runs, and only the Figma file the engine reads changes.
- **A system built from Figma alone keeps its colours.** With no code to read, each component's colours per variant come from the Figma capture itself, so its button still gets its fill, its text and its hover.
- **The command alone reads the capture.** `rms-design-system-engine --wordpress` makes the contracts and the view again from the Figma variables the engine last captured, and the run says their date. After a change in Figma, read it again first (`--refresh-figma`).

Your theme is changed only when you choose it. Give the command the theme's folder, or set `wordpress.theme` in `ds-config.json` (see [the configuration](../reference/config.md)), and it compares the theme's own `theme.json` and `styles/` with these files:

- **You are asked which you want.** Asked in Claude Code with a theme's folder, you are asked every time whether to change the theme itself or only get the patch, whatever words the request used.
- **A patch to apply.** `contracts/wordpress/theme.diff` brings the theme in line. Apply it in the theme's folder with `git apply`.
- **Or applied for you.** With `--apply`, the theme's files get what the patch says, and the patch stays as the record: `git apply -R` with it, in the theme's folder, puts the theme back as it was.
- **Everything else is kept.** Templates, layout, a font's files, the names the theme gave its presets and every style the system does not write stay as they are. The theme's own indent and line ends are kept too, so the patch holds only what changed.
- **What only the theme has stays.** A preset Figma does not have is kept and named in the run's lines, for a person to add to Figma or remove.
- **Every audit checks it.** With `wordpress.theme` set, every audit writes the view and the patch again, and never applies it. A theme in line with Figma gets no patch.

### The whole system in DSDS too

Beside the contracts, `contracts/dsds/` holds your system in [DSDS](https://designsystemdocspec.org), for a team that documents its system in that format. It says what the engine knows and links the rest, as DSDS asks: the contract as each component's spec, the code file as its source, the Figma component, and your own pages, whose guidance is never copied back.

What it holds:

| File | What is in it |
|---|---|
| `system.dsds.json` | The index: your system, the platforms it ships on, where its code is (`sourceRoot`), the shared rules, and a link to every other file. |
| `components/<id>.dsds.json` | One file per component: its variants and states, what it nests and the tokens it paints with, what to use instead, what never goes with it, and its status. |
| `tokens.dsds.json` | One entry per token, pointing at its place in `tokens.json` (its value is never copied), and one theme per mode. |
| `patterns/`, `flows/`, `foundations/` | One file per page of your intent layer, linking the page and naming the components it uses. |

Each part, in DSDS's own terms:

- **Tokens.** Each points at its place in the DTCG file with a JSON Pointer (`../tokens.json#/text/primary`). A text colour lists the surfaces it reads on at 4.5:1 or more as a `combo`, and the one it was made for.
- **Themes.** One per mode, when your system has two or more. The first holds each token's own value, and each other one `extends` it. Light and dark say their `colorScheme`.
- **What never goes together** is a `combo` on the component, at `must-not`, where the other component has an entry. One the view has none for stays a sentence in its guidelines.
- **Shared rules.** How your system builds a component in Figma and in the code (`contracts/construction.json`) is written once, in the index's `shared` list. A rule every component follows is a `must`, one most follow or your team decided is a `should`, and one still to decide is left out.
- **The status on each platform.** A component Figma has and your code does not yet is `planned` on each platform the system ships on, beside its own status.
- **A uuid that survives a rename.** Each component, page, theme and token gets one, made from what stays when a name changes: the Figma node, the code file, the page's file, Figma's own id for a variable or text style. When one of those changes too, the uuid the last build wrote is kept while any other still matches. A token gets its uuid once Figma is read again with this version (the read keeps each variable's id, and `tokens.json` carries it), and a token read through a route that gives no id has none.

Every file it writes passes DSDS's own schema for the version it is written in, and DSDS's own reference validator over the whole view:

- **A deprecated component or token** says why (`deprecationNotice`), and a component names what replaces it (`replacedBy`).
- **Each link** uses a `rel` DSDS names: `design` for the Figma component, `relates-to` for your page, `file` from the index.
- **Each pointer resolves.** A component's `uses`, a combo and a pattern's components name only entries the view has.
- **Each value of a variant** is an object of its own, with a description.
- **An id** is in the form DSDS allows. A Figma name with a space keeps its words, joined by a dash (`Show icon` becomes `Show-icon`).
- **The engine's own fields** sit under one namespaced key in `$extensions`.

**Written in your version.** Your intent layer is read in the DSDS version its files declare, never asked to move. The view is written in that version too when the engine has been tried against it: 0.23.1 (the version it is pinned to), 0.23.0 and 0.22.0. A version before 0.23.1 has no `uuid` field, so the uuid is kept under the engine's key there. Any other version gets 0.23.1, and the run says so in one line, since tools made for it may not read the view.

**A new DSDS release is tried before the engine moves to it.** DSDS is before 1.0, so a minor release may break. Once a week a job looks for a new release, tests the engine against it and opens a pull request. Until a person merges it, nothing changes. See [Keeping up with DSDS](development.md#keeping-up-with-dsds).

### The contracts in the open component specs format

`contracts/specs/` holds the same components in the open component specs format (schema 0.39), for a team that specifies its components that way. One spec per component, and `index.json`. `--contracts-out` publishes it too, in `specs/` beside the contracts.

Each spec says only what the contract knows:

- **Where Figma holds it.** Its page and node, and whether it is a set of variants or one component. The page comes from the Figma capture; a component captured before the engine read pages gets it on the next capture.
- **Its anatomy.** The frame, the frames inside it that Figma lays out, the text layer each text property writes, the instance each swap swaps, and each slot.
- **Each part's class in the code.** A part named in Figma (Label, Icon leading) is paired with the class the component's own file puts on it, when one class is that name (`.label`, `.btn__icon-leading`). A part with no such class, or two, stays unpaired rather than guessed.
- **Its props.** Each with its type, its values and its default. A variant of False and True is a boolean. What the code calls the prop, and how it writes Figma's values, sits beside it.
- **Its styles, as tokens.** The frame's padding, gap, corner radius, height and type style. Its fill and stroke in the default, and what each variant paints differently. A text colour goes on the text only when the component has one text property.

Anything else is left out, never guessed: where a part sits, a part whose kind the contract does not know, a text colour with several texts to choose from. The index says what each spec leaves out. It also links each spec to its contract, its code file and its Figma component, so nothing is copied twice.

A test holds every spec the demo builds to a schema written from the format's published types, where each prop must read as exactly one kind.

### Sent to GitHub or GitLab

`--contracts-out` with no folder sends the contracts to the team's contracts store (`--store contracts.write=<GitHub or GitLab link>`), as one commit.

- **One per component.** Published, the contracts are one per code file. A system that keeps several components in one file sets `contracts.layout` to `"name"`, for one per component name.
- **The default branch, unless you name one.** With no branch in the setup, they go to the repository's default branch, by the name the host gives it.
- **What you may push is the host's to say.** On GitLab, a protected branch gets a merge request. On GitHub, it refuses as it would from your terminal, and the run says what it said.

### Code Connect drafts

The engine reads the Figma Code Connect files your project commits: each code prop and the Figma property it reads, a property that only decides whether another is written (in either form), and, in the template form, what fills a slot between the component's tags. A text or a swapped instance written into a slot the code has pairs with that slot. For a component that has a contract but no Code Connect file, it can draft one: `rms-design-system-engine --code-connect-draft` (see [Commands](features.md#write-component-specs)).

- **From what the contract pairs.** Each Figma property's code prop, an enum's values as Figma and the code write them, the booleans, the texts, the instances it swaps, and a switch that decides whether another prop is written.
- **Slots filled.** In the template form, what fills a slot is written between the component's tags: the default slot's content as it is, a named slot's in the element its framework uses (`slot="icon"` for a web component, `<template #icon>` for Vue), guarded by the property that decides whether it is filled.
- **React's named slots are props.** In a React draft, a named slot is written as the prop it is (`<Card header={…}>`), in either form, and the property that decides it wraps it or guards it.
- **Swapped instances and Figma slots, the documented way.** A swapped instance is `figma.instance('Icon')` in the classic form, and in the template form `getInstanceSwap('Icon')`, written as what its own Code Connect renders (`icon?.executeTemplate().example`; `renderProp` for a React prop). A Figma slot property is `figma.slot('Body')` or `getSlot('Body')`. Both need a recent Code Connect CLI.
- **Conditions in the classic form too.** A property that decides whether a prop is written wraps the call that fills it: `figma.boolean('Show caption', { true: figma.string('Caption'), false: undefined })`, the other way round when it decides it off, or an enum on the option it decides it under.
- **In the form you already use.** The classic `figma.connect` form or the template form, whichever your own files are in. With none yet, React gets the classic form and Vue, Svelte and web components the template form. `--form=classic` or `--form=template` picks one.
- **Marked as a draft.** Its first lines say so. Whatever the contract does not settle is a TODO comment where it goes: a value the code does not list, a Figma property no code prop is, the import.
- **Never in your code.** The drafts go to `.design-system-engine-out/code-connect-drafts/`, in the same folders as each component's file. A person checks each one, moves it beside its component and publishes it with their own Code Connect tooling.
- **Read back before it is written.** Each draft reads back through the same reader the engine uses for your Code Connect files, to the same pairs it was written from (a test holds it to that).

### Variable names in Dev Mode

Each Figma variable can be given its name in the code (its CSS custom property), so a developer inspecting a frame in Dev Mode reads the token they will write. It is written once you say yes, and can be taken back. Components reach their code through [Code Connect](#code-connect-drafts).

### Contract changes on a merge request

A merge request (GitLab) or pull request (GitHub) can show what it changes in the component contracts, before anyone merges it.

- **What it compares.** The contracts built from the merge request's code with the base branch's. The base is what the last build on the base branch kept, or the contracts you published last (`--base <folder>`).
- **Per component.** The props, options, states, slots, code props, events and tokens added, removed or changed.
- **What breaks.** A prop, an option or a state removed, a default changed, or a whole component removed. These are the same rules the engine uses to record a release.
- **Who uses it.** The products that use each changed component, with how many files, and the system version each product is on.

A breaking change is accounted for when any of these is true:

- A person signed it off: `rms-design-system-engine --sign-off "breaking change to cardTile" --by "<who>"`.
- It is recorded as a release in `design-system-engine-releases.json`, newer than the base.
- The component's own version has a new major in `contract.authored.json`.

What you get:

| Situation | Exit | What it says |
|---|---|---|
| A breaking change nothing accounts for | 1 | Each change, such as `− prop Size options: L (breaking)`, and how to account for it |
| Changes, none of them breaking, or every one accounted for | 0 | Each change, and who signed it off or which release holds it |
| Nothing kept from the base branch yet | 0 | That there is nothing to compare, so it passes |
| No contract could be built from this code | 2 | That nothing can be compared |

- **How strict.** `ds-config.json` `contractChanges.failOn`, or `--fail-on`: `unaccounted` (the default), `breaking` (any breaking change fails) or `never` (it only reports).
- **For the merge request.** The same report is written to `.design-system-engine-out/contract-changes.md`, ready to post as a comment.
- **A rename, with its way across.** A prop gone and a prop new holding the same type, options and default are read as one prop renamed, and a value moved in place in a prop's options as one value renamed. For each:
  - the system keeps the old name as a deprecated alias, with a warning, until its next major version, which removes it
  - each product that still writes the old name gets a patch that writes the new one (`handback/renames-<product>.diff`), and the system's own pages get `handback/renames.diff`
  - `handback/renames.md` counts the places each product still has on the old name
  - nothing is applied: a person applies each patch in its own folder
- **It only reports.** It never changes your code. Your pipeline decides what a failing exit stops.

#### Set it up in CI

Two steps:

1. **On the base branch**, keep each build's contracts: `rms-design-system-engine --contract-changes --record`. It writes `.design-system-engine-out/contracts-last-build.json`.
2. **On each merge request or pull request**, compare: `rms-design-system-engine --contract-changes`.

GitLab (`.gitlab-ci.yml`):

```yaml
.contracts:
  image: node:24-bookworm
  before_script:
    - git clone --depth 1 https://github.com/rafaelmatosdasilva/rms-design-system-engine.git ../engine

contracts-keep:
  extends: .contracts
  script:
    - node ../engine/audit.mjs --contract-changes --record
  artifacts:
    paths: [.design-system-engine-out/contracts-last-build.json]
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH

contract-changes:
  extends: .contracts
  script:
    - mkdir -p .design-system-engine-out
    - 'curl -fsSL -H "JOB-TOKEN: $CI_JOB_TOKEN" -o .design-system-engine-out/contracts-last-build.json "$CI_API_V4_URL/projects/$CI_PROJECT_ID/jobs/artifacts/$CI_DEFAULT_BRANCH/raw/.design-system-engine-out/contracts-last-build.json?job=contracts-keep" || true'
    - node ../engine/audit.mjs --contract-changes
  artifacts:
    when: always
    paths: [.design-system-engine-out/contract-changes.md]
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
```

Before the base branch keeps its first build, nothing is fetched and the check passes, saying so.

GitHub (`.github/workflows/contract-changes.yml`):

```yaml
name: contract changes
on:
  push:
    branches: [main]
  pull_request:
jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - run: git clone --depth 1 https://github.com/rafaelmatosdasilva/rms-design-system-engine.git ../engine
      - uses: actions/cache/restore@v4
        with:
          path: .design-system-engine-out/contracts-last-build.json
          key: contracts-main-${{ github.sha }}
          restore-keys: contracts-main-
      - if: github.event_name == 'pull_request'
        run: node ../engine/audit.mjs --contract-changes
      - if: github.event_name == 'push'
        run: node ../engine/audit.mjs --contract-changes --record
      - if: github.event_name == 'push'
        uses: actions/cache/save@v4
        with:
          path: .design-system-engine-out/contracts-last-build.json
          key: contracts-main-${{ github.sha }}
```

Name your base branch where it says `main`. To post the report on the pull request, add a step that reads `.design-system-engine-out/contract-changes.md`.

### Contracts for patterns and flows

A component's contract says how to use one piece of code. A pattern (Save, Error, Empty) or a flow (Settings) is how several are put together, and that lived only as prose in the intent layer. Each one now gets a contract of its own, written from its page:

- **The components it uses,** only names your system has, in their own spelling.
- **Its rules, each at its level:** must or should.
- **When to use it, when not, and the mistakes to avoid.**
- **Where it came from:** the page it was read from. Edit the page, never the file.

They are written beside the components' contracts, in `patterns/` and `flows/`, as `<page>.pattern.json`: never `.contract.json`, which every reader takes for a component's. A pattern your intent layer no longer has loses its file on the next run. Templates already have contracts of their own, from their code.

### Contract changes in History

Each build of the control center compares the contracts with the ones the last build read, and the History page lists what changed under its own filter, Contracts:

- **A component's contract:** a property, option, state, slot, event or token added or removed, a default changed. A change that breaks a product says so.
- **A pattern's or a flow's:** a rule added or removed at its level, a component it uses added or removed.
- **Only real changes.** A build that writes the same contracts again adds nothing, and the first build only records what it read.
- **Done by a person, never the engine.** Where your contracts are kept in a GitLab store (`stores.contracts`, a project and a path in it, your intent layer's repository included), the author GitLab recorded on the store's newest commit there: the person whose run wrote them, named as your intent layer's commits are. Without a store: in a pipeline, whoever pushed or started it; on your computer, the GitLab account whose token the engine reads with (the token needs the `read_user` scope to say whose it is), else your git name (`git config --global user.name`). A scheduled build names the schedule. A scheduled build names the schedule.

## Maintain usage guidelines

The intent layer says why each component exists, when to use it and when not, and what was decided. It gathers from three places: your own pages wherever they live, Figma's descriptions and notes, and the comments your engineers wrote in the code. The engine writes what it is sure of; what needs judgement is a draft, and a person reviews and approves it.

### How far along each source is

Above the Documentation page's filters, a card for each source its pages come from, in the order of the Source filter: the intent layer, Figma, the contract, the code. A source no page comes from has no card, and no link at the page's top either.

- **A ring of the pages that source documents,** each in the colour of its state there: complete, to review, missing. In its middle, the share complete.
- **A bar per area** (Components, Templates, Patterns and the rest), the weakest first.
- **How it is counted, in its tip.** The mark at the card's top right says it in a few words: the pages documented in that source with nothing left to write there, out of all of them, rounded down.
- **Each source judged on its own part.** A component's documentation is a list of things, each with the place it belongs: its text in the intent layer, its properties in its contract, its tokens' descriptions in Figma. A page is complete in a source when everything that belongs there is written. A page with no such list (a template, a flow) keeps its own state.

### What the engine is sure of, it writes

A project with no intent layer gets everything the Documentation page finds as a list and nothing else, and most of those lines are never carried into a file by hand. Some of them the engine is not guessing at:

- **The element a component renders.** It read the code: a Vue template, JSX, a Lit template, an Angular template or what a plain custom element writes into itself. A component whose root is a `div` is left alone — a box says nothing — and one your team already answered for keeps its answer.
- **A note that repeats the description.** An agent is shown both and reads the same thing twice, which is how a card that could have said something new says nothing.
- **Your product's own first use of a component**, as an example. Certain that the code is real; a judgement that it is the one to show, so it is written as a draft for a person to approve.

These go into `contract.authored.json` — the engine's own file and no other — and only where the project says it may (the `writes` setting above). What needs a person stays a task: a role that is a choice rather than a reading, Figma's annotations, words only a designer can give.

Two lines are never crossed. What is certain is written as final and what is judgement is written as a **Draft:**, never read as your team's word. And nothing a person wrote is ever overwritten: the engine fills what is empty and removes what repeats, and a sentence somebody chose stays as they chose it.

A component's role in the intent layer follows the same line: written as final when its code renders an element that has one (`<button>` is a button), drafted from what the component does when it renders a plain `div` or `span`, and only ever one of the ARIA roles.

A part your team does not want drafted for now is named in `intentLayer.noDrafts` in `ds-config.json` (`["role"]`, by the name your pages head it with). A page that has the part keeps it. Only the drafting stops, until you take it off the list. A draft already waiting is known by what it says too, so a "Role: button" kept under Rules is never offered a second time.

What each list holds (a page's Data lines) is the engine's own, written from the code:

- **It follows the code.** When the code changes what a list's items hold, the old line comes out and the code's new one goes in, as final, in the Markdown spec and the DSDS page alike. It is never drafted for a person.
- **The changes say only what was made.** A line planned for a page that none of its files holds is listed as not found, in the run's summary and in `CHANGES.md`, never counted as changed.

### An example on every page

Rules tell an agent what to do; an example shows it. A page with none gets one, drafted from how the products use the component.

- **The call the products write most.** The engine reads the files the usage map names for it and finds every call. The form most of them take is the example.
- **In the code's own syntax.** Vue, Svelte, JSX, Angular's bindings, Lit's or a plain custom element's attributes, as the component's contract says.
- **Wherever a product writes it.** A custom element's tag counts in a page, an Angular template or a Lit template alike.
- **Only what the contract has.** Each prop, event and slot in it is one the contract names. A class, a directive or a prop the component does not take is left out.
- **None of a product's own data.** A value the prop takes stays. A product's words become `…`, and an expression is named after its prop.
- **Where it came from.** The line above it says how many of the uses take this form, and the file, line and product it was taken from.
- **Your own story, when no product uses it.** A component with a Storybook story and no use in a product takes its first story as the example, with the story's args, said as the team's own story.
- **A draft.** It goes under Examples, in the page's own format: a code block in a Markdown page, a block of text titled Examples in a DSDS page. Dropped, it goes whole, code and all. A component no product uses keeps the example written from its own code.

### Deciding a page's changes

A page's panel on the Documentation page holds every change it asks for, in groups. Each group has its own heading and count.

| Group | What is in it |
| --- | --- |
| New text for the page | Its drafts, each once, under its section |
| Changes to rules | The guards and rewrites its rules propose |
| Decisions about the page | Its other proposals: a page to write, a name to keep, a part's page, a page or a decision to review again |
| Other changes | What is still to write, a part's page to move, notes no agent reads |

- **Three actions per group, under its proposals.** Approve all, Change and Drop all, for everything the group proposes (never a change it has no ground for). Each copies its decision in plain words for you to paste into Claude Code ("Approve all 3 drafts"). No item has an action of its own. What you leave stays as it is.
- **One draft per section.** The engine drafts one line for each section a page lacks, never a second for the same section, and never a line the page already says.
- **Each draft beside its source.** The props it names, as the code has them (its file and the values each takes), and the line it says again, on the page or in Figma's notes or the code's comment.
- **A name only Figma has is flagged.** A Figma property the code does not take, written as a prop, is shown as a warning on its draft. The engine's own drafts never write one: they say what the code does, or call it Figma's.
- **A rewrite is offered for it.** A draft written before that names one gets a proposed rewrite. It calls the property Figma's and says what carries it in the code: a prop of the same name, or the prop or field the code's own comment says shows it. The review shows it under the draft, and listing the drafts in Claude Code shows it too, ready to take as it is or edit.

### Pages to write, most used first

A component with no page gives agents nothing to read. The engine ranks those components by how far they reach: how many products use them, in how many files, how many times.

- **The list.** `rms-design-system-engine --pages-to-write` prints it, most used first. On the Documentation page, each of those components is a row with the status Missing, never Review: its page is still to write. Under Missing they come in the same order, and each row's panel says its rank and where it is used.
- **Filter the page.** Beside the status chips, one for Source (the intent layer, Figma, your contract), one for Status (Missing, Review, Remove, Done) and one for who a row waits on. Each shows All until you choose, says how many rows your other choices would leave, and they combine; Clear filters drops them.
- **Documented elsewhere is left out.** A component documented in another page, a part of another component, and an icon or sub-part that only sits inside a documented component are listed apart, with why.
- **The first ones are started.** Each run that writes the layer starts pages for the first 10 the products use (`intentLayer.startPages`, `0` for none), beside their siblings, as a yes to writing a page would.
- **Drafted from the contract.** What it is for comes from its description, wherever that was read: your own words, the component's own comment in its code, or Figma ([what a contract says it is for](#what-a-contract-says-it-is-for)). When to use it comes from the products that use it, the values its props take, its states and what it holds. Each line is a draft, never your team's words, and each passes the content check first.

### Parts are not components

Some components exist only as pieces of another: a dropdown's row, a table's cell, a chart's legend. Figma and the code keep each one as a component, but nobody places one on its own. Listed beside the others, they read as more components to choose from, and each asks for documentation of its own.

The engine finds them when two things agree. Either the name sits under the other's in Figma (`grid/Row`), or the name carries the other's and the other holds it. A part is shown inside its root, in a Parts area, and leaves the menu and the counts. Its documentation goes in the root's page, under Parts, one section per part, so it can say how that piece is used. Agents are told to place the root.

When only one thing agrees, the engine asks instead of guessing: a card on the component with an answer to copy. [Tell Claude](features.md#maintain-usage-guidelines) and it records the answer in your intent layer, so it is never asked again.

### What the team already decided

Every decision somebody makes is recorded where it is made: a difference kept on purpose with its reason, a proposal answered yes or no, a difference accepted for now, a component checked by hand, a need nothing in the system fitted with what was looked at and why. Nothing gathered them, so a decision was only ever seen by whoever ran the command that made it.

Now they come together in one log, written to `DECISIONS.md` in the output folder. A `DECISIONS.md` your team wrote by hand is read as one more source and never rewritten.

**Your decision records** are read too, one file each in `docs/decisions`, `docs/adr` or `adr` (or the folder set in
`ds-config.json` → `decisionRecords.dir`), each with its status, context, decision and consequences.

```bash
rms-design-system-engine --decision-records
```

- **Kept as a chain.** A record that says "Superseded by" a later one, or a record that "Supersedes" an earlier one,
  links the two. The old one is kept, said as overruled by the new one, and an agent is told it no longer holds.
- **Superseded, never edited.** Once the system has a first release (its oldest git tag), an accepted record whose
  decision was rewritten in place is a finding, with each commit that did it. Moving its status on, or adding the
  link to the record that replaced it, is the lifecycle working and is not a finding. A record written after the
  release is a new decision, not an edit.
- **A record links its contracts, never holds them.** The contracts can change while the decision holds still.

A decision a person makes on purpose lives in your intent layer, on the page it is about: a component's, a pattern's, a template's, a flow's, a foundation's or the system's own. It sits under a Decisions heading, one line each: what was decided, what was ruled out, why, who and when. [Tell Claude](features.md#maintain-usage-guidelines) and it writes the line for you to read first, and sends it to the layer only when you ask.

The control center shows them in **History** (it was the Changelog): one table, a row per change, newest first, of what changed in the code, what changed in Figma, what changed in the intent layer and what was decided. Its columns are Date (the day and time on one line, the release under them), Source (Code, Figma, Intent layer, Contracts, Decisions), What, Affects and Done by. Each commit is a row of its own, with the person who made it and, for the code, the release it shipped in. A commit no release held yet is asked about again once a day, so a release tagged later shows. A chip for each source shows only that source, and an issue with several commits shows them alone in a click. Each component's History area lists the changes to that component.

- **An intent layer change** is a row of its own: what it added apart from what it changed, each on one line, the commit that made it, and the components those pages document. Pages are counted by kind (component pages, other pages named while they are few, token pages), every name a click away (Show all). The engine keeps the last 50 changes it read, in the layer's snapshot.
- **What kind of row it is** (a Decision, a Lesson, a Comment) is the first line of What.
- **Every row names who did it.** A decision already says who answered it. A row that is work instead (a commit to the code, a read of Figma, a change to the intent layer) says who did it, in the same place:
  - **One person:** *Done by* and the commit's author.
  - **Somebody else brought it in:** *Done by* the author, *pushed by* the committer, when the commit's committer is not its author, as when a maintainer merges, rebases or cherry-picks someone else's work. A commit pushed exactly as it was written keeps its author as its committer, so it shows one name: git does not keep who pushed.
  - **A pipeline:** a run started by a push, by hand or by a merge request names the person who started it. A scheduled run has nobody behind it, and GitLab names whoever owns the schedule, so the engine never takes that name: its commit says `Run-by: schedule`, and its row says *Done by the schedule*.
  - **An account:** a host's merge button, an app or an access token's bot is said as *a pipeline*, never as if it were a person.
  - **A read of Figma:** the designers who saved Figma versions since the read before come first, then whoever ran the read. Figma keeps each version with its author, so this needs `FIGMA_TOKEN`; a read through the session's Figma tool names nobody rather than guessing.
  - **A name only**, never an address: the guide is shared with the whole team.

The part that pays is what agents get. A card now carries what was already ruled out and why, and `llms.txt` lists it under Decided against: an agent that does not know a thing was considered and rejected will propose it again, confidently, every time it is asked.

### The copy, held to your content guidance

The engine always checked a prototype's words against the system's own writing rules. Now it also checks them against the content guidance your team writes in its intent layer: a page about content, voice, tone, writing, terminology or wording, or a Writing section on any page. Each rule is your team's own, in your words. The engine adds none.

A line becomes a check when one can hold it:

| Your page says | The check |
|---|---|
| Use "sign in", not "log in" · Avoid "please" and "simply" · Prefer "save" over "submit" | A term to avoid, and what to say instead |
| Buttons start with a verb | A button or link that starts with an article, a possessive, a yes or a no |
| Errors never blame the person | An error, alert or toast that says "you entered", "invalid", "wrong" |
| Write in sentence case (or title case) | A heading or label in the other case |

Each prototype check prints a ✍️ COPY section. Each finding names its rule and the page it comes from, for example: `"Log in" says "log in", which Content says to avoid: say "sign in"`. The findings go into the prototype's check, so the Prototypes page shows it as Fix, each one with a Copy fix. A line no check can hold (sound like a helpful colleague) is never guessed at: the check counts it, for whoever reviews the copy.

Both kinds of prototype are checked: a composition, word by word, and a page of your code, from what its components show (label, text, title, placeholder, and the words inside a button or a link). With no content guidance in the intent layer, the check says nothing. A rule that does not fit a screen is the team's to change on its page, never the prototype's to ignore.

### The states each component owes

- A component's page can list the states it must have, such as error, loading, success, disabled or read-only.
- Write them in front matter as `states: [error, loading, read-only]`, or as a list under `states:`. In a DSDS file, use the entity's `metadata.states`.
- Or write them as a section, if your pages are prose rather than metadata: a heading that says they are required — **Required states**, **States it must have** — and the list under it is read the same way. A plain **States** heading is left alone: that is the list of the states a component *has*, copied from Figma or the code, not the ones it owes.
- Both are read, so a page may use either or both, and a state named twice is counted once.
- The engine looks for each state in Figma and in the code, by what it means and not only by its name.
- In Figma it finds a variant value such as `State=Loading`, or a property that turns the state on, such as `isReadOnly`.
- In the code it finds a prop such as `loading` or `readOnly`, or a rule or attribute the component reacts to, such as `:disabled`, `aria-busy` or `.is-loading`, in the component's own file.
- A state one side lacks becomes a task for that side, on the component's page and in the Tasks, with what the engine looked at.

### Pages to review again

A page is right when it is written. Then its component changes: a prop is added, a value is dropped, a token is renamed. The page still says what was true before.

- **Comments left in Figma.** With `FIGMA_TOKEN` (and its File comments scope), each read of Figma also reads the comments people left in the file. Each thread pinned on a component shows on History and on that component's changelog: what it says, its replies, who wrote them, and whether it is open or resolved. A comment on no component is left out. The engine only reads them; it never posts or deletes one.
- **Figma's own history, asked for.** `--figma-history <component>` says what changed in it between two versions of the file and who saved the versions between; `--figma-blame <component> --property <name>` (or `--layer`) finds the version that brought one in, with its day and author. Both read Figma's versions with `FIGMA_TOKEN` ([the options](../reference/usage.md)).
- **The engine notices.** It keeps each component's props, the values they take and its tokens from run to run. It also reads the code's history and the history of your Figma snapshots, from the snapshots store or from the commits of your own repository. Each commit is read once and kept, so a run reads only the new ones. It never asks Figma or GitLab again for this. The first read of Figma is not a change.
- **The page is marked, not removed.** On the Documentation page its status is Review, Changed since written, with what changed and since when. Agents still read every line, with a note beside it: check it against the contract.
- **A removed name is said.** When the page still names a prop or token the component no longer has, the page says which.
- **Its examples are checked too.** Each call of the component in the page's code blocks may set only props it has today, to values they take. An example is what an agent copies, so one written for an older version is marked Out of date, with the prop or value it no longer has. An expression, an event and a directive are left alone.
- **A person settles it.** Edit the page, or say it still holds. The answer is kept with who gave it and when. The page is not marked again until the component changes again.
- **Decisions too.** An answer the team gave (a part documented in its parent's page, a name kept, a page kept where it is) is dated the same way. When its component changes after it, the decision is marked to review again on its page and in History, and agents read it with the same note. It still stands until a person says. Say it still holds, and it is kept with who and when; withdraw it, and its question is asked again.
- **A component with no page is reviewed too.** When the team answered that a component needs no page of its own, and it changes, the Documentation page gives it a row: Review, Decision to review again, with the same answers. One documented in another page is reviewed on that page's row.

### Evidence first

When the engine proposes an answer to a decision (a page to write, a part to document in its parent's page, a name to keep, a page to review), it lists every answer it could take, each with what speaks for it:

| Where it comes from | For example |
|---|---|
| Figma | Its name sits under another component's |
| The code | Only one other file uses it |
| Products | Two products place it on its own, from the usage map |
| Your pages | The layer already documents other parts in their parent's page |
| Past decisions | The team kept the same name on another page |

Each piece is strong, some or weak. The answer with the most behind it is proposed. When another answer has as much, the proposal says the evidence is split and a person decides.

- **A change to a rule needs more than the engine.** A guard or a rewrite with nothing behind it but the engine's own reading is never proposed as a yes. It is shown with the rest, under a line saying the engine has no ground for it, with No as its answer until you say otherwise. A rule your page marks as a must, or a yes the team gave to one like it before, is proposed as usual.

### Who decides

Everything that waits on a person names the person: from `owners` in `ds-config.json`, by component or by area, with `*` for the rest ([Who owns what](audit.md#who-owns-what)).

- **On the Documentation page,** each row to review says "Waits on" and the name. A chip for each person shows only theirs: "Waiting on Cards team 3".
- **In the audit,** one line counts them: "3 waiting on Cards team, 1 waiting on QA lead".
- **An answer records who gave it.** When that is not the owner, the page and the command say so. The answer still stands; nothing is blocked.

### Your rules, read against each other

Everything written for an agent reaches it at once: your guidelines, each layer of your intent, every component's page and your project's `AGENTS.md`. Written at different times by different people, they start to disagree. The engine reads them side by side and hands you three lists:

- **Pairs that cannot both be followed.** Two rules about the same component where one allows what the other rules out, two counts of it (exactly one, against several), or two places it may only go. Whichever the agent reads last wins, so each pair is a decision nobody has made yet.
- **A rule written twice.** The same rule in two places in different words: two rules to read, one rule to follow.
- **Rules nothing can check.** A rule that names nothing your system has and that no check reads. It may still be good advice, but the agent carries it into every request and nothing can say whether an agent's work followed it.

Nothing is rewritten. Each line comes with both sentences and where each came from, for the person who owns the words, and each component's Documentation page lists the ones about it.

### Two questions agents ask your intent layer

Which token is for this? A token counts as answered when Figma's description, its own entry in the layer or a page that names it says what it is for. An entry that only repeats the token's name, its modes or what it points to is no answer. Is there a component the system doesn't have? The layer must say what to do when none fits, in one rule for every case, or an agent asked for a toast builds its own. Both show on the Documentation page, the second also in the audit's advice.

### Mistakes that look right

The most common mistakes are the plausible ones: a status shown by colour alone, a skeleton that does not match what loads, a submit button disabled with no reason.

- Each line under a page's **Common mistakes** is read as three parts: the wrong use, why it fails, and what to use instead.
- `llms.txt` carries the first two of each component's, whole, beside what to avoid.
- `rms-design-system-engine --mistakes` lists, for each component, the mistakes its kind is known for that its page does not say yet, and each written mistake that leaves out why it fails or what to use instead.
- Those are suggestions to write in your own pages. The engine writes none of them, and no agent reads one until your page says it.

### What a destructive action owes

How much damage an action does decides how it is built:

| Kind | What it owes |
|---|---|
| Can be undone | Runs at once and offers undo, with no confirmation in front of it |
| Can be undone for a while | The same, and says how long |
| Permanent | Asks first, with the safe option selected |

- Write each kind on any page of the intent layer, under a section titled **Destructive actions**, or in a line of its rules: "Deleting a project is permanent", "Archiving a board can be undone for 30 days".
- `llms.txt` lists each one with what it owes, so an agent builds it that way.
- The page review of your product's screens checks each button that does one of them against its kind.
- The same review checks what any reviewer would on any page: no dialog opened over another, one main action in a dialog, and a destructive main action styled as destructive.

### Purposes written into Figma

An agent that reads only the Figma file never sees your intent layer. So the engine can write what each component and token is for into its Figma description, once you say yes.

- **Only what the team approved.** Never a draft, and never a line repeated on every page.
- **Never over a designer's words.** A description Figma already has is kept. If it says something else, you see both.
- **Asked on its own.** Nothing else is written with it, and it can be taken back like any change in Figma ([Taking a change in Figma back](audit.md#taking-a-change-in-figma-back)).

### Lists your intent layer copies

A prop table copied from the code, a whole token family listed by name, or a catalog of components written out on a page is flagged, right today or not, because it goes stale and agents take it for the whole list. Each says which generated file to link to instead: the component's contract, the file its tokens come from, or the contracts. A table that says what each token is for, an order of components, or a few picked out with a rule is guidance and left alone.

### Who each section is for

A DSDS page says who each section is written for: everyone, people or agents (`for`).

- **For agents alone.** Agents get it: in the contracts, the design intent and the checks. The control center's pages leave it out, since it is written for a machine.
- **For people alone.** It shows on the control center's pages, and agents get it too. DSDS says an agent reads everything.
- **For everyone.** Both, as any page without the mark.

### Links inside your pages

A DSDS page can link to another entry inside its text: `[focus visible](dsds:shared-a11y#focus-visible)`, or `<dsds:button>`.

- **Written as words.** Agents and the control center read the link's own words, or the name of what it points at for `<dsds:…>`. Nothing reaches them as a link that leads nowhere outside the layer.
- **Checked like any other reference.** A link to an entry the layer no longer has, or to a part it no longer has (an item, a trait or one of its values), is a finding with its page and where it is: Links to nothing. A rename never leaves your guidance pointing at nothing without anyone noticing. `--check-intent` lists it, and the control center shows it on the page.

### Where each page came from

A DSDS page can say how it was written (`metadata.origin`: by a person, with help, or generated) and who reviewed it and when (`metadata.reviewed`).

- **Agents weigh it.** A page a tool or model wrote that no person has reviewed reaches agents with a note: where Figma, the code or a page a person wrote says otherwise, follow them.
- **Your approvals are kept.** When you approve or rewrite drafts on a DSDS page (`--review-drafts`), the page says it was written with help and records your review: who (`human:<your git name>`, or `--by`) and the day. A page a tool wrote stays marked generated, reviewed. A dropped draft is no review.
- **The engine's own view says it too.** Every entry of the DSDS view under `contracts/dsds/` says the engine wrote it from Figma, the code and your pages, and a component's says which of its guidelines are your own words.
