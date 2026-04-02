/**
 * Runs before `npm run dev` so port API_PORT is not taken by another local stack (e.g. sportsMatchData).
 * Windows only; other platforms no-op.
 */
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (process.platform !== "win32") {
  process.exit(0);
}

const ps1 = join(root, "scripts", "free-port-4000.ps1");
const result = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps1],
  { stdio: "inherit", cwd: root, shell: false },
);

if (result.error) {
  console.warn("[stockMonitoring] free-port skipped:", result.error.message);
}
process.exit(0);
