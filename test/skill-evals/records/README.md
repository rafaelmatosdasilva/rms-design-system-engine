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
| `2026-10-24-merge-remote-tracking-branch-origin-3` | The 21 guide tasks on Haiku (engine 75c8ac8) | "Merge remote-tracking branch 'origin/main' into styleguide-themes-store" |
| `2026-10-24-merge-remote-tracking-branch-origin-4` | The 21 guide tasks on Haiku (engine 88b78a0) | "Merge remote-tracking branch 'origin/main' into gitlab-path-resolve" |
| `2026-10-24-intent-layer-drafts-sent-in` | The 21 guide tasks on Haiku (engine 92415e4) | "Intent layer drafts sent in parts (GitLab closes a request too large), each on the one before; a role written "Role: …" after the written sections, as a spec checked for its order wants; a section with a draft waiting counts as Review, not Missing; one status a row on the Documentation page; markup is no name the check calls unknown" |
| `2026-10-24-merge-remote-tracking-branch-origin-5` | The 21 guide tasks on Haiku (engine 6bfa0b9) | "Merge remote-tracking branch 'origin/main' into docs-fold-for-agents" |
| `2026-10-24-prototype-catalog-what-the-request` | The 21 guide tasks on Haiku (engine 8f07cf3) | "Prototype catalog: what the request needs, the code's own props, and where a component goes" |
| `2026-10-25-prototypes-as-pages-in-the` | The 21 guide tasks on Haiku (engine f2ce1f0) | "Prototypes as pages in the system's own code, held to the system, and what agents invent fed back to the documentation" |
| `2026-10-25-the-documentation-under-load-what` | The 21 guide tasks on Haiku (engine c7f1651) | "The documentation under load: what agents cannot learn, which component they cannot tell apart, and a sweep of real pages" |
| `2026-10-25-every-test-closes-the-documentation` | The 21 guide tasks on Haiku (engine cb67d6a) | "Every test closes the documentation gaps it can: the code's facts written as final, the rest drafted for review" |
| `2026-10-25-ci-changed-a-scheduled-pipeline` | The 21 guide tasks on Haiku (engine bc786bf) | "--ci-changed: a scheduled pipeline builds only when something it is made from moved" |
| `2026-10-25-intent-layer-every-answer-does` | The 21 guide tasks on Haiku (engine 4ca5375) | "Intent layer: every answer does its own work, each with a command to copy" |
| `2026-10-25-make-command-writes-the-company` | The 21 guide tasks on Haiku (engine 80a5ef0) | "--make-command writes the company's command even when the profile cannot be read yet" |
| `2026-10-25-accessibility-per-theme-the-build` | The 21 guide tasks on Haiku (engine ddc45c6) | "Accessibility per theme: the build tries every component in each theme the page offers (the default one, and each brand not only the base of others) and saves each theme's results with the snapshots (themes: { … }; an older file is the default theme's); the page shows the chosen theme's, and switches with it" |
| `2026-10-25-the-default-theme-is-called` | The 21 guide tasks on Haiku (engine c15d49a) | "The default theme is called the default one; a project's plain-word names are watched where they are used as names" |
| `2026-10-25-each-repository-the-setup-names` | The 21 guide tasks on Haiku (engine c0ee871) | "Each repository the setup names says what is there: the engine writes its README on every run" |
| `2026-10-25-merge-main-into-readmes` | The 21 guide tasks on Haiku (engine ea1fabb) | "Merge main into readmes" |
| `2026-10-25-places-compared-by-where-they` | The 21 guide tasks on Haiku (engine ae4f913) | "Places compared by where they are, not by the token that reaches them" |
| `2026-10-25-prototypes-reviewed-as-pages-the` | The 21 guide tasks on Haiku (engine 97de7da) | "Prototypes reviewed as pages, the same for every framework: the habits agents fall into, the states owed, every screen size" |
| `2026-10-26-the-engine-says-when-the` | The 21 guide tasks on Haiku (engine 540a998) | "The engine says when the style guide the team opens is behind, and can publish it itself" |
| `2026-10-26-each-changelog-row-says-what` | The 21 guide tasks on Haiku (engine 74a632e) | "Each Changelog row says what it was for and where it changed the system" |
| `2026-10-27-a-store-s-readme-says` | The 21 guide tasks on Haiku (engine 848f5b6) | "A store's README says how its style guide is updated when no pipeline builds it" |
| `2026-10-27-a-request-that-asks-for` | The 21 guide tasks on Haiku (engine 260ee52) | "A request that asks for the fix is the ask: the agent makes it without asking again" |
| `2026-10-27-documentation-page-without-downloads-changelog` | The 21 guide tasks on Haiku (engine e170521) | "Documentation page without downloads, Changelog last in the menu, table heads that stick cleanly in pages and side panels" |
| `2026-10-27-the-evidence-convention-short-enough` | The 21 guide tasks on Haiku (engine a49be49) | "The evidence convention, short enough for the guide's size limit" |
| `2026-10-27-one-decision-for-a-page` | The 21 guide tasks on Haiku (engine 37ce80b) | "One decision for a page's drafts, the drafts grouped by section and each once; a card head never rests on its own first line" |

