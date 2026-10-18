/**
 * Global authentication guard.
 *
 * Registered through `APP_GUARD` in `AuthModule`, which means **every** route requires a
 * valid access token unless it is explicitly annotated with `@Public()`.
 *
 * The guard has exactly one responsibility: turn the `Authorization: Bearer <jwt>` header into
 * a verified `AuthenticatedUser` on the request. It never reads the request body, so a client
 * cannot inject `userId`, `tenantId` or `role` through the payload.
 */
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { METADATA_KEYS } from '../../common/constants.js';
import { ERROR_CODES } from '../../common/interfaces/api-error.interface.js';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface.js';
import { TokenService } from '../token.service.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(METADATA_KEYS.IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = extractBearerToken(request.headers.authorization);

    if (!token) {
      throw new UnauthorizedException('A bearer access token is required', {
        errorCode: ERROR_CODES.UNAUTHENTICATED,
      });
    }

    // `TokenService.verify` throws the domain `UnauthenticatedError`, which the global filter
    // maps to a 401 with the UNAUTHENTICATED error code.
    request.user = await this.tokens.verify(token);
    return true;
  }
}

export function extractBearerToken(header: string | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  const [scheme, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer') return undefined;
  const token = rest.join(' ').trim();
  return token.length > 0 ? token : undefined;
}
