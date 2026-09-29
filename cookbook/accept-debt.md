# Accept known differences

**Use when.** the person wants known differences to stop failing while everything else stays strict.

## Steps

1. One difference or a few: `rms-figma-code-parity --baseline --findings` (each failing line accepted on its own), with `--component <name>` when the person names a component (it adds to the file and keeps every other accepted line). Whole gates: `rms-figma-code-parity --baseline`.
2. Only when the person asks. Say that `parity-baseline.json` holds the debt; commit it only when they ask.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-figma-code-parity --reference usage`: *Adoption baseline / ratchet*

```recipe-check
rms-figma-code-parity --summary
```
