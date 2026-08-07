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
        --help|-h) echo "Usage: $0 [--json] [--dry-run] [--short-name name] [--number N] <decision>"; exit 0 ;;
        *) ARGS+=("$1") ;;
    esac
    shift
done

DECISION="${ARGS[*]}"
[[ -n "$DECISION" ]] || { echo "Error: ADR decision is required" >&2; exit 2; }

SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

slugify() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g'; }
SLUG=$(slugify "${SHORT_NAME:-$DECISION}")
[[ -n "$SLUG" ]] || { echo "Error: invalid ADR slug" >&2; exit 2; }

REPO_ROOT=$(get_repo_root)
ADR_DIR=$(get_adr_dir "$REPO_ROOT")
highest=0
if [[ -d "$ADR_DIR" ]]; then
    for file in "$ADR_DIR"/[0-9][0-9][0-9][0-9]-*.md; do
        [[ -f "$file" ]] || continue
        value="$(basename "$file")"; value="${value%%-*}"; value=$((10#$value))
        ((value > highest)) && highest=$value
    done
fi
[[ -n "$NUMBER" ]] || NUMBER=$((highest + 1))
[[ "$NUMBER" =~ ^[0-9]+$ ]] || { echo "Error: --number must be numeric" >&2; exit 2; }
ADR_NUM=$(printf '%04d' "$((10#$NUMBER))")
ADR_FILE="$ADR_DIR/$ADR_NUM-$SLUG.md"

if [[ "$DRY_RUN" == false ]]; then
    mkdir -p "$ADR_DIR"
    [[ ! -e "$ADR_FILE" ]] || { echo "Error: ADR already exists: $ADR_FILE" >&2; exit 1; }
    template=$(resolve_template adr-template "$REPO_ROOT") || template=""
    [[ -n "$template" ]] || { echo "Error: ADR template not found" >&2; exit 1; }
    cp "$template" "$ADR_FILE"
fi

if [[ "$JSON" == true ]]; then
    printf '{"ADR_FILE":"%s","ADR_NUM":"%s","DRY_RUN":%s}\n' "$(json_escape "$ADR_FILE")" "$ADR_NUM" "$DRY_RUN"
else
    printf 'ADR_FILE: %s\nADR_NUM: %s\n' "$ADR_FILE" "$ADR_NUM"
fi
