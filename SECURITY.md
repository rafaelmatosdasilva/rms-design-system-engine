# Security policy

## Report a vulnerability

Report it privately, never in a public issue: on this repository's **Security** tab, choose **Report a vulnerability**. The aim is an answer within a week, and a fix or a plan within thirty days. Once the fix ships, the advisory is published with your name, if you want it there.

Worth reporting:

- A token sent anywhere but its own host, or printed.
- A write the engine makes without the yes its setting asks for, or any write to code people wrote.
- A run on CI that writes the design file or product code.
- A command built from what a project, Figma file or page contains that runs something else.
- Anything sent to a host the [Security and data](docs/details.md#security-and-data) page does not list.

## Supported versions

Only the latest `main` is supported. The engine updates itself once a day, so a fix reaches every install without anyone acting. An install with the self-update turned off takes it with `rms-design-system-engine --update`.

## How the engine is kept safe

- **No npm dependencies.** There is no third-party package to compromise.
- **Every change goes through a pull request.** Main takes no direct push, a privacy check must pass before anything merges, and the full test suite runs on every change.
- **[OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/rafaelmatosdasilva/rms-design-system-engine)** scores how the repository is kept, on every change to main and every week.
- **What it reads, sends and may change** is on the [Security and data](docs/details.md#security-and-data) page.
