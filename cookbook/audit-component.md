# Check one component

**Use when.** the person names a component or a part of the design system ("audit the chip", "verifica o badge", "what is wrong with the status bar").

## Steps

1. Naming a part is the request to scope to it: the person never has to say "scoped" or know the flag. Run unscoped only when they ask for the whole system.
2. If a live Figma refresh is available (a token, an MCP or the Plugin API), refresh that component first: its bound and variant tokens, so a new variable on it is caught, and its structure with its variant set, so it becoming a set, gaining a variant or changing a slot is caught. Then reconcile and stamp `_figmaVersion` (the capture is in `--recipe refresh-figma`). Otherwise audit the committed snapshots and say so.
3. Run `rms-design-system-engine --component <name>` (several: `--component a,b`). The scope takes nested components with it, and every finding outside it is folded into one "outside scope, not audited" line that never fails the run.
4. Relay the SUMMARY. A measured difference names its rule, file and line, and the value to write there. Never run the whole Phase 1 and Phase 2 workflow for one component: a gate then fails on something nobody asked about.

**Why a scoped run still refreshes.** Someone scopes to a component because they just changed it, so its old snapshot is the one thing that cannot be trusted. A `panel` run once read all green while the designer had just split `panel/background/color` into a primary and a new secondary variable and made the panel a `type=primary/secondary` set: the committed snapshot knew none of it, and `versionLockStrict` did not help, since the inventory compares names and `panel` was still `panel`. Never stamp `_figmaVersion` from a capture that skipped the component's variants or variables: the version then reads fresh over exactly the change that was to be checked.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *The code capture*, *Accessibility check*

```recipe-check
rms-design-system-engine --component chip
```
