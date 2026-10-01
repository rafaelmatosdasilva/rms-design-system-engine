# Skill evaluation results

## 2026-10: the skill renamed to rms-design-system-engine (continuous evaluation)

A fresh run of the adopted guide after the rename: the command, the terminal command, the install folder, the
guide's file name and the files the engine keeps in a project have the new name (`rms-design-system-engine`,
`design-system-engine-*`); the guide's text changed only in those names and its title. Engine 28aa8ba. The same 22
tasks, each run as `/rms-design-system-engine <task>`. Compared with the I69 measurement below (engine 51d0466), its
first runs of each task up to the same count; both scored by the current scorers.

Guide set measured: `eab10f44308d`

| | I69 (adopted) | Renamed |
|---|---|---|
| Sonnet, held-out (5 runs each) | 40/40 · 133k | 40/40 · 131k |
| Sonnet, all 22 tasks | 110/110 | 110/110 |
| Sonnet, mean cost / input per request, 22 tasks | $0.141 / 127k | $0.142 / 130k |
| Haiku, held-out (3 runs each) | 24/24 · 96k | 24/24 · 81k |
| Haiku, all 22 tasks | 66/66 | 66/66 |
| Haiku, mean cost / input per request, 22 tasks | $0.057 / 87k | $0.053 / 78k |
| Rule violations (both models) | 0 | 0 |
| Choices the agent made that no `NEXT:` line gave, per request (Haiku) | 2.0 | 1.9 |

**Reading.** Every task passes on both models under the new name and no rule is broken. The adoption rule passes
on the held-out set for both models, with less input. Over all 22 tasks Sonnet read 2% more, from `new-ui-saved`
(380k to 470k per request): its five runs range from 199k to 521k on I69 and from 402k to 601k now, the longest a run
that stopped to ask which way to go, so the difference is within what single runs of this task vary by. No run used
the old command or failed to find the new one: the engine was called as `rms-design-system-engine` or through
`~/.claude/skills/rms-design-system-engine/audit.mjs`, in the same proportions as under the old name.

**Found by this evaluation and fixed (in the scorers, not the skill).**
- The scorers' list of files the engine writes on every run still named `parity-agreed.json` and
  `parity-history.json`, so in every `props-question` run and two `toggle-note` runs (7 on Sonnet, 3 on Haiku) the
  engine's own `design-system-engine-agreed.json` and `-history.json` first counted as files the agent changed. The
  list now has both names, and a run saved before the rename is read with its files and command under their new
  names: scored again with these scorers, the 236 runs of the I69 measurement keep every verdict.
- One Sonnet `new-ui-saved` reply, which suggested asking the designer to "give it an actual fill/color token", was
  read as asking for a secret. A design token (a colour, fill or spacing token) is not one; the case is in the
  scorer's test.

## 2026-09: renamed instances in the Figma hygiene record (idea I69)

A fresh run of the adopted guide (the `cookbook` variant, the checkout) after the full-audit recipe's hygiene
snippet learned to record an instance whose layer spells its component's name another way. Engine 51d0466. 22
tasks: `new-ui-saved` (build a new screen with the design system, the router sending it to `ask-the-system`) is
new. Compared with the adopted measurement above (engine 2365d8a), its first runs of each task up to the same count.

Guide set measured: `8b6372801eb8`

| | Adopted | This guide |
|---|---|---|
| Sonnet, held-out (5 runs each) | 40/40 | 40/40 |
| Sonnet, the 21 common tasks | 104/105 | 105/105 |
| Sonnet, mean cost / input per request, 21 tasks | $0.138 / 118k | $0.138 / 115k |
| Haiku, held-out (3 runs each) | 24/24 | 24/24 |
| Haiku, the 21 common tasks | 63/63 | 63/63 |
| Haiku, mean cost / input per request, 21 tasks | $0.052 / 69k | $0.055 / 74k |
| `new-ui-saved` (new) | | Sonnet 5/5 · Haiku 3/3 |
| Rule violations (both models) | 0 | 0 |
| Choices the agent made that no `NEXT:` line gave, per request (Haiku) | 1.5 | 1.6 |

**Reading.** Every task passes on both models and no rule is broken. On Sonnet the adoption rule passes (input
118k to 115k, held-out 136k to 133k). On Haiku input was higher at 3 runs (held-out 81k to 96k), in six tasks
where some runs read the full-audit recipe before running the command the router gave, or listed the project
first. The recipe grew by 545 bytes, so those six were run to 13 runs on both versions, the protocol I56 used:

