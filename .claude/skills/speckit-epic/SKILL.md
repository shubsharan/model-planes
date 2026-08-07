---
name: speckit-epic
description: Create or update a minimal epic that groups feature specifications.
---

# Epic

Use `$ARGUMENTS` to create or update one epic.

For a new epic, run:

```bash
.specify/scripts/bash/create-new-epic.sh --json --short-name "<slug>" "$ARGUMENTS"
```

Fill the template at the cross-feature level:

- State the motivating context and one end-to-end outcome.
- Describe only scenarios that span or justify multiple features.
- Define measurable epic completion conditions and use their `EDC-NNN` identifiers below.
- Record shared scope boundaries and invariants, not feature requirements or implementation details.
- Order planned features by dependency. For each, state its independent outcome, dependencies, and
  the epic completion conditions it advances.
- Keep only material risks and open questions that could change feature boundaries. Point each to
  the planned feature or ADR that should resolve it; write `None.` when there are none.

Planned features are names and outcomes, not links. Do not create their feature directories or
specs. Keep `status: Pending`; do not add metadata or other planning sections. Epics do not create
branches. Architecture decisions belong in ADRs.

For an update, change only the requested prose. Never edit the generated Features block.

Finish by running `.specify/scripts/bash/sync-docs.sh`.
