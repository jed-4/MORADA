#!/usr/bin/env bash
# Snapshot tracked modifications before a destructive git command.
#
# Written 2026-08-22, after a `git stash pop -q` failed silently and left a
# session's work stashed, and a second session's uncommitted edits were found
# sitting in another session's worktree. This never blocks anything; it just
# makes those moments recoverable. Snapshots land in ~/.claude/morada-rescue
# rather than inside the repo, so no worktree gets polluted and no .gitignore
# entry is needed.
#
# Limitation: `git diff HEAD` covers tracked files only. Untracked files are
# listed in the .status sidecar but their contents are not captured.
set -u

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // ""' 2>/dev/null) || exit 0

# Deliberately loose: "git" followed by a destructive verb anywhere after it.
# Modelling `-C <path>` here failed on paths containing spaces, and this is a
# safety net -- an occasional harmless extra snapshot beats a missed one.
printf '%s' "$cmd" | grep -qE 'git[[:space:]].*(stash|checkout|switch|restore|reset|clean)' || exit 0

# Which repo does this command actually target? An explicit -C wins, then a
# leading cd, then the hook's own cwd.
target=""
t=$(printf '%s' "$cmd" | sed -nE 's/.*git[[:space:]]+-C[[:space:]]+"([^"]+)".*/\1/p' | head -1)
[ -z "$t" ] && t=$(printf '%s' "$cmd" | sed -nE 's/.*git[[:space:]]+-C[[:space:]]+([^"[:space:];]+).*/\1/p' | head -1)
[ -n "$t" ] && [ -d "$t" ] && target="$t"
if [ -z "$target" ]; then
  t=$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+"([^"]+)".*/\1/p' | head -1)
  [ -z "$t" ] && t=$(printf '%s' "$cmd" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^;&|[:space:]]+).*/\1/p' | head -1)
  [ -n "$t" ] && [ -d "$t" ] && target="$t"
fi
[ -z "$target" ] && target="$PWD"

root=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -n "$root" ] || exit 0

# Nothing modified means nothing to lose.
git -C "$root" diff --quiet HEAD 2>/dev/null && exit 0

name=$(basename "$root")
dir="$HOME/.claude/morada-rescue/$name"
mkdir -p "$dir" 2>/dev/null || exit 0
stamp="$(date +%Y%m%d-%H%M%S)-$$"   # pid suffix so two snapshots in one second cannot collide
git -C "$root" diff HEAD > "$dir/$stamp.patch" 2>/dev/null
git -C "$root" status --porcelain > "$dir/$stamp.status" 2>/dev/null

n=$(git -C "$root" diff --name-only HEAD 2>/dev/null | wc -l | tr -d ' ')
printf '{"systemMessage":"Snapshotted %s changed file(s) from %s to ~/.claude/morada-rescue/%s/%s.patch"}\n' \
  "$n" "$name" "$name" "$stamp"
exit 0