| Haiku, 13 runs each | Adopted | This guide |
|---|---|---|
| refresh-no-figma, pasted-steps, forbidden-green, private-statusbar, audit-all, visual-howto | 77/78 | 78/78 |
| Mean input / cost per request on these six | 69k / $0.051 | 65k / $0.052 |

With 13 runs the input is lower, not higher: the 3-run difference was which runs chose to read the recipe. The
adopted guide's one miss, read by hand: on refresh-no-figma the reply said the audit used today's committed
snapshots but never said the Figma data could not be refreshed here.

## 2026-09: change only what was asked, one named difference, and the guide for I62 to I68 (continuous evaluation)

A fresh run of the adopted guide (the `cookbook` variant, the checkout) after guide changes: an Audit Rule to
change only what was asked, the `ask-the-system` recipe, `--match` in the accept-debt recipe (never narrow
`parity-baseline.json` by hand), and the reference for the edit check (I62), the Figma call budget (I67), the
llms.txt mandate (I63), the hidden expected component and prompt check in evals (I64, I68) and Tailwind (I65).
Engine 2365d8a: the hooks every run installs include the edit check. 21 tasks: `props-question` is new. Both
this guide and the adopted one (engine c3fd998) are scored by the current scorers: the `accept-radius` scorer
now also requires everything else to stay strict, and every saved run of both was scored again.

Guide set measured: `59ea4c33daac`

| | Adopted (rescored) | This guide |
|---|---|---|
| Sonnet, held-out (5 runs each) | 40/40 | 40/40 |
| Sonnet, the 20 common tasks | 95/100 | 100/100 |
| Sonnet, mean cost / input per request, 20 tasks | $0.143 / 124k | $0.139 / 118k |
| Haiku, held-out (3 runs each) | 24/24 | 24/24 |
| Haiku, the 20 common tasks | 54/60 | 60/60 |
| Haiku, mean cost / input per request, 20 tasks | $0.055 / 75k | $0.052 / 67k |
| `props-question` (new) | | Sonnet 4/5 · Haiku 3/3 |
| Rule violations (both models) | 0 | 0 |
| Choices the agent made that no `NEXT:` line gave, per request (Haiku) | 1.6 | 1.4 |

**Reading.** Every common task passes on both models where the adopted guide missed 5 on Sonnet and 6 on
Haiku, and no rule is broken. Input is lower over the 20 tasks on both models, and on the held-out set for
Haiku (95k to 81k). On the Sonnet held-out set it was 3% higher at 5 runs (132k to 136k), so the held-out tasks
whose input grew were run to 13 runs on both versions, and so were the four Sonnet tasks that grew in the
previous measurement, the protocol I56 used:

| Sonnet, 13 runs each | Adopted (rescored) | This guide |
|---|---|---|
| two-turns-pt, forbidden-green, change-figma (held-out) | 39/39 · 183k / $0.202 | 39/39 · 190k / $0.206 |
| audit-all, accept-radius, private-badge-pt, fix-first | 42/52 · 112k / $0.138 | 52/52 · 112k / $0.136 |
| Haiku, two-turns-pt | 33/33 | 13/13 |

With 13 runs the held-out difference is about 4% more input per request, the same as in the previous
measurement: mostly noise, the rest the longer report. accept-radius, which the adopted guide got right 3 times
in 13, is right every time and cheaper (98k to 69k): one routed command instead of a hand edit.

**The misses the adopted guide had.** Asked to accept only the chip's radius and keep everything else strict,
most runs of the adopted guide accepted every failing line of the chip, its prop names too: `accept-radius`
2/5 and `accept-radius-pt` 3/5 on Sonnet, 0/3 and 0/3 on Haiku. The old scorer passed them (it checked only
that the radius was accepted). `--baseline --findings --match radi`, which the router adds when the person
names the kind of difference, accepts that line alone: 5/5, 5/5, 3/3, 3/3.

**Found by this evaluation and fixed.**
- Two intermediate guides were measured and not recorded. The first (the `ask-the-system` recipe alone) had
  2 of 33 Haiku runs of `two-turns-pt` rename the chip's props when asked only for its height, against 0 of 33
  on the adopted guide: the rule to change only what was asked lived only in the fix recipe, which those runs
  never opened. It is now an Audit Rule, and the routed fix note says it too (33/33 after). The second showed
  the `accept-radius` narrowing by hand (7 of 13 Sonnet runs), the reason for `--match`.
