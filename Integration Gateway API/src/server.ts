import { config } from "./config.js";
import { buildApp } from "./app.js";

const app = await buildApp({ config });
let shutdownPromise: Promise<void> | undefined;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  app.log.info({ signal }, "shutting down");
  shutdownPromise = app.close();
  try {
    await shutdownPromise;
  } catch (error) {
    app.log.error({ err: error }, "shutdown failed");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  // If binding fails, close the composed app so SQLite and the worker are released.
  app.log.error(error);
  await app.close();
  process.exitCode = 1;
}
