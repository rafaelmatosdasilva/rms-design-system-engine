# Accessibility notes and findings

**Use when.** the person asks how to write accessibility notes in Figma, or about an accessibility finding.

## Steps

1. Notes use Figma's annotation tool, in the Accessibility category, one fact per line: `Role: togglebutton`, `aria-label: Close dialog`, `Heading level 2`, `Alt: …`. A part's role goes on its own layer: `Role: label`, `Role: indicator`, `Role: decrement`. A note in Intent, Implementation, Content or Authoring is design intent, never checked and never a To do.
2. The accessibility check is advisory; run `rms-design-system-engine --a11y` for every element and where it is. While a component is being built, its lines are part of building it (the `NEXT:` line says so), except one that says to send it back to Figma: that one is the person's.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *Writing accessibility notes in Figma*, *Annotation categories*, *Accessibility check*

```recipe-check
rms-design-system-engine --summary
```
