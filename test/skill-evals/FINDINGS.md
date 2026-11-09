# What the runs taught

`RESULTS.md` records what each evaluation scored. This records what **reading** them taught: each case, the evidence it rests on, the guesses it ruled out, and what changed because of it. It is written as a case is closed, not at the end, so the evidence is still at hand.

A case belongs here when a measured run showed something the engine did wrong and the fix can be pointed at. A guess that turned out wrong is kept, with its evidence: the next person to have the same idea is saved the trip.

Newest first.

---

## A held edit said a new colour was a sign-off, so the agent asked and stopped

**Found** 9 November 2026, measuring the Figma capture change. **Changed** the guard: a token whose colour the system holds nowhere is now told as a gap, before any sign-off (`guard.mjs`, `newColours`).

**Evidence.** `new-ui-saved` asks for a green "Saved" confirmation in a system with no green. It came out 8/10. Both misses tried first to add a green token to the theme (`--color-success`, `--confirmation-success: #2e7d32`). The guard held the edit, as it must, but its message led with "tell the person what it adds and ask who signs it off… easy to undo, low risk". Both agents did exactly that: asked who signs off an invented colour, changed nothing, and never said the system has no green. The run that hit the same hold and passed carried on building past it.

**Ruled out.** The change being measured (it described the Figma skeleton; neither miss read anything of it). The scorer: both agents meant to bring in a colour the system lacks, and only the hold stopped them.

**After the fix.** `new-ui-saved` alone, 20 runs on the fixed engine: 20/20. The hold fired in 3, each with the new message, and each agent named the missing green or built with what the system has. 20/20 alone proves little at this task's usual rate; the three held runs are the evidence.

**What it teaches.** A hold that stops an edit is the only thing the agent hears about it, because the edit check never runs on an edit that was not made. So the hold has to say what that check would have said. It is probably also the cause of the "rare intermittent" miss below, which has the same shape; its transcript was not kept, so that stays a guess.

---

## What a run reads grew by a seventh, and nothing had grown

**Found** 9 November 2026, reading the entry for Fix, Decide and Done. **Changed** nothing in the engine: nothing in it was at fault. Written down because three explanations were wrong in a row, and the measurement that settled it is cheap enough to make first next time.

**Evidence.** Input a run went 92k to 105k between engine 91d7a3f and 06654ad, a bigger move than any entry before it. The entry's own commit guessed the project had moved under the run. It had not: every entry since 9f4defb1f893 records `Project measured: 13d811a9d668`, the same hash. Nor the guide, which both runs measured at 30695 bytes, nor the agent, which was 2.1.318 with the same 19 bundled skills in both.

It is not one task's data either. Mean input a task, before against after:

```
new-ui-saved      292425 -> 371563   +79138
audit-all          51757 ->  85685   +33928
first-setup        87420 -> 115582   +28162
refresh-no-figma   34082 ->  57143   +23061
```

Every task grew, including ones that do nothing but run the engine and read what it says. What they share is the engine's own output, so that is what grew.

**Ruled out.**

- *The guide.* Same bytes, same hash set but for the three short wording changes the entry names.
- *The project.* Same hash, four entries running.
- *The agent.* Same version, same skills; the warning that fires when the bundle changes did not.
- *One task reading more.* The growth is across tasks that share nothing but the engine.

- *The engine saying more.* The guess written when this case was opened: the change that made a check say what it read adds counts to the audit's output. The audit was run on the demo project at both commits. It printed **26059 bytes at each**. The engine says exactly as much as it did.

**What it was.** `usage.input` is the whole run's input, so it counts the conversation again on every turn. Input a turn hardly moved - 26k before, 26k to 27k after. The turns moved:

```
task              turns         input a turn
refresh-no-figma  1.3 -> 2.7    26k -> 21k
audit-all         2.0 -> 2.7    26k -> 32k
new-ui-saved     10.6 -> 12.7   28k -> 29k
first-setup       3.3 -> 4.3    26k -> 27k
overall mean      3.33 -> 3.71
```

Nothing grew. The agent took more steps, and each step reads the conversation again. `refresh-no-figma` doubled its turns while reading less a turn.

**What is worth asking next.** Every task still passes, so the entry's counts say nothing is wrong, and turns are what cost scales with. A task that needs two steps where it needed one may have lost a shortcut the guide used to give it. Turns a task, beside input, would say it where a pass rate cannot - and would have answered this in a minute rather than three wrong guesses.

---

## A release that computed a version already behind the one published

**Found** 9 November 2026, releasing the two changes above. **Changed** which tag the release workflow reads as the last one (`.github/workflows/release.yml`).

