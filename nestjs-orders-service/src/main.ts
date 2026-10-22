/**
 * Application bootstrap.
 *
 * Order matters here and is deliberate:
 *   1. Build and validate the configuration *before* Nest starts, so a bad environment fails
 *      with a readable message instead of booting a half-configured process.
 *   2. Create the application with `rawBody: true` — webhook signatures are computed over the
 *      exact request bytes, so the raw buffer must be captured before the body parser runs.
 *   3. Apply global HTTP policy (prefix, versioning, CORS, security headers, validation).
 *   4. Only then expose Swagger (which is disabled in production by default).
 */
import { ConsoleLogger, Logger, ValidationPipe, VersioningType, type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { REQUEST_ID_HEADER, WEBHOOK_SIGNATURE_HEADER } from './common/constants.js';
import { buildConfig, type AppConfig } from './config/configuration.js';

const SWAGGER_PATH = 'docs';

async function bootstrap(): Promise<void> {
  const config = buildConfig(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Webhook HMAC verification needs the untouched request body (see WebhookSignatureService).
    rawBody: true,
    // Hold logs until our own logger is installed, so nothing is printed in the default format.
    bufferLogs: true,
  });

  app.useLogger(buildLogger(config));

  // Behind a load balancer, honour `X-Forwarded-*` only when the deployment says so.
  app.set('trust proxy', config.http.trustProxy);

  // Conservative security headers. The API returns JSON only, so the CSP can be maximally
  // restrictive; `contentSecurityPolicy` is relaxed slightly for the `/docs` Swagger UI.
  app.use(
    helmet({
      contentSecurityPolicy: config.swagger.enabled
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
            },
          }
        : undefined,
    }),
  );

  app.enableCors({
    // An empty allow-list means "no cross-origin browser access", not "allow everything".
    origin: config.http.corsOrigins.length > 0 ? config.http.corsOrigins : false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', REQUEST_ID_HEADER, WEBHOOK_SIGNATURE_HEADER],
    exposedHeaders: [REQUEST_ID_HEADER],
    maxAge: 600,
  });

  app.setGlobalPrefix(config.api.globalPrefix);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: config.api.defaultVersion,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      // Strip unknown properties: services map fields explicitly, but this is defence in depth
      // against a future handler that spreads a DTO into a repository call.
      whitelist: true,
      // Unknown properties are dropped silently rather than rejected, so a client sending an
      // extra field is not broken by a server-side schema change.
      forbidNonWhitelisted: false,
      transform: true,
      // Coerce `"1"` -> `1` for query parameters; implicit conversion from the declared type
      // would defeat `@IsInt()` on a query string, so it is left off and `@Type()` is used.
      transformOptions: { enableImplicitConversion: false },
      // Flat list of messages, which `AllExceptionsFilter` turns into `details[]`.
      errorFormat: 'list',
    }),
  );

  if (config.swagger.enabled) {
    registerSwagger(app);
  }

  // Lets Nest run `onApplicationShutdown` hooks (closing the DB pool, stopping the webhook
  // poller) when the process receives SIGTERM/SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.port);

  const baseUrl = `http://localhost:${config.port}`;
  Logger.log(
    `Orders Service listening on ${baseUrl}/${config.api.globalPrefix}/v${config.api.defaultVersion}`,
    'Bootstrap',
  );
  if (config.swagger.enabled) {
    Logger.log(`OpenAPI docs available at ${baseUrl}/${SWAGGER_PATH}`, 'Bootstrap');
  }
  if (config.logging.json) {
    Logger.log('Structured JSON logging is enabled', 'Bootstrap');
  }
}

/** Maps the validated `LOG_LEVEL` onto Nest's log-level list. */
function buildLogger(config: AppConfig): ConsoleLogger {
  const levelsByVerbosity: Record<AppConfig['logging']['level'], LogLevel[]> = {
    debug: ['debug', 'verbose', 'log', 'warn', 'error', 'fatal'],
    log: ['log', 'warn', 'error', 'fatal'],
    warn: ['warn', 'error', 'fatal'],
    error: ['error', 'fatal'],
  };

  return new ConsoleLogger({
    logLevels: levelsByVerbosity[config.logging.level],
    json: config.logging.json,
    colors: !config.logging.json,
    compact: config.logging.json,
  });
}

function registerSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Grids Orders Service')
      .setDescription(
        'Orders, customers, authentication and payment-webhook ingestion.\n\n' +
          'All authenticated endpoints expect `Authorization: Bearer <accessToken>` from ' +
          '`POST /api/v1/auth/login`. Tenant scope always comes from the token, never from the ' +
          'request body or query string.',
      )
      .setVersion('1.0.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        // Must match the name used by `@ApiBearerAuth('bearer')`.
        'bearer',
      )
      .addTag('auth', 'Authentication and caller profile')
      .addTag('customers', 'Customer records (tenant-scoped)')
      .addTag('orders', 'Order lifecycle and status transitions')
      .addTag('webhooks', 'Payment provider webhook ingestion and inbox operations')
      .addTag('health', 'Liveness and readiness probes')
      .build(),
  );

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    customSiteTitle: 'Grids Orders Service API',
    swaggerOptions: {
      // Keeps the pasted bearer token across page reloads while exploring the API.
      persistAuthorization: true,
      displayRequestDuration: true,
      // Sorted by tag keeps the four feature areas easy to scan.
      tagsSorter: 'alpha',
    },
  });
}

await bootstrap();
