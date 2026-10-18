import type { FastifyInstance } from "fastify";
import { addApiRoute } from "../../lib/http.js";

export function registerHealthRoute(app: FastifyInstance): void {
  addApiRoute(
    app,
    "get",
    "/health",
    "Health check",
    "Health",
    async (_request, reply) => reply.send({ data: { status: "ok" } }),
  );
}