**Evidence.** 37 commits were waiting, four days past the three-day ceiling, because the release of 5 November had failed:

```
npm error Cannot implicitly apply the "latest" tag because previously
published version 3.4.0 is higher than the new version 2.0.1.
```

**Why.** The workflow asked `git describe --tags --abbrev=0` for the last version. That answers a different question: which tag is nearest walking back from HEAD, not which version is highest. The two agree only while tags land in version order. On 5 November a run read v2.0.0 with v3.4.0 already published, computed v2.0.1 from it, and npm refused a version below the one it held — correctly, and the only reason this was caught at all.

**Ruled out.**

- *That `package.json` and the tag arithmetic contradict each other.* Guessed first, from `package.json` being at 1.0.0 while tags are at 3.x. It is not a contradiction: the version there is only the floor for a first release, which is what `CLAUDE.md` means by keeping the first version. Running the real calculation against today's tags gave v3.4.1 and v3.5.0, both above npm's 3.4.0.
- *That the workflow was broken and had to be fixed before anything could ship.* It was not: the inputs had recovered on their own, and v3.5.0 released cleanly on the unfixed workflow. The fault is latent, not standing, which is exactly why it had sat for four days.

**What changed.** `git tag --list 'v[0-9]*' --merged HEAD --sort=-v:refname | head -1`: the highest version, by git's own version order, among tags HEAD can reach — so a tag on a branch of its own never raises the next version either. A test holds the workflow to it and to the absence of the old command.

**What it teaches.** A gate that fires correctly still tells nobody. npm refused the bad publish, the workflow went red, and 37 commits then waited four days because nothing watches the thing that watches. The engine measures its own guide every time it changes and had no idea its releases had stopped.

**And the runs said something worse than the red one.** Of 18 release runs ever, **one** came from the schedule; every other was started by hand. The cron landed on 28 October, and of the two Mondays since, neither fired — including the Monday this was found, six hours after its hour. So the weekly release in `CLAUDE.md` has never really been weekly, and the four-day wait was not one broken run but a cadence that was never running.

**What changed, the second time.** `release-due.mjs` asks the state instead of listening for the event: is there work on `main` that no tag covers, and how old is it? One question catches a run that went red, a schedule that never fired, and a release nobody remembered — all three look identical from outside, and two of them had already happened here. It runs on every push to `main` as well as daily, because a push is an event that certainly happens in this repository while the schedule is the thing under suspicion; the watcher must not depend on what it watches. Once a version has been due for two days it opens one issue, keeps it current, and closes it when a release goes out.

**What changed, the third time.** The owner replaced the cadence itself (9 November 2026): a version covers 50 commits, never a date. The dates had said nothing about what a version held - v3.5.0 was 37 commits, v3.6.0 six of them two hours later - and at 12 to 52 commits a day a count is the one promise a version can keep. It also narrows what has to be watched: the workflow is asked once a day and releases whatever has reached 50, so the question is no longer whether a particular day's run fired. `release-due.mjs` holds the number, and what it asks became whether a version is due and how long it has been due - measured from the commit that completed the group, so fifty commits gathered slowly are never called late for the days they spent gathering.

**Left open on purpose.** Why GitHub's schedule does not fire here. The watcher makes it visible rather than explaining it, which is the part that was missing; the cause is worth its own look.

---

## The harness asked the PATH for a CLI it had already found

**Found** 9 November 2026, starting the evaluation that this day's own guide change needed, from a client's shell rather than a terminal. **Changed** `findClaude` and `CLAUDE` in `test/skill-evals/lib.mjs`, and the line in `run.mjs` that did not use them.

**Evidence.** `continuous.mjs` printed the Chrome it found and then died, before a task ran:

```
Chrome: <the browser it found>
Error: spawnSync claude ENOENT
    at file:///…/test/skill-evals/run.mjs:73:20
```

`claude` is installed on this machine beside the node that runs everything, in the folder that installer made. A terminal's profile puts that folder on the PATH; the shell a client hands a session does not, which is why this had never been seen.

**Why it was there to find.** `lib.mjs` resolves the CLI once (`which claude`) and every run spawns what it resolved. One line did not use it: `run.mjs:73` asked the PATH again, by the bare name, for the version it records on each row. So the harness had the answer and threw it away at the one place that failed. The resolver was no better underneath — `which` missing it fell back to the literal `'claude'`, which only moved the failure from a message to a stack.

**Ruled out.**

