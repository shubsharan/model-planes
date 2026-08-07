#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
REPO_ROOT=$(get_repo_root)
FEATURES_DIR=$(get_features_dir "$REPO_ROOT")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

status_of() { awk 'NR==1 && $0=="---"{fm=1; next} fm && $0=="---"{exit} fm && /^status:[[:space:]]*/{sub(/^status:[[:space:]]*/, ""); print; exit}' "$1"; }

active_specs=()
while IFS= read -r spec; do
    [[ "$(status_of "$spec")" == Active ]] && active_specs+=("$spec")
done < <(find "$FEATURES_DIR" -mindepth 2 -maxdepth 2 -name spec.md -type f 2>/dev/null | sort)
((${#active_specs[@]})) || exit 0
command -v gh >/dev/null 2>&1 || { echo 'Error: gh is required to refresh feature status' >&2; exit 1; }

for spec in "${active_specs[@]}"; do
    branch=$(sed -E -n 's/^(- )?\*\*Branch\*\*: `([^`]*)`$/\2/p' "$spec" | head -1)
    [[ "$branch" =~ ^feature/ ]] || { echo "Error: missing feature branch in ${spec#$REPO_ROOT/}" >&2; exit 1; }
    pr=$(gh pr list --head "$branch" --state all --limit 1 --json url,state --jq '.[0] | [.url, .state] | @tsv') || {
        echo "Error: could not check PR for $branch" >&2
        exit 1
    }
    [[ -n "$pr" ]] || continue
    IFS=$'\t' read -r url state <<< "$pr"
    has_pr_line=false
    grep -Eq '^(- )?\*\*PR\*\*:' "$spec" && has_pr_line=true
    tmp="$WORK/spec"
    awk -v url="$url" -v state="$state" -v has_pr_line="$has_pr_line" '
        NR==1 && $0=="---" { fm=1 }
        fm && /^status:[[:space:]]*/ && state=="MERGED" { $0="status: Done" }
        fm && NR>1 && $0=="---" { fm=0 }
        /^(- )?\*\*Branch\*\*:/ && has_pr_line=="false" {
            print
            print "- **PR**: [" url "](" url ")"
            next
        }
        /^(- )?\*\*PR\*\*:/ { $0="- **PR**: [" url "](" url ")" }
        { print }
    ' "$spec" > "$tmp"
    mv "$tmp" "$spec"
done
