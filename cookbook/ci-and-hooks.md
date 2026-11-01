# CI, webhooks and hooks

**Use when.** the person asks about CI, Figma webhooks, git hooks, or the project's Claude Code hooks.

## Steps

1. The project's Claude Code hooks: `--install-hooks`, `--remove-hooks`, or `"hooks": false` (the main guide's rule). They also route each `/rms-design-system-engine` request before the agent reads it, check each UI edit when it is made (`"editCheck": false` turns that part off), let a Figma write through only as the engine's own `--figma-edits` script once the person said yes, and, when the route gave a line the person has to hear (the Figma snapshots were not refreshed, the skill does not change Figma), send the agent back once if its final reply leaves it out.
2. CI and webhooks: the sections below.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference config`: *More settings*

```recipe-check
rms-design-system-engine --doctor
```

---


## Webhook Automation

Once deployed, the webhook server auto-triggers parity checks on every DS change without manual invocation:

```bash
# Start the server (keep running)
node ~/.claude/skills/rms-design-system-engine/webhook-server.mjs

# Register with Figma once (public URL required)
FIGMA_TOKEN=xxx node ~/.claude/skills/rms-design-system-engine/setup-webhook.mjs --url https://your-host.com/webhook

# Manage webhooks
node ~/.claude/skills/rms-design-system-engine/setup-webhook.mjs --list
node ~/.claude/skills/rms-design-system-engine/setup-webhook.mjs --delete <id>
```

Configure `webhook.port` and `webhook.secret` in `ds-config.json`.

---


## CI Setup

**A pipeline no webhook can start.** When the pipeline lives in a repository of its own (the style guide's, the team's)
and the code repository may only be read (no webhook, no job there), run it on a schedule (every hour) and start it
with `rms-design-system-engine --ci-changed`: it asks each source for its latest commit (the code, each store read from
GitLab, the intent layer, the profile), Figma for its file's version (with `FIGMA_TOKEN`) and the engine for its own,
and exits 3 when none moved since the last build, so the job stops in seconds; 0 names what moved. After a build that
succeeded, `--ci-changed --record` keeps what it was made from in `.design-system-engine-out/ci-last-build.json` (keep that
file in the pipeline's cache). A source that cannot be read counts as moved: a build too many, never a change missed.

**Accessibility never gets worse.** On a merge request or pull request, after the audit, `rms-design-system-engine
--a11y-no-worse` fails (exit 1) on an accessibility blocker the base branch's last build did not have, naming each; exit 0
is no new blocker (or no base kept yet), exit 2 that this run measured nothing. On the base branch, after the audit,
`--a11y-no-worse --record` keeps the base. The GitLab and GitHub jobs that carry it from one to the other are in the
engine's `docs/details.md`, under *Accessibility never gets worse*; the options are in `--reference usage`.


To run the engine on every PR/push via GitHub Actions, add `.github/workflows/design-system-engine.yml` to your project:

```yaml
name: Design system engine
on:
  push:
    branches: [main]
  pull_request:
jobs:
  design-system-engine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - run: pnpm install
      - run: pnpm design-system-engine
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}
          FIGMA_FILE_KEY: ${{ vars.FIGMA_FILE_KEY }}
```

**Prerequisites:**
- `ds-config.json` must be **committed** (it contains no secrets - only paths and the public Figma file key). If it's in `.gitignore`, CI will fail immediately with a clear message.
- `structure-contract.mjs` must be committed (it's safe to commit - no secrets).
- `FIGMA_TOKEN` must be added to GitHub Secrets.
- `FIGMA_FILE_KEY` can optionally be set as a GitHub Variable (used for logging context; `ds-config.json` is the actual source).

With `FIGMA_TOKEN` set, `pnpm design-system-engine` is fully self-contained: it auto-refreshes the snapshots it can via any-plan endpoints. The bound-token and state snapshots come from the Phase 1 Plugin API walk and are committed.
