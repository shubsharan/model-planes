# model-planes Documentation

Each fact has one canonical home. Link to that home rather than copying it into
another durable document.

| Document | Owns | Does not own |
| --- | --- | --- |
| `docs/roadmap.md` | directional sequencing, decision gates, and epic status | APIs, schemas, or feature design |
| `docs/architecture.md` | high-level package/workspace layout and the dependency graph | durable architecture decisions (ADRs) or feature design |
| `docs/adrs/README.md` and ADRs | durable project architecture decisions and their lifecycle | feature-level design or API inventories |
| `docs/features/NNNN-name/` | feature behavior, design decisions, data models, contracts, verification, and implementation tasks | project-wide direction or historical architecture rationale |
| source and tests | executable current behavior and exact interfaces | intended product direction |
| `docs/features/NNNN-name/` | feature behavior, design decisions, data models, contracts, verification, and implementation tasks | project-wide direction or historical architecture rationale |
| source and tests | executable current behavior and exact interfaces | intended product direction |

## Update Protocol

1. Change the canonical document when its owned fact changes; update other documents only with a link or a short consequence.
2. A feature plan declares `Documentation Impact`: `None`, or the durable documents that need a deliberate update. This is a planning prompt, not an automated semantic gate.
3. Keep generated blocks intact. `pnpm speckit:sync` updates local generated epic and ADR indexes and never contacts GitHub.
4. Run `pnpm speckit:refresh-status` only when intentionally reconciling merged pull requests. It queries GitHub, updates feature status, then synchronizes generated documents.
5. The active feature is the checked-out `feature/NNNN-name` branch. On `main`, use durable project documents and inspect feature history; do not treat `.specify/feature.json` as an active-work pointer.

## Routine Checks

- `pnpm speckit:sync`: deterministic local documentation synchronization.
- `pnpm speckit:check`: deterministic workflow and link validation.
- `pnpm speckit:refresh-status`: explicit GitHub-backed status reconciliation.
- `pnpm verify`: the full provider-free repository verification suite.
