/**
 * Authentication module.
 *
 * Two guards are registered globally here (through `APP_GUARD`), which is what makes
 * authentication *opt-out* rather than opt-in:
 *
 *  1. `JwtAuthGuard`  — every route needs a valid access token unless it is `@Public()`.
 *  2. `RolesGuard`    — routes annotated with `@Roles(...)` additionally require that role.
 *
 * Registration order is significant: Nest runs APP_GUARD providers in the order they are
 * declared, so authentication always precedes authorization.
 */
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PasswordService } from './password.service.js';
import { PrismaUserRepository } from './repositories/prisma-user.repository.js';
import { USER_REPOSITORY } from './repositories/user.repository.js';
import { TokenService } from './token.service.js';

@Module({
  imports: [
    // The module is configured asynchronously so the secret comes from validated config
    // (`env.validation.ts` guarantees it is at least 32 characters long).
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('auth.jwtSecret'),
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.getOrThrow<number>('auth.accessTokenTtlSeconds'),
          issuer: config.getOrThrow<string>('auth.issuer'),
          audience: config.getOrThrow<string>('auth.audience'),
        },
        verifyOptions: {
          // Pinning the algorithm blocks the classic `alg: none` / HS/RS confusion attacks.
          algorithms: ['HS256'],
          issuer: config.getOrThrow<string>('auth.issuer'),
          audience: config.getOrThrow<string>('auth.audience'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, PasswordService, TokenService],
})
export class AuthModule {}
