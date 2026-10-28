# Change a component in Figma

**Use when.** the person wants a component the system has changed in Figma ("add a size xl to the chip in Figma", "add a boolean showBadge on the button's icon", "rename the chip's Label layer to Text"), or a task from the team's tracker asks for one (a GitLab issue link): only what changes, the system's way, with a report of what it changes.

## Steps

1. Run `rms-design-system-engine --figma-change <component> "<the change, in the person's words>"`, or `--task <issue link>` for a task from the tracker. The engine reads the few changes it knows in words (add an option to an axis like another, add a property on a layer, rename, remove, bind a field to a variable, move a variable to another, the description); it says what it could not read.
2. What it could not read, or what it asks: write the change as operations in a JSON file in `.design-system-engine-out/`, only what changes, with the component's own layers, axes and properties and the system's variables and components (`rms-design-system-engine --query <component>` lists them), and run `rms-design-system-engine --figma-change <component> --ops <file>` (each operation: `--reference usage`, *--spec*). Never write a value of your own: ask the person.
3. Show the person the report as printed: what changes (its layers, its axes, options and properties, its variables), where the component is used, what breaks and what it adds to the system, and the faults it already had, which the change does not fix.
4. What breaks or adds waits for someone to sign it off: ask who, and run the same command with `--signed-off "<who>"`. The engine writes the script (`.design-system-engine-out/handback/figma-apply.js`). Ask the person, and only when they say yes, run it with the Figma MCP's `use_figma` exactly as written: it changes only the listed steps, in every variant, and returns what it changed, skipped and could not find. Tell the person.
5. Refresh the Figma snapshots (`--recipe refresh-figma`), then run `rms-design-system-engine --change-report <component>`: the read before beside the read after, and where it is not what the change said. Then `--construction-check` and `--hygiene`, and say what they find on it.

A change is made the system's way even on a component that breaks the system's rules: those faults are listed apart, and fixed only when someone asks (`--recipe figma-edits`).

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *--figma-change*
- `rms-design-system-engine --recipe build-component-figma`: a new component built like one the system has

```recipe-check
rms-design-system-engine --figma-change chip "add XL to Size like L"
```
