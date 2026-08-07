---
name: speckit-git-feature
description: Create a Codex-style feature/NNNN-name branch tied to its feature artifact.
---

# Create Feature Branch

Derive a concise lowercase hyphenated slug from `$ARGUMENTS`, then run exactly once:

```bash
.specify/extensions/git/scripts/bash/create-new-feature.sh --json --short-name "<slug>" "$ARGUMENTS"
```

Branches must match `feature/NNNN-<short-name>`. Reuse `NNNN-<short-name>` when a matching artifact
already exists; otherwise allocate the next number from `docs/features/`.
