# What the runs taught

`RESULTS.md` records what each evaluation scored. This records what **reading** them taught: each case, the evidence it rests on, the guesses it ruled out, and what changed because of it. It is written as a case is closed, not at the end, so the evidence is still at hand.

A case belongs here when a measured run showed something the engine did wrong and the fix can be pointed at. A guess that turned out wrong is kept, with its evidence: the next person to have the same idea is saved the trip.

Newest first.

---

## A measurement is keyed to the guide, not to the commit, and a shared checkout loses it

**Found** 24 November 2026, renaming the style guide to the control center across the guide set (103 mentions in `rms-design-system-engine.md`, `cookbook/`, `reference/`) and measuring it.

**What happened.** The first run was started in the main checkout. It measured 75 of the 82 runs, then stopped: `has rows from guide 6b5a83b5efc3 / engine 8c8b4c28, not abe85009dafc / 8c5beb5e+dirty: move it away to start again`. Another session had switched that checkout to its own branch mid-run, so the engine identity changed under the measurement and the file could no longer be appended to. `RESULTS.md` was never written and the gate stayed red, with $3.64 spent.

**The guess that was wrong.** That rebasing the branch would throw those 75 runs away, since the commit they named no longer existed, and that finishing would cost the whole $3.64 again. It did not: the second run, from a worktree on the rebased commit, printed `resuming: 75 runs already measured, 7 to go` and cost $0.36. The rows are keyed to the guide's own hash, which the rename did not change on a rebase, not to the engine commit printed beside it. A guide change can therefore be rebased freely between a stopped measurement and the one that finishes it.

**What changed because of it.** Nothing in the engine: the evaluation refused correctly, and refusing is what kept two engines' rows out of one record. The lesson is where it runs. A measurement takes tens of minutes and spends real money, and the main checkout is shared with every other session on this computer, any of which may switch the branch without knowing a run is in flight. Run it from a worktree of its own, which nothing else will touch. A fresh worktree holds none of the tool installs or the pinned DSDS release, so fetch and install them there first, or the tasks fail for a reason that is not the guide's.

**What the rename itself measured.** 82/82, 0 rule violations, 0.049 a run and 3.3 turns, each identical to the version before it, the two Portuguese runs included. Renaming the page the guide describes, everywhere the guide describes it, cost the agent nothing.

---

## Every request paid for the whole guide and, for a full audit, for an 80 KB recipe

**Found** 23 November 2026, reading what each guide task was handed before its first write (`procedure.mjs`) over 82 Haiku runs. Every run started at about 24.7k input tokens before its first call, and paid them again on every turn: runs averaged 90k input in 3.2 turns.

**Evidence.**
- *The main guide* was 30.6 KB, and about half of it served one kind of request only: first-time setup, a scoped audit, when to refresh Figma before a full audit with its confidence table, and the rules a fix must keep. Each had a recipe already, which the router hands with that request.
- *What the router printed:* a recipe's own part (when to use it, its steps, what to read more) is 7.4 KB at most, but the route printed the whole file. For a full audit that was 82 KB, the phase reference after its steps. For a Figma refresh it was 144 KB.
- *The project's hook did the opposite:* a recipe over 6 KB became a pointer with none of its steps, so a prototype request (7.4 KB, the costliest task at 6 calls and 200k a run) read the recipe in a call of its own.

**Guesses ruled out.**
- That the router's own lines cost much: about 1.5k tokens a route, small next to the 24.7k start.
- That `figma-add-option` got heavier (2.7 to 7.3 turns over 3 runs): measured 10 more times it took 2.4 turns and 53k input, under the 69k before. Three runs of a task that sometimes explores can swing that far.

**What changed.**
- The route hands a recipe's own part, in the hook and on the command line alike, and says that `--recipe <name>` prints the rest. A test keeps each recipe's own part under 8 KB.
- The main guide keeps one line for each of those four blocks, and each block moved into its recipe: 30.6 KB to 16.4 KB.
- Measured: 82 of 82, no rule broken, 81k input a run against 90k, $0.048 a run against $0.057, the start 21.3k against 24.7k.

---

## An idea for the engine was searched for with `find`, which sees nothing through a linked install

**Found** 23 November 2026. `engine-idea` swings from 3 to 17 turns in every record, this one and the ones before (10 and 16 in two earlier ones).

**Evidence.**
- *The 17-turn transcript:* the recipe said to look in `lib/` in the install folder, the agent ran `find ~/.claude/skills/rms-design-system-engine … | xargs grep`, got nothing, and spent the next twelve calls hunting for the engine's files. The install is a link (the evaluation's, and a person's who installed with a link), and `find` does not follow one it is given.
- *By hand:* `find` through a link to a folder with one matching file found none, and `grep -r` on the same link found it.

**What changed.**
- The recipe gives the search to run, `grep -rli '<word>' ~/.claude/skills/rms-design-system-engine/lib/`, and says not to use `find` there.
- Measured again: 82 of 82, 80k input a run. Each `engine-idea` run now finds the module on its first search (`colour-steps.mjs`, the check the idea asks for) and says it is built. Its turns still vary (5 to 12), now spent reading the module it found to say what it covers, not hunting for the engine's files.

---

## On Windows every browser check failed because a run's home was half moved

**Found** 22 November 2026. The guide tasks' first run on a Windows runner passed 57 of 75. `audit-chip`, `audit-all` and `two-turns-pt` failed 3 of 3 and `disabled-hover` 2 of 3, each for a measured difference the run never named.

**Evidence.**
- *Every transcript that ran the audit:* "Renders correctly in a browser: Not run (Chrome did not start within 30s)". The difference those tasks ask about is one the browser measures, so no run could name it.
- *The suite on the same runner* started Chrome in every test that needs it, so Chrome itself was not the cause.
- *A test that starts Chrome in a run's own environment* (`runEnv`), once the engine said what Chrome last printed: "DevTools remote debugging requires a non-default data directory".

**Guesses ruled out.**
- A slow runner: Chrome failed in every run, at any load, and started in the suite beside it.
- Git Bash, the shell Claude Code runs its commands in on Windows: the test started Chrome from Node, with no shell, and failed the same way.

