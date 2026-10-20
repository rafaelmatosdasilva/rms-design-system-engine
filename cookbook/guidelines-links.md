# Add written guidelines

**Use when.** the person pastes a GitLab or Notion link to their guidelines or to their intent layer, or asks how good their guidelines are for agents.

## Steps

1. Run `rms-design-system-engine --guidelines <link>` (several links at once are fine). Never edit `ds-config.json` by hand and never fetch the page yourself.
2. Relay what it says. If the page could not be read, pass on the one fix it names; never ask for a token in the chat.
3. `--guidelines` with no link lists the links already set. Every run refreshes those pages and folds them into the design intent.
4. A GitLab project that holds the team's intent layer (DSDS pages: why each piece exists and how to use it): run `rms-design-system-engine --intent-layer <project link>` (`--entry=<path>` when it holds more than one `system.dsds.json`). Relay how many pages it read and how many are used by the agents, thin or not used; the style guide's Intent layer page lists, for each page, what does not reach the agents, why, what to change and whether to remove it.
5. Asked how good the guidelines are for agents: run `rms-design-system-engine --guidance-rating`. Add `--extract` only when they ask for a test with a model, since it spends their model tokens. Relay the class and what to add as it prints them.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *The design-intent layer*

```recipe-check
rms-design-system-engine --guidelines
```
