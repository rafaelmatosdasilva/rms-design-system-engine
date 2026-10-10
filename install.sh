#!/usr/bin/env bash
# install.sh - install (or update) the rms-design-system-engine Claude Code skill.
# One canonical clone + a symlinked command + a named terminal command, so updates
# are a `git pull` (or `rms-design-system-engine --update`) with NO re-download. Run:
#   curl -fsSL https://raw.githubusercontent.com/rafaelmatosdasilva/rms-design-system-engine/main/install.sh | bash

set -e

REPO="https://github.com/rafaelmatosdasilva/rms-design-system-engine"
CLONE_DIR="$HOME/.claude/skills/rms-design-system-engine"
COMMANDS_DIR="$HOME/.claude/commands"
BIN_DIR="$HOME/.local/bin"
SKILL_FILE="rms-design-system-engine.md"

command -v git >/dev/null || { echo "❌  git is required."; exit 1; }

# 1. Canonical clone (or fast-forward it if already there) - the single source of truth.
if [ -d "$CLONE_DIR/.git" ]; then
  echo "↻  Updating existing install at $CLONE_DIR"
  git -C "$CLONE_DIR" pull --ff-only
else
  echo "⬇  Installing to $CLONE_DIR"
  mkdir -p "$(dirname "$CLONE_DIR")"
  git clone --depth 1 "$REPO" "$CLONE_DIR"
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

echo ""
echo "✅  Installed. Command: /rms-design-system-engine   ·   Terminal: rms-design-system-engine"
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
