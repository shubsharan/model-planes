// Helper spawned as a separate Node process by seed.test.ts to confirm
// deriveSubSeed is stable across processes, not just repeated in-process
// calls (SC-005). Registers a tiny resolve hook (below) so the real
// TypeScript source runs directly — no build step needed.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      const candidate = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(candidate))) {
        return nextResolve(`${specifier.slice(0, -3)}.ts`, context);
      }
    }
    return nextResolve(specifier, context);
  },
});

const { deriveSubSeed } = await import("../../src/seed.js");

process.stdout.write(JSON.stringify(deriveSubSeed({ root: 42 }, "wind")));
