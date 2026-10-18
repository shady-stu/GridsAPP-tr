/**
 * Injects the authenticated principal (or one of its properties) into a handler parameter.
 *
 * Because the value originates from the verified access token, it is safe for services to use
 * it for tenant scoping and ownership decisions. A request body can never influence it.
 */
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

export const CurrentUser = createParamDecorator(
  (property: keyof AuthenticatedUser | undefined, context: ExecutionContext): unknown => {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const user = request.user;
    if (!user) return undefined;
    return property ? user[property] : user;
  },
);
