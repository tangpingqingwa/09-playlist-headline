#!/usr/bin/env node

// Keep the production launcher small. The shared TypeScript probe runs in a
// child Node process; tsx is a runtime dependency because npm start must also
// work after dev dependencies are omitted.
import { spawnSync } from "node:child_process";

const readinessModule = new URL("../src/runtime/readiness.ts", import.meta.url).href;
const probe = spawnSync(
  process.execPath,
  [
    "--import",
    "tsx/esm",
    "--input-type=module",
    "--eval",
    `import { probeRuntimeReadiness } from ${JSON.stringify(readinessModule)}; probeRuntimeReadiness(process.env);`,
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "ignore",
  },
);

if (probe.error || probe.status !== 0) {
  console.error("BLOCKED-CONFIG: runtime readiness unavailable");
  process.exit(1);
}

console.log("runtime preflight passed");
