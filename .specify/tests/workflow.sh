#!/usr/bin/env bash

set -euo pipefail
SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_ROOT=$(mktemp -d)
trap 'rm -rf "$TEST_ROOT"' EXIT

cp -R "$SOURCE_ROOT/.specify" "$TEST_ROOT/.specify"
mkdir -p "$TEST_ROOT/docs/adrs"
cp "$SOURCE_ROOT/docs/adrs/README.md" "$TEST_ROOT/docs/adrs/README.md"
printf '# Roadmap\n\n<!-- speckit:generated:roadmap-epics START -->\n<!-- speckit:generated:roadmap-epics END -->\n' > "$TEST_ROOT/docs/roadmap.md"

git -C "$TEST_ROOT" init -q -b main
git -C "$TEST_ROOT" config user.email test@example.com
git -C "$TEST_ROOT" config user.name Test
git -C "$TEST_ROOT" add .
git -C "$TEST_ROOT" commit -qm baseline

cd "$TEST_ROOT"
field_from() {
    local key="$1"
    sed -n "s/^$key: //p" | head -1
}

.specify/scripts/bash/create-new-epic.sh --short-name policy 'Policy epic' >/dev/null
epic=docs/epics/0001-policy/epic.md
grep -Fq '## Context' "$epic"
grep -Fq '## Epic Scenarios' "$epic"
grep -Fq -- '- **EDC-001**: [Measurable end-to-end outcome.]' "$epic"
grep -Fq '## Boundaries' "$epic"
grep -Fq '## Planned Features' "$epic"
grep -Fq '   - **Depends on**: None' "$epic"
grep -Fq '   - **Advances**: EDC-001' "$epic"
grep -Fq '## Risks and Open Questions' "$epic"
grep -Fq '_No feature specifications yet._' "$epic"
[[ ! -d docs/features ]]
perl -pi -e 's/# Epic: \[EPIC NAME\]/# Epic: Policy epic/' "$epic"
feature_output=$(.specify/scripts/bash/create-new-feature.sh --short-name budget-policy 'Budget policy')
feature_dir=$(printf '%s\n' "$feature_output" | field_from FEATURE_DIR)
spec="$feature_dir/spec.md"
perl -pi -e 's|feature/\[NNNN-short-name\]|feature/0001-budget-policy|' "$spec"
perl -pi -e 's|\*\*Epic\*\*: None|**Epic**: [Policy](../../epics/0001-policy/epic.md)|' "$spec"
.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null
grep -Fq -- '- [Policy epic](epics/0001-policy/epic.md) — Pending' docs/roadmap.md

git switch main >/dev/null
if .specify/scripts/bash/setup-plan.sh --json >/dev/null 2>&1; then
    echo 'Plan setup unexpectedly accepted main as an active feature' >&2
    exit 1
fi
if .specify/scripts/bash/setup-tasks.sh --json >/dev/null 2>&1; then
    echo 'Task setup unexpectedly accepted main as an active feature' >&2
    exit 1
fi
core_existing=$(.specify/scripts/bash/create-new-feature.sh --dry-run --short-name budget-policy 'Budget policy' | field_from BRANCH_NAME)
extension_existing=$(.specify/extensions/git/scripts/bash/create-new-feature.sh --dry-run --short-name budget-policy 'Budget policy' | field_from BRANCH_NAME)
core_next=$(.specify/scripts/bash/create-new-feature.sh --dry-run --short-name next-feature 'Next feature' | field_from BRANCH_NAME)
extension_next=$(.specify/extensions/git/scripts/bash/create-new-feature.sh --dry-run --short-name next-feature 'Next feature' | field_from BRANCH_NAME)
[[ "$core_existing" == feature/0001-budget-policy ]]
[[ "$extension_existing" == feature/0001-budget-policy ]]
[[ "$core_next" == feature/0002-next-feature ]]
[[ "$extension_next" == feature/0002-next-feature ]]

mkdir docs/features/0007-budget-policy
if .specify/scripts/bash/create-new-feature.sh --dry-run --short-name budget-policy 'Budget policy' >/dev/null 2>&1; then
    echo 'Core creator unexpectedly accepted duplicate feature artifacts' >&2
    exit 1
fi
if .specify/extensions/git/scripts/bash/create-new-feature.sh --dry-run --short-name budget-policy 'Budget policy' >/dev/null 2>&1; then
    echo 'Git extension unexpectedly accepted duplicate feature artifacts' >&2
    exit 1
fi
rmdir docs/features/0007-budget-policy
git switch feature/0001-budget-policy >/dev/null

