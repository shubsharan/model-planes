// Helper spawned as a separate Node process by seed.test.ts to confirm
// deriveSubSeed is stable across processes, not just repeated in-process
// calls (SC-005). Node >= 25 runs .ts source directly — no build step needed.
import { deriveSubSeed } from "../../src/seed.ts";

process.stdout.write(JSON.stringify(deriveSubSeed({ root: 42 }, "wind")));
