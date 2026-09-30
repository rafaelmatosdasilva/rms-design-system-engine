# Skill evaluation results

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