- *Setting the PATH and moving on.* It works, and it leaves the next person on this machine with the same stack and nothing saying what to install. The engine already answers this question for Chrome, in code (`findChrome`), and the evaluation already refuses a run that is not logged in with a sentence that says what to do.
- *That it was the same fault as the node case above.* It is not. That one was inside a run, with a PATH the harness builds on purpose; this one is the harness's own shell, and no guard of a run's would have seen it.

**What changed.** `findClaude` follows `findChrome`: a name given by hand (`DESIGN_SYSTEM_ENGINE_EVAL_CLI`, taken only if it is there), then the PATH, then where the installers put it — beside the running node first, then `~/.local/bin`, then `~/.claude/local`. It returns null rather than a bare name, and `run.mjs` says what is missing and where it looked, exiting 2. A test holds each branch with `exists` and `which` injected. The command that died runs on the same PATH now.

**And the same mistake once more, one line down.** `run.mjs` recorded `claude --version` on every row — but with an API key set, the runs go through the Agent SDK and the CLI is never spawned at all. So the version kept beside 79 runs named a program none of them used. The entry compared it with the entry before, where the runs had gone through the command line, and said `2.1.318 → 2.1.301`: a downgrade that never happened, because the SDK bundles its own older Claude Code and the two numbers are two numberings.

`agentOf` asks whichever program `runnerOf` chose — the SDK's package version, or the CLI's `--version` — and the row records which ran. `cliChange` compares versions only within one runner and says a change of runner as itself. This entry's own rows keep the wrong `cliVersion`, since they were written before the fix; their `cli.version` (2.1.301, from each run's init event) is what actually ran, and the entry's sentence has been corrected to say so.

---

## A recording that said `fatal` and carried on

**Found** 9 November 2026, in the same recording as the case above. **Changed** `sh` and the range in `test/skill-evals/record.mjs`.

**Evidence.** Between the records being written and the entry being written, `record.mjs` printed:

```
fatal: ambiguous argument '06654ad..4c1d2ef': unknown revision or path not in the working tree.
fatal: bad revision '06654ad'
```

and then wrote the entry anyway, exit 0.

**Why.** Two faults that look like one. `sh` catches git's failure and returns `''`, but `execFileSync` passes git's stderr to the console, so a handled failure reads like a crash. And what it handled was not nothing: `06654ad` is the engine the entry before was measured on, which this clone does not have, so the range resolved to nothing and the entry quietly lost both the commit list and the guide files it names. The entry only said which guide file changed because `--what` had been passed by hand; without it, it would have said nothing and looked fine.

**Ruled out.** *That the empty answer is harmless because `--what` is usually given.* `guideFiles` comes from the same range and is never given by hand — it is the line that tells a reader which guide files an entry measured.

**What changed.** `sh` keeps git's stderr to itself. The range checks that the commit is in this clone (`rev-parse --verify`) and, when it is not, says so and falls back to the measured commit's own parent — the fallback that already existed for a first entry. Quiet degradation becomes a sentence naming the commit it could not reach.

---

---

## A run measures the working tree, so a checkout during one measures something else

**Found** 8 November 2026, measuring the Rules page. **Changed** nothing in the engine: the measurement is sound and the hazard is in how a run is started. Written down because the run looked like it had worked.

**Evidence.** An evaluation was started on a committed branch, and it recorded an entry for a different change: `engine 5ae6f94`, titled after a pull request this branch had nothing to do with. `continuous.mjs` refuses to start on a dirty tree and names the commit it measures, so the commit looked pinned. It is not. Each run symlinks the engine's folder into its fresh home (`skills/rms-design-system-engine` → `ENGINE`, `lib.mjs`), so what an agent reads is the working tree as it stands at that moment, not the commit named in the header. Another session on the same clone ran `git checkout origin/main` while the run was going; the reflog has it:

```
HEAD@{0}: checkout: moving from <the branch> to origin/main
HEAD@{1}: commit: <the change being measured>
```

From there every task read main's guide. The header kept saying the commit it started from until the next phase, which read the new one. Nothing failed: 79 of 79, an ordinary-looking entry for a tree nobody meant to measure.

**Ruled out.**

- *That the clean-tree check is enough.* It is taken once, before the first run, and says nothing about the forty minutes after it.
- *That the header names what was measured.* It names `git rev-parse HEAD` at the moment the phase started. Two phases of one evaluation printed two different commits, which is the only reason this was caught at all.

**What to do.** One clone per session, as `CLAUDE.md` already says for branches; where two sessions must share a machine, the second gets a worktree of its own. A run whose two phases print different engines measured two trees and is thrown away, not recorded.

---

## The engine called in quotes, and a rescore that failed what it could not see

