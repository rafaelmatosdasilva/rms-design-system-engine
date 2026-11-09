# Working on the engine

How the repository is laid out, how to run the tests, and what a change has to satisfy before it merges.

This page is for whoever is changing the engine itself: the maintainer, or anyone who has forked it. It is not an invitation to send the change back here. [CONTRIBUTING.md](../.github/CONTRIBUTING.md) says how to take part, and [GOVERNANCE.md](governance.md) how decisions are made.

**On this page**

- [Where things are](#where-things-are)
- [Run the tests](#run-the-tests)
- [What a change needs](#what-a-change-needs)
- [Release labels](#release-labels)

## Where things are

The engine's modules are in `lib/`. Four files stay at the root because people's setups name them:

| File | What names it |
|---|---|
| `audit.mjs` | the `rms-design-system-engine` command |
| `guard.mjs` | the Claude Code hooks |
| `mcp.mjs` | the MCP server |
| `styleguide-files.mjs` | the style guide publishing job |

Each one only loads its module from `lib/`.

The guide Claude reads is `rms-design-system-engine.md`, with `cookbook/` and `reference/` beside it. The public documentation is `README.md` and `docs/`. The tests are in `test/`.

## Run the tests

The full suite needs Chrome on your `PATH`, or `CHROME_PATH` set. Install the test tools once, then run the suite and the docs check:

```bash
for d in .ci-tools .vue-tools .vue-cli-tools .nuxt-tools; do npm ci --prefix test/$d; done
node --test test/*.test.mjs
node lib/sync-docs.mjs --check
```

`sync-docs.mjs --check` exits non-zero if the gate counts or gate labels in `README.md`, the pages in `docs/` or the guide no longer match `lib/audit.mjs`. Run it without `--check` to patch them.

## What a change needs

- **A test for new behaviour,** one that fails without the change. A new check is tested with a mistake planted on purpose, so it is known to catch what it claims.
- **A test for a fixed bug,** one that reproduces it.
- **Every test passing,** none skipped for want of Chrome or the test tools.
- **No new npm dependency.** The engine has none, and that is part of what it promises.
- **Nothing private.** No client, product, person, host or token name, in code, tests, examples or messages. Examples use invented names (Acme, cardTile). The required Privacy check refuses anything else.
- **Docs that match.** A change people can see updates the README, `docs/` or the guide files in the same change.

A change to the guide files (`rms-design-system-engine.md`, `cookbook/`, `reference/`) also needs a fresh skill evaluation, recorded in `test/skill-evals/RESULTS.md`. The evaluation (`node test/skill-evals/continuous.mjs`) runs on your Claude plan's login, billed against its usage limits. With `ANTHROPIC_API_KEY` set, it runs through the Agent SDK instead (`npm ci --prefix test/.eval-tools` first), billed to that key's API credits, which include the monthly credits a Max or Team plan comes with. Those credits don't cover Claude Code.

Main takes no direct push. A pull request merges when the privacy check, the test suite and CodeQL pass.

## Release labels

Every pull request carries exactly one, and it decides the version the release workflow publishes:

| Label | For |
|---|---|
| `release: patch` | a fix, docs or internal work |
| `release: minor` | a new capability |
| `release: major` | something that works differently for people already using the engine |

A version is published once 50 merged changes are in no release yet, never on a date, and the biggest label in that group sets the step. So a label decides the step of the group a change lands in, not a release of its own, and a change can wait for the group to fill. People do not wait for it either way: an install follows the latest code once a day.