- One Sonnet `props-question` run stopped to ask whether it could run the audit, because `--query` said there was
  no catalog yet. `--query` now runs the audit itself the first time (94ee399).

## 2026-09: the guide after I57, I58, I34, I23, I44 and exact prop names (continuous evaluation)

A fresh run of the adopted guide (the `cookbook` variant, the checkout) after guide changes: the flex-shrink
rule made advisory, the focus-ring note on literals, the Figma hygiene record in the value sweep, and the
props gate's NAME difference. Same tasks, runs and scorers as I56; engine c3fd998. Compared with the adopted
I56 measurement, its first runs of each task up to the same count.

Guide set measured: `8fe89ab23319`

| | I56 (adopted) | This guide |
|---|---|---|
| Sonnet, all 20 tasks (5 runs each) | 100/100 | 100/100 |
| Sonnet, mean cost / input per request | $0.130 / 121k | $0.143 / 124k |
| Haiku, all 20 tasks (3 runs each) | 60/60 | 60/60 |
| Haiku, mean cost / input per request | $0.047 / 65k | $0.055 / 75k |
| Rule violations (both models) | 0 | 0 |
| Choices the agent made that no `NEXT:` line gave, per request (Haiku) | 1.3 | 1.6 |

**Reading.** Every task passes on both models and no rule is broken. The adoption rule passes for Sonnet and
not for Haiku, on input tokens alone: a request that ran the audit once costs the same (49k) as before; the
difference is in runs where Haiku took extra steps (opening the skill through the Skill tool before the
command, reading the recipe and the config first, splitting the audit output with head and tail). Three runs
per task cannot tell that from noise, so the six tasks whose input grew were run to 13 runs on both versions,
the protocol I56 used for a lower pass rate:

| Haiku, 13 runs each | I56 (adopted) | This guide |
|---|---|---|
| forbidden-green, pasted-steps, fix-first, first-setup, refresh-no-figma, audit-all | 76/78 | 78/78 |
| Mean input / cost per request on these six | 71k / $0.048 | 74k / $0.052 |

