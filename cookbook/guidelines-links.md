# Add written guidelines

**Use when.** the person pastes a GitLab or Notion link to their guidelines.

## Steps

1. Run `rms-figma-code-parity --guidelines <link>` (several links at once are fine). Never edit `ds-config.json` by hand and never fetch the page yourself.
2. Relay what it says. If the page could not be read, pass on the one fix it names; never ask for a token in the chat.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-figma-code-parity --reference usage`: *The design-intent layer*

```recipe-check
rms-figma-code-parity --guidelines
```
