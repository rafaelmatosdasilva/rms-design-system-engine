# Fix a difference

**Use when.** the person asks for a difference to be fixed, in the code or in Figma.

## Steps

1. Fix exactly what they asked for, nothing else. The measured difference names the rule, file and line, and the value to write.
2. For several code changes, `.design-system-engine-out/handback/code-changes.diff` holds them: show it, and apply it (`git apply`) only when they ask.
3. Figma is never changed by the skill: `.design-system-engine-out/handback/figma-changes.md` lists what to change there, for the person to do.
4. Run the same audit again to confirm.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Sending it back*, *Which side moved*

```recipe-check
rms-design-system-engine --summary
```
