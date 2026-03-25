import { loadEnv } from "./config.js";
import { logError, logInfo } from "./lib/logger.js";
import { createApiApplication } from "./bootstrap.js";

const env = loadEnv();
const { app, runAfterListen } = await createApiApplication(env);
let shuttingDown = false;

async function shutdown(sig: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.close();
    logInfo("api shutdown complete", { signal: sig });
    process.exit(0);
  } catch (err) {
    logError("api shutdown failed", { signal: sig, err: String(err) });
    process.exit(1);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

try {
  const addr = await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  logInfo("api listening", { addr });
  void runAfterListen().catch((err) => {
    logError("runAfterListen failed (히스토리 백필·시세 폴링 시작)", { err: String(err) });
  });
} catch (err) {
  logError("listen failed", { err: String(err) });
  process.exit(1);
}
