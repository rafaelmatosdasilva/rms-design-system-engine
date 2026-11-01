# Assurance case

Why the engine can be trusted with a team's code, design files and credentials: what it protects, where the boundaries are, the design principles it follows, and the common weaknesses it counters. What it reads, sends and may change is listed on the [Security and data](details.md#security-and-data) page; how to report a problem is in [SECURITY.md](../SECURITY.md).

## What it protects

- **The team's code.** Product code is read, never written. Findings come back as patches for a person to apply.
- **The design file.** Figma is read; it is written only through a script the person says yes to, and never on CI.
- **Credentials.** Tokens for Figma, GitLab, GitHub and Notion stay in the person's own git-ignored `.env`.
- **The integrity of what people install.** The engine as published on GitHub and npm is what this repository built.

## Trust boundaries

| Boundary | What crosses it | How it is guarded |
|---|---|---|
| The project → the engine | Files, Figma data and pages the engine reads; all treated as untrusted input | Read as data; no project content is run as a shell command; only the person's own configured model command runs through a shell, with the text on its standard input |
| The engine → the browser | The project's own components, rendered in a local Chrome to measure them | A local headless browser on the person's machine; nothing is uploaded |
| The engine → hosted services | Requests to Figma, the code host and Notion, with the person's token | Each token is sent only to its own host and never printed |
| The engine → the AI agent | Commands, findings and guidance to Claude Code | Hooks make the agent ask before a commit, a push or a setting change, and it cannot make a check pass on its own |
| This repository → the registries | Releases to GitHub and npm | Workflows hold read-only tokens; only the release job writes; publishing uses OIDC trusted publishing with signed provenance; no stored publishing token exists |

## Secure design principles

- **Least privilege.** Read-only workflow tokens; each place the engine may write is set to yes, ask or no per project; product code is never on that list.
- **Fail-safe defaults.** On CI, "ask" becomes "no", and CI never writes the design file or product code. A check that could not run says Not run, never Pass.
- **Complete mediation.** Every UI edit the AI makes is checked as it is made, and changes to the engine's own records wait for the person.
- **Economy of mechanism.** No npm dependencies: plain Node modules, so there is little third-party code to trust.
- **Open design.** The code, tests, release workflow and this case are public; nothing relies on being hidden.
- **Separation of duties.** The privacy check, the test suite and CodeQL must all pass before anything merges to main.

## Common weaknesses countered

| Weakness | Countermeasure |
|---|---|
| Command injection (CWE-78) | Commands are started with argument lists, not shell strings; the one shell use runs the person's own configured command |
| Exposure of credentials (CWE-200, CWE-532) | Tokens live in a git-ignored `.env`, are sent only to their host, are never printed; a required privacy check refuses private names and addresses on every pull request |
| Cross-site scripting in the style guide (CWE-79) | Project data is embedded as JSON with `<` escaped, the page escapes text through one helper when it shows it, and icons are stripped of scripts and event attributes |
| Prototype pollution (CWE-1321) | Name lookups use own keys only; found and covered by the property tests |
| Supply-chain compromise (CWE-1357) | No runtime dependencies; workflow actions pinned by commit; test tools installed from committed lockfiles; advisories tracked by OpenSSF Scorecard |
| Tampered releases (CWE-494) | Each release carries a Sigstore provenance attestation (`gh attestation verify`), and npm versions carry npm provenance |

## How this is checked

- **On every change:** the full test suite (more than 2,000 tests, including planted mistakes and property tests with fast-check), CodeQL code scanning, and the privacy check, all required before a merge.
- **Every week:** OpenSSF Scorecard, on every change to main as well.
- **Self-certified:** the [OpenSSF Best Practices](https://www.bestpractices.dev/projects/16082) passing level.

## Known limits

- One maintainer has admin access, so changes are not yet reviewed by a second person ([GOVERNANCE.md](../GOVERNANCE.md)).
- The engine renders the project's own components in a local browser, so it runs that project's code. Use it on projects you would build yourself.
- Through Claude Code, what the agent reads goes to Anthropic under the person's own account and its terms.
