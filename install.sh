#!/usr/bin/env bash
# install.sh - install (or update) the rms-design-system-engine Claude Code skill.
# One canonical clone + a symlinked command + a named terminal command, so updates
# are a `git pull` (or `rms-design-system-engine --update`) with NO re-download. Run:
#   curl -fsSL https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/main/install.sh | bash
#
# For a company that keeps a profile (where its code, Figma file and each part of the engine's files live), the same
# line with its profile sets everything up for one person: the engine, the company's command, their own token (asked
# here, hidden, kept in a .env only they can read) and a work folder, read from the profile with nothing else asked:
#   curl -fsSL …/install.sh | bash -s -- --client <client> --profile <the profile's link> [--folder <work folder>]

set -e

REPO="${RMS_DSE_REPO:-https://github.com/rafaelmatosdasilva/rms-design-system-engine}"
REF="${RMS_DSE_REF:-}"
CLONE_DIR="$HOME/.claude/skills/rms-design-system-engine"

CLIENT=""; PROFILE=""; FOLDER=""
while [ $# -gt 0 ]; do
  case "$1" in
    --client)  CLIENT="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --folder)  FOLDER="$2"; shift 2 ;;
    *) echo "❌  Unknown option $1 (known: --client, --profile, --folder)"; exit 2 ;;
  esac
done
if [ -n "$CLIENT$PROFILE" ] && { [ -z "$CLIENT" ] || [ -z "$PROFILE" ]; }; then
  echo "❌  A company's setup needs both: --client <client> --profile <the profile's link>"; exit 2
fi
COMMANDS_DIR="$HOME/.claude/commands"
BIN_DIR="$HOME/.local/bin"
SKILL_FILE="rms-design-system-engine.md"

# What the engine needs. git and Node are refused here rather than halfway through a run; Chrome and TypeScript only
# decide how much a run can see, so they are a note at the end (NOTES) with the one line that installs each.
command -v git >/dev/null || { echo "❌  git is required."; exit 1; }
command -v node >/dev/null || { echo "❌  Node.js 22 or newer is required (https://nodejs.org)."; exit 1; }
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌  Node.js 22 or newer is required: this is $(node -v). The engine talks to Chrome over Node's built-in WebSocket, which older versions do not have."
  echo "    Install it from https://nodejs.org, or with nvm: nvm install 22 && nvm use 22"
  exit 1
fi
NOTES=""

# 1. Canonical clone (or fast-forward it if already there) - the single source of truth.
if [ -d "$CLONE_DIR/.git" ]; then
  echo "↻  Updating existing install at $CLONE_DIR"
  git -C "$CLONE_DIR" pull --ff-only
else
  echo "⬇  Installing to $CLONE_DIR"
  mkdir -p "$(dirname "$CLONE_DIR")"
  git clone --depth 1 ${REF:+--branch "$REF"} "$REPO" "$CLONE_DIR"
fi

# 2. Symlink the /rms-design-system-engine command to the clone (NOT a copy) so it tracks updates.
mkdir -p "$COMMANDS_DIR"
ln -sf "$CLONE_DIR/$SKILL_FILE" "$COMMANDS_DIR/$SKILL_FILE"

# 3. A named terminal command so you never type `node …/audit.mjs`: `rms-design-system-engine` runs from
#    wherever you are.
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/rms-design-system-engine" <<LAUNCH
#!/usr/bin/env bash
exec node "$CLONE_DIR/audit.mjs" "\$@"
LAUNCH
chmod +x "$BIN_DIR/rms-design-system-engine"

# 4. The accessibility scanner (axe-core, pinned and checked), fetched now so the first check runs every rule even
#    offline. A failure here is not an install failure: the check fetches it on its first run.
node "$CLONE_DIR/a11y-check.mjs" --fetch-axe || true

# 4b. The two optional ones. Chrome: without it nothing is measured as a browser draws it, so rendered parity, the
#     accessibility check and every picture are skipped. TypeScript: without one the components' JSX and Props are not
#     read. It is asked of the engine's own resolver, so this agrees with what a run will decide — including that
#     version 7 is a rewrite that reads no JSX, and is what `npm i -g typescript` installs today.
CHROME=""
for p in "$CHROME_PATH" "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" "/Applications/Chromium.app/Contents/MacOS/Chromium"; do
  if [ -n "$p" ] && [ -x "$p" ]; then CHROME="$p"; break; fi
done
if [ -z "$CHROME" ]; then
  for n in google-chrome google-chrome-stable chromium-browser chromium; do if command -v "$n" >/dev/null; then CHROME="$n"; break; fi; done
fi
if [ -z "$CHROME" ]; then
  NOTES="$NOTES
