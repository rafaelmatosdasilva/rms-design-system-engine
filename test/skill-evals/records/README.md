# Evaluation records

The runs behind the measurements in `RESULTS.md`, kept as they were scored, so each number can be checked and
summarized again. One folder per measurement; each `.jsonl` file is one side on one model:

- `mcp`: Claude with the Figma MCP alone (no skill, no engine, no hooks).
- `cookbook`: Claude with the Figma MCP and the skill (the guide set measured, the engine, its hooks).
- `g9`: the skill's guide set adopted as g9.

Every row holds the task, the run, whether it passed, each check with its detail, the rules every run keeps, what the
run cost and read, the files it changed and their text. Saved with `record.mjs`, which leaves out private tasks,
packages a run installed and anything past 40 KB in one file; transcripts stay out of the repository.

| Folder | What it measured | In RESULTS.md |
|---|---|---|
| `2026-10-02-guide-g9` | The skill's 20 guide tasks on the demo project, Sonnet and Haiku (engine 40906c4) | the g9 column of "building from Figma, the misses made deterministic" |
| `2026-10-03-build-sonnet-haiku` | Building from Figma, six tasks: Claude alone against Claude with the skill, Sonnet and Haiku (engine d8fc435) | "building from Figma, Claude with the Figma MCP alone against Claude with the Figma MCP and the skill" |
| `2026-10-03-prototype-sonnet` | Prototyping with the design system, three tasks, Sonnet (engine a425870; the skill side stopped at 6 runs) | "prototyping with the design system, and the guide that adds it" |
| `2026-10-03-opus-haiku-first` | Prototyping (three tasks) and building from Figma on Opus and Haiku, with and without the skill (engines ad08e42, e1c068f) | "prototyping with the design system, and the guide that adds it" |
| `2026-10-03-final-opus-haiku` | The engine at acb7808: six prototype tasks and the six builds on Opus and Haiku, with and without the skill (the builds without it copied from the earlier runs, which do not use the engine), and the 20 guide tasks on Haiku | "prototyping with the design system, and the guide that adds it" |
| `2026-10-03-misses-made-checks` | The misses made checks: six prototype tasks on Opus and Haiku with the skill (engine baeeefe), the six builds again (48bdb04), the 20 guide tasks on Haiku (baeeefe), beside the runs without the skill recorded before | "prototyping with the design system, and the guide that adds it" |
| `2026-10-04-a11y-and-figma-changed` | Two new builds (a stepper with part roles, a Figma change to the built chip) on Opus and Haiku with and without the skill (engines 8998271, 1108c3b, 9fee7af, rescored on 27b2d1f), the disclosure and field with the skill, and the 20 guide tasks on Haiku (27b2d1f) | "accessibility tried on the components' own code, what the design owes, a task the Figma MCP alone cannot finish" |
| `2026-10-04-figma-edits` | The 20 guide tasks and the new `figma-roles` on Haiku (engine 64f93b1) | "Figma brought in line with the code, by the engine, once the person says yes" |
| `2026-10-04-sibling-repos` | The 21 guide tasks on Haiku (engine 7765e76) | "Products in their own repositories, read as the project's code" |
| `2026-10-04-styleguide-system` | The 21 guide tasks on Haiku (engine 681ecf6) | "the style guide is the system's own and is checked against it" |
| `2026-10-04-the-evaluation-a-guide-change` | The 21 guide tasks on Haiku (engine 8082467) | "a stroked icon is not a border, a bound typography variable reads as its scale, the evaluation recorded in one command" |
| `2026-10-04-style-guide-a-size-mode` | The 21 guide tasks on Haiku (engine 3191dd5) | "the modes in Figma's order: the capture records each collection's order" |
| `2026-10-04-style-guide-icons-at-figma` | The 21 guide tasks on Haiku (engine 926750e) | "Style guide icons at Figma's size and name; the capture never measures card thumbnails; a hidden Figma stroke is not a stroke" |
| `2026-10-04-the-browser-check-can-read` | The 21 guide tasks on Haiku (engine 298b82e) | "The browser check can read a ::before or ::after layer, for components that draw their background or lines as their own layers" |
| `2026-10-04-style-guide-figma-s-annotations` | The 21 guide tasks on Haiku (engine 58685ab) | "Style guide: Figma's annotations and slots as documentation, times to the minute, every component centred, any state selectable, a nested component drawn once, overlays open in the playground, component-only tokens in their component" |
| `2026-10-05-guide-loading-the-skill-runs` | The 21 guide tasks on Haiku (engine 53c57b6) | "Guide: loading the skill runs nothing, run the command now; scorer: a token set up in .env is not asked for in the chat; contracts: a component named with a slash gets its own folder" |
| `2026-10-05-style-guide-a-control-the` | The 21 guide tasks on Haiku (engine c8ec2b2) | "Style guide: stand-ins for a control the system lacks; audit: Figma's fill sizing, own minimum height and default variant compared" |
| `2026-10-05-style-guide-each-component-s` | The 21 guide tasks on Haiku (engine 1b60458) | "Style guide: anatomy, usage sections, a menu that hides, worded buttons, the page's own contrast in every mode" |
| `2026-10-05-style-guide-links-figma-the` | The 21 guide tasks on Haiku (engine 6fb1975) | "Style guide: links, changelog, Built with area, sticky area switch, square colours and four columns, numbers-only anatomy, a linked playground, a menu that gives the page the whole width" |
| `2026-10-05-style-guide-status-coverage` | The 21 guide tasks on Haiku (engine 5597eda) | "Style guide: each component's status and test coverage, the overview counting statuses and describing its groups" |
| `2026-10-05-style-guide-inspect-marks-each` | The 21 guide tasks on Haiku (engine 659b70b) | "Style guide: Inspect and Width in the Playground" |
| `2026-10-05-style-guide-inspect-numbers-never` | The 21 guide tasks on Haiku (engine 45caddf) | "Style guide: Inspect numbers apart, a link to each variant, accessibility tried on the live variant" |
| `2026-10-05-style-guide-figma-beside-the` | The 21 guide tasks on Haiku (engine 22050d1) | "Style guide: Figma beside the code, what uses each token, props in search" |
| `2026-10-05-style-guide-every-box-has` | The 21 guide tasks on Haiku (engine fc83ee2) | "Style guide: system card look, documentation in tables, Parity icon and columns, code height, prop order, sticky titles" |
| `2026-10-05-style-guide-and-setup-modes` | The 21 guide tasks on Haiku (engine cf070d8) | "Setup without technical questions and the style guide's playground batch" |
| `2026-10-05-prototypes-every-state-every-screen` | The 21 guide tasks on Haiku (engine ca59a27) | "Prototypes: usage, Do and Don't, interactive, gaps to Figma, every state and screen size" |
| `2026-10-05-prototypes-click-through-flows-a` | The 21 guide tasks on Haiku (engine ce48769) | "Prototypes: flows, a design review, and pages held to each other" |
| `2026-10-06-a-missing-box-carries-what` | The 21 guide tasks on Haiku (engine e67aeb3) | "Prototypes: flows that hold, lists owe an empty state, what the system cannot give said once" |
| `2026-10-06-check-ui-on-a-page` | The 21 guide tasks on Haiku (engine b454dee) | "Style guide: specs, every variant, a token panel, names held to one style" |
| `2026-10-06-guides-every-gate-named-by` | The 21 guide tasks on Haiku (engine 25c754b) | "Guides: every gate by the number the report prints" |
| `2026-10-06-hand-built-components-are-found` | The 21 guide tasks on Haiku (engine f78312e) | "Hand-built components found, skipped checks said, style guide component page" |
| `2026-10-06-unbuilt-components-not-a-product-gap` | The 21 guide tasks on Haiku (engine a53a190) | "A component the DS has not built yet is not a product's gap" |
| `2026-10-06-anatomy-follows-playground` | The 21 guide tasks on Haiku (engine e46b7bc) | "The anatomy follows every Playground change; no Full width" |
| `2026-10-06-parity-one-table` | The 21 guide tasks on Haiku (engine 7229c44) | "Parity as one table of every prop, variable and value" |
| `2026-10-06-a11y-findings-to-accessibility` | The 21 guide tasks on Haiku (engine c595e4e) | "Accessibility findings go to Accessibility, not Parity" |
| `2026-10-06-style-guide-inspect-bars-alerts` | The 21 guide tasks on Haiku (engine ff07bde) | "Style guide: Inspect in the Playground, the stage's bars, alert icons, a sticky Parity head" |
| `2026-10-06-inspect-a11y-component-sg` | The 21 guide tasks on Haiku (engine 066e053) | "Style guide: Inspect follows the modes and reaches nested parts; Accessibility as one status table; --component with --styleguide" |
| `2026-10-06-width-inspect-slots` | The 21 guide tasks on Haiku (engine ef4872f) | "Style guide: a Width while inspecting draws the anatomy at that width; slots said under the name" |
| `2026-10-06-a11y-every-variant` | The 21 guide tasks on Haiku (engine 2734a61) | "Style guide: Accessibility covers every variant; a click outside lets go in Inspect" |
| `2026-10-06-wcag-2-1-a-and` | The 21 guide tasks on Haiku (engine e84f729) | "WCAG 2.1 A and AA for every component; where accessibility is read from; slots drawn in the Playground" |
| `2026-10-06-style-guide-a-slot-is` | The 21 guide tasks on Haiku (engine 7447255) | "Style guide: a slot is an area named Slot; ids an instance points to are kept; square checkerboard" |
| `2026-10-06-style-guide-one-accessibility-table` | The 21 guide tasks on Haiku (engine 0d370b4) | "Style guide: one Accessibility table by WCAG criterion; every slot marked; an address per area; full width" |
| `2026-10-06-a-failing-contrast-is-never` | The 21 guide tasks on Haiku (engine 7e78e46) | "Style guide: no tokens tables in the Playground; unused Figma annotations listed in Figma" |
| `2026-10-06-prototypes-flip-toggles-and-show` | The 21 guide tasks on Haiku (engine 7554a8c) | "Style guide: tokens table back, card tables with a Source column and named parts; prototypes flip toggles; 320 pixels" |
| `2026-10-07-paint-facts-a-fill-s` | The 21 guide tasks on Haiku (engine ad30b5f) | "Paint facts: a fill's opacity compared; contrast pairs follow what Figma draws" |
| `2026-10-07-figma-refresh-deeper-facts-every` | The 21 guide tasks on Haiku (engine 05fd813) | "Figma refresh: deeper facts every time; a fill on a covering child counts" |
| `2026-10-08-annotation-categories-roles-on-component` | The 21 guide tasks on Haiku (engine 67f75ee) | "Annotation categories; roles read on the component; a role the code fails is Claude's" |
| `2026-10-09-colours-by-variable-freshness-by-content` | The 21 guide tasks on Haiku (engine 6706b73) | "Colours named by their Figma variable; freshness by content; edges read at rest; paired variables; deeper facts on the right side" |
| `2026-10-09-accessibility-parity-readings` | The 21 guide tasks on Haiku (engine af1bcf1) | "Accessibility and parity readings: text as drawn, focus rings, ARIA states, edges in every mode, box and text facts" |
| `2026-10-10-states-heard-on-a-part-colours` | The 21 guide tasks on Haiku (engine a1ca3dd) | "States heard on a part (heardOn); colours in any notation in the edit check" |
| `2026-10-10-prototype-quality` | The 21 guide tasks on Haiku (engine d8e021e) | "Prototype quality on a real system" |
| `2026-10-10-prototype-quality-flows` | The 21 guide tasks on Haiku (engine 224d490) | "Prototype quality: a file that is not one page in a flow" |
| `2026-10-10-prototype-fonts-standins` | The 21 guide tasks on Haiku (engine b06a027) | "Prototype fonts that never wait, and stand-ins shown on the page" |
| `2026-10-10-setup-asks-where-the-code-is` | The 21 guide tasks on Haiku (engine 3b42506) | "Setup asks where the code is; the Figma link is optional" |
| `2026-10-10-setup-reads-the-project` | The 21 guide tasks on Haiku (engine d33715c) | "Setup reads what the project already says" |
| `2026-10-10-a11y-vue-pages-classes` | The 21 guide tasks on Haiku (engine fe00df6) | "Browser accessibility on a Vue project with no Figma: its pages, its classes, and what it could not check" |
| `2026-10-10-focus-escape-code-only` | The 21 guide tasks on Haiku (engine 7cc7815) | "Focus as a keyboard user sees it, Escape on dialogs over the page, and what only the code has in the style guide" |
| `2026-10-10-a-style-guide-request-builds` | The 21 guide tasks on Haiku (engine 58d7ee7) | "A style guide request builds it, accessibility named or not; a component's own style guide page" |
| `2026-10-10-every-variant-of-a-component` | The 21 guide tasks on Haiku (engine 8f8b5ed) | "Every variant of a component checked, every run; Vue components drawn and tried from their code" |
| `2026-10-10-setup-routes-the-request-it` | The 21 guide tasks on Haiku (engine f4f0402) | "Setup routes the request it came from; nothing compared and nothing found are said; the style guide fits a phone" |
| `2026-10-10-the-style-guide-published-from` | The 21 guide tasks on Haiku (engine ff08c96) | "The style guide published from CI; an inset-ring stroke compared by its own width and colour; a test waits on state" |
| `2026-10-11-a-state-written-with-what` | The 21 guide tasks on Haiku (engine 06a82d2) | "A state written with what a screen reader hears is built by its classes; a selector list split at its own commas" |
| `2026-10-11-accessibility-findings-say-how-sure` | The 21 guide tasks on Haiku (engine 293d460) | "Accessibility findings say how sure they are, with one verdict line; a removed focus outline a stronger rule puts back is not reported" |
| `2026-10-11-style-guide-accessibility-tried-while` | The 21 guide tasks on Haiku (engine e645170) | "The style guide opens with its accessibility already tried; one issue table for To do, Parity and Accessibility" |
| `2026-10-11-accessibility-one-run-is-the` | The 21 guide tasks on Haiku (engine 45668bd) | "Accessibility: one run is the whole check, against WCAG 2.2 AA" |
| `2026-10-11-merge-main-into-claude-nifty` | The 21 guide tasks on Haiku (engine 77fc968) | "Accessibility: one run is the whole check, on main's style guide" |
| `2026-10-11-accessibility-the-style-guide-s` | The 21 guide tasks on Haiku (engine 7ab28d4) | "The style guide's accessibility check finishes and reaches the guide" |
| `2026-10-11-coverage-scopes-imports-layers` | The 21 guide tasks on Haiku (engine c46a5e4) | "Coverage, variable scopes, imports, token layers, the verification headline and how components go together" |
| `2026-10-11-system-health-token-budget` | The 21 guide tasks on Haiku (engine 09ee19f) | "System health advice, the token budget, tiers by kind and the Figma build list" |
| `2026-10-11-token-todo` | The 21 guide tasks on Haiku (engine baae26a) | "What the tokens owe, on the style guide's To do" |
| `2026-10-11-removed-token-aliases` | The 21 guide tasks on Haiku (engine b27d0fd) | "Aliases to a removed token, in Figma and in the code" |
| `2026-10-11-order-of-authority` | The 21 guide tasks on Haiku (engine fd564b2) | "An order of authority, written down" |
| `2026-10-11-checked-by-hand-brand-names` | The 21 guide tasks on Haiku (engine 99a6dc7) | "Checks made by hand, and no brand or product names in tokens" |
| `rename-migrations-copies` | The 21 guide tasks on Haiku (engine f8675f6) | "A rename sweep, steps off what the system retired, and a near copy as a decision" |
| `motion-screens-modes` | The 21 guide tasks on Haiku (engine c739389) | "Motion and screens against Figma, every combination of modes, and the products' own pages checked" |
| `documentation-page` | The 21 guide tasks on Haiku (engine 53b5844) | "Coverage becomes Documentation, the same cards as each component's" |
| `vue-builds` | The 21 guide tasks on Haiku (engine e27cbc3) | "Vue components rendered with whatever builds them" |
| `gate-measures-motion-page` | The 21 guide tasks on Haiku (engine 856fd1a) | "The structure gate measures tokens, icons and nesting, and a motion page in the foundations" |
| `todo-kinds-usage` | The 21 guide tasks on Haiku (engine 7a6b367) | "A wider disabled guard, text styles in full, where each component lives, and the To do page by kind" |
| `todo-documentation-table` | The 21 guide tasks on Haiku (engine 2b6482d) | "The To do page shows Documentation in the Documentation table" |
| `motion-todo-no-doc-page` | The 21 guide tasks on Haiku (engine eed8da2) | "Motion variables in the To do, and no Documentation page of its own" |
| `tasks-page-sticky-heads` | The 21 guide tasks on Haiku (engine 1e7192e) | "Tasks page and sticky table heads" |
| `component-motion` | The 21 guide tasks on Haiku (engine 9b4a9c5) | "How each component moves on its own" |
| `modes-effects-motion-tab` | The 21 guide tasks on Haiku (engine 8bf7f93) | "Every mode, effects, a Motion tab" |
| `tasks-motion-page` | The 21 guide tasks on Haiku (engine 8f2202f) | "Tasks by kind, motion as one system table" |
| `2026-10-12-a-fill-figma-does-not` | The 21 guide tasks on Haiku (engine 250c635) | "A fill Figma does not have; a row's free space allows for text; screens framed by a product, or cut" |
| `2026-10-12-health-how-far-each-area` | The 21 guide tasks on Haiku (engine 647b009) | "Health: how far each area has come, weighted into one number, and where what is left gathers" |
| `2026-10-12-a-colour-asked-for-or` | The 21 guide tasks on Haiku (engine 4754507) | "A colour asked for, or a design token to add, is not a secret" |
| `2026-10-12-the-designed-screens-checked-for` | The 21 guide tasks on Haiku (engine b053e48) | "The designed screens checked for accessibility" |
| `a11y-checks-and-figma-review` | The 21 guide tasks on Haiku (engine d5be7e8) | "Accessibility checks V1 to V6, findings and specs handed to Figma" |
| `census-planted-faults-health` | The 21 guide tasks on Haiku (engine 2b17d2c) | "Raw value census, prototypes sized as screens, planted-fault tests, Health by criterion" |
| `setup-from-capture` | The 21 guide tasks on Haiku (engine 438d3a4) | "Setup fills from the first capture what it cannot read" |
| `gitlab-agents-gaps` | The 21 guide tasks on Haiku (engine c2ee891) | "A project read from GitLab, agents without the hooks, and gaps that say what was tried" |
| `capture-recipe-fixes` | The 21 guide tasks on Haiku (engine 78d3116) | "The Figma capture reads library aliases, colours with opacity among the sizes, durations in their unit, every text style by its full name, and shared sizing modes" |
| `chunked-capture-stamps` | The 21 guide tasks on Haiku (engine c071b6d) | "Figma read in checked chunks by both readers, outputs stamped with what they were built from, parity by type, Mac-like runs" |
| `p6-components` | The 21 guide tasks on Haiku (engine 99f052c) | "Components read in checked chunks" |
| `kept-on-purpose` | The 21 guide tasks on Haiku (engine fee165b) | "Kept on purpose" |
| `2026-10-13-guide-a-component-s-own` | The 21 guide tasks on Haiku (engine 89948cd) | "Read-only complete capture" |
| `2026-10-13-tests-a-type-style-lists` | The 21 guide tasks on Haiku (engine 3f9b610) | "Text styles complete and accurate" |
| `2026-10-14-a-compact-figma-capture-about` | The 21 guide tasks on Haiku (engine e81a0ea) | "Compact Figma capture" |
| `2026-10-14-style-guide-with-figma-s` | The 21 guide tasks on Haiku (engine 2ef7817) | "Style guide: only Figma's components, code-only ones as tasks" |
| `figma-branch` | The 21 guide tasks on Haiku (engine 7a1484a) | "Figma branch links" |
| `2026-10-15-style-guide-the-page-s` | The 21 guide tasks on Haiku (engine 4fe0912) | "Style guide defaults" |
| `2026-10-15-style-guide-the-menu-s` | The 21 guide tasks on Haiku (engine 1663d15) | "Icons from a folder of SVG files" |
| `2026-10-16-tests-the-token-description-row` | The 21 guide tasks on Haiku (engine 8015c10) | "Style guide: brands, Showroom, property sheet" |
| `guidance-rating` | The 21 guide tasks on Haiku (engine c7ee2d0) | "Guidance rating for agents" |
| `2026-10-21-identity-depth-view-centred-once` | The 21 guide tasks on Haiku (engine f93e3b7) | "Style guide: personality, Identity layout, module data" |
| `2026-10-21-parity-each-side-says-where` | The 21 guide tasks on Haiku (engine 8d5c3d6) | "Parity: each side says where a value is and what sets it; a token finding as what Figma has and what the code has" |
| `2026-10-21-status-the-documentation-card-counts` | The 21 guide tasks on Haiku (engine 7a568ab) | "Status: the Documentation card counts only what the code has built, as Parity and Accessibility do" |
| `2026-10-22-intent-layer-page-part-of` | The 21 guide tasks on Haiku (engine 4c73986) | "Intent layer page: Part of and its component 8px apart" |
| `2026-10-23-where-each-part-lives-and` | The 21 guide tasks on Haiku (engine de2a613) | "Where each part lives, and who may write it: stores, a company's profile and its command" |
| `2026-10-24-one-token-per-person-the` | The 21 guide tasks on Haiku (engine c15a00a) | "One token per person: the installer asks for a fine-grained token (Read on the system's projects, Commit and Merge request Create), and a refused write says what that token needs instead of asking for a second one" |
| `2026-10-24-publishing-the-style-guide-to` | The 21 guide tasks on Haiku (engine bd53684) | "Publishing the style guide to its store sends the page and what it links to, never the rest of its folder, where a person may keep files of their own" |
| `2026-10-24-status-the-cards-named-parity` | The 21 guide tasks on Haiku (engine f69e3e0) | "Status: the cards named Parity, Code, Accessibility and Documentation, each with a short plain tip; each open task says how long it has been open (open-since.snapshot.json, kept by the build's browser); every decision keeps who made it and when (--by, else git's name); a download in a page shown inside another one says how else to get the file" |
| `2026-10-24-guidelines-link-not-read-the` | The 21 guide tasks on Haiku (engine 8b893e6) | "Guidelines link not read: the NEXT line says the person makes the fix, a token by their hand in .env, never asked for in the chat" |
| `2026-10-24-merge-remote-tracking-branch-origin` | The 21 guide tasks on Haiku (engine 44de2d4) | "Merge remote-tracking branch 'origin/main' into kept-differences" |
| `2026-10-24-merge-remote-tracking-branch-origin-2` | The 21 guide tasks on Haiku (engine 7f33bfa) | "Merge remote-tracking branch 'origin/main' into kept-differences" |
| `2026-10-24-each-style-guide-build-sends` | The 21 guide tasks on Haiku (engine 4713436) | "Each style guide build sends the themes a person keeps that the team's themes store lacks, or holds older, when GitLab lets them write it; a colleague's newer one is never replaced" |

Summarize a folder: `node test/skill-evals/summarize.mjs test/skill-evals/records/<folder>`.
