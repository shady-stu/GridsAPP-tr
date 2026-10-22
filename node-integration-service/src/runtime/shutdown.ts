import type { FastifyInstance } from 'fastify'

import type { Logger } from 'pino'

/**
 * Controlled shutdown sequence, isolated from app construction so tests can
 * drive it directly (without depending on OS signals, which are not portable
 * on Windows).
 *
 * Sequence for each `request(signal)`:
 * 1. Guard against double shutdown (two signals / second signal later).
 * 2. Arm a bounded hard-exit fallback timer — if `app.close()` hangs beyond
 *    the grace period the process force-exits with code 1.
 * 3. `app.close()`: Fastify stops accepting requests and awaits in-flight
 *    handlers within the grace period.
 * 4. Call `server.closeAllConnections()` to tear down lingering keep-alive
 *    sockets so Node's process can actually exit.
 * 5. Close additional owned resources (none by default; upstream fetch calls
 *    release their own AbortController timers in `finally`).
 * 6. Exit with code 0, or 1 if any step failed.
 */
export interface ShutdownController {
  /** Starts the shutdown sequence exactly once; later calls are no-ops. */
  readonly request: (signal: string) => Promise<void>
  /** Resolves with the final exit code once the sequence finishes. */
  readonly finish: Promise<number>
  readonly shuttingDown: boolean
}

export interface ShutdownOptions {
  readonly app: FastifyInstance
  readonly log: Pick<Logger, 'info' | 'warn' | 'error'>
  readonly graceMs: number
  /** Injectable for tests; defaults to process.exit. */
  readonly exit?: (code: number) => void
  /** Resources owned by the app (none today — placeholder for such as a DB pool). */
  readonly disposables?: ReadonlyArray<{ name: string; close: () => Promise<void> }>
}

export function createShutdownController(options: ShutdownOptions): ShutdownController {
  const { app, log, graceMs, disposables } = options
  const exit = options.exit ?? ((code: number) => process.exit(code))

  let requested = false
  let finishResolve: (code: number) => void
  const finish = new Promise<number>((resolve) => {
    finishResolve = resolve
  })

  const complete = (code: number): void => {
    finishResolve(code)
    exit(code)
  }

  async function runShutdown(signal: string): Promise<void> {
    log.warn({ signal }, 'Shutdown requested')
    // Bounded fallback: even if close() deadlocks, exit within the grace period.
    const hardExitTimer = setTimeout(() => {
      log.error('Graceful shutdown grace period expired; forcing exit')
      complete(1)
    }, graceMs)

    try {
      // Stop intake immediately; Fastify's close waits for in-flight requests.
      const server = app.server
      if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections()
      await app.close()
      // Keep-alive sockets could otherwise keep the process alive until their
      // own timeout; after close() nothing legitimate is using them.
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
      for (const resource of disposables ?? []) {
        await resource.close()
      }
      log.info('Graceful shutdown finished')
      complete(0)
    } catch (error: unknown) {
      log.error({ err: error }, 'Graceful shutdown failed')
      complete(1)
    } finally {
      clearTimeout(hardExitTimer)
    }
  }

  function request(signal: string): Promise<void> {
    if (!requested) {
      requested = true
      void runShutdown(signal).catch((error: unknown) => {
        // runShutdown never throws (its body catches), this is a last resort.
        log.error({ err: error }, 'Unexpected shutdown runner failure')
        finishResolve(1)
      })
    }
    return finish.then(() => undefined)
  }

  return {
    request,
    finish,
    get shuttingDown() {
      return requested
    },
  }
}
