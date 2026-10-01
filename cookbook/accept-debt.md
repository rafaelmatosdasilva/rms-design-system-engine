# Accept known differences

**Use when.** the person wants known differences to stop failing while everything else stays strict.

## Steps

1. One difference or a few: `rms-design-system-engine --baseline --findings` (each failing line accepted on its own), with `--component <name>` when the person names a component (it adds to the file and keeps every other accepted line), and `--match <word>` when they name the kind of difference (`--match radi` for the radius): only those lines are accepted, and the rest keeps failing. Never narrow `design-system-engine-baseline.json` by hand. Whole gates: `rms-design-system-engine --baseline`.
2. Only when the person asks. Say that `design-system-engine-baseline.json` holds the debt; commit it only when they ask.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *Adoption baseline / ratchet*

```recipe-check
rms-design-system-engine --summary
```
