#!/usr/bin/env bash
# Symlink every frappe-* skill in this repo into the agent skill roots that exist.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
shopt -s nullglob
SKILLS=("$REPO"/frappe-*/)
[ "${#SKILLS[@]}" -gt 0 ] || { echo "no skills found in $REPO" >&2; exit 1; }

ROOTS=("$HOME/.claude/skills" "$HOME/.agents/skills" "$HOME/.omp/agent/skills")
roots=0
for root in "${ROOTS[@]}"; do
  [ -d "$root" ] || continue
  roots=$((roots + 1))
  for src in "${SKILLS[@]}"; do
    src="${src%/}"
    name="$(basename "$src")"
    target="$root/$name"
    if [ -e "$target" ] && [ ! -L "$target" ]; then
      echo "refusing to replace real directory: $target" >&2
      exit 1
    fi
    ln -sfn "$src" "$target"
  done
  echo "linked ${#SKILLS[@]} skills into $root"
done

# Drop the pre-split monolith if a previous install left it behind.
for root in "${ROOTS[@]}"; do
  [ -L "$root/frappe-app-dev" ] && rm -f "$root/frappe-app-dev" && echo "removed stale link $root/frappe-app-dev"
done

# omp: /frappe slash command and the frappe-dev agent (all skills preloaded).
if [ -d "$HOME/.omp/agent" ]; then
  for kind in commands agents; do
    mkdir -p "$HOME/.omp/agent/$kind"
    for src in "$REPO/omp/$kind"/*.md; do
      target="$HOME/.omp/agent/$kind/$(basename "$src")"
      if [ -e "$target" ] && [ ! -L "$target" ]; then
        echo "refusing to replace real file: $target" >&2
        exit 1
      fi
      ln -sfn "$src" "$target"
      echo "linked $target"
    done
  done
fi

[ "$roots" -gt 0 ] || { echo "no skill root found (~/.claude/skills)" >&2; exit 1; }
echo "entry point: frappe-router"
