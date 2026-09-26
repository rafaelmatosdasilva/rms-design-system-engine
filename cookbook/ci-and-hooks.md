# CI, webhooks and hooks

**Use when.** the person asks about CI, Figma webhooks, git hooks, or the project's Claude Code hooks.

## Steps

1. The project's Claude Code hooks: `--install-hooks`, `--remove-hooks`, or `"hooks": false` (the main guide's rule).
2. CI and webhooks: the sections below.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-figma-code-parity --reference config`: *More settings*

```recipe-check
rms-figma-code-parity --doctor
```

---


## Webhook Automation

Once deployed, the webhook server auto-triggers parity checks on every DS change without manual invocation:

```bash
# Start the server (keep running)
node ~/.claude/skills/rms-figma-code-parity/webhook-server.mjs

# Register with Figma once (public URL required)
FIGMA_TOKEN=xxx node ~/.claude/skills/rms-figma-code-parity/setup-webhook.mjs --url https://your-host.com/webhook

# Manage webhooks
node ~/.claude/skills/rms-figma-code-parity/setup-webhook.mjs --list
node ~/.claude/skills/rms-figma-code-parity/setup-webhook.mjs --delete <id>
```

Configure `webhook.port` and `webhook.secret` in `ds-config.json`.

---


## CI Setup

To run parity on every PR/push via GitHub Actions, add `.github/workflows/parity.yml` to your project:

```yaml
name: Parity
on:
  push:
    branches: [main]
  pull_request:
jobs:
  parity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with:
          version: 9
      - run: pnpm install
      - run: pnpm parity
        env:
          FIGMA_TOKEN: ${{ secrets.FIGMA_TOKEN }}
          FIGMA_FILE_KEY: ${{ vars.FIGMA_FILE_KEY }}
```

**Prerequisites:**
- `ds-config.json` must be **committed** (it contains no secrets - only paths and the public Figma file key). If it's in `.gitignore`, CI will fail immediately with a clear message.
- `structure-contract.mjs` must be committed (it's safe to commit - no secrets).
- `FIGMA_TOKEN` must be added to GitHub Secrets.
- `FIGMA_FILE_KEY` can optionally be set as a GitHub Variable (used for logging context; `ds-config.json` is the actual source).

With `FIGMA_TOKEN` set, `pnpm parity` is fully self-contained: it auto-refreshes the snapshots it can via any-plan endpoints. The bound-token and state snapshots come from the Phase 1 Plugin API walk and are committed.
