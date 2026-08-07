<!-- SPECKIT START -->

Feature work lives in `docs/features/NNNN-name` on `feature/NNNN-name`. The active feature is derived
from the checked-out feature branch; on `main`, no feature is active. Read the feature's `spec.md`,
`plan.md`, and `tasks.md`. Features link their parent epic and every governing ADR.
<!-- SPECKIT END -->

## Project Guidance

- Follow `docs/README.md` for document ownership and the local versus GitHub-backed Spec Kit commands.
- Treat the active feature specification as the behavioral contract, Accepted ADRs as the architecture contract, and its plan and tasks as the implementation contract. Resolve conflicts in those artifacts before changing code.
- Confirm current capabilities from tracked source and tests; do not invent missing commands, packages, or contracts from future-state prose.
- Content inside the `SPECKIT` markers is workflow-owned; keep durable human guidance outside them. `tasks.md` may be absent during specification and planning, but implementation must not begin without it.
- Follow the canonical ADR policy in `docs/adrs/README.md`. Active work with Project impact requires Accepted, non-Superseded governing ADRs; Accepted ADRs are immutable and an architectural reversal requires explicit supersession.
