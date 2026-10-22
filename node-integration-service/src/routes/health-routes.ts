import type { FastifyInstance } from 'fastify'

import type { ReadinessService } from '../services/readiness-service.js'

export interface HealthRouteOptions {
  readonly readiness: ReadinessService
  readonly envName: string
}

/**
 * Liveness (`/health`) answers whether the process itself is alive — it never
 * performs I/O.
 * Readiness (`/ready`) reports bounded dependency checks (see readiness-service).
 */
export function registerHealthRoutes(app: FastifyInstance, options: HealthRouteOptions): void {
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      env: options.envName,
      uptimeSeconds: Math.round(process.uptime()),
    })
  })

  app.get('/ready', async (_request, reply) => {
    const report = await options.readiness.check()
    const failing = report.checks.some((check) => check.status === 'failing')
    // 503 only when a check is strictly failing; 'degraded' still answers 200
    // with an honest 'degraded' status so load balancers keep sane traffic.
    return reply.status(failing ? 503 : 200).send({
      status: failing ? 'failing' : report.status,
      checks: report.checks,
    })
  })
}
