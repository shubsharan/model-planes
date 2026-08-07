// Polish: serialize the same value in a separate Node process and assert
// byte-identical output (SC-002 across processes).
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { serialize } from "../src/index.js";
import { buildSampleTrace } from "./fixtures/sample-trace.js";

describe("cross-process byte-identical serialization (SC-002)", () => {
  it("serializes the same value to identical bytes in a separate Node process", () => {
    const scriptPath = fileURLToPath(
      new URL("./fixtures/serialize-sample-subprocess.mts", import.meta.url),
    );
    const output = execFileSync(process.execPath, [scriptPath], { encoding: "utf8" });
    const fromSubprocess = Buffer.from(output, "base64");
    const inProcess = Buffer.from(serialize(buildSampleTrace()));
    expect(fromSubprocess.equals(inProcess)).toBe(true);
  });
});
