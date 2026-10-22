import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { type ZodError, type ZodType } from "zod";
import type { Principal } from "../security.js";

const errorSchema = {
  type: "object",
  properties: { error: { type: "object", additionalProperties: true } },
  additionalProperties: true,
};
const envelopeSchema = {
  type: "object",
  properties: { data: {}, meta: {} },
  additionalProperties: true,
};

const commonErrors = {
  400: errorSchema,
  401: errorSchema,
  403: errorSchema,
  404: errorSchema,
  409: errorSchema,
  413: errorSchema,
  429: errorSchema,
  500: errorSchema,
};

export type ApiFailure = { status: number; body: unknown };
export type Parsed<T> = { value: T } | { response: ApiFailure };

/** Build the stable public error envelope with a request-scoped correlation ID. */
export function failure(
  request: FastifyRequest,
  status: number,
  code: string,
  message: string,
  fields?: Record<string, string[]>,
): ApiFailure {
  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(fields ? { fields } : {}),
        requestId: request.id,
      },
    },
  };
}

function formatIssues(error: ZodError): Record<string, string[]> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "_", [issue.message]]),
  );
}

/** Parse untrusted request values and convert Zod issues to the API error format. */
export function parse<T>(
  request: FastifyRequest,
  schema: ZodType<T>,
  value: unknown,
): Parsed<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    return {
      response: failure(
        request,
        400,
        "VALIDATION_ERROR",
        "The request is invalid",
        formatIssues(result.error),
      ),
    };
  }
  return { value: result.data };
}

export function sendFailure(reply: FastifyReply, response: ApiFailure) {
  return reply.code(response.status).send(response.body);
}

export function requirePrincipal(
  request: FastifyRequest,
  reply: FastifyReply,
  roles?: Principal["role"][],
): Principal | null {
  if (!request.principal) {
    sendFailure(
      reply,
      failure(request, 401, "UNAUTHORIZED", "A valid bearer token is required"),
    );
    return null;
  }
  if (roles && !roles.includes(request.principal.role)) {
    sendFailure(
      reply,
      failure(
        request,
        403,
        "FORBIDDEN",
        "You do not have access to this operation",
      ),
    );
    return null;
  }
  return request.principal;
}

/** Register a route and its OpenAPI metadata; validation itself remains Zod-driven. */
export function addApiRoute(
  app: FastifyInstance,
  method: "get" | "post" | "patch" | "delete",
  url: string,
  summary: string,
  tag: string,
  handler: (request: FastifyRequest, reply: FastifyReply) => unknown,
  schema: Record<string, unknown> = {},
): void {
  const errors = url === "/health" ? {} : commonErrors;
  const success =
    method === "get" || method === "patch"
      ? { 200: { description: "Successful response", ...envelopeSchema } }
      : method === "delete"
        ? { 204: { description: "Resource deleted" } }
        : url.includes("webhooks")
          ? {
              200: {
                description: "Duplicate event acknowledged",
                ...envelopeSchema,
              },
              202: {
                description: "Event accepted for asynchronous processing",
                ...envelopeSchema,
              },
            }
          : { 201: { description: "Resource created", ...envelopeSchema } };

  app.route({
    method: method.toUpperCase() as "GET" | "POST" | "PATCH" | "DELETE",
    url,
    attachValidation: true,
    schema: {
      summary,
      tags: [tag],
      response: { ...success, ...errors },
      ...schema,
    },
    handler,
  });
}
