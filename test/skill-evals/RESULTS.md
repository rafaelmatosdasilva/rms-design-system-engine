# Skill evaluation results

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
