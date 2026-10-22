import type { FastifyInstance } from "fastify";

/** Convert parser, size-limit, and unhandled errors into the public error envelope. */
export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
        requestId: request.id,
      },
    }),
  );
  app.setErrorHandler(
    (
      error: Error & {
        statusCode?: number;
        validation?: { instancePath: string; message?: string }[];
      },
      request,
      reply,
    ) => {
      if (error.statusCode === 413) {
        return reply.code(413).send({
          error: {
            code: "PAYLOAD_TOO_LARGE",
            message: "Request body exceeds the 1 MB limit",
            requestId: request.id,
          },
        });
      }
      if (error.statusCode === 429) {
        return reply.code(429).send({
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            requestId: request.id,
          },
        });
      }
      if (error.statusCode === 400) {
        const fields = error.validation?.length
          ? Object.fromEntries(
              error.validation.map((issue) => [
                issue.instancePath.replace(/^\//, "").replaceAll("/", ".") ||
                  "_",
                [issue.message ?? "Invalid value"],
              ]),
            )
          : undefined;
        return reply.code(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "The request is invalid",
            ...(fields ? { fields } : {}),
            requestId: request.id,
          },
        });
      }
      request.log.error(
        { err: error, requestId: request.id },
        "request failed",
      );
      return reply.code(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred",
          requestId: request.id,
        },
      });
    },
  );
}
