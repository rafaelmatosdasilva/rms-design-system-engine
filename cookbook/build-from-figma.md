# Build from Figma

**Use when.** the person has a design in Figma and wants it built in code: the design system's tokens and components, a component Figma has and the code does not yet, or a screen made from them ("build the button from Figma", "turn my Figma components into code", "constrói o design system a partir do Figma").

## Steps

1. No `ds-config.json` yet: set up first (`rms-design-system-engine --recipe first-setup`). A project with no CSS at all starts in build mode by itself. In a project that already has code, build mode is set only when the person asks (setup with `--build`, or `"build": true` in `ds-config.json`).
2. Refresh the Figma data (`rms-design-system-engine --recipe refresh-figma`). Build only from the engine's Figma facts, never from memory or a screenshot alone.
3. Run `rms-design-system-engine`. It lists what is left to build (`🧱 TO BUILD`), tokens first, and its NEXT line names the next item with its commands.
4. Tokens: copy the declarations the engine wrote in `.design-system-engine-out/handback/tokens-to-build.css` into the theme file it names, exactly as written, then run the engine again.
5. Components, one at a time, in the order NEXT gives: run `rms-design-system-engine --query <name>` and write the component exactly as its build sheet says: the class, the sizes and variables, the selector for each state and variant, the role, and the prop names. Inside it, use the system's own components, never a copy. Write no colour, size or variable the system does not have: use the closest one it has and say so, or ask.
6. Run `rms-design-system-engine --component <name>` and fix what it names until it passes, then build the next item.
7. Screens: build them only from the system's components and variables (`rms-design-system-engine --recipe ask-the-system`), and check each file with `rms-design-system-engine --check-ui <file>`.
8. At the end, say what was built and passes, what is left to build, and anything the system did not have.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *Build mode*
- `rms-design-system-engine --reference config`: *Project Config*

```recipe-check
rms-design-system-engine --summary
```
