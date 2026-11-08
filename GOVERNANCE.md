# Governance

## How the project is run

The engine has one maintainer, who decides what is built, reviews every change and publishes the releases. Anyone can propose a change by opening an issue, and the maintainer answers each one and explains a refusal. Pull requests from others are not accepted; [CONTRIBUTING.md](CONTRIBUTING.md) says how to take part.

What decides a change:

- It does what the engine says it does, and says what it could not check rather than passing it.
- It passes the privacy check, the full test suite and CodeQL's code scanning. GitHub refuses a merge to main until all three pass.
- It keeps the engine free of npm dependencies, and keeps product code read-only.
- The public documentation says the same as the code.

## Roles and responsibilities

| Role | Who | Responsible for |
|---|---|---|
| Maintainer | Rafael Matos da Silva | Direction and roadmap, reviewing and merging changes, releases, security reports, the code of conduct, the repository and package settings |
| Contributor | Anyone who opens an issue or takes part in a discussion | Following [CONTRIBUTING.md](CONTRIBUTING.md) and the [code of conduct](CODE_OF_CONDUCT.md) |
| Reviewer | None yet | Approving changes before they merge, once the project has a second maintainer |

## Continuity

The project is built so that it does not depend on any one secret:

- **No stored publishing credentials.** Releases are signed and published by GitHub Actions through OIDC trusted publishing, to GitHub Releases, GitHub Packages and npm. There is no token to hand over or to lose.
- **Everything is in the open.** The code, the full history, the tests, the release workflow and the documentation are public under the MIT license, so anyone can fork and continue the engine.
- **Installs keep working.** Every release stays on GitHub and npm, and each one can be verified with `gh attestation verify`.

What is not covered yet: only the maintainer has admin access to the repository and the npm package. Adding a second person with that access, who could take over the project, is the next step for continuity, and the first condition for the OpenSSF Best Practices silver level.

## Changing this document

Changes to governance go through a pull request like any other change, and are announced in the next release's notes.
