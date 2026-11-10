# Security

What the engine reads, sends and may change, and why it can be trusted with a team's code, design files and credentials. How to report a problem is in [the security policy](../.github/SECURITY.md). All pages: [technical documentation](README.md).

**On this page**

- [Security and data](#security-and-data)
- [Assurance case](#assurance-case)

## Security and data

What a security review asks, in one place.

### At a glance

For whoever approves tools for a team: each line links to its detail below.

- **No telemetry.** The engine sends nothing about you, your project or how you use it to its author or anyone else. There is no analytics, no crash report and no usage ping.
- **No server and no account.** It runs on your computer or your CI runner, as plain Node scripts ([what runs where](#what-runs-where)).
- **No npm dependencies.** No third-party package to trust.
- **A fixed list of hosts.** It talks only to the services you use (Figma, your code host, Notion) and the few downloads listed in [what goes over the network](#what-goes-over-the-network). [Allow it through a firewall](#allow-it-through-a-firewall) lists them by name.
- **Your tokens stay with you.** Each lives in your own git-ignored `.env`, goes only to its own host, and is never printed ([tokens](#tokens)).
- **It never changes code people wrote.** Findings come back as patches for a person to apply ([what it may change](#what-it-may-change)).
- **What it keeps is in your project.** Nothing is stored anywhere else but one list of the pages it built ([what it keeps on disk](#what-it-keeps-on-disk)).
- **Compliance.** No personal data is collected or processed, and nothing runs on a server of ours ([compliance](#compliance)).

### What runs where

- **On your computer, or your CI runner.** The engine is a set of Node scripts. There is no engine server and no engine account, and nothing it reads is sent to its author.
- **No npm dependencies.** `package.json` lists none, so there is no third-party package to trust. What it uses beside Node is yours: Chrome, TypeScript, and axe-core, which the installer fetches.
- **Your own sign-ins.** It reaches Figma, your code host and Notion with your own access, so your company's single sign-on and permissions on those tools apply as they are.
- **The AI model is your Claude account's.** In Claude Code, what the agent reads (files, command output) goes to Anthropic under your account and its terms. The checks themselves are measured, not asked of a model. Three steps ask one, each only when you ask, through your own `claude` command: rating your written guidance (the command can be changed, `guidelines.extract.cmd`), judging your Showroom screens on their screenshots (`pageJudgment.cmd`) and drafting changes to the intent layer.

### What goes over the network

| To | When | What |
|---|---|---|
| Figma's API | Refreshing Figma with `FIGMA_TOKEN`, and the style guide's Figma images | Reads the file. Writes only through the script you said yes to |
| Your GitLab or GitHub | Reading code or documentation kept there | Reads. Writes only where the [write setting](setup.md#where-the-engine-may-write-and-where-it-must-never) says yes |
| GitHub | Installing, and the daily self-update (`DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1` turns it off) | A `git pull` of the engine |
| Notion's API | Only when guidelines are kept in Notion, with `NOTION_TOKEN` | Reads the pages shared with that integration |
| cdnjs | Installing axe-core | A download |
| Google Fonts and Fontsource | Building the style guide, when the system uses their web fonts | The font names, so the fonts are embedded in the page |

Nothing else. figma-cli, the MCP server, Chrome and the usage log (`DESIGN_SYSTEM_ENGINE_USAGE_LOG=1`) stay on your computer. A Figma webhook exists only if you deploy `webhook-server.mjs` yourself.

### Tokens

- Each token lives in a `.env` in the folder you run the engine from, kept out of git, per person. The installer asks for it hidden and writes a `.env` only you can read.
- Each is sent only to its own host and never printed.
- The least each needs: `GITLAB_TOKEN` with `read_api` to read; a Figma token that reads files.
- None is required. Your own git access reads and writes code hosts, and figma-cli or your Claude session's Figma tool reads Figma.

### What it may change

- **Code people wrote: never.** What it finds comes back as a patch for a person to apply.
- **Figma, generated code, its own files, your issue tracker:** yes, ask or no, per project ([where the engine may write](setup.md#where-the-engine-may-write-and-where-it-must-never)). On CI, ask becomes no, and the design file and product code are never written.
- **In Claude Code,** the hooks make the AI ask before a commit, a push or a setting change, and it cannot make a check pass on its own ([the hooks keep the rules](setup.md#the-hooks-keep-the-rules)).
- **In git,** a commit warns and a push refuses only for what the change uses ([a commit warns, a push refuses](audit.md#a-commit-warns-a-push-refuses)).

### What it keeps on disk

Everything it writes stays on your computer, and almost all of it in the project you run it in:

- **The captures it reads from Figma and the code** (`*.snapshot.json`), where `ds-config.json` says.
- **What it builds** (the style guide, findings, contracts), in `.design-system-engine-out/`.
- **Your tokens,** in the git-ignored `.env`, only when you put them there.
- **A usage log,** only when you turn it on (`DESIGN_SYSTEM_ENGINE_USAGE_LOG=1`): which route each request took, never the request's text, in `.design-system-engine-out/skill-usage.json`.
- **Outside the project, one file:** the list of style guide pages this computer built, so they can be rebuilt when the engine updates (`~/.claude/.rms-design-system-engine-pages.json`). It holds paths only.

Delete the project's `.design-system-engine-out/` and that one file, and nothing of the engine's is left beside the engine itself.

### Allow it through a firewall

An IT team can allow only these hosts. Leave out the ones for a service you do not use.

| Host | For |
|---|---|
| `api.figma.com`, `www.figma.com` | Reading the Figma file and its images |
| Your GitLab host, or `github.com`, `api.github.com` and `raw.githubusercontent.com` | Reading code and documentation, installing and the daily self-update |
| `api.notion.com` | Guidelines kept in Notion |
| `cdnjs.cloudflare.com`, with `registry.npmjs.org` as its fallback | Downloading axe-core once, for the accessibility checks |
| `fonts.googleapis.com`, `fonts.gstatic.com`, `api.fontsource.org` and `cdn.jsdelivr.net` | Embedding the system's web fonts in the style guide |

With the self-update off (`DESIGN_SYSTEM_ENGINE_NO_AUTO_UPDATE=1`) and axe-core already downloaded, the engine needs only the hosts of the services your system lives in.

### Compliance

- **GDPR.** The engine collects and processes no personal data of its own. What it reads (files, design files, commit authors on History) stays on your computer, under your own access.
- **SOC 2 and ISO 27001.** Not held: there is no service to certify. The engine is software you run, so your own controls apply to it as to any tool on your machines.
- **HIPAA.** Not applicable: it is not built to read or store health data.
- **The AI model.** In Claude Code, the agent's work goes to Anthropic under your own account and its terms, which your organisation's agreement with Anthropic covers.

### Install without piping into a shell

Read the script first, or clone and run it:

```bash
git clone https://github.com/rafaelmatosdasilva/rms-design-system-engine ~/.claude/skills/rms-design-system-engine
bash ~/.claude/skills/rms-design-system-engine/install.sh
```

## Assurance case

Why the engine can be trusted with a team's code, design files and credentials: what it protects, where the boundaries are, the design principles it follows, and the common weaknesses it counters. What it reads, sends and may change is listed on the [Security and data](#security-and-data) page; how to report a problem is in [SECURITY.md](../.github/SECURITY.md).

### What it protects

- **The team's code.** Product code is read, never written. Findings come back as patches for a person to apply.
- **The design file.** Figma is read; it is written only through a script the person says yes to, and never on CI.
- **Credentials.** Tokens for Figma, GitLab, GitHub and Notion stay in the person's own git-ignored `.env`.
- **The integrity of what people install.** The engine as published on GitHub and npm is what this repository built.

### Trust boundaries

| Boundary | What crosses it | How it is guarded |
|---|---|---|
| The project → the engine | Files, Figma data and pages the engine reads; all treated as untrusted input | Read as data; no project content is run as a shell command; only the person's own configured model command runs through a shell, with the text on its standard input |
| The engine → the browser | The project's own components, rendered in a local Chrome to measure them | A local headless browser on the person's machine; nothing is uploaded |
| The engine → hosted services | Requests to Figma, the code host and Notion, with the person's token | Each token is sent only to its own host and never printed |
| The engine → the AI agent | Commands, findings and guidance to Claude Code | Hooks make the agent ask before a commit, a push or a setting change, and it cannot make a check pass on its own |
| This repository → the registries | Releases to GitHub and npm | Workflows hold read-only tokens; only the release job writes; publishing uses OIDC trusted publishing with signed provenance; no stored publishing token exists |

### Secure design principles

- **Least privilege.** Read-only workflow tokens; each place the engine may write is set to yes, ask or no per project; product code is never on that list.
- **Fail-safe defaults.** On CI, "ask" becomes "no", and CI never writes the design file or product code. A check that could not run says Not run, never Pass.
- **Complete mediation.** Every UI edit the AI makes is checked as it is made, and changes to the engine's own records wait for the person.
- **Economy of mechanism.** No npm dependencies: plain Node modules, so there is little third-party code to trust.
- **Open design.** The code, tests, release workflow and this case are public; nothing relies on being hidden.
- **Separation of duties.** The privacy check, the test suite and CodeQL must all pass before anything merges to main.

### Common weaknesses countered

| Weakness | Countermeasure |
|---|---|
| Command injection (CWE-78) | Commands are started with argument lists, not shell strings; the one shell use runs the person's own configured command |
| Exposure of credentials (CWE-200, CWE-532) | Tokens live in a git-ignored `.env`, are sent only to their host, are never printed; a required privacy check refuses private names and addresses on every pull request |
| Cross-site scripting in the style guide (CWE-79) | Project data is embedded as JSON with `<` escaped, the page escapes text through one helper when it shows it, and icons are stripped of scripts and event attributes |
| Prototype pollution (CWE-1321) | Name lookups use own keys only; found and covered by the property tests |
| Supply-chain compromise (CWE-1357) | No runtime dependencies; workflow actions pinned by commit and watched for updates, so a pin never outlives its own security fixes; test tools installed from committed lockfiles; advisories tracked by OpenSSF Scorecard |
| Tampered releases (CWE-494) | Each release carries a Sigstore provenance attestation (`gh attestation verify`), and npm versions carry npm provenance |

### How this is checked

- **On every change:** the full test suite (more than 2,000 tests, including planted mistakes and property tests with fast-check), CodeQL code scanning, and the privacy check, all required before a merge.
- **Every week:** OpenSSF Scorecard, on every change to main as well; and Dependabot, which opens one pull request for the pinned actions that moved.
- **Self-certified:** the [OpenSSF Best Practices](https://www.bestpractices.dev/projects/16082) passing level.

### Known limits

- One maintainer has admin access, so changes are not yet reviewed by a second person ([GOVERNANCE.md](governance.md)).
- The engine renders the project's own components in a local browser, so it runs that project's code. Use it on projects you would build yourself.
- Through Claude Code, what the agent reads goes to Anthropic under the person's own account and its terms.
