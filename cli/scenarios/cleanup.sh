#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$CLI_DIR/.tmp"

REMOVE_BINARIES=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: bash cli/scenarios/cleanup.sh [--binaries] [--dry-run]

Removes local scenario experiment artifacts from cli/.tmp so manual LLM runs are
easy to repeat and compare.

Default behavior:
- removes .json and .log files under cli/.tmp
- preserves cached local binaries such as cli/.tmp/oar

Options:
  --binaries  Also remove cli/.tmp/oar and cli/.tmp/oar-scenario
  --dry-run   Print files that would be removed without deleting them
  --help      Show this help text
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --binaries)
      REMOVE_BINARIES=1
      ;;
    --dry-run)
      DRY_RUN=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ ! -d "$TMP_DIR" ]]; then
  echo "nothing to clean: $TMP_DIR does not exist"
  exit 0
fi

files=()
while IFS= read -r -d '' path; do
  files+=("$path")
done < <(find "$TMP_DIR" -maxdepth 1 -type f \( -name '*.json' -o -name '*.log' \) -print0 | sort -z)

if [[ "$REMOVE_BINARIES" -eq 1 ]]; then
  for binary in "$TMP_DIR/oar" "$TMP_DIR/oar-scenario"; do
    if [[ -f "$binary" ]]; then
      files+=("$binary")
    fi
  done
fi

if [[ "${#files[@]}" -eq 0 ]]; then
  echo "nothing to clean in $TMP_DIR"
  exit 0
fi

for path in "${files[@]}"; do
  if [[ "$DRY_RUN" -eq 1 ]]; then
    echo "would remove $path"
  else
    rm -f "$path"
    echo "removed $path"
  fi
done
