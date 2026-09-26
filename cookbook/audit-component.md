# Check one component

**Use when.** the person names a component or a part of the design system ("audit the chip", "verifica o badge", "what is wrong with the status bar").

## Steps

1. If a live Figma refresh is available, refresh that component first (the main guide's rule on scoped runs; the capture is in `--recipe refresh-figma`). Otherwise audit the committed snapshots and say so.
2. Run `rms-figma-code-parity --component <name>` (several: `--component a,b`). The scope takes nested components with it.
3. Relay the SUMMARY. A measured difference names its rule, file and line, and the value to write there.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-figma-code-parity --reference usage`: *The code capture*, *Accessibility check*

```recipe-check
rms-figma-code-parity --component chip
```
