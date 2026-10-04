# Bring Figma in line with the code

**Use when.** the person wants Figma updated to state what the code already has ("update Figma to match the code", "add the roles in Figma"), or a run's `NEXT:` line lists Figma edits the engine can make.

## Steps

1. Run `rms-design-system-engine --figma-edits`. It reads each component's role from what the code renders (every instance it shows; the one most of them have) and lists the Figma components that state no role, each with the annotation it would add (`Role: button`) and why. A component whose Figma role and code role differ is listed for a person to decide, and never changed.
2. Show the person that list, as printed, and ask whether to apply it. Change nothing in Figma before they say yes.
3. When they say yes, run `.design-system-engine-out/handback/figma-apply.js` with the Figma MCP's `use_figma` on the project's Figma file, exactly as the engine wrote it (the project's hooks refuse any other Figma write). It changes only what was listed, leaves a component that already states a role as it is, and returns what it changed, skipped and could not find: tell the person.
4. Then refresh the Figma snapshots (`--recipe refresh-figma`), so the next audit reads the new annotations.

What needs a person's words or a design decision is never written in Figma: a description, a component the code lacks, a screen's layout. Those stay in `.design-system-engine-out/handback/figma-changes.md` for the design team.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *--figma-edits*
- `rms-design-system-engine --recipe a11y-notes`: how the engine reads a role note in Figma

```recipe-check
rms-design-system-engine --figma-edits
```
