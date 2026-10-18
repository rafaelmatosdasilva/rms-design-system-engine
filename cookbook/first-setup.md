# Set the parity up

**Use when.** the project has no `ds-config.json`, or the person asks to set the parity up.

## Steps

1. Ask the person, in one message, what the request leaves out: where the design system's code is (this folder, another folder, or a link to its repository on GitHub or GitLab), and the link to its Figma file if they have one. The code is required; the Figma link is optional. Run nothing before the answer. A request that names the token file (`the tokens are in src/theme.css`) or the folder already says where the code is: ask nothing, and run the command the router gives (`--theme-css=<that file>`, or `--project=<the folder>`).
2. Run `rms-design-system-engine --init --project='<. for this folder, or their folder or repository link>' --figma-url='<Figma file URL>'` (the main guide's first-setup rule), leaving `--figma-url` out when there is no Figma file. A GitHub link is cloned, `owner/repo` means GitHub. A GitLab link (gitlab.com or a company's own) is never cloned: the engine reads its latest commit through GitLab's API, so never run `git clone` for it. A private GitLab project needs `GITLAB_TOKEN` (`read_api` scope) in the `.env` of this folder, and `GITLAB_HOST=<its host>` for a company GitLab; when setup says GitLab refused or found nothing, tell the person to add them there themselves, and never ask for the token in the chat. Later runs from this folder go to that project by themselves. Never write `ds-config.json` by hand.
3. A code folder with no design tokens yet starts in build mode from Figma, with the tokens to go in `src/styles/tokens.css`; then follow `rms-design-system-engine --recipe build-from-figma`. A folder with no code at all: setup stops and asks whether the code is elsewhere or starts there (`--build`).
4. Token values loaded from hosted stylesheets, one per mode: setup takes every one it finds into `src/styles/tokens.hosted.css`, each mode in its own block. When the code builds the address from parts, pass every combination it allows in `--theme-css` (comma separated URLs). Never ask the person which to take: all of them, always.
5. No Figma file: setup goes on, and each run checks the code alone and says nothing was compared with Figma.
6. It also installs the project's hooks. Then follow its NEXT line: the first run, or, when setup came from another request (the router adds `--then='<the request>'`, as "check buttonPrimary's accessibility"), that request routed again, so it is done, never dropped.

Ask the person only where the code is and for the Figma link, and what setup's NEXT line asks. Every other choice takes the option that keeps the most of the system (every mode, every file), without a question.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Project Config*

```recipe-check
rms-design-system-engine --doctor
```
