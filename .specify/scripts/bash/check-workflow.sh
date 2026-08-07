#!/usr/bin/env bash

set -euo pipefail
SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
REPO_ROOT=$(get_repo_root)
FEATURES_DIR=$(get_features_dir "$REPO_ROOT")
EPICS_DIR=$(get_epics_dir "$REPO_ROOT")
ADR_DIR=$(get_adr_dir "$REPO_ROOT")
ERRORS=0

fail() { echo "ERROR: $*" >&2; ERRORS=$((ERRORS + 1)); }
status_of() { awk 'NR==1 && $0=="---"{fm=1; next} fm && $0=="---"{exit} fm && /^status:[[:space:]]*/{sub(/^status:[[:space:]]*/, ""); print; exit}' "$1"; }

check_frontmatter() {
    local file="$1" allowed="$2" status keys
    keys=$(awk 'NR==1 && $0=="---"{fm=1; next} fm && $0=="---"{exit} fm && /^[A-Za-z0-9_-]+:/{count++} END{print count+0}' "$file")
    [[ "$keys" == 1 ]] || fail "${file#$REPO_ROOT/} frontmatter must contain only status"
    status=$(status_of "$file")
    case " $allowed " in *" $status "*) ;; *) fail "${file#$REPO_ROOT/} has invalid status '$status'" ;; esac
}

adr_refs() {
    grep -oE '\.\./\.\./adrs/[0-9]{4}-[a-z0-9-]+\.md' "$1" 2>/dev/null | sed 's|../../adrs/||' | sort -u || true
}

adr_relation_refs() {
    local file="$1" label="$2"
    awk -v prefix="**${label}**: " '
        index($0, prefix) == 1 {
            line = substr($0, length(prefix) + 1)
            while (match(line, /\([^()]+\.md\)/)) {
                print substr(line, RSTART + 1, RLENGTH - 2)
                line = substr(line, RSTART + RLENGTH)
            }
        }
    ' "$file"
}

verify_done_pr() {
    local spec="$1" pr_line url linked_url
    pr_line=$(grep -E '^(- )?\*\*PR\*\*: \[https://github\.com/.+/pull/[0-9]+\]\(https://github\.com/.+/pull/[0-9]+\)$' "$spec" | head -1 || true)
    [[ -n "$pr_line" ]] || { fail "${spec#$REPO_ROOT/} is Done without a merged PR link"; return; }
    url=$(printf '%s\n' "$pr_line" | sed -E -n 's/^(- )?\*\*PR\*\*: \[([^]]*)\]\(([^)]*)\)$/\2/p')
    linked_url=$(printf '%s\n' "$pr_line" | sed -E -n 's/^(- )?\*\*PR\*\*: \[([^]]*)\]\(([^)]*)\)$/\3/p')
    [[ "$url" == "$linked_url" ]] || { fail "${spec#$REPO_ROOT/} PR label and link must match"; return; }
}

while IFS= read -r epic; do
    check_frontmatter "$epic" 'Pending Active Done'
    [[ "$(basename "$(dirname "$epic")")" =~ ^[0-9]{4}-[a-z0-9][a-z0-9-]*$ ]] || fail "invalid epic path: ${epic#$REPO_ROOT/}"
done < <(find "$EPICS_DIR" -mindepth 2 -maxdepth 2 -name epic.md -type f 2>/dev/null | sort)

while IFS= read -r adr; do
    check_frontmatter "$adr" 'Proposed Accepted Superseded'
    [[ "$(basename "$adr")" =~ ^[0-9]{4}-[a-z0-9][a-z0-9-]*\.md$ ]] || fail "invalid ADR path: ${adr#$REPO_ROOT/}"

    supersedes=$(adr_relation_refs "$adr" Supersedes)
    superseded_by=$(adr_relation_refs "$adr" 'Superseded by')
    if [[ "$(status_of "$adr")" == Superseded && -z "$superseded_by" ]]; then
        fail "${adr#$REPO_ROOT/} is Superseded but has no replacement link"
    fi
    while IFS= read -r superseded_ref; do
        [[ -n "$superseded_ref" ]] || continue
        old="$(dirname "$adr")/$superseded_ref"
        if [[ ! -f "$old" ]]; then
            fail "${adr#$REPO_ROOT/} supersedes missing ADR $superseded_ref"
        else
            old_replacements=$(adr_relation_refs "$old" 'Superseded by')
            if [[ "$(status_of "$old")" != Superseded ]] || \
                ! printf '%s\n' "$old_replacements" | grep -Fxq "$(basename "$adr")"; then
                fail "${adr#$REPO_ROOT/} and $superseded_ref must record both sides of the supersession"
            fi
        fi
    done <<< "$supersedes"
    while IFS= read -r replacement_ref; do
        [[ -n "$replacement_ref" ]] || continue
        replacement="$(dirname "$adr")/$replacement_ref"
        if [[ ! -f "$replacement" ]]; then
            fail "${adr#$REPO_ROOT/} references missing replacement ADR $replacement_ref"
        else
            replacement_old=$(adr_relation_refs "$replacement" Supersedes)
            if [[ "$(status_of "$replacement")" != Accepted ]] || \
                ! printf '%s\n' "$replacement_old" | grep -Fxq "$(basename "$adr")"; then
                fail "${adr#$REPO_ROOT/} replacement must be Accepted and link back"
            fi
        fi
    done <<< "$superseded_by"
