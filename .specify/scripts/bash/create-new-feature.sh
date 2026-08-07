#!/usr/bin/env bash

set -euo pipefail

JSON=false
DRY_RUN=false
ALLOW_EXISTING=false
SHORT_NAME=""
NUMBER=""
ARGS=()

while (($#)); do
    case "$1" in
        --json) JSON=true ;;
        --dry-run) DRY_RUN=true ;;
        --allow-existing-branch) ALLOW_EXISTING=true ;;
        --short-name) shift; SHORT_NAME="${1:?--short-name requires a value}" ;;
        --number) shift; NUMBER="${1:?--number requires a value}" ;;
        --help|-h)
            echo "Usage: $0 [--json] [--dry-run] [--allow-existing-branch] [--short-name name] [--number N] <description>"
            exit 0
            ;;
        --timestamp)
            echo "Error: timestamp feature identifiers are not supported" >&2
            exit 2
            ;;
        *) ARGS+=("$1") ;;
    esac
    shift
done

DESCRIPTION="${ARGS[*]}"
[[ -n "$DESCRIPTION" ]] || { echo "Error: feature description is required" >&2; exit 2; }

SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"

slugify() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g'
}

current_branch=""
if command -v git >/dev/null 2>&1; then
    current_branch=$(git branch --show-current 2>/dev/null || true)
fi

if [[ -n "${GIT_BRANCH_NAME:-}" ]]; then
    [[ "$GIT_BRANCH_NAME" =~ ^feature/([0-9]{4})-([a-z0-9][a-z0-9-]*)$ ]] || {
        echo "Error: GIT_BRANCH_NAME must match feature/NNNN-<short-name>" >&2
        exit 2
    }
    NUMBER="${BASH_REMATCH[1]}"
    SLUG="${BASH_REMATCH[2]}"
elif [[ "$current_branch" =~ ^feature/([0-9]{4})-([a-z0-9][a-z0-9-]*)$ ]]; then
    NUMBER="${BASH_REMATCH[1]}"
    SLUG="${BASH_REMATCH[2]}"
else
    SLUG=$(slugify "${SHORT_NAME:-$DESCRIPTION}")
fi
[[ -n "$SLUG" && "$SLUG" != *--* && "$SLUG" != *- ]] || { echo "Error: invalid feature slug" >&2; exit 2; }

REPO_ROOT=$(get_repo_root)
FEATURES_DIR=$(get_features_dir "$REPO_ROOT")

if [[ -z "$NUMBER" ]]; then
    FEATURE_NAME=$(resolve_feature_name_for_slug "$REPO_ROOT" "$SLUG") || exit 1
    NUMBER="${FEATURE_NAME%%-*}"
fi
[[ "$NUMBER" =~ ^[0-9]+$ ]] || { echo "Error: --number must be numeric" >&2; exit 2; }
FEATURE_NUM=$(printf '%04d' "$((10#$NUMBER))")
FEATURE_DIR="$FEATURES_DIR/$FEATURE_NUM-$SLUG"
SPEC_FILE="$FEATURE_DIR/spec.md"
BRANCH_NAME="feature/$FEATURE_NUM-$SLUG"

if [[ "$DRY_RUN" == false ]]; then
    mkdir -p "$FEATURE_DIR"
    if [[ ! -f "$SPEC_FILE" ]]; then
        template=$(resolve_template spec-template "$REPO_ROOT") || template=""
        [[ -n "$template" ]] || { echo "Error: spec template not found" >&2; exit 1; }
        cp "$template" "$SPEC_FILE"
    fi
    if has_git; then
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
fi

if [[ "$JSON" == true ]]; then
    printf '{"BRANCH_NAME":"%s","FEATURE_DIR":"%s","SPEC_FILE":"%s","FEATURE_NUM":"%s","DRY_RUN":%s}\n' \
        "$(json_escape "$BRANCH_NAME")" "$(json_escape "$FEATURE_DIR")" "$(json_escape "$SPEC_FILE")" "$FEATURE_NUM" "$DRY_RUN"
else
    printf 'BRANCH_NAME: %s\nFEATURE_DIR: %s\nSPEC_FILE: %s\nFEATURE_NUM: %s\n' "$BRANCH_NAME" "$FEATURE_DIR" "$SPEC_FILE" "$FEATURE_NUM"
fi
