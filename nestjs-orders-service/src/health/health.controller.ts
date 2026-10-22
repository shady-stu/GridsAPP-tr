/**
 * Liveness and readiness probes.
 *
 * The distinction matters for orchestration:
 *
 *  * **`/api/health/live`** answers "is this process wedged?". It deliberately checks *nothing*
 *    external: if PostgreSQL is down the process is still alive, and restarting it would not
 *    help (and would take the API down for no reason).
 *  * **`/api/health/ready`** answers "should traffic be routed here?". It pings the database with
 *    a timeout and returns `503` when the dependency is unusable, so a load balancer can take the
 *    instance out of rotation.
 *
 * Both endpoints are `@Public()` (probes cannot carry a JWT) and `@SkipThrottle()` (a limiter
 * must never be able to make an instance look unhealthy).
 *
 * They are also `VERSION_NEUTRAL`, so a probe URL does not have to be updated when the API
 * version changes: `/api/health/ready` rather than `/api/v1/health/ready`.
 */
import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import type { TypedConfigService } from '../config/configuration.js';
import { PrismaService } from '../database/prisma.service.js';

@ApiTags('health')
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
    private readonly config: TypedConfigService,
  ) {}

  @Get('live')
  @Public()
  @SkipThrottle()
  @HealthCheck()
  @ApiOperation({
    summary: 'Liveness probe',
    description: 'Always `200` while the process can serve requests. Checks no dependencies.',
  })
  @ApiOkResponse({ description: 'The process is running.' })
  live() {
    // An empty indicator list is intentional: see the module comment.
    return this.health.check([]);
  }

  @Get('ready')
  @Public()
  @SkipThrottle()
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Pings PostgreSQL with a timeout. Returns `200` when the dependency is usable and `503` ' +
      'otherwise, so unhealthy instances can be removed from rotation.',
  })
  @ApiOkResponse({ description: 'All dependencies are usable.' })
  @ApiServiceUnavailableResponse({ description: 'At least one dependency is unusable.' })
  async ready(@Res({ passthrough: true }) response: Response) {
    const timeoutMs = this.config.get('health.readinessTimeoutMs', { infer: true });

    // `pingCheck` runs `SELECT 1` through the adapter and is wrapped in Terminus' attempt
    // builder, so a database outage is reported as `down` with a timeout rather than throwing a
    // 500 out of the probe.
    const result = await this.health.check([
      this.database.pingCheck('database', this.prisma).withTimeout(timeoutMs),
    ]);

    response.status(result.status === 'error' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK);
    return result;
  }
}
