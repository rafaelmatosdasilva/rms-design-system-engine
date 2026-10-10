# Set the parity up

**Use when.** the project has no `ds-config.json`, or the person asks to set the parity up.

## Steps

1. Ask the person, in one message, what the request leaves out: where the design system's code is (this folder, another folder or a git link), and the link to its Figma file if they have one. The code is required; the Figma link is optional. Run nothing before the answer.
2. Run `rms-design-system-engine --init --project='<. for this folder, or their folder or git link>' --figma-url='<Figma file URL>'` (the main guide's first-setup rule), leaving `--figma-url` out when there is no Figma file. A link is cloned, `owner/repo` means GitHub; later runs from this folder go to that project by themselves. Never write `ds-config.json` by hand.
3. A code folder with no design tokens yet starts in build mode from Figma, with the tokens to go in `src/styles/tokens.css`; then follow `rms-design-system-engine --recipe build-from-figma`. A folder with no code at all: setup stops and asks whether the code is elsewhere or starts there (`--build`).
4. Token values loaded from hosted stylesheets, one per mode: setup takes every one it finds into `src/styles/tokens.hosted.css`, each mode in its own block. When the code builds the address from parts, pass every combination it allows in `--theme-css` (comma separated URLs). Never ask the person which to take: all of them, always.
5. No Figma file: setup goes on, and each run checks the code alone and says nothing was compared with Figma.
6. It also installs the project's hooks. Then follow its NEXT line (the first run).

Ask the person only where the code is and for the Figma link, and what setup's NEXT line asks. Every other choice takes the option that keeps the most of the system (every mode, every file), without a question.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Project Config*

```recipe-check
rms-design-system-engine --doctor
```
