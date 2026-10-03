# Set the parity up

**Use when.** the project has no `ds-config.json`, or the person asks to set the parity up.

## Steps

1. Run `rms-design-system-engine --init --figma-url='<Figma file URL>' --theme-css='<token CSS file>'` (the main guide's first-setup rule). Never write `ds-config.json` by hand.
2. A project that has only Figma (no token CSS yet): leave `--theme-css` out. Setup starts it in build mode, with the tokens to go in `src/styles/tokens.css`; then follow `rms-design-system-engine --recipe build-from-figma`.
3. It also installs the project's hooks. Then follow its NEXT line (the first run).

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Project Config*

```recipe-check
rms-design-system-engine --doctor
```