With 13 runs the difference is about 4% more input per request, not 21%: mostly noise, the rest the longer
report (the new checks print more). The two I56 misses, read by hand: on refresh-no-figma the reply called
the snapshots current and never said the refresh had not happened (one only implied it). This guide's
no-refresh SAY line names how to give Figma access, and it had no miss. Two of this guide's forbidden-green
replies first scored as misses were scorer false negatives ("the snapshots aren't actually stale", "are
actually current"); the scorer was fixed and every saved run scored again.

**Found by this evaluation and fixed.** One Sonnet run, in a first pass on the previous guide, ended by
offering to take "Figma access (MCP tool or token)", which the never-ask-for-a-token rule counts as a
violation. The no-refresh SAY line now says how to give access: the Figma MCP server, or FIGMA_TOKEN in the
project's .env file, never in the chat. No violation in this run.

## 2026-09: a bare guide, the engine's router and nothing else (idea I61)

The `bare` variant (`variants.mjs`, 449 bytes) only says to run `--route` and do what it prints. Same tasks, runs and
engine as the adopted I56 measurement (158802e; the harness file carrying the variant marks it +dirty).

| | Adopted guide (I56) | Bare |
|---|---|---|
| Sonnet, all 20 tasks | 100/100 | 100/100 |
| Sonnet, mean cost / input per request | $0.130 / 121k | $0.118 / 122k |
| Haiku, all 20 tasks | 60/60 | 59/60 |
| Haiku, mean cost / input per request | $0.047 / 65k | $0.046 / 76k |
| Rule violations | 0 | 1 |

**Decision.** Not adopted: a new rule violation, and almost no saving (the adopted guide is about 7k tokens of the
120k a request reads; the audit's output is the rest). The violation: without the guide, Haiku on refresh-no-figma ran
an internal script by hand, edited `src/theme.css` unasked and tried to commit (the hook refused the commit). The edit
got through because the hook read "the design changed yesterday" as a request to change something; the hook now counts
only the asking forms of a change verb (fixed after this measurement).

## 2026-09: deterministic core, thin agent layer (idea I56)

Same harness, tasks and scorers as the cookbook measurement below; every saved run of all variants scored again with
the final scorers. I56 is the cookbook guide plus decisions moved from the model into the engine: `--route` picks the
recipe and the exact command; the project's hook routes each `/rms-figma-code-parity` request before the agent reads
it; `SAY:` lines give the exact words for what the skill cannot do (change Figma, refresh without a Figma tool); the
SUMMARY says whether the Figma data was refreshed; the hooks read the person's latest message before a code edit or
the hand-back apply; accepting debt is scoped to a named component, and a scoped `--baseline` keeps the rest of the
file. Engine 158802e.

Guide set measured: `60eff78d1beb`

| | Baseline | Cookbook | I56 |
|---|---|---|---|
| Sonnet, all 20 tasks (5 runs each) | 100/100 | 100/100 | 100/100 |
| Sonnet, mean cost per request | $0.68 | $0.19 | $0.13 |
| Sonnet, mean input tokens per request | 730k | 224k | 121k |
| Haiku, held-out tasks | 26/34 (76%) | 22/24 (92%) | 34/34 (100%) |
| Haiku, all tasks | 96/110 | 62/67 | 110/110 |
| Haiku, mean cost per request | $0.23 | $0.06 | $0.04 |
| Haiku, mean input tokens per request | 368k | 95k | 55k |
| Rule violations (both models) | 5 | 2 | 0 |
| Choices the agent made that no `NEXT:` line gave, per request (Haiku) | 2.4 | 2.3 | 1.1 |

Haiku ran 13 times on the five tasks the earlier variants had re-run, so each comparison has the same counts
(against the cookbook, the first runs of each task up to its count).

**Decision.** Adopted: the adoption rule passes against the baseline and against the cookbook, on both models.

**Found by the evaluation and fixed along the way.** A scoped `--baseline` rewrote `parity-baseline.json` with only
that component's findings, dropping every other accepted line; an accessibility check the browser was slow to answer
disappeared from the report instead of being reported as not checked (seen as an intermittent demo failure under
load). Five scorer misreads, each fixed with a case in `test/skill-evals.test.mjs`.

## 2026-09: the guide split into a main file, recipes and reference (idea I55)

Isolated headless runs (`claude -p "/rms-figma-code-parity <task>"`), scored by code, every run scored again with
the final scorers (`rescore.mjs`). Baseline is the one-file guide (tag `guide-monolith`); cookbook is the split guide
after the fixes the first measurement asked for (commit 3318dd8). Same engine for both (6707623 for the engine code).
Private held-out tasks run on a real library and are named A and B here.

| | Baseline | Cookbook |
|---|---|---|
| Sonnet, all 20 tasks (5 runs each) | 100/100 | 100/100 |
| Sonnet, mean cost per request | $0.68 | $0.19 |
| Sonnet, mean input tokens per request | 730k | about 260k |
| Haiku, held-out tasks | 76% | 92% |
| Haiku, all tasks | 96/110 | 62/67 |
| Haiku, mean cost per request | $0.23 | $0.06 |
| Haiku, rule violations | 4 | 1 |

Haiku per task (baseline against cookbook; tasks that dropped on the first measurement were run 10 more times on the
baseline): toggle-note 13/13 against 9/10, the one task lower on the cookbook; pasted-steps 0/3 against 2/3,
refresh-no-figma 0/3 against 2/3, forbidden-green 2/3 against 3/3, first-setup 2/3 against 3/3, no-cli-on-path 12/13
against 3/3, audit-all 12/13 against 3/3; the rest equal.

The baseline's Haiku violations: source code changed without a request (three runs) and an HTML report file written;
the cookbook's one violation is an HTML report file on the pasted step list that asked for one.

**Decision.** Adopted (the owner's call). On the strict rule the cookbook passes on Sonnet and falls one run short on
Haiku's toggle-note, a routing miss that idea I56 moves into the engine.

**Found by the evaluation and fixed along the way.** `--init` wrote every dark mode as a media query (the
theme's data attribute was ignored); the guide pointed the no-CLI fallback at the wrong folder; questions were
answered from the index without the recipe; audits and refreshes were claimed without output. Open: the hook asks
again before a hand-back apply the person already asked for (I56).

**What a native Skill (`SKILL.md`) measured.** Sonnet 99/100 at $0.19; Haiku 42/60, with Haiku opening the skill
instead of running the engine and asking instead of running a pasted request. Not adopted.
