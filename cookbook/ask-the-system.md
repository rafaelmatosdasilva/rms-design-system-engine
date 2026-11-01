# Ask the design system for a component or a token

**Use when.** the person, or the UI being written, needs a component's props and their values, where a component is used, or a token's CSS variable and value ("what props does the chip take", "que valores aceita o size do badge", "where is the panel used", "which variable is radius/control"), or how the system builds a component in Figma ("what are our construction rules", "como é que construímos os componentes no Figma").

## Steps

1. Run `rms-design-system-engine --query <component or token> [more …]` and answer from what it prints: the names exactly as written there, never guessed or re-cased. A prop marked "not in parity with the code" is written one way in Figma and another in the code; say so. Asked where a component is used, or what changing it would touch, answer from its `lives in`, `inside`, `holds` and `on Figma screens` lines.
2. When it says there is no catalog yet, run `rms-design-system-engine` once, then ask again.
3. Asked how the system builds a component in Figma, run `rms-design-system-engine --query construction` and answer from it: each rule with how many components follow it and which do not, the variant axes already in use, and the questions only the team answers. Never state a rule it does not print.
4. When UI is written with these names, check it with `rms-design-system-engine --check-ui <file>`.
5. With no shell, the engine's MCP tools give the same answers: `query` (its `terms`) for steps 1 and 3, `check_ui` (its `file`) for step 4, `summary` for what the last audit found, `catalog` before building a screen. A command no tool covers needs a terminal: ask the person to run it, never say it ran. With a shell, the command line comes first.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *The component catalog*, *The construction grammar*

```recipe-check
rms-design-system-engine --summary
```
