# Accessibility notes and findings

**Use when.** the person asks how to write accessibility notes in Figma, or about an accessibility finding.

## Steps

1. Notes use Figma's annotation tool, one fact per line: `Role: togglebutton`, `aria-label: Close dialog`, `Heading level 2`, `Alt: …`.
2. The accessibility check is advisory; run `rms-design-system-engine --a11y` for every element and where it is.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *Writing accessibility notes in Figma*, *Accessibility check*

```recipe-check
rms-design-system-engine --summary
```
