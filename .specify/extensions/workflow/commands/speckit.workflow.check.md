# Validate the Spec Kit workflow

Run `.specify/scripts/bash/check-workflow.sh`. Architecture impact and ADR lifecycle follow
`docs/adrs/README.md`: Pending Project features may link Proposed ADRs, Active Project features require
Accepted ADRs, and Done features retain Accepted or Superseded historical ADRs. Done features also require
authenticated `gh` access so their merged PR can be verified.
