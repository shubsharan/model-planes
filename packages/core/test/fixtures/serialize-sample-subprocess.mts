// Helper spawned as a separate Node process by serialize-crossproc.test.ts
// to confirm canonical serialization is byte-identical across processes,
// not just repeated in-process calls (SC-002). Node >= 25 runs .ts source
// directly — no build step needed.
import { serialize } from "../../src/serialize.ts";
import { buildSampleTrace } from "./sample-trace.ts";

const bytes = serialize(buildSampleTrace());
process.stdout.write(Buffer.from(bytes).toString("base64"));
