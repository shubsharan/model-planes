#!/usr/bin/env bash

has_git() {
    local repo_root="${1:-$(pwd)}"
    { [[ -d "$repo_root/.git" ]] || [[ -f "$repo_root/.git" ]]; } &&
        command -v git >/dev/null 2>&1 &&
        git -C "$repo_root" rev-parse --is-inside-work-tree >/dev/null 2>&1
}

spec_kit_effective_branch_name() { printf '%s\n' "${1#feature/}"; }

check_feature_branch() {
    local branch="$1" has_git_repo="$2"
    if [[ "$has_git_repo" != true ]]; then
        echo "[specify] Warning: Git repository not detected; skipped branch validation" >&2
        return 0
    fi
    if [[ ! "$branch" =~ ^feature/[0-9]{4}-[a-z0-9][a-z0-9-]*$ ]] || [[ "$branch" == *--* ]] || [[ "$branch" == *- ]]; then
        echo "ERROR: Feature branches must be named feature/NNNN-<short-name>; current branch: $branch" >&2
        return 1
    fi
}
