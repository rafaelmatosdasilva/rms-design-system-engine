# Publish the style guide

**Use when.** the person wants the style guide shared with the team: one link everyone opens, rebuilt from what is merged ("publish the style guide", "a link for the team", "put it on GitLab Pages").

## Steps

1. Run `rms-design-system-engine --publish-styleguide`. It writes the CI job for the project's host, as its git remote says: `.github/workflows/style-guide.yml` for GitHub Pages, or a `pages` job for GitLab Pages (in `.gitlab-ci.yml`, or `.gitlab/style-guide.gitlab-ci.yml` to include when the project already has a pipeline). `--host github` or `--host gitlab` chooses when the remote says neither; `--print` shows the job without writing it.
2. The job, on every push to the default branch: checks out the engine and the products beside the system (`products.json`), builds the style guide, runs the audit (a failing audit still publishes; the page shows the differences), builds the page again, checks it against the system (a page that fails is not published) and publishes `public/`.
3. Tell the person what the printed lines say to do once: turn Pages on (GitHub: Settings, Pages, Source: GitHub Actions), and who can open the page. A GitHub Pages site is public even from a private repository (only GitHub Enterprise Cloud keeps it private); GitLab Pages can be kept to project members (Settings, General, Visibility, Pages).
4. A job already there is never overwritten; commit the new one only when the person asks. A local `--styleguide` stays a preview.

Always: relay the SUMMARY block as it is, then follow its `NEXT:` line. Change code, config or snapshots only when the person asks for that change.

## Read more

- `rms-design-system-engine --reference usage`: *The living styleguide*

```recipe-check
rms-design-system-engine --publish-styleguide --print
```
