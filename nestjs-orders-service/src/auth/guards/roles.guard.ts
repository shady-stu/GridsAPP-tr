/**
 * Global role-based authorization guard.
 *
 * Runs after `JwtAuthGuard`, so `request.user` is guaranteed to be a verified principal by the
 * time a role check happens. Routes without `@Roles(...)` are open to any authenticated role;
 * routes with it are restricted to the listed roles.
 */
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { METADATA_KEYS } from '../../common/constants.js';
import { ERROR_CODES } from '../../common/interfaces/api-error.interface.js';
import type { AuthenticatedUser, UserRole } from '../../common/interfaces/authenticated-user.interface.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      METADATA_KEYS.REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      // Should be unreachable: JwtAuthGuard runs first and rejects unauthenticated requests.
      throw new ForbiddenException('Authentication is required for this action', {
        errorCode: ERROR_CODES.FORBIDDEN,
      });
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: ${requiredRoles.join(', ')}`,
        { errorCode: ERROR_CODES.FORBIDDEN },
      );
    }

    return true;
  }
}
