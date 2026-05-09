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

const ps4000 = join(root, "scripts", "free-port-4000.ps1");
const r4000 = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps4000],
  { stdio: "inherit", cwd: root, shell: false },
);
if (r4000.error) {
  console.warn("[stockMonitoring] free-port-4000 skipped:", r4000.error.message);
}

const ps3000 = join(root, "scripts", "free-port-3000.ps1");
const r3000 = spawnSync(
  "powershell.exe",
  ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps3000],
  { stdio: "inherit", cwd: root, shell: false },
);
if (r3000.error) {
  console.warn("[stockMonitoring] free-port-3000 skipped:", r3000.error.message);
}
process.exit(0);
