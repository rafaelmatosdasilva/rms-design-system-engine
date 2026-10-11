# Fix a difference

**Use when.** the person asks for a difference to be fixed, in the code or in Figma.

## Steps

1. Fix exactly what they asked for, nothing else. The measured difference names the rule, file and line, and the value to write.
2. For several code changes, `.design-system-engine-out/handback/code-changes.diff` holds them: show it, and apply it (`git apply`) only when they ask.
3. A value in Figma is never changed by the skill: `.design-system-engine-out/handback/figma-changes.md` lists what to change there, for the person to do. What the code already states and Figma does not (a component's role) is the `figma-edits` recipe, applied once the person says yes.
4. A component or token the system retired that is still used: `.design-system-engine-out/handback/migrations.md` lists what replaces each and every file and line, product by product, and `migrations*.diff` holds the token swaps. Show them, and apply only what the person asks for. A class a product styles almost as a system component is a decision for the person: use the component (with a new option if it needs one), or add the new one to the system. Never decide it yourself.
5. Run the same audit again to confirm.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Sending it back*, *Which side moved*

```recipe-check
rms-design-system-engine --summary
```
