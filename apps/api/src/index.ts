import { loadEnv } from "./config.js";
import { logError, logInfo } from "./lib/logger.js";
import { createApiApplication } from "./bootstrap.js";

const env = loadEnv();
const app = await createApiApplication(env);

app
  .listen({ port: env.API_PORT, host: "0.0.0.0" })
  .then((addr) => {
    logInfo("api listening", { addr });
  })
  .catch((err) => {
    logError("listen failed", { err: String(err) });
    process.exit(1);
  });
