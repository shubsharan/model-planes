#!/usr/bin/env bash

set -euo pipefail

JSON=false
DRY_RUN=false
ALLOW_EXISTING=false
SHORT_NAME=""
ARGS=()

while (($#)); do
    case "$1" in
        --json) JSON=true ;;
        --dry-run) DRY_RUN=true ;;
        --allow-existing-branch) ALLOW_EXISTING=true ;;
        --short-name) shift; SHORT_NAME="${1:?--short-name requires a value}" ;;
        --help|-h)
            echo "Usage: $0 [--json] [--dry-run] [--allow-existing-branch] [--short-name name] <description>"
            exit 0
            ;;
        --number|--timestamp)
            echo "Error: feature numbers are allocated automatically from docs/features" >&2
            exit 2
            ;;
        *) ARGS+=("$1") ;;
    esac
    shift
done

DESCRIPTION="${ARGS[*]}"
[[ -n "$DESCRIPTION" ]] || { echo "Error: feature description is required" >&2; exit 2; }

SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
# shellcheck source=../../../../scripts/bash/common.sh
source "$REPO_ROOT/.specify/scripts/bash/common.sh"

slugify() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g'
}

if [[ -n "${GIT_BRANCH_NAME:-}" ]]; then
    BRANCH_NAME="$GIT_BRANCH_NAME"
else
    slug=$(slugify "${SHORT_NAME:-$DESCRIPTION}")
    feature_name=$(resolve_feature_name_for_slug "$REPO_ROOT" "$slug") || exit 1
    BRANCH_NAME="feature/$feature_name"
fi
check_feature_branch "$BRANCH_NAME" true
FEATURE_NAME="${BRANCH_NAME#feature/}"

if [[ "$DRY_RUN" == false ]] && has_git; then
    current=$(git -C "$REPO_ROOT" branch --show-current)
    if [[ "$current" != "$BRANCH_NAME" ]]; then
        if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
            [[ "$ALLOW_EXISTING" == true ]] || { echo "Error: branch $BRANCH_NAME already exists" >&2; exit 1; }
            git -C "$REPO_ROOT" switch "$BRANCH_NAME" >/dev/null
        else
            git -C "$REPO_ROOT" switch -c "$BRANCH_NAME" >/dev/null
        fi
    fi
fi

if [[ "$JSON" == true ]]; then
    printf '{"BRANCH_NAME":"%s","FEATURE_NAME":"%s","DRY_RUN":%s}\n' "$(json_escape "$BRANCH_NAME")" "$(json_escape "$FEATURE_NAME")" "$DRY_RUN"
else
    printf 'BRANCH_NAME: %s\nFEATURE_NAME: %s\n' "$BRANCH_NAME" "$FEATURE_NAME"
fi
