/**
 * Application root module.
 *
 * Composition, in order:
 *  * `ConfigModule` — loads `.env`, validates it with a **Zod schema** (NestJS 12 supports
 *    Standard Schema validators directly through `validationSchema`) and exposes the typed
 *    configuration tree produced by `configuration.ts`.
 *  * `ThrottlerModule` — a global rate limiter, configured from the same validated config.
 *  * Feature modules — database, auth, customers, orders, webhooks, health.
 *
 * Cross-cutting concerns are registered here rather than in feature modules:
 *  * `AllExceptionsFilter`   — one error envelope for the whole application.
 *  * `RequestLoggingInterceptor` — one structured log line per request.
 *  * `ThrottlerGuard`        — rate limiting for every route.
 *  * `RequestContextMiddleware` — per-request correlation id.
 *
 * `JwtAuthGuard` and `RolesGuard` are registered inside `AuthModule`, together with the module
 * that owns the token service they depend on.
 */
import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RequestContextService } from './common/context/request-context.service.js';
import { RequestLoggingInterceptor } from './common/interceptors/request-logging.interceptor.js';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware.js';
import buildConfig from './config/configuration.js';
import { envSchema } from './config/env.validation.js';
import { CustomersModule } from './customers/customers.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // `.env` for local development. In production the variables are injected by the platform;
      // a missing file is not an error, a missing *variable* is.
      envFilePath: ['.env'],
      validationSchema: envSchema,
      load: [buildConfig],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          // `ttl` is in milliseconds in @nestjs/throttler v5+.
          ttl: config.getOrThrow<number>('http.rateLimitTtlSeconds') * 1_000,
          limit: config.getOrThrow<number>('http.rateLimitLimit'),
        },
      ],
    }),
    DatabaseModule,
    AuthModule,
    CustomersModule,
    OrdersModule,
    WebhooksModule,
    HealthModule,
  ],
  providers: [
    RequestContextService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestLoggingInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // `forRoutes('*')` (Express 5 path-to-regexp v8 syntax) applies the middleware to every
    // route, including 404s, so even unmatched requests get a correlation id and a log line.
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