**Found** 8 November 2026, measuring the git hooks that build the local style guide again, on the first run after the case below. **Changed** the pattern that tells an engine call (`ENGINE_SCRIPT` and `ENGINE_CALL` in `test/skill-evals/lib.mjs`), now used by `no-cli-on-path`'s check and by `handEdits` as well. `rescore.mjs` is unchanged and was not used for the entry.

**Evidence.** 76 of 79, the three failures all `no-cli-on-path`, *ran the engine by its path* — the one task that passed when no run had node. Its transcript:

```
node "<the engine's folder, a space in its name>/audit.mjs" --component button
  PARITY AUDIT · SCOPED TO: button …
```

The agent ran this engine by its path, with the button scoped, and the engine answered. The check is `/node\s+\S*audit\.mjs/`: `\S*` stops at the first space, and this engine's folder has one, so the path in quotes was never seen. When no run had node the agent had tried `~/.claude/skills/…/audit.mjs` first, with no space, and the check matched a call that had failed.

The same `\S*` was in two more places: `ENGINE_CALL`, which counts the engine's runs, and `handEdits`, which counts a shell command that writes a file as an edit by hand unless it is the engine's. An engine call in quotes that wrote a file would have read as the agent writing it.

**Ruled out.**

- *That the guide stopped teaching the path.* Every run used the path; only the folder it lived in changed.
- *Rescoring the saved runs with the fixed check, as `rescore.mjs` is for.* It turned the three `no-cli-on-path` runs to passes and nine `figma-*` runs to failures, every one of them a pass when it ran. Their checks read what the engine wrote (`.design-system-engine-out/specs/pill.spec.json`, `.design-system-engine-out/changes/chip.change.json`), and a saved row keeps none of it, so each read `null`. It rewrote the results in place, so the live verdicts of those nine were gone; the evaluation was run again whole instead, on the fixed checks.

**What changed.** One pattern for an engine run by its path: bare, in double quotes or in single quotes. A test holds it to the quoted path with a space, to a command that is not the engine, and to `handEdits` leaving an engine call that writes a file alone. A rescore that cannot see what a run's engine wrote is an item of its own: until it can, a rescore of a task that reads the engine's output is not a score.

**Closed** 9 November 2026, from both ends.

- *It can see it, from now on.* `keepFiles` keeps what the checks actually read (`ctx.readPaths`), which is the only list that cannot fall behind them — a `keep:` written by hand on each task would have had to be remembered for every check ever added. The row also records the paths its checks read, so a file missing from `files` can be told apart from a file that was not there.
- *It never writes over what it cannot see.* `rescore.mjs` scores a run again only where the row answers everything its checks read, and leaves it exactly as it was scored otherwise, naming the file (`⏭ … kept as scored, the row holds none of …`). Only here: `rescore-build.mjs` rebuilds the run's project from the fixture, so its files are there to read.

**Measured on the nine.** The nine rows of that day, with their transcripts, rescored on the code as it was: 9 of 9 written over as failures. On this code: 9 of 9 kept, each naming the file it could not see (`specs/pill.spec.json` for the three `figma-build-like`, `changes/chip.change.json` for the six option runs), and the results file byte-identical afterwards. Not a no-op either — across 89 rows of 24 tasks, 73 still rescore and 1 changed verdict.

**What it leaves.** Two `new-ui-saved` rows are kept as scored for a file that genuinely was never written (`changed: []`, the runs that changed nothing and said the system has no green — the case further down). A row from before this cannot tell "absent" from "never kept", so it is treated as the second; rows written from now on say which, and are scored again.

---

## Fifteen of seventy-nine, and no run had node

**Found** 8 November 2026, measuring a change of fifteen lines to `reference/usage.md` and one to `reference/config.md`. **Changed** `makeHome` in `test/skill-evals/lib.mjs`: the node the evaluation runs on goes into the new HOME's `bin`, first on the path. Nothing in `lib/` or in the guide.

**Evidence.** 15 of 79 runs passed, against every check of every task: `audit-chip` did not scope to the chip, `first-setup` never ran `--init`, `props-question` never asked the engine. Two guide lines cannot do that. The transcript of `first-setup #0` says what did:

```
node ~/.claude/skills/rms-design-system-engine/audit.mjs --route "set up the parity…"
(eval):1: command not found: node
…/skill-eval-home-…/bin/rms-design-system-engine: line 2: exec: node: not found
```

The agent looked for node in four places, found none, told the person Node.js was missing and stopped: three tool calls, twelve seconds. Every task that needs the engine ended the same way. The PATH it printed held the new HOME's `bin` and the system's own folders, and no node.

