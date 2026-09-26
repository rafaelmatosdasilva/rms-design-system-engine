# States, variants and combinations

**Use when.** the person asks about states (hover, disabled, error…), variants, variant combinations, or a "while disabled" finding.

## Steps

1. State props come from `ds-config.json` `states`, else from the names; variants from the contract's `propertyMap`.
2. A "hover while disabled" finding means the hover or press style lacks a `:not(:disabled)` guard.
3. Explain from the finding's rule, file and line; change code only when asked.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-figma-code-parity --reference config`: *More settings* (`states`)
- `rms-figma-code-parity --recipe refresh-figma`: *Disabled wins*, the variant capture

```recipe-check
rms-figma-code-parity --component button
```