source .specify/scripts/bash/common.sh
check_feature_branch feature/0001-budget-policy true
if check_feature_branch feature/budget-policy true 2>/dev/null; then
    echo 'Unnumbered feature branch unexpectedly passed validation' >&2
    exit 1
fi

branch_plan=$(SPECIFY_FEATURE_DIRECTORY=docs/features/0002-wrong-feature .specify/scripts/bash/setup-plan.sh | field_from FEATURE_DIR)
[[ "$branch_plan" == "$TEST_ROOT/docs/features/0001-budget-policy" ]] || {
    echo 'Plan setup let an explicit directory override the feature branch' >&2
    exit 1
}

cp "$epic" "$TEST_ROOT/epic-valid"
perl -pi -e 's/^status: Pending$/status: Active/; $_ = "" if /speckit:generated:epic-features END/' "$epic"
printf '\nSENTINEL_AFTER_BLOCK\n' >> "$epic"
cp "$epic" "$TEST_ROOT/epic-malformed"
if .specify/scripts/bash/sync-docs.sh >/dev/null 2>&1; then
    echo 'Sync unexpectedly accepted a missing generated END marker' >&2
    exit 1
fi
cmp -s "$epic" "$TEST_ROOT/epic-malformed" || { echo 'Sync changed a malformed generated document' >&2; exit 1; }
grep -q SENTINEL_AFTER_BLOCK "$epic"
cp "$TEST_ROOT/epic-valid" "$epic"

printf '\n<!-- speckit:generated:epic-features START -->\n' >> "$epic"
cp "$epic" "$TEST_ROOT/epic-duplicate"
if .specify/scripts/bash/sync-docs.sh >/dev/null 2>&1; then
    echo 'Sync unexpectedly accepted duplicate generated markers' >&2
    exit 1
fi
cmp -s "$epic" "$TEST_ROOT/epic-duplicate" || { echo 'Sync changed a document with duplicate markers' >&2; exit 1; }
cp "$TEST_ROOT/epic-valid" "$epic"
.specify/scripts/bash/sync-docs.sh

adr_output=$(.specify/scripts/bash/create-new-adr.sh --short-name budget-contract 'Budget contract')
adr_file=$(printf '%s\n' "$adr_output" | field_from ADR_FILE)
plan_template=$(resolve_template "plan-template" "$TEST_ROOT")
[[ "$plan_template" == "$TEST_ROOT/.specify/templates/overrides/plan-template.md" ]] || {
    echo 'Plan setup did not select the project override template' >&2
    exit 1
}
cp "$plan_template" "$feature_dir/plan.md"
grep -Fq '## Documentation Impact' "$feature_dir/plan.md"
.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null

perl -pi -e 's/\*\*Impact\*\*: None/**Impact**: Feature/' "$feature_dir/plan.md"
.specify/scripts/bash/check-workflow.sh >/dev/null

perl -0pi -e 's/\*\*Impact\*\*: Feature/**Impact**: Project/; s/\nNone\.\n/\n- [Budget contract](..\/..\/adrs\/0001-budget-contract.md)\n/' "$feature_dir/plan.md"
perl -0pi -e 's/## Architecture Decisions\n\nNone\./## Architecture Decisions\n\n- [Budget contract](..\/..\/adrs\/0001-budget-contract.md)/' "$spec"

.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null

perl -pi -e 's/^status: Pending$/status: Active/' "$spec"
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Active Project feature with Proposed ADR unexpectedly passed validation' >&2
    exit 1
fi

cp "$spec" "$TEST_ROOT/spec-with-adr"
cp "$feature_dir/plan.md" "$TEST_ROOT/plan-with-adr"
perl -ni -e 'print unless /Budget contract/' "$spec" "$feature_dir/plan.md"
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Active Project feature without an ADR unexpectedly passed validation' >&2
    exit 1
fi
cp "$TEST_ROOT/spec-with-adr" "$spec"
cp "$TEST_ROOT/plan-with-adr" "$feature_dir/plan.md"

perl -pi -e 's/^status: Proposed$/status: Accepted/' "$adr_file"
.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null

cp "$spec" "$TEST_ROOT/spec-matching-adrs"
perl -ni -e 'print unless /Budget contract/' "$spec"
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Feature with mismatched spec and plan ADR links unexpectedly passed validation' >&2
    exit 1
fi
cp "$TEST_ROOT/spec-matching-adrs" "$spec"

second_old_output=$(.specify/scripts/bash/create-new-adr.sh --short-name retry-contract 'Retry contract')
second_old=$(printf '%s\n' "$second_old_output" | field_from ADR_FILE)
perl -pi -e 's/^status: Proposed$/status: Accepted/' "$second_old"