**Why.** A run's shell starts from the new HOME, which has no profile, so only the PATH `makeHome` hands it says where anything is. `makeHome` takes every `.local/bin` out of that PATH on purpose: it is where `install.sh` puts an engine, and a run must reach this engine and no other. On this machine node lives there too (`~/.local/bin/node`, a link to `~/.local/node22/bin/node`), so the filter took node with it. The runs that scored 70 of 70 before ran where node was in a system folder. Nothing said the machine had changed: a run that cannot start the engine is scored like one that chose not to.

**Ruled out.**

- *That the guide change made the agent stop reaching for the engine.* The failures cover tasks whose recipe the change never touched, and the transcripts show the agent reaching for the engine first and the shell refusing it.
- *That the plan's login (`CLAUDE_CODE_OAUTH_TOKEN`, through the command line) behaves differently from the API key (through the Agent SDK).* The login worked: every run spent tokens and called tools. Only the shell's PATH was wrong, and it would have been on either route.
- *Widening the filter so it keeps a `.local/bin` that holds node.* That folder can hold an installed engine as well, and then a run could reach it: the filter is right. Node goes in on its own instead, as the engine's command already does.

**What changed.** `makeHome` links `process.execPath` into `bin`, for every task, the ones that take the engine's command away included (the guide's `node <install-dir>/audit.mjs` needs node all the same). A test runs a shell with only that PATH and HOME and finds this node, runs the engine's command, and finds no `.local/bin`; without the link it fails with the runs' own `node: command not found`. The 15-of-79 record was never committed.

**Closed** 9 November 2026, the other half: the fix above stops this machine losing node, and nothing stopped the *next* machine fault being scored as a guide. A run whose every call to the engine died in the shell is now refused before it is scored, the way a run that is not logged in is (`engineNeverStarted`, `reading.mjs`): the pool stops, no row is written, and the message says to check the PATH rather than to wait for a limit to reset.

The line it draws is node, not the engine. Every variant gets node linked into its own bin, so node missing is never something a variant asks for — while `rms-design-system-engine: command not found` is exactly what the no-engine side is there to measure, and must never be refused. Four wordings are held by a test, because two shells and `exec` each say it differently: `(eval):1: command not found: node`, `bash: node: command not found`, `exec: node: not found`, `env: node: No such file or directory`. One call that started means the runtime was there, and the run is scored as it always was.

**What it does not cover.** A machine that breaks in some way other than losing node. The general shape — a run that never reached the engine says nothing about the guide — now has two guards (not logged in, no runtime) and no third.

---

## A test called flaky, and it was the machine again

**Found** 4 November 2026, on a full run before a push. **Changed** nothing in `lib/`, on purpose.

**Evidence.** One test of 2429 failed: *a generate command that ignores its stdin still produces its candidate*, in `eval-run.test.mjs`. It writes a prompt of a million characters to a command that exits at once, twenty times over, and expects the candidate every time. One of the twenty came back `null`. Alone it passes, 14 of 14, with and without the test tools on `NODE_PATH`. On the next full run it passed, and the suite was 2429 of 2429.

Then the machine, which is the thing the case above says to look at:

```
load averages: 41.47  94.13  102.25
12 cores
```

Eight times oversubscribed across the last quarter hour: a full suite of 319 files, a probe of fourteen processes, three minutes of deliberately exponential regular expressions, and a second session working in the same checkout. No stray `audit.mjs --watch` this time — #286 is holding, and every engine process alive was a test's own child, one to ten seconds old.

**What fits.** `defaultRun` spawns with `timeout: 180000`. A spawn that reaches it comes back with `status: null` and an `ETIMEDOUT` error, which the line after rethrows because it tolerates only `EPIPE`, and `generateCandidate` turns any throw into `null`. On a machine this loaded a 180-second timeout is reachable — a single regular expression in the same run took 178 seconds. That is the mechanism that fits the symptom. It was not caught in the act, and it is written here as a fit, not a finding.

**Ruled out, both mine, both by measurement.**

- *That `spawnSync` returns a null status on EPIPE, so the exit-code line undoes the EPIPE line above it.* It does not. 1500 iterations of that exact shape: every one `EPIPE`, `status 0`, stdout whole. The handling is correct as written.
- *That the spawn fails with `EAGAIN` under load, which the EPIPE line would rethrow.* Not once in 11,200 spawns across fourteen processes competing for twelve cores. Every one was `EPIPE`, `status 0`, stdout whole.

**Why nothing changed.** Both guesses were about the code, and neither survived contact with a measurement. What is left is a symptom seen only under load, which the case below settles: that is evidence about the load. A guard added here to make the symptom go away would be a guess written into `lib/`, and it would hide the next real one.

