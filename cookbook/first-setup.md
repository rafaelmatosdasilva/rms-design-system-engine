# Set the parity up

**Use when.** the project has no `ds-config.json`, or the person asks to set the parity up.

## Steps

1. Run `rms-design-system-engine --init --figma-url='<Figma file URL>' --theme-css='<token CSS file>'` (the main guide's first-setup rule). Never write `ds-config.json` by hand.
2. A project that has only Figma (no token CSS yet): leave `--theme-css` out. Setup starts it in build mode, with the tokens to go in `src/styles/tokens.css`; then follow `rms-design-system-engine --recipe build-from-figma`.
3. Token values loaded from hosted stylesheets, one per mode: setup takes every one it finds into `src/styles/tokens.hosted.css`, each mode in its own block. When the code builds the address from parts, pass every combination it allows in `--theme-css` (comma separated URLs). Never ask the person which to take: all of them, always.
4. A folder with no code: setup stops and its NEXT line asks where the code is. Ask that one question; run setup again with `--project=<their folder or git link>` (a link is cloned, `owner/repo` means GitHub), or with `--build` when they only have Figma. Later runs from this folder go to that project by themselves.
5. It also installs the project's hooks. Then follow its NEXT line (the first run).

Ask the person only for the Figma link, and where the code is when setup asks. Every other choice takes the option that keeps the most of the system (every mode, every file), without a question.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Project Config*

```recipe-check
rms-design-system-engine --doctor
```