| `2026-10-27-what-a-person-said-about` | The 21 guide tasks on Haiku (engine 3080190) | "Prototypes as a part, a handoff page, and what people say about a prototype" |
| `2026-10-27-figma-edits-fell-over-on` | The 21 guide tasks on Haiku (engine 36e816a) | "--figma-edits fell over on every project, and no test ran the command" |
| `2026-10-27-the-command-sweep-takes-a` | The 21 guide tasks on Haiku (engine 6da56a7) | "The command sweep takes a quarter of the machine, not half: five at a time starved the browser test" |
| `2026-10-27-merge-remote-tracking-branch-origin` | The 21 guide tasks on Haiku (engine e4dfff7) | "Merge remote-tracking branch 'origin/main' into decisions-history" |
| `2026-10-27-history-a-chip-each-for` | The 21 guide tasks on Haiku (engine c5af798) | "History: a chip each for the code, Figma and the decisions" |
| `2026-10-27-a-finding-said-under-the` | The 21 guide tasks on Haiku (engine 73933d0) | "A finding said under the code's name for a component (picker/Row) reaches its page" |
| `2026-10-27-an-on-off-that-hides` | The 21 guide tasks on Haiku (engine 42058be) | "An on/off that hides more than Figma's, a slot that shrinks what Figma stretches, and dates against the writing rules" |
| `2026-10-28-a-component-figma-has-and` | The 21 guide tasks on Haiku (engine 043c69f) | "A component Figma has and the code does not: --query says its class styles nothing, so an agent uses a built one" |
| `2026-10-28-the-construction-grammar-how-a` | The 21 guide tasks on Haiku (engine 1663f29) | "The construction grammar: how a system builds a component in Figma, mined from its own components" |
| `2026-10-28-the-construction-page-each-rule` | The 21 guide tasks on Haiku (engine bf41765) | "The Construction page: each rule with its status, what is to fix, one decision for all" |
| `2026-10-28-an-unbuilt-component-in-a` | The 21 guide tasks on Haiku (engine 2f5a617) | "An unbuilt component in a query: build with what the code has and say so, never stop to ask" |
| `2026-10-28-the-system-page-is-found` | The 21 guide tasks on Haiku (engine efbf5c9) | "The System page is found by the layer's index when the snapshot names no file" |
| `2026-10-28-how-each-component-is-built` | The 21 guide tasks on Haiku (engine 1c50e50) | "How each component is built: the skeleton, read from Figma, and its architecture on the Construction page" |
| `2026-10-28-a-ui-check-that-passes` | The 21 guide tasks on Haiku (engine 06254d7) | "A UI check that passes ends the task: reply in the chat, run nothing more" |
| `2026-10-28-merge-remote-tracking-branch-origin` | The 21 guide tasks on Haiku (engine 0a96050) | "Merge remote-tracking branch 'origin/main' into architecture" |
| `2026-10-28-construction-a-yes-no-variant` | The 21 guide tasks on Haiku (engine d6fb706) | "Construction: a yes/no variant that should be a boolean, padding, layer order and page; decided rules checked on every run" |
| `component-builder` | The 21 guide tasks on Haiku (engine 33f86b6) | "A new component built in Figma from a spec: the build-component-figma recipe" |
| `component-change` | The 24 guide tasks on Haiku (engine 02226fe) | "A component changed in Figma with its report: the change-component-figma recipe, and evals for building" |
| `system-sign-off` | The 24 guide tasks on Haiku (engine b121b51) | "A change to the system itself is signed off, and the changes made in Figma have a page" |
| `2026-10-29-a-store-read-decides-a` | The 24 guide tasks on Haiku (engine 1bc455e) | "Two runs writing one store merged by their stamps" |
| `intent-layer-sources` | The 24 guide tasks on Haiku (engine 78b2e7f) | "The intent layer read from GitHub and a project folder, and from Markdown and MDX pages" |
| `2026-10-30-mcp-answers-fit-an-agent` | The 24 guide tasks on Haiku (engine b088c30) | "MCP answers fit an agent with no shell; the skill says which route; a11y guide lines" |
| `2026-10-30-route-benchmark-before` | The route benchmark before the MCP answers were made fit for an agent with no shell: four tasks on each route, Haiku 5.5 (engine b30d122), scored with the scorers of engine b088c30 | "Route benchmark, the command line against the MCP server" |
| `2026-10-30-route-benchmark` | The same benchmark after it (engine b088c30) | "Route benchmark, the command line against the MCP server" |
| `2026-11-01-the-intent-layer-s-fixes` | The 24 guide tasks on Haiku (engine a7faa63) | "The intent layer's fixes: docs say where they go; a branch read with no commit id is never written over" |
| `2026-11-01-merge-origin-main` | The 24 guide tasks on Haiku (engine 15a0830) | "The MCP answers and the route merged with the intent layer's fixes" |
| `2026-11-01-confluence-pages-every-tag-taken` | The 24 guide tasks on Haiku (engine c47fda6) | "Confluence pages: every tag taken out until none is left" |
| `2026-11-01-merge-origin-main-2` | The 24 guide tasks on Haiku (engine 43a945b) | "The MCP answers and the route merged with Notion and Confluence sources" |
| `2026-11-01-the-hooks-a-design-token` | The 24 guide tasks on Haiku (engine 24cea6b) | "The hooks: a design token the agent will add is no secret asked for; a pasted step list gets no report file" |
| `2026-11-01-merge-remote-tracking-branch-origin` | The 24 guide tasks on Haiku (engine f9ba9f3) | "Merge remote-tracking branch 'origin/main' into eval-owed-guides" |
| `2026-11-01-point-the-hooks-workflows-install` | The 24 guide tasks on Haiku (engine 36f540e) | "Point the hooks, workflows, install, docs and tests at lib/; keep four root entries" |
| `2026-11-01-the-build-and-change-guides` | The 24 guide tasks on Haiku (engine e1ebb2c) | "Build and change guides, library keys" |
| `2026-11-01-usage-and-config-reference-pages` | The 24 guide tasks on Haiku (engine aa621b1) | "Usage and config reference: pages to write, suggested prop pairs, and where a contract's description and rules come from" |
| `2026-11-01-skill-evaluation-pages-to-write` | The 24 guide tasks on Haiku (engine 5497b03) | "Skill evaluation: pages to write, suggested prop pairs, where a contract's description and rules come from; every run passed" |
| `2026-11-01-merge-main-into-the-guide` | The 24 guide tasks on Haiku (engine 3f8cfb4) | "Build and change guides, library keys, merged with main" |
| `2026-11-01-the-guide-names-the-style` | The 24 guide tasks on Haiku (engine 879dd98) | "Guide: the style guide's jobs, parts and watch" |
| `2026-11-02-the-watch-s-install-asks` | The 24 guide tasks on Haiku (engine 679dd24) | "The watch's install asks launchd or systemd only for a job in this computer's own folder" |
| `2026-11-02-setup-s-watch-line-ci` | The 24 guide tasks on Haiku (engine b808d92) | "Setup's watch line: CI's reason is a CI run" |
| `2026-11-02-the-guide-tells-the-agent` | The 24 guide tasks on Haiku (engine 5b6010a) | "The guide tells the agent about the loop, the states a page owes, and where the patterns come from" |
| `2026-11-02-the-guide-names-git-s` | The 24 guide tasks on Haiku (engine d0594f9) | "Guide: first result after setup, git's hooks, accessibility the design owes" |
| `2026-11-02-the-main-guide-keeps-its` | The 24 guide tasks on Haiku (engine 0191718) | "Guide: first result after setup, git's hooks, accessibility the design owes" |
| `2026-11-02-the-fork-the-recipe-buried` | The 24 guide tasks on Haiku (engine 98c23d4) | "The fork the recipe buried: which kind of file this project writes" |
| `2026-11-04-a-round-that-did-not` | The 24 guide tasks on Haiku (engine 4fa53d3) | "A round that did not publish says when the guide was last built" |
| `local-style-guide-rebuilt-after-each-commit` | The 24 guide tasks on Haiku (engine 5eb0615) | "Your local style guide is built again after each commit and each pull" |
| `privacy-nets` | The 24 guide tasks on Haiku (engine c4f386e) | "The privacy check knows a project's people and company, reads a pull request's names, and never runs on an empty list" |
| `the-guide-names-intentlayer-nodrafts` | The 24 guide tasks on Haiku (engine 614cccd) | "The guide says History is one table of changes, names intentLayer.noDrafts, and Figma beside the code is off unless asked" |
| `one-construction-page` | The 24 guide tasks on Haiku (engine 7345c71) | "One Construction page for Figma and the code, in the menu" |
| `2026-11-08-the-triage-test-reads-contributing` | The 24 guide tasks on Haiku (engine bcee1c1) | "The triage test reads CONTRIBUTING where it moved, in .github" |
| `2026-11-08-the-rules-page-lives-at` | The 24 guide tasks on Haiku (engine d234ea9) | "The Rules page lives at #rules, and #construction still opens it" |
| `2026-11-08-rules-and-documentation-filter-by` | The 24 guide tasks on Haiku (engine 9f4f851) | "Rules and Documentation filter by any of their columns" |
| `2026-11-08-side-owned-by-and-the` | The 24 guide tasks on Haiku (engine 91d7a3f) | "Side, Owned by, and the statuses read without opening a list" |
| `2026-11-08-fix-decide-done-source-on` | The 24 guide tasks on Haiku (engine 06654ad) | "Fix, Decide, Done; Source on both pages; an area for a page" |
| `2026-11-09-every-variant-s-bindings-and` | The 24 guide tasks on Haiku (engine 29b3718) | "Every variant's bindings and how each text layer grows" |
| `2026-11-09-whether-a-component-binds-the` | The 24 guide tasks on Haiku (engine c349c26) | "Whether a component binds the right token" |
| `2026-11-09-what-the-evaluation-cannot-see` | The 24 guide tasks on Haiku (engine 4c1d2ef) | "What the evaluation cannot see, it does not score" |
| `2026-11-09-how-a-system-layers-its` | The 24 guide tasks on Haiku (engine 625bf34) | "How a system layers its tokens" |
| `2026-11-09-the-grammar-of-token-names` | The 24 guide tasks on Haiku (engine 314bd2d) | "The grammar of token names" |
| `2026-11-09-merge-main-379-into-what` | The 24 guide tasks on Haiku (engine f5dcf56) | "What a component binds, with the name grammar" |
| `2026-11-09-merge-remote-tracking-branch-origin` | The 24 guide tasks on Haiku (engine 19fa4c9) | "A family built alike" |
| `2026-11-09-what-an-agent-reads-of` | The 24 guide tasks on Haiku (engine cf6545c) | "What an agent reads, twins and declared tiers" |
| `2026-11-09-how-parts-go-together-and` | The 24 guide tasks on Haiku (engine a1156ad) | "How parts go together, and the token-name grammar" |
| `2026-11-09-opacity-borders-and-corners-and` | The 24 guide tasks on Haiku (engine 81cedad) | "Opacity, borders, corners and text styles" |
| `2026-11-09-what-the-file-s-own` | The 24 guide tasks on Haiku (engine 5e50605) | "What the file's own examples say" |
| `2026-11-09-new-ui-saved-alone` | `new-ui-saved` alone, 20 runs on Haiku (engine 5e50605), to read the one miss of the run above | "A question in place of the confirmation, once in thirty" (FINDINGS.md) |
| `2026-11-09-how-a-shadow-changes-a` | The 24 guide tasks on Haiku (engine 93c09f2) | "Shadows, slots and the gap between parts" |
| `2026-11-09-a-family-aligned-filled-and` | The 24 guide tasks on Haiku (engine ecf6b4b) | "A family aligned, filled and padded alike" |
| `2026-11-09-a-system-with-no-layers` | The 24 guide tasks on Haiku (engine 72fa6b3) | "Category words, a family's limits, how a hover shows" |
| `2026-11-10-merge-branch-figma-batch-7` | The 24 guide tasks on Haiku (engine 121e1e0) | "Size steps, parts shown, what a property changes" |
| `2026-11-10-the-icon-that-goes-with` | The 24 guide tasks on Haiku (engine db1b452) | "Icons with labels, unused components, option twins" |
| `2026-11-10-the-library-s-size-scale` | The 24 guide tasks on Haiku (engine 55ecf78) | "The size scale, and property before state" |
| `2026-11-10-variant-order-a-family-s` | The 24 guide tasks on Haiku (engine 1cd3159) | "Variant order, a family's fill, nested within reach" |
| `2026-11-10-merge-branch-figma-batch-11` | The 24 guide tasks on Haiku (engine a4781c9) | "Annotations read by family" |
| `2026-11-10-merge-branch-figma-batch-12` | The 24 guide tasks on Haiku (engine da5d214) | "The engine in Cursor and Codex" |
| `2026-11-10-merge-branch-cursor-codex-guard` | The 24 guide tasks on Haiku (engine cdab86a) | "A check that waits on Figma says so" |
| `2026-11-10-merge-branch-capture-waits-into` | The 24 guide tasks on Haiku (engine 6889d8a) | "A parent that cancels a nested state" |
| `2026-11-11-the-figma-library-s-health` | The 24 guide tasks on Haiku (engine 53c56b9) | "Library health, unused components, a steady release test" |
| `2026-11-11-merge-branch-figma-parity-13` | The 24 guide tasks on Haiku (engine 69b68f8) | "Each Figma part paired with its class" |
| `2026-11-11-a-difference-names-the-part` | The 24 guide tasks on Haiku (engine ddb715b) | "A difference names its part" |
| `2026-11-10-a-preview-to-review-a-code` | The 24 guide tasks on Haiku (engine ecdb31c) | "A preview to review a code prototype in" |
| `2026-11-10-a-preview-to-review-a-code-2` | The 24 guide tasks on Haiku (engine 253ac2c) | "A preview to review a code prototype in" |
| `2026-11-10-a-preview-to-review-a-code-3` | The 24 guide tasks on Haiku (engine c53102b) | "A preview to review a code prototype in" |
| `2026-11-11-the-figma-file-read-as` | The 24 guide tasks on Haiku (engine fe7e963) | "The Figma file read as Figma draws it" |
| `2026-11-11-the-file-check-counts-only` | The 24 guide tasks on Haiku (engine 40b1d33) | "Reading order, and only what Figma draws" |
| `2026-11-11-building-blocks-checked-controls-known` | The 24 guide tasks on Haiku (engine 84cc359) | "Building blocks checked, controls known by more than their name, rows placed by hand, and a control's edge" |
| `2026-11-11-empty-frames-and-figma-s` | The 24 guide tasks on Haiku (engine 9dd7442) | "Empty frames, and Figma's own version history" |
| `2026-11-11-figma-s-version-history-the` | The 24 guide tasks on Haiku (engine 95fea56) | "Figma's version history: the file's pages, and its rate limit waited out or said" |
| `2026-11-11-a-field-s-name-gives` | The 24 guide tasks on Haiku (engine a577057) | "A field's name gives way to the code only where the code holds a button and the name says no input outright" |
| `2026-11-11-comments-left-in-figma-and` | The 24 guide tasks on Haiku (engine b5e80f5) | "Comments left in Figma, and four of the library's own conventions" |
| `2026-11-11-history-tests-know-the-contracts` | The 24 guide tasks on Haiku (engine 2a3366a) | "A card per source on Rules and Documentation, and pattern contracts" |
| `2026-11-11-the-style-guide-says-one` | The 24 guide tasks on Haiku (engine f815a8a) | "The style guide says one number, reads as text, and sorts every table" |
| `2026-11-11-history-a-contract-change-is` | The 24 guide tasks on Haiku (engine 9f794e9) | "History: a contract change is done by the engine, under Contracts" |
| `2026-11-11-a-component-s-examples-feed` | The 24 guide tasks on Haiku (engine 531ed97) | "A component's examples are read with its guidance" |
| `2026-11-11-a-contract-change-is-named` | The 24 guide tasks on Haiku (engine 0e03ff5) | "A contract change is named by its store's commit, as the intent layer's are" |
| `2026-11-11-merge-branch-main-of-https` | The 24 guide tasks on Haiku (engine db66ce8) | "A component's examples are read, with main merged in" |
| `2026-11-11-the-code-grammar-s-test` | The 24 guide tasks on Haiku (engine 8f8f3b6) | "The code grammar's test makes its folder through tempDir" |
| `2026-11-11-the-theme-editor-in-every-style-guide` | The 20 guide tasks on Haiku (engine 46ed658) | "The theme editor in every style guide: new themes of the system, made over a live screen" |
| `2026-11-11-merge-branch-main-of-https-2` | The 24 guide tasks on Haiku (engine 047ba3c) | "Merge branch 'main' of https://github.com/rafaelmatosdasilva/rms-design-system-engine into styleguide/source-cards-one-row" |
| `2026-11-11-merge-origin-main-into-figma` | The 24 guide tasks on Haiku (engine 106e4e9) | "Each Figma part read in the code, and four checks of a component's words" |
| `2026-11-11-merge-origin-main-into-figma-2` | The 24 guide tasks on Haiku (engine bd8cd70) | "Each Figma part read in the code, and four checks of a component's words, on the code's construction rules" |
| `2026-11-12-figma-s-anatomy-against-the` | The 24 guide tasks on Haiku (engine 922ee07) | "Figma's anatomy held against the code's" |
| `2026-11-12-merge-origin-main-into-code` | The 24 guide tasks on Haiku (engine dc9f336) | "The code's words read as Figma's are, and the team's own linters read as decided rules" |
| `2026-11-12-the-composition-path-on-opus` | The 12 prototype tasks on a system built only in Figma, Opus, 5 runs each (engine e62df41) | "The composition path at more runs, on a model above Haiku" |
| `2026-11-12-two-severities-for-the-construction` | The 24 guide tasks on Haiku (engine fd52a2f) | "Two severities for the construction check, and the same as data" |
| `2026-11-12-merge-main-the-batch-is` | The 24 guide tasks on Haiku (engine df790fa) | "Pages and flows: orientation, more than one way, a flow walked; media fixtures; forced colours apart from AA" |
| `2026-11-12-merge-origin-main-into-parity` | The 24 guide tasks on Haiku (engine 0029a14) | "Figma's anatomy held against the code's, on the latest main" |
| `2026-11-12-merge-branch-main-of-https` | The 24 guide tasks on Haiku (engine 0ebb6b5) | "Merge branch 'main' of https://github.com/rafaelmatosdasilva/rms-design-system-engine into code/content-and-ci" |
| `2026-11-12-code-into-figma` | The 24 guide tasks on Haiku (engine 84f012d) | "Code into Figma, templates as frames and code from a spec" |
| `2026-11-12-layout-faults` | The 24 guide tasks on Haiku (engine 3f231b9) | "Layout faults, construction check annotations and the skill file" |
| `2026-11-12-code-into-figma-on-main` | The 24 guide tasks on Haiku (engine 44b2c48) | "Code into Figma, on main with the layout faults" |
| `2026-11-12-everything-the-system-holds` | The 24 guide tasks on Haiku (engine 7efa620) | "Everything the system holds, generated, and a kept benchmark for Figma builds" |
| `2026-11-12-a-description-a-designer-wrote` | The 24 guide tasks on Haiku (engine d20790c) | "A description a designer wrote is put to the person, with both texts" |
| `2026-11-12-merge-branch-main-of-https-2` | The 24 guide tasks on Haiku (engine 7050066) | "Merge branch 'main' of https://github.com/rafaelmatosdasilva/rms-design-system-engine into figma/written-back" |
| `2026-11-13-everything-the-system-holds-on-main` | The 24 guide tasks on Haiku (engine 6859d53) | "Everything the system holds, generated, on main" |
| `2026-11-13-starting-files-from-what-is` | The 24 guide tasks on Haiku (engine 479ebc8) | "Starting files from what is exact in Figma, and the way back from a Figma write in the guide" |
| `2026-11-13-route-benchmark` | The route benchmark run again, after the routed block named each command's MCP tool (engine a9d1c3c), Haiku 5.5 | "Route benchmark, run again" |
| `2026-11-13-testimony-judgement-and-browsers-on` | The 24 guide tasks on Haiku (engine 5ed611f) | "A check by hand said to be a person's word; the judgement calls pre-sorted; which browser answered each criterion" |
| `2026-11-13-merge-main-this-batch-lands` | The 24 guide tasks on Haiku (engine fcc5d31) | "A check by hand said to be a person's word; the judgement calls pre-sorted; which browser answered each criterion, on main" |
| `2026-11-13-merge-remote-tracking-branch-origin` | The 24 guide tasks on Haiku (engine ba70b55) | "Merge remote-tracking branch 'origin/main' into figma/findings-reach-designers" |
| `2026-11-14-figma-builder-asks-and-benchmark-on-real-library` | The 24 guide tasks on Haiku (engine 5f1e378) | "The Figma builder asks when the literal reading would not serve, and its benchmark scores sense, questions and rules, on a team's own library too" |
| `2026-11-14-a-layout-part-is-a` | The 24 guide tasks on Haiku (engine 7cfcaf8) | "A layout part is a class named after a layout, never one that only ends in its word" |
| `2026-11-14-figma-builder-asks-on-main` | The 24 guide tasks on Haiku (engine 253ad7b) | "The Figma builder asks, and its benchmark on a real library, on main" |

Summarize a folder: `node test/skill-evals/summarize.mjs test/skill-evals/records/<folder>`.
