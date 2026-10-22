/**
 * Process entrypoint. Responsibilities here (and nowhere else):
 * - load + validate configuration (structured failure output on bad env),
 * - build the application, start listening,
 * - install signal handlers, run the controlled shutdown on SIGTERM/SIGINT,
 * - install last-resort handlers for programmer errors.
 */
import { buildApp } from './app.js'
import { ConfigValidationError, loadConfig } from './config/env.js'
import { describeError } from './errors/app-errors.js'
import { createShutdownController } from './runtime/shutdown.js'

/** Structured error for pre-logger configuration failures (no secrets here). */
function exitOnInvalidConfig(error: unknown): never {
  // console.error is the only correct channel here: the logger cannot exist
  // before configuration validates.
  if (error instanceof ConfigValidationError) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        code: 'CONFIG_INVALID',
        message: 'Invalid environment configuration',
        issues: error.issues,
      }),
    )
  } else {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ code: 'CONFIG_INVALID', message: describeError(error) }))
  }
  process.exit(1)
}

export async function main(): Promise<void> {
  let config
  try {
    config = loadConfig()
  } catch (error: unknown) {
    exitOnInvalidConfig(error)
  }

  let app
  try {
    app = await buildApp(config)
  } catch (error: unknown) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ code: 'BOOT_FAILED', message: describeError(error) }))
    process.exit(1)
  }

  const shutdown = createShutdownController({
    app,
    log: app.log,
    graceMs: config.shutdownGraceMs,
  })

  // POSIX signals; note on Windows SIGTERM/SIGINT are only partially
  // deliverable (Ctrl+C works for SIGINT), see README "Graceful shutdown".
  const onSignal = (signal: string): void => {
    void shutdown.request(signal)
  }
  process.on('SIGTERM', () => onSignal('SIGTERM'))
  process.on('SIGINT', () => onSignal('SIGINT'))

  // Safety net: never let the process die silently or with a confusing trace.
  process.on('unhandledRejection', (reason: unknown) => {
    app.log.error({ err: reason }, 'Unhandled promise rejection; starting shutdown')
    void shutdown.request('unhandledRejection')
  })
  process.on('uncaughtException', (error: unknown) => {
    app.log.fatal({ err: error }, 'Uncaught exception; starting shutdown')
    void shutdown.request('uncaughtException')
  })

  try {
    await app.listen({ port: config.port, host: config.host })
  } catch (error: unknown) {
    app.log.fatal({ err: error }, 'Failed to start listening (port in use?)')
    process.exit(1)
  }

  app.log.info(
    {
      port: config.port,
      host: config.host,
      env: config.nodeEnv,
      upstreamBaseUrl: config.upstream.baseUrl,
      demoBlock: config.enableDemoBlock,
    },
    'Node Integration Service is ready',
  )
}

void main()