replacement_output=$(.specify/scripts/bash/create-new-adr.sh --short-name runtime-contract 'Runtime contract')
replacement=$(printf '%s\n' "$replacement_output" | field_from ADR_FILE)
perl -pi -e 's/^status: Proposed$/status: Accepted/; s|^\*\*Supersedes\*\*: None$|**Supersedes**: [Budget contract](0001-budget-contract.md), [Retry contract](0002-retry-contract.md)|' "$replacement"
perl -pi -e 's/^status: Accepted$/status: Superseded/; s|^\*\*Superseded by\*\*: None$|**Superseded by**: [Runtime contract](0003-runtime-contract.md)|' "$adr_file" "$second_old"
.specify/scripts/bash/sync-docs.sh
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Active feature referencing a Superseded ADR unexpectedly passed validation' >&2
    exit 1
fi
perl -pi -e 's/0001-budget-contract\.md/0003-runtime-contract.md/g' "$spec" "$feature_dir/plan.md"
.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null

cp "$replacement" "$TEST_ROOT/replacement-valid"
perl -pi -e 's|^\*\*Supersedes\*\*:.*$|**Supersedes**: None|' "$replacement"
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Broken reciprocal supersession unexpectedly passed validation' >&2
    exit 1
fi
cp "$TEST_ROOT/replacement-valid" "$replacement"
.specify/scripts/bash/check-workflow.sh >/dev/null

mkdir -p "$TEST_ROOT/bin"
printf '%s\n' \
    '#!/usr/bin/env bash' \
    '[[ "${FAKE_GH_FAIL:-false}" == true ]] && exit 127' \
    'case "${1:-} ${2:-}" in' \
    '  "repo view") printf "%s\\n" "${FAKE_REPO_URL:-https://github.com/example/model-planes}" ;;' \
    '  "pr list") printf "%s\\t%s\\n" "${FAKE_PR_URL:-https://github.com/example/model-planes/pull/1}" "${FAKE_PR_STATE:-MERGED}" ;;' \
    '  "pr view") printf "%s\\t%s\\t%s\\n" "${FAKE_PR_STATE:-MERGED}" "${FAKE_PR_HEAD:-feature/0001-budget-policy}" "${FAKE_PR_URL:-https://github.com/example/model-planes/pull/1}" ;;' \
    '  *) exit 2 ;;' \
    'esac' > "$TEST_ROOT/bin/gh"
chmod +x "$TEST_ROOT/bin/gh"
export PATH="$TEST_ROOT/bin:$PATH"
perl -ni -e 'print unless /^(- )?\*\*PR\*\*:/' "$spec"
perl -pi -e 's/0003-runtime-contract\.md/0001-budget-contract.md/g' "$spec" "$feature_dir/plan.md"
.specify/scripts/bash/refresh-pr-status.sh
.specify/scripts/bash/sync-docs.sh
grep -q '^status: Done$' "$spec"
grep -Fq -- '- **PR**: [https://github.com/example/model-planes/pull/1](https://github.com/example/model-planes/pull/1)' "$spec"
grep -q '^status: Done$' docs/epics/0001-policy/epic.md
.specify/scripts/bash/check-workflow.sh >/dev/null

proposed_output=$(.specify/scripts/bash/create-new-adr.sh --short-name future-contract 'Future contract')
proposed=$(printf '%s\n' "$proposed_output" | field_from ADR_FILE)
perl -pi -e 's/0001-budget-contract\.md/0004-future-contract.md/g' "$spec" "$feature_dir/plan.md"
.specify/scripts/bash/sync-docs.sh
if .specify/scripts/bash/check-workflow.sh >/dev/null 2>&1; then
    echo 'Done feature referencing a Proposed ADR unexpectedly passed validation' >&2
    exit 1
fi
perl -pi -e 's/0004-future-contract\.md/0001-budget-contract.md/g' "$spec" "$feature_dir/plan.md"
.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null

export FAKE_GH_FAIL=true
.specify/scripts/bash/check-workflow.sh >/dev/null
perl -pi -e 's/^status: Done$/status: Active/' "$spec"
if .specify/scripts/bash/refresh-pr-status.sh >/dev/null 2>&1; then
    echo 'Status refresh unexpectedly passed when GitHub verification failed' >&2
    exit 1
fi
export FAKE_GH_FAIL=false
export FAKE_PR_STATE=MERGED
.specify/scripts/bash/refresh-pr-status.sh
.specify/scripts/bash/sync-docs.sh
.specify/scripts/bash/check-workflow.sh >/dev/null

echo 'Spec Kit workflow contract tests passed.'
