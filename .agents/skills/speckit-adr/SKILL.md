---
name: speckit-adr
description: Create, accept, or supersede a minimal Architecture Decision Record and update feature references.
---

# Architecture Decision Record

Read and follow `docs/adrs/README.md`, the canonical ADR policy. Create an ADR only for
`Project` impact. `None` and `Feature` decisions stay in the relevant Spec Kit design artifacts.

## Create

Run `.specify/scripts/bash/create-new-adr.sh --json --short-name "<slug>" "$ARGUMENTS"`, then fill
Context, Decision, and Consequences for one durable choice. Do not copy API inventories, complete schemas,
task sequencing, feature acceptance criteria, or example-local vocabulary into the ADR. Leave
`status: Proposed` until the user explicitly approves the decision. After approval, change it to
`Accepted`.

Every relevant feature must link the ADR in both `spec.md` and `plan.md` using a relative
`../../adrs/NNNN-slug.md` link.

## Supersede

Supersede only when an established Project decision is actually reversed. Create the replacement ADR and
set its `Supersedes` line to the old ADR. After explicit user approval, mark the replacement Accepted, mark
the old ADR Superseded, and set the old ADR's `Superseded by` link. Update Pending and Active features to
the replacement; Done features retain the historical ADR that governed their implementation.

Finish with `.specify/scripts/bash/sync-docs.sh` and `.specify/scripts/bash/check-workflow.sh`.
