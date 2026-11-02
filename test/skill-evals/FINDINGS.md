# What the runs taught

`RESULTS.md` records what each evaluation scored. This records what **reading** them taught: each case, the evidence it rests on, the guesses it ruled out, and what changed because of it. It is written as a case is closed, not at the end, so the evidence is still at hand.

A case belongs here when a measured run showed something the engine did wrong and the fix can be pointed at. A guess that turned out wrong is kept, with its evidence: the next person to have the same idea is saved the trip.

Newest first.

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

## A green run that needs a second look

**Open.** Found 2 November 2026, twice.

**Evidence.** Two browser tests fail on a full run and pass alone, every time: the style guide's live page reads empty or half drawn, and a test that gives Chrome half a second to start failed on four full runs out of four. Both measure a real browser against a clock while the rest of the suite is using the machine.

**Why it is here.** Until it is fixed, a green run needs a second look — which is how people learn to ignore a red one. It is on the backlog.