**Still open.** The same thing that case left open: the suite competing with itself, now with a number on it. Started on a quiet machine — load 5.03 — one full run on its own took it to **69.50 on twelve cores**. Nothing else was running. So the suite does not need a second session to oversubscribe this machine by six times; it does that alone, and a second session only adds to it. A time limit scaled by `availableParallelism()` counts the cores, never who else is on them.

---

## On the composition side, the catalog had no spacing to offer

**Found** 2 November 2026, measuring the composition path for the first time. **Fixed in** `lib/prototype-pieces.mjs` (`systemScales`).

**Evidence.** The twelve prototype tasks on Tidepool with only its Figma file, Haiku 5.5. With the skill, 19 of 24 runs passed the first time. Both profile runs failed the same way: the page's padding and gap left at none, and the composition's own note said *"The system has no spacing tokens, so spacing is left at none."* The Settings page beside it, read from Figma, uses `padding/m`. The catalog printed `Spacing tokens: none` and offered `padding=none` only: it read spacing from the code's tokens, and a system not built in code has none there. Figma's variables had `gap/s`, `padding/xs`, `padding/s` and `padding/m` all along.

**Guess ruled out.** Not the agent ignoring the catalog: it followed the catalog exactly, and the catalog was wrong.

**What changed.** With no spacing in the code, the catalog takes the gap, padding, spacing and margin variables from Figma, drawn at their own values. The same 24 runs then passed, 24 of 24. Claude alone on the same tasks: 0 of 12.

**What it settles.** The composition side fails differently from the code side: not by inventing, but by being given less to work with. Findings read from the code-side runs are about code pages; this is the first evidence for compositions.

---

## The invention is in the page's own wrapper, never in a component

**Found** 2 November 2026, reading the writes of twelve measured prototype runs. **Fixed in** #279.

**Evidence.** Every value an agent invented was in the page's own wrapper. A page width written as `400px`, a line between rows as `#e0e0e0` — each in the same tag as a `var(--padding-m)` the same agent had got right:

```jsx
<div style={{ padding: 'var(--padding-m)', maxWidth: '400px' }}>
borderBottom: '1px solid #e0e0e0'
```

It used a token wherever it had been shown one, and invented wherever it had not. The catalog showed spacing and nothing else, while the theme had `--surface-page`, `--text-primary` and `--stroke-default` all along.

**Ruled out.**

- *That the way out is unsaid.* The not-in-catalog line already ends "if the system has nothing for it, write a Missing box with the need instead". The agent guessed again anyway.
- *That agents invent components.* Counted across 26 runs, the names written are the system's own: `button` 176, `field` 138, `chip` 85, `tag` 28. Invented ones are rare: `Heading` 3, `Column` 2, `Box` 1. A first count said 25 and was wrong — it compared against the code catalog's names while most runs were composition projects, whose names are lower case.

**Changed.** The catalog names what the wrapper may use, and nothing else, with the way out in the same breath. What a component owns stays that component's, matched against every name the system has and not only the ones built in code.

**Confirmed on a second arm.** The same reading was run again on the documentation-only runs, which have no engine behind them at all and were measured separately. Every value is attributed to the tag it sits on:

| | Runs | On the page's own wrapper | On a system component |
|---|---|---|---|
| With the engine | 26 | 7 (100%) | 0 |
| Documentation only | 45 | 10 (100%) | 0 |

**Across 71 runs, not one invented value was ever placed on a system component.** `<div> ← 400px`, `<div> ← 1px`, `<p> ← 1rem`, `<circle> ← #E5E7EB`. Where an agent had a component, it used the component's own props and nothing else. The counts are small because this reads values inside an opening tag and not those in a multi-line style object, so it understates how many; the ratio is the finding, and it is the same ratio in both arms.

**Still open.** Whether it moves the number.

**And a thing that turned out not to exist.** The plan was to read the composition side the same way. There is almost nothing to read: of 75 writes into `prototypes/` across the documentation-only runs, **74 are code files and one is a composition**. The measured project's system is built in code, so a page there is correctly a `.jsx` — which means every failure in these arms is on the code side, and the composition path has never been measured at this scale. That is a gap in the measurement, not a finding about agents.

---

## Told which file to write, and told it four times about the other one

**Found** 2 November 2026, reading one measured run. **Fixed in** #266 (the engine) and #277 (the recipe, which is where it was actually losing).

**Evidence.** In a project whose components are code, the catalog says three times that a page here is a `.jsx`:

