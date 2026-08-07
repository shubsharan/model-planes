import { defineConfig } from "vitest/config";

// Shared workspace Vitest config. Vitest transforms TS/ESM directly, so
// specs run against `src` — no separate build step is required for tests.
// See docs/features/0001-core-contracts/research.md (R3) for rationale.
//
// `root` is pinned to this file's directory (the repo root) so the include
// glob resolves the same way whether Vitest is invoked from the repo root
// or from a package directory via `pnpm --filter <pkg> test`.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    globals: false,
    include: ["packages/*/test/**/*.test.ts"],
  },
});
