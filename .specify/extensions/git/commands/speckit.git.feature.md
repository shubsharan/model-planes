---
description: "Create a feature/NNNN-<short-name> branch"
---

Generate a concise lowercase hyphenated slug, then run:

```bash
.specify/extensions/git/scripts/bash/create-new-feature.sh --json --short-name "<slug>" "$ARGUMENTS"
```

Reuse the matching artifact's `NNNN-<slug>` when it exists; otherwise allocate the next number from
`docs/features/`. Use the same name for the branch and artifact directory.
