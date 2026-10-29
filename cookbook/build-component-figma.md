# Build a component in Figma

**Use when.** the person wants a new component made in Figma ("make a tag like the chip in Figma", "create a danger button in Figma, like the secondary one"), described in words, the system's way: from the component it is most like, with only the system's variables, components and names.

## Steps

1. Run `rms-design-system-engine --spec "<what the person asked, in their words>"`. Add `--like <component>` when they said which one it is like, and `--name <name>` when they named it. The engine finds the component it is like, starts the spec as a copy of it, reads what else the words ask of it ("with a size xl like l", "without the icon"), and prints what it is made of, how it differs from the one it is like, the names it wrote the system's way, what it adds to the system (held for sign-off), and the questions it cannot answer from the system, among them what it asked and could not read.
2. No component is like it, or the engine asks which one: ask the person. When none is, it starts from nothing but auto layout (a `create` operation, step 4).
3. Ask the person each question, as printed. Every answer is one of the system's own things: a variable, a component, a text style, a layer the one it is like has. Never answer with a value of your own (a colour, a size): when the system has nothing for it, say so, and leave it out. For the variables made for the one it is like, the question names the shared one each points at: when the person picks those, add `--shared` to the next `--spec` run instead of writing a rebind for each.
4. Write the answers as operations, every one so far, in a JSON file in `.design-system-engine-out/`, and run `rms-design-system-engine --spec --name <name> --ops <file>`. The operations, one per step: `rename`, `addOption`, `removeOption`, `addAxis`, `addProperty`, `removeProperty`, `setDefault`, `addLayer`, `removeLayer`, `bind`, `rebind`, `describe`, `place` (each one's fields: `--reference usage`, *--spec*). For example `[{ "op": "rebind", "from": "<the one it is like>/label/color", "to": "text/default" }, { "op": "describe", "text": "…" }]`. Repeat until it asks nothing.
5. Show the person the spec as printed, and what it adds to the system. A new component waits for someone to sign it off: ask who (the system's owner, or the person if they are), and run `rms-design-system-engine --figma-build <name> --signed-off "<who>"`.
6. The engine lists the steps it builds and writes the script (`.design-system-engine-out/handback/figma-apply.js`). Ask the person, and only when they say yes, run it with the Figma MCP's `use_figma` on the project's Figma file, exactly as written: it copies the component, makes only the listed steps, and returns what it changed, skipped and could not find. Tell the person.
7. Refresh the Figma snapshots (`--recipe refresh-figma`), then run `rms-design-system-engine --construction-check` and `rms-design-system-engine --hygiene`, and say what they find on the new component.

The engine never draws a component from memory, and never writes a value the system does not have: what it cannot ground is a question. What it builds follows the system's rules for names (the construction grammar, `--query construction`).

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *--spec*
- `rms-design-system-engine --recipe figma-edits`: Figma brought in line with the code, through the same script

```recipe-check
rms-design-system-engine --spec "a pill like the chip, called pill"
```
