# Contributing

## Report a problem or ask for something

Open an issue on GitHub. Say what you ran, what you expected and what happened instead, with the run's output. A security problem goes through the Security tab instead, never an issue ([SECURITY.md](SECURITY.md)).

## Send a change

1. Fork the repository and branch from `main`.
2. Make the change, with its tests (below).
3. Run the full suite with Chrome on your PATH (or `CHROME_PATH` set), and the docs check:

   ```bash
   for d in .ci-tools .vue-tools .vue-cli-tools .nuxt-tools; do npm ci --prefix test/$d; done
   node --test test/*.test.mjs
   node sync-docs.mjs --check
   ```

4. Open a pull request against `main` with one release label: `release: patch` (a fix, docs or internal work), `release: minor` (a new capability) or `release: major` (something that works differently for people already using the engine).

## What a change needs

- **A test for new behaviour,** one that fails without the change. A new check is tested with a mistake planted on purpose, so it is known to catch what it claims.
- **A test for a fixed bug,** one that reproduces it.
- **Every test passing,** none skipped for want of Chrome or the test tools.
- **No new npm dependency.** The engine has none, and that is part of what it promises.
- **Nothing private.** No client, product, person, host or token name, in code, tests, examples or messages. Examples use invented names (Acme, cardTile). The required Privacy check refuses anything else.
- **Docs that match.** A change people can see updates the README, `docs/` or the guide files in the same pull request. A change to the guide files (`rms-design-system-engine.md`, `cookbook/`, `reference/`) also needs a fresh skill evaluation, recorded in `test/skill-evals/RESULTS.md`.

A pull request merges when the privacy check, the test suite and CodeQL pass.
