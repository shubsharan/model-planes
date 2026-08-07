#!/usr/bin/env bash

set -euo pipefail
CHECK=false
[[ "${1:-}" == "--check" ]] && CHECK=true

SCRIPT_DIR="$(CDPATH="" cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./common.sh
source "$SCRIPT_DIR/common.sh"
REPO_ROOT=$(get_repo_root)
FEATURES_DIR=$(get_features_dir "$REPO_ROOT")
EPICS_DIR=$(get_epics_dir "$REPO_ROOT")
ADR_DIR=$(get_adr_dir "$REPO_ROOT")
ROADMAP="$REPO_ROOT/docs/roadmap.md"
ADR_INDEX="$ADR_DIR/README.md"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
DRIFT=0

status_of() { awk 'NR==1 && $0=="---"{fm=1; next} fm && $0=="---"{exit} fm && /^status:[[:space:]]*/{sub(/^status:[[:space:]]*/, ""); print; exit}' "$1"; }
title_of() { awk '/^# (Epic|Feature Specification|Feature|ADR):[[:space:]]*/ { sub(/^# (Epic|Feature Specification|Feature|ADR):[[:space:]]*/, ""); print; exit }' "$1"; }

set_status() {
    local file="$1" status="$2" tmp="$WORK/status"
    awk -v value="$status" 'BEGIN{fm=0} NR==1 && $0=="---"{fm=1} fm && /^status:[[:space:]]*/{$0="status: " value} {print} fm && NR>1 && $0=="---"{fm=0}' "$file" > "$tmp"
    mv "$tmp" "$file"
}

feature_epic_dir() {
    sed -E -n 's|^(- )?\*\*Epic\*\*: \[[^]]*\]\(../../epics/([^/]*)/epic.md\)$|\2|p' "$1" | head -1
}

expected_epic_status() {
    local epic_name="$1" count=0 active=0 done=0 file state
    while IFS= read -r file; do
        [[ "$(feature_epic_dir "$file")" == "$epic_name" ]] || continue
        count=$((count + 1))
        state=$(status_of "$file")
        [[ "$state" == Active ]] && active=$((active + 1))
        [[ "$state" == Done ]] && done=$((done + 1))
    done < <(find "$FEATURES_DIR" -mindepth 2 -maxdepth 2 -name spec.md -type f 2>/dev/null | sort)
    if ((count > 0 && done == count)); then echo Done
    elif ((active > 0 || done > 0)); then echo Active
    else echo Pending
    fi
}

validate_block() {
    local file="$1" key="$2" start_marker end_marker start_count end_count start_line end_line
    [[ -f "$file" ]] || { echo "Missing generated document: ${file#$REPO_ROOT/}" >&2; DRIFT=1; return 1; }
    start_marker="speckit:generated:$key START"
    end_marker="speckit:generated:$key END"
    start_count=$(grep -Fc "$start_marker" "$file" || true)
    end_count=$(grep -Fc "$end_marker" "$file" || true)
    if [[ "$start_count" != 1 || "$end_count" != 1 ]]; then
        echo "Malformed generated markers '$key' in ${file#$REPO_ROOT/}" >&2
        DRIFT=1
        return 1
    fi
    start_line=$(grep -nF "$start_marker" "$file" | cut -d: -f1)
    end_line=$(grep -nF "$end_marker" "$file" | cut -d: -f1)
    if ((start_line >= end_line)); then
        echo "Malformed generated marker order '$key' in ${file#$REPO_ROOT/}" >&2
        DRIFT=1
        return 1
    fi
}

replace_block() {
    local file="$1" key="$2" content="$3" tmp="$WORK/replace"
    validate_block "$file" "$key" || return
    awk -v key="$key" -v content="$content" '
        function emit( line) { while ((getline line < content) > 0) print line; close(content) }
        index($0, "speckit:generated:" key " START") { print; emit(); inside=1; next }
        inside && index($0, "speckit:generated:" key " END") { print; inside=0; next }
        !inside { print }
    ' "$file" > "$tmp"
    if ! cmp -s "$file" "$tmp"; then
        if [[ "$CHECK" == true ]]; then
            echo "DRIFT: ${file#$REPO_ROOT/} [$key]"
            DRIFT=1
        else
            mv "$tmp" "$file"
        fi
    fi
}

if [[ "$CHECK" == false ]]; then
    mkdir -p "$EPICS_DIR" "$FEATURES_DIR" "$ADR_DIR"
fi

while IFS= read -r epic_file; do
    validate_block "$epic_file" epic-features || continue
    epic_dir=$(basename "$(dirname "$epic_file")")
    expected=$(expected_epic_status "$epic_dir")
    actual=$(status_of "$epic_file")
    if [[ "$actual" != "$expected" ]]; then
        if [[ "$CHECK" == true ]]; then
            echo "DRIFT: ${epic_file#$REPO_ROOT/} status is $actual, expected $expected"
            DRIFT=1
        else
            set_status "$epic_file" "$expected"
        fi
    fi

    table="$WORK/epic-features"
    echo > "$table"
    while IFS= read -r feature_file; do
        [[ "$(feature_epic_dir "$feature_file")" == "$epic_dir" ]] || continue
        rel="../../features/$(basename "$(dirname "$feature_file")")/spec.md"
        printf -- '- [%s](%s) — %s\n' "$(title_of "$feature_file")" "$rel" "$(status_of "$feature_file")" >> "$table"
    done < <(find "$FEATURES_DIR" -mindepth 2 -maxdepth 2 -name spec.md -type f 2>/dev/null | sort)
    [[ $(wc -l < "$table") -gt 1 ]] || echo '_No features yet._' >> "$table"
    echo >> "$table"
    replace_block "$epic_file" epic-features "$table"
done < <(find "$EPICS_DIR" -mindepth 2 -maxdepth 2 -name epic.md -type f 2>/dev/null | sort)

epic_table="$WORK/roadmap-epics"
{
    echo
    any=false
    while IFS= read -r epic_file; do
        any=true
        dir=$(basename "$(dirname "$epic_file")")
        printf -- '- [%s](epics/%s/epic.md) — %s\n' "$(title_of "$epic_file")" "$dir" "$(expected_epic_status "$dir")"
    done < <(find "$EPICS_DIR" -mindepth 2 -maxdepth 2 -name epic.md -type f 2>/dev/null | sort)
    [[ "$any" == true ]] || echo '_No epics yet._'
    echo
} > "$epic_table"
replace_block "$ROADMAP" roadmap-epics "$epic_table"

adr_table="$WORK/adr-index"
{
    echo
    any=false
    while IFS= read -r adr; do
        any=true
        printf -- '- [%s](%s) — %s\n' "$(title_of "$adr")" "$(basename "$adr")" "$(status_of "$adr")"
    done < <(find "$ADR_DIR" -maxdepth 1 -name '[0-9][0-9][0-9][0-9]-*.md' -type f 2>/dev/null | sort)
    [[ "$any" == true ]] || echo '_No ADRs yet._'
    echo
} > "$adr_table"
replace_block "$ADR_INDEX" adr-index "$adr_table"

if ((DRIFT)); then
    exit 1
fi
[[ "$CHECK" == true ]] && echo 'Spec Kit documentation is in sync.'
exit 0
