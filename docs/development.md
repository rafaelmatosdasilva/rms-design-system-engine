# Working on the engine

How the repository is laid out, how to run the tests, and what a change has to satisfy before it merges.

This page is for whoever is changing the engine itself: the maintainer, or anyone who has forked it. It is not an invitation to send the change back here. [CONTRIBUTING.md](../.github/CONTRIBUTING.md) says how to take part, and [GOVERNANCE.md](governance.md) how decisions are made.

**On this page**

- [Where things are](#where-things-are)
- [Run the tests](#run-the-tests)
- [What a change needs](#what-a-change-needs)
- [Coding standards](#coding-standards)
- [Keeping up with DSDS](#keeping-up-with-dsds)
- [Every other standard the engine pins](#every-other-standard-the-engine-pins)
- [When a pull request stops merging](#when-a-pull-request-stops-merging)
- [Release labels](#release-labels)
- [What a release asks of you](#what-a-release-asks-of-you)

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

The full suite needs Chrome on your `PATH`, or `CHROME_PATH` set. Install the test tools and fetch the pinned DSDS release once, then run the suite and the docs check:

```bash
for d in .ci-tools .lint-tools .vue-tools .vue-cli-tools .nuxt-tools .react-tools .lit-tools .storybook-tools; do npm ci --prefix test/$d; done
node lib/dsds-release.mjs fetch
node --test test/*.test.mjs
node lib/sync-docs.mjs --check
```

On a pull request, CI runs the suite on four machines at once, each a quarter of the files. `test/shard.mjs` splits them so each machine gets about a quarter of the time, by how long each file took when last measured. When the quarters drift apart, measure again:

```bash
node --test --test-reporter=./test/shard.mjs test/*.test.mjs > test/shard-weights.json
```

`sync-docs.mjs --check` exits non-zero if the gate counts or gate labels in `README.md`, the pages in `docs/` or the guide no longer match `lib/audit.mjs`. Run it without `--check` to patch them.

## What a change needs

- **A test for new behaviour,** one that fails without the change. A new check is tested with a mistake planted on purpose, so it is known to catch what it claims.
- **A test for a fixed bug,** one that reproduces it.
- **Every test passing,** none skipped for want of Chrome or the test tools. The browser tests need the tool folders
  installed (`npm ci --prefix test/.vue-tools`, and the same for `.react-tools`, `.lit-tools`, `.storybook-tools`, `.vue-cli-tools`, `.nuxt-tools`,
  `.ci-tools`, `.lint-tools`) — each skips rather than fails without them, so a run can read as clean while missing
  whole groups.
- **No new npm dependency.** The engine has none, and that is part of what it promises.
- **Nothing private.** No client, product, person, host or token name, in code, tests, examples or messages. Examples use invented names (Acme, cardTile). The required Privacy check refuses anything else.
- **Docs that match.** A change people can see updates the README, `docs/` or the guide files in the same change.

A change to the guide files (`rms-design-system-engine.md`, `cookbook/`, `reference/`) also needs a fresh skill evaluation, recorded in `test/skill-evals/RESULTS.md`. The evaluation (`node test/skill-evals/continuous.mjs`) runs on your Claude plan's login, billed against its usage limits. With `ANTHROPIC_API_KEY` set, it runs through the Agent SDK instead (`npm ci --prefix test/.eval-tools` first), billed to that key's API credits, which include the monthly credits a Max or Team plan comes with. Those credits don't cover Claude Code.

Main takes no direct push. A pull request merges when the privacy check, the test suite and CodeQL pass.

The tests badge in the README is not written by hand: the Tests workflow puts what the run counted into `tests.json` on the `badges` branch, and the badge reads that file. So the number on the README is the number the last run on `main` really reported.

Actions are pinned by commit, so they are updated on purpose rather than by drift. Dependabot watches them and opens one grouped pull request a week when any has moved (`.github/dependabot.yml`); it arrives labelled `release: patch` and goes through the same gate as any other change.

The test tools under `test/` are watched the same way, with one grouped pull request a day for each folder. A new TypeScript major is left out: TypeScript 7 has no JavaScript API, and the engine reads JSX and Props through that API, so moving to it is a person's call.

The privacy check reads Dependabot's release notes like any other text. A package quoted at its version (`pinia@4.1.0`) is not an address there, since a domain ends in letters and a version in a number. An address beside one is still found.

## Coding standards

The engine's code follows ESLint's recommended rules for JavaScript, and `test/lint.test.mjs` runs ESLint over `lib/`, the root entries and the git hooks on every test run, so a change that breaks them fails the suite. ESLint is a test tool in `test/.lint-tools`, as TypeScript is in `test/.ci-tools`: the engine itself still has no dependency.

A few patterns the engine uses on purpose are stated once, with why, in `test/.lint-tools/eslint.config.mjs`:

- **An empty `catch {}`** is how a step degrades safely: a file it cannot read, a browser that closed. Any other empty block is a mistake.
- **Control characters in a pattern** are matched on purpose, in text read from terminals and other tools.
- **A function's parameters** are its signature, which callers rely on by position, so one it no longer reads stays.
- **Code built from text and run** is refused unless the line above says why.

Beyond what ESLint checks:

- **One module per job** in `lib/`, with a header comment that says what it does and what it never does.
- **Plain modules**, `import` and `export`, run by Node 22 with no build step.
- **A comment says why**, not what the next line does.
- **A line that turns a rule off names the rule** and says why on the line above. The test refuses one that does not.

To run ESLint on its own:

```bash
node test/.lint-tools/node_modules/eslint/bin/eslint.js -c test/.lint-tools/eslint.config.mjs .
```

## When a pull request stops merging

Every pull request here merges itself: it is opened, labelled, auto-merge goes on, and GitHub merges it the moment
its checks are green. Nobody watches one afterwards — until it cannot merge, and then it looks exactly like one
that is about to.

Three ways that happens, all of them silent:

| What stopped it | What it looks like | The fix |
|---|---|---|
| It conflicts with main | Green ticks, auto-merge on | Rebase the branch onto main |
| A required check failed | Auto-merge still on, waiting | Push the fix |
| Auto-merge was never turned on | Nothing at all | `gh pr merge <n> --auto --squash` |

`.github/workflows/merge-stalled.yml` asks daily and keeps **one** issue current while any is stuck. A pull request
younger than six hours is not stalled, it is new — saying otherwise would teach everyone to ignore the issue.

See them from your own machine:

```bash
node lib/merge-stalled.mjs
```

## Keeping up with DSDS

The engine writes and reads [DSDS](https://designsystemdocspec.org), pinned to one version (`DSDS_VERSION` in `lib/contract-dsds.mjs`). DSDS is before 1.0, and a minor release may break, so the pin never moves by itself.

- **Every Monday**, the DSDS release workflow (`.github/workflows/dsds-release.yml`) asks DSDS's repository for its newest release.
- **When it is newer than the pin**, a read-only job fetches that release's schema, conformance suite and examples. It moves the pin in its own copy, runs the DSDS tests, and runs DSDS's own reference validator over the view of a sample system.
- **Then a second job opens a pull request** (`dsds/v<version>`) that moves the pin, with what passed and what did not. It is a draft when something failed. That job runs none of DSDS's code.
- **DSDS's files are fetched, never committed.** Its licence and its comments name people and companies, and this repository names none. They go in `test/.dsds/`, which git ignores, and the Tests workflow fetches the pinned release before the suite runs.
- **It starts the test suite on the branch**, since a pull request a workflow opens starts no other workflow by itself.

Before running the DSDS tests on your computer, fetch the pinned release once. A DSDS test with nothing fetched fails and says this command:

```bash
node lib/dsds-release.mjs fetch
```

To see whether a newer release is out, and to try one by hand:

```bash
node lib/dsds-release.mjs check
```

```bash
node lib/dsds-release.mjs update 0.24.0
```

`fetch` and `update` turn DSDS's YAML examples into JSON with Ruby, which macOS and the CI runner have. The tests then hold the view, and the validator in `lib/json-schema.mjs`, to that release: every example DSDS publishes as valid passes, and every fixture its suite says the schema rejects is rejected.

## Every other standard the engine pins

DSDS has a watch of its own because it moves often and may break in a minor release. The engine pins other outside
facts too, and until November 2026 nothing asked about any of them — which is how a pin goes stale unseen.

`lib/pinned-standards.mjs` is the one list of them: what each is, which file holds the pin, and how its source is
asked. See them all, with what their sources say now:

```bash
node lib/pinned-standards.mjs
```

It exits 1 when one is behind. `.github/workflows/pinned-standards.yml` runs it every Monday and keeps **one** issue
current while anything is behind, closing it when nothing is. A new issue each week for the same standard is how a
watch gets muted.

**It proposes nothing.** Moving a pin changes what the engine writes or checks — a newer accessibility rule set finds
different things — so a person decides it and it goes through a pull request that says what passed. DSDS keeps its own
watch, which does propose, because it has a conformance suite to prove the move against.

Three kinds of pin, because they go stale in different ways:

| Kind | How it is asked | Example |
|---|---|---|
| A version with a registry | Its newest published version | `axe-core`, the accessibility rules the browser checks run |
| A version with a repository | Its newest tag that is a version | DSDS |
| A date | How many months since it was read | The table of which browser version runs which web feature |

A pin nothing can ask about stays in the list and is reported as unwatched, rather than left out. "Nothing can ask
about this" is the finding, not a reason to hide it — and the list is what says the engine pins it at all.

**When you add a pin**, add it to `PINNED` in the same change. A test reads every entry against the engine's own
files, so a pin whose line is renamed fails the suite rather than silently reading nothing.

## Release labels

Every pull request carries exactly one, and it decides the version the release workflow publishes:

| Label | For |
|---|---|
| `release: patch` | a fix, docs or internal work |
| `release: minor` | a new capability |
| `release: major` | people already using the engine have to do something to keep working, such as change a setting or a command. The owner decides it, and behaving differently alone is not one |

A version is published once 15 merged changes are in no release yet, never on a date, and the biggest label in that group sets the step. So a label decides the step of the group a change lands in, not a release of its own, and a change can wait for the group to fill. People do not wait for it either way: an install follows the latest code once a day.

## What a release asks of you

A release used to list the changes it carried and never say whether you had to do anything about them. Most of the time you don't — your install follows the latest code once a day — but a few changes do want something, and they read exactly like the rest.

So every pull request also carries one `after:` label, and the release's notes gather those at the top, before the list of changes:

| Label | What the notes say |
|---|---|
| `after: nothing` | Nothing to do. Almost always the answer, and what a pull request with no `after:` label counts as. |
| `after: refresh figma` | Refresh Figma, so the engine reads your library again. |
| `after: run setup` | Run setup again, so your configuration takes what changed. |
| `after: build the style guide` | Build the style guide again, so its pages show what changed. |

Each line names the changes that ask it. A release that asks nothing says so in one line rather than staying silent — silence reads as nobody having written it down.
