#!/bin/sh
# Install the uploader and portable agent skill; credentials are configured separately.
set -eu
base=https://raw.githubusercontent.com/nirpechuk/nirpechuk.github.io/main/bin/research
command -v node >/dev/null 2>&1 || { echo 'Node.js 20+ is required.' >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 20) process.exit(1)' || { echo 'Node.js 20+ is required.' >&2; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
curl -fsSL "$base/research-publish/scripts/upload.mjs" -o "$tmp/upload.mjs"
curl -fsSL "$base/research-publish/SKILL.md" -o "$tmp/SKILL.md"
node "$tmp/upload.mjs" --help >/dev/null
mkdir -p "$HOME/.local/share/nir-research" "$HOME/.local/bin" "$HOME/.config/nir-research"
install -m 644 "$tmp/upload.mjs" "$HOME/.local/share/nir-research/upload.mjs"
cat > "$tmp/nir-research" <<'WRAPPER'
#!/bin/sh
exec node "$HOME/.local/share/nir-research/upload.mjs" "$@"
WRAPPER
install -m 755 "$tmp/nir-research" "$HOME/.local/bin/nir-research"
for skills in "${CODEX_HOME:-$HOME/.codex}/skills" "$HOME/.claude/skills"; do
  mkdir -p "$skills/research-publish/scripts"
  install -m 644 "$tmp/SKILL.md" "$skills/research-publish/SKILL.md"
  install -m 644 "$tmp/upload.mjs" "$skills/research-publish/scripts/upload.mjs"
done
printf '%s\n' 'Installed nir-research and the research-publish skill for Codex and Claude.' \
  'Add ~/.local/bin to PATH if needed.' \
  'Configure GitHub auth (GH_TOKEN or gh auth login) and the research password' \
  '(RESEARCH_PASSWORD or ~/.config/nir-research/password, mode 600).'
