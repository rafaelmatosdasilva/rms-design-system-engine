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

Summarize a folder: `node test/skill-evals/summarize.mjs test/skill-evals/records/<folder>`.
