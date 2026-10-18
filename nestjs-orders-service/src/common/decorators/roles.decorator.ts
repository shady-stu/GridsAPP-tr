/**
 * Declares which roles may call a handler.
 *
 * Enforcement happens in `RolesGuard`, not in the decorator, and the check runs *after*
 * authentication so that "who are you" and "may you" stay separate concerns.
 * `@Roles('ADMIN')` also feeds the OpenAPI description of the endpoint.
 */
import { SetMetadata } from '@nestjs/common';
import { METADATA_KEYS } from '../constants.js';
import type { UserRole } from '../interfaces/authenticated-user.interface.js';

export const Roles = (...roles: UserRole[]): MethodDecorator & ClassDecorator =>
  SetMetadata(METADATA_KEYS.REQUIRED_ROLES, roles);
