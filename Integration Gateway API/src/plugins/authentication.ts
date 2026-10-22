import type { FastifyInstance } from "fastify";
import type { Config } from "../config.js";
import { constantTimeEqual, type Principal } from "../security.js";

declare module "fastify" {
  interface FastifyRequest {
    principal: Principal | null;
    rawBody?: Buffer;
  }
}

/** Attach the configured demo identity to each request; request data never sets identity. */
export function registerAuthentication(
  app: FastifyInstance,
  config: Config,
): void {
  app.decorateRequest("principal", null);
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return;

    const token = authorization.slice("Bearer ".length);
    if (constantTimeEqual(token, config.ADMIN_API_TOKEN)) {
      request.principal = { id: "demo-admin", role: "admin" };
    } else if (constantTimeEqual(token, config.CUSTOMER_API_TOKEN)) {
      request.principal = { id: "demo-customer", role: "customer" };
    }
  });
}
