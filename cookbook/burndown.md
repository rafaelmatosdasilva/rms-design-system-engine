# What to fix first

**Use when.** the person asks what to fix first, wants to work a library down component by component, or wants a product's way onto the system planned.

## Steps

1. Run `rms-design-system-engine`; its 📉 line counts open findings per component, most first, and the SUMMARY says `Fix first:` (a tie goes in name order, and says so).
2. Recommend that component, as the engine names it, then `rms-design-system-engine --component <name>`.
3. **(A product's plan.)** Run `rms-design-system-engine --adoption-plan <product>` and relay each step with who acts on it, its items with their size and places, and the check that says it is done. Change nothing in the product: a step is done by the people it names, and its patch is handed back when they ask.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Burndown*

```recipe-check
rms-design-system-engine --summary
```
