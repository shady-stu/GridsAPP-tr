import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { QuoteProvider } from '../clients/upstream-client.js'
import {
  GetItemQuerySchema,
  CreateItemSchema,
  ItemIdParamSchema,
  ListItemsQuerySchema,
  parseOrThrow,
} from '../schemas/item-schemas.js'
import type { ItemsService } from '../services/items-service.js'
import type { ItemStore } from '../services/items-store.js'
import { createItemCsvStream } from '../streams/csv-stream.js'

/**
 * An AbortSignal that fires when the incoming HTTP request is torn down
 * (client disconnect). Propagated into outbound calls so cancelled clients
 * cancel their upstream work as well.
 */
export function requestCloseSignal(request: FastifyRequest): AbortSignal {
  const controller = new AbortController()
  request.raw.once('close', () => controller.abort())
  return controller.signal
}

/**
 * Items CRUD. Handlers are thin: parse -> delegate to the service -> shape
 * the JSON envelope. All failures bubble to the central error handler.
 */
export function registerItemRoutes(app: FastifyInstance, service: ItemsService): void {
  app.get('/items', async (request, reply) => {
    const query = parseOrThrow(ListItemsQuerySchema, request.query, 'query')
    const { items, meta } = await service.list(query)
    return reply.status(200).send({ data: items, meta })
  })

  app.get('/items/:id', async (request, reply) => {
    const { id } = parseOrThrow(
      ItemIdParamSchema,
      (request as FastifyRequest & { params: unknown }).params,
      'params',
    )
    const { enrich } = parseOrThrow(GetItemQuerySchema, request.query, 'query')
    const { item, enrichment } = await service.getItem(id, {
      enrich,
      signal: requestCloseSignal(request),
    })
    // Cancellation race: if the client already vanished we never get here.
    return reply.status(200).send(enrichment ? { data: { ...item, upstream: enrichment } } : { data: item })
  })

  app.post('/items', async (request, reply) => {
    const payload = parseOrThrow(
      CreateItemSchema,
      (request as FastifyRequest & { body: unknown }).body,
      'body',
    )
    const item = await service.create(payload)
    return reply.status(201).header('location', `/api/v1/items/${item.id}`).send({ data: item })
  })
}

/** Thin integration proxy around the configured upstream quote provider. */
export function registerIntegrationRoutes(
  app: FastifyInstance,
  options: { readonly quoteProvider: QuoteProvider },
): void {
  app.get('/integrations/quote', async (request, reply) => {
    const quote = await options.quoteProvider.getRandomQuote(requestCloseSignal(request))
    return reply.status(200).send({ data: { ...quote, fetchedAt: new Date().toISOString() } })
  })
}

/**
 * Streamed CSV export. The route immediately returns a Readable (never a
 * pre-built string!). Backpressure and piping are handled by Fastify's stream
 * serialization; the response 'close' handler stops generation when the
 * client disappears (see README / "Streams and backpressure").
 */
export function registerExportRoute(app: FastifyInstance, store: ItemStore): void {
  app.get('/export.csv', async (request, reply) => {
    const source = store.iterateAll(requestCloseSignal(request))
    const stream = createItemCsvStream(source)

    // Destroy the generator as soon as the response socket closes without a
    // complete body, so no CPU cycles are spent on a nobody-listening stream.
    reply.raw.on('close', () => {
      if (!reply.raw.writableEnded && !stream.destroyed) {
        request.log.info({ requestId: request.id }, 'CSV export aborted: client disconnected')
        stream.destroy()
      }
    })

    return reply
      .status(200)
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', 'attachment; filename="items-export.csv"')
      .header('cache-control', 'no-store')
      .send(stream)
  })
}
