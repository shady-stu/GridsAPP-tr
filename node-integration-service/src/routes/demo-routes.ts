import { z } from 'zod'
import type { FastifyInstance } from 'fastify'

import { parseOrThrow } from '../schemas/item-schemas.js'

const DemoBlockQuerySchema = z.object({
  ms: z.coerce.number().int('must be an integer').min(0).max(2000).default(500),
})

/**
 * Pure synchronous CPU work running directly on the event loop. While this
 * loop spins, NO other request, timer, I/O callback or socket event is served.
 */
function busyBlock(durationMs: number): number {
  const started = performance.now()
  const deadline = started + durationMs
  while (performance.now() < deadline) {
    // deliberately busy
  }
  return Math.round(performance.now() - started)
}

/**
 * Deliberate event-loop blocking demo — only registered when
 * `ENABLE_DEMO_BLOCK=true`. See `scripts/event-loop-demo.ts` and the README
 * section "Event loop: I/O-bound vs CPU-bound work".
 */
export function registerDemoRoutes(app: FastifyInstance): void {
  app.get('/demo/sync-block', async (request, reply) => {
    const { ms } = parseOrThrow(DemoBlockQuerySchema, request.query, 'query')
    const tookMs = busyBlock(ms)
    request.log.warn(
      { requestId: request.id, blockedMs: ms, tookMs },
      'Event loop blocked on purpose (demo route)',
    )
    return reply.status(200).send({
      blockedMs: ms,
      tookMs,
      note: 'This request blocked the single Node.js event loop for its full duration.',
    })
  })
}
