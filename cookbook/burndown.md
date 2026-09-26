# What to fix first

**Use when.** the person asks what to fix first, or wants to work a library down component by component.

## Steps

1. Run `rms-figma-code-parity`; its 📉 line counts open findings per component, most first, with a next-up line.
2. Recommend the next-up component, then `rms-figma-code-parity --component <name>`.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-figma-code-parity --reference config`: *Burndown*

```recipe-check
rms-figma-code-parity --summary
```
