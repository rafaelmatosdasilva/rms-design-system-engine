# Ask the design system for a component or a token

**Use when.** the person, or the UI being written, needs a component's props and their values, or a token's CSS variable and value ("what props does the chip take", "que valores aceita o size do badge", "which variable is radius/control").

## Steps

1. Run `rms-design-system-engine --query <component or token> [more …]` and answer from what it prints: the names exactly as written there, never guessed or re-cased. A prop marked "not in parity with the code" is written one way in Figma and another in the code; say so.
2. When it says there is no catalog yet, run `rms-design-system-engine` once, then ask again.
3. When UI is written with these names, check it with `rms-design-system-engine --check-ui <file>`.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *The component catalog*

```recipe-check
rms-design-system-engine --summary
```
