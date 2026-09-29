# Working on this repository

- Update the documentation before every push: `README.md`, and any other doc the change touches, so what is pushed always matches what the skill does.
- The guide set the agent reads (`rms-figma-code-parity.md`, `cookbook/*.md`, `reference/*.md`) is measured by the skill evaluation. A change to any of those files needs a fresh evaluation run and its results in `test/skill-evals/RESULTS.md` (`reference/maintainers.md`, Skill evaluation); `test/skill-evals.test.mjs` fails until then. `README.md` is outside that set.
- Run `node --test test/*.test.mjs` and `node sync-docs.mjs --check` before pushing.
