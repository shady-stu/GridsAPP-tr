/**
 * Health module.
 *
 * `TerminusModule` supplies `HealthCheckService` and `PrismaHealthIndicator`. It is imported
 * without `forRoot()`: the root registration is only needed for the graceful-shutdown options,
 * and shutdown is already handled by `app.enableShutdownHooks()` in `main.ts`.
 */
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
