# What the runs taught

`RESULTS.md` records what each evaluation scored. This records what **reading** them taught: each case, the evidence it rests on, the guesses it ruled out, and what changed because of it. It is written as a case is closed, not at the end, so the evidence is still at hand.

A case belongs here when a measured run showed something the engine did wrong and the fix can be pointed at. A guess that turned out wrong is kept, with its evidence: the next person to have the same idea is saved the trip.

Newest first.

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
