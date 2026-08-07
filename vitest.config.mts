import { defineConfig } from "vitest/config";

// Shared workspace Vitest config. Vitest transforms TS/ESM directly, so
// specs run against `src` — no separate build step is required for tests.
// See docs/features/0001-core-contracts/research.md (R3) for rationale.
export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["packages/*/test/**/*.test.ts"],
  },
});
