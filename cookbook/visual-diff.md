# Compare components with their Figma images

**Use when.** the person wants each component compared with its Figma image.

## Steps

1. It is `codeReading.visual: true` in `ds-config.json`; editing the config asks the person first.
2. Figma images come from `.design-system-engine-refs/components/<name>.png` (exported at 2x) or the Figma REST API with `FIGMA_TOKEN` in `.env`.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --recipe refresh-figma`: *Each component against its Figma image*

```recipe-check
rms-design-system-engine --summary
```