⚠️  No Chrome found, so nothing can be measured as a browser draws it: rendered parity, the accessibility check
    and every picture are skipped. Install Google Chrome (https://google.com/chrome), or if you keep it elsewhere:
        export CHROME_PATH=\"/path/to/your/chrome\""
fi

TS=$(CLONE="$CLONE_DIR" node --input-type=module -e '
  import { createRequire } from "node:module";
  import { execFileSync } from "node:child_process";
  import { join } from "node:path";
  const { usableTypeScript } = await import(join(process.env.CLONE, "project-typescript.mjs"));
  let ts = null;
  try { ts = createRequire(join(execFileSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(), "n.js"))("typescript"); } catch { /* none installed */ }
  process.stdout.write(!ts ? "none" : usableTypeScript(ts) ? "ok" : "unusable " + (ts.version || "?"));
' 2>/dev/null) || TS="none"
if [ "$TS" != "ok" ]; then
  if [ "$TS" = "none" ]; then WHY="No TypeScript installed for this machine"; else WHY="The TypeScript installed for this machine ($TS) reads no JSX"; fi
  NOTES="$NOTES
⚠️  $WHY, so the components' JSX and Props are read from their text alone.
    A project that installs its own typescript 5 is already fine. Otherwise:
        npm i -g typescript@5
    (plain \`npm i -g typescript\` installs version 7, the rewrite, which the engine cannot read JSX with.)"
fi

# 5. A company's setup (--client, --profile): its command, this person's tokens and a work folder set up from the
#    profile. One token, asked here, never passed on the command line, kept in the folder's .env (mode 600): it reads
#    every project and writes only where GitLab lets this person.
if [ -n "$CLIENT" ]; then
  SLUG=$(printf '%s' "$CLIENT" | tr '[:upper:]' '[:lower:]' | sed -e 's/[^a-z0-9]\{1,\}/-/g' -e 's/^-//' -e 's/-$//')
  FOLDER="${FOLDER:-$HOME/$SLUG-design-system}"
  FOLDER="${FOLDER/#\~/$HOME}"
  mkdir -p "$FOLDER"
  ENV_FILE="$FOLDER/.env"
  HOST=$(printf '%s' "$PROFILE" | sed -n 's#^https\{0,1\}://\([^/]*\)/.*#\1#p')
  ( umask 077; touch "$ENV_FILE" ); chmod 600 "$ENV_FILE"
  has() { grep -q "^[[:space:]]*$1[[:space:]]*=[[:space:]]*[^[:space:]]" "$ENV_FILE" 2>/dev/null; }
  if [ -n "$HOST" ] && [ "$HOST" != "gitlab.com" ] && ! has GITLAB_HOST; then echo "GITLAB_HOST=$HOST" >> "$ENV_FILE"; fi
  if [ -r /dev/tty ] && { exec 3</dev/tty; } 2>/dev/null; then
    echo ""
    echo "🔑  Your GitLab token: one for every project, kept only in $ENV_FILE."
    echo "    To make it:"
    echo "      1. Open https://${HOST:-gitlab.com}/-/user_settings/personal_access_tokens"
    echo "         (older GitLab: your avatar → Edit profile → Access tokens)"
    echo "      2. Add new token, fine-grained. Name: <your name> · design system engine. Expiration date: as your company allows."
    echo "      3. Projects: the company's design-system projects (its code, intent layer, snapshots, style guide)."
    echo "         Permissions: Project, Repository, Branch and Repository tag: Read; Code: Read and Download;"
    echo "         Commit and Merge request: Read and Create. Nothing else."
    echo "         GitLab lets it change only the projects where your role allows: with Reporter it only reads."
    echo "      4. Create personal access token, then copy it (GitLab shows it once)."
    echo "    Paste it below: nothing shows as you paste."
    if has GITLAB_TOKEN; then echo "    Already there: kept."
    else
      printf "    Token (GITLAB_TOKEN, Enter to add it later): "; read -rs T <&3 || T=""; echo ""
      [ -n "$T" ] && echo "GITLAB_TOKEN=$T" >> "$ENV_FILE"
    fi
    unset T; exec 3<&-
  else
    has GITLAB_TOKEN || echo "ℹ️  No terminal to ask in: make a token at https://${HOST:-gitlab.com}/-/user_settings/personal_access_tokens (fine-grained: Read on the company's design-system projects, Commit and Merge request Create to change them) and add GITLAB_TOKEN=<it> to $ENV_FILE yourself."
  fi
  echo ""
  # The engine's own lines, without the NEXT line it writes for an agent.
  if OUT=$(cd "$FOLDER" && node "$CLONE_DIR/audit.mjs" --make-command "$SLUG" --profile "$PROFILE" 2>&1); then printf '%s\n' "$OUT" | grep -v '^NEXT:' || true
  else printf '%s\n' "$OUT" | grep -v '^NEXT:' || true; echo "❌  The company's command was not written (the line above says why)."; exit 1; fi
  OUT=$(cd "$FOLDER" && node "$CLONE_DIR/audit.mjs" --profile "$PROFILE" --store 2>&1) || true
  printf '%s\n' "$OUT" | grep -v '^NEXT:' || true
  echo ""
  echo "✅  Set up for $CLIENT in $FOLDER"
  echo "    Open that folder in Claude Code and run /rms-design-system-engine-$SLUG"
  echo "    Your token is in $FOLDER/.env: never share or commit it."
  if [ -n "$NOTES" ]; then printf '%s\n' "$NOTES"; fi
  exit 0
fi

echo ""
echo "✅  Installed. Command: /rms-design-system-engine   ·   Terminal: rms-design-system-engine"
if [ -n "$NOTES" ]; then printf '%s\n' "$NOTES"; fi
if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
  echo ""
  echo "⚠️  $BIN_DIR is not on your PATH yet. Add this line to your shell profile"
  echo "    (~/.zshrc or ~/.bashrc), then open a new terminal:"
  echo "        export PATH=\"\$HOME/.local/bin:\$PATH\""
fi
echo ""
echo "──────────────────────────────────────────────────────────"
echo "  Use it inside any project:"
echo ""
echo "    cd my-project"
echo "    rms-design-system-engine --init --project=.     # first-time setup: the code is this folder"
echo "    (or, in Claude Code: /rms-design-system-engine set up this project)"
echo "    rms-design-system-engine --component ButtonPrimary   # audit one component"
echo "    rms-design-system-engine                         # audit the whole DS"
echo ""
echo "  Check / update (never a re-download):"
echo "    rms-design-system-engine --version"
echo "    rms-design-system-engine --update"
echo "──────────────────────────────────────────────────────────"
