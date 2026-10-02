# What to fix first

**Use when.** the person asks what to fix first, or wants to work a library down component by component.

## Steps

1. Run `rms-design-system-engine`; its 📉 line counts open findings per component, most first, and the SUMMARY says `Fix first:` (a tie goes in name order, and says so).
2. Recommend that component, as the engine names it, then `rms-design-system-engine --component <name>`.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Burndown*

```recipe-check
rms-design-system-engine --summary
```
