#!/usr/bin/env bash

set -euo pipefail
JSON=false
DRY_RUN=false
SHORT_NAME=""
NUMBER=""
ARGS=()

while (($#)); do
    case "$1" in
        --json) JSON=true ;;
        --dry-run) DRY_RUN=true ;;
        --short-name) shift; SHORT_NAME="${1:?--short-name requires a value}" ;;
        --number) shift; NUMBER="${1:?--number requires a value}" ;;
        --help|-h) echo "Usage: $0 [--json] [--dry-run] [--short-name name] [--number N] <description>"; exit 0 ;;
        *) ARGS+=("$1") ;;
    esac
    shift
done

DESCRIPTION="${ARGS[*]}"
[[ -n "$DESCRIPTION" ]] || { echo "Error: epic description is required" >&2; exit 2; }

SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

slugify() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g'; }
SLUG=$(slugify "${SHORT_NAME:-$DESCRIPTION}")
[[ -n "$SLUG" ]] || { echo "Error: invalid epic slug" >&2; exit 2; }

REPO_ROOT=$(get_repo_root)
EPICS_DIR=$(get_epics_dir "$REPO_ROOT")
highest=0
if [[ -d "$EPICS_DIR" ]]; then
    for dir in "$EPICS_DIR"/[0-9][0-9][0-9][0-9]-*; do
        [[ -d "$dir" ]] || continue
        value="$(basename "$dir")"; value="${value%%-*}"; value=$((10#$value))
        ((value > highest)) && highest=$value
    done
fi
[[ -n "$NUMBER" ]] || NUMBER=$((highest + 1))
[[ "$NUMBER" =~ ^[0-9]+$ ]] || { echo "Error: --number must be numeric" >&2; exit 2; }
EPIC_NUM=$(printf '%04d' "$((10#$NUMBER))")
EPIC_DIR="$EPICS_DIR/$EPIC_NUM-$SLUG"
EPIC_FILE="$EPIC_DIR/epic.md"

if [[ "$DRY_RUN" == false ]]; then
    mkdir -p "$EPIC_DIR"
    [[ ! -e "$EPIC_FILE" ]] || { echo "Error: epic already exists: $EPIC_FILE" >&2; exit 1; }
    template=$(resolve_template epic-template "$REPO_ROOT") || template=""
    [[ -n "$template" ]] || { echo "Error: epic template not found" >&2; exit 1; }
    cp "$template" "$EPIC_FILE"
fi

if [[ "$JSON" == true ]]; then
    printf '{"EPIC_DIR":"%s","EPIC_FILE":"%s","EPIC_NUM":"%s","DRY_RUN":%s}\n' \
        "$(json_escape "$EPIC_DIR")" "$(json_escape "$EPIC_FILE")" "$EPIC_NUM" "$DRY_RUN"
else
    printf 'EPIC_DIR: %s\nEPIC_FILE: %s\nEPIC_NUM: %s\n' "$EPIC_DIR" "$EPIC_FILE" "$EPIC_NUM"
fi