```
a page is a .jsx or .tsx file in prototypes/, written as the product's own pages are
then rms-design-system-engine --prototype prototypes/<Name>.jsx, and fix each ❌ ...
NEXT: write prototypes/<Name>.jsx from the cards above ...
```

The agent wrote `prototypes/NotificationSettings.json`, with a format of its own invention. The engine read it as a composition and answered with ten findings — the root is not a component, `"undefined"` is not in the catalog, the id `"undefined"` is used in three places. Every one true, and not one of them the thing that was wrong. Ten symptoms of one mistake read as ten mistakes: the agent fixed them one at a time for thirty turns.

**Ruled out.** *That the engine was not saying it loudly enough.* It was saying it three times. The recipe the agent reads first named the other kind of file four more times — steps 3, 4, 5 and 6 all spoke of `prototypes/<name>.json`, with nothing to say they belonged to the other path, and the fork between them sat once in the middle of a 150-word paragraph. **An instruction read first and carried throughout beats one read once, mid-task.**

**Changed.** A file that is neither is told which kind of file this project writes, by name, with the command that reads it (#266). The recipe's fork is now the first thing its step says, with each path under its own heading and the later steps marked as one path's (#277).

---

## A finding that does not say which part it is about

**Found** 2 November 2026, reading one measured run. **Fixed in** #265.

**Evidence.** An agent was told `"undefined" is not in the catalog`, could not tell which of the page's parts it meant, ran the check nineteen times, searched the project for a schema, deleted the page, started over, and ran out of turns with nothing finished.

Both halves were the engine's. The finding carried the part's id all along and the report never printed it; and a part given no id was keyed `node-7`, a number in walk order findable in nothing. Worse, the engine guessed a near name for the literal string `undefined` — `(did you mean button?)` — which reads as *you typed it nearly right* when what happened is that the part has no component at all.

**Changed.** A finding opens with where it is — the author's own id, else the path through the file. A part with no component is told it was never finished rather than quoted as a component called `undefined`.

---

## The documentation alone does not stop it: the gate does

**Found** 2 November 2026, measuring an arm that had never been measured: the guide with no engine behind it.

**Evidence.** Twelve published prototype tasks, Haiku:

| | Passed |
|---|---|
| Claude alone | 3 of 36 |
| The documentation alone, no engine | 2 of 36 |
| With the skill | 35 of 36 |

In 27 of the 36 documentation-only runs the agent invented, **with the exact component list in front of it**.

**What it settles.** Knowing the system is not what keeps work inside it. Writing better documentation would not have closed this; a check that refuses does. It is the strongest single number for why the engine exists, and it cost one run to get.

---

## A command can be broken on every project in the world and 1739 tests stay green

**Found** 1 and 2 November 2026, twice in two days. **Fixed in** the command sweep (`test/commands-run.test.mjs`) and `test/page-report-cli.test.mjs`.

**Evidence.**

- `--figma-edits` read a name that was not in its scope and exited with `cfg is not defined` before listing anything. Every test around it read the pure functions and none ran the command. It scored an evaluation 66 of 70 and cost a paid run to find.
- `--prototype <page>` did the same (`args is not defined`) and sat on `main` for a week. The one project the command sweep runs on has no components in code, so the command returned before reaching the line.

**What it settles.** A test that reads a pure function proves the function. It proves nothing about the command people run. Every command now runs end to end on a real project, and the only rule is that none of them may fall over — a command may fail, but never with a stack.

---

## A merge conflict marker sat in the guide and it scored 70 of 70

**Found** 2 November 2026. **Fixed in** `test/no-conflict-markers.test.mjs`.

**Evidence.** `reference/usage.md` on `main` carried a `<<<<<<<` marker. The guide scored full marks with it in place, so no measurement would ever have found it.

**What it settles.** A score says how well the agent did, not whether what it read was intact. Both need checking, and only one of them is cheap.

---

## A .env at the root of a public repository, staged by `git add -A`

**Found** 2 November 2026, while committing something else. **Fixed in** this change.

**Evidence.** `git status` after a routine `git add -A`:

```
A  .env
M  test/skill-evals/FINDINGS.md
```

The engine reads a `GITLAB_TOKEN` or a `FIGMA_TOKEN` from a `.env` beside the project it runs on. **This repository is one of the projects the engine gets run on**, and nothing in `.gitignore` covered it. The commit was refused by the privacy hook — which is the last line, not the first, and runs only on a machine that has the hook installed.

**What it settles.** Every guard here was about *names*: a client's, a component's, a token's, caught by a hashed list. None was about the shape of a file that holds a secret by convention. The two are different, and the second is the one that takes a single `git add -A` in a hurry.

**Changed.** `.env` and `.env.*` are ignored (`.env.example` is not, so a project can still show the shape of the file). A test holds the ignore rule in place, because an ignore rule is one line that anyone can tidy away on the day it stops looking necessary.

---

## Three tests called flaky for a day, and it was the machine

**Found** 2 November 2026, by accident, counting processes for an unrelated reason. **Fixed in** #286.

**What I said first, and wrote into the record and the backlog.** Three browser tests fail on a full run and pass alone, every time: the style guide's live page reads empty or half drawn, a test that gives Chrome half a second to start fails on four full runs out of four, and a page accessibility test joined them. The reading was *the suite runs every file at once and this one measures a real browser, so it is being starved*, and the conclusion was that a green run needs a second look — which is how people learn to ignore a red one.

**What was actually there.**

```
69 processes  audit.mjs --watch 5
66 of them with a watch for a parent
the oldest alive for twelve hours
```

The watch took a new engine by starting the new one with `spawnSync` and waiting for it. A watch never ends, so each old process waited for ever with the new one inside it, and every engine update added a layer. All but the newest were doing nothing but holding memory — on the computer that was measuring the tests.

Killed the nested ones, and they were back to three deep within the half hour.

**Ruled out — by me, wrongly, for a day.** *That the tests were wrong.* "Fails on a full run, passes alone" is not a property of a test. It is a question about the machine, and I read it as a fact about the tests three separate times, wrote each one down, and put them on the backlog as work to do on them.

**What it settles, and it is not about browsers.** A symptom that is only ever seen under load is evidence about the load. The engine measures itself on the same computer it runs on, so the engine's own leaks land in its own numbers — and the measurement is the last place they get looked for.

**Measured after the fix.** Two of the three stopped failing. The third did not: the one that gives Chrome half a second to start, times out, and expects the retry to succeed — under a full suite the retry times out too. So the honest split is that two were starvation and one is a budget too tight to survive any load, which is a different problem and a smaller one.

**Still open.** That third test. And a thing worth keeping in view: the watches were down to four and the machine was otherwise quiet, so what is left is the suite competing with itself.

---

## A green run that needs a second look

**Answered, not by fixing a test.** Found 2 November 2026, twice, then a third time. The cause is the case above: #286. Kept as it was written, because the reasoning in it is the thing worth not repeating.

**Evidence.** Two browser tests fail on a full run and pass alone, every time: the style guide's live page reads empty or half drawn, and a test that gives Chrome half a second to start failed on four full runs out of four. Both measure a real browser against a clock while the rest of the suite is using the machine.

**Why it is here.** Until it is fixed, a green run needs a second look — which is how people learn to ignore a red one. It is on the backlog.

---

## A 9/10 that was not a regression, settled by counting instead of arguing

**Answered.** 4 November 2026, on the run that measured the guide for the watch removal.

**Evidence.** The guide tasks came out 72/72. `new-ui-saved`, which runs ten times because it varies, came out 9/10: one run changed nothing and also did not say the system has no green for the confirmation, which are the two acceptable outcomes. A real miss, not a scoring fault - the record shows `changed: []` after six engine runs and thirteen decision points.

The recording tool wrote "noise, not a difference" into the entry, and every earlier entry in `RESULTS.md` reads 79/79, so that line was not evidence of anything. Master was measured next: 10/10. That was still not an answer. Seeing no failure in ten runs when the true rate is 10% happens about 35% of the time, and the mechanism was plausible - this task's agent reads the reference files the change edited, which is the whole reason the guide is measured at all.

Twenty more runs on the branch: 20/20. The branch total is **29/30**, master **10/10**. A rate near 3% explains both (no failure in ten runs at 3% has a 74% chance), and twenty consecutive passes is hard to reconcile with a change that broke something. The failure is a rare intermittent one in that task, not this change's.

**What it teaches.** Three things, in order of how much they cost.

- A single sample of ten decides nothing about a one-in-ten event. The instinct to read 10/10 against 9/10 as "mine broke it, theirs is fine" is wrong in both directions, and the arithmetic to see that takes a second.
- A tool's own word for its result ("noise") is a hypothesis, not a measurement. It was right here, and it was right for a reason nothing in the entry stated.
- `--only <task-id>` runs one task; `--set` takes `build`, `prototype`, `dev`, `heldout`, `private` or `all`, and an unknown set runs zero tasks and reports `0/0 passed · $0.00`, which reads like a refusal. The working results file also has to be moved aside (or `--resume` given) before a fresh count, or the run stops on the rows already there.
