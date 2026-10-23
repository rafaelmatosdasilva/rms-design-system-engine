# Set the parity up

**Use when.** the project has no `ds-config.json`, or the person asks to set the parity up.

## Steps

1. A company's setup first: when the person runs a company's command (`/rms-design-system-engine-<client>`) or gives its profile (a link or file), run `rms-design-system-engine --profile '<it>'` and ask nothing else: the profile says where the code, the Figma file and each part of the engine's files live, and the run says what GitLab lets this person write. Tokens stay in the person's own `.env` (`GITLAB_TOKEN` to read, and the write tokens the profile's stores name): never ask for one in the chat. To make one for a company, after this folder is set up: `--profile-new` (or `--store <part>.read=<link>` then `--profile-export`), then `--make-command <client> --profile <its link>`; tell the person, as its NEXT line says, to protect the stores' branches and give Developer only to who writes, in GitLab.
2. Ask the person, in one message, what the request leaves out: where the design system's code is (this folder, another folder, or a link to its repository on GitHub or GitLab), the link to its Figma file if they have one, and a link to its written documentation for agents if they have one (an intent layer on GitLab, a wiki or Notion page). The code is required; the other two are optional. Never ask for the documentation link on its own when nothing else is missing. Run nothing before the answer. A request that names the token file (`the tokens are in src/theme.css`) or the folder already says where the code is: ask nothing, and run the command the router gives (`--theme-css=<that file>`, or `--project=<the folder>`).
3. Run `rms-design-system-engine --init --project='<. for this folder, or their folder or repository link>' --figma-url='<Figma file URL>' --documentation='<documentation link>'` (the main guide's first-setup rule), leaving `--figma-url` and `--documentation` out when there is none. The engine tells from the link what it is: a GitLab project is the intent layer, a GitLab wiki or Markdown file or a Notion page is a guidelines page. For a project already set up, `--init --documentation=<link>` only adds the link. A GitHub link is cloned, `owner/repo` means GitHub. A GitLab link (gitlab.com or a company's own) is never cloned: the engine reads its latest commit through GitLab's API, so never run `git clone` for it. A private GitLab project needs `GITLAB_TOKEN` (`read_api` scope) in the `.env` of this folder, and `GITLAB_HOST=<its host>` for a company GitLab; when setup says GitLab refused or found nothing, tell the person to add them there themselves, and never ask for the token in the chat. Later runs from this folder go to that project by themselves. Never write `ds-config.json` by hand.
4. A code folder with no design tokens yet starts in build mode from Figma, with the tokens to go in `src/styles/tokens.css`; then follow `rms-design-system-engine --recipe build-from-figma`. A folder with no code at all: setup stops and asks whether the code is elsewhere or starts there (`--build`).
5. Token values loaded from hosted stylesheets, one per mode: setup takes every one it finds into `src/styles/tokens.hosted.css`, each mode in its own block. When the code builds the address from parts, pass every combination it allows in `--theme-css` (comma separated URLs). Never ask the person which to take: all of them, always.
6. No Figma file: setup goes on, and each run checks the code alone and says nothing was compared with Figma. The components are then the code's own: the design intent, the contracts, `llms.txt`, the catalog and the prototypes are built from them, with the documentation for agents.
7. It also installs the project's hooks. Then follow its NEXT line: the first run, or, when setup came from another request (the router adds `--then='<the request>'`, as "check buttonPrimary's accessibility"), that request routed again, so it is done, never dropped.

Ask the person only where the code is, for the Figma link and for the documentation link, and what setup's NEXT line asks. Every other choice takes the option that keeps the most of the system (every mode, every file), without a question.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *Project Config*

```recipe-check
rms-design-system-engine --doctor
```
