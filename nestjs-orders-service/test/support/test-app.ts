/**
 * Test-app bootstrap.
 *
 * `main.ts` is the production entry point and is not executed by Vitest, so the HTTP policy it
 * applies (global prefix, URI versioning, validation pipe) has to be reproduced here. It is
 * reproduced *from validated configuration* rather than hard-coded so the tests exercise the same
 * prefix and version the application actually serves.
 *
 * What is intentionally NOT reproduced: helmet, CORS and Swagger. They are deployment concerns,
 * they do not affect any assertion the suite makes, and mounting Swagger would slow every boot
 * down. The global guards, filter and interceptors *are* active, because they are registered by
 * `AppModule` itself (`APP_GUARD` / `APP_FILTER` / `APP_INTERCEPTOR`) — that is exactly what makes
 * these tests end-to-end: a request travels the same pipeline as in production.
 */
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { TokenService } from '../../src/auth/token.service.js';
import type { AuthenticatedUser } from '../../src/common/interfaces/authenticated-user.interface.js';

export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  // `rawBody: true` is required by `WebhookSignatureService`, which verifies the HMAC over the
  // exact bytes the provider sent (never over a re-serialised object).
  const app = moduleRef.createNestApplication<NestExpressApplication>({ rawBody: true });

  const config = app.get(ConfigService);
  app.set('trust proxy', config.getOrThrow<boolean>('http.trustProxy'));
  app.setGlobalPrefix(config.getOrThrow<string>('api.globalPrefix'));
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: config.getOrThrow<string>('api.defaultVersion'),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      errorFormat: 'list',
    }),
  );

  await app.init();
  return app;
}

/**
 * Mint a real access token through the application's own `TokenService`.
 *
 * This is not a shortcut around authentication: the value produced is byte-for-byte what
 * `POST /auth/login` returns for the same principal, and it is verified by the real
 * `JwtAuthGuard` on the way in. Using it keeps RBAC tests independent of the login endpoint (and
 * of its deliberately tight rate limit), which `auth.e2e-spec.ts` covers over HTTP instead.
 */
export function issueAccessToken(app: NestExpressApplication, principal: AuthenticatedUser): string {
  return app.get(TokenService).issue(principal).token;
}

/** Convenience: the `Authorization` header for a minted token. */
export function bearer(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