**What changed.**
- A run on Windows gets a whole home: `USERPROFILE` and its own `AppData\Local` and `AppData\Roaming` (`LOCALAPPDATA`, `APPDATA`). Before, `USERPROFILE` was moved and those two were left on the real profile, so Chrome could not tell its default folder apart and refused every start.
- When Chrome does not start, the engine says what Chrome last printed.
- Measured again: 82 of 82, the four tasks 3 of 3 each.

---

## A request about the engine reached the router without the words that said so

**Found** 22 November 2026. A person asked, in a folder with no setup, for new ideas for the engine, and the router sent the request to first-time setup: nothing in it said the engine itself was the subject, so the no-setup rule won. The router now has a recipe for a request about the engine (`engine-ideas`) and takes it before setup, with or without a config. The new `engine-idea` task measured it: 2 of 3 runs passed on Haiku, and the third still asked for setup.

**Evidence.**
- *The failed run's transcript:* the agent ran `--route` with only the second half of the request ("check that a colour scale's steps keep the same contrast in every colour family") and left out "a new idea for the engine:". The router routed what it was given correctly: a check on a design system, in a folder with no setup.
- *The two that passed* passed the request whole and answered from the recipe, with no setup run and no file changed.

**Guesses ruled out.**
- That the router missed the words: the request it was given held none of them.

**What changed.**
- The main guide says to pass the whole request, its opening words included, and the rule other agents read says the whole request too.
- The router's not-on-PATH line moved into the one rule that covers every command in the guide.
- Measured again on the new guide: `engine-idea` 3 of 3, and the whole set with no failed check.

---

## Handed to Claude Code from a terminal, the guard held what a prototype is

**Found** 21 November 2026, the terminal's hand-over measured end to end (`run.mjs --agent terminal --model claude`): the request typed at `rms-design-system-engine`, the code it asks for handed to Claude Code (`claude -p`, the person's `claude setup-token` login, the engine as install.sh leaves it), and the engine's own check after.

**Evidence.**
- *First run:* build 7 of 9, prototype 0 of 12, `route-ui` failed. Every prototype stopped at "Hand this to Claude Code to write? [no]": a request for a prototype is not one the guard's `asksForChange` reads as a change, and with nobody at the terminal the default was taken. `build-settings` ran the audit and stopped at a decision, the screen never written. `route-ui` checked `ui/filter.json` before anything had written it.
- *Then 8 of 12:* the agents that were handed a prototype wrote it as the catalog said, `prototypes/<Name>.jsx`, and two things stopped them. `--prototype` on a path that was not there printed a usage that named only `<composition.json>`, read as "a code page is refused". The guard asked about any prototype file that was not a `.json`, and its next rule asked about any code file the last message did not ask to change.
- *Then 10 of 12:* `proto-flow` was still held, though the same write replayed through the guard passed. The inner session's transcript showed why it could be: a hook's sent-back reason is written as a user entry, and the guard read it as the person's last message.
- `route-ui` then wrote `"icon": true` for a `False | True` option and the UI check refused it.

**Guesses ruled out.**
- That the hand-over lost the request: the agent's reply quoted it each time.
- That the engine refuses a code page: `--prototype prototypes/X.jsx` checks it when the file is there.

**What changed.**
- A build or a prototype is its own yes to hand the code over; a build left unwritten by the engine's steps is handed over and checked again; a file the request asks to have written is written before the step that checks it.
- `--prototype` says when a named file is not there, and its usage names a page in the system's code first.
- The guard takes a page in the system's code or a composition in the prototypes folder (`prototype.dir`, else `prototypes`), on a request for a prototype, and reads neither a hook's feedback nor a reminder as the person's words.
- The UI check takes a JSON `true` or `false` for an option Figma writes as `False | True`.
- The evaluation's terminal has the engine's command installed for Claude Code, as install.sh gives it.
- Measured after: build 9 of 9, prototype 10 of 12, `route-ui` passed. `proto-flow` stopped to ask whether to add the Payment page the guidelines require and the request left out, a real question with nobody to answer it in one run; `proto-phone`'s page did not wrap its chips on a phone, the agent's own work.

---

## In a terminal, with no agent, the engine answered most tasks and stopped short where a person decides or code is written

**Found** 21 November 2026, the first evaluation of the terminal (`run.mjs --agent terminal`): the request typed at `rms-design-system-engine` in the task's project, no guide and no model, each step it ran read as a shell call and everything it printed as the reply.

**Evidence.**
- *First run, dev set:* 14 of 18. `fix-chip-height`: the audit found the exact fix (`theme.css:60`, 36px to 32px) and wrote it as a patch, and the session stopped at "Your call". `disabled-hover`: the finding said the hover changes the background, not the `:not(:disabled)` guard that stops it. `figma-roles`: the session said what to connect to reach Figma, and never asked before a change. `new-ui-saved`: `--query green` said "no component or token of that name", a name match only.
- *Heldout, after the patch step:* `change-figma` and `pasted-steps` changed `src/theme.css`. The request counted as a yes to the patch because it asked for a change, though the change it asked for was in Figma, or a list of steps that never named the code. `first-setup` did the same: "the tokens are in src/theme.css" read as naming the code.
- *Route:* `route-token` asked `--query chip`, which listed the chip's props and not its tokens, so the radius variable and Figma's 16px were never said.
- *Build and prototype:* 0 of 21. Every one asks for code written from words: a component from Figma, a screen from a sentence.

**Guesses ruled out.**
- That the terminal read the steps' output wrongly: the commands and their output read the same by hand.
- That the request is the yes whenever the guard's `asksForChange` says so: it is the agent's rule for an edit the agent itself chose, and a patch the engine wrote may cover another change. A terminal applies one only when the request asks for a change in the code and the patch holds one change.

**What changed.**
- The terminal shows a patch a step wrote and applies it with `git apply` on a yes. The request is that yes only when it asks for the change in the code ("fix it in the code", "no código") and the patch holds one change.
- A change to Figma is asked about first, applied through Figma Console MCP where the project set it up, with the way back written as the guard writes it, and Figma read again.
- The hover-while-disabled finding names its guard (`.tp-button:not(:disabled):hover`), for every agent.
- `--query` reads a colour by its look or meaning from the tokens' values (`--query green`: the system has none), a request for new UI asks for the colour it names, and a component's answer lists its own tokens with Figma's values.
- Measured after: dev 18 of 18, heldout 6 of 6, route 3 of 4. What is left, `route-ui` and the build and prototype sets, is code written from words, which needs a model.
- So the terminal hands that step to the agent set up with the engine (Claude Code, then Codex, then Cursor), on the person's yes or a request that asked for the code, and the engine checks what it wrote. `run.mjs --agent terminal --model codex` measures it through Codex. Its first run, `build-button`, wrote nothing: Codex had hit its plan's usage limit, and the terminal said nothing of it, so a stopped agent is now said as stopped. The hand-over is not measured yet. Codex's plan resets on 20 December 2026, and a run through Claude Code needs its command line and a login a fresh HOME can use (`claude setup-token`).

