import { defineConfig } from "vitest/config";

// Package-scoped Vitest config. It exists only to turn on `typecheck`, which the
// control-surface boundary needs: `test/control-surface.test-d.ts` asserts that
// the six non-motion command kinds do not compile against `advanceTick`
// (research R7), and no runtime runner can check that.
//
// Because a package-level config overrides the shared root one for
// `pnpm --filter @model-planes/sim test`, the runtime `include` below mirrors
// the root config's glob scoped to this package, so the ordinary suites keep
// running exactly as before.
export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: "node",
    globals: false,
    include: ["test/**/*.test.ts"],
    typecheck: {
      enabled: true,
      include: ["test/**/*.test-d.ts"],
      tsconfig: "./tsconfig.json",
    },
  },
});
