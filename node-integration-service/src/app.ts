import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'

import Fastify, { type FastifyInstance } from 'fastify'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

import { UpstreamClient, type QuoteProvider } from './clients/upstream-client.js'
import { loadConfig, type AppConfig } from './config/env.js'
import { mapErrorToHttpResponse } from './errors/app-errors.js'
import { createLoggerOptions } from './logging/create-logger.js'
import { registerDemoRoutes } from './routes/demo-routes.js'
import { registerHealthRoutes } from './routes/health-routes.js'
import { registerExportRoute, registerIntegrationRoutes, registerItemRoutes } from './routes/items-routes.js'
import { ItemsService } from './services/items-service.js'
import { InMemoryItemStore, type ItemStore } from './services/items-store.js'
import { ReadinessService } from './services/readiness-service.js'
import { SEED_ITEMS } from './services/seed-items.js'

/**
 * Injectable dependencies — tests swap these out; production defaults are
 * created below. `buildApp` never listens and never installs signal handlers:
 * that is `server.ts`'s job, so tests can instantiate the app freely.
 */
export interface AppDependencies {
  readonly itemStore?: ItemStore
  readonly quoteProvider?: QuoteProvider
  readonly readiness?: ReadinessService
}

/**
 * Request IDs come from the trusted inverse proxy header when present and
 * sane, otherwise they are generated. They appear in logs (Fastify child
 * loggers bind reqId), response header, and error bodies.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/
function pickRequestId(request: { readonly headers: IncomingHttpHeaders }): string {
  const incoming = request.headers['x-request-id']
  if (typeof incoming === 'string') {
    const candidate = incoming.trim()
    if (REQUEST_ID_PATTERN.test(candidate)) return candidate
  }
  return randomUUID()
}

export async function buildApp(
  config: AppConfig = loadConfig(),
  deps: AppDependencies = {},
): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify({
    logger: createLoggerOptions(config),
    genReqId: pickRequestId,
    bodyLimit: 1_048_576,
    // Guard rails for slow clients / half-open sockets.
    requestTimeout: 30_000,
    connectionTimeout: 10_000,
    keepAliveTimeout: 5_000,
  })

  const store = deps.itemStore ?? new InMemoryItemStore(SEED_ITEMS)
  const quoteProvider =
    deps.quoteProvider ??
    new UpstreamClient({
      baseUrl: config.upstream.baseUrl,
      timeoutMs: config.upstream.timeoutMs,
      logger: app.log,
    })
  const readiness =
    deps.readiness ??
    new ReadinessService({
      probeUpstream: config.readiness.upstreamProbe,
      strict: config.readiness.strictUpstream,
      upstreamBaseUrl: config.upstream.baseUrl,
    })
  const itemsService = new ItemsService(store, quoteProvider)

  await app.register(helmet)
  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    // allowList semantics: a function consulted with (req, key). Health and
    // readiness must always answer, even for exhausted clients.
    allowList: (request, key) => {
      void key
      const url = request.raw.url ?? ''
      return url === '/health' || url === '/ready' || url.startsWith('/health?') || url.startsWith('/ready?')
    },
    errorResponseBuilder: (request) => ({
      code: 'RATE_LIMITED',
      message: 'Too many requests, please slow down.',
      requestId: request.id,
    }),
  })

  // Echo the request id back to the caller on every response.
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
  })

  // Single, central error mapping point: no other layer logs failures.
  app.setErrorHandler((error, request, reply) => {
    const { statusCode, body } = mapErrorToHttpResponse(error, request.id)
    if (statusCode >= 500) {
      // Full error (incl. cause chain) stays in logs, never in the response.
      request.log.error({ err: error }, 'Request failed with 5xx')
    } else {
      request.log.warn({ err: error }, 'Request rejected with 4xx')
    }
    void reply.status(statusCode).send(body)
  })

  app.setNotFoundHandler((request, reply) => {
    request.log.warn({ url: request.raw.url }, 'Route not found')
    void reply.status(404).send({ code: 'NOT_FOUND', message: 'Route not found.', requestId: request.id })
  })

  // All versioned API routes share the /api/v1 prefix.
  await app.register(
    async (api) => {
      registerItemRoutes(api, itemsService)
      registerIntegrationRoutes(api, { quoteProvider })
      registerExportRoute(api, store)
      if (config.enableDemoBlock) registerDemoRoutes(api)
    },
    { prefix: '/api/v1' },
  )

  registerHealthRoutes(app, { readiness, envName: config.nodeEnv })

  // Fail fast at compile/boot time rather than on the first request.
  await app.ready()
  return app
}
