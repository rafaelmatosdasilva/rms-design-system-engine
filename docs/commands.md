# Commands

Everything you can ask in Claude Code, grouped by type. Copy a request, or say it in your own words.

Name a component the way your system does (button primary, Button Primary and primary button all work). When a word fits several components, such as *button* in a system with buttonPrimary and iconButton, Claude asks which one first.

## Set up

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine set up this project` | Asks where your code and Figma are, then sets the project up |
| `/rms-design-system-engine check the install` | Each problem with the install, and its fix |
| `/rms-design-system-engine use these guidelines <link>` | Your written guidelines from Notion or GitLab, read on every run |
| `/rms-design-system-engine use this intent layer <link or folder>` | Your intent layer (DSDS or Markdown pages, on GitLab, GitHub or in a folder of your project) read into each component's documentation, its contract and `llms.txt`, and a page that says what agents use from it |
| `/rms-design-system-engine refresh the Figma data` | Figma read again, the best way available |
| `/rms-design-system-engine scan from this Figma branch <Figma link>` | The branch read instead of the main file, so edits on main do not restart a scan |

## Compare Figma and code

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine check everything` | Every check, a summary and every difference in `differences.md` |
| `/rms-design-system-engine check the button` | The same, for one component |
| `/rms-design-system-engine check the button against Figma, without accessibility` | Every check against Figma, without accessibility |
| `/rms-design-system-engine run only the token values check` | One check, by number or name |
| `/rms-design-system-engine which component should I fix first?` | The component with the most left to fix |
| `/rms-design-system-engine what did the last audit find?` | The last run's summary again, with nothing run anew |
| `/rms-design-system-engine accept the chip radius as known debt` | One known difference accepted, the rest still checked |
| `/rms-design-system-engine keep the chip height on purpose because the product needs a larger tap target` | One difference kept with your reason, never failing a check |

## Test accessibility

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine check the accessibility of the button` | WCAG 2.2 A and AA in a real browser, with axe-core |
| `/rms-design-system-engine badge 1.3.3 is checked` | A criterion marked as checked by a person |

## Write component contracts

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine which props does the badge take?` | A component's props and where it is used, or a token's values |

## Write the intent layer

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine record that the tile has no large size, we ruled out a size per page because no screen needs it` | One decision on the tile's page in the intent layer, with what was ruled out and why, shown in History and given to agents |
| `/rms-design-system-engine the row is a part of the tile list, it is never used on its own` | Recorded on the tile list's page in the intent layer: the row shown and documented inside it, and agents told to place the list |
| `/rms-design-system-engine rate our guidelines for agents` | How much an agent can take from your guidance: ready, partial or thin, for each component, with what to add |
| `/rms-design-system-engine rate our guidelines and test extraction with a model` | The same, plus a test where a model answers questions from your guidance alone (uses your model tokens) |

## Publish a living style guide

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine build the style guide` | The living style guide |
| `/rms-design-system-engine check the modal and show it in the style guide` | One component's page |
| `/rms-design-system-engine publish the style guide for the team` | The job that publishes it on every push |

## Catch drift in product code and AI edits

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine write the generated UI to ui.json and check it against the design system` | Each component, prop or value the generated UI uses that your system does not have |

## Review the Figma library

| Ask in Claude Code | What you get |
|---|---|
| `/rms-design-system-engine how does our system build a component in Figma?` | Its construction rules (names, properties, variants, layers, auto layout, variables), each with how many components follow it, and the questions only your team can answer |
| `/rms-design-system-engine fix the construction of the chip in Figma` | What the chip must change to follow how your system builds components, renamed in Figma after you say yes |
