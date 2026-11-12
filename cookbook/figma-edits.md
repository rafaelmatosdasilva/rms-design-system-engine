# Bring Figma in line with the code

**Use when.** the person wants Figma updated to state what the code already has ("update Figma to match the code", "add the roles in Figma"), the accessibility findings pinned on the designed screens or each component's accessibility spec written in Figma ("pin the accessibility findings in Figma"), the prototypes' gaps sent to Figma as the design team's to do list ("send the gaps to Figma"), the intent layer's descriptions, a spec page beside each component or the token values the code changed first written into Figma ("write the spec pages into Figma"), a component made to follow how the system builds components ("fix the construction of the chip in Figma", a fix copied from the style guide's Rules page), or a run's `NEXT:` line lists Figma edits the engine can make.

## Steps

1. Run `rms-design-system-engine --figma-edits`. It reads each component's role from what the code renders (every instance it shows; the one most of them have) and lists the Figma components that state no role, each with the annotation it would add (`Role: button`) and why. A component whose Figma role and code role differ is listed for a person to decide, and never changed. Every property or option named otherwise than most of the system's (show-icon beside Show Icon, true beside True) is listed with its rename. Every need the prototypes found the system lacks (`.design-system-engine-out/prototypes/gaps.json`) is listed too, as the design team's to do list: a page "Design system to do" with a frame "Gaps from prototypes", one card per need, the most needed first. Each component's accessibility spec from the code (role, name, states, keys, what a screen reader says) is listed, and, once the screens are read with `--figma-a11y`, each screen with its accessibility findings to pin on their layers and its summary. What the intent layer says each component and token is for (never a draft) is listed as descriptions, a spec page beside each component set, and each token value the code changed since the two sides agreed, with its value before and after; a token both changed, or an alias in Figma, is listed for the person and never written.
2. Show the person that list, as printed. When it holds more than one kind of change (roles, accessibility-specs, accessibility-review, renames, dev-mode, to-do, descriptions, spec-pages, tokens), its `NEXT:` line names each: ask about each kind on its own, and run `rms-design-system-engine --figma-edits <the kinds they said yes to>`; no script is written until then. A request that names a kind ("write the spec pages into Figma") starts with that kind alone. Change nothing in Figma before they say yes.
3. When they say yes, run `.design-system-engine-out/handback/figma-apply.js` with the Figma MCP's `use_figma` on the project's Figma file, exactly as the engine wrote it (the project's hooks refuse any other Figma write). It changes only what was listed (renaming options in each variant's name, then properties), leaves a component that already states a role or a name already renamed as it is, writes the to do list afresh on its own page, replaces the accessibility specs and the screens' review the last run wrote (in the categories Accessibility and Accessibility Review), keeps every annotation a person wrote, and returns what it changed, skipped and could not find, and the to do list it wrote: tell the person.
4. Then refresh the Figma snapshots (`--recipe refresh-figma`), so the next audit reads the new annotations and names; a renamed property is then the new name in each component's code contract, which the audit says.

## Taking a change back

Every write the script makes records what it replaces, and once it has run the project's hooks write the way back beside it: `.design-system-engine-out/handback/figma-undo.js`, with what it holds in `figma-undo.json`, and say so. When the person wants a change taken back:

1. Run `rms-design-system-engine --figma-undo`: it says what the way back puts back, step by step. Show the person that, as printed, and ask. Run nothing before they say yes.
2. When they say yes, run `figma-undo.js` with the Figma MCP's `use_figma`, exactly as written. It puts back what the change replaced, newest first, and touches nothing else. Where part of the change has no way back it refuses and changes nothing: tell the person what cannot be taken back, and that the file's version history is the only way, which drops everyone's work since.
3. Refresh the Figma snapshots, then run `rms-design-system-engine --change-report <component>` for a component the change touched: it says whether the file is back to the read before.

A frame the engine writes afresh on every run (a spec page, the to do page) has no way back to an earlier copy: running the hand-back again writes it again.

A component made to follow how the system builds components (its construction grammar, `--query construction`): run `rms-design-system-engine --figma-fix <component>` (or what the copied fix says), show the person the renames it lists, and run the same script once they say yes. A layer Figma left unnamed: read what it holds, propose a name, and once they agree run it again with `--to <name>`. Layout and variable bindings it only says: tell the person what to change, step by step.

The accessibility the design owes (each text colour below its contrast, a focus ring under 3:1, a control under 24px, a role or name note missing) is listed by `--figma-edits` too and, once the person says yes, written by the same script as one card each in an "Accessibility the design owes" frame on the "Design system to do" page, rewritten each run so a fixed gap clears.

What needs a person's words or a design decision is never written in Figma: a description the intent layer does not hold as the team's word yet, a component the code lacks, a screen's layout. Those stay in `.design-system-engine-out/handback/figma-changes.md` for the design team.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *--figma-edits*
- `rms-design-system-engine --recipe a11y-notes`: how the engine reads a role note in Figma

```recipe-check
rms-design-system-engine --figma-edits
```