---

## In Cursor's agent, no hook ran, and a stopped run read as an empty answer

**Found** 21 November 2026, the first evaluation in Cursor's command-line agent (`run.mjs --agent cursor`, cursor-agent 2026.11.19-f005e9d, model Auto). **Not measured in full yet:** the free plan's usage limit stopped it after 23 of the 54 runs of the 18 guide tasks, all 23 passed.

**Evidence.**
- *The hooks.* The engine's hooks were in the project's `.cursor/hooks.json`, as `--install-hooks --tool cursor` writes them. A hook that only wrote its event's name to a file was put first under every event, in the project and then in `~/.cursor/hooks.json`, and `cursor-agent -p --trust --force` ran a command: nothing was written, for either. Each tool call's `hookAdditionalContexts` came back empty, and the guard never wrote its per-turn state.
- *The login.* A run with a fresh HOME said "Authentication required". Cursor keeps its token in the macOS keychain and finds it through HOME, so with the keychain folder linked into the run's HOME (nothing copied out of it) the same run logged in.
- *The limit.* Two runs of `visual-howto` returned an init event and no result. Asked again, Cursor printed "ActionRequiredError: You've hit your usage limit" on stderr, never in its events.

**Guesses ruled out.**
- That Cursor ignores AGENTS.md: it ran `--route` first in every run read by hand, and asked to write a hand-made colour it refused, naming the system's tokens.
- That the hooks file was malformed: it is the file the engine writes for the Cursor editor, and the logging hook added to it ran nowhere either.
- That Cursor's sandbox would stop Chrome, as Codex's does: it is off by default (`sandbox.mode` "disabled"), and the runs' audits measured in the browser.

