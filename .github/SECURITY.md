# Security policy

## Report a vulnerability

Report it privately, never in a public issue: on this repository's **Security** tab, choose **Report a vulnerability**. The aim is an answer within three working days, and a fix or a plan within thirty days. Once the fix ships, the advisory is published with your name, if you want it there.

Worth reporting:

- A token sent anywhere but its own host, or printed.
- A write the engine makes without the yes its setting asks for, or any write to code people wrote.
- A run on CI that writes the design file or product code.
- A command built from what a project, Figma file or page contains that runs something else.
- Anything sent to a host the [Security and data](../docs/security.md#security-and-data) page does not list.

## Safe harbour

Research done in good faith to find and report a vulnerability is welcome, and no legal action will be taken over it. Good faith means: test on your own installs, projects and design files only; reach no one else's data; report it privately here; and give a reasonable time for a fix before you tell anyone else. If you are unsure whether something is in scope, ask in a private report first.

## How a report is handled

1. **Acknowledged** within three working days, in the private advisory, with a first read of how serious it is.
2. **Confirmed** by reproducing it. If it is not a vulnerability, the reporter is told why, and the advisory is closed.
3. **Fixed in private.** The fix is prepared in the advisory's private fork, with a test that fails without it, and passes the same gate as every change: the privacy check, the full test suite and CodeQL.
4. **Released.** The fix ships in a release, and the self-update brings it to every install within a day.
5. **Disclosed.** The advisory is published with what was affected, which versions, and how to update, with a CVE requested through GitHub when it qualifies. The reporter is credited, if they want to be.

The aim is a fix or a plan within thirty days of the report. A report about a dependency of the test tools, which nothing the engine ships uses, is fixed in the open.

## Supported versions

Only the latest `main` is supported. The engine updates itself once a day, so a fix reaches every install without anyone acting. An install with the self-update turned off takes it with `rms-design-system-engine --update`.

## Verify a release

Each release carries its code as an archive with signed provenance: a Sigstore attestation that this repository's release workflow built it from that tag. Check it before you use it:

```bash
gh attestation verify rms-design-system-engine-v1.0.0.tar.gz --repo rafaelmatosdasilva/rms-design-system-engine
```

## How the engine is kept safe

- **No npm dependencies.** There is no third-party package to compromise. The tools the tests use install from committed lockfiles.
- **Every change goes through a pull request.** Main takes no direct push, and the privacy check, the full test suite and CodeQL's code scanning must pass before anything merges.
- **Workflows hold read-only tokens.** Only the release job writes, and only tags and releases. Every action is pinned to a commit.
- **[OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/rafaelmatosdasilva/rms-design-system-engine)** scores how the repository is kept, on every change to main and every week.
- **What it reads, sends and may change** is on the [Security and data](../docs/security.md#security-and-data) page.
- **The threat model,** its trust boundaries and the weaknesses it counters are in the [assurance case](../docs/security.md#assurance-case).
