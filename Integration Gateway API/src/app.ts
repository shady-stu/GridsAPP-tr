import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { Config } from "./config.js";
import { openDatabase, type Db } from "./database.js";
import { registerErrorHandlers } from "./lib/errors.js";
import { registerCustomerRoutes } from "./modules/customers/routes.js";
import { registerHealthRoute } from "./modules/health/routes.js";
import { registerOrderRoutes } from "./modules/orders/routes.js";
import { createWebhookProcessor } from "./modules/webhooks/processor.js";
import { registerWebhookRoutes } from "./modules/webhooks/routes.js";
import { registerAuthentication } from "./plugins/authentication.js";
import { registerRawJsonParser } from "./plugins/raw-json.js";

/** Options for composing an API instance; injected paths and clocks make tests deterministic. */
export interface AppOptions {
  config: Config;
  databasePath?: string;
  clock?: () => number;
}

/** Fastify instance plus explicit controls used by operations and integration tests. */
export type BuiltApp = ReturnType<typeof Fastify> & {
  db: Db;
  processPendingEvents: () => Promise<void>;
};

/**
 * Compose plugins, independent route modules, persistence, and worker lifecycle.
 * This function intentionally owns no customer/order business rules.
 */
export async function buildApp(options: AppOptions): Promise<BuiltApp> {
  const { config } = options;
  const db = openDatabase(options.databasePath ?? config.DATABASE_PATH);
  const epoch = options.clock ?? Date.now;
  const now = () => new Date(epoch()).toISOString();
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "test" ? "silent" : "info",
      redact: ["req.headers.authorization", "req.headers.x-webhook-signature"],
    },
    bodyLimit: 1_048_576,
    genReqId: () => "req_" + randomUUID(),
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
  });
  await app.register(swagger, {
    openapi: {
      openapi: "3.0.3",
      info: {
        title: "Integration Gateway API",
        version: "1.0.0",
        description:
          "REST API with demo bearer authentication and signed payment webhooks.",
      },
      servers: [{ url: "http://" + config.HOST + ":" + config.PORT }],
      components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: "/documentation" });

  registerRawJsonParser(app);
  registerAuthentication(app, config);
  registerErrorHandlers(app);
  registerHealthRoute(app);
  registerCustomerRoutes(app, { db, now });
  registerOrderRoutes(app, { db, now, epoch });
  registerWebhookRoutes(app, { db, config, now, epoch });
  app.get("/openapi.json", async () => app.swagger());

  const processPendingEvents = createWebhookProcessor({
    db,
    now,
    epoch,
    maxAttempts: config.WEBHOOK_MAX_ATTEMPTS,
  });
  // SQLite is the durable event store; this timer is only the single-process poller.
  const worker = setInterval(() => {
    void processPendingEvents().catch((error: unknown) => {
      app.log.error({ err: error }, "webhook worker poll failed");
    });
  }, 1000);
  worker.unref();

  app.addHook("onClose", async () => {
    clearInterval(worker);
    db.close();
  });
  return Object.assign(app, { db, processPendingEvents });
}

// Preserve the original import path while security implementation stays in its focused module.
export { signWebhook } from "./security.js";