**What changed.**
- `cursor.mjs` reads Cursor's real shapes: an edit's content from `streamContent`, a shell's output from `interleavedOutput`.
- A run that stops before its result takes its reason from stderr, and the plan's usage limit is a refusal, never scored.
- The setup page says Cursor's command-line agent ran no hooks, so there the guide works alone. Until a version runs them, Cursor's runs measure the guide without the guard, and the prototype tasks (which Claude Code's Stop hook sends back when a reply is incomplete) are expected to score lower for it.

---

## In Codex, the browser could not start, and nothing said so in a way the agent acted on

**Found** 21 November 2026, the first evaluations in OpenAI Codex (`run.mjs --agent codex`, CLI 0.171.0). **Fixed in** this branch, measured at 52/54 on engine 4cfcd2f7.

**Evidence.** The first run scored 43/54, and every check that needs a browser failed: `audit-chip`, `audit-all` and `disabled-hover`, 3 of 3 each. The audit output said "Chrome failed to start (Chrome exited before DevTools was ready)". Codex runs commands in a sandbox (it sets `CODEX_SANDBOX=seatbelt` and `CODEX_SANDBOX_NETWORK_DISABLED=1`) where Chrome aborts at startup, and on a Mac each try left a crash report. A warning above the NEXT line was relayed and then ignored ("the audit didn't report a disabled-hover issue"). The same step as the NEXT line's first clause was followed: Codex asked to run the command again outside the sandbox, `--approve-for-me` let Codex's own review approve it, and the task passed.

**Guesses ruled out.**
- That the translation of Codex's events was wrong: the engine runs, NEXT lines and replies read correctly from the stream, and a run inspected by hand showed the same commands.
- That Codex ignores AGENTS.md: it ran `--route` first in every run.
- That the timeouts in the second run (8 of 54, silent for 15 minutes) were the guide's: one rerun by hand finished at once, and with two runs at a time instead of three none timed out.

**What changed.**
- No browser is started inside Codex's sandbox (`lib/cdp.mjs` `sandboxRefusal`, and the Firefox and Safari launchers). The structure check says "measured in the browser: not run" instead of dropping the section.
- When nothing was measured in a browser there, the summary says why, and NEXT begins with the rerun outside the sandbox, on a full run as on a scoped one, never on a run that wrote the baseline.
- The AGENTS.md section said "Never on your own: ... accept a difference as debt": Codex read never as never and refused when asked (2 runs). The section now keeps never for what is never done and says the rest waits for the person's ask.
- "share the token set" read as asking for a secret, in the guard as in the evaluation's rule.
- A Codex run that called nothing and wrote 49 tokens is now refused as not run.

---

## An agent that kept the first 300 lines reported an audit it never read to the end

**Found** 21 November 2026, the evaluation of the guide that names the route the person chose to read Figma (78/79). **Fixed in** `lib/guard.mjs`: an engine command piped into `head` or `tail` is refused, with the reason.

**Evidence.** `audit-all` #0 ran `rms-design-system-engine 2>&1 | head -300`, so the report it relayed stopped before the differences the browser measured, and the check `names a measured difference` failed. #1 and #2 read the report whole and passed.

**Guesses ruled out.** That the guide change under measurement caused it: it touches how Figma is read, and the audit's report and its order are unchanged. That the audit printed too little: the difference is in the report, past line 300.

**What changed.** The guard refuses the cut command and asks for it whole. The main guide is at its size limit, so the rule lives where it is enforced rather than as another line to read.

---

## A run the API dropped fails as if the agent never answered

**Found** 21 November 2026, the evaluation of the change that teaches the agent the route the person chose to read Figma. **Fixed in** nothing yet; recorded against the runner's time limit in `test/skill-evals/run.mjs`.

**Evidence.** `new-ui-saved` failed 3 of 10 runs (#6, #7, #8), each with 0 turns, $0.00 and no reply, all timed out within the same seventeen minutes, while #9 right after passed in 10 turns. Measured again on its own, one run at a time, it failed 2 of 10 (#0, #1) the same way and passed 8. Each failed run's transcript ends on `api_retry` with `error: "unknown"` after the model had started thinking; each run that got a reply passed, 15 of 15 across both measurements, in 6 to 13 turns.

**Guesses ruled out.** That the guide change caused it: a run that never receives a reply has read nothing of the guide's answer, and every run that did receive one passed. That running three at once starved them: the second measurement ran one at a time and dropped two.

**What changed.** Nothing in the engine. Left open: a run whose last event is an API retry is scored as a failure of the guide; it should be counted apart and run again, as a usage limit already is.

---

## A check pinned to one wording failed the engine for asking a better question

**Found** 18 November 2026, the evaluation of the change that reads a library with no Figma capture by its own code. **Fixed in** nothing yet; recorded against `figmaStepScore` in `test/skill-evals/tasks.mjs`.

**Evidence.** `figma-add-option` failed 2 of 3 runs. The check `the engine asked what XL changes` matches the question text with `/what does XL change/i`. What the engine actually asked was "Which of chip's Size options is the new XL like (M, L)? Its variants start as copies of that one's." - `figma-ops.mjs`, the branch taken when the `--like` it was given is not an option the axis holds. So the engine refused to guess, which is the behaviour the task guards, and the check failed it for refusing in the other of its two wordings. The agent's slip is upstream of that: the request says "like the L one" and L is on the axis, so `--like L` was there to pass and something else went.

**Guesses ruled out.** That the change under measurement caused it: the question dates to #121, 28 October, and the change touches `component-source.mjs`, `reference/usage.md` and one test, nothing on the Figma path. That it was the machine: re-run on the same commit, idle, the task passed 3/3 on Haiku and 3/3 on Sonnet. `audit-all #1`, the third failure of the same run, **was** the machine - it timed out while the full suite was finishing beside it, and passed 3/3 re-run.

**What changed.** Nothing in the engine. Left open: the check reads one of the two questions the engine can ask here, so a run that takes the other branch fails whatever the engine does. It should accept either, and a separate check should catch the agent dropping a `--like` the request named.

---

## Asked what XL changes, the agent proposed a height of its own

**Found** 14 November 2026, the evaluation of the batch that reads the states a component must have. **Fixed in** `test/skill-evals/rules.mjs` (a false positive, twice); **left open**: an agent that offers a value of its own when the engine asks what a size changes.

**Evidence.** In `figma-add-option` #1 the engine asked, as it now does, what XL changes compared with L. The agent queried the chip, then wrote to the person: "Please give me the exact token names or values from your design system". The secret check read "token" as a secret asked for and failed the run. It is a design token, the kind of answer the engine's question wants, so the check now reads "token names" as one, and the 79 saved runs were scored again with it: 79 of 79. Reading on, the same run went further: it read the snapshots, proposed "XL → 40px", typography "m", wrote the operations to a file of its own and asked the person to confirm. No check fails that: nothing was built and the person was asked. But the engine says never to answer with a value of its own, and here the agent did, as a suggestion.

**Guess ruled out.** That the question itself was unreadable: the other two runs of the task passed whole, asking the person and building nothing.

**What changed.** Only the check's false positive. Left open: the engine's question names the system's variables an answer must be one of (those L binds, and the other steps of their scale), so an agent has names to ask with and none to invent; and a check that fails a reply proposing a raw size the engine did not give.

**Seen again** 15 November 2026, the evaluation of rendered parity in Firefox and Safari: `figma-add-option` #1 and #2 failed the secret check on "using your system's token names" and on "token/variable names". The first was read as a design token already, the second was not, so the check now reads "token/variable names" as one too. Run #1 also offered three sizes of its own (40px with L's padding, 40px with more, 40px with larger text) and asked the person to pick, the open half of this case seen a second time.

**Seen again** 22 November 2026, the evaluation of Playwright driving the browsers: `figma-add-option` #0 asked for XL's height and padding "in pixels or as a token reference". The check read it as a secret asked for, and so did the engine's own Stop hook (`guard.mjs` `asksForSecret`, the same pattern): it sent the reply back, and the agent then told the person the hook had stopped it and offered to loosen the hook. So this time the false positive reached a person, not only a score. Both now read "token reference" and "token names" as a design token, unless "your", "Figma", "API", "access", "personal", "auth", "GitHub" or "GitLab" comes before it (`test/adoption-fixes.test.mjs`). The saved row keeps no reply, so the rescore left it as scored. The task was run again on the fixed engine, 3 of 3 on Haiku.

**Seen again** 22 November 2026, the evaluation of Option-Tab in WebKit on macOS alone: `figma-add-option` #1 failed `puts the question to the person`. Its transcript shows it did put the question: the engine asked what XL changes, and the agent wrote "For the XL variant, tell me which of these properties should change compared to L", listing height, padding and text size. The check wanted a question mark and the request had none. It now takes a request ("tell me", "let me know", "could you" and the like) as the question it is, and still fails a reply that only says what XL will be (`test/skill-evals.test.mjs`). The saved row keeps no reply, so it stays as scored, and the task was run again on the fixed check, 3 of 3 on Haiku.

---

## Four runs that did their task and failed "the run finished"

**Found** 14 November 2026, measuring the screen reader change. **Fixed in** nothing in the engine: the measurement was run again, alone.

**Evidence.** 68 of 72 runs passed. The four that did not were `accept-radius` and `accept-radius-pt`, each failing one check, "the run finished". Their transcripts show the work done (the baseline written, the two differences accepted) and the summary started, then nothing: no result event. The full suite was running in the same checkout at the time, and another session's suite on the same computer. Run again with neither of this session's runs beside it, all 79 passed, those four with them.

**Guess ruled out.** That the change broke accepting a difference. Nothing it touched is on that path (the new request words were checked against the task's words), and the same tasks passed unchanged once the computer was not busy.

**What changed.** Nothing in the engine. A skill evaluation is run on its own, never beside a full suite: a run cut off by a busy computer reads as a run that failed, and the check that names it ("the run finished") says so. The measurement was also stopped once by a commit made while it ran, since it measures one commit: commit first, then measure.
## An empty run is the runner's, not the engine's

**Found** 14 November 2026, measuring the batch that added colour merges, owed states and lesson evidence (guide set f1f79254251b). **Fixed in** nothing: no fix was owed.

**Evidence.** One of 79 runs (`accept-radius` #1) came back with no result and no reply, so both its checks failed. It ran while a second evaluation from another session was running on the same computer. The task's other two runs passed in 2 turns each, and the task run again alone passed 3 of 3, in 2 turns each.

**Guess ruled out.** That the batch's guide change made the agent stop answering on that task: the change touched no part of what `accept-radius` reads, and a run the agent finishes leaves a reply even when it is wrong. A run with no reply at all never started its answer.

**What changed.** Nothing in the engine. The failed row is kept in the record as it ran, beside this note and the clean run again.
## Asked for the roles alone, Figma was said to state every role

**Found** 14 November 2026, measuring the change that makes each kind of Figma edit a yes of its own. **Fixed in** `lib/figma-edits.mjs` (`onlyKinds`) and `lib/audit.mjs`.

**Evidence.** The first run scored 72 of 79. `figma-roles` ("update Figma so it states the roles the code has") went from passing every run to failing every run, on one check: the reply never named the field's `Role: textbox`. All three agents did what the guide says and ran `--figma-edits roles`. The engine answered "Figma states every role the code has" and listed only the chip's decision, and each agent relayed that. The engine was wrong: `--figma-edits` with no kind named still listed the field as a textbox, in its accessibility spec, and its to do list said the field has no role note. The run drops a role note whenever the accessibility spec states the same role, so it is not written twice, and it did so before the kinds were picked. Asked for the roles alone, the specs were then filtered out too, and the role went with them.

**Guess ruled out.** Not the guide's wording and not the scorer: the agents ran the right command and repeated its output faithfully, and the check asks for what the person asked for. The other four failures were not the change either: three runs ended with no result and nothing on stderr (`fix-chip-height`, `accept-radius-pt`, `audit-then-accept`, each #0, while a full suite ran on the same computer), and `new-ui-saved` 9 of 10 is the rate near 3% already settled further down.

**What changed.** The spec's claim on a role counts only when the spec is among what is written: asked for the roles alone, the role note lists the field again. Measured again on the fixed engine, run alone on the computer: 79 of 79, `figma-roles` 3 of 3, no rule broken (`records/figma-edits-one-kind-at-a-time`). The measurement that found it was not recorded as an entry, since its engine was not the one that ships.

---

## The counts were true and the result was still useless

**Found** 14 November 2026, the owner's review of the Figma build benchmark's first sample, each result built in a Figma file to be seen rather than read. **Fixed in** `lib/figma-ops.mjs` and `lib/component-spec.mjs` (three questions the builder now asks), `test/figma-bench/` (the counts sense, asks and rules, requests in a person's own words, `--source` on a team's own library, the sample built in Figma).

**Evidence.** The owner said all three counts held, and that the benchmark tested neither the real library nor its rules. Looking at the results in Figma showed what the counts could not: a boolean asked for a badge was put on the chip's content row, so turning it off would hide the whole chip's inside, with no badge anywhere; an extra-large size was large, copied and left the same size. Both scored full marks. The first sheet only described the results, so a person could not have judged them at all: the owner asked where to see them before answering.

**Run on the owner's own library** (results kept on that computer), the new counts found a third: a component copied with nothing changed is a twin, which that library's own rules forbid (`no-twins`), and the builder built it without a word.

**Guess ruled out.** That the requests were badly written: they were the builder's own phrasing, and the builder did exactly what they said. What was missing was the builder asking when the literal reading cannot be what a person wants, and a score for whether the result makes sense.

**What changed.** The builder asks in the three cases (a size step's change, which part a boolean shows, what makes a copy different where twins are not allowed), and builds nothing until answered. The benchmark scores sense, the questions owed and the rules a result breaks, runs requests in a person's words, runs on a team's library privately, and builds its sample in Figma with each new boolean shown on.

---

## An agent with only the server no longer tries the shell first

**Found** 30 October 2026, in the first route benchmark; **settled** 13 November 2026, running it again. **Fixed in** engine #290 (the routed block names each command's MCP tool beside it).

**Evidence.** On 30 October every route that reached the engine passed, but 10 of the 12 runs with the MCP server and no shell first tried the shell command the routed request named (`RUN:`), were refused, and only then called the tool. Run again on 13 November with the same tasks, model, runs and budget: 12 of 12 with only the server, and none of the 12 tried the shell; each went to the server's tools at once, on 60k of input a run against 70k and 2.0 calls against 2.9. The routes with a shell still use the command line (11 of 12 alone where both are offered), and with neither only reading the last summary as a file passes (2 of 12, against 3).

**Guess ruled out.** That the skill should prefer the server where both are offered, to save the refused call: the refusal happened only without a shell, and with a shell the command line answers in the same number of calls.

**What changed.** Nothing more: the skill keeps the command line first where there is a shell and names the MCP tool beside each command, which is what this run measured.

---

## A layer beyond a box of a fixed size, built without a word

**Found** 12 November 2026, the first run of the Figma build benchmark (`test/figma-bench/`). **Fixed in** `lib/figma-ops.mjs` (the build script's `faults`).

**Evidence.** Of the eight kept requests, seven scored clean on every count. The eighth, a caption added to a tile of a fixed size (120 by 40), ran, was what was asked and touched nothing else, and left a layout fault the tile did not have: the caption ran 6px beyond the box on the stand-in, which lays auto layout out as Figma does. The script returned it among what it changed, with nothing to say it no longer fit.

**Guess ruled out.** Not the stand-in's geometry: the same caption in a box that hugs its content fits, and the fault is the one the construction check's layout rule names once the box is read from Figma. Not a reason to grow the box either: its size is the designer's, and a size the script picked would be a value the system never had.

**What changed.** The build script says it, in `faults`, for the person to decide (grow the box, or shorten the layer); the recipe tells the agent to pass each one on. The benchmark counts a layout fault the script leaves unsaid apart from one it says, so the kept result for this request is a fault said, and one made silently fails the suite.

---

## A `.env` said just before is still setup, not a request for a token

**Found** 12 November 2026, measuring the same accessibility batch a third time, on top of main. **Fixed in** `test/skill-evals/rules.mjs` (`asksForToken`).

**Evidence.** 78 of 79 runs passed; the one failure was `visual-howto` #0, on the global rule "never asks for a token in chat". Its answer was the right one: Figma's images come *"from `.design-system-engine-refs/components/<name>.png` … or the Figma REST API with `FIGMA_TOKEN` in `.env`"*, and its next sentence said they are *"fetched live from Figma if you provide a `FIGMA_TOKEN`"*. Nothing asked for the token in the chat; the reply that followed said *"add `FIGMA_TOKEN` to your project's `.env` file"*.

**Guess ruled out.** Not the batch, which touched nothing about tokens or Figma's images; `visual-howto` passed every run of the two measurements before it. Not a model getting worse at the rule: the rule already read "provide a token" next to a `.env` as setting the project up, and was looking for that `.env` only in the sentences after.

**What changed.** The rule looks at the three sentences before as well. *Paste*, *share*, *send* and *tell* stay a request whatever surrounds them, and both kinds are cases in the rule's own test, the run's sentence among them. The saved runs were scored again with no model tokens: exactly that one changed verdict, and the entry records 79/79 with no rule broken.

**What it settles.** A broken rule is the most serious thing an evaluation can report, which is why it is read first and taken at its word last. Twice in one batch the scorer, not the agent, was what failed.

---

## "Lacks a green" is the gap said, and the scorer did not know it

**Found** 12 November 2026, measuring a batch of accessibility changes (a hand check said to be a person's word, the judgement calls pre-sorted, which browser answered each criterion). **Fixed in** `test/skill-evals/tasks.mjs` (`NO_GREEN`).

**Evidence.** 77 of 79 runs passed; both failures were `new-ui-saved`, runs #0 and #3, on one check: "adds the confirmation, or says the system has no green for it". Their transcripts show the right answer, each after five or six queries of the engine: *"The system lacks a green color token for the 'Saved' confirmation"* and *"the system lacks a green color for the 'Saved' confirmation state"*, each naming the tokens there are and the experimental `tag` component that is not built. Nothing was added to the page, nothing off the system was invented, no rule was broken. The scorer read the gap only when it was said with *no*, *not* or *n't*.

**Guess ruled out.** Not the batch's guide change. The guide files it touched are the configuration and usage references for accessibility (a model asked to pre-sort wordings, the browsers a criterion depends on, a hand check said to be testimony); `new-ui-saved` reads none of it, and both runs read only what `--query` returned. Not noise either: the same check, on the same two sentences, fails every time they are scored.

**What changed.** `NO_GREEN` also reads *lacks*, *lacking*, *without*, *missing* (and *falta*, *sem*), and a green said to be missing the other way round. Both sentences, as the runs wrote them, are known-good cases in the scorer's own test, beside *"The page lacks room for it. I made the button green."*, which stays a fail. The saved runs were scored again with no model tokens (`rescore.mjs`): exactly those two changed verdict, and the entry records 79/79.

**What it settles.** A failure that reads as the guide getting worse can be the scorer not knowing a plain way of saying the right thing. Reading the transcript first is what told the two apart.

---

## On the composition side the agent does not fail; the engine does

**Found** 12 November 2026, measuring the composition path on a model above Haiku. **Fixed in** `lib/prototype.mjs` (`fromScreens`) and `test/skill-evals/record.mjs` (`scrubPaths`).

**Evidence.** The twelve prototype tasks on Tidepool with only its Figma file, Opus 5, five runs each: 60 runs, $53.94, every run passed, no check ever failed and no rule was broken. Against the first pass of this arm (Haiku 5.5, 24 runs, 19 of 24 before the catalog was given Figma's spacing), a stronger model at more runs finds nothing wrong with what the agent builds.

The engine, meanwhile, fell over in 5 of those runs — every run of `proto-linked-figma` — with a raw `SyntaxError` from inside `fromScreens`. `--prototype --from-screens` reads a kept `prototypes/<name>.json` with `JSON.parse` and no guard, twice, while the screen capture read two lines above it is guarded and says plainly *"is not a screen capture"*. That file is the person's own, edited by hand: a trailing comma or a note left in it took the whole command down. No command of the engine ever answers with a stack trace, and this one did, every time.

**Guess ruled out.** Not the task's linked guidelines, and not the Figma-only system: the crash reproduces on a plain copy of the fixture the moment the kept file is not valid JSON, and reproduces nowhere else. What the task did was write that file and then run the command again — which is what anybody iterating on a prototype does.

**What changed.** The kept file is read once, inside a guard that names the file and the position and says `--force` rewrites it from the screen; the other screens in the run are still drawn. `test/prototype.test.mjs` holds it.

**And a second thing the record itself showed.** The 60 rows carried a folder of this computer into a public record, which `scrubPaths` was supposed to prevent. It writes out the engine's root and the home folder whole — but what a run says about itself is kept to 80 characters, so a root longer than that never appears whole and never matched. The scrub now writes out each shorter beginning of a root as well, down to 24 characters.

**What it settles.** The composition path is no longer the unmeasured half: 60 runs on a strong model say the agent's side of it holds. The failures there are the engine's own, and they are invisible in a pass rate — all 5 crashed runs count as passes, because the fault is not the agent's. A measurement read by its pass column alone would have reported this arm perfect.

---

## A question in place of the confirmation, once in thirty

**Found** 9 November 2026, measuring the rules read from the file's own examples. **Changed** nothing: the miss was not the change's.

**Evidence.** The run scored 78 of 79. The miss was `new-ui-saved` #8, the green "Saved" confirmation in a system with no green. Its agent queried the button, the tag and the construction rules, read that the tag's `Positive` tone has no styles in the code, and ended its turn with a question: build the tag first, or use plain HTML with the system's variables? It changed nothing and never said the system has no green, so the second check failed. No guard fired; no rule was broken. The same case alone, 20 runs on the same engine (`records/2026-11-09-new-ui-saved-alone`): 20/20.

**Ruled out.** The batch's own rules. They add lines to the construction answer the agent read, but none of them is about colour or the tag, and 20 runs reading the same answer passed. The guard message changed in the case below: it did not fire here.

**Left open.** An agent that reads the tag's `Positive` tone as the green it was asked for, and stops to ask rather than say the tag is not built. Once in 30 runs is under this task's usual rate; it is worth a look if it comes back.

---

## The gap said the other way round, and the scorer heard nothing

**Found** 9 November 2026, measuring what a component binds against the token layers. **Changed** the scorer: `new-ui-saved` hears the gap in either order (`NO_GREEN`, `tasks.mjs`).

**Evidence.** The run scored 78 of 79. The miss was `new-ui-saved`, the green "Saved" confirmation in a system with no green. Its agent tried to add a green, the guard held the edit with the message that says the system has no colour for this (the change of the case below), and the reply told the person so: "preventing me from inventing a green color that doesn't exist in the system". The check looked for the negation before the colour ("no green", "not a success colour") within one sentence, and this one comes after it.

**Ruled out.** The change being measured: it reads what components bind, and the run never got that far. The guard: it said what it was changed to say, and the agent repeated it.

**After the fix.** The saved runs scored again with the fixed check (`rescore.mjs`, no model calls): 79 of 79, one verdict changed, this one. A reply that names the green and says nothing is missing still fails.

**What it teaches.** A check that matches words in one order is a check of the wording, not of what was said. The fix of the case below made agents say it a new way, and the scorer had only heard the old one.

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

**Seen again, and paid for four times.** 9 November 2026, measuring one paragraph of `reference/usage.md` that said the style guide is written for machines too. `new-ui-saved #0` failed with the same signature as the case above - `changed: []` after six engine runs and fourteen decision points, 16 turns against 7 to 14 for the nine that passed - and the recording tool again wrote "noise, not a difference" into the entry. Ten runs of that task alone came out 10/10, and the task was 29/30 across the day: the same rate near 3% this case already settled.

**What the day cost, and why the paragraph was dropped.** About $14.60 over four measurements, for prose that measured 97k to 102k input a run against 101k - that is, no cost at all to what an agent reads. Three separate pull requests touched `reference/usage.md` on the same day. A measurement takes forty-five minutes, and `test/skill-evals.test.mjs` holds that a file two branches both changed is measured by neither entry, so each landing invalidated the run before it. The owner dropped the paragraph rather than pay a fifth time; the twin stays documented for people in `docs/collaboration.md`, and it needs no request and no flag, so nothing an agent does depends on the guide set naming it. The lesson is about timing, not about the rule: on a day when a guide file is moving, measure and merge in one stretch, or wait for the file to be still.

**Two mistakes worth not repeating.** Nothing new was learned about the task: the session read the failing row, reasoned from first principles to the right answer, asked the owner to spend about a dollar confirming it, and only then read this file - where the answer had been written five days earlier, with the arithmetic. `RESULTS.md` also carries the same failure on the same check in six separate entries, which is one grep. Then one of the four runs was spent on nothing: the gate had already passed on that same guide set hash, and what broke it was dropping that run's entry while rebuilding the branch. The reasoning that spent it read `git diff HEAD..origin/main` with HEAD at the branch's own tip, so the branch's own change to the file was taken for somebody else's, and the hash being identical in both failures went unnoticed. Read this file and grep `RESULTS.md` before paying to measure a 9/10 on `new-ui-saved`; diff against `origin/main`, never against HEAD, before calling a measurement stale.

## A grep that hid a stack trace, and three hypotheses about the wrong thing

**The case.** A new catalog check printed nothing on a real system of 275 components. The module was right - verified standalone against hand cases - so the reading was that the context it read was not the context with the descriptions in it. Three explanations followed, each plausible and each about which object the catalog passes: the page's context rather than the system's, an intent layer that fills every purpose so nothing is left to flag, a field read under the wrong name.

**What it actually was.** The code was throwing. The wiring named a variable that does not exist in that function, so the catalog died before it printed anything, every time. The run that would have shown it was read through `grep -E "^\[dbg\]|DOCUMENTED IN NAME"`, which matches neither `ReferenceError` nor any line of a stack trace. The filter that made the output short enough to read is the filter that removed the answer.

**Evidence.** The same command with no grep printed `ReferenceError: cfg is not defined` and four stack frames, naming the file and the line. The first hypothesis had already been tested and had come back consistent with a crash - a debug line printed, then nothing - and that was read as "the context is wrong" rather than "the process stopped".

**What it teaches.**

- A filtered run cannot distinguish "produced nothing" from "died before producing anything". When output is missing rather than wrong, read it unfiltered once before forming a hypothesis about why. One command, and it ends the question.
- "The module is right, so the input must be wrong" skips a step: the module being right says nothing about whether the module was reached.
- Three hypotheses that are all about the same component are one hypothesis. All three here were "the catalog passes the wrong object", varied in the details; none of them was testable without first establishing that the catalog ran at all.

**What changed because of it.** The check stopped taking the library's name from configuration - the variable that did not exist was there to supply it - and reads its system's own boilerplate instead: a word half a system's descriptions share is that team's house phrasing, whatever it is, and nothing outside the system has to know it. On a real system of 275 components the check finds two, both a component's name restated as a sentence.
## The check told a page scoring 10 to keep going until it scored 10

**The case.** A prototype page written against a real system came back `✅ Ready`, `🎨 AS A PAGE 10/10`, and three `⚠️` lines under `📱 EVERY SIZE` where column headings were cut on a phone. The advice under it read: *fix each ⚠️ line under 🎨 and 📱 … run it again until it scores 10*. Both halves are wrong for that run. `🎨` held nothing to fix, and the score it was sent to reach was the score it already had.

**Why no fixture caught it.** The line fired on `review.findings.length || drawn?.lines?.length` and then named both sections unconditionally. Every case a fixture builds has findings in the scored section, so the two are never separated, and the sentence reads correctly whenever `🎨` has anything at all. The combination that breaks it - a page that scores 10 and is cut at one width - only turns up on a real system with real words in it, and it is the ordinary outcome there rather than an edge case: a layout can be faultless and still cut a translated heading.

**What it teaches.** Two sections under one `if` share one sentence, and a sentence written for the case where both fired is wrong for the case where one did. `📱 EVERY SIZE` has no score at all; asking for a 10 there is asking for something that does not exist. Advice is output like any other, and it is worth checking against the run that produced it rather than against the case it was written for.

**What changed.** `warnedIn` names only the sections that found something and says whether a score is the thing to chase; `fixWarned` builds the sentence from that. A page with only size findings is now told to run it again *until no line is left*.

**Found by proving a route end to end.** The run only happened because the visual half of the prototype route had never been exercised on a real system - the copy it was tried in had no `node_modules`, so every width check had been skipped silently. Linking the real install in was the whole cost, and it produced three true findings about the page and one defect in the engine.

## A linked flow reported as a page full of dead buttons

**The case.** A prototype of four pages, built on a real design system and linked the way a product links pages — `router.push({ name: 'OrderDetail' })` — came back from the browser check with its main action named as doing nothing: `⚠️  "Approve" changes nothing on the page when it is clicked`. The control was correct. Every page's main action was reported the same way.

**Three guesses, all wrong, all made without looking.** That the harness never installed a router (it does). That the exposure of it ran before the router existed (it did not). That a push by name needs the route registered on the component (it does not). Each was plausible and each was cheaper to write than to check, which is why three went by before one was tested.

**What it actually was.** `appSetup` deliberately drops the project's router from the setup it installs — `skip()` in `vue-harness.mjs`, so a component drawn alone does not drive the product's real history — and the harness gives the page a router of its own instead. That router knew exactly one route, a catch-all. So `push({ name })` threw `No match for` synchronously inside the click handler, the app's own `errorHandler` swallowed it the way a product's entry would, and the check saw no navigation and no error. Two true facts, one false conclusion.

**Evidence.** Driving the live harness directly: `__dseRouter.getRoutes()` returned one route, `resolve({ name })` threw `No match for`, the page's `$router` was that same object, and swapping in an error handler around the click caught `No match for` — the app had it all along. After the fix the same probe reads 218 routes, resolves to `/orders/7`, and the click moves the route from `/`.

**What it teaches.**

- A check that reports absence of evidence needs to know what would have swallowed the evidence. "Nothing happened" and "something happened where I was not listening" look identical from outside, and this is the second finding in this file with that shape.
- A deliberate simplification is a defect the moment something more ambitious runs through it. The stub router was right for one component drawn alone and wrong for a prototype of linked pages, and nothing marked the boundary.
- Guessing is cheap until it is three guesses deep. The one probe that settled it took less time than any of the three guesses took to write.

**What changed.** The stub router is given what the project's own router knows, by name and by path, each route drawing nothing — the router is still never installed, so the product's history is still not driven. The acts check listens on the app's own error handler for the length of the click and names a control whose handler threw as wired rather than inert, because the two want opposite fixes.

## The first thing the watch asked was four versions behind

**The case.** A watch was built for every outside fact the engine pins, because DSDS had one and nothing else did. Run against the real repository on its first day it found the accessibility rule set pinned four minor versions back - and nothing in the repository, the suite or any workflow had said so for as long as it had been true.

**What else it found, which was not the point of it.** One pin has **no source recorded anywhere**: a format version with no repository, registry or page the engine knows to ask. It had been invisible precisely because nothing listed it. The list now carries it and reports it as unwatched, and that reads as the open question it is rather than as nothing at all.

**The bump is not a version string.** Moving the pin in a scratch copy and running the accessibility tests failed five of them. One is a real change of behaviour, not a stale fixture: the rule set no longer reports a list violation the engine surfaces, so a blocker under 1.3.1 that the check currently catches would stop being caught. Whether that is the standard correcting itself or the engine losing a finding is a question for a person, and it is exactly why the watch proposes nothing where the DSDS watch proposes a pull request: DSDS has a conformance suite to prove a move against, and a rule set has only its own judgement.

**What it teaches.**

- A watch's value is not the alert it sends later, it is the inventory it forces now. Listing what is pinned found a pin nobody could ask about, which no amount of asking would ever have surfaced.
- "Pinned and current" and "pinned and nobody asks" look identical from inside a repository, and so do "frozen on purpose" and "forgotten". Only a list that says which is which tells them apart.
- A watch that proposes the fix is right where something can prove the fix (a conformance suite) and wrong where nothing can. Proposing a move that silently drops a finding would be worse than the staleness it cures.

**What changed.** `pinned-standards.mjs` holds every pin with how its source is asked - a registry's newest version, a repository's newest tag, or, for a curated table with no version at all, how many months since it was read - and a weekly workflow keeps one issue current while anything is behind. A pin whose line is renamed fails the suite rather than silently reading nothing, because a watch that reads nothing and says nothing is worse than no watch.

## A fixture written by the same hand as the harness proves only that the hand is consistent

**The case.** A harness to draw React components with a project's own React was built, with a fixture made for it: three components needing state, context and a portal. Every test passed. Run against a public open-source React design system — a real one, nobody's client, MIT — it drew **nothing at all**, and took four fixes to draw anything.

**The four, and why a fixture could not have shown them.**

- **A component behind `forwardRef` is an object, not a function.** The reader accepted functions, so it reported "no component exported" for every component that takes a ref, which is most of a real system. The fixture's components were plain functions, because that is what one writes when writing three components to prove a point.
- **A CommonJS package imported by a *dependency*** has no named exports until the build converts it. The list of packages to convert was built by reading the project's own source, which by construction cannot contain a package only a dependency imports. The fixture had no dependencies.
- **A build-time flag the ecosystem is written against** (`__DEV__`) is replaced by every bundler and defined by none of the engine's own config. A component that mentions it throws before it draws. The fixture mentioned nothing it did not define.
- **A published design system keeps its tokens in a package**, and a stylesheet asked for by path under the installed packages answers 404: the import throws and the page then draws nothing. The fixture kept its tokens in its own source, as a fixture would.

**The shape they share.** Each is a thing a real system has and a small invented one does not: a dependency, a published package, a convention from the wider ecosystem, a component written the way the ecosystem writes them. The fixture tested the harness against the author's idea of a design system, which is the same idea that produced the harness.

**What it teaches.**

- A fixture proves the thing works on what its author thought of. It cannot find what its author did not think of, and that is exactly the set a real system is made of.
- "All tests pass" and "it works on a real system" are different claims, and the first is often used to imply the second. Writing the item to demand a real run before the badge was right, and the badge would have been wrong without it.
- The four fixes are each a line or two. What was expensive was not knowing they were needed.

**What changed.** The reader accepts anything React draws, the build converts what it finds rather than only what the source names, the flag is defined, and a stylesheet inside a package is asked for by the package's name. All four are pinned by tests, and the fixture gained a component behind `forwardRef` so the first can never come back.
