# Prototype

**Use when.** the person wants a prototype, a mock-up or a wireframe made with the design system ("prototype a settings page with our components", "mock up a checkout", "faz um protótipo do ecrã de perfil").

## Steps

1. Run `rms-design-system-engine --prototype --catalog`. It lists everything a prototype may use: the design system's components with their options, the engine's layout pieces with the spacing tokens and text styles they take, the format, and the prototypes already in `prototypes/`. Nothing outside that list exists for a prototype.
2. Write the prototype as a composition in `prototypes/<name>.json`, starting from the closest one already there when one fits. Use only the listed components and their options, and the engine's pieces for layout. Never write HTML, CSS or a component for it, and never change the system's files: the system stays as it is.
3. A need nothing in the list fits is a `Missing` box with the need written on it. A component used for a need it does not quite meet carries `standInFor` with that need. Never invent a component, an option, a colour or a size.
4. Run `rms-design-system-engine --prototype prototypes/<name>.json`. A composition with an error is not drawn: fix each ❌ line the way it says, and run it again until it is drawn.
5. Tell the person where the page is and every gap the engine lists, as written: what the system would need, and what the prototype uses meanwhile. The design team decides the gaps; never build one.

Screens designed in Figma become starting points with `rms-design-system-engine --prototype --from-screens <capture.json>` (the capture is read from Figma and never changes it).

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *Prototypes*

```recipe-check
rms-design-system-engine --prototype --catalog
```
