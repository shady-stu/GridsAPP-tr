/**
 * The single Prisma client instance owned by the application.
 *
 * Why the client is wrapped in a Nest provider instead of being imported directly wherever it
 * is needed:
 *
 *  * **One connection pool.** Every repository shares this instance, so the pool is bounded by
 *    `DATABASE_POOL_MAX` rather than by the number of modules that happen to import Prisma.
 *  * **Lifecycle.** Nest calls `onModuleInit`/`onModuleDestroy`, so connections are opened once
 *    at boot and closed on graceful shutdown (`main.ts` enables shutdown hooks).
 *  * **Testability.** Tests can override this provider with a client pointed at the test
 *    database without touching any repository code.
 *
 * Prisma 7 note: the datasource URL is **not** read from `schema.prisma`. It is supplied at
 * runtime through the `@prisma/adapter-pg` driver adapter, which also lets us configure the
 * underlying `pg` pool (size, connect timeout) — something the built-in engine cannot express.
 */
import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { TypedConfigService } from '../config/configuration.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private connected = false;

  constructor(config: TypedConfigService) {
    const adapter = new PrismaPg({
      connectionString: config.get('database.url', { infer: true }),
      max: config.get('database.poolMax', { infer: true }),
      connectionTimeoutMillis: config.get('database.connectTimeoutMs', { infer: true }),
    });

    // Logs are deliberately not enabled here: query logging would print parameter values
    // (including password hashes and webhook payloads) into the application log.
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    // Fail fast: if the database is unreachable the process should crash at boot rather than
    // serve 500s until an operator notices.
    await this.$connect();
    this.connected = true;
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connected) return;
    await this.$disconnect();
    this.connected = false;
    this.logger.log('Database connection closed');
  }

  /** Cheap round-trip used by the readiness probe. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