done < <(find "$ADR_DIR" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]-*.md' -type f 2>/dev/null | sort)

while IFS= read -r spec; do
    check_frontmatter "$spec" 'Pending Active Done'
    feature_dir=$(basename "$(dirname "$spec")")
    [[ "$feature_dir" =~ ^[0-9]{4}-([a-z0-9][a-z0-9-]*)$ ]] || { fail "invalid feature path: ${spec#$REPO_ROOT/}"; continue; }
    slug="$feature_dir"
    branch=$(sed -E -n 's/^(- )?\*\*Branch\*\*: `([^`]*)`$/\2/p' "$spec" | head -1)
    [[ "$branch" == "feature/$slug" ]] || fail "${spec#$REPO_ROOT/} must reference branch feature/$slug"

    epic_line=$(grep -E '^(- )?\*\*Epic\*\*:' "$spec" | head -1 | sed 's/^- //' || true)
    if [[ "$epic_line" != '**Epic**: None' ]]; then
        epic_dir=$(printf '%s\n' "$epic_line" | sed -n 's|^\*\*Epic\*\*: \[[^]]*\](../../epics/\([^/]*\)/epic.md)$|\1|p')
        [[ -n "$epic_dir" && -f "$EPICS_DIR/$epic_dir/epic.md" ]] || fail "${spec#$REPO_ROOT/} must reference an existing parent epic or None"
    fi

    state=$(status_of "$spec")
    if [[ "$state" == Done ]]; then
        verify_done_pr "$spec"
    fi

    plan="$(dirname "$spec")/plan.md"
    spec_refs=$(adr_refs "$spec")
    if [[ -f "$plan" ]]; then
        plan_refs=$(adr_refs "$plan")
        [[ "$spec_refs" == "$plan_refs" ]] || fail "${spec#$REPO_ROOT/} and plan.md must reference the same ADRs"
        impact=$(sed -n 's/^\*\*Impact\*\*:[[:space:]]*//p' "$plan" | head -1)
        [[ "$impact" == None || "$impact" == Feature || "$impact" == Project ]] || fail "${plan#$REPO_ROOT/} Impact must be None, Feature, or Project"
        if [[ "$impact" == Project && -z "$plan_refs" ]]; then
            fail "${plan#$REPO_ROOT/} declares Project impact without an ADR"
        fi
    fi

    while IFS= read -r ref; do
        [[ -n "$ref" ]] || continue
        adr="$ADR_DIR/$ref"
        [[ -f "$adr" ]] || { fail "${spec#$REPO_ROOT/} references missing ADR $ref"; continue; }
        adr_status=$(status_of "$adr")
        case "$state" in
            Pending)
                [[ "$adr_status" != Superseded ]] || fail "${spec#$REPO_ROOT/} Pending feature references superseded ADR $ref"
                ;;
            Active)
                [[ "$adr_status" == Accepted ]] || fail "${spec#$REPO_ROOT/} Active feature requires Accepted ADR $ref (currently $adr_status)"
                ;;
            Done)
                [[ "$adr_status" != Proposed ]] || fail "${spec#$REPO_ROOT/} Done feature references Proposed ADR $ref"
                ;;
        esac
    done <<< "$spec_refs"
done < <(find "$FEATURES_DIR" -mindepth 2 -maxdepth 2 -name spec.md -type f 2>/dev/null | sort)

if ! "$SCRIPT_DIR/sync-docs.sh" --check; then
    ERRORS=$((ERRORS + 1))
fi

if ((ERRORS)); then
    echo "$ERRORS Spec Kit workflow error(s) found." >&2
    exit 1
fi
echo 'Spec Kit workflow is valid.'
