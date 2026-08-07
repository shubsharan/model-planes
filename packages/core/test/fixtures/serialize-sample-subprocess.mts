// Helper spawned as a separate Node process by serialize-crossproc.test.ts
// to confirm canonical serialization is byte-identical across processes,
// not just repeated in-process calls (SC-002). Registers the same resolve
// hook as derive-seed-subprocess.mts so the real TypeScript source runs
// directly — no build step needed.
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

const { serialize } = await import("../../src/serialize.js");
const { buildSampleTrace } = await import("./sample-trace.js");

const bytes = serialize(buildSampleTrace());
process.stdout.write(Buffer.from(bytes).toString("base64"));
